// AudioWorklet host for the instrument DSP cores. All synthesis happens here, on
// the audio rendering thread; the main thread only sends control messages.

import { createCore, setBus, type AnyParams } from '../core/factory.ts';
import { foresees, type InstrumentCore, type InstrumentId } from '../core/instrument.ts';
import type { PianoCore } from '../core/piano-core.ts';
import { PRESETS } from '../core/design.ts';
import { Limiter } from '../core/post.ts';
import type { ToProcessor, FromProcessor } from '../api/messages.ts';
import type { DesignEntry } from '../core/voice.ts';

declare const sampleRate: number;
declare const currentFrame: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}

const clock: () => number =
  typeof (globalThis as { performance?: Performance }).performance?.now === 'function'
    ? () => (globalThis as unknown as { performance: Performance }).performance.now()
    : () => Date.now();

interface ProcOptions {
  instrument?: InstrumentId;
  preset?: string;
  params?: AnyParams;
  maxVoices?: number;
  /** pre-scheduled events (frames relative to the start), for offline renders */
  events?: { frame: number; event: unknown }[];
  adaptive?: boolean;
  /** precomputed piano filter designs (computeDesigns), so start-up does no design work here */
  designs?: DesignEntry[];
  /** orchestra mode: another player of the same instrument (factory.ts) */
  player?: number;
}

type Core = InstrumentCore & { process: (L: Float32Array, R: Float32Array, n: number) => void };

/** A piano that has handed over to another (a change of preset: `changePiano`), still ringing. `quiet`:
 *  how long its output has been silent (frames); `left`: how long it may still ring (frames); `fade`:
 *  being taken off, the frames of its fade left (−1: not) */
interface Tail {
  core: PianoCore;
  quiet: number;
  left: number;
  fade: number;
}
/** a tail is done when its output has stayed under this (−100 dBFS) for TAIL_QUIET_S */
const TAIL_SILENT = 1e-5;
const TAIL_QUIET_S = 0.25;
/** a key held on the old piano does not keep it for ever: after this long it is faded off */
const TAIL_MAX_S = 30;
const TAIL_FADE_S = 0.03;
/** the pianos still ringing at once (a kind changed back and forth: the oldest is faded off) */
const TAILS_MAX = 2;

class InstrumentProcessor extends AudioWorkletProcessor {
  private core: Core;
  private vis = false;
  private visInterval: number;
  private visCount = 0;
  private lastSounding: number[] = [];
  private loadAcc = 0;
  private loadN = 0;
  private load = 0;
  private quantumMs = 0;
  private adaptive: boolean;
  private baseMaxVoices: number;
  /** this instrument's own ceiling: the piano's is the requested polyphony, a wind's is one voice */
  private coreMaxVoices = 0;
  private lastStrikeSerial = 0;
  private frameOffset = 0;
  /** the instrument could not be built; output silence */
  private failed = false;
  /** Done with: the main thread has disposed of the engine. Nothing more is rendered and process() says
   *  so (false), so the browser stops calling it and can collect it. A node that is only disconnected is
   *  rendered for ever (process() returning true keeps it alive): every instrument taken off an
   *  Orchestra's stage, and every engine a retry replaced, stayed on the audio thread until the page was
   *  reloaded. Eight instruments put on and taken off once left the audio clock here at half speed. */
  private gone = false;
  /** every filter design received from the main thread, reused when the piano is (re)created */
  private designs = new Map<string, DesignEntry>();
  private player = 0;
  /** the mix's gain after this instrument (params.bus: an Orchestra part's share of the bus; setBus) */
  private bus = 1;
  /** pianos a change of preset retired, each rendered and added to the output until it has died away */
  private tails: Tail[] = [];
  private tailL = new Float32Array(128);
  private tailR = new Float32Array(128);
  /** over the sum while a tail rings (each piano's own limiter knows nothing of the other's level) */
  private sumLimiter: Limiter | null = null;
  private sumLimiting = false;

  private storeDesigns(entries: DesignEntry[] | undefined): void {
    if (!entries) return;
    for (const e of entries) {
      this.designs.delete(e.key);
      this.designs.set(e.key, e);
    }
    // bounded: about ten full parameter sets
    for (const k of this.designs.keys()) {
      if (this.designs.size <= 2000) break;
      this.designs.delete(k);
    }
  }

  constructor(options: { processorOptions?: ProcOptions }) {
    super();
    const o = options.processorOptions ?? {};
    const t0 = clock();
    this.port.onmessage = (e: MessageEvent<ToProcessor>) => this.onMessage(e.data);
    try {
      this.storeDesigns(o.designs);
      this.player = o.player ?? 0;
      this.core = createCore({ sampleRate, instrument: o.instrument, preset: o.preset, params: o.params, maxVoices: o.maxVoices ?? 64, designs: o.designs, player: this.player }) as Core;
    } catch (err) {
      // never fail silently: tell the main thread why, then output silence
      this.failed = true;
      this.post({ type: 'error', message: `the ${o.instrument ?? 'piano'} could not be built at ${sampleRate} Hz: ${String((err as Error)?.message ?? err)}` });
      this.core = null as unknown as Core;
      this.baseMaxVoices = o.maxVoices ?? 64;
      this.adaptive = false;
      this.visInterval = 1;
      return;
    }
    const initMs = clock() - t0;
    // the polyphony asked for, whatever the first instrument's own limit is (a page that starts on
    // the trumpet, one voice, must not leave the piano it switches to with one voice)
    this.baseMaxVoices = o.maxVoices ?? 64;
    this.coreMaxVoices = this.core.maxVoices;
    this.adaptive = o.adaptive !== false;
    for (const e of o.events ?? []) if ((e.event as { type?: string }).type !== 'foresee' || foresees(this.core.id)) this.core.schedule(e.event, e.frame);
    this.visInterval = Math.max(1, Math.round(sampleRate / 128 / 30));
    this.post({ type: 'ready', sampleRate, initMs, instrument: this.core.id, params: this.core.params as Record<string, unknown>, modeFreqs: Array.from(this.core.modeFrequencies), keys: this.core.keySummary() });
  }

  private post(m: FromProcessor): void {
    this.port.postMessage(m);
  }

  private onMessage(m: ToProcessor): void {
    if (this.failed || this.gone) return;
    switch (m.type) {
      case 'dispose':
        this.gone = true;
        // (its voices, delay lines and designs are let go with it)
        this.tails.length = 0;
        this.designs.clear();
        this.core = null as unknown as Core;
        break;
      case 'event': {
        const frame = m.time === undefined ? undefined : Math.round(m.time * sampleRate) - this.frameOffset;
        // (a note to come is for a bow to plan with: the others have no use for it)
        if (m.event.type !== 'foresee' || foresees(this.core.id)) this.core.schedule(m.event, frame);
        // (a piano still ringing after a change of piano: its keys' releases and the pedals are its too)
        for (const t of this.tails) t.core.schedule(m.event as never, frame);
        break;
      }
      case 'params': {
        // (the bus's share is the limiter's, not a parameter of the instrument)
        const { bus, ...rest } = m.params as Record<string, unknown>;
        if (typeof bus === 'number') {
          setBus(this.core, (this.bus = bus));
          for (const t of this.tails) setBus(t.core as unknown as InstrumentCore, bus);
          if (this.sumLimiter) this.sumLimiter.bus = Math.min(1, Math.max(1e-3, bus));
        }
        this.core.setParams(rest);
        if (this.core.id === 'piano') this.post({ type: 'keys', keys: this.core.keySummary() });
        break;
      }
      case 'preset':
        if (this.core.id === 'piano') {
          this.changePiano(m.preset);
          this.post({ type: 'preset', instrument: 'piano', preset: m.preset, params: this.core.params as Record<string, unknown>, modeFreqs: Array.from(this.core.modeFrequencies), keys: this.core.keySummary() });
        }
        break;
      case 'instrument': {
        this.core.allSoundOff();
        this.tails.length = 0;
        const frame = this.core.frame;
        this.storeDesigns(m.designs);
        try {
          this.core = createCore({ sampleRate, instrument: m.instrument, preset: m.preset, params: m.params, maxVoices: this.baseMaxVoices, designs: m.instrument === 'piano' ? [...this.designs.values()] : undefined, player: this.player, bus: this.bus }) as Core;
        } catch (err) {
          this.post({ type: 'error', message: `the ${m.instrument} could not be built at ${sampleRate} Hz: ${String((err as Error)?.message ?? err)}` });
          break;
        }
        this.core.frame = frame;
        this.coreMaxVoices = this.core.maxVoices;
        this.post({ type: 'preset', instrument: this.core.id, preset: m.preset ?? '', params: this.core.params as Record<string, unknown>, modeFreqs: Array.from(this.core.modeFrequencies), keys: this.core.keySummary() });
        break;
      }
      case 'vis':
        this.vis = m.enabled;
        break;
      case 'watch':
        if (this.core.id === 'piano') (this.core as unknown as PianoCore).watchMidi = m.midi;
        break;
      case 'maxVoices':
        this.baseMaxVoices = m.value;
        // the piano's polyphony; the bowed strings and the winds keep their own
        if (this.core.id === 'piano') this.core.maxVoices = this.coreMaxVoices = m.value;
        break;
      case 'designs':
        this.storeDesigns(m.entries);
        if (this.core.id === 'piano') (this.core as unknown as PianoCore).dispCache.put(m.entries);
        break;
      case 'panic':
        this.core.allSoundOff();
        this.tails.length = 0;
        break;
      case 'clearScheduled': {
        const q = (this.core as unknown as { queue?: unknown[] }).queue;
        if (q) q.length = 0;
        // (and what a piano still ringing was to let go: the notes' ends are sent again, stopFile)
        for (const t of this.tails) (t.core as unknown as { queue: unknown[] }).queue.length = 0;
        // and what a bow, or a wind player, was told is to come
        (this.core as unknown as { forget?: () => void }).forget?.();
        break;
      }
    }
  }

  /**
   * The piano's other kind (grand ↔ upright) without a silence. It used to be one piano rebuilt in
   * place, which stopped everything sounding, the room's tail included: a piece playing had a hole
   * until its next note. Now another piano is built and takes over from this sample on (every note
   * to come, the pedals as they stand: PianoCore.handOver); the one that was playing keeps the notes
   * it has, lets each go where its key is let go, and rings out through its own soundboard and room,
   * added to the output until it has died away. Nothing sounding: the same as before, a new piano.
   */
  private changePiano(preset: string): void {
    const d = PRESETS[preset];
    if (!d) return;
    const old = this.core as unknown as PianoCore;
    let next: PianoCore;
    try {
      next = createCore({ sampleRate, instrument: 'piano', preset, params: { ...old.params, ...d.defaults }, maxVoices: this.baseMaxVoices, designs: [...this.designs.values()], player: this.player, bus: this.bus }) as unknown as PianoCore;
    } catch (err) {
      this.post({ type: 'error', message: `the ${preset} piano could not be built at ${sampleRate} Hz: ${String((err as Error)?.message ?? err)}` });
      return;
    }
    old.handOver(next);
    // (the polyphony the load has it at: the new piano starts no heavier)
    next.maxVoices = old.maxVoices;
    this.core = next as unknown as Core;
    this.coreMaxVoices = this.baseMaxVoices;
    const max = Math.round(TAIL_MAX_S * sampleRate);
    this.tails.push({ core: old, quiet: 0, left: max, fade: -1 });
    // (more than two ringing: the oldest goes, over a moment)
    const fade = Math.round(TAIL_FADE_S * sampleRate);
    for (let i = 0; i < this.tails.length - TAILS_MAX; i++) if (this.tails[i].fade < 0) this.tails[i].fade = fade;
    if (!this.sumLimiter) this.sumLimiter = new Limiter(sampleRate);
    this.sumLimiter.bus = this.bus;
  }

  /** the pianos still ringing after a change of piano, added to the output; each is dropped when it has
   *  died away. Then the sum's own limiter (it does nothing under the level one piano alone is held to). */
  private mixTails(L: Float32Array, R: Float32Array): void {
    const n = L.length;
    if (this.tailL.length < n) {
      // (a host whose blocks are longer than 128: once)
      this.tailL = new Float32Array(n);
      this.tailR = new Float32Array(n);
    }
    const tl = this.tailL;
    const tr = this.tailR;
    const fadeLen = Math.round(TAIL_FADE_S * sampleRate);
    const tails = this.tails;
    for (let i = tails.length - 1; i >= 0; i--) {
      const t = tails[i];
      t.core.process(tl, tr, n);
      let pk = 0;
      for (let k = 0; k < n; k++) {
        const a = tl[k] < 0 ? -tl[k] : tl[k];
        const b = tr[k] < 0 ? -tr[k] : tr[k];
        if (a > pk) pk = a;
        if (b > pk) pk = b;
      }
      t.quiet = pk < TAIL_SILENT ? t.quiet + n : 0;
      t.left -= n;
      if (t.left <= 0 && t.fade < 0) t.fade = fadeLen;
      // (one channel out: the right, as the piano itself gives it)
      const mono = R === L;
      for (let k = 0; k < n; k++) {
        const g = t.fade < 0 ? 1 : Math.max(0, t.fade - k) / fadeLen;
        if (mono) L[k] += g * tr[k];
        else {
          L[k] += g * tl[k];
          R[k] += g * tr[k];
        }
      }
      if (t.fade >= 0) t.fade = Math.max(0, t.fade - n);
      if (t.fade === 0 || t.quiet >= TAIL_QUIET_S * sampleRate) tails.splice(i, 1);
    }
    this.sumLimiting = true;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (this.gone) {
      if (out) for (const c of out) c.fill(0);
      return false;
    }
    if (!out || out.length === 0) return true;
    if (this.failed) {
      for (const c of out) c.fill(0);
      return true;
    }
    const L = out[0];
    const R = out[1] ?? out[0];
    // the core may have rendered a little ahead of what it hands out (Pump)
    this.frameOffset = currentFrame - ((this.core as { outputFrame?: number }).outputFrame ?? this.core.frame);
    const t0 = clock();
    try {
      this.core.process(L, R, L.length);
      if (this.tails.length) this.mixTails(L, R);
      if (this.sumLimiting && this.sumLimiter) {
        // (Limiter takes any float arrays; held on until its gain is back at 1 after the last tail)
        this.sumLimiter.process(L as unknown as Float64Array, R as unknown as Float64Array, L.length);
        if (!this.tails.length && this.sumLimiter.reduction > 0.9999) {
          this.sumLimiter.reset();
          this.sumLimiting = false;
        }
      }
    } catch (err) {
      // latch: one message saying why, then silence (a throwing process() would otherwise go
      // quiet with nothing on screen, or throw again on every quantum)
      this.failed = true;
      for (const c of out) c.fill(0);
      this.post({ type: 'error', message: `the sound engine stopped: ${String((err as Error)?.message ?? err)}` });
      return true;
    }
    const dt = clock() - t0;
    if (out.length > 2) for (let c = 2; c < out.length; c++) out[c].fill(0);
    if (!this.quantumMs) this.quantumMs = (1000 * L.length) / sampleRate;
    this.loadAcc += dt;
    this.loadN++;
    // Chrome's AudioWorkletGlobalScope has no performance.now(); Date.now() has 1 ms
    // resolution, so average over ~0.34 s (128 quanta) for a usable meter
    if (this.loadN >= 128) {
      this.load = this.loadAcc / (this.loadN * this.quantumMs);
      this.loadAcc = 0;
      this.loadN = 0;
      this.adapt();
    }
    // which notes really sound (the keyboard lights those): posted as soon as it changes
    const snd = this.core.sounding();
    // (and those a piano still holds after a change of piano)
    for (const t of this.tails) for (const m of t.core.sounding()) if (!snd.includes(m)) snd.push(m);
    let same = snd.length === this.lastSounding.length;
    for (let i = 0; same && i < snd.length; i++) same = snd[i] === this.lastSounding[i];
    if (!same) {
      this.lastSounding = snd;
      this.post({ type: 'sounding', notes: snd });
    }
    if (++this.visCount >= this.visInterval) {
      this.visCount = 0;
      this.postStats();
    }
    return true;
  }

  /** Shed sympathetic strings, then polyphony, if the audio thread is running hot. */
  private adapt(): void {
    if (!this.adaptive) return;
    const core = this.core;
    if (this.load > 0.7) {
      // (a piano still ringing after a change of piano goes first)
      const t = this.tails.find((x) => x.fade < 0);
      if (t) t.fade = Math.round(TAIL_FADE_S * sampleRate);
      else if (core.sympatheticAllowed) core.sympatheticAllowed = false;
      else if (core.maxVoices > 12) core.maxVoices = Math.max(12, Math.floor(core.maxVoices * 0.8));
    } else if (this.load < 0.35) {
      if (core.maxVoices < this.coreMaxVoices) core.maxVoices = Math.min(this.coreMaxVoices, core.maxVoices + 2);
      else if (!core.sympatheticAllowed) core.sympatheticAllowed = true;
    }
  }

  private postStats(): void {
    const core = this.core;
    const base = {
      instrument: core.id,
      load: this.load,
      voices: core.activeVoiceCount + this.tails.reduce((s, t) => s + t.core.activeVoiceCount, 0),
      sympathetic: core.activeSympatheticCount + this.tails.reduce((s, t) => s + t.core.activeSympatheticCount, 0),
      maxVoices: core.maxVoices,
      sustain: core.sustain,
      soft: core.soft,
      // the pianos' middle pedal (a grand's sostenuto, an upright's muffler)
      middle: 'sostenutoPedal' in core ? (core.sostenutoPedal as number) : 0,
    };
    if (!this.vis) {
      this.post({ type: 'stats', ...base });
      return;
    }
    const v = core.getVisual(192) as {
      gainReduction: number;
      focus: never;
      strike: { serial: number } | null;
      excite?: never;
      bow?: never;
      modes: Float32Array;
    };
    const strike = v.strike && v.strike.serial !== this.lastStrikeSerial ? v.strike : null;
    if (strike) this.lastStrikeSerial = strike.serial;
    this.post({
      type: 'visual',
      ...base,
      gainReduction: v.gainReduction,
      focus: v.focus,
      strike: strike as never,
      excite: v.excite ?? null,
      bow: v.bow ?? null,
      modes: v.modes,
      levels: (v as { levels?: Float32Array }).levels,
      symLevels: (v as { symLevels?: Float32Array }).symLevels,
      pianoShapes: (v as { pianoShapes?: never }).pianoShapes,
      watch: (v as { watch?: never }).watch,
      breath: (v as { breath?: never }).breath,
      reed: (v as { reed?: never }).reed,
      lips: (v as { lips?: never }).lips,
      timpani: (v as { timpani?: never }).timpani,
      harp: (v as { harp?: never }).harp,
      glock: (v as { glock?: never }).glock,
      trombone: (v as { trombone?: never }).trombone,
      strings: (v as { strings?: never }).strings,
      modeFreqs: core.id === 'flute' || core.id === 'oboe' || core.id === 'clarinet' || core.id === 'bassoon' || core.id === 'horn' || core.id === 'trombone' || core.id === 'tuba' || core.id === 'timpani' || core.id === 'harp' || core.id === 'glockenspiel' ? Array.from(core.modeFrequencies) : undefined,
    });
  }
}

registerProcessor('piano-model', InstrumentProcessor);
