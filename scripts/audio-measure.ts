// Measurements for the audio audit (scripts/audio-audit.ts): loudness (ITU-R BS.1770-4), clicks
// against their surroundings, aliases at the frequencies a sampled nonlinearity folds its harmonics
// to, and the limiter's work. Analysis only: nothing here changes a sound.
import { fft, makeWindow } from '../packages/engine/src/analysis/index.ts';

const db = (x: number) => 20 * Math.log10(Math.max(1e-12, x));

/** A biquad (direct form I), run over a whole signal */
function biquad(x: Float32Array | Float64Array, c: number[]): Float64Array {
  const [b0, b1, b2, a1, a2] = c;
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
}

/** BS.1770 K-weighting at any rate (the two stages' analogue prototypes, as pyloudnorm designs them) */
export function kWeight(x: Float32Array, fs: number): Float64Array {
  // stage 1: a high shelf, +4 dB above ~1.7 kHz
  {
    var G = 3.99984385397, Q = 0.7071752369554193, fc = 1681.974450955533;
    var K = Math.tan((Math.PI * fc) / fs), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.499666774155);
    var a0 = 1 + K / Q + K * K;
    var s1 = [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  }
  // stage 2: the RLB high-pass at 38 Hz
  const Q2 = 0.5003270373238773, f2 = 38.13547087613982;
  const K2 = Math.tan((Math.PI * f2) / fs);
  const d = 1 + K2 / Q2 + K2 * K2;
  const s2 = [1 / d, -2 / d, 1 / d, (2 * (K2 * K2 - 1)) / d, (1 - K2 / Q2 + K2 * K2) / d];
  return biquad(biquad(x, s1), s2);
}

/** Integrated loudness (LUFS) of a stereo signal, gated (BS.1770-4); -Infinity for silence */
export function lufs(L: Float32Array, R: Float32Array, fs: number): number {
  const kl = kWeight(L, fs), kr = kWeight(R, fs);
  const blk = Math.round(0.4 * fs), hop = Math.round(0.1 * fs);
  const z: number[] = [];
  for (let a = 0; a + blk <= kl.length; a += hop) {
    let s = 0;
    for (let i = a; i < a + blk; i++) s += kl[i] * kl[i] + kr[i] * kr[i];
    z.push(s / blk);
  }
  const ld = (p: number) => -0.691 + 10 * Math.log10(p + 1e-30);
  const abs = z.filter((p) => ld(p) > -70);
  if (!abs.length) return -Infinity;
  const rel = ld(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter((p) => ld(p) > rel);
  return ld(g.reduce((a, b) => a + b, 0) / g.length);
}

/** Short-term (3 s window) loudness's maximum, LUFS */
export function lufsMaxShort(L: Float32Array, R: Float32Array, fs: number): number {
  const kl = kWeight(L, fs), kr = kWeight(R, fs);
  const blk = Math.min(kl.length, Math.round(3 * fs)), hop = Math.round(0.1 * fs);
  let best = -Infinity;
  let s = 0;
  for (let i = 0; i < blk; i++) s += kl[i] * kl[i] + kr[i] * kr[i];
  for (let a = 0; ; a += hop) {
    best = Math.max(best, -0.691 + 10 * Math.log10(s / blk + 1e-30));
    if (a + hop + blk > kl.length) break;
    for (let i = a; i < a + hop; i++) s -= kl[i] * kl[i] + kr[i] * kr[i];
    for (let i = a + blk; i < a + blk + hop; i++) s += kl[i] * kl[i] + kr[i] * kr[i];
  }
  return best;
}

export interface Click {
  /** seconds */
  t: number;
  /** the high band's peak in the click, dBFS */
  hfDb: number;
  /** how far it stands above its surroundings (the 98th percentile of ±60 ms), dB */
  riseDb: number;
  /** the broadband level around it (RMS of ±20 ms), dBFS */
  aroundDb: number;
  /** the nearest note event and how long after it (ms; negative: before) */
  near: string;
  dtMs: number;
  /** 'on', 'off' (within -1…+25 ms of one) or 'mid' (no note event: crackle) */
  kind: 'on' | 'off' | 'mid';
}

/**
 * Clicks: a short burst in the high band (a 4th-order Butterworth high-pass at 6 kHz, or a quarter
 * of the rate) that stands `minRise` dB above the median of its surroundings. A discontinuity in
 * the waveform (a voice cut, a jumped delay, a stepped gain) puts its energy across the whole band,
 * so the high band shows it even under loud low notes; the instruments' own high partials and
 * pulses set the floor. Frames of 1 ms; the floor is the 98th percentile of ±60 ms (±3 ms left out):
 * a bowed string's slip, a reed's or the lips' closing is a pulse every period, as high as a click,
 * so a median would flag every one of them; the 98th percentile (the third-highest frame) is the
 * pulses' own level down to a 36 ms period (A0, 27.5 Hz).
 */
export function clicks(
  L: Float32Array,
  R: Float32Array,
  fs: number,
  events: { t: number; type: string; midi?: number }[],
  o: { minRise?: number; minDb?: number; fc?: number } = {},
): Click[] {
  const minRise = o.minRise ?? 10, minDb = o.minDb ?? -66;
  const fc = Math.min(o.fc ?? 6000, 0.25 * fs);
  const hp = (q: number) => {
    const w = Math.tan((Math.PI * fc) / fs);
    const d = 1 + w / q + w * w;
    return [1 / d, -2 / d, 1 / d, (2 * (w * w - 1)) / d, (1 - w / q + w * w) / d];
  };
  // a 4th-order Butterworth: two sections, Q 0.5412 and 1.3066
  const band = [L, R].map((x) => biquad(biquad(x, hp(0.5412)), hp(1.3066)));
  const F = Math.round(fs / 1000);
  const nF = Math.floor(L.length / F);
  const e = new Float64Array(nF);
  for (let j = 0; j < nF; j++) {
    let m = 0;
    for (const b of band) for (let i = j * F; i < (j + 1) * F; i++) m = Math.max(m, Math.abs(b[i]));
    e[j] = m;
  }
  const W = 60, G = 3;
  const out: Click[] = [];
  const tmp: number[] = [];
  let j = 0;
  while (j < nF) {
    tmp.length = 0;
    for (let k = Math.max(0, j - W); k <= Math.min(nF - 1, j + W); k++) if (Math.abs(k - j) > G) tmp.push(e[k]);
    tmp.sort((a, b) => a - b);
    const med = tmp.length ? tmp[Math.floor(0.98 * (tmp.length - 1))] : 0;
    const rise = db(e[j]) - db(Math.max(med, 1e-7));
    if (rise >= minRise && db(e[j]) >= minDb) {
      // the whole burst: frames while it stays above the floor by half the rise
      let k = j, pk = j;
      while (k + 1 < nF && db(e[k + 1]) - db(Math.max(med, 1e-7)) >= minRise / 2) {
        k++;
        if (e[k] > e[pk]) pk = k;
      }
      const t = (pk + 0.5) / 1000;
      let s = 0, n = 0;
      for (let i = Math.max(0, Math.round((t - 0.02) * fs)); i < Math.min(L.length, Math.round((t + 0.02) * fs)); i++) {
        s += 0.5 * (L[i] * L[i] + R[i] * R[i]);
        n++;
      }
      let near = '', dt = Infinity, kind: Click['kind'] = 'mid';
      for (const ev of events) {
        const d = (t - ev.t) * 1000;
        if (Math.abs(d) < Math.abs(dt)) {
          dt = d;
          near = `${ev.type}${ev.midi !== undefined ? ' ' + ev.midi : ''}`;
        }
        if (d >= -1 && d <= 25 && (ev.type === 'noteOn' || ev.type === 'noteOff')) kind = kind === 'mid' || ev.type === 'noteOff' ? (ev.type === 'noteOn' ? 'on' : 'off') : kind;
      }
      out.push({ t: +t.toFixed(4), hfDb: +db(e[pk]).toFixed(1), riseDb: +(db(e[pk]) - db(Math.max(med, 1e-7))).toFixed(1), aroundDb: +(10 * Math.log10(s / Math.max(1, n) + 1e-24)).toFixed(1), near, dtMs: +dt.toFixed(1), kind });
      j = k + 1;
    } else j++;
  }
  return out;
}

/**
 * Aliases: a nonlinearity run at the sample rate makes harmonics above Nyquist, which fold back to
 * |k·f0 − m·fs|. For a steady stretch of one note, the strongest folded component that lands clear of
 * every true harmonic (and above 200 Hz), in dB relative to the strongest harmonic, and how far it
 * stands above the spectrum's local floor. A clean core shows nothing there (the floor).
 */
export function aliases(x: Float32Array, fs: number, f0: number, t0: number, dur: number): { worstDb: number; atHz: number; overFloorDb: number; harmonicsAboveNyq: number } {
  const a = Math.round(t0 * fs);
  let n = 1;
  while (n * 2 <= Math.round(dur * fs)) n *= 2;
  const w = makeWindow(n, 'blackman-harris');
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (x[a + i] ?? 0) * w[i];
  fft(re, im);
  const mag = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  const bin = fs / n;
  // the true f0 (a few cents off nominal): the strongest peak within ±40 cents of each low harmonic
  const peakNear = (f: number, rel: number) => {
    let best = 0, bk = 0;
    for (let k = Math.max(1, Math.floor((f * (1 - rel)) / bin)); k <= Math.min(n / 2 - 1, Math.ceil((f * (1 + rel)) / bin)); k++)
      if (mag[k] > best) {
        best = mag[k];
        bk = k;
      }
    return { best, bk };
  };
  const p1 = peakNear(f0, 0.024);
  const fTrue = p1.bk ? p1.bk * bin : f0;
  let top = 0;
  for (let h = 1; h * fTrue < fs / 2; h++) top = Math.max(top, peakNear(h * fTrue, 0.004 + 2 / h / 100).best);
  const guard = Math.max(4 * bin, 0.02 * fTrue);
  const nearHarm = (f: number) => {
    const r = f / fTrue;
    return Math.abs(r - Math.round(r)) * fTrue < guard;
  };
  let worst = -Infinity, at = 0, over = 0, above = 0;
  for (let h = 1; h * fTrue < 4 * fs; h++) {
    const f = h * fTrue;
    if (f < fs / 2) continue;
    above++;
    // fold
    let fa = f % fs;
    if (fa > fs / 2) fa = fs - fa;
    if (fa < 200 || fa > 0.45 * fs || nearHarm(fa)) continue;
    const { best, bk } = peakNear(fa, 0.0015);
    if (!bk) continue;
    // the local floor: the median of ±60 bins around, the peak's own ±4 left out
    const fl: number[] = [];
    for (let k = Math.max(1, bk - 60); k < Math.min(n / 2, bk + 60); k++) if (Math.abs(k - bk) > 4) fl.push(mag[k]);
    fl.sort((p, q) => p - q);
    const floor = fl[fl.length >> 1] ?? 1e-12;
    const lv = db(best) - db(top);
    const ov = db(best) - db(floor);
    if (ov >= 10 && lv > worst) {
      worst = lv;
      at = fa;
      over = ov;
    }
  }
  return { worstDb: +worst.toFixed(1), atHz: Math.round(at), overFloorDb: +over.toFixed(1), harmonicsAboveNyq: above };
}

/** Energy between the harmonics below `fMax` relative to that on them (dB): a noisy or aliased tone
 *  rises; a clean periodic tone sits low. */
export function inharmonicDb(x: Float32Array, fs: number, f0: number, t0: number, dur: number, fMax = 16000): number {
  const a = Math.round(t0 * fs);
  let n = 1;
  while (n * 2 <= Math.round(dur * fs)) n *= 2;
  const w = makeWindow(n, 'blackman-harris');
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (x[a + i] ?? 0) * w[i];
  fft(re, im);
  const bin = fs / n;
  let on = 0, off = 0;
  // the true f0
  let best = 0, bk = 0;
  for (let k = Math.floor((f0 * 0.976) / bin); k <= Math.ceil((f0 * 1.024) / bin); k++) {
    const m = re[k] * re[k] + im[k] * im[k];
    if (m > best) {
      best = m;
      bk = k;
    }
  }
  const f = bk * bin || f0;
  const guard = Math.max(5 * bin, 0.03 * f);
  for (let k = Math.round(0.5 * f / bin); k < Math.min(n / 2, fMax / bin); k++) {
    const p = re[k] * re[k] + im[k] * im[k];
    const r = (k * bin) / f;
    if (Math.abs(r - Math.round(r)) * f < guard) on += p;
    else off += p;
  }
  return +(10 * Math.log10((off + 1e-30) / (on + 1e-30))).toFixed(1);
}

export function peakDb(L: Float32Array, R: Float32Array): number {
  let p = 0;
  for (let i = 0; i < L.length; i++) p = Math.max(p, Math.abs(L[i]), Math.abs(R[i]));
  return +db(p).toFixed(2);
}

export function nonFinite(L: Float32Array, R: Float32Array): number {
  let n = 0;
  for (let i = 0; i < L.length; i++) if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) n++;
  return n;
}

/** The DC (mean) of the last stretch of a render after everything has ended, dBFS */
export function tailDc(L: Float32Array, R: Float32Array, fs: number, sec = 0.2): number {
  const a = Math.max(0, L.length - Math.round(sec * fs));
  let s = 0;
  for (let i = a; i < L.length; i++) s += 0.5 * (L[i] + R[i]);
  return +db(Math.abs(s / Math.max(1, L.length - a))).toFixed(1);
}

/**
 * Discontinuities at note events: the largest one-sample step |x[i] − x[i−1]| within −0.2…+0.3 ms of
 * each event (a core's blocks are cut at events: what it switches there lands on the event's own
 * sample; the attack's first pulses come later), over the 99th percentile of the steps in the 50 ms before it
 * and the 50 ms after (the event's ±2 ms left out). A tone's steepest steps are its own; an
 * instrument's attack reaches the output through its bore, string or hammer felt over milliseconds,
 * so a ratio well above 1 is a jump the model put there in one sample (a filter's coefficients
 * switched, a gain stepped). Returns the worst events.
 */
export function jumps(L: Float32Array, R: Float32Array, fs: number, events: { t: number; type: string; midi?: number }[]): { t: number; ratio: number; stepDb: number; near: string }[] {
  const out: { t: number; ratio: number; stepDb: number; near: string }[] = [];
  const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))] ?? 0;
  for (const e of events) {
    if (e.type !== 'noteOn' && e.type !== 'noteOff' && e.type !== 'control') continue;
    const c = Math.round(e.t * fs);
    let worst = 0;
    for (const x of [L, R])
      for (let i = Math.max(1, c - Math.round(0.0002 * fs)); i < Math.min(x.length, c + Math.round(0.0003 * fs)); i++) worst = Math.max(worst, Math.abs(x[i] - x[i - 1]));
    const around: number[] = [];
    const g = Math.round(0.002 * fs), w = Math.round(0.05 * fs);
    for (const x of [L, R])
      for (let i = Math.max(1, c - w); i < Math.min(x.length, c + w); i++) if (Math.abs(i - c) > g) around.push(Math.abs(x[i] - x[i - 1]));
    const ref = q(around, 0.99);
    if (worst < 1e-5) continue;
    out.push({ t: +e.t.toFixed(4), ratio: +(worst / Math.max(ref, 1e-6)).toFixed(2), stepDb: +(20 * Math.log10(worst)).toFixed(1), near: `${e.type}${e.midi !== undefined ? ' ' + e.midi : ''}` });
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}
