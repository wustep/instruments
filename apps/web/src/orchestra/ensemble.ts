// Orchestra mode: several instruments at once. Each instrument on the stage (a part) is its own
// engine (an AudioWorkletNode) on the page's one AudioContext; they share a bus (orchestra/mix.ts) and
// the analyser. A MIDI file's lines go to the parts by a plan (orchestra/assign.ts), many to many: a
// line may sound on several parts, and a voice may be on the stage twice (two cellos, two grands, each
// its own engine). Played by hand (keys, a MIDI keyboard) the notes go to the instruments chosen on
// the fallboard, one or several (orchestra/keys.ts: the piano, else the leading melodic instrument,
// until one is chosen), or are dealt out by register, each melodic instrument one note (split).
// While the ensemble plays, the single instrument's engine is taken out of the graph (it costs as
// much idle as playing) and put back when the ensemble goes.

import { createInstrument, pianoKeySummary, processorUrl, type KeySummary, type Piano, type VisualFrame } from '@piano-model/engine';
import { audio, fetchDesigns, restLevel, sendLevel, type Route } from '../audio.ts';
import { modLines, PartLevels, volumeRef } from '../expression.ts';
import type { FileEvent, MidiLine, MidiSong } from '../midi-file.ts';
import { addPart, autoPlan, deskOf, fitLineup, fitsStage, isKeyboard, lineupOf, lineupPlan, mayBecome, placeNote, playersOf, playsNote, reassign, removePart, setPartLines, setPartVoice, setRoute, tromboneSizeOf, voiceFromName, voiceFromProgram, VOICE_INFO, VOICES, type Plan, type TromboneSize, type Voice } from './assign.ts';
import { carryKeys, defaultKeys, keyParts, keysFor, keyTargets, setSplit, toggleKey, toggleKeys, type KeysChoice, type KeyTarget } from './keys.ts';
import { busGain } from './mix.ts';
import { piecePlan, type Piece } from './pieces.ts';
import { planByRules, remapRules, rulesOf, type LineRule, type Setup } from './rules.ts';
import { soundSeats } from './seats.ts';
import { addDesk, addSeat, removeSeats, rulesThrough, sectionsOf, seatRules, setSeatsLines, setSeatsRoute, setSeatsVoice, type Reseat, type Section } from './sections.ts';

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
/** the seats of a lineup the stage takes (assign.ts fitLineup): up to stageCap, and a piece's or an
 *  address's longer orchestra as far as it costs the audio thread no more than the heaviest stageCap did */
export const stageLineup = (lineup: Voice[]): Voice[] => fitLineup(lineup, stageCap());
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
  /** where it sits, and is heard from (seats.ts): x across, z upstage, metres */
  seat: [number, number] | null;
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
  /** the file's dynamics on it (expression.ts): its lines' volume, expression, mod wheel and swells */
  levels: PartLevels | null;
  /** a trombone's size for its lines (assign.ts tromboneSizeOf): alto, tenor or bass */
  size?: TromboneSize;
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
  /** the routing as rules (orchestra/rules.ts): each line of the file and the seats it plays on, by
   *  what the file calls it, so that it applies to a file dropped in later (the address carries it);
   *  null: none set (a file is matched to a lineup by register) */
  rules: LineRule[] | null = null;
  /** the setup the ensemble last had (its lineup and routing; the keys start from their default),
   *  for when it comes back on */
  last: Setup | null = null;
  parts: PartLive[] = [];
  readonly changed = new Emitter<void>();
  readonly notes = new Emitter<PartNote>();
  /** which instruments the keys play (orchestra/keys.ts); `keysChanged` when only that changes */
  keys: KeysChoice = keysFor([]);
  readonly keysChanged = new Emitter<void>();
  private bus: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private timers = new Set<number>();
  /** live keys → the parts and pitches that took them */
  private live = new Map<number, KeyTarget[]>();
  /** how many live keys hold each part's pitch (`part:pitch`; two keys an octave apart may both land
   *  on one note of an instrument: it is let go with the last of them) */
  private liveCount = new Map<string, number>();
  /** the pedals, bend and controllers as the hand has them: what an instrument the keys come to
   *  takes up, and one they leave lets go of */
  private hand = { sustain: 0, soft: 0, sostenuto: 0, bend: 0, cc: new Map<number, number>() };
  private gen = 0;
  /** the lines (with no file, an address's rules) that fell silent when the instruments that played them
   *  left the stage, and those instruments: one of them added again takes them back (addVoice) */
  private silenced = new Map<number, Voice[]>();
  /** the file's volume reference and the lines whose mod wheel moves (expression.ts) */
  private ref = 1;
  private wheels = new Set<number>();

  get lines(): MidiLine[] {
    return this.song?.lines ?? [];
  }
  get lineup(): Voice[] {
    return lineupOf(this.plan);
  }

  /** the ensemble on the stage, with a plan (a file's, a piece's, or a lineup) and the rules it came
   *  from (none: a file's plan is its own rules) */
  enter(plan: Plan, song: MidiSong | null, piece: Piece | null = null, byUser = false, rules: LineRule[] | null = null): void {
    this.releaseLive();
    // the keys play the new lineup's default (sync), with nothing held
    this.keys = keysFor([]);
    this.hand = { sustain: 0, soft: 0, sostenuto: 0, bend: 0, cc: new Map() };
    this.plan = plan;
    this.byUser = byUser;
    this.rules = rules ?? (song ? rulesOf(plan, song.lines) : null);
    this.song = song;
    this.ref = song ? volumeRef(song) : 1;
    this.wheels = song ? modLines(song) : new Set();
    this.piece = piece;
    this.silenced.clear();
    this.active = true;
    audio.route = this;
    this.watchSolo();
    this.sync();
    this.changed.emit();
  }

  exit(): void {
    if (!this.active) return;
    this.last = { ...this.setup(), keys: null };
    this.active = false;
    audio.route = null;
    this.releaseLive();
    this.stopFile();
    for (const p of this.parts) this.disposePart(p);
    this.parts = [];
    this.keys = keysFor([]);
    this.song = null;
    this.piece = null;
    this.byUser = false;
    this.rules = null;
    this.silenced.clear();
    // the single instrument back in the graph
    const ctx = audio.ctx;
    if (ctx && audio.piano) {
      audio.piano.connect(ctx.destination);
      if (audio.analyser) audio.piano.output.connect(audio.analyser);
    }
    this.changed.emit();
  }

  /** a file's lines over the current lineup (picked by hand: by its rules, if it has them, else by
   *  register) or on instruments of their own */
  planFor(song: MidiSong, piece: Piece | null): Plan {
    // (a piece seats as much of its orchestra as the stage can carry, the whole symphony included)
    if (piece) return piecePlan(piece, song.lines, Math.max(AUTO_CAP, stageLineup(piece.parts.map((p) => p.voice)).length));
    const rules = this.rulesFor(piece);
    if (rules) return planByRules(song.lines, this.lineup, rules);
    return this.active && this.byUser ? this.planForLineup(song, this.lineup) : autoPlan(song.lines, { cap: AUTO_CAP });
  }
  /** the rules a file dropped now is placed by (planFor), kept with its plan */
  rulesFor(piece: Piece | null): LineRule[] | null {
    return !piece && this.active && this.byUser ? this.rules : null;
  }

  /** the setup as the address carries it (address.ts) */
  setup(): Setup {
    const k = this.keys;
    return { seats: this.lineup, lines: this.rules, keys: k.byUser ? (k.split ? 'split' : [...k.parts]) : null };
  }
  /** what the keys play, as an address sets it (seats in the lineup, or split) */
  setKeysTo(keys: number[] | 'split'): void {
    const n = this.parts.length;
    if (keys === 'split') return this.setKeys({ parts: defaultKeys(this.lineup), split: true, byUser: true });
    const parts = [...new Set(keys.filter((k) => k >= 0 && k < n))].sort((a, b) => a - b);
    if (parts.length) this.setKeys({ parts, split: false, byUser: true });
  }

  /** a file's lines over a given lineup */
  planForLineup(song: MidiSong, lineup: Voice[]): Plan {
    return autoPlan(song.lines, { cap: Math.max(stageCap(), lineup.length), lineup });
  }

  /** a new lineup (picked by hand); a loaded file's lines are matched to it */
  setLineup(voices: Voice[]): void {
    const v = stageLineup(voices);
    const was = this.lineup;
    this.byUser = true;
    this.piece = null;
    this.plan = this.song ? this.planForLineup(this.song, v) : lineupPlan(v);
    // (with a file the lines were matched again by register; with none, the routing set stays with
    // its instruments)
    this.rules = this.song ? rulesOf(this.plan, this.song.lines) : this.rules && remapRules(this.rules, was, v);
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
  /** is there room for one more instrument (of any kind)? The stage's room is its audio thread's
   *  (assign.ts fitsStage): eight instruments of any kind, more as far as they cost no more */
  get roomForMore(): boolean {
    return VOICES.some((v) => this.roomFor(v));
  }
  /** is there room for another of this instrument? */
  roomFor(v: Voice, n = 1): boolean {
    return fitsStage([...this.lineup, ...Array<Voice>(n).fill(v)], stageCap());
  }
  /** may these seats become this instrument (as many pianos as the stage carries)? */
  roomAs(seats: number[], v: Voice): boolean {
    const next = this.lineup.map((x, k) => (seats.includes(k) ? v : x));
    return mayBecome(this.lineup, next, stageCap());
  }

  // ------------------------------------------------------------- sections (orchestra/sections.ts)
  /** the stage's sections: neighbouring seats of one instrument playing the same lines (with no file,
   *  the same lines of the address) */
  get sections(): Section[] {
    return sectionsOf(this.lineup, this.song ? this.plan.parts.map((p) => p.lines) : seatRules(this.plan.parts.length, this.rules));
  }
  /** another desk for the section of these seats (like its last, playing its lines) */
  addDesk(seats: number[]): boolean {
    return this.reseat(addDesk(this.plan, this.lines, seats, stageCap()));
  }
  /** seats off the stage (a desk, a section, every one of a kind; never the last) */
  removeSeats(seats: number[]): boolean {
    return this.reseat(removeSeats(this.plan, this.lines, seats));
  }
  /** a section's seats changed to another instrument, each keeping its lines */
  seatsVoice(seats: number[], v: Voice): boolean {
    return this.reseat(setSeatsVoice(this.plan, this.lines, seats, v, stageCap()));
  }
  /** a section's seats play line `li` too, or no longer */
  seatsRoute(seats: number[], li: number, on: boolean): boolean {
    return this.replan(setSeatsRoute(this.plan, this.lines, seats, li, on));
  }
  /** a section's seats play exactly these lines */
  seatsLines(seats: number[], lis: number[]): boolean {
    return this.replan(setSeatsLines(this.plan, this.lines, seats, lis));
  }
  /**
   * One more of an instrument, as the picker adds it, every other seat's routing kept: it takes back the
   * lines that fell silent when its kind left the stage (else silent lines named for it); with none, a
   * second of a kind already there is another desk of its last section; else it waits for a line. False
   * when the stage has no room.
   */
  addVoice(v: Voice): boolean {
    if (!this.roomFor(v)) return false;
    const keys: { name: string; instrument: string; program: number }[] = this.song ? this.song.lines : (this.rules ?? []).map((r) => ({ name: r.name, instrument: '', program: r.program }));
    const routed = this.song ? this.plan.lines.map((rs) => rs.length > 0) : (this.rules ?? []).map((r) => r.seats.length > 0);
    const kin = (x: Voice | null) => !!x && (x === v || (isKeyboard(x) && isKeyboard(v)));
    const back = keys.map((_, i) => i).filter((i) => !routed[i] && (this.silenced.has(i) ? this.silenced.get(i)!.some(kin) : kin(voiceFromName(keys[i].name) ?? voiceFromName(keys[i].instrument) ?? voiceFromProgram(keys[i].program))));
    if (!back.length) {
      const last = this.sections.filter((s) => s.voice === v).pop();
      if (last) return this.addDesk(last.seats);
    }
    for (const i of back) this.silenced.delete(i);
    return this.reseat(addSeat(this.plan, this.lines, v, this.song ? back : [], stageCap()), this.song ? [] : back);
  }

  private replan(next: Plan | null, rules?: LineRule[]): boolean {
    if (!next) return false;
    if (next === this.plan) return true;
    // (sync keeps the engines that stay; one whose lines change lets go of what it holds, else a note
    // whose line has gone elsewhere would never hear its end)
    const prev = this.plan;
    this.plan = next;
    this.piece = null;
    // the routing by hand: the file's lines as they now go (with no file, a seat changed in place
    // keeps its lines)
    if (this.song) {
      this.remember(prev.lines.map((rs) => rs.map((r) => prev.parts[r.part]?.voice).filter((v): v is Voice => !!v)), next.lines.map((rs) => rs.length > 0));
      this.rules = rulesOf(next, this.lines);
    } else if (rules) this.rules = rules;
    else if (this.rules && next.parts.length !== prev.parts.length) this.rules = remapRules(this.rules, lineupOf(prev), lineupOf(next));
    this.releaseLive();
    this.sync(prev);
    this.changed.emit();
    return true;
  }
  /** a change of seats (orchestra/sections.ts): with no file, an address's rules follow each seat to where
   *  it now sits (a desk added plays its section's lines; a new instrument `extra`, rule indices) */
  private reseat(r: Reseat | null, extra: number[] = []): boolean {
    if (!r) return false;
    if (this.song || !this.rules) return this.replan(r.plan);
    const prev = this.lineup;
    const rules = rulesThrough(this.rules, r.from, extra);
    this.remember(
      this.rules.map((q) => q.seats.map((k) => prev[k]).filter((v): v is Voice => !!v)),
      rules.map((q) => q.seats.length > 0),
    );
    return this.replan(r.plan, rules);
  }
  /** lines (or rules) that played on `was` and now play nowhere: remembered, to come back with their kind */
  private remember(was: Voice[][], now: boolean[]): void {
    was.forEach((vs, i) => {
      if (vs.length && !now[i]) this.silenced.set(i, [...new Set(vs)]);
    });
  }

  // ------------------------------------------------------------- engines
  /** make the parts match the plan: keep an engine where its instrument stays, make the others */
  private sync(prev?: Plan): void {
    const want = this.plan.parts.map((p) => p.voice);
    const linesOf = new Map(this.parts.map((p, i) => [p, prev?.parts[i]?.lines.join() ?? '']));
    const players = playersOf(this.plan);
    const old = this.parts;
    const handBefore = this.handParts();
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
    // the keys keep the instruments they played (wherever they now sit), or take the new default
    this.keys = carryKeys(this.keys, next.map((p) => old.indexOf(p)), want);
    this.handOver(handBefore);
    this.applyGain();
    this.applyVoices();
    this.applySeats();
    this.applySizes();
    if (this.active) void this.ensureEngines();
  }

  private newPart(v: Voice, player = 0): PartLive {
    return { voice: v, player, seat: null, engine: null, frame: null, strike: null, down: new Set(), sched: new Map(), heard: new Map(), epoch: 0, strikes: new Map(), vels: new Map(), lastOn: 0, lastNote: -1, sustain: 0, levels: null, unsubs: [] };
  }

  /** a part lets go of every note it holds or has been sent */
  private dropNotes(p: PartLive): void {
    p.epoch++;
    p.engine?.clearScheduled();
    p.engine?.allNotesOff();
    // its dynamics at rest (the player takes them up again from where the file is)
    if (p.engine) restLevel(p.engine, p.levels?.sent ?? null, this.hand.cc.get(1) ?? this.hand.cc.get(11) ?? this.hand.cc.get(2) ?? null);
    p.levels = null;
    p.sched.clear();
    p.heard.clear();
    for (const m of [...p.down]) this.mark(p, m, 0, false);
  }

  /** each part heard from its seat on the stage (an engine kept moves, gliding, when the lineup does) */
  private applySeats(): void {
    const seats = soundSeats(this.parts.map((p) => VOICE_INFO[p.voice]));
    this.parts.forEach((p, i) => {
      const s = seats[i];
      if (p.seat && p.seat[0] === s[0] && p.seat[1] === s[1]) return;
      p.seat = s;
      p.engine?.setParams({ seat: s });
    });
  }

  /** each trombone the size its lines need (the alto, tenor or bass trombone: one model, three sizes) */
  private applySizes(): void {
    this.parts.forEach((p, i) => {
      if (VOICE_INFO[p.voice].instrument !== 'trombone') return;
      const lines = this.plan.parts[i]?.lines ?? [];
      const s = tromboneSizeOf(lines.map((li) => this.lines[li]).filter(Boolean));
      if (p.size === s) return;
      p.size = s;
      p.engine?.setParams({ size: s });
    });
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

  /** the audio for every part, once the sound has been started by a gesture (an address that brings
   *  the ensemble on as the page opens starts nothing: its engines are made when the sound starts);
   *  resolves when every engine exists */
  async ensureEngines(): Promise<void> {
    if (!this.active || !audio.ctx) return;
    this.making++;
    try {
      await this.makeEngines();
    } finally {
      this.making--;
    }
  }
  /** ensureEngines calls under way */
  private making = 0;

  private async makeEngines(): Promise<void> {
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
        // its seat (after the preset: a piano's preset sets its params)
        if (p.seat) e.setParams({ seat: p.seat });
        if (p.size) e.setParams({ size: p.size });
        this.applyVoices();
        // the ensemble's room: the stage's reverb setting, the grand's lid as the single grand has it
        const room = (audio.piano?.params as Record<string, unknown> | undefined)?.room;
        if (typeof room === 'number') e.setParams({ room });
        // the pedals or bend the hand holds, if the keys play it
        if (this.handParts().includes(p)) this.handOn(p);
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
    audio.state.on((s) => {
      this.muteSolo();
      // the sound started (a gesture) with the ensemble already on: its engines now
      if (s === 'running' && this.active && !this.making && this.parts.some((p) => !p.engine)) void this.ensureEngines();
    });
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
      if (e.kind === 'cc' || e.kind === 'dyn') {
        // the line's dynamics on each instrument that plays it (a piano takes the gain only)
        const lv = (p.levels ??= new PartLevels(this.ref, this.wheels));
        if (!lv.take(e)) continue;
        const prev = lv.sent;
        const next = lv.next(this.plan.parts[r.part]?.lines ?? [e.line!]);
        if (next) sendLevel(eng, prev, next, at);
        continue;
      }
      if (e.kind === 'pedal') {
        // pedals belong to the pianos (a bowed or wind part has none in a file)
        if (!isKeyboard(p.voice)) continue;
        if (e.cc === 64) eng.sustain(e.value, at);
        else if (e.cc === 66) eng.sostenuto(e.value, at);
        else eng.softPedal(e.value, at);
        continue;
      }
      // (a wind of a pair on one staff plays its own voice of the line: Flauto I the top one)
      if (!playsNote(e, deskOf(this.plan, this.lines, e.line!, r.part))) continue;
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
  /** the instruments the keys play now (split: all of them) */
  get keyParts(): number[] {
    return keyParts(this.keys, this.parts.length);
  }
  /** an instrument in or out of what the keys play (the last one stays) */
  toggleKey(k: number): void {
    this.setKeys(toggleKey(this.keys, k, this.parts.length));
  }
  /** a section's desks in or out of what the keys play, together */
  toggleKeys(ks: number[]): void {
    this.setKeys(toggleKeys(this.keys, ks, this.parts.length));
  }
  /** the keys dealt out by register over the ensemble (on), or back to the chosen instruments */
  splitKeys(on: boolean): void {
    this.setKeys(setSplit(this.keys, on));
  }
  private setKeys(c: KeysChoice): void {
    if (c === this.keys) return;
    const before = this.handParts();
    this.releaseLive();
    this.keys = c;
    this.handOver(before);
    this.keysChanged.emit();
  }

  /** a key pressed: on every instrument the keys play, or (split) on one, by register (keys.ts) */
  noteOn(midi: number, vel: number): void {
    if (!this.parts.length) return;
    this.noteOff(midi);
    const voices = this.parts.map((p) => p.voice);
    const busy = new Set<number>();
    for (const ts of this.live.values()) for (const t of ts) if (!isKeyboard(voices[t.part] ?? 'grand')) busy.add(t.part);
    const ts = keyTargets(midi, this.keys, voices, busy);
    // split, every melodic instrument busy: the one that takes it lets go of its old note
    if (this.keys.split) for (const t of ts) if (busy.has(t.part)) for (const [m, xs] of [...this.live]) if (xs.some((x) => x.part === t.part)) this.noteOff(m);
    this.live.set(midi, ts);
    for (const t of ts) {
      const p = this.parts[t.part];
      const key = `${t.part}:${t.pitch}`;
      this.liveCount.set(key, (this.liveCount.get(key) ?? 0) + 1);
      p.engine?.noteOn(t.pitch, vel);
      this.mark(p, t.pitch, vel, true);
    }
  }

  noteOff(midi: number): void {
    const xs = this.live.get(midi);
    if (!xs) return;
    this.live.delete(midi);
    for (const x of xs) {
      const key = `${x.part}:${x.pitch}`;
      const n = this.liveCount.get(key) ?? 1;
      if (n > 1) {
        this.liveCount.set(key, n - 1);
        continue;
      }
      this.liveCount.delete(key);
      this.parts[x.part]?.engine?.noteOff(x.pitch);
      this.mark(this.parts[x.part], x.pitch, 0, false);
    }
  }

  private releaseLive(): void {
    for (const m of [...this.live.keys()]) this.noteOff(m);
    this.liveCount.clear();
  }

  /** the pedals and controllers go where the keys go (the bowed strings' sustain holds the bow) */
  pedal(kind: 'sustain' | 'soft' | 'sostenuto', v: number): void {
    this.hand[kind] = v;
    for (const p of this.handParts()) this.pedalTo(p, kind, v);
  }
  control(cc: number, v: number): void {
    this.hand.cc.set(cc, v);
    for (const p of this.handParts()) if (!isKeyboard(p.voice)) p.engine?.control(cc, v);
  }
  bend(st: number): void {
    this.hand.bend = st;
    for (const p of this.handParts()) if (!isKeyboard(p.voice)) p.engine?.bend(st);
  }
  private pedalTo(p: PartLive, kind: 'sustain' | 'soft' | 'sostenuto', v: number): void {
    if (kind === 'sustain') {
      p.engine?.sustain(v);
      p.sustain = v;
    } else if (isKeyboard(p.voice)) kind === 'soft' ? p.engine?.softPedal(v) : p.engine?.sostenuto(v);
  }
  private handParts(): PartLive[] {
    return keyParts(this.keys, this.parts.length).map((k) => this.parts[k]);
  }
  /** the keys moved from `before` to the instruments they play now: one left lets go of the pedals
   *  and bend the hand holds, one come to takes them up (a controller, the wheel, stays where the
   *  hand left it on an instrument it leaves) */
  private handOver(before: PartLive[]): void {
    const now = this.handParts();
    for (const p of before) if (!now.includes(p) && this.parts.includes(p)) this.handOff(p);
    for (const p of now) if (!before.includes(p)) this.handOn(p);
  }
  private handOff(p: PartLive): void {
    const h = this.hand;
    if (h.sustain) this.pedalTo(p, 'sustain', 0);
    if (h.soft) this.pedalTo(p, 'soft', 0);
    if (h.sostenuto) this.pedalTo(p, 'sostenuto', 0);
    if (h.bend && !isKeyboard(p.voice)) p.engine?.bend(0);
  }
  private handOn(p: PartLive): void {
    const h = this.hand;
    if (h.sustain) this.pedalTo(p, 'sustain', h.sustain);
    if (h.soft) this.pedalTo(p, 'soft', h.soft);
    if (h.sostenuto) this.pedalTo(p, 'sostenuto', h.sostenuto);
    if (isKeyboard(p.voice)) return;
    if (h.bend) p.engine?.bend(h.bend);
    for (const [cc, v] of h.cc) p.engine?.control(cc, v);
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
