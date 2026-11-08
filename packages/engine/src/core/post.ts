// Output stage: radiation tilt + calibrated EQ, lid, high-frequency board
// diffusion, a small feedback-delay-network room, and a safety limiter.
// None of this is sample playback; it is the listener/microphone side.

import {
  biquadHighShelf,
  biquadHighpass,
  biquadLowShelf,
  biquadPeaking,
} from './filters.ts';

/** Cascade of biquads, stereo, transposed direct form II. */
export class BiquadChain {
  n = 0;
  c = new Float64Array(0);
  s = new Float64Array(0);
  set(sections: number[][]): void {
    const n = sections.length;
    if (n !== this.n) {
      this.n = n;
      this.c = new Float64Array(n * 5);
      this.s = new Float64Array(n * 4);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < 5; j++) this.c[i * 5 + j] = sections[i][j];
  }
  process(L: Float64Array, R: Float64Array, len: number): void {
    const c = this.c;
    const s = this.s;
    for (let i = 0; i < this.n; i++) {
      const b0 = c[i * 5];
      const b1 = c[i * 5 + 1];
      const b2 = c[i * 5 + 2];
      const a1 = c[i * 5 + 3];
      const a2 = c[i * 5 + 4];
      let l1 = s[i * 4];
      let l2 = s[i * 4 + 1];
      let r1 = s[i * 4 + 2];
      let r2 = s[i * 4 + 3];
      for (let t = 0; t < len; t++) {
        const xl = L[t];
        const yl = b0 * xl + l1;
        l1 = b1 * xl - a1 * yl + l2;
        l2 = b2 * xl - a2 * yl;
        L[t] = yl;
        const xr = R[t];
        const yr = b0 * xr + r1;
        r1 = b1 * xr - a1 * yr + r2;
        r2 = b2 * xr - a2 * yr;
        R[t] = yr;
      }
      s[i * 4] = Math.abs(l1) < 1e-25 ? 0 : l1;
      s[i * 4 + 1] = Math.abs(l2) < 1e-25 ? 0 : l2;
      s[i * 4 + 2] = Math.abs(r1) < 1e-25 ? 0 : r1;
      s[i * 4 + 3] = Math.abs(r2) < 1e-25 ? 0 : r2;
    }
  }
  reset(): void {
    this.s.fill(0);
  }
}

/** First-order shelf (s + w1)/(s + w2) via bilinear transform: +6 dB/oct between f1 and f2. */
export function tiltSection(f1: number, f2: number, fs: number): number[] {
  const c = 2 * fs;
  const w1 = 2 * fs * Math.tan((Math.PI * f1) / fs);
  const w2 = 2 * fs * Math.tan((Math.PI * f2) / fs);
  const a0 = c + w2;
  return [(c + w1) / a0, (w1 - c) / a0, 0, (w2 - c) / a0, 0];
}

class Allpass {
  buf: Float64Array;
  i = 0;
  constructor(
    len: number,
    public g: number,
  ) {
    this.buf = new Float64Array(Math.max(1, len));
  }
  tick(x: number): number {
    const b = this.buf;
    const d = b[this.i];
    const v = x + this.g * d;
    b[this.i] = Math.abs(v) < 1e-25 ? 0 : v;
    this.i = this.i + 1 === b.length ? 0 : this.i + 1;
    return d - this.g * v;
  }
  reset(): void {
    this.buf.fill(0);
  }
}

/** 8-line FDN reverb with Hadamard feedback and frequency-dependent decay (Jot & Chaigne 1991). */
export class Room {
  private lines: Float64Array[] = [];
  private idx = new Int32Array(8);
  private lp = new Float64Array(8);
  private g = new Float64Array(8);
  private damp = new Float64Array(8);
  private pre: Float64Array;
  private preI = 0;
  private preLen = 1;
  private inAp: Allpass[] = [];
  private fs: number;
  private o = new Float64Array(8);
  constructor(fs: number) {
    this.fs = fs;
    this.pre = new Float64Array(Math.ceil(0.05 * fs));
    const base = [29.7, 37.1, 41.1, 43.7, 53.9, 59.3, 67.1, 73.3];
    for (let i = 0; i < 8; i++) this.lines.push(new Float64Array(Math.ceil((base[i] * 1.6 * fs) / 1000) + 2));
    this.inAp = [new Allpass(Math.round(0.0047 * fs), 0.6), new Allpass(Math.round(0.0071 * fs), 0.55)];
    this.configure(0.25);
  }
  size = 1;
  t60 = 1.5;
  private lens = new Int32Array(8);
  configure(room: number): void {
    const fs = this.fs;
    this.size = 0.55 + 0.45 * room;
    this.t60 = 0.7 + 1.7 * room;
    const base = [29.7, 37.1, 41.1, 43.7, 53.9, 59.3, 67.1, 73.3];
    for (let i = 0; i < 8; i++) {
      const len = Math.min(this.lines[i].length - 1, Math.round((base[i] * this.size * fs) / 1000));
      this.lens[i] = len;
      const sec = len / fs;
      // gain for t60 at low frequencies; extra HF absorption via one-pole
      this.g[i] = Math.pow(10, (-3 * sec) / this.t60);
      const gHigh = Math.pow(10, (-3 * sec) / (this.t60 * 0.35));
      // one-pole such that DC gain 1 and Nyquist gain gHigh/g
      const r = gHigh / this.g[i];
      this.damp[i] = (1 - r) / (1 + r);
    }
    this.preLen = Math.max(1, Math.round((0.008 + 0.012 * room) * fs));
  }
  reset(): void {
    for (const l of this.lines) l.fill(0);
    this.lp.fill(0);
    this.pre.fill(0);
    for (const a of this.inAp) a.reset();
  }
  /** Adds wet signal into L/R (in place). */
  process(L: Float64Array, R: Float64Array, len: number, send: number, wet: number): void {
    if (wet <= 0 && send <= 0) return;
    const o = this.o;
    const lines = this.lines;
    for (let t = 0; t < len; t++) {
      // predelay
      const x = (L[t] + R[t]) * 0.5 * send;
      const pre = this.pre;
      const pi = this.preI;
      const d = pre[(pi - this.preLen + pre.length) % pre.length];
      pre[pi] = x;
      this.preI = pi + 1 === pre.length ? 0 : pi + 1;
      let inp = this.inAp[0].tick(d);
      inp = this.inAp[1].tick(inp);
      // read lines, absorb
      for (let i = 0; i < 8; i++) {
        const line = lines[i];
        let ri = this.idx[i] - this.lens[i];
        if (ri < 0) ri += line.length;
        const v = line[ri] * this.g[i];
        const lpv = v + this.damp[i] * (this.lp[i] - v);
        this.lp[i] = Math.abs(lpv) < 1e-25 ? 0 : lpv;
        o[i] = lpv;
      }
      const outL = (o[0] + o[2] - o[4] + o[6]) * 0.5;
      const outR = (o[1] - o[3] + o[5] + o[7]) * 0.5;
      // Hadamard 8 (fast Walsh–Hadamard), normalised, in place in `o`
      const a0 = o[0] + o[1], a1 = o[0] - o[1], a2 = o[2] + o[3], a3 = o[2] - o[3];
      const a4 = o[4] + o[5], a5 = o[4] - o[5], a6 = o[6] + o[7], a7 = o[6] - o[7];
      const b0 = a0 + a2, b1 = a1 + a3, b2 = a0 - a2, b3 = a1 - a3;
      const b4 = a4 + a6, b5 = a5 + a7, b6 = a4 - a6, b7 = a5 - a7;
      const k = 0.3535533905932738;
      o[0] = (b0 + b4) * k;
      o[1] = (b1 + b5) * k;
      o[2] = (b2 + b6) * k;
      o[3] = (b3 + b7) * k;
      o[4] = (b0 - b4) * k;
      o[5] = (b1 - b5) * k;
      o[6] = (b2 - b6) * k;
      o[7] = (b3 - b7) * k;
      for (let i = 0; i < 8; i++) {
        const line = lines[i];
        line[this.idx[i]] = o[i] + (i & 1 ? -inp : inp);
        this.idx[i] = this.idx[i] + 1 === line.length ? 0 : this.idx[i] + 1;
      }
      L[t] += wet * outL;
      R[t] += wet * outR;
    }
  }
}

/** Short allpass diffusion for the high-frequency board path (decorrelated L/R). */
export class Diffuser {
  private l: Allpass[];
  private r: Allpass[];
  constructor(fs: number) {
    const ms = (x: number) => Math.round((x * fs) / 1000);
    this.l = [new Allpass(ms(1.13), 0.62), new Allpass(ms(2.71), 0.58), new Allpass(ms(4.03), 0.55), new Allpass(ms(6.67), 0.5)];
    this.r = [new Allpass(ms(1.37), 0.62), new Allpass(ms(2.29), 0.58), new Allpass(ms(4.61), 0.55), new Allpass(ms(7.19), 0.5)];
  }
  process(L: Float64Array, R: Float64Array, len: number): void {
    for (let t = 0; t < len; t++) {
      let x = L[t];
      for (const a of this.l) x = a.tick(x);
      L[t] = x;
      let y = R[t];
      for (const a of this.r) y = a.tick(y);
      R[t] = y;
    }
  }
  reset(): void {
    for (const a of this.l) a.reset();
    for (const a of this.r) a.reset();
  }
}

/** Stereo-linked peak limiter with instant attack and smooth release, then soft clip. */
export class Limiter {
  private gain = 1;
  private rel: number;
  thr = 0.89;
  /** most recent gain reduction (linear), for metering */
  reduction = 1;
  constructor(fs: number) {
    this.rel = Math.exp(-1 / (0.18 * fs));
  }
  process(L: Float64Array, R: Float64Array, len: number): void {
    let g = this.gain;
    const thr = this.thr;
    const rel = this.rel;
    let minG = 1;
    for (let t = 0; t < len; t++) {
      const pk = Math.max(Math.abs(L[t]), Math.abs(R[t]));
      const target = pk > thr ? thr / pk : 1;
      if (target < g) g = target;
      else g = target + (g - target) * rel;
      if (g < minG) minG = g;
      L[t] = softClip(L[t] * g);
      R[t] = softClip(R[t] * g);
    }
    this.gain = g;
    this.reduction = minG;
  }
  reset(): void {
    this.gain = 1;
  }
}

function softClip(x: number): number {
  const a = x < 0 ? -x : x;
  if (a <= 0.95) return x;
  const y = 0.95 + 0.05 * Math.tanh((a - 0.95) / 0.05);
  return x < 0 ? -y : y;
}

export function buildEq(
  eq: [number, number, number][],
  tilt: [number, number],
  lid: number,
  fs: number,
): number[][] {
  const sections: number[][] = [];
  sections.push(biquadHighpass(22, 0.7, fs));
  sections.push(tiltSection(tilt[0], tilt[1], fs));
  for (const [f, g, q] of eq) if (Math.abs(g) > 0.01 && f < 0.45 * fs) sections.push(biquadPeaking(f, q, g, fs));
  // lid: closing it removes direct high frequencies and some presence
  const closed = 1 - lid;
  sections.push(biquadHighShelf(1800, -11 * closed, fs, 0.7));
  sections.push(biquadLowShelf(180, 1.5 * closed, fs, 0.7));
  return sections;
}
