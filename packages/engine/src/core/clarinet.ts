// Clarinet: a single reed blown closed against the mouthpiece's lay, on a cylindrical bore (the reed
// family of the oboe, oboe.ts; the bore is the textbook one).
//
// The bore. A cylinder closed at the reed and open at its first open tone hole is a quarter-wave
// resonator: resonances at odd multiples of c / 4L, so a clarinet plays odd harmonics strongly, overblows
// at the twelfth, and sounds an octave lower than an oboe of its length (Benade 1976, "Fundamentals of
// Musical Acoustics"; Fletcher & Rossing 1998, §15). One delay line: the wave leaves the reed, is
// reflected inverted at the open end (through a low-pass: the open-hole lattice reflects below its cutoff,
// about 1.5 kHz on a clarinet, and lets the rest through, Benade 1960), and comes back. Above the cutoff
// the bore barely resonates, so the reed's flow there has all its harmonics, even and odd: the clarinet's
// odd-harmonic sound is a low-register property (Benade & Kouzoupis 1988, JASA 83). The mean pressure is
// reflected whole (an open end is a pressure release: −1 at 0 Hz).
//
// The reed. One cane blade against the mouthpiece, pressed shut by the mouth's pressure (Wilson & Beavers
// 1974, JASA 56; Dalmont, Gilbert & Ollivier 2003, JASA 114: the quasi-static characteristic). In units of
// the closing pressure pM: opening x = 1 − Δ (Δ = mouth − mouthpiece pressure; shut at Δ ≥ 1), flow
// u = ζ·x·√|Δ|·sgn Δ (ζ: the embouchure, Kergomard's parameter, about 0.1–0.5 on a clarinet). With the
// bore's incoming wave a at the reed, p = 2a + u (one branch, the bore's impedance), solved with the flow
// exactly each sample (a cubic in √|Δ|, Newton). Quasi-static: the reed's own resonance (2–3 kHz) is left
// out, as on the oboe. The blowing pressure γ = pm/pM: oscillation above γ ≈ 1/3, beating above ½.
//
// Every note is played on the tube whose fundamental it is (the clarion's register key and the altissimo's
// vents are not modelled: the short tube's resonances are the long one's at the note's harmonics). The
// radiation is the flow leaving the open end (incident minus reflected wave: below the cutoff little, above
// it most), differentiated (a small opening radiates ∝ f), then the radiation's colour, fitted to the
// recordings.

import { Pump } from './pump.ts';
import { MonoKeys, quickRise, Tongue } from './mono.ts';
import { CC_DYNAMICS, DYN_TAU, type ExciteTrace, type InstrumentCore } from './instrument.ts';
import type { KeySummary } from '../api/messages.ts';
import type { PianoEvent } from './piano-core.ts';
import { biquadHighpass, biquadHighShelf, biquadLowShelf, biquadLowpass, biquadPeaking } from './filters.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { clamp, interp, mulberry32, playerCents, playerSeed, playerVibrato } from './util.ts';
import clarinetTuning from './clarinet-tuning.json';

export interface ClarinetParams {
  /** blowing pressure scale (1 = the dynamic's own) */
  breath: number;
  /** the lips on the reed: < 1 bites it closed (darker, softer), > 1 lets it open */
  embouchure: number;
  /** turbulence noise amount */
  noise: number;
  /** breath vibrato depth (fraction of the blowing pressure; clarinettists mostly play without) */
  vibrato: number;
  room: number;
  volume: number;
  /** orchestra mode: where it sits on the stage (post.ts Seat); none, the single instrument's place */
  seat?: Seat | null;
  /** fitting only (scripts/fit-clarinet.ts): the voicing below, overridden */
  voice?: Partial<ClarinetVoice>;
}

const C_AIR = 343;
const BUF = 1 << 12;
const TRACE = 2048;
/** the B♭ clarinet's compass at concert pitch: written E3–C7 sounds D3–B♭6 */
export const CLARINET_LO = 50;
export const CLARINET_HI = 94;

/** The voicing: the reed, the bore's losses and the radiation. Fitted to the University of Iowa MIS
 *  B♭ clarinet (pp/mf/ff, D3–B6) with scripts/fit-clarinet.ts on the fit half of its notes (even MIDI
 *  numbers), judged on the held-out half (scripts/judge.ts); artifacts/realistic-3d/final-symphony/clarinet/NOTES.md. */
export interface ClarinetVoice {
  /** embouchure parameter ζ at D3 and at B♭6 */
  zeta: number;
  zetaTop: number;
  /** the mouth's pressure above the note's own threshold of oscillation, in units of the reed's closing
   *  pressure, at velocity 1 and 127, and the curve between (velocity^gammaCurve). A player blows each
   *  note from its threshold: just over it, a clarinet's note is nearly a sine and soft (the bifurcation is
   *  direct: the amplitude grows as √(γ − γ_th), Dalmont, Gilbert & Kergomard 2000; Atig et al. 2004);
   *  a fixed γ left the soft range a sliver that moved from note to note (losses differ), and pp as bright
   *  as mf. The threshold is computed for the note: where the reed's negative conductance ζ(3γ − 1)/2√γ
   *  meets the bore's peak admittance (1 − r)/(1 + r), r the round trip's gain at the note */
  gammaLo: number;
  gammaHi: number;
  gammaCurve: number;
  /** the lips' share of the dynamic: the reed's rest opening at velocity 1, of a loud note's (pM ∝ H₀,
   *  ζ ∝ √H₀, as on the oboe) */
  openPp: number;
  /** the breath's rise (s, a time constant) for a soft note and a loud one, at D3; a higher note's is
   *  shorter by (f₀ / D3)^riseExp (the recordings' high notes speak within 20–45 ms, a soft low one swells) */
  riseLo: number;
  riseHi: number;
  riseExp: number;
  /** the level's rise across the compass (dB per octave: the open holes and the bell radiate the high
   *  notes better; the recordings' top octave is ~10 dB over the chalumeau at the same dynamic) */
  tilt: number;
  /** the open end's reflection: a fourth-order low-pass (two sections at one corner, Hz, and Q: the
   *  open-hole lattice reflects below its cutoff and passes the rest, Benade 1960; a second-order one
   *  left the bore resonating an octave above it, and the clarion's even harmonics 15 dB short), and the
   *  round trip's gain at audio frequencies (the mean pressure is reflected whole) */
  cutoff: number;
  cutQ: number;
  wall: number;
  /** …the corner follows the register, × (f₀ / D3)^cutExp (the clarion's and the altissimo's vents and
   *  cross-fingerings leave few resonances above the note: their even harmonics come through), and the
   *  walls' loss grows down the compass: the round trip's gain is wall^((440 Hz / f₀)^wallExp) (the
   *  viscothermal loss of a tube ∝ its length × √f) */
  cutExp: number;
  wallExp: number;
  /** the walls' loss grows with frequency (viscothermal, ∝ √f; and the radiation): a one-pole low-pass in
   *  the loop, its corner `wallK` harmonics above the note. So the bore's first resonance is its
   *  strongest, and just over the threshold only it sustains: a soft note is nearly a sine. (With a flat
   *  loss every resonance reached threshold together and the softest note was already a square wave, its
   *  third harmonic at −9.5 dB: Raman's model; the recordings' pp chalumeau has it at −21 dB.) */
  wallK: number;
  /** turbulence in the reed's channel: noise in the flow, ∝ the flow, and a floor ∝ the breath, rising
   *  up the compass × (f₀ / D3)^noisePitch (the recordings' high notes are as breathy as their low ones
   *  although they are louder) */
  noise: number;
  noiseFloor: number;
  noisePitch: number;
  /** the radiation's colour: below `hp` it falls (Hz); a shelf below 400 Hz (dB); two formants (Hz, dB,
   *  Q); above `lp` × (f₀ / 440 Hz)^lpExp a second-order fall (Hz, Q), lpDyn octaves lower at velocity 1
   *  than at 127; a shelf above `shelfF` (dB) */
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
  lpDyn: number;
  shelfF: number;
  shelfG: number;
  /** the tongue's release: a transient wider opening (×(1 + attackBoost), decaying with attackTau, s) */
  attackBoost: number;
  attackTau: number;
  /** tonguing: the tongue holds the reed against the lay for `tongueHold` (s) while the breath builds,
   *  then withdraws over `tongueRel` periods of the note */
  tongueHold: number;
  tongueRel: number;
}

export const CLARINET_VOICE: ClarinetVoice = {
  zeta: 0.535,
  zetaTop: 0.757,
  gammaLo: -0.0211,
  gammaHi: 0.452,
  gammaCurve: 1.58,
  openPp: 0.672,
  riseLo: 0.0774,
  riseHi: 0.0544,
  riseExp: 0.327,
  tilt: 1.43,
  cutoff: 3441,
  cutQ: 0.522,
  wall: 0.9923,
  cutExp: 0.0221,
  wallExp: 0.0915,
  wallK: 4.48,
  noise: 0.025,
  noiseFloor: 0.0108,
  noisePitch: 0.25,
  hp: 60,
  lowG: 6.39,
  f1: 1121,
  g1: 7.54,
  q1: 1.4,
  f2: 2053,
  g2: -8.48,
  q2: 3.83,
  lp: 3902,
  lpQ: 1.03,
  lpExp: 0.27,
  lpDyn: 2.11,
  shelfF: 7000,
  shelfG: -8.95,
  attackBoost: 0.176,
  attackTau: 0.05,
  tongueHold: 0.0159,
  tongueRel: 1.14,
};

/** the shortest tongued note: the breath stays on this long (s) from the key, from MIN_BLOW_PP at
 *  velocity 1 to MIN_BLOW at 127, so a 50 ms tap still speaks (as on the oboe). A soft note blown just
 *  over its threshold grows slowly (a low pp note takes ~0.4 s to its full level; the recordings' swell
 *  for 0.2–1 s), so a soft tap keeps its breath longer */
const MIN_BLOW = 0.1;
const MIN_BLOW_PP = 0.45;
/** a note known to be short: the tongue holds the reed shut for at most this share of it */
const HOLD_SHARE = 0.1;
/** tongued over the breath (mono.ts): the release's wider opening is this much of a first attack's */
const LICK_BOOST = 0.5;
/** what the tongue on the reed takes from the bore while it lies there (dB/s): nothing. This bore's own
 *  decay with the reed shut is already a real one's (about 540 dB/s in the middle; Li, Almeida, Smith &
 *  Wolfe 2016, JASA 139, measured some 400 on the clarinet): a repeated note falls 14 dB between its strokes */
const STOP_RATE = 0;

const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** which register a note (concert pitch) is played in on a B♭ clarinet (written = concert + 2): 1 the
 *  chalumeau and the throat notes (written E3–B♭4), 2 the clarion (B4–C6, the register key: the twelfth),
 *  3 the altissimo (C♯6 up, cross-fingered with vents) */
export function clarinetRegister(m: number): 1 | 2 | 3 {
  return m <= 68 ? 1 : m <= 82 ? 2 : 3;
}

export class ClarinetCore implements InstrumentCore {
  readonly id = 'clarinet' as const;
  readonly fs: number;
  params: ClarinetParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = 1;
  sympatheticAllowed = true;
  dry: boolean;
  private V: ClarinetVoice;
  private queue: { frame: number; ev: PianoEvent | { type: 'control'; cc: number; value: number } }[] = [];
  /** the wave leaving the reed down the bore */
  private bore = new Float64Array(BUF);
  /** the round trip (samples), eased towards its target */
  private D1 = 100;
  private D1target = 100;
  /** the open end's reflection: a low-pass (two sections, the same coefficients) and its state */
  private rc = new Float64Array(5);
  private rx1 = 0;
  private rx2 = 0;
  private ry1 = 0;
  private ry2 = 0;
  private qy1 = 0;
  private qy2 = 0;
  /** the walls' one-pole (its pole for the note) and its state */
  private wp = 0;
  private wy = 0;
  /** the reflected wave, averaged below ~20 Hz (the part reflected whole) */
  private m1 = 0;
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
  /** the tongue on the reed: samples it still holds it shut, then the release's length and progress */
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
  private zetaNote = 1;
  /** the round trip's gain at audio frequencies for the note, and its whole gain at the note (the walls
   *  and the lattice: for the threshold) */
  private gNote = 0.995;
  private rNote = 0.9;
  /** the note's share of the breath's rise, and its level across the compass (tilt) */
  private riseNote = 1;
  private tiltNote = 1;
  private noiseNote = 1;
  /** the tilt the output last had (eased across a block, as the opening is) */
  private tiltOut = 1;
  /** the radiation's corner for the note at ff (Hz), and the corner its section now has */
  private lpNote = 4000;
  private lpSet = -1;
  /** the reed's opening now (0 shut, 1 at rest), and the blowing pressure, for the stage */
  private xNow = 1;
  private gammaNow = 0;
  /** the reed's rest opening for the dynamic (of a loud note's), as the output last had it */
  private openOut = 1;

  constructor(opts: { sampleRate: number; params?: Partial<ClarinetParams>; dry?: boolean; player?: number }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.params = { breath: 1, embouchure: 1, noise: 1, vibrato: 0, room: 0.3, volume: 1, ...opts.params };
    this.V = { ...CLARINET_VOICE, ...this.params.voice };
    this.keys = new MonoKeys(this.fs);
    this.rng = mulberry32(playerSeed(71, opts.player));
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

  /** everything the voicing fixes: the end's reflection, the radiation */
  private voiced(): void {
    const fs = this.fs;
    const V = this.V;
    lowpassInto(this.rc, 0, Math.min(0.45 * fs, V.cutoff), V.cutQ, fs);
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
    // matched to the oboe beside it: the median mf note D4–E6 as loud (−20.9 dB dry; the recordings'
    // absolute levels are their microphone's gain)
    this.gain = 1.27 * this.params.volume;
  }

  /** measured voicing table (scripts/tune-clarinet.ts): cents the bare model plays sharp at mf (velocity
   *  70), by sample rate, and how much more at pp (30) and ff (112): blown nearer its threshold a note sits
   *  ~9 ¢ flatter, harder ~5 ¢ sharper, which a player lips away (the recorded clarinettist's pitch has no
   *  such trend: pp +4 ¢, mf −7, ff −1) */
  static tuningTable: { fs: number[]; midi: number[]; cents: number[][]; pp?: number[][]; ff?: number[][] } = clarinetTuning as { fs: number[]; midi: number[]; cents: number[][]; pp?: number[][]; ff?: number[][] };
  private tuningCorrection(m: number, vel: number): number {
    const t = ClarinetCore.tuningTable;
    if (!t.midi?.length) return 1;
    const at = (rows: number[][]) => {
      const r = rows.map((row) => interp(m, t.midi, row));
      return t.fs.length > 1 ? interp(this.fs, t.fs, r) : r[0];
    };
    let c = at(t.cents);
    if (t.pp && vel < 70) c += at(t.pp) * clamp((70 - vel) / 40, 0, 1);
    else if (t.ff && vel > 70) c += at(t.ff) * clamp((vel - 70) / 42, 0, 1);
    return Math.pow(2, c / 1200);
  }

  private setNote(m: number, immediate: boolean): void {
    const fs = this.fs;
    const V = this.V;
    const f = et(m);
    // the lattice's corner for the note (written in place: a note change on the audio thread allocates
    // nothing), the walls' loss for its length
    lowpassInto(this.rc, 0, Math.min(0.45 * fs, V.cutoff * Math.pow(f / et(CLARINET_LO), V.cutExp)), V.cutQ, fs);
    this.gNote = Math.pow(V.wall, Math.pow(440 / f, V.wallExp));
    const w0 = (2 * Math.PI * f) / fs;
    this.wp = Math.exp((-2 * Math.PI * Math.min(0.45 * fs, V.wallK * f)) / fs);
    const wp = this.wp;
    this.rNote = (this.gNote * Math.pow(biquadMag(this.rc, w0), 2) * (1 - wp)) / Math.hypot(1 - wp * Math.cos(w0), wp * Math.sin(w0));
    // the period is two round trips (the open end inverts the wave): each through the end's low-pass
    // and the walls' (their phase delay at the note) and the interpolation's half sample
    const lag = 2 * biquadPhaseDelay(this.rc, w0) + Math.atan2(wp * Math.sin(w0), 1 - wp * Math.cos(w0)) / w0;
    this.D1target = Math.max(2, (fs / (2 * f)) * this.tuningCorrection(m, this.velocity) - lag - 0.5);
    if (immediate) this.D1 = this.D1target;
    this.zetaNote = V.zeta + (V.zetaTop - V.zeta) * clamp((m - CLARINET_LO) / (CLARINET_HI - CLARINET_LO), 0, 1);
    this.riseNote = Math.pow(f / et(CLARINET_LO), -V.riseExp);
    this.tiltNote = Math.pow(f / et(CLARINET_LO), V.tilt / 6.0206);
    this.noiseNote = Math.pow(f / et(CLARINET_LO), V.noisePitch);
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
        if (ev.cc === 1 || ev.cc === 2 || ev.cc === 11) this.expression = ev.value < 0 ? 1 : 0.55 + 0.6 * clamp(ev.value, 0, 1);
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
    const m = clamp(a.midi, CLARINET_LO, CLARINET_HI);
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
      this.attackTau = quickRise((this.V.riseLo + (this.V.riseHi - this.V.riseLo) * (vel / 127)) * this.riseNote, a.len);
      // tongued: the tongue holds the reed shut while the breath builds, then lets go
      this.tongueN = Math.round(quickRise(this.V.tongueHold, a.len, HOLD_SHARE) * this.fs);
      this.tongueLen = this.tongueOpen(m);
      this.tongueI = 0;
      this.vibPhase = this.vib0;
      this.breathStart = this.frame;
      this.tongueAt = this.frame;
      this.boostNow = 1;
      this.afterStop = false;
      this.blowUntil = this.frame + Math.round((MIN_BLOW_PP + (MIN_BLOW - MIN_BLOW_PP) * (vel / 127)) * this.fs);
    } else {
      // tongued over the breath: the fingers move, the tongue stops the reed and lets it go again
      const same = m === this.note;
      this.setNote(m, false);
      this.pTarget = 1;
      this.attackTau = Math.min(this.attackTau, quickRise((this.V.riseLo + (this.V.riseHi - this.V.riseLo) * (vel / 127)) * this.riseNote, a.len));
      this.tongueAt = this.frame + this.lick.retongue(a.struck, this.fs, same, this.tongueOpen(m));
      this.boostNow = this.afterStop ? 1 : LICK_BOOST;
      this.afterStop = false;
      this.blowUntil = this.frame + Math.round(MIN_BLOW * this.fs);
    }
    if (a.tap) this.release();
  }

  private release(): void {
    if (this.pTarget > 0 && this.frame < this.blowUntil) this.releasePending = true;
    else this.pTarget = 0;
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<ClarinetParams>) };
    if (this.params.voice !== old.voice) {
      this.V = { ...CLARINET_VOICE, ...this.params.voice };
      this.voiced();
      this.setNote(this.note, false);
    } else if (this.params.room !== old.room || this.params.volume !== old.volume) this.voiced();
    else if (this.params.seat !== old.seat) this.room.configure(this.params.room, this.params.seat);
  }

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
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  private clear(): void {
    this.bore.fill(0);
    this.rx1 = this.rx2 = this.ry1 = this.ry2 = this.qy1 = this.qy2 = this.wy = 0;
    this.m1 = 0;
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

  process(outL: Float32Array | Float64Array, outR: Float32Array | Float64Array, frames: number): void {
    this.pump.pull(outL, outR, frames, (L, R) => {
      const q = this.queue;
      while (q.length && q[0].frame <= this.frame) this.apply(q.shift()!.ev);
      this.settle();
      let n = 64;
      if (q.length) n = Math.max(1, Math.min(n, q[0].frame - this.frame));
      if (this.releasePending) {
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
        this.setNote(clamp(this.keys.comingMidi, CLARINET_LO, CLARINET_HI), false);
      }
      this.render(n);
      for (let t = 0; t < n; t++) {
        L[t] = this.oL[t];
        R[t] = this.oR[t];
      }
      return n;
    });
  }

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
    const k = 1 - Math.exp(-dt / (this.pTarget > this.pressure ? this.attackTau : 0.03));
    this.pressure += (this.pTarget - this.pressure) * k;
    if (this.pressure < 1e-5 && this.pTarget === 0) this.pressure = 0;
    const age = (this.frame - this.breathStart) / fs;
    this.vibPhase += 2 * Math.PI * 5 * this.vibRate * dt;
    const vib = 1 + P.vibrato * clamp((age - 0.3) / 0.4, 0, 1) * Math.sin(this.vibPhase);
    this.vibNow = vib - 1;
    if (this.dyn !== this.dynTarget) {
      this.dyn += (this.dynTarget - this.dyn) * (1 - Math.exp(-dt / DYN_TAU));
      if (Math.abs(this.dynTarget - this.dyn) < 1e-3) this.dyn = this.dynTarget;
    }
    const v01 = this.dyn ? clamp(this.velocity + this.dyn, 1, 127) / 127 : this.velocity / 127;
    const vc = Math.pow(v01, V.gammaCurve);
    const open = V.openPp + (1 - V.openPp) * vc;
    // the note's threshold with the reed as the lips hold it: ζ(3γ − 1) / 2√γ = (1 − r) / (1 + r), in
    // s = √γ a quadratic, 3ζs² − 2cs − ζ = 0
    const zSteady = this.zetaNote * Math.sqrt(open) * P.embouchure;
    const cTh = (1 - this.rNote) / (1 + this.rNote);
    const sTh = (cTh + Math.sqrt(cTh * cTh + 3 * zSteady * zSteady)) / (3 * Math.max(1e-6, zSteady));
    const gNote = sTh * sTh + V.gammaLo + (V.gammaHi - V.gammaLo) * vc;
    const gamma = gNote * this.pressure * vib * P.breath * this.expression;
    this.gammaNow = gamma;
    const ageT = Math.max(0, this.frame - this.tongueAt) / fs;
    const zeta = zSteady * (1 + V.attackBoost * this.boostNow * Math.exp(-ageT / V.attackTau));
    const lpF = Math.min(0.45 * fs, this.lpNote * Math.pow(2, V.lpDyn * (vc - 1)));
    if (Math.abs(lpF - this.lpSet) > 0.5) {
      lowpassInto(this.eq.c, 5 * LP_SECTION, lpF, V.lpQ, fs);
      this.lpSet = lpF;
    }
    const nzF = V.noiseFloor * P.noise * gamma * this.noiseNote;
    // (Newton's method below needs ζ < 1: the flow's slope never turns the solution back)
    const zh = Math.min(0.95, zeta);
    const nz = V.noise * P.noise;
    const DT = this.D1target * this.bendFactor;
    // (a time constant, not a per-block fraction: a slur's glide must not depend on block length)
    const ease = 1 - Math.exp(-1 / (0.004 * fs));
    const rc = this.rc;
    const g = this.gNote;
    const wp = this.wp;
    const kDc = this.kDc;
    const bore = this.bore;
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
      // the wave back from the open end: reflected through the low-pass, inverted, with the walls' loss
      const e = bore[(w - di) & mask] * (1 - fr) + bore[(w - di - 1) & mask] * fr;
      const y0 = rc[0] * e + rc[1] * this.rx1 + rc[2] * this.rx2 - rc[3] * this.ry1 - rc[4] * this.ry2;
      this.rx2 = this.rx1;
      this.rx1 = e;
      const y1 = rc[0] * y0 + rc[1] * this.ry1 + rc[2] * this.ry2 - rc[3] * this.qy1 - rc[4] * this.qy2;
      this.ry2 = this.ry1;
      this.ry1 = y0;
      this.qy2 = this.qy1;
      this.qy1 = y1;
      const yw = (this.wy = y1 + wp * (this.wy - y1));
      this.m1 += (yw - this.m1) * kDc;
      const a = -(g * yw + (1 - g) * this.m1);
      // the reed and the bore together: p = 2a + u, Δ = γ − p, u = ζ(1 − Δ)√Δ (Δ < 0: the reed pushed
      // open, the flow back). In s = √|Δ|: s² ± ζ(s ∓ s³) = |γ − 2a|, by Newton from the last sample's s
      const D0 = gamma - 2 * a;
      let Dl: number;
      let u: number;
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
        // shut against the lay: no flow
        Dl = D0;
        u = 0;
        s = 1;
      } else if (D0 >= 0) {
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
      const p = 2 * a + u;
      bore[w & mask] = (p - a) * damp;
      // radiation: the flow leaving the open end (incident minus reflected), differentiated
      const flow = e - a;
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
      const ap = Math.abs(p);
      if (ap > peak) peak = ap;
      this.xNow = x;
    }
    this.sPrev = s;
    this.level = Math.max(peak, this.level * 0.9);
    // (in pascals: the swing in units of pM, times pM ∝ the reed's opening; eased across the block)
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
    for (let m = CLARINET_LO; m <= CLARINET_HI; m++) {
      const r = clarinetRegister(m);
      out.push({ midi: m, f1: et(m), B: 0, nStrings: 1, lengthM: C_AIR / (4 * et(m)), hasDamper: false, preparation: r === 1 ? 'chalumeau' : r === 2 ? 'clarion (the twelfth)' : 'altissimo' });
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
      shape[p] = this.bore[(w - Math.round(d)) & (BUF - 1)] - this.bore[(w - Math.round(D - d)) & (BUF - 1)];
    }
    const len = Math.min(TRACE, Math.max(64, Math.round((4 * this.fs) / et(this.note))));
    const tx = new Float32Array(len);
    const tp = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const j = (this.trI - len + i + TRACE) & (TRACE - 1);
      tx[i] = this.trX[j];
      tp[i] = this.trP[j];
    }
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
    const r = clarinetRegister(this.note);
    const excite: ExciteTrace = {
      title: 'Reed',
      unit: '',
      rate: this.fs,
      trace: tx,
      trace2: tp,
      trace2Label: 'pressure in the mouthpiece',
      caption: 'Opening of the reed against the mouthpiece’s lay (top) as the pressure in the mouthpiece (bottom) swings: blown closed, it beats shut once a cycle when the note is loud.',
      meta: `γ ${this.gammaNow.toFixed(2)} · ${r === 1 ? 'chalumeau' : r === 2 ? 'clarion' : 'altissimo'}`,
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
        lengthM: C_AIR / (4 * et(this.note)),
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
/** RBJ low-pass coefficients [b0,b1,b2,a1,a2] written into c at `at` (no allocation) */
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

/** the magnitude of a biquad [b0,b1,b2,a1,a2] at ω (rad/sample) */
function biquadMag(c: ArrayLike<number>, w: number): number {
  const m = (b0: number, b1: number, b2: number) => Math.hypot(b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w), b1 * Math.sin(w) + b2 * Math.sin(2 * w));
  return m(c[0], c[1], c[2]) / m(1, c[3], c[4]);
}

/** phase delay (samples) of a biquad [b0,b1,b2,a1,a2] at ω (rad/sample) */
function biquadPhaseDelay(c: ArrayLike<number>, w: number): number {
  const ph = (b0: number, b1: number, b2: number) => Math.atan2(-(b1 * Math.sin(w) + b2 * Math.sin(2 * w)), b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w));
  const phi = ph(c[0], c[1], c[2]) - ph(1, c[3], c[4]);
  return -phi / w;
}
