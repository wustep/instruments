import { expect, test, type Page } from '@playwright/test';
import { ASTRA_SCORES } from '../apps/web/test/presets.ts';

const performanceState = (page: Page) => page.evaluate(() => {
  const { ensemble } = (window as any).__orchestra;
  const player = (window as any).__player;
  return {
    piece: ensemble.piece?.id,
    seats: ensemble.lineup,
    routes: ensemble.plan.lines.map((routes: { part: number }[]) => routes.map(r => r.part)),
    loaded: !!player.loaded,
    playing: player.playing,
    engines: ensemble.parts.filter((p: any) => p.engine).length,
  };
});

export function bundledScore(slug: keyof typeof ASTRA_SCORES, at: number) {
  const { title, seats } = ASTRA_SCORES[slug];
  const cued = async (page: Page) => {
    await expect.poll(() => performanceState(page)).toMatchObject({
      piece: slug, seats, loaded: true, playing: false, routes: seats.map((_, i) => [i]),
    });
    await expect(page.locator('.pl-line')).toHaveCount(seats.length);
  };

  test(`/${slug} loads silent, survives navigation and reload, then writes changed routing into the Orchestra address`, async ({ page }) => {
    const url = `/${slug}?keys=2&view=2d&expr=off`;
    expect((await page.goto(url))?.status()).toBe(200);
    await cued(page);
    await expect(page.locator('html')).toHaveAttribute('data-audio', 'idle');
    expect((await performanceState(page)).engines).toBe(0);
    await expect(page.locator('.pl-play')).toHaveAttribute('aria-label', 'Play GPT-6.2 Astra, ' + title);
    await page.locator('nav.links').getByRole('link', { name: 'notes' }).click();
    await expect(page.locator(`.notes a[href="/${slug}"]`)).toHaveText(title);
    await page.goBack();
    await cued(page);
    await expect(page).toHaveURL(url);
    await page.goForward();
    await expect(page).toHaveURL('/notes');
    await page.goBack();
    await page.reload();
    await cued(page);
    await expect(page).toHaveURL(url);
    expect((await performanceState(page)).engines).toBe(0);
    await page.evaluate(() => (window as any).__orchestra.ensemble.removePart(0));
    await expect.poll(() => new URL(page.url()).pathname).toBe('/orchestra');
    const changed = new URL(page.url());
    expect(changed.searchParams.get('seats')).toBe(seats.slice(1).join(','));
    expect(changed.searchParams.get('lines')).toContain(':-');
    await page.reload();
    await expect.poll(async () => (await performanceState(page)).seats).toEqual(seats.slice(1));
  });

  for (const view of ['2d', '3d']) {
    test(`/${slug} plays its seated parts in ${view}`, async ({ page }, info) => {
      test.setTimeout(120_000);
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`/${slug}?view=${view}`);
      await cued(page);
      if (view === '3d') {
        await page.waitForFunction(n => {
          const stage = (window as any).__stage3d;
          return stage?.stats.frames > 5 && stage.seats().length === n;
        }, seats.length);
      } else {
        await page.waitForFunction(n => (window as any).__ens2d?.().filter(Boolean).length === n, seats.length);
      }
      await page.locator('.pl-play').click();
      await page.mouse.move(1, 1);
      await expect.poll(() => performanceState(page), { timeout: 35_000 }).toMatchObject({ engines: seats.length, playing: true });
      await page.evaluate(t => (window as any).__player.seek(t), at);
      // The actual mix reaches the Web Audio analyser after the seek.
      await page.waitForFunction(() => {
        const a = (window as any).__piano.analyser as AnalyserNode;
        const x = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(x);
        return x.some(v => Math.abs(v) > .004);
      });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (view === '3d') {
        await expect.poll(() => page.evaluate(() => {
          const s = (window as any).__stage3d;
          const r = s.el.getBoundingClientRect();
          const b = s.box();
          return b && r.left+b.x0 >= r.left-1 && r.left+b.x1 <= r.right+1 &&
            r.top+b.y0 >= document.querySelector('.pl-lines')!.getBoundingClientRect().bottom-1 &&
            r.top+b.y1 <= r.bottom+1;
        })).toBe(true);
      }
      if (info.project.name === 'desktop') {
        const path = info.outputPath(`${slug}-${view}.png`);
        await page.screenshot({ path });
        await info.attach(`${slug}-${view}`, { path, contentType: 'image/png' });
      }
      expect(errors).toEqual([]);
    });
  }
}
