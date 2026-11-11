// Less of the page round the stage, by two parameters of the address no control sets (address.ts,
// look.ts): keys=0, no fallboard and no keys, the stage in their room; ui=0, the stage and nothing else
// (no bar, no band, no file player, no keys), for looking, listening and filming. Each on one instrument
// and on the Orchestra, in 2D, in vector lines and in 3D, on a computer and a phone; each kept by every
// address the page writes; and with ui=0 everything still asked of the page (window.__player plays the
// piece the address set up). And the room's knob in 3D, which stood in the stage's corner while the
// camera flew back out of a key's close-up: it is on the floor or not shown.
import { test, expect, type Page } from '@playwright/test';
import { openPicker } from './picker.ts';

const collectErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' || /webgl|GL_[A-Z_]{4,}|feedback loop|framebuffer/i.test(m.text())) errors.push(`${m.type()}: ${m.text()}`);
  });
  return errors;
};
const path = (page: Page) => {
  const u = new URL(page.url());
  return decodeURI(u.pathname + u.search);
};
async function startAudio(page: Page) {
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano, null, { timeout: 30_000 });
}
const frames3d = (page: Page, n = 8) => page.waitForFunction((k) => (window as any).__stage3d?.stats.frames > k, n, { timeout: 60_000 });
type Box = [number, number, number, number] | null;
/** what is on the screen: each part's box (null: not shown), the window, the page's scroll size */
const screen = (page: Page) =>
  page.evaluate(() => {
    const box = (q: string): [number, number, number, number] | null => {
      const e = document.querySelector(q);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return r.width && r.height ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null;
    };
    const d = document.documentElement;
    return { win: [innerWidth, innerHeight] as [number, number], stage: box('.stage'), bar: box('.top'), band: box('.stage-top'), player: box('.player'), dock: box('.dock'), keys: box('.keyboard'), cv: box('.stage-cv'), cv3: box('.stage-3d'), scroll: [d.scrollWidth, d.scrollHeight] as [number, number] };
  });
/** the stage reaches the window's sides and its bottom, and the page does not scroll */
const reaches = (s: Awaited<ReturnType<typeof screen>>, top: number | null, what: string) => {
  const [W, H] = s.win;
  expect(s.stage, what).not.toBeNull();
  const [x0, y0, x1, y1] = s.stage!;
  expect([x0, x1, y1], `${what}: the stage's sides and bottom`).toEqual([0, W, H]);
  if (top !== null) expect(y0, `${what}: the stage's top`).toBe(top);
  expect(s.scroll[0], `${what}: no sideways scroll`).toBeLessThanOrEqual(W);
  expect(s.scroll[1], `${what}: no scroll down`).toBeLessThanOrEqual(H);
  // the picture is the stage's whole box
  const cv = (s.cv3 ?? s.cv) as Box;
  expect(cv, what).not.toBeNull();
  expect([cv![0], cv![2], cv![3]], `${what}: the picture`).toEqual([0, W, H]);
};

test('keys=0: no fallboard and no keys, the stage in their room; one instrument in 2D, vector lines and 3D', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  // as the page is: the keys under the stage
  await page.goto('/piano?view=2d');
  let s = await screen(page);
  expect(s.dock).not.toBeNull();
  expect(s.keys).not.toBeNull();
  const withKeys = s.stage![3] - s.stage![1];
  for (const url of ['/piano?view=2d&keys=0', '/piano/upright?view=2d&keys=0', '/piano?view=vector&keys=0', '/violin?view=2d&keys=0', '/piano?view=3d&keys=0', '/timpani?view=3d&keys=0']) {
    await page.goto(url);
    await expect(page.locator('html')).toHaveAttribute('data-nokeys', '');
    if (url.includes('3d')) await frames3d(page);
    else await page.waitForTimeout(250);
    s = await screen(page);
    expect(s.dock, url).toBeNull();
    expect(s.keys, url).toBeNull();
    // the bar, the band under it and the file player are as ever
    expect(s.bar, url).not.toBeNull();
    expect(s.band, url).not.toBeNull();
    expect(s.player, url).not.toBeNull();
    reaches(s, s.bar![3], url);
    expect(s.stage![3] - s.stage![1], `${url}: taller by the keys' room`).toBeGreaterThan(withKeys + 100);
    // the address says so still, written as the page writes it
    await expect.poll(() => path(page)).toContain('keys=0');
    if (url.includes('/piano') && !url.includes('3d')) {
      // the 2D pianos: every key's strings on the stage, the case whole between its sides
      const p = await page.evaluate(() => (window as any).__piano2d());
      expect(p, url).not.toBeNull();
      expect(p.strings.length, url).toBe(88);
      // (each string's end by its key: the keys lie across the stage, inside it)
      const xs = p.strings.map((q: any) => q.x0);
      expect(Math.min(...xs), url).toBeGreaterThan(p.stage.x0 + 8);
      expect(Math.max(...xs), url).toBeLessThan(p.stage.x1 - 8);
      if (p.upright) {
        expect(p.box.x0, url).toBeGreaterThanOrEqual(p.stage.x0 + 4);
        expect(p.box.x1, url).toBeLessThanOrEqual(p.stage.x1 - 4);
        expect(p.box.y1, url).toBeLessThanOrEqual(p.stage.y1);
      } else {
        // (the grand from above: its rim at the stage's sides and its tail under the band, as the page has it)
        expect(Math.abs(p.box.x0 - p.stage.x0), url).toBeLessThanOrEqual(2);
        expect(Math.abs(p.box.x1 - p.stage.x1), url).toBeLessThanOrEqual(2);
        expect(p.box.y0, url).toBeGreaterThanOrEqual(p.stage.y0);
      }
    }
    if (url.includes('3d')) {
      // (both ask to be whole on any stage: every vertex inside the picture)
      const b = await page.evaluate(() => (window as any).__stage3d.box());
      const [W, H] = [s.cv3![2] - s.cv3![0], s.cv3![3] - s.cv3![1]];
      expect(b.x0, url).toBeGreaterThanOrEqual(0);
      expect(b.y0, url).toBeGreaterThanOrEqual(0);
      expect(b.x1, url).toBeLessThanOrEqual(W);
      expect(b.y1, url).toBeLessThanOrEqual(H);
      // as large as the stage has room for: across it or up it
      expect(Math.max((b.x1 - b.x0) / W, (b.y1 - b.y0) / H), url).toBeGreaterThan(0.8);
    }
  }
  expect(errors).toEqual([]);
});

test('keys=0 stays as the page goes (another instrument, the look, back); the computer’s keys still play; the Orchestra’s keys are still chosen beside it', async ({ page }, info) => {
  test.setTimeout(120_000);
  const phone = info.project.name === 'phone';
  const errors = collectErrors(page);
  await page.goto('/piano?view=2d&keys=0');
  await startAudio(page);
  expect((await screen(page)).dock).toBeNull();
  if (!phone) {
    // (a computer's keyboard plays as ever: A is the first of its row)
    await page.keyboard.down('a');
    await expect.poll(() => page.evaluate(() => (window as any).__piano.down.size)).toBe(1);
    await page.keyboard.up('a');
    await expect.poll(() => page.evaluate(() => (window as any).__piano.down.size)).toBe(0);
  }
  await openPicker(page);
  await page.locator('.pick[aria-label="Cello"]').click();
  await expect.poll(() => path(page)).toBe('/cello?keys=0');
  expect((await screen(page)).dock).toBeNull();
  await page.locator('.vec-toggle').click();
  await expect.poll(() => path(page)).toBe('/cello?keys=0&view=vector');
  await page.goBack();
  await expect.poll(() => path(page)).toBe('/piano?keys=0&view=vector');
  let s = await screen(page);
  expect(s.dock).toBeNull();
  reaches(s, s.bar![3], 'back on the piano');
  // the Orchestra: the seats the keys play are chosen as ever, the 0 among them
  await page.goto('/orchestra?v=1&seats=violin,grand,cello&keys=0.1.3&view=2d');
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.keys.parts)).toEqual([0, 2]);
  await expect.poll(() => path(page)).toMatch(/^\/orchestra\?v=1&seats=violin,grand,cello&keys=0\.1\.3&view=2d/);
  s = await screen(page);
  expect(s.dock).toBeNull();
  reaches(s, s.bar![3], 'the orchestra');
  // without it the keys are there
  await page.goto('/piano?view=2d');
  await expect(page.locator('html')).not.toHaveAttribute('data-nokeys', '');
  await expect(page.locator('.keyboard .key')).toHaveCount(88);
  expect((await screen(page)).dock).not.toBeNull();
  expect(errors).toEqual([]);
});

test('ui=0: the stage and nothing else; the piece the address set up plays from the page, the orchestra whole in 3D and in 2D', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  await page.goto('/symphony?view=3d&ui=0');
  await expect(page.locator('html')).toHaveAttribute('data-noui', '');
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.piece?.id ?? null), { timeout: 20_000 }).toBe('toward-morning');
  await frames3d(page);
  let s = await screen(page);
  for (const k of ['bar', 'band', 'player', 'dock', 'keys'] as const) expect(s[k], k).toBeNull();
  reaches(s, 0, 'the symphony in 3D');
  // the piece is loaded and silent, as its address has it; the address keeps the parameter
  const pl = () => page.evaluate(() => ({ loaded: !!(window as any).__player.loaded, playing: (window as any).__player.playing as boolean, pos: (window as any).__player.pos as number, played: (window as any).__orchestra.ensemble.parts.filter((p: any) => p.lastOn > 0).length as number }));
  expect(await pl()).toMatchObject({ loaded: true, playing: false, played: 0 });
  await expect.poll(() => path(page)).toMatch(/^\/symphony\?view=3d&expr=(on|off)&ui=0$/);
  // played from the page: from the coda, every seat's engine; moved, paused
  await page.evaluate(() => {
    const p = (window as any).__player;
    p.seek(190);
    return p.play();
  });
  await expect.poll(async () => (await pl()).playing).toBe(true);
  await expect.poll(async () => (await pl()).played, { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
  expect((await pl()).pos).toBeGreaterThan(190);
  // the whole orchestra in the picture
  const whole = async (what: string) => {
    const b = await page.evaluate(() => (window as any).__stage3d.box());
    const q = await screen(page);
    expect(b.x0, what).toBeGreaterThanOrEqual(0);
    expect(b.y0, what).toBeGreaterThanOrEqual(0);
    expect(b.x1, what).toBeLessThanOrEqual(q.cv3![2]);
    expect(b.y1, what).toBeLessThanOrEqual(q.cv3![3]);
    expect(b.x1 - b.x0, what).toBeGreaterThan(0.5 * q.cv3![2]);
  };
  await whole('3D');
  // (where each seat stands, for a camera that goes to a section: thirteen, on the floor or a riser)
  const seats = await page.evaluate(() => (window as any).__stage3d.seats() as { c: number[]; r: number; top: number }[]);
  expect(seats.length).toBe(13);
  for (const q of seats) {
    expect(q.c[1]).toBeGreaterThanOrEqual(0);
    expect(q.top).toBeGreaterThan(q.c[1]);
    expect(q.r).toBeGreaterThan(0.05);
  }
  await page.evaluate(() => (window as any).__player.pause());
  expect((await pl()).playing).toBe(false);
  // the look changed from the page (its buttons are there, not shown): 2D, every seat's cell on the stage
  await page.evaluate(() => (document.querySelector('.view-2d') as HTMLElement).click());
  await expect.poll(() => path(page)).toMatch(/^\/symphony\?view=2d&expr=(on|off)&ui=0$/);
  await page.waitForTimeout(300);
  s = await screen(page);
  for (const k of ['bar', 'band', 'player', 'dock', 'cv3'] as const) expect(s[k], k).toBeNull();
  reaches(s, 0, 'the symphony in 2D');
  const cells = await page.evaluate(() => (window as any).__ens2d().map((c: any) => c.cell));
  expect(cells.length).toBe(13);
  for (const c of cells) {
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(s.win[0] + 1);
    expect(c.y + c.h).toBeLessThanOrEqual(s.win[1] + 1);
  }
  expect(errors).toEqual([]);
});

test('ui=0 on one instrument: the stage’s own knobs stay, the piano changed from the page; the other pages keep their bar, and the stage comes back as it was', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  await page.goto('/piano?view=3d&ui=0');
  await startAudio(page);
  await frames3d(page, 20);
  let s = await screen(page);
  for (const k of ['bar', 'band', 'player', 'dock'] as const) expect(s[k], k).toBeNull();
  reaches(s, 0, 'the grand');
  // the lid's knob and the room's are the stage's own: they are there
  await expect(page.locator('.knob-room')).toBeVisible();
  await expect(page.locator('.knob-lid')).toBeVisible();
  // the notes still sound and light the 3D keys (asked of the page)
  await page.evaluate(() => (window as any).__piano.noteOn(60, 0.7, 'midi'));
  await expect.poll(() => page.evaluate(() => (window as any).__piano.isSounding(60))).toBe(true);
  await page.evaluate(() => (window as any).__piano.noteOff(60, 'midi'));
  // the other piano, by its own button (there, not shown)
  await page.evaluate(() => ([...document.querySelectorAll('.presets button')].find((b) => b.textContent!.trim() === 'upright') as HTMLElement).click());
  await expect.poll(() => path(page)).toBe('/piano/upright?view=3d&ui=0');
  await expect.poll(() => page.evaluate(() => (window as any).__piano.piano.preset)).toBe('upright');
  // 2D too: nothing but the piano
  await page.goto('/piano/upright?view=2d&ui=0');
  await page.waitForTimeout(250);
  s = await screen(page);
  for (const k of ['bar', 'band', 'player', 'dock', 'cv3'] as const) expect(s[k], k).toBeNull();
  reaches(s, 0, 'the upright in 2D');
  const p = await page.evaluate(() => (window as any).__piano2d());
  expect(p.upright).toBe(true);
  expect(p.strings.length).toBe(88);
  expect(p.box.x0).toBeGreaterThanOrEqual(4);
  expect(p.box.x1).toBeLessThanOrEqual(s.win[0] - 4);
  expect(p.box.y0).toBeGreaterThanOrEqual(0);
  expect(p.box.y1).toBeLessThanOrEqual(s.win[1]);
  // a page that is not the stage keeps its bar: it is the way back; the stage then is as it was
  await page.goto('/notes?ui=0');
  await expect(page.locator('header.top')).toBeVisible();
  await expect(page.locator('a.back')).toBeVisible();
  await page.locator('a.back').click();
  await expect(page.locator('html')).toHaveAttribute('data-route', 'stage');
  await expect.poll(() => path(page)).toMatch(/ui=0$/);
  s = await screen(page);
  for (const k of ['bar', 'band', 'player', 'dock'] as const) expect(s[k], k).toBeNull();
  reaches(s, 0, 'back from the notes');
  expect(errors).toEqual([]);
});

test('3D: the room’s knob is on the floor or not shown; flying back out of a key’s close-up it rides in with the floor, never the stage’s corner', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  for (const url of ['/piano?view=3d', '/piano/upright?view=3d']) {
    await page.goto(url);
    await startAudio(page);
    await frames3d(page, 30);
    await page.waitForTimeout(400);
    const knob = page.locator('.knob-room');
    await expect(knob).toBeVisible();
    /** the knob's middle and where the stage's floor has it, in the 3D picture's own pixels */
    const at = () =>
      page.evaluate(() => {
        const s3 = (window as any).__stage3d;
        const k = document.querySelector('.knob-room') as HTMLElement;
        const r = k.getBoundingClientRect();
        const c = s3.el.getBoundingClientRect();
        return { shown: !k.hidden, x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top, rk: s3.roomKnob() as [number, number] | null, w: c.width, h: c.height };
      });
    type Frame = { t: number; shown: boolean; x: number; y: number; rk: [number, number] | null; want: [number, number] | null; flying: boolean };
    const home = await at();
    expect(home.shown, url).toBe(true);
    expect(home.rk, url).not.toBeNull();
    // a key's close-up: no floor in the picture, no knob
    await page.evaluate(() => (window as any).__stage3d.zoomTo(60));
    await expect.poll(() => page.evaluate(() => Math.abs(((window as any).__stage3d.section?.zoom ?? 0) - 1) < 0.01), { timeout: 10_000 }).toBe(true);
    await expect(knob).toBeHidden();
    // back out: every frame of the flight, and half a second after it
    const trace = await page.evaluate(
      () =>
        new Promise<Frame[]>((resolve) => {
          const s3 = (window as any).__stage3d;
          const k = document.querySelector('.knob-room') as HTMLElement;
          const out: Frame[] = [];
          // (the knob's half size, as the stage has it: 18 px, 22 under a finger)
          const kh = matchMedia('(pointer: coarse)').matches ? 22 : 18;
          const t0 = performance.now();
          let landed = 0;
          s3.zoomOut();
          const tick = () => {
            const r = k.getBoundingClientRect();
            const c = s3.el.getBoundingClientRect();
            const flying = s3.section !== null;
            const now = performance.now();
            const rk = s3.roomKnob() as [number, number] | null;
            // (where the stage puts it for that place: a knob's half and a margin inside its box)
            const want: [number, number] | null = rk && [Math.max(kh + 10, Math.min(c.width - kh - 10, rk[0])), Math.min(c.height - kh - 6, Math.max(kh + 6, rk[1]))];
            out.push({ t: now - t0, shown: !k.hidden, x: r.left + r.width / 2 - c.left, y: r.top + r.height / 2 - c.top, rk, want, flying });
            if (!flying && !landed) landed = now;
            if ((landed && now - landed > 500) || now - t0 > 6000) resolve(out);
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    const flight = trace.filter((f) => f.flying);
    expect(flight.length, `${url}: the flight was seen`).toBeGreaterThan(8);
    expect(flight[flight.length - 1].t, url).toBeGreaterThan(400);
    for (const f of trace) {
      // shown only where the floor gives it a place, and there
      if (!f.rk) expect(f.shown, `${url} at ${f.t.toFixed(0)} ms: no place on the floor, not shown`).toBe(false);
      if (f.shown) {
        expect(f.want, `${url} at ${f.t.toFixed(0)} ms`).not.toBeNull();
        expect(Math.abs(f.x - f.want![0]), `${url} at ${f.t.toFixed(0)} ms: x`).toBeLessThanOrEqual(2);
        expect(Math.abs(f.y - f.want![1]), `${url} at ${f.t.toFixed(0)} ms: y`).toBeLessThanOrEqual(2);
      }
    }
    // in flight its place is on the picture itself (24 px inside it): never held at an edge or in a corner
    for (const f of flight.filter((q) => q.shown)) {
      expect(f.rk![0], `${url} at ${f.t.toFixed(0)} ms`).toBeGreaterThanOrEqual(24);
      expect(f.rk![0], `${url} at ${f.t.toFixed(0)} ms`).toBeLessThanOrEqual(home.w - 24);
      expect(f.rk![1], `${url} at ${f.t.toFixed(0)} ms`).toBeGreaterThanOrEqual(24);
      expect(f.rk![1], `${url} at ${f.t.toFixed(0)} ms`).toBeLessThanOrEqual(home.h - 24);
    }
    // it moves smoothly onto its place: no jump between frames it is shown in
    const shown = trace.filter((f) => f.shown);
    for (let i = 1; i < shown.length; i++) expect(Math.hypot(shown[i].x - shown[i - 1].x, shown[i].y - shown[i - 1].y), `${url} at ${shown[i].t.toFixed(0)} ms: a jump`).toBeLessThan(0.25 * home.w);
    // landed: where it was before
    const end = await at();
    expect(end.shown, url).toBe(true);
    expect(Math.abs(end.x - home.x), url).toBeLessThanOrEqual(2);
    expect(Math.abs(end.y - home.y), url).toBeLessThanOrEqual(2);
  }
  expect(errors).toEqual([]);
});
