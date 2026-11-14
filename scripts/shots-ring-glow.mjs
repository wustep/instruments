// The struck instruments' ring glow in 3D (ui/gl/ring-glow.ts), photographed: the glockenspiel and the
// timpani alone, at rest, just struck, ringing on and nearly gone; a bar stopped by the hand; a timpani
// roll; and both seated in Pass It On's orchestra. Prints each picture's glow as the stage drew it.
//   BASE=http://localhost:4313 OUT=artifacts/ring-glow SET=before|after node scripts/shots-ring-glow.mjs
//   (ONLY=glock|timpani|orchestra)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4313';
const SET = process.env.SET ?? 'after';
const OUT = `${process.env.OUT ?? 'artifacts/ring-glow'}/${SET}`;
const ONLY = process.env.ONLY ?? '';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const open = async (path) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`pageerror ${path}: ${e.message}`));
  await page.goto(`${BASE}${path}`);
  await page.evaluate(() => window.__piano.start());
  await page.waitForFunction(() => window.__piano?.status === 'running', null, { timeout: 30_000 });
  await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 20, null, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  return { ctx, page };
};
const shot = async (page, name, what) => {
  await page.locator('.stage').screenshot({ path: `${OUT}/${name}.png` });
  const s = await page.evaluate(what);
  console.log(`${name}\t${s}`);
};
const glockState = () => {
  const s = window.__glock3d?.state();
  return s ? s.glow.map((g, i) => (g > 0 ? `${i}:${g.toFixed(2)}` : '')).filter(Boolean).join(' ') : '';
};
const timpState = () => {
  const s = window.__timpani3d?.pose?.() ?? null;
  return s?.glow ? s.glow.map((g) => g.toFixed(3)).join(' ') : '';
};

if (!ONLY || ONLY === 'glock') {
  const { ctx, page } = await open('/glockenspiel?view=3d');
  await page.evaluate(() => {
    window.__stage3d.resetView();
    window.__stage3d.setView({ yaw: 0.26, pitch: 0.8, dist: window.__stage3d.home.dist * 0.7 });
  });
  await page.waitForTimeout(800);
  await shot(page, 'glock-rest', glockState);
  // a low bar and a high one, struck together hard; then as they ring
  await page.evaluate(() => [79, 84, 101].forEach((m) => window.__piano.noteOn(m, 110, 'midi')));
  await page.waitForTimeout(120);
  await shot(page, 'glock-struck', glockState);
  await page.waitForTimeout(880);
  await shot(page, 'glock-1s', glockState);
  await page.waitForTimeout(2000);
  await shot(page, 'glock-3s', glockState);
  await page.waitForTimeout(3000);
  await shot(page, 'glock-6s', glockState);
  await page.evaluate(() => [79, 84, 101].forEach((m) => window.__piano.noteOff(m, 'midi')));
  // a soft stroke
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__piano.noteOn(88, 40, 'midi'));
  await page.waitForTimeout(150);
  await shot(page, 'glock-soft', glockState);
  await page.evaluate(() => window.__piano.noteOff(88, 'midi'));
  // the hand stops a bar
  await page.waitForTimeout(4000);
  await page.evaluate(() => window.__piano.setParams({ damp: 1 }));
  await page.evaluate(() => window.__piano.noteOn(84, 110, 'midi'));
  await page.waitForTimeout(250);
  await shot(page, 'glock-damp-held', glockState);
  await page.evaluate(() => window.__piano.noteOff(84, 'midi'));
  await page.waitForTimeout(200);
  await shot(page, 'glock-damp-stopped', glockState);
  await ctx.close();
}

if (!ONLY || ONLY === 'timpani') {
  const { ctx, page } = await open('/timpani?view=3d');
  await shot(page, 'timpani-rest', timpState);
  const note = [38, 43, 48, 53];
  await page.evaluate((m) => window.__piano.noteOn(m, 120, 'midi'), note[2] ?? 48);
  await page.waitForTimeout(120);
  await shot(page, 'timpani-struck', timpState);
  await page.waitForTimeout(880);
  await shot(page, 'timpani-1s', timpState);
  await page.waitForTimeout(2000);
  await shot(page, 'timpani-3s', timpState);
  await page.evaluate((m) => window.__piano.noteOff(m, 'midi'), note[2] ?? 48);
  // a roll, held two seconds
  await page.waitForTimeout(3000);
  await page.evaluate(() => window.__piano.setParams({ roll: 0.6 }));
  await page.evaluate((m) => window.__piano.noteOn(m, 90, 'midi'), note[1] ?? 45);
  await page.waitForTimeout(2000);
  await shot(page, 'timpani-roll-2s', timpState);
  await page.evaluate((m) => window.__piano.noteOff(m, 'midi'), note[1] ?? 45);
  await page.waitForTimeout(2500);
  await shot(page, 'timpani-roll-after', timpState);
  await ctx.close();
}

if (!ONLY || ONLY === 'orchestra') {
  const { ctx, page } = await open('/passiton?view=3d');
  await page.evaluate(() => window.__player.play());
  for (let k = 0; k < 10; k++) {
    await page.waitForTimeout(3000);
    await shot(page, `orchestra-${String(k).padStart(2, '0')}`, () => `${(window.__glock3d?.state()?.ringing ?? 0)} bars ringing`);
  }
  await page.evaluate(() => window.__player.pause());
  await ctx.close();
}
await browser.close();
