// The UI/UX review set (BRIEF-UX): whole pages, desktop (1440×900 at 2×) and phone (390×844 at 3×).
//   OUT=<dir> BASE=http://localhost:5311 node scripts/review-ux.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { smf } from '../apps/web/test/smf.ts';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/review-ux';
const BASE = process.env.BASE ?? 'http://localhost:5311';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
async function open(dev, inst = 'piano', d3 = false) {
  const ctx = await browser.newContext(dev);
  await ctx.addInitScript(([i, d]) => { localStorage.setItem('piano-model.instrument', i); localStorage.setItem('piano-model.3d', d ? '1' : '0'); }, [inst, d3]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.waitForTimeout(900);
  await page.evaluate(async () => { await window.__piano.start(); });
  await page.waitForTimeout(500);
  return { ctx, page };
}
const notes = async (page, ns) => page.evaluate(async (n) => { for (const m of n) { window.__piano.noteOn(m, 90, 'keys'); await new Promise((r) => setTimeout(r, 60)); } }, ns);
for (const [tag, dev] of [['desk', DESK], ['phone', PHONE]]) {
  for (const [name, inst, d3, ns] of [['piano-2d', 'piano', false, [48, 60, 64, 67]], ['piano-3d', 'piano', true, [48, 60, 64, 67]], ['cello-2d', 'cello', false, [50]], ['trumpet-3d', 'trumpet', true, [67]]]) {
    const { ctx, page } = await open(dev, inst, d3);
    await notes(page, ns);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
    await ctx.close();
  }
  // knobs open (phones fold them behind ◐)
  {
    const { ctx, page } = await open(dev, 'piano');
    const t = page.locator('.knob-toggle');
    if (await t.isVisible()) await t.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${tag}-knobs.png` });
    await ctx.close();
  }
  // MIDI player showing
  {
    const { ctx, page } = await open(dev, 'piano');
    const b = Array.from(smf(480, [[...Array.from({ length: 32 }, (_, i) => [[0, 0x90, 60 + (i % 8), 80], [240, 0x80, 60 + (i % 8), 0]]).flat()]]));
    await page.evaluate((bytes) => { const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array(bytes)], 'a.mid', { type: 'audio/midi' })); window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt })); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true })); }, b);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${tag}-player.png` });
    await ctx.close();
  }
}
// desktop: keyboard focus walk (Tab ×6), a tooltip, the secondary pages
{
  const { ctx, page } = await open(DESK, 'piano');
  for (let k = 0; k < 4; k++) await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/desk-focus.png` });
  await page.locator('.dim-toggle').hover();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/desk-tooltip.png` });
  for (const route of ['measurements', 'notes']) {
    await page.goto(`${BASE}/#/${route}`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/desk-${route}.png` });
  }
  await ctx.close();
}
await browser.close();
console.log('done');
