// How the recorded strokes differ from each other (the Iowa bells against the fitted voicing): each family of
// upper partials' level from one stroke to the next on the same bar (the mezzo-forte and the fortissimo
// stroke's leftovers: their difference over √2), how much of a bar's leftover both its strokes share (the
// bar's own), how far the families move together in one stroke, and the stroke's own level against its
// neighbours'. These are the engine's STROKE_SD, BAR_SD and HAND_SD (core/glockenspiel.ts): what its player's
// hands are given to vary by.   npx tsx scripts/glock-variation.ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { compareAll } from './calibrate-glock.ts';
const pairs = (await compareAll()).filter((p: any) => p.ref.mark !== 'pp');
const res = (p: any, k: number) => {
  const { ref, model } = p;
  if (!(Number.isFinite(ref.levels[k]) && ref.levels[k] > -45)) return NaN;
  const m = Number.isFinite(model.levels[k]) ? Math.max(-60, model.levels[k]) : -60;
  return ref.levels[k] - ref.levels[0] - (m - model.levels[0]);
};
const corr = (a: number[], b: number[]) => {
  const n = a.length; const ma = a.reduce((x, y) => x + y, 0) / n; const mb = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return [sab / Math.sqrt(saa * sbb), Math.sqrt(saa / n), Math.sqrt(sbb / n), n];
};
for (let k = 1; k < 6; k++) {
  const a: number[] = [], b: number[] = [], d: number[] = [];
  for (const p of pairs.filter((q: any) => q.ref.mark === 'mf')) {
    const q = pairs.find((x: any) => x.ref.mark === 'ff' && x.ref.midi === p.ref.midi);
    if (!q) continue;
    const ra = res(p, k), rb = res(q, k);
    if (Number.isFinite(ra) && Number.isFinite(rb)) { a.push(ra); b.push(rb); d.push(ra - rb); }
  }
  const [c, sa, sb, n] = corr(a, b);
  console.log(`family ${k}: mf–ff of one bar: corr ${c.toFixed(2)} (sd ${sa.toFixed(1)}, ${sb.toFixed(1)}; n ${n}); stroke sd ${(Math.sqrt(d.reduce((x, y) => x + y * y, 0) / d.length) / Math.SQRT2).toFixed(1)} dB`);
}
for (const [i, j] of [[1, 3], [1, 5], [3, 5], [2, 4], [1, 2], [3, 4]]) {
  const a: number[] = [], b: number[] = [];
  for (const p of pairs) { const ra = res(p, i), rb = res(p, j); if (Number.isFinite(ra) && Number.isFinite(rb)) { a.push(ra); b.push(rb); } }
  const [c, , , n] = corr(a, b);
  console.log(`families ${i} and ${j} in one stroke: corr ${c.toFixed(2)} (n ${n})`);
}
// the level of the stroke itself (the pitch's), re its run's smooth trend: neighbours' differences
for (const mark of ['mf', 'ff']) {
  const xs = pairs.filter((p: any) => p.ref.mark === mark).sort((a: any, b: any) => a.ref.midi - b.ref.midi).map((p: any) => p.ref.level);
  const ds = xs.slice(1).map((x: number, i: number) => x - xs[i]);
  console.log(`${mark}: level, neighbouring strokes' difference rms ${(Math.sqrt(ds.reduce((a: number, b: number) => a + b * b, 0) / ds.length) / Math.SQRT2).toFixed(1)} dB`);
}
