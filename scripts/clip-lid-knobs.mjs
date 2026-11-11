// The grand's lid and room knobs in use in 3D: a short clip, and stills along the way. The lid's knob
// turned down a notch at a time (the long stick, the short stick, shut) and back up; the lid itself
// taken by hand and brought down between the rests, held, let go (it falls onto the short stick, its
// nearest rest), then lifted past halfway to the long stick and let go (it is put onto it); then the
// room's knob turned up and back down, a chord ringing in the room (the pool of light grows and shrinks).
//   OUT=<dir> BASE=http://localhost:5382 [PHONE=1] node scripts/clip-lid-knobs.mjs
// Writes <OUT>/<desktop|phone>-clip.webm (the page, as recorded) and <OUT>/<desktop|phone>-NN-<what>.png
// (the 3D canvas, the knobs over it). A dot (drawn for the recording only, not part of the app) shows
// the pointer. `ffmpeg` turns the clip into an mp4.
import { chromium, devices } from '@playwright/test';
import { mkdirSync, renameSync } from 'node:fs';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/lid-knobs/raw';
const BASE = process.env.BASE ?? 'http://localhost:5382';
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
  await window.__piano.setPreset('grand');
});
await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 5);
await page.waitForTimeout(900);
const cdp = PHONE ? await ctx.newCDPSession(page) : null;
const touch = (type, x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const p = (k) => page.evaluate((key) => window.__piano.piano.params[key], k);
let n = 0;
const still = async (what) => page.locator('.stage-3d').screenshot({ path: `${OUT}/${dev}-${String(++n).padStart(2, '0')}-${what}.png` });
const hover = async (x, y) => {
  if (!PHONE) await page.mouse.move(x, y, { steps: 8 });
};
const press = async (x, y) => (PHONE ? touch('touchStart', x, y) : page.mouse.down());
const move = async (x, y) => (PHONE ? touch('touchMove', x, y) : page.mouse.move(x, y));
const release = async () => (PHONE ? touch('touchEnd') : page.mouse.up());
/** press at (x, y) and move along (dx, dy) per step until `until` holds of `key` (stills on the way) */
const dragAt = async (x, y, key, dx, dy, until, shots = []) => {
  await hover(x, y);
  await page.waitForTimeout(350);
  await press(x, y);
  for (let k = 1; k < 220; k++) {
    await move(x + k * dx, y + k * dy);
    await page.waitForTimeout(28);
    const v = await p(key);
    for (const s of shots) if (!s.done && s.when(v)) (s.done = true), await still(s.what);
    if (until(v)) break;
  }
  await page.waitForTimeout(250);
};
const mid = async (sel) => {
  const b = await page.locator(sel).boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
};
const cv = await page.locator('.stage-3d').boundingBox();
const handle = async () => {
  const h = await page.evaluate(() => window.__stage3d.lidHandle());
  return [cv.x + h[0], cv.y + h[1]];
};
await still('lid-long-stick');
// the lid's knob turned down: it clicks onto the short stick, then shut; and back up
let [x, y] = await mid('.knob-lid');
await dragAt(x, y, 'lid', 0, 2, (v) => v === 0, [{ when: (v) => v === 0.45, what: 'knob-short-stick' }]);
await release();
await page.waitForTimeout(700);
await still('knob-shut');
[x, y] = await mid('.knob-lid');
await dragAt(x, y, 'lid', 0, -2, (v) => v === 1);
await release();
await page.waitForTimeout(800);
// the lid itself, by hand: brought down between the rests and held there
[x, y] = await handle();
await dragAt(x, y, 'lid', 0, 2, (v) => v < 0.62, [{ when: (v) => v < 0.85, what: 'hand-taking' }]);
await page.waitForTimeout(500);
await still(`hand-held-${Math.round((await p('lid')) * 100)}`);
// let go: it falls onto its nearest rest, the short stick
await release();
await page.waitForTimeout(150);
await still('hand-let-go-falling');
await page.waitForTimeout(800);
await still(`hand-let-go-${Math.round((await p('lid')) * 100)}`);
// lifted past halfway to the long stick and let go: it is put onto it
[x, y] = await handle();
await dragAt(x, y, 'lid', 0, -2, (v) => v > 0.8);
await page.waitForTimeout(300);
await still(`hand-lifted-${Math.round((await p('lid')) * 100)}`);
await release();
await page.waitForTimeout(900);
await still(`hand-let-go-${Math.round((await p('lid')) * 100)}`);
// the room: a chord in the room; its knob turned up, then back down
await page.evaluate(() => {
  window.__piano.sustain(1);
  for (const m of [36, 48, 55, 64, 67, 72]) window.__piano.noteOn(m, 96, 'keys');
});
[x, y] = await mid('.knob-room');
await dragAt(x, y, 'room', 0, -2, (v) => v > 0.9, [{ when: (v) => v > 0.55, what: 'room-turned-up' }]);
await release();
await page.waitForTimeout(500);
await still('room-large');
await page.evaluate(() => {
  for (const m of [36, 48, 55, 64, 67, 72]) window.__piano.noteOn(m, 96, 'keys');
});
[x, y] = await mid('.knob-room');
await dragAt(x, y, 'room', 0, 2, (v) => v < 0.05);
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
