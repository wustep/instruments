// Fit the bowed strings' bodies to the Iowa MIS recordings (analysis only; NEXT5 item 1).
// Fitted per instrument (design.body in packages/engine/src/core/bowed.ts):
//   body.bands   the radiated response's envelope: gains of half-octave peaking sections
//   body.corner  the Helmholtz corner's cutoff, in harmonics of the note, at F/Z = 1 m/s, and its
//                exponent: how the brightness grows with the bow's force
//   hf[0]        the high-frequency path's gain (the statistical body above the modal range), moved by
//                the envelope's mean need above 5 kHz (heard in phase now: see design.body)
//   bowSpeed     the bow speeds at pp and ff (log-linear in velocity, mf kept), so the louder notes'
//                level over the softer ones' stays the recordings' (the corner darkens and quietens pp);
//                --keep-speed leaves them as they are (the viola: refitting them broke the attack guard)
//   outputGain   kept so the median mf note is as loud as before the fit (the recordings' absolute
//                levels are the microphone's gain, not the instrument's)
// Data: FIT HALF ONLY, the even MIDI notes of every dynamic (scripts/judge.ts holds out the odd
// ones). For every harmonic k ≤ 16 below 10 kHz within 45 dB of the note's strongest:
//   recording − model (dB) = the note's own level + ΔC(k f0) + the corner's change at k f0
// with ΔC on knots, 3 per octave from the lowest note to 10 kHz (flat beyond), a curvature penalty
// (λ = 3, chosen by cross-validation inside the fit half: notes ≡ 0 vs 2 mod 4), solved by least
// squares; the corner by a grid. The bands are then refitted to the new envelope, the fit half
// re-rendered, and the whole repeated until it settles.
//   npx tsx scripts/fit-bodies.ts violin [--iters 7] [--keep-speed] [--keep-hf] [--corner-floor] [--write]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { BOWED, BowedCore } from '../packages/engine/src/core/bowed.ts';
import { biquadHighShelf, biquadPeaking } from '../packages/engine/src/core/filters.ts';
import { DYN_VEL, matchedParams, modelNote } from './calibrate-ensemble.ts';
import { referenceNotes, type RefNote } from './ensemble-refs.ts';
import { isHeldOut } from './judge.ts';

const FIT = join(import.meta.dirname, '..', 'packages/engine/src/core/bowed-fit.json');
const FS = 44100;
type Inst = 'violin' | 'viola' | 'cello';
type Body = { bands: [number, number][]; q: number; corner: [number, number] };
interface Over {
  body: Body;
  outputGain: number;
  bowSpeed: [number, number];
  hf: [number, number];
}
interface Got {
  harmAbs: number[];
  rmsDb: number;
  x: number;
  f0: number;
  fNote: number;
}

// ---------------------------------------------------------------- rendering (worker pool)
/** the bow force over the string's impedance (m/s) the model plays this note with, steady */
function driver(inst: Inst, midi: number, vel: number): { x: number } {
  const c = new BowedCore({ sampleRate: FS, instrument: inst, dry: true });
  c.noteOn(midi, vel);
  const L = new Float32Array(128);
  c.process(L, new Float32Array(128), 128);
  const s = c.strings.find((q) => q.bowing);
  return { x: s ? s.fBowTarget / s.Z : NaN };
}
function renderSet(inst: Inst, over: Partial<Over>, notes: RefNote[]): Got[] {
  Object.assign(BOWED[inst], over);
  return notes.map((r) => {
    const a = modelNote({
      instrument: inst,
      dyn: r.dyn,
      midi: r.midi,
      params: matchedParams(r),
    });
    return {
      harmAbs: a ? a.harmAbs : [],
      rmsDb: a ? a.rmsDb : NaN,
      ...driver(inst, r.midi, DYN_VEL[r.dyn]),
      f0: a ? a.f0 : NaN,
      fNote: 440 * Math.pow(2, (r.midi - 69) / 12),
    };
  });
}
async function renderAll(inst: Inst, over: Partial<Over>, notes: RefNote[]): Promise<Got[]> {
  const n = Math.min(notes.length, Math.max(1, cpus().length - 2));
  const parts: number[][] = Array.from({ length: n }, () => []);
  notes.forEach((_, i) => parts[i % n].push(i));
  const out: Got[] = new Array(notes.length);
  await Promise.all(
    parts.map(
      (idx) =>
        new Promise<void>((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), {
            workerData: {
              fitBodies: true,
              inst,
              over,
              notes: idx.map((i) => notes[i]),
            },
            execArgv: ['--import', 'tsx'],
          });
          w.on('message', (g: Got[]) => {
            g.forEach((x, j) => (out[idx[j]] = x));
            resolve();
          });
          w.on('error', reject);
        }),
    ),
  );
  return out;
}

// ---------------------------------------------------------------- responses
/** |H| in dB of a biquad [b0, b1, b2, a1, a2] at f Hz */
function biquadDb(c: number[], f: number, fs = FS): number {
  const w = (2 * Math.PI * f) / fs;
  const c1 = Math.cos(w),
    s1 = Math.sin(w),
    c2 = Math.cos(2 * w),
    s2 = Math.sin(2 * w);
  const nr = c[0] + c[1] * c1 + c[2] * c2,
    ni = -(c[1] * s1 + c[2] * s2);
  const dr = 1 + c[3] * c1 + c[4] * c2,
    di = -(c[3] * s1 + c[4] * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}
/** the envelope the design's eq sections give (dB at f), without the fixed high-pass */
function envelopeDb(inst: Inst, f: number): number {
  const d = BOWED[inst];
  if (d.body) return d.body.bands.reduce((s, [fc, g]) => s + biquadDb(biquadPeaking(fc, d.body!.q, g, FS), f), 0);
  return d.eq.reduce((s, [fc, g, q]) => s + biquadDb(biquadPeaking(fc, q, g, FS), f), 0) + biquadDb(biquadHighShelf(7000, -3, FS), f);
}
/** the corner low-pass (bilinear first order, as in BowedCore) in dB at f for cutoff fc */
function cornerDb(f: number, fc: number): number {
  if (!(fc > 0)) return 0;
  const k = Math.tan((Math.PI * Math.min(fc, 0.45 * FS)) / FS);
  const b = k / (1 + k),
    a = (k - 1) / (k + 1);
  const w = (2 * Math.PI * f) / FS;
  return 10 * Math.log10((b * b * (2 + 2 * Math.cos(w))) / (1 + a * a + 2 * a * Math.cos(w)));
}
/** the corner's cutoff for a note (as BowedCore.cornerControl), 0: none */
const cutoff = (c: [number, number] | null, g: Got) => (c ? Math.min(0.45 * FS, Math.max(150, c[0] * g.fNote * Math.pow(Math.max(g.x, 1e-9), c[1]))) : 0);

// ---------------------------------------------------------------- least squares
/** envelope knots, 3 per octave on the 100 Hz grid, from the instrument's lowest note to 10 kHz */
let KNOTS: number[] = [];
function setKnots(fLowest: number): void {
  const lo = Math.log2(100) + Math.floor(3 * Math.log2(fLowest / 100)) / 3;
  const hi = Math.log2(10000);
  KNOTS = Array.from({ length: Math.round((hi - lo) * 3) + 1 }, (_, i) => lo + i / 3);
}
function basisRow(f: number): number[] {
  const lf = Math.min(KNOTS[KNOTS.length - 1], Math.max(KNOTS[0], Math.log2(f)));
  const row = new Array(KNOTS.length).fill(0);
  let i = 0;
  while (i < KNOTS.length - 2 && lf > KNOTS[i + 1]) i++;
  const t = (lf - KNOTS[i]) / (KNOTS[i + 1] - KNOTS[i]);
  row[i] = 1 - t;
  row[i + 1] = t;
  return row;
}
function solveSym(A: number[][], b: number[]): number[] {
  // Cholesky (A symmetric positive definite)
  const n = b.length;
  const L = A.map((r) => r.slice());
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < j; k++) L[j][j] -= L[j][k] * L[j][k];
    L[j][j] = Math.sqrt(Math.max(L[j][j], 1e-12));
    for (let i = j + 1; i < n; i++) {
      for (let k = 0; k < j; k++) L[i][j] -= L[i][k] * L[j][k];
      L[i][j] /= L[j][j];
    }
  }
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}
interface Row {
  note: number;
  f: number;
  basis: number[];
  y: number;
}
/** rows: one per usable harmonic of each note (recording − model, dB) */
function rowsOf(refs: RefNote[], got: Got[]): Row[] {
  const rows: Row[] = [];
  refs.forEach((r, n) => {
    const g = got[n];
    if (!g || !g.harmAbs.length || !Number.isFinite(g.f0)) return;
    const ks: number[] = [];
    for (let k = 1; k <= 16; k++) {
      const f = k * g.f0;
      if (f > 10000 || !(r.harm[k - 1] > -45) || !Number.isFinite(r.harmAbs[k - 1]) || !Number.isFinite(g.harmAbs[k - 1])) continue;
      ks.push(k);
    }
    if (ks.length < 3) return;
    for (const k of ks)
      rows.push({
        note: n,
        f: k * g.f0,
        basis: basisRow(k * g.f0),
        y: r.harmAbs[k - 1] - g.harmAbs[k - 1],
      });
  });
  return rows;
}
/** ΔC on the knots (and each note's level) for rows whose y has the corner change taken off */
function fitEnvelope(rows: Row[], nNotes: number, ys: number[], lambda = 3): { dC: number[]; rms: number } {
  const nk = KNOTS.length;
  const N = nNotes + nk;
  const A = Array.from({ length: N }, () => new Array(N).fill(0));
  const b = new Array(N).fill(0);
  rows.forEach((r, i) => {
    const idx = [r.note, ...r.basis.map((_, j) => nNotes + j)];
    const val = [1, ...r.basis];
    for (let p = 0; p < idx.length; p++) {
      if (!val[p]) continue;
      b[idx[p]] += val[p] * ys[i];
      for (let q = 0; q < idx.length; q++) if (val[q]) A[idx[p]][idx[q]] += val[p] * val[q];
    }
  });
  // curvature penalty (per knot step) and a small ridge (the levels and a constant ΔC trade off)
  const s = lambda * (nk / 20) ** 2;
  for (let i = 0; i + 2 < nk; i++) {
    const c = [1, -2, 1];
    for (let p = 0; p < 3; p++) for (let q = 0; q < 3; q++) A[nNotes + i + p][nNotes + i + q] += s * c[p] * c[q];
  }
  for (let j = 0; j < nk; j++) A[nNotes + j][nNotes + j] += 1e-4;
  for (let j = 0; j < nNotes; j++) A[j][j] += 1e-6;
  const sol = solveSym(A, b);
  let e = 0;
  rows.forEach((r, i) => {
    const pred = sol[r.note] + r.basis.reduce((acc, v, j) => acc + v * sol[nNotes + j], 0);
    e += (pred - ys[i]) ** 2;
  });
  return {
    dC: sol.slice(nNotes),
    rms: Math.sqrt(e / Math.max(1, rows.length)),
  };
}
const dCat = (dC: number[], f: number) => basisRow(f).reduce((a, v, j) => a + v * dC[j], 0);

/** half-octave peaking sections, 100 Hz–12.8 kHz, gains fitted (Gauss–Newton) to a target curve */
const BAND_F = Array.from({ length: 15 }, (_, i) => 100 * Math.pow(2, i / 2));
const BAND_Q = Math.SQRT2 ** 0.5 / (Math.SQRT2 - 1); // a half-octave bandwidth
function fitBands(target: (f: number) => number, start: number[]): number[] {
  const grid = Array.from({ length: 120 }, (_, i) => 70 * Math.pow(12000 / 70, i / 119));
  const T = grid.map(target);
  const resp = (g: number[]) => grid.map((f) => g.reduce((s, gi, i) => s + biquadDb(biquadPeaking(BAND_F[i], BAND_Q, gi, FS), f), 0));
  let g = start.slice();
  for (let it = 0; it < 12; it++) {
    const r0 = resp(g);
    const J = g.map((_, i) => {
      const gp = g.slice();
      gp[i] += 0.1;
      const r1 = resp(gp);
      return r1.map((v, m) => (v - r0[m]) / 0.1);
    });
    const n = g.length;
    const A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => J[i].reduce((s, v, m) => s + v * J[j][m], 0) + (i === j ? 1e-3 : 0)));
    const b = J.map((Ji) => Ji.reduce((s, v, m) => s + v * (T[m] - r0[m]), 0));
    const d = solveSym(A, b);
    g = g.map((v, i) => Math.max(-40, Math.min(70, v + d[i])));
  }
  const r = resp(g);
  const err = Math.sqrt(r.reduce((s, v, m) => s + (v - T[m]) ** 2, 0) / r.length);
  console.log(`  bands realise the envelope within ${err.toFixed(2)} dB RMS`);
  return g;
}

function median(xs: number[]): number {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
}
const r3 = (x: number) => +x.toPrecision(3);

if (!isMainThread && (workerData as { fitBodies?: boolean })?.fitBodies) {
  const { inst, over, notes } = workerData as {
    inst: Inst;
    over: Partial<Over>;
    notes: RefNote[];
  };
  parentPort!.postMessage(renderSet(inst, over, notes));
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const inst = args[0] as Inst;
  const iters = args.includes('--iters') ? +args[args.indexOf('--iters') + 1] : 7;
  const floor = args.includes('--corner-floor');
  const d = BOWED[inst];
  const refs = (await referenceNotes()).filter((r) => r.instrument === inst && !isHeldOut({ key: '', midi: r.midi, errs: {} }));
  console.log(`${inst}: ${refs.length} fit-half notes (even MIDI; the odd ones are held out)`);
  // before: the design as it stands (its loudness is kept)
  const got0 = await renderAll(inst, {}, refs);
  const mf0 = median(got0.filter((_, i) => refs[i].dyn === 'mf').map((g) => g.rmsDb));
  setKnots(Math.min(...refs.map((r) => r.f0)));
  let over: Over = {
    body: d.body ?? {
      bands: BAND_F.map((f) => [f, 0]),
      q: BAND_Q,
      corner: [0, 0],
    },
    outputGain: d.outputGain,
    bowSpeed: [...d.bowSpeed],
    hf: [...d.hf],
  };
  let corner: [number, number] | null = d.body ? d.body.corner : null;
  let env = (f: number) => envelopeDb(inst, f);
  let got = got0;
  let gains = d.body ? d.body.bands.map(([, g]) => g) : BAND_F.map(() => 0);
  // the recordings' level of pp and ff over mf (median note, fit half)
  const lvl = (gs: { rmsDb: number }[], dyn: string) => median(gs.filter((_, i) => refs[i].dyn === dyn).map((g) => g.rmsDb));
  const refSpread = {
    pp: lvl(refs, 'pp') - lvl(refs, 'mf'),
    ff: lvl(refs, 'ff') - lvl(refs, 'mf'),
  };
  for (let it = 0; it < iters; it++) {
    const rows = rowsOf(refs, got);
    const base = rows.map((r) => r.y);
    console.log(`it ${it}: ${rows.length} harmonics; recording − model RMS (each note's level and a tilt removed) ${fitEnvelope(rows, refs.length, base, 1e6).rms.toFixed(2)} dB`);
    // corner: grid over the cutoff (harmonics at 1 m/s) and the exponent, each with its best envelope
    let best: { c: [number, number]; dC: number[]; rms: number } | null = null;
    for (let i = 0; i < 31; i++)
      for (let j = 0; j <= 16; j++) {
        // (--corner-floor: at least the fundamental at 1 m/s and an exponent of at least 0.3, for a
        // fit whose harmonics alone leave the corner undetermined: the cello's slid to a fixed 150 Hz)
        const c: [number, number] = floor ? [Math.pow(40, i / 30), 0.3 + j * 0.08] : [0.25 * Math.pow(160, i / 30), j * 0.1];
        const ys = rows.map((r, m) => base[m] - (cornerDb(r.f, cutoff(c, got[r.note])) - cornerDb(r.f, cutoff(corner, got[r.note]))));
        const e = fitEnvelope(rows, refs.length, ys);
        if (!best || e.rms < best.rms) best = { c, dC: e.dC, rms: e.rms };
      }
    corner = best!.c;
    let dC = best!.dC;
    // the envelope's mean need above 5 kHz, where the high-frequency path radiates alone, goes to
    // that path's gain (two thirds of it per pass); the bands keep the rest
    const hiK = KNOTS.map((k, j) => [2 ** k, dC[j]]).filter(([f]) => f >= 5000);
    const h = hiK.reduce((a, [, v]) => a + v, 0) / hiK.length;
    if (!args.includes('--keep-hf') && Math.abs(h) > 2) {
      const step = (2 / 3) * h;
      over.hf = [over.hf[0] * Math.pow(10, step / 20), over.hf[1]];
      const ramp = (f: number) => Math.min(1, Math.max(0, Math.log2(f / 2500)));
      const dC0 = dC;
      dC = KNOTS.map((k, j) => dC0[j] - step * ramp(2 ** k));
      console.log(`  high-frequency path ${step >= 0 ? '+' : ''}${step.toFixed(1)} dB → gain ${over.hf[0].toExponential(3)}`);
    }
    console.log(
      `  corner at harmonic ${corner[0].toFixed(2)} for 1 m/s, exponent ${corner[1].toFixed(1)}; residual ${best!.rms.toFixed(2)} dB; ΔC ${KNOTS.map((k, j) => `${Math.round(2 ** k)}:${dC[j] >= 0 ? '+' : ''}${dC[j].toFixed(1)}`).join(' ')}`,
    );
    // beyond the recordings' harmonics (below the lowest note, above 10 kHz) the envelope stays flat
    const env0 = env;
    const fLo = 2 ** KNOTS[0];
    const fHi = 2 ** KNOTS[KNOTS.length - 1];
    const target = (f: number) => {
      const g = Math.min(fHi, Math.max(fLo, f));
      return env0(g) + dCat(dC, g);
    };
    gains = fitBands(target, gains);
    over = {
      ...over,
      body: { bands: BAND_F.map((f, i) => [f, gains[i]]), q: BAND_Q, corner },
    };
    env = (f: number) => over.body.bands.reduce((s, [fc, g]) => s + biquadDb(biquadPeaking(fc, BAND_Q, g, FS), f), 0);
    got = await renderAll(inst, over, refs);
    // the dynamics' level spread: the Helmholtz amplitude follows the bow speed (∝ v/β), so move the
    // pp and ff speeds by the level they miss (half of it per pass), keeping mf's
    if (!args.includes('--keep-speed')) {
      const miss = {
        pp: refSpread.pp - (lvl(got, 'pp') - lvl(got, 'mf')),
        ff: refSpread.ff - (lvl(got, 'ff') - lvl(got, 'mf')),
      };
      const X = (v: number) => (v - 1) / 126;
      const [xp, xm, xf] = [X(DYN_VEL.pp), X(DYN_VEL.mf), X(DYN_VEL.ff)];
      const [v0, v1] = over.bowSpeed;
      const lv = (x: number) => Math.log(v0) + x * Math.log(v1 / v0);
      const lp = lv(xp) + (0.5 * miss.pp * Math.LN10) / 20;
      const lf = lv(xf) + (0.5 * miss.ff * Math.LN10) / 20;
      const lm = lv(xm);
      // a straight line in (x, log v) through mf, least squares on pp and ff
      const slope = ((xp - xm) * (lp - lm) + (xf - xm) * (lf - lm)) / ((xp - xm) ** 2 + (xf - xm) ** 2);
      over.bowSpeed = [Math.exp(lm - xm * slope), Math.exp(lm + (1 - xm) * slope)];
      console.log(
        `  level of pp, ff over mf: recordings ${refSpread.pp.toFixed(1)}, ${refSpread.ff.toFixed(1)} dB; model missed ${miss.pp.toFixed(1)}, ${miss.ff.toFixed(1)} → bow speed ${over.bowSpeed.map((v) => v.toFixed(3)).join('–')} m/s`,
      );
      got = await renderAll(inst, over, refs);
    }
    // keep the loudness: the median mf note as before
    const mf = lvl(got, 'mf');
    if (Number.isFinite(mf - mf0) && Math.abs(mf - mf0) > 0.05) {
      over.outputGain *= Math.pow(10, -(mf - mf0) / 20);
      got = await renderAll(inst, over, refs);
    }
  }
  const rows = rowsOf(refs, got);
  console.log(
    `final: recording − model RMS (each note's level and a tilt removed) ${fitEnvelope(
      rows,
      refs.length,
      rows.map((r) => r.y),
      1e6,
    ).rms.toFixed(2)} dB over ${rows.length} harmonics`,
  );
  const out = {
    body: {
      bands: over.body.bands.map(([f, g]) => [Math.round(f), +g.toFixed(2)]),
      q: r3(BAND_Q),
      corner: [r3(over.body.corner[0]), +over.body.corner[1].toFixed(2)],
    },
    hf: over.hf.map(r3),
    bowSpeed: over.bowSpeed.map(r3),
    outputGain: r3(over.outputGain),
  };
  console.log(JSON.stringify(out));
  if (args.includes('--write')) {
    const cur = existsSync(FIT) ? JSON.parse(readFileSync(FIT, 'utf8')) : {};
    cur[inst] = { ...cur[inst], ...out };
    writeFileSync(FIT, JSON.stringify(cur, null, 1) + '\n');
    console.log(`wrote ${FIT}`);
  }
}
