// Orchestra mode, what the keys play: the same states shot on two builds (before: main without the
// picker; after: with it). Each state is the ensemble on the stage with a chord held by hand, so the
// picture shows which instruments took the keys.
//   BASE=http://localhost:4471 TAG=before OUT=artifacts/realistic-3d/final-next5/orch-keys node scripts/shots-orch-keys.mjs
// PNG at device pixels; scripts/shots-compress.py (or sips) makes the JPEGs kept in the repo.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4471';
const TAG = process.env.TAG ?? 'before';
const OUT = process.env.OUT ?? 'test-results/orch-keys';
const ONLY = process.env.ONLY ?? '';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal', '--enable-gpu'] });
const DEVS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const CHORD = [48, 60, 64, 67];

async function open(view, { d3 = false, vector = false } = {}) {
  const ctx = await browser.newContext(DEVS[view]);
  await ctx.addInitScript(([d, v]) => {
    localStorage.setItem('piano-model.instrument', 'piano');
    localStorage.setItem('piano-model.3d', d ? '1' : '0');
    localStorage.setItem('piano-model.style', v ? 'vector' : 'classic');
  }, [d3, vector]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(BASE + '/');
      break;
    } catch {
      /* the dev server reloads once */
    }
  }
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    await window.__piano.start();
  });
  return { ctx, page, errs };
}
const engines = (page) => page.waitForFunction(() => window.__orchestra.ensemble.parts.length && window.__orchestra.ensemble.parts.every((p) => p.engine && p.frame), null, { timeout: 20000 });
const has = async (page, sel) => (await page.locator(sel).count()) > 0;
/** a control of the keys' row (a phone opens it first); nothing on a build without it */
async function kf(page, sel) {
  if (!(await has(page, '.kf'))) return false;
  const t = page.locator('.kf-toggle');
  if ((await t.isVisible()) && (await t.getAttribute('aria-expanded')) !== 'true') await t.click();
  await page.locator(`.kf ${sel}`).click();
  return true;
}
const hold = (page, ms, src = 'keys') => page.evaluate(([ms, src]) => ms.forEach((m) => window.__piano.noteOn(m, 96, src)), [ms, src]);
const state = (page) =>
  page.evaluate(() => {
    const e = window.__orchestra.ensemble;
    return { lineup: e.lineup, keys: e.keys ?? null, held: e.parts.map((p) => [...p.down]), over: document.documentElement.scrollWidth - innerWidth };
  });
async function shot(page, name, clip) {
  const path = `${OUT}/${name}-${TAG}.png`;
  // (no tooltip left over from a click, no focus ring)
  await page.evaluate(() => {
    document.querySelector('.tip')?.setAttribute('hidden', '');
    document.activeElement?.blur?.();
  });
  await page.screenshot({ path, ...(clip ? { clip } : {}) });
  console.log(path, JSON.stringify(await state(page)));
}
/** the fallboard and a strip of the stage over it */
const fallClip = async (page) => {
  const b = await page.locator('.fallboard').boundingBox();
  const vw = page.viewportSize().width;
  return { x: 0, y: Math.max(0, b.y - 70), width: vw, height: b.height + 70 + 36 };
};

const runs = {
  // the quartet by hand, a C major chord held: before, dealt out one note each; after, on the first violin
  async quartet() {
    const { ctx, page, errs } = await open('desktop');
    await page.locator('.ens-toggle').click();
    await engines(page);
    await hold(page, CHORD);
    await page.waitForTimeout(700);
    await shot(page, 'desktop-quartet-chord');
    await shot(page, 'desktop-quartet-fallboard', await fallClip(page));
    console.log(errs);
    await ctx.close();
  },
  // flute and cello chosen together: one chord on both (after); the same lineup and chord before
  async several() {
    const { ctx, page, errs } = await open('desktop');
    await page.locator('.ens-toggle').click();
    await engines(page);
    await page.locator('.pick[aria-label="Flute"]').click();
    await engines(page);
    await kf(page, '.kf-part[data-voice="cello"]');
    await hold(page, CHORD, 'midi');
    await page.waitForTimeout(700);
    await shot(page, 'desktop-flute-cello-chord');
    await shot(page, 'desktop-flute-cello-fallboard', await fallClip(page));
    console.log(errs);
    await ctx.close();
  },
  // split: the old way, now a choice of its own
  async split() {
    const { ctx, page, errs } = await open('desktop');
    await page.locator('.ens-toggle').click();
    await engines(page);
    if (!(await kf(page, '.kf-split'))) return void (await ctx.close());
    await hold(page, CHORD);
    await page.waitForTimeout(700);
    await shot(page, 'desktop-split-chord');
    await shot(page, 'desktop-split-fallboard', await fallClip(page));
    console.log(errs);
    await ctx.close();
  },
  // Brandenburg No. 5's lineup in 3D (a grand among strings and a flute): the grand takes the keys
  async grand3d() {
    const { ctx, page, errs } = await open('desktop', { d3: true });
    await page.evaluate(async () => {
      await window.__orchestra.loadPiece(1);
    });
    await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
    await engines(page);
    await page.waitForTimeout(1500);
    await hold(page, CHORD);
    await page.waitForTimeout(900);
    await shot(page, 'desktop-3d-bach-chord');
    await shot(page, 'desktop-3d-bach-fallboard', await fallClip(page));
    console.log(errs);
    await ctx.close();
  },
  async vector() {
    const { ctx, page, errs } = await open('desktop', { vector: true });
    await page.locator('.ens-toggle').click();
    await engines(page);
    await kf(page, '.kf-part[data-voice="cello"]');
    await hold(page, CHORD);
    await page.waitForTimeout(700);
    await shot(page, 'desktop-vector-chord');
    await shot(page, 'desktop-vector-fallboard', await fallClip(page));
    console.log(errs);
    await ctx.close();
  },
  async phone() {
    const { ctx, page, errs } = await open('phone');
    await page.locator('.ens-toggle').click();
    await engines(page);
    await page.waitForTimeout(500);
    await shot(page, 'phone-quartet');
    if (await kf(page, '.kf-part[data-part="3"]')) {
      await page.waitForTimeout(300);
      await shot(page, 'phone-quartet-open');
    }
    console.log(errs);
    await ctx.close();
  },
  async landscape() {
    const { ctx, page, errs } = await open('landscape');
    await page.locator('.ens-toggle').click();
    await engines(page);
    await page.waitForTimeout(500);
    await shot(page, 'phone-landscape-quartet');
    if (await kf(page, '.kf-part[data-part="3"]')) {
      await page.waitForTimeout(300);
      await shot(page, 'phone-landscape-open');
    }
    console.log(errs);
    await ctx.close();
  },
};
for (const [k, fn] of Object.entries(runs)) if (!ONLY || ONLY.split(',').includes(k)) await fn();
await browser.close();
