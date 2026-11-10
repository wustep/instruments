// The bassoon's 2D review set: alone on the stage in both 2D styles (the drawn look and the vector lines),
// on a laptop (1440×900 at 1.25×), a Pixel 7 (412×915 at 2×) and a phone at 390×844 (2×), the stage's band
// between the readout and the keys, at rest and sounding
// F2 (the long tube: every finger down but the E thumb key), G3 (the half-hole: the G2 tube overblown, two
// half-waves), D4 (the whisper key off: the D3 tube's octave) and A4 (the A flick key: three half-waves on
// the A2 tube); in the Orchestra among strings in both styles; close-ups of the reed and bocal (the reed's
// opening at ff) and of the keywork under F2 and A4. JPEGs, kept compact for the PR.
//   pnpm build && pnpm preview --port 4521 --strictPort &
//   OUT=<dir> BASE=http://localhost:4521 [TAG=after] [SETS=alone,orchestra,close] node scripts/shots-bassoon-2d.mjs
// TAG=before shoots the stand-in's comparison subset (F2 alone in each style and device, the laptop's and
// the phone's Orchestra in each style); it was run on a build of 41c5430 (the oboe's drawing standing in),
// at 2× (the laptop, the Pixel's 2.625×, the phone's 3×) and brought to these bands and scales with sips.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/bassoon/2d';
const BASE = process.env.BASE ?? 'http://localhost:4521';
const TAG = process.env.TAG ?? 'after';
const SETS = (process.env.SETS ?? (TAG === 'before' ? 'alone,orchestra' : 'alone,orchestra,close')).split(',');
const want = (name) => TAG !== 'before' || /-F2$|^orchestra-/.test(name);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const DEVICES = {
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.25 },
  pixel: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // (the close-ups: the laptop's stage at 3×)
  zoom: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 },
};
/** the stage's band on each device (CSS px: the file player at its top, the keys under it) */
const BAND = { laptop: { x: 0, y: 120, width: 1440, height: 570 }, pixel: { x: 0, y: 140, width: 412, height: 560 }, phone: { x: 0, y: 140, width: 390, height: 480 } };
/** a shot: the stage's band, or a close-up */
const shot = async (page, name, clip) => {
  if (!want(name)) return;
  const dev = name.replace(/^orchestra-/, '').split('-')[0];
  await page.screenshot({ path: `${OUT}/${TAG}-${name}.jpg`, type: 'jpeg', quality: clip ? 60 : 44, clip: clip ?? BAND[dev] });
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
/** the notes (MIDI, as they sound: the bassoon is in C) and their names in the files */
const NOTES = [
  [41, 'F2'],
  [55, 'G3'],
  [62, 'D4'],
  [69, 'A4'],
];

if (SETS.includes('alone'))
  for (const dev of ['laptop', 'pixel', 'phone'])
    for (const style of ['classic', 'vector']) {
      const { ctx, page } = await open(dev, '/bassoon', style);
      await page.evaluate(() => window.__piano.setInstrument('bassoon'));
      await page.waitForTimeout(800);
      const s = style === 'classic' ? '2d' : 'vector';
      if (style === 'classic') await shot(page, `${dev}-${s}-rest`);
      for (const [m, n] of NOTES) {
        // (the phones: every note in the drawn look, two in the vector one)
        if (!want(`${dev}-${s}-${n}`) || (dev !== 'laptop' && style === 'vector' && n !== 'F2' && n !== 'A4')) continue;
        await hold(page, m);
        await shot(page, `${dev}-${s}-${n}`);
        await release(page, m);
      }
      await ctx.close();
    }

if (SETS.includes('orchestra'))
  for (const dev of ['laptop', 'phone'])
    for (const style of ['classic', 'vector']) {
      const view = style === 'classic' ? '2d' : 'vector';
      if (!want(`orchestra-${dev}-${view}`)) continue;
      const { ctx, page } = await open(dev, `/orchestra?v=1&seats=violin,violin,bassoon,viola,cello&view=${view}`, style);
      await page.waitForFunction(() => window.__orchestra?.ensemble?.parts?.length === 5 && window.__orchestra.ensemble.parts.every((p) => p.engine), null, { timeout: 30_000 });
      await page.waitForTimeout(600);
      // the bassoon and the strings sounding a chord
      await page.evaluate(() => {
        const ns = { violin: [76, 72], bassoon: [48], viola: [64], cello: [36] };
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
  // close-ups on the laptop's stage at 4×: the reed and bocal (the reed's opening, shut once a cycle at ff)
  // and the keywork under the long tube (F2) and a flicked note (A4)
  for (const style of ['classic', 'vector']) {
    const s = style === 'classic' ? '2d' : 'vector';
    const { ctx, page } = await open('zoom', '/bassoon', style);
    await page.evaluate(() => window.__piano.setInstrument('bassoon'));
    await page.waitForTimeout(800);
    const d = await page.evaluate(() => window.__bassoon2d?.());
    if (d) {
      const box = (b, pad) => ({ x: Math.max(0, b.x0 - pad), y: Math.max(0, b.y0 - pad), width: b.x1 - b.x0 + 2 * pad, height: b.y1 - b.y0 + 2 * pad });
      await hold(page, 41, 120);
      await shot(page, `close-${s}-reed`, box(d.reedBox, 16));
      await shot(page, `close-${s}-keys-F2`, box(d.keys, 6));
      await release(page, 41);
      await hold(page, 69, 100);
      await shot(page, `close-${s}-keys-A4`, box(d.keys, 6));
    }
    await ctx.close();
  }
}
await browser.close();
