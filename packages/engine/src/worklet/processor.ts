// AudioWorklet host for the piano DSP core. All synthesis happens here, on the
// audio rendering thread; the main thread only sends control messages.

import { PianoCore, type PianoEvent } from '../core/piano-core.ts';
import type { PianoParams } from '../core/design.ts';
import type { ToProcessor, FromProcessor, KeySummary } from '../api/messages.ts';

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
  preset?: string;
  params?: Partial<PianoParams>;
  maxVoices?: number;
  /** pre-scheduled events (frames relative to the start), for offline renders */
  events?: { frame: number; event: PianoEvent }[];
  adaptive?: boolean;
}

class PianoProcessor extends AudioWorkletProcessor {
  private core: PianoCore;
  private vis = false;
  private visInterval: number;
  private visCount = 0;
  private loadAcc = 0;
  private loadN = 0;
  private load = 0;
  private quantumMs = 0;
  private adaptive: boolean;
  private baseMaxVoices: number;
  private overloadBlocks = 0;
  private lastStrikeSerial = 0;
  private frameOffset = 0;

  constructor(options: { processorOptions?: ProcOptions }) {
    super();
    const o = options.processorOptions ?? {};
    const t0 = clock();
    this.core = new PianoCore({ sampleRate, preset: o.preset, params: o.params, maxVoices: o.maxVoices ?? 64 });
    const initMs = clock() - t0;
    this.baseMaxVoices = this.core.maxVoices;
    this.adaptive = o.adaptive !== false;
    for (const e of o.events ?? []) this.core.schedule(e.event, e.frame);
    this.visInterval = Math.max(1, Math.round(sampleRate / 128 / 30));
    this.port.onmessage = (e: MessageEvent<ToProcessor>) => this.onMessage(e.data);
    this.post({ type: 'ready', sampleRate, initMs, modeFreqs: Array.from(this.core.modeFrequencies), keys: this.keySummary() });
  }

  private keySummary(): KeySummary[] {
    return this.core.specs.map((s) => ({
      midi: s.midi,
      f1: s.f1,
      B: s.B,
      nStrings: s.nStrings,
      lengthM: s.L,
      hasDamper: s.hasDamper,
      preparation: s.preparation ? s.preparation.label ?? 'object' : null,
    }));
  }

  private post(m: FromProcessor, transfer?: Transferable[]): void {
    this.port.postMessage(m, transfer ?? []);
  }

  private onMessage(m: ToProcessor): void {
    switch (m.type) {
      case 'event': {
        const frame = m.time === undefined ? undefined : Math.round(m.time * sampleRate) - this.frameOffset;
        this.core.schedule(m.event, frame);
        break;
      }
      case 'params':
        this.core.setParams(m.params);
        this.post({ type: 'keys', keys: this.keySummary() });
        break;
      case 'preset':
        this.core.setPreset(m.preset);
        this.post({ type: 'preset', preset: m.preset, params: this.core.params, modeFreqs: Array.from(this.core.modeFrequencies), keys: this.keySummary() });
        break;
      case 'vis':
        this.vis = m.enabled;
        break;
      case 'maxVoices':
        this.baseMaxVoices = m.value;
        this.core.maxVoices = m.value;
        break;
      case 'designs':
        this.core.dispCache.put(m.entries);
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
    if (this.loadN >= 32) {
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
      this.overloadBlocks++;
      if (core.sympatheticAllowed) core.sympatheticAllowed = false;
      else if (core.maxVoices > 12) core.maxVoices = Math.max(12, Math.floor(core.maxVoices * 0.8));
    } else if (this.load < 0.35) {
      if (core.maxVoices < this.baseMaxVoices) core.maxVoices = Math.min(this.baseMaxVoices, core.maxVoices + 2);
      else if (!core.sympatheticAllowed) core.sympatheticAllowed = true;
    }
  }

  private postStats(): void {
    const core = this.core;
    if (!this.vis) {
      this.post({
        type: 'stats',
        load: this.load,
        voices: core.activeVoiceCount,
        sympathetic: core.activeSympatheticCount,
        maxVoices: core.maxVoices,
        sustain: core.sustain,
        soft: core.soft,
      });
      return;
    }
    const v = core.getVisual(192);
    const strike = v.strike && v.strike.serial !== this.lastStrikeSerial ? v.strike : null;
    if (strike) this.lastStrikeSerial = strike.serial;
    this.post({
      type: 'visual',
      load: this.load,
      voices: v.voices,
      sympathetic: v.sympathetic,
      maxVoices: core.maxVoices,
      sustain: v.sustain,
      soft: v.soft,
      gainReduction: v.gainReduction,
      focus: v.focus,
      strike,
      modes: v.modes,
    });
  }
}

registerProcessor('piano-model', PianoProcessor);
