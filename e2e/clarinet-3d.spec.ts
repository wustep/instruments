// The clarinet in 3D (clarinet3d.ts): its own model (not the oboe's, which stood in for it), framed whole
// on every stage — a desktop and a phone held upright — clear of the file player; drawn without one WebGL
// error or warning, alone with a note sounding (its keys down) and seated in the Orchestra among the
// winds and strings.
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

test('the clarinet in 3D: its own model, whole from mouthpiece to bell on a desktop and on a phone held upright, under the file player', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.locator('.dim-toggle').click();
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3, null, { timeout: 30_000 });
  // (the oboe first: the clarinet must not draw as the oboe did when it stood in for it)
  await page.evaluate(() => (window as any).__piano.setInstrument('oboe'));
  await expect.poll(async () => (await seen(page)).home?.whole ?? null, { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(300);
  const oboe = await seen(page);
  await page.evaluate(() => (window as any).__piano.setInstrument('clarinet'));
  // (framed for the clarinet: its own home, not the oboe's, which has the same bearing)
  await expect.poll(async () => {
    const v = await seen(page);
    return !!v.home?.whole && v.box !== null && v.vertices !== oboe.vertices && v.home.dist !== oboe.home!.dist;
  }, { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(300);
  const v = await seen(page);
  const b = v.box!;
  const name = `clarinet (${info.project.name})`;
  expect(b.x0, `${name}: left`).toBeGreaterThanOrEqual(0);
  expect(b.x1, `${name}: right`).toBeLessThanOrEqual(v.w);
  expect(b.y1, `${name}: bottom`).toBeLessThanOrEqual(v.h);
  expect(b.y0, `${name}: top, under the file player`).toBeGreaterThanOrEqual(v.over);
  // as tall as the free stage allows (it stands taller than it is wide on either stage)
  const free = (b.y1 - b.y0) / (v.h - v.over);
  expect(free).toBeGreaterThan(0.85);
  test.info().annotations.push({ type: 'clarinet framing', description: JSON.stringify({ free, width: (b.x1 - b.x0) / v.w }) });
  expect(errors).toEqual([]);
});

test('the clarinet in 3D draws without one WebGL warning, alone (a note sounding) and seated in the Orchestra', async ({ page }, info) => {
  const errors = collectErrors(page);
  const gl = collectGl(page);
  await page.goto('/');
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  await page.evaluate(async () => {
    await (window as any).__piano.setInstrument('clarinet');
    (window as any).__piano.noteOn(55, 100, 'keys');
  });
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
  expect(await glErrors(page, 30), 'clarinet').toBe(0);
  await page.evaluate(() => (window as any).__piano.noteOff(55, 'keys'));
  // the Orchestra: a wind section with the clarinet beside the oboe, strings either side
  await page.locator('.ens-toggle').click();
  await page.evaluate(() => (window as any).__orchestra.ensemble.setLineup(['violin', 'flute', 'oboe', 'clarinet', 'cello']));
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.lineup.join())).toBe('violin,flute,oboe,clarinet,cello');
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
