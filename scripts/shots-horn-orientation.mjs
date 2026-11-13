// The horn's orientation, photographed: the horn alone and seated among others (a brass quartet round
// it, and the bundled orchestras), in 2D, vector lines and 3D, on a computer and a phone. In 3D the
// seated horn is also taken from close, from the audience's side and from behind its player.
//   BASE=http://localhost:4733 OUT=artifacts/horn-orientation SET=before|after node scripts/shots-horn-orientation.mjs
//   (ONLY=desktop|phone, SCENES=solo,quartet,five,beethoven,symphony,passiton, LOOKS=2d,vector,3d)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4733';
const SET = process.env.SET ?? 'after';
const OUT = `${process.env.OUT ?? 'artifacts/horn-orientation'}/${SET}`;
const ONLY = process.env.ONLY ?? '';
const SCENES = (process.env.SCENES ?? '').split(',').filter(Boolean);
const LOOKS = (process.env.LOOKS ?? '2d,vector,3d').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const scenes = {
  solo: '/horn?',
  quartet: '/orchestra?v=1&seats=horn,trumpet,trombone,tuba&',
  five: '/orchestra?v=1&seats=flute,oboe,clarinet,bassoon,horn,violin,cello&',
  // (Beethoven's fifth's eighteen, two horns side by side)
  beethoven: '/orchestra?v=1&seats=flute,flute,oboe,oboe,clarinet,clarinet,bassoon,bassoon,horn,horn,trumpet,trumpet,timpani,violin,violin,viola,cello,cello,bass&',
  symphony: '/symphony?',
  passiton: '/passiton?',
};
/** the horn's seat in each lineup */
const HORN_SEAT = { quartet: 0, five: 4, beethoven: 8, symphony: 4, passiton: 4 };
for (const [dev, opts] of Object.entries(DEVS)) {
  if (ONLY && ONLY !== dev) continue;
  for (const [name, path] of Object.entries(scenes)) {
    if (SCENES.length && !SCENES.includes(name)) continue;
    for (const look of LOOKS) {
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.log(`pageerror ${name} ${look}: ${e.message}`));
      await page.goto(`${BASE}${path}view=${look}`);
      await page.evaluate(() => window.__piano.start());
      await page.waitForFunction(() => window.__piano?.status === 'running', null, { timeout: 30_000 });
      if (look === '3d') await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 60_000 });
      await page.waitForTimeout(look === '3d' ? 2500 : 1200);
      await page.locator('.stage').screenshot({ path: `${OUT}/${dev}-${name}-${look}.png` });
      if (look === '3d' && name !== 'solo' && dev === 'desktop') {
        // the horn's seat, from close: the audience's side, and behind the player
        const seats = await page.evaluate(() => window.__stage3d.seats());
        const horn = seats[HORN_SEAT[name]];
        for (const [tag, yaw] of [['front', 0], ['behind', Math.PI], ['left', -1.1], ['right', 1.1]]) {
          await page.evaluate(({ c, yaw }) => window.__stage3d.setView({ target: [c[0], c[1] + 1.0, c[2]], dist: 2.2, yaw, pitch: 0.2 }), { c: horn.c, yaw });
          await page.waitForTimeout(700);
          await page.locator('.stage').screenshot({ path: `${OUT}/${dev}-${name}-3d-horn-${tag}.png` });
        }
      }
      console.log(`${dev}-${name}-${look}`);
      await ctx.close();
    }
  }
}
await browser.close();
