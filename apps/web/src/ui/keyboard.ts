// 88-key on-screen keyboard with multi-touch, glissando and touch velocity
// (strike nearer the front edge of a key to play louder).

import { audio } from '../audio.ts';
import { midiName } from '@piano-model/engine';

const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
const LO = 21;
const HI = 108;

export interface KeyboardHandle {
  el: HTMLElement;
  setLabels(map: Map<number, string>): void;
  setPrepared(midis: Set<number>): void;
  /** dim keys the current instrument cannot play */
  setRange(lo: number, hi: number): void;
  scrollToMidi(m: number, smooth?: boolean): void;
  /** the 88-key strip (its bounding box scrolls with the keyboard) */
  readonly strip: HTMLElement;
  readonly scroller: HTMLElement;
  /** key centre and width as fractions of the full 88-key strip */
  keyFrac(midi: number): { c: number; w: number };
}

export function createKeyboard(): KeyboardHandle {
  const scroll = document.createElement('div');
  scroll.className = 'kbd-scroll';
  const kb = document.createElement('div');
  kb.className = 'keyboard';
  kb.setAttribute('role', 'group');
  kb.setAttribute('aria-label', 'Piano keyboard, 88 keys');
  scroll.appendChild(kb);

  const whites: number[] = [];
  for (let m = LO; m <= HI; m++) if (!isBlack(m)) whites.push(m);
  const W = 100 / whites.length;
  const keyEls = new Map<number, HTMLElement>();
  const fracs = new Map<number, { c: number; w: number }>();
  let wi = 0;
  for (let m = LO; m <= HI; m++) {
    const el = document.createElement('div');
    el.className = `key ${isBlack(m) ? 'black' : 'white'}`;
    el.dataset.midi = String(m);
    el.setAttribute('aria-label', midiName(m));
    if (isBlack(m)) {
      el.style.left = `calc(${wi * W}% - ${W * 0.31}%)`;
      el.style.width = `${W * 0.62}%`;
      fracs.set(m, { c: (wi * W) / 100, w: (W * 0.62) / 100 });
    } else {
      fracs.set(m, { c: ((wi + 0.5) * W) / 100, w: W / 100 });
      el.style.left = `${wi * W}%`;
      el.style.width = `${W}%`;
      if (m % 12 === 0) {
        const c = document.createElement('span');
        c.className = 'cname';
        c.textContent = midiName(m);
        el.appendChild(c);
      }
      wi++;
    }
    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    el.appendChild(lbl);
    kb.appendChild(el);
    keyEls.set(m, el);
  }

  // pointer handling: each pointer holds at most one key
  const pointerKey = new Map<number, { midi: number; vel: number }>();
  const keyAt = (x: number, y: number): { midi: number; vel: number } | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const k = el?.closest?.('.key') as HTMLElement | null;
    if (!k || !kb.contains(k)) return null;
    const r = k.getBoundingClientRect();
    const depth = Math.min(1, Math.max(0, (y - r.top) / r.height));
    // front of the key is louder; map to a musically useful range
    const vel = Math.round(28 + 96 * Math.pow(depth, 0.8));
    return { midi: Number(k.dataset.midi), vel };
  };
  kb.addEventListener('pointerdown', (e) => {
    const hit = keyAt(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();
    kb.setPointerCapture(e.pointerId);
    pointerKey.set(e.pointerId, hit);
    audio.noteOn(hit.midi, hit.vel, 'mouse');
  });
  kb.addEventListener('pointermove', (e) => {
    const cur = pointerKey.get(e.pointerId);
    if (!cur) return;
    const hit = keyAt(e.clientX, e.clientY);
    if (!hit || hit.midi === cur.midi) return;
    audio.noteOff(cur.midi, 'mouse');
    const next = { midi: hit.midi, vel: cur.vel };
    pointerKey.set(e.pointerId, next);
    audio.noteOn(next.midi, next.vel, 'mouse');
  });
  const end = (e: PointerEvent) => {
    const cur = pointerKey.get(e.pointerId);
    if (!cur) return;
    pointerKey.delete(e.pointerId);
    audio.noteOff(cur.midi, 'mouse');
  };
  kb.addEventListener('pointerup', end);
  kb.addEventListener('pointercancel', end);
  kb.addEventListener('lostpointercapture', end);
  kb.addEventListener('contextmenu', (e) => e.preventDefault());

  audio.notes.on((n) => {
    const el = keyEls.get(n.midi);
    if (!el) return;
    el.classList.toggle('down', audio.down.has(n.midi));
  });

  return {
    el: scroll,
    strip: kb,
    scroller: scroll,
    keyFrac: (m) => fracs.get(m) ?? { c: 0, w: 0 },
    setLabels(map) {
      keyEls.forEach((el, m) => {
        (el.querySelector('.lbl') as HTMLElement).textContent = map.get(m) ?? '';
      });
    },
    setPrepared(midis) {
      keyEls.forEach((el, m) => el.classList.toggle('prep', midis.has(m)));
    },
    setRange(lo, hi) {
      keyEls.forEach((el, m) => el.classList.toggle('out', m < lo || m > hi));
    },
    scrollToMidi(m, smooth = false) {
      const el = keyEls.get(m);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const sr = scroll.getBoundingClientRect();
      scroll.scrollTo({ left: scroll.scrollLeft + r.left - sr.left - sr.width / 2 + r.width / 2, behavior: smooth ? 'smooth' : 'auto' });
    },
  };
}

/** Computer-keyboard mapping (home row = white keys), octave and velocity controls. */
export class ComputerKeys {
  base = 60;
  velocity = 84;
  /** playable range of the current instrument: the 18 mapped keys must reach into it */
  private lo = 21;
  private hi = 108;
  private clampBase(m: number): number {
    return Math.min(Math.min(96, this.hi - 5), Math.max(Math.max(21, this.lo - 12), m));
  }
  setBase(m: number): void {
    this.base = this.clampBase(m);
    this.changed();
  }
  setRange(lo: number, hi: number): void {
    this.lo = lo;
    this.hi = hi;
  }
  /** Octave up (+1) or down (−1), kept within the instrument's range. */
  octave(d: number): void {
    const next = this.clampBase(this.base + 12 * d);
    if (next === this.base || Math.abs(next - this.base) !== 12) return;
    this.base = next;
    this.changed();
  }
  private held = new Map<string, number>();
  private listeners = new Set<() => void>();
  private static readonly MAP: Record<string, number> = {
    KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8,
    KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
  };
  private static readonly LABEL: Record<string, string> = {
    KeyA: 'A', KeyW: 'W', KeyS: 'S', KeyE: 'E', KeyD: 'D', KeyF: 'F', KeyT: 'T', KeyG: 'G', KeyY: 'Y',
    KeyH: 'H', KeyU: 'U', KeyJ: 'J', KeyK: 'K', KeyO: 'O', KeyL: 'L', KeyP: 'P', Semicolon: ';', Quote: "'",
  };

  attach(): void {
    window.addEventListener('keydown', (e) => this.down(e));
    window.addEventListener('keyup', (e) => this.up(e));
    window.addEventListener('blur', () => this.releaseAll());
  }
  onChange(cb: () => void): void {
    this.listeners.add(cb);
  }
  private changed(): void {
    this.listeners.forEach((cb) => cb());
  }
  labels(): Map<number, string> {
    const m = new Map<number, string>();
    for (const [code, off] of Object.entries(ComputerKeys.MAP)) m.set(this.base + off, ComputerKeys.LABEL[code]);
    return m;
  }
  private down(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') && (t as HTMLInputElement).type !== 'range') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) audio.sustain(1);
      return;
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      if (!e.repeat) audio.soft(1);
      return;
    }
    if (e.repeat) {
      if (e.code in ComputerKeys.MAP) e.preventDefault();
      return;
    }
    if (e.code === 'KeyZ' || e.code === 'Minus' || e.code === 'NumpadSubtract') return this.octave(-1);
    if (e.code === 'KeyX' || e.code === 'Equal' || e.code === 'NumpadAdd') return this.octave(1);
    if (e.code === 'KeyC') return this.vel(-12);
    if (e.code === 'KeyV') return this.vel(12);
    const off = ComputerKeys.MAP[e.code];
    if (off === undefined) return;
    e.preventDefault();
    const midi = this.base + off;
    this.held.set(e.code, midi);
    audio.noteOn(midi, this.velocity, 'keys');
  }
  private up(e: KeyboardEvent): void {
    if (e.code === 'Space') {
      audio.sustain(0);
      return;
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      audio.soft(0);
      return;
    }
    const midi = this.held.get(e.code);
    if (midi === undefined) return;
    this.held.delete(e.code);
    audio.noteOff(midi, 'keys');
  }
  private releaseAll(): void {
    for (const midi of this.held.values()) audio.noteOff(midi, 'keys');
    this.held.clear();
    audio.sustain(0);
    audio.soft(0);
  }
  private vel(d: number): void {
    this.velocity = Math.min(127, Math.max(10, this.velocity + d));
    this.changed();
  }
}
