// A short clip of the ring glow in 3D (ui/gl/ring-glow.ts): the glockenspiel played (strokes hard and soft,
// a low bar left to ring, a bar stopped by the hand), then the timpani (single strokes dying, a roll), the
// stage alone (ui=0), with sound off (the picture is the point; the glow follows the engine either way).
//   BASE=http://localhost:4313 OUT=<dir> node scripts/clip-ring-glow.mjs   → <dir>/ring-glow.webm
import { chromium } from '@playwright/test';
import { mkdirSync, renameSync, readdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4313';
const OUT = process.env.OUT ?? 'artifacts/ring-glow';
mkdirSync(`${OUT}/raw`, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const size = { width: 1920, height: 1080 };
for (const [name, path, act] of [
  [
    'glock',
    '/glockenspiel?view=3d&ui=0',
    async (page) => {
      const on = (m, v) => page.evaluate(([m, v]) => window.__piano.noteOn(m, v, 'midi'), [m, v]);
      const off = (m) => page.evaluate((m) => window.__piano.noteOff(m, 'midi'), m);
      const wait = (ms) => page.waitForTimeout(ms);
      // a low bar left to ring, a phrase above it, softer
      await on(79, 112);
      await wait(1400);
      for (const [m, v] of [[91, 80], [95, 70], [98, 76], [103, 64], [98, 58], [95, 52]]) {
        await on(m, v);
        await wait(260);
      }
      await wait(2200);
      // a bar stopped by the hand
      await page.evaluate(() => window.__piano.setParams({ damp: 1 }));
      await on(86, 110);
      await wait(500);
      await off(86);
      await wait(1500);
      await page.evaluate(() => window.__piano.setParams({ damp: 0 }));
      for (const m of [79, 91, 95, 98, 103]) await off(m);
      await wait(800);
    },
  ],
  [
    'timpani',
    '/timpani?view=3d&ui=0',
    async (page) => {
      const on = (m, v) => page.evaluate(([m, v]) => window.__piano.noteOn(m, v, 'midi'), [m, v]);
      const off = (m) => page.evaluate((m) => window.__piano.noteOff(m, 'midi'), m);
      const wait = (ms) => page.waitForTimeout(ms);
      await on(48, 120);
      await wait(1800);
      await off(48);
      await on(43, 80);
      await wait(900);
      await off(43);
      await on(38, 110);
      await wait(2200);
      await off(38);
      await page.evaluate(() => window.__piano.setParams({ roll: 0.6 }));
      await on(43, 96);
      await wait(2600);
      await off(43);
      await wait(2200);
    },
  ],
]) {
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: `${OUT}/raw`, size } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`);
  await page.evaluate(() => window.__piano.start());
  await page.waitForFunction(() => window.__piano?.status === 'running', null, { timeout: 30_000 });
  await page.evaluate(() => window.__piano.setParams?.({ volume: 0 }));
  await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 60_000 });
  if (name === 'glock')
    await page.evaluate(() => {
      window.__stage3d.resetView();
      window.__stage3d.setView({ yaw: 0.26, pitch: 0.8, dist: window.__stage3d.home.dist * 0.8 });
    });
  await page.waitForTimeout(2000);
  const t0 = Date.now();
  await act(page);
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s of playing`);
  const video = page.video();
  await ctx.close();
  renameSync(await video.path(), `${OUT}/raw/${name}.webm`);
}
await browser.close();
console.log(readdirSync(`${OUT}/raw`).join(' '));
