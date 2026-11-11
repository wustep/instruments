// The Orchestra's fallboard row ("the keys play …": which players the keys on the screen, the computer's keys
// and a MIDI keyboard drive), photographed before and after a change to it:
//   BASE=https://instruments-wustep.vercel.app TAG=before OUT=artifacts/new3 node scripts/shots-keys-icon.mjs
// Writes keys-icon-<tag>.png (the row and the keys under it, a 1440 px window, the quartet), -wide.png (the
// whole page), -symphony.png (thirteen seats) and -phone.png (its button and its sheet), and prints the row.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4391';
const TAG = process.env.TAG ?? 'after';
const OUT = process.env.OUT ?? 'test-results/keys-icon';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

const row = (page) =>
  page.evaluate(() => {
    const kf = document.querySelector('.kf');
    const r = kf?.getBoundingClientRect();
    return {
      box: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null,
      children: [...(kf?.children ?? [])].map((c) => `${c.tagName.toLowerCase()}.${c.className}${c.getAttribute('aria-pressed') ? `[${c.getAttribute('aria-pressed')}]` : ''} "${c.getAttribute('data-tip') ?? ''}"`),
    };
  });

const shot = async (name, opts, path, phone = false) => {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`);
  await page.waitForSelector('.kf', { state: 'attached' });
  await page.waitForTimeout(1500);
  if (phone) await page.locator('.kf-toggle').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelectorAll('.tip').forEach((t) => (t.hidden = true)));
  const vp = page.viewportSize();
  const r = await row(page);
  console.log(name, JSON.stringify(r));
  if (name.endsWith('-wide') || phone || !r.box) await page.screenshot({ path: `${OUT}/${name}.png` });
  else {
    // the fallboard (the row's band, the whole width) and the top of the keys under it
    const y = Math.max(0, r.box[1] - 14);
    await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y, width: vp.width, height: Math.min(vp.height - y, r.box[3] + 90) } });
  }
  await ctx.close();
};

const desk = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
await shot(`keys-icon-${TAG}`, desk, '/orchestra');
await shot(`keys-icon-${TAG}-wide`, desk, '/orchestra');
await shot(`keys-icon-${TAG}-symphony`, desk, '/symphony');
await shot(`keys-icon-${TAG}-phone`, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, '/orchestra', true);
await browser.close();
