// Message protocol between the main thread and the AudioWorklet processor.

import type { PianoEvent, PianoShapes, VisualState } from '../core/piano-core.ts';
import type { DesignEntry, StrikeRecord } from '../core/voice.ts';
import type { ExciteTrace, InstrumentId } from '../core/instrument.ts';

export type InstrumentEvent = PianoEvent;

export type ToProcessor =
  | { type: 'event'; event: InstrumentEvent; time?: number }
  | { type: 'params'; params: Record<string, unknown> }
  | { type: 'preset'; preset: string }
  | { type: 'instrument'; instrument: InstrumentId; preset?: string; params?: Record<string, unknown>; designs?: DesignEntry[] }
  | { type: 'vis'; enabled: boolean }
  | { type: 'maxVoices'; value: number }
  | { type: 'designs'; entries: DesignEntry[] }
  | { type: 'panic' }
  /** drop every event scheduled for the future (a paused file player) */
  | { type: 'clearScheduled' };

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
  /** the bow (strings): direction (+1 down, −1 up), contact point along the hair 0 (frog)…1 (tip) */
  bow?: { dir: number; pos: number; changing: boolean; speed: number } | null;
  modes: Float32Array;
  /** piano: per-key level of the struck strings (A0…C8) */
  levels?: Float32Array;
  /** piano: per-key displacement of sympathetically ringing strings, relative to the loudest
   *  struck string's (linear; ~0.001 for an undamped treble string under a bass note) */
  symLevels?: Float32Array;
  /** flute: breath pressure (0..1) and the breath vibrato's current deviation */
  breath?: { pressure: number; vib: number };
  /** piano: every sounding string's shape (struck first, then sympathetic) */
  pianoShapes?: PianoShapes;
  /** bowed: the four strings, low to high */
  strings?: { open: number; stop: number; stopNow?: number; level: number; bowing: boolean }[];
  /** sent when the mode set follows the note (flute bore harmonics) */
  modeFreqs?: number[];
}

export type FromProcessor =
  | { type: 'error'; message: string }
  /** the notes actually sounding, by the instrument's own allocation; posted when it changes */
  | { type: 'sounding'; notes: number[] }
  | { type: 'ready'; sampleRate: number; initMs: number; instrument: InstrumentId; params: Record<string, unknown>; modeFreqs: number[]; keys: KeySummary[] }
  | { type: 'keys'; keys: KeySummary[] }
  | { type: 'preset'; instrument: InstrumentId; preset: string; params: Record<string, unknown>; modeFreqs: number[]; keys: KeySummary[] }
  | ({ type: 'stats' } & Stats)
  | ({ type: 'visual' } & VisualFrame);
