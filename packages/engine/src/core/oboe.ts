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
// then the radiation's colour: the oboe's formant near 1.1 kHz and its second near 2.8 kHz are fixed in
// frequency whatever the note (Meyer 2009, "Acoustics and the Performance of Music", the oboe's
// formants), as the open-hole lattice and the bell radiate them, fitted to the recordings.

import { Pump } from './pump.ts';
import { CC_DYNAMICS, DYN_TAU, type ExciteTrace, type InstrumentCore } from './instrument.ts';
import type { KeySummary } from '../api/messages.ts';
import type { PianoEvent } from './piano-core.ts';
import { biquadHighpass, biquadHighShelf, biquadLowpass, biquadPeaking } from './filters.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { clamp, interp, mulberry32, playerCents, playerSeed, playerVibrato } from './util.ts';
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
  /** fitting only (scripts/fit-oboe.ts): the voicing below, overridden */
  voice?: Partial<OboeVoice>;
}

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
  /** blowing pressure γ = pm / pM at velocity 1 and 127, and the curve between */
  gammaLo: number;
  gammaHi: number;
  gammaCurve: number;
  /** the missing apex x₀ (m): the staple's cone carried on to its point */
  apex: number;
  /** both ends' reflection: a low-pass (Hz; radiation and wall losses), and the round trip's gain */
  cutoff: number;
  wall: number;
  /** turbulence in the reed's channel: noise in the flow, ∝ the flow */
  noise: number;
  /** the radiation's colour: below `hp` it falls (Hz); the formant (Hz, dB, Q) and the second; above
   *  `lp` a second-order fall (Hz, Q); a shelf above `shelfF` (dB) */
  hp: number;
  f1: number;
  g1: number;
  q1: number;
  f2: number;
  g2: number;
  q2: number;
  lp: number;
  lpQ: number;
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
  zeta: 0.6,
  zetaTop: 0.6,
  gammaLo: 0.45,
  gammaHi: 0.8,
  gammaCurve: 1,
  apex: 0.035,
  cutoff: 9000,
  wall: 0.995,
  noise: 0.004,
  hp: 300,
  f1: 1150,
  g1: 0,
  q1: 1,
  f2: 2800,
  g2: 0,
  q2: 1.5,
  lp: 4000,
  lpQ: 0.7,
  shelfF: 6000,
  shelfG: 0,
  attackBoost: 0,
  attackTau: 0.05,
  tongueHold: 0.03,
  tongueRel: 1,
};

/** the shortest tongued note: the breath stays on this long after the tongue's release (s), as on the
 *  flute and trumpet (a 50 ms tap must still speak) */
const MIN_BLOW = 0.1;

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
  private held: number[] = [];
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
  /** ζ for the note (OboeVoice zeta … zetaTop) */
  private zetaNote = 1;
  /** the reed's opening now (0 shut, 1 at rest), and the blowing pressure, for the stage */
  private xNow = 1;
  private gammaNow = 0;

  constructor(opts: { sampleRate: number; params?: Partial<OboeParams>; dry?: boolean; player?: number }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.params = { breath: 1, embouchure: 1, noise: 1, vibrato: 0.035, room: 0.3, volume: 1, ...opts.params };
    this.V = { ...OBOE_VOICE, ...this.params.voice };
    this.rng = mulberry32(playerSeed(68, opts.player));
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
    this.eq.set([
      biquadHighpass(V.hp, 0.7, fs),
      biquadPeaking(V.f1, V.q1, V.g1, fs),
      biquadPeaking(V.f2, V.q2, V.g2, fs),
      biquadLowpass(Math.min(0.45 * fs, V.lp), V.lpQ, fs),
      biquadHighShelf(Math.min(0.4 * fs, V.shelfF), V.shelfG, fs),
    ]);
    this.room.configure(this.params.room, this.params.seat);
    this.gain = 0.05 * this.params.volume;
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
    this.note = m;
    for (let k = 0; k < 16; k++) this.modeFreqs[k] = (k + 1) * f;
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
        const m = clamp(ev.midi, OBOE_LO, OBOE_HI);
        const legato = this.pTarget > 0 && this.held.length > 0;
        this.held = this.held.filter((x) => x !== m);
        this.held.push(m);
        this.velocity = ev.velocity;
        this.setNote(m, !legato && this.level < 1e-3);
        this.pTarget = 1;
        this.attackTau = legato ? 0.01 : 0.035 - 0.025 * (ev.velocity / 127);
        if (!legato) {
          // tongued: the blades held shut while the breath builds, then let go
          this.tongueN = Math.round(this.V.tongueHold * this.fs);
          this.tongueLen = Math.max(1, Math.round((this.V.tongueRel * this.fs) / et(m)));
          this.tongueI = 0;
          this.vibPhase = this.vib0;
          this.noteStart = this.frame;
          this.blowUntil = this.frame + Math.round(MIN_BLOW * this.fs);
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
        // mod wheel, breath controller and expression blow (below 0, CC_REST: back to the note's breath)
        if (ev.cc === 1 || ev.cc === 2 || ev.cc === 11) this.expression = ev.value < 0 ? 1 : 0.55 + 0.6 * clamp(ev.value, 0, 1);
        else if (ev.cc === CC_DYNAMICS) this.dynTarget = clamp(ev.value, -64, 64);
        break;
      case 'bend':
        // the player lips the pitch (the reed's opening and the bore's effective length)
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
    return this.pTarget > 0 ? [this.note] : [];
  }

  allSoundOff(): void {
    this.dyn = this.dynTarget = 0;
    this.clear();
    this.pressure = this.pTarget = 0;
    this.releasePending = false;
    this.held = [];
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  private clear(): void {
    this.longB.fill(0);
    this.apexB.fill(0);
    this.rx1 = this.rx2 = this.ry1 = this.ry2 = this.sx1 = this.sx2 = this.sy1 = this.sy2 = 0;
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
    const gNote = V.gammaLo + (V.gammaHi - V.gammaLo) * Math.pow(v01, V.gammaCurve);
    const gamma = gNote * this.pressure * vib * P.breath * this.expression;
    this.gammaNow = gamma;
    // the tongue's release: a transient wider opening (the lips not yet settled), decaying
    const zeta = this.zetaNote * P.embouchure * (1 + V.attackBoost * Math.exp(-age / V.attackTau));
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
    const g = V.wall;
    const longB = this.longB;
    const apexB = this.apexB;
    const mask = BUF - 1;
    const oL = this.oL;
    const oR = this.oR;
    let peak = 0;
    let s = this.sPrev;
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
      const a1 = -g * y1;
      const e2 = apexB[(w - d2i) & mask] * (1 - d2f) + apexB[(w - d2i - 1) & mask] * d2f;
      const y2 = rc[0] * e2 + rc[1] * this.sx1 + rc[2] * this.sx2 - rc[3] * this.sy1 - rc[4] * this.sy2;
      this.sx2 = this.sx1;
      this.sx1 = e2;
      this.sy2 = this.sy1;
      this.sy1 = y2;
      const a2 = -g * y2;
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
      if (nz) u += nz * u * (this.rng() * 2 - 1);
      const p = a1 + a2 + 0.5 * u;
      longB[w & mask] = p - a1;
      apexB[w & mask] = p - a2;
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

/** phase delay (samples) of a biquad [b0,b1,b2,a1,a2] at ω (rad/sample) */
function biquadPhaseDelay(c: ArrayLike<number>, w: number): number {
  const ph = (b0: number, b1: number, b2: number) => Math.atan2(-(b1 * Math.sin(w) + b2 * Math.sin(2 * w)), b0 + b1 * Math.cos(w) + b2 * Math.cos(2 * w));
  const phi = ph(c[0], c[1], c[2]) - ph(1, c[3], c[4]);
  return -phi / w;
}
