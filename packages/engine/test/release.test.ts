// Key-up: the damper's landing must not add a buzz, and how fast it damps must not depend on
// what else is sounding (the control update once stepped by a block length that was not rendered).
import { describe, expect, it } from 'vitest';
import { fft } from '../src/analysis/index.ts';
import { FS, off, on, render, rmsDb } from './helpers.ts';

function bandDb(x: Float32Array, a: number, len: number, lo: number, hi: number): number {
  const N = 8192;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  for (let i = 0; i < len; i++) re[i] = x[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / len));
  fft(re, im);
  let s = 0;
  for (let k = Math.round((lo * N) / FS); k < Math.round((hi * N) / FS); k++) s += re[k] * re[k] + im[k] * im[k];
  return 10 * Math.log10(s / len + 1e-30);
}

describe('key release', () => {
  it('adds no buzz above 1 kHz (C#4, A1)', () => {
    for (const m of [61, 33]) {
      const { x } = render([on(0.01, m, 72), off(0.5, m)], 0.6);
      const pre = bandDb(x, Math.round(0.4 * FS), Math.round(0.1 * FS), 3000, 6000);
      const post = bandDb(x, Math.round(0.51 * FS), Math.round(0.08 * FS), 3000, 6000);
      expect(post - pre, `m${m}`).toBeLessThan(6); // was +32 (C#4) and +45 dB (A1)
    }
  });
  it('damps at the same rate whether or not the undamped treble is ringing', () => {
    const after = (sympathetic: boolean) => {
      const { x } = render([on(0.01, 61, 72), off(0.5, 61)], 0.56, { params: { sympathetic } as never });
      return rmsDb(x, 0.53, 0.55) - rmsDb(x, 0.45, 0.5);
    };
    expect(Math.abs(after(true) - after(false))).toBeLessThan(1); // was 9 dB apart
  });
});
