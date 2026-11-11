// A wind or brass part played by several players, each with its own noise (the engine's `player`): how many
// of its notes speak on another register (scripts/winds-midi-measure.ts `mode`: the note's own harmonics
// that are not its octave's, twelfth's or double octave's hold under 1 % of its power). On a bore with two
// stable regimes (the bassoon's, the oboe's) the start decides, by the reed's noise: one performance says
// little, ten say how often.
//   npx tsx scripts/winds-midi-players.ts <part> [--players 6] [--engine <old>/packages/engine/src/core/index.ts] [file.mid]
// <part>: text of a part's name as scripts/winds-midi-measure.ts prints it ("beethoven5-i bassoon 1"; with a
// file, "bassoon"). The whole part is played.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { foreseen, windParts } from './winds-midi-lib.ts';
import { excerpt, modeOf } from './winds-midi-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => {
  const i = args.indexOf(k);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
const PLAYERS = Number(opt('--players', '6'));
const [which, file] = args;
const part = windParts(file ? [file] : undefined).find((x) => x.name.includes(which));
if (!part) throw new Error(`no part named ${which}`);
const render: typeof import('../packages/engine/src/core/index.ts').renderInstrument = (await import(pathToFileURL(ENGINE).href)).renderInstrument;
const FS = 48000;
const ex = excerpt(part, 0, part.duration);
const counts: number[] = [];
const by = new Map<number, number>();
for (let k = 0; k < PLAYERS; k++) {
  const r = render({ sampleRate: FS, instrument: part.instrument, events: [...foreseen(ex.notes), ...ex.events], duration: ex.dur, dry: true, player: k });
  let n = 0;
  ex.notes.forEach((note, i) => {
    const f0 = 440 * 2 ** ((note.midi - 69) / 12);
    const a = Math.round(note.t * FS);
    const next = ex.notes[i + 1];
    const stop = next && next.t < note.end ? Math.round(next.t * FS) : Math.round(note.end * FS);
    if (modeOf(r.left, FS, f0, Math.round(a + 0.4 * (stop - a)), Math.round(a + 0.9 * (stop - a))) !== 1) {
      n++;
      by.set(note.midi, (by.get(note.midi) ?? 0) + 1);
    }
  });
  counts.push(n);
}
console.log(`${part.name}: ${ex.notes.length} notes, ${PLAYERS} players: on another register ${counts.join(' ')} (mean ${(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1)}); by pitch ${[...by].sort((a, b) => a[0] - b[0]).map(([m, c]) => `${m}: ${c}`).join(', ')}`);
