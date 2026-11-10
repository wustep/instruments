// End-to-end checks in real Chrome: the page, the AudioWorklet, offline rendering
// through the worklet with spectral checks, the live views, MIDI input, phone layout.
import { test, expect, type Page } from '@playwright/test';
import { analyzePartials } from '../packages/engine/src/analysis/index.ts';
import { smf } from '../apps/web/test/smf.ts';

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};

async function startAudio(page: Page) {
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
}

test('page loads with the keyboard and no errors', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  // no wordmark on the page; the name lives in the tab title
  await expect(page.locator('.inlay')).toHaveCount(0);
  await expect(page).toHaveTitle('instruments');
  await expect(page.locator('.instruments .pick')).toHaveCount(6);
  await expect(page.locator('.keyboard .key')).toHaveCount(88);
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('the AudioWorklet runs and a note sounds at the right pitch', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  const r = await page.evaluate(async () => {
    const a = (window as any).__piano;
    a.noteOn(69, 100, 'keys');
    await new Promise((res) => setTimeout(res, 500));
    const d = new Float32Array(a.analyser.frequencyBinCount);
    a.analyser.getFloatFrequencyData(d);
    const binHz = a.ctx.sampleRate / a.analyser.fftSize;
    // strongest bin near A4
    let best = -Infinity;
    let at = 0;
    for (let i = Math.floor(400 / binHz); i < Math.ceil(480 / binHz); i++) if (d[i] > best) { best = d[i]; at = i; }
    a.noteOff(69, 'keys');
    return { db: best, hz: at * binHz, stats: a.lastStats, lat: a.latencyMs };
  });
  expect(r.db).toBeGreaterThan(-70);
  expect(Math.abs(r.hz - 440)).toBeLessThan(6); // analyser resolution ~5.9 Hz
  expect(r.stats.voices).toBeGreaterThanOrEqual(1);
  expect(r.stats.load).toBeGreaterThanOrEqual(0); // 1 ms clock in the worklet scope
  expect(r.stats.load).toBeLessThan(0.7);
  test.info().annotations.push({ type: 'latency', description: JSON.stringify(r.lat) });
  expect(errors).toEqual([]);
});

test('offline render through the real worklet: pitch, inharmonicity and partials', async ({ page }) => {
  await page.goto('/');
  for (const midi of [33, 60, 84]) {
    const out = await page.evaluate(async (m) => {
      const { renderOffline } = (window as any).__engine;
      const buf: AudioBuffer = await renderOffline({ sampleRate: 48000, duration: 2.2, params: { room: 0, unisonDetune: 0 }, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: 100 } }] });
      const x = buf.getChannelData(0);
      let peak = 0;
      let bad = 0;
      for (let i = 0; i < x.length; i++) {
        if (!Number.isFinite(x[i])) bad++;
        peak = Math.max(peak, Math.abs(x[i]));
      }
      return { x: Array.from(x), peak, bad };
    }, midi);
    expect(out.bad).toBe(0);
    expect(out.peak).toBeGreaterThan(0.01);
    expect(out.peak).toBeLessThanOrEqual(1);
    const target = await page.evaluate(async (m) => {
      // the instrument's own per-key summary (stretched tuning and B)
      const a = (window as any).__piano;
      if (!a.piano) await a.start();
      await a.piano.ready; // the engine is up before it has reported its keys
      return a.piano.keys.find((k: any) => k.midi === m);
    }, midi);
    const pa = analyzePartials(Float32Array.from(out.x), 48000, target.f1, { Bguess: target.B, startSec: 0.1, lenSec: 1.6 });
    expect(pa.partials.length, `m${midi}`).toBeGreaterThanOrEqual(midi < 80 ? 6 : 2);
    expect(Math.abs(1200 * Math.log2(pa.f1 / target.f1)), `m${midi} f1`).toBeLessThan(2.5);
    if (midi < 80) expect(Math.abs(Math.log(pa.B / target.B)), `m${midi} B`).toBeLessThan(Math.log(1.25));
  }
});

test('the stage: live strings, soundboard, hammer scope and spectrum draw', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  const errors = collectErrors(page);
  await page.goto('/#/inside');
  await startAudio(page);
  await page.evaluate(async () => {
    const a = (window as any).__piano;
    a.sustain(1);
    for (const m of [36, 48, 60, 64, 67]) {
      a.noteOn(m, 100, 'keys');
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  await page.waitForTimeout(900);
  const painted = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.stage canvas')).filter((c) => (c as HTMLElement).checkVisibility()).map((c) => {
      const cv = c as HTMLCanvasElement;
      const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    }),
  );
  expect(painted.length).toBe(phone ? 2 : 3); // instrument, spectrum, excitation scope (not on phones)
  for (const n of painted) expect(n).toBeGreaterThan(500);
  await expect(page.locator('.r-hz')).toContainText('Hz');
  if (!phone) await expect(page.locator('.scope-cap')).toContainText('m/s');
  // a physical control (knob) reaches the worklet; on phones the knobs fold out first
  if (phone) await page.getByRole('button', { name: 'Show the knobs' }).click();
  const slider = page.getByRole('slider', { name: 'Soundboard damping' });
  await slider.fill('0.9');
  await page.waitForTimeout(200);
  const p = await page.evaluate(() => (window as any).__piano.piano.params.soundboardDamping);
  expect(p).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});

test('measurements: charts render and the A/B model renders in the browser', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/#/measurements');
  await expect(page.locator('figure svg').first()).toBeVisible({ timeout: 15_000 });
  expect(await page.locator('figure svg').count()).toBeGreaterThanOrEqual(10);
  await expect(page.getByText('Where it falls short')).toBeVisible();
  // round 2: strings and flute compared with their own recordings
  await expect(page.getByRole('heading', { name: 'Strings and flute against recordings' })).toBeVisible({ timeout: 15_000 });
  expect(await page.locator('.ensemble figure svg').count()).toBeGreaterThanOrEqual(8);
  const btn = page.locator('.ab-item').filter({ hasText: 'C#4' }).getByRole('button', { name: 'model' });
  await btn.click();
  await expect(btn).toHaveClass(/playing/, { timeout: 20_000 });
  const ref = await page.request.get('/ref/iowa-steinway-b-mf-Db4.mp3');
  expect(ref.ok()).toBe(true);
  expect(errors).toEqual([]);
});

test('Web MIDI: hot-plug, notes, continuous sustain (CC64), sostenuto (CC66) and soft pedal (CC67)', async ({ page }) => {
  // a fake MIDI device that is plugged in after the page has started listening
  await page.addInitScript(() => {
    const inputs = new Map<string, any>();
    const access: any = { inputs, outputs: new Map(), onstatechange: null, sysexEnabled: false };
    (navigator as any).requestMIDIAccess = async () => access;
    (window as any).__midi = {
      plug() {
        const input = { id: 'fake', name: 'Test Keys', state: 'connected', onmidimessage: null as any };
        inputs.set('fake', input);
        access.onstatechange?.({ port: input });
      },
      send(bytes: number[]) {
        inputs.get('fake').onmidimessage?.({ data: new Uint8Array(bytes) });
      },
      unplug() {
        const input = inputs.get('fake');
        input.state = 'disconnected';
        inputs.delete('fake');
        access.onstatechange?.({ port: input });
      },
    };
  });
  await page.goto('/');
  await expect(page.locator('.status')).toHaveAttribute('data-midi', 'no MIDI device');
  await page.evaluate(() => (window as any).__midi.plug());
  await expect(page.locator('.status')).toHaveAttribute('data-midi', 'MIDI: Test Keys');
  await expect(page.locator('.status .midi')).toHaveText('midi');
  await startAudio(page);
  await page.evaluate(() => {
    const m = (window as any).__midi;
    m.send([0xb0, 64, 64]); // half pedal
    m.send([0xb0, 67, 127]); // una corda
    m.send([0xb0, 66, 127]); // sostenuto
    m.send([0x90, 60, 90]);
  });
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => (window as any).__piano.lastStats);
  expect(st.sustain).toBeCloseTo(64 / 127, 2);
  expect(st.soft).toBeCloseTo(1, 2);
  expect(st.middle).toBeCloseTo(1, 2);
  await page.evaluate(() => (window as any).__midi.send([0xb0, 66, 0]));
  expect(st.voices).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.key[data-midi="60"]')).toHaveClass(/down/);
  await page.evaluate(() => (window as any).__midi.send([0x80, 60, 0]));
  await expect(page.locator('.key[data-midi="60"]')).not.toHaveClass(/down/);
  // strings: pitch bend, mod wheel (bow pressure), aftertouch (vibrato) reach the instrument
  await page.evaluate(async () => {
    await (window as any).__piano.setInstrument('violin');
    const m = (window as any).__midi;
    m.send([0x90, 69, 100]);
    m.send([0xe0, 0x00, 0x60]); // bend up
    m.send([0xb0, 1, 120]); // mod wheel: press the bow
    m.send([0xd0, 90]); // aftertouch: vibrato
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__piano.piano.params.vibrato)).toBeGreaterThan(20);
  await page.evaluate(async () => {
    const m = (window as any).__midi;
    m.send([0x80, 69, 0]);
    m.send([0xe0, 0x00, 0x40]); // centre
    await (window as any).__piano.setInstrument('piano');
  });
  await expect(page.locator('.status .midi')).toHaveAttribute('title', 'MIDI: Test Keys');
  // unplugging a device mid-note releases what it held (it can no longer send note-offs)
  await page.evaluate(() => (window as any).__midi.send([0x90, 64, 90]));
  await expect(page.locator('.key[data-midi="64"]')).toHaveClass(/down/);
  await page.evaluate(() => (window as any).__midi.unplug());
  await expect(page.locator('.key[data-midi="64"]')).not.toHaveClass(/down/);
  await expect(page.locator('.status .midi')).toBeHidden();
});

test('without Web MIDI (Safari) the page works and shows no MIDI indicator', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    delete (Navigator.prototype as any).requestMIDIAccess;
  });
  await page.goto('/');
  await expect(page.locator('.status')).toHaveAttribute('data-midi', 'no Web MIDI');
  await expect(page.locator('.status .midi')).toBeHidden();
  await startAudio(page);
  expect(errors).toEqual([]);
});

test('layout fits the viewport (no horizontal page scroll) and keys respond to touch/click', async ({ page }, info) => {
  await page.goto('/');
  for (const route of ['#/', '#/play', '#/measurements', '#/notes']) {
    await page.goto(`/${route}`);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, route).toBeLessThanOrEqual(1);
  }
  // a phone held sideways (844×390): one slim band, the stage takes the rest, the page does not scroll
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await page.waitForTimeout(500);
  const land = await page.evaluate(() => ({
    overX: document.documentElement.scrollWidth - window.innerWidth,
    overY: document.documentElement.scrollHeight - window.innerHeight,
    stage: document.querySelector('.stage')!.getBoundingClientRect().height,
    band: document.querySelector('.stage-top')!.getBoundingClientRect().height,
    keysBottom: document.querySelector('.keyboard')!.getBoundingClientRect().bottom,
    knobs: getComputedStyle(document.querySelector('.knobs')!).display,
    toggle: getComputedStyle(document.querySelector('.knob-toggle')!).display,
  }));
  expect(land.overX, 'landscape: no horizontal scroll').toBeLessThanOrEqual(1);
  expect(land.overY, 'landscape: no vertical scroll').toBeLessThanOrEqual(1);
  expect(land.stage, 'landscape: the stage has the height').toBeGreaterThanOrEqual(200);
  expect(land.band, 'landscape: a slim band').toBeLessThanOrEqual(48);
  expect(land.keysBottom).toBeLessThanOrEqual(390);
  expect(land.knobs).toBe('none');
  expect(land.toggle).not.toBe('none');
  await page.locator('.knob-toggle').click();
  await expect(page.locator('.knobs')).toBeVisible();
  await page.locator('.knob-toggle').click();
  await page.setViewportSize(vp);
  await page.goto('/');
  const key = page.locator('.key[data-midi="60"]');
  await key.scrollIntoViewIfNeeded();
  const box = (await key.boundingBox())!;
  if (info.project.name === 'phone') await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.9);
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.9);
  await page.waitForFunction(() => (window as any).__piano?.piano, null, { timeout: 30_000 });
  await page.waitForTimeout(300);
  const notes = await page.evaluate(() => (window as any).__piano.lastStats?.voices ?? 0);
  expect(notes).toBeGreaterThanOrEqual(1);
});

test('the picker: the ring on the selected instrument is whole, on every instrument, upright and sideways', async ({ page }, info) => {
  const vp = page.viewportSize()!;
  // this project's viewport (desktop, or a phone held upright) and a phone held sideways
  for (const size of [vp, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await page.waitForTimeout(400);
    const picks = page.locator('.instruments .pick');
    await expect(picks).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const pick = picks.nth(i);
      await pick.click();
      await expect(pick).toHaveAttribute('aria-pressed', 'true');
      // the ring is the keyboard-focus ring: it shows once the keyboard has been used (playing does that)
      await page.keyboard.press('Shift');
      await pick.focus();
      const r = await pick.evaluate((el) => {
        const cs = getComputedStyle(el);
        const grow = parseFloat(cs.outlineOffset) + parseFloat(cs.outlineWidth);
        const b = el.getBoundingClientRect();
        const ring = { l: b.left - grow, t: b.top - grow, r: b.right + grow, b: b.bottom + grow };
        // what can cut it: the viewport and every ancestor that clips its overflow
        let clip = { l: 0, t: 0, r: window.innerWidth, b: window.innerHeight };
        const clippers: string[] = [];
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ps = getComputedStyle(p);
          if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue;
          const q = p.getBoundingClientRect();
          clippers.push(p.className || p.tagName);
          clip = { l: Math.max(clip.l, q.left), t: Math.max(clip.t, q.top), r: Math.min(clip.r, q.right), b: Math.min(clip.b, q.bottom) };
        }
        // and nothing else lies over its top edge (the header above the stage)
        const over = document.elementFromPoint((b.left + b.right) / 2, Math.max(0, ring.t + 0.5));
        return { ring, clip, clippers, visible: el.matches(':focus-visible'), style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), own: over === el || el.contains(over) || !!over?.contains(el) };
      });
      const where = `${size.width}×${size.height} #${i}`;
      expect(r.visible, `${where}: ring shows`).toBe(true);
      expect(r.style, where).toBe('solid');
      expect(r.width, where).toBeGreaterThanOrEqual(1);
      expect(r.clippers.length, `${where}: the stage clips`).toBeGreaterThan(0);
      expect(r.ring.t, `${where}: top edge`).toBeGreaterThanOrEqual(r.clip.t);
      expect(r.ring.l, `${where}: left edge`).toBeGreaterThanOrEqual(r.clip.l);
      expect(r.ring.r, `${where}: right edge`).toBeLessThanOrEqual(r.clip.r);
      expect(r.ring.b, `${where}: bottom edge`).toBeLessThanOrEqual(r.clip.b);
      expect(r.own, `${where}: nothing over the ring's top edge`).toBe(true);
      if (i === 2) await page.screenshot({ path: info.outputPath(`picker-${size.width}x${size.height}-viola.png`), clip: { x: 0, y: 0, width: Math.min(size.width, 420), height: 110 } });
    }
  }
  await page.setViewportSize(vp);
});

test('all six instruments: selectable in the UI and rendered through the worklet at pitch', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  for (const [label, id] of [['Violin', 'violin'], ['Viola', 'viola'], ['Cello', 'cello'], ['Flute', 'flute'], ['Trumpet', 'trumpet'], ['Piano', 'piano']] as const) {
    await page.locator('.instruments').getByRole('button', { name: label }).click();
    await page.waitForFunction((x) => (window as any).__piano.piano?.instrument === x, id, { timeout: 15_000 });
    await expect(page.locator('.pick[aria-pressed="true"]')).toHaveAttribute('aria-label', label);
    await expect(page.locator('.knobs .knob').first()).toBeVisible({ visible: info.project.name !== 'phone' });
  }
  for (const [id, midi] of [['violin', 69], ['viola', 62], ['cello', 48], ['flute', 74], ['trumpet', 65]] as const) {
    const out = await page.evaluate(async ([inst, m]) => {
      const { renderOffline } = (window as any).__engine;
      const buf: AudioBuffer = await renderOffline({ instrument: inst, sampleRate: 48000, duration: 1.6, params: { room: 0, vibrato: 0 }, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: 90 } }] });
      const x = buf.getChannelData(0);
      // autocorrelation pitch over 0.9–1.4 s
      const fs = 48000, f = 440 * 2 ** ((m - 69) / 12), s0 = Math.round(0.9 * fs), W = Math.round(0.4 * fs);
      const ac = (lag: number) => { let s = 0; for (let i = 0; i < W; i++) s += x[s0 + i] * x[s0 + i + lag]; return s; };
      let best = -Infinity, bl = 0;
      for (let lag = Math.floor(fs / (f * 1.05)); lag <= Math.ceil(fs / (f * 0.95)); lag++) { const v = ac(lag); if (v > best) { best = v; bl = lag; } }
      const a = ac(bl - 1), b = ac(bl), c = ac(bl + 1);
      const fm = fs / (bl + (0.5 * (a - c)) / (a - 2 * b + c));
      let peak = 0;
      for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
      return { cents: 1200 * Math.log2(fm / f), peak };
    }, [id, midi] as const);
    expect(out.peak, id).toBeGreaterThan(0.02);
    expect(out.peak, id).toBeLessThanOrEqual(1);
    expect(Math.abs(out.cents), id).toBeLessThan(6);
  }
  expect(errors).toEqual([]);
});

test('a bowed string on the stage: the scope shows stick–slip and the bow', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'the scope is hidden on phones; the stage still draws the bow');
  await page.goto('/#/inside');
  await startAudio(page);
  await page.evaluate(async () => {
    await (window as any).__piano.setInstrument('violin');
    (window as any).__piano.noteOn(69, 90, 'keys');
  });
  await page.waitForTimeout(1200);
  // the scope caption names the bowed string, the bow's direction and the contact point along the hair
  const cap = page.locator('.scope-cap');
  await expect(cap).toContainText('A string');
  await expect(cap).toContainText(/down-bow|up-bow|bow change/);
  await expect(cap).toContainText('% from the frog');
  await page.evaluate(async () => (window as any).__piano.setInstrument('piano'));
});

test('start-up: a first click on a key sounds within 1.5 s; switching to the piano is quick', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page.locator('.status')).toContainText('tap a key to start');
  // let the page-load prefetch (designs, worklet) settle, as it would while a visitor looks
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const w = window as any;
    w.__t = { click: 0, sound: 0 };
    const buf = new Float32Array(2048);
    window.addEventListener('pointerdown', () => (w.__t.click ||= performance.now()), { capture: true });
    const tick = () => {
      const a = w.__piano;
      if (w.__t.click && a?.analyser) {
        a.analyser.getFloatTimeDomainData(buf);
        let m = 0;
        for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
        if (m > 1e-3) w.__t.sound = performance.now();
      }
      if (!w.__t.sound) setTimeout(tick, 4);
    };
    tick();
  });
  const key = page.locator('.key[data-midi="60"]');
  await key.scrollIntoViewIfNeeded();
  const box = (await key.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.85);
  await page.waitForFunction(() => (window as any).__t.sound > 0, null, { timeout: 10_000 });
  const t = await page.evaluate(() => {
    const w = window as any;
    return { firstSoundMs: w.__t.sound - w.__t.click, initMs: w.__piano.piano.initMs, startMs: w.__piano.startMs };
  });
  test.info().annotations.push({ type: 'startup', description: JSON.stringify(t) });
  expect(t.firstSoundMs).toBeLessThan(1500); // ~0.2 s on an M-series Mac; was ~0.5 s (7.8 s on a slow JS engine)
  expect(t.initMs).toBeLessThan(150); // worklet constructor: ~10 ms with shipped designs; was ~430 ms
  await expect(page.locator('.status')).toContainText('sound on');
  const switchMs = await page.evaluate(async () => {
    const a = (window as any).__piano;
    await a.setInstrument('cello');
    const t0 = performance.now();
    await a.setInstrument('piano');
    return performance.now() - t0;
  });
  expect(switchMs).toBeLessThan(400); // was ~1 s
  expect(errors).toEqual([]);
});

test('on-screen pedal: holding it sustains, releasing lets go', async ({ page }) => {
  await page.goto('/');
  await startAudio(page);
  const pedal = page.getByRole('button', { name: /Sustain pedal/ });
  const box = (await pedal.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => (window as any).__piano.lastStats?.sustain > 0.99, null, { timeout: 5000 });
  await expect(pedal).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.up();
  await page.waitForFunction(() => (window as any).__piano.lastStats?.sustain < 0.01, null, { timeout: 5000 });
});

// ---------------------------------------------------------------- start-up never hangs silently
const forceRate = (rate: number) => () => {
  const AC = window.AudioContext;
  // a device the browser cannot (or will not) resample from: every context runs at `rate`
  (window as any).AudioContext = class extends AC {
    constructor(o: AudioContextOptions = {}) {
      super({ ...o, sampleRate: (window as any).__rate });
    }
  };
  (window as any).__rate = 0;
};
async function clickKey(page: Page) {
  const key = page.locator('.key[data-midi="60"]');
  await key.scrollIntoViewIfNeeded();
  const box = (await key.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.85);
}

test('start-up at odd sample rates (96 kHz interface, 22.05 kHz headset) still reaches sound', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'desktop covers the start-up paths');
  for (const rate of [96000, 22050]) {
    await page.addInitScript(forceRate(rate));
    await page.addInitScript((r) => ((window as any).__rate = r), rate);
    await page.goto('/');
    await clickKey(page);
    await page.waitForFunction(() => (window as any).__piano?.status === 'running', null, { timeout: 8000 });
    expect(await page.evaluate(() => (window as any).__piano.ctx.sampleRate)).toBe(rate);
  }
});

test('start-up: a stalled or refused designs file falls back; a crashing engine says why and retries', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'desktop covers the start-up paths');
  // designs never answer: the page designs them itself after a 2.5 s timeout
  await page.route('**/designs/**', () => undefined);
  await page.goto('/');
  await clickKey(page);
  await page.waitForFunction(() => (window as any).__piano?.status === 'running', null, { timeout: 8000 });
  await page.unroute('**/designs/**');
  // designs refused (an expired login on a protected deployment answers 401)
  const p2 = await page.context().newPage();
  await p2.route('**/designs/**', (r) => r.fulfill({ status: 401, body: 'Unauthorized' }));
  await p2.goto('/');
  await clickKey(p2);
  await p2.waitForFunction(() => (window as any).__piano?.status === 'running', null, { timeout: 8000 });
  // the worklet's constructor throws: the lamp shows the reason and offers a retry, no silent hang
  const p3 = await page.context().newPage();
  await p3.addInitScript(() => {
    // worklet module requests are not routable, so swap the module itself
    const body = "registerProcessor('piano-model', class extends AudioWorkletProcessor { constructor() { super(); throw new Error('test crash'); } process() { return true; } });";
    const url = URL.createObjectURL(new Blob([body], { type: 'text/javascript' }));
    const orig = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = function () {
      return orig.call(this, url);
    };
  });
  await p3.goto('/');
  await clickKey(p3);
  await expect(p3.locator('.lamp-text')).toContainText('tap to retry', { timeout: 6000 });
  await expect(p3.locator('.lamp-text')).toContainText('crashed');
  // no retry on a timer (outside a gesture); a tap retries, on the same AudioContext
  await p3.waitForTimeout(800);
  expect(await p3.evaluate(() => (window as any).__diag.lines.filter((l: any) => l.step.startsWith('start (attempt')).length)).toBe(1);
  await p3.evaluate(() => ((window as any).__ctx0 = (window as any).__piano.ctx));
  await clickKey(p3);
  await p3.waitForFunction(() => (window as any).__diag.lines.some((l: any) => l.step === 'AudioContext reused'));
  expect(await p3.evaluate(() => (window as any).__piano.ctx === (window as any).__ctx0)).toBe(true);
});

test('octave control: buttons and Z/X/−/= shift the keys, within each instrument’s range', async ({ page }) => {
  await page.goto('/');
  await startAudio(page);
  const label = page.locator('.oct-label');
  await expect(label).toHaveText('C4');
  await page.keyboard.press('x');
  await expect(label).toHaveText('C5');
  await page.keyboard.press('Minus');
  await expect(label).toHaveText('C4');
  await page.getByRole('button', { name: 'Octave down' }).click();
  await expect(label).toHaveText('C3');
  // the computer keys now play an octave lower
  await page.keyboard.down('KeyA');
  await expect(page.locator('.key[data-midi="48"]')).toHaveClass(/down/);
  await page.keyboard.up('KeyA');
  // violin: the rows still start on a C (A = C4, J = B4, U = A#4); G3, its lowest string,
  // is reached one octave down (A = C3 … G = G3), and it stops there
  await page.evaluate(() => (window as any).__piano.setInstrument('violin'));
  await expect(label).toHaveText('C4');
  await page.keyboard.down('KeyJ');
  await expect(page.locator('.key[data-midi="71"]')).toHaveClass(/down/);
  await page.keyboard.up('KeyJ');
  await page.keyboard.down('KeyU');
  await expect(page.locator('.key[data-midi="70"]')).toHaveClass(/down/);
  await page.keyboard.up('KeyU');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Octave down' }).click();
  await expect(label).toHaveText('C3');
  await page.getByRole('button', { name: 'Octave up' }).click();
  await expect(label).toHaveText('C4');
  await page.evaluate(() => (window as any).__piano.setInstrument('piano'));
});

test('drop a .mid file: it plays on the current instrument, pauses, stops; a new file replaces it', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  const drop = async (bytes: number[], name: string) =>
    page.evaluate(
      ([b, n]) => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(b as number[])], n as string, { type: 'audio/midi' }));
        window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
        window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
      },
      [bytes, name] as const,
    );
  // a C major arpeggio, 8th notes at 120 bpm, sustained, then a held chord (5 s)
  const notes: [number, ...number[]][] = [[0, 0xb0, 64, 127]];
  for (let i = 0; i < 16; i++) notes.push([0, 0x90, [60, 64, 67, 72][i % 4], 80], [240, 0x80, [60, 64, 67, 72][i % 4], 0]);
  notes.push([0, 0x90, 48, 90], [3840, 0x80, 48, 0], [0, 0xb0, 64, 0]);
  await drop(Array.from(smf(480, [notes])), 'arpeggio.mid');
  const player = page.locator('.player');
  await expect(player).toBeVisible();
  await expect(player.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(page.locator('.key.down')).not.toHaveCount(0, { timeout: 2000 });
  await page.waitForTimeout(600);
  expect(Number(await page.locator('.pl-bar').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  // pause: everything lifts, nothing more is scheduled
  await player.getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('.key.down')).toHaveCount(0);
  await page.waitForTimeout(400);
  await expect(page.locator('.key.down')).toHaveCount(0);
  // play again from where it was, then stop
  await player.getByRole('button', { name: 'Play' }).click();
  await expect(page.locator('.key.down')).not.toHaveCount(0, { timeout: 2000 });
  await player.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.pl-bar')).toHaveAttribute('aria-valuenow', '0');
  // dropping another file replaces the first and plays it (a single long D3)
  await drop(Array.from(smf(480, [[[0, 0x90, 50, 90], [1920, 0x80, 50, 0]]])), 'd.mid');
  await expect(page.locator('.key[data-midi="50"]')).toHaveClass(/down/, { timeout: 2000 });
  await expect(page.locator('.key[data-midi="60"]')).not.toHaveClass(/down/);
  await player.getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('the MIDI file player sits at the top middle of the stage, over nothing it would hide, in 2D and 3D', async ({ page }, info) => {
  await page.goto('/');
  await startAudio(page);
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'd.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, Array.from(smf(480, [[[0, 0x90, 50, 70], [7680, 0x80, 50, 0]]])));
  const player = page.locator('.player');
  await expect(player).toBeVisible();
  // the position hairline has no tooltip (it still scrubs: it is a slider)
  expect(await page.locator('.pl-bar').getAttribute('data-tip')).toBeNull();
  expect(await page.locator('.pl-bar').getAttribute('title')).toBeNull();
  const check = async (mode: string) => {
    const p = (await player.boundingBox())!;
    const stage = (await page.locator('.stage').boundingBox())!;
    const band = (await page.locator('.stage-top').boundingBox())!;
    // centred on the stage, just under its top band
    expect(Math.abs(p.x + p.width / 2 - (stage.x + stage.width / 2)), mode).toBeLessThan(3);
    expect(p.y, mode).toBeGreaterThanOrEqual(band.y + band.height);
    expect(p.y, mode).toBeLessThan(band.y + band.height + 30);
    const hit = (b: { x: number; y: number; width: number; height: number }) => p.x < b.x + b.width && b.x < p.x + p.width && p.y < b.y + b.height && b.y < p.y + p.height;
    for (const sel of ['.picker', '.readout', '.spec-wrap', '.scope', 'header nav', '.zoom-back']) {
      for (const b of await page.locator(sel).all()) {
        const r = await b.boundingBox();
        if (r && (await b.isVisible())) expect(hit(r), `${mode}: covers ${sel}`).toBe(false);
      }
    }
    // on top: its middle is the player's own
    const top = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.player'), [p.x + p.width / 2, p.y + p.height / 2]);
    expect(top, mode).toBe(true);
  };
  await check('2D');
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  await check('3D');
  await player.getByRole('button', { name: 'Stop' }).click();
});

test('?debug shows the start-up log, step by step, ending in ready', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'desktop covers the diagnostics');
  await page.goto('/?debug');
  await expect(page.locator('.diag pre')).toContainText('environment');
  await clickKey(page);
  const log = page.locator('.diag pre');
  for (const step of ['start (attempt 1)', 'AudioContext created', 'worklet module: loaded', 'worklet node: created', 'worklet: ready', 'first stats']) await expect(log).toContainText(step, { timeout: 8000 });
  // without ?debug nothing is shown
  await page.goto('/');
  await expect(page.locator('.diag')).toHaveCount(0);
});

test('piano presets on the stage: grand and upright only (honky-tonk and prepared are hidden)', async ({ page }) => {
  await page.goto('/');
  const presets = page.locator('.presets button');
  await expect(presets).toHaveText(['grand', 'upright']);
  await startAudio(page);
  await presets.filter({ hasText: 'upright' }).click();
  await page.waitForFunction(() => (window as any).__piano.piano?.preset === 'upright', null, { timeout: 10_000 });
  await expect(presets.filter({ hasText: 'upright' })).toHaveAttribute('aria-pressed', 'true');
  await presets.filter({ hasText: 'grand' }).click();
  await page.waitForFunction(() => (window as any).__piano.piano?.preset === 'grand', null, { timeout: 10_000 });
});

test('piano stage: several held notes all vibrate at once (one shape per sounding string)', async ({ page }) => {
  await page.goto('/');
  await startAudio(page);
  const n = await page.evaluate(async () => {
    const a = (window as any).__piano;
    a.sustain(1);
    for (const m of [48, 55, 60, 64, 67]) a.noteOn(m, 96, 'keys');
    let best = 0;
    const off = a.piano.onVisual((v: any) => {
      const ps = v.pianoShapes;
      if (!ps) return;
      const seen = new Set<number>();
      for (let j = 0; j < ps.midi.length; j++) {
        if (ps.light[j]) continue;
        let mx = 0;
        for (let i = 0; i < ps.points; i++) mx = Math.max(mx, Math.abs(ps.shapes[j * ps.points + i]));
        if (mx > 0) seen.add(ps.midi[j]);
      }
      best = Math.max(best, [48, 55, 60, 64, 67].filter((m) => seen.has(m)).length);
    });
    await new Promise((r) => setTimeout(r, 600));
    off();
    return best;
  });
  expect(n).toBe(5);
});

test('room and lid are dragged on the stage (and work from the keyboard)', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'dragging is checked on desktop');
  await page.goto('/');
  await startAudio(page);
  await page.waitForTimeout(300);
  const p = (k: string) => page.evaluate((key) => (window as any).__piano.piano.params[key], k);
  const room0 = await p('room');
  const grip = page.locator('.grip-room');
  const b = (await grip.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 120, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  expect(await p('room')).toBeGreaterThan(room0 + 0.05);
  // the lid: dragging its free edge towards the curved side closes it
  const lid = page.locator('.grip-lid');
  const lb = (await lid.boundingBox())!;
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb.x + 500, lb.y + lb.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await p('lid')).toBeLessThan(0.8);
  await lid.focus();
  const before = await p('lid');
  await page.keyboard.press('ArrowUp');
  expect(await p('lid')).toBeGreaterThan(before);
});

test('keys light only the notes the engine really sounds: flute, trumpet, violin, from every input', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'computer keys and MIDI are desktop inputs');
  await page.addInitScript(() => {
    const inputs = new Map<string, any>();
    const access: any = { inputs, outputs: new Map(), onstatechange: null, sysexEnabled: false };
    (navigator as any).requestMIDIAccess = async () => access;
    (window as any).__midi = {
      plug() {
        const input = { id: 'fake', name: 'Test Keys', state: 'connected', onmidimessage: null as any };
        inputs.set('fake', input);
        access.onstatechange?.({ port: input });
      },
      send(bytes: number[]) {
        inputs.get('fake').onmidimessage?.({ data: new Uint8Array(bytes) });
      },
    };
  });
  await page.goto('/');
  await page.evaluate(() => (window as any).__midi.plug());
  await startAudio(page);
  const key = (m: number) => page.locator(`.key[data-midi="${m}"]`);
  const lit = async (on: number[], ghost: number[]) => {
    for (const m of on) await expect(key(m), `m${m} sounding`).toHaveClass(/sounding/);
    for (const m of ghost) {
      await expect(key(m), `m${m} held`).toHaveClass(/down/);
      await expect(key(m), `m${m} not sounding`).not.toHaveClass(/sounding/);
    }
  };
  // flute, computer keys (A = C5, D = E5): the last held key sounds; releasing it returns
  await page.evaluate(() => (window as any).__piano.setInstrument('flute'));
  await page.keyboard.down('KeyA');
  await lit([72], []);
  await page.keyboard.down('KeyD');
  await lit([76], [72]);
  await page.keyboard.up('KeyD');
  await lit([72], []);
  await page.keyboard.up('KeyA');
  await expect(key(72)).not.toHaveClass(/sounding/);
  // trumpet, MIDI
  await page.evaluate(() => (window as any).__piano.setInstrument('trumpet'));
  await page.evaluate(() => (window as any).__midi.send([0x90, 60, 90]));
  await page.evaluate(() => (window as any).__midi.send([0x90, 64, 90]));
  await lit([64], [60]);
  await page.evaluate(() => (window as any).__midi.send([0x80, 64, 0]));
  await lit([60], []);
  await page.evaluate(() => (window as any).__midi.send([0x80, 60, 0]));
  await expect(key(60)).not.toHaveClass(/sounding/);
  // violin: G3 and A3 can only be played on the G string. G3 held on screen (mouse), A3 from
  // MIDI takes the string; releasing A3 gives it back
  await page.evaluate(() => (window as any).__piano.setInstrument('violin'));
  const g3 = key(55);
  await g3.scrollIntoViewIfNeeded();
  const b = (await g3.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.9);
  await page.mouse.down();
  await lit([55], []);
  await page.evaluate(() => (window as any).__midi.send([0x90, 57, 90]));
  await lit([57], [55]);
  await page.evaluate(() => (window as any).__midi.send([0x80, 57, 0]));
  await lit([55], []);
  await page.mouse.up();
  await expect(key(55)).not.toHaveClass(/sounding/);
  // five notes on four strings: the fifth (G5, playable on all four) takes the string that has
  // been playing longest (G3's); releasing it gives that string back
  await page.evaluate(async () => {
    for (const m of [55, 62, 69, 76, 79]) {
      (window as any).__piano.noteOn(m, 90, 'keys');
      await new Promise((r) => setTimeout(r, 40));
    }
  });
  await lit([62, 69, 76, 79], [55]);
  await expect(page.locator('.key.sounding')).toHaveCount(4);
  await page.evaluate(() => (window as any).__piano.noteOff(79, 'keys'));
  await lit([55, 62, 69, 76], []);
});

test('icon-only stage controls say what they are: a short tooltip and an accessible name', async ({ page }, info) => {
  await page.goto('/');
  await startAudio(page);
  await page.waitForTimeout(300);
  const tip = page.locator('.tip');
  // no tooltip and no new words until asked
  await expect(tip).toBeHidden();
  const room = page.locator('.grip-room');
  const lid = page.locator('.grip-lid');
  await expect(room).toHaveAttribute('aria-label', /Reverb/);
  await expect(lid).toHaveAttribute('aria-label', /lid/i);
  await expect(room).toHaveAttribute('aria-valuetext', /^reverb · \d\.\d s$/);
  await expect(lid).toHaveAttribute('aria-valuetext', /^lid · (closed|\d+ % open)$/);
  if (info.project.name === 'phone') {
    // touch has no hover: the tooltip shows while a grip is held
    const b = (await room.boundingBox())!;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    await expect(tip).toHaveText(/^reverb · \d\.\d s$/);
    return;
  }
  await lid.hover();
  await expect(tip).toHaveText(/^lid · (closed|\d+ % open)$/);
  // keyboard focus shows it at once and it follows the value
  await room.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(tip).toHaveText(/^reverb · \d\.\d s$/);
  const t0 = await tip.textContent();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(tip).not.toHaveText(t0!);
  // the other icon-only controls
  for (const [sel, text] of [['.oct-btn >> nth=0', 'octave down · Z'], ['.oct-btn >> nth=1', 'octave up · X'], ['.knob-toggle', 'knobs'], ['.ens-toggle', 'ensemble · tap instruments to add them'], ['.score-btn', 'pieces'], ['.pl-route', 'routing']] as const) {
    const el = page.locator(sel);
    if (!(await el.isVisible())) continue;
    await el.hover();
    await expect(tip, sel).toHaveText(text);
  }
});

test('click a note’s strings: that key’s action opens, plays from its own telemetry, and closes', async ({ page }, info) => {
  await page.goto('/');
  await startAudio(page);
  await page.waitForTimeout(400);
  const openAt = async (midi: number, frac: number) => {
    const k = page.locator(`.key[data-midi="${midi}"]`);
    await k.scrollIntoViewIfNeeded();
    const kb = (await k.boundingBox())!;
    const cv = (await page.locator('.stage-cv').boundingBox())!;
    if (info.project.name === 'phone') await page.touchscreen.tap(kb.x + kb.width / 2, cv.y + cv.height * frac);
    else await page.mouse.click(kb.x + kb.width / 2, cv.y + cv.height * frac);
  };
  await openAt(48, 0.8);
  const panel = page.locator('.av-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('aria-label', /^C3: the grand action$/);
  // the engine streams this key's action: its damper, strike record and string
  const watch = await page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const p = (window as any).__piano.piano;
        const off = p.onVisual((v: any) => {
          if (v.watch?.strike) {
            off();
            resolve({ midi: v.watch.midi, damper: v.watch.damper, vH: v.watch.strike.vHammer, n: v.watch.strike.force.length, shape: v.watch.shape.length });
          }
        });
        (window as any).__piano.noteOn(48, 96, 'keys');
        setTimeout(() => (window as any).__piano.noteOff(48, 'keys'), 400);
      }),
  );
  expect(watch.midi).toBe(48);
  expect(watch.vH).toBeGreaterThan(0.5);
  expect(watch.n).toBeGreaterThan(10);
  expect(watch.shape).toBe(64);
  // the strike is replayed in slow motion
  await expect(page.locator('.av-speed')).toHaveText(/^×1\/\d+$/);
  // pressing the drawn key plays the note
  const cvb = (await page.locator('.av-cv').boundingBox())!;
  if (info.project.name !== 'phone') {
    await page.mouse.move(cvb.x + cvb.width * 0.2, cvb.y + cvb.height * 0.8);
    await page.mouse.down();
    await expect(page.locator('.key[data-midi="48"]')).toHaveClass(/down/);
    await page.mouse.up();
    await page.keyboard.press('Escape');
  } else {
    await page.locator('.av-close').tap();
  }
  await expect(panel).toHaveCount(0);
  // the upright has its own action
  await page.evaluate(() => (window as any).__piano.setPreset('upright'));
  await page.locator('.presets button', { hasText: 'upright' }).click();
  await page.waitForTimeout(300);
  await openAt(48, 0.55);
  await expect(panel).toHaveAttribute('aria-label', /upright action/);
  await page.locator('.av-close').click();
  await expect(panel).toHaveCount(0);
});

test('3D stage: every instrument draws in WebGL2 from live frames; orbit and zoom; 2D without WebGL2', async ({ page }, info) => {
  await page.goto('/');
  await startAudio(page);
  const btn = page.locator('.dim-toggle');
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  const cv = page.locator('.stage-3d');
  await expect(cv).toBeVisible();
  await page.evaluate(() => ((window as any).__stage3d.probe = true));
  const stats = () => page.evaluate(() => ({ ...(window as any).__stage3d.stats }));
  for (const [inst, note] of [['piano', 60], ['violin', 72], ['viola', 60], ['cello', 50], ['flute', 74], ['trumpet', 67]] as const) {
    await page.evaluate(async ([i, m]) => {
      await (window as any).__piano.setInstrument(i);
      (window as any).__piano.noteOn(m, 96, 'keys');
    }, [inst, note] as const);
    await page.waitForTimeout(500);
    const s = await stats();
    expect(s.vertices, inst).toBeGreaterThan(200);
    // pixels actually drawn (not a blank canvas)
    const lit = (await stats()).lit;
    expect(lit, inst).toBeGreaterThan(0); // (a flute is a thin line on a 40×24 sample grid)
    await page.evaluate((m) => (window as any).__piano.noteOff(m, 'keys'), note);
  }
  // the upright too
  await page.evaluate(async () => {
    await (window as any).__piano.setInstrument('piano');
    (window as any).__stage3d.probe = true;
    await (window as any).__piano.setPreset('upright');
  });
  await page.locator('.presets button', { hasText: 'upright' }).click();
  await page.waitForTimeout(300);
  expect((await stats()).vertices).toBeGreaterThan(200);
  // budget: a frame's scene + draw stays small
  expect((await stats()).ms).toBeLessThan(info.project.name === 'phone' ? 16 : 12);
  // orbit: dragging changes the picture
  const b = (await cv.boundingBox())!;
  // a checksum of the drawn pixels, with the sound stopped so only the camera changes it
  await page.evaluate(() => (window as any).__piano.allNotesOff?.());
  await page.waitForTimeout(300);
  const snap = async () => (await stats()).sum;
  if (info.project.name !== 'phone') {
    const before = await snap();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 160, b.y + b.height / 2 + 40, { steps: 6 });
    await page.mouse.up();
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(100);
    expect(await snap()).not.toBe(before);
  }
  // a click (not a drag) on a note's strings in 3D flies to that key's action (no 2D panel); back out
  await page.evaluate(() => (window as any).__stage3d.resetView());
  await page.waitForTimeout(150);
  const at = await page.evaluate(() => (window as any).__stage3d.screenOf(60));
  expect(at, 'C4 strings on screen').not.toBeNull();
  const b3 = (await cv.boundingBox())!;
  if (info.project.name === 'phone') await page.touchscreen.tap(b3.x + at[0], b3.y + at[1]);
  else await page.mouse.click(b3.x + at[0], b3.y + at[1]);
  await expect.poll(() => page.evaluate(() => (window as any).__stage3d.zoomed)).toBe(60);
  await expect(page.locator('.av-panel')).toHaveCount(0);
  await page.locator('.zoom-back').click();
  await expect.poll(() => page.evaluate(() => (window as any).__stage3d.zoomed)).toBeNull();
  // back to 2D
  await btn.click();
  await expect(cv).toBeHidden();
});

test('the action close-up is the pianos’ alone: no string zoom on the bowed strings or the winds, in 2D or 3D', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.goto('/');
  await startAudio(page);
  const panel = page.locator('.av-panel');
  const press = (x: number, y: number) => (phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const choose = async (label: string, id: string) => {
    await page.locator('.instruments').getByRole('button', { name: label }).click();
    await page.waitForFunction((x) => (window as any).__piano.piano?.instrument === x, id, { timeout: 15_000 });
  };
  // the piano offers it; switching instrument closes it and leaves no zoom cursor behind
  await page.waitForTimeout(400);
  await page.locator('.key[data-midi="48"]').scrollIntoViewIfNeeded();
  const kb = (await page.locator('.key[data-midi="48"]').boundingBox())!;
  const cvb = (await page.locator('.stage-cv').boundingBox())!;
  if (!phone) {
    await page.mouse.move(kb.x + kb.width / 2, cvb.y + cvb.height * 0.8);
    await expect.poll(() => page.locator('.stage-cv').evaluate((e) => (e as HTMLElement).style.cursor)).toBe('zoom-in');
  }
  await press(kb.x + kb.width / 2, cvb.y + cvb.height * 0.8);
  await expect(panel).toBeVisible();
  // (the panel is modal: a switch while it is open comes from elsewhere, e.g. the API or a file)
  await page.evaluate(() => (window as any).__piano.setInstrument('violin'));
  await expect(panel).toHaveCount(0);
  expect(await page.locator('.stage-cv').evaluate((e) => (e as HTMLElement).style.cursor)).toBe('');
  // elsewhere: hover and click a grid over the whole stage (below its top band); nothing opens
  const sweep = async (sel: string) => {
    const cv = page.locator(sel);
    const b = (await cv.boundingBox())!;
    const top = (await page.locator('.stage-top').boundingBox())!;
    const y0 = Math.max(b.y, top.y + top.height) + 8;
    const y1 = b.y + b.height - 8;
    for (let i = 1; i <= 5; i++)
      for (let j = 0; j < 3; j++) {
        const x = b.x + (b.width * i) / 6;
        const y = y0 + ((y1 - y0) * (j + 0.5)) / 3;
        if (!phone) {
          await page.mouse.move(x, y);
          expect(await cv.evaluate((e) => (e as HTMLElement).style.cursor), `${sel} cursor`).not.toBe('zoom-in');
        }
        await press(x, y);
      }
    await expect(panel).toHaveCount(0);
  };
  const others = [['Violin', 'violin'], ['Viola', 'viola'], ['Cello', 'cello'], ['Flute', 'flute'], ['Trumpet', 'trumpet']] as const;
  for (const [label, id] of others) {
    await choose(label, id);
    await sweep('.stage-cv');
  }
  const btn = page.locator('.dim-toggle');
  await btn.click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  for (const [label, id] of others) {
    await choose(label, id);
    await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
    await sweep('.stage-3d');
  }
  await btn.click();
});

test('pianos in 3D: the case hides (button or I), the inside keeps drawing, and it is remembered for the session', async ({ page }, info) => {
  await page.goto('/');
  await startAudio(page);
  const caseBtn = page.locator('.case-toggle');
  await expect(caseBtn).toBeHidden(); // 2D: no case toggle
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  await expect(caseBtn).toBeVisible();
  await expect(caseBtn).toHaveAttribute('aria-label', 'Hide the case');
  // the grand's open lid mirrors the plate and strings (not in the phones' light scene, not when shut)
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
  const mirror = () => page.evaluate(() => (window as any).__stage3d.stats.mirror as boolean);
  if (info.project.name === 'phone') expect(await mirror()).toBe(false);
  else {
    await expect.poll(mirror).toBe(true);
    await page.evaluate(() => (window as any).__piano.setParams({ lid: 0 }));
    await expect.poll(mirror).toBe(false);
    await page.evaluate(() => (window as any).__piano.setParams({ lid: 1 }));
    await expect.poll(mirror).toBe(true);
  }
  await page.evaluate(() => (window as any).__piano.setPreset('upright'));
  await page.locator('.presets button', { hasText: 'upright' }).click();
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
  await page.waitForTimeout(300);
  const verts = () => page.evaluate(() => (window as any).__stage3d.stats.vertices as number);
  const shown = await verts();
  expect(await mirror()).toBe(false);
  if (info.project.name === 'phone') await caseBtn.tap();
  else await page.keyboard.press('KeyI');
  await expect(caseBtn).toHaveAttribute('aria-pressed', 'true');
  // after the dissolve the cabinet is no longer drawn; the keys, action and strings still are
  await expect.poll(verts, { timeout: 3000 }).toBeLessThan(shown);
  expect(await verts()).toBeGreaterThan(shown * 0.5);
  // a key still moves its action with the case hidden
  await page.evaluate(() => (window as any).__piano.noteOn(60, 100, 'keys'));
  await page.waitForTimeout(150);
  await page.evaluate(() => (window as any).__piano.noteOff(60, 'keys'));
  // remembered for the session (a reload keeps it), and only offered for the pianos
  await page.reload();
  await startAudio(page);
  await expect(page.locator('.stage-3d')).toBeVisible();
  await expect(caseBtn).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => (window as any).__piano.setInstrument('cello'));
  await expect(caseBtn).toBeHidden();
  await page.keyboard.press('KeyI');
  await page.evaluate(() => (window as any).__piano.setInstrument('piano'));
  await expect(caseBtn).toHaveAttribute('aria-pressed', 'true');
  await caseBtn.click();
  await expect(caseBtn).toHaveAttribute('aria-pressed', 'false');
});

test('pianos in 3D: a key flies the camera to its own action; Esc, the × or a click off the keys fly back; never on other instruments', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.goto('/');
  await startAudio(page);
  await page.locator('.dim-toggle').click();
  const cv = page.locator('.stage-3d');
  await expect(cv).toBeVisible();
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
  const zoomed = () => page.evaluate(() => (window as any).__stage3d.zoomed);
  const press = (x: number, y: number) => (phone ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const b = (await cv.boundingBox())!;
  const clickKey = async (m: number) => {
    const at = await page.evaluate((k) => (window as any).__stage3d.screenOf(k), m);
    await press(b.x + at[0], b.y + at[1]);
  };
  const back = page.locator('.zoom-back');
  await expect(back).toBeHidden();
  await clickKey(60);
  await expect.poll(zoomed).toBe(60);
  await expect(back).toBeVisible();
  await expect(back).toHaveAttribute('aria-label', 'Back to the whole piano');
  // the key's action plays live while zoomed, and the frame stays cheap
  await page.evaluate(() => (window as any).__piano.noteOn(60, 100, 'keys'));
  await page.waitForTimeout(950);
  await page.evaluate(() => (window as any).__piano.noteOff(60, 'keys'));
  expect(await page.evaluate(() => (window as any).__stage3d.stats.ms)).toBeLessThan(phone ? 16 : 12);
  if (!phone) {
    await page.keyboard.press('Escape');
    await expect.poll(zoomed).toBeNull();
    await expect(back).toBeHidden();
    await page.waitForTimeout(900);
    await clickKey(72);
    await expect.poll(zoomed).toBe(72);
  }
  // a click off the keys (the empty corner of the stage) flies back out
  await press(b.x + 12, b.y + b.height - 12);
  await expect.poll(zoomed).toBeNull();
  await page.waitForTimeout(900);
  // a change of instrument leaves no zoom behind, and the other instruments never zoom
  await page.evaluate(() => (window as any).__stage3d.zoomTo(48));
  await expect.poll(zoomed).toBe(48);
  await page.evaluate(() => (window as any).__piano.setInstrument('violin'));
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'violin');
  await expect.poll(zoomed).toBeNull();
  await page.evaluate(() => (window as any).__stage3d.zoomTo(60));
  await page.waitForTimeout(200);
  expect(await zoomed()).toBeNull();
  await expect(back).toBeHidden();
});

test('pianos in 3D: sustain leaves the camera alone, and zooming in stops outside the case (grand and upright)', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.goto('/');
  await startAudio(page);
  await page.locator('.dim-toggle').click();
  const cv = page.locator('.stage-3d');
  await expect(cv).toBeVisible();
  const eye = () => page.evaluate(() => (window as any).__stage3d.eye as number[]);
  // well inside each case (the plate, strings, action and keybed): the camera must never get here
  const inner: Record<string, [number[], number[]]> = { grand: [[-0.68, 0.12, 0.12], [0.68, 0.92, 1.95]], upright: [[-0.7, 0.1, 0.06], [0.7, 1.16, 0.55]] };
  for (const preset of ['grand', 'upright']) {
    await page.evaluate((p) => (window as any).__piano.setPreset(p), preset);
    await page.locator('.presets button', { hasText: preset }).click();
    await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
    await page.evaluate(() => (window as any).__stage3d.resetView());
    await page.waitForTimeout(300);
    const before = await eye();
    // A5, then the sustain pedal (Space on a keyboard; the API on a phone)
    await page.evaluate(() => (window as any).__piano.noteOn(81, 100, 'keys'));
    if (phone) await page.evaluate(() => (window as any).__piano.sustain(1));
    else await page.keyboard.down('Space');
    await page.waitForTimeout(500);
    const after = await eye();
    expect(Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2]), `${preset}: camera moved on sustain`).toBeLessThan(0.002);
    if (phone) await page.evaluate(() => (window as any).__piano.sustain(0));
    else await page.keyboard.up('Space');
    await page.evaluate(() => (window as any).__piano.noteOff(81, 'keys'));
    // zoom all the way in (wheel / pinch clamp): the camera stays outside the case
    if (!phone) {
      const b = (await cv.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      for (let k = 0; k < 12; k++) await page.mouse.wheel(0, -400);
    } else {
      await page.evaluate(() => (window as any).__stage3d.setView({ dist: 0.05 }));
    }
    await page.waitForTimeout(600);
    const e = await eye();
    const [lo, hi] = inner[preset];
    const isIn = e.every((v, k) => v > lo[k] && v < hi[k]);
    expect(isIn, `${preset}: camera inside the case at ${e.map((v) => v.toFixed(2))}`).toBe(false);
  }
});

test('the full pedal set: sustain, soft and the middle pedal (a grand’s sostenuto, an upright’s muffler), on screen, keys and engine', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.goto('/');
  await startAudio(page);
  const pedals = page.locator('.pedals .pedal');
  const middle = page.locator('.pedals .pedal').nth(2);
  await expect(pedals).toHaveCount(3);
  const stats = () => page.evaluate(() => (window as any).__piano.lastStats);
  // the grand: the middle pedal is the sostenuto
  await expect(middle.locator('.p-name')).toHaveText('sost.');
  await expect(middle).toHaveAttribute('aria-label', /^Sostenuto/);
  if (!phone) {
    await page.keyboard.down('KeyB');
    await expect.poll(async () => (await stats()).middle).toBeGreaterThan(0.9);
    await expect(middle).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.up('KeyB');
    await expect.poll(async () => (await stats()).middle).toBeLessThan(0.1);
  }
  // pressed on screen (a held pointer)
  const mb = (await middle.boundingBox())!;
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await stats()).middle).toBeGreaterThan(0.9);
  await page.mouse.up();
  await expect.poll(async () => (await stats()).middle).toBeLessThan(0.1);
  // the upright: the soft pedal is the half-blow rail, the middle pedal its practice muffler
  await page.evaluate(() => (window as any).__piano.setPreset('upright'));
  await page.locator('.presets button', { hasText: 'upright' }).click();
  await expect(middle.locator('.p-name')).toHaveText('muffler');
  await expect(middle).toHaveAttribute('aria-label', /^Practice muffler/);
  await expect(pedals.nth(1)).toHaveAttribute('aria-label', /hammers rest nearer/);
  // the other instruments show only the sustain pedal
  await page.evaluate(() => (window as any).__piano.setInstrument('cello'));
  await expect(middle).toBeHidden();
  await expect(pedals.nth(1)).toBeHidden();
});

test('without WebGL2 there is no 3D toggle and the 2D stage works', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as any).getContext = function (type: string, ...rest: unknown[]) {
      if (type === 'webgl2') return null;
      return orig.call(this, type as never, ...(rest as []));
    };
    localStorage.setItem('piano-model.3d', '1');
  });
  await page.goto('/');
  await startAudio(page);
  await expect(page.locator('.dim-toggle')).toBeHidden();
  await expect(page.locator('.stage-3d')).toHaveCount(0);
  await expect(page.locator('.stage-cv')).toBeVisible();
});

test('the bow in the hand: a drag on the bow sounds the string and moves the bow, by touch and by mouse, in 2D and 3D', async ({ page, context }, info) => {
  const errors = collectErrors(page);
  const phone = info.project.name === 'phone';
  await page.goto('/');
  await startAudio(page);
  const cdp = phone ? await context.newCDPSession(page) : null;
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => cdp!.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const line = () =>
    page.evaluate(() => {
      const w = window as any;
      if (!w.__stage3d) return w.__bow2d();
      const l = w.__stage3d.bowLine();
      if (!l) return null;
      const r = w.__stage3d.el.getBoundingClientRect();
      return { fx: l.fx + r.left, fy: l.fy + r.top, tx: l.tx + r.left, ty: l.ty + r.top, pos: l.pos };
    }) as Promise<{ fx: number; fy: number; tx: number; ty: number; pos: number } | null>;
  const rms = () =>
    page.evaluate(() => {
      const a = (window as any).__piano.analyser as AnalyserNode;
      const b = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(b);
      let s = 0;
      for (const v of b) s += v * v;
      return Math.sqrt(s / b.length);
    });
  const vw = page.viewportSize()!;
  for (const d3 of [false, true]) {
    if (d3) {
      await page.locator('.dim-toggle').click();
      await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
    }
    for (const inst of ['violin', 'viola', 'cello']) {
      await page.evaluate((i) => (window as any).__piano.setInstrument(i), inst);
      await expect.poll(async () => (await line())?.pos ?? -1).toBeGreaterThanOrEqual(0);
      await page.waitForTimeout(d3 ? 250 : 80);
      // a touch on the stage is the bow's, never a pan the browser takes away
      expect(await page.evaluate((s) => getComputedStyle(document.querySelector(s)!).touchAction, d3 ? '.stage-3d' : '.stage-cv')).toBe('none');
      const l = (await line())!;
      const len = Math.hypot(l.tx - l.fx, l.ty - l.fy);
      const ux = (l.tx - l.fx) / len;
      const uy = (l.ty - l.fy) / len;
      // down on the hair (at the string, kept on screen), then towards the frog: the contact point travels to the tip
      let x = Math.min(vw.width - 70, Math.max(70, l.fx + (l.tx - l.fx) * l.pos));
      let y = l.fy + (l.ty - l.fy) * l.pos + (l.tx - l.fx ? ((x - (l.fx + (l.tx - l.fx) * l.pos)) / (l.tx - l.fx)) * (l.ty - l.fy) : 0);
      if (phone) await touch('touchStart', x, y);
      else {
        await page.mouse.move(x, y);
        await page.mouse.down();
      }
      // the bow is in the hand and still: nothing sounds yet
      expect(await page.evaluate(() => (window as any).__piano.sounding.size)).toBe(0);
      let loud = 0;
      for (let i = 0; i < 14; i++) {
        x -= ux * 6;
        y -= uy * 6;
        if (phone) await touch('touchMove', x, y);
        else await page.mouse.move(x, y);
        await page.waitForTimeout(16);
        if (i > 6) loud = Math.max(loud, await rms());
      }
      const where = `${inst} ${d3 ? '3D' : '2D'}`;
      expect(loud, `${where}: it sounds`).toBeGreaterThan(0.002);
      expect(await page.evaluate(() => (window as any).__piano.sounding.size), `${where}: a string is bowed`).toBe(1);
      await expect.poll(async () => (await line())!.pos, { message: `${where}: the bow has moved` }).toBeGreaterThan(l.pos + 0.04);
      if (phone) await touch('touchEnd');
      else await page.mouse.up();
      // let go: the bow leaves the string
      await expect.poll(() => page.evaluate(() => (window as any).__piano.sounding.size)).toBe(0);
    }
  }
  // the 3D stage still turns when the pointer lands off the bow
  const eye0 = await page.evaluate(() => [...(window as any).__stage3d.eye]);
  const r = (await page.locator('.stage-3d').boundingBox())!;
  const [ox, oy] = [r.x + r.width * 0.12, r.y + r.height * 0.1];
  if (phone) {
    await touch('touchStart', ox, oy);
    for (let i = 1; i <= 6; i++) await touch('touchMove', ox + 12 * i, oy);
    await touch('touchEnd');
  } else {
    await page.mouse.move(ox, oy);
    await page.mouse.down();
    await page.mouse.move(ox + 72, oy, { steps: 6 });
    await page.mouse.up();
  }
  await expect.poll(async () => Math.hypot(...(await page.evaluate(() => [...(window as any).__stage3d.eye])).map((v: number, i: number) => v - eye0[i]))).toBeGreaterThan(0.01);
  expect(await page.evaluate(() => (window as any).__piano.sounding.size)).toBe(0);
  await page.locator('.dim-toggle').click();
  await page.evaluate(() => (window as any).__piano.setInstrument('piano'));
  expect(errors).toEqual([]);
});

// ================================================================ orchestra mode
const ens = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    return { active: e.active as boolean, lineup: e.lineup as string[], engines: e.parts.filter((p: any) => p.engine).length as number, frames: e.parts.filter((p: any) => p.frame).length as number, held: e.parts.map((p: any) => p.down.size) as number[], kinds: e.parts.map((p: any) => p.engine?.instrument ?? null) as (string | null)[] };
  });

test('orchestra: a piece from the menu puts its ensemble on the stage, in 2D and 3D, and the ensemble steps back', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  await page.locator('.score-btn').click();
  const menu = page.locator('.score-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.sm-item')).toHaveCount(3);
  // (a credit, minimal, to the notes)
  await expect(menu.locator('.sm-credit')).toHaveText(/public domain · Mutopia/);
  await menu.locator('.sm-item').first().click();
  await expect(menu).toBeHidden();
  // the quartet: four engines on the one context, each drawing from its own frames
  await expect.poll(async () => (await ens(page)).frames, { timeout: 8000 }).toBe(4);
  const s = await ens(page);
  expect(s.lineup).toEqual(['violin', 'violin', 'viola', 'cello']);
  expect(s.kinds).toEqual(['violin', 'violin', 'viola', 'cello']);
  expect(await page.evaluate(() => (window as any).__piano.ctx.state)).toBe('running');
  // the picker counts the lineup; the file's four lines show their instruments
  await expect(page.locator('.ens-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pick[aria-label="Violin"] .pick-n')).toHaveText('×2');
  for (const [name, on] of [['Violin', 'true'], ['Viola', 'true'], ['Cello', 'true'], ['Flute', 'false'], ['Piano', 'false']]) await expect(page.locator(`.pick[aria-label="${name}"]`)).toHaveAttribute('aria-pressed', on);
  await expect(page.locator('.pl-line')).toHaveCount(4);
  expect(await page.locator('.pl-line').evaluateAll((b) => b.map((x) => x.getAttribute('data-voice')))).toEqual(['violin', 'violin', 'viola', 'cello']);
  // it sounds: the tune is played, and the mix reaches the analyser
  await expect.poll(async () => (await ens(page)).held.reduce((a, b) => a + b, 0), { timeout: 4000 }).toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const a = (window as any).__piano.analyser as AnalyserNode;
          const b = new Float32Array(2048);
          a.getFloatTimeDomainData(b);
          return Math.sqrt(b.reduce((s, x) => s + x * x, 0) / b.length);
        }),
      { timeout: 4000 },
    )
    .toBeGreaterThan(1e-4);
  // the single instrument's own controls step aside; nothing scrolls sideways
  await expect(page.locator('.knob-toggle')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // the player and its lines cover none of the top band
  const p = (await page.locator('.player').boundingBox())!;
  for (const sel of ['.picker', '.readout']) {
    const r = (await page.locator(sel).boundingBox())!;
    expect(p.x < r.x + r.width && r.x < p.x + p.width && p.y < r.y + r.height && r.y < p.y + p.height, sel).toBe(false);
  }
  // 3D: the four instruments drawn from their frames
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  await page.evaluate(() => ((window as any).__stage3d.probe = true));
  await expect.poll(() => page.evaluate(() => (window as any).__stage3d.stats.lit), { timeout: 8000 }).toBeGreaterThan(20);
  const v3 = await page.evaluate(() => (window as any).__stage3d.stats.vertices);
  expect(v3).toBeGreaterThan(50_000);
  await page.locator('.dim-toggle').click();
  // the ensemble off: the single instrument back, playing and in the graph
  await page.locator('.ens-toggle').click();
  await expect(page.locator('.ens-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect((await ens(page)).active).toBe(false);
  await expect(page.locator('.pl-lines')).toBeHidden();
  await expect(page.locator('.pick[aria-pressed="true"]')).toHaveCount(1);
  await page.evaluate(() => (window as any).__piano.noteOn(67, 90, 'keys'));
  await expect.poll(() => page.evaluate(() => (window as any).__piano.sounding.size), { timeout: 2000 }).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).__piano.noteOff(67, 'keys'));
  expect(errors).toEqual([]);
});

test('orchestra: a dropped file with several parts is shared out by name, program and range; a line moves to another instrument', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  const name = (t: string) => [0xff, 0x03, t.length, ...[...t].map((c) => c.charCodeAt(0))];
  const tune: [number, ...number[]][] = [];
  for (let i = 0; i < 8; i++) tune.push([0, 0x90, [72, 76, 79, 84][i % 4], 90], [480, 0x80, [72, 76, 79, 84][i % 4], 0]);
  const bass: [number, ...number[]][] = [];
  for (let i = 0; i < 4; i++) bass.push([0, 0x91, [36, 43, 41, 43][i], 90], [960, 0x81, [36, 43, 41, 43][i], 0]);
  // an unnamed line of chords (no program): the piano's
  const chords: [number, ...number[]][] = [];
  for (let i = 0; i < 4; i++) chords.push([0, 0x92, 60, 70], [0, 0x92, 64, 70], [0, 0x92, 67, 70], [0, 0x92, 71, 70], [960, 0x82, 60, 0], [0, 0x82, 64, 0], [0, 0x82, 67, 0], [0, 0x82, 71, 0]);
  const file = smf(480, [[[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]], [[0, ...name('Flauto')], [0, 0xc0, 73], ...tune], [[0, ...name('Violoncello')], ...bass], chords]);
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'trio.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, Array.from(file));
  await expect.poll(async () => (await ens(page)).engines, { timeout: 8000 }).toBe(3);
  expect((await ens(page)).lineup).toEqual(['flute', 'cello', 'grand']);
  // the cello's line to the viola: its own instrument changes (a new engine), the others play on
  await page.locator('.pl-line').nth(1).click();
  const menu = page.locator('.pl-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.pl-pick[aria-checked="true"]')).toHaveAttribute('aria-label', 'cello');
  await menu.locator('.pl-pick[aria-label="viola"]').click();
  await expect(menu).toBeHidden();
  await expect.poll(async () => (await ens(page)).kinds, { timeout: 5000 }).toEqual(['flute', 'viola', 'piano']);
  await expect(page.locator('.pl-line').nth(1)).toHaveAttribute('data-voice', 'viola');
  // a line can be left silent; Escape closes the menu without a change
  await page.locator('.pl-line').nth(0).click();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.locator('.pl-line').nth(0).click();
  await menu.locator('.pl-pick[aria-label="silent"]').click();
  await expect.poll(async () => (await ens(page)).lineup).toEqual(['viola', 'grand']);
  await expect(page.locator('.pl-line').nth(0)).toHaveAttribute('data-voice', 'none');
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('orchestra by hand: the ensemble toggle, instruments counted in, a chord dealt out one note each by register', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  await page.locator('.ens-toggle').click();
  await expect.poll(async () => (await ens(page)).engines, { timeout: 8000 }).toBe(4);
  expect((await ens(page)).lineup).toEqual(['violin', 'violin', 'viola', 'cello']);
  // a tap adds one; past the most an instrument may have, it has none
  await page.locator('.pick[aria-label="Flute"]').click();
  await expect.poll(async () => (await ens(page)).lineup).toEqual(['flute', 'violin', 'violin', 'viola', 'cello']);
  await page.locator('.pick[aria-label="Viola"]').click();
  await page.locator('.pick[aria-label="Viola"]').click();
  await expect.poll(async () => (await ens(page)).lineup).toEqual(['flute', 'violin', 'violin', 'cello']);
  await expect.poll(async () => (await ens(page)).engines, { timeout: 8000 }).toBe(4);
  // the keys span the ensemble: the cello's C2 to the violin's top
  await expect(page.locator('.key[data-midi="36"]')).not.toHaveClass(/out/);
  await expect(page.locator('.key[data-midi="35"]')).toHaveClass(/out/);
  // a chord by hand: the lowest note to the cello, the highest to the flute, one each
  await page.evaluate(async () => {
    for (const m of [43, 67, 74, 84]) (window as any).__piano.noteOn(m, 90, 'keys');
  });
  const held = await page.evaluate(() => (window as any).__orchestra.ensemble.parts.map((p: any) => [p.voice, [...p.down]]));
  expect(held).toEqual([
    ['flute', [84]],
    ['violin', [67]],
    ['violin', [74]],
    ['cello', [43]],
  ]);
  await page.evaluate(async () => {
    for (const m of [43, 67, 74, 84]) (window as any).__piano.noteOff(m, 'keys');
  });
  expect((await ens(page)).held).toEqual([0, 0, 0, 0]);
  await page.locator('.ens-toggle').click();
  expect((await ens(page)).active).toBe(false);
  expect(errors).toEqual([]);
});

// ================================================================ orchestra routing, many to many
const routing = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    return {
      lineup: e.lineup as string[],
      players: e.parts.map((p: any) => p.player) as number[],
      routes: e.plan.lines.map((rs: any[]) => rs.map((r) => r.part)) as number[][],
      engines: new Set(e.parts.map((p: any) => p.engine).filter(Boolean)).size as number,
    };
  });

test('orchestra routing, many to many: a tune on two instruments, the whole file on a second cello, two grands of their own', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  await page.evaluate(() => (window as any).__orchestra.loadPiece(0));
  await expect.poll(async () => (await ens(page)).engines, { timeout: 8000 }).toBe(4);
  // the routing grid: a row per instrument, a column per line (and one for every line)
  if (info.project.name !== 'phone') {
    await page.locator('.pl-route').hover();
    await expect(page.locator('.tip')).toHaveText('routing');
  }
  await page.locator('.pl-route').click();
  const grid = page.locator('.pl-grid');
  await expect(grid).toBeVisible();
  await expect(page.locator('.pl-route')).toHaveAttribute('aria-expanded', 'true');
  await expect(grid.locator('.pg-row:not(.pg-add)')).toHaveCount(4);
  await expect(grid.locator('.pg-cell:not(.pg-all)')).toHaveCount(16);
  await expect(grid.locator('.pg-cell[aria-pressed="true"]:not(.pg-all)')).toHaveCount(4);
  // nothing scrolls sideways, the grid on the screen
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const gb = (await grid.boundingBox())!;
  expect(gb.x).toBeGreaterThanOrEqual(0);
  expect(gb.x + gb.width).toBeLessThanOrEqual(info.project.name === 'phone' ? 412 : 1440);
  // one line on several instruments: a flute (it sits before the strings), the first violin's tune on it too
  await grid.locator('.pg-add').click();
  await page.locator('.pl-menu .pl-pick[data-voice="flute"]').click();
  await expect.poll(async () => (await routing(page)).lineup).toEqual(['flute', 'violin', 'violin', 'viola', 'cello']);
  await grid.locator('.pg-cell[data-part="0"][data-line="0"]').click();
  await expect(grid.locator('.pg-cell[data-part="0"][data-line="0"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.pl-line').nth(0)).toHaveAttribute('data-voices', 'flute violin');
  await expect(page.locator('.pl-line').nth(0).locator('.pl-more')).toHaveText('+1');
  // both play it: the flute and the first violin hold notes together
  await expect.poll(async () => (await ens(page)).held.slice(0, 2).every((n) => n > 0), { timeout: 8000 }).toBe(true);
  // the same instrument twice: a second cello, its own engine and player, playing the whole file
  await grid.locator('.pg-add').click();
  await page.locator('.pl-menu .pl-pick[data-voice="cello"]').click();
  await grid.locator('.pg-all[data-part="5"]').click();
  await expect.poll(async () => (await routing(page)).engines, { timeout: 8000 }).toBe(6);
  const r = await routing(page);
  expect(r.lineup).toEqual(['flute', 'violin', 'violin', 'viola', 'cello', 'cello']);
  expect(r.routes).toEqual([[0, 1, 5], [2, 5], [3, 5], [4, 5]]);
  expect(r.players).toEqual([0, 0, 0, 0, 0, 1]);
  await expect(grid.locator('.pg-row[data-part="4"]')).toHaveAttribute('aria-label', /^cello 1/);
  await expect(grid.locator('.pg-row[data-part="5"]')).toHaveAttribute('aria-label', /^cello 2/);
  await expect(page.locator('.pick[aria-label="Cello"] .pick-n')).toHaveText('×2');
  await expect.poll(async () => (await ens(page)).held[5], { timeout: 6000 }).toBeGreaterThan(0);
  if (info.project.name === 'phone') {
    // a phone's stage holds six: the grid offers no seventh
    await expect(grid.locator('.pg-add')).toBeDisabled();
  } else {
    // two grands, each its own engine and seat; eight is the most
    for (let k = 0; k < 2; k++) {
      await grid.locator('.pg-add').click();
      await page.locator('.pl-menu .pl-pick[data-voice="grand"]').click();
    }
    await expect(grid.locator('.pg-add')).toBeDisabled();
    await grid.locator('.pg-all[data-part="6"]').click();
    await grid.locator('.pg-all[data-part="7"]').click();
    await expect.poll(async () => (await ens(page)).frames, { timeout: 10000 }).toBe(8);
    const g = await routing(page);
    expect(g.engines).toBe(8);
    expect(g.lineup.slice(6)).toEqual(['grand', 'grand']);
    expect(g.players.slice(6)).toEqual([0, 1]);
    expect((await ens(page)).kinds.slice(6)).toEqual(['piano', 'piano']);
    // the bus at 1/√n of the instruments that play
    await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.bus.gain.value), { timeout: 2000 }).toBeCloseTo(1 / Math.sqrt(8), 2);
    // in 3D: every seat drawn, both grands' open lids mirror the strings
    await page.keyboard.press('Escape');
    await page.locator('.dim-toggle').click();
    await expect(page.locator('.stage-3d')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).__stage3d.stats.mirrors), { timeout: 8000 }).toBe(2);
    await page.locator('.dim-toggle').click();
    await page.locator('.pl-route').click();
    // a grand taken off from its row
    await grid.locator('.pg-row[data-part="7"]').click();
    await page.locator('.pl-menu .pl-off').click();
    await expect.poll(async () => (await routing(page)).engines, { timeout: 5000 }).toBe(7);
  }
  // an instrument changed in its seat: the flute becomes a trumpet, the tune with it
  await grid.locator('.pg-row[data-part="0"]').click();
  await page.locator('.pl-menu .pl-pick[data-voice="trumpet"]').click();
  await expect.poll(async () => (await routing(page)).lineup[0]).toBe('trumpet');
  // (the second cello and, on a desktop, the grand play every line)
  const desk = info.project.name !== 'phone';
  await expect(page.locator('.pl-line').nth(0)).toHaveAttribute('data-voices', desk ? 'trumpet violin cello grand' : 'trumpet violin cello');
  // off the stage: the tune stays on its violin (and the second cello, and the grand)
  await grid.locator('.pg-row[data-part="0"]').click();
  await page.locator('.pl-menu .pl-off').click();
  await expect.poll(async () => (await routing(page)).routes[0]).toEqual(desk ? [0, 4, 5] : [0, 4]);
  // Escape closes the grid; the line chip still moves a line, and only that line
  await page.keyboard.press('Escape');
  await expect(grid).toBeHidden();
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('orchestra routing: a file on the one instrument shown goes onto several from the routing button', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  // a two-hand piano piece: it plays on the instrument shown, no ensemble
  const rh: [number, ...number[]][] = [];
  for (let i = 0; i < 8; i++) rh.push([0, 0x90, [72, 74, 76, 77][i % 4], 80], [240, 0x80, [72, 74, 76, 77][i % 4], 0]);
  const lh: [number, ...number[]][] = [];
  for (let i = 0; i < 4; i++) lh.push([0, 0x91, 48, 80], [0, 0x91, 52, 80], [0, 0x91, 55, 80], [0, 0x91, 60, 80], [480, 0x81, 48, 0], [0, 0x81, 52, 0], [0, 0x81, 55, 0], [0, 0x81, 60, 0]);
  const file = smf(480, [[[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]], rh, lh]);
  await page.evaluate((b) => (window as any).__player.load(new Uint8Array(b).buffer), Array.from(file));
  expect((await ens(page)).active).toBe(false);
  await expect(page.locator('.pl-route')).toBeVisible();
  // routing: the ensemble comes on, the instrument shown playing every line
  await page.locator('.pl-route').click();
  await expect(page.locator('.pl-grid')).toBeVisible();
  await expect.poll(async () => (await ens(page)).engines, { timeout: 8000 }).toBe(1);
  const r = await routing(page);
  expect(r.lineup).toEqual(['grand']);
  expect(r.routes).toEqual([[0], [0]]);
  // the whole file on a violin as well
  await page.locator('.pg-add').click();
  await page.locator('.pl-menu .pl-pick[data-voice="violin"]').click();
  await page.locator('.pg-all[data-part="0"]').click();
  await expect.poll(async () => (await routing(page)).routes, { timeout: 4000 }).toEqual([[0, 1], [0, 1]]);
  expect((await routing(page)).lineup).toEqual(['violin', 'grand']);
  await expect.poll(async () => (await ens(page)).held[0], { timeout: 6000 }).toBeGreaterThan(0);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

