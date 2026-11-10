// Orchestra mode's controls, a quick look: the pieces menu, a line's instruments, a line moved to
// another instrument, the ensemble picked by hand. Screenshots and the ensemble's state printed.
//   VIEW=desktop|phone BASE=http://localhost:5321 OUT=<prefix> node scripts/look-orchestra-ui.mjs
import { chromium } from '@playwright/test';
const BASE = process.env.BASE ?? 'http://localhost:5321';
const OUT = process.env.OUT ?? 'test-results/orchestra-ui';
const view = process.env.VIEW ?? 'desktop';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const dev = view === 'phone' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const ctx = await browser.newContext(dev);
await ctx.addInitScript(() => { localStorage.setItem('piano-model.instrument', 'piano'); localStorage.setItem('piano-model.3d', '0'); });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(BASE + '/');
await page.waitForTimeout(800);
const state = () => page.evaluate(() => { const e = window.__orchestra.ensemble; return { active: e.active, lineup: e.lineup, lines: e.plan.lines.map((a) => a.part), byUser: e.byUser }; });
// the pieces
await page.locator('.score-btn').click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}-${view}-1-menu.png` });
await page.locator('.sm-item').first().click();
await page.waitForTimeout(2500);
console.log('piece', JSON.stringify(await state()));
// a line's instruments
await page.locator('.pl-line').nth(2).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}-${view}-2-line.png` });
await page.locator('.pl-menu .pl-pick[aria-label="cello"]').click();
await page.waitForTimeout(1200);
console.log('viola line → cello', JSON.stringify(await state()));
await page.screenshot({ path: `${OUT}-${view}-3-moved.png` });
// by hand: the ensemble off, on (the last lineup), a flute added
await page.locator('.ens-toggle').click();
await page.waitForTimeout(400);
console.log('off', JSON.stringify(await state()));
await page.locator('.ens-toggle').click();
await page.waitForTimeout(400);
console.log('on', JSON.stringify(await state()));
await page.locator('.instruments .pick').nth(4).click();
await page.waitForTimeout(1200);
console.log('+flute', JSON.stringify(await state()));
// play a chord by hand: one note each
await page.evaluate(async () => { for (const m of [48, 60, 67, 76, 84]) { window.__piano.noteOn(m, 90, 'keys'); await new Promise((r) => setTimeout(r, 40)); } });
await page.waitForTimeout(1200);
console.log('chord', JSON.stringify(await page.evaluate(() => window.__orchestra.ensemble.parts.map((p) => [p.voice, [...p.down]]))));
await page.screenshot({ path: `${OUT}-${view}-4-hand.png` });
console.log(errs.join('\n'));
await browser.close();
