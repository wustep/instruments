// Fit the horn's voicing (packages/engine/src/core/horn.ts HORN_VOICE) to the Iowa MIS horn, on the FIT HALF
// of its notes only (even MIDI numbers, scripts/judge.ts isHeldOut): the held-out half is left for the
// judge's verdict. The score is the judge's own (each measure's error over the recording's own note-to-note
// spread, averaged) for harmonics, centroid, noise and attack, plus the dynamics (the model's pp→mf and
// mf→ff level steps against the recording's, note by note, dB / 3), the level across the compass (ff, the
// one dynamic recorded over the whole of it, and mf's low against its high notes), and the register: every
// note at pp, mf and ff at the four sample rates the site meets, held 1.5 s (scripts/horn-regimes.ts), each
// one off its partial costing a quarter. Pitch is left out (scripts/tune-horn.ts corrects it after), as is
// absolute level (the gain matches it after).
//   npx tsx scripts/fit-horn.ts [--iters 300] [--seed 1] [--from voice.json] [--out voice.json] [--sigma 0.12]
// A (1+1) evolution strategy in the parameters' normalised ranges, its step adapted by the 1/5 rule.
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { harmErr, matchedParams, modelNote } from './calibrate-ensemble.ts';
import { referenceNotes, type RefNote } from './ensemble-refs.ts';
import type { SustainedAnalysis } from '../packages/engine/src/analysis/index.ts';
import { regime } from './horn-regimes.ts';
import { isHeldOut, sustainedErrors } from './judge.ts';
import { HORN_VOICE, HORN_HI, HORN_LO, type HornVoice } from '../packages/engine/src/core/horn.ts';

/** what the search may move, and within what */
export const RANGES: Partial<Record<keyof HornVoice, [number, number]>> = {
  lipQ: [8, 150],
  lipQTop: [8, 150],
  lipBelow: [0, 2],
  h0: [0, 0.5],
  hMax: [0.8, 5],
  zeta: [0.1, 2],
  zetaTop: [0.1, 2],
  gammaLo: [0.08, 0.8],
  gammaHi: [0.3, 1.6],
  gammaCurve: [0.4, 2.5],
  gammaExp: [-0.3, 0.6],
  riseLo: [0.005, 0.15],
  riseHi: [0.003, 0.1],
  riseExp: [-1, 0.3],
  tongueHold: [0.005, 0.05],
  tongueRel: [0.3, 3],
  kick: [0, 3],
  qAttack: [0, 0.95],
  qTau: [0.01, 0.2],
  attackBoost: [0, 3],
  attackTau: [0.01, 0.2],
  apexRel: [1.5, 4.5],
  steep: [0, 0.03],
  bellFc: [400, 3000],
  bellQ: [0.5, 1.2],
  wall: [0.9, 0.995],
  noise: [0, 0.4],
  noiseTop: [0, 0.4],
  hp: [30, 400],
  f1: [300, 900],
  g1: [-6, 18],
  q1: [0.25, 3],
  lp: [300, 3000],
  lpQ: [0.5, 1.6],
  lpExp: [-0.5, 1.2],
  lpDyn: [0, 3],
  shelfG: [-24, 6],
  tilt: [-8, 8],
};
const KEYS = Object.keys(RANGES) as (keyof HornVoice)[];
const MEASURES = ['harmonics', 'centroid', 'noise', 'attack'];

const median = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

// a pool of workers kept alive across evaluations (each renders its share of the notes)
let refs: RefNote[] = [];
let pool: Worker[] = [];
/** the register check: every note of the compass at pp, mf and ff, at the four sample rates the site meets,
 *  held 1.5 s and read in the mouthpiece. The model alone: it reads nothing of the recordings */
const REG_JOBS = [22050, 44100, 48000, 96000].flatMap((fs) => Array.from({ length: HORN_HI - HORN_LO + 1 }, (_, i) => HORN_LO + i).flatMap((m) => [30, 70, 112].map((vel) => ({ m, vel, fs }))));
let regimes: string[] = [];
async function render(voice: Partial<HornVoice>): Promise<{ ref: RefNote; model: SustainedAnalysis | null }[]> {
  if (!refs.length) refs = (await referenceNotes()).filter((r) => r.instrument === 'horn');
  if (!pool.length) pool = Array.from({ length: Math.max(1, Math.min(refs.length, cpus().length - 2)) }, () => new Worker(new URL(import.meta.url), { workerData: { fitHorn: true }, execArgv: ['--import', 'tsx'] }));
  const out: (SustainedAnalysis | null)[] = new Array(refs.length).fill(null);
  await Promise.all(
    pool.map(
      (w, k) =>
        new Promise<void>((resolve) => {
          const jobs = refs.map((r, i) => ({ i, j: { instrument: 'horn' as const, dyn: r.dyn, midi: r.midi, params: matchedParams(r, { voice }) } })).filter((_, i) => i % pool.length === k);
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

export async function scoreVoice(voice: Partial<HornVoice>, half: 'fit' | 'held' | 'all' = 'fit') {
  const pairs = await render(voice);
  const { errs, measures } = sustainedErrors(pairs, harmErr);
  const inHalf = (midi: number) => half === 'all' || (half === 'held') === (midi % 2 === 1);
  const sel = errs.filter((e) => (half === 'all' ? true : half === 'held' ? isHeldOut(e) : !isHeldOut(e)));
  const per: Record<string, number> = {};
  for (const m of measures.filter((x) => MEASURES.includes(x.name))) {
    const v = sel.map((e) => Math.abs(e.errs[m.name]) / m.spread).filter(Number.isFinite);
    // a note the model could not analyse (silent) counts as 3 spreads off on every measure
    per[m.name] = (v.reduce((a, b) => a + b, 0) + 3 * (sel.length - v.length)) / Math.max(1, sel.length);
  }
  const missing = pairs.filter((p) => !p.model && inHalf(p.ref.midi)).length;
  const ok = pairs.filter((p) => p.model && inHalf(p.ref.midi));
  // dynamics: each note's own step pp→mf and mf→ff against the recording's (the dynamics' note sets differ)
  const at = (d: string, m: number) => ok.find((p) => p.ref.dyn === d && p.ref.midi === m);
  const step = (a: string, b: string) => {
    const v = ok
      .filter((p) => p.ref.dyn === a && at(b, p.ref.midi))
      .map((p) => {
        const q = at(b, p.ref.midi)!;
        return q.model!.rmsDb - p.model!.rmsDb - (q.ref.rmsDb - p.ref.rmsDb);
      });
    return v.length ? Math.abs(median(v)) : 0;
  };
  per.dynamics = (step('pp', 'mf') + step('mf', 'ff')) / 3;
  // the level across the compass: ff's thirds (the one dynamic recorded over all of it) and mf's low notes
  // against its high ones (the level tilt moves nothing else the score sees, so without this it wanders)
  const lvl = (d: string, lo: number, hi: number, k: 'ref' | 'model') => median(ok.filter((p) => p.ref.dyn === d && p.ref.midi >= lo && p.ref.midi <= hi).map((p) => (k === 'ref' ? p.ref.rmsDb : p.model!.rmsDb)));
  const rstep = (d: string, a: [number, number], b: [number, number]) => {
    const x = lvl(d, b[0], b[1], 'model') - lvl(d, a[0], a[1], 'model') - (lvl(d, b[0], b[1], 'ref') - lvl(d, a[0], a[1], 'ref'));
    return Number.isFinite(x) ? Math.abs(x) : 0;
  };
  per.slope = (rstep('ff', [34, 47], [48, 61]) + rstep('ff', [48, 61], [62, 77]) + rstep('mf', [34, 47], [62, 77])) / 9;
  // a note analysed off its pitch by more than 60 cents is on another partial (a wrong note)
  const wrong = ok.filter((p) => Math.abs(p.model!.cents) > 60).length;
  const off = regimes.filter((r) => r !== '1').length;
  per.register = wrong;
  per.compass = off;
  const score = MEASURES.reduce((a, k) => a + per[k], 0) / MEASURES.length + per.dynamics + per.slope + 0.2 * missing + wrong / 4 + off / 4;
  return { score, per, missing };
}

const norm = (k: keyof HornVoice, v: number) => (v - RANGES[k]![0]) / (RANGES[k]![1] - RANGES[k]![0]);
const denorm = (k: keyof HornVoice, u: number) => RANGES[k]![0] + Math.min(1, Math.max(0, u)) * (RANGES[k]![1] - RANGES[k]![0]);

if (!isMainThread && (workerData as { fitHorn?: boolean })?.fitHorn) {
  parentPort!.on('message', (m: { jobs: { i: number; j: Parameters<typeof modelNote>[0] }[]; reg: { i: number; m: number; vel: number; fs: number; voice: object }[] }) =>
    parentPort!.postMessage({ notes: m.jobs.map(({ i, j }) => ({ i, a: modelNote(j) })), reg: m.reg.map((r) => ({ i: r.i, r: regime(r.m, r.vel, r.fs, r.voice, 1.5) })) }),
  );
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const iters = +opt('--iters', '300');
  let seed = +opt('--seed', '1');
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const from = args.includes('--from') ? (JSON.parse(readFileSync(opt('--from', ''), 'utf8')) as Partial<HornVoice>) : {};
  const out = opt('--out', '');
  let best: Partial<HornVoice> = { ...Object.fromEntries(KEYS.map((k) => [k, HORN_VOICE[k]])), ...from };
  let bestS = await scoreVoice(best);
  console.log('start', bestS.score.toFixed(3), JSON.stringify(Object.fromEntries(Object.entries(bestS.per).map(([k, v]) => [k, +v.toFixed(2)]))), 'missing', bestS.missing);
  let sigma = +opt('--sigma', '0.12');
  let wins = 0;
  for (let it = 1; it <= iters; it++) {
    // move a few parameters at a time (sparse steps find the separate effects faster)
    const cand: Partial<HornVoice> = { ...best };
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
