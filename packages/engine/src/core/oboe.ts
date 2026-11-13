// Oboe: a double reed blown closed, on a conical bore (the same family as the flute and the trumpet: a
// waveguide bore driven by a nonlinear valve at its top).
//
// The bore. A truncated cone, at the frequencies it plays, is a cylinder open at both ends driven at the
// point where the missing apex would end: the cone's input admittance −j·cot(kL) + 1/(j·k·x₀) is, while
// k·x₀ is small, −j·cot(kL) − j·cot(kx₀), a cylinder of length L in parallel with an open one of length
// x₀ (the "cylindrical saxophone": Dalmont, Gilbert & Kergomard 2000, Acta Acustica 86, 671; Ollivier,
// Dalmont & Kergomard 2004, Acta Acustica 90, 1192). So two delay lines meet at the reed: the long
// branch down to the first open tone hole and the short one, the missing apex x₀ (the staple's cone
// carried on to its point). Their resonances are exactly the harmonic series n·c / 2(L + x₀): a conical
// bore plays every harmonic and overblows at the octave, unlike a clarinet. Both ends reflect through the
// same gentle low-pass (radiation and the walls), so the apex's own quarter-wave, c / 4x₀, gets no
// sharper resonance than the bore's.
//   (Tried and rejected, scripts/oboe-regimes.ts: the apex as a lumped mass, with and without the reed
//   cavity's volume, and the tone-hole lattice's cutoff, 1–1.5 kHz, inside the loop. Physically the
//   cone's impedance peaks then rise with frequency, as a real one's do, and the low register settled on
//   its octave or twelfth at every dynamic: the harmonic two-tube bore with low loop losses is the one
//   that keeps the fundamental from B♭3 to A6 at pp, mf and ff, at 22.05–96 kHz.)
//
// The reed. Two cane blades, pressed shut by the mouth's pressure (Almeida, Vergez & Caussé 2007, JASA
// 121, 536: the double reed's quasi-static flow is the single reed's, u ∝ h·√Δp, closing at pM). In
// units of the closing pressure: opening x = 1 − Δ (Δ = mouth − bore pressure; shut at Δ ≥ 1) and flow
// u = ζ·x·√|Δ|·sgn Δ, ζ the embouchure (Kergomard's ζ: how far the lips let the blades open against
// the bore's impedance at the staple). Quasi-static: the reed's own resonance, kilohertz above the
// notes it plays, is left out (its phase tipped the low register into the octave). The blowing pressure
// γ = pm/pM is the dynamic: the reed speaks above γ ≈ 1/3 and beats (shuts once a cycle) above ½, which
// is what brightens a loud note. The pressure at the reed, p = (incoming waves) + u/2, and the flow are
// solved together exactly every sample (a cubic in √Δ, by Newton's method).
//
// Every note is played on the tube whose fundamental it is (fingering shortens the tube; the overblown
// notes' octave vents are not modelled: the short tube's resonances are the overblown one's at the note's
// harmonics). Radiation is the flow leaving the open end, differentiated (a small opening radiates ∝ f),
// then the radiation's colour, fitted to the recordings: the oboe's formant, near 1.15 kHz whatever the
// note (Meyer 2009, "Acoustics and the Performance of Music": the oboe's main formant is fixed in
// frequency), as the open-hole lattice and the bell radiate it, and a fall above a corner that follows
// the note and the dynamic.

import { Pump } from './pump.ts';
import { LICK_CLOSE, LICK_MOVE, LICK_REPEAT, MonoKeys, quickRise, Tongue } from './mono.ts';
import { CC_DYNAMICS, DYN_TAU, type ExciteTrace, type InstrumentCore } from './instrument.ts';
import type { KeySummary } from '../api/messages.ts';
import type { PianoEvent } from './piano-core.ts';
import { biquadHighpass, biquadHighShelf, biquadLowShelf, biquadLowpass, biquadPeaking } from './filters.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { clamp, interp, mulberry32, playerCents, playerSeed, playerVibrato } from './util.ts';
import { WindPlayer, type WindHuman } from './winds-human.ts';
import oboeTuning from './oboe-tuning.json';

export interface OboeParams {
  /** blowing pressure scale (1 = the dynamic's own) */
  breath: number;
  /** the lips on the reed: < 1 bites it closed (darker, softer), > 1 lets it open */
  embouchure: number;
  /** turbulence noise amount */
  noise: number;
  /** breath vibrato depth (fraction of the blowing pressure) */
  vibrato: number;
  room: number;
  volume: number;
  /** orchestra mode: where it sits on the stage (post.ts Seat); none, the single instrument's place */
  seat?: Seat | null;
  /** how much of a player: 0 the model alone (what is fitted and judged: every note of one pitch and
   *  strength the same, a held note dead still) … 1 a player's breath, embouchure and tongue (OBOE_HUMAN,
   *  winds-human.ts) */
  human?: number;
  /** fitting only (scripts/fit-oboe.ts): the voicing below, overridden */
  voice?: Partial<OboeVoice>;
}

/** The oboist (winds-human.ts), from the University of Iowa MIS oboe (analysis only). A held note: its pitch
 *  wanders 0.6–1.4 ¢ from one tenth of a second to the next (the model's 0.1–0.2), its level 0.03–0.43 dB
 *  (the model's 0.02–0.08). From one note to the next: its pitch ±7.6–9.5 ¢ (the model's ±0.6–0.8; half of
 *  it here: those notes were played alone, with nothing to tune to), its attack's length ±61–110 % (the
 *  model's ±21–46 %). Let go, it is 10 dB down in 98 ms (the model's 36). The Iowa oboist plays without
 *  vibrato (0.8 ¢, no one rate); the model's breath vibrato (0.035 of the pressure) reaches its level (about
 *  0.25 dB at any dynamic) and not its pitch (0.1 ¢). The player's is the breath's, as deep as the Iowa
 *  bassoonist's in level (the other double reed: 0.35 dB pp, 0.13 mf, 0.05 ff) and irregular as a player's
 *  is; it has no pitch of its own. With the bassoonist's few cents of pitch (the tube's length swung 3.6 ¢
 *  five times a second) the oboe's E♭5 in Beethoven's Fifth, II, went to its octave 10 times in ten
 *  performances where the model alone did 3 times (scripts/winds-midi-players.ts): a double reed's held note
 *  is near its other regime. */
export const OBOE_HUMAN: WindHuman = {
  seed: 683,
  wander: 2,
  slow: 1.5,
  slowTau: 1.2,
  place: 4,
  breath: 0.12,
  breathSlow: 0.2,
  breathTau: 1.5,
  strength: 0.6,
  bright: 1.5,
  // (the breath's rise as the model has it: a soft low note sits so near its threshold that ±10 % on its rise
  // kept 5 of 8 players' 50 ms D4 pp from speaking at all, where the model alone always speaks)
  rise: 0,
  push: 0.25,
  release: 3,
  taperFrom: 0.15,
  taperFull: 0.5,
  vibrato: { rate: 5.2, breathRate: 0.27, cents: [0, 0, 0], fundDb: [0, 0, 0], upperDb: [0, 0, 0], breath: [1.3, 0.5, 0.23], rateWander: 0.25, depthWander: 0.3 },
};
/** the vibrato parameter's default: the player's vibrato is scaled by the parameter over it */
const OBOE_VIBRATO = 0.035;

const C_AIR = 343;
const BUF = 1 << 12;
const TRACE = 2048;
export const OBOE_LO = 58;
export const OBOE_HI = 93;

/** The voicing: the reed, the bore's losses and the radiation. Fitted to the University of Iowa MIS
 *  oboe (pp/mf/ff, B♭3–A♭6) with scripts/fit-oboe.ts on the fit half of its notes (even MIDI numbers),
 *  judged on the held-out half (scripts/judge.ts); artifacts/realistic-3d/final-symphony/oboe/NOTES.md. */
export interface OboeVoice {
  /** embouchure parameter ζ at B♭3 and at A6 (the player pinches the blades for the high notes) */
  zeta: number;
  zetaTop: number;
  /** the mouth's pressure, in units of the closing pressure of the reed as opened for a loud note, at
   *  velocity 1 and 127, and the curve between (velocity^gammaCurve) */
  gammaLo: number;
  gammaHi: number;
  gammaCurve: number;
  /** The dynamic is mostly in the lips. Oboists' mouth pressure follows the pitch far more than the
   *  dynamic (Fuks & Sundberg 1999, Acustica 85, 267: oboe 3–9 kPa); a soft note is played with the
   *  lips pressing the blades closer, the reed's rest opening H₀ down to `openPp` of a loud note's at
   *  velocity 1 (the same curve). The closing pressure pM ∝ H₀ (a spring) falls with it, so the swing
   *  the reed drives, in pascals, scales with H₀, ζ ∝ √H₀, and the blowing pressure in units of pM rises
   *  (the reed nearer shut). In the beating (Helmholtz-like) regime the swing in units of pM barely
   *  depends on γ or ζ (Ollivier, Dalmont & Kergomard 2004): the lips are what makes it quieter. */
  openPp: number;
  /** the breath's rise (s, a time constant) for a soft note and a loud one */
  riseLo: number;
  riseHi: number;
  /** the missing apex x₀ (m): the staple's cone carried on to its point */
  apex: number;
  /** both ends' reflection: a low-pass (Hz; radiation and wall losses), and the round trip's gain at
   *  audio frequencies (an open end reflects the mean pressure whole: −1 at 0 Hz, the loss above ~20 Hz;
   *  a scalar loss there held the bore's mean pressure for seconds and the reed's working point crept) */
  cutoff: number;
  wall: number;
  /** turbulence in the reed's channel: noise in the flow, ∝ the flow, and a floor ∝ the breath (the jet
   *  through the slit, there at pp where the swing is small) */
  noise: number;
  noiseFloor: number;
  /** the radiation's colour: below `hp` it falls (Hz); a shelf below 400 Hz (dB, the low fundamentals);
   *  the formant (Hz, dB, Q) and the second; above `lp` × (f₀ / 440 Hz)^lpExp a second-order fall (Hz,
   *  Q: the corner follows the note, as the open holes below it change; the recordings keep harmonics
   *  to 1.6–2 kHz on B♭3–A4 and to 4–6 kHz on the top octave); a shelf above `shelfF` (dB) */
  hp: number;
  lowG: number;
  f1: number;
  g1: number;
  q1: number;
  f2: number;
  g2: number;
  q2: number;
  lp: number;
  lpQ: number;
  lpExp: number;
  /** …and the dynamic: the corner is lpDyn octaves lower at velocity 1 than at 127 (on the dynamic's
   *  curve). A loud note's reed shuts harder each cycle, its closing sharper: the recordings' centroid
   *  rises 40 % from pp to ff at the same note (as the bowed bodies' corner follows the bow's force) */
  lpDyn: number;
  shelfF: number;
  shelfG: number;
  /** the tongue's release: a transient wider opening (×(1 + attackBoost), decaying with attackTau, s) */
  attackBoost: number;
  attackTau: number;
  /** tonguing: the breath builds behind the tongue on the blades for `tongueHold` (s), then the tongue
   *  withdraws over `tongueRel` periods of the note (the reed opens on a half-cosine) */
  tongueHold: number;
  tongueRel: number;
}

export const OBOE_VOICE: OboeVoice = {
  zeta: 1.45,
  zetaTop: 1.77,
  gammaLo: 0.08,
  gammaHi: 0.851,
  gammaCurve: 1.3,
  openPp: 0.333,
  riseLo: 0.203,
  riseHi: 0.0475,
  apex: 0.0418,
  cutoff: 7181,
  wall: 0.9981,
  noise: 0.238,
  noiseFloor: 0.00657,
  hp: 300,
  lowG: -3.99,
  f1: 1146,
  g1: 14.4,
  q1: 2.01,
  f2: 3421,
  g2: 0.642,
  q2: 1.71,
  lp: 2279,
  lpQ: 0.87,
  lpExp: 0.899,
  lpDyn: 1.81,
  shelfF: 6000,
  shelfG: -17.4,
  attackBoost: 0.296,
  attackTau: 0.05,
  tongueHold: 0.03,
  tongueRel: 0.631,
};

/** the shortest tongued note: the breath stays on this long (s) from the key, as on the flute and
 *  trumpet, so a 50 ms tap still speaks: longer for a soft note, which takes longer to speak (its breath
 *  swells, riseLo: the recordings' soft notes do), from MIN_BLOW_PP at velocity 1 to MIN_BLOW at 127 */
const MIN_BLOW = 0.1;
const MIN_BLOW_PP = 0.3;
/** a note known to be short (mono.ts): the breath's rise is at most this share of it (a time constant; the
 *  others' 1/12 put more of the oboe's notes on their octave: with 1/6, 10 of 720 notes begun from silence
 *  at 139–700 ms sit on another register, scattered, where the long tone's attack leaves 6 of them and 86
 *  that do not speak: scripts/winds-midi-fresh.ts) */
const QUICK_SHARE = 1 / 6;
/** a note known to be short: the tongue holds the blades shut for at most this share of it */
const HOLD_SHARE = 0.1;
/** tongued over the breath (mono.ts): the release's wider opening is this much of a first attack's */
const LICK_BOOST = 0.5;
/** What the tongue on the blades takes from the bore while it lies there (dB/s). A note stopped by the tongue
 *  decays at about the rate of a real bore's resonances, 400 dB/s (Li, Almeida, Smith & Wolfe 2016, JASA
 *  139, the clarinet); this bore, fitted on held notes, rings on at about 70 dB/s with the reed shut (a
 *  repeated note fell 1.6 dB under a 30 ms tongue). With 100 more it falls 5.6 dB between its strokes. More
 *  (200: 10 dB) left the reed more often on the note's octave as it was let go (scripts/winds-midi-bench.ts,
 *  joined notes across the compass: 9 of 396 against 7; the bassoon's 5 of 480 against 1) */
const STOP_RATE = 100;

const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** which register a note is played in (the Woodwind Fingering Guide's basic chart): 1 B♭3–C5, 2 the
 *  octave C♯5–C6 (half-hole, then the octave keys), 3 the third octave, cross-fingered */
export function oboeRegister(m: number): 1 | 2 | 3 {
  return m <= 72 ? 1 : m <= 84 ? 2 : 3;
}

export class OboeCore implements InstrumentCore {
  readonly id = 'oboe' as const;
  readonly fs: number;
  params: OboeParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = 1;
  sympatheticAllowed = true;
  dry: boolean;
  private V: OboeVoice;
  private queue: { frame: number; ev: PianoEvent | { type: 'control'; cc: number; value: number } }[] = [];
  /** waves leaving the reed down the bore (the long branch) and up into the apex (the short one) */
  private longB = new Float64Array(BUF);
  private apexB = new Float64Array(BUF);
  /** round trips (samples): the bore's, eased towards its target, and the apex's */
  private D1 = 100;
  private D1target = 100;
  private D2 = 4;
  /** both ends' reflection: one low-pass, a state for each */
  private rc = new Float64Array(5);
  private rx1 = 0;
  private rx2 = 0;
  private ry1 = 0;
  private ry2 = 0;
  private sx1 = 0;
  private sx2 = 0;
  private sy1 = 0;
  private sy2 = 0;
  /** each end's reflected wave, averaged below ~20 Hz (the part reflected whole) */
  private m1 = 0;
  private m2 = 0;
  private kDc = 0.003;
  /** the flow leaving the open end, for the radiation's derivative */
  private outPrev = 0;
  /** the last sample's √|Δ| (Newton's starting point) */
  private sPrev = 0;
  // breath
  private pressure = 0;
  private pTarget = 0;
  private attackTau = 0.03;
  private vibPhase = 0;
  private vib0 = 0;
  private vibRate = 1;
  private vibNow = 0;
  private expression = 1;
  /** CC_DYNAMICS (instrument.ts): velocity steps above (below) the note as begun, asked and as the breath has it */
  private dynTarget = 0;
  private dyn = 0;
  private bendFactor = 1;
  /** the player's intonation, semitones (util.ts playerCents), under any bend */
  private tune = 0;
  private note = 69;
  /** the keys as one player takes them (mono.ts), and the tongue's stroke on a sounding note */
  private keys: MonoKeys;
  private lick = new Tongue();
  /** the tongue has held the last note stopped over a rest: the next is let go as a first attack is */
  private afterStop = false;
  /** a strength taken up once the tongue is down (0: none): tongued over the breath, the air through the
   *  stroke's first milliseconds is still the last note's, so nothing steps under a sounding tone */
  private velNext = 0;
  /** when the tongue last let go (frame), and how much of the release's wider opening that stroke has
   *  (1: a note from silence) */
  private tongueAt = 0;
  private boostNow = 1;
  private velocity = 80;
  /** when this breath began (frame): a note from silence. The vibrato comes in over the breath, not over
   *  each note of it: a note tongued over the breath is in the same breath (it used to begin the vibrato
   *  again, 0.3 s in: a file's notes, which mostly end where the next begins, never had one) */
  private breathStart = 0;
  /** frame until which a tongued note keeps its breath (MIN_BLOW), and a key let go before it */
  private blowUntil = 0;
  private releasePending = false;
  /** the tongue on the blades: samples it still holds them shut, then the release's length and progress */
  private tongueN = 0;
  private tongueLen = 1;
  private tongueI = 1;
  private rng: () => number;
  private eq = new BiquadChain();
  private room: Room;
  private limiter: Limiter;
  private pump = new Pump(64);
  private oL = new Float64Array(128);
  private oR = new Float64Array(128);
  private level = 0;
  private trX = new Float32Array(TRACE);
  private trP = new Float32Array(TRACE);
  private trI = 0;
  private hist = new Float32Array(4096);
  private histI = 0;
  private modeAmps = new Float32Array(16);
  private modeFreqs = new Float64Array(16);
  private gain = 1;
  /** the player (OBOE_HUMAN) */
  private pl: WindPlayer;
  /** ζ for the note (OboeVoice zeta … zetaTop) */
  private zetaNote = 1;
  /** the radiation's corner for the note at ff (Hz), and the corner its section now has */
  private lpNote = 4000;
  private lpSet = -1;
  /** the reed's opening now (0 shut, 1 at rest), and the blowing pressure, for the stage */
  private xNow = 1;
  private gammaNow = 0;
  /** the reed's rest opening for the dynamic (of a loud note's), now and as the output last had it */
  private open = 1;
  private openOut = 1;

  constructor(opts: { sampleRate: number; params?: Partial<OboeParams>; dry?: boolean; player?: number }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.params = { breath: 1, embouchure: 1, noise: 1, vibrato: OBOE_VIBRATO, room: 0.3, volume: 1, ...opts.params };
    this.V = { ...OBOE_VOICE, ...this.params.voice };
    this.keys = new MonoKeys(this.fs);
    this.rng = mulberry32(playerSeed(68, opts.player));
    const pv = playerVibrato(opts.player);
    this.vib0 = this.vibPhase = pv.phase;
    this.vibRate = pv.rate;
    this.pl = new WindPlayer(OBOE_HUMAN, this.fs, opts.player, 5.2, pv.rate);
    this.tune = playerCents(opts.player) / 100;
    if (this.tune) this.bendFactor = Math.pow(2, -this.tune / 12);
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    this.voiced();
    this.setNote(69, true);
  }

  /** everything the voicing fixes: the ends' reflection, the apex, the radiation */
  /** how much of a player there is (0: none, the model alone) */
  private get human(): number {
    return clamp(this.params.human ?? 1, 0, 1);
  }

  private voiced(): void {
    const fs = this.fs;
    const V = this.V;
    const lp = biquadLowpass(Math.min(0.45 * fs, V.cutoff), 0.707, fs);
    this.rc.set([lp[0], lp[1], lp[2], lp[3], lp[4]]);
    this.D2 = Math.max(1, (2 * V.apex * fs) / C_AIR);
    this.kDc = 1 - Math.exp((-2 * Math.PI * 20) / fs);
    this.eq.set([
      biquadHighpass(V.hp, 0.7, fs),
      biquadLowShelf(400, V.lowG, fs),
      biquadPeaking(V.f1, V.q1, V.g1, fs),
      biquadPeaking(V.f2, V.q2, V.g2, fs),
      biquadLowpass(Math.min(0.45 * fs, V.lp), V.lpQ, fs),
      biquadHighShelf(Math.min(0.4 * fs, V.shelfF), V.shelfG, fs),
    ]);
    this.room.configure(this.params.room, this.params.seat);
    // matched to the flute: the median mf note B♭4–E6 as loud as the flute's (the recordings' absolute
    // levels are their microphone's gain; the two winds sit side by side in the woodwind section)
    this.gain = 0.266 * this.params.volume;
  }

  /** measured voicing table (scripts/tune-oboe.ts): cents the bare model plays sharp, by sample rate */
  static tuningTable: { fs: number[]; midi: number[]; cents: number[][] } = oboeTuning as { fs: number[]; midi: number[]; cents: number[][] };
  private tuningCorrection(m: number): number {
    const t = OboeCore.tuningTable;
    if (!t.midi?.length) return 1;
    const rows = t.cents.map((r) => interp(m, t.midi, r));
    const c = t.fs.length > 1 ? interp(this.fs, t.fs, rows) : rows[0];
    return Math.pow(2, c / 1200);
  }

  private setNote(m: number, immediate: boolean): void {
    const fs = this.fs;
    const V = this.V;
    const f = et(m);
    // the period is the round trip of both branches, each through the ends' low-pass (its phase delay
    // at the note) and the interpolation's half sample
    const lag = biquadPhaseDelay(this.rc, (2 * Math.PI * f) / fs);
    this.D1target = Math.max(2, (fs / f) * this.tuningCorrection(m) - this.D2 - 2 * lag - 1);
    if (immediate) this.D1 = this.D1target;
    this.zetaNote = V.zeta + (V.zetaTop - V.zeta) * clamp((m - OBOE_LO) / (OBOE_HI - OBOE_LO), 0, 1);
    // the radiation's corner for this note (the dynamic moves it further: render())
    this.lpNote = V.lp * Math.pow(f / 440, V.lpExp);
    this.lpSet = -1;
    this.note = m;
    for (let k = 0; k < 16; k++) this.modeFreqs[k] = (k + 1) * f;
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
        // mod wheel, breath controller and expression blow (below 0, CC_REST: back to the note's breath)
        if (ev.cc === 1 || ev.cc === 2 || ev.cc === 11) this.expression = ev.value < 0 ? 1 : 0.55 + 0.6 * clamp(ev.value, 0, 1);
        else if (ev.cc === CC_DYNAMICS) this.dynTarget = clamp(ev.value, -64, 64);
        break;
      case 'bend':
        // the player lips the pitch (the reed's opening and the bore's effective length)
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
    const m = clamp(a.midi, OBOE_LO, OBOE_HI);
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
    if (this.lick.down && !(a.kind === 'retongue' && a.struck)) this.lick.release(this.tongueOpen(m));
    this.pl.H = this.human;
    if (a.kind === 'slur') {
      this.setNote(m, false);
      // (back to a note still held: the fingers only)
      if (a.velocity) {
        this.pl.note(this.frame, m, a.len, false, false);
        this.pTarget = 1;
        this.attackTau = 0.01;
      }
    } else if (a.kind === 'tongue') {
      this.setNote(m, this.level < 1e-3);
      this.pTarget = 1;
      // a note known to be short speaks within a share of its length (mono.ts); one of unknown length (a
      // key in the hand) gets the long tone's rise the recordings were fitted on
      this.attackTau = quickRise(this.V.riseLo + (this.V.riseHi - this.V.riseLo) * (vel / 127), a.len, QUICK_SHARE);
      // tongued: the blades held shut while the breath builds, then let go
      this.tongueN = Math.round(quickRise(this.V.tongueHold, a.len, HOLD_SHARE) * this.fs);
      this.tongueLen = this.tongueOpen(m);
      this.tongueI = 0;
      this.vibPhase = this.vib0;
      this.breathStart = this.frame;
      this.tongueAt = this.frame;
      this.boostNow = 1;
      this.afterStop = false;
      // (the player's own: this note's rise and the tongue's release)
      this.pl.note(this.frame, m, a.len, true, true);
      if (this.pl.H > 0) this.ownAttack();
      this.blowUntil = this.frame + Math.round((MIN_BLOW_PP + (MIN_BLOW - MIN_BLOW_PP) * (vel / 127)) * this.fs);
    } else {
      // tongued over the breath: the fingers move, the tongue stops the blades and lets them go again
      const same = m === this.note;
      this.setNote(m, false);
      this.pTarget = 1;
      this.attackTau = Math.min(this.attackTau, quickRise(this.V.riseLo + (this.V.riseHi - this.V.riseLo) * (vel / 127), a.len, QUICK_SHARE));
      this.tongueAt = this.frame + this.lick.retongue(a.struck, this.fs, same, this.tongueOpen(m));
      this.boostNow = this.afterStop ? 1 : LICK_BOOST;
      this.afterStop = false;
      this.pl.note(this.frame, m, a.len, true, false);
      if (this.pl.H > 0) this.ownAttack();
      this.blowUntil = this.frame + Math.round(MIN_BLOW * this.fs);
    }
    if (a.tap) this.release();
  }

  /** a tongued note's own first moments, once the model's are set (the player's draw, winds-human.ts): the
   *  breath's rise a little quicker or slower, the reed's wider opening as the tongue lets it go a little
   *  more or less */
  private ownAttack(): void {
    this.attackTau *= this.pl.rise;
    this.boostNow *= this.pl.push;
  }

  /** The key is up: stop blowing, but not before the tongued note has had its minimum breath. */
  private release(): void {
    if (this.pTarget > 0 && this.frame < this.blowUntil) this.releasePending = true;
    else this.pTarget = 0;
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<OboeParams>) };
    if (this.params.voice !== old.voice) {
      this.V = { ...OBOE_VOICE, ...this.params.voice };
      this.voiced();
      this.setNote(this.note, false);
    } else if (this.params.room !== old.room || this.params.volume !== old.volume) this.voiced();
    else if (this.params.seat !== old.seat) this.room.configure(this.params.room, this.params.seat);
  }

  /** the one note sounding (monophonic: the last held key wins, a release returns to the previous) */
  sounding(): number[] {
    return this.pTarget > 0 && !this.keys.silent ? [this.note] : [];
  }

  allSoundOff(): void {
    this.dyn = this.dynTarget = 0;
    this.clear();
    this.pressure = this.pTarget = 0;
    this.releasePending = false;
    this.keys.clear();
    this.keys.forget();
    this.lick.reset();
    this.pl.reset();
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  private clear(): void {
    this.longB.fill(0);
    this.apexB.fill(0);
    this.rx1 = this.rx2 = this.ry1 = this.ry2 = this.sx1 = this.sx2 = this.sy1 = this.sy2 = 0;
    this.m1 = this.m2 = 0;
    this.outPrev = this.sPrev = 0;
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
      if (this.keys.strokeNow >= 0) {
        this.lick.ahead(this.fs, this.keys.strokeNow - this.frame, this.tongueOpen(this.note));
        // (the fingers move under the tongue, as a player's do: the reed is let go on the new note's tube)
        this.setNote(clamp(this.keys.comingMidi, OBOE_LO, OBOE_HI), false);
      }
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
    // (the player: a long note's breath let go slower before a rest, winds-human.ts)
    const H = this.human;
    this.pl.H = H;
    const k = 1 - Math.exp(-dt / (this.pTarget > this.pressure ? this.attackTau : H > 0 ? this.pl.releaseTau(0.03, this.frame, this.keys) : 0.03));
    this.pressure += (this.pTarget - this.pressure) * k;
    if (this.pressure < 1e-5 && this.pTarget === 0) this.pressure = 0;
    const age = (this.frame - this.breathStart) / fs;
    // CC_DYNAMICS: the breath goes on as a note begun that much harder or softer would (a time constant)
    if (this.dyn !== this.dynTarget) {
      this.dyn += (this.dynTarget - this.dyn) * (1 - Math.exp(-dt / DYN_TAU));
      if (Math.abs(this.dynTarget - this.dyn) < 1e-3) this.dyn = this.dynTarget;
    }
    const v01 = this.dyn ? clamp(this.velocity + this.dyn, 1, 127) / 127 : this.velocity / 127;
    this.vibPhase += 2 * Math.PI * 5.2 * this.vibRate * dt;
    const vibEnv = clamp((age - 0.3) / 0.4, 0, 1);
    let vibShape = Math.sin(this.vibPhase);
    if (H > 0) {
      // the player's vibrato (no cycle like the last), the pitch's wander, the breath's level
      this.pl.step(dt, v01, vibEnv, OBOE_VIBRATO > 0 ? P.vibrato / OBOE_VIBRATO : 0);
      vibShape = this.pl.shape;
    }
    const vib = H > 0 ? 1 + P.vibrato * this.pl.breathVib * vibEnv * vibShape : 1 + P.vibrato * vibEnv * vibShape;
    this.vibNow = vib - 1;
    const vc = Math.pow(v01, V.gammaCurve);
    // the reed's rest opening (of a loud note's): the swing scales with it, ζ with its root, and the
    // mouth's pressure counts for more against a reed set nearer shut
    const open = V.openPp + (1 - V.openPp) * vc;
    this.open = open;
    const gNote = (V.gammaLo + (V.gammaHi - V.gammaLo) * vc) / open;
    const gamma = gNote * this.pressure * vib * P.breath * this.expression;
    this.gammaNow = gamma;
    // the tongue's release: a transient wider opening (the lips not yet settled), decaying
    const ageT = Math.max(0, this.frame - this.tongueAt) / fs;
    const zeta = this.zetaNote * Math.sqrt(open) * P.embouchure * (1 + V.attackBoost * this.boostNow * Math.exp(-ageT / V.attackTau));
    // the radiation's corner for the note and the dynamic, written into its section in place (only when
    // it moves: a swell's glide)
    const lpF = Math.min(0.45 * fs, this.lpNote * Math.pow(2, V.lpDyn * (vc - 1)));
    if (Math.abs(lpF - this.lpSet) > 0.5) {
      lowpassInto(this.eq.c, 5 * LP_SECTION, lpF, V.lpQ, fs);
      this.lpSet = lpF;
    }
    const nzF = V.noiseFloor * P.noise * gamma;
    // (Newton's method below needs zeta/2 < 1: the flow's slope never turns the solution back)
    const zh = Math.min(0.95, 0.5 * zeta);
    const nz = V.noise * P.noise;
    // (the player's pitch: the embouchure, a few cents either way, and the vibrato's)
    const DT = H > 0 ? this.D1target * this.bendFactor * this.pl.delayFactor : this.D1target * this.bendFactor;
    // (a time constant, not a per-block fraction: a slur's glide must not depend on block length)
    const ease = 1 - Math.exp(-1 / (0.004 * fs));
    const D2 = this.D2;
    const d2i = Math.floor(D2);
    const d2f = D2 - d2i;
    const rc = this.rc;
    const g = V.wall;
    const kDc = this.kDc;
    const longB = this.longB;
    const apexB = this.apexB;
    const mask = BUF - 1;
    const oL = this.oL;
    const oR = this.oR;
    let peak = 0;
    let s = this.sPrev;
    // a stroke of the tongue on the sounding reed (mono.ts): the flow through it, and what it absorbs
    const lick = this.lick;
    let licking = lick.busy;
    const stopLoss = 1 - Math.pow(10, -STOP_RATE / (20 * et(this.note)));
    for (let t = 0; t < n; t++) {
      const w = this.frame + t;
      this.D1 += (DT - this.D1) * ease;
      const D1 = this.D1;
      const di = Math.floor(D1);
      const fr = D1 - di;
      // the waves back from both ends (a round trip each): reflected through the low-pass, inverted
      // (open ends), with the walls' loss
      const e = longB[(w - di) & mask] * (1 - fr) + longB[(w - di - 1) & mask] * fr;
      const y1 = rc[0] * e + rc[1] * this.rx1 + rc[2] * this.rx2 - rc[3] * this.ry1 - rc[4] * this.ry2;
      this.rx2 = this.rx1;
      this.rx1 = e;
      this.ry2 = this.ry1;
      this.ry1 = y1;
      this.m1 += (y1 - this.m1) * kDc;
      const a1 = -(g * y1 + (1 - g) * this.m1);
      const e2 = apexB[(w - d2i) & mask] * (1 - d2f) + apexB[(w - d2i - 1) & mask] * d2f;
      const y2 = rc[0] * e2 + rc[1] * this.sx1 + rc[2] * this.sx2 - rc[3] * this.sy1 - rc[4] * this.sy2;
      this.sx2 = this.sx1;
      this.sx1 = e2;
      this.sy2 = this.sy1;
      this.sy1 = y2;
      this.m2 += (y2 - this.m2) * kDc;
      const a2 = -(g * y2 + (1 - g) * this.m2);
      // the reed and the bore together: p = a₁ + a₂ + u/2 (the flow splits between two branches of
      // equal impedance), Δ = γ − p, u = ζ(1 − Δ)√Δ (Δ < 0: the blades pushed apart, the flow back).
      // In s = √|Δ|: s² ± ζ/2·(s ∓ s³) = |γ − a₁ − a₂|, solved by Newton from the last sample's s
      const D0 = gamma - a1 - a2;
      let Dl: number;
      let u: number;
      // the tongue: shut, then opening on a half-cosine
      let tg = 1;
      if (this.tongueN > 0) {
        this.tongueN--;
        tg = 0;
      } else if (this.tongueI < this.tongueLen) {
        tg = 0.5 - 0.5 * Math.cos((Math.PI * this.tongueI) / this.tongueLen);
        this.tongueI++;
      }
      let damp = 1;
      if (licking) {
        const o = lick.next();
        tg *= o;
        damp = 1 - stopLoss * (1 - o);
        licking = lick.busy;
      }
      if (tg === 0) {
        Dl = D0;
        u = 0;
      } else if (D0 >= 1) {
        // shut: no flow
        Dl = D0;
        u = 0;
        s = 1;
      } else if (D0 >= 0) {
        // F(s) = s² + zh(s − s³) − D0, increasing on [0, 1]
        const hi = Math.sqrt(D0);
        if (s > hi || s < 0) s = hi;
        for (let it = 0; it < 4; it++) {
          const F = s * s + zh * (s - s * s * s) - D0;
          const dF = 2 * s + zh * (1 - 3 * s * s);
          s -= F / dF;
          if (s < 0) s = 0;
          else if (s > hi) s = hi;
        }
        Dl = s * s;
        u = zeta * (1 - Dl) * s;
      } else {
        // (below: the flow law as it is, D0 < 0)
        // G(s) = s² + zh(s + s³) + D0, increasing
        const hi = Math.sqrt(-D0);
        if (s > hi || s < 0) s = hi;
        for (let it = 0; it < 4; it++) {
          const G = s * s + zh * (s + s * s * s) + D0;
          const dG = 2 * s + zh * (1 + 3 * s * s);
          s -= G / dG;
          if (s < 0) s = 0;
          else if (s > hi) s = hi;
        }
        Dl = -s * s;
        u = -zeta * (1 - Dl) * s;
      }
      if (tg < 1) u *= tg;
      if (nz || nzF) u += (nz * u + (u !== 0 ? nzF : 0)) * (this.rng() * 2 - 1);
      const p = a1 + a2 + 0.5 * u;
      longB[w & mask] = (p - a1) * damp;
      apexB[w & mask] = (p - a2) * damp;
      // radiation: the flow leaving the open end (incident minus reflected), differentiated
      const flow = e - a1;
      const out = flow - this.outPrev;
      this.outPrev = flow;
      oL[t] = out;
      oR[t] = 0.92 * out;
      const x = 1 - Dl;
      this.trX[this.trI] = x;
      this.trP[this.trI] = p;
      this.trI = (this.trI + 1) & (TRACE - 1);
      this.hist[this.histI] = out;
      this.histI = (this.histI + 1) & 4095;
      const a = Math.abs(p);
      if (a > peak) peak = a;
      this.xNow = x;
    }
    this.sPrev = s;
    this.level = Math.max(peak, this.level * 0.9);
    // (the player's breath and vibrato in what leaves the instrument: its level, the harmonics above the
    // fundamental further)
    if (H > 0) this.pl.out(oL, oR, n, et(this.note));
    // (in pascals: the swing in units of pM, times pM ∝ the reed's opening; eased across the block, so a
    // swell's steps never click)
    const g0 = this.gain * this.openOut;
    const g1 = this.gain * open;
    this.openOut = open;
    for (let t = 0; t < n; t++) {
      const gn = g0 + ((g1 - g0) * (t + 1)) / n;
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
    for (let m = OBOE_LO; m <= OBOE_HI; m++) {
      const r = oboeRegister(m);
      out.push({ midi: m, f1: et(m), B: 0, nStrings: 1, lengthM: C_AIR / (2 * et(m)) - this.V.apex, hasDamper: false, preparation: r === 1 ? '1st register' : r === 2 ? '2nd register (octave)' : '3rd register (cross-fingered)' });
    }
    return out;
  }

  getVisual(points = 160): object {
    // the standing pressure wave along the bore (reed 0 → open end 1): outgoing + returning
    const shape = new Float32Array(points);
    const D = this.D1;
    const half = D / 2;
    const w = this.frame - 1;
    for (let p = 0; p < points; p++) {
      const d = (p / (points - 1)) * half;
      shape[p] = this.longB[(w - Math.round(d)) & (BUF - 1)] - this.longB[(w - Math.round(D - d)) & (BUF - 1)];
    }
    const len = Math.min(TRACE, Math.max(64, Math.round((4 * this.fs) / et(this.note))));
    const tx = new Float32Array(len);
    const tp = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const j = (this.trI - len + i + TRACE) & (TRACE - 1);
      tx[i] = this.trX[j];
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
      let s1 = 0;
      let s2 = 0;
      for (let i = 0; i < 4096; i++) {
        const s0 = this.hist[(this.histI + i) & 4095] + c * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      this.modeAmps[k] = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / 2048;
    }
    const r = oboeRegister(this.note);
    const excite: ExciteTrace = {
      title: 'Reed',
      unit: '',
      rate: this.fs,
      trace: tx,
      trace2: tp,
      trace2Label: 'pressure in the staple',
      caption: 'Opening of the double reed (top) as the pressure in the staple (bottom) swings: blown closed, the blades shut once a cycle when the note is loud.',
      meta: `γ ${this.gammaNow.toFixed(2)} · register ${r}`,
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
        lengthM: C_AIR / (2 * et(this.note)) - this.V.apex,
        f1: et(this.note),
        B: 0,
        damper: 0,
      },
      strike: null,
      excite,
      breath: { pressure: this.pressure, vib: this.vibNow },
      reed: { open: clamp(this.xNow, 0, 1.5), gamma: this.gammaNow },
      modes: this.modeAmps.slice(),
      sustain: this.sustain,
      soft: this.soft,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }
}

/** the radiation chain's low-pass section (voiced(): high-pass, low shelf, two formants, low-pass, shelf) */
const LP_SECTION = 4;
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
