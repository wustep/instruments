// Message protocol between the main thread and the AudioWorklet processor.

import type { PianoEvent, VisualState } from '../core/piano-core.ts';
import type { PianoParams } from '../core/design.ts';
import type { DesignEntry, StrikeRecord } from '../core/voice.ts';

export type ToProcessor =
  | { type: 'event'; event: PianoEvent; time?: number }
  | { type: 'params'; params: Partial<PianoParams> }
  | { type: 'preset'; preset: string }
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
  preparation: string | null;
}

export interface Stats {
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
  modes: Float32Array;
}

export type FromProcessor =
  | { type: 'ready'; sampleRate: number; initMs: number; modeFreqs: number[]; keys: KeySummary[] }
  | { type: 'keys'; keys: KeySummary[] }
  | { type: 'preset'; preset: string; params: PianoParams; modeFreqs: number[]; keys: KeySummary[] }
  | ({ type: 'stats' } & Stats)
  | ({ type: 'visual' } & VisualFrame);
