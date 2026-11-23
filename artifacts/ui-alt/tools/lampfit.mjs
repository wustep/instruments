// How the lamp's hint fits the bar at each phone width (main.ts fitLamp): line, two or none.
//   BASE=http://localhost:4327 SEATS=<seats> node artifacts/ui-alt/tools/lampfit.mjs
import { chromium, devices } from '@playwright/test';
const BASE = process.env.BASE ?? 'http://localhost:4327';
const b = await chromium.launch({ channel: 'chrome', args: ['--mute-audio'] });
const ctx = await b.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
for (const width of [412, 390, 375, 360, 340, 320]) {
  await page.setViewportSize({ width, height: 700 });
  const row = [];
  for (const path of [`/orchestra?v=1&seats=${process.env.SEATS}`, '/piano', '/timpani', '/trombone']) {
    await page.goto(BASE + path);
    await page.waitForFunction(() => document.querySelector('.status')?.dataset.fit);
    await page.waitForTimeout(400);
    row.push(`${path.slice(0, 6)}=${await page.evaluate(() => document.querySelector('.status').dataset.fit)}`);
  }
  console.log(width, row.join('  '));
}
await b.close();
