// Create any instrument core by id.

import { BowedCore, type BowedParams } from './bowed.ts';
import { FluteCore, type FluteParams } from './flute.ts';
import { TrumpetCore, type TrumpetParams } from './brass.ts';
import { type InstrumentCore, type InstrumentId } from './instrument.ts';
import { PianoCore, type CoreOptions } from './piano-core.ts';
import type { PianoParams } from './design.ts';

export type AnyParams = Partial<PianoParams> | Partial<BowedParams> | Partial<FluteParams> | Partial<TrumpetParams>;

export interface InstrumentOptions {
  sampleRate: number;
  instrument?: InstrumentId;
  /** piano preset */
  preset?: string;
  params?: AnyParams;
  maxVoices?: number;
  dry?: boolean;
  designs?: CoreOptions['designs'];
}

export function createCore(opts: InstrumentOptions): InstrumentCore & { process: PianoCore['process'] } {
  const id = opts.instrument ?? 'piano';
  switch (id) {
    case 'violin':
    case 'viola':
    case 'cello':
      return new BowedCore({ sampleRate: opts.sampleRate, instrument: id, params: opts.params as Partial<BowedParams>, dry: opts.dry });
    case 'flute':
      return new FluteCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<FluteParams>, dry: opts.dry });
    case 'trumpet':
      return new TrumpetCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<TrumpetParams>, dry: opts.dry });
    default:
      return new PianoCore({ sampleRate: opts.sampleRate, preset: opts.preset, params: opts.params as Partial<PianoParams>, maxVoices: opts.maxVoices, dry: opts.dry, designs: opts.designs }) as unknown as InstrumentCore & { process: PianoCore['process'] };
  }
}
