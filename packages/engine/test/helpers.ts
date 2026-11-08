import { PianoCore, type CoreOptions, type PianoEvent } from '../src/core/index.ts';
import { spectrum, peakIn } from '../src/analysis/index.ts';

export const FS = 48000;

/** Render with a core, returning mono (L+R)/2 and the core for inspection. */
export function render(
  events: { t: number; e: PianoEvent }[],
  seconds: number,
  opts: Partial<CoreOptions> = {},
  core?: PianoCore,
): { x: Float32Array; L: Float32Array; R: Float32Array; core: PianoCore } {
  const c = core ?? new PianoCore({ sampleRate: FS, dry: true, ...opts });
  const base = c.frame;
  for (const ev of events) c.schedule(ev.e, base + Math.round(ev.t * FS));
  const n = Math.round(seconds * FS);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const bl = new Float32Array(128);
  const br = new Float32Array(128);
  for (let i = 0; i < n; i += 128) {
    const len = Math.min(128, n - i);
    c.process(bl, br, len);
    L.set(bl.subarray(0, len), i);
    R.set(br.subarray(0, len), i);
  }
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.5 * (L[i] + R[i]);
  return { x, L, R, core: c };
}

export const on = (t: number, midi: number, velocity = 80): { t: number; e: PianoEvent } => ({ t, e: { type: 'noteOn', midi, velocity } });
export const off = (t: number, midi: number): { t: number; e: PianoEvent } => ({ t, e: { type: 'noteOff', midi } });
export const ped = (t: number, value: number): { t: number; e: PianoEvent } => ({ t, e: { type: 'sustain', value } });

export function rmsDb(x: Float32Array, t0: number, t1: number): number {
  const a = Math.round(t0 * FS);
  const b = Math.min(x.length, Math.round(t1 * FS));
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, b - a) + 1e-30);
}

/** Frequency of the strongest peak within ±window around f (Hz), high resolution. */
export function measurePeak(x: Float32Array, f: number, t0: number, dur: number, rel = 0.012): { f: number; db: number } | null {
  const start = Math.round(t0 * FS);
  const len = Math.min(Math.round(dur * FS), x.length - start);
  let nfft = 1;
  while (nfft < len * 8) nfft <<= 1;
  const sp = spectrum(x, FS, start, len, nfft);
  const p = peakIn(sp, f * (1 - rel), f * (1 + rel));
  return p ? { f: p.f, db: 20 * Math.log10(p.mag + 1e-30) } : null;
}

export const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
