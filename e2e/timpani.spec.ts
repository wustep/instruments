// The timpani end to end: their addresses (/timpani and /kettledrums open them, a reload included), the
// picker ("timpani" under its glyph; "timp." on a phone, twelve instruments in the band six took), the keys'
// compass (C2–A3), the worklet at the sample rates the site meets (22.05 to 96 kHz) with the principal tone at
// the note, louder and brighter struck harder, two drums at once; their own piece from the overlay; and
// Orchestra mode: a constructed file whose tracks carry the names and programs real scores use ("Timpani" on
// GM 47, "Pauken" unprogrammed, with strings) routed to two sets of timpani, and a second set by hand.
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
    return { lineup: e.lineup as string[], engines: e.parts.filter((p: any) => p.engine).length as number, kinds: e.parts.map((p: any) => p.engine?.instrument ?? null) as (string | null)[] };
  });

test('/timpani and /kettledrums open the timpani (a reload too); “timpani” under its glyph; the keys C2–A3', async ({ page }) => {
  const errors = collectErrors(page);
  for (const path of ['/timpani', '/kettledrums']) {
    await page.goto(path);
    await startAudio(page);
    await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'timpani', null, { timeout: 15_000 });
    const pick = page.locator('.instruments').getByRole('button', { name: 'Timpani' });
    await expect(pick).toHaveAttribute('aria-pressed', 'true');
    await expect(pick.locator('.pick-name')).toHaveText('timpani');
    await expect(pick.locator('.pick-name')).toHaveAttribute('data-short', 'timp.');
    await expect(pick.locator('svg.glyph')).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.pathname)).toBe('/timpani');
  }
  await page.reload();
  await startAudio(page);
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'timpani', null, { timeout: 15_000 });
  await expect(page.locator('.keyboard .key[data-midi="36"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="35"]')).toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="57"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="58"]')).toHaveClass(/\bout\b/);
  // the knobs: mallet, strike point, damping, roll (desktop)
  expect(errors).toEqual([]);
});

test('the timpani through the worklet at 22.05, 44.1, 48 and 96 kHz: the principal tone at the note, louder and brighter struck harder, a double stop on two drums', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/timpani');
  await startAudio(page);
  const out: Record<string, { cents: number; peak: number; centroid: number }> = {};
  for (const [rate, midi, vel] of [[22050, 36, 70], [44100, 43, 70], [48000, 48, 30], [48000, 48, 112], [96000, 52, 70], [44100, 57, 112]] as const) {
    out[`${rate}/${midi}/${vel}`] = await page.evaluate(async ([fs, m, v]) => {
      const { renderOffline } = (window as any).__engine;
      const buf: AudioBuffer = await renderOffline({ instrument: 'timpani', sampleRate: fs, duration: 1.4, params: { room: 0 }, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: v } }] });
      const x = buf.getChannelData(0);
      const f = 440 * 2 ** ((m - 69) / 12);
      // the principal tone: the DFT's peak near the note over 0.4–1.4 s (a ringing head: the (1,1) mode)
      const s0 = Math.round(0.4 * fs);
      const W = x.length - s0;
      const mag = (hz: number) => {
        let re = 0;
        let im = 0;
        for (let i = 0; i < W; i++) {
          const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1));
          re += x[s0 + i] * w * Math.cos((2 * Math.PI * hz * i) / fs);
          im += x[s0 + i] * w * Math.sin((2 * Math.PI * hz * i) / fs);
        }
        return Math.hypot(re, im);
      };
      let best = 0;
      let bc = 0;
      for (let c = -30; c <= 30; c += 1) {
        const v2 = mag(f * 2 ** (c / 1200));
        if (v2 > best) {
          best = v2;
          bc = c;
        }
      }
      // brightness of the stroke: zero crossings in its first 0.1 s
      let zc = 0;
      const n0 = Math.round(0.02 * fs);
      for (let i = n0 + 1; i < n0 + Math.round(0.1 * fs); i++) if ((x[i] > 0) !== (x[i - 1] > 0)) zc++;
      let peak = 0;
      for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
      return { cents: bc, peak, centroid: zc / 0.1 / 2 };
    }, [rate, midi, vel] as const);
  }
  for (const [k, v] of Object.entries(out)) {
    expect(v.peak, k).toBeGreaterThan(0.005);
    expect(v.peak, k).toBeLessThanOrEqual(1);
    expect(Math.abs(v.cents), k).toBeLessThan(6);
  }
  expect(out['48000/48/112'].peak / out['48000/48/30'].peak).toBeGreaterThan(3);
  expect(out['48000/48/112'].centroid).toBeGreaterThan(out['48000/48/30'].centroid);
  // two keys at once: two drums ring (the engine's own allocation)
  await page.evaluate(() => {
    (window as any).__piano.noteOn(43, 90, 'keys');
    (window as any).__piano.noteOn(48, 90, 'keys');
  });
  await expect.poll(() => page.evaluate(() => [...(window as any).__piano.sounding].sort().join(',')), { timeout: 3000 }).toBe('43,48');
  await expect(page.locator('.key.down')).toHaveCount(2);
  await page.evaluate(() => {
    (window as any).__piano.noteOff(43, 'keys');
    (window as any).__piano.noteOff(48, 'keys');
  });
  expect(errors).toEqual([]);
});

test('the timpani play their own piece from the overlay (Mozart’s Dies irae, the timpani’s line), in their compass', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/timpani');
  await startAudio(page);
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'timpani', null, { timeout: 15_000 });
  await expect(page.locator('.pl-play')).toHaveAttribute('data-tip', /^play · Mozart, Requiem, Dies irae/);
  await page.locator('.pl-play').click();
  await expect(page.locator('.player').getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => (window as any).__player.demo?.instrument)).toBe('timpani');
  await expect.poll(() => page.locator('.key.down').count(), { timeout: 4000 }).toBeGreaterThan(0);
  const m = Number(await page.locator('.key.down').first().getAttribute('data-midi'));
  expect([45, 50]).toContain(m);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('orchestra: “Timpani” (GM 47) and “Pauken” (no program) go to two sets of timpani beside the strings; the routing offers them; a set by hand', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  const name = (t: string) => [0xff, 0x03, t.length, ...[...t].map((c) => c.charCodeAt(0))];
  // a piece in C: the timpani on C3 and G2, strings above
  const parts = [
    ['Timpani', 47, [48, 43, 48, 43, 48, 48, 43, 48]],
    ['Pauken', -1, [43, 48, 43, 48, 43, 43, 48, 43]],
    ['Violin I', 40, [72, 76, 79, 84, 79, 76, 72, 67]],
    ['Violoncello', 42, [48, 52, 55, 48, 43, 47, 50, 48]],
  ] as const;
  const tracks: [number, ...number[]][][] = [[[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]]];
  parts.forEach(([n, prog, ns], ch) => {
    const t: [number, ...number[]][] = [[0, ...name(n)]];
    if (prog >= 0) t.push([0, 0xc0 | ch, prog]);
    for (let r = 0; r < 3; r++) for (const m of ns) t.push([0, 0x90 | ch, m, 90], [240, 0x80 | ch, m, 0]);
    tracks.push(t);
  });
  const file = smf(480, tracks);
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'timpani.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, Array.from(file));
  await expect.poll(async () => (await ens(page)).engines, { timeout: 10_000 }).toBe(4);
  const e = await ens(page);
  expect(e.lineup.filter((v) => v === 'timpani').length).toBe(2);
  expect(e.kinds.filter((v) => v === 'timpani').length).toBe(2);
  for (const k of [0, 1]) await expect(page.locator('.pl-line').nth(k)).toHaveAttribute('data-voice', 'timpani');
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.filter((p: any) => p.voice === 'timpani').some((p: any) => p.down.size > 0) as boolean), { timeout: 5000 }).toBe(true);
  // a line's menu offers the timpani
  await page.locator('.pl-line').nth(2).click();
  const menu = page.locator('.pl-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.pl-pick[aria-label="timpani"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // by hand: a string quartet, then the picker adds timpani, up to two (each its own engine)
  await page.evaluate(() => (window as any).__orchestra.ensemble.setLineup(['violin', 'violin', 'viola', 'cello']));
  for (let n = 1; n <= 2; n++) {
    await page.locator('.instruments').getByRole('button', { name: 'Timpani' }).click();
    await expect.poll(async () => (await ens(page)).kinds.filter((v) => v === 'timpani').length, { timeout: 8000 }).toBe(n);
  }
  await expect(page.locator('.instruments').getByRole('button', { name: 'Timpani' }).locator('.pick-n')).toHaveText('×2');
  expect(errors).toEqual([]);
});

test('the timpani on a phone: twelve picks in the band six took (271 px), “timp.” under their glyph, the band no taller with a note sounding, names clear of each other, no horizontal scroll', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout');
  for (const size of [null, { width: 390, height: 844 }]) {
    if (size) await page.setViewportSize(size);
    await page.goto('/');
    await startAudio(page);
    await page.locator('.instruments').getByRole('button', { name: 'Timpani' }).click();
    await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'timpani', null, { timeout: 15_000 });
    const band = async () => (await page.locator('.stage-top').boundingBox())!.height;
    const before = await band();
    await page.evaluate(() => (window as any).__piano.noteOn(48, 90, 'keys'));
    await expect(page.locator('.r-note')).not.toBeEmpty();
    const during = await band();
    await page.evaluate(() => (window as any).__piano.noteOff(48, 'keys'));
    expect(during, `${size?.width ?? 'Pixel 7'}`).toBe(before);
    const boxes = await page.locator('.instruments .pick').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, t: r.top })));
    expect(boxes.length).toBe(12);
    expect(boxes[11].r - boxes[0].l, 'the picks’ row').toBeLessThanOrEqual(271.5);
    expect(await page.locator('.instruments').getByRole('button', { name: 'Timpani' }).locator('.pick-name').evaluate((el) => getComputedStyle(el, '::after').content)).toBe('"timp."');
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].l).toBeGreaterThanOrEqual(boxes[i - 1].r - 0.5);
      expect(boxes[i].t).toBeCloseTo(boxes[0].t, 0);
    }
    const names = await page.locator('.instruments .pick-name').evaluateAll((els) => els.map((el) => { const r = (el as HTMLElement).getBoundingClientRect(); return { l: r.left, r: r.right }; }));
    for (let i = 1; i < names.length; i++) expect(names[i].l, `name ${i}`).toBeGreaterThanOrEqual(names[i - 1].r - 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
