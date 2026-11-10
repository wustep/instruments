// Orchestra mode: several instruments at once. Each instrument on the stage (a part) is its own
// engine (an AudioWorkletNode) on the page's one AudioContext; they share a bus (orchestra/mix.ts) and
// the analyser. A MIDI file's lines go to the parts by a plan (orchestra/assign.ts), many to many: a
// line may sound on several parts, and a voice may be on the stage twice (two cellos, two grands, each
// its own engine). Played by hand (keys, a MIDI keyboard) the notes are dealt out by register, each
// melodic instrument one note.
// While the ensemble plays, the single instrument's engine is taken out of the graph (it costs as
// much idle as playing) and put back when the ensemble goes.

import { createInstrument, pianoKeySummary, processorUrl, type KeySummary, type Piano, type VisualFrame } from '@piano-model/engine';
import { audio, fetchDesigns, type Route } from '../audio.ts';
import type { FileEvent, MidiLine, MidiSong } from '../midi-file.ts';
import { addPart, autoPlan, isKeyboard, lineupOf, lineupPlan, placeNote, playersOf, reassign, removePart, setPartLines, setPartVoice, setRoute, VOICE_INFO, type Plan, type Voice } from './assign.ts';
import { busGain } from './mix.ts';
import { piecePlan, type Piece } from './pieces.ts';

/** the most instruments a file is shared out over by itself, and a piece's (each a few per cent of the
 *  audio thread: artifacts/realistic-3d/final-orchestra/NOTES.md) */
export const AUTO_CAP = 6;
/** the most instruments on the stage when they are picked or routed by hand: eight on a computer, six
 *  on a phone or a small tablet (its audio thread is about three times slower; see
 *  artifacts/realistic-3d/final-next5/orchestra-routing/NOTES.md for the measurements) */
export const stageCap = (): number => {
  try {
    return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820 ? 6 : 8;
  } catch {
    return 6;
  }
};
/** each piano's polyphony: one piano 48 voices; with two on the stage 32 each, 24 on a phone (the
 *  audio thread's heaviest part is a piano's ringing strings: two grands and six others came to 35 %
 *  of a desktop's audio thread, scripts/perf-orchestra.mjs ROUTED=1) */
const pianoVoices = (n: number): number => (n > 1 ? (stageCap() < 8 ? 24 : 32) : 48);
/** a lineup to start from: the string quartet */
export const QUARTET: Voice[] = ['violin', 'violin', 'viola', 'cello'];

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

/** one instrument on the stage, live */
export interface PartLive {
  voice: Voice;
  /** a second player of the same voice on the same line (assign.ts playersOf): its own vibrato */
  player: number;
  engine: Piano | null;
  /** the engine's latest visual frame, and the piano's last hammer strike */
  frame: VisualFrame | null;
  strike: VisualFrame['strike'];
  /** the notes it is holding, as heard (the engine's pitches), with when and how hard each was struck */
  down: Set<number>;
  /** how many of its lines hold each pitch: as scheduled (a unison of two lines is let go when the
   *  last lets go) and as heard */
  sched: Map<number, number>;
  heard: Map<number, number>;
  /** counts the times its notes were dropped (a picture still on its way for an older one is not drawn) */
  epoch: number;
  strikes: Map<number, number>;
  vels: Map<number, number>;
  /** when it last began a note (performance.now) and which */
  lastOn: number;
  lastNote: number;
  sustain: number;
  unsubs: (() => void)[];
}

export interface PartNote {
  part: number;
  midi: number;
  velocity: number;
  on: boolean;
}

class Ensemble implements Route {
  active = false;
  plan: Plan = lineupPlan(QUARTET);
  /** the file whose lines the plan places (null: a lineup played by hand) */
  song: MidiSong | null = null;
  piece: Piece | null = null;
  /** the lineup was picked by hand (a file dropped next is matched to it) */
  byUser = false;
  parts: PartLive[] = [];
  readonly changed = new Emitter<void>();
  readonly notes = new Emitter<PartNote>();
  private bus: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private timers = new Set<number>();
  /** live keys → the part and pitch that took them */
  private live = new Map<number, { part: number; pitch: number }>();
  private gen = 0;

  get lines(): MidiLine[] {
    return this.song?.lines ?? [];
  }
  get lineup(): Voice[] {
    return lineupOf(this.plan);
  }

  /** the ensemble on the stage, with a plan (a file's, a piece's, or a lineup) */
  enter(plan: Plan, song: MidiSong | null, piece: Piece | null = null, byUser = false): void {
    this.plan = plan;
    this.byUser = byUser;
    this.song = song;
    this.piece = piece;
    this.active = true;
    audio.route = this;
    this.watchSolo();
    this.sync();
    this.changed.emit();
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    audio.route = null;
    this.releaseLive();
    this.stopFile();
    for (const p of this.parts) this.disposePart(p);
    this.parts = [];
    this.song = null;
    this.piece = null;
    this.byUser = false;
    // the single instrument back in the graph
    const ctx = audio.ctx;
    if (ctx && audio.piano) {
      audio.piano.connect(ctx.destination);
      if (audio.analyser) audio.piano.output.connect(audio.analyser);
    }
    this.changed.emit();
  }

  /** a file's lines over the current lineup (picked by hand) or on instruments of their own */
  planFor(song: MidiSong, piece: Piece | null): Plan {
    if (piece) return piecePlan(piece, song.lines, AUTO_CAP);
    return this.active && this.byUser ? autoPlan(song.lines, { cap: stageCap(), lineup: this.lineup }) : autoPlan(song.lines, { cap: AUTO_CAP });
  }

  /** a file's lines over a given lineup */
  planForLineup(song: MidiSong, lineup: Voice[]): Plan {
    return autoPlan(song.lines, { cap: stageCap(), lineup });
  }

  /** a new lineup (picked by hand); a loaded file's lines are matched to it */
  setLineup(voices: Voice[]): void {
    const v = voices.slice(0, stageCap());
    this.byUser = true;
    this.piece = null;
    this.plan = this.song ? autoPlan(this.song.lines, { cap: stageCap(), lineup: v }) : lineupPlan(v);
    if (!v.length) return this.exit();
    this.releaseLive();
    this.sync();
    this.changed.emit();
  }

  /** a line of the file to another instrument, and only to it (null: silent); false when the stage
   *  has no room */
  reassignLine(li: number, voice: Voice | null): boolean {
    return this.replan(reassign(this.plan, this.lines, li, voice, stageCap()));
  }

  // routing by hand, many to many (assign.ts): the instruments keep their seats
  /** line `li` on part `k` too, or no longer */
  route(li: number, k: number, on: boolean): boolean {
    return this.replan(setRoute(this.plan, this.lines, li, k, on));
  }
  /** part `k` plays these lines (every line: the whole file) */
  partLines(k: number, lis: number[]): boolean {
    return this.replan(setPartLines(this.plan, this.lines, k, lis));
  }
  /** another instrument on the stage (a voice already there gets a second engine and seat), playing
   *  `lis`; false when the stage is full */
  addPart(voice: Voice, lis: number[] = []): boolean {
    return this.replan(addPart(this.plan, this.lines, voice, lis, stageCap()));
  }
  /** an instrument off the stage (the last one: the ensemble leaves) */
  removePart(k: number): boolean {
    if (this.plan.parts.length <= 1) return false;
    return this.replan(removePart(this.plan, this.lines, k));
  }
  /** an instrument changed for another, in its seat with its lines */
  partVoice(k: number, voice: Voice): boolean {
    return this.replan(setPartVoice(this.plan, this.lines, k, voice));
  }
  /** is there room for one more instrument? */
  get roomForMore(): boolean {
    return this.plan.parts.length < stageCap();
  }

  private replan(next: Plan | null): boolean {
    if (!next) return false;
    if (next === this.plan) return true;
    // (sync keeps the engines that stay; one whose lines change lets go of what it holds, else a note
    // whose line has gone elsewhere would never hear its end)
    const prev = this.plan;
    this.plan = next;
    this.piece = null;
    this.releaseLive();
    this.sync(prev);
    this.changed.emit();
    return true;
  }

  // ------------------------------------------------------------- engines
  /** make the parts match the plan: keep an engine where its instrument stays, make the others */
  private sync(prev?: Plan): void {
    const want = this.plan.parts.map((p) => p.voice);
    const linesOf = new Map(this.parts.map((p, i) => [p, prev?.parts[i]?.lines.join() ?? '']));
    const players = playersOf(this.plan);
    const old = this.parts;
    const next: PartLive[] = new Array(want.length);
    const free = [...old];
    // an engine stays where its voice and player stay: first the parts in the same seat, then any
    want.forEach((v, i) => {
      const p = old[i];
      if (p && p.voice === v && p.player === players[i] && free.includes(p)) {
        free.splice(free.indexOf(p), 1);
        next[i] = p;
      }
    });
    want.forEach((v, i) => {
      if (next[i]) return;
      const k = free.findIndex((p) => p.voice === v && p.player === players[i]);
      next[i] = k >= 0 ? free.splice(k, 1)[0] : this.newPart(v, players[i]);
    });
    for (const p of free) {
      // the notes it held are let go with it
      this.dropNotes(p);
      this.disposePart(p);
    }
    // (a whole new plan, no `prev`: every engine kept lets go)
    next.forEach((p, i) => linesOf.has(p) && (!prev || linesOf.get(p) !== this.plan.parts[i].lines.join()) && this.dropNotes(p));
    this.parts = next;
    this.applyGain();
    this.applyVoices();
    if (this.active) void this.ensureEngines();
  }

  private newPart(v: Voice, player = 0): PartLive {
    return { voice: v, player, engine: null, frame: null, strike: null, down: new Set(), sched: new Map(), heard: new Map(), epoch: 0, strikes: new Map(), vels: new Map(), lastOn: 0, lastNote: -1, sustain: 0, unsubs: [] };
  }

  /** a part lets go of every note it holds or has been sent */
  private dropNotes(p: PartLive): void {
    p.epoch++;
    p.engine?.clearScheduled();
    p.engine?.allNotesOff();
    p.sched.clear();
    p.heard.clear();
    for (const m of [...p.down]) this.mark(p, m, 0, false);
  }

  /** each piano's polyphony for the number of pianos on the stage */
  private applyVoices(): void {
    const n = this.parts.filter((p) => isKeyboard(p.voice)).length;
    for (const p of this.parts) if (isKeyboard(p.voice)) p.engine?.setMaxVoices(pianoVoices(n));
  }

  private disposePart(p: PartLive): void {
    p.unsubs.forEach((u) => u());
    p.unsubs = [];
    try {
      p.engine?.dispose();
    } catch {
      /* gone */
    }
    p.engine = null;
  }

  /** the audio for every part (audio must be started; resolves when every engine exists) */
  async ensureEngines(): Promise<void> {
    if (!this.active) return;
    await audio.start().catch(() => undefined);
    const ctx = audio.ctx;
    if (!ctx || !this.active) return;
    const my = ++this.gen;
    this.muteSolo();
    if (!this.bus) {
      this.bus = ctx.createGain();
      // a peak limiter: only what the bus gain does not already keep under −2 dBFS
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -2;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.002;
      this.limiter.release.value = 0.15;
      this.bus.connect(this.limiter);
      this.limiter.connect(ctx.destination);
    }
    if (audio.analyser) this.limiter!.connect(audio.analyser);
    this.applyGain();
    const designs = this.parts.some((p) => isKeyboard(p.voice) && !p.engine) ? await fetchDesigns(ctx.sampleRate) : null;
    await Promise.all(
      this.parts.map(async (p) => {
        if (p.engine) return;
        const info = VOICE_INFO[p.voice];
        const pianos = this.parts.filter((q) => isKeyboard(q.voice)).length;
        const e = await createInstrument(ctx, { instrument: info.instrument, preset: 'grand', designs: info.instrument === 'piano' ? designs : null, processorUrl, waitReady: false, maxVoices: pianoVoices(pianos), player: p.player });
        if (my !== this.gen || !this.parts.includes(p) || p.engine) {
          e.dispose();
          return;
        }
        p.engine = e;
        e.connect(this.bus!);
        if (info.preset === 'upright') void e.setPreset('upright');
        this.applyVoices();
        // the ensemble's room: the stage's reverb setting, the grand's lid as the single grand has it
        const room = (audio.piano?.params as Record<string, unknown> | undefined)?.room;
        if (typeof room === 'number') e.setParams({ room });
        p.unsubs.push(
          e.onVisual((v) => {
            p.frame = v;
            if (v.strike) p.strike = v.strike;
          }),
          e.onError((m) => console.warn(`ensemble ${p.voice}:`, m)),
        );
      }),
    );
  }

  /** the single instrument out of the graph while the ensemble plays: once it has reported (its first
   *  report is what says the sound has started), and again after any restart */
  private muteSolo(): void {
    if (this.active && audio.status === 'running') audio.piano?.disconnect();
  }
  private watching = false;
  private watchSolo(): void {
    if (this.watching) return;
    this.watching = true;
    audio.state.on(() => this.muteSolo());
  }

  /** the bus at 1/√n over the parts that can sound: with a file, those given a line (one waiting for
   *  a line is silent); played by hand, all of them */
  private applyGain(): void {
    const n = this.song ? this.plan.parts.filter((p) => p.lines.length > 0).length : this.parts.length;
    if (this.bus && audio.ctx) this.bus.gain.setTargetAtTime(busGain(n), audio.ctx.currentTime, 0.02);
  }

  /** a piano part's strings (for drawing before its engine reports) */
  keysOf(p: PartLive): KeySummary[] {
    const k = p.engine?.keys;
    return k && k.length && p.engine?.instrument === 'piano' ? k : pianoKeySummary(VOICE_INFO[p.voice].preset ?? 'grand');
  }

  // ------------------------------------------------------------- a file
  /** an event of the file at context time `at`; the parts' pictures follow when it is heard */
  schedule(e: FileEvent, at: number): void {
    const rs = e.line === undefined ? undefined : this.plan.lines[e.line];
    if (!rs) return;
    // every instrument the line plays on
    for (const r of rs) {
      const p = this.parts[r.part];
      const eng = p?.engine;
      if (!p || !eng) continue;
      if (e.kind === 'pedal') {
        // pedals belong to the pianos (a bowed or wind part has none in a file)
        if (!isKeyboard(p.voice)) continue;
        if (e.cc === 64) eng.sustain(e.value, at);
        else if (e.cc === 66) eng.sostenuto(e.value, at);
        else eng.softPedal(e.value, at);
        continue;
      }
      const pitch = placeNote(e.midi, r.shift, p.voice);
      // two lines on one instrument in unison: one string, let go when the last line lets go
      const n = p.sched.get(pitch) ?? 0;
      // (the picture follows the part itself: the lineup may change before the note is heard)
      const ep = p.epoch;
      if (e.kind === 'on') {
        p.sched.set(pitch, n + 1);
        eng.noteOn(pitch, e.vel, at);
        this.later(at, () => ep === p.epoch && this.hear(p, pitch, e.vel, true));
      } else {
        if (n > 1) p.sched.set(pitch, n - 1);
        else {
          p.sched.delete(pitch);
          eng.noteOff(pitch, at);
        }
        this.later(at, () => ep === p.epoch && this.hear(p, pitch, 0, false));
      }
    }
  }

  /** a file's note heard on a part: the picture lets go when the last of its lines does */
  private hear(p: PartLive, pitch: number, vel: number, on: boolean): void {
    const n = p.heard.get(pitch) ?? 0;
    if (on) p.heard.set(pitch, n + 1);
    else if (n > 1) return void p.heard.set(pitch, n - 1);
    else p.heard.delete(pitch);
    this.mark(p, pitch, vel, on);
  }

  private later(at: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, Math.max(0, (at - audio.audibleTime()) * 1000));
    this.timers.add(id);
  }

  private mark(p: PartLive | undefined, pitch: number, vel: number, on: boolean): void {
    const k = p ? this.parts.indexOf(p) : -1;
    if (!p || k < 0) return;
    if (on) {
      p.down.add(pitch);
      p.strikes.set(pitch, performance.now());
      p.vels.set(pitch, vel);
      p.lastOn = performance.now();
      p.lastNote = pitch;
    } else p.down.delete(pitch);
    this.notes.emit({ part: k, midi: pitch, velocity: vel, on });
  }

  /** forget what is scheduled, lift every part's notes */
  stopFile(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
    for (const p of this.parts) {
      this.dropNotes(p);
      if (isKeyboard(p.voice)) p.engine?.sustain(0);
    }
  }

  // ------------------------------------------------------------- by hand
  /** a key pressed: to the free melodic instrument nearest its register, else a piano, else the
   *  instrument nearest in register that has been holding a note longest */
  noteOn(midi: number, vel: number): void {
    if (!this.parts.length) return;
    this.noteOff(midi);
    const busy = new Set([...this.live.values()].filter((x) => !isKeyboard(this.parts[x.part]?.voice ?? 'grand')).map((x) => x.part));
    const dist = (v: Voice) => (midi < VOICE_INFO[v].lo ? VOICE_INFO[v].lo - midi + 24 : midi > VOICE_INFO[v].hi ? midi - VOICE_INFO[v].hi + 24 : Math.abs(midi - VOICE_INFO[v].centre));
    let best = -1;
    for (let k = 0; k < this.parts.length; k++) {
      const v = this.parts[k].voice;
      if (isKeyboard(v) || busy.has(k)) continue;
      if (best < 0 || dist(v) < dist(this.parts[best].voice)) best = k;
    }
    if (best < 0) best = this.parts.findIndex((p) => isKeyboard(p.voice));
    if (best < 0) {
      // every instrument busy: the nearest in register takes it over (its old note is let go)
      for (let k = 0; k < this.parts.length; k++) if (best < 0 || dist(this.parts[k].voice) < dist(this.parts[best].voice)) best = k;
      for (const [m, x] of this.live) if (x.part === best) this.noteOff(m);
    }
    const p = this.parts[best];
    const pitch = placeNote(midi, 0, p.voice);
    this.live.set(midi, { part: best, pitch });
    p.engine?.noteOn(pitch, vel);
    this.mark(p, pitch, vel, true);
  }

  noteOff(midi: number): void {
    const x = this.live.get(midi);
    if (!x) return;
    this.live.delete(midi);
    this.parts[x.part]?.engine?.noteOff(x.pitch);
    this.mark(this.parts[x.part], x.pitch, 0, false);
  }

  private releaseLive(): void {
    for (const m of [...this.live.keys()]) this.noteOff(m);
  }

  /** the pedals and controllers, to every part (the bowed strings' sustain holds the bow) */
  pedal(kind: 'sustain' | 'soft' | 'sostenuto', v: number): void {
    for (const p of this.parts) {
      if (kind === 'sustain') p.engine?.sustain(v);
      else if (isKeyboard(p.voice)) kind === 'soft' ? p.engine?.softPedal(v) : p.engine?.sostenuto(v);
      if (kind === 'sustain') p.sustain = v;
    }
  }
  control(cc: number, v: number): void {
    for (const p of this.parts) if (!isKeyboard(p.voice)) p.engine?.control(cc, v);
  }
  bend(st: number): void {
    for (const p of this.parts) if (!isKeyboard(p.voice)) p.engine?.bend(st);
  }
  setParams(q: Record<string, unknown>): void {
    for (const p of this.parts) p.engine?.setParams(q);
  }

  /** is any part sounding this (engine) pitch? (the keys on screen show the file's own notes) */
  holds(midi: number): boolean {
    return this.parts.some((p) => p.down.has(midi));
  }
}

export const ensemble = new Ensemble();
