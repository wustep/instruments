// The 3D pianos' keys and action while played, photographed: the sharps' undersides and the played
// parts' colours (no vermilion/amber tint in 3D; the 2D highlights stay). Grand and upright at desktop
// size: the hero view and the action (case hidden) with a chord held, a sharp's 3D close-up at rest,
// at the strike and held, the close-up seen from below, and a 2D control frame with the same chord.
//   BASE=http://localhost:4321 OUT=artifacts/realistic-3d/final-next5/black-keys/after node scripts/shots-black-keys.mjs
// `ONLY=2d` or `ONLY=3d` takes one half.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:4321';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/black-keys/after';
const ONLY = process.env.ONLY ?? '';
const [W, H] = (process.env.SIZE ?? '1440x900').split('x').map(Number);
/** a chord of white and black keys around middle C */
const CHORD = [55, 58, 60, 61, 64, 66];
/** the sharp seen close up (C♯4) */
const SHARP = 61;
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });

const preset = async (page, kind) => {
  await page.evaluate(async (k) => {
    await window.__piano.setInstrument('piano');
    document.querySelectorAll('.presets button')[k === 'grand' ? 0 : 1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, kind);
  await page.waitForTimeout(800);
};
const start = async (page) => {
  for (let k = 0; k < 2; k++) {
    try {
      await page.goto(BASE + '/');
      await page.evaluate(() => window.__piano.start());
      await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 30_000 });
      break;
    } catch (e) {
      if (k) throw e;
    }
  }
  await page.waitForTimeout(400);
};
const chordOn = (page) => page.evaluate((ns) => ns.forEach((m) => window.__piano.noteOn(m, 100, 'keys')), CHORD);
const chordOff = (page) => page.evaluate((ns) => ns.forEach((m) => window.__piano.noteOff(m, 'keys')), CHORD);
const on = (page, m) => page.evaluate((m) => window.__piano.noteOn(m, 100, 'keys'), m);
const off = (page, m) => page.evaluate((m) => window.__piano.noteOff(m, 'keys'), m);
/** views of the action with the case hidden (setView units: scaled by the lens like the default views) */
const ACTION = {
  grand: { target: [0.02, 0.8, 0.3], yaw: 0.95, pitch: 0.42, dist: 0.95 },
  upright: { target: [0.0, 0.9, 0.2], yaw: 0.55, pitch: 0.22, dist: 1.0 },
};

if (ONLY !== '2d') {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript(() => {
    localStorage.setItem('piano-model.instrument', 'piano');
    localStorage.setItem('piano-model.3d', '1');
    localStorage.setItem('piano-model.style', '');
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  await start(page);
  await page.waitForFunction(() => window.__stage3d, null, { timeout: 30_000 });
  const snap = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
  const caseHidden = () => page.evaluate(() => document.querySelector('.case-toggle')?.getAttribute('aria-pressed') === 'true');
  const setCase = async (hide) => {
    if ((await caseHidden()) !== hide) await page.locator('.case-toggle').dispatchEvent('click');
    await page.waitForTimeout(900);
  };
  for (const kind of ['grand', 'upright']) {
    await preset(page, kind);
    await setCase(false);
    await page.evaluate(() => window.__stage3d.resetView());
    await page.waitForTimeout(1200);
    // the hero view, a chord held
    await chordOn(page);
    await page.waitForTimeout(350);
    await snap(`3d-${kind}-hero-chord`);
    await chordOff(page);
    await page.waitForTimeout(1500);
    // the action, the case hidden: keys, sticks, hammers, dampers, strings
    await setCase(true);
    await page.evaluate((v) => window.__stage3d.setView(v), ACTION[kind]);
    await page.waitForTimeout(800);
    await snap(`3d-${kind}-action-rest`);
    await chordOn(page);
    await page.waitForTimeout(350);
    await snap(`3d-${kind}-action-chord`);
    await chordOff(page);
    await page.waitForTimeout(1500);
    await setCase(false);
    // a sharp's close-up: at rest, at the strike, held; then from below (the orbit's lowest pitch)
    await page.evaluate((m) => window.__stage3d.zoomTo(m), SHARP);
    await page.waitForTimeout(2600);
    await snap(`3d-${kind}-closeup-rest`);
    await on(page, SHARP);
    await page.waitForTimeout(60);
    await snap(`3d-${kind}-closeup-strike`);
    await page.waitForTimeout(700);
    await snap(`3d-${kind}-closeup-held`);
    await off(page, SHARP);
    await page.waitForTimeout(1500);
    const cv = await page.locator('canvas').first().boundingBox();
    const cx = cv.x + cv.width * 0.5;
    const cy = cv.y + cv.height * 0.5;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(cx, cy - k * 8);
    await page.mouse.up();
    await page.waitForTimeout(1500);
    await snap(`3d-${kind}-closeup-below`);
    await page.evaluate(() => window.__stage3d.zoomOut());
    await page.waitForTimeout(1500);
  }
  await ctx.close();
}
if (ONLY !== '3d') {
  for (const style of ['default', 'vector']) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    await ctx.addInitScript((s) => {
      localStorage.setItem('piano-model.instrument', 'piano');
      localStorage.setItem('piano-model.3d', '0');
      localStorage.setItem('piano-model.style', s === 'vector' ? 'vector' : '');
    }, style);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', String(e)));
    await start(page);
    if (style === 'vector' && !(await page.evaluate(() => document.documentElement.dataset.style === 'vector'))) {
      await page.locator('.vec-toggle').dispatchEvent('click');
      await page.waitForTimeout(300);
    }
    for (const kind of ['grand', 'upright']) {
      await preset(page, kind);
      await chordOn(page);
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${OUT}/2d-${style}-${kind}-chord.png` });
      await chordOff(page);
      await page.waitForTimeout(1200);
    }
    await ctx.close();
  }
}
await browser.close();
