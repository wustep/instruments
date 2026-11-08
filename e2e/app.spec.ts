// End-to-end checks in real Chrome: the page, the AudioWorklet, offline rendering
// through the worklet with spectral checks, the live views, MIDI input, phone layout.
import { test, expect, type Page } from '@playwright/test';
import { analyzePartials } from '../packages/engine/src/analysis/index.ts';

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
  await expect(page.locator('.instruments .pick')).toHaveCount(5);
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

test('Web MIDI: hot-plug, notes, continuous sustain (CC64) and soft pedal (CC67)', async ({ page }) => {
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
    m.send([0x90, 60, 90]);
  });
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => (window as any).__piano.lastStats);
  expect(st.sustain).toBeCloseTo(64 / 127, 2);
  expect(st.soft).toBeCloseTo(1, 2);
  expect(st.voices).toBeGreaterThanOrEqual(1);
  await expect(page.locator('.key[data-midi="60"]')).toHaveClass(/down/);
  await page.evaluate(() => (window as any).__midi.send([0x80, 60, 0]));
  await expect(page.locator('.key[data-midi="60"]')).not.toHaveClass(/down/);
});

test('layout fits the viewport (no horizontal page scroll) and keys respond to touch/click', async ({ page }, info) => {
  await page.goto('/');
  for (const route of ['#/', '#/play', '#/measurements', '#/notes']) {
    await page.goto(`/${route}`);
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, route).toBeLessThanOrEqual(1);
  }
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

test('all five instruments: selectable in the UI and rendered through the worklet at pitch', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  for (const [label, id] of [['Violin', 'violin'], ['Viola', 'viola'], ['Cello', 'cello'], ['Flute', 'flute'], ['Piano', 'piano']] as const) {
    await page.locator('.instruments').getByRole('button', { name: label }).click();
    await page.waitForFunction((x) => (window as any).__piano.piano?.instrument === x, id, { timeout: 15_000 });
    await expect(page.locator('.pick[aria-pressed="true"]')).toHaveAttribute('aria-label', label);
    await expect(page.locator('.knobs .knob').first()).toBeVisible({ visible: info.project.name !== 'phone' });
  }
  for (const [id, midi] of [['violin', 69], ['viola', 62], ['cello', 48], ['flute', 74]] as const) {
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
});
