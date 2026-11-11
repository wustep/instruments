// The tuba end to end: its address (/tuba, a reload included), the picker ("tuba" under its glyph), the keys'
// compass (C1–F4), the worklet at the sample rates the site meets (22.05 to 96 kHz) at pitch on the note's own
// partial; on the stage in both 2D styles (whole, clear of the file player, the pistons down for the engine's
// fingering and up again) and in 3D (whole on a desktop and a phone, the pistons moving, not one WebGL error or
// warning); its own piece from the overlay; and Orchestra mode: a file whose tracks carry the names and
// programs real scores use ("Tuba" on GM 59, trombones beside it, a "Low Brass" line under them) routed to
// tubas and trombones, the tuba in the brass row, and the tuba by hand from the picker.
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
const collectGl = (page: Page) => {
  const msgs: string[] = [];
  page.on('console', (m) => {
    if (/webgl|GL_[A-Z_]{4,}|feedback loop|framebuffer/i.test(m.text())) msgs.push(`${m.type()}: ${m.text()}`);
  });
  return msgs;
};
async function startAudio(page: Page) {
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano?.instrument === 'tuba', null, { timeout: 30_000 });
}
const ens = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    return { lineup: e.lineup as string[], engines: e.parts.filter((p: any) => p.engine).length as number, kinds: e.parts.map((p: any) => p.engine?.instrument ?? null) as (string | null)[] };
  });
type Drawn = { body: Box; valves: Box; mouth: Box; bell: Box; levers: number; buttons: number[]; stage: Box };
type Box = { x0: number; y0: number; x1: number; y1: number };
const drawn = (page: Page) => page.evaluate(() => (window as any).__tuba2d() as Drawn | null);

test('/tuba opens the tuba (a reload too); “tuba” under its glyph; the keys C1–F4', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/tuba');
  await startAudio(page);
  const pick = page.locator('.pick[aria-label="Tuba"]');
  await expect(pick).toHaveAttribute('aria-pressed', 'true');
  await expect(pick.locator('.pick-name')).toHaveText('tuba');
  await openPicker(page);
  await expect(pick.locator('svg.glyph')).toBeVisible();
  await closePicker(page);
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe('/tuba');
  await page.reload();
  await startAudio(page);
  await expect(page.locator('.keyboard .key[data-midi="24"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="23"]')).toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="65"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="66"]')).toHaveClass(/\bout\b/);
  expect(errors).toEqual([]);
});

test('the tuba through the worklet at 22.05, 44.1, 48 and 96 kHz: at pitch on its own partial, louder with velocity', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/tuba');
  await startAudio(page);
  const levels: Record<string, number> = {};
  for (const [rate, midi, vel] of [[22050, 36, 70], [44100, 29, 70], [48000, 41, 30], [48000, 41, 112], [48000, 25, 70], [96000, 53, 70], [44100, 65, 112]] as const) {
    const out = await page.evaluate(async ([fs, m, v]) => {
      const { renderOffline } = (window as any).__engine;
      const buf: AudioBuffer = await renderOffline({ instrument: 'tuba', sampleRate: fs, duration: 1.8, params: { room: 0, vibrato: 0 }, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: v } }] });
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const x = L.map((s, i) => 0.5 * (s + R[i]));
      const f = 440 * 2 ** ((m - 69) / 12);
      const s0 = Math.round(1.0 * fs);
      const W = Math.round(0.5 * fs);
      let e = 0;
      for (let i = 0; i < W; i++) e += x[s0 + i] ** 2;
      // the period by autocorrelation, searched a fourth each way: a neighbouring partial shows as its own pitch
      const ac = (lag: number) => {
        let s = 0;
        for (let i = 0; i < W; i++) s += x[s0 + i] * x[s0 + i + lag];
        return s;
      };
      let best = -Infinity;
      let bl = 0;
      for (let lag = Math.floor(fs / (f * 1.3)); lag <= Math.ceil(fs / (f * 0.77)); lag++) {
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
    expect(out.n, who).toBe(Math.round(1.8 * rate));
    expect(out.peak, who).toBeGreaterThan(0.01);
    expect(out.peak, who).toBeLessThanOrEqual(1);
    expect(Math.abs(out.cents), who).toBeLessThan(8);
    levels[`${midi}/${vel}`] = out.db;
  }
  expect(levels['41/112'] - levels['41/30']).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

for (const look of ['2d', 'vector'] as const)
  test(`2D (${look}): the tuba whole on the stage, clear of the file player; the pistons go down for the engine’s fingering and come up after; the computer’s keys play it`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`/tuba?view=${look}`);
    await startAudio(page);
    await expect.poll(() => drawn(page), { timeout: 10_000 }).not.toBeNull();
    const d0 = (await drawn(page))!;
    const over = await page.evaluate(() => document.querySelector('.player .pl-row')!.getBoundingClientRect().bottom);
    expect(d0.body.x0).toBeGreaterThanOrEqual(d0.stage.x0);
    expect(d0.body.x1).toBeLessThanOrEqual(d0.stage.x1);
    expect(d0.body.y0).toBeGreaterThanOrEqual(over - 1);
    expect(d0.body.y1).toBeLessThanOrEqual(d0.stage.y1);
    // the bell over the valves, the mouthpiece beside the bell
    expect(d0.bell.y1).toBeLessThan(d0.valves.y0);
    expect(d0.mouth.x0).toBeGreaterThan(d0.valves.x1);
    expect(d0.levers).toBe(0);
    // F1: valves 1 and 4, their buttons down
    await page.evaluate(() => (window as any).__piano.noteOn(29, 90, 'midi'));
    await expect.poll(async () => (await drawn(page))!.levers, { timeout: 5000 }).toBe(0b1001);
    await expect.poll(async () => (await drawn(page))!.buttons[0] - d0.buttons[0], { timeout: 3000 }).toBeGreaterThan(1.5);
    const d1 = (await drawn(page))!;
    expect(d1.buttons[3] - d0.buttons[3]).toBeGreaterThan(1.5);
    expect(Math.abs(d1.buttons[1] - d0.buttons[1])).toBeLessThan(0.6);
    await expect(page.locator('.readout .r-note')).toHaveText(/F\s*1/);
    await page.evaluate(() => (window as any).__piano.noteOff(29, 'midi'));
    await expect.poll(async () => (await drawn(page))!.levers, { timeout: 5000 }).toBe(0);
    // the computer's keys: A is the C under the keys (C2 on the tuba), open; S, the D above it, the fourth valve
    await page.locator('.stage-cv').click({ position: { x: 40, y: 200 } });
    await page.keyboard.down('s');
    await expect.poll(async () => (await drawn(page))!.levers, { timeout: 5000 }).toBe(0b1000);
    await page.keyboard.up('s');
    expect(errors).toEqual([]);
  });

test('3D: the tuba whole on the stage, clear of the file player; a note presses its pistons; not one WebGL error or warning', async ({ page }) => {
  const errors = collectErrors(page);
  const gl = collectGl(page);
  await page.goto('/tuba?view=3d');
  await startAudio(page);
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 5 && !!(window as any).__tuba3d, null, { timeout: 30_000 });
  const seen = () =>
    page.evaluate(() => {
      const s = (window as any).__stage3d;
      const cv = s.el.getBoundingClientRect();
      return { box: s.box() as Box | null, w: cv.width, h: cv.height, over: document.querySelector('.player .pl-row')!.getBoundingClientRect().bottom - cv.top };
    });
  await expect.poll(async () => !!(await seen()).box, { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(900);
  const v = await seen();
  expect(v.box!.x0).toBeGreaterThanOrEqual(-1);
  expect(v.box!.x1).toBeLessThanOrEqual(v.w + 1);
  expect(v.box!.y0).toBeGreaterThanOrEqual(v.over - 2);
  expect(v.box!.y1).toBeLessThanOrEqual(v.h + 1);
  // it fills a good share of the free stage
  expect((v.box!.y1 - v.box!.y0) / (v.h - v.over)).toBeGreaterThan(0.55);
  expect(await page.evaluate(() => (window as any).__tuba3d.pistons())).toEqual([0, 0, 0, 0]);
  // D♭1: all four pistons; C2: none
  await page.evaluate(() => (window as any).__piano.noteOn(25, 90, 'midi'));
  await expect.poll(async () => ((await page.evaluate(() => (window as any).__tuba3d.pistons())) as number[]).every((p) => p > 0.9), { timeout: 5000 }).toBe(true);
  await page.evaluate(() => {
    (window as any).__piano.noteOff(25, 'midi');
    (window as any).__piano.noteOn(36, 90, 'midi');
  });
  await expect.poll(async () => ((await page.evaluate(() => (window as any).__tuba3d.pistons())) as number[]).every((p) => p < 0.1), { timeout: 5000 }).toBe(true);
  const errs = await page.evaluate(async () => {
    const g = (window as any).__stage3d.r3.r.getContext() as WebGL2RenderingContext;
    let n = 0;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      for (let e = g.getError(); e; e = g.getError()) n++;
    }
    return n;
  });
  expect(errs).toBe(0);
  await page.evaluate(() => (window as any).__piano.noteOff(36, 'midi'));
  expect(gl).toEqual([]);
  expect(errors).toEqual([]);
});

test('the tuba plays its own piece from the overlay (the Air’s bass line, an octave down), in its compass, one note at a time', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/tuba');
  await startAudio(page);
  await expect(page.locator('.pl-play')).toHaveAttribute('data-tip', /^play · Bach, Air/);
  await page.locator('.pl-play').click();
  await expect(page.locator('.player').getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => (window as any).__player.demo?.instrument)).toBe('tuba');
  await expect(page.locator('.key.down')).toHaveCount(1, { timeout: 4000 });
  const m = Number(await page.locator('.key.down').getAttribute('data-midi'));
  expect(m).toBeGreaterThanOrEqual(24);
  expect(m).toBeLessThanOrEqual(65);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('orchestra: “Tuba” (GM 59) and a “Low Brass” line go to tubas beside the trombones; a file without them routes as it did; the tuba sits in the brass row; by hand from the picker', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'files are dropped on desktops');
  const errors = collectErrors(page);
  await page.goto('/');
  await page.evaluate(() => (window as any).__piano.start());
  await page.waitForFunction(() => (window as any).__piano?.status === 'running', null, { timeout: 30_000 });
  const name = (t: string) => [0xff, 0x03, t.length, ...[...t].map((c) => c.charCodeAt(0))];
  const scale = [0, 2, 4, 5, 7, 5, 4, 2];
  const drop = async (parts: readonly (readonly [string, number, number])[], file: string) => {
    const tracks: [number, ...number[]][][] = [[[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]]];
    parts.forEach(([n, prog, base], ch) => {
      const t: [number, ...number[]][] = [[0, ...name(n)]];
      if (prog >= 0) t.push([0, 0xc0 | ch, prog]);
      for (let r = 0; r < 3; r++) for (const s of scale) t.push([0, 0x90 | ch, base + s, 80], [480, 0x80 | ch, base + s, 0]);
      tracks.push(t);
    });
    await page.evaluate(
      ([b, f]) => {
        const dt = new DataTransfer();
        dt.items.add(new File([new Uint8Array(b as number[])], f as string, { type: 'audio/midi' }));
        window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt }));
        window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, cancelable: true }));
      },
      [Array.from(smf(480, tracks)), file] as const,
    );
  };
  // a trumpet, a trombone, a bass trombone, the tuba, a low line named only "Low Brass", a cello (six lines: a
  // dropped file seats six instruments at most)
  await drop([['Trumpet', 56, 65], ['Trombone', 57, 55], ['Bass Trombone', 57, 38], ['Tuba', 58, 29], ['Low Brass', 61, 28], ['Violoncello', 42, 43]], 'brass.mid');
  await expect.poll(async () => (await ens(page)).engines, { timeout: 15_000 }).toBe(6);
  const e = await ens(page);
  const voices = await page.locator('.pl-line').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.voice));
  expect(voices).toEqual(['trumpet', 'trombone', 'trombone', 'tuba', 'tuba', 'cello']);
  expect(e.kinds.filter((v) => v === 'tuba').length).toBe(2);
  // every line at its pitch (no octave moved)
  expect(await page.evaluate(() => (window as any).__orchestra.ensemble.plan.lines.map((rs: any[]) => rs.map((r) => r.shift)).flat())).toEqual([0, 0, 0, 0, 0, 0]);
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.find((p: any) => p.voice === 'tuba').down.size as number), { timeout: 8000 }).toBeGreaterThan(0);
  // a line's menu offers the tuba
  await page.locator('.pl-line').nth(5).click();
  await expect(page.locator('.pl-menu .pl-pick[aria-label="tuba"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // the same brass without a tuba part: the trombones and the trumpet as they were
  await drop([['Trumpet', 56, 65], ['Trombone', 57, 55], ['Trombone 2', 57, 48], ['Bass Trombone', 57, 38], ['Violoncello', 42, 43]], 'brass-no-tuba.mid');
  await expect.poll(async () => page.locator('.pl-line').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.voice)), { timeout: 15_000 }).toEqual(['trumpet', 'trombone', 'trombone', 'trombone', 'cello']);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // by hand: an orchestra with a tuba from the picker; it sits in the brass row, at its right end
  await page.evaluate(() => (window as any).__orchestra.ensemble.setLineup(['flute', 'oboe', 'horn', 'trumpet', 'trombone', 'violin', 'violin', 'viola', 'cello']));
  await openPicker(page).then(() => page.locator('.pick[aria-label="Tuba"]').click());
  await expect.poll(async () => (await ens(page)).kinds.filter((v) => v === 'tuba').length, { timeout: 10_000 }).toBe(1);
  const lineup = (await ens(page)).lineup;
  expect(lineup.indexOf('tuba')).toBe(lineup.indexOf('trombone') + 1);
  expect(errors).toEqual([]);
});
