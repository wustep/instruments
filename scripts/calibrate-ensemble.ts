// Strings, flute, oboe, clarinet, bassoon, horn and trumpet vs the Iowa MIS recordings: render each reference note with
// the model (dry, same pitch and dynamic), analyse both with analyzeSustained(),
// compare.
//   npx tsx scripts/calibrate-ensemble.ts [--log "label"] [--only violin,flute] [--table]
// Writes apps/web/public/data/ensemble.json (measurements page) and, with --log,
// appends the summary to docs/ensemble-rounds.json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { analyzeSustained, segmentNotes, THIRD_OCT, type SustainedAnalysis } from '../packages/engine/src/analysis/index.ts';
import { renderInstrument } from '../packages/engine/src/core/index.ts';
import { pathToFileURL } from 'node:url';

/** renderer: this checkout's engine, or another one (--engine) for before/after baselines */
let RENDER = renderInstrument;
export async function useEngine(path?: string): Promise<void> {
  RENDER = path ? (await import(pathToFileURL(path).href)).renderInstrument : renderInstrument;
  ENGINE = path; // the worker pool renders with it too
}
import { ENS_DYN, referenceNotes, type Dyn, type EnsInstrument, type RefNote } from './ensemble-refs.ts';

export const DYN_VEL: Record<Dyn, number> = { pp: 30, mf: 70, ff: 112 };
const ROOT = join(import.meta.dirname, '..');
const OUT = join(ROOT, 'apps/web/public/data/ensemble.json');
const LOG = join(ROOT, 'docs/ensemble-rounds.json');
const FS = 44100;
const HOLD = 2.6;

interface Job {
  instrument: EnsInstrument;
  dyn: Dyn;
  midi: number;
  params?: Record<string, unknown>;
  /** sample rate of the render (default 44.1 kHz, the recordings') */
  fs?: number;
}

/** Render one held note and analyse it exactly as the reference notes are analysed. */
export function modelNote(j: Job): SustainedAnalysis | null {
  const fs = j.fs ?? FS;
  const r = RENDER({
    sampleRate: fs,
    instrument: j.instrument,
    dry: true,
    params: j.params as never,
    events: [
      { time: 0.1, event: { type: 'noteOn', midi: j.midi, velocity: DYN_VEL[j.dyn] } },
      { time: 0.1 + HOLD, event: { type: 'noteOff', midi: j.midi } },
    ],
    duration: HOLD + 0.8,
  });
  const x = new Float32Array(r.left.length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (r.left[i] + r.right[i]);
  const segs = segmentNotes(x, fs);
  if (!segs.length) return null;
  const seg = segs.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  return analyzeSustained(x, fs, seg, j.midi);
}

async function pool(jobs: Job[]): Promise<(SustainedAnalysis | null)[]> {
  const n = Math.min(jobs.length, Math.max(1, cpus().length - 2));
  const chunks: { i: number; j: Job }[][] = Array.from({ length: n }, () => []);
  jobs.forEach((j, i) => chunks[i % n].push({ i, j }));
  const out: (SustainedAnalysis | null)[] = new Array(jobs.length).fill(null);
  await Promise.all(
    chunks.map(
      (c) =>
        new Promise<void>((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: { ensembleJobs: c, engine: ENGINE }, execArgv: ['--import', 'tsx'] });
          w.on('message', (m: { i: number; a: SustainedAnalysis | null }[]) => {
            for (const x of m) out[x.i] = x.a;
            resolve();
          });
          w.on('error', reject);
        }),
    ),
  );
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
const r2 = (x: number) => (Number.isFinite(x) ? +x.toFixed(2) : null);

const HARM_K = 12;
/** RMS over harmonics of the level difference (each relative to its strongest harmonic). */
export function harmErr(m: SustainedAnalysis, r: SustainedAnalysis): number {
  const d: number[] = [];
  for (let k = 0; k < HARM_K; k++) {
    if (!(r.harm[k] > -45) || !Number.isFinite(m.harm[k])) continue;
    d.push(Math.max(-40, m.harm[k]) - r.harm[k]);
  }
  return d.length >= 3 ? rms(d) : NaN;
}

/** Power-average of third-octave spectra, normalised to 0 dB total over 100 Hz–10 kHz. */
function meanLtas(xs: SustainedAnalysis[]): number[] {
  const acc = THIRD_OCT.map(() => 0);
  for (const a of xs) a.ltas.forEach((v, b) => (acc[b] += Math.pow(10, v / 10)));
  let tot = 0;
  THIRD_OCT.forEach((f, b) => {
    if (f >= 100 && f <= 10000) tot += acc[b];
  });
  return acc.map((p) => 10 * Math.log10(p / (tot || 1) + 1e-30));
}
function ltasErr(m: number[], r: number[]): number {
  const d: number[] = [];
  const top = Math.max(...r);
  THIRD_OCT.forEach((f, b) => {
    if (f < 100 || f > 10000 || r[b] < top - 45) return;
    d.push(m[b] - r[b]);
  });
  return rms(d);
}
/** Power-average harmonic profile (relative to the strongest), per group of notes. */
function meanHarm(xs: SustainedAnalysis[]): number[] {
  const acc = new Array(HARM_K).fill(0);
  const cnt = new Array(HARM_K).fill(0);
  for (const a of xs)
    for (let k = 0; k < HARM_K; k++)
      if (Number.isFinite(a.harm[k])) {
        acc[k] += Math.pow(10, a.harm[k] / 10);
        cnt[k]++;
      }
  const p = acc.map((v, k) => (cnt[k] ? v / cnt[k] : NaN));
  const top = Math.max(...p.filter(Number.isFinite));
  return p.map((v) => 10 * Math.log10(v / top));
}

export interface Pair {
  ref: RefNote;
  model: SustainedAnalysis | null;
}

export function summarise(pairs: Pair[], instrument: EnsInstrument) {
  const ps = pairs.filter((p) => p.ref.instrument === instrument && p.model);
  const byDyn = (d: Dyn) => ps.filter((p) => p.ref.dyn === d);
  const lvl = (d: Dyn, k: 'ref' | 'model') => median(byDyn(d).map((p) => (k === 'ref' ? p.ref.rmsDb : p.model!.rmsDb)));
  const refL = meanLtas(ps.map((p) => p.ref));
  const modL = meanLtas(ps.map((p) => p.model!));
  // registers: thirds of the instrument's analysed range
  const ms = ps.map((p) => p.ref.midi).sort((a, b) => a - b);
  const cut = [ms[Math.floor(ms.length / 3)], ms[Math.floor((2 * ms.length) / 3)]];
  const reg = (p: Pair) => (p.ref.midi < cut[0] ? 0 : p.ref.midi < cut[1] ? 1 : 2);
  const vibRef = ps.filter((p) => p.ref.vibRate > 0);
  return {
    notes: ps.length,
    harmRmsDb: r2(median(ps.map((p) => harmErr(p.model!, p.ref)))),
    ltasRmsDb: r2(ltasErr(modL, refL)),
    ltasRmsDbByDyn: Object.fromEntries(ENS_DYN.map((d) => [d, r2(ltasErr(meanLtas(byDyn(d).map((p) => p.model!)), meanLtas(byDyn(d).map((p) => p.ref))))])),
    centroidRatio: r2(Math.pow(2, median(ps.map((p) => Math.log2(p.model!.centroid / p.ref.centroid))))),
    centroidRatioByDyn: Object.fromEntries(ENS_DYN.map((d) => [d, r2(Math.pow(2, median(byDyn(d).map((p) => Math.log2(p.model!.centroid / p.ref.centroid)))))])),
    evenOddErrDb: r2(median(ps.map((p) => p.model!.evenOddDb - p.ref.evenOddDb))),
    evenOddErrByRegister: [0, 1, 2].map((g) => r2(median(ps.filter((p) => reg(p) === g).map((p) => p.model!.evenOddDb - p.ref.evenOddDb)))),
    evenOddRef: [0, 1, 2].map((g) => r2(median(ps.filter((p) => reg(p) === g).map((p) => p.ref.evenOddDb)))),
    evenOddModel: [0, 1, 2].map((g) => r2(median(ps.filter((p) => reg(p) === g).map((p) => p.model!.evenOddDb)))),
    registerCuts: cut,
    hnrDiffDb: r2(median(ps.map((p) => p.model!.hnrDb - p.ref.hnrDb))),
    attackRatio: r2(Math.pow(2, median(ps.map((p) => Math.log2(p.model!.attackMs / p.ref.attackMs))))),
    dynSpreadDb: { ref: r2(lvl('ff', 'ref') - lvl('pp', 'ref')), model: r2(lvl('ff', 'model') - lvl('pp', 'model')) },
    vibrato: {
      refRate: r2(median(vibRef.map((p) => p.ref.vibRate))),
      refDepth: r2(median(vibRef.map((p) => p.ref.vibDepth))),
      modelRate: r2(median(vibRef.map((p) => p.model!.vibRate))),
      modelDepth: r2(median(vibRef.map((p) => p.model!.vibDepth))),
      refShare: r2(vibRef.length / Math.max(1, ps.length)),
    },
    pitchCentsRms: r2(rms(ps.map((p) => p.model!.cents))),
    // display data
    ltas: { ref: refL.map((v) => +v.toFixed(1)), model: modL.map((v) => +v.toFixed(1)) },
    harm: Object.fromEntries(
      ENS_DYN.map((d) => [d, [0, 1, 2].map((g) => {
        const sel = byDyn(d).filter((p) => reg(p) === g);
        return { ref: meanHarm(sel.map((p) => p.ref)).map((v) => r2(v)), model: meanHarm(sel.map((p) => p.model!)).map((v) => r2(v)), n: sel.length };
      })]),
    ),
  };
}

/** Like with like: where the player used no vibrato (none detected), neither does the model. */
export const matchedParams = (r: { vibRate: number }, extra?: Record<string, unknown>) => (r.vibRate > 0 ? { ...extra } : { ...extra, vibrato: 0 });

export async function compareAll(opts: { only?: EnsInstrument[]; params?: Partial<Record<EnsInstrument, Record<string, unknown>>> } = {}) {
  const refs = (await referenceNotes()).filter((r) => !opts.only || opts.only.includes(r.instrument));
  const models = await pool(refs.map((r) => ({ instrument: r.instrument, dyn: r.dyn, midi: r.midi, params: matchedParams(r, { ...opts.params?.[r.instrument], ...(r.variant ? { size: r.variant } : {}) }) })));
  return refs.map((ref, i) => ({ ref, model: models[i] }));
}

let ENGINE: string | undefined;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--engine')) ENGINE = args[args.indexOf('--engine') + 1];
  const oi = args.indexOf('--only');
  const only = oi >= 0 ? (args[oi + 1].split(',') as EnsInstrument[]) : undefined;
  const t0 = performance.now();
  const pairs = await compareAll({ only });
  const insts = (['violin', 'viola', 'cello', 'bass', 'flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trombone', 'tuba', 'trumpet'] as EnsInstrument[]).filter((i) => !only || only.includes(i));
  const summary = Object.fromEntries(insts.map((i) => [i, summarise(pairs, i)]));
  const brief = Object.fromEntries(Object.entries(summary).map(([k, v]) => {
    const { ltas: _l, harm: _h, ...rest } = v;
    return [k, rest];
  }));
  if (args.includes('--table')) {
    for (const p of pairs) {
      if (!p.model) continue;
      console.log(`${p.ref.instrument.padEnd(6)} ${p.ref.dyn} ${p.ref.midi} | harm ref ${p.ref.harm.slice(0, 8).map((v) => v.toFixed(0).padStart(4)).join('')} | mod ${p.model.harm.slice(0, 8).map((v) => v.toFixed(0).padStart(4)).join('')} | eo ${p.ref.evenOddDb.toFixed(1)}/${p.model.evenOddDb.toFixed(1)} cent ${p.ref.centroid.toFixed(0)}/${p.model.centroid.toFixed(0)} hnr ${p.ref.hnrDb.toFixed(0)}/${p.model.hnrDb.toFixed(0)} att ${p.ref.attackMs.toFixed(0)}/${p.model.attackMs.toFixed(0)} rms ${p.ref.rmsDb.toFixed(0)}/${p.model.rmsDb.toFixed(0)}`);
    }
  }
  console.log(JSON.stringify(brief, null, 1));
  console.log(`(${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  if (!only && !ENGINE) {
    const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : [];
    writeFileSync(
      OUT,
      JSON.stringify({
        generated: new Date().toISOString(),
        reference: 'University of Iowa MIS (anechoic, KM 84 at ~5 ft): violin, viola (1996), cello (Stradivarius 1736, 2001), double bass, flute non-vibrato (2000), oboe, B♭ clarinet, bassoon, horn (1997), tenor and bass trombones (1997), tuba (1997); pp/mf/ff',
        velocities: DYN_VEL,
        thirdOct: THIRD_OCT,
        summary,
        rounds: log.map((r: { label: string; summary: unknown }) => ({ label: r.label, summary: r.summary })),
      }),
    );
    console.log(`wrote ${OUT}`);
  }
  const li = args.indexOf('--log');
  if (li >= 0) {
    const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : [];
    log.push({ label: args[li + 1], date: new Date().toISOString(), summary: brief });
    writeFileSync(LOG, JSON.stringify(log, null, 1) + '\n');
  }
}

// worker branch only for workers spawned by this file (other scripts import modelNote)
if (!isMainThread && (workerData as { ensembleJobs?: unknown })?.ensembleJobs) {
  await useEngine((workerData as { engine?: string }).engine);
  const jobs = (workerData as { ensembleJobs: { i: number; j: Job }[] }).ensembleJobs;
  parentPort!.postMessage(jobs.map(({ i, j }) => ({ i, a: modelNote(j) })));
} else if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
