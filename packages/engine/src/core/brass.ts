// Trumpet (B♭): a lip reed driving a bore (Cook 1991/1992, "TBone"/STK Brass, with real
// valve fingerings). The player's lips are a mass–spring valve tuned near the note; the
// pressure difference across them (mouth − bore) moves them, the flow through the lip
// opening grows with its square (louder = brighter, by the nonlinearity, not a filter),
// and the bore is a delay loop whose round trip sets its harmonic series. The valves
// lengthen the bore; the lip tension picks which partial of it sounds, as on the real
// instrument. The bell reflects the lows and radiates the highs.

import type { KeySummary } from '../api/messages.ts';
import type { ExciteTrace, InstrumentCore } from './instrument.ts';
import { BiquadChain, Limiter, Room } from './post.ts';
import { biquadHighpass, biquadPeaking, biquadHighShelf } from './filters.ts';
import type { PianoEvent } from './piano-core.ts';
import { clamp } from './util.ts';
import tuning from './brass-tuning.json';
/** measured per-note correction (cents the bare model plays sharp; scripts/tune-trumpet.ts) */
const TUNING = tuning as Record<string, number>;

export interface TrumpetParams {
  /** blowing pressure scale */
  breath: number;
  /** lip tension: semitones above (+) or below (−) the note; far enough, the next partial speaks */
  lip: number;
  /** lip vibrato depth (fraction of the lip frequency, cents/100-ish) */
  vibrato: number;
  room: number;
  volume: number;
}

const BUF = 8192;
const TRACE = 2048;
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** concert pitch of the open B♭ trumpet's pedal (partial 1) */
const PEDAL = 46;
const PARTIALS = [2, 3, 4, 5, 6, 8, 9, 10];
const VALVES = ['open', '2', '1', '1+2', '2+3', '1+3', '1+2+3'];
/** lip resonator peak gain × (1 − r), lip tuning below the note (semitones), static opening at full blowing */
const LIP_GAIN = 0.025;
const LIP_BELOW = 0.3;
const LIP_OPEN = 0.5;
/** tube length of the open B♭ trumpet, m */
const L_OPEN = 1.48;

/** standard fingering: the fewest valves (then the lowest partial) that reach the note */
export function trumpetFingering(m: number): { partial: number; lower: number; valves: string } {
  let best = { partial: 2, lower: 0, valves: 'open' };
  let bestScore = Infinity;
  for (const n of PARTIALS)
    for (let v = 0; v <= 6; v++) {
      if (PEDAL - v + Math.round(12 * Math.log2(n)) !== m) continue;
      const score = v * 10 + n;
      if (score < bestScore) {
        bestScore = score;
        best = { partial: n, lower: v, valves: VALVES[v] };
      }
    }
  return best;
}

export class TrumpetCore implements InstrumentCore {
  readonly id = 'trumpet' as const;
  readonly fs: number;
  params: TrumpetParams;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = 1;
  sympatheticAllowed = true;
  dry: boolean;
  private queue: { frame: number; ev: PianoEvent | { type: 'control'; cc: number; value: number } }[] = [];
  private bore = new Float64Array(BUF);
  private D = 200;
  private Dtarget = 200;
  // lips: a two-pole resonator (mass–spring) on the pressure difference
  private lipF = 440;
  private lipFTarget = 440;
  private y1 = 0;
  private y2 = 0;
  private x1 = 0;
  private x2 = 0;
  private dcX = 0;
  private dcY = 0;
  private lp = 0;
  private pressure = 0;
  private pTarget = 0;
  private attackTau = 0.02;
  private vibPhase = 0;
  private expression = 1;
  private bendFactor = 1;
  private note = 70;
  private held: number[] = [];
  private velocity = 80;
  private eq = new BiquadChain();
  private room: Room;
  private limiter: Limiter;
  private oL = new Float64Array(128);
  private oR = new Float64Array(128);
  private prevOut = 0;
  private level = 0;
  private trLip = new Float32Array(TRACE);
  private trP = new Float32Array(TRACE);
  private trI = 0;
  private hist = new Float32Array(4096);
  private histI = 0;
  private modeAmps = new Float32Array(16);
  private modeFreqs = new Float64Array(16);
  private gain = 0.9;
  private noteStart = 0;

  constructor(opts: { sampleRate: number; params?: Partial<TrumpetParams>; dry?: boolean }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.params = { breath: 1, lip: 0, vibrato: 0.004, room: 0.3, volume: 1, ...opts.params };
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    this.updatePost();
    this.setNote(70, true);
  }

  private updatePost(): void {
    const fs = this.fs;
    // the bell's radiation: a rising presence region and a gentle top
    this.eq.set([biquadHighpass(120, 0.7, fs), biquadPeaking(1300, 1.0, 3, fs), biquadHighShelf(7000, -6, fs)]);
    this.room.configure(this.params.room);
  }

  private setNote(m: number, immediate: boolean): void {
    const { partial, lower } = trumpetFingering(m);
    // the bore's round trip is one period of its fundamental; the note is its n-th partial
    // the lips pull the pitch above the bore's mode; a measured table lengthens the bore
    // (and lowers the lips) so each note plays at equal temperament
    const c = Math.pow(2, (TUNING[m] ?? 0) / 1200);
    this.Dtarget = ((partial * this.fs) / et(m)) * c;
    if (immediate) this.D = this.Dtarget;
    this.lipFTarget = et(m) / c;
    if (immediate) this.lipF = this.lipFTarget;
    this.note = m;
    const fb = et(PEDAL - lower);
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
        const m = clamp(ev.midi, 52, 86);
        const legato = this.pTarget > 0 && this.held.length > 0;
        this.held = this.held.filter((x) => x !== m);
        this.held.push(m);
        this.velocity = ev.velocity;
        this.setNote(m, !legato && this.level < 1e-3);
        this.pTarget = 1;
        // tongued attacks are quick; louder ones quicker
        this.attackTau = legato ? 0.01 : 0.03 - 0.02 * (ev.velocity / 127);
        if (!legato) {
          this.vibPhase = 0;
          this.noteStart = this.frame;
        }
        break;
      }
      case 'noteOff': {
        this.held = this.held.filter((x) => x !== ev.midi);
        if (this.held.length && ev.midi === this.note) this.setNote(this.held[this.held.length - 1], false);
        else if (!this.held.length && this.sustain < 0.5) this.pTarget = 0;
        break;
      }
      case 'sustain':
        this.sustain = clamp(ev.value, 0, 1);
        if (this.sustain < 0.5 && !this.held.length) this.pTarget = 0;
        break;
      case 'control':
        if (ev.cc === 1 || ev.cc === 2 || ev.cc === 11) this.expression = 0.4 + 0.8 * clamp(ev.value, 0, 1);
        break;
      case 'bend':
        this.bendFactor = Math.pow(2, -clamp(ev.value, -12, 12) / 12);
        break;
      case 'allNotesOff':
        this.held = [];
        this.pTarget = 0;
        break;
      default:
        break;
    }
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<TrumpetParams>) };
    if (this.params.room !== old.room || this.params.volume !== old.volume) this.updatePost();
  }

  /** the one note actually sounding (a monophonic instrument: the last held key wins and a
   *  release returns to the previous held one), or none */
  sounding(): number[] {
    return this.pTarget > 0 ? [this.note] : [];
  }

  allSoundOff(): void {
    this.bore.fill(0);
    this.pressure = this.pTarget = 0;
    this.held = [];
    this.y1 = this.y2 = this.dcX = this.dcY = this.lp = 0;
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
    const k = 1 - Math.exp(-dt / (this.pTarget > this.pressure ? this.attackTau : 0.04));
    this.pressure += (this.pTarget - this.pressure) * k;
    if (this.pressure < 1e-5 && this.pTarget === 0) this.pressure = 0;
    const age = (this.frame - this.noteStart) / fs;
    this.vibPhase += 2 * Math.PI * 5.2 * dt;
    const vib = 1 + P.vibrato * clamp((age - 0.35) / 0.4, 0, 1) * Math.sin(this.vibPhase);
    const v01 = this.velocity / 127;
    // mouth pressure (normalised): louder notes blow harder
    const pMouth = this.pressure * P.breath * this.expression * (0.42 + 0.58 * v01);
    // the lips follow the note (with the player's tension offset and vibrato)
    // the lips buzz a little below the note: the bore mode just above them takes over
    const lipTarget = this.lipFTarget * Math.pow(2, (P.lip - LIP_BELOW) / 12) * vib / this.bendFactor;
    this.lipF += (lipTarget - this.lipF) * 0.2;
    const r = 0.997;
    const th = (2 * Math.PI * this.lipF) / fs;
    const a1 = -2 * r * Math.cos(th);
    const a2 = r * r;
    // peak gain LIP_GAIN/(1 - r) at every pitch
    const b0 = LIP_GAIN * 2 * Math.sin(th);
    // bell loss in the loop: higher notes lose a little more at the bell
    const lpA = 0.12 + 0.18 * clamp((this.lipF - 200) / 800, 0, 1);
    const DT = this.Dtarget * this.bendFactor;
    const bore = this.bore;
    const mask = BUF - 1;
    const oL = this.oL;
    const oR = this.oR;
    let peak = 0;
    for (let t = 0; t < n; t++) {
      this.D += (DT - this.D) * 0.003;
      const w = this.frame + t;
      const D = this.D;
      const di = Math.floor(D);
      const fr = D - di;
      const boreOut = bore[(w - di) & mask] * (1 - fr) + bore[(w - di - 1) & mask] * fr;
      // lips: driven by the pressure difference across them
      const mouth = 0.3 * pMouth;
      const dp = mouth - 0.85 * boreOut;
      // the lips: a mass–spring (all-pole resonator) driven by the varying part of the
      // pressure difference; the steady part is the static opening below. Its phase near
      // resonance is what lets a bore mode just above the lip frequency sustain the buzz.
      const dpAc = dp - this.x1 + 0.9986 * this.x2;
      this.x1 = dp;
      this.x2 = dpAc;
      const y = b0 * dpAc - a1 * this.y1 - a2 * this.y2;
      this.y2 = this.y1;
      this.y1 = y;
      // lip opening: pushed open by the mouth pressure, buzzing around that; flow grows
      // with the square of the opening (Cook's valve)
      const h = Math.min(1, Math.max(0, LIP_OPEN * Math.sqrt(Math.max(0, mouth) / 0.3) + y));
      const open = h * h;
      // flow through the opening, the rest reflected at the lips
      const lipOut = open * mouth + (1 - open) * 0.85 * boreOut;
      // DC blocker, bell loss
      const x = lipOut - this.dcX + 0.995 * this.dcY;
      this.dcX = lipOut;
      this.dcY = x;
      this.lp = (1 - lpA) * x + lpA * this.lp;
      bore[w & mask] = this.lp;
      // radiation from the bell: the highs it does not reflect
      const out = 0.55 * (boreOut - this.prevOut) * 6 + 0.45 * boreOut;
      this.prevOut = boreOut;
      oL[t] = out;
      oR[t] = 0.92 * out;
      this.trLip[this.trI] = open;
      this.trP[this.trI] = boreOut;
      this.trI = (this.trI + 1) & (TRACE - 1);
      this.hist[this.histI] = boreOut;
      this.histI = (this.histI + 1) & 4095;
      const a = Math.abs(out);
      if (a > peak) peak = a;
    }
    this.level = Math.max(peak, this.level * 0.9);
    const g = this.gain * P.volume;
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
      this.level = 0;
    }
  }

  keySummary(): KeySummary[] {
    const out: KeySummary[] = [];
    for (let m = 52; m <= 86; m++) {
      const { partial, lower, valves } = trumpetFingering(m);
      out.push({ midi: m, f1: et(m), B: 0, nStrings: 1, lengthM: L_OPEN * Math.pow(2, lower / 12), hasDamper: false, preparation: `valves ${valves}, partial ${partial}` });
    }
    return out;
  }

  getVisual(points = 160): object {
    // the standing pressure wave along the bore (lips 0 → bell 1): forward + returning wave
    const shape = new Float32Array(points);
    const D = this.D;
    const half = D / 2;
    const w = this.frame - 1;
    for (let p = 0; p < points; p++) {
      const d = (p / (points - 1)) * half;
      shape[p] = this.bore[(w - Math.round(d)) & (BUF - 1)] + this.bore[(w - Math.round(D - d)) & (BUF - 1)];
    }
    const len = Math.min(TRACE, Math.max(64, Math.round((4 * this.fs) / et(this.note))));
    const tl = new Float32Array(len);
    const tp = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const j = (this.trI - len + i + TRACE) & (TRACE - 1);
      tl[i] = this.trLip[j];
      tp[i] = this.trP[j];
    }
    // bore resonances (Goertzel over the last 4096 samples)
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
    const { partial, lower, valves } = trumpetFingering(this.note);
    const excite: ExciteTrace = {
      title: 'Lips',
      unit: '',
      rate: this.fs,
      trace: tl,
      trace2: tp,
      trace2Label: 'pressure in the mouthpiece',
      caption: 'Opening of the lips (top) as they buzz, driven by the pressure in the mouthpiece (bottom).',
      meta: `valves ${valves} · partial ${partial}`,
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
        lengthM: L_OPEN * Math.pow(2, lower / 12),
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
