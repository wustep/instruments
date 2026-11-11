// The link preview's picture, taken from the app itself: the og:image (the 3D orchestra under the
// title). Nothing is drawn but the title: the picture is the 3D canvas as the app renders it.
//   pnpm build && pnpm preview --port 5417 --strictPort &
//   BASE=http://localhost:5417 node scripts/og-media.mjs
// Writes apps/web/public/og/instruments.jpg (1200×630); the stills it is made from in
// .cache/og-media/. Needs Chrome and ffmpeg.
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

const PIECE = 4; // Beethoven, Symphony No. 5, I (orchestra/pieces.ts)
const TITLE = 'Instruments';
const TAGLINE = 'computed from physics, not samples';
/** the lens's distances are scaled like the stage's own views (stage3d.ts FRAME) */
const FRAME = Math.tan(0.3) / Math.tan((12 * Math.PI) / 180);
/** the still: the whole orchestra, the title over it */
const WIDE = { target: [-0.35, 1.64, 1.4], yaw: 0, pitch: 0.26, dist: 9.9 };

const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a], { stdio: ['ignore', 'pipe', 'inherit'] });
const font = (p) => `data:font/woff2;base64,${readFileSync(join(ROOT, 'apps/web/node_modules', p)).toString('base64')}`;

/** The title as the site sets its display type: Newsreader italic over IBM Plex Mono (styles.css),
 *  over the still `bg` */
function titleHtml({ w, h, bg, size, tsize, top }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Newsreader Variable'; font-style: italic; font-weight: 200 800; src: url(${font('@fontsource-variable/newsreader/files/newsreader-latin-opsz-italic.woff2')}) format('woff2-variations'); }
@font-face { font-family: 'IBM Plex Mono'; font-weight: 400; src: url(${font('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2')}) format('woff2'); }
html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: #0e0d0b; }
.bg { position: absolute; inset: 0; width: ${w}px; height: ${h}px; object-fit: cover; filter: brightness(1.12) contrast(1.06) saturate(1.06); }
.shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(14,13,11,0.78) 0%, rgba(14,13,11,0.35) 30%, rgba(14,13,11,0) 48%), radial-gradient(ellipse 90% 85% at 55% 60%, rgba(14,13,11,0) 55%, rgba(14,13,11,0.55) 100%); }
.t { position: absolute; left: 0; right: 0; top: ${top}px; text-align: center; }
h1 { margin: 0; font: italic 400 ${size}px/1 'Newsreader Variable', serif; font-variation-settings: 'opsz' 72; letter-spacing: -0.012em; color: #ece2ce; text-shadow: 0 2px 24px rgba(14,13,11,0.6); }
p { margin: ${Math.round(size * 0.13)}px 0 0; font: 400 ${tsize}px/1.3 'IBM Plex Mono', monospace; color: #c9bfab; letter-spacing: 0.01em; text-shadow: 0 1px 12px rgba(14,13,11,0.8); }
</style></head><body><img class="bg" src="data:image/png;base64,${readFileSync(bg).toString('base64')}"><div class="shade"></div><div class="t"><h1>${TITLE}</h1><p>${TAGLINE}</p></div></body></html>`;
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

/** the app with the 3D stage exactly w×h CSS px (the page grown round it), the orchestra loaded and
 *  playing */
async function openStage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    localStorage.setItem('piano-model.instrument', 'violin');
    localStorage.setItem('piano-model.3d', '1');
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()));
  await page.goto(`${BASE}/`);
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    await window.__piano.start();
  });
  await page.waitForFunction(() => document.querySelector('.stage-3d'));
  for (let k = 0; k < 4; k++) {
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
  // (the file player and the knobs lie over the canvas: not in the picture)
  await page.addStyleTag({ content: '.player, .stage-knob { visibility: hidden !important; }' });
  await page.evaluate(async (i) => {
    await window.__orchestra.loadPiece(i);
  }, PIECE);
  await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 5);
  return { ctx, page };
}

const setView = (page, v) =>
  page.evaluate(([v, F]) => window.__stage3d.setView({ target: v.target, yaw: v.yaw, pitch: v.pitch, dist: v.dist / F }), [v, FRAME]);

// ---------------------------------------------------------------- the image
async function image(browser) {
  const W = 1200;
  const H = 630;
  const { ctx, page } = await openStage(browser, W, H);
  // (into the first tutti: every section has played, the bows are on the string)
  await page.waitForTimeout(10500);
  await setView(page, WIDE);
  await page.waitForTimeout(250);
  const still = join(RAW, 'still.png');
  await page.locator('.stage-3d').screenshot({ path: still });
  await ctx.close();
  const card = join(RAW, 'card@2x.png');
  await renderHtml(browser, titleHtml({ w: W, h: H, bg: still, size: 112, tsize: 27, top: 30 }), W, H, card);
  const jpg = join(OUT, 'instruments.jpg');
  ff('-i', card, '-vf', `scale=${W}:${H}:flags=lanczos,format=yuvj444p`, '-q:v', '2', jpg);
  console.log(`image: ${jpg} (${(statSync(jpg).size / 1024).toFixed(0)} KB)`);
}

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
try {
  await image(browser);
} finally {
  await browser.close();
}
writeFileSync(join(RAW, 'done'), new Date().toISOString());
