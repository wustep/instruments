// The glockenspiel end to end: its address (/glockenspiel, a reload and the alias /glock), the picker
// ("glock" under its glyph, beside the timpani), the keys' compass (G5–C8 as it sounds), the worklet
// at the sample rates the site meets (22.05 to 96 kHz) at pitch, a key under the compass read as written and
// brought up by octaves; on the stage in both 2D styles (whole, clear of the file player, the struck bar lit,
// the mallet down on it and up again, the knobs at the engine's values) and in 3D (whole, the bar glowing, the
// mallet over it, not one WebGL error or warning); a roll (the roll knob: the two mallets in turn on a held
// key); its own piece from the overlay; and Orchestra mode: a file
// whose "Glockenspiel" track (GM 10) is written two octaves under where it sounds routed to a glockenspiel
// and brought up, a file without one routed as it was, and the glockenspiel by hand from the picker.
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
  await page.waitForFunction(() => (window as any).__piano?.status === 'running' && (window as any).__piano?.piano?.instrument === 'glockenspiel', null, { timeout: 30_000 });
}
const ens = (page: Page) =>
  page.evaluate(() => {
    const e = (window as any).__orchestra.ensemble;
    return { lineup: e.lineup as string[], engines: e.parts.filter((p: any) => p.engine).length as number, kinds: e.parts.map((p: any) => p.engine?.instrument ?? null) as (string | null)[] };
  });
type Box = { x0: number; y0: number; x1: number; y1: number };
type Drawn = { body: Box; bars: Box[]; ringing: number; brightest: number; heads: [number, number][]; lift: number[]; stage: Box };
const drawn = (page: Page) => page.evaluate(() => (window as any).__glock2d() as Drawn | null);

test('/glockenspiel opens the glockenspiel (a reload and /glock too); its name under its glyph, beside the timpani; the keys G5–C8', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/glock');
  await startAudio(page);
  await expect.poll(() => page.evaluate(() => location.pathname)).toBe('/glockenspiel');
  const pick = page.locator('.pick[aria-label="Glockenspiel"]');
  await expect(pick).toHaveAttribute('aria-pressed', 'true');
  // (under its glyph it is "glock", as the double bass is "bass": its whole name is its label)
  await expect(pick.locator('.pick-name')).toHaveText('glock');
  await openPicker(page);
  await expect(pick.locator('svg.glyph')).toBeVisible();
  expect(await page.locator('.fam[data-fam="percussion"] .pick').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual(['Timpani', 'Glockenspiel']);
  await closePicker(page);
  await page.reload();
  await startAudio(page);
  await expect(page.locator('.keyboard .key[data-midi="79"]')).not.toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="78"]')).toHaveClass(/\bout\b/);
  await expect(page.locator('.keyboard .key[data-midi="108"]')).not.toHaveClass(/\bout\b/);
  expect(errors).toEqual([]);
});

test('the glockenspiel through the worklet at 22.05, 44.1, 48 and 96 kHz: at pitch, louder with velocity, ringing on; a written C4 sounds as C6', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/glockenspiel');
  await startAudio(page);
  const levels: Record<string, number> = {};
  for (const [rate, midi, vel] of [[22050, 84, 80], [44100, 79, 80], [48000, 91, 30], [48000, 91, 112], [48000, 108, 80], [96000, 96, 80], [48000, 60, 80]] as const) {
    const out = await page.evaluate(async ([fs, m, v]) => {
      const { renderOffline } = (window as any).__engine;
      const buf: AudioBuffer = await renderOffline({ instrument: 'glockenspiel', sampleRate: fs, duration: 2.0, params: { room: 0 }, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: v } }] });
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      const x = L.map((s, i) => 0.5 * (s + R[i]));
      // (a note under the compass is brought up by octaves: C4 is the C6 bar)
      let p = m;
      while (p < 79) p += 12;
      const f = 440 * 2 ** ((p - 69) / 12);
      const s0 = Math.round(0.1 * fs);
      const W = Math.round(0.4 * fs);
      // the strongest frequency within 40 ¢ of the bar's pitch
      const at = (hz: number) => {
        let re = 0;
        let im = 0;
        for (let i = 0; i < W; i++) {
          const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
          re += x[s0 + i] * h * Math.cos((2 * Math.PI * hz * i) / fs);
          im += x[s0 + i] * h * Math.sin((2 * Math.PI * hz * i) / fs);
        }
        return re * re + im * im;
      };
      let best = 0;
      let bv = -1;
      for (let c = -40; c <= 40; c += 2) {
        const v2 = at(f * 2 ** (c / 1200));
        if (v2 > bv) [bv, best] = [v2, c];
      }
      const en = (from: number, len: number) => {
        let e = 0;
        const a = Math.round(from * fs);
        const n = Math.round(len * fs);
        for (let i = 0; i < n; i++) e += x[a + i] ** 2;
        return 10 * Math.log10(e / n + 1e-20);
      };
      let peak = 0;
      for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      return { cents: best, peak, n: x.length, db: en(0.05, 0.3), late: en(1.5, 0.3) };
    }, [rate, midi, vel] as const);
    const who = `${rate} Hz, MIDI ${midi}, velocity ${vel}`;
    expect(out.n, who).toBe(Math.round(2.0 * rate));
    expect(out.peak, who).toBeGreaterThan(0.002);
    expect(out.peak, who).toBeLessThanOrEqual(1);
    expect(Math.abs(out.cents), who).toBeLessThanOrEqual(4);
    // it rings on, falling: quieter after a second and a half, and still sounding
    expect(out.late, who).toBeLessThan(out.db - 2);
    expect(out.late, who).toBeGreaterThan(out.db - 70);
    levels[`${midi}/${vel}`] = out.db;
  }
  expect(levels['91/112'] - levels['91/30']).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});

for (const look of ['2d', 'vector'] as const)
  test(`2D (${look}): the glockenspiel whole on the stage, clear of the file player; a struck bar is lit and its mallet comes down on it and springs up; the knobs show the engine’s own values`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`/glockenspiel?view=${look}`);
    await startAudio(page);
    await expect.poll(() => drawn(page), { timeout: 10_000 }).not.toBeNull();
    const d0 = (await drawn(page))!;
    const over = await page.evaluate(() => document.querySelector('.player .pl-row')!.getBoundingClientRect().bottom);
    expect(d0.body.x0).toBeGreaterThanOrEqual(d0.stage.x0);
    expect(d0.body.x1).toBeLessThanOrEqual(d0.stage.x1);
    expect(d0.body.y0).toBeGreaterThanOrEqual(over - 1);
    expect(d0.body.y1).toBeLessThanOrEqual(d0.stage.y1);
    expect(d0.bars.length).toBe(30);
    expect(d0.ringing).toBe(0);
    // the low bars at the left, the longest; the accidentals' row behind (higher on the screen)
    expect(d0.bars[0].x0).toBeLessThan(d0.bars[29].x0);
    expect(d0.bars[0].y1 - d0.bars[0].y0).toBeGreaterThan(2 * (d0.bars[29].y1 - d0.bars[29].y0));
    expect(d0.bars[1].y1).toBeLessThan(d0.bars[0].y0);
    // the knobs at the engine's values: plastic mallets, the bars left to ring
    await expect(page.locator('.knob').nth(0)).toContainText('plastic');
    await expect(page.locator('.knob').nth(1)).toContainText('l.v.');
    // C6: its bar is lit, a mallet's head inside its box, and it rings on after the key is let go
    await page.evaluate(() => (window as any).__piano.noteOn(84, 100, 'midi'));
    await expect.poll(async () => (await drawn(page))!.brightest, { timeout: 5000 }).toBe(5);
    await expect(page.locator('.readout .r-note')).toHaveText(/C\s*6/);
    const d1 = (await drawn(page))!;
    const b = d1.bars[5];
    expect(d1.heads.some(([x, y]) => x > b.x0 - 2 && x < b.x1 + 2 && y > b.y0 && y < b.y1)).toBe(true);
    await page.evaluate(() => (window as any).__piano.noteOff(84, 'midi'));
    await page.waitForTimeout(400);
    expect((await drawn(page))!.ringing).toBeGreaterThanOrEqual(1);
    // both mallets are up again
    await expect.poll(async () => Math.min(...(await drawn(page))!.lift), { timeout: 3000 }).toBeGreaterThan(0.9);
    // the computer's keys: A is the C under the keys (C6 on the glockenspiel)
    await page.locator('.stage-cv').click({ position: { x: 40, y: 200 } });
    await page.keyboard.down('d');
    await expect(page.locator('.readout')).toContainText(/E\s*6/, { timeout: 5000 });
    await page.keyboard.up('d');
    expect(errors).toEqual([]);
  });

test('a roll: with the roll knob up a held key is struck on by the two mallets in turn, each coming down on the bar again and again; let go, the bar rings out', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/glockenspiel');
  await startAudio(page);
  await expect.poll(() => drawn(page), { timeout: 10_000 }).not.toBeNull();
  // the knobs: mallets, damping, roll (off: single strokes)
  await expect(page.locator('.knob').nth(2)).toContainText('off');
  await page.evaluate(() => (window as any).__piano.setParams({ roll: 0.6 }));
  await page.evaluate(() => (window as any).__piano.noteOn(84, 90, 'midi'));
  // both mallets come to the bar (a single stroke brings one)
  const onBar = async () => {
    const d = (await drawn(page))!;
    const b = d.bars[5];
    return d.heads.filter(([x, y]) => x > b.x0 - 2 && x < b.x1 + 2 && y > b.y0 && y < b.y1).length;
  };
  await expect.poll(onBar, { timeout: 5000 }).toBe(2);
  // each hand's mallet is seen coming down several times in a second and a half
  const downs = [0, 0];
  const was = [false, false];
  const t0 = Date.now();
  while (Date.now() - t0 < 1500) {
    const d = (await drawn(page))!;
    for (const h of [0, 1]) {
      const down = d.lift[h] < 0.3;
      if (down && !was[h]) downs[h]++;
      was[h] = down;
    }
    await page.waitForTimeout(12);
  }
  expect(downs[0], `left ${downs[0]}`).toBeGreaterThanOrEqual(3);
  expect(downs[1], `right ${downs[1]}`).toBeGreaterThanOrEqual(3);
  // let go: no more strokes, both mallets up and staying up, the bar ringing on
  await page.evaluate(() => (window as any).__piano.noteOff(84, 'midi'));
  await expect.poll(async () => Math.min(...(await drawn(page))!.lift), { timeout: 3000 }).toBeGreaterThan(0.9);
  await page.waitForTimeout(400);
  const d2 = (await drawn(page))!;
  expect(Math.min(...d2.lift)).toBeGreaterThan(0.9);
  expect(d2.ringing).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('3D: the glockenspiel whole on the stage, clear of the file player; a struck bar glows and its mallet is over it; not one WebGL error or warning', async ({ page }) => {
  const errors = collectErrors(page);
  const gl = collectGl(page);
  await page.goto('/glockenspiel?view=3d');
  await startAudio(page);
  await page.waitForFunction(() => (window as any).__stage3d?.stats.frames > 5 && !!(window as any).__glock3d?.state(), null, { timeout: 30_000 });
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
  expect((v.box!.y1 - v.box!.y0) / (v.h - v.over)).toBeGreaterThan(0.5);
  const st = () => page.evaluate(() => (window as any).__glock3d.state() as { glow: number[]; heads: number[][]; lift: number[]; ringing: number });
  expect((await st()).ringing).toBe(0);
  // G5 (the lowest bar) glows; then A7 as well, under the other hand
  await page.evaluate(() => (window as any).__piano.noteOn(79, 100, 'midi'));
  await expect.poll(async () => (await st()).glow[0], { timeout: 5000 }).toBeGreaterThan(0.3);
  await page.evaluate(() => (window as any).__piano.noteOn(105, 100, 'midi'));
  await expect.poll(async () => (await st()).glow[26], { timeout: 5000 }).toBeGreaterThan(0.3);
  const s = await st();
  expect(s.ringing).toBeGreaterThanOrEqual(2);
  // the left mallet over the low bar, the right over the high one
  expect(s.heads[0][0]).toBeLessThan(s.heads[1][0] - 0.3);
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
    (window as any).__piano.noteOff(79, 'midi');
    (window as any).__piano.noteOff(105, 'midi');
  });
  expect(gl).toEqual([]);
  expect(errors).toEqual([]);
});

test('the glockenspiel plays its own piece from the overlay (the Bourrée of Bach’s flute partita, a twelfth up), in its compass, its bars ringing over each other', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/glockenspiel');
  await startAudio(page);
  await expect(page.locator('.pl-play')).toHaveAttribute('data-tip', /^play · Bach/);
  await page.locator('.pl-play').click();
  await expect(page.locator('.player').getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => (window as any).__player.demo?.instrument)).toBe('glockenspiel');
  await expect.poll(() => page.locator('.key.down').count(), { timeout: 4000 }).toBeGreaterThan(0);
  const m = Number(await page.locator('.key.down').first().getAttribute('data-midi'));
  expect(m).toBeGreaterThanOrEqual(79);
  expect(m).toBeLessThanOrEqual(108);
  await expect.poll(async () => (await drawn(page))?.ringing ?? 0, { timeout: 6000 }).toBeGreaterThan(1);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  expect(errors).toEqual([]);
});

test('orchestra: “Glockenspiel” (GM 10) written two octaves under is a glockenspiel, brought up; a file without one routes as it did; the glockenspiel by hand from the picker', async ({ page }, info) => {
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
  // a flute, the glockenspiel written at G3 (two octaves under its G5), a violin, the timpani, a cello
  await drop([['Flute', 73, 72], ['Glockenspiel', 9, 55], ['Violin', 40, 62], ['Timpani', 47, 43], ['Violoncello', 42, 48]], 'with-glock.mid');
  await expect.poll(async () => (await ens(page)).engines, { timeout: 15_000 }).toBe(5);
  expect(await voicesOf()).toEqual(['flute', 'glockenspiel', 'violin', 'timpani', 'cello']);
  expect((await ens(page)).kinds.filter((v) => v === 'glockenspiel').length).toBe(1);
  // the glockenspiel's line comes up two octaves whole; the others stay
  expect(await page.evaluate(() => (window as any).__orchestra.ensemble.plan.lines.map((rs: any[]) => rs.map((r) => r.shift)).flat())).toEqual([0, 24, 0, 0, 0]);
  await expect.poll(() => page.evaluate(() => (window as any).__orchestra.ensemble.parts.find((p: any) => p.voice === 'glockenspiel').down.size as number), { timeout: 8000 }).toBeGreaterThan(0);
  // a line's menu offers the glockenspiel
  await page.locator('.pl-line').nth(4).click();
  await expect(page.locator('.pl-menu .pl-pick[aria-label="glockenspiel"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // the same without it: as it was
  await drop([['Flute', 73, 72], ['Violin', 40, 62], ['Timpani', 47, 43], ['Violoncello', 42, 48]], 'no-glock.mid');
  await expect.poll(voicesOf, { timeout: 15_000 }).toEqual(['flute', 'violin', 'timpani', 'cello']);
  await page.locator('.player').getByRole('button', { name: 'Stop' }).click();
  // by hand: an orchestra with a glockenspiel from the picker
  await page.evaluate(() => (window as any).__orchestra.ensemble.setLineup(['flute', 'oboe', 'horn', 'violin', 'violin', 'viola', 'cello']));
  await openPicker(page).then(() => page.locator('.pick[aria-label="Glockenspiel"]').click());
  await expect.poll(async () => (await ens(page)).kinds.filter((v) => v === 'glockenspiel').length, { timeout: 10_000 }).toBe(1);
  expect(errors).toEqual([]);
});
