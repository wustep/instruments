// A key's action close-up seen as a visitor meets it, beyond the default frame (review shots):
// mid-flight in, zoomed all the way in, turned as far as the orbit goes each way, from above, the
// case hidden, and the flight back.
//   OUT=<dir> BASE=http://localhost:5311 [PRESET=grand|upright] [KEY=60] [PHONE=1] node scripts/look-closeup.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/5-webgl/look';
const BASE = process.env.BASE ?? 'http://localhost:5311';
const PRESET = process.env.PRESET ?? 'grand';
const KEY = Number(process.env.KEY ?? 60);
const PHONE = process.env.PHONE === '1';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  localStorage.setItem('piano-model.instrument', 'piano');
  localStorage.setItem('piano-model.3d', '1');
});
const page = await ctx.newPage();
const gl = [];
page.on('console', (m) => /webgl|GL_/i.test(m.text()) && gl.push(m.text()));
page.on('pageerror', (e) => gl.push(String(e)));
await page.goto(`${BASE}/`);
await page.evaluate(async (pr) => {
  await window.__piano.start();
  await window.__piano.setPreset(pr);
  document.querySelectorAll('.presets button').forEach((b) => b.textContent === pr && b.click());
}, PRESET);
await page.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 15000 });
await page.waitForTimeout(600);
const cv = page.locator('.stage-3d');
const tag = `${PHONE ? 'phone-' : ''}${PRESET}-${KEY}`;
const shot = async (name) => {
  await cv.screenshot({ path: `${OUT}/${tag}-${name}.png` });
  const s = await page.evaluate(() => ({ eye: window.__stage3d.eye.map((v) => +v.toFixed(3)), sec: window.__stage3d.section, ms: +window.__stage3d.stats.ms.toFixed(2), near: window.__stage3d.r3.cam.near, exp: +window.__stage3d.r3.exposure.toFixed(2) }));
  console.log(`${tag}-${name}`, JSON.stringify(s));
};
await page.evaluate((k) => window.__stage3d.zoomTo(k), KEY);
await page.waitForTimeout(430);
await shot('1-flying-in');
await page.waitForTimeout(1100);
await shot('2-there');
if (!PHONE) {
  const b = await cv.boundingBox();
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await page.mouse.move(cx, cy);
  for (let k = 0; k < 8; k++) await page.mouse.wheel(0, -700);
  await page.waitForTimeout(600);
  await shot('3-zoomed-in');
  for (const [name, dx, dy] of [['4-turned-right', 660, 0], ['5-turned-left', -1320, 0], ['6-from-above', 660, 260]]) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + dx, cy + dy, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    await shot(name);
  }
  for (let k = 0; k < 8; k++) await page.mouse.wheel(0, 700);
  await page.waitForTimeout(600);
  await shot('7-zoomed-out');
}
await page.evaluate(() => window.__stage3d.zoomOut());
await page.waitForTimeout(200);
await page.evaluate((k) => window.__stage3d.zoomTo(k), KEY);
await page.waitForTimeout(1500);
await page.locator('.case-toggle').click();
await page.waitForTimeout(800);
await page.evaluate((k) => window.__piano.noteOn(k, 100, 'keys'), KEY);
await page.waitForTimeout(70);
await shot('8-case-hidden-struck');
await page.evaluate((k) => window.__piano.noteOff(k, 'keys'), KEY);
await page.evaluate(() => window.__stage3d.zoomOut());
await page.waitForTimeout(400);
await shot('9-flying-back');
console.log('webgl/page messages:', gl.length, gl.slice(0, 3));
await browser.close();
