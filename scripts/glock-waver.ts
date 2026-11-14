// How a struck bar's pitch moves while it rings, and how its stroke begins, the recordings' and the model's.
// For each clean recorded stroke of the Iowa bells in the compass (scripts/glock-refs.ts; the mezzo-forte and
// fortissimo runs) and the model's stroke on the same bar at the same dynamic and the recorded bar's pitch:
//   waver, rate, start: the pitch's level against its own straight fall (scripts/waver-lib.ts)
//   the stroke's first moments: the whole sound's level over 0–3, 3–10, 10–30 and 30–80 ms, re 80–200 ms (dB)
//   npx tsx scripts/glock-waver.ts [--engine <core/index.ts>] [--human 1] [--per]
// (--human 1: the player's strokes and this instrument's own bars; without it the voicing itself)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeWav } from '../packages/engine/src/analysis/index.ts';
import { renderInstrument } from '../packages/engine/src/core/index.ts';
import { GLOCK_CACHE, GLOCK_FILES, glockRefs, strokes } from './glock-refs.ts';
import { onsetOf, waverOf, type Waver } from './waver-lib.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const RENDER: typeof renderInstrument = opt('--engine') ? (await import(pathToFileURL(opt('--engine')!).href)).renderInstrument : renderInstrument;
const HUMAN = Number(opt('--human') ?? 0);
const VEL: Record<string, number> = { pp: 22, mf: 75, ff: 106, brass: 106 };
const SPANS = [[0, 0.003], [0.003, 0.01], [0.01, 0.03], [0.03, 0.08]];
function head(x: Float32Array, fs: number, on: number): number[] {
  const e = (t0: number, t1: number) => {
    let s = 0;
    const i0 = on + Math.round(t0 * fs);
    const i1 = on + Math.round(t1 * fs);
    for (let i = i0; i < i1; i++) s += (x[i] ?? 0) ** 2;
    return 10 * Math.log10(s / (i1 - i0) + 1e-14);
  };
  const ref = e(0.08, 0.2);
  return SPANS.map(([a, b]) => e(a, b) - ref);
}
const refs = (await glockRefs()).filter((r) => r.ok && r.midi >= 79 && r.midi <= 108 && (r.mark === 'mf' || r.mark === 'ff'));
const rows: { midi: number; mark: string; ref: Waver; mod: Waver; hr: number[]; hm: number[] }[] = [];
const cache = new Map<string, { x: Float32Array; fs: number; segs: { start: number; end: number }[] }>();
for (const r of refs) {
  const f = GLOCK_FILES.find((g) => g.file === r.file)!;
  let c = cache.get(f.file);
  if (!c) {
    const a = decodeWav(readFileSync(join(GLOCK_CACHE, 'wav', f.file.replace(/\.aif$/, '.wav'))));
    c = { x: a.channels[0] as Float32Array, fs: a.sampleRate, segs: strokes(a.channels[0], a.sampleRate, f.lo, f.hi) };
    cache.set(f.file, c);
  }
  const s = c.segs[r.midi - f.lo];
  const rec = Float32Array.from({ length: s.end - s.start }, (_, k) => c!.x[s.start + k]);
  const et = 440 * 2 ** ((r.midi - 69) / 12);
  const out = RENDER({ sampleRate: 44100, instrument: 'glockenspiel' as never, dry: true, params: { human: HUMAN } as never, events: [{ time: 0, event: { type: 'bend', value: Math.max(-0.6, Math.min(0.6, 12 * Math.log2(r.f0 / et))) } }, { time: 0.05, event: { type: 'noteOn', midi: r.midi, velocity: VEL[r.mark] } }], duration: 2.2 });
  const m = new Float32Array(out.left.length);
  for (let i = 0; i < m.length; i++) m[i] = 0.5 * (out.left[i] + out.right[i]);
  const on = onsetOf(rec);
  const om = onsetOf(m);
  const a = waverOf(rec, c.fs, r.f0, on);
  const b = waverOf(m, 44100, r.f0, om);
  if (!a || !b) continue;
  rows.push({ midi: r.midi, mark: r.mark, ref: a, mod: b, hr: head(rec, c.fs, on), hm: head(m, 44100, om) });
  if (args.includes('--per')) console.log(`${String(r.midi).padStart(3)} ${r.mark}  waver ${a.waver.toFixed(1).padStart(4)} / ${b.waver.toFixed(1).padStart(4)} dB  rate ${a.rate.toFixed(1).padStart(4)} / ${b.rate.toFixed(1).padStart(4)}  start ${a.start.toFixed(1).padStart(5)} / ${b.start.toFixed(1).padStart(5)}  fall ${a.fall.toFixed(0).padStart(3)} / ${b.fall.toFixed(0).padStart(3)} dB/s | head ${rows.at(-1)!.hr.map((v) => v.toFixed(1).padStart(5)).join('')} /${rows.at(-1)!.hm.map((v) => v.toFixed(1).padStart(5)).join('')}`);
}
const med = (xs: number[]): number => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};
const q = (xs: number[], p: number): number => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : NaN;
};
console.log(`the recordings / the model (${HUMAN ? 'a player, its own bars' : 'the voicing'}); medians, the quartiles in brackets`);
const line = (name: string, rs: typeof rows) => {
  const g = (f: (w: Waver) => number, who: 'ref' | 'mod') => `${med(rs.map((r) => f(r[who]))).toFixed(1)} [${q(rs.map((r) => f(r[who])), 0.25).toFixed(1)}–${q(rs.map((r) => f(r[who])), 0.75).toFixed(1)}]`;
  console.log(`${name.padEnd(14)} n ${String(rs.length).padStart(3)}  waver ${g((w) => w.waver, 'ref')} / ${g((w) => w.waver, 'mod')} dB   rate ${g((w) => w.rate, 'ref')} / ${g((w) => w.rate, 'mod')} Hz   start ${g((w) => w.start, 'ref')} / ${g((w) => w.start, 'mod')} dB`);
  console.log(`${''.padEnd(14)}        first moments, ${SPANS.map(([a, b]) => `${a * 1000}–${b * 1000}`).join(', ')} ms re 80–200 ms: ${SPANS.map((_, k) => med(rs.map((r) => r.hr[k])).toFixed(1)).join(' ')} / ${SPANS.map((_, k) => med(rs.map((r) => r.hm[k])).toFixed(1)).join(' ')} dB`);
};
line('every stroke', rows);
line('mezzo-forte', rows.filter((r) => r.mark === 'mf'));
line('fortissimo', rows.filter((r) => r.mark === 'ff'));
line('G5–B5', rows.filter((r) => r.midi < 84));
line('C6–B6', rows.filter((r) => r.midi >= 84 && r.midi < 96));
line('C7–C8', rows.filter((r) => r.midi >= 96));
