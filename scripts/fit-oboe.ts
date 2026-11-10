// Fit the oboe's voicing (packages/engine/src/core/oboe.ts OBOE_VOICE) to the Iowa MIS oboe, on the
// FIT HALF of its notes only (even MIDI numbers, scripts/judge.ts isHeldOut): the held-out half is left
// for the judge's verdict. The score is the judge's own (each measure's error over the recording's own
// note-to-note spread, averaged) for harmonics, centroid, noise and attack, plus the dynamics: how far
// the model's pp→mf and mf→ff level steps (medians) are from the recording's, in dB / 3. Pitch is left
// out (scripts/tune-oboe.ts corrects it after), as is absolute level (the microphone's gain).
//   npx tsx scripts/fit-oboe.ts [--iters 300] [--seed 1] [--from voice.json] [--out voice.json]
// A (1+1) evolution strategy in the parameters' normalised ranges, its step adapted by the 1/5 rule.
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { DYN_VEL, harmErr, matchedParams, modelNote } from './calibrate-ensemble.ts';
import { referenceNotes, type RefNote } from './ensemble-refs.ts';
import type { SustainedAnalysis } from '../packages/engine/src/analysis/index.ts';
import { regime } from './oboe-regimes.ts';
import { isHeldOut, sustainedErrors } from './judge.ts';
import { OBOE_VOICE, type OboeVoice } from '../packages/engine/src/core/oboe.ts';

/** what the search may move, and within what */
export const RANGES: Partial<Record<keyof OboeVoice, [number, number]>> = {
  zeta: [0.3, 1.8],
  zetaTop: [0.3, 1.8],
  gammaLo: [0.08, 0.7],
  gammaHi: [0.55, 0.88],
  gammaCurve: [0.4, 2.5],
  openPp: [0.15, 1],
  riseLo: [0.02, 0.06],
  riseHi: [0.003, 0.2],
  apex: [0.015, 0.06],
  cutoff: [2500, 9500],
  wall: [0.95, 0.999],
  noise: [0, 0.4],
  noiseFloor: [0, 0.02],
  hp: [80, 900],
  lowG: [-6, 15],
  f1: [800, 1700],
  g1: [-6, 18],
  q1: [0.4, 3],
  f2: [1900, 4200],
  g2: [-12, 14],
  q2: [0.5, 4],
  lp: [1500, 9000],
  lpQ: [0.5, 1.6],
  lpExp: [0, 1.2],
  lpDyn: [0, 2.5],
  shelfG: [-24, 6],
  attackBoost: [0, 2],
  tongueHold: [0.005, 0.06],
  tongueRel: [0.4, 3],
};
const KEYS = Object.keys(RANGES) as (keyof OboeVoice)[];
const MEASURES = ['harmonics', 'centroid', 'noise', 'attack'];

const median = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

// a pool of workers kept alive across evaluations (each renders its share of the notes)
let refs: RefNote[] = [];
let pool: Worker[] = [];
/** the register check: every note of the compass at pp, mf and ff, at 48 kHz (the model alone: it reads
 *  nothing of the recordings, so nothing of the held-out half) */
const REG_JOBS = Array.from({ length: 36 }, (_, i) => 58 + i).flatMap((m) => [30, 70, 112].map((vel) => ({ m, vel })));
let regimes: string[] = [];
async function render(voice: Partial<OboeVoice>): Promise<{ ref: RefNote; model: SustainedAnalysis | null }[]> {
  if (!refs.length) refs = (await referenceNotes()).filter((r) => r.instrument === 'oboe');
  if (!pool.length) pool = Array.from({ length: Math.max(1, Math.min(refs.length, cpus().length - 2)) }, () => new Worker(new URL(import.meta.url), { workerData: { fitOboe: true }, execArgv: ['--import', 'tsx'] }));
  const out: (SustainedAnalysis | null)[] = new Array(refs.length).fill(null);
  await Promise.all(
    pool.map(
      (w, k) =>
        new Promise<void>((resolve) => {
          const jobs = refs.map((r, i) => ({ i, j: { instrument: 'oboe' as const, dyn: r.dyn, midi: r.midi, params: matchedParams(r, { voice }) } })).filter((_, i) => i % pool.length === k);
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

export async function scoreVoice(voice: Partial<OboeVoice>, half: 'fit' | 'held' | 'all' = 'fit') {
  const pairs = await render(voice);
  const { errs, measures } = sustainedErrors(pairs, harmErr);
  const sel = errs.filter((e) => (half === 'all' ? true : half === 'held' ? isHeldOut(e) : !isHeldOut(e)));
  const per: Record<string, number> = {};
  for (const m of measures.filter((x) => MEASURES.includes(x.name))) {
    const v = sel.map((e) => Math.abs(e.errs[m.name]) / m.spread).filter(Number.isFinite);
    // a note the model could not analyse (silent) counts as 3 spreads off on every measure
    per[m.name] = (v.reduce((a, b) => a + b, 0) + 3 * (sel.length - v.length)) / Math.max(1, sel.length);
  }
  const missing = pairs.filter((p) => !p.model && (half === 'all' || (half === 'held') === (p.ref.midi % 2 === 1))).length;
  // dynamics: the level steps pp→mf→ff (medians over the half's notes)
  const ok = pairs.filter((p) => p.model && (half === 'all' || (half === 'held') === (p.ref.midi % 2 === 1)));
  const lvl = (d: string, k: 'ref' | 'model') => median(ok.filter((p) => p.ref.dyn === d).map((p) => (k === 'ref' ? p.ref.rmsDb : p.model!.rmsDb)));
  const step = (a: string, b: string) => Math.abs(lvl(b, 'model') - lvl(a, 'model') - (lvl(b, 'ref') - lvl(a, 'ref')));
  per.dynamics = (step('pp', 'mf') + step('mf', 'ff')) / 3;
  // the register: a note on its octave (odd harmonics 20 dB under the even ones) or its twelfth (all but
  // every third harmonic 20 dB under) is a wrong note, whatever its spectrum's other merits
  const wrong = ok.filter((p) => {
    const h = p.model!.harm;
    const mean = (ks: number[]) => {
      const v = ks.map((k) => h[k - 1]).filter(Number.isFinite);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
    };
    return mean([1, 3, 5, 7]) - mean([2, 4, 6, 8]) < -20 || mean([1, 2, 4, 5]) - mean([3, 6, 9]) < -20;
  }).length;
  // and the whole compass, every dynamic
  const off = regimes.filter((r) => r !== '1').length;
  per.register = wrong;
  per.compass = off;
  const score = MEASURES.reduce((a, k) => a + per[k], 0) / MEASURES.length + per.dynamics + 0.2 * missing + wrong / 4 + off / 4;
  return { score, per, missing };
}

const norm = (k: keyof OboeVoice, v: number) => (v - RANGES[k]![0]) / (RANGES[k]![1] - RANGES[k]![0]);
const denorm = (k: keyof OboeVoice, u: number) => RANGES[k]![0] + Math.min(1, Math.max(0, u)) * (RANGES[k]![1] - RANGES[k]![0]);

if (!isMainThread && (workerData as { fitOboe?: boolean })?.fitOboe) {
  parentPort!.on('message', (m: { jobs: { i: number; j: Parameters<typeof modelNote>[0] }[]; reg: { i: number; m: number; vel: number; voice: object }[] }) =>
    parentPort!.postMessage({ notes: m.jobs.map(({ i, j }) => ({ i, a: modelNote(j) })), reg: m.reg.map((r) => ({ i: r.i, r: regime(r.m, r.vel, 48000, r.voice) })) }),
  );
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const iters = +opt('--iters', '300');
  let seed = +opt('--seed', '1');
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const from = args.includes('--from') ? (JSON.parse(readFileSync(opt('--from', ''), 'utf8')) as Partial<OboeVoice>) : {};
  const out = opt('--out', '');
  let best: Partial<OboeVoice> = { ...Object.fromEntries(KEYS.map((k) => [k, OBOE_VOICE[k]])), ...from };
  let bestS = await scoreVoice(best);
  console.log('start', bestS.score.toFixed(3), JSON.stringify(bestS.per), 'missing', bestS.missing);
  let sigma = 0.12;
  let wins = 0;
  for (let it = 1; it <= iters; it++) {
    // move a few parameters at a time (sparse steps find the separate effects faster)
    const cand: Partial<OboeVoice> = { ...best };
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
