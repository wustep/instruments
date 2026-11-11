// A change of piano (grand ↔ upright) while notes sound: the engine used to stop everything at once
// (a piece playing had a hole until its next note). Now the piano that was playing rings its notes out
// while the other takes the notes to come (engine worklet/processor.ts `changePiano`; its own tests
// are packages/engine/test/worklet.test.ts, its before/after scripts/render-piano-change.ts). Here, in
// the browser: the sound carries on through the change, the keys held stay lit, and a piece playing
// keeps playing.
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
/** the output's level over its last 43 ms */
const level = (page: Page) =>
  page.evaluate(() => {
    const a = (window as any).__piano.analyser as AnalyserNode;
    const buf = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(buf);
    let s2 = 0;
    for (let i = buf.length - 2048; i < buf.length; i++) s2 += buf[i] * buf[i];
    return Math.sqrt(s2 / 2048);
  });
/** the piano's kind, by its own button (in the bar, or a phone's picker sheet) */
const kind = (page: Page, name: string) =>
  page.evaluate(async (n) => {
    ([...document.querySelectorAll('.presets button')].find((b) => b.textContent!.trim() === n) as HTMLElement).click();
    await (window as any).__piano.presetSettled;
  }, name);

test('a change of piano does not stop the sound: held notes ring on and stay lit, the next notes are the other piano’s', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/piano?view=2d');
  await startAudio(page);
  // (the upright's string filters are designed the first time it is asked for: once, beforehand)
  await kind(page, 'upright');
  await kind(page, 'grand');
  await page.waitForTimeout(400);
  const chord = [48, 55, 60, 64];
  await page.evaluate((ns) => ns.forEach((m) => (window as any).__piano.noteOn(m, 0.75, 'midi')), chord);
  await page.waitForTimeout(600);
  const before = await level(page);
  expect(before).toBeGreaterThan(1e-3);
  await kind(page, 'upright');
  expect(await page.evaluate(() => (window as any).__piano.piano.preset)).toBe('upright');
  // 0.1 s on (the 43 ms measured are all after the change): the chord is still there, a little decayed
  await page.waitForTimeout(100);
  const after = await level(page);
  expect(after / before).toBeGreaterThan(0.4);
  expect(after / before).toBeLessThan(1.3);
  // the keys held are still sounding, so still lit
  for (const m of chord) expect(await page.evaluate((k) => (window as any).__piano.isSounding(k), m), `key ${m}`).toBe(true);
  await expect(page.locator('.keyboard .key.sounding')).toHaveCount(chord.length);
  // a note struck now sounds (the upright's), over the grand's chord
  await page.evaluate(() => (window as any).__piano.noteOn(76, 0.8, 'midi'));
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).__piano.isSounding(76))).toBe(true);
  // let go: every note ends, on whichever piano holds it
  await page.evaluate((ns) => ns.forEach((m) => (window as any).__piano.noteOff(m, 'midi')), [...chord, 76]);
  await expect.poll(() => page.evaluate(() => [...(window as any).__piano.sounding].length), { timeout: 5_000 }).toBe(0);
  await expect.poll(() => level(page), { timeout: 8_000 }).toBeLessThan(before / 30);
  await expect.poll(() => page.evaluate(() => (window as any).__piano.lastStats?.voices ?? -1), { timeout: 8_000 }).toBe(0);
  expect(errors).toEqual([]);
});

test('a piece playing plays on through a change of piano: no silence where the pianos change', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/piano?view=2d');
  await startAudio(page);
  await kind(page, 'upright');
  await kind(page, 'grand');
  // the piano's own piece (Chopin's C minor prelude: chords, each held to the next)
  await page.evaluate(() => (window as any).__player.loadDemo('piano'));
  await expect.poll(() => page.evaluate(() => (window as any).__player.playing)).toBe(true);
  // into the second chord, then the level every 20 ms across a change of piano made in mid-chord
  await page.waitForFunction(() => (window as any).__player.pos > 2.2, null, { timeout: 20_000 });
  const trace = await page.evaluate(
    () =>
      new Promise<{ t: number; rms: number; changed: boolean }[]>((resolve) => {
        const audio = (window as any).__piano;
        const a = audio.analyser as AnalyserNode;
        const buf = new Float32Array(a.fftSize);
        const out: { t: number; rms: number; changed: boolean }[] = [];
        const t0 = performance.now();
        let changed = false;
        let asked = false;
        const iv = setInterval(() => {
          const t = performance.now() - t0;
          if (!asked && t >= 300) {
            asked = true;
            ([...document.querySelectorAll('.presets button')].find((b) => b.textContent!.trim() === 'upright') as HTMLElement).click();
            void audio.presetSettled.then(() => (changed = true));
          }
          a.getFloatTimeDomainData(buf);
          let s2 = 0;
          for (let i = buf.length - 960; i < buf.length; i++) s2 += buf[i] * buf[i];
          out.push({ t, rms: Math.sqrt(s2 / 960), changed });
          if (t > 1500) {
            clearInterval(iv);
            resolve(out);
          }
        }, 20);
      }),
  );
  expect(await page.evaluate(() => (window as any).__piano.piano.preset)).toBe('upright');
  expect(await page.evaluate(() => (window as any).__player.playing)).toBe(true);
  const pre = trace.filter((f) => !f.changed && f.t > 100);
  const post = trace.filter((f) => f.changed);
  expect(pre.length).toBeGreaterThan(5);
  expect(post.length).toBeGreaterThan(20);
  const ref = Math.min(...pre.map((f) => f.rms));
  expect(ref).toBeGreaterThan(1e-3);
  // never a hole: every 20 ms after the change is within 20 dB of the quietest moment before it
  // (the engine that stopped the sound fell 45 dB here)
  for (const f of post) expect(f.rms / ref, `${f.t.toFixed(0)} ms`).toBeGreaterThan(0.1);
  expect(errors).toEqual([]);
});
