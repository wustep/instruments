// A file paused wherever in a note leaves no string bowed: the cello's own piece on a phone's profile,
// paused and played on thirty times, counting the pauses after which a string is still bowed 0.4 s on.
//   BASE=http://localhost:4391 node scripts/pause-stuck.mjs      (BASE=https://instruments-wustep.vercel.app: production)
import { chromium, devices } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
await page.goto((process.env.BASE ?? 'http://localhost:4391') + '/cello?view=2d');
await page.evaluate(() => window.__piano.start());
await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano);
await page.evaluate(() => {
  window.__on = 0;
  window.__piano.piano.onVisual((f) => (window.__on = (f.strings ?? []).filter((s) => s.bowing).length));
});
await page.getByRole('button', { name: /^Play/ }).first().click();
await page.waitForFunction(() => window.__player?.playing);
let stuck = 0;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(700 + 37 * i);
  await page.evaluate(() => window.__player.pause());
  await page.waitForTimeout(400);
  if (await page.evaluate(() => window.__on)) stuck++;
  await page.evaluate(() => window.__piano.piano.allNotesOff());
  await page.evaluate(() => window.__player.play());
}
console.log('a string still bowed after a pause:', stuck, 'of 30');
await browser.close();
