// The top panel, before and after: one instrument with a chord held (a piano, then a cello's double stop
// asked of a one-voice instrument), the Daylight quintet and Beethoven's Fifth with their parts sounding, and
// the Measurements page's header, on a computer and a phone. Shot on two builds:
//   BASE=http://localhost:4391 TAG=after OUT=artifacts/realistic-3d/final-next5/top-panel node scripts/shots-top-panel.mjs
//   BASE=https://instruments-wustep.vercel.app TAG=before …            (ONLY=desktop|phone, LOOK=2d|vector|3d)
// PNG at device pixels (sips makes the JPEGs kept in the repo); what each state's readout said goes to stdout.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { QUINTET, SYMPHONY } from '../apps/web/test/presets.ts';

const BASE = process.env.BASE ?? 'http://localhost:4391';
const TAG = process.env.TAG ?? 'after';
const OUT = process.env.OUT ?? 'test-results/top-panel';
const ONLY = process.env.ONLY ?? '';
const LOOK = process.env.LOOK ?? '2d';
const SCENES = (process.env.SCENES ?? '').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const report = {};
const shot = async (page, name) => {
  await page.evaluate(() => document.querySelectorAll('.tip').forEach((t) => (t.hidden = true)));
  await page.screenshot({ path: `${OUT}/${name}-${TAG}.png` });
  // the chrome alone, close up (the band over the stage and the header above it)
  const band = await page.evaluate(() => {
    const b = document.querySelector('.stage-top')?.getBoundingClientRect();
    return b ? Math.ceil(b.bottom) + 8 : 60;
  });
  const vp = page.viewportSize();
  await page.screenshot({ path: `${OUT}/${name}-chrome-${TAG}.png`, clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, band) } });
};
/** what the page's readouts say (whatever the build calls them) */
const said = (page) =>
  page.evaluate(() => {
    const t = (s) => [...document.querySelectorAll(s)].map((e) => (e.getAttribute('aria-label') && !e.textContent.trim() ? e.getAttribute('aria-label') : e.textContent.trim().replace(/\s+/g, ' '))).filter(Boolean);
    return { readout: t('.readout'), cap: t('.scope-cap'), band: Math.round(document.querySelector('.stage-top')?.getBoundingClientRect().height ?? 0), scrollW: document.documentElement.scrollWidth };
  });
const running = (page) => page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 30_000 });
const start = async (page, opts) => {
  if (opts.hasTouch) await page.touchscreen.tap(200, 300);
  else await page.mouse.click(700, 400);
};
const hold = (page, notes) => page.evaluate((ns) => ns.forEach((m, i) => setTimeout(() => window.__piano.noteOn(m, 0.6, 'midi'), 30 * i)), notes);
const playing = async (page, ms) => {
  await page.getByRole('button', { name: /^Play/ }).first().click();
  await page.waitForTimeout(ms);
};

const scenes = {
  // a piano, a four-note chord held (C major seventh)
  'piano-chord': async (page, opts) => {
    await page.goto(`${BASE}/piano?view=${LOOK}`);
    await start(page, opts);
    await running(page);
    await hold(page, [60, 64, 67, 71]);
    await page.waitForTimeout(700);
  },
  // nothing played yet: the chrome at rest
  'piano-rest': async (page) => {
    await page.goto(`${BASE}/piano?view=${LOOK}`);
    await page.waitForTimeout(900);
  },
  // a cello, one note bowed (its string and bow readout)
  'cello-note': async (page, opts) => {
    await page.goto(`${BASE}/cello?view=${LOOK}`);
    await start(page, opts);
    await running(page);
    await hold(page, [50]);
    await page.waitForTimeout(900);
  },
  // the Daylight quintet, its own piece a few seconds in: several parts sounding
  quintet: async (page) => {
    await page.goto(`${BASE}${QUINTET}&view=${LOOK}`);
    await page.waitForTimeout(1200);
    await playing(page, 7000);
  },
  // Beethoven's Fifth: eighteen seats, the tutti a few seconds in
  symphony: async (page) => {
    await page.goto(`${BASE}${SYMPHONY}&view=${LOOK}`);
    await page.waitForTimeout(1500);
    await playing(page, 9000);
  },
  // where the picker folds behind one button: its sheet open (a build without one: the page as it is)
  sheet: async (page) => {
    await page.goto(`${BASE}/cello?view=${LOOK}`);
    await page.waitForTimeout(900);
    const open = page.locator('.pick-open');
    if (await open.isVisible().catch(() => false)) await open.click();
    await page.waitForTimeout(300);
  },
  'sheet-orchestra': async (page) => {
    await page.goto(`${BASE}${SYMPHONY}&view=${LOOK}`);
    await page.waitForTimeout(1500);
    const open = page.locator('.pick-open');
    if (await open.isVisible().catch(() => false)) await open.click();
    await page.waitForTimeout(300);
  },
  measurements: async (page) => {
    await page.goto(`${BASE}/measurements`);
    await page.waitForTimeout(900);
  },
  notes: async (page) => {
    await page.goto(`${BASE}/notes`);
    await page.waitForTimeout(900);
  },
};

for (const [dev, opts] of Object.entries(DEVS)) {
  if (ONLY && ONLY !== dev) continue;
  for (const [name, run] of Object.entries(scenes)) {
    if (SCENES.length && !SCENES.includes(name)) continue;
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    try {
      await run(page, opts);
      await shot(page, `${name}-${dev}`);
      report[`${name}-${dev}`] = { ...(await said(page)), errors: errs.slice(0, 5) };
    } catch (e) {
      report[`${name}-${dev}`] = { failed: String(e).slice(0, 300), errors: errs.slice(0, 5) };
    }
    await ctx.close();
  }
}
console.log(JSON.stringify(report, null, 1));
await browser.close();
