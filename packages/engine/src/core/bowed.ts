// Bowed string instruments (violin, viola, cello).
//
// Each of the four strings is a digital waveguide (one circular buffer for the
// round trip, finger/nut inversion applied at the bridge read, fractional
// Lagrange read so the stopped length can glide for vibrato). The bow acts at an
// interior point with a hyperbolic friction law, μ(Δv) = μd + (μs−μd)·v0/(v0+|Δv|),
// solved per sample with the stick/slip hysteresis rule of McIntyre, Schumacher &
// Woodhouse (1983) — Helmholtz motion is not imposed, it emerges. All four
// strings (open ones too) end on one bridge coupled through a passive junction to
// a modal body built from each instrument's signature modes (A0 air mode, CBR,
// B1−/B1+, then statistically dense modes), so open strings resonate
// sympathetically. Radiation: modal velocities to two microphones + a high-
// frequency path, the bridge-hill formant, a small room.

import { type ExciteTrace, type InstrumentCore, type InstrumentId } from './instrument.ts';
import type { KeySummary } from '../api/messages.ts';
import type { PianoEvent } from './piano-core.ts';
import { designLossFilter, onePolePhaseDelay, biquadHighpass, biquadPeaking, biquadHighShelf } from './filters.ts';
import { BiquadChain, Limiter, Room } from './post.ts';
import { LN1000, clamp, gauss, mulberry32, nextPow2 } from './util.ts';
import bowedFit from './bowed-fit.json';

export interface BowedParams {
  /** bow–bridge distance as a fraction of the vibrating length (sul ponticello ≈ 0.04, sul tasto ≈ 0.2) */
  bowPosition: number;
  /** bow force as a fraction of Schelleng's maximum for the current bow speed and position */
  bowPressure: number;
  /** vibrato depth, cents */
  vibrato: number;
  /** multiplier on the body's modal loss factors */
  bodyDamping: number;
  room: number;
  volume: number;
  /** compute resonance of the strings that are not bowed */
  sympathetic: boolean;
  /** bow changes: alternate down/up-bow per détaché note and change bow when the hair runs out */
  bowChanges: boolean;
  /** duration of a bow change (speed reversal), s */
  bowChangeTime: number;
}

interface StringDef {
  name: string;
  open: number;
  /** tension, N */
  T: number;
}

interface BodyMode {
  f: number;
  eta: number;
  /** effective modal mass at the bridge, kg */
  m: number;
  /** radiation weight (monopole-ish) */
  rad: number;
}

interface BowedDesign {
  id: InstrumentId;
  label: string;
  /** vibrating length nut–bridge, m */
  L: number;
  strings: StringDef[];
  /** intrinsic string T60 (s) at the open fundamental and at 3 kHz */
  t60: [number, number];
  /** signature body modes (violin-family nomenclature) */
  signature: BodyMode[];
  /** statistical modes: lowest frequency, top, mean spacing at 1 kHz (Hz), mass, eta */
  stat: { fLo: number; fHi: number; spacing: number; mass: number; eta: number };
  /** local bridge admittance (s/kg) */
  bridgeY: number;
  /** bridge-hill formant [Hz, dB, Q] and extra EQ */
  eq: [number, number, number][];
  /** bow speed range (m/s) mapped from MIDI velocity */
  bowSpeed: [number, number];
  /** usable hair length of the bow, m */
  bowLength: number;
  /** high-frequency radiation: statistical body mobility above the modal range, as a gain on
   *  the bridge force and its high-pass corner (Hz) */
  hf: [number, number];
  /** bow-force multiplier on bowPressure at pp and at ff (linear in velocity) */
  forceDyn: [number, number];
  /** bow-position multiplier at pp and at ff: players play louder mainly by moving the bow
   *  towards the bridge (Schelleng), which raises the Helmholtz amplitude ∝ v/β and, at a
   *  fixed fraction of the maximum force, the force itself */
  betaDyn: [number, number];
  outputGain: number;
  defaults: Partial<BowedParams>;
  seed: number;
}

const VIOLIN: BowedDesign = {
  id: 'violin',
  label: 'Violin',
  L: 0.328,
  strings: [
    { name: 'G', open: 55, T: 44 },
    { name: 'D', open: 62, T: 42 },
    { name: 'A', open: 69, T: 50 },
    { name: 'E', open: 76, T: 73 },
  ],
  t60: [9, 0.9],
  // Jansson; Bissinger: A0 (f-hole Helmholtz), CBR, B1−, B1+, A1
  signature: [
    { f: 275, eta: 0.04, m: 0.35, rad: 1.0 },
    { f: 405, eta: 0.03, m: 0.6, rad: 0.25 },
    { f: 465, eta: 0.022, m: 0.28, rad: 0.85 },
    { f: 540, eta: 0.022, m: 0.3, rad: 1.0 },
    { f: 470 * 1.0 + 0, eta: 0.035, m: 1.2, rad: 0.4 },
  ],
  stat: { fLo: 600, fHi: 4800, spacing: 45, mass: 0.45, eta: 0.03 },
  bridgeY: 0.02,
  eq: [
    [2600, 3, 1.4],
    [180, -6, 0.8],
  ],
  bowSpeed: [0.05, 0.45],
  bowLength: 0.64,
  hf: [0.003, 2500],
  forceDyn: [1, 1],
  betaDyn: [1, 1],
  outputGain: 60,
  // bowPosition: β at velocity 80 (round 2: louder notes move the bow towards the bridge)
  defaults: { bowPosition: 0.093, bowPressure: 0.32, vibrato: 14, bodyDamping: 1, room: 0.35, volume: 1, sympathetic: true },
  seed: 21,
};

const VIOLA: BowedDesign = {
  ...VIOLIN,
  id: 'viola',
  label: 'Viola',
  L: 0.37,
  strings: [
    { name: 'C', open: 48, T: 55 },
    { name: 'G', open: 55, T: 50 },
    { name: 'D', open: 62, T: 45 },
    { name: 'A', open: 69, T: 60 },
  ],
  t60: [10, 0.9],
  // a viola's main resonances sit relatively higher than a scaled violin would put them
  signature: [
    { f: 230, eta: 0.04, m: 0.45, rad: 1.0 },
    { f: 340, eta: 0.03, m: 0.7, rad: 0.25 },
    { f: 390, eta: 0.022, m: 0.35, rad: 0.85 },
    { f: 465, eta: 0.022, m: 0.38, rad: 1.0 },
    { f: 410, eta: 0.035, m: 1.4, rad: 0.4 },
  ],
  stat: { fLo: 520, fHi: 4400, spacing: 40, mass: 0.55, eta: 0.03 },
  eq: [
    [2100, 3, 1.3],
    [150, -5, 0.8],
  ],
  bowSpeed: [0.05, 0.45],
  bowLength: 0.64,
  hf: [0.003, 2500],
  forceDyn: [1, 1],
  betaDyn: [1, 1],
  outputGain: 80,
  defaults: { bowPosition: 0.113, bowPressure: 0.32, vibrato: 12, bodyDamping: 1, room: 0.35, volume: 1, sympathetic: true },
  seed: 22,
};

const CELLO: BowedDesign = {
  ...VIOLIN,
  id: 'cello',
  label: 'Cello',
  L: 0.69,
  strings: [
    { name: 'C', open: 36, T: 130 },
    { name: 'G', open: 43, T: 140 },
    { name: 'D', open: 50, T: 145 },
    { name: 'A', open: 57, T: 165 },
  ],
  t60: [14, 1.0],
  signature: [
    { f: 102, eta: 0.04, m: 1.6, rad: 1.0 },
    { f: 145, eta: 0.03, m: 2.6, rad: 0.25 },
    { f: 175, eta: 0.022, m: 1.3, rad: 0.85 },
    { f: 205, eta: 0.022, m: 1.4, rad: 1.0 },
    { f: 190, eta: 0.035, m: 5, rad: 0.4 },
  ],
  stat: { fLo: 240, fHi: 3600, spacing: 28, mass: 2.2, eta: 0.03 },
  bridgeY: 0.008,
  eq: [
    [1500, 3, 1.2],
    [70, -4, 0.8],
  ],
  bowSpeed: [0.06, 0.5],
  bowLength: 0.6,
  hf: [0.003, 2500],
  forceDyn: [1, 1],
  betaDyn: [1, 1],
  outputGain: 24,
  // vibrato: the Iowa cellist's median (17 ¢ at 5.4 Hz as analysed), round 2
  defaults: { bowPosition: 0.108, bowPressure: 0.3, vibrato: 20, bodyDamping: 1, room: 0.32, volume: 1, sympathetic: true },
  seed: 23,
};

export const BOWED: Record<string, BowedDesign> = { violin: VIOLIN, viola: VIOLA, cello: CELLO };
// round 2: radiation balance, dynamics and string HF loss fitted to the Iowa MIS recordings
// (scripts/fit-strings.ts); absent keys keep the literature values above
for (const [id, fit] of Object.entries(bowedFit as unknown as Record<string, Partial<BowedDesign>>)) if (BOWED[id]) Object.assign(BOWED[id], fit);

/** velocity (0..1 of 1..127) at which bowPosition is the actual β: MIDI 80 */
const X_REF = 79 / 126;
const MU_S = 0.8;
const MU_D = 0.3;
const V0 = 0.2;
const MAX_BUF = 1 << 14;
const TRACE = 2048;

const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class BowedString {
  readonly def: StringDef;
  readonly Z: number;
  readonly fOpen: number;
  buf = new Float64Array(MAX_BUF);
  readonly mask = MAX_BUF - 1;
  /** current/target loop delay (samples, fractional) */
  D = 100;
  Dtarget = 100;
  /** delay of the stopped note without vibrato */
  D0 = 100;
  lossB = 0.9;
  lossA = 0;
  ly = 0;
  // bow
  bowing = false;
  /** bow speed magnitude (m/s); the signed speed is vBow · bow direction profile */
  vBow = 0;
  vBowTarget = 0;
  /** signed bow speed and force used by the friction solve this control block */
  vSigned = 0;
  fScale = 1;
  /** velocity-dependent force and bow-position multipliers of the current note */
  forceDyn = 1;
  betaDyn = 1;
  fBow = 0;
  fBowTarget = 0;
  /** bow force the note asks for, before the live pressure controller (CC1/CC2/CC11) */
  fBase = 0;
  /** Schelleng's maximum force for the current speed and contact point */
  fMax = 1;
  stick = true;
  slipSign = 1;
  beta = 0.11;
  noiseLp = 0;
  // note
  midi = -1;
  held = false;
  releasedAt = 0;
  startedAt = 0;
  vibPhase = 0;
  vibRate = 5.5;
  level = 0;
  /** last bridge-incoming wave */
  vin = 0;
  // traces for visualisation
  trF = new Float32Array(TRACE);
  trV = new Float32Array(TRACE);
  trI = 0;
  constructor(def: StringDef, L: number, readonly fs: number) {
    this.def = def;
    this.fOpen = et(def.open);
    this.Z = def.T / (2 * L * this.fOpen);
  }
}

export class BowedCore implements InstrumentCore {
  readonly id: InstrumentId;
  readonly fs: number;
  design: BowedDesign;
  params: BowedParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = 4;
  sympatheticAllowed = true;
  dry: boolean;
  strings: BowedString[];
  private queue: { frame: number; ev: PianoEvent | { type: 'control'; cc: number; value: number } }[] = [];
  // body
  private K = 0;
  private freq = new Float64Array(0);
  private eta = new Float64Array(0);
  private mass = new Float64Array(0);
  private b0 = new Float64Array(0);
  private b2 = new Float64Array(0);
  private a1 = new Float64Array(0);
  private a2 = new Float64Array(0);
  private s1 = new Float64Array(0);
  private s2 = new Float64Array(0);
  private radL = new Float64Array(0);
  private radR = new Float64Array(0);
  private Y0 = 0;
  private H = 0;
  private hfL = 0;
  private hfR = 0;
  private hfHp = new BiquadChain();
  private eq = new BiquadChain();
  private room: Room;
  private limiter: Limiter;
  private rng: () => number;
  private expression = 1;
  private modwheel = -1;
  /** live bow-pressure controller: mod wheel / breath / expression (1 = as the note asked) */
  private pressureCC = 1;
  /** pitch bend, semitones */
  private bend = 0;
  private focus = 0;
  private oL = new Float64Array(128);
  private oR = new Float64Array(128);
  private hL = new Float64Array(128);
  private hR = new Float64Array(128);
  private gain = 1;
  /** The bow, shared by all strings as on the instrument: direction (+1 down-bow, −1 up-bow),
   *  position along the hair from the frog (m), and an in-progress change. */
  readonly bow = { dir: 1, pos: 0, changing: false, t: 0, from: 1, changes: 0, lastStroke: -1e12, auto: 0 };
  private vinS = new Float64Array(4);
  private peakS = new Float64Array(4);
  private onS = new Uint8Array(4);

  constructor(opts: { sampleRate: number; instrument: 'violin' | 'viola' | 'cello'; params?: Partial<BowedParams>; dry?: boolean }) {
    this.fs = opts.sampleRate;
    this.design = BOWED[opts.instrument];
    this.id = this.design.id;
    this.dry = !!opts.dry;
    this.params = {
      bowPosition: 0.11,
      bowPressure: 0.32,
      vibrato: 12,
      bodyDamping: 1,
      room: 0.35,
      volume: 1,
      sympathetic: true,
      bowChanges: true,
      bowChangeTime: 0.07,
      ...this.design.defaults,
      ...opts.params,
    };
    this.rng = mulberry32(this.design.seed);
    this.strings = this.design.strings.map((d) => new BowedString(d, this.design.L, this.fs));
    for (const s of this.strings) this.setStopped(s, s.def.open, true);
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    this.buildBody();
    this.updatePost();
  }

  // ------------------------------------------------------------ body

  private buildBody(): void {
    const d = this.design;
    const rand = mulberry32(d.seed * 31 + 7);
    const modes: BodyMode[] = [...d.signature];
    let f = d.stat.fLo;
    while (f < d.stat.fHi) {
      modes.push({ f, eta: d.stat.eta * (0.7 + 0.6 * rand()), m: d.stat.mass * Math.exp(0.5 * gauss(rand)) * Math.sqrt(f / 1000), rad: (rand() < 0.5 ? -1 : 1) * (0.3 + 0.7 * rand()) });
      f += d.stat.spacing * Math.sqrt(f / 1000) * (0.4 + 1.2 * rand());
    }
    const K = modes.length;
    this.K = K;
    this.freq = Float64Array.from(modes.map((m) => m.f));
    this.eta = Float64Array.from(modes.map((m) => m.eta));
    this.mass = Float64Array.from(modes.map((m) => m.m));
    this.radL = new Float64Array(K);
    this.radR = new Float64Array(K);
    modes.forEach((m, k) => {
      const pan = rand();
      this.radL[k] = m.rad * (0.55 + 0.45 * pan);
      this.radR[k] = m.rad * (0.55 + 0.45 * (1 - pan)) * (k % 3 === 0 ? -1 : 1);
    });
    this.b0 = new Float64Array(K);
    this.b2 = new Float64Array(K);
    this.a1 = new Float64Array(K);
    this.a2 = new Float64Array(K);
    this.s1 = new Float64Array(K);
    this.s2 = new Float64Array(K);
    this.setBodyDamping(this.params.bodyDamping);
    for (const s of this.strings) this.retune(s);
  }

  private setBodyDamping(scale: number): void {
    const fs = this.fs;
    let y0 = 0;
    for (let k = 0; k < this.K; k++) {
      const w = 2 * Math.PI * this.freq[k];
      const zeta = Math.min(0.45, 0.5 * this.eta[k] * scale);
      const c = w / Math.tan((w / fs) * 0.5);
      const A = 1 / this.mass[k];
      const a0 = c * c + 2 * zeta * w * c + w * w;
      this.b0[k] = (A * c) / a0;
      this.b2[k] = (-A * c) / a0;
      this.a1[k] = (2 * (w * w - c * c)) / a0;
      this.a2[k] = (c * c - 2 * zeta * w * c + w * w) / a0;
      y0 += this.b0[k];
    }
    this.Y0 = y0;
  }

  /** bridge admittance (body modes + local) at w rad/sample */
  private mobility(w: number): [number, number] {
    let re = this.design.bridgeY;
    let im = 0;
    const c1 = Math.cos(w);
    const s1 = -Math.sin(w);
    const c2 = Math.cos(2 * w);
    const s2 = -Math.sin(2 * w);
    for (let k = 0; k < this.K; k++) {
      const nr = this.b0[k] + this.b2[k] * c2;
      const ni = this.b2[k] * s2;
      const dr = 1 + this.a1[k] * c1 + this.a2[k] * c2;
      const di = this.a1[k] * s1 + this.a2[k] * s2;
      const den = dr * dr + di * di;
      re += (nr * dr + ni * di) / den;
      im += (ni * dr - nr * di) / den;
    }
    return [re, im];
  }

  private updatePost(): void {
    const fs = this.fs;
    this.eq.set([biquadHighpass(this.design.strings[0].open < 40 ? 40 : 70, 0.7, fs), ...this.design.eq.map(([f, g, q]) => biquadPeaking(f, q, g, fs)), biquadHighShelf(7000, -3, fs)]);
    this.hfHp.set([biquadHighpass(this.design.hf[1], 0.7, fs)]);
    this.room.configure(this.params.room);
    this.gain = this.design.outputGain * this.params.volume;
  }

  // ------------------------------------------------------------ strings

  /** Stop string s at midi note m (open if m equals its open note). */
  private setStopped(s: BowedString, m: number, immediate = false): void {
    s.midi = m;
    const f = et(m);
    const open = m <= s.def.open;
    // intrinsic losses; a stopping finger adds damping
    const t60L = this.design.t60[0] * (open ? 1 : 0.55) * Math.pow(s.fOpen / f, 0.3);
    const t60H = this.design.t60[1] * (open ? 1 : 0.7);
    const freqs: number[] = [];
    const t60: number[] = [];
    const loop: number[] = [];
    for (let k = 1; k <= 30; k++) {
      const fk = k * f;
      if (fk > Math.min(0.45 * this.fs, Math.max(3000, 2.5 * f))) break;
      const sig = LN1000 / t60L + Math.max(0, (LN1000 / t60H - LN1000 / t60L) * ((fk * fk - f * f) / (3000 * 3000 - f * f)));
      freqs.push(fk);
      t60.push(LN1000 / sig);
      loop.push((k * this.fs) / fk);
    }
    const ld = designLossFilter(freqs, t60, loop, this.fs);
    s.lossA = ld.a;
    s.lossB = ld.g * (1 + ld.a);
    s.D0 = this.loopDelay(s, f);
    s.Dtarget = s.D0;
    if (immediate) s.D = s.D0;
  }

  /** delay-line length for pitch f: fs/f minus the loss filter, Lagrange and bridge-reactance phase */
  private loopDelay(s: BowedString, f: number): number {
    const w = (2 * Math.PI * f) / this.fs;
    let P = this.fs / f;
    if (this.K) {
      // reflection phase of the bridge for this string (as for the piano's in-phase mode)
      let num = 0;
      for (let k = 1; k <= 3; k++) {
        const [yr, yi] = this.mobility(w * k);
        const er = yr * s.Z;
        const ei = yi * s.Z;
        num += (Math.atan2(-ei, 1 - er) - Math.atan2(ei, 1 + er)) / (2 * Math.PI * k);
      }
      P += (num / 3) * P;
    }
    return Math.max(8, P - onePolePhaseDelay(s.lossA, w));
  }

  private retune(s: BowedString): void {
    if (s.midi >= 0) {
      s.D0 = this.loopDelay(s, et(s.midi));
      s.Dtarget = s.D0;
      s.D = s.D0;
    }
  }

  /** Which string plays midi m: free strings that can reach it, highest open string first. */
  private pickString(m: number): BowedString | null {
    const cands = this.strings.filter((s) => m >= s.def.open && m <= s.def.open + 26);
    if (!cands.length) return null;
    const free = cands.filter((s) => !s.bowing).sort((a, b) => b.def.open - a.def.open);
    if (free.length) return free[0];
    return cands.sort((a, b) => a.startedAt - b.startedAt)[0];
  }

  private bowTargets(s: BowedString, velocity: number): void {
    const [vlo, vhi] = this.design.bowSpeed;
    const x = clamp((velocity - 1) / 126, 0, 1);
    const v = vlo * Math.pow(vhi / vlo, x) * this.expression;
    s.vBowTarget = v;
    // normalised to 1 at velocity 80, so bowPosition is the bow's β at that velocity
    const [bp, bf] = this.design.betaDyn;
    s.betaDyn = (bp + (bf - bp) * x) / (bp + (bf - bp) * X_REF);
    s.beta = clamp(this.params.bowPosition * s.betaDyn, 0.03, 0.3);
    // Schelleng's maximum bow force for this speed/position; play a fraction of it
    const fMax = (2 * s.Z * v) / (s.beta * (MU_S - MU_D));
    const [fp, ff] = this.design.forceDyn;
    s.forceDyn = fp + (ff - fp) * x;
    s.fMax = fMax;
    s.fBase = clamp(this.params.bowPressure * s.forceDyn, 0.02, 1.2) * fMax;
    s.fBowTarget = Math.min(1.3 * fMax, s.fBase * this.pressureCC);
  }

  // ------------------------------------------------------------ events

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
        const s = this.pickString(ev.midi);
        if (!s) return;
        const legato = s.bowing;
        this.setStopped(s, ev.midi, !legato && s.level < 1e-4);
        if (!legato) {
          s.stick = true;
          s.vBow = 0;
          this.newStroke();
        }
        s.bowing = true;
        s.held = true;
        s.startedAt = this.frame;
        s.vibPhase = this.rng() * Math.PI * 2;
        s.vibRate = 5.2 + 0.8 * this.rng();
        this.bowTargets(s, ev.velocity);
        this.focus = this.strings.indexOf(s);
        break;
      }
      case 'noteOff': {
        for (const s of this.strings) if (s.midi === ev.midi && s.bowing && s.held) {
          s.held = false;
          if (this.sustain < 0.5) this.lift(s);
        }
        break;
      }
      case 'sustain':
        this.sustain = clamp(ev.value, 0, 1);
        if (this.sustain < 0.5) for (const s of this.strings) if (s.bowing && !s.held) this.lift(s);
        break;
      case 'soft':
        this.soft = clamp(ev.value, 0, 1);
        break;
      case 'control':
        // mod wheel, breath controller and expression press the bow into the string
        // (×0.3 … ×1.5 of the force the note asked for, capped above Schelleng's maximum)
        if (ev.cc === 1 || ev.cc === 2 || ev.cc === 11) this.pressureCC = 0.3 + 1.2 * clamp(ev.value, 0, 1);
        break;
      case 'bend':
        // the finger slides: every stopped or bowed string follows
        this.bend = clamp(ev.value, -12, 12);
        break;
      case 'allNotesOff':
        for (const s of this.strings) this.lift(s);
        break;
    }
  }

  /** A détaché note (the bow was not moving) takes a new stroke: the bow alternates direction,
   *  unless too little hair is left that way, as a player distributes the bow. Notes that
   *  overlap one already bowed (slurs, chords, double stops) continue its stroke. */
  private newStroke(): void {
    const b = this.bow;
    if (!this.params.bowChanges) {
      b.dir = 1;
      b.pos = 0;
      return;
    }
    if (this.strings.some((q) => q.bowing)) return;
    const first = b.lastStroke < -1e11;
    b.lastStroke = this.frame;
    b.changing = false;
    const L = this.design.bowLength;
    if (first) {
      b.dir = 1;
      b.pos = 0.05 * L;
      return;
    }
    const nd = -b.dir;
    const left = (d: number) => (d > 0 ? L - b.pos : b.pos);
    b.dir = left(nd) >= 0.1 * L || left(nd) >= left(b.dir) ? nd : b.dir;
  }

  /** Control-rate bow motion: position along the hair, automatic changes, reversal profile. */
  private bowControl(dt: number): void {
    const b = this.bow;
    const P = this.params;
    let vmax = 0;
    for (const s of this.strings) if (s.bowing && s.vBow > vmax) vmax = s.vBow;
    let sgn = b.dir;
    let fsc = 1;
    if (P.bowChanges) {
      const T = Math.max(0.02, P.bowChangeTime);
      const L = this.design.bowLength;
      if (!b.changing && vmax > 0) {
        // change when the remaining hair is about what the deceleration needs (+2 cm)
        const left = b.dir > 0 ? L - b.pos : b.pos;
        if (left < (vmax * T) / Math.PI + 0.02) {
          b.changing = true;
          b.t = 0;
          b.from = b.dir;
          b.changes++;
          b.auto++;
        }
      }
      if (b.changing) {
        b.t += dt;
        const x = Math.min(1, b.t / T);
        // speed reverses smoothly through zero; the player eases the weight a little at the turn
        sgn = b.from * Math.cos(Math.PI * x);
        fsc = 1 - 0.18 * Math.sin(Math.PI * x);
        if (x >= 1) {
          b.changing = false;
          b.dir = -b.from;
          sgn = b.dir;
        }
      }
      b.pos = clamp(b.pos + sgn * vmax * dt, 0, L);
    }
    for (const s of this.strings) {
      s.vSigned = s.vBow * sgn;
      s.fScale = fsc;
    }
  }

  private lift(s: BowedString): void {
    s.bowing = false;
    s.vBowTarget = 0;
    s.fBowTarget = 0;
    s.releasedAt = this.frame;
  }

  noteOn(midi: number, velocity: number): void {
    this.schedule({ type: 'noteOn', midi, velocity });
  }
  noteOff(midi: number): void {
    this.schedule({ type: 'noteOff', midi });
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<BowedParams>) };
    if (this.params.bodyDamping !== old.bodyDamping) {
      this.setBodyDamping(this.params.bodyDamping);
    }
    if (this.params.room !== old.room || this.params.volume !== old.volume) this.updatePost();
    if (this.params.bowPosition !== old.bowPosition || this.params.bowPressure !== old.bowPressure) {
      for (const s of this.strings) if (s.bowing) {
        const ratio = s.vBowTarget;
        s.beta = clamp(this.params.bowPosition * s.betaDyn, 0.03, 0.3);
        s.fMax = (2 * s.Z * ratio) / (s.beta * (MU_S - MU_D));
        s.fBase = clamp(this.params.bowPressure * s.forceDyn, 0.02, 1.2) * s.fMax;
        s.fBowTarget = Math.min(1.3 * s.fMax, s.fBase * this.pressureCC);
      }
    }
  }

  allSoundOff(): void {
    for (const s of this.strings) {
      s.buf.fill(0);
      s.ly = 0;
      s.bowing = false;
      s.vBow = s.fBow = s.vBowTarget = s.fBowTarget = 0;
      s.level = 0;
      this.setStopped(s, s.def.open, true);
    }
    this.s1.fill(0);
    this.s2.fill(0);
    this.H = 0;
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  get activeVoiceCount(): number {
    return this.strings.filter((s) => s.bowing || s.level > 1e-4).length;
  }
  get activeSympatheticCount(): number {
    return this.strings.filter((s) => !s.bowing && s.level > 1e-6 && s.midi === s.def.open).length;
  }
  get modeFrequencies(): Float64Array {
    return this.freq;
  }

  // ------------------------------------------------------------ audio

  process(outL: Float32Array | Float64Array, outR: Float32Array | Float64Array, frames: number): void {
    let done = 0;
    while (done < frames) {
      const q = this.queue;
      while (q.length && q[0].frame <= this.frame) this.apply(q.shift()!.ev);
      let n = Math.min(64, frames - done);
      if (q.length) n = Math.max(1, Math.min(n, q[0].frame - this.frame));
      this.control(n);
      this.render(n);
      for (let t = 0; t < n; t++) {
        outL[done + t] = this.oL[t];
        outR[done + t] = this.oR[t];
      }
      done += n;
    }
  }

  /** control-rate updates: bow envelopes, vibrato, finger lifts */
  private control(n: number): void {
    const fs = this.fs;
    const dt = n / fs;
    const vibDepth = this.modwheel >= 0 ? this.modwheel * 30 : this.params.vibrato;
    for (const s of this.strings) {
      // bow speed attack ~ 50 ms, release 15 ms; force follows faster
      const ka = 1 - Math.exp(-dt / (s.bowing ? 0.045 : 0.012));
      s.vBow += (s.vBowTarget - s.vBow) * ka;
      const kf = 1 - Math.exp(-dt / (s.bowing ? 0.012 : 0.008));
      s.fBow += (s.fBowTarget - s.fBow) * kf;
      if (s.vBow < 1e-6 && !s.bowing) s.vBow = 0;
      if (s.fBow < 1e-6 && !s.bowing) s.fBow = 0;
      // vibrato: onset after 0.25 s, depth in cents
      let cents = 0;
      if (s.bowing && s.midi > s.def.open) {
        const age = (this.frame - s.startedAt) / fs;
        const ramp = clamp((age - 0.25) / 0.35, 0, 1);
        s.vibPhase += 2 * Math.PI * s.vibRate * dt;
        cents = vibDepth * ramp * Math.sin(s.vibPhase);
      }
      // finger lifts 0.3 s after the bow leaves an idle string
      if (!s.bowing && s.midi !== s.def.open && (this.frame - s.releasedAt) / fs > 0.3) {
        this.setStopped(s, s.def.open, false);
      }
      // the live pressure controller follows the bow while it is on the string
      if (s.bowing && s.fBase > 0) s.fBowTarget = Math.min(1.3 * s.fMax, s.fBase * this.pressureCC);
      const bendC = s.bowing || s.midi !== s.def.open ? 100 * this.bend : 0;
      s.Dtarget = s.D0 * Math.pow(2, -(cents + bendC) / 1200);
    }
    this.bowControl(dt);
  }

  private render(n: number): void {
    const strs = this.strings;
    const ns = strs.length;
    const sym = this.params.sympathetic && this.sympatheticAllowed;
    const Yt = this.Y0 + this.design.bridgeY;
    const hfG = this.design.hf[0];
    let ZS = 0;
    for (const s of strs) ZS += s.Z;
    const oL = this.oL;
    const oR = this.oR;
    const hL = this.hL;
    const hR = this.hR;
    const K = this.K;
    const b0 = this.b0;
    const b2 = this.b2;
    const a1 = this.a1;
    const a2 = this.a2;
    const s1 = this.s1;
    const s2 = this.s2;
    const rl = this.radL;
    const rr = this.radR;
    const vin = this.vinS;
    const peak = this.peakS;
    const on = this.onS;
    peak.fill(0);
    for (let i = 0; i < ns; i++) {
      const s = strs[i];
      on[i] = sym || s.bowing || s.level > 1e-7 || s.midi !== s.def.open ? 1 : 0;
    }
    for (let t = 0; t < n; t++) {
      const w = this.frame + t;
      let S = 0;
      for (let i = 0; i < ns; i++) {
        const s = strs[i];
        if (!on[i]) {
          vin[i] = 0;
          continue;
        }
        const buf = s.buf;
        const mask = s.mask;
        // glide the stopped length smoothly (vibrato, finger changes)
        s.D += (s.Dtarget - s.D) * 0.02;
        // ---- bow at an interior point (in place, like a hammer)
        if (s.fBow > 0) {
          const P = s.D;
          const db = Math.max(1, Math.round((s.beta * P) / 2));
          const iL = (w - db) & mask;
          const iR = (w - Math.round(P - db)) & mask;
          const bL = buf[iL];
          const aR = -buf[iR];
          const vh = aR + bL;
          // rosin noise roughens the friction curve slightly
          this.noise(s);
          const muScale = 1 + 0.04 * s.noiseLp;
          const fb = s.fBow * s.fScale * muScale;
          const twoZ = 2 * s.Z;
          const dh = s.vSigned - vh;
          let f: number;
          const fStick = twoZ * dh;
          if (s.stick && Math.abs(fStick) <= MU_S * fb) {
            f = fStick;
          } else {
            // slip: solve Δ + (F/2Z)·μ(Δ) = Δh on the side of the sliding direction
            const sg = s.stick ? (dh >= 0 ? 1 : -1) : s.slipSign;
            const a = fb / twoZ;
            const dhs = sg * dh;
            const B1 = V0 + a * MU_D - dhs;
            const C0 = V0 * (a * MU_S - dhs);
            const disc = B1 * B1 - 4 * C0;
            if (disc >= 0) {
              const root = (-B1 + Math.sqrt(disc)) / 2;
              if (root > 0) {
                f = sg * fb * (MU_D + ((MU_S - MU_D) * V0) / (V0 + root));
                s.stick = false;
                s.slipSign = sg;
              } else if (Math.abs(fStick) <= MU_S * fb) {
                f = fStick;
                s.stick = true;
              } else {
                f = sg * fb * MU_D;
                s.stick = false;
              }
            } else if (Math.abs(fStick) <= MU_S * fb) {
              f = fStick;
              s.stick = true;
            } else {
              f = sg * fb * MU_D;
            }
          }
          const df = f / twoZ;
          buf[iL] = bL + df;
          buf[iR] = -(aR + df);
          if (i === this.focus) {
            s.trF[s.trI] = f;
            s.trV[s.trI] = vh + df;
            s.trI = (s.trI + 1) & (TRACE - 1);
          }
        } else if (i === this.focus) {
          s.trF[s.trI] = 0;
          s.trV[s.trI] = 0;
          s.trI = (s.trI + 1) & (TRACE - 1);
        }
        // ---- bridge-incoming wave: fractional (Lagrange-3) read, inversion, loss
        const D = s.D;
        const di = Math.floor(D);
        const mu = D - di + 1;
        const x0 = buf[(w - di + 1) & mask];
        const x1 = buf[(w - di) & mask];
        const x2 = buf[(w - di - 1) & mask];
        const x3 = buf[(w - di - 2) & mask];
        const h0 = (-(mu - 1) * (mu - 2) * (mu - 3)) / 6;
        const h1 = (mu * (mu - 2) * (mu - 3)) / 2;
        const h2 = (-mu * (mu - 1) * (mu - 3)) / 2;
        const h3 = (mu * (mu - 1) * (mu - 2)) / 6;
        const u = -(h0 * x0 + h1 * x1 + h2 * x2 + h3 * x3);
        s.ly = s.lossB * u - s.lossA * s.ly;
        vin[i] = s.ly;
        S += s.Z * s.ly;
        const al = Math.abs(s.ly);
        if (al > peak[i]) peak[i] = al;
      }
      // ---- passive bridge junction with the modal body
      const vb = (Yt * 2 * S + this.H) / (1 + Yt * ZS);
      const F = 2 * S - ZS * vb;
      let h = 0;
      let ol = 0;
      let or = 0;
      for (let k = 0; k < K; k++) {
        const y = b0[k] * F + s1[k];
        const ns1 = s2[k] - a1[k] * y;
        s2[k] = b2[k] * F - a2[k] * y;
        s1[k] = ns1;
        h += ns1;
        ol += rl[k] * y;
        or += rr[k] * y;
      }
      this.H = h;
      const hfv = hfG * F;
      hL[t] = hfv;
      hR[t] = -hfv;
      oL[t] = ol;
      oR[t] = or;
      for (let i = 0; i < ns; i++) {
        if (!on[i]) continue;
        const s = strs[i];
        s.buf[w & s.mask] = vb - vin[i];
      }
    }
    for (let i = 0; i < ns; i++) strs[i].level = Math.max(peak[i], strs[i].level * 0.9);
    this.hfHp.process(hL, hR, n);
    const g = this.gain;
    for (let t = 0; t < n; t++) {
      oL[t] = (oL[t] + hL[t]) * g;
      oR[t] = (oR[t] + hR[t]) * g;
    }
    this.eq.process(oL, oR, n);
    if (!this.dry) {
      this.room.process(oL, oR, n, 1, this.params.room * 0.7);
      this.limiter.process(oL, oR, n);
    }
    this.frame += n;
    if ((this.frame & 4095) < n) {
      for (let k = 0; k < K; k++) {
        if (Math.abs(s1[k]) < 1e-22) s1[k] = 0;
        if (Math.abs(s2[k]) < 1e-22) s2[k] = 0;
      }
      // silence idle strings completely (no denormals)
      for (const s of strs) if (!s.bowing && s.level < 1e-12 && s.level > 0) {
        s.buf.fill(0);
        s.ly = 0;
        s.level = 0;
      }
    }
  }

  private noise(s: BowedString): void {
    s.noiseLp += 0.08 * (this.rng() * 2 - 1 - s.noiseLp);
  }

  // ------------------------------------------------------------ inspection

  keySummary(): KeySummary[] {
    const out: KeySummary[] = [];
    const info = { lo: this.design.strings[0].open, hi: this.design.strings[3].open + 24 };
    for (let m = info.lo; m <= info.hi; m++) {
      const s = [...this.strings].reverse().find((x) => m >= x.def.open) ?? this.strings[0];
      out.push({ midi: m, f1: et(m), B: 0, nStrings: 1, lengthM: (this.design.L * s.fOpen) / et(m), hasDamper: false, preparation: `${s.def.name} string` });
    }
    return out;
  }

  getVisual(points = 160): object {
    const s = this.strings[this.focus];
    const shape = new Float32Array(points);
    // displacement along the string, nut/finger (0) to bridge (1)
    const P = s.D;
    const half = Math.floor(P / 2);
    const raw = new Float32Array(half + 1);
    let y = 0;
    const w = this.frame - 1;
    for (let d = 0; d < half; d++) {
      const left = s.buf[(w - d) & s.mask];
      const right = -s.buf[(w - Math.round(P - d)) & s.mask];
      y += left + right;
      raw[d + 1] = y / this.fs;
    }
    const end = raw[half];
    for (let p = 0; p < points; p++) {
      const x = (1 - p / (points - 1)) * half;
      const j = Math.min(half - 1, Math.floor(x));
      const fr = x - j;
      shape[p] = raw[j] * (1 - fr) + raw[j + 1] * fr - end * (x / half);
    }
    // bow trace: last ~4 periods
    const len = Math.min(TRACE, Math.max(64, Math.round(4 * P)));
    const tf = new Float32Array(len);
    const tv = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const j = (s.trI - len + i + TRACE) & (TRACE - 1);
      tf[i] = s.trF[j];
      tv[i] = s.trV[j];
    }
    const amps = new Float32Array(this.K);
    for (let k = 0; k < this.K; k++) amps[k] = Math.hypot(this.s1[k], this.s2[k]) * this.mass[k];
    const excite: ExciteTrace = {
      title: 'Bow',
      unit: 'N',
      rate: this.fs,
      trace: tf,
      trace2: tv,
      trace2Label: 'string velocity under the bow',
      caption: 'Friction force of the bow on the string over the last few periods. The string sticks to the bow (flat parts), then slips back once per period: Helmholtz motion, emerging from the friction law. The bar is the bow from frog to tip, with the contact point moving along it; when the hair runs out (or on each new détaché note) the bow reverses, and the stick–slip re-forms the other way round.',
      meta: `${s.def.name} string · ${this.bow.changing ? 'bow change' : this.bow.dir > 0 ? 'down-bow' : 'up-bow'} ${(Math.abs(s.vSigned) * 100).toFixed(0)} cm/s · ${s.fBow.toFixed(2)} N · β ${s.beta.toFixed(3)} · ${Math.round((100 * this.bow.pos) / this.design.bowLength)} % from the frog`,
    };
    return {
      frame: this.frame,
      voices: this.activeVoiceCount,
      sympathetic: this.activeSympatheticCount,
      focus: {
        midi: s.midi,
        nStrings: 1,
        shapes: [shape],
        hammerAt: 1 - s.beta,
        prepAt: -1,
        lengthM: (this.design.L * s.fOpen) / et(Math.max(s.midi, s.def.open)),
        f1: et(Math.max(s.midi, s.def.open)),
        B: 0,
        damper: 0,
      },
      strike: null,
      excite,
      bow: { dir: this.bow.dir, pos: this.bow.pos / this.design.bowLength, changing: this.bow.changing, speed: s.vSigned },
      // all four strings: open note, sounding length (fraction of the open string), level, bowed
      strings: this.strings.map((x) => ({ open: x.def.open, stop: x.fOpen / et(Math.max(x.midi < 0 ? x.def.open : x.midi, x.def.open)), level: x.level, bowing: x.bowing })),
      modes: amps,
      sustain: this.sustain,
      soft: this.soft,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }
}
