// The oboe's 2D review set: alone on the stage in both 2D styles (the drawn look and the vector lines),
// on a laptop (1440×900 at 2×) and a phone (390×844 at 3×), at rest and sounding (A4; E6, half-holed and
// cross-fingered in its third octave), in the Orchestra among strings in both styles, and close-ups of
// the reed and of the keywork under D5 (half-hole, both hands). JPEGs, kept compact for the PR.
//   pnpm build && pnpm preview --port 4371 --strictPort &
//   OUT=<dir> BASE=http://localhost:4371 [TAG=after] [SETS=alone,orchestra,close] node scripts/shots-oboe-2d.mjs
// TAG=before shoots the placeholder's comparison subset (A4 alone in each style and device, the laptop's
// Orchestra in each style); it was run on a build of 95c567c.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/oboe/2d';
const BASE = process.env.BASE ?? 'http://localhost:4371';
const TAG = process.env.TAG ?? 'after';
const SETS = (process.env.SETS ?? (TAG === 'before' ? 'alone,orchestra' : 'alone,orchestra,close')).split(',');
const want = (name) => TAG !== 'before' || /-A4$|^orchestra-laptop/.test(name);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const DEVICES = {
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
/** the stage's band (CSS px: under the readout, above the controls), for the shots that need no more */
const BAND = { laptop: { x: 0, y: 120, width: 1440, height: 570 }, phone: { x: 0, y: 220, width: 390, height: 400 } };
/** a shot: the whole viewport for the A4 comparisons (the stage between the file player and the keys),
 *  the stage's band for the others, or a close-up */
const shot = async (page, name, clip) => {
  if (!want(name)) return;
  const dev = name.includes('phone') ? 'phone' : 'laptop';
  const c = clip ?? (/-A4$/.test(name) ? null : BAND[dev]);
  await page.screenshot({ path: `${OUT}/${TAG}-${name}.jpg`, type: 'jpeg', quality: clip ? 70 : 45, ...(c ? { clip: c } : {}) });
  console.log(name);
};
async function open(dev, path, style) {
  const ctx = await browser.newContext(DEVICES[dev]);
  await ctx.addInitScript((s) => {
    localStorage.setItem('piano-model.3d', '0');
    localStorage.setItem('piano-model.style', s);
  }, style);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', dev, path, e.message));
  await page.goto(BASE + path);
  await page.waitForFunction(() => !!window.__piano, null, { timeout: 30_000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__piano.start());
  await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 30_000 });
  return { ctx, page };
}
/** a note held long enough for the wave and the reed to settle */
const hold = async (page, m, vel = 100) => {
  await page.evaluate(([m, v]) => window.__piano.piano.noteOn(m, v), [m, vel]);
  await page.waitForTimeout(1400);
};
const release = async (page, m) => {
  await page.evaluate((m) => window.__piano.piano.noteOff(m), m);
  await page.waitForTimeout(500);
};

if (SETS.includes('alone'))
  for (const dev of ['laptop', 'phone'])
    for (const style of ['classic', 'vector']) {
      const { ctx, page } = await open(dev, '/oboe', style);
      await page.evaluate(() => window.__piano.setInstrument('oboe'));
      await page.waitForTimeout(800);
      const s = style === 'classic' ? '2d' : 'vector';
      // (at rest as drawn; sounding in both styles)
      if (style === 'classic') await shot(page, `${dev}-${s}-rest`);
      await hold(page, 69);
      await shot(page, `${dev}-${s}-A4`);
      await release(page, 69);
      if (dev === 'laptop' && want(`${dev}-${s}-E6`)) {
        await hold(page, 88);
        await shot(page, `${dev}-${s}-E6`);
        await release(page, 88);
      }
      await ctx.close();
    }

if (SETS.includes('orchestra'))
  for (const dev of ['laptop', 'phone'])
    for (const style of ['classic', 'vector']) {
      const view = style === 'classic' ? '2d' : 'vector';
      if (!want(`orchestra-${dev}-${view}`)) continue;
      const { ctx, page } = await open(dev, `/orchestra?v=1&seats=violin,violin,oboe,viola,cello&view=${view}`, style);
      await page.waitForFunction(() => window.__orchestra?.ensemble?.parts?.length === 5 && window.__orchestra.ensemble.parts.every((p) => p.engine), null, { timeout: 30_000 });
      await page.waitForTimeout(600);
      // the oboe and the strings sounding a chord
      await page.evaluate(() => {
        const ns = { violin: [76, 72], oboe: [81], viola: [64], cello: [48] };
        const used = {};
        for (const p of window.__orchestra.ensemble.parts) {
          const k = (used[p.voice] = (used[p.voice] ?? -1) + 1);
          const m = ns[p.voice]?.[k] ?? ns[p.voice]?.[0];
          if (m) p.engine.noteOn(m, 96);
        }
      });
      await page.waitForTimeout(1400);
      await shot(page, `orchestra-${dev}-${view}`);
      await ctx.close();
    }

if (SETS.includes('close')) {
  // close-ups on the laptop's stage: the reed (the blades' opening, shut once a cycle at ff) and the
  // keywork under a half-holed note with both hands down (D5)
  for (const style of ['classic', 'vector']) {
    const { ctx, page } = await open('laptop', '/oboe', style);
    await page.evaluate(() => window.__piano.setInstrument('oboe'));
    await page.waitForTimeout(800);
    const d = await page.evaluate(() => window.__oboe2d?.());
    const s = style === 'classic' ? '2d' : 'vector';
    if (d) {
      await hold(page, 74, 120);
      const r = d.reed;
      if (style === 'classic') await shot(page, `close-${s}-reed`, { x: r.x - 70, y: r.y - 70, width: 300, height: 140 });
      const k = d.keys;
      await shot(page, `close-${s}-keys-D5`, { x: k.x0, y: k.y0, width: k.x1 - k.x0, height: k.y1 - k.y0 });
      await release(page, 74);
    }
    await ctx.close();
  }
}
await browser.close();
