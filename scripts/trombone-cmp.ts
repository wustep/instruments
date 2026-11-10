// One voicing against a few Iowa trombone notes: harmonics (dB re the strongest), centroid, HNR, attack, level,
// model / recording. For hand probes during a fit.
//   npx tsx scripts/trombone-cmp.ts [--voice voice.json] [--notes tenor:ff:58,bass:mf:40]
import { readFileSync } from 'node:fs';
import { modelNote, matchedParams } from './calibrate-ensemble.ts';
import { referenceNotes } from './ensemble-refs.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const voice = opt('--voice') ? (opt('--voice')!.trim().startsWith('{') ? JSON.parse(opt('--voice')!) : JSON.parse(readFileSync(opt('--voice')!, 'utf8'))) : {};
const want = (opt('--notes') ?? 'tenor:pp:46,tenor:mf:46,tenor:ff:46,tenor:pp:58,tenor:mf:58,tenor:ff:58,tenor:mf:64,tenor:ff:64,tenor:ff:70,bass:mf:34,bass:ff:40,bass:ff:52').split(',');
const refs = (await referenceNotes()).filter((r) => r.instrument === 'trombone');
const f0 = (x: number) => x.toFixed(0).padStart(4);
for (const w of want) {
  const [set, dyn, m] = w.split(':');
  const r = refs.find((x) => (x.variant ?? 'tenor') === set && x.dyn === dyn && x.midi === +m);
  if (!r) continue;
  const a = modelNote({ instrument: 'trombone', dyn: r.dyn, midi: r.midi, params: matchedParams(r, { voice, ...(r.variant ? { size: r.variant } : {}) }) });
  if (!a) {
    console.log(w, 'model silent');
    continue;
  }
  console.log(`${w.padEnd(13)} ref ${r.harm.slice(0, 10).map(f0).join('')} | cent ${r.centroid.toFixed(0)} hnr ${r.hnrDb.toFixed(0)} att ${r.attackMs.toFixed(0)} rms ${r.rmsDb.toFixed(1)}`);
  console.log(`${''.padEnd(13)} mod ${a.harm.slice(0, 10).map(f0).join('')} | cent ${a.centroid.toFixed(0)} hnr ${a.hnrDb.toFixed(0)} att ${a.attackMs.toFixed(0)} rms ${a.rmsDb.toFixed(1)}`);
}
