// The overlay at the top middle of the stage. With nothing loaded it is two icons: play (the
// instrument's own short piece, orchestra/pieces.ts DEMOS; in an ensemble, the built-in piece that
// best fits its lineup) and open (a MIDI file from the device: phones have no drop). Drop a .mid file
// anywhere, or open one: it plays. A file with several parts (a quartet, a concerto) puts an
// ensemble on the stage, each line on an instrument of its own (orchestra/assign.ts); a piano piece
// plays on the instrument shown. Loaded, the overlay is its icons and a hairline of progress; with an
// ensemble, a row of the file's lines under it, each showing its instrument (tap one to move it).
// The routing button opens a grid of instruments by lines, many to many: a line on several
// instruments, the whole file on one, a second cello or grand of its own.

import { audio } from '../audio.ts';
import { parseMidi, type MidiSong } from '../midi-file.ts';
import { canReassign, voicesOfLine, VOICE_INFO, VOICES, type Voice } from '../orchestra/assign.ts';
import { ensemble, stageCap } from '../orchestra/ensemble.ts';
import { DEMOS, demoSong, PIECES, pieceForLineup, type Demo, type Piece } from '../orchestra/pieces.ts';
import { voiceGlyph } from './controls.ts';
import { h } from './dom.ts';
import type { InstrumentId } from '@piano-model/engine';

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
/** routing: a grid of dots, some lit (instruments by lines) */
const ROUTE = 'M5 5h3v3H5zM10.5 10.5h3v3h-3zM16 5h3v3h-3zM16 16h3v3h-3zM5 16h3v3H5z';

/** a line's name as the file writes it, tidied ("violinI:" → "violin I"; LilyPond's "\new" is none) */
export const lineName = (name: string, inst: string, i: number): string => {
  const n = name.replace(/^\\new:?$/, '').replace(/:$/, '').replace(/^(violin|violino)(I+)$/i, '$1 $2').trim();
  return n || inst.trim() || `line ${i + 1}`;
};

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
    this.el = h('div', { class: 'player idle', role: 'group', 'aria-label': 'MIDI file' }, h('div', { class: 'pl-row' }, h('div', { class: 'pl-btns' }, this.playBtn, this.stopBtn), this.bar, this.routeBtn, this.openBtn), this.strip, this.picker);
    this.attachDrop();
    ensemble.changed.on(() => {
      this.buildStrip();
      this.sync();
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
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.menu) this.closeMenu(true);
      else if (this.grid) this.closeGrid(true);
      else return;
      e.stopPropagation();
    });
  }

  /** the file loaded (playing or not) */
  get loaded(): MidiSong | null {
    return this.song;
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
  async load(buf: ArrayBuffer, piece: Piece | null = null): Promise<void> {
    let song: MidiSong;
    try {
      song = parseMidi(buf);
    } catch (err) {
      console.warn('not a playable MIDI file:', err);
      return;
    }
    this.asked++;
    this.stop();
    this.song = song.events.length ? song : null;
    this.demo = null;
    const plan = ensemble.planFor(song, piece);
    // (a lineup picked by hand stays picked: the file was matched to it)
    if (piece || ensemble.active || plan.parts.length > 1) ensemble.enter(plan, song, piece, !piece && ensemble.active && ensemble.byUser);
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

  /** nothing loaded: the play icon plays the instrument's own piece, or the ensemble's */
  async playOwn(): Promise<void> {
    if (ensemble.active) return this.loadPiece(pieceForLineup(ensemble.lineup));
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
    this.buildStrip();
    this.sync();
    await this.play();
  }

  /** back to rest: nothing loaded (the overlay's two icons) */
  unload(): void {
    this.stop();
    this.song = null;
    this.demo = null;
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
  async loadPiece(i: number): Promise<void> {
    const piece = PIECES[i];
    if (!piece) return;
    // start the sound inside the gesture that asked for it (the fetch would lose it)
    void audio.start().catch(() => undefined);
    const ask = ++this.asked;
    const buf = await this.fetchFile(piece.file);
    if (ask !== this.asked) return;
    await this.load(buf, piece);
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
    const ev = this.song.events;
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
    this.pos0 = this.pos;
    this.t0 = ctx.currentTime + 0.12;
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

  /** Schedule ~0.2 s ahead, sample-accurately, on the AudioContext clock. */
  private tick(): void {
    const ctx = audio.ctx;
    if (!ctx || !this.song) return;
    const now = ctx.currentTime;
    const ev = this.song.events;
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
    this.closeMenu();
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
      // on more than one instrument: how many more
      if (vs.length > 1) b.append(h('span', { class: 'pl-more', 'aria-hidden': 'true' }, `+${vs.length - 1}`));
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
    this.rowHeads.forEach((c, k) => {
      const on = sounding(k);
      if (c.classList.contains('on') !== on) c.classList.toggle('on', on);
    });
  }

  /** a small menu of instruments under `anchor`: each a glyph, `checked` lit, `ok` offered, and
   *  `extra` items after them */
  private openMenu(key: string, anchor: HTMLElement, label: string, checked: (v: Voice | null) => boolean, ok: (v: Voice | null) => boolean, pick: (v: Voice | null) => void, opts: { silent?: boolean; extra?: HTMLElement[] } = {}): void {
    const again = this.menu?.dataset.key === key;
    this.closeMenu();
    if (again) return;
    const item = (v: Voice | null) => {
      const can = checked(v) || ok(v);
      const name = v ? VOICE_INFO[v].label : 'silent';
      const b = h('button', { class: 'pl-pick', type: 'button', role: 'menuitemradio', 'data-voice': v ?? 'none', 'aria-checked': String(checked(v)), 'aria-label': can ? name : `${name} (the stage is full)`, 'data-tip': can ? name : `${name} · the stage is full`, disabled: !can });
      b.append(v ? voiceGlyph(v) : muteGlyph());
      b.addEventListener('click', () => {
        this.closeMenu();
        pick(v);
        // back to the anchor, or (the strip and grid rebuilt) its new self, unless the pick moved on
        if (this.el.contains(document.activeElement) && document.activeElement !== b) return;
        const again = anchor.isConnected ? anchor : (this.el.querySelector(anchor.dataset.cell ? `[data-cell="${anchor.dataset.cell}"]` : `.pl-line[data-line="${anchor.dataset.line}"]`) as HTMLElement | null);
        again?.focus();
      });
      return b;
    };
    const items: HTMLElement[] = VOICES.map(item);
    if (opts.silent) items.push(item(null));
    const m = h('div', { class: 'pl-menu', role: 'menu', 'aria-label': label, 'data-key': key }, ...items, ...(opts.extra ?? []));
    this.el.append(m);
    // under its anchor, kept on the screen
    const r = anchor.getBoundingClientRect();
    const pr = this.el.getBoundingClientRect();
    const w = m.offsetWidth;
    const x = Math.max(6 - pr.left, Math.min(window.innerWidth - 6 - pr.left - w, r.left + r.width / 2 - pr.left - w / 2));
    m.style.left = `${x}px`;
    m.style.top = `${r.bottom - pr.top + 4}px`;
    anchor.setAttribute('aria-expanded', 'true');
    this.menu = m;
    this.menuAnchor = anchor;
    ((m.querySelector('[aria-checked="true"]') ?? m.querySelector('button:not(:disabled)')) as HTMLElement | null)?.focus();
  }
  private menuAnchor: HTMLElement | null = null;

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
    const a = this.menuAnchor;
    this.menuAnchor = null;
    a?.setAttribute('aria-expanded', 'false');
    if (refocus && a?.isConnected) a.focus();
  }

  // ------------------------------------------------------------- the routing grid
  /** open or close the grid; a file on the one instrument shown brings the ensemble on first, that
   *  instrument playing every line */
  private toggleGrid(): void {
    if (this.grid) return this.closeGrid();
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
    this.closeMenu();
    this.grid.remove();
    this.grid = null;
    this.rowHeads = [];
    this.routeBtn.setAttribute('aria-expanded', 'false');
    if (refocus) this.routeBtn.focus();
  }

  /** the grid: a row per instrument (its glyph: change it or take it off), a column per line (a dot:
   *  this instrument plays this line), a last column for every line at once, and a row to add an
   *  instrument (another of a voice already there is its own) */
  private buildGrid(): void {
    const song = this.song;
    if (!song || !ensemble.active) return this.closeGrid();
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.cell ?? null;
    const plan = ensemble.plan;
    const n = song.lines.length;
    const all = song.lines.map((_, i) => i);
    const names = song.lines.map((l, i) => lineName(l.name, l.instrument, i));
    const cells: HTMLElement[] = [h('span', { class: 'pg-corner', 'aria-hidden': 'true' })];
    names.forEach((nm, i) => cells.push(h('span', { class: 'pg-col', 'data-tip': nm, title: nm }, String(i + 1))));
    const everyIcon = h('span', { class: 'pg-col pg-all-col', 'data-tip': 'every line', title: 'every line' });
    everyIcon.append(icon('M5 7h14v1.6H5zM5 11.2h14v1.6H5zM5 15.4h14v1.6H5z'));
    cells.push(everyIcon);
    // a voice's seats are numbered when there are two or more
    const nth = plan.parts.map((p, k) => plan.parts.slice(0, k + 1).filter((q) => q.voice === p.voice).length);
    const many = plan.parts.map((p) => plan.parts.filter((q) => q.voice === p.voice).length > 1);
    this.rowHeads = plan.parts.map((p, k) => {
      const label = `${VOICE_INFO[p.voice].label}${many[k] ? ` ${nth[k]}` : ''}`;
      const b = h('button', { class: 'pg-row', type: 'button', 'data-part': String(k), 'data-voice': p.voice, 'data-cell': `r${k}`, 'data-menu-anchor': '', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `${label}: change it or take it off`, 'data-tip': label });
      b.append(voiceGlyph(p.voice));
      if (many[k]) b.append(h('span', { class: 'pl-more', 'aria-hidden': 'true' }, String(nth[k])));
      b.addEventListener('click', () => this.openPartMenu(k, b, label));
      return b;
    });
    plan.parts.forEach((p, k) => {
      cells.push(this.rowHeads[k]);
      const label = this.rowHeads[k].dataset.tip!;
      for (let i = 0; i < n; i++) {
        const on = p.lines.includes(i);
        const c = h('button', { class: 'pg-cell', type: 'button', 'data-part': String(k), 'data-line': String(i), 'data-cell': `${k}:${i}`, 'aria-pressed': String(on), 'aria-label': `${names[i]} on ${label}`, 'data-tip': `${names[i]} · ${label}` });
        c.addEventListener('click', () => ensemble.route(i, k, !on));
        cells.push(c);
      }
      const every = p.lines.length === n;
      const c = h('button', { class: 'pg-cell pg-all', type: 'button', 'data-part': String(k), 'data-cell': `${k}:all`, 'aria-pressed': String(every), 'aria-label': `every line on ${label}`, 'data-tip': `every line · ${label}` });
      c.addEventListener('click', () => ensemble.partLines(k, every ? [] : all));
      cells.push(c);
    });
    // another instrument
    const add = h('button', { class: 'pg-row pg-add', type: 'button', 'data-cell': 'add', 'data-menu-anchor': '', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': ensemble.roomForMore ? 'Add an instrument' : 'Add an instrument (the stage is full)', 'data-tip': ensemble.roomForMore ? 'add an instrument' : 'the stage is full', disabled: !ensemble.roomForMore });
    add.append(icon('M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z'));
    add.addEventListener('click', () =>
      this.openMenu(
        'add',
        add,
        'Add an instrument',
        () => false,
        () => ensemble.roomForMore,
        (v) => {
          if (!v || !ensemble.addPart(v)) return;
          // its row: the last of its voice (a new one sits after the others of its kind)
          const k = ensemble.plan.parts.map((p) => p.voice).lastIndexOf(v);
          (this.grid?.querySelector(`[data-cell="r${k}"]`) as HTMLElement | null)?.focus();
        },
      ),
    );
    cells.push(add);
    const g = h('div', { class: 'pl-grid', role: 'group', 'aria-label': 'Routing: instruments by lines' }, ...cells);
    g.style.setProperty('--n', String(n));
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

  /** an instrument's row header: another instrument in its seat, or off the stage */
  private openPartMenu(k: number, head: HTMLButtonElement, label: string): void {
    const plan = ensemble.plan;
    const cur = plan.parts[k]?.voice;
    if (!cur) return;
    const off = h('button', { class: 'pl-pick pl-off', type: 'button', role: 'menuitem', 'aria-label': `Take the ${label} off the stage`, 'data-tip': 'take it off', disabled: plan.parts.length <= 1 });
    off.append(icon('M7.4 6 12 10.6 16.6 6 18 7.4 13.4 12 18 16.6 16.6 18 12 13.4 7.4 18 6 16.6 10.6 12 6 7.4z'));
    off.addEventListener('click', () => {
      this.closeMenu();
      ensemble.removePart(k);
      (this.grid?.querySelector('[data-cell="add"]') as HTMLElement | null)?.focus();
    });
    this.openMenu(
      `part:${k}`,
      head,
      `Instrument in the seat of the ${label}`,
      (v) => v === cur,
      () => true,
      (v) => {
        if (v && v !== cur) ensemble.partVoice(k, v);
      },
      { extra: [off] },
    );
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
