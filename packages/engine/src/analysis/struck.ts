// Analysis of a struck, freely decaying drum note (the timpani), applied identically to the reference
// recordings and to the model's renders: the onset, the principal tone (the (1,1) mode) and the partials of
// the kettledrum's near-harmonic series above it ((2,1), (3,1), (4,1), (5,1): about 1.5, 2, 2.4, 2.9 times),
// their levels and decay rates, how long the stroke rings, its brightness at the stroke, the stroke's attack
// against what follows, the level, the third-octave spectrum of the first second, and the principal tone's
// glide (a loud stroke starts sharp).

import { spectrum, type Spectrum } from './fft.ts';
import { THIRD_OCT } from './note.ts';

export interface StruckAnalysis {
  /** the onset (s into the signal) */
  onset: number;
  /** the principal tone, (1,1) (Hz), over 0.05–0.8 s after the onset */
  f11: number;
  /** the partials' frequencies over f11, near 1.5, 1.95, 2.4, 2.9 (NaN: none found) */
  ratios: number[];
  /** their levels re the principal tone (dB), over 0.05–0.55 s */
  levels: number[];
  /** decay rates (dB/s) of the principal tone and of the (2,1), from 0.2 s while above the floor */
  decay11: number;
  decay21: number;
  /** seconds from the stroke's peak until its level (10 ms RMS) has fallen 30 dB */
  ring: number;
  /** spectral centroid of the first 0.3 s (Hz, 30 Hz–8 kHz) */
  centroid: number;
  /** the first 30 ms over the next 270 ms (dB) */
  attack: number;
  /** RMS level of the first 0.5 s (dB re full scale) */
  level: number;
  /** third-octave levels of the first second (dB re the loudest band), THIRD_OCT centres */
  bands: number[];
  /** the principal tone early (0.03–0.2 s) over late (0.6–1.2 s), cents */
  glide: number;
}

/** the kettledrum's partials over its principal tone (Rossing 1982: 1.50, 1.98, 2.44, 2.89), searched ±6 % */
export const TIMP_RATIOS = [1.5, 1.95, 2.42, 2.88];

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

/** a partial's level (dB) frame by frame (Hann, 8192 at 44.1 kHz scaled to the rate; hop a quarter) */
function track(x: ArrayLike<number>, fs: number, on: number, f: number, from: number, to: number): { t: number[]; l: number[] } {
  const N = Math.round((8192 * fs) / 44100);
  const hop = N >> 2;
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  const t: number[] = [];
  const l: number[] = [];
  const om = (2 * Math.PI * f) / fs;
  for (let s = on + Math.round(from * fs); s + N <= Math.min(x.length, on + Math.round(to * fs)); s += hop) {
    // the DFT at f exactly (and ±0.4 bins, the largest: a slightly mistuned partial), by a rotating phasor
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
    l.push(db(best));
  }
  return { t, l };
}

/** least-squares slope of y on x, over the points while y stays above `floor` */
function slope(t: number[], l: number[], floor: number): number {
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

/** Analyse one stroke: `x` mono, `guess` the principal tone to look for (Hz, ±7 %). */
export function analyzeStruck(x: ArrayLike<number>, fs: number, guess: number): StruckAnalysis {
  let pk = 0;
  let pi = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > pk) {
      pk = a;
      pi = i;
    }
  }
  // the onset: where the signal first reaches 5 % of its peak, less 2 ms
  let on = pi;
  for (let i = 0; i < pi; i++)
    if (Math.abs(x[i]) > 0.05 * pk) {
      on = i;
      break;
    }
  on = Math.max(0, on - Math.round(0.002 * fs));
  const N = 32768 * Math.max(1, Math.round(fs / 44100));
  const sp = spectrum(x, fs, on + Math.round(0.05 * fs), Math.min(N, Math.round(0.75 * fs)), N, 'hann');
  const p11 = peakNear(sp, guess, 0.07);
  const f11 = p11?.f ?? guess;
  const m11 = p11?.mag ?? 1e-12;
  const sp2 = spectrum(x, fs, on + Math.round(0.05 * fs), Math.round(0.5 * fs), N, 'hann');
  const q11 = peakNear(sp2, f11, 0.02)?.mag ?? m11;
  const ratios: number[] = [];
  const levels: number[] = [];
  for (const r of TIMP_RATIOS) {
    const p = peakNear(sp, f11 * r, 0.06);
    ratios.push(p ? p.f / f11 : NaN);
    const q = p ? peakNear(sp2, p.f, 0.01) : null;
    levels.push(q ? 20 * Math.log10(q.mag / q11) : NaN);
  }
  // the noise floor: the quietest 10 ms frames of the last second (or of the tail)
  const env: number[] = [];
  const hop = Math.round(0.01 * fs);
  for (let s = on; s + hop <= x.length; s += hop) env.push(rmsDb(x, s, s + hop));
  const tail = env.slice(Math.max(0, env.length - 100)).sort((a, b) => a - b);
  const floorDb = tail[Math.floor(tail.length * 0.2)] ?? -120;
  // decays: the partial's own track, while 12 dB above the floor's level in the same bandwidth
  const tr11 = track(x, fs, on, f11, 0.2, 2.2);
  const top11 = Math.max(...tr11.l);
  const decay11 = slope(tr11.t, tr11.l, Math.max(top11 - 45, floorDb + 12 + 10 * Math.log10(8192 / 4)));
  const f21 = Number.isFinite(ratios[0]) ? f11 * ratios[0] : f11 * 1.5;
  const tr21 = track(x, fs, on, f21, 0.2, 1.6);
  const top21 = Math.max(...tr21.l);
  const decay21 = slope(tr21.t, tr21.l, Math.max(top21 - 40, floorDb + 12 + 10 * Math.log10(8192 / 4)));
  // how long it rings: from the envelope's peak to 30 dB under it
  let ep = 0;
  for (let i = 1; i < env.length; i++) if (env[i] > env[ep]) ep = i;
  let ring = NaN;
  for (let i = ep; i < env.length; i++)
    if (env[i] < env[ep] - 30) {
      ring = (i - ep) * 0.01;
      break;
    }
  // brightness at the stroke
  const nb = 16384 * Math.max(1, Math.round(fs / 44100));
  const spc = spectrum(x, fs, on, Math.round(0.3 * fs), nb, 'hann');
  let sw = 0;
  let s = 0;
  for (let b = 1; b < spc.mag.length; b++) {
    const f = b * spc.binHz;
    if (f < 30 || f > 8000) continue;
    const p = spc.mag[b] * spc.mag[b];
    sw += p * f;
    s += p;
  }
  const centroid = s > 0 ? sw / s : NaN;
  const attack = rmsDb(x, on, on + Math.round(0.03 * fs)) - rmsDb(x, on + Math.round(0.03 * fs), on + Math.round(0.3 * fs));
  const level = rmsDb(x, on, on + Math.round(0.5 * fs));
  // third-octave levels of the first second
  const nf = 65536 * Math.max(1, Math.round(fs / 44100));
  const spb = spectrum(x, fs, on, Math.round(1.0 * fs), nf, 'hann');
  const bands = THIRD_OCT.map((c) => {
    const lo = c / Math.pow(2, 1 / 6);
    const hi = c * Math.pow(2, 1 / 6);
    let e = 0;
    for (let b = Math.max(1, Math.floor(lo / spb.binHz)); b <= Math.min(spb.mag.length - 1, Math.ceil(hi / spb.binHz)); b++) e += spb.mag[b] * spb.mag[b];
    return db(e);
  });
  const bmax = Math.max(...bands);
  for (let i = 0; i < bands.length; i++) bands[i] -= bmax;
  // the glide: the principal tone early against late
  const ne = 8192 * Math.max(1, Math.round(fs / 44100));
  const early = peakNear(spectrum(x, fs, on + Math.round(0.03 * fs), Math.round(0.17 * fs), ne * 4, 'hann'), f11, 0.03);
  const late = peakNear(spectrum(x, fs, on + Math.round(0.6 * fs), Math.round(0.6 * fs), ne * 4, 'hann'), f11, 0.03);
  const glide = early && late ? 1200 * Math.log2(early.f / late.f) : NaN;
  return { onset: on / fs, f11, ratios, levels, decay11, decay21, ring, centroid, attack, level, bands, glide };
}
