// @piano-model/engine — physically modelled acoustic piano.
//
//   const piano = await createPiano(audioContext, { preset: 'grand' });
//   piano.connect(audioContext.destination);
//   piano.noteOn(60, 90); piano.sustain(0.5); piano.noteOff(60);
//   await piano.setInstrument('cello');   // or createPiano(ctx, { instrument: 'flute' })
//
// The DSP core (PianoCore, renderCore) has no Web Audio dependency and runs in Node.

export { createPiano, createInstrument, renderOffline, processorUrl, type Piano, type PianoOptions } from './api/piano.ts';
export { CC_DYNAMICS, CC_REST, INSTRUMENT_IDS, INSTRUMENT_INFO, isBowed, type BowedId, type Family, type InstrumentId, type ExciteTrace } from './core/instrument.ts';
export type { BowedParams } from './core/bowed.ts';
export { CC_HAND_BOW_OFF, CC_HAND_BOW_POS, CC_HAND_BOW_SPEED } from './core/bowed.ts';
export type { FluteParams } from './core/flute.ts';
export type { TrumpetParams } from './core/brass.ts';
export type { OboeParams } from './core/oboe.ts';
export type { ClarinetParams } from './core/clarinet.ts';
export type { KeySummary, Stats, VisualFrame } from './api/messages.ts';
export {
  DEFAULT_PARAMS,
  PRESETS,
  PRESET_IDS,
  type PianoDesign,
  type PianoParams,
  type Preparation,
} from './core/design.ts';
export type { PianoEvent, VisualState, WatchKey } from './core/piano-core.ts';
export type { StrikeRecord, DesignEntry } from './core/voice.ts';
export { computeDesigns } from './core/precompute.ts';
export { midiName, nameToMidi, midiToEtHz } from './core/util.ts';

// ---------------------------------------------------------------- geometry for drawing
import { DEFAULT_PARAMS as _DP, PRESETS as _PR, buildKeySpecs as _bks } from './core/design.ts';
import { BOWED as _BOWED } from './core/bowed.ts';
import type { BowedId as _BowedId } from './core/instrument.ts';
import type { KeySummary as _KS } from './api/messages.ts';

/** Per-key strings of a piano preset (lengths, unisons, dampers), computed on the main
 *  thread without any filter design: lets a UI draw the instrument before audio starts. */
export function pianoKeySummary(preset = 'grand'): _KS[] {
  const d = _PR[preset] ?? _PR.grand;
  return _bks(d, { ..._DP, ...d.defaults }).map((s) => ({
    midi: s.midi,
    f1: s.f1,
    B: s.B,
    nStrings: s.nStrings,
    lengthM: s.L,
    hasDamper: s.hasDamper,
    preparation: s.preparation ? (s.preparation.label ?? 'object') : null,
  }));
}

/** Strings (open notes, low to high), nut–bridge length and bow length of a bowed instrument. */
export function bowedGeometry(id: _BowedId): { L: number; bowLength: number; strings: { name: string; open: number }[] } {
  const b = _BOWED[id];
  return { L: b.L, bowLength: b.bowLength, strings: b.strings.map((s) => ({ name: s.name, open: s.open })) };
}
