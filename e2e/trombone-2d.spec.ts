// The slide trombone on the 2D stage, in both styles: alone (whole on the stage with its slide all the way
// out, under the file player and above the keys, no horizontal scroll; its outer slide standing out by the
// engine's slide for an F-side sixth-position note, back in for a first-position one, its trigger down for the
// F valve and up after), and in the Orchestra beside strings (in its own cell at the group's px per metre,
// drawn there).
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
    for (let i = 0; i < d.length; i += 4 * 3) {
      m++;
      if (Math.max(d[i], d[i + 1], d[i + 2]) > 40) n++;
    }
    return n / m;
  }, b);
async function setStyle(page: Page, vector: boolean) {
  if (vector !== (await page.evaluate(() => document.documentElement.dataset.style === 'vector'))) await page.locator('.vec-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.style === 'vector')).toBe(vector);
}
type Drawn = { body: Box; inst: Box; slideBox: Box; mouth: Box; bell: Box; valves: Box | null; levers: number; slide: number; target: number; crookX: number; pxPerM: number; size: string; position: number; side: string | null; stage: Box };
const drawn = (page: Page) => page.evaluate(() => (window as any).__trombone2d()) as Promise<Drawn | null>;
const play = (page: Page, m: number) => page.evaluate((m) => (window as any).__piano.piano.noteOn(m, 100), m);
const stop = (page: Page, m: number) => page.evaluate((m) => (window as any).__piano.piano.noteOff(m), m);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('piano-model.3d', '0');
    localStorage.setItem('piano-model.style', 'classic');
  });
});

test('the trombone alone in 2D, both styles: whole on the stage (its slide all the way out) under the file player and above the keys; the slide out for C2 (the F valve, sixth position), in for B♭3, the trigger lifting after', async ({ page }, info) => {
  const errors = collectErrors(page);
  const phone = info.project.name === 'phone';
  await page.goto('/trombone');
  await startAudio(page);
  await page.evaluate(() => (window as any).__piano.setInstrument('trombone'));
  // (the chart's positions: the slide where the model has it, not where a player puts it by ear, a few
  // millimetres either side: `human` 0. Main failed here since the trombone was given its player: 6.9 mm)
  await page.evaluate(() => (window as any).__piano.setParams({ human: 0 }));
  // (the phone: the Pixel 7, then 390×844, the narrowest the layout is kept for)
  for (const size of phone ? [null, { width: 390, height: 844 }] : [null]) {
    if (size) await page.setViewportSize(size);
    for (const vector of [false, true]) {
      await setStyle(page, vector);
      const where = `${vector ? 'vector' : 'classic'} ${page.viewportSize()!.width}×${page.viewportSize()!.height}`;
      // B♭3: first position, the slide in, no valve
      await play(page, 58);
      await expect.poll(async () => (await drawn(page))?.position, { message: `${where}: B♭3 in first position` }).toBe(1);
      await expect.poll(async () => (await drawn(page))?.slide ?? 1, { message: `${where}: the slide in` }).toBeLessThan(0.005);
      const d1 = (await drawn(page))!;
      expect(d1.size).toBe('tenor');
      expect(d1.levers).toBe(0);
      const player = await rectOf(page, '.player');
      const keys = (await rectOf(page, '.keyboard'))!;
      const under = player ? Math.max(d1.stage.y0, player.y1) : d1.stage.y0;
      // the box the slide moves in: whole on the stage, under the player, above the keys
      const b = d1.body;
      expect(b.x0, `${where}: on the stage, left`).toBeGreaterThanOrEqual(d1.stage.x0 + 2);
      expect(b.x1, `${where}: on the stage, right (the slide all the way out)`).toBeLessThanOrEqual(d1.stage.x1 - 2);
      expect(b.y0, `${where}: under the player`).toBeGreaterThanOrEqual(under);
      expect(d1.mouth.y0, `${where}: the mouthpiece under the player`).toBeGreaterThanOrEqual(under);
      expect(b.y1, `${where}: on the stage`).toBeLessThanOrEqual(d1.stage.y1);
      expect(d1.stage.y1, `${where}: the stage above the keys`).toBeLessThanOrEqual(keys.y0 + 1);
      // as wide as the stage allows (it is a long instrument: its width fills the stage)
      expect((b.x1 - b.x0) / (d1.stage.x1 - d1.stage.x0), `${where}: its share of the stage's width`).toBeGreaterThan(phone ? 0.88 : 0.85);
      // the bell above the slide, opening to the right of the mouthpiece; drawn: ink over the valve and bell
      expect((d1.bell.y0 + d1.bell.y1) / 2, `${where}: the bell above the slide`).toBeLessThan((d1.slideBox.y0 + d1.slideBox.y1) / 2);
      expect(d1.bell.x0, `${where}: the bell past the mouthpiece`).toBeGreaterThan(d1.mouth.x1);
      expect(await inked(page, d1.valves!), `${where}: drawn`).toBeGreaterThan(vector ? 0.08 : 0.25);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}: no horizontal scroll`).toBe(true);
      // C2: the F valve, sixth position, the slide half a metre out
      await stop(page, 58);
      await play(page, 36);
      await expect.poll(async () => (await drawn(page))?.levers, { message: `${where}: the trigger down for C2` }).toBe(1);
      // (the engine's slide: where its tuned bore puts it, about 0.5 m out; the chart's sixth position is 0.61 m)
      await expect.poll(async () => (await drawn(page))?.slide ?? 0, { message: `${where}: the slide out for C2` }).toBeGreaterThan(0.45);
      const d6 = (await drawn(page))!;
      expect(d6.side).toBe('F');
      expect(d6.position).toBe(6);
      // the crook out by the slide at the drawing's px per metre, still on the stage
      expect(Math.abs(d6.crookX - d1.crookX - (d6.slide - d1.slide) * d6.pxPerM), `${where}: the crook moved by the slide`).toBeLessThan(1.5);
      expect(d6.slideBox.x1, `${where}: the slide on the stage`).toBeLessThanOrEqual(d6.stage.x1);
      expect(await inked(page, { x0: d6.crookX - 0.6 * (d6.slideBox.y1 - d6.slideBox.y0), x1: d6.crookX, y0: d6.slideBox.y0, y1: d6.slideBox.y1 }), `${where}: the crook drawn out there`).toBeGreaterThan(vector ? 0.08 : 0.3);
      // back in for B♭3, the trigger up; then the note let go
      await stop(page, 36);
      await play(page, 58);
      await expect.poll(async () => (await drawn(page))?.slide ?? 1, { message: `${where}: the slide back in`, timeout: 5000 }).toBeLessThan(0.005);
      expect((await drawn(page))!.levers).toBe(0);
      await stop(page, 58);
      await expect.poll(async () => (await drawn(page))?.position, { message: `${where}: nothing held a moment later`, timeout: 5000 }).toBe(0);
      expect((await drawn(page))!.side).toBe(null);
    }
  }
  expect(errors).toEqual([]);
});

type Part = { voice: string; cell: { x: number; y: number; w: number; h: number; sc: number | null } };

test('orchestra in 2D, a trombone among strings: in its own cell at the strings’ px/m, drawn there, in both styles', async ({ page }, info) => {
  const errors = collectErrors(page);
  if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/orchestra?v=1&seats=violin,violin,viola,cello,trombone&view=2d');
  await startAudio(page);
  const lineup = ['violin', 'violin', 'viola', 'cello', 'trombone'];
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.lineup as string[])).toEqual(lineup);
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.filter((p: any) => p.frame).length), { timeout: 10_000 }).toBe(lineup.length);
  const stage = (await rectOf(page, '.stage-cv'))!;
  for (const vector of [false, true]) {
    await setStyle(page, vector);
    const where = vector ? 'vector' : 'classic';
    await page.evaluate(() => (window as any).__orchestra.ensemble.parts[4].engine.noteOn(53, 100));
    await page.waitForTimeout(400);
    const parts = (await page.evaluate(() => (window as any).__ens2d())) as Part[];
    expect(parts.map((p) => p.voice)).toEqual(lineup);
    const tb = parts[4].cell;
    const cello = parts[3].cell;
    // one px/m with the strings: its cell about 2.1 m across (its length with the slide all the way out, over
    // 0.9 of it), much wider than tall
    expect(tb.sc, `${where}: the trombone's px/m`).toBe(cello.sc);
    expect(tb.w / tb.sc!, `${where}: its cell's width`).toBeGreaterThan(1.95);
    expect(tb.w / tb.sc!, `${where}: its cell's width`).toBeLessThan(2.2);
    expect(tb.w, `${where}: wider than tall`).toBeGreaterThan(4 * tb.h);
    // on the stage, clear of every other instrument's cell
    expect(tb.x).toBeGreaterThanOrEqual(stage.x0);
    expect(tb.x + tb.w).toBeLessThanOrEqual(stage.x1);
    for (const [j, o] of parts.entries())
      if (j !== 4) expect(tb.x < o.cell.x + o.cell.w && o.cell.x < tb.x + tb.w && tb.y < o.cell.y + o.cell.h && o.cell.y < tb.y + tb.h, `${where}: the trombone's cell over ${o.voice} ${j}'s`).toBe(false);
    // drawn: ink over its bell section and slide (the left two thirds of the cell: the slide in)
    const body: Box = { x0: tb.x + tb.w * 0.06, x1: tb.x + tb.w * 0.6, y0: tb.y + tb.h * 0.2, y1: tb.y + tb.h * 0.8 };
    expect(await inked(page, body), `${where}: the trombone drawn in its cell`).toBeGreaterThan(vector ? 0.05 : 0.1);
    await page.evaluate(() => (window as any).__orchestra.ensemble.parts[4].engine.noteOff(53));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
