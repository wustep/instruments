// Beethoven's Fifth in the Orchestra: the preset (its address) seats the symphony's eighteen instruments on a
// computer and a phone, its play icon plays the first movement on them (Mutopia's file, public domain), each
// wind staff divided between its two players (never a chord asked of one), the horns' and trumpets' staves
// (both "english horn", GM 69) on the horns and the trumpets, and the address stays the preset.
import { test, expect, type Page } from '@playwright/test';
import { SYMPHONY } from '../apps/web/test/presets.ts';

const ORCHESTRA = ['flute', 'flute', 'oboe', 'oboe', 'clarinet', 'clarinet', 'bassoon', 'bassoon', 'horn', 'horn', 'trumpet', 'trumpet', 'timpani', 'violin', 'violin', 'viola', 'cello', 'bass'];
const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};
const path = (page: Page) => {
  const u = new URL(page.url());
  return decodeURI(u.pathname + u.search);
};
const ens = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    return { lineup: e.lineup as string[], engines: e.parts.filter((p: any) => p.engine).length as number, piece: (e.piece?.id ?? null) as string | null, kinds: e.parts.map((p: any) => p.engine?.instrument ?? null) as (string | null)[] };
  });

test('Beethoven’s Fifth: the preset seats the eighteen, plays the first movement on them, each wind pair divided, and stays in the address', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(SYMPHONY);
  // seated as the address says, a phone too (no file yet, no engines until the sound starts)
  expect((await ens(page)).lineup).toEqual(ORCHESTRA);
  for (const name of ['Flute', 'Oboe', 'Clarinet', 'Bassoon', 'Horn', 'Trumpet', 'Violin']) await expect(page.locator(`.pick[aria-label="${name}"] .pick-n`), name).toHaveText('×2');
  await expect(page.locator('.pick[aria-label="Timpani"] .pick-n')).toHaveText('');
  // its play icon: the symphony's first movement
  const play = page.locator('.player').getByRole('button', { name: 'Play Beethoven, Symphony No. 5, I' });
  await expect(play).toBeVisible();
  await play.click();
  await expect.poll(async () => (await ens(page)).engines, { timeout: 30_000 }).toBe(18);
  const s = await ens(page);
  expect(s.piece).toBe('beethoven5-i');
  expect(s.kinds).toEqual(ORCHESTRA);
  // the staves on their instruments: "five" (the horns) and "six" (the trumpets), both GM 69, by name
  await expect(page.locator('.pl-line')).toHaveCount(12);
  expect(await page.locator('.pl-line').evaluateAll((els) => els.map((b) => b.getAttribute('data-voices')))).toEqual(['flute flute', 'oboe oboe', 'clarinet clarinet', 'bassoon bassoon', 'horn horn', 'trumpet trumpet', 'timpani', 'violin', 'violin', 'viola', 'cello', 'bass']);
  // every note each engine is sent, from here on; then on to bar 17, where the clarinets' chords begin
  await page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    const sent: [number, number, number][] = [];
    (window as any).__sent = sent;
    e.parts.forEach((p: any, k: number) => {
      const on = p.engine.noteOn.bind(p.engine);
      p.engine.noteOn = (m: number, v: number, at?: number) => {
        sent.push([k, m, at ?? -1]);
        return on(m, v, at);
      };
    });
    (window as any).__player.seek(8.8);
  });
  // (bar 18 at half note = 108: 9.4 s; its first chord, and some after it)
  await expect.poll(() => page.evaluate(() => ((window as any).__sent as [number, number, number][]).filter(([k, , at]) => k === 5 && at > 0).length), { timeout: 20_000 }).toBeGreaterThan(4);
  const sent = await page.evaluate(() => (window as any).__sent as [number, number, number][]);
  // a wind player is never sent two notes at once
  for (let k = 0; k < 12; k++) {
    const ats = sent.filter(([p]) => p === k).map(([, , at]) => at);
    expect(new Set(ats).size, `${ORCHESTRA[k]} ${k}: one note at a time`).toBe(ats.length);
  }
  // the pair's chords: the first clarinet the top note, the second the one under it
  const first = new Map(sent.filter(([k]) => k === 4).map(([, m, at]) => [at, m]));
  const both = sent.filter(([k, , at]) => k === 5 && first.has(at));
  expect(both.length).toBeGreaterThan(2);
  for (const [, m, at] of both) expect(first.get(at)!).toBeGreaterThanOrEqual(m);
  expect(both.some(([, m, at]) => first.get(at)! > m), 'a chord divided').toBe(true);
  // every instrument sounding by now but the horns and trumpets (who wait for bar 22) and the timpani
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.filter((p: any) => p.down.size > 0 || p.lastOn > 0).length), { timeout: 10_000 }).toBeGreaterThanOrEqual(12);
  // the address is still the preset (the piece writes the same one)
  await expect.poll(() => path(page).startsWith(SYMPHONY), { timeout: 5000 }).toBe(true);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('Beethoven’s Fifth: both movements are in the pieces menu, its lineup fits the menu, the second plays on the same orchestra', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/orchestra');
  await page.locator('.score-btn').click();
  const menu = page.locator('.score-menu');
  // (six of Mutopia's, and the page's own Toward Morning, Everything So Far and Pass It On after them)
  await expect(menu.locator('.sm-item')).toHaveCount(9);
  const items = menu.locator('.sm-item');
  await expect(items.nth(4)).toHaveAttribute('aria-label', /^Beethoven, Symphony No\. 5, I: flute, flute, oboe, oboe, clarinet, clarinet, bassoon, bassoon, horn, horn, trumpet, trumpet, timpani, violin, violin, viola, cello, double bass$/);
  // (each kind once, with its count: the row fits the menu)
  for (const i of [4, 5]) {
    const row = await items.nth(i).locator('.sm-lineup').boundingBox();
    const m = await menu.boundingBox();
    expect(row!.x + row!.width, `item ${i}`).toBeLessThanOrEqual(m!.x + m!.width);
    await expect(items.nth(i).locator('.sm-n')).toHaveCount(7);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await items.nth(5).click();
  await expect.poll(async () => (await ens(page)).engines, { timeout: 30_000 }).toBe(18);
  expect((await ens(page)).piece).toBe('beethoven5-ii');
  // (the address is written as the setup settles)
  await expect.poll(() => path(page).startsWith(SYMPHONY), { timeout: 5000 }).toBe(true);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});
