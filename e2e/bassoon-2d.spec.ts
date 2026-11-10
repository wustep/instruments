// The bassoon on the 2D stage, in both styles: alone (whole on the stage, boot to bell and bocal to keys,
// under the file player and above the keys, no horizontal scroll; lying on a laptop, standing bell up on a
// phone held upright; its keys going down for the engine's note, a low one and a flicked high one, and
// lifting after it), and in the Orchestra beside strings (standing in its own cell at the group's one
// px/m, drawn there).
import { test, expect, type Page } from '@playwright/test';

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};
async function startAudio(page: Page) {
  await page.waitForFunction(() => !!(window as any).__piano);
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
}
type Box = { x0: number; x1: number; y0: number; y1: number };
const rectOf = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const e = document.querySelector(s) as HTMLElement | null;
    if (!e || e.hidden) return null;
    const r = e.getBoundingClientRect();
    return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom };
  }, sel) as Promise<Box | null>;
/** the share of a box's pixels on the stage's canvas that carry ink (anything brighter than the ground) */
const inked = (page: Page, b: Box) =>
  page.evaluate((b) => {
    const cv = document.querySelector('.stage-cv') as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const c2 = Object.assign(document.createElement('canvas'), { width: cv.width, height: cv.height }).getContext('2d', { willReadFrequently: true })!;
    c2.drawImage(cv, 0, 0);
    const [x0, y0] = [Math.round((b.x0 - r.left) * k), Math.round((b.y0 - r.top) * k)];
    const [w, h] = [Math.max(1, Math.round((b.x1 - b.x0) * k)), Math.max(1, Math.round((b.y1 - b.y0) * k))];
    const d = c2.getImageData(x0, y0, w, h).data;
    let n = 0;
    let m = 0;
    for (let i = 0; i < d.length; i += 4 * 5) {
      m++;
      if (Math.max(d[i], d[i + 1], d[i + 2]) > 40) n++;
    }
    return n / m;
  }, b);
async function setStyle(page: Page, vector: boolean) {
  if (vector !== (await page.evaluate(() => document.documentElement.dataset.style === 'vector'))) await page.locator('.vec-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.style === 'vector')).toBe(vector);
}
type Drawn = { body: Box; keys: Box; reedBox: Box; reed: { x: number; y: number }; vertical: boolean; fingers: number; stage: Box };
const drawn = (page: Page) => page.evaluate(() => (window as any).__bassoon2d()) as Promise<Drawn | null>;
/** F2 (bassoon-fingering.ts): the whisper key, the six fingers and the little finger's F key
 *  (W|L1|L2|L3|R1|R2|R3|PF) */
const F2 = (1 << 8) | (1 << 9) | (1 << 11) | (1 << 12) | (1 << 21) | (1 << 22) | (1 << 23) | (1 << 25);
/** A4: the A flick key, the C♯ thumb key, the left hand, its E♭ key and R3 (FA|TCS|L1|L2|L3|LEB|R3) */
const A4 = (1 << 6) | (1 << 7) | (1 << 9) | (1 << 11) | (1 << 12) | (1 << 15) | (1 << 23);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('piano-model.3d', '0');
    localStorage.setItem('piano-model.style', 'classic');
  });
});

test('the bassoon alone in 2D, both styles: whole on the stage under the file player and above the keys; its keys follow a low and a high note and lift after them', async ({ page }, info) => {
  const errors = collectErrors(page);
  const phone = info.project.name === 'phone';
  await page.goto('/bassoon');
  await startAudio(page);
  await page.evaluate(() => (window as any).__piano.setInstrument('bassoon'));
  // (the phone: the Pixel 7, then 390×844, the narrowest the layout is kept for)
  for (const size of phone ? [null, { width: 390, height: 844 }] : [null]) {
    if (size) await page.setViewportSize(size);
    for (const vector of [false, true]) {
      await setStyle(page, vector);
      const where = `${vector ? 'vector' : 'classic'} ${page.viewportSize()!.width}×${page.viewportSize()!.height}`;
      // a low note: the long tube, every finger down
      await page.evaluate(() => (window as any).__piano.piano.noteOn(41, 100));
      await expect.poll(async () => (await drawn(page))?.fingers, { message: `${where}: the keys down for F2` }).toBe(F2);
      const d = (await drawn(page))!;
      const player = await rectOf(page, '.player');
      const keys = (await rectOf(page, '.keyboard'))!;
      const under = player ? Math.max(d.stage.y0, player.y1) : d.stage.y0;
      const b = d.body;
      expect(b.x0, `${where}: on the stage, left`).toBeGreaterThanOrEqual(d.stage.x0 + 2);
      expect(b.x1, `${where}: on the stage, right`).toBeLessThanOrEqual(d.stage.x1 - 2);
      expect(b.y0, `${where}: under the player`).toBeGreaterThanOrEqual(under);
      expect(b.y1, `${where}: on the stage`).toBeLessThanOrEqual(d.stage.y1);
      expect(d.stage.y1, `${where}: the stage above the keys`).toBeLessThanOrEqual(keys.y0 + 1);
      // on a laptop lying, as long as the stage allows; on a phone held upright standing (bell up), as
      // tall as fits between the player and the keys, the reed out to the left; drawn: ink over the body
      expect(d.vertical, `${where}: ${phone ? 'standing' : 'lying'}`).toBe(phone);
      if (phone) {
        expect((b.y1 - b.y0) / (d.stage.y1 - under), `${where}: its share of the stage's height`).toBeGreaterThan(0.88);
        expect(d.reed.x, `${where}: the reed left of the body`).toBeLessThan((b.x0 + b.x1) / 2);
      } else {
        expect((b.x1 - b.x0) / (d.stage.x1 - d.stage.x0), `${where}: its share of the stage`).toBeGreaterThan(0.88);
        expect(d.reed.y, `${where}: the reed above the body`).toBeLessThan((b.y0 + b.y1) / 2);
      }
      expect(await inked(page, d.keys), `${where}: drawn`).toBeGreaterThan(0.3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}: no horizontal scroll`).toBe(true);
      // a high note: the A flick key and the C♯ key, the whisper key off
      await page.evaluate(() => (window as any).__piano.piano.noteOff(41));
      await page.evaluate(() => (window as any).__piano.piano.noteOn(69, 100));
      await expect.poll(async () => (await drawn(page))?.fingers, { message: `${where}: the keys down for A4` }).toBe(A4);
      // the note let go: a moment later the fingers lift, every key back at rest
      await page.evaluate(() => (window as any).__piano.piano.noteOff(69));
      await expect.poll(async () => (await drawn(page))?.fingers, { message: `${where}: the keys back at rest`, timeout: 5000 }).toBe(0);
    }
  }
  expect(errors).toEqual([]);
});

type Part = { voice: string; cell: { x: number; y: number; w: number; h: number; sc: number | null } };

test('orchestra in 2D, a bassoon among strings: standing in its own cell at the strings’ px/m, drawn there, in both styles', async ({ page }, info) => {
  const errors = collectErrors(page);
  if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/orchestra?v=1&seats=violin,violin,bassoon,viola,cello&view=2d');
  await startAudio(page);
  const lineup = ['violin', 'violin', 'bassoon', 'viola', 'cello'];
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.lineup as string[])).toEqual(lineup);
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.filter((p: any) => p.frame).length), { timeout: 10_000 }).toBe(lineup.length);
  const stage = (await rectOf(page, '.stage-cv'))!;
  for (const vector of [false, true]) {
    await setStyle(page, vector);
    const where = vector ? 'vector' : 'classic';
    await page.evaluate(() => (window as any).__orchestra.ensemble.parts[2].engine.noteOn(48, 100));
    await page.waitForTimeout(400);
    const parts = (await page.evaluate(() => (window as any).__ens2d())) as Part[];
    expect(parts.map((p) => p.voice)).toEqual(lineup);
    const bn = parts[2].cell;
    const cello = parts[4].cell;
    // one px/m with the strings: its height (with its margin) 1.34 / 0.9 m, standing in a row of players
    expect(bn.sc, `${where}: the bassoon's px/m`).toBe(cello.sc);
    expect(bn.h, `${where}: standing`).toBeGreaterThan(bn.w);
    expect(bn.h / bn.sc!, `${where}: its cell's length`).toBeCloseTo(1.34 / 0.9, 1);
    // on the stage, clear of every other instrument's cell
    expect(bn.x).toBeGreaterThanOrEqual(stage.x0);
    expect(bn.x + bn.w).toBeLessThanOrEqual(stage.x1);
    for (const [j, o] of parts.entries())
      if (j !== 2) expect(bn.x < o.cell.x + o.cell.w && o.cell.x < bn.x + bn.w && bn.y < o.cell.y + o.cell.h && o.cell.y < bn.y + bn.h, `${where}: the bassoon's cell over ${o.voice} ${j}'s`).toBe(false);
    // drawn: ink down its body (the right half of the cell: the bocal sticks out to the left), boot to bell
    const body: Box = { x0: bn.x + bn.w * 0.6, x1: bn.x + bn.w * 0.82, y0: bn.y + bn.h * 0.08, y1: bn.y + bn.h * 0.92 };
    expect(await inked(page, body), `${where}: the bassoon drawn in its cell`).toBeGreaterThan(0.25);
    await page.evaluate(() => (window as any).__orchestra.ensemble.parts[2].engine.noteOff(48));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
