// Orchestra mode: the stage with several instruments (2D and 3D, desktop and phone) for each built-in
// piece, the pieces menu and a line's instruments; with TAG=before, the stage as it was with the
// quartet's file dropped on it (MID=<file>: every line on the one instrument shown).
//   OUT=<dir> TAG=before|after BASE=http://localhost:5321 [MID=<file>] node scripts/shots-orchestra.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
const ROOT = process.env.OUT ?? 'artifacts/realistic-3d/final-orchestra';
const TAG = process.env.TAG ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:5321';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const VIEWS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const PIECES = ['haydn', 'bach', 'handel'];
mkdirSync(ROOT, { recursive: true });
const open = async (view, d3) => {
  const ctx = await browser.newContext(VIEWS[view]);
  await ctx.addInitScript(([d]) => { localStorage.setItem('piano-model.instrument', 'violin'); localStorage.setItem('piano-model.3d', d ? '1' : '0'); }, [d3]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.waitForTimeout(900);
  await page.evaluate(async () => { await window.__piano.start(); });
  return { ctx, page };
};
for (const view of Object.keys(VIEWS)) {
  for (const d3 of [false, true]) {
    const dim = d3 ? '3d' : '2d';
    if (TAG === 'before') {
      const { ctx, page } = await open(view, d3);
      const b64 = readFileSync(process.env.MID).toString('base64');
      await page.evaluate(async (s) => { const b = Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); await window.__player.load(b.buffer); }, b64);
      await page.waitForTimeout(d3 ? 6000 : 4000);
      await page.screenshot({ path: `${ROOT}/${view}-${dim}-before.png` });
      await ctx.close();
      continue;
    }
    for (const [i, id] of PIECES.entries()) {
      const { ctx, page } = await open(view, d3);
      await page.evaluate(async (k) => { await window.__orchestra.loadPiece(k); }, i);
      await page.waitForTimeout(d3 ? 7000 : 5000);
      await page.screenshot({ path: `${ROOT}/${view}-${dim}-${id}-after.png` });
      await ctx.close();
    }
  }
  if (TAG === 'after') {
    // the controls: the pieces, a line's instruments
    const { ctx, page } = await open(view, false);
    await page.locator('.score-btn').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${ROOT}/${view}-menu-pieces.png` });
    await page.locator('.sm-item').nth(1).click();
    await page.waitForTimeout(3500);
    await page.locator('.pl-line').nth(2).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${ROOT}/${view}-menu-line.png` });
    await ctx.close();
  }
}
await browser.close();
