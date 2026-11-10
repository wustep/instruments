// Trombone (alto in E♭, tenor in B♭ with an F attachment, bass in B♭ with F and G♭ attachments): buzzing
// lips in a cup mouthpiece driving a long, mostly cylindrical bore that the slide lengthens, opening
// through a gently tapering bell section into a wide Bessel flare. The brass family's mechanism (brass.ts,
// horn.ts: the lips a valve the breath blows open, the bore's resonances the notes the lips can lock to),
// but here the bore is the trombone's own and built from its measures, not a stand-in:
//
// The mouthpiece. A cup (a volume: a compliance C = V/ρc²) the lips blow into, joined to the bore by its
// throat and backbore (an inertance M = ρ∫dx/S): a Helmholtz resonator, the mouthpiece's "popping
// frequency" (Benade 1976, "Fundamentals of Musical Acoustics" §20.4; Campbell, Gilbert & Myers 2021, "The
// Science of Brass Instruments" §5.3). Below it the mouthpiece is nearly a closed end; at it, an open one.
// It pulls the bore's upper resonances down.
//
// The bore. About two thirds of a tenor trombone's 2.74 m (Fletcher & Rossing 1998, "The Physics of Musical
// Instruments" §14.5) is cylindrical: the leadpipe, the inner and outer slide tubes, the crook, the tuning
// slide (13.9 mm for a large-bore tenor, Bach 42B / Conn 88H: 0.547"). A closed cylinder alone plays only
// odd harmonics (1, 3, 5 … of c/4L). The bell section (1.2 m from where the bore starts to widen to the rim)
// is a Bessel horn, r ∝ (d + d₀)^−ε with d the distance from the rim (ε ≈ 0.8, d₀ ≈ 4 cm: a fit to a tenor
// bell's diameters, 80 mm 0.1 m from the rim, 40 mm at 0.3 m, 20 mm at 0.7 m, Pyle 1975, JASA 58, 1309, and
// Braden, Newton & Campbell 2009, JASA 125, 2404): low frequencies are turned back early in the flare (a
// shorter tube for them), high ones late or not at all, which lifts the low resonances; with the
// mouthpiece pulling the high ones down, the series becomes (nearly) 2, 3, 4, 5 … times a pedal that is
// not itself a resonance (Benade 1976 §20.5; Campbell, Gilbert & Myers 2021 §4.4–4.6). Here the flare is
// built as Kelly–Lochbaum scattering sections (each an integer number of samples long, merged where the
// radius changes by under 4 %), ending at the rim in the open end's low-pass reflection (Levine &
// Schwinger 1948: ka ≈ 1 near 500 Hz for a 216 mm bell). The cylinder's viscothermal wall loss (Keefe
// 1984, JASA 75, 58: α ≈ 3·10⁻⁵ √f / a Np/m) and the slide's round trip are one delay line, its length set
// so that the n-th resonance of the whole bore falls on the note (the slide is where a player puts it:
// found by ear, not by a ruler). The slide's seven positions each lower the tube a semitone; the F
// attachment's valve (tenor, bass) adds a loop lowering it a fourth, the bass's second valve (G♭) a major
// third, both together a minor sixth (D). The slide moves at a player's speed (a few m/s), and a moving
// slide is masked by a soft "legato" tongue unless the player glides (CC65, portamento: the trombone's
// glissando); the pitch wheel moves the slide.
//
// The lips. A one-mass outward-striking valve (Helmholtz's lip reed; Elliott & Bowsher 1982, JSV 83, 181;
// Adachi & Sato 1996, JASA 99, 1200; for the trombone: Cullen, Gilbert & Campbell 2000, Acta Acustica 86,
// 704; Velut, Vergez, Gilbert & Djahanbani 2017, Acta Acustica 103, 132), driven by the pressure across
// them, Δp = mouth − cup, its resonance near the note. The flow through the slit is Bernoulli's,
// u = w·h·√(2|Δp|/ρ), h = max(0, h₀ + y). Everything is in SI units: the mouth pressure in pascals
// (trombonists blow ~0.5 kPa pianissimo to ~8 kPa fortissimo high up: Bouhuys 1964, JASA 36, 967; Fréour
// & Scavone 2013, JASA 134, 3887), so the wave's own nonlinear steepening along the slide (a crest
// travels faster than a trough; shock waves form in a trombone played fortissimo, Hirschberg et al. 1996,
// JASA 99, 1754) follows from the air's β = 1.2, ρ and c over the tube's length: what reaches the bell is
// read earlier or later by its own pressure. That is the trombone's "brassy" fortissimo.
//
// Three sizes share it: the same mouthpiece, cylinder, bell and lips, at each instrument's measures
// (TROMBONE_SIZES): the alto in E♭ (a fourth shorter, 12.2 mm bore, 7" bell; no valve), the tenor in B♭
// with its F attachment (13.9 mm, 8½"), the bass in B♭ with F and G♭ valves (14.3 mm, 9½").

import { Pump } from './pump.ts';
import type { KeySummary } from '../api/messages.ts';
import { CC_DYNAMICS, DYN_TAU, type ExciteTrace, type InstrumentCore } from './instrument.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { biquadHighpass, biquadHighShelf, biquadLowpass, biquadPeaking } from './filters.ts';
import type { PianoEvent } from './piano-core.ts';
import { clamp, interp, mulberry32, playerCents, playerSeed, playerVibrato } from './util.ts';
import tromboneTuning from './trombone-tuning.json';

/** air (20 °C): speed of sound, density, the coefficient of nonlinearity (γ + 1)/2 */
const C_AIR = 343.2;
const RHO = 1.204;
const BETA = 1.2;

export type TromboneSize = 'alto' | 'tenor' | 'bass';
export const TROMBONE_SIZE_IDS: TromboneSize[] = ['alto', 'tenor', 'bass'];

/** an instrument's measures */
export interface TromboneBore {
  label: string;
  /** the open tube's pedal (MIDI): its resonances are (nearly) the partials of this note */
  pedal: number;
  /** the compass (MIDI, as it sounds) */
  lo: number;
  hi: number;
  /** the slide alone, then each valve setting: its name and how far it lowers the tube (semitones). The
   *  chart prefers the slide alone and takes a valve to spare the long positions (sideCost) */
  sides: { name: string; lower: number; valves: number[] }[];
  /** the cylindrical bore's diameter (m) */
  bore: number;
  /** the bell: rim diameter (m), Bessel exponent ε and d₀ (m) */
  bell: number;
  flare: number;
  flareD0: number;
  /** the tube's length mouthpiece to rim, slide closed, slide alone (m) */
  length: number;
  /** how far the slide reaches beyond first position (m) */
  travel: number;
  /** the mouthpiece: its cup's diameter and depth (m) and throat's diameter (m); its backbore's length (m)
   *  and diameter at the shank (m) */
  cup: number;
  cupDepth: number;
  throat: number;
  backbore: number;
  shank: number;
}

// Measures: Bach 39 / Yamaha YSL-871 alto (0.481", 7" bell, Bach 12C-size mouthpiece); Bach 42B / Conn 88H
// tenor (0.547", 8½" bell, Bach 6½AL: cup 25.4 mm, throat 7.0 mm); Bach 50B3 bass (0.562", 9½" bell, Bach
// 1½G: cup 27.9 mm, throat 7.5 mm), as their makers list them. The open tubes: B♭ 2.74 m (Fletcher &
// Rossing 1998 §14.5), E♭ a fourth shorter. The slide's seventh position is 0.57 m out on a tenor.
export const TROMBONE_SIZES: Record<TromboneSize, TromboneBore> = {
  alto: { label: 'alto trombone in E♭', pedal: 39, lo: 45, hi: 79, sides: [{ name: 'Eb', lower: 0, valves: [] }], bore: 0.0122, bell: 0.178, flare: 0.8, flareD0: 0.033, length: 2.06, travel: 0.47, cup: 0.0245, cupDepth: 0.0088, throat: 0.0064, backbore: 0.06, shank: 0.0095 },
  tenor: { label: 'tenor trombone in B♭/F', pedal: 34, lo: 28, hi: 77, sides: [{ name: 'Bb', lower: 0, valves: [] }, { name: 'F', lower: 5, valves: [1] }], bore: 0.0139, bell: 0.216, flare: 0.8, flareD0: 0.04, length: 2.74, travel: 0.64, cup: 0.0254, cupDepth: 0.0095, throat: 0.007, backbore: 0.07, shank: 0.011 },
  bass: { label: 'bass trombone in B♭/F/G♭', pedal: 34, lo: 24, hi: 72, sides: [{ name: 'Bb', lower: 0, valves: [] }, { name: 'F', lower: 5, valves: [1] }, { name: 'D', lower: 8, valves: [1, 2] }], bore: 0.0143, bell: 0.241, flare: 0.8, flareD0: 0.045, length: 2.74, travel: 0.64, cup: 0.0279, cupDepth: 0.0105, throat: 0.0075, backbore: 0.075, shank: 0.0122 },
};
/** the compass of all three, as the Orchestra's trombone voice spans it */
export const TROMBONE_LO = 24;
export const TROMBONE_HI = 79;
/** the stage's own trombone (the tenor's compass) */
export const TROMBONE_SOLO_LO = TROMBONE_SIZES.tenor.lo;
export const TROMBONE_SOLO_HI = TROMBONE_SIZES.tenor.hi;

export const sizeOf = (s: unknown): TromboneSize => (s === 0 || s === 'alto' ? 'alto' : s === 2 || s === 'bass' ? 'bass' : 'tenor');

/** the partials players use (the 7th and 11th are far from equal temperament: alternatives only) */
const PARTIALS = [2, 3, 4, 5, 6, 8, 9, 10, 12];
/** what a valve costs in the chart, in positions: players take the F attachment for what the slide alone
 *  would play in sixth or seventh position (Kleinhammer 1963, "The Art of Trombone Playing"; Raph 1962) */
const SIDE_COST = [0, 4.5, 5.2];

export interface TromboneFingering {
  /** 'Bb' (or 'Eb', the alto) the slide alone, 'F' the F valve, 'D' both valves (the bass) */
  side: string;
  /** the valves down (1 the F valve, 2 the G♭ valve) */
  valves: number[];
  /** the slide position: 1 (closed) … 7 (the slide alone lowers six semitones; on a longer side a position
   *  is longer, so fewer fit) */
  position: number;
  /** how far the side lowers the open tube, and the slide lowers it more (semitones) */
  sideLower: number;
  lower: number;
  /** which resonance of the tube sounds (1: a pedal note, played on the 2nd and higher resonances) */
  partial: number;
}

/** the standard chart for a note as it sounds: the side and position needing the least reach (a valve
 *  only to spare the sixth and seventh positions), on the lowest usable partial; pedal notes below */
export function tromboneFingering(m: number, size: TromboneSize = 'tenor'): TromboneFingering {
  const B = TROMBONE_SIZES[size];
  const note = clamp(Math.round(m), B.lo, B.hi);
  let best: TromboneFingering | null = null;
  let bestScore = Infinity;
  for (let pass = 0; pass < 2 && !best; pass++)
    B.sides.forEach((s, si) => {
      const open = B.pedal - s.lower;
      const L = B.length * Math.pow(2, s.lower / 12);
      // the most the slide lowers this side (its reach over the side's longer tube), and a hair more
      const vmax = 12 * Math.log2(1 + (2 * B.travel) / L) + 0.3;
      for (const n of pass ? [1] : PARTIALS) {
        const v = open + Math.round(12 * Math.log2(n)) - note;
        if (v < 0 || v > vmax) continue;
        const score = v + SIDE_COST[si] + n * 0.01;
        if (score < bestScore) {
          bestScore = score;
          best = { side: s.name, valves: s.valves, position: v + 1, sideLower: s.lower, lower: v, partial: n };
        }
      }
    });
  return best ?? { side: B.sides[0].name, valves: [], position: 1, sideLower: 0, lower: 0, partial: 4 };
}

/** the tube's length for a fingering (m): the side's open tube lengthened by the slide (equal semitones) */
export const tromboneTubeLength = (f: TromboneFingering, size: TromboneSize = 'tenor'): number => TROMBONE_SIZES[size].length * Math.pow(2, (f.sideLower + f.lower) / 12);
/** where the slide stands for a fingering (m out from first position): half the tube it adds */
export const tromboneSlideOut = (f: TromboneFingering, size: TromboneSize = 'tenor'): number => (TROMBONE_SIZES[size].length * Math.pow(2, f.sideLower / 12) * (Math.pow(2, f.lower / 12) - 1)) / 2;

export interface TromboneParams {
  /** alto, tenor or bass (0, 1, 2 from a knob) */
  size: TromboneSize | number;
  /** blowing pressure scale (1 = the dynamic's own) */
  breath: number;
  /** the lips' tension: semitones above (+) or below (−) the note's own */
  lip: number;
  /** turbulence noise amount */
  noise: number;
  /** lip vibrato depth (fraction of the lips' frequency) */
  vibrato: number;
  /** a slide move between legato notes: 0 masked by a soft tongue (as players do), 1 a glissando */
  gliss: number;
  room: number;
  volume: number;
  seat?: Seat | null;
  /** fitting only (scripts/fit-trombone.ts): the voicing below, overridden */
  voice?: Partial<TromboneVoice>;
}

/** The voicing: the lips and the radiation's colour, fitted to the University of Iowa MIS tenor and bass
 *  trombones (scripts/fit-trombone.ts on the fit half of the notes, judged on the other half). The bore's
 *  measures are the instruments' own (TROMBONE_SIZES), not fitted. */
export interface TromboneVoice {
  /** the lips: quality factor at the bottom and the top of the compass, and their resonance relative to the
   *  note (semitones) */
  lipQ: number;
  lipQTop: number;
  lipBelow: number;
  /** their static stiffness per unit area (Pa per m of opening), at the pedal and per octave up (a higher
   *  note: firmer, tenser lips) */
  stiff: number;
  stiffExp: number;
  /** the rest opening and the widest (m), the slit's width (m) */
  h0: number;
  hMax: number;
  width: number;
  /** the mouth pressure (Pa) at velocity 1 and 127, the curve between (velocity^gammaCurve), and how it
   *  follows the note: × (f/f(pedal))^gammaExp */
  pLo: number;
  pHi: number;
  gammaCurve: number;
  gammaExp: number;
  /** the breath's rise (s) soft and loud, × (f/f(pedal))^riseExp */
  riseLo: number;
  riseHi: number;
  riseExp: number;
  /** the tongue: the lips held this long (s), then let go over this many periods, already swinging (kick,
   *  in units of the rest opening) */
  tongueHold: number;
  tongueRel: number;
  kick: number;
  /** the lips' Q starts this fraction lower and firms up with qTau (s) */
  qAttack: number;
  qTau: number;
  /** the cup's volume and the throat's inertance, × the mouthpiece's measured ones */
  cupScale: number;
  throatScale: number;
  /** the wall's loss, × the viscothermal law; the open end's reflection corner (× c/2πa) and Q */
  wallScale: number;
  rimFc: number;
  rimQ: number;
  /** the steepening, × the air's own (1: β = 1.2 over the slide's length) */
  steep: number;
  /** turbulence in the lips' slit, ∝ the flow, at the bottom and the top */
  noise: number;
  noiseTop: number;
  /** the radiation's colour: high-pass (Hz), a formant (Hz, dB, Q), a low-pass at lp × (f₀/220)^lpExp
   *  (Hz, Q), lpDyn octaves lower at velocity 1, a shelf (Hz, dB) */
  hp: number;
  f1: number;
  g1: number;
  q1: number;
  lp: number;
  lpQ: number;
  lpExp: number;
  lpDyn: number;
  shelfF: number;
  shelfG: number;
  /** level across the compass (dB an octave) */
  tilt: number;
}

export const TROMBONE_VOICE: TromboneVoice = {
  lipQ: 50,
  lipQTop: 50,
  lipBelow: 0.7,
  stiff: 4e6,
  stiffExp: 1.5,
  h0: 1e-4,
  hMax: 2.5e-3,
  width: 0.012,
  pLo: 600,
  pHi: 5000,
  gammaCurve: 1.6,
  gammaExp: 0.35,
  riseLo: 0.03,
  riseHi: 0.015,
  riseExp: -0.2,
  tongueHold: 0.012,
  tongueRel: 2,
  kick: 1,
  qAttack: 0.3,
  qTau: 0.08,
  cupScale: 1.6,
  throatScale: 1,
  wallScale: 1,
  rimFc: 1,
  rimQ: 0.6,
  steep: 1,
  noise: 0.05,
  noiseTop: 0.05,
  hp: 40,
  f1: 500,
  g1: 0,
  q1: 0.7,
  lp: 4000,
  lpQ: 0.6,
  lpExp: 0,
  lpDyn: 1,
  shelfF: 4000,
  shelfG: 0,
  tilt: 0,
};

const BUF = 1 << 13;
const TRACE = 2048;
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** the shortest tongued note's breath (s) at velocity 1 and 127 */
const MIN_BLOW_PP = 0.25;
const MIN_BLOW = 0.1;
const LP_SECTION = 2;
/** the slide's top speed (m/s) and its smoothing (s) */
const SLIDE_SPEED = 4;
const SLIDE_TAU = 0.012;
/** the phase table's resolution (Hz) and reach */
const PH_DF = 1;
const PH_FMAX = 1700;

/** the bore as built at one sample rate: the bell's sections, the mouthpiece's constants, the tuning
 *  table of the n-th resonance */
interface BoreBuilt {
  /** sections: lengths (samples), junction coefficients (towards the rim), ring offsets and masks */
  n: Int32Array;
  r: Float64Array;
  off: Int32Array;
  mask: Int32Array;
  total: number;
  /** the bell section's length (m) */
  bellLen: number;
  /** the cylinder's characteristic impedance (Pa·s/m³), the cup's compliance and the throat's inertance */
  zc: number;
  C: number;
  M: number;
  /** the rim's reflection (biquad [b0,b1,b2,a1,a2], unit gain at DC) */
  rim: Float64Array;
  /** unwrapped phase of R_mouthpiece · R_bell (rad) every PH_DF Hz from 0 */
  phase: Float64Array;
}

export class TromboneCore implements InstrumentCore {
  readonly id = 'trombone' as const;
  readonly fs: number;
  params: TromboneParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = 1;
  sympatheticAllowed = true;
  dry: boolean;
  private V: TromboneVoice;
  private size: TromboneSize = 'tenor';
  private B: TromboneBore = TROMBONE_SIZES.tenor;
  private built!: BoreBuilt;
  private queue: { frame: number; ev: PianoEvent | { type: 'control'; cc: number; value: number } }[] = [];
  /** the slide's two legs: the wave going out (towards the bell) and coming back */
  private outB = new Float64Array(BUF);
  private backB = new Float64Array(BUF);
  /** the bell's sections: right-going and left-going rings */
  private bR = new Float64Array(1);
  private bL = new Float64Array(1);
  /** the round trip of the cylinder (samples) now and where the slide is heading */
  private D = 400;
  private Dtarget = 400;
  private Dvel = 0;
  /** the slide's first position on this side (samples of round trip), for the pictures */
  private Dopen = 400;
  /** the rim's reflection state, the wall's one-pole state */
  private rx1 = 0;
  private rx2 = 0;
  private ry1 = 0;
  private ry2 = 0;
  private wallY = 0;
  /** the slow part of the returning wave (the mean pressure reflected whole) */
  private wallM = 0;
  private kMean = 0;
  private wallA = 0;
  private wallG = 1;
  /** the mouthpiece: cup pressure and throat flow */
  private pc = 0;
  private ut = 0;
  /** the lips */
  private y1 = 0;
  private y2 = 0;
  private dpPrev = 0;
  private lipF = 220;
  private lipFTarget = 220;
  private fingering: TromboneFingering = tromboneFingering(53);
  private rng: () => number;
  private pressure = 0;
  private pTarget = 0;
  private attackTau = 0.02;
  private tongueN = 0;
  private kickPending = false;
  private tongueI = 0;
  private tongueLen = 1;
  /** the soft legato tongue while the slide moves: its depth now (0 none … 1 shut) and until when */
  private legatoUntil = 0;
  private legatoDip = 0;
  private portamento = false;
  private vibPhase = 0;
  private vib0 = 0;
  private vibRate = 1;
  private expression = 1;
  private dynTarget = 0;
  private dyn = 0;
  /** the pitch wheel and the player's own intonation (semitones) */
  private bend = 0;
  private tune = 0;
  private note = 53;
  private held: number[] = [];
  private velocity = 80;
  private eq = new BiquadChain();
  private lpNote = 900;
  private lpSet = -1;
  private tiltNote = 1;
  private tiltOut = 1;
  private noiseNote = 0.03;
  private riseNote = 1;
  private qNote = 6;
  private gNote = 1;
  private kNote = 4e6;
  private room: Room;
  private limiter: Limiter;
  private pump = new Pump(64);
  private oL = new Float64Array(128);
  private oR = new Float64Array(128);
  private level = 0;
  private gain = 1;
  private trLip = new Float32Array(TRACE);
  private trP = new Float32Array(TRACE);
  private trI = 0;
  private hist = new Float32Array(4096);
  private histI = 0;
  private modeAmps = new Float32Array(16);
  private modeFreqs = new Float64Array(16);
  private noteStart = 0;
  private blowUntil = 0;
  private releasePending = false;
  private hNow = 0;
  private gammaNow = 0;
  private lastOut = 0;

  constructor(opts: { sampleRate: number; params?: Partial<TromboneParams>; dry?: boolean; player?: number }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.params = { size: 'tenor', breath: 1, lip: 0, noise: 1, vibrato: 0, gliss: 0, room: 0.3, volume: 1, ...opts.params };
    this.V = { ...TROMBONE_VOICE, ...this.params.voice };
    this.rng = mulberry32(playerSeed(57, opts.player));
    const pv = playerVibrato(opts.player);
    this.vib0 = this.vibPhase = pv.phase;
    this.vibRate = pv.rate;
    this.tune = playerCents(opts.player) / 100;
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    this.build();
    this.voiced();
    this.setNote(this.home(), true);
  }

  /** a note to rest on (the middle of the size's compass) */
  private home(): number {
    return Math.round((this.B.lo + this.B.hi) / 2);
  }

  /** the bore at this sample rate: the bell's sections, the mouthpiece, the phase table */
  private build(): void {
    const fs = this.fs;
    const V = this.V;
    this.size = sizeOf(this.params.size);
    const B = (this.B = TROMBONE_SIZES[this.size]);
    const a = B.bore / 2;
    const R = B.bell / 2;
    const dx = C_AIR / fs;
    // the flare: r(d) = R (d₀/(d + d₀))^ε, d from the rim; it starts where it reaches the bore
    const rAt = (d: number) => R * Math.pow(B.flareD0 / (d + B.flareD0), B.flare);
    const dStart = B.flareD0 * (Math.pow(R / a, 1 / B.flare) - 1);
    // walk from the bore to the rim a sample at a time, a new section where the radius has grown 4 %
    const ns: number[] = [];
    const rs: number[] = [];
    let d = dStart;
    let cur = a;
    let len = 0;
    while (d > 0) {
      const dn = Math.max(0, d - dx);
      const rm = rAt((d + dn) / 2);
      if (len > 0 && rm > cur * 1.04) {
        ns.push(len);
        rs.push(cur);
        cur = rm;
        len = 0;
      } else if (len === 0) cur = rm;
      len++;
      d = dn;
    }
    ns.push(len);
    rs.push(cur);
    const J = ns.length;
    const n = new Int32Array(J);
    const r = new Float64Array(J);
    const off = new Int32Array(J);
    const mask = new Int32Array(J);
    let o = 0;
    for (let i = 0; i < J; i++) {
      n[i] = ns[i];
      let p = 1;
      while (p <= ns[i]) p <<= 1;
      off[i] = o;
      mask[i] = p - 1;
      o += p;
      // the junction at section i's left end (from the cylinder or the section before): pressure
      // reflection for a wave going towards the rim, (S_before − S_i)/(S_before + S_i)
      const sPrev = i ? rs[i - 1] ** 2 : a * a;
      const s = rs[i] ** 2;
      r[i] = (sPrev - s) / (sPrev + s);
    }
    if (this.bR.length < o) {
      this.bR = new Float64Array(o);
      this.bL = new Float64Array(o);
    } else {
      this.bR.fill(0);
      this.bL.fill(0);
    }
    const S = Math.PI * a * a;
    const zc = (RHO * C_AIR) / S;
    // the mouthpiece: its cup a spherical cap of its depth over its rim's radius; the throat (6 mm) and the
    // backbore (a cone from the throat to the shank) as one inertance
    const rc = B.cup / 2;
    const Vc = ((Math.PI * B.cupDepth * (3 * rc * rc + B.cupDepth * B.cupDepth)) / 6) * V.cupScale;
    const rt = B.throat / 2;
    const lOverS = 0.006 / (Math.PI * rt * rt) + B.backbore / (Math.PI * rt * (B.shank / 2));
    const C = Vc / (RHO * C_AIR * C_AIR);
    const M = RHO * lOverS * V.throatScale;
    // the open end: a low-pass reflection, its corner where ka ≈ rimFc
    const rim = biquadLowpass(Math.min(0.45 * fs, (V.rimFc * C_AIR) / (2 * Math.PI * R)), V.rimQ, fs);
    const built: BoreBuilt = { n, r, off, mask, total: o, bellLen: dStart, zc, C, M, rim: new Float64Array(rim), phase: new Float64Array(Math.floor(PH_FMAX / PH_DF) + 1) };
    // the phase of R_mp(ω)·R_bell(ω), exactly as the discrete model has them, unwrapped from 0 Hz
    const dt = 1 / fs;
    const am = dt / M;
    const bm = 1 + (dt * zc) / M;
    const km = dt / C;
    let prev = Math.PI;
    for (let i = 0; i < built.phase.length; i++) {
      const w = (2 * Math.PI * Math.max(0.05, i * PH_DF)) / fs;
      // the rim: −H(e^{jω})
      const [hr, hi] = biquadAt(built.rim, w);
      let gr = -hr;
      let gi = -hi;
      // inwards through the sections: Γ ← Γ·e^{−2jωn}, then the junction (r + Γ)/(1 + rΓ)
      for (let k = J - 1; k >= 0; k--) {
        const ph = -2 * w * n[k];
        const cr = Math.cos(ph);
        const ci = Math.sin(ph);
        const tr = gr * cr - gi * ci;
        const ti = gr * ci + gi * cr;
        const rk = r[k];
        // (r + Γ)/(1 + rΓ)
        const nr = rk + tr;
        const ni = ti;
        const dr = 1 + rk * tr;
        const di = rk * ti;
        const dd = dr * dr + di * di;
        gr = (nr * dr + ni * di) / dd;
        gi = (ni * dr - nr * di) / dd;
      }
      // the mouthpiece: R = 1 − 2·a·Zc/D(z), D = (b − z⁻¹) + a·k·z⁻¹/(1 − z⁻¹)
      const zr = Math.cos(w);
      const zi = -Math.sin(w);
      // a·k·z⁻¹/(1 − z⁻¹)
      const er = 1 - zr;
      const ei = -zi;
      const ee = er * er + ei * ei;
      const qr = (am * km * (zr * er + zi * ei)) / ee;
      const qi = (am * km * (zi * er - zr * ei)) / ee;
      const Dr = bm - zr + qr;
      const Di = -zi + qi;
      const DD = Dr * Dr + Di * Di;
      const mr = 1 - (2 * am * zc * Dr) / DD;
      const mi = (2 * am * zc * Di) / DD;
      const pr = mr * gr - mi * gi;
      const pi = mr * gi + mi * gr;
      let ph = Math.atan2(pi, pr);
      while (ph - prev > Math.PI) ph -= 2 * Math.PI;
      while (ph - prev < -Math.PI) ph += 2 * Math.PI;
      built.phase[i] = ph;
      prev = ph;
    }
    this.built = built;
    this.kMean = 1 - Math.exp((-2 * Math.PI * 20) / fs);
  }

  /** the cylinder's round trip (samples) putting the n-th resonance of the whole bore at f */
  private roundTrip(f: number, n: number): number {
    const ph = this.built.phase;
    const x = f / PH_DF;
    const i = Math.min(ph.length - 2, Math.floor(x));
    const t = x - i;
    const phi = ph[i] + (ph[i + 1] - ph[i]) * t;
    const w = (2 * Math.PI * f) / this.fs;
    return (phi + 2 * Math.PI * (n - 1)) / w;
  }

  private voiced(): void {
    const fs = this.fs;
    const V = this.V;
    this.eq.set([
      biquadHighpass(V.hp, 0.7, fs),
      biquadPeaking(V.f1, V.q1, V.g1, fs),
      biquadLowpass(Math.min(0.45 * fs, V.lp), V.lpQ, fs),
      biquadHighShelf(Math.min(0.4 * fs, V.shelfF), V.shelfG, fs),
    ]);
    this.lpSet = -1;
    this.room.configure(this.params.room, this.params.seat);
    // (in pascals at the bell: scaled to the recordings' level)
    this.gain = 7.5e-4 * this.params.volume;
  }

  /** measured tuning (scripts/tune-trombone.ts): cents the bare model plays sharp, by size and sample rate */
  static tuningTable: Record<string, { fs: number[]; midi: number[]; cents: number[][] }> = tromboneTuning as Record<string, { fs: number[]; midi: number[]; cents: number[][] }>;
  private tuningCorrection(m: number): number {
    const t = TromboneCore.tuningTable[this.size];
    if (!t?.midi?.length) return 1;
    const rows = t.cents.map((r) => interp(m, t.midi, r));
    const c = t.fs.length > 1 ? interp(this.fs, t.fs, rows) : rows[0];
    return Math.pow(2, c / 1200);
  }

  /** the wall's loss over the cylinder's round trip as a gain and a one-pole: |H| matched to e^{−α·2L} at
   *  100 Hz and 800 Hz (α = 3·10⁻⁵·√f/a, Keefe 1984) */
  private setWall(D: number): void {
    const fs = this.fs;
    const a = this.B.bore / 2;
    const L2 = (D * C_AIR) / fs;
    const k = 3e-5 * this.V.wallScale * L2 / a;
    const g1 = Math.exp(-k * 10); // √100
    const g2 = Math.exp(-k * Math.sqrt(800));
    // H = g·(1 − p)/(1 − p z⁻¹) at DC is g; choose p so |H(800)|/|H(100)| = g2/g1, g so |H(100)| = g1
    const ratio = g2 / g1;
    const mag = (p: number, f: number) => {
      const w = (2 * Math.PI * f) / fs;
      return (1 - p) / Math.hypot(1 - p * Math.cos(w), p * Math.sin(w));
    };
    let lo = 0;
    let hi = 0.999;
    for (let it = 0; it < 40; it++) {
      const p = 0.5 * (lo + hi);
      if (mag(p, 800) / mag(p, 100) > ratio) lo = p;
      else hi = p;
    }
    const p = 0.5 * (lo + hi);
    this.wallA = p;
    this.wallG = g1 / mag(p, 100);
  }

  private setNote(m: number, immediate: boolean): void {
    const fs = this.fs;
    const V = this.V;
    const B = this.B;
    while (m < B.lo) m += 12;
    while (m > B.hi) m -= 12;
    const f = et(m);
    const fg = tromboneFingering(m, this.size);
    this.fingering = fg;
    this.note = m;
    this.retarget(immediate);
    const u = clamp((m - B.lo) / (B.hi - B.lo), 0, 1);
    const ped = et(B.pedal);
    this.noiseNote = V.noise + (V.noiseTop - V.noise) * u;
    this.riseNote = Math.pow(f / ped, V.riseExp);
    this.qNote = V.lipQ + (V.lipQTop - V.lipQ) * u;
    this.gNote = Math.pow(f / ped, V.gammaExp);
    this.kNote = V.stiff * Math.pow(f / ped, V.stiffExp);
    this.lpNote = V.lp * Math.pow(f / 220, V.lpExp);
    this.lpSet = -1;
    this.tiltNote = Math.pow(f / ped, V.tilt / 6.0206);
    if (immediate) this.tiltOut = this.tiltNote;
    const fb = f / fg.partial;
    for (let k = 0; k < 16; k++) this.modeFreqs[k] = (k + 1) * fb;
  }

  /** where the slide goes for the note (and the wheel, and the player's intonation), and the lips' tension */
  private retarget(immediate: boolean): void {
    const m = this.note;
    const fg = this.fingering;
    const c = this.tuningCorrection(m) / Math.pow(2, (this.bend + this.tune) / 12);
    const f = et(m) / c;
    // a pedal note is played on the resonances above it: tune the 2nd to its octave
    const n = Math.max(2, fg.partial);
    this.Dtarget = Math.max(8, this.roundTrip(f * (n / fg.partial), n));
    // first position on this side: the same partial with the slide closed (the side's open note)
    const fOpen = (et(this.B.pedal - fg.sideLower) * fg.partial) / this.tuningCorrection(m);
    this.Dopen = this.roundTrip(fOpen * (n / fg.partial), n);
    if (immediate) {
      this.D = this.Dtarget;
      this.Dvel = 0;
    }
    this.setWall(this.Dtarget);
    this.lipFTarget = f;
    if (immediate) this.lipF = f * Math.pow(2, -this.V.lipBelow / 12);
  }

  schedule(ev: unknown, frame?: number): void {
    const f = frame === undefined ? this.frame : Math.max(this.frame, Math.floor(frame));
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].frame > f) i--;
    q.splice(i, 0, { frame: f, ev: ev as PianoEvent });
  }

  private apply(ev: PianoEvent | { type: 'control'; cc: number; value: number }): void {
    switch (ev.type) {
      case 'noteOn': {
        if (ev.velocity <= 0) return this.apply({ type: 'noteOff', midi: ev.midi });
        const m = ev.midi;
        const legato = this.pTarget > 0 && this.held.length > 0;
        this.held = this.held.filter((x) => x !== m);
        this.held.push(m);
        this.velocity = ev.velocity;
        const before = this.fingering;
        const D0 = this.Dtarget;
        this.setNote(m, !legato && this.level < 1e-3);
        this.pTarget = 1;
        this.attackTau = legato ? 0.01 : (this.V.riseLo + (this.V.riseHi - this.V.riseLo) * (ev.velocity / 127)) * this.riseNote;
        if (!legato) {
          this.tongueN = Math.round(this.V.tongueHold * this.fs);
          this.tongueLen = Math.max(1, Math.round((this.V.tongueRel * this.fs) / et(this.note)));
          this.tongueI = 0;
          this.kickPending = true;
          this.vibPhase = this.vib0;
          this.noteStart = this.frame;
          this.blowUntil = this.frame + Math.round((MIN_BLOW_PP + (MIN_BLOW - MIN_BLOW_PP) * (ev.velocity / 127)) * this.fs);
        } else this.legatoMove(before, D0);
        this.releasePending = false;
        break;
      }
      case 'noteOff': {
        const was = this.note;
        this.held = this.held.filter((x) => x !== ev.midi);
        if (this.held.length && this.noteOf(ev.midi) === was) {
          const before = this.fingering;
          const D0 = this.Dtarget;
          this.setNote(this.held[this.held.length - 1], false);
          this.legatoMove(before, D0);
        } else if (!this.held.length && this.sustain < 0.5) this.release();
        break;
      }
      case 'sustain':
        this.sustain = clamp(ev.value, 0, 1);
        if (this.sustain < 0.5 && !this.held.length) this.release();
        break;
      case 'control':
        if (ev.cc === 1 || ev.cc === 2 || ev.cc === 11) this.expression = ev.value < 0 ? 1 : 0.4 + 0.8 * clamp(ev.value, 0, 1);
        else if (ev.cc === CC_DYNAMICS) this.dynTarget = clamp(ev.value, -64, 64);
        else if (ev.cc === 65) this.portamento = ev.value >= 0.5;
        break;
      case 'bend':
        // the pitch wheel moves the slide (and the lips with it)
        this.bend = clamp(ev.value, -12, 12);
        this.retarget(false);
        break;
      case 'allNotesOff':
        this.held = [];
        this.pTarget = 0;
        this.releasePending = false;
        break;
      default:
        break;
    }
  }
  /** a held key's note as the size plays it (folded into its compass) */
  private noteOf(m: number): number {
    let x = m;
    while (x < this.B.lo) x += 12;
    while (x > this.B.hi) x -= 12;
    return x;
  }

  /** a legato change: if the slide has to move, a soft tongue masks it while it travels (unless the player
   *  glides); a change of partial with the slide still is a lip slur */
  private legatoMove(before: TromboneFingering, D0: number): void {
    const moved = Math.abs(this.Dtarget - D0) * (C_AIR / (4 * this.fs));
    if (moved < 0.004 || this.portamento || this.params.gliss >= 0.5) return;
    // its travel time at the slide's speed, at least 25 ms
    const t = Math.max(0.025, moved / SLIDE_SPEED + 2 * SLIDE_TAU);
    this.legatoUntil = this.frame + Math.round(t * this.fs);
    void before;
  }

  private release(): void {
    if (this.pTarget > 0 && this.frame < this.blowUntil) this.releasePending = true;
    else this.pTarget = 0;
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<TromboneParams>) };
    const sizeChanged = sizeOf(this.params.size) !== this.size;
    if (this.params.voice !== old.voice || sizeChanged) {
      this.V = { ...TROMBONE_VOICE, ...this.params.voice };
      this.build();
      this.voiced();
      this.clear();
      this.setNote(sizeChanged ? this.noteOf(this.note) : this.note, true);
    } else if (this.params.room !== old.room || this.params.volume !== old.volume) this.voiced();
    else if (this.params.seat !== old.seat) this.room.configure(this.params.room, this.params.seat);
  }

  sounding(): number[] {
    return this.pTarget > 0 ? [this.note] : [];
  }

  allSoundOff(): void {
    this.dyn = this.dynTarget = 0;
    this.pressure = this.pTarget = 0;
    this.releasePending = false;
    this.held = [];
    this.clear();
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  private clear(): void {
    this.outB.fill(0);
    this.backB.fill(0);
    this.bR.fill(0);
    this.bL.fill(0);
    this.rx1 = this.rx2 = this.ry1 = this.ry2 = this.wallY = this.wallM = 0;
    this.pc = this.ut = 0;
    this.y1 = this.y2 = this.dpPrev = 0;
    this.tongueN = 0;
    this.tongueI = this.tongueLen;
    this.legatoUntil = 0;
    this.legatoDip = 0;
    this.level = 0;
    this.lastOut = 0;
  }

  get activeVoiceCount(): number {
    return this.pressure > 1e-3 || this.level > 1e-4 ? 1 : 0;
  }
  get activeSympatheticCount(): number {
    return 0;
  }
  get modeFrequencies(): Float64Array {
    return this.modeFreqs;
  }

  process(outL: Float32Array | Float64Array, outR: Float32Array | Float64Array, frames: number): void {
    this.pump.pull(outL, outR, frames, (L, R) => {
      const q = this.queue;
      while (q.length && q[0].frame <= this.frame) this.apply(q.shift()!.ev);
      let n = 64;
      if (q.length) n = Math.max(1, Math.min(n, q[0].frame - this.frame));
      if (this.releasePending) {
        if (this.frame >= this.blowUntil) {
          this.releasePending = false;
          if (!this.held.length && this.sustain < 0.5) this.pTarget = 0;
        } else n = Math.min(n, this.blowUntil - this.frame);
      }
      // (the legato tongue's end cuts the block too: nothing may depend on the host's block length)
      if (this.legatoUntil > this.frame) n = Math.min(n, this.legatoUntil - this.frame);
      this.render(n);
      for (let t = 0; t < n; t++) {
        L[t] = this.oL[t];
        R[t] = this.oR[t];
      }
      return n;
    });
  }

  get outputFrame(): number {
    return this.frame - this.pump.pending;
  }

  private render(n: number): void {
    const fs = this.fs;
    const dt = n / fs;
    const P = this.params;
    const V = this.V;
    const bt = this.built;
    const k = 1 - Math.exp(-dt / (this.pTarget > this.pressure ? this.attackTau : 0.04));
    this.pressure += (this.pTarget - this.pressure) * k;
    if (this.pressure < 1e-5 && this.pTarget === 0) this.pressure = 0;
    const age = (this.frame - this.noteStart) / fs;
    this.vibPhase += 2 * Math.PI * 5.2 * this.vibRate * dt;
    const vib = 1 + P.vibrato * clamp((age - 0.3) / 0.4, 0, 1) * Math.sin(this.vibPhase);
    if (this.dyn !== this.dynTarget) {
      this.dyn += (this.dynTarget - this.dyn) * (1 - Math.exp(-dt / DYN_TAU));
      if (Math.abs(this.dynTarget - this.dyn) < 1e-3) this.dyn = this.dynTarget;
    }
    const v01 = this.dyn ? clamp(this.velocity + this.dyn, 1, 127) / 127 : this.velocity / 127;
    const vc = Math.pow(v01, V.gammaCurve);
    const pm = (V.pLo + (V.pHi - V.pLo) * vc) * this.gNote * this.pressure * P.breath * this.expression;
    this.gammaNow = pm;
    // the legato tongue: a soft dip of the lips' opening while the slide travels (a time constant)
    const dipT = this.legatoUntil > this.frame ? 0.85 : 0;
    this.legatoDip += (dipT - this.legatoDip) * (1 - Math.exp(-dt / 0.006));
    const lipTarget = this.lipFTarget * Math.pow(2, (P.lip - V.lipBelow) / 12) * vib;
    this.lipF += (lipTarget - this.lipF) * (1 - Math.exp(-dt / 0.006));
    const th = (2 * Math.PI * Math.min(this.lipF, 0.2 * fs)) / fs;
    const q = this.qNote * (1 - V.qAttack * Math.exp(-age / V.qTau));
    const rr = Math.exp((-Math.PI * this.lipF) / (Math.max(0.5, q) * fs));
    const la1 = 2 * rr * Math.cos(th);
    const la2 = rr * rr;
    // (static gain 1/K: the lips open by Δp/K metres)
    const lb = (1 - la1 + la2) / this.kNote;
    const h0 = V.h0;
    const hMax = V.hMax;
    const wq = V.width * Math.SQRT2 / Math.sqrt(RHO);
    const nz = this.noiseNote * P.noise;
    const lpF = Math.min(0.45 * fs, this.lpNote * Math.pow(2, V.lpDyn * (vc - 1)));
    if (Math.abs(lpF - this.lpSet) > 0.5) {
      lowpassInto(this.eq.c, 5 * LP_SECTION, lpF, V.lpQ, fs);
      this.lpSet = lpF;
    }
    this.tiltOut += (this.tiltNote - this.tiltOut) * (1 - Math.exp(-dt / 0.03));
    // the mouthpiece's constants
    const sdt = 1 / fs;
    const am = sdt / bt.M;
    const bm = 1 + (sdt * bt.zc) / bt.M;
    const km = sdt / bt.C;
    const zc = bt.zc;
    // the slide: heading for the note (× the wheel), at most SLIDE_SPEED, smoothed
    const DT = this.Dtarget;
    const vMax = (4 * SLIDE_SPEED) / C_AIR; // samples of round trip per sample
    const sk = 1 / (SLIDE_TAU * fs);
    const vk = 1 - Math.exp(-1 / (0.004 * fs));
    // the steepening: samples earlier per pascal over the outgoing leg (β·L/ρc³)
    const legM = (this.D * C_AIR) / (2 * fs);
    const stp = (V.steep * BETA * legM * fs) / (RHO * C_AIR * C_AIR * C_AIR);
    const dMax = fs / (6 * et(this.note));
    const mask = BUF - 1;
    const outB = this.outB;
    const backB = this.backB;
    const bR = this.bR;
    const bL = this.bL;
    const sn = bt.n;
    const sr = bt.r;
    const so = bt.off;
    const sm = bt.mask;
    const J = sn.length;
    const rim = bt.rim;
    const wA = this.wallA;
    const wG = this.wallG;
    const oL = this.oL;
    const oR = this.oR;
    let peak = 0;
    let y1 = this.y1;
    let y2 = this.y2;
    let dpPrev = this.dpPrev;
    let h = this.hNow;
    let pc = this.pc;
    let ut = this.ut;
    let wy = this.wallY;
    let wm = this.wallM;
    const kM = this.kMean;
    let prevShift = this.lastOut;
    for (let t = 0; t < n; t++) {
      const w = this.frame + t;
      // the slide
      const want = clamp((DT - this.D) * sk, -vMax, vMax);
      this.Dvel += (want - this.Dvel) * vk;
      this.D += this.Dvel;
      const half = 0.5 * this.D;
      // the wave back at the mouthpiece: the bell's reflection a leg ago, through the wall's loss
      const hi = Math.floor(half);
      const hf = half - hi;
      const back = backB[(w - hi) & mask] * (1 - hf) + backB[(w - hi - 1) & mask] * hf;
      wy = wA * wy + (1 - wA) * back;
      wm += (back - wm) * kM;
      const pin = wG * wy + (1 - wG) * wm;
      // the lips: a mass–spring driven by the last pressure difference
      const y = lb * dpPrev + la1 * y1 - la2 * y2;
      y2 = y1;
      y1 = y;
      let tg = 1;
      if (this.tongueN > 0) {
        this.tongueN--;
        tg = 0;
      } else if (this.kickPending) {
        this.kickPending = false;
        const kv = V.kick * h0 * (0.5 + 0.5 * v01) * 4;
        y1 += kv;
        y2 += kv * Math.cos(th);
      }
      if (this.tongueN === 0 && this.tongueI < this.tongueLen) {
        tg = 0.5 - 0.5 * Math.cos((Math.PI * this.tongueI) / this.tongueLen);
        this.tongueI++;
      }
      h = tg * (1 - this.legatoDip) * Math.min(hMax, Math.max(0, h0 + y));
      // the flow through the lips into the cup: Bernoulli on the pressure across them
      const dp = pm - pc;
      let ul = dp >= 0 ? wq * h * Math.sqrt(dp) : -wq * h * Math.sqrt(-dp);
      if (nz && ul !== 0) ul += nz * ul * (this.rng() * 2 - 1);
      dpPrev = dp;
      // the throat (implicit: its own flow against the bore's impedance), then the cup
      ut = (ut + am * (pc - 2 * pin)) / bm;
      const pout = pin + zc * ut;
      pc += km * (ul - ut);
      // into the slide's outgoing leg
      outB[w & mask] = pout;
      // the wave reaching the bell, steepened on its way: read earlier (a crest) or later by its pressure
      let sh = stp * outB[(w - hi) & mask];
      sh = Math.max(-dMax, Math.min(dMax, sh));
      // (the read point never runs backwards: the shift falls by at most 0.8 sample a sample)
      if (sh < prevShift - 0.8) sh = prevShift - 0.8;
      prevShift = sh;
      const Ds = half - sh;
      const si = Math.floor(Ds);
      const sf = Ds - si;
      const ein = outB[(w - si) & mask] * (1 - sf) + outB[(w - si - 1) & mask] * sf;
      // the bell's sections: each junction from the waves arriving at it
      // (section 0's right-going wave is fed from the slide; the last ends at the rim)
      let aR = ein;
      for (let j = 0; j < J; j++) {
        // section j: the left-going wave arriving at its left end, and its right-going wave arriving at
        // its right end
        const lArr = bL[so[j] + ((w - sn[j]) & sm[j])];
        const rj = sr[j];
        // the junction at j's left end: aR arriving from the left, lArr from the right
        bR[so[j] + (w & sm[j])] = (1 + rj) * aR - rj * lArr;
        const toLeft = rj * aR + (1 - rj) * lArr;
        if (j === 0) backB[w & mask] = toLeft;
        else bL[so[j - 1] + (w & sm[j - 1])] = toLeft;
        aR = bR[so[j] + ((w - sn[j]) & sm[j])];
      }
      // the rim: the low-pass part turned back (inverted), the rest radiated
      const rb = rim[0] * aR + rim[1] * this.rx1 + rim[2] * this.rx2 - rim[3] * this.ry1 - rim[4] * this.ry2;
      this.rx2 = this.rx1;
      this.rx1 = aR;
      this.ry2 = this.ry1;
      this.ry1 = rb;
      bL[so[J - 1] + (w & sm[J - 1])] = -rb;
      const rad = aR - rb;
      const out = rad * this.tiltOut;
      oL[t] = out;
      oR[t] = 0.92 * out;
      this.trLip[this.trI] = h;
      this.trP[this.trI] = pc;
      this.trI = (this.trI + 1) & (TRACE - 1);
      this.hist[this.histI] = pc;
      this.histI = (this.histI + 1) & 4095;
      const ao = Math.abs(out);
      if (ao > peak) peak = ao;
    }
    this.lastOut = prevShift;
    this.y1 = y1;
    this.y2 = y2;
    this.dpPrev = dpPrev;
    this.hNow = h;
    this.pc = pc;
    this.ut = ut;
    this.wallY = wy;
    this.wallM = wm;
    this.level = Math.max(peak * this.gain, this.level * 0.9);
    const gn = this.gain;
    for (let t = 0; t < n; t++) {
      oL[t] *= gn;
      oR[t] *= gn;
    }
    this.eq.process(oL, oR, n);
    if (!this.dry) {
      this.room.process(oL, oR, n, 1, P.room * 0.7);
      this.limiter.process(oL, oR, n);
    }
    this.frame += n;
    if (this.level < 1e-9 && this.pressure === 0 && this.level > 0) this.clear();
  }

  keySummary(): KeySummary[] {
    const out: KeySummary[] = [];
    for (let m = this.B.lo; m <= this.B.hi; m++) {
      const fg = tromboneFingering(m, this.size);
      const side = fg.side === 'F' ? 'F valve, ' : fg.side === 'D' ? 'F and G♭ valves, ' : '';
      out.push({ midi: m, f1: et(m), B: 0, nStrings: 1, lengthM: tromboneTubeLength(fg, this.size), hasDamper: false, preparation: `${side}position ${fg.position}, ${fg.partial === 1 ? 'pedal' : `partial ${fg.partial}`}` });
    }
    return out;
  }

  /** the slide now (m out from first position on this side) */
  private slideNow(): number {
    return ((this.D - this.Dopen) * C_AIR) / (4 * this.fs);
  }

  getVisual(points = 160): object {
    // the standing pressure wave along the slide (lips 0 → bell 1): out-going and coming back
    const shape = new Float32Array(points);
    const half = this.D / 2;
    const w = this.frame - 1;
    for (let p = 0; p < points; p++) {
      const d = (p / (points - 1)) * half;
      shape[p] = this.outB[(w - Math.round(d)) & (BUF - 1)] * 1e-3 + this.backB[(w - Math.round(half - d)) & (BUF - 1)] * 1e-3;
    }
    const len = Math.min(TRACE, Math.max(64, Math.round((4 * this.fs) / et(this.note))));
    const tl = new Float32Array(len);
    const tp = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const j = (this.trI - len + i + TRACE) & (TRACE - 1);
      tl[i] = this.trLip[j] * 1e3;
      tp[i] = this.trP[j] * 1e-3;
    }
    for (let k = 0; k < 16; k++) {
      const wk = (2 * Math.PI * this.modeFreqs[k]) / this.fs;
      if (wk >= Math.PI) {
        this.modeAmps[k] = 0;
        continue;
      }
      const c = 2 * Math.cos(wk);
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < 4096; i++) {
        const s0 = this.hist[(this.histI + i) & 4095] + c * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      this.modeAmps[k] = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / 2048e3;
    }
    const fg = this.fingering;
    const side = fg.side === 'F' ? 'F valve · ' : fg.side === 'D' ? 'F+G♭ valves · ' : '';
    const excite: ExciteTrace = {
      title: 'Lips',
      unit: '',
      rate: this.fs,
      trace: tl,
      trace2: tp,
      trace2Label: 'pressure in the mouthpiece',
      caption: 'Opening of the lips (top) as they buzz, driven by the pressure in the mouthpiece (bottom).',
      meta: `${side}position ${fg.position} · ${fg.partial === 1 ? 'pedal' : `partial ${fg.partial}`}`,
    };
    const slide = this.slideNow();
    return {
      frame: this.frame,
      voices: this.activeVoiceCount,
      sympathetic: 0,
      focus: {
        midi: this.note,
        nStrings: 1,
        shapes: [shape],
        hammerAt: 0.01,
        prepAt: -1,
        lengthM: tromboneTubeLength(fg, this.size),
        f1: et(this.note),
        B: 0,
        damper: 0,
      },
      strike: null,
      excite,
      modes: this.modeAmps.slice(),
      // (the lips' opening in units of a loud note's widest, about 1; the blowing pressure in kPa)
      lips: { open: this.hNow / 1.5e-3, blow: this.gammaNow / 1000 },
      trombone: { size: this.size, slide, target: tromboneSlideOut(fg, this.size), position: fg.position, valves: fg.valves, side: fg.side, partial: fg.partial },
      sustain: this.sustain,
      soft: this.soft,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }
}

/** a biquad [b0,b1,b2,a1,a2]'s response at ω (rad/sample) */
function biquadAt(c: ArrayLike<number>, w: number): [number, number] {
  const c1 = Math.cos(w);
  const s1 = -Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = -Math.sin(2 * w);
  const nr = c[0] + c[1] * c1 + c[2] * c2;
  const ni = c[1] * s1 + c[2] * s2;
  const dr = 1 + c[3] * c1 + c[4] * c2;
  const di = c[3] * s1 + c[4] * s2;
  const dd = dr * dr + di * di;
  return [(nr * dr + ni * di) / dd, (ni * dr - nr * di) / dd];
}

function lowpassInto(c: Float64Array, at: number, f: number, q: number, fs: number): void {
  const w = (2 * Math.PI * f) / fs;
  const alpha = Math.sin(w) / (2 * q);
  const cs = Math.cos(w);
  const a0 = 1 + alpha;
  c[at] = (1 - cs) / 2 / a0;
  c[at + 1] = (1 - cs) / a0;
  c[at + 2] = (1 - cs) / 2 / a0;
  c[at + 3] = (-2 * cs) / a0;
  c[at + 4] = (1 - alpha) / a0;
}
