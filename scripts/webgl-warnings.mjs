// Count what WebGL complains about while each instrument is shown in 3D: the browser's console
// messages (Chrome reports an invalid draw as "GL_INVALID_OPERATION: …" and stops after 256 of them
// per context) and `gl.getError()` polled once a frame (exact).
//   BASE=http://localhost:5311 [PHONE=1] [ONLY=grand,upright] [SECS=2.3] node scripts/webgl-warnings.mjs
// Prints one line per scene and a JSON summary; exits 1 if anything was reported.
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:5311';
const PHONE = process.env.PHONE === '1';
const ONLY = process.env.ONLY?.split(',');
const SECS = Number(process.env.SECS ?? 2.3);
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

/** [name, instrument, preset, close-up key, params, an Orchestra lineup] */
const SCENES = [
  ['grand', 'piano', 'grand', null],
  ['grand close-up', 'piano', 'grand', 60],
  ['grand lid shut', 'piano', 'grand', null, { lid: 0 }],
  ['upright', 'piano', 'upright', null],
  ['upright close-up', 'piano', 'upright', 60],
  ['violin', 'violin', null, null],
  ['viola', 'viola', null, null],
  ['cello', 'cello', null, null],
  ['flute', 'flute', null, null],
  ['oboe', 'oboe', null, null],
  ['clarinet', 'clarinet', null, null],
  ['bassoon', 'bassoon', null, null],
  ['horn', 'horn', null, null],
  ['horn orchestra', 'horn', null, null, null, ['violin', 'flute', 'clarinet', 'bassoon', 'horn', 'horn', 'cello']],
  ['trumpet', 'trumpet', null, null],
  ['tuba', 'tuba', null, null],
  ['harp', 'harp', null, null],
  ['harp orchestra', 'harp', null, null, null, ['violin', 'harp', 'flute', 'cello', 'horn']],
  ['tuba orchestra', 'tuba', null, null, null, ['violin', 'horn', 'trombone', 'tuba', 'cello']],
  ['trombone', 'trombone', null, null],
  ['trombone bass', 'trombone', null, null, { size: 2 }],
  ['trombone orchestra', 'trombone', null, null, null, ['violin', 'clarinet', 'horn', 'trombone', 'trombone', 'cello']],
  ['trombone quartet', 'trombone', null, null, null, ['trombone', 'trombone', 'trombone', 'trombone']],
  ['timpani', 'timpani', null, null],
  ['timpani orchestra', 'timpani', null, null, null, ['violin', 'violin', 'viola', 'cello', 'bass', 'timpani', 'timpani']],
];
const NOTE = { piano: 60, violin: 72, viola: 60, cello: 50, flute: 74, oboe: 62, clarinet: 55, bassoon: 41, horn: 66, trumpet: 67, trombone: 36, tuba: 29, harp: 55, timpani: 43 };

const out = {};
let total = 0;
for (const [name, inst, preset, key, params, lineup] of SCENES) {
  if (ONLY && !ONLY.includes(name.split(' ')[0])) continue;
  const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((i) => {
    localStorage.setItem('piano-model.instrument', i);
    localStorage.setItem('piano-model.3d', '1');
  }, inst);
  const page = await ctx.newPage();
  const msgs = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/webgl|GL_|GL ERROR|framebuffer/i.test(t)) msgs.push(t);
  });
  await page.goto(`${BASE}/`);
  await page.evaluate(async ([i, pr]) => {
    await window.__piano.start();
    await window.__piano.setInstrument(i);
    if (pr) {
      await window.__piano.setPreset(pr);
      document.querySelectorAll('.presets button').forEach((b) => b.textContent === pr && b.click());
    }
  }, [inst, preset]);
  const btn = page.locator('.dim-toggle');
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
  await page.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 15000 });
  if (params) {
    await page.evaluate((pa) => window.__piano.setParams(pa), params);
    await page.waitForTimeout(400);
  }
  if (key !== null) {
    await page.evaluate((k) => window.__stage3d.zoomTo(k), key);
    await page.waitForTimeout(1100);
  }
  if (lineup) {
    await page.locator('.ens-toggle').click();
    await page.evaluate((l) => window.__orchestra.ensemble.setLineup(l), lineup);
    await page.waitForTimeout(1200);
  }
  // from here: every frame's gl.getError(), a note sounding (the strings' glow is drawn too)
  const res = await page.evaluate(
    async ([secs, note]) => {
      const gl = window.__stage3d.r3.r.getContext();
      while (gl.getError()) {}
      let frames = 0;
      let errors = 0;
      const codes = {};
      window.__piano.noteOn(note, 100, 'keys');
      const t0 = performance.now();
      await new Promise((done) => {
        const tick = () => {
          frames++;
          for (let e = gl.getError(); e; e = gl.getError()) {
            errors++;
            codes[e] = (codes[e] ?? 0) + 1;
          }
          if (performance.now() - t0 < secs * 1000) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      });
      window.__piano.noteOff(note, 'keys');
      return { frames, glErrors: errors, codes, mirror: window.__stage3d.stats.mirror, zoomed: window.__stage3d.zoomed };
    },
    [SECS, NOTE[inst]],
  );
  const kinds = {};
  for (const m of msgs) {
    const k = m.replace(/^\[.*?\]\s*/, '').slice(0, 110);
    kinds[k] = (kinds[k] ?? 0) + 1;
  }
  out[name] = { ...res, console: msgs.length, kinds };
  total += msgs.length + res.glErrors;
  console.log(`${name.padEnd(18)} frames ${String(res.frames).padStart(4)}  console ${String(msgs.length).padStart(4)}  getError ${String(res.glErrors).padStart(4)}${res.mirror ? '  (lid mirror on)' : ''}${Object.keys(kinds).length ? `\n    ${Object.entries(kinds).map(([k, n]) => `${n}× ${k}`).join('\n    ')}` : ''}`);
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify({ base: BASE, phone: PHONE, total, scenes: out }));
process.exit(total ? 1 : 0);
