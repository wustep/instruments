// Partial-frequency estimation and inharmonicity fitting, partial envelopes and
// decay fits. Used identically on reference recordings and model renders.

import { type Spectrum, peakIn, spectrum } from './fft.ts';

export interface Partial {
  k: number;
  f: number;
  /** dB re full scale */
  db: number;
}

export interface PartialAnalysis {
  f0: number;
  B: number;
  /** frequency of partial 1 implied by the fit */
  f1: number;
  partials: Partial[];
  /** RMS residual of the stiff-string fit, cents */
  fitCents: number;
}

const nextPow2 = (n: number): number => {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
};

/** Index of the onset: first sample above `rel` x the global peak. */
export function onsetIndex(x: ArrayLike<number>, rel = 0.1): number {
  let mx = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > mx) mx = a;
  }
  const thr = mx * rel;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) >= thr) return i;
  return 0;
}

/** Least squares fit of (f_k/k)^2 = f0^2 (1 + B k^2). Returns [f0, B]. */
export function fitStiffString(ps: { k: number; f: number }[], weights?: number[]): [number, number] {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < ps.length; i++) {
    const w = weights ? weights[i] : 1;
    const x = ps[i].k * ps[i].k;
    const y = (ps[i].f / ps[i].k) ** 2;
    sw += w;
    sx += w * x;
    sy += w * y;
    sxx += w * x * x;
    sxy += w * x * y;
  }
  const den = sw * sxx - sx * sx;
  if (ps.length < 2 || Math.abs(den) < 1e-30) {
    const f0 = ps.length ? ps[0].f / ps[0].k : 0;
    return [f0, 0];
  }
  const slope = (sw * sxy - sx * sy) / den;
  const icpt = (sy - slope * sx) / sw;
  const f0 = Math.sqrt(Math.max(icpt, 1e-9));
  return [f0, Math.max(0, slope / icpt)];
}

export function analyzePartials(
  x: ArrayLike<number>,
  fs: number,
  f1Guess: number,
  opts: { maxPartials?: number; fMax?: number; Bguess?: number; startSec?: number; lenSec?: number; floorDb?: number } = {},
): PartialAnalysis {
  const on = onsetIndex(x);
  const start = on + Math.round((opts.startSec ?? 0.03) * fs);
  const lenSec = opts.lenSec ?? Math.min(1.5, Math.max(0.25, 30 / f1Guess));
  const len = Math.min(Math.round(lenSec * fs), x.length - start);
  const nfft = nextPow2(len * 8);
  const sp = spectrum(x, fs, start, len, nfft);
  return partialsFromSpectrum(sp, f1Guess, opts);
}

export function partialsFromSpectrum(
  sp: Spectrum,
  f1Guess: number,
  opts: { maxPartials?: number; fMax?: number; Bguess?: number; floorDb?: number } = {},
): PartialAnalysis {
  const maxK = opts.maxPartials ?? 40;
  const fMax = Math.min(opts.fMax ?? 10000, sp.binHz * (sp.mag.length - 2));
  let B = opts.Bguess ?? 0;
  let f0 = f1Guess / Math.sqrt(1 + B);
  let mx = 0;
  for (let i = 1; i < sp.mag.length; i++) if (sp.mag[i] > mx) mx = sp.mag[i];
  const floor = mx * Math.pow(10, (opts.floorDb ?? -65) / 20);
  const found: Partial[] = [];
  for (let k = 1; k <= maxK; k++) {
    const pred = k * f0 * Math.sqrt(1 + B * k * k);
    if (pred > fMax) break;
    const halfWin = Math.min(0.22 * f0, 0.03 * pred + 0.08 * f0);
    const pk = peakIn(sp, pred - halfWin, pred + halfWin);
    if (pk && pk.mag > floor) {
      found.push({ k, f: pk.f, db: 20 * Math.log10(pk.mag + 1e-30) });
      if (found.length >= 3 && (k <= 6 || k % 3 === 0)) {
        const [nf0, nB] = fitStiffString(found);
        if (nf0 > 0 && nB < 0.2) {
          f0 = nf0;
          B = nB;
        }
      }
    }
  }
  // robust refit: drop outliers beyond 12 cents
  let ps = found.slice();
  for (let it = 0; it < 3 && ps.length >= 3; it++) {
    const [nf0, nB] = fitStiffString(ps);
    f0 = nf0;
    B = nB;
    const keep = ps.filter((p) => Math.abs(1200 * Math.log2(p.f / (p.k * f0 * Math.sqrt(1 + B * p.k * p.k)))) < 12);
    if (keep.length === ps.length) break;
    ps = keep;
  }
  let s = 0;
  for (const p of ps) {
    const c = 1200 * Math.log2(p.f / (p.k * f0 * Math.sqrt(1 + B * p.k * p.k)));
    s += c * c;
  }
  return {
    f0,
    B,
    f1: f0 * Math.sqrt(1 + B),
    partials: found,
    fitCents: ps.length ? Math.sqrt(s / ps.length) : 0,
  };
}

export interface Envelopes {
  /** frame times (s) relative to onset */
  t: Float64Array;
  /** dB per partial: env[p][frame] */
  env: Float64Array[];
  ks: number[];
  freqs: number[];
  /** broadband RMS envelope in dB per frame */
  rms: Float64Array;
}

/**
 * Per-partial amplitude envelopes via a short-time spectrum with peak picking
 * near each partial. Multiple channels are combined as power sums (robust to
 * microphone comb filtering).
 */
export function partialEnvelopes(
  chans: ArrayLike<number>[],
  fs: number,
  f0: number,
  B: number,
  ks: number[],
  opts: { hopSec?: number; durSec?: number } = {},
): Envelopes {
  const x0 = chans[0];
  const mono = new Float64Array(x0.length);
  for (const c of chans) for (let i = 0; i < mono.length; i++) mono[i] += c[i] / chans.length;
  const on = onsetIndex(mono);
  const hop = Math.round((opts.hopSec ?? 0.01) * fs);
  const winSec = Math.max(0.025, Math.min(0.2, 5 / f0));
  const win = Math.round(winSec * fs);
  const nfft = nextPow2(win * 2);
  const dur = Math.min(opts.durSec ?? 30, (x0.length - on - win) / fs);
  const nFrames = Math.max(1, Math.floor((dur * fs) / hop));
  const freqs = ks.map((k) => k * f0 * Math.sqrt(1 + B * k * k));
  const env = ks.map(() => new Float64Array(nFrames));
  const t = new Float64Array(nFrames);
  const rms = new Float64Array(nFrames);
  for (let fr = 0; fr < nFrames; fr++) {
    // window centred at onset + fr*hop (first frame starts at onset)
    const start = on + fr * hop - Math.floor(win / 4);
    t[fr] = (fr * hop) / fs;
    const pw = new Float64Array(ks.length);
    let e = 0;
    for (const c of chans) {
      const sp = spectrum(c, fs, Math.max(0, start), win, nfft, 'hann');
      for (let p = 0; p < ks.length; p++) {
        const f = freqs[p];
        const hw = Math.min(0.3 * f0, 0.02 * f + 0.1 * f0);
        const pk = peakIn(sp, f - hw, f + hw);
        const m = pk ? pk.mag : sp.mag[Math.round(f / sp.binHz)] ?? 0;
        pw[p] += m * m;
      }
      for (let i = 0; i < win; i++) {
        const v = c[Math.max(0, start) + i] ?? 0;
        e += v * v;
      }
    }
    for (let p = 0; p < ks.length; p++) env[p][fr] = 10 * Math.log10(pw[p] / chans.length + 1e-30);
    rms[fr] = 10 * Math.log10(e / (win * chans.length) + 1e-30);
  }
  return { t, env, ks, freqs, rms };
}

export interface DecayFit {
  /** dB/s of the early (prompt) segment, negative */
  early: number;
  /** dB/s of the late (aftersound) segment, negative */
  late: number;
  /** break time (s) between segments */
  knee: number;
  /** T60 from early and late slopes (s) */
  t60Early: number;
  t60Late: number;
  /** usable dynamic range of the fit (dB) */
  range: number;
  /** peak level (dB) */
  peak: number;
}

/**
 * Two-segment linear fit of a dB envelope (double decay, Weinreich 1977),
 * from the envelope peak down to `floorMargin` dB above the noise floor.
 */
export function fitDoubleDecay(t: Float64Array, db: Float64Array, opts: { floorDb?: number; floorMargin?: number; maxSec?: number } = {}): DecayFit | null {
  const n = db.length;
  if (n < 8) return null;
  let ip = 0;
  for (let i = 0; i < Math.min(n, Math.round(n / 4) + 30); i++) if (db[i] > db[ip]) ip = i;
  const peak = db[ip];
  // noise floor: median of the last 10% unless given
  let floor = opts.floorDb;
  if (floor === undefined) {
    const tail = Array.from(db.slice(Math.floor(n * 0.9))).sort((a, b) => a - b);
    floor = tail[Math.floor(tail.length / 2)] ?? -200;
  }
  const lim = floor + (opts.floorMargin ?? 8);
  const maxT = opts.maxSec ?? Infinity;
  // smooth lightly to tame beating, then find end of usable range
  const sm = new Float64Array(n);
  const r = 3;
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j++) {
      s += db[j];
      c++;
    }
    sm[i] = s / c;
  }
  let end = ip;
  for (let i = ip; i < n; i++) {
    if (t[i] - t[ip] > maxT) break;
    if (sm[i] > lim) end = i;
    else if (i - end > 20) break;
  }
  const i0 = ip + 1;
  if (end - i0 < 6) return null;
  const range = peak - sm[end];
  const line = (a: number, b: number): [number, number, number] => {
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    const m = b - a + 1;
    for (let i = a; i <= b; i++) {
      sx += t[i];
      sy += db[i];
      sxx += t[i] * t[i];
      sxy += t[i] * db[i];
    }
    const den = m * sxx - sx * sx;
    const slope = den === 0 ? 0 : (m * sxy - sx * sy) / den;
    const icpt = (sy - slope * sx) / m;
    let err = 0;
    for (let i = a; i <= b; i++) {
      const e = db[i] - (icpt + slope * t[i]);
      err += e * e;
    }
    return [slope, icpt, err];
  };
  const single = line(i0, end);
  let best = { err: single[2], knee: -1, s1: single[0], s2: single[0] };
  const minSeg = 4;
  for (let k = i0 + minSeg; k <= end - minSeg; k += 1) {
    const a = line(i0, k);
    const b = line(k, end);
    const err = a[2] + b[2];
    if (err < best.err * 0.999) best = { err, knee: k, s1: a[0], s2: b[0] };
  }
  const early = best.s1;
  const late = best.knee < 0 ? best.s1 : best.s2;
  const t60 = (s: number) => (s < -1e-6 ? -60 / s : Infinity);
  return {
    early,
    late,
    knee: best.knee < 0 ? t[end] - t[ip] : t[best.knee] - t[ip],
    t60Early: t60(early),
    t60Late: t60(late),
    range,
    peak,
  };
}

/** 10%–90% rise time of the broadband envelope (1 ms RMS), seconds. */
export function attackTime(x: ArrayLike<number>, fs: number): number {
  const w = Math.max(1, Math.round(0.001 * fs));
  const on = Math.max(0, onsetIndex(x, 0.02) - 2 * w);
  const n = Math.min(x.length - on, Math.round(0.3 * fs));
  const env = new Float64Array(Math.floor(n / w));
  for (let i = 0; i < env.length; i++) {
    let s = 0;
    for (let j = 0; j < w; j++) {
      const v = x[on + i * w + j];
      s += v * v;
    }
    env[i] = Math.sqrt(s / w);
  }
  let mx = 0;
  let im = 0;
  for (let i = 0; i < env.length; i++)
    if (env[i] > mx) {
      mx = env[i];
      im = i;
    }
  let a = 0;
  let b = im;
  for (let i = 0; i <= im; i++)
    if (env[i] >= 0.1 * mx) {
      a = i;
      break;
    }
  for (let i = 0; i <= im; i++)
    if (env[i] >= 0.9 * mx) {
      b = i;
      break;
    }
  return ((b - a) * w) / fs;
}

export interface SchroederDecay {
  /** T60 from the early decay (0 → −10 dB of the backward-integrated curve) */
  t60Early: number;
  /** T60 from −15 → −35 dB (or the deepest usable span below −15 dB) */
  t60Late: number;
  /** usable dynamic range above the noise floor, dB */
  range: number;
  /** time (s) at which the integrated curve reaches −10 dB */
  t10: number;
}

/**
 * Robust decay times from a partial's dB envelope by Schroeder backward
 * integration (ISO 3382 style EDT / T20), with the noise floor subtracted and
 * the integration truncated where the envelope meets the floor. Beating
 * between unison strings is averaged out by the integration.
 */
export function schroederDecay(t: Float64Array, db: Float64Array): SchroederDecay | null {
  const n = db.length;
  if (n < 10) return null;
  let ip = 0;
  for (let i = 0; i < Math.min(n, 60); i++) if (db[i] > db[ip]) ip = i;
  const tail = Array.from(db.slice(Math.floor(n * 0.88))).sort((a, b) => a - b);
  const floorDb = tail[Math.floor(tail.length / 2)] ?? -300;
  const floor = Math.pow(10, floorDb / 10);
  const e = new Float64Array(n);
  for (let i = 0; i < n; i++) e[i] = Math.max(0, Math.pow(10, db[i] / 10) - floor);
  // truncation: last index where the (smoothed) envelope is 6 dB above the floor
  let end = n - 1;
  const lim = floorDb + 6;
  for (let i = n - 1; i > ip; i--) {
    let s = 0;
    let c = 0;
    for (let j = Math.max(ip, i - 5); j <= Math.min(n - 1, i + 5); j++) {
      s += db[j];
      c++;
    }
    if (s / c > lim) {
      end = i;
      break;
    }
  }
  if (end - ip < 8) return null;
  const S = new Float64Array(end + 1);
  let acc = 0;
  for (let i = end; i >= ip; i--) {
    acc += e[i];
    S[i] = acc;
  }
  const s0 = S[ip];
  if (!(s0 > 0)) return null;
  const L = (i: number) => 10 * Math.log10(S[i] / s0 + 1e-300);
  const range = db[ip] - floorDb;
  const fitSpan = (hi: number, lo: number): number => {
    let sx = 0, sy = 0, sxx = 0, sxy = 0, c = 0;
    for (let i = ip; i <= end; i++) {
      const y = L(i);
      if (y > hi || y < lo) continue;
      const x = t[i];
      sx += x; sy += y; sxx += x * x; sxy += x * y; c++;
    }
    if (c < 4) return NaN;
    const slope = (c * sxy - sx * sy) / (c * sxx - sx * sx);
    return slope < -1e-6 ? -60 / slope : NaN;
  };
  let t10 = NaN;
  for (let i = ip; i <= end; i++) if (L(i) <= -10) { t10 = t[i] - t[ip]; break; }
  const usable = Math.min(range - 6, -L(end));
  const early = fitSpan(-0.5, -10);
  let late = NaN;
  if (usable >= 35) late = fitSpan(-15, -35);
  else if (usable >= 22) late = fitSpan(-12, -usable + 2);
  return { t60Early: early, t60Late: late, range, t10 };
}
