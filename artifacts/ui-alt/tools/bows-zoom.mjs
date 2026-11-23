// A close look at an orchestra's viola bow in 2D with the string at the middle of the hair: the canvas's own
// pixels in a column across the hair at three stations, and a 6x picture.  node bows-zoom.mjs <out.png> [base]
import { chromium } from '@playwright/test';
const BASE = process.argv[3] ?? 'http://localhost:4327';
const b = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(`${BASE}/orchestra?v=1&seats=flute,violin,violin,viola,cello&view=2d`);
await page.evaluate(() => window.__piano.start());
await page.waitForFunction(() => window.__orchestra?.ensemble?.parts?.filter((p) => p.frame).length === 5, null, { timeout: 30000 });
await page.evaluate(() => { for (const p of window.__orchestra.ensemble.parts) { if (!['violin', 'viola', 'cello'].includes(p.voice)) continue; p.engine.control(128, 0.25); p.engine.control(129, 0.5); } });
await page.waitForTimeout(2500);
const out = await page.evaluate(() => {
  const cv = document.querySelector('.stage-cv'); const r = cv.getBoundingClientRect();
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const c2 = c.getContext('2d'); c2.drawImage(cv, 0, 0);
  const v = window.__ens2d().filter((p) => p?.bow)[2]; const { fx, fy, tx, ty } = v.bow;
  const cols = [0.3, 0.45, 0.55].map((t) => { const x = Math.round(fx + (tx - fx) * t - r.left); const y0 = Math.round(fy - r.top) - 7; return [...c2.getImageData(x, y0, 1, 15).data].reduce((a, n, i) => (i % 4 ? (a[a.length - 1] += ',' + n) : a.push(String(n)), a), []); });
  // a 6x copy of the bow's middle
  const z = document.createElement('canvas'); z.width = 600; z.height = 180; const zc = z.getContext('2d'); zc.imageSmoothingEnabled = false; zc.fillStyle = '#eceff1'; zc.fillRect(0, 0, 600, 180);
  zc.drawImage(cv, Math.round(fx + (tx - fx) * 0.5 - r.left) - 50, Math.round(fy - r.top) - 15, 100, 30, 0, 0, 600, 180);
  return { cols, url: z.toDataURL() };
});
for (const c of out.cols) console.log(c.join(' | '));
(await import('node:fs')).writeFileSync(process.argv[2], Buffer.from(out.url.split(',')[1], 'base64'));
await b.close();
