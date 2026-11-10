// NEXT5 item 3, the phone play surface: the stage on a phone held upright (390×844), in 2D and 3D, on
// each instrument; the keys with what is over them, close up; a shorter page (390×664); the phone held
// sideways (844×390); and (TAG=after) the position strip in use: slid to the bass, and lit while a
// piece plays.
//   OUT=<raw dir> TAG=before|after BASE=http://localhost:4411 node scripts/shots-phone.mjs
//   python3 scripts/pairs-phone.py <raw dir> artifacts/realistic-3d/final-next5/3-phone
// (how much of the 3D stage each instrument takes: scripts/measure-phone-3d.mjs)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const ROOT = process.env.OUT ?? 'artifacts/realistic-3d/final-next5/3-phone/raw';
const TAG = process.env.TAG ?? 'after';
const BASE = process.env.BASE ?? 'http://localhost:4411';
const ONLY = process.env.ONLY ?? '';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
mkdirSync(ROOT, { recursive: true });
const open = async (d3, inst, preset, [W, H] = [390, 844]) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(([d, i]) => {
    localStorage.setItem('piano-model.instrument', i);
    localStorage.setItem('piano-model.3d', d ? '1' : '0');
  }, [d3, inst]);
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.waitForTimeout(600);
  if (preset === 'upright') await page.locator('.presets button', { hasText: 'upright' }).click();
  await page.waitForTimeout(d3 ? 2600 : 900);
  return { ctx, page };
};
const want = (name) => !ONLY || ONLY.split(',').some((o) => name.includes(o));
const shot = async (page, name, clip) => {
  await page.screenshot({ path: `${ROOT}/${name}-${TAG}.png`, ...(clip ? { clip } : {}) });
  console.log(`${name}-${TAG}`);
};
/** the fallboard and the keys (and what is between them) */
const dockClip = (page) =>
  page.evaluate(() => {
    const b = document.querySelector('.dock').getBoundingClientRect();
    return { x: 0, y: Math.max(0, b.top - 4), width: innerWidth, height: innerHeight - Math.max(0, b.top - 4) };
  });
const SETS = [
  ['grand', 'piano', 'grand'],
  ['upright', 'piano', 'upright'],
  ['cello', 'cello'],
  ['violin', 'violin'],
  ['viola', 'viola'],
  ['flute', 'flute'],
  ['trumpet', 'trumpet'],
];
for (const d3 of [false, true]) {
  for (const [name, inst, preset] of SETS) {
    const tag = `${d3 ? '3d' : '2d'}-${name}`;
    if (!want(tag)) continue;
    const { ctx, page } = await open(d3, inst, preset);
    await shot(page, `phone-${tag}`);
    if (!d3 && (name === 'grand' || name === 'cello')) await shot(page, `phone-keys-${name}`, await dockClip(page));
    await ctx.close();
  }
}
// a shorter page (390×664: an iPhone's Safari with its toolbars showing), where the 3D stage is under 300 px high
for (const [name, inst, preset] of [['grand', 'piano', 'grand'], ['upright', 'piano', 'upright'], ['cello', 'cello']]) {
  if (!want(`short-3d-${name}`)) continue;
  const { ctx, page } = await open(true, inst, preset, [390, 664]);
  await shot(page, `phone-short-3d-${name}`);
  await ctx.close();
}
// the phone held sideways
for (const [tag, d3, inst] of [['2d-grand', false, 'piano'], ['3d-cello', true, 'cello']]) {
  if (!want(`land-${tag}`)) continue;
  const { ctx, page } = await open(d3, inst, undefined, [844, 390]);
  await shot(page, `phone-land-${tag}`);
  await ctx.close();
}
if (TAG === 'after') {
  // the strip in use: a finger on its window, dragged to the bass end (the 2D grand's long strings
  // come into view with their keys)
  if (want('slid')) {
    const { ctx, page } = await open(false, 'piano', 'grand');
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const w = await page.evaluate(() => {
      const r = document.querySelector('.km-win').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await touch('touchStart', w.x, w.y);
    for (let i = 1; i <= 10; i++) await touch('touchMove', w.x - i * 14, w.y);
    await page.waitForTimeout(500);
    await shot(page, 'phone-2d-grand-slid');
    await shot(page, 'phone-keys-grand-slid', await dockClip(page));
    await touch('touchEnd');
    await ctx.close();
  }
  // a piece playing: its notes light on the strip, the ones off the screen's edge too
  for (const [tag, d3, inst] of [['2d-grand', false, 'piano'], ['3d-cello', true, 'cello']]) {
    if (!want(`${tag}-playing`)) continue;
    const { ctx, page } = await open(d3, inst);
    await page.locator('.player .pl-play').click();
    await page.waitForTimeout(d3 ? 7000 : 5200);
    await shot(page, `phone-${tag}-playing`);
    if (!d3) await shot(page, 'phone-keys-grand-playing', await dockClip(page));
    await ctx.close();
  }
  // the vector lines' strip
  if (want('vector')) {
    const { ctx, page } = await open(false, 'cello');
    await page.locator('.vec-toggle').click();
    await page.waitForTimeout(900);
    await shot(page, 'phone-keys-cello-vector', await dockClip(page));
    await ctx.close();
  }
}
await browser.close();
