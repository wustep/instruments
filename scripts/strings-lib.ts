// Shared by scripts/strings-octave.ts and scripts/viola-levels.ts (audio audit 3): a bowed instrument
// rendered offline on any checkout's engine with the string's own motion kept beside the sound (the
// friction force and the string's velocity under the bow, every sample: the engine's visual trace of the
// string last played), the bow's state every 128 samples, and the measure of a note that has left
// Helmholtz motion; and the bowed parts of the bundled pieces as the browser sends them (the Orchestra's
// routes, the automatic expression, each note told ahead with its length and the dynamics over it).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fft } from '../packages/engine/src/analysis/index.ts';
import { CC_DYNAMICS, CC_REST } from '../packages/engine/src/core/instrument.ts';
import type { InstrumentId } from '../packages/engine/src/core/instrument.ts';
import { notesAhead, parseMidi, type FileEvent, type MidiSong } from '../apps/web/src/midi-file.ts';
import { express, modLines, modValue, PartLevels, volumeRef } from '../apps/web/src/expression.ts';
import { deskOf, placeNote, playersOf, playsNote, VOICE_INFO, type Plan } from '../apps/web/src/orchestra/assign.ts';
import { PIECES, piecePlan, pieceSong } from '../apps/web/src/orchestra/pieces.ts';

export type Ev = { time: number; event: Record<string, unknown> };
export const HERE = resolve(join(import.meta.dirname, '../packages/engine/src/core/index.ts'));
export const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const name = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
export const db = (x: number) => 20 * Math.log10(Math.max(1e-12, x));

/** the engine of a checkout (its packages/engine/src/core/index.ts) */
export async function engine(path?: string): Promise<{ createCore: (o: Record<string, unknown>) => any }> {
  return import(pathToFileURL(resolve(path || HERE)).href);
}

/** a note as a file plays it: told ahead (the bow is planned: audio.foreseeFileEvent), then on and off */
export const filed = (time: number, midi: number, velocity: number, dur: number, dyn?: number): Ev[] => [
  { time, event: { type: 'foresee', midi, velocity, dur, ...(dyn === undefined ? {} : { dyn }) } },
  { time, event: { type: 'noteOn', midi, velocity } },
  { time: time + dur, event: { type: 'noteOff', midi } },
];
/** the same from the keys: nothing foreseen */
export const keyed = (time: number, midi: number, velocity: number, dur: number): Ev[] => [
  { time, event: { type: 'noteOn', midi, velocity } },
  { time: time + dur, event: { type: 'noteOff', midi } },
];

export interface Traced {
  fs: number;
  /** the sound, mono (L + R) / 2 */
  x: Float32Array;
  L: Float32Array;
  R: Float32Array;
  /** the string last played: its velocity under the bow and the friction force, every sample */
  v: Float32Array;
  f: Float32Array;
  /** every 128 samples, of the string last played: bow speed (signed, m/s), force (N), Schelleng's
   *  maximum for the note's speed and contact point (N), the contact point β, the bow's place on the hair
   *  (m), the planned stroke's speed factor, whether the string is bowed */
  ctl: { vBow: Float32Array; fBow: Float32Array; fMax: Float32Array; beta: Float32Array; pos: Float32Array; k: Float32Array; on: Uint8Array; string: Uint8Array };
}

/** render with the string's own motion (dry unless asked) */
export function trace(eng: { createCore: (o: Record<string, unknown>) => any }, o: { instrument: string; events: Ev[]; duration: number; fs?: number; player?: number; dry?: boolean; params?: Record<string, unknown> }): Traced {
  const fs = o.fs ?? 48000;
  const core = eng.createCore({ sampleRate: fs, instrument: o.instrument, dry: o.dry ?? true, player: o.player, params: o.params });
  for (const e of o.events) core.schedule(e.event, Math.round(e.time * fs));
  const n = Math.ceil(o.duration * fs);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const v = new Float32Array(n + 4096);
  const f = new Float32Array(n + 4096);
  const nb = Math.ceil(n / 128);
  const ctl = { vBow: new Float32Array(nb), fBow: new Float32Array(nb), fMax: new Float32Array(nb), beta: new Float32Array(nb), pos: new Float32Array(nb), k: new Float32Array(nb), on: new Uint8Array(nb), string: new Uint8Array(nb) };
  const bl = new Float32Array(128);
  const br = new Float32Array(128);
  const strs = core.strings as { trF: Float32Array; trV: Float32Array; trI: number; vSigned: number; fBow: number; fScale: number; fMax: number; beta: number; kBow: number; bowing: boolean }[];
  const last = strs.map((s) => s.trI);
  let w = 0;
  let focus = core.focus as number;
  const take = (i: number) => {
    const s = strs[i];
    const m = (s.trI - last[i]) & 2047;
    for (let q = 0; q < m; q++) {
      const j = (last[i] + q) & 2047;
      v[w] = s.trV[j];
      f[w] = s.trF[j];
      w++;
    }
    last[i] = s.trI;
  };
  for (let i = 0, b = 0; i < n; i += 128, b++) {
    const len = Math.min(128, n - i);
    core.process(bl, br, len);
    L.set(len === 128 ? bl : bl.subarray(0, len), i);
    R.set(len === 128 ? br : br.subarray(0, len), i);
    // (the string in focus before this call rendered first)
    take(focus);
    for (let q = 0; q < strs.length; q++) if (q !== focus && q !== core.focus) take(q);
    focus = core.focus;
    take(focus);
    const s = strs[focus];
    ctl.vBow[b] = s.vSigned;
    ctl.fBow[b] = s.fBow * s.fScale;
    ctl.fMax[b] = s.fMax;
    ctl.beta[b] = s.beta;
    ctl.pos[b] = core.bow.pos;
    ctl.k[b] = s.kBow;
    ctl.on[b] = s.bowing ? 1 : 0;
    ctl.string[b] = focus;
  }
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.5 * (L[i] + R[i]);
  // (the core renders ahead of what it has handed out by under a block: the trace is that much early)
  return { fs, x, L, R, v: v.subarray(0, n), f: f.subarray(0, n), ctl };
}

const NF = 8192;
const re = new Float64Array(NF);
const im = new Float64Array(NF);
const hann = new Map<number, Float64Array>();
const win = (W: number): Float64Array => {
  let h = hann.get(W);
  if (!h) {
    h = new Float64Array(W);
    for (let i = 0; i < W; i++) h[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (W - 1));
    hann.set(W, h);
  }
  return h;
};

/** One window of a signal against a note's pitch: the power on the note's harmonics (H, the first eight
 *  under 0.45 fs), on the octave below's own (S: f0/2 and its odd multiples), and between those (Q: the
 *  odd multiples of f0/4: what a rough, aperiodic motion fills as well), each the largest bin within
 *  1.2 % of its place (vibrato). */
export function shares(x: ArrayLike<number>, fs: number, a: number, W: number, f0: number): { H: number; S: number; Q: number } {
  const h = win(W);
  re.fill(0);
  im.fill(0);
  for (let i = 0; i < W; i++) re[i] = (x[a + i] ?? 0) * h[i];
  fft(re, im);
  const bin = fs / NF;
  const at = (f: number): number => {
    const c = f / bin;
    const d = Math.max(1, (0.012 * f) / bin);
    let p = 0;
    for (let j = Math.max(1, Math.floor(c - d)); j <= Math.ceil(c + d); j++) p = Math.max(p, re[j] * re[j] + im[j] * im[j]);
    return p;
  };
  let H = 0;
  let S = 0;
  let Q = 0;
  for (let k = 1; k <= 8 && k * f0 < 0.45 * fs; k++) {
    H += at(k * f0);
    S += at((k - 0.5) * f0);
    Q += 0.5 * (at((k - 0.25) * f0) + at((k - 0.75) * f0));
  }
  return { H, S, Q };
}

export interface NoteRead {
  /** frames read (5 ms apart) */
  n: number;
  /** of them, an octave low: the octave below's own harmonics within 12 dB of the note's and 6 dB over
   *  what lies between; rough: within 12 dB with as much between (no pitch); the time of each, s */
  low: number;
  rough: number;
  /** when the string first holds the note's own motion for 30 ms (s after the note began; −1: never) */
  settled: number;
  /** the octave below over the note, dB, over the note's second half */
  subDb: number;
}

/** A note of pitch f0 from t0 to t1 (s) in a signal, read every 5 ms in windows of 40 ms (12 periods if
 *  that is longer): how long it is an octave low, how long rough, when it settles. */
export function readNote(x: ArrayLike<number>, fs: number, t0: number, t1: number, f0: number): NoteRead {
  const W = Math.round(Math.max(0.04, 12 / f0) * fs);
  const hop = Math.round(0.005 * fs);
  const a0 = Math.round(t0 * fs);
  const a1 = Math.round(t1 * fs) - W;
  const r: NoteRead = { n: 0, low: 0, rough: 0, settled: -1, subDb: -99 };
  let good = 0;
  let sH = 0;
  let sS = 0;
  for (let a = a0; a <= a1; a += hop) {
    const { H, S, Q } = shares(x, fs, a, W, f0);
    r.n++;
    const sub = S > H / 16;
    if (sub && S > 4 * Q) r.low++;
    else if (sub) r.rough++;
    if (!sub) {
      good++;
      if (r.settled < 0 && good >= 6) r.settled = (a - 5 * hop - a0) / fs;
    } else good = 0;
    if (a >= (a0 + a1) / 2) {
      sH += H;
      sS += S;
    }
  }
  r.low *= 0.005;
  r.rough *= 0.005;
  if (sH > 0) r.subDb = 10 * Math.log10(Math.max(1e-12, sS / sH));
  return r;
}

// ------------------------------------------------------------ the bundled pieces' bowed parts

export interface PartNote {
  t: number;
  end: number;
  midi: number;
  vel: number;
}
export interface StringPart {
  /** "beethoven5-i violin 1" */
  name: string;
  piece: string;
  instrument: InstrumentId;
  player: number;
  events: Ev[];
  /** the notes, paired (first in, first out per pitch), in order of their start */
  notes: PartNote[];
  duration: number;
}

const load = (file: string): MidiSong => {
  const buf = readFileSync(file);
  return parseMidi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
};

/** one part's events from a song's (expressed) events, as orchestra/ensemble.ts sends them (schedule and
 *  foresee: each note told ahead with its length and its line's dynamics over it) */
function partEvents(song: MidiSong, events: FileEvent[], plan: Plan, k: number): Ev[] {
  const part = plan.parts[k];
  const out: Ev[] = [];
  const lv = new PartLevels(volumeRef(song), modLines(song));
  const sched = new Map<number, number>();
  const { len, dyn } = notesAhead(events);
  events.forEach((e, i) => {
    const rs = e.line === undefined ? undefined : plan.lines[e.line];
    const r = rs?.find((x) => x.part === k);
    if (!r) return;
    if (e.kind === 'cc' || e.kind === 'dyn') {
      if (!lv.take(e)) return;
      const prev = lv.sent;
      const next = lv.next(part.lines);
      if (!next) return;
      if (next.mod !== (prev?.mod ?? null)) out.push({ time: e.t, event: { type: 'control', cc: 1, value: next.mod === null ? CC_REST : modValue(next.mod) } });
      if (next.dyn !== (prev?.dyn ?? 0)) out.push({ time: e.t, event: { type: 'control', cc: CC_DYNAMICS, value: next.dyn } });
      return;
    }
    if (e.kind === 'pedal') return;
    if (!playsNote(e, deskOf(plan, song.lines, e.line!, k))) return;
    const pitch = placeNote(e.midi, r.shift, part.voice);
    const n = sched.get(pitch) ?? 0;
    if (e.kind === 'on') {
      sched.set(pitch, n + 1);
      if (len[i] > 0) out.push({ time: e.t, event: { type: 'foresee', midi: pitch, velocity: e.vel, dur: len[i], dyn: dyn[i] } });
      out.push({ time: e.t, event: { type: 'noteOn', midi: pitch, velocity: e.vel } });
    } else if (n > 1) sched.set(pitch, n - 1);
    else {
      sched.delete(pitch);
      out.push({ time: e.t, event: { type: 'noteOff', midi: pitch } });
    }
  });
  return out;
}

export function pairNotes(events: Ev[], duration: number): PartNote[] {
  const open = new Map<number, PartNote>();
  const notes: PartNote[] = [];
  for (const e of events) {
    const ev = e.event as { type: string; midi?: number; velocity?: number };
    if (ev.type === 'noteOn') {
      const was = open.get(ev.midi!);
      if (was) was.end = e.time;
      const n = { t: e.time, end: duration, midi: ev.midi!, vel: ev.velocity! };
      notes.push(n);
      open.set(n.midi, n);
    } else if (ev.type === 'noteOff') {
      const n = open.get(ev.midi!);
      if (n) n.end = e.time;
      open.delete(ev.midi!);
    }
  }
  return notes.filter((n) => n.end > n.t);
}

/** the parts of these instruments in the bundled pieces (ids as in orchestra/pieces.ts; all if none named) */
export function stringParts(instruments: InstrumentId[], pieces?: string[]): StringPart[] {
  const parts: StringPart[] = [];
  const dir = join(import.meta.dirname, '../apps/web/public/pieces');
  for (const p of PIECES) {
    if (pieces && !pieces.includes(p.id)) continue;
    const song = pieceSong(load(join(dir, p.file)), p);
    const plan = piecePlan(p, song.lines, Math.max(6, p.parts.length));
    const players = playersOf(plan);
    const x = express(song);
    const events = x.shaped ? x.events : song.events;
    const count = new Map<string, number>();
    plan.parts.forEach((pt, k) => {
      const inst = VOICE_INFO[pt.voice].instrument;
      if (!instruments.includes(inst) || !pt.lines.length) return;
      const n = (count.get(inst) ?? 0) + 1;
      count.set(inst, n);
      const ev = partEvents(song, events, plan, k);
      parts.push({ name: `${p.id} ${inst} ${n}`, piece: p.id, instrument: inst, player: players[k], events: ev, notes: pairNotes(ev, song.duration), duration: song.duration });
    });
  }
  return parts;
}
