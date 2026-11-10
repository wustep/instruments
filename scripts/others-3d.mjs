// The other instruments' 3D views, at rest (no note sounding), for a before/after comparison of a
// change that should not touch them: violin, viola, cello, flute, trumpet at 1440×900 and 390×844.
//   OUT=<dir> TAG=before|after BASE=http://localhost:5311 node scripts/others-3d.mjs
// Then compare the pairs (e.g. with PIL: the largest and the mean difference per shot).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/5-webgl/others';
const TAG = process.env.TAG ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:5311';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
for (const [dev, opts] of [['desktop', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }], ['phone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
  for (const inst of ['violin', 'viola', 'cello', 'flute', 'trumpet']) {
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript((i) => {
      localStorage.setItem('piano-model.instrument', i);
      localStorage.setItem('piano-model.3d', '1');
    }, inst);
    const page = await ctx.newPage();
    const gl = [];
    page.on('console', (m) => /webgl|GL_/i.test(m.text()) && gl.push(m.text()));
    await page.goto(`${BASE}/`);
    await page.evaluate(async (i) => {
      await window.__piano.start();
      await window.__piano.setInstrument(i);
    }, inst);
    await page.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 30, null, { timeout: 20000 });
    await page.waitForTimeout(800);
    await page.locator('.stage-3d').screenshot({ path: `${OUT}/${dev}-${inst}-${TAG}.png` });
    console.log(`${dev}-${inst}-${TAG}  webgl messages ${gl.length}`);
    await ctx.close();
  }
}
await browser.close();
