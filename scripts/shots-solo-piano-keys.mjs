// The solo piano drawn flat with ui=0 keeps its keys: each scene photographed, and what it measured printed
// (the stage's box and the keys', what is hidden, and how far the strings in view stand from their keys'
// middles, the worst of them: the overstrung bass of the grand fans out from its keys, the rest are over
// them). Run against a preview of the build:
//   BASE=http://localhost:4199 OUT=artifacts/solo-piano-keys node scripts/shots-solo-piano-keys.mjs
//   (ONLY=desktop|phone; SHOTS='desktop|name|/path?query;phone|name|/path?query' for others)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4199';
const OUT = process.env.OUT ?? 'test-results/solo-piano-keys';
const ONLY = process.env.ONLY ?? '';
mkdirSync(OUT, { recursive: true });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const DEFAULT = [
  ['desktop', 'grand-2d-ui0-keys', '/piano?view=2d&ui=0'],
  ['desktop', 'grand-vector-ui0-keys', '/piano?view=vector&ui=0'],
  ['desktop', 'upright-2d-ui0-keys', '/piano/upright?view=2d&ui=0'],
  ['desktop', 'upright-vector-ui0-keys', '/piano/upright?view=vector&ui=0'],
  ['desktop', 'grand-2d-page', '/piano?view=2d'],
  ['desktop', 'grand-2d-ui0-keys0', '/piano?view=2d&ui=0&keys=0'],
  ['desktop', 'grand-3d-ui0', '/piano?view=3d&ui=0'],
  ['desktop', 'grand-3d-ui0-keys1', '/piano?view=3d&ui=0&keys=1'],
  ['phone', 'phone-grand-2d-ui0-keys', '/piano?view=2d&ui=0'],
  ['phone', 'phone-grand-vector-ui0-keys', '/piano?view=vector&ui=0'],
];
const shots = process.env.SHOTS ? process.env.SHOTS.split(';').filter(Boolean).map((s) => s.split('|')) : DEFAULT;
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
for (const [dev, name, url] of shots) {
  if (ONLY && ONLY !== dev) continue;
  const ctx = await browser.newContext(DEVS[dev]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`pageerror ${name}: ${e.message}`));
  await page.goto(`${BASE}${url}`);
  await page.evaluate(() => window.__piano.start());
  await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 30_000 });
  if (url.includes('view=3d')) await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 60_000 });
  // (a chord held for the picture: C3, and C4 E4 G4)
  await page.evaluate(() => [48, 60, 64, 67].forEach((m) => window.__piano.noteOn(m, 0.7, 'midi')));
  await page.waitForTimeout(900);
  const m = await page.evaluate(() => {
    const box = (q) => {
      const e = document.querySelector(q);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return r.width && r.height ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null;
    };
    const p = window.__piano2d?.();
    let worst = null;
    let n = 0;
    if (p)
      for (const s of p.strings) {
        const k = document.querySelector(`.keyboard .key[data-midi="${s.midi}"]`)?.getBoundingClientRect();
        if (!k || !k.width || k.right < 0 || k.left > innerWidth) continue;
        n++;
        const d = Math.abs((k.left + k.right) / 2 - s.x0);
        if (!worst || d > worst.d) worst = { midi: s.midi, d: Math.round(d * 10) / 10 };
      }
    return { url: location.pathname + location.search, win: [innerWidth, innerHeight], stage: box('.stage'), bar: box('.top'), band: box('.stage-top'), player: box('.player'), dock: box('.dock'), keys: box('.keyboard'), scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], stringsOverKeys: n, worst };
  });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${dev} ${name}: stage ${m.stage} of ${m.win}; bar ${m.bar ? 'on' : 'off'}, band ${m.band ? 'on' : 'off'}, player ${m.player ? 'on' : 'off'}, keys ${m.dock ? `on ${m.dock}` : 'off'}; scroll ${m.scroll}; strings over keys in view ${m.stringsOverKeys}, worst ${m.worst ? `${m.worst.d} px (${m.worst.midi})` : '-'}; ${m.url}`);
  await ctx.close();
}
await browser.close();
