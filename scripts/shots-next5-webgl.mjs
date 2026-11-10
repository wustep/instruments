// NEXT5 item 5: the pianos in 3D, whole and in a key's action close-up, desktop and phone.
//   OUT=<dir> TAG=before|after BASE=http://localhost:5311 [ONLY=grand] [SHOTS=hero,c4] [PHONE=0|1] node scripts/shots-next5-webgl.mjs
// Writes <OUT>/<desktop|phone>-<grand|upright>-<shot>-<TAG>.png (the 3D canvas) and prints each shot's
// frame time and WebGL console messages. `scripts/pairs-next5-webgl.py` measures the clipped whites
// and stacks before over after.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/5-webgl/raw';
const TAG = process.env.TAG ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:5311';
const ONLY = process.env.ONLY?.split(',');
const SHOTS = process.env.SHOTS?.split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEV = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
/** shot → { key: the close-up's key (null: the whole piano), play: notes sounding, hold: ms after the note on } */
const SHOT = {
  hero: { key: null, play: [48, 55, 64, 67], hold: 900 },
  c4: { key: 60, play: [], hold: 0 },
  'c4-struck': { key: 60, play: [60], hold: 70 },
  a1: { key: 33, play: [], hold: 0 },
  c7: { key: 96, play: [], hold: 0 },
};
for (const dev of Object.keys(DEV)) {
  if (process.env.PHONE === '1' && dev !== 'phone') continue;
  if (process.env.PHONE === '0' && dev !== 'desktop') continue;
  for (const preset of ['grand', 'upright']) {
    if (ONLY && !ONLY.includes(preset)) continue;
    for (const [shot, cfg] of Object.entries(SHOT)) {
      if (SHOTS && !SHOTS.includes(shot)) continue;
      const ctx = await browser.newContext(DEV[dev]);
      await ctx.addInitScript(() => {
        localStorage.setItem('piano-model.instrument', 'piano');
        localStorage.setItem('piano-model.3d', '1');
      });
      const page = await ctx.newPage();
      const gl = [];
      page.on('console', (m) => /webgl|GL_/i.test(m.text()) && gl.push(m.text()));
      await page.goto(`${BASE}/`);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(async (pr) => {
        await window.__piano.start();
        await window.__piano.setPreset(pr);
        document.querySelectorAll('.presets button').forEach((b) => b.textContent === pr && b.click());
      }, preset);
      await page.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 15000 });
      await page.waitForTimeout(500);
      if (cfg.key !== null) {
        await page.evaluate((k) => window.__stage3d.zoomTo(k), cfg.key);
        await page.waitForTimeout(1300);
      }
      if (cfg.play.length) {
        await page.evaluate((ns) => ns.forEach((m) => window.__piano.noteOn(m, 100, 'keys')), cfg.play);
        await page.waitForTimeout(cfg.hold);
      } else await page.waitForTimeout(300);
      const name = `${dev}-${preset}-${shot}-${TAG}`;
      const cv = page.locator('.stage-3d');
      await cv.screenshot({ path: `${OUT}/${name}.png` });
      const st = await page.evaluate(() => ({ ms: +window.__stage3d.stats.ms.toFixed(2), ao: window.__stage3d.stats.ao, lite: window.__stage3d.stats.lite, mirror: window.__stage3d.stats.mirror }));
      console.log(`${name.padEnd(36)} ${JSON.stringify(st)}  webgl messages ${gl.length}`);
      await ctx.close();
    }
  }
}
await browser.close();
