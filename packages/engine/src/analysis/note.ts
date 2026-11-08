// One analysis applied identically to reference recordings and model renders.

import { peakIn, spectrum } from './fft.ts';
import {
  attackTime,
  schroederDecay,
  onsetIndex,
  partialEnvelopes,
  partialsFromSpectrum,
  type Partial,
} from './partials.ts';

export interface PartialDecay {
  k: number;
  f: number;
  t60Early: number;
  t60Late: number;
  knee: number;
  range: number;
}

export interface NoteAnalysis {
  midi: number;
  fs: number;
  f0: number;
  B: number;
  f1: number;
  fitCents: number;
  partials: Partial[];
  decays: PartialDecay[];
  /** partial levels (dB re full scale) around 60–160 ms after onset */
  levels: { k: number; db: number }[];
  peakDb: number;
  /** RMS over the first 0.5 s, dB */
  rmsDb: number;
  attackMs: number;
  /** spectral centroid (Hz) of the first 250 ms */
  centroid: number;
  /** third-octave band levels (dB) over the first second, centres in THIRD_OCT */
  ltas: number[];
  /** third-octave levels of the last 1.5 s (noise floor estimate for reference recordings) */
  floor: number[];
}

export const THIRD_OCT = [31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000];

const nextPow2 = (n: number) => {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
};

export function analyzeNote(
  chans: Float32Array[],
  fs: number,
  midi: number,
  opts: { f1Guess?: number; Bguess?: number; decayPartials?: number; maxDur?: number } = {},
): NoteAnalysis {
  const n = chans[0].length;
  const mono = new Float32Array(n);
  for (const c of chans) for (let i = 0; i < n; i++) mono[i] += c[i] / chans.length;
  const on = onsetIndex(mono);
  const f1g = opts.f1Guess ?? 440 * Math.pow(2, (midi - 69) / 12);

  // partial frequencies from a long window; channels combined as power
  const start = on + Math.round(0.03 * fs);
  const lenSec = Math.min(2, Math.max(0.3, 40 / f1g));
  const len = Math.min(Math.round(lenSec * fs), n - start);
  const nfft = nextPow2(len * 8);
  const sps = chans.map((c) => spectrum(c, fs, start, len, nfft));
  const comb = { ...sps[0], mag: new Float64Array(sps[0].mag.length) };
  for (const sp of sps) for (let i = 0; i < comb.mag.length; i++) comb.mag[i] += sp.mag[i] * sp.mag[i];
  for (let i = 0; i < comb.mag.length; i++) comb.mag[i] = Math.sqrt(comb.mag[i] / sps.length);
  const pa = partialsFromSpectrum(comb, f1g, { Bguess: opts.Bguess, maxPartials: 60, fMax: Math.min(9000, 0.45 * fs) });

  // partial envelopes + double-decay fits
  const K = Math.min(opts.decayPartials ?? 8, Math.max(1, pa.partials.length));
  const ks: number[] = [];
  for (let k = 1; ks.length < K && k <= 60; k++) {
    const fk = k * pa.f0 * Math.sqrt(1 + pa.B * k * k);
    if (fk > 0.42 * fs || fk > 8000) break;
    ks.push(k);
  }
  const dur = Math.min(opts.maxDur ?? 30, (n - on) / fs - 0.3);
  const hop = Math.max(0.01, dur / 700);
  const env = partialEnvelopes(chans, fs, pa.f0, pa.B, ks, { hopSec: hop, durSec: dur });
  const decays: PartialDecay[] = [];
  ks.forEach((k, i) => {
    const fit = schroederDecay(env.t, env.env[i]);
    if (fit && fit.range > 15) {
      decays.push({ k, f: env.freqs[i], t60Early: fit.t60Early, t60Late: fit.t60Late, knee: fit.t10, range: fit.range });
    }
  });

  // partial levels at ~60–160 ms (short window, per channel power)
  const lvStart = on + Math.round(0.06 * fs);
  const lvLen = Math.min(Math.round(Math.max(0.1, 4 / f1g) * fs), n - lvStart);
  const lvN = nextPow2(lvLen * 4);
  const lsp = chans.map((c) => spectrum(c, fs, lvStart, lvLen, lvN, 'hann'));
  const levels: { k: number; db: number }[] = [];
  for (let k = 1; k <= 40; k++) {
    const fk = k * pa.f0 * Math.sqrt(1 + pa.B * k * k);
    if (fk > Math.min(10000, 0.45 * fs)) break;
    let p = 0;
    for (const sp of lsp) {
      const pk = peakIn(sp, fk - 0.25 * pa.f0, fk + 0.25 * pa.f0);
      const m = pk ? pk.mag : 0;
      p += m * m;
    }
    levels.push({ k, db: 10 * Math.log10(p / lsp.length + 1e-30) });
  }

  // broadband
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(mono[i]));
  let e = 0;
  const rmsN = Math.min(n - on, Math.round(0.5 * fs));
  for (const c of chans) for (let i = on; i < on + rmsN; i++) e += c[i] * c[i];
  const rmsDb = 10 * Math.log10(e / (rmsN * chans.length) + 1e-30);
  const cN = Math.min(n - on, Math.round(0.25 * fs));
  const csp = chans.map((c) => spectrum(c, fs, on, cN, nextPow2(cN), 'hann'));
  let num = 0;
  let den = 0;
  for (const sp of csp)
    for (let i = 1; i < sp.mag.length; i++) {
      const p = sp.mag[i] * sp.mag[i];
      num += i * sp.binHz * p;
      den += p;
    }
  const bandsOf = (start: number, len: number) => {
    const tsp = chans.map((c) => spectrum(c, fs, start, len, nextPow2(len), 'hann'));
    return THIRD_OCT.map((fc) => {
      const lo = fc / Math.pow(2, 1 / 6);
      const hi = fc * Math.pow(2, 1 / 6);
      let s = 0;
      for (const sp of tsp) for (let i = Math.ceil(lo / sp.binHz); i <= Math.min(sp.mag.length - 1, Math.floor(hi / sp.binHz)); i++) s += sp.mag[i] * sp.mag[i];
      return 10 * Math.log10(s / tsp.length + 1e-30);
    });
  };
  const tN = Math.min(n - on, fs);
  const ltas = bandsOf(on, tN);
  const fN = Math.min(Math.round(1.5 * fs), Math.max(1024, n - on - tN));
  const floor = bandsOf(n - fN, fN);

  return {
    midi,
    fs,
    f0: pa.f0,
    B: pa.B,
    f1: pa.f1,
    fitCents: pa.fitCents,
    partials: pa.partials,
    decays,
    levels,
    peakDb: 20 * Math.log10(pk + 1e-30),
    rmsDb,
    attackMs: attackTime(mono, fs) * 1000,
    centroid: den > 0 ? num / den : 0,
    ltas,
    floor,
  };
}
