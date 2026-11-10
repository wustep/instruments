// Fit the timpani's voicing (packages/engine/src/core/timpani.ts TIMPANI_VOICE, and the default strike
// point) to the VSCO 2 CE timpani on the FIT HALF of the strokes only (drums 1, 3 and 5: drums 2 and 4 are
// held out for the judge, scripts/timpani-refs.ts). The score is the judge's own: each measure's error over
// the recordings' own stroke-to-stroke spread, averaged over the measures and the strokes (the partials'
// frequencies and levels, the third-octave spectrum, the (1,1)'s and (2,1)'s decay, how long it rings, the
// centroid, the attack, the pitch, and the level once the gain has matched the median stroke).
//   npx tsx scripts/fit-timpani.ts [--iters 1500] [--seed 1] [--from voice.json] [--out voice.json] [--sigma 0.15]
// A (1+1) evolution strategy in the parameters' normalised ranges (log for the scale-free ones), its step
// adapted by the 1/5 rule.
import { readFileSync, writeFileSync } from 'node:fs';
import { compareAll, timpaniErrors, usable } from './calibrate-timpani.ts';
import { timpaniRefs } from './timpani-refs.ts';
import { TIMPANI_VOICE, type TimpaniVoice } from '../packages/engine/src/core/timpani.ts';

type Key = keyof TimpaniVoice | 'spot';
/** what the search may move, within what, and whether on a log scale */
export const RANGES: Partial<Record<Key, [number, number, boolean?]>> = {
  mu11: [1.2, 3.2],
  muExp: [0.6, 1.4],
  kettle: [0.3, 3, true],
  rad: [0.1, 3, true],
  rim1: [0, 8],
  rim0: [0, 40],
  dFloor: [0.05, 5, true],
  dInt: [0.05, 40, true],
  dExp: [0.3, 3],
  listen: [0.5, 1.55],
  spread: [0, 0.8],
  azim: [Math.PI / 2, Math.PI],
  stretch: [0, 3],
  radM: [-3, 9],
  hiGain: [0, 90],
  hiFc: [600, 9000, true],
  hiDecay: [2, 120, true],
  mass: [0.006, 0.06, true],
  felt: [1e6, 1e12, true],
  feltExp: [1.5, 4.5],
  hyst: [0, 0.6],
  thick: [0.0005, 0.012, true],
  core: [1e5, 3e8, true],
  vLo: [0.05, 1.5, true],
  vHi: [0.8, 8, true],
  vCurve: [0.4, 2.5],
  f1: [100, 3000, true],
  q1: [0.3, 3],
  g1: [-12, 12],
  shelfF: [800, 8000, true],
  shelfG: [-18, 12],
  spot: [0.45, 0.9],
};
const KEYS = Object.keys(RANGES) as Key[];

const toU = (k: Key, v: number) => {
  const [lo, hi, lg] = RANGES[k]!;
  return lg ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo);
};
const fromU = (k: Key, u: number) => {
  const [lo, hi, lg] = RANGES[k]!;
  const x = Math.min(1, Math.max(0, u));
  return lg ? lo * Math.pow(hi / lo, x) : lo + (hi - lo) * x;
};

const all = timpaniRefs().filter(usable);
const fitRefs = all.filter((r) => !r.held);
// the measures' spreads from every stroke (the recordings' own variation)
const SPREADS = timpaniErrors(compareAll(undefined, all)).measures;

/** the score of a voicing on the fit half (lower is better), and the gain (dB) that matched its level */
export function score(v: Partial<TimpaniVoice> & { spot?: number }): { s: number; gain: number; per: Record<string, number> } {
  const { spot, ...voice } = v;
  const pairs = compareAll({ voice, ...(spot ? { spot } : {}) }, fitRefs);
  const { errs } = timpaniErrors(pairs);
  // the gain: the median stroke's level matched
  const lv = errs.map((e) => e.errs.level).filter(Number.isFinite).sort((a, b) => a - b);
  const gain = lv.length ? lv[Math.floor(lv.length / 2)] : 0;
  const per: Record<string, number> = {};
  let tot = 0;
  let n = 0;
  for (const m of SPREADS) {
    const xs = errs.map((e) => Math.abs((m.name === 'level' ? e.errs.level - gain : e.errs[m.name]) / m.spread));
    const ok = xs.filter(Number.isFinite);
    // a measure the model cannot produce (a partial missing, never ringing down) costs as much as 4 spreads
    const val = (ok.reduce((a, b) => a + b, 0) + 4 * (xs.length - ok.length)) / Math.max(1, xs.length);
    per[m.name] = val;
    tot += val;
    n++;
  }
  return { s: tot / n, gain, per };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const iters = Number(opt('--iters') ?? 1500);
  let seed = Number(opt('--seed') ?? 1);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, rand()))) * Math.cos(2 * Math.PI * rand());
  const start: Record<string, number> = { ...TIMPANI_VOICE, spot: 0.7, ...(opt('--from') ? JSON.parse(readFileSync(opt('--from')!, 'utf8')) : {}) };
  let u = KEYS.map((k) => toU(k, start[k]));
  const voiceOf = (uu: number[]) => Object.fromEntries(KEYS.map((k, i) => [k, fromU(k, uu[i])])) as Partial<TimpaniVoice> & { spot: number };
  let best = score(voiceOf(u));
  let sigma = Number(opt('--sigma') ?? 0.15);
  const out = opt('--out') ?? `/tmp/timpani-fit-${seed}.json`;
  console.log(`start ${best.s.toFixed(3)} gain ${best.gain.toFixed(1)}`);
  let wins = 0;
  for (let it = 1; it <= iters; it++) {
    // a few coordinates at a time (most steps), sometimes all of them
    const all = rand() < 0.2;
    const cand = u.map((x) => (all || rand() < 0.25 ? Math.min(1, Math.max(0, x + sigma * gauss())) : x));
    const r = score(voiceOf(cand));
    if (r.s < best.s) {
      best = r;
      u = cand;
      wins++;
      const v = voiceOf(u);
      writeFileSync(out, JSON.stringify({ ...v, gainDb: -r.gain }, null, 1));
    }
    if (it % 20 === 0) {
      // the 1/5 rule
      sigma *= wins / 20 > 0.2 ? 1.22 : 0.85;
      sigma = Math.min(0.4, Math.max(0.01, sigma));
      wins = 0;
      console.log(`${it} ${best.s.toFixed(3)} σ ${sigma.toFixed(3)} ${Object.entries(best.per).map(([k, x]) => `${k} ${x.toFixed(2)}`).join(' ')}`);
    }
  }
  console.log(JSON.stringify(voiceOf(u)));
}
