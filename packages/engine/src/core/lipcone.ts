// Buzzing lips on a conical bore: the engine the horn and the tuba share (horn.ts, tuba.ts: each its own
// compass, valves, tube lengths, fitted voicing and tuning table; this file is the air line, the lips, the
// tongue and the note handling, moved here from horn.ts unchanged when the tuba came: the horn renders bit
// for bit as it did).
//
// The bore. Most of a horn's bore widens steadily, and nearly all of a tuba's (Fletcher & Rossing 1998, "The
// Physics of Musical Instruments" §14.6; Campbell, Gilbert & Myers 2021, "The Science of Brass Instruments"
// §8): as a cone, it plays the whole series n·c/2(L + x₀). So the bore is the oboe's and bassoon's
// "cylindrical saxophone" (Dalmont, Gilbert & Kergomard 2000, Acta Acustica 86, 671): two delay lines meeting
// at the lips, the tube itself and its missing apex x₀ (the cone carried on behind the mouthpiece), both
// open (−1 at 0 Hz). (A single tube closed at the lips and open at the bell plays only the odd multiples of
// c/4L: a clarinet.) At the far end the bell reflects the lows and lets the highs out (a low-pass
// reflection; above the bell's cutoff the resonances fade), with a little wall loss; the tube's round trip
// plus the apex's is one period of the tube's fundamental, so its n-th resonance is the note. The
// instrument's fingering (its spec) sets the valves and the partial.
//
// The lips. A one-mass "outward-striking" valve (Helmholtz's lip reed; Fletcher 1979, Acustica 43, 63;
// Elliott & Bowsher 1982, JSV 83, 181; Adachi & Sato 1996, JASA 99, 1200): the pressure difference across
// them, Δp = mouth − mouthpiece, pushes them open, so a mass–spring driven by Δp, its resonance a little
// under the note (an outward-striking valve plays just above its own resonance, where its motion lags the
// pressure by more than a quarter cycle). The flow through the slit is Bernoulli's, u = ζ·h·√|Δp|·sgn Δp,
// h = max(0, h₀ + y) the opening; and the mouthpiece pressure p = a₁ + a₂ + u/2 (Z_c = 1; a₁, a₂ the waves
// back from the bell and from the apex, the flow splitting between the two branches). Both are solved
// together each sample in closed form (a quadratic in √|Δp|). In units where
// the lips' static opening grows by one per unit of Δp: γ the mouth pressure, the dynamic.
//
// The sound. The radiated wave is what the bell lets out (the complement of its reflection), then the
// instrument's colour, fitted to the recordings. Loud, the tone turns brassy: the lips close sharply each
// cycle, and the wave steepens on its way down the tube (a crest travels faster than a trough; Hirschberg et
// al. 1996), so what reaches the bell is read earlier or later by its own pressure: a loud note radiates
// high harmonics a soft one does not (the corner of the fall moves up with the dynamic too).

import { Pump } from './pump.ts';
import { MonoKeys, quickness, quickRise, Tongue } from './mono.ts';
import type { KeySummary } from '../api/messages.ts';
import { CC_DYNAMICS, DYN_TAU, type ExciteTrace, type InstrumentCore } from './instrument.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { biquadHighpass, biquadHighShelf, biquadLowpass, biquadPeaking } from './filters.ts';
import type { PianoEvent } from './piano-core.ts';
import { clamp, Human, interp, mulberry32, playerCents, playerSeed, playerVibrato } from './util.ts';

export interface LipConeParams {
  /** blowing pressure scale (1 = the dynamic's own) */
  breath: number;
  /** the lips' tension: semitones above (+) or below (−) the note's own; far enough, the next partial speaks */
  lip: number;
  /** turbulence noise amount */
  noise: number;
  /** lip vibrato depth (fraction of the lips' frequency) */
  vibrato: number;
  /** the player (an instrument whose spec has one: the tuba): 0 the model alone, every note the same and
   *  held dead still … 1 a player's breath, lips and tongue (LipConeHuman) */
  human?: number;
  room: number;
  volume: number;
  /** orchestra mode: where it sits on the stage (post.ts Seat); none, the single instrument's place */
  seat?: Seat | null;
  /** fitting only (scripts/fit-horn.ts, fit-tuba.ts): the voicing, overridden */
  voice?: Partial<LipConeVoice>;
}


const BUF = 1 << 13;
const TRACE = 2048;
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** the instruments built on this core */
export type LipConeId = 'horn' | 'tuba';

/** a fingering: the valves down, how far they lower the tube (semitones), the tube's resonance that sounds */
export interface ConeFingering {
  valves: string;
  lower: number;
  /** which resonance of the tube sounds (1 = its fundamental, the pedal) */
  partial: number;
}

/** a measured voicing table: cents the bare model plays sharp, by note and sample rate */
export interface TuningTable {
  fs: number[];
  midi: number[];
  cents: number[][];
}

/** What makes one instrument of this core: its compass, how it is fingered, its fitted voicing. */
export interface LipConeSpec<F extends ConeFingering = ConeFingering> {
  id: LipConeId;
  /** the compass as it sounds (MIDI) */
  lo: number;
  hi: number;
  /** the note the instrument is set for before any is played */
  rest: number;
  /** the fitted voicing, and the measured tuning table (read at each note: a script may replace it) */
  voice: LipConeVoice;
  tuning: () => TuningTable;
  /** the output level, matched to the recordings */
  gain: number;
  /** the breath noise's seed (each instrument its own stream) */
  seed: number;
  /** the fingering of a note, the tube's length for one (m), and a fingering in words (the key summary's,
   *  and the line over the lips' trace) */
  fingering: (m: number) => F;
  tubeLength: (f: F) => number;
  prep: (f: F) => string;
  meta: (f: F) => string;
  /** the shortest tongued note: the breath stays on this long after the tongue's release, at velocity 1 and
   *  127 (s; the horn's 0.25 and 0.1 when not given) */
  minBlowPp?: number;
  minBlow?: number;
  /** what the stopped lips take from the tube while the tongue holds the air (dB/s; the horn's 60 when not
   *  given: STOP_RATE) */
  stopRate?: number;
  /** its player (none: the model alone, as the horn is) */
  human?: LipConeHuman<F>;
}

/** A player on the instrument: what no two notes of his have alike, and what a held note does. Measured on
 *  the recordings where they say (scripts/tuba-variation.ts: a held note's level peaks a third of a second in
 *  and then falls; its pitch wanders 2 ¢), a player's known habits elsewhere. All of it is scaled by the
 *  `human` parameter, and a seeded stream: the same notes give the same samples. */
export interface LipConeHuman<F extends ConeFingering = ConeFingering> {
  seed: number;
  /** the breath over a held note: it begins this share under and comes up over `bloomTau` s (a tongued note
   *  blooms; one tongued over the breath a third as much), then sags by `sag` (a share) over `sagTau` s as
   *  the air is spent, and wanders by `drift` (a share, a standard deviation) */
  bloom: number;
  bloomTau: number;
  sag: number;
  sagTau: number;
  drift: number;
  /** the pitch's slow wander (cents, a standard deviation) */
  wander: number;
  /** from one tongued note to the next (standard deviations): the tongue's hold and the lips' kick (shares),
   *  the breath (velocity steps), and the lips set a little off the note for its first moments (cents,
   *  dying over `scoopTau` s) */
  hold: number;
  kick: number;
  vel: number;
  scoop: number;
  scoopTau: number;
  /** the air: the tongue's release lets a puff through (× the breath noise at the release, dying over
   *  `puffTau` s) */
  puff: number;
  puffTau: number;
  /** how sharp (+) or flat a fingering is left by the player (cents): the valves' loops are cut for the open
   *  tube and fall short together, and the series' own partials are not equal temperament's */
  intonation: (f: F) => number;
  /** where the lips (and the hand in the bell) put a note, found by ear (cents, a standard deviation): a
   *  note's own for as long as it sounds, and the same again while its pitch is struck again. The horn's
   *  (the tuba's player has none, and draws nothing for it) */
  place?: number;
  /** the pitch's slower wander (cents, a standard deviation, over `slowTau` s): the horn's */
  slow?: number;
  slowTau?: number;
  /** the breath's rise from one tongued note to the next (a share, a standard deviation): the horn's */
  rise?: number;
  /** a note known to be short (a file's: mono.ts quickness) gets less of the attack's variation, a quick one
   *  none, as the trombone's: a player must not cost a run its notes */
  quick?: boolean;
}

/** The voicing: the lips, the bore's losses and the radiation's colour, each instrument's fitted to its
 *  recordings (the horn's: horn.ts HORN_VOICE; the tuba's: tuba.ts TUBA_VOICE). The comments are the horn's,
 *  the first fitted: "B♭1" and "F5" stand for the bottom and the top of an instrument's compass. */
export interface LipConeVoice {
  /** the lips: their quality factor (their own resonance's sharpness) at the low end of the compass and at
   *  the top. Fitted near 50, far above the 3–10 measured on players' lips (Newton, Campbell & Gilbert 2008,
   *  JASA 123, 3592): one mass on a spring stands in for an embouchure a player keeps adjusting, and only a
   *  sharp resonance holds a note on its partial with the next one a tone away (at Q 6–16 the low notes fell
   *  to the pedal or did not speak, and high ones cracked: scripts/horn-regimes.ts). The cost is a slower
   *  start, eased by qAttack */
  lipQ: number;
  lipQTop: number;
  /** the lips' resonance below the note (semitones) */
  lipBelow: number;
  /** their rest opening (in units of the static opening per unit Δp), and the widest they open (the lips'
   *  own width and the mouthpiece's rim hold them) */
  h0: number;
  hMax: number;
  /** the slit's flow coefficient ζ (Bernoulli, over the bore's characteristic impedance) at B♭1 and at F5 */
  zeta: number;
  zetaTop: number;
  /** the mouth pressure at velocity 1 and 127, and the curve between (velocity^gammaCurve) */
  gammaLo: number;
  gammaHi: number;
  gammaCurve: number;
  /** …and how it follows the note (a high note needs firmer lips and more pressure): × (f/f(B♭1))^gammaExp */
  gammaExp: number;
  /** the breath's rise (s, a time constant) for a soft note and a loud one, × (f/f(B♭1))^riseExp up the
   *  compass (the recordings' top notes speak in 10–20 ms) */
  riseLo: number;
  riseHi: number;
  riseExp: number;
  /** the tongue: the lips held still this long (s) while the breath builds, then let go over this many
   *  periods */
  tongueHold: number;
  tongueRel: number;
  /** the tongue's release: the lips let go already swinging (a displacement, ringing at their own
   *  frequency: the trumpet's kick, brass.ts), and their coupling transiently stronger (×(1 + attackBoost),
   *  decaying with attackTau, s), as a player's attack sets them buzzing at once */
  kick: number;
  /** …and loose: their quality factor starts this fraction lower and firms up with qTau (s). The lips'
   *  sharp resonance is what holds a note on its partial, but a resonance that sharp cannot follow a
   *  buzz growing quickly (its envelope's bandwidth is f/Q: a quarter of a second at B♭1) */
  qAttack: number;
  qTau: number;
  attackBoost: number;
  attackTau: number;
  /** the missing apex x₀, as where the cone's resonances leave their gap: the (L + x₀)/x₀-th resonance of
   *  the tube is weak, here apexRel × the note's partial, so the gaps fall at the same places in every
   *  note's spectrum (apexRel × the note, and its multiples: kept off the low harmonics). An effective
   *  length, not a measured one (the horn is not a cone: its mouthpiece's volume and its mouthpipe make its
   *  low resonances strong, and above ~700 Hz its bell lets them go): long on a low note (strong
   *  resonances, a quick start), short on a high one, played near its tube's 12th partial. A gap a fixed
   *  number of partials above the note fell on the second harmonic of the notes on the sixth */
  apexRel: number;
  /** the wave steepening on its way down the tube (nonlinear propagation: a crest travels faster than a
   *  trough, Hirschberg et al. 1996, JASA 99, 1754; "brassiness", Campbell 1999): what reaches the bell is
   *  read this fraction of the round trip earlier per unit of its pressure, so a loud note radiates its
   *  high harmonics far more strongly than a soft one (in the radiated sound: the reflection, a low-pass, is
   *  left as it is) */
  steep: number;
  /** the bell's reflection: a second-order low-pass (Hz, Q) and the round trip's loss at audio frequencies
   *  (the mean pressure reflected whole) */
  bellFc: number;
  bellQ: number;
  wall: number;
  /** turbulence in the lips' slit: noise in the flow, ∝ the flow, at B♭1 and at F5 (between, on the note:
   *  the recordings' harmonics-to-noise ratio rises from ~32 dB at B♭1 to ~48 at F5) */
  noise: number;
  noiseTop: number;
  /** how much airier a soft note is (× the noise at the softest dynamic, less one; absent: no airier) */
  noiseSoft?: number;
  /** the radiation's colour: a high-pass (Hz); a formant (Hz, dB, Q: the horn's harmonics gather near
   *  500 Hz); a low-pass at lp × (f₀/440 Hz)^lpExp (Hz, Q), lpDyn octaves lower at velocity 1 than at 127;
   *  a shelf above shelfF (dB) */
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
  /** the level across the compass, dB an octave */
  tilt: number;
}


/** the shortest tongued note: the breath stays on this long after the tongue's release, at velocity 1 and
 *  127, even when the key is let go sooner (s) */
const MIN_BLOW_PP = 0.25;
const MIN_BLOW = 0.1;
/** a note known to be short: the tongue holds the lips for at most this share of it */
const HOLD_SHARE = 0.1;
/** tongued over the breath (mono.ts): the transient of the lips set buzzing again is this much of a first
 *  attack's */
const LICK_BOOST = 0.5;
/** a short note's attack (quickLips) */
const QUICK_KICK = 2;
const QUICK_LIP = 1;
const QUICK_LIP_TAU = 0.03;
/** what the stopped lips take from the tube while the tongue holds the air (dB/s, at each of the tube's
 *  round trips), on top of its own decay with the lips shut: a tongued stop decays about as a real bore's
 *  resonances do (Li, Almeida, Smith & Wolfe 2016, JASA 139: 400 dB/s on the clarinet; a horn's long tube
 *  loses less a second). With none a repeated note fell 2.7 dB between its strokes; with this, 8 */
const STOP_RATE = 60;
/** the radiation chain's sections (voiced(): high-pass, formant, low-pass, shelf) */
const LP_SECTION = 2;

export class LipConeCore<F extends ConeFingering = ConeFingering> implements InstrumentCore {
  readonly id: LipConeId;
  /** the instrument: its compass, fingering, voicing, tuning table, level */
  protected readonly spec: LipConeSpec<F>;
  readonly fs: number;
  params: LipConeParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = 1;
  sympatheticAllowed = true;
  dry: boolean;
  private V: LipConeVoice;
  private queue: { frame: number; ev: PianoEvent | { type: 'control'; cc: number; value: number } }[] = [];
  /** the tube (waves leaving the lips towards the bell) and the missing apex (towards its point) */
  private bore = new Float64Array(BUF);
  private apexB = new Float64Array(BUF);
  private D = 400;
  private Dtarget = 400;
  private D2 = 40;
  /** the bell's reflection (biquad coefficients and state) and the mean pressure (reflected whole) */
  private bc = new Float64Array(5);
  private bx1 = 0;
  private bx2 = 0;
  private by1 = 0;
  private by2 = 0;
  private mean = 0;
  private kMean = 0;
  /** the apex's reflection (the same low-pass: its state) and its mean */
  private ax1 = 0;
  private ax2 = 0;
  private ay1 = 0;
  private ay2 = 0;
  private mean2 = 0;
  /** the radiated wave (what the bell lets through), for the pictures */
  private radNow = 0;
  /** the lips: displacement (two samples), the last pressure difference and its slow part */
  private y1 = 0;
  private y2 = 0;
  private dpPrev = 0;
  private lipF = 440;
  private lipFTarget = 440;
  private fingering: F;
  private rng: () => number;
  private pressure = 0;
  private pTarget = 0;
  private attackTau = 0.02;
  private tongueN = 0;
  private kickPending = false;
  private tongueI = 0;
  private tongueLen = 1;
  private vibPhase = 0;
  private vib0 = 0;
  private vibRate = 1;
  private expression = 1;
  private dynTarget = 0;
  private dyn = 0;
  private bendFactor = 1;
  private tune = 0;
  private note: number;
  /** the keys as one player takes them (mono.ts), and the tongue's stroke on a sounding note */
  private keys: MonoKeys;
  private lick = new Tongue();
  /** the tongue has held the last note stopped over a rest: the next is let go as a first attack is */
  private afterStop = false;
  /** a strength taken up once the tongue is down (0: none): tongued over the breath, the air through the
   *  stroke's first milliseconds is still the last note's, so nothing steps under a sounding tone */
  private velNext = 0;
  /** when the tongue last let go (frame), and how much of a first attack's transient that stroke has (the
   *  lips' wider swing and lower Q, their kick: 1 for a note from silence) */
  private tongueAt = 0;
  private boostNow = 1;
  private qDipNow = 1;
  private kickNow = 1;
  private lipDipNow = 0;
  /** the lips are kicked as the stroke under way lets go */
  private lickKick = false;
  private velocity = 80;
  private eq = new BiquadChain();
  private lpNote = 900;
  private lpSet = -1;
  private tiltNote = 1;
  private tiltOut = 1;
  private zetaNote = 0.5;
  private noiseNote = 0.03;
  private riseNote = 1;
  private qNote = 6;
  private gNote = 1;
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
  /** the shortest tongued note's breath, at velocity 1 and 127 (s): the spec's, else the horn's */
  private minBlowPp = MIN_BLOW_PP;
  private minBlow = MIN_BLOW;
  /** the lips' opening and the blowing pressure, now (for the pictures) */
  private hNow = 0;
  private gammaNow = 0;
  /** the player (spec.human): his stream; the breath's and the pitch's slow wander (each a random walk
   *  drawn back to rest, and smoothed); this note's own breath (velocity steps), its lips' first offset
   *  (cents), how much it blooms, and its fingering's intonation (cents) */
  private hum: Human | null = null;
  private driftRaw = 0;
  private drift = 0;
  private wanderRaw = 0;
  private wander = 0;
  private velJit = 0;
  private scoopNow = 0;
  private bloomNow = 1;
  /** where this note's pitch was put (cents), and the pitch's slow wander (a walk drawn back to rest) */
  private place = 0;
  private slowRaw = 0;

  constructor(spec: LipConeSpec<F>, opts: { sampleRate: number; params?: Partial<LipConeParams>; dry?: boolean; player?: number }) {
    this.spec = spec;
    if (spec.minBlowPp !== undefined) this.minBlowPp = spec.minBlowPp;
    if (spec.minBlow !== undefined) this.minBlow = spec.minBlow;
    this.id = spec.id;
    this.note = spec.rest;
    this.fingering = spec.fingering(spec.rest);
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.params = { breath: 1, lip: 0, noise: 1, vibrato: 0, room: 0.3, volume: 1, ...opts.params };
    this.V = { ...this.spec.voice, ...this.params.voice };
    this.keys = new MonoKeys(this.fs);
    this.rng = mulberry32(playerSeed(spec.seed, opts.player));
    if (spec.human) this.hum = new Human(spec.human.seed, opts.player);
    const pv = playerVibrato(opts.player);
    this.vib0 = this.vibPhase = pv.phase;
    this.vibRate = pv.rate;
    this.tune = playerCents(opts.player) / 100;
    if (this.tune) this.bendFactor = Math.pow(2, -this.tune / 12);
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    this.voiced();
    this.setNote(spec.rest, true);
  }

  /** everything the voicing fixes: the bell's reflection, the radiation's colour, the level */
  private voiced(): void {
    const fs = this.fs;
    const V = this.V;
    const b = biquadLowpass(Math.min(0.45 * fs, V.bellFc), V.bellQ, fs);
    this.bc.set([b[0], b[1], b[2], b[3], b[4]]);
    this.kMean = 1 - Math.exp((-2 * Math.PI * 20) / fs);
    this.eq.set([
      biquadHighpass(V.hp, 0.7, fs),
      biquadPeaking(V.f1, V.q1, V.g1, fs),
      biquadLowpass(Math.min(0.45 * fs, V.lp), V.lpQ, fs),
      biquadHighShelf(Math.min(0.4 * fs, V.shelfF), V.shelfG, fs),
    ]);
    this.lpSet = -1;
    this.room.configure(this.params.room, this.params.seat);
    // (matched to the recordings: the spec's gain)
    this.gain = this.spec.gain * this.params.volume;
  }

  /** the measured voicing table's correction for a note (cents the bare model plays sharp, by sample rate) */
  private tuningCorrection(m: number): number {
    const t = this.spec.tuning();
    if (!t.midi?.length) return 1;
    const rows = t.cents.map((r) => interp(m, t.midi, r));
    const c = t.fs.length > 1 ? interp(this.fs, t.fs, rows) : rows[0];
    return Math.pow(2, c / 1200);
  }

  /** how much of a player there is (0: none; an instrument without one: 0) */
  private get human(): number {
    return this.spec.human ? clamp(this.params.human ?? 1, 0, 1) : 0;
  }

  private setNote(m: number, immediate: boolean): void {
    const fs = this.fs;
    const V = this.V;
    const fg = this.spec.fingering(m);
    this.fingering = fg;
    // (the player's intonation on this fingering: the tube is that much short or long, and the lips with it)
    const H = this.human;
    const f = H > 0 ? et(m) * Math.pow(2, (H * this.spec.human!.intonation(fg) + this.place) / 1200) : et(m);
    // the tube's round trip and the apex's are one period of the tube's fundamental (the note over its
    // partial), less each end's reflection's phase delay at the note (so that its n-th resonance is the
    // note) and the interpolation
    const c = this.tuningCorrection(m);
    const w0 = (2 * Math.PI * f) / fs;
    const lag = biquadPhaseDelay(this.bc, w0);
    const T = ((fg.partial * fs) / f) * c;
    this.D2 = Math.max(1, T / (fg.partial * V.apexRel));
    this.Dtarget = Math.max(2, T - this.D2 - 2 * lag - 1);
    if (immediate) this.D = this.Dtarget;
    this.lipFTarget = f / c;
    if (immediate) this.lipF = this.lipFTarget * Math.pow(2, -V.lipBelow / 12);
    const u = clamp((m - this.spec.lo) / (this.spec.hi - this.spec.lo), 0, 1);
    this.zetaNote = V.zeta + (V.zetaTop - V.zeta) * u;
    this.noiseNote = V.noise + (V.noiseTop - V.noise) * u;
    this.riseNote = Math.pow(f / et(this.spec.lo), V.riseExp);
    this.qNote = V.lipQ + (V.lipQTop - V.lipQ) * u;
    this.gNote = Math.pow(f / et(this.spec.lo), V.gammaExp);
    this.lpNote = V.lp * Math.pow(f / 440, V.lpExp);
    this.lpSet = -1;
    this.tiltNote = Math.pow(f / et(this.spec.lo), V.tilt / 6.0206);
    if (immediate) this.tiltOut = this.tiltNote;
    this.note = m;
    const fb = f / fg.partial;
    for (let k = 0; k < 16; k++) this.modeFreqs[k] = (k + 1) * fb;
  }

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

  /** the tongue's withdrawal for a note, samples (tongueRel periods of it) */
  private tongueOpen(m: number): number {
    return Math.max(1, Math.round((this.V.tongueRel * this.fs) / et(m)));
  }

  /** The lips for an attack on a note known to be short (`quick` 1; 0: the long tone's attack, as fitted).
   *  The long tone begins loose: the lips' Q lower and their coupling stronger for a moment (qAttack,
   *  attackBoost), and before the tube's first reflections are back (a round trip of 22 ms) they buzz
   *  against its wave impedance alone, which stiffens them: the note begins up to 300 cents sharp, on the
   *  partial above, and comes down over 85–140 ms (scripts/winds-midi-bench.ts: a 139 ms note reached
   *  −16…0 dB of its held level, off its pitch throughout). A player who knows the note is short sets the
   *  lips firm (no loosening), kicks them harder (QUICK_KICK more) and a little low (QUICK_LIP semitones,
   *  for QUICK_LIP_TAU) so that their loaded buzz is the note: −6…+3 dB, within 75 cents from 30 ms, at
   *  its pitch in 35–110 ms (the lowest notes last: their tube is longest). */
  private quickLips(quick: number): void {
    this.boostNow = 1 - quick;
    this.qDipNow = 1 - quick;
    this.kickNow = 1 + QUICK_KICK * quick;
    this.lipDipNow = quick;
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
        // (below 0, CC_REST: back to the breath the note asks for)
        if (ev.cc === 1 || ev.cc === 2 || ev.cc === 11) this.expression = ev.value < 0 ? 1 : 0.4 + 0.8 * clamp(ev.value, 0, 1);
        else if (ev.cc === CC_DYNAMICS) this.dynTarget = clamp(ev.value, -64, 64);
        break;
      case 'bend':
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
      this.lick.stop(this.fs, a.len * this.fs, this.tongueOpen(this.note));
      this.releasePending = false;
      this.afterStop = true;
      return;
    }
    const m = clamp(a.midi, this.spec.lo, this.spec.hi);
    // (the player puts the note by ear: where it was while its pitch is struck again, somewhere new otherwise)
    const hu = this.spec.human;
    if (hu?.place && this.hum && (m !== this.note || !(this.pTarget > 0))) this.place = this.human * hu.place * this.hum.near();
    const was = this.velocity;
    const vel = a.velocity || this.velocity;
    this.velocity = vel;
    this.velNext = 0;
    if (a.kind === 'retongue' && !(a.struck && this.lick.landed)) {
      this.velNext = vel;
      this.velocity = was;
    }
    this.releasePending = false;
    // (a stroke made ahead for a note that came otherwise lets go)
    if (this.lick.down && !(a.kind === 'retongue' && a.struck)) this.lick.release(this.tongueOpen(this.note));
    if (a.kind === 'slur') {
      this.setNote(m, false);
      // (back to a note still held: the lips and the tube only)
      if (a.velocity) {
        this.pTarget = 1;
        this.attackTau = 0.01;
      }
    } else if (a.kind === 'tongue') {
      this.setNote(m, this.level < 1e-3);
      this.pTarget = 1;
      this.lick.reset();
      this.lickKick = false;
      // a note known to be short speaks within a share of its length (mono.ts); one of unknown length (a
      // key in the hand) gets the long tone's rise the recordings were fitted on
      this.attackTau = quickRise((this.V.riseLo + (this.V.riseHi - this.V.riseLo) * (vel / 127)) * this.riseNote, a.len);
      // tongued: the lips held while the breath builds, then let go
      this.tongueN = Math.round(quickRise(this.V.tongueHold, a.len, HOLD_SHARE) * this.fs);
      this.tongueLen = this.tongueOpen(this.note);
      this.tongueI = 0;
      this.kickPending = true;
      this.vibPhase = this.vib0;
      this.noteStart = this.frame;
      this.tongueAt = this.frame;
      this.quickLips(quickness(a.len));
      this.newNote(1, a.len);
      this.afterStop = false;
      this.blowUntil = this.frame + Math.round((this.minBlowPp + (this.minBlow - this.minBlowPp) * (vel / 127)) * this.fs);
    } else {
      // tongued over the breath: the lips and the tube move, the tongue stops the air and lets it go again
      const same = m === this.note;
      this.setNote(m, false);
      this.pTarget = 1;
      this.attackTau = Math.min(this.attackTau, quickRise((this.V.riseLo + (this.V.riseHi - this.V.riseLo) * (vel / 127)) * this.riseNote, a.len));
      this.tongueAt = this.frame + this.lick.retongue(a.struck, this.fs, same, this.tongueOpen(this.note));
      if (this.afterStop) this.quickLips(1);
      else {
        this.boostNow = LICK_BOOST;
        this.qDipNow = LICK_BOOST;
        this.kickNow = LICK_BOOST;
        this.lipDipNow = 0;
      }
      this.afterStop = false;
      this.lickKick = true;
      this.noteStart = this.frame;
      this.newNote(1 / 3, a.len);
      this.blowUntil = this.frame + Math.round(this.minBlow * this.fs);
    }
    if (a.tap) this.release();
  }

  /** A player's new note (tongued from silence: `bloom` 1; over the breath: less): no two alike. Its tongue
   *  holds a little longer or shorter, its lips are kicked a little more or less and set a few cents off for
   *  their first moments, its breath is a little stronger or weaker. */
  private newNote(bloom: number, len?: number): void {
    const hu = this.spec.human;
    const H = this.human;
    if (!hu || !this.hum || !(H > 0)) {
      this.velJit = this.scoopNow = 0;
      this.bloomNow = 0;
      return;
    }
    const hum = this.hum;
    // (the attack's own variation: less of it on a note known to be short, where the spec says so)
    const A = hu.quick ? H * (1 - quickness(len ?? Infinity)) : H;
    this.bloomNow = bloom;
    this.velJit = H * hu.vel * hum.near();
    this.scoopNow = A * hu.scoop * hum.near();
    this.kickNow *= Math.max(0.3, 1 + A * hu.kick * hum.near());
    if (this.tongueN > 0 && bloom === 1) this.tongueN = Math.max(1, Math.round(this.tongueN * Math.max(0.4, 1 + A * hu.hold * hum.near())));
    if (hu.rise) this.attackTau *= Math.max(0.4, 1 + A * hu.rise * hum.near());
  }

  /** The key is up: stop blowing, but not before the tongued note has had its minimum breath. */
  private release(): void {
    if (this.pTarget > 0 && this.frame < this.blowUntil) this.releasePending = true;
    else this.pTarget = 0;
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<LipConeParams>) };
    if (this.params.voice !== old.voice) {
      this.V = { ...this.spec.voice, ...this.params.voice };
      this.voiced();
      this.setNote(this.note, false);
    } else if (this.params.room !== old.room || this.params.volume !== old.volume) this.voiced();
    else if (this.params.seat !== old.seat) this.room.configure(this.params.room, this.params.seat);
  }

  /** the one note actually sounding (a monophonic instrument: the last held key wins and a release
   *  returns to the previous held one), or none */
  sounding(): number[] {
    return this.pTarget > 0 && !this.keys.silent ? [this.note] : [];
  }

  allSoundOff(): void {
    this.dyn = this.dynTarget = 0;
    this.pressure = this.pTarget = 0;
    this.releasePending = false;
    this.keys.clear();
    this.keys.forget();
    this.lick.reset();
    this.lickKick = false;
    this.clear();
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  private clear(): void {
    this.bore.fill(0);
    this.apexB.fill(0);
    this.bx1 = this.bx2 = this.by1 = this.by2 = this.mean = 0;
    this.ax1 = this.ax2 = this.ay1 = this.ay2 = this.mean2 = 0;
    this.y1 = this.y2 = this.dpPrev = 0;
    this.tongueN = 0;
    this.tongueI = this.tongueLen;
    this.level = 0;
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
      if (this.keys.strokeNow >= 0) this.lick.ahead(this.fs, this.keys.strokeNow - this.frame, this.tongueOpen(this.note));
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
    const V = this.V;
    const k = 1 - Math.exp(-dt / (this.pTarget > this.pressure ? this.attackTau : 0.04));
    this.pressure += (this.pTarget - this.pressure) * k;
    if (this.pressure < 1e-5 && this.pTarget === 0) this.pressure = 0;
    const age = (this.frame - this.noteStart) / fs;
    this.vibPhase += 2 * Math.PI * 5 * this.vibRate * dt;
    const vib = 1 + P.vibrato * clamp((age - 0.35) / 0.4, 0, 1) * Math.sin(this.vibPhase);
    // CC_DYNAMICS: the lips are blown as a note begun that much harder or softer would be (a time constant)
    if (this.dyn !== this.dynTarget) {
      this.dyn += (this.dynTarget - this.dyn) * (1 - Math.exp(-dt / DYN_TAU));
      if (Math.abs(this.dynTarget - this.dyn) < 1e-3) this.dyn = this.dynTarget;
    }
    // the player (the tuba's): his breath's and his pitch's slow wander, and this note's own breath
    const hu = this.spec.human;
    const H = this.human;
    let breath = 1;
    let off = 1;
    let air = 1;
    let jit = 0;
    if (hu && this.hum && H > 0) {
      // (each a walk drawn back to rest over a fifth of a second, then smoothed: time constants, whatever
      // the block)
      const a = Math.exp(-dt / 0.2);
      const sgm = Math.sqrt(1 - a * a) * 1.25;
      this.driftRaw = a * this.driftRaw + sgm * this.hum.near();
      this.wanderRaw = a * this.wanderRaw + sgm * this.hum.near();
      const ks = 1 - Math.exp(-dt / 0.05);
      this.drift += (this.driftRaw - this.drift) * ks;
      this.wander += (this.wanderRaw - this.wander) * ks;
      breath = 1 - H * (hu.bloom * this.bloomNow * Math.exp(-age / hu.bloomTau) + hu.sag * (1 - Math.exp(-age / hu.sagTau)) - hu.drift * this.drift);
      let cents = hu.wander * this.wander;
      if (hu.slow) {
        const as = Math.exp(-dt / (hu.slowTau ?? 1.2));
        this.slowRaw = as * this.slowRaw + Math.sqrt(1 - as * as) * this.hum.near();
        cents += hu.slow * this.slowRaw;
      }
      off = Math.pow(2, (H * cents) / 1200);
      jit = this.velJit;
    }
    const v01 = this.dyn || jit ? clamp(this.velocity + this.dyn + jit, 1, 127) / 127 : this.velocity / 127;
    const vc = Math.pow(v01, V.gammaCurve);
    const gamma = (V.gammaLo + (V.gammaHi - V.gammaLo) * vc) * this.gNote * this.pressure * P.breath * this.expression * breath;
    this.gammaNow = gamma;
    // the lips follow the note (the player's tension offset, the vibrato), a little below it; a slur glides
    // (time constants, not per-block fractions: nothing may depend on the block's length)
    // (a short note's attack: the lips set lower while the tube's first reflections are still to come)
    const lipSet = this.lipDipNow ? Math.pow(2, (-QUICK_LIP * this.lipDipNow * Math.exp(-Math.max(0, this.frame - this.tongueAt) / fs / QUICK_LIP_TAU)) / 12) : 1;
    // (the player's lips: a few cents off the note as it begins, and wandering with the pitch)
    const scoop = hu && this.scoopNow ? Math.pow(2, (this.scoopNow * Math.exp(-Math.max(0, this.frame - this.tongueAt) / fs / hu.scoopTau)) / 1200) : 1;
    const lipTarget = (this.lipFTarget * lipSet * scoop * off * Math.pow(2, (P.lip - V.lipBelow) / 12) * vib) / this.bendFactor;
    this.lipF += (lipTarget - this.lipF) * (1 - Math.exp(-dt / 0.006));
    const th = (2 * Math.PI * Math.min(this.lipF, 0.2 * fs)) / fs;
    const ageT = Math.max(0, this.frame - this.tongueAt) / fs;
    const q = this.qNote * (1 - V.qAttack * this.qDipNow * Math.exp(-ageT / V.qTau));
    const r = Math.exp((-Math.PI * this.lipF) / (Math.max(0.5, q) * fs));
    const la1 = 2 * r * Math.cos(th);
    const la2 = r * r;
    // (unit gain at rest: the lips' static opening grows by one per unit of Δp)
    const lb = 1 - la1 + la2;
    const boost = 1 + V.attackBoost * this.boostNow * Math.exp(-ageT / V.attackTau);
    const zeta = this.zetaNote * boost;
    const h0 = V.h0;
    const hMax = V.hMax;
    // (the player's air: a puff as the tongue lets go; the voicing's: more of it under a soft note)
    if (hu && H > 0) air = 1 + H * hu.puff * Math.exp(-ageT / hu.puffTau);
    if (V.noiseSoft) air *= 1 + V.noiseSoft * (1 - vc);
    const nz = this.noiseNote * P.noise * air;
    // the radiation's corner for the note and the dynamic, written into its section in place
    const lpF = Math.min(0.45 * fs, this.lpNote * Math.pow(2, V.lpDyn * (vc - 1)));
    if (Math.abs(lpF - this.lpSet) > 0.5) {
      lowpassInto(this.eq.c, 5 * LP_SECTION, lpF, V.lpQ, fs);
      this.lpSet = lpF;
    }
    this.tiltOut += (this.tiltNote - this.tiltOut) * (1 - Math.exp(-dt / 0.03));
    const DT = (this.Dtarget * this.bendFactor) / off;
    const ease = 1 - Math.exp(-1 / (0.004 * fs));
    const bc = this.bc;
    const g = V.wall;
    const kM = this.kMean;
    const bore = this.bore;
    const apexB = this.apexB;
    const D2 = this.D2;
    // (the steepening: samples earlier per unit pressure, ∝ the tube's round trip; and its limit)
    const stp = V.steep * DT;
    const dMax = fs / (6 * et(this.note));
    const d2i = Math.floor(D2);
    const d2f = D2 - d2i;
    const mask = BUF - 1;
    const oL = this.oL;
    const oR = this.oR;
    let peak = 0;
    let y1 = this.y1;
    let y2 = this.y2;
    let dpPrev = this.dpPrev;
    let h = this.hNow;
    let rad = this.radNow;
    // a stroke of the tongue on the sounding note (mono.ts): the air it lets through the lips, and what
    // the stopped lips take from the tube
    const lick = this.lick;
    let licking = lick.busy;
    const stopLoss = 1 - Math.pow(10, -(this.spec.stopRate ?? STOP_RATE) / (20 * this.modeFreqs[0]));
    for (let t = 0; t < n; t++) {
      const w = this.frame + t;
      this.D += (DT - this.D) * ease;
      const D = this.D;
      const di = Math.floor(D);
      const fr = D - di;
      // the wave arriving at the bell, a round trip after it left the mouthpiece
      const e = bore[(w - di) & mask] * (1 - fr) + bore[(w - di - 1) & mask] * fr;
      // the bell reflects the lows (inverted: an open end), the mean pressure whole
      const rb = bc[0] * e + bc[1] * this.bx1 + bc[2] * this.bx2 - bc[3] * this.by1 - bc[4] * this.by2;
      this.bx2 = this.bx1;
      this.bx1 = e;
      this.by2 = this.by1;
      this.by1 = rb;
      this.mean += (rb - this.mean) * kM;
      const a1 = -(g * rb + (1 - g) * this.mean);
      // and the apex's (open: inverted, through the same low-pass)
      const e2 = apexB[(w - d2i) & mask] * (1 - d2f) + apexB[(w - d2i - 1) & mask] * d2f;
      const ra = bc[0] * e2 + bc[1] * this.ax1 + bc[2] * this.ax2 - bc[3] * this.ay1 - bc[4] * this.ay2;
      this.ax2 = this.ax1;
      this.ax1 = e2;
      this.ay2 = this.ay1;
      this.ay1 = ra;
      this.mean2 += (ra - this.mean2) * kM;
      const a2 = -(g * ra + (1 - g) * this.mean2);
      // the lips: a mass–spring driven by the last pressure difference
      const y = lb * dpPrev + la1 * y1 - la2 * y2;
      y2 = y1;
      y1 = y;
      // the tongue: still, then letting go on a half-cosine
      let tg = 1;
      if (this.tongueN > 0) {
        this.tongueN--;
        tg = 0;
      } else if (this.kickPending) {
        // let go swinging: displaced, and (a sample ago) a little less, ringing at the lips' frequency
        this.kickPending = false;
        const kv = V.kick * this.kickNow * (0.5 + 0.5 * v01);
        y1 += kv;
        y2 += kv * Math.cos(th);
      }
      if (this.tongueN === 0 && this.tongueI < this.tongueLen) {
        tg = 0.5 - 0.5 * Math.cos((Math.PI * this.tongueI) / this.tongueLen);
        this.tongueI++;
      }
      let damp = 1;
      if (licking) {
        const wasDown = lick.down;
        const o = lick.next();
        tg *= o;
        damp = 1 - stopLoss * (1 - o);
        if (this.lickKick && wasDown && !lick.down) {
          // let go: the lips swing again, less than from rest
          this.lickKick = false;
          const kv = V.kick * this.kickNow * (0.5 + 0.5 * v01);
          y1 += kv;
          y2 += kv * Math.cos(th);
        }
        licking = lick.busy;
      }
      h = tg * Math.min(hMax, Math.max(0, h0 + y));
      // the flow and the mouthpiece pressure together: p = a₁ + a₂ + u/2, Δp = γ − p, u = ζh·√|Δp|·sgn Δp,
      // a quadratic in s = √|Δp|
      const c0 = gamma - a1 - a2;
      const b = zeta * h;
      const bh = 0.5 * b;
      let u: number;
      let dp: number;
      if (c0 >= 0) {
        const s = 0.5 * (-bh + Math.sqrt(bh * bh + 4 * c0));
        u = b * s;
        dp = s * s;
      } else {
        const s = 0.5 * (-bh + Math.sqrt(bh * bh - 4 * c0));
        u = -b * s;
        dp = -s * s;
      }
      if (nz && u !== 0) u += nz * u * (this.rng() * 2 - 1);
      dpPrev = dp;
      const p = a1 + a2 + 0.5 * u;
      // into both branches: the pressure less what came back
      bore[w & mask] = (p - a1) * damp;
      apexB[w & mask] = (p - a2) * damp;
      // radiated: what the bell lets through (the complement of its reflection)
      // the wave the bell lets out, steepened on its way: read earlier (a crest) or later (a trough) by
      // its own pressure, at most a sixth of the note's period
      let es = e;
      if (stp) {
        const sh = Math.max(-dMax, Math.min(dMax, stp * e));
        const Ds = D - sh;
        const si = Math.floor(Ds);
        const sf = Ds - si;
        es = bore[(w - si) & mask] * (1 - sf) + bore[(w - si - 1) & mask] * sf;
      }
      rad = es - rb;
      const out = rad * this.tiltOut;
      oL[t] = out;
      oR[t] = 0.92 * out;
      this.trLip[this.trI] = h;
      this.trP[this.trI] = p;
      this.trI = (this.trI + 1) & (TRACE - 1);
      this.hist[this.histI] = p;
      this.histI = (this.histI + 1) & 4095;
      const a = Math.abs(out);
      if (a > peak) peak = a;
    }
    this.radNow = rad;
    this.y1 = y1;
    this.y2 = y2;
    this.dpPrev = dpPrev;
    this.hNow = h;
    this.level = Math.max(peak, this.level * 0.9);
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
    for (let m = this.spec.lo; m <= this.spec.hi; m++) {
      const fg = this.spec.fingering(m);
      out.push({ midi: m, f1: et(m), B: 0, nStrings: 1, lengthM: this.spec.tubeLength(fg), hasDamper: false, preparation: this.spec.prep(fg) });
    }
    return out;
  }

  getVisual(points = 160): object {
    // the standing pressure wave along the bore (lips 0 → bell 1): the wave going out and the one coming back
    const shape = new Float32Array(points);
    const D = this.D;
    const half = D / 2;
    const w = this.frame - 1;
    for (let p = 0; p < points; p++) {
      const d = (p / (points - 1)) * half;
      shape[p] = this.bore[(w - Math.round(d)) & (BUF - 1)] - this.bore[(w - Math.round(D - d)) & (BUF - 1)];
    }
    const len = Math.min(TRACE, Math.max(64, Math.round((4 * this.fs) / et(this.note))));
    const tl = new Float32Array(len);
    const tp = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const j = (this.trI - len + i + TRACE) & (TRACE - 1);
      tl[i] = this.trLip[j];
      tp[i] = this.trP[j];
    }
    // the bore's resonances (Goertzel over the last 4096 samples)
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
      this.modeAmps[k] = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / 2048;
    }
    const fg = this.fingering;
    const excite: ExciteTrace = {
      title: 'Lips',
      unit: '',
      rate: this.fs,
      trace: tl,
      trace2: tp,
      trace2Label: 'pressure in the mouthpiece',
      caption: 'Opening of the lips (top) as they buzz, driven by the pressure in the mouthpiece (bottom).',
      meta: this.spec.meta(fg),
    };
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
        lengthM: this.spec.tubeLength(fg),
        f1: et(this.note),
        B: 0,
        damper: 0,
      },
      strike: null,
      excite,
      modes: this.modeAmps.slice(),
      lips: { open: this.hNow, blow: this.gammaNow },
      sustain: this.sustain,
      soft: this.soft,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }
}

/** RBJ low-pass coefficients [b0,b1,b2,a1,a2] written into c at `at` (no allocation: a note change on the
 *  audio thread) */
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

/** phase delay (samples) of a biquad [b0,b1,b2,a1,a2] at ω (rad/sample) */
function biquadPhaseDelay(c: ArrayLike<number>, w: number): number {
  const ph = (b0: number, b1: number, b2: number) => Math.atan2(-(b1 * Math.sin(w) + b2 * Math.sin(2 * w)), b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w));
  const phi = ph(c[0], c[1], c[2]) - ph(1, c[3], c[4]);
  return -phi / w;
}
