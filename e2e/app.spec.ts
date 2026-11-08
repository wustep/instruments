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
  for (const [sel, text] of [['.oct-btn >> nth=0', 'octave down · Z'], ['.oct-btn >> nth=1', 'octave up · X'], ['.knob-toggle', 'knobs']] as const) {
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
  // back to 2D
  await btn.click();
  await expect(cv).toBeHidden();
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
