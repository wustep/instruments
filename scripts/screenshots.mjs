// Capture settled UI screenshots into artifacts/shots/ (needs `pnpm build && pnpm preview --port 4199`).
//   node scripts/screenshots.mjs
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'artifacts', 'shots');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE ?? 'http://localhost:4199';
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });

async function shot(name, { route, instrument = 'piano', notes = [], pedal = false, phone = false, full = false, scroll = 0, wait = 1600 }) {
  const ctx = await browser.newContext(phone ? { ...devices['Pixel 7'] } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/#/${route}`);
  await page.evaluate(() => document.fonts.ready);
  if (notes.length || instrument !== 'piano') {
    await page.evaluate(() => window.__piano.start());
    await page.waitForFunction(() => window.__piano?.piano, null, { timeout: 30000 });
    if (instrument !== 'piano') await page.evaluate((id) => window.__piano.setInstrument(id), instrument);
    if (pedal) await page.evaluate(() => window.__piano.sustain(1));
    await page.evaluate(async (ns) => {
      for (const [m, v] of ns) {
        window.__piano.noteOn(m, v, 'keys');
        await new Promise((r) => setTimeout(r, 110));
      }
    }, notes);
  }
  if (scroll) await page.evaluate((y) => window.scrollTo(0, y), scroll);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: full });
  if (errors.length) console.log(name, 'errors:', errors);
  console.log(`${name}.png`);
  await ctx.close();
}

await shot('play-piano', { route: 'play', notes: [[48, 70], [55, 70], [60, 78], [64, 78], [67, 84]], pedal: true });
await shot('inside-piano', { route: 'inside', notes: [[43, 96], [55, 80], [60, 92]], pedal: true, wait: 900 });
await shot('play-violin', { route: 'play', instrument: 'violin', notes: [[62, 84], [69, 84]] });
await shot('inside-violin', { route: 'inside', instrument: 'violin', notes: [[62, 84], [69, 90]], wait: 1400 });
await shot('inside-cello', { route: 'inside', instrument: 'cello', notes: [[43, 90]], wait: 1400 });
await shot('inside-flute', { route: 'inside', instrument: 'flute', notes: [[79, 90]], wait: 1400 });
await shot('measurements', { route: 'measurements', wait: 2000 });
await shot('measurements-full', { route: 'measurements', full: true, wait: 2000 });
await shot('phone-play', { route: 'play', phone: true, notes: [[60, 84], [64, 84], [67, 84]] });
await shot('phone-inside-violin', { route: 'inside', phone: true, instrument: 'violin', notes: [[69, 90]], wait: 1400 });
await browser.close();
