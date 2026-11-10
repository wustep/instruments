// The app plays itself: the stage at rest (the overlay at the top middle) on desktop and phone, in 2D
// and 3D, and (TAG=after) an instrument's own piece playing, the ensemble's piece from the same
// icon, and the overlay with a file loaded.
//   OUT=<dir> TAG=before|after BASE=http://localhost:4401 node scripts/shots-playself.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const ROOT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/2-playself';
const TAG = process.env.TAG ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:4401';
const ONLY = process.env.ONLY ?? '';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const VIEWS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
mkdirSync(ROOT, { recursive: true });
const open = async (view, d3, inst = 'piano') => {
  const ctx = await browser.newContext(VIEWS[view]);
  await ctx.addInitScript(([d, i]) => {
    localStorage.setItem('piano-model.instrument', i);
    localStorage.setItem('piano-model.3d', d ? '1' : '0');
  }, [d3, inst]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.waitForTimeout(d3 ? 2500 : 1200);
  return { ctx, page };
};
const shot = async (page, name) => {
  if (ONLY && !name.includes(ONLY)) return;
  await page.screenshot({ path: `${ROOT}/${name}.png` });
  console.log(name);
};
for (const view of Object.keys(VIEWS)) {
  for (const d3 of [false, true]) {
    const dim = d3 ? '3d' : '2d';
    // at rest: what a first visitor sees
    {
      const { ctx, page } = await open(view, d3);
      await shot(page, `${view}-${dim}-rest-${TAG}`);
      await ctx.close();
    }
    if (TAG !== 'after') continue;
    // one tap on the play icon: the instrument's own piece
    for (const inst of d3 ? ['cello'] : ['piano', 'cello', 'flute']) {
      const { ctx, page } = await open(view, d3, inst);
      await page.locator('.player .pl-play').click();
      await page.waitForTimeout(d3 ? 7000 : 5000);
      await shot(page, `${view}-${dim}-${inst}-playing-${TAG}`);
      await ctx.close();
    }
  }
  if (TAG !== 'after') continue;
  // the ensemble: the same icon plays its built-in piece
  {
    const { ctx, page } = await open(view, false, 'violin');
    await page.locator('.ens-toggle').click();
    await page.waitForTimeout(800);
    await shot(page, `${view}-2d-ensemble-rest-${TAG}`);
    await page.locator('.player .pl-play').click();
    await page.waitForTimeout(5000);
    await shot(page, `${view}-2d-ensemble-playing-${TAG}`);
    await ctx.close();
  }
}
await browser.close();
