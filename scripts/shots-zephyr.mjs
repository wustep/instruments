// The zephyr, photographed: alone at rest and sounding (a chord held), in 2D, vector lines and 3D, on a
// computer and a phone; 3D also from other sides; and seated in an orchestra.
//   BASE=http://localhost:4316 OUT=artifacts/round3/zephyr node scripts/shots-zephyr.mjs
//   (ONLY=desktop|phone, LOOKS=2d,vector,3d, ORCH=0 to leave the orchestra out)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4316';
const OUT = process.env.OUT ?? 'artifacts/round3/zephyr';
const ONLY = process.env.ONLY ?? '';
const LOOKS = (process.env.LOOKS ?? '2d,vector,3d').split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const CHORD = [39, 51, 58, 63, 67, 74, 82];
for (const [dev, opts] of Object.entries(DEVS)) {
  if (ONLY && ONLY !== dev) continue;
  for (const look of LOOKS) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`pageerror ${look}: ${e.message}`));
    page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log(`console ${look}: ${m.text().slice(0, 200)}`));
    await page.goto(`${BASE}/zephyr?view=${look}`);
    await page.evaluate(() => window.__piano.start());
    await page.waitForFunction(() => window.__piano?.status === 'running', null, { timeout: 30_000 });
    if (look === '3d') await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 60_000 });
    await page.waitForTimeout(look === '3d' ? 2500 : 1200);
    await page.screenshot({ path: `${OUT}/${dev}-${look}-rest.png` });
    await page.evaluate((ch) => ch.forEach((m, i) => setTimeout(() => window.__piano.noteOn(m, 96, 'keys'), i * 40)), CHORD);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${dev}-${look}-sounding.png` });
    if (look === '3d' && dev === 'desktop') {
      const home = await page.evaluate(() => window.__stage3d.home);
      for (const [tag, v] of [['close', { dist: home.dist * 0.45, yaw: home.yaw + 0.25, pitch: 0.3 }], ['behind', { yaw: home.yaw + Math.PI, pitch: 0.2 }], ['side', { yaw: home.yaw + 1.2, pitch: 0.15 }], ['top', { yaw: home.yaw, pitch: 1.1 }]]) {
        await page.evaluate((v) => {
          window.__stage3d.resetView();
          window.__stage3d.setView(v);
        }, v);
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${OUT}/${dev}-3d-${tag}.png` });
      }
    }
    await page.evaluate((ch) => ch.forEach((m) => window.__piano.noteOff(m, 'keys')), CHORD);
    console.log(`${dev}-${look}`);
    await ctx.close();
  }
  if (process.env.ORCH === '0') continue;
  for (const look of LOOKS) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(`pageerror orchestra ${look}: ${e.message}`));
    await page.goto(`${BASE}/orchestra?v=1&seats=violin,violin,viola,cello,zephyr,flute&view=${look}`);
    await page.evaluate(() => window.__piano.start());
    await page.waitForTimeout(look === '3d' ? 4500 : 2000);
    await page.screenshot({ path: `${OUT}/${dev}-${look}-orchestra.png` });
    console.log(`${dev}-${look}-orchestra`);
    await ctx.close();
  }
}
await browser.close();
