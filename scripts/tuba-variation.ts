// How a tubist's held notes move (the University of Iowa MIS tuba, analysis only): over each recorded note's
// held part, the level's shape (where it peaks, how it falls: dB/s), how far the level wanders about that
// shape (dB, a standard deviation, from one tenth of a second to the next), how far the brightness wanders (the spectral centroid, cents),
// and the pitch (cents). These are what the engine's player is given to vary by (core/lipcone.ts `human`).
//   npx tsx scripts/tuba-variation.ts [--model]   (--model: the engine's own notes, read the same way)
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeWav, segmentNotes, spectrum } from '../packages/engine/src/analysis/index.ts';
import { renderInstrument } from '../packages/engine/src/core/index.ts';
import { ENS_CACHE, REF_FILES } from './ensemble-refs.ts';

const MODEL = process.argv.includes('--model');
const q = (xs: number[], p: number) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(p * (v.length - 1))] : NaN;
};
const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
interface Row { dyn: string; dur: number; peakAt: number; fall: number; levelSd: number; centSd: number; pitchSd: number; rise: number }
/** one held note: x from its onset to its end */
function look(x: ArrayLike<number>, fs: number, a: number, b: number, dyn: string): Row | null {
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

const rows: Row[] = [];
if (MODEL) {
  const fs = 44100;
  for (const [dyn, vel] of [['pp', 30], ['mf', 70], ['ff', 112]] as const)
    for (let m = 26; m <= 60; m += 2) {
      const out = renderInstrument({ sampleRate: fs, instrument: 'tuba', dry: true, events: [{ time: 0.05, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 1.65, event: { type: 'noteOff', midi: m } }], duration: 2 });
      const r = look(out.left, fs, Math.round(0.05 * fs), Math.round(1.75 * fs), dyn);
      if (r) rows.push(r);
    }
} else {
  for (const f of REF_FILES.filter((r) => r.instrument === 'tuba')) {
    const a = decodeWav(readFileSync(join(ENS_CACHE, 'wav', f.file.replace(/\.aiff$/, '.wav'))));
    const x = a.channels[0];
    for (const seg of segmentNotes(x, a.sampleRate, f.merge ? { merge: f.merge } : {})) {
      const r = look(x, a.sampleRate, seg.start, seg.end, f.dyn);
      if (r) rows.push(r);
    }
  }
}
for (const dyn of ['pp', 'mf', 'ff']) {
  const rs = rows.filter((r) => r.dyn === dyn);
  const f = (k: keyof Row, d = 2) => [0.25, 0.5, 0.75].map((p) => q(rs.map((r) => r[k] as number), p).toFixed(d)).join(' / ');
  console.log(`${dyn} (${rs.length} notes, held ${q(rs.map((r) => r.dur), 0.5).toFixed(1)} s): the level peaks ${f('peakAt')} of the way through; falls ${f('fall', 1)} dB/s; wanders ${f('levelSd')} dB; brightness ${f('centSd', 0)} ¢; pitch ${f('pitchSd', 1)} ¢   (quartiles)`);
}
