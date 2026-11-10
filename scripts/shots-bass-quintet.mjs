// The constructed quintet file (Violin I, Violin II, Viola, Violoncello, Contrabass on GM 40/40/41/42/43;
// artifacts/realistic-3d/final-next5/double-bass/audio/quintet-constructed.mid) dropped on the stage, as
// a Daylight file would be, photographed playing in each view (2D classic, 2D vector, 3D) on a desktop
// (1440×900 at 2×) and a phone (390×844 at 3×). Against production (main) it shows the old routing.
//   OUT=<dir> BASE=https://instruments-wustep.vercel.app TAG=before [VIEWS=classic,vector,3d] [PHONE=1] node scripts/shots-bass-quintet.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/double-bass/orchestra', BASE = process.env.BASE ?? 'http://localhost:5393';
const TAG = process.env.TAG ?? 'after';
const VIEWS = process.env.VIEWS?.split(',') ?? ['classic', 'vector', '3d'];
const PHONE = process.env.PHONE === '1';
const FILE = [...readFileSync(new URL('../artifacts/realistic-3d/final-next5/double-bass/audio/quintet-constructed.mid', import.meta.url))];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal'] });
for (const view of VIEWS) {
  const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((v) => {
    localStorage.setItem('piano-model.3d', v === '3d' ? '1' : '0');
    localStorage.setItem('piano-model.style', v === 'vector' ? 'vector' : 'classic');
  }, view);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', view, e.message));
  await page.goto(BASE + '/');
  await page.waitForTimeout(view === '3d' ? 3000 : 900);
  await page.evaluate(async () => {
    await window.__piano.start();
  });
  await page.waitForFunction(() => window.__piano?.status === 'running', null, { timeout: 30000 });
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'quintet.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, FILE);
  await page.waitForFunction(() => window.__orchestra.ensemble.parts.filter((p) => p.engine).length === 5, null, { timeout: 20000 });
  // into the second chord (the bass on B♭1), every part sounding
  await page.waitForTimeout(view === '3d' ? 5200 : 3200);
  const lineup = await page.evaluate(() => window.__orchestra.ensemble.lineup);
  await page.evaluate(() => document.querySelectorAll('.tip').forEach((t) => (t.style.display = 'none')));
  await page.mouse.move(2, 2);
  await page.screenshot({ path: `${OUT}/quintet-${view}-${PHONE ? 'phone' : 'desktop'}-${TAG}.png` });
  console.log(view, TAG, JSON.stringify(lineup));
  await ctx.close();
}
await browser.close();
