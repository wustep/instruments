// The polish pass's picture: Pass It On's seventeen seats in 2D and in vector lines, on a computer and a
// phone, close on the rows behind the strings (the oboe and the clarinet were not drawn: their cells were
// under the least a cell was drawn at, ensemble-draw.ts `drawable`). On any build, so the build before and
// the build after can be laid side by side:
//   BASE=https://instruments-wustep.vercel.app OUT=artifacts/polish/shots TAG=before node scripts/shots-orchestra-reeds.mjs
//   BASE=http://localhost:4199 OUT=artifacts/polish/shots TAG=after node scripts/shots-orchestra-reeds.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4199';
const OUT = process.env.OUT ?? 'artifacts/polish/shots';
const TAG = process.env.TAG ?? 'after';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
const DEVS = {
  desktop: { ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, clip: { x: 440, y: 215, width: 560, height: 275 } },
  phone: { ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, clip: { x: 0, y: 235, width: 390, height: 190 } },
};
for (const [dev, d] of Object.entries(DEVS)) {
  for (const look of ['2d', 'vector']) {
    const ctx = await browser.newContext(d.ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror:', e.message));
    await page.goto(`${BASE}/passiton?view=${look}`);
    await page.waitForFunction(() => window.__player?.loaded, null, { timeout: 20000 });
    await page.waitForTimeout(1200);
    const name = `passiton-${dev}-${look}-${TAG}.png`;
    await page.screenshot({ path: `${OUT}/${name}`, clip: d.clip });
    console.log(name);
    await ctx.close();
  }
}
await browser.close();
