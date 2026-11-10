// Drop a .mid file anywhere: it plays. A file with several parts (a quartet, a concerto) puts an
// ensemble on the stage, each line on an instrument of its own (orchestra/assign.ts); a piano piece
// plays on the instrument shown. The overlay is three icons and a hairline of progress; with an
// ensemble, a row of the file's lines under it, each showing its instrument (tap one to change it).

import { audio } from '../audio.ts';
import { parseMidi, type MidiSong } from '../midi-file.ts';
import { canReassign, VOICE_INFO, VOICES, type Voice } from '../orchestra/assign.ts';
import { ensemble, STAGE_CAP } from '../orchestra/ensemble.ts';
import { PIECES, type Piece } from '../orchestra/pieces.ts';
import { voiceGlyph } from './controls.ts';
import { h } from './dom.ts';

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
  private bar: HTMLElement;
  private fill: HTMLElement;
  private strip: HTMLElement;
  private chips: HTMLButtonElement[] = [];
  private menu: HTMLElement | null = null;

  constructor() {
    this.playBtn = h('button', { class: 'pl-btn', type: 'button', 'aria-label': 'Play', 'data-tip': 'play', onclick: () => (this.playing ? this.pause() : void this.play()) });
    this.playBtn.appendChild(icon(PLAY));
    const stop = h('button', { class: 'pl-btn', type: 'button', 'aria-label': 'Stop', 'data-tip': 'stop', onclick: () => this.stop() });
    stop.appendChild(icon(STOP));
    this.fill = h('i', { class: 'pl-fill' });
    // (the hairline has no tooltip: its fill says where the file is; it still scrubs)
    this.bar = h('div', { class: 'pl-bar', role: 'slider', 'aria-label': 'Position', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', tabindex: '0' }, this.fill);
    this.bar.addEventListener('pointerdown', (e) => {
      if (!this.song) return;
      const r = this.bar.getBoundingClientRect();
      this.seek(((e.clientX - r.left) / r.width) * this.song.duration);
    });
    this.strip = h('div', { class: 'pl-lines', role: 'group', 'aria-label': 'The file’s lines and their instruments', hidden: true });
    this.el = h('div', { class: 'player', hidden: true, role: 'group', 'aria-label': 'MIDI file' }, h('div', { class: 'pl-row' }, h('div', { class: 'pl-btns' }, this.playBtn, stop), this.bar), this.strip);
    this.attachDrop();
    ensemble.changed.on(() => this.buildStrip());
    document.addEventListener('pointerdown', (e) => {
      if (this.menu && !this.menu.contains(e.target as Node) && !this.chips.includes((e.target as Element).closest?.('.pl-line') as HTMLButtonElement)) this.closeMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.menu) {
        this.closeMenu(true);
        e.stopPropagation();
      }
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
    this.stop();
    this.song = song;
    const plan = ensemble.planFor(song, piece);
    // (a lineup picked by hand stays picked: the file was matched to it)
    if (piece || ensemble.active || plan.parts.length > 1) ensemble.enter(plan, song, piece, !piece && ensemble.active && ensemble.byUser);
    this.el.hidden = !song.events.length;
    this.buildStrip();
    if (song.events.length) await this.play();
  }

  /** a built-in piece (orchestra/pieces.ts), fetched and played */
  async loadPiece(i: number): Promise<void> {
    const piece = PIECES[i];
    if (!piece) return;
    // start the sound inside the gesture that asked for it (the fetch would lose it)
    void audio.start().catch(() => undefined);
    const r = await fetch(`/pieces/${piece.file}`);
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${piece.file}`);
    await this.load(await r.arrayBuffer(), piece);
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
    if (this.idx >= ev.length && this.pos > this.song.duration + 1) this.stop();
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
    if (!show) {
      this.strip.replaceChildren();
      return;
    }
    const plan = ensemble.plan;
    this.chips = song.lines.map((l, i) => {
      const a = plan.lines[i];
      const v = a && a.part >= 0 ? plan.parts[a.part].voice : null;
      const name = lineName(l.name, l.instrument, i);
      const to = v ? VOICE_INFO[v].label : 'silent';
      const b = h('button', { class: 'pl-line', type: 'button', 'data-line': String(i), 'data-voice': v ?? 'none', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `${name}: ${to}. Change its instrument`, 'data-tip': `${name} · ${to}` });
      b.append(v ? voiceGlyph(v) : muteGlyph());
      b.addEventListener('click', () => this.openMenu(i, b));
      return b;
    });
    this.strip.replaceChildren(...this.chips);
  }

  /** each line's instrument lit while it sounds */
  private glow(): void {
    if (!this.chips.length) return;
    const now = performance.now();
    const plan = ensemble.plan;
    this.chips.forEach((c, i) => {
      const a = plan.lines[i];
      const p = a && a.part >= 0 ? ensemble.parts[a.part] : null;
      const on = !!p && (p.down.size > 0 || now - p.lastOn < 120);
      if (c.classList.contains('on') !== on) c.classList.toggle('on', on);
    });
  }

  private openMenu(li: number, chip: HTMLButtonElement): void {
    const again = this.menu?.dataset.line === String(li);
    this.closeMenu();
    if (again) return;
    const plan = ensemble.plan;
    const a = plan.lines[li];
    const cur = a && a.part >= 0 ? plan.parts[a.part].voice : null;
    const item = (v: Voice | null) => {
      const ok = v === cur || canReassign(plan, ensemble.lines, li, v, STAGE_CAP);
      const label = v ? VOICE_INFO[v].label : 'silent';
      const b = h('button', { class: 'pl-pick', type: 'button', role: 'menuitemradio', 'aria-checked': String(v === cur), 'aria-label': ok ? label : `${label} (the stage is full)`, 'data-tip': ok ? label : `${label} · the stage is full`, disabled: !ok });
      b.append(v ? voiceGlyph(v) : muteGlyph());
      b.addEventListener('click', () => {
        this.closeMenu();
        if (v !== cur) ensemble.reassignLine(li, v);
        this.chips[li]?.focus();
      });
      return b;
    };
    const m = h('div', { class: 'pl-menu', role: 'menu', 'aria-label': `Instrument for ${lineName(ensemble.lines[li].name, ensemble.lines[li].instrument, li)}`, 'data-line': String(li) }, ...VOICES.map(item), item(null));
    this.el.append(m);
    // under its chip, kept on the screen
    const r = chip.getBoundingClientRect();
    const pr = this.el.getBoundingClientRect();
    const w = m.offsetWidth;
    const x = Math.max(6 - pr.left, Math.min(window.innerWidth - 6 - pr.left - w, r.left + r.width / 2 - pr.left - w / 2));
    m.style.left = `${x}px`;
    m.style.top = `${r.bottom - pr.top + 4}px`;
    chip.setAttribute('aria-expanded', 'true');
    this.menu = m;
    (m.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus();
  }

  private closeMenu(refocus = false): void {
    if (!this.menu) return;
    const li = Number(this.menu.dataset.line);
    this.menu.remove();
    this.menu = null;
    const c = this.chips[li];
    c?.setAttribute('aria-expanded', 'false');
    if (refocus) c?.focus();
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
