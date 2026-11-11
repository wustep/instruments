// The polish pass's pictures: each defect it fixed, photographed on any build, so the same shot of the
// build before and of the build after can be laid side by side (scripts/shots-polish-pairs.py).
//   BASE=https://instruments-wustep.vercel.app OUT=test-results/polish/before node scripts/shots-polish.mjs
//   BASE=http://localhost:4199 OUT=test-results/polish/after node scripts/shots-polish.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4199';
const OUT = process.env.OUT ?? 'test-results/polish/after';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const LAND = { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const open = async (dev, path) => {
  const ctx = await browser.newContext(dev);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  await page.goto(`${BASE}${path}`);
  await page.waitForTimeout(700);
  return { ctx, page };
};
const start = (page) =>
  page.evaluate(async () => {
    await window.__piano.start();
  });
const shot = async (page, name, clip) => {
  await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });
  console.log(name);
};

// 1. a phone, 2D, a piece playing: the room's knob and the file player
{
  const { ctx, page } = await open(PHONE, '/piano?view=2d');
  await start(page);
  await page.evaluate(() => window.__player.loadDemo('piano'));
  await page.waitForFunction(() => window.__player.playing);
  await page.waitForTimeout(900);
  const k = await page.evaluate(() => {
    const r = document.querySelector('.knob-room').getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: Math.round(r.left), y: Math.round(r.top), reaches: hit?.closest('.knob-room') ? 'the knob' : (hit?.className?.toString?.() ?? '') };
  });
  console.log('  the knob at', k.x, k.y, '; a tap in its middle reaches', k.reaches);
  await shot(page, 'phone-2d-playing-room-knob', { x: 0, y: 100, width: 390, height: 190 });
  await ctx.close();
}
// 2. a phone, 2D: the violin family and the flute, standing under the file player
for (const [id, view] of [['violin', '2d'], ['cello', '2d'], ['flute', '2d'], ['violin', 'vector']]) {
  const { ctx, page } = await open(PHONE, `/${id}?view=${view}`);
  await page.waitForTimeout(600);
  await shot(page, `phone-${id}-${view}-head`, { x: 0, y: 100, width: 390, height: 230 });
  await ctx.close();
}
// 3. the pieces menu on a phone held sideways (the last pieces were past the window's bottom) and upright
for (const [dev, name] of [[LAND, 'land'], [PHONE, 'phone']]) {
  const { ctx, page } = await open(dev, '/piano?view=2d');
  await page.locator('.pl-pieces').click();
  await page.waitForTimeout(400);
  const g = await page.evaluate(() => {
    const m = document.querySelector('.score-menu');
    const r = m.getBoundingClientRect();
    return { bottom: Math.round(r.bottom), window: innerHeight, pieces: m.querySelectorAll('.sm-item').length, scrolls: m.scrollHeight > m.clientHeight + 1 };
  });
  console.log(`  ${name}: the menu ends at ${g.bottom} of ${g.window} px, ${g.pieces} pieces${g.scrolls ? ', scrolling inside itself' : ''}`);
  await shot(page, `${name}-pieces-menu`);
  await ctx.close();
}
// 4. a phone, vector lines: the symphony's thirteen lines in the file player
{
  const { ctx, page } = await open(PHONE, '/symphony?view=vector');
  await page.waitForFunction(() => document.querySelectorAll('.pl-lines .pl-line').length === 13, null, { timeout: 30_000 });
  await page.waitForTimeout(500);
  const rows = await page.evaluate(() => new Set([...document.querySelectorAll('.pl-lines .pl-line')].map((c) => Math.round(c.getBoundingClientRect().top))).size);
  console.log('  the lines sit in', rows, rows === 1 ? 'row' : 'rows');
  await shot(page, 'phone-symphony-vector-lines', { x: 0, y: 100, width: 390, height: 200 });
  await ctx.close();
}
// 5. Measurements on a phone
{
  const { ctx, page } = await open(PHONE, '/measurements');
  await page.waitForSelector('.figs .chart svg', { timeout: 30_000 });
  await page.waitForTimeout(800);
  const fig = page.locator('.figs').first();
  await fig.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const f = document.querySelector('.figs');
    window.scrollTo(0, f.getBoundingClientRect().top + scrollY - 60);
  });
  await page.waitForTimeout(300);
  const g = await page.evaluate(() => {
    const s = [...document.querySelectorAll('.figs .chart svg')];
    return Math.min(...s.map((x) => x.getBoundingClientRect().width / (x.viewBox.baseVal.width || 1)));
  });
  console.log('  the smallest chart is drawn at', g.toFixed(2), 'of its size');
  await shot(page, 'phone-measurements-charts');
  await ctx.close();
}
await browser.close();
