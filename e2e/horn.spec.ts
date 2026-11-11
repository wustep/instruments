// The horn end to end: its addresses (/horn and /french-horn open it, a reload included), the picker ("horn"
// under its glyph, eleven instruments in the phone's band), the keys' compass (B♭1–F5 as it sounds), the
// worklet at the sample rates the site meets (22.05 to 96 kHz) at pitch on the note's own partial (a
// neighbour, high up, is a tone or less away), its own piece from the overlay, and Orchestra mode: a
// constructed file whose tracks carry the names and programs real scores use ("Corno I in F" on GM 60 as it
// sounds, "Horn in F" typed at its written pitch, "Hn. 3" unprogrammed, with strings) routed to horns, the
// written part a fifth down, and the third and fourth horns by hand.
import { test, expect, type Page } from '@playwright/test';
import { closePicker, openPicker } from './picker.ts';
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

test('/horn and /french-horn open the horn (a reload too); “horn” under its glyph; the keys B♭1–F5', async ({ page }) => {
  const errors = collectErrors(page);
  for (const path of ['/horn', '/french-horn']) {
    await page.goto(path);
    await startAudio(page);
    await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'horn', null, { timeout: 15_000 });
    const pick = page.locator('.pick[aria-label="Horn"]');
    await expect(pick).toHaveAttribute('aria-pressed', 'true');
    await expect(pick.locator('.pick-name')).toHaveText('horn');
    // (where the picker is a sheet, its glyph shows with the sheet open)
    await openPicker(page);
    await expect(pick.locator('svg.glyph')).toBeVisible();
    await closePicker(page);
    // the address the page keeps is the instrument's own
    await expect.poll(() => page.evaluate(() => location.pathname)).toBe('/horn');
  }
  await page.reload();
  await startAudio(page);
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'horn', null, { timeout: 15_000 });
  await expect(page.locator('.keyboard .key[data-midi="34"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="33"]')).toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="77"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="78"]')).toHaveClass(/\bout\b/);
  expect(errors).toEqual([]);
});

test('the horn through the worklet at 22.05, 44.1, 48 and 96 kHz: at pitch on its own partial (F and B♭ sides), louder with velocity', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/horn');
  await startAudio(page);
  const levels: Record<string, number> = {};
  for (const [rate, midi, vel] of [[22050, 41, 70], [44100, 35, 70], [48000, 53, 30], [48000, 53, 112], [48000, 65, 70], [96000, 74, 70], [44100, 77, 112]] as const) {
    const out = await page.evaluate(async ([fs, m, v]) => {
      const { renderOffline } = (window as any).__engine;
      const buf: AudioBuffer = await renderOffline({ instrument: 'horn', sampleRate: fs, duration: 1.4, params: { room: 0, vibrato: 0 }, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: v } }] });
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const x = L.map((s, i) => 0.5 * (s + R[i]));
      const f = 440 * 2 ** ((m - 69) / 12);
      const s0 = Math.round(0.8 * fs);
      const W = Math.round(0.35 * fs);
      let e = 0;
      for (let i = 0; i < W; i++) e += x[s0 + i] ** 2;
      // the period by autocorrelation, searched over half an octave each way: a neighbouring partial
      // (a tone or a third away) shows as its own pitch
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
    expect(out.peak, who).toBeGreaterThan(0.01);
    expect(out.peak, who).toBeLessThanOrEqual(1);
    expect(Math.abs(out.cents), who).toBeLessThan(8);
    levels[`${midi}/${vel}`] = out.db;
  }
  expect(levels['53/112'] - levels['53/30']).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

test('the horn plays its own piece from the overlay (the horn’s line of Beethoven’s Horn Sonata), in its compass, one note at a time', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/horn');
  await startAudio(page);
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'horn', null, { timeout: 15_000 });
  await expect(page.locator('.pl-play')).toHaveAttribute('data-tip', /^play · Beethoven, Horn Sonata, Allegro moderato/);
  await page.locator('.pl-play').click();
  await expect(page.locator('.player').getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => (window as any).__player.demo?.instrument)).toBe('horn');
  await expect(page.locator('.key.down')).toHaveCount(1, { timeout: 4000 });
  const m = Number(await page.locator('.key.down').getAttribute('data-midi'));
  expect(m).toBeGreaterThanOrEqual(34);
  expect(m).toBeLessThanOrEqual(77);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('orchestra: “Corno I in F” (GM 60), a “Horn in F” typed at its written pitch and “Hn. 3” go to horns beside the strings, the written part a fifth down; the routing offers the horn; horns by hand up to four', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  const name = (t: string) => [0xff, 0x03, t.length, ...[...t].map((c) => c.charCodeAt(0))];
  // a piece in F major: the strings and two horn parts as they sound; one horn part as it is read (in C, a
  // fifth above the sound), its tonic triad the most
  const F = [53, 57, 60, 65, 55, 58, 62, 64];
  const C = [60, 64, 67, 72, 62, 65, 69, 71];
  const parts = [
    ['Corno I in F', 60, F.map((m) => m + 12)],
    ['Horn in F', -1, C],
    ['Hn. 3', -1, F],
    ['Violin I', 40, F.map((m) => m + 19)],
    ['Violoncello', 42, F.map((m) => m - 12)],
  ] as const;
  const tracks: [number, ...number[]][][] = [[[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]]];
  parts.forEach(([n, prog, ns], ch) => {
    const t: [number, ...number[]][] = [[0, ...name(n)]];
    if (prog >= 0) t.push([0, 0xc0 | ch, prog]);
    // the tonic's notes twice as often: a key the pitch classes tell
    for (let r = 0; r < 3; r++) for (const [k, m] of ns.entries()) for (let rep = 0; rep < (k < 4 ? 2 : 1); rep++) t.push([0, 0x90 | ch, m, 80], [480, 0x80 | ch, m, 0]);
    tracks.push(t);
  });
  const file = smf(480, tracks);
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'horns.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, Array.from(file));
  await expect.poll(async () => (await ens(page)).engines, { timeout: 10_000 }).toBe(5);
  const e = await ens(page);
  expect(e.lineup.filter((v) => v === 'horn').length).toBe(3);
  expect(e.kinds.filter((v) => v === 'horn').length).toBe(3);
  for (const k of [0, 1, 2]) await expect(page.locator('.pl-line').nth(k)).toHaveAttribute('data-voice', 'horn');
  // the parts as they sound stay; the written one plays a fifth lower (by octaves into the compass)
  const shifts = await page.evaluate(() => (window as any).__orchestra.ensemble.plan.lines.map((rs: any[]) => rs.map((r) => r.shift)));
  expect(shifts[0]).toEqual([0]);
  expect(shifts[2]).toEqual([0]);
  expect(((shifts[1][0] % 12) + 12) % 12).toBe(5);
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.find((p: any) => p.voice === 'horn').down.size as number), { timeout: 5000 }).toBeGreaterThan(0);
  // a line's menu offers the horn
  await page.locator('.pl-line').nth(3).click();
  const menu = page.locator('.pl-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.pl-pick[aria-label="horn"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // by hand: from a string quartet, the picker adds horns, up to four (each its own engine)
  await page.evaluate(() => (window as any).__orchestra.ensemble.setLineup(['violin', 'violin', 'viola', 'cello']));
  for (let n = 1; n <= 4; n++) {
    await openPicker(page).then(() => page.locator('.pick[aria-label="Horn"]').click());
    await expect.poll(async () => (await ens(page)).kinds.filter((v) => v === 'horn').length, { timeout: 8000 }).toBe(n);
  }
  await expect(page.locator('.pick[aria-label="Horn"]').locator('.pick-n')).toHaveText('×4');
  expect(errors).toEqual([]);
});
