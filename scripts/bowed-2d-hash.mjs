// The violin family's 2D drawings, hashed: each bowed instrument rendered offscreen with the stage's own
// modules (from a Vite dev server), deterministic (no frame: the bow lifted, the plate silent), in both
// styles, alone and at an ensemble's scale, in a laptop's, a phone's and an upright box; one hash of the
// pixels per render. Run it before and after a change to see which drawings moved (the double bass's
// 2D work left the violin's, viola's and cello's 36 renders identical).
//   BASE=http://localhost:5395 [IDS=violin,viola,cello,bass] [OUT=<dir for the laptop-size PNGs>] node scripts/bowed-2d-hash.mjs
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:5395';
const OUT = process.env.OUT;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
if (process.env.IDS) await page.addInitScript((ids) => (window.__IDS = ids), process.env.IDS.split(','));
await page.goto(BASE + '/');
await page.waitForTimeout(1200);
const res = await page.evaluate(async () => {
  const sd = await import('/src/ui/stage-draw.ts');
  const vk = await import('/src/ui/vector/index.ts');
  const ens = await import('/src/ui/ensemble-draw.ts');
  const out = {};
  const pngs = {};
  for (const id of (window.__IDS ?? ['violin', 'viola', 'cello'])) {
    for (const [W, H] of [[1440, 532], [390, 366], [390, 520]]) {
      for (const vec of [false, true]) {
        for (const inEns of [false, true]) {
          const cv = document.createElement('canvas');
          cv.width = W * 2;
          cv.height = H * 2;
          const ctx = cv.getContext('2d');
          ctx.setTransform(2, 0, 0, 2, 0, 0);
          const g = ens.newPartDraw(id).bowed.geom;
          const st = { strScale: new sd.AutoScale(2e-6), lvlScale: new sd.AutoScale(1e-6, 0.995) };
          const field = vec ? new vk.Contours(64, 36, 1.8, 0.6) : new sd.ModeField(150, 84, 1.8, 0.6);
          const scale = inEns ? 300 : undefined;
          for (const now of [1000, 1016]) {
            ctx.clearRect(0, 0, W, H);
            const r = vec ? vk.drawBowedV(ctx, W, H, g, null, st, field, now, inEns, scale) : sd.drawBowed(ctx, W, H, g, null, st, field, now, inEns, scale);
            if (r) r();
          }
          const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
          let h = 2166136261 >>> 0;
          for (let i = 0; i < d.length; i += 1) h = Math.imul(h ^ d[i], 16777619) >>> 0;
          const k = `${id} ${W}x${H} ${vec ? 'vector' : 'classic'}${inEns ? ' ens' : ''}`;
          out[k] = h.toString(16);
          if (W === 1440 && !inEns) pngs[k] = cv.toDataURL('image/png');
        }
      }
    }
  }
  return { out, pngs };
});
for (const [k, v] of Object.entries(res.out)) console.log(k.padEnd(34), v);
if (OUT) for (const [k, v] of Object.entries(res.pngs)) writeFileSync(`${OUT}/${k.replace(/ /g, '_')}.png`, Buffer.from(v.split(',')[1], 'base64'));
await browser.close();
