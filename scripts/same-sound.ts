// Is an instrument's sound, sample for sample, what another checkout's engine renders? For a refactor that
// must not change it (the horn's and the trumpet's, when the tuba took the horn's engine as its own):
//   npx tsx scripts/same-sound.ts --before ../piano-model/packages/engine/src/core/index.ts --instrument horn,trumpet
// A passage with held notes, joined notes (tongued over the breath), a slur, repeated notes and foreseen ones,
// at 44.1 and 48 kHz, dry and through the room. Prints the largest difference; exits 1 when there is one.
import { resolve } from 'node:path';
import * as now from '../packages/engine/src/core/index.ts';

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const before = (await import(resolve(arg('--before') ?? '../piano-model/packages/engine/src/core/index.ts'))) as typeof now;
const ids = (arg('--instrument') ?? 'horn,trumpet').split(',') as now.InstrumentId[];

let bad = 0;
for (const id of ids) {
  const info = now.INSTRUMENT_INFO[id];
  const mid = Math.round((info.lo + info.hi) / 2);
  const notes = [info.lo, info.lo + 5, mid - 7, mid, mid, mid + 4, mid + 7, info.hi - 3, info.hi];
  const events: { time: number; event: unknown }[] = [];
  let t = 0.05;
  notes.forEach((m, i) => {
    const dur = i % 3 === 0 ? 0.5 : i % 3 === 1 ? 0.18 : 0.3;
    // (some foreseen, as a file's are; some overlapping the next: a slur; some joined; some apart)
    if (i % 2 === 0) events.push({ time: Math.max(0, t - 0.4), event: { type: 'foresee', midi: m, velocity: 50 + 9 * i, dur } });
    events.push({ time: t, event: { type: 'noteOn', midi: m, velocity: 50 + 9 * i } });
    events.push({ time: t + dur + (i % 4 === 1 ? 0.03 : 0), event: { type: 'noteOff', midi: m } });
    t += dur + (i % 4 === 3 ? 0.12 : 0);
  });
  events.push({ time: 1.0, event: { type: 'control', cc: 131, value: 20 } });
  events.push({ time: 1.6, event: { type: 'bend', value: 0.5 } });
  events.push({ time: 1.9, event: { type: 'bend', value: 0 } });
  events.sort((a, b) => a.time - b.time);
  for (const fs of [44100, 48000])
    for (const dry of [true, false]) {
      const o = { instrument: id, sampleRate: fs, events: events as never, duration: t + 0.6, dry } as never;
      const a = before.renderInstrument(o);
      const b = now.renderInstrument(o);
      let d = 0;
      let pk = 0;
      for (let i = 0; i < a.left.length; i++) {
        d = Math.max(d, Math.abs(a.left[i] - b.left[i]), Math.abs(a.right[i] - b.right[i]));
        pk = Math.max(pk, Math.abs(a.left[i]));
      }
      console.log(`${id} ${fs} ${dry ? 'dry' : 'room'}: ${a.left.length} samples, peak ${pk.toFixed(4)}, largest difference ${d === 0 ? '0 (bit-identical)' : d.toExponential(3)}`);
      if (d !== 0 || a.left.length !== b.left.length || pk === 0) bad++;
    }
}
process.exit(bad ? 1 : 0);
