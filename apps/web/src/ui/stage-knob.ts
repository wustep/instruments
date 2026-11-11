// A knob on the stage itself: the grand's lid and the room (the reverb), in 2D and in 3D. Drawn as
// the fallboard's knobs are (ui/controls.ts: ticks, track, the value's arc, the cap and its pointer;
// the same classes, so the vector style draws it too) on a dark disc that keeps it legible over the
// instrument, with no engraved word: the stage stays wordless, and the knob says what it is and its
// value in a tooltip (data-tip, as the grips did) and to assistive tech (a slider).
// Turned by dragging (up or right = more, Shift for fine), by the wheel, or from the keyboard (the
// arrows by 0.05, Home and End to the ends). A knob with notches (the 3D lid: shut, the short stick,
// the long stick) clicks from one to the next as it is turned, and its arrows step a notch; without,
// it is continuous and stays wherever it is let go.

import { h } from './dom.ts';

/** the arrows' step on a continuous knob (the grips' before them) */
export const KNOB_STEP = 0.05;
/** the drag's gain: a whole turn per this many px (Shift: four times finer), as the fallboard's */
const PX = 1 / 0.006;
/** the sweep: 270°, from −135° (0) to +135° (1), as the fallboard's */
const A0 = (-135 * Math.PI) / 180;
const A1 = (135 * Math.PI) / 180;
export const knobAngle = (u: number): number => A0 + (A1 - A0) * Math.min(1, Math.max(0, u));

/** where a turn that started at `u0` has got to, the pointer moved by (dx, dy) px (up or right = more) */
export function turnTo(u0: number, dx: number, dy: number, fine = false): number {
  return Math.min(1, Math.max(0, u0 + ((dx - dy) / PX) * (fine ? 0.25 : 1)));
}
/** the notch a turn at `u` clicks into (the nearest; halfway, the higher), or `u` without notches */
export function detent(u: number, notches: readonly number[] | null): number {
  if (!notches?.length) return u;
  let best = notches[0];
  for (const n of notches) if (Math.abs(n - u) <= Math.abs(best - u) + 1e-9) best = n;
  return best;
}
/** the value a key sets, from `v`: the arrows by KNOB_STEP (with notches: to the next notch that way),
 *  Home and End to the ends; null for any other key */
export function keyTo(v: number, key: string, notches: readonly number[] | null): number | null {
  const dir = key === 'ArrowUp' || key === 'ArrowRight' ? 1 : key === 'ArrowDown' || key === 'ArrowLeft' ? -1 : 0;
  if (dir) {
    if (notches?.length) {
      if (dir > 0) return notches.find((n) => n > v + 0.005) ?? notches[notches.length - 1];
      return [...notches].reverse().find((n) => n < v - 0.005) ?? notches[0];
    }
    return Math.min(1, Math.max(0, v + dir * KNOB_STEP));
  }
  if (key === 'Home') return notches?.length ? notches[0] : 0;
  if (key === 'End') return notches?.length ? notches[notches.length - 1] : 1;
  return null;
}

export interface StageKnobSpec {
  /** 'lid' or 'room': its class (`knob-<name>`) */
  name: string;
  /** the accessible name */
  label: string;
  /** its value said in words (the tooltip and aria-valuetext) */
  text: (v: number) => string;
  /** the parameter now (0 … 1) */
  get: () => number;
  /** set it (0 … 1) */
  set: (v: number) => void;
  /** the notches it clicks into, if it has them now */
  notches: () => readonly number[] | null;
  /** taken (true) and let go (false) */
  hold?: (on: boolean) => void;
}
export interface StageKnob {
  el: HTMLElement;
  /** paint the value now (each frame; nothing is written unless something changed) */
  show(v: number): void;
  /** it is being turned */
  readonly turning: boolean;
}

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};
const arc = (r: number, a0: number, a1: number) => {
  const p = (a: number) => [20 + r * Math.sin(a), 20 - r * Math.cos(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

export function stageKnob(c: StageKnobSpec): StageKnob {
  const bg = svg('circle', { cx: 20, cy: 20, r: 19.4, class: 'sk-bg' });
  const ticks = svg('g', { class: 'k-ticks' });
  const track = svg('path', { d: arc(15, A0, A1), class: 'k-track' });
  const val = svg('path', { d: arc(15, A0, A0 + 0.01), class: 'k-val-arc' });
  const cap = svg('circle', { cx: 20, cy: 20, r: 10.5, class: 'k-cap' });
  const ptr = svg('line', { x1: 20, y1: 20, x2: 20, y2: 11, class: 'k-ptr' });
  const face = svg('svg', { viewBox: '0 0 40 40', class: 'k-face', 'aria-hidden': 'true' });
  face.append(bg, ticks, track, val, cap, ptr);
  const el = h('div', { class: `stage-knob knob-${c.name}`, role: 'slider', tabindex: '0', 'aria-label': c.label, 'aria-valuemin': '0', 'aria-valuemax': '1' });
  el.append(face as unknown as Node);

  // the ticks: eleven fine ones, or (with notches) one longer tick at each notch
  let tickKey = '';
  const paintTicks = (n: readonly number[] | null) => {
    const key = n ? n.join(',') : '';
    if (key === tickKey && ticks.childNodes.length) return;
    tickKey = key;
    ticks.replaceChildren();
    const at = n ?? Array.from({ length: 11 }, (_, i) => i / 10);
    for (const u of at) {
      const a = knobAngle(u);
      const r0 = n ? 16.6 : 17.4;
      ticks.appendChild(svg('line', { x1: 20 + r0 * Math.sin(a), y1: 20 - r0 * Math.cos(a), x2: 20 + 19.2 * Math.sin(a), y2: 20 - 19.2 * Math.cos(a), class: n ? 'sk-notch' : '' }));
    }
    el.classList.toggle('notched', !!n);
  };
  let shown = NaN;
  let said = '';
  const show = (v: number) => {
    paintTicks(c.notches());
    if (v !== shown) {
      shown = v;
      const a = knobAngle(v);
      val.setAttribute('d', arc(15, A0, Math.max(A0 + 0.01, a)));
      ptr.setAttribute('x2', (20 + 9 * Math.sin(a)).toFixed(2));
      ptr.setAttribute('y2', (20 - 9 * Math.cos(a)).toFixed(2));
      el.setAttribute('aria-valuenow', String(v));
    }
    const t = c.text(v);
    if (t !== said) {
      said = t;
      el.dataset.tip = t;
      el.setAttribute('aria-valuetext', t);
    }
  };
  const put = (v: number) => {
    c.set(v);
    show(c.get());
  };

  let drag: { id: number; x: number; y: number; u: number } | null = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, u: c.get() };
    el.classList.add('dragging');
    el.focus({ preventScroll: true });
    c.hold?.(true);
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const u = turnTo(drag.u, e.clientX - drag.x, e.clientY - drag.y, e.shiftKey);
    const v = detent(u, c.notches());
    if (Math.abs(v - c.get()) > 1e-9) put(v);
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    el.classList.remove('dragging');
    c.hold?.(false);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  // the wheel: a continuous knob by 0.02 a step; a notched one a notch per wheel's worth of turning
  let wheel = 0;
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const n = c.notches();
      if (n) {
        wheel += e.deltaY;
        if (Math.abs(wheel) < 60) return;
        const to = keyTo(c.get(), wheel < 0 ? 'ArrowUp' : 'ArrowDown', n);
        wheel = 0;
        if (to !== null) put(to);
        return;
      }
      put(Math.min(1, Math.max(0, c.get() - Math.sign(e.deltaY) * 0.02)));
    },
    { passive: false },
  );
  el.addEventListener('keydown', (e) => {
    const to = keyTo(c.get(), e.key, c.notches());
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    put(to);
  });
  // (the stage paints it each frame: the parameters are not there before the instrument is)
  return {
    el,
    show,
    get turning() {
      return !!drag;
    },
  };
}
