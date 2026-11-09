// Frame rate of the 3D stage (requestAnimationFrame cadence over 3 s) per instrument, desktop 1440×900 @2x.
//   BASE=http://localhost:5311 node scripts/fps-3d.mjs
import { chromium } from '@playwright/test';
const BASE = process.env.BASE ?? 'http://localhost:5311';
const DSF = Number(process.env.DSF ?? 2);
const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED ? false : true, args: ['--use-angle=metal', '--enable-gpu', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
for (const [inst, preset] of [['piano', 'grand'], ['piano', 'upright'], ['violin'], ['cello'], ['flute'], ['trumpet']]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DSF });
  await ctx.addInitScript((i) => { localStorage.setItem('piano-model.instrument', i); localStorage.setItem('piano-model.3d', '1'); }, inst);
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.evaluate(async ([i, p]) => { await window.__piano.start(); await window.__piano.setInstrument(i); if (p) await window.__piano.setPreset(p); window.__piano.noteOn(60, 90, 'keys'); }, [inst, preset]);
  await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 20000 });
  const r = await page.evaluate(() => new Promise((res) => {
    const t = []; let last = performance.now();
    const f = (now) => { t.push(now - last); last = now; if (t.length < 180) requestAnimationFrame(f); else { t.sort((a, b) => a - b); res({ median: t[90].toFixed(1), p90: t[162].toFixed(1), cpu: window.__stage3d.stats.ms.toFixed(2), ao: window.__stage3d.stats.ao, lite: window.__stage3d.stats.lite }); } };
    requestAnimationFrame(f);
  }));
  console.log(preset ?? inst, JSON.stringify(r));
  await ctx.close();
}
await browser.close();
