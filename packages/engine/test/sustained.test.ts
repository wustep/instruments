// The sustained-tone analysis (used to compare strings and flute with recordings)
// must read known synthetic signals correctly.
import { describe, expect, it } from 'vitest';
import { analyzeSustained, identifyNote, segmentNotes } from '../src/analysis/index.ts';

const FS = 44100;
function tone(f: number, amps: (k: number) => number, dur: number, opts: { vibRate?: number; vibCents?: number; noise?: number } = {}): Float32Array {
  const n = Math.round(dur * FS);
  const x = new Float32Array(n);
  let ph = 0;
  let seed = 1;
  for (let i = 0; i < n; i++) {
    const t = i / FS;
    const fi = f * Math.pow(2, ((opts.vibCents ?? 0) * Math.sin(2 * Math.PI * (opts.vibRate ?? 0) * t)) / 1200);
    ph += (2 * Math.PI * fi) / FS;
    let s = 0;
    for (let k = 1; k <= 20; k++) if (k * f < 0.45 * FS) s += amps(k) * Math.sin(k * ph);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const env = Math.min(1, t / 0.05, (dur - t) / 0.05);
    x[i] = env * (0.1 * s + (opts.noise ?? 0) * (seed / 4294967296 - 0.5));
  }
  return x;
}

describe('sustained-tone analysis', () => {
  it('reads a sawtooth harmonic profile (−20·log10 k) and even/odd balance', () => {
    const x = tone(220, (k) => 1 / k, 2);
    const a = analyzeSustained(x, FS, { start: 0, end: x.length }, 57);
    for (let k = 1; k <= 8; k++) expect(a.harm[k - 1]).toBeCloseTo(-20 * Math.log10(k), 0);
    let ev = 0;
    let od = 0;
    for (let k = 1; k <= 10; k++) (k % 2 ? (od += 1 / (k * k)) : (ev += 1 / (k * k)));
    expect(a.evenOddDb).toBeCloseTo(10 * Math.log10(ev / od), 0);
    expect(Math.abs(a.cents)).toBeLessThan(1);
  });

  it('reads odd-only spectra as strongly odd, and finds noise in the HNR', () => {
    const clean = tone(330, (k) => (k % 2 ? 1 / k : 0), 2);
    const a = analyzeSustained(clean, FS, { start: 0, end: clean.length }, 64);
    expect(a.evenOddDb).toBeLessThan(-40);
    const noisy = tone(330, (k) => (k % 2 ? 1 / k : 0), 2, { noise: 0.05 });
    const b = analyzeSustained(noisy, FS, { start: 0, end: noisy.length }, 64);
    expect(b.hnrDb).toBeLessThan(a.hnrDb - 10);
  });

  it('measures vibrato rate and depth', () => {
    const x = tone(440, (k) => 1 / k, 3, { vibRate: 5.5, vibCents: 20 });
    const a = analyzeSustained(x, FS, { start: 0, end: x.length }, 69);
    expect(a.vibRate).toBeGreaterThan(5.2);
    expect(a.vibRate).toBeLessThan(5.8);
    expect(a.vibDepth).toBeGreaterThan(14);
    expect(a.vibDepth).toBeLessThan(24);
  });

  it('segments a run of separated notes and identifies their pitches', () => {
    const gap = new Float32Array(Math.round(0.6 * FS));
    const parts = [tone(196, (k) => 1 / k, 1.2), gap, tone(207.65, (k) => 1 / k, 1.2), gap, tone(220, (k) => 1 / k, 1.2)];
    const x = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of parts) {
      x.set(p, o);
      o += p.length;
    }
    const segs = segmentNotes(x, FS);
    expect(segs.length).toBe(3);
    expect(segs.map((s) => identifyNote(x, FS, s, 50, 62).midi)).toEqual([55, 56, 57]);
  });
});
