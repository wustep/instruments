// The wind and brass parts of the bundled pieces, as the browser sends them to their engines: the
// Orchestra's pieces through the plan's routes (orchestra/ensemble.ts schedule: a pair's desk on a shared
// staff, octave moves, unisons of two lines counted) and each instrument's own piece (orchestra/pieces.ts
// demoSong), both with the automatic expression the player adds (expression.ts express: velocities and the
// swell of a held note, CC_DYNAMICS) and the file's controllers (the mod wheel; volume and expression are a
// gain after the engine, kept here as `gain` points). Shared by scripts/winds-midi-*.ts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InstrumentId } from '../packages/engine/src/core/instrument.ts';
import { CC_DYNAMICS, CC_REST } from '../packages/engine/src/core/instrument.ts';
import type { TimedEvent } from '../packages/engine/src/core/render.ts';
import { parseMidi, type FileEvent, type MidiSong } from '../apps/web/src/midi-file.ts';
import { express, modLines, modValue, PartLevels, volumeRef } from '../apps/web/src/expression.ts';
import { autoPlan, deskOf, placeNote, playersOf, playsNote, VOICE_INFO, type Plan } from '../apps/web/src/orchestra/assign.ts';
import { DEMOS, demoSong, PIECES, piecePlan, pieceSong } from '../apps/web/src/orchestra/pieces.ts';

export const WINDS: InstrumentId[] = ['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone'];

export interface PartNote {
  t: number;
  end: number;
  midi: number;
  vel: number;
}
export interface WindPart {
  /** "beethoven5-i flute 1", "demo flute" */
  name: string;
  piece: string;
  instrument: InstrumentId;
  player: number;
  /** what its engine is sent, in order (times in seconds of the piece as it plays) */
  events: TimedEvent[];
  /** the notes among them, paired (first in, first out per pitch), in order of their start */
  notes: PartNote[];
  /** the file's volume × expression on this part: [time, gain] steps (the browser's output gain) */
  gain: [number, number][];
  duration: number;
}

const load = (file: string): MidiSong => {
  const buf = readFileSync(file);
  return parseMidi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
};

/** pair a part's note events */
export function pairNotes(events: TimedEvent[], duration: number): PartNote[] {
  const open = new Map<number, PartNote[]>();
  const notes: PartNote[] = [];
  for (const e of events) {
    const ev = e.event as { type: string; midi?: number; velocity?: number };
    if (ev.type === 'noteOn') {
      const n = { t: e.time, end: duration, midi: ev.midi!, vel: ev.velocity! };
      notes.push(n);
      const q = open.get(n.midi);
      if (q) q.push(n);
      else open.set(n.midi, [n]);
    } else if (ev.type === 'noteOff') {
      const n = open.get(ev.midi!)?.shift();
      if (n) n.end = e.time;
    }
  }
  return notes;
}

/** what the file player tells an engine of the notes to come (audio.ts foreseeFileEvent): each note's start,
 *  strength and length, ahead of the note itself */
export function foreseen(notes: PartNote[]): TimedEvent[] {
  return notes.map((n) => ({ time: n.t, event: { type: 'foresee', midi: n.midi, velocity: n.vel, dur: Math.max(0.01, n.end - n.t) } as never }));
}

/** one part's events from a song's (expressed) events, as orchestra/ensemble.ts schedule sends them */
function partEvents(song: MidiSong, events: FileEvent[], plan: Plan, k: number): { events: TimedEvent[]; gain: [number, number][] } {
  const part = plan.parts[k];
  const out: TimedEvent[] = [];
  const gain: [number, number][] = [];
  const lv = new PartLevels(volumeRef(song), modLines(song));
  const sched = new Map<number, number>();
  for (const e of events) {
    const rs = e.line === undefined ? undefined : plan.lines[e.line];
    const r = rs?.find((x) => x.part === k);
    if (!r) continue;
    if (e.kind === 'cc' || e.kind === 'dyn') {
      if (!lv.take(e)) continue;
      const prev = lv.sent;
      const next = lv.next(part.lines);
      if (!next) continue;
      if (next.gain !== (prev?.gain ?? 1)) gain.push([e.t, next.gain]);
      if (next.mod !== (prev?.mod ?? null)) out.push({ time: e.t, event: { type: 'control', cc: 1, value: next.mod === null ? CC_REST : modValue(next.mod) } as never });
      if (next.dyn !== (prev?.dyn ?? 0)) out.push({ time: e.t, event: { type: 'control', cc: CC_DYNAMICS, value: next.dyn } as never });
      continue;
    }
    if (e.kind === 'pedal') continue;
    if (!playsNote(e, deskOf(plan, song.lines, e.line!, k))) continue;
    const pitch = placeNote(e.midi, r.shift, part.voice);
    const n = sched.get(pitch) ?? 0;
    if (e.kind === 'on') {
      sched.set(pitch, n + 1);
      out.push({ time: e.t, event: { type: 'noteOn', midi: pitch, velocity: e.vel } });
    } else if (n > 1) sched.set(pitch, n - 1);
    else {
      sched.delete(pitch);
      out.push({ time: e.t, event: { type: 'noteOff', midi: pitch } });
    }
  }
  return { events: out, gain };
}

/** one instrument alone playing a whole song (audio.ts scheduleFileEvent: every line, as written) */
function soloEvents(song: MidiSong, events: FileEvent[]): { events: TimedEvent[]; gain: [number, number][] } {
  const out: TimedEvent[] = [];
  const gain: [number, number][] = [];
  const lv = new PartLevels(volumeRef(song), modLines(song));
  const lines = song.lines.map((_, i) => i);
  for (const e of events) {
    if (e.kind === 'on') out.push({ time: e.t, event: { type: 'noteOn', midi: e.midi, velocity: e.vel } });
    else if (e.kind === 'off') out.push({ time: e.t, event: { type: 'noteOff', midi: e.midi } });
    else if (e.kind === 'cc' || e.kind === 'dyn') {
      if (!lv.take(e)) continue;
      const prev = lv.sent;
      const next = lv.next(lines);
      if (!next) continue;
      if (next.gain !== (prev?.gain ?? 1)) gain.push([e.t, next.gain]);
      if (next.mod !== (prev?.mod ?? null)) out.push({ time: e.t, event: { type: 'control', cc: 1, value: next.mod === null ? CC_REST : modValue(next.mod) } as never });
      if (next.dyn !== (prev?.dyn ?? 0)) out.push({ time: e.t, event: { type: 'control', cc: CC_DYNAMICS, value: next.dyn } as never });
    }
  }
  return { events: out, gain };
}

/**
 * Every wind and brass part the bundled pieces play (or, given files, those files routed as a dropped
 * file is: autoPlan), then each wind's own piece. `auto`: with the player's automatic expression (its
 * default).
 */
export function windParts(files?: string[], auto = true): WindPart[] {
  const parts: WindPart[] = [];
  const dir = 'apps/web/public/pieces';
  const jobs = files
    ? files.map((f) => ({ id: f.split('/').pop()!.replace(/\.midi?$/i, ''), song: load(f), piece: null as (typeof PIECES)[number] | null }))
    : PIECES.map((p) => ({ id: p.id, song: pieceSong(load(join(dir, p.file)), p), piece: p as (typeof PIECES)[number] | null }));
  for (const job of jobs) {
    const song = job.song;
    const plan = job.piece ? piecePlan(job.piece, song.lines, Math.max(6, job.piece.parts.length)) : autoPlan(song.lines, { cap: 24 });
    const players = playersOf(plan);
    const x = express(song);
    const events = auto && x.shaped ? x.events : song.events;
    const count = new Map<string, number>();
    plan.parts.forEach((p, k) => {
      const inst = VOICE_INFO[p.voice].instrument;
      if (!WINDS.includes(inst) || !p.lines.length) return;
      const n = (count.get(inst) ?? 0) + 1;
      count.set(inst, n);
      const pe = partEvents(song, events, plan, k);
      const notes = pairNotes(pe.events, song.duration);
      parts.push({ name: `${job.id} ${inst} ${n}`, piece: job.id, instrument: inst, player: players[k], events: pe.events, notes, gain: pe.gain, duration: song.duration });
    });
  }
  if (!files)
    for (const inst of WINDS) {
      const d = DEMOS[inst];
      const song = demoSong(load(join(dir, d.file)), d);
      const x = express(song);
      const events = auto && x.shaped ? x.events : song.events;
      const pe = soloEvents(song, events);
      parts.push({ name: `demo ${inst}`, piece: `demo-${inst}`, instrument: inst, player: 0, events: pe.events, notes: pairNotes(pe.events, song.duration), gain: pe.gain, duration: song.duration });
    }
  return parts;
}
