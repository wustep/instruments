// Seeds: a piece that is set up and then left to play, with no end. Ten players in a room; each is given a
// seed (a phrase of one to five notes) and a loop of its own length to come back to it on, and the ten
// lengths share no period: what is heard together drifts, and never comes round again.
//
// What it is built on, and what was taken from each:
//
//   Brian Eno, "Generative Music" (a talk, San Francisco, 8 June 1996; In Motion Magazine) and Music for
//   Airports 2/1 (1978): a sung note to a tape loop, the loops "23 1/2 seconds, 25 7/8, 29 15/16", in
//   "cycles that are called incommensurable: they are not likely to come back into sync again"; a silence
//   at least twice as long as the sound; and "seeds", not "forests": a few rules and a little material
//   (here a word, the seed, and what it grows into). So: one phrase a player, a loop a player, the loops'
//   lengths with no common measure (LOOPS: whole hundredths of a second, no two sharing a factor), a phrase
//   under a third of its loop.
//   The 1996 talk's rules are "probabilistic… an envelope of possibilities", with "one very exotic harmony
//   that can only occur under particular conditions": the field's sixth note (`colour`), which only a
//   phrase's last note may take, now and then.
//   Steve Reich, "Music as a Gradual Process" (1968): the process is what is heard ("I want to be able to
//   hear the process happening"), it runs by itself once it is set up, and it moves like "a minute hand".
//   So nothing here is hidden: a phrase grows a note at a time each time its player comes back (`grow`),
//   the loops are steady enough to be heard slipping past each other, and the harmony moves one note at a
//   time over minutes.
//   Terry Riley, In C (1964) and its directions: every player has the same material and moves through it
//   at a pace of their own, never far from the others; they listen, drop out and come back in; a phrase may
//   be taken an octave away. So the harmony is a field every player takes up at their own next entry
//   (`lag`: nobody more than one field from anybody else), a player is away for about a fifth of the time
//   and sits out an entry now and then (`away`, `rest`), and the high players sometimes take theirs an
//   octave off (`octave`).
//   Eno, Discreet Music (1975): two melodic lines of different lengths and a system left to run, to be
//   heard "as part of the ambience". So it is quiet: every entry between pianissimo and mezzo-piano.
//
// And what the instruments here ask for, which a tape loop does not: these are players. A loop is when a
// player thinks of coming in, not a clock: each entry is a little early or late, a slow wander of its own
// (`wander`); a phrase is one breath or a bow or two, never longer than a player has (`breath`); it is
// taken at its own pace each time, begins soft, swells and dies away (the bow's speed and the breath:
// `dyn`; and what is left of the swell as expression, CC11); no two entries at the same strength.
//
// Everything is a function of the seed and the time, with no state: any stretch of it can be asked for
// (`events`), the same seed gives the same music, and the player (ui/player.ts) asks for half a minute at
// a time for as long as it plays.

import type { FileEvent, MidiLine, MidiSong } from '../midi-file.ts';
import type { Voice } from './assign.ts';

// ------------------------------------------------------------- chance, from the seed
/** a seed's number (FNV-1a over its characters) */
export function seedNumber(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** a number in [0, 1) for a seed and what is being decided (whole numbers: a player, an entry, which
 *  decision): the same asked twice, unlike for any neighbour */
function chance(seed: number, ...keys: number[]): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const k of keys) {
    h = Math.imul(h ^ (k | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  h = Math.imul(h ^ (h >>> 15), h | 1);
  h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}
const TAU = 2 * Math.PI;
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** 0 … 1 … 0 over [0, 1], smooth, its top at `peak` */
function arch(u: number, peak: number): number {
  const x = clamp(u, 0, 1);
  const v = x < peak ? x / peak : (1 - x) / (1 - peak);
  return v * v * (3 - 2 * v);
}

/** a seed as an address carries it: lower case, letters, digits and hyphens, 24 at most ('': none) */
export const cleanSeed = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '')
    .slice(0, 24);
/** a new seed, a word of three syllables that can be said ("kelumo": one of 1.7 million) */
export function newSeed(rnd: () => number = Math.random): string {
  const c = 'bdfghklmnprstvwz';
  const v = 'aeiou';
  let s = '';
  for (let i = 0; i < 3; i++) s += c[Math.floor(rnd() * c.length) % c.length] + v[Math.floor(rnd() * v.length) % v.length];
  return s;
}

// ------------------------------------------------------------- the harmony
/** A field: five notes every player draws from (pitch classes, C = 0), the two the bass may take (its
 *  root, its fifth), the three the cello may (its triad), and a sixth, the colour: the seventh over the
 *  root, or the ninth of the minor ones. Three collections (D E F♯ A B, G A B D E, C D E G A), each under
 *  its major root and its relative minor's; neighbours differ by one note or by none. */
interface Field {
  name: string;
  set: number[];
  low: number[];
  triad: number[];
  colour: number;
  /** the fields it may move to */
  next: number[];
}
export const FIELDS: Field[] = [
  { name: 'D', set: [2, 4, 6, 9, 11], low: [2, 9], triad: [2, 6, 9], colour: 1, next: [1, 2, 3] },
  { name: 'B minor', set: [2, 4, 6, 9, 11], low: [11, 6], triad: [11, 2, 6], colour: 1, next: [0, 2, 3] },
  { name: 'G', set: [7, 9, 11, 2, 4], low: [7, 2], triad: [7, 11, 2], colour: 6, next: [0, 1, 3, 4] },
  { name: 'E minor', set: [7, 9, 11, 2, 4], low: [4, 11], triad: [4, 7, 11], colour: 6, next: [0, 1, 2, 4, 5] },
  { name: 'C', set: [0, 2, 4, 7, 9], low: [0, 7], triad: [0, 4, 7], colour: 11, next: [2, 3, 5] },
  { name: 'A minor', set: [0, 2, 4, 7, 9], low: [9, 4], triad: [9, 0, 4], colour: 11, next: [3, 4] },
];
/** how long a field lasts, s: over two minutes, under four and a half */
const FIELD_S: [number, number] = [130, 260];

// ------------------------------------------------------------- the players
type Kind = 'breath' | 'bow' | 'ring';
interface Role {
  voice: Voice;
  name: string;
  /** General MIDI program (the line's, should it be routed by hand) */
  program: number;
  /** blown (one breath), bowed (a bow to a note) or left to ring (struck, plucked) */
  kind: Kind;
  /** its register here (MIDI), and the notes in it it is kept off (measured: scripts/seeds-check.ts) */
  lo: number;
  hi: number;
  avoid?: number[];
  /** which of a field's notes it takes */
  from: 'set' | 'triad' | 'low';
  /** notes in its phrase when grown, fewest and most; and how many it begins a stay with */
  notes: [number, number];
  first: number;
  /** a note's length, s (ring: from one note to the next) */
  len: [number, number];
  /** the longest phrase it has the breath for, s */
  breath?: number;
  /** its loop, s (what rings; a blown or bowed player's is counted from its phrase: WAYS.air) */
  loop?: [number, number];
  /** velocity, its softest entry and its loudest */
  vel: [number, number];
  /** the swell inside a phrase: velocity steps of bow or breath at its top (CC_DYNAMICS), and what the
   *  expression (CC11) stands under its top where the phrase begins and where it ends, dB */
  swell?: { dyn: number; in: number; out: number };
  /** its expression (CC11) at the top of a swell, or all the time on what rings, dB: what keeps the ten in
   *  balance (the flute's softest breath is 10 dB over a soft bow: measured, scripts/seeds-check.ts) */
  top: number;
  /** notes of its own that stand out of line with their neighbours at this dynamic, and by how much they
   *  are eased, dB on the expression (measured note by note, K-weighted, over 18 minutes: the viola's G4
   *  8 dB over its F♯4, the bass's D2 13 dB under its B1) */
  even?: Record<number, number>;
  /** how often its last note is the field's colour, and how often the phrase is an octave away */
  colour?: number;
  octave?: number;
}
/** the ten, in the score's order (the stage seats them by it: orchestra/seats.ts) */
export const ROLES: Role[] = [
  { voice: 'flute', name: 'Flute', program: 73, kind: 'breath', lo: 72, hi: 88, from: 'set', top: -15, notes: [2, 3], first: 1, len: [2.2, 3.4], breath: 8.5, vel: [50, 62], swell: { dyn: 6, in: 8, out: 14 }, colour: 0.14, octave: 0 },
  { voice: 'clarinet', name: 'Clarinet', program: 71, kind: 'breath', lo: 52, hi: 69, from: 'set', top: -6, even: { 69: -3 }, notes: [1, 3], first: 1, len: [2.6, 4], breath: 10.5, vel: [46, 58], swell: { dyn: 7, in: 9, out: 16 } },
  { voice: 'horn', name: 'Horn', program: 60, kind: 'breath', lo: 50, hi: 65, from: 'set', top: -10, even: { 50: 6, 52: 6, 55: 3 }, notes: [1, 2], first: 1, len: [3.4, 5], breath: 10, vel: [44, 58], swell: { dyn: 8, in: 8, out: 15 } },
  { voice: 'glockenspiel', name: 'Glockenspiel', program: 9, kind: 'ring', lo: 79, hi: 96, from: 'set', top: 0, notes: [1, 2], first: 1, len: [1.6, 3.2], loop: [37, 59], vel: [44, 62], colour: 0.18, octave: 0.2 },
  { voice: 'harp', name: 'Harp', program: 46, kind: 'ring', lo: 43, hi: 81, from: 'set', top: -4, notes: [3, 5], first: 2, len: [0.3, 0.62], loop: [19, 31], vel: [62, 84] },
  { voice: 'grand', name: 'Piano', program: 0, kind: 'ring', lo: 55, hi: 81, from: 'set', top: 0, notes: [2, 4], first: 1, len: [1.1, 2.3], loop: [17, 29], vel: [52, 72], colour: 0.1, octave: 0.12 },
  { voice: 'violin', name: 'Violin', program: 40, kind: 'bow', lo: 69, hi: 86, from: 'set', top: -6, even: { 86: -7 }, notes: [1, 2], first: 1, len: [4.4, 6.4], vel: [38, 50], swell: { dyn: 9, in: 9, out: 16 }, colour: 0.1, octave: 0 },
  { voice: 'viola', name: 'Viola', program: 41, kind: 'bow', lo: 60, hi: 72, from: 'set', top: -6, even: { 62: 3, 67: -7, 69: 4 }, notes: [1, 2], first: 1, len: [4.4, 6.4], vel: [38, 50], swell: { dyn: 9, in: 9, out: 16 } },
  { voice: 'cello', name: 'Cello', program: 42, kind: 'bow', lo: 38, hi: 57, from: 'triad', top: -3, even: { 42: -4, 43: -3, 48: -5 }, notes: [1, 2], first: 1, len: [4.8, 6.8], vel: [40, 52], swell: { dyn: 9, in: 9, out: 16 } },
  { voice: 'bass', name: 'Double Bass', program: 43, kind: 'bow', lo: 31, hi: 45, avoid: [42], from: 'low', top: -6, even: { 35: -4, 36: -2, 38: 6, 40: 2, 45: 4 }, notes: [1, 1], first: 1, len: [5.5, 8], vel: [44, 56], swell: { dyn: 8, in: 8, out: 14 } },
];
export const SEEDS_VOICES: Voice[] = ROLES.map((r) => r.voice);

/** the players' ways, each a share or a time */
export const WAYS = {
  /** a blown or bowed player's loop is this many times its phrase, at least and at most (Eno: "a silence at
   *  least twice as long as the sound"), and no loop is shorter or longer than these, s */
  air: [3, 3.2] as [number, number],
  loop: [17, 49] as [number, number],
  /** how far an entry strays from its loop, s: a slow wander over its entries, and each one's own */
  wander: 0.55,
  jitter: 0.12,
  /** a phrase's pace, × (each entry its own), and each note's own length, ± */
  pace: [0.9, 1.14] as [number, number],
  note: 0.1,
  /** a bow lifted between two notes: how long, s, and how often */
  lift: [0.5, 1.3] as [number, number],
  lifted: 0.34,
  /** a stay and the time away after it, s; the share of it away */
  stay: [190, 430] as [number, number],
  away: 0.13,
  /** how often an entry is sat out, listening */
  rest: 0.05,
  /** entries between one note of a phrase and the next as it grows */
  grow: [1, 2] as [number, number],
  /** how long after the field has moved a player takes it up, at most, s */
  lag: 34,
  /** listening: when nothing has sounded for this long, s (each time its own), a player who is here and
   *  free of their own loop comes in with their phrase (In C: "listen very carefully to one another");
   *  free: as far as this from their own last entry's end and their next one's beginning, s */
  quiet: [7, 10] as [number, number],
  free: [9, 4] as [number, number],
  /** the players come in one at a time: the first at once, then each this long after the last, s */
  enter: [5, 12] as [number, number],
} as const;

/** one player of a seed: what it was given */
export interface SeedPlayer {
  role: Role;
  line: number;
  /** its loop, s (a whole number of hundredths) */
  loop: number;
  /** its first entry, s */
  first: number;
  /** its phrase: steps through the field's notes in its register, from the first note */
  gesture: number[];
  /** where in its register the phrase sits (0 low … 1 high) */
  anchor: number;
  /** a note's length when the pace is 1, s */
  len: number;
  /** a stay and its time away, s */
  stay: number;
  grow: number;
  lag: number;
  /** its phrase at its longest, s */
  longest: number;
}

export interface SeedsSystem {
  seed: string;
  players: SeedPlayer[];
  /** the field at a time: which of FIELDS, and when it began */
  fieldAt(t: number): { field: number; from: number };
  /** the loops come round together after this long, years (were every entry on its loop's instant) */
  years: number;
}

function gestureOf(h: number, i: number, role: Role, n: number): number[] {
  if (role.from === 'low') return [0];
  const g = [0];
  // the harp's is an arpeggio (one way, mostly up); the others step and turn
  const up = chance(h, i, 20) < (role.voice === 'harp' ? 0.75 : 0.55) ? 1 : -1;
  for (let k = 1; k < n; k++) {
    const u = chance(h, i, 21, k);
    let step: number;
    if (role.voice === 'harp') step = up * (u < 0.7 ? 1 : 2);
    else if (role.from === 'triad') step = k === 1 ? up : -up;
    else step = (k === 1 ? up : u < 0.5 ? up : -up) * (chance(h, i, 22, k) < 0.68 ? 1 : 2);
    let next = g[k - 1] + step;
    // (never the note before, and a phrase within four steps of where it began)
    if (role.voice !== 'harp' && Math.abs(next) > 3) next = g[k - 1] - step;
    if (g.includes(next) && role.voice !== 'harp' && k >= 2 && chance(h, i, 23, k) < 0.5) next = g[k - 1] + (step > 0 ? -1 : 1) * (Math.abs(step) === 1 ? 2 : 1);
    if (next === g[k - 1]) next += up;
    g.push(next);
  }
  return g;
}

/** what a seed grows into: the players, their loops and phrases, and the walk of the harmony */
export function seedsSystem(seed: string): SeedsSystem {
  const h = seedNumber(seed);
  // the order they come in: anyone may begin but the glockenspiel (a bell alone says little)
  const order = ROLES.map((_, i) => i).sort((a, b) => chance(h, a, 1) - chance(h, b, 1));
  if (ROLES[order[0]].voice === 'glockenspiel') order.push(order.shift()!);
  const firsts: number[] = [];
  let t = 0.4;
  order.forEach((i, k) => {
    firsts[i] = t;
    t += lerp(WAYS.enter[0], WAYS.enter[1], chance(h, i, 2)) * (k === 0 ? 0.75 : 1);
  });
  const taken: number[] = [];
  const players = ROLES.map((role, i): SeedPlayer => {
    const n = role.notes[0] + Math.floor(chance(h, i, 3) * (role.notes[1] - role.notes[0] + 1));
    let len = lerp(role.len[0], role.len[1], chance(h, i, 4));
    // its phrase when grown, at its longest (the slowest pace, every note at its longest, a bow lifted
    // between two notes), a blown one within the breath; a ringing one counted to its last stroke
    const longest = (l: number) => (role.kind === 'ring' ? n * l : (n + 0.25) * l * WAYS.pace[1] * (1 + WAYS.note) + (role.kind === 'bow' ? (n - 1) * WAYS.lift[1] : 0));
    // (and no longer than a third of the longest loop there is)
    const room = Math.min(role.breath ?? Infinity, role.kind === 'ring' ? Infinity : WAYS.loop[1] / WAYS.air[0]);
    if (longest(len) > room) len = (room - longest(0)) / (longest(1) - longest(0));
    const phrase = longest(len);
    // its loop: three phrases and more of a blown or bowed player's (what rings has its own range), a
    // whole number of hundredths of a second that shares no factor with any loop given out before it
    const [least, most] = role.loop ?? [clamp(WAYS.air[0] * phrase, WAYS.loop[0], WAYS.loop[1]), clamp(WAYS.air[1] * phrase, WAYS.loop[0], WAYS.loop[1])];
    let cs = Math.round(lerp(least, most, chance(h, i, 5)) * 100);
    while (taken.some((x) => gcd(x, cs) !== 1)) cs++;
    taken.push(cs);
    return {
      role,
      line: i,
      loop: cs / 100,
      first: firsts[i],
      gesture: gestureOf(h, i, role, n),
      anchor: chance(h, i, 6),
      len,
      stay: lerp(WAYS.stay[0], WAYS.stay[1], chance(h, i, 7)),
      grow: WAYS.grow[0] + Math.floor(chance(h, i, 8) * (WAYS.grow[1] - WAYS.grow[0] + 1)),
      lag: WAYS.lag * chance(h, i, 9),
      longest: phrase,
    };
  });
  // the harmony's walk: where it begins (never on the flat side: C comes later), then to a neighbour,
  // not straight back
  const walk: { field: number; from: number }[] = [{ field: Math.floor(chance(h, 100) * 4), from: 0 }];
  const fieldAt = (time: number) => {
    for (;;) {
      const last = walk[walk.length - 1];
      const k = walk.length;
      const end = last.from + lerp(FIELD_S[0], FIELD_S[1], chance(h, 101, k));
      if (end > time) break;
      const prev = walk[k - 2]?.field ?? -1;
      const to = FIELDS[last.field].next.filter((f) => f !== prev);
      walk.push({ field: to[Math.floor(chance(h, 102, k) * to.length)], from: end });
    }
    let i = walk.length - 1;
    while (i > 0 && walk[i].from > time) i--;
    return walk[i];
  };
  let years = 1 / (100 * 3600 * 24 * 365.25);
  for (const p of players) years *= Math.round(p.loop * 100);
  return { seed, players, fieldAt, years };
}

/** the notes of a field a role may take, low to high (the bass's: its root's before its fifth's) */
export function fieldNotes(field: number, role: Role): number[] {
  const f = FIELDS[field];
  const pcs = role.from === 'set' ? f.set : role.from === 'triad' ? f.triad : f.low;
  const out: number[] = [];
  for (let m = role.lo; m <= role.hi; m++) if (pcs.includes(m % 12) && !role.avoid?.includes(m)) out.push(m);
  if (role.from === 'low') out.sort((a, b) => pcs.indexOf(a % 12) - pcs.indexOf(b % 12) || a - b);
  return out;
}

/** one entry of a player: what it plays, or null (away, or sitting it out) */
export interface Entry {
  /** when it begins, s */
  t: number;
  /** when its last note is let go */
  end: number;
  field: number;
  notes: { t: number; end: number; midi: number; vel: number }[];
}

/** when a player's entry `n` would begin were it on its loop's instant, and when it does */
const nominal = (p: SeedPlayer, n: number) => p.first + n * p.loop;
function entryTime(h: number, p: SeedPlayer, n: number): number {
  if (n === 0) return p.first;
  const i = p.line;
  const slow = Math.sin((TAU * n) / 7.3 + TAU * chance(h, i, 30)) * 0.6 + Math.sin((TAU * n) / 3.1 + TAU * chance(h, i, 31)) * 0.4;
  return nominal(p, n) + WAYS.wander * slow + WAYS.jitter * (2 * chance(h, i, 32, n) - 1);
}

/** is a player here at a time (a stay, then a time away), and which stay is it? */
function stayAt(p: SeedPlayer, t: number): { here: boolean; s: number } {
  const s = Math.floor((t - p.first) / p.stay);
  return { here: t >= p.first && (t - p.first) / p.stay - s < 1 - WAYS.away, s };
}

/** entry `n` of a player on its loop (pure: the seed, the player, the entry): what it plays, or null
 *  (away, or sitting it out) */
export function entryOf(sys: SeedsSystem, p: SeedPlayer, n: number): Entry | null {
  const h = seedNumber(sys.seed);
  const T0 = nominal(p, n);
  // here, or away? Back from a time away, the phrase begins again from its first notes
  const { here, s } = stayAt(p, T0);
  if (!here) return null;
  const since = n - Math.ceil((s * p.stay) / p.loop - 1e-9);
  if (since > 0 && chance(h, p.line, 40, n) < WAYS.rest) return null;
  return phraseOf(sys, p, n, entryTime(h, p, n), T0, since);
}

/** a player's phrase begun at `T`: `n` says which of its ways this time is (an entry of its loop, or a
 *  number of its own for one that fills a silence), `T0` the time its field is read at, `since` how many
 *  entries it has been back */
function phraseOf(sys: SeedsSystem, p: SeedPlayer, n: number, T: number, T0: number, since: number): Entry | null {
  const h = seedNumber(sys.seed);
  const i = p.line;
  const role = p.role;
  const field = sys.fieldAt(Math.max(0, T0 - p.lag)).field;
  const scale = fieldNotes(field, role);
  if (!scale.length) return null;
  const full = p.gesture.length;
  const k = Math.min(full, role.first + Math.floor(since / p.grow));
  // the notes: the phrase's steps from where it sits in the register, moved to lie inside it
  let idx: number[];
  if (role.from === 'low') {
    // (the bass: its root, the fifth one entry in four, never the fifth to begin a stay)
    const fifth = since > 0 && chance(h, i, 41, n) < 0.27;
    const roots = scale.filter((m) => m % 12 === FIELDS[field].low[0]);
    const fifths = scale.filter((m) => m % 12 === FIELDS[field].low[1]);
    const pick = fifth && fifths.length ? fifths : roots.length ? roots : scale;
    idx = [scale.indexOf(pick[Math.floor(p.anchor * pick.length) % pick.length])];
  } else {
    const g = p.gesture.slice(0, k);
    const lo = Math.min(...p.gesture);
    const hi = Math.max(...p.gesture);
    const room = Math.max(0, scale.length - 1 - (hi - lo));
    // (and moved a step up or down for a few entries at a time, as a player tries a phrase elsewhere)
    const turn = [0, 0, 1, 0, -1, 0][Math.floor(chance(h, i, 45, Math.floor(n / (3 + (i % 2)))) * 6)];
    const base = clamp(Math.round(p.anchor * room) + (since > 0 ? turn : 0), 0, room) - lo;
    idx = g.map((x) => clamp(base + x, 0, scale.length - 1));
  }
  let midi = idx.map((x) => scale[x]);
  // (a register too narrow for the phrase folds it: no note twice running)
  for (let j = 1; j < midi.length; j++)
    if (midi[j] === midi[j - 1]) {
      const at = scale.indexOf(midi[j]);
      midi[j] = scale[at + 1 < scale.length && (j < 2 || scale[at + 1] !== midi[j - 2]) ? at + 1 : Math.max(0, at - 1)];
    }
  // the colour: the phrase's last note, now and then, on the field's sixth note nearest it
  if (role.colour && since > 0 && chance(h, i, 42, n) < role.colour) {
    const c = FIELDS[field].colour;
    const last = midi[midi.length - 1];
    let best = -1;
    for (let m = role.lo; m <= role.hi; m++) if (m % 12 === c && !role.avoid?.includes(m) && !midi.includes(m) && (best < 0 || Math.abs(m - last) < Math.abs(best - last))) best = m;
    if (best >= 0) midi[midi.length - 1] = best;
  }
  // an octave away (In C: "transposed by octaves"), where the instrument has it
  if (role.octave && since > 0 && chance(h, i, 43, n) < role.octave) {
    const by = chance(h, i, 44, n) < 0.5 ? 12 : -12;
    // (the bars go on up; the piano only down: over C6 a soft key of this piano is 10–20 dB under its middle)
    const reach = role.voice === 'glockenspiel' ? [79, 103] : role.voice === 'grand' ? [role.lo - 12, role.hi] : [role.lo - 12, role.hi + 12];
    const moved = midi.map((m) => m + by);
    if (moved.every((m) => m >= reach[0] && m <= reach[1] && !role.avoid?.includes(m))) midi = moved;
  }
  // how hard: each player's level wanders over its entries, each entry its own; a stay begins softer
  const level = clamp(0.5 + 0.34 * Math.sin((TAU * n) / 5.3 + TAU * chance(h, i, 50)) + 0.3 * (chance(h, i, 51, n) - 0.5) - (since === 0 ? 0.25 : 0), 0, 1);
  const vel0 = lerp(role.vel[0], role.vel[1], level);
  const pace = lerp(WAYS.pace[0], WAYS.pace[1], chance(h, i, 52, n));
  const notes: Entry['notes'] = [];
  let t = T;
  if (role.kind === 'ring') {
    // struck or plucked: from one note to the next a little unevenly, easing towards the last; each key
    // let go soon (the harp's strings and the bars ring on; the piano's are held by its pedal)
    midi.forEach((m, j) => {
      const shape = role.voice === 'harp' ? -2 + 4 * (j / Math.max(1, midi.length - 1)) : j === midi.length - 1 && midi.length > 1 ? -3 : 0;
      const vel = Math.round(clamp(vel0 + shape + 5 * (chance(h, i, 53, n, j) - 0.5), 1, 127));
      const hold = role.voice === 'grand' ? p.len * pace * 0.9 : 0.6;
      notes.push({ t, end: t + hold, midi: m, vel });
      t += p.len * pace * (1 + 0.16 * (chance(h, i, 54, n, j) - 0.5)) * (1 + 0.12 * (j / Math.max(1, midi.length - 1)));
    });
  } else {
    // blown or bowed: each note its own length, the last the longest; slurred or joined, or (a bow, one
    // time in three) lifted between two notes
    const lifted = role.kind === 'bow' && chance(h, i, 55, n) < WAYS.lifted;
    const slur = role.kind === 'breath' && chance(h, i, 56, n) < 0.7;
    let lens = midi.map((_, j) => p.len * pace * (1 + 2 * WAYS.note * (chance(h, i, 57, n, j) - 0.5)) * (j === midi.length - 1 ? 1.25 : 1));
    const total = lens.reduce((a, b) => a + b, 0);
    if (role.breath && total > role.breath) lens = lens.map((x) => (x * role.breath!) / total);
    midi.forEach((m, j) => {
      const vel = Math.round(clamp(vel0 + (j ? 3 * (chance(h, i, 53, n, j) - 0.5) : 0), 1, 127));
      const lastOne = j === midi.length - 1;
      // (a slur: the next note begun under the end of this one; else each ends where the next begins)
      notes.push({ t, end: t + lens[j] + (slur && !lastOne ? 0.03 : 0), midi: m, vel });
      t += lens[j] + (lifted && !lastOne ? lerp(WAYS.lift[0], WAYS.lift[1], chance(h, i, 58, n, j)) : 0);
    });
  }
  return { t: T, end: Math.max(...notes.map((x) => x.end)), field, notes };
}

/** the events of one entry: its notes, a piano's pedal, a swell's steps */
function entryEvents(sys: SeedsSystem, p: SeedPlayer, n: number, e: Entry, until: number): FileEvent[] {
  const h = seedNumber(sys.seed);
  const i = p.line;
  const role = p.role;
  const out: FileEvent[] = [];
  const sw = role.swell;
  if (sw) {
    // one swell over the phrase: the expression from under its top, up, and away to nothing much; the
    // bow or the breath with it. Its top earlier or later each time.
    const peak = lerp(0.3, 0.58, chance(h, i, 60, n));
    const deep = lerp(0.75, 1.1, chance(h, i, 61, n));
    const T = e.end - e.t;
    // (in steps of a tenth of a second, or as many as keep each under a decibel: a short phrase's fall is steep)
    const steps = Math.max(6, Math.ceil(T / 0.1), Math.ceil((1.5 * deep * Math.max(sw.in / peak, sw.out / (1 - peak))) / 0.9));
    // (the note sounding at a time: each has its own place in the balance, `even`)
    const at = (t: number) => {
      let m = e.notes[0].midi;
      for (const x of e.notes) if (x.t <= t + 1e-9) m = x.midi;
      return m;
    };
    const cc = (u: number) => {
      const dB = Math.min(0, role.top + (role.even?.[at(e.t + u * T)] ?? 0)) - (u < peak ? sw.in : sw.out) * deep * (1 - arch(u, peak));
      // (as a file would carry it: a whole step of 127, General MIDI's 40·log10)
      return Math.round(127 * Math.pow(10, dB / 40)) / 127;
    };
    out.push({ t: e.t - 0.05, kind: 'cc', cc: 11, value: cc(0), line: i });
    let lastCc = cc(0);
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      const t = e.t + u * T;
      const v = cc(u);
      if (v !== lastCc) out.push({ t, kind: 'cc', cc: 11, value: (lastCc = v), line: i });
      out.push({ t, kind: 'dyn', value: s === steps ? 0 : +(sw.dyn * deep * arch(u, peak) ** 1.3).toFixed(2), line: i });
    }
  }
  // (what rings: its place in the balance, said once an entry)
  else if (role.top) out.push({ t: e.t - 0.05, kind: 'cc', cc: 11, value: Math.round(127 * Math.pow(10, role.top / 40)) / 127, line: i });
  if (role.voice === 'grand') {
    // the pedal under the whole phrase, lifted when it has rung a while
    const ring = lerp(4.5, 7.5, chance(h, i, 62, n));
    out.push({ t: e.t - 0.08, kind: 'pedal', cc: 64, value: 1, line: i });
    out.push({ t: Math.min(until, e.end + ring), kind: 'pedal', cc: 64, value: 0, line: i });
  }
  for (const x of e.notes) {
    out.push({ t: x.t, kind: 'on', midi: x.midi, vel: x.vel, line: i });
    out.push({ t: x.end, kind: 'off', midi: x.midi, line: i });
  }
  return out;
}

const RANK: Record<FileEvent['kind'], number> = { off: 0, pedal: 1, cc: 1, dyn: 1, on: 2 };

/** an entry as it is played: whose, which (`n`: its loop's entry, or FILL and over for one that fills a
 *  silence), and what */
export interface Played {
  p: SeedPlayer;
  n: number;
  fill: boolean;
  e: Entry;
}
const FILL = 1 << 28;
/** when an entry's sound is over, as the others hear it: a held note's end; what rings, a while after its
 *  last stroke */
const soundEnd = (x: { p: SeedPlayer; e: Entry }): number => (x.p.role.kind === 'ring' ? x.e.notes[x.e.notes.length - 1].t + 4 : x.e.end);
/** how far back the listening is worked out from, s: well past the longest silence the loops leave and
 *  the longest entry, so that any stretch asked for hears what came before it as the whole would */
const HEARD = 120;

/** Every entry begun from `from` to `to`, s, in the order they begin: the loops' own, and between them
 *  the ones that fill a silence (WAYS.quiet). Pure: any stretch, asked for in any pieces. */
export function entriesBetween(sys: SeedsSystem, from: number, to: number): Played[] {
  const h = seedNumber(sys.seed);
  const a = from - HEARD;
  const b = to + 60;
  const own: Played[] = [];
  for (const p of sys.players) {
    const n0 = Math.max(0, Math.floor((a - p.first - 1) / p.loop) - 1);
    const n1 = Math.ceil((b - p.first + 1) / p.loop);
    for (let n = n0; n <= n1; n++) {
      const e = entryOf(sys, p, n);
      if (e) own.push({ p, n, fill: false, e });
    }
  }
  own.sort((x, y) => x.e.t - y.e.t || x.p.line - y.p.line);
  /** is a player free at `t`: here, come in already, and clear of their own loop's entries either side */
  const free = (p: SeedPlayer, t: number): boolean => {
    if (t < p.first + 1 || !stayAt(p, t).here) return false;
    const n = Math.round((t - p.first) / p.loop);
    for (let k = Math.max(0, n - 1); k <= n + 1; k++) {
      const e = entryOf(sys, p, k);
      if (e && t > e.t - WAYS.free[1] - p.longest && t < soundEnd({ p, e }) + WAYS.free[0]) return false;
    }
    return true;
  };
  const out: Played[] = [];
  // (nothing is filled before the first sound of all, nor at the very start of what is worked out)
  let end = Math.max(a, 0);
  let begun = a <= 0 ? false : true;
  for (const c of own) {
    if (c.e.t < a) {
      end = Math.max(end, soundEnd(c));
      continue;
    }
    while (begun) {
      // the silence has lasted its 7 to 10 s (each silence its own), and the next entry is not about to come
      const t = end + lerp(WAYS.quiet[0], WAYS.quiet[1], chance(h, 300, Math.round(end * 100)));
      if (t > c.e.t - 1.5) break;
      const key = Math.round(t * 10);
      const who = sys.players.filter((p) => free(p, t)).sort((x, y) => chance(h, 301, x.line, key) - chance(h, 301, y.line, key))[0];
      const e = who ? phraseOf(sys, who, FILL + key, t, t, 99) : null;
      if (!who || !e) break;
      const f = { p: who, n: FILL + key, fill: true, e };
      out.push(f);
      end = Math.max(end, soundEnd(f));
    }
    out.push(c);
    begun = true;
    end = Math.max(end, soundEnd(c));
  }
  return out.filter((x) => x.e.t >= from && x.e.t < to);
}

/** A seed's events from `from` (included) to `to` (not), s, in order. Any stretch, asked for in any
 *  pieces: the stretches of a time laid end to end are that time's events. */
export function seedsEvents(sys: SeedsSystem, from: number, to: number): FileEvent[] {
  const all: { e: FileEvent; line: number; n: number; k: number }[] = [];
  // (an entry and what it leaves ringing are over within half a minute of its beginning)
  const played = entriesBetween(sys, from - 30, to + 1);
  for (const x of played) {
    // a piano's pedal is up before its player's next entry puts it down
    let until = Infinity;
    if (x.p.role.voice === 'grand') for (const y of played) if (y.p === x.p && y.e.t > x.e.t) until = Math.min(until, y.e.t - 0.6);
    entryEvents(sys, x.p, x.n, x.e, Math.min(until, x.e.t + x.p.loop - 2.5)).forEach((ev, k) => {
      if (ev.t >= from && ev.t < to) all.push({ e: ev, line: x.p.line, n: x.n, k });
    });
  }
  all.sort((a, b) => a.e.t - b.e.t || RANK[a.e.kind] - RANK[b.e.kind] || a.line - b.line || a.n - b.n || a.k - b.k);
  return all.map((x) => x.e);
}

/** the ten lines, as a file's would be described (orchestra/assign.ts places them by these) */
export function seedsLines(): MidiLine[] {
  return ROLES.map((r, i) => {
    const pcs = new Array<number>(12).fill(0);
    for (const f of FIELDS) for (const pc of r.from === 'set' ? f.set : r.from === 'triad' ? f.triad : f.low) pcs[pc]++;
    return { track: i + 1, channel: i < 9 ? i : i + 1, name: r.name, instrument: '', program: r.program, notes: 400, lo: r.lo, hi: r.hi, median: Math.round((r.lo + r.hi) / 2), poly: r.kind === 'ring' ? 4 : 1, core: [r.lo, r.hi], pcs };
  });
}

/** Seeds for a seed, as the player plays it: no events of its own and no end; it is asked for them */
export function seedsSong(seed: string): MidiSong {
  const sys = seedsSystem(seed);
  return { events: [], duration: Infinity, lines: seedsLines(), stream: { seed, events: (from, to) => seedsEvents(sys, from, to) } };
}

/** a stretch of it as a file would hold it (to measure and to render): from `from` for `seconds`, the
 *  notes still sounding at its end let go there, the pedal lifted */
export function seedsExcerpt(seed: string, seconds: number, from = 0): MidiSong {
  const sys = seedsSystem(seed);
  const events = seedsEvents(sys, from, from + seconds).map((e) => ({ ...e, t: Math.max(0, e.t - from) }));
  const open = new Map<string, number>();
  for (const e of events) {
    if (e.kind !== 'on' && e.kind !== 'off') continue;
    const k = `${e.line}:${e.midi}`;
    open.set(k, (open.get(k) ?? 0) + (e.kind === 'on' ? 1 : -1));
  }
  for (const [k, n] of open) {
    const [line, midi] = k.split(':').map(Number);
    for (let j = 0; j < n; j++) events.push({ t: seconds, kind: 'off', midi, line });
  }
  ROLES.forEach((r, i) => r.voice === 'grand' && events.push({ t: seconds, kind: 'pedal', cc: 64, value: 0, line: i }));
  // (it says what it is, so that nothing phrases it again: expression.ts is for files with no dynamics)
  return { events, duration: seconds, lines: seedsLines(), stream: { seed, events: (a, b) => seedsEvents(sys, a, b) } };
}
