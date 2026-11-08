// Small SVG chart builder: line/dot series on one axis, optional log y, crosshair
// tooltip that snaps to the nearest x, and a data-table view. Colours come from
// CSS tokens (--ref, --accent); text always uses text tokens.

import { h } from './dom.ts';

export type SeriesColor = 'ref' | 'model' | 'muted';

export interface Series {
  name: string;
  color: SeriesColor;
  kind: 'line' | 'dots' | 'line+dots';
  points: { x: number; y: number }[];
  /** formatter for this series' values in tooltip/table */
  fmt?: (y: number) => string;
}

export interface Axis {
  label: string;
  min: number;
  max: number;
  log?: boolean;
  ticks: number[];
  fmt?: (v: number) => string;
}

export interface ChartSpec {
  title?: string;
  x: Axis;
  y: Axis;
  series: Series[];
  width?: number;
  height?: number;
  /** label for an x value in tooltips/tables (e.g. note names) */
  xName?: (x: number) => string;
  /** horizontal reference line */
  refLine?: number;
}

const COLOR: Record<SeriesColor, string> = { ref: 'var(--ref)', model: 'var(--accent)', muted: 'var(--muted)' };
const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

export function chart(spec: ChartSpec): HTMLElement {
  const W = spec.width ?? 560;
  const H = spec.height ?? 260;
  const m = { l: 46, r: 14, t: spec.title ? 22 : 10, b: 34 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const xs = (v: number) => m.l + ((v - spec.x.min) / (spec.x.max - spec.x.min)) * iw;
  const ylog = !!spec.y.log;
  const ys = (v: number) => {
    const t = ylog ? (Math.log(v) - Math.log(spec.y.min)) / (Math.log(spec.y.max) - Math.log(spec.y.min)) : (v - spec.y.min) / (spec.y.max - spec.y.min);
    return m.t + ih * (1 - Math.max(-0.02, Math.min(1.02, t)));
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  if (spec.title) {
    const t = el('text', { x: m.l, y: 13, class: 'panel-title' });
    t.textContent = spec.title;
    svg.appendChild(t);
  }
  const fx = spec.x.fmt ?? ((v: number) => String(v));
  const fy = spec.y.fmt ?? ((v: number) => String(v));
  // grid + axes
  const grid = el('g', { class: 'grid' });
  for (const t of spec.y.ticks) {
    const y = ys(t);
    grid.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: y, y2: y }));
  }
  svg.appendChild(grid);
  const ax = el('g', { class: 'axis' });
  ax.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih }));
  for (const t of spec.y.ticks) {
    const tx = el('text', { x: m.l - 6, y: ys(t) + 3, 'text-anchor': 'end' });
    tx.textContent = fy(t);
    ax.appendChild(tx);
  }
  for (const t of spec.x.ticks) {
    const tx = el('text', { x: xs(t), y: m.t + ih + 14, 'text-anchor': 'middle' });
    tx.textContent = fx(t);
    ax.appendChild(tx);
  }
  svg.appendChild(ax);
  const xl = el('text', { x: m.l + iw, y: H - 3, 'text-anchor': 'end', class: 'axis-label' });
  xl.textContent = spec.x.label;
  svg.appendChild(xl);
  const yl = el('text', { x: 4, y: m.t + 2, class: 'axis-label', transform: `rotate(-90 4 ${m.t + 2})`, 'text-anchor': 'end' });
  yl.textContent = spec.y.label;
  svg.appendChild(yl);
  if (spec.refLine !== undefined) {
    svg.appendChild(el('line', { x1: m.l, x2: W - m.r, y1: ys(spec.refLine), y2: ys(spec.refLine), stroke: 'var(--rule-2)', 'stroke-width': 1 }));
  }
  // series: lines first, then dots on top
  const valid = (p: { x: number; y: number }) => Number.isFinite(p.y) && (!ylog || p.y > 0);
  for (const s of spec.series) {
    if (s.kind === 'dots') continue;
    const pts = s.points.filter(valid);
    if (pts.length < 2) continue;
    let d = '';
    let pen = false;
    for (let i = 0; i < s.points.length; i++) {
      const p = s.points[i];
      if (!valid(p)) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${xs(p.x).toFixed(1)},${ys(p.y).toFixed(1)}`;
      pen = true;
    }
    svg.appendChild(el('path', { d, class: 'series-line', stroke: COLOR[s.color] }));
  }
  for (const s of spec.series) {
    if (s.kind === 'line') continue;
    for (const p of s.points.filter(valid)) {
      svg.appendChild(el('circle', { cx: xs(p.x), cy: ys(p.y), r: 4, class: 'dot', fill: COLOR[s.color] }));
    }
  }
  // hover layer
  const cross = el('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' });
  svg.appendChild(cross);
  const hit = el('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
  svg.appendChild(hit);
  const wrap = h('div', { class: 'chart' });
  const tip = h('div', { class: 'tip', hidden: true });
  const xsAll = Array.from(new Set(spec.series.flatMap((s) => s.points.filter(valid).map((p) => p.x)))).sort((a, b) => a - b);
  const xname = spec.xName ?? fx;
  const show = (clientX: number) => {
    if (!xsAll.length) return;
    const r = svg.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    let best = xsAll[0];
    for (const x of xsAll) if (Math.abs(xs(x) - vx) < Math.abs(xs(best) - vx)) best = x;
    cross.setAttribute('x1', String(xs(best)));
    cross.setAttribute('x2', String(xs(best)));
    cross.setAttribute('visibility', 'visible');
    tip.replaceChildren(h('div', { class: 'tt' }, xname(best)));
    for (const s of spec.series) {
      const p = s.points.find((q) => q.x === best && valid(q));
      if (!p) continue;
      const key = h('i');
      key.style.background = COLOR[s.color];
      tip.appendChild(h('div', { class: 'row' }, key, h('b', {}, (s.fmt ?? fy)(p.y)), h('span', {}, s.name)));
    }
    tip.hidden = false;
    const px = (xs(best) / W) * r.width;
    const left = px + 14 + 170 > r.width ? px - 14 - tip.offsetWidth : px + 14;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${(m.t / H) * r.height}px`;
  };
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', () => {
    tip.hidden = true;
    cross.setAttribute('visibility', 'hidden');
  });
  svg.setAttribute('tabindex', '0');
  let focusIdx = -1;
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    focusIdx = Math.max(0, Math.min(xsAll.length - 1, focusIdx + (e.key === 'ArrowRight' ? 1 : -1)));
    const r = svg.getBoundingClientRect();
    show(r.left + (xs(xsAll[focusIdx]) / W) * r.width);
    e.preventDefault();
  });
  svg.addEventListener('blur', () => (tip.hidden = true));
  wrap.append(svg, tip);
  return wrap;
}

export function legend(items: { name: string; color: SeriesColor; kind: 'line' | 'dot' }[]): HTMLElement {
  return h(
    'div',
    { class: 'legend' },
    items.map((it) => {
      const sw = h('i', { class: it.kind === 'dot' ? 'dot' : '' });
      sw.style.background = COLOR[it.color];
      return h('span', {}, sw, it.name);
    }),
  );
}

/** Collapsible data table (accessibility / exact values). */
export function dataTable(cols: string[], rows: (string | number)[][]): HTMLElement {
  return h(
    'details',
    { class: 'data' },
    h('summary', {}, 'Data table'),
    h(
      'div',
      { class: 'scroll' },
      h(
        'table',
        {},
        h('thead', {}, h('tr', {}, cols.map((c) => h('th', {}, c)))),
        h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, String(c)))))),
      ),
    ),
  );
}
