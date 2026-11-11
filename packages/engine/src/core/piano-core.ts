// The piano: 88 keys of waveguide strings + felt hammers, all coupled through a
// passive bridge junction to one modal soundboard, then radiated to two close
// microphones and an optional room. Pure DSP — no Web Audio dependency — so it
// runs identically in the AudioWorklet, in Node for tests/calibration, and in
// OfflineAudioContext renders.

import { Pump } from './pump.ts';
import { DEFAULT_CALIBRATION, type Calibration } from './calibration.ts';
import {
  DEFAULT_PARAMS,
  KEY_HI,
  KEY_LO,
  NUM_KEYS,
  PRESETS,
  type KeySpec,
  type PianoDesign,
  type PianoParams,
  buildKeySpecs,
  hammerVelocity,
} from './design.ts';
import { biquadHighpass } from './filters.ts';
import { BiquadChain, Diffuser, Limiter, Room, buildEq } from './post.ts';
import { Soundboard } from './soundboard.ts';
import { clamp } from './util.ts';
import type { KeySummary } from '../api/messages.ts';
import { BK_MAX, type DesignEntry, DispersionCache, type StrikeRecord, Voice } from './voice.ts';

export type PianoEvent =
  | { type: 'noteOn'; midi: number; velocity: number; /** the harp: a string of a glissando, not a pitch (harp.ts) */ gliss?: boolean }
  | { type: 'noteOff'; midi: number }
  | { type: 'sustain'; value: number }
  | { type: 'soft'; value: number }
  | { type: 'sostenuto'; value: number }
  | { type: 'allNotesOff' }
  | { type: 'control'; cc: number; value: number }
  /** pitch bend in semitones (strings and flute; a struck piano string cannot bend) */
  | { type: 'bend'; value: number }
  /** bowed strings, winds and brass: a note to come (a file playing), scheduled at the frame it will
   *  begin: its strength, its length in seconds, and the file's dynamics over it (CC_DYNAMICS steps, on
   *  average). Nothing sounds; the bow is planned with it (bowed.ts foresee), the tongue and the breath
   *  (mono.ts) */
  | { type: 'foresee'; midi: number; velocity: number; dur: number; dyn?: number };

export interface CoreOptions {
  sampleRate: number;
  preset?: string;
  params?: Partial<PianoParams>;
  calibration?: Calibration;
  /** maximum simultaneously computed struck notes (sympathetic strings not counted) */
  maxVoices?: number;
  /** disable the room/lid/limiter (used for calibration against close-miked references) */
  dry?: boolean;
  /** precomputed dispersion designs (from computeDesigns) to skip start-up design work */
  designs?: DesignEntry[];
  /** orchestra mode: another piano of the same kind, its own hammer noise (0: the piano as it is) */
  player?: number;
}

export interface PianoShapes {
  points: number;
  midi: Int16Array;
  /** 1 = a sympathetic (undamped, not struck) string */
  light: Uint8Array;
  level: Float32Array;
  shapes: Float32Array;
}

/** one key's action and strings, for the single-key action view (PianoCore.watchMidi) */
export interface WatchKey {
  midi: number;
  /** the key is held down */
  held: boolean;
  /** its strings are sounding */
  active: boolean;
  /** damper contact: 0 lifted … 1 resting on the strings (live, including the pedals) */
  damper: number;
  hasDamper: boolean;
  /** the hammer is in flight or touching the strings right now */
  hammerActive: boolean;
  hammerContact: boolean;
  /** the latest completed strike of this key (velocity, force and felt compression over time) */
  strike: StrikeRecord | null;
  hammerMass: number;
  /** strike point as a fraction of the speaking length, and that length (m) */
  beta: number;
  lengthM: number;
  nStrings: number;
  /** the first string's displacement, agraffe → bridge (m), and its peak level */
  shape: Float32Array;
  level: number;
}

export interface VisualState {
  frame: number;
  voices: number;
  sympathetic: number;
  /** per key (A0…C8): peak level of the struck strings */
  levels?: Float32Array;
  /** per key: sympathetic (undamped, unstruck) strings' displacement relative to the loudest
   *  struck string's (recent reference, 1.5 s memory); linear, so faint strings stay faint */
  symLevels?: Float32Array;
  /** every sounding string's displacement (first string of each voice, `points` samples, agraffe → bridge) */
  pianoShapes?: PianoShapes;
  watch?: WatchKey | null;
  focus: null | {
    midi: number;
    nStrings: number;
    /** displacement along the string (m), one array per unison string */
    shapes: Float32Array[];
    hammerAt: number;
    prepAt: number;
    lengthM: number;
    f1: number;
    B: number;
    damper: number;
  };
  strike: StrikeRecord | null;
  modes: Float32Array;
  sustain: number;
  soft: number;
  /** the middle pedal: a grand's sostenuto, an upright's muffler */
  middle: number;
  gainReduction: number;
}

const RING = 8192;
const RMASK = RING - 1;
const POS_MASK = 0x3fffffff;
const LEVEL_OFF = 2e-6;
/** live make-up gain over the reference-matched calibration level */
const PLAYBACK_GAIN_DB = 6;
/** action knock: the noisy contact tick's share of the knock, fitted to the attack's 6-12 kHz
 *  burst over the sustain in the Iowa Steinway (24 notes A1-C#7 at mf and ff, half held out:
 *  mean error -0.7 dB held out). It was 0.6 while the HF path's allpass chain smeared it. */
const KNOCK_TICK = 0.3;

/** what a piano that has handed over (`handOver`) still takes: what lets its notes go */
const RELEASES = new Set<PianoEvent['type']>(['noteOff', 'sustain', 'sostenuto', 'allNotesOff']);
const letsGo = (ev: PianoEvent): boolean => RELEASES.has(ev.type) || (ev.type === 'noteOn' && ev.velocity <= 0);

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export class PianoCore {
  readonly id = 'piano' as const;
  readonly fs: number;
  design: PianoDesign;
  params: PianoParams;
  cal: Calibration;
  specs: KeySpec[] = [];
  readonly voices: Voice[] = [];
  readonly lights: Voice[] = [];
  readonly active: Voice[] = [];
  readonly board = new Soundboard();
  maxVoices: number;
  dry: boolean;
  /** another piano of the same make in an ensemble (design.ts buildKeySpecs); 0 alone */
  readonly player: number;

  /** absolute sample counter */
  frame = 0;
  sustain = 0;
  soft = 0;
  sostenutoPedal = 0;
  /** an upright's middle pedal: the practice muffler (0 up … 1 down) */
  muffler = 0;

  private queue: { frame: number; ev: PianoEvent }[] = [];
  private Az0 = new Float64Array(BK_MAX);
  private Az1 = new Float64Array(BK_MAX);
  private Az2 = new Float64Array(BK_MAX);
  private vz0 = new Float64Array(BK_MAX);
  private vz1 = new Float64Array(BK_MAX);
  private vz2 = new Float64Array(BK_MAX);
  private hf0 = new Float64Array(BK_MAX);
  private hf1 = new Float64Array(BK_MAX);
  private hf2 = new Float64Array(BK_MAX);
  private oL = new Float64Array(BK_MAX);
  private oR = new Float64Array(BK_MAX);
  private hL = new Float64Array(BK_MAX);
  private hR = new Float64Array(BK_MAX);
  private fext0 = new Float64Array(RING);
  /** action knock into the high-frequency board path (above the modal range) */
  private hx0 = new Float64Array(RING);
  private hx1 = new Float64Array(RING);
  private hx2 = new Float64Array(RING);
  private knockSeed = 0x9e3779b9;
  private pump = new Pump(BK_MAX);
  /** the frame now leaving process() (the core has rendered up to `frame`) */
  get outputFrame(): number {
    return this.frame - this.pump.pending;
  }
  /** the key the single-key action view is watching (−1: none) */
  watchMidi = -1;
  /** the stage's reference for sympathetic levels: the loudest struck displacement, recently */
  private visRef = 0;
  private visFrame = 0;
  private fext1 = new Float64Array(RING);
  private fext2 = new Float64Array(RING);
  private Bm = new Float64Array(9);
  private Mscratch = new Float64Array(9);
  private Minv = new Float64Array(9);
  private eq = new BiquadChain();
  private hfEq = new BiquadChain();
  private room: Room;
  private diffuser: Diffuser;
  private limiter: Limiter;
  private boardLevel = 0;
  private lastStruck: Voice | null = null;
  private strikeLatest: StrikeRecord | null = null;
  private modeAmps = new Float32Array(0);
  private outGain = 1;
  /** CPU guard: set by host to shed sympathetic strings under load */
  sympatheticAllowed = true;

  constructor(opts: CoreOptions) {
    this.fs = opts.sampleRate;
    if (opts.designs) this.dispCache.put(opts.designs);
    this.cal = opts.calibration ?? DEFAULT_CALIBRATION;
    this.design = PRESETS[opts.preset ?? 'grand'] ?? PRESETS.grand;
    this.params = { ...DEFAULT_PARAMS, ...this.design.defaults, ...opts.params };
    this.maxVoices = opts.maxVoices ?? 64;
    this.dry = !!opts.dry;
    this.player = opts.player ?? 0;
    for (let m = KEY_LO; m <= KEY_HI; m++) {
      this.voices.push(new Voice(m, false, opts.player));
      this.lights.push(new Voice(m, true, opts.player));
    }
    this.room = new Room(this.fs);
    this.diffuser = new Diffuser(this.fs);
    this.limiter = new Limiter(this.fs);
    this.rebuild(true);
  }

  // ---------------------------------------------------------------- setup

  readonly dispCache = new DispersionCache();
  private mobility = (w: number, zw: readonly number[]): [number, number] => this.board.mobility(w, zw);

  private configureVoice(v: Voice, i: number): void {
    v.configure(this.specs[i], this.fs, this.dispCache, this.mobility);
  }

  private rebuild(full: boolean): void {
    this.specs = buildKeySpecs(this.design, this.params, this.cal, this.player);
    if (full) {
      this.board.configure(this.design.board, this.cal, this.params.soundboardDamping, this.fs);
      this.modeAmps = new Float32Array(this.board.K);
    }
    for (let i = 0; i < NUM_KEYS; i++) {
      const v = this.voices[i];
      if (full || !v.active) this.configureVoice(v, i);
      else this.pending[i] = true;
      const l = this.lights[i];
      if (full || !l.active) this.configureVoice(l, i);
      else this.pendingLight[i] = true;
    }
    this.updatePost();
  }
  private pending: boolean[] = new Array(NUM_KEYS).fill(false);
  private pendingLight: boolean[] = new Array(NUM_KEYS).fill(false);

  private updatePost(): void {
    const eq = [...this.cal.eq, ...this.design.eq];
    this.eq.set(buildEq(eq, this.calTilt(), this.dry ? 1 : this.params.lid, this.fs));
    // high-frequency board path: gentle high-pass so the modal path owns the lows
    this.hfEq.set([biquadHighpass(this.cal.hfCross, 0.6, this.fs)]);
    this.room.configure(this.params.room, this.params.seat);
    // calibration renders (dry) match the reference recording's level; live playback adds
    // make-up gain (the limiter catches loud chords)
    this.outGain = this.cal.outputGain * this.params.volume * (this.dry ? 1 : Math.pow(10, PLAYBACK_GAIN_DB / 20));
  }

  private calTilt(): [number, number] {
    return this.cal.tilt;
  }

  /** Change preset. Silences the instrument. (Live, the worklet host changes piano without a silence:
   *  another piano takes over, `handOver`.) */
  setPreset(id: string): void {
    const d = PRESETS[id];
    if (!d) return;
    this.design = d;
    this.params = { ...this.params, ...d.defaults };
    this.allSoundOff();
    this.rebuild(true);
  }

  /** This piano's keys play nothing more (it has handed over to another: `handOver`): it keeps the
   *  notes it has until their keys and the pedals let them go, and rings out. */
  retired = false;

  /**
   * A change of piano without a silence. `next`, a piano just built, takes over from the sample now
   * leaving process(): everything scheduled is its to play, with the pedals as they stand. This piano
   * retires: it strikes nothing more, and of what was scheduled keeps what lets its notes go (the keys'
   * releases, the pedals), so each note ends where it was written to and the piano rings out. The host
   * renders both until this one has died away, giving each later event to both.
   */
  handOver(next: PianoCore): void {
    next.frame = this.outputFrame;
    next.queue = this.queue.slice();
    this.queue = this.queue.filter((e) => letsGo(e.ev));
    next.sustain = this.sustain;
    next.soft = this.soft;
    // (the middle pedal is each piano's own: a grand's sostenuto, an upright's muffler)
    if (this.sostenutoPedal > 0) next.schedule({ type: 'sostenuto', value: this.sostenutoPedal }, next.frame);
    next.watchMidi = this.watchMidi;
    next.sympatheticAllowed = this.sympatheticAllowed;
    this.retired = true;
  }

  setParams(p: Partial<PianoParams>): void {
    const old = this.params;
    this.params = { ...old, ...p };
    const np = this.params;
    if (
      np.stringStiffness !== old.stringStiffness ||
      np.unisonDetune !== old.unisonDetune ||
      np.sustain !== old.sustain
    ) {
      this.rebuild(false);
    } else if (np.hammerHardness !== old.hammerHardness) {
      this.specs = buildKeySpecs(this.design, np, this.cal, this.player);
      for (let i = 0; i < NUM_KEYS; i++) {
        this.voices[i].hK = this.specs[i].hammer.K;
        this.voices[i].spec = { ...this.voices[i].spec, hammer: this.specs[i].hammer };
      }
    }
    if (np.soundboardDamping !== old.soundboardDamping) this.board.setDamping(np.soundboardDamping);
    if (np.lid !== old.lid || np.room !== old.room || np.volume !== old.volume) this.updatePost();
    else if (np.seat !== old.seat) this.room.configure(np.room, np.seat);
  }

  setCalibration(cal: Calibration): void {
    this.cal = cal;
    this.allSoundOff();
    this.rebuild(true);
  }

  allSoundOff(): void {
    for (const v of this.active) {
      v.active = false;
      v.reset();
    }
    this.active.length = 0;
    this.board.reset();
    this.room.reset();
    this.diffuser.reset();
    this.eq.reset();
    this.limiter.reset();
    this.fext0.fill(0);
    this.fext1.fill(0);
    this.fext2.fill(0);
    for (const v of this.voices) {
      v.held = false;
      v.sostenuto = false;
    }
  }

  // ---------------------------------------------------------------- events

  /** Queue an event at an absolute frame (or immediately if omitted / in the past). */
  schedule(ev: PianoEvent, frame?: number): void {
    if (this.retired && !letsGo(ev)) return;
    const f = frame === undefined ? this.frame : Math.max(this.frame, Math.floor(frame));
    const q = this.queue;
    let i = q.length;
    while (i > 0 && q[i - 1].frame > f) i--;
    q.splice(i, 0, { frame: f, ev });
  }

  noteOn(midi: number, velocity: number): void {
    this.schedule({ type: 'noteOn', midi, velocity });
  }
  noteOff(midi: number): void {
    this.schedule({ type: 'noteOff', midi });
  }

  private apply(ev: PianoEvent): void {
    switch (ev.type) {
      case 'noteOn': {
        const i = ev.midi - KEY_LO;
        if (i < 0 || i >= NUM_KEYS) return;
        if (ev.velocity <= 0) return this.apply({ type: 'noteOff', midi: ev.midi });
        if (this.retired) return;
        const v = this.voices[i];
        if (!v.active) {
          if (this.pending[i]) {
            this.configureVoice(v, i);
            this.pending[i] = false;
          }
          this.ensureCapacity(v);
          v.reset();
          this.activate(v);
        } else if (v.stolen) {
          v.stolen = false;
          v.fade = 1;
          v.fadeStep = 0;
        }
        const l = this.lights[i];
        if (l.active) this.deactivate(l);
        v.held = true;
        v.damperTarget = 0;
        v.damper = Math.min(v.damper, 0.2); // key lifts its damper before the hammer arrives
        v.strike(ev.velocity, hammerVelocity(ev.velocity, this.cal, ev.midi), this.soft, this.frame & POS_MASK, this.design.action === 'upright', this.design.action === 'upright' ? this.muffler : 0);
        this.lastStruck = v;
        break;
      }
      case 'noteOff': {
        const i = ev.midi - KEY_LO;
        if (i < 0 || i >= NUM_KEYS) return;
        this.voices[i].held = false;
        break;
      }
      case 'sustain':
        this.sustain = clamp(ev.value, 0, 1);
        break;
      case 'soft':
        this.soft = clamp(ev.value, 0, 1);
        break;
      case 'sostenuto': {
        // the middle pedal (CC66): an upright's lowers its practice muffler (it holds no dampers)
        if (this.design.action === 'upright') {
          this.sostenutoPedal = clamp(ev.value, 0, 1);
          this.muffler = this.sostenutoPedal;
          for (const v of this.voices) v.sostenuto = false;
          break;
        }
        const was = this.sostenutoPedal >= 0.5;
        this.sostenutoPedal = clamp(ev.value, 0, 1);
        const now = this.sostenutoPedal >= 0.5;
        if (now && !was) for (const v of this.voices) v.sostenuto = v.held && v.active;
        if (!now && was) for (const v of this.voices) v.sostenuto = false;
        break;
      }
      case 'allNotesOff':
        for (const v of this.voices) v.held = false;
        this.sustain = 0;
        break;
      default:
        break;
    }
  }

  private activate(v: Voice): void {
    v.active = true;
    v.age = 0;
    this.active.push(v);
  }

  private deactivate(v: Voice): void {
    v.active = false;
    v.reset();
    const a = this.active;
    const i = a.indexOf(v);
    if (i >= 0) {
      a[i] = a[a.length - 1];
      a.pop();
    }
    const k = v.midi - KEY_LO;
    if (v.light) {
      if (this.pendingLight[k]) {
        this.configureVoice(v, k);
        this.pendingLight[k] = false;
      }
    } else if (this.pending[k]) {
      this.configureVoice(v, k);
      this.pending[k] = false;
    }
  }

  /** Voice stealing: fade the least important struck note when over the limit. */
  private ensureCapacity(incoming: Voice): void {
    let count = 0;
    for (const v of this.active) if (!v.light && !v.stolen) count++;
    while (count >= this.maxVoices) {
      let victim: Voice | null = null;
      let best = Infinity;
      for (const v of this.active) {
        if (v.light || v.stolen || v === incoming) continue;
        const score = v.level * (v.held ? 8 : 1) * (v.hActive ? 100 : 1);
        if (score < best) {
          best = score;
          victim = v;
        }
      }
      if (!victim) break;
      victim.stolen = true;
      victim.fadeStep = 1 / (0.012 * this.fs);
      count--;
    }
  }

  get activeVoiceCount(): number {
    let n = 0;
    for (const v of this.active) if (!v.light) n++;
    return n;
  }
  /** keys whose struck strings are sounding and still held (a stolen voice is not) */
  sounding(): number[] {
    const out: number[] = [];
    for (const v of this.active) if (!v.light && !v.stolen && v.held) out.push(v.midi);
    return out;
  }

  get activeSympatheticCount(): number {
    let n = 0;
    for (const v of this.active) if (v.light) n++;
    return n;
  }

  // ---------------------------------------------------------------- control rate

  private damperContact(midi: number): number {
    const x = (midi - KEY_LO) / (KEY_HI - KEY_LO);
    // dampers start to lift at ~20 % of pedal travel and clear the strings at ~60 %;
    // the heavier bass dampers need a little more travel
    const p0 = 0.14 + 0.08 * (1 - x);
    const p1 = 0.56 + 0.08 * (1 - x);
    return 1 - smoothstep(p0, p1, this.sustain);
  }

  private controlUpdate(Bk: number): void {
    const fs = this.fs;
    const sym = this.params.sympathetic && this.sympatheticAllowed;
    const boardActive = this.boardLevel > 1e-9;
    for (let i = 0; i < NUM_KEYS; i++) {
      const v = this.voices[i];
      const spec = this.specs[i];
      const free = !spec.hasDamper || v.held || v.sostenuto;
      const target = free ? 0 : this.damperContact(spec.midi);
      const x = i / (NUM_KEYS - 1);
      if (v.active) {
        v.damperTarget = target;
        const prev = v.damper;
        const tau = target < v.damper ? 0.003 : 0.012 + 0.03 * (1 - x);
        v.damper += (target - v.damper) * (1 - Math.exp(-Bk / (tau * fs)));
        if (prev < 0.35 && v.damper >= 0.35) {
          v.startDamperNoise();
          if (!v.held) this.thump(v, 0.25 * v.strikeVh);
        }
        v.applyDamper();
      }
      const l = this.lights[i];
      if (v.active) {
        if (l.active) this.deactivate(l);
        continue;
      }
      l.damperTarget = target;
      if (l.active) {
        const tau = target < l.damper ? 0.003 : 0.015 + 0.03 * (1 - x);
        l.damper += (target - l.damper) * (1 - Math.exp(-Bk / (tau * fs)));
        l.applyDamper();
        const armed = sym && target < 0.9;
        if ((!armed && l.level < 1e-7) || (l.level < 1e-9 && !boardActive && l.age > fs * 0.1) || !sym) {
          this.deactivate(l);
        }
      } else if (sym && target < 0.9 && boardActive) {
        l.reset();
        l.damper = target;
        l.applyDamper();
        this.activate(l);
      }
    }
    // stealing fades / natural end of struck notes
    for (let j = this.active.length - 1; j >= 0; j--) {
      const v = this.active[j];
      if (v.light) continue;
      if ((v.stolen && v.fade <= 0) || (!v.held && !v.hActive && v.level < LEVEL_OFF && v.age > fs * 0.05)) {
        this.deactivate(v);
      }
    }
    // junction loading matrix Bm and (I + Y0·Bm)^-1
    const Bm = this.Bm;
    Bm.fill(0);
    for (const v of this.active) {
      const b = v.beta;
      const w0 = v.w0;
      const w1 = v.w1;
      const w2 = v.w2;
      Bm[0] += b * w0 * w0;
      Bm[1] += b * w0 * w1;
      Bm[2] += b * w0 * w2;
      Bm[4] += b * w1 * w1;
      Bm[5] += b * w1 * w2;
      Bm[8] += b * w2 * w2;
    }
    Bm[3] = Bm[1];
    Bm[6] = Bm[2];
    Bm[7] = Bm[5];
    const Y = this.board.Y0;
    const M = this.Mscratch;
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) {
        let s = r === c ? 1 : 0;
        for (let k = 0; k < 3; k++) s += Y[r * 3 + k] * Bm[k * 3 + c];
        M[r * 3 + c] = s;
      }
    invert3(M, this.Minv);
  }

  private thump(v: Voice, vh: number): void {
    // key bottoming on the keybed / action knock, into the frame & board:
    // a 1.6 ms thud plus (round 3) a short tick of felt-and-wood contact noise that is
    // different on every strike and also reaches the high-frequency board path (the
    // thud alone had no energy above the board's modes, so every attack was too clean).
    // Math.imul: a plain multiply of two 32-bit numbers loses the low bits in a double.
    const amp = 0.35 * Math.pow(vh, 1.5);
    const fs = this.fs;
    const len = Math.round(0.0016 * fs);
    const start = this.frame + BK_MAX + Math.round(0.0008 * fs);
    for (let t = 0; t < len; t++) {
      const f = amp * Math.sin((Math.PI * t) / len);
      const idx = (start + t) & RMASK;
      this.fext0[idx] += f * (0.35 + 0.65 * v.w0);
      this.fext1[idx] += f * (0.35 + 0.65 * v.w1);
      this.fext2[idx] += f * (0.35 + 0.65 * v.w2);
    }
    const tl = Math.round(0.004 * fs);
    const tau = 0.0005 * fs;
    let sd = (this.knockSeed = (Math.imul(this.knockSeed, 1664525) + 1013904223) >>> 0);
    for (let t = 0; t < tl; t++) {
      sd = (Math.imul(sd, 1103515245) + 12345) >>> 0;
      const n = (sd / 4294967296) * 2 - 1;
      const f = KNOCK_TICK * amp * n * Math.exp(-t / tau);
      const idx = (start + t) & RMASK;
      this.fext0[idx] += f * (0.35 + 0.65 * v.w0);
      this.fext1[idx] += f * (0.35 + 0.65 * v.w1);
      this.fext2[idx] += f * (0.35 + 0.65 * v.w2);
      this.hx0[idx] += f * v.w0;
      this.hx1[idx] += f * v.w1;
      this.hx2[idx] += f * v.w2;
    }
  }

  // ---------------------------------------------------------------- audio

  /** Render `frames` samples into outL/outR (overwrites). */
  process(outL: Float32Array | Float64Array, outR: Float32Array | Float64Array, frames: number): void {
    // internal blocks never depend on the host's (see Pump)
    this.pump.pull(outL, outR, frames, (outL2, outR2) => {
      // events due now
      const q = this.queue;
      while (q.length && q[0].frame <= this.frame) this.apply(q.shift()!.ev);
      let Bk = BK_MAX;
      if (q.length) Bk = Math.min(Bk, q[0].frame - this.frame);
      // the block's real length first: the control update (damper ramps, ages) steps by it.
      // It used to step by the length before the voices' limits, ~29 samples while ~10 were
      // rendered (an undamped treble string's loop is short), so every damper closed ~3x
      // faster than its time constant.
      for (const v of this.active) {
        const m = v.maxBlock();
        if (m < Bk) Bk = m;
      }
      if (Bk < 1) Bk = 1;
      this.controlUpdate(Bk);
      // a sympathetic string it just woke may need a shorter block still
      for (const v of this.active) {
        const m = v.maxBlock();
        if (m < Bk) Bk = m;
      }
      if (Bk < 1) Bk = 1;
      this.block(Bk);
      const L = this.oL;
      const R = this.oR;
      for (let t = 0; t < Bk; t++) {
        outL2[t] = L[t];
        outR2[t] = R[t];
      }
      return Bk;
    });
  }

  private block(Bk: number): void {
    const pos = this.frame & POS_MASK;
    const active = this.active;
    // pass 1: interior taps + bridge-incoming waves
    for (let i = 0; i < active.length; i++) {
      const v = active[i];
      if (v.hActive || v.prep || v.noiseAmp > 0) v.prePass(pos, Bk);
      v.readPass(pos, Bk);
    }
    // pass 2a: alpha and zone sums
    const Az0 = this.Az0;
    const Az1 = this.Az1;
    const Az2 = this.Az2;
    for (let t = 0; t < Bk; t++) {
      Az0[t] = 0;
      Az1[t] = 0;
      Az2[t] = 0;
    }
    for (let i = 0; i < active.length; i++) {
      const v = active[i];
      const S = v.S;
      const k2 = 2 * v.invDen;
      const w0 = v.w0;
      const w1 = v.w1;
      const w2 = v.w2;
      for (let t = 0; t < Bk; t++) {
        const a = S[t] * k2;
        S[t] = a;
        Az0[t] += w0 * a;
        Az1[t] += w1 * a;
        Az2[t] += w2 * a;
      }
    }
    // pass 2b: junction + soundboard, sample by sample
    const sb = this.board;
    const K = sb.K;
    const b0 = sb.b0;
    const b2 = sb.b2;
    const a1 = sb.a1;
    const a2 = sb.a2;
    const s1 = sb.s1;
    const s2 = sb.s2;
    const phi = sb.phi;
    const rl = sb.radL;
    const rr = sb.radR;
    const Y = sb.Y0;
    const Mi = this.Minv;
    const Bm = this.Bm;
    let H0 = sb.H0;
    let H1 = sb.H1;
    let H2 = sb.H2;
    const vz0 = this.vz0;
    const vz1 = this.vz1;
    const vz2 = this.vz2;
    const oL = this.oL;
    const oR = this.oR;
    const fe0 = this.fext0;
    const fe1 = this.fext1;
    const fe2 = this.fext2;
    let bl = 0;
    const f0 = this.frame;
    for (let t = 0; t < Bk; t++) {
      const ri = (f0 + t) & RMASK;
      const A0 = Az0[t] + fe0[ri];
      const A1 = Az1[t] + fe1[ri];
      const A2 = Az2[t] + fe2[ri];
      fe0[ri] = 0;
      fe1[ri] = 0;
      fe2[ri] = 0;
      const r0 = Y[0] * A0 + Y[1] * A1 + Y[2] * A2 + H0;
      const r1 = Y[3] * A0 + Y[4] * A1 + Y[5] * A2 + H1;
      const r2 = Y[6] * A0 + Y[7] * A1 + Y[8] * A2 + H2;
      const v0 = Mi[0] * r0 + Mi[1] * r1 + Mi[2] * r2;
      const v1 = Mi[3] * r0 + Mi[4] * r1 + Mi[5] * r2;
      const v2 = Mi[6] * r0 + Mi[7] * r1 + Mi[8] * r2;
      const F0 = A0 - (Bm[0] * v0 + Bm[1] * v1 + Bm[2] * v2);
      const F1 = A1 - (Bm[3] * v0 + Bm[4] * v1 + Bm[5] * v2);
      const F2 = A2 - (Bm[6] * v0 + Bm[7] * v1 + Bm[8] * v2);
      let h0 = 0;
      let h1 = 0;
      let h2 = 0;
      let ol = 0;
      let or = 0;
      for (let k = 0, k3 = 0; k < K; k++, k3 += 3) {
        const p0 = phi[k3];
        const p1 = phi[k3 + 1];
        const p2 = phi[k3 + 2];
        const u = p0 * F0 + p1 * F1 + p2 * F2;
        const y = b0[k] * u + s1[k];
        const ns1 = s2[k] - a1[k] * y;
        s2[k] = b2[k] * u - a2[k] * y;
        s1[k] = ns1;
        h0 += p0 * ns1;
        h1 += p1 * ns1;
        h2 += p2 * ns1;
        ol += rl[k] * y;
        or += rr[k] * y;
      }
      H0 = h0;
      H1 = h1;
      H2 = h2;
      vz0[t] = v0;
      vz1[t] = v1;
      vz2[t] = v2;
      oL[t] = ol;
      oR[t] = or;
      const av = Math.abs(v0) + Math.abs(v1) + Math.abs(v2);
      if (av > bl) bl = av;
    }
    sb.H0 = H0;
    sb.H1 = H1;
    sb.H2 = H2;
    this.boardLevel = bl;
    // pass 2c: bridge velocities per key, HF board path, phantom partials
    const hf0 = this.hf0;
    const hf1 = this.hf1;
    const hf2 = this.hf2;
    for (let t = 0; t < Bk; t++) {
      hf0[t] = 0;
      hf1[t] = 0;
      hf2[t] = 0;
    }
    const phantomOn = this.params.phantom;
    const phScale = this.cal.phantom;
    for (let i = 0; i < active.length; i++) {
      const v = active[i];
      const al = v.S;
      const vb = v.vb;
      const w0 = v.w0;
      const w1 = v.w1;
      const w2 = v.w2;
      const inv = v.invDen;
      const Yb = v.Y;
      const Yr = this.cal.hfMobility;
      const beta = v.beta;
      const doPh = phantomOn && v.phGain > 0;
      for (let t = 0; t < Bk; t++) {
        const vsb = w0 * vz0[t] + w1 * vz1[t] + w2 * vz2[t];
        vb[t] = vsb * inv + Yb * al[t];
        const F = al[t] - beta * vsb;
        const hv = Yr * F;
        hf0[t] += w0 * hv;
        hf1[t] += w1 * hv;
        hf2[t] += w2 * hv;
        if (doPh) {
          // longitudinal force ∝ slope² at the bridge, filtered by longitudinal modes
          const x = F * F * v.phCoef * v.phGain * phScale;
          const hp = x - v.phHpX + v.phHp * v.lastF;
          v.phHpX = x;
          v.lastF = hp;
          const pb = v.phB;
          const ps = v.phS;
          const y1 = pb[0] * hp + ps[0];
          ps[0] = -pb[2] * y1 + ps[1];
          ps[1] = pb[1] * hp - pb[3] * y1;
          const y2 = pb[4] * hp + ps[2];
          ps[2] = -pb[6] * y2 + ps[3];
          ps[3] = pb[5] * hp - pb[7] * y2;
          const fl = y1 + 0.6 * y2 + 0.08 * hp;
          const idx = (f0 + t + BK_MAX) & RMASK;
          fe0[idx] += w0 * fl;
          fe1[idx] += w1 * fl;
          fe2[idx] += w2 * fl;
        }
      }
    }
    // pass 3: reflections into the delay lines
    for (let i = 0; i < active.length; i++) active[i].writePass(pos, Bk);
    // thumps requested by hammers that touched the strings in this block
    for (let i = 0; i < active.length; i++) {
      const v = active[i];
      if (v.thumpPending > 0) {
        this.thump(v, v.thumpPending);
        v.thumpPending = 0;
      }
      if (v.lastStrike && v.lastStrike !== this.strikeLatest && (!this.strikeLatest || v.lastStrike.serial > this.strikeLatest.serial)) {
        this.strikeLatest = v.lastStrike;
      }
    }
    // the action knock's share of the high-frequency board path
    {
      const Yr = this.cal.hfMobility;
      for (let t = 0; t < Bk; t++) {
        const ri = (f0 + t) & RMASK;
        hf0[t] += Yr * this.hx0[ri];
        hf1[t] += Yr * this.hx1[ri];
        hf2[t] += Yr * this.hx2[ri];
        this.hx0[ri] = 0;
        this.hx1[ri] = 0;
        this.hx2[ri] = 0;
      }
    }
    // output: modal radiation + diffused HF board path
    const hL = this.hL;
    const hR = this.hR;
    const hg = this.cal.hfGain;
    for (let t = 0; t < Bk; t++) {
      hL[t] = (hf0[t] + 0.55 * hf1[t] + 0.15 * hf2[t]) * hg;
      hR[t] = (0.15 * hf0[t] + 0.55 * hf1[t] + hf2[t]) * hg;
    }
    this.hfEq.process(hL, hR, Bk);
    this.diffuser.process(hL, hR, Bk);
    const g = this.outGain;
    for (let t = 0; t < Bk; t++) {
      oL[t] = (oL[t] + hL[t]) * g;
      oR[t] = (oR[t] + hR[t]) * g;
    }
    this.eq.process(oL, oR, Bk);
    if (!this.dry) {
      const room = this.params.room;
      this.room.process(oL, oR, Bk, 1, room * 0.55);
      this.limiter.process(oL, oR, Bk);
    }
    this.frame += Bk;
    if ((this.frame & 1023) < Bk) this.board.flush();
  }

  // ---------------------------------------------------------------- inspection

  getVisual(points = 160): VisualState {
    let focus: VisualState['focus'] = null;
    const v = this.lastStruck && this.lastStruck.active ? this.lastStruck : null;
    if (v) {
      const shapes: Float32Array[] = [];
      for (let s = 0; s < v.nV; s++) {
        const a = new Float32Array(points);
        v.shape(s, this.frame & POS_MASK, a);
        shapes.push(a);
      }
      focus = {
        midi: v.midi,
        nStrings: v.nV,
        shapes,
        hammerAt: v.spec.beta,
        prepAt: v.prep ? v.prepPos : -1,
        lengthM: v.spec.L,
        f1: v.spec.f1,
        B: v.spec.B,
        damper: v.damper,
      };
    }
    this.board.modeAmplitudes(this.modeAmps);
    // per-key string levels. Struck strings: the peak of the wave leaving the string at the
    // bridge. Sympathetic strings: their real vibration, as displacement relative to the loudest
    // struck string's (recent, so a ringing pedal chord keeps its reference). The bridge wave is
    // no measure of a light string's own motion: an undamped C8 passes the board's broadband
    // motion straight through, so its wave peak read +12 dB over a struck A1 whose displacement
    // it matches only at −70 dB.
    const levels = new Float32Array(NUM_KEYS);
    const symLevels = new Float32Array(NUM_KEYS);
    const P = 24;
    const act = this.active.filter((a) => a.level > 1e-7);
    const shapes = new Float32Array(act.length * P);
    const disp = new Float32Array(act.length);
    let struckMax = 0;
    const dt = Math.max(0, this.frame - this.visFrame) / this.fs;
    this.visFrame = this.frame;
    // a snapshot catches each string somewhere in its swing; its recent peak (held ~0.2 s at the
    // stage's frame rate) is the amplitude
    const hold = Math.exp(-dt / 0.2);
    act.forEach((a, j) => {
      const sh = shapes.subarray(j * P, (j + 1) * P);
      a.shape(0, this.frame & POS_MASK, sh);
      let mx = 0;
      for (let i = 0; i < P; i++) mx = Math.max(mx, Math.abs(sh[i]));
      a.visPeak = Math.max(mx, a.visPeak * hold);
      disp[j] = a.visPeak;
      if (!a.light && a.visPeak > struckMax) struckMax = a.visPeak;
    });
    this.visRef = Math.max(struckMax, this.visRef * Math.exp(-dt / 1.5));
    const ref = Math.max(this.visRef, 1e-12);
    act.forEach((a, j) => {
      const i = a.midi - KEY_LO;
      if (i < 0 || i >= NUM_KEYS) return;
      if (a.light) symLevels[i] = Math.max(symLevels[i], disp[j] / ref);
      else levels[i] = Math.max(levels[i], a.level);
    });
    // every sounding string's shape, compactly (first string of each voice, 24 points),
    // struck strings first, so the stage can show them all moving at once
    const order = act.map((_, j) => j).sort((x, y) => Number(act[x].light) - Number(act[y].light) || disp[y] - disp[x]).slice(0, 96);
    const pianoShapes = { points: P, midi: new Int16Array(order.length), light: new Uint8Array(order.length), level: new Float32Array(order.length), shapes: new Float32Array(order.length * P) };
    order.forEach((j, k) => {
      const a = act[j];
      pianoShapes.shapes.set(shapes.subarray(j * P, (j + 1) * P), k * P);
      pianoShapes.midi[k] = a.midi;
      pianoShapes.light[k] = a.light ? 1 : 0;
      pianoShapes.level[k] = a.level;
    });
    return {
      frame: this.frame,
      voices: this.activeVoiceCount,
      sympathetic: this.activeSympatheticCount,
      levels,
      symLevels,
      pianoShapes,
      focus,
      watch: this.watchState(),
      strike: this.strikeLatest,
      modes: this.modeAmps.slice(),
      sustain: this.sustain,
      soft: this.soft,
      middle: this.sostenutoPedal,
      gainReduction: this.dry ? 1 : this.limiter.reduction,
    };
  }

  get modeFrequencies(): Float64Array {
    return this.board.freq;
  }

  private watchState(): WatchKey | null {
    const i = this.watchMidi - KEY_LO;
    if (i < 0 || i >= NUM_KEYS) return null;
    const v = this.voices[i];
    const spec = this.specs[i];
    const shape = new Float32Array(64);
    if (v.active) v.shape(0, this.frame & POS_MASK, shape);
    // an idle key's damper rests where the key and pedals put it
    const free = !spec.hasDamper || v.held || v.sostenuto;
    const damper = v.active ? v.damper : free ? 0 : this.damperContact(spec.midi);
    return {
      midi: spec.midi,
      held: v.held,
      active: v.active,
      damper,
      hasDamper: spec.hasDamper,
      hammerActive: v.hActive,
      hammerContact: v.hContact,
      strike: v.lastStrike,
      hammerMass: spec.hammer.mass,
      beta: spec.beta,
      lengthM: spec.L,
      nStrings: spec.nStrings,
      shape,
      level: v.active ? v.level : 0,
    };
  }

  keySummary(): KeySummary[] {
    return this.specs.map((s) => ({
      midi: s.midi,
      f1: s.f1,
      B: s.B,
      nStrings: s.nStrings,
      lengthM: s.L,
      hasDamper: s.hasDamper,
      preparation: s.preparation ? (s.preparation.label ?? 'object') : null,
    }));
  }
}

function invert3(m: Float64Array, out: Float64Array): void {
  const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  const id = 1 / det;
  out[0] = A * id;
  out[1] = -(b * i - c * h) * id;
  out[2] = (b * f - c * e) * id;
  out[3] = B * id;
  out[4] = (a * i - c * g) * id;
  out[5] = -(a * f - c * d) * id;
  out[6] = C * id;
  out[7] = -(a * h - b * g) * id;
  out[8] = (a * e - b * d) * id;
}
