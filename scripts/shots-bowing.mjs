// The bow, photographed: a bowed instrument alone (a held note, then its own piece playing) and the
// Orchestra (the string quintet with a dropped file, Beethoven's Fifth), in each look (2D classic, 2D
// vector, 3D), on a computer (1440×900 at 2×) and a phone (390×844 at 2×). Shot on two builds (before:
// main as it was; after: this one). Beside each whole picture of a single instrument in 2D, a close
// picture of the bow's contact (`…-contact-…`): the classic style's direction chevron, there before and
// gone after; the vector style's, there in both.
//   BASE=http://localhost:4391 TAG=after OUT=artifacts/realistic-3d/final-symphony/bowing/shots \
//     [FILE=.autopilot/fixtures/daylight.mid] [ONLY=desktop|phone] [LOOKS=2d,vector,3d] [SETS=held,piece,quintet,symphony] \
//     [CLIP=1] node scripts/shots-bowing.mjs
// FILE is read and never copied anywhere (a copyrighted score may be looked at with it, not shipped).
// CLIP=1 also records a few seconds of each playing stage as a .webm. PNG at device pixels (sips makes
// the JPEGs kept in the repo); what was on each stage goes to stdout as JSON.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { QUINTET, SYMPHONY } from '../apps/web/test/presets.ts';

const BASE = process.env.BASE ?? 'http://localhost:4391';
const TAG = process.env.TAG ?? 'after';
const OUT = process.env.OUT ?? 'test-results/bowing';
const FILE = process.env.FILE ?? '';
const ONLY = process.env.ONLY ?? '';
const LOOKS = (process.env.LOOKS ?? '2d,vector,3d').split(',');
const SETS = (process.env.SETS ?? 'held,piece,quintet,symphony').split(',');
const INSTS = (process.env.INSTS ?? 'violin,cello').split(',');
const CLIP = process.env.CLIP === '1';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const NOTE = { violin: 69, viola: 60, cello: 50, bass: 40 };
const report = {};

async function open(dev, look, path, name) {
  const ctx = await browser.newContext({ ...DEVS[dev], ...(CLIP && name ? { recordVideo: { dir: OUT, size: DEVS[dev].viewport } } : {}) });
  await ctx.addInitScript((v) => {
    localStorage.setItem('piano-model.3d', v === '3d' ? '1' : '0');
    localStorage.setItem('piano-model.style', v === 'vector' ? 'vector' : 'classic');
  }, look);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE + path + (path.includes('?') ? '&' : '?') + `view=${look}`);
  await page.waitForTimeout(look === '3d' ? 3000 : 1000);
  const close = async () => {
    const v = page.video();
    await ctx.close();
    if (v && name) renameSync(await v.path(), `${OUT}/${name}-${TAG}.webm`);
  };
  return { ctx, page, errs, close };
}
const tidy = async (page) => {
  await page.evaluate(() => {
    document.querySelectorAll('.tip').forEach((t) => (t.hidden = true));
    document.activeElement?.blur?.();
  });
  await page.mouse.move(2, 2);
};
const shot = async (page, name) => {
  await tidy(page);
  await page.screenshot({ path: `${OUT}/${name}-${TAG}.png` });
};
/** the bow as the engine has it (the single instrument's last visual frame, or each part's) */
const bows = async (page) => {
  await page.evaluate(() => {
    if (window.__bowSub || window.__orchestra?.ensemble?.active) return;
    window.__bowSub = window.__piano.piano?.onVisual((f) => (window.__bow = f.bow ?? null));
  });
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const r = (b) => (b ? { dir: b.dir, pos: Math.round(b.pos * 100) / 100, changing: b.changing, speed: Math.round(b.speed * 1000) / 1000 } : null);
    const e = window.__orchestra?.ensemble;
    if (e?.active) return e.parts.map((p) => (p.frame?.bow ? { voice: p.voice, ...r(p.frame.bow) } : null)).filter(Boolean);
    return [r(window.__bow ?? null)];
  });
};
/** a close picture of the contact on a single 2D stage: the middle of the bow as drawn (stage-draw's
 *  bowLine is not on the page, so: the stage canvas's centre band, where the bow crosses the strings) */
async function contact(page, name) {
  const box = await page.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].filter((x) => x.offsetWidth > 200).sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight)[0];
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await tidy(page);
  await page.screenshot({ path: `${OUT}/${name}-${TAG}.png`, clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
}

for (const dev of Object.keys(DEVS)) {
  if (ONLY && ONLY !== dev) continue;
  for (const look of LOOKS) {
    // ---- one instrument, a held note (the arrow or its absence)
    if (SETS.includes('held'))
      for (const inst of INSTS) {
        const { page, errs, close } = await open(dev, look, `/${inst}`);
        await page.evaluate(async () => {
          await window.__piano.start();
        });
        await page.waitForFunction(() => window.__piano?.status === 'running', null, { timeout: 30000 });
        await page.waitForTimeout(look === '3d' ? 2000 : 500);
        await page.evaluate((m) => window.__piano.noteOn(m, 96, 'keys'), NOTE[inst]);
        await page.waitForTimeout(1300);
        const key = `held-${inst}-${look}-${dev}`;
        await shot(page, key);
        if (look !== '3d') await contact(page, `${key}-stage`);
        report[key] = { bow: await bows(page), errors: errs.slice(0, 3) };
        await close();
        console.error(key);
      }
    // ---- one instrument playing its own piece
    if (SETS.includes('piece'))
      for (const inst of INSTS) {
        const key = `piece-${inst}-${look}-${dev}`;
        const { page, errs, close } = await open(dev, look, `/${inst}`, key);
        await page.getByRole('button', { name: /^Play/ }).first().click();
        await page.waitForFunction(() => window.__player?.playing, null, { timeout: 20000 }).catch(() => undefined);
        const seen = [];
        for (let i = 0; i < 3; i++) {
          await page.waitForTimeout(i ? 1700 : 4200);
          await shot(page, `${key}-${i + 1}`);
          seen.push(...(await bows(page)));
        }
        report[key] = { bow: seen, errors: errs.slice(0, 3) };
        await close();
        console.error(key);
      }
    // ---- the string quintet with a dropped file (Daylight: long notes)
    if (SETS.includes('quintet') && FILE && existsSync(FILE)) {
      const key = `quintet-${look}-${dev}`;
      const { page, errs, close } = await open(dev, look, QUINTET, key);
      await page.evaluate(async () => {
        await window.__piano.start();
      });
      await page.waitForFunction(() => window.__piano?.status === 'running', null, { timeout: 30000 });
      const b = [...readFileSync(FILE)];
      await page.evaluate((bytes) => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(bytes)], 'quintet.mid', { type: 'audio/midi' }));
        window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
        window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
      }, b);
      await page.waitForFunction(() => window.__orchestra.ensemble.parts.filter((p) => p.engine).length === 5, null, { timeout: 30000 });
      await page.waitForFunction(() => window.__player?.playing, null, { timeout: 20000 }).catch(() => undefined);
      const seen = [];
      for (let i = 0; i < 3; i++) {
        await page.waitForTimeout(i ? 3000 : 9000);
        await shot(page, `${key}-${i + 1}`);
        seen.push(await bows(page));
      }
      report[key] = { lineup: await page.evaluate(() => window.__orchestra.ensemble.lineup), bows: seen, errors: errs.slice(0, 3) };
      await close();
      console.error(key);
    }
    // ---- Beethoven's Fifth, the first movement
    if (SETS.includes('symphony')) {
      const key = `symphony-${look}-${dev}`;
      const { page, errs, close } = await open(dev, look, SYMPHONY, key);
      await page.getByRole('button', { name: /^Play/ }).first().click();
      await page.waitForFunction(() => (window.__orchestra?.ensemble?.parts ?? []).filter((p) => p.engine).length > 0 && window.__player?.playing, null, { timeout: 30000 }).catch(() => undefined);
      const seen = [];
      for (let i = 0; i < 2; i++) {
        await page.waitForTimeout(i ? 4000 : 9000);
        await shot(page, `${key}-${i + 1}`);
        seen.push(await bows(page));
      }
      report[key] = { engines: await page.evaluate(() => window.__orchestra.ensemble.parts.filter((p) => p.engine).length), bows: seen, errors: errs.slice(0, 3) };
      await close();
      console.error(key);
    }
  }
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
