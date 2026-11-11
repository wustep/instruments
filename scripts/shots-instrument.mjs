// One instrument alone on the stage, photographed: at rest and with notes held, in each look (2d, vector,
// 3d), on a computer (1440×900) and a phone (390×844), and (ORCH=1) seated in the Orchestra among others.
//   BASE=http://localhost:4331 OUT=artifacts/round3/tuba/shots ID=tuba NOTES=36,29,60 node scripts/shots-instrument.mjs
//   (TAG=before|after, LOOKS=2d,vector,3d, ONLY=desktop|phone, DSF=2, ORCH=1, WIDE=1 for 1920×1080)
// PNGs (sips makes the JPEGs kept in the repo); prints what each look's test hook says was drawn.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4331';
const OUT = process.env.OUT ?? 'test-results/shots';
const ID = process.env.ID ?? 'tuba';
const TAG = process.env.TAG ?? 'after';
const NOTES = (process.env.NOTES ?? '').split(',').filter(Boolean).map(Number);
const LOOKS = (process.env.LOOKS ?? '2d,vector,3d').split(',');
const ONLY = process.env.ONLY ?? '';
const DSF = Number(process.env.DSF ?? 1);
const HOLD = Number(process.env.HOLD ?? 900);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu', '--mute-audio'] });
const DEVS = {
  desktop: { viewport: process.env.WIDE ? { width: 1920, height: 1080 } : { width: 1440, height: 900 }, deviceScaleFactor: DSF },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: Math.max(2, DSF), isMobile: true, hasTouch: true },
};
const running = (page) => page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 30_000 });
const hook = (page, id) => page.evaluate((k) => { const f = window[`__${k}2d`]; const d = typeof f === 'function' ? f() : null; return d ? JSON.stringify(d, (_, v) => (typeof v === 'number' ? Math.round(v) : v)) : null; }, id);

for (const [dev, opts] of Object.entries(DEVS)) {
  if (ONLY && ONLY !== dev) continue;
  for (const look of LOOKS) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => (m.type() === 'error' || /WebGL|GL_/.test(m.text())) && errs.push(m.text().slice(0, 160)));
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
    await page.goto(`${BASE}/${process.env.ORCH ? `orchestra?v=1&seats=${process.env.ORCH}&` : `${ID}?`}view=${look}${process.env.QUERY ? `&${process.env.QUERY}` : ''}`);
    if (opts.hasTouch) await page.touchscreen.tap(195, 420);
    else await page.mouse.click(opts.viewport.width / 2, opts.viewport.height / 2);
    await running(page).catch(() => errs.push('audio not running'));
    await page.waitForTimeout(look === '3d' ? 2200 : 900);
    const shot = async (name) => {
      await page.evaluate(() => document.querySelectorAll('.tip').forEach((t) => (t.hidden = true)));
      await page.screenshot({ path: `${OUT}/${TAG}-${ID}-${dev}-${look}-${name}.png` });
      const d = look === '3d' ? null : await hook(page, ID);
      console.log(`${dev} ${look} ${name}${d ? ` ${d}` : ''}`);
    };
    await shot('rest');
    for (const m of NOTES) {
      await page.evaluate((n) => window.__piano.noteOn(n, 96, 'midi'), m);
      await page.waitForTimeout(HOLD);
      await shot(`n${m}`);
      await page.evaluate((n) => window.__piano.noteOff(n, 'midi'), m);
      await page.waitForTimeout(350);
    }
    if (errs.length) console.log(`  ! ${dev} ${look}: ${[...new Set(errs)].slice(0, 6).join(' | ')}`);
    await ctx.close();
  }
}
await browser.close();
