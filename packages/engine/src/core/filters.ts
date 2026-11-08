// Filter design for the string loop: dispersion allpass cascade, one-pole loss
// filter and first-order Thiran fractional delay. All design runs off the
// audio hot path (at voice/key setup).

import { LN1000 } from './util.ts';

/**
 * Phase delay (samples) of the first-order allpass A(z) = (a + z^-1)/(1 + a z^-1)
 * at normalized angular frequency w (rad/sample).
 */
export function allpass1PhaseDelay(a: number, w: number): number {
  if (w < 1e-9) return (1 - a) / (1 + a);
  return 1 - (2 / w) * Math.atan2(a * Math.sin(w), 1 + a * Math.cos(w));
}

/** Phase delay of the one-pole loss filter H(z) = g(1+a)/(1 + a z^-1). */
export function onePolePhaseDelay(a: number, w: number): number {
  if (w < 1e-9) return -a / (1 + a);
  return -Math.atan2(a * Math.sin(w), 1 + a * Math.cos(w)) / w;
}

/** Magnitude of H(z) = g(1+a)/(1 + a z^-1). */
export function onePoleMag(g: number, a: number, w: number): number {
  return (g * (1 + a)) / Math.sqrt(1 + 2 * a * Math.cos(w) + a * a);
}

/** Thiran first-order fractional delay coefficient for delay d (samples). */
export const thiranCoeff = (d: number): number => (1 - d) / (1 + d);

/**
 * Solve the Thiran coefficient so that its phase delay at w equals exactly `target`.
 * target should lie roughly in [0.5, 1.6].
 */
export function thiranForPhaseDelay(target: number, w: number): number {
  let d = target;
  for (let it = 0; it < 8; it++) {
    const a = thiranCoeff(d);
    const err = allpass1PhaseDelay(a, w) - target;
    if (Math.abs(err) < 1e-12) break;
    // derivative of phase delay wrt d is ~1 at low frequency
    d -= err;
  }
  return thiranCoeff(d);
}

export interface LossDesign {
  g: number;
  a: number;
}

/**
 * Design H(z) = g(1+a)/(1 + a z^-1) so that per-round-trip loss matches target
 * per-partial decay times. `freqs` are partial frequencies (Hz), `t60` their
 * decay times (s), `loopDelay` the round-trip delay (samples) at each partial.
 * Weighted least squares on log magnitude, emphasizing low partials.
 */
export function designLossFilter(
  freqs: readonly number[],
  t60: readonly number[],
  loopDelay: readonly number[],
  fs: number,
): LossDesign {
  // Exact two-point design (cf. Bank 2000): match partial 1 and a high reference
  // partial (the highest given), the one-pole shape interpolates in between.
  const n = freqs.length;
  const G = (k: number) => Math.exp((-LN1000 * loopDelay[k]) / (fs * t60[k]));
  const w1 = (2 * Math.PI * freqs[0]) / fs;
  const G1 = G(0);
  if (n < 2) return { g: Math.min(1, G1), a: 0 };
  const kH = n - 1;
  const wH = (2 * Math.PI * freqs[kH]) / fs;
  const R = G(kH) / G1; // desired |H(wH)| / |H(w1)|
  const ratio = (a: number) => Math.sqrt((1 + 2 * a * Math.cos(w1) + a * a) / (1 + 2 * a * Math.cos(wH) + a * a));
  let a = 0;
  if (R < 1) {
    let lo = -0.9999;
    let hi = 0;
    for (let it = 0; it < 80; it++) {
      const mid = 0.5 * (lo + hi);
      // ratio decreases as a -> -1
      if (ratio(mid) > R) hi = mid;
      else lo = mid;
    }
    a = 0.5 * (lo + hi);
  }
  const g = Math.min(1, (G1 * Math.sqrt(1 + 2 * a * Math.cos(w1) + a * a)) / (1 + a));
  return { g, a };
}

/** Unwrapped phase lag (rad) of a 2nd-order allpass with poles ρe^{±jθ}. */
export function allpass2Lag(rho: number, theta: number, w: number): number {
  return (
    2 * w +
    2 * Math.atan2(rho * Math.sin(w - theta), 1 - rho * Math.cos(w - theta)) +
    2 * Math.atan2(rho * Math.sin(w + theta), 1 - rho * Math.cos(w + theta))
  );
}

export interface Dispersion2 {
  /** biquad allpass coefficients per section: A(z) = 1 + a1 z^-1 + a2 z^-2 */
  a1: number[];
  a2: number[];
  rho: number[];
  theta: number[];
  rmsCents: number;
  maxCents: number;
  /** number of partials evaluated */
  K: number;
}

export function cascadeLag(d: { rho: number[]; theta: number[] }, w: number): number {
  let s = 0;
  for (let i = 0; i < d.rho.length; i++) s += allpass2Lag(d.rho[i], d.theta[i], w);
  return s;
}

/**
 * Dispersion filter for a stiff string as a cascade of 2nd-order allpass sections.
 *
 * Initial placement after Abel, Välimäki & Smith (2010): the desired lag
 * Φ(w) = 2π k(w) + C·w is the stiff-string loop phase with a linear part removed
 * (the delay line takes it); one pole pair sits where Φ crosses each odd multiple
 * of π, radii follow the local pole spacing. With the smallest monotonic C this
 * gives the minimum order (≈55 sections for A0 up to 5 kHz, a handful at C4).
 * For low orders the placement is coarse, so pole angles/radii are then refined
 * by Levenberg–Marquardt on the actual partial-frequency error in cents.
 */
export function designDispersion2(
  f0: number,
  B: number,
  fs: number,
  opts: {
    fMax: number;
    kMax: number;
    maxSections: number;
    extraDelay?: (w: number) => number;
    beta?: number;
    overshoot?: number;
    tolCents?: number;
    refineUpTo?: number;
  },
): Dispersion2 {
  const P0 = fs / f0;
  const extra = opts.extraDelay ?? (() => 0);
  const ks: number[] = [];
  const ws: number[] = [];
  for (let k = 1; k <= opts.kMax; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > opts.fMax || fk > 0.45 * fs) break;
    ks.push(k);
    ws.push((2 * Math.PI * fk) / fs);
  }
  const K = ks.length;
  const cf = 1200 / Math.LN2;
  const Dt = ks.map((k, i) => (2 * Math.PI * k) / ws[i]);
  const ex = ws.map((w) => extra(w));
  const resid = (rho: number[], theta: number[], out: Float64Array): void => {
    const d = { rho, theta };
    const N = Dt[0] - (cascadeLag(d, ws[0]) / ws[0] + ex[0]);
    for (let i = 0; i < K; i++) {
      const Di = N + cascadeLag(d, ws[i]) / ws[i] + ex[i];
      out[i] = (-cf * (Di - Dt[i])) / Dt[i];
    }
  };
  const r0 = new Float64Array(Math.max(K, 1));
  const errOf = (rho: number[], theta: number[]): { rms: number; max: number } => {
    if (K === 0) return { rms: 0, max: 0 };
    resid(rho, theta, r0);
    let s = 0;
    let mx = 0;
    for (let i = 0; i < K; i++) {
      s += r0[i] * r0[i];
      if (Math.abs(r0[i]) > mx) mx = Math.abs(r0[i]);
    }
    return { rms: Math.sqrt(s / K), max: mx };
  };
  const pack = (rho: number[], theta: number[]): Dispersion2 => {
    const e = errOf(rho, theta);
    return {
      rho,
      theta,
      a1: rho.map((r, i) => -2 * r * Math.cos(theta[i])),
      a2: rho.map((r) => r * r),
      rmsCents: e.rms,
      maxCents: e.max,
      K,
    };
  };
  const none = pack([], []);
  const tol = opts.tolCents ?? 0.5;
  if (K < 2 || B <= 0 || none.maxCents <= tol) return none;
  const kOf = (w: number): number => {
    const r = (w * P0) / (2 * Math.PI);
    return Math.sqrt((-1 + Math.sqrt(1 + 4 * B * r * r)) / (2 * B));
  };
  const lag0 = (w: number): number => 2 * Math.PI * kOf(w) - w * extra(Math.max(w, 1e-7));
  const wd = Math.min(0.92 * Math.PI, ws[K - 1] * (opts.overshoot ?? 1.5));
  const slope = (w: number): number => {
    const h = 1e-5;
    const a = Math.max(1e-7, w - h);
    return (lag0(w + h) - lag0(a)) / (w + h - a);
  };
  let minSlope = Infinity;
  for (let i = 1; i <= 100; i++) minSlope = Math.min(minSlope, slope((i / 100) * wd));
  const beta = opts.beta ?? 1.0;
  const place = (S: number, C: number): { rho: number[]; theta: number[] } => {
    const phiD = (w: number): number => lag0(w) + C * w;
    const inv = (t: number): number => {
      let lo = 0;
      let hi = wd;
      for (let i = 0; i < 56; i++) {
        const m = 0.5 * (lo + hi);
        if (phiD(m) < t) lo = m;
        else hi = m;
      }
      return 0.5 * (lo + hi);
    };
    const theta: number[] = [];
    for (let i = 1; i <= S; i++) theta.push(inv((2 * i - 1) * Math.PI));
    const rho = theta.map((t, i) => {
      const prev = i > 0 ? theta[i - 1] : -t;
      const next = i < S - 1 ? theta[i + 1] : 2 * t - prev;
      return Math.min(0.99995, Math.exp((-beta * Math.max(1e-4, next - prev)) / 2));
    });
    return { rho, theta };
  };
  // minimum-order placement
  const Cmin = 1 - minSlope;
  const Smin = Math.min(opts.maxSections, Math.floor((lag0(wd) + Cmin * wd) / (2 * Math.PI)));
  let best: Dispersion2 = none;
  if (Smin >= 1) {
    const p = place(Smin, Cmin);
    const d = pack(p.rho, p.theta);
    if (d.rmsCents < best.rmsCents) best = d;
  }
  // place with a C that fits S sections into the band, then refine on the true error
  const refineUpTo = opts.refineUpTo ?? 40;
  const cands: number[] = [];
  if (Smin <= 8) for (let S = 1; S <= Math.max(Smin + 2, 2); S++) cands.push(S);
  else if (Smin <= refineUpTo) cands.push(Smin, Smin + 2);
  for (const S of cands) {
    if (S > opts.maxSections) break;
    const C = (2 * Math.PI * (S - 0.4) - lag0(wd)) / wd;
    const init = place(S, Math.max(C, Cmin));
    const r = lmRefine(init.rho, init.theta, ws, Dt);
    const d = pack(r.rho, r.theta);
    if (d.rmsCents < best.rmsCents - 0.02) best = d;
    if (best.maxCents <= tol) break;
  }
  return best;
}

/**
 * Levenberg–Marquardt on pole angles θ and u = log(1-ρ), analytic Jacobian.
 * Residual: cents error of each partial after aligning partial 1 (extra loop
 * delay terms are constant in the parameters and cancel in the Jacobian; they
 * enter only through the initial residual, which is recomputed exactly).
 */
function lmRefine(
  rho0: number[],
  theta0: number[],
  ws: number[],
  Dt: number[],
): { rho: number[]; theta: number[] } {
  const S = rho0.length;
  const K = ws.length;
  const P = 2 * S;
  const cf = 1200 / Math.LN2;
  const th = Float64Array.from(theta0);
  const u = Float64Array.from(rho0.map((r) => Math.log(Math.max(1e-7, 1 - r))));
  // base residual offset from the target (everything except the cascade)
  const base = new Float64Array(K);
  for (let i = 0; i < K; i++) base[i] = Dt[0] - Dt[i];
  const lagAll = (thv: Float64Array, uv: Float64Array, out: Float64Array, J: Float64Array | null): void => {
    // out[i] = lag(w_i)/w_i ; J[i*P + p] = d(lag/w)/dp
    for (let i = 0; i < K; i++) {
      const w = ws[i];
      let lag = 0;
      for (let sct = 0; sct < S; sct++) {
        const rho = 1 - Math.exp(uv[sct]);
        const t = thv[sct];
        const p1 = w - t;
        const p2 = w + t;
        const c1 = Math.cos(p1);
        const s1 = Math.sin(p1);
        const c2 = Math.cos(p2);
        const s2 = Math.sin(p2);
        const D1 = 1 - 2 * rho * c1 + rho * rho;
        const D2 = 1 - 2 * rho * c2 + rho * rho;
        lag += 2 * w + 2 * Math.atan2(rho * s1, 1 - rho * c1) + 2 * Math.atan2(rho * s2, 1 - rho * c2);
        if (J) {
          const dRho = 2 * (s1 / D1 + s2 / D2);
          const dTh = 2 * ((-rho * (c1 - rho)) / D1 + (rho * (c2 - rho)) / D2);
          J[i * P + sct] = dTh / w;
          J[i * P + S + sct] = (dRho * -(1 - rho)) / w;
        }
      }
      out[i] = lag / w;
    }
  };
  const L = new Float64Array(K);
  const J = new Float64Array(K * P);
  const r = new Float64Array(K);
  const residFrom = (Lv: Float64Array, out: Float64Array): number => {
    let c = 0;
    for (let i = 0; i < K; i++) {
      out[i] = (-cf * (base[i] + Lv[i] - Lv[0])) / Dt[i];
      c += out[i] * out[i];
    }
    return Number.isFinite(c) ? c : Infinity;
  };
  lagAll(th, u, L, J);
  let c = residFrom(L, r);
  let lam = 1e-3;
  const thT = new Float64Array(S);
  const uT = new Float64Array(S);
  const LT = new Float64Array(K);
  const rT = new Float64Array(K);
  const A = new Float64Array(P * P);
  const g = new Float64Array(P);
  for (let it = 0; it < 60; it++) {
    // Jacobian of residual: dr_i/dp = -cf/Dt_i (J_i - J_0)
    A.fill(0);
    g.fill(0);
    for (let i = 1; i < K; i++) {
      const sc = -cf / Dt[i];
      for (let a = 0; a < P; a++) {
        const ja = sc * (J[i * P + a] - J[a]);
        if (ja === 0) continue;
        g[a] += ja * r[i];
        for (let b = a; b < P; b++) A[a * P + b] += ja * sc * (J[i * P + b] - J[b]);
      }
    }
    let improved = false;
    for (let tries = 0; tries < 10; tries++) {
      const M: number[][] = [];
      for (let a = 0; a < P; a++) {
        const row = new Array(P);
        for (let b = 0; b < P; b++) {
          const v = a <= b ? A[a * P + b] : A[b * P + a];
          row[b] = a === b ? v * (1 + lam) + 1e-14 : v;
        }
        M.push(row);
      }
      const d = solveLinear(M, Array.from(g, (v) => -v));
      if (!d) {
        lam *= 10;
        continue;
      }
      for (let sct = 0; sct < S; sct++) {
        thT[sct] = Math.min(Math.PI * 0.999, Math.max(1e-6, th[sct] + d[sct]));
        uT[sct] = Math.min(-1e-6, Math.max(-16, u[sct] + d[S + sct]));
      }
      lagAll(thT, uT, LT, null);
      const ct = residFrom(LT, rT);
      if (ct < c) {
        th.set(thT);
        u.set(uT);
        const rel = (c - ct) / Math.max(c, 1e-30);
        c = ct;
        lagAll(th, u, L, J);
        residFrom(L, r);
        lam = Math.max(1e-10, lam / 4);
        improved = true;
        if (rel < 1e-8) it = 1e9;
        break;
      }
      lam *= 8;
    }
    if (!improved) break;
  }
  return { rho: Array.from(u, (x) => 1 - Math.exp(x)), theta: Array.from(th) };
}

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let j = r + 1; j < n; j++) s -= M[r][j] * x[j];
    x[r] = s / M[r][r];
  }
  return x;
}

/** RBJ biquad coefficients. Returned as [b0,b1,b2,a1,a2] normalized by a0. */
export function biquadPeaking(f: number, q: number, gainDb: number, fs: number): number[] {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * f) / fs;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const a0 = 1 + alpha / A;
  return [(1 + alpha * A) / a0, (-2 * c) / a0, (1 - alpha * A) / a0, (-2 * c) / a0, (1 - alpha / A) / a0];
}

export function biquadHighShelf(f: number, gainDb: number, fs: number, s = 0.8): number[] {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * f) / fs;
  const c = Math.cos(w);
  const alpha = (Math.sin(w) / 2) * Math.sqrt((A + 1 / A) * (1 / s - 1) + 2);
  const sq = 2 * Math.sqrt(A) * alpha;
  const a0 = A + 1 - (A - 1) * c + sq;
  return [
    (A * (A + 1 + (A - 1) * c + sq)) / a0,
    (-2 * A * (A - 1 + (A + 1) * c)) / a0,
    (A * (A + 1 + (A - 1) * c - sq)) / a0,
    (2 * (A - 1 - (A + 1) * c)) / a0,
    (A + 1 - (A - 1) * c - sq) / a0,
  ];
}

export function biquadLowShelf(f: number, gainDb: number, fs: number, s = 0.8): number[] {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * f) / fs;
  const c = Math.cos(w);
  const alpha = (Math.sin(w) / 2) * Math.sqrt((A + 1 / A) * (1 / s - 1) + 2);
  const sq = 2 * Math.sqrt(A) * alpha;
  const a0 = A + 1 + (A - 1) * c + sq;
  return [
    (A * (A + 1 - (A - 1) * c + sq)) / a0,
    (2 * A * (A - 1 - (A + 1) * c)) / a0,
    (A * (A + 1 - (A - 1) * c - sq)) / a0,
    (-2 * (A - 1 + (A + 1) * c)) / a0,
    (A + 1 + (A - 1) * c - sq) / a0,
  ];
}

export function biquadHighpass(f: number, q: number, fs: number): number[] {
  const w = (2 * Math.PI * f) / fs;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const a0 = 1 + alpha;
  return [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - alpha) / a0];
}

export function biquadLowpass(f: number, q: number, fs: number): number[] {
  const w = (2 * Math.PI * f) / fs;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const a0 = 1 + alpha;
  return [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, (-2 * c) / a0, (1 - alpha) / a0];
}

export function biquadBandpass(f: number, q: number, fs: number): number[] {
  const w = (2 * Math.PI * f) / fs;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const a0 = 1 + alpha;
  return [alpha / a0, 0, -alpha / a0, (-2 * c) / a0, (1 - alpha) / a0];
}
