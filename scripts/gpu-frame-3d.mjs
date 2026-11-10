// What a 3D frame costs with the GPU's work included: each draw followed by a one-pixel read back, timed
// (median over 150 frames), for the pianos whole and in a key's close-up.
//   BASE=http://localhost:5311 [PHONE=1] [KEYS=60,96] node scripts/gpu-frame-3d.mjs
import { chromium } from '@playwright/test';
const BASE = process.env.BASE ?? 'http://localhost:5311';
const PHONE = process.env.PHONE === '1';
const KEYS = (process.env.KEYS ?? '60,96').split(',').map(Number);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
for (const preset of ['grand', 'upright']) {
  const out = [];
  for (const key of [null, ...KEYS]) {
    const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => {
      localStorage.setItem('piano-model.instrument', 'piano');
      localStorage.setItem('piano-model.3d', '1');
    });
    const page = await ctx.newPage();
    await page.goto(BASE + '/');
    await page.evaluate(async (p) => {
      await window.__piano.start();
      await window.__piano.setPreset(p);
      document.querySelectorAll('.presets button').forEach((b) => b.textContent === p && b.click());
    }, preset);
    await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 20000 });
    if (key !== null) {
      await page.evaluate((k) => window.__stage3d.zoomTo(k), key);
      await page.waitForTimeout(1500);
    }
    const ms = await page.evaluate(
      () =>
        new Promise((res) => {
          const r3 = window.__stage3d.r3;
          const gl = r3.r.getContext();
          const draw = r3.draw.bind(r3);
          const t = [];
          const px = new Uint8Array(4);
          // (a read back is what makes the browser wait for the GPU: gl.finish() returns at once)
          const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          r3.draw = (...a) => {
            sync();
            const t0 = performance.now();
            draw(...a);
            sync();
            t.push(performance.now() - t0);
            if (t.length === 150) {
              r3.draw = draw;
              t.sort((x, y) => x - y);
              res(+t[75].toFixed(2));
            }
          };
        }),
    );
    out.push(`${key === null ? 'whole' : `key ${key}`} ${ms} ms`);
    await ctx.close();
  }
  console.log(`${preset.padEnd(8)} ${out.join('   ')}`);
}
await browser.close();
