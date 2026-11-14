// The harp, photographed: alone at rest and ringing (a chord plucked, then as it rings), in 2D, vector lines
// and 3D, on a computer and a phone; 3D also from close (the neck's action, the column's head), from behind
// (the soundbox's holes) and seated in an orchestra.
//   BASE=http://localhost:4312 OUT=artifacts/harp-visual SET=before|after node scripts/shots-harp-visual.mjs
//   (ONLY=desktop|phone, LOOKS=2d,vector,3d, WIDE=1 for 1920×1080)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4312';
const SET = process.env.SET ?? 'after';
const OUT = `${process.env.OUT ?? 'artifacts/harp-visual'}/${SET}`;
const ONLY = process.env.ONLY ?? '';
const LOOKS = (process.env.LOOKS ?? '2d,vector,3d').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu', '--mute-audio'] });
const DEVS = {
  desktop: { viewport: process.env.WIDE ? { width: 1920, height: 1080 } : { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const CHORD = [36, 48, 55, 64, 72, 79];
for (const [dev, opts] of Object.entries(DEVS)) {
  if (ONLY && ONLY !== dev) continue;
  for (const look of LOOKS) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`pageerror ${look}: ${e.message}`));
    await page.goto(`${BASE}/harp?view=${look}`);
    await page.evaluate(() => window.__piano.start());
    await page.waitForFunction(() => window.__piano?.status === 'running', null, { timeout: 30_000 });
    if (look === '3d') await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 60_000 });
    await page.waitForTimeout(look === '3d' ? 2500 : 1200);
    await page.locator('.stage').screenshot({ path: `${OUT}/${dev}-${look}-rest.png` });
    // a chord plucked: the picture a moment after the pluck, then as it rings
    const pluck = () => page.evaluate((ms) => ms.forEach((m, i) => setTimeout(() => window.__piano.noteOn(m, 104, 'keys'), i * 60)), CHORD);
    await pluck();
    await page.waitForTimeout(430);
    await page.locator('.stage').screenshot({ path: `${OUT}/${dev}-${look}-plucked.png` });
    await page.waitForTimeout(900);
    await page.locator('.stage').screenshot({ path: `${OUT}/${dev}-${look}-ringing.png` });
    await page.evaluate((ms) => ms.forEach((m) => window.__piano.noteOff(m, 'keys')), CHORD);
    if (look === '3d' && dev === 'desktop') {
      const home = await page.evaluate(() => window.__stage3d.home);
      for (const [tag, v] of [['close', { dist: home.dist * 0.42, yaw: -0.35, pitch: 0.05, target: [-0.05, 1.5, 0] }], ['neck', { dist: home.dist * 0.3, yaw: -0.9, pitch: 0.12, target: [0.0, 1.45, 0] }], ['behind', { yaw: Math.PI - 0.9, pitch: 0.2 }], ['foot', { dist: home.dist * 0.45, yaw: -0.7, pitch: 0.35, target: [0.1, 0.25, 0] }]]) {
        await page.evaluate((v) => {
          window.__stage3d.resetView();
          window.__stage3d.setView(v);
        }, v);
        await page.waitForTimeout(500);
        if (tag === 'close' || tag === 'neck') {
          await pluck();
          await page.waitForTimeout(430);
        } else await page.waitForTimeout(300);
        await page.locator('.stage').screenshot({ path: `${OUT}/${dev}-3d-${tag}.png` });
      }
    }
    console.log(`${dev}-${look}`);
    await ctx.close();
  }
  if (process.env.SOLO) continue;
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
