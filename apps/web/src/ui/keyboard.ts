// 88-key on-screen keyboard with multi-touch, glissando and touch velocity
// (strike nearer the front edge of a key to play louder). Where the keys do not all fit (a phone, a
// narrow window) a thin strip over them shows all 88 in miniature with a window on the ones in view:
// dragging on the strip slides the keys, and a drag on the keys themselves stays a glissando.

import { audio, SOUNDING_GRACE_MS } from '../audio.ts';
import { midiName } from '@piano-model/engine';

const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
const LO = 21;
const HI = 108;

export interface KeyboardHandle {
  el: HTMLElement;
  /** the position strip: all 88 keys in miniature and a window on those in view (it goes over the keys) */
  map: HTMLElement;
  /** the keys were slid by hand (the strip, its arrow keys, a wheel): the note now in the middle */
  onSlide(cb: (centre: number) => void): void;
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

  // ---- the position strip
  const SVG = 'http://www.w3.org/2000/svg';
  const map = document.createElement('div');
  map.className = 'keymap';
  kb.id = 'keys';
  // (a scrollbar for the keys: no tooltip, like the file player's position line)
  for (const [k, v] of Object.entries({ role: 'scrollbar', tabindex: '0', 'aria-label': 'Keyboard position', 'aria-controls': 'keys', 'aria-orientation': 'horizontal', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' })) map.setAttribute(k, v);
  const track = document.createElement('div');
  track.className = 'km-track';
  const mini = document.createElementNS(SVG, 'svg');
  mini.setAttribute('class', 'km-keys');
  mini.setAttribute('viewBox', `0 0 ${whites.length} 10`);
  mini.setAttribute('preserveAspectRatio', 'none');
  mini.setAttribute('aria-hidden', 'true');
  const miniEls = new Map<number, SVGRectElement>();
  const miniKey = (m: number, x: number, w: number, hgt: number) => {
    const r = document.createElementNS(SVG, 'rect');
    r.setAttribute('class', `km-k ${isBlack(m) ? 'km-b' : 'km-w'}`);
    r.setAttribute('x', x.toFixed(3));
    r.setAttribute('width', String(w));
    r.setAttribute('height', String(hgt));
    miniEls.set(m, r);
    return r;
  };
  // (the black keys last: over the white ones)
  const blacks: SVGRectElement[] = [];
  wi = 0;
  for (let m = LO; m <= HI; m++) {
    if (isBlack(m)) blacks.push(miniKey(m, wi - 0.3, 0.6, 6));
    else mini.appendChild(miniKey(m, wi++ + 0.08, 0.84, 10));
  }
  mini.append(...blacks);
  // the window: what is outside it is shaded (the lens's shadow, cut off at the strip's ends), its frame over all
  const shade = document.createElement('div');
  shade.className = 'km-shade';
  const lens = document.createElement('i');
  lens.className = 'km-lens';
  shade.appendChild(lens);
  const win = document.createElement('i');
  win.className = 'km-win';
  track.append(mini, shade, win);
  map.appendChild(track);
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  /** the window follows the keys: its left edge and width as shares of the strip (a scrollbar's thumb) */
  const syncMap = () => {
    const sw = scroll.scrollWidth || 1;
    const over = sw - scroll.clientWidth;
    track.style.setProperty('--l', `${((100 * scroll.scrollLeft) / sw).toFixed(3)}%`);
    track.style.setProperty('--w', `${((100 * Math.min(sw, scroll.clientWidth)) / sw).toFixed(3)}%`);
    map.setAttribute('aria-valuenow', String(over > 0 ? Math.round((100 * scroll.scrollLeft) / over) : 0));
  };
  // sliding by hand tells the page which note is now in the middle, once the keys have come to rest
  const slideCbs = new Set<(centre: number) => void>();
  let byHand = false;
  let settle = 0;
  const settled = () => {
    const kr = kb.getBoundingClientRect();
    const sr = scroll.getBoundingClientRect();
    if (!kr.width) return;
    const i = Math.min(whites.length - 1, Math.max(0, Math.floor(((sr.left + sr.width / 2 - kr.left) / kr.width) * whites.length)));
    slideCbs.forEach((cb) => cb(whites[i]));
  };
  scroll.addEventListener(
    'scroll',
    () => {
      syncMap();
      if (!byHand) return;
      window.clearTimeout(settle);
      settle = window.setTimeout(settled, 140);
    },
    { passive: true },
  );
  scroll.addEventListener('wheel', () => (byHand = true), { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(syncMap).observe(scroll);
  // a drag on the strip: the window is held where it was taken; off the window, it comes under the
  // finger first. The keys follow at once (the strip's own pointer: the keys keep theirs for notes)
  let held: { id: number; off: number } | null = null;
  const fracAt = (x: number) => {
    const r = track.getBoundingClientRect();
    return (x - r.left) / Math.max(1, r.width);
  };
  const windowTo = (left: number) => {
    const sw = scroll.scrollWidth;
    scroll.scrollLeft = clamp01(left) * sw;
  };
  map.addEventListener('pointerdown', (e) => {
    if (e.button || held) return;
    e.preventDefault();
    map.setPointerCapture(e.pointerId);
    const sw = scroll.scrollWidth || 1;
    const l = scroll.scrollLeft / sw;
    const w = scroll.clientWidth / sw;
    const f = fracAt(e.clientX);
    const on = f >= l && f <= l + w;
    held = { id: e.pointerId, off: on ? f - l : w / 2 };
    byHand = true;
    map.classList.add('dragging');
    if (!on) windowTo(f - w / 2);
  });
  map.addEventListener('pointermove', (e) => {
    if (held?.id === e.pointerId) windowTo(fracAt(e.clientX) - held.off);
  });
  const letGo = (e: PointerEvent) => {
    if (held?.id !== e.pointerId) return;
    held = null;
    map.classList.remove('dragging');
  };
  map.addEventListener('pointerup', letGo);
  map.addEventListener('pointercancel', letGo);
  map.addEventListener('lostpointercapture', letGo);
  // from the keyboard: an octave a press, or to either end
  map.addEventListener('keydown', (e) => {
    const oct = (7 * kb.getBoundingClientRect().width) / whites.length;
    const to = e.key === 'ArrowRight' ? scroll.scrollLeft + oct : e.key === 'ArrowLeft' ? scroll.scrollLeft - oct : e.key === 'Home' ? 0 : e.key === 'End' ? scroll.scrollWidth : null;
    if (to === null) return;
    e.preventDefault();
    byHand = true;
    scroll.scrollLeft = to;
  });

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

  // a key is pressed ('down') by any source; it glows ('sounding') only while the engine says its
  // note really sounds. A held key a monophonic instrument (or a busy string) has moved on from
  // stays pressed but dark, and lights again when the engine returns to it.
  const lit = new Set<number>();
  const paint = (m: number) => {
    const el = keyEls.get(m);
    if (!el) return;
    const s = audio.isSounding(m);
    el.classList.toggle('down', audio.down.has(m));
    el.classList.toggle('sounding', s);
    // (the strip shows it too: a note off the screen's edge is seen there)
    miniEls.get(m)!.classList.toggle('on', s || audio.down.has(m));
    if (s) lit.add(m);
    else lit.delete(m);
  };
  audio.notes.on((n) => {
    paint(n.midi);
    // if the engine never takes it up, it goes dark when the grace period ends
    if (n.on) window.setTimeout(() => paint(n.midi), SOUNDING_GRACE_MS + 10);
  });
  audio.soundingChanged.on(() => {
    for (const m of [...lit, ...audio.sounding, ...audio.down.keys()]) paint(m);
  });

  return {
    el: scroll,
    map,
    onSlide(cb) {
      slideCbs.add(cb);
    },
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
      miniEls.forEach((el, m) => el.classList.toggle('out', m < lo || m > hi));
    },
    scrollToMidi(m, smooth = false) {
      const el = keyEls.get(m);
      if (!el) return;
      // (the page's own move: not a slide by hand)
      byHand = false;
      window.clearTimeout(settle);
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
  /**
   * The rows always start on a C, as in a DAW (Ableton, GarageBand): A S D F G H J K L ; '
   * are the white keys C D E F G A B C D E F, and W E · T Y U · O P the black keys between
   * them (C# D# · F# G# A# · C# D#). U and J are always A#/B. The octave moves in Cs, from
   * the lowest C whose upper half reaches the instrument to the highest whose bottom does.
   */
  private clampBase(m: number): number {
    const lo = Math.ceil((this.lo - 11) / 12) * 12;
    const hi = Math.floor((this.hi - 5) / 12) * 12;
    const c = Math.round(m / 12) * 12;
    return Math.min(Math.min(96, hi), Math.max(Math.max(12, lo), c));
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
    if (next === this.base) return;
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
    // the middle pedal (a grand's sostenuto, an upright's muffler): B, beside the octave and
    // velocity keys, clear of the note rows
    if (e.code === 'KeyB') {
      if (!e.repeat) audio.sostenuto(1);
      return;
    }
    if (e.repeat) {
      if (e.code in ComputerKeys.MAP) e.preventDefault();
      return;
    }
    // a touch screen shows no letters on its keys (styles.css) until a keyboard that is plugged in
    // plays a note or moves the octave
    if (e.code in ComputerKeys.MAP || e.code === 'KeyZ' || e.code === 'KeyX') document.documentElement.toggleAttribute('data-hardkeys', true);
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
    if (e.code === 'KeyB') {
      audio.sostenuto(0);
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
