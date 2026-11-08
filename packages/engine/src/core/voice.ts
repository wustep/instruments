// One key's strings: 1–3 digital waveguides (Smith 1992) sharing a felt hammer
// and a bridge junction. Each string is a single circular buffer holding the
// round trip; the agraffe inversion is applied at the bridge read, loop filters
// (Thiran fractional delay, dispersion allpass cascade, one-pole loss) are
// lumped at the bridge. The hammer, preparations and damper noise act at taps
// inside the buffer.
//
// Processing is split in passes so the global bridge/soundboard junction can be
// solved sample-by-sample while strings run in tight per-string loops:
//   prePass   — hammer / preparation / noise at interior taps (per sample, all strings)
//   readPass  — bridge-incoming waves through loop filters -> vin, S = Σ Z vin
//   (core)    — junction + soundboard solve -> bridge velocity vb
//   writePass — reflected wave vb - vin written into the buffer
// Valid as long as the block is shorter than every tap distance from the bridge.

import { type KeySpec } from './design.ts';
import {
  type Dispersion2,
  type LossDesign,
  cascadeLag,
  designDispersion2,
  designLossFilter,
  onePolePhaseDelay,
  thiranForPhaseDelay,
} from './filters.ts';
import { LN1000, clamp, mulberry32, nextPow2 } from './util.ts';

export const BK_MAX = 32;
const MAX_DISP = 64;

/** Bridge admittance seen by a key at angular frequency w (rad/sample): [re, im] in s/kg. */
export type BridgeMobility = (w: number, zoneW: readonly number[]) => [number, number];

/** Loss-filter designs (undamped, damped) for one string from the key's decay targets. */
export function designStringLoss(spec: KeySpec, f0: number, f1: number, B: number, fs: number): { lu: LossDesign; ld: LossDesign } {
  const sigL = LN1000 / spec.t60Low;
  const sigH = LN1000 / spec.t60High;
  const fH = spec.t60HighHz;
  const c = fH > 1.5 * f1 ? Math.max(0, (sigH - sigL) / (fH * fH - f1 * f1)) : (0.6 * sigL) / (f1 * f1);
  const dSigL = LN1000 / spec.damperLow;
  const dSigH = LN1000 / spec.damperHigh;
  const dF = 2000;
  const dc = dF > 1.5 * f1 ? Math.max(0, (dSigH - dSigL) / (dF * dF - f1 * f1)) : 0;
  const freqs: number[] = [];
  const t60u: number[] = [];
  const t60d: number[] = [];
  const loop: number[] = [];
  for (let k = 1; k <= 40; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > Math.min(0.45 * fs, 12000, Math.max(fH, 2.5 * f1))) break;
    freqs.push(fk);
    const df2 = Math.max(0, fk * fk - f1 * f1);
    const su = sigL + c * df2;
    const sd = su + (spec.hasDamper ? dSigL + dc * df2 : 0);
    t60u.push(LN1000 / su);
    t60d.push(LN1000 / sd);
    loop.push((k * fs) / fk);
  }
  if (freqs.length === 0) {
    freqs.push(f1);
    t60u.push(spec.t60Low);
    t60d.push(spec.damperLow);
    loop.push(fs / f1);
  }
  const lu = designLossFilter(freqs, t60u, loop, fs);
  const ld = spec.hasDamper ? designLossFilter(freqs, t60d, loop, fs) : lu;
  return { lu, ld };
}

/** Loss coefficient of the nominal (undetuned) string, rounded — the dispersion design input. */
export function nominalLossCoeff(spec: KeySpec, fs: number): number {
  return Math.round(designStringLoss(spec, spec.f0, spec.f1, spec.B, fs).lu.a * 1000) / 1000;
}

export interface DesignEntry {
  key: string;
  d: Dispersion2;
}

/** Dispersion designs are shared by all strings of a key; cache them across rebuilds. */
export class DispersionCache {
  private map = new Map<string, Dispersion2>();
  static keyOf(spec: KeySpec, fs: number, light: boolean, lossA: number): string {
    return `${spec.midi}|${spec.B.toPrecision(7)}|${fs}|${light ? 1 : 0}|${lossA.toFixed(3)}`;
  }
  has(key: string): boolean {
    return this.map.has(key);
  }
  put(entries: DesignEntry[]): void {
    for (const e of entries) this.map.set(e.key, e.d);
    // bound memory: keep the most recent ~600 designs
    if (this.map.size > 600) {
      const drop = this.map.size - 600;
      let i = 0;
      for (const k of this.map.keys()) {
        if (i++ >= drop) break;
        this.map.delete(k);
      }
    }
  }
  get(spec: KeySpec, fs: number, light: boolean, lossA: number): Dispersion2 {
    const key = DispersionCache.keyOf(spec, fs, light, lossA);
    let d = this.map.get(key);
    if (!d) {
      const m = spec.midi;
      const fMax = light ? 1300 : m < 33 ? 3000 : m < 45 ? 4000 : 5000;
      d = designDispersion2(spec.f0, spec.B, fs, {
        fMax,
        kMax: light ? 14 : 120,
        maxSections: light ? 6 : MAX_DISP,
        tolCents: light ? 1.5 : 0.3,
        extraDelay: (w) => onePolePhaseDelay(lossA, w),
      });
      this.map.set(key, d);
    }
    return d;
  }
}
const HAMMER_GAP = 0.0004; // m between felt and string at launch
const HAMMER_REC = 1024; // samples of force history kept for visualisation

export interface StrikeRecord {
  midi: number;
  velocity: number;
  /** hammer velocity, m/s */
  vHammer: number;
  /** sample rate of `force` */
  fs: number;
  force: Float32Array;
  /** felt compression, m */
  compression: Float32Array;
  peak: number;
  /** contact duration, s */
  duration: number;
  serial: number;
}

let strikeSerial = 0;

export class Voice {
  readonly midi: number;
  readonly light: boolean;
  spec!: KeySpec;
  fs = 48000;
  /** total waveguides: nV vertical (struck) + optional horizontal twins */
  n = 0;
  /** vertically polarised (hammer-struck) strings; indices [0, nV) */
  nV = 0;
  /** bridge coupling ratio per waveguide (1 vertical, κ horizontal) and c·Z */
  cpl = new Float64Array(6);
  cZ = new Float64Array(6);
  /** hammer force fraction reaching the horizontal polarisation */
  polExcite = 0;

  bufs: Float64Array[] = [];
  masks = new Int32Array(6);
  N = new Int32Array(6);
  leftLen = new Int32Array(6);
  hPos = new Int32Array(6);
  tapL = new Int32Array(6);
  tapR = new Int32Array(6);
  Z = new Float64Array(6);
  h2Z = new Float64Array(6);
  hT4Z = new Float64Array(6);

  thA = new Float64Array(6);
  thX = new Float64Array(6);
  thY = new Float64Array(6);
  /** biquad allpass sections per string, coefficients [a1,a2]* and states [s1,s2]* */
  dispS = new Int32Array(6);
  dispC: Float64Array[] = [];
  dispState: Float64Array[] = [];
  /** tuning compensation for bridge reactance at partial 1 (samples of delay) */
  bridgeComp = new Float64Array(6);
  lossB0 = new Float64Array(6);
  lossA1 = new Float64Array(6);
  lossY = new Float64Array(6);
  lgU = new Float64Array(6);
  aU = new Float64Array(6);
  lgD = new Float64Array(6);
  aD = new Float64Array(6);
  /** dispersion fit quality, cents RMS per string (for tests/diagnostics) */
  dispRms = new Float64Array(6);
  dispMax = new Float64Array(6);
  dispK = new Int32Array(6);

  vin: Float64Array[] = [];
  /** Σ Z·vin per sample; reused as α after the junction pass */
  S = new Float64Array(BK_MAX);
  vb = new Float64Array(BK_MAX);

  // junction
  Y = 0;
  ZSum = 0;
  invDen = 1;
  beta = 0;
  w0 = 0;
  w1 = 0;
  w2 = 0;

  // lifecycle
  active = false;
  held = false;
  sostenuto = false;
  /** damper contact 0 (lifted) .. 1 (fully down) and its target */
  damper = 1;
  damperTarget = 1;
  damperApplied = -1;
  level = 0;
  /** samples since activation */
  age = 0;
  fade = 1;
  fadeStep = 0;
  stolen = false;

  // hammer
  hActive = false;
  hContact = false;
  hEverContact = false;
  hEndAt = 0;
  hT = 0;
  hY = 0;
  hV = 0;
  hFs = 0;
  hMass = 0.008;
  hK = 1e9;
  hKeff = 1e9;
  hP = 2.5;
  hLam = 0.3;
  hC1 = 0;
  hC2 = 0;
  hW = new Float64Array(6);
  hF = new Float64Array(6);
  hYs = new Float64Array(6);
  hVs = new Float64Array(6);
  private hq = new Float64Array(6);
  private hX = new Float64Array(6);
  private hVv = new Float64Array(6);
  private hIL = new Int32Array(6);
  private hIR = new Int32Array(6);
  private hr = new Float64Array(6);
  private hu = new Float64Array(6);
  private hd = new Float64Array(6);
  hRecF = new Float32Array(HAMMER_REC);
  hRecX = new Float32Array(HAMMER_REC);
  hRecLen = 0;
  strikeVelocity = 0;
  strikeVh = 0;
  lastStrike: StrikeRecord | null = null;
  /** set when the felt first touches the strings (core turns it into key/frame thump) */
  thumpPending = 0;

  // preparation (point mass + dashpot), per string
  prep = false;
  prepTapL = new Int32Array(6);
  prepTapR = new Int32Array(6);
  prepMu = new Float64Array(6);
  prepRho = new Float64Array(6);
  prepV = new Float64Array(6);
  prepPos = 0;

  // damper / release noise injected at the hammer tap
  noiseAmp = 0;
  noiseDecay = 0.999;
  noiseLp = 0;
  private rng: () => number;

  // longitudinal / phantom partial generator (bass)
  phGain = 0;
  phCoef = 0;
  phHp = 0;
  phHpX = 0;
  phB = new Float64Array(10); // two bandpass biquads [b0,b2,a1,a2, s1,s2] -> packed
  phS = new Float64Array(4);
  lastF = 0;

  constructor(midi: number, light: boolean) {
    this.midi = midi;
    this.light = light;
    this.rng = mulberry32(midi * 2654435761 + (light ? 17 : 0));
    for (let i = 0; i < 6; i++) {
      this.vin.push(new Float64Array(BK_MAX));
      this.dispC.push(new Float64Array(2 * MAX_DISP));
      this.dispState.push(new Float64Array(2 * MAX_DISP));
    }
  }

  /** Design all filters for this key. Allocates buffers only if they must grow. */
  configure(spec: KeySpec, fs: number, cache: DispersionCache, mobility?: BridgeMobility): void {
    this.spec = spec;
    this.fs = fs;
    const light = this.light;
    const strings = light
      ? [
          {
            f1: spec.f1,
            f0: spec.f0,
            B: spec.B,
            Z: spec.strings.reduce((s, x) => s + x.Z, 0),
            weight: 1,
          },
        ]
      : spec.strings;
    const nV = strings.length;
    this.nV = nV;
    const kappa = light ? 0 : spec.polKappa;
    // second (horizontal) polarisation: same string, weakly coupled to the bridge, slightly
    // different effective termination -> tiny frequency offset (Weinreich 1977)
    const all = kappa > 0
      ? [...strings, ...strings.map((st, i) => {
          const f1h = st.f1 * Math.pow(2, ((i % 2 ? -1 : 1) * spec.polDetune) / 1200);
          return { ...st, f1: f1h, f0: f1h / Math.sqrt(1 + st.B) };
        })]
      : strings;
    this.n = all.length;
    this.polExcite = kappa > 0 ? spec.polExcite : 0;
    this.ZSum = 0;
    const zsV = strings.reduce((a, x) => a + x.Z, 0);
    const nominalLossA = nominalLossCoeff(spec, fs);
    for (let s = 0; s < this.n; s++) {
      const st = all[s];
      const c = s < nV ? 1 : kappa;
      this.cpl[s] = c;
      this.cZ[s] = c * st.Z;
      const f1 = st.f1;
      const f0 = st.f0;
      const B = st.B;
      // ---- loss filters (undamped and fully damped) from per-partial decay targets
      const { lu, ld } = designStringLoss(spec, f0, f1, B, fs);
      this.lgU[s] = Math.log(lu.g);
      this.aU[s] = lu.a;
      this.lgD[s] = Math.log(ld.g);
      this.aD[s] = ld.a;

      // ---- dispersion (designed once per key on the nominal string)
      const lossA = lu.a;
      const disp = cache.get(spec, fs, light, nominalLossA);
      const S = disp.a1.length;
      this.dispS[s] = S;
      for (let j = 0; j < S; j++) {
        this.dispC[s][2 * j] = disp.a1[j];
        this.dispC[s][2 * j + 1] = disp.a2[j];
      }
      this.dispRms[s] = disp.rmsCents;
      this.dispMax[s] = disp.maxCents;
      this.dispK[s] = disp.K;

      // ---- tuning: integer delay + Thiran so loop phase delay at partial 1 = fs/f1,
      // compensating the phase of the (reactive) bridge for this key's in-phase mode
      const w1 = (2 * Math.PI * f1) / fs;
      let P1 = fs / f1;
      if (mobility) {
        // relative loop-delay change from the bridge reactance at the first partials,
        // averaged (bass pitch is heard on partials 2–6, treble on partial 1)
        // in-phase mode of the vertical strings; a horizontal twin sees the bridge through c²
        const zs = (light ? st.Z : zsV) * c * c;
        let num = 0;
        let den = 0;
        for (let k = 1; k <= 6; k++) {
          const fk = k * f0 * Math.sqrt(1 + B * k * k);
          if (k > 1 && fk > 4000) break;
          const wk = (2 * Math.PI * fk) / fs;
          const [yr, yi] = mobility(wk, spec.zoneW);
          const er = (yr + spec.bridgeY) * zs;
          const ei = yi * zs;
          // ρ = (1 - ε)/(1 + ε); arg ρ = arg(1-ε) - arg(1+ε)
          const argRho = Math.atan2(-ei, 1 - er) - Math.atan2(ei, 1 + er);
          const wt = k <= 2 ? 1 : 0.5;
          num += (wt * argRho) / (2 * Math.PI * k); // ΔD_k / D_k
          den += wt;
        }
        const rel = num / den;
        this.bridgeComp[s] = rel * P1;
        P1 += rel * P1;
      } else this.bridgeComp[s] = 0;
      const R = P1 - cascadeLag(disp, w1) / w1 - onePolePhaseDelay(lossA, w1);
      let N = Math.floor(R - 0.55);
      if (N < 4) N = 4;
      this.N[s] = N;
      this.thA[s] = thiranForPhaseDelay(R - N, w1);

      const size = nextPow2(N + BK_MAX + 4);
      if (!this.bufs[s] || this.bufs[s].length < size) this.bufs[s] = new Float64Array(size);
      this.masks[s] = this.bufs[s].length - 1;

      const leftLen = N >> 1;
      this.leftLen[s] = leftLen;
      // hammer-to-agraffe round trip must be β of the true period (the agraffe side has no
      // lumped filters), not β of the delay line, which is shortened by the dispersion filter
      const h = clamp(Math.round((spec.beta * fs) / f1 / 2), 1, Math.max(1, leftLen - 2));
      this.hPos[s] = h;
      this.tapL[s] = leftLen - h;
      this.tapR[s] = leftLen + h;
      this.Z[s] = st.Z;
      this.h2Z[s] = 1 / (2 * st.Z);
      this.hT4Z[s] = 1 / (4 * st.Z * fs);
      if (s < nV) this.hW[s] = st.weight;
      this.ZSum += c * c * st.Z;

      if (!light && spec.preparation) {
        const j = clamp(Math.round((spec.preparation.position * fs) / f1 / 2), 1, leftLen - 1);
        this.prepTapL[s] = leftLen - j;
        this.prepTapR[s] = leftLen + j;
        this.prepMu[s] = (spec.preparation.mass * fs) / (2 * st.Z);
        this.prepRho[s] = spec.preparation.damping / (2 * st.Z);
      }
    }
    this.prep = !light && !!spec.preparation;
    this.prepPos = spec.preparation ? spec.preparation.position : 0;
    this.Y = spec.bridgeY;
    this.invDen = 1 / (1 + this.Y * this.ZSum);
    this.beta = this.ZSum * this.invDen;
    this.w0 = spec.zoneW[0];
    this.w1 = spec.zoneW[1];
    this.w2 = spec.zoneW[2];

    this.hMass = spec.hammer.mass;
    this.hK = spec.hammer.K;
    this.hP = spec.hammer.p;
    this.hLam = spec.hammer.lambda;
    const T = 1 / fs;
    this.hC1 = (T * T) / (4 * this.hMass);
    this.hC2 = T / (2 * this.hMass);

    // phantom partials: (F/T)^2 -> resonances at longitudinal modes
    const EA = 2.5e5;
    this.phCoef = (0.5 * EA) / (spec.T * spec.T * this.nV);
    this.phGain = light ? 0 : spec.phantomGain;
    const setBp = (o: number, f: number, q: number) => {
      const w = (2 * Math.PI * Math.min(f, 0.45 * fs)) / fs;
      const alpha = Math.sin(w) / (2 * q);
      const a0 = 1 + alpha;
      this.phB[o] = alpha / a0;
      this.phB[o + 1] = -alpha / a0;
      this.phB[o + 2] = (-2 * Math.cos(w)) / a0;
      this.phB[o + 3] = (1 - alpha) / a0;
    };
    setBp(0, spec.longFreq, 40);
    setBp(4, spec.longFreq * 2, 50);
    this.phHp = Math.exp((-2 * Math.PI * 40) / fs);
    this.damperApplied = -1;
  }

  /** Zero all state. */
  reset(): void {
    for (let s = 0; s < this.n; s++) {
      this.bufs[s].fill(0);
      this.thX[s] = 0;
      this.thY[s] = 0;
      this.dispState[s].fill(0);
      this.lossY[s] = 0;
      this.prepV[s] = 0;
      this.hF[s] = 0;
      this.hYs[s] = 0;
      this.hVs[s] = 0;
    }
    this.hActive = false;
    this.hContact = false;
    this.noiseAmp = 0;
    this.level = 0;
    this.age = 0;
    this.fade = 1;
    this.fadeStep = 0;
    this.stolen = false;
    this.phS.fill(0);
    this.phHpX = 0;
    this.lastF = 0;
    this.damperApplied = -1;
  }

  /** Largest block length for which the pass decomposition stays causal. */
  maxBlock(): number {
    let m = BK_MAX;
    for (let s = 0; s < this.n; s++) {
      if (this.N[s] < m) m = this.N[s];
      if ((this.hActive || this.noiseAmp > 0) && this.tapL[s] < m) m = this.tapL[s];
      if (this.prep && this.prepTapL[s] < m) m = this.prepTapL[s];
    }
    return m;
  }

  /** String displacement (m) at hammer point of string s, reconstructed from the travelling waves. */
  displacementAt(s: number, j: number, pos: number): number {
    const buf = this.bufs[s];
    const mask = this.masks[s];
    const L = this.leftLen[s];
    let y = 0;
    for (let i = 0; i < j; i++) y += buf[(pos - (L - i)) & mask] + buf[(pos - (L + i)) & mask];
    return y / this.fs;
  }

  /** Launch the hammer. unaCorda in [0,1] shifts it off the third string and onto softer felt. */
  strike(velocity: number, vHammer: number, unaCorda: number, pos: number): void {
    this.hActive = true;
    this.hContact = false;
    this.hEverContact = false;
    this.hT = 0;
    this.hFs = 0;
    let ysMean = 0;
    const nV = this.nV;
    for (let s = 0; s < nV; s++) {
      const ys = this.displacementAt(s, this.hPos[s], pos);
      this.hYs[s] = ys;
      ysMean += ys;
      const mask = this.masks[s];
      this.hVs[s] = this.bufs[s][(pos - this.tapL[s]) & mask] - this.bufs[s][(pos - this.tapR[s]) & mask];
      this.hF[s] = 0;
      const base = this.spec.strings[s]?.weight ?? 1;
      let w = base;
      if (nV === 3 && s === 2) w *= 1 - unaCorda;
      if (nV === 2 && s === 1) w *= 1 - 0.3 * unaCorda;
      this.hW[s] = w;
    }
    ysMean /= nV;
    this.hY = ysMean - HAMMER_GAP;
    this.hV = vHammer;
    this.hKeff = this.hK * (1 - 0.3 * unaCorda);
    this.hRecLen = 0;
    this.strikeVelocity = velocity;
    this.strikeVh = vHammer;
  }

  private hammerStep(p: number): void {
    const n = this.nV;
    const T = 1 / this.fs;
    const c1 = this.hC1;
    const c2 = this.hC2;
    const yh0 = this.hY;
    const vh0 = this.hV;
    const Fs0 = this.hFs;
    const q = this.hq;
    const X = this.hX;
    const V = this.hVv;
    let anyPos = false;
    for (let i = 0; i < n; i++) {
      const buf = this.bufs[i];
      const mask = this.masks[i];
      const iL = (p - this.tapL[i]) & mask;
      const iR = (p - this.tapR[i]) & mask;
      this.hIL[i] = iL;
      this.hIR[i] = iR;
      const qi = buf[iL] - buf[iR];
      q[i] = qi;
      const xi = yh0 + T * vh0 - c1 * Fs0 - this.hYs[i] - 0.5 * T * (qi + this.hVs[i]);
      X[i] = xi;
      V[i] = vh0 - c2 * Fs0 - qi;
      if (xi > 0 && this.hW[i] > 0) anyPos = true;
    }
    const F = this.hF;
    let Fs = 0;
    if (!anyPos) {
      for (let i = 0; i < n; i++) F[i] = 0;
    } else {
      const K = this.hKeff;
      const pp = this.hP;
      const lam = this.hLam;
      const r = this.hr;
      const u = this.hu;
      const d = this.hd;
      for (let it = 0; it < 24; it++) {
        Fs = 0;
        for (let i = 0; i < n; i++) Fs += F[i];
        for (let i = 0; i < n; i++) {
          const x = X[i] - c1 * Fs - this.hT4Z[i] * F[i];
          const xd = V[i] - c2 * Fs - this.h2Z[i] * F[i];
          let G = 0;
          let A = 0;
          let Bc = 0;
          const wi = this.hW[i];
          if (x > 0 && wi > 0) {
            const xp = Math.pow(x, pp);
            const damp = 1 + lam * xd;
            if (damp > 0) {
              G = wi * K * xp * damp;
              A = (wi * K * pp * xp * damp) / x;
              Bc = wi * K * xp * lam;
            }
          }
          r[i] = F[i] - G;
          u[i] = A * c1 + Bc * c2;
          d[i] = 1 + A * this.hT4Z[i] + Bc * this.h2Z[i];
        }
        let s1 = 0;
        let s2 = 0;
        for (let i = 0; i < n; i++) {
          s1 += r[i] / d[i];
          s2 += u[i] / d[i];
        }
        const coef = s1 / (1 + s2);
        let maxStep = 0;
        for (let i = 0; i < n; i++) {
          const dF = -(r[i] - u[i] * coef) / d[i];
          let nf = F[i] + dF;
          if (nf < 0) nf = 0;
          const step = Math.abs(nf - F[i]);
          if (step > maxStep) maxStep = step;
          F[i] = nf;
        }
        if (maxStep < 1e-10 + 1e-9 * Fs) break;
      }
    }
    Fs = 0;
    for (let i = 0; i < n; i++) Fs += F[i];
    const vh = vh0 - c2 * (Fs + Fs0);
    this.hY = yh0 + 0.5 * T * (vh + vh0);
    this.hV = vh;
    this.hFs = Fs;
    let xMax = -1;
    for (let i = 0; i < n; i++) {
      const fi = F[i] * this.h2Z[i];
      const vs = q[i] + fi;
      this.hYs[i] += 0.5 * T * (vs + this.hVs[i]);
      this.hVs[i] = vs;
      const x = this.hY - this.hYs[i];
      if (x > xMax) xMax = x;
      if (fi !== 0) {
        const buf = this.bufs[i];
        buf[this.hIL[i]] += fi;
        buf[this.hIR[i]] -= fi;
        // the felt also pushes a little sideways: excite the horizontal twin
        if (this.polExcite > 0) {
          const j = i + n;
          const fj = this.polExcite * F[i] * this.h2Z[j];
          const bj = this.bufs[j];
          const mj = this.masks[j];
          bj[(p - this.tapL[j]) & mj] += fj;
          bj[(p - this.tapR[j]) & mj] -= fj;
        }
      }
    }
    if (Fs > 0) {
      if (!this.hEverContact) {
        this.hEverContact = true;
        this.thumpPending = this.strikeVh;
        this.hRecLen = 0;
      }
      this.hContact = true;
    } else if (this.hContact) {
      this.hContact = false;
      this.hEndAt = this.hT;
    }
    if (this.hEverContact && this.hRecLen < HAMMER_REC) {
      this.hRecF[this.hRecLen] = Fs;
      this.hRecX[this.hRecLen] = Math.max(0, xMax);
      this.hRecLen++;
    }
    this.hT++;
    // retire the hammer once it has left and fallen back, or after a timeout
    const fs = this.fs;
    if ((this.hEverContact && !this.hContact && this.hT - this.hEndAt > 0.02 * fs) || this.hT > 0.25 * fs) {
      this.hActive = false;
      this.hContact = false;
      this.publishStrike();
    }
  }

  private publishStrike(): void {
    if (!this.hEverContact) return;
    let len = this.hRecLen;
    // trim trailing zeros after the last contact
    while (len > 0 && this.hRecF[len - 1] === 0) len--;
    let peak = 0;
    let contactSamples = 0;
    for (let i = 0; i < len; i++) {
      const f = this.hRecF[i];
      if (f > peak) peak = f;
      if (f > 0) contactSamples++;
    }
    this.lastStrike = {
      midi: this.midi,
      velocity: this.strikeVelocity,
      vHammer: this.strikeVh,
      fs: this.fs,
      force: this.hRecF.slice(0, Math.max(len, 1)),
      compression: this.hRecX.slice(0, Math.max(len, 1)),
      peak,
      duration: contactSamples / this.fs,
      serial: ++strikeSerial,
    };
  }

  /** Release noise: felt landing on a vibrating string (pitched through the string itself). */
  startDamperNoise(): void {
    const amp = this.level;
    if (amp < 1e-5) return;
    this.noiseAmp = 0.8 * amp * this.ZSum;
    this.noiseDecay = Math.exp(-1 / (0.03 * this.fs));
  }

  prePass(pos: number, Bk: number): void {
    const n = this.n;
    for (let t = 0; t < Bk; t++) {
      const p = pos + t;
      if (this.hActive) this.hammerStep(p);
      if (this.prep) {
        for (let s = 0; s < n; s++) {
          const buf = this.bufs[s];
          const mask = this.masks[s];
          const iL = (p - this.prepTapL[s]) & mask;
          const iR = (p - this.prepTapR[s]) & mask;
          const b = buf[iL];
          const a = -buf[iR];
          const mu = this.prepMu[s];
          // point mass + dashpot on the string, backward Euler (passive)
          const v = (a + b + mu * this.prepV[s]) / (1 + mu + this.prepRho[s]);
          const f = v - a - b;
          this.prepV[s] = v;
          buf[iL] = b + f;
          buf[iR] = -(a + f);
        }
      }
      if (this.noiseAmp > 0) {
        const white = this.rng() * 2 - 1;
        this.noiseLp += 0.25 * (white - this.noiseLp);
        const f = this.noiseAmp * this.noiseLp;
        this.noiseAmp *= this.noiseDecay;
        if (this.noiseAmp < 1e-9) this.noiseAmp = 0;
        for (let s = 0; s < this.nV; s++) {
          const buf = this.bufs[s];
          const mask = this.masks[s];
          const fi = f * this.h2Z[s] * (s === 0 ? 1 : 0.5);
          buf[(p - this.tapL[s]) & mask] += fi;
          buf[(p - this.tapR[s]) & mask] -= fi;
        }
      }
    }
  }

  /** Update loss coefficients from damper contact (control rate). */
  applyDamper(): void {
    const e = this.damper;
    if (Math.abs(e - this.damperApplied) < 1e-4) return;
    this.damperApplied = e;
    // contact pressure -> damping: a light touch damps much less (cubic)
    const k = e * e * e;
    for (let s = 0; s < this.n; s++) {
      const lg = this.lgU[s] + (this.lgD[s] - this.lgU[s]) * k;
      const a = this.aU[s] + (this.aD[s] - this.aU[s]) * k;
      this.lossA1[s] = a;
      this.lossB0[s] = Math.exp(lg) * (1 + a);
    }
  }

  /** Incoming waves at the bridge through the loop filters. Accumulates S = Σ Z vin. */
  readPass(pos: number, Bk: number): void {
    const S = this.S;
    for (let t = 0; t < Bk; t++) S[t] = 0;
    let peak = 0;
    for (let s = 0; s < this.n; s++) {
      const buf = this.bufs[s];
      const mask = this.masks[s];
      const N = this.N[s];
      const tha = this.thA[s];
      let thx = this.thX[s];
      let thy = this.thY[s];
      const S2 = 2 * this.dispS[s];
      const dc = this.dispC[s];
      const ds = this.dispState[s];
      const lb = this.lossB0[s];
      const la = this.lossA1[s];
      let ly = this.lossY[s];
      const vin = this.vin[s];
      const Z = this.cZ[s];
      for (let t = 0; t < Bk; t++) {
        const u = -buf[(pos + t - N) & mask];
        const th = tha * (u - thy) + thx;
        thx = u;
        thy = th;
        let x = th;
        // biquad allpass cascade (TDF-II): (a2 + a1 z^-1 + z^-2)/(1 + a1 z^-1 + a2 z^-2)
        for (let j = 0; j < S2; j += 2) {
          const a1 = dc[j];
          const a2 = dc[j + 1];
          const y = a2 * x + ds[j];
          ds[j] = a1 * (x - y) + ds[j + 1];
          ds[j + 1] = x - a2 * y;
          x = y;
        }
        ly = lb * x - la * ly;
        vin[t] = ly;
        S[t] += Z * ly;
        const al = ly < 0 ? -ly : ly;
        if (al > peak) peak = al;
      }
      this.thX[s] = thx;
      this.thY[s] = thy;
      this.lossY[s] = ly;
    }
    this.level = peak;
  }

  writePass(pos: number, Bk: number): void {
    const vb = this.vb;
    let g = this.fade;
    const gs = this.fadeStep;
    for (let s = 0; s < this.n; s++) {
      const buf = this.bufs[s];
      const mask = this.masks[s];
      const vin = this.vin[s];
      const c = this.cpl[s];
      if (gs === 0 && g === 1) {
        if (c === 1) for (let t = 0; t < Bk; t++) buf[(pos + t) & mask] = vb[t] - vin[t];
        else for (let t = 0; t < Bk; t++) buf[(pos + t) & mask] = c * vb[t] - vin[t];
      } else {
        let gg = g;
        for (let t = 0; t < Bk; t++) {
          buf[(pos + t) & mask] = (c * vb[t] - vin[t]) * gg;
          gg -= gs;
          if (gg < 0) gg = 0;
        }
      }
    }
    if (gs !== 0) {
      g -= gs * Bk;
      this.fade = g < 0 ? 0 : g;
    }
    this.age += Bk;
  }

  /** String shape (displacement in m) along the speaking length, `points` samples. */
  shape(s: number, pos: number, out: Float32Array): void {
    const buf = this.bufs[s];
    if (!buf) return;
    const mask = this.masks[s];
    const L = this.leftLen[s];
    const pts = out.length;
    let y = 0;
    let j = 0;
    const raw = new Float32Array(L + 1);
    raw[0] = 0;
    for (let i = 0; i < L; i++) {
      y += buf[(pos - 1 - (L - i)) & mask] + buf[(pos - 1 - (L + i)) & mask];
      raw[i + 1] = y / this.fs;
    }
    // remove the linear trend so both terminations sit at zero (filters are lumped at the bridge)
    const end = raw[L];
    for (let p = 0; p < pts; p++) {
      const x = (p / (pts - 1)) * L;
      j = Math.min(L - 1, Math.floor(x));
      const fr = x - j;
      const v = raw[j] * (1 - fr) + raw[j + 1] * fr;
      out[p] = v - end * (x / L);
    }
  }
}
