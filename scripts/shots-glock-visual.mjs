// The glockenspiel, photographed: alone at rest and ringing (a chord struck, then a roll's stroke in the
// air), in 2D, vector lines and 3D, on a computer and a phone; 3D also from close (the bars' ends, the
// frame) and seated in an orchestra.
//   BASE=http://localhost:4733 OUT=artifacts/glock-visual SET=before|after node scripts/shots-glock-visual.mjs
//   (ONLY=desktop|phone, LOOKS=2d,vector,3d)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4733';
const SET = process.env.SET ?? 'after';
const OUT = `${process.env.OUT ?? 'artifacts/glock-visual'}/${SET}`;
const ONLY = process.env.ONLY ?? '';
const LOOKS = (process.env.LOOKS ?? '2d,vector,3d').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
for (const [dev, opts] of Object.entries(DEVS)) {
  if (ONLY && ONLY !== dev) continue;
  for (const look of LOOKS) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`pageerror ${look}: ${e.message}`));
    await page.goto(`${BASE}/glockenspiel?view=${look}`);
    await page.evaluate(() => window.__piano.start());
    await page.waitForFunction(() => window.__piano?.status === 'running', null, { timeout: 30_000 });
    if (look === '3d') await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 60_000 });
    await page.waitForTimeout(look === '3d' ? 2500 : 1200);
    await page.locator('.stage').screenshot({ path: `${OUT}/${dev}-${look}-rest.png` });
    // a chord struck: the picture a moment after the strokes, then as it rings
    await page.evaluate(() => [84, 88, 91, 96].forEach((m, i) => setTimeout(() => window.__piano.noteOn(m, 100, 'keys'), i * 90)));
    await page.waitForTimeout(330);
    await page.locator('.stage').screenshot({ path: `${OUT}/${dev}-${look}-struck.png` });
    await page.waitForTimeout(700);
    await page.locator('.stage').screenshot({ path: `${OUT}/${dev}-${look}-ringing.png` });
    await page.evaluate(() => [84, 88, 91, 96].forEach((m) => window.__piano.noteOff(m, 'keys')));
    if (look === '3d' && dev === 'desktop') {
      const home = await page.evaluate(() => window.__stage3d.home);
      for (const [tag, v] of [['close', { dist: home.dist * 0.42 / 1, yaw: 0.5, pitch: 0.45 }], ['low', { yaw: -0.6, pitch: 0.12, dist: home.dist * 0.6 }], ['behind', { yaw: Math.PI + 0.3, pitch: 0.4 }], ['top', { yaw: 0, pitch: 1.2 }]]) {
        await page.evaluate((v) => {
          window.__stage3d.resetView();
          window.__stage3d.setView(v);
        }, v);
        await page.waitForTimeout(700);
        await page.locator('.stage').screenshot({ path: `${OUT}/${dev}-3d-${tag}.png` });
      }
    }
    console.log(`${dev}-${look}`);
    await ctx.close();
  }
  // seated among others
  for (const look of LOOKS) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/passiton?view=${look}`);
    await page.evaluate(() => window.__piano.start());
    await page.waitForFunction(() => window.__piano?.status === 'running', null, { timeout: 30_000 });
    if (look === '3d') await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 60_000 });
    await page.waitForTimeout(look === '3d' ? 2500 : 1200);
    await page.locator('.stage').screenshot({ path: `${OUT}/${dev}-${look}-passiton.png` });
    console.log(`${dev}-${look}-passiton`);
    await ctx.close();
  }
}
await browser.close();
