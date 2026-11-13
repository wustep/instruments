// The players the horn, the trumpet, the timpani and the bowed strings were given (HORN_HUMAN, TRUMPET_HUMAN,
// TIMPANI_HUMAN, BOWED_HUMAN), as the tuba, the trombone, the woodwinds, the harp and the glockenspiel have
// theirs: no two notes alike, a held note not held dead still, the same notes the same samples, and `human` 0
// the model alone (bit for bit the engine before: scripts/same-sound.ts --params '{"human":0}' --before <old>).
import { describe, expect, it } from 'vitest';
import { renderInstrument, type InstrumentId, type TimedEvent } from '../src/core/index.ts';
import { analyzeSustained } from '../src/analysis/index.ts';

const FS = 44100;
const rmsDb = (x: Float32Array, a: number, b: number) => {
  let e = 0;
  const i0 = Math.round(a * FS);
  const i1 = Math.round(b * FS);
  for (let i = i0; i < i1; i++) e += x[i] * x[i];
  return 10 * Math.log10(e / (i1 - i0) + 1e-30);
};
const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};
const same = (a: Float32Array, b: Float32Array) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  return d;
};
/** one pitch tongued `n` times (0.45 s on, 0.3 s off): the sound, and each note's level over its middle (dB) */
const repeats = (id: InstrumentId, midi: number, human: number, player = 0, n = 6, vel = 80) => {
  const events: TimedEvent[] = [];
  for (let i = 0; i < n; i++) events.push({ time: 0.05 + 0.75 * i, event: { type: 'noteOn', midi, velocity: vel } }, { time: 0.5 + 0.75 * i, event: { type: 'noteOff', midi } });
  const x = renderInstrument({ sampleRate: FS, instrument: id, dry: true, player, params: { human, vibrato: 0 } as never, events, duration: 0.05 + 0.75 * n }).left;
  return { x, levels: Array.from({ length: n }, (_, i) => rmsDb(x, 0.05 + 0.75 * i + 0.2, 0.05 + 0.75 * i + 0.42)) };
};
/** a held note's pitch from one tenth of a second to the next (cents, a standard deviation): the advance of
 *  its fundamental's phase */
const wander = (x: Float32Array, midi: number, from: number, to: number) => {
  const f0 = 440 * 2 ** ((midi - 69) / 12);
  const ph = (t0: number) => {
    let re = 0;
    let im = 0;
    const n = Math.round(0.2 * FS);
    const i0 = Math.round(t0 * FS);
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
      re += x[i0 + i] * w * Math.cos((2 * Math.PI * f0 * (i0 + i)) / FS);
      im -= x[i0 + i] * w * Math.sin((2 * Math.PI * f0 * (i0 + i)) / FS);
    }
    return Math.atan2(im, re);
  };
  const cs: number[] = [];
  for (let t = from; t < to; t += 0.1) {
    let d = ph(t + 0.1) - ph(t);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    cs.push(1200 * Math.log2(1 + d / (2 * Math.PI * f0 * 0.1)));
  }
  return sd(cs);
};
const held = (id: InstrumentId, midi: number, human: number, player = 0) =>
  renderInstrument({ sampleRate: FS, instrument: id, dry: true, player, params: { human, vibrato: 0 } as never, events: [{ time: 0.05, event: { type: 'noteOn', midi, velocity: 80 } }], duration: 3.2 }).left;

describe('a player in every instrument that is blown, bowed or struck by hand', () => {
  for (const [id, midi] of [['horn', 55], ['trumpet', 67]] as const) {
    it(`the ${id}: no two notes alike, a held note's pitch wanders; \`human\` 0 is the model alone; the same notes give the same samples`, () => {
      const r0 = repeats(id, midi, 0);
      const r1 = repeats(id, midi, 1);
      // the model alone tongues one pitch the same way every time (after the first, from silence); a player does not
      expect(sd(r0.levels.slice(1))).toBeLessThan(0.05);
      expect(sd(r1.levels)).toBeGreaterThan(0.1);
      expect(sd(r1.levels)).toBeLessThan(1.5);
      // a held note: the pitch from one tenth of a second to the next
      const h0 = held(id, midi, 0);
      const h1 = held(id, midi, 1);
      expect(wander(h0, midi, 0.8, 2.9)).toBeLessThan(0.6);
      expect(wander(h1, midi, 0.8, 2.9)).toBeGreaterThan(0.8);
      expect(wander(h1, midi, 0.8, 2.9)).toBeLessThan(8);
      // a seeded stream: the same notes, the same samples; another player, another stream
      expect(same(r1.x, repeats(id, midi, 1).x)).toBe(0);
      expect(same(r1.x, repeats(id, midi, 1, 1).x)).toBeGreaterThan(1e-3);
    });
  }

  it('the timpani: no two strokes alike (their level, the head’s partials); `human` 0 every stroke the voicing’s own', () => {
    const strokes = (human: number, player = 0) => {
      const events: TimedEvent[] = [];
      // (each stroke on a stopped head: only the stroke differs)
      for (let i = 0; i < 6; i++) events.push({ time: 0.05 + 1.6 * i, event: { type: 'noteOn', midi: 45, velocity: 90 } }, { time: 0.05 + 1.6 * i + 0.9, event: { type: 'noteOff', midi: 45 } });
      const x = renderInstrument({ sampleRate: FS, instrument: 'timpani', dry: true, player, params: { human, damp: 1 } as never, events, duration: 0.05 + 1.6 * 6 }).left;
      return { x, levels: Array.from({ length: 6 }, (_, i) => rmsDb(x, 0.05 + 1.6 * i, 0.05 + 1.6 * i + 0.5)) };
    };
    const s0 = strokes(0);
    const s1 = strokes(1);
    expect(sd(s0.levels)).toBeLessThan(0.01);
    expect(sd(s1.levels)).toBeGreaterThan(0.25);
    expect(sd(s1.levels)).toBeLessThan(2.5);
    // (no stroke is a blow from nowhere: within 3 dB of the voicing's)
    for (const l of s1.levels) expect(Math.abs(l - s0.levels[0])).toBeLessThan(3);
    expect(same(s1.x, strokes(1).x)).toBe(0);
    expect(same(s1.x, strokes(1, 1).x)).toBeGreaterThan(1e-4);
  });

  it('the bowed strings: a stopped note is put down by ear, a few cents either side; an open string is the string; `human` 0 the model’s own pitch', () => {
    const cents = (midi: number, human: number, player = 0) => {
      const x = renderInstrument({ sampleRate: FS, instrument: 'violin', dry: true, player, params: { human, vibrato: 0 } as never, events: [{ time: 0.05, event: { type: 'noteOn', midi, velocity: 80 } }], duration: 1.5 }).left;
      return analyzeSustained(x, FS, { start: Math.round(0.6 * FS), end: x.length }, midi).cents;
    };
    // five stopped notes, by three players: where each is put, against the model's own pitch
    const off: number[] = [];
    for (const m of [59, 64, 69, 71, 78]) for (const pl of [0, 1, 2]) off.push(cents(m, 1, pl) - cents(m, 0, pl));
    expect(sd(off)).toBeGreaterThan(1.5);
    expect(sd(off)).toBeLessThan(7);
    expect(Math.max(...off.map(Math.abs))).toBeLessThan(12);
    // the open G is the string, whoever plays it
    expect(Math.abs(cents(55, 1) - cents(55, 0))).toBeLessThan(0.3);
  });
});
