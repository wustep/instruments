// A MIDI file's dynamics, as the instruments play them.
//
// The file's own: volume (CC7) and expression (CC11) are a gain on the instrument that plays the line,
// General MIDI's curve (each 40·log10(value/127) dB; General MIDI Level 2, MMA 1999), the volume
// taken relative to the loudest the file sets (at least the default, 100), so a file that sets 100
// everywhere plays as one that sets nothing. The mod wheel (CC1), where the file moves it, goes to the
// bowed and wind instruments as the plug-in keyboard's wheel does (bow pressure, breath), held within
// the upper half of its travel: a file's wheel at rest must not take the breath away.
//
// Automatic expression: a line with no dynamics of its own (one velocity, or a few terraces, and no
// controller that moves) is phrased as a player would (the KTH performance rules: Friberg, Bresin &
// Sundberg 2006, "Overview of the KTH rule system for musical performance", Adv. Cogn. Psychol. 2;
// the phrase arch after Todd 1992, "The dynamics of dynamics", JASA 91): crescendo and diminuendo
// over each phrase and each pair of phrases (a phrase is two to eight bars, about ten seconds) and
// over the piece, higher notes a little louder, long notes a little louder and short ones softer, the
// downbeat leaned on, the top of a chord brought out, and each line its own small unevenness. All of
// it in velocity steps, added to the file's own velocities (its terraces stay). A held note on a bowed
// or wind instrument swells and fades (messa di voce) through the engines' CC_DYNAMICS, which moves
// the bow (speed, force, vibrato) or the breath as a louder or softer note would. Where the file
// moves its own dynamics, even on a flat line, the phrasing makes way.
//
// And its timing: a file typed into a notation program begins every line's note on the same tick, which
// no ensemble does (Rasch 1979, "Synchronization in performed ensemble music", Acustica 43: the onsets
// of notes written together stand 30–50 ms apart, a standard deviation, in professional trios). Where the
// file's lines are together to the millisecond, each line is given a place in time of its own, slowly
// moving either side of the beat (TIMING: well under what was measured); a file that was played in, or
// written with its lines apart, keeps its own.

import type { FileCC, FileEvent, MidiSong } from './midi-file.ts';

// ------------------------------------------------------------- the file's own

/** General MIDI's gain for a volume or expression value (0…1 of 127), relative to `ref` (its 1) */
export const ccGain = (v: number, ref = 1): number => Math.min(1, Math.max(0, v) / ref) ** 2;

/** the volume (CC7, 0…1) a song's lines are measured against: the loudest it sets, at least 100 */
export function volumeRef(song: MidiSong): number {
  let ref = 100 / 127;
  for (const e of song.events) if (e.kind === 'cc' && e.cc === 7 && e.value > ref) ref = e.value;
  return ref;
}

/** the lines whose mod wheel moves (a value set once, a reset at the start, is no gesture) */
export function modLines(song: MidiSong): Set<number> {
  const seen = new Map<number, { lo: number; hi: number }>();
  for (const e of song.events) {
    if (e.kind !== 'cc' || e.cc !== 1 || e.line === undefined) continue;
    const s = seen.get(e.line);
    if (s) {
      s.lo = Math.min(s.lo, e.value);
      s.hi = Math.max(s.hi, e.value);
    } else seen.set(e.line, { lo: e.value, hi: e.value });
  }
  const out = new Set<number>();
  for (const [l, s] of seen) if (s.hi - s.lo >= MOVE_CC) out.add(l);
  return out;
}

/** a file's mod wheel (0…1) as the engines' CC1: the upper half of its travel */
export const modValue = (v: number): number => 0.5 + 0.5 * Math.min(1, Math.max(0, v));

/** what a part (one engine) plays from its lines' controllers */
export interface PartLevel {
  /** its output gain: the file's volume × expression (the loudest of its lines) */
  gain: number;
  /** the mod wheel (0…1, as the file has it), or null: at rest */
  mod: number | null;
  /** automatic expression within a held note, velocity steps (CC_DYNAMICS) */
  dyn: number;
}

/** One engine's share of a file's dynamics: each of its lines' controllers as they come, and what
 *  they make together. A part with one line plays it exactly; with several, the gain is the loudest
 *  line's (a quiet line never mutes a loud one), the wheel and the swell the mean of the lines that
 *  move them. */
export class PartLevels {
  private vol = new Map<number, number>();
  private expr = new Map<number, number>();
  private mod = new Map<number, number>();
  private dyn = new Map<number, number>();
  /** what was last sent to the engine (null: nothing yet: the engine is at rest) */
  sent: PartLevel | null = null;

  constructor(
    private ref: number,
    private wheels: Set<number>,
  ) {}
  /** what it was made with (a fresh one, at rest, for the same file) */
  get args(): [number, Set<number>] {
    return [this.ref, this.wheels];
  }

  /** a controller or a swell of line `line`; false if it is none of this part's business */
  take(e: FileEvent): boolean {
    const l = e.line ?? -1;
    if (e.kind === 'dyn') {
      if (e.value) this.dyn.set(l, e.value);
      else this.dyn.delete(l);
      return true;
    }
    if (e.kind !== 'cc') return false;
    if (e.cc === 7) this.vol.set(l, ccGain(e.value, this.ref));
    else if (e.cc === 11) this.expr.set(l, ccGain(e.value));
    else if (this.wheels.has(l)) this.mod.set(l, e.value);
    else return false;
    return true;
  }

  /** what the part plays now, over `lines` (its lines; any line not heard from is at 1) */
  level(lines: Iterable<number>): PartLevel {
    let gain = 0;
    let n = 0;
    for (const l of lines) {
      n++;
      gain = Math.max(gain, (this.vol.get(l) ?? 1) * (this.expr.get(l) ?? 1));
    }
    const mean = (m: Map<number, number>) => {
      let s = 0;
      for (const v of m.values()) s += v;
      return m.size ? s / m.size : null;
    };
    return { gain: n ? gain : 1, mod: mean(this.mod), dyn: mean(this.dyn) ?? 0 };
  }

  /** the next level to send, or null if nothing has changed since the last */
  next(lines: Iterable<number>): PartLevel | null {
    const v = this.level(lines);
    const s = this.sent;
    if (s ? s.gain === v.gain && s.mod === v.mod && s.dyn === v.dyn : v.gain === 1 && v.mod === null && v.dyn === 0) return null;
    this.sent = v;
    return v;
  }

  /** the controllers as they stand at the file's position `t` (a seek or a resume chases them) */
  static chase(events: FileEvent[], t: number): FileEvent[] {
    const last = new Map<string, FileEvent>();
    for (const e of events) {
      if (e.t > t) break;
      if (e.kind === 'cc') last.set(`${e.line}:${e.cc}`, e);
      else if (e.kind === 'dyn') last.set(`${e.line}:d`, e);
    }
    return [...last.values()];
  }
}

// ------------------------------------------------------------- is a line flat?

/** a velocity spread (steps) or a controller's travel (of 127) that counts as the file moving its
 *  own dynamics near a note */
const MOVE_VEL = 6;
const MOVE_CC = 6 / 127;
/** the neighbourhood of a note that is looked at, seconds either way (and two notes either way) */
const NEAR = 3;
/** a line with its own dynamics near at least this share of its notes keeps them, untouched */
const OWN_SHARE = 0.25;

interface Note {
  t: number;
  end: number;
  midi: number;
  vel: number;
  /** index of its 'on' in the song's events */
  ei: number;
}

/** each line's notes in order, paired on/off (first in, first out per pitch) */
function notesOf(song: MidiSong): Note[][] {
  const out: Note[][] = song.lines.map(() => []);
  const open = new Map<string, Note[]>();
  song.events.forEach((e, ei) => {
    if (e.line === undefined || !out[e.line]) return;
    if (e.kind === 'on') {
      const n = { t: e.t, end: song.duration, midi: e.midi, vel: e.vel, ei };
      out[e.line].push(n);
      const k = `${e.line}:${e.midi}`;
      const q = open.get(k);
      if (q) q.push(n);
      else open.set(k, [n]);
    } else if (e.kind === 'off') {
      const n = open.get(`${e.line}:${e.midi}`)?.shift();
      if (n) n.end = e.t;
    }
  });
  return out;
}

export interface LineShape {
  /** the share of its notes near which the file moves its own dynamics */
  own: number;
  /** no dynamics of its own: automatic expression shapes it */
  flat: boolean;
  /** per note, in order: how far the phrasing may move it (0 where the file moves its own dynamics) */
  room: number[];
}

/** Which lines have dynamics of their own. Near each note (three seconds and two notes either way)
 *  the file moves its dynamics if the velocities spread six steps or more, or a volume, expression or
 *  mod-wheel value travels six or more; a line where that holds near a quarter of its notes or more
 *  is its own. (An accent pattern of three steps, or a velocity changed at a new section, is not.) */
export function lineShapes(song: MidiSong, notes = notesOf(song)): LineShape[] {
  const ccs: Map<FileCC, [number, number][]>[] = song.lines.map(() => new Map());
  for (const e of song.events) {
    if (e.kind !== 'cc' || e.line === undefined || !ccs[e.line]) continue;
    const m = ccs[e.line];
    if (!m.has(e.cc)) m.set(e.cc, []);
    m.get(e.cc)!.push([e.t, e.value]);
  }
  /** does a controller of the line travel within [a, b] (counting the value in force at a)? */
  const ccMoves = (li: number, a: number, b: number) => {
    for (const pts of ccs[li].values()) {
      // the first point at or after a (the points are in time order)
      let i = 0;
      let j = pts.length;
      while (i < j) {
        const m = (i + j) >> 1;
        if (pts[m][0] < a) i = m + 1;
        else j = m;
      }
      let lo = i > 0 ? pts[i - 1][1] : Infinity;
      let hi = i > 0 ? pts[i - 1][1] : -Infinity;
      for (; i < pts.length && pts[i][0] <= b; i++) {
        lo = Math.min(lo, pts[i][1]);
        hi = Math.max(hi, pts[i][1]);
        if (hi - lo >= MOVE_CC) return true;
      }
    }
    return false;
  };
  return notes.map((ns, li) => {
    const moved = ns.map((n, i) => {
      let lo = n.vel;
      let hi = n.vel;
      for (let j = i - 1; j >= 0 && (j >= i - 2 || ns[j].t >= n.t - NEAR); j--) {
        lo = Math.min(lo, ns[j].vel);
        hi = Math.max(hi, ns[j].vel);
      }
      for (let j = i + 1; j < ns.length && (j <= i + 2 || ns[j].t <= n.t + NEAR); j++) {
        lo = Math.min(lo, ns[j].vel);
        hi = Math.max(hi, ns[j].vel);
      }
      return hi - lo >= MOVE_VEL || ccMoves(li, n.t - NEAR, n.t + NEAR);
    });
    const own = ns.length ? moved.filter(Boolean).length / ns.length : 0;
    // room: none where the file moves, half within three seconds of such a place, whole elsewhere
    const times = ns.filter((_, i) => moved[i]).map((n) => n.t);
    let k = 0;
    const room = ns.map((n, i) => {
      if (moved[i]) return 0;
      while (k < times.length && times[k] < n.t - NEAR) k++;
      return k < times.length && times[k] <= n.t + NEAR ? 0.5 : 1;
    });
    return { own, flat: ns.length > 0 && own < OWN_SHARE, room };
  });
}

// ------------------------------------------------------------- automatic expression

/** the phrasing's sizes, velocity steps (a step is about a quarter of a decibel on the strings,
 *  a tenth on the flute; scripts/render-dynamics.ts measures what they come to) */
export const PHRASING = {
  /** the phrase, the pair of phrases and the whole piece: crescendo to about 60 % of each, then
   *  diminuendo (peak to trough) */
  phrase: 16,
  period: 8,
  piece: 8,
  /** per semitone above (below) the line's middle, at most `highMost` either way (gentle: each line
   *  to its own middle, so a cello going low is a cello going softer, and it carries a quartet's mix;
   *  at 0.5 the Haydn's own climaxes were evened out, scripts/render-dynamics.ts) */
  high: 0.25,
  highMost: 4,
  /** per doubling of a note's length over the line's usual one, at most ±4 */
  long: 2.5,
  /** a note on the bar line */
  downbeat: 4,
  /** a chord's top note, its bass, the notes between */
  top: 3,
  bass: 1.5,
  inner: -1.5,
  /** each note's own unevenness (1σ), its own for each line */
  noise: 2.2,
  /** a held note on a bowed or wind instrument: the swell (trough to peak) for a note of `swellAt` s
   *  and more, up to `swell` steps for a long one; it begins softer than the note's level and peaks
   *  above it, the same on average */
  swellAt: 1,
  swellMin: 5,
  swellPerS: 4,
  swell: 16,
  /** the most a note is moved, either way (the arches and the rules together) */
  most: 20,
  /** the highest velocity the phrasing reaches (headroom kept above the loudest note) */
  ceiling: 122,
} as const;

/** a crescendo–diminuendo over [0, 1]: 0 at both ends, 1 at `peak` */
function arch(u: number, peak = 0.6): number {
  const x = Math.min(1, Math.max(0, u));
  return Math.sin(Math.PI * x ** (Math.log(0.5) / Math.log(peak)));
}

/** a deterministic Gaussian stream (each line its own) */
function gauss(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  const u = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
}

/** The phrase grid: bar lines grouped into phrases of 1, 2, 4, 8 or 16 bars, the longest that stays
 *  within 15 s (two-second bars where the file gives none), starting where the music breathes: of the
 *  ways to group the bars, the one whose phrase ends fall most often where a line ends a long note or
 *  rests (a cadence; the KTH punctuation rule's cue), the first bar when none is clearer. */
export function phrases(song: MidiSong, notes = notesOf(song)): number[] {
  const bars = song.bars && song.bars.length > 1 ? song.bars : Array.from({ length: Math.ceil(song.duration / 2) + 1 }, (_, i) => 2 * i);
  const lens = bars.slice(1).map((b, i) => b - bars[i]).sort((a, b) => a - b);
  const bar = lens[lens.length >> 1] || 2;
  let per = 1;
  while (per < 16 && per * 2 * bar <= 15) per *= 2;
  // breaths: where a line lets go of a long note (1.5 × its usual length or more) or falls silent
  const ends: number[] = [];
  for (const ns of notes) {
    if (!ns.length) continue;
    const d = ns.map((n) => n.end - n.t).sort((a, b) => a - b);
    const usual = d[d.length >> 1];
    ns.forEach((n, i) => {
      const next = ns[i + 1]?.t ?? Infinity;
      if (n.end - n.t >= 1.5 * usual || next - n.end >= 0.25 * bar) ends.push(n.end);
    });
  }
  ends.sort((a, b) => a - b);
  const breathes = (t: number) => {
    let lo = 0;
    let hi = ends.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (ends[m] < t - 0.3 * bar) lo = m + 1;
      else hi = m;
    }
    let n = 0;
    for (let i = lo; i < ends.length && ends[i] <= t + 0.3 * bar; i++) n++;
    return n;
  };
  let phase = 0;
  let best = -1;
  for (let k = 0; k < per; k++) {
    let score = 0;
    let count = 0;
    for (let i = k + per; i < bars.length; i += per) {
      score += breathes(bars[i]);
      count++;
    }
    // (a clearer grouping only: ties keep the first bar)
    if (count && score / count > best + 1e-9) {
      best = score / count;
      phase = k;
    }
  }
  const out: number[] = phase ? [bars[0]] : [];
  for (let i = phase; i < bars.length; i += per) out.push(bars[i]);
  if (out[out.length - 1] < song.duration) out.push(Math.max(song.duration, out[out.length - 1] + per * bar));
  return out;
}

/** where `t` falls in a grid of boundaries: 0 at a boundary, → 1 at the next; and which segment */
function within(grid: number[], t: number): { u: number; i: number } {
  let lo = 0;
  let hi = grid.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (grid[m] <= t) lo = m;
    else hi = m;
  }
  const a = grid[lo];
  const b = grid[Math.min(grid.length - 1, lo + 1)];
  return { u: b > a ? (t - a) / (b - a) : 0, i: lo };
}

export interface Expressed {
  /** the song's events with the flat lines phrased (velocities) and their swells (dyn events), and
   *  a typed file's lines each in its own time */
  events: FileEvent[];
  shapes: LineShape[];
  /** some line was phrased */
  shaped: boolean;
  /** the lines were typed together and are now each in their own time (TIMING) */
  timed: boolean;
}

/** Ensemble timing. A file is typed when it has `least` instants or more at which two or more lines begin a
 *  note within `near` s, and `share` of them are within `exact` s. Each line is then moved in time by a slow
 *  wander of its own, the sum of three sines of `periods` s at phases of its own, `sd` s (a standard
 *  deviation; never more than 2.45 of it, 22 ms): two lines stand 13 ms apart, a standard deviation, a third of
 *  what Rasch measured between a trio's players. The whole line moves (its notes' ends, pedals and
 *  controllers with them: a chord in one line stays a chord, a note is as long as written to within 6 %,
 *  and nothing in a line changes order). A keyboard's or a harp's two staves are one player's two hands,
 *  and move as one (`timingPlayers`): a pedal written on the left hand's staff changes with the right
 *  hand's notes as it was written to. */
export const TIMING = { least: 8, near: 0.03, exact: 0.001, share: 0.9, sd: 0.009, periods: [1.3, 2.9, 6.7] } as const;

/** are the song's lines typed together (TIMING)? */
export function typedTogether(song: MidiSong): boolean {
  const ons: { t: number; line: number }[] = [];
  for (const e of song.events) if (e.kind === 'on' && e.line !== undefined) ons.push({ t: e.t, line: e.line });
  ons.sort((a, b) => a.t - b.t);
  let n = 0;
  let exact = 0;
  for (let i = 0; i < ons.length; ) {
    let j = i;
    const lines = new Set<number>([ons[i].line]);
    while (j + 1 < ons.length && ons[j + 1].t - ons[i].t < TIMING.near) lines.add(ons[++j].line);
    if (lines.size > 1) {
      n++;
      if (ons[j].t - ons[i].t < TIMING.exact) exact++;
    }
    i = j + 1;
  }
  return n >= TIMING.least && exact >= TIMING.share * n;
}

/** Whose place in time each line has (TIMING): its own, or the line's before it when the two are one
 *  player's hands: next to each other on one keyboard or harp program (General MIDI 0–23, the pianos, the
 *  chromatic percussion and the organs; 46, the harp), or both with no program in a file that gives its
 *  other lines one (a sonata's RH and LH beside its horn). */
export function timingPlayers(song: MidiSong): number[] {
  const out: number[] = [];
  const programs = song.lines.some((l) => l.program >= 0);
  song.lines.forEach((l, i) => {
    const prev = song.lines[i - 1];
    const hands = !!prev && prev.program === l.program && (l.program < 0 ? programs : l.program < 24 || l.program === 46);
    out.push(hands ? out[i - 1] : i);
  });
  return out;
}

/** a player's place in time at t (s, either side of the written time: TIMING) */
export function lineLag(line: number, t: number): number {
  const a = TIMING.sd / Math.sqrt(TIMING.periods.length / 2);
  let d = 0;
  TIMING.periods.forEach((T, k) => {
    // (each line's own phases: a hash of the line and the sine)
    let h = ((line + 1) * 2654435761 + (k + 1) * 40503) >>> 0;
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    const ph = (((h ^ (h >>> 14)) >>> 0) / 4294967296) * 2 * Math.PI;
    d += a * Math.sin((2 * Math.PI * t) / T + ph);
  });
  return d;
}

/** the events with every line in its own time (TIMING); in time order, each line's own order kept */
function inTime(song: MidiSong, events: FileEvent[]): FileEvent[] {
  const who = timingPlayers(song);
  const duration = song.duration;
  const moved = events.map((e, i) => ({ e: e.line === undefined ? e : { ...e, t: Math.min(duration, Math.max(0, e.t + lineLag(who[e.line] ?? e.line, e.t))) }, i }));
  moved.sort((a, b) => a.e.t - b.e.t || a.i - b.i);
  return moved.map((x) => x.e);
}

/** The file played with automatic expression on its flat lines (the others, and every pedal and
 *  controller, as written). Deterministic: the same file always plays the same. */
export function express(song: MidiSong): Expressed {
  const notes = notesOf(song);
  const shapes = lineShapes(song, notes);
  const timed = typedTogether(song);
  if (!shapes.some((s) => s.flat)) return { events: timed ? inTime(song, song.events) : song.events, shapes, shaped: false, timed };
  const P = PHRASING;
  const grid = phrases(song, notes);
  const pairs = grid.filter((_, i) => i % 2 === 0);
  if (pairs[pairs.length - 1] < grid[grid.length - 1]) pairs.push(grid[grid.length - 1]);
  const bars = song.bars && song.bars.length > 1 ? song.bars : grid;
  const end = Math.max(1e-6, song.duration);
  /** the phrasing's level at time t (steps): the phrase's, the pair's and the piece's arches */
  const shape = (t: number) => {
    const a = within(grid, t);
    const b = within(pairs, t);
    return P.phrase * (arch(a.u) - 0.5) + P.period * (arch(b.u) - 0.5) + P.piece * (arch(t / end, 0.62) - 0.5);
  };
  const onBar = (t: number) => {
    const { i } = within(bars, t);
    return Math.abs(t - bars[i]) < 0.04 || (bars[i + 1] !== undefined && Math.abs(bars[i + 1] - t) < 0.04);
  };
  const vel = new Map<number, number>();
  const dyn: FileEvent[] = [];
  notes.forEach((ns, li) => {
    const sh = shapes[li];
    if (!sh.flat || !ns.length) return;
    const rnd = gauss(li + 1);
    // what "higher" is measured from: the line's middle (KTH "high loud" is to a fixed reference; one
    // that follows the tune around evens out the music's own climaxes)
    const mids = ns.map((n) => n.midi).sort((a, b) => a - b);
    const mid = mids[mids.length >> 1];
    const durs = ns.map((n) => n.end - n.t).sort((a, b) => a - b);
    const usual = Math.max(0.05, durs[durs.length >> 1]);
    // chords: notes begun together (within 30 ms)
    const chordOf: number[] = [];
    const span: { lo: number; hi: number; n: number }[] = [];
    for (let i = 0, c = 0; i < ns.length; i++) {
      if (i > 0 && ns[i].t - ns[i - 1].t > 0.03) c++;
      chordOf.push(c);
      const sp = (span[c] ??= { lo: ns[i].midi, hi: ns[i].midi, n: 0 });
      sp.lo = Math.min(sp.lo, ns[i].midi);
      sp.hi = Math.max(sp.hi, ns[i].midi);
      sp.n++;
    }
    const offs = ns.map((n, i) => {
      let o = shape(n.t);
      o += Math.max(-P.highMost, Math.min(P.highMost, P.high * (n.midi - mid)));
      o += Math.max(-4, Math.min(4, P.long * Math.log2(Math.max(0.02, n.end - n.t) / usual)));
      if (onBar(n.t)) o += P.downbeat;
      const ch = span[chordOf[i]];
      if (ch.n > 1) o += n.midi === ch.hi ? P.top : n.midi === ch.lo ? P.bass : P.inner;
      o += P.noise * rnd();
      return o;
    });
    // about the file's own level: the line's mean as written, the phrasing around it (where it has room)
    const mean = offs.reduce((a, b) => a + b, 0) / offs.length;
    offs.forEach((o, i) => (offs[i] = Math.max(-P.most, Math.min(P.most, o - mean)) * sh.room[i]));
    // swells: each chord held a second or more, its notes still sounding, until the next begins
    const groups: { t: number; end: number; room: number; first: number; last: number }[] = [];
    ns.forEach((n, i) => {
      const g = groups[groups.length - 1];
      if (g && chordOf[i] === chordOf[i - 1]) {
        g.end = Math.max(g.end, n.end);
        g.room = Math.min(g.room, sh.room[i]);
        g.last = i;
      } else groups.push({ t: n.t, end: n.end, room: sh.room[i], first: i, last: i });
    });
    groups.forEach((g, k) => {
      const next = groups[k + 1]?.t ?? Infinity;
      const stop = Math.min(g.end, next);
      const T = stop - g.t;
      if (T < P.swellAt || g.room <= 0) return;
      const S = g.room * Math.min(P.swell, P.swellMin + P.swellPerS * (T - P.swellAt));
      // rising through the phrase the swell peaks later, falling, earlier
      const slope = Math.sign(shape(g.t + 0.6 * T) - shape(g.t + 0.4 * T));
      const peak = 0.5 + 0.15 * slope;
      const steps = Math.max(4, Math.ceil(T / 0.15));
      const curve = (u: number) => arch(u, peak) ** 1.6 - 0.2 * u;
      // its mean over the note: the note begins that much softer, so the swell keeps its level
      let mean = 0;
      for (let s = 0; s < 32; s++) mean += curve((s + 0.5) / 32) / 32;
      for (let i = g.first; i <= g.last; i++) offs[i] -= S * mean;
      for (let s = 1; s < steps; s++) {
        const u = s / steps;
        dyn.push({ t: g.t + u * T, kind: 'dyn', value: +(S * curve(u)).toFixed(2), line: li });
      }
      // back to the note as begun when the next note comes (or the last lets go)
      dyn.push({ t: stop, kind: 'dyn', value: 0, line: li });
    });
    // headroom: the loudest phrased note no higher than the ceiling (a file at full force is phrased
    // below it, its shape kept)
    let over = 0;
    ns.forEach((n, i) => (over = Math.max(over, n.vel + offs[i] - P.ceiling)));
    ns.forEach((n, i) => vel.set(n.ei, Math.round(Math.max(Math.max(1, n.vel * 0.4), Math.min(127, n.vel + offs[i] - over)))));
  });
  const events: FileEvent[] = song.events.map((e, i) => (e.kind === 'on' && vel.has(i) ? { ...e, vel: vel.get(i)! } : e));
  // merged in time; at one instant a swell's end before the note that follows it
  const rank = (e: FileEvent) => (e.kind === 'on' ? 1 : 0);
  const all = events.map((e, i) => ({ e, i })).concat(dyn.map((e, i) => ({ e, i: events.length + i })));
  all.sort((a, b) => a.e.t - b.e.t || rank(a.e) - rank(b.e) || a.i - b.i);
  const phrased = all.map((x) => x.e);
  return { events: timed ? inTime(song, phrased) : phrased, shapes, shaped: true, timed };
}
