// The four themes, photographed: the piano in 2D, in vector lines and in 3D, the Orchestra in 3D, and the
// two pages (their bar: "player", no lamp), each on a computer (1440 × 900) and a phone (390 × 844), under
// every theme. The same scenes on production are the "before" (it has one look and no theme to ask for):
//   BASE=http://localhost:4199 OUT=artifacts/themes/shots node scripts/shots-themes.mjs
//   BASE=https://instruments-wustep.vercel.app TAG=before THEMES=night-bench OUT=artifacts/themes/shots node scripts/shots-themes.mjs
// (THEMES, SCENES, DEVS: comma lists to take fewer.) A theme is asked for as a visitor's device would: its
// stored choice, before the page loads. Each shot waits for the page's type and, in 3D, for the stage to
// have drawn; page errors and console errors are printed with the shot's name. PNG, written to OUT as
// <tag>-<theme>-<scene>-<device>.png.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4199';
const OUT = process.env.OUT ?? 'artifacts/themes/shots';
const TAG = process.env.TAG ?? 'after';
const list = (v, all) => (v ? v.split(',').filter(Boolean) : all);
const THEMES = list(process.env.THEMES, ['night-bench', 'evening-hall', 'day-studio', 'night-gallery']);
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const DEVS = list(process.env.DEVS, Object.keys(DEVICES));
/** each scene: its address, and what is held while it is photographed */
const SCENES_ALL = {
  'piano-2d': { path: '/piano?view=2d', hold: [48, 60, 64, 67] },
  'piano-vector': { path: '/piano?view=vector', hold: [48, 60, 64, 67] },
  'piano-3d': { path: '/piano?view=3d', hold: [48, 60, 64, 67] },
  'violin-2d': { path: '/violin?view=2d', hold: [62] },
  'horn-3d': { path: '/horn?view=3d', hold: [53] },
  'orchestra-3d': { path: '/symphony?view=3d', hold: [] },
  notes: { path: '/notes', hold: [] },
  measurements: { path: '/measurements', hold: [] },
};
const SCENES = list(process.env.SCENES, ['piano-2d', 'piano-vector', 'piano-3d', 'orchestra-3d', 'notes', 'measurements']);
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const dev of DEVS) {
  for (const theme of THEMES) {
    const ctx = await browser.newContext(DEVICES[dev]);
    // (a build with no themes ignores the key: production, the "before")
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('piano-model.theme', t);
      } catch {}
    }, theme);
    for (const scene of SCENES) {
      const sc = SCENES_ALL[scene];
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(String(e)));
      page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
      await page.goto(BASE + sc.path, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const on = await page.evaluate(() => document.documentElement.dataset.theme ?? '(no themes)');
      if (sc.hold.length) {
        await page.evaluate(() => window.__piano.start());
        await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 30_000 }).catch(() => errs.push('the sound never started'));
      }
      if (sc.path.includes('view=3d')) await page.waitForFunction(() => (window.__stage3d?.stats?.frames ?? 0) > 8, null, { timeout: 30_000 }).catch(() => errs.push('3D never drew'));
      // (an orchestra's seats, a page's own chunk, a piece's file)
      await page.waitForTimeout(sc.path.includes('symphony') ? 2500 : 900);
      if (sc.hold.length) {
        await page.evaluate((ns) => ns.forEach((m, i) => setTimeout(() => window.__piano.noteOn(m, 0.7, 'midi'), 40 * i)), sc.hold);
        await page.waitForTimeout(650);
      }
      await page.evaluate(() => document.querySelectorAll('.tip').forEach((t) => (t.hidden = true)));
      const name = `${TAG}-${theme}-${scene}-${dev}`;
      await page.screenshot({ path: `${OUT}/${name}.png` });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (errs.length || over > 0) bad++;
      console.log(name, `theme on the page: ${on}`, over > 0 ? `WIDER THAN THE WINDOW by ${over}px` : '', errs.length ? `ERRORS ${JSON.stringify(errs.slice(0, 4))}` : '');
      await page.close();
    }
    await ctx.close();
  }
}
await browser.close();
if (bad) console.log(`${bad} shot(s) with errors or overflow`);
