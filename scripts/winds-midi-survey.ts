// What a MIDI file asks of a one-note instrument: for every wind and brass part of the bundled pieces
// (as the Orchestra routes them, and each instrument's own piece), how its consecutive notes meet.
//   npx tsx scripts/winds-midi-survey.ts [file.mid ...]
// Per part: its notes; how many begin exactly where the last one ends (abutting: gap 0), how many
// begin before the last has ended (overlap, with the overlaps' lengths), how many after a short gap
// (< 30 ms), a longer one; repeats of the same pitch among each; notes begun while another of the same
// part is already sounding for more than 40 ms (a chord asked of one player); the shortest notes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { windParts } from './winds-midi-lib.ts';

const files = process.argv.slice(2);
const parts = windParts(files.length ? files : undefined);
const pct = (a: number, n: number) => `${a}`.padStart(5) + ` (${((100 * a) / Math.max(1, n)).toFixed(0).padStart(3)} %)`;
console.log('part'.padEnd(34), 'notes  abut          overlap       gap<30ms      gap≥30ms     same-pitch  chord   shortest  overlap ms (median, max)');
for (const p of parts) {
  const notes = p.notes;
  let abut = 0;
  let over = 0;
  let small = 0;
  let big = 0;
  let same = 0;
  let chord = 0;
  const overs: number[] = [];
  let shortest = Infinity;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    shortest = Math.min(shortest, n.end - n.t);
    if (i === 0) continue;
    const prev = notes[i - 1];
    const gap = n.t - prev.end;
    if (n.t - prev.t < 1e-6 || -gap > 0.04) chord++;
    if (Math.abs(gap) < 1e-6) abut++;
    else if (gap < 0) {
      over++;
      overs.push(-gap * 1000);
    } else if (gap < 0.03) small++;
    else big++;
    if (n.midi === prev.midi && gap < 0.03) same++;
  }
  overs.sort((a, b) => a - b);
  const N = notes.length - 1;
  console.log(
    p.name.padEnd(34),
    `${notes.length}`.padStart(5),
    pct(abut, N),
    pct(over, N),
    pct(small, N),
    pct(big, N),
    `${same}`.padStart(6),
    `${chord}`.padStart(6),
    `${(shortest * 1000).toFixed(0)} ms`.padStart(9),
    overs.length ? `  ${overs[overs.length >> 1].toFixed(1)}, ${overs[overs.length - 1].toFixed(1)}` : '',
  );
}
void readFileSync;
void join;
