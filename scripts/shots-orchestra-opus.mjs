// The grand's lid in 3D, before and after its mirror draws the strings: a solo grand, the Brandenburg
// sextet and La Réjouissance (desktop: phones draw no mirror), each frame whole and the lid close up,
// then each pair stacked (before above). BEFORE and AFTER are two builds served side by side.
//   BEFORE=http://localhost:5352 AFTER=http://localhost:5351 OUT=artifacts/realistic-3d/final-next5/orchestra-opus node scripts/shots-orchestra-opus.mjs
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/orchestra-opus';
const BUILDS = { before: process.env.BEFORE ?? 'http://localhost:5352', after: process.env.AFTER ?? 'http://localhost:5351' };
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
/** what to show, and the lid's box on a 1440×900 stage (shown twice its size) */
const SCENES = [
  { name: 'grand', piece: -1, lid: [500, 130, 400, 200] },
  { name: 'bach', piece: 1, lid: [560, 180, 340, 120] },
  { name: 'handel', piece: 2, lid: [430, 170, 440, 160] },
];
const ff = (...a) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...a]);
for (const s of SCENES) {
  for (const [tag, base] of Object.entries(BUILDS)) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(([inst]) => {
      localStorage.setItem('piano-model.instrument', inst);
      localStorage.setItem('piano-model.3d', '1');
    }, [s.piece < 0 ? 'piano' : 'violin']);
    const page = await ctx.newPage();
    await page.goto(base + '/');
    await page.waitForTimeout(800);
    await page.evaluate(async () => {
      await window.__piano.start();
    });
    if (s.piece >= 0) await page.evaluate(async (k) => window.__orchestra.loadPiece(k), s.piece);
    // (a few seconds in: notes sounding, the strings moving)
    await page.waitForTimeout(3500);
    const png = `${OUT}/_${s.name}-${tag}.png`;
    await page.screenshot({ path: png });
    await ctx.close();
    ff('-i', png, '-q:v', '3', `${OUT}/desktop-3d-${s.name}-${tag}.jpg`);
    const [x, y, w, h] = s.lid;
    ff('-i', png, '-vf', `crop=${w}:${h}:${x}:${y},scale=${2 * w}:${2 * h}:flags=lanczos`, `${OUT}/_${s.name}-lid-${tag}.png`);
    rmSync(png);
  }
  ff('-i', `${OUT}/desktop-3d-${s.name}-before.jpg`, '-i', `${OUT}/desktop-3d-${s.name}-after.jpg`, '-filter_complex', 'vstack', '-q:v', '3', `${OUT}/before-after-desktop-3d-${s.name}.jpg`);
  ff('-i', `${OUT}/_${s.name}-lid-before.png`, '-i', `${OUT}/_${s.name}-lid-after.png`, '-filter_complex', 'vstack', '-q:v', '2', `${OUT}/before-after-lid-${s.name}.jpg`);
  for (const t of ['before', 'after']) rmSync(`${OUT}/_${s.name}-lid-${t}.png`);
}
await browser.close();
console.log(`wrote ${OUT}`);
