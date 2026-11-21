// The sheet music's pictures (apps/web/src/sheet): each case playing, as the instrument and then as its sheet
// music, on a computer and a phone: the piano's own piece, an orchestra's piece (a part), Haydn's quartet as
// a score, the vector style; the parts menu. On a build without the sheet (production before it), only the
// instrument is photographed: the before.
//   BASE=https://instruments-wustep.vercel.app OUT=artifacts/sheet-mode-shots/before node scripts/shots-sheet.mjs
//   BASE=http://localhost:4199 OUT=artifacts/sheet-mode-shots/after node scripts/shots-sheet.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4199';
const OUT = process.env.OUT ?? 'artifacts/sheet-mode-shots/after';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
/** each case: where, how it starts, and how far in (s) it is photographed */
const CASES = [
  { name: 'piano', path: '/piano?view=2d', start: (p) => p.playOwn(), at: 6 },
  { name: 'orchestra', path: '/symphony?view=2d', start: (p) => (p.seek(48), p.play()), at: 4 },
  { name: 'quartet', path: '/orchestra?view=2d', start: (p, o) => p.loadPiece(o.pieces.findIndex((x) => x.id === 'haydn')), at: 8, only: 'desktop' },
  { name: 'vector', path: '/orchestra?view=vector', start: (p, o) => p.loadPiece(o.pieces.findIndex((x) => x.id === 'haydn')), at: 8, only: 'desktop' },
  { name: '3d', path: '/cello?view=3d', start: (p) => p.playOwn(), at: 5, only: 'desktop' },
];

for (const [dev, opts] of Object.entries(DEVS)) {
  for (const c of CASES) {
    if (c.only && c.only !== dev) continue;
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`${dev}/${c.name} pageerror:`, e.message));
    await page.goto(`${BASE}${c.path}`);
    await page.waitForTimeout(1200);
    await page.evaluate(async () => {
      await window.__piano.start();
      // (a piece's own address loads it first)
      await new Promise((r) => setTimeout(r, 300));
    });
    await page.evaluate(`(${c.start.toString()})(window.__player, window.__orchestra)`);
    await page.waitForTimeout(c.at * 1000);
    await page.screenshot({ path: `${OUT}/${dev}-${c.name}-instrument.png` });
    console.log(`${dev}-${c.name}-instrument`);
    const has = await page.locator('.player .pl-sheet').count();
    if (has) {
      await page.locator('.player .pl-sheet').click();
      await page.waitForFunction(() => document.querySelectorAll('.sheet .vf-stavenote').length > 8, null, { timeout: 20_000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${dev}-${c.name}-sheet.png` });
      console.log(`${dev}-${c.name}-sheet`);
      if (c.name === 'orchestra') {
        await page.locator('.sheet-part').click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${dev}-${c.name}-parts.png` });
        console.log(`${dev}-${c.name}-parts`);
      }
    }
    await ctx.close();
  }
}
await browser.close();
