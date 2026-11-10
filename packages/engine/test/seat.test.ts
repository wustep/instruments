// Orchestra mode: an instrument heard from its seat on the stage (the room's `seat`, core/post.ts).
// Without a seat it is the instrument as it is. From a seat its direct sound reaches each of the
// room's two microphones at that path's own time and level (1/r and the cardioid's angle), and its
// reflections come from there; the room's taps stay bounded while their delays glide to the seat.
import { describe, expect, it } from 'vitest';
import { createCore, renderInstrument } from '../src/core/index.ts';
import { Room } from '../src/core/post.ts';

const FS = 48000;
const note = (m: number, dur: number) => [
  { time: 0.02, event: { type: 'noteOn' as const, midi: m, velocity: 90 } },
  { time: dur - 0.2, event: { type: 'noteOff' as const, midi: m } },
];
const run = (instrument: 'violin' | 'trumpet', params: Record<string, unknown>, dur = 0.8, fs = FS) => renderInstrument({ sampleRate: fs, instrument, events: note(instrument === 'violin' ? 67 : 70, dur), duration: dur, params: params as never });
const energy = (x: Float32Array) => x.reduce((s, v) => s + v * v, 0);
const db = (x: number) => 10 * Math.log10(x);
/** the lag (samples) at which R best matches L: positive, R later */
const lagOf = (l: Float32Array, r: Float32Array) => {
  let best = 0;
  let bestV = -Infinity;
  for (let k = -96; k <= 96; k++) {
    let v = 0;
    for (let i = 96; i < l.length - 96; i++) v += l[i] * r[i + k];
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return best;
};

describe('a seat on the stage', () => {
  it('no seat, a null seat and the middle of the stage are the instrument as it is, sample for sample', () => {
    const a = run('violin', {});
    for (const seat of [null, [0, 0]]) {
      const b = run('violin', { seat });
      let d = 0;
      for (let i = 0; i < a.left.length; i++) d = Math.max(d, Math.abs(a.left[i] - b.left[i]), Math.abs(a.right[i] - b.right[i]));
      expect(d).toBe(0);
    }
  });

  it('on the left: louder and earlier in the left channel; on the right, the mirror', () => {
    // the room off: the direct sound alone (the trumpet's own two channels are nearly alike)
    const mid = run('trumpet', { room: 0 });
    const left = run('trumpet', { room: 0, seat: [-1.75, 0] });
    const right = run('trumpet', { room: 0, seat: [1.75, 0] });
    const ild = (r: { left: Float32Array; right: Float32Array }) => db(energy(r.left) / energy(r.right));
    // a source 28° to the side of a pair of cardioids 0.6 m apart at ±50°: ≈ 4 dB and 0.8 ms
    expect(ild(left) - ild(mid)).toBeGreaterThan(3);
    expect(ild(right) - ild(mid)).toBeLessThan(-3);
    expect(Math.abs(ild(left) - ild(mid) + (ild(right) - ild(mid)))).toBeLessThan(0.3);
    const lagL = lagOf(left.left, left.right);
    const lagR = lagOf(right.left, right.right);
    expect(lagL / FS).toBeGreaterThan(0.0006);
    expect(lagL / FS).toBeLessThan(0.0011);
    expect(lagR).toBe(-lagL);
  });

  it('the same place at 22.05, 44.1 and 96 kHz', () => {
    for (const fs of [22050, 44100, 96000]) {
      const mid = run('trumpet', { room: 0 }, 0.6, fs);
      const left = run('trumpet', { room: 0, seat: [-1.75, 0] }, 0.6, fs);
      const ild = (r: { left: Float32Array; right: Float32Array }) => db(energy(r.left) / energy(r.right));
      expect(ild(left) - ild(mid), `${fs}`).toBeGreaterThan(3);
      const lag = lagOf(left.left, left.right) / fs;
      expect(lag, `${fs}`).toBeGreaterThan(0.0006);
      expect(lag, `${fs}`).toBeLessThan(0.0011);
    }
  });

  it('upstage: further from the microphones, its direct sound weaker by the path (1/r)', () => {
    const mid = run('trumpet', { room: 0 });
    const back = run('trumpet', { room: 0, seat: [0, 1.5] });
    // 3.24 m → 4.73 m (−3.28 dB), the cardioids a hair nearer their axis (+0.15 dB)
    const d = db(energy(back.left) / energy(mid.left));
    expect(d).toBeGreaterThan(-3.43);
    expect(d).toBeLessThan(-2.83);
  });

  it('moved while playing: it glides there (no step in the sound)', () => {
    const core = createCore({ instrument: 'trumpet', sampleRate: FS } as never);
    core.setParams({ seat: [-1.5, 0] });
    core.schedule({ type: 'noteOn', midi: 70, velocity: 80 }, core.frame + 64);
    const n = Math.round(0.6 * FS);
    const x = new Float32Array(n);
    const L = new Float32Array(128);
    const R = new Float32Array(128);
    for (let i = 0; i < n; i += 128) {
      if (i === 128 * 150) core.setParams({ seat: [1.5, 0] });
      core.process(L, R, 128);
      x.set(L.subarray(0, Math.min(128, n - i)), i);
    }
    // the largest sample-to-sample step after the move, against the steps of the held note before it
    const step = (a: number, b: number) => {
      let m = 0;
      for (let i = a + 1; i < b; i++) m = Math.max(m, Math.abs(x[i] - x[i - 1]));
      return m;
    };
    expect(step(128 * 150, 128 * 180)).toBeLessThan(1.3 * step(128 * 100, 128 * 150));
  });
});

describe('the room’s taps', () => {
  it('a delay gliding onto a whole sample from above reads its sample, not a spike (seated, a held tone)', () => {
    // these seats left a reflection's delay a hair above a whole number of samples: the read position
    // rounded to the buffer's length and its fraction to the length itself (spikes of 18–23 for 0.5 in)
    for (const [room, seat] of [
      [0.3, [1.75, 0.55]],
      [0.22, [0, 1.55]],
    ] as const) {
      const r = new Room(FS);
      r.configure(room, seat);
      const N = FS * 4;
      const L = new Float64Array(N);
      const R = new Float64Array(N);
      for (let i = 0; i < N; i++) L[i] = R[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / FS);
      for (let o = 0; o < N; o += 64) r.process(L.subarray(o, o + 64), R.subarray(o, o + 64), 64, 1, 0.25);
      let m = 0;
      for (let i = 0; i < N; i++) m = Math.max(m, Math.abs(L[i]), Math.abs(R[i]));
      expect(m).toBeLessThan(1);
    }
  });
});
