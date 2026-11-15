// What the automatic expression's clock (apps/web/src/expression.ts TEMPO) does to each bundled piece and
// instrument's own piece: is it typed at one tempo (so played in a player's time), how much longer it
// plays, its breaths, the speed's range over each phrase, how far each onset moves from where it was
// written, and the final ritardando. With --beats, a piece's speed beat by beat (written beats per
// played second over the written tempo).
//   npx tsx scripts/expression-tempo.ts [--only chopin] [--beats] [--file x.mid]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { express, tempoClock, typedAtOneTempo, TEMPO } from '../apps/web/src/expression.ts';
import { parseMidi, type MidiSong } from '../apps/web/src/midi-file.ts';
import { DEMOS, demoSong, PIECES, pieceSong } from '../apps/web/src/orchestra/pieces.ts';

const args = process.argv.slice(2);
const opt = (k: string, d = '') => {
  const i = args.indexOf(k);
  return i < 0 ? d : (args[i + 1] ?? d);
};
const ONLY = opt('--only');
const BEATS = args.includes('--beats');
const FILE = opt('--file');
const DIR = 'apps/web/public/pieces';
const read = (f: string) => {
  const b = readFileSync(f);
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

const songs: { name: string; song: MidiSong }[] = [];
if (FILE) songs.push({ name: FILE, song: read(FILE) });
else {
  for (const p of PIECES) if (!p.generate) songs.push({ name: p.id, song: pieceSong(read(join(DIR, p.file)), p) });
  for (const [id, d] of Object.entries(DEMOS)) if (d) songs.push({ name: `${id} (own piece)`, song: demoSong(read(join(DIR, d.file)), d) });
}

const pct = (x: number) => `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)} %`;
console.log(`TEMPO ${JSON.stringify(TEMPO)}\n`);
console.log('piece                              typed  quarter  written  played   longer  breaths (s)       speed over phrases  onsets moved (ms)   last bar');
for (const { name, song } of songs) {
  if (ONLY && !name.includes(ONLY)) continue;
  const typed = typedAtOneTempo(song);
  const c = tempoClock(song);
  const x = express(song);
  if (!c) {
    console.log(`${name.padEnd(34)} ${typed ? 'yes' : 'no '}    ${song.quarter ? song.quarter.toFixed(3) : '  –  '}  ${song.duration.toFixed(1).padStart(7)}  (its own time)${x.timed ? ', lines TIMING' : ''}`);
    continue;
  }
  // the speed: written seconds per played second, on 0.25 s of written time
  const speeds: number[] = [];
  for (let t = 0; t + 0.25 < song.duration; t += 0.25) speeds.push(0.25 / (c.on(t + 0.25) - c.on(t)));
  const sorted = [...speeds].sort((a, b) => a - b);
  const p5 = sorted[Math.floor(0.05 * sorted.length)];
  const p95 = sorted[Math.floor(0.95 * sorted.length)];
  // onsets' moves from a straight line through the clock (the drift the breaths and the ritardando add taken out)
  const ons = [...new Set(song.events.filter((e) => e.kind === 'on').map((e) => e.t))].sort((a, b) => a - b);
  const k = (c.on(ons[ons.length - 1]) - c.on(ons[0])) / Math.max(1e-9, ons[ons.length - 1] - ons[0]);
  const dev = ons.map((t) => (c.on(t) - c.on(ons[0]) - k * (t - ons[0])) * 1000);
  const local = ons.slice(1).map((t, i) => {
    // each onset against its neighbours: the note-to-note unevenness (ms)
    const a = ons[i];
    const b = ons[i + 2];
    if (b === undefined) return 0;
    const pred = c.on(a) + ((c.on(b) - c.on(a)) * (t - a)) / (b - a);
    return (c.on(t) - pred) * 1000;
  });
  const sd = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / Math.max(1, v.length) - (v.reduce((s, x) => s + x, 0) / Math.max(1, v.length)) ** 2);
  // breaths: the played clock's jumps (an onset later than the note-offs at the same written time)
  let breaths = 0;
  let breathS = 0;
  for (const t of ons) {
    const d = c.on(t) - c.off(t);
    if (d > 1e-4) {
      breaths++;
      breathS += d;
    }
  }
  // the last bar: its speed over the tempo before the ritardando
  const bars = song.bars ?? [];
  const lastOn = ons[ons.length - 1];
  const lb = bars.filter((b) => b <= lastOn + 1e-6);
  const b1 = lb[lb.length - 1] ?? lastOn - 2;
  const b0 = lb[lb.length - 2] ?? b1 - 2;
  const lastSpeed = (b1 - b0) / Math.max(1e-9, c.on(b1) - c.on(b0));
  console.log(
    `${name.padEnd(34)} yes    ${song.quarter!.toFixed(3)}  ${song.duration.toFixed(1).padStart(7)}  ${c.duration.toFixed(1).padStart(7)}  ${pct(c.duration / song.duration - 1).padStart(7)}  ${String(breaths).padStart(3)} (${breathS.toFixed(2).padStart(5)})  ${pct(p5 - 1).padStart(7)} … ${pct(p95 - 1).padStart(7)}  ${sd(dev).toFixed(0).padStart(5)} drift, ${sd(local).toFixed(1).padStart(4)} note  ${pct(lastSpeed - 1).padStart(8)}`,
  );
  if (BEATS && song.quarter) {
    const q = song.quarter;
    const line: string[] = [];
    for (let t = 0; t + q <= song.duration + 1e-9; t += q) line.push((q / (c.on(t + q) - c.on(t))).toFixed(2));
    console.log(`  speed per beat: ${line.join(' ')}`);
  }
}
