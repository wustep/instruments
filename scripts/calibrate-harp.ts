// The harp against the VCSL recordings (scripts/harp-refs.ts: twenty-three strings, each at two dynamics):
// each recorded pluck made by the model (dry, the same string, at the recording's dynamic, the voicing itself:
// `human` 0), both analysed with analyzeRing(), and compared measure by measure. Every second recorded string
// is held out, both its plucks (the judge's held-out half).
//   npx tsx scripts/calibrate-harp.ts [--engine <path to an engine's core/index.ts>] [--table] [--write]
// --write: apps/web/public/data/harp.json (the Measurements page), every string model against recording.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeRing, THIRD_OCT, type RingAnalysis } from '../packages/engine/src/analysis/index.ts';
import { renderInstrument } from '../packages/engine/src/core/index.ts';
import type { Measure, NoteErr } from './judge.ts';
// (`import type` above: the judge imports this file)
import { harpRefs, harpRing, type HarpRef } from './harp-refs.ts';

/** the library's dynamic marks as velocities */
export const MARK_VEL: Record<string, number> = { p: 40, mp: 55, mf: 70, f: 95 };
const FS = 44100;
/** seconds rendered after the pluck (the decays are followed for 4 s) */
/** how long the model's pluck is left to ring (s): the wire strings fall 20 dB in 5–8 s */
const durOf = (midi: number) => (midi < 45 ? 9.6 : 4.6);

let RENDER = renderInstrument;
export async function useEngine(path?: string): Promise<void> {
  RENDER = path ? (await import(pathToFileURL(path).href)).renderInstrument : renderInstrument;
}

/** the model's pluck of a recorded string */
export function modelPluck(r: Pick<HarpRef, 'midi' | 'mark'>, params?: Record<string, unknown>, fs = FS): RingAnalysis {
  const out = RENDER({
    sampleRate: fs,
    instrument: 'harp' as never,
    dry: true,
    params: { human: 0, ...params } as never,
    events: [{ time: 0.05, event: { type: 'noteOn', midi: r.midi, velocity: MARK_VEL[r.mark] ?? 70 } }],
    duration: durOf(r.midi),
  });
  const x = new Float32Array(out.left.length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (out.left[i] + out.right[i]);
  return analyzeRing(x, fs, 440 * 2 ** ((r.midi - 69) / 12), harpRing(r.midi));
}

const rms = (xs: number[]) => {
  const v = xs.filter(Number.isFinite);
  return v.length ? Math.sqrt(v.reduce((a, b) => a + b * b, 0) / v.length) : NaN;
};
const median = (xs: number[]) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};
/** the first eight partials' levels (dB re the strongest), where the recording's is within 45 dB of it */
const partialsErr = (m: RingAnalysis, r: RingAnalysis) => rms(r.levels.slice(0, 8).map((l, i) => (l > -45 && Number.isFinite(m.levels[i]) ? Math.max(-50, m.levels[i]) - l : NaN)));
/** the first second's third-octave spectrum, 80 Hz–8 kHz, where the recording is within 40 dB of its loudest band */
const spectrumErr = (m: RingAnalysis, r: RingAnalysis) => rms(THIRD_OCT.map((c, i) => (c >= 80 && c <= 8000 && r.bands[i] > -40 ? Math.max(-50, m.bands[i]) - r.bands[i] : NaN)));
/** a decay rate's error (octaves), where both are a decay (a partial the recording does not follow down: none) */
const decayErr = (m: number, r: number) => (m > 0.3 && r > 0.3 ? Math.log2(m / r) : NaN);
/** the strongest partial's decay (the fundamental's on most strings; a bass string's is hardly radiated) */
const lead = (r: RingAnalysis) => r.levels.findIndex((l) => l === 0);
/** the partials 2–6 above it, each against the recording's, the median */
const upperErr = (m: RingAnalysis, r: RingAnalysis) => median([1, 2, 3, 4, 5].map((i) => (r.levels[i] > -35 ? decayErr(m.decays[i], r.decays[i]) : NaN)));
/** the stiffness: partials 2–6 against the harmonics, cents, the model's against the recording's */
const stretchErr = (m: RingAnalysis, r: RingAnalysis) => rms([1, 2, 3, 4, 5].map((i) => (r.levels[i] > -35 ? 1200 * Math.log2(m.ratios[i] / r.ratios[i]) : NaN)));

export interface Pair {
  ref: HarpRef;
  model: RingAnalysis;
}
export async function compareAll(params?: Record<string, unknown>, refs?: HarpRef[], fs = FS): Promise<Pair[]> {
  return (refs ?? (await harpRefs())).map((ref) => ({ ref, model: modelPluck(ref, params, fs) }));
}

/** the recordings' own variation of a per-string value: neighbouring recorded strings differ by this much;
 *  median |Δ| / √2 */
/** (neighbours at one dynamic: the f plucks among themselves, the softer ones among themselves) */
const runs = (refs: HarpRef[]): HarpRef[][] => [refs.filter((r) => r.mark === 'f'), refs.filter((r) => r.mark !== 'f')].map((g) => g.slice().sort((a, b) => a.midi - b.midi));
function spreadOf(refs: HarpRef[], v: (r: HarpRef) => number, min = 1e-6): number {
  const ds: number[] = [];
  for (const xs of runs(refs))
    for (let i = 1; i < xs.length; i++) {
      const d = Math.abs(v(xs[i]) - v(xs[i - 1]));
      if (Number.isFinite(d)) ds.push(d);
    }
  ds.sort((a, b) => a - b);
  return Math.max(min, (ds[Math.floor(ds.length / 2)] ?? 1) / Math.SQRT2);
}
function profileSpread(refs: HarpRef[], f: (a: HarpRef, b: HarpRef) => number, min: number): number {
  const ds: number[] = [];
  for (const xs of runs(refs)) for (let i = 1; i < xs.length; i++) ds.push(f(xs[i], xs[i - 1]));
  const s = ds.filter(Number.isFinite).sort((a, b) => a - b);
  return Math.max(min, (s[Math.floor(s.length / 2)] ?? 1) / Math.SQRT2);
}

/** per-string errors and the measures (each in units of the recordings' own string-to-string variation) */
export function harpErrors(pairs: Pair[], all?: HarpRef[]): { errs: NoteErr[]; measures: Measure[] } {
  // the level is each string's against the others': the library's gain is its session's, not the
  // instrument's (the model's is set beside the piano's), so the median difference over the strings is taken out
  const gain = median(pairs.map(({ ref: r, model: m }) => m.level - r.level));
  const errs: NoteErr[] = pairs.map(({ ref: r, model: m }) => {
    const k = Math.max(0, lead(r));
    return {
      key: `harp:${r.name}:${r.mark}`,
      midi: r.midi,
      held: r.held,
      errs: {
        partials: partialsErr(m, r),
        spectrum: spectrumErr(m, r),
        decay: decayErr(m.decays[k], r.decays[k]),
        upper: upperErr(m, r),
        ring: Math.log2(m.ring20 / r.ring20),
        centroid: Math.log2(m.centroid / r.centroid),
        later: Math.log2(m.centroidLate / r.centroidLate),
        attack: m.attack - r.attack,
        stretch: stretchErr(m, r),
        level: m.level - r.level - (Number.isFinite(gain) ? gain : 0),
      },
    };
  });
  const refs = all ?? pairs.map((p) => p.ref);
  const measures: Measure[] = [
    { name: 'partials', spread: profileSpread(refs, partialsErr, 1), guard: true },
    { name: 'spectrum', spread: profileSpread(refs, spectrumErr, 1), guard: true },
    { name: 'decay', spread: spreadOf(refs, (r) => Math.log2(r.decays[Math.max(0, lead(r))]), 0.2), guard: true },
    { name: 'upper', spread: Math.max(0.3, spreadOf(refs, (r) => Math.log2(median([1, 2, 3, 4, 5].map((i) => (r.decays[i] > 0.3 ? r.decays[i] : NaN)))))), guard: true },
    { name: 'ring', spread: spreadOf(refs, (r) => Math.log2(r.ring20), 0.2), guard: true },
    { name: 'centroid', spread: spreadOf(refs, (r) => Math.log2(r.centroid), 0.1), guard: true },
    { name: 'later', spread: spreadOf(refs, (r) => Math.log2(r.centroidLate), 0.1), guard: true },
    { name: 'attack', spread: spreadOf(refs, (r) => r.attack, 1), guard: true },
    { name: 'stretch', spread: Math.max(4, profileSpread(refs, stretchErr, 4)), guard: true },
    { name: 'level', spread: spreadOf(refs, (r) => r.level, 1) },
  ];
  return { errs, measures };
}

/** a table of the model against the recordings, string by string */
export function table(pairs: Pair[]): void {
  const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  console.log('string | partials 1–8 model / ref (dB re the strongest) | decay of 1–4 model / ref (dB/s) | ring20 | centroid | later | attack | level');
  for (const { ref: r, model: m } of pairs)
    console.log(
      `${r.name.padEnd(3)}${r.held ? '*' : ' '} | ${m.levels.slice(0, 8).map((v) => f(v, 0).padStart(4)).join('')} /${r.levels.slice(0, 8).map((v) => f(v, 0).padStart(4)).join('')} | ${m.decays.slice(0, 4).map((v) => f(v, 0).padStart(4)).join('')} /${r.decays.slice(0, 4).map((v) => f(v, 0).padStart(4)).join('')} | ${f(m.ring20, 2)}/${f(r.ring20, 2)} | ${f(m.centroid, 0)}/${f(r.centroid, 0)} | ${f(m.centroidLate, 0)}/${f(r.centroidLate, 0)} | ${f(m.attack)}/${f(r.attack)} | ${f(m.level)}/${f(r.level)}`,
    );
}

/** mean |error| per measure over a set of strings */
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
  const pairs = await compareAll();
  const { errs, measures } = harpErrors(pairs);
  if (args.includes('--table')) table(pairs);
  const s = summary(errs, measures);
  if (args.includes('--write')) {
    const pick = (a: RingAnalysis) => ({ f0: +a.f0.toFixed(2), levels: a.levels.slice(0, 10).map((x) => (Number.isFinite(x) ? +x.toFixed(1) : null)), decays: a.decays.slice(0, 6).map((x) => (Number.isFinite(x) ? +x.toFixed(1) : null)), ring20: Number.isFinite(a.ring20) ? +a.ring20.toFixed(2) : null, centroid: Math.round(a.centroid), centroidLate: Math.round(a.centroidLate), attack: +a.attack.toFixed(1), level: +a.level.toFixed(1), bands: a.bands.map((x) => +x.toFixed(1)) });
    const out = {
      generated: new Date().toISOString().slice(0, 10),
      reference: 'Versilian Community Sample Library, Concert Harp (Versilian Studios; CC0): twenty-three strings of a concert pedal harp, E1–F7, each plucked at two dynamics and left to ring',
      velocities: MARK_VEL,
      thirdOct: THIRD_OCT,
      measures: measures.map((m) => ({ name: m.name, spread: +m.spread.toFixed(3) })),
      summary: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, +v.toFixed(3)])),
      strings: pairs.map(({ ref: r, model: m }) => ({ name: r.name, midi: r.midi, mark: r.mark, held: r.held, ref: pick(r), model: pick(m) })),
    };
    writeFileSync(join(import.meta.dirname, '..', 'apps/web/public/data/harp.json'), JSON.stringify(out) + '\n');
    console.log('wrote apps/web/public/data/harp.json');
  }
  console.log(`${pairs.length} strings in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  for (const m of measures) console.log(`  ${m.name.padEnd(9)} mean |err| ${s[m.name].toFixed(2)}  (spread ${m.spread.toFixed(2)})`);
}
