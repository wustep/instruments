// Is a note alone, begun from silence, sample for sample what another checkout's engine renders? For a change
// to how notes are joined that must leave the single note (what the voicing was fitted on and is judged by)
// as it was:
//   npx tsx scripts/winds-alone-same.ts --before <old>/packages/engine/src/core/index.ts [--instrument flute,oboe,clarinet,bassoon]
//       [--fs 44100,48000] [--params '{"human":0}']
// Every third note of the compass at three dynamics, held 0.7 s and let go, as a key in the hand sends it
// (nothing told ahead: the long tone the recordings were fitted on and the judge hears), dry and through the
// room. Prints the largest difference; exits 1 when there is one. The same notes told ahead as a file tells
// them (a long one and a short one) are compared too and only reported: a file's note may be played
// otherwise (the flute's vent, flute.ts VENT).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as now from '../packages/engine/src/core/index.ts';

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const before = (await import(pathToFileURL(resolve(arg('--before')!)).href)) as typeof now;
const ids = (arg('--instrument') ?? 'flute,oboe,clarinet,bassoon').split(',') as now.InstrumentId[];
const rates = (arg('--fs') ?? '44100,48000').split(',').map(Number);
const params = arg('--params') ? (JSON.parse(arg('--params')!) as Record<string, unknown>) : undefined;

let bad = 0;
for (const id of ids) {
  const { lo, hi } = now.INSTRUMENT_INFO[id];
  for (const fs of rates) {
    let worst = 0;
    let n = 0;
    let silent = 0;
    let toldN = 0;
    let toldDiff = 0;
    for (let m = lo; m <= hi; m += 3)
      for (const vel of [36, 80, 118])
        for (const [len, told] of [[0.7, false], [0.7, true], [0.14, true]] as [number, boolean][])
          for (const dry of [true, false]) {
            if (!dry && (vel !== 80 || told)) continue;
            const events = [
              ...(told ? [{ time: 0.05, event: { type: 'foresee', midi: m, velocity: vel, dur: len } }] : []),
              { time: 0.05, event: { type: 'noteOn', midi: m, velocity: vel } },
              { time: 0.05 + len, event: { type: 'noteOff', midi: m } },
            ];
            const o = { instrument: id, sampleRate: fs, events: events as never, duration: len + 0.5, dry } as never;
            // (the old engine knows nothing of a parameter added since: it is given none)
            const a = before.renderInstrument(o);
            const b = now.renderInstrument(params ? ({ ...(o as object), params } as never) : o);
            let d = 0;
            let pk = 0;
            for (let i = 0; i < a.left.length; i++) {
              d = Math.max(d, Math.abs(a.left[i] - b.left[i]), Math.abs(a.right[i] - b.right[i]));
              pk = Math.max(pk, Math.abs(a.left[i]));
            }
            if (told) {
              toldN++;
              if (d !== 0) toldDiff++;
              continue;
            }
            worst = Math.max(worst, d);
            if (pk === 0) silent++;
            n++;
          }
    console.log(`${id} ${fs}: ${n} notes alone by hand, largest difference ${worst === 0 ? '0 (bit-identical)' : worst.toExponential(3)}${silent ? `, ${silent} silent` : ''}; told ahead: ${toldDiff} of ${toldN} differ`);
    if (worst !== 0) bad++;
  }
}
process.exit(bad ? 1 : 0);
