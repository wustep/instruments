// The bassoon's 3D review set (art direction §5): the hero view (the scene's own, as the stage first
// shows it), a front (the fingers' side), a side (the long joint's outside) and a back (the thumbs'
// side), the reed and bocal close up, the wing joint's finger holes, the long joint's thumb keys, the boot
// and its U-tube cap, the bell, an actuated frame (a note sounding, its keys down), the phone held
// upright, and the Orchestra with a bassoon in it. Each picture is the 3D stage's canvas.
//   BASE=http://localhost:4532 OUT=<dir> [SET=before|after] [VIEWS=hero,front,…] [PHONE=1] [TALL=1] [DSF=1] node scripts/shots-bassoon-3d.mjs
// A desktop run shoots the hero, the actuated frame and the Orchestra; TALL=1 the review's views (front,
// side, back, close-ups, and the close-ups actuated); PHONE=1 the phone's hero, actuated and Orchestra.
// SET=before shoots what the placeholder can show (hero, actuated, phone, orchestra); `after` the whole
// set. Views are { yaw, pitch, dist, target } in the stage's units (window.__stage3d.setView). The
// bassoon's world points (bassoon3d.ts BASSOON_POSE): standing on its boot at the origin, 1.39 m to the
// bell's rim, leaning a little; its fingers' side faces yaw −0.5, its long joint's outside −2.07, its
// thumbs' side 2.64. The pictures are PNGs at the device scale: `python3 scripts/shots-compress.py
// <dir>` makes JPEGs of them for the repo.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/bassoon/3d/after';
const BASE = process.env.BASE ?? 'http://localhost:4532';
const SET = process.env.SET ?? 'after';
const VIEWS = process.env.VIEWS?.split(',');
const PHONE = process.env.PHONE === '1';
const DSF = Number(process.env.DSF ?? (PHONE ? 3 : 1));
const NOTE = Number(process.env.NOTE ?? 41); // F2: both hands down, the right little finger's F key, the whisper key
mkdirSync(OUT, { recursive: true });

// (the review's views are of the upright pose a tall stage gives it: TALL=1, a window about as tall as
// it is wide; the wide stage leans it across, as it is played, for the hero)
const MID = [0.084, 0.73, 0];
const V = {
  front: { yaw: -0.733, pitch: 0.06, dist: 2.95, target: MID },
  side: { yaw: 0.838, pitch: 0.06, dist: 2.95, target: MID },
  back: { yaw: 2.41, pitch: 0.06, dist: 2.95, target: MID },
  // the reed and the bocal from the fingers' side, a little above
  reed: { yaw: -0.7, pitch: 0.15, dist: 0.24, target: [-0.075, 0.943, 0.165] },
  // the bocal leaving the wing's cap: its cork, its collar, the whisper key's pad on its nipple
  whisper: { yaw: -2.0, pitch: 0.25, dist: 0.19, target: [0.097, 0.975, 0.014] },
  // the wing joint's three finger holes, square on
  wing: { yaw: -0.6, pitch: 0.1, dist: 0.36, target: [0.063, 0.63, -0.02] },
  // the long joint's left-thumb keys, from behind
  thumb: { yaw: 2.55, pitch: 0.1, dist: 0.36, target: [0.096, 0.725, 0.014] },
  // the boot: its right-hand side (holes, ring, little fingers), its back (the right thumb's keys)
  boot: { yaw: -0.6, pitch: 0.15, dist: 0.6, target: [0.035, 0.27, 0] },
  bootback: { yaw: 2.45, pitch: 0.12, dist: 0.6, target: [0.045, 0.3, 0.004] },
  // the boot's foot and the U-tube's cap
  cap: { yaw: -0.25, pitch: -0.02, dist: 0.32, target: [0.007, 0.085, 0] },
  bell: { yaw: 0.3, pitch: 0.5, dist: 0.36, target: [0.175, 1.35, -0.012] },
};
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const TALL = process.env.TALL === '1';
const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true } : { viewport: { width: TALL ? 1200 : 1440, height: TALL ? 1550 : 900 }, deviceScaleFactor: DSF });
await ctx.addInitScript(() => {
  localStorage.setItem('piano-model.instrument', 'bassoon');
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
  await window.__piano.setInstrument('bassoon');
});
await page.waitForTimeout(2000);

const shoot = async (name) => {
  const file = `${PHONE ? 'phone-' : ''}bassoon-${name}.png`;
  await page.locator('.stage-3d').screenshot({ path: join(OUT, file) });
  const st = await page.evaluate(() => ({ ms: +window.__stage3d.stats.ms.toFixed(2), verts: window.__stage3d.stats.vertices, build: window.__stage3d.stats.buildMs, home: window.__stage3d.home, box: window.__stage3d.box(), w: window.__stage3d.el.clientWidth, h: window.__stage3d.el.clientHeight, over: document.querySelector('.player .pl-row')?.getBoundingClientRect().bottom - window.__stage3d.el.getBoundingClientRect().top }));
  console.log(file, JSON.stringify({ ms: st.ms, verts: st.verts, build: st.build && +st.build.toFixed(0), box: st.box && Object.fromEntries(Object.entries(st.box).map(([k, v]) => [k, Math.round(v)])), stage: [st.w, st.h], over: Math.round(st.over), home: name === 'hero' ? { ...st.home, target: st.home.target.map((v) => +v.toFixed(3)), dist: +st.home.dist.toFixed(3) } : undefined }));
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

const shots = PHONE || SET === 'before' ? ['hero'] : TALL ? Object.keys(V) : ['hero'];
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
  if (!PHONE && SET !== 'before' && TALL) {
    for (const v of ['wing', 'thumb', 'boot', 'bootback', 'reed', 'whisper']) {
      if (!V[v]) continue;
      await view(V[v]);
      await shoot(`actuated-${v}`);
    }
  }
  await page.evaluate((m) => window.__piano.noteOff(m, 'keys'), NOTE);
  await page.waitForTimeout(1500);
}
// the Orchestra: a wind section and strings, the bassoon among them
if (want('orchestra')) {
  await view(null);
  await page.locator('.ens-toggle').click();
  await page.evaluate(() => window.__orchestra.ensemble.setLineup(['violin', 'flute', 'oboe', 'clarinet', 'bassoon', 'cello']));
  await page.waitForTimeout(1800);
  await shoot('orchestra');
}
if (errors.length) console.log('ERRORS', errors.slice(0, 5).join(' | '));
await ctx.close();
await browser.close();
