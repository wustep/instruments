// The level of each instrument's notes across its compass, the model's beside the recorded player's: each
// held note's steady RMS (dry, the model alone: `human` 0), the recordings' at pp, mf and ff (University of
// Iowa MIS: one session's gain for an instrument, so the levels of its notes are comparable among themselves,
// not from one instrument to the next). Printed per instrument: the model's level less the recording's, note
// by note, less the instrument's median difference: a register the model plays too soft or too loud beside
// the rest of the instrument stands out.
//   npx tsx scripts/levels-vs-refs.ts [--only clarinet,bass] [--engine <core/index.ts>] [--notes]
import { referenceNotes, type EnsInstrument } from './ensemble-refs.ts';
import { modelNote, matchedParams, useEngine } from './calibrate-ensemble.ts';
import { midiName } from '../packages/engine/src/core/util.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
await useEngine(opt('--engine'));
const only = opt('--only')?.split(',');
const refs = (await referenceNotes()).filter((r) => !r.variant && (!only || only.includes(r.instrument)));
const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
const ids = [...new Set(refs.map((r) => r.instrument))] as EnsInstrument[];
for (const id of ids) {
  const mine = refs.filter((r) => r.instrument === id);
  const rows = mine.map((r) => {
    const m = modelNote({ instrument: id, dyn: r.dyn, midi: r.midi, params: matchedParams(r) });
    return { midi: r.midi, dyn: r.dyn, ref: r.rmsDb, model: m ? m.rmsDb : NaN };
  }).filter((r) => Number.isFinite(r.model) && Number.isFinite(r.ref));
  const off = med(rows.map((r) => r.model - r.ref));
  console.log(`\n${id}: model − recording, median ${off.toFixed(1)} dB (the session's gain); by octave, less that median`);
  for (const dyn of ['pp', 'mf', 'ff'] as const) {
    const d = rows.filter((r) => r.dyn === dyn);
    if (!d.length) continue;
    const byOct = new Map<number, number[]>();
    for (const r of d) {
      const o = Math.floor(r.midi / 12) - 1;
      byOct.set(o, [...(byOct.get(o) ?? []), r.model - r.ref - off]);
    }
    console.log(`  ${dyn}  ` + [...byOct.entries()].sort((a, b) => a[0] - b[0]).map(([o, v]) => `oct ${o}: ${med(v) >= 0 ? '+' : ''}${med(v).toFixed(1)} (n ${v.length})`).join('   ') + `   | dyn median ${med(d.map((r) => r.model - r.ref - off)).toFixed(1)}`);
    if (args.includes('--notes')) console.log('      ' + d.sort((a, b) => a.midi - b.midi).map((r) => `${midiName(r.midi)} ${(r.model - r.ref - off).toFixed(0)}`).join('  '));
  }
}
