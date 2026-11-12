// /symphony: the address of "Toward Morning" (Fable 5.2, CC0; orchestra/pieces.ts), a symphonic
// movement for thirteen players bundled with the page. It opens the thirteen in their seats with the
// piece loaded and nothing playing (no sound is asked for before a gesture); play plays it, every line
// on its own engine. The address stays /symphony while the orchestra is as the piece brought it, and
// becomes the Orchestra's own once it is reorganised. The same thirteen seats reached any other way
// play it from the play icon. Back and forward keep it; the pieces menu and the Notes name it.
import { test, expect, type Page } from '@playwright/test';
import { THIRTEEN } from '../apps/web/test/presets.ts';

const SEATS = ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'timpani', 'violin', 'violin', 'viola', 'cello', 'bass'];

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
  await expect.poll(async () => (await state(page)).piece, { timeout: 20_000 }).toBe('toward-morning');
  await expect.poll(async () => (await state(page)).chips).toBe(13);
};

test('/symphony opens Toward Morning’s thirteen seats with the piece loaded, silent until play; play plays every line on its own engine; the address stays /symphony', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const res = await page.goto('/symphony');
  expect(res!.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('data-route', 'stage');
  await cued(page);
  let s = await state(page);
  expect(s.active).toBe(true);
  expect(s.lineup).toEqual(SEATS);
  expect(s.lines).toEqual(SEATS.map((_, i) => [i]));
  expect(s.loaded).toBe(true);
  expect(Math.round(s.duration)).toBe(261);
  // nothing pressed: nothing plays, and no sound was asked for
  expect(s.playing).toBe(false);
  expect(s.audio).toBe('idle');
  expect(s.engines).toBe(0);
  // the address is the piece's own, with the look and the expression as the page has them
  await expect.poll(() => path(page)).toMatch(/^\/symphony\?view=(2d|vector|3d)&expr=(on|off)$/);
  // the player: play, stop, the line, the hairpin, routing, the pieces, the folder; thirteen lines, each its instrument
  // (the play icon says whose piece waits: its tooltip is the only word of it on the stage)
  const play = page.locator('.player .pl-play');
  await expect(play).toHaveAttribute('aria-label', 'Play Fable 5.2, Toward Morning');
  await expect(play).toHaveAttribute('data-tip', 'play · Fable 5.2, Toward Morning');
  await expect(page.locator('.pl-lines .pl-line')).toHaveCount(13);
  expect(await page.locator('.pl-lines .pl-line').evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.voice))).toEqual(SEATS);
  await expect(page.locator('.pl-lines .pl-line').first()).toHaveAttribute('aria-label', 'Flute: flute. Change its instrument');
  // play: the thirteen engines, the piece from its start
  await play.click();
  await expect.poll(async () => (await state(page)).engines, { timeout: 60_000 }).toBe(13);
  await expect.poll(async () => (await state(page)).playing).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-audio', 'running');
  await expect.poll(async () => (await state(page)).played, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  // its last pages, where everyone plays: every line reaches its own seat
  await page.evaluate(() => (window as any).__player.seek(205));
  await expect.poll(async () => (await state(page)).played, { timeout: 30_000 }).toBe(13);
  // (heard: the room's level is up, and the limiter is not working hard)
  const level = await page.evaluate(() => {
    const a = (window as any).__piano;
    const d = new Float32Array(a.analyser.fftSize);
    a.analyser.getFloatTimeDomainData(d);
    return Math.sqrt(d.reduce((q: number, v: number) => q + v * v, 0) / d.length);
  });
  expect(level).toBeGreaterThan(0.002);
  expect(level).toBeLessThan(0.7);
  expect(path(page)).toMatch(/^\/symphony\?/);
  s = await state(page);
  expect(s.piece).toBe('toward-morning');
  await page.evaluate(() => (window as any).__player.stop());
  expect(errors).toEqual([]);
});

test('/symphony is kept by a reload and by back and forward; reorganised, the address is the Orchestra’s; the thirteen seats’ play icon plays the piece', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/symphony?view=2d');
  await cued(page);
  await expect.poll(() => path(page)).toBe('/symphony?view=2d&expr=on');
  // to the notes and back: the piece is still loaded on its orchestra (the page was not loaded again)
  await page.evaluate(() => ((window as any).__mark = 1));
  await page.locator('nav.links').getByRole('link', { name: 'notes' }).click();
  await expect.poll(() => path(page)).toBe('/notes');
  // the notes name it, with its licence
  const item = page.locator('.notes li', { hasText: 'Toward Morning' }).first();
  await expect(item).toContainText('Fable 5.2, Toward Morning');
  await expect(item).toContainText('CC0 1.0');
  await page.goBack();
  await expect.poll(() => path(page)).toBe('/symphony?view=2d&expr=on');
  expect(await page.evaluate(() => (window as any).__mark)).toBe(1);
  await cued(page);
  expect((await state(page)).lineup).toEqual(SEATS);
  // a reload: the same
  await page.reload();
  await cued(page);
  await expect.poll(() => path(page)).toBe('/symphony?view=2d&expr=on');
  expect((await state(page)).playing).toBe(false);
  // an instrument taken off the stage: the address is the Orchestra's own, twelve seats and their lines
  await page.evaluate(() => (window as any).__orchestra.ensemble.removePart(7));
  await expect.poll(() => path(page)).toMatch(/^\/orchestra\?v=1&seats=flute,oboe,clarinet,bassoon,horn,trumpet,trombone,violin,violin,viola,cello,bass&lines=Flute~73:1,.*Timpani~47:-,/);
  // the thirteen seats as the Orchestra's address (nothing loaded): the play icon is the piece's
  await page.goto(THIRTEEN);
  await expect.poll(async () => (await state(page)).lineup).toEqual(SEATS);
  expect((await state(page)).loaded).toBe(false);
  const play = page.locator('.player .pl-play');
  await expect(play).toHaveAttribute('aria-label', 'Play Fable 5.2, Toward Morning');
  await play.click();
  await expect.poll(async () => (await state(page)).piece, { timeout: 30_000 }).toBe('toward-morning');
  await expect.poll(async () => (await state(page)).playing, { timeout: 60_000 }).toBe(true);
  // (the address is the one it was opened at: the preset's seats and lines; the piece is not in it)
  await page.evaluate(() => (window as any).__player.stop());
  // the pieces menu: after Mutopia's six, the first of the page's own, with its thirteen instruments
  await page.locator('.player .pl-pieces').click();
  const last = page.locator('.score-menu .sm-item').nth(6);
  await expect(last).toHaveAttribute('data-piece', 'toward-morning');
  await expect(last).toContainText('Fable 5.2');
  await expect(last).toContainText('Toward Morning');
  await expect(page.locator('.score-menu .sm-credit')).toHaveText('public domain · Mutopia, Fable 5.2');
  // the menu on the screen, no wider than it
  const box = (await page.locator('.score-menu').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(errors).toEqual([]);
});

test('/symphony left while its file is still coming: the address is its own meanwhile, and the piece is not brought on after all', async ({ page }) => {
  const errors = collectErrors(page);
  // the piece's file held back, as a slow connection would
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/pieces/fable-toward-morning.mid', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/symphony?view=2d');
  await expect.poll(async () => (await state(page)).lineup).toEqual(SEATS);
  // its orchestra is seated, nothing is loaded yet, and the address has not turned into the Orchestra's
  expect((await state(page)).loaded).toBe(false);
  await page.waitForTimeout(600);
  expect(path(page)).toBe('/symphony?view=2d&expr=on');
  // the orchestra left for the one instrument
  await page.locator('.ens-toggle').click();
  await expect.poll(async () => (await state(page)).active).toBe(false);
  await expect.poll(() => path(page)).toBe('/piano');
  // the file arrives: it is dropped
  release();
  await page.waitForTimeout(900);
  const s = await state(page);
  expect(s.active).toBe(false);
  expect(s.piece).toBe(null);
  expect(s.loaded).toBe(false);
  expect(path(page)).toBe('/piano');
  expect(errors).toEqual([]);
});

test('/symphony in 3D: the thirteen on their risers, whole on the stage under the player’s lines (one row on a phone)', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto('/symphony?view=3d');
  await cued(page);
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 5, null, { timeout: 60_000 });
  await page.waitForTimeout(900);
  const v = await page.evaluate(() => {
    const s = (window as any).__stage3d;
    const cv = s.el.getBoundingClientRect();
    const b = s.box() as { x0: number; y0: number; x1: number; y1: number };
    const lines = [...document.querySelectorAll('.pl-lines .pl-line')].map((e) => e.getBoundingClientRect());
    return { box: { x0: cv.left + b.x0, x1: cv.left + b.x1, y0: cv.top + b.y0, y1: cv.top + b.y1 }, stage: { left: cv.left, right: cv.right, bottom: cv.bottom }, strip: document.querySelector('.pl-lines')!.getBoundingClientRect().bottom, rows: new Set(lines.map((r) => Math.round(r.top))).size, seats: [...Array(13)].map((_, i) => s.seatScreen(i) as [number, number] | null), scroll: document.documentElement.scrollWidth };
  });
  expect(v.rows).toBe(1);
  expect(v.box.y0, 'the back row under the player’s lines').toBeGreaterThanOrEqual(v.strip);
  expect(v.box.y1).toBeLessThanOrEqual(v.stage.bottom);
  expect(v.box.x0).toBeGreaterThanOrEqual(v.stage.left);
  expect(v.box.x1).toBeLessThanOrEqual(v.stage.right);
  expect(v.seats.every((q) => !!q)).toBe(true);
  // strings in front (lower on the picture) of the woodwinds, the brass and timpani behind them
  const y = (i: number) => v.seats[i]![1];
  expect(Math.min(y(8), y(9), y(10), y(11))).toBeGreaterThan(Math.max(y(0), y(1), y(2)));
  expect(Math.min(y(0), y(1), y(2), y(3))).toBeGreaterThan(Math.max(y(4), y(5), y(7)));
  expect(v.scroll).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(path(page)).toBe('/symphony?view=3d&expr=on');
  test.info().annotations.push({ type: `symphony 3D ${info.project.name}`, description: JSON.stringify({ top: v.box.y0, strip: v.strip }) });
  expect(errors).toEqual([]);
});
