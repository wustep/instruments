// The grand's lid and the room (reverb) controls on the stage, in 2D (classic and vector) and 3D, on a
// laptop and a phone: the same shots on both builds (before: the grips of #36; after: the knobs).
//   OUT=<dir> TAG=before|after BASE=http://localhost:5382 [PHONE=0|1] [ONLY=2d,vector,3d] node scripts/shots-lid-knobs.mjs
// Writes <OUT>/<desktop|phone>-<look>-<shot>-<TAG>.png (the whole stage view, controls and all):
//  - 2d / vector: lid-100, lid-70, lid-35, lid-0 (2D is continuous: any opening), room-0, room-100;
//  - 3d: lid-100 (long stick), lid-45 (short stick), lid-0 (shut), room-0, room-100, and on a build
//    with the lid taken on the canvas, drag-held (the lid brought down by hand, between the rests, under 0.65) and
//    drag-let-go (0.9 s after: on its nearest rest).
// Prints each shot's lid, room and (3D) sticks.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/lid-knobs/raw';
const TAG = process.env.TAG ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:5382';
const ONLY = (process.env.ONLY ?? '2d,vector,3d').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEV = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const STILL = {
  '2d': { 'lid-100': { lid: 1, room: 0.3 }, 'lid-70': { lid: 0.7, room: 0.3 }, 'lid-35': { lid: 0.35, room: 0.3 }, 'lid-0': { lid: 0, room: 0.3 }, 'room-0': { lid: 1, room: 0 }, 'room-100': { lid: 1, room: 1 } },
  '3d': { 'lid-100': { lid: 1, room: 0.3 }, 'lid-45': { lid: 0.45, room: 0.3 }, 'lid-0': { lid: 0, room: 0.3 }, 'room-0': { lid: 1, room: 0 }, 'room-100': { lid: 1, room: 1 } },
};
STILL.vector = STILL['2d'];
for (const dev of Object.keys(DEV)) {
  if (process.env.PHONE === '1' && dev !== 'phone') continue;
  if (process.env.PHONE === '0' && dev !== 'desktop') continue;
  for (const look of ONLY) {
    const ctx = await browser.newContext(DEV[dev]);
    await ctx.addInitScript((lk) => {
      localStorage.setItem('piano-model.instrument', 'piano');
      localStorage.setItem('piano-model.3d', lk === '3d' ? '1' : '0');
      localStorage.setItem('piano-model.style', lk === 'vector' ? 'vector' : 'classic');
    }, look);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/piano`);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      await window.__piano.start();
      await window.__piano.setPreset('grand');
    });
    if (look === '3d') await page.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 20000 });
    await page.waitForTimeout(800);
    const p = (k) => page.evaluate((key) => window.__piano.piano.params[key], k);
    const sticks = () => (look === '3d' ? page.evaluate(() => JSON.stringify(window.__stage3d.sticks.map((k) => +k.toFixed(2)))) : '');
    const shot = (name) => page.locator('.view.stage').screenshot({ path: `${OUT}/${dev}-${look}-${name}-${TAG}.png` });
    for (const [name, params] of Object.entries(STILL[look])) {
      await page.evaluate((q) => window.__piano.setParams(q), params);
      await page.waitForTimeout(900);
      await shot(name);
      console.log(`${dev}-${look}-${name}-${TAG}`.padEnd(34), `lid ${await p('lid')} room ${await p('room')} ${await sticks()}`);
    }
    // the 3D lid taken on the canvas (after: the lid itself, by hand), lifted down between the rests
    if (look === '3d') {
      const can = await page.evaluate(() => typeof window.__stage3d.lidHandle === 'function');
      if (can) {
        await page.evaluate(() => window.__piano.setParams({ lid: 1, room: 0.3 }));
        await page.waitForTimeout(800);
        const cv = (await page.locator('.stage-3d').boundingBox());
        const h = await page.evaluate(() => window.__stage3d.lidHandle());
        const at = [cv.x + h[0], cv.y + h[1]];
        const cdp = dev === 'phone' ? await ctx.newCDPSession(page) : null;
        const touch = (type, x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
        if (cdp) await touch('touchStart', at[0], at[1]);
        else {
          await page.mouse.move(at[0], at[1]);
          await page.mouse.down();
        }
        let v = await p('lid');
        for (let k = 1; k < 200 && v >= 0.65; k++) {
          if (cdp) await touch('touchMove', at[0], at[1] + 2 * k);
          else await page.mouse.move(at[0], at[1] + 2 * k);
          await page.waitForTimeout(cdp ? 20 : 5);
          v = await p('lid');
        }
        await page.waitForTimeout(250);
        await shot('drag-held');
        const held = await p('lid');
        if (cdp) await touch('touchEnd');
        else await page.mouse.up();
        await page.waitForTimeout(900);
        if (!cdp) await page.mouse.move(cv.x + 20, cv.y + cv.height - 20);
        await page.waitForTimeout(200);
        await shot('drag-let-go');
        console.log(`${dev}-${look}-drag-${TAG}`.padEnd(34), `held ${held} let go -> ${await p('lid')} ${await sticks()}`);
      }
    }
    await ctx.close();
  }
}
await browser.close();
