// The oboe end to end: the picker (eight instruments then, ten since the clarinet and the bassoon, the phone's band no taller for it), the keys'
// compass (B♭3–A6, concert pitch), the worklet at the sample rates the site meets (22.05 to 96 kHz) on
// the note's own register, its own piece from the overlay, and Orchestra mode: a constructed file whose
// tracks carry the names and programs real scores use (Oboe I on GM 68, "Hautbois" unprogrammed, a
// "Corno inglese" on GM 69, with strings) routed to oboes, and a second oboe by hand.
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

test('the oboe: “oboe” under its glyph; the keys B♭3–A6; at concert pitch and on its own register through the worklet at 22.05, 44.1, 48 and 96 kHz', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  const pick = page.locator('.instruments').getByRole('button', { name: 'Oboe' });
  await expect(pick.locator('.pick-name')).toHaveText('oboe');
  await expect(pick.locator('svg.glyph')).toBeVisible();
  await pick.click();
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'oboe', null, { timeout: 15_000 });
  await expect(pick).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.keyboard .key[data-midi="58"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="57"]')).toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="93"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="94"]')).toHaveClass(/\bout\b/);
  for (const [rate, midi, vel] of [[22050, 69, 70], [44100, 58, 70], [48000, 74, 30], [48000, 81, 112], [96000, 64, 70]] as const) {
    const out = await page.evaluate(async ([fs, m, v]) => {
      const { renderOffline } = (window as any).__engine;
      const buf: AudioBuffer = await renderOffline({ instrument: 'oboe', sampleRate: fs, duration: 1.4, params: { room: 0, vibrato: 0 }, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: v } }] });
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const x = L.map((s, i) => 0.5 * (s + R[i]));
      const f = 440 * 2 ** ((m - 69) / 12);
      const s0 = Math.round(0.8 * fs);
      const W = Math.round(0.35 * fs);
      const ac = (lag: number) => {
        let s = 0;
        for (let i = 0; i < W; i++) s += x[s0 + i] * x[s0 + i + lag];
        return s;
      };
      const e0 = ac(0);
      // the period: the note's, not its octave's or twelfth's (the correlation at T/2 and T/3 stays low)
      const at = (T: number) => {
        let b = -Infinity;
        for (let lag = Math.floor(T * 0.97); lag <= Math.ceil(T * 1.03); lag++) b = Math.max(b, ac(lag));
        return b / e0;
      };
      let best = -Infinity;
      let bl = 0;
      for (let lag = Math.floor(fs / (f * 1.05)); lag <= Math.ceil(fs / (f * 0.95)); lag++) {
        const v2 = ac(lag);
        if (v2 > best) [best, bl] = [v2, lag];
      }
      const a = ac(bl - 1);
      const b = ac(bl);
      const c = ac(bl + 1);
      const fm = fs / (bl + (0.5 * (a - c)) / (a - 2 * b + c));
      let peak = 0;
      for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      return { cents: 1200 * Math.log2(fm / f), peak, n: x.length, half: at(fs / f / 2), third: at(fs / f / 3), whole: at(fs / f) };
    }, [rate, midi, vel] as const);
    const who = `${rate} Hz, MIDI ${midi}, velocity ${vel}`;
    expect(out.n, who).toBe(Math.round(1.4 * rate));
    expect(out.peak, who).toBeGreaterThan(0.01);
    expect(out.peak, who).toBeLessThanOrEqual(1);
    expect(out.whole, who).toBeGreaterThan(0.85);
    expect(out.half, who).toBeLessThan(0.85);
    expect(out.third, who).toBeLessThan(0.85);
    expect(Math.abs(out.cents), who).toBeLessThan(8);
  }
  expect(errors).toEqual([]);
});

test('the oboe plays its own piece from the overlay (the oboe’s line of Brandenburg No. 1’s Adagio), in its compass, one note at a time', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  await page.locator('.instruments').getByRole('button', { name: 'Oboe' }).click();
  await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'oboe', null, { timeout: 15_000 });
  await expect(page.locator('.pl-play')).toHaveAttribute('data-tip', /^play · Bach, Brandenburg Concerto No\. 1, Adagio/);
  await page.locator('.pl-play').click();
  await expect(page.locator('.player').getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => (window as any).__player.demo?.instrument)).toBe('oboe');
  await expect(page.locator('.key.down')).toHaveCount(1, { timeout: 4000 });
  const m = Number(await page.locator('.key.down').getAttribute('data-midi'));
  expect(m).toBeGreaterThanOrEqual(58);
  expect(m).toBeLessThanOrEqual(93);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('orchestra: Oboe I (GM 68), “Hautbois” (no program) and a Corno inglese (GM 69) go to oboes beside the strings; the routing offers the oboe; a second oboe by hand is its own engine', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto('/');
  await startAudio(page);
  const name = (t: string) => [0xff, 0x03, t.length, ...[...t].map((c) => c.charCodeAt(0))];
  const parts = [
    ['Oboe I', 68, [81, 79, 77, 76]],
    ['Hautbois', -1, [74, 72, 71, 72]],
    ['Corno inglese', 69, [64, 62, 60, 59]],
    ['Violin I', 40, [76, 79, 81, 79]],
    ['Violoncello', 42, [48, 50, 43, 48]],
  ] as const;
  const tracks: [number, ...number[]][][] = [[[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]]];
  parts.forEach(([n, prog, ns], ch) => {
    const t: [number, ...number[]][] = [[0, ...name(n)]];
    if (prog >= 0) t.push([0, 0xc0 | ch, prog]);
    for (let r = 0; r < 3; r++) for (const m of ns) t.push([0, 0x90 | ch, m, 80], [960, 0x80 | ch, m, 0]);
    tracks.push(t);
  });
  const file = smf(480, tracks);
  await page.evaluate((b) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(b)], 'oboes.mid', { type: 'audio/midi' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
  }, Array.from(file));
  await expect.poll(async () => (await ens(page)).engines, { timeout: 10_000 }).toBe(5);
  const e = await ens(page);
  expect(e.lineup.filter((v) => v === 'oboe').length).toBe(3);
  expect(e.kinds.filter((v) => v === 'oboe').length).toBe(3);
  for (const k of [0, 1, 2]) await expect(page.locator('.pl-line').nth(k)).toHaveAttribute('data-voice', 'oboe');
  await expect(page.locator('.pl-line').nth(3)).toHaveAttribute('data-voice', 'violin');
  // the cor anglais's line, below the oboe's B♭3 in part, moves up an octave on the oboe; the others as written
  const shifts = await page.evaluate(() => (window as any).__orchestra.ensemble.plan.lines.map((rs: any[]) => rs.map((r) => r.shift)));
  expect(shifts[0]).toEqual([0]);
  expect(shifts[1]).toEqual([0]);
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.find((p: any) => p.voice === 'oboe').down.size as number), { timeout: 5000 }).toBeGreaterThan(0);
  // a line's menu offers the oboe
  await page.locator('.pl-line').nth(3).click();
  const menu = page.locator('.pl-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.pl-pick[aria-label="oboe"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // by hand: from a string quartet, the picker adds an oboe and then a second (each its own engine)
  await page.evaluate(() => (window as any).__orchestra.ensemble.setLineup(['violin', 'violin', 'viola', 'cello']));
  await page.locator('.instruments').getByRole('button', { name: 'Oboe' }).click();
  await expect.poll(async () => (await ens(page)).lineup.filter((v) => v === 'oboe').length, { timeout: 8000 }).toBe(1);
  await page.locator('.instruments').getByRole('button', { name: 'Oboe' }).click();
  await expect.poll(async () => (await ens(page)).kinds.filter((v) => v === 'oboe').length, { timeout: 8000 }).toBe(2);
  expect(errors).toEqual([]);
});

test('ten instruments on a phone: the picker keeps to its band (no taller with a note sounding), every pick whole and clear of its neighbours, no horizontal scroll', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the phone layout');
  for (const size of [null, { width: 390, height: 844 }]) {
    if (size) await page.setViewportSize(size);
    await page.goto('/');
    await startAudio(page);
    await page.locator('.instruments').getByRole('button', { name: 'Oboe' }).click();
    await page.waitForFunction(() => (window as any).__piano.piano?.instrument === 'oboe', null, { timeout: 15_000 });
    const band = async () => (await page.locator('.stage-top').boundingBox())!.height;
    const before = await band();
    await page.evaluate(() => (window as any).__piano.noteOn(81, 90, 'keys'));
    await expect(page.locator('.r-note')).not.toBeEmpty();
    const during = await band();
    await page.evaluate(() => (window as any).__piano.noteOff(81, 'keys'));
    expect(during, `${size?.width ?? 'Pixel 7'}`).toBe(before);
    const boxes = await page.locator('.instruments .pick').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, t: r.top })));
    expect(boxes.length).toBe(12);
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].l).toBeGreaterThanOrEqual(boxes[i - 1].r - 0.5);
      expect(boxes[i].t).toBeCloseTo(boxes[0].t, 0);
    }
    // the names fit their buttons' row: none runs into its neighbour's
    const names = await page.locator('.instruments .pick-name').evaluateAll((els) => els.map((el) => { const r = (el as HTMLElement).getBoundingClientRect(); return { l: r.left, r: r.right, w: (el as HTMLElement).scrollWidth }; }));
    for (let i = 1; i < names.length; i++) expect(names[i].l, `name ${i}`).toBeGreaterThanOrEqual(names[i - 1].r - 0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
