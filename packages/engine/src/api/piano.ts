// Main-thread API: createPiano(ctx) returns a controller around the AudioWorklet node.

import processorUrl from '../worklet/processor.ts?worker&url';
import type { PianoEvent } from '../core/piano-core.ts';
import { DEFAULT_PARAMS, PRESETS, type PianoParams } from '../core/design.ts';
import { computeDesigns } from '../core/precompute.ts';
import { INSTRUMENT_INFO, type InstrumentId } from '../core/instrument.ts';
import type { FromProcessor, KeySummary, Stats, ToProcessor, VisualFrame } from './messages.ts';
import type { DesignEntry } from '../core/voice.ts';

export interface PianoOptions {
  /** which instrument the node hosts: 'piano' (default), 'violin', 'viola', 'cello', 'flute' */
  instrument?: InstrumentId;
  /** piano preset: 'grand' | 'upright' | 'honky-tonk' | 'prepared' */
  preset?: string;
  /** physical controls of the instrument (PianoParams, BowedParams or FluteParams) */
  params?: Record<string, unknown>;
  /** struck-note polyphony limit (sympathetic strings are extra); default 64 */
  maxVoices?: number;
  /** orchestra mode: a second (third…) player of the same instrument, with its own vibrato and
   *  noise, so two violins on one tune are two players; default 0, the instrument as it is */
  player?: number;
  /** override the worklet module URL (non-Vite bundlers) */
  processorUrl?: string;
  /** shed load automatically if the audio thread runs hot; default true */
  adaptive?: boolean;
  /** events pre-scheduled at construction (seconds), used by offline rendering */
  events?: { time: number; event: PianoEvent }[];
  /**
   * Precomputed piano filter designs for this context's sample rate (computeDesigns,
   * e.g. shipped as a static file). Without them the piano's designs are computed
   * here on the main thread, in small slices, before the node is created — never
   * on the audio thread.
   */
  designs?: DesignEntry[] | null;
  /** start-up progress, for diagnostics: (step, detail) */
  onStep?: (step: string, detail?: unknown) => void;
  /**
   * Wait for the processor's 'ready' message before resolving (default true). With false the
   * instrument is returned as soon as the node exists: input sent meanwhile queues on its port,
   * `keys` and `params` fill in when `ready` settles, and a failure arrives through onError.
   * (Some WebKit embeddings do not run a processor's constructor until the context renders, so a
   * start that waits on it can stall where nothing is wrong.)
   */
  waitReady?: boolean;
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
  /** settles when the processor has built the instrument (see PianoOptions.waitReady) */
  readonly ready: Promise<void>;
  noteOn(midi: number, velocity?: number, time?: number): void;
  noteOff(midi: number, time?: number): void;
  /** bowed strings, winds and brass: a note that will begin at `time` (AudioContext seconds) and last
   *  `dur` seconds, said ahead of its noteOn (4 s or more: BOW_LOOK) by a player that knows what is
   *  coming, so the bow is planned like a player's who reads the part (`dyn`: the dynamics over the
   *  note, CC_DYNAMICS steps on average), and a wind's tongue and breath (a short note tongued to speak
   *  in time, a note joined to the last tongued ahead of it). The other instruments ignore it. */
  foresee(midi: number, velocity: number, time: number, dur: number, dyn?: number): void;
  /** CC64, continuous 0..1 (half-pedalling supported) */
  sustain(value: number | boolean, time?: number): void;
  /** CC67 una corda, continuous 0..1 */
  softPedal(value: number | boolean, time?: number): void;
  /** CC66 */
  sostenuto(value: number | boolean, time?: number): void;
  allNotesOff(time?: number): void;
  /** stop all sound immediately */
  panic(): void;
  /** forget every event scheduled for the future (notes, pedals) */
  clearScheduled(): void;
  setParams(p: Record<string, unknown>): void;
  setPreset(id: string): Promise<void>;
  /** switch the instrument hosted by this node (silences it); resolves when ready */
  setInstrument(id: InstrumentId): Promise<void>;
  /** continuous controller (0..1): 1 / 2 / 11 = bow pressure (strings) or breath (flute) */
  control(cc: number, value: number, time?: number): void;
  /** pitch bend in semitones (strings and flute) */
  bend(semitones: number, time?: number): void;
  setMaxVoices(n: number): void;
  /** piano: stream this key's action and strings in the visual frames (null: stop) */
  watchKey(midi: number | null): void;
  /** subscribe to ~30 Hz stats (load, voice counts, pedals) */
  onStats(cb: (s: Stats) => void): () => void;
  /** subscribe to ~30 Hz visual frames (string shapes, hammer force, modes); enables them */
  onVisual(cb: (v: VisualFrame) => void): () => void;
  onKeys(cb: (k: KeySummary[]) => void): () => void;
  /** errors reported by the audio thread after start-up (e.g. an instrument that cannot be built) */
  onError(cb: (message: string) => void): () => void;
  /** the notes actually sounding (engine allocation: one for the flute and trumpet, one per bowed
   *  string, the piano's held unstolen keys), whenever that changes */
  onSounding(cb: (notes: number[]) => void): () => void;
  connect(dest: AudioNode): void;
  disconnect(): void;
  dispose(): void;
}

/** URL of the bundled AudioWorklet module (prefetch it to start faster) */
export { processorUrl };

const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

/**
 * Load the worklet module once per context. Where Blob URLs work, the script is fetched here and
 * handed to addModule() as a Blob: the worklet's own loader then never touches the network (an
 * embedded WebKit may route or block that request differently from the page's fetch), and a
 * failed fetch is reported as such. Anything that goes wrong falls back to the plain URL.
 */
function ensureModule(ctx: BaseAudioContext, url: string, step: (s: string, d?: string) => void): Promise<void> {
  let p = loaded.get(ctx);
  if (!p) {
    const viaUrl = () => {
      step('worklet module: loading from its URL');
      return ctx.audioWorklet.addModule(url);
    };
    const canBlob = typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof fetch === 'function';
    p = !canBlob
      ? viaUrl()
      : (async () => {
          let blobUrl = '';
          try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            blobUrl = URL.createObjectURL(new Blob([await res.text()], { type: 'text/javascript' }));
            await ctx.audioWorklet.addModule(blobUrl);
            step('worklet module: loaded from a Blob URL');
          } catch (err) {
            step('worklet module: Blob route failed, trying the URL', String((err as Error)?.message ?? err));
            await viaUrl();
          } finally {
            if (blobUrl) URL.revokeObjectURL(blobUrl);
          }
        })();
    loaded.set(ctx, p);
  }
  return p;
}

const val = (v: number | boolean): number => (typeof v === 'boolean' ? (v ? 1 : 0) : v);

export async function createPiano(ctx: BaseAudioContext, opts: PianoOptions = {}): Promise<Piano> {
  const url = opts.processorUrl ?? processorUrl;
  const step = opts.onStep ?? (() => undefined);
  const tm = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let t = tm();
  step('worklet module: loading', url.split('/').pop());
  try {
    // a worklet script request that stalls (network, a login wall) must not wait forever
    await Promise.race([ensureModule(ctx, url, step), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('no answer within 8 s')), 8000))]);
  } catch (err) {
    loaded.delete(ctx);
    step('worklet module: FAILED', String((err as Error)?.message ?? err));
    throw new Error(`the sound engine (${url.split('/').pop()}) did not load: ${String((err as Error)?.message ?? err)}`);
  }
  step('worklet module: loaded', `${Math.round(tm() - t)} ms`);
  const preset = opts.preset && PRESETS[opts.preset] ? opts.preset : 'grand';
  const instrument: InstrumentId = opts.instrument && INSTRUMENT_INFO[opts.instrument] ? opts.instrument : 'piano';
  const fs = ctx.sampleRate;
  // design keys the worklet already holds: later redesigns only send what is missing
  const sent = new Set<string>();
  let designs = opts.designs ?? null;
  if (!designs?.length && instrument === 'piano') {
    t = tm();
    step('filter designs: computing in the page', `${fs} Hz`);
    designs = await computeDesigns(preset, opts.params ?? {}, fs, { yieldEvery: 4 });
    step('filter designs: computed', `${designs.length} in ${Math.round(tm() - t)} ms`);
  }
  for (const e of designs ?? []) sent.add(e.key);
  const node = new AudioWorkletNode(ctx, 'piano-model', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: {
      instrument,
      preset,
      params: opts.params,
      maxVoices: opts.maxVoices ?? 64,
      player: opts.player || undefined,
      adaptive: opts.adaptive,
      designs: designs ?? undefined,
      events: (opts.events ?? []).map((e) => ({ frame: Math.round(e.time * fs), event: e.event })),
    },
  });
  step('worklet node: created', `context ${ctx.state}`);
  t = tm();
  const output = ctx.createGain();
  node.connect(output);

  const statsSubs = new Set<(s: Stats) => void>();
  const visSubs = new Set<(v: VisualFrame) => void>();
  const soundingSubs = new Set<(notes: number[]) => void>();
  const keySubs = new Set<(k: KeySummary[]) => void>();
  const errorSubs = new Set<(m: string) => void>();
  let started = false;
  let presetWaiter: (() => void) | null = null;

  const state = {
    keys: [] as KeySummary[],
    modeFrequencies: [] as number[],
    preset,
    instrument,
    params: { ...DEFAULT_PARAMS, ...PRESETS[preset].defaults, ...opts.params } as PianoParams & Record<string, unknown>,
    initMs: 0,
  };

  const ready = new Promise<void>((resolve, reject) => {
    // a constructor that throws, or a processor that crashes later, must not leave
    // the caller waiting for 'ready' forever
    node.onprocessorerror = (ev: Event) => {
      const why = (ev as ErrorEvent).message ? `: ${(ev as ErrorEvent).message}` : '';
      if (!started) reject(new Error(`the sound engine crashed while starting${why}`));
      // after start-up a crash would otherwise be silence and nothing on screen
      else errorSubs.forEach((cb) => cb(`the sound engine stopped${why}`));
    };
    node.port.onmessage = (e: MessageEvent<FromProcessor>) => {
      const m = e.data;
      switch (m.type) {
        case 'error':
          if (!started) reject(new Error(m.message));
          errorSubs.forEach((cb) => cb(m.message));
          // unblock a pending instrument/preset switch
          presetWaiter?.();
          presetWaiter = null;
          break;
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
        case 'sounding':
          soundingSubs.forEach((cb) => cb(m.notes));
          break;
      }
    };
  });
  const settled = ready.then(
    () => {
      step('worklet: ready', `instrument built in ${Math.round(state.initMs)} ms (audio thread); ${Math.round(tm() - t)} ms after the node`);
      started = true;
    },
    (err: unknown) => {
      step('worklet: FAILED before ready', String((err as Error)?.message ?? err));
      started = true;
      // nobody awaits it when waitReady is false: report it like a later crash
      if (opts.waitReady === false) errorSubs.forEach((cb) => cb(String((err as Error)?.message ?? err)));
      throw err;
    },
  );
  if (opts.waitReady === false) settled.catch(() => undefined);
  else await settled;

  const send = (m: ToProcessor) => node.port.postMessage(m);
  // Filter redesigns (inharmonicity, decay, preset) are computed here, off the audio
  // thread, and handed to the worklet before the change is applied.
  let gen = 0;
  const missingDesigns = (presetId: string, params: Partial<PianoParams>) => computeDesigns(presetId, params, fs, { yieldEvery: 3, skip: (k) => sent.has(k) });
  const withDesigns = async (presetId: string, params: Partial<PianoParams>, then: () => void) => {
    const my = ++gen;
    const entries = await missingDesigns(presetId, params);
    if (my !== gen) return;
    if (entries.length) send({ type: 'designs', entries });
    for (const e of entries) sent.add(e.key);
    then();
  };
  const NEEDS_DESIGN: (keyof PianoParams)[] = ['stringStiffness', 'sustain'];
  const ev = (event: PianoEvent, time?: number) => send({ type: 'event', event, time });

  const piano: Piano = {
    context: ctx,
    node,
    output,
    sampleRate: fs,
    ready: settled,
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
    foresee: (midi, velocity, time, dur, dyn) => ev({ type: 'foresee', midi, velocity, dur, dyn }, time),
    sustain: (v, time) => ev({ type: 'sustain', value: val(v) }, time),
    softPedal: (v, time) => ev({ type: 'soft', value: val(v) }, time),
    sostenuto: (v, time) => ev({ type: 'sostenuto', value: val(v) }, time),
    allNotesOff: (time) => ev({ type: 'allNotesOff' }, time),
    panic: () => send({ type: 'panic' }),
    clearScheduled: () => send({ type: 'clearScheduled' }),
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
        // the piano's filter designs are computed here, off the audio thread (the
        // worklet keeps every design it has been sent, so usually nothing is missing)
        if (id === 'piano') void withDesigns(state.preset, { ...DEFAULT_PARAMS, ...PRESETS[state.preset].defaults }, go);
        else go();
      }),
    control: (cc, value, time) => ev({ type: 'control', cc, value }, time),
    bend: (semitones, time) => ev({ type: 'bend', value: semitones }, time),
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
    watchKey: (midi) => send({ type: 'watch', midi: midi ?? -1 }),
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
    onError: (cb) => {
      errorSubs.add(cb);
      return () => errorSubs.delete(cb);
    },
    onSounding: (cb) => {
      soundingSubs.add(cb);
      return () => soundingSubs.delete(cb);
    },
    connect: (dest) => output.connect(dest),
    disconnect: () => output.disconnect(),
    dispose: () => {
      // (the processor is told: a node only disconnected is rendered for ever, process() keeping it alive)
      send({ type: 'dispose' });
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
  designs?: DesignEntry[] | null;
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
    designs: opts.designs,
  });
  piano.connect(octx.destination);
  return octx.startRendering();
}
