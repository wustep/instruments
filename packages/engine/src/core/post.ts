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

/**
 * The listening room (round 3): a hall heard from a few metres away.
 *
 * Early reflections come from an image-source model of a shoebox room (Allen &
 * Berkley 1979): the six first-order and eighteen second-order images, each with its
 * own delay to each of two microphones 0.3 m apart, 1/r spreading, wall reflection
 * loss and more high-frequency absorption per bounce. The late reverberation is a
 * 16-line feedback delay network (Jot & Chaigne 1991) with a Hadamard mixing matrix,
 * input diffusion, slow delay modulation against metallic ringing, and a per-line
 * absorption filter that gives the bass a longer and the treble a shorter decay, as
 * in a real hall. It is still the listener's side, not part of the instrument.
 */
export class Room {
  private fs: number;
  // ---- early reflections (mono source, stereo microphones)
  private erBuf: Float64Array;
  private erI = 0;
  /** early reflections: integer delays and gains per microphone, split by reflection order */
  private erD1L = new Int32Array(0);
  private erD1R = new Int32Array(0);
  private erG1L = new Float64Array(0);
  private erG1R = new Float64Array(0);
  private erD2L = new Int32Array(0);
  private erD2R = new Int32Array(0);
  private erG2L = new Float64Array(0);
  private erG2R = new Float64Array(0);
  private erLp = new Float64Array(4); // [order1 L, order1 R, order2 L, order2 R]
  private erK = [0, 0];
  // ---- late FDN
  private static readonly N = 16;
  private lines: Float64Array[] = [];
  private wi = new Int32Array(16);
  private len = new Float64Array(16);
  private gMid = new Float64Array(16);
  /** low-shelf gain minus one (bass decays longer) */
  private shelfK1 = new Float64Array(16);
  private hfP = new Float64Array(16);
  private lpLow = new Float64Array(16);
  private lpHi = new Float64Array(16);
  private lowA: number;
  private modPh = new Float64Array(16);
  private modRate = new Float64Array(16);
  private o = new Float64Array(16);
  private pre: Float64Array;
  private preI = 0;
  private preLen = 1;
  private dBuf: Float64Array[] = [];
  private dIdx = new Int32Array(6);
  private dG = new Float64Array(6);
  private erMix = 0.5;
  private lateG = 1.95;
  size = 1;
  t60 = 1.5;
  constructor(fs: number) {
    this.fs = fs;
    this.erBuf = new Float64Array(Math.ceil(0.16 * fs) + 4);
    for (let i = 0; i < Room.N; i++) {
      this.lines.push(new Float64Array(Math.ceil((BASE_MS[i] * 1.05 * fs) / 1000) + 32));
      this.modPh[i] = (i * 2.399) % (2 * Math.PI);
      this.modRate[i] = (2 * Math.PI * (0.13 + 0.061 * ((i * 7) % 16))) / fs;
    }
    this.pre = new Float64Array(Math.ceil(0.06 * fs));
    this.dBuf = [1.07, 1.73, 2.69, 3.91, 5.63, 7.97].map((ms) => new Float64Array(Math.round((ms * fs) / 1000)));
    this.dG.set([0.75, 0.72, 0.7, 0.66, 0.62, 0.58]);
    this.lowA = Math.exp((-2 * Math.PI * 260) / fs);
    this.configure(0.25);
  }

  configure(room: number): void {
    const fs = this.fs;
    this.size = 0.55 + 0.45 * room;
    this.t60 = 0.7 + 1.7 * room;
    // hall-like decay: bass ratio ~1.2, 4 kHz ~0.7 and 8 kHz ~0.5 of the mid value
    const tLow = this.t60 * 1.2;
    const tNyq = this.t60 * 0.3;
    for (let i = 0; i < Room.N; i++) {
      const L = Math.min(this.lines[i].length - 24, (BASE_MS[i] * this.size * fs) / 1000);
      this.len[i] = L;
      const sec = L / fs;
      const gm = Math.pow(10, (-3 * sec) / this.t60);
      const gl = Math.pow(10, (-3 * sec) / tLow);
      const gh = Math.pow(10, (-3 * sec) / tNyq);
      this.gMid[i] = gm;
      this.shelfK1[i] = gl / gm - 1;
      const r = gh / gm;
      this.hfP[i] = (1 - r) / (1 + r);
      void r;
    }
    this.preLen = Math.max(1, Math.min(this.pre.length - 1, Math.round((0.012 + 0.02 * room) * fs)));
    // ---- image sources: a shoebox hall, source on the stage, microphones a few metres out
    const Lx = 26 * this.size;
    const Ly = 18 * this.size;
    const Lz = 11 * this.size;
    const src = [Lx * 0.5, Ly * 0.22, 1.2];
    // a near-coincident pair of cardioids 0.6 m apart, angled ±50° to the stage
    const micL = [Lx * 0.5 - 0.3, Ly * 0.22 + 3.2, 1.6];
    const micR = [Lx * 0.5 + 0.3, Ly * 0.22 + 3.2, 1.6];
    const axL = [-Math.sin(0.87), -Math.cos(0.87), 0];
    const axR = [Math.sin(0.87), -Math.cos(0.87), 0];
    const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const cardioid = (mic: number[], ax: number[], p: number[]) => {
      const v = [p[0] - mic[0], p[1] - mic[1], p[2] - mic[2]];
      const n = Math.hypot(v[0], v[1], v[2]) || 1;
      return 0.5 + (0.5 * (v[0] * ax[0] + v[1] * ax[1] + v[2] * ax[2])) / n;
    };
    const d0 = dist(src, micL);
    const g0 = cardioid(micL, axL, src);
    const Rw = 0.88; // pressure reflection coefficient of the walls
    const c = 343;
    const t1: number[][] = [];
    const t2: number[][] = [];
    const img = (k: number, L: number, s: number) => (k % 2 === 0 ? k * L + s : (k + 1) * L - s);
    const maxD = this.erBuf.length - 2;
    for (let nx = -2; nx <= 2; nx++)
      for (let ny = -2; ny <= 2; ny++)
        for (let nz = -2; nz <= 2; nz++) {
          const order = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
          if (order === 0 || order > 2) continue;
          const p = [img(nx, Lx, src[0]), img(ny, Ly, src[1]), img(nz, Lz, src[2])];
          const dl = Math.round(((dist(p, micL) - d0) / c) * fs);
          const dr = Math.round(((dist(p, micR) - d0) / c) * fs);
          if (dl <= 0 || dr <= 0 || dl > maxD || dr > maxD) continue;
          const g = Math.pow(Rw, order) / g0;
          (order === 1 ? t1 : t2).push([dl, dr, (g * cardioid(micL, axL, p) * d0) / dist(p, micL), (g * cardioid(micR, axR, p) * d0) / dist(p, micR)]);
        }
    this.erD1L = Int32Array.from(t1.map((t) => t[0]));
    this.erD1R = Int32Array.from(t1.map((t) => t[1]));
    this.erG1L = Float64Array.from(t1.map((t) => t[2]));
    this.erG1R = Float64Array.from(t1.map((t) => t[3]));
    this.erD2L = Int32Array.from(t2.map((t) => t[0]));
    this.erD2R = Int32Array.from(t2.map((t) => t[1]));
    this.erG2L = Float64Array.from(t2.map((t) => t[2]));
    this.erG2R = Float64Array.from(t2.map((t) => t[3]));
    // more HF absorption per bounce (walls + air)
    this.erK = [Math.exp((-2 * Math.PI * 7000) / fs), Math.exp((-2 * Math.PI * 4200) / fs)];
    this.erMix = 1.1;
  }

  reset(): void {
    for (const l of this.lines) l.fill(0);
    this.lpLow.fill(0);
    this.lpHi.fill(0);
    this.pre.fill(0);
    this.erBuf.fill(0);
    this.erLp.fill(0);
    for (const d of this.dBuf) d.fill(0);
  }

  /** Adds the room's sound (early reflections and late reverberation) into L/R, in place. */
  process(L: Float64Array, R: Float64Array, len: number, send: number, wet: number): void {
    if (wet <= 0 && send <= 0) return;
    const N = Room.N;
    const o = this.o;
    for (let i = 0; i < N; i++) {
      if (Math.abs(this.lpHi[i]) < 1e-25) this.lpHi[i] = 0;
      if (Math.abs(this.lpLow[i]) < 1e-25) this.lpLow[i] = 0;
    }
    const lines = this.lines;
    const erBuf = this.erBuf;
    const eN = erBuf.length;
    const d1L = this.erD1L, d1R = this.erD1R, g1L = this.erG1L, g1R = this.erG1R;
    const d2L = this.erD2L, d2R = this.erD2R, g2L = this.erG2L, g2R = this.erG2R;
    const [k1, k2] = this.erK;
    const lowA = this.lowA;
    // delay modulation: ±0.17 ms, a different slow rate per line; updated once per block
    const dl = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      this.modPh[i] += this.modRate[i] * len;
      dl[i] = this.len[i] + 8 * Math.sin(this.modPh[i]);
    }
    const lateG = this.lateG;
    const wi = this.wi, gMid = this.gMid, lpLow = this.lpLow, lpHi = this.lpHi, hfP = this.hfP;
    const shelfK1 = this.shelfK1, dBuf = this.dBuf, dIdx = this.dIdx, dG = this.dG;
    const erG = this.erMix;
    for (let t = 0; t < len; t++) {
      const x = (L[t] + R[t]) * 0.5 * send;
      // ---- early reflections
      erBuf[this.erI] = x;
      const w = this.erI;
      let e1L = 0, e1R = 0, e2L = 0, e2R = 0;
      for (let j = 0; j < d1L.length; j++) {
        let a = w - d1L[j];
        if (a < 0) a += eN;
        let b = w - d1R[j];
        if (b < 0) b += eN;
        e1L += g1L[j] * erBuf[a];
        e1R += g1R[j] * erBuf[b];
      }
      for (let j = 0; j < d2L.length; j++) {
        let a = w - d2L[j];
        if (a < 0) a += eN;
        let b = w - d2R[j];
        if (b < 0) b += eN;
        e2L += g2L[j] * erBuf[a];
        e2R += g2R[j] * erBuf[b];
      }
      this.erI = this.erI + 1 === eN ? 0 : this.erI + 1;
      const lp = this.erLp;
      lp[0] = e1L + k1 * (lp[0] - e1L);
      lp[1] = e1R + k1 * (lp[1] - e1R);
      lp[2] = e2L + k2 * (lp[2] - e2L);
      lp[3] = e2R + k2 * (lp[3] - e2R);
      const erL = lp[0] + lp[2];
      const erR = lp[1] + lp[3];
      // ---- late: predelay, input diffusion
      const pre = this.pre;
      const pi = this.preI;
      let ri = pi - this.preLen;
      if (ri < 0) ri += pre.length;
      let d = pre[ri];
      pre[pi] = x + 0.3 * (erL + erR);
      this.preI = pi + 1 === pre.length ? 0 : pi + 1;
      for (let k = 0; k < 6; k++) {
        const buf = dBuf[k];
        const ii = dIdx[k];
        const g = dG[k];
        const z = buf[ii];
        const v = d + g * z;
        buf[ii] = v;
        dIdx[k] = ii + 1 === buf.length ? 0 : ii + 1;
        d = z - g * v;
      }
      // read lines (modulated, interpolated), absorb
      for (let i = 0; i < N; i++) {
        const line = lines[i];
        const ln = line.length;
        let p = wi[i] - dl[i];
        if (p < 0) p += ln;
        const i0 = p | 0;
        const fr = p - i0;
        const a0 = line[i0];
        let v = (a0 + fr * (line[i0 + 1 < ln ? i0 + 1 : 0] - a0)) * gMid[i];
        // low shelf: longer bass decay
        const lo = v + lowA * (lpLow[i] - v);
        lpLow[i] = lo;
        v += shelfK1[i] * lo;
        // one-pole high-frequency absorption
        const hp = hfP[i];
        const hv = v + hp * (lpHi[i] - v);
        lpHi[i] = hv;
        o[i] = hv;
      }
      // decorrelated stereo taps
      const outL = (o[0] - o[1] + o[2] + o[3] - o[4] + o[5] - o[6] + o[7] + o[8] + o[9] - o[10] - o[11] + o[12] - o[13] + o[14] - o[15]) * 0.25;
      const outR = (o[0] + o[1] - o[2] + o[3] + o[4] - o[5] - o[6] - o[7] + o[8] - o[9] + o[10] - o[11] - o[12] - o[13] + o[14] + o[15]) * 0.25;
      // 16-point fast Walsh–Hadamard (normalised by 1/4 when written back)
      hadamard16(o);
      for (let i = 0; i < N; i++) {
        const line = lines[i];
        const w0 = wi[i];
        line[w0] = o[i] * 0.25 + (i & 1 ? -d : d) * 0.5;
        wi[i] = w0 + 1 === line.length ? 0 : w0 + 1;
      }
      L[t] += wet * (erG * erL + lateG * outL);
      R[t] += wet * (erG * erR + lateG * outR);
    }
  }
}
function hadamard16(o: Float64Array): void {
  for (let h = 1; h < 16; h <<= 1)
    for (let i = 0; i < 16; i += h << 1)
      for (let j = i; j < i + h; j++) {
        const a = o[j];
        const b = o[j + h];
        o[j] = a + b;
        o[j + h] = a - b;
      }
}
// late-line delays (ms at size 1): mutually incommensurate, 31–98 ms
const BASE_MS = [31.3, 34.7, 37.9, 41.3, 44.9, 47.3, 51.1, 53.9, 58.7, 62.3, 67.1, 71.9, 76.7, 82.3, 89.9, 97.7];

/**
 * The high-frequency board path's diffusion (decorrelated L/R): the board above its modal range is a
 * dense field of heavily damped modes, so its response to a force at the bridge is a direct part
 * plus a short, smooth, noise-like decay. Modelled as exponentially decaying velvet noise (sparse
 * random ±1 taps, ~2500 per second, Järveläinen & Karjalainen 2007; Alary et al. 2017), energy-
 * normalised like an allpass. Until round 3 this was a chain of four Schroeder allpasses: on every
 * impulsive input (the hammer's strike and the action's contact tick) each recirculated at its own
 * fixed period, a 40 ms metallic ring at key-down.
 */
export class Diffuser {
  private ring: Float64Array[];
  private mask: number;
  private w = 0;
  private taps: { d: Int32Array; g: Float64Array }[];
  constructor(fs: number, t60 = 0.03, density = 2500, direct = 0.6) {
    const len = Math.ceil(t60 * fs);
    let n = 1;
    while (n < len + 4096) n *= 2;
    this.mask = n - 1;
    this.ring = [new Float64Array(n), new Float64Array(n)];
    const tau = t60 / Math.log(1000);
    this.taps = [0x51ed27, 0x2f6b1d].map((seed) => {
      let s = seed >>> 0;
      const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      const grid = fs / density;
      const d: number[] = [0];
      const g: number[] = [direct];
      for (let m = 1; m * grid < len; m++) {
        const pos = Math.round(m * grid + rnd() * (grid - 1));
        d.push(pos);
        g.push((rnd() < 0.5 ? -1 : 1) * Math.exp(-pos / fs / tau));
      }
      // the tail carries 1 - direct² of the energy
      let e = 0;
      for (let i = 1; i < g.length; i++) e += g[i] * g[i];
      const k = Math.sqrt((1 - direct * direct) / e);
      for (let i = 1; i < g.length; i++) g[i] *= k;
      return { d: Int32Array.from(d), g: Float64Array.from(g) };
    });
  }
  process(L: Float64Array, R: Float64Array, len: number): void {
    const mask = this.mask;
    const w = this.w;
    for (let c = 0; c < 2; c++) {
      const x = c === 0 ? L : R;
      const ring = this.ring[c];
      for (let t = 0; t < len; t++) ring[(w + t) & mask] = x[t];
      const { d, g } = this.taps[c];
      for (let t = 0; t < len; t++) x[t] = 0;
      for (let i = 0; i < d.length; i++) {
        const gi = g[i];
        const o = w - d[i];
        for (let t = 0; t < len; t++) x[t] += gi * ring[(o + t) & mask];
      }
    }
    this.w = (w + len) & mask;
  }
  reset(): void {
    this.ring[0].fill(0);
    this.ring[1].fill(0);
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
