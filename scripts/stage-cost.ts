// What each instrument of the Orchestra costs the audio thread: one engine core per voice, offline on one
// core, playing its own piece (orchestra/pieces.ts DEMOS: notes, chords and rests as it would in a piece)
// and idle, as a share of real time at 48 kHz. The busier of the two is what a seat costs
// (orchestra/assign.ts VOICE_COST). Then the lineups: the heaviest the stage allowed by count (eight on a
// computer with two grands, six on a phone) and the pieces'.
//   npx tsx scripts/stage-cost.ts [--seconds 20] [--repeat 3]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderInstrument, type TimedEvent } from '../packages/engine/src/core/render.ts';
import { parseMidi } from '../apps/web/src/midi-file.ts';
import { lineupCost, VOICE_COST, VOICE_INFO, VOICES, type Voice } from '../apps/web/src/orchestra/assign.ts';
import { DEMOS, demoSong, PIECES } from '../apps/web/src/orchestra/pieces.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = args.indexOf(k);
  return i < 0 ? d : args[i + 1];
};
const SECONDS = Number(opt('--seconds', '20'));
const REPEAT = Number(opt('--repeat', '3'));
const FS = 48000;

/** the voice's piece as timed events (a piano's pedal too) */
function eventsOf(v: Voice): TimedEvent[] {
  const inst = VOICE_INFO[v].instrument;
  const d = DEMOS[inst];
  const b = readFileSync(join('apps/web/public/pieces', d.file));
  const song = demoSong(parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer), d);
  const out: TimedEvent[] = [];
  // (played round again until the time is full)
  const len = Math.max(1, song.duration + 0.5);
  for (let rep = 0; rep * len < SECONDS; rep++)
    for (const e of song.events) {
      const time = e.t + rep * len + 0.05;
      if (time > SECONDS) break;
      if (e.kind === 'on') out.push({ time, event: { type: 'noteOn', midi: e.midi, velocity: e.vel } });
      else if (e.kind === 'off') out.push({ time, event: { type: 'noteOff', midi: e.midi } });
      else if (e.kind === 'pedal' && e.cc === 64) out.push({ time, event: { type: 'sustain', value: e.value } });
    }
  return out;
}

/** per cent of real time, the least of REPEAT runs (the others met a busy machine) */
function cost(v: Voice, events: TimedEvent[], maxVoices?: number): number {
  const info = VOICE_INFO[v];
  let best = Infinity;
  for (let i = 0; i < REPEAT; i++) {
    const r = renderInstrument({ sampleRate: FS, instrument: info.instrument, preset: info.preset, events, duration: SECONDS, maxVoices });
    best = Math.min(best, r.cpuMs / SECONDS / 10);
  }
  return best;
}

console.log(`each voice, ${SECONDS} s at ${FS} Hz, one core (the least of ${REPEAT} runs), per cent of real time:`);
console.log('voice      playing   idle   VOICE_COST');
for (const v of VOICES) {
  const piano = VOICE_INFO[v].instrument === 'piano';
  const play = cost(v, eventsOf(v), piano ? 48 : undefined);
  const idle = cost(v, [], piano ? 48 : undefined);
  const extra = piano ? `   (32 voices ${cost(v, eventsOf(v), 32).toFixed(1)}, 24 voices ${cost(v, eventsOf(v), 24).toFixed(1)})` : '';
  console.log(`${v.padEnd(9)} ${play.toFixed(2).padStart(7)} ${idle.toFixed(2).padStart(6)} ${String(VOICE_COST[v]).padStart(8)}${extra}`);
}
const show = (name: string, lineup: Voice[]) => console.log(`${name.padEnd(46)} ${String(lineup.length).padStart(2)} seats  ${lineupCost(lineup).toFixed(1).padStart(5)}`);
console.log('\nlineups (VOICE_COST summed):');
show('two grands and six double basses (a computer, 8)', ['grand', 'grand', 'bass', 'bass', 'bass', 'bass', 'bass', 'bass']);
show('two grands and four double basses (a phone, 6)', ['grand', 'grand', 'bass', 'bass', 'bass', 'bass']);
for (const p of PIECES) show(`${p.composer}, ${p.title}`, p.parts.map((q) => q.voice));
