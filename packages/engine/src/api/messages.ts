// Message protocol between the main thread and the AudioWorklet processor.

import type { PianoEvent, PianoShapes, VisualState, WatchKey } from '../core/piano-core.ts';
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
  /** piano: stream one key's action and strings in the visual frames (−1: stop) */
  | { type: 'watch'; midi: number }
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
  /** the pianos' middle pedal: a grand's sostenuto, an upright's practice muffler */
  middle?: number;
}

export interface VisualFrame extends Stats {
  gainReduction: number;
  focus: VisualState['focus'];
  strike: StrikeRecord | null;
  /** bow / jet trace for strings and flute */
  excite: ExciteTrace | null;
  /** the bow (strings): direction (+1 down, −1 up), contact point along the hair 0 (frog)…1 (tip);
   *  planned: the stroke under way was planned ahead (a file playing told the notes to come) */
  bow?: { dir: number; pos: number; changing: boolean; speed: number; planned?: boolean } | null;
  modes: Float32Array;
  /** piano: per-key level of the struck strings (A0…C8) */
  levels?: Float32Array;
  /** piano: per-key displacement of sympathetically ringing strings, relative to the loudest
   *  struck string's (linear; ~0.001 for an undamped treble string under a bass note) */
  symLevels?: Float32Array;
  /** flute: breath pressure (0..1) and the breath vibrato's current deviation */
  breath?: { pressure: number; vib: number };
  /** oboe, clarinet and bassoon: the reed's opening (0 shut … 1 at rest) and the blowing pressure γ (of the closing pressure) */
  reed?: { open: number; gamma: number };
  /** horn: the lips' opening (0 shut; about 1 at a loud note's widest) and the blowing pressure */
  lips?: { open: number; blow: number };
  /** trombone: its size, the slide (m out from first position on its side, now and where it is heading),
   *  the position, the valves down (1 the F valve, 2 the bass's G♭ valve), the side and the partial */
  trombone?: TromboneVisual;
  /** timpani: the drums (low to high: the player's left to right), the two mallets, the strike point */
  timpani?: TimpaniVisual;
  /** piano: the watched key's action and strings (see `watchKey`) */
  watch?: WatchKey | null;
  /** piano: every sounding string's shape (struck first, then sympathetic) */
  pianoShapes?: PianoShapes;
  /** bowed: the four strings, low to high */
  strings?: { open: number; stop: number; stopNow?: number; level: number; bowing: boolean }[];
  /** sent when the mode set follows the note (flute bore harmonics) */
  modeFreqs?: number[];
}

/** the trombone as drawn */
export interface TromboneVisual {
  size: 'alto' | 'tenor' | 'bass';
  slide: number;
  target: number;
  position: number;
  valves: number[];
  side: string;
  partial: number;
}

/** a drum of the timpani as drawn */
export interface TimpaniDrumVisual {
  /** the head's diameter (m) and its name in inches */
  d: number;
  inches: number;
  /** the pedal's range (MIDI) and the note it is tuned to */
  lo: number;
  hi: number;
  note: number;
  /** the pedal as it travels: 0 heel down (lo) … 1 toe down (hi) */
  pedal: number;
  /** how loud the head rings now (linear, the core's own scale; 0 silent) */
  level: number;
  /** seconds since it was last struck, and how hard (MIDI velocity) */
  ago: number;
  vel: number;
  /** the head's first modes, as triples (m, j, displacement in m): w(r, θ) = Σ y·J_m(j·r/a)·cos m(θ − θ₀),
   *  θ₀ the strike point (towards the player) */
  head: Float32Array;
}
export interface TimpaniVisual {
  drums: TimpaniDrumVisual[];
  /** the left and the right mallet: the drum each last struck, seconds since, how hard, and whether it is on
   *  the head now */
  hands: { drum: number; ago: number; vel: number; on: boolean }[];
  /** the strike point (fraction of the radius from the centre) */
  spot: number;
  /** the drum struck last */
  last: number;
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
