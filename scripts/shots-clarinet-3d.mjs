// The clarinet's 3D review set (art direction §5): the hero view (the scene's own, as the stage first
// shows it), a front, a side and a back view, the mouthpiece with its reed and ligature, the keywork of
// each joint, the little fingers' keys, the bell, an actuated frame (a note sounding, its keys down), the
// phone held upright, and the Orchestra with a clarinet in it. Each picture is the 3D stage's canvas.
//   BASE=http://localhost:4377 OUT=<dir> [SET=before|after] [VIEWS=hero,front,…] [PHONE=1] [DSF=1] node scripts/shots-clarinet-3d.mjs
// SET=before shoots what the placeholder can show (hero, actuated, phone, orchestra); `after` the whole
// set. Views are { yaw, pitch, dist, target } in the stage's units (window.__stage3d.setView). The
// clarinet's world points (clarinet3d.ts): held at a player's angle, the mouthpiece up and towards the
// player (+z), the bell down and out; its middle ≈ (0, 0.30, 0). The pictures are PNGs at the device
// scale: `python3 scripts/shots-compress.py <dir>` makes JPEGs of them for the repo.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/clarinet/3d/after';
const BASE = process.env.BASE ?? 'http://localhost:4377';
const SET = process.env.SET ?? 'after';
const VIEWS = process.env.VIEWS?.split(',');
const PHONE = process.env.PHONE === '1';
const DSF = Number(process.env.DSF ?? (PHONE ? 3 : 1));
const NOTE = Number(process.env.NOTE ?? 55); // G3 concert (written A3): the left hand and R1, R2 down
mkdirSync(OUT, { recursive: true });

// (the clarinet stands along its own axis: these views are taken about the model's points, from the
// model's own frame through its pose, clarinet3d.ts CLARINET_POSE: square on to the rings, from the
// player's left and from behind, each across the clarinet's axis; then close up)
const V = {
  front: { yaw: -0.304, pitch: 0.38, dist: 0.95, target: [0, 0.3, 0.02] },
  side: { yaw: 1.734, pitch: 0.845, dist: 0.95, target: [0, 0.3, 0.02] },
  back: { yaw: 2.838, pitch: 0.12, dist: 0.95, target: [0, 0.3, 0.02] },
  // the mouthpiece from the player's right (the ligature's screws) and from behind (the reed)
  mouthpiece: { yaw: -1.407, pitch: -0.3, dist: 0.13, target: [-0.2081, 0.4628, 0.1534] },
  reed: { yaw: -2.6, pitch: -0.45, dist: 0.13, target: [-0.2081, 0.4628, 0.1534] },
  // each joint square on to its rings
  upper: { yaw: -0.304, pitch: 0.38, dist: 0.24, target: [-0.0534, 0.3418, 0.0543] },
  lower: { yaw: -0.304, pitch: 0.38, dist: 0.24, target: [0.0354, 0.2723, -0.0027] },
  low: { yaw: -0.304, pitch: 0.38, dist: 0.24, target: [0.1048, 0.218, -0.0472] },
  // the right little finger's keys from the player's right, the left's from the left, the back
  pinkies: { yaw: -0.653, pitch: 0.05, dist: 0.18, target: [0.0715, 0.244, -0.0259] },
  lpinky: { yaw: 0.886, pitch: 0.7, dist: 0.18, target: [0.0094, 0.2927, 0.014] },
  thumb: { yaw: 2.838, pitch: 0.12, dist: 0.22, target: [-0.0642, 0.3503, 0.0612] },
  bell: { yaw: 0.2, pitch: 0.3, dist: 0.3, target: [0.194, 0.1482, -0.1044] },
  // low across the upper joint's rings and pads: the gap under an open pad shows
  graze: { yaw: 0.6, pitch: 0.62, dist: 0.16, target: [-0.0725, 0.3568, 0.0665] },
};
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
// (TALL=1: a tall window, for the review sheets' close-ups: the stage is then about as tall as it is wide)
const TALL = process.env.TALL === '1';
const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true } : { viewport: { width: TALL ? 1200 : 1440, height: TALL ? 1550 : 900 }, deviceScaleFactor: DSF });
await ctx.addInitScript(() => {
  localStorage.setItem('piano-model.instrument', 'clarinet');
  localStorage.setItem('piano-model.3d', '1');
  localStorage.setItem('piano-model.style', 'classic');
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => (m.type() === 'error' || /webgl|GL_[A-Z_]{4,}/i.test(m.text())) && errors.push(m.text()));
await page.goto(`${BASE}/`);
await page.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 30000 });
await page.evaluate(async () => {
  await window.__piano.start();
  await window.__piano.setInstrument('clarinet');
});
await page.waitForTimeout(2000);

const shoot = async (name) => {
  const file = `${PHONE ? 'phone-' : ''}clarinet-${name}.png`;
  await page.locator('.stage-3d').screenshot({ path: join(OUT, file) });
  const st = await page.evaluate(() => ({ ms: +window.__stage3d.stats.ms.toFixed(2), home: window.__stage3d.home, box: window.__stage3d.box(), w: window.__stage3d.el.clientWidth, h: window.__stage3d.el.clientHeight, over: document.querySelector('.player .pl-row')?.getBoundingClientRect().bottom - window.__stage3d.el.getBoundingClientRect().top }));
  console.log(file, JSON.stringify({ ms: st.ms, box: st.box && Object.fromEntries(Object.entries(st.box).map(([k, v]) => [k, Math.round(v)])), stage: [st.w, st.h], over: Math.round(st.over), home: name === 'hero' ? { ...st.home, target: st.home.target.map((v) => +v.toFixed(3)), dist: +st.home.dist.toFixed(3) } : undefined }));
};
const view = async (v) => {
  await page.evaluate((v) => {
    const s = window.__stage3d;
    s.resetView();
    if (v) s.setView(v);
    // (the review's close-ups without the file player over them; the stage's own views keep it)
    const pl = document.querySelector('.player');
    if (pl) pl.style.visibility = v ? 'hidden' : '';
  }, v);
  await page.waitForTimeout(700);
};
const want = (n) => !VIEWS || VIEWS.includes(n);

const shots = PHONE || SET === 'before' ? ['hero'] : ['hero', ...Object.keys(V)];
for (const which of shots) {
  if (!want(which)) continue;
  await view(which === 'hero' ? null : V[which]);
  await shoot(which);
}
// a note sounding: the keys down for it, the reed beating, the bore and the bell alight
if (want('actuated')) {
  await view(null);
  await page.evaluate((m) => window.__piano.noteOn(m, 110, 'keys'), NOTE);
  await page.waitForTimeout(900);
  await shoot('actuated');
  if (!PHONE && SET !== 'before') {
    for (const v of ['upper', 'lower', 'low', 'pinkies', 'mouthpiece', 'graze']) {
      if (!V[v]) continue;
      await view(V[v]);
      await shoot(`actuated-${v}`);
    }
  }
  await page.evaluate((m) => window.__piano.noteOff(m, 'keys'), NOTE);
  await page.waitForTimeout(1500);
}
// the Orchestra: a wind section and strings, the clarinet among them
if (want('orchestra')) {
  await view(null);
  await page.locator('.ens-toggle').click();
  await page.evaluate(() => window.__orchestra.ensemble.setLineup(['violin', 'flute', 'oboe', 'clarinet', 'cello']));
  await page.waitForTimeout(1500);
  await shoot('orchestra');
}
if (errors.length) console.log('ERRORS', errors.slice(0, 5).join(' | '));
await ctx.close();
await browser.close();
