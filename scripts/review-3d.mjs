// The 3D review set (art direction, §5): for each instrument a hero three-quarter (the default
// view), a front and a side view, a close-up of its mechanism and an actuated frame, at 1440×900.
//   BASE=http://localhost:5311 OUT=<dir> [ONLY=cello,grand] [VIEWS=hero,close] [DSF=1] node scripts/review-3d.mjs
// Then `python3 scripts/contact-sheet.py <dir> <refs dir> <out.jpg>` puts each next to its reference.
// Views are { yaw, pitch, dist, target } in the stage's units (window.__stage3d.setView).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT ?? join(import.meta.dirname, '..', 'artifacts', 'realistic-3d', 'review');
const BASE = process.env.BASE ?? 'http://localhost:5311';
const ONLY = process.env.ONLY?.split(',');
const VIEWS = process.env.VIEWS?.split(',');
const DSF = Number(process.env.DSF ?? 1);
const PHONE = process.env.PHONE === '1';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });

const R = {
  grand: {
    inst: 'piano', preset: 'grand', notes: [36, 48, 55, 64, 67, 72], pedal: true,
    front: { yaw: 0, pitch: 0.12, dist: 3.4, target: [0, 0.7, 0.9] },
    side: { yaw: 1.5708, pitch: 0.1, dist: 3.6, target: [0, 0.7, 0.9] },
    close: { yaw: 1.05, pitch: 0.42, dist: 0.62, target: [0.5, 0.8, 0.38] },
    act: { view: { yaw: 1.2, pitch: 0.3, dist: 0.5, target: [0.52, 0.8, 0.38] }, notes: [84, 86, 88, 91], wait: 120 },
  },
  upright: {
    inst: 'piano', preset: 'upright', notes: [36, 48, 55, 64, 67], pedal: true,
    front: { yaw: 0, pitch: 0.1, dist: 2.6, target: [0, 0.7, 0.25] },
    side: { yaw: 1.5708, pitch: 0.1, dist: 2.6, target: [0, 0.7, 0.25] },
    close: { yaw: 0.45, pitch: 0.28, dist: 0.85, target: [0.05, 0.96, 0.4] },
    act: { view: { yaw: 0.7, pitch: 0.3, dist: 0.7, target: [0.0, 0.97, 0.42] }, notes: [60, 64, 67, 72], wait: 120 },
  },
  violin: {
    inst: 'violin', notes: [72],
    front: { yaw: 0, pitch: 1.45, dist: 0.9, target: null },
    side: { yaw: 1.5708, pitch: 0.2, dist: 0.9, target: null },
    close: { yaw: 0.35, pitch: 0.75, dist: 0.38, target: [0.03, 0.24, -0.03] },
    act: { view: { yaw: -0.15, pitch: 0.75, dist: 0.36, target: [-0.12, 0.25, -0.03] }, notes: [79], wait: 1000 },
  },
  viola: {
    inst: 'viola', notes: [60],
    front: { yaw: 0, pitch: 1.45, dist: 1.0, target: null },
    side: { yaw: 1.5708, pitch: 0.2, dist: 1.0, target: null },
    close: { yaw: 0.35, pitch: 0.75, dist: 0.42, target: [0.03, 0.26, -0.03] },
    act: { view: { yaw: -0.15, pitch: 0.75, dist: 0.4, target: [-0.14, 0.27, -0.03] }, notes: [74], wait: 1000 },
  },
  cello: {
    inst: 'cello', notes: [50],
    front: { yaw: 0, pitch: 0.05, dist: 2.1, target: [0, 0.68, 0] },
    side: { yaw: 1.5708, pitch: 0.05, dist: 2.1, target: [0, 0.68, 0] },
    close: { yaw: 0.4, pitch: 0.25, dist: 0.75, target: [0.0, 0.64, 0.05] },
    scroll: { yaw: 0.9, pitch: 0.15, dist: 0.42, target: [0.0, 1.47, 0.3] },
    detail: { yaw: 0.5, pitch: 0.15, dist: 0.32, target: [0.08, 0.74, 0.0] },
    scrollside: { yaw: 1.65, pitch: 0.12, dist: 0.32, target: [0.0, 1.48, 0.3] },
    act: { view: { yaw: 0.45, pitch: 0.3, dist: 0.85, target: [0.0, 1.12, 0.2] }, notes: [55], wait: 1000 },
  },
  // flute: model x − 0.335 m is world x (head at −0.26, the right hand's keys near +0.13, foot +0.27)
  flute: {
    inst: 'flute', notes: [74],
    front: { yaw: 0, pitch: 0.1, dist: 0.76, target: [0, 0.17, 0] },
    side: { yaw: 0, pitch: 1.5, dist: 0.76, target: [0, 0.17, 0] },
    close: { yaw: 0.3, pitch: 0.6, dist: 0.3, target: [0.1, 0.175, 0.0] },
    detail: { yaw: 0.35, pitch: 0.5, dist: 0.2, target: [-0.262, 0.18, 0.0] },
    act: { view: { yaw: 0.22, pitch: 0.38, dist: 0.3, target: [0.11, 0.172, 0.0] }, notes: [67], wait: 1000 },
  },
  // trumpet: the valves at world x ≈ −0.057, the bell rim at +0.27
  trumpet: {
    inst: 'trumpet', notes: [67],
    front: { yaw: 0, pitch: 0.05, dist: 0.66, target: [0, 0.2, 0] },
    side: { yaw: 1.5708, pitch: 0.05, dist: 0.66, target: [0, 0.2, 0] },
    close: { yaw: 0.5, pitch: 0.35, dist: 0.3, target: [-0.04, 0.205, 0.0] },
    detail: { yaw: 0.3, pitch: 0.55, dist: 0.2, target: [-0.057, 0.25, 0.0] },
    act: { view: { yaw: -0.35, pitch: 0.3, dist: 0.36, target: [-0.03, 0.2, 0.0] }, notes: [60], wait: 1000 },
  },
};

async function setup(page, cfg) {
  await page.evaluate(async ([i, pr]) => {
    await window.__piano.start();
    await window.__piano.setInstrument(i);
    if (pr) {
      await window.__piano.setPreset(pr);
      document.querySelectorAll('.presets button').forEach((b) => b.textContent === pr && b.click());
    }
    await new Promise((r) => setTimeout(r, 300));
  }, [cfg.inst, cfg.preset ?? null]);
  const btn = page.locator('.dim-toggle');
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
  await page.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 15000 });
}
async function play(page, notes, pedal, gap = 80) {
  await page.evaluate(async ([ns, pd, g]) => {
    if (pd) window.__piano.sustain(1);
    for (const m of ns) {
      window.__piano.noteOn(m, 96, 'keys');
      await new Promise((r) => setTimeout(r, g));
    }
  }, [notes, !!pedal, gap]);
}
async function view(page, v) {
  await page.evaluate((vv) => {
    const s = window.__stage3d;
    s.resetView();
    const o = { yaw: vv.yaw, pitch: vv.pitch, dist: vv.dist };
    if (vv.target) o.target = vv.target;
    s.setView(o);
  }, v);
}

// CASE=off hides the pianos' case.
// ad-hoc views: CUSTOM='name:yaw,pitch,dist,tx,ty,tz;name2:...' (added to every instrument run).
// SECTION=x cuts the views whose name starts with "sec" at world x (keeps x < SECTION): a side
// section through the action, seen from +x (yaw π/2)
const SECTION = process.env.SECTION === undefined ? null : Number(process.env.SECTION);
const CUSTOM = (process.env.CUSTOM ?? '').split(';').filter(Boolean).map((c) => {
  const [name, v] = c.split(':');
  const [yaw, pitch, dist, tx, ty, tz] = v.split(',').map(Number);
  return [name, { yaw, pitch, dist, target: [tx, ty, tz] }];
});
for (const [id, cfg] of Object.entries(R)) {
  if (ONLY && !ONLY.includes(id)) continue;
  for (const [name, v] of CUSTOM) cfg[name] = v;
  for (const which of ['hero', 'front', 'side', 'close', 'scroll', 'scrollside', 'detail', 'act', ...CUSTOM.map(([n]) => n)]) {
    if (['scroll', 'scrollside', 'detail', ...CUSTOM.map(([n]) => n)].includes(which) && !cfg[which]) continue;
    if (VIEWS && !VIEWS.includes(which)) continue;
    const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: DSF });
    await ctx.addInitScript((inst) => {
      localStorage.setItem('piano-model.instrument', inst);
      localStorage.setItem('piano-model.3d', '1');
    }, cfg.inst);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${BASE}/`);
    await page.evaluate(() => document.fonts.ready);
    await setup(page, cfg);
    // CASE=off: the pianos' case hidden (the toggle beside "3d"), after its dissolve
    if (process.env.CASE === 'off' && cfg.inst === 'piano') {
      await page.locator('.case-toggle').click();
      await page.waitForTimeout(700);
    }
    if (SECTION !== null && which.startsWith('sec'))
      await page.evaluate((x) => {
        window.__stage3d.r3.debugClip = { at: x, side: 1 };
      }, SECTION);
    if (which === 'act') {
      await view(page, cfg.act.view);
      await play(page, cfg.act.notes, false, 40);
      await page.waitForTimeout(cfg.act.wait);
    } else {
      if (which !== 'hero') await view(page, cfg[which]);
      await play(page, cfg.notes, cfg.pedal);
      await page.waitForTimeout(1000);
    }
    const name = `${PHONE ? 'phone-' : ''}${id}-${which}`;
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    const st = await page.evaluate(() => ({ ms: +window.__stage3d.stats.ms.toFixed(2), ao: window.__stage3d.stats.ao, lite: window.__stage3d.stats.lite }));
    console.log(`${name} ${JSON.stringify(st)}${errors.length ? '  ERRORS: ' + errors.slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
  }
}
await browser.close();
