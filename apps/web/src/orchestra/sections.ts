// Sections: how a large lineup is organised. The seats of one instrument that sit together and play the same
// lines are a section, each seat a desk of it: Beethoven's two flutes on the flutes' staff (divided between
// them, assign.ts deskOf), three violins on the first violins' line. Its eighteen seats are twelve sections,
// one per staff. A seat with no line yet (waiting to be given one) is a section of its own.
//
// A section is changed as one (its instrument, its lines), grows by a desk (another seat like its last,
// playing the same lines: a second player, assign.ts playersOf) or loses one, or leaves the stage. Seats
// stay in the score's order; the families (woodwinds, brass, percussion, strings, keyboards) part the
// routing grid's rows. Pure (no DOM, no audio), tested fast.

import { fitsStage, isKeyboard, lineupOf, mayBecome, planOf, seatFor, shiftsOf, VOICE_INFO, type LineInfo, type Part, type Plan, type Voice } from './assign.ts';
import type { LineRule } from './rules.ts';

export type Family = 'winds' | 'brass' | 'percussion' | 'strings' | 'keyboards';
export const familyOf = (v: Voice): Family => (isKeyboard(v) ? 'keyboards' : v === 'timpani' ? 'percussion' : v === 'horn' || v === 'trumpet' || v === 'trombone' || v === 'tuba' ? 'brass' : v === 'violin' || v === 'viola' || v === 'cello' || v === 'bass' ? 'strings' : 'winds');

/** a section: its instrument, its seats (neighbours in the lineup, a desk each) and the lines they all play */
export interface Section {
  voice: Voice;
  seats: number[];
  lines: number[];
}

/**
 * The stage's sections, in seating order: neighbouring seats of one instrument that play the same lines,
 * none of them silent. `linesOf[k]`: what seat k plays (a file's lines, or with no file the rules of an
 * address that route to it: rules.ts seatRules); none, it waits, a section of its own.
 */
export function sectionsOf(voices: Voice[], linesOf: number[][]): Section[] {
  const out: Section[] = [];
  const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  voices.forEach((v, k) => {
    const ls = [...(linesOf[k] ?? [])].sort((a, b) => a - b);
    const prev = out[out.length - 1];
    if (prev && prev.voice === v && ls.length > 0 && same(prev.lines, ls) && prev.seats[prev.seats.length - 1] === k - 1) prev.seats.push(k);
    else out.push({ voice: v, seats: [k], lines: ls });
  });
  return out;
}
/** each seat's name: the voice, numbered when it is on the stage twice ("violin 2") */
export function seatNames(voices: Voice[]): string[] {
  return voices.map((v, k) => {
    const label = VOICE_INFO[v].label;
    const many = voices.filter((x) => x === v).length > 1;
    return many ? `${label} ${voices.slice(0, k + 1).filter((x) => x === v).length}` : label;
  });
}
/** a section's name: its seat's ("cello", "violin 2"), or its desks' ("flute 1–2") */
export function sectionName(s: Section, names: string[]): string {
  if (s.seats.length === 1) return names[s.seats[0]] ?? VOICE_INFO[s.voice].label;
  const n = (k: number) => (names[k] ?? '').split(' ').pop();
  return `${VOICE_INFO[s.voice].label} ${n(s.seats[0])}–${n(s.seats[s.seats.length - 1])}`;
}

/** each seat's rules (indices into `rules`): what it plays when no file is loaded */
export const seatRules = (n: number, rules: LineRule[] | null): number[][] => Array.from({ length: n }, (_, k) => (rules ?? []).flatMap((r, j) => (r.seats.includes(k) ? [j] : [])));
/** the section seat k is a desk of */
export const sectionOfSeat = (sections: Section[], k: number): Section | null => sections.find((s) => s.seats.includes(k)) ?? null;

// ---------------------------------------------------------------- changes, each with where its seats came from
/** a change of the lineup: the new plan, and for each new seat the seat it was (or copies: a desk added), or
 *  null for a new instrument; how an address's rules follow when no file is loaded (rulesThrough) */
export interface Reseat {
  plan: Plan;
  from: (number | null)[];
}
const copy = (plan: Plan): Part[] => plan.parts.map((p) => ({ voice: p.voice, lines: [...p.lines] }));
const ident = (n: number): (number | null)[] => Array.from({ length: n }, (_, k) => k);

/** another desk for a section: a seat like its last, playing the same lines, beside it; null when the stage
 *  has no room for it (assign.ts fitsStage) */
export function addDesk(plan: Plan, lines: LineInfo[], seats: number[], cap: number): Reseat | null {
  const k = Math.max(...seats);
  const p = plan.parts[k];
  if (!p || !fitsStage([...lineupOf(plan), p.voice], cap)) return null;
  const parts = copy(plan);
  parts.splice(k + 1, 0, { voice: p.voice, lines: [...p.lines] });
  const from = ident(plan.parts.length);
  from.splice(k + 1, 0, k);
  return { plan: planOf(parts, lines, shiftsOf(plan)), from };
}

/** seats taken off the stage (a desk, a section, every instrument of a kind): what only they played falls
 *  silent; null if that would leave the stage empty */
export function removeSeats(plan: Plan, lines: LineInfo[], seats: number[]): Reseat | null {
  const gone = new Set(seats.filter((k) => k >= 0 && k < plan.parts.length));
  if (!gone.size) return { plan, from: ident(plan.parts.length) };
  if (gone.size >= plan.parts.length) return null;
  const keep = plan.parts.map((_, k) => k).filter((k) => !gone.has(k));
  return { plan: planOf(keep.map((k) => ({ voice: plan.parts[k].voice, lines: [...plan.parts[k].lines] })), lines, shiftsOf(plan)), from: keep };
}

/** a section's seats changed to another instrument, each keeping its lines (moved into the new one's
 *  range); null when the stage has no room for the change (more pianos than it carries) */
export function setSeatsVoice(plan: Plan, lines: LineInfo[], seats: number[], voice: Voice, cap: number): Reseat | null {
  const parts = copy(plan);
  for (const k of seats) if (parts[k]) parts[k].voice = voice;
  if (!mayBecome(lineupOf(plan), parts.map((p) => p.voice), cap)) return null;
  return { plan: planOf(parts, lines, shiftsOf(plan)), from: ident(parts.length) };
}

/** a section's seats play line `li` (on) or no longer (off), every desk alike */
export function setSeatsRoute(plan: Plan, lines: LineInfo[], seats: number[], li: number, on: boolean): Plan {
  if (li < 0 || li >= lines.length) return plan;
  const parts = copy(plan);
  for (const k of seats) {
    const p = parts[k];
    if (p) p.lines = on ? [...new Set([...p.lines, li])] : p.lines.filter((i) => i !== li);
  }
  return planOf(parts, lines, shiftsOf(plan));
}

/** a section's seats play exactly these lines (all: the whole file; none: they wait) */
export function setSeatsLines(plan: Plan, lines: LineInfo[], seats: number[], lis: number[]): Plan {
  const parts = copy(plan);
  for (const k of seats) if (parts[k]) parts[k].lines = [...lis];
  return planOf(parts, lines, shiftsOf(plan));
}

/** a new instrument at its place (assign.ts seatFor: after the last of its kind, else in the score's
 *  order), playing `lis`; null when the stage has no room */
export function addSeat(plan: Plan, lines: LineInfo[], voice: Voice, lis: number[], cap: number): Reseat | null {
  const voices = lineupOf(plan);
  if (!fitsStage([...voices, voice], cap)) return null;
  const at = seatFor(voices, voice);
  const parts = copy(plan);
  parts.splice(at, 0, { voice, lines: [...lis] });
  const from = ident(plan.parts.length);
  from.splice(at, 0, null);
  return { plan: planOf(parts, lines, shiftsOf(plan)), from };
}

/**
 * An address's rules through a change of the lineup made with no file loaded: each seat's lines go with it
 * (wherever it now sits), a desk added plays its section's, a seat taken off leaves its lines (one no seat
 * plays any more is silent: a file's line of that name stays silent, as it would have with the file
 * loaded), a new instrument plays `extra` (rule indices).
 */
export function rulesThrough(rules: LineRule[], from: (number | null)[], extra: number[] = []): LineRule[] {
  const fresh = from.findIndex((o) => o === null);
  return rules.map((r, j) => {
    const seats = from.flatMap((o, k) => (o !== null && r.seats.includes(o) ? [k] : []));
    if (fresh >= 0 && extra.includes(j)) seats.push(fresh);
    return { ...r, seats: [...new Set(seats)].sort((a, b) => a - b) };
  });
}
