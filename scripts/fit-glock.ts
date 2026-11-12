// The glockenspiel's voicing from its recordings (scripts/glock-refs.ts), on every second bar of its compass
// (the even MIDI notes; the others are held out for the judge). Not a search: each family of partials is
// measured on each recorded stroke, and its ratio to the pitch, its level and its decay are regressed over
// the bar's pitch (octaves from C6) and the dynamic (−1 pp, 0 mf, 1 ff). Only the mallet's knock is found by
// trying (a small grid on the attack's error).
//   npx tsx scripts/fit-glock.ts [--out .fit/glock.json]
import { mkdirSync, writeFileSync } from 'node:fs';
import { GLOCK_FAMILIES, GLOCK_TEXTBOOK, type GlockVoice } from '../packages/engine/src/core/index.ts';
import { compareAll, glockErrors, inCompass, MARK_VEL, summary } from './calibrate-glock.ts';
import { FAMILY_AT, glockRefs, type GlockRef } from './glock-refs.ts';

const all = inCompass(await glockRefs());
const fit = all.filter((r) => !r.held);
const plastic = fit.filter((r) => r.mark !== 'brass');
const brass = inCompass(await glockRefs(), true).filter((r) => !r.held && r.mark === 'brass');
const oct = (r: GlockRef) => (r.midi - 84) / 12;
/** the stroke's level re mezzo-forte's, in tens of dB (the engine's dynamic coordinate) */
const dyn = (r: GlockRef) => 4 * Math.log10(MARK_VEL[r.mark] / 75);
/** a family is there on a stroke when it is within 55 dB of the pitch and is followed dying away (a peak of
 *  the quiet runs' noise is neither) */
const found = (r: GlockRef, k: number) => Number.isFinite(r.levels[k]) && r.levels[k] - r.levels[0] > -55 && Number.isFinite(r.ratios[k]) && (k === 0 || r.decays[k] > 1);

/** least squares: y on the columns of X (normal equations, Gauss) */
function lsq(X: number[][], y: number[]): number[] {
  const n = X[0].length;
  const A = Array.from({ length: n }, () => new Array<number>(n + 1).fill(0));
  for (let r = 0; r < X.length; r++)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) A[i][j] += X[r][i] * X[r][j];
      A[i][n] += X[r][i] * y[r];
    }
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    if (Math.abs(A[i][i]) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const m = A[r][i] / A[i][i];
      for (let c = i; c <= n; c++) A[r][c] -= m * A[i][c];
    }
  }
  return A.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}
const median = (xs: number[]) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
};
const round = (x: number, d = 3) => +x.toFixed(d);

const V: GlockVoice = JSON.parse(JSON.stringify(GLOCK_TEXTBOOK));
for (let k = 0; k < GLOCK_FAMILIES; k++) {
  // the bars the family is looked for on, and those it is found on
  const on = (rs: GlockRef[]) => rs.filter((r) => Number.isFinite(FAMILY_AT(r.midi)[k]));
  const got = on(fit).filter((r) => found(r, k));
  if (k > 0) {
    // its ratio: log₂ on the octaves
    const [a, b] = lsq(got.map((r) => [1, oct(r)]), got.map((r) => Math.log2(r.ratios[k])));
    V.ratio[k] = round(2 ** a, 4);
    V.ratioOct[k] = round(-b, 4);
    // its level re the pitch's: on the octaves and the dynamic (a family not found on a bar it is looked for
    // on is 62 dB under there)
    // (where it is found, mezzo-forte and fortissimo: under a pianissimo stroke it is in the recording's noise.
    // How it grows with the stroke: the median, over the bars that have it at both, of its fortissimo level
    // less its mezzo-forte level, per 10 dB; never less than the pitch itself grows, nor more than 8 dB)
    const P = on(plastic).filter((r) => r.mark !== 'pp' && found(r, k));
    const pairsOf = P.filter((r) => r.mark === 'ff').map((r) => [r, P.find((q) => q.mark === 'mf' && q.midi === r.midi)] as const).filter((p): p is readonly [GlockRef, GlockRef] => !!p[1]);
    const l2 = Math.min(8, Math.max(0, median(pairsOf.map(([a, b]) => (a.levels[k] - a.levels[0] - (b.levels[k] - b.levels[0])) / (dyn(a) - dyn(b))))));
    const [l0, l1] = lsq(P.map((r) => [1, oct(r)]), P.map((r) => r.levels[k] - r.levels[0] - l2 * dyn(r)));
    V.level[k] = round(l0, 2);
    V.levelOct[k] = round(l1, 2);
    V.levelDyn[k] = round(l2, 2);
    // a brass mallet's, re the plastic one's at the same velocity: the median over its clean strokes that
    // have the family (its run is too poor to fit to or judge by: a figure for the mallet knob, 0–12 dB)
    V.levelBrass[k] = round(Math.min(12, Math.max(0, median(on(brass).filter((r) => found(r, k)).map((r) => r.levels[k] - r.levels[0] - (l0 + l1 * oct(r) + l2 * dyn(r)))))), 2);
  } else {
    // the bar's own level over the compass (its level over the dynamics is the velocities': MARK_VEL; the
    // session's gain is not kept, nor the brass mallets' session's)
    const [, l1] = lsq(plastic.map((r) => [1, oct(r), dyn(r)]), plastic.map((r) => r.level));
    V.level[0] = 0;
    V.levelOct[0] = round(l1, 2);
    V.levelDyn[0] = 0;
    V.levelBrass[0] = 0;
  }
  // its decay: log₂ on the octaves
  const dec = got.filter((r) => r.decays[k] > 0.3 && (k === 0 || r.levels[k] - r.levels[0] > -40));
  if (dec.length >= 4) {
    // (the pitch's own decay bends over the compass: a term in the octaves squared)
    const [a, b, c] = lsq(dec.map((r) => (k === 0 ? [1, oct(r), oct(r) ** 2] : [1, oct(r)])), dec.map((r) => Math.log2(r.decays[k])));
    V.decay[k] = round(2 ** a, 2);
    V.decayOct[k] = round(2 ** b, 3);
    V.decayOct2[k] = k === 0 ? round(2 ** c, 3) : 1;
  }
  console.log(`family ${k}: on ${got.length}/${on(fit).length} strokes  ratio ${V.ratio[k]} (−${V.ratioOct[k]}/oct)  level ${V.level[k]} ${V.levelOct[k]}/oct ${V.levelDyn[k]}/dyn brass ${V.levelBrass[k]}  decay ${V.decay[k]} dB/s ×${V.decayOct[k]}/oct`);
}
// (the brass mallet's level is its strokes': the engine adds levelBrass[0] at mallet 1, so keep it in the level)
// the knock: its level and how it grows with the dynamic, by the attack's error on the fit bars
const score = async (v: GlockVoice) => {
  const { errs, measures } = glockErrors(await compareAll({ voice: v }, fit), all);
  const s = summary(errs, measures);
  return { attack: s.attack, all: measures.reduce((t, m) => t + s[m.name] / m.spread, 0) / measures.length, s };
};
let best = { k: V.knock, d: V.knockDyn, e: Infinity };
for (const d of [0, 2, 4, 6])
  for (let k = -44; k <= -4; k += 4) {
    const e = (await score({ ...V, knock: k, knockDyn: d })).attack;
    if (e < best.e) best = { k, d, e };
  }
for (const k of [best.k - 2, best.k + 2]) {
  const e = (await score({ ...V, knock: k, knockDyn: best.d })).attack;
  if (e < best.e) best = { k, d: best.d, e };
}
V.knock = best.k;
V.knockDyn = best.d;
const r = await score(V);
console.log(`knock ${V.knock} dB, ${V.knockDyn} dB a dynamic step (attack error ${best.e.toFixed(2)} dB)`);
console.log(`fit half: ${r.all.toFixed(3)}  ` + Object.entries(r.s).map(([k, x]) => `${k} ${x.toFixed(2)}`).join(' '));
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : '.fit/glock.json';
mkdirSync('.fit', { recursive: true });
writeFileSync(out, JSON.stringify(V, null, 1));
console.log(JSON.stringify(V));
