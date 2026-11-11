// The double bass on the 2D stage, in both styles: alone (whole on the stage, scroll to the endpin's
// point, under the file player and above the keys; on a phone its bow at both ends of its travel as
// well), and in a string quintet in Orchestra mode (at the group's one px/m, so larger than the cello
// beside it by its own size, every bow clear of the others, the group in the middle of the stage).
import { test, expect, type Page } from '@playwright/test';
import { closePicker, openPicker } from './picker.ts';

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};
async function startAudio(page: Page) {
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
const overlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
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
    for (let i = 0; i < d.length; i += 4 * 7) {
      m++;
      if (Math.max(d[i], d[i + 1], d[i + 2]) > 60) n++;
    }
    return n / m;
  }, b);

/** the stage's own style or the vector lines */
async function setStyle(page: Page, vector: boolean) {
  if (vector !== (await page.evaluate(() => document.documentElement.dataset.style === 'vector'))) await closePicker(page).then(() => page.locator('.vec-toggle').click());
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.style === 'vector')).toBe(vector);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('piano-model.3d', '0');
    localStorage.setItem('piano-model.style', 'classic');
  });
});

test('the double bass alone in 2D, both styles: whole on the stage, under the file player, above the keys; on a phone its bow at both ends of its travel too', async ({ page }, info) => {
  const errors = collectErrors(page);
  const phone = info.project.name === 'phone';
  await page.goto('/');
  await startAudio(page);
  await page.evaluate(() => (window as any).__piano.setInstrument('bass'));
  // (the phone: the Pixel 7, then 390×844, the narrowest the layout is kept for)
  for (const size of phone ? [null, { width: 390, height: 844 }] : [null]) {
    if (size) await page.setViewportSize(size);
    for (const vector of [false, true]) {
      await setStyle(page, vector);
      const where = `${vector ? 'vector' : 'classic'} ${page.viewportSize()!.width}×${page.viewportSize()!.height}`;
      for (const pos of [0, 1]) {
        // the bow in the hand (controllers 128 and 129: its speed, and the string's place along the hair)
        await page.evaluate((pos) => {
          const e = (window as any).__piano.piano;
          e.control(128, 0.25);
          e.control(129, pos);
        }, pos);
        await expect.poll(() => page.evaluate(() => (window as any).__bow2d()?.pos ?? -1), { message: `${where}: the bow at ${pos}` }).toBeCloseTo(pos, 2);
        const d = (await page.evaluate(() => (window as any).__bowed2d())) as { id: string; body: Box; bow: Box; stage: Box };
        expect(d.id).toBe('bass');
        const player = await rectOf(page, '.player');
        const keys = (await rectOf(page, '.keyboard'))!;
        const under = player ? Math.max(d.stage.y0, player.y1) : d.stage.y0;
        // the whole bass, scroll to the endpin's point and its widest bout, on the stage under the player
        const b = d.body;
        expect(b.x0, `${where}: the scroll on the stage`).toBeGreaterThanOrEqual(d.stage.x0 + 2);
        expect(b.x1, `${where}: the endpin on the stage`).toBeLessThanOrEqual(d.stage.x1 - 2);
        expect(b.y0, `${where}: under the player`).toBeGreaterThanOrEqual(under);
        expect(b.y1, `${where}: on the stage`).toBeLessThanOrEqual(d.stage.y1);
        expect(d.stage.y1, `${where}: the stage above the keys`).toBeLessThanOrEqual(keys.y0 + 1);
        // as large as the stage allows: it fills 95 % of its length (lying) or most of its height
        const len = Math.max(b.x1 - b.x0, b.y1 - b.y0);
        const room = b.x1 - b.x0 > b.y1 - b.y0 ? d.stage.x1 - d.stage.x0 : d.stage.y1 - under;
        expect(len / room, `${where}: its share of the stage`).toBeGreaterThan(phone ? 0.7 : 0.9);
        // drawn: ink over its box
        expect(await inked(page, b), `${where}: drawn`).toBeGreaterThan(0.2);
        // the hair as drawn: never over the file player; on a phone, at either end of its travel, all of
        // it on the stage under the player (on a laptop the bass fills the stage's length, and its bow,
        // with the frog or the tip on the string, runs past the stage's edge, as the cello's does)
        const l = (await page.evaluate(() => (window as any).__bow2d())) as { fx: number; fy: number; tx: number; ty: number };
        const hair: Box = { x0: Math.min(l.fx, l.tx) - 4, x1: Math.max(l.fx, l.tx) + 4, y0: Math.min(l.fy, l.ty), y1: Math.max(l.fy, l.ty) };
        if (player) expect(overlap(hair, player), `${where}: the bow clear of the file player`).toBe(false);
        if (phone) {
          for (const [k, v] of [['x0', d.bow.x0], ['y0', d.bow.y0]] as const) expect(v, `${where}: the bow's travel (${k}) on the stage`).toBeGreaterThanOrEqual(k === 'x0' ? d.stage.x0 : under);
          expect(d.bow.x1, `${where}: the bow's travel on the stage`).toBeLessThanOrEqual(d.stage.x1);
          expect(d.bow.y1, `${where}: the bow's travel on the stage`).toBeLessThanOrEqual(d.stage.y1);
          for (const [x, y] of [[l.fx, l.fy], [l.tx, l.ty]]) {
            expect(x, `${where}: the hair on the stage`).toBeGreaterThanOrEqual(d.stage.x0);
            expect(x, `${where}: the hair on the stage`).toBeLessThanOrEqual(d.stage.x1);
            expect(y, `${where}: the hair under the player`).toBeGreaterThanOrEqual(under);
            expect(y, `${where}: the hair on the stage`).toBeLessThanOrEqual(d.stage.y1);
          }
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${where}: no horizontal scroll`).toBe(true);
    }
  }
  await page.evaluate(() => (window as any).__piano.piano.control(130, 0));
  expect(errors).toEqual([]);
});

/** a part of the ensemble on the 2D stage (`__ens2d`): its cell (client px, and the group's px/m) and
 *  its hair as last drawn */
type Part = { voice: string; cell: { x: number; y: number; w: number; h: number; sc: number | null }; bow: { fx: number; fy: number; tx: number; ty: number; pos: number; hair: number } | null };
const ens = (page: Page) => page.evaluate(() => (window as any).__orchestra.ensemble.lineup as string[]);

test('orchestra in 2D, a string quintet with the double bass (and with two): the bass at the cello’s px/m, so 1.47 × its size, every bow clear of the others, the group centred, in both styles', async ({ page }, info) => {
  const errors = collectErrors(page);
  if (info.project.name === 'phone') await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await startAudio(page);
  await page.locator('.ens-toggle').click();
  await expect.poll(() => ens(page)).toEqual(['violin', 'violin', 'viola', 'cello']);
  await openPicker(page).then(() => page.locator('.pick[aria-label="Double bass"]').click());
  await expect.poll(() => ens(page)).toEqual(['violin', 'violin', 'viola', 'cello', 'bass']);
  const stage = (await rectOf(page, '.stage-cv'))!;
  for (const lineup of [['violin', 'violin', 'viola', 'cello', 'bass'], ['violin', 'violin', 'viola', 'cello', 'bass', 'bass']]) {
    if (lineup.length === 6) {
      await openPicker(page).then(() => page.locator('.pick[aria-label="Double bass"]').click());
      await expect.poll(() => ens(page)).toEqual(lineup);
    }
    await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.filter((p: any) => p.frame).length), { timeout: 10_000 }).toBe(lineup.length);
    for (const vector of [false, true]) {
      await setStyle(page, vector);
      const under = Math.max(stage.y0, (await rectOf(page, '.player'))?.y1 ?? 0);
      const ends: Part[][] = [];
      for (const pos of [0, 1]) {
        await page.evaluate((pos) => {
          for (const p of (window as any).__orchestra.ensemble.parts) {
            p.engine.control(128, 0.25);
            p.engine.control(129, pos);
          }
        }, pos);
        await expect.poll(() => page.evaluate(() => ((window as any).__ens2d() as Part[]).map((p) => p.bow?.pos))).toEqual(lineup.map(() => pos));
        ends.push(await page.evaluate(() => (window as any).__ens2d()));
      }
      const where = `${lineup.length} parts, ${vector ? 'vector' : 'classic'}`;
      for (const parts of ends) {
        expect(parts.map((p) => p.voice)).toEqual(lineup);
        const ci = lineup.indexOf('cello');
        const cello = parts[ci].cell;
        // one px/m for the group: the bass's the cello's, so its length (scroll to endpin) 1.48 × the
        // cello's (scroll to its endpin's cut) and its body 1.47 × (1110 / 755 mm)
        lineup.forEach((v, i) => {
          if (v !== 'bass') return;
          const c = parts[i].cell;
          expect(c.sc, `${where}: the bass's px/m`).toBe(cello.sc);
          expect(Math.max(c.w, c.h) / Math.max(cello.w, cello.h), `${where}: the bass's length over the cello's`).toBeCloseTo(2.0255 / 1.3698, 1);
          expect(Math.min(c.w, c.h) / Math.min(cello.w, cello.h), `${where}: the bass's width over the cello's`).toBeGreaterThan(1.4);
          // its hair, its own 0.58 m at the group's scale
          const b = parts[i].bow!;
          expect(b.hair).toBe(0.58);
          // (in plan its hair is shortened by the bridge's arch under the string it plays: cos 9° on an
          // inner string, cos 26° on an outer)
          const k = Math.hypot(b.tx - b.fx, b.ty - b.fy) / (0.58 * c.sc!);
          expect(k, `${where}: the bass's bow at the group's scale`).toBeGreaterThan(0.88);
          expect(k, `${where}: the bass's bow at the group's scale`).toBeLessThan(1.01);
        });
        // every bow on the stage under the player and through no other instrument
        for (const [i, p] of parts.entries()) {
          const b = p.bow!;
          const n = Math.ceil(Math.hypot(b.tx - b.fx, b.ty - b.fy) / 2);
          for (let k = 0; k <= n; k++) {
            const [x, y] = [b.fx + ((b.tx - b.fx) * k) / n, b.fy + ((b.ty - b.fy) * k) / n];
            if (k === 0 || k === n) {
              expect(x, `${where}: ${p.voice} ${i}'s bow on the stage`).toBeGreaterThan(stage.x0 + 2);
              expect(x, `${where}: ${p.voice} ${i}'s bow on the stage`).toBeLessThan(stage.x1 - 2);
              expect(y, `${where}: ${p.voice} ${i}'s bow under the player`).toBeGreaterThan(under);
              expect(y, `${where}: ${p.voice} ${i}'s bow on the stage`).toBeLessThan(stage.y1);
            }
            for (const [j, o] of parts.entries())
              if (j !== i) expect(x > o.cell.x && x < o.cell.x + o.cell.w && y > o.cell.y && y < o.cell.y + o.cell.h, `${where}: ${p.voice} ${i}'s bow through ${o.voice} ${j}`).toBe(false);
          }
        }
      }
      // the group (instruments and hair at both ends of the travel) in the middle of the stage
      const xs = ends.flat().flatMap((p) => [p.cell.x, p.cell.x + p.cell.w, p.bow!.fx, p.bow!.tx]);
      const ys = ends.flat().flatMap((p) => [p.cell.y, p.cell.y + p.cell.h, p.bow!.fy, p.bow!.ty]);
      const [L, R] = [Math.min(...xs) - stage.x0, stage.x1 - Math.max(...xs)];
      const [T, B] = [Math.min(...ys) - under, stage.y1 - Math.max(...ys)];
      expect(Math.abs(L - R), `${where}: left ${L.toFixed(0)} px, right ${R.toFixed(0)} px`).toBeLessThan(0.04 * (stage.x1 - stage.x0));
      expect(Math.abs(T - B), `${where}: top ${T.toFixed(0)} px, bottom ${B.toFixed(0)} px`).toBeLessThan(0.04 * (stage.y1 - under));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  await page.evaluate(() => (window as any).__orchestra.ensemble.parts.forEach((p: any) => p.engine.control(130, 0)));
  expect(errors).toEqual([]);
});
