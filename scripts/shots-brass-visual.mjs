// The brass embouchure review set (PR "brass visual"): each wind alone on the stage — the woodwinds as the
// reference (flute, oboe, clarinet, bassoon) and the brass (horn, trumpet, trombone) — in the drawn 2D
// look, the vector lines and 3D, on a laptop (1440×900) and a phone (390×844, 2×), a note held; close-ups
// of each brass instrument's mouthpiece (where the breath goes in) in both 2D styles at 3×; and the horn's
// bell (where the hand was) in both 2D styles. JPEGs, compact for the PR.
//   pnpm build && pnpm preview --port 4472 --strictPort &
//   OUT=<dir> BASE=http://localhost:4472 TAG=after [SETS=alone,close,orchestra] [ONLY=horn,trumpet] node scripts/shots-brass-visual.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/brass-visual';
const BASE = process.env.BASE ?? 'http://localhost:4472';
const TAG = process.env.TAG ?? 'after';
const SETS = (process.env.SETS ?? 'alone,close,orchestra').split(',');
const ONLY = process.env.ONLY?.split(',');
const STYLES = (process.env.STYLES ?? 'classic,vector,3d').split(',');
const DEVS = (process.env.DEVS ?? 'laptop,phone').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEVICES = {
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  zoom: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 },
};
/** a note in each one's middle register (MIDI as it sounds) */
const NOTE = { flute: 74, oboe: 67, clarinet: 62, bassoon: 50, horn: 55, trumpet: 67, trombone: 53 };
const WINDS = ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone'].filter((i) => !ONLY || ONLY.includes(i));

async function open(dev, path, style, inst) {
  const ctx = await browser.newContext(DEVICES[dev]);
  await ctx.addInitScript(([s, i]) => {
    localStorage.setItem('piano-model.3d', s === '3d' ? '1' : '0');
    localStorage.setItem('piano-model.style', s === 'vector' ? 'vector' : 'classic');
    if (i) localStorage.setItem('piano-model.instrument', i);
  }, [style, inst]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror', dev, path, e.message));
  await page.goto(BASE + path);
  await page.waitForFunction(() => !!window.__piano, null, { timeout: 30_000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__piano.start());
  await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 30_000 });
  if (inst) {
    await page.evaluate((i) => window.__piano.setInstrument(i), inst);
    if (style === '3d') await page.waitForFunction(() => window.__stage3d?.stats?.frames > 3, null, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1200);
  }
  return { ctx, page };
}
const hold = async (page, m, vel = 100) => {
  await page.evaluate(([m, v]) => window.__piano.noteOn(m, v, 'keys'), [m, vel]);
  await page.waitForTimeout(1400);
};
const release = async (page, m) => {
  await page.evaluate((m) => window.__piano.noteOff(m, 'keys'), m);
  await page.waitForTimeout(700);
};
/** the stage (under the top panel, over the keys) */
const stageClip = async (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.stage-3d:not([hidden])') ?? document.querySelector('canvas.stage, .stage canvas, canvas');
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(innerWidth, r.width), height: Math.min(innerHeight - r.top, r.height) };
  });
const shot = async (page, name, clip, q = 55) => {
  await page.screenshot({ path: `${OUT}/${TAG}-${name}.jpg`, type: 'jpeg', quality: q, clip: clip ?? (await stageClip(page)) });
  console.log(name);
};

if (SETS.includes('alone'))
  for (const dev of DEVS)
    for (const style of STYLES)
      for (const inst of WINDS) {
        const { ctx, page } = await open(dev, '/' + inst, style, inst);
        await hold(page, NOTE[inst]);
        await shot(page, `${dev}-${style}-${inst}`);
        await release(page, NOTE[inst]);
        await ctx.close();
      }

if (SETS.includes('close'))
  for (const style of ['classic', 'vector'])
    for (const inst of ['horn', 'trumpet', 'trombone', 'oboe', 'flute'].filter((i) => !ONLY || ONLY.includes(i))) {
      const { ctx, page } = await open('zoom', '/' + inst, style, inst);
      await hold(page, NOTE[inst], 110);
      const box = await page.evaluate((inst) => {
        const pad = (b, p) => ({ x: Math.max(0, b.x0 - p), y: Math.max(0, b.y0 - p), width: b.x1 - b.x0 + 2 * p, height: b.y1 - b.y0 + 2 * p });
        if (inst === 'horn') {
          const d = window.__horn2d?.();
          return d && { mouth: pad(d.mouth, 30), bell: pad(d.bell, 12) };
        }
        if (inst === 'trombone') {
          const d = window.__trombone2d?.();
          return d && { mouth: pad(d.mouth, 30) };
        }
        if (inst === 'oboe') {
          const d = window.__oboe2d?.();
          return d && { mouth: { x: d.reed.x - 90, y: d.reed.y - 60, width: 180, height: 120 } };
        }
        return null;
      }, inst);
      if (box?.mouth) await shot(page, `close-${style}-${inst}-mouth`, box.mouth, 70);
      if (box?.bell) await shot(page, `close-${style}-${inst}-bell`, box.bell, 70);
      if (!box) await shot(page, `close-${style}-${inst}-stage`, undefined, 60);
      await release(page, NOTE[inst]);
      await ctx.close();
    }

if (SETS.includes('orchestra'))
  for (const dev of DEVS)
    for (const style of STYLES) {
      const view = style === 'classic' ? '2d' : style;
      const { ctx, page } = await open(dev, `/orchestra?v=1&seats=flute,oboe,horn,trumpet,trombone&view=${view}`, style);
      await page.waitForFunction(() => window.__orchestra?.ensemble?.parts?.length === 5 && window.__orchestra.ensemble.parts.every((p) => p.engine), null, { timeout: 30_000 });
      await page.waitForTimeout(800);
      await page.evaluate(() => {
        const ns = { flute: 76, oboe: 72, horn: 60, trumpet: 67, trombone: 48 };
        for (const p of window.__orchestra.ensemble.parts) if (ns[p.voice]) p.engine.noteOn(ns[p.voice], 100);
      });
      await page.waitForTimeout(1500);
      await shot(page, `orchestra-${dev}-${style}`);
      await ctx.close();
    }
await browser.close();
