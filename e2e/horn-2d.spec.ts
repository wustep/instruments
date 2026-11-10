// The horn on the 2D stage, in both styles: alone (whole on the stage, bell rim to levers and the bell's
// sweep to the mouthpiece, under the file player and above the keys, no horizontal scroll; its levers going
// down for the engine's note, an F-side and a B♭-side fingering, and lifting after it), and in the
// Orchestra beside strings (in its own cell at the group's one px/m, drawn there).
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
type Drawn = { body: Box; valves: Box; mouth: Box; bell: Box; levers: number; side: 'F' | 'Bb' | null; stage: Box };
const drawn = (page: Page) => page.evaluate(() => (window as any).__horn2d()) as Promise<Drawn | null>;
/** the levers held (horn-draw.ts: bit 0 the thumb's change valve, bits 1–3 valves 1–3): G3 is the F horn's
 *  first valve, G4 the B♭ horn's 1+2 (hornFingering) */
const G3 = 0b0010;
const G4 = 0b0111;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('piano-model.3d', '0');
    localStorage.setItem('piano-model.style', 'classic');
  });
});

test('the horn alone in 2D, both styles: whole on the stage under the file player and above the keys; its levers follow an F-side and a B♭-side note and lift after them', async ({ page }, info) => {
  const errors = collectErrors(page);
  const phone = info.project.name === 'phone';
  await page.goto('/horn');
  await startAudio(page);
  await page.evaluate(() => (window as any).__piano.setInstrument('horn'));
  // (the phone: the Pixel 7, then 390×844, the narrowest the layout is kept for)
  for (const size of phone ? [null, { width: 390, height: 844 }] : [null]) {
    if (size) await page.setViewportSize(size);
    for (const vector of [false, true]) {
      await setStyle(page, vector);
      const where = `${vector ? 'vector' : 'classic'} ${page.viewportSize()!.width}×${page.viewportSize()!.height}`;
      // an F-side note: valve 1 down, the thumb up
      await page.evaluate(() => (window as any).__piano.piano.noteOn(55, 100));
      await expect.poll(async () => (await drawn(page))?.levers, { message: `${where}: valve 1 down for G3` }).toBe(G3);
      expect((await drawn(page))!.side).toBe('F');
      const d = (await drawn(page))!;
      const player = await rectOf(page, '.player');
      const keys = (await rectOf(page, '.keyboard'))!;
      const under = player ? Math.max(d.stage.y0, player.y1) : d.stage.y0;
      const b = d.body;
      expect(b.x0, `${where}: on the stage, left`).toBeGreaterThanOrEqual(d.stage.x0 + 2);
      expect(b.x1, `${where}: on the stage, right`).toBeLessThanOrEqual(d.stage.x1 - 2);
      expect(b.y0, `${where}: under the player`).toBeGreaterThanOrEqual(under);
      expect(d.mouth.y0, `${where}: the mouthpiece under the player`).toBeGreaterThanOrEqual(under);
      expect(b.y1, `${where}: on the stage`).toBeLessThanOrEqual(d.stage.y1);
      expect(d.stage.y1, `${where}: the stage above the keys`).toBeLessThanOrEqual(keys.y0 + 1);
      // as large as the stage allows: on a laptop as tall as it fits, on a phone as wide
      if (phone) expect((b.x1 - b.x0) / (d.stage.x1 - d.stage.x0), `${where}: its share of the stage's width`).toBeGreaterThan(0.85);
      else expect((b.y1 - b.y0) / (d.stage.y1 - under), `${where}: its share of the stage's height`).toBeGreaterThan(0.82);
      // the bell to the left, the mouthpiece up at the right; drawn: ink over the valves and levers
      expect((d.bell.x0 + d.bell.x1) / 2, `${where}: the bell left of the mouthpiece`).toBeLessThan((d.mouth.x0 + d.mouth.x1) / 2);
      expect(await inked(page, d.valves), `${where}: drawn`).toBeGreaterThan(vector ? 0.12 : 0.3);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}: no horizontal scroll`).toBe(true);
      // a B♭-side note: the thumb, 1 and 2
      await page.evaluate(() => (window as any).__piano.piano.noteOff(55));
      await page.evaluate(() => (window as any).__piano.piano.noteOn(67, 100));
      await expect.poll(async () => (await drawn(page))?.levers, { message: `${where}: the thumb and 1+2 for G4` }).toBe(G4);
      expect((await drawn(page))!.side).toBe('Bb');
      // the note let go: a moment later the levers lift, every rotor back at rest
      await page.evaluate(() => (window as any).__piano.piano.noteOff(67));
      await expect.poll(async () => (await drawn(page))?.levers, { message: `${where}: the levers back up`, timeout: 5000 }).toBe(0);
    }
  }
  expect(errors).toEqual([]);
});

type Part = { voice: string; cell: { x: number; y: number; w: number; h: number; sc: number | null } };

test('orchestra in 2D, a horn among strings: in its own cell at the strings’ px/m, drawn there, in both styles', async ({ page }, info) => {
  const errors = collectErrors(page);
  if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/orchestra?v=1&seats=violin,violin,viola,cello,horn&view=2d');
  await startAudio(page);
  const lineup = ['violin', 'violin', 'viola', 'cello', 'horn'];
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.lineup as string[])).toEqual(lineup);
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.filter((p: any) => p.frame).length), { timeout: 10_000 }).toBe(lineup.length);
  const stage = (await rectOf(page, '.stage-cv'))!;
  for (const vector of [false, true]) {
    await setStyle(page, vector);
    const where = vector ? 'vector' : 'classic';
    await page.evaluate(() => (window as any).__orchestra.ensemble.parts[4].engine.noteOn(60, 100));
    await page.waitForTimeout(400);
    const parts = (await page.evaluate(() => (window as any).__ens2d())) as Part[];
    expect(parts.map((p) => p.voice)).toEqual(lineup);
    const hn = parts[4].cell;
    const cello = parts[3].cell;
    // one px/m with the strings: its cell 0.61 m (the horn's length) over 0.9 of it across
    expect(hn.sc, `${where}: the horn's px/m`).toBe(cello.sc);
    expect(hn.w / hn.sc!, `${where}: its cell's width`).toBeCloseTo(0.61 / 0.9, 1);
    expect(hn.w, `${where}: wider than tall`).toBeGreaterThan(hn.h);
    // on the stage, clear of every other instrument's cell
    expect(hn.x).toBeGreaterThanOrEqual(stage.x0);
    expect(hn.x + hn.w).toBeLessThanOrEqual(stage.x1);
    for (const [j, o] of parts.entries())
      if (j !== 4) expect(hn.x < o.cell.x + o.cell.w && o.cell.x < hn.x + hn.w && hn.y < o.cell.y + o.cell.h && o.cell.y < hn.y + hn.h, `${where}: the horn's cell over ${o.voice} ${j}'s`).toBe(false);
    // drawn: ink over the circle (the right half of the cell: the bell flares out to the left)
    const body: Box = { x0: hn.x + hn.w * 0.6, x1: hn.x + hn.w * 0.85, y0: hn.y + hn.h * 0.35, y1: hn.y + hn.h * 0.75 };
    expect(await inked(page, body), `${where}: the horn drawn in its cell`).toBeGreaterThan(vector ? 0.12 : 0.25);
    await page.evaluate(() => (window as any).__orchestra.ensemble.parts[4].engine.noteOff(60));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
