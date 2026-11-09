// The 3D stage, every instrument: whole, a close-up of its mechanism, and actuated (key down,
// pedal, bowed, valves down), desktop 1440×900 and phone 390×844.
//   BASE=http://localhost:4288 PREFIX=before node scripts/shots-realistic-3d.mjs
//   BASE=http://localhost:4289 PREFIX=after  node scripts/shots-realistic-3d.mjs
// Camera: the stage exposes window.__stage3d.setView({ yaw, pitch, dist, target }) (after the
// rebuild); on an older build the close-ups fall back to zooming with the wheel.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT ?? join(import.meta.dirname, '..', 'artifacts', 'realistic-3d', 'shots');
const BASE = process.env.BASE ?? 'http://localhost:4289';
const PREFIX = process.env.PREFIX ?? 'after';
const ONLY = process.env.ONLY?.split(',');
const DEVICES = (process.env.DEVICES ?? 'desktop,phone').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const VIEW = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

/** start audio, pick the instrument (and preset), switch to 3D */
async function setup(page, inst, preset) {
  await page.evaluate(async ([i, pr]) => {
    try {
      localStorage.setItem('piano-model.3d', '1');
    } catch {}
    await window.__piano.start();
    await window.__piano.setInstrument(i);
    if (pr) {
      await window.__piano.setPreset(pr);
      document.querySelectorAll('.presets button').forEach((b) => b.textContent === pr && b.click());
    }
    await new Promise((r) => setTimeout(r, 400));
  }, [inst, preset]);
  const btn = page.locator('.dim-toggle');
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
  await page.waitForTimeout(300);
}
async function play(page, notes, { pedal = false, lid, hold = true, gap = 90, vel = 96 } = {}) {
  await page.evaluate(async ([ns, pd, ld, g, v]) => {
    if (ld !== undefined && ld !== null) window.__piano.setParams({ lid: ld });
    if (pd) window.__piano.sustain(1);
    for (const m of ns) {
      window.__piano.noteOn(m, v, 'keys');
      await new Promise((r) => setTimeout(r, g));
    }
  }, [notes, pedal, lid ?? null, gap, vel]);
  if (!hold) await page.evaluate((ns) => ns.forEach((m) => window.__piano.noteOff(m, 'keys')), notes);
}
/** a close-up: setView when the stage has it, else the wheel */
async function camera(page, v, wheel) {
  const has = await page.evaluate(() => typeof window.__stage3d?.setView === 'function');
  if (has && v) {
    // a narrow screen sees less: step back as the stage's own default views do
    const w = await page.evaluate(() => window.__stage3d.el.clientWidth / window.__stage3d.el.clientHeight);
    const k = w < 1.4 ? Math.min(2.6, 1.4 / Math.max(0.45, w)) * 0.92 : 1;
    await page.evaluate((vv) => window.__stage3d.setView(vv), { ...v, dist: v.dist * k });
    return;
  }
  if (wheel) {
    const cv = page.locator('.stage-3d');
    const b = await cv.boundingBox();
    if (!b) return;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    for (let i = 0; i < 4; i++) await page.mouse.wheel(0, wheel / 4);
  }
}

// per instrument: the setup, a close-up camera (yaw, pitch, dist, target in scene metres) and
// what "actuated" means for it
const INST = {
  grand: {
    inst: 'piano', preset: 'grand',
    whole: { notes: [36, 48, 55, 64, 67, 72], pedal: true },
    // the treble cheek is cut away: the action in profile, a few keys deep
    close: { view: { yaw: 1.05, pitch: 0.42, dist: 0.62, target: [0.5, 0.8, 0.38] }, wheel: -700 },
    act: { notes: [84, 86, 88, 91], pedal: false, view: { yaw: 1.2, pitch: 0.3, dist: 0.5, target: [0.52, 0.8, 0.38] }, wheel: -900 },
  },
  upright: {
    inst: 'piano', preset: 'upright',
    whole: { notes: [36, 48, 55, 64, 67], pedal: true },
    close: { view: { yaw: 0.45, pitch: 0.28, dist: 0.85, target: [0.05, 0.96, 0.4] }, wheel: -700 },
    act: { notes: [60, 64, 67, 72], view: { yaw: 0.7, pitch: 0.3, dist: 0.7, target: [0.0, 0.97, 0.42] }, wheel: -900 },
  },
  violin: {
    inst: 'violin',
    whole: { notes: [72] },
    close: { view: { yaw: 0.35, pitch: 0.75, dist: 0.38, target: [0.03, 0.24, -0.03] }, wheel: -700 },
    act: { notes: [76], view: { yaw: -0.25, pitch: 0.55, dist: 0.32, target: [-0.17, 0.26, -0.02] }, wheel: -500 },
  },
  viola: {
    inst: 'viola',
    whole: { notes: [60] },
    close: { view: { yaw: 0.35, pitch: 0.75, dist: 0.42, target: [0.03, 0.26, -0.03] }, wheel: -700 },
    act: { notes: [67], view: { yaw: -0.25, pitch: 0.55, dist: 0.36, target: [-0.19, 0.28, -0.02] }, wheel: -500 },
  },
  cello: {
    inst: 'cello',
    whole: { notes: [50] },
    close: { view: { yaw: 0.4, pitch: 0.25, dist: 0.75, target: [0.0, 0.64, 0.05] }, wheel: -700 },
    act: { notes: [55], view: { yaw: 0.5, pitch: 0.3, dist: 0.65, target: [0.0, 0.95, 0.14] }, wheel: -500 },
  },
  flute: {
    inst: 'flute',
    whole: { notes: [74] },
    close: { view: { yaw: 0.3, pitch: 0.65, dist: 0.32, target: [0.14, 0.18, 0.0] }, wheel: -700 },
    act: { notes: [62], view: { yaw: 0.15, pitch: 0.55, dist: 0.3, target: [-0.2, 0.18, 0.0] }, wheel: -500 },
  },
  trumpet: {
    inst: 'trumpet',
    whole: { notes: [67] },
    close: { view: { yaw: 0.45, pitch: 0.4, dist: 0.32, target: [0.03, 0.21, 0.0] }, wheel: -700 },
    act: { notes: [61], view: { yaw: -0.35, pitch: 0.3, dist: 0.42, target: [0.02, 0.2, 0.0] }, wheel: -500 },
  },
};

async function shot(dev, id, which) {
  const name = `${PREFIX}-${dev}-${id}-${which}`;
  if (ONLY && !ONLY.some((o) => name.includes(o))) return;
  const cfg = INST[id];
  const ctx = await browser.newContext(VIEW[dev]);
  await ctx.addInitScript((inst) => localStorage.setItem('piano-model.instrument', inst), cfg.inst);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${BASE}/`);
  await page.evaluate(() => document.fonts.ready);
  await setup(page, cfg.inst, cfg.preset);
  if (which === 'whole') {
    await play(page, cfg.whole.notes, { pedal: cfg.whole.pedal });
    await page.waitForTimeout(1100);
  } else if (which === 'close') {
    await play(page, cfg.whole.notes, { pedal: cfg.whole.pedal });
    await camera(page, cfg.close.view, cfg.close.wheel);
    await page.waitForTimeout(1100);
  } else {
    await camera(page, cfg.act.view, cfg.act.wheel);
    await play(page, cfg.act.notes, { pedal: cfg.act.pedal, gap: 40 });
    await page.waitForTimeout(id === 'grand' || id === 'upright' ? 120 : 1000);
  }
  await page.screenshot({ path: join(OUT, `${name}.png`) });
  const stats = await page.evaluate(() => (window.__stage3d ? { ms: +window.__stage3d.stats.ms.toFixed(2), v: window.__stage3d.stats.vertices, lite: window.__stage3d.stats.lite } : null));
  console.log(`${name}.png ${JSON.stringify(stats)}${errors.length ? '  errors: ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

for (const dev of DEVICES)
  for (const id of Object.keys(INST))
    for (const which of ['whole', 'close', 'act']) {
      if (dev === 'phone' && which === 'close' && !['grand', 'cello'].includes(id)) continue;
      await shot(dev, id, which);
    }
await browser.close();
