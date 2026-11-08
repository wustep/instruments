// Tactile controls: knobs (with a real range input underneath for keyboard and
// assistive tech), pedals you can hold, and line-drawn instrument glyphs.

import type { InstrumentId } from '@piano-model/engine';
import { h } from './dom.ts';

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number>, ...kids: SVGElement[]): SVGElement => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const k of kids) el.appendChild(k);
  return el;
};

// ---------------------------------------------------------------- knob
export interface KnobSpec {
  key: string;
  /** full name (accessible name and tooltip) */
  label: string;
  /** one engraved word */
  short: string;
  /** what it does physically (tooltip) */
  sub: string;
  min: number;
  max: number;
  step: number;
  log?: boolean;
  fmt: (v: number) => string;
}

const toUnit = (c: KnobSpec, v: number) => (c.log ? Math.log(v / c.min) / Math.log(c.max / c.min) : (v - c.min) / (c.max - c.min));
const fromUnit = (c: KnobSpec, x: number) => (c.log ? c.min * Math.pow(c.max / c.min, x) : c.min + x * (c.max - c.min));

const arc = (r: number, a0: number, a1: number) => {
  const p = (a: number) => [20 + r * Math.sin(a), 20 - r * Math.cos(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};
const A0 = (-135 * Math.PI) / 180;
const A1 = (135 * Math.PI) / 180;

export function knob(c: KnobSpec, v0: number, onChange: (v: number) => void): { el: HTMLElement; set(v: number): void } {
  const track = svg('path', { d: arc(15, A0, A1), class: 'k-track' });
  const val = svg('path', { d: arc(15, A0, A0 + 0.01), class: 'k-val-arc' });
  const cap = svg('circle', { cx: 20, cy: 20, r: 10.5, class: 'k-cap' });
  const ptr = svg('line', { x1: 20, y1: 20, x2: 20, y2: 11, class: 'k-ptr' });
  const ticks = svg('g', { class: 'k-ticks' });
  for (let i = 0; i <= 10; i++) {
    const a = A0 + ((A1 - A0) * i) / 10;
    ticks.appendChild(svg('line', { x1: 20 + 18 * Math.sin(a), y1: 20 - 18 * Math.cos(a), x2: 20 + 19.6 * Math.sin(a), y2: 20 - 19.6 * Math.cos(a) }));
  }
  const face = svg('svg', { viewBox: '0 0 40 40', class: 'k-face', 'aria-hidden': 'true' }, ticks, track, val, cap, ptr);
  const input = h('input', { type: 'range', min: '0', max: '1', step: '0.001', 'aria-label': c.label, title: `${c.label}: ${c.sub}` }) as HTMLInputElement;
  const readout = h('span', { class: 'k-read' });
  const name = h('span', { class: 'k-name' }, c.short);
  const el = h('label', { class: 'knob', title: `${c.label} — ${c.sub}` }, input, readout, name);
  el.prepend(face as unknown as HTMLElement);
  let unit = toUnit(c, v0);
  const paint = () => {
    const a = A0 + (A1 - A0) * unit;
    val.setAttribute('d', arc(15, A0, Math.max(A0 + 0.01, a)));
    ptr.setAttribute('x2', (20 + 9 * Math.sin(a)).toFixed(2));
    ptr.setAttribute('y2', (20 - 9 * Math.cos(a)).toFixed(2));
    const v = Math.round(fromUnit(c, unit) / c.step) * c.step;
    readout.textContent = c.fmt(v);
    input.value = String(unit);
  };
  const commit = () => {
    const v = Math.round(fromUnit(c, unit) / c.step) * c.step;
    paint();
    onChange(v);
  };
  input.addEventListener('input', () => {
    unit = Number(input.value);
    commit();
  });
  // turn by dragging (up/right = more), fine control with Shift; wheel too
  let drag: { y: number; x: number; u: number } | null = null;
  face.addEventListener('pointerdown', (e: Event) => {
    const pe = e as PointerEvent;
    pe.preventDefault();
    (face as unknown as Element).setPointerCapture(pe.pointerId);
    drag = { y: pe.clientY, x: pe.clientX, u: unit };
    el.classList.add('turning');
    input.focus({ preventScroll: true });
  });
  face.addEventListener('pointermove', (e: Event) => {
    if (!drag) return;
    const pe = e as PointerEvent;
    const k = pe.shiftKey ? 0.0015 : 0.006;
    unit = Math.min(1, Math.max(0, drag.u + (drag.y - pe.clientY + (pe.clientX - drag.x)) * k));
    commit();
  });
  const end = () => {
    drag = null;
    el.classList.remove('turning');
  };
  face.addEventListener('pointerup', end);
  face.addEventListener('pointercancel', end);
  face.addEventListener(
    'wheel',
    (e: Event) => {
      const we = e as WheelEvent;
      we.preventDefault();
      unit = Math.min(1, Math.max(0, unit - Math.sign(we.deltaY) * 0.02));
      commit();
    },
    { passive: false },
  );
  paint();
  return {
    el,
    set(v: number) {
      if (!Number.isFinite(v)) return;
      unit = Math.min(1, Math.max(0, toUnit(c, v)));
      paint();
    },
  };
}

// ---------------------------------------------------------------- pedal
export function pedal(name: string, title: string, onValue: (v: number) => void): { el: HTMLElement; set(v: number): void } {
  const body = svg('path', { d: 'M7 3 H25 L28 23 Q28 27 24 27 H8 Q4 27 4 23 Z', class: 'p-foot' });
  const shine = svg('path', { d: 'M9 6 H23 L24.5 15', class: 'p-shine' });
  const face = svg('svg', { viewBox: '0 0 32 30', class: 'p-face', 'aria-hidden': 'true' }, body, shine);
  const el = h('button', { class: 'pedal', type: 'button', title, 'aria-label': title, 'aria-pressed': 'false' }, h('span', { class: 'p-name' }, name));
  el.prepend(face as unknown as HTMLElement);
  let held = false;
  const press = (v: number) => {
    held = v > 0;
    onValue(v);
  };
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    press(1);
  });
  const up = () => held && press(0);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      press(1);
    }
  });
  el.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation();
      press(0);
    }
  });
  return {
    el,
    set(v: number) {
      el.style.setProperty('--depress', String(v));
      el.setAttribute('aria-pressed', String(v > 0.05));
    },
  };
}

// ---------------------------------------------------------------- glyphs
// half-width profile of a violin-family body (fractions of body length), top = neck end
const BODY = [0, 0.13, 0.19, 0.228, 0.236, 0.215, 0.17, 0.155, 0.152, 0.168, 0.24, 0.278, 0.292, 0.27, 0.2, 0.12, 0];
const BODY_U = [0, 0.012, 0.04, 0.1, 0.19, 0.28, 0.35, 0.4, 0.47, 0.55, 0.62, 0.7, 0.79, 0.88, 0.95, 0.985, 1];
function bodyPath(cx: number, top: number, len: number): string {
  const L = BODY_U.map((u, i) => `${(cx - BODY[i] * len).toFixed(2)} ${(top + u * len).toFixed(2)}`);
  const R = BODY_U.map((u, i) => `${(cx + BODY[i] * len).toFixed(2)} ${(top + u * len).toFixed(2)}`).reverse();
  return `M${L.join(' L')} L${R.join(' L')} Z`;
}

export function glyph(id: InstrumentId): SVGElement {
  const g: SVGElement[] = [];
  if (id === 'piano') {
    g.push(svg('path', { d: 'M10 42 V11 Q10 5 16 5 Q22 5 24.5 12 Q27 19.5 33 23.5 Q38 26.5 38 32 V42 Z' }));
    g.push(svg('path', { d: 'M10 37 H38' }));
    for (let i = 0; i < 6; i++) g.push(svg('path', { d: `M${13 + i * 4} 37 V${[9, 10, 14, 21, 26, 29][i]}`, class: 'g-str' }));
  } else if (id === 'flute') {
    g.push(svg('path', { d: 'M7 41 L41 7', class: 'g-tube' }));
    for (let i = 0; i < 6; i++) g.push(svg('circle', { cx: 17 + i * 3.6, cy: 31 - i * 3.6, r: 1.1, class: 'g-hole' }));
    g.push(svg('circle', { cx: 37.5, cy: 10.5, r: 1.4, class: 'g-hole' }));
  } else {
    // the three bodies drawn at their true relative sizes
    const len = id === 'violin' ? 21 : id === 'viola' ? 24 : 30;
    const top = 47 - len - (id === 'cello' ? 3 : 2);
    const neck = len * 0.38;
    g.push(svg('path', { d: bodyPath(24, top, len) }));
    g.push(svg('path', { d: `M24 ${top - neck} V${top + len * 0.62}`, class: 'g-str' }));
    g.push(svg('circle', { cx: 24, cy: top - neck - 1.6, r: 1.6 }));
    if (id === 'cello') g.push(svg('path', { d: `M24 ${top + len} V${top + len + 3}` }));
  }
  return svg('svg', { viewBox: '0 0 48 48', class: 'glyph', 'aria-hidden': 'true' }, ...g);
}
