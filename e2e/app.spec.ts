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
  await expect(page.locator('.wordmark')).toHaveText('Piano Model');
  await expect(page.locator('h1')).toContainText('computed, not recorded');
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
  expect(r.stats.load).toBeGreaterThan(0);
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

test('look inside: live string, hammer, soundboard and spectrum views draw', async ({ page }) => {
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
    Array.from(document.querySelectorAll('.panel canvas')).map((c) => {
      const cv = c as HTMLCanvasElement;
      const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    }),
  );
  expect(painted.length).toBe(4);
  for (const n of painted) expect(n).toBeGreaterThan(500);
  await expect(page.locator('.panel .meta').first()).toContainText('Hz');
  // a physical control reaches the worklet
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
  await expect(page.locator('.status')).toContainText('no MIDI device');
  await page.evaluate(() => (window as any).__midi.plug());
  await expect(page.locator('.status')).toContainText('Test Keys');
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
  for (const route of ['#/play', '#/inside', '#/measurements', '#/notes']) {
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
