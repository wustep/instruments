// The audit's measurements, read from the running page: text contrast against what is behind it, the size of
// what a finger must find, sideways scroll, focus rings. Prints a table per page and size.
//   BASE=http://127.0.0.1:5393 node artifacts/ui-alt/audit-measure.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://127.0.0.1:5393';
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const PAGES = [
  ['/piano', async (p) => p.evaluate(() => [60, 64, 67].forEach((m) => window.__piano.noteOn(m, 0.7, 'midi')))],
  ['/piano?view=vector', null],
  ['/symphony', null],
  ['/notes', null],
  ['/measurements', null],
  ['/404.html', null],
];
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
for (const [dev, opts] of Object.entries(DEVS)) {
  for (const [path, act] of PAGES) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    if (await page.evaluate(() => !!window.__piano)) {
      await page.evaluate(() => window.__piano.start());
      await page.waitForFunction(() => window.__piano?.status === 'running', null, { timeout: 30_000 }).catch(() => {});
    }
    await page.waitForTimeout(1200);
    if (act) await act(page);
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const lum = ([r, g, b]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
      const parse = (s) => {
        const m = /rgba?\(([^)]+)\)/.exec(s);
        if (!m) return null;
        const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
        return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
      };
      const over = (top, a, under) => top.map((v, i) => v * a + under[i] * (1 - a));
      const GROUND = parse(getComputedStyle(document.documentElement).backgroundColor)?.c ?? [15, 19, 24];
      // what is behind an element: its ancestors' flat background colours, composited (gradients: their own
      // darkest reading is taken as the wall; an element with a background image is reported, not guessed)
      const behind = (el) => {
        const stack = [];
        let img = false;
        for (let e = el; e; e = e.parentElement) {
          const s = getComputedStyle(e);
          const b = parse(s.backgroundColor);
          if (b && b.a > 0) stack.push(b);
          if (s.backgroundImage !== 'none' && e !== document.body) img = true;
          if (b && b.a === 1) break;
        }
        let c = GROUND;
        for (const b of stack.reverse()) c = over(b.c, b.a, c);
        return { c, img };
      };
      const visible = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
        const s = getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
      };
      const low = [];
      const seen = new Set();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const t = n.textContent.trim();
        const el = n.parentElement;
        if (!t || !el || !visible(el) || el.closest('svg')) continue;
        const s = getComputedStyle(el);
        const fg = parse(s.color);
        if (!fg) continue;
        let op = 1;
        for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity);
        const bg = behind(el);
        const col = over(fg.c, fg.a * op, bg.c);
        const [a, b] = [lum(col), lum(bg.c)].sort((x, y) => y - x);
        const ratio = (a + 0.05) / (b + 0.05);
        const px = parseFloat(s.fontSize);
        const large = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) {
          const key = `${el.className}|${Math.round(ratio * 10)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          low.push(`${ratio.toFixed(2)}:1 ${px}px "${t.slice(0, 22)}" .${String(el.className).split(' ').join('.')}${bg.img ? ' (over an image)' : ''}${op < 1 ? ` (opacity ${op.toFixed(2)})` : ''}`);
        }
      }
      const small = [];
      const seenT = new Set();
      for (const el of document.querySelectorAll('button, a[href], [role="slider"], input, summary, label.knob')) {
        if (!visible(el) || el.disabled) continue;
        const r = el.getBoundingClientRect();
        if (r.width >= 44 && r.height >= 44) continue;
        const key = `${el.className}|${Math.round(r.width)}x${Math.round(r.height)}`;
        if (seenT.has(key)) continue;
        seenT.add(key);
        small.push(`${Math.round(r.width)}×${Math.round(r.height)} ${el.tagName.toLowerCase()}.${String(el.className).split(' ').join('.')}${r.width < 24 || r.height < 24 ? '  << under 24' : ''}`);
      }
      const tiny = [];
      const seenS = new Set();
      for (const el of document.querySelectorAll('body *')) {
        if (!visible(el) || el.closest('svg') || !el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < 11 && !seenS.has(el.className)) {
          seenS.add(el.className);
          tiny.push(`${px}px .${String(el.className).split(' ').join('.')}`);
        }
      }
      return { low, small, tiny, scrollX: document.documentElement.scrollWidth - innerWidth, tabs: document.querySelectorAll('button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])').length };
    });
    console.log(`\n=== ${dev} ${path}   sideways scroll ${r.scrollX}px, ${r.tabs} tab stops`);
    console.log(`  text under AA (${r.low.length}):`);
    r.low.slice(0, 30).forEach((l) => console.log('    ' + l));
    console.log(`  text under 11 px (${r.tiny.length}):`);
    r.tiny.slice(0, 20).forEach((l) => console.log('    ' + l));
    if (dev === 'phone') {
      console.log(`  targets under 44 px (${r.small.length}):`);
      r.small.slice(0, 40).forEach((l) => console.log('    ' + l));
    }
    await ctx.close();
  }
}
await browser.close();
