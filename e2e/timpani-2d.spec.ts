// The timpani on the 2D stage, in both styles: alone (whole on the stage under the file player and above the
// keys, no horizontal scroll; a stroke on the 32″ and one on the 23″ brings each hand's mallet to its drum and
// sets its head moving, and stopped, every head comes back to rest and the mallets to their rest above them),
// and in the Orchestra beside strings (in its own cell at the group's one px/m, drawn there).
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
type Drawn = {
  body: Box;
  heads: { x: number; y: number; rx: number; ry: number; field: number }[];
  mallets: { x: number; y: number; drum: number; lift: number; on: boolean }[];
  gauges: { box: Box; at: number; x: number; y: number }[];
  pedals: { at: number; x: number; y: number }[];
  stage: Box;
};
const drawn = (page: Page) => page.evaluate(() => (window as any).__timpani2d()) as Promise<Drawn | null>;
/** the mallets' rest above the heads (timpani-plan.ts REST_LIFT) */
const REST = 0.07;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('piano-model.3d', '0');
    localStorage.setItem('piano-model.style', 'classic');
  });
});

test('the timpani alone in 2D, both styles: whole on the stage under the file player and above the keys; strokes on the 32″ and the 23″ bring the mallets down and set the heads moving, then back to rest', async ({ page }, info) => {
  const errors = collectErrors(page);
  const phone = info.project.name === 'phone';
  await page.goto('/timpani');
  await startAudio(page);
  await page.evaluate(() => (window as any).__piano.setInstrument('timpani'));
  // (the phone: the Pixel 7, then 390×844, the narrowest the layout is kept for)
  for (const size of phone ? [null, { width: 390, height: 844 }] : [null]) {
    if (size) await page.setViewportSize(size);
    for (const vector of [false, true]) {
      await setStyle(page, vector);
      const where = `${vector ? 'vector' : 'classic'} ${page.viewportSize()!.width}×${page.viewportSize()!.height}`;
      await expect.poll(async () => (await drawn(page)) !== null, { message: `${where}: drawn` }).toBe(true);
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
      // as large as the stage allows: on a laptop as tall as it fits, on a phone as wide
      if (phone) expect((b.x1 - b.x0) / (d.stage.x1 - d.stage.x0), `${where}: its share of the stage's width`).toBeGreaterThan(0.9);
      else expect((b.y1 - b.y0) / (d.stage.y1 - under), `${where}: its share of the stage's height`).toBeGreaterThan(0.82);
      // the drums low to high left to right, as the keys run; each head and gauge on the stage, drawn
      for (let i = 1; i < 4; i++) expect(d.heads[i].x, `${where}: drum ${i} right of ${i - 1}`).toBeGreaterThan(d.heads[i - 1].x);
      for (const g of d.gauges) expect(g.box.y0, `${where}: the gauge under the player`).toBeGreaterThanOrEqual(under);
      const h1 = d.heads[1];
      expect(await inked(page, { x0: h1.x - h1.rx * 0.6, x1: h1.x + h1.rx * 0.6, y0: h1.y + h1.ry * 0.85, y1: h1.y + h1.ry * 1.6 }), `${where}: drawn`).toBeGreaterThan(vector ? 0.08 : 0.4);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}: no horizontal scroll`).toBe(true);
      // a stroke on the 32″ (D2) and one on the 23″ (F3): each hand's mallet goes to its drum, the heads move
      await page.evaluate(() => (window as any).__piano.piano.setParams({ damp: 0 }));
      await page.evaluate(() => (window as any).__piano.piano.noteOn(38, 110));
      await page.waitForTimeout(120);
      await page.evaluate(() => (window as any).__piano.piano.noteOn(53, 110));
      await expect.poll(async () => (await drawn(page))!.mallets.map((m) => m.drum).sort().join(), { message: `${where}: the mallets on the 32″ and the 23″` }).toBe('0,3');
      await expect.poll(async () => Math.min((await drawn(page))!.heads[0].field, (await drawn(page))!.heads[3].field), { message: `${where}: both heads moving` }).toBeGreaterThan(0.15);
      // (the mallets rebound above the heads after their strokes)
      await expect.poll(async () => Math.max(...(await drawn(page))!.mallets.map((m) => m.lift)), { message: `${where}: a mallet rebounding` }).toBeGreaterThan(0.02);
      // stopped (the fingers on the heads): every head still, the mallets back at rest above their drums
      await page.evaluate(() => {
        (window as any).__piano.piano.setParams({ damp: 1 });
        (window as any).__piano.piano.noteOff(38);
        (window as any).__piano.piano.noteOff(53);
      });
      await expect.poll(async () => Math.max(...(await drawn(page))!.heads.map((h) => h.field)), { message: `${where}: the heads still`, timeout: 8000 }).toBeLessThan(0.02);
      await expect.poll(async () => (await drawn(page))!.mallets.every((m) => Math.abs(m.lift - REST) < 0.005), { message: `${where}: the mallets at rest` }).toBe(true);
      await page.evaluate(() => (window as any).__piano.piano.setParams({ damp: 0 }));
    }
  }
  expect(errors).toEqual([]);
});

type Part = { voice: string; cell: { x: number; y: number; w: number; h: number; sc: number | null } };

test('orchestra in 2D, the timpani among strings: in its own cell at the strings’ px/m, drawn there, in both styles', async ({ page }, info) => {
  const errors = collectErrors(page);
  if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/orchestra?v=1&seats=violin,violin,viola,cello,timpani&view=2d');
  await startAudio(page);
  const lineup = ['violin', 'violin', 'viola', 'cello', 'timpani'];
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.lineup as string[])).toEqual(lineup);
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.filter((p: any) => p.frame).length), { timeout: 10_000 }).toBe(lineup.length);
  const stage = (await rectOf(page, '.stage-cv'))!;
  for (const vector of [false, true]) {
    await setStyle(page, vector);
    const where = vector ? 'vector' : 'classic';
    await page.evaluate(() => (window as any).__orchestra.ensemble.parts[4].engine.noteOn(43, 110));
    await page.waitForTimeout(300);
    const parts = (await page.evaluate(() => (window as any).__ens2d())) as Part[];
    expect(parts.map((p) => p.voice)).toEqual(lineup);
    const tp = parts[4].cell;
    const cello = parts[3].cell;
    // one px/m with the strings: its cell the set's 2.79 m over 0.92 of it across
    expect(tp.sc, `${where}: the timpani's px/m`).toBe(cello.sc);
    expect(tp.w / tp.sc!, `${where}: its cell's width`).toBeCloseTo(2.79 / 0.92, 1);
    expect(tp.w, `${where}: wider than tall`).toBeGreaterThan(tp.h);
    // on the stage, clear of every other instrument's cell
    expect(tp.x).toBeGreaterThanOrEqual(stage.x0);
    expect(tp.x + tp.w).toBeLessThanOrEqual(stage.x1);
    for (const [j, o] of parts.entries())
      if (j !== 4) expect(tp.x < o.cell.x + o.cell.w && o.cell.x < tp.x + tp.w && tp.y < o.cell.y + o.cell.h && o.cell.y < tp.y + tp.h, `${where}: the timpani's cell over ${o.voice} ${j}'s`).toBe(false);
    // drawn: ink across the heads' band (the middle of the cell)
    const body: Box = { x0: tp.x + tp.w * 0.2, x1: tp.x + tp.w * 0.8, y0: tp.y + tp.h * 0.25, y1: tp.y + tp.h * 0.5 };
    expect(await inked(page, body), `${where}: the timpani drawn in its cell`).toBeGreaterThan(vector ? 0.06 : 0.3);
    await page.evaluate(() => (window as any).__orchestra.ensemble.parts[4].engine.noteOff(43));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
