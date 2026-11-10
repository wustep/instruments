// The double bass in orchestra mode, 3D: a string quintet (two violins, viola, cello, bass) on the
// stage, desktop and phone, the stage's own framing; and the bass beside the cello for scale.
//   OUT=<dir> BASE=http://localhost:5394 [LINEUP=violin,violin,viola,cello,bass] [PHONE=1] node scripts/shots-bass-orchestra.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const OUT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/double-bass/3d';
const BASE = process.env.BASE ?? 'http://localhost:5394';
const LINEUPS = (process.env.LINEUP ? [process.env.LINEUP] : ['violin,violin,viola,cello,bass', 'cello,bass']).map((s) => s.split(','));
const PHONE = process.env.PHONE === '1';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
for (const lineup of LINEUPS) {
  const ctx = await browser.newContext(PHONE ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    localStorage.setItem('piano-model.instrument', 'cello');
    localStorage.setItem('piano-model.3d', '1');
    localStorage.setItem('piano-model.style', 'classic');
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => (m.type() === 'error' || /webgl|GL_[A-Z_]{4,}/i.test(m.text())) && errors.push(m.text()));
  await page.goto(BASE + '/');
  await page.waitForFunction(() => !!window.__stage3d && window.__stage3d.stats.frames > 3, null, { timeout: 30000 });
  await page.evaluate(() => window.__piano.start());
  await page.locator('.ens-toggle').click();
  await page.waitForTimeout(600);
  await page.evaluate((lu) => window.__orchestra.ensemble.setLineup(lu), lineup);
  await page.waitForTimeout(4000);
  const name = `${PHONE ? 'phone' : 'desktop'}-orchestra-${lineup.join('-')}`;
  await page.locator('.stage-3d').screenshot({ path: `${OUT}/${name}.png` });
  const box = await page.evaluate(() => {
    const s = window.__stage3d;
    const b = s.box();
    return { b: b && Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v)])), w: s.el.clientWidth, h: s.el.clientHeight, home: s.home };
  });
  console.log(name, JSON.stringify(box), errors.length ? 'ERRORS ' + errors.slice(0, 3).join(' | ') : '');
  await ctx.close();
}
await browser.close();
