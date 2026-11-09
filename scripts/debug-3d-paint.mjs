// Debug: dump the painted textures of the current 3D scene (window.__stage3d.r3) as PNGs.
//   BASE=http://localhost:5311 INST=violin OUT=<dir> node scripts/debug-3d-paint.mjs
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:5311';
const INST = process.env.INST ?? 'violin';
const OUT = process.env.OUT ?? '.';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
await ctx.addInitScript((i) => { localStorage.setItem('piano-model.instrument', i); localStorage.setItem('piano-model.3d', '1'); }, INST);
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + e));
await page.goto(BASE + '/');
await page.evaluate(async (i) => { await window.__piano.start(); await window.__piano.setInstrument(i); }, INST);
await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 5, null, { timeout: 15000 });
const out = await page.evaluate(() => {
  const res = [];
  window.__stage3d.r3.scene.traverse((o) => {
    if (!o.material) return;
    for (const m of [].concat(o.material)) if (m.map && m.map.image && m.map.image.toDataURL && !res.find((r) => r.id === m.uuid)) res.push({ id: m.uuid, w: m.map.image.width, h: m.map.image.height, url: m.map.image.toDataURL('image/png') });
  });
  return res;
});
out.forEach((t, i) => { writeFileSync(`${OUT}/paint-${i}.png`, Buffer.from(t.url.split(',')[1], 'base64')); console.log(i, t.w, t.h); });
console.log(logs.filter((l) => !l.startsWith('log')).slice(0, 10).join('\n'));
await browser.close();
