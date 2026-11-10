// The piano's action close-up, photographed: the 2D section (ui/action-view.ts) in both styles, on
// the grand and the upright, just opened on a key played before, at rest, through a held strike, after
// the release and through a tap; and
// the 3D fly-to close-up. One picture per state, cropped to the panel (2D) or the stage (3D).
//   BASE=http://localhost:4321 OUT=artifacts/…/after node scripts/shots-hammer-action.mjs [1440x900 390x844 …]
// `ONLY=2d` or `ONLY=3d` takes one half; `MIDI=60` the key.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:4321';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/hammer-action/after';
const ONLY = process.env.ONLY ?? '';
const MIDI = Number(process.env.MIDI ?? 60);
const SIZES = (process.argv.slice(2).length ? process.argv.slice(2) : ['1440x900', '390x844']).map((s) => s.split('x').map(Number));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });

const preset = async (page, kind) => {
  await page.evaluate(async (k) => {
    await window.__piano.setInstrument('piano');
    document.querySelectorAll('.presets button')[k === 'grand' ? 0 : 1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, kind);
  await page.waitForTimeout(500);
};
const start = async (page) => {
  await page.goto(BASE + '/');
  await page.evaluate(() => window.__piano.start());
  await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 30_000 });
  await page.waitForTimeout(400);
};
const on = (page, vel = 96) => page.evaluate(([m, v]) => window.__piano.noteOn(m, v, 'keys'), [MIDI, vel]);
const off = (page) => page.evaluate((m) => window.__piano.noteOff(m, 'keys'), MIDI);

for (const [w, hgt] of SIZES) {
  const touch = w < 700 || hgt < 500;
  const size = `${w}x${hgt}`;
  if (ONLY !== '3d') {
    for (const style of ['default', 'vector']) {
      const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
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
        // the key is played and let go before its close-up is opened
        await on(page);
        await page.waitForTimeout(150);
        await off(page);
        await page.waitForTimeout(1500);
        const k = page.locator(`.key[data-midi="${MIDI}"]`);
        await k.scrollIntoViewIfNeeded();
        const kb = await k.boundingBox();
        const cv = await page.locator('.stage-cv').boundingBox();
        const px = kb.x + kb.width / 2;
        let opened = false;
        for (const frac of kind === 'grand' ? [0.8, 0.7, 0.6, 0.5] : [0.55, 0.45, 0.65, 0.35]) {
          if (touch) await page.touchscreen.tap(px, cv.y + cv.height * frac);
          else await page.mouse.click(px, cv.y + cv.height * frac);
          await page.waitForTimeout(250);
          if (await page.locator('.av-panel').count()) {
            opened = true;
            break;
          }
        }
        if (!opened) {
          console.log(`${size} ${style} ${kind}: the close-up did not open`);
          continue;
        }
        const label = await page.locator('.av-panel').getAttribute('aria-label');
        const box = await page.locator('.av-panel').boundingBox();
        console.log(`${size} ${style} ${kind}: "${label}" panel ${box.x.toFixed(0)},${box.y.toFixed(0)} ${box.width.toFixed(0)}×${box.height.toFixed(0)}`);
        const snap = async (name) => {
          const st = await page.evaluate(() => (window.__action ? JSON.stringify(window.__action.state) : ''));
          if (st) console.log(`   ${name}: ${st}`);
          await page.locator('.av-panel').screenshot({ path: `${OUT}/2d-${style}-${kind}-${size}-${name}.png` });
        };
        await page.waitForTimeout(500);
        await snap('a-opened-after-playing');
        await page.waitForTimeout(5500);
        await snap('0-rest');
        await on(page);
        await page.waitForTimeout(450);
        await snap('1-held-early');
        await page.waitForTimeout(1100);
        await snap('2-held-mid');
        await page.waitForTimeout(3500);
        await snap('3-held-settled');
        await off(page);
        await page.waitForTimeout(1200);
        await snap('4-released');
        await on(page);
        await page.waitForTimeout(90);
        await off(page);
        await page.waitForTimeout(500);
        await snap('5-tap-early');
        await page.waitForTimeout(4500);
        await snap('6-tap-after');
        await page.screenshot({ path: `${OUT}/2d-${style}-${kind}-${size}-page.png` });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
      await ctx.close();
    }
  }
  if (ONLY !== '2d') {
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(() => {
      localStorage.setItem('piano-model.instrument', 'piano');
      localStorage.setItem('piano-model.3d', '1');
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', String(e)));
    await start(page);
    await page.waitForFunction(() => window.__stage3d, null, { timeout: 30_000 });
    for (const kind of ['grand', 'upright']) {
      await preset(page, kind);
      await page.evaluate((m) => window.__stage3d.zoomTo(m), MIDI);
      await page.waitForTimeout(2600);
      const snap = (name) => page.screenshot({ path: `${OUT}/3d-${kind}-${size}-${name}.png` });
      await snap('0-rest');
      await on(page);
      await page.waitForTimeout(60);
      await snap('1-strike');
      await page.waitForTimeout(700);
      await snap('2-held');
      await off(page);
      await page.waitForTimeout(700);
      await snap('3-released');
      await page.evaluate(() => window.__stage3d.zoomOut());
      await page.waitForTimeout(1500);
    }
    await ctx.close();
  }
}
await browser.close();
