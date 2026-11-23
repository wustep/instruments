// The UI alternate's pictures: one planned burst of the incumbent (production) and one of this branch,
// the same scenes, the same windows. A shot that already exists is kept unless FORCE=1.
//   BASE=https://instruments-wustep.vercel.app TAG=before node artifacts/ui-alt/tools/shots.mjs
//   BASE=http://localhost:4317 TAG=after node artifacts/ui-alt/tools/shots.mjs
//   ONLY=<substring of a shot's name>[,…]   SET=pr|all (pr: the PR's table alone)
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE ?? 'http://localhost:4317';
const TAG = process.env.TAG ?? 'after';
const OUT = resolve(HERE, '..', 'shots');
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);
const SET = process.env.SET ?? 'all';
const FORCE = process.env.FORCE === '1';

const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const hold = (notes, ms = 1300) => async (page) => {
  await page.evaluate((x) => x.forEach((m) => window.__piano.noteOn(m, 0.7, 'midi')), notes);
  await page.waitForTimeout(ms);
};
const settle = (ms) => async (page) => page.waitForTimeout(ms);
const openPicker = async (page) => {
  const b = page.locator('.pick-open');
  if ((await b.isVisible()) && (await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await page.waitForTimeout(450);
};
/** a piece playing a few seconds in (the player's own hook), so the stage is alive in the picture */
const playAt = (s, ms = 2600) => async (page) => {
  await page.waitForFunction(() => window.__player?.loaded, null, { timeout: 40_000 });
  await page.evaluate((t) => {
    window.__player.seek?.(t);
    window.__player.play?.();
  }, s);
  await page.waitForTimeout(ms);
};
/** the instrument's own piece loaded, a moment in, and its sheet music in the stage's place */
const sheet = async (page) => {
  await page.locator('.pl-play, .pl-btn[aria-label*="lay" i]').first().click();
  await page.waitForFunction(() => window.__player?.loaded, null, { timeout: 40_000 });
  await page.waitForTimeout(2500);
  await page.locator('.pl-sheet').click();
  await page.waitForSelector('.sheet svg', { timeout: 40_000 });
  await page.waitForTimeout(1800);
};

const CHORD = [48, 60, 64, 67];
// [name, device, path, steps, { start, pr }]
const SHOTS = [
  ['piano-2d-desktop', 'desktop', '/piano?view=2d', hold(CHORD), { pr: true }],
  ['piano-3d-desktop', 'desktop', '/piano?view=3d', hold(CHORD), { pr: true }],
  ['piano-2d-phone', 'phone', '/piano?view=2d', hold(CHORD), { pr: true }],
  ['piano-3d-phone', 'phone', '/piano?view=3d', hold(CHORD), { pr: true }],
  ['orchestra-3d-desktop', 'desktop', '/symphony?view=3d', playAt(20, 3200), { pr: true }],
  ['cello-3d-desktop', 'desktop', '/cello?view=3d', hold([50]), { pr: true }],
  ['piano-vector-desktop', 'desktop', '/piano?view=vector', hold(CHORD), { pr: true }],
  ['cello-2d-desktop', 'desktop', '/cello?view=2d', hold([50])],
  ['trumpet-3d-desktop', 'desktop', '/trumpet?view=3d', hold([65])],
  ['orchestra-2d-desktop', 'desktop', '/symphony?view=2d', playAt(20, 3200)],
  ['orchestra-3d-phone', 'phone', '/symphony?view=3d', playAt(20, 3200)],
  ['picker-phone', 'phone', '/violin?view=2d', openPicker],
  ['idle-piano-2d-desktop', 'desktop', '/piano?view=2d', settle(900), { start: false }],
  ['sheet-desktop', 'desktop', '/piano?view=2d', sheet],
  ['notes-desktop', 'desktop', '/notes', settle(700), { start: false }],
  ['measurements-desktop', 'desktop', '/measurements', settle(1500), { start: false }],
  ['not-found-desktop', 'desktop', '/no-such-page', settle(500), { start: false }],
];

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu', '--mute-audio'] });
mkdirSync(OUT, { recursive: true });
for (const [name, dev, path, steps, opts = {}] of SHOTS) {
  if (ONLY.length && !ONLY.some((s) => name.includes(s))) continue;
  if (SET === 'pr' && !opts.pr) continue;
  const file = `${OUT}/${TAG}-${name}.png`;
  if (existsSync(file) && !FORCE) {
    console.log(`${TAG}-${name}  kept (exists)`);
    continue;
  }
  const ctx = await browser.newContext(DEVS[dev]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errs.push(`error: ${m.text().slice(0, 160)}`));
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    if (opts.start !== false && (await page.evaluate(() => !!window.__piano))) {
      await page.evaluate(() => window.__piano.start());
      await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 40_000 });
    }
    if (/view=3d/.test(path)) await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 40, null, { timeout: 90_000 });
    await steps?.(page);
    await page.screenshot({ path: file });
    console.log(`${TAG}-${name}${errs.length ? `  !! ${errs.join(' | ')}` : ''}`);
  } catch (e) {
    console.log(`${TAG}-${name}  !! FAILED ${String(e.message).split('\n')[0]}`);
  } finally {
    await ctx.close();
  }
}
await browser.close();
