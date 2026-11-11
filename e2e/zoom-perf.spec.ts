// A key's close-up in 3D opens at once: the section's shaders are compiled ahead, in the background,
// while the piano shows whole (three3d.ts `warmSection`), so the click compiles none and no frame of
// the flight in stalls (it used to freeze the stage for ≈ 200 ms, 380 ms on a phone's CPU, while 36
// programs compiled). And the first 3D frame of an instrument waits for its shaders without
// freezing the page (`held`).
import { test, expect } from '@playwright/test';

test('3D: a key’s close-up compiles no shader when it opens, and its flight in drops no frame (grand and upright)', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('piano-model.instrument', 'piano');
    localStorage.setItem('piano-model.3d', '1');
  });
  await page.goto('/piano');
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
  for (const preset of ['grand', 'upright']) {
    await page.evaluate((p) => (window as any).__piano.setPreset(p), preset);
    await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 3, null, { timeout: 30_000 });
    // (the piano settles, then its section's shaders compile a few a frame)
    await page.waitForTimeout(2000);
    const r = await page.evaluate(async () => {
      const s = (window as any).__stage3d;
      const progs = () => s.r3.r.info.programs.length as number;
      const before = progs();
      const fr: number[] = [];
      let on = true;
      const f = (t: number) => {
        fr.push(t);
        if (on) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
      await new Promise((res) => setTimeout(res, 100));
      s.zoomTo(60);
      await new Promise((res) => setTimeout(res, 1400));
      on = false;
      const gaps = fr.slice(1).map((t, i) => t - fr[i]);
      return { before, after: progs(), zoomed: s.zoomed, worst: Math.max(...gaps) };
    });
    expect(r.zoomed, preset).toBe(60);
    expect(r.after, `${preset}: programs compiled by the close-up`).toBe(r.before);
    // (a frame of the flight: well under the ≈ 200 ms the compiling cost; generous for a loaded machine)
    expect(r.worst, `${preset}: the longest frame of the flight (ms)`).toBeLessThan(120);
    await page.evaluate(() => (window as any).__stage3d.zoomOut());
    await page.waitForTimeout(900);
  }
});
