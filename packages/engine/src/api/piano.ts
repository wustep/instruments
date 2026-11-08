// Main-thread API: createPiano(ctx) returns a controller around the AudioWorklet node.

import processorUrl from '../worklet/processor.ts?worker&url';
import type { PianoEvent } from '../core/piano-core.ts';
import { DEFAULT_PARAMS, PRESETS, type PianoParams } from '../core/design.ts';
import { computeDesigns } from '../core/precompute.ts';
import { INSTRUMENT_INFO, type InstrumentId } from '../core/instrument.ts';
import type { FromProcessor, KeySummary, Stats, ToProcessor, VisualFrame } from './messages.ts';

export interface PianoOptions {
  /** which instrument the node hosts: 'piano' (default), 'violin', 'viola', 'cello', 'flute' */
  instrument?: InstrumentId;
  /** piano preset: 'grand' | 'upright' | 'honky-tonk' | 'prepared' */
  preset?: string;
  /** physical controls of the instrument (PianoParams, BowedParams or FluteParams) */
  params?: Record<string, unknown>;
  /** struck-note polyphony limit (sympathetic strings are extra); default 64 */
  maxVoices?: number;
  /** override the worklet module URL (non-Vite bundlers) */
  processorUrl?: string;
  /** shed load automatically if the audio thread runs hot; default true */
  adaptive?: boolean;
  /** events pre-scheduled at construction (seconds), used by offline rendering */
  events?: { time: number; event: PianoEvent }[];
}

export interface Piano {
  readonly context: BaseAudioContext;
  readonly node: AudioWorkletNode;
  /** connect this to your graph (stereo) */
  readonly output: GainNode;
  readonly sampleRate: number;
  /** per-key summary (tuning, inharmonicity, strings) for the current preset */
  readonly keys: KeySummary[];
  readonly modeFrequencies: number[];
  readonly preset: string;
  readonly instrument: InstrumentId;
  /** current physical controls (shape depends on the instrument) */
  readonly params: PianoParams & Record<string, unknown>;
  /** ms the processor spent designing filters at start-up */
  readonly initMs: number;
  noteOn(midi: number, velocity?: number, time?: number): void;
  noteOff(midi: number, time?: number): void;
  /** CC64, continuous 0..1 (half-pedalling supported) */
  sustain(value: number | boolean, time?: number): void;
  /** CC67 una corda, continuous 0..1 */
  softPedal(value: number | boolean, time?: number): void;
  /** CC66 */
  sostenuto(value: number | boolean, time?: number): void;
  allNotesOff(time?: number): void;
  /** stop all sound immediately */
  panic(): void;
  setParams(p: Record<string, unknown>): void;
  setPreset(id: string): Promise<void>;
  /** switch the instrument hosted by this node (silences it); resolves when ready */
  setInstrument(id: InstrumentId): Promise<void>;
  /** continuous controller: 1 = vibrato, 11 / 2 = expression / breath (strings, flute) */
  control(cc: number, value: number, time?: number): void;
  setMaxVoices(n: number): void;
  /** subscribe to ~30 Hz stats (load, voice counts, pedals) */
  onStats(cb: (s: Stats) => void): () => void;
  /** subscribe to ~30 Hz visual frames (string shapes, hammer force, modes); enables them */
  onVisual(cb: (v: VisualFrame) => void): () => void;
  onKeys(cb: (k: KeySummary[]) => void): () => void;
  connect(dest: AudioNode): void;
  disconnect(): void;
  dispose(): void;
}

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

function ensureModule(ctx: BaseAudioContext, url: string): Promise<void> {
  let p = loaded.get(ctx);
  if (!p) {
    p = ctx.audioWorklet.addModule(url);
    loaded.set(ctx, p);
  }
  return p;
}

const val = (v: number | boolean): number => (typeof v === 'boolean' ? (v ? 1 : 0) : v);

export async function createPiano(ctx: BaseAudioContext, opts: PianoOptions = {}): Promise<Piano> {
  await ensureModule(ctx, opts.processorUrl ?? processorUrl);
  const preset = opts.preset && PRESETS[opts.preset] ? opts.preset : 'grand';
  const instrument: InstrumentId = opts.instrument && INSTRUMENT_INFO[opts.instrument] ? opts.instrument : 'piano';
  const fs = ctx.sampleRate;
  const node = new AudioWorkletNode(ctx, 'piano-model', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      instrument,
      preset,
      params: opts.params,
      maxVoices: opts.maxVoices ?? 64,
      adaptive: opts.adaptive,
      events: (opts.events ?? []).map((e) => ({ frame: Math.round(e.time * fs), event: e.event })),
    },
  });
  const output = ctx.createGain();
  node.connect(output);

  const statsSubs = new Set<(s: Stats) => void>();
  const visSubs = new Set<(v: VisualFrame) => void>();
  const keySubs = new Set<(k: KeySummary[]) => void>();
  let presetWaiter: (() => void) | null = null;

  const state = {
    keys: [] as KeySummary[],
    modeFrequencies: [] as number[],
    preset,
    instrument,
    params: { ...DEFAULT_PARAMS, ...PRESETS[preset].defaults, ...opts.params } as PianoParams & Record<string, unknown>,
    initMs: 0,
  };

  const ready = new Promise<void>((resolve) => {
    node.port.onmessage = (e: MessageEvent<FromProcessor>) => {
      const m = e.data;
      switch (m.type) {
        case 'ready':
          state.keys = m.keys;
          state.modeFrequencies = m.modeFreqs;
          state.initMs = m.initMs;
          state.instrument = m.instrument;
          state.params = m.params as PianoParams & Record<string, unknown>;
          resolve();
          break;
        case 'keys':
          state.keys = m.keys;
          keySubs.forEach((cb) => cb(m.keys));
          break;
        case 'preset':
          state.keys = m.keys;
          state.modeFrequencies = m.modeFreqs;
          state.params = m.params as PianoParams & Record<string, unknown>;
          state.instrument = m.instrument;
          if (m.instrument === 'piano' && m.preset) state.preset = m.preset;
          keySubs.forEach((cb) => cb(m.keys));
          presetWaiter?.();
          presetWaiter = null;
          break;
        case 'stats':
          statsSubs.forEach((cb) => cb(m));
          break;
        case 'visual':
          statsSubs.forEach((cb) => cb(m));
          visSubs.forEach((cb) => cb(m));
          break;
      }
    };
  });
  await ready;

  const send = (m: ToProcessor) => node.port.postMessage(m);
  // Filter redesigns (inharmonicity, decay, preset) are computed here, off the audio
  // thread, and handed to the worklet before the change is applied.
  let gen = 0;
  const withDesigns = async (presetId: string, params: Partial<PianoParams>, then: () => void) => {
    const my = ++gen;
    const entries = await computeDesigns(presetId, params, fs, { yieldEvery: 3 });
    if (my !== gen) return;
    send({ type: 'designs', entries });
    then();
  };
  const NEEDS_DESIGN: (keyof PianoParams)[] = ['stringStiffness', 'sustain'];
  const ev = (event: PianoEvent, time?: number) => send({ type: 'event', event, time });

  const piano: Piano = {
    context: ctx,
    node,
    output,
    sampleRate: fs,
    get keys() {
      return state.keys;
    },
    get modeFrequencies() {
      return state.modeFrequencies;
    },
    get preset() {
      return state.preset;
    },
    get instrument() {
      return state.instrument;
    },
    get params() {
      return state.params;
    },
    get initMs() {
      return state.initMs;
    },
    noteOn: (midi, velocity = 80, time) => ev({ type: 'noteOn', midi, velocity }, time),
    noteOff: (midi, time) => ev({ type: 'noteOff', midi }, time),
    sustain: (v, time) => ev({ type: 'sustain', value: val(v) }, time),
    softPedal: (v, time) => ev({ type: 'soft', value: val(v) }, time),
    sostenuto: (v, time) => ev({ type: 'sostenuto', value: val(v) }, time),
    allNotesOff: (time) => ev({ type: 'allNotesOff' }, time),
    panic: () => send({ type: 'panic' }),
    setParams: (p) => {
      state.params = { ...state.params, ...p };
      const redesign = state.instrument === 'piano' && NEEDS_DESIGN.some((k) => k in p);
      if (!redesign) {
        send({ type: 'params', params: p });
        return;
      }
      // apply cheap parts now, the rest once designs are ready
      const cheap: Record<string, unknown> = { ...p };
      for (const k of NEEDS_DESIGN) delete cheap[k];
      if (Object.keys(cheap).length) send({ type: 'params', params: cheap });
      const full = { ...state.params } as Partial<PianoParams>;
      void withDesigns(state.preset, full, () => send({ type: 'params', params: p }));
    },
    setInstrument: (id) =>
      new Promise<void>((resolve) => {
        if (!INSTRUMENT_INFO[id]) return resolve();
        const go = () => {
          presetWaiter = resolve;
          send({ type: 'instrument', instrument: id, preset: state.preset });
        };
        // the piano's filter designs are computed here, off the audio thread
        if (id === 'piano') void withDesigns(state.preset, { ...DEFAULT_PARAMS, ...PRESETS[state.preset].defaults }, go);
        else go();
      }),
    control: (cc, value, time) => ev({ type: 'control', cc, value }, time),
    setPreset: (id) =>
      new Promise<void>((resolve) => {
        const d = PRESETS[id];
        if (!d) return resolve();
        const next = { ...state.params, ...d.defaults };
        void withDesigns(id, next as Partial<PianoParams>, () => {
          presetWaiter = resolve;
          send({ type: 'preset', preset: id });
        });
      }),
    setMaxVoices: (n) => send({ type: 'maxVoices', value: n }),
    onStats: (cb) => {
      statsSubs.add(cb);
      return () => statsSubs.delete(cb);
    },
    onVisual: (cb) => {
      visSubs.add(cb);
      send({ type: 'vis', enabled: true });
      return () => {
        visSubs.delete(cb);
        if (visSubs.size === 0) send({ type: 'vis', enabled: false });
      };
    },
    onKeys: (cb) => {
      keySubs.add(cb);
      return () => keySubs.delete(cb);
    },
    connect: (dest) => output.connect(dest),
    disconnect: () => output.disconnect(),
    dispose: () => {
      send({ type: 'panic' });
      node.port.onmessage = null;
      node.disconnect();
      output.disconnect();
    },
  };
  return piano;
}

/** Same as createPiano; the node can host any of the five instruments. */
export const createInstrument = createPiano;

/**
 * Render offline through the real AudioWorklet (browser). Returns an AudioBuffer.
 * Events are pre-scheduled sample-accurately.
 */
export async function renderOffline(opts: {
  events: { time: number; event: PianoEvent }[];
  duration: number;
  sampleRate?: number;
  instrument?: InstrumentId;
  preset?: string;
  params?: Record<string, unknown>;
  processorUrl?: string;
}): Promise<AudioBuffer> {
  const sr = opts.sampleRate ?? 48000;
  const octx = new OfflineAudioContext(2, Math.ceil(opts.duration * sr), sr);
  const piano = await createPiano(octx, {
    instrument: opts.instrument,
    preset: opts.preset,
    params: opts.params,
    events: opts.events,
    processorUrl: opts.processorUrl,
    adaptive: false,
  });
  piano.connect(octx.destination);
  return octx.startRendering();
}
