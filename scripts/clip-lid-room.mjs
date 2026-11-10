// NEXT5 item 4: a short clip of the 3D handles in use, and stills along the way. The grand's lid taken
// near its free edge and brought down, let go (it comes down onto its short stick, which has swung up),
// taken again and let go low (it comes down shut), lifted back onto its long stick; then the room's
// light pool, its rim pulled out and pushed back in, a chord ringing in the room.
//   OUT=<dir> BASE=http://localhost:5341 [PHONE=1] node scripts/clip-lid-room.mjs
// Writes <OUT>/<desktop|phone>-clip.webm (the page, as recorded) and <OUT>/<desktop|phone>-NN-<what>.png
// (the 3D canvas). A dot (drawn for the recording only, not part of the app) shows the pointer.
// `ffmpeg` turns the clip into an mp4 (scripts/clip-lid-room.sh).
import { chromium, devices } from '@playwright/test';
import { mkdirSync, renameSync } from 'node:fs';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/4-lid-room/raw';
const BASE = process.env.BASE ?? 'http://localhost:5341';
const PHONE = process.env.PHONE === '1';
const dev = PHONE ? 'phone' : 'desktop';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const size = PHONE ? { width: 412, height: 915 } : { width: 1280, height: 800 };
const ctx = await browser.newContext({ ...(PHONE ? devices['Pixel 7'] : { viewport: size, deviceScaleFactor: 1 }), recordVideo: { dir: OUT, size } });
await ctx.addInitScript(() => {
  localStorage.setItem('piano-model.instrument', 'piano');
  localStorage.setItem('piano-model.3d', '1');
  // the pointer, for the recording
  addEventListener('DOMContentLoaded', () => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;border:2px solid rgba(255,255,255,0.85);background:rgba(255,255,255,0.15);pointer-events:none;z-index:99;opacity:0;transition:opacity .15s,background .1s';
    document.body.append(d);
    const at = (e) => {
      d.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      d.style.opacity = '1';
    };
    addEventListener('pointermove', at, true);
    addEventListener('pointerdown', (e) => (at(e), (d.style.background = 'rgba(255,255,255,0.55)')), true);
    addEventListener('pointerup', () => (d.style.background = 'rgba(255,255,255,0.15)'), true);
  });
});
const page = await ctx.newPage();
await page.goto(`${BASE}/`);
await page.evaluate(async () => {
  await window.__piano.start();
  window.__piano.setParams({ lid: 1, room: 0.22 });
});
await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 5);
await page.waitForTimeout(900);
const cv = await page.locator('.stage-3d').boundingBox();
const cdp = PHONE ? await ctx.newCDPSession(page) : null;
const touch = (type, x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const points = () => page.evaluate(() => window.__stage3d.handlePoints());
const p = (k) => page.evaluate((key) => window.__piano.piano.params[key], k);
let n = 0;
const still = async (what) => page.locator('.stage-3d').screenshot({ path: `${OUT}/${dev}-${String(++n).padStart(2, '0')}-${what}.png` });
const hover = async (x, y) => {
  if (!PHONE) await page.mouse.move(x, y, { steps: 8 });
};
const press = async (x, y) => (PHONE ? touch('touchStart', x, y) : page.mouse.down());
const move = async (x, y) => (PHONE ? touch('touchMove', x, y) : page.mouse.move(x, y));
const release = async () => (PHONE ? touch('touchEnd') : page.mouse.up());
/** take a handle at `at`, move it along (dx, dy) per step until `until` holds of `key` */
const drag = async (at, key, dx, dy, until, shots = []) => {
  const x = cv.x + at[0];
  const y = cv.y + at[1];
  await hover(x, y);
  await page.waitForTimeout(350);
  await press(x, y);
  for (let k = 1; k < 200; k++) {
    await move(x + k * dx, y + k * dy);
    await page.waitForTimeout(28);
    const v = await p(key);
    for (const s of shots) if (!s.done && s.when(v)) (s.done = true), await still(s.what);
    if (until(v)) break;
  }
  await page.waitForTimeout(250);
};
await still('lid-full-stick');
// the lid: down until it is under 0.75, let go (onto the short stick)
let pts = await points();
await drag(pts.lid, 'lid', 0, 3, (v) => v < 0.72, [{ when: (v) => v < 0.85, what: 'lid-held' }]);
await release();
await page.waitForTimeout(80);
await still('lid-coming-down');
await page.waitForTimeout(700);
await still('lid-half-stick');
// again, low: it comes down shut
pts = await points();
await drag(pts.lid, 'lid', 0, 3, (v) => v < 0.25);
await release();
await page.waitForTimeout(800);
await still('lid-shut');
// lifted back up to the top: the long stick swings up under it
pts = await points();
await drag(pts.lid, 'lid', 0, -4, (v) => v >= 1, [{ when: (v) => v > 0.6, what: 'lid-lifted' }]);
await release();
await page.waitForTimeout(800);
await still('lid-full-stick-again');
// the room: a chord in the room; the pool's rim pulled out, then pushed back in
await page.evaluate(() => {
  window.__piano.sustain(1);
  for (const m of [36, 48, 55, 64, 67, 72]) window.__piano.noteOn(m, 96, 'keys');
});
pts = await points();
await drag(pts.room, 'room', 3 * pts.roomOut[0], 3 * pts.roomOut[1], (v) => v > 0.85, [{ when: (v) => v > 0.5, what: 'room-pulled-out' }]);
await release();
await page.waitForTimeout(500);
await still('room-large');
await page.evaluate(() => {
  for (const m of [36, 48, 55, 64, 67, 72]) window.__piano.noteOn(m, 96, 'keys');
});
pts = await points();
await drag(pts.room, 'room', -3 * pts.roomOut[0], -3 * pts.roomOut[1], (v) => v < 0.05);
await release();
await page.waitForTimeout(500);
await still('room-small');
await page.evaluate(() => window.__piano.sustain(0));
await page.waitForTimeout(600);
const video = page.video();
await ctx.close();
renameSync(await video.path(), `${OUT}/${dev}-clip.webm`);
console.log(`${dev}: ${n} stills, clip ${OUT}/${dev}-clip.webm`);
await browser.close();
