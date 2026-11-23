import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto((process.argv[3] ?? 'http://localhost:4327') + '/orchestra?v=1&seats=flute,violin,violin,viola,cello&view=2d');
await page.evaluate(() => window.__piano.start());
await page.waitForFunction(() => window.__orchestra?.ensemble?.parts?.filter((p) => p.frame).length === 5, null, { timeout: 30000 });
const read = () => page.evaluate(() => {
  const cv = document.querySelector('.stage-cv'); const r = cv.getBoundingClientRect(); const k = cv.width / r.width;
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; const c2 = c.getContext('2d'); c2.drawImage(cv, 0, 0);
  const px = c2.getImageData(0, 0, cv.width, cv.height).data;
  const at = (x, y) => { const i = 4 * (y * cv.width + x); return [px[i], px[i + 1], px[i + 2], px[i + 3]]; };
  const ink = (x, y) => { const [R, G, B] = at(x, y); return Math.min(R, G, B) >= 100 && R >= B + 8; };
  return window.__ens2d().filter((p) => p?.bow).map((p) => {
    const { fx, fy, tx, ty, pos } = p.bow; const len = Math.hypot(tx - fx, ty - fy); const [ux, uy] = [(tx - fx) / len, (ty - fy) / len];
    let s = ''; const mid = [];
    for (let n = 0; n < 48; n++) { const t = 0.02 + (0.96 * n) / 47; let on = false;
      for (let a = -9; a <= 9 && !on; a++) for (let q = -7; q <= 7 && !on; q += 0.5) on = ink(Math.round((fx + ux * (t * len + a) - uy * q - r.left) * k), Math.round((fy + uy * (t * len + a) + ux * q - r.top) * k));
      s += on ? '#' : '.';
      if (!on && mid.length < 3) { const x = Math.round((fx + ux * t * len - r.left) * k), y = Math.round((fy + uy * t * len - r.top) * k); mid.push([-2, -1, 0, 1, 2].map((d) => at(x, y + d).join(','))); }
    }
    return { voice: p.voice, pos: +pos.toFixed(2), len: Math.round(len), s, mid, line: [fx, fy, tx, ty].map(Math.round) };
  });
});
for (const pos of [0, 1, 0.5]) {
  await page.evaluate((pos) => { for (const p of window.__orchestra.ensemble.parts) { if (!['violin', 'viola', 'cello'].includes(p.voice)) continue; p.engine.control(128, 0.25); p.engine.control(129, pos); } }, pos);
  for (const wait of [600, 1500, 2500]) { await page.waitForTimeout(wait); const v = await read(); console.log(pos, wait, v.map((x) => `${x.voice} ${x.s}`).join('\n      ')); if (wait === 2500) for (const x of v) if (x.mid.length) console.log('   miss', x.voice, x.line, JSON.stringify(x.mid[0])); }
  if (pos === 0.5) { const v = await read(); const l = v[0].line; await page.screenshot({ path: process.argv[2], clip: { x: Math.min(l[0], l[2]) - 40, y: Math.min(l[1], l[3]) - 90, width: Math.abs(l[2] - l[0]) + 80, height: 180 } }); }
}
await b.close();
