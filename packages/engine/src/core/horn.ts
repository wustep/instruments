// French horn (the double horn in F and B♭): buzzing lips driving a long, narrow bore wound in a circle,
// most of it conical, opening into a wide bell with the player's right hand in it. The trumpet's family
// (brass.ts): the lips are a valve the breath blows open, the bore a delay loop whose round trip sets the
// harmonic series, the valves lengthen it and the lips' tension picks which partial of it sounds.
//
// The bore. The F horn's tube is 3.7 m and the B♭ horn's 2.8 m (Fletcher & Rossing 1998, "The Physics of
// Musical Instruments" §14.6; Campbell, Gilbert & Myers 2021, "The Science of Brass Instruments" §8): the
// double horn has both, the thumb valve choosing. Their resonances (the mouthpiece and the bell make them a
// nearly harmonic series above the first) are the partials of F1 (43.7 Hz) and B♭1 (58.3 Hz). A horn plays
// high in its series, to the 16th partial on the F side: neighbouring resonances a semitone or two apart,
// the lips choosing among them. Most of the horn's bore widens steadily (the mouthpipe and the bell's long
// flare; Campbell, Gilbert & Myers 2021 §8.2): as a cone, it plays the whole series n·c/2(L + x₀). So the
// bore is the oboe's and bassoon's "cylindrical saxophone" (Dalmont, Gilbert & Kergomard 2000, Acta Acustica
// 86, 671): two delay lines meeting at the lips, the tube itself and its missing apex x₀ (the cone carried
// on behind the mouthpiece), both open (−1 at 0 Hz). (A single tube closed at the lips and open at the
// bell plays only the odd multiples of c/4L: a clarinet.) At the far end the bell reflects the lows and
// lets the highs out (a low-pass reflection; above the bell's cutoff the resonances fade, which is why the
// top of the compass is hard), with a little wall loss; the tube's round trip plus the apex's is one
// period of the tube's fundamental, so its n-th resonance is the note. The players' standard double-horn
// fingering (hornFingering) sets the side, the valves and the partial: the F side up to C4, the B♭ side
// from C♯4 (the thumb valve down), as most players switch near written G♯4.
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
// horn's colour, fitted to the recordings: the hand in the bell and the bell turned away from the listener
// darken it, and the horn's harmonics gather near 450–600 Hz whatever the note (the University of Iowa
// horn: the strongest harmonic is the 7th–9th at B♭1, the 3rd at E♭3, the 2nd at C4, the fundamental above
// F4); a loud note's lips close sharply each cycle and the bore steepens it, so ff is brassy (the corner of
// the fall moves up with the dynamic).

import { Pump } from './pump.ts';
import type { KeySummary } from '../api/messages.ts';
import { CC_DYNAMICS, DYN_TAU, type ExciteTrace, type InstrumentCore } from './instrument.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { biquadHighpass, biquadHighShelf, biquadLowpass, biquadPeaking } from './filters.ts';
import type { PianoEvent } from './piano-core.ts';
import { clamp, interp, mulberry32, playerCents, playerSeed, playerVibrato } from './util.ts';
import hornTuning from './horn-tuning.json';

export interface HornParams {
  /** blowing pressure scale (1 = the dynamic's own) */
  breath: number;
  /** the lips' tension: semitones above (+) or below (−) the note's own; far enough, the next partial speaks */
  lip: number;
  /** turbulence noise amount */
  noise: number;
  /** lip vibrato depth (fraction of the lips' frequency) */
  vibrato: number;
  room: number;
  volume: number;
  /** orchestra mode: where it sits on the stage (post.ts Seat); none, the single instrument's place */
  seat?: Seat | null;
  /** fitting only (scripts/fit-horn.ts): the voicing below, overridden */
  voice?: Partial<HornVoice>;
}

const C_AIR = 343;
const BUF = 1 << 13;
const TRACE = 2048;
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** the compass, B♭1–F5 as it sounds (MIDI 34–77): the horn in F's written F2–C6, a fifth higher. The
 *  usual orchestral compass is written F♯2–C6 (sounding B1–F5); the low B♭1 is the B♭ side's pedal */
export const HORN_LO = 34;
export const HORN_HI = 77;
/** the open tubes' fundamentals (MIDI): F1 for the F side, B♭1 for the B♭ side (the thumb valve) */
const F_SIDE = 29;
const BB_SIDE = 34;
/** their lengths, m (Fletcher & Rossing 1998 §14.6) */
export const HORN_F_LENGTH = 3.74;
export const HORN_BB_LENGTH = 2.8;
/** the valves' combinations by how far they lower the tube (semitones), as horn players use them: the
 *  second valve a semitone, the first a tone, 1+2 (for the third) a minor third, then 2+3, 1+3, 1+2+3 */
const VALVES = ['0', '2', '1', '1+2', '2+3', '1+3', '1+2+3'];
/** the partials players use: the 7th, 11th, 13th and 14th are out of tune with equal temperament */
const PARTIALS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 15, 16];

export interface HornFingering {
  /** 'F' the F horn, 'Bb' the B♭ horn (the thumb valve pressed) */
  side: 'F' | 'Bb';
  /** the valves down: '0' (open), '2', '1', '1+2', '2+3', '1+3', '1+2+3' */
  valves: string;
  /** how far the valves lower the tube (semitones) */
  lower: number;
  /** which resonance of the tube sounds (1 = its fundamental, the pedal) */
  partial: number;
}

/** The standard double-horn fingering for a note as it sounds: the F side up to C4 (written G4), the B♭
 *  side from C♯4 (written G♯4), the fewest valves on the lowest usable partial. The common charts' (e.g.
 *  Farkas, "The Art of French Horn Playing", 1956): written C4 F 0, B♭4 T1, B4 T2, C5 T0, F5 T0, F♯5 T2,
 *  G5 T0, B♭5 T1, B5 T2, C6 T0. The low B♭1 (written F2) is the B♭ side's open pedal. */
export function hornFingering(m: number): HornFingering {
  const note = clamp(Math.round(m), HORN_LO, HORN_HI);
  const sides: ('F' | 'Bb')[] = note >= 61 ? ['Bb', 'F'] : note === HORN_LO ? ['Bb'] : ['F', 'Bb'];
  for (const side of sides) {
    const base = side === 'F' ? F_SIDE : BB_SIDE;
    let best: HornFingering | null = null;
    let bestScore = Infinity;
    for (const n of PARTIALS)
      for (let v = 0; v <= 6; v++) {
        if (base - v + Math.round(12 * Math.log2(n)) !== note) continue;
        // (the pedal only for the low B♭: elsewhere a partial ≥ 2)
        if (n === 1 && note !== HORN_LO) continue;
        const score = v * 10 + n;
        if (score < bestScore) {
          bestScore = score;
          best = { side, valves: VALVES[v], lower: v, partial: n };
        }
      }
    if (best) return best;
  }
  return { side: 'F', valves: '0', lower: 0, partial: 4 };
}

/** the tube's length (m) for a fingering: the side's open tube lengthened by its valves */
export const hornTubeLength = (f: HornFingering): number => (f.side === 'F' ? HORN_F_LENGTH : HORN_BB_LENGTH) * Math.pow(2, f.lower / 12);

/** The voicing: the lips, the bore's losses and the radiation's colour. Fitted to the University of Iowa
 *  MIS horn (pp/mf/ff, B♭1–F5) with scripts/fit-horn.ts on the fit half of its notes (even MIDI numbers),
 *  judged on the held-out half (scripts/judge.ts); artifacts/realistic-3d/final-symphony/horn/NOTES.md. */
export interface HornVoice {
  /** the lips: their quality factor (their own resonance's sharpness; measured on players 3–10: Newton,
   *  Campbell & Gilbert 2008, JASA 123, 3592) at the low end of the compass and at the top */
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
  /** the breath's rise (s, a time constant) for a soft note and a loud one */
  riseLo: number;
  riseHi: number;
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
  /** the missing apex x₀, as how many partials above the note the cone's resonances leave their gap
   *  ((L + x₀)/x₀ − n): an effective length, not a measured one (the horn is not a cone: its mouthpiece's
   *  volume and its mouthpipe make its low resonances strong, and above ~700 Hz its bell lets them go). A
   *  long apex (few partials) gives a low note strong resonances and a quick start; a high note, played
   *  near the 12th partial, needs a short one, or its own resonance is the weak one */
  apexGap: number;
  /** the bell's reflection: a second-order low-pass (Hz, Q) and the round trip's loss at audio frequencies
   *  (the mean pressure reflected whole) */
  bellFc: number;
  bellQ: number;
  wall: number;
  /** turbulence in the lips' slit: noise in the flow, ∝ the flow */
  noise: number;
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

/** the start design (unfitted: the literature's numbers and the recordings' broad shape) */
export const HORN_VOICE: HornVoice = {
  lipQ: 45,
  lipQTop: 45,
  lipBelow: 0.5,
  h0: 0.05,
  hMax: 2,
  zeta: 0.4,
  zetaTop: 0.3,
  gammaLo: 0.25,
  gammaHi: 0.7,
  gammaCurve: 1,
  gammaExp: 0.15,
  riseLo: 0.05,
  riseHi: 0.02,
  tongueHold: 0.02,
  tongueRel: 1.5,
  kick: 0.5,
  qAttack: 0.8,
  qTau: 0.05,
  attackBoost: 0.6,
  attackTau: 0.05,
  apexGap: 5,
  bellFc: 1200,
  bellQ: 0.7,
  wall: 0.97,
  noise: 0.03,
  hp: 60,
  f1: 500,
  g1: 6,
  q1: 0.9,
  lp: 900,
  lpQ: 0.7,
  lpExp: 0.3,
  lpDyn: 1.2,
  shelfF: 3000,
  shelfG: -6,
  tilt: 0,
};

/** the shortest tongued note: the breath stays on this long after the tongue's release, at velocity 1 and
 *  127, even when the key is let go sooner (s) */
const MIN_BLOW_PP = 0.25;
const MIN_BLOW = 0.1;
/** the radiation chain's sections (voiced(): high-pass, formant, low-pass, shelf) */
const LP_SECTION = 2;

export class HornCore implements InstrumentCore {
  readonly id = 'horn' as const;
  readonly fs: number;
  params: HornParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = 1;
  sympatheticAllowed = true;
  dry: boolean;
  private V: HornVoice;
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
  private fingering: HornFingering = hornFingering(65);
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
  private note = 65;
  private held: number[] = [];
  private velocity = 80;
  private eq = new BiquadChain();
  private lpNote = 900;
  private lpSet = -1;
  private tiltNote = 1;
  private tiltOut = 1;
  private zetaNote = 0.5;
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
  /** the lips' opening and the blowing pressure, now (for the pictures) */
  private hNow = 0;
  private gammaNow = 0;

  constructor(opts: { sampleRate: number; params?: Partial<HornParams>; dry?: boolean; player?: number }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.params = { breath: 1, lip: 0, noise: 1, vibrato: 0, room: 0.3, volume: 1, ...opts.params };
    this.V = { ...HORN_VOICE, ...this.params.voice };
    this.rng = mulberry32(playerSeed(60, opts.player));
    const pv = playerVibrato(opts.player);
    this.vib0 = this.vibPhase = pv.phase;
    this.vibRate = pv.rate;
    this.tune = playerCents(opts.player) / 100;
    if (this.tune) this.bendFactor = Math.pow(2, -this.tune / 12);
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    this.voiced();
    this.setNote(65, true);
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
    this.gain = 1 * this.params.volume;
  }

  /** measured voicing table (scripts/tune-horn.ts): cents the bare model plays sharp, by sample rate */
  static tuningTable: { fs: number[]; midi: number[]; cents: number[][] } = hornTuning as { fs: number[]; midi: number[]; cents: number[][] };
  private tuningCorrection(m: number): number {
    const t = HornCore.tuningTable;
    if (!t.midi?.length) return 1;
    const rows = t.cents.map((r) => interp(m, t.midi, r));
    const c = t.fs.length > 1 ? interp(this.fs, t.fs, rows) : rows[0];
    return Math.pow(2, c / 1200);
  }

  private setNote(m: number, immediate: boolean): void {
    const fs = this.fs;
    const V = this.V;
    const f = et(m);
    const fg = hornFingering(m);
    this.fingering = fg;
    // the tube's round trip and the apex's are one period of the tube's fundamental (the note over its
    // partial), less each end's reflection's phase delay at the note (so that its n-th resonance is the
    // note) and the interpolation
    const c = this.tuningCorrection(m);
    const w0 = (2 * Math.PI * f) / fs;
    const lag = biquadPhaseDelay(this.bc, w0);
    const T = ((fg.partial * fs) / f) * c;
    this.D2 = Math.max(1, T / (fg.partial + V.apexGap));
    this.Dtarget = Math.max(2, T - this.D2 - 2 * lag - 1);
    if (immediate) this.D = this.Dtarget;
    this.lipFTarget = f / c;
    if (immediate) this.lipF = this.lipFTarget * Math.pow(2, -V.lipBelow / 12);
    const u = clamp((m - HORN_LO) / (HORN_HI - HORN_LO), 0, 1);
    this.zetaNote = V.zeta + (V.zetaTop - V.zeta) * u;
    this.qNote = V.lipQ + (V.lipQTop - V.lipQ) * u;
    this.gNote = Math.pow(f / et(HORN_LO), V.gammaExp);
    this.lpNote = V.lp * Math.pow(f / 440, V.lpExp);
    this.lpSet = -1;
    this.tiltNote = Math.pow(f / et(HORN_LO), V.tilt / 6.0206);
    if (immediate) this.tiltOut = this.tiltNote;
    this.note = m;
    const fb = f / fg.partial;
    for (let k = 0; k < 16; k++) this.modeFreqs[k] = (k + 1) * fb;
  }

  schedule(ev: unknown, frame?: number): void {
    const f = frame === undefined ? this.frame : Math.max(this.frame, Math.floor(frame));
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].frame > f) i--;
    q.splice(i, 0, { frame: f, ev: ev as PianoEvent });
  }

  private apply(ev: PianoEvent | { type: 'control'; cc: number; value: number }): void {
    switch (ev.type) {
      case 'noteOn': {
        if (ev.velocity <= 0) return this.apply({ type: 'noteOff', midi: ev.midi });
        const m = clamp(ev.midi, HORN_LO, HORN_HI);
        const legato = this.pTarget > 0 && this.held.length > 0;
        this.held = this.held.filter((x) => x !== m);
        this.held.push(m);
        this.velocity = ev.velocity;
        this.setNote(m, !legato && this.level < 1e-3);
        this.pTarget = 1;
        this.attackTau = legato ? 0.01 : this.V.riseLo + (this.V.riseHi - this.V.riseLo) * (ev.velocity / 127);
        if (!legato) {
          // tongued: the lips held while the breath builds, then let go
          this.tongueN = Math.round(this.V.tongueHold * this.fs);
          this.tongueLen = Math.max(1, Math.round((this.V.tongueRel * this.fs) / et(m)));
          this.tongueI = 0;
          this.kickPending = true;
          this.vibPhase = this.vib0;
          this.noteStart = this.frame;
          this.blowUntil = this.frame + Math.round((MIN_BLOW_PP + (MIN_BLOW - MIN_BLOW_PP) * (ev.velocity / 127)) * this.fs);
        }
        this.releasePending = false;
        break;
      }
      case 'noteOff': {
        this.held = this.held.filter((x) => x !== ev.midi);
        if (this.held.length && ev.midi === this.note) this.setNote(this.held[this.held.length - 1], false);
        else if (!this.held.length && this.sustain < 0.5) this.release();
        break;
      }
      case 'sustain':
        this.sustain = clamp(ev.value, 0, 1);
        if (this.sustain < 0.5 && !this.held.length) this.release();
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
        this.held = [];
        this.pTarget = 0;
        this.releasePending = false;
        break;
      default:
        break;
    }
  }

  /** The key is up: stop blowing, but not before the tongued note has had its minimum breath. */
  private release(): void {
    if (this.pTarget > 0 && this.frame < this.blowUntil) this.releasePending = true;
    else this.pTarget = 0;
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<HornParams>) };
    if (this.params.voice !== old.voice) {
      this.V = { ...HORN_VOICE, ...this.params.voice };
      this.voiced();
      this.setNote(this.note, false);
    } else if (this.params.room !== old.room || this.params.volume !== old.volume) this.voiced();
    else if (this.params.seat !== old.seat) this.room.configure(this.params.room, this.params.seat);
  }

  /** the one note actually sounding (a monophonic instrument: the last held key wins and a release
   *  returns to the previous held one), or none */
  sounding(): number[] {
    return this.pTarget > 0 ? [this.note] : [];
  }

  allSoundOff(): void {
    this.dyn = this.dynTarget = 0;
    this.pressure = this.pTarget = 0;
    this.releasePending = false;
    this.held = [];
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
      let n = 64;
      if (q.length) n = Math.max(1, Math.min(n, q[0].frame - this.frame));
      if (this.releasePending) {
        // a key let go inside the minimum blow: the breath stops when that is over (the block is
        // cut there, as at an event)
        if (this.frame >= this.blowUntil) {
          this.releasePending = false;
          if (!this.held.length && this.sustain < 0.5) this.pTarget = 0;
        } else n = Math.min(n, this.blowUntil - this.frame);
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
    const v01 = this.dyn ? clamp(this.velocity + this.dyn, 1, 127) / 127 : this.velocity / 127;
    const vc = Math.pow(v01, V.gammaCurve);
    const gamma = (V.gammaLo + (V.gammaHi - V.gammaLo) * vc) * this.gNote * this.pressure * P.breath * this.expression;
    this.gammaNow = gamma;
    // the lips follow the note (the player's tension offset, the vibrato), a little below it; a slur glides
    // (time constants, not per-block fractions: nothing may depend on the block's length)
    const lipTarget = (this.lipFTarget * Math.pow(2, (P.lip - V.lipBelow) / 12) * vib) / this.bendFactor;
    this.lipF += (lipTarget - this.lipF) * (1 - Math.exp(-dt / 0.006));
    const th = (2 * Math.PI * Math.min(this.lipF, 0.2 * fs)) / fs;
    const q = this.qNote * (1 - V.qAttack * Math.exp(-age / V.qTau));
    const r = Math.exp((-Math.PI * this.lipF) / (Math.max(0.5, q) * fs));
    const la1 = 2 * r * Math.cos(th);
    const la2 = r * r;
    // (unit gain at rest: the lips' static opening grows by one per unit of Δp)
    const lb = 1 - la1 + la2;
    const boost = 1 + V.attackBoost * Math.exp(-age / V.attackTau);
    const zeta = this.zetaNote * boost;
    const h0 = V.h0;
    const hMax = V.hMax;
    const nz = V.noise * P.noise;
    // the radiation's corner for the note and the dynamic, written into its section in place
    const lpF = Math.min(0.45 * fs, this.lpNote * Math.pow(2, V.lpDyn * (vc - 1)));
    if (Math.abs(lpF - this.lpSet) > 0.5) {
      lowpassInto(this.eq.c, 5 * LP_SECTION, lpF, V.lpQ, fs);
      this.lpSet = lpF;
    }
    this.tiltOut += (this.tiltNote - this.tiltOut) * (1 - Math.exp(-dt / 0.03));
    const DT = this.Dtarget * this.bendFactor;
    const ease = 1 - Math.exp(-1 / (0.004 * fs));
    const bc = this.bc;
    const g = V.wall;
    const kM = this.kMean;
    const bore = this.bore;
    const apexB = this.apexB;
    const D2 = this.D2;
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
        const kv = V.kick * (0.5 + 0.5 * v01);
        y1 += kv;
        y2 += kv * Math.cos(th);
      }
      if (this.tongueN === 0 && this.tongueI < this.tongueLen) {
        tg = 0.5 - 0.5 * Math.cos((Math.PI * this.tongueI) / this.tongueLen);
        this.tongueI++;
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
      bore[w & mask] = p - a1;
      apexB[w & mask] = p - a2;
      // radiated: what the bell lets through (the complement of its reflection)
      rad = e - rb;
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
    for (let m = HORN_LO; m <= HORN_HI; m++) {
      const fg = hornFingering(m);
      out.push({ midi: m, f1: et(m), B: 0, nStrings: 1, lengthM: hornTubeLength(fg), hasDamper: false, preparation: `${fg.side === 'Bb' ? 'B♭ side' : 'F side'}, valves ${fg.valves}, partial ${fg.partial}` });
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
      meta: `${fg.side === 'Bb' ? 'B♭' : 'F'} · valves ${fg.valves} · partial ${fg.partial}`,
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
        lengthM: hornTubeLength(fg),
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

/** the speed of sound the tube lengths assume (m/s) */
export const HORN_C = C_AIR;

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
