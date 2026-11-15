// Seeds photographed: its ten on the stage with a moment of it playing, in 3D, in 2D and in vector lines,
// on a computer and a phone.
//   BASE=http://localhost:4199 OUT=artifacts/seeds node scripts/shots-seeds.mjs [--seed kelumo] [--at 245]
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1];
};
const BASE = process.env.BASE ?? 'http://localhost:4199';
const OUT = process.env.OUT ?? 'artifacts/seeds';
const SEED = arg('seed', 'kelumo');
const AT = Number(arg('at', '245'));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--mute-audio'] });
for (const [dev, ctxOpts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['phone', { ...devices['Pixel 7'] }]]) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  for (const view of ['3d', '2d', 'vector']) {
    await page.goto(`${BASE}/seeds?seed=${SEED}&view=${view}`);
    await page.waitForFunction(() => window.__orchestra?.ensemble.piece?.id === 'seeds');
    await page.locator('.player .pl-play').click();
    await page.waitForFunction(() => window.__player.playing && window.__orchestra.ensemble.parts.every((p) => p.engine), null, { timeout: 120000 });
    await page.evaluate((t) => window.__player.seek(t), AT);
    // (a few seconds: the piano and the harp have struck, the strings are bowing)
    await page.waitForTimeout(view === '3d' ? 4500 : 3000);
    await page.mouse.move(5, 500);
    await page.screenshot({ path: `${OUT}/seeds-${view}-${dev}.png` });
    console.log(`${OUT}/seeds-${view}-${dev}.png  ${await page.evaluate(() => location.pathname + location.search)}  sounding ${await page.evaluate(() => window.__orchestra.ensemble.parts.filter((p) => p.down.size).map((p) => p.voice).join(' '))}`);
    await page.evaluate(() => window.__player.stop());
  }
  if (errors.length) console.log(dev, 'page errors:', errors.slice(0, 3).join(' | '));
  await ctx.close();
}
await browser.close();
