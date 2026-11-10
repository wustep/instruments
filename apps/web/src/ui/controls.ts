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
export function pedal(name: string, title: string, onValue: (v: number) => void): { el: HTMLElement; set(v: number): void; rename(name: string, title: string): void } {
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
    rename(n: string, t: string) {
      el.querySelector('.p-name')!.textContent = n;
      el.title = t;
      el.setAttribute('aria-label', t);
    },
  };
}

// ---------------------------------------------------------------- glyphs
// Line drawings in the stage's style: thin ivory strokes, dark lacquer/ebony fills.
// The violin family is drawn in order of size (violin 356, viola 410, cello 755, double bass
// 1110 mm bodies), so the picker shows the instruments' scale.

// half-width of a violin-family body against position (fractions of body length),
// with the upper and lower corners of the C-bouts
const OUTLINE: [number, number][] = [
  [0, 0.06], [0.015, 0.14], [0.05, 0.2], [0.11, 0.232], [0.19, 0.236], [0.26, 0.222], [0.3, 0.2],
  [0.315, 0.205], // upper corner
  [0.34, 0.17], [0.42, 0.152], [0.5, 0.158], [0.575, 0.18],
  [0.6, 0.218], // lower corner
  [0.615, 0.21], [0.67, 0.262], [0.76, 0.29], [0.85, 0.284], [0.93, 0.24], [0.98, 0.15], [1, 0.05],
];
// the double bass: sloped shoulders (the upper bout widest a quarter of the way down), a broad lower bout
const BASS_OUTLINE: [number, number][] = [
  [0, 0.07], [0.03, 0.095], [0.1, 0.155], [0.18, 0.205], [0.26, 0.232], [0.31, 0.226],
  [0.335, 0.214], // upper corner
  [0.36, 0.178], [0.43, 0.168], [0.5, 0.172], [0.535, 0.188],
  [0.555, 0.226], // lower corner
  [0.575, 0.252], [0.66, 0.28], [0.76, 0.298], [0.86, 0.286], [0.94, 0.238], [0.98, 0.16], [1, 0.06],
];
function bodyPath(cx: number, top: number, len: number, outline = OUTLINE): string {
  const pts = outline.map(([u, w]) => [cx - w * len, top + u * len]);
  const right = outline.map(([u, w]) => [cx + w * len, top + u * len]).reverse();
  const all = [...pts, ...right];
  // smooth through the points (Catmull–Rom as cubic Béziers)
  let d = `M${all[0][0].toFixed(2)} ${all[0][1].toFixed(2)}`;
  for (let i = 0; i < all.length; i++) {
    const p0 = all[(i - 1 + all.length) % all.length];
    const p1 = all[i];
    const p2 = all[(i + 1) % all.length];
    const p3 = all[(i + 2) % all.length];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d + ' Z';
}

function bowedGlyph(id: InstrumentId): SVGElement[] {
  const g: SVGElement[] = [];
  const bass = id === 'bass';
  // (the bass's body is the longest; its neck and head shorter for their size, to fit the tile)
  const len = id === 'violin' ? 20 : id === 'viola' ? 23 : bass ? 30.5 : 29.5;
  const cx = 24;
  const endpin = id === 'cello' ? 3 : bass ? 2.5 : 0;
  const top = 46.5 - len - endpin;
  const neck = len * (bass ? 0.29 : 0.36);
  const head = len * (bass ? 0.15 : 0.2);
  const nut = top - neck;
  // body, purfling, f-holes
  g.push(svg('path', { d: bodyPath(cx, top, len, bass ? BASS_OUTLINE : OUTLINE), class: 'g-body' }));
  const k = len / 24;
  for (const s of [-1, 1]) {
    const x = cx + s * 0.105 * len;
    const y0 = top + 0.44 * len;
    g.push(svg('path', { d: `M${x - s * 0.6 * k} ${y0} c${s * 1.6 * k} ${1.2 * k} ${-s * 1.4 * k} ${3.4 * k} ${s * 0.4 * k} ${4.8 * k}`, class: 'g-thin' }));
  }
  // fingerboard (ebony), bridge, tailpiece
  const fbEnd = top + 0.36 * len;
  g.push(svg('path', { d: `M${cx - 1.1 * k} ${nut} L${cx - 1.7 * k} ${fbEnd} L${cx + 1.7 * k} ${fbEnd} L${cx + 1.1 * k} ${nut} Z`, class: 'g-ebony' }));
  g.push(svg('path', { d: `M${cx - 2.2 * k} ${top + 0.55 * len} Q${cx} ${top + 0.53 * len} ${cx + 2.2 * k} ${top + 0.55 * len}`, class: 'g-bridge' }));
  g.push(svg('path', { d: `M${cx - 1.5 * k} ${top + 0.64 * len} L${cx - 0.8 * k} ${top + 0.95 * len} L${cx + 0.8 * k} ${top + 0.95 * len} L${cx + 1.5 * k} ${top + 0.64 * len} Z`, class: 'g-ebony' }));
  // four strings from the nut to the tailpiece
  for (let i = 0; i < 4; i++) {
    const t = (i - 1.5) / 1.5;
    g.push(svg('path', { d: `M${cx + t * 0.8 * k} ${nut} L${cx + t * 1.6 * k} ${top + 0.55 * len} L${cx + t * 1.2 * k} ${top + 0.64 * len}`, class: 'g-str' }));
  }
  // pegbox with pegs (the bass: machine heads, a brass plate down each cheek and a key out to each
  // side), and the scroll
  g.push(svg('path', { d: `M${cx - 1.1 * k} ${nut} L${cx - 0.9 * k} ${nut - head * 0.7} M${cx + 1.1 * k} ${nut} L${cx + 0.9 * k} ${nut - head * 0.7}`, class: 'g-thin' }));
  if (bass) {
    for (const sd of [-1, 1]) g.push(svg('path', { d: `M${cx + sd * 1.45 * k} ${nut - head * 0.08} V${nut - head * 0.66}`, class: 'g-steel' }));
    for (let i = 0; i < 4; i++) {
      const sd = i % 2 ? 1 : -1;
      const y = nut - head * (0.14 + 0.15 * i);
      g.push(svg('path', { d: `M${cx + sd * 1.45 * k} ${y} H${cx + sd * 2.9 * k}`, class: 'g-steel' }));
      g.push(svg('circle', { cx: cx + sd * 3.3 * k, cy: y, r: 0.45 * k, class: 'g-key' }));
    }
  } else
    for (let i = 0; i < 2; i++) {
      const y = nut - head * (0.2 + 0.28 * i);
      g.push(svg('path', { d: `M${cx - 2.6 * k} ${y} H${cx + 2.6 * k}`, class: 'g-thin' }));
    }
  const sy = nut - head * 0.85;
  g.push(svg('path', { d: `M${cx + 0.2 * k} ${sy} a${1.4 * k} ${1.4 * k} 0 1 1 ${-0.1 * k} ${-0.01 * k} M${cx} ${sy} m${-0.5 * k} 0 a${0.6 * k} ${0.6 * k} 0 1 0 ${0.9 * k} 0`, class: 'g-thin' }));
  if (endpin) g.push(svg('path', { d: `M${cx} ${top + len} V${top + len + endpin}`, class: 'g-steel' }));
  return g;
}

function pianoGlyph(): SVGElement[] {
  const g: SVGElement[] = [];
  // a grand seen from above, keyboard at the bottom: straight bass side, round tail,
  // the bentside's double curve, straight treble cheek
  const caseD = 'M9 43 V9.5 C9 5.2 11.8 3 15.4 3 C19.4 3 21.3 5.6 22.6 9.4 C24.4 14.8 26.2 19.6 31 23.4 C35.4 26.8 39 28.4 39 32.5 V43 Z';
  g.push(svg('path', { d: caseD, class: 'g-body' }));
  g.push(svg('path', { d: 'M11 37.5 V10 C11 6.6 13.2 5 15.4 5 C18.4 5 19.8 7 21 10.4 C22.8 15.6 24.8 20.8 29.8 24.8 C34 28 37 29.4 37 33 V37.5', class: 'g-thin' }));
  // bass strings cross over the tenor (overstrung); treble strings run straight
  for (let i = 0; i < 4; i++) g.push(svg('path', { d: `M${13.5 + i * 1.6} 37 L${11.8 + i * 2.3} ${8.5 + i * 1.6}`, class: 'g-str' }));
  for (let i = 0; i < 6; i++) {
    const x = 18 + i * 3.2;
    const yEnd = [9.5, 12.5, 17.5, 22.5, 26.5, 29.5][i];
    g.push(svg('path', { d: `M${x} 37 V${yEnd}`, class: 'g-str' }));
  }
  // bridge on the soundboard
  g.push(svg('path', { d: 'M17.5 11 C20 13.5 23 22 28 26 C31.5 28.8 34 30 36 31', class: 'g-bridge' }));
  // keybed with keys
  g.push(svg('rect', { x: 9, y: 37.5, width: 30, height: 5.5, class: 'g-keys' }));
  for (let i = 0; i < 10; i++) g.push(svg('rect', { x: 10.6 + i * 2.9, y: 37.5, width: 1.1, height: 3.2, class: 'g-fill' }));
  return g;
}

function uprightGlyph(): SVGElement[] {
  const g: SVGElement[] = [];
  // an upright from the front: the tall case, the strings hanging behind the music desk, the keybed
  g.push(svg('path', { d: 'M8 43 V8 C8 6 9.4 5 11.4 5 H36.6 C38.6 5 40 6 40 8 V43 Z', class: 'g-body' }));
  g.push(svg('path', { d: 'M10.5 30 V8.5 H37.5 V30', class: 'g-thin' }));
  for (let i = 0; i < 9; i++) g.push(svg('path', { d: `M${13 + i * 2.8} 29 V${9.5 + Math.max(0, i - 3) * 1.6}`, class: 'g-str' }));
  g.push(svg('path', { d: 'M12 22 C18 23.5 28 25.5 36 26', class: 'g-bridge' }));
  g.push(svg('rect', { x: 7, y: 31.5, width: 34, height: 5.5, class: 'g-keys' }));
  for (let i = 0; i < 11; i++) g.push(svg('rect', { x: 8.6 + i * 2.9, y: 31.5, width: 1.1, height: 3.2, class: 'g-fill' }));
  return g;
}

function fluteGlyph(): SVGElement[] {
  const g: SVGElement[] = [];
  // drawn along the diagonal: crown at the top right, foot at the bottom left
  const gr = svg('g', { transform: 'rotate(-45 24 24)' });
  gr.appendChild(svg('rect', { x: 2.5, y: 22.6, width: 43, height: 2.8, rx: 1.2, class: 'g-tube-body' }));
  gr.appendChild(svg('rect', { x: 44.6, y: 22.3, width: 2, height: 3.4, rx: 0.8, class: 'g-thin' })); // crown
  gr.appendChild(svg('ellipse', { cx: 39.8, cy: 24, rx: 2.6, ry: 2.1, class: 'g-thin' })); // lip plate
  gr.appendChild(svg('ellipse', { cx: 39.8, cy: 24, rx: 1, ry: 0.7, class: 'g-fill' })); // embouchure hole
  for (const x of [34.5, 10]) gr.appendChild(svg('path', { d: `M${x} 22.3 V25.7`, class: 'g-thin' })); // joints
  // key cups (open holes) along the body, foot joint rollers
  for (let i = 0; i < 7; i++) {
    const x = 31.5 - i * 2.9;
    gr.appendChild(svg('circle', { cx: x, cy: 24, r: 1.05, class: 'g-key' }));
    gr.appendChild(svg('circle', { cx: x, cy: 24, r: 0.35, class: 'g-fill' }));
  }
  for (let i = 0; i < 3; i++) gr.appendChild(svg('circle', { cx: 8 - i * 1.9, cy: 24, r: 0.75, class: 'g-key' }));
  gr.appendChild(svg('path', { d: 'M12 21.6 H31.5', class: 'g-steel' })); // key rod
  g.push(gr);
  return g;
}

function trumpetGlyph(): SVGElement[] {
  // side view: mouthpiece left, three valves, the slide loop below, the bell flaring right
  const g: SVGElement[] = [];
  g.push(svg('path', { d: 'M3.5 22 H30', class: 'g-thin' }));
  g.push(svg('path', { d: 'M2 20.6 Q4 21.3 4.6 21.8 V22.2 Q4 22.7 2 23.4 Z', class: 'g-fill' }));
  g.push(svg('path', { d: 'M15 22 V29 Q15 31 17 31 H31 Q33 31 33 29 V19 H35' }));
  g.push(svg('path', { d: 'M35 19 C40 19 43 17.5 46 13.5 M35 19.6 C40 19.6 43 21 46 25.5' }));
  g.push(svg('ellipse', { cx: 46, cy: 19.5, rx: 0.9, ry: 6, class: 'g-thin' }));
  for (let i = 0; i < 3; i++) {
    const x = 20 + i * 3.4;
    g.push(svg('rect', { x: x - 1.1, y: 18, width: 2.2, height: 8.5, rx: 0.8, class: 'g-ebony' }));
    g.push(svg('circle', { cx: x, cy: 16.4, r: 1, class: 'g-key' }));
    g.push(svg('path', { d: `M${x - 0.5} 26.5 V${28 + (i === 1 ? 0 : 1.5)} H${x + 0.5} V26.5`, class: 'g-str' }));
  }
  return g;
}

export function glyph(id: InstrumentId | 'upright'): SVGElement {
  const g = id === 'piano' ? pianoGlyph() : id === 'upright' ? uprightGlyph() : id === 'flute' ? fluteGlyph() : id === 'trumpet' ? trumpetGlyph() : bowedGlyph(id);
  return svg('svg', { viewBox: '0 0 48 48', class: 'glyph', 'aria-hidden': 'true' }, ...g);
}

/** an orchestra voice's glyph (the grand is the piano's) */
export const voiceGlyph = (v: 'grand' | 'upright' | 'violin' | 'viola' | 'cello' | 'bass' | 'flute' | 'trumpet'): SVGElement => glyph(v === 'grand' ? 'piano' : v);

/** the ensemble: four players' chairs on an arc around the conductor's place */
export function ensembleIcon(): SVGElement {
  const g: SVGElement[] = [];
  for (const [x, y] of [
    [3.2, 9.6],
    [6.4, 4.6],
    [11.6, 4.6],
    [14.8, 9.6],
  ])
    g.push(svg('circle', { cx: x, cy: y, r: 1.9 }));
  g.push(svg('path', { d: 'M7.4 13.4 H10.6', 'stroke-width': 1.1 }));
  return svg('svg', { viewBox: '0 0 18 16', width: 18, height: 16, class: 'ens-icon', 'aria-hidden': 'true' }, ...g);
}
