// A score's dynamics written into its MIDI file: note velocities and expression (CC11).
//
// A line's marks (marks/*.ts: "bar:beat mark …", the printed score's p, f, sf, fp, cresc., hairpins) make
// its level in time, in decibels under fortissimo. A note's velocity is the level it reaches (the timbre of
// its loudest moment), and what moves inside a note or below what the velocity alone gives is the line's
// expression controller: a crescendo through a held note, the fall after a sforzando or a fortepiano, a
// long note's own swell (messa di voce), and the part of a piano or pianissimo that a wind's velocity
// does not reach (the flute's and the trumpet's loudness hardly follows their velocity; the page plays
// CC11 as the part's gain, General MIDI's 40·log10(value/127) dB: apps/web/src/expression.ts).
// Struck and plucked instruments (the piano, the timpani) are given velocities only.
//
// Under the marks, what any player does unasked, small: the bar's first beat leaned on, a line's high
// notes a little louder, long notes over short ones, the top of a chord brought out, no two notes quite
// alike (the KTH performance rules' sizes: Friberg, Bresin & Sundberg 2006, Adv. Cogn. Psychol. 2; the
// page's own automatic expression, which these files no longer need, uses the same). Deterministic: the
// same file and marks always give the same bytes, and a file already given its dynamics gives itself.
//
// Each instrument's loudness against velocity is measured (velocity-curve.ts), so a mark is the same
// number of decibels on every instrument.
import { createHash } from 'node:crypto';
import { barOf, isCC, isEnd, isOff, isOn, linesOf, readSmf, secondsOf, writeSmf, type Smf, type SmfEvent } from './smf.ts';

/** what plays a line: its loudness against velocity, and whether it can move inside a note */
export type Player = 'violin' | 'viola' | 'cello' | 'bass' | 'flute' | 'oboe' | 'clarinet' | 'bassoon' | 'horn' | 'trumpet' | 'trombone' | 'timpani' | 'piano';

export interface ScoreMarks {
  /** the piece's id (orchestra/pieces.ts) and its file in apps/web/public/pieces */
  id: string;
  file: string;
  /** the sha256 of the file the dynamics were added to (Mutopia's own, or the piece as first written) */
  from: string;
  /** where the marks are from, and what in them is an editor's */
  source: string;
  /** the upbeat before bar 1, in quarter notes (bar 0) */
  pickup?: number;
  /** who plays each line that is given dynamics (a line not named keeps its own, untouched) */
  players: Record<number, Player>;
  /** marks for every named line, then each line's own: "bar[:beat] mark mark … bar[:beat] mark …", the
   *  beat in quarter notes from 1. Marks: ppp pp p mp mf f ff fff (a + or − after one: a third of the way
   *  to the next); sf sff fz sfz rf rfz (an accent on the notes begun there); fp sfp (begun loud, soft at
   *  once); cresc dim (to the next dynamic); < > (hairpins, to the next dynamic or !); ! (a hairpin's end) */
  all?: string;
  lines: Record<number, string>;
  /** the level before a line's first mark */
  start?: string;
  /** the unasked shaping's sizes, where they are not the defaults */
  shape?: Partial<typeof SHAPE>;
  /** the marks' distances from forte, × this (1 where not given: a Baroque terrace is a smaller step than
   *  a symphony's piano) */
  depth?: number;
  /** a line's level over its marks, dB (balance: a part whose register is soft on its instrument, a
   *  piece whose piano is a singing one) */
  lift?: Record<number, number>;
}

/** a mark's level, dB under fortissimo */
const LEVEL: Record<string, number> = { ppp: -19, pp: -15, p: -11, mp: -8, mf: -5.5, f: -2.5, ff: 0, fff: 1.5 };
const ORDER = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];
const ACCENTS = new Set(['sf', 'sff', 'fz', 'sfz', 'rf', 'rfz', 'fp', 'sfp']);
/** the timbre a level is played with on a wind instrument: its velocity, at least (a wind's loudness
 *  follows its velocity less than a mark asks: the rest is the controller's) */
const TIMBRE: [number, number][] = [[-19, 36], [-15, 45], [-11, 56], [-8, 66], [-5.5, 77], [-2.5, 92], [0, 108], [1.5, 118]];
/** each instrument's loudness (LUFS) at velocities 30, 45, 60, 75, 90, 105, 120: velocity-curve.ts */
const VELS = [30, 45, 60, 75, 90, 105, 120];
const LOUDNESS: Record<Player, number[]> = {
  piano: [-35.2, -31.6, -28.0, -24.6, -21.4, -18.3, -15.3],
  violin: [-32.3, -28.5, -25.1, -21.2, -19.1, -15.7, -13.6],
  viola: [-31.9, -29.5, -25.5, -22.2, -19.2, -17.9, -14.9],
  cello: [-30.6, -27.4, -24.4, -22.2, -19.0, -16.4, -13.2],
  bass: [-41.7, -38.2, -35.2, -31.8, -29.0, -25.0, -21.9],
  flute: [-23.0, -20.4, -18.3, -16.7, -15.4, -14.3, -13.3],
  oboe: [-29.8, -25.0, -21.4, -18.4, -15.8, -14.0, -12.2],
  clarinet: [-31.0, -25.6, -22.5, -20.6, -19.0, -17.4, -15.8],
  bassoon: [-25.7, -22.8, -20.9, -19.1, -17.1, -15.9, -14.8],
  horn: [-24.7, -23.6, -22.1, -20.4, -18.4, -16.4, -14.5],
  trumpet: [-21.6, -19.2, -17.5, -15.8, -14.5, -13.4, -12.5],
  trombone: [-39.1, -32.6, -27.0, -22.3, -18.3, -15.1, -13.3],
  timpani: [-41.4, -37.6, -34.0, -30.3, -26.5, -23.4, -20.6],
};
const STRUCK = new Set<Player>(['piano', 'timpani']);
const BOWED = new Set<Player>(['violin', 'viola', 'cello', 'bass']);
/** fortissimo's velocity, and the softest and the loudest a note is given: a bow under 42 or so is slow
 *  to speak, a wind under 46 (measured on these engines: a quick soft note must still be there) */
const FF = 108;
const SOFTEST = { struck: 30, bowed: 42, wind: 46 };
const LOUDEST = 124;
/** a trim smaller than this (dB) is none: the controller is not moved for a rounding */
const TRIM_LEAST = 0.3;
/** the most the expression controller takes off (dB): CC11 no lower than 80 */
const TRIM_MOST = 8;

/** the unasked shaping (dB) */
export const SHAPE = {
  /** per semitone above (below) the line's middle, at most `contourMost` either way */
  contour: 0.06,
  contourMost: 1,
  /** the bar's first beat, and its middle where the bar has four beats or more */
  downbeat: 0.7,
  strong: 0.3,
  /** per doubling of a note's length over the line's usual one, at most `longMost` either way */
  long: 0.4,
  longMost: 0.8,
  /** a chord's top note, and those under it */
  top: 0.5,
  inner: -0.3,
  /** each note's own unevenness (1σ) */
  uneven: 0.35,
  /** a held note's swell on a bowed or wind instrument, from `swellAt` s: its depth, at most `swellMost` */
  swellAt: 1.2,
  swell: 1,
  swellPerS: 0.75,
  swellMost: 2.5,
  /** an accent's size over the level (sf), and its fall inside a held note (s, a time constant) */
  accent: 5,
  accentFall: 0.15,
  /** a hairpin or a cresc. with no dynamic to arrive at */
  hairpin: 3,
} as const;

const lerp = (pts: readonly (readonly [number, number])[], x: number): number => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return pts[i - 1][1] + ((x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0])) * (pts[i][1] - pts[i - 1][1]);
  return pts[pts.length - 1][1];
};
/** an instrument's level at a velocity, dB against its fortissimo's */
const dbOf = (who: Player, v: number): number => {
  const c = LOUDNESS[who].map((y, i) => [VELS[i], y] as const);
  return lerp(c, v) - lerp(c, FF);
};
/** the velocity that gives a level on an instrument */
const velFor = (who: Player, db: number): number => {
  let lo = 1;
  let hi = 127;
  for (let k = 0; k < 24; k++) {
    const m = (lo + hi) / 2;
    if (dbOf(who, m) < db) lo = m;
    else hi = m;
  }
  return hi;
};
const levelOf = (mark: string): number | null => {
  const m = /^(ppp|pp|p|mp|mf|f|ff|fff)([+-])?$/.exec(mark);
  if (!m) return null;
  const i = ORDER.indexOf(m[1]);
  const next = m[2] === '+' ? LEVEL[ORDER[Math.min(ORDER.length - 1, i + 1)]] : m[2] === '-' ? LEVEL[ORDER[Math.max(0, i - 1)]] : LEVEL[m[1]];
  return LEVEL[m[1]] + (next - LEVEL[m[1]]) / 3;
};

interface Group {
  tick: number;
  marks: string[];
}

/** a line's marks, in time: "bar[:beat] mark …" */
export function readMarks(text: string, place: (bar: number, beat: number) => number): Group[] {
  const at = new Map<number, string[]>();
  let tick = -1;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    const m = /^(\d+)(?::(\d+(?:\.\d+)?))?$/.exec(w);
    if (m) tick = place(Number(m[1]), Number(m[2] ?? 1));
    else if (tick < 0) throw new Error(`a mark before any place: ${w}`);
    else if (levelOf(w) === null && !ACCENTS.has(w) && !['cresc', 'dim', '<', '>', '!'].includes(w)) throw new Error(`no such mark: ${w}`);
    else at.set(tick, [...(at.get(tick) ?? []), w]);
  }
  return [...at].sort((a, b) => a[0] - b[0]).map(([t, marks]) => ({ tick: t, marks }));
}

type Accent = { over: number } | { peak: number; to: number };

interface Timeline {
  /** the level at a tick (after any change written there) */
  level: (tick: number) => number;
  /** the accents on the notes begun at a tick: a sforzando, so much over the level there (which may be
   *  on its way up a crescendo); a fortepiano, the level it starts at and the one it falls to at once */
  accents: Map<number, Accent>;
}

/** A line's level in time from its marks. A dynamic holds until the next; cresc., dim. and hairpins run
 *  to the next dynamic where it lies their way (a hairpin ended by ! with a dynamic within a bar: most of
 *  the way to it), and by `hairpin` dB otherwise. */
export function timeline(groups: Group[], start: number, barTicks: number, endTick: number, S: typeof SHAPE): Timeline {
  const pts: [number, number][] = [[-1, start]];
  const accents = new Map<number, Accent>();
  let level = start;
  let pending: { from: number; l0: number; dir: 1 | -1; words: boolean } | null = null;
  const top = LEVEL.fff;
  const bottom = LEVEL.ppp;
  const clamp = (x: number) => Math.min(top, Math.max(bottom, x));
  const nextLevel = (i: number, within: number): number | null => {
    for (let j = i + 1; j < groups.length && groups[j].tick <= groups[i].tick + within; j++) {
      const a = groups[j].marks.map(levelOf).filter((x): x is number => x !== null);
      if (a.length) return a[a.length - 1];
    }
    return null;
  };
  groups.forEach((g, i) => {
    const T = g.tick;
    const abs = g.marks.map(levelOf).filter((x): x is number => x !== null).pop() ?? null;
    const begins = g.marks.filter((m) => m === '<' || m === '>' || m === 'cresc' || m === 'dim').pop();
    const ends = g.marks.includes('!');
    const fp = g.marks.find((m) => m === 'fp' || m === 'sfp');
    const sf = g.marks.find((m) => ACCENTS.has(m) && m !== 'fp' && m !== 'sfp');
    // (a cresc. said again while one runs is the same one)
    const again = pending && begins && pending.words && (begins === 'cresc' || begins === 'dim') && (begins === 'cresc' ? 1 : -1) === pending.dir && abs === null && !ends && !fp;
    if (pending && (abs !== null || ends || fp || (begins && !again))) {
      const p = pending;
      let reach: number;
      if (abs !== null && Math.sign(abs - p.l0) === p.dir) reach = abs;
      else {
        const ahead = abs === null ? nextLevel(i, barTicks) : null;
        reach = ahead !== null && Math.sign(ahead - p.l0) === p.dir ? p.l0 + 0.85 * (ahead - p.l0) : clamp(p.l0 + p.dir * S.hairpin);
        // (no louder than fortissimo, no softer than pianissimo, unless it began beyond them)
        reach = p.dir > 0 ? Math.min(reach, Math.max(p.l0, LEVEL.ff)) : Math.max(reach, Math.min(p.l0, LEVEL.pp));
      }
      pts.push([T, reach]);
      level = reach;
      pending = null;
    }
    if (sf) accents.set(T, { over: S.accent * (sf === 'sff' ? 1.3 : 1) });
    if (fp) {
      // begun forte (or an accent over a level already loud), piano at once
      const to = abs ?? LEVEL.p;
      accents.set(T, { peak: Math.max(LEVEL.f, level + 3), to });
      pts.push([T, level], [T, to]);
      level = to;
    } else if (abs !== null && abs !== level) {
      pts.push([T, level], [T, abs]);
      level = abs;
    }
    if (begins && !again) {
      pts.push([T, level]);
      pending = { from: T, l0: level, dir: begins === '<' || begins === 'cresc' ? 1 : -1, words: begins === 'cresc' || begins === 'dim' };
    }
  });
  if (pending) {
    const p = pending as { l0: number; dir: 1 | -1 };
    pts.push([endTick, clamp(p.l0 + p.dir * S.hairpin)]);
  }
  const level_ = (tick: number): number => {
    // the last point at or before the tick, and the next: a ramp between two, a step where two share a tick
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (pts[m][0] <= tick) lo = m;
      else hi = m - 1;
    }
    const a = pts[lo];
    const b = pts[lo + 1];
    return b && b[0] > a[0] ? a[1] + ((tick - a[0]) / (b[0] - a[0])) * (b[1] - a[1]) : a[1];
  };
  return { level: level_, accents };
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
/** a crescendo–diminuendo over [0, 1]: 0 at both ends, 1 in the middle */
const arch = (u: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, u)));

interface Note {
  on: SmfEvent;
  tick: number;
  end: number;
  midi: number;
}

export interface LineReport {
  line: number;
  player: Player;
  notes: number;
  vel: [number, number];
  cc11: [number, number] | null;
  ccEvents: number;
}

/** The file with its marks' dynamics: every named line's velocities set, its CC11 written (any it had is
 *  replaced). Nothing else of the file is touched. */
export function giveDynamics(bytes: Uint8Array, marks: ScoreMarks): { bytes: Uint8Array; report: LineReport[] } {
  const smf = readSmf(bytes);
  const lines = linesOf(smf);
  const bar = barOf(smf);
  if (bar.changes) throw new Error(`${marks.id}: the bar changes its length (bars are counted at one length)`);
  const S = { ...SHAPE, ...marks.shape } as typeof SHAPE;
  const pickup = Math.round((marks.pickup ?? 0) * smf.ppq);
  const place = (b: number, beat: number) => Math.round((b === 0 ? 0 : pickup + (b - 1) * bar.ticks) + (beat - 1) * smf.ppq);
  const sec = secondsOf(smf);
  let endTick = 0;
  for (const t of smf.tracks) for (const e of t) endTick = Math.max(endTick, e.tick);
  const barSeconds = sec(pickup + bar.ticks) - sec(pickup);
  const metre = Math.min(1, Math.max(0.5, barSeconds / 1.5));
  const report: LineReport[] = [];

  for (const [key, who] of Object.entries(marks.players)) {
    const li = Number(key);
    const { track, channel } = lines[li];
    const tr = smf.tracks[track];
    // the line's notes, paired on and off (first in, first out per pitch)
    const notes: Note[] = [];
    const open = new Map<number, Note[]>();
    for (const e of tr) {
      if ((e.bytes[0] & 15) !== channel) continue;
      if (isOn(e)) {
        const n = { on: e, tick: e.tick, end: endTick, midi: e.bytes[1] };
        notes.push(n);
        open.set(n.midi, [...(open.get(n.midi) ?? []), n]);
      } else if (isOff(e)) {
        const n = open.get(e.bytes[1])?.shift();
        if (n) n.end = Math.max(e.tick, n.tick + 1);
      }
    }
    if (!notes.length) continue;
    const groups = readMarks(`${marks.all ?? ''} ${marks.lines[li] ?? ''}`, place);
    const marked = timeline(groups, levelOf(marks.start ?? 'mf')!, bar.ticks, endTick, S);
    // (the piece's depth and the line's lift: every level and accent of the line alike)
    const placed = (db: number) => LEVEL.f + (marks.depth ?? 1) * (db - LEVEL.f) + (marks.lift?.[li] ?? 0);
    const tl: Timeline = {
      level: (tick) => placed(marked.level(tick)),
      accents: new Map([...marked.accents].map(([t, a]) => [t, 'over' in a ? { over: (marks.depth ?? 1) * a.over } : { peak: placed(a.peak), to: placed(a.to) }])),
    };
    /** the loudest an accent reaches: a little over fortississimo */
    const accentMost = placed(LEVEL.fff + 1);
    const struck = STRUCK.has(who);

    // the unasked shaping, per note
    const rnd = gauss(li + 1);
    const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
    const mid = sorted(notes.map((n) => n.midi))[notes.length >> 1];
    const usual = Math.max(0.05, sorted(notes.map((n) => sec(n.end) - sec(n.tick)))[notes.length >> 1]);
    const chordTop = new Map<number, number>();
    const chordSize = new Map<number, number>();
    for (const n of notes) {
      chordTop.set(n.tick, Math.max(chordTop.get(n.tick) ?? 0, n.midi));
      chordSize.set(n.tick, (chordSize.get(n.tick) ?? 0) + 1);
    }
    const own = notes.map((n) => {
      const len = sec(n.end) - sec(n.tick);
      const inBar = n.tick < pickup ? -1 : (n.tick - pickup) % bar.ticks;
      let o = Math.max(-S.contourMost, Math.min(S.contourMost, S.contour * (n.midi - mid)));
      o += Math.max(-S.longMost, Math.min(S.longMost, S.long * Math.log2(Math.max(0.02, len) / usual)));
      if (inBar === 0) o += S.downbeat * metre;
      else if (inBar * 2 === bar.ticks && bar.ticks >= 4 * smf.ppq) o += S.strong * metre;
      if (chordSize.get(n.tick)! > 1) o += n.midi === chordTop.get(n.tick) ? S.top : S.inner;
      o += S.uneven * rnd();
      return o;
    });

    // each note's level through its length, sampled every 30 ms or so
    const curveOf = (n: Note, k: number): { ticks: number[]; db: number[] } => {
      const t0 = sec(n.tick);
      const len = sec(n.end) - t0;
      const acc = tl.accents.get(n.tick);
      const steps = struck ? 0 : Math.min(400, Math.floor(len / 0.03));
      const ticks: number[] = [];
      const db: number[] = [];
      const l0 = tl.level(n.tick);
      const still = Math.abs(tl.level(n.end - 1) - l0) < 0.8;
      const depth = !struck && !acc && still && len >= S.swellAt && S.swell > 0 ? Math.min(S.swellMost, S.swell + S.swellPerS * (len - S.swellAt)) : 0;
      for (let s = 0; s <= steps; s++) {
        const tick = steps ? Math.round(n.tick + ((n.end - n.tick) * s) / (steps + 1)) : n.tick;
        const dt = sec(tick) - t0;
        let v = tl.level(tick) + own[k];
        if (acc) {
          // the accent over the level it falls to: at once on a fortepiano, by `accentFall` on a sforzando
          const fp = 'to' in acc;
          const base = fp ? acc.to : tl.level(tick);
          const peak = fp ? acc.peak : Math.min(accentMost, l0 + acc.over);
          v = base + own[k] + Math.max(0, peak - base) * (struck || len < 0.25 ? 1 : Math.exp(-dt / (fp ? S.accentFall / 2 : S.accentFall)));
        }
        if (depth) v += depth * (arch(dt / len) - 0.6);
        ticks.push(tick);
        db.push(v);
      }
      return { ticks, db };
    };

    // velocities, and the line's trim in time: a note that begins while another governs the trim is
    // given the velocity that, with the trim as it stands, makes its level
    const trim: [number, number][] = [];
    let covered = -1;
    /** an overlap shorter than this is a legato join, not a note under another */
    const join = Math.max(1, Math.round((0.06 / barSeconds) * bar.ticks));
    const softest = struck ? SOFTEST.struck : BOWED.has(who) ? SOFTEST.bowed : SOFTEST.wind;
    const trimAt = (tick: number): number => {
      for (let i = trim.length - 1; i >= 0; i--) if (trim[i][0] <= tick) return trim[i][1];
      return 0;
    };
    const order = notes.map((n, k) => ({ n, k })).sort((a, b) => a.n.tick - b.n.tick || b.n.midi - a.n.midi);
    let vLo = 127;
    let vHi = 0;
    for (const { n, k } of order) {
      const c = curveOf(n, k);
      const governed = n.tick < covered - join;
      if (!governed) while (trim.length && trim[trim.length - 1][0] >= n.tick) trim.pop();
      const want = governed ? c.db[0] - trimAt(n.tick) : Math.max(...c.db);
      const v = Math.round(Math.min(LOUDEST, Math.max(softest, struck || BOWED.has(who) ? velFor(who, want) : Math.max(lerp(TIMBRE, want), velFor(who, want)))));
      n.on.bytes[2] = v;
      vLo = Math.min(vLo, v);
      vHi = Math.max(vHi, v);
      if (struck) continue;
      const got = dbOf(who, v);
      for (let s = 0; s < c.ticks.length; s++) {
        if (governed && c.ticks[s] < covered) continue;
        const d = c.db[s] - got;
        trim.push([c.ticks[s], d > -TRIM_LEAST ? 0 : Math.max(-TRIM_MOST, d)]);
      }
      covered = Math.max(covered, n.end);
    }

    // the controller: the trim as CC11, set a moment before a note that follows a rest
    const cc: SmfEvent[] = [];
    let ccLo = 127;
    let ccHi = 0;
    if (!struck) {
      const lead = Math.max(1, Math.round((0.04 / barSeconds) * bar.ticks));
      const onsets = new Set(notes.map((n) => n.tick));
      const ends = sorted(notes.map((n) => n.end));
      let last = -1;
      let silentSince = 0;
      let e = 0;
      for (const [tick, db] of trim) {
        while (e < ends.length && ends[e] <= tick) silentSince = ends[e++];
        const value = Math.round(127 * 10 ** (db / 40));
        if (value === last) continue;
        // (a rest before this note: the gain is moved in it, not under the attack)
        const at = onsets.has(tick) && tick - silentSince > lead && !notes.some((n) => n.tick < tick && n.end > tick) ? tick - lead : tick;
        cc.push({ tick: Math.max(0, at), bytes: [0xb0 | channel, 11, value] });
        ccLo = Math.min(ccLo, value);
        ccHi = Math.max(ccHi, value);
        last = value;
      }
    }
    // the track again: its own events but any CC11 on this channel, the new ones before the notes of their tick
    const kept = tr.filter((e) => !(isCC(e, 11) && (e.bytes[0] & 15) === channel));
    const merged: SmfEvent[] = [];
    let j = 0;
    for (const e of kept) {
      while (j < cc.length && (cc[j].tick < e.tick || (cc[j].tick === e.tick && (isOn(e) || isEnd(e))))) merged.push(cc[j++]);
      merged.push(e);
    }
    while (j < cc.length) merged.splice(merged.length - 1, 0, cc[j++]);
    smf.tracks[track] = merged;
    report.push({ line: li, player: who, notes: notes.length, vel: [vLo, vHi], cc11: cc.length ? [ccLo, ccHi] : null, ccEvents: cc.length });
  }
  return { bytes: writeSmf(smf), report };
}

export const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

/** each line's velocities and CC11 as a file has them (the page's lines) */
export function rangesOf(bytes: Uint8Array): { line: number; notes: number; vel: [number, number]; distinct: number; cc11: [number, number] | null; ccEvents: number }[] {
  const smf: Smf = readSmf(bytes);
  return linesOf(smf).map(({ track, channel }, line) => {
    const mine = smf.tracks[track].filter((e) => (e.bytes[0] & 15) === channel && e.bytes[0] < 0xf0);
    const v = mine.filter(isOn).map((e) => e.bytes[2]);
    const c = mine.filter((e) => isCC(e, 11)).map((e) => e.bytes[2]);
    return { line, notes: v.length, vel: [Math.min(...v), Math.max(...v)], distinct: new Set(v).size, cc11: c.length ? [Math.min(...c), Math.max(...c)] : null, ccEvents: c.length };
  });
}
