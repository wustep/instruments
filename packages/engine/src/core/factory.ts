// Create any instrument core by id.

import { BowedCore, type BowedParams } from './bowed.ts';
import { FluteCore, type FluteParams } from './flute.ts';
import { oversampled } from './oversample.ts';
import { OboeCore, type OboeParams } from './oboe.ts';
import { ClarinetCore, type ClarinetParams } from './clarinet.ts';
import { BassoonCore, type BassoonParams } from './bassoon.ts';
import { TrumpetCore, type TrumpetParams } from './brass.ts';
import { HornCore, type HornParams } from './horn.ts';
import { TromboneCore, type TromboneParams } from './trombone.ts';
import { TubaCore, type TubaParams } from './tuba.ts';
import { HarpCore, type HarpParams } from './harp.ts';
import { GlockenspielCore, type GlockParams } from './glockenspiel.ts';
import { TimpaniCore, type TimpaniParams } from './timpani.ts';
import { type InstrumentCore, type InstrumentId } from './instrument.ts';
import { PianoCore, type CoreOptions } from './piano-core.ts';
import type { PianoParams } from './design.ts';

export type AnyParams = Partial<PianoParams> | Partial<BowedParams> | Partial<FluteParams> | Partial<OboeParams> | Partial<ClarinetParams> | Partial<BassoonParams> | Partial<HornParams> | Partial<TromboneParams> | Partial<TrumpetParams> | Partial<TubaParams> | Partial<HarpParams> | Partial<TimpaniParams>;

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
  /** the gain the mix puts on it after (an Orchestra part's share of the bus): see setBus */
  bus?: number;
}

/** The gain the mix puts on an instrument after it (an Orchestra part's share of the bus, 0…1): its own
 *  limiter works on the level that is heard (Limiter.bus). Every core keeps its limiter as `limiter`. */
export function setBus(core: InstrumentCore, g: number): void {
  const lim = (core as unknown as { limiter?: { bus: number } }).limiter;
  if (lim && Number.isFinite(g)) lim.bus = Math.min(1, Math.max(1e-3, g));
}

export function createCore(opts: InstrumentOptions): InstrumentCore & { process: PianoCore['process'] } {
  const core = makeCore(opts);
  if (opts.bus !== undefined) setBus(core, opts.bus);
  return core;
}

function makeCore(opts: InstrumentOptions): InstrumentCore & { process: PianoCore['process'] } {
  const id = opts.instrument ?? 'piano';
  switch (id) {
    case 'violin':
    case 'viola':
    case 'cello':
    case 'bass':
      return new BowedCore({ sampleRate: opts.sampleRate, instrument: id, params: opts.params as Partial<BowedParams>, dry: opts.dry, player: opts.player });
    case 'flute': {
      const make = (rate: number) => new FluteCore({ sampleRate: rate, params: opts.params as Partial<FluteParams>, dry: opts.dry, player: opts.player });
      // (under 32 kHz its top notes are too few samples long to speak: run at twice the rate, oversample.ts)
      return opts.sampleRate < 32000 ? oversampled(make, opts.sampleRate) : make(opts.sampleRate);
    }
    case 'oboe':
      return new OboeCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<OboeParams>, dry: opts.dry, player: opts.player });
    case 'clarinet':
      return new ClarinetCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<ClarinetParams>, dry: opts.dry, player: opts.player });
    case 'bassoon':
      return new BassoonCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<BassoonParams>, dry: opts.dry, player: opts.player });
    case 'horn':
      return new HornCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<HornParams>, dry: opts.dry, player: opts.player });
    case 'trombone':
      return new TromboneCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<TromboneParams>, dry: opts.dry, player: opts.player });
    case 'harp':
      return new HarpCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<HarpParams>, dry: opts.dry, player: opts.player });
    case 'glockenspiel':
      return new GlockenspielCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<GlockParams>, dry: opts.dry, player: opts.player });
    case 'tuba':
      return new TubaCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<TubaParams>, dry: opts.dry, player: opts.player });
    case 'timpani':
      return new TimpaniCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<TimpaniParams>, dry: opts.dry, player: opts.player });
    case 'trumpet':
      return new TrumpetCore({ sampleRate: opts.sampleRate, params: opts.params as Partial<TrumpetParams>, dry: opts.dry, player: opts.player });
    default:
      return new PianoCore({ sampleRate: opts.sampleRate, preset: opts.preset, params: opts.params as Partial<PianoParams>, maxVoices: opts.maxVoices, dry: opts.dry, designs: opts.designs, player: opts.player }) as unknown as InstrumentCore & { process: PianoCore['process'] };
  }
}
