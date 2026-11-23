// One planned burst of pictures for a change of the whole look: the same scenes before (production) and
// after (this branch), on a computer (1440×900) and a phone (390×844).
//   BASE=https://instruments-wustep.vercel.app TAG=before node scripts/shots-ui-alt.mjs
//   BASE=http://localhost:4173 TAG=after node scripts/shots-ui-alt.mjs      ONLY=<substring of a shot's name>
// A picture that is already there is kept (KEEP=0 takes it again).
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const TAG = process.env.TAG ?? 'after';
const OUT = process.env.OUT ?? 'artifacts/ui-alt/shots';
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);
const KEEP = process.env.KEEP !== '0';
mkdirSync(OUT, { recursive: true });

const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // (just over the picker's fold: the sixteen on one row at its tightest)
  laptop: { viewport: { width: 1345, height: 800 }, deviceScaleFactor: 1 },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu', '--mute-audio'] });

const hold = (notes, ms = 1300) => async (page) => {
  await page.evaluate((x) => x.forEach((m) => window.__piano.noteOn(m, 0.7, 'midi')), notes);
  await page.waitForTimeout(ms);
};
const playAt = (s, ms = 3200) => async (page) => {
  await page.waitForFunction(() => window.__player?.loaded, null, { timeout: 40_000 });
  await page.evaluate((t) => {
    window.__player.seek(t);
    window.__player.play();
  }, s);
  await page.waitForTimeout(ms);
};
const settle = (ms) => async (page) => page.waitForTimeout(ms);

/** name, device, address, what to do before the picture, start the sound? */
const SHOTS = [
  ['piano-2d-desktop', 'desktop', '/piano?view=2d', hold([48, 60, 64, 67])],
  ['piano-3d-desktop', 'desktop', '/piano?view=3d', hold([48, 60, 64, 67], 1800)],
  ['piano-2d-phone', 'phone', '/piano?view=2d', hold([60, 64, 67])],
  ['piano-3d-phone', 'phone', '/piano?view=3d', hold([60, 64, 67], 1800)],
  ['orchestra-3d-desktop', 'desktop', '/symphony?view=3d', playAt(60, 4500)],
  ['cello-3d-desktop', 'desktop', '/cello?view=3d', hold([50], 1800)],
  ['horn-3d-desktop', 'desktop', '/horn?view=3d', hold([53], 1800)],
  ['piano-vector-desktop', 'desktop', '/piano?view=vector', hold([48, 60, 64, 67])],
  ['violin-2d-desktop', 'desktop', '/violin?view=2d', hold([69])],
  ['orchestra-2d-desktop', 'desktop', '/symphony?view=2d', playAt(60)],
  ['orchestra-3d-phone', 'phone', '/symphony?view=3d', playAt(60, 4500)],
  ['picker-phone', 'phone', '/cello?view=2d', async (page) => {
    const b = page.locator('.pick-open');
    if ((await b.isVisible()) && (await b.getAttribute('aria-expanded')) !== 'true') await b.click();
    await page.waitForTimeout(450);
  }],
  ['pieces-menu-desktop', 'desktop', '/piano?view=2d', async (page) => {
    await page.locator('.pl-pieces').first().click();
    await page.waitForTimeout(500);
  }],
  ['sheet-desktop', 'desktop', '/piano?view=2d', async (page) => {
    await page.locator('.pl-play').first().click();
    await page.waitForFunction(() => window.__player?.playing, null, { timeout: 40_000 });
    const s = page.locator('.pl-sheet').first();
    if (await s.isVisible().catch(() => false)) await s.click();
    await page.waitForTimeout(3500);
  }],
  ['notes-desktop', 'desktop', '/notes', settle(1200), false],
  ['measurements-desktop', 'desktop', '/measurements', settle(2600), false],
  ['idle-desktop', 'desktop', '/piano?view=2d', settle(700), false],
  // more states, for looking the whole chrome over (MORE=1)
  ...(process.env.MORE
    ? [
        ['idle-3d-desktop', 'desktop', '/cello?view=3d', settle(2200), false],
        ['flute-3d-desktop', 'desktop', '/flute?view=3d', hold([79], 1800)],
        ['timpani-3d-desktop', 'desktop', '/timpani?view=3d', hold([45], 1500)],
        ['routing-desktop', 'desktop', '/symphony?view=2d', async (page) => {
          await page.waitForFunction(() => window.__player?.loaded, null, { timeout: 40_000 });
          await page.locator('.pl-route').first().click();
          await page.waitForTimeout(600);
        }],
        ['action-2d-desktop', 'desktop', '/piano?view=2d', async (page) => {
          await page.evaluate(() => window.__piano.noteOn(60, 0.7, 'keys'));
          await page.waitForTimeout(300);
          const q = await page.evaluate(() => window.__piano2d()?.strings.find((x) => x.midi === 60));
          if (q) await page.mouse.click((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2);
          await page.waitForTimeout(1800);
        }],
        ['tooltip-desktop', 'desktop', '/violin?view=2d', async (page) => {
          await page.locator('.pl-pieces').first().hover();
          await page.waitForTimeout(900);
        }],
        ['orchestra-vector-desktop', 'desktop', '/symphony?view=vector', playAt(60)],
        ['knobs-phone', 'phone', '/trombone?view=2d', async (page) => {
          await page.locator('.knob-toggle').click();
          await page.waitForTimeout(400);
        }],
        ['orchestra-2d-phone', 'phone', '/symphony?view=2d', playAt(60)],
        ['notes-phone', 'phone', '/notes', settle(1200), false],
        ['measurements-phone', 'phone', '/measurements', settle(2600), false],
        ['notfound-desktop', 'desktop', '/404.html', settle(600), false],
        ['notfound-phone', 'phone', '/404.html', settle(600), false],
        ['laptop-1345', 'laptop', '/piano?view=2d', settle(700), false],
        // the first viewport as a visitor on a link meets it: no gesture, the 3D stage drawn and waiting
        ['first-3d-phone', 'phone', '/cello?view=3d', settle(1500), false],
        ['first-3d-desktop', 'desktop', '/cello?view=3d', settle(1500), false],
        ['tablet-symphony-2d', 'tablet', '/symphony?view=2d', playAt(60)],
        ['landscape-piano-3d', 'landscape', '/piano?view=3d', hold([60, 64, 67], 1800)],
        ['upright-3d-desktop', 'desktop', '/piano/upright?view=3d', hold([48, 60, 64], 1800)],
        ['harp-2d-desktop', 'desktop', '/harp?view=2d', hold([55, 62, 67])],
        ['glock-vector-desktop', 'desktop', '/glockenspiel?view=vector', hold([84, 91])],
      ]
    : []),
];

// (a dev server builds its modules on the first request, and may reload the page that asked: one page first, to no purpose)
{
  const ctx = await browser.newContext(DEVS.desktop);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/piano?view=3d`).catch(() => {});
  await page.waitForTimeout(2500);
  await ctx.close();
}
for (const [name, dev, path, steps, start = true] of SHOTS) {
  if (ONLY.length && !ONLY.some((s) => name.includes(s))) continue;
  const file = `${OUT}/${TAG}-${name}.png`;
  if (KEEP && existsSync(file)) {
    console.log(`${file}  kept`);
    continue;
  }
  const ctx = await browser.newContext(DEVS[dev]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  try {
    await page.goto(`${BASE}${path}`);
    await page.evaluate(() => document.fonts.ready);
    if (start && (await page.evaluate(() => !!window.__piano))) {
      await page.evaluate(() => window.__piano.start());
      await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 40_000 });
    }
    if (/view=3d/.test(path)) await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 30, null, { timeout: 90_000 });
    await steps?.(page);
    await page.screenshot({ path: file });
    console.log(`${file}${errs.length ? `  !! ${errs.join(' | ')}` : ''}`);
  } catch (e) {
    console.log(`${file}  !! FAILED ${String(e.message).split('\n')[0]}`);
  } finally {
    await ctx.close();
  }
}
await browser.close();
