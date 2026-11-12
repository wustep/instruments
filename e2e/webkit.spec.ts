// Safari's engine (Playwright's WebKit), a smoke test: the gate's other projects run in Chrome only,
// and the instruments are for iPhones and Macs too. A desktop window and an iPhone: the page loads
// without an error; a key pressed (the gesture Safari wants) starts the AudioWorklet and its note
// sounds at its pitch; the 3D stage draws without a WebGL error; the Orchestra plays its piece on four
// engines; the phone's layout fits. Only this file runs in these projects (playwright.config.ts).
//
// Playwright's WebKit plays through the machine's speakers: every connection to the destination goes
// through a gain of 0 here (the graph still runs, the analyser still hears it).
import { test, expect, type Page } from '@playwright/test';

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const connect = AudioNode.prototype.connect as (this: AudioNode, ...a: unknown[]) => unknown;
    const muted = new WeakMap<BaseAudioContext, GainNode>();
    (AudioNode.prototype as { connect: unknown }).connect = function (this: AudioNode, dest: unknown, ...rest: unknown[]) {
      if (typeof AudioDestinationNode !== 'undefined' && dest instanceof AudioDestinationNode) {
        let g = muted.get(this.context);
        if (!g) {
          g = this.context.createGain();
          g.gain.value = 0;
          connect.call(g, dest);
          muted.set(this.context, g);
        }
        return connect.call(this, g, ...rest);
      }
      return connect.call(this, dest, ...rest);
    };
  });
});

/** press a key of the page's keyboard as a hand does (a real pointer: the gesture that lets sound start) */
async function pressKey(page: Page, midi: number, touch: boolean): Promise<() => Promise<void>> {
  const key = page.locator(`.keyboard .key[data-midi="${midi}"]`);
  const b = (await key.boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height * 0.8;
  if (touch) {
    await page.touchscreen.tap(x, y);
    return async () => {};
  }
  await page.mouse.move(x, y);
  await page.mouse.down();
  return () => page.mouse.up();
}

/** the strongest bin of the page's analyser between two frequencies */
const peak = (page: Page, lo: number, hi: number) =>
  page.evaluate(
    ([lo, hi]) => {
      const a = (window as any).__piano;
      const d = new Float32Array(a.analyser.frequencyBinCount);
      a.analyser.getFloatFrequencyData(d);
      const binHz = a.ctx.sampleRate / a.analyser.fftSize;
      let best = -Infinity;
      let at = 0;
      for (let i = Math.floor(lo / binHz); i < Math.ceil(hi / binHz); i++)
        if (d[i] > best) {
          best = d[i];
          at = i;
        }
      return { db: best, hz: at * binHz, binHz };
    },
    [lo, hi],
  );

test('WebKit: the page loads, a key pressed starts the worklet and its note sounds at pitch, 3D draws without a WebGL error', async ({ page }, info) => {
  test.setTimeout(120_000);
  const phone = info.project.name === 'webkit-phone';
  const errors = collectErrors(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/instruments/i);
  await expect(page.locator('.instruments .pick')).toHaveCount(15);
  await expect(page.locator('.keyboard .key')).toHaveCount(88);
  await expect(page.locator('html')).toHaveAttribute('data-audio', 'idle');
  // the layout fits the window (a phone has no horizontal scroll)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

  // A4 (in view on a phone's keys too): the first press starts the sound, the worklet runs
  const up = await pressKey(page, 69, phone);
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-audio', 'running');
  await up();
  // its note, held from the page's own API now that sound is on: A4 at 440 Hz, well above silence
  const r = await page.evaluate(async () => {
    const a = (window as any).__piano;
    a.noteOn(69, 100, 'keys');
    await new Promise((res) => setTimeout(res, 600));
    return { rate: a.ctx.sampleRate as number, state: a.ctx.state as string, voices: a.lastStats?.voices as number, load: a.lastStats?.load as number };
  });
  const p = await peak(page, 400, 480);
  await page.evaluate(() => (window as any).__piano.noteOff(69, 'keys'));
  expect(r.state).toBe('running');
  expect(r.voices).toBeGreaterThanOrEqual(1);
  expect(p.db, 'A4 sounds').toBeGreaterThan(-70);
  expect(Math.abs(p.hz - 440), 'at 440 Hz').toBeLessThanOrEqual(p.binHz + 1);
  await expect(page.locator('.readout')).toContainText('A');

  // 3D: the stage draws frames, lit, and WebGL reports no error over thirty of them
  await page.locator('.dim-toggle').click();
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 5, null, { timeout: 60_000 });
  const gl = await page.evaluate(async () => {
    const s = (window as any).__stage3d;
    const ctx = s.r3.r.getContext() as WebGL2RenderingContext;
    let errs = 0;
    s.probe = true;
    for (let i = 0; i < 30; i++) {
      await new Promise((res) => requestAnimationFrame(res));
      for (let e = ctx.getError(); e; e = ctx.getError()) errs++;
    }
    const b = s.box() as { x0: number; y0: number; x1: number; y1: number } | null;
    const cv = s.el.getBoundingClientRect();
    return { errs, lit: s.stats.lit as number, box: b, w: cv.width as number, h: cv.height as number };
  });
  expect(gl.errs, 'WebGL errors').toBe(0);
  expect(gl.lit, 'the piano is drawn (lit samples of 960)').toBeGreaterThan(40);
  // the grand whole on the stage, a phone's and a wide one's alike
  expect(gl.box).not.toBeNull();
  expect(gl.box!.x0).toBeGreaterThanOrEqual(0);
  expect(gl.box!.x1).toBeLessThanOrEqual(gl.w);
  expect(gl.box!.y0).toBeGreaterThanOrEqual(0);
  expect(gl.box!.y1).toBeLessThanOrEqual(gl.h);
  expect(errors).toEqual([]);
});

test('WebKit: the Orchestra plays its piece on four engines, each part sounding from its own', async ({ page }, info) => {
  test.setTimeout(120_000);
  const phone = info.project.name === 'webkit-phone';
  const errors = collectErrors(page);
  await page.goto('/orchestra');
  await expect(page.locator('html')).toHaveAttribute('data-route', 'stage');
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.lineup as string[])).toEqual(['violin', 'violin', 'viola', 'cello']);
  // play: the quartet's own piece (the press is the gesture)
  const play = page.locator('.player .pl-play');
  if (phone) await play.tap();
  else await play.click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.filter((q: any) => q.engine).length as number), { timeout: 60_000 })
    .toBe(4);
  // every part has played a note, and the room hears them
  await expect
    .poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.filter((q: any) => q.lastOn > 0).length as number), { timeout: 60_000 })
    .toBe(4);
  await expect.poll(async () => (await peak(page, 60, 2000)).db, { timeout: 20_000 }).toBeGreaterThan(-70);
  expect(await page.evaluate(() => (window as any).__player.playing)).toBe(true);
  await expect(page.locator('.pl-lines .pl-line')).toHaveCount(4);
  await page.evaluate(() => (window as any).__player.stop?.());
  expect(errors).toEqual([]);
});
