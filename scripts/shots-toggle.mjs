// Where the vector-lines toggle sits: the whole stage and a crop of the picker row, on a desktop
// (1440×900 at 2×) and a phone (390×844 at 3×), in either style.
//   OUT=merge TAG=before|after BASE=http://localhost:4391 node scripts/shots-toggle.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'merge', BASE = process.env.BASE ?? 'http://localhost:4391', TAG = process.env.TAG ?? 'after';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
for (const phone of [false, true]) {
  for (const style of ['classic', 'vector']) {
    const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript((st) => { localStorage.setItem('piano-model.instrument', 'piano'); localStorage.setItem('piano-model.3d', '0'); localStorage.setItem('piano-model.style', st); }, style);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.goto(BASE + '/');
    await page.waitForTimeout(1200);
    const name = `${OUT}/${TAG}-${phone ? 'phone' : 'desktop'}-${style}`;
    await page.screenshot({ path: `${name}.png` });
    const t = await page.locator('.vec-toggle').boundingBox();
    const r = await page.locator('.picker').boundingBox();
    if (t && r) {
      const vp = page.viewportSize();
      const pad = 12, x = Math.max(0, r.x - pad), y = Math.max(0, Math.min(r.y, t.y) - pad);
      const w = Math.min(vp.width - x, Math.max(r.x + r.width, t.x + t.width) - x + pad), hgt = Math.min(vp.height - y, Math.max(r.y + r.height, t.y + t.height) - y + pad);
      await page.screenshot({ path: `${name}-crop.png`, clip: { x, y, width: w, height: hgt } });
      console.log(name, 'toggle', JSON.stringify(t), 'picker', JSON.stringify(r));
    } else console.log(name, 'toggle not visible', JSON.stringify(t));
    await ctx.close();
  }
}
await browser.close();
