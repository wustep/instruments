// The Orchestra's seating, photographed: a few lineups (Beethoven's Fifth as its preset seats it, the same with
// three trombones, the Daylight quintet, a small mixed group with no violas or bassoons) opened by their address
// on a computer and a phone, in each of the three looks, seated (no piece playing). Shot on two builds (before:
// production as it was, after: this one); each shot's seat rectangles (2D) or seat columns (3D) printed as JSON.
//   BASE=http://localhost:4372 TAG=after OUT=test-results/seating node scripts/shots-seating.mjs
//   BASE=https://instruments-wustep.vercel.app TAG=before …   (ONLY=desktop|phone, LOOKS=2d,vector,3d, SETS=symphony,…)
// PNG at device pixels; scripts/pair-shots.py pairs them for the PR.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { QUINTET, SYMPHONY } from '../apps/web/test/presets.ts';

const BASE = process.env.BASE ?? 'http://localhost:4372';
const TAG = process.env.TAG ?? 'after';
const OUT = process.env.OUT ?? 'test-results/seating';
const ONLY = process.env.ONLY ?? '';
const LOOKS = (process.env.LOOKS ?? '2d,vector,3d').split(',');
const SYM_TB = SYMPHONY.replace('trumpet,trumpet,timpani', 'trumpet,trumpet,trombone,trombone,trombone,timpani').replace(/&lines=.*/, '');
const SETS = {
  symphony: SYMPHONY,
  trombones: SYM_TB,
  quintet: QUINTET,
  mixed: '/orchestra?v=1&seats=violin,flute,clarinet,horn,cello,trumpet,timpani',
};
const pick = (process.env.SETS ?? Object.keys(SETS).join(',')).split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const report = {};
for (const [dev, opts] of Object.entries(DEVS)) {
  if (ONLY && ONLY !== dev) continue;
  for (const set of pick) {
    for (const look of LOOKS) {
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
      const res = await page.goto(`${BASE}${SETS[set]}&view=${look}`);
      await page.waitForTimeout(look === '3d' ? 3500 : 1500);
      await page.evaluate(() => {
        document.querySelectorAll('.tip').forEach((t) => (t.hidden = true));
        document.activeElement?.blur?.();
      });
      await page.mouse.move(2, 2);
      await page.waitForTimeout(300);
      const name = `${set}-${dev}-${look}`;
      await page.screenshot({ path: `${OUT}/${name}-${TAG}.png` });
      const at = await page.evaluate(() => {
        const e = window.__orchestra?.ensemble;
        const f = window.__seatAt;
        return { lineup: e?.lineup ?? null, seats: f && e ? e.lineup.map((_, k) => f(k)?.map((v) => Math.round(v))) : null };
      });
      report[name] = { status: res?.status() ?? 0, ...at, errors: errs.slice(0, 3) };
      await ctx.close();
    }
  }
}
console.log(JSON.stringify(report));
await browser.close();
