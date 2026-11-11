// The bow planned ahead, end to end: a file or a piece playing tells the bowed instruments the notes to
// come (the player: audio.foreseeFileEvent; the engine: bowed.ts foresee), on one instrument and in the
// Orchestra, and the keys do not: their notes are met as they come. Through the worklet, a foreseen long
// note is carried on one bow.
import { test, expect, type Page } from '@playwright/test';
import { smf } from '../apps/web/test/smf.ts';

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
/** the single instrument's bow, from now on: every visual frame's, in window.__bows */
const watchBow = (page: Page) =>
  page.evaluate(() => {
    const w = window as any;
    w.__bows = [];
    w.__bowOff?.();
    w.__bowOff = w.__piano.piano.onVisual((f: any) => f.bow && w.__bows.push({ ...f.bow, on: (f.strings ?? []).some((s: any) => s.bowing) }));
  });
const bows = (page: Page) => page.evaluate(() => (window as any).__bows as { dir: number; pos: number; changing: boolean; speed: number; planned: boolean; on: boolean }[]);

test('the cello’s own piece: its strokes are planned ahead (down and up in turn, on the hair’s middle, no change inside a note); a key played after is met as it comes', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/cello?view=2d');
  await startAudio(page);
  await watchBow(page);
  await page.getByRole('button', { name: /^Play/ }).first().click();
  await page.waitForFunction(() => (window as any).__player?.playing, null, { timeout: 20_000 });
  await page.waitForFunction(() => (window as any).__bows.filter((b: any) => b.on).length > 70, null, { timeout: 20_000 });
  const seen = (await bows(page)).filter((b) => b.on);
  expect(seen.every((b) => b.planned), 'every stroke of the piece is a planned one').toBe(true);
  expect(new Set(seen.map((b) => b.dir)).size, 'down-bows and up-bows').toBe(2);
  // (the Prélude's semiquavers: short strokes, kept clear of the frog and the tip)
  for (const b of seen) {
    expect(b.pos).toBeGreaterThan(0.05);
    expect(b.pos).toBeLessThan(0.95);
  }
  expect(seen.some((b) => b.changing), 'no change of bow inside a note').toBe(false);
  // paused, wherever in a note: no string is left bowed (a note the engine had just begun, not yet
  // heard, used to sound on: one pause in six on a phone)
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => (window as any).__player.pause());
    await page.waitForTimeout(300);
    expect((await bows(page)).pop()!.on, `pause ${i + 1}: the bow is off the strings`).toBe(false);
    await page.evaluate(() => (window as any).__player.play());
    await page.waitForTimeout(400 + 37 * i);
  }
  // paused: what was told is forgotten; a key is bowed as the keys always were
  await page.evaluate(() => (window as any).__player.pause());
  await page.waitForTimeout(400);
  await watchBow(page);
  await page.evaluate(() => (window as any).__piano.noteOn(50, 90, 'keys'));
  await page.waitForFunction(() => (window as any).__bows.filter((b: any) => b.on).length > 10, null, { timeout: 10_000 });
  await page.evaluate(() => (window as any).__piano.noteOff(50, 'keys'));
  const key = (await bows(page)).filter((b) => b.on);
  expect(key.every((b) => !b.planned)).toBe(true);
  expect(errors).toEqual([]);
});

test('a file with a five-second note and a slur: one bow carries the long note, the slurred notes share a bow, the next note takes the other', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/cello?view=2d');
  await startAudio(page);
  // the file: D3 for 5 s (from the keys its hair would run out: engine bow.test.ts); then three notes
  // that overlap (a slur), then one apart
  const T = 480;
  const on = (d: number, m: number): [number, ...number[]] => [d, 0x90, m, 64];
  const off = (d: number, m: number): [number, ...number[]] => [d, 0x80, m, 0];
  // (120 beats a minute: the long note 5 s, the slur 1.5 s, the last note 0.5 s)
  const file = smf(T, [[[0, 0xc0, 42], on(0, 50), off(10 * T, 50), on(0, 52), on(T, 54), off(40, 52), on(T - 40, 55), off(40, 54), off(T - 40, 55), on(0, 57), off(T, 57)]]);
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'long.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, [...file]);
  await page.waitForFunction(() => (window as any).__player?.loaded, null, { timeout: 20_000 });
  await watchBow(page);
  await page.evaluate(() => (window as any).__player.playing || (window as any).__player.play());
  await page.waitForFunction(() => (window as any).__player?.playing, null, { timeout: 20_000 });
  await page.waitForFunction(() => !(window as any).__player?.playing || (window as any).__player.pos > 7.2, null, { timeout: 30_000 });
  const all = await bows(page);
  const seen = all.filter((b) => b.on);
  expect(seen.length).toBeGreaterThan(120);
  expect(seen.every((b) => b.planned)).toBe(true);
  expect(seen.some((b) => b.changing), 'no change of bow inside a note or a slur').toBe(false);
  // three strokes: the long note, the slur, the last note; down, up, down
  const runs: number[] = [];
  for (const b of seen) if (runs[runs.length - 1] !== b.dir) runs.push(b.dir);
  expect(runs).toEqual([1, -1, 1]);
  // the long note from the frog to the tip
  const first = seen.filter((b, i) => seen.slice(0, i + 1).every((q) => q.dir === 1));
  expect(first[0].pos).toBeLessThan(0.12);
  expect(first[first.length - 1].pos).toBeGreaterThan(0.85);
  expect(errors).toEqual([]);
});

test('the Orchestra: a quartet’s piece playing, every bowed part’s strokes are planned ahead', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/orchestra?v=1&seats=violin,violin,viola,cello&view=2d');
  await page.getByRole('button', { name: /^Play/ }).first().click();
  await page.waitForFunction(() => (window as any).__orchestra?.ensemble?.parts.filter((p: any) => p.engine).length === 4 && (window as any).__player?.playing, null, { timeout: 30_000 });
  // each part, once it is bowing: planned
  const got = await page.waitForFunction(
    () => {
      const w = window as any;
      w.__seen ??= new Map<number, boolean[]>();
      w.__orchestra.ensemble.parts.forEach((p: any, i: number) => {
        const b = p.frame?.bow;
        if (b && Math.abs(b.speed) > 0.01) w.__seen.set(i, [...(w.__seen.get(i) ?? []), !!b.planned]);
      });
      return w.__seen.size === 4 && [...w.__seen.values()].every((v: boolean[]) => v.length > 20) ? [...w.__seen.values()].map((v: boolean[]) => v.every(Boolean)) : null;
    },
    null,
    { timeout: 40_000, polling: 50 },
  );
  expect(await got.jsonValue()).toEqual([true, true, true, true]);
  expect(errors).toEqual([]);
});
