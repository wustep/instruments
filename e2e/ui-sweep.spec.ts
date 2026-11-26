// The sweep of the whole app's looks (scripts/shots-inventory.mjs photographs every instrument, look, window
// and menu): what it found that was out of line with the rest, each fixed and held here.
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
type Seat = { voice: string; cell: { x: number; y: number; w: number; h: number; sc: number | null } };
const seats = (page: Page) => page.evaluate(() => ((window as any).__ens2d() as (Seat | null)[]).filter(Boolean) as Seat[]);

test('2D: an orchestra with a piano on a wide stage has the stage’s height, the piano at its left (its rows were under a piano as wide as the window, at 0.4 of their scale)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'a phone held upright keeps the piano’s band under the rows');
  const errors = collectErrors(page);
  /** the px/m an orchestra is drawn at */
  const scaleOf = async (path: string) => {
    await page.goto(path);
    await page.waitForFunction(() => (window as any).__player?.loaded && (window as any).__ens2d?.().every(Boolean), null, { timeout: 30_000 });
    return seats(page);
  };
  // Toward Morning's thirteen have no piano: what an orchestra is drawn at with the stage to itself
  const alone = (await scaleOf('/symphony?view=2d')).find((s) => s.cell.sc)!.cell.sc!;
  for (const view of ['2d', 'vector'])
    for (const path of ['/passiton', '/everything', '/tango']) {
      const all = await scaleOf(`${path}?view=${view}`);
      const who = `${path} ${view}`;
      const piano = all.find((s) => s.voice === 'grand')!.cell;
      const rest = all.filter((s) => s.voice !== 'grand').map((s) => s.cell);
      const stage = (await page.locator('.stage-cv').first().boundingBox())!;
      // the piano at the stage's left, whole, a third of its width; every other instrument to its right
      expect(piano.x - stage.x, who).toBeLessThanOrEqual(1);
      expect(piano.w, who).toBeLessThan(stage.width * 0.4);
      expect(piano.y + piano.h, who).toBeLessThanOrEqual(stage.y + stage.height + 1);
      expect(Math.min(...rest.map((c) => c.x)), who).toBeGreaterThanOrEqual(piano.x + piano.w - 1);
      // the rows drawn at a scale near the orchestra's with no piano (Pass It On's stood at 0.4 of it), over
      // more than half the stage's width
      expect(rest[0].sc! / alone, `${who}: ${rest[0].sc!.toFixed(0)} px/m, ${alone.toFixed(0)} with no piano`).toBeGreaterThan(0.6);
      expect(Math.max(...rest.map((c) => c.x + c.w)) - Math.min(...rest.map((c) => c.x)), who).toBeGreaterThan(stage.width * 0.3);
    }
  expect(errors).toEqual([]);
});

test('2D: an orchestra’s piano away from the screen’s keys has keys of its own, under its strings, lit with its notes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'a phone held upright keeps the piano’s band over the keys on the screen');
  const errors = collectErrors(page);
  type Key = { midi: number; black: boolean; x: number; y: number; w: number; h: number };
  for (const view of ['2d', 'vector']) {
    await page.goto(`/tango?view=${view}`);
    await page.waitForFunction(() => (window as any).__player?.loaded && (window as any).__ens2d?.().every(Boolean), null, { timeout: 30_000 });
    await startAudio(page);
    const piano = async () => ((await page.evaluate(() => (window as any).__ens2d())) as { voice: string; cell: Seat['cell']; keys: Key[] | null }[]).find((s) => s.voice === 'grand')!;
    const p = await piano();
    // 88 keys along the foot of its cell, inside it; the other instruments have none
    expect(p.keys, view).toHaveLength(88);
    for (const k of p.keys!) {
      expect(k.x, view).toBeGreaterThanOrEqual(p.cell.x - 0.5);
      expect(k.x + k.w, view).toBeLessThanOrEqual(p.cell.x + p.cell.w + 0.5);
      expect(k.y + (k.black ? 0 : k.h), view).toBeLessThanOrEqual(p.cell.y + p.cell.h + 0.5);
      expect(k.y, view).toBeGreaterThan(p.cell.y + p.cell.h * 0.7);
    }
    expect(((await page.evaluate(() => (window as any).__ens2d())) as { keys: Key[] | null }[]).filter((s) => s.keys).length, view).toBe(1);
    // what is drawn on a white key's front (clear of the black keys and of its partings), at rest and held
    const c4 = p.keys!.find((k) => k.midi === 60)!;
    const d4 = p.keys!.find((k) => k.midi === 62)!;
    const seen = (k: Key) =>
      page.evaluate(([x, y]) => {
        const cv = document.querySelector<HTMLCanvasElement>('.stage-cv')!;
        const r = cv.getBoundingClientRect();
        const s = cv.width / r.width;
        return [...cv.getContext('2d')!.getImageData(Math.round((x - r.left) * s), Math.round((y - r.top) * s), 1, 1).data].slice(0, 3);
      }, [k.x + k.w / 2, k.y + k.h * 0.82]);
    // (how far a key's colour is from what it was: the vector look's glow moves a key at rest by a few levels,
    // a held key by a hundred and more)
    const far = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const rest = { c4: await seen(c4), d4: await seen(d4) };
    // (the keys play the piano: it is the orchestra's keyboard)
    await page.evaluate(() => (window as any).__piano.noteOn(60, 0.7, 'keys'));
    await expect.poll(async () => far(await seen(c4), rest.c4), { message: `${view}: C4 held` }).toBeGreaterThan(40);
    expect(far(await seen(d4), rest.d4), `${view}: D4, not held`).toBeLessThan(40);
    await page.evaluate(() => (window as any).__piano.noteOff(60, 'keys'));
    await expect.poll(async () => far(await seen(c4), rest.c4), { message: `${view}: C4 let go` }).toBeLessThan(40);
  }
  // a few players with a piano keep its band over the screen's keys, and no keys of its own
  await page.goto('/orchestra?v=1&seats=violin,grand&view=2d');
  await page.waitForFunction(() => (window as any).__ens2d?.().every(Boolean), null, { timeout: 30_000 });
  expect(((await page.evaluate(() => (window as any).__ens2d())) as { keys: Key[] | null }[]).filter((s) => s.keys).length).toBe(0);
  expect(errors).toEqual([]);
});

test('a window between a phone’s and a computer’s (a tablet held upright): a long lineup’s strips never widen the page', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'a phone folds both strips away');
  const errors = collectErrors(page);
  for (const [w, h] of [[768, 1024], [820, 1180], [900, 700], [1024, 768]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const path of ['/passiton?view=2d', '/symphony?view=2d']) {
      await page.goto(path);
      await page.waitForFunction(() => (window as any).__player?.loaded, null, { timeout: 30_000 });
      const m = await page.evaluate(() => {
        const box = (e: Element) => {
          const r = e.getBoundingClientRect();
          return { x0: r.left, x1: r.right, w: r.width };
        };
        return {
          scroll: document.documentElement.scrollWidth,
          win: innerWidth,
          parts: [...document.querySelectorAll('.parts .part')].map(box),
          chips: [...document.querySelectorAll('.kf .kf-part, .kf .kf-split')].map(box),
          spec: box(document.querySelector('.spec-wrap')!),
        };
      });
      const who = `${path} at ${w}×${h}`;
      expect(m.scroll, `${who}: the page as wide as the window`).toBeLessThanOrEqual(m.win);
      // every instrument of the strip and every chip of the keys' row inside the window, none on another
      for (const set of [m.parts, m.chips]) {
        expect(set.length, who).toBeGreaterThan(3);
        for (const b of set) expect(b.x1, who).toBeLessThanOrEqual(m.win + 0.5);
        for (let i = 1; i < set.length; i++) expect(set[i].x0, who).toBeGreaterThanOrEqual(set[i - 1].x1 - 0.5);
      }
      // each still wide enough to see and to press; the spectrum keeps its least width
      for (const b of m.parts) expect(b.w, `${who}: a part`).toBeGreaterThanOrEqual(14);
      for (const b of m.chips) expect(b.w, `${who}: a chip of the keys' row`).toBeGreaterThanOrEqual(22);
      expect(m.spec.w, who).toBeGreaterThanOrEqual(119);
    }
  }
  // and a computer's window keeps each at its full size
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/passiton?view=2d');
  await page.waitForFunction(() => (window as any).__player?.loaded, null, { timeout: 30_000 });
  const full = await page.evaluate(() => [document.querySelector('.parts .part')!.getBoundingClientRect().width, document.querySelector('.kf .kf-part')!.getBoundingClientRect().width]);
  expect(full).toEqual([34, 36]);
  expect(errors).toEqual([]);
});

test('Measurements and Notes have no keys: the lamp, its “tap a key” and the MIDI socket are the stage’s alone; there the bar has “player”, the way back to the stage as it was', async ({ page }, info) => {
  const errors = collectErrors(page);
  const hint = () => page.locator('.lamp-text');
  const player = () => page.locator('header nav.links a.to-stage');
  await page.goto('/cello?view=2d');
  await expect(hint()).toBeVisible();
  await expect(hint()).toHaveText('tap a key');
  await expect(page.locator('.lamp')).toBeVisible();
  await expect(player()).toBeHidden();
  for (const p of ['measurements', 'notes']) {
    await page.locator(`header nav.links a[data-route="${p}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-route', p);
    // no lamp, no words of it, no MIDI socket: the status is not in the bar at all
    for (const sel of ['.status', '.lamp', '.lamp-text', '.status .midi']) await expect(page.locator(sel), `${p}: ${sel}`).toBeHidden();
    // “player”: one of the pages' links, first among them, in their type; it goes where the stage was
    await expect(player()).toBeVisible();
    await expect(player()).toHaveText('player');
    await expect(player()).toHaveAttribute('href', '/cello');
    const d = await page.evaluate(() => {
      const [a, b] = [document.querySelector<HTMLElement>('nav.links a.to-stage')!, document.querySelector<HTMLElement>('nav.links a[data-route="measurements"]')!];
      const [ca, cb] = [getComputedStyle(a), getComputedStyle(b)];
      const r = a.getBoundingClientRect();
      // (what a finger can hit: the link's box and its target's, which reaches past the word)
      const t = getComputedStyle(a, '::after');
      const reach = r.height - 2 * parseFloat(t.top || '0');
      return { first: a.parentElement!.firstElementChild === a, font: [ca.fontFamily === cb.fontFamily, ca.fontSize === cb.fontSize, ca.letterSpacing === cb.letterSpacing], left: r.left, right: r.right, next: b.getBoundingClientRect().left, reach, win: innerWidth, over: document.documentElement.scrollWidth - innerWidth };
    });
    expect(d.first, p).toBe(true);
    expect(d.font, `${p}: set as its neighbours are`).toEqual([true, true, true]);
    expect(d.left, p).toBeGreaterThanOrEqual(0);
    expect(d.right, `${p}: clear of the next link`).toBeLessThanOrEqual(d.next + 0.5);
    expect(d.over, `${p}: the bar does not widen the page`).toBeLessThanOrEqual(0);
    // (a finger's target: 44 px on a phone)
    if (info.project.name === 'phone') expect(d.reach, `${p}: a finger's target`).toBeGreaterThanOrEqual(44);
  }
  // back on the stage: the instrument that was there, the lamp again, no “player”
  await player().click();
  await expect(page.locator('html')).toHaveAttribute('data-route', 'stage');
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe('/cello');
  await expect(page.locator('.lamp')).toBeVisible();
  await expect(hint()).toHaveText('tap a key');
  await expect(player()).toBeHidden();
  expect(errors).toEqual([]);
});

test('a phone: the knobs’ drawer has the way back to their defaults on the knobs’ own row (the trombone’s six left it alone on a second)', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'a computer has the knobs on the fallboard');
  const errors = collectErrors(page);
  for (const id of ['trombone', 'piano', 'violin']) {
    await page.goto(`/${id}?view=2d`);
    await startAudio(page);
    await page.locator('.knob-toggle').click();
    const m = await page.evaluate(() => {
      const mid = (e: Element) => {
        const r = e.getBoundingClientRect();
        return (r.top + r.bottom) / 2;
      };
      const knobs = [...document.querySelectorAll('.knobs .knob')];
      const last = knobs[knobs.length - 1].getBoundingClientRect();
      const reset = document.querySelector('.knobs .k-reset')!;
      return { n: knobs.length, face: mid(knobs[knobs.length - 1].querySelector('.k-face')!), reset: mid(reset), row: [last.top, last.bottom], right: reset.getBoundingClientRect().right, win: innerWidth };
    });
    // the reset arrow beside the last knob, inside the window
    expect(m.reset, `${id}: ${m.n} knobs`).toBeGreaterThan(m.row[0]);
    expect(m.reset, `${id}: ${m.n} knobs`).toBeLessThan(m.row[1]);
    expect(m.right, id).toBeLessThanOrEqual(m.win);
  }
  expect(errors).toEqual([]);
});

test('the timpani in 3D are first seen as the 2D stage draws them: from behind the player, the big drum at the left', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/timpani?view=2d');
  await startAudio(page);
  // the 2D set: its heads across the picture, the 32″ at the left, the pedals under them (towards us)
  await page.waitForFunction(() => (window as any).__timpani2d?.(), null, { timeout: 30_000 });
  const flat = await page.evaluate(() => {
    const d = (window as any).__timpani2d();
    return { heads: (d.heads as { x: number; y: number }[]).map((h) => [h.x, h.y]), pedals: (d.pedals as { x: number; y: number }[]).map((p) => [p.x, p.y]) };
  });
  expect(flat.heads).toHaveLength(4);
  for (let k = 1; k < 4; k++) expect(flat.heads[k][0], `2D drum ${k}`).toBeGreaterThan(flat.heads[k - 1][0]);
  for (let k = 0; k < 4; k++) expect(flat.pedals[k][1], `2D pedal ${k}: nearer us than its head`).toBeGreaterThan(flat.heads[k][1]);
  // the 3D set: the camera on the player's side of it (the model's +x is the player's left, and from there
  // the picture's: apps/web/test/timpani3d.test.ts), above the heads
  await page.locator('.dim-toggle').click();
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 20 && (window as any).__timpani3d?.layout, null, { timeout: 60_000 });
  await page.waitForTimeout(600);
  const deep = await page.evaluate(() => {
    const l = (window as any).__timpani3d.layout as { heads: number[][]; player: number[] };
    return { eye: [...(window as any).__stage3d.eye] as number[], heads: l.heads, player: l.player };
  });
  const mid = [0, 2].map((i) => deep.heads.reduce((a, h) => a + h[i], 0) / 4);
  const side = [deep.player[0] - mid[0], deep.player[2] - mid[1]];
  const eye = [deep.eye[0] - mid[0], deep.eye[2] - mid[1]];
  const cos = (side[0] * eye[0] + side[1] * eye[1]) / (Math.hypot(side[0], side[1]) * Math.hypot(eye[0], eye[1]));
  expect(cos, 'the camera behind the player').toBeGreaterThan(0.85);
  expect(deep.eye[1], 'above the heads').toBeGreaterThan(Math.max(...deep.heads.map((h) => h[1])) + 0.5);
  expect(deep.heads[0][0], 'the 32″ on the player’s left').toBeGreaterThan(deep.heads[3][0]);
  expect(errors).toEqual([]);
});

test('the page’s own words count and name the instruments there are: its description, and the Notes page’s first line', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/piano');
  // the instruments, as the picker has them
  const labels = await page.evaluate(() => [...document.querySelectorAll('.fam .pick')].map((b) => b.getAttribute('aria-label')!.toLowerCase()));
  const word = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'][labels.length];
  expect(word, `${labels.length} instruments`).toBeTruthy();
  const said = await page.evaluate(() => ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]'].map((q) => document.querySelector(q)!.getAttribute('content')!));
  for (const s of said) expect(s.startsWith(`${word} `), s).toBe(true);
  await page.goto('/notes');
  const first = (await page.locator('.note-body p').first().textContent())!;
  expect(first.startsWith(`${word} acoustic instruments`), first.slice(0, 60)).toBe(true);
  for (const l of labels) expect(first, l).toContain(l);
  expect(errors).toEqual([]);
});
