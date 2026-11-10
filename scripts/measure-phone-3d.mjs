// NEXT5 item 3: how much of a phone's 3D stage each instrument takes, before and after its framing
// was made exact. Every vertex of the instrument is projected (`__stage3d.box()`), so the numbers
// are the instrument's own box, not the floor's glow.
//   BASE=http://localhost:4412 node scripts/measure-phone-3d.mjs [390x844 …]
// "before" is rebuilt in the same build: the stage as it was (no position strip, the 6 px the page
// used to overflow by, the file player's 28 px icons) and the camera the old rule gave, the scenes'
// own view stepped back by min(2.6, 1.4 / aspect) · 0.92 (· 1.28 for the winds, · 1.16 for the violin
// and viola). `SHOT=<dir>` also saves that picture, to lay over the real before screenshot.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE ?? 'http://localhost:4412';
const SIZES = (process.argv.slice(2).length ? process.argv.slice(2) : ['390x844']).map((s) => s.split('x').map(Number));
const SHOT = process.env.SHOT ?? '';
const LENS = Math.tan(0.3) / Math.tan((12 * Math.PI) / 180);
// (the pianos last: choosing one is a click, the click starts the sound, and from then on a bow rests
// where the engine left it, at one end of its stroke. Before that it lies across the strings at its
// middle, as in the screenshots: that is the pose measured)
const NAMES = ['cello', 'bass', 'violin', 'viola', 'flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'timpani', 'grand', 'upright'];
const TABLE = ['grand', 'upright', 'cello', 'bass', 'violin', 'viola', 'flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'timpani'];
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
if (SHOT) mkdirSync(SHOT, { recursive: true });
const init = () => {
  localStorage.setItem('piano-model.instrument', 'piano');
  localStorage.setItem('piano-model.3d', '1');
};
const show = async (page, name) => {
  await page.evaluate(async (n) => {
    if (n === 'grand' || n === 'upright') {
      await window.__piano.setInstrument('piano');
      document.querySelectorAll('.presets button')[n === 'grand' ? 0 : 1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    } else await window.__piano.setInstrument(n);
  }, name);
  await page.waitForTimeout(700);
};
const seen = (page) =>
  page.evaluate(async () => {
    const s = window.__stage3d;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    const b = s.box();
    const cv = s.el.getBoundingClientRect();
    return { w: cv.width, h: cv.height, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, over: document.querySelector('.player .pl-row').getBoundingClientRect().bottom - cv.top, home: s.home };
  });

// the scenes' own views, read off a wide stage (which keeps them)
const own = {};
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.waitForTimeout(1500);
  for (const name of NAMES) {
    await show(page, name);
    own[name] = (await seen(page)).home;
  }
  await ctx.close();
}
const pct = (v) => `${(100 * v).toFixed(0).padStart(3)} %`;
const row = (name, tag, v) => {
  const w = v.x1 - v.x0;
  const h = v.y1 - v.y0;
  const cut = v.x0 < -0.5 || v.x1 > v.w + 0.5 || v.y0 < -0.5 || v.y1 > v.h + 0.5;
  const under = v.y0 < v.over - 0.5 && v.x0 < v.w / 2 + 41 && v.x1 > v.w / 2 - 41;
  console.log(`  ${name.padEnd(8)} ${tag.padEnd(6)} stage ${v.w}×${v.h.toFixed(0)}  box ${w.toFixed(0).padStart(3)}×${h.toFixed(0).padStart(3)} px  height ${pct(h / v.h)}  width ${pct(w / v.w)}  area ${pct((w * h) / (v.w * v.h))}  camera ${v.home.dist.toFixed(2)} m${cut ? '  CUT OFF' : ''}${under ? '  top under the file player' : ''}`);
};
const phone = async (W, H) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(init);
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.waitForTimeout(1500);
  return { ctx, page };
};
for (const [W, H] of SIZES) {
  console.log(`== ${W}×${H}`);
  const after = {};
  const before = {};
  {
    const { ctx, page } = await phone(W, H);
    for (const name of NAMES) {
      await show(page, name);
      after[name] = await seen(page);
    }
    await ctx.close();
  }
  {
    // the stage as it was
    const { ctx, page } = await phone(W, H);
    await page.addStyleTag({ content: `:root{--pos-h:0px!important}.keymap{display:none!important}:root[data-route='stage'] main{height:calc(100dvh - 34px - var(--fall-h) - var(--kbd-h))!important}.pl-btn{width:28px!important;height:28px!important;padding:5px!important}` });
    await page.waitForTimeout(300);
    for (const name of NAMES) {
      await show(page, name);
      const v0 = await seen(page);
      const o = own[name];
      const narrow = v0.w / v0.h < 1.4;
      const step = narrow ? Math.min(2.6, 1.4 / Math.max(0.45, v0.w / v0.h)) * 0.92 * (name === 'flute' || name === 'oboe' || name === 'clarinet' || name === 'trumpet' || name === 'horn' ? 1.28 : name === 'violin' || name === 'viola' ? 1.16 : 1) : 1;
      await page.evaluate(([o, d]) => window.__stage3d.setView({ target: o.target, yaw: o.yaw, pitch: o.pitch, dist: d }), [o, (o.dist / LENS) * step]);
      before[name] = { ...(await seen(page)), home: { dist: o.dist * step } };
      if (SHOT) await page.screenshot({ path: `${SHOT}/rebuilt-before-${W}x${H}-${name}.png` });
    }
    await ctx.close();
  }
  for (const name of TABLE) {
    row(name, 'before', before[name]);
    row(name, 'after', after[name]);
  }
}
await browser.close();
