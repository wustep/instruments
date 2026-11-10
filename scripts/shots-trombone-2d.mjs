// The trombone's 2D review set: alone on the stage in both 2D styles (the drawn look and the vector lines), on
// a laptop (1440×900 at 1.25×), a Pixel 7 (412×915 at 2×) and a phone at 390×844 (2×), the stage's band
// between the readout and the keys, at rest and sounding B♭3 (first position), C♯3 (fifth), C3 (the F valve,
// first) and C2 (the F valve, sixth: the slide 0.61 m out); the three sizes (the alto's seventh-position A2,
// the tenor, the bass's B1 on both valves) at one px/m; in the Orchestra among strings in both styles;
// close-ups of the slide's crook, the valve and its trigger (at rest and pulled), and the mouthpiece and lips
// at ff. JPEGs, kept compact for the PR.
//   pnpm build && pnpm preview --port 4243 --strictPort &
//   OUT=<dir> BASE=http://localhost:4243 [TAG=after] [SETS=alone,sizes,orchestra,close] node scripts/shots-trombone-2d.mjs
// TAG=before shoots the stand-in's comparison subset (C2 alone in each style and device, the laptop's and the
// phone's Orchestra in each style); it was run on a build of dbc9d95 (the trumpet's drawing standing in).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/trombone/2d';
const BASE = process.env.BASE ?? 'http://localhost:4243';
const TAG = process.env.TAG ?? 'after';
const SETS = (process.env.SETS ?? (TAG === 'before' ? 'alone,orchestra' : 'alone,sizes,orchestra,close')).split(',');
const want = (name) => TAG !== 'before' || /-C2$|^orchestra-/.test(name);
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
  const dev = name.replace(/^(orchestra|size)-/, '').split('-')[0];
  await page.screenshot({ path: `${OUT}/${TAG}-${name}.jpg`, type: 'jpeg', quality: clip ? 62 : 46, clip: clip ?? BAND[dev] });
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
/** a note held long enough for the slide, the wave and the lips to settle */
const hold = async (page, m, vel = 100) => {
  await page.evaluate(([m, v]) => window.__piano.piano.noteOn(m, v), [m, vel]);
  await page.waitForTimeout(1500);
};
const release = async (page, m) => {
  await page.evaluate((m) => window.__piano.piano.noteOff(m), m);
  await page.waitForTimeout(900);
};
/** the notes (MIDI, as they sound) and their names in the files: the tenor's chart (tromboneFingering) */
const NOTES = [
  [58, 'Bb3'],
  [49, 'Cs3'],
  [48, 'C3'],
  [36, 'C2'],
];

if (SETS.includes('alone'))
  for (const dev of ['laptop', 'pixel', 'phone'])
    for (const style of ['classic', 'vector']) {
      const { ctx, page } = await open(dev, '/trombone', style);
      await page.evaluate(() => window.__piano.setInstrument('trombone'));
      await page.waitForTimeout(800);
      const s = style === 'classic' ? '2d' : 'vector';
      if (style === 'classic' || dev === 'laptop') await shot(page, `${dev}-${s}-rest`);
      for (const [m, n] of NOTES) {
        // (the laptop: every note in both looks; the phones: two in each)
        if (!want(`${dev}-${s}-${n}`)) continue;
        if (dev !== 'laptop' && n !== 'Bb3' && n !== 'C2') continue;
        await hold(page, m);
        await shot(page, `${dev}-${s}-${n}`);
        await release(page, m);
      }
      await ctx.close();
    }

if (SETS.includes('sizes'))
  // the three sizes on the laptop's stage at one px/m: the alto's seventh position, the tenor's B♭3, the bass
  // on both valves
  for (const style of ['classic', 'vector']) {
    const s = style === 'classic' ? '2d' : 'vector';
    const { ctx, page } = await open('laptop', '/trombone', style);
    await page.evaluate(() => window.__piano.setInstrument('trombone'));
    for (const [size, m, n] of [[0, 45, 'alto-A2'], [1, 53, 'tenor-F3'], [2, 35, 'bass-B1']]) {
      await page.evaluate((v) => window.__piano.setParams({ size: v }), size);
      await page.waitForTimeout(500);
      await hold(page, m);
      await shot(page, `size-laptop-${s}-${n}`);
      await release(page, m);
    }
    await ctx.close();
  }

if (SETS.includes('orchestra'))
  for (const dev of ['laptop', 'phone'])
    for (const style of ['classic', 'vector']) {
      const view = style === 'classic' ? '2d' : 'vector';
      if (!want(`orchestra-${dev}-${view}`)) continue;
      const { ctx, page } = await open(dev, `/orchestra?v=1&seats=violin,violin,viola,cello,trombone&view=${view}`, style);
      await page.waitForFunction(() => window.__orchestra?.ensemble?.parts?.length === 5 && window.__orchestra.ensemble.parts.every((p) => p.engine), null, { timeout: 30_000 });
      await page.waitForTimeout(600);
      // the trombone and the strings sounding a chord (the trombone's C♯3 in fifth position)
      await page.evaluate(() => {
        const ns = { violin: [76, 72], trombone: [49], viola: [64], cello: [45] };
        const used = {};
        for (const p of window.__orchestra.ensemble.parts) {
          const k = (used[p.voice] = (used[p.voice] ?? -1) + 1);
          const m = ns[p.voice]?.[k] ?? ns[p.voice]?.[0];
          if (m) p.engine.noteOn(m, 96);
        }
      });
      await page.waitForTimeout(1500);
      await shot(page, `orchestra-${dev}-${view}`);
      await ctx.close();
    }

if (SETS.includes('close')) {
  // close-ups on the laptop's stage at 3×: the valve and its trigger at rest and pulled (C2: the F valve,
  // sixth position), the slide's crook out there, and the mouthpiece with the lips buzzing at ff
  for (const style of ['classic', 'vector']) {
    const s = style === 'classic' ? '2d' : 'vector';
    const { ctx, page } = await open('zoom', '/trombone', style);
    await page.evaluate(() => window.__piano.setInstrument('trombone'));
    await page.waitForTimeout(800);
    const d = await page.evaluate(() => window.__trombone2d?.());
    if (d) {
      const box = (b, pad) => ({ x: Math.max(0, b.x0 - pad), y: Math.max(0, b.y0 - pad), width: b.x1 - b.x0 + 2 * pad, height: b.y1 - b.y0 + 2 * pad });
      // the bell section: the tuning slide's bow to the bell brace, the bell's tail over it
      const section = { x0: d.body.x0, x1: d.valves.x1 + 20, y0: d.bell.y0 + (d.bell.y1 - d.bell.y0) * 0.35, y1: d.body.y1 };
      await shot(page, `close-${s}-valve-rest`, box(section, 6));
      await hold(page, 36, 100);
      await shot(page, `close-${s}-valve-C2`, box(section, 6));
      const e = await page.evaluate(() => window.__trombone2d?.());
      await shot(page, `close-${s}-crook-C2`, box({ x0: e.crookX - 260, x1: e.crookX + 14, y0: e.slideBox.y0 - 10, y1: e.slideBox.y1 + 6 }, 4));
      await release(page, 36);
      await hold(page, 58, 127);
      await shot(page, `close-${s}-lips`, box(d.mouth, 14));
    }
    await ctx.close();
  }
}
await browser.close();
