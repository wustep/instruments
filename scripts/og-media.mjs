// The link preview's picture, taken from the app itself: the og:image (the grand piano in 3D, its lid
// raised, in the daylight studio on the right of the card; the title alone on the plaster at the left).
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
/** the camera (yaw and pitch in radians, dist in the views' own units, as setView takes it): the
 *  grand from its front quarter, a little from above. At yaw 0.84 with the piano off the middle its
 *  pedal lyre flares white; 0.95 is clean. The target and the distance were found by moving them
 *  until the piano's box sat where BOX says. They are fixed here, not the stage's own view moved,
 *  so the picture does not change when the stage's home view does. */
const VIEW = { target: [-0.842659, 0.719902, -0.031585], yaw: 0.95, pitch: 0.3, dist: 4.44914 };
/** where that puts the whole piano (lid and casters included) on the card, CSS px: its middle at
 *  (842, 318), 548 px high, the left half left to the title. Checked before the still is taken: a
 *  change to the model or the lens that moves the piano is said, not photographed. */
const BOX = { x0: 616, x1: 1068, y0: 44, y1: 592 };
/** the title: 72 px from the card's left, 104 px, set light as the readout sets a note. Alone on the
 *  card, the word is centred by its ink, not its box: the card measures the word's own ink (its
 *  capital's top to its baseline) and puts the middle of that on the card's middle line (315). */
const TITLE_AT = { left: 72, mid: 315, size: 104 };

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

/** The card: the still `bg` on the studio's plaster, eased into the page's own ground at the left so the
 *  title has clean ground, and the title as the site sets its display type (Ysabeau Office, light:
 *  styles.css). The word is an SVG text, so its baseline can be put exactly. */
function cardHtml(bg) {
  const face = `300 ${TITLE_AT.size}px 'Ysabeau Office Variable'`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Ysabeau Office Variable'; font-style: normal; font-weight: 1 1000; src: url(${font('@fontsource-variable/ysabeau-office/files/ysabeau-office-latin-wght-normal.woff2')}) format('woff2-variations'); }
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #eceff1; }
.bg { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
.shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(236,239,241,0.92) 0%, rgba(236,239,241,0.7) 30%, rgba(236,239,241,0) 50%); }
svg { position: absolute; left: 0; top: 0; }
text { font: ${face}; letter-spacing: -0.02em; fill: #1c222a; }
</style></head><body><img class="bg" src="data:image/png;base64,${readFileSync(bg).toString('base64')}"><div class="shade"></div>
<svg width="${W}" height="${H}"><text id="t" x="${TITLE_AT.left}" y="${TITLE_AT.mid}">${TITLE}</text></svg>
<script>
document.fonts.load(${JSON.stringify(face)}).then(() => {
  // the word's ink: from its capital's top to its baseline (it has no descender), centred on the middle line
  const c = document.createElement('canvas').getContext('2d');
  c.font = ${JSON.stringify(face)};
  const m = c.measureText(${JSON.stringify(TITLE)});
  document.getElementById('t').setAttribute('y', String(${TITLE_AT.mid} + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2));
  document.body.dataset.set = '1';
});
</script></body></html>`;
}

async function renderHtml(browser, html, w, h, path) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.body.dataset.set === '1');
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

// ---------------------------------------------------------------- the image
async function image(browser) {
  const { ctx, page } = await openStage(browser, W, H);
  await page.evaluate((v) => window.__stage3d.setView(v), VIEW);
  await frames(page, 4);
  const box = await page.evaluate(() => window.__stage3d.box());
  const off = box ? Math.max(...Object.keys(BOX).map((k) => Math.abs(box[k] - BOX[k]))) : Infinity;
  if (off > 2) throw new Error(`the piano is not where the card has it: ${JSON.stringify(box)}, not ${JSON.stringify(BOX)}`);
  // (a slow machine makes the stage draw less: a still of that is not the picture)
  const drawn = await page.evaluate(() => {
    const { lite, shadows, ao } = window.__stage3d.stats;
    return { lite, shadows, ao };
  });
  if (drawn.lite || !drawn.shadows || !drawn.ao) throw new Error(`the stage is not drawing in full: ${JSON.stringify(drawn)}`);
  const still = join(RAW, 'grand.png');
  await page.locator('.stage-3d').screenshot({ path: still });
  console.log(`box: ${JSON.stringify(box)}`);
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
