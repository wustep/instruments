// Touch-drag the bow on a phone (Pixel 7 emulation, CDP touch events): 2D and 3D, violin / viola / cello.
// Prints the level while the bow moves each way, the contact point before and after, what sounds.
//   BASE=http://localhost:5311 [OUT=<dir>] [FRAMES=1: a frame every few moves, with the finger marked, for a GIF] node scripts/touch-bow.mjs
import { chromium, devices } from '@playwright/test';
const FRAMES = process.env.FRAMES === '1'; let frameNo = 0;
const BASE = process.env.BASE ?? 'http://localhost:5311'; const OUT = process.env.OUT;
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
for (const inst of (process.env.ONLY ?? 'violin,viola,cello').split(',')) for (const d3 of [false, true]) {
  const ctx = await browser.newContext({ ...devices[process.env.DEV ?? 'Pixel 7'] });
  await ctx.addInitScript(([i, d]) => { localStorage.setItem('piano-model.instrument', i); localStorage.setItem('piano-model.3d', d ? '1' : '0'); }, [inst, d3]);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE + '/'); await page.waitForTimeout(d3 ? 3000 : 1500);
  const cdp = await ctx.newCDPSession(page);
  const line = async () => page.evaluate((d) => { if (!d) return window.__bow2d(); const l = window.__stage3d?.bowLine(); if (!l) return null; const r = window.__stage3d.el.getBoundingClientRect(); return { fx: l.fx + r.left, fy: l.fy + r.top, tx: l.tx + r.left, ty: l.ty + r.top, pos: l.pos }; }, d3);
  const rms = () => page.evaluate(() => { const a = window.__piano.analyser; if (!a) return -1; const b = new Float32Array(a.fftSize); a.getFloatTimeDomainData(b); let s = 0; for (const v of b) s += v * v; return Math.sqrt(s / b.length); });
  const l0 = await line();
  if (!l0) { console.log(inst, d3, 'NO BOW LINE', errs); await ctx.close(); continue; }
  const len = Math.hypot(l0.tx - l0.fx, l0.ty - l0.fy); const ux = (l0.tx - l0.fx) / len, uy = (l0.ty - l0.fy) / len;
  // start on the hair, on screen
  const vw = devices[process.env.DEV ?? 'Pixel 7'].viewport;
  let t = l0.pos; let x = l0.fx + (l0.tx - l0.fx) * t, y = l0.fy + (l0.ty - l0.fy) * t;
  x = Math.min(vw.width - 60, Math.max(60, x));
  frameNo = 0;
  const log = { inst, d3, pos0: +l0.pos.toFixed(3) };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  const stroke = async (dir, n, tag) => { let mx = 0; for (let i = 0; i < n; i++) { x += dir * ux * 6; y += dir * uy * 6; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] }); await page.waitForTimeout(16); if (FRAMES && OUT && i % 3 === 0) { await page.evaluate(([px, py]) => { let d = document.getElementById('finger'); if (!d) { d = document.createElement('div'); d.id = 'finger'; d.style.cssText = 'position:fixed;z-index:99;width:44px;height:44px;margin:-22px;border-radius:50%;border:2px solid rgba(255,255,255,.85);background:rgba(255,255,255,.18);pointer-events:none'; document.body.appendChild(d); } d.style.left = px + 'px'; d.style.top = py + 'px'; }, [x, y]); await page.screenshot({ path: `${OUT}/f-${inst}-${d3 ? '3d' : '2d'}-${String(frameNo++).padStart(3, '0')}.png` }); } if (i > n / 2) mx = Math.max(mx, await rms()); if (OUT && i === Math.floor(n * 0.7)) await page.screenshot({ path: `${OUT}/${inst}-${d3 ? '3d' : '2d'}-${tag}.png` }); } return mx; };
  log.rmsA = +(await stroke(-1, 28, 'a')).toFixed(4);
  log.sndA = await page.evaluate(() => [...window.__piano.sounding]);
  log.posA = +(await line()).pos.toFixed(3);
  log.rmsB = +(await stroke(1, 28, 'b')).toFixed(4);
  log.posB = +(await line()).pos.toFixed(3);
  await page.waitForTimeout(500);
  log.rmsRest = +(await rms()).toFixed(4);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(300);
  log.sndEnd = await page.evaluate(() => [...window.__piano.sounding]);
  log.errs = errs;
  console.log(JSON.stringify(log));
  await ctx.close();
}
await browser.close();
