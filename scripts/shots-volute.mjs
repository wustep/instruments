// The volute on the stage: 2D and 3D, at rest and sounding, desktop and phone; the picker; the
// ensemble with it.
//   OUT=<dir> BASE=http://localhost:4311 node scripts/shots-volute.mjs [only]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'artifacts/round3/volute/shots';
const BASE = process.env.BASE ?? 'http://localhost:4311';
const ONLY = process.argv[2];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const VIEWS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const errors = [];
async function open(view, d3, inst = 'volute') {
  const ctx = await browser.newContext(VIEWS[view]);
  await ctx.addInitScript(([i, d]) => { localStorage.setItem('piano-model.instrument', i); localStorage.setItem('piano-model.3d', d ? '1' : '0'); }, [inst, d3]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(BASE + '/');
  await page.waitForTimeout(900);
  await page.evaluate(async () => { await window.__piano.start(); });
  await page.waitForTimeout(d3 ? 1800 : 600);
  return { ctx, page };
}
const play = (page, notes, vel = 96) => page.evaluate(async ([n, v]) => { for (const m of n) { window.__piano.noteOn(m, v, 'keys'); await new Promise((r) => setTimeout(r, 70)); } }, [notes, vel]);
const SHOTS = [
  ['2d-rest', 'desktop', false, null],
  ['2d-chord', 'desktop', false, [36, 48, 55, 60, 64, 67, 72]],
  ['2d-phone', 'phone', false, [48, 60, 64, 67]],
  ['3d-rest', 'desktop', true, null],
  ['3d-chord', 'desktop', true, [36, 48, 55, 60, 64, 67, 72]],
  ['3d-phone', 'phone', true, [48, 60, 64, 67]],
];
for (const [name, view, d3, notes] of SHOTS) {
  if (ONLY && !name.includes(ONLY)) continue;
  const { ctx, page } = await open(view, d3);
  if (notes) {
    await play(page, notes);
    await page.waitForTimeout(1300);
  }
  await page.screenshot({ path: `${OUT}/${name}.png` });
  if (name === '2d-chord') {
    // the bars just struck, and the halo after the keys are let go
    await page.evaluate(() => { for (const m of [36, 48, 55, 60, 64, 67, 72]) window.__piano.noteOff(m, 'keys'); });
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT}/2d-halo.png` });
    await play(page, [60, 67, 76, 84], 120);
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${OUT}/2d-struck.png` });
    const b = await page.locator('.instruments').boundingBox();
    await page.screenshot({ path: `${OUT}/picker.png`, clip: { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 14), width: b.width + 24, height: b.height + 26 } });
  }
  const m = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: innerWidth, status: window.__piano.state?.value ?? null }));
  console.log(name, JSON.stringify(m));
  await ctx.close();
}
if (!ONLY || 'ensemble'.includes(ONLY)) {
  for (const d3 of [false, true]) {
    const { ctx, page } = await open('desktop', d3, 'piano');
    await page.evaluate(async () => {
      const o = window.__orchestra.ensemble;
      o.enter({ parts: ['flute', 'violin', 'cello', 'volute'].map((voice) => ({ voice, lines: [] })), lines: [] }, null, null, true);
      await o.ensureEngines();
    });
    await page.waitForTimeout(d3 ? 2500 : 1200);
    await play(page, [48, 60, 67, 72, 76]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/ensemble-${d3 ? '3d' : '2d'}.png` });
    await ctx.close();
  }
}
console.log(errors.length ? `errors:\n${[...new Set(errors)].join('\n')}` : 'no page errors');
await browser.close();
