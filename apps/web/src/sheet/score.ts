// A MIDI file set out as a score: its notes in bars, each a written value (a dotted crotchet, a quaver of a
// triplet, tied over the bar line), spelled in its key, on a staff with a clef. Pure and with no DOM: the
// view (sheet/view.ts) draws it with VexFlow, and lights the notes and the place as the file plays.
//
// The file's own grid is read (midi-file.ts `score`: its ticks, tempo map, time and key signatures), so a
// note's place in the bar is the one it was written at, not its time as played. A file typed on the grid
// (Mutopia's: every note on a sixteenth, a thirty-second or a triplet) is read exactly; a file whose lines
// stand a little apart from it (this project's own pieces, which place each player's notes early by the
// time the instrument takes to speak, and lean them) is read to the nearest sixteenth, after the line's own
// lead is taken off. Each staff is one voice of chords: notes that begin together are a chord, held to the
// next chord (a note held under another moving one is cut there: two voices on one staff are not
// separated).

import type { FileEvent, MidiSong, ScoreGrid } from '../midi-file.ts';

/** a crotchet, in the score's units (a thirty-second is 6, a triplet quaver 16, a triplet semiquaver 8) */
export const Q = 48;

export type Clef = 'treble' | 'bass' | 'alto';

export interface StaffPlan {
  /** the file's lines on this staff */
  lines: number[];
  clef: Clef;
  /** semitones it is written from what sounds (a double bass's part is written an octave up, a
   *  glockenspiel's two octaves down) */
  written?: number;
  /** an octave clef, for a line far over or under its staff: written an octave under what sounds (8va), or over */
  ottava?: '8va' | '8vb';
  /** only these of its notes (a keyboard's one line over two staves): from `lo` up to, not including, `hi` */
  lo?: number;
  hi?: number;
}

/** a written note value: VexFlow's names, and a dot */
export type Dur = 'w' | 'h' | 'q' | '8' | '16' | '32';

export interface Pitch {
  /** as it sounds */
  midi: number;
  /** as it is written: a letter, its sharps (+) or flats (−), its octave (C4 is middle C) */
  letter: string;
  alter: number;
  octave: number;
  /** the accidental printed before it ('' none: the key or the bar already says so) */
  acc: '' | '#' | 'b' | 'n' | '##' | 'bb';
}

export interface Entry {
  /** where it begins and how long it is, in units from the file's start */
  start: number;
  len: number;
  dur: Dur;
  dots: number;
  rest: boolean;
  pitches: Pitch[];
  /** tied on to the next entry (a note over a beat or a bar line) */
  tie: boolean;
  /** the end of a note tied from the one before */
  tied: boolean;
  /** the triplet it is in (an index, the same for its notes), −1 none; and how many it holds of its value */
  tuplet: number;
  tupletOf: 3 | 6;
  /** a whole bar's rest */
  bar: boolean;
}

export interface Bar {
  /** its number as printed (a pickup is 0) */
  n: number;
  start: number;
  len: number;
  num: number;
  den: number;
  /** each staff's key (sharps +, flats −), and whether it changes here */
  keys: number[];
  keyChange: boolean[];
  meterChange: boolean;
  /** each staff's entries, in order, filling the bar */
  staves: Entry[][];
}

export interface Score {
  staves: StaffPlan[];
  bars: Bar[];
  /** the song's time (s) → units, and back */
  unitsAt(t: number): number;
  timeAt(u: number): number;
}

// ------------------------------------------------------------------ time

/** the tick of song time `t` (s) */
export function tickAt(g: ScoreGrid, t: number): number {
  const f = g.from + g.rate * t;
  const m = g.tempo;
  let lo = 0;
  let hi = m.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (m[mid].sec <= f + 1e-9) lo = mid;
    else hi = mid - 1;
  }
  const s = m[lo];
  return s.tick + ((f - s.sec) * 1e6 * g.ppq) / s.us;
}

/** the song time (s) of tick `k` */
export function timeAtTick(g: ScoreGrid, k: number): number {
  const m = g.tempo;
  let lo = 0;
  let hi = m.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (m[mid].tick <= k) lo = mid;
    else hi = mid - 1;
  }
  const s = m[lo];
  const f = s.sec + ((k - s.tick) * s.us) / 1e6 / g.ppq;
  return (f - g.from) / g.rate;
}

// ------------------------------------------------------------------ bars

interface Frame {
  start: number;
  len: number;
  num: number;
  den: number;
}

/** the bars from the file's start to `end` (units), by its time signatures (a signature in the middle of
 *  a bar begins the next one there, as midi-file.ts reads the bar lines) */
export function framesOf(g: ScoreGrid, end: number): Frame[] {
  const u = (tick: number) => Math.round((tick * Q) / g.ppq);
  const ms = g.meters.map((m) => ({ at: u(m.tick), num: m.num, den: m.den }));
  const out: Frame[] = [];
  let num = 4;
  let den = 4;
  let k = 0;
  for (let t = 0, guard = 0; t < end && guard < 100000; guard++) {
    while (k < ms.length && ms[k].at <= t) ({ num, den } = ms[k++]);
    let len = Math.max(1, Math.round((num * 4 * Q) / den));
    if (k < ms.length && ms[k].at < t + len) len = ms[k].at - t;
    out.push({ start: t, len, num, den });
    t += len;
  }
  return out;
}

/** a bar's beats, as places from its start: a crotchet's in 4/4, a minim's in 2/2, a dotted crotchet's in
 *  6/8, 9/8, 12/8; a bar of 5 or 7 quavers in twos and a three (2+3, 2+2+3); 3/8 in quavers */
export function beatsOf(num: number, den: number, len: number): number[] {
  const unit = (4 * Q) / den;
  let step: number[];
  if (den >= 8 && num % 3 === 0 && num > 3) step = Array(num / 3).fill(3 * unit);
  else if (den >= 8 && num > 3 && num % 2 === 1) step = [...Array((num - 3) / 2).fill(2 * unit), 3 * unit];
  else step = Array(num).fill(unit);
  const out = [0];
  for (const s of step) out.push(out[out.length - 1] + s);
  return out.filter((b) => b < len).concat(len);
}

// ------------------------------------------------------------------ spelling

const LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
/** each letter's place on the line of fifths (F −1, C 0, G 1 … B 5) */
const FIFTH = [0, 2, 4, -1, 1, 3, 5];

/** A pitch's name in a key: of its spellings, the one nearest the key on the line of fifths (C major's
 *  chromatic notes are C♯, E♭, F♯, A♭, B♭; a minor key's leading note is raised: C minor's B, not C♭). */
export function spell(midi: number, fifths: number, minor = false): Pitch {
  const pc = ((midi % 12) + 12) % 12;
  const centre = fifths + (minor ? 3.5 : 2);
  let best = { letter: 0, alter: 0, d: Infinity };
  for (let l = 0; l < 7; l++) {
    let alter = pc - NATURAL[l];
    if (alter > 6) alter -= 12;
    if (alter < -6) alter += 12;
    if (Math.abs(alter) > 2) continue;
    const d = Math.abs(FIFTH[l] + 7 * alter - centre);
    // (an even choice: the flat in a major key, the sharp in a minor one)
    if (d < best.d - 1e-9 || (Math.abs(d - best.d) < 1e-9 && (minor ? alter > best.alter : alter < best.alter))) best = { letter: l, alter, d };
  }
  const octave = Math.floor((midi - best.alter) / 12) - 1;
  return { midi, letter: LETTERS[best.letter], alter: best.alter, octave, acc: '' };
}

/** the alterations a key signature gives each letter */
function keyAlters(fifths: number): Record<string, number> {
  const out: Record<string, number> = { c: 0, d: 0, e: 0, f: 0, g: 0, a: 0, b: 0 };
  const sharps = ['f', 'c', 'g', 'd', 'a', 'e', 'b'];
  for (let i = 0; i < Math.min(7, Math.abs(fifths)); i++) out[fifths > 0 ? sharps[i] : sharps[6 - i]] = fifths > 0 ? 1 : -1;
  return out;
}

/** a key moved by `semis` semitones (fewest accidentals; F♯ or G♭ as it was sharp or flat) */
export function transposeKey(fifths: number, semis: number): number {
  if (!semis) return fifths;
  let r = (((fifths + 7 * semis) % 12) + 12) % 12;
  if (r > 6 || (r === 6 && fifths < 0)) r -= 12;
  return r;
}

/** the key that holds most of these notes (pitch-class counts) among the major keys of up to six sharps or
 *  flats, the fewest accidentals of an even choice; and the share of them it holds */
export function likeliestKey(pcs: number[]): { fifths: number; share: number } {
  const total = pcs.reduce((a, b) => a + b, 0) || 1;
  let best = { fifths: 0, share: -1 };
  for (const f of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
    const tonic = (((7 * f) % 12) + 12) % 12;
    let n = 0;
    for (const s of NATURAL) n += pcs[(tonic + s) % 12];
    if (n / total > best.share + 1e-9) best = { fifths: f, share: n / total };
  }
  return best;
}

// ------------------------------------------------------------------ the notes

interface Note {
  a: number;
  b: number;
  midi: number;
}

/** a staff's notes, in units (a note never ended lasts to the song's end) */
function notesOf(events: readonly FileEvent[], staff: StaffPlan, unitsAt: (t: number) => number, end: number): Note[] {
  const lines = new Set(staff.lines);
  const lo = staff.lo ?? -Infinity;
  const hi = staff.hi ?? Infinity;
  const open = new Map<string, number[]>();
  const out: Note[] = [];
  for (const e of events) {
    if ((e.kind !== 'on' && e.kind !== 'off') || !lines.has(e.line ?? 0) || e.midi < lo || e.midi >= hi) continue;
    const k = `${e.line ?? 0}:${e.midi}`;
    if (e.kind === 'on') {
      const q = open.get(k);
      if (q) q.push(unitsAt(e.t));
      else open.set(k, [unitsAt(e.t)]);
    } else {
      const a = open.get(k)?.shift();
      if (a !== undefined) out.push({ a, b: unitsAt(e.t), midi: e.midi });
    }
  }
  for (const [k, q] of open) for (const a of q) out.push({ a, b: end, midi: Number(k.split(':')[1]) });
  return out.sort((x, y) => x.a - y.a || y.midi - x.midi);
}

/** the grids a stretch of a bar may be read on, simplest first: semiquavers, triplet quavers,
 *  demisemiquavers, triplet semiquavers (each dividing the stretch: a crotchet, or a quaver in x/8) */
const GRIDS = [12, 16, 6, 8];
const near = (x: number, g: number) => Math.abs(x - Math.round(x / g) * g);

/**
 * Each note on the grid: a stretch at a time (a crotchet, or a quaver in a bar of quavers), read on the
 * simplest grid that holds every note beginning or ending in it to within `tol` units. A staff whose notes
 * stand off any grid (a line played in, or led by the instrument's speaking time) is read on semiquavers,
 * once its own lead (the offset that brings most of it onto them) is taken off.
 */
function quantize(notes: Note[], frames: Frame[]): { notes: Note[]; exact: boolean; tri: (u: number) => number } {
  const on = notes.map((n) => n.a);
  const share = (pos: number[], f: (u: number) => boolean) => (pos.length ? pos.filter(f).length / pos.length : 1);
  // typed on the grid: nine in ten beginnings on a 1/48 of a crotchet that a sixteenth, a thirty-second or
  // a triplet makes
  const exact = share(on, (u) => near(u, 6) < 0.26 || near(u, 8) < 0.26) >= 0.9;
  // else the staff's lead: the offset (−6 … 6 units) that brings its beginnings nearest the semiquavers
  let lead = 0;
  if (!exact) {
    const cost = (o: number) => on.reduce((s, u) => s + Math.min(6, near(u - o, 12)), 0);
    let c0 = cost(0);
    for (let o = -6; o <= 6; o += 0.5) {
      const c = cost(o);
      if (c < c0 * 0.9 - 1e-9) ((lead = o), (c0 = c));
    }
  }
  const shifted = notes.map((n) => ({ a: n.a - lead, b: n.b - lead, midi: n.midi }));
  // near the grid (most beginnings within a unit and a half of a semiquaver): every grid, within that;
  // else (a line played in) semiquavers alone
  const tol = exact ? 0.5 : 1.5;
  const loose = !exact && share(shifted.map((n) => n.a), (u) => near(u, 12) <= 1.5) < 0.8;
  // each stretch's grid, by its bar
  const fi = (u: number) => {
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (frames[m].start <= u) lo = m;
      else hi = m - 1;
    }
    return lo;
  };
  const stretchOf = (f: Frame) => (f.den >= 8 ? (4 * Q) / f.den : Q);
  const keyOf = (u: number, end = false) => {
    const f = frames[fi(end ? u - 1e-6 : u)];
    const w = stretchOf(f);
    const i = Math.floor((Math.max(f.start, end ? u - 1e-6 : u) - f.start) / w);
    return { key: `${f.start}:${i}`, at: f.start + i * w, w };
  };
  // (a stretch's grid is chosen by the notes that begin in it: an end is often played short)
  const points = new Map<string, number[]>();
  for (const n of shifted) {
    const k = keyOf(n.a).key;
    const p = points.get(k);
    if (p) p.push(n.a);
    else points.set(k, [n.a]);
  }
  const chosen = new Map<string, number>();
  const gridAt = (u: number, end = false): number => {
    const { key, at, w } = keyOf(u, end);
    let g = chosen.get(key);
    if (g === undefined) {
      const ps = (points.get(key) ?? []).map((x) => x - at);
      const can = (loose ? [12] : GRIDS).filter((x) => w % x === 0);
      g = can.find((x) => ps.every((p) => near(p, x) <= tol)) ?? can.reduce((b, x) => (ps.reduce((s, p) => s + near(p, x), 0) < ps.reduce((s, p) => s + near(p, b), 0) ? x : b), can[0] ?? 12);
      chosen.set(key, g);
    }
    return g;
  };
  const snap = (u: number, end = false) => {
    const { at } = keyOf(u, end);
    const g = gridAt(u, end);
    return at + Math.round((u - at) / g) * g;
  };
  const out = shifted.map((n) => {
    const a = Math.max(0, snap(n.a));
    let b = snap(n.b, true);
    if (b <= a) b = a + gridAt(a);
    return { a, b, midi: n.midi };
  });
  // (a stretch's triplet grid, 0 on a plain one)
  return { notes: out, exact, tri: (u) => (gridAt(u) % 3 === 0 ? 0 : gridAt(u)) };
}

/** one staff's music as chords and rests: [start, end) and its pitches (none: a rest) */
interface Span {
  a: number;
  b: number;
  midi: number[];
}

/** notes that begin together are a chord, held to the next chord, or to its own end and a rest; on a staff
 *  read off the grid, a gap of a semiquaver or less is no rest (the note was played short) */
function chords(notes: Note[], exact: boolean): Span[] {
  const out: Span[] = [];
  for (let i = 0; i < notes.length; ) {
    let j = i;
    const midi = new Set<number>();
    let end = notes[i].b;
    while (j < notes.length && notes[j].a === notes[i].a) {
      midi.add(notes[j].midi);
      end = Math.max(end, notes[j].b);
      j++;
    }
    const a = notes[i].a;
    const next = j < notes.length ? notes[j].a : Infinity;
    if (end > next) end = next;
    else if (!exact && next < Infinity && next - end <= 12) end = next;
    out.push({ a, b: end, midi: [...midi].sort((x, y) => x - y) });
    i = j;
  }
  return out;
}

// ------------------------------------------------------------------ values

const VALUES: { len: number; dur: Dur; dots: number }[] = [
  { len: 192, dur: 'w', dots: 0 },
  { len: 144, dur: 'h', dots: 1 },
  { len: 96, dur: 'h', dots: 0 },
  { len: 72, dur: 'q', dots: 1 },
  { len: 48, dur: 'q', dots: 0 },
  { len: 36, dur: '8', dots: 1 },
  { len: 24, dur: '8', dots: 0 },
  { len: 18, dur: '16', dots: 1 },
  { len: 12, dur: '16', dots: 0 },
  { len: 6, dur: '32', dots: 0 },
];
/** a triplet's values (their written names; each sounds two thirds of it) */
const TRIPLET: { len: number; dur: Dur; dots: number }[] = [
  { len: 32, dur: 'q', dots: 0 },
  { len: 24, dur: '8', dots: 1 },
  { len: 16, dur: '8', dots: 0 },
  { len: 8, dur: '16', dots: 0 },
];

/**
 * A stretch [p, q) of a bar (places from its start) as written values, in order: the longest value that
 * neither hides a beat (one within a beat, or whole beats from a beat) nor, in a bar of four, crosses its
 * middle from anywhere but its start (a minim on the second beat of 4/4 is two tied crotchets).
 */
export function valuesOf(p: number, q: number, beats: number[], num: number): { at: number; len: number; dur: Dur; dots: number }[] {
  const out: { at: number; len: number; dur: Dur; dots: number }[] = [];
  const onBeat = (x: number) => beats.includes(x);
  const half = num === 4 && beats.length === 5 ? beats[2] : -1;
  let c = p;
  for (let guard = 0; c < q && guard < 64; guard++) {
    const left = q - c;
    const fits = VALUES.find((v) => {
      if (v.len > left) return false;
      const e = c + v.len;
      const inside = beats.some((b) => b > c && b < e);
      if (!inside) return true;
      if (!onBeat(c) || !onBeat(e)) return false;
      return !(half > 0 && c > 0 && c < half && e > half);
    });
    const v = fits ?? { len: Math.min(left, 6), dur: '32' as Dur, dots: 0 };
    out.push({ at: c, len: v.len, dur: v.dur, dots: v.dots });
    c += v.len;
  }
  return out;
}

// ------------------------------------------------------------------ the score

/**
 * The score of `song` on these staves: its bars from the one its first note is in to the one its last
 * note ends in (a first bar mostly rest, a pickup, begins at its first note's beat and is numbered 0).
 */
export function buildScore(song: MidiSong, staves: StaffPlan[]): Score | null {
  const g = song.score;
  if (!g || song.stream) return null;
  const unitsAt = (t: number) => (tickAt(g, t) * Q) / g.ppq;
  const timeAt = (u: number) => timeAtTick(g, (u * g.ppq) / Q);
  const endU = unitsAt(song.duration);
  // (bars past the end: a last note's end read onto the grid may reach into the next)
  const frames = framesOf(g, endU + 8 * Q);
  const per = staves.map((st) => {
    const raw = notesOf(song.events, st, unitsAt, endU);
    const qz = quantize(raw, frames);
    return { st, spans: chords(qz.notes, qz.exact), tri: qz.tri, raw };
  });
  const all = per.flatMap((p) => p.spans);
  if (!all.length) return null;
  // (the song's bars, whatever the staves shown: a part that comes in late has its rests before it)
  const ons = song.events.filter((e) => e.kind === 'on');
  const first = Math.min(...all.map((s) => s.a), ...(ons.length ? [Math.floor(Math.round(unitsAt(ons[0].t)) / 12) * 12] : []));
  const last = Math.max(...all.map((s) => s.b), endU);
  const fiOf = (u: number) => {
    const i = frames.findIndex((f) => f.start <= u && u < f.start + f.len);
    return i < 0 ? frames.length - 1 : i;
  };
  const f0 = Math.max(0, fiOf(first));
  const f1 = Math.max(f0, fiOf(last - 1e-6));
  // a pickup: the first bar begins at its first note when over half of it is rest
  const fr0 = frames[f0];
  // (from its first note: an upbeat quaver is a bar of one quaver)
  const pickup = f1 > f0 && first - fr0.start >= fr0.len / 2 ? first - fr0.start : 0;

  // each staff's keys through the piece: its own track's signatures or the first track's that has any
  // (the conductor's), whichever holds more of its notes (Mutopia writes a clarinet's key as it reads it
  // over notes as they sound; a part typed as it reads has its notes in its own key); moved with the song;
  // and, where its notes fit another key far better (a file with no signatures), that one
  const firstTrack = g.keys.length ? Math.min(...g.keys.map((k) => k.track)) : -1;
  type KeyAt = { at: number; fifths: number; minor: boolean };
  const listOf = (ks: ScoreGrid['keys']): KeyAt[] => ks.map((k) => ({ at: Math.round((k.tick * Q) / g.ppq), fifths: transposeKey(k.fifths, g.shift ?? 0), minor: k.minor }));
  const fitOf = (at: KeyAt[], raw: Note[]) => {
    let fit = 0;
    for (const n of raw) {
      const pc = ((n.midi % 12) + 12) % 12;
      const k = [...at].reverse().find((x) => x.at <= n.a + 1e-6) ?? at[0];
      const tonic = ((((k?.fifths ?? 0) * 7) % 12) + 12) % 12;
      if (NATURAL.includes((pc - tonic + 12) % 12)) fit++;
    }
    return raw.length ? fit / raw.length : 1;
  };
  const keysFor = (st: StaffPlan, raw: Note[]): KeyAt[] => {
    const tracks = new Set(st.lines.map((i) => song.lines[i]?.track ?? -1));
    const own = listOf(g.keys.filter((k) => tracks.has(k.track)));
    const conductor = listOf(g.keys.filter((k) => k.track === firstTrack));
    let at = own.length ? own : conductor;
    let share = fitOf(at, raw);
    if (own.length && conductor.length) {
      const c = fitOf(conductor, raw);
      if (c > share) ((at = conductor), (share = c));
    }
    const pcs = new Array<number>(12).fill(0);
    for (const n of raw) pcs[((n.midi % 12) + 12) % 12]++;
    const best = likeliestKey(pcs);
    if (!at.length || (share < 0.75 && best.share > share + 0.1)) return [{ at: 0, fifths: best.fifths, minor: false }];
    return at;
  };
  const keys = per.map((p) => keysFor(p.st, p.raw));
  const keyAt = (s: number, u: number) => [...keys[s]].reverse().find((k) => k.at <= u + 1e-6) ?? keys[s][0];

  let tuplet = 0;
  const bars: Bar[] = [];
  for (let fi = f0; fi <= f1; fi++) {
    const f = frames[fi];
    const start = fi === f0 ? f.start + pickup : f.start;
    const len = f.start + f.len - start;
    const beats = beatsOf(f.num, f.den, f.len).filter((b) => b >= start - f.start).map((b) => b - (start - f.start));
    const prev = bars[bars.length - 1];
    const ks = per.map((_, s) => keyAt(s, start));
    const bar: Bar = {
      // (numbered as the file's bars: a pickup at its start is 0, an excerpt's first bar its own number)
      n: pickup && f0 === 0 ? fi : fi + 1,
      start,
      len,
      num: f.num,
      den: f.den,
      keys: ks.map((k) => k.fifths),
      keyChange: ks.map((k, s) => !!prev && prev.keys[s] !== k.fifths),
      meterChange: !!prev && (prev.num !== f.num || prev.den !== f.den),
      staves: [],
    };
    per.forEach((p, s) => {
      const entries: Entry[] = [];
      const key = ks[s];
      const alters = keyAlters(key.fifths);
      const sounding: Record<string, number> = {};
      const altOf = (pt: Pitch) => sounding[`${pt.letter}${pt.octave}`] ?? alters[pt.letter];
      // (spelled as written, an octave clef's octave off; known by the pitch it sounds)
      const write = (m: number): Pitch => ({ ...spell(m + (p.st.written ?? 0) - 12 * (p.st.ottava === '8va' ? 1 : p.st.ottava === '8vb' ? -1 : 0), key.fifths, key.minor), midi: m });
      // the bar's stretches: each chord or rest inside it
      const end = start + len;
      const inBar: { a: number; b: number; midi: number[]; contFrom: boolean; contTo: boolean }[] = [];
      let c = start;
      for (const sp of p.spans) {
        if (sp.b <= start || sp.a >= end) continue;
        const a = Math.max(start, sp.a);
        const b = Math.min(end, sp.b);
        if (a > c) inBar.push({ a: c, b: a, midi: [], contFrom: false, contTo: false });
        inBar.push({ a, b, midi: sp.midi, contFrom: sp.a < start, contTo: sp.b > end });
        c = b;
      }
      if (c < end) inBar.push({ a: c, b: end, midi: [], contFrom: false, contTo: false });
      // a bar of rest: one whole rest
      if (inBar.length === 1 && !inBar[0].midi.length) {
        entries.push({ start, len, dur: 'w', dots: 0, rest: true, pitches: [], tie: false, tied: false, tuplet: -1, tupletOf: 3, bar: true });
        bar.staves.push(entries);
        return;
      }
      for (const sp of inBar) {
        // its values: on the bar's beats, or a triplet's within its stretch
        const pieces: { at: number; len: number; dur: Dur; dots: number; tri: number; of: 3 | 6 }[] = [];
        let x = sp.a;
        while (x < sp.b) {
          const t = p.tri(x);
          const w = f.den >= 8 ? (4 * Q) / f.den : Q;
          const ws = f.start + Math.floor((x - f.start) / w) * w;
          if (t) {
            const y = Math.min(sp.b, ws + w);
            // (the whole stretch: a plain crotchet, or a quaver in a bar of quavers)
            if (x === ws && y === ws + w) pieces.push({ at: x, len: w, dur: w === Q ? 'q' : '8', dots: 0, tri: -1, of: 3 });
            else
              for (let z = x, guard = 0; z < y && guard < 16; guard++) {
                const v = TRIPLET.find((v) => v.len <= y - z && v.len % t === 0) ?? { len: y - z, dur: '16' as Dur, dots: 0 };
                pieces.push({ at: z, len: v.len, dur: v.dur, dots: v.dots, tri: ws, of: w / t === 6 ? 6 : 3 });
                z += v.len;
              }
            x = y;
          } else {
            // as far as the stretches on the plain grid go
            let y = ws + w;
            while (y < sp.b && !p.tri(y)) y += w;
            y = Math.min(y, sp.b);
            for (const v of valuesOf(x - start, y - start, beats, f.num)) pieces.push({ at: v.at + start, len: v.len, dur: v.dur, dots: v.dots, tri: -1, of: 3 });
            x = y;
          }
        }
        pieces.forEach((pc, i) => {
          const pitches = sp.midi.map(write);
          const tied = i > 0 || sp.contFrom;
          if (!tied)
            for (const pt of pitches) {
              const want = pt.alter;
              if (altOf(pt) !== want) {
                pt.acc = want === 0 ? 'n' : want === 1 ? '#' : want === -1 ? 'b' : want === 2 ? '##' : 'bb';
                sounding[`${pt.letter}${pt.octave}`] = want;
              }
            }
          entries.push({ start: pc.at, len: pc.len, dur: pc.dur, dots: pc.dots, rest: !pitches.length, pitches, tie: pitches.length > 0 && (i < pieces.length - 1 || sp.contTo), tied: pitches.length > 0 && tied, tuplet: -1, tupletOf: pc.of, bar: false, ...{ _tri: pc.tri } } as Entry & { _tri: number });
        });
      }
      // the triplets: a stretch's notes are one group
      let open = -2;
      for (const e of entries as (Entry & { _tri?: number })[]) {
        const t = e._tri ?? -1;
        delete e._tri;
        if (t < 0) {
          open = -2;
          continue;
        }
        if (t !== open) {
          tuplet++;
          open = t;
        }
        e.tuplet = tuplet;
      }
      bar.staves.push(entries);
    });
    bars.push(bar);
  }
  return { staves, bars, unitsAt, timeAt };
}

/** the entries sounding at `u` (units) in a bar, staff by staff (a rest sounds nothing) */
export function soundingAt(bar: Bar, u: number): Entry[] {
  const out: Entry[] = [];
  for (const st of bar.staves) for (const e of st) if (!e.rest && e.start <= u && u < e.start + e.len) out.push(e);
  return out;
}

/** the bar `u` is in (its index), by binary search; −1 before the first */
export function barAt(bars: Bar[], u: number): number {
  let lo = 0;
  let hi = bars.length - 1;
  if (!bars.length || u < bars[0].start) return -1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (bars[m].start <= u) lo = m;
    else hi = m - 1;
  }
  return lo;
}
