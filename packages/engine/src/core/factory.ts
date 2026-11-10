// Create any instrument core by id.

import { BowedCore, type BowedParams } from './bowed.ts';
import { FluteCore, type FluteParams } from './flute.ts';
import { OboeCore, type OboeParams } from './oboe.ts';
import { ClarinetCore, type ClarinetParams } from './clarinet.ts';
import { BassoonCore, type BassoonParams } from './bassoon.ts';
import { TrumpetCore, type TrumpetParams } from './brass.ts';
import { HornCore, type HornParams } from './horn.ts';
import { TimpaniCore, type TimpaniParams } from './timpani.ts';
import { type InstrumentCore, type InstrumentId } from './instrument.ts';
import { PianoCore, type CoreOptions } from './piano-core.ts';
import type { PianoParams } from './design.ts';

export type AnyParams = Partial<PianoParams> | Partial<BowedParams> | Partial<FluteParams> | Partial<OboeParams> | Partial<ClarinetParams> | Partial<BassoonParams> | Partial<HornParams> | Partial<TrumpetParams> | Partial<TimpaniParams>;

export interface InstrumentOptions {
  sampleRate: number;
  instrument?: InstrumentId;
  /** piano preset */
  preset?: string;
  params?: AnyParams;
  maxVoices?: number;
  dry?: boolean;
  designs?: CoreOptions['designs'];
  /** orchestra mode: a second (third…) player of the same instrument, its own random stream (0: the
   *  instrument as it is) */
  player?: number;
}

export function createCore(opts: InstrumentOptions): InstrumentCore & { process: PianoCore['process'] } {
  const id = opts.instrument ?? 'piano';
  switch (id) {
    case 'violin':
    case 'viola':
    case 'cello':
    case 'bass':
      return new BowedCore({ sampleRate: opts.sampleRate, instrument: id, params: opts.params as Partial<BowedParams>, dry: opts.dry, player: opts.player });
    case 'flute':
      return new FluteCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<FluteParams>, dry: opts.dry, player: opts.player });
    case 'oboe':
      return new OboeCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<OboeParams>, dry: opts.dry, player: opts.player });
    case 'clarinet':
      return new ClarinetCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<ClarinetParams>, dry: opts.dry, player: opts.player });
    case 'bassoon':
      return new BassoonCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<BassoonParams>, dry: opts.dry, player: opts.player });
    case 'horn':
      return new HornCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<HornParams>, dry: opts.dry, player: opts.player });
    case 'timpani':
      return new TimpaniCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<TimpaniParams>, dry: opts.dry, player: opts.player });
    case 'trumpet':
      return new TrumpetCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<TrumpetParams>, dry: opts.dry, player: opts.player });
    default:
      return new PianoCore({ sampleRate: opts.sampleRate, preset: opts.preset, params: opts.params as Partial<PianoParams>, maxVoices: opts.maxVoices, dry: opts.dry, designs: opts.designs, player: opts.player }) as unknown as InstrumentCore & { process: PianoCore['process'] };
  }
}
