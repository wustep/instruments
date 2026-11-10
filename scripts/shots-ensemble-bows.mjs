// Orchestra 2D, the bows at their instruments' scale: the Daylight quintet's lineup (violin, violin,
// viola, cello, cello) on the 2D stage in both styles, the bows in the hand, a screenshot per view and
// each part's cell and drawn bow measured (from `__ens2d`, the hair's length in px); then every bow at
// both ends of its travel, the two frames' ink together (`-reach.png`, its box drawn over it) and the
// empty stage either side of it measured from the pixels.
//   BASE=https://instruments-wustep.vercel.app OUT=artifacts/.../before node scripts/shots-ensemble-bows.mjs
//   (LINEUP=violin,violin,viola,cello,cello  VIEWS=wide,laptop,phone  STYLES=vector,default  PLAY=2,3,4)
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:4199';
const OUT = process.env.OUT ?? 'test-results/ensemble-bows';
const LINEUP = (process.env.LINEUP ?? 'violin,violin,viola,cello,cello').split(',');
const VIEWS = (process.env.VIEWS ?? 'wide,laptop,phone').split(',');
const STYLES = (process.env.STYLES ?? 'vector,default').split(',');
// which parts hold their bows on the string (Stephen's shot: the viola and the two cellos)
const PLAY = (process.env.PLAY ?? '2,3,4').split(',').map(Number);
const POS = Number(process.env.POS ?? 0.5);
const DEVS = {
  // Stephen's window (4490×2804 at 2×, less Safari's bar)
  wide: { viewport: { width: 2245, height: 1350 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const report = {};
for (const view of VIEWS) {
  const ctx = await browser.newContext(DEVS[view]);
  await ctx.addInitScript(() => {
    localStorage.setItem('piano-model.instrument', 'violin');
    localStorage.setItem('piano-model.3d', '0');
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(BASE + '/');
  await page.waitForTimeout(600);
  await page.evaluate(async () => window.__piano.start());
  await page.waitForFunction(() => window.__piano?.status === 'running', null, { timeout: 30_000 });
  await page.locator('.ens-toggle').click();
  await page.waitForFunction(() => window.__orchestra.ensemble.lineup.length === 4, null, { timeout: 8000 });
  // the lineup from the picker: each instrument tapped in until the count is right
  const want = (v) => LINEUP.filter((x) => x === v).length;
  for (const v of ['violin', 'viola', 'cello', 'flute', 'trumpet', 'grand']) {
    for (let k = 0; k < 4; k++) {
      const have = await page.evaluate((v) => window.__orchestra.ensemble.lineup.filter((x) => x === v).length, v);
      if (have === want(v)) break;
      await page.locator(`.pick[aria-label="${v === 'grand' ? 'Piano' : v[0].toUpperCase() + v.slice(1)}"]`).click();
      await page.waitForTimeout(150);
    }
  }
  const lineup = await page.evaluate(() => window.__orchestra.ensemble.lineup);
  await page.waitForFunction((n) => window.__orchestra.ensemble.parts.filter((p) => p.frame).length === n, lineup.length, { timeout: 10_000 });
  report[view] = { lineup, styles: {} };
  for (const style of STYLES) {
    const isVec = await page.evaluate(() => document.documentElement.dataset.style === 'vector');
    if ((style === 'vector') !== isVec) {
      await page.locator('.vec-toggle').click();
      await page.waitForTimeout(200);
    }
    const shots = {};
    for (const pos of [0, 1, POS]) {
      await page.evaluate(
        ([play, pos]) =>
          window.__orchestra.ensemble.parts.forEach((p, i) => {
            if (!['violin', 'viola', 'cello'].includes(p.voice)) return;
            if (play.includes(i)) {
              p.engine.control(128, 0.25);
              p.engine.control(129, pos);
            } else p.engine.control(130, 0);
          }),
        [PLAY, pos],
      );
      await page.waitForTimeout(900);
      const m = await page.evaluate(() => {
        const cv = document.querySelector('.stage-cv').getBoundingClientRect();
        const top = document.querySelector('.stage-top')?.getBoundingClientRect().bottom ?? cv.top;
        const pl = document.querySelector('.player');
        const plB = pl && !pl.hidden ? pl.getBoundingClientRect().bottom : top;
        const parts = window.__ens2d();
        return {
          stage: { x: cv.left, y: cv.top, w: cv.width, h: cv.height, top, under: Math.max(top, plB) },
          parts: parts.map((p) => p && { voice: p.voice, cell: p.cell, bow: p.bow, bowPx: p.bow ? Math.hypot(p.bow.tx - p.bow.fx, p.bow.ty - p.bow.fy) : null }),
        };
      });
      shots[pos] = m;
      if (pos === POS) await page.screenshot({ path: `${OUT}-${view}-${style}.png` });
    }
    // every bow at both ends of its travel (all the strings playing): the two frames' ink together, its
    // box against the stage under the player (canvas px → CSS px), saved with the box and the stage's
    // middle drawn over it
    for (const pos of [0, 1]) {
      await page.evaluate((pos) => window.__orchestra.ensemble.parts.forEach((p) => {
        if (!['violin', 'viola', 'cello'].includes(p.voice)) return;
        p.engine.control(128, 0.25);
        p.engine.control(129, pos);
      }), pos);
      await page.waitForTimeout(1200);
      // (kept in the page: a frame is too large to carry out and back)
      await page.evaluate((k) => {
        const cv = document.querySelector('.stage-cv');
        const c2 = Object.assign(document.createElement('canvas'), { width: cv.width, height: cv.height }).getContext('2d', { willReadFrequently: true });
        c2.drawImage(cv, 0, 0);
        (window.__reachFrames ??= [])[k] = c2.getImageData(0, 0, cv.width, cv.height).data;
      }, pos);
    }
    const reach = await page.evaluate(() => {
      const [a, b] = window.__reachFrames;
      const cv = document.querySelector('.stage-cv');
      const r = cv.getBoundingClientRect();
      const k = cv.width / r.width;
      const top = document.querySelector('.stage-top').getBoundingClientRect().bottom;
      const pl = document.querySelector('.player');
      const under = pl && !pl.hidden ? Math.max(top, pl.getBoundingClientRect().bottom) : top;
      const out = Object.assign(document.createElement('canvas'), { width: cv.width, height: cv.height });
      const c = out.getContext('2d');
      const img = c.createImageData(cv.width, cv.height);
      for (let i = 0; i < a.length; i++) img.data[i] = Math.max(a[i], b[i]);
      c.putImageData(img, 0, 0);
      // the region: under the player, inside the stage (a few px in from its edges)
      const X0 = Math.ceil((r.left + 4 - r.left) * k), X1 = Math.floor((r.width - 4) * k);
      const Y0 = Math.ceil((under + 3 - r.top) * k), Y1 = Math.floor((r.height - 4) * k);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let y = Y0; y < Y1; y++)
        for (let x = X0; x < X1; x++) {
          const i = 4 * (y * cv.width + x);
          if (img.data[i + 3] > 60 && Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) > 70) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      c.fillStyle = '#000';
      c.globalCompositeOperation = 'destination-over';
      c.fillRect(0, 0, out.width, out.height);
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = 'rgba(255,179,64,0.9)';
      c.lineWidth = 1.5 * k;
      c.strokeRect(x0, y0, x1 - x0, y1 - y0);
      c.setLineDash([6 * k, 6 * k]);
      c.strokeStyle = 'rgba(255,255,255,0.5)';
      c.beginPath();
      c.moveTo((X0 + X1) / 2, Y0);
      c.lineTo((X0 + X1) / 2, Y1);
      c.moveTo(X0, (Y0 + Y1) / 2);
      c.lineTo(X1, (Y0 + Y1) / 2);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.25)';
      c.setLineDash([]);
      c.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
      return { left: (x0 - X0) / k, right: (X1 - x1) / k, top: (y0 - Y0) / k, bottom: (Y1 - y1) / k, png: out.toDataURL('image/png') };
    });
    writeFileSync(`${OUT}-${view}-${style}-reach.png`, Buffer.from(reach.png.split(',')[1], 'base64'));
    delete reach.png;
    shots.reach = reach;
    report[view].styles[style] = shots;
  }
  report[view].errors = errs;
  await ctx.close();
}
await browser.close();
writeFileSync(`${OUT}.json`, JSON.stringify(report, null, 1));
// a summary: each bow's drawn length (px) and its cell; the stage left either side of the bodies + bows
for (const [view, r] of Object.entries(report)) {
  console.log(`\n${view}: ${r.lineup.join(' ')}${r.errors.length ? `  errors: ${r.errors.join('; ')}` : ''}`);
  for (const [style, shots] of Object.entries(r.styles)) {
    const m = shots[POS];
    const q = shots.reach;
    console.log(`  ${style}: every bow at both ends of its travel, the stage left empty: left ${q.left.toFixed(0)} px, right ${q.right.toFixed(0)} px, top ${q.top.toFixed(0)} px, bottom ${q.bottom.toFixed(0)} px`);
    for (const p of m.parts) if (p) console.log(`    ${p.voice.padEnd(7)} cell ${p.cell.w}×${p.cell.h} at ${p.cell.x.toFixed(0)},${p.cell.y.toFixed(0)}  bow ${p.bowPx ? p.bowPx.toFixed(0) + ' px' : '—'}`);
  }
}
