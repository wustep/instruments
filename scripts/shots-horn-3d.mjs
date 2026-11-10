// The horn's 3D review set (art direction §5): the hero view (the scene's own, as the stage first shows
// it), a front (the valve caps' side, the audience's when it is played), a side (edge on, from the bell's
// side) and a back (the player's side: the levers, the linkage, the bell's mouth), close-ups of the valve
// cluster and its linkage, of the leadpipe and the mouthpiece, of the bell's rim, actuated frames (a note
// sounding on the F side and on the B♭ side: the levers down, the rotors turned), the phone held upright,
// and the Orchestra with a horn in it. Each picture is the 3D stage's canvas.
//   BASE=http://localhost:4532 OUT=<dir> [SET=before|after] [VIEWS=hero,front,…] [PHONE=1] [DSF=1] node scripts/shots-horn-3d.mjs
// A desktop run shoots the hero (and its 2× crop), the review's views and close-ups, the actuated frames
// and the Orchestra; PHONE=1 the phone's hero, actuated and Orchestra. SET=before shoots what the
// placeholder can show (hero, actuated, phone, orchestra). Views are { yaw, pitch, dist, target } in the
// stage's units (window.__stage3d.setView); the horn's world points come from horn3d.ts HORN_VIEWS (the
// page reads them off window.__horn3d). The pictures are PNGs at the device scale: `python3
// scripts/shots-compress.py <dir>` makes JPEGs of them for the repo.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/horn/3d/after';
const BASE = process.env.BASE ?? 'http://localhost:4532';
const SET = process.env.SET ?? 'after';
const VIEWS = process.env.VIEWS?.split(',');
const PHONE = process.env.PHONE === '1';
const DSF = Number(process.env.DSF ?? (PHONE ? 3 : 1));
// the engine's fingering (hornFingering): A2 (MIDI 45) is the F horn with 1+2; F♯4 (MIDI 66) the B♭ horn (the
// thumb's lever) with 2+3
const NOTE_F = Number(process.env.NOTE_F ?? 45);
const NOTE_BB = Number(process.env.NOTE_BB ?? 66);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: DSF });
await ctx.addInitScript(() => {
  localStorage.setItem('piano-model.instrument', 'horn');
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
  await window.__piano.setInstrument('horn');
});
await page.waitForTimeout(2000);
const V = SET === 'before' ? {} : await page.evaluate(() => window.__horn3d?.views ?? {});

const shoot = async (name, clip) => {
  const file = `${PHONE ? 'phone-' : ''}horn-${name}.png`;
  await page.locator('.stage-3d').screenshot({ path: join(OUT, file), ...(clip ? {} : {}) });
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
const note = async (m, on) => {
  await page.evaluate(([m, on]) => (on ? window.__piano.noteOn(m, 110, 'keys') : window.__piano.noteOff(m, 'keys')), [m, on]);
  await page.waitForTimeout(on ? 900 : 1500);
};

if (want('hero')) {
  await view(null);
  await shoot('hero');
}
// the hero at twice the pixels, cropped to the middle (the coil and the valves)
if (!PHONE && SET !== 'before' && want('hero-2x')) {
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx2.addInitScript(() => {
    localStorage.setItem('piano-model.instrument', 'horn');
    localStorage.setItem('piano-model.3d', '1');
    localStorage.setItem('piano-model.style', 'classic');
  });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/`);
  await p2.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 30000 });
  await p2.waitForTimeout(2000);
  const box = await p2.locator('.stage-3d').boundingBox();
  await p2.screenshot({ path: join(OUT, 'horn-hero-2x.png'), clip: { x: box.x + box.width * 0.22, y: box.y + box.height * 0.08, width: box.width * 0.56, height: box.height * 0.84 } });
  console.log('horn-hero-2x.png');
  await ctx2.close();
}
if (!PHONE && SET !== 'before') {
  for (const which of Object.keys(V)) {
    if (!want(which)) continue;
    await view(V[which]);
    await shoot(which);
  }
}
// a note sounding: the levers down for it, the rotors turned, the bore alight along the air's path
if (want('actuated')) {
  await view(null);
  await note(NOTE_F, true);
  await shoot('actuated');
  if (!PHONE && SET !== 'before') for (const v of ['valves', 'linkage']) if (V[v]) {
    await view(V[v]);
    await shoot(`actuated-F-${v}`);
  }
  await note(NOTE_F, false);
  if (!PHONE && SET !== 'before') {
    await view(null);
    await note(NOTE_BB, true);
    await shoot('actuated-Bb');
    for (const v of ['valves', 'linkage']) if (V[v]) {
      await view(V[v]);
      await shoot(`actuated-Bb-${v}`);
    }
    await note(NOTE_BB, false);
  }
}
// the Orchestra: a wind section and strings, the horn among them
if (want('orchestra')) {
  await view(null);
  await page.locator('.ens-toggle').click();
  await page.evaluate(() => window.__orchestra.ensemble.setLineup(['violin', 'flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'cello']));
  await page.waitForTimeout(1800);
  await shoot('orchestra');
}
if (errors.length) console.log('ERRORS', errors.slice(0, 5).join(' | '));
await ctx.close();
await browser.close();
