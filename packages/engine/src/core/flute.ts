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
// note joined to one of another register takes the tube's wave with it (CARRY),
// and the notes fingered with a vent hole have one (VENT). Turbulence noise
// scales with jet speed.

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
/** A note joined to one of another register takes the wave in the tube with it.
 *
 *  At a register break the same standing wave fits both fingerings: C♯5 is the first mode of a short tube,
 *  D5 the second mode of one twice as long, and the short tube's half-wave is the upper half of the long
 *  one's whole wave. The fingers change the tube under a wave that goes on. This model keeps a tube's wave
 *  as its history (a delay line as long as the tube's round trip), and three earlier ways of changing the
 *  tube all lost it: stretched to the new length, the wave was bent to a mode of the new tube that is not
 *  the note (C♯5 → D5 arrived an octave low and had to be overblown again: 150–250 ms); turned back from the
 *  old place and the new while the fingers moved, it fed the new tube's fundamental as much as the mode that
 *  was wanted, and the jet, already saturated by it, could not raise the note until it had died; with the
 *  air let fall or the jet aimed sharper to hurry that, the note still came late, behind a hole, and often
 *  after the octave below or the twelfth above had sounded first. Measured on 3024 pairs of notes over the
 *  compass, slurred, tongued and after a short rest, pp–ff, 120–500 ms (scripts/winds-legato.ts): of the
 *  1242 across a break, 753 spoke later than 40 ms (47 ms the median, 105 the 90th percentile) and 257
 *  sounded a wrong register for over 10 ms; a slur across a break had a hole of 9.6 dB (the median). Of the
 *  1782 within a register none was late (12 ms) and a slur had no hole.
 *
 *  Now the history is written once more at the new note's pitch: the same wave (its shape, its level, where
 *  it is in its cycle) in so many periods of the new note as the new tube's round trip holds, and the jet's
 *  own history with it, its delay kept at the same share of a period. Nothing has to die and nothing has to
 *  grow: the jet finds the mode it is set for already sounding. What is heard goes from the old note to the
 *  new over CARRY (s), the old note's last period carried on under the new one coming in, as long as a key
 *  takes to close or open (about 10 ms: Almeida, Chow, Smith & Wolfe 2009, "The kinetics and acoustics of
 *  fingering and note transitions on the flute", JASA 126, 1521–1529). The same pairs across a break: none
 *  later than 40 ms (7 ms the median, 14 the latest), none on a wrong register, a slur's hole 1.1 dB (4 at
 *  the worst); and the rises and falls of the audit before (scripts/flute-rise.ts --also falls: 28 of 1008
 *  rises and 4 of 360 falls not on their note) all arrive, in 7.5 ms (the median; 10 at the 90th percentile,
 *  where it was 57). After a slur across a break the note has its own spectrum within 60 ms (each harmonic
 *  within 1 dB of the note held alone), where it was 15 dB under for the first of them and then 4–13 dB
 *  over in its upper harmonics for a fifth of a second (the jet's sharper aim).
 *
 *  A leap across a break (A4 → E5) is carried the same way. On a flute the old wave fits the new tube less
 *  well the wider the leap, and a player's lips do the rest in some tens of milliseconds; this model's jet
 *  alone took over a hundred, on the wrong octave. Within a register nothing is changed: the tube's length
 *  is glided, as a finger shading a hole bends the pitch. */
const CARRY = 0.01;
/** The vent. Every note of a flute's third register, and D5 and E♭5 of its second, is fingered with a hole
 *  open part-way up the tube, where the mode that is wanted has a pressure node: that mode does not feel it,
 *  the others leak through it (Wolfe & Smith 2003, "Cutoff frequencies and cross fingerings in baroque,
 *  classical, and modern flutes", JASA 114, 2263–2272; the register hole as a junction in a waveguide:
 *  Scavone 1997, thesis, CCRMA, Stanford). The hole is a leak across the bore one period of the note from the
 *  foot's reflection: the pressure there (the wave going down and the wave coming back) loses this share (the
 *  junction's 1 − 2Z_hole/(2Z_hole + Z_0), taken as a resistance: the mass of the air in the hole is left
 *  out), sent back both ways inverted. On its own mode the two waves cancel there and it takes nothing. It
 *  opens over VENT_OPEN (s) under a note joined to another; with the wave carried (CARRY) such a note arrives
 *  on its mode without it, and it keeps it there (of the falls from the third register to the octave below,
 *  tongued or after a rest, one in ten took 40–50 ms without it and none more than 10 with).
 *
 *  A note from silence that a file told of has it from its first sample. Without it a short note of the third
 *  register sounded a second mode of its tube beside its own for a hundred milliseconds and more (the quick
 *  attack a short note is given, QUICK_AIM, raises them both): every note of the compass alone, at six
 *  dynamics, told ahead as lasting 140, 280 and 500 ms, at 44.1 and 48 kHz (1332 notes), 21 were not on
 *  their pitch over their second half (F6 and G6 of 140 ms at every dynamic, 40–180 ¢ sharp and half
 *  periodic; E♭6 pp of 280 ms on its tube's fourth mode at 44.1 kHz), and none is with it. A note from
 *  silence that nothing told of (a key in the hand, the long tone the recordings were fitted on and the
 *  judge hears) is played without it, as before, bit-identical. */
const VENT = 0.2;
const VENT_OPEN = 0.01;
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

/** is the note fingered with a vent hole (VENT)? The third register, and D5 and E♭5 */
const vented = (m: number): boolean => m >= 86 || m === 74 || m === 75;

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
    if (immediate) {
      this.carryFrom = -1;
      this.fadeN = 0;
      this.ventTo = this.ventG = 0;
      this.ventLive = 0;
    } else {
      // to another register: the tube's wave goes with the note (CARRY), from the note it is on (a second
      // change before the first was made: still from that one); the note's vent (VENT)
      const from = this.carryFrom >= 0 ? this.carryFrom : this.note;
      this.carryFrom = fluteFingering(from).mode !== mode ? from : -1;
      this.ventTo = vented(m) ? VENT : 0;
    }
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
  /** the note whose wave is in the tube when the next render carries it to another register's (CARRY); −1:
   *  nothing to carry */
  private carryFrom = -1;
  private scratch = new Float64Array(BUF);
  /** what was radiated (the left channel's sum, and the jet's flow), kept to carry the old note's last
   *  period on over a change of register: samples left of that, its length, the old note's period (samples)
   *  and the frame the change was made at */
  private outHist = new Float64Array(BUF);
  private qHist = new Float64Array(BUF);
  private fadeN = 0;
  private fadeLen = 1;
  private fadeP = 100;
  private fadeAt = 0;
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
      this.attackBoost = 0;
      this.tongueAt = this.frame;
    } else if (a.kind === 'tongue') {
      const fresh = this.level < 1e-3;
      this.setNote(m, fresh);
      // (a file's note, told ahead: its vent is open from its first sample, VENT)
      if (fresh && a.len < Infinity && vented(m)) this.ventTo = this.ventG = VENT;
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
      this.breathStart = this.frame;
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
      const wait = this.lick.retongue(a.struck, this.fs, same, LICK_OPEN * this.fs);
      this.tongueAt = this.frame + wait;
      this.chiff = first ? 0.6 + 0.8 * v : 0.3 + 0.4 * v;
      this.tongueAmp = TONGUE_PUSH * (first ? 1 : LICK_BOOST) * (0.5 + 0.5 * v);
      this.tongueLen = Math.max(4, Math.round((0.5 * this.fs) / et(m)));
      this.tongueN = this.tongueLen;
      this.tongueWait = wait;
      this.attackBoost = ATTACK_BOOST * (0.6 + 0.4 * v) * (first ? 1 + QUICK_AIM - v : LICK_BOOST);
      this.blowUntil = this.frame + Math.round(MIN_BLOW * this.fs);
    }
    if (a.tap) this.release();
  }
  /** samples before the jet's push begins (the tongue is still across the air), and the decay of its
   *  sharper aim (s) */
  private tongueWait = 0;
  /** when this breath began (frame): a note from silence. The vibrato comes in over the breath, not over
   *  each note of it: slurred or tongued over the breath, the notes of a phrase share one vibrato. (It used
   *  to begin again with every note, 0.3 s in and 0.4 s to its depth: in a slurred line of notes under 0.7 s
   *  there was none at all, and in a slower one each note went straight before it came back.) */
  private breathStart = 0;
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
    this.carryFrom = -1;
    this.fadeN = 0;
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
    const age = (this.frame - this.breathStart) / fs;
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
    this.jetDTarget = clamp((fs * ljEff) / (0.45 * Math.max(Uj, 4)), 2, BUF / 2);
    // players "lip" the pitch back as they blow harder; compensate 75 % of the drift
    this.Dtarget = (this.Dnom + 0.75 * (this.boreDelayFor(this.jetDTarget) * this.tuningCorrection(this.note) - this.Dnom)) * this.bendFactor;
    if (this.carryFrom >= 0) this.carry();
    const ventStep = VENT / (VENT_OPEN * fs);
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
      // the vent: the pressure at it is the wave going down and the wave back from the foot; the share it
      // lets out goes back both ways, inverted: to the foot and round (into r), and straight to the embouchure
      let vUp = 0;
      if (venting) {
        if (this.ventG !== this.ventTo) {
          const d = this.ventTo - this.ventG;
          this.ventG += d > ventStep ? ventStep : d < -ventStep ? -ventStep : d;
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
      let out = dqScale * (V.radFoot * dr + V.radDflow * dq) + V.radFlow * q + V.noiseOut * noise;
      let qOut = q;
      if (this.fadeN > 0) {
        // (a change of register: the old note's last period, carried on, under the new note coming in)
        const j = this.fadeLen - this.fadeN;
        const x = this.fadeAt - this.fadeP + (j % this.fadeP);
        const xi = Math.floor(x);
        const xf = x - xi;
        const x2 = xi + 1 >= this.fadeAt ? xi + 1 - Math.round(this.fadeP) : xi + 1;
        const g = 0.5 - 0.5 * Math.cos((Math.PI * (j + 1)) / (this.fadeLen + 1));
        const oOld = this.outHist[xi & mask] * (1 - xf) + this.outHist[x2 & mask] * xf;
        const qOld = this.qHist[xi & mask] * (1 - xf) + this.qHist[x2 & mask] * xf;
        out = oOld + (out - oOld) * g;
        qOut = qOld + (q - qOld) * g;
        this.fadeN--;
      }
      this.outHist[w & mask] = out;
      this.qHist[w & mask] = qOut;
      oL[t] = out;
      oR[t] = 0.9 * out + 0.4 * qOut;
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

  /** The tube's wave goes with the note to another register (CARRY): the bore's history and the jet's are
   *  written again at the new note's pitch (the wave as it was `rho` times as far back), the tube and the
   *  jet's delay are the new note's at once, and what was radiated is carried on for CARRY. Called between
   *  blocks, from the block's first sample. */
  private carry(): void {
    const fs = this.fs;
    const rho = Math.pow(2, (this.note - this.carryFrom) / 12);
    this.carryFrom = -1;
    const w1 = this.frame - 1;
    const mask = BUF - 1;
    const sc = this.scratch;
    const jetD = clamp(this.jetD / rho, 2, BUF / 2);
    for (let pass = 0; pass < 2; pass++) {
      const buf = pass ? this.jet : this.bore;
      // (as far back as the new tube, or the jet, will read; and no further than there is history for)
      const want = pass ? 1.5 * jetD + 8 : 1.05 * this.Dtarget + 8;
      const N = Math.min(Math.ceil(want), Math.floor((BUF - 8) / Math.max(1, rho)));
      for (let i = 0; i < N; i++) {
        const x = i * rho;
        const xi = Math.floor(x);
        const xf = x - xi;
        sc[i] = buf[(w1 - xi) & mask] * (1 - xf) + buf[(w1 - xi - 1) & mask] * xf;
      }
      for (let i = 0; i < N; i++) buf[(w1 - i) & mask] = sc[i];
    }
    this.D = this.Dtarget;
    this.jetD = jetD;
    // (the old note's vent is shut with its tube: on its own mode it held nothing)
    if (this.ventG > 0 || this.ventLive > 0) {
      this.vent.fill(0);
      this.ventLp = 0;
      this.ventG = 0;
    }
    this.fadeLen = this.fadeN = Math.max(1, Math.round(CARRY * fs));
    this.fadeP = Math.max(2, (fs / this.fTarget) * rho * this.bendFactor);
    this.fadeAt = this.frame;
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
