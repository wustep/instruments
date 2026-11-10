// The double bass in 3D (strings3d.ts, bass3d.ts): framed whole on every stage, the scroll clear of
// the file player and the endpin's tip on the stage; drawn without one WebGL error or warning, alone
// and standing at the end of a string quintet; its varnished top's worn places soft (no speckle), as
// the cello's and the violin's are (app.spec.ts).
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
    return { box: s.box() as { x0: number; y0: number; x1: number; y1: number } | null, w: cv.width, h: cv.height, over: document.querySelector('.player .pl-row')!.getBoundingClientRect().bottom - cv.top, home: s.home as { yaw: number; whole?: boolean } | null };
  });
const whole = (v: Awaited<ReturnType<typeof seen>>, name: string) => {
  const b = v.box!;
  expect(b.x0, `${name}: left`).toBeGreaterThanOrEqual(0);
  expect(b.x1, `${name}: right`).toBeLessThanOrEqual(v.w);
  expect(b.y1, `${name}: bottom`).toBeLessThanOrEqual(v.h);
  expect(b.y0, `${name}: top, under the file player`).toBeGreaterThanOrEqual(v.over);
  return { free: (b.y1 - b.y0) / (v.h - v.over), width: (b.x1 - b.x0) / v.w };
};

test('the double bass in 3D: whole, scroll to endpin, on a desktop and on a phone held upright, as tall as the stage under the file player', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await page.locator('.dim-toggle').click();
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3, null, { timeout: 30_000 });
  await page.evaluate(() => (window as any).__piano.setInstrument('bass'));
  // (its own view: the bass's bearing, framed whole)
  await expect.poll(async () => {
    const v = await seen(page);
    return !!v.home?.whole && Math.abs(v.home.yaw - 0.62) < 0.2 && v.box !== null;
  }, { timeout: 15_000 }).toBe(true);
  await page.waitForTimeout(300);
  const fit = whole(await seen(page), `bass (${info.project.name})`);
  // as tall as the stage allows (it is taller than it is wide on any stage)
  expect(fit.free).toBeGreaterThan(0.9);
  test.info().annotations.push({ type: 'bass framing', description: JSON.stringify(fit) });
  expect(errors).toEqual([]);
});

test('the double bass in 3D draws without one WebGL warning, alone (a note sounding) and at the end of a string quintet, whole', async ({ page }, info) => {
  const errors = collectErrors(page);
  const gl = collectGl(page);
  await page.goto('/');
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  await page.evaluate(async () => {
    await (window as any).__piano.setInstrument('bass');
    (window as any).__piano.noteOn(40, 96, 'keys');
  });
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
  expect(await glErrors(page, 30), 'bass').toBe(0);
  await page.evaluate(() => (window as any).__piano.noteOff(40, 'keys'));
  // the quintet: two violins, viola, cello and the bass, standing at the right end of the arc
  await page.locator('.ens-toggle').click();
  await page.evaluate(() => (window as any).__orchestra.ensemble.setLineup(['violin', 'violin', 'viola', 'cello', 'bass']));
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.lineup.join())).toBe('violin,violin,viola,cello,bass');
  await page.waitForTimeout(800);
  expect(await glErrors(page, 30), 'quintet').toBe(0);
  const v = await seen(page);
  const b = v.box!;
  expect(b.x0).toBeGreaterThanOrEqual(0);
  expect(b.x1).toBeLessThanOrEqual(v.w);
  expect(b.y0).toBeGreaterThanOrEqual(0);
  expect(b.y1).toBeLessThanOrEqual(v.h);
  test.info().annotations.push({ type: `quintet box (${info.project.name})`, description: JSON.stringify({ ...b, w: v.w, h: v.h }) });
  expect(gl, 'WebGL messages on the console').toEqual([]);
  expect(errors).toEqual([]);
});

test('3D varnish: the bass’s worn places are soft, with no speckle', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'a phone draws the same map at half the size');
  const errors = collectErrors(page);
  await page.goto('/');
  await page.locator('.dim-toggle').click();
  await expect(page.locator('.stage-3d')).toBeVisible();
  await page.evaluate(() => (window as any).__piano.setInstrument('bass'));
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
  // the top's painted map (the one with its f-holes cut out); the treble upper bout, where the thumb
  // wears it, measured as app.spec.ts measures the cello's. (The window is the cello's, moved in from
  // the edge: the bass's shoulders slope, so at 15–24 % of its length the plate is only 0.17–0.21 of
  // it wide each side, and the cello's window would take in the purfling. Here: x 0.15–0.24 and z
  // −0.155 … −0.06 body lengths, of a map spanning x −0.06 … 1.04 and z ±0.32.)
  const top = () =>
    page.evaluate(() => {
      let cv: HTMLCanvasElement | null = null;
      (window as any).__stage3d.r3.scene.traverse((o: any) => {
        if (!o.visible) return;
        for (const m of [].concat(o.material ?? []) as any[]) if (m.alphaTest && m.map?.image?.getContext) cv = m.map.image;
      });
      if (!cv) return null;
      const c = cv as HTMLCanvasElement;
      const w = c.width;
      const h = c.height;
      const d = c.getContext('2d')!.getImageData(0, 0, w, h).data;
      const lum = (x: number, y: number) => (d[(y * w + x) * 4] + d[(y * w + x) * 4 + 1] + d[(y * w + x) * 4 + 2]) / 3;
      const v: number[] = [];
      for (let y = Math.round(0.258 * h); y < Math.round(0.406 * h); y++)
        for (let x = Math.round(0.191 * w); x < Math.round(0.273 * w); x++) v.push(Math.abs(lum(x, y) - (lum(x - 6, y) + lum(x + 6, y)) / 2));
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      v.sort((a, b) => a - b);
      return { w, mean, p99: v[Math.floor(v.length * 0.99)] };
    });
  await expect.poll(async () => (await top())?.w ?? 0).toBe(2048);
  const m = (await top())!;
  test.info().annotations.push({ type: 'speckle bass', description: JSON.stringify(m) });
  expect(m.mean).toBeLessThan(0.8);
  expect(m.p99).toBeLessThan(5);
  expect(errors).toEqual([]);
});
