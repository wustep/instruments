// The vector display's review set: each instrument sounding on the 2D stage in either style, on a
// desktop (1440×900 at 2×) or a phone (390×844 at 3×), and an ensemble.
//   OUT=<dir> BASE=http://localhost:5391 [STYLE=vector|classic] [PHONE=1] [ONLY=grand,violin] node scripts/shots-vector.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'artifacts/vector-2d', BASE = process.env.BASE ?? 'http://localhost:5391';
const STYLE = process.env.STYLE ?? 'vector';
const ONLY = process.env.ONLY?.split(',');
const PHONE = process.env.PHONE === '1';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const R = {
  grand: { inst: 'piano', preset: 'grand', notes: [36, 48, 55, 64, 67, 72], pedal: true },
  upright: { inst: 'piano', preset: 'upright', notes: [36, 48, 55, 64, 67, 72], pedal: true },
  violin: { inst: 'violin', notes: [72] },
  viola: { inst: 'viola', notes: [60] },
  cello: { inst: 'cello', notes: [50] },
  flute: { inst: 'flute', notes: [74] },
  trumpet: { inst: 'trumpet', notes: [67] },
  ensemble: { inst: 'violin', notes: [67, 55, 43], ensemble: true },
};
for (const [id, c] of Object.entries(R)) {
  if (ONLY && !ONLY.includes(id)) continue;
  const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([i, st]) => { localStorage.setItem('piano-model.instrument', i); localStorage.setItem('piano-model.3d', '0'); localStorage.setItem('piano-model.style', st); }, [c.inst, STYLE]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', id, e.message));
  await page.goto(BASE + '/');
  await page.waitForTimeout(800);
  await page.evaluate(async ([i, pr]) => { await window.__piano.start(); await window.__piano.setInstrument(i); if (pr) { await window.__piano.setPreset(pr); document.querySelectorAll('.presets button').forEach((b) => b.textContent === pr && b.click()); } }, [c.inst, c.preset ?? null]);
  await page.waitForTimeout(500);
  if (c.ensemble) {
    await page.locator('.ens-toggle').click();
    await page.waitForTimeout(2500);
  }
  await page.evaluate(async ([ns, pd]) => { if (pd) window.__piano.sustain(1); for (const m of ns) { window.__piano.noteOn(m, 96, 'keys'); await new Promise((r) => setTimeout(r, 70)); } }, [c.notes, !!c.pedal]);
  await page.waitForTimeout(c.inst === 'piano' ? 350 : 1100);
  await page.screenshot({ path: `${OUT}/${STYLE}-${PHONE ? 'phone' : 'desktop'}-${id}.png` });
  await ctx.close();
  console.log(id);
}
await browser.close();
