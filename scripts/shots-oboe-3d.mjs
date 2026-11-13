// The oboe's 3D review set (art direction §5): the hero view (the scene's own, as the stage first shows
// it), a front and a side view, the reed and the keywork close up, the bell, an actuated frame (a note
// sounding, its keys down), the phone held upright, and the Orchestra with an oboe in it. Each picture
// is the 3D stage's canvas alone.
//   BASE=http://localhost:4332 OUT=<dir> [SET=before|after] [VIEWS=hero,front,…] [PHONE=1] [DSF=1] node scripts/shots-oboe-3d.mjs
// SET=before shoots what the placeholder can show (hero, actuated, phone, orchestra); `after` the whole
// set. Views are { yaw, pitch, dist, target } in the stage's units (window.__stage3d.setView). The
// oboe's world points (oboe3d.ts): held at a player's angle, the reed's tip up and towards the player
// (+z), the bell down and out; its middle ≈ (0, 0.30, 0). The pictures are PNGs at the device scale:
// `python3 scripts/shots-compress.py <dir>` makes JPEGs of them for the repo.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/oboe/3d/after';
const BASE = process.env.BASE ?? 'http://localhost:4332';
const SET = process.env.SET ?? 'after';
const VIEWS = process.env.VIEWS?.split(',');
const PHONE = process.env.PHONE === '1';
const DSF = Number(process.env.DSF ?? (PHONE ? 3 : 1));
mkdirSync(OUT, { recursive: true });

// (the oboe stands along its own axis: these views are about the model's points, oboe3d.ts OBOE_VIEWS)
const V = {
  // (square on to the plates, and from the player's left and from behind, each across the oboe's axis)
  front: { yaw: -0.304, pitch: 0.38, dist: 0.95, target: [0.006, 0.293, 0.02] },
  side: { yaw: 1.734, pitch: 0.845, dist: 0.95, target: [0.006, 0.293, 0.02] },
  back: { yaw: 2.838, pitch: 0.12, dist: 0.95, target: [0.006, 0.293, 0.02] },
  reed: { yaw: 0.45, pitch: 0.22, dist: 0.16, target: [-0.205, 0.462, 0.152] },
  upper: { yaw: 0.22, pitch: 0.18, dist: 0.26, target: [-0.078, 0.361, 0.07] },
  lower: { yaw: 0.22, pitch: 0.18, dist: 0.26, target: [0.014, 0.289, 0.011] },
  thumb: { yaw: 2.84, pitch: 0.15, dist: 0.3, target: [-0.05, 0.34, 0.06] },
  bell: { yaw: 0.5, pitch: 0.05, dist: 0.3, target: [0.19, 0.155, -0.1] },
  // square on to the plates (the front's own bearing), as oboe-yamaha-side.jpg is taken
  upperF: { yaw: -0.304, pitch: 0.38, dist: 0.125, target: [-0.078, 0.361, 0.07] },
  lowerF: { yaw: -0.304, pitch: 0.38, dist: 0.125, target: [0.014, 0.289, 0.011] },
  bellF: { yaw: -0.304, pitch: 0.38, dist: 0.125, target: [0.16, 0.175, -0.082] },
  // the bell from the hero's own bearing, close
  bellH: { yaw: 0.22, pitch: 0.16, dist: 0.2, target: [0.205, 0.14, -0.11] },
  // the player's right-hand side of the lower joint and the bell (the big C♯, C and B keys), from below
  right: { yaw: -0.754, pitch: -0.2, dist: 0.32, target: [0.09, 0.23, -0.04] },
  // along the plates of the top joint, low across them: the gap under an open plate shows
  graze: { yaw: 0.6, pitch: 0.62, dist: 0.16, target: [-0.078, 0.361, 0.07] },
};
const NOTE = 62; // D4: every ring down (L1–L3, R1–R3), the plate shut

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: DSF });
await ctx.addInitScript(() => {
  localStorage.setItem('piano-model.instrument', 'oboe');
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
  await window.__piano.setInstrument('oboe');
});
await page.waitForTimeout(2000);

const shoot = async (name) => {
  const file = `${PHONE ? 'phone-' : ''}oboe-${name}.png`;
  await page.locator('.stage-3d').screenshot({ path: join(OUT, file) });
  const st = await page.evaluate(() => ({ ms: +window.__stage3d.stats.ms.toFixed(2), home: window.__stage3d.home, box: window.__stage3d.box(), w: window.__stage3d.el.clientWidth, h: window.__stage3d.el.clientHeight }));
  console.log(file, JSON.stringify({ ms: st.ms, box: st.box && Object.fromEntries(Object.entries(st.box).map(([k, v]) => [k, Math.round(v)])), stage: [st.w, st.h], home: name === 'hero' ? { ...st.home, target: st.home.target.map((v) => +v.toFixed(3)), dist: +st.home.dist.toFixed(3) } : undefined }));
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

const shots = PHONE || SET === 'before' ? ['hero'] : ['hero', 'front', 'side', 'back', 'reed', 'upper', 'lower', 'thumb', 'bell', 'upperF', 'lowerF', 'bellF', 'right', 'graze', 'bellH'];
for (const which of shots) {
  if (!want(which)) continue;
  await view(which === 'hero' ? null : V[which]);
  await shoot(which);
}
// a note sounding: the keys down for it, the reed beating, the bell alight
if (want('actuated')) {
  await view(null);
  await page.evaluate((m) => window.__piano.noteOn(m, 110, 'keys'), NOTE);
  await page.waitForTimeout(900);
  await shoot('actuated');
  if (!PHONE && SET !== 'before') {
    for (const v of ['upper', 'lower', 'reed', 'upperF', 'lowerF', 'right', 'graze']) {
      await view(V[v]);
      await shoot(`actuated-${v}`);
    }
  }
  await page.evaluate((m) => window.__piano.noteOff(m, 'keys'), NOTE);
  await page.waitForTimeout(1500);
}
// the Orchestra: a wind section and strings, the oboe among them
if (want('orchestra')) {
  await view(null);
  await page.locator('.ens-toggle').click();
  await page.evaluate(() => window.__orchestra.ensemble.setLineup(['violin', 'flute', 'oboe', 'trumpet', 'cello']));
  await page.waitForTimeout(1500);
  await shoot('orchestra');
}
if (errors.length) console.log('ERRORS', errors.slice(0, 5).join(' | '));
await ctx.close();
await browser.close();
