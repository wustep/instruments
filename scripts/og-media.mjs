// The link preview's picture, taken from the app itself: the og:image (the grand piano in 3D, its lid
// raised, in its pool of light on the right of the card; the title alone in the dark on the left).
// Nothing is drawn but the title: the picture is the 3D canvas as the app renders it.
//   pnpm build && pnpm preview --port 5417 --strictPort &
//   BASE=http://localhost:5417 node scripts/og-media.mjs
// Writes apps/web/public/og/instruments-grand.jpg (1200×630, under 300 KB); the stills it is made
// from in .cache/og-media/. Needs Chrome and Python with Pillow.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE ?? 'http://localhost:5417';
const RAW = join(ROOT, '.cache/og-media');
const OUT = join(ROOT, 'apps/web/public/og');
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

const W = 1200;
const H = 630;
const NAME = 'instruments-grand.jpg';
const MAX_KB = 300;
const TITLE = 'Instruments';
/** the grand from its front quarter, a little from above (radians). At yaw 0.84 with the piano off
 *  the middle its pedal lyre flares white; 0.95 is clean. */
const LOOK = { yaw: 0.95, pitch: 0.3 };
/** where the whole piano (lid and casters included) sits on the card, CSS px: its box's middle and
 *  its height. The left half is left to the title. */
const PLACE = { cx: 842, cy: 318, h: 548 };
/** the title's line box (100 px, line-height 1) from the card's top left. Alone on the card, the
 *  word is centred by its ink, not its box: the ink's centre of weight, measured 45.4 px under the
 *  box's top, lies on the card's middle line (315). The capital then stands from y 272, the small
 *  letters from y 292, on a baseline at y 344: the letters' own middle (318) is the piano's. */
const TITLE_AT = { left: 72, top: 270 };

/** A 2x PNG to the card's JPEG: Lanczos to w×h, quality 90, 4:4:4 so the type's edges stay clean.
 *  (Pillow, not ffmpeg: ffmpeg's conversion to JPEG's colours moves the dark ground about a level
 *  towards green, measured; Pillow's is within a tenth of a level of the PNG.) */
const TO_JPG = `import sys
from PIL import Image
w, h = int(sys.argv[3]), int(sys.argv[4])
im = Image.open(sys.argv[1]).convert("RGB").resize((w, h), Image.LANCZOS)
im.save(sys.argv[2], "JPEG", quality=90, subsampling=0, optimize=True, progressive=True)
`;
const toJpg = (png, jpg, w, h) => execFileSync('python3', ['-c', TO_JPG, png, jpg, String(w), String(h)], { stdio: ['ignore', 'pipe', 'inherit'] });
const font = (p) => `data:font/woff2;base64,${readFileSync(join(ROOT, 'apps/web/node_modules', p)).toString('base64')}`;

/** The card: the still `bg`, darkened to the left so the title has clean ground, and the title as
 *  the site sets its display type (Newsreader italic, styles.css) */
function cardHtml(bg) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Newsreader Variable'; font-style: italic; font-weight: 200 800; src: url(${font('@fontsource-variable/newsreader/files/newsreader-latin-opsz-italic.woff2')}) format('woff2-variations'); }
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #0e0d0b; }
.bg { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; filter: brightness(1.11) contrast(1.1) saturate(1.08); }
.shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(14,13,11,0.82) 0%, rgba(14,13,11,0.6) 30%, rgba(14,13,11,0) 52%), radial-gradient(ellipse 80% 90% at 70% 55%, rgba(14,13,11,0) 55%, rgba(14,13,11,0.6) 100%); }
h1 { position: absolute; left: ${TITLE_AT.left}px; top: ${TITLE_AT.top}px; margin: 0; font: italic 400 100px/1 'Newsreader Variable', serif; font-variation-settings: 'opsz' 72; letter-spacing: -0.012em; color: #ece2ce; }
</style></head><body><img class="bg" src="data:image/png;base64,${readFileSync(bg).toString('base64')}"><div class="shade"></div><h1>${TITLE}</h1></body></html>`;
}

async function renderHtml(browser, html, w, h, path) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const bad = await page.evaluate(() => [...document.fonts].filter((f) => f.status !== 'loaded').map((f) => f.family));
  if (bad.length) throw new Error(`fonts not loaded: ${bad}`);
  await page.screenshot({ path });
  await page.close();
}

/** the app on the grand in 3D, the stage exactly w×h CSS px (the page grown round it) */
async function openStage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  await page.goto(`${BASE}/piano?view=3d`);
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    await window.__piano.start();
  });
  await page.waitForFunction(() => document.querySelector('.stage-3d'));
  for (let k = 0; k < 5; k++) {
    const [ch, ih] = await page.evaluate(() => [document.querySelector('.stage-3d').getBoundingClientRect().height, innerHeight]);
    if (Math.abs(ch - h) < 0.5) break;
    await page.setViewportSize({ width: w, height: Math.round(ih + (h - ch)) });
    await page.waitForTimeout(300);
  }
  const box = await page.evaluate(() => {
    const r = document.querySelector('.stage-3d').getBoundingClientRect();
    return [r.width, r.height];
  });
  if (Math.abs(box[0] - w) > 0.5 || Math.abs(box[1] - h) > 0.5) throw new Error(`stage is ${box}, not ${w}×${h}`);
  // (the file player, the knobs and the stage's own buttons lie over the canvas: not in the picture)
  await page.addStyleTag({ content: '.player, .stage-knob, .zoom-back, .stage-top { visibility: hidden !important; }' });
  await page.waitForFunction(() => window.__stage3d && window.__stage3d.home && window.__stage3d.stats.frames > 5);
  // (the lid and the room's light as a first visit has them, the stage settled)
  await page.waitForTimeout(2000);
  return { ctx, page };
}

/** wait for the 3D stage to draw n more frames */
async function frames(page, n = 3) {
  const f0 = await page.evaluate(() => window.__stage3d.stats.frames);
  await page.waitForFunction(([f0, n]) => window.__stage3d.stats.frames >= f0 + n || window.__stage3d.stats.frames < f0, [f0, n]);
}

/** put the camera at `v` (dist in the views' own units) and read the instrument's box on screen */
async function boxAt(page, v) {
  await page.evaluate((v) => window.__stage3d.setView(v), v);
  await frames(page, 3);
  return page.evaluate(() => window.__stage3d.box());
}

/** Move the camera's target and distance (its yaw and pitch kept) until the instrument's box on
 *  screen is where `want` says: { cx, cy } its middle and h its height, CSS px. */
async function fitView(page, view, want) {
  const v = { ...view, target: [...view.target] };
  const mid = (b) => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  let b = await boxAt(page, v);
  for (let it = 0; it < 8; it++) {
    v.dist *= (b.y1 - b.y0) / want.h;
    b = await boxAt(page, v);
    const c = mid(b);
    // how the box's middle moves with each axis of the target, then the least move that puts it right
    const J = [];
    const e = 0.04;
    for (let k = 0; k < 3; k++) {
      const t = [...v.target];
      t[k] += e;
      const m = mid(await boxAt(page, { ...v, target: t }));
      J.push([(m[0] - c[0]) / e, (m[1] - c[1]) / e]);
    }
    const d = [want.cx - c[0], want.cy - c[1]];
    const a = J.reduce((s, r) => s + r[0] * r[0], 0);
    const bq = J.reduce((s, r) => s + r[0] * r[1], 0);
    const cq = J.reduce((s, r) => s + r[1] * r[1], 0);
    const det = a * cq - bq * bq;
    const l0 = (cq * d[0] - bq * d[1]) / det;
    const l1 = (-bq * d[0] + a * d[1]) / det;
    for (let k = 0; k < 3; k++) v.target[k] += J[k][0] * l0 + J[k][1] * l1;
    b = await boxAt(page, v);
    const m = mid(b);
    if (Math.hypot(m[0] - want.cx, m[1] - want.cy) < 1.5 && Math.abs(b.y1 - b.y0 - want.h) < 2) return { view: v, box: b };
  }
  throw new Error(`the piano is not where the card wants it: ${JSON.stringify(b)}`);
}

// ---------------------------------------------------------------- the image
async function image(browser) {
  const { ctx, page } = await openStage(browser, W, H);
  const home = await page.evaluate(() => window.__stage3d.home);
  const { view, box } = await fitView(page, { target: home.target, dist: 3.8, ...LOOK }, PLACE);
  await frames(page, 4);
  // (a slow machine makes the stage draw less: a still of that is not the picture)
  const drawn = await page.evaluate(() => {
    const { lite, shadows, ao } = window.__stage3d.stats;
    return { lite, shadows, ao };
  });
  if (drawn.lite || !drawn.shadows || !drawn.ao) throw new Error(`the stage is not drawing in full: ${JSON.stringify(drawn)}`);
  const still = join(RAW, 'grand.png');
  await page.locator('.stage-3d').screenshot({ path: still });
  console.log(`view: ${JSON.stringify(view)}\nbox: ${JSON.stringify(box)}`);
  await ctx.close();
  const card = join(RAW, 'card@2x.png');
  await renderHtml(browser, cardHtml(still), W, H, card);
  const jpg = join(OUT, NAME);
  toJpg(card, jpg, W, H);
  const kb = statSync(jpg).size / 1024;
  if (kb >= MAX_KB) throw new Error(`${jpg} is ${kb.toFixed(0)} KB, over ${MAX_KB}`);
  console.log(`image: ${jpg} (${kb.toFixed(0)} KB)`);
}

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
try {
  await image(browser);
} finally {
  await browser.close();
}
writeFileSync(join(RAW, 'done'), new Date().toISOString());
