// The ways a file's notes meet, each asked of every wind and brass instrument alone, and what comes out
// (scripts/winds-midi-measure.ts measures; dry, 48 kHz):
//   npx tsx scripts/winds-midi-bench.ts [--engine <old>/packages/engine/src/core/index.ts] [--only flute,oboe]
//       [--case repeat] [--notes] [--hand] [--bare] [--wav <dir>] [--json out.json] [--vel 80] [--fs 48000]
//   repeat      one pitch six times, each note ending where the next begins (139 ms: Beethoven 5's eighths)
//   repeat-slow the same at 278 ms
//   abut        a scale, each note ending where the next begins (139 ms)
//   slur        the scale with each note held 30 ms into the next (a keyboard's legato)
//   detached    the scale with half of each note a rest
//   restrike    one pitch struck again while it is still held, the first key let go after (a file's overlap of
//               a pitch with itself): the second note must sound to its own end. The file player pairs a
//               file's notes (apps/web/src/file-keys.ts) and so does this; --bare sends the events as written,
//               as the single instrument's player did before
//   swapped     a repeat written with each note-on before the last note's off at the same instant
//   chord       three notes begun together, let go together (top note last in the file)
//   short       three 90 ms notes after rests
// Each at the middle of the instrument, and `repeat`/`abut` at its low and high ends too.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import { INSTRUMENT_INFO, type InstrumentId } from '../packages/engine/src/core/instrument.ts';
import { FileKeys } from '../apps/web/src/file-keys.ts';
import type { TimedEvent } from '../packages/engine/src/core/render.ts';
import { foreseen, pairNotes, WINDS } from './winds-midi-lib.ts';
import { heldLevels, measure, type NoteMeasure } from './winds-midi-measure.ts';

type Render = typeof import('../packages/engine/src/core/index.ts').renderInstrument;
const on = (time: number, midi: number, velocity: number): TimedEvent => ({ time, event: { type: 'noteOn', midi, velocity } });
const off = (time: number, midi: number): TimedEvent => ({ time, event: { type: 'noteOff', midi } });
const SCALE = [0, 2, 4, 5, 7, 5, 4, 2];

export interface BenchCase {
  name: string;
  events: TimedEvent[];
  /** the notes as they should be heard (for the measures), where they differ from the events' own pairing */
  notes?: { t: number; end: number; midi: number; vel: number }[];
  dur: number;
}

export function benchCases(id: InstrumentId, vel = 80): BenchCase[] {
  const { lo, hi } = INSTRUMENT_INFO[id];
  const mid = Math.round((lo + hi) / 2);
  const out: BenchCase[] = [];
  const seq = (name: string, pitches: number[], len: number, hold: number, v = vel) => {
    const ev: TimedEvent[] = [];
    let t = 0.1;
    for (const m of pitches) {
      ev.push(on(t, m, v), off(t + hold, m));
      t += len;
    }
    // (a file's order at one instant: the offs first)
    ev.sort((a, b) => a.time - b.time || ((a.event as { type: string }).type === 'noteOff' ? 0 : 1) - ((b.event as { type: string }).type === 'noteOff' ? 0 : 1));
    out.push({ name, events: ev, dur: t + 1.2 });
  };
  for (const [tag, m] of [['', mid], ['-low', lo + 3], ['-high', hi - 8]] as const) {
    seq(`repeat${tag}`, [m, m, m, m, m, m], 0.139, 0.139);
    seq(`abut${tag}`, SCALE.map((s) => m + s), 0.139, 0.139);
  }
  seq('repeat-slow', [mid, mid, mid, mid], 0.278, 0.278);
  seq('repeat-pp', [mid, mid, mid, mid, mid, mid], 0.139, 0.139, 36);
  seq('repeat-ff', [mid, mid, mid, mid, mid, mid], 0.139, 0.139, 115);
  seq('slur', SCALE.map((s) => mid + s), 0.139, 0.169);
  seq('detached', SCALE.map((s) => mid + s), 0.139, 0.07);
  {
    // restrike: on, on again 0.3 s later, the first off 30 ms after that, the second off at 0.7 s
    const m = mid;
    out.push({
      name: 'restrike',
      events: [on(0.1, m, vel), on(0.4, m, vel), off(0.43, m), off(0.8, m)],
      notes: [
        { t: 0.1, end: 0.4, midi: m, vel },
        { t: 0.4, end: 0.8, midi: m, vel },
      ],
      dur: 2,
    });
  }
  {
    const m = mid;
    const ev: TimedEvent[] = [];
    const notes = [];
    let t = 0.1;
    for (let i = 0; i < 5; i++) {
      // the next note's on comes first at the instant the last one ends
      ev.push(on(t, m, vel));
      if (i > 0) ev.push(off(t, m));
      notes.push({ t, end: t + 0.2, midi: m, vel });
      t += 0.2;
    }
    ev.push(off(t, m));
    out.push({ name: 'swapped', events: ev, notes, dur: t + 1.2 });
  }
  {
    const c = [mid - 3, mid, mid + 4];
    out.push({
      name: 'chord',
      events: [on(0.1, c[0], vel), on(0.1, c[1], vel), on(0.1, c[2], vel), off(0.7, c[0]), off(0.7, c[1]), off(0.7, c[2]), on(0.7, c[0] + 2, vel), on(0.7, c[1] + 2, vel), on(0.7, c[2] + 1, vel), off(1.3, c[0] + 2), off(1.3, c[1] + 2), off(1.3, c[2] + 1)],
      // (the top of each chord is what one player would play)
      notes: [
        { t: 0.1, end: 0.7, midi: c[2], vel },
        { t: 0.7, end: 1.3, midi: c[2] + 1, vel },
      ],
      dur: 2.5,
    });
  }
  {
    const ev: TimedEvent[] = [];
    let t = 0.1;
    for (const m of [mid, mid + 2, mid + 4]) {
      ev.push(on(t, m, vel), off(t + 0.09, m));
      t += 0.4;
    }
    out.push({ name: 'short', events: ev, dur: t + 1 });
  }
  return out;
}

const med = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
  const ONLY = opt('--only')?.split(',');
  const CASE = opt('--case');
  const WAV = opt('--wav');
  const JSON_OUT = opt('--json');
  const VEL = Number(opt('--vel', '80'));
  const FS = Number(opt('--fs', '48000'));
  const NOTES = args.includes('--notes');
  // --hand: nothing foreseen (the notes as a keyboard would send them); else as a file player sends them
  const HAND = args.includes('--hand');
  const BARE = args.includes('--bare');
  /** a file's events as the player sends them: a pitch held twice is let go at its last end */
  const paired = (events: TimedEvent[]): TimedEvent[] => {
    const keys = new FileKeys();
    return events.filter((e) => {
      const ev = e.event as { type: string; midi?: number };
      if (ev.type === 'noteOn') keys.on(ev.midi!);
      else if (ev.type === 'noteOff') return keys.off(ev.midi!);
      return true;
    });
  };
  const render: Render = (await import(pathToFileURL(ENGINE).href)).renderInstrument;
  if (WAV) mkdirSync(WAV, { recursive: true });
  const rows: Record<string, unknown>[] = [];
  for (const id of WINDS) {
    if (ONLY && !ONLY.includes(id)) continue;
    console.log(`\n${id}`);
    console.log('  case'.padEnd(16), 'notes lost  speak(med,max) ms   hole(med,min) dB  hole ms   pure(min)  |cents|(max)  jump×  stuck dB  reach(min,med) dB');
    const held = heldLevels(render, id, FS);
    for (const c of benchCases(id, VEL)) {
      if (CASE && !c.name.startsWith(CASE)) continue;
      const notes = c.notes ?? pairNotes(c.events, c.dur);
      const sent = BARE ? c.events : paired(c.events);
      const r = render({ sampleRate: FS, instrument: id, events: HAND ? sent : [...foreseen(notes), ...sent], duration: c.dur, dry: true });
      const m = measure(r.left, FS, notes, c.events.map((e) => e.time), held);
      if (WAV) writeFileSync(join(WAV, `${id}-${c.name}.wav`), encodeWav({ sampleRate: FS, channels: [r.left, r.right] }));
      const N: NoteMeasure[] = m.notes;
      const later = N.slice(1);
      const speak = N.map((n) => n.speak);
      const holes = later.filter((n) => n.join !== 'rest').map((n) => n.holeDb);
      const holeMs = later.filter((n) => n.join !== 'rest').map((n) => n.holeMs);
      const row = {
        instrument: id,
        case: c.name,
        notes: N.length,
        lost: N.filter((n) => n.lost).length,
        speakMed: med(speak),
        speakMax: Math.max(...speak),
        holeMed: med(holes),
        holeMin: holes.length ? Math.min(...holes) : NaN,
        holeMs: med(holeMs),
        pureMin: Math.min(...N.map((n) => n.pure)),
        centsMax: Math.max(...N.map((n) => Math.abs(n.cents)).filter(Number.isFinite)),
        jump: m.jump,
        stuckDb: m.stuckDb,
        reachMin: Math.min(...N.map((n) => n.reach)),
        reachMed: med(N.map((n) => n.reach)),
      };
      rows.push(row);
      const f = (v: number, w = 6) => (Number.isFinite(v) ? `${+v.toFixed(1)}` : '–').padStart(w);
      console.log(`  ${c.name.padEnd(14)}${f(row.notes, 5)}${f(row.lost, 5)}  ${f(row.speakMed)}${f(row.speakMax)}       ${f(row.holeMed)}${f(row.holeMin)}      ${f(row.holeMs)}    ${f(row.pureMin)}      ${f(row.centsMax)}     ${f(row.jump)}  ${f(row.stuckDb, 7)}   ${f(row.reachMin)}${f(row.reachMed)}`);
      if (NOTES)
        for (const n of N)
          console.log(`      ${n.t.toFixed(3)} ${n.midi} ${(n.dur * 1000).toFixed(0).padStart(4)} ms ${n.join.padEnd(7)}${n.same ? '=' : ' '} speak ${`${n.speak}`.padStart(6)} hole ${`${n.holeDb}`.padStart(5)} dB ${`${n.holeMs}`.padStart(5)} ms pure ${n.pure.toFixed(2)} cents ${`${n.cents}`.padStart(6)} level ${`${n.levelDb}`.padStart(6)} reach ${`${n.reach}`.padStart(6)}${n.lost ? ' LOST' : ''}`);
    }
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
}
