// The UI alternate's before/after pictures: the same addresses, a computer (1440×900) and a phone
// (390×844), from production (TAG=before) and from this branch (TAG=after).
//   BASE=https://instruments-wustep.vercel.app TAG=before node artifacts/ui-alt/shots.mjs
//   BASE=http://127.0.0.1:5393 TAG=after node artifacts/ui-alt/shots.mjs
//   SET=official|extra|all   ONLY=<substring>   OUT=<dir>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? 'http://127.0.0.1:5393';
const TAG = process.env.TAG ?? 'after';
const OUT = resolve(process.env.OUT ?? `${HERE}/shots`);
const SET = process.env.SET ?? 'official';
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);

const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  small: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const hold = (notes) => async (page) => {
  await page.evaluate((x) => x.forEach((m) => window.__piano.noteOn(m, 0.7, 'midi')), notes);
  await page.waitForTimeout(1200);
};
const wait = (ms) => async (page) => page.waitForTimeout(ms);
const click = (sel, ms = 600) => async (page) => {
  await page.locator(sel).first().click();
  await page.waitForTimeout(ms);
};
// (the dev server answers every path with the app: its 404 page is at /404.html; a host serves it for any other path)
const NOT_FOUND = /127\.0\.0\.1|localhost/.test(BASE) && !process.env.PREVIEW ? '/404.html' : '/no-such-page';
const states = async (page) => {
  await page.locator('.pick[aria-label="Cello"]').hover();
  await page.waitForTimeout(500);
  await page.keyboard.press('Tab');
  for (let i = 0; i < 20; i++) await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
};
const closeUp = async (page) => {
  const k = await page.locator('.key[data-midi="48"]').boundingBox();
  const cv = await page.locator('.stage-cv').boundingBox();
  await page.mouse.click(k.x + k.width / 2, cv.y + cv.height * 0.8);
  await page.waitForTimeout(900);
};
const openPicker = async (page) => {
  const b = page.locator('.pick-open');
  if ((await b.count()) && (await b.isVisible()) && (await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await page.waitForTimeout(450);
};

/** name, device, path, steps, set */
const SHOTS = [
  ['piano-2d-desktop', 'desktop', '/piano', hold([48, 60, 64, 67]), 'official'],
  ['piano-3d-desktop', 'desktop', '/piano?view=3d', hold([48, 60, 64, 67]), 'official'],
  ['piano-2d-phone', 'phone', '/piano', hold([60, 64, 67]), 'official'],
  ['piano-3d-phone', 'phone', '/piano?view=3d', hold([60, 64, 67]), 'official'],
  ['orchestra-3d-desktop', 'desktop', '/symphony?view=3d', wait(2500), 'official'],
  ['cello-3d-desktop', 'desktop', '/cello?view=3d', hold([50]), 'official'],
  ['piano-vector-desktop', 'desktop', '/piano?view=vector', hold([48, 60, 64, 67]), 'extra'],
  ['violin-2d-desktop', 'desktop', '/violin', hold([69]), 'extra'],
  ['horn-3d-desktop', 'desktop', '/horn?view=3d', hold([53]), 'extra'],
  ['orchestra-2d-desktop', 'desktop', '/symphony', wait(1500), 'extra'],
  ['orchestra-3d-phone', 'phone', '/symphony?view=3d', wait(2500), 'extra'],
  ['picker-phone', 'phone', '/piano', openPicker, 'extra'],
  ['cello-3d-phone', 'phone', '/cello?view=3d', hold([50]), 'extra'],
  ['harp-vector-phone', 'phone', '/harp?view=vector', hold([55, 62, 67]), 'extra'],
  ['measurements-desktop', 'desktop', '/measurements', wait(1500), 'extra'],
  ['notes-desktop', 'desktop', '/notes', wait(800), 'extra'],
  ['notes-phone', 'phone', '/notes', wait(800), 'extra'],
  ['not-found-desktop', 'desktop', NOT_FOUND, wait(500), 'extra'],
  ['pieces-menu-desktop', 'desktop', '/piano', click('.pl-pieces'), 'more'],
  ['sheet-desktop', 'desktop', '/symphony', click('.pl-sheet', 2500), 'more'],
  ['sheet-phone', 'phone', '/tango', click('.pl-sheet', 2500), 'more'],
  ['upright-3d-desktop', 'desktop', '/piano/upright?view=3d', hold([48, 60, 64, 67]), 'more'],
  ['timpani-3d-desktop', 'desktop', '/timpani?view=3d', hold([45]), 'more'],
  ['glock-3d-desktop', 'desktop', '/glockenspiel?view=3d', hold([84, 91]), 'more'],
  ['flute-3d-desktop', 'desktop', '/flute?view=3d', hold([79]), 'more'],
  ['harp-3d-desktop', 'desktop', '/harp?view=3d', hold([55, 62, 67]), 'more'],
  ['trumpet-3d-phone', 'phone', '/trumpet?view=3d', hold([65]), 'more'],
  ['tuba-3d-desktop', 'desktop', '/tuba?view=3d', hold([36]), 'more'],
  ['violin-3d-desktop', 'desktop', '/violin?view=3d', hold([69]), 'more'],
  ['bassoon-2d-desktop', 'desktop', '/bassoon', hold([48]), 'more'],
  ['timpani-2d-phone', 'phone', '/timpani', hold([45]), 'more'],
  ['orchestra-2d-phone', 'phone', '/symphony', wait(1500), 'more'],
  ['passiton-3d-desktop', 'desktop', '/passiton?view=3d', wait(3000), 'more'],
  ['measurements-phone', 'phone', '/measurements', wait(1500), 'more'],
  ['stage-only-3d-desktop', 'desktop', '/cello?view=3d&ui=0', wait(1500), 'more'],
  ['nokeys-2d-desktop', 'desktop', '/violin?keys=0', wait(1200), 'more'],
  // states: a pick and a dial under the pointer, a word focused from the keyboard; a phone's knobs open;
  // a key's action close up
  ['states-hover-desktop', 'desktop', '/piano', states, 'more'],
  ['knobs-open-phone', 'phone', '/horn?view=3d', click('.knob-toggle'), 'more'],
  ['action-2d-desktop', 'desktop', '/piano', closeUp, 'more'],
  ['picker-orchestra-phone', 'phone', '/symphony', openPicker, 'more'],
  ['landscape-phone', 'landscape', '/cello?view=3d', hold([50]), 'more'],
  ['small-phone', 'small', '/piano', hold([60, 64, 67]), 'more'],
];

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu', '--mute-audio'] });
for (const [name, dev, path, steps, set] of SHOTS) {
  if (SET !== 'all' && set !== SET) continue;
  if (ONLY.length && !ONLY.some((s) => name.includes(s))) continue;
  // (the dev server reloads a page once after it has rebuilt a dependency: a second try)
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctx = await browser.newContext(DEVS[dev]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      if (await page.evaluate(() => !!window.__piano)) {
        await page.evaluate(() => window.__piano.start());
        await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 40_000 }).catch(() => errs.push('sound did not start'));
      }
      // (3D: the stage itself, drawing, not its loading frame)
      if (/view=3d/.test(path)) {
        await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 30, null, { timeout: 90_000 });
        await page.waitForTimeout(1800);
      }
      await steps?.(page);
      const file = `${OUT}/${TAG}-${name}.png`;
      mkdirSync(dirname(file), { recursive: true });
      await page.screenshot({ path: file });
      console.log(`${file}${errs.length ? `  !! ${errs.join(' | ')}` : ''}`);
      attempt = 9;
    } catch (e) {
      if (attempt === 2) console.log(`${TAG}-${name}  !! FAILED ${String(e.message).split('\n')[0]}`);
    } finally {
      await ctx.close();
    }
  }
}
await browser.close();
