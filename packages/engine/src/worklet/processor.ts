// AudioWorklet host for the instrument DSP cores. All synthesis happens here, on
// the audio rendering thread; the main thread only sends control messages.

import { createCore, type AnyParams } from '../core/factory.ts';
import type { InstrumentCore, InstrumentId } from '../core/instrument.ts';
import type { PianoCore } from '../core/piano-core.ts';
import type { ToProcessor, FromProcessor } from '../api/messages.ts';

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
}

type Core = InstrumentCore & { process: (L: Float32Array, R: Float32Array, n: number) => void };

class InstrumentProcessor extends AudioWorkletProcessor {
  private core: Core;
  private vis = false;
  private visInterval: number;
  private visCount = 0;
  private loadAcc = 0;
  private loadN = 0;
  private load = 0;
  private quantumMs = 0;
  private adaptive: boolean;
  private baseMaxVoices: number;
  private lastStrikeSerial = 0;
  private frameOffset = 0;

  constructor(options: { processorOptions?: ProcOptions }) {
    super();
    const o = options.processorOptions ?? {};
    const t0 = clock();
    this.core = createCore({ sampleRate, instrument: o.instrument, preset: o.preset, params: o.params, maxVoices: o.maxVoices ?? 64 }) as Core;
    const initMs = clock() - t0;
    this.baseMaxVoices = this.core.maxVoices;
    this.adaptive = o.adaptive !== false;
    for (const e of o.events ?? []) this.core.schedule(e.event, e.frame);
    this.visInterval = Math.max(1, Math.round(sampleRate / 128 / 30));
    this.port.onmessage = (e: MessageEvent<ToProcessor>) => this.onMessage(e.data);
    this.post({ type: 'ready', sampleRate, initMs, instrument: this.core.id, params: this.core.params as Record<string, unknown>, modeFreqs: Array.from(this.core.modeFrequencies), keys: this.core.keySummary() });
  }

  private post(m: FromProcessor): void {
    this.port.postMessage(m);
  }

  private onMessage(m: ToProcessor): void {
    switch (m.type) {
      case 'event': {
        const frame = m.time === undefined ? undefined : Math.round(m.time * sampleRate) - this.frameOffset;
        this.core.schedule(m.event, frame);
        break;
      }
      case 'params':
        this.core.setParams(m.params as Record<string, unknown>);
        if (this.core.id === 'piano') this.post({ type: 'keys', keys: this.core.keySummary() });
        break;
      case 'preset':
        if (this.core.id === 'piano') {
          (this.core as unknown as PianoCore).setPreset(m.preset);
          this.post({ type: 'preset', instrument: 'piano', preset: m.preset, params: this.core.params as Record<string, unknown>, modeFreqs: Array.from(this.core.modeFrequencies), keys: this.core.keySummary() });
        }
        break;
      case 'instrument': {
        this.core.allSoundOff();
        const frame = this.core.frame;
        this.core = createCore({ sampleRate, instrument: m.instrument, preset: m.preset, params: m.params, maxVoices: this.baseMaxVoices }) as Core;
        this.core.frame = frame;
        this.post({ type: 'preset', instrument: this.core.id, preset: m.preset ?? '', params: this.core.params as Record<string, unknown>, modeFreqs: Array.from(this.core.modeFrequencies), keys: this.core.keySummary() });
        break;
      }
      case 'vis':
        this.vis = m.enabled;
        break;
      case 'maxVoices':
        this.baseMaxVoices = m.value;
        this.core.maxVoices = m.value;
        break;
      case 'designs':
        if (this.core.id === 'piano') (this.core as unknown as PianoCore).dispCache.put(m.entries);
        break;
      case 'panic':
        this.core.allSoundOff();
        break;
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const L = out[0];
    const R = out[1] ?? out[0];
    this.frameOffset = currentFrame - this.core.frame;
    const t0 = clock();
    this.core.process(L, R, L.length);
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
      if (core.sympatheticAllowed) core.sympatheticAllowed = false;
      else if (core.maxVoices > 12) core.maxVoices = Math.max(12, Math.floor(core.maxVoices * 0.8));
    } else if (this.load < 0.35) {
      if (core.maxVoices < this.baseMaxVoices) core.maxVoices = Math.min(this.baseMaxVoices, core.maxVoices + 2);
      else if (!core.sympatheticAllowed) core.sympatheticAllowed = true;
    }
  }

  private postStats(): void {
    const core = this.core;
    const base = {
      instrument: core.id,
      load: this.load,
      voices: core.activeVoiceCount,
      sympathetic: core.activeSympatheticCount,
      maxVoices: core.maxVoices,
      sustain: core.sustain,
      soft: core.soft,
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
      modes: v.modes,
      modeFreqs: core.id === 'flute' ? Array.from(core.modeFrequencies) : undefined,
    });
  }
}

registerProcessor('piano-model', InstrumentProcessor);
