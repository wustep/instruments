// Drop a .mid file anywhere: it plays on the current instrument. The overlay is three
// icons and a hairline of progress; no text.

import { audio } from '../audio.ts';
import { parseMidi, type MidiSong } from '../midi-file.ts';
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

  constructor() {
    this.playBtn = h('button', { class: 'pl-btn', type: 'button', 'aria-label': 'Play', 'data-tip': 'play', onclick: () => (this.playing ? this.pause() : void this.play()) });
    this.playBtn.appendChild(icon(PLAY));
    const stop = h('button', { class: 'pl-btn', type: 'button', 'aria-label': 'Stop', 'data-tip': 'stop', onclick: () => this.stop() });
    stop.appendChild(icon(STOP));
    this.fill = h('i', { class: 'pl-fill' });
    this.bar = h('div', { class: 'pl-bar', role: 'slider', 'aria-label': 'Position', 'data-tip': 'position', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', tabindex: '0' }, this.fill);
    this.bar.addEventListener('pointerdown', (e) => {
      if (!this.song) return;
      const r = this.bar.getBoundingClientRect();
      this.seek(((e.clientX - r.left) / r.width) * this.song.duration);
    });
    this.el = h('div', { class: 'player', hidden: true, role: 'group', 'aria-label': 'MIDI file' }, h('div', { class: 'pl-btns' }, this.playBtn, stop), this.bar);
    this.attachDrop();
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

  /** Load a file (replacing the current one) and play it. */
  async load(buf: ArrayBuffer): Promise<void> {
    let song: MidiSong;
    try {
      song = parseMidi(buf);
    } catch (err) {
      console.warn('not a playable MIDI file:', err);
      return;
    }
    this.stop();
    this.song = song;
    this.el.hidden = !song.events.length;
    if (song.events.length) await this.play();
  }

  async play(): Promise<void> {
    if (!this.song) return;
    await audio.start().catch(() => undefined);
    const ctx = audio.ctx;
    if (!ctx || !audio.piano) return;
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

  pause(): void {
    if (!this.playing) return;
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
    const f = this.song && this.song.duration > 0 ? Math.min(1, this.pos / this.song.duration) : 0;
    this.fill.style.transform = `scaleX(${f})`;
    this.bar.setAttribute('aria-valuenow', String(Math.round(f * 100)));
  }
}
