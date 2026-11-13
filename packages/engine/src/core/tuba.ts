// Tuba (the contrabass tuba in C, four valves): the horn's buzzing lips (lipcone.ts: the engine the two
// share) on the widest and most conical bore of the brass, five metres of it, opening steadily from a deep
// funnel mouthpiece to a bell 48 cm across. The valves are the trumpet's and the horn's (valves.ts), with a
// fourth that lowers the tube a fourth.
//
// The bore. The CC tuba's tube is 4.9 m (16 ft: Fletcher & Rossing 1998, "The Physics of Musical
// Instruments" §14.9; Campbell, Gilbert & Myers 2021, "The Science of Brass Instruments" §8.6; the BB♭
// band tuba is 5.5 m, the F tuba 3.7 m): its resonances are the partials of C1 (32.7 Hz). Nearly all of it
// widens (the bugle family: about three quarters conical, against a third on a trombone), so as a cone it
// plays the whole series, and its first resonance is a note too: the pedal C1, strong on a tuba where a
// trumpet's is not a note at all. The wide bell lets go of the highs early (its cutoff lies near 300–400 Hz,
// under a horn's 700: Campbell, Gilbert & Myers §4.5), so above the bass register the tube barely holds the
// resonances a note needs and the tone is nearly its fundamental; low down the harmonics are many but soft
// (the University of Iowa tuba: at C2 the fundamental and second harmonic lead and the spectrum falls about
// 12 dB an octave above 300 Hz; at ff the fall is slower, and the tuba, with a wide tube and a slow flare,
// steepens its wave far less than a trombone: Myers et al. 2012, JASA 131, 678, the "brassiness potential").
//
// The valves. Three as the trumpet's (a semitone, a tone, a tone and a half) and a fourth that lowers the
// tube a fourth, in place of 1+3 (which is sharp): so 4, 2+4, 1+4, 1+2+4, 2+3+4, 1+3+4, 1+2+3+4 carry the
// second resonance down from F1 to D♭1, and the open pedal is C1 (tubaFingering; the common charts, e.g.
// W. Bell's and R. Bobo's: C2 open, B1 2, B♭1 1, A1 1+2, A♭1 2+3, G1 4, G♭1 2+4, F1 1+4, E1 1+2+4,
// E♭1 2+3+4, D1 1+3+4, D♭1 1+2+3+4). A real tuba's valve notes are sharp together (each valve's loop is cut
// for the open tube, so two loops fall short of what the two together should add: 1+2 by 10 ¢, 2+4 by 24,
// 1+4 by 48, 1+2+4 by 79, all four by 175) and are pulled into tune with a slide, the lips or a fifth
// valve; and the tube's own partials are not equal temperament's (the fifth and tenth are 14 ¢ flat). The
// model's tube is the right length for every note (its tuning table: tuba-tuning.json), and its player
// (TUBA_HUMAN) leaves a little of both, as players do: tubaIntonation.
//
// The compass. C1–F4 as it sounds (MIDI 24–65; the tuba's parts are written at pitch, in the bass clef): the
// orchestral range is D1–F4 (Adler 2002, "The Study of Orchestration" 3rd ed., ch. 10), and the pedal C1
// under it is the open tube's own.

import { clamp } from './util.ts';
import { LipConeCore, type ConeFingering, type LipConeHuman, type LipConeParams, type LipConeVoice, type TuningTable } from './lipcone.ts';
import { partialCents, valveFingering, valveSharp, VALVES4 } from './valves.ts';
import tubaTuning from './tuba-tuning.json';

export type TubaParams = LipConeParams;
export type TubaVoice = LipConeVoice;

/** the compass, C1–F4 as it sounds (MIDI 24–65) */
export const TUBA_LO = 24;
export const TUBA_HI = 65;
/** the open tube's fundamental (MIDI): C1, the CC tuba's pedal */
const OPEN = 24;
/** its length, m (16 ft) */
export const TUBA_LENGTH = 4.88;
/** the partials players use (the 7th, 11th, 13th and 14th are out of tune with equal temperament) */
const PARTIALS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12];

export interface TubaFingering extends ConeFingering {
  /** the valves down: '0' (open), '2', '1', '1+2', '2+3', '4', '2+4', '1+4', '1+2+4', '2+3+4', '1+3+4',
   *  '1+2+3+4' */
  valves: string;
  /** how far the valves lower the tube (semitones) */
  lower: number;
  /** which resonance of the tube sounds (1 = its fundamental, the pedal) */
  partial: number;
}

/** The standard four-valve fingering of a note as it sounds on the CC tuba: the least lowering on the
 *  lowest usable partial (the pedal only for the open C1: the valved pedals under it are not in the
 *  compass). The fourth valve stands in for 1+3, and 2+4 for 1+2+3, wherever those would be used. */
export function tubaFingering(m: number): TubaFingering {
  const note = clamp(Math.round(m), TUBA_LO, TUBA_HI);
  return valveFingering(note, OPEN, note === TUBA_LO ? PARTIALS : PARTIALS.slice(1), VALVES4) ?? { valves: '0', lower: 0, partial: 2 };
}

/** the tube's length (m) for a fingering: the open tube lengthened by its valves */
export const tubaTubeLength = (f: TubaFingering): number => TUBA_LENGTH * Math.pow(2, f.lower / 12);

export { partialCents };
/** how sharp a fingering's valves stand together (valves.ts valveSharp) */
export const tubaValveSharp = valveSharp;
/** What a player leaves of it (cents; + sharp). The valves' sharpness is pulled out with a slide and the
 *  lips: all but 15 % of it, and never more than 12 ¢ left (the Iowa tubist's notes with two valves or more
 *  stand within a few cents of the open ones; his E♭1 at fortissimo, 2+3+4 unpulled, is 76 ¢ sharp). Half of
 *  a partial's own distance from equal temperament is left (his fifth-partial notes, D3–E3, are 14 ¢ under
 *  their neighbours: he leaves it all). */
export function tubaIntonation(f: TubaFingering): number {
  return Math.min(12, 0.15 * tubaValveSharp(f.valves)) + 0.5 * partialCents(f.partial);
}

/** The tuba's player (lipcone.ts LipConeHuman). A held note's breath blooms and sags (the Iowa notes' level
 *  peaks a quarter to a third of the way through a one-second note and falls 2–4 dB/s after: played alone,
 *  each a little arch; here it comes up 1.2 dB and sags 0.6 dB in its first second and 1.5 dB in five, a
 *  note in a line being held up; a per cent of breath is a tenth of a decibel), the pitch wanders 2 ¢ (theirs:
 *  1.4–2.4 ¢, the model's alone 0.3), no vibrato (they have none). From note to note the tongue, the kick,
 *  the breath and the lips' first setting each vary a little, and the tongue's release is a puff of air
 *  (scripts/tuba-variation.ts). */
export const TUBA_HUMAN: LipConeHuman<TubaFingering> = {
  seed: 580,
  bloom: 0.12,
  bloomTau: 0.16,
  sag: 0.18,
  sagTau: 2.5,
  drift: 0.02,
  wander: 4,
  hold: 0.25,
  kick: 0.15,
  vel: 3,
  scoop: 12,
  scoopTau: 0.05,
  puff: 4,
  puffTau: 0.03,
  intonation: tubaIntonation,
};

/** The voicing (lipcone.ts LipConeVoice): the lips, the bore's losses and the radiation's colour. Fitted to
 *  the University of Iowa MIS tuba (pp/mf/ff, C1–C4) with scripts/fit-tuba.ts on the fit half of its notes
 *  (even MIDI numbers), judged on the held-out half (scripts/judge.ts): BETTER than the horn's voicing set
 *  to a tuba's bell by hand, held-out 10.83 → 5.89 (artifacts/round3/tuba/NOTES.md). The fit: 14.9 → 3.27. */
export const TUBA_VOICE: TubaVoice = {
  lipQ: 54.47,
  lipQTop: 54.91,
  lipBelow: 0.6365,
  h0: 0.02052,
  hMax: 2.628,
  zeta: 2,
  zetaTop: 1.042,
  gammaLo: 0.2004,
  gammaHi: 0.8033,
  gammaCurve: 2.5,
  gammaExp: -0.0176,
  riseLo: 0.005,
  riseHi: 0.04509,
  riseExp: -0.2639,
  tongueHold: 0.01833,
  tongueRel: 1.963,
  kick: 1.65,
  qAttack: 0.3531,
  qTau: 0.189,
  attackBoost: 1.283,
  attackTau: 0.03773,
  apexRel: 3.639,
  steep: 0.009428,
  bellFc: 799.6,
  bellQ: 0.557,
  wall: 0.948,
  noise: 0.4,
  noiseTop: 0.16,
  noiseSoft: 0.5,
  hp: 299.7,
  f1: 601.6,
  g1: 15.9,
  q1: 0.8037,
  lp: 1796,
  lpQ: 0.7374,
  lpExp: 0.1742,
  lpDyn: 2.469,
  shelfF: 2707,
  shelfG: 6,
  tilt: -1.901,
};

/** the tuba: the shared core (lipcone.ts) at the tuba's compass, fingering and voicing */
export class TubaCore extends LipConeCore<TubaFingering> {
  declare readonly id: 'tuba';
  /** measured voicing table (scripts/tune-tuba.ts): cents the bare model plays sharp, by sample rate */
  static tuningTable: TuningTable = tubaTuning as TuningTable;
  constructor(opts: { sampleRate: number; params?: Partial<TubaParams>; dry?: boolean; player?: number }) {
    super(
      {
        id: 'tuba',
        lo: TUBA_LO,
        hi: TUBA_HI,
        rest: 48,
        voice: TUBA_VOICE,
        tuning: () => TubaCore.tuningTable,
        // Its level is set beside the horn's (its ff notes at −18 dBFS, the horn's at −17.5), not at the Iowa
        // tuba session's, which was recorded 19 dB under the Iowa horn's (ff −33…−37 dBFS): a tuba at ff is no
        // quieter than a horn (the brass's sound powers lie within a few dB of each other: Meyer 1990, cited
        // in instrument.ts PLAYBACK_DB). So the judge's level measure, alone, stays 19 dB off.
        gain: 0.5617,
        seed: 58,
        // A stopped note on five metres of wide tube rings on longer than a horn's: with the horn's 60 dB/s
        // a file's detached notes (100 ms, 60 ms rests) ran together (the rest 0 dB under the next note,
        // packages/engine/test/mono.test.ts); 140 dB/s leaves each its own (5 dB), about what the lips and
        // the deep cup take from a real tuba's low resonances (Q 20–40: 60–120 dB/s by themselves)
        stopRate: 140,
        human: TUBA_HUMAN,
        fingering: tubaFingering,
        tubeLength: tubaTubeLength,
        prep: (fg) => `valves ${fg.valves}, partial ${fg.partial}`,
        meta: (fg) => `valves ${fg.valves} · partial ${fg.partial}`,
      },
      opts,
    );
  }
}
