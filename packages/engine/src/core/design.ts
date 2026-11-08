// Instrument design (presets) and per-key physical parameters, including
// inharmonicity-driven stretch tuning.

import { DEFAULT_CALIBRATION, type Breakpoints, type Calibration } from './calibration.ts';
import { clamp, gauss, interp, interpLog, midiToEtHz, mulberry32 } from './util.ts';

export const KEY_LO = 21; // A0
export const KEY_HI = 108; // C8
export const NUM_KEYS = KEY_HI - KEY_LO + 1;
export const NUM_ZONES = 3;

/** A preparation inserted between/on the strings of one key (prepared piano). */
export interface Preparation {
  midi: number;
  /** position along speaking length from the agraffe, 0..1 */
  position: number;
  /** attached mass, kg (bolt, screw) */
  mass: number;
  /** dashpot to ground, kg/s (rubber, felt) */
  damping: number;
  label?: string;
}

/** User-facing physical controls. All are "live" (see engine docs for which apply to sounding notes). */
export interface PianoParams {
  /** multiplier on felt stiffness (1 = calibrated) */
  hammerHardness: number;
  /** multiplier on the inharmonicity coefficient B */
  stringStiffness: number;
  /** spread between unison strings, cents */
  unisonDetune: number;
  /** multiplier on soundboard modal loss factor */
  soundboardDamping: number;
  /** 0 = lid closed, 1 = fully open */
  lid: number;
  /** 0 = dry (close mics), 1 = large wet room */
  room: number;
  /** multiplier on intrinsic string decay times */
  sustain: number;
  /** master output gain (linear) */
  volume: number;
  /** compute sympathetic resonance of undamped strings */
  sympathetic: boolean;
  /** longitudinal / phantom partials in the bass */
  phantom: boolean;
}

export interface BoardDesign {
  /** mean modal spacing, Hz */
  spacing: number;
  fLow: number;
  fHigh: number;
  /** multiplier on calibrated loss factor */
  lossScale: number;
  /** multiplier on calibrated modal mass */
  massScale: number;
  seed: number;
}

export interface PianoDesign {
  id: string;
  label: string;
  description: string;
  lengthScale: Breakpoints;
  tensionScale: number;
  unichordTop: number;
  bichordTop: number;
  /** first plain-wire (unwound) note; notes below are wound and on the bass bridge */
  bassBreak: number;
  /** highest key with a damper */
  damperTop: number;
  /** 0 = equal temperament on partial 1, 1 = full inharmonicity stretch */
  stretch: number;
  /** per-string random mistuning (cents, std dev) */
  randomDetune: number;
  /** per-key random offset of the whole note (cents, std dev) — e.g. an untuned piano */
  randomKeyDetune: number;
  hammerHardness: number;
  hammerMassScale: number;
  decayScale: number;
  bridgeYScale: number;
  board: BoardDesign;
  /** extra preset EQ on top of the calibration EQ: [Hz, dB, Q] */
  eq: [number, number, number][];
  defaults: Partial<PianoParams>;
  preparations: Preparation[];
  seed: number;
}

export const DEFAULT_PARAMS: PianoParams = {
  hammerHardness: 1,
  stringStiffness: 1,
  unisonDetune: 1.0,
  soundboardDamping: 1,
  lid: 1,
  room: 0.22,
  sustain: 1,
  volume: 1,
  sympathetic: true,
  phantom: true,
};

const GRAND: PianoDesign = {
  id: 'grand',
  label: 'Concert grand',
  description: 'A 7-foot class grand, calibrated against a Steinway model B recording.',
  lengthScale: { midi: [21, 108], val: [1, 1] },
  tensionScale: 1,
  unichordTop: 30,
  bichordTop: 45,
  bassBreak: 46,
  damperTop: 88,
  stretch: 1,
  randomDetune: 0.25,
  randomKeyDetune: 0,
  hammerHardness: 1,
  hammerMassScale: 1,
  decayScale: 1,
  bridgeYScale: 1,
  board: { spacing: 22, fLow: 48, fHigh: 3200, lossScale: 1, massScale: 1, seed: 7 },
  eq: [],
  defaults: { unisonDetune: 1.0, lid: 1, room: 0.22 },
  preparations: [],
  seed: 1,
};

const UPRIGHT: PianoDesign = {
  ...GRAND,
  id: 'upright',
  label: 'Upright',
  description: 'A 120 cm studio upright: shorter, stiffer strings, a smaller and stiffer soundboard.',
  lengthScale: { midi: [21, 48, 72, 108], val: [0.64, 0.7, 0.82, 0.95] },
  tensionScale: 0.92,
  unichordTop: 28,
  bichordTop: 44,
  bassBreak: 45,
  damperTop: 90,
  randomDetune: 0.4,
  hammerHardness: 1.25,
  hammerMassScale: 0.85,
  decayScale: 0.75,
  bridgeYScale: 1.3,
  board: { spacing: 34, fLow: 72, fHigh: 3200, lossScale: 1.35, massScale: 0.55, seed: 11 },
  eq: [
    [240, 2.5, 0.9],
    [3800, -2, 0.8],
  ],
  defaults: { unisonDetune: 1.4, lid: 0.35, room: 0.18 },
  seed: 2,
};

const HONKY: PianoDesign = {
  ...UPRIGHT,
  id: 'honky-tonk',
  label: 'Honky-tonk',
  description: 'A tired upright: unisons far apart, hard worn hammers, loose tuning.',
  randomDetune: 3.5,
  randomKeyDetune: 4,
  stretch: 0.6,
  hammerHardness: 2.8,
  decayScale: 0.65,
  eq: [
    [260, 1.5, 0.9],
    [2600, 3, 0.9],
  ],
  defaults: { unisonDetune: 16, lid: 0.6, room: 0.14 },
  seed: 3,
};

// Preparations loosely after Cage's tables: bolts and screws (mass), rubber (damping).
const PREP: Preparation[] = [
  { midi: 41, position: 0.18, mass: 0.022, damping: 0.5, label: 'bolt' },
  { midi: 43, position: 0.29, mass: 0.012, damping: 0.3, label: 'screw' },
  { midi: 46, position: 0.22, mass: 0.0015, damping: 9, label: 'rubber' },
  { midi: 48, position: 0.31, mass: 0.016, damping: 0.4, label: 'bolt' },
  { midi: 50, position: 0.17, mass: 0.006, damping: 0.2, label: 'screw' },
  { midi: 52, position: 0.25, mass: 0.0012, damping: 7, label: 'rubber' },
  { midi: 53, position: 0.36, mass: 0.02, damping: 0.6, label: 'bolt' },
  { midi: 55, position: 0.21, mass: 0.009, damping: 0.3, label: 'screw' },
  { midi: 57, position: 0.27, mass: 0.0018, damping: 6, label: 'rubber' },
  { midi: 58, position: 0.33, mass: 0.014, damping: 0.4, label: 'bolt' },
  { midi: 60, position: 0.19, mass: 0.007, damping: 0.25, label: 'screw' },
  { midi: 62, position: 0.24, mass: 0.011, damping: 0.35, label: 'bolt' },
  { midi: 64, position: 0.3, mass: 0.0014, damping: 5, label: 'rubber' },
  { midi: 65, position: 0.2, mass: 0.006, damping: 0.2, label: 'screw' },
  { midi: 67, position: 0.26, mass: 0.009, damping: 0.3, label: 'bolt' },
  { midi: 69, position: 0.34, mass: 0.004, damping: 0.15, label: 'screw' },
  { midi: 71, position: 0.23, mass: 0.001, damping: 4, label: 'rubber' },
  { midi: 72, position: 0.28, mass: 0.006, damping: 0.25, label: 'bolt' },
];

const PREPARED: PianoDesign = {
  ...GRAND,
  id: 'prepared',
  label: 'Prepared',
  description: 'The grand with bolts, screws and rubber wedged between strings from F2 to C5.',
  hammerHardness: 1.15,
  preparations: PREP,
  defaults: { unisonDetune: 1.0, lid: 1, room: 0.25 },
  seed: 4,
};

export const PRESETS: Record<string, PianoDesign> = {
  grand: GRAND,
  upright: UPRIGHT,
  'honky-tonk': HONKY,
  prepared: PREPARED,
};

export const PRESET_IDS = Object.keys(PRESETS);

/** Per-string specification. */
export interface StringSpec {
  /** target frequency of partial 1, Hz */
  f1: number;
  /** ideal-string fundamental f0 such that f_k = k f0 sqrt(1 + B k^2) */
  f0: number;
  B: number;
  /** wave impedance, kg/s */
  Z: number;
  /** hammer excitation weight (voicing irregularity) */
  weight: number;
}

export interface KeySpec {
  midi: number;
  nStrings: number;
  wound: boolean;
  /** speaking length (m), tension (N) */
  L: number;
  T: number;
  /** nominal partial-1 frequency after stretch, Hz */
  f1: number;
  f0: number;
  B: number;
  strings: StringSpec[];
  /** strike position fraction from agraffe */
  beta: number;
  hammer: { mass: number; p: number; K: number; lambda: number };
  t60Low: number;
  t60High: number;
  t60HighHz: number;
  bridgeY: number;
  hasDamper: boolean;
  damperLow: number;
  damperHigh: number;
  zoneW: [number, number, number];
  /** first longitudinal mode, Hz, and phantom coupling gain */
  longFreq: number;
  phantomGain: number;
  preparation: Preparation | null;
}

const bp = (b: Breakpoints, m: number): number => interp(m, b.midi, b.val);
const bpLog = (b: Breakpoints, m: number): number => interpLog(m, b.midi, b.val);

/** Inharmonicity curve of the reference grand (before length scaling). */
export function referenceB(m: number, cal: Calibration): number {
  const { bT, sT, bB, sB } = cal.B;
  return bT * Math.exp(sT * (m - 60)) + bB * Math.exp(-sB * (m - 21));
}

/** Speaking length of the reference grand, metres. */
export function referenceLength(m: number, bassBreak = 46): number {
  if (m >= 48) return 0.052 * Math.pow(1.88, (108 - m) / 12);
  // wound region: compress lengths below the break (strings are shortened and wound)
  const l48 = 0.052 * Math.pow(1.88, 60 / 12);
  if (m >= bassBreak) return interpLog(m, [bassBreak, 48], [l48 * 1.03, l48]);
  return interpLog(m, [21, bassBreak - 1], [1.58, 1.24]);
}

export function stringTension(m: number, bassBreak: number): number {
  return m < bassBreak ? interp(m, [21, bassBreak - 1], [1400, 950]) : interp(m, [bassBreak, 108], [790, 680]);
}

/**
 * Stretch tuning from inharmonicity. Temperament octave A3–A4 is equal-tempered
 * on partial 1; upward notes put partial 1 on partial 2 of the octave below
 * (2:1), downward notes put partial 2k on partial k of the octave above, with
 * k = 1, 2, 3 moving into the bass (4:2 and 6:3 octaves), as aural tuners do.
 * Returns partial-1 frequencies (Hz), indexed by midi - 21.
 */
export function stretchTuning(Bs: Float64Array, stretch: number, a4 = 440): Float64Array {
  const f0 = new Float64Array(NUM_KEYS);
  const idx = (m: number) => m - KEY_LO;
  for (let m = 57; m <= 69; m++) {
    const B = Bs[idx(m)];
    f0[idx(m)] = midiToEtHz(m, a4) / Math.sqrt(1 + B);
  }
  for (let m = 70; m <= KEY_HI; m++) {
    const Bl = Bs[idx(m - 12)];
    const Bu = Bs[idx(m)];
    // partial 1 of m == partial 2 of m-12
    const target = 2 * f0[idx(m - 12)] * Math.sqrt(1 + 4 * Bl);
    f0[idx(m)] = target / Math.sqrt(1 + Bu);
  }
  for (let m = 56; m >= KEY_LO; m--) {
    const k = m >= 45 ? 1 : m >= 33 ? 2 : 3;
    const Bu = Bs[idx(m + 12)];
    const Bl = Bs[idx(m)];
    // partial 2k of m == partial k of m+12
    f0[idx(m)] = (f0[idx(m + 12)] * Math.sqrt(1 + k * k * Bu)) / (2 * Math.sqrt(1 + 4 * k * k * Bl));
  }
  const out = new Float64Array(NUM_KEYS);
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    const i = idx(m);
    const f1s = f0[i] * Math.sqrt(1 + Bs[i]);
    const et = midiToEtHz(m, a4);
    out[i] = et * Math.pow(f1s / et, stretch);
  }
  return out;
}

/** Hammer velocity (m/s) for MIDI velocity 1..127. */
export function hammerVelocity(vel: number, cal: Calibration): number {
  const { vMin, vMax, gamma } = cal.velocity;
  const x = Math.pow(clamp((vel - 1) / 126, 0, 1), gamma);
  return vMin * Math.pow(vMax / vMin, x);
}

/** Compute per-key specs for a design + params. Pure; safe to call off the audio thread. */
export function buildKeySpecs(
  design: PianoDesign,
  params: PianoParams,
  cal: Calibration = DEFAULT_CALIBRATION,
): KeySpec[] {
  const Bs = new Float64Array(NUM_KEYS);
  const Ls = new Float64Array(NUM_KEYS);
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    const ls = bp(design.lengthScale, m);
    const L = referenceLength(m, design.bassBreak) * ls;
    Ls[m - KEY_LO] = L;
    // B ∝ 1/L² for the same wire (Fletcher 1964); string stiffness control scales it.
    Bs[m - KEY_LO] = (referenceB(m, cal) / (ls * ls)) * params.stringStiffness;
  }
  const f1s = stretchTuning(Bs, design.stretch);
  const specs: KeySpec[] = [];
  for (let m = KEY_LO; m <= KEY_HI; m++) {
    const i = m - KEY_LO;
    const rand = mulberry32(design.seed * 1000 + m * 7919);
    const nStrings = m <= design.unichordTop ? 1 : m <= design.bichordTop ? 2 : 3;
    const wound = m < design.bassBreak;
    const L = Ls[i];
    const T = stringTension(m, design.bassBreak) * design.tensionScale;
    const B = Bs[i];
    const keyOffset = design.randomKeyDetune * gauss(rand);
    const f1 = f1s[i] * Math.pow(2, keyOffset / 1200);
    const f0 = f1 / Math.sqrt(1 + B);
    const Z = T / (2 * L * f0);
    const spread = params.unisonDetune;
    const pattern = nStrings === 3 ? [-0.5, 0.12, 0.5] : nStrings === 2 ? [-0.5, 0.5] : [0];
    const strings: StringSpec[] = [];
    for (let s = 0; s < nStrings; s++) {
      const c = pattern[s] * spread + design.randomDetune * gauss(rand);
      const fs1 = f1 * Math.pow(2, c / 1200);
      strings.push({
        f1: fs1,
        f0: fs1 / Math.sqrt(1 + B),
        B,
        Z,
        weight: clamp(1 + 0.05 * gauss(rand), 0.88, 1.12),
      });
    }
    const p = bp(cal.hammerP, m);
    const F1 = bpLog(cal.hammerF1mm, m) * design.hammerHardness * params.hammerHardness;
    const K = F1 / Math.pow(1e-3, p);
    let zoneW: [number, number, number];
    if (wound) zoneW = [1, 0, 0];
    else {
      const x = (m - design.bassBreak) / (KEY_HI - design.bassBreak);
      zoneW = [0, 1 - x, x];
    }
    const cL = 5050; // longitudinal wave speed in steel, m/s
    const longFreq = wound ? 16 * f1 : cL / (2 * L);
    const phantomGain = m < 50 ? 1 : m < 62 ? (62 - m) / 12 : 0;
    specs.push({
      midi: m,
      nStrings,
      wound,
      L,
      T,
      f1,
      f0,
      B,
      strings,
      beta: bp(cal.strike, m),
      hammer: {
        mass: bpLog(cal.hammerMass, m) * design.hammerMassScale,
        p,
        K,
        lambda: bp(cal.hammerLambda, m),
      },
      t60Low: bpLog(cal.t60Low, m) * design.decayScale * params.sustain,
      t60High: bpLog(cal.t60High, m) * design.decayScale * params.sustain,
      t60HighHz: cal.t60HighHz,
      bridgeY: bpLog(cal.bridgeY, m) * design.bridgeYScale,
      hasDamper: m <= design.damperTop,
      damperLow: bpLog(cal.damperLow, m),
      damperHigh: bpLog(cal.damperHigh, m),
      zoneW,
      longFreq,
      phantomGain,
      preparation: design.preparations.find((pr) => pr.midi === m) ?? null,
    });
  }
  return specs;
}
