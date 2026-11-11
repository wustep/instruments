// The polish pass before the launch: defects found by looking at every view on a computer, a narrow
// laptop and a phone (upright and sideways), each fixed and held here.
import { test, expect, type Page } from '@playwright/test';

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};
async function startAudio(page: Page) {
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
}
const box = (page: Page, sel: string) =>
  page.evaluate((q) => {
    const r = document.querySelector(q)!.getBoundingClientRect();
    return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, w: r.width, h: r.height };
  }, sel);

test('2D with a piece playing: the room’s knob is never under the file player (a phone: a tap on it opened the file picker)', async ({ page }) => {
  const errors = collectErrors(page);
  for (const view of ['2d', 'vector']) {
    await page.goto(`/piano?view=${view}`);
    await startAudio(page);
    await page.evaluate(() => (window as any).__player.loadDemo('piano'));
    await expect.poll(() => page.evaluate(() => (window as any).__player.playing)).toBe(true);
    await page.waitForTimeout(400);
    const k = await box(page, '.knob-room');
    const pl = await box(page, '.player');
    // what a tap in the knob's middle, and near each of its edges, reaches
    for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5], [0.5, 0.2], [0.5, 0.8]]) {
      const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.knob-room'), [k.x0 + fx * k.w, k.y0 + fy * k.h]);
      expect(hit, `${view}: the knob at ${fx}, ${fy} of its box (knob ${Math.round(k.x0)},${Math.round(k.y0)}; player to ${Math.round(pl.x1)},${Math.round(pl.y1)})`).toBe(true);
    }
    // and it is still inside the stage
    const st = await box(page, '.stage');
    expect(k.x1).toBeLessThanOrEqual(st.x1);
    expect(k.y1).toBeLessThan(st.y1);
    await page.evaluate(() => (window as any).__player.pause());
  }
  expect(errors).toEqual([]);
});

test('the pieces menu: every piece inside it and inside the window, its instruments inside each row (a phone held sideways too)', async ({ page }, info) => {
  const errors = collectErrors(page);
  const sizes = info.project.name === 'phone' ? [null, { width: 844, height: 390 }] : [null, { width: 1100, height: 520 }];
  for (const size of sizes) {
    if (size) await page.setViewportSize(size);
    await page.goto('/piano?view=2d');
    await page.locator('.pl-pieces, [aria-label="Pieces"]').first().click();
    const m = page.locator('.score-menu');
    await expect(m).toBeVisible();
    const g = await page.evaluate(() => {
      const menu = document.querySelector('.score-menu') as HTMLElement;
      const r = menu.getBoundingClientRect();
      const items = [...menu.querySelectorAll<HTMLElement>('.sm-item')];
      return {
        y1: r.bottom,
        x0: r.left,
        x1: r.right,
        vh: innerHeight,
        vw: innerWidth,
        scrolls: menu.scrollHeight > menu.clientHeight + 1,
        over: items.map((it) => it.scrollWidth - it.clientWidth),
        glyphs: items.map((it) => Math.max(...[...it.querySelectorAll('svg')].map((s) => s.getBoundingClientRect().right), 0) - it.getBoundingClientRect().right),
        credit: (menu.querySelector('.sm-credit') as HTMLElement).getBoundingClientRect().height,
        n: items.length,
      };
    });
    const what = size ? `${size.width}×${size.height}` : 'as the device';
    expect(g.y1, `${what}: the menu's bottom`).toBeLessThanOrEqual(g.vh);
    expect(g.x0, what).toBeGreaterThanOrEqual(0);
    expect(g.x1, what).toBeLessThanOrEqual(g.vw);
    // no row wider than its item, no instrument past its row's end
    for (let i = 0; i < g.n; i++) {
      expect(g.over[i], `${what}: row ${i} overflows`).toBeLessThanOrEqual(0);
      expect(g.glyphs[i], `${what}: row ${i}'s instruments`).toBeLessThanOrEqual(0.5);
    }
    // its credit is one line
    expect(g.credit, what).toBeLessThan(26);
    // the last piece can be reached: brought into view inside the menu, it is inside the window
    const last = m.locator('.sm-item').last();
    await last.scrollIntoViewIfNeeded();
    const lb = await last.boundingBox();
    expect(lb!.y + lb!.height, `${what}: the last piece`).toBeLessThanOrEqual(g.vh);
    expect(lb!.y, what).toBeGreaterThanOrEqual(0);
    await page.keyboard.press('Escape');
  }
  expect(errors).toEqual([]);
});

test('vector lines on a phone: the symphony’s thirteen lines sit in one row, as in 2D', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'a phone’s width');
  const errors = collectErrors(page);
  const rows = async (view: string) => {
    await page.goto(`/symphony?view=${view}`);
    await expect.poll(() => page.locator('.pl-lines .pl-line').count(), { timeout: 20_000 }).toBe(13);
    await page.waitForTimeout(300);
    return page.evaluate(() => [...new Set([...document.querySelectorAll('.pl-lines .pl-line')].map((c) => Math.round(c.getBoundingClientRect().top)))].length);
  };
  expect(await rows('2d')).toBe(1);
  expect(await rows('vector')).toBe(1);
  expect(errors).toEqual([]);
});

test('Measurements on a phone: one chart to a row, wide enough to read; the page does not scroll sideways', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'a phone’s width');
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await page.goto('/measurements');
  await expect(page.getByRole('heading', { name: 'Strings, woodwinds and brass against recordings' })).toBeVisible({ timeout: 20_000 });
  const g = await page.evaluate(() => {
    const vw = innerWidth;
    const svgs = [...document.querySelectorAll<SVGSVGElement>('.figs .chart svg')];
    // how large a chart's own 11 px figures are drawn
    const scale = svgs.map((s) => s.getBoundingClientRect().width / (s.viewBox.baseVal.width || 1));
    return { vw, n: svgs.length, smallest: Math.min(...scale), page: document.documentElement.scrollWidth, cols: getComputedStyle(document.querySelector('.figs')!).gridTemplateColumns.split(' ').length };
  });
  expect(g.n).toBeGreaterThan(20);
  expect(g.cols).toBe(1);
  // (two to a row they were drawn at 0.29 of their size: figures 3 px high)
  expect(g.smallest).toBeGreaterThan(0.6);
  expect(g.page).toBeLessThanOrEqual(g.vw);
  expect(errors).toEqual([]);
});

test('the orchestra button is named as it reads, and an instrument to add is “an oboe”', async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto('/orchestra?v=1&seats=violin,cello&view=2d');
  const ens = page.locator('.ens-toggle');
  await expect(ens).toHaveAttribute('aria-label', 'Orchestra: several instruments');
  await expect(ens).toHaveAttribute('data-tip', 'orchestra · tap instruments to add them');
  expect(await page.locator('.pick[aria-label="Oboe"]').getAttribute('data-tip')).toBe('add an oboe');
  expect(await page.locator('.pick[aria-label="Flute"]').getAttribute('data-tip')).toBe('add a flute');
  // the Measurements' charts say what they are
  if (info.project.name !== 'phone') {
    await page.goto('/measurements');
    await expect(page.locator('.figs .chart svg').first()).toBeVisible({ timeout: 20_000 });
    const unnamed = await page.evaluate(() => [...document.querySelectorAll('.figs .chart svg[role="img"]')].filter((s) => !(s.getAttribute('aria-label') ?? '').trim()).length);
    expect(unnamed).toBe(0);
  }
  expect(errors).toEqual([]);
});
