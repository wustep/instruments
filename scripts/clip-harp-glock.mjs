// Short clips of the harp and the glockenspiel in 3D, the stage alone (ui=0), 1920×1080, the sound off (the
// picture is the point): the harp plucked (single strings, a chord from the bottom up, an arpeggio, a
// glissando: each pluck's mark where the engine's finger took the string, the ringing strings lit), first
// whole and then by its neck; the glockenspiel struck soft and hard (the mallets thrown back as hard as they
// struck), a low bar left to ring, a roll.
//   BASE=http://localhost:4312 OUT=<dir> node scripts/clip-harp-glock.mjs [harp|glock]   → <dir>/raw/<name>.webm
//   then: ffmpeg -i raw/<name>.webm -c:v libx264 -crf 20 -pix_fmt yuv420p -movflags +faststart <name>.part.mp4
import { chromium } from '@playwright/test';
import { mkdirSync, renameSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4312';
const OUT = process.env.OUT ?? 'artifacts/round3/harp-round';
const ONLY = process.argv[2];
mkdirSync(`${OUT}/raw`, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu', '--mute-audio'] });
const size = { width: 1920, height: 1080 };
const tools = (page) => ({
  on: (m, v, how = 'midi') => page.evaluate(([m, v, how]) => window.__piano.noteOn(m, v, how), [m, v, how]),
  off: (m) => page.evaluate((m) => window.__piano.noteOff(m, 'midi'), m),
  wait: (ms) => page.waitForTimeout(ms),
  view: (v) => page.evaluate((v) => window.__stage3d.setView({ ...v, dist: v.dist ? window.__stage3d.home.dist * v.dist : undefined }), v),
});
const CLIPS = {
  harp: {
    path: '/harp?view=3d&ui=0',
    act: async (page) => {
      const { on, off, wait, view } = tools(page);
      const all = new Set();
      const pluck = async (m, v, ms) => {
        all.add(m);
        await on(m, v);
        await wait(ms);
      };
      // single strings, soft to loud; a chord from the bottom up; an arpeggio up the compass
      for (const [m, v] of [[48, 60], [55, 72], [60, 84], [64, 96], [67, 104]]) await pluck(m, v, 420);
      await wait(500);
      for (const m of [36, 43, 52, 60, 67, 76]) await on(m, 92);
      await wait(1900);
      for (const m of [39, 46, 51, 55, 58, 63, 67, 70, 75, 79, 82, 87]) await pluck(m, 84, 140);
      await wait(900);
      // by the neck: the discs, the pins, the strings' tops; a glissando up and down (the white keys' strings)
      await view({ dist: 0.42, yaw: -0.35, pitch: 0.05, target: [-0.05, 1.45, 0] });
      await wait(1200);
      const whites = [];
      for (let m = 48; m <= 96; m++) if ([0, 2, 4, 5, 7, 9, 11].includes(m % 12)) whites.push(m);
      for (const m of whites) {
        await page.evaluate((m) => window.__piano.noteOn(m, 74, 'keys', true), m).catch(() => on(m, 74));
        await wait(42);
      }
      for (const m of whites.slice().reverse()) {
        await on(m, 66);
        await wait(42);
      }
      await wait(1500);
      await page.evaluate(() => window.__stage3d.resetView());
      await pluck(36, 110, 300);
      for (const m of [48, 55, 64, 72, 79]) await on(m, 96);
      await wait(2600);
      for (const m of [...all, ...whites, 36, 43, 52, 76, 72, 79]) await off(m);
    },
  },
  glock: {
    path: '/glockenspiel?view=3d&ui=0',
    view: { yaw: 0.26, pitch: 0.8, dist: 0.8 },
    act: async (page) => {
      const { on, off, wait, view } = tools(page);
      // a low bar left to ring, a tune over it growing from soft to loud (the mallets thrown back further)
      await on(79, 112);
      await wait(1300);
      const tune = [[91, 40], [95, 52], [98, 64], [103, 76], [98, 88], [95, 100], [91, 112], [96, 124]];
      for (const [m, v] of tune) {
        await on(m, v);
        await wait(330);
      }
      await wait(1400);
      // from the side: the mallets' swing about the hand; one bar struck again and again, soft and hard in turn
      await view({ yaw: 0.95, pitch: 0.22, dist: 0.6 });
      await wait(1200);
      for (let k = 0; k < 8; k++) {
        await on(k % 2 ? 88 : 84, k % 2 ? 44 : 118);
        await wait(300);
      }
      await wait(900);
      // a roll on a held key
      await page.evaluate(() => window.__piano.setParams({ roll: 0.6 }));
      await on(86, 90);
      await wait(2400);
      await off(86);
      await page.evaluate(() => window.__piano.setParams({ roll: 0 }));
      await wait(1800);
      for (const m of [79, 84, 88, ...tune.map(([m]) => m)]) await off(m);
    },
  },
};
for (const [name, c] of Object.entries(CLIPS)) {
  if (ONLY && ONLY !== name) continue;
  const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 1, recordVideo: { dir: `${OUT}/raw`, size } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${c.path}`);
  await page.evaluate(() => window.__piano.start());
  await page.waitForFunction(() => window.__piano?.status === 'running', null, { timeout: 30_000 });
  await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 60_000 });
  if (c.view)
    await page.evaluate((v) => {
      window.__stage3d.resetView();
      window.__stage3d.setView({ ...v, dist: window.__stage3d.home.dist * v.dist });
    }, c.view);
  await page.waitForTimeout(2000);
  const t0 = Date.now();
  await c.act(page);
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s of playing`);
  const video = page.video();
  await ctx.close();
  renameSync(await video.path(), `${OUT}/raw/${name}.webm`);
}
await browser.close();
