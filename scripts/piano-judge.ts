// The piano against every key of the Iowa Steinway, note by note, for the judge (scripts/judge.ts
// --instrument piano). The fit (scripts/calibrate.ts) only ever sees every fourth key from A0, and C8
// (REF_KEYS); the 65 keys between them are the held-out half. Each recorded note (key × pp/mf/ff) is rendered
// by the model (dry, as long as the part of the recording that is analysed), both are analysed with
// analyzeNote(), and compared measure by measure:
//   level     RMS of the first 0.5 s, after one gain for the whole piano (the median difference at mf)
//   partials  RMS over partials 1–10 of the level differences, each note's partials re its own strongest
//   centroid  log2 of the spectral centroid's ratio (the first 250 ms)
//   prompt    log2 of partial 1's early T60 ratio (EDT)
//   late      log2 of partial 1's late T60 ratio (−15 → −35 dB: the aftersound)
//   tuning    partial 1 in cents, less the recorded piano's own offset from A440
//   stiffness log10 of the inharmonicity B's ratio
// Each is scored in units of how much the recorded piano's own neighbouring keys differ on it.
//   pnpm refs:fetch --all                                   every key (about 1 GB more in .cache/iowa)
//   npx tsx scripts/piano-judge.ts [--engine <core/index.ts>] [--table]     the measures, and how even the keys are
//   npx tsx scripts/judge.ts --instrument piano --before <old engine>/packages/engine/src/core/index.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { analyzeNote, decodeWav, type NoteAnalysis } from '../packages/engine/src/analysis/index.ts';
import type { Measure, NoteErr } from './judge.ts';
// (`import type` above: the judge imports this file)
import { CACHE, DYNAMICS, REF_KEYS, available, wavPath, wavSeconds, type Dyn } from './references.ts';

export const DYN_VEL: Record<Dyn, number> = { pp: 30, mf: 70, ff: 112 };
const REF_CACHE = join(CACHE, 'analysis-v3.json');
const HERE = join(import.meta.dirname, '../packages/engine/src/core/index.ts');
type Engine = typeof import('../packages/engine/src/core/index.ts');

let ENGINE: string | undefined;
export async function useEngine(path?: string): Promise<void> {
  ENGINE = path;
}

interface Job {
  kind: 'ref' | 'model';
  midi: number;
  dyn: Dyn;
  dur?: number;
}
export interface PianoPair {
  midi: number;
  dyn: Dyn;
  /** not one of the keys the fit sees */
  held: boolean;
  ref: NoteAnalysis;
  model: NoteAnalysis;
}

function runJob(E: Engine, j: Job): NoteAnalysis | null {
  const Bguess = E.referenceB(j.midi, E.DEFAULT_CALIBRATION);
  if (j.kind === 'ref') {
    const a = decodeWav(readFileSync(wavPath(j.midi, j.dyn)));
    return analyzeNote(a.channels, a.sampleRate, j.midi, { Bguess, maxDur: 30 });
  }
  const r = E.renderNote(j.midi, DYN_VEL[j.dyn], j.dur ?? 12, { sampleRate: 44100, dry: true });
  return analyzeNote([r.left, r.right], 44100, j.midi, { Bguess, maxDur: 30 });
}

async function pool(jobs: Job[], engine?: string): Promise<(NoteAnalysis | null)[]> {
  const n = Math.min(jobs.length, Math.max(1, cpus().length - 2));
  const chunks: { i: number; j: Job }[][] = Array.from({ length: n }, () => []);
  // the long bass notes dealt round, not all to one worker
  jobs.forEach((j, i) => chunks[i % n].push({ i, j }));
  const out: (NoteAnalysis | null)[] = new Array(jobs.length).fill(null);
  await Promise.all(
    chunks.map(
      (c) =>
        new Promise<void>((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: { pianoJobs: c, engine }, execArgv: ['--import', 'tsx'] });
          w.on('message', (m: { i: number; a: NoteAnalysis | null }[]) => {
            for (const x of m) out[x.i] = x.a;
            resolve();
          });
          w.on('error', reject);
        }),
    ),
  );
  return out;
}

/** every recorded note there is in the cache, model beside recording (the engine: useEngine) */
export async function compareAll(opts: { keys?: number[] } = {}): Promise<PianoPair[]> {
  const notes: { midi: number; dyn: Dyn }[] = [];
  for (let m = 21; m <= 108; m++) {
    if (opts.keys && !opts.keys.includes(m)) continue;
    for (const d of DYNAMICS) if (available(m, d) && existsSync(wavPath(m, d))) notes.push({ midi: m, dyn: d });
  }
  const refCache: Record<string, NoteAnalysis | null> = existsSync(REF_CACHE) ? JSON.parse(readFileSync(REF_CACHE, 'utf8')) : {};
  const todo = notes.filter((n) => !(`ref:${n.midi}:${n.dyn}` in refCache));
  if (todo.length) {
    // (the recordings are read with this checkout's ruler, whichever engine is judged)
    const r = await pool(todo.map((n) => ({ kind: 'ref' as const, ...n })));
    todo.forEach((n, i) => (refCache[`ref:${n.midi}:${n.dyn}`] = r[i]));
    writeFileSync(REF_CACHE, JSON.stringify(refCache));
  }
  const models = await pool(
    notes.map((n) => {
      const len = wavSeconds(wavPath(n.midi, n.dyn));
      return { kind: 'model' as const, ...n, dur: Number.isFinite(len) ? Math.min(30, len) : 12 };
    }),
    ENGINE,
  );
  const out: PianoPair[] = [];
  notes.forEach((n, i) => {
    const ref = refCache[`ref:${n.midi}:${n.dyn}`];
    const model = models[i];
    if (ref && model) out.push({ ...n, held: !REF_KEYS.includes(n.midi), ref, model });
  });
  return out;
}

const median = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const rms = (xs: number[]) => {
  const s = xs.filter(Number.isFinite);
  return s.length ? Math.sqrt(s.reduce((a, b) => a + b * b, 0) / s.length) : NaN;
};
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** the recorded piano's own key-to-key variation of a per-note value (the judge's localSpread, here so that
 *  the judge, which imports this file, is not imported back) */
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

/** the first ten partials' levels, each re the note's strongest (NaN: not found, or in the recording's noise) */
function profile(a: NoteAnalysis): number[] {
  const top = Math.max(...a.levels.slice(0, 10).map((x) => x.db));
  return Array.from({ length: 10 }, (_, i) => {
    const l = a.levels.find((x) => x.k === i + 1);
    return l && l.db > -100 && l.db - top > -50 ? l.db - top : NaN;
  });
}
function profileErr(m: NoteAnalysis, r: NoteAnalysis): number {
  const pm = profile(m);
  const pr = profile(r);
  const mtop = Math.max(...m.levels.slice(0, 10).map((x) => x.db));
  const d: number[] = [];
  for (let k = 0; k < 10; k++) {
    if (!Number.isFinite(pr[k])) continue;
    const ml = m.levels.find((x) => x.k === k + 1);
    if (!ml) continue;
    d.push(Math.max(-60, ml.db - mtop) - pr[k]);
  }
  return d.length >= 3 ? rms(d) : NaN;
}
const t60 = (a: NoteAnalysis, which: 'early' | 'late') => {
  const d = a.decays.find((x) => x.k === 1);
  const v = d ? (which === 'early' ? d.t60Early : d.t60Late) : NaN;
  return Number.isFinite(v) && v > 0 && v < 120 ? v : NaN;
};
/** a note whose partials are found well enough to speak of its tuning and stiffness */
const tunable = (a: NoteAnalysis, m: number) => a.fitCents < 3 && a.partials.length >= 4 && Math.abs(cents(a.f1, et(m))) < 40;

/** per-note errors (model − recording) and the measures, each with the recorded piano's own key-to-key spread */
export function pianoErrors(pairs: PianoPair[]): { errs: NoteErr[]; measures: Measure[]; gain: number; refOffset: number } {
  // one gain for the whole piano (the output gain is the model's to set): the median difference at mf
  const gain = median(pairs.filter((p) => p.dyn === 'mf').map((p) => p.ref.rmsDb - p.model.rmsDb));
  // the recorded piano's own offset from A440 (its middle), removed from the tuning
  const refOffset = median(pairs.filter((p) => p.midi >= 57 && p.midi <= 81 && tunable(p.ref, p.midi)).map((p) => cents(p.ref.f1, et(p.midi))));
  const errs: NoteErr[] = pairs.map((p) => ({
    key: `piano:${p.dyn}:${p.midi}`,
    midi: p.midi,
    held: p.held,
    errs: {
      level: p.model.rmsDb + gain - p.ref.rmsDb,
      partials: profileErr(p.model, p.ref),
      centroid: Math.log2(p.model.centroid / p.ref.centroid),
      prompt: Math.log2(t60(p.model, 'early') / t60(p.ref, 'early')),
      late: Math.log2(t60(p.model, 'late') / t60(p.ref, 'late')),
      tuning: tunable(p.ref, p.midi) && p.model.partials.length >= 2 ? cents(p.model.f1, et(p.midi)) - (cents(p.ref.f1, et(p.midi)) - refOffset) : NaN,
      stiffness: tunable(p.ref, p.midi) && p.ref.B > 0 && p.model.B > 0 ? Math.log10(p.model.B / p.ref.B) : NaN,
    },
  }));
  const refs = pairs.map((p) => ({ midi: p.midi, group: p.dyn, a: p.ref }));
  const sp = (f: (a: NoteAnalysis, m: number) => number) => localSpread(refs.map((r) => ({ midi: r.midi, group: r.group, v: f(r.a, r.midi) })));
  const profSpread = (() => {
    const ds: number[] = [];
    for (const d of DYNAMICS) {
      const xs = refs.filter((r) => r.group === d).sort((a, b) => a.midi - b.midi);
      for (let i = 1; i < xs.length; i++) ds.push(profileErr(xs[i].a, xs[i - 1].a));
    }
    const s = ds.filter(Number.isFinite).sort((a, b) => a - b);
    return Math.max(0.5, (s[Math.floor(s.length / 2)] ?? 3) / Math.SQRT2);
  })();
  const measures: Measure[] = [
    // a note's level in the recordings is partly the player's (one take a key): scored, not a guard
    { name: 'level', spread: sp((a) => a.rmsDb) },
    { name: 'partials', spread: profSpread, guard: true },
    { name: 'centroid', spread: sp((a) => Math.log2(a.centroid)), guard: true },
    { name: 'prompt', spread: sp((a) => Math.log2(t60(a, 'early'))), guard: true },
    { name: 'late', spread: sp((a) => Math.log2(t60(a, 'late'))), guard: true },
    { name: 'tuning', spread: Math.max(1, sp((a, m) => (tunable(a, m) ? cents(a.f1, et(m)) : NaN))), guard: true },
    { name: 'stiffness', spread: Math.max(0.01, sp((a, m) => (tunable(a, m) && a.B > 0 ? Math.log10(a.B) : NaN))), guard: true },
  ];
  return { errs, measures, gain, refOffset };
}

/** how even the keys are: the median and the largest step in level between neighbouring keys, by register */
export function evenness(pairs: PianoPair[], dyn: Dyn, which: 'ref' | 'model'): { register: string; median: number; p90: number; n: number }[] {
  const lv = new Map(pairs.filter((p) => p.dyn === dyn).map((p) => [p.midi, p[which].rmsDb]));
  return ([['A0–B2', 21, 47], ['C3–B4', 48, 71], ['C5–F6', 72, 89], ['F♯6–C8', 90, 108]] as [string, number, number][]).map(([register, lo, hi]) => {
    const d: number[] = [];
    for (let m = lo + 1; m <= hi; m++) if (lv.has(m) && lv.has(m - 1)) d.push(Math.abs(lv.get(m)! - lv.get(m - 1)!));
    d.sort((a, b) => a - b);
    return { register, median: d[d.length >> 1] ?? NaN, p90: d[Math.floor(0.9 * (d.length - 1))] ?? NaN, n: d.length };
  });
}

if (!isMainThread && (workerData as { pianoJobs?: unknown })?.pianoJobs) {
  const wd = workerData as { pianoJobs: { i: number; j: Job }[]; engine?: string };
  const E = (await import(pathToFileURL(wd.engine ?? HERE).href)) as Engine;
  parentPort!.postMessage(wd.pianoJobs.map(({ i, j }) => ({ i, a: runJob(E, j) })));
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const { resolve } = await import('node:path');
  await useEngine(opt('--engine') ? resolve(opt('--engine')!) : undefined);
  const t0 = performance.now();
  const pairs = await compareAll();
  const { errs, measures, gain, refOffset } = pianoErrors(pairs);
  const f = (x: number, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : 'n/a');
  console.log(`${pairs.length} notes on ${new Set(pairs.map((p) => p.midi)).size} keys (${pairs.filter((p) => p.held).length} held out) in ${((performance.now() - t0) / 1000).toFixed(1)} s; gain ${f(gain, 1)} dB, the recorded piano ${f(refOffset, 1)} ¢ from A440`);
  for (const half of ['fit', 'held-out'] as const) {
    const es = errs.filter((e) => (half === 'held-out') === !!e.held);
    console.log(`${half} keys (n=${es.length}):`);
    for (const m of measures) {
      const v = es.map((e) => e.errs[m.name]).filter(Number.isFinite);
      console.log(`  ${m.name.padEnd(10)} mean |err| ${f(v.reduce((a, b) => a + Math.abs(b), 0) / v.length)}  median ${f(median(v))}  (spread ${f(m.spread)}, n=${v.length})`);
    }
  }
  console.log('level, per dynamic (every key): RMS error dB / median');
  for (const d of DYNAMICS) {
    const v = errs.filter((e) => e.key.startsWith(`piano:${d}:`)).map((e) => e.errs.level);
    console.log(`  ${d}  ${f(rms(v), 1)} / ${f(median(v), 1)}`);
  }
  console.log('steps in level between neighbouring keys, dB: median (90th percentile), recording | model');
  for (const d of DYNAMICS) {
    const r = evenness(pairs, d, 'ref');
    const m = evenness(pairs, d, 'model');
    console.log(`  ${d}  ${r.map((x, i) => `${x.register} ${f(x.median, 1)} (${f(x.p90, 1)}) | ${f(m[i].median, 1)} (${f(m[i].p90, 1)})`).join('   ')}`);
  }
  if (args.includes('--table')) {
    console.log('key  dyn  level ref/model  err | partials | centroid ref/model | prompt ref/model | late ref/model');
    for (const p of pairs) {
      const e = errs.find((x) => x.key === `piano:${p.dyn}:${p.midi}`)!.errs;
      console.log(`${String(p.midi).padEnd(4)} ${p.dyn}${p.held ? ' ' : '*'}  ${f(p.ref.rmsDb, 1).padStart(6)} ${f(p.model.rmsDb + gain, 1).padStart(6)} ${f(e.level, 1).padStart(6)} | ${f(e.partials, 1).padStart(5)} | ${f(p.ref.centroid, 0).padStart(5)} ${f(p.model.centroid, 0).padStart(5)} | ${f(t60(p.ref, 'early'), 1).padStart(5)} ${f(t60(p.model, 'early'), 1).padStart(5)} | ${f(t60(p.ref, 'late'), 1).padStart(5)} ${f(t60(p.model, 'late'), 1).padStart(5)}`);
    }
  }
}
