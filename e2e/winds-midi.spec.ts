// The winds and brass playing a file, end to end: the player tells them the notes to come (audio.ts
// foreseeFileEvent → the worklet → engine core/mono.ts), so a note repeated with no rest is tongued again, a
// short note speaks, and nothing hangs when the file is paused; the keys are met as they come. Engine:
// packages/engine/test/mono.test.ts; the measurements: artifacts/realistic-3d/final-symphony/winds-midi.
import { test, expect, type Page } from '@playwright/test';

const WINDS = ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone'] as const;
const MID: Record<(typeof WINDS)[number], number> = { flute: 78, oboe: 76, clarinet: 72, bassoon: 55, horn: 56, trumpet: 69, trombone: 53 };

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

test('through the worklet: a pitch repeated with no rest is struck again on every wind, and a file’s short note speaks', async ({ page }) => {
  test.slow();
  const errors = collectErrors(page);
  await page.goto('/flute?view=2d');
  for (const inst of WINDS) {
    const out = await page.evaluate(
      async ([id, m]) => {
        const { renderOffline } = (window as any).__engine;
        const fs = 48000;
        const on = (time: number, velocity = 84) => ({ time, event: { type: 'noteOn', midi: m, velocity } });
        const off = (time: number) => ({ time, event: { type: 'noteOff', midi: m } });
        const see = (time: number, dur: number) => ({ time, event: { type: 'foresee', midi: m, velocity: 84, dur } });
        const mono = (b: AudioBuffer) => b.getChannelData(0);
        const rms = (x: Float32Array, t0: number, t1: number) => {
          let s = 0;
          const a = Math.round(t0 * fs);
          const e = Math.round(t1 * fs);
          for (let i = a; i < e; i++) s += x[i] * x[i];
          return 10 * Math.log10(s / (e - a) + 1e-20);
        };
        // four eighths (139 ms) of one pitch, each ending where the next begins, the next one's on first
        const t = [0.1, 0.239, 0.378, 0.517, 0.656];
        const ev: any[] = [];
        for (let i = 0; i < 4; i++) ev.push(see(t[i], 0.139));
        for (let i = 0; i < 4; i++) {
          ev.push(on(t[i]));
          if (i > 0) ev.push(off(t[i]));
        }
        ev.push(off(t[4]));
        const rep = mono(await renderOffline({ instrument: id, sampleRate: fs, duration: 1.3, params: { room: 0 }, events: ev }));
        const dips: number[] = [];
        for (let i = 1; i < 4; i++) {
          let lo = Infinity;
          for (let c = t[i] - 0.03; c <= t[i] + 0.03; c += 0.002) lo = Math.min(lo, rms(rep, c - 0.004, c + 0.004));
          dips.push(Math.min(rms(rep, t[i - 1] + 0.06, t[i - 1] + 0.11), rms(rep, t[i] + 0.06, t[i] + 0.11)) - lo);
        }
        // one eighth from silence, told ahead, against the note held
        const held = mono(await renderOffline({ instrument: id, sampleRate: fs, duration: 1.3, params: { room: 0 }, events: [on(0.1), off(1.1)] }));
        const short = mono(await renderOffline({ instrument: id, sampleRate: fs, duration: 0.8, params: { room: 0 }, events: [see(0.1, 0.139), on(0.1), off(0.239)] }));
        return { dips, last: rms(rep, t[3] + 0.06, t[3] + 0.13) - rms(rep, t[1] + 0.06, t[1] + 0.13), tail: rms(rep, 1.15, 1.3) - rms(rep, t[1] + 0.06, t[1] + 0.13), reach: rms(short, 0.17, 0.235) - rms(held, 0.6, 1.0) };
      },
      [inst, MID[inst]] as const,
    );
    // (before: 0–2 dB on all but the clarinet; a note-on written before the last note's off ended the new note)
    for (const d of out.dips) expect(d, `${inst}: the level falls between the repeats`).toBeGreaterThan(3);
    expect(out.last, `${inst}: the last repeat is whole`).toBeGreaterThan(-4);
    expect(out.tail, `${inst}: nothing sounds on`).toBeLessThan(-40);
    // (before: the flute's eighth 35 dB under the held note, the horn's 10, the trombone's 13)
    expect(out.reach, `${inst}: the short note speaks`).toBeGreaterThan(-8);
  }
  expect(errors).toEqual([]);
});

test('the flute’s own piece: its notes are told ahead; paused, no note hangs; a key after is not', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/flute?view=2d');
  await startAudio(page);
  // every note the player tells the engine, and every note it then sends
  await page.evaluate(() => {
    const w = window as any;
    const p = w.__piano.piano;
    w.__told = [];
    w.__sent = [];
    const foresee = p.foresee;
    const noteOn = p.noteOn;
    p.foresee = (...a: any[]) => {
      w.__told.push(a);
      return foresee(...a);
    };
    p.noteOn = (...a: any[]) => {
      w.__sent.push(a);
      return noteOn(...a);
    };
  });
  await page.getByRole('button', { name: /^Play/ }).first().click();
  await page.waitForFunction(() => (window as any).__player?.playing, null, { timeout: 20_000 });
  await page.waitForFunction(() => (window as any).__sent.length > 12, null, { timeout: 20_000 });
  const { told, sent } = await page.evaluate(() => ({ told: (window as any).__told as number[][], sent: (window as any).__sent as number[][] }));
  // told ahead of being sent: each note sent was told first, at the same pitch and time, with its length
  expect(told.length).toBeGreaterThan(sent.length);
  for (const [i, s] of sent.entries()) {
    expect(told[i][0], `note ${i}: the pitch told`).toBe(s[0]);
    expect(Math.abs(told[i][2] - s[2]), `note ${i}: the time told`).toBeLessThan(1e-6);
    expect(told[i][3], `note ${i}: its length`).toBeGreaterThan(0.02);
  }
  // paused, wherever in a note (or in a rest the tongue holds): nothing sounds on
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => (window as any).__player.pause());
    await page.waitForTimeout(450);
    expect(await page.evaluate(() => (window as any).__piano.sounding.size), `pause ${i + 1}`).toBe(0);
    await page.evaluate(() => (window as any).__player.play());
    await page.waitForTimeout(350 + 61 * i);
  }
  await page.evaluate(() => (window as any).__player.pause());
  await page.waitForTimeout(450);
  // a key by hand is not told (nothing is foreseen of it), sounds, and lets go
  const before = await page.evaluate(() => (window as any).__told.length);
  await page.evaluate(() => (window as any).__piano.noteOn(72, 90, 'keys'));
  await page.waitForFunction(() => (window as any).__piano.sounding.has(72), null, { timeout: 10_000 });
  expect(await page.evaluate(() => (window as any).__told.length)).toBe(before);
  await page.evaluate(() => (window as any).__piano.noteOff(72, 'keys'));
  await page.waitForFunction(() => (window as any).__piano.sounding.size === 0, null, { timeout: 10_000 });
  expect(errors).toEqual([]);
});
