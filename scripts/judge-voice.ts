// A voicing tried before it is written into the engine: the judge's verdict on this checkout's engine with a
// voice override (the engines' fitting-only `voice` parameter) against the same engine without it.
//   npx tsx scripts/judge-voice.ts --instrument horn --voice '{"shelfG":-10}' [--voice-file v.json] [--dyn]
// --dyn: the summary by dynamic as well (spectrum, centroid).
import { readFileSync } from 'node:fs';
import { compareAll, harmErr, summarise } from './calibrate-ensemble.ts';
import type { EnsInstrument } from './ensemble-refs.ts';
import { judge, printVerdict, sustainedErrors } from './judge.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const inst = (opt('--instrument') ?? 'horn') as EnsInstrument;
const voice = opt('--voice-file') ? JSON.parse(readFileSync(opt('--voice-file')!, 'utf8')) : JSON.parse(opt('--voice') ?? '{}');
const a = await compareAll({ only: [inst] });
const b = await compareAll({ only: [inst], params: { [inst]: { voice } } });
const ea = sustainedErrors(a, harmErr);
const eb = sustainedErrors(b, harmErr);
printVerdict(judge(ea.errs, eb.errs, ea.measures), `${inst}: this engine → with ${JSON.stringify(voice)}`);
if (args.includes('--dyn')) {
  for (const [name, pairs] of [['before', a], ['after', b]] as const) {
    const s = summarise(pairs, inst);
    console.log(`  ${name}: harmonics ${s.harmRmsDb} dB, spectrum ${s.ltasRmsDb} dB ${JSON.stringify(s.ltasRmsDbByDyn)}, centroid ×${s.centroidRatio} ${JSON.stringify(s.centroidRatioByDyn)}, noise ${s.hnrDiffDb} dB, attack ×${s.attackRatio}, pp→ff ${s.dynSpreadDb.model} dB (recorded ${s.dynSpreadDb.ref}), pitch ${s.pitchCentsRms} ¢`);
  }
}
process.exit(0);
