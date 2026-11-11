// Bassoon: a double reed blown closed, on a long, narrow conical bore folded in two (the oboe's family,
// oboe.ts, an octave and a half lower; the reed on a curved metal crook, the bocal).
//
// The bore. A truncated cone 2.5 m long (the bocal, the wing joint, the boot's two bores joined at its
// U-tube, the long joint and the bell), 4 mm across at the reed and 40 mm at the bell (Fletcher & Rossing
// 1998, §15.6; Benade 1976). At the frequencies it plays a truncated cone is a cylinder open at both ends
// driven where the missing apex would end: its input admittance −j·cot(kL) + 1/(j·k·x₀) is, while k·x₀ is
// small, −j·cot(kL) − j·cot(kx₀), a cylinder of length L in parallel with an open one of length x₀ (the
// "cylindrical saxophone": Dalmont, Gilbert & Kergomard 2000, Acta Acustica 86, 671; Ollivier, Dalmont &
// Kergomard 2004, Acta Acustica 90, 1192). So two delay lines meet at the reed: the long branch down to the
// first open tone hole and the short one, the missing apex x₀ (the bocal's cone carried on to its point,
// which the reed's own volume stands in for). Their resonances are the harmonic series n·c / 2(L + x₀): a
// conical bore plays every harmonic and overblows at the octave. The apex is long on a bassoon (a narrow
// cone's point is far behind its reed; fitted 0.14 m), so the bore's every (L + x₀)/x₀-th harmonic is
// weak. Its resonances are harmonic, so a note can also hold its octave or twelfth: the losses in the loop
// are kept light enough that the fundamental is the stable regime (scripts/bassoon-regimes.ts surveys
// every note at pp, mf and ff at the four sample rates, held two seconds). The bassoon's fixed formant
// near 500 Hz and its weak low fundamentals are the radiation's colour (below).
//
// The reed. Two cane blades, 55–57 mm long, pressed shut by the mouth's pressure (as the oboe's: Almeida,
// Vergez & Caussé 2007, JASA 121, 536: the double reed's quasi-static flow is the single reed's, u ∝ h·√Δp,
// closing at pM). In units of the closing pressure: opening x = 1 − Δ (Δ = mouth − bore pressure; shut at
// Δ ≥ 1) and flow u = ζ·x·√|Δ|·sgn Δ, ζ the embouchure. Quasi-static (the reed's own resonance is left
// out). The blowing pressure γ = pm/pM is the dynamic: the reed speaks above γ ≈ 1/3 and beats (shuts once
// a cycle) above ½. The pressure at the reed, p = (incoming waves) + u/2, and the flow are solved together
// exactly every sample (a cubic in √Δ, by Newton's method).
//
// Every note is played on the tube whose fundamental it is (fingering shortens the tube; the overblown
// notes' half-hole, flick keys and whisper key are not modelled: the short tube's resonances are the
// overblown one's at the note's harmonics). Radiation is the flow leaving the open end, differentiated
// (a small opening radiates ∝ f), then the radiation's colour, fitted to the recordings: the bassoon's
// formants (Meyer 2009, "Acoustics and the Performance of Music": the main one near 500 Hz, others near
// 1150 and 2000–3500 Hz, fixed in frequency whatever the note) and a fall above a corner that follows the
// note and the dynamic.

import { Pump } from './pump.ts';
import { MonoKeys, quickRise, Tongue } from './mono.ts';
import { CC_DYNAMICS, DYN_TAU, type ExciteTrace, type InstrumentCore } from './instrument.ts';
import type { KeySummary } from '../api/messages.ts';
import type { PianoEvent } from './piano-core.ts';
import { biquadHighpass, biquadHighShelf, biquadLowShelf, biquadLowpass, biquadPeaking } from './filters.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { clamp, interp, mulberry32, playerCents, playerSeed, playerVibrato } from './util.ts';
import bassoonTuning from './bassoon-tuning.json';

export interface BassoonParams {
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
  /** fitting only (scripts/fit-bassoon.ts): the voicing below, overridden */
  voice?: Partial<BassoonVoice>;
}

const C_AIR = 343;
const BUF = 1 << 12;
const TRACE = 2048;
/** the compass, B♭1–E5 (written as it sounds, in bass and tenor clef) */
export const BASSOON_LO = 34;
export const BASSOON_HI = 76;

/** The voicing: the reed, the bore's losses and the radiation. Fitted to the University of Iowa MIS
 *  bassoon (pp/mf/ff, B♭1–D5) with scripts/fit-bassoon.ts on the fit half of its notes (even MIDI numbers),
 *  judged on the held-out half (scripts/judge.ts); artifacts/realistic-3d/final-symphony/bassoon/NOTES.md. */
export interface BassoonVoice {
  /** embouchure parameter ζ at B♭1 and at E5 (the player pinches the blades for the high notes) */
  zeta: number;
  zetaTop: number;
  /** the mouth's pressure, in units of the closing pressure of the reed as opened for a loud note, at
   *  velocity 1 and 127, and the curve between (velocity^gammaCurve) */
  gammaLo: number;
  gammaHi: number;
  gammaCurve: number;
  /** The dynamic is mostly in the lips. Oboists' mouth pressure follows the pitch far more than the
   *  dynamic (Fuks & Sundberg 1999, Acustica 85, 267: bassoon 2–8 kPa, oboe 3–9); a soft note is played with the
   *  lips pressing the blades closer, the reed's rest opening H₀ down to `openPp` of a loud note's at
   *  velocity 1 (the same curve). The closing pressure pM ∝ H₀ (a spring) falls with it, so the swing
   *  the reed drives, in pascals, scales with H₀, ζ ∝ √H₀, and the blowing pressure in units of pM rises
   *  (the reed nearer shut). In the beating (Helmholtz-like) regime the swing in units of pM barely
   *  depends on γ or ζ (Ollivier, Dalmont & Kergomard 2004): the lips are what makes it quieter. */
  openPp: number;
  /** the breath's rise (s, a time constant) for a soft note and a loud one */
  riseLo: number;
  riseHi: number;
  /** the missing apex x₀ (m): the bocal's cone carried on to its point (the reed's volume stands in for it) */
  apex: number;
  /** both ends' reflection: a low-pass (Hz; radiation and wall losses), and the round trip's gain at
   *  audio frequencies (an open end reflects the mean pressure whole: −1 at 0 Hz, the loss above ~20 Hz;
   *  a scalar loss there held the bore's mean pressure for seconds and the reed's working point crept) */
  cutoff: number;
  wall: number;
  /** the walls' loss growing with frequency (viscothermal, ∝ √f): a one-pole low-pass in the long
   *  branch's loop, its corner `wallK` harmonics above the note. Fitted at 27 (1.6 kHz at B♭1): with none,
   *  a low note's waveform kept sharpening for half a second after it spoke (the recordings' low notes
   *  are whole in 20–100 ms). Heavier (a corner under ~12 harmonics, or the open-hole lattice's 400–500 Hz
   *  cutoff, Benade 1976, in the loop) settled them faster but left many low and tenor notes' fundamental
   *  unstable: held, they slid to their octave or twelfth within two seconds (scripts/bassoon-regimes.ts) */
  wallK: number;
  /** turbulence in the reed's channel: noise in the flow, ∝ the flow, and a floor ∝ the breath (the jet
   *  through the slit, there at pp where the swing is small) */
  noise: number;
  noiseFloor: number;
  /** the radiation's colour: below `hp` it falls (Hz); a shelf below 400 Hz (dB, the low fundamentals);
   *  the formant (Hz, dB, Q) and the second; above `lp` × (f₀ / 440 Hz)^lpExp a second-order fall (Hz,
   *  Q: the corner follows the note, as the open holes below it change; the recordings keep harmonics
   *  note's harmonics to a few kHz); a shelf above `shelfF` (dB) */
  hp: number;
  lowG: number;
  f1: number;
  g1: number;
  /** the formant's gain at E5 (g1 is B♭1's; between, on the log of the pitch). The low and tenor notes'
   *  harmonics gather at the formant (the recordings' strongest harmonic near 450–550 Hz from B♭1 to C4);
   *  the top notes, their fundamentals at or above it, keep their second harmonic as strong as the first */
  g1Top: number;
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
  /** the level across the compass, dB an octave (the radiation's derivative favours the high notes; the
   *  recordings' low notes are as strong as its tenor ones) */
  tilt: number;
  /** the tongue's release: a transient wider opening (×(1 + attackBoost), decaying with attackTau, s) */
  attackBoost: number;
  attackTau: number;
  /** tonguing: the breath builds behind the tongue on the blades for `tongueHold` (s), then the tongue
   *  withdraws over `tongueRel` periods of the note (the reed opens on a half-cosine) */
  tongueHold: number;
  tongueRel: number;
}

export const BASSOON_VOICE: BassoonVoice = {
  zeta: 1.28,
  zetaTop: 1.25,
  gammaLo: 0.0544,
  gammaHi: 0.833,
  gammaCurve: 1.04,
  openPp: 0.218,
  riseLo: 0.0354,
  riseHi: 0.0526,
  apex: 0.142,
  cutoff: 2500,
  wall: 0.998,
  wallK: 26.8,
  noise: 0.171,
  noiseFloor: 0.0111,
  hp: 42.3,
  lowG: -1.09,
  f1: 482,
  g1: 18,
  g1Top: 16.4,
  q1: 1.67,
  f2: 871,
  g2: 2.06,
  q2: 0.681,
  lp: 3170,
  lpQ: 0.881,
  lpExp: 0.941,
  lpDyn: 1.39,
  shelfF: 4000,
  shelfG: -10.6,
  tilt: -2.37,
  attackBoost: 0,
  attackTau: 0.05,
  tongueHold: 0.0285,
  tongueRel: 0.847,
};

/** the shortest tongued note: the breath stays on this long (s) from the key, as on the flute and
 *  trumpet, so a 50 ms tap still speaks: longer for a soft note, which takes longer to speak (its breath
 *  swells, riseLo: the recordings' soft notes do), from MIN_BLOW_PP at velocity 1 to MIN_BLOW at 127 */
const MIN_BLOW = 0.1;
const MIN_BLOW_PP = 0.3;
/** a note known to be short: the tongue holds the reed shut for at most this share of it */
const HOLD_SHARE = 0.1;
/** tongued over the breath (mono.ts): the release's wider opening is this much of a first attack's */
const LICK_BOOST = 0.5;
/** what the tongue on the reed takes from the bore while it lies there (dB/s), on top of the bore's own
 *  decay with the reed shut: together about the rate a real bore's resonances decay when the tongue stops
 *  a note, 400 dB/s (Li, Almeida, Smith & Wolfe 2016, JASA 139, the clarinet) */
const STOP_RATE = 200;

const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** which register a note is played in (the Woodwind Fingering Guide's basic chart for the Heckel-system
 *  bassoon): 1 B♭1–F3 (the first octave, the whisper key on from E2), 2 F♯3–F4 (the second: the half-hole,
 *  then the whisper key off), 3 F♯4–E5 (the third: cross-fingered, the flick keys) */
export function bassoonRegister(m: number): 1 | 2 | 3 {
  return m <= 53 ? 1 : m <= 65 ? 2 : 3;
}

export class BassoonCore implements InstrumentCore {
  readonly id = 'bassoon' as const;
  readonly fs: number;
  params: BassoonParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = 1;
  sympatheticAllowed = true;
  dry: boolean;
  private V: BassoonVoice;
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
  /** the walls' one-pole (wallK): its coefficient for the note and its state */
  private wp = 0;
  private wy = 0;
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
  /** when the tongue last let go (frame), and how much of the release's wider opening that stroke has
   *  (1: a note from silence) */
  private tongueAt = 0;
  private boostNow = 1;
  private velocity = 80;
  private noteStart = 0;
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
  /** ζ for the note (BassoonVoice zeta … zetaTop) */
  private zetaNote = 1;
  /** the radiation's corner for the note at ff (Hz), and the corner its section now has */
  private lpNote = 4000;
  private lpSet = -1;
  /** the corner as it glides to the note's and the dynamic's (Hz; −1: none yet, a note from silence
   *  takes its own at once) */
  private lpNow = -1;
  /** the note's level across the compass (tilt), and as the output last had it (eased across a block) */
  private tiltNote = 1;
  private tiltOut = 1;
  /** the reed's opening now (0 shut, 1 at rest), and the blowing pressure, for the stage */
  private xNow = 1;
  private gammaNow = 0;
  /** the reed's rest opening for the dynamic (of a loud note's), now and as the output last had it */
  private open = 1;
  private openOut = 1;

  constructor(opts: { sampleRate: number; params?: Partial<BassoonParams>; dry?: boolean; player?: number }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.params = { breath: 1, embouchure: 1, noise: 1, vibrato: 0.035, room: 0.3, volume: 1, ...opts.params };
    this.V = { ...BASSOON_VOICE, ...this.params.voice };
    this.keys = new MonoKeys(this.fs);
    this.rng = mulberry32(playerSeed(70, opts.player));
    const pv = playerVibrato(opts.player);
    this.vib0 = this.vibPhase = pv.phase;
    this.vibRate = pv.rate;
    this.tune = playerCents(opts.player) / 100;
    if (this.tune) this.bendFactor = Math.pow(2, -this.tune / 12);
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    this.voiced();
    this.setNote(69, true);
  }

  /** everything the voicing fixes: the ends' reflection, the apex, the radiation */
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
    this.formant();
    this.lpSet = -1;
    this.room.configure(this.params.room, this.params.seat);
    // matched to the oboe: the median mf note B♭1–E5 as loud as the oboe's B♭3–A6 (−22.6 dB dry; the
    // recordings' absolute levels are their microphone's gain; the double reeds sit side by side in the
    // woodwind section)
    this.gain = 0.700 * this.params.volume;
  }

  /** the formant's gain for the note (g1 at B♭1 … g1Top at E5), written into its section in place (no
   *  allocation on a note change) */
  private formant(): void {
    const V = this.V;
    const u = clamp((this.note - BASSOON_LO) / (BASSOON_HI - BASSOON_LO), 0, 1);
    peakingInto(this.eq.c, F1_SECTION * 5, V.f1, V.q1, V.g1 + (V.g1Top - V.g1) * u, this.fs);
  }

  /** measured voicing table (scripts/tune-bassoon.ts): cents the bare model plays sharp, by sample rate */
  static tuningTable: { fs: number[]; midi: number[]; cents: number[][] } = bassoonTuning as { fs: number[]; midi: number[]; cents: number[][] };
  private tuningCorrection(m: number): number {
    const t = BassoonCore.tuningTable;
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
    const w0 = (2 * Math.PI * f) / fs;
    const lag = biquadPhaseDelay(this.rc, w0);
    // (and the walls' one-pole in the long branch: its phase delay at the note)
    this.wp = Math.exp((-2 * Math.PI * Math.min(0.45 * fs, V.wallK * f)) / fs);
    const wlag = Math.atan2(this.wp * Math.sin(w0), 1 - this.wp * Math.cos(w0)) / w0;
    this.D1target = Math.max(2, (fs / f) * this.tuningCorrection(m) - this.D2 - 2 * lag - wlag - 1);
    if (immediate) this.D1 = this.D1target;
    this.zetaNote = V.zeta + (V.zetaTop - V.zeta) * clamp((m - BASSOON_LO) / (BASSOON_HI - BASSOON_LO), 0, 1);
    // the radiation's corner for this note (the dynamic moves it further: render())
    this.lpNote = V.lp * Math.pow(f / 440, V.lpExp);
    this.lpSet = -1;
    if (immediate) this.lpNow = -1;
    this.note = m;
    this.formant();
    this.tiltNote = Math.pow(f / et(BASSOON_LO), V.tilt / 6.0206);
    if (immediate) this.tiltOut = this.tiltNote;
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
    this.keys.forget();
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
    const m = clamp(a.midi, BASSOON_LO, BASSOON_HI);
    const vel = a.velocity || this.velocity;
    this.velocity = vel;
    this.releasePending = false;
    // (a stroke made ahead for a note that came otherwise lets go)
    if (this.lick.down && !(a.kind === 'retongue' && a.struck)) this.lick.release(this.tongueOpen(m));
    if (a.kind === 'slur') {
      this.setNote(m, false);
      // (back to a note still held: the fingers only)
      if (a.velocity) {
        this.pTarget = 1;
        this.attackTau = 0.01;
      }
    } else if (a.kind === 'tongue') {
      this.setNote(m, this.level < 1e-3);
      this.pTarget = 1;
      // a note known to be short speaks within a share of its length (mono.ts); one of unknown length (a
      // key in the hand) gets the long tone's rise the recordings were fitted on
      this.attackTau = quickRise(this.V.riseLo + (this.V.riseHi - this.V.riseLo) * (vel / 127), a.len);
      // tongued: the tongue holds the reed shut while the breath builds, then lets go
      this.tongueN = Math.round(quickRise(this.V.tongueHold, a.len, HOLD_SHARE) * this.fs);
      this.tongueLen = this.tongueOpen(m);
      this.tongueI = 0;
      this.vibPhase = this.vib0;
      this.noteStart = this.frame;
      this.tongueAt = this.frame;
      this.boostNow = 1;
      this.blowUntil = this.frame + Math.round((MIN_BLOW_PP + (MIN_BLOW - MIN_BLOW_PP) * (vel / 127)) * this.fs);
    } else {
      // tongued over the breath: the fingers move, the tongue stops the reed and lets it go again
      const same = m === this.note;
      this.setNote(m, false);
      this.pTarget = 1;
      this.attackTau = Math.min(this.attackTau, quickRise(this.V.riseLo + (this.V.riseHi - this.V.riseLo) * (vel / 127), a.len));
      this.tongueAt = this.frame + this.lick.retongue(a.struck, this.fs, same, this.tongueOpen(m));
      this.boostNow = LICK_BOOST;
      this.noteStart = this.frame;
      this.blowUntil = this.frame + Math.round(MIN_BLOW * this.fs);
    }
    if (a.tap) this.release();
  }

  /** The key is up: stop blowing, but not before the tongued note has had its minimum breath. */
  private release(): void {
    if (this.pTarget > 0 && this.frame < this.blowUntil) this.releasePending = true;
    else this.pTarget = 0;
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<BassoonParams>) };
    if (this.params.voice !== old.voice) {
      this.V = { ...BASSOON_VOICE, ...this.params.voice };
      this.voiced();
      this.setNote(this.note, false);
    } else if (this.params.room !== old.room || this.params.volume !== old.volume) this.voiced();
    else if (this.params.seat !== old.seat) this.room.configure(this.params.room, this.params.seat);
  }

  /** the one note sounding (monophonic: the last held key wins, a release returns to the previous) */
  sounding(): number[] {
    return this.pTarget > 0 ? [this.note] : [];
  }

  allSoundOff(): void {
    this.dyn = this.dynTarget = 0;
    this.clear();
    this.pressure = this.pTarget = 0;
    this.releasePending = false;
    this.keys.clear();
    this.keys.forget();
    this.lick.reset();
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  private clear(): void {
    this.lpNow = -1;
    this.longB.fill(0);
    this.apexB.fill(0);
    this.rx1 = this.rx2 = this.ry1 = this.ry2 = this.sx1 = this.sx2 = this.sy1 = this.sy2 = this.wy = 0;
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
    const fs = this.fs;
    const dt = n / fs;
    const P = this.params;
    const V = this.V;
    const k = 1 - Math.exp(-dt / (this.pTarget > this.pressure ? this.attackTau : 0.03));
    this.pressure += (this.pTarget - this.pressure) * k;
    if (this.pressure < 1e-5 && this.pTarget === 0) this.pressure = 0;
    const age = (this.frame - this.noteStart) / fs;
    this.vibPhase += 2 * Math.PI * 5.2 * this.vibRate * dt;
    const vib = 1 + P.vibrato * clamp((age - 0.3) / 0.4, 0, 1) * Math.sin(this.vibPhase);
    this.vibNow = vib - 1;
    // CC_DYNAMICS: the breath goes on as a note begun that much harder or softer would (a time constant)
    if (this.dyn !== this.dynTarget) {
      this.dyn += (this.dynTarget - this.dyn) * (1 - Math.exp(-dt / DYN_TAU));
      if (Math.abs(this.dynTarget - this.dyn) < 1e-3) this.dyn = this.dynTarget;
    }
    const v01 = this.dyn ? clamp(this.velocity + this.dyn, 1, 127) / 127 : this.velocity / 127;
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
    // the corner glides there (a time constant, in octaves): switched in one step, the section's
    // coefficients changed under a sounding tone and the output jumped (audio audit, Nov 2026: a
    // re-tongued note at another dynamic, or a leap, while the last still sounded)
    this.lpNow = this.lpNow < 0 ? lpF : this.lpNow * Math.pow(lpF / this.lpNow, 1 - Math.exp(-dt / LP_GLIDE));
    if (Math.abs(this.lpNow - this.lpSet) > 0.5) {
      lowpassInto(this.eq.c, 5 * LP_SECTION, this.lpNow, V.lpQ, fs);
      this.lpSet = this.lpNow;
    }
    const nzF = V.noiseFloor * P.noise * gamma;
    // (Newton's method below needs zeta/2 < 1: the flow's slope never turns the solution back)
    const zh = Math.min(0.95, 0.5 * zeta);
    const nz = V.noise * P.noise;
    const DT = this.D1target * this.bendFactor;
    // (a time constant, not a per-block fraction: a slur's glide must not depend on block length)
    const ease = 1 - Math.exp(-1 / (0.004 * fs));
    const D2 = this.D2;
    const d2i = Math.floor(D2);
    const d2f = D2 - d2i;
    const rc = this.rc;
    const wp = this.wp;
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
      const yw = (this.wy = y1 + wp * (this.wy - y1));
      this.m1 += (yw - this.m1) * kDc;
      const a1 = -(g * yw + (1 - g) * this.m1);
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
    // (in pascals: the swing in units of pM, times pM ∝ the reed's opening; eased across the block, so a
    // swell's steps never click)
    const g0 = this.gain * this.openOut * this.tiltOut;
    const g1 = this.gain * open * this.tiltNote;
    this.openOut = open;
    this.tiltOut = this.tiltNote;
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
    for (let m = BASSOON_LO; m <= BASSOON_HI; m++) {
      const r = bassoonRegister(m);
      out.push({ midi: m, f1: et(m), B: 0, nStrings: 1, lengthM: C_AIR / (2 * et(m)) - this.V.apex, hasDamper: false, preparation: r === 1 ? '1st register' : r === 2 ? '2nd register (half-hole, whisper key off)' : '3rd register (cross-fingered, flick keys)' });
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
    const r = bassoonRegister(this.note);
    const excite: ExciteTrace = {
      title: 'Reed',
      unit: '',
      rate: this.fs,
      trace: tx,
      trace2: tp,
      trace2Label: 'pressure in the bocal',
      caption: 'Opening of the double reed (top) as the pressure in the bocal (bottom) swings: blown closed, the blades shut once a cycle when the note is loud.',
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

/** the radiation chain's low-pass section (voiced(): high-pass, low shelf, two formants, low-pass, shelf),
 *  and its first formant's */
const LP_SECTION = 4;
/** the brightness corner's glide to a new note or dynamic (s): within the attack, slower than a click */
const LP_GLIDE = 0.01;
const F1_SECTION = 2;
/** RBJ peaking coefficients [b0,b1,b2,a1,a2] written into c at `at` (no allocation) */
function peakingInto(c: Float64Array, at: number, f: number, q: number, gainDb: number, fs: number): void {
  const A = Math.pow(10, gainDb / 40);
  const w = (2 * Math.PI * f) / fs;
  const alpha = Math.sin(w) / (2 * q);
  const cs = Math.cos(w);
  const a0 = 1 + alpha / A;
  c[at] = (1 + alpha * A) / a0;
  c[at + 1] = (-2 * cs) / a0;
  c[at + 2] = (1 - alpha * A) / a0;
  c[at + 3] = (-2 * cs) / a0;
  c[at + 4] = (1 - alpha / A) / a0;
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
