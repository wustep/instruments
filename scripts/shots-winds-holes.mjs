// The woodwinds' tone holes in 3D, close up, while a note is held: the flute's cups, the oboe's plates,
// the clarinet's rings and its plain hole, the bassoon's boot (a plain hole, a ring, two pads). Each
// picture is the stage alone (ui=0), from a view near the keywork, a second into a held note. `before`
// and `after` name the two sets of one change, taken from the same views, so they can be laid side by
// side.
//   node scripts/shots-winds-holes.mjs <base URL> <out dir> <before|after>
//   (ONLY=flute,oboe: some of them; FRAMES=16: how many frames are taken of each)
// Writes <out dir>/<instrument>-3d-holes-<tag>.png and, once both sets are there,
// <instrument>-3d-holes-diff.png: what `before` has over `after`, eight times as bright (black where the
// two are the same).
// A light on the keys that follows the sound changes from frame to frame (the bore's pressure as the
// engine last sent it, the breath's vibrato), so one picture may miss it. FRAMES pictures are taken of
// each instrument and the warmest is kept (the mean of red less blue over the picture: the stage is
// still, so only such a light moves it). Printed for each: the note and the breath, the warmth of the
// coolest and of the warmest frame (the same but for the picture's noise when nothing lights the keys),
// the most `before` has over `after` in any pixel (red, green, blue, of 255), and the page's WebGL
// errors (none are expected).
// Views are { yaw, pitch, dist, target } in the stage's units (window.__stage3d.setView), about the
// models' own points (winds3d.ts, oboe3d.ts, clarinet3d.ts, bassoon3d.ts). The bassoon is shot in a tall
// window: there it stands upright (scenes3d: BASSOON_WIDE), the pose its views are taken about.
// A dev server reloads the page when a source file changes under it: an instrument whose page went away
// is shot again (three tries).
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [BASE = 'http://localhost:5311', OUT = 'artifacts/winds-legato', TAG = 'after'] = process.argv.slice(2);
const ONLY = (process.env.ONLY ?? '').split(',').filter(Boolean);
const FRAMES = Number(process.env.FRAMES ?? 16);
mkdirSync(OUT, { recursive: true });

const SHOTS = {
  // G4: the cups above G down (two of them open-hole cups), the right hand's open
  flute: { note: 67, size: [960, 520], view: { yaw: 0.22, pitch: 0.5, dist: 0.16, target: [0.03, 0.172, 0.0] } },
  // D4: every plate down (L1–L3, R1–R3); the top joint's
  oboe: { note: 62, size: [960, 560], view: { yaw: -0.304, pitch: 0.38, dist: 0.115, target: [-0.078, 0.361, 0.07] } },
  // G3 concert (written A3): the left hand's rings and R1, R2 down, the plain hole under L3
  clarinet: { note: 55, size: [960, 560], view: { yaw: -0.304, pitch: 0.38, dist: 0.14, target: [-0.0534, 0.3418, 0.0543] } },
  // F2: both hands down; the boot from the fingers' side: R1's hole, R2's ring, the G and F keys' pads
  bassoon: { note: 41, size: [700, 860], view: { yaw: -0.6, pitch: 0.15, dist: 0.45, target: [0.04, 0.33, 0] } },
};

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
// the pictures are measured in a page of their own
const bench = await browser.newPage();
/** a picture's warmth: the mean over its pixels of red less blue (of 255) */
const warmth = (png) =>
  bench.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const g = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i] - d[i + 2];
    return s / (d.length / 4);
  }, png.toString('base64'));
/** what picture a has over picture b, `gain` times as bright (a PNG), and the most it has in any pixel */
const over = (a, b, gain) =>
  bench.evaluate(async ([a64, b64, k]) => {
    const px = async (b64) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext('2d');
      g.drawImage(bmp, 0, 0);
      return { c, g, im: g.getImageData(0, 0, bmp.width, bmp.height) };
    };
    const A = await px(a64);
    const B = await px(b64);
    if (A.im.width !== B.im.width || A.im.height !== B.im.height) return null;
    const most = [0, 0, 0];
    const d = A.im.data;
    for (let i = 0; i < d.length; i += 4) {
      for (let j = 0; j < 3; j++) {
        const v = Math.max(0, d[i + j] - B.im.data[i + j]);
        most[j] = Math.max(most[j], v);
        d[i + j] = Math.min(255, v * k);
      }
      d[i + 3] = 255;
    }
    A.g.putImageData(A.im, 0, 0);
    const buf = new Uint8Array(await (await A.c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { png: btoa(s), most };
  }, [a.toString('base64'), b.toString('base64'), gain]);

/** one instrument: its page, its note held, the warmest of FRAMES pictures */
async function shoot(id, s) {
  const ctx = await browser.newContext({ viewport: { width: s.size[0], height: s.size[1] }, deviceScaleFactor: 1 });
  try {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => (m.type() === 'error' || /webgl|GL_[A-Z_]{4,}/i.test(m.text())) && errors.push(m.text()));
    let loads = 0;
    page.on('load', () => loads++);
    await page.goto(`${BASE}/${id}?view=3d&ui=0`);
    await page.evaluate(() => window.__piano.start());
    await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 30_000 });
    await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 60_000 });
    await page.evaluate((v) => {
      window.__stage3d.resetView();
      window.__stage3d.setView(v);
      // (the engine's own frames, as the stage is given them: the note and the breath)
      window.__piano.piano.onVisual((f) => (window.__vf = f));
    }, s.view);
    await page.evaluate((m) => window.__piano.noteOn(m, 110, 'keys'), s.note);
    await page.waitForTimeout(1200);
    let best = null;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < FRAMES; i++) {
      const png = await page.screenshot({ type: 'png' });
      const w = await warmth(png);
      lo = Math.min(lo, w);
      if (w > hi) {
        hi = w;
        best = png;
      }
      await page.waitForTimeout(37);
    }
    const st = await page.evaluate(() => ({ midi: window.__vf?.focus?.midi ?? null, breath: +(window.__vf?.breath?.pressure ?? 0).toFixed(3) }));
    if (loads !== 1 || st.midi !== s.note || !(st.breath > 0.5)) throw new Error(`the page was reloaded or the note is not sounding (${JSON.stringify({ loads, ...st })})`);
    await page.evaluate((m) => window.__piano.noteOff(m, 'keys'), s.note);
    return { png: best, st, warmth: [+lo.toFixed(3), +hi.toFixed(3)], errors };
  } finally {
    await ctx.close();
  }
}

for (const [id, s] of Object.entries(SHOTS)) {
  if (ONLY.length && !ONLY.includes(id)) continue;
  let r = null;
  for (let attempt = 1; !r; attempt++) {
    try {
      r = await shoot(id, s);
    } catch (e) {
      if (attempt === 3) throw e;
      console.log(`${id}: again (${String(e.message ?? e).split('\n')[0]})`);
    }
  }
  const file = (tag) => join(OUT, `${id}-3d-holes-${tag}.png`);
  writeFileSync(file(TAG), r.png);
  let most = null;
  if (existsSync(file('before')) && existsSync(file('after'))) {
    const d = await over(readFileSync(file('before')), readFileSync(file('after')), 8);
    if (d) {
      writeFileSync(file('diff'), Buffer.from(d.png, 'base64'));
      most = d.most;
    }
  }
  console.log(file(TAG), `${(r.png.length / 1024).toFixed(0)} KB`, JSON.stringify({ ...r.st, warmth: r.warmth, ...(most ? { beforeOverAfter: most } : {}) }), r.errors.length ? `ERRORS ${r.errors.slice(0, 4).join(' | ')}` : 'no WebGL errors');
}
await browser.close();
