// Every instrument through the judge at once: this checkout's engine against an older one (or against
// itself: the scores as they stand), one row an instrument. The table docs/CALIBRATION.md's "Current scores"
// is made from.
//   npx tsx scripts/judge-all.ts [--before <old engine>/packages/engine/src/core/index.ts] [--only horn,piano] [--md]
// The piano needs every key of the Steinway (`pnpm refs:fetch --all`); without them it is left out.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { judge, sustainedErrors, type Measure, type NoteErr, type Verdict } from './judge.ts';
import { wavPath } from './references.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const before = opt('--before') ? resolve(opt('--before')!) : undefined;
const only = opt('--only')?.split(',');
const md = args.includes('--md');

type Side = { errs: NoteErr[]; measures: Measure[] };
const SUSTAINED = ['violin', 'viola', 'cello', 'bass', 'flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'tuba'];

async function sides(inst: string): Promise<[Side, Side] | null> {
  if (inst === 'piano') {
    // (B0 is a key the fit never sees: there only with every key fetched)
    if (!existsSync(wavPath(23, 'ff'))) return null;
    const t = await import('./piano-judge.ts');
    await t.useEngine(before);
    const b = t.pianoErrors(await t.compareAll());
    await t.useEngine(undefined);
    return [b, t.pianoErrors(await t.compareAll())];
  }
  if (inst === 'timpani') {
    const t = await import('./calibrate-timpani.ts');
    await t.useEngine(before);
    const b = t.timpaniErrors(t.compareAll());
    await t.useEngine(undefined);
    return [b, t.timpaniErrors(t.compareAll())];
  }
  if (inst === 'harp') {
    const t = await import('./calibrate-harp.ts');
    await t.useEngine(before);
    const b = t.harpErrors(await t.compareAll());
    await t.useEngine(undefined);
    return [b, t.harpErrors(await t.compareAll())];
  }
  if (inst === 'glockenspiel') {
    const t = await import('./calibrate-glock.ts');
    await t.useEngine(before);
    const b = t.glockErrors(await t.compareAll());
    await t.useEngine(undefined);
    return [b, t.glockErrors(await t.compareAll())];
  }
  const t = await import('./calibrate-ensemble.ts');
  await t.useEngine(before);
  const b = sustainedErrors(await t.compareAll({ only: [inst as never] }), t.harmErr);
  await t.useEngine(undefined);
  return [b, sustainedErrors(await t.compareAll({ only: [inst as never] }), t.harmErr)];
}

const f = (x: number, n = 2) => (Number.isFinite(x) ? x.toFixed(n) : 'n/a');
const rows: { inst: string; v: Verdict }[] = [];
for (const inst of ['piano', ...SUSTAINED, 'timpani', 'harp', 'glockenspiel']) {
  if (only && !only.includes(inst)) continue;
  const s = await sides(inst);
  if (!s) {
    console.error(`${inst}: left out (pnpm refs:fetch --all)`);
    continue;
  }
  const v = judge(s[0].errs, s[1].errs, s[0].measures);
  rows.push({ inst, v });
  const same = Math.abs(v.heldOut.delta) < 5e-3 && v.heldOut.se < 5e-3;
  const measures = Object.entries(v.perMeasure)
    .map(([k, m]) => `${k} ${f(m.before)}${same ? '' : ` → ${f(m.after)}`} (${f(m.spread)})`)
    .join(md ? '; ' : ', ');
  const score = same ? f(v.heldOut.after) : `${f(v.heldOut.before)} → ${f(v.heldOut.after)} (Δ ${f(v.heldOut.delta)} ± ${f(v.heldOut.se)})`;
  if (md) console.log(`| ${inst} | ${v.heldOut.n} | ${f(v.fit.after)} | ${score} | ${before && !same ? v.verdict : '–'} | ${measures} |`);
  else console.log(`${inst.padEnd(13)} held-out ${score}, n=${v.heldOut.n}; fit ${f(v.fit.before)} → ${f(v.fit.after)}${before ? `; ${same ? 'identical' : v.verdict}` : ''}${v.guardsBroken.length ? ` (guards: ${v.guardsBroken.join(', ')})` : ''}\n    ${measures}`);
}
process.exit(0);
