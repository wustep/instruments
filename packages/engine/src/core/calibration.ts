// Register-dependent model constants. Values start from the literature (see
// docs/RESEARCH.md) and are refined by the calibration rounds in
// docs/CALIBRATION.md against analysis of the Iowa MIS Steinway B recordings.
// Arrays are breakpoints over MIDI note number, interpolated (log-domain where
// the quantity spans decades).

import fitted from './calibration-fit.json';

export interface Breakpoints {
  midi: number[];
  val: number[];
}

export interface Calibration {
  /** Inharmonicity, two-asymptote model (Rigaud et al. 2013):
   *  B(m) = bT·exp(sT·(m-60)) + bB·exp(-sB·(m-21)) */
  B: { bT: number; sT: number; bB: number; sB: number };
  /** Late ("aftersound") T60 of partial 1, seconds — intrinsic string loss. */
  t60Low: Breakpoints;
  /** Late T60 at `t60HighHz`, seconds (frequency-dependent loss). */
  t60High: Breakpoints;
  t60HighHz: number;
  /** Local bridge admittance (s/kg); sets prompt decay and unison coupling. */
  bridgeY: Breakpoints;
  /** Hammer: effective mass (kg), felt exponent p, force at 1 mm compression (N),
   *  Hunt–Crossley hysteresis λ (s/m), strike position (fraction of length). */
  hammerMass: Breakpoints;
  hammerP: Breakpoints;
  hammerF1mm: Breakpoints;
  hammerLambda: Breakpoints;
  strike: Breakpoints;
  /** Hammer velocity (m/s) range mapped from MIDI velocity 1..127 */
  velocity: { vMin: number; vMax: number; gamma: number };
  /** Regulation/voicing: per-register hammer velocity trim, dB (evens out the scale). */
  voicing: Breakpoints;
  /** Damped T60 at partial 1 and at 2 kHz (s). */
  damperLow: Breakpoints;
  damperHigh: Breakpoints;
  /** Soundboard modal mass scale (kg) and loss factor; zoneCoupling scales the mode
   *  shapes at the bass bridge, low-treble and high-treble zones. */
  board: { modalMass: number; lossFactor: number; lossFactorHigh: number; zoneCoupling?: [number, number, number] };
  /** Mobility (s/kg) converting bridge force to radiated high-frequency board velocity. */
  hfMobility: number;
  /** Output equalisation: radiation + microphone response, fitted to reference
   *  long-term spectra. [freq Hz, gain dB, Q] peaking sections. */
  eq: [number, number, number][];
  /** Balance between modal (low/mid) and high-frequency board radiation paths. */
  hfGain: number;
  /** Crossover (Hz) below which the resistive high-frequency board path is removed. */
  hfCross: number;
  /** Longitudinal / phantom partial coupling strength (bass). */
  phantom: number;
  /** Radiation tilt: +6 dB/oct between these corner frequencies (Hz). */
  tilt: [number, number];
  /** Output gain from board velocity (m/s) to full scale. */
  outputGain: number;
}

/** Literature starting point; calibration-fit.json (written by scripts/calibrate.ts --fit) overrides it. */
export const BASE_CALIBRATION: Calibration = {
  B: { bT: 3.14e-4, sT: 0.082, bB: 2.07e-4, sB: 0.045 },
  t60Low: { midi: [21, 36, 48, 60, 72, 84, 96, 108], val: [18, 20, 20, 18, 11, 5.5, 2.4, 0.9] },
  t60High: { midi: [21, 48, 60, 72, 84, 96, 108], val: [1.6, 1.4, 1.3, 1.1, 0.9, 0.6, 0.35] },
  t60HighHz: 3000,
  bridgeY: { midi: [21, 45, 46, 60, 84, 108], val: [4.0e-4, 3.0e-4, 3.2e-4, 2.6e-4, 2.0e-4, 1.6e-4] },
  hammerMass: { midi: [21, 60, 108], val: [0.0110, 0.0080, 0.0050] },
  hammerP: { midi: [21, 45, 69, 93, 108], val: [2.3, 2.45, 2.6, 2.85, 3.1] },
  hammerF1mm: { midi: [21, 60, 84, 108], val: [18, 34, 60, 140] },
  hammerLambda: { midi: [21, 108], val: [0.35, 0.25] },
  strike: { midi: [21, 60, 84, 108], val: [0.120, 0.120, 0.095, 0.065] },
  velocity: { vMin: 0.35, vMax: 5.6, gamma: 1.0 },
  voicing: { midi: [21, 33, 45, 57, 69, 81, 93, 108], val: [0, 0, 0, 0, 0, 0, 0, 0] },
  damperLow: { midi: [21, 45, 60, 88], val: [0.9, 0.45, 0.3, 0.18] },
  damperHigh: { midi: [21, 60, 88], val: [0.18, 0.1, 0.07] },
  board: { modalMass: 40, lossFactor: 0.02, lossFactorHigh: 0.035, zoneCoupling: [0.7, 1, 0.7] },
  eq: [],
  hfGain: 1.0,
  hfMobility: 2.5e-4,
  hfCross: 700,
  phantom: 1.0,
  tilt: [35, 900],
  outputGain: 160,
};

export const DEFAULT_CALIBRATION: Calibration = { ...BASE_CALIBRATION, ...(fitted as Partial<Calibration>) };
