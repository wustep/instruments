// The Orchestra's organising controls for a large lineup, before and after: Beethoven's Fifth (eighteen seats)
// and the Daylight quintet (five), on a computer and a phone, seated, then its file loaded with the routing open,
// and (where the build has it) an instrument tapped on the stage. Shot on two builds:
//   BASE=http://localhost:4388 TAG=after OUT=artifacts/realistic-3d/final-symphony/orch-ui node scripts/shots-orch-ui.mjs
//   BASE=https://instruments-wustep.vercel.app TAG=before …            (ONLY=desktop|phone, LOOK=2d|vector|3d)
// PNG at device pixels (sips makes the JPEGs kept in the repo); what each state seated goes to stdout as JSON.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { QUINTET, SYMPHONY } from '../apps/web/test/presets.ts';

const BASE = process.env.BASE ?? 'http://localhost:4388';
const TAG = process.env.TAG ?? 'after';
const OUT = process.env.OUT ?? 'test-results/orch-ui';
const ONLY = process.env.ONLY ?? '';
const LOOK = process.env.LOOK ?? '2d';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const report = {};
const shot = async (page, name, keepTips = false) => {
  await page.evaluate((keep) => {
    if (!keep) document.querySelectorAll('.tip').forEach((t) => (t.hidden = true));
  }, keepTips);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}-${TAG}.png` });
};
const state = (page) =>
  page.evaluate(() => {
    const e = window.__orchestra?.ensemble;
    const g = document.querySelector('.pl-grid');
    return {
      at: decodeURI(location.pathname + location.search),
      lineup: e?.lineup ?? null,
      rows: g ? g.querySelectorAll('.pg-row:not(.pg-add)').length : null,
      grid: g ? (({ width, height }) => ({ w: Math.round(width), h: Math.round(height) }))(g.getBoundingClientRect()) : null,
    };
  });

for (const [dev, opts] of Object.entries(DEVS)) {
  if (ONLY && ONLY !== dev) continue;
  for (const [name, url] of [
    ['symphony', SYMPHONY],
    ['quintet', QUINTET],
  ]) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    await page.goto(`${BASE}${url}&view=${LOOK}`);
    await page.waitForTimeout(LOOK === '3d' ? 2500 : 1200);
    const key = `${name}-${dev}`;
    await shot(page, `${key}-1-seated`);
    report[key] = { seated: await state(page) };
    // the file loaded (its lines known), held still a few seconds in, the routing opened
    await page.getByRole('button', { name: /^Play/ }).first().click();
    await page.waitForTimeout(3500);
    await page.getByRole('button', { name: 'Pause' }).first().click();
    await page.locator('.pl-route').click();
    await page.waitForTimeout(400);
    await page.mouse.move(2, 2);
    await shot(page, `${key}-2-routing`);
    report[key].routing = await state(page);
    await page.keyboard.press('Escape');
    // an instrument tapped on the stage (the cello: the second seat from the right): its section's menu
    const at = await page.evaluate(() => {
      const e = window.__orchestra?.ensemble;
      const k = e ? e.lineup.lastIndexOf('cello') : -1;
      return k >= 0 && window.__seatAt ? window.__seatAt(k) : null;
    });
    if (at) {
      if (opts.hasTouch) await page.touchscreen.tap(at[0], at[1]);
      else await page.mouse.click(at[0], at[1]);
      await page.waitForTimeout(400);
      await shot(page, `${key}-3-seat`);
      report[key].seat = await page.evaluate(() => document.querySelector('.pl-menu')?.getAttribute('aria-label') ?? null);
    }
    report[key].errors = errs.slice(0, 5);
    await ctx.close();
  }
}
console.log(JSON.stringify(report, null, 1));
await browser.close();
