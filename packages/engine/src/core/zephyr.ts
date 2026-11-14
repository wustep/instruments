// The zephyr: an instrument that does not exist yet. Sixty-one ribbons, C2–C7, each bowed by a sheet of air.
//
// What it is. A string in a steady wind sings: the aeolian harp, the hum of a ship's rigging, the ribbon on a
// kite that drones (the Japanese unari, the Indonesian sendaren). Nobody could play it: the wind is not a
// key, and a gut or steel string is so heavy for its width that the air barely takes hold of it (the Paris
// "anémocorde" of J. J. Schnell, 1789, blew a keyboard's strings from bellows and was given up for a tone
// too faint and too slow to speak). The zephyr is that instrument with a string the air can take hold of: a
// ribbon of carbon-nanotube film a few millimetres wide and 12 g to the square metre (a sheet of paper is
// 80), embossed along its length to a shallow D with its flat to the wind, stretched from a bridge on a
// soundboard to a pin on the frame. Each ribbon passes through a slot in a wind rail; its key opens the slot
// and a flat jet from a quiet blower crosses the ribbon broadside. Nothing touches it.
//
// Why it sings. A bluff section moving across a wind sees the wind come at an angle, α = −ẏ/U, and (for a
// square, a D, an iced cable) the lift that angle makes is in the direction of the motion: the faster it
// moves, the harder it is pushed. That is a negative damping (Den Hartog 1932, "Transmission line vibration
// due to sleet", Trans. AIEE 51: the section gallops when dC_L/dα + C_D < 0), and its size and its limit are
// known: the lateral force per length is ½ρU²D·C(ẏ/U) with C(α) = A₁α − A₃α³ … (G. V. Parkinson & J. D. Smith
// 1964, "The square prism as an aeroelastic non-linear oscillator", Q. J. Mech. Appl. Math. 17: A₁ = 2.69 for
// the square). So the jet is a bow with no hair: a force that grows with the ribbon's speed until, near a fifth
// of the wind's speed, the flow lets go and the force falls. The ribbon's speed in the slot is held near
// that limit, as a bowed string's is held to the bow's, and the string does the rest: a standing wave with
// every harmonic the slot's place leaves room for (here 0.38 of the way up: the third is weak, as a string
// bowed at a third has none).
//
// What holds it back is the still air along the rest of the ribbon (Stokes 1851: a cylinder of radius a
// oscillating at ω is damped by 2πρa√(2νω) per length), far more than its own friction: a ribbon this light
// has a Q of fifteen in the bass and sixty-five at the top, and in the bass the air it carries with it weighs
// a quarter as much as it does. That is why no dampers are needed (the wind stops, the note is gone in a few periods), and why
// it must be light: the wind's push and the air's drag both go with the ribbon's width, their ratio does not
// depend on its mass at all, but how fast a note speaks goes as one over it. The same ratio sets the wind:
// the push must be a few times the drag, the drag grows as √f, so the bass is blown at 8 m/s and the top at
// 23 (an organ's flue pipes: 10–40).
//
// The force is not instantaneous: the flow needs the time the wind takes to cross the ribbon (and the slot is
// some centimetres wide along it), so the push follows the ribbon's speed a little late (LAG widths of
// travel: the quasi-steady theory is good while the wind crosses many widths in a period, U/fD ≫ 10, and at
// the top of the compass, where it is 15, the ribbons are narrow and the wind fast for that reason). Late, it
// is partly a mass: the note is a few cents under the string's own pitch, less so the harder it is blown, so
// a note begins a shade flat and comes up as it speaks, and a whisper is a little under a shout. The tuning
// (zephyr-tuning.json, scripts/zephyr-tune.ts) puts every string on its pitch at mezzo-forte.
//
// The model. Each string is a travelling-wave loop in two parts, either side of the slot (the bridge side
// carries the losses, a one-pole filter fitted to the Stokes drag at the fundamental and ten times it; the
// far side is rigid and carries the fine tuning), and at the slot the two meet the wind's force, solved each
// sample: v = v_in + F(v_lagged)/2Z, Z the ribbon's wave impedance. The jet is turbulent: a noise a few per
// cent of its dynamic pressure is in the force, which is what starts a note (nothing else does) and what is
// heard under it as breath. What leaves is the force on the bridge, through a light soundboard.
//
// The wind. A key's depth is its slot's opening: the fall of the key opens it wide for a moment (the note
// speaks), and where the key rests is the wind the note is held at (velocity: from just over the wind that
// keeps the ribbon moving at all, where it is nearly a sine and a quarter as loud, to four or five times it).
// The blower's reservoir sags as slots open and swings back (a chord takes a little from each note), and a
// tremulant can rock it. The sustaining pedal holds the slots of the keys let go.
//
// The player (`human`, 1 by default; 0 is the instrument alone): no key goes down twice alike (its depth, its
// fall, a moment late), a held key's depth wanders, the reservoir is never quite still, and the ribbons are
// each a cent or two from their pitch. A file playing tells the notes to come (`foresee`): a key is begun a
// little ahead of a slow-speaking note, as an organist plays ahead of the pedal pipes, and a note known to
// be short is given more of the key's fall so that it speaks within its length.
//
// Nothing here is fitted to a recording: there is none. Every number is the physics above or a maker's
// choice (the ribbons' widths and lengths, the slot's place and width, how hard the keys blow).

import type { ExciteTrace, InstrumentCore } from './instrument.ts';
import { CC_DYNAMICS, DYN_TAU } from './instrument.ts';
import type { KeySummary } from '../api/messages.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { biquadHighShelf, biquadHighpass, biquadPeaking, designLossFilter, onePolePhaseDelay, thiranForPhaseDelay } from './filters.ts';
import type { PianoEvent } from './piano-core.ts';
import { Pump } from './pump.ts';
import { clamp, Human, mulberry32, playerCents, playerSeed } from './util.ts';
import zephyrTuning from './zephyr-tuning.json';

export interface ZephyrParams {
  /** the blower: 1 as voiced; less, every note nearer the wind that just keeps it going (softer, purer, slower
   *  to speak); more, harder and brighter */
  wind: number;
  /** the tremulant: the reservoir rocked five or six times a second (0 off … 1 deep); the modulation wheel
   *  adds to it */
  tremulant: number;
  /** the ribbons' tilt in their slots: 0 square to the wind (the force the same either way: odd harmonics
   *  only, a hollow tone) … 1 turned 8° (the force is not the same either way: every harmonic) */
  tilt: number;
  /** the player and the instrument's own unevenness: 0 the model alone … 1 a player's */
  human: number;
  room: number;
  volume: number;
  /** orchestra mode: where it stands on the stage (post.ts Seat); none, the single instrument's place */
  seat?: Seat | null;
  /** scripts/zephyr-tune.ts only: the tuning table left out (the strings at their own pitches) */
  untuned?: boolean;
}

/** the ribbons: 61, C2 (0) to C7 (60) */
export const ZEPHYR_STRINGS = 61;
export const ZEPHYR_LO = 36;
export const ZEPHYR_HI = 96;

const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** air at 20 °C: its density (kg/m³) and kinematic viscosity (m²/s) */
const RHO = 1.2;
const NU = 1.5e-5;
/** The ribbon's lateral force curve, C(α) = A₁α − A₃α³: the slope is the square prism's (Parkinson & Smith
 *  1964), the cubic puts the curve's top at α = 0.2 (11°: near where the square's measured curve has it),
 *  past ALPHA_C the curve goes on down in a straight line (the flow has let go: the ribbon is only dragged). */
const A1 = 2.69;
const ALPHA_TOP = 0.2;
const A3 = A1 / (3 * ALPHA_TOP * ALPHA_TOP);
const ALPHA_C = 0.34;
const C_C = A1 * ALPHA_C - A3 * ALPHA_C ** 3;
const DC_C = A1 - 3 * A3 * ALPHA_C * ALPHA_C;
/** how late the force is: the wind's travel over this many widths of the ribbon, and this share of the wave's
 *  travel across the slot */
const LAG = 1.0;
const SLOT_LAG = 0.2;
/** the jet's turbulence in the force on the ribbon, a share of its dynamic pressure on the ribbon's face (a
 *  slot jet's turbulence intensity a few widths out is 5–10 %) */
const TURB = 0.07;
/** the ribbon: its mass a square metre (kg), its own friction (a Q) */
const AREAL = 0.012;
const Q_INT = 900;
/** the slot: its middle along the ribbon from the bridge (a share of the length) */
export const ZEPHYR_SLOT = 0.38;
/** how hard the wind pushes for what the still air takes back, on the fundamental: at the softest note a key
 *  can hold, and at fortissimo (the bass … the top) */
const R_PP = 1.22;
const R_FF: [number, number] = [6.5, 4.5];
/** the fall of a key: the slot is opened to at least this ratio for a moment (softest … hardest key) */
const R_FALL: [number, number] = [3, 7];
/** the ribbons' tilt in their slots at `tilt` 1 (rad: 8°) */
const TILT = 0.14;
/** the blower gives no more than this times a string's fortissimo wind */
const WIND_MOST = 1.35;
/** a slot's valve: how fast it opens and shuts (s, time constants) */
const VALVE_OPEN = 0.005;
const VALVE_SHUT = 0.012;
/** the reservoir: each slot wide open at fortissimo takes this share of the pressure, and the bellows swing
 *  back at this pitch (Hz) with this damping */
const SAG = 0.022;
const BELLOWS_HZ = 2.6;
const BELLOWS_ZETA = 0.6;
/** the tremulant: its rate (Hz) and its deepest swing of the pressure */
const TREM_HZ = 5.4;
const TREM_DEPTH = 0.16;
/** the player: a key's depth from one to the next and its fall (shares, standard deviations), how late it
 *  is (ms), how a held key's depth wanders (a share, over about a second), the reservoir's own unrest; the
 *  ribbons' tuning (cents) */
const DEPTH_SD = 0.035;
const FALL_SD = 0.12;
const LATE_MS = 1.6;
const HOLD_SD = 0.02;
const CHEST_SD = 0.012;
const STRING_CENTS_SD = 1.3;
/** told the notes to come: a key begun this share of its note's speaking time ahead (never more than
 *  AHEAD_MOST s), and a note of which this share of its length may be spent speaking */
const AHEAD = 0.5;
const AHEAD_MOST = 0.045;
const SPEAK_SHARE = 0.3;
/** told a note's length: a note of a second or more is not held level but breathed, the key eased deeper to
 *  the note's middle and back (the wind's share either way: this at a second, more for each second longer,
 *  never over BREATH_MOST) */
const BREATH = [0.035, 0.03];
const BREATH_MOST = 0.11;
/** notes known to be coming: how many are kept */
const NAHEAD = 96;
const TRACE = 2048;
/** the loudest strings whose shapes the pictures are given */
const NSHAPES = 4;
const SHAPE_PTS = 33;

export interface ZephyrString {
  /** 0 (C2) … 60 (C7) */
  index: number;
  midi: number;
  name: string;
  /** an accidental (the keyboard's black keys: its ribbon is dark) */
  sharp: boolean;
  /** its sounding length (m), its width (m) */
  length: number;
  width: number;
  /** its mass a metre with the air it carries (kg/m), its wave speed (m/s), its wave impedance (kg/s) */
  mu: number;
  c: number;
  Z: number;
  /** the slot's width along it (m) */
  slot: number;
  /** its Q in still air at its pitch */
  Q: number;
  /** its wind at fortissimo (m/s) */
  wind: number;
}

/** the still air's and the ribbon's own damping of a string at ω (1/s: the amplitude's rate) */
const lossAt = (D: number, mu: number, w: number): number => (Math.PI * RHO * D * Math.sqrt(2 * NU * w)) / (2 * mu) + w / (2 * Q_INT);

interface Design extends ZephyrString {
  /** the wind's push over the air's drag on the fundamental at wind U: kG·U/(1 + (q/U + qw)²) */
  kG: number;
  q: number;
  qw: number;
  /** ρDw/4Z: the force over 2Z is k0·U²·C(ẏ/U) */
  k0: number;
  /** the fundamental's loss (1/s) */
  s1: number;
  rff: number;
}

/** (`slope`: the force curve's slope where the ribbon rests, over A₁: a tilted ribbon's is less) */
const ratioAt = (d: Design, U: number, slope = 1): number => (U <= 0 ? 0 : (slope * d.kG * U) / (1 + (d.q / U + d.qw) ** 2));
/** the wind (m/s) at which string d is pushed R times what the air takes back */
function windFor(d: Design, R: number, slope = 1): number {
  let lo = 0.05;
  let hi = 400;
  for (let it = 0; it < 40; it++) {
    const mid = 0.5 * (lo + hi);
    if (ratioAt(d, mid, slope) < R) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

function design(): Design[] {
  const out: Design[] = [];
  for (let i = 0; i < ZEPHYR_STRINGS; i++) {
    const u = i / (ZEPHYR_STRINGS - 1);
    const midi = ZEPHYR_LO + i;
    const f = et(midi);
    // the scale: 1.25 m at C2 to 0.11 m at C7 (the lengths as 2^(−0.70·octaves): a harp’s foreshortening),
    // 3.2 mm wide in the bass to 0.6 mm at the top
    const length = 1.25 * Math.pow(0.11 / 1.25, u);
    const width = 0.0032 * Math.pow(0.0006 / 0.0032, u);
    // (the air a ribbon carries: a cylinder of its width's, ρπa²)
    const mu = AREAL * width + RHO * Math.PI * (width / 2) ** 2;
    const c = 2 * length * f;
    const Z = mu * c;
    // the slot: 0.14 of the length in the bass, 0.22 at the top
    const share = 0.14 + 0.08 * u;
    const slot = share * length;
    const w = 2 * Math.PI * f;
    const s1 = lossAt(width, mu, w);
    const sin2 = Math.sin(Math.PI * ZEPHYR_SLOT) ** 2;
    const pc = midi % 12;
    const d: Design = {
      index: i,
      midi,
      name: `${NAMES[pc]}${Math.floor(midi / 12) - 1}`,
      sharp: [1, 3, 6, 8, 10].includes(pc),
      length,
      width,
      mu,
      c,
      Z,
      slot,
      Q: w / (2 * s1),
      wind: 0,
      kG: (RHO * width * A1 * share * sin2) / (2 * mu * s1),
      q: w * LAG * width,
      qw: (w * SLOT_LAG * slot) / c,
      k0: (RHO * width * slot) / (4 * Z),
      s1,
      rff: R_FF[0] + (R_FF[1] - R_FF[0]) * u,
    };
    d.wind = windFor(d, d.rff);
    out.push(d);
  }
  return out;
}
const STRINGS = design();

/** the ribbons as built (their lengths, widths and winds: the pictures', the notes') */
export function zephyrStrings(): ZephyrString[] {
  return STRINGS.map((d) => ({ index: d.index, midi: d.midi, name: d.name, sharp: d.sharp, length: d.length, width: d.width, mu: d.mu, c: d.c, Z: d.Z, slot: d.slot, Q: d.Q, wind: d.wind }));
}

/** the string a note is played on: its own, or (outside the compass) the one octaves away inside it */
export function zephyrStringOf(m: number): number {
  let p = Math.round(m);
  while (p < ZEPHYR_LO) p += 12;
  while (p > ZEPHYR_HI) p -= 12;
  return p - ZEPHYR_LO;
}

/** one of the core's own events: a key begun ahead of its note (a file playing), and the look whether the
 *  note came */
type Own = { type: 'ahead'; midi: number; velocity: number; dur: number } | { type: 'came'; string: number; at: number } | { type: 'key'; midi: number; velocity: number; dur: number };

/** the body: a soundboard of two graphene skins on an aerogel core, 0.95 m by 0.3 (a twentieth of a spruce
 *  board's weight): its first modes, a presence where so light a panel radiates best, the top let go */
const BODY = { hp: 52, f1: 170, g1: 3, f2: 460, g2: 2, f3: 2400, g3: 2.5, shelfF: 7000, shelfG: -4 };
const GAIN_DB = 16;
/** the jet's own hiss, heard directly (re a string's fortissimo) */
const HISS = 0.004;

export class ZephyrCore implements InstrumentCore {
  readonly id = 'zephyr' as const;
  readonly fs: number;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = ZEPHYR_STRINGS;
  sympatheticAllowed = true;
  params: ZephyrParams;
  private dry: boolean;
  private queue: { frame: number; ev: PianoEvent | Own }[] = [];
  private hum: Human;
  private rng: () => number;
  private N = ZEPHYR_STRINGS;
  // ---- each string's loop: the bridge side's and the far side's delay lines, the loss filter, the fine tuning
  private bufB: Float64Array[] = [];
  private bufN: Float64Array[] = [];
  private wB = new Int32Array(ZEPHYR_STRINGS);
  private wN = new Int32Array(ZEPHYR_STRINGS);
  private lossG = new Float64Array(ZEPHYR_STRINGS);
  private lossA = new Float64Array(ZEPHYR_STRINGS);
  private lossY = new Float64Array(ZEPHYR_STRINGS);
  private apC = new Float64Array(ZEPHYR_STRINGS);
  private apX = new Float64Array(ZEPHYR_STRINGS);
  private apY = new Float64Array(ZEPHYR_STRINGS);
  /** the lengths in use (the buffers are a bend's worth longer) */
  private lenB = new Int32Array(ZEPHYR_STRINGS);
  private lenN = new Int32Array(ZEPHYR_STRINGS);
  // ---- each string's wind: the jet's speed now, the wind its key rests at (and where that is heading), the
  // fall's extra and how fast it goes, the lagged speed the force sees, the jet's noise
  private U = new Float64Array(ZEPHYR_STRINGS);
  private rest = new Float64Array(ZEPHYR_STRINGS);
  private restTo = new Float64Array(ZEPHYR_STRINGS);
  private fall = new Float64Array(ZEPHYR_STRINGS);
  private fallTau = new Float64Array(ZEPHYR_STRINGS);
  private vf = new Float64Array(ZEPHYR_STRINGS);
  private nz = new Float64Array(ZEPHYR_STRINGS);
  /** a held key's own wander (two slow random walks' sum), and each string's tuning (cents) */
  private wander = new Float64Array(ZEPHYR_STRINGS);
  private wanderTo = new Float64Array(ZEPHYR_STRINGS);
  private cents = new Float64Array(ZEPHYR_STRINGS);
  private depth = new Float64Array(ZEPHYR_STRINGS).fill(1);
  // ---- each string: sounding, its slot open, a key holding it, begun ahead (the frame; −1 not), its
  // velocity, its level (the ribbon's speed at the slot, m/s) and its top since the key, when it was begun
  private live = new Uint8Array(ZEPHYR_STRINGS);
  private open = new Uint8Array(ZEPHYR_STRINGS);
  private held = new Uint8Array(ZEPHYR_STRINGS);
  private aheadAt = new Float64Array(ZEPHYR_STRINGS).fill(-1);
  private vel = new Float64Array(ZEPHYR_STRINGS);
  private level = new Float64Array(ZEPHYR_STRINGS);
  private begun = new Float64Array(ZEPHYR_STRINGS).fill(-1);
  /** the note's length where it was told ahead (s; 0: not told) */
  private told = new Float64Array(ZEPHYR_STRINGS);
  private gL = new Float64Array(ZEPHYR_STRINGS);
  private gR = new Float64Array(ZEPHYR_STRINGS);
  private keyString = new Int8Array(128).fill(-1);
  // ---- notes known to be coming (a file playing): frame, pitch, length (s)
  private fAt = new Float64Array(NAHEAD);
  private fM = new Int16Array(NAHEAD);
  private fDur = new Float32Array(NAHEAD);
  private fN = 0;
  // ---- the reservoir: its pressure (1 at rest) and its speed, the tremulant's phase, its own unrest
  private chest = 1;
  private chestV = 0;
  private tremPh = 0;
  private modWheel = 0;
  private dyn = 0;
  private dynNow = 0;
  private unrest = 0;
  private unrestTo = 0;
  private unrestIn = 0;
  private hissA = 0;
  private hissB = 0;
  private last = 24;
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
  private tr = new Float32Array(TRACE);
  private tr2 = new Float32Array(TRACE);
  private trN = 0;
  private trSkip = 0;
  private modeFreqs = new Float64Array(16);

  constructor(opts: { sampleRate: number; params?: Partial<ZephyrParams>; dry?: boolean; player?: number }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.params = { wind: 1, tremulant: 0, tilt: 0.5, human: 1, room: 0.3, volume: 1, ...opts.params };
    this.tune = playerCents(opts.player) / 100;
    // the instrument's own ribbons (another player's is another instrument), then the player's hands, then
    // the jets' turbulence
    const made = new Human(2080, opts.player);
    for (let i = 0; i < this.N; i++) this.cents[i] = STRING_CENTS_SD * made.near();
    this.hum = new Human(613, opts.player);
    this.rng = mulberry32(playerSeed(0x5e9a17, opts.player));
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    const fs = this.fs;
    for (let i = 0; i < this.N; i++) {
      // (room for a bend of two semitones down)
      const n = Math.ceil((fs / et(STRINGS[i].midi)) * 1.14) + 8;
      this.bufB.push(new Float64Array(Math.ceil(n * ZEPHYR_SLOT) + 4));
      this.bufN.push(new Float64Array(Math.ceil(n * (1 - ZEPHYR_SLOT)) + 4));
      // (the low ribbons at the audience's left: a little of the instrument's width)
      const pan = 0.24 * (i / (this.N - 1) - 0.5);
      this.gL[i] = 1 - pan;
      this.gR[i] = 1 + pan;
      this.tuneString(i);
    }
    this.voiced();
    this.freqsOf(this.last);
  }

  private voiced(): void {
    const fs = this.fs;
    const top = 0.42 * fs;
    this.eq.set([biquadHighpass(BODY.hp, 0.7, fs), biquadPeaking(BODY.f1, 1.2, BODY.g1, fs), biquadPeaking(BODY.f2, 1.4, BODY.g2, fs), biquadPeaking(Math.min(top, BODY.f3), 0.8, BODY.g3, fs), biquadHighShelf(Math.min(top, BODY.shelfF), BODY.shelfG, fs)]);
    this.room.configure(this.params.room, this.params.seat);
    this.gain = Math.pow(10, GAIN_DB / 20) * this.params.volume;
  }

  /** how much of a player there is (0 … 1) */
  private get human(): number {
    return clamp(Number(this.params.human) || 0, 0, 1);
  }

  /** the ribbons' tilt (rad), and the force curve's slope there over A₁ */
  private get tilt(): number {
    return TILT * clamp(Number(this.params.tilt) || 0, 0, 1);
  }
  private get slope(): number {
    const a = this.tilt;
    return 1 - (3 * A3 * a * a) / A1;
  }

  /** a string's pitch now (Hz) */
  private pitchOf(i: number): number {
    return et(STRINGS[i].midi + this.tune + this.bend + (this.human * this.cents[i]) / 100);
  }

  /** A string's loop for its pitch now: the loss filter from the still air's drag, the two parts' lengths,
   *  the fine tuning (nothing is allocated). */
  private tuneString(i: number): void {
    const fs = this.fs;
    const d = STRINGS[i];
    // (the wind's lateness makes the note a little flat: the tuning table is what the string is drawn
    // sharp by, so that the note is on its pitch at mezzo-forte)
    const up = this.params.untuned ? 0 : ((zephyrTuning as { cents: number[] }).cents[i] ?? 0);
    const f = this.pitchOf(i) * Math.pow(2, up / 1200);
    const n = fs / f;
    const w = (2 * Math.PI * f) / fs;
    const fH = Math.min(0.42 * fs, 10 * f);
    const t60 = (x: number) => Math.log(1000) / lossAt(d.width, d.mu, 2 * Math.PI * x);
    const L = designLossFilter([f, fH], [t60(f), t60(fH)], [n, n], fs);
    this.lossG[i] = L.g * (1 + L.a);
    this.lossA[i] = L.a;
    const lossDelay = onePolePhaseDelay(L.a, w);
    let nb = Math.round(ZEPHYR_SLOT * n - lossDelay);
    nb = clamp(nb, 1, this.bufB[i].length);
    // (the far side: a whole number of samples and a first-order allpass's 0.5–1.5)
    let rest = n - nb - lossDelay;
    let nn = Math.floor(rest - 0.5);
    nn = clamp(nn, 1, this.bufN[i].length);
    rest -= nn;
    this.apC[i] = thiranForPhaseDelay(clamp(rest, 0.3, 1.9), w);
    if (nb !== this.lenB[i] || nn !== this.lenN[i]) {
      this.lenB[i] = nb;
      this.lenN[i] = nn;
      if (this.wB[i] >= nb) this.wB[i] = 0;
      if (this.wN[i] >= nn) this.wN[i] = 0;
    }
  }

  private freqsOf(i: number): void {
    const f = this.pitchOf(i);
    for (let k = 0; k < 16; k++) this.modeFreqs[k] = (k + 1) * f < 0.5 * this.fs ? (k + 1) * f : 0;
  }

  schedule(ev: unknown, frame?: number): void {
    const f = frame === undefined ? this.frame : Math.max(this.frame, Math.floor(frame));
    const fe = ev as { type?: string; midi: number; velocity: number; dur: number };
    // a note to come is not an event: it is known at once
    if (fe.type === 'foresee') {
      this.foreseen(f, fe.midi, fe.dur);
      // (the player, told the note: the key is begun a little ahead of a note that is slow to speak)
      const i = zephyrStringOf(fe.midi);
      const lead = Math.min(AHEAD_MOST, AHEAD * this.speaks(i, fe.velocity, fe.dur)) * this.human;
      const at = f - Math.round(lead * this.fs);
      if (lead > 0.004 && at > this.frame) this.own(at, { type: 'ahead', midi: fe.midi, velocity: fe.velocity, dur: fe.dur });
      return;
    }
    this.own(f, ev as PianoEvent);
  }

  /** an event in its place in the queue */
  private own(frame: number, ev: PianoEvent | Own): void {
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].frame > frame) i--;
    q.splice(i, 0, { frame, ev });
  }

  private foreseen(at: number, midi: number, dur: number): void {
    let n = this.fN;
    if (n === NAHEAD) {
      for (let k = 1; k < n; k++) {
        this.fAt[k - 1] = this.fAt[k];
        this.fM[k - 1] = this.fM[k];
        this.fDur[k - 1] = this.fDur[k];
      }
      n--;
    }
    let k = n;
    while (k > 0 && this.fAt[k - 1] > at) {
      this.fAt[k] = this.fAt[k - 1];
      this.fM[k] = this.fM[k - 1];
      this.fDur[k] = this.fDur[k - 1];
      k--;
    }
    this.fAt[k] = at;
    this.fM[k] = midi;
    this.fDur[k] = dur;
    this.fN = n + 1;
  }
  /** the length (s) of the note of this pitch foreseen for now (0: none was); those past are dropped */
  private foretold(midi: number): number {
    const near = 0.012 * this.fs;
    let dur = 0;
    let kept = 0;
    for (let k = 0; k < this.fN; k++) {
      if (this.fAt[k] < this.frame - near) continue;
      if (!dur && this.fM[k] === midi && this.fAt[k] <= this.frame + near) {
        dur = this.fDur[k];
        continue;
      }
      this.fAt[kept] = this.fAt[k];
      this.fM[kept] = this.fM[k];
      this.fDur[kept] = this.fDur[k];
      kept++;
    }
    this.fN = kept;
    return dur;
  }

  /** what was foreseen is forgotten (the file paused or stopped): the keys begun ahead are let go */
  forget(): void {
    this.fN = 0;
    let kept = 0;
    for (const e of this.queue) if (e.ev.type !== 'ahead' && e.ev.type !== 'came') this.queue[kept++] = e;
    this.queue.length = kept;
    for (let i = 0; i < this.N; i++)
      if (this.aheadAt[i] >= 0) {
        this.aheadAt[i] = -1;
        if (!this.held[i]) this.shut(i);
      }
  }

  /** the ratio a key's velocity rests at, and the ratio its fall reaches */
  private ratios(i: number, velocity: number): [number, number] {
    const u = clamp((velocity - 1) / 126, 0, 1);
    const d = STRINGS[i];
    return [R_PP * Math.pow(d.rff / R_PP, Math.pow(u, 0.9)), R_FALL[0] + (R_FALL[1] - R_FALL[0]) * u];
  }
  /** about how long a note takes to speak (s): the fundamental's growth at its key's fall, from the jet's
   *  noise to most of its level (five e-foldings) */
  private speaks(i: number, velocity: number, dur = 0): number {
    const d = STRINGS[i];
    const [rest, fall] = this.ratios(i, velocity);
    let r = Math.max(rest, fall);
    if (dur > 0) r = Math.max(r, this.fallFor(i, dur));
    return 5 / (d.s1 * Math.max(0.3, Math.min(r, ratioAt(d, WIND_MOST * d.wind, this.slope)) - 1));
  }
  /** the ratio that speaks a note within its share of `dur` seconds */
  private fallFor(i: number, dur: number): number {
    return 1 + 5 / (STRINGS[i].s1 * Math.max(0.01, SPEAK_SHARE * dur));
  }

  /** A key goes down: its slot opens wide for the fall and settles to where the key rests. */
  private begin(i: number, velocity: number, dur: number): void {
    const d = STRINGS[i];
    const H = this.human;
    const hum = this.hum;
    const blow = clamp(Number(this.params.wind) || 1, 0.5, 1.6);
    const [rRest, rFall0] = this.ratios(i, clamp(velocity + this.dyn, 1, 127));
    let rFall = rFall0 * (1 + FALL_SD * hum.near() * H);
    if (dur > 0) rFall = Math.max(rFall, this.fallFor(i, dur));
    this.depth[i] = 1 + DEPTH_SD * hum.near() * H;
    const most = WIND_MOST * d.wind;
    const sl = this.slope;
    const rest = Math.min(most, windFor(d, rRest, sl) * blow * this.depth[i]);
    const fall = Math.min(most, windFor(d, Math.max(rRest, rFall), sl) * blow);
    const again = this.open[i] === 1;
    this.rest[i] = this.restTo[i] = rest;
    // (a key struck again while its slot is open: the fall is added to what is left of the last)
    this.fall[i] = Math.max(this.fall[i], fall - rest, 0);
    // the fall is over as the note has spoken: a few e-foldings of the fundamental's growth at the fall
    this.fallTau[i] = clamp(2.2 / (d.s1 * Math.max(0.5, ratioAt(d, fall, sl) - 1)), 0.012, 0.3);
    this.open[i] = 1;
    this.vel[i] = velocity;
    this.told[i] = dur;
    if (!again) this.begun[i] = this.frame;
    if (!this.live[i]) {
      this.live[i] = 1;
      this.tuneString(i);
    }
    this.last = i;
    this.trN = 0;
    this.trSkip = 0;
    this.freqsOf(i);
  }

  private shut(i: number): void {
    this.open[i] = 0;
    this.fall[i] = 0;
  }

  /** a key's note: on the instant (`human` 0), or as late as the hand is */
  private key(midi: number, velocity: number, dur: number): void {
    const late = Math.round(Math.abs(this.hum.near()) * this.human * LATE_MS * 0.001 * this.fs);
    if (late <= 0) return this.down(midi, velocity, dur);
    this.own(this.frame + late, { type: 'key', midi, velocity, dur });
  }
  private down(midi: number, velocity: number, dur: number): void {
    const m = Math.round(midi);
    const i = zephyrStringOf(m);
    if (m >= 0 && m < 128) {
      // (the key let go again before its late note came: nothing sounds)
      if (this.keyString[m] !== i) return;
    }
    // (begun ahead of its note: the key is down already; the note is now the key's)
    if (this.aheadAt[i] >= 0 && this.open[i]) {
      this.aheadAt[i] = -1;
      this.vel[i] = velocity;
      this.begun[i] = this.frame;
      return;
    }
    this.aheadAt[i] = -1;
    this.begin(i, velocity, dur);
  }

  private apply(ev: PianoEvent | Own): void {
    switch (ev.type) {
      case 'noteOn': {
        if (ev.velocity <= 0) return this.release(ev.midi);
        const m = Math.round(ev.midi);
        const i = zephyrStringOf(m);
        if (m >= 0 && m < 128) this.keyString[m] = i;
        this.held[i] = 1;
        const dur = this.foretold(m);
        // (a key begun ahead has had its lateness already)
        if (this.aheadAt[i] >= 0 && this.open[i]) this.down(m, ev.velocity, dur);
        else this.key(m, ev.velocity, dur);
        break;
      }
      case 'key':
        this.down(ev.midi, ev.velocity, ev.dur);
        break;
      case 'ahead': {
        const i = zephyrStringOf(ev.midi);
        // (only a silent string is begun ahead: one still sounding is the last note's until its own comes)
        if (this.open[i] || this.held[i]) break;
        this.begin(i, ev.velocity, ev.dur);
        this.aheadAt[i] = this.frame;
        this.own(this.frame + Math.round((AHEAD_MOST + 0.06) * this.fs), { type: 'came', string: i, at: this.frame });
        break;
      }
      case 'came':
        // (the note a key was begun for never came: the file stopped)
        if (this.aheadAt[ev.string] === ev.at) {
          this.aheadAt[ev.string] = -1;
          if (!this.held[ev.string]) this.shut(ev.string);
        }
        break;
      case 'control':
        // (the wheel's upper half: a file's wheel comes as 0.5–1, a keyboard's at rest as 0)
        if (ev.cc === 1) this.modWheel = clamp(2 * ev.value - 1, 0, 1);
        else if (ev.cc === CC_DYNAMICS) {
          this.dyn = clamp(ev.value, -64, 64);
          this.dynamics();
        }
        break;
      case 'noteOff':
        this.release(ev.midi);
        break;
      case 'sustain':
        // (the pedal holds the slots of the keys let go)
        this.sustain = clamp(ev.value, 0, 1);
        if (this.sustain < 0.5) for (let i = 0; i < this.N; i++) if (!this.held[i] && this.open[i] && this.aheadAt[i] < 0) this.shut(i);
        break;
      case 'bend':
        this.bend = clamp(ev.value, -2, 2);
        for (let i = 0; i < this.N; i++) if (this.live[i]) this.tuneString(i);
        this.freqsOf(this.last);
        break;
      case 'allNotesOff':
        this.allSoundOff();
        break;
      default:
        break;
    }
  }

  /** the file's dynamics over held notes: each open key rests where a key that much harder would */
  private dynamics(): void {
    const blow = clamp(Number(this.params.wind) || 1, 0.5, 1.6);
    for (let i = 0; i < this.N; i++) {
      if (!this.open[i]) continue;
      const d = STRINGS[i];
      const [r] = this.ratios(i, clamp(this.vel[i] + this.dyn, 1, 127));
      this.restTo[i] = Math.min(WIND_MOST * d.wind, windFor(d, r, this.slope) * blow * this.depth[i]);
    }
  }

  private release(midi: number): void {
    const m = Math.round(midi);
    if (m < 0 || m > 127) return;
    const i = this.keyString[m];
    if (i < 0) return;
    this.keyString[m] = -1;
    this.held[i] = 0;
    if (this.sustain < 0.5 && this.aheadAt[i] < 0) this.shut(i);
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<ZephyrParams>) };
    if (this.params.room !== old.room || this.params.volume !== old.volume) this.voiced();
    else if (this.params.seat !== old.seat) this.room.configure(this.params.room, this.params.seat);
    if (this.params.wind !== old.wind || this.params.tilt !== old.tilt) this.dynamics();
    if (this.params.human !== old.human || this.params.untuned !== old.untuned) for (let i = 0; i < this.N; i++) if (this.live[i]) this.tuneString(i);
  }

  /** the strings sounding (their pitches), loudest first */
  sounding(): number[] {
    const out: [number, number][] = [];
    for (let i = 0; i < this.N; i++) {
      if (!this.live[i]) continue;
      const a = this.level[i] / (ALPHA_TOP * STRINGS[i].wind);
      if (a > 0.03) out.push([STRINGS[i].midi, a]);
    }
    return out.sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }

  private still(i: number): void {
    this.bufB[i].fill(0);
    this.bufN[i].fill(0);
    this.lossY[i] = this.apX[i] = this.apY[i] = 0;
    this.vf[i] = this.nz[i] = 0;
    this.U[i] = 0;
    this.level[i] = 0;
    this.live[i] = 0;
    this.begun[i] = -1;
    this.told[i] = 0;
    this.wander[i] = this.wanderTo[i] = 0;
  }

  allSoundOff(): void {
    for (let i = 0; i < this.N; i++) {
      this.still(i);
      this.open[i] = this.held[i] = 0;
      this.fall[i] = this.rest[i] = this.restTo[i] = 0;
      this.aheadAt[i] = -1;
    }
    this.keyString.fill(-1);
    // (keys on their way and keys begun ahead are not played)
    let kept = 0;
    for (const e of this.queue) if (e.ev.type !== 'key' && e.ev.type !== 'ahead' && e.ev.type !== 'came') this.queue[kept++] = e;
    this.queue.length = kept;
    this.chest = 1;
    this.chestV = 0;
    this.hissA = this.hissB = 0;
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  get activeVoiceCount(): number {
    let n = 0;
    for (let i = 0; i < this.N; i++) n += this.live[i];
    return n;
  }
  get activeSympatheticCount(): number {
    return 0;
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

  /** the reservoir over a block: what the open slots take, the bellows' swing, the tremulant, its unrest */
  private wind(dt: number): number {
    let taken = 0;
    for (let i = 0; i < this.N; i++) if (this.live[i]) taken += this.U[i] / STRINGS[i].wind;
    const H = this.human;
    // (its own unrest: a slow random walk, a new aim a few times a second)
    this.unrestIn -= dt;
    if (this.unrestIn <= 0) {
      this.unrestIn = 0.25 + 0.2 * this.hum.even();
      this.unrestTo = CHEST_SD * this.hum.near();
    }
    this.unrest += (this.unrestTo - this.unrest) * (1 - Math.exp(-dt / 0.35));
    const to = 1 / (1 + SAG * taken) + H * this.unrest;
    const w0 = 2 * Math.PI * BELLOWS_HZ;
    // (a damped spring, stepped exactly enough for a block of a millisecond)
    this.chestV += (w0 * w0 * (to - this.chest) - 2 * BELLOWS_ZETA * w0 * this.chestV) * dt;
    this.chest += this.chestV * dt;
    const trem = clamp(Math.max(Number(this.params.tremulant) || 0, this.modWheel), 0, 1);
    this.tremPh += 2 * Math.PI * TREM_HZ * dt;
    if (this.tremPh > 2 * Math.PI) this.tremPh -= 2 * Math.PI;
    return clamp(this.chest * (1 + TREM_DEPTH * trem * Math.sin(this.tremPh)), 0.3, 1.5);
  }

  private render(n: number): void {
    const fs = this.fs;
    const dt = n / fs;
    const oL = this.oL;
    const oR = this.oR;
    const buf = this.buf;
    for (let t = 0; t < n; t++) oL[t] = oR[t] = 0;
    const P = this.wind(dt);
    const H = this.human;
    const kDyn = 1 - Math.exp(-dt / DYN_TAU);
    const rng = this.rng;
    // (the tilt: the curve is read from where the ribbon rests. What it gives there leans the ribbon over as
    // the slot opens, and lets it back as it shuts: the wind's own small pluck, which is what a tilted
    // ribbon's note starts from)
    const a0 = this.tilt;
    let hiss = 0;
    for (let i = 0; i < this.N; i++) {
      if (!this.live[i]) continue;
      const d = STRINGS[i];
      // ---- the wind at this string's slot over the block
      this.rest[i] += (this.restTo[i] - this.rest[i]) * kDyn;
      if (this.fall[i] > 0) {
        this.fall[i] *= Math.exp(-dt / this.fallTau[i]);
        if (this.fall[i] < 1e-3) this.fall[i] = 0;
      }
      if (this.open[i] && H > 0) {
        // (a held key's depth wanders: a new aim now and then, approached over a third of a second)
        if (rng() < dt / 0.4) this.wanderTo[i] = HOLD_SD * H * (2 * rng() - 1) * 1.7;
        this.wander[i] += (this.wanderTo[i] - this.wander[i]) * (1 - Math.exp(-dt / 0.3));
      }
      // (a long note told ahead is breathed: under its level as it begins and ends, over it at its middle)
      let breath = 1;
      if (H > 0 && this.told[i] >= 1 && this.begun[i] >= 0) {
        const u = (this.frame - this.begun[i]) / (this.told[i] * fs);
        if (u < 1) breath = 1 + H * Math.min(BREATH_MOST, BREATH[0] + BREATH[1] * (this.told[i] - 1)) * (Math.sin(Math.PI * u) - 0.4);
      }
      const Ut = this.open[i] ? P * (this.rest[i] * breath * (1 + this.wander[i]) + this.fall[i]) : 0;
      const kv = 1 - Math.exp(-1 / (fs * (this.open[i] ? VALVE_OPEN : VALVE_SHUT)));
      let U = this.U[i];
      // (the force's lateness and the noise's band follow the wind as the block begins)
      const Um = Math.max(U, 0.25 * d.wind);
      const tau = (LAG * d.width) / Um + (SLOT_LAG * d.slot) / d.c;
      const bq = 1 - Math.exp(-1 / (fs * tau));
      const fc = Math.min(0.45 * fs, (0.5 * Um) / d.width);
      const bn = 1 - Math.exp((-2 * Math.PI * fc) / fs);
      // (white noise of ±1 has a variance of a third; through the one-pole, bn/(2 − bn) of it; what the
      // band holds of a spectrum that falls from fc)
      const sw = Math.sqrt(((3 * (2 - bn)) / bn) * (2 / Math.PI) * Math.atan(fs / (2 * fc)));
      const B = this.bufB[i];
      const Nn = this.bufN[i];
      const nb = this.lenB[i];
      const nn = this.lenN[i];
      let wb = this.wB[i];
      let wn = this.wN[i];
      const lg = this.lossG[i];
      const la = this.lossA[i];
      let ly = this.lossY[i];
      const ac = this.apC[i];
      let ax = this.apX[i];
      let ay = this.apY[i];
      let vf = this.vf[i];
      let nz = this.nz[i];
      const k0 = d.k0;
      let pk = 0;
      const trace = i === this.last && this.trN < TRACE;
      for (let t = 0; t < n; t++) {
        U += (Ut - U) * kv;
        // the waves coming back to the slot: from the bridge (through its losses), from the far end
        const xb = B[wb];
        ly = lg * xb - la * ly;
        const a = -ly;
        const xn = Nn[wn];
        const yn = ac * xn + ax - ac * ay;
        ax = xn;
        ay = yn;
        const b = -yn;
        const s = a + b;
        nz += bn * (sw * (2 * rng() - 1) - nz);
        let f = 0;
        if (U > 0.05) {
          // the wind's force over 2Z: k·C(vf/U) and the turbulence; vf, the ribbon's speed as the flow has
          // caught up with it, is solved with it (Newton: the curve is steep nowhere)
          const k = k0 * U * U;
          const fn = k * TURB * nz;
          const iu = 1 / U;
          const base = vf + bq * (s + fn - vf);
          const bk = bq * k;
          let x = vf;
          let C = 0;
          for (let it = 0; it < 3; it++) {
            const al = x * iu + a0;
            let dC: number;
            if (al > ALPHA_C) {
              C = C_C + DC_C * (al - ALPHA_C);
              dC = DC_C;
            } else if (al < -ALPHA_C) {
              C = -C_C + DC_C * (al + ALPHA_C);
              dC = DC_C;
            } else {
              C = al * (A1 - A3 * al * al);
              dC = A1 - 3 * A3 * al * al;
            }
            x -= (x - base - bk * C) / (1 - bk * dC * iu);
          }
          vf = x;
          const al = x * iu + a0;
          C = al > ALPHA_C ? C_C + DC_C * (al - ALPHA_C) : al < -ALPHA_C ? -C_C + DC_C * (al + ALPHA_C) : al * (A1 - A3 * al * al);
          f = k * C + fn;
        } else vf += bq * (s - vf);
        const v = s + f;
        const toB = b + f;
        B[wb] = toB;
        Nn[wn] = a + f;
        if (++wb >= nb) wb = 0;
        if (++wn >= nn) wn = 0;
        buf[t] = toB;
        const av = v < 0 ? -v : v;
        if (av > pk) pk = av;
        if (trace && this.trN < TRACE) {
          // (the trace: every other sample at 48 kHz, so that the bass's first periods are in it)
          if (this.trSkip-- <= 0) {
            this.tr[this.trN] = v;
            this.tr2[this.trN++] = U;
            this.trSkip = fs > 60000 ? 3 : 1;
          }
        }
      }
      this.U[i] = U;
      this.wB[i] = wb;
      this.wN[i] = wn;
      this.lossY[i] = ly;
      this.apX[i] = ax;
      this.apY[i] = ay;
      this.vf[i] = vf;
      this.nz[i] = nz;
      // what leaves: the force on the bridge, Z times the wave that reaches it
      const gl = this.gL[i] * d.Z;
      const gr = this.gR[i] * d.Z;
      for (let t = 0; t < n; t++) {
        oL[t] += gl * buf[t];
        oR[t] += gr * buf[t];
      }
      this.level[i] = Math.max(pk, this.level[i] * Math.exp(-dt / 0.03));
      const share = U / d.wind;
      hiss += share * share * share * d.Z * d.wind;
      if (!this.open[i] && U < 0.02 && this.level[i] < 1e-4 * d.wind) this.still(i);
    }
    // the jets' own hiss (a band of noise, 1–5 kHz)
    if (hiss > 0 || Math.abs(this.hissA) > 1e-9) {
      const ca = 1 - Math.exp((-2 * Math.PI * Math.min(0.4 * fs, 5000)) / fs);
      const cb = 1 - Math.exp((-2 * Math.PI * 1000) / fs);
      const g = HISS * hiss * Math.sqrt(fs / 48000);
      for (let t = 0; t < n; t++) {
        this.hissA += ca * (g * (2 * rng() - 1) - this.hissA);
        this.hissB += cb * (this.hissA - this.hissB);
        const h = this.hissA - this.hissB;
        oL[t] += h;
        oR[t] += h;
      }
      if (hiss === 0 && Math.abs(this.hissA) < 1e-9) this.hissA = this.hissB = 0;
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
    return STRINGS.map((d) => ({ midi: d.midi, f1: et(d.midi), B: 0, nStrings: 1, lengthM: d.length, hasDamper: false, preparation: `a ribbon ${(d.length * 1000).toFixed(0)} mm long, ${(d.width * 1000).toFixed(1)} mm wide` }) as KeySummary);
  }

  /** A string's shape now (m), the bridge at 0 and the far end at 1: its slope is the difference of the two
   *  waves over c, summed along the loop from the bridge. */
  private shapeOf(i: number, points: number, out: Float32Array): void {
    const B = this.bufB[i];
    const Nn = this.bufN[i];
    const nb = this.lenB[i];
    const nn = this.lenN[i];
    const hb = nb >> 1;
    const hn = nn >> 1;
    const total = hb + hn;
    const wb = this.wB[i];
    const wn = this.wN[i];
    const at = (buf: Float64Array, w: number, len: number, back: number) => buf[(((w - 1 - back) % len) + len) % len];
    let y = 0;
    let p = 0;
    out[0] = 0;
    for (let k = 0; k < total && p < points - 1; k++) {
      // (towards the bridge: l; away from it: r; the reflected wave comes back turned over)
      let l: number;
      let r: number;
      if (k < hb) {
        const dj = hb - k;
        l = at(B, wb, nb, dj);
        r = -at(B, wb, nb, nb - dj);
      } else {
        const dj = k - hb;
        r = at(Nn, wn, nn, dj);
        l = -at(Nn, wn, nn, nn - 1 - dj);
      }
      y += (l - r) / this.fs;
      while (p < points - 1 && (p + 1) / (points - 1) <= (k + 1) / total) out[++p] = y;
    }
    // (both ends are fixed: what the sum is left with at the far end is taken out along the string)
    const end = out[points - 1];
    for (let q = 0; q < points; q++) out[q] -= (end * q) / (points - 1);
  }

  getVisual(points = 160): object {
    const i = this.last;
    const d = STRINGS[i];
    const shape = new Float32Array(points);
    if (this.live[i]) this.shapeOf(i, points, shape);
    const modes = new Float32Array(16);
    const len = Math.max(16, Math.min(this.trN, TRACE));
    const excite: ExciteTrace = {
      title: 'Ribbon',
      unit: 'm/s',
      rate: this.fs > 60000 ? this.fs / 4 : this.fs / 2,
      trace: this.tr.slice(0, len),
      trace2: this.tr2.slice(0, len),
      trace2Label: 'wind',
      caption: 'The ribbon’s speed in its slot and the wind there, since the key went down.',
      meta: `${d.name} ribbon · ${(d.length * 1000).toFixed(0)} mm · ${this.U[i].toFixed(0)} m/s`,
    };
    // every string's swing (0 … 1 of a fortissimo's: the ribbon's speed at the slot against the speed the
    // wind holds it to), and its width in metres at the string's middle; every slot's wind (of its fortissimo)
    const amp = new Float32Array(this.N);
    const swing = new Float32Array(this.N);
    const wind = new Float32Array(this.N);
    const order: number[] = [];
    for (let s = 0; s < this.N; s++) {
      if (!this.live[s]) continue;
      const ds = STRINGS[s];
      amp[s] = clamp(this.level[s] / (1.6 * ALPHA_TOP * ds.wind), 0, 1);
      swing[s] = this.level[s] / (2 * Math.PI * et(ds.midi) * Math.sin(Math.PI * ZEPHYR_SLOT));
      wind[s] = clamp(this.U[s] / ds.wind, 0, 1.5);
      if (amp[s] > 0.02) order.push(s);
    }
    order.sort((a, b) => amp[b] - amp[a]);
    const shapes = order.slice(0, NSHAPES).map((s) => {
      const sh = new Float32Array(SHAPE_PTS);
      this.shapeOf(s, SHAPE_PTS, sh);
      return { string: s, shape: sh };
    });
    return {
      frame: this.frame,
      voices: this.activeVoiceCount,
      sympathetic: 0,
      focus: { midi: d.midi, nStrings: 1, shapes: [shape], hammerAt: ZEPHYR_SLOT, prepAt: -1, lengthM: d.length, f1: this.pitchOf(i), B: 0, damper: 0 },
      strike: null,
      excite,
      modes,
      zephyr: { amp, swing, wind, shapes, last: i, ago: this.begun[i] < 0 ? -1 : (this.frame - this.begun[i]) / this.fs, vel: this.vel[i], chest: this.chest },
      sustain: this.sustain,
      soft: 0,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }
}
