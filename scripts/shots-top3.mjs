// Round "top 3": the picker's ring on the selected instrument (every instrument, three viewports)
// and the stage in phone landscape.
//   OUT=<dir> TAG=before|after BASE=http://localhost:5311 node scripts/shots-top3.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const ROOT = process.env.OUT ?? 'artifacts/realistic-3d/final-fable';
const TAG = process.env.TAG ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:5311';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const VIEWS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const INSTS = ['piano', 'violin', 'viola', 'cello', 'flute', 'trumpet'];
mkdirSync(`${ROOT}/top3-picker`, { recursive: true });
mkdirSync(`${ROOT}/top3-landscape`, { recursive: true });
for (const [view, dev] of Object.entries(VIEWS)) {
  const ctx = await browser.newContext(dev);
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.waitForTimeout(900);
  for (const [i, inst] of INSTS.entries()) {
    const pick = page.locator('.instruments .pick').nth(i);
    await pick.click();
    // the ring is the keyboard-focus ring: it shows once a key has been pressed (playing does that)
    await page.keyboard.press('Shift');
    await pick.focus();
    await page.waitForTimeout(350);
    const b = await page.locator('.instruments').boundingBox();
    const clip = { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 14), width: b.width + 24, height: b.height + 26 };
    await page.screenshot({ path: `${ROOT}/top3-picker/${view}-${inst}-${TAG}.png`, clip });
  }
  await ctx.close();
}
// phone landscape: the whole page, 2D and 3D, piano and cello; knobs open
for (const [name, inst, d3, knobs] of [['piano-2d', 'piano', false, false], ['piano-3d', 'piano', true, false], ['cello-2d', 'cello', false, false], ['trumpet-3d', 'trumpet', true, false], ['knobs', 'piano', false, true]]) {
  const ctx = await browser.newContext(VIEWS.landscape);
  await ctx.addInitScript(([i, d]) => { localStorage.setItem('piano-model.instrument', i); localStorage.setItem('piano-model.3d', d ? '1' : '0'); }, [inst, d3]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.waitForTimeout(900);
  await page.evaluate(async () => { await window.__piano.start(); });
  await page.waitForTimeout(500);
  await page.evaluate(async (n) => { for (const m of n) { window.__piano.noteOn(m, 90, 'keys'); await new Promise((r) => setTimeout(r, 60)); } }, inst === 'piano' ? [48, 60, 64, 67] : [inst === 'cello' ? 50 : 67]);
  if (knobs) {
    const t = page.locator('.knob-toggle');
    if (await t.isVisible()) await t.click();
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${ROOT}/top3-landscape/${name}-${TAG}.png` });
  const m = await page.evaluate(() => ({ stage: Math.round(document.querySelector('.stage').getBoundingClientRect().height), cv: Math.round((document.querySelector('.stage-3d:not([hidden])') ?? document.querySelector('.stage-cv')).getBoundingClientRect().height), top: Math.round(document.querySelector('.stage-top').getBoundingClientRect().height), scrollH: document.documentElement.scrollHeight, innerH: innerHeight, scrollW: document.documentElement.scrollWidth, innerW: innerWidth }));
  console.log(TAG, name, JSON.stringify(m));
  await ctx.close();
}
await browser.close();
