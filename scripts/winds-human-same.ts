// The woodwinds' player off (`human` 0) must be the engine without one, sample for sample: not only a note
// alone (scripts/winds-alone-same.ts) but a file's passages as the Orchestra plays them (every note told
// ahead, joined, slurred, tongued over the breath, stopped over a rest), dry and through the room.
//   npx tsx scripts/winds-human-same.ts --before <old>/packages/engine/src/core/index.ts [--instrument flute,oboe,clarinet,bassoon] [--fs 48000]
// Every bundled piece's woodwind parts (the first 40 s of each, each part as its player), at 48 kHz. Exits 1
// on a difference.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as now from '../packages/engine/src/core/index.ts';
import { foreseen, windParts, type WindPart } from './winds-midi-lib.ts';
import { excerpt } from './winds-midi-measure.ts';

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const before = (await import(pathToFileURL(resolve(arg('--before')!)).href)) as typeof now;
const ids = (arg('--instrument') ?? 'flute,oboe,clarinet,bassoon').split(',');
const fs = Number(arg('--fs') ?? 48000);
let bad = 0;
for (const p of windParts().filter((q) => ids.includes(q.instrument))) {
  const ex = excerpt(p as WindPart, 0, 40);
  if (!ex.notes.length) continue;
  const events = [...foreseen(ex.notes), ...ex.events];
  let worst = 0;
  for (const dry of [true, false]) {
    const a = now.renderInstrument({ sampleRate: fs, instrument: p.instrument as now.InstrumentId, events, duration: ex.dur, dry, player: p.player, params: { human: 0 } } as never);
    const b = before.renderInstrument({ sampleRate: fs, instrument: p.instrument as now.InstrumentId, events, duration: ex.dur, dry, player: p.player } as never);
    for (let i = 0; i < a.left.length; i++) worst = Math.max(worst, Math.abs(a.left[i] - b.left[i]), Math.abs(a.right[i] - b.right[i]));
  }
  if (worst > 0) bad++;
  console.log(`${p.name.padEnd(36)} ${String(ex.notes.length).padStart(4)} notes: largest difference ${worst}${worst ? '  <-- differs' : ''}`);
}
console.log(bad ? `${bad} parts differ` : 'every part bit-identical');
process.exit(bad ? 1 : 0);
