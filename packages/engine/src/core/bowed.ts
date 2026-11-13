// Bowed string instruments (violin, viola, cello, double bass).
//
// Each of the four strings is a digital waveguide (one circular buffer for the
// round trip, finger/nut inversion applied at the bridge read, fractional
// Lagrange read so the stopped length can glide for vibrato). The bow acts at an
// interior point with a hyperbolic friction law, μ(Δv) = μd + (μs−μd)·v0/(v0+|Δv|),
// solved per sample with the stick/slip hysteresis rule of McIntyre, Schumacher &
// Woodhouse (1983) — Helmholtz motion is not imposed, it emerges (on the cello the bow touches
// the string over the hair ribbon's width, between samples; see design.bowWidth). All four
// strings (open ones too) end on one bridge coupled through a passive junction to
// a modal body built from each instrument's signature modes (A0 air mode, CBR,
// B1−/B1+, then statistically dense modes), so open strings resonate
// sympathetically. Radiation: modal velocities to two microphones + a high-
// frequency path, the bridge-hill formant, a small room.

import { Pump } from './pump.ts';
import { CC_DYNAMICS, DYN_TAU, type BowedId, type ExciteTrace, type InstrumentCore, type InstrumentId } from './instrument.ts';
import type { KeySummary } from '../api/messages.ts';
import type { PianoEvent } from './piano-core.ts';
import { designLossFilter, onePolePhaseDelay, biquadHighpass, biquadLowpass, biquadPeaking, biquadHighShelf } from './filters.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { Human, LN1000, clamp, gauss, mulberry32, nextPow2, playerCents, playerSeed } from './util.ts';
import bowedFit from './bowed-fit.json';

export interface BowedParams {
  /** bow–bridge distance as a fraction of the vibrating length (sul ponticello ≈ 0.04, sul tasto ≈ 0.2) */
  bowPosition: number;
  /** bow force as a fraction of Schelleng's maximum for the current bow speed and position */
  bowPressure: number;
  /** vibrato depth, cents */
  vibrato: number;
  /** multiplier on the body's modal loss factors */
  bodyDamping: number;
  room: number;
  volume: number;
  /** compute resonance of the strings that are not bowed */
  sympathetic: boolean;
  /** bow changes: alternate down/up-bow per détaché note and change bow when the hair runs out */
  bowChanges: boolean;
  /** duration of a bow change (speed reversal), s */
  bowChangeTime: number;
  /** orchestra mode: where it sits on the stage (post.ts Seat); none, the single instrument's place */
  seat?: Seat | null;
  /** how much of the left hand's own placing (BOWED_HUMAN): 0 every stopped note on the model's own pitch
   *  (what is fitted and judged; the engine before the hand had it) … 1 a finger put down by ear */
  human?: number;
}

/** The left hand. A string player has no frets: a finger is put down where the ear expects the note, a few
 *  cents either side of it (`place`, cents, a standard deviation), stays there while the note is bowed again,
 *  and is put down anew once it has been lifted; an open string is the string. (The cello's finger then
 *  follows its ear: design.byEar.) The rest of what no two notes have alike was the strings' already: each
 *  note's vibrato begins at its own phase and rate and wanders, with the bow's speed and force (design.wander),
 *  and the bow's strokes are planned from what is to come (foresee). Players' intonation scatters by 5–10 ¢
 *  and more on isolated notes (the Iowa string runs' notes stand ±13–22 ¢ from their runs' own tuning, read
 *  roughly: scripts/trombone-variation.ts --instrument violin); less is given here, as to the winds: those
 *  notes were played alone with nothing to tune to. Scaled by `human`; a seeded stream of its own, so the
 *  same notes give the same samples and `human` 0 is the engine as it was, bit for bit. */
export const BOWED_HUMAN = { seed: 584, place: 4 };

interface StringDef {
  name: string;
  open: number;
  /** tension, N */
  T: number;
}

interface BodyMode {
  f: number;
  eta: number;
  /** effective modal mass at the bridge, kg */
  m: number;
  /** radiation weight (monopole-ish) */
  rad: number;
}

interface BowedDesign {
  id: InstrumentId;
  label: string;
  /** vibrating length nut–bridge, m */
  L: number;
  strings: StringDef[];
  /** intrinsic string T60 (s) at the open fundamental and at 3 kHz */
  t60: [number, number];
  /** signature body modes (violin-family nomenclature) */
  signature: BodyMode[];
  /** statistical modes: lowest frequency, top, mean spacing at 1 kHz (Hz), mass, eta */
  stat: { fLo: number; fHi: number; spacing: number; mass: number; eta: number };
  /** local bridge admittance (s/kg) */
  bridgeY: number;
  /** bridge-hill formant [Hz, dB, Q] and extra EQ */
  eq: [number, number, number][];
  /** bow speed range (m/s) mapped from MIDI velocity */
  bowSpeed: [number, number];
  /** usable hair length of the bow, m */
  bowLength: number;
  /** high-frequency radiation: statistical body mobility above the modal range, as a gain on
   *  the bridge force and its high-pass corner (Hz) */
  hf: [number, number];
  /** bow-force multiplier on bowPressure at pp and at ff (linear in velocity) */
  forceDyn: [number, number];
  /** bow-position multiplier at pp and at ff: players play louder mainly by moving the bow
   *  towards the bridge (Schelleng), which raises the Helmholtz amplitude ∝ v/β and, at a
   *  fixed fraction of the maximum force, the force itself */
  betaDyn: [number, number];
  outputGain: number;
  defaults: Partial<BowedParams>;
  seed: number;
  /** Radiation chain v2 (cello only so far; violin/viola keep the round-2 chain bit for bit).
   *  Far-field pressure follows the body's volume ACCELERATION, not its velocity (a compact
   *  source: p = ρ·Q̇/4πr, e.g. Fletcher & Rossing, The Physics of Musical Instruments, §7.1),
   *  i.e. +6 dB/octave on the modal velocities; and the force reaches the body through the
   *  bridge, whose first in-plane resonances (cello ≈ 1 kHz and ≈ 2 kHz, Reinicke 1973, in
   *  Cremer, The Physics of the Violin, ch. 9) shape the "bridge hill" and the steep fall
   *  above it. `radRef` is the frequency (Hz) at which the derivative has unit gain. */
  radiation?: { radRef: number; bridge: [number, number][]; statRad: number };
  /** Coupling of an idle open string to the bridge motion the bowed string drives (the cello, the
   *  bass and, since audio audit 3, the viola: see VIOLA; absent, the violin: 1, the round-2 junction).
   *  A one-point, one-degree-of-freedom bridge lets an undamped open string pin the bridge at its
   *  harmonics (a dynamic absorber): the octave above each open string came out 5–11 dB weaker
   *  than its neighbours and pulled up to 15 ¢ off pitch, which the Iowa cello does not show.
   *  On the instrument the strings cross the bridge at an angle, vibrate in two polarizations
   *  and continue to a resonant tailpiece; this ratio stands in for that (fitted, not measured).
   *  Applied as an ideal transformer at the junction, so the junction stays passive. */
  idleCoupling?: number;
  /** pitch compensation over this many harmonics, weighted 1/k (v2; absent: the first three, unweighted) */
  tuneHarmonics?: number;
  /** the exponent p of those weights, 1/k^p (absent: 1, the sawtooth's amplitudes). Each period's
   *  slip is set off by the arriving Helmholtz corner, which the upper harmonics carry as much as
   *  the low ones, so with a bridge whose phase turns over the bridge hill (design.bridgeMass) the
   *  1/k sum sharpened the open strings by 2–4 ¢; fitted on the fit half's open strings
   *  (C2, D3 at pp/mf/ff: RMS 1.46 ¢ at p = 1, 1.27 at the fitted 0.85; held-out G2, A3: 2.81 → 2.13). */
  tuneWeight?: number;
  /** Torsional waves (cello only so far). The bow grips the string's surface, which moves with
   *  the transverse velocity plus the torsional (rolling) velocity; torsion is fast, compliant
   *  and heavily damped, and it steadies the stick–slip (Cremer, The Physics of the Violin,
   *  ch. 5–6; Woodhouse & Galluzzo 2004, Acta Acustica 90). Wave speed relative to the
   *  transverse (Gillan & Elliott 1989 measured 2–7× on violin-family strings), surface-referred
   *  impedance relative to the transverse (a solid string: Zt/Z = ct/2c), and the torsional Q. */
  torsion?: { speedRatio: number; impedanceRatio: number; q: number };
  /** per-string multipliers on the high-frequency string decay t60[1], lowest string first (v2):
   *  the heavy overwound C and G strings lose their upper partials faster than the D and A
   *  (internal friction of the winding; Valette, in Mechanics of Musical Instruments, 1995) */
  t60HString?: number[];
  /** bow-speed attack time constant at pp and at ff, s (v2; absent: 45 ms at every dynamic).
   *  A player starts a soft note with a slower bow acceleration (Guettler 2002, Acta Acustica 88). */
  attackTau?: [number, number];
  /** slurred string crossings (v2): a string taken up while the bow is already moving on another
   *  starts at the bow's speed (the bow rolls over onto it) instead of from rest */
  slurCrossing?: boolean;
  /** A player's hand is not a sine generator (v2): slow random wander of the vibrato's rate and
   *  depth (fractions, 1σ; Mellody & Wakefield 2000, JASA 107, measured violin vibrato rate and
   *  extent varying through a note) and of the bow's speed and force (Askenfelt 1989, JASA 86,
   *  measured bowing parameters fluctuating within a stroke); `tau` is their time constant, s. */
  wander?: { vibRate: number; vibDepth: number; speed: number; force: number; tau: number };
  /** Width of the bow's contact with the string, m (cello only so far). The hair is a flat ribbon
   *  about 1 cm wide (Guettler, "Some physical properties of the modern violin bow": the ribbon
   *  synchronises the slip across the hair width), and a finite-width contact changes how waves
   *  reflect and pass at the bow and rounds the Helmholtz corner (Pitteroff & Woodhouse 1998,
   *  Acta Acustica 84, "Mechanics of the contact area between a violin bow and a string", I–III).
   *  The ribbon is lumped as one contact (one stick/slip state, a rigid ribbon) that reads the
   *  string's velocity averaged over its width and spreads the friction force over the same width,
   *  the spreading operator of finite-difference bowed strings (Bilbao, Numerical Sound
   *  Synthesis, 2009, ch. 7). Absent: a point bow on whole samples (round 2/3).
   *  Without it, nothing physical sets the corner's width: it is one sample at any sample rate,
   *  and the one-sample pulses it leaves between bow and bridge trip extra slips at low force. */
  bowWidth?: number;
  /** Rosin noise: the friction coefficient's slow random fluctuation, as a fraction (absent: the
   *  round-2 0.04). Rosin softens and re-hardens under the sliding hair, so the friction is never
   *  quite a function of the slip speed alone (Smith & Woodhouse 2000, J. Mech. Phys. Solids 48,
   *  "The tribology of rosin"; Guettler: "while the string is sliding, stochastic noise is
   *  created"). Fitted for the cello: a clean Helmholtz motion otherwise reads several dB more
   *  harmonic than the Iowa recordings. */
  rosinNoise?: number;
  /** In an attack the player presses no harder than the moving bow can carry (cello only so
   *  far): the force rises on its own 12 ms time constant but never above Schelleng's maximum for
   *  the speed the bow has reached so far (∝ that speed). A clean attack needs a force inside a
   *  window that scales with the bow's acceleration (Guettler 2002, Acta Acustica 88, "On the
   *  creation of the Helmholtz motion in bowed strings"): the full force of a loud note on a bow
   *  that has not yet gathered speed is above it, and the string creaks into a raucous,
   *  multiply-slipping start; a force that only follows the speed starts below it. Absent: the
   *  force rises on its own, whatever the speed. */
  forceWithSpeed?: boolean;
  /** The same instrument at any sample rate (cello only so far): the per-sample smoothing of the
   *  loop's length, the rosin noise's low-pass and level and the torsional loss filter are defined
   *  in time and frequency (their round-2/3 values at 44.1 kHz), not as fractions per sample, and
   *  the bow taps the torsional waves at its exact, fractional place. Absent: the round-2/3
   *  per-sample constants, whose effect moved with the rate (the soft G2 and D3 changed regime
   *  between 44.1 and 96 kHz). */
  rateInvariant?: boolean;
  /** The bridge hill in the admittance the strings see (cello only so far), kg. The bridge's
   *  first in-plane (rocking) resonance, radiation.bridge[0], is a resonance of the bridge on the
   *  body: it shapes not only the force that reaches the body but the input admittance at the
   *  string notch, which rises into a broad, resistive "bridge hill" around it (Woodhouse 2005,
   *  Acta Acustica 91, "On the 'bridge hill' of the violin"; Jansson 2004; Reinicke 1973 for the
   *  cello bridge's resonances near 1 and 2 kHz). It is added here as a heavily damped, non-
   *  radiating mode at that frequency and Q (its damping capped like the body modes', ζ ≤ 0.45)
   *  with this effective mass at the notch (fitted within 1–10 g; a cello bridge weighs about
   *  8–9 g). The strings lose energy into it in the band where the bow–bridge segment of a soft,
   *  sul-tasto stroke rings (f0/β ≈ 0.5–2.5 kHz): without
   *  it those ripples were trapped between the stuck bow and a nearly rigid bridge, cut the slip
   *  short and locked the string into a bright, ripple-dominated motion at pp (or broke it into
   *  multiple slips), and which of the two depended on the attack and on the sample rate. */
  bridgeMass?: number;
  /** Intonation by ear (cello only so far): a cellist has no frets and moves the stopping finger
   *  until the note sounds in tune, all the time it sounds. The finger's place here starts where
   *  the loop's phases put the note (loopDelay) and is then corrected towards the period the
   *  string actually sounds, measured slip to slip, with this time constant (s): a few times the
   *  0.1–0.2 s latency of auditory pitch correction (Burnett et al. 1998, JASA 103, for the voice)
   *  and slow enough to leave the vibrato alone. It takes out what the phase sum cannot predict,
   *  mainly the flattening of a heavy bow (McIntyre & Woodhouse 1979; Schoonderwaldt 2009 measured
   *  violinists' pitch flattening with bow force), as a player does; open strings stay as tuned. */
  byEar?: number;
  /** The body as the Iowa recordings hear it (NEXT5; violin and viola: scripts/fit-bodies.ts, the
   *  values in bowed-fit.json). Absent: the hand-set eq and 7 kHz shelf of rounds 2–3.
   *  `bands`: the radiated response's envelope, fitted note by note to the recordings' harmonics on
   *  the fit half (even MIDI notes; the odd ones are held out for scripts/judge.ts): gains (dB) of
   *  peaking sections at these centres (Hz), Q `q`, in place of `eq` and the shelf. The modal body
   *  still radiates its own modes through them (the fine structure, the stereo, vibrato's flicker);
   *  the bands set where its energy goes on average, which the sketched modes had 10–30 dB too low
   *  above 3 kHz.
   *  `corner`: the Helmholtz corner's rounding. The friction law here (a function of the slip
   *  speed alone, McIntyre, Schumacher & Woodhouse 1983) keeps the corner nearly as sharp at pp as at
   *  ff, so the bridge force is a sawtooth to its 16th harmonic at every dynamic and a louder note
   *  even came out darker; on a real string the bow re-sharpens the corner on each passage against
   *  the losses that round it on each round trip, harder the harder it presses (Cremer, The Physics
   *  of the Violin, 1984, ch. 7: the corner's width falls as the bow force rises; Schoonderwaldt,
   *  Guettler & Askenfelt 2008, Acta Acustica 94, measured the spectral centroid rising with bow
   *  force). Both act once per period, so the corner is a fraction of the period. Stood in for by a
   *  first-order low-pass on the radiated sound at a harmonic of the note that follows the bow force
   *  over the string's impedance (F/Z, the velocity the bow's grip imposes, as in the friction solve):
   *  fc = corner[0] · f0 · (F/Z ÷ 1 m/s)^corner[1], fitted with the bands (a cutoff fixed in Hz fits
   *  the fit half worse: the violin's E string sounds far brighter than its G). It rounds only what
   *  is heard: the string's own motion (its pitch, attack, the bow's traces) is unchanged. */
  body?: { bands: [number, number][]; q: number; corner: [number, number] };
  /** The signature modes radiate in phase at both microphones (the double bass). The pair of
   *  microphones takes every third mode with the right channel inverted, for width; the first of
   *  them is A0, the f-hole air mode, which (with the B1 pair) is the body's monopole radiator and has
   *  one phase in every direction (Bissinger 2008, JASA 124, on the violin's radiativity). On the
   *  violin, viola and cello A0 sits above their fundamentals (275, 230, 102 Hz) and the inversion
   *  stays as it was; on the bass it is at 60 Hz, among its fundamentals, and the mono sum of an
   *  inverted A0 cancelled them by up to 23 dB (D2), which a fitted body then made up with a +24 dB
   *  band that was all too loud in stereo. With one weight at both (a monopole is the same in every
   *  direction): a random pan had left the bass 6 dB to the left wherever it was seated. Absent: as
   *  before. */
  inPhase?: boolean;
}

const VIOLIN: BowedDesign = {
  id: 'violin',
  label: 'Violin',
  L: 0.328,
  strings: [
    { name: 'G', open: 55, T: 44 },
    { name: 'D', open: 62, T: 42 },
    { name: 'A', open: 69, T: 50 },
    { name: 'E', open: 76, T: 73 },
  ],
  t60: [9, 0.9],
  // Jansson; Bissinger: A0 (f-hole Helmholtz), CBR, B1−, B1+, A1. A0's damping and weight and B1−'s
  // damping as fitted with the body (audio audit 2, scripts/fit-bodies.ts --levels 6 --mode 0:0.08:0.3
  // --mode 2:0.045): the fitted bands carry the body's average response, so a narrow A0 and B1− on top of
  // them were a second, unfitted peak. No Iowa note sits on A0 (the recordings have no C4 or C♯4), and
  // the fit half is indifferent to it (recording − model 7.8–8.3 dB from η 0.04 to 0.15, radiation 1
  // to 0.2); at η 0.04, weight 1, C♯4 played 23 dB over B3 and D4 (C4 15 dB), dry, ff, and the
  // limiter took 12–14 dB off it. Chosen so that A0's own note stands over its neighbours as far as the
  // Iowa cello's does over its own (G♯2 +6 to +10 dB): C♯4 +8 dB, C4 +4, A♯4 (B1−) +5. Judge: NO CLEAR
  // CHANGE (held-out 2.98 → 3.03, harmonics 9.15 → 8.68 dB).
  signature: [
    { f: 275, eta: 0.08, m: 0.35, rad: 0.3 },
    { f: 405, eta: 0.03, m: 0.6, rad: 0.25 },
    { f: 465, eta: 0.045, m: 0.28, rad: 0.85 },
    { f: 540, eta: 0.022, m: 0.3, rad: 1.0 },
    { f: 470 * 1.0 + 0, eta: 0.035, m: 1.2, rad: 0.4 },
  ],
  stat: { fLo: 600, fHi: 4800, spacing: 45, mass: 0.45, eta: 0.03 },
  bridgeY: 0.02,
  eq: [
    [2600, 3, 1.4],
    [180, -6, 0.8],
  ],
  bowSpeed: [0.05, 0.45],
  bowLength: 0.64,
  hf: [0.003, 2500],
  forceDyn: [1, 1],
  betaDyn: [1, 1],
  outputGain: 60,
  // bowPosition: β at velocity 80 (round 2: louder notes move the bow towards the bridge)
  defaults: { bowPosition: 0.093, bowPressure: 0.32, vibrato: 14, bodyDamping: 1, room: 0.35, volume: 1, sympathetic: true },
  seed: 21,
};

const VIOLA: BowedDesign = {
  ...VIOLIN,
  id: 'viola',
  label: 'Viola',
  L: 0.37,
  strings: [
    { name: 'C', open: 48, T: 55 },
    { name: 'G', open: 55, T: 50 },
    { name: 'D', open: 62, T: 45 },
    { name: 'A', open: 69, T: 60 },
  ],
  t60: [10, 0.9],
  // a viola's main resonances sit relatively higher than a scaled violin would put them. A0 damped and
  // weighted as the violin's (audio audit 2, refitted: --levels 6 --mode 0:0.08:0.3): its C♯4 and A♯3 had
  // played 12 dB over their neighbours (+27 dB fitted at 283 Hz on top of A0), now within 2–3 dB. Judge:
  // NO CLEAR CHANGE (held-out 4.56 → 4.58, harmonics 10.17 → 9.92 dB, attack 0.98 → 0.92 oct)
  signature: [
    { f: 230, eta: 0.08, m: 0.45, rad: 0.3 },
    { f: 340, eta: 0.03, m: 0.7, rad: 0.25 },
    { f: 390, eta: 0.022, m: 0.35, rad: 0.85 },
    { f: 465, eta: 0.022, m: 0.38, rad: 1.0 },
    { f: 410, eta: 0.035, m: 1.4, rad: 0.4 },
  ],
  stat: { fLo: 520, fHi: 4400, spacing: 40, mass: 0.55, eta: 0.03 },
  eq: [
    [2100, 3, 1.3],
    [150, -5, 0.8],
  ],
  bowSpeed: [0.05, 0.45],
  bowLength: 0.64,
  hf: [0.003, 2500],
  forceDyn: [1, 1],
  betaDyn: [1, 1],
  outputGain: 80,
  defaults: { bowPosition: 0.113, bowPressure: 0.32, vibrato: 12, bodyDamping: 1, room: 0.35, volume: 1, sympathetic: true },
  seed: 22,
  // Audio audit 3: the idle open strings loosely coupled, as the cello's and the bass's. Fully coupled, an
  // open string in tune with the note bowed beside it pinned the bridge at that partial and rang on for
  // seconds once the bow had left: G4 (the open G's octave) and C5 (the open C's fourth partial) played
  // 9–11 dB under the Iowa viola's at mf (D5 so far under that no pitch was found in it), and the bands,
  // fitted around them, left A4 and B4 as far under, so that A♯4, level with the recording's, stood
  // 9.8 dB over its neighbours (the recording's 3.3 dB). After such a note the sound took 1.73 s to fall
  // from 10 to 30 dB under the held level, the recording's 0.35 s (scripts/strings-tails.ts: the median
  // of 8 recorded notes, mf and ff). The ratio is the one whose tails are the recording's: 0.2 gives
  // 0.32 s (0.3: 0.52 s, 0.5: 1.77 s; the cello's, fitted, is 0.306). Bands refitted with it
  // (scripts/fit-bodies.ts viola --levels 6 --keep-speed --keep-hf --iters 4): A♯4 5.3 dB over its
  // neighbours, model − recording over the recorded notes 5.21 → 4.06 dB RMS at mf and 4.17 → 3.45 at ff
  // (the held-out notes 6.14 → 4.45 and 4.90 → 3.59: scripts/strings-levels.ts). Judge: NO CLEAR CHANGE
  // (held-out 4.42 → 4.29, Δ +0.13 ± 0.18; harmonics 10.06 → 9.59 dB, attack 1.02 → 0.69 oct). The violin
  // keeps the full coupling: see artifacts/round3/audio-audit-3/strings/NOTES.md.
  idleCoupling: 0.2,
};

const CELLO: BowedDesign = {
  ...VIOLIN,
  id: 'cello',
  label: 'Cello',
  L: 0.69,
  strings: [
    { name: 'C', open: 36, T: 130 },
    { name: 'G', open: 43, T: 140 },
    { name: 'D', open: 50, T: 145 },
    { name: 'A', open: 57, T: 165 },
  ],
  t60: [14, 1.0],
  // realistic-3d round: with radiation from acceleration the 160 Hz third-octave read +12 dB over
  // the Iowa cello; CBR (a twisting mode with little net volume flow, a weak radiator on violins
  // too: Bissinger 2008, JASA 124) 0.25 → 0.1 and B1− 0.85 → 0.3 (fitted)
  signature: [
    { f: 102, eta: 0.04, m: 1.6, rad: 1.0 },
    { f: 145, eta: 0.03, m: 2.6, rad: 0.1 },
    { f: 175, eta: 0.022, m: 1.3, rad: 0.3 },
    { f: 205, eta: 0.022, m: 1.4, rad: 1.0 },
    { f: 190, eta: 0.035, m: 5, rad: 0.4 },
  ],
  stat: { fLo: 240, fHi: 3600, spacing: 28, mass: 2.2, eta: 0.03 },
  bridgeY: 0.008,
  eq: [
    [1500, 3, 1.2],
    [70, -4, 0.8],
  ],
  bowSpeed: [0.06, 0.5],
  bowLength: 0.6,
  hf: [0.003, 2500],
  forceDyn: [1, 1],
  betaDyn: [1, 1],
  outputGain: 24,
  // vibrato: the Iowa cellist's median (17 ¢ at 5.4 Hz as analysed), round 2
  defaults: { bowPosition: 0.108, bowPressure: 0.3, vibrato: 20, bodyDamping: 1, room: 0.32, volume: 1, sympathetic: true },
  seed: 23,
  // realistic-3d round: the v2 radiation chain, loosely coupled idle strings, pitch over 40 harmonics
  // (the values fitted to the Iowa cello are in bowed-fit.json)
  radiation: { radRef: 1000, bridge: [[1000, 1.5], [2200, 1.5]], statRad: 1 },
  idleCoupling: 0.15,
  tuneHarmonics: 40,
  torsion: { speedRatio: 5, impedanceRatio: 3, q: 5 },
  slurCrossing: true,
  // (small: the force wander moves the pitch through the flattening effect, ±2 ¢ at these values)
  wander: { vibRate: 0.06, vibDepth: 0.2, speed: 0.015, force: 0.02, tau: 0.3 },
  // the hair ribbon's contact, m (a cello bow's ribbon is ~ 1 cm wide; Guettler; Pitteroff & Woodhouse 1998)
  bowWidth: 0.01,
  forceWithSpeed: true,
  rateInvariant: true,
  // the bridge hill's effective mass at the notch, kg (fitted in bowed-fit.json)
  bridgeMass: 0.002,
  byEar: 0.3,
};

// The double bass: a 3/4 orchestral instrument, the size most orchestral players use, tuned in
// fourths E1 A1 D2 G2 (it sounds an octave below the written part; MIDI files carry the sounding
// pitch). The same physics as the cello's v2 (torsion, the hair ribbon's width, the bridge hill,
// intonation by ear, rate invariance); its own sizes, strings and body. Starting values here are
// the literature's; what the Iowa double bass decided is in bowed-fit.json (scripts/fit-bodies.ts).
const BASS: BowedDesign = {
  ...CELLO,
  id: 'bass',
  label: 'Double bass',
  // vibrating length nut–bridge: 3/4 orchestral basses measure 1.04–1.06 m (the "mensur": makers'
  // standard 41–41.5" string length)
  L: 1.05,
  // steel-core orchestral strings, 27–34 kgf each on a 3/4 bass (manufacturers' tension tables,
  // e.g. Thomastik-Infeld Spirocore and Pirastro Evah Pirazzi orchestra sets)
  strings: [
    { name: 'E', open: 28, T: 330 },
    { name: 'A', open: 33, T: 315 },
    { name: 'D', open: 38, T: 300 },
    { name: 'G', open: 43, T: 285 },
  ],
  t60: [16, 0.5],
  // Askenfelt, "Eigenmodes and tone quality of the double bass" (STL-QPSR 23(4), 1982): the f-hole
  // air mode near 60 Hz, the strong corpus modes from about 90 to 130 Hz, an octave above the open
  // E; the cello's set scaled by the body (×1.47 longer) and its larger, thinner plates. Modal masses
  // scale with the strings' impedance (≈ 2.6× the cello's), so the strings load the body alike. Loss
  // factors 2.5× the cello's (fitted): with the cello's, a note whose harmonic met a mode came out up
  // to 10 dB louder than its neighbours (median step between neighbouring notes 6.4 dB at mf; the
  // Iowa bass's 3.0 dB; 2.5×: 4.5 dB). A bass's large, thin plates radiate their low modes away fast.
  signature: [
    { f: 60, eta: 0.1, m: 4.2, rad: 1.0 },
    { f: 88, eta: 0.075, m: 6.8, rad: 0.1 },
    { f: 105, eta: 0.055, m: 3.4, rad: 0.3 },
    { f: 125, eta: 0.055, m: 3.6, rad: 1.0 },
    { f: 115, eta: 0.0875, m: 13, rad: 0.4 },
  ],
  stat: { fLo: 150, fHi: 2800, spacing: 22, mass: 5.5, eta: 0.075 },
  bridgeY: 0.004,
  eq: [
    [900, 0, 1.2],
    [50, 0, 0.8],
  ],
  bowSpeed: [0.0505, 0.394],
  // a French bass bow: a stick of 71–75 cm, about 0.58 m of hair (makers' figures)
  bowLength: 0.58,
  hf: [0.0163, 5810],
  forceDyn: [1.08, 2.2],
  betaDyn: [1.22, 0.721],
  outputGain: 157,
  // vibrato: the Iowa bassist plays most notes without; where there is one it runs at 6–7 Hz, 15–30 ¢
  // (scripts/ensemble-refs.ts: the many 3 Hz, 3–8 ¢ detections are a slow drift, not a vibrato); a
  // moderate 12 ¢ at the family's 5.2–6 Hz. bowPosition: the cello's β, about 11 cm from the bridge
  defaults: { bowPosition: 0.108, bowPressure: 0.3, vibrato: 12, bodyDamping: 1, room: 0.32, volume: 1, sympathetic: true },
  seed: 24,
  // the bass bridge is taller and heavier than the cello's (a 3/4 bass bridge stands ~ 16 cm), so
  // its in-plane resonances sit lower; fitted with the bands (bowed-fit.json)
  radiation: { radRef: 1000, bridge: [[650, 1.9], [1800, 0.584]], statRad: 0.188 },
  idleCoupling: 0.306,
  tuneHarmonics: 40,
  tuneWeight: 0.85,
  torsion: { speedRatio: 5, impedanceRatio: 3.68, q: 2.92 },
  // every bass string is wound; the heavier the winding, the faster its upper partials go
  t60HString: [0.5, 0.6, 0.75, 1],
  attackTau: [0.4, 0.13],
  // a bass bow carries more hair: a ribbon of about 13 mm (makers' figures)
  bowWidth: 0.013,
  rosinNoise: 0.226,
  // effective mass of the bridge hill at the notch (the bass bridge weighs about 3× the cello's)
  bridgeMass: 0.0065,
  inPhase: true,
};

export const BOWED: Record<string, BowedDesign> = { violin: VIOLIN, viola: VIOLA, cello: CELLO, bass: BASS };
// round 2: radiation balance, dynamics and string HF loss fitted to the Iowa MIS recordings
// (scripts/fit-strings.ts); absent keys keep the literature values above
for (const [id, fit] of Object.entries(bowedFit as unknown as Record<string, Partial<BowedDesign>>)) if (BOWED[id]) Object.assign(BOWED[id], fit);

/** Controllers above MIDI's 0–127 for the bow in the player's hand (see BowedCore.hand): its signed
 *  speed in m/s (+ down-bow; the first one takes the bow from the keys), its contact point along the
 *  hair (0 frog … 1 tip), and letting go. */
export const CC_HAND_BOW_SPEED = 128;
export const CC_HAND_BOW_POS = 129;
export const CC_HAND_BOW_OFF = 130;
/** CC_DYNAMICS (instrument.ts): its range, velocity steps either way, and the vibrato's widening per step */
const DYN_MAX = 64;
const VIB_PER_STEP = 0.0125;

/** The bow planned ahead (BowedCore.foresee): how far the player reads ahead of the bow (s); the
 *  slowest and the fastest a stroke is drawn, of the speed its dynamic asks for (the contact point
 *  moves with it, nearer the bridge for a slower bow, so the string's amplitude v/β stays the
 *  dynamic's: Schelleng 1973, JASA 53, §IV; Askenfelt 1989, JASA 86, measured players at 4 cm/s to
 *  over 1 m/s and long notes drawn slowly near the bridge); the hair kept clear at each end, of the
 *  bow's length; the shortest rest in which the bow is lifted and set down elsewhere, and the rest
 *  after which a phrase begins anew (s); how long before a note the lifted bow moves to it, and the
 *  time constant of that move (s). */
export const BOW_LOOK = 4;
const K_LO = 0.45;
const K_HI = 1.25;
const BOW_MARGIN = 0.06;
const RETAKE_MIN = 0.12;
const PHRASE_REST = 1;
const RETAKE_LEAD = 0.45;
const RETAKE_TAU = 0.07;
/** a note is the one foreseen if it begins within this of it (s) */
const FORESEE_TOL = 0.03;
/** the contact point a planned stroke may be given, of the string's length */
const BETA_PLAN: [number, number] = [0.04, 0.28];

/** velocity (0..1 of 1..127) at which bowPosition is the actual β: MIDI 80 */
const X_REF = 79 / 126;
const MU_S = 0.8;
/** The stopping finger stays on a string the bow has left while the string still rings, and lifts (at the
 *  earliest 0.3 s after the bow) once its ring is `quiet` of what it was as the bow left; lifting, the fingertip
 *  damps what is left (half off the string it is a damper at the stopping point): `db` over `s` seconds, then
 *  the string is open. (Audio audit 2: lifted 0.3 s after the bow, at once, a stopped note's tail, 20–27 dB
 *  down, came back 7–15 dB louder: violin D5 −27 → −20 dB, viola C4 −27 → −13, re the held note, with
 *  vibrato. A note in tune with an open string's partial rings that string in sympathy, and the two, coupled
 *  at the bridge, ring on in a pair whose forces there nearly cancel, as two unison piano strings do in their
 *  aftersound (Weinreich 1977, JASA 62, 1474); a finger lifted from one of them ends the pair and the other is
 *  heard whole. Lifted at once, the stopped string also sounded again at the open string's pitch.) */
const FINGER_LIFT = { s: 0.04, db: 40, quiet: 1e-3 };
const MU_D = 0.3;
const V0 = 0.2;
const MAX_BUF = 1 << 14;
const TRACE = 2048;

const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** The bow's contact profile over the delay line (design.bowWidth): a raised cosine of equivalent
 *  width W samples centred at delay x (fractional), i.e. the pressure across the ribbon falls to
 *  zero at its edges; sampled at the whole delays j with |j − x| < W and normalised to sum 1.
 *  Writes the taps at idx/h from offset o and returns their count. For W ≥ 2 its Σh² does not
 *  depend on where x falls between samples, so the contact's admittance does not wobble as the
 *  finger side of the loop glides under vibrato. The cosines of the evenly spaced taps come from
 *  a rotation by π/W (cd, sd = its cosine and sine), one cos/sin pair per call. No allocation. */
function contactTaps(x: number, W: number, cd: number, sd: number, idx: Int32Array, h: Float64Array, o: number): number {
  let n = 0;
  let sum = 0;
  const j0 = Math.floor(x - W) + 1;
  const a0 = (Math.PI * (j0 - x)) / W;
  let c = Math.cos(a0);
  let sn = Math.sin(a0);
  for (let j = j0; j < x + W; j++) {
    const v = 0.5 + 0.5 * c;
    idx[o + n] = j;
    h[o + n] = v;
    sum += v;
    n++;
    const c2 = c * cd - sn * sd;
    sn = sn * cd + c * sd;
    c = c2;
  }
  for (let q = 0; q < n; q++) h[o + q] /= sum;
  return n;
}

class BowedString {
  readonly def: StringDef;
  readonly Z: number;
  readonly fOpen: number;
  buf = new Float64Array(MAX_BUF);
  readonly mask = MAX_BUF - 1;
  /** current/target loop delay (samples, fractional) */
  D = 100;
  Dtarget = 100;
  /** delay of the stopped note without vibrato */
  D0 = 100;
  /** loop the bow taps follow: D0 with pitch bend, without vibrato */
  Dtap = 100;
  lossB = 0.9;
  lossA = 0;
  ly = 0;
  // bow
  bowing = false;
  /** bow speed magnitude (m/s); the signed speed is vBow · bow direction profile */
  vBow = 0;
  vBowTarget = 0;
  /** signed bow speed and force used by the friction solve this control block */
  vSigned = 0;
  fScale = 1;
  /** velocity-dependent force and bow-position multipliers of the current note */
  forceDyn = 1;
  betaDyn = 1;
  /** the planned stroke's speed, of the speed the note's dynamic asks for (1: not planned); the
   *  contact point moves by the same factor */
  kBow = 1;
  /** bow-speed attack time constant of the current note, s (design.attackTau) */
  tauA = 0.045;
  /** design.wander: smoothed random walks (rate, depth, speed, force), each ~N(0, 1) */
  wv = new Float64Array(4);
  fBow = 0;
  fBowTarget = 0;
  /** bow force the note asks for, before the live pressure controller (CC1/CC2/CC11) */
  fBase = 0;
  /** Schelleng's maximum force for the current speed and contact point */
  fMax = 1;
  stick = true;
  slipSign = 1;
  beta = 0.11;
  noiseLp = 0;
  // note
  midi = -1;
  held = false;
  /** keys still held that this string played before the current note took it (oldest first),
   *  with their velocities: releasing the current note gives the string back to the last one */
  displaced: { midi: number; velocity: number }[] = [];
  velocity = 80;
  /** the CC_DYNAMICS offset this string's bow targets were last set for */
  dynApplied = 0;
  releasedAt = 0;
  /** the finger is lifting off this (stopped, idle) string, its ring damped (FINGER_LIFT); since when (frame) */
  lifting = false;
  liftAt = 0;
  /** the string's level as the bow left it */
  releasedLevel = 0;
  startedAt = 0;
  vibPhase = 0;
  vibRate = 5.5;
  level = 0;
  /** last bridge-incoming wave */
  vin = 0;
  /** coupling to the bridge's driven motion (a transformer ratio; 1 = the round-2 junction) and c·Z */
  c = 1;
  cz = 0;
  /** the impedance the bow sees (Z, or Z in parallel with the torsional impedance) */
  Zb = 0;
  Zt = 0;
  /** torsional round trip (design.torsion): delay line, its length, loss and filter state */
  tb = new Float64Array(1024);
  Dt = 16;
  tg = 0.9;
  tly = 0;
  /** design.bowWidth: the contact's width in samples of this string (≥ 1.5; 0 = a point bow), and
   *  the taps and weights of its raised-cosine profile on the outgoing (bridge-side, kI/kH 0…) and
   *  the returning (nut-side, kI/kH 32…) wave */
  Wb = 0;
  /** cos and sin of π/Wb: the step between the contact profile's taps */
  Wc = 1;
  Ws = 0;
  kI = new Int32Array(64);
  kH = new Float64Array(64);
  /** design.byEar: the finger's correction (cents), the note's period (samples), the frame of the
   *  slip that began the last period, the loop length summed per sample since, the last period's
   *  length, and this control block's period errors (sounding − intended, cents) */
  ear = 0;
  /** where the finger was put for this note (cents: BOWED_HUMAN), and the note it was put for (−1: lifted) */
  place = 0;
  placeMidi = -1;
  Pn = 100;
  relAt = -1;
  dSum = 0;
  lastPm = 0;
  errSum = 0;
  errN = 0;
  /** the samples the block's errors cover */
  errT = 0;

  // traces for visualisation
  trF = new Float32Array(TRACE);
  trV = new Float32Array(TRACE);
  trI = 0;
  constructor(def: StringDef, L: number, readonly fs: number) {
    this.def = def;
    this.fOpen = et(def.open);
    this.Z = def.T / (2 * L * this.fOpen);
    this.cz = this.Z;
    this.Zb = this.Z;
  }
}

export class BowedCore implements InstrumentCore {
  readonly id: InstrumentId;
  readonly fs: number;
  design: BowedDesign;
  params: BowedParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = 4;
  sympatheticAllowed = true;
  dry: boolean;
  strings: BowedString[];
  private queue: { frame: number; ev: PianoEvent | { type: 'control'; cc: number; value: number } }[] = [];
  // body
  private K = 0;
  private freq = new Float64Array(0);
  private eta = new Float64Array(0);
  private mass = new Float64Array(0);
  private b0 = new Float64Array(0);
  private b2 = new Float64Array(0);
  private a1 = new Float64Array(0);
  private a2 = new Float64Array(0);
  private s1 = new Float64Array(0);
  private s2 = new Float64Array(0);
  private radL = new Float64Array(0);
  private radR = new Float64Array(0);
  private Y0 = 0;
  private H = 0;
  private hfL = 0;
  private hfR = 0;
  private hfHp = new BiquadChain();
  private eq = new BiquadChain();
  private room: Room;
  private limiter: Limiter;
  private rng: () => number;
  /** the left hand's placing (BOWED_HUMAN): its stream */
  private hum: Human;
  private expression = 1;
  private modwheel = -1;
  /** live bow-pressure controller: mod wheel / breath / expression (1 = as the note asked) */
  private pressureCC = 1;
  /** CC_DYNAMICS: velocity steps above (below) the note as begun, asked and as the arm has it */
  private dynTarget = 0;
  private dyn = 0;
  /** pitch bend, semitones */
  private bend = 0;
  /** the player's intonation, semitones (util.ts playerCents), under any bend */
  private tune = 0;
  private focus = 0;
  private pump = new Pump(64);
  private oL = new Float64Array(128);
  private oR = new Float64Array(128);
  private hL = new Float64Array(128);
  private hR = new Float64Array(128);
  private gain = 1;
  /** radiation chain v2 (design.radiation): differentiator gain and its last inputs */
  private dK = 0;
  private dL = 0;
  private dR = 0;
  /** design.body.corner: the first-order low-pass's coefficients (y = cb·(x + x₁) − ca·y₁), its
   *  states per channel, and the cutoff it was last set to (Hz; 0: not yet) */
  private cb = 1;
  private ca = 0;
  private cx = new Float64Array(2);
  private cy = new Float64Array(2);
  private fc = 0;
  /** The bow, shared by all strings as on the instrument: direction (+1 down-bow, −1 up-bow),
   *  position along the hair from the frog (m), and an in-progress change. */
  readonly bow = { dir: 1, pos: 0, changing: false, t: 0, from: 1, changes: 0, lastStroke: -1e12, auto: 0 };
  /** The bow in the player's own hand (a finger or the mouse dragging it on the stage): its signed
   *  speed (m/s, + is a down-bow) as asked and as smoothed (τ = 25 ms, so a reversal passes through
   *  zero), and the contact point along the hair (0 frog … 1 tip). While it is held the keys only
   *  stop the strings: the bow sounds them, at the hand's speed. null: the keys bow, as always. */
  private hand: { target: number; v: number; pos: number } | null = null;
  /** The notes to come (a file or a piece playing: `foresee`), in the order they begin: when each
   *  begins and ends (frames), its pitch and strength, and whether it has begun. With them the bow is
   *  planned as by a player who reads the part; without them (the keys, a keyboard plugged in) each
   *  note is met as it comes (newStroke, and the change when the hair runs out). */
  private ahead: { on: number; off: number; midi: number; vel: number; dyn: number; hit: boolean }[] = [];
  /** the stroke as planned: whether the one under way was (a note that was foreseen began it), its
   *  speed factor and the strength it was planned for, the frame at which the bow is to change inside
   *  it (−1: no change), whether what is left is planned again once a change is done, how many
   *  strokes and changes were planned, the frame the stroke ends at, and the bow held back near its
   *  end (trim, 0.85…1: bowControl) */
  readonly plan = { on: false, k: 1, vel: 80, changeAt: -1, replan: false, strokes: 0, changes: 0, end: 0, trim: 1 };
  /** the lifted bow on its way to where the next stroke begins: that note's frame (−1: none), the
   *  place on the hair (m) */
  private retake = { on: -1, pos: 0 };
  /** when the bow last left every string (frame) */
  private bowOff = -1e12;
  /** scratch of the planner: a group of notes on one bow (its end, the frame and strength of the note
   *  after it, −1 if none is known), the starts of the notes inside it, and a stroke as designed */
  private g0 = { end: 0, next: -1, nextVel: 80, top: 0 };
  private g1 = { end: 0, next: -1, nextVel: 80, top: 0 };
  private ons = new Float64Array(48);
  private nOns = 0;
  private sp = { dir: 1, start: 0, k: 1, room: 0 };
  private run = new Float64Array(16);
  /** no note yet: the hand's bow starts on the second-highest string, not the lowest */
  private unplayed = true;
  private vinS = new Float64Array(4);
  private peakS = new Float64Array(4);
  private onS = new Uint8Array(4);
  /** per-sample coefficients (design.rateInvariant: from time constants; else the round-2/3
   *  fractions): the loop length's glide, the rosin noise's one-pole and its input gain, and the
   *  pole of the torsional loss filter */
  private kD = 0.02;
  private kN = 0.08;
  private gN = 1;
  private pT = 0.25;

  constructor(opts: { sampleRate: number; instrument: BowedId; params?: Partial<BowedParams>; dry?: boolean; player?: number }) {
    this.fs = opts.sampleRate;
    this.design = BOWED[opts.instrument];
    this.id = this.design.id;
    this.dry = !!opts.dry;
    this.params = {
      bowPosition: 0.11,
      bowPressure: 0.32,
      vibrato: 12,
      bodyDamping: 1,
      room: 0.35,
      volume: 1,
      sympathetic: true,
      bowChanges: true,
      bowChangeTime: 0.07,
      ...this.design.defaults,
      ...opts.params,
    };
    // (the performer's randomness: vibrato phase, rate and wander, bow noise; another player's own)
    this.rng = mulberry32(playerSeed(this.design.seed, opts.player));
    this.hum = new Human(BOWED_HUMAN.seed + this.design.seed, opts.player);
    // and the player's intonation: a constant bend (0 for the first player)
    this.tune = playerCents(opts.player) / 100;
    this.bend = this.tune;
    this.strings = this.design.strings.map((d) => new BowedString(d, this.design.L, this.fs));
    const tor = this.design.torsion;
    if (tor) for (const s of this.strings) {
      s.Zt = tor.impedanceRatio * s.Z;
      s.Zb = (s.Z * s.Zt) / (s.Z + s.Zt);
      s.tg = Math.exp(-Math.PI / tor.q);
    }
    const bw = this.design.bowWidth;
    // the contact's width in samples: w / (c / fs), the string's wave speed c = 2 L f_open; at
    // least 1.5 samples (below that the sampled profile's admittance Σh² depends on where it
    // falls between samples), at most what the taps hold
    if (bw)
      for (const s of this.strings) {
        s.Wb = clamp((bw * this.fs) / (2 * this.design.L * s.fOpen), 1.5, 14);
        s.Wc = Math.cos(Math.PI / s.Wb);
        s.Ws = Math.sin(Math.PI / s.Wb);
      }
    if (this.design.rateInvariant) {
      // the round-2/3 fractions per sample, as the time constants they were at 44.1 kHz: the
      // glide 0.02 (τ ≈ 1.1 ms), the rosin noise's one-pole 0.08 (≈ 585 Hz) and the torsional
      // loss filter's pole 0.25 (τ ≈ 16 µs)
      const r = 44100 / this.fs;
      this.kD = 1 - Math.pow(0.98, r);
      this.kN = 1 - Math.pow(0.92, r);
      this.pT = Math.pow(0.25, r);
      // the noise's RMS after its one-pole is √(k/(2 − k)) of its input's: keep it at 44.1 kHz's
      this.gN = Math.sqrt((0.08 / 1.92) / (this.kN / (2 - this.kN)));
    }
    for (const s of this.strings) this.setStopped(s, s.def.open, true);
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    this.buildBody();
    this.updatePost();
  }

  // ------------------------------------------------------------ body

  private buildBody(): void {
    const d = this.design;
    const rand = mulberry32(d.seed * 31 + 7);
    const modes: BodyMode[] = [...d.signature];
    let f = d.stat.fLo;
    while (f < d.stat.fHi) {
      const md = { f, eta: d.stat.eta * (0.7 + 0.6 * rand()), m: d.stat.mass * Math.exp(0.5 * gauss(rand)) * Math.sqrt(f / 1000), rad: (rand() < 0.5 ? -1 : 1) * (0.3 + 0.7 * rand()) };
      // v2: the statistical (higher-order) modes radiate with their own net efficiency relative to
      // the low signature modes (A0 and B1 are the body's strong monopole radiators)
      if (d.radiation) md.rad *= d.radiation.statRad;
      modes.push(md);
      f += d.stat.spacing * Math.sqrt(f / 1000) * (0.4 + 1.2 * rand());
    }
    // design.bridgeMass: the bridge hill, at the bridge's own (fitted) resonance; it does not
    // radiate (the body modes, driven by the bridge force, do, through radiation.bridge). Last, so
    // the statistical modes and their pans stay as they were.
    if (d.bridgeMass && d.radiation) modes.push({ f: d.radiation.bridge[0][0], eta: 1 / d.radiation.bridge[0][1], m: d.bridgeMass, rad: 0 });
    const K = modes.length;
    this.K = K;
    this.freq = Float64Array.from(modes.map((m) => m.f));
    this.eta = Float64Array.from(modes.map((m) => m.eta));
    this.mass = Float64Array.from(modes.map((m) => m.m));
    this.radL = new Float64Array(K);
    this.radR = new Float64Array(K);
    modes.forEach((m, k) => {
      const pan = rand();
      // (design.inPhase: a signature mode the same at both microphones; the pair's sum, the mono, is the
      // same whatever the pan, so a body fitted in mono stays fitted)
      const mono = !!d.inPhase && k < d.signature.length;
      this.radL[k] = m.rad * (mono ? 0.775 : 0.55 + 0.45 * pan);
      this.radR[k] = m.rad * (mono ? 0.775 : 0.55 + 0.45 * (1 - pan)) * (k % 3 === 0 && !mono ? -1 : 1);
    });
    this.b0 = new Float64Array(K);
    this.b2 = new Float64Array(K);
    this.a1 = new Float64Array(K);
    this.a2 = new Float64Array(K);
    this.s1 = new Float64Array(K);
    this.s2 = new Float64Array(K);
    this.setBodyDamping(this.params.bodyDamping);
    for (const s of this.strings) this.retune(s);
  }

  private setBodyDamping(scale: number): void {
    const fs = this.fs;
    let y0 = 0;
    for (let k = 0; k < this.K; k++) {
      const w = 2 * Math.PI * this.freq[k];
      const zeta = Math.min(0.45, 0.5 * this.eta[k] * scale);
      const c = w / Math.tan((w / fs) * 0.5);
      const A = 1 / this.mass[k];
      const a0 = c * c + 2 * zeta * w * c + w * w;
      this.b0[k] = (A * c) / a0;
      this.b2[k] = (-A * c) / a0;
      this.a1[k] = (2 * (w * w - c * c)) / a0;
      this.a2[k] = (c * c - 2 * zeta * w * c + w * w) / a0;
      y0 += this.b0[k];
    }
    this.Y0 = y0;
  }

  /** bridge admittance (body modes + local) at w rad/sample */
  private mobility(w: number): [number, number] {
    let re = this.design.bridgeY;
    let im = 0;
    const c1 = Math.cos(w);
    const s1 = -Math.sin(w);
    const c2 = Math.cos(2 * w);
    const s2 = -Math.sin(2 * w);
    for (let k = 0; k < this.K; k++) {
      const nr = this.b0[k] + this.b2[k] * c2;
      const ni = this.b2[k] * s2;
      const dr = 1 + this.a1[k] * c1 + this.a2[k] * c2;
      const di = this.a1[k] * s1 + this.a2[k] * s2;
      const den = dr * dr + di * di;
      re += (nr * dr + ni * di) / den;
      im += (ni * dr - nr * di) / den;
    }
    return [re, im];
  }

  private updatePost(): void {
    const fs = this.fs;
    const rad = this.design.radiation;
    // v2: the bridge's resonances, as unity-DC resonant low-passes (the force passes the bridge on its way to the body)
    const bridge = rad ? rad.bridge.map(([f, q]) => biquadLowpass(Math.min(f, 0.45 * fs), q, fs)) : [];
    // (the double bass: its E1 is 41 Hz, under the cello's 40 Hz corner)
    const lowest = this.design.strings[0].open;
    const hp = biquadHighpass(lowest < 30 ? 20 : lowest < 40 ? 40 : 70, 0.7, fs);
    const body = this.design.body;
    // design.body: the fitted envelope in place of the hand-set eq and shelf (a band at or above
    // 0.45 fs, at the lowest rates, is left out: there is nothing there for it to shape)
    if (body) this.eq.set([hp, ...body.bands.filter(([f]) => f < 0.45 * fs).map(([f, g]) => biquadPeaking(f, body.q, g, fs)), ...bridge]);
    else this.eq.set([hp, ...this.design.eq.map(([f, g, q]) => biquadPeaking(f, q, g, fs)), ...bridge, biquadHighShelf(7000, -3, fs)]);
    this.dK = rad ? fs / (2 * Math.PI * rad.radRef) : 0;
    this.hfHp.set([biquadHighpass(this.design.hf[1], 0.7, fs)]);
    this.room.configure(this.params.room, this.params.seat);
    this.gain = this.design.outputGain * this.params.volume;
  }

  // ------------------------------------------------------------ strings

  /** Stop string s at midi note m (open if m equals its open note). */
  private setStopped(s: BowedString, m: number, immediate = false): void {
    s.midi = m;
    s.lifting = false;
    // the finger is put down by ear (BOWED_HUMAN): anew for a new note, where it was for the same one
    if (m <= s.def.open) {
      s.place = 0;
      s.placeMidi = -1;
    } else if (m !== s.placeMidi) {
      s.placeMidi = m;
      s.place = clamp(this.params.human ?? 1, 0, 1) * BOWED_HUMAN.place * this.hum.near();
    }
    // design.byEar: a new note, a new finger
    s.ear = 0;
    s.relAt = -1;
    s.lastPm = 0;
    s.errSum = 0;
    s.errN = 0;
    s.errT = 0;
    s.Pn = this.fs / et(m);
    const f = et(m);
    const open = m <= s.def.open;
    // intrinsic losses; a stopping finger adds damping
    const t60L = this.design.t60[0] * (open ? 1 : 0.55) * Math.pow(s.fOpen / f, 0.3);
    const t60H = this.design.t60[1] * (open ? 1 : 0.7) * (this.design.t60HString?.[this.strings.indexOf(s)] ?? 1);
    const freqs: number[] = [];
    const t60: number[] = [];
    const loop: number[] = [];
    for (let k = 1; k <= 30; k++) {
      const fk = k * f;
      if (fk > Math.min(0.45 * this.fs, Math.max(3000, 2.5 * f))) break;
      const sig = LN1000 / t60L + Math.max(0, (LN1000 / t60H - LN1000 / t60L) * ((fk * fk - f * f) / (3000 * 3000 - f * f)));
      freqs.push(fk);
      t60.push(LN1000 / sig);
      loop.push((k * this.fs) / fk);
    }
    const ld = designLossFilter(freqs, t60, loop, this.fs);
    s.lossA = ld.a;
    s.lossB = ld.g * (1 + ld.a);
    s.D0 = this.loopDelay(s, f);
    if (this.design.torsion) s.Dt = Math.max(4, Math.min(1000, Math.round(s.D0 / this.design.torsion.speedRatio)));
    s.Dtarget = s.D0;
    s.Dtap = s.D0 * Math.pow(2, -this.bend / 12);
    if (immediate) s.D = s.D0;
  }

  /** delay-line length for pitch f: fs/f minus the loss filter, Lagrange and bridge-reactance phase */
  private loopDelay(s: BowedString, f: number): number {
    const w = (2 * Math.PI * f) / this.fs;
    let P = this.fs / f;
    const tk = this.design.tuneHarmonics;
    if (this.K && tk) {
      // v2 (cello): Helmholtz motion locks the partials into one period, so the pitch is a
      // consensus of their round-trip delays, weighted by the sawtooth's amplitudes (1/k): the
      // bridge's reflection phase and the loss filter's phase delay at each harmonic k
      let num = 0;
      let wsum = 0;
      for (let k = 1; k <= tk; k++) {
        if (k * f > 0.45 * this.fs) break;
        const [yr, yi] = this.mobility(w * k);
        const er = yr * s.Z;
        const ei = yi * s.Z;
        const bridge = ((Math.atan2(-ei, 1 - er) - Math.atan2(ei, 1 + er)) / (2 * Math.PI * k)) * P;
        const wk = Math.pow(k, -(this.design.tuneWeight ?? 1));
        num += (bridge - onePolePhaseDelay(s.lossA, w * k)) * wk;
        wsum += wk;
      }
      return Math.max(8, P + num / wsum);
    }
    if (this.K) {
      // reflection phase of the bridge for this string (as for the piano's in-phase mode)
      let num = 0;
      for (let k = 1; k <= 3; k++) {
        const [yr, yi] = this.mobility(w * k);
        const er = yr * s.Z;
        const ei = yi * s.Z;
        num += (Math.atan2(-ei, 1 - er) - Math.atan2(ei, 1 + er)) / (2 * Math.PI * k);
      }
      P += (num / 3) * P;
    }
    return Math.max(8, P - onePolePhaseDelay(s.lossA, w));
  }

  private retune(s: BowedString): void {
    if (s.midi >= 0) {
      s.D0 = this.loopDelay(s, et(s.midi));
      s.Dtarget = s.D0;
      s.Dtap = s.D0;
      s.D = s.D0;
    }
  }

  /** Which string plays midi m: free strings that can reach it, highest open string first. */
  private pickString(m: number): BowedString | null {
    const cands = this.strings.filter((s) => m >= s.def.open && m <= s.def.open + 26);
    if (!cands.length) return null;
    const free = cands.filter((s) => !s.bowing).sort((a, b) => b.def.open - a.def.open);
    if (free.length) return free[0];
    return cands.sort((a, b) => a.startedAt - b.startedAt)[0];
  }

  private bowTargets(s: BowedString, velocity: number): void {
    const [vlo, vhi] = this.design.bowSpeed;
    const x = clamp((velocity - 1) / 126, 0, 1);
    // (a planned stroke, kBow: drawn slower nearer the bridge or faster nearer the fingerboard, the
    // string's amplitude v/β and the force's place under Schelleng's maximum as the dynamic has them)
    const v = vlo * Math.pow(vhi / vlo, x) * this.expression * s.kBow;
    s.vBowTarget = v;
    const at = this.design.attackTau;
    if (at) s.tauA = at[0] * Math.pow(at[1] / at[0], x);
    // normalised to 1 at velocity 80, so bowPosition is the bow's β at that velocity
    const [bp, bf] = this.design.betaDyn;
    s.betaDyn = ((bp + (bf - bp) * x) / (bp + (bf - bp) * X_REF)) * s.kBow;
    s.beta = clamp(this.params.bowPosition * s.betaDyn, 0.03, 0.3);
    // Schelleng's maximum bow force for this speed/position; play a fraction of it
    const fMax = (2 * s.Zb * v) / (s.beta * (MU_S - MU_D));
    const [fp, ff] = this.design.forceDyn;
    s.forceDyn = fp + (ff - fp) * x;
    s.fMax = fMax;
    s.fBase = clamp(this.params.bowPressure * s.forceDyn, 0.02, 1.2) * fMax;
    s.fBowTarget = Math.min(1.3 * fMax, s.fBase * this.pressureCC);
  }

  /** CC_DYNAMICS: a bowing string's speed and force for its note played `dyn` velocity steps harder,
   *  as bowTargets gives them for that velocity (the bow is where the stroke began: the contact point
   *  and the attack stay the note's; a whole-sample bow tap must not jump under a held note). Faster,
   *  the string is louder; the force keeps its place under
   *  Schelleng's maximum for the new speed, a little higher for louder (design.forceDyn), as players
   *  lean in with a crescendo. */
  private dynTargets(s: BowedString): void {
    const [vlo, vhi] = this.design.bowSpeed;
    const x = clamp((clamp(s.velocity + this.dyn, 1, 127) - 1) / 126, 0, 1);
    // (the contact point stays the stroke's: a louder note's would sit nearer the bridge, so the speed
    // makes up the difference; the Helmholtz amplitude goes as v/β, Cremer 1984 §3)
    const [bp, bf] = this.design.betaDyn;
    const v = vlo * Math.pow(vhi / vlo, x) * this.expression * (s.betaDyn / ((bp + (bf - bp) * x) / (bp + (bf - bp) * X_REF)));
    s.vBowTarget = v;
    const [fp, ff] = this.design.forceDyn;
    s.forceDyn = fp + (ff - fp) * x;
    s.fMax = (2 * s.Zb * v) / (s.beta * (MU_S - MU_D));
    s.fBase = clamp(this.params.bowPressure * s.forceDyn, 0.02, 1.2) * s.fMax;
    s.fBowTarget = Math.min(1.3 * s.fMax, s.fBase * this.pressureCC);
  }

  // ------------------------------------------------------------ events

  schedule(ev: unknown, frame?: number): void {
    const f = frame === undefined ? this.frame : Math.max(this.frame, Math.floor(frame));
    const fe = ev as { type?: string; midi: number; velocity: number; dur: number; dyn?: number };
    // a note to come is not an event: it is known at once, and nothing happens at its frame
    if (fe.type === 'foresee') return this.foresee(fe.midi, fe.velocity, f, fe.dur, fe.dyn);
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].frame > f) i--;
    q.splice(i, 0, { frame: f, ev: ev as PianoEvent });
  }

  private apply(ev: PianoEvent | { type: 'control'; cc: number; value: number }): void {
    switch (ev.type) {
      case 'noteOn': {
        if (ev.velocity <= 0) return this.apply({ type: 'noteOff', midi: ev.midi });
        const s = this.pickString(ev.midi);
        if (!s) return;
        for (const t of this.strings) t.displaced = t.displaced.filter((d) => d.midi !== ev.midi);
        if (s.bowing && s.held && s.midi !== ev.midi) s.displaced.push({ midi: s.midi, velocity: s.velocity });
        s.velocity = ev.velocity;
        const legato = s.bowing;
        // was it foreseen (a file playing)? then its stroke is planned; in the hand, never
        const seen = this.hand || !this.ahead.length ? null : this.match(ev.midi);
        this.setStopped(s, ev.midi, !legato && s.level < 1e-4);
        if (!legato) {
          s.stick = true;
          // v2: on a slurred crossing the bow arrives already moving (a planned stroke: on every
          // instrument, the bow rolls onto the new string inside its slur)
          let vNow = 0;
          if (this.design.slurCrossing || seen) for (const t of this.strings) if (t !== s && t.bowing && t.vBow > vNow) vNow = t.vBow;
          s.vBow = vNow;
          if (seen) this.strokeStart(seen.vel, this.planVel(seen));
          else {
            if (!this.strings.some((q) => q.bowing)) this.plan.on = false;
            this.newStroke();
          }
        }
        s.kBow = seen && this.plan.on ? this.plan.k : 1;
        s.bowing = true;
        s.held = true;
        s.startedAt = this.frame;
        s.vibPhase = this.rng() * Math.PI * 2;
        s.vibRate = 5.2 + 0.8 * this.rng();
        this.bowTargets(s, ev.velocity);
        if (this.dyn) this.dynTargets(s);
        s.dynApplied = this.dyn;
        this.focus = this.strings.indexOf(s);
        this.unplayed = false;
        break;
      }
      case 'noteOff': {
        for (const s of this.strings) s.displaced = s.displaced.filter((d) => d.midi !== ev.midi);
        for (const s of this.strings) if (s.midi === ev.midi && s.bowing && s.held) {
          // a key still held that this note displaced gets its string back (the finger moves
          // back, the bow keeps going), as the flute and trumpet return to the last held note
          const back = s.displaced.pop();
          if (back) {
            this.setStopped(s, back.midi, false);
            s.velocity = back.velocity;
            this.bowTargets(s, back.velocity);
            if (this.dyn) this.dynTargets(s);
            s.dynApplied = this.dyn;
            continue;
          }
          s.held = false;
          // in the hand, the bow stays on the string when the finger leaves the key
          if (this.sustain < 0.5 && !this.hand) this.lift(s);
        }
        break;
      }
      case 'sustain':
        this.sustain = clamp(ev.value, 0, 1);
        if (this.sustain < 0.5) for (const s of this.strings) if (s.bowing && !s.held) this.lift(s);
        break;
      case 'soft':
        this.soft = clamp(ev.value, 0, 1);
        break;
      case 'control':
        // mod wheel, breath controller and expression press the bow into the string
        // (×0.3 … ×1.5 of the force the note asked for, capped above Schelleng's maximum)
        // (below 0, CC_REST: back to the force the note asks for)
        if (ev.cc === 1 || ev.cc === 2 || ev.cc === 11) this.pressureCC = ev.value < 0 ? 1 : 0.3 + 1.2 * clamp(ev.value, 0, 1);
        else if (ev.cc === CC_DYNAMICS) this.dynTarget = clamp(ev.value, -DYN_MAX, DYN_MAX);
        else if (ev.cc === CC_HAND_BOW_SPEED) {
          if (!this.hand) this.hand = { target: 0, v: 0, pos: this.bow.pos / this.design.bowLength };
          // no faster than 1.5 × the fortissimo bow: a finger crosses a phone faster than an arm can
          this.hand.target = clamp(ev.value, -1.5 * this.design.bowSpeed[1], 1.5 * this.design.bowSpeed[1]);
        } else if (ev.cc === CC_HAND_BOW_POS) {
          if (this.hand) this.hand.pos = clamp(ev.value, 0, 1);
        } else if (ev.cc === CC_HAND_BOW_OFF) this.handOff();
        break;
      case 'bend':
        // the finger slides: every stopped or bowed string follows
        this.bend = clamp(ev.value, -12, 12) + this.tune;
        break;
      case 'allNotesOff':
        this.hand = null;
        this.forget();
        for (const s of this.strings) {
          s.displaced = [];
          this.lift(s);
        }
        break;
    }
  }

  /** A détaché note (the bow was not moving) takes a new stroke: the bow alternates direction,
   *  unless too little hair is left that way, as a player distributes the bow. Notes that
   *  overlap one already bowed (slurs, chords, double stops) continue its stroke. */
  private newStroke(): void {
    const b = this.bow;
    if (!this.params.bowChanges) {
      b.dir = 1;
      b.pos = 0;
      return;
    }
    if (this.strings.some((q) => q.bowing)) return;
    const first = b.lastStroke < -1e11;
    b.lastStroke = this.frame;
    b.changing = false;
    const L = this.design.bowLength;
    if (first) {
      b.dir = 1;
      b.pos = 0.05 * L;
      return;
    }
    const nd = -b.dir;
    const left = (d: number) => (d > 0 ? L - b.pos : b.pos);
    b.dir = left(nd) >= 0.1 * L || left(nd) >= left(b.dir) ? nd : b.dir;
  }

  // ------------------------------------------------------------ the bow planned ahead

  /** A note to come: it will begin at `frame` and last `dur` seconds, the file's dynamics over it
   *  `dyn` velocity steps above the note as begun on average (CC_DYNAMICS as it will be sent; absent:
   *  as they stand when the stroke is planned). The file player says so BOW_LOOK seconds or more
   *  ahead; the note itself still arrives as a noteOn at its frame. */
  foresee(midi: number, velocity: number, frame: number, dur: number, dyn?: number): void {
    if (!(dur > 0) || !(velocity > 0)) return;
    // (a note no string reaches will not sound: it is no part of the bow's plan)
    if (!this.strings.some((s) => midi >= s.def.open && midi <= s.def.open + 26)) return;
    const a = this.ahead;
    // (a stuck sender: the oldest go)
    if (a.length >= 512) a.shift();
    let i = a.length;
    while (i > 0 && a[i - 1].on > frame) i--;
    a.splice(i, 0, { on: frame, off: frame + Math.max(1, Math.round(dur * this.fs)), midi, vel: velocity, dyn: dyn === undefined ? NaN : clamp(dyn, -DYN_MAX, DYN_MAX), hit: false });
  }

  /** What was foreseen is forgotten (the file paused or stopped): the bow meets the notes as they come. */
  forget(): void {
    this.ahead.length = 0;
    this.retake.on = -1;
    this.plan.changeAt = -1;
    this.plan.replan = false;
  }

  /** The foreseen note that begins now on this pitch (the nearest within FORESEE_TOL), marked begun;
   *  those that are over, or never came, are dropped. */
  private match(midi: number): { on: number; vel: number; dyn: number } | null {
    const a = this.ahead;
    const tol = FORESEE_TOL * this.fs;
    let w = 0;
    let best = -1;
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (e.hit ? e.off <= this.frame : e.on < this.frame - tol) continue;
      if (!e.hit && e.midi === midi && Math.abs(e.on - this.frame) <= tol && (best < 0 || Math.abs(e.on - this.frame) < Math.abs(a[best].on - this.frame))) best = w;
      a[w++] = e;
    }
    a.length = w;
    if (best < 0) return null;
    a[best].hit = true;
    return a[best];
  }

  /** The notes on one bow from frame `from`: those sounding then and every later one that begins
   *  before the last of them ends (a slur, a chord, a double stop: notes that overlap). Into g: where
   *  the group ends, its highest note, and the note after it (−1: none within BOW_LOOK). The starts of
   *  the notes inside go to `ons` when asked. */
  private scan(from: number, g: { end: number; next: number; nextVel: number; top: number }, keep: boolean): void {
    const a = this.ahead;
    const tol = FORESEE_TOL * this.fs;
    const far = from + BOW_LOOK * this.fs;
    g.end = from;
    g.next = -1;
    g.top = 0;
    if (keep) this.nOns = 0;
    for (let i = 0; i < a.length; i++) {
      const e = a[i];
      if (e.off <= from || (!e.hit && e.on < from - tol)) continue;
      if (e.on > far) break;
      // (a note that begins as the last ends, to within a rounding of their two times, does not overlap it)
      if (e.on <= from + tol || e.on < g.end - 0.002 * this.fs) {
        if (keep && e.on > from + tol && this.nOns < this.ons.length) this.ons[this.nOns++] = e.on;
        if (e.off > g.end) g.end = e.off;
        if (e.midi > g.top) g.top = e.midi;
      } else {
        g.next = e.on;
        g.nextVel = this.planVel(e);
        break;
      }
    }
  }

  /** a foreseen note's strength with the dynamics over it (velocity steps: as foreseen, else as they stand) */
  private planVel(e: { vel: number; dyn: number }): number {
    return e.vel + (e.dyn === e.dyn ? e.dyn : this.dyn);
  }

  /** the bow speed a note of this strength asks for (m/s; bowTargets and dynTargets), the dynamics counted in */
  private speedOf(velocity: number): number {
    const [vlo, vhi] = this.design.bowSpeed;
    return vlo * Math.pow(vhi / vlo, clamp((clamp(velocity, 1, 127) - 1) / 126, 0, 1)) * this.expression;
  }

  /** the hair a stroke of T seconds takes at that speed (m): the bow comes up to speed with the
   *  attack's time constant */
  private hairOf(velocity: number, T: number): number {
    const at = this.design.attackTau;
    const tau = at ? at[0] * Math.pow(at[1] / at[0], clamp((velocity - 1) / 126, 0, 1)) : 0.045;
    return this.speedOf(velocity) * Math.max(0, T - tau * (1 - Math.exp(-T / tau)));
  }

  /** A stroke designed, for the notes on one bow from frame `on` (into sp: its direction, where on the
   *  hair it begins, its speed factor, the hair ahead of it): as a player who sees the part
   *  distributes the bow.
   *  fresh: the bow is off the string and can be set down anywhere (phrase: after a rest long enough
   *  that the phrase begins anew, down-bow, or up-bow for an upbeat); else it goes on from where it is,
   *  the other way.
   *  The hair it uses is what its length and dynamic ask for, more if the stroke that follows straight
   *  after needs the room to come back (a short note before a long one is drawn faster), less if less
   *  is left (a long note is drawn slower); within K_LO…K_HI and the instrument's own bow speeds. One
   *  that cannot be done in a bow even slowed is done in the fewest bows that can, each using the
   *  hair fully (strokeChange). */
  private design1(on: number, velocity: number, pv: number, fresh: boolean, phrase: boolean): void {
    const b = this.bow;
    const sp = this.sp;
    const fs = this.fs;
    const L = this.design.bowLength;
    const m = BOW_MARGIN * L;
    const Lu = L - 2 * m;
    this.scan(on, this.g0, true);
    const g = this.g0;
    const T = (g.end - on) / fs;
    const x = clamp((velocity - 1) / 126, 0, 1);
    // (pv: the strength with the dynamics over the note, for the speed; the contact point is the note's own)
    const v = this.speedOf(pv);
    const h0 = Math.max(1e-4, this.hairOf(pv, T));
    const [vlo, vhi] = this.design.bowSpeed;
    const [bp, bf] = this.design.betaDyn;
    const beta = this.params.bowPosition * ((bp + (bf - bp) * x) / (bp + (bf - bp) * X_REF));
    // the model's own limit: the contact is a tap on the delay line β·P/2 samples from the bridge (P
    // the note's period), a whole sample on the violin and the viola, no nearer than the hair's width
    // on the cello and the bass; under three samples its place is too coarse to move by a fraction
    // (measured: scripts/bow-plan-range.ts), so the group's highest note bounds how slow the stroke is
    const st = this.pickString(g.top);
    const tap = 0.5 * beta * (this.fs / et(g.top));
    const kMin = Math.min(1, Math.max(K_LO, vlo / v, BETA_PLAN[0] / beta, Math.max(3, st ? st.Wb + 1 : 0) / tap));
    const kMax = Math.max(1, Math.min(K_HI, vhi / v, BETA_PLAN[1] / beta));
    // the stroke after this one, if it follows with no time to lift the bow: the hair it would like
    let h1 = 0;
    let T1 = 0;
    if (g.next >= 0 && g.next - g.end < RETAKE_MIN * fs) {
      this.scan(g.next, this.g1, false);
      T1 = (this.g1.end - g.next) / fs;
      h1 = Math.min(this.hairOf(g.nextVel, T1), Lu);
    }
    let dir: number;
    // beside a stroke of another length the bow is shared out: the shorter one is drawn faster (up to
    // the hair the longer would like), the longer one slower (down to three quarters), so that a
    // dotted rhythm does not creep to one end of the bow
    // (the cello and the bass, whose level holds as the contact moves: scripts/bow-plan-range.ts; the
    // violin and the viola keep the dynamic's own speed unless the hair forces another)
    let want = h0;
    if (this.design.bowWidth) {
      if (h1 > h0) want = Math.min(h1, kMax * h0);
      else if (h1 > 0) want = Math.max(Math.min(h0, kMax * h1), 0.75 * h0);
    }
    // a whole-sample contact moves by whole samples: the speed factor is one such a move gives
    // exactly (the one below what is wanted, so the stroke still fits), so v/β is kept
    const t1 = Math.max(1, Math.round(tap));
    const whole = (q: number): number => (st && st.Wb ? q : Math.max(Math.ceil(kMin * t1 - 1e-9), Math.floor(q * t1 + 1e-9)) / t1);
    let k: number;
    if (fresh) {
      // the strokes that follow this one with no time to lift the bow (up to seven; RUN): how long
      // each is and the hair it would like
      const run = this.run;
      let n = 0;
      if (h1 > 0) {
        run[0] = T1;
        run[1] = h1;
        n = 1;
        while (n < 7) {
          const nx = this.g1.next;
          if (nx < 0 || nx - this.g1.end >= RETAKE_MIN * fs) break;
          const vel = this.g1.nextVel;
          this.scan(nx, this.g1, false);
          run[2 * n] = (this.g1.end - nx) / fs;
          run[2 * n + 1] = Math.min(this.hairOf(vel, run[2 * n]), Lu);
          n++;
        }
      }
      // a phrase begins down-bow, unless short notes lead straight to a longer one: then that one is
      // the down-bow (an upbeat is taken up-bow; three quavers before a minim go up, down, up)
      dir = phrase ? 1 : -b.dir;
      if (phrase && T < 0.6)
        for (let j = 0; j < n; j++) if (run[2 * j] > 1.6 * T) {
          if (!(j & 1)) dir = -1;
          break;
        }
      k = whole(kMin * h0 > Lu ? clamp((Math.ceil((kMin * h0) / Lu) * Lu) / h0, kMin, 1) : clamp(Math.min(want, Lu) / h0, kMin, kMax));
      const h = Math.min(k * h0, Lu);
      // where: a loud stroke in the lower half, a soft one further out; a long one from the end
      const lo = clamp(L * (0.62 - 0.27 * x) - h / 2, m, L - m - h);
      let start = dir > 0 ? lo : lo + h;
      // and so that the strokes after it, back and forth from where this one ends, stay on the hair
      let o = dir * h;
      let min = Math.min(0, o);
      let max = Math.max(0, o);
      let d = -dir;
      for (let j = 0; j < n; j++) {
        o += d * run[2 * j + 1];
        if (Math.max(max, o) - Math.min(min, o) > Lu) {
          // one that asks for more than is there will be drawn slower: all the room there is, for it
          if (d > 0) max = min + Lu;
          else min = max - Lu;
          break;
        }
        min = Math.min(min, o);
        max = Math.max(max, o);
        d = -d;
      }
      start = clamp(start, m - min, L - m - max);
      sp.start = start;
    } else {
      const room = (d: number) => Math.max(0, d > 0 ? L - m - b.pos : b.pos - m);
      dir = -b.dir;
      // hooked: no room that way even for a slowed stroke, and room this way: the same way again
      if (kMin * h0 > room(dir) && room(b.dir) >= Math.min(kMin * h0, Lu) && this.params.bowChanges) dir = b.dir;
      const R = room(dir);
      const B = Lu - R;
      if (h1 > want + B) want = h1 - B;
      if (want > R) want = R;
      k = whole(kMin * h0 > R ? clamp((Math.max(1, Math.ceil((kMin * h0) / Lu)) * Lu) / h0, kMin, 1) : clamp(want / h0, kMin, kMax));
      sp.start = b.pos;
    }
    sp.dir = dir;
    sp.k = k;
    sp.room = Math.max(0, dir > 0 ? L - m - sp.start : sp.start - m);
  }

  /** A stroke of T seconds from frame `from` that needs `need` metres of hair, with `room` ahead:
   *  the frame at which the bow changes inside it (plan.changeAt), −1 if the hair is enough. More
   *  than a bow's worth is shared out evenly; the change falls on the start of a note inside the
   *  group when there is one in the later half of what the hair allows, else inside the note. */
  private strokeChange(from: number, T: number, need: number, room: number): void {
    const p = this.plan;
    const L = this.design.bowLength;
    const Lu = L * (1 - 2 * BOW_MARGIN);
    p.changeAt = -1;
    if (need <= room + 0.004 || T <= 0) return;
    const n = 1 + Math.ceil((need - room - 0.004) / Lu);
    const most = (room * T) / need;
    const seg = Math.min(T / n, most);
    let at = from + seg * this.fs;
    for (let i = this.nOns - 1; i >= 0; i--) {
      const o = this.ons[i];
      if (o > from + most * this.fs) continue;
      if (o >= from + 0.5 * seg * this.fs) at = o;
      break;
    }
    // (not in a note's last instants: the next stroke changes the bow anyway)
    if (at < from + T * this.fs - 0.15 * this.fs) p.changeAt = at;
  }

  /** A foreseen note begins a stroke (no string is bowed: a note that overlaps one already bowed
   *  goes on in its stroke, as in newStroke): the stroke as designed. */
  private strokeStart(velocity: number, pv: number): void {
    const b = this.bow;
    const p = this.plan;
    if (!this.params.bowChanges) {
      p.on = false;
      return this.newStroke();
    }
    if (this.strings.some((q) => q.bowing)) return;
    const first = b.lastStroke < -1e11;
    const rest = this.frame - this.bowOff;
    this.design1(this.frame, velocity, pv, first || rest >= RETAKE_MIN * this.fs, first || rest >= PHRASE_REST * this.fs);
    b.lastStroke = this.frame;
    b.changing = false;
    b.dir = this.sp.dir;
    b.pos = this.sp.start;
    p.on = true;
    p.k = this.sp.k;
    p.vel = pv;
    p.replan = false;
    p.end = this.g0.end;
    p.trim = 1;
    p.strokes++;
    this.retake.on = -1;
    const T = (this.g0.end - this.frame) / this.fs;
    this.strokeChange(this.frame, T, this.sp.k * this.hairOf(pv, T), this.sp.room);
  }

  /** A change of bow inside a planned stroke is done: what is left of the group is planned from here. */
  private strokeOn(): void {
    const b = this.bow;
    const p = this.plan;
    p.replan = false;
    p.trim = 1;
    this.scan(this.frame, this.g0, true);
    p.end = this.g0.end;
    const L = this.design.bowLength;
    const m = BOW_MARGIN * L;
    const T = (this.g0.end - this.frame) / this.fs;
    this.strokeChange(this.frame, T, p.k * this.speedOf(p.vel) * T, Math.max(0, b.dir > 0 ? L - m - b.pos : b.pos - m));
  }

  /** The bow is off the strings and a foreseen note is near: it moves, lifted, to where that note's
   *  stroke will begin (a time constant: the same at any block length). */
  private airborne(dt: number): void {
    const a = this.ahead;
    const r = this.retake;
    let e: (typeof a)[number] | null = null;
    for (let i = 0; i < a.length; i++) if (!a[i].hit && a[i].on > this.frame) {
      e = a[i];
      break;
    }
    if (!e || e.on - this.frame > RETAKE_LEAD * this.fs) return;
    const first = this.bow.lastStroke < -1e11;
    const rest = e.on - this.bowOff;
    if (!first && rest < RETAKE_MIN * this.fs) return;
    if (r.on !== e.on) {
      this.design1(e.on, e.vel, this.planVel(e), true, first || rest >= PHRASE_REST * this.fs);
      r.on = e.on;
      r.pos = this.sp.start;
    }
    this.bow.pos += (r.pos - this.bow.pos) * (1 - Math.exp(-dt / RETAKE_TAU));
  }

  /** The hand lets go of the bow: held keys bow their strings again, the others are left. */
  private handOff(): void {
    if (!this.hand) return;
    this.hand = null;
    for (const s of this.strings) {
      if (!s.bowing) continue;
      if (s.held || this.sustain >= 0.5) this.bowTargets(s, s.velocity);
      else this.lift(s);
    }
  }

  /** The hand's bow meets no bowed string: it takes the one last played (its finger still down if a
   *  key is held), or the second-highest, open, if nothing has been played yet. */
  private handStart(): void {
    if (this.unplayed) {
      this.unplayed = false;
      this.focus = Math.min(2, this.strings.length - 1);
    }
    const s = this.strings[this.focus];
    if (s.midi < 0) this.setStopped(s, s.def.open, true);
    s.stick = true;
    s.bowing = true;
    s.held = false;
    s.velocity = 80;
    s.startedAt = this.frame;
    s.vibPhase = this.rng() * Math.PI * 2;
    s.vibRate = 5.2 + 0.8 * this.rng();
  }

  /** Bow targets at the hand's speed v (m/s): the force a note of that speed would ask for, scaled
   *  with the speed outside the keys' range so it stays the same fraction of Schelleng's maximum. */
  private handTargets(s: BowedString, v: number): void {
    if (v < 1e-4) {
      s.vBowTarget = 0;
      s.fBowTarget = 0;
      return;
    }
    const [vlo, vhi] = this.design.bowSpeed;
    const x = clamp(Math.log(v / vlo) / Math.log(vhi / vlo), 0, 1);
    s.kBow = 1;
    this.bowTargets(s, 1 + 126 * x);
    const r = v / s.vBowTarget;
    s.fMax *= r;
    s.fBase *= r;
    s.fBowTarget *= r;
    s.vBowTarget = v;
  }

  /** Control-rate bow motion: position along the hair, automatic changes, reversal profile. */
  private bowControl(dt: number): void {
    const b = this.bow;
    const P = this.params;
    let vmax = 0;
    for (const s of this.strings) if (s.bowing && s.vBow > vmax) vmax = s.vBow;
    let sgn = b.dir;
    let fsc = 1;
    const h = this.hand;
    if (h) {
      // the hand decides: no automatic change, the hair where the hand has it
      b.changing = false;
      b.dir = h.v < 0 ? -1 : 1;
      sgn = b.dir;
      b.pos = h.pos * this.design.bowLength;
    } else if (P.bowChanges) {
      const T = Math.max(0.02, P.bowChangeTime);
      const L = this.design.bowLength;
      const pl = this.plan;
      if (!b.changing && vmax > 0) {
        // change when the remaining hair is about what the deceleration needs (+2 cm)
        const left = b.dir > 0 ? L - b.pos : b.pos;
        if (left < (vmax * T) / Math.PI + 0.02) {
          b.changing = true;
          b.t = 0;
          b.from = b.dir;
          b.changes++;
          b.auto++;
          if (pl.on) pl.replan = true;
        } else if (pl.on && pl.changeAt >= 0 && this.frame >= pl.changeAt - 0.5 * T * this.fs) {
          // or where the plan has it (the turn centred on that moment)
          b.changing = true;
          b.t = 0;
          b.from = b.dir;
          b.changes++;
          pl.changes++;
          pl.replan = true;
        }
        if (b.changing) pl.changeAt = -1;
      } else if (this.ahead.length && !this.strings.some((q) => q.bowing)) this.airborne(dt);
      if (b.changing) {
        b.t += dt;
        const x = Math.min(1, b.t / T);
        // speed reverses smoothly through zero; the player eases the weight a little at the turn
        sgn = b.from * Math.cos(Math.PI * x);
        fsc = 1 - 0.18 * Math.sin(Math.PI * x);
        if (x >= 1) {
          b.changing = false;
          b.dir = -b.from;
          sgn = b.dir;
          if (pl.replan) this.strokeOn();
        }
      }
      // a planned stroke that would run out of hair just before its end (the dynamics swelled, the
      // hand wandered) is held back, by up to 15 %, as a player saves the bow; smoothly (0.1 s)
      if (pl.on && !b.changing && vmax > 0 && pl.changeAt < 0) {
        const left = (b.dir > 0 ? L - b.pos : b.pos) - (vmax * T) / Math.PI - 0.025;
        const need = (vmax * Math.max(0, pl.end - this.frame)) / this.fs;
        const c = need > left ? clamp(left / need, 0.85, 1) : 1;
        pl.trim += (c - pl.trim) * (1 - Math.exp(-dt / 0.1));
        sgn *= pl.trim;
      }
      b.pos = clamp(b.pos + sgn * vmax * dt, 0, L);
    }
    const fws = this.design.forceWithSpeed && this.design.rateInvariant;
    for (const s of this.strings) {
      s.vSigned = s.vBow * sgn;
      // design.forceWithSpeed, through a bow change too: the speed passes through zero, and each
      // change starts the Helmholtz motion again (Guettler 2002), so the weight stays under
      // Schelleng's maximum for the speed the bow has at that moment (before: eased by 18 % at the
      // turn whatever the speed, i.e. well above that maximum as the bow stops)
      s.fScale = fws && s.fBow > 0 && s.vBowTarget > 0 ? Math.min(fsc, (s.fMax * Math.abs(s.vSigned)) / (s.vBowTarget * s.fBow)) : fsc;
    }
  }

  /** design.body.corner: the cutoff follows the force the bow presses on the string sounding
   *  loudest (as applied: the attack's rise, a bow change's easing, the pressure controller), over
   *  that string's impedance, in harmonics of its note. With no bow on a string it keeps the last
   *  cutoff (what rings on was shaped by it). Bilinear first-order low-pass, so its cutoff is exact at
   *  any rate. */
  private cornerControl(): void {
    // (index reads, no destructuring: this runs every control block, and must not allocate)
    const c = this.design.body!.corner;
    const k1 = c[0];
    const g = c[1];
    let best: BowedString | null = null;
    for (const s of this.strings) if (s.bowing && s.fBow > 0 && (!best || s.level > best.level)) best = s;
    if (!best && this.fc > 0) return;
    const x = best ? (best.fBow * best.fScale) / best.Z : 0;
    const f0 = best ? this.fs / best.Pn : 440;
    // (at least 150 Hz: the bow's first instants, before any force, are not a muffled note)
    const fc = clamp(k1 * f0 * Math.pow(Math.max(x, 1e-9), g), 150, 0.45 * this.fs);
    if (fc === this.fc) return;
    this.fc = fc;
    const k = Math.tan((Math.PI * fc) / this.fs);
    this.cb = k / (1 + k);
    this.ca = (k - 1) / (k + 1);
  }

  private lift(s: BowedString): void {
    s.bowing = false;
    s.vBowTarget = 0;
    s.fBowTarget = 0;
    s.releasedAt = this.frame;
    s.releasedLevel = s.level;
    if (!this.strings.some((q) => q.bowing)) this.bowOff = this.frame;
  }

  noteOn(midi: number, velocity: number): void {
    this.schedule({ type: 'noteOn', midi, velocity });
  }
  noteOff(midi: number): void {
    this.schedule({ type: 'noteOff', midi });
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<BowedParams>) };
    if (this.params.bodyDamping !== old.bodyDamping) {
      this.setBodyDamping(this.params.bodyDamping);
    }
    if (this.params.room !== old.room || this.params.volume !== old.volume) this.updatePost();
    else if (this.params.seat !== old.seat) this.room.configure(this.params.room, this.params.seat);
    if (this.params.bowPosition !== old.bowPosition || this.params.bowPressure !== old.bowPressure) {
      for (const s of this.strings) if (s.bowing) {
        const ratio = s.vBowTarget;
        s.beta = clamp(this.params.bowPosition * s.betaDyn, 0.03, 0.3);
        s.fMax = (2 * s.Zb * ratio) / (s.beta * (MU_S - MU_D));
        s.fBase = clamp(this.params.bowPressure * s.forceDyn, 0.02, 1.2) * s.fMax;
        s.fBowTarget = Math.min(1.3 * s.fMax, s.fBase * this.pressureCC);
      }
    }
  }

  /** the notes actually sounding: one per bowed string (held, or kept by the pedal) */
  sounding(): number[] {
    const out: number[] = [];
    for (const s of this.strings) if (s.bowing && s.midi >= 0 && !out.includes(s.midi)) out.push(s.midi);
    return out;
  }

  allSoundOff(): void {
    this.hand = null;
    this.forget();
    this.plan.on = false;
    this.dyn = this.dynTarget = 0;
    for (const s of this.strings) {
      s.displaced = [];
      s.dynApplied = 0;
      s.buf.fill(0);
      s.ly = 0;
      s.tb.fill(0);
      s.tly = 0;
      s.bowing = false;
      s.vBow = s.fBow = s.vBowTarget = s.fBowTarget = 0;
      s.level = 0;
      this.setStopped(s, s.def.open, true);
    }
    this.s1.fill(0);
    this.s2.fill(0);
    this.H = 0;
    this.dL = this.dR = 0;
    this.cx.fill(0);
    this.cy.fill(0);
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  get activeVoiceCount(): number {
    return this.strings.filter((s) => s.bowing || s.level > 1e-4).length;
  }
  get activeSympatheticCount(): number {
    return this.strings.filter((s) => !s.bowing && s.level > 1e-6 && s.midi === s.def.open).length;
  }
  get modeFrequencies(): Float64Array {
    return this.freq;
  }

  // ------------------------------------------------------------ audio

  /** Render `frames` samples into outL/outR. Internal blocks (≤ 64, cut at events) do not depend
   *  on `frames` (see Pump). */
  process(outL: Float32Array | Float64Array, outR: Float32Array | Float64Array, frames: number): void {
    this.pump.pull(outL, outR, frames, (L, R) => {
      const q = this.queue;
      while (q.length && q[0].frame <= this.frame) this.apply(q.shift()!.ev);
      let n = 64;
      if (q.length) n = Math.max(1, Math.min(n, q[0].frame - this.frame));
      this.control(n);
      this.render(n);
      for (let t = 0; t < n; t++) {
        L[t] = this.oL[t];
        R[t] = this.oR[t];
      }
      return n;
    });
  }

  /** the frame now leaving process() (the core has rendered up to `frame`) */
  get outputFrame(): number {
    return this.frame - this.pump.pending;
  }

  /** control-rate updates: bow envelopes, vibrato, finger lifts */
  private control(n: number): void {
    const fs = this.fs;
    const dt = n / fs;
    // CC_DYNAMICS glides (a time constant: the same at any block length)
    if (this.dyn !== this.dynTarget) {
      this.dyn += (this.dynTarget - this.dyn) * (1 - Math.exp(-dt / DYN_TAU));
      if (Math.abs(this.dynTarget - this.dyn) < 1e-3) this.dyn = this.dynTarget;
    }
    // louder, the vibrato a little wider (MacLeod 2008, JRME 56(1): violinists' and violists' vibrato
    // is wider at forte than at piano); ×(1 ± 0.25) over ±20 velocity steps, within ×0.6…1.4
    const vibDepth = (this.modwheel >= 0 ? this.modwheel * 30 : this.params.vibrato) * (this.dyn ? clamp(1 + VIB_PER_STEP * this.dyn, 0.6, 1.4) : 1);
    const h = this.hand;
    if (h) {
      h.v += (h.target - h.v) * (1 - Math.exp(-dt / 0.025));
      if (Math.abs(h.target) > 1e-4 && !this.strings.some((q) => q.bowing)) this.handStart();
    }
    for (const s of this.strings) {
      if (h && s.bowing) this.handTargets(s, Math.abs(h.v));
      else if (s.bowing && s.dynApplied !== this.dyn) {
        this.dynTargets(s);
        s.dynApplied = this.dyn;
      }
      // bow speed attack ~ 50 ms, release 15 ms; force follows faster
      const ka = 1 - Math.exp(-dt / (s.bowing ? (this.design.attackTau ? s.tauA : 0.045) : 0.012));
      const wd = this.design.wander;
      if (wd && s.bowing) {
        // an Ornstein–Uhlenbeck walk per quantity (unit variance at time constant tau)
        const a = Math.exp(-dt / wd.tau);
        const b = Math.sqrt(1 - a * a) * Math.sqrt(3);
        for (let q = 0; q < 4; q++) s.wv[q] = a * s.wv[q] + b * (2 * this.rng() - 1);
      }
      const sp = wd && s.bowing ? 1 + wd.speed * s.wv[2] : 1;
      const fo = wd && s.bowing ? 1 + wd.force * s.wv[3] : 1;
      s.vBow += (s.vBowTarget * sp - s.vBow) * ka;
      // in the hand the bow has the hand's speed (already smoothed), not an envelope towards it
      if (h && s.bowing) s.vBow = s.vBowTarget;
      const kf = 1 - Math.exp(-dt / (s.bowing ? 0.012 : 0.008));
      // design.forceWithSpeed: no more than Schelleng's maximum for the speed reached so far
      let fT = s.fBowTarget * fo;
      if (this.design.forceWithSpeed && s.bowing && s.vBowTarget > 0) fT = Math.min(fT, (s.fMax * s.vBow) / s.vBowTarget);
      s.fBow += (fT - s.fBow) * kf;
      if (s.vBow < 1e-6 && !s.bowing) s.vBow = 0;
      if (s.fBow < 1e-6 && !s.bowing) s.fBow = 0;
      // vibrato: onset after 0.25 s, depth in cents
      let cents = 0;
      if (s.bowing && s.midi > s.def.open) {
        const age = (this.frame - s.startedAt) / fs;
        const ramp = clamp((age - 0.25) / 0.35, 0, 1);
        const wd = this.design.wander;
        s.vibPhase += 2 * Math.PI * s.vibRate * (wd ? 1 + wd.vibRate * s.wv[0] : 1) * dt;
        cents = vibDepth * ramp * Math.sin(s.vibPhase) * (wd ? Math.max(0, 1 + wd.vibDepth * s.wv[1]) : 1);
      }
      // the finger lifts from an idle string once its ring has died away, damping what is left (FINGER_LIFT)
      if (!s.bowing && s.midi !== s.def.open) {
        if (s.lifting) {
          if ((this.frame - s.liftAt) / fs > FINGER_LIFT.s) this.setStopped(s, s.def.open, false);
        } else if ((this.frame - s.releasedAt) / fs > 0.3 && s.level <= Math.max(1e-7, FINGER_LIFT.quiet * s.releasedLevel)) {
          s.lifting = true;
          s.liftAt = this.frame;
          // (per round trip of the loop: FINGER_LIFT.db over FINGER_LIFT.s)
          s.lossB *= Math.pow(10, (-FINGER_LIFT.db / 20) * (s.D0 / fs / FINGER_LIFT.s));
        }
      }
      // the live pressure controller follows the bow while it is on the string
      if (s.bowing && s.fBase > 0) s.fBowTarget = Math.min(1.3 * s.fMax, s.fBase * this.pressureCC);
      const bendC = s.bowing || s.midi !== s.def.open ? 100 * this.bend : 0;
      // design.byEar: the finger follows the ear: the mean error of the periods heard since the
      // last correction, weighted by the time they cover
      const ear = this.design.byEar;
      if (ear && s.errN > 0) {
        if (s.bowing && s.midi > s.def.open) s.ear = clamp(s.ear - (s.errSum / s.errN) * (1 - Math.exp(-s.errT / (fs * ear))), -20, 20);
        s.errSum = 0;
        s.errN = 0;
        s.errT = 0;
      }
      s.Dtarget = s.D0 * Math.pow(2, -(cents + bendC + s.ear + s.place) / 1200);
      s.Dtap = s.D0 * Math.pow(2, -bendC / 1200);
    }
    this.bowControl(dt);
    if (this.design.body) this.cornerControl();
    const kc = this.design.idleCoupling;
    if (kc !== undefined) {
      // idle open strings couple loosely; a string being bowed (or still stopped) fully (10 ms glide)
      const a = 1 - Math.exp(-dt / 0.01);
      for (const s of this.strings) {
        const target = s.bowing || s.midi !== s.def.open ? 1 : kc;
        s.c += (target - s.c) * a;
        s.cz = s.c * s.Z;
      }
    }
  }

  private render(n: number): void {
    const strs = this.strings;
    const ns = strs.length;
    const sym = this.params.sympathetic && this.sympatheticAllowed;
    const tor = this.design.torsion;
    const Yt = this.Y0 + this.design.bridgeY;
    const hfG = this.design.hf[0];
    const rosin = this.design.rosinNoise ?? 0.04;
    const kD = this.kD;
    const pT = this.pT;
    const fracT = !!this.design.rateInvariant;
    const byEar = !!this.design.byEar;
    let ZS = 0;
    for (const s of strs) ZS += s.c * s.cz;
    const oL = this.oL;
    const oR = this.oR;
    const hL = this.hL;
    const hR = this.hR;
    const K = this.K;
    const b0 = this.b0;
    const b2 = this.b2;
    const a1 = this.a1;
    const a2 = this.a2;
    const s1 = this.s1;
    const s2 = this.s2;
    const rl = this.radL;
    const rr = this.radR;
    const vin = this.vinS;
    const peak = this.peakS;
    const on = this.onS;
    peak.fill(0);
    for (let i = 0; i < ns; i++) {
      const s = strs[i];
      on[i] = sym || s.bowing || s.level > 1e-7 || s.midi !== s.def.open ? 1 : 0;
    }
    for (let t = 0; t < n; t++) {
      const w = this.frame + t;
      let S = 0;
      for (let i = 0; i < ns; i++) {
        const s = strs[i];
        if (!on[i]) {
          vin[i] = 0;
          continue;
        }
        const buf = s.buf;
        const mask = s.mask;
        // glide the stopped length smoothly (vibrato, finger changes)
        s.D += (s.Dtarget - s.D) * kD;
        if (byEar) s.dSum += s.D;
        // ---- bow at an interior point (in place, like a hammer)
        if (s.fBow > 0) {
          // round 3: the bow taps sit on the note's nominal loop (with bend, without
          // vibrato), not the gliding D.
          // Vibrato still changes the loop (fractional read at the bridge), but the wave
          // the bow sees no longer jumps by a whole sample a dozen times per vibrato
          // cycle; each jump was a click between the harmonics (the cello read 3.9 dB
          // noisier than its recording; −1.9 dB now).
          const P = s.Dtap || s.D0;
          const Wb = s.Wb;
          let iL = 0;
          let iR = 0;
          let bL = 0;
          let aR = 0;
          let vh: number;
          // design.bowWidth: the share of the force's own velocity the contact sees this sample
          // (Σh² over the outgoing and the returning taps, halved; 1 for a point bow)
          let sk = 1;
          let nL = 0;
          let nR = 0;
          if (Wb > 0) {
            // a contact of finite width: its centre stays β of the stopped length from the bridge
            // (vibrato and bend move the finger, not the bow), so on the returning wave it sits
            // at the loop's current length D minus that, between samples
            const xb = Math.max(Wb + 1, 0.5 * s.beta * P);
            const kI = s.kI;
            const kH = s.kH;
            nL = contactTaps(xb, Wb, s.Wc, s.Ws, kI, kH, 0);
            nR = contactTaps(s.D - xb, Wb, s.Wc, s.Ws, kI, kH, 32);
            let v = 0;
            let s2 = 0;
            for (let q = 0; q < nL; q++) {
              v += kH[q] * buf[(w - kI[q]) & mask];
              s2 += kH[q] * kH[q];
            }
            for (let q = 32; q < 32 + nR; q++) {
              v -= kH[q] * buf[(w - kI[q]) & mask];
              s2 += kH[q] * kH[q];
            }
            vh = v;
            sk = 0.5 * s2;
          } else {
            const db = Math.max(1, Math.round((s.beta * P) / 2));
            iL = (w - db) & mask;
            iR = (w - Math.round(P - db)) & mask;
            bL = buf[iL];
            aR = -buf[iR];
            vh = aR + bL;
          }
          // torsion: the surface under the bow also rolls (incoming torsional waves at the bow)
          let vs = vh;
          let iLt = 0;
          let iRt = 0;
          let tL = 0;
          let tR = 0;
          // design.rateInvariant: the bow on the torsional loop at its exact place, between two
          // samples (linear weights 1 − φ, φ on the bridge side; the nut side mirrors them), and
          // the share of its own torsional velocity it sees this sample (Σ of the weights², 1 for
          // a whole-sample tap)
          let phT = 0;
          let skt = 1;
          if (tor) {
            const Dt = s.Dt;
            if (fracT) {
              const xt = Math.max(1, (s.beta * Dt) / 2);
              const it = Math.floor(xt);
              phT = xt - it;
              const tb = s.tb;
              // bridge side: taps it, it + 1; nut side: Dt − it − 1, Dt − it (weights φ, 1 − φ)
              iLt = it;
              iRt = Dt - it - 1;
              tL = (1 - phT) * tb[(w - it) & 1023] + phT * tb[(w - it - 1) & 1023];
              tR = -(phT * tb[(w - iRt) & 1023] + (1 - phT) * tb[(w - iRt - 1) & 1023]);
              skt = (1 - phT) * (1 - phT) + phT * phT;
            } else {
              const dbt = Math.max(1, Math.round((s.beta * Dt) / 2));
              iLt = (w - dbt) & 1023;
              iRt = (w - (Dt - dbt)) & 1023;
              tL = s.tb[iLt];
              tR = -s.tb[iRt];
            }
            vs = vh + tL + tR;
          }
          // rosin noise roughens the friction curve slightly
          this.noise(s);
          const muScale = 1 + rosin * s.noiseLp;
          const fb = s.fBow * s.fScale * muScale;
          const twoZ = 2 * s.Z;
          // a finite-width contact is stiffer within one sample (its force spreads over Σh² of
          // the string), in parallel with the torsional impedance at its centre
          const twoZb = Wb > 0 ? (tor ? 1 / (sk / twoZ + skt / (2 * s.Zt)) : twoZ / sk) : tor ? (fracT ? 1 / (1 / twoZ + skt / (2 * s.Zt)) : 2 * s.Zb) : twoZ;
          const dh = s.vSigned - vs;
          const wasStick = s.stick;
          let f: number;
          const fStick = twoZb * dh;
          if (s.stick && Math.abs(fStick) <= MU_S * fb) {
            f = fStick;
          } else {
            // slip: solve Δ + (F/2Z)·μ(Δ) = Δh on the side of the sliding direction
            const sg = s.stick ? (dh >= 0 ? 1 : -1) : s.slipSign;
            const a = fb / twoZb;
            const dhs = sg * dh;
            const B1 = V0 + a * MU_D - dhs;
            const C0 = V0 * (a * MU_S - dhs);
            const disc = B1 * B1 - 4 * C0;
            if (disc >= 0) {
              const root = (-B1 + Math.sqrt(disc)) / 2;
              if (root > 0) {
                f = sg * fb * (MU_D + ((MU_S - MU_D) * V0) / (V0 + root));
                s.stick = false;
                s.slipSign = sg;
              } else if (Math.abs(fStick) <= MU_S * fb) {
                f = fStick;
                s.stick = true;
              } else {
                f = sg * fb * MU_D;
                s.stick = false;
              }
            } else if (Math.abs(fStick) <= MU_S * fb) {
              f = fStick;
              s.stick = true;
            } else {
              f = sg * fb * MU_D;
            }
          }
          // design.byEar: a slip that begins a period (the first after at least 0.7 of one) marks it;
          // its length against the period the loop's length gives (uncorrected) is the ear's error
          if (byEar && wasStick && !s.stick && s.midi > s.def.open) {
            if (s.relAt < 0) {
              s.relAt = w;
              s.dSum = 0;
            } else {
              const Pm = w - s.relAt;
              const Pe = (s.Pn * s.dSum) / (Pm * s.D0);
              if (Pm > 0.7 * Pe) {
                // heard only once the stroke has settled: the bow near its speed, and two periods in
                // a row that agree within 2 % (an attack's or a bow change's slips are not a pitch)
                if (Pm < 1.4 * Pe && Math.abs(Pm - s.lastPm) < 0.02 * Pm && s.vBow > 0.7 * s.vBowTarget && Math.abs(s.vSigned) > 0.7 * s.vBow) {
                  s.errSum += 1200 * Math.log2(Pe / Pm) + s.ear;
                  s.errN++;
                  s.errT += Pm;
                }
                s.lastPm = Pm;
                s.relAt = w;
                s.dSum = 0;
              }
            }
          }
          const df = f / twoZ;
          if (Wb > 0) {
            // the force spread over the contact, on both travelling waves (the transpose of the
            // read, so the junction stays passive)
            const kI = s.kI;
            const kH = s.kH;
            for (let q = 0; q < nL; q++) buf[(w - kI[q]) & mask] += df * kH[q];
            for (let q = 32; q < 32 + nR; q++) buf[(w - kI[q]) & mask] -= df * kH[q];
          } else {
            buf[iL] = bL + df;
            buf[iR] = -(aR + df);
          }
          if (tor) {
            const dft = f / (2 * s.Zt);
            if (fracT) {
              const tb = s.tb;
              tb[(w - iLt) & 1023] += (1 - phT) * dft;
              tb[(w - iLt - 1) & 1023] += phT * dft;
              tb[(w - iRt) & 1023] -= phT * dft;
              tb[(w - iRt - 1) & 1023] -= (1 - phT) * dft;
            } else {
              s.tb[iLt] = tL + dft;
              s.tb[iRt] = -(tR + dft);
            }
          }
          if (i === this.focus) {
            s.trF[s.trI] = f;
            s.trV[s.trI] = vh + df * sk;
            s.trI = (s.trI + 1) & (TRACE - 1);
          }
        } else if (i === this.focus) {
          s.trF[s.trI] = 0;
          s.trV[s.trI] = 0;
          s.trI = (s.trI + 1) & (TRACE - 1);
        }
        if (tor) {
          // the torsional round trip: rigid at the nut/finger and the bridge, heavily damped
          const xt = s.tb[(w - s.Dt) & 1023];
          s.tly = (1 - pT) * s.tg * xt + pT * s.tly;
          s.tb[w & 1023] = Math.abs(s.tly) < 1e-30 ? 0 : s.tly;
        }
        // ---- bridge-incoming wave: fractional (Lagrange-3) read, inversion, loss
        const D = s.D;
        const di = Math.floor(D);
        const mu = D - di + 1;
        const x0 = buf[(w - di + 1) & mask];
        const x1 = buf[(w - di) & mask];
        const x2 = buf[(w - di - 1) & mask];
        const x3 = buf[(w - di - 2) & mask];
        const h0 = (-(mu - 1) * (mu - 2) * (mu - 3)) / 6;
        const h1 = (mu * (mu - 2) * (mu - 3)) / 2;
        const h2 = (-mu * (mu - 1) * (mu - 3)) / 2;
        const h3 = (mu * (mu - 1) * (mu - 2)) / 6;
        const u = -(h0 * x0 + h1 * x1 + h2 * x2 + h3 * x3);
        s.ly = s.lossB * u - s.lossA * s.ly;
        vin[i] = s.ly;
        S += s.cz * s.ly;
        const al = Math.abs(s.ly);
        if (al > peak[i]) peak[i] = al;
      }
      // ---- passive bridge junction with the modal body
      const vb = (Yt * 2 * S + this.H) / (1 + Yt * ZS);
      const F = 2 * S - ZS * vb;
      let h = 0;
      let ol = 0;
      let or = 0;
      for (let k = 0; k < K; k++) {
        const y = b0[k] * F + s1[k];
        const ns1 = s2[k] - a1[k] * y;
        s2[k] = b2[k] * F - a2[k] * y;
        s1[k] = ns1;
        h += ns1;
        ol += rl[k] * y;
        or += rr[k] * y;
      }
      this.H = h;
      const hfv = hfG * F;
      hL[t] = hfv;
      hR[t] = -hfv;
      oL[t] = ol;
      oR[t] = or;
      for (let i = 0; i < ns; i++) {
        if (!on[i]) continue;
        const s = strs[i];
        s.buf[w & s.mask] = s.c * vb - vin[i];
      }
    }
    for (let i = 0; i < ns; i++) strs[i].level = Math.max(peak[i], strs[i].level * 0.9);
    if (this.dK || this.design.body) {
      // v2 (and design.body): the high-frequency radiation reaches both microphones in phase. The
      // round-2 chain sends an inverted copy to the right, which cancels in a mono sum (a phone
      // speaker, or the one-microphone recordings this is fitted to: the violin's and viola's
      // whole top octave was missing there); a delayed copy combs the harmonics.
      for (let t = 0; t < n; t++) hR[t] = hL[t];
    }
    this.hfHp.process(hL, hR, n);
    const g = this.gain;
    for (let t = 0; t < n; t++) {
      oL[t] = (oL[t] + hL[t]) * g;
      oR[t] = (oR[t] + hR[t]) * g;
    }
    if (this.design.body) {
      // design.body.corner: the Helmholtz corner's rounding, on the radiated sound
      const cb = this.cb;
      const ca = this.ca;
      let xl = this.cx[0];
      let xr = this.cx[1];
      let yl = this.cy[0];
      let yr = this.cy[1];
      for (let t = 0; t < n; t++) {
        const l = oL[t];
        const r = oR[t];
        yl = cb * (l + xl) - ca * yl;
        yr = cb * (r + xr) - ca * yr;
        xl = l;
        xr = r;
        oL[t] = yl;
        oR[t] = yr;
      }
      this.cx[0] = xl;
      this.cx[1] = xr;
      this.cy[0] = Math.abs(yl) < 1e-25 ? 0 : yl;
      this.cy[1] = Math.abs(yr) < 1e-25 ? 0 : yr;
    }
    if (this.dK) {
      // v2: pressure ∝ volume acceleration — the time derivative of the radiating velocities
      const k = this.dK;
      let pl = this.dL;
      let pr = this.dR;
      for (let t = 0; t < n; t++) {
        const l = oL[t];
        const r = oR[t];
        oL[t] = (l - pl) * k;
        oR[t] = (r - pr) * k;
        pl = l;
        pr = r;
      }
      this.dL = pl;
      this.dR = pr;
    }
    this.eq.process(oL, oR, n);
    if (!this.dry) {
      this.room.process(oL, oR, n, 1, this.params.room * 0.7);
      this.limiter.process(oL, oR, n);
    }
    this.frame += n;
    if ((this.frame & 4095) < n) {
      for (let k = 0; k < K; k++) {
        if (Math.abs(s1[k]) < 1e-22) s1[k] = 0;
        if (Math.abs(s2[k]) < 1e-22) s2[k] = 0;
      }
      // silence idle strings completely (no denormals)
      for (const s of strs) if (!s.bowing && s.level < 1e-12 && s.level > 0) {
        s.buf.fill(0);
        s.ly = 0;
        s.level = 0;
      }
    }
  }

  private noise(s: BowedString): void {
    s.noiseLp += this.kN * (this.gN * (this.rng() * 2 - 1) - s.noiseLp);
  }

  // ------------------------------------------------------------ inspection

  keySummary(): KeySummary[] {
    const out: KeySummary[] = [];
    const info = { lo: this.design.strings[0].open, hi: this.design.strings[3].open + 24 };
    for (let m = info.lo; m <= info.hi; m++) {
      const s = [...this.strings].reverse().find((x) => m >= x.def.open) ?? this.strings[0];
      out.push({ midi: m, f1: et(m), B: 0, nStrings: 1, lengthM: (this.design.L * s.fOpen) / et(m), hasDamper: false, preparation: `${s.def.name} string` });
    }
    return out;
  }

  getVisual(points = 160): object {
    const s = this.strings[this.focus];
    const shape = new Float32Array(points);
    // displacement along the string, nut/finger (0) to bridge (1)
    const P = s.D;
    const half = Math.floor(P / 2);
    const raw = new Float32Array(half + 1);
    let y = 0;
    const w = this.frame - 1;
    for (let d = 0; d < half; d++) {
      const left = s.buf[(w - d) & s.mask];
      const right = -s.buf[(w - Math.round(P - d)) & s.mask];
      y += left + right;
      raw[d + 1] = y / this.fs;
    }
    const end = raw[half];
    for (let p = 0; p < points; p++) {
      const x = (1 - p / (points - 1)) * half;
      const j = Math.min(half - 1, Math.floor(x));
      const fr = x - j;
      shape[p] = raw[j] * (1 - fr) + raw[j + 1] * fr - end * (x / half);
    }
    // bow trace: last ~4 periods
    const len = Math.min(TRACE, Math.max(64, Math.round(4 * P)));
    const tf = new Float32Array(len);
    const tv = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const j = (s.trI - len + i + TRACE) & (TRACE - 1);
      tf[i] = s.trF[j];
      tv[i] = s.trV[j];
    }
    const amps = new Float32Array(this.K);
    for (let k = 0; k < this.K; k++) amps[k] = Math.hypot(this.s1[k], this.s2[k]) * this.mass[k];
    const excite: ExciteTrace = {
      title: 'Bow',
      unit: 'N',
      rate: this.fs,
      trace: tf,
      trace2: tv,
      trace2Label: 'string velocity under the bow',
      caption: 'Friction force of the bow on the string over the last few periods. The string sticks to the bow (flat parts), then slips back once per period: Helmholtz motion, emerging from the friction law. The bar is the bow from frog to tip, with the contact point moving along it; when the hair runs out (or on each new détaché note) the bow reverses, and the stick–slip re-forms the other way round.',
      meta: `${s.def.name} string · ${this.bow.changing ? 'bow change' : this.bow.dir > 0 ? 'down-bow' : 'up-bow'} ${(Math.abs(s.vSigned) * 100).toFixed(0)} cm/s · ${s.fBow.toFixed(2)} N · β ${s.beta.toFixed(3)} · ${Math.round((100 * this.bow.pos) / this.design.bowLength)} % from the frog`,
    };
    return {
      frame: this.frame,
      voices: this.activeVoiceCount,
      sympathetic: this.activeSympatheticCount,
      focus: {
        midi: s.midi,
        nStrings: 1,
        shapes: [shape],
        hammerAt: 1 - s.beta,
        prepAt: -1,
        lengthM: (this.design.L * s.fOpen) / et(Math.max(s.midi, s.def.open)),
        f1: et(Math.max(s.midi, s.def.open)),
        B: 0,
        damper: 0,
      },
      strike: null,
      excite,
      bow: { dir: this.bow.dir, pos: this.bow.pos / this.design.bowLength, changing: this.bow.changing, speed: s.vSigned, planned: this.plan.on },
      // all four strings: open note, sounding length (fraction of the open string), level, bowed
      strings: this.strings.map((x) => {
        const stop = x.fOpen / et(Math.max(x.midi < 0 ? x.def.open : x.midi, x.def.open));
        // where the finger is right now: the loop's current length (vibrato, bend) over the note's
        return { open: x.def.open, stop, stopNow: stop * (x.D / (x.D0 || x.D)), level: x.level, bowing: x.bowing };
      }),
      modes: amps,
      sustain: this.sustain,
      soft: this.soft,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }
}
