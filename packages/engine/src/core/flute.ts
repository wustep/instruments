// Flute: a jet-driven air column (Fletcher & Rossing ch. 16; Verge; the delayed-
// jet structure of Cook's STK flute, re-parameterised physically).
//
// The bore is a waveguide holding the round trip of pressure waves between the
// embouchure and the open foot, with a radiation/wall-loss filter. The air jet
// from the lips is deflected by the acoustic flow at the embouchure hole; the
// deflection travels to the edge with the convection delay τj = lj / (0.45·Uj),
// Uj = √(2p/ρ), where it splits the jet in or out of the pipe through a
// saturating (tanh) flow law. The ratio of τj to the period selects the pipe
// mode: blowing harder shortens τj, raising pitch slightly, brightening the tone
// and eventually overblowing to the next register, as on a real flute. Notes
// above C5 are fingered as overblown 2nd (octave) and 3rd (twelfth) modes; a
// fingering that goes up a register replaces the tube (FINGER), and the notes
// fingered with a vent hole have one (VENT). Turbulence noise scales with jet speed.

import { Pump } from './pump.ts';
import { MonoKeys, quickness, quickRise, Tongue } from './mono.ts';
import { CC_DYNAMICS, DYN_TAU, type ExciteTrace, type InstrumentCore } from './instrument.ts';
import type { KeySummary } from '../api/messages.ts';
import type { PianoEvent } from './piano-core.ts';
import { biquadBandpass, biquadHighpass, biquadPeaking, biquadHighShelf } from './filters.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { clamp, interp, mulberry32, playerCents, playerSeed, playerVibrato } from './util.ts';
import fluteTuning from './flute-tuning.json';

export interface FluteParams {
  /** blowing pressure scale (1 = nominal for each register) */
  breath: number;
  /** lip-to-edge distance scale: <1 shortens the jet delay (sharper, brighter, easier overblow) */
  embouchure: number;
  /** turbulence noise amount */
  noise: number;
  /** breath vibrato depth (fraction of pressure) */
  vibrato: number;
  room: number;
  volume: number;
  /** orchestra mode: where it sits on the stage (post.ts Seat); none, the single instrument's place */
  seat?: Seat | null;
}

const RHO = 1.2;
const C_AIR = 343;
const BUF = 1 << 13;
const TRACE = 2048;
/** pressure reflection at the embouchure hole (open end) */
const R_EMB = 0.96;

/** Voicing of the jet, labium and radiation. Round 2 fitted these to the Iowa MIS flute
 *  (non-vibrato, pp/mf/ff) with scripts/fit-flute.ts; see docs/CALIBRATION.md. */
/** tongued onset (round 3): the jet's one-off push, and its transient extra gain,
 *  fitted to the Iowa flute's 10-90 % attack times (model x1.67 slower before, x1.14 now) */
const TONGUE_PUSH = 1;
const ATTACK_BOOST = 4;
/** the shortest tongued note: the breath stays on this long after the tongue's release, even when
 *  the key is let go sooner (s). A 50 ms tap let the breath go before the tube had spoken: it
 *  peaked 22.5 dB under the held note, 12.5 dB with this (scripts/tap-audit.ts). Held notes are
 *  untouched (bit-identical), so the fit to the Iowa flute stands */
const MIN_BLOW = 0.12;
/** A note known to be short (mono.ts): the jet's sharper aim after the tongue (ATTACK_BOOST, fitted on the
 *  recordings' long tones, whose soft ones take 135–430 ms to rise) is this many times more, less the
 *  note's strength (a soft note needs it most: its jet is slowest to grow). Measured on notes of 139 ms
 *  across the compass (scripts/winds-midi-bench.ts): at the long tone's aim they reach −27…+2 dB of the
 *  held note's level at pp, the lowest notes of each register least; with this, −1…+3 dB, speaking in
 *  30–65 ms. */
const QUICK_AIM = 2;
/** A note joined to one of a higher register (the last note overblown at the twelfth, this one at the octave;
 *  or the octave, then a fundamental): the jet is let fall for a moment, this fraction slower, back with
 *  FALL_TAU (s). Blown straight on, the tube stayed on the mode it had (a flute's registers overlap: coming
 *  down, the upper one holds), and so did every note of that register after it until one of the lowest:
 *  Beethoven's Fifth, I, bars 303 on, 12 of 86 flute notes at a wrong pitch. Measured on eleven falls across
 *  the breaks at 139 and 278 ms, pp/mf/ff (scripts/winds-midi-bench.ts): the note or the one after it off its
 *  pitch in 62 of 162 tongued and 106 of 198 slurred; with this, 4 and 26 of 198. A player lets the air
 *  drop to come down a register (Fletcher 1975, JASA 57: blowing pressure follows the note). (Rising across
 *  a break: FINGER and VENT, below.) */
const FALL = 0.45;
const FALL_TAU = 0.05;
/** …and a tongued note of the third register after one of a lower is let go with a first attack's push, its
 *  aim this many times a long tone's. Ten rises across the two breaks at the same lengths and dynamics
 *  (scripts/winds-midi-joined.ts --seq rises): 25 of 120 joined notes off their pitch, where the stroke's
 *  lighter push left 32 (A5→E6 alone 12 of 12) and the engine before, which never stopped the jet, 20.
 *  (Since then the tube itself does most of it: FINGER and VENT, below; the same rises now 3 of 120.) */
const RISE_AIM = 2;
/** Rising to another register the fingering is another tube, not the old one made longer. The tube's length
 *  used to be glided to every new note (as a finger shading one hole does bend the pitch, and that is kept
 *  within a register): C♯5→D5 is then the C♯5 tube stretched to the D4 tube with its standing wave carried
 *  along, 554 Hz bent down to 294 Hz, the new tube's first mode, which the jet then had to overblow again:
 *  150–250 ms on the octave below, a crack on every step up across a break (scripts/flute-rise.ts: 526 of
 *  1008 rises not on their note, both breaks, slurred and tongued, pp–ff, 100–600 ms; 100 and 150 ms notes
 *  396 of 504). Now the wave is turned back from both places while the fingers move, the new tube's share
 *  growing over FINGER (s): what rings on is the old note at its own pitch, a step under the new tube's next
 *  mode, and the jet, already set for that mode, takes it there. A key is closed or opened in about 10 ms
 *  (Almeida, Chow, Smith & Wolfe 2009, "The kinetics and acoustics of fingering and note transitions on the
 *  flute", JASA 126, 1521–1529). */
const FINGER = 0.01;
/** The vent. Every note of a flute's third register, and D5 and E♭5 of its second, is fingered with a hole
 *  open part-way up the tube, where the mode that is wanted has a pressure node: that mode does not feel it,
 *  the others leak through it (Wolfe & Smith 2003, "Cutoff frequencies and cross fingerings in baroque,
 *  classical, and modern flutes", JASA 114, 2263–2272; the register hole as a junction in a waveguide:
 *  Scavone 1997, thesis, CCRMA, Stanford). Without it the tube here was as ready to sound its second or fourth
 *  mode as its third, and a rise to the third register took whichever the last note's ring was nearest:
 *  G5→D6 and A5→E6 (one tube, no finger moves in this model) never arrived, 48 of 48. The hole is a leak
 *  across the bore one period of the note from the foot's reflection: the pressure there (the wave going
 *  down and the wave coming back) loses this share (the junction's 1 − 2Z_hole/(2Z_hole + Z_0), taken as a
 *  resistance: the mass of the air in the hole is left out), sent back both ways inverted. On its own mode the two waves cancel there and it takes nothing, so it is only
 *  computed for a note joined to another (a note from silence speaks on its mode without it and stays
 *  bit-identical). */
const VENT = 0.2;
/** A note joined to one of another register, slurred either way or tongued coming down: the jet is aimed as
 *  for a long tone's attack (ATTACK_BOOST, this many times; RISE_AIM up to a note with a vent, slurred as
 *  tongued), since nothing but the jet's own gain raises the new mode. A slur had none and a stroke over the
 *  breath half (LICK_BOOST): slurred up, the note took 130–300 ms to grow; coming down across a break, 105–
 *  230 ms slurred and 50–90 ms tongued (the last note's mode has to die first: FALL), which the rises, once
 *  they arrived, laid bare (a note after a rise that failed had no register to come down from). Fifteen
 *  falls, pp–ff, 100–600 ms (scripts/flute-rise.ts --also falls): 71 of 180 slurred and 11 of 180 tongued
 *  not on their note in time, now 1 and 3. */
const CROSS_AIM = 1;
/** tongued over the breath (mono.ts): the tongue lets the air go again in this long (s) */
const LICK_OPEN = 0.003;
/** …and the jet's push and sharper aim as it does are this much of a first attack's */
const LICK_BOOST = 0.5;
export const FLUTE_VOICE = {
  /** small-signal jet gain (loop gain of the jet path at small amplitude) */
  jetGain: 0.115,
  /** extra jet gain reached at C7, ramped in from E6: players narrow the lip opening for
   *  the top notes, which raises the jet's receptivity where the bore losses are highest */
  jetGainTop: 1.5,
  /** jet centreline offset from the labium in jet half-widths y0/b, at C4 and at C7:
   *  an offset jet splits asymmetrically, which is what makes even harmonics */
  offset: [1.02, 0.0657] as [number, number],
  /** vortex shedding at the labium: a loss ∝ v|v| that limits the amplitude before the jet
   *  saturates fully (Fabre et al. 1996; Auvray et al. 2012) */
  vortex: 0.00449,
  /** jet convection delay / period at the nominal blowing pressure */
  jetRatio: 0.36,
  /** Strouhal-limited jet receptivity: one-pole corner at this multiple of the pitch */
  jetLp: 3.2,
  /** radiation, as d/dt of the volume flows (unity at 1 kHz): open foot, embouchure jet; plus
   *  an optional undifferentiated jet-flow term (0 = purely monopole radiation) */
  radFoot: 1.25,
  radFlow: 0,
  radDflow: 7.88,
  /** turbulence noise into the jet, and radiated directly */
  noise: 0.0467,
  noiseOut: 0.926,
  /** dynamics: jet flow scale and blowing pressure from MIDI velocity (v01 = vel/127) */
  driveLo: 0.0913,
  driveHi: 0.849,
  driveCurve: 1.48,
  pressLo: 0.84,
  pressHi: 0.886,
};

const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Fingering: which pipe mode sounds note m, and the pipe's fundamental. */
export function fluteFingering(m: number): { mode: number; boreMidi: number } {
  if (m <= 73) return { mode: 1, boreMidi: m };
  if (m <= 85) return { mode: 2, boreMidi: m - 12 };
  return { mode: 3, boreMidi: m - 19 };
}

export class FluteCore implements InstrumentCore {
  readonly id = 'flute' as const;
  readonly fs: number;
  params: FluteParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = 1;
  sympatheticAllowed = true;
  dry: boolean;
  private queue: { frame: number; ev: PianoEvent | { type: 'control'; cc: number; value: number } }[] = [];
  private bore = new Float64Array(BUF);
  private jet = new Float64Array(BUF);
  private D = 100;
  private Dtarget = 100;
  private jetD = 30;
  private jetDTarget = 30;
  private lossA = -0.3;
  private lossG = 0.97;
  private lp = 0;
  private dcX = 0;
  private dcY = 0;
  // breath
  private pressure = 0;
  private pTarget = 0;
  private attackTau = 0.04;
  private chiff = 0;
  /** the tongue's release: one coherent deflection of the jet (amplitude, samples left) */
  private tongueAmp = 0;
  private tongueN = 0;
  private tongueLen = 1;
  private attackBoost = 0;
  /** the breath vibrato's current deviation (fraction of the pressure), for the stage */
  private vibNow = 0;
  private vibPhase = 0;
  /** the player's vibrato (util.ts playerVibrato): starting phase and rate factor */
  private vib0 = 0;
  private vibRate = 1;
  private expression = 1;
  /** CC_DYNAMICS (instrument.ts): velocity steps above (below) the note as begun, asked and as the breath has it */
  private dynTarget = 0;
  private dyn = 0;
  /** pitch bend as a factor on the bore delay */
  private bendFactor = 1;
  /** the player's intonation, semitones (util.ts playerCents), under any bend */
  private tune = 0;
  private note = -1;
  /** the keys as one player takes them (mono.ts), and the tongue's stroke across a sounding jet */
  private keys: MonoKeys;
  private lick = new Tongue();
  /** the tongue has held the last note stopped over a rest: the next is let go as a first attack is */
  private afterStop = false;
  /** a strength taken up once the tongue is down (0: none): tongued over the breath, the air through the
   *  stroke's first milliseconds is still the last note's, so nothing steps under a sounding tone */
  private velNext = 0;
  /** when the tongue last let go (frame): the jet's sharper aim decays from there */
  private tongueAt = 0;
  private velocity = 80;
  private noiseBp = new Float64Array(5);
  private noiseSt = new Float64Array(2);
  private rng: () => number;
  private eq = new BiquadChain();
  private room: Room;
  private limiter: Limiter;
  private pump = new Pump(64);
  private oL = new Float64Array(128);
  private oR = new Float64Array(128);
  private outHp = 0;
  private outHpX = 0;
  private level = 0;
  private trQ = new Float32Array(TRACE);
  private trP = new Float32Array(TRACE);
  private trI = 0;
  private hist = new Float32Array(4096);
  private histI = 0;
  private modeAmps = new Float32Array(16);
  private modeFreqs = new Float64Array(16);
  private Uj = 0;
  private gain = 1;

  constructor(opts: { sampleRate: number; params?: Partial<FluteParams>; dry?: boolean; player?: number }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.params = { breath: 1, embouchure: 1, noise: 1, vibrato: 0.06, room: 0.35, volume: 1, ...opts.params };
    this.keys = new MonoKeys(this.fs);
    this.rng = mulberry32(playerSeed(31, opts.player));
    const pv = playerVibrato(opts.player);
    this.vib0 = this.vibPhase = pv.phase;
    this.vibRate = pv.rate;
    this.tune = playerCents(opts.player) / 100;
    if (this.tune) this.bendFactor = Math.pow(2, -this.tune / 12);
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    const nb = biquadBandpass(2200, 0.7, this.fs);
    this.noiseBp.set([nb[0], nb[1], nb[2], nb[3], nb[4]]);
    this.updatePost();
    this.setNote(69, true);
  }

  private updatePost(): void {
    const fs = this.fs;
    this.eq.set([biquadHighpass(180, 0.7, fs), biquadPeaking(2800, 1.2, 2.5, fs), biquadHighShelf(8000, -4, fs)]);
    this.room.configure(this.params.room, this.params.seat);
    // round 2: re-normalised so the fitted voicing keeps the round-1 mf level (ensemble balance)
    this.gain = 0.0188 * this.params.volume;
  }

  /** nominal blowing pressure (Pa) by register: players blow harder for higher notes */
  private nominalPressure(m: number): number {
    return 180 + 22 * (m - 60);
  }

  private setNote(m: number, immediate: boolean): void {
    const fs = this.fs;
    const { mode, boreMidi } = fluteFingering(m);
    const fb = et(boreMidi);
    // loop filter: open-end radiation + wall losses (lowpass), stronger for short pipes
    this.lossA = -0.28 - 0.14 * clamp((fb - 260) / 800, 0, 1);
    this.lossG = 0.995;
    // jet delay: the player sets the lip-to-edge distance so that at the nominal pressure
    // τj ≈ 0.42 of the sounding period; blowing ~2x harder shortens it towards 0.25 and
    // the next pipe mode takes over (overblowing)
    const pNom = this.nominalPressure(m);
    const UjNom = Math.sqrt((2 * pNom) / RHO);
    const V = FLUTE_VOICE;
    this.lj = (V.jetRatio / et(m)) * 0.45 * UjNom;
    // jet offset voiced across the compass; small-signal gain kept independent of it
    this.off = V.offset[0] + (V.offset[1] - V.offset[0]) * clamp((m - 60) / 36, 0, 1);
    this.tanhOff = Math.tanh(this.off);
    this.jetGainNote = V.jetGain * (1 + (V.jetGainTop - 1) * clamp((m - 88) / 8, 0, 1));
    this.jetK = (2 * this.jetGainNote) / (1 - this.tanhOff * this.tanhOff);
    this.modeStep = immediate ? 0 : mode - this.mode;
    this.mode = mode;
    if (immediate) {
      this.fingNow = false;
      this.fing = 1;
      this.ventTo = this.ventG = 0;
      this.ventLive = 0;
    } else {
      // up to another register on another tube: the fingering is replaced (FINGER); the note's vent (VENT)
      if (this.modeStep > 0 && boreMidi !== this.tube) this.fingNow = true;
      this.ventTo = mode === 3 || m === 74 || m === 75 ? VENT : 0;
    }
    this.tube = boreMidi;
    this.fTarget = et(m);
    this.boreNominal = (mode * fs) / et(m);
    // jet receptivity falls off above a Strouhal-limited frequency (the player's lip
    // distance tracks the note): one-pole low-pass at ~2.2x the sounding pitch
    this.jetLpA = Math.exp((-2 * Math.PI * V.jetLp * et(m)) / fs);
    const tauNom = (fs * this.lj) / (0.45 * UjNom);
    this.Dnom = this.boreDelayFor(tauNom) * this.tuningCorrection(m);
    this.Dtarget = this.Dnom;
    {
      // the vent's place: from it to the foot and back is one period of the note, less the foot's own delay
      // there (the loss filter's phase), so that the wave coming back cancels the wave going down
      const w = (2 * Math.PI * et(m)) / fs;
      this.ventSpan = fs / et(m) - Math.atan2(-this.lossA * Math.sin(w), 1 + this.lossA * Math.cos(w)) / w;
    }
    if (immediate) {
      this.D = this.Dtarget;
      this.jetD = this.jetDTarget = tauNom;
    }
    this.note = m;
    for (let k = 0; k < 16; k++) this.modeFreqs[k] = (k + 1) * fb;
  }
  /** the tube fingered (its fundamental's note), and a fingering being replaced (FINGER): the old tube's
   *  length, the new one's share of the reflection (1: done) */
  private tube = -1;
  private fingNow = false;
  private fing = 1;
  private Dold = 100;
  /** the vent (VENT): what it has sent back (its history), its share now and asked, the foot's filter as
   *  the wave coming back meets it, its distance from the foot and back (samples), samples left to compute */
  private vent = new Float64Array(BUF);
  private ventG = 0;
  private ventTo = 0;
  private ventLp = 0;
  private ventSpan = 50;
  private ventLive = 0;
  private fTarget = 440;
  private off = 0.8;
  private tanhOff = Math.tanh(0.8);
  private jetK = 1;
  private jetGainNote = 0.2;
  private qPrev = 0;
  /** the jet's drive, gain and offset (and the offset's tanh) as the last block ended: each block
   *  ramps from these to its own, so no step reaches the flow q, whose derivative is radiated */
  private uPrev = 0;
  private jkPrev = -1;
  private offPrev = 0;
  private tOffPrev = 0;
  private jetLpA = 0.9;
  private jetLpY = 0;
  private boreNominal = 100;
  private Dnom = 100;

  /** Measured voicing table (scripts/tune-flute.ts): the saturated oscillation runs a little
   *  sharp of the small-signal phase condition; correct by the measured cents. */
  static tuningTable: { fs: number[]; midi: number[]; cents: number[][] } = fluteTuning as { fs: number[]; midi: number[]; cents: number[][] };
  private tuningCorrection(m: number): number {
    const t = FluteCore.tuningTable;
    if (!t.midi?.length) return 1;
    const rows = t.cents.map((r) => interp(m, t.midi, r));
    const c = t.fs.length > 1 ? interp(this.fs, t.fs, rows) : rows[0];
    return Math.pow(2, c / 1200);
  }

  /** Bore delay that puts the small-signal loop phase at 0 for the target pitch,
   *  given jet delay tau (samples): ωD = arg G(ω) + 2πn, with
   *  G = H(ω)·(R − g·e^{−jωτ}) (open-foot inversion, loss filter, embouchure reflection, jet path). */
  private boreDelayFor(tau: number): number {
    const w = (2 * Math.PI * this.fTarget) / this.fs;
    const a = this.lossA;
    // H = lb/(1 + a e^{-jw}): phase = -atan2(-a sin w, 1 + a cos w)
    const phH = -Math.atan2(-a * Math.sin(w), 1 + a * Math.cos(w));
    // foot inversion: G = −H·(−R + g e^{−jωτ}) = H·(R − g e^{−jωτ})
    // jet low-pass (1-a)/(1 - a e^{-jw})
    const ja = this.jetLpA;
    const lr = 1 - ja * Math.cos(w);
    const li = ja * Math.sin(w);
    const lden = lr * lr + li * li;
    const Lr = ((1 - ja) * lr) / lden;
    const Li = (-(1 - ja) * li) / lden;
    // g·L·e^{-jωτ}
    const er = Math.cos(w * tau);
    const ei = -Math.sin(w * tau);
    const jr = this.jetGainNote * (Lr * er - Li * ei);
    const ji2 = this.jetGainNote * (Lr * ei + Li * er);
    const gr = R_EMB - jr;
    const gi = -ji2;
    const ph = phH + Math.atan2(gi, gr);
    // DC blocker phase is negligible at audio frequencies
    let best = this.boreNominal;
    let bestErr = Infinity;
    for (let n = 0; n < 12; n++) {
      const D = (ph + 2 * Math.PI * n) / w;
      if (D < 4) continue;
      const e = Math.abs(D - this.boreNominal);
      if (e < bestErr) {
        bestErr = e;
        best = D;
      }
    }
    return best - 0.5; // linear interpolation read adds ~half a sample
  }
  private lj = 0.005;
  private mode = 1;

  schedule(ev: unknown, frame?: number): void {
    const f = frame === undefined ? this.frame : Math.max(this.frame, Math.floor(frame));
    const fe = ev as { type?: string; midi: number; velocity: number; dur: number };
    // a note to come is not an event: it is known at once, and nothing happens at its frame (mono.ts)
    if (fe.type === 'foresee') return this.keys.foresee(f, fe.midi, fe.velocity, fe.dur);
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].frame > f) i--;
    q.splice(i, 0, { frame: f, ev: ev as PianoEvent });
  }

  /** what was foreseen is forgotten (the file paused or stopped) */
  forget(): void {
    // (a rest held for a note that will not come now: the breath is let go)
    if (this.keys.forget()) this.pTarget = 0;
  }

  private apply(ev: PianoEvent | { type: 'control'; cc: number; value: number }): void {
    switch (ev.type) {
      // the notes of one instant are taken together (settle)
      case 'noteOn':
        if (ev.velocity <= 0) this.keys.off(ev.midi);
        else this.keys.on(ev.midi, ev.velocity);
        break;
      case 'noteOff':
        this.keys.off(ev.midi);
        break;
      case 'sustain':
        this.sustain = clamp(ev.value, 0, 1);
        this.keys.poke();
        break;
      case 'control':
        // mod wheel, breath controller and expression all blow: breath pressure (below 0, CC_REST:
        // back to the breath the note asks for)
        if (ev.cc === 1 || ev.cc === 2 || ev.cc === 11) this.expression = ev.value < 0 ? 1 : 0.4 + 0.8 * clamp(ev.value, 0, 1);
        else if (ev.cc === CC_DYNAMICS) this.dynTarget = clamp(ev.value, -64, 64);
        break;
      case 'bend':
        // the player rolls the flute in/out and lips the pitch: the tube's effective length
        this.bendFactor = Math.pow(2, -(clamp(ev.value, -12, 12) + this.tune) / 12);
        break;
      case 'allNotesOff':
        this.keys.clear();
        this.pTarget = 0;
        this.releasePending = false;
        break;
      default:
        break;
    }
  }

  /** The instant's notes, as one player takes them (mono.ts): a note from silence is tongued, a note over
   *  a held one slurred, a note joined to the last (or its pitch struck again) tongued over the breath. */
  private settle(): void {
    const a = this.keys.settle(this.frame, this.pTarget > 0, this.sustain >= 0.5);
    if (!a) return;
    if (a.kind === 'release') return this.release();
    if (a.kind === 'stop') {
      // a foreseen note is so near that the breath stays: the tongue stops this one until it begins
      this.lick.stop(this.fs, a.len * this.fs, LICK_OPEN * this.fs);
      this.releasePending = false;
      this.afterStop = true;
      return;
    }
    const m = clamp(a.midi, 60, 96);
    // (a stroke made ahead for a note that came otherwise lets go)
    if (this.lick.down && !(a.kind === 'retongue' && a.struck)) this.lick.release(LICK_OPEN * this.fs);
    if (a.kind === 'slur' && !a.velocity) {
      // back to a note still held: the fingers only
      this.setNote(m, false);
      return;
    }
    const was = this.velocity;
    const vel = a.velocity;
    const v = vel / 127;
    this.velocity = vel;
    this.velNext = 0;
    if (a.kind === 'retongue' && !(a.struck && this.lick.landed)) {
      this.velNext = vel;
      this.velocity = was;
    }
    this.releasePending = false;
    if (a.kind === 'slur') {
      this.setNote(m, false);
      this.pTarget = 1;
      this.attackTau = 0.015;
      this.chiff = 0.3;
      this.tongueAmp = TONGUE_PUSH * 0.3;
      this.tongueLen = Math.max(4, Math.round((0.5 * this.fs) / et(m)));
      this.tongueN = this.tongueLen;
      // (to another register: the jet aimed for it, CROSS_AIM)
      this.attackBoost = this.modeStep ? ATTACK_BOOST * (0.6 + 0.4 * v) * (this.modeStep > 0 && this.ventTo > 0 ? RISE_AIM : CROSS_AIM) : 0;
      this.noteStart = this.frame;
      this.tongueAt = this.frame;
      this.fallNow = this.modeStep < 0;
    } else if (a.kind === 'tongue') {
      // (begun while the last note of a higher register still rings: the air let fall, as when joined)
      this.fallNow = this.modeStep < 0;
      this.setNote(m, this.level < 1e-3);
      this.pTarget = 1;
      this.lick.reset();
      // a note known to be short is tongued to speak within a share of its length (mono.ts): the breath
      // is there sooner, the jet pushed harder and aimed sharper for longer. A note of unknown length (a
      // key in the hand) gets the long tone's attack the recordings were fitted on (quick = 1)
      const quick = quickness(a.len);
      this.attackTau = quickRise(0.06 - 0.035 * v, a.len);
      this.chiff = 0.6 + 0.8 * v;
      // tonguing: when the tongue lets the breath go, the jet's front sweeps across the
      // edge once, a coherent push that seeds the tube's resonance (without it the
      // oscillation grew from turbulence alone and spoke ~4x slower than a real flute)
      this.tongueAmp = TONGUE_PUSH * (0.5 + 0.5 * v);
      this.tongueLen = Math.max(4, Math.round((0.5 * this.fs) / et(m)));
      this.tongueN = this.tongueLen;
      this.attackBoost = ATTACK_BOOST * (0.6 + 0.4 * v) * (1 + (QUICK_AIM - v) * quick);
      this.afterStop = false;
      this.vibPhase = this.vib0;
      this.noteStart = this.frame;
      this.tongueAt = this.frame;
      this.blowUntil = this.frame + Math.round(MIN_BLOW * this.fs);
    } else {
      // tongued over the breath: the fingers move, the tongue cuts the jet and lets it go again
      const same = m === this.note;
      this.setNote(m, false);
      this.pTarget = 1;
      this.attackTau = Math.min(this.attackTau, quickRise(0.06 - 0.035 * v, a.len));
      // (the jet's push as the tongue lets go: a lighter one than a first attack's, unless the tongue has
      // held the tube silent over a rest: then a short note's)
      const first = this.afterStop;
      this.afterStop = false;
      this.fallNow = this.modeStep < 0;
      // (…and a note of the third register after one of a lower: the tongue lets the jet go with a first
      // attack's push, aimed RISE_AIM sharper, or the tube stays with the old note's ring)
      const up = this.modeStep > 0 && this.mode === 3 && !first;
      const wait = this.lick.retongue(a.struck, this.fs, same, LICK_OPEN * this.fs);
      this.tongueAt = this.frame + wait;
      this.chiff = first || up ? 0.6 + 0.8 * v : 0.3 + 0.4 * v;
      this.tongueAmp = TONGUE_PUSH * (first || up ? 1 : LICK_BOOST) * (0.5 + 0.5 * v);
      this.tongueLen = Math.max(4, Math.round((0.5 * this.fs) / et(m)));
      this.tongueN = this.tongueLen;
      this.tongueWait = wait;
      this.attackBoost = ATTACK_BOOST * (0.6 + 0.4 * v) * (first ? 1 + QUICK_AIM - v : up ? RISE_AIM : this.modeStep < 0 ? CROSS_AIM : LICK_BOOST);
      this.noteStart = this.frame;
      this.blowUntil = this.frame + Math.round(MIN_BLOW * this.fs);
    }
    if (a.tap) this.release();
  }
  /** samples before the jet's push begins (the tongue is still across the air), and the decay of its
   *  sharper aim (s) */
  private tongueWait = 0;
  /** the note's register against the last note's (its fingering's mode, less the last one's), and whether
   *  the air is let fall for it (FALL) */
  private modeStep = 0;
  private fallNow = false;
  private noteStart = 0;
  /** frame until which a tongued note keeps its breath (MIN_BLOW), and a key let go before it */
  private blowUntil = 0;
  private releasePending = false;

  /** The key is up: stop blowing, but not before the tongued note has had its minimum breath. */
  private release(): void {
    if (this.pTarget > 0 && this.frame < this.blowUntil) this.releasePending = true;
    else this.pTarget = 0;
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<FluteParams>) };
    if (this.params.room !== old.room || this.params.volume !== old.volume) this.updatePost();
    else if (this.params.seat !== old.seat) this.room.configure(this.params.room, this.params.seat);
  }

  /** the one note actually sounding (a monophonic instrument: the last held key wins and a
   *  release returns to the previous held one), or none */
  sounding(): number[] {
    return this.pTarget > 0 && !this.keys.silent ? [this.note] : [];
  }

  allSoundOff(): void {
    this.dyn = this.dynTarget = 0;
    this.bore.fill(0);
    this.jet.fill(0);
    this.pressure = this.pTarget = 0;
    this.releasePending = false;
    this.keys.clear();
    this.keys.forget();
    this.lick.reset();
    this.tongueWait = 0;
    this.fingNow = false;
    this.fing = 1;
    this.vent.fill(0);
    this.ventG = this.ventTo = this.ventLp = 0;
    this.ventLive = 0;
    this.lp = this.dcX = this.dcY = 0;
    this.uPrev = 0;
    this.jkPrev = -1;
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
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

  /** Render `frames` samples into outL/outR. Internal blocks (≤ 64, cut at events) do not depend
   *  on `frames` (see Pump). */
  process(outL: Float32Array | Float64Array, outR: Float32Array | Float64Array, frames: number): void {
    this.pump.pull(outL, outR, frames, (L, R) => {
      const q = this.queue;
      while (q.length && q[0].frame <= this.frame) this.apply(q.shift()!.ev);
      this.settle();
      let n = 64;
      if (q.length) n = Math.max(1, Math.min(n, q[0].frame - this.frame));
      if (this.releasePending) {
        // a key let go inside the minimum blow: the breath stops when that is over (the block is
        // cut there, as at an event)
        if (this.frame >= this.blowUntil) {
          this.releasePending = false;
          if (!this.keys.any && this.sustain < 0.5) this.pTarget = 0;
        } else n = Math.min(n, this.blowUntil - this.frame);
      }
      // a foreseen note joined to the one sounding: the tongue's stroke is made ahead of it (mono.ts)
      n = this.keys.plan(this.frame, n, this.pTarget > 0 && !this.releasePending);
      if (this.keys.overdue) {
        // (the note a rest was held for never came: the breath is let go, behind the tongue if it is down)
        this.keys.overdue = false;
        this.pTarget = 0;
        if (this.lick.down) this.pressure = 0;
      }
      if (this.keys.strokeNow >= 0) this.lick.ahead(this.fs, this.keys.strokeNow - this.frame, LICK_OPEN * this.fs);
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

  private render(n: number): void {
    if (this.velNext && this.lick.landed) {
      this.velocity = this.velNext;
      this.velNext = 0;
    }
    const fs = this.fs;
    const dt = n / fs;
    const P = this.params;
    // breath envelope and vibrato (control rate)
    const sinceOn = Math.max(0, this.frame - this.tongueAt) / fs;
    const k = 1 - Math.exp(-dt / (this.pTarget > this.pressure ? this.attackTau : 0.035));
    this.pressure += (this.pTarget - this.pressure) * k;
    if (this.pressure < 1e-5 && this.pTarget === 0) this.pressure = 0;
    const age = (this.frame - this.noteStart) / fs;
    this.vibPhase += 2 * Math.PI * 5.0 * this.vibRate * dt;
    const vib = 1 + P.vibrato * clamp((age - 0.3) / 0.4, 0, 1) * Math.sin(this.vibPhase);
    this.vibNow = vib - 1;
    // CC_DYNAMICS: the breath goes on as a note begun that much harder or softer would (a time constant)
    if (this.dyn !== this.dynTarget) {
      this.dyn += (this.dynTarget - this.dyn) * (1 - Math.exp(-dt / DYN_TAU));
      if (Math.abs(this.dynTarget - this.dyn) < 1e-3) this.dyn = this.dynTarget;
    }
    // velocity: mostly loudness (jet flow amplitude), a little blowing pressure
    const V = FLUTE_VOICE;
    const v01 = this.dyn ? clamp(this.velocity + this.dyn, 1, 127) / 127 : this.velocity / 127;
    const velScale = V.driveLo + (V.driveHi - V.driveLo) * Math.pow(v01, V.driveCurve);
    const pBlow = this.nominalPressure(this.note) * this.pressure * vib * P.breath * (V.pressLo + (V.pressHi - V.pressLo) * v01) * this.expression;
    const Uj = Math.sqrt((2 * Math.max(pBlow, 1)) / RHO);
    this.Uj = Uj;
    const ljEff = this.lj * P.embouchure;
    // (a note joined to one of a higher register: the air let fall for a moment, see FALL)
    const fall = this.fallNow ? 1 - FALL * Math.exp(-sinceOn / FALL_TAU) : 1;
    this.jetDTarget = clamp((fs * ljEff) / (0.45 * Math.max(Uj, 4) * fall), 2, BUF / 2);
    // players "lip" the pitch back as they blow harder; compensate 75 % of the drift
    this.Dtarget = (this.Dnom + 0.75 * (this.boreDelayFor(this.jetDTarget) * this.tuningCorrection(this.note) - this.Dnom)) * this.bendFactor;
    if (this.fingNow) {
      // the fingering is replaced: the new tube from here, the old one's reflection fading (a change begun
      // before the last was over starts from whichever tube had the larger share)
      this.fingNow = false;
      if (this.fing >= 0.5) this.Dold = this.D;
      this.D = this.Dtarget;
      this.fing = 0;
    }
    const fingStep = 1 / (FINGER * fs);
    if (this.ventTo > 0 && this.ventLive <= 0) {
      this.vent.fill(0);
      this.ventLp = 0;
      this.ventLive = 1;
    }
    let venting = this.ventLive > 0;
    const ventSpan = this.ventSpan * this.bendFactor;
    const vt = this.vent;
    // normalised drive (flow) and turbulence ∝ Uj²
    const drive = this.pressure * vib * velScale * this.expression * Math.min(1.6, P.breath);
    const turb = V.noise * P.noise * (Uj * Uj) / 400 * (this.pressure > 0 ? 1 : 0);
    const off = this.off;
    const tOff = this.tanhOff;
    // right after a tongued onset the jet is sharper and better aimed: a transient extra
    // small-signal gain (decaying over ~60 ms) lets the tube speak as fast as a real flute
    const jk = this.jetK * (1 + this.attackBoost * Math.exp(-sinceOn / 0.06));
    const vortex = V.vortex;
    const dqScale = fs / (2 * Math.PI * 1000);
    this.chiff *= Math.exp(-dt / 0.035);
    const u = Math.max(0, drive);
    // the block's values are where these arrive at its end: a sample-by-sample ramp from the last
    // block's. A step here (a new note's offset, the breath's envelope, a controller) went straight
    // into q and, through the radiated dq/dt, out as a one-sample click (audio audit, Nov 2026: up
    // to 14.6× the tone's own steepest step at a note-on, 5.4× at a mod-wheel step)
    if (this.jkPrev < 0) {
      this.jkPrev = jk;
      this.offPrev = off;
      this.tOffPrev = tOff;
    }
    const u0 = this.uPrev, jk0 = this.jkPrev, off0 = this.offPrev, tOff0 = this.tOffPrev;
    const dU = (u - u0) / n, dJk = (jk - jk0) / n, dOff = (off - off0) / n, dTOff = (tOff - tOff0) / n;
    const bp = this.noiseBp;
    const ns = this.noiseSt;
    const oL = this.oL;
    const oR = this.oR;
    const mask = BUF - 1;
    const la = this.lossA;
    const lb = this.lossG * (1 + la);
    let peak = 0;
    // a stroke of the tongue across the sounding jet (mono.ts): the air it lets through
    const lick = this.lick;
    let licking = lick.busy;
    for (let t = 0; t < n; t++) {
      const w = this.frame + t;
      this.D += (this.Dtarget - this.D) * 0.004;
      this.jetD += (this.jetDTarget - this.jetD) * 0.01;
      // bore return at the embouchure (fractional read, linear is enough at this length)
      const Di = Math.floor(this.D);
      const fr = this.D - Di;
      let r = this.bore[(w - Di) & mask] * (1 - fr) + this.bore[(w - Di - 1) & mask] * fr;
      if (this.fing < 1) {
        // (a fingering being replaced: the old tube's reflection beside the new one's)
        const Do = Math.floor(this.Dold);
        const fo = this.Dold - Do;
        const r0 = this.bore[(w - Do) & mask] * (1 - fo) + this.bore[(w - Do - 1) & mask] * fo;
        this.fing = Math.min(1, this.fing + fingStep);
        r = r0 + (r - r0) * (0.5 - 0.5 * Math.cos(Math.PI * this.fing));
      }
      // the vent: the pressure at it is the wave going down and the wave back from the foot; the share it
      // lets out goes back both ways, inverted: to the foot and round (into r), and straight to the embouchure
      let vUp = 0;
      if (venting) {
        if (this.ventG !== this.ventTo) {
          const d = this.ventTo - this.ventG;
          this.ventG += d > fingStep ? fingStep : d < -fingStep ? -fingStep : d;
        }
        const d1 = Math.max(1, 0.5 * (this.D - ventSpan));
        let vi = Math.floor(d1);
        let vf = d1 - vi;
        const down = this.bore[(w - vi) & mask] * (1 - vf) + this.bore[(w - vi - 1) & mask] * vf;
        vUp = vt[(w - vi) & mask] * (1 - vf) + vt[(w - vi - 1) & mask] * vf;
        let del = this.D - d1;
        vi = Math.floor(del);
        vf = del - vi;
        let back = this.bore[(w - vi) & mask] * (1 - vf) + this.bore[(w - vi - 1) & mask] * vf;
        r -= vt[(w - vi) & mask] * (1 - vf) + vt[(w - vi - 1) & mask] * vf;
        del = Math.max(1, this.D - 2 * d1);
        vi = Math.floor(del);
        vf = del - vi;
        back -= vt[(w - vi) & mask] * (1 - vf) + vt[(w - vi - 1) & mask] * vf;
        this.ventLp = -lb * back - la * this.ventLp;
        vt[w & mask] = this.ventG * (down + this.ventLp);
        // (shut again: computed until what it sent has left the tube)
        if (this.ventG > 0 || this.ventTo > 0) this.ventLive = BUF >> 3;
        else if (--this.ventLive <= 0) venting = false;
      }
      // open foot: pressure reflection inverts (open-open pipe => all harmonics);
      // radiation + wall losses (lowpass), DC block
      this.lp = -lb * r - la * this.lp;
      const yF = this.lp - this.dcX + 0.995 * this.dcY;
      this.dcX = this.lp;
      this.dcY = yF;
      const y = venting ? yF - vUp : yF;
      const pRet = y;
      // turbulence noise (bandpassed), plus attack chiff
      const white = this.rng() * 2 - 1;
      const nz = bp[0] * white + ns[0];
      ns[0] = bp[1] * white - bp[3] * nz + ns[1];
      ns[1] = bp[2] * white - bp[4] * nz;
      let noise = nz * (turb + 0.12 * this.chiff * drive);
      // (the tongue across the jet: the air it lets through, 1 when it is away)
      let og = 1;
      if (licking) {
        og = lick.next();
        noise *= og;
        licking = lick.busy;
      }
      // jet: deflected by the acoustic flow at the embouchure (more easily when slow),
      // the deflection convected to the edge; flow into the pipe ∝ jet speed
      let tng = 0;
      if (this.tongueWait > 0) this.tongueWait--;
      else if (this.tongueN > 0) {
        tng = this.tongueAmp * Math.sin((Math.PI * (this.tongueLen - this.tongueN)) / this.tongueLen);
        this.tongueN--;
      }
      this.jetLpY = (1 - this.jetLpA) * (0.5 * y + noise + tng) + this.jetLpA * this.jetLpY;
      const jIn = this.jetLpY;
      this.jet[w & mask] = jIn;
      const jd = this.jetD;
      const ji = Math.floor(jd);
      const jf = jd - ji;
      const jDel = this.jet[(w - ji) & mask] * (1 - jf) + this.jet[(w - ji - 1) & mask] * jf;
      // jet splitting at the edge: saturating flow law, offset edge -> even harmonics;
      // small-signal gain JET_GAIN (independent of jet speed above threshold)
      const uT = (u0 + dU * (t + 1)) * og;
      const q = uT * (Math.tanh(((jk0 + dJk * (t + 1)) * jDel) / (uT + 0.06) + off0 + dOff * (t + 1)) - (tOff0 + dTOff * (t + 1)));
      // vortex shedding at the labium: a resistance growing with the acoustic flow, i.e. a
      // reflection that weakens with amplitude (passive: never above R_EMB)
      const into = q - (R_EMB / (1 + vortex * Math.abs(y))) * y;
      this.bore[w & mask] = into;
      // radiation: both openings are small monopoles, so the far-field pressure is the time
      // derivative of their volume flows (Rayleigh): the open foot (the wave leaving the
      // bore) and the embouchure (the jet's own asymmetric flow, which carries the evens)
      const dr = r - this.outHpX;
      this.outHpX = r;
      const dq = q - this.qPrev;
      this.qPrev = q;
      const out = dqScale * (V.radFoot * dr + V.radDflow * dq) + V.radFlow * q + V.noiseOut * noise;
      oL[t] = out;
      oR[t] = 0.9 * out + 0.4 * q;
      this.trQ[this.trI] = q;
      this.trP[this.trI] = pRet;
      this.trI = (this.trI + 1) & (TRACE - 1);
      this.hist[this.histI] = out;
      this.histI = (this.histI + 1) & 4095;
      const a = Math.abs(r);
      if (a > peak) peak = a;
    }
    this.uPrev = u;
    this.jkPrev = jk;
    this.offPrev = off;
    this.tOffPrev = tOff;
    this.level = Math.max(peak, this.level * 0.9);
    const g = this.gain;
    for (let t = 0; t < n; t++) {
      oL[t] *= g;
      oR[t] *= g;
    }
    this.eq.process(oL, oR, n);
    if (!this.dry) {
      this.room.process(oL, oR, n, 1, P.room * 0.7);
      this.limiter.process(oL, oR, n);
    }
    this.frame += n;
    if (this.level < 1e-9 && this.pressure === 0 && this.level > 0) {
      this.bore.fill(0);
      this.jet.fill(0);
      this.level = 0;
    }
  }

  keySummary(): KeySummary[] {
    const out: KeySummary[] = [];
    for (let m = 60; m <= 96; m++) {
      const { mode, boreMidi } = fluteFingering(m);
      out.push({ midi: m, f1: et(m), B: 0, nStrings: 1, lengthM: C_AIR / (2 * et(boreMidi)), hasDamper: false, preparation: mode === 1 ? '1st register' : mode === 2 ? '2nd register (overblown octave)' : '3rd register (overblown twelfth)' });
    }
    return out;
  }

  getVisual(points = 160): object {
    // standing pressure wave along the bore (embouchure 0 → foot 1)
    const shape = new Float32Array(points);
    const D = this.D;
    const half = D / 2;
    const w = this.frame - 1;
    for (let p = 0; p < points; p++) {
      const d = (p / (points - 1)) * half;
      const fwd = this.bore[(w - Math.round(d)) & (BUF - 1)];
      const back = -this.bore[(w - Math.round(D - d)) & (BUF - 1)];
      shape[p] = fwd + back;
    }
    const period = this.fs / et(this.note);
    const len = Math.min(TRACE, Math.max(64, Math.round(4 * period)));
    const tq = new Float32Array(len);
    const tp = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const j = (this.trI - len + i + TRACE) & (TRACE - 1);
      tq[i] = this.trQ[j];
      tp[i] = this.trP[j];
    }
    // resonance amplitudes at the bore harmonics (Goertzel over the last 4096 samples)
    for (let k = 0; k < 16; k++) {
      const wk = (2 * Math.PI * this.modeFreqs[k]) / this.fs;
      if (wk >= Math.PI) {
        this.modeAmps[k] = 0;
        continue;
      }
      const c = 2 * Math.cos(wk);
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < 4096; i++) {
        s0 = this.hist[(this.histI + i) & 4095] + c * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      this.modeAmps[k] = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / 2048;
    }
    const { mode } = fluteFingering(this.note);
    const excite: ExciteTrace = {
      title: 'Jet',
      unit: '',
      rate: this.fs,
      trace: tq,
      trace2: tp,
      trace2Label: 'acoustic pressure returning to the embouchure',
      caption: 'Flow the jet sends into the pipe as it is deflected across the edge (solid), driven by the sound returning from the pipe after the jet’s convection delay. Blow harder and the delay shrinks; past a threshold the pipe jumps to its next mode.',
      meta: `jet ${this.Uj.toFixed(1)} m/s · τj ${((this.jetD / this.fs) * 1000).toFixed(2)} ms = ${((this.jetD / this.fs) * et(this.note)).toFixed(2)} periods · mode ${mode}`,
    };
    return {
      frame: this.frame,
      voices: this.activeVoiceCount,
      sympathetic: 0,
      focus: {
        midi: this.note,
        nStrings: 1,
        shapes: [shape],
        hammerAt: 0.02,
        prepAt: -1,
        lengthM: C_AIR / (2 * et(fluteFingering(this.note).boreMidi)),
        f1: et(this.note),
        B: 0,
        damper: 0,
      },
      strike: null,
      excite,
      breath: { pressure: this.pressure, vib: this.vibNow },
      modes: this.modeAmps.slice(),
      sustain: this.sustain,
      soft: this.soft,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }
}
