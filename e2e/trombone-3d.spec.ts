// The trombone in 3D (trombone3d.ts): its own model (not the trumpet's, which stood in for it), framed whole on
// every stage — a desktop and a phone held upright — clear of the file player, the slide's travel framed with
// it (to fifth position on a wide stage, all the way on a phone); a note moves the outer slide to its
// position and turns the F valve's rotor (C2: the F attachment in sixth position); drawn without one WebGL
// error or warning, alone with a note sounding and seated in the Orchestra (Bach's Air: four trombones, each
// its line's size; and among winds and strings).
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
/** what the stage shows: every vertex the framing counts, projected (px of the canvas), and how far down the
 *  file player's row reaches over it */
const seen = (page: Page) =>
  page.evaluate(() => {
    const s = (window as any).__stage3d;
    const cv = s.el.getBoundingClientRect();
    return { box: s.box() as { x0: number; y0: number; x1: number; y1: number } | null, w: cv.width, h: cv.height, over: document.querySelector('.player .pl-row')!.getBoundingClientRect().bottom - cv.top, home: s.home as { yaw: number; dist: number; whole?: boolean } | null, vertices: s.stats.vertices as number };
  });
const slide = (page: Page) => page.evaluate(() => (window as any).__trombone3d?.slide() as number | null);
/** the engine's own last frame: its slide (m: where its player put it, by ear), the valves down */
const engine = (page: Page) => page.evaluate(() => (window as any).__trombone3d?.engine() as { slide: number; target: number; valves: number[] } | null);
/** the drawn slide caught up with the engine's, and the engine's out past `min` (m) */
const settled = async (page: Page, min: number) => {
  const e = await engine(page);
  const s = await slide(page);
  return !!e && s !== null && e.slide > min && Math.abs(s - e.slide) < 0.005;
};
const start = async (page: Page) => {
  await page.goto('/');
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
  await page.locator('.dim-toggle').click();
};

test('the trombone in 3D: its own model, whole on a desktop and on a phone held upright, under the file player, its slide’s travel framed with it', async ({ page }, info) => {
  const errors = collectErrors(page);
  await start(page);
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3, null, { timeout: 30_000 });
  // (the trumpet first: the trombone must not draw as the trumpet did when it stood in for it)
  await page.evaluate(() => (window as any).__piano.setInstrument('trumpet'));
  await expect.poll(async () => (await seen(page)).vertices, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  const trumpet = await seen(page);
  await page.evaluate(() => (window as any).__piano.setInstrument('trombone'));
  await expect.poll(async () => {
    const v = await seen(page);
    return !!v.home?.whole && v.box !== null && v.vertices > 400_000 && v.vertices !== trumpet.vertices && v.home.dist !== trumpet.home!.dist;
  }, { timeout: 15_000 }).toBe(true);
  expect(await page.evaluate(() => (window as any).__trombone3d?.size)).toBe('tenor');
  const phone = info.project.name === 'phone';
  const inside = (v: Awaited<ReturnType<typeof seen>>, what: string) => {
    const b = v.box!;
    expect(b.x0, `${what}: left`).toBeGreaterThanOrEqual(0);
    expect(b.x1, `${what}: right`).toBeLessThanOrEqual(v.w);
    expect(b.y1, `${what}: bottom`).toBeLessThanOrEqual(v.h);
    expect(b.y0, `${what}: top, under the file player`).toBeGreaterThanOrEqual(v.over);
  };
  await page.waitForTimeout(300);
  inside(await seen(page), `trombone at rest (${info.project.name})`);
  // the slide out as far as the stage frames it (a phone: C2, the F attachment's sixth position, the chart's
  // 0.61 m; a desktop: B♭2, fifth on the slide alone, 0.36 m; the engine's player a little short of either):
  // still whole, and as large as the free stage allows
  const [note, want] = phone ? [36, 0.45] : [42, 0.25];
  await page.evaluate((m) => (window as any).__piano.noteOn(m, 100, 'keys'), note);
  await expect.poll(() => settled(page, want), { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(200);
  const v = await seen(page);
  inside(v, `trombone, slide out (${info.project.name})`);
  const b = v.box!;
  const free = Math.max((b.y1 - b.y0) / (v.h - v.over), (b.x1 - b.x0) / v.w);
  expect(free).toBeGreaterThan(0.8);
  test.info().annotations.push({ type: 'trombone framing', description: JSON.stringify({ height: (b.y1 - b.y0) / (v.h - v.over), width: (b.x1 - b.x0) / v.w }) });
  await page.evaluate((m) => (window as any).__piano.noteOff(m, 'keys'), note);
  expect(errors).toEqual([]);
});

test('the trombone in 3D: a sixth-position note runs the slide out to where the engine has it and turns the F valve; first position brings it back', async ({ page }) => {
  const errors = collectErrors(page);
  await start(page);
  await page.evaluate(() => (window as any).__piano.setInstrument('trombone'));
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3 && (window as any).__trombone3d?.levers());
  const levers = () => page.evaluate(() => (window as any).__trombone3d.levers() as number[]);
  const rotors = () => page.evaluate(() => (window as any).__trombone3d.rotors() as number[]);
  expect(await slide(page)).toBeLessThan(0.01);
  // C2 (MIDI 36): the F attachment, sixth position (the engine's chart: 0.612 m out; its player, by ear, a
  // little short of it): the drawn slide where the engine's is
  await page.evaluate(() => (window as any).__piano.noteOn(36, 100, 'keys'));
  await expect.poll(() => settled(page, 0.45), { timeout: 10_000 }).toBe(true);
  expect((await engine(page))!.valves).toEqual([1]);
  await expect.poll(async () => (await levers())[0], { timeout: 10_000 }).toBeGreaterThan(0.9);
  expect((await rotors())[0]).toBeGreaterThan(85);
  await page.evaluate(() => (window as any).__piano.noteOff(36, 'keys'));
  // B♭2 (MIDI 46): the slide alone, first position: the slide comes home, the valve's lever up
  await page.evaluate(() => (window as any).__piano.noteOn(46, 100, 'keys'));
  await expect.poll(() => slide(page), { timeout: 10_000 }).toBeLessThan(0.03);
  await expect.poll(async () => (await levers())[0], { timeout: 10_000 }).toBeLessThan(0.1);
  await page.evaluate(() => (window as any).__piano.noteOff(46, 'keys'));
  expect(errors).toEqual([]);
});

test('the trombone in 3D draws without one WebGL warning, alone (a note sounding) and seated in the Orchestra (Bach’s Air; among winds and strings)', async ({ page }, info) => {
  const errors = collectErrors(page);
  const gl = collectGl(page);
  await start(page);
  await expect(page.locator('.stage-3d')).toBeVisible();
  await page.evaluate(async () => {
    await (window as any).__piano.setInstrument('trombone');
    (window as any).__piano.noteOn(36, 100, 'keys');
  });
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3);
  expect(await glErrors(page, 30), 'trombone').toBe(0);
  await page.evaluate(() => (window as any).__piano.noteOff(36, 'keys'));
  // the Orchestra: Bach's Air, its four trombones (alto, tenor, tenor, bass)
  await page.locator('.ens-toggle').click();
  await page.evaluate(async () => {
    const o = (window as any).__orchestra;
    await o.loadPiece(o.pieces.findIndex((p: { id: string }) => p.id === 'air'));
  });
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.lineup.join()), { timeout: 15_000 }).toBe('trombone,trombone,trombone,trombone');
  await page.waitForTimeout(1500);
  expect(await glErrors(page, 30), 'the Air').toBe(0);
  const air = await seen(page);
  for (const [k, lim] of [['x0', 0], ['y0', 0]] as const) expect(air.box![k]).toBeGreaterThanOrEqual(lim);
  expect(air.box!.x1).toBeLessThanOrEqual(air.w);
  expect(air.box!.y1).toBeLessThanOrEqual(air.h);
  // two trombones among the winds, strings either side (six: a phone's stage holds no more)
  await page.evaluate(() => (window as any).__orchestra.ensemble.setLineup(['violin', 'clarinet', 'horn', 'trombone', 'trombone', 'cello']));
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.lineup.join())).toBe('violin,clarinet,horn,trombone,trombone,cello');
  await page.waitForTimeout(800);
  expect(await glErrors(page, 30), 'orchestra').toBe(0);
  const v = await seen(page);
  const b = v.box!;
  expect(b.x0).toBeGreaterThanOrEqual(0);
  expect(b.x1).toBeLessThanOrEqual(v.w);
  expect(b.y0).toBeGreaterThanOrEqual(0);
  expect(b.y1).toBeLessThanOrEqual(v.h);
  test.info().annotations.push({ type: `orchestra box (${info.project.name})`, description: JSON.stringify({ air: air.box, mixed: b, w: v.w, h: v.h }) });
  expect(gl, 'WebGL messages on the console').toEqual([]);
  expect(errors).toEqual([]);
});
