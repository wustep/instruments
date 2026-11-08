// @piano-model/engine — physically modelled acoustic piano.
//
//   const piano = await createPiano(audioContext, { preset: 'grand' });
//   piano.connect(audioContext.destination);
//   piano.noteOn(60, 90); piano.sustain(0.5); piano.noteOff(60);
//   await piano.setInstrument('cello');   // or createPiano(ctx, { instrument: 'flute' })
//
// The DSP core (PianoCore, renderCore) has no Web Audio dependency and runs in Node.

export { createPiano, createInstrument, renderOffline, type Piano, type PianoOptions } from './api/piano.ts';
export { INSTRUMENT_IDS, INSTRUMENT_INFO, type InstrumentId, type ExciteTrace } from './core/instrument.ts';
export type { BowedParams } from './core/bowed.ts';
export type { FluteParams } from './core/flute.ts';
export type { KeySummary, Stats, VisualFrame } from './api/messages.ts';
export {
  DEFAULT_PARAMS,
  PRESETS,
  PRESET_IDS,
  type PianoDesign,
  type PianoParams,
  type Preparation,
} from './core/design.ts';
export type { PianoEvent, VisualState } from './core/piano-core.ts';
export type { StrikeRecord } from './core/voice.ts';
export { midiName, nameToMidi, midiToEtHz } from './core/util.ts';
