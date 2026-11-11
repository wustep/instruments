// The trumpet's notes tongued over the breath as a file plays them (a pitch repeated, a note begun where the
// last ends), across its compass: how soon after its beat each is back at its level, and the hole the
// stroke leaves. Dry, 48 kHz, the notes told ahead as the file player tells them (scripts/winds-midi-lib.ts).
//   npx tsx scripts/trumpet-retongue.ts [--engine <old>/packages/engine/src/core/index.ts] [--from 52] [--to 86]
//       [--vel 56,100] [--len 0.25,0.15,0.125,0.107] [--kinds repeated,step,up,down] [--notes] [--json out.json]
// Per pitch, strength and note length (eighths at 120: 250 ms; sixteenths at 100, 120, 140: 150, 125, 107 ms):
//   repeated  the pitch six times with no rest; of the five struck again, the median
//   step      the pitch alternating with the whole tone above (m+2 m m+2 m m+2 m): the three notes on m
//   up        … with the fourth below (m−5 m …: a bugle's leap up, where the compass has it)
//   down      … with the fifth above (m+7 m …)
// and for each (scripts/winds-midi-measure.ts):
//   speak   ms from the note's beat until its own harmonics are within 6 dB of the level it settles to
//   hole    how far the level falls under the softer of the two notes (dB), and for how long it stays more
//           than 6 dB under it (ms)
//   reach   the note's level against the same note held alone (dB)
// Then the same by register (E3–C4, C♯4–C5, C♯5 up): medians and the worst.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { InstrumentId } from '../packages/engine/src/core/instrument.ts';
import type { TimedEvent } from '../packages/engine/src/core/render.ts';
import { foreseen, pairNotes } from './winds-midi-lib.ts';
import { heldLevels, measure, type NoteMeasure } from './winds-midi-measure.ts';

type Render = typeof import('../packages/engine/src/core/index.ts').renderInstrument;
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m: number): string => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
const med = (a: number[]): number => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

export type Kind = 'repeated' | 'step' | 'up' | 'down';
export const KINDS: Kind[] = ['repeated', 'step', 'up', 'down'];
export interface RetongueRow {
  midi: number;
  vel: number;
  len: number;
  kind: Kind;
  /** medians over the measured notes, and the worst */
  speak: number;
  speakMax: number;
  holeDb: number;
  holeMs: number;
  holeMsMax: number;
  reach: number;
  lost: number;
  of: number;
}

/** one pitch's repeated and joined notes at one strength and length */
export function retongue(render: Render, id: InstrumentId, midi: number, vel: number, len: number, held: (m: number, v: number) => number, kinds: Kind[] = KINDS, lo = 52, hi = 86, fs = 48000): { rows: RetongueRow[]; notes: NoteMeasure[][] } {
  const other: Record<Kind, number> = { repeated: midi, step: midi + 2, up: midi - 5, down: midi + 7 };
  const seqs: [Kind, number[]][] = kinds.filter((k) => other[k] >= lo && other[k] <= hi).map((k) => [k, [other[k], midi, other[k], midi, other[k], midi]]);
  const rows: RetongueRow[] = [];
  const all: NoteMeasure[][] = [];
  for (const [kind, seq] of seqs) {
    const ev: TimedEvent[] = [];
    let t = 0.1;
    for (const p of seq) {
      ev.push({ time: t, event: { type: 'noteOn', midi: p, velocity: vel } }, { time: t + len, event: { type: 'noteOff', midi: p } });
      t += len;
    }
    // (a file's order at one instant: the ends first)
    ev.sort((a, b) => a.time - b.time || (a.event.type === 'noteOff' ? 0 : 1) - (b.event.type === 'noteOff' ? 0 : 1));
    const notes = pairNotes(ev, t + 1);
    const r = render({ sampleRate: fs, instrument: id, events: [...foreseen(notes), ...ev], duration: t + 0.4, dry: true });
    const m = measure(r.left, fs, notes, ev.map((e) => e.time), held);
    const N = m.notes.slice(1).filter((n) => n.midi === midi);
    all.push(m.notes);
    rows.push({
      midi,
      vel,
      len,
      kind,
      speak: med(N.map((n) => n.speak)),
      speakMax: Math.max(...N.map((n) => n.speak)),
      holeDb: med(N.map((n) => n.holeDb)),
      holeMs: med(N.map((n) => n.holeMs)),
      holeMsMax: Math.max(...N.map((n) => n.holeMs)),
      reach: med(N.map((n) => n.reach)),
      lost: N.filter((n) => n.lost).length,
      of: N.length,
    });
  }
  return { rows, notes: all };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
  const ID = opt('--instrument', 'trumpet') as InstrumentId;
  const FROM = Number(opt('--from', '52'));
  const TO = Number(opt('--to', '84'));
  const VELS = opt('--vel', '56,100')!.split(',').map(Number);
  const LENS = opt('--len', '0.25,0.15,0.125,0.107')!.split(',').map(Number);
  const NOTES = args.includes('--notes');
  const JSON_OUT = opt('--json');
  const USE = (opt('--kinds')?.split(',') as Kind[] | undefined) ?? KINDS;
  const render: Render = (await import(pathToFileURL(ENGINE).href)).renderInstrument;
  const held = heldLevels(render, ID, 48000);
  const rows: RetongueRow[] = [];
  const f = (v: number, w = 5) => (Number.isFinite(v) ? `${+v.toFixed(1)}` : '–').padStart(w);
  console.log(`${ID}: tongued over the breath (speak ms / hole ms, median of the notes struck; * a note lost)`);
  console.log(`${'note'.padEnd(5)} vel  ${LENS.map((l) => USE.map((k) => `${k} ${Math.round(l * 1000)}`.padEnd(14)).join('')).join('')}`);
  for (let m = FROM; m <= TO; m++)
    for (const vel of VELS) {
      let line = `${noteName(m).padEnd(5)}${`${vel}`.padStart(4)}  `;
      for (const len of LENS) {
        const r = retongue(render, ID, m, vel, len, held, USE);
        rows.push(...r.rows);
        for (const k of USE) {
          const x = r.rows.find((q) => q.kind === k);
          line += x ? `${f(x.speak)}/${f(x.holeMs, 4)}${x.lost ? '*' : ' '}   ` : `${'–'.padStart(5)}/${'–'.padStart(4)}    `;
        }
        if (NOTES)
          r.notes.forEach((N, k) =>
            N.forEach((n) => console.log(`      ${r.rows[k].kind.padEnd(8)} ${Math.round(len * 1000)} ms v${vel}  ${n.t.toFixed(3)} ${noteName(n.midi).padEnd(4)} speak ${f(n.speak, 6)} hole ${f(n.holeDb)} dB ${f(n.holeMs)} ms reach ${f(n.reach)}${n.lost ? ' LOST' : ''}`)),
          );
      }
      console.log(line);
    }
  console.log('\nby register: speak ms median (worst) | hole ms median (worst) | hole dB median | reach dB median | lost');
  const bands: [string, number, number][] = [
    ['E3–C4', 52, 60],
    ['C♯4–C5', 61, 72],
    ['C♯5 up', 73, 127],
  ];
  for (const [name, lo, hi] of bands)
    for (const kind of USE)
      for (const len of LENS) {
        const R = rows.filter((r) => r.midi >= lo && r.midi <= hi && r.kind === kind && r.len === len);
        if (!R.length) continue;
        console.log(
          `${name.padEnd(8)}${kind.padEnd(9)}${`${Math.round(len * 1000)} ms`.padEnd(7)} speak ${f(med(R.map((r) => r.speak)))} (${f(Math.max(...R.map((r) => r.speakMax)))}) | hole ${f(med(R.map((r) => r.holeMs)))} (${f(Math.max(...R.map((r) => r.holeMsMax)))}) ms | ${f(med(R.map((r) => r.holeDb)))} dB | reach ${f(med(R.map((r) => r.reach)))} | lost ${R.reduce((a, r) => a + r.lost, 0)} of ${R.reduce((a, r) => a + r.of, 0)}`,
        );
      }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
}
