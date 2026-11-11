// The bundled pieces' flute parts played by several players (each its own noise and intonation: the engine's
// `player`), note by note with scripts/winds-midi-measure.ts: how many notes are lost (12 dB under the same
// note held, or under a third of the level at its pitch), impure (under 70 % at its pitch) or on another
// register, and how soon joined notes speak. A note that grows from a small ring depends on the noise it
// meets: one performance says little about one note, several say how often.
//   npx tsx scripts/flute-parts.ts [--engine <old>/packages/engine/src/core/index.ts] [--players 4] [--seconds 60] [--part <text>]
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { foreseen, windParts } from './winds-midi-lib.ts';
import { busiest, excerpt, heldLevels, measure } from './winds-midi-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
const PLAYERS = Number(opt('--players', '4'));
const SECONDS = Number(opt('--seconds', '60'));
const PART = opt('--part', '')!;
const render: typeof import('../packages/engine/src/core/index.ts').renderInstrument = (await import(pathToFileURL(ENGINE).href)).renderInstrument;
const FS = 48000;
const p90 = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(0.9 * v.length))] : NaN);
const tot = { notes: 0, lost: 0, impure: 0, mode: 0 };
console.log(`engine ${ENGINE}: ${PLAYERS} players, each part's busiest ${SECONDS} s`);
for (const part of windParts().filter((p) => p.instrument === 'flute' && p.name.includes(PART))) {
  const ex = excerpt(part, busiest(part.notes, SECONDS, part.duration), SECONDS);
  const lost: number[] = [];
  const impure: number[] = [];
  const mode: number[] = [];
  const speak: number[] = [];
  for (let k = 0; k < PLAYERS; k++) {
    const r = render({ sampleRate: FS, instrument: 'flute', events: [...foreseen(ex.notes), ...ex.events], duration: ex.dur, dry: true, player: k });
    const m = measure(r.left, FS, ex.notes, ex.events.map((e) => e.time), heldLevels(render, 'flute', FS, k));
    lost.push(m.notes.filter((n) => n.lost).length);
    impure.push(m.notes.filter((n) => n.pure < 0.7).length);
    mode.push(m.notes.filter((n) => n.mode !== 1).length);
    speak.push(p90(m.notes.filter((n) => n.join !== 'first' && n.join !== 'rest' && !n.same).map((n) => n.speak)));
  }
  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
  tot.notes += ex.notes.length * PLAYERS;
  tot.lost += sum(lost);
  tot.impure += sum(impure);
  tot.mode += sum(mode);
  console.log(`${part.name.padEnd(22)} ${`${ex.notes.length}`.padStart(4)} notes | lost ${lost.join(' ')} | impure ${impure.join(' ')} | another register ${mode.join(' ')} | joined notes speak in, p90 ms ${speak.join(' ')}`);
}
console.log(`all: ${tot.notes} notes played | lost ${tot.lost} | impure ${tot.impure} | another register ${tot.mode}`);
