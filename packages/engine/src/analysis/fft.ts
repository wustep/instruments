// Radix-2 complex FFT (in place) and windowed magnitude spectra.

export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export type WindowKind = 'hann' | 'blackman-harris';

export function makeWindow(n: number, kind: WindowKind = 'blackman-harris'): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = (2 * Math.PI * i) / (n - 1);
    w[i] =
      kind === 'hann'
        ? 0.5 - 0.5 * Math.cos(x)
        : 0.35875 - 0.48829 * Math.cos(x) + 0.14128 * Math.cos(2 * x) - 0.01168 * Math.cos(3 * x);
  }
  return w;
}

export interface Spectrum {
  /** linear magnitude, bins 0..nfft/2 */
  mag: Float64Array;
  binHz: number;
  nfft: number;
}

/**
 * Magnitude spectrum of x[start, start+len) with window and zero-padding to nfft.
 * Magnitudes are normalised so a full-scale sinusoid reads ~1.
 */
export function spectrum(
  x: ArrayLike<number>,
  fs: number,
  start: number,
  len: number,
  nfft: number,
  kind: WindowKind = 'blackman-harris',
): Spectrum {
  const re = new Float64Array(nfft);
  const im = new Float64Array(nfft);
  const w = makeWindow(len, kind);
  let wsum = 0;
  for (let i = 0; i < len; i++) {
    const s = start + i < x.length ? x[start + i] : 0;
    re[i] = s * w[i];
    wsum += w[i];
  }
  fft(re, im);
  const half = nfft / 2;
  const mag = new Float64Array(half + 1);
  const norm = 2 / wsum;
  for (let i = 0; i <= half; i++) mag[i] = Math.hypot(re[i], im[i]) * norm;
  return { mag, binHz: fs / nfft, nfft };
}

/** Parabolic interpolation of a peak on log magnitude. Returns [freqHz, linearMag]. */
export function refinePeak(sp: Spectrum, bin: number): [number, number] {
  const m = sp.mag;
  if (bin <= 0 || bin >= m.length - 1) return [bin * sp.binHz, m[bin]];
  const a = Math.log(m[bin - 1] + 1e-30);
  const b = Math.log(m[bin] + 1e-30);
  const c = Math.log(m[bin + 1] + 1e-30);
  const den = a - 2 * b + c;
  const p = den === 0 ? 0 : (0.5 * (a - c)) / den;
  const peak = Math.exp(b - 0.25 * (a - c) * p);
  return [(bin + p) * sp.binHz, peak];
}

/** Largest local maximum within [fLo, fHi]. */
export function peakIn(sp: Spectrum, fLo: number, fHi: number): { f: number; mag: number; bin: number } | null {
  const lo = Math.max(1, Math.floor(fLo / sp.binHz));
  const hi = Math.min(sp.mag.length - 2, Math.ceil(fHi / sp.binHz));
  let best = -1;
  let bm = 0;
  for (let i = lo; i <= hi; i++) {
    const v = sp.mag[i];
    if (v > bm && v >= sp.mag[i - 1] && v >= sp.mag[i + 1]) {
      bm = v;
      best = i;
    }
  }
  if (best < 0) return null;
  const [f, mag] = refinePeak(sp, best);
  return { f, mag, bin: best };
}
