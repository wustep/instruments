// Common surface of every instrument core (piano, bowed strings, flute) so the
// worklet, the main-thread API and the UI can host any of them.

import type { KeySummary } from '../api/messages.ts';

export type InstrumentId = 'piano' | 'violin' | 'viola' | 'cello' | 'bass' | 'flute' | 'oboe' | 'clarinet' | 'bassoon' | 'horn' | 'trumpet' | 'trombone' | 'timpani';
export const INSTRUMENT_IDS: InstrumentId[] = ['piano', 'violin', 'viola', 'cello', 'bass', 'flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone', 'timpani'];
/** the bowed strings (bowed.ts), high to low */
export type BowedId = 'violin' | 'viola' | 'cello' | 'bass';
export const isBowed = (id: string): id is BowedId => id === 'violin' || id === 'viola' || id === 'cello' || id === 'bass';
/** the winds and the brass: one player, one note at a time (mono.ts), high to low within each family */
export type MonoId = 'flute' | 'oboe' | 'clarinet' | 'bassoon' | 'horn' | 'trumpet' | 'trombone';
export const isMono = (id: string): id is MonoId => id === 'flute' || id === 'oboe' || id === 'clarinet' || id === 'bassoon' || id === 'horn' || id === 'trumpet' || id === 'trombone';
/** the instruments a file's notes are told to before they sound (PianoEvent 'foresee'): the bowed strings
 *  plan their bow with them (bowed.ts), the winds and brass their tongue and breath (mono.ts) */
export const foresees = (id: string): boolean => isBowed(id) || isMono(id);

/** Played (not in the dry calibration renders), this many dB over the level an instrument was fitted at: a
 *  recording session's microphone gain given back. The trombone was matched to the Iowa trombones, whose ff
 *  notes sit 9 dB under the Iowa horn's and trumpet's (trombone.ts); the horn, trumpet and bassoon sessions
 *  agree within 1 dB, and orchestral sound powers put a trombone with the other brass (Kahle 1995, Table 1,
 *  after J. Meyer, Acustica 71, 1990: trombone 101 dB re 1 pW, bassoon and clarinet 93, cello 90). Measured
 *  (scripts/audio-levels.ts, held, each voice's centre ±7 semitones): the trombone was 12 dB under the
 *  trumpet at ff, 18 dB at mf (audio audit 2). The timpani were fitted at the level of their own session (VSCO 2
 *  CE, shared with no other instrument here); the same table has them 1 dB under the trombone (timpani 100 dB
 *  re 1 pW): a forte roll (G2, 12 strokes a second, v100) measured −23.9 LUFS against the trombone's held forte
 *  −15.9 (with its 9 dB), the horn's −17.4 and the cello's −20.3, 3.6 dB under the cello the table puts 10 dB
 *  below; with 7 dB, 1 dB under the trombone. Their loudest stroke (the top drum, v127) then peaks at +0.8
 *  dBFS before the limiter, the low drums at −4…−7. The Orchestra's bus counts a part at this level
 *  (apps/web/src/orchestra/mix.ts), so a lineup of trombones alone sounds as it did. */
export const PLAYBACK_DB: Partial<Record<InstrumentId, number>> = { trombone: 9, timpani: 7 };

/** the instrument families: the piano, the bowed strings, the flute (an air jet), the reeds (the oboe: a
 *  double reed on a conical bore; the clarinet: a single reed on a cylinder; the bassoon: the oboe's double
 *  reed on a cone two and a half metres long) and the brass (the trumpet; the horn: the trumpet's buzzing lips
 *  on a tube two and a half times as long, wound in a circle, played high in its harmonic series; the
 *  trombone: the lips in a cup mouthpiece on a cylindrical slide and a wide bell) and the
 *  percussion (the timpani: membranes over kettles, struck with felt mallets) */
export type Family = 'piano' | 'bowed' | 'wind' | 'reed' | 'brass' | 'percussion';
export const INSTRUMENT_INFO: Record<InstrumentId, { label: string; family: Family; lo: number; hi: number; blurb: string }> = {
  piano: { label: 'Piano', family: 'piano', lo: 21, hi: 108, blurb: 'Felt hammers, 2–3 stiff strings per note, a shared soundboard.' },
  violin: { label: 'Violin', family: 'bowed', lo: 55, hi: 100, blurb: 'Four strings G3–E5, bowed with stick–slip friction, on a resonant body.' },
  viola: { label: 'Viola', family: 'bowed', lo: 48, hi: 88, blurb: 'Four strings C3–A4: longer, heavier, a darker and larger body.' },
  cello: { label: 'Cello', family: 'bowed', lo: 36, hi: 81, blurb: 'Four strings C2–A3 on a big body with low air and wood resonances.' },
  bass: { label: 'Double bass', family: 'bowed', lo: 28, hi: 67, blurb: 'Four strings tuned in fourths, E1–G2, on the largest body: sloped shoulders, a flat back.' },
  flute: { label: 'Flute', family: 'wind', lo: 60, hi: 96, blurb: 'An air jet driving a resonant tube; harder blowing jumps registers.' },
  oboe: { label: 'Oboe', family: 'reed', lo: 58, hi: 93, blurb: 'A double reed blown closed, on a conical bore: every harmonic, overblown at the octave.' },
  clarinet: { label: 'Clarinet', family: 'reed', lo: 50, hi: 94, blurb: 'A single reed beating on a mouthpiece, on a cylindrical bore: odd harmonics low down, overblown at the twelfth.' },
  bassoon: { label: 'Bassoon', family: 'reed', lo: 34, hi: 76, blurb: 'A double reed on a long, narrow conical bore folded in two: a dark, reedy bass, overblown at the octave.' },
  horn: { label: 'Horn', family: 'brass', lo: 34, hi: 77, blurb: 'Buzzing lips on a long tube wound in a circle, the hand in its bell: the lips pick a partial high in its series.' },
  trumpet: { label: 'Trumpet', family: 'brass', lo: 52, hi: 86, blurb: 'Buzzing lips driving a bore; the valves lengthen it, the lips pick its partial.' },
  trombone: { label: 'Trombone', family: 'brass', lo: 28, hi: 77, blurb: 'Buzzing lips on a cylindrical slide and a wide bell: the slide lengthens the tube, the lips pick its partial.' },
  timpani: { label: 'Timpani', family: 'percussion', lo: 36, hi: 57, blurb: 'Four kettledrums struck with felt mallets: the air on the heads draws their modes into a pitch; pedals tune them.' },
};

/** Extra events beyond the piano's (continuous controllers). */
export type ControlEvent = { type: 'control'; cc: number; value: number };

/** A controller above MIDI's 0–127 for a file's dynamics within a held note (apps/web/src/expression.ts):
 *  the player plays on as if the note had been begun this many velocity steps harder (negative:
 *  softer). Velocity is the dynamic each sustaining core is fitted along (pp/mf/ff of the Iowa
 *  recordings), so a swell or a hairpin moves the bow (speed, force, contact point) or the breath
 *  exactly as a louder or softer note would. 0 is the note as begun (nothing changes); the cores
 *  glide to a new value with DYN_TAU. The piano, struck, has nothing to sustain and ignores it. */
export const CC_DYNAMICS = 131;
/** the glide of CC_DYNAMICS: a player's arm or breath, not a fader (seconds, a time constant) */
export const DYN_TAU = 0.06;
/** CC1/CC2/CC11 sent below 0: back to rest, as if the controller had never moved (a file that used
 *  the mod wheel lets go of it when it stops) */
export const CC_REST = -1;

/** Generic excitation trace for the "look inside" view (bow, jet). */
export interface ExciteTrace {
  title: string;
  unit: string;
  /** samples per second of the traces */
  rate: number;
  trace: Float32Array;
  trace2?: Float32Array;
  trace2Label?: string;
  caption: string;
  meta: string;
}

export interface InstrumentCore {
  readonly id: InstrumentId;
  readonly fs: number;
  frame: number;
  sustain: number;
  soft: number;
  maxVoices: number;
  sympatheticAllowed: boolean;
  readonly activeVoiceCount: number;
  readonly activeSympatheticCount: number;
  readonly modeFrequencies: Float64Array;
  readonly params: object;
  schedule(ev: unknown, frame?: number): void;
  process(L: Float32Array | Float64Array, R: Float32Array | Float64Array, n: number): void;
  setParams(p: Record<string, unknown>): void;
  allSoundOff(): void;
  getVisual(points?: number): unknown;
  keySummary(): KeySummary[];
  /** the notes actually sounding now, by the instrument's own allocation (monophonic instruments
   *  give one; bowed strings one per string; the piano its held, unstolen keys) */
  sounding(): number[];
}
