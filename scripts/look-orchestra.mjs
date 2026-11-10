// Orchestra mode, a quick look: a built-in piece on the stage (desktop or phone, 2D or 3D), the
// ensemble's state and console errors printed, one screenshot.
//   PIECE=0 VIEW=desktop|phone D3=0|1 WAIT=4000 BASE=http://localhost:5321 OUT=<prefix> node scripts/look-orchestra.mjs
import { chromium } from '@playwright/test';
const BASE = process.env.BASE ?? 'http://localhost:5321';
const OUT = process.env.OUT ?? 'test-results/orchestra-look';
const piece = Number(process.env.PIECE ?? 0);
const view = process.env.VIEW ?? 'desktop';
const d3 = process.env.D3 === '1';
const wait = Number(process.env.WAIT ?? 4000);
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  small: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const dev = DEVS[view];
const ctx = await browser.newContext(dev);
await ctx.addInitScript(([d]) => { localStorage.setItem('piano-model.instrument', 'violin'); localStorage.setItem('piano-model.3d', d ? '1' : '0'); }, [d3]);
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
await page.goto(BASE + '/');
await page.waitForTimeout(800);
await page.evaluate(async () => { await window.__piano.start(); });
await page.evaluate(async (i) => { await window.__orchestra.loadPiece(i); }, piece);
await page.waitForTimeout(wait);
const info = await page.evaluate(() => {
  const sw = document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight + 1;
  const e = window.__orchestra.ensemble;
  return { overflow: sw, active: e.active, lineup: e.lineup, engines: e.parts.map((p) => !!p.engine), frames: e.parts.map((p) => !!p.frame), down: e.parts.map((p) => p.down.size), stats: window.__stage3d?.stats ? { ms: +window.__stage3d.stats.ms.toFixed(1), lite: window.__stage3d.stats.lite, ao: window.__stage3d.stats.ao } : null };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: `${OUT}-${view}-${d3 ? '3d' : '2d'}-${piece}.png` });
console.log(errs.slice(0, 10).join('\n'));
await browser.close();
