// French horn (the double horn in F and B♭): buzzing lips driving a long, narrow bore wound in a circle,
// most of it conical, opening into a wide bell with the player's right hand in it. The trumpet's family
// (brass.ts): the lips are a valve the breath blows open, the bore a delay loop whose round trip sets the
// harmonic series, the valves lengthen it and the lips' tension picks which partial of it sounds.
//
// The engine is shared with the tuba (lipcone.ts: the lips, the conical bore, the tongue, the note handling);
// this file is the horn: its compass, its double tube and valves, its fitted voicing.
//
// The bore. The F horn's tube is 3.7 m and the B♭ horn's 2.8 m (Fletcher & Rossing 1998, "The Physics of
// Musical Instruments" §14.6; Campbell, Gilbert & Myers 2021, "The Science of Brass Instruments" §8): the
// double horn has both, the thumb valve choosing. Their resonances (the mouthpiece and the bell make them a
// nearly harmonic series above the first) are the partials of F1 (43.7 Hz) and B♭1 (58.3 Hz). A horn plays
// high in its series, to the 16th partial on the F side: neighbouring resonances a semitone or two apart,
// the lips choosing among them. Most of the horn's bore widens steadily (the mouthpipe and the bell's long
// flare; Campbell, Gilbert & Myers 2021 §8.2): as a cone, it plays the whole series n·c/2(L + x₀). So the
// bore is the oboe's and bassoon's "cylindrical saxophone" (Dalmont, Gilbert & Kergomard 2000, Acta Acustica
// 86, 671): two delay lines meeting at the lips, the tube itself and its missing apex x₀ (the cone carried
// on behind the mouthpiece), both open (−1 at 0 Hz). (A single tube closed at the lips and open at the
// bell plays only the odd multiples of c/4L: a clarinet.) At the far end the bell reflects the lows and
// lets the highs out (a low-pass reflection; above the bell's cutoff the resonances fade, which is why the
// top of the compass is hard), with a little wall loss; the tube's round trip plus the apex's is one
// period of the tube's fundamental, so its n-th resonance is the note. The players' standard double-horn
// fingering (hornFingering) sets the side, the valves and the partial: the F side up to C4, the B♭ side
// from C♯4 (the thumb valve down), as most players switch near written G♯4.
//
// The lips. A one-mass "outward-striking" valve (Helmholtz's lip reed; Fletcher 1979, Acustica 43, 63;
// Elliott & Bowsher 1982, JSV 83, 181; Adachi & Sato 1996, JASA 99, 1200): the pressure difference across
// them, Δp = mouth − mouthpiece, pushes them open, so a mass–spring driven by Δp, its resonance a little
// under the note (an outward-striking valve plays just above its own resonance, where its motion lags the
// pressure by more than a quarter cycle). The flow through the slit is Bernoulli's, u = ζ·h·√|Δp|·sgn Δp,
// h = max(0, h₀ + y) the opening; and the mouthpiece pressure p = a₁ + a₂ + u/2 (Z_c = 1; a₁, a₂ the waves
// back from the bell and from the apex, the flow splitting between the two branches). Both are solved
// together each sample in closed form (a quadratic in √|Δp|). In units where
// the lips' static opening grows by one per unit of Δp: γ the mouth pressure, the dynamic.
//
// The sound. The radiated wave is what the bell lets out (the complement of its reflection), then the
// horn's colour, fitted to the recordings: the hand in the bell and the bell turned away from the listener
// darken it, and the horn's harmonics gather near 450–600 Hz whatever the note (the University of Iowa
// horn: the strongest harmonic is the 7th–9th at B♭1, the 3rd at E♭3, the 2nd at C4, the fundamental above
// F4). Loud, the horn turns brassy: its lips close sharply each cycle, and the wave steepens on its way down
// the long narrow tube (a crest travels faster than a trough; Hirschberg et al. 1996), so what reaches the
// bell is read earlier or later by its own pressure: a loud note radiates high harmonics a soft one does not
// (the corner of the fall moves up with the dynamic too).

import { clamp } from './util.ts';
import { LipConeCore, type ConeFingering, type LipConeHuman, type LipConeParams, type LipConeVoice, type TuningTable } from './lipcone.ts';
import { partialCents, valveFingering, valveSharp, VALVES3 } from './valves.ts';
import hornTuning from './horn-tuning.json';

export type HornParams = LipConeParams;
export type HornVoice = LipConeVoice;

/** the compass, B♭1–F5 as it sounds (MIDI 34–77): the horn in F's written F2–C6, a fifth higher. The
 *  usual orchestral compass is written F♯2–C6 (sounding B1–F5); the low B♭1 is the B♭ side's pedal */
export const HORN_LO = 34;
export const HORN_HI = 77;
/** the open tubes' fundamentals (MIDI): F1 for the F side, B♭1 for the B♭ side (the thumb valve) */
const F_SIDE = 29;
const BB_SIDE = 34;
/** their lengths, m (Fletcher & Rossing 1998 §14.6) */
export const HORN_F_LENGTH = 3.74;
export const HORN_BB_LENGTH = 2.8;
/** the valves' combinations by how far they lower the tube (semitones), as horn players use them: the
 *  second valve a semitone, the first a tone, 1+2 (for the third) a minor third, then 2+3, 1+3, 1+2+3
 *  (valves.ts) */
const VALVES = VALVES3;
/** the partials players use: the 7th, 11th, 13th and 14th are out of tune with equal temperament */
const PARTIALS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16];

export interface HornFingering extends ConeFingering {
  /** 'F' the F horn, 'Bb' the B♭ horn (the thumb valve pressed) */
  side: 'F' | 'Bb';
  /** the valves down: '0' (open), '2', '1', '1+2', '2+3', '1+3', '1+2+3' */
  valves: string;
  /** how far the valves lower the tube (semitones) */
  lower: number;
  /** which resonance of the tube sounds (1 = its fundamental, the pedal) */
  partial: number;
}

/** The standard double-horn fingering for a note as it sounds: the F side up to C4 (written G4), the B♭
 *  side from C♯4 (written G♯4), the fewest valves on the lowest usable partial. The common charts' (e.g.
 *  Farkas, "The Art of French Horn Playing", 1956): written C4 F 0, B♭4 T1, B4 T2, C5 T0, F5 T0, F♯5 T2,
 *  G5 T0, B♭5 T1, B5 T2, C6 T0. The low B♭1 (written F2) is the B♭ side's open pedal. */
export function hornFingering(m: number): HornFingering {
  const note = clamp(Math.round(m), HORN_LO, HORN_HI);
  const sides: ('F' | 'Bb')[] = note >= 61 ? ['Bb', 'F'] : note === HORN_LO ? ['Bb'] : ['F', 'Bb'];
  for (const side of sides) {
    const base = side === 'F' ? F_SIDE : BB_SIDE;
    // (the pedal only for the low B♭: elsewhere a partial ≥ 2)
    const f = valveFingering(note, base, note === HORN_LO ? PARTIALS : PARTIALS.slice(1), VALVES);
    const best: HornFingering | null = f ? { side, ...f } : null;
    if (best) return best;
  }
  return { side: 'F', valves: '0', lower: 0, partial: 4 };
}

/** the tube's length (m) for a fingering: the side's open tube lengthened by its valves */
export const hornTubeLength = (f: HornFingering): number => (f.side === 'F' ? HORN_F_LENGTH : HORN_BB_LENGTH) * Math.pow(2, f.lower / 12);

/** What a horn player leaves of a fingering's own intonation (cents; + sharp), as the tuba's (tuba.ts
 *  tubaIntonation): 15 % of the valves' sharpness when two or more are down, never more than 12 ¢, and half
 *  of a partial's distance from equal temperament (the Iowa hornist's tenth-partial notes, C♯5 and D5, are
 *  20 ¢ under their neighbours at mf and ff: he leaves more than that; his fifth-partial ones are not flat). */
export function hornIntonation(f: HornFingering): number {
  return Math.min(12, 0.15 * valveSharp(f.valves)) + 0.5 * partialCents(f.partial);
}

/** The horn's player (lipcone.ts LipConeHuman), by what the University of Iowa MIS hornist's notes differ by
 *  (scripts/trombone-variation.ts --instrument horn; the model alone in brackets). A held note's level
 *  peaks an eighth to a quarter of the way through a two-second note (at once) and then falls 0.2–0.3 dB/s
 *  (not at all), wandering 0.05–0.09 dB (0.02–0.03); its pitch wanders 2–4 ¢ (0.0). From one note to the
 *  next the pitch stands ±6–10 ¢ from the run's own tuning (±0.1: his were played alone with nothing to tune
 *  to, so less of it is given here: the fingering's own intonation and ±3 ¢ by ear), the strength ±0.5–0.8
 *  dB (±0.06), the attack's length ±40–50 % (±7 %). No vibrato (he has none). A note known to be short
 *  gets less of the attack's variation, a quick one none. */
export const HORN_HUMAN: LipConeHuman<HornFingering> = {
  seed: 581,
  bloom: 0.18,
  bloomTau: 0.22,
  sag: 0.1,
  sagTau: 2.5,
  drift: 0.02,
  wander: 5,
  slow: 3,
  slowTau: 1.2,
  place: 3,
  hold: 0.25,
  kick: 0.12,
  rise: 0.3,
  vel: 4,
  scoop: 8,
  scoopTau: 0.05,
  puff: 3,
  puffTau: 0.03,
  quick: true,
  intonation: hornIntonation,
};

/** The voicing (lipcone.ts LipConeVoice): the lips, the bore's losses and the radiation's colour. Fitted to
 *  the University of Iowa MIS horn (pp/mf/ff, B♭1–F5) with scripts/fit-horn.ts on the fit half of its notes
 *  (even MIDI numbers), judged on the held-out half (scripts/judge.ts);
 *  artifacts/realistic-3d/final-symphony/horn/NOTES.md. The fitted voicing (fit 4: the fit half 10.9 → 2.81,
 *  held-out 3.68) */
export const HORN_VOICE: HornVoice = {
  lipQ: 46.97,
  lipQTop: 54.91,
  lipBelow: 0.6092,
  h0: 0.0249,
  hMax: 2.14,
  zeta: 1.9,
  zetaTop: 0.4556,
  gammaLo: 0.25,
  gammaHi: 0.6398,
  gammaCurve: 2.156,
  gammaExp: 0.07153,
  riseLo: 0.01711,
  riseHi: 0.04787,
  riseExp: 0.01243,
  tongueHold: 0.01205,
  tongueRel: 2.621,
  kick: 1.035,
  qAttack: 0.3887,
  qTau: 0.1129,
  attackBoost: 1.054,
  attackTau: 0.08686,
  apexRel: 3.457,
  steep: 0.02051,
  bellFc: 1213,
  bellQ: 0.5402,
  wall: 0.9463,
  noise: 0.1743,
  noiseTop: 0.1697,
  hp: 267,
  f1: 663,
  g1: 1.473,
  q1: 0.3206,
  lp: 1914,
  lpQ: 0.5541,
  lpExp: -0.07217,
  lpDyn: 1.88,
  shelfF: 3000,
  shelfG: -18.63,
  tilt: 2.34,
};

/** the horn: the shared core (lipcone.ts) at the horn's compass, fingering and voicing */
export class HornCore extends LipConeCore<HornFingering> {
  declare readonly id: 'horn';
  /** measured voicing table (scripts/tune-horn.ts): cents the bare model plays sharp, by sample rate */
  static tuningTable: TuningTable = hornTuning as TuningTable;
  constructor(opts: { sampleRate: number; params?: Partial<HornParams>; dry?: boolean; player?: number }) {
    super(
      {
        id: 'horn',
        lo: HORN_LO,
        hi: HORN_HI,
        rest: 65,
        voice: HORN_VOICE,
        tuning: () => HornCore.tuningTable,
        // matched to the Iowa horn: the median note's level as recorded (pp, mf and ff each within 0.3 dB of
        // it; its ff, −17.5 dB, sits with the Iowa trumpet's −16.9 and bassoon's −18.1)
        gain: 0.5617,
        seed: 60,
        human: HORN_HUMAN,
        fingering: hornFingering,
        tubeLength: hornTubeLength,
        prep: (fg) => `${fg.side === 'Bb' ? 'B♭ side' : 'F side'}, valves ${fg.valves}, partial ${fg.partial}`,
        meta: (fg) => `${fg.side === 'Bb' ? 'B♭' : 'F'} · valves ${fg.valves} · partial ${fg.partial}`,
      },
      opts,
    );
  }
}
