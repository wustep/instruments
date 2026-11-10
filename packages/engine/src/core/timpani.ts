// Timpani (kettledrums): a set of four pedal drums, each a Mylar membrane stretched over a copper kettle and
// struck with a felt mallet. Nothing here is a string or a bore: the sound is the head's own modes.
//
// The head. An ideal circular membrane of radius a, tension T and surface density σ, fixed at the rim, has
// modes ψ_mn = J_m(j_mn r/a) cos mθ (m nodal diameters, n nodal circles counting the rim; j_mn the n-th zero of
// the Bessel function J_m) at ω = (j_mn/a)·√(T/σ): an inharmonic series (1 : 1.59 : 2.14 : 2.30 …). A kettledrum
// sounds a clear pitch because the air on both sides of the head loads it, and loads the low modes most
// (Rayleigh; Fletcher & Rossing 1998, "The Physics of Musical Instruments" §18.1–18.2; Rossing 1982, "The
// physics of kettledrums", Sci. Am. 247(5); Christian, Davis, Tubis, Anderson, Mills & Rossing 1984, "Effects
// of air loading on timpani membrane vibrations", JASA 76, 1336). The air next to a mode whose pattern has
// wavenumber k = j/a (subsonic: k is far above the sound's ω/c) moves with it as an evanescent layer of mass
// ≈ ρ/k on each side, so each mode carries an added mass μ_mn ∝ ρa/(σ j_mn) and
//     ω_mn² = (T/σ · k_mn² + κ_mn) / (1 + μ_mn).
// With μ₁₁ ≈ 2 the modes with nodal diameters only, (1,1) (2,1) (3,1) (4,1) (5,1), fall at 1 : 1.47 : 1.94 :
// 2.42 : 2.90 — the near-harmonic series the ear hears as a pitch (Rossing 1982 measured 1 : 1.50 : 1.98 : 2.44
// : 2.89; the VSCO 2 CE recordings this model is fitted to, 1 : 1.46–1.48 : 1.92–1.98 : 2.36–2.43 : 2.63–2.88).
// The simple ρ/k estimate gives μ₁₁ ≈ 0.8 for a 26″ Mylar head; the enclosed kettle air and the finite head
// add to it (Christian et al. computed it in full), so its scale is fitted. The note is the (1,1) mode's
// frequency, the "principal tone" (Rossing 1982).
//
// The kettle. The symmetric modes (m = 0) pump air in and out of the kettle: a closed volume V is a spring,
// p = −ρc²ΔV/V, adding to such a mode the stiffness κ₀ₙ = 4πρc²a²/(Vσ j₀ₙ²) (the force ∫p ψ dA with
// ΔV = q ∫ψ dA). That raises the (0,1) mode from 0.53 to about 0.8–0.9 of the (1,1), as measured. The kettle's
// own air resonances (above ~300 Hz) are left out.
//
// Losses. The same evanescent layer that loads a mode radiates a little from the head's edge: the far-field
// pressure of mode (m,n) at angle φ from the head's normal is ∝ ω² ∫ψ e^{−ik·x} dA, which for a Bessel mode is
// closed form (a Lommel integral: 2π a α J_m(βa) J_{m+1}(j)/(α² − β²), α = j/a, β = (ω/c) sin φ). Integrated
// over the half-space above the head (the kettle encloses the other side) it gives each mode's radiated power,
// so its radiation damping, with no free constant: the (0,1) mode radiates as a monopole and dies in a
// fraction of a second (the "thump"), the (1,1) as a dipole, ringing for seconds, the higher ones less and
// less (each nodal diameter another factor of ka). The head's internal and the air's viscous losses add a
// slowly rising floor (fitted). The same far-field weights at the listener (on the audience's side of the
// drum, opposite the player) mix the modes into the radiated sound, two directions for the two channels.
//
// The tension follows the stroke. A loud stroke stretches the head: its mean strain ½⟨|∇w|²⟩ raises the
// tension by Eh/(1−ν) times it (Mylar: E ≈ 4.9 GPa, h = 0.19 mm, ν ≈ 0.38), so every mode starts sharp and
// settles as the head calms (the membrane's Kirchhoff–Carrier term; Fletcher & Rossing §3.? for the string
// analogue, §18.4 for the drums' pitch glide).
//
// The mallet. A felt ball on a stick, a mass m_h hitting the head at the strike point with the dynamic's
// speed; the felt is a nonlinear spring with Hunt–Crossley loss, F = Kδ^p(1 + λ·dδ/dt) for compression δ > 0
// (felt: Stulov 1995 for piano hammers; for timpani mallets Rhaouti, Chaigne & Joly 1999, "Time-domain
// modeling and numerical simulation of a kettledrum", JASA 105, 3545). The head yields under it, the force
// drives every mode by its shape at the strike point (J_m(j_mn r₀/a)), and when the felt lets go the player's
// stick is away (no second bounce). Players strike about a quarter of the diameter in from the rim (r₀/a ≈
// 0.6–0.75), which leaves the (0,1) mode, large at the centre, little to do. Harder, the felt stiffens and the
// contact shortens: the stroke is brighter, not only louder.
//
// The set. Four pedal drums of the usual orchestral sizes (32″, 29″, 26″, 23″; American layout, the largest
// on the player's left), each with the range its pedal reaches; the compass C2–A3 (MIDI 36–57) as written
// and as it sounds. A note goes to a drum already tuned to it, or else to the drum whose pedal has least to
// travel among those not still ringing (cf. a timpanist's plan of tunings); a drum retuned is damped first
// (the player's fingers), and the drums struck alternately by two mallets. A note outside the compass is
// moved by octaves into it. The drums ring until damped (laissez vibrer, as timpani are written): a released
// key damps its drum only as far as `damp` says. The pitch wheel is the last drum's pedal (a pedal
// glissando), the modulation wheel (or `roll`) rolls a held note.
//
// Each mode is an exact two-pole resonator (impulse invariant), so frequencies and decays are the same at
// every sample rate; while the mallet is on the head the modes are stepped together with it sample by sample.

import { Pump } from './pump.ts';
import type { KeySummary } from '../api/messages.ts';
import { CC_DYNAMICS, DYN_TAU, type ExciteTrace, type InstrumentCore } from './instrument.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { biquadHighpass, biquadHighShelf, biquadPeaking } from './filters.ts';
import type { PianoEvent } from './piano-core.ts';
import { clamp, mulberry32, playerCents, playerSeed } from './util.ts';

export interface TimpaniParams {
  /** the felt's hardness, × the general mallet's (below 1 a soft "cartwheel" mallet, above 1 a staccato one) */
  mallet: number;
  /** where the head is struck: the fraction of the radius out from the centre (players: about 0.6–0.75) */
  spot: number;
  /** a released key: 0 the drum rings on (l.v.), 1 the player's fingers stop it at once */
  damp: number;
  /** a held key rolls: 0 single strokes, above 0 a roll (faster towards 1) */
  roll: number;
  room: number;
  volume: number;
  /** the set's tuning against A = 440 (semitones; the fit tunes each note to its recording's pitch) */
  detune?: number;
  /** orchestra mode: where it sits on the stage (post.ts Seat); none, the single instrument's place */
  seat?: Seat | null;
  /** fitting only (scripts/fit-timpani.ts): the voicing below, overridden */
  voice?: Partial<TimpaniVoice>;
}

/** The voicing: physical constants of the drums, mallet and listener (the start design: from the literature;
 *  the fitted values replace it in TIMPANI_VOICE). */
export interface TimpaniVoice {
  /** the (1,1) mode's added air mass for a 26″ head (× the head's own mass; ∝ the radius) */
  mu11: number;
  /** μ_mn ∝ (j₁₁/j_mn)^muExp (the evanescent layer's ρ/k: 1) */
  muExp: number;
  /** the kettle's volume, × a hemisphere of the head's radius */
  kettle: number;
  /** × the radiation damping computed from the head's far field (physically 1) */
  rad: number;
  /** the support's loss (1/s): only the m = 1 modes push a net moment on the rim, rocking the kettle on its
   *  struts and casters, and only the m = 0 modes a net force, lifting it; the others leave the rim still */
  rim1: number;
  rim0: number;
  /** damping floor (1/s, amplitude) and its rise with frequency: dFloor + dInt·(f/1 kHz)^dExp */
  dFloor: number;
  dInt: number;
  dExp: number;
  /** the listener's angle from the head's normal (rad), and the two channels' azimuths either side of the
   *  line from the strike point across the head (rad) */
  listen: number;
  spread: number;
  /** the listener's azimuth round the head from the strike point (rad): the audience, opposite the player, π;
   *  the recordings' microphones where they stood */
  azim: number;
  /** × the tension's rise with the head's strain (Mylar: 1) */
  stretch: number;
  /** each nodal diameter's radiation × this (dB): the baffled head's far field falls as (ka)^m; the real
   *  drum's edge and kettle radiate its higher orders more (fitted) */
  radM: number;
  /** the head's unresolved modes above the computed ones (a statistical band): its level (dB re the
   *  force) and the corner above which the mallet's force no longer reaches (Hz) */
  hiGain: number;
  hiFc: number;
  /** its decay (1/s): the dense modes up there radiate and lose fast */
  hiDecay: number;
  /** the mallet: its moving mass (kg), the felt's stiffness K (N/m^p), exponent p and Hunt–Crossley loss λ (s/m) */
  mass: number;
  felt: number;
  feltExp: number;
  hyst: number;
  /** the felt's thickness (m) over the mallet's core, and the core's Hertzian stiffness (N/m^1.5): a loud
   *  stroke bottoms the felt out on the core, a short hard spike on the long soft push */
  thick: number;
  core: number;
  /** the stroke's speed (m/s) at velocity 1 and 127, and the curve between (log-linear in velocity^vCurve) */
  vLo: number;
  vHi: number;
  vCurve: number;
  /** output colour: a presence peak (Hz, Q, dB) and a high shelf (Hz, dB) */
  f1: number;
  q1: number;
  g1: number;
  shelfF: number;
  shelfG: number;
  /** output gain (dB) */
  gainDb: number;
}

/** the voicing fitted to the VSCO 2 CE timpani (scripts/fit-timpani.ts, then scripts/polish-timpani.ts, on
 *  drums 1, 3 and 5; drums 2 and 4 held out for the judge): the start design (the literature's values, at
 *  9c9256f) was μ₁₁ 2, a 30 g mallet without a core, the radiation as computed, the listener at 60°; see
 *  artifacts/realistic-3d/final-symphony/timpani/NOTES.md */
export const TIMPANI_VOICE: TimpaniVoice = {
  mu11: 3.073,
  muExp: 0.798,
  kettle: 1.132,
  rad: 0.6663,
  rim1: 0.7345,
  rim0: 1.206,
  dFloor: 0.892,
  dInt: 0.05338,
  dExp: 2.21,
  listen: 1.194,
  spread: 0.03875,
  azim: Math.PI,
  stretch: 0.8062,
  radM: -1.876,
  hiGain: 35,
  hiFc: 3896,
  hiDecay: 25,
  mass: 0.01191,
  felt: 3e+06,
  feltExp: 1.933,
  hyst: 0.09306,
  thick: 0.0015,
  core: 9.97e+07,
  vLo: 0.2111,
  vHi: 4.598,
  vCurve: 0.7265,
  f1: 923.1,
  q1: 0.9946,
  g1: 11.88,
  shelfF: 5227,
  shelfG: 3.131,
  gainDb: -36.67,
};

/** the strike point the players use, fitted (a fraction of the radius from the centre: about a third of
 *  the radius in from the rim) */
export const TIMPANI_SPOT = 0.628;

/** the compass: C2–A3 (MIDI 36–57) */
export const TIMPANI_LO = 36;
export const TIMPANI_HI = 57;

export interface TimpaniDrum {
  /** the head's diameter (m) and its name in inches */
  d: number;
  inches: number;
  /** the pedal's range (MIDI) and the tuning it starts at */
  lo: number;
  hi: number;
  rest: number;
}
/** The usual set of four (Fletcher & Rossing §18.2: 81–58 cm; the makers' ranges, e.g. Adams and Ludwig
 *  pedal timpani: 32″ D2–A2 (C2 on a Dresden 32″), 29″ F2–C3, 26″ B♭2–F3, 23″ D3–A3), low to high, which is
 *  left to right for the player (American layout). They start tuned in fourths, D2 G2 C3 F3. */
export const TIMPANI_DRUMS: TimpaniDrum[] = [
  { d: 0.813, inches: 32, lo: 36, hi: 45, rest: 38 },
  { d: 0.737, inches: 29, lo: 41, hi: 48, rest: 43 },
  { d: 0.66, inches: 26, lo: 46, hi: 53, rest: 48 },
  { d: 0.584, inches: 23, lo: 50, hi: 57, rest: 53 },
];

// ---------------------------------------------------------------- Bessel functions

/** J_m(x) for integer m ≥ 0: Bessel's integral (1/2π)∫cos(mτ − x sin τ)dτ over a period, by the trapezoid
 *  rule on 96 points (exponentially accurate for a periodic analytic integrand: ~1e-12 for m + x < 80) */
export function besselJ(m: number, x: number): number {
  const N = 96;
  let s = 0;
  for (let i = 0; i < N; i++) {
    const t = (2 * Math.PI * i) / N;
    s += Math.cos(m * t - x * Math.sin(t));
  }
  return s / N;
}

/** J_m(x) by its power series (fast; for the far field's small arguments, x ≲ 25) */
function besselSeries(m: number, x: number): number {
  const h = 0.5 * x;
  let term = 1;
  for (let i = 1; i <= m; i++) term *= h / i;
  let s = term;
  const h2 = h * h;
  for (let k = 1; k < 60; k++) {
    term *= -h2 / (k * (k + m));
    s += term;
    if (Math.abs(term) < 1e-16 * Math.abs(s) && k > 2) break;
  }
  return s;
}

/** the zeros j_mn below J_MAX, m = 0 … (table[m][n−1]) */
const J_MAX = 34;
let ZEROS: number[][] | null = null;
export function besselZeros(): number[][] {
  if (ZEROS) return ZEROS;
  const out: number[][] = [];
  for (let m = 0; ; m++) {
    const zs: number[] = [];
    // J_m > 0 just above 0 and below its first zero (> m); successive zeros are more than π apart, so a
    // step of 1 brackets each one alone
    let x0 = m + 0.5;
    let f0 = besselJ(m, x0);
    while (x0 < J_MAX) {
      const x1 = x0 + 1;
      const f1 = besselJ(m, x1);
      if (f0 === 0 || f0 * f1 < 0) {
        // Illinois (regula falsi)
        let a = x0;
        let b = x1;
        let fa = f0;
        let fb = f1;
        let side = 0;
        let c = a;
        for (let it = 0; it < 60; it++) {
          c = (a * fb - b * fa) / (fb - fa);
          const fc = besselJ(m, c);
          if (Math.abs(fc) < 1e-14 || Math.abs(b - a) < 1e-12) break;
          if (fc * fb > 0) {
            b = c;
            fb = fc;
            if (side === -1) fa /= 2;
            side = -1;
          } else {
            a = c;
            fa = fc;
            if (side === 1) fb /= 2;
            side = 1;
          }
        }
        if (c < J_MAX) zs.push(c);
      }
      x0 = x1;
      f0 = f1;
    }
    if (!zs.length) break;
    out.push(zs);
  }
  ZEROS = out;
  return out;
}

// ---------------------------------------------------------------- one drum

const RHO = 1.2; // air, kg/m³
const C_AIR = 343; // m/s
/** the head: 0.19 mm Mylar (7.5 mil; ρ ≈ 1390 kg/m³): σ = 0.264 kg/m² (Fletcher & Rossing §18.1: 0.262);
 *  its in-plane stiffness Eh/(1 − ν), E ≈ 4.9 GPa, ν ≈ 0.38 */
const SIGMA = 0.264;
const EH = (4.9e9 * 1.9e-4) / (1 - 0.38);
/** modes per drum (the lowest by frequency, cos mθ only: the strike at θ = 0 cannot excite the sin mθ twins) */
const NMODE = 96;
/** the visual's modes per drum */
const NVIS = 14;
const TRACE = 1024;
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Drum {
  readonly spec: TimpaniDrum;
  readonly a: number;
  readonly n: number;
  /** per mode: m, j, k² (1/m²), 1 + μ, κ (1/s²), ∫ψ² dA (m²), the modal mass (kg) */
  readonly mm: Int32Array;
  readonly jj: Float64Array;
  readonly k2: Float64Array;
  readonly mu: Float64Array;
  readonly kap: Float64Array;
  readonly nrm: Float64Array;
  readonly mass: Float64Array;
  /** per mode, by tuning: the shape at the strike point, radiation damping (1/s), the far-field weights */
  readonly phi: Float64Array;
  readonly aRad: Float64Array;
  readonly sL: Float64Array;
  readonly sR: Float64Array;
  /** the resonators: y[n] = c1·y[n−1] − c2·y[n−2] + g·F[n−1]; out += w·y */
  readonly c1: Float64Array;
  readonly c2: Float64Array;
  readonly g: Float64Array;
  readonly wL: Float64Array;
  readonly wR: Float64Array;
  readonly y1: Float64Array;
  readonly y2: Float64Array;
  readonly w: Float64Array;
  /** damping (1/s) at the tuning (radiation, the floor, the internal losses), and with the fingers */
  readonly alpha0: Float64Array;
  readonly alpha: Float64Array;
  readonly r: Float64Array;
  /** the modes that fit under the sample rate's Nyquist (at this tuning) */
  live = 0;
  /** T/σ at the tuning (m²/s²), and the tuning (MIDI) */
  c2T = 0;
  note: number;
  /** the pedal's position as drawn: it travels to `note` */
  noteNow: number;
  /** the head's strain-stiffening (ΔT/T) and the pitch wheel's factor on T, and its target */
  eps = 0;
  bend = 1;
  bendTarget = 1;
  /** extra damping (1/s): the player's fingers */
  extra = 0;
  /** the coefficients' (eps, bend, extra) when last computed */
  private cEps = -1;
  private cBend = -1;
  private cExtra = -1;
  level = 0;
  peak = 0;
  /** frame of the last stroke and its velocity; the key that struck it (for its release) and whether held */
  struckAt = -1e12;
  vel = 0;
  key = -1;
  held = false;
  /** a roll in progress: the next stroke's frame */
  rollNext = -1;
  /** the unresolved modes' band: its envelope, its decay per sample, two noise filters (left, right: a
   *  high-pass at the last computed mode, a one-pole low-pass at the force's corner) and their noise */
  hiEnv = 0;
  hiR = 1;
  hiDecay = 8;
  readonly hb = new Float64Array(5);
  hiLp = 0;
  readonly hs = new Float64Array(8);
  hiRng: () => number;

  constructor(spec: TimpaniDrum, V: TimpaniVoice, fs: number, seed = 1) {
    this.spec = spec;
    this.hiRng = mulberry32(seed);
    this.a = spec.d / 2;
    const Z = besselZeros();
    const a = this.a;
    const muOf = (j: number) => V.mu11 * (a / 0.33) * Math.pow(Z[1][0] / j, V.muExp);
    // the lowest NMODE modes by their loaded frequency (κ, which depends on the tension, left out of the order)
    const all: { m: number; j: number; r: number }[] = [];
    for (let m = 0; m < Z.length; m++) for (const j of Z[m]) all.push({ m, j, r: j / Math.sqrt(1 + muOf(j)) });
    all.sort((x, y) => x.r - y.r);
    const sel = all.slice(0, NMODE);
    const n = (this.n = sel.length);
    this.mm = new Int32Array(n);
    this.jj = new Float64Array(n);
    this.k2 = new Float64Array(n);
    this.mu = new Float64Array(n);
    this.kap = new Float64Array(n);
    this.nrm = new Float64Array(n);
    this.mass = new Float64Array(n);
    this.phi = new Float64Array(n);
    this.aRad = new Float64Array(n);
    this.sL = new Float64Array(n);
    this.sR = new Float64Array(n);
    this.c1 = new Float64Array(n);
    this.c2 = new Float64Array(n);
    this.g = new Float64Array(n);
    this.wL = new Float64Array(n);
    this.wR = new Float64Array(n);
    this.y1 = new Float64Array(n);
    this.y2 = new Float64Array(n);
    this.w = new Float64Array(n);
    this.alpha0 = new Float64Array(n);
    this.alpha = new Float64Array(n);
    this.r = new Float64Array(n);
    const Vk = V.kettle * (2 / 3) * Math.PI * a * a * a;
    for (let i = 0; i < n; i++) {
      const { m, j } = sel[i];
      this.mm[i] = m;
      this.jj[i] = j;
      this.k2[i] = (j / a) ** 2;
      this.mu[i] = 1 + muOf(j);
      // ∫ψ² dA = π a² J_{m+1}(j)² (m = 0), half that for m ≥ 1
      const jn = besselJ(m + 1, j);
      this.nrm[i] = ((m === 0 ? 1 : 0.5) * Math.PI * a * a * jn * jn);
      this.mass[i] = SIGMA * this.mu[i] * this.nrm[i];
      this.kap[i] = m === 0 ? (4 * Math.PI * RHO * C_AIR * C_AIR * a * a) / (Vk * SIGMA * j * j) : 0;
    }
    this.note = this.noteNow = spec.rest;
    this.tune(spec.rest, V, fs, TIMPANI_SPOT);
  }

  /** the pedal set for MIDI note `m` (fractional): the tension, then every mode's radiation and weights */
  tune(m: number, V: TimpaniVoice, fs: number, spot: number): void {
    this.note = m;
    const a = this.a;
    // T/σ from the (1,1) mode at the note: ω₁₁²(1 + μ₁₁) = (T/σ)k₁₁² (no kettle term for m ≥ 1)
    let i11 = 0;
    for (let i = 0; i < this.n; i++)
      if (this.mm[i] === 1) {
        i11 = i;
        break;
      }
    const w11 = 2 * Math.PI * et(m);
    this.c2T = (w11 * w11 * this.mu[i11]) / this.k2[i11];
    const nyq = 0.45 * fs;
    let live = 0;
    // the far field: the listener at `listen` from the normal, the channels at azimuths π ∓ spread from the
    // strike point (across the head, on the audience's side)
    const sinL = Math.sin(V.listen);
    const thL = V.azim - V.spread;
    const thR = V.azim + V.spread;
    const NPH = 24;
    for (let i = 0; i < this.n; i++) {
      const mo = this.mm[i];
      const j = this.jj[i];
      const w2 = (this.c2T * this.k2[i] + this.kap[i]) / this.mu[i];
      const om = Math.sqrt(w2);
      if (om / (2 * Math.PI) < nyq) live = i + 1;
      const al = j / a;
      const jn1 = besselJ(mo + 1, j);
      // the far field's radial factor at sin φ: 2π a α J_m(βa) J_{m+1}(j) / (α² − β²), β = (ω/c) sin φ
      const S = (s: number) => {
        const b = (om / C_AIR) * s;
        return (2 * Math.PI * a * al * besselSeries(mo, b * a) * jn1) / (al * al - b * b);
      };
      // radiated power over the half-space above the head → damping α = ω²ρ ∫|S|² dΩ / (8π² c M)
      let I = 0;
      for (let k = 0; k < NPH; k++) {
        const ph = ((k + 0.5) / NPH) * (Math.PI / 2);
        const s = S(Math.sin(ph));
        I += s * s * Math.sin(ph);
      }
      I *= (Math.PI / 2 / NPH) * (mo === 0 ? 2 * Math.PI : Math.PI);
      this.aRad[i] = (w2 * RHO * I) / (8 * Math.PI * Math.PI * C_AIR * this.mass[i]);
      this.alpha0[i] = V.rad * this.aRad[i] + (mo === 1 ? V.rim1 : mo === 0 ? V.rim0 : 0) + V.dFloor + V.dInt * Math.pow(om / (2 * Math.PI) / 1000, V.dExp);
      const sl = S(sinL) * Math.pow(10, (V.radM * mo) / 20);
      // (the pressure at 1 m per unit of the mode's acceleration: ρ/2π times the far field)
      this.sL[i] = (RHO / (2 * Math.PI)) * sl * Math.cos(mo * thL);
      this.sR[i] = (RHO / (2 * Math.PI)) * sl * Math.cos(mo * thR);
    }
    this.live = live;
    // the band above the last computed mode: it decays as the damping law says there
    const fTop = Math.min(0.4 * fs, Math.sqrt((this.c2T * this.k2[live - 1] + this.kap[live - 1]) / this.mu[live - 1]) / (2 * Math.PI));
    this.hiDecay = V.hiDecay;
    this.hiR = Math.exp(-this.hiDecay / fs);
    const hp = biquadHighpass(fTop, 0.7, fs);
    for (let k = 0; k < 5; k++) this.hb[k] = hp[k];
    this.hiLp = 1 - Math.exp((-2 * Math.PI * Math.min(0.45 * fs, Math.max(fTop, V.hiFc))) / fs);
    this.strikeAt(spot);
    this.cExtra = -1;
  }

  /** the modes' shapes at the strike point (fraction `spot` of the radius out from the centre, θ = 0) */
  strikeAt(spot: number): void {
    for (let i = 0; i < this.n; i++) this.phi[i] = besselJ(this.mm[i], this.jj[i] * spot);
    this.cExtra = -1;
  }

  /** the head's displacement under the strike point now */
  under(): number {
    let w = 0;
    for (let i = 0; i < this.live; i++) w += this.phi[i] * this.y1[i];
    return w;
  }

  /** every resonator's coefficients for the tension now (eps, the wheel) and the damping now (the fingers) */
  coeffs(fs: number): void {
    const damp = this.extra !== this.cExtra;
    if (!damp && this.eps === this.cEps && this.bend === this.cBend) return;
    this.cEps = this.eps;
    this.cBend = this.bend;
    this.cExtra = this.extra;
    const dt = 1 / fs;
    const cT = this.c2T * this.bend * (1 + this.eps);
    for (let i = 0; i < this.live; i++) {
      if (damp) {
        this.alpha[i] = this.alpha0[i] + this.extra;
        this.r[i] = Math.exp(-this.alpha[i] * dt);
        if (i === 0) this.hiR = Math.exp(-(this.hiDecay + this.extra) * dt);
      }
      const al = this.alpha[i];
      const r = this.r[i];
      const w2 = (cT * this.k2[i] + this.kap[i]) / this.mu[i];
      const wd = Math.sqrt(Math.max(1e-6, w2 - al * al));
      const th = wd * dt;
      this.c1[i] = 2 * r * Math.cos(th);
      this.c2[i] = r * r;
      // impulse invariant: h(t) = e^{−αt} sin(ω_d t)/(M ω_d), sampled ×dt, driven by the force's share φ
      this.g[i] = ((dt * r * Math.sin(th)) / (this.mass[i] * wd)) * this.phi[i];
      // the radiated pressure is the mode's acceleration (−ω² y) through the far field
      this.wL[i] = -w2 * this.sL[i];
      this.wR[i] = -w2 * this.sR[i];
      this.w[i] = w2;
    }
  }

  /** the head's strain now: ½⟨|∇w|²⟩ over its area, from each mode's amplitude (∫|∇ψ|² = k²∫ψ²) */
  strain(): number {
    let s = 0;
    for (let i = 0; i < this.live; i++) {
      const c = 0.5 * this.c1[i];
      const y1 = this.y1[i];
      const y2 = this.y2[i];
      // the amplitude² of a two-pole oscillation from two successive samples
      const s2 = Math.max(1e-12, 1 - c * c);
      const A2 = (y1 * y1 + y2 * y2 - 2 * c * y1 * y2) / s2;
      s += this.k2[i] * this.nrm[i] * A2;
    }
    // (time-averaged: ½ of the amplitude², and the mean over the area)
    return (0.25 * s) / (Math.PI * this.a * this.a);
  }

  clear(): void {
    this.y1.fill(0);
    this.y2.fill(0);
    this.level = this.peak = 0;
    this.eps = 0;
    this.hiEnv = 0;
    this.hs.fill(0);
  }

  /** the unresolved modes' band over [t0, n): noise through its filters, at its envelope, which the
   *  mallet's force (`force`, at each sample, or none) drives by its own content above the last computed
   *  mode (a long soft stroke has little there; a short hard one much) */
  band(oL: Float64Array, oR: Float64Array, t0: number, n: number, kHi: number, force: Float64Array | null): void {
    if (this.hiEnv < 1e-12 && !force) return;
    const b = this.hb;
    const h = this.hs;
    const lp = this.hiLp;
    let e = this.hiEnv;
    for (let t = t0; t < n; t++) {
      if (force) {
        const f = force[t];
        const fh = b[0] * f + h[6];
        h[6] = b[1] * f - b[3] * fh + h[7];
        h[7] = b[2] * f - b[4] * fh;
        e += kHi * Math.abs(fh);
      }
      e *= this.hiR;
      // two noises (the channels apart), high-passed, then low-passed
      const uL = this.hiRng() * 2 - 1;
      const uR = this.hiRng() * 2 - 1;
      const yL = b[0] * uL + h[0];
      h[0] = b[1] * uL - b[3] * yL + h[1];
      h[1] = b[2] * uL - b[4] * yL;
      const yR = b[0] * uR + h[2];
      h[2] = b[1] * uR - b[3] * yR + h[3];
      h[3] = b[2] * uR - b[4] * yR;
      h[4] += lp * (yL - h[4]);
      h[5] += lp * (yR - h[5]);
      oL[t] += e * h[4];
      oR[t] += e * h[5];
    }
    this.hiEnv = e < 1e-14 ? 0 : e;
  }

  /** rung down to nothing (140 dB under its loudest) and no mallet on it */
  drumIdle(struck: boolean): boolean {
    return !struck && this.peak > 0 && this.level < 1e-7 * this.peak;
  }
}

// ---------------------------------------------------------------- the set

/** a mallet: the drum it is on (−1 none), its position and speed (m, m/s; into the head), the felt's force,
 *  its compression a sample ago, when the stroke began and whether the felt has touched yet */
interface Mallet {
  drum: number;
  x: number;
  v: number;
  F: number;
  prev: number;
  start: number;
  touched: boolean;
  /** the pictures: the drum it last struck, when, and how hard */
  shown: number;
  at: number;
  vel: number;
}

export class TimpaniCore implements InstrumentCore {
  readonly id = 'timpani' as const;
  readonly fs: number;
  params: TimpaniParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = 4;
  sympatheticAllowed = false;
  dry: boolean;
  private V: TimpaniVoice;
  private drums: Drum[];
  private queue: { frame: number; ev: PianoEvent | { type: 'control'; cc: number; value: number } }[] = [];
  private rng: () => number;
  /** the two mallets (left hand, right hand) */
  private mallets: Mallet[] = [0, 1].map((h) => ({ drum: -1, x: 0, v: 0, F: 0, prev: 0, start: 0, touched: false, shown: h + 1, at: -1e12, vel: 0 }));
  private nextHand = 0;
  /** the stroke the trace follows */
  private traced = -1;
  private last = 1;
  private tune = 0;
  private modWheel = 0;
  private dynTarget = 0;
  private dyn = 0;
  private eq = new BiquadChain();
  private room: Room;
  private limiter: Limiter;
  private pump = new Pump(64);
  private oL = new Float64Array(64);
  private oR = new Float64Array(64);
  private gain = 1;
  private trF = new Float32Array(TRACE);
  private trW = new Float32Array(TRACE);
  private trN = 0;
  private modeFreqs = new Float64Array(16);
  private force = new Float64Array(64);
  private player: number;

  constructor(opts: { sampleRate: number; params?: Partial<TimpaniParams>; dry?: boolean; player?: number }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.player = opts.player ?? 0;
    this.params = { mallet: 1, spot: TIMPANI_SPOT, damp: 0, roll: 0, room: 0.3, volume: 1, ...opts.params };
    this.V = { ...TIMPANI_VOICE, ...this.params.voice };
    this.rng = mulberry32(playerSeed(47, opts.player));
    this.tune = playerCents(opts.player) / 100;
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    this.drums = this.build();
    this.voiced();
    this.freqsOf(this.drums[this.last]);
  }

  private build(notes?: number[]): Drum[] {
    const spot = clamp(this.params.spot, 0.05, 0.95);
    return TIMPANI_DRUMS.map((spec, i) => {
      const d = new Drum(spec, this.V, this.fs, playerSeed(4700 + i, this.player));
      const m = notes ? notes[i] : spec.rest + this.off();
      if (m !== d.note || spot !== TIMPANI_SPOT) d.tune(m, this.V, this.fs, spot);
      d.noteNow = m;
      return d;
    });
  }

  private voiced(): void {
    const fs = this.fs;
    const V = this.V;
    this.eq.set([biquadHighpass(28, 0.7, fs), biquadPeaking(V.f1, V.q1, V.g1, fs), biquadHighShelf(Math.min(0.4 * fs, V.shelfF), V.shelfG, fs)]);
    this.room.configure(this.params.room, this.params.seat);
    this.gain = Math.pow(10, V.gainDb / 20) * this.params.volume;
  }

  private freqsOf(d: Drum): void {
    d.coeffs(this.fs);
    for (let k = 0; k < 16; k++) this.modeFreqs[k] = k < d.live ? Math.sqrt(d.w[k]) / (2 * Math.PI) : 0;
  }

  schedule(ev: unknown, frame?: number): void {
    const f = frame === undefined ? this.frame : Math.max(this.frame, Math.floor(frame));
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].frame > f) i--;
    q.splice(i, 0, { frame: f, ev: ev as PianoEvent });
  }

  /** the drum for note m: one tuned to it already, else the one whose pedal travels least among those in
   *  range and not still ringing (a fresh drum before a ringing one), the middle of its range preferred */
  private drumFor(m: number): number {
    const ds = this.drums;
    let best = -1;
    let bestCost = Infinity;
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i];
      if (m < d.spec.lo || m > d.spec.hi) continue;
      const tuned = Math.abs(d.note - (m + this.off())) < 0.01;
      const ringing = d.peak > 0 && d.level > 0.03 * d.peak;
      const cost = (tuned ? -100 : 0) + (ringing && !tuned ? 3 : 0) + 0.25 * Math.abs(d.note - this.off() - m) + 0.15 * Math.abs(m - (d.spec.lo + d.spec.hi) / 2);
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    }
    return best;
  }

  /** a stroke on drum di: the hand that takes it (alternating; after a pause, the hand on that side, the low
   *  drums on the left), its mallet set moving at the dynamic's speed from the head's surface */
  private strike(di: number, vel: number): void {
    const d = this.drums[di];
    const V = this.V;
    const v01 = clamp(vel, 1, 127) / 127;
    const speed = V.vLo * Math.pow(V.vHi / V.vLo, Math.pow(v01, V.vCurve));
    const other = this.mallets[this.nextHand ^ 1];
    let hand = (this.frame - other.at) / this.fs > 0.6 ? (di < 2 ? 0 : 1) : this.nextHand;
    // a mallet still on a head (a double stop): the other hand
    if (this.mallets[hand].drum >= 0 && this.mallets[hand ^ 1].drum < 0) hand ^= 1;
    // (and a drum under the other mallet still: that stroke is over)
    for (const mm of this.mallets) if (mm.drum === di) mm.drum = -1;
    const ml = this.mallets[hand];
    ml.drum = di;
    ml.x = d.under();
    ml.v = speed;
    ml.F = 0;
    ml.prev = 0;
    ml.start = this.frame;
    ml.touched = false;
    ml.shown = di;
    ml.at = this.frame;
    ml.vel = vel;
    this.nextHand = hand ^ 1;
    this.traced = hand;
    this.trN = 0;
    d.struckAt = this.frame;
    d.vel = vel;
    d.extra = 0;
    d.peak = Math.max(d.peak * 0.5, 1e-9);
    this.last = di;
    this.freqsOf(d);
  }

  private apply(ev: PianoEvent | { type: 'control'; cc: number; value: number }): void {
    switch (ev.type) {
      case 'noteOn': {
        if (ev.velocity <= 0) return this.apply({ type: 'noteOff', midi: ev.midi });
        let m = ev.midi;
        while (m < TIMPANI_LO) m += 12;
        while (m > TIMPANI_HI) m -= 12;
        const di = this.drumFor(m);
        if (di < 0) return;
        const d = this.drums[di];
        const target = m + this.off();
        if (Math.abs(d.note - target) > 0.01) {
          // retuned: the player has stopped it first
          for (const mm of this.mallets) if (mm.drum === di) mm.drum = -1;
          d.clear();
          d.tune(target, this.V, this.fs, clamp(this.params.spot, 0.05, 0.95));
        }
        d.key = ev.midi;
        d.held = true;
        d.rollNext = this.rolling() ? this.frame + this.rollGap() : -1;
        this.strike(di, ev.velocity);
        break;
      }
      case 'noteOff': {
        for (const d of this.drums)
          if (d.key === ev.midi && d.held) {
            d.held = false;
            d.rollNext = -1;
            // the fingers on the head (a released key, as far as `damp` says)
            if (this.params.damp > 0) d.extra = 25 * this.params.damp * this.params.damp;
          }
        break;
      }
      case 'control':
        if (ev.cc === 1) {
          this.modWheel = ev.value < 0 ? 0 : clamp(ev.value, 0, 1);
          for (const d of this.drums) if (d.held && d.rollNext < 0 && this.rolling()) d.rollNext = this.frame + this.rollGap();
        } else if (ev.cc === CC_DYNAMICS) this.dynTarget = clamp(ev.value, -64, 64);
        break;
      case 'bend':
        // the last drum's pedal (a glissando on the ringing head): T ∝ f²
        this.drums[this.last].bendTarget = Math.pow(2, clamp(ev.value, -12, 12) / 6);
        break;
      case 'allNotesOff':
        for (const d of this.drums) {
          d.held = false;
          d.rollNext = -1;
        }
        break;
      default:
        break;
    }
  }

  /** the player's intonation and the set's tuning (semitones) */
  private off(): number {
    return this.tune + (this.params.detune ?? 0);
  }

  private rolling(): boolean {
    return Math.max(this.params.roll, this.modWheel) > 0.02;
  }
  /** a roll's strokes: 8–16 a second as the roll deepens, each a little early or late (a player's hands) */
  private rollGap(): number {
    const r = Math.max(this.params.roll, this.modWheel);
    const hz = 8 + 8 * r;
    return Math.max(1, Math.round((this.fs / hz) * (1 + 0.12 * (this.rng() * 2 - 1))));
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<TimpaniParams>) };
    if (this.params.voice !== old.voice) {
      this.V = { ...TIMPANI_VOICE, ...this.params.voice };
      this.drums = this.build(this.drums.map((d) => d.note));
      for (const mm of this.mallets) mm.drum = -1;
      this.voiced();
    } else {
      if (this.params.spot !== old.spot) for (const d of this.drums) d.strikeAt(clamp(this.params.spot, 0.05, 0.95));
      if (this.params.room !== old.room || this.params.volume !== old.volume) this.voiced();
      else if (this.params.seat !== old.seat) this.room.configure(this.params.room, this.params.seat);
    }
  }

  /** the drums ringing (their notes), loudest first */
  sounding(): number[] {
    let out: number[] = [];
    const ls: number[] = [];
    for (const d of this.drums)
      if (d.peak > 0 && d.level > 0.02 * d.peak) {
        out.push(Math.round(d.note - this.off()));
        ls.push(d.level);
      }
    if (out.length > 1) out = out.map((m, i) => [m, ls[i]] as const).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    return out;
  }

  allSoundOff(): void {
    for (const d of this.drums) {
      d.clear();
      d.held = false;
      d.rollNext = -1;
      d.extra = 0;
    }
    for (const mm of this.mallets) mm.drum = -1;
    this.dyn = this.dynTarget = 0;
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  get activeVoiceCount(): number {
    let n = 0;
    for (const d of this.drums) if (d.peak > 0 && d.level > 1e-4 * d.peak) n++;
    return n;
  }
  get activeSympatheticCount(): number {
    return 0;
  }
  get modeFrequencies(): Float64Array {
    return this.modeFreqs;
  }

  /** Render `frames` samples into outL/outR. Internal blocks (≤ 64, cut at events and at a roll's strokes)
   *  do not depend on `frames` (see Pump). */
  process(outL: Float32Array | Float64Array, outR: Float32Array | Float64Array, frames: number): void {
    this.pump.pull(outL, outR, frames, (L, R) => {
      const q = this.queue;
      while (q.length && q[0].frame <= this.frame) this.apply(q.shift()!.ev);
      // a roll's next strokes are the core's own events: due ones strike, and a block ends at the next
      for (let i = 0; i < this.drums.length; i++) {
        const d = this.drums[i];
        if (d.rollNext >= 0 && d.rollNext <= this.frame) {
          const keep = d.vel;
          this.strike(i, clamp(keep * 0.72 + this.dyn, 1, 127));
          d.vel = keep;
          d.rollNext = this.frame + this.rollGap();
        }
      }
      let n = 64;
      if (q.length) n = Math.max(1, Math.min(n, q[0].frame - this.frame));
      for (const d of this.drums) if (d.rollNext >= 0) n = Math.max(1, Math.min(n, d.rollNext - this.frame));
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
    const fs = this.fs;
    const dt = n / fs;
    const V = this.V;
    const oL = this.oL;
    const oR = this.oR;
    for (let t = 0; t < n; t++) oL[t] = oR[t] = 0;
    if (this.dyn !== this.dynTarget) {
      this.dyn += (this.dynTarget - this.dyn) * (1 - Math.exp(-dt / DYN_TAU));
      if (Math.abs(this.dynTarget - this.dyn) < 1e-3) this.dyn = this.dynTarget;
    }
    const K = V.felt * this.params.mallet;
    const p = V.feltExp;
    // (a harder mallet: its felt stiffer and thinner over the core)
    const thick = V.thick / Math.sqrt(this.params.mallet);
    const Kc = V.core;
    const hy = V.hyst;
    const im = 1 / V.mass;
    const h = 1 / fs;
    const maxContact = Math.round(0.03 * fs);
    const kHi = Math.pow(10, V.hiGain / 20) / fs;
    const force = this.force;
    for (let di = 0; di < this.drums.length; di++) {
      const d = this.drums[di];
      const ml = this.mallets[0].drum === di ? this.mallets[0] : this.mallets[1].drum === di ? this.mallets[1] : null;
      if (!ml && d.peak === 0) continue;
      // the pedal (the wheel) glides; the head's strain sets its tension (time constants: the block's length
      // changes nothing)
      if (d.bend !== d.bendTarget) {
        d.bend += (d.bendTarget - d.bend) * (1 - Math.exp(-dt / 0.05));
        if (Math.abs(d.bendTarget - d.bend) < 1e-6) d.bend = d.bendTarget;
      }
      d.noteNow += (d.note - d.noteNow) * (1 - Math.exp(-dt / 0.08));
      if (V.stretch > 0) {
        const e = (V.stretch * EH * d.strain()) / (SIGMA * d.c2T);
        if (e < 1e-7) d.eps = 0;
        else if (Math.abs(e - d.eps) > 1e-6) d.eps = e;
      }
      d.coeffs(fs);
      const L = d.live;
      const c1 = d.c1;
      const c2 = d.c2;
      const g = d.g;
      const wL = d.wL;
      const wR = d.wR;
      const y1 = d.y1;
      const y2 = d.y2;
      const phi = d.phi;
      let peak = 0;
      let t0 = 0;
      if (ml) {
        // the mallet on the head: everything together, sample by sample
        let x = ml.x;
        let v = ml.v;
        let F = ml.F;
        let prev = ml.prev;
        const traced = this.mallets[this.traced] === ml;
        for (let t = 0; t < n; t++) force[t] = 0;
        for (; t0 < n; ) {
          let w = 0;
          let sl = 0;
          let sr = 0;
          for (let i = 0; i < L; i++) {
            const y = c1[i] * y1[i] - c2[i] * y2[i] + g[i] * F;
            y2[i] = y1[i];
            y1[i] = y;
            w += phi[i] * y;
            sl += wL[i] * y;
            sr += wR[i] * y;
          }
          oL[t0] += sl;
          oR[t0] += sr;
          const a = Math.abs(sl) + Math.abs(sr);
          if (a > peak) peak = a;
          // the felt: compression δ = mallet − the head under it (Hunt–Crossley: its loss grows with δ^p)
          const dlt = x - w;
          if (dlt > 0) {
            const rate = (dlt - prev) * fs;
            const c = dlt - thick;
            F = (K * Math.pow(dlt, p) + (c > 0 ? Kc * c * Math.sqrt(c) : 0)) * Math.max(0, 1 + hy * rate);
            ml.touched = true;
          } else F = 0;
          prev = dlt;
          force[t0] = F;
          v -= F * im * h;
          x += v * h;
          if (traced && this.trN < TRACE) {
            this.trF[this.trN] = F;
            this.trW[this.trN] = w;
            this.trN++;
          }
          t0++;
          // let go: the felt has left the head and the mallet is on its way back up (or 2 mm clear of it:
          // the stick is away), or a stroke too long; a head that ran away from a mallet still coming down
          // meets it again (a hard felt's double touch)
          if ((ml.touched && F === 0 && (v < 0 || dlt < -0.002)) || this.frame + t0 - ml.start > maxContact) {
            ml.drum = -1;
            F = 0;
            break;
          }
        }
        ml.x = x;
        ml.v = v;
        ml.F = F;
        ml.prev = prev;
        d.band(oL, oR, 0, n, kHi, force);
      } else d.band(oL, oR, 0, n, kHi, null);
      if (t0 < n) {
        // free: each mode on its own (the mode loop outside, the samples inside)
        for (let i = 0; i < L; i++) {
          const a1 = c1[i];
          const a2 = c2[i];
          const gl = wL[i];
          const gr = wR[i];
          let u1 = y1[i];
          let u2 = y2[i];
          for (let t = t0; t < n; t++) {
            const y = a1 * u1 - a2 * u2;
            u2 = u1;
            u1 = y;
            oL[t] += gl * y;
            oR[t] += gr * y;
          }
          y1[i] = u1;
          y2[i] = u2;
        }
        // (the level: this drum's share, measured on its own modes' sum is costly; the head's motion under the
        // strike point stands in, scaled by the mode's radiation)
        for (let t = t0; t < n; t++) {
          const a = Math.abs(oL[t]) + Math.abs(oR[t]);
          if (a > peak) peak = a;
        }
      }
      d.level = Math.max(peak, d.level * Math.exp(-dt / 0.05));
      if (d.level > d.peak) d.peak = d.level;
      // silent: stop computing it
      if (d.drumIdle(ml !== null)) {
        d.clear();
        d.extra = 0;
      }
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

  /** which drum plays note m with the drums at rest (for the key list): the one with m nearest its middle */
  static restDrum(m: number): number {
    let best = 0;
    let bc = Infinity;
    TIMPANI_DRUMS.forEach((d, i) => {
      if (m < d.lo || m > d.hi) return;
      const c = Math.abs(m - (d.lo + d.hi) / 2);
      if (c < bc) {
        bc = c;
        best = i;
      }
    });
    return best;
  }

  keySummary(): KeySummary[] {
    const out: KeySummary[] = [];
    for (let m = TIMPANI_LO; m <= TIMPANI_HI; m++) {
      const d = TIMPANI_DRUMS[TimpaniCore.restDrum(m)];
      out.push({ midi: m, f1: et(m), B: 0, nStrings: 1, lengthM: d.d, hasDamper: false, preparation: `${d.inches}″ drum` });
    }
    return out;
  }

  getVisual(points = 160): object {
    const d = this.drums[this.last];
    // the head across its diameter through the strike point (θ = 0 → π), from its first modes
    const shape = new Float32Array(points);
    const nv = Math.min(d.live, NVIS);
    for (let k = 0; k < points; k++) {
      const u = (k / (points - 1)) * 2 - 1;
      const r = Math.abs(u);
      let s = 0;
      for (let i = 0; i < nv; i++) s += d.y1[i] * besselSeries(d.mm[i], d.jj[i] * r) * (u < 0 && d.mm[i] % 2 ? -1 : 1);
      shape[k] = s;
    }
    const len = Math.max(16, Math.min(this.trN, TRACE));
    const excite: ExciteTrace = {
      title: 'Mallet',
      unit: 'N',
      rate: this.fs,
      trace: this.trF.slice(0, len),
      trace2: this.trW.slice(0, len),
      trace2Label: 'the head under the mallet',
      caption: 'The felt’s force on the head (top) through the last stroke, and the head giving way under it (bottom).',
      meta: `${d.spec.inches}″ drum`,
    };
    const modes = new Float32Array(16);
    for (let k = 0; k < Math.min(16, d.live); k++) {
      const c = 0.5 * d.c1[k];
      const A2 = (d.y1[k] ** 2 + d.y2[k] ** 2 - 2 * c * d.y1[k] * d.y2[k]) / Math.max(1e-12, 1 - c * c);
      modes[k] = Math.sqrt(Math.max(0, A2));
    }
    const drums = this.drums.map((x) => {
      const head = new Float32Array(3 * NVIS);
      for (let i = 0; i < NVIS && i < x.live; i++) {
        head[3 * i] = x.mm[i];
        head[3 * i + 1] = x.jj[i];
        head[3 * i + 2] = x.y1[i];
      }
      return {
        d: x.spec.d,
        inches: x.spec.inches,
        lo: x.spec.lo,
        hi: x.spec.hi,
        note: x.note - this.off(),
        pedal: clamp((x.noteNow - this.off() - x.spec.lo) / (x.spec.hi - x.spec.lo), 0, 1),
        level: x.peak > 0 ? x.level : 0,
        ago: (this.frame - x.struckAt) / this.fs,
        vel: x.vel,
        head,
      };
    });
    const hands = this.mallets.map((m) => ({ drum: m.shown, ago: (this.frame - m.at) / this.fs, vel: m.vel, on: m.drum >= 0 }));
    return {
      frame: this.frame,
      voices: this.activeVoiceCount,
      sympathetic: 0,
      focus: {
        midi: Math.round(d.note - this.off()),
        nStrings: 1,
        shapes: [shape],
        hammerAt: 0.5 - 0.5 * this.params.spot,
        prepAt: -1,
        lengthM: d.spec.d,
        f1: et(d.note),
        B: 0,
        damper: 0,
      },
      strike: null,
      excite,
      modes,
      timpani: { drums, hands, spot: this.params.spot, last: this.last },
      sustain: 0,
      soft: 0,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }
}
