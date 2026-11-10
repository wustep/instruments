// The double bass's 3D review set (art direction §5), beside the cello for scale: the hero view (the
// scene's own, as the stage first shows it), a front and a side view, the back, the head and its
// machines close up, the bridge and tailpiece, and the phone held upright. One page per instrument;
// each picture is the 3D stage's canvas alone.
//   BASE=http://localhost:5394 OUT=<dir> [ONLY=bass,cello] [VIEWS=hero,front,…] [PHONE=1] [DSF=1] node scripts/review-bass-3d.mjs
// Views are { yaw, pitch, dist, target } in the stage's units (window.__stage3d.setView). The bass's
// world points (strings3d.ts): its endpin on the floor at the origin, the bridge ≈ (0, 0.77, −0.15),
// the nut ≈ (0, 1.72, 0.37), the scroll's top 1.97 m up. The pictures are PNGs at the device scale:
// `python3 scripts/shots-compress.py <dir>` makes JPEGs of them for the repo.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/double-bass/3d/review';
const BASE = process.env.BASE ?? 'http://localhost:5394';
const ONLY = process.env.ONLY?.split(',') ?? ['bass', 'cello'];
const VIEWS = process.env.VIEWS?.split(',');
const PHONE = process.env.PHONE === '1';
const DSF = Number(process.env.DSF ?? (PHONE ? 3 : 1));
mkdirSync(OUT, { recursive: true });

const R = {
  bass: {
    note: 40,
    front: { yaw: 0, pitch: 0.04, dist: 3.4, target: [0, 1.0, 0.12] },
    side: { yaw: 1.5708, pitch: 0.04, dist: 3.4, target: [0, 1.0, 0.12] },
    back: { yaw: 3.1416, pitch: 0.04, dist: 3.4, target: [0, 1.0, 0.12] },
    head: { yaw: 0.9, pitch: 0.18, dist: 0.62, target: [0.0, 1.83, 0.55] },
    headside: { yaw: 1.5708, pitch: 0.05, dist: 0.62, target: [0.0, 1.83, 0.55] },
    headback: { yaw: -2.2, pitch: 0.2, dist: 0.62, target: [0.0, 1.83, 0.55] },
    pegbox: { yaw: 0.35, pitch: 0.75, dist: 0.5, target: [0.0, 1.8, 0.5] },
    // the bridge as the player sees it (over the upper bout), and from below the tailpiece
    bridge: { yaw: 2.75, pitch: 1.05, dist: 0.75, target: [0, 0.8, -0.14] },
    bridgelow: { yaw: 0.35, pitch: -0.12, dist: 0.62, target: [0, 0.8, -0.14] },
    foot: { yaw: 0.8, pitch: 0.25, dist: 0.9, target: [0.0, 0.28, 0.0] },
  },
  cello: {
    note: 50,
    front: { yaw: 0, pitch: 0.04, dist: 3.4, target: [0, 0.98, 0.12] },
    side: { yaw: 1.5708, pitch: 0.04, dist: 3.4, target: [0, 0.98, 0.12] },
    back: { yaw: 3.1416, pitch: 0.04, dist: 3.4, target: [0, 0.98, 0.12] },
    head: { yaw: 0.9, pitch: 0.18, dist: 0.45, target: [0.0, 1.38, 0.38] },
  },
};
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
for (const id of ONLY) {
  const cfg = R[id];
  const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: DSF });
  await ctx.addInitScript((inst) => {
    localStorage.setItem('piano-model.instrument', inst);
    localStorage.setItem('piano-model.3d', '1');
    localStorage.setItem('piano-model.style', 'classic');
  }, id);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => (m.type() === 'error' || /webgl|GL_[A-Z_]{4,}/i.test(m.text())) && errors.push(m.text()));
  await page.goto(`${BASE}/`);
  await page.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 30000 });
  await page.evaluate(async (i) => {
    await window.__piano.start();
    await window.__piano.setInstrument(i);
  }, id);
  await page.waitForTimeout(2500);
  const shots = PHONE ? ['hero'] : ['hero', 'front', 'side', 'back', 'head', 'headside', 'headback', 'pegbox', 'bridge', 'bridgelow', 'foot'];
  for (const which of shots) {
    if (which !== 'hero' && !cfg[which]) continue;
    if (VIEWS && !VIEWS.includes(which)) continue;
    await page.evaluate((v) => {
      const s = window.__stage3d;
      s.resetView();
      if (v) s.setView(v);
    }, which === 'hero' ? null : cfg[which]);
    await page.waitForTimeout(700);
    const name = `${PHONE ? 'phone-' : ''}${id}-${which}`;
    await page.locator('.stage-3d').screenshot({ path: join(OUT, `${name}.png`) });
    const st = await page.evaluate(() => ({ ms: +window.__stage3d.stats.ms.toFixed(2), home: window.__stage3d.home, box: window.__stage3d.box(), w: window.__stage3d.el.clientWidth, h: window.__stage3d.el.clientHeight }));
    console.log(name, JSON.stringify({ ms: st.ms, box: st.box && Object.fromEntries(Object.entries(st.box).map(([k, v]) => [k, Math.round(v)])), stage: [st.w, st.h], home: which === 'hero' ? { ...st.home, target: st.home.target.map((v) => +v.toFixed(3)), dist: +st.home.dist.toFixed(3) } : undefined }));
  }
  if (errors.length) console.log('ERRORS', id, errors.slice(0, 5).join(' | '));
  await ctx.close();
}
await browser.close();
