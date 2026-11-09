// The 2D review set (BRIEF-2D): each instrument sounding on the 2D stage (desktop at 2× or phone),
// and the pianos' action close-up panel (<id>-panel.png).
//   OUT=<dir> BASE=http://localhost:5311 [ONLY=grand,upright] [PHONE=1] node scripts/review-2d.mjs
// Then `python3 scripts/contact-sheet.py <dir> <out.jpg> --views ...` works on these too (same stage area).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/review-2d', BASE = process.env.BASE ?? 'http://localhost:5311';
const ONLY = process.env.ONLY?.split(',');
const PHONE = process.env.PHONE === '1';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const R = {
  grand: { inst: 'piano', preset: 'grand', notes: [36, 48, 55, 64, 67, 72], pedal: true, panel: 48 },
  upright: { inst: 'piano', preset: 'upright', notes: [36, 48, 55, 64, 67, 72], pedal: true, panel: 60 },
  violin: { inst: 'violin', notes: [72] },
  viola: { inst: 'viola', notes: [60] },
  cello: { inst: 'cello', notes: [50] },
  flute: { inst: 'flute', notes: [74] },
  trumpet: { inst: 'trumpet', notes: [67] },
};
for (const [id, c] of Object.entries(R)) {
  if (ONLY && !ONLY.includes(id)) continue;
  const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((i) => { localStorage.setItem('piano-model.instrument', i); localStorage.setItem('piano-model.3d', '0'); }, c.inst);
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.waitForTimeout(800);
  await page.evaluate(async ([i, pr]) => { await window.__piano.start(); await window.__piano.setInstrument(i); if (pr) { await window.__piano.setPreset(pr); document.querySelectorAll('.presets button').forEach((b) => b.textContent === pr && b.click()); } }, [c.inst, c.preset ?? null]);
  await page.waitForTimeout(500);
  await page.evaluate(async ([ns, pd]) => { if (pd) window.__piano.sustain(1); for (const m of ns) { window.__piano.noteOn(m, 96, 'keys'); await new Promise((r) => setTimeout(r, 70)); } }, [c.notes, !!c.pedal]);
  await page.waitForTimeout(c.inst === 'piano' ? 350 : 1100);
  await page.screenshot({ path: `${OUT}/${PHONE ? 'phone-' : ''}${id}.png` });
  if (c.panel && !PHONE) {
    // the 2D close-up of one key's action (click its strings)
    const k = page.locator(`.key[data-midi="${c.panel}"]`);
    await k.scrollIntoViewIfNeeded();
    const kb = await k.boundingBox();
    const cv = await page.locator('.stage-cv').boundingBox();
    await page.mouse.click(kb.x + kb.width / 2, cv.y + cv.height * (id === 'grand' ? 0.8 : 0.55));
    await page.waitForTimeout(300);
    await page.evaluate((m) => window.__piano.noteOn(m, 100, 'keys'), c.panel);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${id}-panel.png` });
  }
  await ctx.close();
  console.log(id);
}
await browser.close();
