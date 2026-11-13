// What a timpanist's two strokes on one drum differ by (VSCO 2 CE, CC0: two takes of each drum at each
// dynamic; analysis only): the stroke's level (dB over its first second), each of the head's first partials
// against the principal ((1,1) (2,1) (3,1) (4,1): where on the head the mallet landed), and the knock (the
// stroke's first 30 ms over its first second: how hard the felt was met). The engine's hands are given these
// to vary by (core/timpani.ts TIMPANI_HUMAN).
//   npx tsx scripts/timpani-variation.ts [--model [--human 0]]
// --model: the engine's own strokes read the same way: twelve on each of four drums at three dynamics, each
// from a stopped head (so only the stroke differs)
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spectrum } from '../packages/engine/src/analysis/index.ts';
import { renderInstrument, type TimedEvent } from '../packages/engine/src/core/index.ts';
import { DRUM_F11, TIMP_CACHE, loadMono, refFiles } from './timpani-refs.ts';

const args = process.argv.slice(2);
const MODEL = args.includes('--model');
const HUMAN = args.includes('--human') ? Number(args[args.indexOf('--human') + 1]) : 1;
const RATIOS = [1, 1.5, 1.98, 2.44];
const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, xs.length - 1));
};

interface Stroke { level: number; parts: number[]; knock: number }
/** one stroke beginning at sample `on`: its level, its partials' levels (dB), its knock */
function read(x: Float32Array, fs: number, on: number, f11: number): Stroke {
  const n = Math.min(x.length - on, Math.round(1 * fs));
  let e = 0, e0 = 0;
  for (let i = 0; i < n; i++) e += x[on + i] * x[on + i];
  const k = Math.round(0.03 * fs);
  for (let i = 0; i < k; i++) e0 += x[on + i] * x[on + i];
  const sp = spectrum(x, fs, on + Math.round(0.05 * fs), Math.round(0.8 * fs), 65536, 'hann');
  const parts = RATIOS.map((r) => {
    const lo = Math.floor((f11 * r * 0.94) / sp.binHz), hi = Math.ceil((f11 * r * 1.06) / sp.binHz);
    let top = 0;
    for (let b = lo; b <= hi; b++) top = Math.max(top, sp.mag[b]);
    return 20 * Math.log10(top + 1e-30);
  });
  return { level: 10 * Math.log10(e / n + 1e-30), parts, knock: 10 * Math.log10(e0 / k + 1e-30) - 10 * Math.log10(e / n + 1e-30) };
}
const onset = (x: Float32Array, fs: number, from = 0, to = x.length) => {
  let pk = 0;
  for (let i = from; i < to; i++) pk = Math.max(pk, Math.abs(x[i]));
  let i = from;
  while (i < to && Math.abs(x[i]) < 0.05 * pk) i++;
  return Math.max(from, i - Math.round(0.002 * fs));
};

/** groups of strokes meant alike → the spread within a group, pooled: each measure's standard deviation */
function report(label: string, groups: Stroke[][]): void {
  const dev = (get: (s: Stroke) => number) => {
    const d: number[] = [];
    for (const g of groups) {
      const m = g.reduce((a, s) => a + get(s), 0) / g.length;
      // (a pair's two deviations are ±half their difference: × √2 gives the stroke's own spread)
      for (const s of g) d.push((get(s) - m) * Math.sqrt(g.length / (g.length - 1)));
    }
    return Math.sqrt(d.reduce((a, b) => a + b * b, 0) / d.length);
  };
  console.log(`${label} (${groups.length} groups, ${groups.reduce((a, g) => a + g.length, 0)} strokes), a stroke's standard deviation from its like:`);
  console.log(`   level ±${dev((s) => s.level).toFixed(2)} dB; knock ±${dev((s) => s.knock).toFixed(2)} dB; partials against the principal: ` + [1, 2, 3].map((k) => `${['(2,1)', '(3,1)', '(4,1)'][k - 1]} ±${dev((s) => s.parts[k] - s.parts[0]).toFixed(2)} dB`).join(', '));
}

if (!MODEL) {
  const files = refFiles().filter((r) => existsSync(join(TIMP_CACHE, r.file)));
  for (const dyn of ['pp', 'mf', 'ff', 'all'] as const) {
    const groups: Stroke[][] = [];
    for (const u of files.filter((r) => r.rr === 1 && (dyn === 'all' || r.dyn === dyn))) {
      const v = files.find((r) => r.drum === u.drum && r.dyn === u.dyn && r.rr === 2);
      if (!v) continue;
      groups.push([u, v].map((r) => { const A = loadMono(join(TIMP_CACHE, r.file)); return read(A.x, A.fs, onset(A.x, A.fs), DRUM_F11[r.drum - 1]); }));
    }
    if (groups.length) report(`the recorded timpani, ${dyn}`, groups);
  }
} else {
  const FS = 48000;
  const all: Stroke[][] = [];
  for (const vel of [40, 80, 115]) {
    const groups: Stroke[][] = [];
    for (const midi of [41, 45, 50, 53]) {
      const ev: TimedEvent[] = [];
      const N = 12;
      for (let i = 0; i < N; i++) ev.push({ time: 0.1 + i * 2.2, event: { type: 'noteOn', midi, velocity: vel } }, { time: 0.1 + i * 2.2 + 1.3, event: { type: 'noteOff', midi } });
      const o = renderInstrument({ sampleRate: FS, instrument: 'timpani', dry: true, params: { human: HUMAN, damp: 1 } as never, events: ev, duration: 0.1 + N * 2.2 });
      const f11 = 440 * 2 ** ((midi - 69) / 12);
      groups.push(Array.from({ length: N }, (_, i) => { const a = Math.round((0.1 + i * 2.2 - 0.01) * FS); return read(o.left, FS, onset(o.left, FS, a, a + Math.round(0.3 * FS)), f11); }));
    }
    report(`the engine's timpani, human ${HUMAN}, velocity ${vel}`, groups);
    all.push(...groups);
  }
  report(`the engine's timpani, human ${HUMAN}, all`, all);
}
