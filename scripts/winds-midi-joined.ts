// Notes joined to the last, across each wind and brass instrument's compass: every pitch repeated twice with
// no rest, and reached by step from below and left by step (each note ending where the next begins), at three
// dynamics, told ahead as a file's notes are. How many of the joined notes fail: stay 12 dB under the same
// note held, have under 70 % of their level at their own pitch, or speak on another register
// (scripts/winds-midi-measure.ts). With --seq, given sequences instead ('[[91,84,84],[88,81,81]]', or `falls` /
// `rises`: the flute across its register breaks), and --over <s> holds each note into the next (a slur).
//   npx tsx scripts/winds-midi-joined.ts [--only oboe,bassoon] [--engine <old>/packages/engine/src/core/index.ts]
//       [--len 0.278] [--vel 66,90,112] [--seq falls|rises|'[[…]]'] [--over 0.03] [--list]
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { INSTRUMENT_INFO } from '../packages/engine/src/core/instrument.ts';
import type { TimedEvent } from '../packages/engine/src/core/render.ts';
import { foreseen, pairNotes, WINDS } from './winds-midi-lib.ts';
import { heldLevels, measure } from './winds-midi-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
const ONLY = opt('--only')?.split(',');
const LENS = opt('--len', '0.278')!.split(',').map(Number);
const VELS = opt('--vel', '66,90,112')!.split(',').map(Number);
/** the flute across its register breaks (flute.ts fluteFingering: the octave from D5, the twelfth from D6): falls, rises */
const SETS: Record<string, number[][]> = {
  falls: [[86, 84, 84], [88, 85, 85], [91, 84, 84], [88, 81, 81], [74, 72, 72], [76, 73, 73], [79, 67, 67], [88, 72, 72], [93, 79, 79], [86, 79, 79], [90, 83, 83]],
  rises: [[84, 86, 86], [85, 88, 88], [83, 86, 86], [81, 88, 88], [79, 91, 91], [72, 74, 74], [73, 76, 76], [70, 77, 77], [67, 79, 79], [72, 88, 88]],
};
const SEQ: number[][] | null = opt('--seq') ? (SETS[opt('--seq')!] ?? JSON.parse(opt('--seq')!)) : null;
const OVER = Number(opt('--over', '0'));
const LIST = args.includes('--list');
const render: typeof import('../packages/engine/src/core/index.ts').renderInstrument = (await import(pathToFileURL(ENGINE).href)).renderInstrument;
const FS = 48000;
for (const id of WINDS) {
  if (ONLY ? !ONLY.includes(id) : SEQ && id !== 'flute') continue;
  const { lo, hi } = INSTRUMENT_INFO[id];
  const held = heldLevels(render, id, FS);
  const seqs: number[][] = SEQ ?? [];
  if (!SEQ) for (let m = lo + 2; m <= hi - 1; m++) seqs.push([m, m, m], [m - 2, m, m + 1]);
  let bad = 0;
  let all = 0;
  const fails: string[] = [];
  for (const len of LENS)
    for (const vel of VELS)
      for (const seq of seqs) {
        const ev: TimedEvent[] = [];
        let t = 0.1;
        for (const p of seq) {
          ev.push({ time: t, event: { type: 'noteOn', midi: p, velocity: vel } }, { time: t + len + OVER, event: { type: 'noteOff', midi: p } });
          t += len;
        }
        // (a file's order at one instant: the ends first)
        ev.sort((a, b) => a.time - b.time || (a.event.type === 'noteOff' ? 0 : 1) - (b.event.type === 'noteOff' ? 0 : 1));
        const notes = pairNotes(ev, t + 1);
        const r = render({ sampleRate: FS, instrument: id, events: [...foreseen(notes), ...ev], duration: t + 0.4, dry: true });
        const m = measure(r.left, FS, notes, ev.map((e) => e.time), held);
        m.notes.slice(1).forEach((n) => {
          all++;
          if (n.mode !== 1 || n.pure < 0.7 || n.reach < -12) {
            bad++;
            fails.push(`${seq.join('-')}:${n.midi} v${vel} ${Math.round(len * 1000)} ms (${n.mode !== 1 ? `mode ${n.mode}` : n.pure < 0.7 ? `pure ${n.pure.toFixed(2)}` : `reach ${n.reach}`})`);
          }
        });
      }
  console.log(`${id}: ${bad} of ${all} joined notes fail${LIST && fails.length ? `\n  ${fails.join('\n  ')}` : ''}`);
}
