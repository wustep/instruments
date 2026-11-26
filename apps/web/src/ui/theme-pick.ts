// The theme button: one small sign in the bar (four dots, the four looks' own colours, the one in use
// ringed) that opens a pick of the four, each a swatch and its name. No word in the bar: a tooltip and an
// accessible name say which look is on. The pick is laid out as the sheet's list of parts is (the same
// classes: each theme's own sheet already draws that menu), so it is every theme's without a rule of its
// own. Chosen, a look is the device's (themes/index.ts `setTheme`): the chrome, the 2D stage, the vector
// lines and the 3D world change together, and the pick shuts.

import { THEMES, onTheme, setTheme, theme, type Theme } from '../themes/index.ts';
import { h } from './dom.ts';

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number>): SVGElement => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/** the button's sign: a dot for each look in what that look lights with, the one in use ringed */
function dots(on: Theme): SVGElement {
  const s = svg('svg', { viewBox: '0 0 16 16', class: 'theme-dots', 'aria-hidden': 'true' });
  THEMES.forEach((t, i) => {
    const cx = 4.25 + 7.5 * (i % 2);
    const cy = 4.25 + 7.5 * Math.floor(i / 2);
    s.append(svg('circle', { cx, cy, r: 2.6, fill: t.swatch[1], class: t === on ? 'td on' : 'td' }));
  });
  return s;
}

/** a look in small: its ground, ringed in its linework, and what it lights with */
function swatch(t: Theme): SVGElement {
  const s = svg('svg', { viewBox: '0 0 24 24', class: 'glyph theme-swatch', 'aria-hidden': 'true' });
  s.append(svg('circle', { cx: 12, cy: 12, r: 9, fill: t.swatch[0], stroke: t.swatch[2], 'stroke-opacity': 0.6, 'stroke-width': 1 }), svg('circle', { cx: 12, cy: 12, r: 4, fill: t.swatch[1] }));
  return s;
}

export function themePick(): HTMLElement {
  const btn = h('button', { class: 'theme-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  let menu: HTMLElement | null = null;
  const sync = (t: Theme) => {
    btn.replaceChildren(dots(t) as unknown as Node);
    btn.dataset.tip = `theme · ${t.name}`;
    btn.setAttribute('aria-label', `Theme: ${t.name}`);
    menu?.querySelectorAll<HTMLElement>('[data-theme-id]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeId === t.id)));
  };
  const place = () => {
    if (!menu) return;
    const r = btn.getBoundingClientRect();
    const w = menu.offsetWidth;
    menu.style.left = `${Math.max(6, Math.min(window.innerWidth - w - 6, r.right - w))}px`;
    menu.style.top = `${r.bottom + 6}px`;
  };
  const away = (e: Event) => {
    const t = e.target as Node | null;
    if (menu && t && !menu.contains(t) && !btn.contains(t)) close();
  };
  const close = (refocus = false) => {
    if (!menu) return;
    menu.remove();
    menu = null;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', away, true);
    window.removeEventListener('resize', place);
    if (refocus) btn.focus();
  };
  const open = () => {
    const items = THEMES.map((t) => {
      const b = h('button', { class: 'sheet-pick theme-item', type: 'button', role: 'menuitemradio', 'aria-checked': String(t === theme()), 'data-theme-id': t.id }, h('span', {}, t.name));
      b.prepend(swatch(t) as unknown as Node);
      b.addEventListener('click', () => {
        setTheme(t.id);
        close(true);
      });
      return b;
    });
    menu = h('div', { class: 'sheet-menu theme-menu', role: 'menu', 'aria-label': 'Theme' }, ...items);
    menu.addEventListener('keydown', (e) => {
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
      } else if (e.key === 'Tab') close();
    });
    document.body.append(menu);
    place();
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', away, true);
    window.addEventListener('resize', place);
    (menu.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus();
  };
  btn.addEventListener('click', () => (menu ? close() : open()));
  onTheme(sync, true);
  return btn;
}
