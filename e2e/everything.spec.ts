// /everything: the address of "Everything So Far" (Fable 5.2, CC0; orchestra/pieces.ts), a movement in 7/8
// for eleven players bundled with the page: flute, clarinet, horn, glockenspiel, harp, a grand, two violins,
// viola, cello and double bass. It opens the eleven in their seats with the piece loaded and nothing playing
// (no sound is asked for before a gesture); play plays it, every line on its own engine. The address stays
// /everything while the orchestra is as the piece brought it, and becomes the Orchestra's own once it is
// reorganised. The same eleven seats reached any other way play it from the play icon. Back and forward keep
// it; the pieces menu and the Notes name it. (The address's own mechanics are /symphony's: symphony.spec.ts.)
import { test, expect, type Page } from '@playwright/test';
import { ELEVEN } from '../apps/web/test/presets.ts';

const SEATS = ['flute', 'clarinet', 'horn', 'glockenspiel', 'harp', 'grand', 'violin', 'violin', 'viola', 'cello', 'bass'];

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
  await expect.poll(async () => (await state(page)).piece, { timeout: 20_000 }).toBe('everything-so-far');
  await expect.poll(async () => (await state(page)).chips).toBe(11);
};

test('/everything opens Everything So Far’s eleven seats with the piece loaded, silent until play; play plays every line on its own engine; the address stays /everything', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const res = await page.goto('/everything');
  expect(res!.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('data-route', 'stage');
  await cued(page);
  let s = await state(page);
  expect(s.active).toBe(true);
  expect(s.lineup).toEqual(SEATS);
  expect(s.lines).toEqual(SEATS.map((_, i) => [i]));
  expect(s.loaded).toBe(true);
  expect(Math.round(s.duration)).toBe(181);
  // nothing pressed: nothing plays, and no sound was asked for
  expect(s.playing).toBe(false);
  expect(s.audio).toBe('idle');
  expect(s.engines).toBe(0);
  // the address is the piece's own, with the look and the expression as the page has them
  await expect.poll(() => path(page)).toMatch(/^\/everything\?view=(2d|vector|3d)&expr=(on|off)$/);
  // the play icon says whose piece waits; eleven lines, each its instrument
  const play = page.locator('.player .pl-play');
  await expect(play).toHaveAttribute('aria-label', 'Play Fable 5.2, Everything So Far');
  await expect(play).toHaveAttribute('data-tip', 'play · Fable 5.2, Everything So Far');
  await expect(page.locator('.pl-lines .pl-line')).toHaveCount(11);
  expect(await page.locator('.pl-lines .pl-line').evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.voice))).toEqual(SEATS);
  await expect(page.locator('.pl-lines .pl-line').first()).toHaveAttribute('aria-label', 'Flute: flute. Change its instrument');
  // play: the eleven engines, the piece from its start (the piano and the cello begin it)
  await play.click();
  await expect.poll(async () => (await state(page)).engines, { timeout: 60_000 }).toBe(11);
  await expect.poll(async () => (await state(page)).playing).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-audio', 'running');
  await expect.poll(async () => (await state(page)).played, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  // the last return to A, where everyone plays: every line reaches its own seat
  await page.evaluate(() => (window as any).__player.seek(118));
  await expect.poll(async () => (await state(page)).played, { timeout: 30_000 }).toBe(11);
  // (heard: the room's level is up, and the limiter is not working hard)
  const level = await page.evaluate(() => {
    const a = (window as any).__piano;
    const d = new Float32Array(a.analyser.fftSize);
    a.analyser.getFloatTimeDomainData(d);
    return Math.sqrt(d.reduce((q: number, v: number) => q + v * v, 0) / d.length);
  });
  expect(level).toBeGreaterThan(0.002);
  expect(level).toBeLessThan(0.7);
  expect(path(page)).toMatch(/^\/everything\?/);
  s = await state(page);
  expect(s.piece).toBe('everything-so-far');
  await page.evaluate(() => (window as any).__player.stop());
  expect(errors).toEqual([]);
});

test('/everything is kept by a reload and by back and forward; reorganised, the address is the Orchestra’s; the eleven seats’ play icon plays the piece', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/everything?view=2d');
  await cued(page);
  await expect.poll(() => path(page)).toBe('/everything?view=2d&expr=on');
  // to the notes and back: the piece is still loaded on its orchestra (the page was not loaded again)
  await page.evaluate(() => ((window as any).__mark = 1));
  await page.locator('nav.links').getByRole('link', { name: 'notes' }).click();
  await expect.poll(() => path(page)).toBe('/notes');
  // the notes name it, with its licence, and link its address
  const item = page.locator('.notes li', { hasText: 'Everything So Far' }).first();
  await expect(item).toContainText('Fable 5.2, Everything So Far');
  await expect(item).toContainText('CC0 1.0');
  await expect(page.locator('.notes a[href="/everything"]')).toHaveText('Everything So Far');
  await page.goBack();
  await expect.poll(() => path(page)).toBe('/everything?view=2d&expr=on');
  expect(await page.evaluate(() => (window as any).__mark)).toBe(1);
  await cued(page);
  expect((await state(page)).lineup).toEqual(SEATS);
  // a reload: the same
  await page.reload();
  await cued(page);
  await expect.poll(() => path(page)).toBe('/everything?view=2d&expr=on');
  expect((await state(page)).playing).toBe(false);
  // the other piece's address and back: each its own orchestra, its own piece
  await page.goto('/symphony?view=2d');
  await expect.poll(async () => (await state(page)).piece, { timeout: 20_000 }).toBe('toward-morning');
  await page.goBack();
  await cued(page);
  await expect.poll(() => path(page)).toBe('/everything?view=2d&expr=on');
  expect((await state(page)).lineup).toEqual(SEATS);
  // an instrument taken off the stage: the address is the Orchestra's own, ten seats and their lines
  await page.evaluate(() => (window as any).__orchestra.ensemble.removePart(3));
  await expect.poll(() => path(page)).toMatch(/^\/orchestra\?v=1&seats=flute,clarinet,horn,harp,grand,violin,violin,viola,cello,bass&lines=Flute~73:1,.*Glockenspiel~9:-,/);
  // the eleven seats as the Orchestra's address (nothing loaded): the play icon is the piece's
  await page.goto(ELEVEN);
  await expect.poll(async () => (await state(page)).lineup).toEqual(SEATS);
  expect((await state(page)).loaded).toBe(false);
  const play = page.locator('.player .pl-play');
  await expect(play).toHaveAttribute('aria-label', 'Play Fable 5.2, Everything So Far');
  await play.click();
  await expect.poll(async () => (await state(page)).piece, { timeout: 30_000 }).toBe('everything-so-far');
  await expect.poll(async () => (await state(page)).playing, { timeout: 60_000 }).toBe(true);
  expect((await state(page)).lines).toEqual(SEATS.map((_, i) => [i]));
  await page.evaluate(() => (window as any).__player.stop());
  // the pieces menu: the last of them, with its instruments
  await page.locator('.player .pl-pieces').click();
  const last = page.locator('.score-menu .sm-item').last();
  await expect(last).toHaveAttribute('data-piece', 'everything-so-far');
  await expect(last).toContainText('Fable 5.2');
  await expect(last).toContainText('Everything So Far');
  await expect(page.locator('.score-menu .sm-credit')).toHaveText('public domain · Mutopia, Fable 5.2');
  const box = (await page.locator('.score-menu').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(errors).toEqual([]);
});

test('/everything in 3D: the eleven on the stage, whole under the player’s lines (one row on a phone)', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto('/everything?view=3d');
  await cued(page);
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 5, null, { timeout: 60_000 });
  await page.waitForTimeout(900);
  const v = await page.evaluate(() => {
    const s = (window as any).__stage3d;
    const cv = s.el.getBoundingClientRect();
    const b = s.box() as { x0: number; y0: number; x1: number; y1: number };
    const lines = [...document.querySelectorAll('.pl-lines .pl-line')].map((e) => e.getBoundingClientRect());
    return { box: { x0: cv.left + b.x0, x1: cv.left + b.x1, y0: cv.top + b.y0, y1: cv.top + b.y1 }, stage: { left: cv.left, right: cv.right, bottom: cv.bottom }, strip: document.querySelector('.pl-lines')!.getBoundingClientRect().bottom, rows: new Set(lines.map((r) => Math.round(r.top))).size, seats: [...Array(11)].map((_, i) => s.seatScreen(i) as [number, number] | null), scroll: document.documentElement.scrollWidth };
  });
  expect(v.rows).toBe(1);
  expect(v.box.y0, 'the back row under the player’s lines').toBeGreaterThanOrEqual(v.strip);
  expect(v.box.y1).toBeLessThanOrEqual(v.stage.bottom);
  expect(v.box.x0).toBeGreaterThanOrEqual(v.stage.left);
  expect(v.box.x1).toBeLessThanOrEqual(v.stage.right);
  expect(v.seats.every((q) => !!q)).toBe(true);
  // the strings in front (lower on the picture) of the flute and the clarinet, the horn behind them
  const y = (i: number) => v.seats[i]![1];
  expect(Math.min(y(6), y(7), y(8), y(9))).toBeGreaterThan(Math.max(y(0), y(1)));
  expect(Math.min(y(0), y(1))).toBeGreaterThan(y(2));
  expect(v.scroll).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(path(page)).toBe('/everything?view=3d&expr=on');
  test.info().annotations.push({ type: `everything 3D ${info.project.name}`, description: JSON.stringify({ top: v.box.y0, strip: v.strip }) });
  expect(errors).toEqual([]);
});
