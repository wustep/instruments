// One trumpet iteration against the Iowa trumpet (105 notes, pp/mf/ff, E3–E♭6): the summary
// measures, per-note errors saved under a label, and the judge's verdict against an earlier label.
//   npx tsx scripts/trumpet-iter.ts <label> [--vs <earlier label>] [--engine <path>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compareAll, harmErr, summarise, useEngine } from './calibrate-ensemble.ts';
import { judge, printVerdict, sustainedErrors, type Measure, type NoteErr } from './judge.ts';

const args = process.argv.slice(2);
const label = args[0];
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const DIR = join(import.meta.dirname, '..', '.cache', 'trumpet-iter');
mkdirSync(DIR, { recursive: true });
await useEngine(opt('--engine') ? resolve(opt('--engine')!) : undefined);
const pairs = await compareAll({ only: ['trumpet'] });
const s = summarise(pairs, 'trumpet');
const { errs, measures } = sustainedErrors(pairs as never, harmErr);
writeFileSync(join(DIR, `${label}.json`), JSON.stringify({ errs, measures, summary: s }));
const brief = {
  harmonics: s.harmRmsDb,
  spectrum: s.ltasRmsDb,
  spectrumByDyn: s.ltasRmsDbByDyn,
  centroid: s.centroidRatio,
  centroidByDyn: s.centroidRatioByDyn,
  evenOdd: s.evenOddErrDb,
  noise: s.hnrDiffDb,
  attack: s.attackRatio,
  dynSpread: s.dynSpreadDb,
  pitch: s.pitchCentsRms,
};
console.log(`${label}: ${JSON.stringify(brief)}`);
const vs = opt('--vs');
if (vs && existsSync(join(DIR, `${vs}.json`))) {
  const b = JSON.parse(readFileSync(join(DIR, `${vs}.json`), 'utf8')) as { errs: NoteErr[]; measures: Measure[] };
  const v = judge(b.errs, errs, b.measures);
  printVerdict(v, `trumpet ${vs} → ${label}`);
  writeFileSync(join(DIR, `${vs}--${label}.verdict.json`), JSON.stringify(v));
}
