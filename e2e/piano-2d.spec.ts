// The pianos on the 2D stage, in both styles, grand and upright: the strings fastened to something (the
// drawn look paints the plate's bronze pin block just past every string's pin end; the vector look draws
// lines past both ends), every string in view still opens its own key's close-up where it is clicked, no
// horizontal scroll, no error; the upright's strings in view hang at one level strike line's own heights
// (their tops stepping up towards the bass); and a small piano in the Orchestra still draws, in both styles.
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
type Str = { midi: number; x0: number; y0: number; x1: number; y1: number };
type Probe = { upright: boolean; strings: Str[]; box: { x0: number; x1: number; y0: number; y1: number }; stage: { x0: number; x1: number; y0: number; y1: number } };
const probe = (page: Page) => page.evaluate(() => (window as any).__piano2d?.() ?? null) as Promise<Probe | null>;
/** the stage canvas's colour at a client point (r, g, b) */
const colourAt = (page: Page, x: number, y: number) =>
  page.evaluate(([x, y]) => {
    const cv = document.querySelector('.stage-cv') as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    const k = cv.width / r.width;
    const c2 = Object.assign(document.createElement('canvas'), { width: cv.width, height: cv.height }).getContext('2d', { willReadFrequently: true })!;
    c2.drawImage(cv, 0, 0);
    // (a 3×3 mean: a pin or a lead may lie on the very pixel)
    const d = c2.getImageData(Math.round((x - r.left) * k) - 1, Math.round((y - r.top) * k) - 1, 3, 3).data;
    const s = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) s[j] += d[i + j] / 9;
    return s;
  }, [x, y]);

for (const kind of ['grand', 'upright'] as const)
  for (const style of ['classic', 'vector'] as const)
    test(`the ${kind} in 2D (${style}): its strings fastened to the plate, each still opening its own key’s close-up`, async ({ page }, info) => {
      const errors = collectErrors(page);
      await page.addInitScript((s) => {
        localStorage.setItem('piano-model.3d', '0');
        localStorage.setItem('piano-model.style', s);
      }, style);
      await page.goto(kind === 'upright' ? '/piano/upright' : '/piano');
      await startAudio(page);
      await expect.poll(async () => (await probe(page))?.upright, { timeout: 15_000 }).toBe(kind === 'upright');
      await page.waitForTimeout(700);
      const d = (await probe(page))!;
      const W = page.viewportSize()!.width;
      // the strings whose both ends are on the stage, away from its edges
      const seen = d.strings.filter((s) => [s.x0, s.x1].every((x) => x > 24 && x < W - 24) && [s.y0, s.y1].every((y) => y > d.stage.y0 + 4 && y < d.stage.y1 - 4));
      expect(seen.length).toBeGreaterThan(10);
      // the pin end is the front on a grand (below the bridge end on screen), the top on an upright
      for (const s of seen) expect(kind === 'grand' ? s.y0 - s.y1 : s.y1 - s.y0).toBeGreaterThan(0);
      if (kind === 'upright') {
        // the tops step up towards the bass: never down, and the lowest in view clearly above the highest
        for (let k = 1; k < seen.length; k++) if (seen[k].x0 === seen[k].x1 && seen[k - 1].x0 === seen[k - 1].x1) expect(seen[k].y0).toBeGreaterThanOrEqual(seen[k - 1].y0 - 0.01);
        expect(seen[0].y0).toBeLessThan(seen[seen.length - 1].y0 - 4);
      }
      if (style === 'classic') {
        // just past a string's pin end, between two keys' pins: the plate's bronze (warm, well lit), where
        // the case's flat brown was; and past its bridge end the open board is darker than the block
        const s = seen[Math.floor(seen.length / 2)];
        const pitch = Math.abs(seen[1].x0 - seen[0].x0);
        const away = kind === 'grand' ? 1 : -1;
        const block = await colourAt(page, s.x0 + pitch / 2, s.y0 + away * 6);
        expect(block[0]).toBeGreaterThan(85);
        expect(block[0]).toBeGreaterThan(block[1] + 12);
        expect(block[1]).toBeGreaterThan(block[2] + 15);
        const board = await colourAt(page, s.x0 + pitch / 2, (s.y0 + s.y1) / 2 + away * -0.2 * Math.abs(s.y1 - s.y0));
        expect(board[0]).toBeLessThan(block[0] - 20);
        info.annotations.push({ type: 'colours', description: JSON.stringify({ block, board }) });
      }
      // a string, clicked at its middle, opens its own key's close-up
      const phone = info.project.name !== 'desktop';
      const s = seen[Math.floor(seen.length * 0.6)];
      const [cx, cy] = [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2];
      if (phone) await page.touchscreen.tap(cx, cy);
      else await page.mouse.click(cx, cy);
      await expect(page.locator('.av-panel')).toBeVisible();
      expect(await page.evaluate(() => (window as any).__action?.midi)).toBe(s.midi);
      expect(await page.evaluate(() => (window as any).__action?.kind)).toBe(kind);
      await page.locator('.av-close').click();
      await expect(page.locator('.av-panel')).toHaveCount(0);
      // a note still lights its strings, and the page keeps its width
      await page.evaluate((m) => (window as any).__piano.noteOn(m, 100, 'keys'), s.midi);
      await page.waitForTimeout(300);
      await page.evaluate((m) => (window as any).__piano.noteOff(m, 'keys'), s.midi);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });

test('a small piano in the Orchestra (2D and vector): the grand and the upright draw among the strings', async ({ page }) => {
  const errors = collectErrors(page);
  for (const view of ['2d', 'vector'])
    for (const kind of ['grand', 'upright']) {
      await page.goto(`/orchestra?v=1&seats=violin,cello,${kind}&view=${view}`);
      await startAudio(page);
      await page.waitForFunction(() => (window as any).__orchestra?.ensemble?.parts?.length === 3 && (window as any).__orchestra.ensemble.parts.every((p: any) => p.engine), null, { timeout: 30_000 });
      await page.waitForTimeout(500);
      // the piano's cell (the stage's lower part) carries ink
      const ink = await page.evaluate(() => {
        const cv = document.querySelector('.stage-cv') as HTMLCanvasElement;
        const c2 = Object.assign(document.createElement('canvas'), { width: cv.width, height: cv.height }).getContext('2d', { willReadFrequently: true })!;
        c2.drawImage(cv, 0, 0);
        const y = Math.round(cv.height * 0.8);
        const d = c2.getImageData(0, y, cv.width, Math.round(cv.height * 0.15)).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) n++;
        return n / (d.length / 4);
      });
      expect(ink, `${kind} ${view}`).toBeGreaterThan(0.02);
    }
  expect(errors).toEqual([]);
});
