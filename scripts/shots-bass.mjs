// The double bass's review set: alone on the stage in each view (2D classic, 2D vector, 3D), on a
// desktop (1440×900 at 2×) or a phone (390×844 at 3×), sounding an open string and a stopped note,
// beside the cello for scale.
//   OUT=<dir> BASE=http://localhost:5393 [PHONE=1] [ONLY=bass,cello] [VIEWS=classic,vector,3d] node scripts/shots-bass.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/double-bass/shots', BASE = process.env.BASE ?? 'http://localhost:5393';
const ONLY = process.env.ONLY?.split(',') ?? ['bass', 'cello'];
const VIEWS = process.env.VIEWS?.split(',') ?? ['classic', 'vector', '3d'];
const PHONE = process.env.PHONE === '1';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal'] });
const NOTES = { bass: [40], cello: [50], violin: [72], viola: [60] };
for (const inst of ONLY)
  for (const view of VIEWS) {
    const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(([i, v]) => {
      localStorage.setItem('piano-model.instrument', i);
      localStorage.setItem('piano-model.3d', v === '3d' ? '1' : '0');
      localStorage.setItem('piano-model.style', v === 'vector' ? 'vector' : 'classic');
    }, [inst, view]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', inst, view, e.message));
    await page.goto(BASE + '/');
    await page.waitForTimeout(view === '3d' ? 3500 : 900);
    await page.evaluate(async (i) => { await window.__piano.start(); await window.__piano.setInstrument(i); }, inst);
    await page.waitForTimeout(view === '3d' ? 2500 : 600);
    await page.evaluate(async (ns) => { for (const m of ns) window.__piano.noteOn(m, 96, 'keys'); }, NOTES[inst] ?? [48]);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${OUT}/${inst}-${view}-${PHONE ? 'phone' : 'desktop'}.png` });
    await ctx.close();
    console.log(inst, view);
  }
await browser.close();
