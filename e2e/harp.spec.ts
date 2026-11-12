// The harp end to end: its address (/harp, a reload included), the picker ("harp" under its glyph, with the
// keys), the keys' compass (C1–G7), the worklet at the sample rates the site meets (22.05 to 96 kHz) at pitch,
// ringing on; on the stage in both 2D styles (whole, clear of the file player, the plucked string swinging,
// the pedals moving for a note that needs them, the knobs at the engine's own values) and in 3D (whole, the
// string swinging, the pedal in its notch, not one WebGL error or warning); a finger drawn across the keys is
// a glissando on the pedals' scale; its own piece from the overlay; and Orchestra mode: a file whose tracks
// carry the names and programs real scores use ("Harp" on GM 47, two tracks for its two hands) routed to one
// harp, a file without a harp routed as it was, and the harp by hand from the picker.
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
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano?.instrument === 'harp', null, { timeout: 30_000 });
}
const ens = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    return { lineup: e.lineup as string[], engines: e.parts.filter((p: any) => p.engine).length as number, kinds: e.parts.map((p: any) => p.engine?.instrument ?? null) as (string | null)[] };
  });
type Box = { x0: number; y0: number; x1: number; y1: number };
type Drawn = { body: Box; strings: Box; pedals: Box; ringing: number; widest: number; swing: number; pedalY: number[]; set: number[]; stage: Box };
const drawn = (page: Page) => page.evaluate(() => (window as any).__harp2d() as Drawn | null);
const readout = (page: Page) => page.evaluate(() => (document.querySelector('.readout') as HTMLElement).innerText.replace(/\s+/g, ' '));

test('/harp opens the harp (a reload too); “harp” under its glyph, beside the piano; the keys C1–G7', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/harp');
  await startAudio(page);
  const pick = page.locator('.pick[aria-label="Harp"]');
  await expect(pick).toHaveAttribute('aria-pressed', 'true');
  await expect(pick.locator('.pick-name')).toHaveText('harp');
  await openPicker(page);
  await expect(pick.locator('svg.glyph')).toBeVisible();
  // (with the keys: the piano's neighbour)
  expect(await page.locator('.fam[data-fam="keys"] .pick').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Piano', 'Harp']);
  await closePicker(page);
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe('/harp');
  await page.reload();
  await startAudio(page);
  await expect(page.locator('.keyboard .key[data-midi="24"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="23"]')).toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="103"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="104"]')).toHaveClass(/\bout\b/);
  expect(errors).toEqual([]);
});

test('the harp through the worklet at 22.05, 44.1, 48 and 96 kHz: at pitch, louder with velocity, ringing on and dying away', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/harp');
  await startAudio(page);
  const levels: Record<string, number> = {};
  for (const [rate, midi, vel] of [[22050, 48, 80], [44100, 36, 80], [48000, 60, 30], [48000, 60, 112], [48000, 84, 80], [96000, 67, 80], [44100, 100, 100]] as const) {
    const out = await page.evaluate(async ([fs, m, v]) => {
      const { renderOffline } = (window as any).__engine;
      const buf: AudioBuffer = await renderOffline({ instrument: 'harp', sampleRate: fs, duration: 2.4, params: { room: 0 }, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: v } }] });
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const x = L.map((s, i) => 0.5 * (s + R[i]));
      const f = 440 * 2 ** ((m - 69) / 12);
      const s0 = Math.round(0.08 * fs);
      const W = Math.round(0.3 * fs);
      const en = (from: number, len: number) => {
        let e = 0;
        const a = Math.round(from * fs);
        const n = Math.round(len * fs);
        for (let i = 0; i < n; i++) e += x[a + i] ** 2;
        return 10 * Math.log10(e / n + 1e-20);
      };
      // the period by autocorrelation over as many periods as fit a lag near 20 ms, searched 3 % each way
      const per = fs / f;
      const k = Math.max(1, Math.round((0.02 * fs) / per));
      const ac = (lag: number) => {
        let s = 0;
        for (let i = 0; i < W; i++) s += x[s0 + i] * x[s0 + i + lag];
        return s;
      };
      let best = -Infinity;
      let bl = 0;
      for (let lag = Math.floor(k * per * 0.97); lag <= Math.ceil(k * per * 1.03); lag++) {
        const v2 = ac(lag);
        if (v2 > best) [best, bl] = [v2, lag];
      }
      const a = ac(bl - 1);
      const b = ac(bl);
      const c = ac(bl + 1);
      const fm = (k * fs) / (bl + (0.5 * (a - c)) / (a - 2 * b + c));
      let peak = 0;
      for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      return { cents: 1200 * Math.log2(fm / f), peak, n: x.length, db: en(0.03, 0.3), late: en(1.6, 0.3), end: en(2.2, 0.15) };
    }, [rate, midi, vel] as const);
    const who = `${rate} Hz, MIDI ${midi}, velocity ${vel}`;
    expect(out.n, who).toBe(Math.round(2.4 * rate));
    expect(out.peak, who).toBeGreaterThan(0.004);
    expect(out.peak, who).toBeLessThanOrEqual(1);
    // (a stiff string's partials are sharp of its harmonics: the period found leans a few cents up)
    expect(Math.abs(out.cents), who).toBeLessThan(12);
    // it rings on, falling: quieter after a second and a half, and (below the top octave) still sounding
    expect(out.late, who).toBeLessThan(out.db - 3);
    if (midi < 84) expect(out.late, who).toBeGreaterThan(out.db - 60);
    levels[`${midi}/${vel}`] = out.db;
  }
  expect(levels['60/112'] - levels['60/30']).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

for (const look of ['2d', 'vector'] as const)
  test(`2D (${look}): the harp whole on the stage, clear of the file player; a plucked string swings; a note out of the scale moves its pedal; the knobs show the engine’s own values`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`/harp?view=${look}`);
    await startAudio(page);
    await expect.poll(() => drawn(page), { timeout: 10_000 }).not.toBeNull();
    const d0 = (await drawn(page))!;
    const over = await page.evaluate(() => document.querySelector('.player .pl-row')!.getBoundingClientRect().bottom);
    expect(d0.body.x0).toBeGreaterThanOrEqual(d0.stage.x0);
    expect(d0.body.x1).toBeLessThanOrEqual(d0.stage.x1);
    expect(d0.body.y0).toBeGreaterThanOrEqual(over - 1);
    expect(d0.body.y1).toBeLessThanOrEqual(d0.stage.y1);
    // the strings inside the frame, the pedals under them
    expect(d0.strings.x0).toBeGreaterThan(d0.body.x0);
    expect(d0.strings.x1).toBeLessThan(d0.body.x1);
    expect(d0.pedals.y0).toBeGreaterThan(d0.strings.y0);
    expect(d0.ringing).toBe(0);
    expect(d0.set).toEqual([0, 0, 0, 0, 0, 0, 0]);
    // the knobs at the engine's values: laissez vibrer, every pedal in its middle notch
    await expect(page.locator('.knob').nth(1)).toContainText('l.v.');
    expect(await page.locator('.knob').evaluateAll((els) => els.slice(2).map((e) => e.textContent!.trim().slice(0, 2)))).toEqual(['D♮', 'C♮', 'B♮', 'E♮', 'F♮', 'G♮', 'A♮']);
    // middle C: the twenty-second string swings, and rings on after the key is let go
    await page.evaluate(() => (window as any).__piano.noteOn(60, 96, 'midi'));
    await expect.poll(async () => (await drawn(page))!.widest, { timeout: 5000 }).toBe(21);
    expect((await drawn(page))!.swing).toBeGreaterThan(1.2);
    await expect(page.locator('.readout .r-note')).toHaveText(/C\s*4/);
    await page.evaluate(() => (window as any).__piano.noteOff(60, 'midi'));
    await page.waitForTimeout(300);
    expect((await drawn(page))!.ringing).toBeGreaterThanOrEqual(1);
    // F♯4: no string is tuned to it, so the F pedal goes down (its foot lower on the screen), and its knob with it
    await page.evaluate(() => (window as any).__piano.noteOn(66, 96, 'midi'));
    await expect.poll(async () => (await drawn(page))!.set[4], { timeout: 5000 }).toBe(1);
    await expect.poll(async () => (await drawn(page))!.pedalY[4] - d0.pedalY[4], { timeout: 3000 }).toBeGreaterThan(1);
    expect(Math.abs((await drawn(page))!.pedalY[3] - d0.pedalY[3])).toBeLessThan(0.5);
    await expect(page.locator('.knob').nth(6)).toContainText('F♯');
    await page.evaluate(() => (window as any).__piano.noteOff(66, 'midi'));
    expect(errors).toEqual([]);
  });

test('a finger drawn across the keys is a glissando: each white key its string, at the pitch its pedal gives it', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'the mouse draws it; a phone’s touch has its own test of the keys');
  const errors = collectErrors(page);
  await page.goto('/harp');
  await startAudio(page);
  await expect.poll(() => drawn(page), { timeout: 10_000 }).not.toBeNull();
  // D major on the pedals: F and C down
  await page.evaluate(() => (window as any).__piano.setParams({ pedalF: 1, pedalC: 1 }));
  await expect.poll(async () => (await drawn(page))!.set, { timeout: 5000 }).toEqual([0, 1, 0, 0, 1, 0, 0]);
  const key = async (m: number) => {
    const r = (await page.locator(`.keyboard .key[data-midi="${m}"]`).boundingBox())!;
    return [r.x + r.width / 2, r.y + r.height * 0.88] as const;
  };
  const [x0, y0] = await key(64);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (const m of [65, 67]) {
    const [x, y] = await key(m);
    await page.mouse.move(x, y, { steps: 8 });
    await page.waitForTimeout(80);
  }
  // E4, the F string (at F♯4 under its pedal), G4: the pedals as they were
  await expect.poll(() => readout(page), { timeout: 4000 }).toMatch(/E4.*F♯4.*G4/);
  expect((await drawn(page))!.set).toEqual([0, 1, 0, 0, 1, 0, 0]);
  await page.mouse.up();
  // a key struck, not drawn across, is a pitch: C4 asks for C♮, and the C pedal comes back to its middle notch
  await page.evaluate(() => (window as any).__piano.noteOn(60, 90, 'midi'));
  await expect.poll(async () => (await drawn(page))!.set[1], { timeout: 5000 }).toBe(0);
  expect((await drawn(page))!.set[4]).toBe(1);
  await page.evaluate(() => (window as any).__piano.noteOff(60, 'midi'));
  expect(errors).toEqual([]);
});

test('3D: the harp whole on the stage, clear of the file player; a plucked string swings, a pedal goes to its notch; not one WebGL error or warning', async ({ page }) => {
  const errors = collectErrors(page);
  const gl = collectGl(page);
  await page.goto('/harp?view=3d');
  await startAudio(page);
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 5 && !!(window as any).__harp3d?.state(), null, { timeout: 30_000 });
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
  const st = () => page.evaluate(() => (window as any).__harp3d.state() as { swing: number[]; pedals: number[]; ringing: number });
  expect((await st()).ringing).toBe(0);
  expect((await st()).pedals).toEqual([0, 0, 0, 0, 0, 0, 0]);
  // G3 swings; B♭3 takes the B pedal up
  await page.evaluate(() => (window as any).__piano.noteOn(55, 100, 'midi'));
  await expect.poll(async () => (await st()).swing[18], { timeout: 5000 }).toBeGreaterThan(0.002);
  await page.evaluate(() => (window as any).__piano.noteOn(58, 100, 'midi'));
  await expect.poll(async () => (await st()).pedals[2], { timeout: 5000 }).toBeLessThan(-0.9);
  expect((await st()).ringing).toBeGreaterThanOrEqual(2);
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
    (window as any).__piano.noteOff(58, 'midi');
  });
  expect(gl).toEqual([]);
  expect(errors).toEqual([]);
});

test('the harp plays its own piece from the overlay (the Prélude of Bach’s first cello suite, an octave up), in its compass', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/harp');
  await startAudio(page);
  await expect(page.locator('.pl-play')).toHaveAttribute('data-tip', /^play · Bach/);
  await page.locator('.pl-play').click();
  await expect(page.locator('.player').getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => (window as any).__player.demo?.instrument)).toBe('harp');
  await expect.poll(() => page.locator('.key.down').count(), { timeout: 4000 }).toBeGreaterThan(0);
  const m = Number(await page.locator('.key.down').first().getAttribute('data-midi'));
  expect(m).toBeGreaterThanOrEqual(24);
  expect(m).toBeLessThanOrEqual(103);
  // the strings ring on over each other: more than one is swinging
  await expect.poll(async () => (await drawn(page))?.ringing ?? 0, { timeout: 6000 }).toBeGreaterThan(1);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('orchestra: “Harp” (GM 47), its two hands on two tracks, is one harp; a file without a harp routes as it did; the harp by hand from the picker', async ({ page }, info) => {
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
  // a flute, the harp's right hand and its left, a violin, a cello: four instruments
  await drop([['Flute', 73, 72], ['Harp', 46, 67], ['Harp', 46, 43], ['Violin', 40, 62], ['Violoncello', 42, 48]], 'with-harp.mid');
  await expect.poll(async () => (await ens(page)).engines, { timeout: 15_000 }).toBe(4);
  expect(await voicesOf()).toEqual(['flute', 'harp', 'harp', 'violin', 'cello']);
  expect((await ens(page)).kinds.filter((v) => v === 'harp').length).toBe(1);
  // every line at its pitch (no octave moved)
  expect(await page.evaluate(() => (window as any).__orchestra.ensemble.plan.lines.map((rs: any[]) => rs.map((r) => r.shift)).flat())).toEqual([0, 0, 0, 0, 0]);
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.find((p: any) => p.voice === 'harp').down.size as number), { timeout: 8000 }).toBeGreaterThan(0);
  // a line's menu offers the harp
  await page.locator('.pl-line').nth(4).click();
  await expect(page.locator('.pl-menu .pl-pick[aria-label="harp"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // the same without a harp, a piano in its place: as it was
  await drop([['Flute', 73, 72], ['Piano', 0, 60], ['Violin', 40, 62], ['Violoncello', 42, 48]], 'no-harp.mid');
  await expect.poll(voicesOf, { timeout: 15_000 }).toEqual(['flute', 'grand', 'violin', 'cello']);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // by hand: an orchestra with a harp from the picker
  await page.evaluate(() => (window as any).__orchestra.ensemble.setLineup(['flute', 'oboe', 'horn', 'violin', 'violin', 'viola', 'cello']));
  await openPicker(page).then(() => page.locator('.pick[aria-label="Harp"]').click());
  await expect.poll(async () => (await ens(page)).kinds.filter((v) => v === 'harp').length, { timeout: 10_000 }).toBe(1);
  expect(errors).toEqual([]);
});
