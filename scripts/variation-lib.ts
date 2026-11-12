// What a held note does, read off a recording or a render (shared by scripts/tuba-variation.ts and
// scripts/trombone-variation.ts): over the held part, the level's shape (where it peaks, how it falls), how
// far the level, the brightness and the pitch wander about that shape from one tenth of a second to the next.
import { spectrum } from '../packages/engine/src/analysis/index.ts';

export const q = (xs: number[], p: number) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(p * (v.length - 1))] : NaN;
};
export const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
export interface Row { dyn: string; dur: number; peakAt: number; fall: number; levelSd: number; centSd: number; pitchSd: number; rise: number }
/** one held note: x from its onset to its end */
export function look(x: ArrayLike<number>, fs: number, a: number, b: number, dyn: string): Row | null {
  // (windows of 200 ms: a C1's period is 30 ms, and a shorter window's level moves with where it falls in
  // the cycle)
  const hop = Math.round(0.1 * fs);
  const win = Math.round(0.2 * fs);
  const lv: number[] = [];
  const cs: number[] = [];
  const ps: number[] = [];
  for (let s = a; s + win <= b; s += hop) {
    let sq = 0;
    for (let i = 0; i < win; i++) sq += x[s + i] * x[s + i];
    lv.push(10 * Math.log10(sq / win + 1e-20));
    const sp = spectrum(x, fs, s, win, 16384, 'hann');
    let num = 0;
    let den = 0;
    let top = 0;
    for (let k = 2; k < sp.mag.length && k * sp.binHz < 4000; k++) {
      num += k * sp.binHz * sp.mag[k] ** 2;
      den += sp.mag[k] ** 2;
      if (sp.mag[k] > sp.mag[top]) top = k;
    }
    cs.push(1200 * Math.log2(num / Math.max(den, 1e-30)));
    // (the strongest partial's frequency, by the parabola through its three bins)
    const l = Math.log(sp.mag[top - 1] + 1e-30);
    const c = Math.log(sp.mag[top] + 1e-30);
    const r = Math.log(sp.mag[top + 1] + 1e-30);
    ps.push(1200 * Math.log2((top + (0.5 * (l - r)) / (l - 2 * c + r)) * sp.binHz));
  }
  if (lv.length < 8) return null;
  const pk = Math.max(...lv);
  // the held part: from 0.15 s in to 0.15 s before the level has fallen 12 dB from its peak at the end
  let end = lv.length - 1;
  while (end > 0 && lv[end] < pk - 12) end--;
  const i0 = 2;
  const i1 = end - 1;
  if (i1 - i0 < 6) return null;
  const xs = lv.slice(i0, i1);
  const n = xs.length;
  const tm = (n - 1) / 2;
  const mean = xs.reduce((p, v) => p + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((v, i) => {
    sxy += (i - tm) * (v - mean);
    sxx += (i - tm) ** 2;
  });
  const slope = sxy / sxx;
  // (the wander about a smooth shape: each frame against the mean of its two neighbours either side)
  const rough = (v: number[]) => sd(v.slice(1, -1).map((y, i) => y - (v[i] + v[i + 2]) / 2));
  let at = 0;
  for (let i = 1; i < lv.length; i++) if (lv[i] > lv[at]) at = i;
  // the rise: the time from 20 dB under the peak to 3 dB under it, at 5 ms
  return { dyn, dur: (n * hop) / fs, peakAt: at / Math.max(1, end), fall: (slope * fs) / hop, levelSd: rough(xs), centSd: rough(cs.slice(i0, i1)), pitchSd: rough(ps.slice(i0, i1)), rise: NaN };
}

