// Tiny DOM helper.

import { THEMES, onTheme, theme, type GlyphName, type Theme } from '../themes/index.ts';

type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | boolean | EventListener | undefined> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SVGNS = 'http://www.w3.org/2000/svg';
function drawSign(host: Element, t: Theme): void {
  const g = t.glyphs[host.getAttribute('data-sign') as GlyphName];
  if (g === undefined) return;
  if (typeof g === 'string') return host.replaceChildren(g);
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', t.glyphs.svgClass);
  svg.setAttribute('aria-hidden', 'true');
  if (g.size) {
    svg.setAttribute('width', String(g.size));
    svg.setAttribute('height', String(g.size));
  }
  for (const [k, v] of Object.entries(t.glyphs.svgAttrs ?? {})) svg.setAttribute(k, v);
  const path = document.createElementNS(SVGNS, 'path');
  path.setAttribute('d', g.d);
  svg.appendChild(path);
  host.replaceChildren(svg);
}
/** One of the chrome's signs as `host`'s content (the way back, the octave's arrows, shut, as it was,
 *  the knobs): the theme's own, a character of its type or a drawn path (themes/types.ts `Glyphs`), and
 *  the new theme's when the theme changes. */
export function sign<T extends Element>(host: T, name: GlyphName): T {
  host.setAttribute('data-sign', name);
  drawSign(host, theme());
  return host;
}
if (typeof document !== 'undefined') onTheme((t) => document.querySelectorAll('[data-sign]').forEach((el) => drawSign(el, t)));

/** The looks that have something, as an element's `data-themes` names them: what only some looks have is
 *  made for all and is not there under the others (themes/base.css). */
export const looksWith = (has: (t: Theme) => unknown): string =>
  THEMES.filter((t) => has(t))
    .map((t) => t.id)
    .join(' ');

// (the body keeps its own copy of the page's ground for the overscroll colour, views/stage.ts: another
// theme's ground is another colour, and the copy would stay the old one's over everything in the body)
if (typeof document !== 'undefined') {
  onTheme(() => {
    if (document.body?.style.getPropertyValue('--ground')) document.body.style.setProperty('--ground', cssVar('--ground'));
  });
}

export interface View {
  el: HTMLElement;
  mount?(): void;
  unmount?(): void;
  /** show the keyboard dock under this view */
  dock: boolean;
}

export function fmt(x: number, digits = 1): string {
  return Number.isFinite(x) ? x.toFixed(digits) : '–';
}

export function fmtSci(x: number): string {
  if (!Number.isFinite(x) || x === 0) return '–';
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / Math.pow(10, e);
  return `${m.toFixed(2)}×10${superscript(e)}`;
}

function superscript(n: number): string {
  const map: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return String(n)
    .split('')
    .map((c) => map[c] ?? c)
    .join('');
}

/** Read a CSS custom property from :root. */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Set up a canvas for device pixel ratio; returns 2D context sized in CSS pixels. */
export function fitCanvas(c: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = c.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const hh = Math.max(1, Math.round(r.height));
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(hh * dpr);
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h: hh };
}
