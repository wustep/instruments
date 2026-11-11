// The stage with less of the page round it: each scene as the page is, with keys=0 (no fallboard and no
// keys) and with ui=0 (the stage and nothing else), on a computer and a phone, in 2D, vector and 3D; one
// instrument and the orchestra. What each shot measured (the stage's box, the window, what is hidden)
// goes to stdout: the stage must reach the window's bottom with keys=0 and fill it with ui=0.
//   BASE=http://localhost:5199 OUT=test-results/stage-only node scripts/shots-stage-only.mjs
//   (ONLY=desktop|phone, SCENES=piano-2d,symphony-3d, MODES=,keys=0,ui=0)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:5199';
const OUT = process.env.OUT ?? 'test-results/stage-only';
const ONLY = process.env.ONLY ?? '';
const SCENES = (process.env.SCENES ?? '').split(',').filter(Boolean);
const MODES = (process.env.MODES ?? ',keys=0,ui=0').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
/** path, and the notes held for the picture (a piece's own address plays a moment of the piece instead) */
const scenes = {
  'piano-2d': ['/piano?view=2d', [48, 60, 64, 67]],
  'upright-2d': ['/piano/upright?view=2d', [48, 60, 64, 67]],
  'piano-vector': ['/piano?view=vector', [48, 60, 64, 67]],
  'piano-3d': ['/piano?view=3d', [48, 60, 64, 67]],
  'upright-3d': ['/piano/upright?view=3d', [48, 60, 64, 67]],
  'violin-2d': ['/violin?view=2d', [67]],
  'cello-3d': ['/cello?view=3d', [48]],
  'bass-2d': ['/bass?view=2d', [40]],
  'timpani-3d': ['/timpani?view=3d', [45]],
  'symphony-2d': ['/symphony?view=2d', null],
  'symphony-vector': ['/symphony?view=vector', null],
  'symphony-3d': ['/symphony?view=3d', null],
};
const report = [];
for (const [dev, opts] of Object.entries(DEVS)) {
  if (ONLY && ONLY !== dev) continue;
  for (const [name, [path, notes]] of Object.entries(scenes)) {
    if (SCENES.length && !SCENES.includes(name)) continue;
    for (const mode of MODES) {
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log(`pageerror ${name} ${mode}: ${e.message}`));
      await page.goto(`${BASE}${path}${mode ? `&${mode}` : ''}`);
      await page.evaluate(() => window.__piano.start());
      await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 30_000 });
      if (path.includes('view=3d')) await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 60_000 });
      if (notes) await page.evaluate((ns) => ns.forEach((m) => window.__piano.noteOn(m, 0.7, 'midi')), notes);
      else {
        // (the piece the address loaded, played from the page: the player may not be on the screen)
        await page.waitForFunction(() => window.__player?.loaded, null, { timeout: 30_000 });
        await page.evaluate(() => {
          window.__player.seek(60);
          window.__player.play();
        });
      }
      await page.waitForTimeout(notes ? 900 : 2500);
      const m = await page.evaluate(() => {
        const box = (q) => {
          const e = document.querySelector(q);
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return r.width && r.height ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null;
        };
        return { url: location.pathname + location.search, win: [innerWidth, innerHeight], stage: box('.stage'), bar: box('.top'), band: box('.stage-top'), player: box('.player'), dock: box('.dock'), scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], playing: !!window.__player?.playing };
      });
      const tag = mode ? mode.replace('=', '') : 'page';
      await page.screenshot({ path: `${OUT}/${dev}-${name}-${tag}.png` });
      report.push({ dev, name, mode: mode || '(page)', ...m });
      console.log(`${dev} ${name} ${mode || '(page)'}: stage ${m.stage} of ${m.win}; bar ${m.bar ? 'on' : 'off'}, band ${m.band ? 'on' : 'off'}, player ${m.player ? 'on' : 'off'}, keys ${m.dock ? 'on' : 'off'}; scroll ${m.scroll}; ${m.url}`);
      await ctx.close();
    }
  }
}
await browser.close();
