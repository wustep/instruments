// What happens in the milliseconds where one note of a wind becomes the next: the level, the pitch and how
// periodic the sound is, every millisecond, from a dry render. Shared by scripts/winds-legato.ts (the cases
// and their numbers) and scripts/render-winds-legato.ts (the clips). Analysis only.
//
// A Fourier window cannot tell two notes a tone apart in less than some 15 periods, and a change of note is
// over in two or three: so the pitch here is the period itself, read off the normalised autocorrelation of a
// window three periods long (McLeod & Wyvill 2005, "A smarter way to find pitch": the first peak within 0.9
// of the highest, so an octave below is not taken for the note), and the level is that window's RMS.
import type { TimedEvent } from '../packages/engine/src/core/render.ts';

export const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const db = (x: number) => 10 * Math.log10(Math.max(1e-18, x));
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m: number) => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

export interface Frame {
  /** seconds */
  t: number;
  /** the window's power (mean square) */
  p: number;
  /** the period found, as a frequency (Hz); 0: none */
  f: number;
  /** how periodic: the autocorrelation's peak, 0…1 */
  clear: number;
}

/**
 * Frames every `hop` s from `t0` to `t1`: a window of `periods` periods of `fLo` (at least 5 ms) centred on
 * the frame; the pitch looked for between `fLo`/1.5 and `fHi`·2.6 (an octave or a twelfth above shows as
 * such: a wind on the wrong register).
 */
export function trackFrames(x: Float32Array, fs: number, t0: number, t1: number, fLo: number, fHi: number, hop = 0.001, periods = 3): Frame[] {
  const W = Math.max(Math.round(0.005 * fs), Math.round((periods * fs) / fLo));
  const lagMin = Math.max(2, Math.floor(fs / (fHi * 2.6)));
  const lagMax = Math.min(W - 2, Math.ceil((fs * 1.5) / fLo));
  const nsdf = new Float64Array(lagMax + 2);
  const out: Frame[] = [];
  for (let t = t0; t <= t1 + 1e-9; t += hop) {
    const a = Math.round(t * fs) - (W >> 1);
    let p = 0;
    for (let i = 0; i < W; i++) {
      const v = a + i >= 0 && a + i < x.length ? x[a + i] : 0;
      p += v * v;
    }
    p /= W;
    let best = 0;
    for (let lag = lagMin; lag <= lagMax + 1; lag++) {
      let ac = 0;
      let m = 0;
      for (let i = 0; i + lag < W; i++) {
        const u = a + i >= 0 && a + i < x.length ? x[a + i] : 0;
        const v = a + i + lag >= 0 && a + i + lag < x.length ? x[a + i + lag] : 0;
        ac += u * v;
        m += u * u + v * v;
      }
      nsdf[lag] = m > 0 ? (2 * ac) / m : 0;
      if (lag <= lagMax && nsdf[lag] > best) best = nsdf[lag];
    }
    let f = 0;
    let clear = 0;
    if (best > 0.3)
      for (let lag = lagMin + 1; lag <= lagMax; lag++) {
        if (nsdf[lag] >= 0.9 * best && nsdf[lag] >= nsdf[lag - 1] && nsdf[lag] > nsdf[lag + 1]) {
          // (the peak between the samples: a parabola through three)
          const y0 = nsdf[lag - 1];
          const y1 = nsdf[lag];
          const y2 = nsdf[lag + 1];
          const d = y0 - 2 * y1 + y2;
          const off = d !== 0 ? (0.5 * (y0 - y2)) / d : 0;
          f = fs / (lag + off);
          clear = y1 - 0.25 * (y0 - y2) * off;
          break;
        }
      }
    out.push({ t, p, f, clear });
  }
  return out;
}

export const cents = (f: number, ref: number) => (f > 0 ? 1200 * Math.log2(f / ref) : NaN);
export const med = (a: number[]) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : NaN;
};
export const pct = (a: number[], q: number) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN;
};

export type Join = 'slur' | 'join' | 'gap';

export interface JoinMeasure {
  /** the lowest level from 20 ms before the join to 120 ms after it, against the lower of the two notes'
   *  steady levels (dB, ≤ 0: a hole), and how long it stays 6 dB or more under that (ms) */
  dipDb: number;
  dipMs: number;
  /** ms from the join until the pitch is within 30 cents of the new note and stays (20 ms), the sound
   *  periodic and within 6 dB of the new note's steady level: the note has spoken */
  speakMs: number;
  /** ms in which something sounds (within 12 dB of the steady level) that is neither note: its pitch more
   *  than 30 cents from both, or not periodic (a glide, a crack, a noise) */
  betweenMs: number;
  /** of those, ms within 30 cents of an octave or a twelfth above or an octave below the new note (a wrong
   *  register) */
  crackMs: number;
  /** the pitch's furthest overshoot past the new note in its first 80 ms (cents, signed in the direction
   *  of the step; 0: none) */
  overCents: number;
  /** the new note's steady level against the old one's (dB), and its steady pitch off its own (cents) */
  stepDb: number;
  offCents: number;
  /** the old note's steady pitch off its own (cents): far off, it was on a wrong register before the join,
   *  and what follows is not the join's doing */
  fromCents: number;
  /** the largest one-sample step within ±0.5 ms of the join over the 99th percentile of the steps in the
   *  50 ms either side (a click) */
  jump: number;
  /** the level's rise per ms at its steepest within 60 ms after the join (dB/ms): how hard the note begins */
  riseDbMs: number;
}

/** steady level (power) and pitch of a note over the stretch [a, b] s */
export function steady(x: Float32Array, fs: number, a: number, b: number, midi: number): { p: number; f: number } {
  const fr = trackFrames(x, fs, a, b, et(midi), et(midi), 0.002);
  return { p: med(fr.map((q) => q.p)), f: med(fr.map((q) => q.f).filter((f) => f > 0)) };
}

/**
 * One join: the note `from` sounding until `t1`, then `to` (until `end`). `prevStart`: where `from` began.
 */
export function measureJoin(x: Float32Array, fs: number, from: number, to: number, prevStart: number, t1: number, end: number): { m: JoinMeasure; frames: Frame[] } {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const len = end - t1;
  const sOld = steady(x, fs, Math.max(prevStart + 0.5 * (t1 - prevStart), t1 - 0.08), t1 - 0.012, from);
  const sNew = steady(x, fs, t1 + Math.max(0.5 * len, Math.min(len - 0.02, 0.08)), end - 0.008, to);
  const frames = trackFrames(x, fs, t1 - 0.03, Math.min(end, t1 + 0.15), et(lo), et(hi));
  const ref = Math.min(sOld.p, sNew.p);
  let dip = Infinity;
  let dipMs = 0;
  let between = 0;
  let crack = 0;
  let speak = len * 1000;
  let over = 0;
  let rise = 0;
  const fNew = et(to);
  const fOld = et(from);
  const dir = Math.sign(to - from) || 1;
  const near = (f: number, r: number) => Math.abs(cents(f, r)) <= 30;
  const ok = (q: Frame) => q.clear >= 0.8 && near(q.f, fNew) && q.p >= sNew.p / 4;
  for (let i = 0; i < frames.length; i++) {
    const q = frames[i];
    const dt = q.t - t1;
    if (dt >= -0.02 && dt <= 0.12) {
      const d = db(q.p / ref);
      if (d < dip) dip = d;
      if (d <= -6) dipMs++;
    }
    if (dt >= -0.01 && q.p >= ref / 16) {
      const isOld = q.clear >= 0.8 && near(q.f, fOld);
      const isNew = q.clear >= 0.8 && near(q.f, fNew);
      if (!isOld && !isNew) {
        between++;
        if (q.clear >= 0.8 && (near(q.f, 2 * fNew) || near(q.f, 3 * fNew) || near(q.f, fNew / 2) || near(q.f, 1.5 * fNew))) crack++;
      }
    }
    if (dt >= 0 && dt <= 0.08 && q.clear >= 0.8 && q.f > 0) {
      const c = cents(q.f, fNew) * dir;
      if (c > over && c < 300) over = c;
    }
    if (dt >= 0 && dt <= 0.06 && i >= 2) {
      const r = (db(frames[i].p) - db(frames[i - 2].p)) / 2;
      if (r > rise) rise = r;
    }
  }
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].t < t1) continue;
    let good = true;
    for (let j = i; j < Math.min(frames.length, i + 20); j++) if (!ok(frames[j])) good = false;
    if (good) {
      speak = (frames[i].t - t1) * 1000;
      break;
    }
  }
  // the click at the join
  const c = Math.round(t1 * fs);
  let worst = 0;
  for (let i = Math.max(1, c - Math.round(0.0005 * fs)); i < Math.min(x.length, c + Math.round(0.0005 * fs)); i++) worst = Math.max(worst, Math.abs(x[i] - x[i - 1]));
  const around: number[] = [];
  const g = Math.round(0.002 * fs);
  const w = Math.round(0.05 * fs);
  for (let i = Math.max(1, c - w); i < Math.min(x.length, c + w); i++) if (Math.abs(i - c) > g) around.push(Math.abs(x[i] - x[i - 1]));
  const jump = worst / Math.max(1e-9, pct(around, 0.99));
  return {
    frames,
    m: {
      dipDb: +Math.min(0, dip).toFixed(1),
      dipMs,
      speakMs: +speak.toFixed(1),
      betweenMs: between,
      crackMs: crack,
      overCents: +over.toFixed(0),
      stepDb: +db(sNew.p / sOld.p).toFixed(1),
      offCents: +cents(sNew.f, fNew).toFixed(1),
      fromCents: +cents(sOld.f, fOld).toFixed(1),
      jump: +jump.toFixed(2),
      riseDbMs: +rise.toFixed(2),
    },
  };
}

/** two notes as a file (foreseen) or a hand (not) sends them: `from` for `first` s, then `to` for `len` s,
 *  slurred (the first held `over` s into the second), joined (it ends where the second begins) or after a
 *  rest of `gap` s */
export function pairEvents(from: number, to: number, art: Join, vel: number, len: number, hand: boolean, o: { first?: number; over?: number; gap?: number; vel2?: number } = {}): { events: TimedEvent[]; t0: number; t1: number; end: number } {
  const t0 = 0.1;
  const first = o.first ?? Math.max(len, 0.25);
  const gap = art === 'gap' ? (o.gap ?? 0.05) : 0;
  const over = art === 'slur' ? (o.over ?? 0.03) : 0;
  const t1 = t0 + first + gap;
  const v2 = o.vel2 ?? vel;
  const ev: TimedEvent[] = [
    { time: t0, event: { type: 'noteOn', midi: from, velocity: vel } },
    { time: t0 + first + over, event: { type: 'noteOff', midi: from } },
    { time: t1, event: { type: 'noteOn', midi: to, velocity: v2 } },
    { time: t1 + len, event: { type: 'noteOff', midi: to } },
  ];
  // (a file's order at one instant: the ends first)
  ev.sort((p, q) => p.time - q.time || (p.event.type === 'noteOff' ? 0 : 1) - (q.event.type === 'noteOff' ? 0 : 1));
  const fore: TimedEvent[] = hand
    ? []
    : [
        { time: t0, event: { type: 'foresee', midi: from, velocity: vel, dur: first + over } as never },
        { time: t1, event: { type: 'foresee', midi: to, velocity: v2, dur: len } as never },
      ];
  return { events: [...fore, ...ev], t0, t1, end: t1 + len };
}
