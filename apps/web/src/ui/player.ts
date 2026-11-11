// The overlay at the top middle of the stage. With nothing loaded it is three icons: play (the
// instrument's own short piece, orchestra/pieces.ts DEMOS; in an ensemble, the built-in piece that
// best fits its lineup), the pieces (a menu of the ensemble's built-in pieces, each bringing its own
// lineup) and open (a MIDI file from the device: phones have no drop). Drop a .mid file
// anywhere, or open one: it plays. A file with several parts (a quartet, a concerto) puts an
// ensemble on the stage, each line on an instrument of its own (orchestra/assign.ts); a piano piece
// plays on the instrument shown. Loaded, the overlay is its icons and a hairline of progress; with an
// ensemble, a row of the file's lines under it, each showing its instrument (tap one to move it).
// The routing button opens a grid of instruments by lines, many to many: a line on several
// instruments, the whole file on one, a second cello or grand of its own. The hairpin beside the
// hairline is automatic expression (expression.ts), on unless turned off: a file's flat lines
// phrased, its long notes swelling; a file with dynamics of its own plays them as written either way.

import { audio } from '../audio.ts';
import { express, PartLevels, type Expressed } from '../expression.ts';
import { notesAhead, parseMidi, type FileEvent, type MidiSong } from '../midi-file.ts';
import { canReassign, voicesOfLine, VOICE_INFO, VOICES, type Voice } from '../orchestra/assign.ts';
import { ensemble, stageCap } from '../orchestra/ensemble.ts';
import { DEMOS, demoSong, PIECES, pieceForLineup, pieceSong, type Demo, type Piece } from '../orchestra/pieces.ts';
import { tidyName } from '../orchestra/rules.ts';
import { familyOf, seatNames, sectionName, type Family, type Section } from '../orchestra/sections.ts';
import { voiceGlyph } from './controls.ts';
import { h } from './dom.ts';
import { BOW_LOOK, type InstrumentId } from '@piano-model/engine';

const SVGNS = 'http://www.w3.org/2000/svg';
const icon = (d: string) => {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', d);
  s.appendChild(p);
  return s;
};
const PLAY = 'M8 5.5v13l10.5-6.5z';
const PAUSE = 'M7 5.5h3.5v13H7zM13.5 5.5H17v13h-3.5z';
const STOP = 'M7 7h10v10H7z';
/** open a file: a folder */
const OPEN = 'M3 6.6C3 5.7 3.7 5 4.6 5h4.7l2 2h8.1c.9 0 1.6.7 1.6 1.6v8.8c0 .9-.7 1.6-1.6 1.6H4.6c-.9 0-1.6-.7-1.6-1.6zM4.8 9.4v7.8h14.4V9.4z';
/** a desk more, a desk fewer, off the stage */
const PLUS = 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z';
const MINUS = 'M5 11h14v2H5z';
const CROSS = 'M7.4 6 12 10.6 16.6 6 18 7.4 13.4 12 18 16.6 16.6 18 12 13.4 7.4 18 6 16.6 10.6 12 6 7.4z';
/** the grid desk by desk (three rows apart) or by section (a bracket round them) */
const BY_DESK = 'M8 5h11v2.4H8zM8 10.8h11v2.4H8zM8 16.6h11v2.4H8zM4 5h2.4v2.4H4zM4 10.8h2.4v2.4H4zM4 16.6h2.4v2.4H4z';
const BY_SECTION = 'M8 5h11v2.4H8zM8 10.8h11v2.4H8zM8 16.6h11v2.4H8zM3.5 5H6v1.6H5.1v10.8H6V19H3.5z';
/** routing: a grid of dots, some lit (instruments by lines) */
const ROUTE = 'M5 5h3v3H5zM10.5 10.5h3v3h-3zM16 5h3v3h-3zM16 16h3v3h-3zM5 16h3v3H5z';
/** a piece's lineup in the menu, a glyph per instrument; a large orchestra's (more than ten) a glyph per
 *  instrument kind, with how many (the symphony's two flutes: one flute, ×2), so it fits the menu */
function lineupGlyphs(voices: Voice[]): HTMLElement {
  const row = h('span', { class: 'sm-lineup', 'aria-hidden': 'true' });
  if (voices.length <= 10) {
    row.append(...voices.map((v) => voiceGlyph(v)));
    return row;
  }
  row.classList.add('sm-many');
  for (let i = 0; i < voices.length; ) {
    let j = i;
    while (j < voices.length && voices[j] === voices[i]) j++;
    const g = h('span', { class: 'sm-v' }, voiceGlyph(voices[i]));
    if (j - i > 1) g.append(h('span', { class: 'sm-n' }, `×${j - i}`));
    row.append(g);
    i = j;
  }
  return row;
}
/** the pieces: a list, and a note */
const PIECES_ICON = 'M3 6h11.2v1.7H3zM3 10h11.2v1.7H3zM3 14h8v1.7H3zM17 6v7.6a2.6 2.6 0 1 0 1.6 2.4V8.6H21V6z';
/** automatic expression: a messa di voce as a score writes it, crescendo then diminuendo, the open
 *  ends meeting (drawn, not filled) */
const HAIRPIN = 'M11.3 8.6 1.6 12l9.7 3.4M12.7 8.6l9.7 3.4-9.7 3.4';
const hairpin = () => {
  const s = icon(HAIRPIN);
  s.classList.add('pl-hairpin');
  return s;
};

const AUTO_KEY = 'piano-model.expression';
/** automatic expression is on unless it was turned off on this device */
const readAuto = (): boolean => {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'off';
  } catch {
    return true;
  }
};
/** a song's automatic expression, worked out once */
const expressed = new WeakMap<MidiSong, Expressed>();
const expressOf = (s: MidiSong): Expressed => {
  let x = expressed.get(s);
  if (!x) expressed.set(s, (x = express(s)));
  return x;
};

/** how far ahead of its sound a note is told to the bows (s): past what they plan with (BOW_LOOK),
 *  with room for a late timer */
const BOW_AHEAD = BOW_LOOK + 1;

/** a line's name as the file writes it, tidied ("violinI:" → "violin I"; LilyPond's "\new" is none) */
export const lineName = (name: string, inst: string, i: number): string => tidyName(name) || inst.trim() || `line ${i + 1}`;

export class MidiPlayer {
  readonly el: HTMLElement;
  private song: MidiSong | null = null;
  private idx = 0;
  private pos = 0;
  private pos0 = 0;
  private t0 = 0;
  private timer = 0;
  private raf = 0;
  playing = false;
  private playBtn: HTMLButtonElement;
  private stopBtn: HTMLButtonElement;
  private openBtn: HTMLButtonElement;
  private picker: HTMLInputElement;
  private bar: HTMLElement;
  private fill: HTMLElement;
  private strip: HTMLElement;
  private chips: HTMLButtonElement[] = [];
  private menu: HTMLElement | null = null;
  private routeBtn: HTMLButtonElement;
  private exprBtn: HTMLButtonElement;
  /** automatic expression (expression.ts): wanted, and the events as they play (the file's own, or
   *  with its flat lines phrased) */
  auto = readAuto();
  private events: FileEvent[] = [];
  /** the bows are told what is to come (audio.foreseeFileEvent): the first event not yet told, and
   *  each note's length and dynamics, by its place in `events` (midi-file.ts notesAhead; kept for the list
   *  they were made of) */
  private told = 0;
  private aheadOf: { of: FileEvent[]; len: Float32Array; dyn: Float32Array } | null = null;
  private piecesBtn: HTMLButtonElement;
  private pieces: HTMLElement | null = null;
  private grid: HTMLElement | null = null;
  /** the grid's row headers (one per instrument), lit while it sounds */
  private rowHeads: HTMLButtonElement[] = [];

  /** the instrument's own piece, when that is what is loaded (it follows the instrument shown) */
  demo: Demo | null = null;
  /** the instrument is changing: whether an own piece was playing (or on its way), so the next
   *  instrument's plays; null when no change is under way (a knob reset re-sets the same one) */
  private follow: boolean | null = null;
  /** the latest request for a piece (a slower earlier fetch must not replace it), and the one for
   *  an instrument's own piece still on its way, if any */
  private asked = 0;
  private wanting = 0;
  private files = new Map<string, Promise<ArrayBuffer>>();

  constructor() {
    this.playBtn = h('button', { class: 'pl-btn pl-play', type: 'button', 'aria-label': 'Play', 'data-tip': 'play', onclick: () => (this.playing ? this.pause() : this.song ? void this.play() : void this.playOwn().catch((e) => console.warn('piece:', e))) });
    this.playBtn.appendChild(icon(PLAY));
    this.stopBtn = h('button', { class: 'pl-btn pl-stop', type: 'button', 'aria-label': 'Stop', 'data-tip': 'stop', onclick: () => (this.demo ? this.unload() : this.stop()) });
    this.stopBtn.appendChild(icon(STOP));
    // open a file: the device's own picker (a phone's Files, a computer's dialog)
    this.picker = h('input', { type: 'file', accept: '.mid,.midi,.kar,.smf,audio/midi,audio/x-midi,audio/mid', hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
    this.picker.addEventListener('change', () => {
      const f = this.picker.files?.[0];
      this.picker.value = '';
      if (f) void f.arrayBuffer().then((b) => this.load(b));
    });
    this.openBtn = h('button', { class: 'pl-btn pl-open', type: 'button', 'aria-label': 'Open a MIDI file', 'data-tip': 'open a MIDI file', onclick: () => {
      // (the sound starts inside the tap: the file arrives later, outside it)
      void audio.start().catch(() => undefined);
      this.picker.click();
    } });
    this.openBtn.appendChild(icon(OPEN));
    this.fill = h('i', { class: 'pl-fill' });
    // (the hairline has no tooltip: its fill says where the file is; it still scrubs)
    this.bar = h('div', { class: 'pl-bar', role: 'slider', 'aria-label': 'Position', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', tabindex: '0' }, this.fill);
    this.bar.addEventListener('pointerdown', (e) => {
      if (!this.song) return;
      const r = this.bar.getBoundingClientRect();
      this.seek(((e.clientX - r.left) / r.width) * this.song.duration);
    });
    this.strip = h('div', { class: 'pl-lines', role: 'group', 'aria-label': 'The file’s lines and their instruments', hidden: true });
    this.routeBtn = h('button', { class: 'pl-btn pl-route', type: 'button', 'aria-label': 'Routing: which instrument takes which line', 'data-tip': 'routing', 'aria-expanded': 'false', onclick: () => this.toggleGrid() });
    this.routeBtn.appendChild(icon(ROUTE));
    this.exprBtn = h('button', { class: 'pl-btn pl-expr', type: 'button', 'aria-pressed': String(this.auto), 'aria-label': 'Automatic expression', 'data-tip': 'expression', onclick: () => this.setAuto(!this.auto) });
    this.exprBtn.appendChild(hairpin());
    // the pieces that come with the stage, next to the file they are the alternative to: with one
    // instrument or an ensemble on the stage alike, a piece brings its own ensemble
    this.piecesBtn = h('button', { class: 'pl-btn pl-pieces score-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Pieces for the ensemble', 'data-tip': 'pieces', onclick: () => this.togglePieces() });
    this.piecesBtn.appendChild(icon(PIECES_ICON));
    this.el = h('div', { class: 'player idle', role: 'group', 'aria-label': 'MIDI file' }, h('div', { class: 'pl-row' }, h('div', { class: 'pl-btns' }, this.playBtn, this.stopBtn), this.bar, this.exprBtn, this.routeBtn, this.piecesBtn, this.openBtn), this.strip, this.picker);
    this.attachDrop();
    ensemble.changed.on(() => {
      this.buildStrip();
      this.sync();
      // an instrument whose lines changed is at rest: the controllers as they stand, again
      if (this.playing && audio.ctx) for (const e of PartLevels.chase(this.events.slice(0, this.idx), Infinity)) audio.scheduleFileEvent(e, audio.ctx.currentTime);
      // and the bows that play the lines now are told what is to come
      this.told = this.idx;
    });
    // an instrument's own piece follows the instrument shown: paused before the engine swaps, the new
    // one's piece played once it is there (paused or stopped, the overlay just comes back to rest)
    audio.instrumentChanging.on(() => {
      this.follow = (!!this.demo && this.playing) || (this.wanting !== 0 && this.wanting === this.asked);
      if (this.demo) this.pause();
    });
    audio.instrumentChanged.on((id) => {
      const go = this.follow;
      this.follow = null;
      if (go !== null && this.demo) this.unload();
      if (go) void this.loadDemo(id).catch((e) => console.warn('piece:', e));
      this.sync();
    });
    this.sync();
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Element;
      if (this.menu && !this.menu.contains(t) && !t.closest?.('[data-menu-anchor]')) this.closeMenu();
      if (this.grid && !this.grid.contains(t) && !this.routeBtn.contains(t) && !this.menu?.contains(t)) this.closeGrid();
      if (this.pieces && !this.pieces.contains(t) && !this.piecesBtn.contains(t)) this.closePieces();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.pieces) this.closePieces(true);
      else if (this.menu) this.closeMenu(true);
      else if (this.grid) this.closeGrid(true);
      else return;
      e.stopPropagation();
    });
  }

  // ------------------------------------------------------------- the pieces
  /** the menu of built-in pieces under its button, kept on the screen: each a composer, a title and
   *  its lineup; one tap plays it on its own ensemble */
  private togglePieces(): void {
    if (this.pieces) return this.closePieces();
    this.closeMenu();
    this.closeGrid();
    const items = PIECES.map((pc, i) => {
      const b = h('button', { class: 'sm-item', type: 'button', role: 'menuitem', 'data-piece': pc.id }, h('span', { class: 'sm-who' }, pc.composer), h('span', { class: 'sm-what' }, pc.title), lineupGlyphs(pc.parts.map((q) => q.voice)));
      b.setAttribute('aria-label', `${pc.composer}, ${pc.title}: ${pc.parts.map((q) => VOICE_INFO[q.voice].label).join(', ')}`);
      b.addEventListener('click', () => {
        this.closePieces();
        void this.loadPiece(i).catch((e) => console.warn('piece:', e));
      });
      return b;
    });
    const credit = h('a', { class: 'sm-credit', href: '/notes', 'data-route': 'notes' }, 'public domain · Mutopia Project');
    credit.addEventListener('click', () => this.closePieces());
    const m = h('div', { class: 'score-menu', role: 'menu', 'aria-label': 'Pieces' }, ...items, credit);
    this.el.append(m);
    const r = this.piecesBtn.getBoundingClientRect();
    const pr = this.el.getBoundingClientRect();
    const w = m.offsetWidth;
    m.style.left = `${Math.max(6 - pr.left, Math.min(window.innerWidth - 6 - pr.left - w, r.left + r.width / 2 - pr.left - w / 2))}px`;
    m.style.top = `${r.bottom - pr.top + 4}px`;
    this.pieces = m;
    this.piecesBtn.setAttribute('aria-expanded', 'true');
    (items[0] as HTMLElement | undefined)?.focus();
  }

  private closePieces(refocus = false): void {
    if (!this.pieces) return;
    this.pieces.remove();
    this.pieces = null;
    this.piecesBtn.setAttribute('aria-expanded', 'false');
    if (refocus) this.piecesBtn.focus();
  }

  /** the file loaded (playing or not) */
  get loaded(): MidiSong | null {
    return this.song;
  }

  // ------------------------------------------------------------- automatic expression
  /** the loaded file's events as they will play (with automatic expression where it is wanted and
   *  the file has flat lines), and the single instrument told whose dynamics it plays */
  private perform(): void {
    const s = this.song;
    const x = s ? expressOf(s) : null;
    this.events = s ? (this.auto && x!.shaped ? x!.events : s.events) : [];
    audio.fileSong(s);
    this.syncExpr(x);
  }

  /** automatic expression on or off (remembered on this device, unless an address set it for the
   *  page); a file playing goes on from where it is heard, with or without it */
  setAuto(on: boolean, remember = true): void {
    if (on === this.auto) return;
    this.auto = on;
    if (remember)
      try {
        localStorage.setItem(AUTO_KEY, on ? 'on' : 'off');
      } catch {
        /* private mode */
      }
    const was = this.playing;
    if (was) this.pause();
    this.perform();
    if (was) void this.play();
    this.autoSubs.forEach((cb) => cb());
  }
  private autoSubs = new Set<() => void>();
  /** automatic expression turned on or off (the address follows) */
  onAuto(cb: () => void): () => void {
    this.autoSubs.add(cb);
    return () => this.autoSubs.delete(cb);
  }

  /** the hairpin: pressed when automatic expression is on; its tip says when the file has
   *  dynamics of its own (it then plays them either way) */
  private syncExpr(x: Expressed | null): void {
    const b = this.exprBtn;
    b.setAttribute('aria-pressed', String(this.auto));
    const own = !!x && !x.shaped;
    b.classList.toggle('own', own);
    b.dataset.tip = own ? 'expression · the file’s own' : this.auto ? 'expression · on' : 'expression · off';
    b.setAttribute('aria-label', own ? 'Automatic expression (the file has its own dynamics)' : 'Automatic expression');
  }

  /** what the player schedules (tests and tools) */
  get scheduled(): readonly FileEvent[] {
    return this.events;
  }

  private attachDrop(): void {
    const isMidi = (f: File) => /\.(mid|midi|smf|kar)$/i.test(f.name) || /midi/.test(f.type);
    let depth = 0;
    window.addEventListener('dragenter', (e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      depth++;
      document.documentElement.dataset.drop = '1';
    });
    window.addEventListener('dragleave', () => {
      if (--depth <= 0) {
        depth = 0;
        delete document.documentElement.dataset.drop;
      }
    });
    window.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      depth = 0;
      delete document.documentElement.dataset.drop;
      const f = [...(e.dataTransfer?.files ?? [])].find(isMidi);
      if (!f) return;
      e.preventDefault();
      void f.arrayBuffer().then((b) => this.load(b));
    });
  }

  /**
   * Load a file (replacing the current one) and play it. A piece, a file whose lines want more than
   * one instrument, or any file while the ensemble is on: the ensemble plays it. Otherwise (a piano
   * piece) the instrument shown plays every line.
   */
  async load(buf: ArrayBuffer, piece: Piece | null = null, onStage = false): Promise<void> {
    let song: MidiSong;
    try {
      song = pieceSong(parseMidi(buf), piece);
    } catch (err) {
      console.warn('not a playable MIDI file:', err);
      return;
    }
    this.asked++;
    this.stop();
    this.song = song.events.length ? song : null;
    this.demo = null;
    this.perform();
    // (a lineup picked by hand stays picked: the file was matched to it, by the routing it has if it
    // has one: an address's, or the last file's; `onStage`: a piece played on the lineup as it stands)
    const keep = onStage && ensemble.active;
    const plan = keep ? ensemble.planOnStage(song, piece) : ensemble.planFor(song, piece);
    const rules = keep ? ensemble.rules : ensemble.rulesFor(piece);
    if (piece || ensemble.active || plan.parts.length > 1) ensemble.enter(plan, song, piece, keep || (!piece && ensemble.active && ensemble.byUser), rules);
    this.buildStrip();
    this.sync();
    if (this.song) await this.play();
  }

  /** a file of public/pieces/, fetched once */
  private fetchFile(file: string): Promise<ArrayBuffer> {
    let p = this.files.get(file);
    if (!p) {
      p = fetch(`/pieces/${file}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${file}`);
        return r.arrayBuffer();
      });
      p.catch(() => this.files.delete(file));
      this.files.set(file, p);
    }
    return p;
  }

  /** nothing loaded: the play icon plays the instrument's own piece, or (the ensemble on) the built-in
   *  piece nearest its lineup, on that lineup as it stands (its seats and routing, organised by hand or by
   *  an address, kept: a piece chosen from the pieces menu brings its own) */
  async playOwn(): Promise<void> {
    if (ensemble.active) return this.loadPiece(pieceForLineup(ensemble.lineup), true);
    return this.loadDemo(audio.instrument);
  }

  /** an instrument's own short piece, played on it alone (no ensemble) */
  async loadDemo(id: InstrumentId = audio.instrument): Promise<void> {
    const d = DEMOS[id];
    if (!d) return;
    const ask = ++this.asked;
    this.wanting = ask;
    // start the sound inside the gesture that asked for it (the fetch would lose it)
    void audio.start().catch(() => undefined);
    const buf = await this.fetchFile(d.file).finally(() => {
      if (this.wanting === ask) this.wanting = 0;
    });
    // (the stage moved on while it came: another piece asked for, another instrument, an ensemble)
    if (ask !== this.asked || ensemble.active || audio.instrument !== id) return;
    const song = demoSong(parseMidi(buf), d);
    this.stop();
    this.song = song;
    this.demo = d;
    this.perform();
    this.buildStrip();
    this.sync();
    await this.play();
  }

  /** back to rest: nothing loaded (the overlay's two icons) */
  unload(): void {
    this.stop();
    this.song = null;
    this.demo = null;
    this.perform();
    this.buildStrip();
    this.sync();
  }

  /** the overlay's icons for what is loaded: at rest, play (the piece it would play, in its tip) and
   *  open; loaded, play or pause, stop, the hairline, routing (a file's lines) and open */
  private sync(): void {
    const rest = !this.song;
    this.el.classList.toggle('idle', rest);
    this.stopBtn.hidden = rest;
    this.bar.hidden = rest;
    this.exprBtn.hidden = rest;
    this.routeBtn.hidden = rest || !this.song!.lines.length || !!this.demo;
    if (rest) {
      const pc = ensemble.active ? PIECES[pieceForLineup(ensemble.lineup)] : DEMOS[audio.instrument];
      const name = pc ? `${pc.composer}, ${pc.title}` : '';
      this.playBtn.dataset.tip = name ? `play · ${name}` : 'play';
      this.playBtn.setAttribute('aria-label', name ? `Play ${name}` : 'Play');
    } else if (!this.playing) {
      this.playBtn.dataset.tip = 'play';
      this.playBtn.setAttribute('aria-label', 'Play');
    }
  }

  /** a built-in piece (orchestra/pieces.ts), fetched and played */
  async loadPiece(i: number, onStage = false): Promise<void> {
    const piece = PIECES[i];
    if (!piece) return;
    // start the sound inside the gesture that asked for it (the fetch would lose it)
    void audio.start().catch(() => undefined);
    const ask = ++this.asked;
    const buf = await this.fetchFile(piece.file);
    if (ask !== this.asked) return;
    await this.load(buf, piece, onStage);
  }

  /** the ensemble left the stage: what is scheduled stops (the file stays, for the one instrument) */
  ensembleLeft(): void {
    this.pause();
    this.buildStrip();
  }

  async play(): Promise<void> {
    if (!this.song) return;
    await audio.start().catch(() => undefined);
    const ctx = audio.ctx;
    if (!ctx || !audio.piano) return;
    if (ensemble.active) await ensemble.ensureEngines();
    const ev = this.events;
    if (this.pos >= this.song.duration) this.pos = 0;
    // first event at or after the position
    let lo = 0;
    let hi = ev.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ev[mid].t < this.pos) lo = mid + 1;
      else hi = mid;
    }
    this.idx = lo;
    this.told = lo;
    this.pos0 = this.pos;
    this.t0 = ctx.currentTime + 0.12;
    // the file's controllers as they stand where it starts (a resume, a seek: its volume, expression,
    // mod wheel and any swell under way)
    for (const e of PartLevels.chase(ev.slice(0, lo), Infinity)) audio.scheduleFileEvent(e, this.t0);
    this.playing = true;
    this.setIcon();
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 30);
    const draw = () => {
      this.paint();
      if (this.playing) this.raf = requestAnimationFrame(draw);
    };
    this.raf = requestAnimationFrame(draw);
  }

  /** Schedule ~0.2 s ahead, sample-accurately, on the AudioContext clock. The bowed instruments are
   *  told each note BOW_AHEAD seconds before it sounds (when it will begin, how hard, how long, the
   *  dynamics over it), so
   *  their bows are planned as by a player reading the part; the notes themselves are scheduled as
   *  ever. */
  private tick(): void {
    const ctx = audio.ctx;
    if (!ctx || !this.song) return;
    const now = ctx.currentTime;
    const ev = this.events;
    if (this.aheadOf?.of !== ev) this.aheadOf = { of: ev, ...notesAhead(ev) };
    const { len, dyn } = this.aheadOf;
    while (this.told < ev.length) {
      const e = ev[this.told];
      const at = this.t0 + (e.t - this.pos0);
      if (at > now + BOW_AHEAD) break;
      if (e.kind === 'on' && len[this.told] > 0) audio.foreseeFileEvent(e, Math.max(at, now), len[this.told], dyn[this.told]);
      this.told++;
    }
    while (this.idx < ev.length) {
      const e = ev[this.idx];
      const at = this.t0 + (e.t - this.pos0);
      if (at > now + 0.2) break;
      audio.scheduleFileEvent(e, Math.max(at, now));
      this.idx++;
    }
    this.pos = Math.max(0, this.pos0 + (now - this.t0));
    // the end: an instrument's own piece leaves the overlay at rest; a file stays, rewound
    if (this.idx >= ev.length && this.pos > this.song.duration + 1) {
      if (this.demo) this.unload();
      else this.stop();
    }
  }

  /** the song position being heard (the progress line, and where a pause resumes) */
  private heardPos(): number {
    if (!this.playing || !audio.ctx) return this.pos;
    return Math.max(this.pos0, Math.min(this.pos, this.pos0 + (audio.audibleTime() - this.t0)));
  }

  pause(): void {
    if (!this.playing) return;
    this.pos = this.heardPos();
    this.playing = false;
    window.clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    audio.stopFile();
    this.setIcon();
    this.paint();
  }

  stop(): void {
    this.pause();
    audio.stopFile();
    this.pos = 0;
    this.paint();
  }

  seek(t: number): void {
    if (!this.song) return;
    const was = this.playing;
    this.pause();
    this.pos = Math.max(0, Math.min(this.song.duration, t));
    this.paint();
    if (was) void this.play();
  }

  private setIcon(): void {
    this.playBtn.replaceChildren(icon(this.playing ? PAUSE : PLAY));
    this.playBtn.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    this.playBtn.dataset.tip = this.playing ? 'pause' : 'play';
    if (!this.playing) this.sync();
  }

  private paint(): void {
    const f = this.song && this.song.duration > 0 ? Math.min(1, this.heardPos() / this.song.duration) : 0;
    this.fill.style.transform = `scaleX(${f})`;
    this.bar.setAttribute('aria-valuenow', String(Math.round(f * 100)));
    this.glow();
  }

  // ------------------------------------------------------------- the lines and their instruments
  private buildStrip(): void {
    // (a section's menu opened from the stage is built again where it is, for the section's first seat)
    const seat = this.menuSeat && this.menuAt ? { ...this.menuSeat, at: this.menuAt } : null;
    this.closeMenu();
    this.buildChips();
    if (seat && ensemble.active && seat.k < ensemble.lineup.length) this.openSeatMenu(seat.k, seat.at, { lines: seat.lines, again: true });
  }
  private buildChips(): void {
    const song = this.song;
    const show = !!song && ensemble.active && ensemble.song === song;
    this.strip.hidden = !show;
    this.chips = [];
    // routing: a file with lines (on the ensemble, or on the one instrument shown, which it brings on)
    this.routeBtn.hidden = !song || !song.lines.length || !!this.demo;
    if (!show) {
      this.strip.replaceChildren();
      this.closeGrid();
      return;
    }
    const plan = ensemble.plan;
    this.chips = song.lines.map((l, i) => {
      const vs = voicesOfLine(plan, i);
      const name = lineName(l.name, l.instrument, i);
      const to = vs.length ? vs.map((v) => VOICE_INFO[v].label).join(' + ') : 'silent';
      const b = h('button', { class: 'pl-line', type: 'button', 'data-line': String(i), 'data-voice': vs[0] ?? 'none', 'data-voices': vs.join(' '), 'data-menu-anchor': '', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `${name}: ${to}. Change its instrument`, 'data-tip': `${name} · ${to}` });
      b.append(vs.length ? voiceGlyph(vs[0]) : muteGlyph());
      // on more than one instrument: a section's desks (×2: the flutes on the flutes' staff), else how many more
      if (vs.length > 1) b.append(h('span', { class: 'pl-more', 'aria-hidden': 'true' }, vs.every((v) => v === vs[0]) ? `×${vs.length}` : `+${vs.length - 1}`));
      b.addEventListener('click', () => this.openLineMenu(i, b));
      return b;
    });
    this.strip.replaceChildren(...this.chips);
    if (this.grid) this.buildGrid();
  }

  /** each line's instrument lit while it sounds; the grid's instruments too */
  private glow(): void {
    if (!this.chips.length) return;
    const now = performance.now();
    const plan = ensemble.plan;
    const sounding = (k: number) => {
      const p = ensemble.parts[k];
      return !!p && (p.down.size > 0 || now - p.lastOn < 120);
    };
    this.chips.forEach((c, i) => {
      const on = (plan.lines[i] ?? []).some((r) => sounding(r.part));
      if (c.classList.contains('on') !== on) c.classList.toggle('on', on);
    });
    this.rowHeads.forEach((c, r) => {
      const on = (this.rowSeats[r] ?? []).some(sounding);
      if (c.classList.contains('on') !== on) c.classList.toggle('on', on);
    });
  }

  /** a small menu of instruments under `anchor` (an element, or a point on the screen: an instrument tapped
   *  on the stage): each a glyph, `checked` lit, `ok` offered, and `extra` items after them. `again`: the
   *  same menu built afresh where it is (a desk added from it), not closed */
  private openMenu(key: string, anchor: HTMLElement | { x: number; y: number }, label: string, checked: (v: Voice | null) => boolean, ok: (v: Voice | null) => boolean, pick: (v: Voice | null) => void, opts: { silent?: boolean; extra?: HTMLElement[]; again?: boolean; cls?: string } = {}): void {
    const again = this.menu?.dataset.key === key;
    this.closeMenu();
    this.closePieces();
    if (again && !opts.again) return;
    const el = anchor instanceof HTMLElement ? anchor : null;
    const item = (v: Voice | null) => {
      const can = checked(v) || ok(v);
      const name = v ? VOICE_INFO[v].label : 'silent';
      const b = h('button', { class: 'pl-pick', type: 'button', role: 'menuitemradio', 'data-voice': v ?? 'none', 'aria-checked': String(checked(v)), 'aria-label': can ? name : `${name} (the stage is full)`, 'data-tip': can ? name : `${name} · the stage is full`, disabled: !can });
      b.append(v ? voiceGlyph(v) : muteGlyph());
      b.addEventListener('click', () => {
        this.closeMenu();
        pick(v);
        // back to the anchor, or (the strip and grid rebuilt) its new self, unless the pick moved on
        if (!el || (this.el.contains(document.activeElement) && document.activeElement !== b)) return;
        const again = el.isConnected ? el : (this.el.querySelector(el.dataset.cell ? `[data-cell="${el.dataset.cell}"]` : `.pl-line[data-line="${el.dataset.line}"]`) as HTMLElement | null);
        again?.focus();
      });
      return b;
    };
    const items: HTMLElement[] = VOICES.map(item);
    if (opts.silent) items.push(item(null));
    const m = h('div', { class: `pl-menu${opts.cls ? ` ${opts.cls}` : ''}`, role: 'menu', 'aria-label': label, 'data-key': key }, ...items, ...(opts.extra ?? []));
    // (measured where it will stand: at the player's left, a box placed far right would be squeezed)
    m.style.left = '0px';
    this.el.append(m);
    // under its anchor (a point on the stage: under it, else over it), kept on the screen
    const r = el ? el.getBoundingClientRect() : new DOMRect((anchor as { x: number }).x, (anchor as { y: number }).y, 0, 0);
    const pr = this.el.getBoundingClientRect();
    const w = m.offsetWidth;
    const hh = m.offsetHeight;
    const x = Math.max(6 - pr.left, Math.min(window.innerWidth - 6 - pr.left - w, r.left + r.width / 2 - pr.left - w / 2));
    const gap = el ? 4 : 14;
    let y = r.bottom + gap;
    if (!el && y + hh > window.innerHeight - 6) y = Math.max(6, r.top - gap - hh);
    m.style.left = `${x}px`;
    m.style.top = `${y - pr.top}px`;
    el?.setAttribute('aria-expanded', 'true');
    this.menu = m;
    this.menuAnchor = el;
    this.menuAt = el ? null : { x: r.left, y: r.top };
    ((m.querySelector('[aria-checked="true"]') ?? m.querySelector('button:not(:disabled)')) as HTMLElement | null)?.focus();
  }
  private menuAnchor: HTMLElement | null = null;
  /** where a menu opened from the stage was asked for (it is built again there as the lineup changes) */
  private menuAt: { x: number; y: number } | null = null;
  /** the section a menu is open for, by its first seat, and whether it shows its lines (from the stage) */
  private menuSeat: { k: number; lines: boolean } | null = null;

  /** a line's chip: its instrument, and only that one (a tap moves it; silent leaves it out) */
  private openLineMenu(li: number, chip: HTMLButtonElement): void {
    const plan = ensemble.plan;
    const cur = voicesOfLine(plan, li);
    const l = ensemble.lines[li];
    this.openMenu(
      `line:${li}`,
      chip,
      `Instrument for ${lineName(l.name, l.instrument, li)}`,
      (v) => (v ? cur.includes(v) : cur.length === 0),
      (v) => canReassign(plan, ensemble.lines, li, v, stageCap()),
      (v) => {
        if (v ? !(cur.length === 1 && cur[0] === v) : cur.length) ensemble.reassignLine(li, v);
      },
      { silent: true },
    );
  }

  private closeMenu(refocus = false): void {
    if (!this.menu) return;
    this.menu.remove();
    this.menu = null;
    this.menuSeat = null;
    this.menuAt = null;
    const a = this.menuAnchor;
    this.menuAnchor = null;
    a?.setAttribute('aria-expanded', 'false');
    if (refocus && a?.isConnected) a.focus();
  }

  // ------------------------------------------------------------- a section's menu
  /**
   * The menu of the section seat `k` is a desk of (orchestra/sections.ts), under its row in the grid or
   * where its instrument was tapped on the stage: the instruments (each desk becomes it, keeping its
   * lines), then another desk (a seat like its last, playing the same lines), one desk fewer, and off the
   * stage. From the stage, with a file loaded, the file's lines too, numbered as the grid's columns: a tap
   * gives the section a line or takes it away. It stays open while desks and lines change.
   */
  openSeatMenu(k: number, anchor: HTMLElement | { x: number; y: number }, opts: { lines?: boolean; again?: boolean; seats?: number[] } = {}): void {
    if (!ensemble.active) return;
    const secs = ensemble.sections;
    const sec = opts.seats ? { voice: ensemble.lineup[opts.seats[0]], seats: opts.seats, lines: ensemble.plan.parts[opts.seats[0]]?.lines ?? [] } : secs.find((s) => s.seats.includes(k));
    if (!sec?.voice) return this.closeMenu();
    const seats = sec.seats;
    const k0 = seats[0];
    const names = seatNames(ensemble.lineup);
    const label = sectionName(sec, names);
    const many = seats.length > 1;
    const song = this.song && ensemble.song === this.song ? this.song : null;
    const withLines = !!opts.lines && !!song && song.lines.length > 0;
    const keep = () => ({ lines: withLines, again: true, seats: opts.seats ? seats : undefined });
    // after a change that keeps the section: its menu again, where it was (the grid's row is rebuilt)
    const stay = (k: number) => {
      const at = this.menuAt ?? (anchor instanceof HTMLElement ? null : anchor);
      const row = this.grid?.querySelector(`[data-cell="r${k}"]`) as HTMLElement | null;
      const where = at ?? row;
      if (where) this.openSeatMenu(k, where, keep());
    };
    const act = (cls: string, d: string, tip: string, aria: string, can: boolean, go: () => void) => {
      const b = h('button', { class: `pl-pick ${cls}`, type: 'button', role: 'menuitem', 'aria-label': aria, 'data-tip': tip, disabled: !can });
      b.append(icon(d));
      b.addEventListener('click', go);
      return b;
    };
    const voice = sec.voice;
    const what = VOICE_INFO[voice].label;
    const extra: HTMLElement[] = [];
    if (withLines) {
      extra.push(h('i', { class: 'pl-sep', 'aria-hidden': 'true' }));
      song!.lines.forEach((l, i) => {
        const on = sec.lines.includes(i);
        const nm = lineName(l.name, l.instrument, i);
        const b = h('button', { class: 'pl-ln', type: 'button', role: 'menuitemcheckbox', 'data-line': String(i), 'aria-checked': String(on), 'aria-label': `${nm} on the ${label}`, 'data-tip': `${i + 1} · ${nm}` }, String(i + 1));
        b.addEventListener('click', () => {
          ensemble.seatsRoute(seats, i, !on);
          stay(k0);
          (this.menu?.querySelector(`.pl-ln[data-line="${i}"]`) as HTMLElement | null)?.focus();
        });
        extra.push(b);
      });
    }
    extra.push(h('i', { class: 'pl-sep', 'aria-hidden': 'true' }));
    const roomy = ensemble.roomFor(voice);
    extra.push(
      act('pl-desk', PLUS, roomy ? 'another desk' : 'another desk · the stage is full', `Another ${what} desk, playing the same lines${roomy ? '' : ' (the stage is full)'}`, roomy, () => {
        if (!ensemble.addDesk(seats)) return;
        stay(k0);
        (this.menu?.querySelector('.pl-desk') as HTMLElement | null)?.focus();
      }),
    );
    if (many)
      extra.push(
        act('pl-less', MINUS, 'one desk fewer', `One ${what} desk fewer`, true, () => {
          if (!ensemble.removeSeats([seats[seats.length - 1]])) return;
          stay(k0);
          (this.menu?.querySelector('.pl-less, .pl-desk') as HTMLElement | null)?.focus();
        }),
      );
    extra.push(
      act('pl-off', CROSS, many ? 'take them off' : 'take it off', `Take the ${label} off the stage`, seats.length < ensemble.lineup.length, () => {
        this.closeMenu();
        ensemble.removeSeats(seats);
        (this.grid?.querySelector('[data-cell="add"]') as HTMLElement | null)?.focus();
      }),
    );
    this.openMenu(
      `seat:${k0}:${seats.length}`,
      anchor,
      label,
      (v) => v === voice,
      (v) => !!v && ensemble.roomAs(seats, v),
      (v) => {
        if (v && v !== voice) ensemble.seatsVoice(seats, v);
      },
      { extra, again: opts.again, cls: 'pl-seat' },
    );
    this.menuSeat = { k: k0, lines: withLines };
    if (!(anchor instanceof HTMLElement)) this.menuAt = anchor;
  }

  /** an instrument on the stage was tapped (ui/views/stage.ts): its section's menu there, its lines too */
  tapSeat(k: number, x: number, y: number): void {
    if (this.menuSeat?.k === k && this.menu) return this.closeMenu();
    this.closeGrid();
    this.openSeatMenu(k, { x, y }, { lines: true });
  }

  // ------------------------------------------------------------- the routing grid
  /** open or close the grid; a file on the one instrument shown brings the ensemble on first, that
   *  instrument playing every line */
  private toggleGrid(): void {
    if (this.grid) return this.closeGrid();
    this.closePieces();
    this.closeMenu();
    const song = this.song;
    if (!song) return;
    if (!ensemble.active || ensemble.song !== song) {
      // (the file plays on from where it is, on the ensemble)
      const was = this.playing;
      this.pause();
      this.onSolo?.(song);
      if (!ensemble.active) return;
      this.buildStrip();
      if (was) void this.play();
    }
    this.buildGrid();
  }
  /** set by the stage: bring the ensemble on for a file playing on the one instrument shown */
  onSolo: ((song: MidiSong) => void) | null = null;

  private closeGrid(refocus = false): void {
    if (!this.grid) return;
    if (this.menuAnchor && this.grid.contains(this.menuAnchor)) this.closeMenu();
    this.grid.remove();
    this.grid = null;
    this.rowHeads = [];
    this.rowSeats = [];
    this.routeBtn.setAttribute('aria-expanded', 'false');
    if (refocus) this.routeBtn.focus();
  }
  /** each row's seats (a section's desks, or one seat) */
  private rowSeats: number[][] = [];
  /** the grid desk by desk (a row per seat) rather than by section */
  private bySeat = false;

  /**
   * The grid: a row per section (orchestra/sections.ts: the desks of one instrument playing the same lines,
   * its glyph and how many, ×2), or desk by desk, a row per seat; the families (woodwinds, brass,
   * percussion, strings, keyboards) a little apart. A column per line (a dot: the section plays it, every
   * desk alike), a last column for every line at once, a row to add an instrument (it waits for a line).
   * A row's glyph opens its section's menu: another instrument, another desk, one fewer, off.
   */
  private buildGrid(): void {
    const song = this.song;
    if (!song || !ensemble.active) return this.closeGrid();
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.cell ?? null;
    const plan = ensemble.plan;
    const n = song.lines.length;
    const all = song.lines.map((_, i) => i);
    const names = song.lines.map((l, i) => lineName(l.name, l.instrument, i));
    const seatName = seatNames(ensemble.lineup);
    const secs = ensemble.sections;
    const grouped = secs.some((s) => s.seats.length > 1);
    if (!grouped) this.bySeat = false;
    const rows: Section[] = this.bySeat ? plan.parts.map((p, k) => ({ voice: p.voice, seats: [k], lines: [...p.lines] })) : secs;
    const cells: HTMLElement[] = [];
    // the corner: by section, or desk by desk (offered once a section has more than one desk)
    if (grouped) {
      const mode = h('button', { class: 'pg-mode', type: 'button', 'data-cell': 'mode', 'aria-pressed': String(this.bySeat), 'aria-label': 'Desk by desk: every seat on a row of its own', 'data-tip': this.bySeat ? 'by section' : 'desk by desk' });
      mode.append(icon(this.bySeat ? BY_SECTION : BY_DESK));
      mode.addEventListener('click', () => {
        this.bySeat = !this.bySeat;
        this.closeMenu();
        this.buildGrid();
      });
      cells.push(mode);
    } else cells.push(h('span', { class: 'pg-corner', 'aria-hidden': 'true' }));
    names.forEach((nm, i) => cells.push(h('span', { class: 'pg-col', 'data-tip': nm, title: nm }, String(i + 1))));
    const everyIcon = h('span', { class: 'pg-col pg-all-col', 'data-tip': 'every line', title: 'every line' });
    everyIcon.append(icon('M5 7h14v1.6H5zM5 11.2h14v1.6H5zM5 15.4h14v1.6H5z'));
    cells.push(everyIcon);
    const tracks = ['18px'];
    let fam: Family | null = null;
    this.rowSeats = rows.map((r) => r.seats);
    this.rowHeads = rows.map((sec) => {
      const k = sec.seats[0];
      const label = sectionName(sec, seatName);
      const b = h('button', { class: 'pg-row', type: 'button', 'data-part': String(k), 'data-seats': sec.seats.join(' '), 'data-voice': sec.voice, 'data-cell': `r${k}`, 'data-menu-anchor': '', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `${label}: change it, add a desk or take it off`, 'data-tip': label });
      b.append(voiceGlyph(sec.voice));
      // a section's desks (×2), or a seat's number when its instrument has others (2)
      const badge = sec.seats.length > 1 ? `×${sec.seats.length}` : seatName[k] !== VOICE_INFO[sec.voice].label ? seatName[k].split(' ').pop()! : '';
      if (badge) b.append(h('span', { class: 'pl-more', 'aria-hidden': 'true' }, badge));
      b.addEventListener('click', () => this.openSeatMenu(k, b, { seats: this.bySeat ? sec.seats : undefined }));
      return b;
    });
    rows.forEach((sec, r) => {
      const f = familyOf(sec.voice);
      if (fam && f !== fam) {
        cells.push(h('i', { class: 'pg-gap', 'aria-hidden': 'true' }));
        tracks.push('7px');
      }
      fam = f;
      tracks.push('26px');
      const k = sec.seats[0];
      cells.push(this.rowHeads[r]);
      const label = this.rowHeads[r].dataset.tip!;
      for (let i = 0; i < n; i++) {
        const on = sec.lines.includes(i);
        const c = h('button', { class: 'pg-cell', type: 'button', 'data-part': String(k), 'data-line': String(i), 'data-cell': `${k}:${i}`, 'aria-pressed': String(on), 'aria-label': `${names[i]} on ${label}`, 'data-tip': `${names[i]} · ${label}` });
        c.addEventListener('click', () => ensemble.seatsRoute(sec.seats, i, !on));
        cells.push(c);
      }
      const every = sec.lines.length === n;
      const c = h('button', { class: 'pg-cell pg-all', type: 'button', 'data-part': String(k), 'data-cell': `${k}:all`, 'aria-pressed': String(every), 'aria-label': `every line on ${label}`, 'data-tip': `every line · ${label}` });
      c.addEventListener('click', () => ensemble.seatsLines(sec.seats, every ? [] : all));
      cells.push(c);
    });
    // another instrument (it waits, silent, for a line)
    const room = ensemble.roomForMore;
    const add = h('button', { class: 'pg-row pg-add', type: 'button', 'data-cell': 'add', 'data-menu-anchor': '', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': room ? 'Add an instrument' : 'Add an instrument (the stage is full)', 'data-tip': room ? 'add an instrument' : 'the stage is full', disabled: !room });
    add.append(icon(PLUS));
    add.addEventListener('click', () =>
      this.openMenu(
        'add',
        add,
        'Add an instrument',
        () => false,
        (v) => !!v && ensemble.roomFor(v),
        (v) => {
          if (!v || !ensemble.addPart(v)) return;
          // its row: the last of its voice (a new one sits after the others of its kind)
          const k = ensemble.plan.parts.map((p) => p.voice).lastIndexOf(v);
          (this.grid?.querySelector(`[data-cell="r${k}"]`) as HTMLElement | null)?.focus();
        },
      ),
    );
    cells.push(add);
    tracks.push('26px');
    const g = h('div', { class: 'pl-grid', role: 'group', 'aria-label': 'Routing: instruments by lines' }, ...cells);
    g.style.setProperty('--n', String(n));
    g.style.gridTemplateRows = tracks.join(' ');
    if (this.grid) this.grid.replaceWith(g);
    else this.el.append(g);
    this.grid = g;
    this.routeBtn.setAttribute('aria-expanded', 'true');
    // under the player, kept on the screen
    const pr = this.el.getBoundingClientRect();
    const w = g.offsetWidth;
    g.style.left = `${Math.max(6 - pr.left, Math.min(window.innerWidth - 6 - pr.left - w, pr.width / 2 - w / 2))}px`;
    g.style.top = `${pr.height + 4}px`;
    if (focusKey) (g.querySelector(`[data-cell="${focusKey}"]`) as HTMLElement | null)?.focus();
    this.glow();
  }
}

/** a line left silent: a rest sign */
function muteGlyph(): SVGElement {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', '0 0 48 48');
  s.setAttribute('class', 'glyph mute-glyph');
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVGNS, 'path');
  // a crotchet rest
  p.setAttribute('d', 'M21 10 L28 19 C24 22 23 25 28 31 C24 29.5 21 30 22.5 34.5 C18 31.5 18.5 26.5 25 27.5 L19.5 20.5 C23.5 18 24 15 21 10 Z');
  s.appendChild(p);
  return s;
}
