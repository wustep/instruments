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
// above C5 are fingered as overblown 2nd (octave) and 3rd (twelfth) modes.
// Turbulence noise scales with jet speed.

import { Pump } from './pump.ts';
import { type ExciteTrace, type InstrumentCore } from './instrument.ts';
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
  /** pitch bend as a factor on the bore delay */
  private bendFactor = 1;
  /** the player's intonation, semitones (util.ts playerCents), under any bend */
  private tune = 0;
  private note = -1;
  private held: number[] = [];
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
    this.mode = mode;
    this.fTarget = et(m);
    this.boreNominal = (mode * fs) / et(m);
    // jet receptivity falls off above a Strouhal-limited frequency (the player's lip
    // distance tracks the note): one-pole low-pass at ~2.2x the sounding pitch
    this.jetLpA = Math.exp((-2 * Math.PI * V.jetLp * et(m)) / fs);
    const tauNom = (fs * this.lj) / (0.45 * UjNom);
    this.Dnom = this.boreDelayFor(tauNom) * this.tuningCorrection(m);
    this.Dtarget = this.Dnom;
    if (immediate) {
      this.D = this.Dtarget;
      this.jetD = this.jetDTarget = tauNom;
    }
    this.note = m;
    for (let k = 0; k < 16; k++) this.modeFreqs[k] = (k + 1) * fb;
  }
  private fTarget = 440;
  private off = 0.8;
  private tanhOff = Math.tanh(0.8);
  private jetK = 1;
  private jetGainNote = 0.2;
  private qPrev = 0;
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
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].frame > f) i--;
    q.splice(i, 0, { frame: f, ev: ev as PianoEvent });
  }

  private apply(ev: PianoEvent | { type: 'control'; cc: number; value: number }): void {
    switch (ev.type) {
      case 'noteOn': {
        if (ev.velocity <= 0) return this.apply({ type: 'noteOff', midi: ev.midi });
        const m = clamp(ev.midi, 60, 96);
        const legato = this.pTarget > 0 && this.held.length > 0;
        this.held = this.held.filter((x) => x !== m);
        this.held.push(m);
        this.velocity = ev.velocity;
        this.setNote(m, !legato && this.level < 1e-3);
        this.pTarget = 1;
        this.attackTau = legato ? 0.015 : 0.06 - 0.035 * (ev.velocity / 127);
        this.chiff = legato ? 0.3 : 0.6 + 0.8 * (ev.velocity / 127);
        // tonguing: when the tongue lets the breath go, the jet's front sweeps across the
        // edge once, a coherent push that seeds the tube's resonance (without it the
        // oscillation grew from turbulence alone and spoke ~4x slower than a real flute)
        this.tongueAmp = TONGUE_PUSH * (legato ? 0.3 : 0.5 + 0.5 * (ev.velocity / 127));
        this.tongueLen = Math.max(4, Math.round((0.5 * this.fs) / et(m)));
        this.tongueN = this.tongueLen;
        this.attackBoost = legato ? 0 : ATTACK_BOOST * (0.6 + 0.4 * (ev.velocity / 127));
        if (!legato) this.vibPhase = this.vib0;
        this.noteStart = this.frame;
        this.releasePending = false;
        if (!legato) this.blowUntil = this.frame + Math.round(MIN_BLOW * this.fs);
        break;
      }
      case 'noteOff': {
        this.held = this.held.filter((x) => x !== ev.midi);
        if (this.held.length && ev.midi === this.note) {
          this.setNote(this.held[this.held.length - 1], false);
        } else if (!this.held.length && this.sustain < 0.5) {
          this.release();
        }
        break;
      }
      case 'sustain':
        this.sustain = clamp(ev.value, 0, 1);
        if (this.sustain < 0.5 && !this.held.length) this.release();
        break;
      case 'control':
        // mod wheel, breath controller and expression all blow: breath pressure
        if (ev.cc === 1 || ev.cc === 2 || ev.cc === 11) this.expression = 0.4 + 0.8 * clamp(ev.value, 0, 1);
        break;
      case 'bend':
        // the player rolls the flute in/out and lips the pitch: the tube's effective length
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
    return this.pTarget > 0 ? [this.note] : [];
  }

  allSoundOff(): void {
    this.bore.fill(0);
    this.jet.fill(0);
    this.pressure = this.pTarget = 0;
    this.releasePending = false;
    this.held = [];
    this.lp = this.dcX = this.dcY = 0;
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
    // breath envelope and vibrato (control rate)
    const sinceOn = (this.frame - this.noteStart) / fs;
    const k = 1 - Math.exp(-dt / (this.pTarget > this.pressure ? this.attackTau : 0.035));
    this.pressure += (this.pTarget - this.pressure) * k;
    if (this.pressure < 1e-5 && this.pTarget === 0) this.pressure = 0;
    const age = (this.frame - this.noteStart) / fs;
    this.vibPhase += 2 * Math.PI * 5.0 * this.vibRate * dt;
    const vib = 1 + P.vibrato * clamp((age - 0.3) / 0.4, 0, 1) * Math.sin(this.vibPhase);
    this.vibNow = vib - 1;
    // velocity: mostly loudness (jet flow amplitude), a little blowing pressure
    const V = FLUTE_VOICE;
    const v01 = this.velocity / 127;
    const velScale = V.driveLo + (V.driveHi - V.driveLo) * Math.pow(v01, V.driveCurve);
    const pBlow = this.nominalPressure(this.note) * this.pressure * vib * P.breath * (V.pressLo + (V.pressHi - V.pressLo) * v01) * this.expression;
    const Uj = Math.sqrt((2 * Math.max(pBlow, 1)) / RHO);
    this.Uj = Uj;
    const ljEff = this.lj * P.embouchure;
    this.jetDTarget = clamp((fs * ljEff) / (0.45 * Math.max(Uj, 4)), 2, BUF / 2);
    // players "lip" the pitch back as they blow harder; compensate 75 % of the drift
    this.Dtarget = (this.Dnom + 0.75 * (this.boreDelayFor(this.jetDTarget) * this.tuningCorrection(this.note) - this.Dnom)) * this.bendFactor;
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
    const bp = this.noiseBp;
    const ns = this.noiseSt;
    const oL = this.oL;
    const oR = this.oR;
    const mask = BUF - 1;
    const la = this.lossA;
    const lb = this.lossG * (1 + la);
    let peak = 0;
    for (let t = 0; t < n; t++) {
      const w = this.frame + t;
      this.D += (this.Dtarget - this.D) * 0.004;
      this.jetD += (this.jetDTarget - this.jetD) * 0.01;
      // bore return at the embouchure (fractional read, linear is enough at this length)
      const Di = Math.floor(this.D);
      const fr = this.D - Di;
      const r = this.bore[(w - Di) & mask] * (1 - fr) + this.bore[(w - Di - 1) & mask] * fr;
      // open foot: pressure reflection inverts (open-open pipe => all harmonics);
      // radiation + wall losses (lowpass), DC block
      this.lp = -lb * r - la * this.lp;
      const y = this.lp - this.dcX + 0.995 * this.dcY;
      this.dcX = this.lp;
      this.dcY = y;
      const pRet = y;
      // turbulence noise (bandpassed), plus attack chiff
      const white = this.rng() * 2 - 1;
      const nz = bp[0] * white + ns[0];
      ns[0] = bp[1] * white - bp[3] * nz + ns[1];
      ns[1] = bp[2] * white - bp[4] * nz;
      const noise = nz * (turb + 0.12 * this.chiff * drive);
      // jet: deflected by the acoustic flow at the embouchure (more easily when slow),
      // the deflection convected to the edge; flow into the pipe ∝ jet speed
      let tng = 0;
      if (this.tongueN > 0) {
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
      const q = u * (Math.tanh((jk * jDel) / (u + 0.06) + off) - tOff);
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
