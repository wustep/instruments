// Organising a large lineup in the Orchestra (orchestra/sections.ts, ui/player.ts): Beethoven's Fifth's eighteen
// seats as twelve sections in the routing grid, on a computer and a phone; a section's menu from its row or from
// its instrument tapped on the stage (2D, vector lines, 3D): another instrument, another desk, one fewer, off,
// its lines; the picker adding and taking off without losing the routing; the address following every change,
// and the piece playing on the lineup as it was organised. The presets still read as they did.
import { test, expect, type Page } from '@playwright/test';
import { QUINTET, SYMPHONY } from '../apps/web/test/presets.ts';

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
    return {
      lineup: e.lineup as string[],
      engines: e.parts.filter((p: any) => p.engine).length as number,
      routes: e.plan.lines.map((rs: any[]) => rs.map((r) => r.part)) as number[][],
      players: e.parts.map((p: any) => p.player) as number[],
      sections: e.sections.map((s: any) => s.seats.length) as number[],
      piece: (e.piece?.id ?? null) as string | null,
    };
  });
/** tap (or click) an instrument on the stage, where the stage draws it */
const tapSeat = async (page: Page, k: number, touch: boolean) => {
  await expect.poll(() => page.evaluate((k) => (window as any).__seatAt(k), k), { timeout: 10_000 }).not.toBeNull();
  const [x, y] = (await page.evaluate((k) => (window as any).__seatAt(k), k)) as [number, number];
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
};
const playSymphony = async (page: Page) => {
  await page.locator('.player').getByRole('button', { name: 'Play Beethoven, Symphony No. 5, I' }).click();
};

test('a large lineup: the symphony’s routing by section, twelve rows on the screen; a section’s line, a desk more and fewer, a section off, desk by desk', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = collectErrors(page);
  await page.goto(SYMPHONY);
  await playSymphony(page);
  await expect.poll(async () => (await ens(page)).engines, { timeout: 30_000 }).toBe(18);
  await page.locator('.player').getByRole('button', { name: 'Pause' }).click();
  // the file's lines: a wind staff on its pair (×2)
  await expect(page.locator('.pl-line').first().locator('.pl-more')).toHaveText('×2');
  await page.locator('.pl-route').click();
  const grid = page.locator('.pl-grid');
  await expect(grid).toBeVisible();
  // twelve sections (one per staff), the four families apart, each staff on its section
  await expect(grid.locator('.pg-row:not(.pg-add)')).toHaveCount(12);
  await expect(grid.locator('.pg-gap')).toHaveCount(3);
  await expect(grid.locator('.pg-cell[aria-pressed="true"]:not(.pg-all)')).toHaveCount(12);
  await expect(grid.locator('.pg-row').first()).toHaveAttribute('aria-label', /^flute 1–2:/);
  await expect(grid.locator('.pg-row').first().locator('.pl-more')).toHaveText('×2');
  // the whole grid on the screen, nothing scrolled (in it or sideways)
  const vp = page.viewportSize()!;
  const gb = (await grid.boundingBox())!;
  expect(gb.x).toBeGreaterThanOrEqual(0);
  expect(gb.x + gb.width).toBeLessThanOrEqual(vp.width);
  expect(gb.y + gb.height).toBeLessThanOrEqual(vp.height);
  expect(await grid.evaluate((g) => g.scrollHeight <= g.clientHeight + 1 && g.scrollWidth <= g.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // desk by desk, and back
  await grid.locator('.pg-mode').click();
  await expect(grid.locator('.pg-row:not(.pg-add)')).toHaveCount(18);
  await grid.locator('.pg-mode').click();
  await expect(grid.locator('.pg-row:not(.pg-add)')).toHaveCount(12);
  // a line given to a section reaches both its desks (the flutes on the oboes' staff too), and taken back
  await grid.locator('.pg-cell[data-part="0"][data-line="1"]').click();
  await expect.poll(async () => (await ens(page)).routes[1]).toEqual([0, 1, 2, 3]);
  await grid.locator('.pg-cell[data-part="0"][data-line="1"]').click();
  await expect.poll(async () => (await ens(page)).routes[1]).toEqual([2, 3]);
  // another cello desk from the cellos' row: beside the first, on its staff, a player of its own; the menu stays
  await grid.locator('.pg-row[data-part="16"]').click();
  const menu = page.locator('.pl-menu');
  await expect(menu).toHaveAttribute('aria-label', 'cello');
  await menu.locator('.pl-desk').click();
  await expect(menu).toHaveAttribute('aria-label', 'cello 1–2');
  await expect.poll(async () => (await ens(page)).lineup).toEqual([...ORCHESTRA.slice(0, 17), 'cello', 'bass']);
  const s = await ens(page);
  expect(s.routes[10]).toEqual([16, 17]);
  expect(s.players[17]).toBe(1);
  await expect.poll(async () => (await ens(page)).engines, { timeout: 15_000 }).toBe(19);
  await expect(grid.locator('.pg-row:not(.pg-add)')).toHaveCount(12);
  await expect(grid.locator('.pg-row[data-part="16"] .pl-more')).toHaveText('×2');
  // the address carries it (a reload, a link: the same orchestra)
  await expect.poll(() => path(page), { timeout: 5000 }).toContain('seats=flute,flute,oboe,oboe,clarinet,clarinet,bassoon,bassoon,horn,horn,trumpet,trumpet,timpani,violin,violin,viola,cello,cello,bass&');
  expect(path(page)).toContain('eleven~42:17.18,twelve~43:19');
  // one desk fewer: the symphony as it was
  await menu.locator('.pl-less').click();
  await expect.poll(async () => (await ens(page)).lineup).toEqual(ORCHESTRA);
  await expect.poll(() => path(page), { timeout: 5000 }).toContain('eleven~42:17,twelve~43:18');
  // the timpani off: their staff is silent, the brass and strings meet
  await page.keyboard.press('Escape');
  await grid.locator('.pg-row[data-voice="timpani"]').click();
  await menu.locator('.pl-off').click();
  await expect.poll(async () => (await ens(page)).lineup).toEqual(ORCHESTRA.filter((v) => v !== 'timpani'));
  await expect(page.locator('.pl-line').nth(6)).toHaveAttribute('data-voice', 'none');
  await expect(grid.locator('.pg-gap')).toHaveCount(2);
  await expect.poll(() => path(page), { timeout: 5000 }).toContain('seven~47:-');
  // Escape: the grid closes
  await page.keyboard.press('Escape');
  await expect(grid).toBeHidden();
  expect(errors).toEqual([]);
});

test('a large lineup: an instrument tapped on the stage opens its section’s menu (2D, vector lines, 3D); the address follows, and the piece plays on the lineup as organised', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  const touch = info.project.name === 'phone';
  // each look: the cello tapped, its menu there (no file yet: no lines in it)
  for (const look of ['2d', 'vector', '3d']) {
    await page.goto(`${SYMPHONY}&view=${look}`);
    if (look === '3d') await expect(page.locator('.stage-3d')).toBeVisible();
    await tapSeat(page, 16, touch);
    const menu = page.locator('.pl-menu');
    await expect(menu, look).toHaveAttribute('aria-label', 'cello');
    await expect(menu.locator('.pl-pick[aria-checked="true"]')).toHaveAttribute('data-voice', 'cello');
    await expect(menu.locator('.pl-ln')).toHaveCount(0);
    const mb = (await menu.boundingBox())!;
    expect(mb.x).toBeGreaterThanOrEqual(0);
    expect(mb.x + mb.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
  }
  // on the 2D stage: another cello desk, then a trombone from the picker (after the trumpets, waiting for a line)
  await page.goto(`${SYMPHONY}&view=2d`);
  await tapSeat(page, 16, touch);
  await page.locator('.pl-menu .pl-desk').click();
  await expect.poll(() => path(page), { timeout: 5000 }).toContain('eleven~42:17.18,twelve~43:19');
  await page.keyboard.press('Escape');
  await page.locator('.pick[aria-label="Trombone"]').click();
  const lineup = [...ORCHESTRA.slice(0, 12), 'trombone', ...ORCHESTRA.slice(12, 17), 'cello', 'bass'];
  await expect.poll(async () => (await ens(page)).lineup).toEqual(lineup);
  await expect.poll(() => path(page), { timeout: 5000 }).toContain('seven~47:14,eight~40:15,nine~40:16,ten~41:17,eleven~42:18.19,twelve~43:20');
  // reopened from its address: the same twenty seats
  const at = path(page);
  await page.goto(at);
  expect((await ens(page)).lineup).toEqual(lineup);
  // the play icon plays the symphony on the lineup as it now is: both cellos on their staff, the trombone waiting
  await playSymphony(page);
  await expect.poll(async () => (await ens(page)).engines, { timeout: 30_000 }).toBe(20);
  let s = await ens(page);
  expect(s.lineup).toEqual(lineup);
  expect(s.piece).toBe('beethoven5-i');
  expect(s.routes[10]).toEqual([17, 18]);
  expect(s.routes.flat()).not.toContain(12);
  // the trombone tapped: its menu has the file's lines; the double bass's staff (twelve) given to it too
  await tapSeat(page, 12, touch);
  const menu = page.locator('.pl-menu');
  await expect(menu).toHaveAttribute('aria-label', 'trombone');
  await expect(menu.locator('.pl-ln')).toHaveCount(12);
  await menu.locator('.pl-ln[data-line="11"]').click();
  await expect(menu.locator('.pl-ln[data-line="11"]')).toHaveAttribute('aria-checked', 'true');
  await expect.poll(async () => (await ens(page)).routes[11]).toEqual([12, 19]);
  await expect.poll(() => path(page), { timeout: 5000 }).toContain('twelve~43:13.20');
  await page.keyboard.press('Escape');
  await page.locator('.player').getByRole('button', { name: /^(Pause|Stop)$/ }).first().click();
  expect(errors).toEqual([]);
});

test('a large lineup: the picker adds and takes off without losing the routing; the keys choose a section’s desks together; the presets read as before', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto(SYMPHONY);
  // another violin: a second desk for the second violins (the last section of violins)
  await page.locator('.pick[aria-label="Violin"]').click();
  await expect.poll(async () => (await ens(page)).lineup.filter((v) => v === 'violin').length).toBe(3);
  await expect.poll(() => path(page), { timeout: 5000 }).toContain('eight~40:14,nine~40:15.16,ten~41:17');
  await expect(page.locator('.pick[aria-label="Violin"]')).toHaveAttribute('data-tip', 'violin ×3 · tap to take them off');
  // past the most: no violins, their staves silent, every other staff where it was
  await page.locator('.pick[aria-label="Violin"]').click();
  await expect.poll(async () => (await ens(page)).lineup).toEqual(ORCHESTRA.filter((v) => v !== 'violin'));
  await expect.poll(() => path(page), { timeout: 5000 }).toContain('seven~47:13,eight~40:-,nine~40:-,ten~41:14');
  // a violin again: it takes back both staves the violins left
  await page.locator('.pick[aria-label="Violin"]').click();
  await expect.poll(() => path(page), { timeout: 5000 }).toContain('seven~47:13,eight~40:14,nine~40:14,ten~41:15');
  // the keys: a chip per section; the first flute plays by default (the section half lit), a tap brings both
  await page.goto(SYMPHONY);
  const phone = info.project.name === 'phone';
  if (phone) await page.locator('.kf-toggle').click();
  await expect(page.locator('.kf-part')).toHaveCount(12);
  const flutes = page.locator('.kf-part[data-part="0"]');
  await expect(flutes).toHaveAttribute('aria-pressed', 'mixed');
  await expect(flutes).toHaveAttribute('aria-label', 'flute 1–2');
  await flutes.click();
  await expect(flutes).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as any).__orchestra.ensemble.keyParts)).toEqual([0, 1]);
  // the Daylight quintet's address: five seats, each its own section, as it was written
  await page.goto(QUINTET);
  expect((await ens(page)).lineup).toEqual(['violin', 'violin', 'viola', 'cello', 'bass']);
  expect((await ens(page)).sections).toEqual([1, 1, 1, 1, 1]);
  expect(path(page).startsWith(QUINTET)).toBe(true);
  expect(errors).toEqual([]);
});
