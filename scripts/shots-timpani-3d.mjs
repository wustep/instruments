// The timpani's 3D review set (art direction §5): the hero view (the scene's own, as the stage first shows
// it) and its 2× crop, a front (the audience's), a side, a plan from above, the player's side, close-ups of
// the big drum's pedal and gauge, of a counterhoop with its T-handles, of the mallets over the heads; actuated
// frames (a stroke on the low drum and on the high one, mid-rebound; a roll), the phone held upright, and
// the Orchestra (strings and two sets of timpani). Each picture is the 3D stage's canvas.
//   BASE=http://localhost:4612 OUT=<dir> [SET=before|after] [VIEWS=hero,front,…] [PHONE=1] [DSF=1] node scripts/shots-timpani-3d.mjs
// SET=before shoots what the placeholder (the flute stand-in) can show: hero, phone, orchestra. Views are
// { yaw, pitch, dist, target } in the stage's units (window.__stage3d.setView); the set's world points come
// from timpani3d.ts (window.__timpani3d.views). PNGs at the device scale: `python3 scripts/shots-compress.py
// <dir>` makes JPEGs of them for the repo.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/timpani/3d/after';
const BASE = process.env.BASE ?? 'http://localhost:4612';
const SET = process.env.SET ?? 'after';
const VIEWS = process.env.VIEWS?.split(',');
const PHONE = process.env.PHONE === '1';
const DSF = Number(process.env.DSF ?? (PHONE ? 3 : 1));
// the 32″ drum's D2 (MIDI 38), the 23″'s F3 (MIDI 53)
const LOW = 38;
const HIGH = 53;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: DSF });
await ctx.addInitScript(() => {
  localStorage.setItem('piano-model.instrument', 'timpani');
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
  await window.__piano.setInstrument('timpani');
});
await page.waitForTimeout(2000);
const V = SET === 'before' ? {} : await page.evaluate(() => window.__timpani3d?.views ?? {});

const shoot = async (name) => {
  const file = `${PHONE ? 'phone-' : ''}timpani-${name}.png`;
  await page.locator('.stage-3d').screenshot({ path: join(OUT, file) });
  const st = await page.evaluate(() => ({ ms: +window.__stage3d.stats.ms.toFixed(2), verts: window.__stage3d.stats.vertices, build: window.__stage3d.stats.buildMs, home: window.__stage3d.home, box: window.__stage3d.box(), w: window.__stage3d.el.clientWidth, h: window.__stage3d.el.clientHeight, over: document.querySelector('.player .pl-row')?.getBoundingClientRect().bottom - window.__stage3d.el.getBoundingClientRect().top }));
  console.log(file, JSON.stringify({ ms: st.ms, verts: st.verts, build: st.build && +st.build.toFixed(0), box: st.box && Object.fromEntries(Object.entries(st.box).map(([k, v]) => [k, Math.round(v)])), stage: [st.w, st.h], over: Math.round(st.over), home: name === 'hero' && st.home ? { ...st.home, target: st.home.target.map((v) => +v.toFixed(3)), dist: +st.home.dist.toFixed(3) } : undefined }));
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
/** strike `m` at velocity `v` and wait `ms` (mid-rebound: ~60 ms after the stroke reaches the stage) */
const strike = async (m, v, ms) => {
  await page.evaluate(([m, v]) => window.__piano.noteOn(m, v, 'keys'), [m, v]);
  await page.waitForTimeout(ms);
};

if (want('hero')) {
  await view(null);
  await shoot('hero');
}
// the hero at twice the pixels, cropped to the middle (the heads, the hoops, the near pedal)
if (!PHONE && SET !== 'before' && want('hero-2x')) {
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx2.addInitScript(() => {
    localStorage.setItem('piano-model.instrument', 'timpani');
    localStorage.setItem('piano-model.3d', '1');
    localStorage.setItem('piano-model.style', 'classic');
  });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/`);
  await p2.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 30000 });
  await p2.waitForTimeout(2000);
  const box = await p2.locator('.stage-3d').boundingBox();
  await p2.screenshot({ path: join(OUT, 'timpani-hero-2x.png'), clip: { x: box.x + box.width * 0.2, y: box.y + box.height * 0.22, width: box.width * 0.5, height: box.height * 0.6 } });
  console.log('timpani-hero-2x.png');
  await ctx2.close();
}
// actuated, from the stage's own view: a loud stroke on the low drum (mid-rebound, the head moving), a
// soft one on the high drum, a roll on the 26″
if (want('actuated')) {
  await view(null);
  await strike(LOW, 120, 140);
  await shoot('actuated-low');
  await page.waitForTimeout(1500);
  if (SET !== 'before') {
    await strike(HIGH, 70, 120);
    await shoot('actuated-high');
    await page.waitForTimeout(1200);
    // a roll: the same note struck again and again (the engine alternates the hands)
    await page.evaluate(async () => {
      for (let i = 0; i < 14; i++) {
        window.__piano.noteOn(48, 85, 'keys');
        await new Promise((r) => setTimeout(r, 80));
      }
    });
    await shoot('roll');
    await page.waitForTimeout(1200);
  }
}
if (!PHONE && SET !== 'before') {
  for (const which of Object.keys(V)) {
    if (!want(which)) continue;
    await view(V[which]);
    await shoot(which);
  }
  // the mallets close up, mid-stroke
  if (want('mallets') && V.mallets) {
    await view(V.mallets);
    await strike(43, 110, 110);
    await shoot('mallets-stroke');
  }
}
// the Orchestra: strings and two sets of timpani
if (want('orchestra')) {
  await page.reload();
  await page.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 30000 });
  await page.evaluate(async () => {
    await window.__piano.start();
    await window.__piano.setInstrument('timpani');
  });
  await page.waitForTimeout(1200);
  await page.locator('.ens-toggle').click();
  await page.evaluate(() => window.__orchestra.ensemble.setLineup(['violin', 'violin', 'viola', 'cello', 'bass', 'timpani', 'timpani']));
  await page.waitForTimeout(1800);
  await shoot('orchestra');
}
if (errors.length) console.log('ERRORS', errors.slice(0, 5).join(' | '));
await ctx.close();
await browser.close();
