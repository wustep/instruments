// Routing by what a file says of its lines, so that it applies to a file dropped in later: each line
// of the file the routing was set for is known by its name (the track's, else its instrument's) and
// its General MIDI program, and the seats it played on. The Orchestra's address carries this
// (address.ts), so the address itself is a preset. Pure (no DOM, no audio), tested fast.
//
// A new file's lines are matched to the rules (each rule takes one line) in passes:
//   1. the same name, as written ("Violin I", "violin I");
//   2. the same instrument and desk by name: "Violoncello" is "Cello", "Vln. 2" is "Violin II",
//      "Contrabass" is "Double bass" and "Bass" (no number is the first desk);
//   3. the same program, in order (the first line on GM 40 to the first rule on 40, the second to
//      the second), unless the two names say different instruments;
//   4. the same place, for a rule that names nothing (no name and no program).
// A line no rule takes goes, by register, to the instruments left without a line, or else joins the
// instrument nearest its register. A file no rule fits at all is matched to the lineup by register,
// as any lineup picked by hand is (assign.ts matchLineup).

import { isKeyboard, matchLineup, planOf, VOICE_INFO, voiceFromName, type LineInfo, type Part, type Plan, type Voice } from './assign.ts';

/** what a line is known by: its name ('' for none) and its General MIDI program (−1 for none) */
export interface LineKey {
  name: string;
  program: number;
}
/** a line and the seats (indices in the lineup) it plays on; none: it is silent */
export interface LineRule extends LineKey {
  seats: number[];
}
/** the Orchestra as its address carries it: the instruments in seating order (one may come more than
 *  once), each line of a file and where it goes (null: none set, the lines are matched by register),
 *  and the seats the keys play or split (null: the default) */
export interface Setup {
  seats: Voice[];
  lines: LineRule[] | null;
  keys: number[] | 'split' | null;
}

/** a line's name as written, tidied: LilyPond's "\new" is none, a trailing colon goes, "violinII" is
 *  "violin II" */
export const tidyName = (s: string): string =>
  s
    .replace(/^\\new:?$/, '')
    .replace(/:$/, '')
    .replace(/^(violin|violino)(I+)$/i, '$1 $2')
    .trim();

/** what a file's line is known by */
export const keyOf = (l: Pick<LineInfo, 'name' | 'instrument' | 'program'>): LineKey => ({
  name: tidyName(l.name) || tidyName(l.instrument),
  program: Number.isInteger(l.program) && l.program >= 0 && l.program <= 127 ? l.program : -1,
});

/** a name compared: lower case, accents and punctuation gone ("Flûte  1." → "flute 1") */
const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4 };
/** the desk a name gives (Violin II, Vln. 2, Vn2: 2); none: the first */
function desk(n: string): number {
  const toks = n.split(' ');
  const last = toks[toks.length - 1] ?? '';
  if (toks.length > 1 && ROMAN[last]) return ROMAN[last];
  const d = /(\d+)$/.exec(last);
  return d ? Number(d[1]) : 1;
}
/** the instrument a name says (the pianos are one) */
const family = (name: string): string | null => {
  const v = voiceFromName(name);
  return v ? (isKeyboard(v) ? 'keys' : v) : null;
};
/** the instrument and desk a name says ("Violoncello" and "Cello": cello 1), null if it says none */
const canon = (name: string): string | null => {
  const f = family(name);
  return f ? `${f} ${desk(norm(name))}` : null;
};

/** for each line, the rule that takes it (−1: none) */
export function matchRules(lines: LineKey[], rules: LineKey[]): number[] {
  const of = lines.map(() => -1);
  const used = rules.map(() => false);
  /** one pass: lines and free rules with the same key are paired in order */
  const pass = (keyL: (l: LineKey) => string | null, keyR: (r: LineKey) => string | null, ok: (l: LineKey, r: LineKey) => boolean = () => true) => {
    const free = new Map<string, number[]>();
    rules.forEach((r, j) => {
      const k = used[j] ? null : keyR(r);
      if (k === null) return;
      const q = free.get(k);
      if (q) q.push(j);
      else free.set(k, [j]);
    });
    lines.forEach((l, i) => {
      if (of[i] >= 0) return;
      const k = keyL(l);
      const q = k === null ? undefined : free.get(k);
      const at = q ? q.findIndex((j) => ok(l, rules[j])) : -1;
      if (at < 0) return;
      const j = q!.splice(at, 1)[0];
      of[i] = j;
      used[j] = true;
    });
  };
  const named = (k: LineKey) => norm(k.name) || null;
  const prog = (k: LineKey) => (k.program >= 0 ? String(k.program) : null);
  pass(named, named);
  pass((l) => canon(l.name), (r) => canon(r.name));
  pass(prog, prog, (l, r) => {
    const a = family(l.name);
    const b = family(r.name);
    return !a || !b || a === b;
  });
  // by place: a rule that names nothing
  lines.forEach((_, i) => {
    if (of[i] >= 0 || i >= rules.length || used[i] || named(rules[i]) || rules[i].program >= 0) return;
    of[i] = i;
    used[i] = true;
  });
  return of;
}

/** the seat nearest a line's register that holds more than one note (else any) */
function nearest(l: LineInfo, lineup: Voice[]): number {
  const key = (v: Voice) => (VOICE_INFO[v].poly > 1 ? 0 : 100) + Math.abs(l.median - VOICE_INFO[v].centre);
  let best = 0;
  for (let k = 1; k < lineup.length; k++) if (key(lineup[k]) < key(lineup[best])) best = k;
  return best;
}

/** a file's lines on a lineup by the rules (see the top of this file) */
export function planByRules(lines: LineInfo[], lineup: Voice[], rules: LineRule[]): Plan {
  if (!lineup.length) return planOf([], lines);
  const of = matchRules(lines.map(keyOf), rules);
  if (of.every((j) => j < 0)) return matchLineup(lines, lineup);
  const parts: Part[] = lineup.map((v) => ({ voice: v, lines: [] }));
  const rest: number[] = [];
  of.forEach((j, li) => (j < 0 ? rest.push(li) : rules[j].seats.forEach((k) => parts[k]?.lines.push(li))));
  if (rest.length) {
    const idle = parts.map((p, k) => (p.lines.length ? -1 : k)).filter((k) => k >= 0);
    if (idle.length) {
      const sub = matchLineup(
        rest.map((i) => lines[i]),
        idle.map((k) => lineup[k]),
      );
      sub.parts.forEach((p, s) => p.lines.forEach((i) => parts[idle[s]].lines.push(rest[i])));
    } else for (const li of rest) parts[nearest(lines[li], lineup)].lines.push(li);
  }
  return planOf(parts, lines);
}

/** a plan as rules: each line of the file, what it is known by and the seats it plays on */
export const rulesOf = (plan: Plan, lines: LineInfo[]): LineRule[] =>
  lines.map((l, i) => ({ ...keyOf(l), seats: [...new Set((plan.lines[i] ?? []).map((r) => r.part))].sort((a, b) => a - b) }));

/**
 * Rules carried over a change of the lineup made with no file loaded: a seat goes with its
 * instrument (the second violin is the second violin wherever it now sits). A line whose every
 * instrument has left is dropped (a file's line of that name then goes by register), one that was
 * silent stays silent.
 */
export function remapRules(rules: LineRule[], from: Voice[], to: Voice[]): LineRule[] {
  const at = from.map((v, k) => {
    const n = from.slice(0, k).filter((x) => x === v).length;
    let seen = 0;
    return to.findIndex((x) => x === v && seen++ === n);
  });
  const out: LineRule[] = [];
  for (const r of rules) {
    const seats = [...new Set(r.seats.map((k) => at[k] ?? -1).filter((k) => k >= 0))].sort((a, b) => a - b);
    if (seats.length || !r.seats.length) out.push({ ...r, seats });
  }
  return out;
}
