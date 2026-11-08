// Message protocol between the main thread and the AudioWorklet processor.

import type { PianoEvent, VisualState } from '../core/piano-core.ts';
import type { DesignEntry, StrikeRecord } from '../core/voice.ts';
import type { ExciteTrace, InstrumentId } from '../core/instrument.ts';

export type InstrumentEvent = PianoEvent;

export type ToProcessor =
  | { type: 'event'; event: InstrumentEvent; time?: number }
  | { type: 'params'; params: Record<string, unknown> }
  | { type: 'preset'; preset: string }
  | { type: 'instrument'; instrument: InstrumentId; preset?: string; params?: Record<string, unknown> }
  | { type: 'vis'; enabled: boolean }
  | { type: 'maxVoices'; value: number }
  | { type: 'designs'; entries: DesignEntry[] }
  | { type: 'panic' };

export interface KeySummary {
  midi: number;
  f1: number;
  B: number;
  nStrings: number;
  lengthM: number;
  hasDamper: boolean;
  /** piano: preparation label; strings: which string; flute: register */
  preparation: string | null;
}

export interface Stats {
  instrument: InstrumentId;
  /** fraction of the real-time budget spent in the DSP (0..1+) */
  load: number;
  voices: number;
  sympathetic: number;
  maxVoices: number;
  sustain: number;
  soft: number;
}

export interface VisualFrame extends Stats {
  gainReduction: number;
  focus: VisualState['focus'];
  strike: StrikeRecord | null;
  /** bow / jet trace for strings and flute */
  excite: ExciteTrace | null;
  modes: Float32Array;
  /** sent when the mode set follows the note (flute bore harmonics) */
  modeFreqs?: number[];
}

export type FromProcessor =
  | { type: 'ready'; sampleRate: number; initMs: number; instrument: InstrumentId; params: Record<string, unknown>; modeFreqs: number[]; keys: KeySummary[] }
  | { type: 'keys'; keys: KeySummary[] }
  | { type: 'preset'; instrument: InstrumentId; preset: string; params: Record<string, unknown>; modeFreqs: number[]; keys: KeySummary[] }
  | ({ type: 'stats' } & Stats)
  | ({ type: 'visual' } & VisualFrame);
