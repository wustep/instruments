// The valves of the brass: which combination and which resonance of the tube play a note. Shared by the
// trumpet (brass.ts), the horn (horn.ts: each of its two sides) and the tuba (tuba.ts: a fourth valve).
//
// A valve switches a loop of tubing into the air line: the second lowers the tube a semitone, the first a
// tone, the third a tone and a half (played as 1+2), the fourth (the tuba's, the euphonium's) a fourth, used
// in place of 1+3. A note is one of the lengthened tube's resonances; players take the least lowering that
// reaches it, on the lowest resonance that does (the common charts: Farkas 1956 for the horn, Arban for the
// trumpet, Bell and Bobo for the tuba).

/** three valves' combinations by how far they lower the tube (semitones): open, 2, 1, 1+2, 2+3, 1+3, 1+2+3 */
export const VALVES3 = ['0', '2', '1', '1+2', '2+3', '1+3', '1+2+3'];
/** four valves': the fourth alone a fourth (in place of 1+3), 2+4 a tritone (in place of 1+2+3), then on
 *  down to 1+2+3+4, eleven semitones: the whole octave under the second resonance but its last semitone */
export const VALVES4 = ['0', '2', '1', '1+2', '2+3', '4', '2+4', '1+4', '1+2+4', '2+3+4', '1+3+4', '1+2+3+4'];

export interface ValveFingering {
  /** the valves down, e.g. '1+2' ('0' or 'open': none, as the instrument's list names it) */
  valves: string;
  /** how far they lower the tube (semitones) */
  lower: number;
  /** which resonance of the tube sounds (1 = its fundamental, the pedal) */
  partial: number;
}

/** The fingering of `note` (MIDI) on a tube whose open fundamental is `base` (MIDI): the least lowering
 *  (`valves[v]` lowers it v semitones), then the lowest of `partials`, that reach the note; null when none does. */
export function valveFingering(note: number, base: number, partials: readonly number[], valves: readonly string[]): ValveFingering | null {
  let best: ValveFingering | null = null;
  let bestScore = Infinity;
  for (const n of partials)
    for (let v = 0; v < valves.length; v++) {
      if (base - v + Math.round(12 * Math.log2(n)) !== note) continue;
      const score = v * 10 + n;
      if (score < bestScore) {
        bestScore = score;
        best = { valves: valves[v], lower: v, partial: n };
      }
    }
  return best;
}

/** which of the valves 1…n a fingering holds down ('1+2+4' → [true, true, false, true]) */
export function valvesDown(valves: string, n = 3): boolean[] {
  const out = new Array<boolean>(n).fill(false);
  for (const s of valves.split('+')) {
    const k = Number.parseInt(s, 10);
    if (k >= 1 && k <= n) out[k - 1] = true;
  }
  return out;
}
