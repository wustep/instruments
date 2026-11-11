// Fit the harp's voicing (packages/engine/src/core/harp.ts HARP_VOICE) to the VSCO 2 CE harp on the FIT HALF of
// the recorded strings only (every second one; the others are held out for the judge, scripts/harp-refs.ts).
// The score is the judge's own: each measure's error over the recordings' own string-to-string spread,
// averaged over the measures and the strings (the partials' levels, the third-octave spectrum, the leading
// partial's decay and the upper partials', how long the string rings, the centroid at the pluck and later,
// the attack, the stiffness, and the level once the gain has matched the median string).
//   npx tsx scripts/fit-harp.ts [--iters 1500] [--seed 1] [--from voice.json] [--out voice.json] [--sigma 0.15]
//   npx tsx scripts/fit-harp.ts --polish [--from voice.json] [--out voice.json]   coordinate descent from there
// A (1+1) evolution strategy in the parameters' normalised ranges (log for the scale-free ones), its step
// adapted by the 1/5 rule.
import { readFileSync, writeFileSync } from 'node:fs';
import { compareAll, harpErrors } from './calibrate-harp.ts';
import { harpRefs } from './harp-refs.ts';
import { HARP_VOICE, type HarpVoice } from '../packages/engine/src/core/harp.ts';

type Key = keyof HarpVoice;
/** what the search may move, within what, and whether on a log scale */
export const RANGES: Partial<Record<Key, [number, number, boolean?]>> = {
  beta: [0.3, 0.5],
  betaTop: [0.12, 0.5],
  slope: [0.3, 2.4],
  corner: [300, 9000, true],
  cornerOct: [0.8, 2.2],
  order: [0.5, 4],
  d0: [1, 40, true],
  d0Oct: [1, 2.6],
  d1: [3, 250, true],
  d1Oct: [0.5, 2.2],
  dPow: [0.5, 2.6],
  w0: [0.3, 12, true],
  w0Oct: [0.5, 3.5],
  w1: [1, 80, true],
  wPow: [0.4, 2.6],
  wCorner: [0.25, 4, true],
  wGain: [-14, 14],
  stiff: [3e-5, 6e-4, true],
  stiffOct: [1, 5],
  stiffWire: [5e-6, 5e-4, true],
  tilt: [-9, 5],
  hp: [40, 420, true],
  f1: [110, 520, true],
  g1: [-8, 20],
  q1: [0.4, 5],
  f2: [280, 3000, true],
  g2: [-12, 16],
  q2: [0.4, 5],
  shelfF: [900, 9000, true],
  shelfG: [-20, 12],
  knock: [0.0005, 0.5, true],
  knockF: [70, 320, true],
  knockTau: [0.008, 0.15, true],
  symp: [0.002, 0.2, true],
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

const all = await harpRefs();
const fitRefs = all.filter((r) => !r.held);
const heldRefs = all.filter((r) => r.held);
// the measures' spreads from every recorded string (the recordings' own variation)
const SPREADS = harpErrors(await compareAll(undefined, all), all).measures;

/** the score of a voicing on a half of the strings (lower is better), and the gain (dB) that matched its level */
export async function score(voice: Partial<HarpVoice>, refs = fitRefs): Promise<{ s: number; gain: number; per: Record<string, number> }> {
  const pairs = await compareAll({ voice }, refs);
  const { errs } = harpErrors(pairs, all);
  const lv = errs.map((e) => e.errs.level).filter(Number.isFinite).sort((a, b) => a - b);
  const gain = lv.length ? lv[Math.floor(lv.length / 2)] : 0;
  const per: Record<string, number> = {};
  let tot = 0;
  let n = 0;
  for (const m of SPREADS) {
    const xs = errs.map((e) => Math.abs((m.name === 'level' ? e.errs.level - gain : e.errs[m.name]) / m.spread));
    // (a measure neither the recording nor the model gives, a bass string's fundamental decay, is left out;
    // one the model alone cannot give costs 4 spreads)
    let sum = 0;
    let cnt = 0;
    pairs.forEach((p, i) => {
      if (Number.isFinite(xs[i])) {
        sum += Math.min(xs[i], 8);
        cnt++;
      } else if (m.name === 'ring' ? Number.isFinite(p.ref.ring20) : m.name === 'later' ? Number.isFinite(p.ref.centroidLate) : false) {
        sum += 4;
        cnt++;
      }
    });
    const val = cnt ? sum / cnt : 0;
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
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, rand()))) * Math.cos(2 * Math.PI * rand());
  const start: Record<string, number> = { ...HARP_VOICE, ...(opt('--from') ? JSON.parse(readFileSync(opt('--from')!, 'utf8')) : {}) };
  let u = KEYS.map((k) => toU(k, start[k]));
  const voiceOf = (uu: number[]) => Object.fromEntries(KEYS.map((k, i) => [k, fromU(k, uu[i])])) as Partial<HarpVoice>;
  let best = await score(voiceOf(u));
  let sigma = Number(opt('--sigma') ?? 0.15);
  const out = opt('--out') ?? `.fit/harp-${seed}.json`;
  const show = (r: typeof best) => Object.entries(r.per).map(([k, x]) => `${k} ${x.toFixed(2)}`).join(' ');
  const save = (r: typeof best) => writeFileSync(out, JSON.stringify({ ...voiceOf(u), gainDb: +((start.gainDb ?? 0) - r.gain).toFixed(2) }, null, 1));
  console.log(`start ${best.s.toFixed(3)} gain ${best.gain.toFixed(1)} ${show(best)}`);
  if (args.includes('--polish')) {
    // coordinate descent: each parameter in turn, a step either way, the step halved when neither helps
    const step = KEYS.map(() => 0.08);
    for (let round = 0; round < 6; round++) {
      let moved = 0;
      for (let i = 0; i < KEYS.length; i++) {
        for (const dir of [1, -1]) {
          const cand = u.slice();
          cand[i] = Math.min(1, Math.max(0, u[i] + dir * step[i]));
          if (cand[i] === u[i]) continue;
          const r = await score(voiceOf(cand));
          if (r.s < best.s - 1e-4) {
            best = r;
            u = cand;
            moved++;
            step[i] *= 1.3;
            break;
          } else if (dir === -1) step[i] *= 0.5;
        }
      }
      save(best);
      console.log(`round ${round + 1} ${best.s.toFixed(3)} moved ${moved} ${show(best)}`);
      if (!moved) break;
    }
  } else {
    let wins = 0;
    for (let it = 1; it <= iters; it++) {
      // a few coordinates at a time (most steps), sometimes all of them
      const every = rand() < 0.15;
      const cand = u.map((x) => (every || rand() < 0.12 ? Math.min(1, Math.max(0, x + sigma * gauss())) : x));
      const r = await score(voiceOf(cand));
      if (r.s < best.s) {
        best = r;
        u = cand;
        wins++;
        save(best);
      }
      if (it % 25 === 0) {
        sigma *= wins / 25 > 0.2 ? 1.22 : 0.85;
        sigma = Math.min(0.4, Math.max(0.01, sigma));
        wins = 0;
        console.log(`${it} ${best.s.toFixed(3)} σ ${sigma.toFixed(3)} ${show(best)}`);
      }
    }
  }
  const held = await score(voiceOf(u), heldRefs);
  console.log(`fit ${best.s.toFixed(3)} held-out ${held.s.toFixed(3)} ${show(held)}`);
  console.log(JSON.stringify({ ...voiceOf(u), gainDb: +((start.gainDb ?? 0) - best.gain).toFixed(2) }));
}
