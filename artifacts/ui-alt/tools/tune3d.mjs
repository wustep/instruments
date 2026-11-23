// The 3D light, looked at while it is tuned: one page, several settings of three3d.ts DAY, a still of each
// and the floor's tone against the page's ground.
//   node artifacts/ui-alt/tools/tune3d.mjs <out dir> <path> '<json overrides>' ['<json overrides>' …]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:4317';
const [out, path, ...sets] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu', '--mute-audio'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })).newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${BASE}${path}`);
await page.evaluate(() => window.__piano.start());
await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 40, null, { timeout: 90_000 });
let i = 0;
for (const js of sets.length ? sets : ['{}']) {
  await page.evaluate((o) => Object.assign(window.__day, o), JSON.parse(js));
  await page.waitForTimeout(700);
  const file = `${out}/t${i++}.png`;
  await page.screenshot({ path: file });
  // the stage's canvas: its corners (the page's ground), the floor just past the instrument, the floor far out
  const px = await page.evaluate(() => {
    const cv = document.querySelector('.stage-3d');
    const r = cv.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, day: window.__day };
  });
  console.log(file, JSON.stringify(px.day));
}
await browser.close();
