// The zephyr end to end: its address (/zephyr, a reload included), the picker ("zephyr" under its glyph, a
// family of its own), the keys' compass (C2–C7), the worklet at the sample rates the site meets (22.05 to 96
// kHz) at pitch, held while its key is and gone when it is let go; on the stage in both 2D styles (whole,
// clear of the file player, the blown ribbon swinging, its slot lit and its key down, the knobs at the
// engine's own values) and in 3D (whole, the ribbon swinging, the key down, not one WebGL error or warning);
// its own piece from the overlay; and Orchestra mode: a file whose tracks are named for it routed to one
// zephyr, a file without it routed as it was, and the zephyr by hand from the picker.
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
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano?.instrument === 'zephyr', null, { timeout: 30_000 });
}
const ens = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    return { lineup: e.lineup as string[], engines: e.parts.filter((p: any) => p.engine).length as number, kinds: e.parts.map((p: any) => p.engine?.instrument ?? null) as (string | null)[] };
  });
type Box = { x0: number; y0: number; x1: number; y1: number };
type Drawn = { body: Box; ribbons: Box; keys: Box; blade: Box; ringing: number; widest: number; swing: number; blowing: number; slots: { i: number; box: Box }[]; down: number[]; stage: Box };
const drawn = (page: Page) => page.evaluate(() => (window as any).__zephyr2d() as Drawn | null);

test('/zephyr opens the zephyr (a reload too); “zephyr” under its glyph, a family of its own; the keys C2–C7', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/zephyr');
  await startAudio(page);
  const pick = page.locator('.pick[aria-label="Zephyr"]');
  await expect(pick).toHaveAttribute('aria-pressed', 'true');
  await expect(pick.locator('.pick-name')).toHaveText('zephyr');
  await openPicker(page);
  await expect(pick.locator('svg.glyph')).toBeVisible();
  expect(await page.locator('.fam[data-fam="future"] .pick').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Zephyr']);
  await closePicker(page);
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe('/zephyr');
  await page.reload();
  await startAudio(page);
  await expect(page.locator('.keyboard .key[data-midi="36"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="35"]')).toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="96"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="97"]')).toHaveClass(/\bout\b/);
  expect(errors).toEqual([]);
});

test('the zephyr through the worklet at 22.05, 44.1, 48 and 96 kHz: at pitch, louder with velocity, held while its key is and gone when it is let go', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/zephyr');
  await startAudio(page);
  const levels: Record<string, number> = {};
  for (const [rate, midi, vel] of [[22050, 48, 80], [44100, 36, 80], [48000, 60, 30], [48000, 60, 112], [48000, 84, 80], [96000, 67, 80], [44100, 96, 100]] as const) {
    const out = await page.evaluate(async ([fs, m, v]) => {
      const { renderOffline } = (window as any).__engine;
      const buf: AudioBuffer = await renderOffline({ instrument: 'zephyr', sampleRate: fs, duration: 2.4, params: { room: 0, human: 0 }, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: v } }, { time: 1.6, event: { type: 'noteOff', midi: m } }] });
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const x = L.map((s, i) => 0.5 * (s + R[i]));
      const f = 440 * 2 ** ((m - 69) / 12);
      const s0 = Math.round(0.9 * fs);
      const W = Math.round(0.3 * fs);
      const en = (from: number, len: number) => {
        let e = 0;
        const a = Math.round(from * fs);
        const n = Math.round(len * fs);
        for (let i = 0; i < n; i++) e += x[a + i] ** 2;
        return 10 * Math.log10(e / n + 1e-20);
      };
      // the period by autocorrelation over as many periods as fit a lag near 20 ms, searched 3 % each way (or
      // 0.4 of a period, where that is less: a held note is as like itself one period on as at the lag asked)
      const per = fs / f;
      const k = Math.max(1, Math.round((0.02 * fs) / per));
      const span = Math.min(0.03, 0.4 / k);
      const ac = (lag: number) => {
        let s = 0;
        for (let i = 0; i < W; i++) s += x[s0 + i] * x[s0 + i + lag];
        return s;
      };
      let best = -Infinity;
      let bl = 0;
      for (let lag = Math.floor(k * per * (1 - span)); lag <= Math.ceil(k * per * (1 + span)); lag++) {
        const v2 = ac(lag);
        if (v2 > best) [best, bl] = [v2, lag];
      }
      const a = ac(bl - 1);
      const b = ac(bl);
      const c = ac(bl + 1);
      const fm = (k * fs) / (bl + (0.5 * (a - c)) / (a - 2 * b + c));
      let peak = 0;
      let bad = 0;
      for (let i = 0; i < x.length; i++) {
        peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
        if (!Number.isFinite(L[i])) bad++;
      }
      return { cents: 1200 * Math.log2(fm / f), peak, bad, n: x.length, held: en(0.9, 0.3), late: en(1.3, 0.25), gone: en(2.1, 0.25) };
    }, [rate, midi, vel] as const);
    const who = `${rate} Hz, MIDI ${midi}, velocity ${vel}`;
    expect(out.n, who).toBe(Math.round(2.4 * rate));
    expect(out.bad, who).toBe(0);
    expect(out.peak, who).toBeGreaterThan(0.004);
    expect(out.peak, who).toBeLessThanOrEqual(1);
    expect(Math.abs(out.cents), who).toBeLessThan(15);
    // held level while the key is down; 40 dB and more down half a second after it is let go
    expect(Math.abs(out.late - out.held), who).toBeLessThan(1.5);
    expect(out.gone, who).toBeLessThan(out.held - 40);
    levels[`${midi}/${vel}`] = out.held;
  }
  expect(levels['60/112'] - levels['60/30']).toBeGreaterThan(6);
  expect(errors).toEqual([]);
});

for (const look of ['2d', 'vector'] as const)
  test(`2D (${look}): the zephyr whole on the stage, clear of the file player; a blown ribbon swings, its slot is lit and its key down; let go, it comes to rest; the knobs show the engine’s own values`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`/zephyr?view=${look}`);
    await startAudio(page);
    await expect.poll(() => drawn(page), { timeout: 10_000 }).not.toBeNull();
    const d0 = (await drawn(page))!;
    const over = await page.evaluate(() => document.querySelector('.player .pl-row')!.getBoundingClientRect().bottom);
    expect(d0.body.x0).toBeGreaterThanOrEqual(d0.stage.x0);
    expect(d0.body.x1).toBeLessThanOrEqual(d0.stage.x1);
    expect(d0.body.y0).toBeGreaterThanOrEqual(over - 1);
    expect(d0.body.y1).toBeLessThanOrEqual(d0.stage.y1);
    // the ribbons inside the frame, the blade across them, the keyboard under them
    expect(d0.ribbons.x0).toBeGreaterThan(d0.body.x0);
    expect(d0.ribbons.x1).toBeLessThan(d0.body.x1);
    expect(d0.blade.y0).toBeGreaterThan(d0.ribbons.y0);
    expect(d0.blade.y1).toBeLessThan(d0.ribbons.y1);
    expect(d0.keys.y0).toBeGreaterThan(d0.ribbons.y1 - 1);
    expect(d0.ringing).toBe(0);
    expect(d0.blowing).toBe(0);
    // the knobs at the engine's values: the wind as voiced, the ribbons at 4°, no tremulant
    await expect(page.locator('.knob').nth(0)).toContainText('×1.00');
    await expect(page.locator('.knob').nth(1)).toContainText('4.0°');
    await expect(page.locator('.knob').nth(2)).toContainText('off');
    // middle C: the twenty-fifth ribbon swings, its slot is lit and its key is down
    await page.evaluate(() => (window as any).__piano.noteOn(60, 100, 'midi'));
    await expect.poll(async () => (await drawn(page))!.widest, { timeout: 5000 }).toBe(24);
    await expect.poll(async () => (await drawn(page))!.down, { timeout: 5000 }).toEqual([24]);
    const d1 = (await drawn(page))!;
    expect(d1.swing).toBeGreaterThan(1.2);
    expect(d1.blowing).toBe(1);
    expect(d1.slots[0].i).toBe(24);
    expect(d1.slots[0].box.y0).toBeGreaterThanOrEqual(d1.blade.y0 - 1);
    expect(d1.slots[0].box.y1).toBeLessThanOrEqual(d1.blade.y1 + 1);
    await expect(page.locator('.readout .r-note')).toHaveText(/C\s*4/);
    // let go: the wind stops, the ribbon is still within the second (nothing damps it but the air)
    await page.evaluate(() => (window as any).__piano.noteOff(60, 'midi'));
    await expect.poll(async () => (await drawn(page))!.blowing, { timeout: 3000 }).toBe(0);
    await expect.poll(async () => (await drawn(page))!.ringing, { timeout: 3000 }).toBe(0);
    expect(errors).toEqual([]);
  });

test('3D: the zephyr whole on the stage, clear of the file player; a blown ribbon swings, its key goes down and its slot is lit; not one WebGL error or warning', async ({ page }) => {
  const errors = collectErrors(page);
  const gl = collectGl(page);
  await page.goto('/zephyr?view=3d');
  await startAudio(page);
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 5 && !!(window as any).__zephyr3d?.state(), null, { timeout: 30_000 });
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
  const st = () => page.evaluate(() => (window as any).__zephyr3d.state() as { swing: number[]; dip: number[]; ringing: number; lit: number });
  expect((await st()).ringing).toBe(0);
  expect((await st()).lit).toBe(0);
  // G3 and D4: their ribbons swing, their keys go down, their slots are lit
  await page.evaluate(() => {
    (window as any).__piano.noteOn(55, 100, 'midi');
    (window as any).__piano.noteOn(62, 100, 'midi');
  });
  await expect.poll(async () => (await st()).swing[19], { timeout: 5000 }).toBeGreaterThan(0.002);
  await expect.poll(async () => (await st()).dip[19], { timeout: 5000 }).toBeGreaterThan(0.006);
  await expect.poll(async () => (await st()).lit, { timeout: 5000 }).toBe(2);
  expect((await st()).ringing).toBe(2);
  expect((await st()).dip[20]).toBeLessThan(0.001);
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
  await page.evaluate(() => {
    (window as any).__piano.noteOff(55, 'midi');
    (window as any).__piano.noteOff(62, 'midi');
  });
  await expect.poll(async () => (await st()).lit, { timeout: 5000 }).toBe(0);
  expect(gl).toEqual([]);
  expect(errors).toEqual([]);
});

test('the zephyr plays its own piece from the overlay (Still Air, written for it), in its compass, its notes held', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/zephyr');
  await startAudio(page);
  await expect(page.locator('.pl-play')).toHaveAttribute('data-tip', /^play · Fable 5\.2, Still Air/);
  await page.locator('.pl-play').click();
  await expect(page.locator('.player').getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => (window as any).__player.demo?.instrument)).toBe('zephyr');
  await expect.poll(() => page.locator('.key.down').count(), { timeout: 4000 }).toBeGreaterThan(0);
  const m = Number(await page.locator('.key.down').first().getAttribute('data-midi'));
  expect(m).toBeGreaterThanOrEqual(36);
  expect(m).toBeLessThanOrEqual(96);
  // the opening builds a chord a note at a time: within a few seconds more than one ribbon is swinging
  await expect.poll(async () => (await drawn(page))?.ringing ?? 0, { timeout: 9000 }).toBeGreaterThan(1);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // stopped: nothing is left blowing (a key begun ahead of its note is let go)
  await expect.poll(async () => (await drawn(page))?.blowing ?? 0, { timeout: 4000 }).toBe(0);
  expect(errors).toEqual([]);
});

test('orchestra: lines named “Zephyr” are one zephyr; a file without it routes as it did; the zephyr by hand from the picker', async ({ page }, info) => {
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
  const voicesOf = () => page.locator('.pl-line').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.voice));
  // a flute, the zephyr's two staves, a cello: three instruments
  await drop([['Flute', 73, 72], ['Zephyr', 0, 67], ['Zephyr', 0, 43], ['Violoncello', 42, 48]], 'with-zephyr.mid');
  await expect.poll(async () => (await ens(page)).engines, { timeout: 15_000 }).toBe(3);
  expect(await voicesOf()).toEqual(['flute', 'zephyr', 'zephyr', 'cello']);
  expect((await ens(page)).kinds.filter((v) => v === 'zephyr').length).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.find((p: any) => p.voice === 'zephyr').down.size as number), { timeout: 8000 }).toBeGreaterThan(0);
  // a line's menu offers the zephyr
  await page.locator('.pl-line').nth(3).click();
  await expect(page.locator('.pl-menu .pl-pick[aria-label="zephyr"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // the same without it, a piano in its place: as it was
  await drop([['Flute', 73, 72], ['Piano', 0, 60], ['Violoncello', 42, 48]], 'no-zephyr.mid');
  await expect.poll(voicesOf, { timeout: 15_000 }).toEqual(['flute', 'grand', 'cello']);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // by hand: an orchestra with a zephyr from the picker
  await page.evaluate(() => (window as any).__orchestra.ensemble.setLineup(['flute', 'oboe', 'horn', 'violin', 'violin', 'viola', 'cello']));
  await openPicker(page).then(() => page.locator('.pick[aria-label="Zephyr"]').click());
  await expect.poll(async () => (await ens(page)).kinds.filter((v) => v === 'zephyr').length, { timeout: 10_000 }).toBe(1);
  expect(errors).toEqual([]);
});
