// Harp (the concert pedal harp, 47 strings, C1–G7): strings plucked with the fingers and left to ring, on a
// long thin soundboard, seven pedals setting the scale.
//
// The strings. A harp has one string for each note of a diatonic scale, seven to the octave, tuned in C♭
// major: its lowest is a C, its highest a G, six and a half octaves above. The top nine are nylon, the middle
// twenty-six gut, the lowest twelve wire wound on a core (the standard concert stringing). Every C is dyed
// red and every F black or dark blue, so the hand finds its place. Nothing damps a string but the player's
// hand: plucked, it rings until it has died away (laissez vibrer is the harp's ordinary state), and the
// strings beside it, free too, answer through the soundboard.
//
// The pedals. Seven pedals, one for each note name, the left foot's D, C and B and the right foot's E, F, G
// and A, each with three notches: up (flat), middle (natural), down (sharp). A pedal turns the fourchettes
// (forked discs) on the neck against every string of its name, shortening them all by a semitone (natural)
// or two (sharp). So the seven pedals are the key: a note not in it needs a pedal moved first, and a
// glissando, the hand drawn across the strings, plays whatever scale or chord the pedals spell (set B♯ and
// E♯, F♭ and C♭ and half the strings double the other half: the harp's whole-tone and diminished glissandi).
// Here a note asked for by its pitch finds its string; if no string is at that pitch the pedal that reaches
// it is moved, as a harpist's foot would move it, chosen so that no ringing string is retuned and so that the
// notes known to be coming (a file playing says them ahead) stay playable; a glissando's notes (the hand
// drawn across the keys) are strings, not pitches: each white key its string, at the pitch its pedal gives.
//
// The model. A string fixed at both ends and plucked at a point is, exactly, a sum of its modes: partial n at
// fₙ = n·f₀·√(1 + B·n²) (B: the stiffness, small on gut and nylon, Fletcher & Rossing 1998, "The Physics of
// Musical Instruments" §2.18), set going by the pluck with a displacement ∝ sin(nπβ)/n² (β: where along the
// string the finger takes it; the force on the soundboard is its slope there, ∝ sin(nπβ)/n), rounded off by
// the finger's flesh as it lets go (a low-pass: a harder pluck lets go quicker, and is brighter), each
// partial dying away at its own rate (Valette 1995, "The mechanics of vibrating strings", in "Mechanics of
// Musical Instruments": air's drag, the string's inner friction, largest in gut and nylon and rising with
// frequency, and what the soundboard takes). So each string is a bank of two-pole resonators, one a partial,
// started by the pluck and left alone: nothing is filtered in a loop, the decays are each partial's own, and
// a pedal moved under a ringing string simply retunes them. The soundboard and the soundbox colour the sum
// (a harp's lowest strings sound mostly through the board's resonances near 200–400 Hz: their fundamentals,
// at 30–100 Hz, are hardly radiated at all: Firth 1977, "On the acoustics of the harp", Acustica 37, 148; Le
// Carrou, Gautier & Badeau 2009, "Sympathetic string modes in the concert harp", Acta Acustica 95, 744), a few
// of the board's own modes are knocked by each pluck, and the other strings' partials that lie on the plucked
// string's take a little of its motion (sympathetic vibration: Le Carrou et al. 2009).
//
// The voicing (HARP_VOICE) is fitted to the VSCO 2 Community Edition's harp (CC0; scripts/harp-refs.ts): the
// partials' levels and decays, how long each string rings, its brightness at the pluck and later, on every
// second recorded string; the others are held out for the judge (scripts/judge.ts --instrument harp).

import { Pump } from './pump.ts';
import type { KeySummary } from '../api/messages.ts';
import type { ExciteTrace, InstrumentCore } from './instrument.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { biquadHighpass, biquadHighShelf, biquadPeaking } from './filters.ts';
import type { PianoEvent } from './piano-core.ts';
import { clamp, playerCents } from './util.ts';

export interface HarpParams {
  /** where along the string the finger takes it, from the soundboard (0.08: by the board, près de la table,
   *  thin and guitar-like … 0.5: the middle, round and hollow); the fitted place when not given */
  pluck: number;
  /** the finger: × the brightness of its release (0.5: the soft pad of the finger … 2: the nail) */
  finger: number;
  /** what a key let go does: 0 nothing (laissez vibrer: the string rings on) … 1 the hand stops it (étouffé) */
  damp: number;
  /** how much the other strings answer (× the fitted sympathetic coupling) */
  resonance: number;
  /** the pedals, each −1 (up: flat), 0 (middle: natural) or 1 (down: sharp); a note that needs another moves it */
  pedalD: number;
  pedalC: number;
  pedalB: number;
  pedalE: number;
  pedalF: number;
  pedalG: number;
  pedalA: number;
  room: number;
  volume: number;
  /** orchestra mode: where it sits on the stage (post.ts Seat); none, the single instrument's place */
  seat?: Seat | null;
  /** fitting only (scripts/fit-harp.ts): the voicing below, overridden */
  voice?: Partial<HarpVoice>;
}

/** the strings: 47, C1 (0) to G7 (46) */
export const HARP_STRINGS = 47;
/** the compass as its strings sound with every pedal in the middle: C1–G7 (flat or sharp, C♭1–G♯7) */
export const HARP_LO = 24;
export const HARP_HI = 103;
/** the pedals in their order at the harpist's feet, left to right: the left foot's D, C, B, the right foot's
 *  E, F, G, A */
export const HARP_PEDALS = ['D', 'C', 'B', 'E', 'F', 'G', 'A'] as const;
export type HarpPedal = (typeof HARP_PEDALS)[number];
/** a string's letter (C = 0 … B = 6) → its pedal's place in HARP_PEDALS */
const PEDAL_OF = [1, 0, 3, 4, 5, 6, 2];
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** the naturals' semitones above C */
const NAT = [0, 2, 4, 5, 7, 9, 11];
const PARAM_OF: (keyof HarpParams)[] = ['pedalD', 'pedalC', 'pedalB', 'pedalE', 'pedalF', 'pedalG', 'pedalA'];

const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** The strings' vibrating lengths (m), C1 … G7: the scale of a concert grand harp (after the string charts
 *  of the Lyon & Healy and Salvi concert grands: 1.54 m at the bottom, 6.6 cm at the top; the treble nearly
 *  halves with each octave, the bass is foreshortened and made up for with heavier, wound strings) */
const LENGTHS = [
  1.544, 1.524, 1.501, 1.476, 1.448, 1.417, 1.384, // C1 … B1
  1.349, 1.311, 1.27, 1.229, 1.184, 1.135, 1.087, // C2 … B2
  1.036, 0.981, 0.925, 0.869, 0.813, 0.757, 0.704, // C3 … B3
  0.653, 0.605, 0.559, 0.516, 0.475, 0.437, 0.401, // C4 … B4
  0.366, 0.335, 0.305, 0.279, 0.255, 0.231, 0.211, // C5 … B5
  0.192, 0.173, 0.157, 0.144, 0.131, 0.119, 0.109, // C6 … B6
  0.099, 0.09, 0.082, 0.074, 0.066, // C7 … G7
];

export interface HarpString {
  /** 0 (C1) … 46 (G7) */
  index: number;
  /** 'C' … 'B', and the octave of its natural (C1: 1) */
  letter: string;
  octave: number;
  /** its natural's MIDI note (the pedal in the middle) */
  midi: number;
  /** its vibrating length open (the pedal up), m */
  length: number;
  /** wire wound on a core (the lowest twelve), gut (the middle), nylon (the top nine) */
  material: 'wire' | 'gut' | 'nylon';
  /** every C is red, every F black; the rest are the string's own colour */
  colour: 'red' | 'black' | 'plain';
}

/** the harp's 47 strings, low to high */
export function harpStrings(): HarpString[] {
  return Array.from({ length: HARP_STRINGS }, (_, i) => {
    const li = i % 7;
    const octave = 1 + Math.floor(i / 7);
    return { index: i, letter: LETTERS[li], octave, midi: 12 * (octave + 1) + NAT[li], length: LENGTHS[i], material: i < 12 ? 'wire' : i < 38 ? 'gut' : 'nylon', colour: li === 0 ? 'red' : li === 3 ? 'black' : 'plain' };
  });
}
const STRINGS = harpStrings();

/** the string whose natural is the MIDI note m (a white key), or −1 */
export function harpStringOf(m: number): number {
  const li = NAT.indexOf(((m % 12) + 12) % 12);
  if (li < 0) return -1;
  const i = (Math.floor(m / 12) - 2) * 7 + li;
  return i >= 0 && i < HARP_STRINGS ? i : -1;
}

/** Can the pedals `acc` (by letter, C … B: −1, 0, 1) play the MIDI note m? The string that does, or −1 (two
 *  may: B♯ and C; the one nearer its natural, then the lower string). */
export function harpStringFor(m: number, acc: ArrayLike<number>): number {
  let best = -1;
  for (let li = 0; li < 7; li++) {
    const i = harpStringOf(m - acc[li]);
    if (i < 0 || i % 7 !== li) continue;
    if (best < 0 || Math.abs(acc[li]) < Math.abs(acc[best % 7])) best = i;
  }
  return best;
}

/** The pedals a set of pitch classes asks for: each of the seven letters at the accidental (−1, 0, 1) that
 *  spells one of them, the natural first (a scale or a chord's glissando setting: C major's pitch classes
 *  give all naturals; C, E♭, G♭, A give D♯ C♮ B♯ | E♭ F♯ G♭ A♮, every string on a note of the chord). Letters
 *  none of them can spell stay natural. In HARP_PEDALS' order: D C B E F G A. */
export function harpPedalsFor(pitchClasses: readonly number[]): number[] {
  const want = new Set(pitchClasses.map((p) => ((p % 12) + 12) % 12));
  const out = new Array<number>(7).fill(0);
  for (let li = 0; li < 7; li++) for (const a of [0, -1, 1]) if (want.has((NAT[li] + a + 12) % 12)) {
    out[PEDAL_OF[li]] = a;
    break;
  }
  return out;
}

/** The voicing: the pluck, the strings' losses, the soundboard's colour. Fitted to the VSCO 2 CE harp
 *  (scripts/fit-harp.ts) on every second recorded string, judged on the others (scripts/judge.ts);
 *  artifacts/round3/harp/NOTES.md. "Middle C" below is the C4 string; a value "per octave" is a factor. */
export interface HarpVoice {
  /** where the finger takes the string, from the soundboard (a fraction of its length), at C1 and at G7 */
  beta: number;
  betaTop: number;
  /** the pluck's force on the board falls as n^−slope up the partials (1: the ideal pluck of a point) */
  slope: number;
  /** the finger letting go: a low-pass on the pluck, its corner (Hz) at middle C, × cornerOct per octave up,
   *  its order; and how the corner follows the dynamic (× (0.45 + v)^cornerVel, v the velocity/127) */
  corner: number;
  cornerOct: number;
  order: number;
  cornerVel: number;
  /** a partial's decay (dB/s): d0 + d1·(f/1 kHz)^dPow, d0 and d1 at middle C and × per octave up, for the gut
   *  and nylon strings … */
  d0: number;
  d0Oct: number;
  d1: number;
  d1Oct: number;
  dPow: number;
  /** … and for the wire strings of the bass (d0 at C2, × per octave) */
  w0: number;
  w0Oct: number;
  w1: number;
  wPow: number;
  /** the wire strings' pluck: × the corner, and their level against the gut (dB) */
  wCorner: number;
  wGain: number;
  /** the stiffness B (fₙ = n·f₀·√(1 + B·n²)) at and below C5, and × per octave above it; the wire strings' */
  stiff: number;
  stiffOct: number;
  stiffWire: number;
  /** the level across the compass, dB an octave (the treble's short strings move the board less) */
  tilt: number;
  /** the soundboard and the soundbox: a high-pass (Hz: the board radiates little below it), two resonances
   *  (Hz, dB, Q) and a shelf above shelfF (dB) */
  hp: number;
  f1: number;
  g1: number;
  q1: number;
  f2: number;
  g2: number;
  q2: number;
  shelfF: number;
  shelfG: number;
  /** each pluck knocks the board: its own modes (Hz, four of them from knockF up, a fourth apart), how hard
   *  (re the pluck), how long they ring (s, a time constant) */
  knock: number;
  knockF: number;
  knockTau: number;
  /** the other strings answering: the share of a partial's motion a string's partial on the same pitch takes */
  symp: number;
  /** the velocity's curve: the pluck's force ∝ (velocity/127)^velPow */
  velPow: number;
  /** the level (dB) */
  gainDb: number;
}

/** the voicing (provisional: set by hand from the recordings' measures; scripts/fit-harp.ts refines it) */
export const HARP_VOICE: HarpVoice = {
  beta: 0.4895,
  betaTop: 0.4423,
  slope: 0.8396,
  corner: 3087,
  cornerOct: 1.644,
  order: 1.367,
  cornerVel: 0.9,
  d0: 9.934,
  d0Oct: 1.4,
  d1: 12.82,
  d1Oct: 0.9661,
  dPow: 1.666,
  w0: 2.663,
  w0Oct: 1.213,
  w1: 9.23,
  wPow: 2.267,
  wCorner: 0.5347,
  wGain: -11.92,
  stiff: 0.0001572,
  stiffOct: 2.381,
  stiffWire: 8.861e-05,
  tilt: -0.477,
  hp: 108.4,
  f1: 177.4,
  g1: -5.254,
  q1: 0.423,
  f2: 291.5,
  g2: 6.001,
  q2: 0.4,
  shelfF: 6743,
  shelfG: 8.6,
  knock: 0.01723,
  knockF: 173.7,
  knockTau: 0.03032,
  symp: 0.008358,
  velPow: 2,
  gainDb: -40.64,
};

/** the most partials a string is given: the wire strings of the bass (a C1's 64th is at 2.1 kHz), the rest */
const MAXP_WIRE = 64;
const MAXP = 40;
/** no partial above this (Hz), or above 0.45 of the sample rate */
const F_TOP = 14000;
/** a partial is dropped when it has fallen to this (re a full pluck's fundamental ≈ 1) */
const QUIET = 1e-7;
/** a pedal's travel from notch to notch, and the string's retuning under its disc (s, time constants) */
const PEDAL_TAU = 0.035;
const RETUNE_TAU = 0.012;
/** a disc closing on a ringing string takes this much of its motion */
const DISC_LOSS = 0.8;
/** the hand stopping a string: dB/s at damp 1 */
const STOP_RATE = 500;
/** the finger on a string already ringing, before it plucks it again: what it leaves of the old motion */
const REPLUCK_KEEP = 0.12;
/** notes known to be coming are kept this long and this many (a file playing: `foresee`) */
const AHEAD = 4;
const NAHEAD = 24;
/** the board's modes knocked by a pluck, their frequencies over knockF (a fourth, an octave, an eleventh up) */
const KNOCK_RATIOS = [1, 1.335, 2, 2.67];
const TRACE = 2048;
/** the strings whose shapes the pictures are given (the loudest) */
const NSHAPE = 8;
const SHAPE_POINTS = 32;

export class HarpCore implements InstrumentCore {
  readonly id = 'harp' as const;
  readonly fs: number;
  params: HarpParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = HARP_STRINGS;
  sympatheticAllowed = true;
  dry: boolean;
  private V: HarpVoice;
  private queue: { frame: number; ev: PianoEvent | { type: 'control'; cc: number; value: number } }[] = [];
  /** the pedals as they are set, by letter (C … B: −1, 0, 1), and where each pedal is on its way there */
  private acc = new Int8Array(7);
  private pedalAt = new Float64Array(7);
  /** every string's partials, MAXP_WIRE to a string: the resonators' two states and two coefficients */
  private y1 = new Float64Array(HARP_STRINGS * MAXP_WIRE);
  private y2 = new Float64Array(HARP_STRINGS * MAXP_WIRE);
  private c1 = new Float64Array(HARP_STRINGS * MAXP_WIRE);
  private c2 = new Float64Array(HARP_STRINGS * MAXP_WIRE);
  /** per string: its partials in use (those under F_TOP), those still ringing, its pitch now and where it is
   *  going (semitones: MIDI), its level and that level's peak since the pluck, its pan */
  private np = new Int32Array(HARP_STRINGS);
  private live = new Int32Array(HARP_STRINGS);
  private pitch = new Float64Array(HARP_STRINGS);
  private pitchTo = new Float64Array(HARP_STRINGS);
  private level = new Float64Array(HARP_STRINGS);
  private peak = new Float64Array(HARP_STRINGS);
  private gL = new Float64Array(HARP_STRINGS);
  private gR = new Float64Array(HARP_STRINGS);
  /** when it was last plucked (frame; −1: never), how hard, and whether a key holds it; the hand stopping it */
  private pluckedAt = new Float64Array(HARP_STRINGS).fill(-1);
  private vel = new Float64Array(HARP_STRINGS);
  private held = new Uint8Array(HARP_STRINGS);
  /** the hand on it: this much more decay (dB/s; 0: none) */
  private stopRate = new Float64Array(HARP_STRINGS);
  /** which string each key (MIDI note) plucked (−1: none): its note-off finds it though a pedal has moved */
  private keyString = new Int8Array(128).fill(-1);
  /** the board's modes knocked by the plucks */
  private k1 = new Float64Array(KNOCK_RATIOS.length);
  private k2 = new Float64Array(KNOCK_RATIOS.length);
  private kc1 = new Float64Array(KNOCK_RATIOS.length);
  private kc2 = new Float64Array(KNOCK_RATIOS.length);
  /** notes known to be coming: frames and MIDI notes, in order */
  private aheadAt = new Float64Array(NAHEAD);
  private aheadM = new Int16Array(NAHEAD);
  private aheadN = 0;
  private last = 21;
  private tune = 0;
  private bend = 0;
  private eq = new BiquadChain();
  private room: Room;
  private limiter: Limiter;
  private pump = new Pump(64);
  private oL = new Float64Array(64);
  private oR = new Float64Array(64);
  private buf = new Float64Array(64);
  private gain = 1;
  /** the last plucked string's pull on the board, since its pluck */
  private tr = new Float32Array(TRACE);
  private trN = 0;
  private modeFreqs = new Float64Array(16);
  private scratch = new Int8Array(7);
  /** the pictures' scratch: a string's partials a quarter cycle on */
  private q = new Float64Array(24);

  constructor(opts: { sampleRate: number; params?: Partial<HarpParams>; dry?: boolean; player?: number }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.V = { ...HARP_VOICE, ...opts.params?.voice };
    this.params = { pluck: this.V.beta, finger: 1, damp: 0, resonance: 1, pedalD: 0, pedalC: 0, pedalB: 0, pedalE: 0, pedalF: 0, pedalG: 0, pedalA: 0, room: 0.3, volume: 1, ...opts.params };
    this.tune = playerCents(opts.player) / 100;
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    for (let li = 0; li < 7; li++) this.acc[li] = this.pedalParam(li);
    for (let li = 0; li < 7; li++) this.pedalAt[li] = this.acc[li];
    for (let i = 0; i < HARP_STRINGS; i++) {
      this.pitch[i] = this.pitchTo[i] = STRINGS[i].midi + this.acc[i % 7];
      // (the bass strings stand farthest from the player's right ear: a little of the instrument's width)
      const pan = 0.14 * (i / (HARP_STRINGS - 1) - 0.5);
      this.gL[i] = 1 - pan;
      this.gR[i] = 0.94 * (1 + pan);
    }
    this.voiced();
    this.freqsOf(this.last);
  }

  /** a pedal as the parameters set it (−1, 0, 1), by its string letter */
  private pedalParam(li: number): number {
    return clamp(Math.round(Number(this.params[PARAM_OF[PEDAL_OF[li]]]) || 0), -1, 1);
  }

  /** everything the voicing fixes: the board's colour, its modes, the level */
  private voiced(): void {
    const fs = this.fs;
    const V = this.V;
    this.eq.set([biquadHighpass(V.hp, 0.7, fs), biquadPeaking(V.f1, V.q1, V.g1, fs), biquadPeaking(V.f2, V.q2, V.g2, fs), biquadHighShelf(Math.min(0.4 * fs, V.shelfF), V.shelfG, fs)]);
    this.room.configure(this.params.room, this.params.seat);
    for (let k = 0; k < KNOCK_RATIOS.length; k++) {
      const w = (2 * Math.PI * Math.min(0.4 * fs, V.knockF * KNOCK_RATIOS[k])) / fs;
      const r = Math.exp(-1 / (Math.max(0.003, V.knockTau) * fs));
      this.kc1[k] = 2 * r * Math.cos(w);
      this.kc2[k] = r * r;
    }
    this.gain = Math.pow(10, V.gainDb / 20) * this.params.volume;
  }

  /** a string's stiffness B */
  private stiffOf(i: number): number {
    const V = this.V;
    if (i < 12) return V.stiffWire;
    return V.stiff * Math.pow(V.stiffOct, Math.max(0, STRINGS[i].midi - 72) / 12);
  }

  /** A string's resonators for its pitch now: each partial's frequency and decay (and, with `count`, how many
   *  it has under the top). Nothing is allocated. */
  private coeffs(i: number, count = false): void {
    const fs = this.fs;
    const V = this.V;
    const f0 = et(this.pitch[i] + this.tune + this.bend);
    const B = this.stiffOf(i);
    const wire = i < 12;
    const oct = (STRINGS[i].midi - 60) / 12;
    const d0 = wire ? V.w0 * Math.pow(V.w0Oct, (STRINGS[i].midi - 36) / 12) : V.d0 * Math.pow(V.d0Oct, oct);
    const d1 = wire ? V.w1 : V.d1 * Math.pow(V.d1Oct, oct);
    const pw = wire ? V.wPow : V.dPow;
    const stop = this.stopRate[i];
    const top = Math.min(0.45 * fs, F_TOP);
    const max = wire ? MAXP_WIRE : MAXP;
    const o = i * MAXP_WIRE;
    let n = count ? max : this.np[i];
    for (let k = 0; k < n; k++) {
      const h = k + 1;
      const f = h * f0 * Math.sqrt(1 + B * h * h);
      if (f > top) {
        if (count) n = k;
        else {
          // (a partial carried over the top by a pedal or a bend: let it die)
          this.c1[o + k] = 0;
          this.c2[o + k] = 0;
          continue;
        }
        break;
      }
      const rate = d0 + d1 * Math.pow(f / 1000, pw) + stop;
      const r = Math.pow(10, -rate / (20 * fs));
      this.c1[o + k] = 2 * r * Math.cos((2 * Math.PI * f) / fs);
      this.c2[o + k] = r * r;
    }
    if (count) this.np[i] = n;
  }

  private freqsOf(i: number): void {
    const f0 = et(this.pitch[i] + this.tune + this.bend);
    const B = this.stiffOf(i);
    for (let k = 0; k < 16; k++) this.modeFreqs[k] = (k + 1) * f0 * Math.sqrt(1 + B * (k + 1) * (k + 1));
  }

  schedule(ev: unknown, frame?: number): void {
    const f = frame === undefined ? this.frame : Math.max(this.frame, Math.floor(frame));
    const fe = ev as { type?: string; midi: number };
    // a note to come is not an event: it is known at once (the pedals are chosen with it)
    if (fe.type === 'foresee') return this.foresee(f, fe.midi);
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].frame > f) i--;
    q.splice(i, 0, { frame: f, ev: ev as PianoEvent });
  }

  /** a note known to be coming (kept in order; the earliest dropped when there is no room) */
  private foresee(at: number, midi: number): void {
    let n = this.aheadN;
    if (n === NAHEAD) {
      for (let k = 1; k < n; k++) {
        this.aheadAt[k - 1] = this.aheadAt[k];
        this.aheadM[k - 1] = this.aheadM[k];
      }
      n--;
    }
    let k = n;
    while (k > 0 && this.aheadAt[k - 1] > at) {
      this.aheadAt[k] = this.aheadAt[k - 1];
      this.aheadM[k] = this.aheadM[k - 1];
      k--;
    }
    this.aheadAt[k] = at;
    this.aheadM[k] = midi;
    this.aheadN = n + 1;
  }

  /** what was foreseen is forgotten (the file paused or stopped) */
  forget(): void {
    this.aheadN = 0;
  }

  /** is a string ringing loud enough for a retuning to be heard? */
  private rings(i: number): boolean {
    return this.live[i] > 0 && this.level[i] > 0.02 * Math.max(this.peak[i], 1e-9) && this.level[i] > 1e-4;
  }

  /** Move a pedal (by its letter, C … B) to an accidental: every string of that name is retuned, and a
   *  ringing one loses a little under the disc. */
  private setPedal(li: number, a: number): void {
    if (this.acc[li] === a) return;
    this.acc[li] = a;
    (this.params as unknown as Record<string, number>)[PARAM_OF[PEDAL_OF[li]]] = a;
    for (let i = li; i < HARP_STRINGS; i += 7) {
      this.pitchTo[i] = STRINGS[i].midi + a;
      if (this.live[i] > 0) {
        const o = i * MAXP_WIRE;
        for (let k = 0; k < this.live[i]; k++) {
          this.y1[o + k] *= DISC_LOSS;
          this.y2[o + k] *= DISC_LOSS;
        }
      } else this.pitch[i] = this.pitchTo[i];
    }
  }

  /** The string for a note asked for by its pitch: one already there, else the pedal that reaches it is
   *  moved (the one that retunes no ringing string, keeps the notes known to be coming playable, and travels
   *  least). −1: out of the compass. */
  private stringFor(m: number): number {
    const now = harpStringFor(m, this.acc);
    if (now >= 0) return now;
    let best = -1;
    let bestA = 0;
    let bestCost = Infinity;
    const sc = this.scratch;
    for (let li = 0; li < 7; li++)
      for (let a = -1; a <= 1; a++) {
        if (a === this.acc[li]) continue;
        const i = harpStringOf(m - a);
        if (i < 0 || i % 7 !== li) continue;
        let cost = 0.3 * Math.abs(a - this.acc[li]) + 0.1 * Math.abs(a);
        for (let s = li; s < HARP_STRINGS; s += 7) if (this.rings(s)) cost += 3;
        // the notes to come: one this move would take away costs, one it gives is worth a little
        for (let l2 = 0; l2 < 7; l2++) sc[l2] = this.acc[l2];
        sc[li] = a;
        const until = this.frame + AHEAD * this.fs;
        for (let k = 0; k < this.aheadN; k++) {
          if (this.aheadAt[k] <= this.frame) continue;
          if (this.aheadAt[k] > until) break;
          const was = harpStringFor(this.aheadM[k], this.acc) >= 0;
          const will = harpStringFor(this.aheadM[k], sc) >= 0;
          // (sooner notes weigh more)
          const w = 1 - 0.5 * ((this.aheadAt[k] - this.frame) / (AHEAD * this.fs));
          if (was && !will) cost += 2 * w;
          else if (!was && will) cost -= 0.5 * w;
        }
        if (cost < bestCost) {
          bestCost = cost;
          best = i;
          bestA = a;
        }
      }
    if (best >= 0) this.setPedal(best % 7, bestA);
    return best;
  }

  /** Pluck a string: its partials are set going (on top of a little of what it was doing: the finger on it). */
  private pluck(i: number, velocity: number): void {
    const V = this.V;
    const P = this.params;
    const fs = this.fs;
    // (a string plucked on its way to another pitch is plucked there: the disc has closed)
    this.pitch[i] = this.pitchTo[i];
    this.stopRate[i] = 0;
    this.coeffs(i, true);
    const v = clamp(velocity, 1, 127) / 127;
    const u = i / (HARP_STRINGS - 1);
    const beta = clamp(P.pluck + (V.betaTop - V.beta) * u, 0.04, 0.5);
    const wire = i < 12;
    const oct = (STRINGS[i].midi - 60) / 12;
    const fc = V.corner * Math.pow(V.cornerOct, oct) * Math.pow(0.45 + v, V.cornerVel) * clamp(P.finger, 0.1, 10) * (wire ? V.wCorner : 1);
    const A = Math.pow(v, V.velPow) * Math.pow(10, (V.tilt * oct + (wire ? V.wGain : 0)) / 20);
    const f0 = et(this.pitch[i] + this.tune + this.bend);
    const B = this.stiffOf(i);
    const o = i * MAXP_WIRE;
    const n = this.np[i];
    const was = this.live[i];
    let last = 0;
    for (let k = 0; k < n; k++) {
      const h = k + 1;
      const f = h * f0 * Math.sqrt(1 + B * h * h);
      const a = (A * Math.sin(h * Math.PI * beta)) / Math.pow(h, V.slope) / Math.sqrt(1 + Math.pow(f / fc, 2 * V.order));
      const w = (2 * Math.PI * f) / fs;
      const r = Math.sqrt(this.c2[o + k]) || 1;
      // (the board answers the string's pull with its velocity: each partial of what is heard starts from
      // nothing, a sine from now, while the string itself starts at its crest: getVisual's shapes)
      const keep = k < was ? REPLUCK_KEEP : 0;
      this.y1[o + k] = keep * this.y1[o + k] - (a * Math.sin(w)) / r;
      this.y2[o + k] = keep * this.y2[o + k] - (a * Math.sin(2 * w)) / (r * r);
      if (Math.abs(a) > QUIET) last = k + 1;
    }
    for (let k = n; k < was; k++) this.y1[o + k] = this.y2[o + k] = 0;
    this.live[i] = Math.max(last, 1);
    this.peak[i] = 0;
    this.level[i] = Math.abs(A);
    this.pluckedAt[i] = this.frame;
    this.vel[i] = velocity;
    this.last = i;
    this.trN = 0;
    this.freqsOf(i);
    // the board knocked: more by a long heavy string than by a short light one
    const kn = V.knock * A * Math.pow(10, (-V.tilt * oct) / 40);
    for (let k = 0; k < KNOCK_RATIOS.length; k++) this.k1[k] += kn / (k + 1);
    this.answer(i, f0, B, A);
  }

  /** The other strings answer a pluck: a partial of theirs within a few cents of one of the plucked string's
   *  first twelve takes a share of it (their first eight; Le Carrou et al. 2009: the octaves, twelfths and
   *  double octaves below and above carry most of it). */
  private answer(i: number, f0: number, B: number, A: number): void {
    const eps = this.V.symp * clamp(this.params.resonance, 0, 4);
    if (!(eps > 0) || !this.sympatheticAllowed) return;
    const V = this.V;
    const fs = this.fs;
    const top = Math.min(0.45 * fs, F_TOP);
    for (let s = 0; s < HARP_STRINGS; s++) {
      if (s === i) continue;
      const g0 = et(this.pitch[s] + this.tune + this.bend);
      const Bs = this.stiffOf(s);
      let fresh = this.live[s] === 0;
      const os = s * MAXP_WIRE;
      for (let k = 0; k < 8; k++) {
        const fk = (k + 1) * g0 * Math.sqrt(1 + Bs * (k + 1) * (k + 1));
        if (fk > top) break;
        // the plucked string's partial nearest it
        const h = Math.round(fk / f0);
        if (h < 1 || h > 12) continue;
        const fh = h * f0 * Math.sqrt(1 + B * h * h);
        const off = Math.abs(1200 * Math.log2(fk / fh));
        if (off > 12) continue;
        if (fresh) {
          // (a string at rest set going: its resonators made for its pitch, the rest of them silent)
          this.coeffs(s, true);
          for (let q = 0; q < this.np[s]; q++) this.y1[os + q] = this.y2[os + q] = 0;
          this.peak[s] = 0;
          fresh = false;
        }
        if (k >= this.np[s]) break;
        const a = (eps * A * (1 - off / 12)) / Math.pow(h, V.slope);
        const w = (2 * Math.PI * fk) / fs;
        // (it starts from rest, as the plucked string's partial does)
        this.y1[os + k] -= a * Math.sin(w);
        this.y2[os + k] -= a * Math.sin(2 * w);
        if (k + 1 > this.live[s]) this.live[s] = k + 1;
      }
    }
  }

  private apply(ev: PianoEvent | { type: 'control'; cc: number; value: number }): void {
    switch (ev.type) {
      case 'noteOn': {
        if (ev.velocity <= 0) return this.release(ev.midi);
        const m = Math.round(ev.midi);
        const gliss = (ev as { gliss?: boolean }).gliss === true;
        // a glissando's notes are strings (a white key's, at the pitch its pedal gives; a black key is no
        // string); any other note is a pitch, and finds its string
        // (a pitch outside the compass is played in its nearest octave inside it)
        let pm = m;
        while (pm < HARP_LO) pm += 12;
        while (pm > HARP_HI) pm -= 12;
        const i = gliss ? harpStringOf(m) : this.stringFor(pm);
        if (i < 0) return;
        this.pluck(i, ev.velocity);
        if (m >= 0 && m < 128) this.keyString[m] = i;
        this.held[i] = 1;
        break;
      }
      case 'noteOff':
        this.release(ev.midi);
        break;
      case 'sustain':
        // (a pedal held lets everything ring whatever `damp` says; let go, the strings no key holds are stopped)
        this.sustain = clamp(ev.value, 0, 1);
        if (this.sustain < 0.5 && this.params.damp > 0) for (let i = 0; i < HARP_STRINGS; i++) if (!this.held[i] && this.live[i] > 0) this.stop(i);
        break;
      case 'bend':
        this.bend = clamp(ev.value, -12, 12);
        for (let i = 0; i < HARP_STRINGS; i++) if (this.live[i] > 0) this.coeffs(i);
        break;
      case 'allNotesOff':
        for (let i = 0; i < HARP_STRINGS; i++) {
          this.held[i] = 0;
          if (this.live[i] > 0) this.stop(i, 1);
        }
        this.keyString.fill(-1);
        break;
      default:
        break;
    }
  }

  /** a key let go: its string rings on, or (damp) the hand stops it */
  private release(midi: number): void {
    const m = Math.round(midi);
    if (m < 0 || m > 127) return;
    const i = this.keyString[m];
    if (i < 0) return;
    this.keyString[m] = -1;
    this.held[i] = 0;
    if (this.params.damp > 0 && this.sustain < 0.5 && this.live[i] > 0) this.stop(i);
  }

  /** the hand on a string (`damp` 0 … 1: how firmly) */
  private stop(i: number, damp = this.params.damp): void {
    if (!(damp > 0)) return;
    this.stopRate[i] = STOP_RATE * damp * damp;
    this.coeffs(i);
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<HarpParams>) };
    if (this.params.voice !== old.voice) {
      this.V = { ...HARP_VOICE, ...this.params.voice };
      this.voiced();
      for (let i = 0; i < HARP_STRINGS; i++) if (this.live[i] > 0) this.coeffs(i);
    } else if (this.params.room !== old.room || this.params.volume !== old.volume) this.voiced();
    else if (this.params.seat !== old.seat) this.room.configure(this.params.room, this.params.seat);
    // the pedals set by hand
    for (let li = 0; li < 7; li++) {
      const k = PARAM_OF[PEDAL_OF[li]];
      if (p[k] !== undefined) this.setPedal(li, this.pedalParam(li));
    }
  }

  /** the strings ringing (their pitches as the pedals have them), loudest first */
  sounding(): number[] {
    const out: number[] = [];
    const ls: number[] = [];
    for (let i = 0; i < HARP_STRINGS; i++)
      if (this.pluckedAt[i] >= 0 && this.live[i] > 0 && this.peak[i] > 0 && this.level[i] > 0.05 * this.peak[i] && this.level[i] > 2e-4) {
        out.push(Math.round(this.pitchTo[i]));
        ls.push(this.level[i]);
      }
    if (out.length < 2) return out;
    return out.map((m, k) => [m, ls[k]] as const).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }

  allSoundOff(): void {
    this.y1.fill(0);
    this.y2.fill(0);
    this.live.fill(0);
    this.level.fill(0);
    this.peak.fill(0);
    this.held.fill(0);
    this.stopRate.fill(0);
    this.keyString.fill(-1);
    this.pluckedAt.fill(-1);
    this.k1.fill(0);
    this.k2.fill(0);
    this.aheadN = 0;
    for (let i = 0; i < HARP_STRINGS; i++) this.pitch[i] = this.pitchTo[i];
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  get activeVoiceCount(): number {
    let n = 0;
    for (let i = 0; i < HARP_STRINGS; i++) if (this.live[i] > 0 && this.pluckedAt[i] >= 0) n++;
    return n;
  }
  /** strings ringing that no finger plucked: the ones answering */
  get activeSympatheticCount(): number {
    let n = 0;
    for (let i = 0; i < HARP_STRINGS; i++) if (this.live[i] > 0 && this.pluckedAt[i] < 0) n++;
    return n;
  }
  get modeFrequencies(): Float64Array {
    return this.modeFreqs;
  }

  /** Render `frames` samples into outL/outR. Internal blocks (≤ 64, cut at events) do not depend on `frames`
   *  (see Pump). */
  process(outL: Float32Array | Float64Array, outR: Float32Array | Float64Array, frames: number): void {
    this.pump.pull(outL, outR, frames, (L, R) => {
      const q = this.queue;
      while (q.length && q[0].frame <= this.frame) this.apply(q.shift()!.ev);
      let n = 64;
      if (q.length) n = Math.max(1, Math.min(n, q[0].frame - this.frame));
      this.render(n);
      for (let t = 0; t < n; t++) {
        L[t] = this.oL[t];
        R[t] = this.oR[t];
      }
      return n;
    });
  }

  /** the frame now leaving process() */
  get outputFrame(): number {
    return this.frame - this.pump.pending;
  }

  private render(n: number): void {
    const dt = n / this.fs;
    const oL = this.oL;
    const oR = this.oR;
    const buf = this.buf;
    for (let t = 0; t < n; t++) oL[t] = oR[t] = 0;
    // the notes foreseen that have come
    while (this.aheadN > 0 && this.aheadAt[0] <= this.frame) {
      for (let k = 1; k < this.aheadN; k++) {
        this.aheadAt[k - 1] = this.aheadAt[k];
        this.aheadM[k - 1] = this.aheadM[k];
      }
      this.aheadN--;
    }
    // the pedals on their way (for the pictures), the strings under their discs
    const kp = 1 - Math.exp(-dt / PEDAL_TAU);
    for (let li = 0; li < 7; li++) {
      this.pedalAt[li] += (this.acc[li] - this.pedalAt[li]) * kp;
      if (Math.abs(this.acc[li] - this.pedalAt[li]) < 1e-4) this.pedalAt[li] = this.acc[li];
    }
    const kr = 1 - Math.exp(-dt / RETUNE_TAU);
    const y1 = this.y1;
    const y2 = this.y2;
    const c1 = this.c1;
    const c2 = this.c2;
    for (let i = 0; i < HARP_STRINGS; i++) {
      let lv = this.live[i];
      if (lv === 0) continue;
      if (this.pitch[i] !== this.pitchTo[i]) {
        this.pitch[i] += (this.pitchTo[i] - this.pitch[i]) * kr;
        if (Math.abs(this.pitchTo[i] - this.pitch[i]) < 1e-3) this.pitch[i] = this.pitchTo[i];
        this.coeffs(i);
        if (i === this.last) this.freqsOf(i);
      }
      const o = i * MAXP_WIRE;
      for (let t = 0; t < n; t++) buf[t] = 0;
      for (let k = 0; k < lv; k++) {
        const a1 = c1[o + k];
        const a2 = c2[o + k];
        let u1 = y1[o + k];
        let u2 = y2[o + k];
        for (let t = 0; t < n; t++) {
          const u = a1 * u1 - a2 * u2;
          u2 = u1;
          u1 = u;
          buf[t] += u;
        }
        y1[o + k] = u1;
        y2[o + k] = u2;
      }
      let pk = 0;
      const gl = this.gL[i];
      const gr = this.gR[i];
      for (let t = 0; t < n; t++) {
        const s = buf[t];
        oL[t] += gl * s;
        oR[t] += gr * s;
        const a = s < 0 ? -s : s;
        if (a > pk) pk = a;
      }
      if (i === this.last && this.trN < TRACE) for (let t = 0; t < n && this.trN < TRACE; t++) this.tr[this.trN++] = buf[t];
      this.level[i] = Math.max(pk, this.level[i] * Math.exp(-dt / 0.05));
      if (this.level[i] > this.peak[i]) this.peak[i] = this.level[i];
      // the partials that have died away are dropped, from the top
      while (lv > 0 && Math.abs(y1[o + lv - 1]) + Math.abs(y2[o + lv - 1]) < QUIET) {
        y1[o + lv - 1] = y2[o + lv - 1] = 0;
        lv--;
      }
      this.live[i] = lv;
      if (lv === 0) {
        // died away: at rest again (should it answer another string later, no finger plucked it)
        this.level[i] = 0;
        this.stopRate[i] = 0;
        this.pitch[i] = this.pitchTo[i];
        this.pluckedAt[i] = -1;
      }
    }
    // the board's own modes
    for (let k = 0; k < KNOCK_RATIOS.length; k++) {
      let u1 = this.k1[k];
      let u2 = this.k2[k];
      if (u1 === 0 && u2 === 0) continue;
      const a1 = this.kc1[k];
      const a2 = this.kc2[k];
      for (let t = 0; t < n; t++) {
        const u = a1 * u1 - a2 * u2;
        u2 = u1;
        u1 = u;
        oL[t] += u;
        oR[t] += 0.94 * u;
      }
      if (Math.abs(u1) + Math.abs(u2) < QUIET) u1 = u2 = 0;
      this.k1[k] = u1;
      this.k2[k] = u2;
    }
    const gn = this.gain;
    for (let t = 0; t < n; t++) {
      oL[t] *= gn;
      oR[t] *= gn;
    }
    this.eq.process(oL, oR, n);
    if (!this.dry) {
      this.room.process(oL, oR, n, 1, this.params.room * 0.7);
      this.limiter.process(oL, oR, n);
    }
    this.frame += n;
  }

  keySummary(): KeySummary[] {
    const out: KeySummary[] = [];
    const nat = new Int8Array(7);
    for (let m = HARP_LO; m <= HARP_HI; m++) {
      // each key's string with the pedals in the middle (a black key: the string below it, its pedal down)
      let i = harpStringFor(m, nat);
      let how = 'natural';
      if (i < 0) {
        i = harpStringOf(m - 1);
        how = 'sharp';
      }
      const s = STRINGS[Math.max(0, i)];
      out.push({ midi: m, f1: et(m), B: this.stiffOf(s.index), nStrings: 1, lengthM: s.length * (how === 'sharp' ? Math.pow(2, -2 / 12) : Math.pow(2, -1 / 12)), hasDamper: false, preparation: `${s.letter}${s.octave} string (${s.material}), ${how}` });
    }
    return out;
  }

  /** the pedals as they are set, in HARP_PEDALS' order (D C B E F G A): −1, 0, 1 */
  get pedals(): number[] {
    return HARP_PEDALS.map((_, k) => this.acc[PEDAL_OF.indexOf(k)]);
  }

  getVisual(points = 160): object {
    const i = this.last;
    const o = i * MAXP_WIRE;
    // A string's shape, the soundboard at 0 and the neck at 1. What is heard of a partial is a sine from the
    // pluck; the string's own motion is that partial a quarter cycle on (a cosine: at its crest as the finger
    // lets go, so the first shape is the plucked triangle), and its displacement its pull on the board over
    // its number.
    const q = this.q;
    const quad = (s: number, nk: number): void => {
      const os = s * MAXP_WIRE;
      for (let k = 0; k < nk; k++) {
        const r = Math.sqrt(Math.max(this.c2[os + k], 1e-12));
        const cw = clamp(this.c1[os + k] / (2 * r), -1, 1);
        const sw = Math.sqrt(Math.max(1e-9, 1 - cw * cw));
        q[k] = (this.y1[os + k] * cw - r * this.y2[os + k]) / sw / (k + 1);
      }
    };
    const shapeOf = (s: number, pts: number): Float32Array => {
      const sh = new Float32Array(pts);
      const nk = Math.min(this.live[s], 24);
      quad(s, nk);
      for (let p = 1; p < pts - 1; p++) {
        const th = (Math.PI * p) / (pts - 1);
        const c2 = 2 * Math.cos(th);
        let s0 = 0;
        let s1 = Math.sin(th);
        let y = 0;
        for (let k = 0; k < nk; k++) {
          y += q[k] * s1;
          const s2 = c2 * s1 - s0;
          s0 = s1;
          s1 = s2;
        }
        sh[p] = y;
      }
      return sh;
    };
    const shape = shapeOf(i, points);
    const modes = new Float32Array(16);
    for (let k = 0; k < Math.min(16, this.live[i]); k++) {
      const c = 0.5 * this.c1[o + k];
      modes[k] = Math.sqrt(Math.max(0, (this.y1[o + k] ** 2 + this.y2[o + k] ** 2 - 2 * c * this.y1[o + k] * this.y2[o + k]) / Math.max(1e-9, 1 - c * c)));
    }
    const len = Math.max(16, Math.min(this.trN, TRACE));
    const s0 = STRINGS[i];
    const excite: ExciteTrace = {
      title: 'String',
      unit: '',
      rate: this.fs,
      trace: this.tr.slice(0, len),
      caption: 'The plucked string’s pull on the soundboard since the finger let it go.',
      meta: `${s0.letter}${s0.octave} string · ${s0.material}`,
    };
    // every string's swing now (0…1 of a hard pluck's), and the loudest few's shapes
    const amp = new Float32Array(HARP_STRINGS);
    const order: number[] = [];
    for (let s = 0; s < HARP_STRINGS; s++) {
      if (this.live[s] === 0) continue;
      const oct = (STRINGS[s].midi - 60) / 12;
      amp[s] = clamp(this.level[s] / (1.4 * Math.pow(10, (this.V.tilt * oct) / 20)), 0, 1);
      order.push(s);
    }
    order.sort((a, b) => amp[b] - amp[a]);
    const shapes = order.slice(0, NSHAPE).map((s) => ({ string: s, shape: shapeOf(s, SHAPE_POINTS) }));
    const u = i / (HARP_STRINGS - 1);
    return {
      frame: this.frame,
      voices: this.activeVoiceCount,
      sympathetic: this.activeSympatheticCount,
      focus: {
        midi: Math.round(this.pitchTo[i]),
        nStrings: 1,
        shapes: [shape],
        hammerAt: clamp(this.params.pluck + (this.V.betaTop - this.V.beta) * u, 0.04, 0.5),
        prepAt: -1,
        lengthM: s0.length,
        f1: et(this.pitch[i]),
        B: this.stiffOf(i),
        damper: 0,
      },
      strike: null,
      excite,
      modes,
      harp: {
        pedals: HARP_PEDALS.map((_, k) => this.pedalAt[PEDAL_OF.indexOf(k)]),
        set: this.pedals,
        amp,
        last: i,
        ago: (this.frame - this.pluckedAt[i]) / this.fs,
        vel: this.vel[i],
        plucked: Array.from(this.pluckedAt, (f) => (f < 0 ? -1 : (this.frame - f) / this.fs)),
        shapes,
      },
      sustain: this.sustain,
      soft: 0,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }
}
