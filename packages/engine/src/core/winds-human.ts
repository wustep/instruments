// A player on a woodwind (the flute, the oboe, the clarinet, the bassoon): what no two notes of a player's are
// alike in, and what a held note does, put in the engine as the trombone's, the tuba's, the harp's and the
// glockenspiel's players are (`human`: 1 by default, 0 the model alone, which is what is fitted and judged and
// is bit-identical to the engine without a player). A seeded stream, the instrument's and the player's own:
// the same notes give the same samples, whatever the host's block.
//
// Measured on the University of Iowa MIS players (analysis only), against the model alone, read the same way:
//   scripts/winds-variation.ts      a held note's level, brightness and pitch, how far they wander
//   scripts/trombone-variation.ts --instrument <i>   from one note to the next: pitch, strength, attack
//   scripts/winds-vibrato.ts        the vibrato: its depth in pitch and in level (the fundamental and the
//                                   harmonics above it apart), its rate, how far one cycle differs from the next
//   .fit release measure (NOTES)    how long a note takes to die away when it is let go
// What the model alone did, and the players do (medians):
//   * its flute's vibrato was not heard: 0.4 ¢ and 0.08 dB, where the Iowa flautist's is 12 ¢ and 1.8 dB (the
//     fundamental 1.1 dB, the harmonics above it 3.5), at 4.9 Hz. The model's tone hardly follows its breath
//     (10 % more breath: −0.7 … +0.1 dB), so the breath's swing a flute's vibrato is made of did not reach the
//     sound. And it was a generator: 98 % one sine, each cycle as long as the last (1 %); the player's 67 %,
//     11 % from one cycle to the next in length and 22 % in swing, ±0.23 Hz from note to note.
//   * a held note's pitch wandered 0.1–0.3 ¢ (the players 0.6–3.5); from one note to the next its pitch was
//     the same within 0.1–1.3 ¢ (the players' ±3–10 ¢), its attack's length within 14–46 % (theirs 50–150 %).
//   * a note let go died 2–4 times as fast as a player's: 10 dB down in 30 ms where the flautist takes 68,
//     the oboist 98 against 36, the clarinettist 40 against 14, the bassoonist about 150 against 44.
// What the player does is put where it is heard and nowhere it could change what the model sounds: the tube's
// length (a few cents: the lips, the embouchure), the level and colour of what leaves the instrument (the
// breath; the harmonics above the fundamental move further than the fundamental, as the recordings' do), the
// attack's timing, the breath's release. The reed and the jet oscillate as the model has them: a double reed's
// low notes have two regimes (the octave as stable as the note), and a breath driven harder or softer inside
// the model reshuffles which notes land on which (the oboe's E5 begun with 8 velocity steps more breath
// than it was tongued with sounded its octave, 7 dB down).
import { clamp, Human } from './util.ts';
import { quickness } from './mono.ts';

/** a woodwind's vibrato as the player makes it: what it adds to the model's breath vibrato (which the model's
 *  tone hardly shows) at the instrument's default vibrato (scaled with the `vibrato` parameter: 0, none) */
export interface WindVibrato {
  /** its rate (Hz; the player's own rate factor on it, util.ts playerVibrato), and from one breath to the next
   *  (Hz, a standard deviation) */
  rate: number;
  breathRate: number;
  /** its depth in pitch (cents, an amplitude) and in level (dB): the fundamental's and the harmonics' above it,
   *  at pp, mf and ff (velocities 30, 70, 112) */
  cents: [number, number, number];
  fundDb: [number, number, number];
  upperDb: [number, number, number];
  /** the model's own breath vibrato (the `vibrato` share of the breath), at pp, mf and ff, × this: on a reed it
   *  is what reaches the level (about 0.25 dB at any dynamic), and a player's vibrato shrinks as they play
   *  louder */
  breath: [number, number, number];
  /** how far its rate and its swing move about their own (shares, standard deviations; a walk over about a
   *  cycle): no cycle like the last */
  rateWander: number;
  depthWander: number;
}

export interface WindHuman {
  seed: number;
  /** the pitch (cents, standard deviations): its wander from one fifth of a second to the next, its slow
   *  wander (over slowTau s), and where a note is put (by ear, the same again while its pitch is struck again) */
  wander: number;
  slow: number;
  slowTau: number;
  place: number;
  /** the breath's level (dB, standard deviations): its wander over a held note (quick, and slow over
   *  breathTau s), the more the softer (at mf as given, about twice that pp and half ff: the Iowa players' held
   *  notes wander 3–14 times as far pp as ff), and a tongued note's own strength */
  breath: number;
  breathSlow: number;
  breathTau: number;
  strength: number;
  /** a level change of the breath moves the harmonics above the fundamental this many times as far */
  bright: number;
  /** from one tongued note to the next (shares, standard deviations): the breath's rise, and the tongue's
   *  push (the jet's push and its sharper aim; a reed's wider opening as the tongue lets go). A note known to
   *  be short gets less of it (mono.ts quickness): a run's notes are a run's */
  rise: number;
  push: number;
  /** the breath let go: its time constant is this many times the model's for a note held `taperFull` s or
   *  more (from none at `taperFrom` s): a long note dies away, a short one stops. Only where a player lets a
   *  note die away: a file's note before a rest (none if the next note begins within TAPER_GAP[0] s of the
   *  release, all of it from TAPER_GAP[1] s) or at the part's end; a key in the hand (nothing told) is let
   *  go as the model lets it (a note 50 ms after it must still be heard as detached) */
  release: number;
  taperFrom: number;
  taperFull: number;
  vibrato: WindVibrato | null;
}

/** the quality of the band-pass that takes the fundamental out of what leaves the instrument: at the note it
 *  passes the fundamental whole and in phase, the second harmonic at 0.3 of it, the third at 0.18 */
const SPLIT_Q = 2;
/** a tongued note's own strength comes in over this long (s): the breath's support, as the trombone's */
const STRENGTH_TAU = 0.03;
/** a file's note let go before a rest this long (s) or shorter keeps the model's release; from the second, the
 *  player's taper whole */
const TAPER_GAP = [0.15, 0.4];
/** the vibrato's rate wanders over this long (s): less than a cycle, so that each cycle is its own length while
 *  the rate over a note stays (the Iowa flautist: 11 % from one cycle's length to the next, and 67 % of the
 *  pitch's movement one sine; a walk over a cycle and more drifts the rate itself: 12 % and 53 %) */
const RATE_TAU = 0.03;
/** a value given at pp, mf and ff (velocities 30, 70, 112), at the dynamic v01 */
const atDyn = (t: readonly [number, number, number], v01: number): number =>
  v01 < 70 / 127 ? t[0] + (t[1] - t[0]) * clamp((v01 - 30 / 127) / (40 / 127), 0, 1) : t[1] + (t[2] - t[1]) * clamp((v01 - 70 / 127) / (42 / 127), 0, 1);

export class WindPlayer {
  /** how much of a player (0: none; the core sets it every block from its `human` parameter) */
  H = 0;
  /** this note's attack (factors on the model's): the breath's rise, the tongue's push */
  rise = 1;
  push = 1;
  /** the pitch now, cents (the core's tube that much shorter); the vibrato's shape now (about −1 … 1, for
   *  the breath it modulates as the model does) and how deep in the breath (× the model's) */
  cents = 0;
  shape = 0;
  breathVib = 1;
  private hum: Human;
  private fs: number;
  private placeC = 0;
  private placeOf = -1;
  private strengthDb = 0;
  /** the strength as the breath has it now: a new note's comes in over STRENGTH_TAU (taken at once, a note
   *  joined to a sounding one stepped the level by up to a dB in a block: a click's splatter, 3–7 dB more in
   *  the bands under a passage's notes) */
  private strengthNow = 0;
  private fast = 0;
  private fastS = 0;
  private slowW = 0;
  private bFast = 0;
  private bFastS = 0;
  private bSlow = 0;
  private vPhase = 0;
  private vRate = 0;
  private vRateW = 0;
  private vDepthW = 0;
  private vRateS = 0;
  private vDepthS = 0;
  private breathHz = 0;
  /** when the note now sounding began (frame), and how long it had sounded when it was let go (s; −1: it has
   *  not been), for the release */
  private noteAt = 0;
  private heldFor = -1;
  /** the note now sounding was told of ahead (a file's), and its release's factor once it is let go */
  private told = false;
  private relF = 1;
  /** the output's two gains (the fundamental's part, the rest), as the last block ended and as this one
   *  ends; the split's filter (a band-pass at the note) and each channel's state */
  private gF0 = 1;
  private gU0 = 1;
  private gF = 1;
  private gU = 1;
  private bp = new Float64Array(5);
  private bpF = -1;
  private sL = new Float64Array(4);
  private sR = new Float64Array(4);

  constructor(
    readonly spec: WindHuman,
    fs: number,
    player = 0,
    /** the model's vibrato rate (Hz) and the player's factor on it */
    private vibBase = 5,
    private vibFactor = 1,
  ) {
    this.fs = fs;
    this.hum = new Human(spec.seed, player);
    this.vPhase = player * 2.399963;
  }

  /** A note begun at `frame`: tongued from silence (`breath`: a new breath), tongued over the breath, or
   *  slurred; of pitch `midi`, lasting `len` s (Infinity: not known). Its own strength (tongued), where it is
   *  put (a new pitch), its attack. The stream runs on the same whatever the note's length. */
  note(frame: number, midi: number, len: number, tongued: boolean, breath: boolean): void {
    this.noteAt = frame;
    this.heldFor = -1;
    this.told = len < Infinity;
    const H = this.H;
    if (!(H > 0)) {
      this.rise = this.push = 1;
      return;
    }
    const s = this.spec;
    const h = this.hum;
    const a = h.near();
    const b = h.near();
    const c = h.near();
    const d = h.near();
    if (tongued) this.strengthDb = H * s.strength * a;
    if (midi !== this.placeOf) {
      this.placeC = H * s.place * b;
      this.placeOf = midi;
    }
    // (a note known to be short: less of the attack's variation, not none: a run's notes are not stamped)
    const Hq = tongued ? H * (1 - 0.6 * quickness(len)) : 0;
    this.rise = Math.max(0.5, 1 + Hq * s.rise * c);
    this.push = Math.max(0.4, 1 + Hq * s.push * d);
    if (breath && s.vibrato) this.breathHz = H * s.vibrato.breathRate * h.near();
  }

  /** The block's control step, `dt` s: the walks, the vibrato, the pitch and the output's gains to reach by
   *  the block's end. `v01` the dynamic (velocity / 127), `vibEnv` the vibrato's entry over the breath (0 … 1),
   *  `vibScale` the `vibrato` parameter over the instrument's default. */
  step(dt: number, v01: number, vibEnv: number, vibScale: number): void {
    const H = this.H;
    const s = this.spec;
    const h = this.hum;
    // (walks drawn back to rest, then smoothed: time constants, whatever the block)
    const a = Math.exp(-dt / 0.2);
    const g = Math.sqrt(1 - a * a) * 1.25;
    this.fast = a * this.fast + g * h.near();
    this.bFast = a * this.bFast + g * h.near();
    const as = Math.exp(-dt / s.slowTau);
    this.slowW = as * this.slowW + Math.sqrt(1 - as * as) * h.near();
    const ab = Math.exp(-dt / s.breathTau);
    this.bSlow = ab * this.bSlow + Math.sqrt(1 - ab * ab) * h.near();
    const ks = 1 - Math.exp(-dt / 0.05);
    this.fastS += (this.fast - this.fastS) * ks;
    this.bFastS += (this.bFast - this.bFastS) * ks;
    let cents = H * (this.placeC + s.wander * this.fastS + s.slow * this.slowW);
    const soft = 0.4 + 3 * (1 - clamp(v01, 0, 1)) ** 2;
    this.strengthNow += (this.strengthDb - this.strengthNow) * (1 - Math.exp(-dt / STRENGTH_TAU));
    let dB = this.strengthNow + H * soft * (s.breath * this.bFastS + s.breathSlow * this.bSlow);
    let dBu = s.bright * dB;
    const V = s.vibrato;
    if (V) {
      // the rate a walk over less than a cycle (each cycle its own length, the rate over a note steady), the
      // swing over about a cycle
      const ar = Math.exp(-dt / RATE_TAU);
      this.vRateW = ar * this.vRateW + Math.sqrt(1 - ar * ar) * h.near();
      const av = Math.exp(-dt / 0.15);
      this.vDepthW = av * this.vDepthW + Math.sqrt(1 - av * av) * h.near();
      const kv = 1 - Math.exp(-dt / 0.04);
      this.vRateS += (this.vRateW - this.vRateS) * kv;
      this.vDepthS += (this.vDepthW - this.vDepthS) * kv;
      const base = this.vibBase + H * (V.rate - this.vibBase);
      this.vRate = (base * this.vibFactor + this.breathHz) * (1 + H * V.rateWander * this.vRateS);
      this.vPhase += 2 * Math.PI * this.vRate * dt;
      if (this.vPhase > 2 * Math.PI) this.vPhase -= 2 * Math.PI;
      this.shape = Math.sin(this.vPhase) * Math.max(0, 1 + H * V.depthWander * this.vDepthS);
      const w = H * vibEnv * vibScale * this.shape;
      this.breathVib = 1 + H * (atDyn(V.breath, v01) - 1);
      cents += w * atDyn(V.cents, v01);
      dB += w * atDyn(V.fundDb, v01);
      dBu += w * atDyn(V.upperDb, v01);
    } else {
      this.shape = 0;
      this.breathVib = 1;
    }
    this.cents = cents;
    this.gF0 = this.gF;
    this.gU0 = this.gU;
    this.gF = Math.pow(10, dB / 20);
    this.gU = Math.pow(10, dBu / 20);
  }

  /** the tube's length for the pitch now (a factor on a delay: shorter, sharper) */
  get delayFactor(): number {
    return Math.pow(2, -this.cents / 1200);
  }

  /** What leaves the instrument, `n` samples of each channel at the note `f0` (Hz): the whole at the
   *  harmonics' gain, and its fundamental (a band-pass at the note: whole and in phase there) by the difference
   *  to its own, each ramped from the last block's. */
  out(L: Float64Array, R: Float64Array, n: number, f0: number): void {
    const fs = this.fs;
    const fc = Math.min(0.4 * fs, f0);
    if (Math.abs(fc - this.bpF) > 0.5) {
      // (a new note's, written in place; its state carries on)
      const w = (2 * Math.PI * fc) / fs;
      const al = Math.sin(w) / (2 * SPLIT_Q);
      const cw = Math.cos(w);
      const a0 = 1 + al;
      const c = this.bp;
      c[0] = al / a0;
      c[1] = 0;
      c[2] = -al / a0;
      c[3] = (-2 * cw) / a0;
      c[4] = (1 - al) / a0;
      this.bpF = fc;
    }
    const c = this.bp;
    const dF = (this.gF - this.gF0) / n;
    const dU = (this.gU - this.gU0) / n;
    for (let ch = 0; ch < 2; ch++) {
      const x = ch ? R : L;
      const st = ch ? this.sR : this.sL;
      let x1 = st[0];
      let x2 = st[1];
      let y1 = st[2];
      let y2 = st[3];
      for (let t = 0; t < n; t++) {
        const v = x[t];
        const fu = c[0] * v + c[2] * x2 - c[3] * y1 - c[4] * y2;
        x2 = x1;
        x1 = v;
        y2 = y1;
        y1 = fu;
        const gF = this.gF0 + dF * (t + 1);
        const gU = this.gU0 + dU * (t + 1);
        x[t] = v * gU + fu * (gF - gU);
      }
      st[0] = x1;
      st[1] = x2;
      st[2] = y1;
      st[3] = y2;
    }
  }

  /** the breath's time constant as it is let go, for the model's `tc` (s). Set at its first call since the note
   *  began (`frame`, the release): by how long the note had sounded, and what comes after it (`keys`: the
   *  notes told ahead) */
  releaseTau(tc: number, frame: number, keys: { nextAfter(frame: number): number }): number {
    if (this.heldFor < 0) {
      const s = this.spec;
      this.heldFor = (frame - this.noteAt) / this.fs;
      const next = this.told ? keys.nextAfter(frame) : -1;
      const gap = !this.told ? 0 : next < 0 ? 1 : clamp(((next - frame) / this.fs - TAPER_GAP[0]) / (TAPER_GAP[1] - TAPER_GAP[0]), 0, 1);
      this.relF = 1 + this.H * (s.release - 1) * gap * clamp((this.heldFor - s.taperFrom) / (s.taperFull - s.taperFrom), 0, 1);
    }
    return tc * this.relF;
  }

  /** silence at once (a panic): the filter's state, the gains back to the model's */
  reset(): void {
    this.sL.fill(0);
    this.sR.fill(0);
    this.gF = this.gF0 = this.gU = this.gU0 = 1;
  }
}
