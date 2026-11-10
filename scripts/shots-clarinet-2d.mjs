// The clarinet's 2D review set: alone on the stage in both 2D styles (the drawn look and the vector lines),
// on a laptop (1440×900 at 2×) and a phone (390×844 at 3×), at rest and sounding a chalumeau note
// (concert F3: every hole shut), a clarion note (concert G5: the register key, three quarter-waves on the
// long tube) and an altissimo note (concert D6, written E6: five quarter-waves), concert A4 (written B4,
// the clarion's lowest) for the comparison with the placeholder; in the Orchestra among strings in both
// styles; close-ups of the mouthpiece (the reed's tip opening, at ff) and of the keywork under F3 and G5.
// JPEGs, kept compact for the PR.
//   pnpm build && pnpm preview --port 4561 --strictPort &
//   OUT=<dir> BASE=http://localhost:4561 [TAG=after] [SETS=alone,orchestra,close] node scripts/shots-clarinet-2d.mjs
// TAG=before shoots the placeholder's comparison subset (A4 alone in each style and device, the laptop's
// and the phone's Orchestra in each style); it was run on a build of 4c64f23 (the oboe's drawing standing in).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/clarinet/2d';
const BASE = process.env.BASE ?? 'http://localhost:4561';
const TAG = process.env.TAG ?? 'after';
const SETS = (process.env.SETS ?? (TAG === 'before' ? 'alone,orchestra' : 'alone,orchestra,close')).split(',');
const want = (name) => TAG !== 'before' || /-A4$|^orchestra-/.test(name);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const DEVICES = {
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  // (the close-ups: the laptop's stage at 4×)
  zoom: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 },
};
/** the stage's band (CSS px: under the readout, above the controls), for the shots that need no more */
const BAND = { laptop: { x: 0, y: 120, width: 1440, height: 570 }, phone: { x: 0, y: 200, width: 390, height: 440 } };
/** a shot: the whole viewport for the A4 comparisons (the stage between the file player and the keys),
 *  the stage's band for the others, or a close-up */
const shot = async (page, name, clip) => {
  if (!want(name)) return;
  const dev = name.includes('phone') ? 'phone' : 'laptop';
  const c = clip ?? (/-A4$/.test(name) ? null : BAND[dev]);
  await page.screenshot({ path: `${OUT}/${TAG}-${name}.jpg`, type: 'jpeg', quality: clip ? 62 : /-A4$/.test(name) ? 34 : 36, ...(c ? { clip: c } : {}) });
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
/** the notes (concert MIDI) and their names in the files */
const NOTES = [
  [53, 'F3'],
  [79, 'G5'],
  [86, 'D6'],
];

if (SETS.includes('alone'))
  for (const dev of ['laptop', 'phone'])
    for (const style of ['classic', 'vector']) {
      const { ctx, page } = await open(dev, '/clarinet', style);
      await page.evaluate(() => window.__piano.setInstrument('clarinet'));
      await page.waitForTimeout(800);
      const s = style === 'classic' ? '2d' : 'vector';
      if (style === 'classic') await shot(page, `${dev}-${s}-rest`);
      await hold(page, 69);
      await shot(page, `${dev}-${s}-A4`);
      await release(page, 69);
      for (const [m, n] of NOTES) {
        if (!want(`${dev}-${s}-${n}`) || (dev === 'phone' && style === 'vector' && n !== 'G5')) continue;
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
      const { ctx, page } = await open(dev, `/orchestra?v=1&seats=violin,violin,clarinet,viola,cello&view=${view}`, style);
      await page.waitForFunction(() => window.__orchestra?.ensemble?.parts?.length === 5 && window.__orchestra.ensemble.parts.every((p) => p.engine), null, { timeout: 30_000 });
      await page.waitForTimeout(600);
      // the clarinet and the strings sounding a chord
      await page.evaluate(() => {
        const ns = { violin: [76, 72], clarinet: [67], viola: [64], cello: [48] };
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
  // close-ups on the laptop's stage: the mouthpiece at 4× (the reed's tip opening, shut once a cycle at ff)
  // and, at 2×, the keywork under a chalumeau note (every hole shut) and a clarion note (the register key)
  for (const style of ['classic', 'vector']) {
    const s = style === 'classic' ? '2d' : 'vector';
    for (const dev of ['zoom', 'laptop']) {
      const { ctx, page } = await open(dev, '/clarinet', style);
      await page.evaluate(() => window.__piano.setInstrument('clarinet'));
      await page.waitForTimeout(800);
      const d = await page.evaluate(() => window.__clarinet2d?.());
      if (d && dev === 'zoom') {
        await hold(page, 53, 120);
        const m = d.mouth;
        await shot(page, `close-${s}-mouthpiece`, { x: m.x0 - 40, y: m.y0 - 34, width: m.x1 - m.x0 + 80, height: m.y1 - m.y0 + 68 });
      } else if (d) {
        const k = d.keys;
        const clip = { x: k.x0, y: k.y0 - 8, width: k.x1 - k.x0, height: k.y1 - k.y0 + 16 };
        await hold(page, 53, 100);
        await shot(page, `close-${s}-keys-F3`, clip);
        await release(page, 53);
        await hold(page, 79, 100);
        await shot(page, `close-${s}-keys-G5`, clip);
      }
      await ctx.close();
    }
  }
}
await browser.close();
