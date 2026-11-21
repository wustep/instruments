// What the sheet shows of a file: its parts, each a line on a staff of its own, or a keyboard's or a
// harp's lines together as one player's two staves; and, for a few players, all of them as a score.
// Each staff's clef is its instrument's (the viola's alto clef, the low instruments' bass clef), written as
// its players read it (a double bass's part an octave over what it sounds, a glockenspiel's two octaves
// under); a line on no instrument known by its range. Pure: the view (sheet/view.ts) draws them.

import type { MidiLine, MidiSong } from '../midi-file.ts';
import { takesAll, VOICE_INFO, type Plan, type Voice } from '../orchestra/assign.ts';
import { tidyName } from '../orchestra/rules.ts';
import type { Clef, StaffPlan } from './score.ts';

export interface SheetPart {
  /** the part's own name while the file is loaded (its first line) */
  key: string;
  name: string;
  /** the instrument playing it (the first, of several), or none (a line left silent) */
  voice: Voice | null;
  lines: number[];
  staves: StaffPlan[];
  /** one player's staves, braced */
  brace: boolean;
}

/** the most parts the score of them all is offered for (a quartet, a quintet): past that it is a part at a time */
export const SCORE_MOST = 5;

const BASS_CLEF = new Set<Voice>(['cello', 'bass', 'bassoon', 'trombone', 'tuba', 'timpani']);
const TREBLE_CLEF = new Set<Voice>(['violin', 'flute', 'oboe', 'clarinet', 'trumpet', 'glockenspiel']);

/** a line's name as the file writes it, tidied (as the player's chips name it: ui/player.ts lineName) */
export const lineLabel = (l: MidiLine | undefined, i: number): string => (l ? tidyName(l.name) || l.instrument.trim() : '') || `line ${i + 1}`;

/** one line's staff: its instrument's clef, else (or a horn, which reads both) by where it lies */
export function staffFor(lines: number[], l: MidiLine, v: Voice | null): StaffPlan {
  const byRange = (): StaffPlan => {
    const clef: Clef = l.median >= 59 ? 'treble' : 'bass';
    const ottava = clef === 'treble' && l.median >= 88 ? '8va' : clef === 'bass' && l.median <= 36 ? '8vb' : undefined;
    return { lines, clef, ...(ottava ? { ottava } : {}) };
  };
  if (!v || v === 'horn' || takesAll(v)) return byRange();
  if (v === 'viola') return { lines, clef: 'alto' };
  if (v === 'bass') return { lines, clef: 'bass', written: 12 };
  if (v === 'glockenspiel') return { lines, clef: 'treble', written: -24 };
  if (BASS_CLEF.has(v)) return { lines, clef: 'bass' };
  if (TREBLE_CLEF.has(v)) return { lines, clef: 'treble' };
  return byRange();
}

/** a keyboard's or a harp's staves: each line its own, the higher above (one line that spans both hands:
 *  split at middle C; more than two: all of them, split there) */
export function keyboardStaves(song: MidiSong, lines: number[]): StaffPlan[] {
  const ls = lines.filter((i) => song.lines[i]?.notes).sort((a, b) => song.lines[b].median - song.lines[a].median);
  if (!ls.length) return [];
  const split = (): StaffPlan[] => [
    { lines: ls, clef: 'treble', lo: 60 },
    { lines: ls, clef: 'bass', hi: 60 },
  ];
  if (ls.length === 1) {
    const l = song.lines[ls[0]];
    return l.lo < 57 && l.hi > 64 ? split() : [staffFor(ls, l, null)];
  }
  if (ls.length === 2) return ls.map((i) => staffFor([i], song.lines[i], null));
  return split();
}

/**
 * The parts of `song`. On an ensemble (`plan`): a part a line, named as the file names it, but a
 * keyboard's or a harp's lines (one seat's) are one part of two staves. On one instrument (`solo`): one
 * part, every line on it (a piano's two hands, braced).
 */
export function partsOf(song: MidiSong, plan: Plan | null, solo: Voice | null): SheetPart[] {
  const has = (i: number) => (song.lines[i]?.notes ?? 0) > 0;
  if (!plan) {
    const lines = song.lines.map((_, i) => i).filter(has);
    if (!lines.length) return [];
    const kb = !solo || takesAll(solo);
    const staves = kb ? keyboardStaves(song, lines) : lines.map((i) => staffFor([i], song.lines[i], solo));
    return [{ key: `line:${lines[0]}`, name: solo ? VOICE_INFO[solo].label : lineLabel(song.lines[lines[0]], lines[0]), voice: solo, lines, staves, brace: kb && staves.length > 1 }];
  }
  const groups = new Map<string, { voice: Voice | null; lines: number[] }>();
  song.lines.forEach((_, i) => {
    if (!has(i)) return;
    const rs = plan.lines[i] ?? [];
    const v = rs.length ? plan.parts[rs[0].part]?.voice ?? null : null;
    const key = v && takesAll(v) ? `seat:${rs[0].part}` : `line:${i}`;
    const g = groups.get(key);
    if (g) g.lines.push(i);
    else groups.set(key, { voice: v, lines: [i] });
  });
  return [...groups.values()].map((g) => {
    const one = g.voice && takesAll(g.voice);
    const staves = one ? keyboardStaves(song, g.lines) : [staffFor(g.lines, song.lines[g.lines[0]], g.voice)];
    const name = one && g.lines.length > 1 ? VOICE_INFO[g.voice!].label : lineLabel(song.lines[g.lines[0]], g.lines[0]);
    return { key: `line:${g.lines[0]}`, name, voice: g.voice, lines: g.lines, staves, brace: staves.length > 1 };
  });
}

/** which part the sheet opens on: the one the keys play on an ensemble (the first of theirs), else the first */
export function firstPart(parts: SheetPart[], plan: Plan | null, keySeats: number[]): number {
  if (!plan) return 0;
  for (const k of keySeats) {
    const i = parts.findIndex((p) => p.lines.some((l) => (plan.lines[l] ?? []).some((r) => r.part === k)));
    if (i >= 0) return i;
  }
  return 0;
}
