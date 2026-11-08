// App-level audio: AudioContext lifecycle, the piano, and input routing
// (Web MIDI with hot-plug, computer keyboard, on-screen keyboard).

import { createPiano, type Piano, type PianoParams, type Stats, type KeySummary } from '@piano-model/engine';

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

class AudioApp {
  ctx: AudioContext | null = null;
  piano: Piano | null = null;
  analyser: AnalyserNode | null = null;
  starting: Promise<void> | null = null;
  preset = 'grand';
  readonly notes = new Emitter<NoteEvent>();
  readonly stats = new Emitter<Stats>();
  readonly state = new Emitter<'idle' | 'starting' | 'running' | 'suspended'>();
  readonly midiStatus = new Emitter<MidiStatus>();
  readonly keysChanged = new Emitter<KeySummary[]>();
  midi: MidiStatus = { supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator, inputs: [] };
  /** keys currently held by any source */
  readonly down = new Map<number, Set<string>>();
  sustainValue = 0;
  softValue = 0;
  lastStats: Stats | null = null;
  status: 'idle' | 'starting' | 'running' | 'suspended' = 'idle';

  /** Start audio (must be called from a user gesture the first time). */
  start(): Promise<void> {
    if (this.starting) {
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
      return this.starting;
    }
    this.setStatus('starting');
    this.starting = (async () => {
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ctx = ctx;
      // Resume immediately inside the gesture; the worklet loads meanwhile.
      void ctx.resume();
      const piano = await createPiano(ctx, { preset: this.preset });
      this.piano = piano;
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
      ctx.onstatechange = () => this.setStatus(ctx.state === 'running' ? 'running' : 'suspended');
      if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
      this.setStatus(ctx.state === 'running' ? 'running' : 'suspended');
      this.keysChanged.emit(piano.keys);
      if (this.sustainValue) piano.sustain(this.sustainValue);
    })();
    return this.starting;
  }

  private setStatus(s: AudioApp['status']): void {
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
    if (!this.piano) void this.start().then(() => this.piano?.noteOn(midi, velocity));
    else this.piano.noteOn(midi, velocity);
    this.notes.emit({ midi, velocity, on: true, source });
  }

  noteOff(midi: number, source: NoteEvent['source']): void {
    const set = this.down.get(midi);
    if (set) {
      set.delete(source);
      if (set.size > 0) return;
      this.down.delete(midi);
    }
    this.piano?.noteOff(midi);
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
    this.piano?.sostenuto(v);
  }

  async setPreset(id: string): Promise<void> {
    this.preset = id;
    if (this.piano) await this.piano.setPreset(id);
  }

  setParams(p: Partial<PianoParams>): void {
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
      else if (d1 === 123 || d1 === 120) this.piano?.allNotesOff();
    }
  }
}

export const audio = new AudioApp();
