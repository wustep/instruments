// Fit the trombone's voicing (packages/engine/src/core/trombone.ts TROMBONE_VOICE) to the Iowa MIS tenor and bass
// trombones, on the FIT HALF of their notes only (even MIDI numbers, scripts/judge.ts isHeldOut): the held-out
// half is left for the judge's verdict. The bore's measures are the instruments' own and are not moved; what
// the search moves is the lips, the breath, the mouthpiece's cup and throat (× their measured values), the
// wall, the rim, the steepening (× the air's own) and the radiation's colour. The score is the judge's own
// (each measure's error over the recording's note-to-note spread, averaged) for harmonics, centroid, noise
// and attack, plus the dynamics (the pp→mf and mf→ff level steps, note by note, against the recording's, dB / 3),
// the level across the compass, and the register: every note of the three sizes at pp, mf and ff at the four
// sample rates the site meets, held 1.5 s (scripts/trombone-regimes.ts), each off its partial costing a
// quarter. Pitch is left out (scripts/tune-trombone.ts corrects it after), as is absolute level.
//   npx tsx scripts/fit-trombone.ts [--iters 300] [--seed 1] [--from voice.json] [--out voice.json] [--sigma 0.12]
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { harmErr, matchedParams, modelNote } from './calibrate-ensemble.ts';
import { referenceNotes, type RefNote } from './ensemble-refs.ts';
import type { SustainedAnalysis } from '../packages/engine/src/analysis/index.ts';
import { regime } from './trombone-regimes.ts';
import { isHeldOut, sustainedErrors } from './judge.ts';
import { TROMBONE_VOICE, TROMBONE_SIZES, TROMBONE_SIZE_IDS, type TromboneSize, type TromboneVoice } from '../packages/engine/src/core/trombone.ts';

export const RANGES: Partial<Record<keyof TromboneVoice, [number, number]>> = {
  lipQ: [8, 150],
  lipQTop: [8, 150],
  lipBelow: [-0.5, 2],
  stiff: [1e6, 1.2e7],
  stiffExp: [0.6, 2.4],
  h0: [0, 5e-4],
  hMax: [1e-3, 6e-3],
  width: [0.006, 0.02],
  pLo: [50, 2500],
  pHi: [2500, 14000],
  gammaCurve: [0.4, 2.5],
  gammaExp: [-0.3, 1],
  riseLo: [0.005, 0.4],
  riseHi: [0.003, 0.25],
  riseExp: [-1, 0.4],
  onset: [0, 0.9],
  tongueHold: [0.004, 0.05],
  tongueRel: [0.3, 4],
  kick: [0, 3],
  qAttack: [0, 0.95],
  qTau: [0.01, 0.3],
  cupScale: [0.8, 2.5],
  throatScale: [0.6, 2],
  wallScale: [0.6, 1.6],
  rimFc: [0.6, 1.8],
  rimQ: [0.5, 1.2],
  steep: [0, 5],
  noise: [0, 0.6],
  noiseTop: [0, 0.6],
  hp: [20, 250],
  f1: [300, 4000],
  g1: [-6, 18],
  q1: [0.3, 3],
  lp: [800, 12000],
  lpQ: [0.5, 1.5],
  lpExp: [-0.5, 1.2],
  lpDyn: [0, 5],
  shelfF: [300, 4000],
  shelfG: [-24, 18],
  tilt: [-8, 8],
};
// (--keys a,b,c: move only these)
const ONLY = process.argv.includes('--keys') ? process.argv[process.argv.indexOf('--keys') + 1].split(',') : null;
const KEYS = (Object.keys(RANGES) as (keyof TromboneVoice)[]).filter((k) => !ONLY || ONLY.includes(k));
const MEASURES = ['harmonics', 'centroid', 'noise', 'attack'];

const median = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

let refs: RefNote[] = [];
let pool: Worker[] = [];
const FSS = [22050, 44100, 48000, 96000];
/** the register check: every note of the three sizes at pp, mf and ff at the four rates (every other note
 *  at the two rates the site meets least, to keep an evaluation near three seconds) */
const REG_JOBS = TROMBONE_SIZE_IDS.flatMap((size) =>
  FSS.flatMap((fs) =>
    Array.from({ length: TROMBONE_SIZES[size].hi - TROMBONE_SIZES[size].lo + 1 }, (_, i) => TROMBONE_SIZES[size].lo + i)
      .filter((m) => fs === 44100 || fs === 48000 || m % 2 === 0)
      .flatMap((m) => [30, 70, 112].map((vel) => ({ m, vel, fs, size }))),
  ),
);
let regimes: string[] = [];
async function render(voice: Partial<TromboneVoice>): Promise<{ ref: RefNote; model: SustainedAnalysis | null }[]> {
  if (!refs.length) refs = (await referenceNotes()).filter((r) => r.instrument === 'trombone');
  if (!pool.length) pool = Array.from({ length: Math.max(1, cpus().length - 2) }, () => new Worker(new URL(import.meta.url), { workerData: { fitTbn: true }, execArgv: ['--import', 'tsx'] }));
  const out: (SustainedAnalysis | null)[] = new Array(refs.length).fill(null);
  await Promise.all(
    pool.map(
      (w, k) =>
        new Promise<void>((resolve) => {
          const jobs = refs.map((r, i) => ({ i, j: { instrument: 'trombone' as const, dyn: r.dyn, midi: r.midi, params: matchedParams(r, { voice, ...(r.variant ? { size: r.variant } : {}) }) } })).filter((_, i) => i % pool.length === k);
          const reg = REG_JOBS.map((r, i) => ({ i, ...r, voice })).filter((_, i) => i % pool.length === k);
          w.once('message', (m: { notes: { i: number; a: SustainedAnalysis | null }[]; reg: { i: number; r: string }[] }) => {
            for (const x of m.notes) out[x.i] = x.a;
            for (const x of m.reg) regimes[x.i] = x.r;
            resolve();
          });
          w.postMessage({ jobs, reg });
        }),
    ),
  );
  return refs.map((ref, i) => ({ ref, model: out[i] }));
}
export const closePool = () => {
  for (const w of pool) void w.terminate();
  pool = [];
};

export async function scoreVoice(voice: Partial<TromboneVoice>, half: 'fit' | 'held' | 'all' = 'fit') {
  const pairs = await render(voice);
  const { errs, measures } = sustainedErrors(pairs, harmErr);
  const inHalf = (midi: number) => half === 'all' || (half === 'held') === (midi % 2 === 1);
  const sel = errs.filter((e) => (half === 'all' ? true : half === 'held' ? isHeldOut(e) : !isHeldOut(e)));
  const per: Record<string, number> = {};
  for (const m of measures.filter((x) => MEASURES.includes(x.name))) {
    const v = sel.map((e) => Math.abs(e.errs[m.name]) / m.spread).filter(Number.isFinite);
    per[m.name] = (v.reduce((a, b) => a + b, 0) + 3 * (sel.length - v.length)) / Math.max(1, sel.length);
  }
  const missing = pairs.filter((p) => !p.model && inHalf(p.ref.midi)).length;
  const ok = pairs.filter((p) => p.model && inHalf(p.ref.midi));
  const set = (p: { ref: RefNote }) => p.ref.variant ?? 'tenor';
  const at = (s: string, d: string, m: number) => ok.find((p) => set(p) === s && p.ref.dyn === d && p.ref.midi === m);
  const step = (a: string, b: string) => {
    const v = ok
      .filter((p) => p.ref.dyn === a && at(set(p), b, p.ref.midi))
      .map((p) => {
        const q = at(set(p), b, p.ref.midi)!;
        return q.model!.rmsDb - p.model!.rmsDb - (q.ref.rmsDb - p.ref.rmsDb);
      });
    return v.length ? Math.abs(median(v)) : 0;
  };
  per.dynamics = (step('pp', 'mf') + step('mf', 'ff')) / 3;
  // the level across the compass (each set's ff and mf, low third against the high), and the bass set against
  // the tenor's (one gain plays both)
  const lvl = (s: string, d: string, lo: number, hi: number, k: 'ref' | 'model') => median(ok.filter((p) => set(p) === s && p.ref.dyn === d && p.ref.midi >= lo && p.ref.midi <= hi).map((p) => (k === 'ref' ? p.ref.rmsDb : p.model!.rmsDb)));
  const rstep = (s: string, d: string, a: [number, number], b: [number, number]) => {
    const x = lvl(s, d, b[0], b[1], 'model') - lvl(s, d, a[0], a[1], 'model') - (lvl(s, d, b[0], b[1], 'ref') - lvl(s, d, a[0], a[1], 'ref'));
    return Number.isFinite(x) ? Math.abs(x) : 0;
  };
  const sets = () => {
    const x = lvl('bass', 'mf', 36, 60, 'model') - lvl('tenor', 'mf', 36, 60, 'model') - (lvl('bass', 'mf', 36, 60, 'ref') - lvl('tenor', 'mf', 36, 60, 'ref'));
    return Number.isFinite(x) ? Math.abs(x) : 0;
  };
  per.slope = (rstep('tenor', 'ff', [40, 51], [60, 72]) + rstep('tenor', 'mf', [40, 51], [60, 72]) + rstep('bass', 'ff', [26, 40], [52, 65]) + rstep('bass', 'mf', [26, 40], [52, 67]) + sets()) / 12;
  const wrong = ok.filter((p) => Math.abs(p.model!.cents) > 60).length;
  const off = regimes.filter((r) => r !== '1').length;
  per.register = wrong;
  per.compass = off;
  const score = MEASURES.reduce((a, k) => a + per[k], 0) / MEASURES.length + per.dynamics + per.slope + 0.2 * missing + wrong / 4 + off / 4;
  return { score, per, missing };
}

const norm = (k: keyof TromboneVoice, v: number) => (v - RANGES[k]![0]) / (RANGES[k]![1] - RANGES[k]![0]);
const denorm = (k: keyof TromboneVoice, u: number) => RANGES[k]![0] + Math.min(1, Math.max(0, u)) * (RANGES[k]![1] - RANGES[k]![0]);

if (!isMainThread && (workerData as { fitTbn?: boolean })?.fitTbn) {
  parentPort!.on('message', (m: { jobs: { i: number; j: Parameters<typeof modelNote>[0] }[]; reg: { i: number; m: number; vel: number; fs: number; size: TromboneSize; voice: object }[] }) =>
    parentPort!.postMessage({ notes: m.jobs.map(({ i, j }) => ({ i, a: modelNote(j) })), reg: m.reg.map((r) => ({ i: r.i, r: regime(r.m, r.vel, r.fs, r.size, r.voice, 1.5) })) }),
  );
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const iters = +opt('--iters', '300');
  let seed = +opt('--seed', '1');
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const from = args.includes('--from') ? (JSON.parse(readFileSync(opt('--from', ''), 'utf8')) as Partial<TromboneVoice>) : {};
  const out = opt('--out', '');
  let best: Partial<TromboneVoice> = { ...Object.fromEntries((Object.keys(RANGES) as (keyof TromboneVoice)[]).map((k) => [k, TROMBONE_VOICE[k]])), ...from };
  let bestS = await scoreVoice(best);
  console.log('start', bestS.score.toFixed(3), JSON.stringify(Object.fromEntries(Object.entries(bestS.per).map(([k, v]) => [k, +v.toFixed(2)]))), 'missing', bestS.missing);
  if (args.includes('--score')) {
    const held = await scoreVoice(best, 'held');
    console.log('held-out', held.score.toFixed(3), JSON.stringify(Object.fromEntries(Object.entries(held.per).map(([k, v]) => [k, +v.toFixed(2)]))));
    closePool();
    process.exit(0);
  }
  let sigma = +opt('--sigma', '0.12');
  let wins = 0;
  for (let it = 1; it <= iters; it++) {
    const cand: Partial<TromboneVoice> = { ...best };
    const n = 1 + Math.floor(rand() * 4);
    for (let j = 0; j < n; j++) {
      const k = KEYS[Math.floor(rand() * KEYS.length)];
      cand[k] = denorm(k, norm(k, best[k] as number) + sigma * gauss());
    }
    const s = await scoreVoice(cand);
    if (s.score < bestS.score) {
      best = cand;
      bestS = s;
      wins++;
      console.log(`${it} ${s.score.toFixed(3)} σ${sigma.toFixed(3)} ${JSON.stringify(Object.fromEntries(Object.entries(s.per).map(([k, v]) => [k, +v.toFixed(2)])))} miss ${s.missing}`);
      if (out) writeFileSync(out, JSON.stringify(best, null, 1));
    }
    if (it % 20 === 0) {
      sigma *= wins / 20 > 0.2 ? 1.3 : 0.75;
      sigma = Math.min(0.3, Math.max(0.01, sigma));
      wins = 0;
    }
  }
  const held = await scoreVoice(best, 'held');
  console.log('fit', bestS.score.toFixed(3), 'held-out', held.score.toFixed(3), JSON.stringify(held.per));
  console.log(JSON.stringify(best));
  closePool();
}
