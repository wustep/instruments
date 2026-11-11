// Switching instruments, timed: each instrument in turn (the first time it is shown on this page),
// from the call to the stage's first frame of it (3D: the first frame drawn after it, not held back
// for its shaders), with the worst frame and the long tasks in the 2.5 s after the switch.
//   BASE=http://localhost:4611 [LOOK=2d|3d] [PHONE=1] [THROTTLE=4] [ONLY=violin,flute] node scripts/perf-switch.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:4611';
const LOOK = process.env.LOOK ?? '3d';
const PHONE = process.env.PHONE === '1';
const THROTTLE = Number(process.env.THROTTLE ?? 1);
const LIST = (process.env.ONLY ?? 'violin,cello,flute,oboe,clarinet,bassoon,horn,trumpet,trombone,timpani,bass,piano').split(',');
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const dev = PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const ctx = await browser.newContext(dev);
await ctx.addInitScript((d3) => {
  localStorage.setItem('piano-model.instrument', 'piano');
  localStorage.setItem('piano-model.3d', d3 ? '1' : '0');
  window.__sw = { fr: [], lt: [] };
  const f = (t) => {
    // (a 3D frame counts once drawn: not held back for its shaders)
    const s = window.__stage3d;
    window.__sw.fr.push([t, s ? (s.r3.held ? -1 : s.stats.frames) : 0]);
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__sw.lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true });
}, LOOK === '3d');
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto(`${BASE}/piano`);
await page.evaluate(async () => {
  await window.__piano.start();
});
if (LOOK === '3d') await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 30000 });
await page.waitForTimeout(2500);
if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
const rows = [];
for (const id of LIST) {
  const t0 = await page.evaluate(async (i) => {
    const t = performance.now();
    window.__sw.t0 = t;
    await window.__piano.setInstrument(i);
    return t;
  }, id);
  await page.waitForTimeout(2500);
  const r = await page.evaluate((t0) => {
    const fr = window.__sw.fr.filter(([t]) => t > t0 && t < t0 + 2500);
    // the first frame after one drawn of the new instrument (its picture on the screen)
    let shown = null;
    if (window.__stage3d) {
      const f0 = fr[0]?.[1] ?? 0;
      const k = fr.findIndex(([, n]) => n > f0 + 1);
      shown = k >= 0 ? fr[k][0] - t0 : null;
    } else shown = fr.length > 1 ? fr[1][0] - t0 : null;
    const d = fr.slice(1).map(([t], i) => t - fr[i][0]);
    const lt = window.__sw.lt.filter(([s]) => s >= t0 - 5 && s < t0 + 2500);
    return { shown: shown && Math.round(shown), maxFrame: Math.round(Math.max(0, ...d)), longMs: Math.round(lt.reduce((a, [, x]) => a + x, 0)), longMax: Math.round(Math.max(0, ...lt.map(([, x]) => x))) };
  }, t0);
  console.log(id.padEnd(9), JSON.stringify(r));
  rows.push(r);
}
const sum = (k) => rows.reduce((a, r) => a + (r[k] ?? 0), 0);
const med = (k) => rows.map((r) => r[k] ?? 0).sort((a, b) => a - b)[Math.floor(rows.length / 2)];
console.log(`SUMMARY switch ${LOOK} ${PHONE ? 'phone' : 'desktop'}${THROTTLE > 1 ? ` cpu÷${THROTTLE}` : ''} (${rows.length} instruments): shown median ${med('shown')} ms, worst frame median ${med('maxFrame')} ms / max ${Math.max(...rows.map((r) => r.maxFrame))} ms, long tasks total ${sum('longMs')} ms`);
await browser.close();
