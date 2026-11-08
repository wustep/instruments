// Bass aftersound: the horizontal polarisation's bridge coupling (κ) and its share of
// the hammer's energy, swept against the Iowa Steinway B late decay in A0–B1 (and
// checked in C2–B3). Same renders and analysis as scripts/calibrate.ts.
//   npx tsx scripts/fit-bass.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { analyzeNote, type NoteAnalysis } from '../packages/engine/src/analysis/index.ts';
import { DEFAULT_CALIBRATION, referenceB, renderNote, type Calibration } from '../packages/engine/src/core/index.ts';
import { CACHE, available, type Dyn } from './references.ts';

const DYN_VEL: Record<Dyn, number> = { pp: 30, mf: 70, ff: 112 };
type Variant = { name: string; kappaBass: number; excite: number; detune?: number; dur?: number; floorDb?: number };
type Job = { v: Variant; midi: number };

/** white noise at floorDb relative to the note's peak (deterministic), like a recording's floor */
function addFloor(L: Float32Array, R: Float32Array, floorDb: number): void {
  let pk = 0;
  for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const a = pk * Math.pow(10, floorDb / 20);
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 3.46;
  for (let i = 0; i < L.length; i++) {
    L[i] += a * rnd();
    R[i] += a * rnd();
  }
}

function run(j: Job): { late: number[]; early: number[] } {
  const p = DEFAULT_CALIBRATION.polarization;
  const k = p.kappa;
  const cal: Calibration = {
    ...DEFAULT_CALIBRATION,
    polarization: { ...p, excite: j.v.excite, detune: j.v.detune ?? p.detune, kappa: { midi: [21, 45, 60, 72, 84, 85, 108], val: [j.v.kappaBass, j.v.kappaBass, (j.v.kappaBass + k.val[1]) / 2, k.val[1], k.val[2], 0, 0] } },
  };
  const d: Dyn = available(j.midi, 'mf') ? 'mf' : 'ff';
  const r = renderNote(j.midi, DYN_VEL[d], j.v.dur ?? (j.midi < 48 ? 22 : 18), { sampleRate: 44100, dry: true, calibration: cal });
  if (j.v.floorDb !== undefined) addFloor(r.left, r.right, j.v.floorDb);
  const a = analyzeNote([r.left, r.right], 44100, j.midi, { Bguess: referenceB(j.midi, DEFAULT_CALIBRATION), maxDur: 30 });
  const late: number[] = [];
  const early: number[] = [];
  for (const kk of [1, 2, 3]) {
    const x = a?.decays.find((y) => y.k === kk);
    late.push(x?.t60Late ?? NaN);
    early.push(x?.t60Early ?? NaN);
  }
  return { late, early };
}

if (!isMainThread) {
  const jobs = workerData as { i: number; j: Job }[];
  parentPort!.postMessage(jobs.map(({ i, j }) => ({ i, r: run(j) })));
} else {
  const refs: Record<string, NoteAnalysis | null> = JSON.parse(readFileSync(join(CACHE, 'analysis-v3.json'), 'utf8'));
  const KEYS = [21, 25, 29, 33, 37, 41, 45, 49, 53, 57];
  const variants: Variant[] = (process.env.VARIANTS ? JSON.parse(process.env.VARIANTS) : [
    { name: 'current, 22 s', kappaBass: 0.32, excite: 0.2 },
    { name: 'current, 40 s', kappaBass: 0.32, excite: 0.2, dur: 40 },
    { name: 'current, 22 s, floor -80 dB', kappaBass: 0.32, excite: 0.2, floorDb: -80 },
  ]) as Variant[];
  const jobs: Job[] = variants.flatMap((v) => KEYS.map((midi) => ({ v, midi })));
  const n = Math.max(1, cpus().length - 2);
  const chunks: { i: number; j: Job }[][] = Array.from({ length: n }, () => []);
  jobs.forEach((j, i) => chunks[i % n].push({ i, j }));
  const res: { late: number[]; early: number[] }[] = new Array(jobs.length);
  await Promise.all(chunks.map((c) => new Promise<void>((ok, bad) => {
    const w = new Worker(new URL(import.meta.url), { workerData: c, execArgv: ['--import', 'tsx'] });
    w.on('message', (m: { i: number; r: { late: number[]; early: number[] } }[]) => { for (const x of m) res[x.i] = x.r; ok(); });
    w.on('error', bad);
  })));
  const med = (xs: number[]) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  for (const v of variants) {
    const reg = (lo: number, hi: number, w: 'late' | 'early') => {
      const r: number[] = [];
      jobs.forEach((j, i) => {
        if (j.v !== v || j.midi < lo || j.midi > hi) return;
        const d: Dyn = available(j.midi, 'mf') ? 'mf' : 'ff';
        const ra = refs[`ref:${j.midi}:${d}`];
        if (!ra) return;
        [1, 2, 3].forEach((k, q) => {
          const rd = ra.decays.find((x) => x.k === k);
          const m = res[i][w][q];
          const rv = rd ? (w === 'late' ? rd.t60Late : rd.t60Early) : NaN;
          if (Number.isFinite(m) && Number.isFinite(rv)) r.push(Math.log2(m / rv));
        });
      });
      return Math.pow(2, med(r)).toFixed(2);
    };
    console.log(`${v.name.padEnd(28)} A0–B1 late ${reg(21, 35, 'late')} early ${reg(21, 35, 'early')} | C2–B3 late ${reg(36, 59, 'late')} early ${reg(36, 59, 'early')}`);
  }
}
