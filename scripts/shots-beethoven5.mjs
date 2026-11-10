// Beethoven's Fifth in the Orchestra: its address (the preset) opened on a computer and a phone, in each of
// the three looks, seated and then playing the first movement a few seconds in; shot on two builds (before:
// production as it was, after: this one), with the lineup each one seated and what its engines cost.
//   BASE=http://localhost:4371 TAG=after OUT=artifacts/realistic-3d/final-symphony/beethoven-5 node scripts/shots-beethoven5.mjs
//   BASE=https://instruments-wustep.vercel.app TAG=before … (ONLY=desktop|phone, LOOKS=2d,vector,3d, PLAY=0)
// PNG at device pixels (sips makes the JPEGs kept in the repo); the measurements go to stdout as JSON.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SYMPHONY } from '../apps/web/test/presets.ts';

const BASE = process.env.BASE ?? 'http://localhost:4371';
const TAG = process.env.TAG ?? 'after';
const OUT = process.env.OUT ?? 'test-results/beethoven5';
const ONLY = process.env.ONLY ?? '';
const LOOKS = (process.env.LOOKS ?? '2d,vector,3d').split(',');
const PLAY = process.env.PLAY !== '0';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const report = {};
const shot = async (page, name) => {
  await page.evaluate(() => {
    document.querySelectorAll('.tip').forEach((t) => (t.hidden = true));
    document.activeElement?.blur?.();
  });
  await page.mouse.move(2, 2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}-${TAG}.png` });
};
const state = (page) =>
  page.evaluate(() => {
    const e = window.__orchestra?.ensemble;
    return {
      at: decodeURI(location.pathname + location.search),
      lineup: e?.lineup ?? null,
      engines: e?.parts.filter((p) => p.engine).length ?? 0,
      piece: e?.piece?.id ?? null,
      // each engine's share of the audio thread, as it reports it (per cent)
      load: e ? Math.round(e.parts.reduce((s, p) => s + (p.frame?.load ?? 0), 0) * 1000) / 10 : null,
    };
  });

for (const [dev, opts] of Object.entries(DEVS)) {
  if (ONLY && ONLY !== dev) continue;
  for (const look of LOOKS) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    const res = await page.goto(`${BASE}${SYMPHONY}&view=${look}`);
    await page.waitForTimeout(look === '3d' ? 2500 : 1200);
    const key = `${dev}-${look}`;
    await shot(page, `preset-${key}`);
    report[key] = { status: res?.status() ?? 0, seated: await state(page) };
    if (PLAY) {
      // the play icon: the piece that fits the lineup (the symphony's first movement)
      await page.getByRole('button', { name: /^Play/ }).first().click();
      await page.waitForFunction(() => (window.__orchestra?.ensemble?.parts ?? []).filter((p) => p.engine).length > 0, null, { timeout: 15000 }).catch(() => undefined);
      await page.waitForTimeout(9000);
      await shot(page, `playing-${key}`);
      report[key].playing = await state(page);
    }
    report[key].errors = errs.slice(0, 5);
    await ctx.close();
  }
}
console.log(JSON.stringify(report, null, 1));
await browser.close();
