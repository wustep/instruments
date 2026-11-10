// Polish a fitted timpani voicing by coordinate descent: each parameter of fit-timpani.ts's RANGES in turn
// moved a step up and down its normalised range, kept when the fit half's score improves; the step halves
// when a whole sweep finds nothing. The held-out drums are never seen.
//   npx tsx scripts/polish-timpani.ts --from voice.json --out voice.json [--sweeps 6] [--step 0.08] [--seed 1]
import { readFileSync, writeFileSync } from 'node:fs';
import { RANGES, score } from './fit-timpani.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const from = JSON.parse(readFileSync(opt('--from')!, 'utf8')) as Record<string, number>;
const out = opt('--out')!;
let step = Number(opt('--step') ?? 0.08);
const sweeps = Number(opt('--sweeps') ?? 6);
let seed = Number(opt('--seed') ?? 1);
const keys = Object.keys(RANGES);
const toU = (k: string, v: number) => {
  const [lo, hi, lg] = RANGES[k as never]!;
  return lg ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo);
};
const fromU = (k: string, u: number) => {
  const [lo, hi, lg] = RANGES[k as never]!;
  const x = Math.min(1, Math.max(0, u));
  return lg ? lo * Math.pow(hi / lo, x) : lo + (hi - lo) * x;
};
const cur: Record<string, number> = { ...from };
delete cur.gainDb;
const evalOf = (v: Record<string, number>) => score(v as never);
let best = evalOf(cur);
console.log(`start ${best.s.toFixed(3)}`);
for (let sw = 0; sw < sweeps; sw++) {
  let improved = false;
  // a shuffled order each sweep
  const order = keys.slice().sort(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5);
  for (const k of order) {
    const u0 = toU(k, cur[k]);
    for (const d of [step, -step]) {
      const u = u0 + d;
      if (u < 0 || u > 1) continue;
      const cand = { ...cur, [k]: fromU(k, u) };
      const r = evalOf(cand);
      if (r.s < best.s - 1e-4) {
        best = r;
        cur[k] = cand[k];
        improved = true;
        writeFileSync(out, JSON.stringify({ ...cur, gainDb: -r.gain }, null, 1));
        // keep going the same way while it helps
        let u2 = u + d;
        while (u2 >= 0 && u2 <= 1) {
          const c2 = { ...cur, [k]: fromU(k, u2) };
          const r2 = evalOf(c2);
          if (r2.s >= best.s - 1e-4) break;
          best = r2;
          cur[k] = c2[k];
          writeFileSync(out, JSON.stringify({ ...cur, gainDb: -r2.gain }, null, 1));
          u2 += d;
        }
        break;
      }
    }
  }
  console.log(`sweep ${sw} step ${step.toFixed(3)} ${best.s.toFixed(3)} ${Object.entries(best.per).map(([k, x]) => `${k} ${x.toFixed(2)}`).join(' ')}`);
  if (!improved) step /= 2;
}
writeFileSync(out, JSON.stringify({ ...cur, gainDb: -best.gain }, null, 1));
