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

import { type ExciteTrace, type InstrumentCore } from './instrument.ts';
import type { KeySummary } from '../api/messages.ts';
import type { PianoEvent } from './piano-core.ts';
import { biquadBandpass, biquadHighpass, biquadPeaking, biquadHighShelf } from './filters.ts';
import { BiquadChain, Limiter, Room } from './post.ts';
import { clamp, interp, mulberry32 } from './util.ts';
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
}

const RHO = 1.2;
const C_AIR = 343;
const BUF = 1 << 13;
const TRACE = 2048;
const TANH_OFF = Math.tanh(0.8);
/** small-signal jet gain and nominal jet delay / period */
const JET_GAIN = 0.22;
/** pressure reflection at the embouchure hole (open end) */
const R_EMB = 0.96;
const OFF = 0.8;
const JET_RATIO = 0.36;
const JET_K = (2 * JET_GAIN) / (1 - Math.tanh(0.8) ** 2);
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
  private vibPhase = 0;
  private expression = 1;
  private note = -1;
  private held: number[] = [];
  private velocity = 80;
  private noiseBp = new Float64Array(5);
  private noiseSt = new Float64Array(2);
  private rng: () => number;
  private eq = new BiquadChain();
  private room: Room;
  private limiter: Limiter;
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

  constructor(opts: { sampleRate: number; params?: Partial<FluteParams>; dry?: boolean }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.params = { breath: 1, embouchure: 1, noise: 1, vibrato: 0.06, room: 0.35, volume: 1, ...opts.params };
    this.rng = mulberry32(31);
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
    this.room.configure(this.params.room);
    this.gain = 0.025 * this.params.volume;
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
    this.lj = (JET_RATIO / et(m)) * 0.45 * UjNom;
    this.mode = mode;
    this.fTarget = et(m);
    this.boreNominal = (mode * fs) / et(m);
    // jet receptivity falls off above a Strouhal-limited frequency (the player's lip
    // distance tracks the note): one-pole low-pass at ~2.2x the sounding pitch
    this.jetLpA = Math.exp((-2 * Math.PI * 2.2 * et(m)) / fs);
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
    const jr = JET_GAIN * (Lr * er - Li * ei);
    const ji2 = JET_GAIN * (Lr * ei + Li * er);
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
        if (!legato) this.vibPhase = 0;
        this.noteStart = this.frame;
        break;
      }
      case 'noteOff': {
        this.held = this.held.filter((x) => x !== ev.midi);
        if (this.held.length && ev.midi === this.note) {
          this.setNote(this.held[this.held.length - 1], false);
        } else if (!this.held.length && this.sustain < 0.5) {
          this.pTarget = 0;
        }
        break;
      }
      case 'sustain':
        this.sustain = clamp(ev.value, 0, 1);
        if (this.sustain < 0.5 && !this.held.length) this.pTarget = 0;
        break;
      case 'control':
        if (ev.cc === 2 || ev.cc === 11) this.expression = 0.4 + 0.8 * clamp(ev.value, 0, 1);
        if (ev.cc === 1) this.params = { ...this.params, vibrato: 0.15 * clamp(ev.value, 0, 1) };
        break;
      case 'allNotesOff':
        this.held = [];
        this.pTarget = 0;
        break;
      default:
        break;
    }
  }
  private noteStart = 0;

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<FluteParams>) };
    if (this.params.room !== old.room || this.params.volume !== old.volume) this.updatePost();
  }

  allSoundOff(): void {
    this.bore.fill(0);
    this.jet.fill(0);
    this.pressure = this.pTarget = 0;
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

  process(outL: Float32Array | Float64Array, outR: Float32Array | Float64Array, frames: number): void {
    let done = 0;
    while (done < frames) {
      const q = this.queue;
      while (q.length && q[0].frame <= this.frame) this.apply(q.shift()!.ev);
      let n = Math.min(64, frames - done);
      if (q.length) n = Math.max(1, Math.min(n, q[0].frame - this.frame));
      this.render(n);
      for (let t = 0; t < n; t++) {
        outL[done + t] = this.oL[t];
        outR[done + t] = this.oR[t];
      }
      done += n;
    }
  }

  private render(n: number): void {
    const fs = this.fs;
    const dt = n / fs;
    const P = this.params;
    // breath envelope and vibrato (control rate)
    const k = 1 - Math.exp(-dt / (this.pTarget > this.pressure ? this.attackTau : 0.035));
    this.pressure += (this.pTarget - this.pressure) * k;
    if (this.pressure < 1e-5 && this.pTarget === 0) this.pressure = 0;
    const age = (this.frame - this.noteStart) / fs;
    this.vibPhase += 2 * Math.PI * 5.0 * dt;
    const vib = 1 + P.vibrato * clamp((age - 0.3) / 0.4, 0, 1) * Math.sin(this.vibPhase);
    // velocity: mostly loudness (jet flow amplitude), a little blowing pressure
    const v01 = this.velocity / 127;
    const velScale = 0.35 + 0.8 * v01;
    const pBlow = this.nominalPressure(this.note) * this.pressure * vib * P.breath * (0.88 + 0.16 * v01) * this.expression;
    const Uj = Math.sqrt((2 * Math.max(pBlow, 1)) / RHO);
    this.Uj = Uj;
    const ljEff = this.lj * P.embouchure;
    this.jetDTarget = clamp((fs * ljEff) / (0.45 * Math.max(Uj, 4)), 2, BUF / 2);
    // players "lip" the pitch back as they blow harder; compensate 75 % of the drift
    this.Dtarget = this.Dnom + 0.75 * (this.boreDelayFor(this.jetDTarget) * this.tuningCorrection(this.note) - this.Dnom);
    // normalised drive (flow) and turbulence ∝ Uj²
    const drive = this.pressure * vib * velScale * this.expression * Math.min(1.6, P.breath);
    const turb = 0.035 * P.noise * (Uj * Uj) / 400 * (this.pressure > 0 ? 1 : 0);
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
      this.jetLpY = (1 - this.jetLpA) * (0.5 * y + noise) + this.jetLpA * this.jetLpY;
      const jIn = this.jetLpY;
      this.jet[w & mask] = jIn;
      const jd = this.jetD;
      const ji = Math.floor(jd);
      const jf = jd - ji;
      const jDel = this.jet[(w - ji) & mask] * (1 - jf) + this.jet[(w - ji - 1) & mask] * jf;
      // jet splitting at the edge: saturating flow law, offset edge -> even harmonics;
      // small-signal gain JET_GAIN (independent of jet speed above threshold)
      const q = u * (Math.tanh((JET_K * jDel) / (u + 0.06) + OFF) - TANH_OFF);
      const into = q - R_EMB * y;
      this.bore[w & mask] = into;
      // radiation from the open end (high-passed transmitted wave) + embouchure
      const rad = r - this.outHpX + 0.995 * this.outHp;
      this.outHpX = r;
      this.outHp = rad;
      // the embouchure hole radiates too: the jet's own (asymmetric) flow carries the
      // even harmonics; the open foot radiates the high-passed pipe wave
      const out = rad + 2.2 * q + 0.25 * noise;
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
      modes: this.modeAmps.slice(),
      sustain: this.sustain,
      soft: this.soft,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }
}
