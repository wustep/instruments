// A ringing partial's waver about its own straight fall (scripts/harp-waver.ts, scripts/glock-waver.ts): a
// heterodyne at the partial's frequency every 10 ms, a line fitted to its level in dB, and how far and how
// often the level stands off it.
export const onsetOf = (x: Float32Array): number => {
  let pk = 0;
  for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > 0.05 * pk) return i;
  return 0;
};
/** a partial's level (dB) every `hop` s: a heterodyne at f, a Hann window of `win` s */
export function track(x: Float32Array, fs: number, f: number, on: number, t0: number, t1: number, hop = 0.01, win = 0.03): number[] {
  const n = Math.round(win * fs);
  const out: number[] = [];
  for (let t = t0; t < t1; t += hop) {
    const i0 = on + Math.round(t * fs) - (n >> 1);
    if (i0 + n >= x.length) break;
    let re = 0;
    let im = 0;
    let ws = 0;
    for (let i = 0; i < n; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / n);
      const xi = x[i0 + i] * w;
      re += xi * Math.cos((2 * Math.PI * f * i) / fs);
      im += xi * Math.sin((2 * Math.PI * f * i) / fs);
      ws += w;
    }
    out.push(20 * Math.log10((2 * Math.hypot(re, im)) / ws + 1e-9));
  }
  return out;
}
export interface Waver {
  waver: number;
  rate: number;
  start: number;
  fall: number;
}
/** a partial's waver about its own straight fall */
export function waverOf(x: Float32Array, fs: number, f: number, on: number): Waver | null {
  // (the window: three cycles of a low partial at least, 30 ms for the rest)
  const win = Math.max(0.03, 3 / f);
  const lv = track(x, fs, f, on, win / 2 + 0.005, 1.5, 0.01, win);
  if (lv.length < 20) return null;
  const pk = Math.max(...lv.slice(0, 8));
  // (… until it has fallen 30 dB from its start, or met the floor)
  let n = lv.length;
  for (let i = 8; i < lv.length; i++)
    if (lv[i] < pk - 30 || lv[i] < -85) {
      n = i;
      break;
    }
  if (n < 20) return null;
  const ys = lv.slice(0, n);
  const mt = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  ys.forEach((y, i) => {
    sxy += (i - mt) * (y - my);
    sxx += (i - mt) ** 2;
  });
  const slope = sxy / sxx;
  const res = ys.map((y, i) => y - (my + slope * (i - mt)));
  let cross = 0;
  for (let i = 1; i < n; i++) if (res[i] * res[i - 1] < 0) cross++;
  const head = lv.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
  return { waver: Math.sqrt(res.reduce((a, b) => a + b * b, 0) / n), rate: cross / 2 / (n * 0.01), start: head - (my - slope * mt), fall: -slope * 100 };
}

