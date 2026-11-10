// Try a voicing on the timpani against the recordings: the summary (and, with --table, every stroke).
//   npx tsx scripts/tune-timpani.ts '{"felt":3e9,"mass":0.02}' [--table] [--params '{"spot":0.6}']
import { compareAll, summary, table, timpaniErrors } from './calibrate-timpani.ts';
import { judge, printVerdict } from './judge.ts';
const args = process.argv.slice(2);
const voice = JSON.parse(args.find((a) => a.startsWith('{')) ?? '{}');
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const params = JSON.parse(opt('--params') ?? '{}');
const base = timpaniErrors(compareAll());
const pairs = compareAll({ ...params, voice });
const r = timpaniErrors(pairs);
if (args.includes('--table')) table(pairs);
const s = summary(r.errs, r.measures);
console.log(Object.entries(s).map(([k, v]) => `${k} ${v.toFixed(2)}`).join('  '));
// per dynamic: centroid and level
for (const dyn of ['pp', 'mf', 'ff']) {
  const ps = pairs.filter((p) => p.ref.dyn === dyn);
  const avg = (f: (p: (typeof ps)[0]) => number) => ps.reduce((a, p) => a + f(p), 0) / ps.length;
  console.log(`  ${dyn}: centroid ${avg((p) => p.model.centroid).toFixed(0)}/${avg((p) => p.ref.centroid).toFixed(0)}  level ${avg((p) => p.model.level).toFixed(1)}/${avg((p) => p.ref.level).toFixed(1)}  L21 ${avg((p) => p.model.levels[0]).toFixed(1)}/${avg((p) => p.ref.levels[0]).toFixed(1)}  L31 ${avg((p) => p.model.levels[1]).toFixed(1)}/${avg((p) => p.ref.levels[1]).toFixed(1)}  attack ${avg((p) => p.model.attack).toFixed(1)}/${avg((p) => p.ref.attack).toFixed(1)}`);
}
printVerdict(judge(base.errs, r.errs, base.measures), 'vs the start design');
