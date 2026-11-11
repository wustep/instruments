// What is sounding, in words: the top band's readout. One note is its name and its frequency; several are
// named together (never one of them as if it were the whole chord), with the chord they make where they make
// one; many are counted, with their span. An ensemble says how many of its parts are sounding. Pure: the
// stage (views/stage.ts) gathers the notes and writes what this returns.

/** pitch classes as a score would most often spell them (one spelling each: the readout has no key) */
const PC = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export const pcName = (midi: number): string => PC[((midi % 12) + 12) % 12];
export const noteName = (midi: number): string => `${pcName(midi)}${Math.floor(midi / 12) - 1}`;
/** equal temperament, A4 = 440 Hz (an instrument's own tuning, a piano's stretch, is the caller's) */
export const etHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** chords by their intervals above the root, the plainest first (a tie goes to the earlier) */
const CHORDS: [number[], string][] = [
  [[0, 4, 7], ''],
  [[0, 3, 7], 'm'],
  [[0, 4, 7, 10], '7'],
  [[0, 4, 7, 11], 'maj7'],
  [[0, 3, 7, 10], 'm7'],
  [[0, 3, 6], 'dim'],
  [[0, 4, 8], 'aug'],
  [[0, 3, 6, 9], 'dim7'],
  [[0, 3, 6, 10], 'm7♭5'],
  [[0, 3, 7, 11], 'm(maj7)'],
  [[0, 5, 7], 'sus4'],
  [[0, 2, 7], 'sus2'],
  [[0, 4, 7, 9], '6'],
  [[0, 3, 7, 9], 'm6'],
  [[0, 2, 4, 7], 'add9'],
  [[0, 2, 3, 7], 'm(add9)'],
  [[0, 2, 4, 7, 10], '9'],
  [[0, 2, 4, 7, 11], 'maj9'],
  [[0, 2, 3, 7, 10], 'm9'],
  [[0, 1, 4, 7, 10], '7♭9'],
  // the fifth left out, as a pianist's left hand and a string trio often leave it
  [[0, 4, 10], '7'],
  [[0, 4, 11], 'maj7'],
  [[0, 3, 10], 'm7'],
];

const INTERVALS = ['octave', 'minor second', 'major second', 'minor third', 'major third', 'fourth', 'tritone', 'fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh'];

/** the notes, lowest first, each once */
const tidy = (midis: Iterable<number>): number[] => [...new Set(midis)].filter((m) => Number.isFinite(m)).sort((a, b) => a - b);

const LETTERS = 'CDEFGAB';
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
/** the scale degree an interval above the root is written on (a minor third is a third: B♭'s is D♭, not C♯) */
const DEGREE = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

/** a chord's notes as the chord spells them, by pitch class (a double accidental: the plain spelling) */
function spelling(root: number, intervals: number[], quality: string): Map<number, string> {
  const at = LETTERS.indexOf(PC[root][0]);
  const out = new Map<number, string>([[root, PC[root]]]);
  for (const iv of intervals) {
    if (!iv) continue;
    const pc = (root + iv) % 12;
    // (an augmented chord's top note is its fifth, raised)
    const letter = (at + (quality === 'aug' && iv === 8 ? 4 : DEGREE[iv])) % 7;
    const acc = ((pc - NATURAL[letter] + 18) % 12) - 6;
    out.set(pc, Math.abs(acc) > 1 ? PC[pc] : `${LETTERS[letter]}${acc > 0 ? '♯' : acc < 0 ? '♭' : ''}`);
  }
  return out;
}

interface Chord {
  name: string;
  /** each of its pitch classes as it spells it */
  spell: Map<number, string>;
}

function chordOf(ns: number[]): Chord | null {
  if (!ns.length) return null;
  const bass = ((ns[0] % 12) + 12) % 12;
  const pcs = new Set(ns.map((m) => ((m % 12) + 12) % 12));
  if (pcs.size < 3) return null;
  let best: { score: number; root: number; i: number } | null = null;
  for (const root of pcs) {
    const rel = [...pcs].map((p) => (p - root + 12) % 12).sort((a, b) => a - b);
    const i = CHORDS.findIndex(([iv]) => iv.length === rel.length && iv.every((x, k) => x === rel[k]));
    if (i < 0) continue;
    // (a root in the bass outweighs any plainer chord over another bass)
    const score = i + (root === bass ? 0 : CHORDS.length);
    if (!best || score < best.score) best = { score, root, i };
  }
  if (!best) return null;
  const [intervals, quality] = CHORDS[best.i];
  const spell = spelling(best.root, intervals, quality);
  return { name: `${PC[best.root]}${quality}${best.root === bass ? '' : `/${spell.get(bass) ?? PC[bass]}`}`, spell };
}

/**
 * The chord some notes make ("Cmaj7", "Am", "C/E" over another bass), or null where they make none this
 * knows (fewer than three pitch classes, a cluster). Octaves do not matter; the lowest note is the bass.
 * Where two roots fit (C6 and Am7 are the same notes) the one in the bass is named, then the plainer chord.
 */
export function chordName(midis: Iterable<number>): string | null {
  return chordOf(tidy(midis))?.name ?? null;
}

/** the interval between two notes, as a player would say it ("major third"; past an octave, "tenth" is not
 *  attempted: "major third + octave") */
export function intervalName(lo: number, hi: number): string {
  const d = Math.abs(hi - lo);
  if (d === 0) return 'unison';
  const oct = Math.floor(d / 12);
  const r = d % 12;
  if (r === 0) return oct === 1 ? 'octave' : `${oct} octaves`;
  return oct ? `${INTERVALS[r]} + ${oct === 1 ? 'octave' : `${oct} octaves`}` : INTERVALS[r];
}

export interface Readout {
  /** the large line: a note, a few notes, a chord, a count */
  head: string;
  /** the small line under it: a frequency, the chord's name, how many and from where to where */
  sub: string;
  /** how large the head is set: 1 (one note) … 4 (the longest) */
  size: 1 | 2 | 3 | 4;
  /** how many notes */
  count: number;
}

export interface ReadoutOpts {
  /** a note's frequency as the instrument plays it (default: equal temperament) */
  hz?: (midi: number) => number;
  /** an ensemble: how many of its parts are sounding */
  parts?: number;
}

/** as many notes as are named one by one (more are a chord's name, or a count) */
export const NAMED = 4;

const sizeOf = (head: string): Readout['size'] => (head.length <= 3 ? 1 : head.length <= 7 ? 2 : head.length <= 11 ? 3 : 4);
const hzText = (f: number): string => `${f >= 1000 ? f.toFixed(0) : f.toFixed(1)} Hz`;

/**
 * What to say of the notes sounding (null: none).
 *  · one: its name, its frequency;
 *  · two to four: each by name, lowest first; under them the chord they make, the interval of two, or
 *    how many;
 *  · five or more: the chord's name where there is one (else its pitch classes, up to four, else the
 *    count); under it how many, and from the lowest to the highest.
 * An ensemble counts its sounding parts rather than its notes.
 */
export function summarize(midis: Iterable<number>, opts: ReadoutOpts = {}): Readout | null {
  const ns = tidy(midis);
  const n = ns.length;
  if (!n) return null;
  const parts = opts.parts && opts.parts > 1 ? opts.parts : 0;
  const many = parts ? `${parts} parts` : `${n} notes`;
  const done = (head: string, sub: string): Readout => ({ head, sub, size: sizeOf(head), count: n });
  if (n === 1) return done(noteName(ns[0]), hzText((opts.hz ?? etHz)(ns[0])));
  const found = chordOf(ns);
  const chord = found?.name ?? null;
  // (a chord's notes as the chord spells them: B♭ minor's third is D♭)
  const named = (m: number) => `${found?.spell.get(((m % 12) + 12) % 12) ?? pcName(m)}${Math.floor(m / 12) - 1}`;
  const span = `${noteName(ns[0])}–${noteName(ns[n - 1])}`;
  if (n <= NAMED) {
    const what = chord ?? (n === 2 ? intervalName(ns[0], ns[1]) : new Set(ns.map((m) => m % 12)).size === 1 ? 'octaves' : '');
    return done(ns.map(named).join(' '), [what, parts || !what ? many : ''].filter(Boolean).join(' · '));
  }
  const pcs = [...new Set(ns.map((m) => ((m % 12) + 12) % 12))];
  // (the pitch classes from the bass up, as they are heard)
  const classes = pcs.length <= NAMED ? pcs.map((p) => PC[p]).join(' ') : '';
  return done(chord ?? (classes || many), [chord || classes ? many : '', span].filter(Boolean).join(' · '));
}

/** a part's notes for its cell in the ensemble's strip: up to three names, then a count */
export function partNotes(midis: Iterable<number>): string {
  const ns = tidy(midis);
  return ns.length <= 3 ? ns.map(noteName).join(' ') : `${ns.length}`;
}
