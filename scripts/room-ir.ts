// Measure the listener-room stage (post.ts Room) from its impulse response.
//   npx tsx scripts/room-ir.ts [--post <path to post.ts>] [--room 0.22,0.35,0.6] [--wet 0.55]
// For each room setting: T60 per octave band (Schroeder backward integral, T20
// fit −5…−25 dB, ×3), early decay time, echo-density build-up (Abel & Huang's
// normalised echo density: time until it reaches 0.9), interaural cross-
// correlation (early 0–80 ms, late 80 ms+), direct-to-reverberant ratio, the
// fine-structure roughness of the tail spectrum (dB std around a ⅓-octave
// trend; a diffuse tail is ~5.6 dB, metallic ringing is higher) and CPU.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fft } from '../packages/engine/src/analysis/index.ts';
import { biquadBandpass } from '../packages/engine/src/core/filters.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const POST = resolve(opt('--post', join(import.meta.dirname, '../packages/engine/src/core/post.ts')));
const { Room } = (await import(pathToFileURL(POST).href)) as typeof import('../packages/engine/src/core/post.ts');
const FS = 48000;
const ROOMS = opt('--room', '0.22,0.35,0.6').split(',').map(Number);
const WETK = Number(opt('--wet', '0.55'));

function ir(room: number, seconds = 4): { L: Float64Array; R: Float64Array; cpuPct: number } {
  const r = new Room(FS);
  r.configure(room);
  const n = Math.round(seconds * FS);
  const L = new Float64Array(n);
  const R = new Float64Array(n);
  const bl = new Float64Array(128);
  const br = new Float64Array(128);
  const t0 = performance.now();
  for (let i = 0; i < n; i += 128) {
    bl.fill(0);
    br.fill(0);
    if (i === 0) {
      bl[0] = 1;
      br[0] = 1;
    }
    const len = Math.min(128, n - i);
    r.process(bl, br, len, 1, room * WETK);
    // keep only the room's contribution
    if (i === 0) {
      bl[0] -= 1;
      br[0] -= 1;
    }
    L.set(bl.subarray(0, len), i);
    R.set(br.subarray(0, len), i);
  }
  const ms = performance.now() - t0;
  return { L, R, cpuPct: (100 * ms) / (seconds * 1000) };
}

function bandFilter(x: Float64Array, fc: number): Float64Array {
  // two cascaded constant-skirt bandpass biquads, Q ≈ octave
  const y = Float64Array.from(x);
  for (let pass = 0; pass < 2; pass++) {
    const [b0, b1, b2, a1, a2] = biquadBandpass(fc, 1.41, FS);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < y.length; i++) {
      const xi = y[i];
      const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = xi;
      y2 = y1;
      y1 = yi;
      y[i] = yi;
    }
  }
  return y;
}

function schroederT(x: Float64Array, lo: number, hi: number): number {
  const e = new Float64Array(x.length);
  let acc = 0;
  for (let i = x.length - 1; i >= 0; i--) {
    acc += x[i] * x[i];
    e[i] = acc;
  }
  const db = (i: number) => 10 * Math.log10(e[i] / e[0] + 1e-30);
  let i0 = 0;
  while (i0 < x.length && db(i0) > lo) i0++;
  let i1 = i0;
  while (i1 < x.length && db(i1) > hi) i1++;
  if (i1 >= x.length - 1) return NaN;
  // least-squares slope between the two points
  let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
  for (let i = i0; i <= i1; i += 16) {
    const t = i / FS;
    const y = db(i);
    sx += t;
    sy += y;
    sxx += t * t;
    sxy += t * y;
    n++;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return -60 / slope;
}

function echoDensityT(x: Float64Array): number {
  // Abel & Huang 2006: fraction of samples beyond one standard deviation in a 20 ms window
  const W = Math.round(0.02 * FS);
  const norm = 0.3173;
  for (let c = W; c < x.length - W; c += Math.round(0.002 * FS)) {
    let s = 0;
    for (let i = c - W / 2; i < c + W / 2; i++) s += x[i] * x[i];
    const sd = Math.sqrt(s / W);
    let k = 0;
    for (let i = c - W / 2; i < c + W / 2; i++) if (Math.abs(x[i]) > sd) k++;
    if (k / W / norm >= 0.9) return c / FS;
  }
  return NaN;
}

function iacc(L: Float64Array, R: Float64Array, t0: number, t1: number): number {
  const a = Math.round(t0 * FS);
  const b = Math.min(L.length, Math.round(t1 * FS));
  let el = 0, er = 0;
  for (let i = a; i < b; i++) {
    el += L[i] * L[i];
    er += R[i] * R[i];
  }
  let best = 0;
  const lag = Math.round(0.001 * FS);
  for (let d = -lag; d <= lag; d++) {
    let s = 0;
    for (let i = Math.max(a, a - d); i < Math.min(b, b - d); i++) s += L[i] * R[i + d];
    best = Math.max(best, Math.abs(s) / Math.sqrt(el * er + 1e-30));
  }
  return best;
}

function roughness(x: Float64Array): number {
  // magnitude spectrum of 0.2–1.0 s of the tail, 200 Hz–4 kHz; dB deviation from a ⅓-octave moving average
  const a = Math.round(0.2 * FS);
  const N = 32768;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < N && a + i < x.length; i++) re[i] = x[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  fft(re, im);
  const mag = new Float64Array(N / 2);
  for (let k = 0; k < N / 2; k++) mag[k] = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-30);
  const binHz = FS / N;
  const dev: number[] = [];
  for (let k = Math.round(200 / binHz); k < Math.round(4000 / binHz); k++) {
    const f = k * binHz;
    const k0 = Math.round((f / 1.12) / binHz);
    const k1 = Math.round((f * 1.12) / binHz);
    let s = 0;
    for (let j = k0; j <= k1; j++) s += mag[j];
    dev.push(mag[k] - s / (k1 - k0 + 1));
  }
  const m = dev.reduce((p, q) => p + q, 0) / dev.length;
  return Math.sqrt(dev.reduce((p, q) => p + (q - m) * (q - m), 0) / dev.length);
}

const BANDS = [125, 250, 500, 1000, 2000, 4000, 8000];
for (const room of ROOMS) {
  ir(room, 2); // warm up the JIT
  const { L, R, cpuPct } = ir(room, 8);
  const M = L.map((v, i) => 0.5 * (v + R[i]));
  const t60 = BANDS.map((f) => schroederT(bandFilter(M, f), -5, -25));
  const edt = schroederT(bandFilter(M, 1000), 0, -10) ;
  let e = 0;
  for (let i = 0; i < M.length; i++) e += L[i] * L[i] + R[i] * R[i];
  const drr = 10 * Math.log10(2 / e); // direct = unit impulse in each channel
  const fmt = (x: number, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '–');
  console.log(
    JSON.stringify({
      room,
      t60: Object.fromEntries(BANDS.map((f, i) => [f, +fmt(t60[i])])),
      edt1k: +fmt(edt),
      echoDensity90ms: +fmt(echoDensityT(M) * 1000, 0),
      iaccEarly: +fmt(iacc(L, R, 0, 0.08)),
      iaccLate: +fmt(iacc(L, R, 0.08, 1.5)),
      drrDb: +fmt(drr, 1),
      tailRoughnessDb: +fmt(roughness(M), 2),
      cpuPctOfCore: +fmt(cpuPct, 3),
    }),
  );
}
