// The flute switched quickly from note to note, by hand and as a file plays it: no note sounds a square wave.
//
// The jet's sharper aim after a tongued attack (flute.ts ATTACK_BOOST, QUICK_AIM) was a function of time alone,
// right only from silence. A note begun on a tube still ringing (a key let go and the next pressed some tens of
// milliseconds later; a note tongued over the breath; a file's short note) reached its full wave with the jet
// still aimed two to five times as sharp, and the jet, swung past its edge both ways, cut the flow off square:
// the odd harmonics 10–19 dB over the note's own and the level 2–5 dB over it for 60–150 ms, a synthesiser's
// buzz. By hand it was the timing's: a key let go inside the note's shortest breath (MIN_BLOW, 120 ms) was
// tongued over the breath, one let go after it was attacked afresh on the ringing tube. Now the aim leaves
// room for the wave already in the tube (flute.ts AIM_FULL). scripts/winds-switch.ts sweeps random switches.
import { describe, expect, it } from 'vitest';
import { renderInstrument } from '../src/core/index.ts';
import { harmonics, oddEven } from '../../../scripts/winds-switch.ts';

const FS = 48000;
const Q = 128 / FS;
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const db = (x: number) => 10 * Math.log10(Math.max(1e-30, x));
const snap = (t: number) => Math.round(t / Q) * Q;
type Ev = { time: number; event: Record<string, unknown> };
const sum = (h: number[]) => h.reduce((s, v) => s + v, 0);

/** the note's steady sound: told ahead as a long note (its fingering joined, the vent among it), 0.6–0.8 s in */
function steady(m: number, vel: number, params: Record<string, unknown>) {
  const ev: Ev[] = [{ time: 0.05, event: { type: 'foresee', midi: m, velocity: vel, dur: 1 } }, { time: 0.05, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 0.9, event: { type: 'noteOff', midi: m } }];
  const x = renderInstrument({ instrument: 'flute', sampleRate: FS, events: ev as never, duration: 0.9, dry: true, params }).left;
  let p = 0;
  const oe: number[] = [];
  for (let t = 0.6; t < 0.8; t += 0.004) {
    const h = harmonics(x, FS, Math.round(t * FS), et(m));
    p += sum(h);
    oe.push(oddEven(h));
  }
  oe.sort((a, b) => a - b);
  return { p: p / oe.length, oe: oe[oe.length >> 1] };
}

/** over a note's first `dur` s from `on`: its loudest against its steady level, and the most its odd harmonics
 *  stand over its even ones against its steady sound where it is within 10 dB of its level (dB) */
function onset(x: Float32Array, on: number, m: number, ref: { p: number; oe: number }, dur = 0.16) {
  let peak = -99;
  let square = -99;
  for (let t = on + 0.008; t <= on + dur; t += 0.004) {
    const h = harmonics(x, FS, Math.round(t * FS), et(m));
    const p = db(sum(h) / ref.p);
    peak = Math.max(peak, p);
    if (p > -10) square = Math.max(square, oddEven(h) - ref.oe);
  }
  return { peak, square };
}

/** A held `held` s, let go, B pressed `gap` s later, both by hand, as the worklet takes a live key: on a quantum */
function byHand(A: number, B: number, vel: number, held: number, gap: number, params: Record<string, unknown>) {
  const t0 = snap(0.1);
  const off = snap(t0 + held);
  const on = gap === 0 ? off : snap(t0 + held + gap);
  const ev: Ev[] = [
    { time: t0, event: { type: 'noteOn', midi: A, velocity: vel } },
    { time: off, event: { type: 'noteOff', midi: A } },
    { time: on, event: { type: 'noteOn', midi: B, velocity: vel } },
    { time: on + 0.3, event: { type: 'noteOff', midi: B } },
  ];
  const x = renderInstrument({ instrument: 'flute', sampleRate: FS, events: ev as never, duration: on + 0.35, dry: true, params }).left;
  return onset(x, on, B, steady(B, vel, params));
}

describe('the flute switched quickly by hand', () => {
  const PAIRS: [number, number][] = [[76, 77], [72, 74], [84, 86], [81, 79], [67, 69], [91, 89]];

  it('a key let go and the next pressed 3–60 ms later: the new note is a flute’s, not a square wave', () => {
    // (it was 10–18 dB over in its odd harmonics and 2–6 dB over its level, for a tenth of a second and more)
    for (const params of [{ human: 0 }, {}])
      for (const [A, B] of PAIRS)
        for (const gap of [0.003, 0.02, 0.04, 0.06]) {
          const r = byHand(A, B, 84, 0.2, gap, params);
          const what = `${A}→${B} gap ${gap * 1000} ms ${JSON.stringify(params)}: ${JSON.stringify(r)}`;
          // (now at most 8 and 2: the player's own strength is in it)
          expect(r.square, what).toBeLessThan(10);
          expect(r.peak, what).toBeLessThan(2.5);
        }
  });

  it('whichever side of the note’s shortest breath the key was let go', () => {
    // (let go at 110 ms the next was tongued over the breath; at 130 ms, attacked afresh on the ringing tube)
    for (const held of [0.11, 0.13])
      for (const [A, B] of [[76, 77], [84, 86]] as [number, number][]) {
        const r = byHand(A, B, 84, held, 0.02, { human: 0 });
        const what = `${A}→${B} held ${held * 1000} ms: ${JSON.stringify(r)}`;
        // (it was 10–16 dB and 2–3 dB, either way)
        expect(r.square, what).toBeLessThan(9);
        expect(r.peak, what).toBeLessThan(1);
      }
  });

  it('a key let go and the next pressed at the same instant (tongued over the breath): the same', () => {
    for (const [A, B] of PAIRS) {
      const r = byHand(A, B, 84, 0.2, 0, { human: 0 });
      // (it was 5–11 dB and 1–3 dB)
      expect(r.square, `${A}→${B}: ${JSON.stringify(r)}`).toBeLessThan(7);
      expect(r.peak, `${A}→${B}: ${JSON.stringify(r)}`).toBeLessThan(1);
    }
  });
});

describe('the flute’s short notes as a file plays them', () => {
  it('a short note from silence is a flute’s, not a square wave', () => {
    // (the quick attack a note known to be short is given, QUICK_AIM: 9–19 dB over in its odd harmonics and 1–4
    // dB over its level, for 60–150 ms)
    for (const m of [62, 67, 72, 77, 81])
      for (const vel of [40, 84, 115]) {
        const len = 0.14;
        const ev: Ev[] = [{ time: 0.1, event: { type: 'foresee', midi: m, velocity: vel, dur: len } }, { time: 0.1, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 0.1 + len, event: { type: 'noteOff', midi: m } }];
        const x = renderInstrument({ instrument: 'flute', sampleRate: FS, events: ev as never, duration: 0.4, dry: true, params: { human: 0 } }).left;
        const r = onset(x, 0.1, m, steady(m, vel, { human: 0 }), len);
        const what = `${m} v${vel}: ${JSON.stringify(r)}`;
        expect(r.square, what).toBeLessThan(10);
        expect(r.peak, what).toBeLessThan(1.5);
        // (and it still speaks: within 3 dB of its level)
        expect(r.peak, what).toBeGreaterThan(-3);
      }
  });
});
