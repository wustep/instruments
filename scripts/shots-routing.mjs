// Orchestra routing, many to many: the routing UI and ensembles with the same instrument twice, in 2D
// and 3D, desktop and phone. TAG=before (main: the line chips and their one-instrument menu, the
// pieces as they were) or TAG=after (the routing grid; the quartet's tune doubled on a flute and a
// second cello on every line; La Réjouissance on two trumpets and two grands).
//   OUT=artifacts/realistic-3d/final-next5/orchestra-routing TAG=before|after BASE=http://localhost:5331 node scripts/shots-routing.mjs
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const ROOT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/orchestra-routing';
const TAG = process.env.TAG ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:5333';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const VIEWS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
mkdirSync(ROOT, { recursive: true });
const shot = (page, name) => page.screenshot({ path: `${ROOT}/${name}-${TAG}.png` });
const open = async (view, d3) => {
  const ctx = await browser.newContext(VIEWS[view]);
  await ctx.addInitScript(([d]) => {
    localStorage.setItem('piano-model.instrument', 'violin');
    localStorage.setItem('piano-model.3d', d ? '1' : '0');
  }, [d3]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(BASE + '/');
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    await window.__piano.start();
  });
  return { ctx, page };
};
const piece = async (page, i) => {
  await page.evaluate(async (k) => {
    await window.__orchestra.loadPiece(k);
  }, i);
  await page.waitForTimeout(1200);
};
/** the quartet's tune also on a flute, a second cello on every line (through the grid, as a hand would) */
const haydnDoubled = async (page) => {
  await page.locator('.pl-route').click();
  await page.locator('.pg-add').click();
  await page.locator('.pl-menu .pl-pick[data-voice="flute"]').click();
  await page.locator('.pg-cell[data-part="0"][data-line="0"]').click();
  await page.locator('.pg-add').click();
  await page.locator('.pl-menu .pl-pick[data-voice="cello"]').click();
  await page.locator('.pg-all[data-part="5"]').click();
};
/** La Réjouissance: a second trumpet on the tune, a second grand on the organ's two staves */
const handelDoubled = async (page) => {
  await page.locator('.pl-route').click();
  await page.locator('.pg-add').click();
  await page.locator('.pl-menu .pl-pick[data-voice="trumpet"]').click();
  await page.locator('.pg-cell[data-part="1"][data-line="0"]').click();
  await page.locator('.pg-add').click();
  await page.locator('.pl-menu .pl-pick[data-voice="grand"]').click();
  await page.locator('.pg-cell[data-part="3"][data-line="1"]').click();
  await page.locator('.pg-cell[data-part="3"][data-line="2"]').click();
};
/** the grid closed and nothing focused (a keyboard's focus ring is not part of the picture) */
const close = async (page) => {
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement?.blur());
};
const state = (page) => page.evaluate(() => { const e = window.__orchestra.ensemble; return { lineup: e.lineup, players: e.parts.map((p) => p.player), routes: e.plan.lines.map((rs) => rs.map((r) => r.part)) }; });

for (const view of Object.keys(VIEWS)) {
  // the routing UI
  {
    const { ctx, page } = await open(view, false);
    await piece(page, 0);
    if (TAG === 'before') {
      await page.locator('.pl-line').nth(0).click();
      await page.waitForTimeout(300);
      await shot(page, `${view}-routing`);
    } else {
      await page.locator('.pl-route').click();
      await page.waitForTimeout(300);
      await shot(page, `${view}-routing`);
      await close(page);
      await haydnDoubled(page);
      await page.waitForTimeout(400);
      await shot(page, `${view}-routing-doubled`);
      // a doubled line's chip: its instruments lit in its menu
      await close(page);
      await page.locator('.pl-line').nth(0).click();
      await page.waitForTimeout(300);
      await shot(page, `${view}-line-menu`);
      console.log(view, 'haydn', JSON.stringify(await state(page)));
    }
    await ctx.close();
  }
  // the stage with the same instrument twice (before: the pieces as they were)
  for (const d3 of [false, true]) {
    const dim = d3 ? '3d' : '2d';
    for (const [i, id, doubled] of [
      [0, 'haydn', haydnDoubled],
      [2, 'handel', handelDoubled],
    ]) {
      const { ctx, page } = await open(view, d3);
      await piece(page, i);
      if (TAG === 'after') {
        await doubled(page);
        await close(page);
        if (view === 'desktop' && d3) console.log(view, id, JSON.stringify(await state(page)), 'mirrors', await page.evaluate(() => window.__stage3d?.stats.mirrors));
      }
      await page.waitForTimeout(d3 ? 6000 : 3500);
      await shot(page, `${view}-${dim}-${id}`);
      await ctx.close();
    }
  }
}
await browser.close();
