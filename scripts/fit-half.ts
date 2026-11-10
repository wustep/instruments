// Choose a bowed design value on the FIT HALF only (the even MIDI notes; scripts/judge.ts keeps the
// odd ones for the verdict): the judge's per-measure error and score over the fit half, for this
// checkout's design and for each candidate override, with the measures' spreads from --before (the
// engine the verdict will compare against, as judge.ts does). bowed-fit.json is restored after.
//   npx tsx scripts/fit-half.ts viola --before <main>/packages/engine/src/core/index.ts '{"rosinNoise":0.08}' '{"attackTau":[0.2,0.12]}'
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { compareAll, harmErr, useEngine } from './calibrate-ensemble.ts';
import type { EnsInstrument } from './ensemble-refs.ts';
import { isHeldOut, sustainedErrors, type NoteErr } from './judge.ts';

const FIT = join(import.meta.dirname, '..', 'packages/engine/src/core/bowed-fit.json');
const args = process.argv.slice(2);
const inst = args[0] as EnsInstrument;
const bi = args.indexOf('--before');
const before = bi >= 0 ? resolve(args[bi + 1]) : undefined;
const sets = args.slice(1).filter((a, i, all) => a !== '--before' && all[i - 1] !== '--before').map((a) => JSON.parse(a) as Record<string, unknown>);
await useEngine(before);
const { measures } = sustainedErrors(await compareAll({ only: [inst] }), harmErr);
await useEngine(undefined);
const orig = readFileSync(FIT, 'utf8');
try {
  for (const o of [{}, ...sets]) {
    const j = JSON.parse(orig);
    j[inst] = { ...j[inst], ...o };
    writeFileSync(FIT, JSON.stringify(j, null, 1) + '\n');
    const fit = sustainedErrors(await compareAll({ only: [inst] }), harmErr).errs.filter((e: NoteErr) => !isHeldOut(e));
    const mean = (xs: number[]) => xs.filter(Number.isFinite).reduce((a, b, _, s) => a + b / s.length, 0);
    const score = mean(fit.map((e) => mean(measures.map((m) => Math.abs(e.errs[m.name]) / m.spread))));
    console.log(`${JSON.stringify(o)} fit half (n=${fit.length}): score ${score.toFixed(3)} | ${measures.map((m) => `${m.name} ${mean(fit.map((e) => Math.abs(e.errs[m.name]))).toFixed(2)}`).join(' | ')}`);
  }
} finally {
  writeFileSync(FIT, orig);
}
