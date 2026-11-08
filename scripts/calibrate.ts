// Calibration round: analyse references (cached), render the model for the same
// keys and dynamics, analyse identically, compare, and (with --fit) update the
// fitted calibration in packages/engine/src/core/calibration-fit.json.
//
//   pnpm calibrate            measure + write apps/web/public/data/calibration.json
//   pnpm calibrate --fit      also update register targets from the comparison
//   --keys 21,45,69  --quick  subsets for fast iteration
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { analyzeNote, decodeWav, type NoteAnalysis } from '../packages/engine/src/analysis/index.ts';
import { BASE_CALIBRATION, DEFAULT_CALIBRATION, PRESETS, buildKeySpecs, DEFAULT_PARAMS, referenceB, renderNote, type Calibration } from '../packages/engine/src/core/index.ts';
import { CACHE, DYNAMICS, REF_KEYS, available, wavPath, wavSeconds, type Dyn } from './references.ts';

export const DYN_VEL: Record<Dyn, number> = { pp: 30, mf: 70, ff: 112 };
const ROOT = join(import.meta.dirname, '..');
const FIT_PATH = join(ROOT, 'packages/engine/src/core/calibration-fit.json');
const OUT = join(ROOT, 'apps/web/public/data/calibration.json');
const REF_CACHE = join(CACHE, 'analysis-v3.json');

interface Job {
  kind: 'ref' | 'model';
  midi: number;
  dyn: Dyn;
  cal?: Calibration;
  dur?: number;
}

function runJob(j: Job): NoteAnalysis | null {
  const Bg = referenceB(j.midi, DEFAULT_CALIBRATION);
  if (j.kind === 'ref') {
    const p = wavPath(j.midi, j.dyn);
    if (!existsSync(p)) return null;
    const a = decodeWav(readFileSync(p));
    return analyzeNote(a.channels, a.sampleRate, j.midi, { Bguess: Bg, maxDur: 30 });
  }
  const r = renderNote(j.midi, DYN_VEL[j.dyn], j.dur ?? 12, { sampleRate: 44100, dry: true, calibration: j.cal });
  return analyzeNote([r.left, r.right], 44100, j.midi, { Bguess: Bg, maxDur: 30 });
}


async function pool(jobs: Job[]): Promise<Map<string, NoteAnalysis | null>> {
  const n = Math.min(jobs.length, Math.max(1, cpus().length - 2));
  const chunks: Job[][] = Array.from({ length: n }, () => []);
  jobs.forEach((j, i) => chunks[i % n].push(j));
  const res = new Map<string, NoteAnalysis | null>();
  await Promise.all(
    chunks.map(
      (c) =>
        new Promise<void>((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: c, execArgv: ['--import', 'tsx'] });
          w.on('message', (m: { key: string; a: NoteAnalysis | null }[]) => {
            for (const x of m) res.set(x.key, x.a);
            resolve();
          });
          w.on('error', reject);
        }),
    ),
  );
  return res;
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
/** slope (dB per partial) of the ff−pp level gain over partials above the noise */
function contrastSlope(pp: NoteAnalysis | null, ff: NoteAnalysis | null, refPp?: NoteAnalysis | null): number {
  if (!pp || !ff) return NaN;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 1; k <= 10; k++) {
    const a = pp.levels.find((x) => x.k === k);
    const b = ff.levels.find((x) => x.k === k);
    const gate = (refPp ?? pp).levels.find((x) => x.k === k);
    // levels below −98 dB are "partial not found" on either side (round 2: gate both)
    if (!a || !b || !gate || gate.db < -98 || a.db < -98 || b.db < -98) continue;
    xs.push(k);
    ys.push(b.db - a.db);
  }
  if (xs.length < 3) return NaN;
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return num / den;
}
const fin = (x: number | null) => (x !== null && Number.isFinite(x) ? +x.toFixed(2) : null);
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fit = args.includes('--fit');
  const quick = args.includes('--quick');
  const ki = args.indexOf('--keys');
  const keys = ki >= 0 ? args[ki + 1].split(',').map(Number) : REF_KEYS;
  const cal = DEFAULT_CALIBRATION;
  const t0 = performance.now();

  // ------------------------------------------------ references (cached)
  let refCache: Record<string, NoteAnalysis | null> = existsSync(REF_CACHE) ? JSON.parse(readFileSync(REF_CACHE, 'utf8')) : {};
  const refJobs: Job[] = [];
  for (const m of keys) for (const d of DYNAMICS) if (available(m, d) && !(`ref:${m}:${d}` in refCache)) refJobs.push({ kind: 'ref', midi: m, dyn: d });
  if (refJobs.length) {
    const r = await pool(refJobs);
    for (const [k, v] of r) refCache[k] = v;
    writeFileSync(REF_CACHE, JSON.stringify(refCache));
  }
  // ------------------------------------------------ model renders
  const modelJobs: Job[] = [];
  for (const m of keys)
    for (const d of DYNAMICS) {
      if (quick && d !== 'mf') continue;
      // like with like (round 3): render exactly as long as the part of the recording
      // that is analysed (analyzeNote reads at most 30 s). The decay fit estimates a
      // noise floor from the last 12 % of what it is given; on a dry render that
      // "floor" is the still-decaying note, so a shorter render biased long decays
      // short (bass aftersound read ×0.67 at 22 s, ×0.79 at 30 s).
      const refLen = wavSeconds(wavPath(m, available(m, d) ? d : 'ff'));
      const dur = Number.isFinite(refLen) && !process.env.OLD_DUR ? Math.min(30, refLen) : m < 48 ? 22 : m < 72 ? 18 : m < 90 ? 12 : 8;
      modelJobs.push({ kind: 'model', midi: m, dyn: d, cal, dur });
    }
  const model = await pool(modelJobs);
  const get = (kind: 'ref' | 'model', m: number, d: Dyn) => (kind === 'ref' ? refCache[`ref:${m}:${d}`] : model.get(`model:${m}:${d}`)) ?? null;

  // ------------------------------------------------ comparisons
  const design = PRESETS.grand;
  const specs = buildKeySpecs(design, { ...DEFAULT_PARAMS, ...design.defaults }, cal);
  const rows = keys.map((m) => {
    const best = (kind: 'ref' | 'model') => {
      // B and tuning from the loudest available take with a good fit
      for (const d of ['ff', 'mf', 'pp'] as Dyn[]) {
        const a = get(kind, m, d);
        if (a && a.partials.length >= 3) return a;
      }
      return get(kind, m, 'mf') ?? get(kind, m, 'ff');
    };
    return { m, ref: best('ref'), model: best('model'), spec: specs[m - 21] };
  });

  // global pitch offset of the reference piano (its A4 vs 440)
  const refOffset = median(rows.filter((r) => r.m >= 57 && r.m <= 81 && r.ref).map((r) => cents(r.ref!.f1, et(r.m))));
  const tuneErr = rows.filter((r) => r.ref && r.model && r.ref.fitCents < 3 && r.ref.partials.length >= 4 && r.model.partials.length >= 2 && Math.abs(cents(r.ref.f1, et(r.m))) < 40).map((r) => cents(r.model!.f1, et(r.m)) - (cents(r.ref!.f1, et(r.m)) - refOffset));
  const bErr = rows.filter((r) => r.ref && r.model && r.ref.B > 0 && r.model.B > 0).map((r) => Math.log10(r.model!.B / r.ref!.B));

  // decays: partial 1-3 early/late at mf (ff where mf missing)
  const decayPairs: { m: number; k: number; which: 'early' | 'late'; ref: number; model: number }[] = [];
  for (const m of keys) {
    const d: Dyn = available(m, 'mf') ? 'mf' : 'ff';
    const ra = get('ref', m, d);
    const ma = get('model', m, d) ?? get('model', m, 'ff');
    if (!ra || !ma) continue;
    for (const k of [1, 2, 3]) {
      const rd = ra.decays.find((x) => x.k === k);
      const md = ma.decays.find((x) => x.k === k);
      if (!rd || !md) continue;
      decayPairs.push({ m, k, which: 'early', ref: rd.t60Early, model: md.t60Early });
      decayPairs.push({ m, k, which: 'late', ref: rd.t60Late, model: md.t60Late });
    }
  }
  const dErr = (which: 'early' | 'late', k?: number) =>
    decayPairs.filter((p) => p.which === which && (k === undefined || p.k === k) && Number.isFinite(p.ref) && Number.isFinite(p.model)).map((p) => Math.log2(p.model / p.ref));

  // levels: global gain offset at mf, then per-dynamic level and spectral-shape errors
  const gainOff = median(keys.map((m) => {
    const r = get('ref', m, 'mf');
    const mo = get('model', m, 'mf');
    return r && mo ? r.rmsDb - mo.rmsDb : NaN;
  }));
  const levelErr: Record<Dyn, number[]> = { pp: [], mf: [], ff: [] };
  const shapeErr: Record<Dyn, number[]> = { pp: [], mf: [], ff: [] };
  const centroidRatio: Record<Dyn, number[]> = { pp: [], mf: [], ff: [] };
  const attackErr: number[] = [];
  const contrastErr: number[] = [];
  for (const m of keys) {
    const rp = get('ref', m, 'pp');
    const rf = get('ref', m, 'ff');
    const mp = get('model', m, 'pp');
    const mfm = get('model', m, 'ff');
    const cr = contrastSlope(rp, rf);
    const cm = contrastSlope(mp, mfm, rp);
    if (Number.isFinite(cr) && Number.isFinite(cm)) contrastErr.push(cm - cr);
  }
  // decays by register: median model/ref ratio of partials 1-3
  const bins: [string, number, number][] = [['A0-B1', 21, 35], ['C2-B3', 36, 59], ['C4-B5', 60, 83], ['C6-C8', 84, 108]];
  const decayByRegister = Object.fromEntries(
    bins.map(([name, lo, hi]) => {
      const sel = (w: 'early' | 'late') => decayPairs.filter((p) => p.which === w && p.m >= lo && p.m <= hi && Number.isFinite(p.ref) && Number.isFinite(p.model)).map((p) => Math.log2(p.model / p.ref));
      return [name, { early: +Math.pow(2, median(sel('early'))).toFixed(2), late: +Math.pow(2, median(sel('late'))).toFixed(2) }];
    }),
  );
  for (const m of keys)
    for (const d of DYNAMICS) {
      const r = get('ref', m, d);
      const mo = get('model', m, d);
      if (!r || !mo) continue;
      levelErr[d].push(mo.rmsDb + gainOff - r.rmsDb);
      // spectral shape: partial levels relative to each note's own loudest partial, first 10 partials
      const rmax = Math.max(...r.levels.slice(0, 10).map((x) => x.db));
      const mmax = Math.max(...mo.levels.slice(0, 10).map((x) => x.db));
      const diffs: number[] = [];
      for (let k = 1; k <= 10; k++) {
        const rl = r.levels.find((x) => x.k === k);
        const ml = mo.levels.find((x) => x.k === k);
        if (!rl || !ml || rl.db - rmax < -50 || rl.db < -100) continue;
        diffs.push(ml.db - mmax - (rl.db - rmax));
      }
      if (diffs.length) shapeErr[d].push(rms(diffs));
      centroidRatio[d].push(Math.log2(mo.centroid / r.centroid));
      attackErr.push(mo.attackMs - r.attackMs);
    }
  // LTAS difference at mf by band (for the output EQ)
  const bandDiff: number[] = [];
  const firstLt = rows.find((r) => r.ref)?.ref?.ltas.length ?? 0;
  for (let b = 0; b < firstLt; b++) {
    bandDiff.push(median(keys.map((m) => {
      const r = get('ref', m, 'mf');
      const mo = get('model', m, 'mf');
      return r && mo && r.ltas[b] - r.floor[b] > 12 ? r.ltas[b] - (mo.ltas[b] + gainOff) : NaN;
    })));
  }

  const summary = {
    tuningRmsCents: rms(tuneErr),
    refPitchOffsetCents: refOffset,
    bLog10Rms: rms(bErr),
    bMedianRatio: Math.pow(10, median(bErr)),
    t60EarlyLog2Rms: rms(dErr('early')),
    t60LateLog2Rms: rms(dErr('late')),
    t60EarlyP1MedianRatio: Math.pow(2, median(dErr('early', 1))),
    t60LateP1MedianRatio: Math.pow(2, median(dErr('late', 1))),
    levelErrDb: { pp: rms(levelErr.pp), mf: rms(levelErr.mf), ff: rms(levelErr.ff) },
    levelBiasDb: { pp: median(levelErr.pp), mf: median(levelErr.mf), ff: median(levelErr.ff) },
    spectralShapeRmsDb: { pp: median(shapeErr.pp), mf: median(shapeErr.mf), ff: median(shapeErr.ff) },
    centroidRatio: { pp: Math.pow(2, median(centroidRatio.pp)), mf: Math.pow(2, median(centroidRatio.mf)), ff: Math.pow(2, median(centroidRatio.ff)) },
    brightnessContrastErr: { rmsDbPerPartial: rms(contrastErr), biasDbPerPartial: median(contrastErr) },
    decayByRegister,
    attackDiffMs: median(attackErr),
    ltasBandRmsDb: rms(bandDiff),
    gainOffsetDb: gainOff,
  };
  if (args.includes('--table')) {
    console.log('key  Bref     Bmod     | cRef  cMod | T60e1 ref/mod | T60l1 ref/mod | T60l3 ref/mod | rms pp/mf/ff ref     model      | cent mf ref/mod');
    for (const m of keys) {
      const ra = rows.find((r) => r.m === m)!;
      const d: Dyn = available(m, 'mf') ? 'mf' : 'ff';
      const rd = get('ref', m, d);
      const md = get('model', m, d);
      const dd = (a: NoteAnalysis | null, k: number, w: 'e' | 'l') => {
        const x = a?.decays.find((y) => y.k === k);
        const v = x ? (w === 'e' ? x.t60Early : x.t60Late) : NaN;
        return Number.isFinite(v) ? v.toFixed(1).padStart(5) : '   --';
      };
      const lv = (kind: 'ref' | 'model') => DYNAMICS.map((dy) => { const a = get(kind, m, dy); return a ? (a.rmsDb + (kind === 'model' ? gainOff : 0)).toFixed(0).padStart(4) : '  --'; }).join('');
      console.log(
        `${String(m).padEnd(4)} ${ra.ref?.B.toExponential(2) ?? '--'} ${ra.model?.B.toExponential(2) ?? '--'} | ${ra.ref ? cents(ra.ref.f1, et(m)).toFixed(1).padStart(5) : '  -- '} ${ra.model ? cents(ra.model.f1, et(m)).toFixed(1).padStart(5) : ''} | ${dd(rd, 1, 'e')} ${dd(md, 1, 'e')} | ${dd(rd, 1, 'l')} ${dd(md, 1, 'l')} | ${dd(rd, 3, 'l')} ${dd(md, 3, 'l')} | ${lv('ref')} ${lv('model')} | ${rd?.centroid.toFixed(0)} ${md?.centroid.toFixed(0)}`,
      );
    }
    console.log('LTAS diff (ref - model) by band:', bandDiff.map((x) => x.toFixed(0)).join(' '));
  }
  console.log(JSON.stringify(summary, null, 2));
  console.log(`(${((performance.now() - t0) / 1000).toFixed(1)} s)`);

  // ------------------------------------------------ data for the measurements page
  if (!quick) {
    const slim = (a: NoteAnalysis | null) =>
      a && {
        f1: a.f1,
        B: a.B,
        np: a.partials.length,
        fitc: +a.fitCents.toFixed(2),
        decays: a.decays.slice(0, 8).map((d) => ({ k: d.k, f: Math.round(d.f), e: fin(d.t60Early), l: fin(d.t60Late), knee: fin(d.knee) })),
        levels: a.levels.slice(0, 24).map((x) => +x.db.toFixed(1)),
        rmsDb: +a.rmsDb.toFixed(1),
        peakDb: +a.peakDb.toFixed(1),
        attackMs: +a.attackMs.toFixed(1),
        centroid: Math.round(a.centroid),
        ltas: a.ltas.map((x) => +x.toFixed(1)),
        floor: a.floor.map((x) => +x.toFixed(1)),
      };
    // hammer contact (model) across the compass, and target curves for all 88 keys
    const hammer = [] as { midi: number; pp: number; mf: number; ff: number; peakFf: number }[];
    for (let m = 21; m <= 108; m += 3) {
      const st = (vel: number) => {
        const r = renderNote(m, vel, 0.06, { sampleRate: 44100, dry: true, params: { sympathetic: false } });
        return r.core.voices[m - 21].lastStrike;
      };
      const a = st(DYN_VEL.pp);
      const b = st(DYN_VEL.mf);
      const c = st(DYN_VEL.ff);
      hammer.push({ midi: m, pp: +((a?.duration ?? 0) * 1000).toFixed(2), mf: +((b?.duration ?? 0) * 1000).toFixed(2), ff: +((c?.duration ?? 0) * 1000).toFixed(2), peakFf: +(c?.peak ?? 0).toFixed(1) });
    }
    const curves = specs.map((sp) => ({ midi: sp.midi, B: sp.B, cents: +cents(sp.f1, et(sp.midi)).toFixed(2) }));
    const roundsPath = join(ROOT, 'docs/calibration-rounds.json');
    const rounds = existsSync(roundsPath) ? JSON.parse(readFileSync(roundsPath, 'utf8')) : [];
    const data = {
      generated: new Date().toISOString(),
      hammer,
      curves,
      rounds: rounds.map((r: { label: string; summary: unknown }) => ({ label: r.label, summary: r.summary })),
      reference: 'University of Iowa MIS — Steinway model B (2001), pp/mf/ff',
      velocities: DYN_VEL,
      gainOffsetDb: gainOff,
      refPitchOffsetCents: refOffset,
      summary,
      keys: keys.map((m) => ({
        midi: m,
        targetB: specs[m - 21].B,
        targetF1: specs[m - 21].f1,
        ref: Object.fromEntries(DYNAMICS.map((d) => [d, slim(get('ref', m, d))])),
        model: Object.fromEntries(DYNAMICS.map((d) => [d, slim(get('model', m, d))])),
      })),
    };
    writeFileSync(OUT, JSON.stringify(data));
    console.log(`wrote ${OUT}`);
  }

  const li = args.indexOf('--log');
  if (li >= 0) {
    const logPath = join(ROOT, 'docs/calibration-rounds.json');
    const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : [];
    log.push({ label: args[li + 1], date: new Date().toISOString(), summary });
    writeFileSync(logPath, JSON.stringify(log, null, 1) + '\n');
  }
  if (fit) doFit(keys, get, rows, decayPairs, bandDiff, summary, args.includes('--decay-only'));
}

type Getter = (kind: 'ref' | 'model', m: number, d: Dyn) => NoteAnalysis | null;

/** Damped multiplicative corrections of register breakpoints towards the reference. */
function doFit(
  keys: number[],
  get: Getter,
  rows: { m: number; ref: NoteAnalysis | null; model: NoteAnalysis | null }[],
  decayPairs: { m: number; k: number; which: 'early' | 'late'; ref: number; model: number }[],
  bandDiff: number[],
  summary: { levelBiasDb: Record<Dyn, number>; gainOffsetDb: number },
  decayOnly = false,
): void {
  const cur: Partial<Calibration> = existsSync(FIT_PATH) ? JSON.parse(readFileSync(FIT_PATH, 'utf8')) : {};
  const cal = DEFAULT_CALIBRATION;
  const next: Partial<Calibration> = { ...cur };
  const step = 0.7;

  // 1. inharmonicity: fit the two-asymptote model to reference B (log LS, Nelder–Mead)
  const pts = rows.filter((r) => r.ref && r.ref.B > 1e-6 && r.ref.fitCents < 3).map((r) => ({ m: r.m, lb: Math.log(r.ref!.B) }));
  const f = (p: number[]) => {
    const [lbT, sT, lbB, sB] = p;
    return pts.reduce((s, q) => {
      const b = Math.exp(lbT) * Math.exp(sT * (q.m - 60)) + Math.exp(lbB) * Math.exp(-sB * (q.m - 21));
      return s + (Math.log(b) - q.lb) ** 2;
    }, 0);
  };
  const p0 = [Math.log(cal.B.bT), cal.B.sT, Math.log(cal.B.bB), cal.B.sB];
  const pB = nelderMead(f, p0, 4000);
  next.B = { bT: Math.exp(pB[0]), sT: pB[1], bB: Math.exp(pB[2]), sB: pB[3] };

  // 2. decay targets: ratio corrections at breakpoints, interpolated from nearby keys
  // bounded corrections: at most ×2 per iteration, physical clamps on the result
  // bridge segments: unichords and bichords on the bass bridge, then the treble bridge.
  // Admittance breakpoints only learn from keys on their own segment (round 2: the old
  // ±8-key windows let treble-bridge keys drive the last bass-bridge breakpoint).
  const g = PRESETS.grand;
  const segOf = (m: number) => (m <= g.unichordTop ? 0 : m < g.bassBreak ? 1 : 2);
  const corr = (which: 'early' | 'late', ks: number[], m0: number, width = 8, sameSeg = false) => {
    const ps = decayPairs.filter((p) => p.which === which && ks.includes(p.k) && Math.abs(p.m - m0) <= width && (!sameSeg || segOf(p.m) === segOf(m0)) && Number.isFinite(p.ref) && Number.isFinite(p.model) && p.ref < 120 && p.model < 120);
    if (ps.length < 2) return 1;
    const c = Math.pow(2, step * median(ps.map((p) => Math.log2(p.ref / p.model))));
    return Math.min(2, Math.max(0.5, c));
  };
  const clampB = (b: { midi: number[]; val: number[] }, lo: number, hi: number, digits = 3) => ({ midi: b.midi, val: b.val.map((v) => +Math.min(hi, Math.max(lo, v)).toPrecision(digits + 1)) });
  next.t60Low = clampB({ midi: cal.t60Low.midi, val: cal.t60Low.midi.map((m, i) => cal.t60Low.val[i] * corr('late', [1, 2], m)) }, 1, 120);
  next.t60High = clampB({ midi: cal.t60High.midi, val: cal.t60High.midi.map((m, i) => cal.t60High.val[i] * corr('late', [3, 4], m)) }, 0.2, 30);
  // bridge admittance controls the prompt decay: decay rate ∝ Y, so Y *= model/ref
  next.bridgeY = clampB({ midi: cal.bridgeY.midi, val: cal.bridgeY.midi.map((m, i) => cal.bridgeY.val[i] / corr('early', [1, 2, 3], m, 12, true)) }, 1e-5, 2e-3);
  if (decayOnly) {
    // decay levers only (+ the global level the board coupling changes); leave the voicing,
    // felt, EQ, velocity range and B where they are
    next.B = cur.B ?? cal.B;
    next.outputGain = +(cal.outputGain * Math.pow(10, summary.gainOffsetDb / 20)).toPrecision(4);
    writeFileSync(FIT_PATH, JSON.stringify(next, null, 2) + '\n');
    console.log(`updated ${FIT_PATH} (decay levers only)`);
    return;
  }

  // 3. output EQ from the third-octave difference (smoothed, clamped)
  const bands = [31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000];
  const prevEq = new Map((cal.eq ?? []).map(([fq, g]) => [fq, g]));
  const eq: [number, number, number][] = [];
  const upd: [number, number][] = [];
  for (let b = 3; b < bands.length - 1; b += 2) {
    const d = [bandDiff[b - 1], bandDiff[b], bandDiff[b + 1]].filter(Number.isFinite);
    if (!d.length) continue;
    upd.push([bands[b], step * median(d)]);
  }
  // the EQ shapes the spectrum only: its mean update is removed (the output gain owns the
  // overall level), otherwise EQ and gain drift against each other into the clamps
  const meanUpd = upd.length ? upd.reduce((s, [, u]) => s + u, 0) / upd.length : 0;
  for (const [fq, u] of upd) {
    const g = Math.max(-12, Math.min(12, (prevEq.get(fq) ?? 0) + u - meanUpd));
    eq.push([fq, +g.toFixed(2), 1.4]);
  }
  next.eq = eq;
  next.outputGain = +(cal.outputGain * Math.pow(10, summary.gainOffsetDb / 20)).toPrecision(4);

  // 4. dynamics: hammer velocity range from pp and ff level bias (after mf alignment)
  const v = { ...cal.velocity };
  const ppBias = summary.levelBiasDb.pp - summary.levelBiasDb.mf;
  const ffBias = summary.levelBiasDb.ff - summary.levelBiasDb.mf;
  // level ∝ ~20·log10(v_h)·1.3 roughly; correct in log-velocity
  v.vMin = +(v.vMin * Math.pow(10, (-step * ppBias) / 26)).toFixed(4);
  v.vMax = +(v.vMax * Math.pow(10, (-step * ffBias) / 26)).toFixed(4);
  next.velocity = v;

  // 5. voicing: register loudness at mf (after the global gain), smoothed over ±8 keys
  const vo = cal.voicing;
  next.voicing = {
    midi: vo.midi,
    val: vo.midi.map((m0, i) => {
      const ds = keys.filter((m) => Math.abs(m - m0) <= 8).map((m) => {
        const r = get('ref', m, 'mf');
        const mo = get('model', m, 'mf');
        return r && mo ? r.rmsDb - (mo.rmsDb + summary.gainOffsetDb) : NaN;
      });
      const d = median(ds);
      return Math.max(-6, Math.min(6, vo.val[i] + (Number.isFinite(d) ? step * d / 1.1 : 0)));
    }),
  };
  // regularise: neighbouring breakpoints should not zig-zag on per-note performance noise
  const vv = next.voicing.val;
  next.voicing.val = vv.map((v, i) => +(0.5 * v + 0.25 * (vv[Math.max(0, i - 1)] + vv[Math.min(vv.length - 1, i + 1)])).toFixed(2));
  // 6. felt exponent from the brightness *contrast* pp -> ff (absolute tone is the EQ's job):
  // slope of the ff−pp partial-level gain vs partial number, model vs reference
  const hp = cal.hammerP;
  next.hammerP = {
    midi: hp.midi,
    val: hp.midi.map((m0, i) => {
      // above ~C6 the pp references have too few partials above the noise floor
      if (m0 > 84) return BASE_CALIBRATION.hammerP.val[i] ?? hp.val[i];
      const ds: number[] = [];
      for (const m of keys) {
        if (Math.abs(m - m0) > 16 || m > 88) continue;
        const rp = get('ref', m, 'pp');
        const cr = contrastSlope(rp, get('ref', m, 'ff'));
        const cm = contrastSlope(get('model', m, 'pp'), get('model', m, 'ff'), rp);
        if (Number.isFinite(cr) && Number.isFinite(cm)) ds.push(cr - cm);
      }
      const d = median(ds);
      return +Math.max(2, Math.min(4, hp.val[i] + (Number.isFinite(d) ? Math.max(-0.3, Math.min(0.3, step * 0.12 * d)) : 0))).toFixed(3);
    }),
  };

  writeFileSync(FIT_PATH, JSON.stringify(next, null, 2) + '\n');
  console.log(`updated ${FIT_PATH}`);
  void keys;
  void get;
}

function nelderMead(f: (p: number[]) => number, x0: number[], iters: number): number[] {
  const n = x0.length;
  let simplex = [x0, ...x0.map((_, i) => x0.map((v, j) => (j === i ? v + (Math.abs(v) * 0.1 || 0.05) : v)))];
  let vals = simplex.map(f);
  for (let it = 0; it < iters; it++) {
    const order = vals.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    simplex = order.map((i) => simplex[i]);
    vals = order.map((i) => vals[i]);
    const c = x0.map((_, j) => simplex.slice(0, n).reduce((s, p) => s + p[j], 0) / n);
    const xr = c.map((v, j) => v + (v - simplex[n][j]));
    const fr = f(xr);
    if (fr < vals[0]) {
      const xe = c.map((v, j) => v + 2 * (v - simplex[n][j]));
      const fe = f(xe);
      simplex[n] = fe < fr ? xe : xr;
      vals[n] = Math.min(fe, fr);
    } else if (fr < vals[n - 1]) {
      simplex[n] = xr;
      vals[n] = fr;
    } else {
      const xc = c.map((v, j) => v + 0.5 * (simplex[n][j] - v));
      const fc = f(xc);
      if (fc < vals[n]) {
        simplex[n] = xc;
        vals[n] = fc;
      } else {
        for (let i = 1; i <= n; i++) simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
        vals = simplex.map(f);
      }
    }
  }
  return simplex[vals.indexOf(Math.min(...vals))];
}

if (!isMainThread) {
  const jobs = workerData as Job[];
  const out = jobs.map((j) => ({ key: `${j.kind}:${j.midi}:${j.dyn}`, a: runJob(j) }));
  parentPort!.postMessage(out);
} else {
  await main();
}
