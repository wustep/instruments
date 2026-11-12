// Every instrument's loudness as played (its room, its limiter, and what it is played over its calibration:
// the engines' own, PLAYBACK_DB), over a walk through the middle of its compass at mezzo-forte and fortissimo: where each
// stands beside the others in a full ensemble. Notes of 0.45 s, 0.5 s apart (the struck and plucked ones
// ring on).  npx tsx scripts/levels-table.ts [--engine <core/index.ts>] [--only harp,tuba]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { lufs, peakDb } from './audio-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const E = (await import(opt('--engine') ? pathToFileURL(resolve(opt('--engine')!)).href : '../packages/engine/src/core/index.ts')) as typeof import('../packages/engine/src/core/index.ts');
const FS = 48000;
const only = opt('--only')?.split(',');
const rows: string[] = [];
for (const id of E.INSTRUMENT_IDS) {
  if (only && !only.includes(id)) continue;
  const info = E.INSTRUMENT_INFO[id];
  // the middle two octaves of its compass (the piano's and the harp's: C3–C5)
  const mid = id === 'piano' || id === 'harp' ? 60 : Math.round((info.lo + info.hi) / 2);
  const lo = Math.max(info.lo, mid - 12);
  const hi = Math.min(info.hi, mid + 12);
  const cell: string[] = [];
  for (const vel of [75, 110]) {
    const ev: { time: number; event: never }[] = [];
    let t = 0.2;
    for (let m = lo; m <= hi; m += 2) {
      ev.push({ time: t, event: { type: 'noteOn', midi: m, velocity: vel } as never }, { time: t + 0.45, event: { type: 'noteOff', midi: m } as never });
      t += 0.5;
    }
    const out = E.renderInstrument({ sampleRate: FS, instrument: id, events: ev, duration: t + 1 });
    cell.push(`${lufs(out.left, out.right, FS).toFixed(1).padStart(6)} LUFS (peak ${peakDb(out.left, out.right).toFixed(1).padStart(5)})`);
  }
  rows.push(`${id.padEnd(13)} ${String(lo).padStart(3)}–${String(hi).padEnd(3)}  mf ${cell[0]}   ff ${cell[1]}`);
}
console.log(rows.join('\n'));
