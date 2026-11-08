// App-level audio: AudioContext lifecycle, the instrument, and input routing
// (Web MIDI with hot-plug, computer keyboard, on-screen keyboard).

import { createInstrument, INSTRUMENT_INFO, processorUrl, type DesignEntry, type InstrumentId, type Piano, type Stats, type KeySummary } from '@piano-model/engine';
import designUrls from 'virtual:piano-designs';

// Fetch the start-up material as soon as the page loads, before anyone touches a
// key: the piano's precomputed filter designs and the worklet script.
const designFetch = new Map<number, Promise<DesignEntry[] | null>>();
export const fetchDesigns = (fs: number): Promise<DesignEntry[] | null> => {
  let p = designFetch.get(fs);
  if (!p) {
    const url = designUrls[fs];
    p = url
      ? fetch(url)
          .then((r) => (r.ok ? (r.json() as Promise<DesignEntry[]>) : null))
          .catch(() => null)
      : Promise.resolve(null);
    designFetch.set(fs, p);
  }
  return p;
};
if (typeof window !== 'undefined') {
  for (const fs of Object.keys(designUrls)) void fetchDesigns(Number(fs));
  void fetch(processorUrl).catch(() => undefined);
}

type Listener<T> = (v: T) => void;

class Emitter<T> {
  private subs = new Set<Listener<T>>();
  on(cb: Listener<T>): () => void {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }
  emit(v: T): void {
    this.subs.forEach((cb) => cb(v));
  }
}

export interface NoteEvent {
  midi: number;
  velocity: number;
  on: boolean;
  source: 'mouse' | 'keys' | 'midi';
}

export interface MidiStatus {
  supported: boolean;
  inputs: string[];
  error?: string;
}

const STORE_KEY = 'piano-model.instrument';
const readStored = (): InstrumentId => {
  try {
    const v = localStorage.getItem(STORE_KEY) as InstrumentId | null;
    return v && INSTRUMENT_INFO[v] ? v : 'piano';
  } catch {
    return 'piano';
  }
};

class AudioApp {
  ctx: AudioContext | null = null;
  piano: Piano | null = null;
  analyser: AnalyserNode | null = null;
  starting: Promise<void> | null = null;
  preset = 'grand';
  instrument: InstrumentId = readStored();
  readonly notes = new Emitter<NoteEvent>();
  readonly stats = new Emitter<Stats>();
  readonly state = new Emitter<'idle' | 'starting' | 'running' | 'suspended' | 'error'>();
  readonly midiStatus = new Emitter<MidiStatus>();
  readonly keysChanged = new Emitter<KeySummary[]>();
  readonly instrumentChanged = new Emitter<InstrumentId>();
  midi: MidiStatus = { supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator, inputs: [] };
  /** keys currently held by any source */
  readonly down = new Map<number, Set<string>>();
  sustainValue = 0;
  softValue = 0;
  lastStats: Stats | null = null;
  status: 'idle' | 'starting' | 'running' | 'suspended' | 'error' = 'idle';
  error = '';
  /** wall-clock ms from start() to the instrument being ready (shown in the status line) */
  startMs = 0;
  /** input that arrived before the instrument was ready, replayed in order */
  private queue: ((p: Piano) => void)[] = [];

  private send(fn: (p: Piano) => void): void {
    if (this.piano) fn(this.piano);
    else {
      this.queue.push(fn);
      void this.start().catch(() => undefined);
    }
  }

  /**
   * Called from every activation-triggering event (key press, click, pointerup,
   * touchend). Mobile browsers only count pointer*up* / touchend as a gesture, and
   * iOS can interrupt a running context, so this keeps trying until sound runs.
   */
  unlock(): void {
    if (!this.ctx) {
      void this.start().catch(() => undefined);
      return;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
  }

  /** Start audio (must be called from a user gesture the first time). */
  start(): Promise<void> {
    if (this.starting) {
      if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
      return this.starting;
    }
    this.setStatus('starting');
    const t0 = performance.now();
    this.starting = (async () => {
      // iOS: play through the silent switch, like a music app (Safari 17+)
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) {
        try {
          session.type = 'playback';
        } catch {
          /* older Safari */
        }
      }
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      // Resume immediately inside the gesture; the worklet loads meanwhile.
      void ctx.resume().catch(() => undefined);
      const designs = await fetchDesigns(ctx.sampleRate);
      const piano = await createInstrument(ctx, { instrument: this.instrument, preset: this.preset, designs, processorUrl });
      this.piano = piano;
      this.startMs = performance.now() - t0;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 8192;
      analyser.smoothingTimeConstant = 0.6;
      this.analyser = analyser;
      piano.connect(ctx.destination);
      piano.output.connect(analyser);
      piano.onStats((s) => {
        this.lastStats = s;
        this.stats.emit(s);
      });
      piano.onKeys((k) => this.keysChanged.emit(k));
      // never await resume(): without a gesture it can stay pending (iOS); the next
      // gesture's unlock() resumes and onstatechange reports it
      ctx.onstatechange = () => this.setStatus(ctx.state === 'running' ? 'running' : 'suspended');
      this.setStatus(ctx.state === 'running' ? 'running' : 'suspended');
      this.keysChanged.emit(piano.keys);
      if (this.sustainValue) piano.sustain(this.sustainValue);
      if (this.softValue) piano.softPedal(this.softValue);
      const q = this.queue;
      this.queue = [];
      for (const fn of q) fn(piano);
    })().catch((err: unknown) => {
      // never leave a failed start cached: the next gesture tries again
      this.error = String((err as Error)?.message ?? err);
      console.warn('audio start failed:', err);
      void this.ctx?.close().catch(() => undefined);
      this.ctx = null;
      this.piano = null;
      this.starting = null;
      this.queue = [];
      this.setStatus('error');
      throw err;
    });
    return this.starting;
  }

  setStatus(s: AudioApp['status']): void {
    this.status = s;
    this.state.emit(s);
  }

  get latencyMs(): { base: number; output: number; quantum: number } | null {
    const c = this.ctx;
    if (!c) return null;
    return {
      base: (c.baseLatency ?? 0) * 1000,
      output: ((c as AudioContext & { outputLatency?: number }).outputLatency ?? 0) * 1000,
      quantum: (128 / c.sampleRate) * 1000,
    };
  }

  noteOn(midi: number, velocity: number, source: NoteEvent['source']): void {
    if (midi < 21 || midi > 108) return;
    let set = this.down.get(midi);
    if (!set) {
      set = new Set();
      this.down.set(midi, set);
    }
    set.add(source);
    this.send((p) => p.noteOn(midi, velocity));
    this.notes.emit({ midi, velocity, on: true, source });
  }

  noteOff(midi: number, source: NoteEvent['source']): void {
    const set = this.down.get(midi);
    if (set) {
      set.delete(source);
      if (set.size > 0) return;
      this.down.delete(midi);
    }
    if (this.piano) this.piano.noteOff(midi);
    else if (this.queue.length) this.queue.push((p) => p.noteOff(midi));
    this.notes.emit({ midi, velocity: 0, on: false, source });
  }

  sustain(v: number): void {
    this.sustainValue = v;
    this.piano?.sustain(v);
  }
  soft(v: number): void {
    this.softValue = v;
    this.piano?.softPedal(v);
  }
  sostenuto(v: number): void {
    if (this.piano) this.piano.sostenuto(v);
    else this.queue.push((p) => p.sostenuto(v));
  }
  control(cc: number, v: number): void {
    if (this.piano) this.piano.control(cc, v);
    else this.queue.push((p) => p.control(cc, v));
  }

  async setPreset(id: string): Promise<void> {
    this.preset = id;
    if (this.piano) await this.piano.setPreset(id);
  }

  async setInstrument(id: InstrumentId): Promise<void> {
    if (!INSTRUMENT_INFO[id]) return;
    this.instrument = id;
    try {
      localStorage.setItem(STORE_KEY, id);
    } catch {
      /* private mode */
    }
    for (const m of [...this.down.keys()]) this.notes.emit({ midi: m, velocity: 0, on: false, source: 'keys' });
    this.down.clear();
    if (this.piano) {
      await this.piano.setInstrument(id);
      this.keysChanged.emit(this.piano.keys);
    }
    this.instrumentChanged.emit(id);
  }

  setParams(p: Record<string, unknown>): void {
    this.piano?.setParams(p);
  }

  // ------------------------------------------------------------- MIDI
  async initMidi(): Promise<void> {
    if (!this.midi.supported) {
      this.midiStatus.emit(this.midi);
      return;
    }
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      const attach = () => {
        const names: string[] = [];
        access.inputs.forEach((input) => {
          if (input.state === 'connected') names.push(input.name ?? 'MIDI input');
          input.onmidimessage = (e) => this.onMidi(e.data);
        });
        this.midi = { supported: true, inputs: names };
        this.midiStatus.emit(this.midi);
      };
      attach();
      // hot-plug: re-attach handlers whenever devices come or go
      access.onstatechange = () => attach();
    } catch (err) {
      this.midi = { supported: true, inputs: [], error: String((err as Error).message ?? err) };
      this.midiStatus.emit(this.midi);
    }
  }

  private onMidi(data: Uint8Array | null): void {
    if (!data || data.length < 2) return;
    const st = data[0] & 0xf0;
    const d1 = data[1];
    const d2 = data[2] ?? 0;
    if (!this.piano && (st === 0x90 || st === 0xb0)) void this.start();
    if (st === 0x90 && d2 > 0) this.noteOn(d1, d2, 'midi');
    else if (st === 0x80 || (st === 0x90 && d2 === 0)) this.noteOff(d1, 'midi');
    else if (st === 0xb0) {
      if (d1 === 64) this.sustain(d2 / 127);
      else if (d1 === 67) this.soft(d2 / 127);
      else if (d1 === 66) this.sostenuto(d2 / 127);
      else if (d1 === 1 || d1 === 2 || d1 === 11) this.control(d1, d2 / 127);
      else if (d1 === 123 || d1 === 120) this.piano?.allNotesOff();
    }
  }
}

export const audio = new AudioApp();
