// An instrument taken off the Orchestra's stage (and an engine a retry replaced) is done with: its
// processor stops rendering. It used to be disconnected and no more, and went on rendering for ever
// (an AudioWorklet's process() returning true keeps its node alive), so every change of lineup left
// engines on the audio thread: eight instruments put on and taken off once left the audio clock at
// half speed on the machine this was measured on, three times at a sixth. Here: the clock keeps
// time after the stage has been filled and emptied twice.
import { test, expect, type Page } from '@playwright/test';

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
};
/** how fast the audio clock runs against the page's, over 1.5 s (1: it keeps time) */
const clockRate = (page: Page) =>
  page.evaluate(async () => {
    const c = (window as any).__piano.ctx as AudioContext;
    const a = [c.currentTime, performance.now()];
    await new Promise((r) => setTimeout(r, 1500));
    return (c.currentTime - a[0]) / ((performance.now() - a[1]) / 1000);
  });

test('instruments taken off the stage stop costing the audio thread: its clock keeps time after the stage is filled and emptied twice', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/orchestra?v=1&seats=flute&view=2d');
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
  await page.waitForTimeout(500);
  expect(await clockRate(page)).toBeGreaterThan(0.95);
  for (let k = 0; k < 2; k++) {
    await page.evaluate(async () => {
      const e = (window as any).__orchestra.ensemble;
      for (const v of ['violin', 'viola', 'cello', 'bass', 'oboe', 'clarinet', 'horn', 'grand']) e.addVoice(v);
      await e.ensureEngines();
      await new Promise((r) => setTimeout(r, 400));
      e.removeSeats(e.lineup.map((_: string, i: number) => i).filter((i: number) => e.lineup[i] !== 'flute'));
      await new Promise((r) => setTimeout(r, 300));
    });
  }
  expect(await page.evaluate(() => (window as any).__orchestra.ensemble.lineup)).toEqual(['flute']);
  // (with the engines still rendering it ran at about a quarter of real time here)
  expect(await clockRate(page)).toBeGreaterThan(0.9);
  // and the one left still plays
  await page.evaluate(() => (window as any).__piano.noteOn(79, 0.7, 'midi'));
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts[0].down.size)).toBe(1);
  await page.evaluate(() => (window as any).__piano.noteOff(79, 'midi'));
  expect(errors).toEqual([]);
});
