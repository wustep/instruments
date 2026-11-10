// The trombone end to end: its address (/trombone opens it, a reload included), the picker ("trombone" under
// its glyph; "tbn." on a phone, thirteen instruments in the band six took), the keys' compass (the tenor's,
// E1–F5 with its pedals), the worklet at the sample rates the site meets (22.05 to 96 kHz) at pitch on the
// note's own partial, louder with velocity, the slide moving and the size changed by its knob, its own piece
// from the overlay (Bach's Air), and Orchestra mode: a constructed file whose tracks carry the names and
// programs real scores use ("Trombone I" on GM 57, "Bass Trombone", "Posaune 2" unprogrammed, with strings)
// routed to trombones, each seat its size; the Air's four trombones; up to three by the picker.
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
const ens = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    return { lineup: e.lineup as string[], engines: e.parts.filter((p: any) => p.engine).length as number, kinds: e.parts.map((p: any) => p.engine?.instrument ?? null) as (string | null)[], sizes: e.parts.map((p: any) => p.size ?? null) as (string | null)[] };
  });

test('/trombone opens the trombone (a reload too); “trombone” under its glyph; the keys E1–F5', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/trombone');
  await startAudio(page);
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'trombone', null, { timeout: 15_000 });
  const pick = page.locator('.instruments').getByRole('button', { name: 'Trombone' });
  await expect(pick).toHaveAttribute('aria-pressed', 'true');
  await expect(pick.locator('.pick-name')).toHaveText('trombone');
  await expect(pick.locator('.pick-name')).toHaveAttribute('data-short', 'tbn.');
  await expect(pick.locator('svg.glyph')).toBeVisible();
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe('/trombone');
  await page.reload();
  await startAudio(page);
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'trombone', null, { timeout: 15_000 });
  await expect(page.locator('.keyboard .key[data-midi="28"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="27"]')).toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="77"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="78"]')).toHaveClass(/\bout\b/);
  expect(errors).toEqual([]);
});

test('the trombone through the worklet at 22.05, 44.1, 48 and 96 kHz: at pitch on its own partial (slide and F valve), louder with velocity', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/trombone');
  await startAudio(page);
  const levels: Record<string, number> = {};
  for (const [rate, midi, vel] of [[22050, 41, 70], [44100, 34, 70], [48000, 53, 30], [48000, 53, 112], [48000, 55, 70], [96000, 65, 70], [44100, 70, 112]] as const) {
    const out = await page.evaluate(async ([fs, m, v]) => {
      const { renderOffline } = (window as any).__engine;
      const buf: AudioBuffer = await renderOffline({ instrument: 'trombone', sampleRate: fs, duration: 1.4, params: { room: 0, vibrato: 0 }, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: v } }] });
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const x = L.map((s, i) => 0.5 * (s + R[i]));
      const f = 440 * 2 ** ((m - 69) / 12);
      const s0 = Math.round(0.8 * fs);
      const W = Math.round(0.35 * fs);
      let e = 0;
      for (let i = 0; i < W; i++) e += x[s0 + i] ** 2;
      // the period by autocorrelation, over half an octave each way: a neighbouring partial shows as its own pitch
      const ac = (lag: number) => {
        let s = 0;
        for (let i = 0; i < W; i++) s += x[s0 + i] * x[s0 + i + lag];
        return s;
      };
      let best = -Infinity;
      let bl = 0;
      for (let lag = Math.floor(fs / (f * 1.4)); lag <= Math.ceil(fs / (f * 0.71)); lag++) {
        const v2 = ac(lag);
        if (v2 > best) [best, bl] = [v2, lag];
      }
      const a = ac(bl - 1);
      const b = ac(bl);
      const c = ac(bl + 1);
      const fm = fs / (bl + (0.5 * (a - c)) / (a - 2 * b + c));
      let peak = 0;
      for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      return { cents: 1200 * Math.log2(fm / f), peak, n: x.length, db: 10 * Math.log10(e / W + 1e-20) };
    }, [rate, midi, vel] as const);
    const who = `${rate} Hz, MIDI ${midi}, velocity ${vel}`;
    expect(out.n, who).toBe(Math.round(1.4 * rate));
    // (as loud as the Iowa trombones were recorded: a pianissimo F3 peaks near 0.009)
    expect(out.peak, who).toBeGreaterThan(0.003);
    expect(out.peak, who).toBeLessThanOrEqual(1);
    expect(Math.abs(out.cents), who).toBeLessThan(8);
    levels[`${midi}/${vel}`] = out.db;
  }
  expect(levels['53/112'] - levels['53/30']).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

test('the slide follows the notes in the visual frame (first position, then sixth on the F valve), and the size knob makes it a bass trombone', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/trombone');
  await startAudio(page);
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'trombone', null, { timeout: 15_000 });
  // (the engine's own visual frames, as the stage receives them)
  const listen = () =>
    page.evaluate(() => {
      const w = window as any;
      w.__tbn = null;
      w.__piano.piano.onVisual((v: any) => {
        if (v.trombone) w.__tbn = v.trombone;
      });
    });
  await listen();
  const tb = () => page.evaluate(() => (window as any).__tbn);
  await page.evaluate(() => (window as any).__piano.noteOn(58, 90, 'keys'));
  await expect.poll(async () => (await tb())?.position ?? null, { timeout: 5000 }).toBe(1);
  await page.evaluate(() => (window as any).__piano.noteOff(58, 'keys'));
  // C2: the F valve, sixth position, the slide 0.6 m out
  await page.evaluate(() => (window as any).__piano.noteOn(36, 90, 'keys'));
  await expect.poll(async () => (await tb())?.valves?.join() ?? null, { timeout: 5000 }).toBe('1');
  await expect.poll(async () => (await tb())?.slide ?? 0, { timeout: 5000 }).toBeGreaterThan(0.5);
  await page.evaluate(() => (window as any).__piano.noteOff(36, 'keys'));
  // the size: bass
  await page.evaluate(() => (window as any).__piano.setParams({ size: 2 }));
  await listen();
  await page.evaluate(() => (window as any).__piano.noteOn(35, 90, 'keys'));
  await expect.poll(async () => (await tb())?.size ?? null, { timeout: 5000 }).toBe('bass');
  await expect.poll(async () => (await tb())?.valves?.join() ?? null, { timeout: 5000 }).toBe('1,2');
  await page.evaluate(() => (window as any).__piano.noteOff(35, 'keys'));
  expect(errors).toEqual([]);
});

test('the trombone plays its own piece from the overlay (the top line of Bach’s Air), in its compass, one note at a time', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/trombone');
  await startAudio(page);
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'trombone', null, { timeout: 15_000 });
  await expect(page.locator('.pl-play')).toHaveAttribute('data-tip', /^play · Bach, Air/);
  await page.locator('.pl-play').click();
  await expect(page.locator('.player').getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => (window as any).__player.demo?.instrument)).toBe('trombone');
  await expect(page.locator('.key.down')).toHaveCount(1, { timeout: 4000 });
  const m = Number(await page.locator('.key.down').getAttribute('data-midi'));
  expect(m).toBeGreaterThanOrEqual(28);
  expect(m).toBeLessThanOrEqual(77);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('orchestra: “Trombone I” (GM 57), “Bass Trombone” and “Posaune 2” go to trombones beside the strings, the bass one a bass trombone; the Air seats alto, tenor, tenor and bass; trombones by hand up to three', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  const name = (t: string) => [0xff, 0x03, t.length, ...[...t].map((c) => c.charCodeAt(0))];
  const B = [46, 50, 53, 58, 48, 51, 55, 57];
  const parts = [
    ['Trombone I', 57, B.map((m) => m + 12)],
    ['Posaune 2', -1, B],
    ['Bass Trombone', 57, B.map((m) => m - 12)],
    ['Violin I', 40, B.map((m) => m + 24)],
    ['Violoncello', 42, B.map((m) => m - 12)],
  ] as const;
  const tracks: [number, ...number[]][][] = [[[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]]];
  parts.forEach(([n, prog, ns], ch) => {
    const t: [number, ...number[]][] = [[0, ...name(n)]];
    if (prog >= 0) t.push([0, 0xc0 | ch, prog]);
    for (let r = 0; r < 3; r++) for (const m of ns) t.push([0, 0x90 | ch, m, 80], [480, 0x80 | ch, m, 0]);
    tracks.push(t);
  });
  const file = smf(480, tracks);
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'trombones.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, Array.from(file));
  await expect.poll(async () => (await ens(page)).engines, { timeout: 10_000 }).toBe(5);
  let e = await ens(page);
  expect(e.lineup.filter((v) => v === 'trombone').length).toBe(3);
  expect(e.kinds.filter((v) => v === 'trombone').length).toBe(3);
  for (const k of [0, 1, 2]) await expect(page.locator('.pl-line').nth(k)).toHaveAttribute('data-voice', 'trombone');
  // the "Bass Trombone" line's seat a bass trombone, the others not (Trombone I, high, may be an alto)
  expect(e.sizes.filter((s) => s === 'bass').length).toBe(1);
  expect(e.sizes.filter((s) => s !== null).length).toBe(3);
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.find((p: any) => p.voice === 'trombone').down.size as number), { timeout: 5000 }).toBeGreaterThan(0);
  // a line's menu offers the trombone
  await page.locator('.pl-line').nth(3).click();
  const menu = page.locator('.pl-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.pl-pick[aria-label="trombone"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // the Air for four trombones: alto, tenor, tenor, bass
  await page.evaluate(() => {
    const o = (window as any).__orchestra;
    o.loadPiece(o.pieces.findIndex((p: any) => p.id === 'air'));
  });
  await expect.poll(async () => (await ens(page)).engines, { timeout: 10_000 }).toBe(4);
  e = await ens(page);
  expect(e.lineup).toEqual(['trombone', 'trombone', 'trombone', 'trombone']);
  expect(e.sizes).toEqual(['alto', 'tenor', 'tenor', 'bass']);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // by hand: from a string quartet, the picker adds trombones, up to three (each its own engine)
  await page.evaluate(() => (window as any).__orchestra.ensemble.setLineup(['violin', 'violin', 'viola', 'cello']));
  for (let n = 1; n <= 3; n++) {
    await page.locator('.instruments').getByRole('button', { name: 'Trombone' }).click();
    await expect.poll(async () => (await ens(page)).kinds.filter((v) => v === 'trombone').length, { timeout: 8000 }).toBe(n);
  }
  await expect(page.locator('.instruments').getByRole('button', { name: 'Trombone' }).locator('.pick-n')).toHaveText('×3');
  expect(errors).toEqual([]);
});

test('the trombone on a phone: thirteen picks in the band six took (271 px), “tbn.” under its glyph, the band no taller with a note sounding, names clear of each other, no horizontal scroll', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout');
  for (const size of [null, { width: 390, height: 844 }]) {
    if (size) await page.setViewportSize(size);
    await page.goto('/trombone');
    await startAudio(page);
    await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'trombone', null, { timeout: 15_000 });
    const band = async () => (await page.locator('.stage-top').boundingBox())!.height;
    const before = await band();
    await page.evaluate(() => (window as any).__piano.noteOn(53, 90, 'keys'));
    await expect(page.locator('.r-note')).not.toBeEmpty();
    const during = await band();
    await page.evaluate(() => (window as any).__piano.noteOff(53, 'keys'));
    expect(during, `${size?.width ?? 'Pixel 7'}`).toBe(before);
    const boxes = await page.locator('.instruments .pick').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, t: r.top })));
    expect(boxes.length).toBe(13);
    expect(boxes[12].r - boxes[0].l, 'the picks’ row').toBeLessThanOrEqual(271.5);
    expect(await page.locator('.instruments').getByRole('button', { name: 'Trombone' }).locator('.pick-name').evaluate((el) => getComputedStyle(el, '::after').content)).toBe('"tbn."');
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].l).toBeGreaterThanOrEqual(boxes[i - 1].r - 0.5);
      expect(boxes[i].t).toBeCloseTo(boxes[0].t, 0);
    }
    const names = await page.locator('.instruments .pick-name').evaluateAll((els) => els.map((el) => { const r = (el as HTMLElement).getBoundingClientRect(); return { l: r.left, r: r.right }; }));
    for (let i = 1; i < names.length; i++) expect(names[i].l, `name ${i}`).toBeGreaterThanOrEqual(names[i - 1].r - 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
