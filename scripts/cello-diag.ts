// Cello diagnosis vs the Iowa recordings: mean third-octave spectra per dynamic (ref vs model),
// harmonic profiles per register, pitch, level, attack — for one engine (--engine) or this checkout.
//   npx tsx scripts/cello-diag.ts [--engine <path to core/index.ts>] [--inst cello]
import { resolve } from 'node:path';
import { THIRD_OCT } from '../packages/engine/src/analysis/index.ts';
import { compareAll, summarise, useEngine } from './calibrate-ensemble.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const inst = (opt('--inst') ?? 'cello') as 'cello';
const eng = opt('--engine');
await useEngine(eng ? resolve(eng) : undefined);
const pairs = await compareAll({ only: [inst] });
const s = summarise(pairs as never, inst);
const { ltas, harm, ...brief } = s as unknown as { ltas: { ref: number[]; model: number[] }; harm: Record<string, { ref: number[]; model: number[]; n: number }[]> };
console.log(JSON.stringify(brief));
const bands = THIRD_OCT.map((f, b) => [f, b] as const).filter(([f]) => f >= 50 && f <= 12000);
console.log('band   ' + bands.map(([f]) => String(Math.round(f)).padStart(6)).join(''));
console.log('ref    ' + bands.map(([, b]) => ltas.ref[b].toFixed(1).padStart(6)).join(''));
console.log('model  ' + bands.map(([, b]) => ltas.model[b].toFixed(1).padStart(6)).join(''));
console.log('diff   ' + bands.map(([, b]) => (ltas.model[b] - ltas.ref[b]).toFixed(1).padStart(6)).join(''));
for (const [d, regs] of Object.entries(harm))
  regs.forEach((r, g) => {
    console.log(`${d} reg${g} n=${r.n}  ref ${r.ref.slice(0, 12).map((v) => (v ?? NaN).toFixed(0).padStart(4)).join('')}`);
    console.log(`${d} reg${g}        mod ${r.model.slice(0, 12).map((v) => (v ?? NaN).toFixed(0).padStart(4)).join('')}`);
  });
// per-dynamic LTAS diff
const byDyn = (dyn: string) => (pairs as { ref: { dyn: string; ltas: number[] }; model: { ltas: number[] } | null }[]).filter((p) => p.ref.dyn === dyn && p.model);
for (const dyn of ['pp', 'mf', 'ff']) {
  const ps = byDyn(dyn);
  const avg = (k: 'ref' | 'model') => THIRD_OCT.map((_, b) => 10 * Math.log10(ps.reduce((a, p) => a + Math.pow(10, (k === 'ref' ? p.ref.ltas[b] : p.model!.ltas[b]) / 10), 0) / ps.length));
  const r = avg('ref');
  const m = avg('model');
  const rt = Math.max(...r);
  console.log(`${dyn} diff (model-ref, abs dB) ` + bands.map(([, b]) => (m[b] - r[b]).toFixed(0).padStart(5)).join('') + `   refTop ${rt.toFixed(1)}`);
}
