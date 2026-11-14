// The bundled pieces' dynamics, written into their files from their marks (marks/*.ts, dynamics.ts).
//   npx tsx scripts/score-dynamics/build.ts [--piece <id>] [--from <dir>] [--check] [--report]
// Reads apps/web/public/pieces/<file> (or the same name in --from: Mutopia's own file), writes it back
// with its dynamics, and prints its sha256 (orchestra/pieces.ts) and each line's velocities and CC11
// before and after. A file already built gives itself: the build can be run again at any time.
// --check: write nothing; fail if a bundled file is not what its marks make.
// --report: write nothing; print the ranges only (of --from against the bundled files).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { giveDynamics, rangesOf, sha256 } from './dynamics.ts';
import { SCORES } from './marks/index.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const DIR = 'apps/web/public/pieces';
const only = opt('--piece');
const from = opt('--from');
const check = args.includes('--check');
const report = args.includes('--report');
let bad = 0;
const r = (x: [number, number] | null) => (x ? `${x[0]}–${x[1]}` : '—');
for (const m of SCORES) {
  if (only && m.id !== only) continue;
  const src = new Uint8Array(readFileSync(join(from ?? DIR, m.file)));
  const before = rangesOf(src);
  const out = report ? { bytes: new Uint8Array(readFileSync(join(DIR, m.file))) } : giveDynamics(src, m);
  const after = rangesOf(out.bytes);
  const sha = sha256(out.bytes);
  console.log(`\n${m.id}  ${m.file}  ${src.length} → ${out.bytes.length} bytes  sha256 ${sha}${sha256(src) === m.from ? '  (from the file as it came)' : ''}`);
  console.log('  line player     notes  velocity before → after (distinct)   CC11 before → after (events)');
  for (const a of after) {
    const b = before[a.line];
    const who = m.players[a.line];
    console.log(`  ${String(a.line).padStart(4)} ${(who ?? '(as it was)').padEnd(11)} ${String(a.notes).padStart(5)}  ${r(b.vel).padStart(8)} (${String(b.distinct).padStart(2)}) → ${r(a.vel).padEnd(7)} (${String(a.distinct).padStart(2)})        ${r(b.cc11).padStart(7)} → ${r(a.cc11).padEnd(7)} (${a.ccEvents})`);
  }
  if (report) continue;
  const now = new Uint8Array(readFileSync(join(DIR, m.file)));
  const same = now.length === out.bytes.length && now.every((x, i) => x === out.bytes[i]);
  if (check) {
    if (!same) {
      bad++;
      console.log('  NOT what its marks make');
    }
  } else if (!same) writeFileSync(join(DIR, m.file), out.bytes);
}
if (bad) process.exit(1);
