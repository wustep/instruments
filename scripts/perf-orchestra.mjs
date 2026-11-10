// Orchestra mode's cost: the audio thread (each part engine's own load meter, summed), the 3D frame
// (build + draw, ms), and the page's frame rate in 2D and 3D, on this machine and with the main
// thread slowed 4× (CDP CPU throttling: a phone's main thread, roughly; the audio thread is not slowed).
// ROUTED=1: the routing round's scenes instead (orchestra/assign.ts, many to many): the quartet with its
// tune doubled on a flute and a second cello on every line (6), the same with two grands on every
// line (8, a computer's most), and La Réjouissance on two trumpets and two grands (4).
//   BASE=http://localhost:5321 [ROUTED=1] node scripts/perf-orchestra.mjs
import { chromium } from '@playwright/test';
const BASE = process.env.BASE ?? 'http://localhost:5321';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const rows = [];
const ROUTED = !!process.env.ROUTED;
// [piece, name, routing (in the page, through the ensemble's routing calls), on a phone too]
const SCENES = ROUTED
  ? [
      [0, 'quartet +flute +cello (6)', (e) => { e.addPart('flute', [0]); e.addPart('cello', [0, 1, 2, 3]); }, true],
      [0, 'the same +2 grands (8)', (e) => { e.addPart('flute', [0]); e.addPart('cello', [0, 1, 2, 3]); e.addPart('grand', [0, 1, 2, 3]); e.addPart('grand', [0, 1, 2, 3]); }, false],
      [2, '2 trumpets + 2 grands (4)', (e) => { e.addPart('trumpet', [0]); e.addPart('grand', [1, 2]); }, true],
    ]
  : [[0, 'quartet', null, true], [1, 'brandenburg 6', null, true], [2, 'trumpet+grand', null, true]];
for (const [piece, name, route, onPhone] of SCENES) {
  for (const view of onPhone ? ['desktop', 'phone'] : ['desktop']) {
    for (const d3 of [false, true]) {
      const dev = view === 'phone' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
      const ctx = await browser.newContext(dev);
      await ctx.addInitScript(([d]) => { localStorage.setItem('piano-model.instrument', 'violin'); localStorage.setItem('piano-model.3d', d ? '1' : '0'); }, [d3]);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      if (view === 'phone') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto(BASE + '/');
      await page.waitForTimeout(800);
      await page.evaluate(async () => { await window.__piano.start(); });
      await page.evaluate(async (i) => { await window.__orchestra.loadPiece(i); }, piece);
      if (route) await page.evaluate(`(${route})(window.__orchestra.ensemble)`);
      await page.waitForTimeout(4000);
      const r = await page.evaluate(async () => {
        const ts = [];
        const t0 = performance.now();
        await new Promise((res) => { const f = (t) => { ts.push(t); if (t - t0 < 3000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
        const loads = window.__orchestra.ensemble.parts.map((p) => p.frame?.load ?? 0);
        const s3 = window.__stage3d?.stats;
        return { fps: +(1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), audio: +(loads.reduce((a, b) => a + b, 0) * 100).toFixed(1), parts: loads.length, ms3d: s3 ? +s3.ms.toFixed(2) : null, lite: s3?.lite ?? null, mirrors: s3?.mirrors ?? null };
      });
      rows.push({ piece: name, view: view === 'phone' ? 'phone (main ×4 slower)' : view, mode: d3 ? '3D' : '2D', ...r });
      await ctx.close();
    }
  }
}
console.table(rows);
await browser.close();
