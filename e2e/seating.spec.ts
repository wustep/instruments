// The Orchestra seated as an orchestra (orchestra/seats.ts): Beethoven's Fifth's preset, and the same with three
// trombones, on a computer and a phone, in 2D, vector lines and 3D. The strings in front (the bottom of the
// stage), first violins at the audience's left and the cellos at the right; the woodwinds behind them; the brass
// and the timpani at the back. Read where the stage draws each seat (`__seatAt`: the middle of its cell in 2D,
// of its instrument in 3D), so the test sees what a person sees. In 3D every seat is on the picture under the
// file player, a back-row instrument opens its section's menu when tapped, and the risers draw without one WebGL
// warning.
import { test, expect, type Page } from '@playwright/test';
import { SYMPHONY } from '../apps/web/test/presets.ts';

const B5 = ['flute', 'flute', 'oboe', 'oboe', 'clarinet', 'clarinet', 'bassoon', 'bassoon', 'horn', 'horn', 'trumpet', 'trumpet', 'timpani', 'violin', 'violin', 'viola', 'cello', 'bass'];
/** the symphony with three trombones after the trumpets (no routing: seated, waiting for a file) */
const B5_TB = [...B5.slice(0, 12), 'trombone', 'trombone', 'trombone', ...B5.slice(12)];
const TROMBONES = `/orchestra?v=1&seats=${B5_TB.join(',')}`;

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' || /webgl|GL_[A-Z_]{4,}|feedback loop|framebuffer/i.test(m.text())) errors.push(`${m.type()}: ${m.text()}`);
  });
  return errors;
};
/** every seat's place on the screen (CSS px), once the stage has drawn them all */
const seatsOnScreen = async (page: Page, n: number): Promise<[number, number][]> => {
  await expect.poll(() => page.evaluate((n) => Array.from({ length: n }, (_, k) => (window as any).__seatAt(k)).every(Boolean), n), { timeout: 15_000 }).toBe(true);
  return page.evaluate((n) => Array.from({ length: n }, (_, k) => (window as any).__seatAt(k)), n);
};
const of = (lineup: string[], ...v: string[]) => lineup.flatMap((x, i) => (v.includes(x) ? [i] : []));

for (const [name, at, lineup] of [['Beethoven’s Fifth (its preset, 18 seats)', SYMPHONY, B5], ['with three trombones (21 seats)', TROMBONES, B5_TB]] as [string, string, string[]][])
  test(`seating: ${name} sits as an orchestra in 2D, vector lines and 3D: strings in front, woodwinds behind, brass and timpani at the back`, async ({ page }, info) => {
    test.setTimeout(60_000);
    const phone = info.project.name === 'phone';
    const errors = collectErrors(page);
    for (const look of ['2d', 'vector', '3d']) {
      await page.goto(`${at}&view=${look}`);
      expect(await page.evaluate(() => (window as any).__orchestra.ensemble.lineup)).toEqual(lineup);
      if (look === '3d') await expect(page.locator('.stage-3d')).toBeVisible();
      const p = await seatsOnScreen(page, lineup.length);
      const y = (is: number[]) => is.map((i) => p[i][1]);
      const x = (is: number[]) => is.map((i) => p[i][0]);
      const upper = of(lineup, 'violin', 'viola', 'cello');
      const winds = of(lineup, 'flute', 'oboe', 'clarinet', 'bassoon');
      const brass = of(lineup, 'horn', 'trumpet', 'trombone');
      const [timp] = of(lineup, 'timpani');
      const who = `${look}`;
      // front to back is bottom to top: every woodwind above every violin, viola and cello; every brass
      // instrument above every woodwind
      expect(Math.max(...y(winds)), who).toBeLessThan(Math.min(...y(upper)));
      expect(Math.max(...y(brass)), who).toBeLessThan(Math.min(...y(winds)));
      // the first violins at the audience's left of the cellos; the flutes left of the oboes, the horns of the trumpets
      const [v1] = of(lineup, 'violin');
      const [vc] = of(lineup, 'cello');
      expect(p[v1][0], who).toBeLessThan(p[vc][0]);
      expect(Math.max(...x(of(lineup, 'flute'))), who).toBeLessThan(Math.min(...x(of(lineup, 'oboe'))));
      expect(Math.max(...x(of(lineup, 'horn'))), who).toBeLessThan(Math.min(...x(of(lineup, 'trumpet'))));
      // the double bass at the right, by the cellos
      const [cb] = of(lineup, 'bass');
      expect(p[cb][0], who).toBeGreaterThan(p[vc][0] - 20);
      // the timpani at the back: above the strings and the first woodwinds, at the brass's left (on a phone in
      // 3D, a row of their own behind the brass)
      expect(p[timp][1], who).toBeLessThan(Math.min(...y(upper)));
      if (look === '3d' && phone) expect(p[timp][1], who).toBeLessThan(Math.min(...y(brass)));
      else if (look === '3d') expect(p[timp][0], who).toBeLessThan(Math.min(...x(of(lineup, 'horn'))));
      // every seat on the stage, under the file player, none on top of another
      const stage = (await page.locator(look === '3d' ? '.stage-3d' : 'canvas.stage-cv').first().boundingBox())!;
      const player = (await page.locator('.player').boundingBox())!;
      for (let k = 0; k < lineup.length; k++) {
        expect(p[k][0], `${who} ${lineup[k]} ${k}`).toBeGreaterThan(stage.x);
        expect(p[k][0], `${who} ${lineup[k]} ${k}`).toBeLessThan(stage.x + stage.width);
        expect(p[k][1], `${who} ${lineup[k]} ${k}`).toBeGreaterThan(player.y + player.height);
        expect(p[k][1], `${who} ${lineup[k]} ${k}`).toBeLessThan(stage.y + stage.height);
        for (let j = 0; j < k; j++) expect(Math.hypot(p[k][0] - p[j][0], p[k][1] - p[j][1]), `${who} ${lineup[k]} ${k} on ${lineup[j]} ${j}`).toBeGreaterThan(4);
      }
      if (look === '3d') {
        // the risers and every instrument draw without a WebGL error
        const glErrs = await page.evaluate(async () => {
          const gl = (window as any).__stage3d.r3.r.getContext() as WebGL2RenderingContext;
          let errs = 0;
          for (let i = 0; i < 20; i++) {
            await new Promise((r) => requestAnimationFrame(r));
            for (let e = gl.getError(); e; e = gl.getError()) errs++;
          }
          return errs;
        });
        expect(glErrs).toBe(0);
        // a back-row instrument tapped opens its section's menu (the timpani, behind everyone)
        if (phone) await page.touchscreen.tap(p[timp][0], p[timp][1]);
        else await page.mouse.click(p[timp][0], p[timp][1]);
        await expect(page.locator('.pl-menu')).toHaveAttribute('aria-label', 'timpani');
        await page.keyboard.press('Escape');
      }
    }
    expect(errors).toEqual([]);
  });
