// What a harder pluck does, the model's against the recordings': for each recorded string that has both
// plucks, its forte pluck against its softer one: how much brighter (octaves of the centroid), how much
// stronger its attack (dB), how much sooner it falls 20 dB (octaves of the time). A voicing whose pluck only
// gets louder has none of these; nor has it the even partials' rise (`even`: the second and fourth partials
// against the first, dB: a string drawn further is let go off its middle). Printed for the strings held out of the fit and for the others; with
// --voice a.json, that voicing; with --engine, another engine.
//   npx tsx scripts/harp-dynamics.ts [--voice voice.json] [--engine <core/index.ts>]
import { readFileSync } from 'node:fs';
import { compareAll, useEngine, type Pair } from './calibrate-harp.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
if (opt('--engine')) await useEngine(opt('--engine'));
const pairs = await compareAll(opt('--voice') ? { voice: JSON.parse(readFileSync(opt('--voice')!, 'utf8')) } : undefined);
const by = new Map<string, { f?: Pair; s?: Pair }>();
for (const p of pairs) (by.get(p.ref.name) ?? by.set(p.ref.name, {}).get(p.ref.name)!)[p.ref.mark === 'f' ? 'f' : 's'] = p;
/** the second and fourth partials' levels against the first (dB, their mean; one lost under −50 counted there) */
function even(a: { levels: number[] }): number {
  const l = (k: number) => Math.max(-50, Number.isFinite(a.levels[k]) ? a.levels[k] : -50);
  return 0.5 * (l(1) + l(3)) - l(0);
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
export const rows = [...by.values()].filter((v): v is { f: Pair; s: Pair } => !!v.f && !!v.s).map(({ f, s }) => ({
  name: f.ref.name,
  held: f.ref.held,
  bright: [Math.log2(f.ref.centroid / s.ref.centroid), Math.log2(f.model.centroid / s.model.centroid)],
  attack: [f.ref.attack - s.ref.attack, f.model.attack - s.model.attack],
  ring: [Math.log2(f.ref.ring20 / s.ref.ring20), Math.log2(f.model.ring20 / s.model.ring20)],
  even: [even(f.ref) - even(s.ref), even(f.model) - even(s.model)],
}));
for (const held of [true, false]) {
  const rs = rows.filter((r) => r.held === held);
  const line = (k: 'bright' | 'attack' | 'ring' | 'even', unit: string) => {
    const ok = rs.filter((r) => Number.isFinite(r[k][0]) && Number.isFinite(r[k][1]));
    return `${k}: the recordings ${mean(ok.map((r) => r[k][0])).toFixed(2)} ${unit}, the model ${mean(ok.map((r) => r[k][1])).toFixed(2)}, apart by ${mean(ok.map((r) => Math.abs(r[k][1] - r[k][0]))).toFixed(2)} (n ${ok.length})`;
  };
  console.log(`${held ? 'held-out' : 'fit'} strings, forte against the softer pluck: ${line('bright', 'oct')}; ${line('attack', 'dB')}; ${line('ring', 'oct')}; ${line('even', 'dB')}`);
}
