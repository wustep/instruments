// The horn in 3D (horn3d.ts): its own model (not the trumpet's, which stood in for it), framed whole on
// every stage — a desktop and a phone held upright — clear of the file player; a note presses the levers of
// the engine's fingering (the thumb's on the B♭ side) and turns their rotors a quarter turn; drawn without
// one WebGL error or warning, alone with a note sounding and seated in the Orchestra among winds and strings.
import { test, expect, type Page } from '@playwright/test';

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};
/** everything the browser says about WebGL on its console, at any level */
const collectGl = (page: Page) => {
  const msgs: string[] = [];
  page.on('console', (m) => {
    if (/webgl|GL_[A-Z_]{4,}|feedback loop|framebuffer/i.test(m.text())) msgs.push(`${m.type()}: ${m.text()}`);
  });
  return msgs;
};
/** the 3D stage's own count: gl.getError() after each of the next `frames` frames */
const glErrors = (page: Page, frames = 30) =>
  page.evaluate(async (n) => {
    const gl = (window as any).__stage3d.r3.r.getContext() as WebGL2RenderingContext;
    let errs = 0;
    for (let i = 0; i < n; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      for (let e = gl.getError(); e; e = gl.getError()) errs++;
    }
    return errs;
  }, frames);
/** what the stage shows: every vertex the framing counts, projected (px of the canvas), and how far
 *  down the file player's row reaches over it */
const seen = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__stage3d;
    const cv = s.el.getBoundingClientRect();
    return { box: s.box() as { x0: number; y0: number; x1: number; y1: number } | null, w: cv.width, h: cv.height, over: document.querySelector('.player .pl-row')!.getBoundingClientRect().bottom - cv.top, home: s.home as { yaw: number; dist: number; whole?: boolean } | null, vertices: s.stats.vertices as number };
  });

test('the horn in 3D: its own model, whole from mouthpiece to bell on a desktop and on a phone held upright, under the file player', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.locator('.dim-toggle').click();
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3, null, { timeout: 30_000 });
  // (the trumpet first: the horn must not draw as the trumpet did when it stood in for it)
  await page.evaluate(() => (window as any).__piano.setInstrument('trumpet'));
  await expect.poll(async () => (await seen(page)).vertices, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  const trumpet = await seen(page);
  await page.evaluate(() => (window as any).__piano.setInstrument('horn'));
  // (framed for the horn: its own home, whole, not the trumpet's)
  await expect.poll(async () => {
    const v = await seen(page);
    return !!v.home?.whole && v.box !== null && v.vertices > 500_000 && v.vertices !== trumpet.vertices && v.home.dist !== trumpet.home!.dist;
  }, { timeout: 15_000 }).toBe(true);
  expect(await page.evaluate(() => !!(window as any).__horn3d)).toBe(true);
  await page.waitForTimeout(300);
  const v = await seen(page);
  const b = v.box!;
  const name = `horn (${info.project.name})`;
  expect(b.x0, `${name}: left`).toBeGreaterThanOrEqual(0);
  expect(b.x1, `${name}: right`).toBeLessThanOrEqual(v.w);
  expect(b.y1, `${name}: bottom`).toBeLessThanOrEqual(v.h);
  expect(b.y0, `${name}: top, under the file player`).toBeGreaterThanOrEqual(v.over);
  // as large as the free stage allows on its binding side
  const free = Math.max((b.y1 - b.y0) / (v.h - v.over), (b.x1 - b.x0) / v.w);
  expect(free).toBeGreaterThan(0.8);
  test.info().annotations.push({ type: 'horn framing', description: JSON.stringify({ height: (b.y1 - b.y0) / (v.h - v.over), width: (b.x1 - b.x0) / v.w }) });
  expect(errors).toEqual([]);
});

test('the horn in 3D: a note presses the levers of its fingering and turns their rotors, F side and B♭ side, then they spring back', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
  await page.locator('.dim-toggle').click();
  await page.evaluate(() => (window as any).__piano.setInstrument('horn'));
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3 && (window as any).__horn3d?.levers());
  const levers = () => page.evaluate(() => (window as any).__horn3d.levers() as number[]);
  const rotors = () => page.evaluate(() => (window as any).__horn3d.rotors() as number[]);
  // A2 (MIDI 45): the F horn, valves 1 and 2 (the engine's fingering)
  await page.evaluate(() => (window as any).__piano.noteOn(45, 100, 'keys'));
  await expect.poll(async () => (await levers()).map((p) => (p > 0.9 ? 1 : p < 0.1 ? 0 : 0.5)).join(), { timeout: 10_000 }).toBe('0,1,1,0');
  const r = await rotors();
  expect(Math.abs(r[1])).toBeGreaterThan(85);
  expect(Math.abs(r[3])).toBeLessThan(5);
  await page.evaluate(() => (window as any).__piano.noteOff(45, 'keys'));
  await expect.poll(async () => Math.max(...(await levers())), { timeout: 10_000 }).toBeLessThan(0.05);
  // F♯4 (MIDI 66): the B♭ horn (the thumb's lever), valves 2 and 3
  await page.evaluate(() => (window as any).__piano.noteOn(66, 100, 'keys'));
  await expect.poll(async () => (await levers()).map((p) => (p > 0.9 ? 1 : p < 0.1 ? 0 : 0.5)).join(), { timeout: 10_000 }).toBe('1,0,1,1');
  await page.evaluate(() => (window as any).__piano.noteOff(66, 'keys'));
  expect(errors).toEqual([]);
});

test('the horn in 3D draws without one WebGL warning, alone (a note sounding) and seated in the Orchestra', async ({ page }, info) => {
  const errors = collectErrors(page);
  const gl = collectGl(page);
  await page.goto('/');
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  await page.evaluate(async () => {
    await (window as any).__piano.setInstrument('horn');
    (window as any).__piano.noteOn(43, 100, 'keys');
  });
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
  expect(await glErrors(page, 30), 'horn').toBe(0);
  await page.evaluate(() => (window as any).__piano.noteOff(43, 'keys'));
  // the Orchestra: two horns among the winds, strings either side
  await page.locator('.ens-toggle').click();
  await page.evaluate(() => (window as any).__orchestra.ensemble.setLineup(['violin', 'flute', 'clarinet', 'horn', 'horn', 'cello']));
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.lineup.join())).toBe('violin,flute,clarinet,horn,horn,cello');
  await page.waitForTimeout(800);
  expect(await glErrors(page, 30), 'orchestra').toBe(0);
  const v = await seen(page);
  const b = v.box!;
  expect(b.x0).toBeGreaterThanOrEqual(0);
  expect(b.x1).toBeLessThanOrEqual(v.w);
  expect(b.y0).toBeGreaterThanOrEqual(0);
  expect(b.y1).toBeLessThanOrEqual(v.h);
  test.info().annotations.push({ type: `orchestra box (${info.project.name})`, description: JSON.stringify({ ...b, w: v.w, h: v.h }) });
  expect(gl, 'WebGL messages on the console').toEqual([]);
  expect(errors).toEqual([]);
});
