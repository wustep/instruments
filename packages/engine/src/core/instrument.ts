// Common surface of every instrument core (piano, bowed strings, flute) so the
// worklet, the main-thread API and the UI can host any of them.

import type { KeySummary } from '../api/messages.ts';

export type InstrumentId = 'piano' | 'violin' | 'viola' | 'cello' | 'flute';
export const INSTRUMENT_IDS: InstrumentId[] = ['piano', 'violin', 'viola', 'cello', 'flute'];

export const INSTRUMENT_INFO: Record<InstrumentId, { label: string; family: 'piano' | 'bowed' | 'wind'; lo: number; hi: number; blurb: string }> = {
  piano: { label: 'Piano', family: 'piano', lo: 21, hi: 108, blurb: 'Felt hammers, 2–3 stiff strings per note, a shared soundboard.' },
  violin: { label: 'Violin', family: 'bowed', lo: 55, hi: 100, blurb: 'Four strings G3–E5, bowed with stick–slip friction, on a resonant body.' },
  viola: { label: 'Viola', family: 'bowed', lo: 48, hi: 88, blurb: 'Four strings C3–A4: longer, heavier, a darker and larger body.' },
  cello: { label: 'Cello', family: 'bowed', lo: 36, hi: 81, blurb: 'Four strings C2–A3 on a big body with low air and wood resonances.' },
  flute: { label: 'Flute', family: 'wind', lo: 60, hi: 96, blurb: 'An air jet driving a resonant tube; harder blowing jumps registers.' },
};

/** Extra events beyond the piano's (continuous controllers). */
export type ControlEvent = { type: 'control'; cc: number; value: number };

/** Generic excitation trace for the "look inside" view (bow, jet). */
export interface ExciteTrace {
  title: string;
  unit: string;
  /** samples per second of the traces */
  rate: number;
  trace: Float32Array;
  trace2?: Float32Array;
  trace2Label?: string;
  caption: string;
  meta: string;
}

export interface InstrumentCore {
  readonly id: InstrumentId;
  readonly fs: number;
  frame: number;
  sustain: number;
  soft: number;
  maxVoices: number;
  sympatheticAllowed: boolean;
  readonly activeVoiceCount: number;
  readonly activeSympatheticCount: number;
  readonly modeFrequencies: Float64Array;
  readonly params: object;
  schedule(ev: unknown, frame?: number): void;
  process(L: Float32Array | Float64Array, R: Float32Array | Float64Array, n: number): void;
  setParams(p: Record<string, unknown>): void;
  allSoundOff(): void;
  getVisual(points?: number): unknown;
  keySummary(): KeySummary[];
}
