// The oboe on the 2D stage, in both styles: alone (whole on the stage, reed tip to bell rim, under the
// file player and above the keys, no horizontal scroll; lying on a laptop, standing on a phone held
// upright; its keys going down for the engine's note and lifting after it), and in the Orchestra beside strings (standing in its own cell at the group's one
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
type Drawn = { body: Box; keys: Box; reed: { x: number; y: number }; vertical: boolean; fingers: number; stage: Box };
const drawn = (page: Page) => page.evaluate(() => (window as any).__oboe2d()) as Promise<Drawn | null>;
/** D5: the half-hole, L2, L3 and the right hand's three rings (oboe-fingering.ts: L1|HALF|L2|L3|R1|R2|R3) */
const D5 = 4 | 8 | 16 | 32 | 1024 | 2048 | 4096;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('piano-model.3d', '0');
    localStorage.setItem('piano-model.style', 'classic');
  });
});

test('the oboe alone in 2D, both styles: whole on the stage under the file player and above the keys; its keys follow the note and lift after it', async ({ page }, info) => {
  const errors = collectErrors(page);
  const phone = info.project.name === 'phone';
  await page.goto('/oboe');
  await startAudio(page);
  await page.evaluate(() => (window as any).__piano.setInstrument('oboe'));
  // (the phone: the Pixel 7, then 390×844, the narrowest the layout is kept for)
  for (const size of phone ? [null, { width: 390, height: 844 }] : [null]) {
    if (size) await page.setViewportSize(size);
    for (const vector of [false, true]) {
      await setStyle(page, vector);
      const where = `${vector ? 'vector' : 'classic'} ${page.viewportSize()!.width}×${page.viewportSize()!.height}`;
      await page.evaluate(() => (window as any).__piano.piano.noteOn(74, 100));
      await expect.poll(async () => (await drawn(page))?.fingers, { message: `${where}: the keys down for D5` }).toBe(D5);
      const d = (await drawn(page))!;
      const player = await rectOf(page, '.player');
      const keys = (await rectOf(page, '.keyboard'))!;
      const under = player ? Math.max(d.stage.y0, player.y1) : d.stage.y0;
      const b = d.body;
      expect(b.x0, `${where}: the reed's tip on the stage`).toBeGreaterThanOrEqual(d.stage.x0 + 2);
      expect(b.x1, `${where}: the bell on the stage`).toBeLessThanOrEqual(d.stage.x1 - 2);
      expect(b.y0, `${where}: under the player`).toBeGreaterThanOrEqual(under);
      expect(b.y1, `${where}: on the stage`).toBeLessThanOrEqual(d.stage.y1);
      expect(d.stage.y1, `${where}: the stage above the keys`).toBeLessThanOrEqual(keys.y0 + 1);
      // on a laptop lying, as long as the stage allows; on a phone held upright standing (reed up), as tall
      // as fits between the player and the keys; drawn: ink over the instrument's box
      expect(d.vertical, `${where}: ${phone ? 'standing' : 'lying'}`).toBe(phone);
      if (phone) expect((b.y1 - b.y0) / (d.stage.y1 - under), `${where}: its share of the stage's height`).toBeGreaterThan(0.85);
      else expect((b.x1 - b.x0) / (d.stage.x1 - d.stage.x0), `${where}: its share of the stage`).toBeGreaterThan(0.88);
      expect(d.reed.y, `${where}: the reed at the top`).toBeLessThan(phone ? b.y0 + 2 : b.y1);
      expect(await inked(page, b), `${where}: drawn`).toBeGreaterThan(0.12);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}: no horizontal scroll`).toBe(true);
      // the note let go: a moment later the fingers lift, every key back at rest
      await page.evaluate(() => (window as any).__piano.piano.noteOff(74));
      await expect.poll(async () => (await drawn(page))?.fingers, { message: `${where}: the keys back at rest`, timeout: 5000 }).toBe(0);
    }
  }
  expect(errors).toEqual([]);
});

type Part = { voice: string; cell: { x: number; y: number; w: number; h: number; sc: number | null } };

test('orchestra in 2D, an oboe among strings: standing in its own cell at the strings’ px/m, drawn there, in both styles', async ({ page }, info) => {
  const errors = collectErrors(page);
  if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/orchestra?v=1&seats=violin,violin,oboe,viola,cello&view=2d');
  await startAudio(page);
  const lineup = ['violin', 'violin', 'oboe', 'viola', 'cello'];
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.lineup as string[])).toEqual(lineup);
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.filter((p: any) => p.frame).length), { timeout: 10_000 }).toBe(lineup.length);
  const stage = (await rectOf(page, '.stage-cv'))!;
  for (const vector of [false, true]) {
    await setStyle(page, vector);
    const where = vector ? 'vector' : 'classic';
    await page.evaluate(() => (window as any).__orchestra.ensemble.parts[2].engine.noteOn(81, 100));
    await page.waitForTimeout(400);
    const parts = (await page.evaluate(() => (window as any).__ens2d())) as Part[];
    expect(parts.map((p) => p.voice)).toEqual(lineup);
    const ob = parts[2].cell;
    const cello = parts[4].cell;
    // one px/m with the strings: its length (with its margin) 0.655 / 0.9 m, standing in a row of players
    expect(ob.sc, `${where}: the oboe's px/m`).toBe(cello.sc);
    expect(ob.h, `${where}: standing`).toBeGreaterThan(ob.w);
    expect(ob.h / ob.sc!, `${where}: its cell's length`).toBeCloseTo(0.655 / 0.9, 1);
    // on the stage, clear of every other instrument's cell
    expect(ob.x).toBeGreaterThanOrEqual(stage.x0);
    expect(ob.x + ob.w).toBeLessThanOrEqual(stage.x1);
    for (const [j, o] of parts.entries())
      if (j !== 2) expect(ob.x < o.cell.x + o.cell.w && o.cell.x < ob.x + ob.w && ob.y < o.cell.y + o.cell.h && o.cell.y < ob.y + ob.h, `${where}: the oboe's cell over ${o.voice} ${j}'s`).toBe(false);
    // drawn: ink down its middle, reed to bell
    const mid: Box = { x0: ob.x + ob.w * 0.35, x1: ob.x + ob.w * 0.65, y0: ob.y + ob.h * 0.08, y1: ob.y + ob.h * 0.92 };
    expect(await inked(page, mid), `${where}: the oboe drawn in its cell`).toBeGreaterThan(0.25);
    await page.evaluate(() => (window as any).__orchestra.ensemble.parts[2].engine.noteOff(81));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
