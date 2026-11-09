// Fit the cello's radiation chain v2 and dynamics to the Iowa MIS cello (analysis only), on the
// FIT half of the notes only (even MIDI numbers): the odd half is what scripts/judge.ts holds out.
//   npx tsx scripts/fit-cello.ts --eval '{"outputGain": 30}'   one configuration: summary + LTAS
//   npx tsx scripts/fit-cello.ts --fit [--iters 40] [--lambda 16] [--write]
// The objective is the judge's own per-note score (|error| / the recording's spread, over
// harmonics, centroid, noise, attack, pitch, level), plus the long-term third-octave spectrum
// per dynamic and the pp→ff level spread.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { THIRD_OCT, type SustainedAnalysis } from '../packages/engine/src/analysis/index.ts';
import { BOWED } from '../packages/engine/src/core/bowed.ts';
import { harmErr, matchedParams, modelNote } from './calibrate-ensemble.ts';
import { ENS_CACHE, type Dyn, type RefNote } from './ensemble-refs.ts';
import { localSpread } from './judge.ts';

const FIT = join(import.meta.dirname, '..', 'packages/engine/src/core/bowed-fit.json');
const DYNS: Dyn[] = ['pp', 'mf', 'ff'];
type Over = Record<string, unknown>;
interface Job {
  i: number;
  midi: number;
  dyn: Dyn;
  params: Record<string, unknown>;
}

if (!isMainThread) {
  parentPort!.on('message', (m: { over: Over; jobs: Job[] }) => {
    Object.assign(BOWED.cello, structuredClone(m.over));
    parentPort!.postMessage(m.jobs.map((j) => ({ i: j.i, a: modelNote({ instrument: 'cello', dyn: j.dyn, midi: j.midi, params: j.params }) })));
  });
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const all = (JSON.parse(readFileSync(join(ENS_CACHE, 'analysis-v1.json'), 'utf8')) as Record<string, RefNote[]>);
  const refs = Object.values(all).flat().filter((n) => n.instrument === 'cello');
  const fitRefs = refs.filter((r) => r.midi % 2 === 0);
  const NW = Math.max(1, cpus().length - 2);
  const workers = Array.from({ length: NW }, () => new Worker(new URL(import.meta.url), { execArgv: ['--import', 'tsx'] }));
  const run = (over: Over, rs: RefNote[]) =>
    new Promise<(SustainedAnalysis | null)[]>((resolve) => {
      const jobs: Job[] = rs.map((r, i) => ({ i, midi: r.midi, dyn: r.dyn, params: matchedParams(r) }));
      const out: (SustainedAnalysis | null)[] = new Array(rs.length).fill(null);
      let left = NW;
      workers.forEach((w, k) => {
        const mine = jobs.filter((_, i) => i % NW === k);
        w.once('message', (res: { i: number; a: SustainedAnalysis | null }[]) => {
          for (const x of res) out[x.i] = x.a;
          if (--left === 0) resolve(out);
        });
        w.postMessage({ over, jobs: mine });
      });
    });
  const g = (r: RefNote) => `${r.dyn}`;
  const spreads = {
    harmonics: 3,
    centroid: localSpread(refs.map((r) => ({ midi: r.midi, group: g(r), v: Math.log2(r.centroid) }))),
    noise: localSpread(refs.map((r) => ({ midi: r.midi, group: g(r), v: r.hnrDb }))),
    attack: localSpread(refs.map((r) => ({ midi: r.midi, group: g(r), v: Math.log2(r.attackMs) }))),
    pitch: Math.max(1, localSpread(refs.map((r) => ({ midi: r.midi, group: g(r), v: r.cents })))),
    level: localSpread(refs.map((r) => ({ midi: r.midi, group: g(r), v: r.rmsDb }))),
  };
  const meanLtas = (xs: { ltas: number[] }[]) => {
    const acc = THIRD_OCT.map(() => 0);
    for (const a of xs) a.ltas.forEach((v, b) => (acc[b] += Math.pow(10, v / 10)));
    let tot = 0;
    THIRD_OCT.forEach((f, b) => (f >= 100 && f <= 10000 ? (tot += acc[b]) : 0));
    return acc.map((p) => 10 * Math.log10(p / (tot || 1) + 1e-30));
  };
  const median = (a: number[]) => {
    const s = a.filter(Number.isFinite).sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : NaN;
  };
  const mean = (a: number[]) => {
    const s = a.filter(Number.isFinite);
    return s.length ? s.reduce((x, y) => x + y, 0) / s.length : NaN;
  };
  function score(rs: RefNote[], ms: (SustainedAnalysis | null)[]) {
    const per: Record<string, number[]> = { harmonics: [], centroid: [], noise: [], attack: [], pitch: [], level: [] };
    const notes: number[] = [];
    let bad = 0;
    rs.forEach((r, i) => {
      const m = ms[i];
      if (!m || !Number.isFinite(m.cents)) {
        bad++;
        return;
      }
      const e: Record<string, number> = {
        harmonics: harmErr(m, r),
        centroid: Math.log2(m.centroid / r.centroid),
        noise: m.hnrDb - r.hnrDb,
        attack: Math.log2(m.attackMs / r.attackMs),
        pitch: m.cents,
        level: m.rmsDb - r.rmsDb,
      };
      const zs = Object.entries(e).map(([k, v]) => Math.abs(v) / spreads[k as keyof typeof spreads]).filter(Number.isFinite);
      notes.push(mean(zs));
      for (const [k, v] of Object.entries(e)) per[k].push(Math.abs(v));
    });
    let lt = 0;
    const ltDyn: Record<string, number> = {};
    for (const d of DYNS) {
      const sel = rs.map((r, i) => [r, ms[i]] as const).filter(([r, m]) => r.dyn === d && m);
      const mm = meanLtas(sel.map(([, m]) => m!));
      const rr = meanLtas(sel.map(([r]) => r));
      const top = Math.max(...rr);
      const e: number[] = [];
      THIRD_OCT.forEach((f, b) => {
        if (f >= 100 && f <= 10000 && rr[b] > top - 45) e.push(mm[b] - rr[b]);
      });
      ltDyn[d] = Math.sqrt(e.reduce((s, v) => s + v * v, 0) / e.length);
      lt += ltDyn[d] / 3;
    }
    const lv = (d: Dyn, k: 'r' | 'm') => median(rs.map((r, i) => (r.dyn === d && ms[i] ? (k === 'r' ? r.rmsDb : ms[i]!.rmsDb) : NaN)));
    const spread = Math.abs(lv('ff', 'm') - lv('pp', 'm') - (lv('ff', 'r') - lv('pp', 'r')));
    const judgeScore = mean(notes);
    const pitchRms = Math.sqrt(mean(rs.map((_, i) => (ms[i] ? ms[i]!.cents ** 2 : NaN))));
    const cent = Math.pow(2, median(rs.map((r, i) => (ms[i] ? Math.log2(ms[i]!.centroid / r.centroid) : NaN))));
    return {
      total: judgeScore + 0.12 * lt + 0.05 * spread + 2 * bad,
      judge: +judgeScore.toFixed(3),
      ltas: +lt.toFixed(2),
      ltDyn: Object.fromEntries(Object.entries(ltDyn).map(([k, v]) => [k, +v.toFixed(1)])),
      spread: +spread.toFixed(1),
      pitchRms: +pitchRms.toFixed(2),
      centroid: +cent.toFixed(2),
      harm: +median(per.harmonics).toFixed(1),
      level: +median(rs.map((r, i) => (ms[i] ? ms[i]!.rmsDb - r.rmsDb : NaN))).toFixed(1),
      hnr: +median(rs.map((r, i) => (ms[i] ? ms[i]!.hnrDb - r.hnrDb : NaN))).toFixed(1),
      bad,
    };
  }
  const base: Over = existsSync(FIT) ? (JSON.parse(readFileSync(FIT, 'utf8')).cello ?? {}) : {};
  if (args.includes('--eval')) {
    const over = { ...base, ...JSON.parse(opt('--eval') ?? '{}') };
    const ms = await run(over, refs);
    console.log('all     ', JSON.stringify(score(refs, ms)));
    const fi = refs.map((r, i) => [r, ms[i]] as const);
    console.log('fit half', JSON.stringify(score(fi.filter(([r]) => r.midi % 2 === 0).map(([r]) => r), fi.filter(([r]) => r.midi % 2 === 0).map(([, m]) => m))));
    console.log('held-out', JSON.stringify(score(fi.filter(([r]) => r.midi % 2 === 1).map(([r]) => r), fi.filter(([r]) => r.midi % 2 === 1).map(([, m]) => m))));
    const bands = THIRD_OCT.map((f, b) => [f, b] as const).filter(([f]) => f >= 63 && f <= 10000);
    for (const d of DYNS) {
      const sel = fi.filter(([r, m]) => r.dyn === d && m);
      const mm = meanLtas(sel.map(([, m]) => m!));
      const rr = meanLtas(sel.map(([r]) => r));
      if (d === 'pp') console.log('band ' + bands.map(([f]) => String(Math.round(f)).padStart(5)).join(''));
      console.log(`${d}   ` + bands.map(([, b]) => (mm[b] - rr[b]).toFixed(0).padStart(5)).join(''));
    }
    await Promise.all(workers.map((w) => w.terminate()));
    process.exit(0);
  }
  // ---------------------------------------------------------------- the search
  // parameters (normalised 0..1 in the search), with their physical ranges
  const SPACE: { k: string; lo: number; hi: number; log?: boolean }[] = [
    { k: 'hfG', lo: 1e-4, hi: 0.3, log: true },
    { k: 'hfF', lo: 800, hi: 8000, log: true },
    { k: 'hill', lo: -6, hi: 12 },
    { k: 'hillF', lo: 800, hi: 1600, log: true },
    { k: 'low', lo: -12, hi: 9 },
    { k: 'vLo', lo: 0.02, hi: 0.12, log: true },
    { k: 'vHi', lo: 0.15, hi: 1.0, log: true },
    { k: 'fPp', lo: 0.4, hi: 1.6, log: true },
    { k: 'fFf', lo: 0.5, hi: 2.4, log: true },
    // players move the bow away from the bridge to play softly (Schelleng): β at pp ≥ β at ff
    { k: 'bPp', lo: 1.0, hi: 1.6 },
    { k: 'bFf', lo: 0.55, hi: 1.0 },
    { k: 't60H', lo: 0.5, hi: 12, log: true },
    // the bridge's resonances (Reinicke: cello ≈ 1 kHz and ≈ 2 kHz), as loaded on the body
    { k: 'b1f', lo: 700, hi: 1500, log: true },
    { k: 'b1q', lo: 0.5, hi: 3, log: true },
    { k: 'b2f', lo: 1500, hi: 3500, log: true },
    { k: 'b2q', lo: 0.5, hi: 3, log: true },
    { k: 'gain', lo: 3, hi: 300, log: true },
    { k: 'statRad', lo: 0.1, hi: 3, log: true },
    { k: 'kc', lo: 0.15, hi: 1, log: true },
    // torsion (surface-referred impedance ratio, effective Q at the bow); speed ratio fixed at 5
    { k: 'tz', lo: 1.2, hi: 5, log: true },
    { k: 'tq', lo: 2.5, hi: 25, log: true },
    // HF string decay of the C, G and D strings relative to the A
    { k: 'sC', lo: 0.1, hi: 1.5, log: true },
    { k: 'sG', lo: 0.1, hi: 1.5, log: true },
    { k: 'sD', lo: 0.2, hi: 1.5, log: true },
    // bow-speed attack time constant, pp and ff
    { k: 'aPp', lo: 0.02, hi: 0.3, log: true },
    { k: 'aFf', lo: 0.01, hi: 0.15, log: true },
    // the bow's contact width, m: at most the cello ribbon's ~ 1.5 cm, down to a tilted bow's edge
    { k: 'bw', lo: 0.004, hi: 0.015, log: true },
    // rosin noise: the friction coefficient's random fluctuation
    { k: 'rosin', lo: 0.01, hi: 0.25, log: true },
  ];
  // --fix aPp,aFf: hold these at their start values (out of the search); --free aPp,aFf: hold all
  // the others
  const FIXED = new Set((opt('--fix') ?? '').split(',').filter(Boolean));
  const FREE = (opt('--free') ?? '').split(',').filter(Boolean);
  if (FREE.length) for (const p of SPACE) if (!FREE.includes(p.k)) FIXED.add(p.k);
  const d0 = BOWED.cello;
  const toOver = (z: number[]): Over => {
    const v: Record<string, number> = {};
    SPACE.forEach((p, i) => {
      const t = Math.min(1, Math.max(0, z[i]));
      v[p.k] = p.log ? Math.exp(Math.log(p.lo) + t * (Math.log(p.hi) - Math.log(p.lo))) : p.lo + t * (p.hi - p.lo);
    });
    const r3 = (x: number) => +x.toPrecision(3);
    return {
      hf: [r3(v.hfG), r3(v.hfF)],
      eq: [[r3(v.hillF), r3(v.hill), d0.eq[0][2]], [d0.eq[1][0], r3(v.low), d0.eq[1][2]]],
      bowSpeed: [r3(v.vLo), r3(v.vHi)],
      forceDyn: [r3(v.fPp), r3(v.fFf)],
      betaDyn: [r3(v.bPp), r3(v.bFf)],
      t60: [d0.t60[0], r3(v.t60H)],
      radiation: { radRef: 1000, bridge: [[r3(v.b1f), r3(v.b1q)], [r3(v.b2f), r3(v.b2q)]], statRad: r3(v.statRad) },
      outputGain: r3(v.gain),
      idleCoupling: r3(v.kc),
      torsion: { speedRatio: 5, impedanceRatio: r3(v.tz), q: r3(v.tq) },
      t60HString: [r3(v.sC), r3(v.sG), r3(v.sD), 1],
      // a soft note starts at least as slowly as a loud one (Guettler 2002)
      attackTau: [r3(Math.max(v.aPp, v.aFf)), r3(v.aFf)],
      bowWidth: r3(v.bw),
      rosinNoise: r3(v.rosin),
    };
  };
  const fromOver = (o: Over): number[] => {
    const a = o as { hf: number[]; eq: number[][]; bowSpeed: number[]; forceDyn: number[]; betaDyn?: number[]; t60: number[]; radiation?: { bridge: number[][] }; outputGain: number };
    const br = a.radiation?.bridge ?? [[1000, 1.2], [2200, 1.2]];
    const sr = (a.radiation as { statRad?: number } | undefined)?.statRad ?? 1;
    const v: Record<string, number> = { hfG: a.hf[0], hfF: a.hf[1], hill: a.eq[0][1], hillF: a.eq[0][0], low: a.eq[1][1], vLo: a.bowSpeed[0], vHi: a.bowSpeed[1], fPp: a.forceDyn[0], fFf: a.forceDyn[1], bPp: a.betaDyn?.[0] ?? 1, bFf: a.betaDyn?.[1] ?? 1, t60H: a.t60[1], b1f: br[0][0], b1q: br[0][1], b2f: br[1][0], b2q: br[1][1], gain: a.outputGain, statRad: sr, kc: (a as { idleCoupling?: number }).idleCoupling ?? 1 };
    const b = o as { torsion?: { impedanceRatio: number; q: number }; t60HString?: number[]; attackTau?: number[]; bowWidth?: number; rosinNoise?: number };
    Object.assign(v, { tz: b.torsion?.impedanceRatio ?? 3, tq: b.torsion?.q ?? 5, sC: b.t60HString?.[0] ?? 1, sG: b.t60HString?.[1] ?? 1, sD: b.t60HString?.[2] ?? 1, aPp: b.attackTau?.[0] ?? 0.045, aFf: b.attackTau?.[1] ?? 0.045, bw: b.bowWidth ?? d0.bowWidth ?? 0.01, rosin: b.rosinNoise ?? 0.04 });
    return SPACE.map((p) => Math.min(1, Math.max(0, p.log ? (Math.log(v[p.k]) - Math.log(p.lo)) / (Math.log(p.hi) - Math.log(p.lo)) : (v[p.k] - p.lo) / (p.hi - p.lo))));
  };
  const start: Over = { hf: d0.hf, eq: d0.eq, bowSpeed: d0.bowSpeed, forceDyn: d0.forceDyn, betaDyn: d0.betaDyn, t60: d0.t60, radiation: d0.radiation, outputGain: d0.outputGain, ...base, ...JSON.parse(opt('--start') ?? '{}') };
  const iters = +(opt('--iters') ?? 40);
  const lambda = +(opt('--lambda') ?? 8);
  let best = fromOver(start);
  const evalZ = async (z: number[]) => score(fitRefs, await run(toOver(z), fitRefs));
  let bestL = await evalZ(best);
  console.log('start', JSON.stringify(bestL), JSON.stringify(toOver(best)));
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  // (μ/μ, λ)-ES: non-elitist (robust to the bow's chaotic note-to-note sensitivity), the mean
  // moves to the best μ of λ; σ shrinks geometrically; the best point ever seen is kept
  let sigma = +(opt('--sigma') ?? 0.12);
  const sigEnd = +(opt('--sigma-end') ?? 0.03);
  const mu = Math.max(1, Math.round(lambda / 3));
  let centre = best.slice();
  for (let it = 0; it < iters; it++) {
    const pop: { z: number[]; l: Awaited<ReturnType<typeof evalZ>> }[] = [];
    for (let c = 0; c < lambda; c++) {
      const z = centre.map((x, i) => (FIXED.has(SPACE[i].k) ? x : Math.min(1, Math.max(0, x + sigma * gauss()))));
      const l = await evalZ(z);
      pop.push({ z, l });
      if (l.total < bestL.total) {
        best = z;
        bestL = l;
      }
    }
    pop.sort((a, b) => a.l.total - b.l.total);
    centre = centre.map((_, i) => pop.slice(0, mu).reduce((a, p) => a + p.z[i], 0) / mu);
    sigma *= Math.pow(sigEnd / +(opt('--sigma') ?? 0.12), 1 / iters);
    console.log(`it ${it} sigma ${sigma.toFixed(3)} gen-best ${pop[0].l.total.toFixed(3)} best ${JSON.stringify(bestL)}`);
  }
  const ml = await evalZ(centre);
  console.log('mean', JSON.stringify(ml));
  if (ml.total < bestL.total) {
    best = centre;
    bestL = ml;
  }
  const out = toOver(best);
  console.log(JSON.stringify(out));
  if (args.includes('--write')) {
    const cur = existsSync(FIT) ? JSON.parse(readFileSync(FIT, 'utf8')) : {};
    cur.cello = out;
    writeFileSync(FIT, JSON.stringify(cur, null, 1) + '\n');
    console.log(`wrote ${FIT}`);
  }
  await Promise.all(workers.map((w) => w.terminate()));
}
