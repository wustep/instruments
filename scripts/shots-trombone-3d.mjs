// The trombone's 3D review set (art direction §5): the hero view (the scene's own, as the stage first
// shows it), a front (the bell's mouth, as the audience sees it), a side (square on, the slide and the bell
// section in profile, as the product photographs show it) and a back (the player's side: the F
// attachment's thumb lever and its linkage), close-ups of the valve and its linkage, of the slide's crook
// and its water key, of the slide's top (the braces, the cork barrels, the lock) and of the mouthpiece,
// actuated frames (C2 on the tenor: the F valve down and the slide out in sixth position; B♭2 in the fifth
// on the slide alone), the three sizes (alto, tenor, bass), the phone held upright, and the Orchestra with
// trombones in it (Bach's Air: alto, two tenors, bass). Each picture is the 3D stage's canvas.
//   BASE=http://localhost:4212 OUT=<dir> [SET=before|after] [VIEWS=hero,front,…] [PHONE=1] [DSF=1] node scripts/shots-trombone-3d.mjs
// A desktop run shoots the hero (and its 2× crop), the sizes, the review's views and close-ups, the
// actuated frames and the Orchestra; PHONE=1 the phone's hero, actuated and Orchestra. SET=before shoots what
// the placeholder can show (hero, actuated, phone, orchestra). Views are { yaw, pitch, dist, target } in the
// stage's units (window.__stage3d.setView); the trombone's world points come from trombone3d.ts (the page
// reads them off window.__trombone3d). The pictures are PNGs at the device scale: `python3
// scripts/shots-compress.py <dir>` makes JPEGs of them for the repo.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/trombone/3d/after';
const BASE = process.env.BASE ?? 'http://localhost:4212';
const SET = process.env.SET ?? 'after';
const VIEWS = process.env.VIEWS?.split(',');
const PHONE = process.env.PHONE === '1';
const DSF = Number(process.env.DSF ?? (PHONE ? 3 : 1));
// the engine's chart (tromboneFingering, the tenor): C2 (MIDI 36) is the F attachment in sixth position
// (0.61 m out), B♭2 (MIDI 42) the slide alone in fifth (0.36 m)
const NOTE_F = Number(process.env.NOTE_F ?? 36);
const NOTE_BB = Number(process.env.NOTE_BB ?? 42);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: DSF });
const init = () => {
  localStorage.setItem('piano-model.instrument', 'trombone');
  localStorage.setItem('piano-model.3d', '1');
  localStorage.setItem('piano-model.style', 'classic');
};
await ctx.addInitScript(init);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => (m.type() === 'error' || /webgl|GL_[A-Z_]{4,}/i.test(m.text())) && errors.push(m.text()));
const ready = async (p) => {
  await p.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 30000 });
  await p.evaluate(async () => {
    await window.__piano.start();
    await window.__piano.setInstrument('trombone');
  });
  await p.waitForTimeout(2000);
};
await page.goto(`${BASE}/`);
await ready(page);
const V = SET === 'before' ? {} : await page.evaluate(() => window.__trombone3d?.views ?? {});

const shoot = async (name) => {
  const file = `${PHONE ? 'phone-' : ''}trombone-${name}.png`;
  await page.locator('.stage-3d').screenshot({ path: join(OUT, file) });
  const st = await page.evaluate(() => ({ ms: +window.__stage3d.stats.ms.toFixed(2), verts: window.__stage3d.stats.vertices, build: window.__stage3d.stats.buildMs, home: window.__stage3d.home, box: window.__stage3d.box(), w: window.__stage3d.el.clientWidth, h: window.__stage3d.el.clientHeight, over: document.querySelector('.player .pl-row')?.getBoundingClientRect().bottom - window.__stage3d.el.getBoundingClientRect().top, slide: window.__trombone3d?.slide?.() ?? null }));
  console.log(file, JSON.stringify({ ms: st.ms, verts: st.verts, build: st.build && +st.build.toFixed(0), box: st.box && Object.fromEntries(Object.entries(st.box).map(([k, v]) => [k, Math.round(v)])), stage: [st.w, st.h], over: Math.round(st.over), slide: st.slide, home: name === 'hero' ? { ...st.home, target: st.home.target.map((v) => +v.toFixed(3)), dist: +st.home.dist.toFixed(3) } : undefined }));
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
  await page.evaluate(([m, on]) => (on ? window.__piano.noteOn(m, 100, 'keys') : window.__piano.noteOff(m, 'keys')), [m, on]);
  await page.waitForTimeout(on ? 1100 : 900);
};
const size = async (n) => {
  await page.evaluate((n) => window.__piano.setParams({ size: n }), n);
  await page.waitForTimeout(900);
};

if (want('hero')) {
  await view(null);
  await shoot('hero');
}
// the hero at twice the pixels, cropped to the middle (the valve, the slide's top, the bell)
if (!PHONE && SET !== 'before' && want('hero-2x')) {
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx2.addInitScript(init);
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/`);
  await p2.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 30000 });
  await p2.waitForTimeout(2000);
  const box = await p2.locator('.stage-3d').boundingBox();
  await p2.screenshot({ path: join(OUT, 'trombone-hero-2x.png'), clip: { x: box.x + box.width * 0.2, y: box.y + box.height * 0.1, width: box.width * 0.6, height: box.height * 0.8 } });
  console.log('trombone-hero-2x.png');
  await ctx2.close();
}
// a note sounding, from the stage's own view: the slide out to its position, the F valve turned (before
// any close-up: setView moves the home view's target)
if (want('actuated')) {
  await view(null);
  await note(NOTE_F, true);
  await shoot('actuated');
  await note(NOTE_F, false);
  if (!PHONE && SET !== 'before') {
    await note(NOTE_BB, true);
    await shoot('actuated-5th');
    await note(NOTE_BB, false);
  }
}
// (the slide back to first position before the still views: the engine leaves it where the last note put it)
const home = async () => {
  await note(46, true);
  await note(46, false);
};
if (!PHONE && SET !== 'before') {
  await home();
  for (const which of Object.keys(V)) {
    if (!want(which)) continue;
    await view(V[which]);
    await shoot(which);
  }
  // the valve close up with the F side sounding (the lever down, the rotor a quarter turn round)
  if (want('actuated') && V.valve) {
    await note(NOTE_F, true);
    for (const v of ['valve', 'linkage']) if (V[v]) {
      await view(V[v]);
      await shoot(`actuated-${v}`);
    }
    await note(NOTE_F, false);
    await home();
  }
  // the three sizes from the stage's own view (the Size knob: 0 alto, 1 tenor, 2 bass), and the bass's
  // two valves close up, both down (D2, MIDI 38: F and G♭)
  if (want('sizes')) {
    for (const [n, name] of [[0, 'alto'], [2, 'bass'], [1, 'tenor']]) {
      await size(n);
      await home();
      await view(null);
      await shoot(`size-${name}`);
      const Vs = await page.evaluate(() => window.__trombone3d?.views ?? {});
      if (Vs.side && name !== 'tenor') {
        await view(Vs.side);
        await shoot(`size-${name}-side`);
      }
      if (name === 'bass') {
        const Vb = Vs;
        await note(38, true);
        await view(null);
        await shoot('actuated-bass');
        if (Vb.valve) {
          await view(Vb.valve);
          await shoot('actuated-bass-valves');
        }
        await note(38, false);
      }
    }
  }
}
// the Orchestra: Bach's Air (alto, two tenors and a bass trombone, each its line's size), then trombones
// among a wind section and strings
if (want('orchestra')) {
  await page.reload();
  await ready(page);
  await page.locator('.ens-toggle').click();
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    const i = window.__orchestra.pieces.findIndex((p) => p.id === 'air');
    await window.__orchestra.loadPiece(i);
  });
  await page.waitForTimeout(SET === 'before' ? 2500 : 3500);
  await shoot('orchestra-air');
  if (SET !== 'before') {
    await page.evaluate(() => window.__orchestra.ensemble.setLineup(['violin', 'flute', 'clarinet', 'horn', 'trombone', 'trombone', 'cello']));
    await page.waitForTimeout(1800);
    await shoot('orchestra');
  }
}
if (errors.length) console.log('ERRORS', errors.slice(0, 5).join(' | '));
await ctx.close();
await browser.close();
