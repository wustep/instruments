// A look at the page while working on it: a few stills in one browser, one after another.
//   node artifacts/ui-alt/tools/look.mjs <out dir> <name>=<dev>:<path>[:<notes held, comma separated>|play|picker|idle] …
//   e.g.  look.mjs /tmp/x piano2d=desktop:/piano?view=2d:48,60,64,67  phone=phone:/cello?view=3d:50
// BASE (default http://localhost:4317). A path with a query keeps it; the notes are MIDI numbers.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4317';
const [out, ...shots] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  laptop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
  narrow: { viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  small: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu', '--mute-audio'] });
for (const spec of shots) {
  const eq = spec.indexOf('=');
  const name = spec.slice(0, eq);
  const [dev, ...rest] = spec.slice(eq + 1).split(':');
  // (the path may itself hold a colon only in its last part: the action)
  let path = rest.join(':');
  let act = '';
  const m = /^(.*):([^:/?=&]*)$/.exec(path);
  if (m && (/^[\d,]+$/.test(m[2]) || /^(play|picker|idle|sheet|knobs|hover-\w+|pieces|action|zoom|)$/.test(m[2]))) {
    path = m[1];
    act = m[2];
  }
  const ctx = await browser.newContext(DEVS[dev]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (c) => c.type() === 'error' && errs.push(`error: ${c.text().slice(0, 200)}`));
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const stage = await page.evaluate(() => !!window.__piano);
    if (stage && act !== 'idle') {
      await page.evaluate(() => window.__piano.start());
      await page.waitForFunction(() => window.__piano?.status === 'running' && window.__piano?.piano, null, { timeout: 40_000 });
    }
    if (/view=3d/.test(path)) await page.waitForFunction(() => window.__stage3d && window.__stage3d.stats.frames > 40, null, { timeout: 90_000 });
    if (/^[\d,]+$/.test(act)) {
      await page.evaluate((x) => x.forEach((n) => window.__piano.noteOn(n, 90, 'midi')), act.split(',').map(Number));
      await page.waitForTimeout(1200);
    } else if (act === 'play') {
      await page.waitForFunction(() => window.__player?.loaded, null, { timeout: 40_000 });
      await page.evaluate(() => {
        window.__player.seek(20);
        window.__player.play();
      });
      await page.waitForTimeout(3200);
    } else if (act === 'picker') {
      const b = page.locator('.pick-open');
      if (await b.isVisible()) await b.click();
      await page.waitForTimeout(400);
    } else if (act === 'knobs') {
      const b = page.locator('.knob-toggle');
      if (await b.isVisible()) await b.click();
      await page.waitForTimeout(300);
    } else if (act === 'pieces') {
      await page.locator('.pl-pieces').click();
      await page.waitForTimeout(400);
    } else if (act === 'sheet') {
      await page.locator('.pl-play').click();
      await page.waitForFunction(() => window.__player?.loaded, null, { timeout: 40_000 });
      await page.waitForTimeout(2500);
      await page.locator('.pl-sheet').click();
      await page.waitForSelector('.sheet svg', { timeout: 40_000 });
      await page.waitForTimeout(1500);
    } else if (act === 'action') {
      // the 2D piano's action close-up: a click on middle C's strings
      await page.evaluate(() => window.__piano.noteOn(60, 90, 'midi'));
      await page.waitForTimeout(500);
      const q = await page.evaluate(() => window.__piano2d().strings.find((x) => x.midi === 60));
      await page.mouse.click((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2);
      await page.waitForTimeout(1200);
    } else if (act === 'zoom') {
      // the 3D piano's: the camera flown to middle C's action
      await page.evaluate(() => window.__stage3d.zoomTo(60));
      await page.waitForTimeout(3500);
      await page.evaluate(() => window.__piano.noteOn(60, 90, 'midi'));
      await page.waitForTimeout(700);
    } else if (act.startsWith('hover-')) {
      await page.locator(`.${act.slice(6)}`).first().hover();
      await page.waitForTimeout(500);
    } else await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${name}.png` });
    const over = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.documentElement.scrollHeight, innerHeight]);
    console.log(`${name}${over[0] > over[1] ? `  !! SCROLL-X ${over[0]}>${over[1]}` : ''}${errs.length ? `  !! ${errs.join(' | ')}` : ''}`);
  } catch (e) {
    console.log(`${name}  !! FAILED ${String(e.message).split('\n')[0]}`);
  } finally {
    await ctx.close();
  }
}
await browser.close();
