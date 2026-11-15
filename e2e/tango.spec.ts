// /tango: the address of "After You" (Fable 5.2, CC0; orchestra/pieces.ts), a tango bundled with the page for
// twelve players: oboe, clarinet, bassoon, horn, trumpet, trombone, a grand, two violins, viola, cello and
// double bass. It opens the twelve in their seats with the piece loaded and nothing playing (no sound is asked
// for before a gesture); play plays it, every line on its own engine. The address stays /tango while the
// orchestra is as the piece brought it, and becomes the Orchestra's own once it is reorganised. The same
// twelve seats reached any other way play it from the play icon. Back and forward keep it; the pieces menu
// and the Notes name it. (The address's own mechanics are /symphony's: symphony.spec.ts.)
import { test, expect, type Page } from '@playwright/test';
import { TWELVE } from '../apps/web/test/presets.ts';

/** the piece's length (s), and a moment in its last strain, where every line plays */
const DUR_LO = 173;
const DUR_HI = 179;
const SEEK_ALL = 140;
const SEATS = ['oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'grand', 'violin', 'violin', 'viola', 'cello', 'bass'];

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' || /webgl|GL_[A-Z_]{4,}|feedback loop|framebuffer/i.test(m.text())) errors.push(`${m.type()}: ${m.text()}`);
  });
  return errors;
};
const path = (page: Page) => {
  const u = new URL(page.url());
  return decodeURI(u.pathname + u.search);
};
const state = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    const pl = (window as any).__player;
    return {
      active: e.active as boolean,
      lineup: e.lineup as string[],
      piece: (e.piece?.id ?? null) as string | null,
      lines: e.plan.lines.map((rs: any[]) => rs.map((r) => r.part)) as number[][],
      engines: e.parts.filter((p: any) => p.engine).length as number,
      played: e.parts.filter((p: any) => p.lastOn > 0).length as number,
      loaded: !!pl.loaded,
      duration: (pl.loaded?.duration ?? 0) as number,
      playing: pl.playing as boolean,
      audio: document.documentElement.dataset.audio,
      chips: document.querySelectorAll('.pl-lines .pl-line').length,
    };
  });
/** the piece on its orchestra, loaded */
const cued = async (page: Page) => {
  await expect.poll(async () => (await state(page)).piece, { timeout: 20_000 }).toBe('after-you');
  await expect.poll(async () => (await state(page)).chips).toBe(12);
};

test('/tango opens After You’s twelve seats with the piece loaded, silent until play; play plays every line on its own engine; the address stays /tango', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  const res = await page.goto('/tango');
  expect(res!.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('data-route', 'stage');
  await cued(page);
  let s = await state(page);
  expect(s.active).toBe(true);
  expect(s.lineup).toEqual(SEATS);
  expect(s.lines).toEqual(SEATS.map((_, i) => [i]));
  expect(s.loaded).toBe(true);
  // (two minutes and fifty-six seconds)
  expect(s.duration).toBeGreaterThan(DUR_LO);
  expect(s.duration).toBeLessThan(DUR_HI);
  // nothing pressed: nothing plays, and no sound was asked for
  expect(s.playing).toBe(false);
  expect(s.audio).toBe('idle');
  expect(s.engines).toBe(0);
  // the address is the piece's own, with the look and the expression as the page has them
  await expect.poll(() => path(page)).toMatch(/^\/tango\?view=(2d|vector|3d)&expr=(on|off)$/);
  // the play icon says whose piece waits; twelve lines, each its instrument
  const play = page.locator('.player .pl-play');
  await expect(play).toHaveAttribute('aria-label', 'Play Fable 5.2, After You');
  await expect(play).toHaveAttribute('data-tip', 'play · Fable 5.2, After You');
  await expect(page.locator('.pl-lines .pl-line')).toHaveCount(12);
  expect(await page.locator('.pl-lines .pl-line').evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.voice))).toEqual(SEATS);
  await expect(page.locator('.pl-lines .pl-line').first()).toHaveAttribute('aria-label', 'Oboe: oboe. Change its instrument');
  // play: the twelve engines, the piece from its start (the piano begins it, alone)
  await play.click();
  await expect.poll(async () => (await state(page)).engines, { timeout: 90_000 }).toBe(12);
  await expect.poll(async () => (await state(page)).playing).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-audio', 'running');
  await expect.poll(async () => (await state(page)).played, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  // the last strain, where the couples move together and everyone plays: every line reaches its own seat
  await page.evaluate((t) => (window as any).__player.seek(t), SEEK_ALL);
  await expect.poll(async () => (await state(page)).played, { timeout: 30_000 }).toBe(12);
  // (heard: the room's level is up, and the limiter is not working hard)
  const level = await page.evaluate(() => {
    const a = (window as any).__piano;
    const d = new Float32Array(a.analyser.fftSize);
    a.analyser.getFloatTimeDomainData(d);
    return Math.sqrt(d.reduce((q: number, v: number) => q + v * v, 0) / d.length);
  });
  expect(level).toBeGreaterThan(0.002);
  expect(level).toBeLessThan(0.7);
  expect(path(page)).toMatch(/^\/tango\?/);
  s = await state(page);
  expect(s.piece).toBe('after-you');
  await page.evaluate(() => (window as any).__player.stop());
  expect(errors).toEqual([]);
});

test('/tango is kept by a reload and by back and forward; reorganised, the address is the Orchestra’s; the twelve seats’ play icon plays the piece', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = collectErrors(page);
  await page.goto('/tango?view=2d');
  await cued(page);
  await expect.poll(() => path(page)).toBe('/tango?view=2d&expr=on');
  // to the notes and back: the piece is still loaded on its orchestra (the page was not loaded again)
  await page.evaluate(() => ((window as any).__mark = 1));
  await page.locator('nav.links').getByRole('link', { name: 'notes' }).click();
  await expect.poll(() => path(page)).toBe('/notes');
  // the notes name it, with its licence, and link its address
  const item = page.locator('.notes li', { hasText: 'After You' }).first();
  await expect(item).toContainText('Fable 5.2, After You');
  await expect(item).toContainText('CC0 1.0');
  await expect(page.locator('.notes a[href="/tango"]')).toHaveText('After You');
  await page.goBack();
  await expect.poll(() => path(page)).toBe('/tango?view=2d&expr=on');
  expect(await page.evaluate(() => (window as any).__mark)).toBe(1);
  await cued(page);
  expect((await state(page)).lineup).toEqual(SEATS);
  // a reload: the same
  await page.reload();
  await cued(page);
  await expect.poll(() => path(page)).toBe('/tango?view=2d&expr=on');
  expect((await state(page)).playing).toBe(false);
  // another piece's address and back: each its own orchestra, its own piece
  await page.goto('/everything?view=2d');
  await expect.poll(async () => (await state(page)).piece, { timeout: 20_000 }).toBe('everything-so-far');
  await page.goBack();
  await cued(page);
  await expect.poll(() => path(page)).toBe('/tango?view=2d&expr=on');
  expect((await state(page)).lineup).toEqual(SEATS);
  // an instrument taken off the stage: the address is the Orchestra's own, eleven seats and their lines
  await page.evaluate(() => (window as any).__orchestra.ensemble.removePart(4));
  await expect.poll(() => path(page)).toMatch(/^\/orchestra\?v=1&seats=oboe,clarinet,bassoon,horn,trombone,grand,violin,violin,viola,cello,bass&lines=Oboe~68:1,.*Trumpet~56:-,/);
  // the twelve seats as the Orchestra's address (nothing loaded): the play icon is the piece's
  await page.goto(TWELVE);
  await expect.poll(async () => (await state(page)).lineup).toEqual(SEATS);
  expect((await state(page)).loaded).toBe(false);
  const play = page.locator('.player .pl-play');
  await expect(play).toHaveAttribute('aria-label', 'Play Fable 5.2, After You');
  await play.click();
  await expect.poll(async () => (await state(page)).piece, { timeout: 30_000 }).toBe('after-you');
  await expect.poll(async () => (await state(page)).playing, { timeout: 90_000 }).toBe(true);
  expect((await state(page)).lines).toEqual(SEATS.map((_, i) => [i]));
  await page.evaluate(() => (window as any).__player.stop());
  // the pieces menu: the last of the written ones, with its instruments (Seeds, which has no score, after it)
  await page.locator('.player .pl-pieces').click();
  const last = page.locator('.score-menu .sm-item').nth(9);
  await expect(last).toHaveAttribute('data-piece', 'after-you');
  await expect(last).toContainText('Fable 5.2');
  await expect(last).toContainText('After You');
  await expect(page.locator('.score-menu .sm-credit')).toHaveText('public domain · Mutopia, Fable 5.2');
  const box = (await page.locator('.score-menu').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(errors).toEqual([]);
});

test('/tango in 3D: the twelve on the stage, whole under the player’s lines', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto('/tango?view=3d');
  await cued(page);
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 5, null, { timeout: 60_000 });
  await page.waitForTimeout(900);
  const v = await page.evaluate(() => {
    const s = (window as any).__stage3d;
    const cv = s.el.getBoundingClientRect();
    const b = s.box() as { x0: number; y0: number; x1: number; y1: number };
    const lines = [...document.querySelectorAll('.pl-lines .pl-line')].map((e) => e.getBoundingClientRect());
    return { box: { x0: cv.left + b.x0, x1: cv.left + b.x1, y0: cv.top + b.y0, y1: cv.top + b.y1 }, stage: { left: cv.left, right: cv.right, bottom: cv.bottom }, strip: document.querySelector('.pl-lines')!.getBoundingClientRect().bottom, rows: new Set(lines.map((r) => Math.round(r.top))).size, seats: [...Array(12)].map((_, i) => s.seatScreen(i) as [number, number] | null), scroll: document.documentElement.scrollWidth };
  });
  // (twelve lines: one row on a computer and on a phone; the orchestra is out from under them either way)
  expect(v.rows).toBeLessThanOrEqual(2);
  expect(v.box.y0, 'the back row under the player’s lines').toBeGreaterThanOrEqual(v.strip);
  expect(v.box.y1).toBeLessThanOrEqual(v.stage.bottom);
  expect(v.box.x0).toBeGreaterThanOrEqual(v.stage.left);
  expect(v.box.x1).toBeLessThanOrEqual(v.stage.right);
  expect(v.seats.every((q) => !!q)).toBe(true);
  // the strings in front (lower on the picture) of the woodwinds, the brass behind them
  const y = (i: number) => v.seats[i]![1];
  expect(Math.min(y(7), y(8), y(9), y(10))).toBeGreaterThan(Math.max(y(0), y(1), y(2)));
  expect(Math.min(y(0), y(1), y(2))).toBeGreaterThan(Math.max(y(3), y(4), y(5)));
  expect(v.scroll).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(path(page)).toBe('/tango?view=3d&expr=on');
  test.info().annotations.push({ type: `tango 3D ${info.project.name}`, description: JSON.stringify({ top: v.box.y0, strip: v.strip }) });
  expect(errors).toEqual([]);
});
