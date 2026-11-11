// Every note of each wind and brass instrument begun from silence as a file's note (its length foreseen),
// at five strengths and five lengths: does it speak, at its pitch, on its own register?
//   npx tsx scripts/winds-midi-fresh.ts [--engine <old>/packages/engine/src/core/index.ts] [--only flute,horn]
//       [--hand] [--list] [--json out.json]
// A note fails if under 70 % of its level is at its own pitch (winds-midi-measure.ts `pure`), if it sounds
// on another bore mode (`mode`), or if it stays more than 12 dB under the same note held (`reach`). Printed
// per instrument: failures by length, the notes' median and worst reach and median time to speak.
// --hand: nothing foreseen (a key in the hand: the long tone's attack). --list: each failure.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { INSTRUMENT_INFO } from '../packages/engine/src/core/instrument.ts';
import { WINDS } from './winds-midi-lib.ts';
import { heldLevels, measure } from './winds-midi-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
const ONLY = opt('--only')?.split(',');
const HAND = args.includes('--hand');
const LIST = args.includes('--list');
const JSON_OUT = opt('--json');
const FS = 48000;
const VELS = [36, 60, 84, 108, 124];
const LENS = [0.139, 0.278, 0.45, 0.7, 1.0];
const render: typeof import('../packages/engine/src/core/index.ts').renderInstrument = (await import(pathToFileURL(ENGINE).href)).renderInstrument;
const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
const out: Record<string, unknown>[] = [];
for (const id of WINDS) {
  if (ONLY && !ONLY.includes(id)) continue;
  const { lo, hi } = INSTRUMENT_INFO[id];
  const held = heldLevels(render, id, FS);
  const rows: string[] = [];
  let bad = 0;
  let all = 0;
  for (const len of LENS) {
    const reach: number[] = [];
    const speak: number[] = [];
    let n = 0;
    const fails: string[] = [];
    for (const vel of VELS)
      for (let m = lo; m <= hi; m++) {
        const ev = [
          ...(HAND ? [] : [{ time: 0.1, event: { type: 'foresee', midi: m, velocity: vel, dur: len } as never }]),
          { time: 0.1, event: { type: 'noteOn', midi: m, velocity: vel } as never },
          { time: 0.1 + len, event: { type: 'noteOff', midi: m } as never },
        ];
        const r = render({ sampleRate: FS, instrument: id, events: ev, duration: len + 0.5, dry: true });
        const x = measure(r.left, FS, [{ t: 0.1, end: 0.1 + len, midi: m, vel }], [0.1], held).notes[0];
        reach.push(x.reach);
        speak.push(x.speak);
        all++;
        if (x.pure < 0.7 || x.mode !== 1 || x.reach < -12) {
          n++;
          fails.push(`${m}v${vel}(${x.mode !== 1 ? `mode ${x.mode}` : x.pure < 0.7 ? `pure ${x.pure.toFixed(2)}` : `reach ${x.reach}`})`);
        }
      }
    bad += n;
    rows.push(`  ${(len * 1000).toFixed(0).padStart(5)} ms: ${`${n}`.padStart(3)} of ${reach.length} fail; reach median ${med(reach).toFixed(1)} dB, worst ${Math.min(...reach).toFixed(1)}; speaks in ${med(speak).toFixed(0)} ms (median), ${Math.max(...speak).toFixed(0)} at most${LIST && fails.length ? `\n      ${fails.join(' ')}` : ''}`);
    out.push({ instrument: id, len, fail: n, of: reach.length, reachMed: med(reach), reachMin: Math.min(...reach), speakMed: med(speak) });
  }
  console.log(`${id}: ${bad} of ${all} notes fail\n${rows.join('\n')}`);
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
