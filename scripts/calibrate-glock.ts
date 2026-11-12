// The glockenspiel against its recordings (scripts/glock-refs.ts: the Iowa MIS bells): the model's stroke on
// each recorded bar of its compass (G5–C8), at the recording's dynamic and mallet, analysed exactly as the
// recording is, and the differences: the partials' ratios, their levels, the pitch's decay and the others',
// the time to fall 20 dB, brightness, the knock, the level over the compass and the dynamics, the spectrum.
//   npx tsx scripts/calibrate-glock.ts [--table] [--write] [--voice textbook] [--engine <core/index.ts>]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeRing, THIRD_OCT, type RingAnalysis } from '../packages/engine/src/analysis/index.ts';
import { GLOCK_HI, GLOCK_LO, GLOCK_TEXTBOOK, renderInstrument } from '../packages/engine/src/core/index.ts';
import type { Measure, NoteErr } from './judge.ts';
import { glockRefs, glockRing, type GlockMark, type GlockRef } from './glock-refs.ts';

const FS = 44100;
/** the velocity of each recorded dynamic (the bar's level goes as the velocity squared: the pp run is 21 dB
 *  under the mf, the ff 6 dB over; the brass mallets' strokes are taken as fortissimo) and the mallet's head */
export const MARK_VEL: Record<GlockMark, number> = { pp: 22, mf: 75, ff: 106, brass: 106 };
export const MARK_MALLET: Record<GlockMark, number> = { pp: 0.5, mf: 0.5, ff: 0.5, brass: 1 };

/** the model's stroke at the recorded bar's own pitch (--et: at equal temperament's, as first judged) */
let SAME_PITCH = !process.argv.includes('--et');
let RENDER = renderInstrument;
export async function useEngine(path?: string): Promise<void> {
  RENDER = path ? (await import(pathToFileURL(path).href)).renderInstrument : renderInstrument;
}

/** the model's stroke on a recorded bar */
export function modelStroke(r: Pick<GlockRef, 'midi' | 'mark'> & { f0?: number }, params?: Record<string, unknown>, fs = FS): RingAnalysis {
  const et = 440 * 2 ** ((r.midi - 69) / 12);
  const f0 = r.f0 ?? NaN;
  const out = RENDER({
    sampleRate: fs,
    instrument: 'glockenspiel' as never,
    dry: true,
    // (the stroke the voicing is: on the bar's middle, as hard as asked: `human` 0)
    params: { mallet: MARK_MALLET[r.mark], human: 0, ...params } as never,
    // (at the recorded bar's own pitch: the recorded instrument is 10–30 ¢ sharp, and a bar that lies a fifth
    // of a semitone under a third-octave band's edge, as every fourth one does, is in the next band there)
    events: [...(SAME_PITCH && Number.isFinite(f0) ? [{ time: 0, event: { type: 'bend' as const, value: Math.max(-0.6, Math.min(0.6, 12 * Math.log2(f0 / et))) } }] : []), { time: 0.05, event: { type: 'noteOn', midi: r.midi, velocity: MARK_VEL[r.mark] } }],
    duration: r.midi < 96 ? 6.6 : 4.6,
  });
  const x = new Float32Array(out.left.length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (out.left[i] + out.right[i]);
  return analyzeRing(x, fs, SAME_PITCH && Number.isFinite(f0) ? f0 : et, glockRing(r.midi));
}

const rms = (xs: number[]) => {
  const v = xs.filter(Number.isFinite);
  return v.length ? Math.sqrt(v.reduce((a, b) => a + b * b, 0) / v.length) : NaN;
};
const median = (xs: number[]) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};
/** a family counts where the recording has it within 45 dB of its strongest partial */
const has = (r: RingAnalysis, k: number) => Number.isFinite(r.levels[k]) && r.levels[k] > -45;
/** a level the model does not have at all is 60 dB under */
const lv = (a: RingAnalysis, k: number) => (Number.isFinite(a.levels[k]) ? Math.max(-60, a.levels[k]) : -60);
/** the families' levels re the pitch's (dB), where the recording has them */
const partialsErr = (m: RingAnalysis, r: RingAnalysis) => rms([1, 2, 3, 4, 5].map((k) => (has(r, k) ? lv(m, k) - lv(m, 0) - (r.levels[k] - r.levels[0]) : NaN)));
/** their ratios to the pitch (cents), where the recording has them; a family the model has not: 100 ¢ */
const ratiosErr = (m: RingAnalysis, r: RingAnalysis) => rms([1, 2, 3, 4, 5].map((k) => (has(r, k) ? (Number.isFinite(m.ratios[k]) && lv(m, k) > -59 ? Math.max(-100, Math.min(100, 1200 * Math.log2(m.ratios[k] / r.ratios[k]))) : 100) : NaN)));
const decayErr = (m: number, r: number) => (m > 0.3 && r > 0.3 ? Math.log2(m / r) : NaN);
/** the other families' decays, each against the recording's, the median (octaves) */
const upperErr = (m: RingAnalysis, r: RingAnalysis) => median([1, 2, 3, 4, 5].map((k) => (has(r, k) && r.levels[k] > -35 ? decayErr(m.decays[k], r.decays[k]) : NaN)));
/** the first second's third-octave spectrum, 500 Hz–16 kHz, where the recording is within 45 dB of its loudest band */
const spectrumErr = (m: RingAnalysis, r: RingAnalysis) => rms(THIRD_OCT.map((c, i) => (c >= 500 && c <= 16000 && r.bands[i] > -45 ? Math.max(-60, m.bands[i]) - r.bands[i] : NaN)));

export interface Pair {
  ref: GlockRef;
  model: RingAnalysis;
}
/** the recorded bars of the model's compass */
/** (the plastic mallets' three runs: the brass mallets' run is 15–25 dB lower in level, gated between its
 *  notes and in its own noise, and a third of its strokes do not read as strokes: it is not fitted to nor
 *  judged by; `brass`: with it, for looking) */
export const inCompass = (refs: GlockRef[], brass = false) => refs.filter((r) => r.midi >= GLOCK_LO && r.midi <= GLOCK_HI && r.ok && (brass || r.mark !== 'brass'));
export async function compareAll(params?: Record<string, unknown>, refs?: GlockRef[], fs = FS): Promise<Pair[]> {
  return (refs ?? inCompass(await glockRefs())).map((ref) => ({ ref, model: modelStroke(ref, params, fs) }));
}

/** the recordings' own variation of a value: neighbouring bars of one run differ by this much; median |Δ| / √2 */
function spreadOf(refs: GlockRef[], v: (r: GlockRef) => number, min = 1e-6): number {
  const ds: number[] = [];
  for (const mark of ['pp', 'mf', 'ff', 'brass'] as GlockMark[]) {
    const xs = refs.filter((r) => r.mark === mark).sort((a, b) => a.midi - b.midi);
    for (let i = 1; i < xs.length; i++) {
      const d = Math.abs(v(xs[i]) - v(xs[i - 1]));
      if (Number.isFinite(d)) ds.push(d);
    }
  }
  ds.sort((a, b) => a - b);
  return Math.max(min, (ds[Math.floor(ds.length / 2)] ?? 1) / Math.SQRT2);
}
function profileSpread(refs: GlockRef[], f: (a: GlockRef, b: GlockRef) => number, min: number): number {
  const ds: number[] = [];
  for (const mark of ['pp', 'mf', 'ff', 'brass'] as GlockMark[]) {
    const xs = refs.filter((r) => r.mark === mark).sort((a, b) => a.midi - b.midi);
    for (let i = 1; i < xs.length; i++) ds.push(f(xs[i], xs[i - 1]));
  }
  const s = ds.filter(Number.isFinite).sort((a, b) => a - b);
  return Math.max(min, (s[Math.floor(s.length / 2)] ?? 1) / Math.SQRT2);
}

export function glockErrors(pairs: Pair[], all?: GlockRef[]): { errs: NoteErr[]; measures: Measure[] } {
  // (the level: each stroke's against the others', over the compass and the dynamics; the session's gain,
  // the median difference, is taken out)
  // (the plastic mallets' three runs are one session; the brass mallets' another)
  const gainOf = (brass: boolean) => median(pairs.filter((p) => (p.ref.mark === 'brass') === brass).map(({ ref: r, model: m }) => m.level - r.level));
  const gains = [gainOf(false), gainOf(true)];
  const gainFor = (r: GlockRef) => {
    const g = gains[r.mark === 'brass' ? 1 : 0];
    return Number.isFinite(g) ? g : 0;
  };
  const errs: NoteErr[] = pairs.map(({ ref: r, model: m }) => ({
    key: `glockenspiel:${r.mark}:${r.midi}`,
    midi: r.midi,
    held: r.held,
    // (a pianissimo stroke's partials above its pitch are in the recording's noise, and so is where it
    // begins, to 20 ms: only its pitch's decay and its level are compared)
    errs: {
      ratios: r.mark === 'pp' ? NaN : ratiosErr(m, r),
      partials: r.mark === 'pp' ? NaN : partialsErr(m, r),
      spectrum: r.mark === 'pp' ? NaN : spectrumErr(m, r),
      decay: decayErr(m.decays[0], r.decays[0]),
      upper: r.mark === 'pp' ? NaN : upperErr(m, r),
      ring: r.mark === 'pp' ? NaN : Math.log2(m.ring20 / r.ring20),
      centroid: r.mark === 'pp' ? NaN : Math.log2(m.centroid / r.centroid),
      attack: r.mark === 'pp' ? NaN : m.attack - r.attack,
      level: m.level - r.level - gainFor(r),
    },
  }));
  const refs = all ?? pairs.map((p) => p.ref);
  const measures: Measure[] = [
    { name: 'ratios', spread: Math.max(8, profileSpread(refs, ratiosErr, 8)), guard: true },
    { name: 'partials', spread: profileSpread(refs, partialsErr, 1), guard: true },
    { name: 'spectrum', spread: profileSpread(refs, spectrumErr, 1), guard: true },
    { name: 'decay', spread: spreadOf(refs, (r) => Math.log2(r.decays[0]), 0.2), guard: true },
    { name: 'upper', spread: Math.max(0.3, spreadOf(refs, (r) => Math.log2(median([1, 2, 3, 4, 5].map((k) => (has(r, k) ? r.decays[k] : NaN)))))), guard: true },
    { name: 'ring', spread: spreadOf(refs, (r) => Math.log2(r.ring20), 0.2), guard: true },
    { name: 'centroid', spread: spreadOf(refs, (r) => Math.log2(r.centroid), 0.1), guard: true },
    { name: 'attack', spread: spreadOf(refs, (r) => r.attack, 1), guard: true },
    { name: 'level', spread: spreadOf(refs, (r) => r.level, 1) },
  ];
  return { errs, measures };
}

export function table(pairs: Pair[]): void {
  const f = (x: number, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const name = (m: number) => ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][m % 12] + (Math.floor(m / 12) - 1);
  console.log('bar mark | levels 1–6 model / ref (dB re the strongest) | decay of 1, 2, 4, 5 model / ref (dB/s) | ring20 | centroid | attack | level');
  for (const { ref: r, model: m } of pairs)
    console.log(
      `${name(r.midi).padEnd(3)}${r.held ? '*' : ' '} ${r.mark.padEnd(5)} | ${m.levels.map((v) => f(v).padStart(4)).join('')} /${r.levels.map((v) => f(v).padStart(4)).join('')} | ${[0, 1, 3, 4].map((k) => f(m.decays[k]).padStart(4)).join('')} /${[0, 1, 3, 4].map((k) => f(r.decays[k]).padStart(4)).join('')} | ${f(m.ring20, 2)}/${f(r.ring20, 2)} | ${f(m.centroid)}/${f(r.centroid)} | ${f(m.attack, 1)}/${f(r.attack, 1)} | ${f(m.level, 1)}/${f(r.level, 1)}`,
    );
}

/** mean |error| per measure over a set of strokes */
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
  const pairs = await compareAll(opt('--voice') === 'textbook' ? { voice: GLOCK_TEXTBOOK } : opt('--voice') ? { voice: JSON.parse(readFileSync(opt('--voice')!, 'utf8')) } : undefined);
  const { errs, measures } = glockErrors(pairs);
  if (args.includes('--table')) table(args.includes('--ff') ? pairs.filter((p) => p.ref.mark === 'ff') : pairs);
  const s = summary(errs, measures);
  if (args.includes('--write')) {
    const n = (x: number, d = 1) => (Number.isFinite(x) ? +x.toFixed(d) : null);
    const pick = (a: RingAnalysis) => ({ f0: n(a.f0, 2), ratios: a.ratios.map((x) => n(x, 3)), levels: a.levels.map((x) => n(x)), decays: a.decays.map((x) => n(x)), ring20: n(a.ring20, 2), centroid: Math.round(a.centroid), attack: n(a.attack), level: n(a.level), bands: a.bands.map((x) => n(x)) });
    const out = {
      generated: new Date().toISOString().slice(0, 10),
      reference: 'University of Iowa Musical Instrument Samples, "Bells" (orchestra bells, 2001, anechoic): the bars G5–C8, plastic mallets pp/mf/ff and brass mallets, each struck once and left to ring',
      velocities: MARK_VEL,
      thirdOct: THIRD_OCT,
      measures: measures.map((m) => ({ name: m.name, spread: +m.spread.toFixed(3) })),
      summary: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, +v.toFixed(3)])),
      strokes: pairs.map(({ ref: r, model: m }) => ({ midi: r.midi, mark: r.mark, held: r.held, ref: pick(r), model: pick(m) })),
    };
    writeFileSync(join(import.meta.dirname, '..', 'apps/web/public/data/glockenspiel.json'), JSON.stringify(out) + '\n');
    console.log('wrote apps/web/public/data/glockenspiel.json');
  }
  console.log(`${pairs.length} strokes in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  for (const m of measures) console.log(`  ${m.name.padEnd(9)} mean |err| ${s[m.name].toFixed(2)}  (spread ${m.spread.toFixed(2)})`);
}
