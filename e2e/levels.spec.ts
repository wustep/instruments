// Every bundled piece at about one loudness (orchestra/pieces.ts `gain`, measured by
// scripts/levels-pieces.ts): a piece's level is a gain on the ensemble's bus that stays with its file,
// a part's own level its engine's volume while the piece is seated as it came, and an instrument's own
// piece its single engine's volume while it is loaded (1 again once it is not).
import { test, expect } from '@playwright/test';

test('a piece’s level is on the bus and each of its parts’ on its engine; an instrument’s own piece sets the instrument’s volume while it is loaded', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/symphony');
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.piece?.id ?? null), { timeout: 20_000 }).toBe('toward-morning');
  const s = await page.evaluate(() => {
    const o = (window as any).__orchestra;
    const e = o.ensemble;
    const pc = o.pieces.find((p: any) => p.id === 'toward-morning');
    return { bus: e.busNow as number, gain: (pc.gain ?? 0) as number, parts: pc.parts.map((p: any) => p.gain ?? 0) as number[], trims: e.parts.map((p: any) => p.trim ?? 1) as number[], n: e.parts.length as number };
  });
  // thirteen parts, a trombone and the timpani among them (played 9 and 7 dB over their sessions:
  // PLAYBACK_DB): 1/√Σwᵢ² (mix.ts), times the piece's own level
  const w2 = 11 + Math.pow(10, 9 / 10) + Math.pow(10, 7 / 10);
  expect(s.bus).toBeCloseTo(Math.pow(10, s.gain / 20) / Math.sqrt(w2), 6);
  expect(s.trims.length).toBe(13);
  s.trims.forEach((t, i) => expect(t).toBeCloseTo(Math.pow(10, s.parts[i] / 20), 9));
  expect(s.parts.some((g) => g !== 0)).toBe(true);

  // an instrument's own piece: the clarinet's (its file plays the line at a fifth of the volume)
  await page.goto('/clarinet');
  await expect(page.locator('html')).toHaveAttribute('data-route', 'stage');
  await page.locator('.pl-play').first().click();
  await expect.poll(() => page.evaluate(() => (window as any).__piano.fileVolume as number), { timeout: 20_000 }).toBeGreaterThan(2);
  await page.evaluate(() => (window as any).__player.unload());
  await expect.poll(() => page.evaluate(() => (window as any).__piano.fileVolume as number)).toBe(1);
});
