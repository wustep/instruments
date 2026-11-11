// The 2D pianos' review set (PR "piano 2D: slightly more like the instrument"): the grand and the upright
// alone on the stage, in the drawn look and the vector lines, on a laptop (1440×900) and a phone (390×844,
// 2×), at rest and sounding (a chord under the sustain pedal); a phone scrolled to the bass; the grand's lid
// half down; and an ensemble with a small piano in it (grand and upright). PNGs named `<name>-<TAG>.png`,
// for scripts/pair-shots.py to set before and after side by side.
//   pnpm build && pnpm preview --port 4473 --strictPort &
//   OUT=<dir> BASE=http://localhost:4473 TAG=after [SETS=alone,bass,lid,ensemble] node scripts/shots-piano-2d.mjs
//   python3 scripts/pair-shots.py <dir> artifacts/realistic-3d/final-symphony/piano-2d
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/piano-2d/png';
const BASE = process.env.BASE ?? 'http://localhost:4473';
const TAG = process.env.TAG ?? 'after';
const SETS = (process.env.SETS ?? 'alone,bass,lid,ensemble').split(',');
const STYLES = (process.env.STYLES ?? 'classic,vector').split(',');
const DEVS = (process.env.DEVS ?? 'laptop,phone').split(',');
const KINDS = (process.env.KINDS ?? 'grand,upright').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const DEVICES = {
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
/** a chord across the registers (a phone shows the middle two octaves: C4 E4 G4 are on it) */
const CHORD = [36, 48, 60, 64, 67, 84];

async function open(dev, path, style) {
  const ctx = await browser.newContext(DEVICES[dev]);
  await ctx.addInitScript((s) => {
    localStorage.setItem('piano-model.3d', '0');
    localStorage.setItem('piano-model.style', s === 'vector' ? 'vector' : 'classic');
  }, style);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', dev, path, e.message));
  await page.goto(BASE + path);
  await page.waitForFunction(() => !!window.__piano, null, { timeout: 30_000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__piano.start());
  await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 30_000 });
  await page.waitForTimeout(900);
  return { ctx, page };
}
/** the stage (under the top panel, over the keys) */
const stageClip = async (page) =>
  page.evaluate(() => {
    const el = document.querySelector('canvas.stage, .stage canvas, canvas');
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(innerWidth, r.width), height: Math.min(innerHeight - r.top, r.height) };
  });
const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}-${TAG}.png`, clip: await stageClip(page) });
  console.log(name);
};
const sound = async (page) => {
  await page.evaluate((ns) => {
    window.__piano.sustain(1);
    ns.forEach((m, k) => setTimeout(() => window.__piano.noteOn(m, 96, 'keys'), k * 30));
  }, CHORD);
  await page.waitForTimeout(650);
};
const hush = async (page) => {
  await page.evaluate((ns) => {
    for (const m of ns) window.__piano.noteOff(m, 'keys');
    window.__piano.sustain(0);
  }, CHORD);
};

for (const kind of KINDS) {
  const path = kind === 'upright' ? '/piano/upright' : '/piano';
  for (const dev of DEVS)
    for (const style of STYLES) {
      if (SETS.includes('alone')) {
        const { ctx, page } = await open(dev, path, style);
        await shot(page, `${kind}-${style}-${dev}-rest`);
        await sound(page);
        await shot(page, `${kind}-${style}-${dev}-sounding`);
        await hush(page);
        await ctx.close();
      }
      // a phone's keyboard scrolled to the bass: the overstrung strings and their bridge
      if (SETS.includes('bass') && dev === 'phone') {
        const { ctx, page } = await open(dev, path, style);
        await page.evaluate(() => {
          const sc = document.querySelector('.kb-scroll') ?? [...document.querySelectorAll('*')].find((e) => e.scrollWidth > e.clientWidth + 200 && getComputedStyle(e).overflowX !== 'visible');
          if (sc) sc.scrollLeft = 0;
        });
        await page.waitForTimeout(1200);
        await shot(page, `${kind}-${style}-${dev}-bass`);
        await ctx.close();
      }
      // the grand's lid half down: its shade over the plate
      if (SETS.includes('lid') && kind === 'grand' && dev === 'laptop') {
        const { ctx, page } = await open(dev, path, style);
        await page.evaluate(() => window.__piano.setParams({ lid: 0.5 }));
        await page.waitForTimeout(600);
        await shot(page, `${kind}-${style}-${dev}-lid-half`);
        await ctx.close();
      }
    }
}

// a small piano among others: the same drawers in an ensemble's cell
if (SETS.includes('ensemble'))
  for (const dev of DEVS)
    for (const style of STYLES)
      for (const kind of KINDS) {
        const { ctx, page } = await open(dev, `/orchestra?v=1&seats=violin,cello,${kind}&view=${style === 'vector' ? 'vector' : '2d'}`, style);
        await page.waitForFunction(() => window.__orchestra?.ensemble?.parts?.length === 3 && window.__orchestra.ensemble.parts.every((p) => p.engine), null, { timeout: 30_000 });
        await page.waitForTimeout(900);
        await shot(page, `ensemble-${kind}-${style}-${dev}`);
        await ctx.close();
      }
await browser.close();
