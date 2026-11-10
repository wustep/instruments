// The timpani in 3D (timpani3d.ts): their own model (not the flute, which stood in for them), framed whole on
// every stage — a desktop and a phone held upright — clear of the file player; a stroke brings a mallet down
// onto the head and moves the head, the engine's own strokes driving both; drawn without one WebGL error or
// warning, alone with the drums sounding and in the Orchestra with strings and two sets of timpani.
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
const pose = (page: Page) => page.evaluate(() => (window as any).__timpani3d?.pose() as { mallets: number[][]; alpha: number[]; pedal: number[]; pointer: number[]; heads: number[] } | null);

test('the timpani in 3D: their own model, the set whole on a desktop and on a phone held upright, under the file player', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.locator('.dim-toggle').click();
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3, null, { timeout: 30_000 });
  // (the flute first: the timpani must not draw as the flute did when it stood in for them)
  await page.evaluate(() => (window as any).__piano.setInstrument('flute'));
  await expect.poll(async () => (await seen(page)).vertices, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  const flute = await seen(page);
  await page.evaluate(() => (window as any).__piano.setInstrument('timpani'));
  await expect.poll(async () => {
    const v = await seen(page);
    return !!v.home?.whole && v.box !== null && v.vertices > 400_000 && v.vertices !== flute.vertices && v.home.dist !== flute.home!.dist;
  }, { timeout: 15_000 }).toBe(true);
  expect(await page.evaluate(() => !!(window as any).__timpani3d)).toBe(true);
  await page.waitForTimeout(300);
  const v = await seen(page);
  const b = v.box!;
  const name = `timpani (${info.project.name})`;
  expect(b.x0, `${name}: left`).toBeGreaterThanOrEqual(0);
  expect(b.x1, `${name}: right`).toBeLessThanOrEqual(v.w);
  expect(b.y1, `${name}: bottom`).toBeLessThanOrEqual(v.h);
  expect(b.y0, `${name}: top, under the file player`).toBeGreaterThanOrEqual(v.over);
  // as large as the free stage allows on its binding side
  const free = Math.max((b.y1 - b.y0) / (v.h - v.over), (b.x1 - b.x0) / v.w);
  expect(free).toBeGreaterThan(0.8);
  test.info().annotations.push({ type: 'timpani framing', description: JSON.stringify({ height: (b.y1 - b.y0) / (v.h - v.over), width: (b.x1 - b.x0) / v.w }) });
  expect(errors).toEqual([]);
});

test('the timpani in 3D: a stroke brings a mallet onto the head and moves it, the pedal and the gauge at the drum’s note', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
  await page.locator('.dim-toggle').click();
  await page.evaluate(() => (window as any).__piano.setInstrument('timpani'));
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3 && (window as any).__timpani3d?.pose());
  const rest = (await pose(page))!;
  expect(Math.max(...rest.heads)).toBeLessThan(1e-4);
  // a loud stroke on the low drum (D2): within a few frames a mallet has struck (its lift dipped to the
  // head) and the head moves by centimetres (exaggerated), then rings down
  await page.evaluate(() => (window as any).__piano.noteOn(38, 120, 'keys'));
  const seenPose = await page.evaluate(async () => {
    let minLift = 9;
    let head = 0;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const p = (window as any).__timpani3d.pose();
      minLift = Math.min(minLift, ...p.alpha);
      head = Math.max(head, p.heads[0]);
    }
    return { minLift, head };
  });
  expect(seenPose.head).toBeGreaterThan(0.004);
  // (the stroke's contact is a few milliseconds: the lift is caught low on its way back up)
  expect(seenPose.minLift).toBeLessThan(0.15);
  // the pointer of the low drum's gauge at its note, and its pedal at the travel for it
  const p = (await pose(page))!;
  expect(p.pointer[0]).toBeGreaterThan(-0.7);
  expect(p.pointer[0]).toBeLessThan(0.7);
  await page.evaluate(() => (window as any).__piano.noteOff(38, 'keys'));
  expect(errors).toEqual([]);
});

test('the timpani in 3D draw without one WebGL warning, alone (sounding) and in the Orchestra with strings and two sets', async ({ page }, info) => {
  const errors = collectErrors(page);
  const gl = collectGl(page);
  await page.goto('/');
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  await page.evaluate(async () => {
    await (window as any).__piano.setInstrument('timpani');
    (window as any).__piano.noteOn(43, 110, 'keys');
  });
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
  expect(await glErrors(page, 30), 'timpani').toBe(0);
  await page.evaluate(() => (window as any).__piano.noteOff(43, 'keys'));
  // the Orchestra: strings in front, two sets of timpani behind them
  await page.locator('.ens-toggle').click();
  await page.evaluate(() => (window as any).__orchestra.ensemble.setLineup(['violin', 'violin', 'viola', 'cello', 'timpani', 'timpani']));
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.lineup.join())).toBe('violin,violin,viola,cello,timpani,timpani');
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
