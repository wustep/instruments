import { test, expect } from '@playwright/test';

test('loads, starts the worklet and sounds a note', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await expect(page.locator('.wordmark')).toHaveText('Piano Model');
  await expect(page.locator('.keyboard .key')).toHaveCount(88);
  await page.getByRole('button', { name: 'Start sound' }).click();
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
  const res = await page.evaluate(async () => {
    const a = (window as any).__piano;
    a.noteOn(60, 100, 'keys');
    await new Promise((r) => setTimeout(r, 400));
    const d = new Float32Array(a.analyser.frequencyBinCount);
    a.analyser.getFloatFrequencyData(d);
    let mx = -Infinity, at = 0;
    for (let i = 1; i < d.length; i++) if (d[i] > mx) { mx = d[i]; at = i; }
    a.noteOff(60, 'keys');
    return { peakDb: mx, peakHz: (at * a.ctx.sampleRate) / a.analyser.fftSize, stats: a.lastStats, initMs: a.piano.initMs, sr: a.ctx.sampleRate, base: a.ctx.baseLatency, out: a.ctx.outputLatency };
  });
  console.log(JSON.stringify(res));
  expect(res.peakDb).toBeGreaterThan(-60);
  expect(errors).toEqual([]);
});
