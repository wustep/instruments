// The glockenspiel (orchestra bells): thirty steel bars, G5–C8 as they sound, struck with hard mallets and
// left to ring.
//
// A bar is a few modes, each an exact two-pole resonator set going by the stroke and left alone. The lowest
// is the pitch: the bar bending flatwise, free at both ends. What else a mallet sets going is not what a thin
// bar's theory says (1 : 2.76 : 5.40 : 8.93, Fletcher & Rossing 1998 §19.1–19.3): the mallet lands on the
// bar's middle, where the second and fourth flatwise modes have a node, and a glockenspiel's bar is a third
// as thick as it is wide, so it also bends edgewise as a thick beam (whose overtones crowd together) and
// twists. The recordings (University of Iowa MIS "Bells", C5–E8, plastic and brass mallets) show five more
// families of partials, each a smooth function of the bar's pitch: near 3.3, 7.2 and 16.4 times a C5's
// fundamental, falling slowly as the bars shorten (the reading here: edgewise bending, w/h ≈ 3.3), and near
// 4.8 and 11.3 times it, falling as 1/√f (twisting: its pitch goes as 1/L while the flatwise bending's goes
// as 1/L²). Each family's ratio, level and decay over the compass and the dynamics is the voicing
// (GLOCK_VOICE, fitted to the recordings by scripts/fit-glock.ts); the low bars carry strong high partials,
// a ting at 4–9 kHz, and the top bars are nearly a sine and a knock.
//
// The octave: the instrument sounds two octaves above where its part is written. Here a note is its
// sounding pitch, G5–C8 (MIDI 79–108); a note below that compass is read as written pitch and brought up by
// octaves into it (a note above, down), so a part typed where it is written still plays.
//
// Nothing damps a bar: a key let go changes nothing unless `damp` says the hand stops it.

import type { ExciteTrace, InstrumentCore } from './instrument.ts';
import type { KeySummary } from '../api/messages.ts';
import { BiquadChain, Limiter, Room, type Seat } from './post.ts';
import { biquadHighpass } from './filters.ts';
import type { PianoEvent } from './piano-core.ts';
import { Pump } from './pump.ts';
import { clamp, playerCents } from './util.ts';

export interface GlockParams {
  /** the mallets' heads: 0 hard rubber … 0.5 plastic (the recordings' pp–ff) … 1 brass */
  mallet: number;
  /** what a key let go does: 0 nothing (the bar rings on) … 1 the hand stops it */
  damp: number;
  room: number;
  volume: number;
  /** orchestra mode: where it stands on the stage (post.ts Seat); none, the single instrument's place */
  seat?: Seat | null;
  /** fitting only (scripts/fit-glock.ts): the voicing below, overridden */
  voice?: Partial<GlockVoice>;
}

/** the bars: 30, G5 (0) to C8 (29), as they sound */
export const GLOCK_BARS = 30;
export const GLOCK_LO = 79;
export const GLOCK_HI = 108;
/** the families of partials a bar has (the first is its pitch) */
export const GLOCK_FAMILIES = 6;

const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** A steel bar 9.5 mm thick, free at both ends, bending flatwise: f₁ = 1.028·h·√(E/ρ)/L² (Fletcher & Rossing
 *  1998 eq. 2.63 with the free bar's first root 3.0112; steel √(E/ρ) = 5050 m/s). */
const BAR_H = 0.0095;
const BAR_C = 5050;
export const GLOCK_BAR_WIDTH = 0.03175;
export const GLOCK_BAR_THICK = BAR_H;

export interface GlockBar {
  /** 0 (G5) … 29 (C8) */
  index: number;
  midi: number;
  /** its name, as it sounds (G5 … C8) */
  name: string;
  /** an accidental: on the far row */
  sharp: boolean;
  /** its length (m), from its pitch */
  length: number;
}

export function glockBars(): GlockBar[] {
  return Array.from({ length: GLOCK_BARS }, (_, i) => {
    const midi = GLOCK_LO + i;
    const pc = midi % 12;
    return { index: i, midi, name: `${NAMES[pc]}${Math.floor(midi / 12) - 1}`, sharp: [1, 3, 6, 8, 10].includes(pc), length: Math.sqrt((1.028 * BAR_H * BAR_C) / et(midi)) };
  });
}
const BARS = glockBars();

/** the bar a note is played on: its own, or (outside the compass) the one octaves away inside it */
export function glockBarOf(m: number): number {
  let p = Math.round(m);
  while (p < GLOCK_LO) p += 12;
  while (p > GLOCK_HI) p -= 12;
  return p - GLOCK_LO;
}

/** The voicing: each family's ratio to the bar's pitch, its level and its decay, as functions of the bar
 *  (octaves from C6, MIDI 84) and of the stroke (g: its level re mezzo-forte's, dB; the bar's amplitude goes as
 *  the velocity squared, velocity 75 mezzo-forte: the recordings' pp is 21 dB under their mf, velocity 22,
 *  their ff 6 dB over, velocity 106). */
export interface GlockVoice {
  /** the ratio at C6, and its exponent: ratio·2^(−ratioOct·octaves) */
  ratio: number[];
  ratioOct: number[];
  /** the level (dB; the first family's is the bar's own level at C6 mezzo-forte, the others' are re the
   *  first), per octave up, per 10 dB of the stroke's level (a harder stroke is brighter), and at a brass
   *  mallet re plastic */
  level: number[];
  levelOct: number[];
  levelDyn: number[];
  levelBrass: number[];
  /** the decay (dB/s) at C6, × per octave up, and × per octave squared (the pitch's own decay is nearly level
   *  over the low two octaves and climbs in the top one) */
  decay: number[];
  decayOct: number[];
  decayOct2: number[];
  /** the mallet's knock on the bar: its level (dB re the bar's pitch at C6 mezzo-forte), per 10 dB of the
   *  stroke's level, its pitch (Hz; and a second knock at 1.9 times it), how long it rings (s) */
  knock: number;
  knockDyn: number;
  knockF: number;
  knockTau: number;
  /** a low cut (Hz): what the bars and their case radiate below their pitches is nothing */
  hp: number;
  /** the level (dB) */
  gainDb: number;
}

/** The voicing as first wired, before any recording was looked at: a thin free bar's overtones (1 : 2.76 :
 *  5.40 : 8.93 : 13.34, Fletcher & Rossing 1998 table 2.1), the even ones weak under a mallet at the bar's
 *  middle, each dying faster than the one below. Kept as the judge's "before" (scripts/judge.ts
 *  --instrument glockenspiel --voice textbook). */
export const GLOCK_TEXTBOOK: GlockVoice = {
  ratio: [1, 2.756, 5.404, 8.933, 13.344, 18.64],
  ratioOct: [0, 0, 0, 0, 0, 0],
  level: [0, -24, -12, -32, -22, -40],
  levelOct: [0, 0, -3, -3, -5, -5],
  levelDyn: [0, 1, 1.5, 2, 2.5, 3],
  levelBrass: [0, 3, 5, 6, 8, 9],
  decay: [6, 14, 30, 50, 80, 110],
  decayOct: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5],
  decayOct2: [1, 1, 1, 1, 1, 1],
  knock: -16,
  knockDyn: 2,
  knockF: 3200,
  knockTau: 0.004,
  hp: 300,
  gainDb: -24,
};

/** The fitted voicing (scripts/fit-glock.ts: each family's ratio, level and decay regressed over the bar's
 *  pitch and the dynamic, on every second recorded bar). */
export const GLOCK_VOICE: GlockVoice = {
  ratio: [1, 3.1111, 3.8311, 6.2469, 8.0338, 14.0426],
  ratioOct: [0, 0.0849, 0.2418, 0.192, 0.559, 0.1815],
  level: [0, -30.95, -35.01, -24.01, -23.31, -33.24],
  levelOct: [1.94, -8.88, -0.83, -17.06, -23.93, 5.1],
  levelDyn: [0, 8, 0, 8, 8, 8],
  levelBrass: [0, 3.5, 0, 7.37, 0, 12],
  decay: [4.83, 92.43, 13.89, 218.28, 44.52, 59.96],
  decayOct: [1.292, 1.117, 4.113, 0.401, 1.172, 1.727],
  decayOct2: [1.341, 1, 1, 1, 1, 1],
  knock: -6,
  knockDyn: 6,
  knockF: 3200,
  knockTau: 0.004,
  hp: 300,
  gainDb: -24,
};

/** a partial this far under a hard stroke is dropped */
const QUIET = 1e-6;
/** the hand on a bar (`damp` 1): dB/s */
const STOP_RATE = 900;
/** a bar struck again while it rings keeps this much of its motion under the new stroke */
const RESTRIKE_KEEP = 0.5;
/** the velocity that is mezzo-forte */
const VEL_MF = 75;
const TRACE = 2048;
/** the strokes the pictures are told of */
const NHITS = 6;

export class GlockenspielCore implements InstrumentCore {
  readonly id = 'glockenspiel' as const;
  readonly fs: number;
  frame = 0;
  sustain = 0;
  soft = 0;
  maxVoices = GLOCK_BARS;
  sympatheticAllowed = true;
  params: GlockParams;
  private dry: boolean;
  private V: GlockVoice;
  private queue: { frame: number; ev: PianoEvent }[] = [];
  private y1 = new Float64Array(GLOCK_BARS * GLOCK_FAMILIES);
  private y2 = new Float64Array(GLOCK_BARS * GLOCK_FAMILIES);
  private c1 = new Float64Array(GLOCK_BARS * GLOCK_FAMILIES);
  private c2 = new Float64Array(GLOCK_BARS * GLOCK_FAMILIES);
  /** each bar: is it ringing, its level now and at its stroke, when it was struck, how hard, its hand's rate */
  private live = new Uint8Array(GLOCK_BARS);
  private level = new Float64Array(GLOCK_BARS);
  private peak = new Float64Array(GLOCK_BARS);
  private struckAt = new Float64Array(GLOCK_BARS).fill(-1);
  private vel = new Float64Array(GLOCK_BARS);
  private stopRate = new Float64Array(GLOCK_BARS);
  private held = new Uint8Array(GLOCK_BARS);
  private gL = new Float64Array(GLOCK_BARS);
  private gR = new Float64Array(GLOCK_BARS);
  /** the key that holds each bar's note (a key outside the compass plays a bar inside it) */
  private keyBar = new Int8Array(128).fill(-1);
  /** the mallet's knock: two short resonators */
  private k1 = new Float64Array(2);
  private k2 = new Float64Array(2);
  private kc1 = new Float64Array(2);
  private kc2 = new Float64Array(2);
  /** the two mallets: the bar each is over, and the last strokes (bar, frame, velocity, hand) */
  private hands = new Int8Array([8, 20]);
  private hitBar = new Int8Array(NHITS).fill(-1);
  private hitAt = new Float64Array(NHITS).fill(-1);
  private hitVel = new Float64Array(NHITS);
  private hitHand = new Int8Array(NHITS);
  private hitN = 0;
  private last = 5;
  private tune = 0;
  private bend = 0;
  private eq = new BiquadChain();
  private room: Room;
  private limiter: Limiter;
  private pump = new Pump(64);
  private oL = new Float64Array(64);
  private oR = new Float64Array(64);
  private buf = new Float64Array(64);
  private gain = 1;
  private tr = new Float32Array(TRACE);
  private trN = 0;
  private modeFreqs = new Float64Array(16);

  constructor(opts: { sampleRate: number; params?: Partial<GlockParams>; dry?: boolean; player?: number }) {
    this.fs = opts.sampleRate;
    this.dry = !!opts.dry;
    this.V = { ...GLOCK_VOICE, ...opts.params?.voice };
    this.params = { mallet: 0.5, damp: 0, room: 0.3, volume: 1, ...opts.params };
    this.tune = playerCents(opts.player) / 100;
    this.room = new Room(this.fs);
    this.limiter = new Limiter(this.fs);
    for (let i = 0; i < GLOCK_BARS; i++) {
      // (the low bars at the player's left: a little of the instrument's width)
      const pan = 0.22 * (i / (GLOCK_BARS - 1) - 0.5);
      this.gL[i] = 1 - pan;
      this.gR[i] = 1 + pan;
    }
    this.voiced();
    this.freqsOf(this.last);
  }

  private voiced(): void {
    const fs = this.fs;
    const V = this.V;
    this.eq.set([biquadHighpass(Math.min(0.4 * fs, V.hp), 0.7, fs)]);
    this.room.configure(this.params.room, this.params.seat);
    for (let k = 0; k < 2; k++) {
      const w = (2 * Math.PI * Math.min(0.42 * fs, V.knockF * (k ? 1.9 : 1))) / fs;
      const r = Math.exp(-1 / (Math.max(0.0005, V.knockTau) * fs));
      this.kc1[k] = 2 * r * Math.cos(w);
      this.kc2[k] = r * r;
    }
    this.gain = Math.pow(10, V.gainDb / 20) * this.params.volume;
  }

  /** a bar's pitch now (Hz) */
  private pitchOf(i: number): number {
    return et(BARS[i].midi + this.tune + this.bend);
  }
  /** a family's ratio to the pitch on bar i (0: the bar has not that family: up the compass the twisting
   *  families come down onto the edgewise ones, and within 8 % the two are one partial) */
  private ratioOf(i: number, k: number): number {
    if (k === 0) return 1;
    const V = this.V;
    const at = (q: number) => V.ratio[q] * Math.pow(2, (-V.ratioOct[q] * (BARS[i].midi - 84)) / 12);
    const r = at(k);
    if ((k === 2 || k === 4) && V.ratioOct[k] > V.ratioOct[k - 1] && r / at(k - 1) < 1.08) return 0;
    return r;
  }

  /** a bar's resonators for its pitch now (nothing is allocated) */
  private coeffs(i: number): void {
    const fs = this.fs;
    const V = this.V;
    const f1 = this.pitchOf(i);
    const oct = (BARS[i].midi - 84) / 12;
    const top = Math.min(0.46 * fs, 20000);
    const o = i * GLOCK_FAMILIES;
    for (let k = 0; k < GLOCK_FAMILIES; k++) {
      const f = f1 * this.ratioOf(i, k);
      if (!(f < top) || !(f > 0) || !(V.ratio[k] > 0)) {
        this.c1[o + k] = this.c2[o + k] = 0;
        continue;
      }
      const rate = V.decay[k] * Math.pow(V.decayOct[k], oct) * Math.pow(V.decayOct2[k], oct * oct) + this.stopRate[i];
      const r = Math.pow(10, -rate / (20 * fs));
      this.c1[o + k] = 2 * r * Math.cos((2 * Math.PI * f) / fs);
      this.c2[o + k] = r * r;
    }
  }

  private freqsOf(i: number): void {
    const f1 = this.pitchOf(i);
    this.modeFreqs.fill(0);
    for (let k = 0; k < GLOCK_FAMILIES; k++) this.modeFreqs[k] = this.V.ratio[k] > 0 ? f1 * this.ratioOf(i, k) : 0;
  }

  schedule(ev: unknown, frame?: number): void {
    const f = frame === undefined ? this.frame : Math.max(this.frame, Math.floor(frame));
    if ((ev as { type?: string }).type === 'foresee') return;
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].frame > f) i--;
    q.splice(i, 0, { frame: f, ev: ev as PianoEvent });
  }

  /** the mallet that takes a bar: the other one when the same bar is struck again, else the one that
   *  need not cross the other, else the nearer */
  private handFor(i: number): number {
    const [l, r] = this.hands;
    const lastHand = this.hitN ? this.hitHand[(this.hitN - 1) % NHITS] : 1;
    const lastBar = this.hitN ? this.hitBar[(this.hitN - 1) % NHITS] : -1;
    if (i === lastBar) return 1 - lastHand;
    if (i <= l) return 0;
    if (i >= r) return 1;
    return i - l < r - i ? 0 : i - l > r - i ? 1 : 1 - lastHand;
  }

  /** Strike a bar: each family set going from nothing (a sine from now), on top of some of what it was doing. */
  private strike(i: number, velocity: number): void {
    const V = this.V;
    const fs = this.fs;
    this.stopRate[i] = 0;
    this.coeffs(i);
    // the stroke's level re mezzo-forte's (dB): the amplitude as the velocity squared
    const g = 40 * Math.log10(clamp(velocity, 1, 127) / VEL_MF);
    const d = g / 10;
    const oct = (BARS[i].midi - 84) / 12;
    const brass = clamp((this.params.mallet - 0.5) * 2, -1, 1);
    const A = Math.pow(10, (V.level[0] + V.levelOct[0] * oct + g) / 20);
    const f1 = this.pitchOf(i);
    const o = i * GLOCK_FAMILIES;
    const keep = this.live[i] ? RESTRIKE_KEEP : 0;
    for (let k = 0; k < GLOCK_FAMILIES; k++) {
      if (this.c2[o + k] === 0) {
        this.y1[o + k] = this.y2[o + k] = 0;
        continue;
      }
      const a = k === 0 ? A : A * Math.pow(10, (V.level[k] + V.levelOct[k] * oct + V.levelDyn[k] * d + V.levelBrass[k] * brass) / 20);
      const w = (2 * Math.PI * f1 * this.ratioOf(i, k)) / fs;
      const r = Math.sqrt(this.c2[o + k]) || 1;
      this.y1[o + k] = keep * this.y1[o + k] - (a * Math.sin(w)) / r;
      this.y2[o + k] = keep * this.y2[o + k] - (a * Math.sin(2 * w)) / (r * r);
    }
    this.live[i] = 1;
    this.peak[i] = 0;
    this.level[i] = A;
    this.struckAt[i] = this.frame;
    this.vel[i] = velocity;
    this.last = i;
    this.trN = 0;
    this.freqsOf(i);
    // the knock: harder, louder and (a brass head) more of it
    const kn = Math.pow(10, (V.level[0] + V.knock + V.knockDyn * d + 4 * brass) / 20);
    this.k1[0] += kn;
    this.k1[1] += 0.6 * kn;
    const hand = this.handFor(i);
    this.hands[hand] = i;
    const h = this.hitN % NHITS;
    this.hitBar[h] = i;
    this.hitAt[h] = this.frame;
    this.hitVel[h] = velocity;
    this.hitHand[h] = hand;
    this.hitN++;
  }

  private apply(ev: PianoEvent): void {
    switch (ev.type) {
      case 'noteOn': {
        if (ev.velocity <= 0) return this.release(ev.midi);
        const m = Math.round(ev.midi);
        const i = glockBarOf(m);
        this.strike(i, ev.velocity);
        if (m >= 0 && m < 128) this.keyBar[m] = i;
        this.held[i] = 1;
        break;
      }
      case 'noteOff':
        this.release(ev.midi);
        break;
      case 'sustain':
        // (a pedal held lets everything ring whatever `damp` says; let go, the bars no key holds are stopped)
        this.sustain = clamp(ev.value, 0, 1);
        if (this.sustain < 0.5 && this.params.damp > 0) for (let i = 0; i < GLOCK_BARS; i++) if (!this.held[i] && this.live[i]) this.stop(i);
        break;
      case 'bend':
        this.bend = clamp(ev.value, -12, 12);
        for (let i = 0; i < GLOCK_BARS; i++) if (this.live[i]) this.coeffs(i);
        break;
      case 'allNotesOff':
        this.allSoundOff();
        break;
      default:
        break;
    }
  }

  private release(midi: number): void {
    const m = Math.round(midi);
    if (m < 0 || m > 127) return;
    const i = this.keyBar[m];
    if (i < 0) return;
    this.keyBar[m] = -1;
    this.held[i] = 0;
    if (this.params.damp > 0 && this.sustain < 0.5 && this.live[i]) this.stop(i);
  }

  /** the hand on a bar (`damp` 0 … 1: how firmly) */
  private stop(i: number, damp = this.params.damp): void {
    if (!(damp > 0)) return;
    this.stopRate[i] = STOP_RATE * damp * damp;
    this.coeffs(i);
  }

  setParams(p: Record<string, unknown>): void {
    const old = this.params;
    this.params = { ...old, ...(p as Partial<GlockParams>) };
    if (this.params.voice !== old.voice) {
      this.V = { ...GLOCK_VOICE, ...this.params.voice };
      this.voiced();
      for (let i = 0; i < GLOCK_BARS; i++) if (this.live[i]) this.coeffs(i);
    } else if (this.params.room !== old.room || this.params.volume !== old.volume) this.voiced();
    else if (this.params.seat !== old.seat) this.room.configure(this.params.room, this.params.seat);
  }

  /** the bars ringing (their sounding pitches), loudest first */
  sounding(): number[] {
    const out: number[] = [];
    const ls: number[] = [];
    for (let i = 0; i < GLOCK_BARS; i++)
      if (this.live[i] && this.peak[i] > 0 && this.level[i] > 0.05 * this.peak[i] && this.level[i] > 2e-4) {
        out.push(BARS[i].midi);
        ls.push(this.level[i]);
      }
    if (out.length < 2) return out;
    return out.map((m, k) => [m, ls[k]] as const).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }

  allSoundOff(): void {
    this.y1.fill(0);
    this.y2.fill(0);
    this.live.fill(0);
    this.level.fill(0);
    this.peak.fill(0);
    this.held.fill(0);
    this.stopRate.fill(0);
    this.keyBar.fill(-1);
    this.struckAt.fill(-1);
    this.k1.fill(0);
    this.k2.fill(0);
    this.room.reset();
    this.eq.reset();
    this.limiter.reset();
  }

  get activeVoiceCount(): number {
    let n = 0;
    for (let i = 0; i < GLOCK_BARS; i++) n += this.live[i];
    return n;
  }
  get activeSympatheticCount(): number {
    return 0;
  }
  get modeFrequencies(): Float64Array {
    return this.modeFreqs;
  }

  /** Render `frames` samples into outL/outR. Internal blocks (≤ 64, cut at events) do not depend on `frames`
   *  (see Pump). */
  process(outL: Float32Array | Float64Array, outR: Float32Array | Float64Array, frames: number): void {
    this.pump.pull(outL, outR, frames, (L, R) => {
      const q = this.queue;
      while (q.length && q[0].frame <= this.frame) this.apply(q.shift()!.ev);
      let n = 64;
      if (q.length) n = Math.max(1, Math.min(n, q[0].frame - this.frame));
      this.render(n);
      for (let t = 0; t < n; t++) {
        L[t] = this.oL[t];
        R[t] = this.oR[t];
      }
      return n;
    });
  }

  /** the frame now leaving process() */
  get outputFrame(): number {
    return this.frame - this.pump.pending;
  }

  private render(n: number): void {
    const dt = n / this.fs;
    const oL = this.oL;
    const oR = this.oR;
    const buf = this.buf;
    for (let t = 0; t < n; t++) oL[t] = oR[t] = 0;
    const y1 = this.y1;
    const y2 = this.y2;
    const c1 = this.c1;
    const c2 = this.c2;
    for (let i = 0; i < GLOCK_BARS; i++) {
      if (!this.live[i]) continue;
      const o = i * GLOCK_FAMILIES;
      for (let t = 0; t < n; t++) buf[t] = 0;
      let alive = 0;
      for (let k = 0; k < GLOCK_FAMILIES; k++) {
        let u1 = y1[o + k];
        let u2 = y2[o + k];
        if (u1 === 0 && u2 === 0) continue;
        const a1 = c1[o + k];
        const a2 = c2[o + k];
        for (let t = 0; t < n; t++) {
          const u = a1 * u1 - a2 * u2;
          u2 = u1;
          u1 = u;
          buf[t] += u;
        }
        if (Math.abs(u1) + Math.abs(u2) < QUIET) u1 = u2 = 0;
        else alive = 1;
        y1[o + k] = u1;
        y2[o + k] = u2;
      }
      let pk = 0;
      const gl = this.gL[i];
      const gr = this.gR[i];
      for (let t = 0; t < n; t++) {
        const s = buf[t];
        oL[t] += gl * s;
        oR[t] += gr * s;
        const a = s < 0 ? -s : s;
        if (a > pk) pk = a;
      }
      if (i === this.last && this.trN < TRACE) for (let t = 0; t < n && this.trN < TRACE; t++) this.tr[this.trN++] = buf[t];
      this.level[i] = Math.max(pk, this.level[i] * Math.exp(-dt / 0.05));
      if (this.level[i] > this.peak[i]) this.peak[i] = this.level[i];
      if (!alive) {
        this.live[i] = 0;
        this.level[i] = 0;
        this.stopRate[i] = 0;
        this.struckAt[i] = -1;
      }
    }
    // the mallet's knock
    for (let k = 0; k < 2; k++) {
      let u1 = this.k1[k];
      let u2 = this.k2[k];
      if (u1 === 0 && u2 === 0) continue;
      const a1 = this.kc1[k];
      const a2 = this.kc2[k];
      for (let t = 0; t < n; t++) {
        const u = a1 * u1 - a2 * u2;
        u2 = u1;
        u1 = u;
        oL[t] += u;
        oR[t] += u;
      }
      if (Math.abs(u1) + Math.abs(u2) < QUIET) u1 = u2 = 0;
      this.k1[k] = u1;
      this.k2[k] = u2;
    }
    const gn = this.gain;
    for (let t = 0; t < n; t++) {
      oL[t] *= gn;
      oR[t] *= gn;
    }
    this.eq.process(oL, oR, n);
    if (!this.dry) {
      this.room.process(oL, oR, n, 1, this.params.room * 0.7);
      this.limiter.process(oL, oR, n);
    }
    this.frame += n;
  }

  keySummary(): KeySummary[] {
    const out: KeySummary[] = [];
    for (const b of BARS) out.push({ midi: b.midi, f1: et(b.midi), B: 0, nStrings: 1, lengthM: b.length, hasDamper: false, preparation: `a steel bar ${(b.length * 1000).toFixed(0)} mm long` } as KeySummary);
    return out;
  }

  /** each family's amplitude on a bar now */
  private ampOf(i: number, k: number): number {
    const o = i * GLOCK_FAMILIES + k;
    const c = 0.5 * this.c1[o];
    const r2 = Math.max(this.c2[o], 1e-12);
    const cw = c / Math.sqrt(r2);
    return Math.sqrt(Math.max(0, (this.y1[o] ** 2 + r2 * this.y2[o] ** 2 - 2 * c * this.y1[o] * this.y2[o]) / Math.max(1e-9, 1 - cw * cw)));
  }

  getVisual(points = 160): object {
    const i = this.last;
    const V = this.V;
    // the bar's shape: a free bar's first bending mode (its nodes 0.224 of its length from each end), as far
    // out now as its pitch's resonator is
    const o = i * GLOCK_FAMILIES;
    const now = this.live[i] ? this.y1[o] : 0;
    const shape = new Float32Array(points);
    for (let p = 0; p < points; p++) shape[p] = now * barShape(p / (points - 1));
    const modes = new Float32Array(16);
    for (let k = 0; k < GLOCK_FAMILIES; k++) modes[k] = this.live[i] ? this.ampOf(i, k) : 0;
    const len = Math.max(16, Math.min(this.trN, TRACE));
    const b = BARS[i];
    const excite: ExciteTrace = {
      title: 'Bar',
      unit: '',
      rate: this.fs,
      trace: this.tr.slice(0, len),
      caption: 'The struck bar’s sound since the mallet left it.',
      meta: `${b.name} bar · ${(b.length * 1000).toFixed(0)} mm of steel`,
    };
    // every bar's swing now (0 … 1 of a hard stroke's)
    const amp = new Float32Array(GLOCK_BARS);
    for (let s = 0; s < GLOCK_BARS; s++) {
      if (!this.live[s]) continue;
      const oct = (BARS[s].midi - 84) / 12;
      amp[s] = clamp(this.level[s] / Math.pow(10, (V.level[0] + V.levelOct[0] * oct + 9) / 20), 0, 1);
    }
    const hits: { bar: number; ago: number; vel: number; hand: number }[] = [];
    for (let k = 0; k < Math.min(this.hitN, NHITS); k++) {
      const h = (this.hitN - 1 - k) % NHITS;
      hits.push({ bar: this.hitBar[h], ago: (this.frame - this.hitAt[h]) / this.fs, vel: this.hitVel[h], hand: this.hitHand[h] });
    }
    return {
      frame: this.frame,
      voices: this.activeVoiceCount,
      sympathetic: 0,
      focus: { midi: b.midi, nStrings: 1, shapes: [shape], hammerAt: 0.5, prepAt: -1, lengthM: b.length, f1: this.pitchOf(i), B: 0, damper: 0 },
      strike: null,
      excite,
      modes,
      glock: { amp, last: i, ago: this.struckAt[i] < 0 ? -1 : (this.frame - this.struckAt[i]) / this.fs, vel: this.vel[i], hits, hands: [this.hands[0], this.hands[1]] },
      sustain: this.sustain,
      soft: 0,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }
}

/** A free bar's first bending mode at x (0 … 1 along it), its middle at +1 (its ends go the other way, 1.64
 *  times as far; its nodes are 0.224 from each end): cosh βx + cos βx − σ(sinh βx + sin βx), β = 4.7300. */
export function barShape(x: number): number {
  const b = 4.730041;
  const s = 0.982502;
  const f = (u: number) => Math.cosh(b * u) + Math.cos(b * u) - s * (Math.sinh(b * u) + Math.sin(b * u));
  return f(clamp(x, 0, 1)) / f(0.5);
}
