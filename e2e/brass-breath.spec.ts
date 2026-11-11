// The brass take the breath into their mouthpieces as the reeds do (stage-draw breathStream, vector/kit.ts
// breathFlow): on the 2D stage, in both styles, the streams show just outside the mouthpiece's rim while the
// engine's note sounds (its own lips and level, from the worklet) and are gone at rest. The horn and the
// trombone, whose drawings say where their mouthpieces are (`__horn2d`, `__trombone2d`).
import { test, expect, type Page } from '@playwright/test';

async function startAudio(page: Page) {
  await page.waitForFunction(() => !!(window as any).__piano);
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
}
type Box = { x0: number; x1: number; y0: number; y1: number };
/** the pixels of a box on the stage's canvas in the breath's ink: the drawn style's steel (bluer than it is
 *  red, over the warm dark ground), the vector style's green */
const breathPx = (page: Page, b: Box, vector: boolean) =>
  page.evaluate(
    ([b, vector]) => {
      const cv = document.querySelector('.stage-cv') as HTMLCanvasElement;
      const r = cv.getBoundingClientRect();
      const k = cv.width / r.width;
      const c2 = Object.assign(document.createElement('canvas'), { width: cv.width, height: cv.height }).getContext('2d', { willReadFrequently: true })!;
      c2.drawImage(cv, 0, 0);
      const [x0, y0] = [Math.round((b.x0 - r.left) * k), Math.round((b.y0 - r.top) * k)];
      const [w, h] = [Math.max(1, Math.round((b.x1 - b.x0) * k)), Math.max(1, Math.round((b.y1 - b.y0) * k))];
      const d = c2.getImageData(x0, y0, w, h).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const [R, G, B] = [d[i], d[i + 1], d[i + 2]];
        if (vector ? G > R + 40 && G > B + 10 && G > 60 : B > R + 8 && B > 35) n++;
      }
      return n;
    },
    [b, vector] as const,
  );
async function setStyle(page: Page, vector: boolean) {
  if (vector !== (await page.evaluate(() => document.documentElement.dataset.style === 'vector'))) await page.locator('.vec-toggle').click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.style === 'vector')).toBe(vector);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('piano-model.3d', '0');
    localStorage.setItem('piano-model.style', 'classic');
    // the region the breath streams through (client px), round the rim's point and the axis out of the cup:
    // from 2 mm out to 16 mm (at least 16 px: a small stage's streams are drawn a few px long), 6.5 mm (at
    // least 6 px) either side, as the box round it
    (window as any).__breathBox = (rim: number[], u: number[], sc: number) => {
      const a0 = 0.002 * sc;
      const a1 = Math.max(0.016 * sc, 16);
      const w = Math.max(0.0065 * sc, 6);
      const xs: number[] = [];
      const ys: number[] = [];
      for (const a of [a0, a1])
        for (const s of [-w, w]) {
          xs.push(rim[0] + u[0] * a - u[1] * s);
          ys.push(rim[1] + u[1] * a + u[0] * s);
        }
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    };
  });
});

/** where each one's breath goes in (horn-draw.ts and trombone-draw.ts record where they drew the mouthpiece) */
const REGIONS = {
  horn: {
    note: 55,
    region: (page: Page) =>
      page.evaluate(() => {
        // (horn-draw.ts: the mouth box is 30 mm left and 35 mm right of the rim, 22 mm above it; the axis out
        // of the cup up and to the left, 75° from level: horn-plan MP_DIR)
        const d = (window as any).__horn2d();
        if (!d) return null;
        const sc = (d.mouth.x1 - d.mouth.x0) / 0.065;
        const rim = [d.mouth.x0 + 0.03 * sc, d.mouth.y0 + 0.022 * sc];
        const u = [-Math.cos((75 * Math.PI) / 180), -Math.sin((75 * Math.PI) / 180)];
        return { box: (window as any).__breathBox(rim, u, sc), sc };
      }) as Promise<{ box: Box; sc: number } | null>,
  },
  trombone: {
    note: 53,
    region: (page: Page) =>
      page.evaluate(() => {
        // (trombone-draw.ts: the mouth box from 30 mm behind the rim, the rim on the slide's axis; the axis out
        // of the cup to the left)
        const d = (window as any).__trombone2d();
        if (!d) return null;
        const sc = d.pxPerM;
        const rim = [d.mouth.x0 + 0.03 * sc, (d.mouth.y0 + d.mouth.y1) / 2];
        return { box: (window as any).__breathBox(rim, [-1, 0], sc), sc };
      }) as Promise<{ box: Box; sc: number } | null>,
  },
} as const;

for (const [inst, { note, region }] of Object.entries(REGIONS))
  test(`the ${inst} takes the breath into its mouthpiece as the reeds do, in both 2D styles: streams at the rim while the note sounds, none at rest`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`/${inst}`);
    await startAudio(page);
    await page.evaluate((i) => (window as any).__piano.setInstrument(i), inst);
    for (const vector of [false, true]) {
      await setStyle(page, vector);
      await page.waitForTimeout(500);
      const at = await region(page);
      expect(at, `${inst}: drawn`).not.toBeNull();
      // (the vector style's slot handles are placed in metres round the mouthpiece: on a stage that draws the
      // instrument small — the trombone on a phone, ≈210 px/m — they sit over the breath, which cannot then be
      // told from them by its colour; the drawn style is measured on every stage)
      if (vector && at!.sc < 300) continue;
      const box = at!.box;
      const rest = await breathPx(page, box!, vector);
      await page.evaluate((m) => (window as any).__piano.noteOn(m, 100, 'keys'), note);
      // (the streams' dashes and the lips' pulse move: the most of a few looks)
      let most = 0;
      for (let k = 0; k < 6; k++) {
        await page.waitForTimeout(k ? 150 : 900);
        most = Math.max(most, await breathPx(page, box!, vector));
      }
      await page.evaluate((m) => (window as any).__piano.noteOff(m, 'keys'), note);
      const where = `${inst}, ${vector ? 'vector' : 'drawn'}`;
      expect(most, `${where}: the breath's pixels while sounding (at rest ${rest})`).toBeGreaterThan(rest + 6);
      // gone again once the note has stopped
      await expect.poll(() => breathPx(page, box!, vector), { timeout: 5000, message: `${where}: at rest again` }).toBeLessThanOrEqual(rest + 2);
    }
    expect(errors).toEqual([]);
  });
