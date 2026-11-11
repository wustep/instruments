// The page's icons, all from one drawing (apps/web/public/favicon.svg: three keys, two sharps and a
// vermilion string on the stage's near-black, drawn on a 16 px grid so the smallest is crisp):
//   favicon.ico            16, 32 and 48 px (PNG entries), for browsers and tools that ask for /favicon.ico
//   apple-touch-icon.png   180 px, full bleed (iOS rounds it), the drawing at 5/8 of the square
// node scripts/icons.mjs        (Playwright's Chrome draws the SVG)
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PUB = join(import.meta.dirname, '..', 'apps', 'web', 'public');
const svg = readFileSync(join(PUB, 'favicon.svg'), 'utf8');
const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const GROUND = /<rect width="32" height="32" rx="7" fill="(#[0-9a-f]{6})"\/>/.exec(inner);
if (!GROUND) throw new Error('favicon.svg: the ground (a 32 × 32 rounded square) is not where this script expects it');
// the Apple icon: the same drawing without its rounded ground, on a square of the ground's colour
const apple = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 44 44"><rect x="-6" y="-6" width="44" height="44" fill="${GROUND[1]}"/>${inner.replace(GROUND[0], '')}</svg>`;

const browser = await chromium.launch({ channel: 'chrome' });
// (a page of its own per size: one page resized was photographed before it had been laid out again)
const png = async (markup, size) => {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`);
  const shot = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return shot;
};
const sizes = [16, 32, 48];
const pngs = [];
for (const s of sizes) pngs.push(await png(svg, s));
// ICO: a 6-byte header, a 16-byte entry per image, then the images (PNG, as every browser reads)
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let at = head.length;
sizes.forEach((s, i) => {
  const o = 6 + 16 * i;
  head.writeUInt8(s, o);
  head.writeUInt8(s, o + 1);
  head.writeUInt8(0, o + 2);
  head.writeUInt8(0, o + 3);
  head.writeUInt16LE(1, o + 4);
  head.writeUInt16LE(32, o + 6);
  head.writeUInt32LE(pngs[i].length, o + 8);
  head.writeUInt32LE(at, o + 12);
  at += pngs[i].length;
});
writeFileSync(join(PUB, 'favicon.ico'), Buffer.concat([head, ...pngs]));
writeFileSync(join(PUB, 'apple-touch-icon.png'), await png(apple, 180));
await browser.close();
console.log(`favicon.ico ${sizes.join('/')} px (${at} bytes), apple-touch-icon.png 180 px`);
