// NEXT5 item 4: the grand's lid and the room in 3D, desktop and phone.
//   OUT=<dir> TAG=before|after BASE=http://localhost:5341 [PHONE=0|1] [ONLY=lid,room,…] node scripts/shots-lid-room.mjs
// Writes <OUT>/<desktop|phone>-<shot>-<TAG>.png (the 3D canvas): the grand with its lid at its three
// rests (1 on the long stick, 0.45 on the short one, 0 shut), the room at 0, the grand's 0.22 and 1 on
// the grand and on the cello (and 0.8 with a chord sounding), and the upright. The same parameters on
// both builds, so before and after compare.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/4-lid-room/raw';
const TAG = process.env.TAG ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:5341';
const ONLY = process.env.ONLY?.split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEV = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
/** shot → what is set: the instrument (grand, upright, cello), its params, notes sounding */
const SHOT = {
  'lid-100': { inst: 'grand', params: { lid: 1, room: 0.22 } },
  'lid-45': { inst: 'grand', params: { lid: 0.45, room: 0.22 } },
  'lid-0': { inst: 'grand', params: { lid: 0, room: 0.22 } },
  'room-0': { inst: 'grand', params: { lid: 1, room: 0 } },
  'room-100': { inst: 'grand', params: { lid: 1, room: 1 } },
  'room-played': { inst: 'grand', params: { lid: 1, room: 0.8 }, play: [48, 55, 64, 67], hold: 600 },
  'upright': { inst: 'upright', params: {} },
  'cello-room-0': { inst: 'cello', params: { room: 0 } },
  'cello-room-100': { inst: 'cello', params: { room: 1 } },
};
for (const dev of Object.keys(DEV)) {
  if (process.env.PHONE === '1' && dev !== 'phone') continue;
  if (process.env.PHONE === '0' && dev !== 'desktop') continue;
  for (const [shot, cfg] of Object.entries(SHOT)) {
    if (ONLY && !ONLY.some((o) => shot.startsWith(o))) continue;
    const ctx = await browser.newContext(DEV[dev]);
    await ctx.addInitScript(() => {
      localStorage.setItem('piano-model.instrument', 'piano');
      localStorage.setItem('piano-model.3d', '1');
    });
    const page = await ctx.newPage();
    const gl = [];
    page.on('console', (m) => /webgl|GL_/i.test(m.text()) && gl.push(m.text()));
    await page.goto(`${BASE}/`);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async (c) => {
      await window.__piano.start();
      if (c.inst === 'grand' || c.inst === 'upright') {
        await window.__piano.setPreset(c.inst);
        document.querySelectorAll('.presets button').forEach((b) => b.textContent === c.inst && b.click());
      } else await window.__piano.setInstrument(c.inst);
    }, cfg);
    await page.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 15000 });
    await page.waitForTimeout(600);
    await page.evaluate((p) => window.__piano.setParams(p), cfg.params);
    await page.waitForTimeout(700);
    if (cfg.play) {
      await page.evaluate((ns) => ns.forEach((m) => window.__piano.noteOn(m, 100, 'keys')), cfg.play);
      await page.waitForTimeout(cfg.hold);
    }
    const name = `${dev}-${shot}-${TAG}`;
    await page.locator('.stage-3d').screenshot({ path: `${OUT}/${name}.png` });
    const st = await page.evaluate(() => ({ ms: +window.__stage3d.stats.ms.toFixed(2), mirror: window.__stage3d.stats.mirror, lid: window.__piano.piano.params.lid, room: window.__piano.piano.params.room }));
    console.log(`${name.padEnd(30)} ${JSON.stringify(st)}  webgl messages ${gl.length}`);
    await ctx.close();
  }
}
await browser.close();
