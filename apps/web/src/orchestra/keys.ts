// Which of the ensemble's instruments the keys play: the keys on the screen, the computer's keys and a
// plug-in MIDI keyboard (its pedals, bend and wheel go with them). Pure (no DOM, no audio): tested fast.
//
// The keys play the instruments chosen on the fallboard, one or several: a key pressed sounds on
// every one of them, each moving the note by octaves into its own range. Until a choice is made the
// keys play the piano if there is one on the stage (the instrument a keyboard is), else the highest
// melodic instrument (the one that leads: the first violin of a quartet, the flute over strings).
// "Split" is the other way to play an ensemble by hand: a chord is dealt out, each melodic
// instrument one note by register (the lowest to the cello), a piano taking what is left.

import { isKeyboard, placeNote, VOICE_INFO, type Voice } from './assign.ts';

/** what the keys play: the chosen instruments (seats on the stage, in seating order), or split */
export interface KeysChoice {
  /** the seats the keys play (never empty while there is an instrument) */
  parts: number[];
  /** a chord dealt out by register over the whole ensemble, in place of `parts` */
  split: boolean;
  /** chosen by hand (else the default, which follows the lineup as it changes) */
  byUser: boolean;
}

/** the instrument the keys play until one is chosen: the first piano, else the highest melodic
 *  instrument (by the middle of its register; the first seat of two alike) */
export function defaultKeys(voices: Voice[]): number[] {
  if (!voices.length) return [];
  const kb = voices.findIndex(isKeyboard);
  if (kb >= 0) return [kb];
  let best = 0;
  for (let k = 1; k < voices.length; k++) if (VOICE_INFO[voices[k]].centre > VOICE_INFO[voices[best]].centre) best = k;
  return [best];
}

export const keysFor = (voices: Voice[]): KeysChoice => ({ parts: defaultKeys(voices), split: false, byUser: false });

/** one instrument in or out of the keys' choice (the last one stays: the keys always play
 *  something); from split, a tap on an instrument plays that one alone */
export function toggleKey(c: KeysChoice, k: number, n: number): KeysChoice {
  if (k < 0 || k >= n) return c;
  if (c.split) return { parts: [k], split: false, byUser: true };
  const has = c.parts.includes(k);
  if (has && c.parts.length === 1) return c;
  const parts = has ? c.parts.filter((x) => x !== k) : [...c.parts, k].sort((a, b) => a - b);
  return { parts, split: false, byUser: true };
}

/** a section's desks in or out of the keys' choice together (orchestra/sections.ts): all in, they go
 *  (unless that leaves nothing); some or none in, all come in; from split, the section alone */
export function toggleKeys(c: KeysChoice, ks: number[], n: number): KeysChoice {
  const seats = [...new Set(ks.filter((k) => k >= 0 && k < n))];
  if (!seats.length) return c;
  if (c.split) return { parts: seats.sort((a, b) => a - b), split: false, byUser: true };
  const all = seats.every((k) => c.parts.includes(k));
  const parts = all ? c.parts.filter((k) => !seats.includes(k)) : [...new Set([...c.parts, ...seats])].sort((a, b) => a - b);
  if (!parts.length) return c;
  return { parts, split: false, byUser: true };
}

/** split on (the chosen instruments are kept for when it goes off) or off */
export const setSplit = (c: KeysChoice, on: boolean): KeysChoice => (c.split === on ? c : { ...c, split: on, byUser: true });

/**
 * The choice carried over a change of the lineup. `from[i]` is the old seat of the engine now in
 * seat `i` (-1: a new one). An instrument kept is still chosen wherever it now sits; a seat whose
 * instrument was changed for another (a new engine where the old one has gone, as the routing grid
 * or the piano's preset do) stays chosen. A default choice is the new lineup's default, and so is a
 * choice whose instruments have all left.
 */
export function carryKeys(c: KeysChoice, from: number[], voices: Voice[]): KeysChoice {
  if (!c.byUser) return keysFor(voices);
  const kept = new Set(from);
  const parts: number[] = [];
  from.forEach((j, i) => {
    if (j >= 0 ? c.parts.includes(j) : c.parts.includes(i) && !kept.has(i)) parts.push(i);
  });
  if (!parts.length) return c.split ? { parts: defaultKeys(voices), split: true, byUser: true } : keysFor(voices);
  return { parts, split: c.split, byUser: true };
}

/** the seats that take the keys, their pedals and controllers: the chosen ones, or every seat split */
export const keyParts = (c: KeysChoice, n: number): number[] => (c.split ? Array.from({ length: n }, (_, k) => k) : c.parts.filter((k) => k < n));

/** the keys' span: from the lowest of the chosen instruments' ranges to the highest */
export function keysRange(c: KeysChoice, voices: Voice[]): [number, number] {
  const vs = keyParts(c, voices.length).map((k) => voices[k]);
  if (!vs.length) return [21, 108];
  return [Math.min(...vs.map((v) => VOICE_INFO[v].lo)), Math.max(...vs.map((v) => VOICE_INFO[v].hi))];
}

/** one place a key sounds: a seat and the pitch it plays there */
export interface KeyTarget {
  part: number;
  pitch: number;
}

/**
 * Where a key pressed by hand sounds. Chosen instruments: on each of them, moved by octaves into its
 * range. Split: on the free melodic instrument nearest the key's register, else a piano, else the
 * instrument nearest in register (`busy`: the melodic seats already holding a key; the caller lets
 * go of what the one taken over holds).
 */
export function keyTargets(midi: number, c: KeysChoice, voices: Voice[], busy: Set<number>): KeyTarget[] {
  if (!voices.length) return [];
  if (!c.split) return keyParts(c, voices.length).map((part) => ({ part, pitch: placeNote(midi, 0, voices[part]) }));
  const dist = (v: Voice) => (midi < VOICE_INFO[v].lo ? VOICE_INFO[v].lo - midi + 24 : midi > VOICE_INFO[v].hi ? midi - VOICE_INFO[v].hi + 24 : Math.abs(midi - VOICE_INFO[v].centre));
  let best = -1;
  for (let k = 0; k < voices.length; k++) {
    if (isKeyboard(voices[k]) || busy.has(k)) continue;
    if (best < 0 || dist(voices[k]) < dist(voices[best])) best = k;
  }
  if (best < 0) best = voices.findIndex(isKeyboard);
  if (best < 0) for (let k = 0; k < voices.length; k++) if (best < 0 || dist(voices[k]) < dist(voices[best])) best = k;
  return [{ part: best, pitch: placeNote(midi, 0, voices[best]) }];
}
