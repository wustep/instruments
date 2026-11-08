// Analysis of sustained (bowed / blown) tones, applied identically to reference
// recordings and model renders: note segmentation of chromatic-run recordings,
// pitch identification, steady-state harmonic profile, even/odd balance,
// harmonic-to-noise ratio, third-octave long-term spectrum, centroid, attack
// time, vibrato rate/depth.

import { spectrum, type Spectrum } from './fft.ts';
import { THIRD_OCT } from './note.ts';

export interface Segment {
  start: number;
  end: number;
}

export interface SustainedAnalysis {
  midi: number;
  /** median fundamental over the steady part, Hz */
  f0: number;
  /** f0 relative to equal temperament (A4 = 440), cents */
  cents: number;
  durSec: number;
  /** harmonic band levels (dB re full scale) k = 1..K, median over steady frames */
  harmAbs: number[];
  /** harmonic levels relative to the strongest harmonic, dB */
  harm: number[];
  /** 10·log10(Σ even / Σ odd harmonic power), k ≤ 10 */
  evenOddDb: number;
  /** harmonic power (±0.15 f0 around k·f0) over inter-harmonic power, k ≤ 8, dB */
  hnrDb: number;
  /** spectral centroid of the steady part, Hz */
  centroid: number;
  /** third-octave levels of the steady part (dB, power average), centres THIRD_OCT */
  ltas: number[];
  /** steady-part RMS level, dB re full scale */
  rmsDb: number;
  /** 10 → 90 % rise of the amplitude envelope towards the steady level, ms */
  attackMs: number;
  /** vibrato rate (Hz) and depth (cents, peak) of the f0 track; 0 if none */
  vibRate: number;
  vibDepth: number;
}

const nextPow2 = (n: number) => {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
};
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const db = (p: number) => 10 * Math.log10(p + 1e-30);
const median = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

/** RMS envelope in dB re full scale, hop `hopSec`, window 2·hop. */
export function envelopeDb(x: ArrayLike<number>, fs: number, hopSec = 0.01): Float64Array {
  const hop = Math.max(1, Math.round(hopSec * fs));
  const n = Math.floor(x.length / hop);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let e = 0;
    const a = Math.max(0, i * hop - (hop >> 1));
    const b = Math.min(x.length, a + 2 * hop);
    for (let j = a; j < b; j++) e += x[j] * x[j];
    out[i] = db(e / Math.max(1, b - a));
  }
  return out;
}

/** Noise floor (dB) of a recording: 5th percentile of the 10 ms envelope. */
export function noiseFloorDb(x: ArrayLike<number>, fs: number): number {
  const env = Array.from(envelopeDb(x, fs)).sort((a, b) => a - b);
  return env[Math.floor(env.length * 0.05)] ?? -120;
}

/**
 * Split a recording of separated notes into note segments: envelope gate at
 * max(floor + 12 dB, peak − 40 dB), gaps < 120 ms merged, segments ≥ 0.35 s kept.
 * Starts are moved back to where the envelope first rises 6 dB above the floor.
 */
export function segmentNotes(x: ArrayLike<number>, fs: number, opts: { minSec?: number; rangeDb?: number } = {}): Segment[] {
  const hop = Math.round(0.01 * fs);
  const env = envelopeDb(x, fs, 0.01);
  let peak = -200;
  for (const v of env) peak = Math.max(peak, v);
  const floor = noiseFloorDb(x, fs);
  const thr = Math.max(floor + 12, peak - (opts.rangeDb ?? 40));
  const segs: [number, number][] = [];
  let s = -1;
  for (let i = 0; i <= env.length; i++) {
    const on = i < env.length && env[i] > thr;
    if (on && s < 0) s = i;
    if (!on && s >= 0) {
      segs.push([s, i]);
      s = -1;
    }
  }
  const merged: [number, number][] = [];
  for (const g of segs) {
    const last = merged[merged.length - 1];
    if (last && g[0] - last[1] < 12) last[1] = g[1];
    else merged.push([g[0], g[1]]);
  }
  const minFrames = Math.round((opts.minSec ?? 0.35) / 0.01);
  const out: Segment[] = [];
  for (const [a0, b] of merged) {
    if (b - a0 < minFrames) continue;
    let a = a0;
    while (a > 0 && env[a - 1] > floor + 6 && (out.length === 0 || a - 1 > out[out.length - 1].end / hop)) a--;
    out.push({ start: a * hop, end: Math.min(x.length, b * hop) });
  }
  return out;
}

function powerSpectrum(x: ArrayLike<number>, fs: number, start: number, len: number, nfft: number): Spectrum {
  return spectrum(x, fs, start, len, nfft, 'hann');
}

function bandPower(sp: Spectrum, fLo: number, fHi: number): number {
  const lo = Math.max(1, Math.ceil(fLo / sp.binHz));
  const hi = Math.min(sp.mag.length - 1, Math.floor(fHi / sp.binHz));
  let s = 0;
  for (let i = lo; i <= hi; i++) s += sp.mag[i] * sp.mag[i];
  return s;
}

/** Hann window of length L zero-padded to nfft: a band sum of |X|² times this is mean-square power. */
const hannNorm = (L: number, nfft: number) => L / (3 * nfft);

/** Pitch of a segment: equal-tempered note in [lo, hi] with the largest harmonic sum. */
export function identifyNote(x: ArrayLike<number>, fs: number, seg: Segment, lo: number, hi: number): { midi: number; score: number } {
  const len = Math.min(seg.end - seg.start, Math.round(0.5 * fs));
  const mid = Math.round((seg.start + seg.end) / 2 - len / 2);
  const sp = powerSpectrum(x, fs, mid, len, nextPow2(len) * 2);
  let best = lo;
  let bestS = -Infinity;
  for (let m = lo; m <= hi; m++) {
    const f = et(m);
    let sc = 0;
    for (let k = 1; k <= 6; k++) {
      const fk = k * f;
      if (fk > 0.45 * fs) break;
      sc += Math.sqrt(bandPower(sp, fk * Math.pow(2, -0.6 / 12), fk * Math.pow(2, 0.6 / 12)));
    }
    if (sc > bestS) {
      bestS = sc;
      best = m;
    }
  }
  return { midi: best, score: bestS };
}

/** Frame-wise f0 near `f0g` (Hz) from the strongest of harmonics 1..4, parabolic peak. */
function frameF0(sp: Spectrum, f0g: number): number {
  let bestK = 1;
  let bestP = -1;
  for (let k = 1; k <= 4; k++) {
    const p = bandPower(sp, k * f0g * 0.95, k * f0g * 1.05);
    if (p > bestP) {
      bestP = p;
      bestK = k;
    }
  }
  const lo = Math.max(1, Math.floor((bestK * f0g * 0.95) / sp.binHz));
  const hi = Math.min(sp.mag.length - 2, Math.ceil((bestK * f0g * 1.05) / sp.binHz));
  let bi = lo;
  for (let i = lo; i <= hi; i++) if (sp.mag[i] > sp.mag[bi]) bi = i;
  const a = Math.log(sp.mag[bi - 1] + 1e-30);
  const b = Math.log(sp.mag[bi] + 1e-30);
  const c = Math.log(sp.mag[bi + 1] + 1e-30);
  const den = a - 2 * b + c;
  const p = den === 0 ? 0 : (0.5 * (a - c)) / den;
  return ((bi + p) * sp.binHz) / bestK;
}

/**
 * Steady-state analysis of one sustained note in x[seg.start, seg.end).
 * The steady part skips the first 25 % (≥ 0.15 s) and the last 15 % (≥ 0.1 s).
 */
export function analyzeSustained(x: ArrayLike<number>, fs: number, seg: Segment, midi: number, opts: { K?: number } = {}): SustainedAnalysis {
  const K = opts.K ?? 16;
  const dur = seg.end - seg.start;
  const s0 = seg.start + Math.max(Math.round(0.15 * fs), Math.round(0.25 * dur));
  const s1 = seg.end - Math.max(Math.round(0.1 * fs), Math.round(0.15 * dur));
  const f0g = et(midi);
  // analysis frames: ≥ 8 periods, ≥ 46 ms
  const L = nextPow2(Math.max(2048 * (fs / 44100), (8 * fs) / f0g));
  const hop = L >> 1;
  const nfft = L * 4;
  const norm = hannNorm(L, nfft);
  const harmP: number[][] = Array.from({ length: K }, () => []);
  const f0s: number[] = [];
  const hnr: number[] = [];
  const welch = new Float64Array(nfft / 2 + 1);
  let nW = 0;
  for (let p = s0; p + L <= Math.max(s1, s0 + L); p += hop) {
    if (p + L > x.length) break;
    const sp = powerSpectrum(x, fs, p, L, nfft);
    const f0 = frameF0(sp, f0g);
    if (!Number.isFinite(f0) || Math.abs(1200 * Math.log2(f0 / f0g)) > 80) continue;
    f0s.push(f0);
    let hp = 0;
    let np = 0;
    for (let k = 1; k <= K; k++) {
      const fk = k * f0;
      if (fk + 0.5 * f0 > 0.47 * fs) {
        harmP[k - 1].push(NaN);
        continue;
      }
      harmP[k - 1].push(norm * bandPower(sp, fk - 0.45 * f0, fk + 0.45 * f0));
      if (k <= 8) {
        hp += bandPower(sp, fk - 0.15 * f0, fk + 0.15 * f0);
        np += bandPower(sp, fk + 0.3 * f0, fk + 0.7 * f0);
      }
    }
    hnr.push(db(hp) - db(np));
    for (let i = 0; i < welch.length; i++) welch[i] += sp.mag[i] * sp.mag[i];
    nW++;
  }
  const harmAbs = harmP.map((ps) => db(median(ps.filter(Number.isFinite))));
  const top = Math.max(...harmAbs.filter(Number.isFinite));
  const harm = harmAbs.map((v) => (Number.isFinite(v) ? v - top : NaN));
  let ev = 0;
  let od = 0;
  for (let k = 1; k <= Math.min(10, K); k++) {
    const p = Math.pow(10, harmAbs[k - 1] / 10);
    if (!Number.isFinite(p)) continue;
    if (k % 2 === 0) ev += p;
    else od += p;
  }
  // long-term spectrum and centroid of the steady part
  const binHz = fs / nfft;
  let num = 0;
  let den = 0;
  for (let i = 1; i < welch.length; i++) {
    num += i * binHz * welch[i];
    den += welch[i];
  }
  const scale = norm / Math.max(1, nW);
  const ltas = THIRD_OCT.map((fc) => {
    const lo = Math.ceil(fc / Math.pow(2, 1 / 6) / binHz);
    const hi = Math.min(welch.length - 1, Math.floor((fc * Math.pow(2, 1 / 6)) / binHz));
    let s = 0;
    for (let i = lo; i <= hi; i++) s += welch[i];
    return db(s * scale);
  });
  // steady RMS
  let e = 0;
  for (let i = s0; i < Math.max(s1, s0 + 1); i++) e += x[i] * x[i];
  const rmsDb = db(e / Math.max(1, s1 - s0));
  // attack: amplitude envelope (5 ms) from segment start to 10 % / 90 % of steady
  const envHop = Math.round(0.005 * fs);
  const steadyAmp = Math.pow(10, rmsDb / 20);
  let t10 = -1;
  let t90 = -1;
  for (let p = seg.start; p < s1; p += envHop) {
    let a = 0;
    for (let j = p; j < p + 2 * envHop && j < x.length; j++) a += x[j] * x[j];
    const amp = Math.sqrt(a / (2 * envHop));
    if (t10 < 0 && amp >= 0.1 * steadyAmp) t10 = p;
    if (t10 >= 0 && amp >= 0.9 * steadyAmp) {
      t90 = p;
      break;
    }
  }
  const attackMs = t10 >= 0 && t90 >= 0 ? ((t90 - t10) / fs) * 1000 : NaN;
  // vibrato from a finer f0 track (hop ~ 10 ms)
  const vib = vibratoOf(x, fs, s0, s1, f0g);
  // round 3: with vibrato, the pitch is the centre of the fine track (see vibratoOf)
  const f0 = vib.rate > 0 && Number.isFinite(vib.center) ? f0g * Math.pow(2, vib.center / 1200) : median(f0s);
  return {
    midi,
    f0,
    cents: 1200 * Math.log2(f0 / f0g),
    durSec: dur / fs,
    harmAbs,
    harm,
    evenOddDb: db(ev) - db(od),
    hnrDb: median(hnr),
    centroid: den > 0 ? num / den : 0,
    ltas,
    rmsDb,
    attackMs,
    vibRate: vib.rate,
    vibDepth: vib.depth,
  };
}

function vibratoOf(x: ArrayLike<number>, fs: number, s0: number, s1: number, f0g: number): { rate: number; depth: number; center: number } {
  const L = nextPow2(Math.max(1024 * (fs / 44100), (4 * fs) / f0g));
  const hopS = 0.01;
  const hop = Math.round(hopS * fs);
  const c: number[] = [];
  for (let p = s0; p + L <= s1 && p + L <= x.length; p += hop) {
    const sp = powerSpectrum(x, fs, p, L, L * 8);
    const f = frameF0(sp, f0g);
    c.push(Number.isFinite(f) ? 1200 * Math.log2(f / f0g) : NaN);
  }
  if (c.length < 60) return { rate: 0, depth: 0, center: NaN };
  // centre of the pitch track (mean, cents): with vibrato, the median of long-frame
  // spectral peaks is pulled toward whichever side of the swing is louder
  // (trimmed: the outer 10 % each side, e.g. a bow change, are left out)
  const fin = c.filter(Number.isFinite).sort((a, b) => a - b);
  const core = fin.slice(Math.floor(fin.length * 0.1), Math.ceil(fin.length * 0.9));
  const center = core.length ? core.reduce((a, b) => a + b, 0) / core.length : NaN;
  // detrend with a 0.5 s moving average, then the strongest component in 3–9 Hz
  const w = Math.round(0.25 / hopS);
  const d: number[] = [];
  for (let i = 0; i < c.length; i++) {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(c.length - 1, i + w); j++) if (Number.isFinite(c[j])) {
      s += c[j];
      n++;
    }
    d.push(Number.isFinite(c[i]) && n ? c[i] - s / n : 0);
  }
  let bestR = 0;
  let bestA = 0;
  for (let r = 3; r <= 9.001; r += 0.05) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < d.length; i++) {
      re += d[i] * Math.cos(2 * Math.PI * r * i * hopS);
      im += d[i] * Math.sin(2 * Math.PI * r * i * hopS);
    }
    const a = (2 * Math.hypot(re, im)) / d.length;
    if (a > bestA) {
      bestA = a;
      bestR = r;
    }
  }
  // a component below ~3 cents is measurement jitter, not vibrato
  return bestA < 3 ? { rate: 0, depth: bestA, center } : { rate: bestR, depth: bestA, center };
}
