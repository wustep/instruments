// The sheet music (apps/web/src/sheet): in player mode the page icon beside the hairline turns the stage into
// the file's score and back. It is offered only while a file or a piece with bars is loaded (not at rest,
// not Seeds); the notes sounding are lit and a hairline follows the place; a tap on a bar plays on from
// there; the choice is remembered on the device. An orchestra's file is read a part at a time, the one the
// keys play first, another from the part's name; a quartet on a computer also as a score.
import { test, expect, type Page } from '@playwright/test';

const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
};
const sheetBtn = (page: Page) => page.locator('.player .pl-sheet');
const notes = (page: Page) => page.locator('.sheet .vf-stavenote');
/** the playhead's place (px) */
const at = (page: Page) => page.evaluate(() => document.querySelector<HTMLElement>('.sheet-at')?.style.transform ?? '');
const written = (page: Page) => page.evaluate(() => (window as any).__player.writtenPosition as number);

test('the page icon: only with a file loaded; the instrument becomes its score (lit as it plays, a tap plays on from a bar) and back, remembered', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = errorsOf(page);
  await page.goto('/piano');
  // at rest: no file, no sheet
  await expect(page.locator('.player .pl-play')).toBeVisible();
  await expect(sheetBtn(page)).toBeHidden();
  // the piano's own piece (Chopin's prelude): the icon comes, not pressed
  await page.locator('.player .pl-play').click();
  await expect.poll(() => page.evaluate(() => (window as any).__player.playing), { timeout: 15_000 }).toBe(true);
  await expect(sheetBtn(page)).toBeVisible();
  await expect(sheetBtn(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(sheetBtn(page)).toHaveAttribute('aria-label', 'Sheet music');
  await expect(page.locator('.sheet')).toBeHidden();
  // the score: two staves braced (the piano's hands), in C minor, the instrument's picture hidden
  await sheetBtn(page).click();
  await expect(sheetBtn(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sheet')).toBeVisible();
  await expect.poll(() => notes(page).count(), { timeout: 15_000 }).toBeGreaterThan(30);
  await expect(page.locator('.stage-cv')).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('.sheet-part-name')).toHaveText('grand piano');
  await expect(page.locator('.sheet-title')).toContainText('Chopin');
  expect(await page.locator('.sheet .vf-stavenote').first().evaluate((n) => !!n.closest('svg'))).toBe(true);
  // as it plays: the hairline moves and the notes sounding are lit
  const a0 = await at(page);
  await expect.poll(() => at(page), { timeout: 8_000 }).not.toBe(a0);
  await expect.poll(() => page.locator('.sheet .vf-stavenote.on').count(), { timeout: 8_000 }).toBeGreaterThan(0);
  // a tap on the last system's last bar: the file plays on from there
  const before = await written(page);
  const sys = page.locator('.sheet-sys').last();
  await sys.scrollIntoViewIfNeeded();
  const box = (await sys.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  await expect.poll(() => written(page)).toBeGreaterThan(before + 10);
  // the same icon: back to the instrument
  await sheetBtn(page).click();
  await expect(page.locator('.sheet')).toBeHidden();
  await expect(page.locator('.stage-cv')).toHaveCSS('visibility', 'visible');
  await expect(sheetBtn(page)).toHaveAttribute('aria-pressed', 'false');
  // remembered on the device: on again, and a page opened later starts on the score
  await sheetBtn(page).click();
  await page.reload();
  await page.locator('.player .pl-play').click();
  await expect(page.locator('.sheet')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => notes(page).count(), { timeout: 15_000 }).toBeGreaterThan(30);
  // (the page never scrolls sideways under it)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(errors).toEqual([]);
});

test('an orchestra’s file: the part the keys play, another from the part’s name; a quartet as a score on a computer; Seeds has none', async ({ page }, info) => {
  test.setTimeout(60_000);
  const errors = errorsOf(page);
  const phone = info.project.name === 'phone';
  // Toward Morning on its thirteen, loaded and silent: the sheet opens on the part the keys play
  await page.goto('/symphony');
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.piece?.id ?? null), { timeout: 20_000 }).toBe('toward-morning');
  await sheetBtn(page).click();
  await expect.poll(() => notes(page).count(), { timeout: 15_000 }).toBeGreaterThan(10);
  // (the names of the lines on the seat the keys play)
  const keys = await page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    const song = (window as any).__player.loaded;
    return (e.plan.parts[e.keyParts[0]].lines as number[]).map((i) => (song.lines[i].name as string).toLowerCase());
  });
  const part = page.locator('.sheet-part');
  await expect(part).toBeVisible();
  expect(keys).toContain((await part.textContent())!.trim().toLowerCase());
  // thirteen parts, no score of them all; another part from the name
  await part.click();
  const picks = page.locator('.sheet-menu .sheet-pick');
  await expect(picks).toHaveCount(13);
  await expect(page.locator('.sheet-menu .sheet-pick-score')).toHaveCount(0);
  const other = picks.filter({ hasText: /cello/i }).first();
  await other.click();
  await expect(page.locator('.sheet-menu')).toHaveCount(0);
  await expect(part).toContainText(/cello/i);
  await expect.poll(() => notes(page).count(), { timeout: 10_000 }).toBeGreaterThan(10);
  // played from a moment: the place follows in this part too
  await page.evaluate(async () => {
    const p = (window as any).__player;
    await (window as any).__piano.start();
    p.seek(30);
    await p.play();
  });
  await expect.poll(() => page.locator('.sheet .vf-stavenote.on').count(), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.evaluate(() => (window as any).__player.pause());
  // Haydn's quartet: on a computer its score (four staves), on a phone a part
  await page.evaluate(() => {
    const o = (window as any).__orchestra;
    return (window as any).__player.loadPiece(o.pieces.findIndex((p: any) => p.id.includes('haydn')), false, false);
  });
  await expect.poll(() => page.locator('.sheet-part').textContent(), { timeout: 15_000 }).toMatch(phone ? /violin|viola|cello/i : /score/);
  if (!phone) await expect.poll(() => page.locator('.sheet-sys').first().locator('.vf-stave').count()).toBeGreaterThanOrEqual(4 * 2);
  // Seeds: made as it plays, no bars: no icon, no sheet
  await page.goto('/seeds');
  await expect.poll(() => page.evaluate(() => !!(window as any).__player.loaded), { timeout: 15_000 }).toBe(true);
  await expect(sheetBtn(page)).toBeHidden();
  await expect(page.locator('.sheet')).toBeHidden();
  expect(errors).toEqual([]);
});
