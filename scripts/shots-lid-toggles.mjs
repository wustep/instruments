// The 3D grand's lid and room controls, before and after "lid + reverb back to the grips": the same
// shots on both builds, desktop and phone.
//   OUT=<dir> TAG=before|after BASE=http://localhost:5361 [PHONE=0|1] node scripts/shots-lid-toggles.mjs
// Writes <OUT>/<desktop|phone>-<shot>-<TAG>.png (the 3D stage, with whatever control lies over it):
//  - lid-100, lid-73, lid-45, lid-30, lid-0: the lid set to that opening (73 and 30 lie between the
//    old rests: before, a lid there was drawn over a stick that did not reach it, or over none);
//  - room-0, room-100: the room's two ends (the pool of light on the floor);
//  - drag-held, drag-let-go: the lid taken by its control (before: the lid itself, as #29 made it;
//    after: its grip) and brought down to under 0.75, then let go and left 0.9 s: before it came
//    down onto the short stick (0.45), after it stays where it was let go.
// Prints each shot's lid and room, and the drag's held and settled openings.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/lid-toggles/raw';
const TAG = process.env.TAG ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:5361';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEV = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const STILL = {
  'lid-100': { lid: 1, room: 0.22 },
  'lid-73': { lid: 0.73, room: 0.22 },
  'lid-45': { lid: 0.45, room: 0.22 },
  'lid-30': { lid: 0.3, room: 0.22 },
  'lid-0': { lid: 0, room: 0.22 },
  'room-0': { lid: 1, room: 0 },
  'room-100': { lid: 1, room: 1 },
};
for (const dev of Object.keys(DEV)) {
  if (process.env.PHONE === '1' && dev !== 'phone') continue;
  if (process.env.PHONE === '0' && dev !== 'desktop') continue;
  const ctx = await browser.newContext(DEV[dev]);
  await ctx.addInitScript(() => {
    localStorage.setItem('piano-model.instrument', 'piano');
    localStorage.setItem('piano-model.3d', '1');
  });
  const page = await ctx.newPage();
  const gl = [];
  page.on('console', (m) => /webgl|GL_/i.test(m.text()) && gl.push(m.text()));
  await page.goto(`${BASE}/`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    await window.__piano.start();
    await window.__piano.setPreset('grand');
  });
  await page.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const p = (k) => page.evaluate((key) => window.__piano.piano.params[key], k);
  const shot = (name) => page.locator('.stage-3d').screenshot({ path: `${OUT}/${dev}-${name}-${TAG}.png` });
  for (const [name, params] of Object.entries(STILL)) {
    await page.evaluate((q) => window.__piano.setParams(q), params);
    await page.waitForTimeout(700);
    await shot(name);
    console.log(`${dev}-${name}-${TAG}`.padEnd(28), `lid ${await p('lid')} room ${await p('room')} sticks ${JSON.stringify(await page.evaluate(() => window.__stage3d.sticks.map((k) => +k.toFixed(2))))}`);
  }
  // the drag: from full stick, taken by the lid's control and brought down
  await page.evaluate(() => window.__piano.setParams({ lid: 1, room: 0.22 }));
  await page.waitForTimeout(700);
  const cv = await page.locator('.stage-3d').boundingBox();
  const old = await page.evaluate(() => typeof window.__stage3d.handlePoints === 'function');
  let at;
  if (old) {
    const hp = await page.evaluate(() => window.__stage3d.handlePoints());
    at = [cv.x + hp.lid[0], cv.y + hp.lid[1]];
  } else {
    const b = await page.locator('.grip-lid').boundingBox();
    at = [b.x + b.width / 2, b.y + b.height / 2];
  }
  const cdp = dev === 'phone' ? await ctx.newCDPSession(page) : null;
  const touch = (type, x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  if (cdp) await touch('touchStart', at[0], at[1]);
  else {
    await page.mouse.move(at[0], at[1]);
    await page.mouse.down();
  }
  let v = await p('lid');
  for (let k = 1; k < 200 && v >= 0.75; k++) {
    if (cdp) await touch('touchMove', at[0], at[1] + 2 * k);
    else await page.mouse.move(at[0], at[1] + 2 * k);
    await page.waitForTimeout(cdp ? 20 : 5);
    v = await p('lid');
  }
  await page.waitForTimeout(200);
  await shot('drag-held');
  const held = await p('lid');
  if (cdp) await touch('touchEnd');
  else await page.mouse.up();
  await page.waitForTimeout(900);
  if (!cdp) await page.mouse.move(cv.x + 20, cv.y + cv.height - 20);
  await page.waitForTimeout(200);
  await shot('drag-let-go');
  console.log(`${dev}-drag-${TAG}`.padEnd(28), `held ${held} let go → ${await p('lid')} sticks ${JSON.stringify(await page.evaluate(() => window.__stage3d.sticks.map((k) => +k.toFixed(2))))}  webgl messages ${gl.length}`);
  await ctx.close();
}
await browser.close();
