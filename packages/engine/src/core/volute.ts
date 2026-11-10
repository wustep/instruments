// Volute: an instrument that does not exist. One key commands three choirs at once, and the three
// share one soundboard, so each is heard through the others.
//
// The instrument is a horizontal spiral frame (a volute, like a violin's scroll) about 2.7 m across.
// 49 steel strings run from a round bridge on a central spruce disc (the hub) out to the frame, the
// bass strings to its widest turn, the treble to its tightest. Around the frame stand 37 open flue
// pipes, and beyond them lie 37 tuned aluminium bars. A key (C2–C6) does three things:
//   · it presses its string onto a rosined band that runs under all the strings (as the wheel of a
//     hurdy-gurdy or Leonardo's viola organista does), so the string is bowed for as long as it is held;
//   · it opens the pallet of its pipe, which speaks on a regulated wind;
//   · it throws a mallet at its bar, as hard as the key was struck.
// The lowest octave has no pipes or bars of its own: it borrows those an octave above, as the basses
// of an orchestra are doubled at the octave.
//
// Strings: a digital waveguide in two parts either side of the band, the band acting at 9 % of the
// length from the bridge with the hyperbolic friction law of the bowed strings in this engine,
// μ(Δv) = μd + (μs−μd)·v0/(v0+|Δv|), solved every sample with the stick–slip hysteresis rule of
// McIntyre, Schumacher & Woodhouse (1983, JASA 74). Helmholtz motion is not imposed; it forms.
// Pipes: the jet-driven air column of this engine's flute (Fletcher & Rossing ch. 16–17; Verge; the
// delayed-jet structure of Cook), one fixed length per note as in an organ rank, on a wind whose
// pressure does not change (a reservoir): the pallet sets the flow.
// Bars: the transverse modes of a bar undercut to 1 : 4 : 10 as a vibraphone's are (Rossing, Science
// of Percussion Instruments, 2000, ch. 7), struck by a mallet whose contact lasts about a millisecond, shorter
// when thrown harder (Chaigne & Doutaut 1997, JASA 101, "Numerical simulations of xylophones. I").
// Hub: a free-edged circular spruce plate, its first eight modes at Leissa's ratios (Vibration of
// Plates, NASA SP-160, 1969; Fletcher & Rossing §3.6), then statistically dense ones. The strings
// drive it at the bridge; the bars and pipes shake it a little through the frame and the air.
// Halo: twelve sympathetic strings (C3–B3, never damped, never bowed) on the same bridge, as on a
// viola d'amore: whatever the hub does at one of their harmonics, they take up and give back.
//
// There are no recordings of a volute to fit. The parts are the cited physics; the levels between
// them, the voicing and the tuning corrections are measured on the model (scripts/tune-volute.ts,
// scripts/render-volute.ts; numbers in artifacts/round3/volute/NOTES.md).

import { Pump } from './pump.ts';
import { type ExciteTrace, type InstrumentCore } from './instrument.ts';
import type { KeySummary } from '../api/messages.ts';
import type { PianoEvent } from './piano-core.ts';
import { biquadBandpass, biquadHighpass } from './filters.ts';
import { BiquadChain, Limiter, Room } from './post.ts';
import { clamp, interp, mulberry32, playerCents, playerSeed } from './util.ts';
import voluteTuning from './volute-tuning.json';

export interface VoluteParams {
  /** which sustained choir the keys favour: 0 the strings alone … 1 the pipes alone */
  weave: number;
  /** the band's speed and the pallets' opening together, × nominal */
  swell: number;
  /** how hard the mallets are thrown, × the key's own velocity (0: the bars stay silent) */
  strike: number;
  /** the sympathetic strings' coupling to the bridge, × nominal (0: lifted off) */
  halo: number;
  room: number;
  volume: number;
}

/** MIDI controller numbers a hand on the stage sends (as CC 1 and CC 74 do from a keyboard) */
export const CC_VOLUTE_SWELL = 131;
export const CC_VOLUTE_WEAVE = 132;

export const VOLUTE_LO = 36;
export const VOLUTE_HI = 84;
/** the lowest pipe and bar (C3): notes below borrow the octave above */
export const VOLUTE_PIPE_LO = 48;
const N_NOTES = VOLUTE_HI - VOLUTE_LO + 1;
const VOICES = 10;
const HALO_N = 12;
const HALO_LO = 48;

const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const C_AIR = 343;

// ---------------------------------------------------------------- geometry (shared with the drawings)
/** the hub: a spruce disc of radius 0.30 m and 8 mm; its bridge is a circle of radius 0.26 m */
const HUB_R = 0.3;
const BRIDGE_R = 0.26;
/** the strings fill this share of the turn; the rest is the frame's closing step (its column) */
const TURN = 0.93;
export interface VoluteNote {
  midi: number;
  /** angle round the hub (rad): the bass string at 0, turning anticlockwise seen from above */
  angle: number;
  /** speaking length (m) and where it is hitched on the frame (radius from the hub's centre) */
  string: number;
  hitch: number;
  /** the pipe and bar this key commands (the bass octave's are an octave above) */
  pipeMidi: number;
  /** open pipe: length and diameter (m) */
  pipe: number;
  pipeD: number;
  /** bar: length (m) */
  bar: number;
}
/** Where everything is. Strings: 0.64 m at C2 to 0.16 m at C6, as the square root of the period
 *  (the bass strings are wound, as a harp's are). Pipes: open, c/2f less the end corrections
 *  (0.6 of the radius at the open end, about 1.4 at the mouth: Fletcher & Rossing §17.1),
 *  1.29 m at C3 to 0.16 m at C6; diameters halve every 16 semitones (Töpfer's scale), from 60 mm.
 *  Bars: length as 1/√f (a bar's frequency goes as thickness/length²), 0.40 m at C3. */
export function voluteGeometry(): { hubR: number; bridgeR: number; notes: VoluteNote[] } {
  const notes: VoluteNote[] = [];
  for (let m = VOLUTE_LO; m <= VOLUTE_HI; m++) {
    const f = et(m);
    const pm = m < VOLUTE_PIPE_LO ? m + 12 : m;
    const pf = et(pm);
    const pipeD = 0.06 * Math.pow(2, -(pm - VOLUTE_PIPE_LO) / 16);
    const string = 0.16 * Math.sqrt(et(VOLUTE_HI) / f);
    notes.push({
      midi: m,
      angle: (2 * Math.PI * TURN * (m - VOLUTE_LO)) / (N_NOTES - 1),
      string,
      hitch: BRIDGE_R + string,
      pipeMidi: pm,
      pipe: C_AIR / (2 * pf) - pipeD,
      pipeD,
      bar: 0.4 * Math.sqrt(et(VOLUTE_PIPE_LO) / pf),
    });
  }
  return { hubR: HUB_R, bridgeR: BRIDGE_R, notes };
}

// ---------------------------------------------------------------- voicing
/** friction of rosin on steel: the bowed strings' values (bowed.ts; Smith & Woodhouse 2000,
 *  J. Mech. Phys. Solids 48, "The tribology of rosin") */
const MU_S = 0.8;
const MU_D = 0.3;
const V0 = 0.2;
/** the band's place: this fraction of the string from the bridge (not 1/n for a small n: no
 *  harmonic has its node there) */
const BETA = 0.09;
export const VOLUTE_VOICE = {
  /** the band's surface speed (m/s) at the softest and the hardest key: a hurdy-gurdy's wheel runs
   *  at 0.1–0.5 m/s at the string (a 17 cm wheel at 0.2–1 turns a second) */
  bandLo: 0.05,
  bandHi: 0.3,
  /** the string's force on the band as a fraction of Schelleng's maximum (1953, JASA 25) */
  gripLo: 0.16,
  gripHi: 0.34,
  /** how long the key takes to seat the string on the band (s): a soft key eases it on */
  gripSlow: 0.11,
  gripFast: 0.025,
  /** the pipes: the flute's jet (flute.ts FLUTE_VOICE, fitted to the Iowa flute), with one fixed
   *  offset of the jet from the lip, as a voicer sets it */
  jetGain: 0.115,
  /** the low pipes' mouths are cut wider for their length, so that they speak in a dozen periods
   *  as the short ones do: the jet's gain rises to this multiple at C3, from C5 down */
  jetGainLow: 1.8,
  jetOffset: 0.62,
  vortex: 0.0045,
  jetRatio: 0.36,
  jetLp: 3.2,
  radFoot: 1.25,
  radDflow: 7.88,
  noise: 0.045,
  noiseOut: 0.9,
  driveLo: 0.16,
  driveHi: 0.8,
  /** the bars' partials over the fundamental, and how well each takes the blow and radiates, before
   *  the mallet's contact time filters it: with these a hard blow's 4th and 10th partials begin
   *  16 and 29 dB under the fundamental and a soft one's 35 dB and more (a vibraphone's tuned
   *  overtone starts 10–20 dB down: Rossing 2000 ch. 7) */
  barRatio: [1, 4, 10] as const,
  barShare: [1, 0.9, 1.2] as const,
  /** each bar has its own mallet, voiced to it: its contact lasts this share of the bar's period at
   *  the softest and the hardest blow (2.3 and 1.1 ms at C4; a felt-wound mallet on a metal bar
   *  stays about a millisecond, less when thrown harder: Chaigne & Doutaut 1997) */
  contactSoft: 0.6,
  contactHard: 0.28,
  /** levels of the three choirs and the halo in the mix: at mezzo-forte the strings' mean and every
   *  pipe (regulated: scripts/tune-volute.ts) are equally loud, a bar's blow peaks about where they
   *  hold, and a fortissimo chord of six keys peaks at 0.92 of full scale before the room */
  gString: 0.053,
  gPipe: 0.012,
  gBar: 0.18,
  gHalo: 1,
  /** the sympathetic strings' share of the bridge's motion: a string whose harmonic the hub holds
   *  builds to about the level of what drives it (0.007 × the 130 round trips its decay spans) */
  haloIn: 0.007,
};
/** The pipes are tuned a fraction of a hertz sharp of the strings, as an organ's voix céleste is
 *  tuned against its partner rank, so the two choirs beat slowly instead of locking at whatever
 *  phase they met (which would make one key's fundamental twice as strong and its neighbour's
 *  vanish). Hz: 0.35 at C3, a quarter of a hertz more each octave (4.6 ¢ at C3, 1.8 ¢ at C6). */
export const voluteCeleste = (pipeMidi: number): number => 0.35 + (0.25 * (pipeMidi - VOLUTE_PIPE_LO)) / 12;
/** pressure reflection at a pipe's mouth */
const R_MOUTH = 0.96;
/** the hub's free-plate modes over its lowest, the (2,0) at 60 Hz: 0.2413·cL·h/a² with a = 0.30 m,
 *  h = 8 mm, cL = 2800 m/s (spruce, across and along the grain averaged). Leissa 1969, table 2.5
 *  (ν = 0.33): (2,0) 1, (0,1) 1.73, (3,0) 2.33, (1,1) 3.91, (4,0) 4.11, (5,0) 6.30, (2,1) 6.71,
 *  (0,2) 7.34 */
const HUB_F0 = 60;
const HUB_RATIOS = [1, 1.73, 2.328, 3.91, 4.11, 6.3, 6.71, 7.34];
const HUB_MODES = 22;
/** loss factor of the spruce plate with its radiation: Q ≈ 30 (Wegst 2006, Am. J. Botany 93,
 *  "Wood for sound": spruce's loss coefficient 0.006–0.012 before radiation and the bridge's load) */
const HUB_Q = 30;

const NB = 2048;
const BB = 512;
const PB = 1024;
const JB = 512;
const TRACE = 2048;

class Voice {
  midi = -1;
  /** the key is down, or the pedal holds it */
  gate = false;
  key = false;
  vel = 0;
  on = 0;
  // ---- string
  sOn = false;
  nb = new Float64Array(NB);
  bb = new Float64Array(BB);
  sDb = 8;
  sDn = 80;
  sPole = 0.3;
  sLp = 0;
  sG = 0.999;
  sGfree = 0.999;
  sGdamp = 0.9;
  stick = true;
  slip = 1;
  grip = 0;
  gripT = 0;
  gripMax = 0.25;
  gripTau = 0.05;
  band = 0.15;
  sLevel = 0;
  // ---- pipe
  pOn = false;
  pMidi = 60;
  bore = new Float64Array(PB);
  jet = new Float64Array(JB);
  pD = 100;
  pJetD = 30;
  pLa = -0.3;
  pLp = 0;
  dcX = 0;
  dcY = 0;
  jLpA = 0.9;
  jLpY = 0;
  jk = 1;
  press = 0;
  pressT = 0;
  pTau = 0.04;
  pDrive = 0.5;
  pTurb = 0.05;
  chiff = 0;
  tongueAmp = 0;
  tongueN = 0;
  tongueLen = 1;
  boost = 0;
  boostTau = 0.06;
  pGain = 1;
  qPrev = 0;
  rPrev = 0;
  pLevel = 0;
  panP = 0;
  // ---- bar
  bOn = false;
  bc1 = new Float64Array(3);
  bc2 = new Float64Array(3);
  bd1 = new Float64Array(3);
  bd2 = new Float64Array(3);
  bg = new Float64Array(3);
  by1 = new Float64Array(3);
  by2 = new Float64Array(3);
  bDamped = false;
  pulseN = 0;
  pulseLen = 1;
  pulseAmp = 0;
  bLevel = 0;
  panB = 0;
  /** the mallet's last blow (frame), for the stage */
  struck = -1;
}

type Tuning = { fs: number[]; string: number[][]; pipe: number[][]; pipeLevel?: number[] };

export class VoluteCore implements InstrumentCore {
  readonly id = 'volute' as const;
  readonly fs: number;
  params: VoluteParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = VOICES;
  sympatheticAllowed = true;
  dry: boolean;
  readonly voices: Voice[] = [];
  private queue: { frame: number; ev: PianoEvent }[] = [];
  private rng: () => number;
  private tune = 1;
  /** CC 1 / 2 / 11 and CC 74, as factors and an override (−1: the knob's own value) */
  private ccSwell = 1;
  private ccWeave = -1;
  /** the weave as the choirs hear it, gliding (a time constant, not a step per block) */
  private weaveNow = 0.5;
  private swellNow = 1;
  // shared buses for one internal block
  private hubIn = new Float64Array(64);
  private pL = new Float64Array(64);
  private pR = new Float64Array(64);
  private bL = new Float64Array(64);
  private bR = new Float64Array(64);
  private nz = new Float64Array(64);
  private rosin = new Float64Array(64);
  private rosinLp = 0;
  private noiseBp = new Float64Array(5);
  private noiseSt = new Float64Array(2);
  // hub
  private hc1 = new Float64Array(HUB_MODES);
  private hc2 = new Float64Array(HUB_MODES);
  private hb = new Float64Array(HUB_MODES);
  private hy1 = new Float64Array(HUB_MODES);
  private hy2 = new Float64Array(HUB_MODES);
  private hwL = new Float64Array(HUB_MODES);
  private hwR = new Float64Array(HUB_MODES);
  private hx1 = 0;
  private hx2 = 0;
  private hubFreqs = new Float64Array(HUB_MODES);
  private hubAmp = new Float32Array(HUB_MODES);
  // halo
  private haloBuf: Float64Array[] = [];
  private haloD = new Float64Array(HALO_N);
  private haloG = new Float64Array(HALO_N);
  private haloPole = new Float64Array(HALO_N);
  private haloLp = new Float64Array(HALO_N);
  private haloLevel = new Float32Array(HALO_N);
  private haloMask = 0;
  private eq = new BiquadChain();
  private room: Room;
  private limiter: Limiter;
  private pump = new Pump(64);
  private oL = new Float64Array(64);
  private oR = new Float64Array(64);
  private dcA: number;
  // the scope: the focus voice's friction force and jet flow
  private focus: Voice | null = null;
  private trF = new Float32Array(TRACE);
  private trQ = new Float32Array(TRACE);
  private trI = 0;
  private gain = 1;
  private quiet = true;

  /** Measured corrections (scripts/tune-volute.ts): a bowed string runs a few cents flat of its
   *  free length (the stick–slip's corner rounding) and a saturated jet a little sharp of the
   *  small-signal phase condition. Cents by sample rate and note. */
  static tuning: Tuning = voluteTuning as Tuning;

  constructor(opts: { sampleRate: number; params?: Partial<VoluteParams>; dry?: boolean; player?: number }) {
    const fs = (this.fs = opts.sampleRate);
    this.dry = !!opts.dry;
    this.params = { weave: 0.5, swell: 1, strike: 1, halo: 1, room: 0.45, volume: 1, ...opts.params };
    this.weaveNow = this.params.weave;
    this.swellNow = this.params.swell;
    this.rng = mulberry32(playerSeed(47, opts.player));
    this.tune = Math.pow(2, playerCents(opts.player) / 1200);
    for (let i = 0; i < VOICES; i++) this.voices.push(new Voice());
    this.dcA = Math.exp((-2 * Math.PI * 38) / fs);
    const nb = biquadBandpass(Math.min(2200, 0.3 * fs), 0.7, fs);
    this.noiseBp.set(nb);
    // ---- the hub's modes: Leissa's first eight, then a dense series a third of an octave apart on
    // average, scattered (deterministically) as a real plate's are, to 3 kHz
    const rnd = mulberry32(7);
    let f = HUB_F0 * HUB_RATIOS[HUB_RATIOS.length - 1];
    for (let k = 0; k < HUB_MODES; k++) {
      if (k < HUB_RATIOS.length) this.hubFreqs[k] = HUB_F0 * HUB_RATIOS[k];
      else {
        f *= Math.pow(2, (0.7 + 0.6 * rnd()) / 3.4);
        this.hubFreqs[k] = f;
      }
      const fk = Math.min(this.hubFreqs[k], 0.42 * fs);
      const r = Math.exp((-Math.PI * fk) / (HUB_Q * fs));
      this.hc1[k] = 2 * r * Math.cos((2 * Math.PI * fk) / fs);
      this.hc2[k] = r * r;
      // a band-pass of unit gain at its peak
      this.hb[k] = 1 - r;
      // the two microphones see each mode's lobes differently
      this.hwL[k] = 0.62 + 0.38 * Math.cos(2.4 * k);
      this.hwR[k] = 0.62 + 0.38 * Math.cos(2.4 * k + 2.1);
    }
    // ---- the halo: twelve strings, each a loop of one period with a loss filter; 7 s at C3 to 4.8 s at B3
    let size = 1;
    while (size < fs / et(HALO_LO) + 8) size <<= 1;
    this.haloMask = size - 1;
    for (let j = 0; j < HALO_N; j++) {
      const fj = et(HALO_LO + j) * this.tune;
      const w = (2 * Math.PI * fj) / fs;
      const pole = Math.exp((-2 * Math.PI * Math.min(9000, 0.4 * fs)) / fs);
      const t60 = 7 * Math.pow(et(HALO_LO) / fj, 0.6);
      this.haloBuf.push(new Float64Array(size));
      this.haloPole[j] = pole;
      this.haloG[j] = Math.pow(10, -3 / (t60 * fj));
      this.haloD[j] = fs / fj - Math.atan2(pole * Math.sin(w), 1 - pole * Math.cos(w)) / w;
    }
    this.room = new Room(fs);
    this.limiter = new Limiter(fs);
    this.updatePost();
  }

  private updatePost(): void {
    this.eq.set([biquadHighpass(28, 0.7, this.fs)]);
    this.room.configure(this.params.room);
    this.gain = this.params.volume;
  }

  private correction(kind: 'string' | 'pipe', m: number): number {
    const t = VoluteCore.tuning;
    const rows = t[kind];
    if (!t.fs?.length || !rows?.length) return 1;
    const i = m - (kind === 'string' ? VOLUTE_LO : VOLUTE_PIPE_LO);
    const at = rows.map((r) => r[i] ?? 0);
    const c = t.fs.length > 1 ? interp(this.fs, t.fs, at) : at[0];
    return Math.pow(2, c / 1200);
  }

  /** the rank's regulation: each pipe's level trimmed (dB, measured) so the rank is even */
  private pipeLevel(pm: number): number {
    const db = VoluteCore.tuning.pipeLevel?.[pm - VOLUTE_PIPE_LO] ?? 0;
    return Math.pow(10, db / 20);
  }

  // ---------------------------------------------------------------- a key goes down
  private setString(v: Voice, m: number): void {
    const fs = this.fs;
    const f = et(m) * this.tune;
    const w = (2 * Math.PI * f) / fs;
    // the loop's losses: a one-pole whose corner rises with the note (a thin treble string is
    // brighter), and a gain per round trip for the decay of the fundamental: 4 s at C2, 1.5 s at C6
    const fc = Math.min(2600 + 9 * f, 9000, 0.4 * fs);
    v.sPole = Math.exp((-2 * Math.PI * fc) / fs);
    const t60 = 4 * Math.pow(et(VOLUTE_LO) / f, 0.35);
    v.sGfree = Math.pow(10, -3 / (t60 * f));
    // a felt damper: 0.12 s
    v.sGdamp = Math.pow(10, -3 / (0.12 * f));
    const D = (fs / f) * this.correction('string', m);
    v.sDb = Math.max(2, Math.round(BETA * D));
    v.sDn = Math.max(2, D - v.sDb - Math.atan2(v.sPole * Math.sin(w), 1 - v.sPole * Math.cos(w)) / w);
  }

  /** Bore delay that puts the small-signal loop phase at 0 for the pipe's pitch (flute.ts
   *  boreDelayFor): ωD = arg[H(ω)·(R − g·L(ω)·e^{−jωτ})]. */
  private boreDelay(f: number, tau: number, la: number, ja: number, g: number): number {
    const w = (2 * Math.PI * f) / this.fs;
    const phH = -Math.atan2(-la * Math.sin(w), 1 + la * Math.cos(w));
    const lr = 1 - ja * Math.cos(w);
    const li = ja * Math.sin(w);
    const lden = lr * lr + li * li;
    const Lr = ((1 - ja) * lr) / lden;
    const Li = (-(1 - ja) * li) / lden;
    const er = Math.cos(w * tau);
    const ei = -Math.sin(w * tau);
    const ph = phH + Math.atan2(-g * (Lr * ei + Li * er), R_MOUTH - g * (Lr * er - Li * ei));
    const nominal = this.fs / f;
    let best = nominal;
    let bestErr = Infinity;
    for (let n = 0; n < 4; n++) {
      const D = (ph + 2 * Math.PI * n) / w;
      if (D < 4) continue;
      const e = Math.abs(D - nominal);
      if (e < bestErr) {
        bestErr = e;
        best = D;
      }
    }
    return best - 0.5;
  }

  private setPipe(v: Voice, pm: number): void {
    const fs = this.fs;
    const V = VOLUTE_VOICE;
    const f = (et(pm) + voluteCeleste(pm)) * this.tune;
    v.pMidi = pm;
    // open-end radiation and wall losses, stronger for the short pipes (flute.ts)
    v.pLa = -0.28 - 0.14 * clamp((f - 260) / 800, 0, 1);
    v.jLpA = Math.exp((-2 * Math.PI * Math.min(V.jetLp * f, 0.45 * fs)) / fs);
    // the voicer cuts the mouth so the jet takes 0.36 of the period to cross it
    v.pJetD = clamp((V.jetRatio * fs) / f, 2, JB - 4);
    const jg = V.jetGain * (1 + (V.jetGainLow - 1) * clamp((72 - pm) / 24, 0, 1));
    v.pD = clamp(this.boreDelay(f, v.pJetD, v.pLa, v.jLpA, jg) * this.correction('pipe', pm), 4, PB - 4);
    const tOff = Math.tanh(V.jetOffset);
    v.jk = (2 * jg) / (1 - tOff * tOff);
    // the pallet's opening sharpens the jet for the pipe's first dozen periods
    v.boostTau = Math.max(0.06, 12 / f);
    v.pGain = this.pipeLevel(pm);
    v.pTurb = V.noise * (1 + (pm - VOLUTE_PIPE_LO) / 24);
    v.tongueLen = Math.max(4, Math.round((0.5 * fs) / f));
  }

  private setBar(v: Voice, bm: number, damped: boolean): void {
    const fs = this.fs;
    const f = et(bm) * this.tune;
    // an aluminium bar rings 7 s at G3, less as it shortens; its upper partials die 5 and 20 times
    // sooner (Rossing 2000 ch. 7: a vibraphone's tuned overtone is gone in about a second)
    const t1 = clamp(7 * Math.pow(196 / f, 0.7), 1, 9);
    for (let k = 0; k < 3; k++) {
      const fk = f * VOLUTE_VOICE.barRatio[k];
      const ok = fk < 0.45 * fs;
      const w = (2 * Math.PI * fk) / fs;
      const t60 = t1 / [1, 5, 20][k];
      const r = Math.exp(-Math.log(1000) / (t60 * fs));
      // the felt on the bar: 0.12 s
      const rd = Math.exp(-Math.log(1000) / (Math.min(t60, 0.12) * fs));
      v.bc1[k] = ok ? 2 * r * Math.cos(w) : 0;
      v.bc2[k] = ok ? r * r : 0;
      v.bd1[k] = ok ? 2 * rd * Math.cos(w) : 0;
      v.bd2[k] = ok ? rd * rd : 0;
      // a unit impulse gives the mode unit amplitude; × its share of the blow
      v.bg[k] = ok ? Math.sin(w) * VOLUTE_VOICE.barShare[k] : 0;
    }
    v.bDamped = damped;
  }

  private allocate(m: number): Voice {
    let free: Voice | null = null;
    let quiet: Voice | null = null;
    let oldest = this.voices[0];
    const n = Math.min(this.voices.length, Math.max(1, this.maxVoices));
    for (let i = 0; i < n; i++) {
      const v = this.voices[i];
      if (v.midi === m) return v;
      if (!v.sOn && !v.pOn && !v.bOn && !v.gate) free ??= v;
      else if (!v.gate && (!quiet || v.on < quiet.on)) quiet = v;
      if (v.on < oldest.on) oldest = v;
    }
    return free ?? quiet ?? oldest;
  }

  private clearVoice(v: Voice): void {
    v.nb.fill(0);
    v.bb.fill(0);
    v.bore.fill(0);
    v.jet.fill(0);
    v.by1.fill(0);
    v.by2.fill(0);
    v.sLp = v.pLp = v.dcX = v.dcY = v.jLpY = v.qPrev = v.rPrev = 0;
    v.grip = v.gripT = v.press = v.pressT = 0;
    v.sLevel = v.pLevel = v.bLevel = 0;
    v.sOn = v.pOn = v.bOn = false;
    v.pulseN = v.tongueN = 0;
    v.stick = true;
  }

  private noteOn(m0: number, velocity: number): void {
    const m = clamp(Math.round(m0), VOLUTE_LO, VOLUTE_HI);
    const V = VOLUTE_VOICE;
    const v = this.allocate(m);
    const again = v.midi === m && (v.sOn || v.pOn || v.bOn);
    if (!again) {
      this.clearVoice(v);
      const pm = m < VOLUTE_PIPE_LO ? m + 12 : m;
      this.setString(v, m);
      this.setPipe(v, pm);
      this.setBar(v, pm, false);
      // where each stands round the frame: the strings are heard through the hub; the pipes and
      // bars from their own places, the bass to the left
      const u = (m - VOLUTE_LO) / (N_NOTES - 1) - 0.5;
      v.panP = 0.7 * u;
      v.panB = -0.9 * u;
    }
    const x = clamp(velocity / 127, 0, 1);
    v.midi = m;
    v.gate = v.key = true;
    v.vel = velocity;
    v.on = this.frame;
    // string: the key seats it on the band
    v.sOn = true;
    v.sG = v.sGfree;
    v.band = V.bandLo + (V.bandHi - V.bandLo) * Math.pow(x, 1.3);
    v.gripMax = V.gripLo + (V.gripHi - V.gripLo) * x;
    v.gripT = 1;
    v.gripTau = V.gripSlow + (V.gripFast - V.gripSlow) * x;
    // pipe: the pallet opens
    v.pOn = true;
    v.pressT = 1;
    v.pTau = 0.05 - 0.03 * x;
    v.pDrive = V.driveLo + (V.driveHi - V.driveLo) * Math.pow(x, 1.4);
    if (!again || v.press < 0.2) {
      v.chiff = 0.6 + 0.8 * x;
      v.tongueAmp = 0.5 + 0.5 * x;
      v.tongueN = v.tongueLen;
      v.boost = 4 * (0.6 + 0.4 * x);
    }
    // bar: the mallet, a half-sine of force whose area is its momentum
    if (this.params.strike > 0) {
      v.bOn = true;
      if (v.bDamped) this.setBar(v, v.pMidi, false);
      const periods = V.contactSoft + (V.contactHard - V.contactSoft) * x;
      v.pulseLen = Math.max(2, Math.round((periods * this.fs) / (et(v.pMidi) * this.tune)));
      v.pulseN = v.pulseLen;
      v.pulseAmp = (Math.PI / (2 * v.pulseLen)) * Math.pow(x, 1.6) * Math.min(2, this.params.strike);
      v.struck = this.frame;
    }
    this.focus = v;
  }

  private release(v: Voice): void {
    v.gate = false;
    v.gripT = 0;
    v.sG = v.sGdamp;
    v.pressT = 0;
    if (v.bOn && !v.bDamped) {
      v.bc1.set(v.bd1);
      v.bc2.set(v.bd2);
      v.bDamped = true;
    }
  }

  schedule(ev: unknown, frame?: number): void {
    const f = frame === undefined ? this.frame : Math.max(this.frame, Math.floor(frame));
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].frame > f) i--;
    q.splice(i, 0, { frame: f, ev: ev as PianoEvent });
  }

  private apply(ev: PianoEvent): void {
    switch (ev.type) {
      case 'noteOn':
        if (ev.velocity <= 0) return this.apply({ type: 'noteOff', midi: ev.midi });
        this.noteOn(ev.midi, ev.velocity);
        break;
      case 'noteOff': {
        const m = clamp(Math.round(ev.midi), VOLUTE_LO, VOLUTE_HI);
        for (const v of this.voices)
          if (v.midi === m && v.key) {
            v.key = false;
            if (this.sustain < 0.5) this.release(v);
          }
        break;
      }
      case 'sustain':
        // the pedal holds the keys down (the band keeps bowing, the pallets stay open)
        this.sustain = clamp(ev.value, 0, 1);
        if (this.sustain < 0.5) for (const v of this.voices) if (v.gate && !v.key) this.release(v);
        break;
      case 'control':
        // mod wheel, breath and expression swell both sustained choirs; CC 74 (timbre) turns
        // from strings to pipes
        if (ev.cc === 1 || ev.cc === 2 || ev.cc === 11 || ev.cc === CC_VOLUTE_SWELL) this.ccSwell = 0.4 + 0.9 * clamp(ev.value, 0, 1);
        else if (ev.cc === 74 || ev.cc === CC_VOLUTE_WEAVE) this.ccWeave = clamp(ev.value, 0, 1);
        break;
      case 'allNotesOff':
        for (const v of this.voices) {
          v.key = false;
          if (v.gate) this.release(v);
        }
        break;
      default:
        break;
    }
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<VoluteParams>) };
    // the knob takes the weave back from a controller
    if ('weave' in p) this.ccWeave = -1;
    if (this.params.room !== old.room || this.params.volume !== old.volume) this.updatePost();
  }

  /** the keys held (by a finger or the pedal) */
  sounding(): number[] {
    const out: number[] = [];
    for (const v of this.voices) if (v.gate) out.push(v.midi);
    return out;
  }

  allSoundOff(): void {
    for (const v of this.voices) {
      this.clearVoice(v);
      v.gate = v.key = false;
      v.midi = -1;
    }
    for (const b of this.haloBuf) b.fill(0);
    this.haloLp.fill(0);
    this.haloLevel.fill(0);
    this.hy1.fill(0);
    this.hy2.fill(0);
    this.hx1 = this.hx2 = 0;
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  get activeVoiceCount(): number {
    let n = 0;
    for (const v of this.voices) if (v.sOn || v.pOn || v.bOn) n++;
    return n;
  }
  /** sympathetic strings ringing above −60 dB of a bowed string */
  get activeSympatheticCount(): number {
    let n = 0;
    for (let j = 0; j < HALO_N; j++) if (this.haloLevel[j] > 1e-3) n++;
    return n;
  }
  get modeFrequencies(): Float64Array {
    return this.hubFreqs;
  }
  get outputFrame(): number {
    return this.frame - this.pump.pending;
  }

  /** Internal blocks (≤ 64, cut at events) do not depend on `frames` (see Pump). */
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

  // ---------------------------------------------------------------- one string under the band
  private renderString(v: Voice, n: number, dt: number, share: number): void {
    v.grip += (v.gripT - v.grip) * (1 - Math.exp(-dt / (v.gripT > v.grip ? v.gripTau : 0.02)));
    if (v.gripT === 0 && v.grip < 1e-4) v.grip = 0;
    const vb = v.band * share;
    // the normal force as the velocity F/2Z, a fraction of Schelleng's maximum vb/(β(μs−μd))
    const a0 = vb > 1e-4 ? (v.grip * v.gripMax * vb) / (BETA * (MU_S - MU_D)) : 0;
    const nb = v.nb;
    const bb = v.bb;
    const Db = v.sDb;
    const Di = Math.floor(v.sDn);
    const fr = v.sDn - Di;
    const pole = v.sPole;
    const g = v.sG;
    const hub = this.hubIn;
    const rosin = this.rosin;
    const trace = this.focus === v;
    let lp = v.sLp;
    let stick = v.stick;
    let slip = v.slip;
    let peak = 0;
    const w0 = this.frame;
    for (let t = 0; t < n; t++) {
      const w = w0 + t;
      // back from the bridge (inverted, with the loop's losses) and from the far end (inverted)
      const xb = bb[(w - Db) & (BB - 1)];
      lp = (1 - pole) * xb + pole * lp;
      const rb = -g * lp;
      const rn = -(nb[(w - Di) & (NB - 1)] * (1 - fr) + nb[(w - Di - 1) & (NB - 1)] * fr);
      let phi = 0;
      if (a0 > 0) {
        // rosin softens and re-hardens under the sliding band: the friction is never quite a
        // function of the slip speed alone (Smith & Woodhouse 2000)
        const a = a0 * (1 + 0.05 * rosin[t]);
        const dh = vb - (rb + rn);
        if (stick && Math.abs(dh) <= MU_S * a) phi = dh;
        else {
          // slip: Δ + a·μ(Δ) = Δh on the sliding side (McIntyre, Schumacher & Woodhouse 1983)
          const sg = stick ? (dh >= 0 ? 1 : -1) : slip;
          const dhs = sg * dh;
          const B1 = V0 + a * MU_D - dhs;
          const disc = B1 * B1 - 4 * V0 * (a * MU_S - dhs);
          const root = disc >= 0 ? (-B1 + Math.sqrt(disc)) / 2 : -1;
          if (root > 0) {
            phi = sg * a * (MU_D + ((MU_S - MU_D) * V0) / (V0 + root));
            stick = false;
            slip = sg;
          } else if (Math.abs(dh) <= MU_S * a) {
            phi = dh;
            stick = true;
          } else {
            phi = sg * a * MU_D;
            stick = false;
            slip = sg;
          }
        }
      }
      nb[w & (NB - 1)] = rb + phi;
      bb[w & (BB - 1)] = rn + phi;
      // the string's force on the bridge
      const fb = xb - rb;
      hub[t] += fb;
      if (trace) this.trF[(this.trI + t) & (TRACE - 1)] = phi;
      const ab = fb < 0 ? -fb : fb;
      if (ab > peak) peak = ab;
    }
    v.sLp = lp;
    v.stick = stick;
    v.slip = slip;
    v.sLevel = Math.max(peak, v.sLevel * 0.9);
    if (v.gripT === 0 && v.grip === 0 && v.sLevel < 1e-7) {
      v.sOn = false;
      v.sLevel = 0;
      nb.fill(0);
      bb.fill(0);
      v.sLp = 0;
    }
  }

  // ---------------------------------------------------------------- one pipe (flute.ts, one fixed length)
  private renderPipe(v: Voice, n: number, dt: number, share: number): void {
    const V = VOLUTE_VOICE;
    const fs = this.fs;
    v.press += (v.pressT - v.press) * (1 - Math.exp(-dt / (v.pressT > v.press ? v.pTau : 0.035)));
    if (v.pressT === 0 && v.press < 1e-5) v.press = 0;
    const since = (this.frame - v.on) / fs;
    const u = Math.max(0, v.press * v.pDrive * share);
    const turb = v.pTurb * v.press * Math.min(1, share * 2);
    v.chiff *= Math.exp(-dt / 0.035);
    const chiff = 0.12 * v.chiff * u;
    const jk = v.jk * (1 + v.boost * Math.exp(-since / v.boostTau));
    const off = V.jetOffset;
    const tOff = Math.tanh(off);
    const bore = v.bore;
    const jet = v.jet;
    const Di = Math.floor(v.pD);
    const fr = v.pD - Di;
    const ji = Math.floor(v.pJetD);
    const jf = v.pJetD - ji;
    const la = v.pLa;
    const lb = 0.995 * (1 + la);
    const jA = v.jLpA;
    const dcA = this.dcA;
    const dqScale = fs / (2 * Math.PI * 1000);
    const nz = this.nz;
    const trace = this.focus === v;
    const gl = (0.5 - 0.5 * v.panP) * v.pGain;
    const gr = (0.5 + 0.5 * v.panP) * v.pGain;
    const pL = this.pL;
    const pR = this.pR;
    const hub = this.hubIn;
    let peak = 0;
    const w0 = this.frame;
    for (let t = 0; t < n; t++) {
      const w = w0 + t;
      const r = bore[(w - Di) & (PB - 1)] * (1 - fr) + bore[(w - Di - 1) & (PB - 1)] * fr;
      // the open end: the pressure wave returns inverted, less what it radiates
      v.pLp = -lb * r - la * v.pLp;
      const y = v.pLp - v.dcX + dcA * v.dcY;
      v.dcX = v.pLp;
      v.dcY = y;
      const noise = nz[t] * (turb + chiff);
      let tng = 0;
      if (v.tongueN > 0) {
        // the pallet's opening: the jet's front sweeps the lip once
        tng = v.tongueAmp * Math.sin((Math.PI * (v.tongueLen - v.tongueN)) / v.tongueLen) * Math.min(1, share * 2);
        v.tongueN--;
      }
      v.jLpY = (1 - jA) * (0.5 * y + noise + tng) + jA * v.jLpY;
      jet[w & (JB - 1)] = v.jLpY;
      const jd = jet[(w - ji) & (JB - 1)] * (1 - jf) + jet[(w - ji - 1) & (JB - 1)] * jf;
      // the jet split at the lip: a saturating flow law, the lip off the jet's centre
      const q = u * (Math.tanh((jk * jd) / (u + 0.06) + off) - tOff);
      bore[w & (PB - 1)] = q - (R_MOUTH / (1 + V.vortex * Math.abs(y))) * y;
      const dr = r - v.rPrev;
      v.rPrev = r;
      const dq = q - v.qPrev;
      v.qPrev = q;
      const out = dqScale * (V.radFoot * dr + V.radDflow * dq) + V.noiseOut * noise;
      pL[t] += gl * out;
      pR[t] += gr * out;
      // the pipe stands on the frame: a little of its sound reaches the bridge
      hub[t] += 0.02 * v.pGain * out;
      if (trace) this.trQ[(this.trI + t) & (TRACE - 1)] = q;
      const a = r < 0 ? -r : r;
      if (a > peak) peak = a;
    }
    v.pLevel = Math.max(peak, v.pLevel * 0.9);
    if (v.pressT === 0 && v.press === 0 && v.pLevel < 1e-7) {
      v.pOn = false;
      v.pLevel = 0;
      bore.fill(0);
      jet.fill(0);
      v.pLp = v.dcX = v.dcY = v.jLpY = v.qPrev = v.rPrev = 0;
    }
  }

  // ---------------------------------------------------------------- one bar
  private renderBar(v: Voice, n: number): void {
    const c1 = v.bc1;
    const c2 = v.bc2;
    const y1 = v.by1;
    const y2 = v.by2;
    const bg = v.bg;
    const gl = 0.5 - 0.5 * v.panB;
    const gr = 0.5 + 0.5 * v.panB;
    const bL = this.bL;
    const bR = this.bR;
    const hub = this.hubIn;
    let peak = 0;
    for (let t = 0; t < n; t++) {
      let x = 0;
      if (v.pulseN > 0) {
        x = v.pulseAmp * Math.sin((Math.PI * (v.pulseLen - v.pulseN + 0.5)) / v.pulseLen);
        v.pulseN--;
      }
      let s = 0;
      for (let k = 0; k < 3; k++) {
        const y = bg[k] * x + c1[k] * y1[k] - c2[k] * y2[k];
        y2[k] = y1[k];
        y1[k] = y;
        s += y;
      }
      bL[t] += gl * s;
      bR[t] += gr * s;
      // the bars' rail is part of the frame
      hub[t] += 0.6 * s;
      const a = s < 0 ? -s : s;
      if (a > peak) peak = a;
    }
    v.bLevel = Math.max(peak, v.bLevel * 0.9);
    if (v.pulseN === 0 && v.bLevel < 1e-7) {
      v.bOn = false;
      v.bLevel = 0;
      y1.fill(0);
      y2.fill(0);
    }
  }

  private render(n: number): void {
    const fs = this.fs;
    const dt = n / fs;
    const P = this.params;
    const V = VOLUTE_VOICE;
    // the weave and the swell glide (30 ms): a knob or a hand moving them does not step
    const k = 1 - Math.exp(-dt / 0.03);
    this.weaveNow += ((this.ccWeave >= 0 ? this.ccWeave : clamp(P.weave, 0, 1)) - this.weaveNow) * k;
    this.swellNow += (clamp(P.swell, 0, 2) * this.ccSwell - this.swellNow) * k;
    // each choir's share of the player's effort, at equal power: both whole in the middle, one alone
    // √2 at its end (the band runs faster, the pallets open wider), so the turn keeps the loudness
    const sShare = Math.min(2, Math.SQRT2 * Math.cos((this.weaveNow * Math.PI) / 2) * this.swellNow);
    const pShare = Math.min(2, Math.SQRT2 * Math.sin((this.weaveNow * Math.PI) / 2) * this.swellNow);
    const hub = this.hubIn;
    const pL = this.pL;
    const pR = this.pR;
    const bL = this.bL;
    const bR = this.bR;
    const nz = this.nz;
    const rosin = this.rosin;
    const bp = this.noiseBp;
    const ns = this.noiseSt;
    const rA = Math.exp((-2 * Math.PI * 1200) / fs);
    for (let t = 0; t < n; t++) {
      hub[t] = pL[t] = pR[t] = bL[t] = bR[t] = 0;
      const white = this.rng() * 2 - 1;
      const z = bp[0] * white + ns[0];
      ns[0] = bp[1] * white - bp[3] * z + ns[1];
      ns[1] = bp[2] * white - bp[4] * z;
      nz[t] = z;
      this.rosinLp = (1 - rA) * white + rA * this.rosinLp;
      rosin[t] = 4 * this.rosinLp;
    }
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];
      if (v.sOn) this.renderString(v, n, dt, sShare);
      if (v.pOn) this.renderPipe(v, n, dt, pShare);
      if (v.bOn) this.renderBar(v, n);
    }
    this.trI = (this.trI + n) & (TRACE - 1);
    // nothing sounds: the hub and the halo run down to exact silence (no denormals left ringing)
    let any = false;
    for (let i = 0; i < this.voices.length && !any; i++) any = this.voices[i].sOn || this.voices[i].pOn || this.voices[i].bOn;
    this.quiet = !any;
    // ---- the hub: the bridge's force through the plate's modes to two microphones, with the
    // strings' own sound above the modes
    const oL = this.oL;
    const oR = this.oR;
    const M = HUB_MODES;
    const c1 = this.hc1;
    const c2 = this.hc2;
    const hb = this.hb;
    const y1 = this.hy1;
    const y2 = this.hy2;
    const wL = this.hwL;
    const wR = this.hwR;
    let x1 = this.hx1;
    let x2 = this.hx2;
    const gS = V.gString;
    for (let t = 0; t < n; t++) {
      const x = hub[t];
      const d = x - x2;
      x2 = x1;
      x1 = x;
      let sl = 0;
      let sr = 0;
      for (let m = 0; m < M; m++) {
        const y = hb[m] * d + c1[m] * y1[m] - c2[m] * y2[m];
        y2[m] = y1[m];
        y1[m] = y;
        sl += wL[m] * y;
        sr += wR[m] * y;
      }
      oL[t] = gS * (0.4 * x + sl);
      oR[t] = gS * (0.4 * x + sr);
    }
    this.hx1 = x1;
    this.hx2 = x2;
    if (this.quiet) for (let m = 0; m < M; m++) if (Math.abs(y1[m]) < 1e-12 && Math.abs(y2[m]) < 1e-12) y1[m] = y2[m] = 0;
    // ---- the halo: the bridge moves the sympathetic strings; they give it back
    const halo = this.sympatheticAllowed ? clamp(P.halo, 0, 2) : 0;
    const eps = V.haloIn * halo;
    const mask = this.haloMask;
    const w0 = this.frame;
    const gH = gS * V.gHalo;
    for (let j = 0; j < HALO_N; j++) {
      if (this.haloLevel[j] === 0 && (eps === 0 || this.quiet)) continue;
      const buf = this.haloBuf[j];
      const Di = Math.floor(this.haloD[j]);
      const fr = this.haloD[j] - Di;
      const pole = this.haloPole[j];
      const g = this.haloG[j];
      let lp = this.haloLp[j];
      // (they lie in two ranks either side of the hub)
      const gl = gH * (j & 1 ? 0.3 : 0.7);
      const gr = gH * (j & 1 ? 0.7 : 0.3);
      let peak = 0;
      for (let t = 0; t < n; t++) {
        const w = w0 + t;
        const x = buf[(w - Di) & mask] * (1 - fr) + buf[(w - Di - 1) & mask] * fr;
        lp = (1 - pole) * x + pole * lp;
        const y = g * lp;
        buf[w & mask] = y + eps * hub[t];
        oL[t] += gl * y;
        oR[t] += gr * y;
        const a = y < 0 ? -y : y;
        if (a > peak) peak = a;
      }
      this.haloLp[j] = lp;
      this.haloLevel[j] = Math.max(peak, this.haloLevel[j] * 0.92);
      if (this.haloLevel[j] < 1e-9 && (eps === 0 || this.quiet)) {
        buf.fill(0);
        this.haloLp[j] = 0;
        this.haloLevel[j] = 0;
      }
    }
    const gP = V.gPipe;
    const gB = V.gBar;
    const g = this.gain;
    for (let t = 0; t < n; t++) {
      oL[t] = g * (oL[t] + gP * pL[t] + gB * bL[t]);
      oR[t] = g * (oR[t] + gP * pR[t] + gB * bR[t]);
    }
    this.eq.process(oL, oR, n);
    if (!this.dry) {
      this.room.process(oL, oR, n, 1, P.room * 0.7);
      this.limiter.process(oL, oR, n);
    }
    this.frame += n;
  }

  keySummary(): KeySummary[] {
    return voluteGeometry().notes.map((g) => ({
      midi: g.midi,
      f1: et(g.midi),
      B: 0,
      nStrings: 1,
      lengthM: g.string,
      hasDamper: true,
      preparation: g.midi < VOLUTE_PIPE_LO ? 'string; pipe and bar an octave above' : 'string, pipe and bar',
    }));
  }

  /** A string's displacement from the bridge (0) to the far end (1): the travelling velocity
   *  waves' difference is the slope, summed along the string. */
  private stringShape(v: Voice, points: number): Float32Array {
    const out = new Float32Array(points);
    const w = this.frame - 1;
    const Db = v.sDb;
    const Dn = v.sDn;
    const D = Db + Dn;
    let y = 0;
    let prev = 0;
    for (let p = 0; p < points; p++) {
      const x = (p / (points - 1)) * (D / 2);
      // towards the far end (+) and towards the bridge (−) at x half-samples from the bridge
      let up: number;
      let down: number;
      if (x < Db / 2) {
        const d = Db / 2 - x;
        down = v.bb[(w - Math.round(d)) & (BB - 1)];
        up = -v.bb[(w - Math.round(Db - d)) & (BB - 1)];
      } else {
        const d = x - Db / 2;
        up = v.nb[(w - Math.round(d)) & (NB - 1)];
        down = -v.nb[(w - Math.round(Dn - d)) & (NB - 1)];
      }
      const slope = down - up;
      if (p > 0) y += 0.5 * (slope + prev);
      prev = slope;
      out[p] = y;
    }
    // both ends are fixed: take out the line the rounding leaves
    const end = out[points - 1];
    for (let p = 0; p < points; p++) out[p] = (out[p] - (end * p) / (points - 1)) / points;
    return out;
  }

  /** A pipe's standing pressure from the mouth (0) to the open end (1) */
  private pipeShape(v: Voice, points: number): Float32Array {
    const out = new Float32Array(points);
    const w = this.frame - 1;
    const D = v.pD;
    for (let p = 0; p < points; p++) {
      const d = (p / (points - 1)) * (D / 2);
      out[p] = v.bore[(w - Math.round(d)) & (PB - 1)] - v.bore[(w - Math.round(D - d)) & (PB - 1)];
    }
    return out;
  }

  getVisual(points = 160): object {
    const sp = Math.min(64, points);
    const notes: { midi: number; held: boolean; string: Float32Array | null; sLevel: number; pipeMidi: number; pipe: Float32Array | null; pLevel: number; breath: number; bar: number; struck: number }[] = [];
    for (const v of this.voices) {
      if (!v.sOn && !v.pOn && !v.bOn) continue;
      notes.push({
        midi: v.midi,
        held: v.gate,
        string: v.sOn ? this.stringShape(v, sp) : null,
        sLevel: v.sLevel,
        pipeMidi: v.pMidi,
        pipe: v.pOn ? this.pipeShape(v, 32) : null,
        pLevel: v.pLevel,
        breath: v.press,
        bar: v.bLevel,
        // seconds since the mallet's blow
        struck: v.struck < 0 ? -1 : (this.frame - v.struck) / this.fs,
      });
    }
    // the hub's modes: each one's amplitude now
    for (let k = 0; k < HUB_MODES; k++) this.hubAmp[k] = Math.hypot(this.hy1[k], this.hy2[k]);
    const f = this.focus;
    const m = f && f.midi >= 0 ? f.midi : 60;
    const period = this.fs / et(m);
    const len = Math.min(TRACE, Math.max(64, Math.round(4 * period)));
    const tf = new Float32Array(len);
    const tq = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const j = (this.trI - len + i + TRACE) & (TRACE - 1);
      tf[i] = this.trF[j];
      tq[i] = this.trQ[j];
    }
    const excite: ExciteTrace = {
      title: 'Band and jet',
      unit: '',
      rate: this.fs,
      trace: tf,
      trace2: tq,
      trace2Label: 'flow the jet sends into the pipe',
      caption: 'The band’s friction on the last string (it sticks, then slips once a period: Helmholtz motion, as under a bow), and below it the flow the jet sends into that key’s pipe.',
      meta: `weave ${this.weaveNow.toFixed(2)} · swell ×${this.swellNow.toFixed(2)}`,
    };
    return {
      frame: this.frame,
      voices: this.activeVoiceCount,
      sympathetic: this.activeSympatheticCount,
      focus:
        f && f.midi >= 0
          ? { midi: f.midi, nStrings: 1, shapes: [f.sOn ? this.stringShape(f, points) : new Float32Array(points)], hammerAt: BETA, prepAt: -1, lengthM: 0.16 * Math.sqrt(et(VOLUTE_HI) / et(f.midi)), f1: et(f.midi), B: 0, damper: f.gate ? 0 : 1 }
          : null,
      strike: null,
      excite,
      modes: this.hubAmp.slice(),
      volute: { notes, halo: this.haloLevel.slice(), weave: this.weaveNow, swell: this.swellNow },
      sustain: this.sustain,
      soft: this.soft,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }
}
