// The timpani's 2D review set: alone on the stage in both 2D styles (the drawn look and the vector lines), on a
// laptop (1440×900 at 1.25×), a Pixel 7 (412×915 at 2×) and a phone at 390×844 (2×), the stage's band between
// the readout and the keys: at rest; a stroke on the low drum (D2, the 32″) and on the high one (F3, the 23″),
// each shot just after the stroke (the mallet rebounding, the head's field fresh) and a moment later (the
// (1,1) ringing on); a double stop (G2 and C3 together, both hands down); a roll (C3 held with the roll on).
// In the Orchestra among strings in both styles (laptop and phone). Close-ups on the laptop's stage at 3×: a
// head's mode pattern a few moments after a stroke, and the gauge with the pedal under it at both ends of the
// drum's range. JPEGs, kept compact for the PR.
//   pnpm build && pnpm preview --port 4212 --strictPort &
//   OUT=<dir> BASE=http://localhost:4212 [TAG=after] [SETS=alone,orchestra,close] node scripts/shots-timpani-2d.mjs
// TAG=before shoots the placeholder's comparison subset (rest, the low stroke and the double stop alone in each
// style and device; the Orchestra in each style); it was run on a build of 9c9256f (the first placeholder).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-symphony/timpani/2d';
const BASE = process.env.BASE ?? 'http://localhost:4212';
const TAG = process.env.TAG ?? 'after';
const SETS = (process.env.SETS ?? (TAG === 'before' ? 'alone,orchestra' : 'alone,orchestra,close')).split(',');
const DEVS = (process.env.DEVS ?? 'laptop,pixel,phone').split(',');
const want = (name) => TAG !== 'before' || /-(rest|D2-hit|double)$|^orchestra-/.test(name);
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
const shot = async (page, name, clip) => {
  if (!want(name)) return;
  const dev = name.replace(/^orchestra-/, '').split('-')[0];
  await page.screenshot({ path: `${OUT}/${TAG}-${name}.jpg`, type: 'jpeg', quality: clip ? 64 : 50, clip: clip ?? BAND[dev] });
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
const on = (page, ms, vel = 110) => page.evaluate(([ms, v]) => ms.forEach((m) => window.__piano.piano.noteOn(m, v)), [ms, vel]);
const off = (page, ms) => page.evaluate((ms) => ms.forEach((m) => window.__piano.piano.noteOff(m)), ms);
/** quiet every head (the next shot starts from rest) */
const hush = async (page) => {
  await page.evaluate(() => {
    window.__piano.piano.setParams({ roll: 0, damp: 1 });
    for (let m = 36; m <= 57; m++) window.__piano.piano.noteOff(m);
  });
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.__piano.piano.setParams({ damp: 0 }));
};

if (SETS.includes('alone'))
  for (const dev of DEVS)
    for (const style of ['classic', 'vector']) {
      const { ctx, page } = await open(dev, '/timpani', style);
      await page.evaluate(() => window.__piano.setInstrument('timpani'));
      await page.waitForTimeout(900);
      const s = style === 'classic' ? '2d' : 'vector';
      await shot(page, `${dev}-${s}-rest`);
      // a stroke on the low drum (D2: the 32″) and on the high (F3: the 23″): just after, and a moment on
      for (const [m, n] of [[38, 'D2'], [53, 'F3']]) {
        if (dev !== 'laptop' && n === 'F3' && style === 'vector') continue;
        await on(page, [m]);
        await page.waitForTimeout(120);
        await shot(page, `${dev}-${s}-${n}-hit`);
        if (dev === 'laptop') {
          await page.waitForTimeout(700);
          await shot(page, `${dev}-${s}-${n}-ring`);
        }
        await off(page, [m]);
        await hush(page);
      }
      // a double stop: G2 (the 29″) and C3 (the 26″) together
      await on(page, [43, 48]);
      await page.waitForTimeout(150);
      await shot(page, `${dev}-${s}-double`);
      await off(page, [43, 48]);
      await hush(page);
      // a roll on C3
      if (dev === 'laptop' || style === 'classic') {
        await page.evaluate(() => window.__piano.piano.setParams({ roll: 0.6 }));
        await on(page, [48], 80);
        await page.waitForTimeout(900);
        await shot(page, `${dev}-${s}-roll`);
        await off(page, [48]);
        await hush(page);
      }
      await ctx.close();
    }

if (SETS.includes('orchestra'))
  for (const dev of ['laptop', 'phone'])
    for (const style of ['classic', 'vector']) {
      const view = style === 'classic' ? '2d' : 'vector';
      if (!want(`orchestra-${dev}-${view}`)) continue;
      const { ctx, page } = await open(dev, `/orchestra?v=1&seats=violin,violin,viola,cello,timpani&view=${view}`, style);
      await page.waitForFunction(() => window.__orchestra?.ensemble?.parts?.length === 5 && window.__orchestra.ensemble.parts.every((p) => p.engine), null, { timeout: 30_000 });
      await page.waitForTimeout(600);
      // the timpani and the strings sounding a chord
      await page.evaluate(() => {
        const ns = { violin: [76, 72], timpani: [43], viola: [64], cello: [48] };
        const used = {};
        for (const p of window.__orchestra.ensemble.parts) {
          const k = (used[p.voice] = (used[p.voice] ?? -1) + 1);
          const m = ns[p.voice]?.[k] ?? ns[p.voice]?.[0];
          if (m) p.engine.noteOn(m, 110);
        }
      });
      await page.waitForTimeout(250);
      await shot(page, `orchestra-${dev}-${view}`);
      await ctx.close();
    }

if (SETS.includes('close')) {
  // close-ups at 3×: the 29″ head's field 0.15, 0.5 and 1.2 s after a stroke (G2); the 32″ gauge and pedal at
  // the bottom of its range (C2) and the top (A2)
  for (const style of ['classic', 'vector']) {
    const s = style === 'classic' ? '2d' : 'vector';
    const { ctx, page } = await open('zoom', '/timpani', style);
    await page.evaluate(() => window.__piano.setInstrument('timpani'));
    await page.waitForTimeout(900);
    const d = await page.evaluate(() => window.__timpani2d?.());
    if (d) {
      const hd = d.heads[1];
      const head = { x: hd.x - hd.rx * 1.1, y: hd.y - hd.ry * 1.25, width: hd.rx * 2.2, height: hd.ry * 2.5 };
      await on(page, [43], 120);
      let t = 0;
      for (const ms of [150, 500, 1200]) {
        await page.waitForTimeout(ms - t);
        t = ms;
        await shot(page, `close-${s}-head-${ms}ms`, head);
      }
      await off(page, [43]);
      await hush(page);
      for (const [m, n] of [[36, 'C2'], [45, 'A2']]) {
        await on(page, [m], 90);
        await page.waitForTimeout(1600);
        const e = await page.evaluate(() => window.__timpani2d?.());
        const g = e.gauges[0].box;
        const p = e.pedals[0];
        const h0 = e.heads[0];
        const x0 = Math.min(g.x0, p.x) - 40;
        const x1 = Math.max(g.x1, h0.x + h0.rx * 0.2) + 40;
        await shot(page, `close-${s}-gauge-pedal-${n}`, { x: x0, y: g.y0 - 30, width: x1 - x0, height: p.y + 60 - (g.y0 - 30) });
        await off(page, [m]);
        await hush(page);
      }
    }
    await ctx.close();
  }
}
await browser.close();
