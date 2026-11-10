// A file's dynamics: the player with a file loaded (the Haydn from the pieces menu), on desktop and
// phone, cropped to the overlay (with the hairpin, after) and the whole stage; TAG=after also the
// hairpin off, and its tip.
//   OUT=<dir> TAG=before|after BASE=http://localhost:4231 node scripts/shots-pieces-dynamics.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/pieces-dynamics/shots';
const TAG = process.env.TAG ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:4231';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const VIEWS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
mkdirSync(OUT, { recursive: true });
for (const [view, opts] of Object.entries(VIEWS)) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(() => {
    localStorage.setItem('piano-model.instrument', 'piano');
    localStorage.removeItem('piano-model.expression');
  });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForFunction(() => !!window.__orchestra);
  await page.evaluate(() => window.__orchestra.loadPiece(0));
  await page.waitForFunction(() => window.__player.playing, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const crop = async (name) => {
    const r = await page.locator('.player').boundingBox();
    const pad = 10;
    await page.screenshot({ path: `${OUT}/${view}-${name}-${TAG}.png`, clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: Math.min(opts.viewport.width, r.width + 2 * pad), height: r.height + 2 * pad } });
  };
  await crop('player');
  await page.screenshot({ path: `${OUT}/${view}-stage-${TAG}.png` });
  if (TAG === 'after') {
    const btn = page.locator('.pl-expr');
    if (view === 'desktop') {
      await btn.hover();
      await page.waitForTimeout(700);
      const r = await page.locator('.player').boundingBox();
      await page.screenshot({ path: `${OUT}/${view}-tip-${TAG}.png`, clip: { x: r.x - 40, y: r.y - 10, width: r.width + 80, height: r.height + 60 } });
    }
    await btn.click();
    await page.mouse.move(5, 5);
    await page.waitForTimeout(700);
    await crop('player-off');
  }
  await ctx.close();
}
await browser.close();
