// Audio audit 3, the brass playing a file (artifacts/round3/audio-audit-3/brass/NOTES.md). Each of these
// failed on the engine before it (a561109):
//   · the trumpet: a note joined to the last on another partial grew out of the last note's ring for
//     65–80 ms (the lips were never kicked when a stroke made ahead let go, and the valves and lips moved
//     under the new note, not under the stroke); a staccato pitch repeated over rests the tongue held was
//     not kicked either;
//   · the trombone: slurred to a note that is known to come, the slide set off on the note's beat and was
//     under way, under the soft tongue, for the first 65–90 ms of it; a valve turned at the slide's speed
//     (the F attachment: 115 ms and more); a detached note after a rest the tongue held was not kicked.
import { describe, expect, it } from 'vitest';
import { createCore, type InstrumentCore, type InstrumentId } from '../src/core/index.ts';
import { MonoKeys } from '../src/core/mono.ts';

const FS = 48000;
type Ev = { t: number; e: Record<string, unknown> };
const on = (t: number, midi: number, velocity = 84): Ev => ({ t, e: { type: 'noteOn', midi, velocity } });
const off = (t: number, midi: number): Ev => ({ t, e: { type: 'noteOff', midi } });
/** what a file player tells of a note before it sounds */
const see = (t: number, midi: number, dur: number, velocity = 84): Ev => ({ t, e: { type: 'foresee', midi, velocity, dur } });

function play(id: InstrumentId, events: Ev[], seconds: number, probe?: (core: InstrumentCore, frame: number) => void, block = 128): Float32Array {
  const core = createCore({ sampleRate: FS, instrument: id, dry: true });
  for (const ev of events) core.schedule(ev.e, Math.round(ev.t * FS));
  const n = Math.round(seconds * FS);
  const L = new Float32Array(n);
  const bl = new Float32Array(block);
  const br = new Float32Array(block);
  for (let i = 0; i < n; i += block) {
    const len = Math.min(block, n - i);
    core.process(bl, br, len);
    L.set(bl.subarray(0, len), i);
    probe?.(core, i + len);
  }
  return L;
}
const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));
/** the level at a pitch (its first six harmonics, Hann-windowed) over [t0, t1] */
function at(x: Float32Array, midi: number, t0: number, t1: number): number {
  const f = 440 * 2 ** ((midi - 69) / 12);
  const a = Math.round(t0 * FS);
  const W = Math.round((t1 - t0) * FS);
  let p = 0;
  for (let k = 1; k <= 6; k++) {
    let re = 0;
    let im = 0;
    let sw = 0;
    for (let i = 0; i < W; i++) {
      const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
      re += x[a + i] * h * Math.cos((2 * Math.PI * k * f * i) / FS);
      im += x[a + i] * h * Math.sin((2 * Math.PI * k * f * i) / FS);
      sw += h;
    }
    p += ((2 * Math.hypot(re, im)) / sw) ** 2 / 2;
  }
  return Math.sqrt(p);
}
const median = (a: number[]) => [...a].sort((p, q) => p - q)[a.length >> 1];
/** a line of notes as a file sends it: each `len` long, held `over` into the next (under 0: a rest) */
function line(seq: number[], len: number, over: number, vel = 84): Ev[] {
  const ev: Ev[] = [];
  seq.forEach((m, i) => ev.push(see(0.1 + i * len, m, len + over, vel)));
  seq.forEach((m, i) => ev.push(on(0.1 + i * len, m, vel), off(0.1 + i * len + len + over, m)));
  // (a file's order at one instant: the ends first)
  return ev.sort((p, q) => p.t - q.t || (p.e.type === 'foresee' ? -1 : 0) - (q.e.type === 'foresee' ? -1 : 0) || (p.e.type === 'noteOff' ? 0 : 1) - (q.e.type === 'noteOff' ? 0 : 1));
}

describe('audio audit 3: the trumpet tongued over the breath as a file plays it', () => {
  it('a note joined to the last a fourth up (another partial) is at its level 30–70 ms after its beat', () => {
    // (before: −18.8, −7.8, +1.7, −12.0, −6.2 dB)
    const rise = [[55, 60], [57, 62], [60, 65], [62, 67], [64, 69]].map(([a, b]) => {
      const x = play('trumpet', [see(0.1, a, 0.3, 96), see(0.4, b, 0.4, 96), on(0.1, a, 96), off(0.4, a), on(0.4, b, 96), off(0.8, b)], 1.0);
      return db(at(x, b, 0.43, 0.47)) - db(at(x, b, 0.6, 0.75));
    });
    expect(Math.min(...rise)).toBeGreaterThan(-9);
    expect(median(rise)).toBeGreaterThan(-3);
  });

  it('a staccato pitch repeated over rests the tongue holds comes back as the first note came', () => {
    // 70 ms notes, 70 ms rests: the third note 10–40 ms after its beat against the first 40–70 ms after its
    // own (before: G3 −19.4, C4 −8.2 dB)
    for (const m of [55, 60]) {
      const x = play('trumpet', line([m, m, m, m], 0.14, -0.07, 96), 1.0);
      expect(db(at(x, m, 0.39, 0.42)) - db(at(x, m, 0.14, 0.17))).toBeGreaterThan(-8);
    }
  });

  it('struck again with no rest, and every note by hand: as they were (the standing wave sets the lips buzzing)', () => {
    // a pitch repeated by a file falls and comes back within 45 ms of its beat (unchanged: bit-identical)
    const x = play('trumpet', line([55, 55, 55], 0.25, 0, 96), 1.0);
    expect(db(at(x, 55, 0.395, 0.435)) - db(at(x, 55, 0.25, 0.33))).toBeGreaterThan(-4);
  });
});

describe('audio audit 3: the trombone slurring as a file plays it', () => {
  it('the slide is at the note’s place on its beat when the note was known to come; a valve turns in a few ms', () => {
    // B♭3 in first, G3 in fourth (0.26 m out), slurred
    let onBeat = -1;
    play('trombone', [see(0.1, 58, 0.33), see(0.4, 55, 0.4), on(0.1, 58), on(0.4, 55), off(0.43, 58), off(0.8, 55)], 0.6, (c, f) => {
      if (f === Math.round((0.4 * FS) / 128) * 128) onBeat = (c.getVisual() as { trombone: { slide: number } }).trombone.slide;
    });
    expect(onBeat).toBeGreaterThan(0.24);
    expect(onBeat).toBeLessThan(0.28);
    // B♭2 to C3 (the F valve, first position), by hand: 60 ms after the beat the tube is C3's (before: 28 cm of
    // slide short of it, the valve's loop coming in at the slide's speed)
    let short = 1e9;
    play('trombone', [on(0.1, 46), on(0.4, 48), off(0.43, 46), off(0.8, 48)], 0.6, (c, f) => {
      const t = c as unknown as { D: number; Dtarget: number };
      if (f === Math.round((0.46 * FS) / 128) * 128) short = ((t.D - t.Dtarget) * 343.2) / (4 * FS);
    });
    expect(Math.abs(short)).toBeLessThan(0.01);
  });

  it('a slurred scale at 200 ms a note: every note speaks (none more than 15 dB under the others)', () => {
    // B♭ major up an octave and back, each note held 30 ms into the next (before: C3 −34, G3 −16, the last
    // B♭2 −24 dB against the median note)
    const seq = [46, 48, 50, 51, 53, 55, 57, 58, 57, 55, 53, 51, 50, 48, 46];
    const len = 0.2;
    const x = play('trombone', line(seq, len, 0.03), 0.1 + seq.length * len + 0.3);
    const level = seq.map((m, i) => db(at(x, m, 0.1 + (i + 0.4) * len, 0.1 + (i + 0.9) * len)));
    const mid = median(level);
    for (const v of level) expect(v - mid).toBeGreaterThan(-15);
  });

  it('detached notes over rests the tongue holds are kicked: none is lost', () => {
    // a scale of 70 ms notes, 70 ms rests (before: the sixth note 17 dB under the median one)
    const seq = [53, 55, 57, 58, 60, 58, 57, 55];
    const x = play('trombone', line(seq, 0.139, -0.069, 80), 1.6);
    const level = seq.map((m, i) => db(at(x, m, 0.1 + i * 0.139 + 0.025, 0.1 + i * 0.139 + 0.065)));
    const mid = median(level);
    for (const v of level) expect(v - mid).toBeGreaterThan(-10);
  });
});

describe('audio audit 3: what a file tells ahead', () => {
  it('the next note to come, however it will be joined (MonoKeys.upcoming); nothing else of the keys changes', () => {
    const k = new MonoKeys(FS);
    // a note of 0.3 s, one slurred to it (begun 30 ms before its end), one begun where that ends
    k.foresee(4800, 60, 80, 0.3);
    k.foresee(4800 + 0.27 * FS, 64, 80, 0.3);
    k.foresee(4800 + 0.57 * FS, 67, 80, 0.3);
    expect(k.upcoming(0, 0.25)).toBe(4800);
    expect(k.upMidi).toBe(60);
    expect(k.upcoming(0, 0.05)).toBe(-1);
    k.on(60, 80);
    expect(k.settle(4800, false, false)).toMatchObject({ kind: 'tongue', midi: 60 });
    expect(k.upcoming(4800, 0.25)).toBe(-1);
    expect(k.upcoming(4800 + 0.1 * FS, 0.25)).toBe(4800 + 0.27 * FS);
    expect(k.upMidi).toBe(64);
    expect(k.upSlur).toBe(true);
    k.on(64, 80);
    expect(k.settle(4800 + 0.27 * FS, true, false)).toMatchObject({ kind: 'slur', midi: 64 });
    k.off(60);
    k.settle(4800 + 0.3 * FS, true, false);
    expect(k.upcoming(4800 + 0.4 * FS, 0.25)).toBe(4800 + 0.57 * FS);
    expect(k.upMidi).toBe(67);
    expect(k.upSlur).toBe(false);
  });

  it('whatever the host’s block: a file’s slurs and joined notes are bit-identical at 128 and 37 frames a call', () => {
    const scale = line([46, 48, 50, 51, 53, 55, 57, 58], 0.17, 0.03);
    const a = play('trombone', scale, 1.7);
    const b = play('trombone', scale, 1.7, undefined, 37);
    const bugle = line([55, 60, 64, 67, 60, 55], 0.15, 0, 96);
    const c = play('trumpet', bugle, 1.2);
    const d = play('trumpet', bugle, 1.2, undefined, 37);
    let worst = 0;
    for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
    for (let i = 0; i < c.length; i++) worst = Math.max(worst, Math.abs(c[i] - d[i]));
    expect(worst).toBe(0);
  });
});
