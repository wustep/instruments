// Analysis of a note that is set going once and left to ring: a plucked string (the harp), a struck bar (the
// glockenspiel). Applied identically to the reference recordings and to the model's renders: the onset, the
// fundamental, a list of partials (each searched near a given ratio to the fundamental: a string's harmonics
// 2, 3, 4 …, a free bar's 2.76, 5.40, 8.93 …) with their frequencies, their levels at the start and their
// decay rates, how long the note rings, its brightness at the start and a little later, the attack against
// what follows, the level, and the third-octave spectrum of its first second.

import { spectrum, type Spectrum } from './fft.ts';
import { THIRD_OCT } from './note.ts';

export interface RingAnalysis {
  /** the onset (s into the signal) */
  onset: number;
  /** the fundamental (Hz), over `early` s after the onset */
  f0: number;
  /** the partials' frequencies over f0, in the order of the ratios asked for (the first is 1; NaN: not found) */
  ratios: number[];
  /** their levels (dB re the strongest of them) over the first `early` s */
  levels: number[];
  /** their decay rates (dB/s), each from its own track while it stays above the floor (NaN: too short) */
  decays: number[];
  /** seconds from the envelope's peak until the level (10 ms RMS) has fallen 20 dB, and 40 dB (NaN: the
   *  recording ends or meets its floor first) */
  ring20: number;
  ring40: number;
  /** spectral centroid (Hz) of the first `early` s, and of the same span begun 4 × early later */
  centroid: number;
  centroidLate: number;
  /** the first 20 ms over the 180 ms after them (dB): the pluck's or the mallet's knock against the tone */
  attack: number;
  /** RMS level of the first 0.5 s (dB re full scale) */
  level: number;
  /** third-octave levels of the first second (dB re the loudest band), THIRD_OCT centres */
  bands: number[];
}

export interface RingOptions {
  /** the partials to look for, as ratios to the fundamental (the first must be 1) */
  ratios: number[];
  /** how far from its ratio a partial may lie (a fraction; default 0.04) */
  tol?: number;
  /** the span the start is read over (s; default 0.25: a low string's partials need it; a glockenspiel's top
   *  bars ring a second) */
  early?: number;
  /** how long the decays are followed (s; default 3) */
  follow?: number;
  /** the centroid's band (Hz; default 30–12000) */
  band?: [number, number];
  /** only this share of the signal is read (default 1): a sample faded out at its end is cut short of the fade */
  use?: number;
}

const db = (x: number) => 10 * Math.log10(Math.max(x, 1e-30));

function rmsDb(x: ArrayLike<number>, a: number, b: number): number {
  let s = 0;
  const i0 = Math.max(0, a);
  const i1 = Math.min(x.length, b);
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return db(s / Math.max(1, i1 - i0));
}

function peakNear(sp: Spectrum, f: number, rel: number): { f: number; mag: number } | null {
  const lo = Math.max(2, Math.floor((f * (1 - rel)) / sp.binHz));
  const hi = Math.min(sp.mag.length - 3, Math.ceil((f * (1 + rel)) / sp.binHz));
  let best = -1;
  for (let b = lo; b <= hi; b++) if (sp.mag[b] >= sp.mag[b - 1] && sp.mag[b] >= sp.mag[b + 1] && (best < 0 || sp.mag[b] > sp.mag[best])) best = b;
  if (best < 0) return null;
  const a = Math.log(sp.mag[best - 1] + 1e-30);
  const c = Math.log(sp.mag[best] + 1e-30);
  const d = Math.log(sp.mag[best + 1] + 1e-30);
  const den = a - 2 * c + d;
  const p = den === 0 ? 0 : (0.5 * (a - d)) / den;
  return { f: (best + p) * sp.binHz, mag: Math.exp(c - 0.25 * (a - d) * p) };
}

/** a partial's level (dB) frame by frame: the DFT at f (and a little either side, the largest), a Hann window
 *  of `win` s, a quarter of it the hop */
function track(x: ArrayLike<number>, fs: number, on: number, f: number, from: number, to: number, win: number, end: number): { t: number[]; l: number[] } {
  const N = Math.max(256, Math.round(win * fs));
  const hop = N >> 2;
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const t: number[] = [];
  const l: number[] = [];
  const om = (2 * Math.PI * f) / fs;
  for (let s = on + Math.round(from * fs); s + N <= Math.min(end, on + Math.round(to * fs)); s += hop) {
    let best = 0;
    for (const df of [-0.4, 0, 0.4]) {
      const o = om + (df * 2 * Math.PI) / N;
      const cr = Math.cos(o);
      const ci = -Math.sin(o);
      let zr = 1;
      let zi = 0;
      let re = 0;
      let im = 0;
      for (let i = 0; i < N; i++) {
        const v = x[s + i] * w[i];
        re += v * zr;
        im += v * zi;
        const nr = zr * cr - zi * ci;
        zi = zr * ci + zi * cr;
        zr = nr;
      }
      best = Math.max(best, re * re + im * im);
    }
    t.push((s - on + N / 2) / fs);
    l.push(db(best / (N * N)));
  }
  return { t, l };
}

/** least-squares fall of y over x (dB/s), over the points while y stays above `floor` */
function fall(t: number[], l: number[], floor: number): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (l[i] < floor) break;
    xs.push(t[i]);
    ys.push(l[i]);
  }
  if (xs.length < 4) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  return sxx > 0 ? -sxy / sxx : NaN;
}

const nextPow2 = (n: number) => {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
};

/** Analyse one note left to ring: `x` mono, `guess` its fundamental (Hz, searched ±4 %). */
export function analyzeRing(x: ArrayLike<number>, fs: number, guess: number, opts: RingOptions): RingAnalysis {
  const end = Math.min(x.length, Math.round(x.length * (opts.use ?? 1)));
  const early = opts.early ?? 0.25;
  const tol = opts.tol ?? 0.04;
  const [bLo, bHi] = opts.band ?? [30, 12000];
  let pk = 0;
  let pi = 0;
  for (let i = 0; i < end; i++) {
    const a = Math.abs(x[i]);
    if (a > pk) {
      pk = a;
      pi = i;
    }
  }
  // the onset: where the signal first reaches 5 % of its peak, less 1 ms
  let on = pi;
  for (let i = 0; i < pi; i++)
    if (Math.abs(x[i]) > 0.05 * pk) {
      on = i;
      break;
    }
  on = Math.max(0, on - Math.round(0.001 * fs));
  const len = Math.min(end - on, Math.round(early * fs));
  const N = nextPow2(Math.max(8192, 4 * len));
  // (the fundamental from a longer look where the note allows it: a low string's needs the resolution)
  const lenF = Math.min(end - on, Math.round(Math.max(early, Math.min(1, 12 / guess)) * fs));
  const spF = spectrum(x, fs, on, lenF, nextPow2(Math.max(16384, 4 * lenF)), 'hann');
  const p0 = peakNear(spF, guess, 0.04);
  const f0 = p0?.f ?? guess;
  const sp = spectrum(x, fs, on, len, N, 'hann');
  const ratios: number[] = [];
  const mags: number[] = [];
  opts.ratios.forEach((r, i) => {
    const p = i === 0 ? peakNear(spF, f0, 0.01) : peakNear(spF, f0 * r, tol);
    // (above the band the analysis keeps, or at Nyquist: not looked for)
    if (!p || f0 * r > 0.46 * fs) {
      ratios.push(NaN);
      mags.push(NaN);
      return;
    }
    ratios.push(p.f / f0);
    const q = peakNear(sp, p.f, Math.max(0.005, (1.5 * sp.binHz * (N / len)) / p.f));
    mags.push(q ? q.mag : NaN);
  });
  const top = Math.max(...mags.filter(Number.isFinite), 1e-30);
  const levels = mags.map((m) => (Number.isFinite(m) ? 20 * Math.log10(m / top) : NaN));
  // the noise floor: the quietest 10 ms frames of the signal's last second
  const env: number[] = [];
  const hop = Math.round(0.01 * fs);
  for (let s = on; s + hop <= end; s += hop) env.push(rmsDb(x, s, s + hop));
  const tail = env.slice(Math.max(0, env.length - 100)).sort((a, b) => a - b);
  const floorDb = tail[Math.floor(tail.length * 0.2)] ?? -120;
  // decays: each partial's own track (a window of about 12 periods of it, 20–190 ms), while 10 dB above the
  // floor's level in that bandwidth and within 40 dB of its own start
  const follow = opts.follow ?? 3;
  const decays = ratios.map((r) => {
    if (!Number.isFinite(r)) return NaN;
    const f = f0 * r;
    const win = Math.min(0.19, Math.max(0.02, 12 / f));
    const tr = track(x, fs, on, f, 0.01, follow, win, end);
    if (tr.l.length < 4) return NaN;
    const top1 = Math.max(...tr.l.slice(0, 4));
    // (white noise at floorDb RMS has this much power in the window's main lobe, in the track's units)
    const nf = floorDb + 10 * Math.log10(1.5 / Math.max(1, win * fs)) + 10;
    return fall(tr.t, tr.l, Math.max(top1 - 40, nf));
  });
  let ep = 0;
  for (let i = 1; i < env.length; i++) if (env[i] > env[ep]) ep = i;
  const ringTo = (d: number): number => {
    if (env[ep] - d < floorDb + 6) return NaN;
    for (let i = ep; i < env.length; i++) if (env[i] < env[ep] - d) return (i - ep) * 0.01;
    return NaN;
  };
  const centroidOf = (from: number): number => {
    const s0 = on + Math.round(from * fs);
    const l = Math.min(len, end - s0);
    if (l < 256) return NaN;
    const spc = spectrum(x, fs, s0, l, N, 'hann');
    let sw = 0;
    let s = 0;
    for (let b = 1; b < spc.mag.length; b++) {
      const f = b * spc.binHz;
      if (f < bLo || f > bHi) continue;
      const p = spc.mag[b] * spc.mag[b];
      sw += p * f;
      s += p;
    }
    return s > 0 ? sw / s : NaN;
  };
  const attack = rmsDb(x, on, on + Math.round(0.02 * fs)) - rmsDb(x, on + Math.round(0.02 * fs), on + Math.round(0.2 * fs));
  const level = rmsDb(x, on, Math.min(end, on + Math.round(0.5 * fs)));
  const l1 = Math.min(end - on, Math.round(1.0 * fs));
  const spb = spectrum(x, fs, on, l1, nextPow2(Math.max(65536, l1)), 'hann');
  const bands = THIRD_OCT.map((c) => {
    const lo = c / Math.pow(2, 1 / 6);
    const hi = c * Math.pow(2, 1 / 6);
    let e = 0;
    for (let b = Math.max(1, Math.floor(lo / spb.binHz)); b <= Math.min(spb.mag.length - 1, Math.ceil(hi / spb.binHz)); b++) e += spb.mag[b] * spb.mag[b];
    return db(e);
  });
  const bmax = Math.max(...bands);
  for (let i = 0; i < bands.length; i++) bands[i] -= bmax;
  return { onset: on / fs, f0, ratios, levels, decays, ring20: ringTo(20), ring40: ringTo(40), centroid: centroidOf(0), centroidLate: centroidOf(4 * early), attack, level, bands };
}
