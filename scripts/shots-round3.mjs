// Round-3 screenshots, desktop 1440×900 and phone 390×844, plus a count of the
// words visible on each page (the text-reduction measure).
//   BASE=http://localhost:4198 PREFIX=before node scripts/shots-round3.mjs
//   BASE=http://localhost:4199 PREFIX=after  node scripts/shots-round3.mjs
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.env.OUT ?? join(import.meta.dirname, '..', '.autopilot', 'round3', 'shots');
const BASE = process.env.BASE ?? 'http://localhost:4199';
const PREFIX = process.env.PREFIX ?? 'after';
const ONLY = process.env.ONLY?.split(',');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required'] });
const VIEW = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const words = {};

async function shot(name, { route = '', device = 'desktop', instrument = 'piano', notes = [], pedal = false, full = false, wait = 1400, action = null }) {
  if (ONLY && !ONLY.includes(name)) return;
  const ctx = await browser.newContext(VIEW[device]);
  await ctx.addInitScript((inst) => localStorage.setItem('piano-model.instrument', inst), instrument);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/${route ? `#/${route}` : ''}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  // words a visitor sees on the whole page (not just the viewport), before any interaction
  // prose words: the same, without chart text, tables, and the keyboard's key labels
  const w = await page.evaluate(() => {
    const wc = (t) => (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).length;
    const all = wc(document.body.innerText);
    let minus = 0;
    for (const el of document.querySelectorAll('svg text, table, .keyboard')) if (el.checkVisibility()) minus += wc(el instanceof HTMLElement ? el.innerText : el.textContent ?? '');
    return { all, prose: all - minus };
  });
  if (notes.length) {
    await page.evaluate(() => window.__piano.start());
    await page.waitForFunction(() => window.__piano?.piano, null, { timeout: 30000 });
    if (pedal) await page.evaluate(() => window.__piano.sustain(1));
    await page.evaluate(async (ns) => {
      for (const [m, v] of ns) {
        window.__piano.noteOn(m, v, 'keys');
        await new Promise((r) => setTimeout(r, 110));
      }
    }, notes);
  }
  if (action) await action(page);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: join(OUT, `${PREFIX}-${name}.png`), fullPage: full });
  words[name] = w;
  console.log(`${PREFIX}-${name}.png  words=${w.all} prose=${w.prose}${errors.length ? '  errors: ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

const SETS = {
  before: [
    ['desktop-play', { route: 'play', notes: [[48, 70], [55, 70], [60, 78], [64, 78], [67, 84]], pedal: true }],
    ['desktop-play-full', { route: 'play', full: true }],
    ['desktop-inside', { route: 'inside', notes: [[43, 96], [55, 80], [60, 92]], pedal: true, wait: 900 }],
    ['desktop-measurements', { route: 'measurements', wait: 2000 }],
    ['desktop-notes', { route: 'notes', wait: 600 }],
    ['phone-play', { route: 'play', device: 'phone', notes: [[60, 84], [64, 84], [67, 84]] }],
    ['phone-play-full', { route: 'play', device: 'phone', full: true }],
    ['phone-inside', { route: 'inside', device: 'phone', notes: [[60, 90]], wait: 900 }],
    ['phone-measurements', { route: 'measurements', device: 'phone', wait: 2000 }],
  ],
};
const set = SETS[PREFIX] ?? (await import(join(import.meta.dirname, 'shots-round3.sets.mjs'))).default;
for (const [name, o] of set) await shot(name, o);
writeFileSync(join(OUT, `${PREFIX}-words.json`), JSON.stringify(words, null, 1) + '\n');
await browser.close();
