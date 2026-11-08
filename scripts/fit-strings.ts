// Fit the bowed strings' radiation balance, dynamics and high-frequency string loss to
// the Iowa MIS recordings (analysis only), per instrument:
//   hf        statistical high-frequency body radiation: gain on the bridge force, corner
//   eq        gains of the bridge-hill formant and the low-frequency radiation shelf
//   bowSpeed  bow speed range mapped from velocity (pp…ff level spread)
//   forceDyn  bow force (× Schelleng fraction) at pp and ff (brightening with dynamics)
//   t60[1]    string loss at 3 kHz (corner sharpness)
// Targets: third-octave long-term spectrum per dynamic, harmonic profile H1–H10 per
// register and dynamic, and the pp→ff level spread.
//   npx tsx scripts/fit-strings.ts violin [--iters 60] [--lambda 12] [--write]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { THIRD_OCT } from '../packages/engine/src/analysis/index.ts';
import { BOWED } from '../packages/engine/src/core/bowed.ts';
import { DYN_VEL, modelNote } from './calibrate-ensemble.ts';
import { ENS_CACHE, type Dyn, type EnsInstrument, type RefNote } from './ensemble-refs.ts';

const FIT = join(import.meta.dirname, '..', 'packages/engine/src/core/bowed-fit.json');
const DYNS: Dyn[] = ['pp', 'mf', 'ff'];
const median = (a: number[]) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
type Inst = 'violin' | 'viola' | 'cello';
interface Over { hf: [number, number]; eq: [number, number, number][]; bowSpeed: [number, number]; forceDyn: [number, number]; t60: [number, number] }

const SPACE = [
  { k: 'hfG', lo: 3e-4, hi: 0.3, log: true },
  { k: 'hfF', lo: 600, hi: 6000, log: true },
  { k: 'hill', lo: -6, hi: 12 },
  { k: 'low', lo: -12, hi: 6 },
  { k: 'vLo', lo: 0.012, hi: 0.1, log: true },
  { k: 'vHi', lo: 0.2, hi: 1.5, log: true },
  { k: 'fPp', lo: 0.4, hi: 1.6, log: true },
  { k: 'fFf', lo: 0.6, hi: 2.6, log: true },
  { k: 't60H', lo: 0.3, hi: 4, log: true },
];
function toOver(inst: Inst, z: number[]): Over {
  const d = BOWED[inst];
  const v: Record<string, number> = {};
  SPACE.forEach((p, i) => {
    const t = Math.min(1, Math.max(0, z[i]));
    v[p.k] = p.log ? Math.exp(Math.log(p.lo) + t * (Math.log(p.hi) - Math.log(p.lo))) : p.lo + t * (p.hi - p.lo);
  });
  return {
    hf: [v.hfG, v.hfF],
    eq: [[d.eq[0][0], v.hill, d.eq[0][2]], [d.eq[1][0], v.low, d.eq[1][2]]],
    bowSpeed: [v.vLo, v.vHi],
    forceDyn: [v.fPp, v.fFf],
    t60: [d.t60[0], v.t60H],
  };
}
function fromOver(o: Over): number[] {
  const v: Record<string, number> = { hfG: o.hf[0], hfF: o.hf[1], hill: o.eq[0][1], low: o.eq[1][1], vLo: o.bowSpeed[0], vHi: o.bowSpeed[1], fPp: o.forceDyn[0], fFf: o.forceDyn[1], t60H: o.t60[1] };
  return SPACE.map((p) => Math.min(1, Math.max(0, p.log ? (Math.log(v[p.k]) - Math.log(p.lo)) / (Math.log(p.hi) - Math.log(p.lo)) : (v[p.k] - p.lo) / (p.hi - p.lo))));
}

interface Target { notes: { midi: number; dyn: Dyn; reg: number; vib: boolean }[]; harm: Record<string, number[]>; rms: Record<Dyn, number>; ltas: Record<Dyn, number[]>; hnr: Record<Dyn, number> }
function meanLtas(xs: { ltas: number[] }[]): number[] {
  const acc = THIRD_OCT.map(() => 0);
  for (const a of xs) a.ltas.forEach((v, b) => (acc[b] += Math.pow(10, v / 10)));
  let tot = 0;
  THIRD_OCT.forEach((f, b) => (f >= 100 && f <= 10000 ? (tot += acc[b]) : 0));
  return acc.map((p) => 10 * Math.log10(p / (tot || 1) + 1e-30));
}
function targets(inst: Inst): Target {
  const c = JSON.parse(readFileSync(join(ENS_CACHE, 'analysis-v1.json'), 'utf8')) as Record<string, RefNote[]>;
  const ns = Object.values(c).flat().filter((n) => n.instrument === inst);
  const ms = [...new Set(ns.map((n) => n.midi))].sort((a, b) => a - b);
  const cut = [ms[Math.floor(ms.length / 3)], ms[Math.floor((2 * ms.length) / 3)]];
  const reg = (m: number) => (m < cut[0] ? 0 : m < cut[1] ? 1 : 2);
  const harm: Record<string, number[]> = {};
  const notes: Target['notes'] = [];
  for (const d of DYNS)
    for (let r = 0; r < 3; r++) {
      const sel = ns.filter((n) => n.dyn === d && reg(n.midi) === r);
      harm[`${r}${d}`] = Array.from({ length: 10 }, (_, k) => median(sel.map((n) => n.harm[k])));
      // two representative notes per group: the quartile pitches
      const pm = [...new Set(sel.map((n) => n.midi))].sort((a, b) => a - b);
      for (const m of [pm[0], pm[Math.floor(pm.length / 2)], pm[pm.length - 1]].filter((x, i, a) => a.indexOf(x) === i))
        if (m !== undefined) notes.push({ midi: m, dyn: d, reg: r, vib: sel.some((n) => n.midi === m && n.vibRate > 0) });
    }
  return {
    notes,
    harm,
    rms: Object.fromEntries(DYNS.map((d) => [d, median(ns.filter((n) => n.dyn === d).map((n) => n.rmsDb))])) as Record<Dyn, number>,
    ltas: Object.fromEntries(DYNS.map((d) => [d, meanLtas(ns.filter((n) => n.dyn === d))])) as Record<Dyn, number[]>,
    hnr: Object.fromEntries(DYNS.map((d) => [d, median(ns.filter((n) => n.dyn === d).map((n) => n.hnrDb))])) as Record<Dyn, number>,
  };
}

function loss(inst: Inst, o: Over, T: Target) {
  Object.assign(BOWED[inst], o);
  // like with like: no model vibrato where the player used none
  const res = T.notes.map((n) => ({ n, a: modelNote({ instrument: inst as EnsInstrument, dyn: n.dyn, midi: n.midi, params: n.vib ? undefined : { vibrato: 0 } }) }));
  let lt = 0;
  for (const d of DYNS) {
    const m = meanLtas(res.filter((x) => x.n.dyn === d && x.a).map((x) => x.a!));
    const r = T.ltas[d];
    const top = Math.max(...r);
    const e: number[] = [];
    THIRD_OCT.forEach((f, b) => {
      if (f >= 100 && f <= 10000 && r[b] > top - 45) e.push(m[b] - r[b]);
    });
    lt += Math.sqrt(e.reduce((s, v) => s + v * v, 0) / e.length) / 3;
  }
  let hm = 0;
  let ng = 0;
  for (const d of DYNS)
    for (let r = 0; r < 3; r++) {
      const sel = res.filter((x) => x.n.dyn === d && x.n.reg === r && x.a);
      if (!sel.length) continue;
      const mh = Array.from({ length: 10 }, (_, k) => median(sel.map((x) => x.a!.harm[k])));
      const th = T.harm[`${r}${d}`];
      let e = 0;
      let c = 0;
      for (let k = 0; k < 10; k++) {
        if (!(th[k] > -45)) continue;
        e += (Math.max(-45, Number.isFinite(mh[k]) ? mh[k] : -45) - th[k]) ** 2;
        c++;
      }
      if (c) {
        hm += Math.sqrt(e / c);
        ng++;
      }
    }
  hm /= Math.max(1, ng);
  const lv = (d: Dyn) => median(res.filter((x) => x.n.dyn === d && x.a).map((x) => x.a!.rmsDb));
  const spread = Math.abs(lv('ff') - lv('pp') - (T.rms.ff - T.rms.pp)) + 0.5 * Math.abs(lv('mf') - lv('pp') - (T.rms.mf - T.rms.pp));
  const bad = res.filter((x) => !x.a || !Number.isFinite(x.a.cents) || Math.abs(x.a.cents) > 30).length;
  // round 2b: a clean Helmholtz tone matters as much as the spectrum — penalise extra noise
  // between the harmonics (scratchy, raucous bowing) and pitch drift (force flattening)
  let hnr = 0;
  for (const d of DYNS) hnr += Math.max(0, T.hnr[d] - median(res.filter((x) => x.n.dyn === d && x.a).map((x) => x.a!.hnrDb))) / 3;
  const ok = res.filter((x) => x.a && Number.isFinite(x.a.cents));
  const pitch = Math.sqrt(ok.reduce((s2, x) => s2 + x.a!.cents ** 2, 0) / Math.max(1, ok.length));
  return {
    total: lt + hm + 0.5 * spread + 0.4 * hnr + 0.3 * pitch + 15 * bad,
    parts: { ltas: +lt.toFixed(2), harm: +hm.toFixed(2), spread: +spread.toFixed(2), hnr: +hnr.toFixed(2), pitch: +pitch.toFixed(2), bad },
  };
}

if (!isMainThread) {
  const { inst, z, T } = workerData as { inst: Inst; z: number[]; T: Target };
  parentPort!.postMessage(loss(inst, toOver(inst, z), T));
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const inst = args[0] as Inst;
  const iters = +(args[args.indexOf('--iters') + 1] || 60);
  const lambda = args.includes('--lambda') ? +args[args.indexOf('--lambda') + 1] : 12;
  const T = targets(inst);
  const d = BOWED[inst];
  let best = fromOver({ hf: d.hf, eq: d.eq.slice(0, 2) as [number, number, number][], bowSpeed: d.bowSpeed, forceDyn: d.forceDyn, t60: d.t60 });
  const evalZ = (z: number[]) =>
    new Promise<{ total: number; parts: Record<string, number> }>((res, rej) => {
      const w = new Worker(new URL(import.meta.url), { workerData: { inst, z, T }, execArgv: ['--import', 'tsx'] });
      w.on('message', res);
      w.on('error', rej);
    });
  let bestL = await evalZ(best);
  console.log('start', bestL.total.toFixed(2), JSON.stringify(bestL.parts));
  let seed = 777;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  let sigma = 0.15;
  for (let it = 0; it < iters; it++) {
    const cands = Array.from({ length: lambda }, () => best.map((x) => Math.min(1, Math.max(0, x + sigma * gauss()))));
    const ls = await Promise.all(cands.map(evalZ));
    let bi = -1;
    ls.forEach((l, i) => {
      if (l.total < (bi < 0 ? bestL.total : ls[bi].total)) bi = i;
    });
    if (bi >= 0) {
      best = cands[bi];
      bestL = ls[bi];
      sigma = Math.min(0.3, sigma * 1.15);
    } else sigma = Math.max(0.02, sigma * 0.8);
    console.log(`it ${it} sigma ${sigma.toFixed(3)} best ${bestL.total.toFixed(2)} ${JSON.stringify(bestL.parts)}`);
  }
  const o = toOver(inst, best);
  const r3 = (x: number) => +x.toPrecision(3);
  const out = { hf: o.hf.map(r3), eq: o.eq.map((e) => e.map(r3)), bowSpeed: o.bowSpeed.map(r3), forceDyn: o.forceDyn.map(r3), t60: o.t60.map(r3) };
  console.log(JSON.stringify(out));
  if (args.includes('--write')) {
    const cur = existsSync(FIT) ? JSON.parse(readFileSync(FIT, 'utf8')) : {};
    cur[inst] = out;
    writeFileSync(FIT, JSON.stringify(cur, null, 1) + '\n');
    console.log(`wrote ${FIT}`);
  }
  void DYN_VEL;
}
