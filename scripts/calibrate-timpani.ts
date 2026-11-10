// The timpani against the VSCO 2 CE recordings (scripts/timpani-refs.ts): each recorded stroke rendered by
// the model (dry, at the recording's own pitch, at its dynamic), both analysed with analyzeStruck(), and
// compared measure by measure. Drums 2 and 4 are held out (the judge's held-out half).
//   npx tsx scripts/calibrate-timpani.ts [--engine <path to an engine's core/index.ts>] [--table] [--write]
// --write: apps/web/public/data/timpani.json (the Measurements page), every stroke model against recording.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeStruck, THIRD_OCT, type StruckAnalysis } from '../packages/engine/src/analysis/index.ts';
import { renderInstrument } from '../packages/engine/src/core/index.ts';
import type { Measure, NoteErr } from './judge.ts';
import { timpaniRefs, type Dyn, type TimpRef } from './timpani-refs.ts';

export const DYN_VEL: Record<Dyn, number> = { pp: 30, mf: 70, ff: 112 };

/** the recording's own variation of a per-stroke value: neighbouring strokes (same dynamic) differ by this
 *  much; median |Δ| between adjacent strokes / √2 (the judge's localSpread, here so that the judge, which
 *  imports this file, is not imported back) */
function localSpread(values: { midi: number; group: string; v: number }[]): number {
  const by = new Map<string, { midi: number; v: number }[]>();
  for (const x of values) if (Number.isFinite(x.v)) (by.get(x.group) ?? by.set(x.group, []).get(x.group)!).push(x);
  const ds: number[] = [];
  for (const xs of by.values()) {
    xs.sort((a, b) => a.midi - b.midi);
    for (let i = 1; i < xs.length; i++) ds.push(Math.abs(xs[i].v - xs[i - 1].v));
  }
  ds.sort((a, b) => a - b);
  return Math.max(1e-6, (ds[Math.floor(ds.length / 2)] ?? 1) / Math.SQRT2);
}
const FS = 44100;
/** seconds rendered after the stroke (the decays are read to 2.2 s) */
const DUR = 2.6;

let RENDER = renderInstrument;
export async function useEngine(path?: string): Promise<void> {
  RENDER = path ? (await import(pathToFileURL(path).href)).renderInstrument : renderInstrument;
}

/** the strokes compared: the drums 1 and 5 softest layer is left out (recorded 15–20 dB under the other
 *  drums' pp, at −64…−73 dB, where the room's noise and the other drums' ringing are a large part of it:
 *  drum 5's centroid lies below its own principal tone) */
export const usable = (r: TimpRef): boolean => !(r.dyn === 'pp' && (r.drum === 1 || r.drum === 5));

/** the model's stroke for a recorded one: the nearest note, tuned to the recording's pitch */
export function modelStroke(r: Pick<TimpRef, 'midi' | 'dyn' | 'f11'>, params?: Record<string, unknown>, fs = FS): StruckAnalysis {
  const m = Math.round(r.midi);
  const out = RENDER({
    sampleRate: fs,
    instrument: 'timpani',
    dry: true,
    params: { detune: r.midi - m, ...params } as never,
    events: [{ time: 0.05, event: { type: 'noteOn', midi: m, velocity: DYN_VEL[r.dyn] } }],
    duration: DUR,
  });
  const x = new Float32Array(out.left.length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (out.left[i] + out.right[i]);
  return analyzeStruck(x, fs, r.f11);
}

const rms = (xs: number[]) => {
  const v = xs.filter(Number.isFinite);
  return v.length ? Math.sqrt(v.reduce((a, b) => a + b * b, 0) / v.length) : NaN;
};
/** the partials' frequencies (cents) and levels (dB), the (2,1)–(4,1) */
const modesErr = (m: StruckAnalysis, r: StruckAnalysis) => rms([0, 1, 2].map((i) => 1200 * Math.log2(m.ratios[i] / r.ratios[i])));
const partialsErr = (m: StruckAnalysis, r: StruckAnalysis) => rms([0, 1, 2].map((i) => m.levels[i] - r.levels[i]));
/** the first second’s third-octave spectrum, 100 Hz–5 kHz (below, the room’s rumble) where the recording is within 40 dB of its loudest band */
const spectrumErr = (m: StruckAnalysis, r: StruckAnalysis) => rms(THIRD_OCT.map((c, i) => (c >= 100 && c <= 5000 && r.bands[i] > -40 ? m.bands[i] - r.bands[i] : NaN)));

export interface Pair {
  ref: TimpRef;
  model: StruckAnalysis;
}
export function compareAll(params?: Record<string, unknown>, refs = timpaniRefs().filter(usable), fs = FS): Pair[] {
  return refs.map((ref) => ({ ref, model: modelStroke(ref, params, fs) }));
}

/** per-stroke errors and the measures (each in units of the recordings' own stroke-to-stroke variation) */
export function timpaniErrors(pairs: Pair[]): { errs: NoteErr[]; measures: Measure[] } {
  const errs: NoteErr[] = pairs.map(({ ref: r, model: m }) => ({
    key: `timpani:${r.dyn}:${r.drum}:${r.rr}`,
    midi: r.midi,
    held: r.held,
    errs: {
      modes: modesErr(m, r),
      partials: partialsErr(m, r),
      spectrum: spectrumErr(m, r),
      decay: Math.log2(m.decay11 / r.decay11),
      decay21: Math.log2(m.decay21 / r.decay21),
      ring: Math.log2(m.ring / r.ring),
      centroid: Math.log2(m.centroid / r.centroid),
      attack: m.attack - r.attack,
      pitch: 1200 * Math.log2(m.f11 / r.f11),
      level: m.level - r.level,
    },
  }));
  const refs = pairs.map((p) => p.ref);
  const g = (r: TimpRef) => r.dyn;
  // the recordings' own spread of a profile measure: neighbouring strokes (same dynamic) compared
  const profileSpread = (f: (a: TimpRef, b: TimpRef) => number, min: number) => {
    const ds: number[] = [];
    for (const dyn of ['pp', 'mf', 'ff'] as const) {
      const xs = refs.filter((r) => g(r) === dyn).sort((a, b) => a.midi - b.midi);
      for (let i = 1; i < xs.length; i++) ds.push(f(xs[i], xs[i - 1]));
    }
    const s = ds.filter(Number.isFinite).sort((a, b) => a - b);
    return Math.max(min, (s[Math.floor(s.length / 2)] ?? 1) / Math.SQRT2);
  };
  const ls = (v: (r: TimpRef) => number) => localSpread(refs.map((r) => ({ midi: r.midi, group: g(r), v: v(r) })));
  const measures: Measure[] = [
    { name: 'modes', spread: profileSpread(modesErr, 3), guard: true },
    { name: 'partials', spread: profileSpread(partialsErr, 1), guard: true },
    { name: 'spectrum', spread: profileSpread(spectrumErr, 1), guard: true },
    { name: 'decay', spread: ls((r) => Math.log2(r.decay11)), guard: true },
    { name: 'decay21', spread: ls((r) => Math.log2(r.decay21)), guard: true },
    { name: 'ring', spread: ls((r) => Math.log2(r.ring)), guard: true },
    { name: 'centroid', spread: ls((r) => Math.log2(r.centroid)), guard: true },
    { name: 'attack', spread: ls((r) => r.attack), guard: true },
    { name: 'pitch', spread: Math.max(2, ls((r) => 1200 * Math.log2(r.f11))) , guard: true },
    { name: 'level', spread: ls((r) => r.level) },
  ];
  return { errs, measures };
}

/** a table of the model against the recordings, note by note, and the summary */
export function table(pairs: Pair[]): void {
  const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  console.log('drum dyn rr | ratios model/ref (21 31 41) | L21 L31 L41 model/ref | dec11 | dec21 | ring | centroid | attack | level | pitch');
  for (const { ref: r, model: m } of pairs)
    console.log(
      `${r.drum}${r.held ? '*' : ' '} ${r.dyn} ${r.rr} | ${[0, 1, 2].map((i) => `${f(m.ratios[i], 3)}/${f(r.ratios[i], 3)}`).join(' ')} | ${[0, 1, 2].map((i) => `${f(m.levels[i], 0)}/${f(r.levels[i], 0)}`).join(' ')} | ${f(m.decay11)}/${f(r.decay11)} | ${f(m.decay21)}/${f(r.decay21)} | ${f(m.ring, 2)}/${f(r.ring, 2)} | ${f(m.centroid, 0)}/${f(r.centroid, 0)} | ${f(m.attack)}/${f(r.attack)} | ${f(m.level)}/${f(r.level)} | ${f(1200 * Math.log2(m.f11 / r.f11))}`,
    );
}

/** mean |error| per measure over a set of strokes (the summary for NOTES and the Measurements page) */
export function summary(errs: NoteErr[], measures: Measure[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of measures) {
    const v = errs.map((e) => Math.abs(e.errs[m.name])).filter(Number.isFinite);
    out[m.name] = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length);
  }
  return out;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  if (opt('--engine')) await useEngine(opt('--engine'));
  const t0 = performance.now();
  const pairs = compareAll();
  const { errs, measures } = timpaniErrors(pairs);
  if (args.includes('--table')) table(pairs);
  const s = summary(errs, measures);
  if (args.includes('--write')) {
    const pick = (a: StruckAnalysis) => ({ f11: +a.f11.toFixed(2), ratios: a.ratios.map((x) => +x.toFixed(4)), levels: a.levels.map((x) => +x.toFixed(1)), decay11: +a.decay11.toFixed(1), decay21: +a.decay21.toFixed(1), ring: +a.ring.toFixed(2), centroid: Math.round(a.centroid), attack: +a.attack.toFixed(1), level: +a.level.toFixed(1), bands: a.bands.map((x) => +x.toFixed(1)) });
    const out = {
      generated: new Date().toISOString().slice(0, 10),
      reference: 'VSCO 2 Community Edition timpani (Versilian Studios; CC0): five pedal drums, pp/mf/ff, two takes each; the drums 1 and 5 softest layer left out',
      velocities: DYN_VEL,
      thirdOct: THIRD_OCT,
      measures: measures.map((m) => ({ name: m.name, spread: +m.spread.toFixed(3) })),
      summary: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, +v.toFixed(3)])),
      strokes: pairs.map(({ ref: r, model: m }) => ({ drum: r.drum, dyn: r.dyn, rr: r.rr, held: r.held, midi: +r.midi.toFixed(2), ref: pick(r), model: pick(m) })),
    };
    writeFileSync(join(import.meta.dirname, '..', 'apps/web/public/data/timpani.json'), JSON.stringify(out) + '\n');
    console.log('wrote apps/web/public/data/timpani.json');
  }
  console.log(`${pairs.length} strokes in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  for (const m of measures) console.log(`  ${m.name.padEnd(9)} mean |err| ${s[m.name].toFixed(2)}  (spread ${m.spread.toFixed(2)})`);
}
