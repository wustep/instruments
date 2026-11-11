// The players picker, photographed: the Orchestra's "N players" button opened as its sheet (a narrow window
// and a phone), and the one row of the bar on a wide computer. Before and after a change to the picker:
//   BASE=https://instruments-wustep.vercel.app TAG=before OUT=artifacts/new3 node scripts/shots-picker.mjs
//   BASE=http://localhost:4391 TAG=after OUT=artifacts/new3 node scripts/shots-picker.mjs
// Writes picker-<tag>.png (the sheet in a 1280 px window), picker-<tag>-phone.png (390×844),
// picker-<tag>-solo.png and -phone-solo.png (one instrument, the piano's sheet) and picker-<tag>-bar.png (the
// bar at 1440 px),
// and prints each sheet's box and how its picks lie (rows × columns, gaps).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4391';
const TAG = process.env.TAG ?? 'after';
const OUT = process.env.OUT ?? 'test-results/picker';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

/** the sheet's picks as rows (by their tops), each with its names, and the sheet's box */
const lay = (page) =>
  page.evaluate(() => {
    const pop = document.querySelector('.picker-pop');
    const r = pop?.getBoundingClientRect();
    const rows = new Map();
    for (const p of document.querySelectorAll('.picker-pop .pick')) {
      const b = p.getBoundingClientRect();
      if (!b.width) continue;
      const y = Math.round(b.top);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push(`${p.getAttribute('aria-label') ?? p.textContent.trim()}@${Math.round(b.left - (r?.left ?? 0))}`);
    }
    const pr = document.querySelector('.presets')?.getBoundingClientRect();
    return { box: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null, rows: [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v), presets: pr ? [Math.round(pr.left), Math.round(pr.top), Math.round(pr.width), Math.round(pr.height)] : null };
  });

const sheet = async (name, opts, path) => {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`);
  await page.waitForSelector('.picker', { state: 'attached' });
  await page.waitForTimeout(1200);
  const open = page.locator('.pick-open');
  if ((await open.isVisible()) && (await open.getAttribute('aria-expanded')) !== 'true') await open.click();
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelectorAll('.tip').forEach((t) => (t.hidden = true)));
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(name, JSON.stringify(await lay(page)));
  await ctx.close();
};

await sheet(`picker-${TAG}`, { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }, '/orchestra');
await sheet(`picker-${TAG}-phone`, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, '/orchestra');
await sheet(`picker-${TAG}-solo`, { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }, '/piano');
await sheet(`picker-${TAG}-phone-solo`, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, '/piano');
await sheet(`picker-${TAG}-bar`, { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }, '/piano');
await browser.close();
