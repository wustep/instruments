// /seeds: the address of "Seeds" (Fable 5.2, CC0; orchestra/seeds.ts), a piece with no file and no end: ten
// players, each a phrase and a loop of its own length, made as it plays from a word, the seed, which the
// address carries. It opens the ten in their seats with the piece ready and nothing playing (no sound is asked
// for before a gesture); play plays it, every line on its own engine, the player asking for half a minute of it
// at a time. Where a file has its hairline and its hairpin, Seeds has one icon, another seed. The same seed is
// the same music (here and in the page's own source); /seeds alone takes a new one. Paused, the address says
// where (&at=): a moment of it. Reorganised, the address is the Orchestra's, as any piece's. (Left to play for a long time: scripts/seeds-soak.mjs.)
import { test, expect, type Page } from '@playwright/test';
import { TEN } from '../apps/web/test/presets.ts';
import { seedsEvents, seedsSystem } from '../apps/web/src/orchestra/seeds.ts';

const SEATS = ['flute', 'clarinet', 'horn', 'glockenspiel', 'harp', 'grand', 'violin', 'viola', 'cello', 'bass'];

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
      endless: pl.loaded?.duration === Infinity,
      seed: (pl.seed ?? null) as string | null,
      list: pl.scheduled.length as number,
      last: (pl.scheduled.length ? pl.scheduled[pl.scheduled.length - 1].t : 0) as number,
      first: (pl.scheduled.length ? pl.scheduled[0].t : 0) as number,
      playing: pl.playing as boolean,
      audio: document.documentElement.dataset.audio,
      chips: document.querySelectorAll('.pl-lines .pl-line').length,
    };
  });
/** the piece on its ten, ready */
const cued = async (page: Page) => {
  await expect.poll(async () => (await state(page)).piece, { timeout: 20_000 }).toBe('seeds');
  await expect.poll(async () => (await state(page)).chips).toBe(10);
};

test('/seeds opens the ten with Seeds ready from the address’s seed, silent until play; play plays every line on its own engine, asked for as it goes; one icon where a file has its hairline: another seed', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  const res = await page.goto('/seeds?seed=kelumo');
  expect(res!.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('data-route', 'stage');
  await cued(page);
  let s = await state(page);
  expect(s.active).toBe(true);
  expect(s.lineup).toEqual(SEATS);
  expect(s.lines).toEqual(SEATS.map((_, i) => [i]));
  expect(s.loaded).toBe(true);
  expect(s.endless).toBe(true);
  expect(s.seed).toBe('kelumo');
  // nothing pressed: nothing plays, no sound was asked for, and nothing of the piece has been asked for yet
  expect(s.playing).toBe(false);
  expect(s.audio).toBe('idle');
  expect(s.engines).toBe(0);
  expect(s.list).toBe(0);
  await expect.poll(() => path(page)).toMatch(/^\/seeds\?seed=kelumo&view=(2d|vector|3d)&expr=(on|off)$/);
  const play = page.locator('.player .pl-play');
  await expect(play).toHaveAttribute('aria-label', 'Play Fable 5.2, Seeds');
  await expect(play).toHaveAttribute('data-tip', 'play · Fable 5.2, Seeds');
  expect(await page.locator('.pl-lines .pl-line').evaluateAll((cs) => cs.map((c) => (c as HTMLElement).dataset.voice))).toEqual(SEATS);
  // no place in it to show and no flat lines to phrase: no hairline, no hairpin; one icon, named and tipped
  await expect(page.locator('.player .pl-bar')).toBeHidden();
  await expect(page.locator('.player .pl-expr')).toBeHidden();
  const seed = page.locator('.player .pl-seed');
  await expect(seed).toBeVisible();
  await expect(seed).toHaveAttribute('aria-label', 'Another seed (this one: kelumo)');
  await expect(seed).toHaveAttribute('data-tip', 'another seed · this one: kelumo');
  expect((await seed.innerText()).trim()).toBe('');
  // the same seed is the same music: the page's first minute is the source's, event for event
  const want = seedsEvents(seedsSystem('kelumo'), 0, 60);
  const got = await page.evaluate(() => (window as any).__player.loaded.stream.events(0, 60));
  expect(got.length).toBeGreaterThan(200);
  expect(got).toEqual(JSON.parse(JSON.stringify(want)));
  // play: the ten engines, the piece from its beginning (its first note at once)
  await play.click();
  await expect.poll(async () => (await state(page)).engines, { timeout: 90_000 }).toBe(10);
  await expect.poll(async () => (await state(page)).playing).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-audio', 'running');
  await expect.poll(async () => (await state(page)).played, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
  // the list is what has been asked for: a minute of it, not the piece
  s = await state(page);
  expect(s.list).toBeGreaterThan(100);
  expect(s.last).toBeGreaterThan(30);
  expect(s.last).toBeLessThan(70);
  // a quarter of an hour in (anywhere in it can be asked for; here six of the ten come in within five
  // seconds): they play, and the list is still about a minute long, beginning a little before where it plays
  await page.evaluate(() => (window as any).__player.seek(915.5));
  await expect.poll(async () => (await state(page)).played, { timeout: 60_000 }).toBeGreaterThanOrEqual(5);
  s = await state(page);
  expect(s.first).toBeGreaterThanOrEqual(895);
  expect(s.last).toBeLessThan(1040);
  expect(s.list).toBeLessThan(6000);
  // (heard: the room's level is up, and the limiter is not working hard)
  const level = await page.evaluate(async () => {
    const a = (window as any).__piano;
    const d = new Float32Array(a.analyser.fftSize);
    let most = 0;
    for (let k = 0; k < 30 && most < 0.004; k++) {
      a.analyser.getFloatTimeDomainData(d);
      most = Math.max(most, Math.sqrt(d.reduce((q: number, v: number) => q + v * v, 0) / d.length));
      await new Promise((r) => setTimeout(r, 100));
    }
    return most;
  });
  expect(level).toBeGreaterThan(0.002);
  expect(level).toBeLessThan(0.7);
  expect(path(page)).toMatch(/^\/seeds\?seed=kelumo&view=/);
  // paused, the address says where: a moment of it, and a reload opens there, silent
  await page.evaluate(() => (window as any).__player.pause());
  await expect.poll(() => path(page)).toMatch(/^\/seeds\?seed=kelumo&at=9[12]\d&view=(2d|vector|3d)&expr=(on|off)$/);
  const moment = path(page);
  const at = Number(/at=(\d+)/.exec(moment)![1]);
  await page.reload();
  await cued(page);
  s = await state(page);
  expect(s.playing).toBe(false);
  expect(s.engines).toBe(0);
  expect(await page.evaluate(() => (window as any).__player.position)).toBe(at);
  await expect.poll(() => path(page)).toBe(moment);
  // played on from there, the address is the seed's again
  await page.locator('.player .pl-play').click();
  await expect.poll(async () => (await state(page)).playing, { timeout: 90_000 }).toBe(true);
  await expect.poll(() => path(page)).toMatch(/^\/seeds\?seed=kelumo&view=/);
  expect((await state(page)).first).toBeGreaterThanOrEqual(at - 20);
  // stop lets go of everything it held
  await page.evaluate(() => (window as any).__player.stop());
  expect(await page.evaluate(() => (window as any).__orchestra.ensemble.parts.reduce((n: number, p: any) => n + p.down.size, 0))).toBe(0);
  expect(errors).toEqual([]);
});

test('another seed is one tap: the address follows and a reload keeps it; /seeds alone takes a new one; back and forward walk the seeds; reorganised, the address is the Orchestra’s; the ten’s play icon plays Seeds', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await page.goto('/seeds?seed=kelumo&view=2d');
  await cued(page);
  await expect.poll(() => path(page)).toBe('/seeds?seed=kelumo&view=2d&expr=on');
  // another seed: a new word, six letters that can be said; the piece is another, still ready, still silent
  const btn = page.locator('.player .pl-seed');
  await btn.click();
  await expect.poll(async () => (await state(page)).seed).not.toBe('kelumo');
  const second = (await state(page)).seed!;
  expect(second).toMatch(/^([bdfghklmnprstvwz][aeiou]){3}$/);
  await expect.poll(() => path(page)).toBe(`/seeds?seed=${second}&view=2d&expr=on`);
  await expect(btn).toHaveAttribute('aria-label', `Another seed (this one: ${second})`);
  let s = await state(page);
  expect(s.piece).toBe('seeds');
  expect(s.playing).toBe(false);
  expect(s.lineup).toEqual(SEATS);
  const firstNotes = (seed: string) =>
    seedsEvents(seedsSystem(seed), 0, 40)
      .filter((e) => e.kind === 'on')
      .map((e) => (e.kind === 'on' ? `${e.line}:${e.midi}@${e.t.toFixed(3)}` : ''));
  expect(await page.evaluate(() => (window as any).__player.loaded.stream.events(0, 40).filter((e: any) => e.kind === 'on').map((e: any) => `${e.line}:${e.midi}@${e.t.toFixed(3)}`))).toEqual(firstNotes(second));
  expect(firstNotes(second)).not.toEqual(firstNotes('kelumo'));
  // a reload: the same seed, the same piece
  await page.reload();
  await cued(page);
  expect((await state(page)).seed).toBe(second);
  await expect.poll(() => path(page)).toBe(`/seeds?seed=${second}&view=2d&expr=on`);
  // /seeds alone: a new seed, written into the address
  await page.goto('/seeds?view=2d');
  await cued(page);
  await expect.poll(() => path(page)).toMatch(/^\/seeds\?seed=([bdfghklmnprstvwz][aeiou]){3}&view=2d&expr=on$/);
  const third = (await state(page)).seed!;
  expect(path(page)).toBe(`/seeds?seed=${third}&view=2d&expr=on`);
  // back: the seed before, grown again
  await page.goBack();
  await cued(page);
  await expect.poll(async () => (await state(page)).seed).toBe(second);
  await expect.poll(() => path(page)).toBe(`/seeds?seed=${second}&view=2d&expr=on`);
  // to the notes and back: still there (the page was not loaded again); the notes name it and link its address
  await page.evaluate(() => ((window as any).__mark = 1));
  await page.locator('nav.links').getByRole('link', { name: 'notes' }).click();
  await expect.poll(() => path(page)).toBe('/notes');
  const item = page.locator('.notes li', { hasText: 'Seeds, a piece with no end' }).first();
  await expect(item).toContainText('Fable 5.2, Seeds');
  await expect(item).toContainText('CC0 1.0');
  await expect(page.locator('.notes a[href="/seeds"]')).toHaveText('Seeds');
  await page.goBack();
  await expect.poll(() => path(page)).toBe(`/seeds?seed=${second}&view=2d&expr=on`);
  expect(await page.evaluate(() => (window as any).__mark)).toBe(1);
  await cued(page);
  // an instrument taken off the stage: the address is the Orchestra's own, nine seats, no seed
  await page.evaluate(() => (window as any).__orchestra.ensemble.removePart(3));
  await expect.poll(() => path(page)).toMatch(/^\/orchestra\?v=1&seats=flute,clarinet,horn,harp,grand,violin,viola,cello,bass&lines=Flute~73:1,.*Glockenspiel~9:-,/);
  expect(path(page)).not.toMatch(/seed=/);
  // the ten seats as the Orchestra's address (nothing loaded): the play icon is Seeds', from a new seed
  await page.goto(TEN);
  await expect.poll(async () => (await state(page)).lineup).toEqual(SEATS);
  expect((await state(page)).loaded).toBe(false);
  const play = page.locator('.player .pl-play');
  await expect(play).toHaveAttribute('aria-label', 'Play Fable 5.2, Seeds');
  await play.click();
  await expect.poll(async () => (await state(page)).piece, { timeout: 30_000 }).toBe('seeds');
  await expect.poll(async () => (await state(page)).playing, { timeout: 90_000 }).toBe(true);
  s = await state(page);
  expect(s.lines).toEqual(SEATS.map((_, i) => [i]));
  expect(s.seed).toMatch(/^([bdfghklmnprstvwz][aeiou]){3}$/);
  // another seed while it plays: it plays on, from the new one's beginning
  const playing = s.seed;
  await page.locator('.player .pl-seed').click();
  await expect.poll(async () => (await state(page)).seed).not.toBe(playing);
  await expect.poll(async () => (await state(page)).playing, { timeout: 30_000 }).toBe(true);
  await page.evaluate(() => (window as any).__player.stop());
  // the pieces menu: the last of them, with its instruments
  await page.locator('.player .pl-pieces').click();
  const last = page.locator('.score-menu .sm-item').last();
  await expect(last).toHaveAttribute('data-piece', 'seeds');
  await expect(last).toContainText('Fable 5.2');
  await expect(last).toContainText('Seeds');
  expect(errors).toEqual([]);
});

test('/seeds in 3D, in 2D and in vector lines: the ten on the stage, every one drawn, nothing wider than the window', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/seeds?seed=kelumo&view=3d');
  await cued(page);
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 5, null, { timeout: 60_000 });
  await page.waitForTimeout(900);
  const v = await page.evaluate(() => {
    const s = (window as any).__stage3d;
    const cv = s.el.getBoundingClientRect();
    const b = s.box() as { x0: number; y0: number; x1: number; y1: number };
    return { box: { x0: cv.left + b.x0, x1: cv.left + b.x1, y0: cv.top + b.y0, y1: cv.top + b.y1 }, stage: { left: cv.left, right: cv.right, bottom: cv.bottom }, strip: document.querySelector('.pl-lines')!.getBoundingClientRect().bottom, seats: (s.seats() as ({ x: number; y: number } | [number, number] | null)[]).length, scroll: document.documentElement.scrollWidth };
  });
  expect(v.seats).toBe(10);
  expect(v.box.y0, 'the back row under the player’s lines').toBeGreaterThanOrEqual(v.strip);
  expect(v.box.y1).toBeLessThanOrEqual(v.stage.bottom);
  expect(v.box.x0).toBeGreaterThanOrEqual(v.stage.left);
  expect(v.box.x1).toBeLessThanOrEqual(v.stage.right);
  expect(v.scroll).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(path(page)).toBe('/seeds?seed=kelumo&view=3d&expr=on');
  for (const view of ['2d', 'vector']) {
    await page.goto(`/seeds?seed=kelumo&view=${view}`);
    await cued(page);
    await page.waitForFunction(() => (window as any).__ens2d?.().length === 10 && (window as any).__ens2d().every(Boolean), null, { timeout: 30_000 });
    const cells = (await page.evaluate(() => (window as any).__ens2d())) as { voice: string; cell: { x: number; y: number; w: number; h: number } }[];
    expect(cells.map((c) => c.voice), view).toEqual(SEATS);
    for (const c of cells) {
      expect(c.cell.w, `${view} ${c.voice}`).toBeGreaterThan(4);
      expect(c.cell.h, `${view} ${c.voice}`).toBeGreaterThan(4);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), view).toBe(true);
  }
  test.info().annotations.push({ type: `seeds 3D ${info.project.name}`, description: JSON.stringify({ top: v.box.y0, strip: v.strip }) });
  expect(errors).toEqual([]);
});
