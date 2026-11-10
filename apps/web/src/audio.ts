// App-level audio: AudioContext lifecycle, the instrument, and input routing
// (Web MIDI with hot-plug, computer keyboard, on-screen keyboard).

import { audibleTime, type ClockSource } from './clock.ts';
import { CC_DYNAMICS, CC_REST, createInstrument, INSTRUMENT_INFO, processorUrl, type DesignEntry, type InstrumentId, type Piano, type Stats, type KeySummary } from '@piano-model/engine';
import designUrls from 'virtual:piano-designs';
import { diag } from './diag.ts';
import { modLines, modValue, PartLevels, volumeRef, type PartLevel } from './expression.ts';
import type { FileEvent, MidiSong } from './midi-file.ts';

// Fetch the start-up material as soon as the page loads, before anyone touches a
// key: the piano's precomputed filter designs and the worklet script.
const designFetch = new Map<number, Promise<DesignEntry[] | null>>();
export const fetchDesigns = (fs: number): Promise<DesignEntry[] | null> => {
  let p = designFetch.get(fs);
  if (!p) {
    const url = designUrls[fs];
    // bounded: a stalled or redirected request (e.g. an expired login on a protected
    // deployment) falls back to designing in the page instead of waiting forever
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ac?.abort(), 2500);
    const tf = performance.now();
    p = url
      ? fetch(url, { signal: ac?.signal, credentials: 'same-origin' })
          .then((r) => {
            diag(`filter designs ${fs} Hz: HTTP ${r.status}${r.redirected ? ' (redirected)' : ''}`, `${Math.round(performance.now() - tf)} ms, ${r.headers.get('content-type') ?? '?'}`);
            return r.ok ? (r.json() as Promise<DesignEntry[]>) : (console.warn(`filter designs: HTTP ${r.status} for ${url}; designing them here instead`), null);
          })
          .catch((e) => {
            diag(`filter designs ${fs} Hz: FAILED`, String((e as Error)?.message ?? e));
            console.warn('filter designs unavailable, designing them here instead:', e);
            return null;
          })
          .finally(() => clearTimeout(timer))
      : (diag(`filter designs ${fs} Hz: none shipped for this rate`), Promise.resolve(null));
    // a failed fetch is not cached: the next start tries again
    void p.then((d) => {
      if (!d) designFetch.delete(fs);
    });
    designFetch.set(fs, p);
  }
  return p;
};
if (typeof window !== 'undefined') {
  for (const fs of Object.keys(designUrls)) void fetchDesigns(Number(fs));
  const tp = performance.now();
  void fetch(processorUrl)
    .then((r) => diag(`worklet script prefetch: HTTP ${r.status}${r.redirected ? ' (redirected)' : ''}`, `${Math.round(performance.now() - tp)} ms, ${r.headers.get('content-type') ?? '?'}`))
    .catch((e) => diag('worklet script prefetch: FAILED', String((e as Error)?.message ?? e)));
}

type Listener<T> = (v: T) => void;

const withTimeout = <T,>(p: Promise<T>, ms: number, message: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });

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
  source: 'mouse' | 'keys' | 'midi' | 'file';
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

/** see AudioApp.isSounding */
export const SOUNDING_GRACE_MS = 60;

/** orchestra mode (orchestra/ensemble.ts): several instruments take the notes, pedals, controllers
 *  and a file's events in place of the single instrument */
export interface Route {
  noteOn(midi: number, velocity: number): void;
  noteOff(midi: number): void;
  pedal(kind: 'sustain' | 'soft' | 'sostenuto', v: number): void;
  control(cc: number, v: number): void;
  bend(semitones: number): void;
  setParams(p: Record<string, unknown>): void;
  schedule(e: FileEvent, at: number): void;
  stopFile(): void;
}

/** A file's dynamics to one engine at context time `at` (expression.ts): the volume and expression on
 *  its output (a short glide: no zipper), and on a bowed or wind instrument the mod wheel and the
 *  swell of a held note (CC_DYNAMICS); a piano, struck, takes only the gain. `prev` is what it has
 *  (null: at rest). */
export function sendLevel(engine: Piano, prev: PartLevel | null, next: PartLevel, at: number): void {
  if (next.gain !== (prev?.gain ?? 1)) engine.output.gain.setTargetAtTime(next.gain, at, 0.02);
  if (INSTRUMENT_INFO[engine.instrument]?.family === 'piano') return;
  if (next.mod !== (prev?.mod ?? null)) engine.control(1, next.mod === null ? CC_REST : modValue(next.mod), at);
  if (next.dyn !== (prev?.dyn ?? 0)) engine.control(CC_DYNAMICS, next.dyn, at);
}

/** An engine back at rest from a file's dynamics, now: unity gain, no swell, and the mod wheel as the
 *  hand has it (`hand`; null: as if never moved). */
export function restLevel(engine: Piano, sent: PartLevel | null, hand: number | null): void {
  if (!sent) return;
  const ctx = engine.context;
  const g = engine.output.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setTargetAtTime(1, ctx.currentTime, 0.02);
  if (INSTRUMENT_INFO[engine.instrument]?.family === 'piano') return;
  engine.control(CC_DYNAMICS, 0);
  if (sent.mod !== null) engine.control(1, hand ?? CC_REST);
}

class AudioApp {
  ctx: AudioContext | null = null;
  piano: Piano | null = null;
  analyser: AnalyserNode | null = null;
  starting: Promise<void> | null = null;
  preset = 'grand';
  instrument: InstrumentId = readStored();
  readonly notes = new Emitter<NoteEvent>();
  readonly stats = new Emitter<Stats>();
  readonly state = new Emitter<AudioApp['status']>();
  readonly midiStatus = new Emitter<MidiStatus>();
  readonly keysChanged = new Emitter<KeySummary[]>();
  readonly instrumentChanged = new Emitter<InstrumentId>();
  /** about to change (the file player pauses an instrument's own piece before the engine swaps) */
  readonly instrumentChanging = new Emitter<InstrumentId>();
  /** the piano's preset changed (as it is asked for: the engine follows) */
  readonly presetChanged = new Emitter<string>();
  /** fires on every incoming MIDI message (for an activity light) */
  readonly midiActivity = new Emitter<void>();
  midi: MidiStatus = { supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator, inputs: [] };
  /** keys currently held by any source */
  readonly down = new Map<number, Set<string>>();
  /** the notes the engine reports as actually sounding (its own allocation: one note on the
   *  flute and trumpet, one per string on the violin family, the piano's unstolen keys) */
  readonly sounding = new Set<number>();
  /** false until the engine has reported (then pressed keys are taken as sounding) */
  soundingKnown = false;
  readonly soundingChanged = new Emitter<void>();
  /** when each key was last pressed: it counts as sounding until the engine has had time to say */
  private pressedAt = new Map<number, number>();
  sustainValue = 0;
  softValue = 0;
  /** the pianos' middle pedal: a grand's sostenuto, an upright's practice muffler */
  middleValue = 0;
  lastStats: Stats | null = null;
  /** 'stalled': still not ready after a few seconds (shown, with what to do) */
  status: 'idle' | 'starting' | 'stalled' | 'running' | 'suspended' | 'error' = 'idle';
  /** what went wrong, or why it is slow (shown to the user) */
  error = '';
  private attempt = 0;
  /** wall-clock ms from start() to the instrument being ready (shown in the status line) */
  startMs = 0;
  /** input that arrived before the instrument was ready, replayed in order */
  private queue: ((p: Piano) => void)[] = [];
  /** orchestra mode: where notes go instead of the single instrument (null: to it) */
  route: Route | null = null;
  /** the hand's last bow-pressure / breath controller (CC1, CC2 or CC11; the engines share one), for
   *  giving it back when a file that moved the mod wheel stops */
  handPressure: number | null = null;
  /** a file's dynamics on the single instrument (expression.ts), and the file's lines */
  private levels: PartLevels | null = null;
  private levelLines: number[] = [];

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
  unlock(reason = 'gesture'): void {
    if (this.status !== 'running') diag(`gesture: ${reason}`, `status ${this.status}, context ${this.ctx?.state ?? 'none'}`);
    if (!this.ctx) {
      void this.start().catch(() => undefined);
      return;
    }
    // a failed start (or a crashed engine) is retried here, inside a gesture, never on a timer
    if (this.status === 'error') {
      this.restart();
      return;
    }
    if (this.ctx.state !== 'running') {
      void this.ctx.resume().catch(() => undefined);
      return;
    }
    // running but stuck: a tap starts over with a fresh context
    if (this.status === 'stalled') this.restart();
  }

  /** Abandon the current start attempt (keeping queued input) and start again: a new engine on
   *  the same AudioContext (one per page; WebKit counts a fresh context as needing a new gesture). */
  restart(): void {
    this.attempt++;
    const old = this.piano;
    this.piano = null;
    this.soundingKnown = false;
    this.starting = null;
    try {
      old?.dispose();
    } catch {
      /* already gone */
    }
    void this.start().catch(() => undefined);
  }

  /** Start audio (must be called from a user gesture the first time). */
  start(): Promise<void> {
    if (this.starting) {
      if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
      return this.starting;
    }
    const attempt = ++this.attempt;
    diag(`start (attempt ${attempt})`);
    const live = () => attempt === this.attempt;
    this.error = '';
    this.setStatus('starting');
    const t0 = performance.now();
    let watchdog = 0;
    this.starting = (async () => {
      // iOS: play through the silent switch, like a music app (Safari 17+)
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) {
        try {
          session.type = 'playback';
          diag('audioSession.type = playback');
        } catch {
          /* older Safari */
        }
      }
      // ask for 48 kHz: the precomputed filter designs exist for 44.1 and 48 kHz, and
      // audio interfaces (88.2–192 kHz) or Bluetooth headsets (16–24 kHz) would otherwise
      // make the page design them itself; the browser resamples to the device
      // one AudioContext for the page's life: a retry builds a new engine on it
      let ctx = this.ctx && this.ctx.state !== 'closed' ? this.ctx : null;
      if (ctx) diag('AudioContext reused', { state: ctx.state, sampleRate: ctx.sampleRate });
      else {
        try {
          ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
        } catch {
          ctx = new AudioContext({ latencyHint: 'interactive' });
        }
        diag('AudioContext created', { state: ctx.state, sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency });
      }
      this.ctx = ctx;
      // Resume immediately inside the gesture; the worklet loads meanwhile.
      ctx.onstatechange = () => diag(`context ${ctx.state}`);
      void ctx.resume().then(
        () => diag('context.resume() resolved', ctx.state),
        (e) => diag('context.resume() REJECTED', String((e as Error)?.message ?? e)),
      );
      // never hang silently: after 3 s say what is happening and what to do
      let running = false; // the audio thread has reported (its first stats)
      watchdog = window.setTimeout(() => {
        if (!live() || running) return;
        this.error = ctx.state !== 'running' ? 'the browser has not let sound start yet: tap or press a key' : 'still starting: tap to try again';
        diag('STALLED after 3 s', `context ${ctx.state}`);
        this.setStatus('stalled');
      }, 3000);
      const designs = await fetchDesigns(ctx.sampleRate);
      if (!live()) return;
      diag('filter designs', designs ? `${designs.length} shipped for ${ctx.sampleRate} Hz` : `none for ${ctx.sampleRate} Hz: designing in the page`);
      // the engine is returned as soon as its node exists; "started" is the context running and
      // the audio thread's first report, not a round trip that some WebKit builds hold back
      const piano = await withTimeout(createInstrument(ctx, { instrument: this.instrument, preset: this.preset, designs, processorUrl, onStep: (st, d) => diag(st, d), waitReady: false }), 15000, 'the sound engine did not load within 15 s');
      if (!live()) {
        piano.dispose();
        return;
      }
      this.piano = piano;
      diag('engine node up', `${Math.round(performance.now() - t0)} ms after start, context ${ctx.state}`);
      piano.ready.then(
        () => {
          if (live()) this.keysChanged.emit(piano.keys);
        },
        () => undefined, // reported through onError
      );
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
      piano.onSounding((notes) => {
        this.sounding.clear();
        for (const n of notes) this.sounding.add(n);
        this.soundingKnown = true;
        this.soundingChanged.emit();
      });
      piano.onError((m) => {
        if (!live()) return;
        console.warn('audio thread:', m);
        window.clearTimeout(watchdog);
        diag('ENGINE ERROR', m);
        this.error = m;
        this.setStatus('error');
      });
      // never await resume(): without a gesture it can stay pending (iOS); the next
      // gesture's unlock() resumes and onstatechange reports it
      const c = ctx;
      const showState = () => {
        if (!live() || this.status === 'error') return;
        this.setStatus(c.state !== 'running' ? 'suspended' : running ? 'running' : this.status === 'stalled' ? 'stalled' : 'starting');
      };
      c.onstatechange = () => {
        diag(`context ${c.state}`);
        showState();
      };
      piano.onStats(() => {
        if (running || !live()) return;
        running = true;
        window.clearTimeout(watchdog);
        this.startMs = performance.now() - t0;
        diag('audio thread: first stats (sound is running)', `${Math.round(this.startMs)} ms after start, context ${c.state}`);
        if (this.status === 'stalled') this.error = '';
        showState();
      });
      this.error = '';
      showState();
      this.keysChanged.emit(piano.keys);
      if (this.sustainValue) piano.sustain(this.sustainValue);
      if (this.softValue) piano.softPedal(this.softValue);
      if (this.middleValue) piano.sostenuto(this.middleValue);
      const q = this.queue;
      this.queue = [];
      for (const fn of q) fn(piano);
    })().catch((err: unknown) => {
      window.clearTimeout(watchdog);
      if (!live()) return;
      // never leave a failed start cached: the next gesture tries again
      this.error = String((err as Error)?.message ?? err);
      console.warn('audio start failed:', err);
      diag('START FAILED', this.error);
      // the context stays (one per page); the next gesture retries (unlock), never a timer: a
      // context or engine made outside a gesture starts suspended in WebKit
      this.piano = null;
      this.soundingKnown = false;
      this.starting = null;
      this.setStatus('error');
    });
    return this.starting;
  }

  setStatus(s: AudioApp['status']): void {
    this.status = s;
    this.state.emit(s);
  }

  /** the context time being heard now (output latency included; see clock.ts) */
  audibleTime(): number {
    return this.ctx ? audibleTime(this.ctx as unknown as ClockSource, performance.now()) : 0;
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
    this.pressedAt.set(midi, performance.now());
    if (this.route) {
      if (!this.ctx) void this.start().catch(() => undefined);
      this.route.noteOn(midi, velocity);
    } else this.send((p) => p.noteOn(midi, velocity));
    this.notes.emit({ midi, velocity, on: true, source });
  }

  /** Is this key's note really sounding? The engine's word; a key pressed in the last 60 ms
   *  counts until the engine has had a chance to answer (it does within a few ms). */
  isSounding(midi: number): boolean {
    // (an ensemble's keys light while held: its instruments may play them an octave away)
    if (this.route || !this.soundingKnown || !this.piano) return this.down.has(midi);
    if (this.sounding.has(midi)) return true;
    const t = this.pressedAt.get(midi);
    return this.down.has(midi) && t !== undefined && performance.now() - t < SOUNDING_GRACE_MS;
  }

  noteOff(midi: number, source: NoteEvent['source']): void {
    const set = this.down.get(midi);
    if (set) {
      set.delete(source);
      if (set.size > 0) return;
      this.down.delete(midi);
    }
    if (this.route) this.route.noteOff(midi);
    else if (this.piano) this.piano.noteOff(midi);
    else if (this.queue.length) this.queue.push((p) => p.noteOff(midi));
    this.notes.emit({ midi, velocity: 0, on: false, source });
  }

  sustain(v: number): void {
    this.sustainValue = v;
    this.piano?.sustain(v);
    this.route?.pedal('sustain', v);
  }
  soft(v: number): void {
    this.softValue = v;
    this.piano?.softPedal(v);
    this.route?.pedal('soft', v);
  }
  sostenuto(v: number): void {
    this.middleValue = v;
    this.route?.pedal('sostenuto', v);
    if (this.piano) this.piano.sostenuto(v);
    else this.queue.push((p) => p.sostenuto(v));
  }
  control(cc: number, v: number): void {
    if (cc === 1 || cc === 2 || cc === 11) this.handPressure = v;
    if (this.route) return this.route.control(cc, v);
    if (this.piano) this.piano.control(cc, v);
    else this.queue.push((p) => p.control(cc, v));
  }
  // ------------------------------------------------------------- file playback
  private fileTimers = new Set<number>();
  /**
   * An event from a MIDI file, sample-accurate at AudioContext time `at`; the keys on
   * screen follow at (about) the same moment.
   */
  scheduleFileEvent(e: FileEvent, at: number): void {
    const p = this.piano;
    const ctx = this.ctx;
    if (!p || !ctx) return;
    // orchestra: the ensemble plays it; the keys on screen still show the file's own notes
    const route = this.route;
    // the keys on screen follow what is heard: the moment `at` reaches the speakers
    const later = (fn: () => void) => {
      const id = window.setTimeout(() => {
        this.fileTimers.delete(id);
        fn();
      }, Math.max(0, (at - this.audibleTime()) * 1000));
      this.fileTimers.add(id);
    };
    if (route) {
      route.schedule(e, at);
      if (e.kind === 'on') later(() => this.markFile(e.midi, e.vel, true));
      else if (e.kind === 'off') later(() => this.markFile(e.midi, 0, false));
      return;
    }
    if (e.kind === 'on') {
      p.noteOn(e.midi, e.vel, at);
      later(() => this.markFile(e.midi, e.vel, true));
    } else if (e.kind === 'off') {
      p.noteOff(e.midi, at);
      later(() => this.markFile(e.midi, 0, false));
    } else if (e.kind === 'cc' || e.kind === 'dyn') {
      // the file's dynamics, every line on the one instrument
      const lv = this.levels;
      if (!lv?.take(e)) return;
      const prev = lv.sent;
      const next = lv.next(this.levelLines);
      if (next) sendLevel(p, prev, next, at);
    } else if (e.cc === 64) {
      p.sustain(e.value!, at);
      later(() => (this.sustainValue = e.value!));
    } else if (e.cc === 66) {
      p.sostenuto(e.value!, at);
      later(() => (this.middleValue = e.value!));
    }
    else if (e.cc === 67) {
      p.softPedal(e.value!, at);
      later(() => (this.softValue = e.value!));
    }
  }
  private markFile(midi: number, velocity: number, on: boolean): void {
    let set = this.down.get(midi);
    if (on) {
      this.pressedAt.set(midi, performance.now());
      if (!set) this.down.set(midi, (set = new Set()));
      set.add('file');
    } else if (set) {
      set.delete('file');
      if (!set.size) this.down.delete(midi);
    }
    this.notes.emit({ midi, velocity, on, source: 'file' });
  }
  /** the file whose dynamics the single instrument plays (expression.ts): its volume reference, the
   *  lines whose mod wheel moves, its lines (null: none) */
  fileSong(song: MidiSong | null): void {
    this.restLevels();
    this.levels = song ? new PartLevels(volumeRef(song), modLines(song)) : null;
    this.levelLines = song ? song.lines.map((_, i) => i) : [];
  }
  /** the single instrument back at rest from a file's dynamics (they are taken up again from where
   *  the file is when it plays on) */
  private restLevels(): void {
    const lv = this.levels;
    if (!lv) return;
    if (this.piano) restLevel(this.piano, lv.sent, this.handPressure);
    this.levels = new PartLevels(...lv.args);
  }

  /** Stop a file: forget what is scheduled, lift its notes and pedals, its dynamics back at rest. */
  stopFile(): void {
    for (const id of this.fileTimers) window.clearTimeout(id);
    this.fileTimers.clear();
    this.piano?.clearScheduled();
    this.restLevels();
    this.route?.stopFile();
    for (const [m, set] of [...this.down]) if (set.has('file')) {
      this.piano?.noteOff(m);
      this.markFile(m, 0, false);
    }
    this.sustain(0);
    this.soft(0);
    this.sostenuto(0);
  }

  /** pitch bend, semitones (strings, flute) */
  bend(semitones: number): void {
    if (this.route) return this.route.bend(semitones);
    if (this.piano) this.piano.bend(semitones);
    else this.queue.push((p) => p.bend(semitones));
  }

  /** the engine's last change of preset, done */
  presetSettled: Promise<void> = Promise.resolve();
  async setPreset(id: string): Promise<void> {
    const changed = id !== this.preset;
    this.preset = id;
    this.presetSettled = this.piano ? this.piano.setPreset(id) : Promise.resolve();
    if (changed) this.presetChanged.emit(id);
    await this.presetSettled;
  }

  async setInstrument(id: InstrumentId): Promise<void> {
    if (!INSTRUMENT_INFO[id]) return;
    if (id !== this.instrument) this.instrumentChanging.emit(id);
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
    this.route?.setParams(p);
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
        const live = new Set<string>();
        access.inputs.forEach((input) => {
          if (input.state === 'connected') {
            names.push(input.name ?? 'MIDI input');
            live.add(input.id);
          }
          input.onmidimessage = (e) => this.onMidi(e.data, input.id);
        });
        // a device that went away cannot send its note-offs: release what it held
        for (const id of [...this.midiHeld.keys()]) if (!live.has(id)) this.releaseDevice(id);
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

  /** notes held (and whether pedals/bend were moved) per MIDI input, for unplugging */
  private midiHeld = new Map<string, { notes: Set<number>; touched: boolean }>();
  private releaseDevice(id: string): void {
    const h = this.midiHeld.get(id);
    this.midiHeld.delete(id);
    if (!h) return;
    for (const m of h.notes) this.noteOff(m, 'midi');
    if (h.touched) {
      this.sustain(0);
      this.soft(0);
      this.sostenuto(0);
      this.bend(0);
    }
  }

  /** pitch-bend range of incoming MIDI, semitones */
  bendRange = 2;
  private onMidi(data: Uint8Array | null, from = 'midi'): void {
    if (!data || data.length < 2) return;
    const st = data[0] & 0xf0;
    const d1 = data[1];
    const d2 = data[2] ?? 0;
    let held = this.midiHeld.get(from);
    if (!held) this.midiHeld.set(from, (held = { notes: new Set(), touched: false }));
    if (st === 0x90 && d2 > 0) held.notes.add(d1);
    else if (st === 0x80 || st === 0x90) held.notes.delete(d1);
    else if (st === 0xb0 || st === 0xe0) held.touched = true;
    if (st >= 0x80 && st <= 0xe0) this.midiActivity.emit();
    if (!this.piano && (st === 0x90 || st === 0xb0)) void this.start();
    if (st === 0x90 && d2 > 0) this.noteOn(d1, d2, 'midi');
    else if (st === 0x80 || (st === 0x90 && d2 === 0)) this.noteOff(d1, 'midi');
    else if (st === 0xb0) {
      // CC64 sustain (continuous, half-pedal), CC67 una corda, CC66 sostenuto;
      // CC1 mod wheel / CC2 breath / CC11 expression: bow pressure or breath
      if (d1 === 64) this.sustain(d2 / 127);
      else if (d1 === 67) this.soft(d2 / 127);
      else if (d1 === 66) this.sostenuto(d2 / 127);
      else if (d1 === 1 || d1 === 2 || d1 === 11) this.control(d1, d2 / 127);
      else if (d1 === 123 || d1 === 120) this.piano?.allNotesOff();
    } else if (st === 0xe0) {
      // 14-bit pitch bend, centre 8192
      this.bend((((d2 << 7) | d1) - 8192) / 8192 * this.bendRange);
    } else if (st === 0xd0) {
      // channel aftertouch: vibrato depth (strings: cents, flute: breath modulation)
      const v = d1 / 127;
      if (this.instrument === 'flute') this.setParams({ vibrato: 0.15 * v });
      else if (this.instrument === 'oboe' || this.instrument === 'clarinet') this.setParams({ vibrato: 0.1 * v });
      else if (this.instrument !== 'piano') this.setParams({ vibrato: 35 * v });
    }
  }
}

export const audio = new AudioApp();
