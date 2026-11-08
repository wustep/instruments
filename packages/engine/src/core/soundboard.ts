// Modal soundboard driven at three bridge zones. Each mode is a velocity-output
// resonator A·s/(s² + 2ζω s + ω²) (positive real), discretised with the
// prewarped bilinear transform, which preserves passivity — so the coupled
// string/bridge/board system stays stable. Mode frequencies, masses and shapes
// are drawn from a seeded distribution with plate-like constant modal density
// (Ege, Boutillon & Rébillat 2013 report ~constant density and loss factors of
// a few percent below ~1 kHz).

import { type Calibration } from './calibration.ts';
import { type BoardDesign, NUM_ZONES } from './design.ts';
import { gauss, mulberry32 } from './util.ts';

const ZONE_X = [0.16, 0.44, 0.78];
const MIC_L = 0.26;
const MIC_R = 0.7;

export class Soundboard {
  K = 0;
  freq = new Float64Array(0);
  zeta = new Float64Array(0);
  mass = new Float64Array(0);
  b0 = new Float64Array(0);
  b2 = new Float64Array(0);
  a1 = new Float64Array(0);
  a2 = new Float64Array(0);
  s1 = new Float64Array(0);
  s2 = new Float64Array(0);
  /** mode shape at zones, K x 3 interleaved */
  phi = new Float64Array(0);
  radL = new Float64Array(0);
  radR = new Float64Array(0);
  /** direct-feedthrough admittance between zones (3x3, row-major) */
  Y0 = new Float64Array(9);
  // running state projection H_z = Σ φ_kz s1_k
  H0 = 0;
  H1 = 0;
  H2 = 0;
  private kappa = new Float64Array(0);
  private theta = new Float64Array(0);
  private fs = 48000;
  private design!: BoardDesign;
  private cal!: Calibration;

  configure(design: BoardDesign, cal: Calibration, dampingScale: number, fs: number): void {
    this.design = design;
    this.cal = cal;
    this.fs = fs;
    const rand = mulberry32(design.seed * 7777 + 13);
    const freqs: number[] = [];
    let f = design.fLow;
    while (f < design.fHigh) {
      freqs.push(f);
      f += design.spacing * (0.35 + 1.3 * rand());
    }
    const K = freqs.length;
    this.K = K;
    this.freq = Float64Array.from(freqs);
    this.zeta = new Float64Array(K);
    this.mass = new Float64Array(K);
    this.b0 = new Float64Array(K);
    this.b2 = new Float64Array(K);
    this.a1 = new Float64Array(K);
    this.a2 = new Float64Array(K);
    this.s1 = new Float64Array(K);
    this.s2 = new Float64Array(K);
    this.phi = new Float64Array(K * NUM_ZONES);
    this.radL = new Float64Array(K);
    this.radR = new Float64Array(K);
    this.kappa = new Float64Array(K);
    this.theta = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      const fk = freqs[k];
      this.mass[k] = cal.board.modalMass * design.massScale * Math.exp(0.35 * gauss(rand));
      // spatial wavenumber grows like sqrt(f) for a bending plate
      this.kappa[k] = 0.8 + 1.6 * Math.sqrt(fk / design.fLow) * (0.7 + 0.6 * rand());
      this.theta[k] = rand() * Math.PI * 2;
      for (let z = 0; z < NUM_ZONES; z++) {
        this.phi[k * NUM_ZONES + z] = Math.sin(Math.PI * this.kappa[k] * ZONE_X[z] + this.theta[k]);
      }
      // close microphones over bass and treble strings see local board motion;
      // the lowest modes radiate less efficiently
      const eff = (fk * fk) / (fk * fk + 140 * 140);
      this.radL[k] = eff * Math.sin(Math.PI * this.kappa[k] * MIC_L + this.theta[k]);
      this.radR[k] = eff * Math.sin(Math.PI * this.kappa[k] * MIC_R + this.theta[k]);
    }
    this.setDamping(dampingScale);
  }

  /** Recompute modal coefficients for a new damping scale (live control). Keeps state. */
  setDamping(scale: number): void {
    const { lossFactor, lossFactorHigh } = this.cal.board;
    const fs = this.fs;
    const lf0 = Math.log(100);
    const lf1 = Math.log(3000);
    for (let k = 0; k < this.K; k++) {
      const fk = this.freq[k];
      const t = Math.min(1, Math.max(0, (Math.log(fk) - lf0) / (lf1 - lf0)));
      const eta = Math.exp(Math.log(lossFactor) * (1 - t) + Math.log(lossFactorHigh) * t);
      const zeta = Math.min(0.45, 0.5 * eta * this.design.lossScale * scale);
      this.zeta[k] = zeta;
      const w = 2 * Math.PI * fk;
      const c = w / Math.tan((w / fs) * 0.5);
      const A = 1 / this.mass[k];
      const a0 = c * c + 2 * zeta * w * c + w * w;
      this.b0[k] = (A * c) / a0;
      this.b2[k] = (-A * c) / a0;
      this.a1[k] = (2 * (w * w - c * c)) / a0;
      this.a2[k] = (c * c - 2 * zeta * w * c + w * w) / a0;
    }
    const Y0 = this.Y0;
    Y0.fill(0);
    for (let k = 0; k < this.K; k++) {
      for (let z = 0; z < NUM_ZONES; z++) {
        for (let z2 = 0; z2 < NUM_ZONES; z2++) {
          Y0[z * 3 + z2] += this.b0[k] * this.phi[k * 3 + z] * this.phi[k * 3 + z2];
        }
      }
    }
    this.recomputeH();
  }

  recomputeH(): void {
    let h0 = 0;
    let h1 = 0;
    let h2 = 0;
    const phi = this.phi;
    for (let k = 0; k < this.K; k++) {
      const s = this.s1[k];
      h0 += phi[k * 3] * s;
      h1 += phi[k * 3 + 1] * s;
      h2 += phi[k * 3 + 2] * s;
    }
    this.H0 = h0;
    this.H1 = h1;
    this.H2 = h2;
  }

  reset(): void {
    this.s1.fill(0);
    this.s2.fill(0);
    this.H0 = this.H1 = this.H2 = 0;
  }

  /** Flush denormal-range state. */
  flush(): void {
    let any = false;
    for (let k = 0; k < this.K; k++) {
      if (Math.abs(this.s1[k]) < 1e-22) this.s1[k] = 0;
      else any = true;
      if (Math.abs(this.s2[k]) < 1e-22) this.s2[k] = 0;
    }
    if (!any) this.H0 = this.H1 = this.H2 = 0;
  }

  /** Discrete-time admittance (s/kg) seen at a bridge point with zone weights w, at w rad/sample. */
  mobility(w: number, zoneW: readonly number[]): [number, number] {
    let re = 0;
    let im = 0;
    const c1 = Math.cos(w);
    const s1 = -Math.sin(w);
    const c2 = Math.cos(2 * w);
    const s2 = -Math.sin(2 * w);
    for (let k = 0; k < this.K; k++) {
      const psi = zoneW[0] * this.phi[k * 3] + zoneW[1] * this.phi[k * 3 + 1] + zoneW[2] * this.phi[k * 3 + 2];
      if (psi === 0) continue;
      // H = (b0 + b2 e^{-2jw}) / (1 + a1 e^{-jw} + a2 e^{-2jw})
      const nr = this.b0[k] + this.b2[k] * c2;
      const ni = this.b2[k] * s2;
      const dr = 1 + this.a1[k] * c1 + this.a2[k] * c2;
      const di = this.a1[k] * s1 + this.a2[k] * s2;
      const den = dr * dr + di * di;
      const hr = (nr * dr + ni * di) / den;
      const hi = (ni * dr - nr * di) / den;
      re += psi * psi * hr;
      im += psi * psi * hi;
    }
    return [re, im];
  }

  /** Amplitude of each mode (state norm), for visualisation. */
  modeAmplitudes(out: Float32Array): void {
    for (let k = 0; k < this.K && k < out.length; k++) {
      out[k] = Math.hypot(this.s1[k], this.s2[k]) * this.mass[k];
    }
  }
}
