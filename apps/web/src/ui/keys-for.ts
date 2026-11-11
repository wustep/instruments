// What the keys play in an ensemble: on the fallboard, where a single instrument has its knobs, the
// ensemble's instruments, each a glyph, lit when the keys play it (a tap
// adds or takes one; the last one stays), then "split" (a chord dealt out by register, one note to
// each instrument). On a phone the row waits behind one button showing what the keys play, as the
// knobs wait behind ◐. No words on the stage: each control has a tooltip and an accessible name.

import { VOICE_INFO } from '../orchestra/assign.ts';
import { ensemble } from '../orchestra/ensemble.ts';
import { seatNames, sectionName } from '../orchestra/sections.ts';
import { voiceGlyph } from './controls.ts';
import { h } from './dom.ts';

const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (w: number, hh: number, cls: string, inner: string): SVGElement => {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${hh}`);
  s.setAttribute('width', String(w));
  s.setAttribute('height', String(hh));
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = inner;
  return s;
};
/** the keys: three white keys and two black */
const keysSign = () => svg(16, 12, 'kf-sign', '<path d="M.6.6h14.8v10.8H.6zM5.53 6.5v4.9M10.47 6.5v4.9" fill="none" stroke="currentColor" stroke-width="1"/><path d="M4.1.6h2.9v6H4.1zM9 .6h2.9v6H9z" fill="currentColor"/>');
/** split: one line into three */
const splitSign = () => svg(18, 16, 'kf-split-sign', '<path d="M1.5 8h5M6.5 8c2.5 0 3-5 6-5h4M6.5 8h10M6.5 8c2.5 0 3 5 6 5h4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>');


export function keysForControl(): { el: HTMLElement; toggle: HTMLButtonElement } {
  const row = h('div', { class: 'kf', role: 'group', 'aria-label': 'The keys play' });
  const toggle = h('button', { class: 'kf-toggle', type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'true' });
  const open = (on: boolean) => {
    document.documentElement.toggleAttribute('data-keys-open', on);
    toggle.setAttribute('aria-expanded', String(on));
  };
  toggle.addEventListener('click', () => open(!document.documentElement.hasAttribute('data-keys-open')));
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as Node;
    if (document.documentElement.hasAttribute('data-keys-open') && !row.contains(t) && !toggle.contains(t)) open(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !document.documentElement.hasAttribute('data-keys-open')) return;
    open(false);
    toggle.focus();
  });

  const build = () => {
    if (!ensemble.active) open(false);
    const voices = ensemble.lineup;
    const names = seatNames(voices);
    const on = new Set(ensemble.keys.split ? [] : ensemble.keyParts);
    const split = ensemble.keys.split;
    const focus = (document.activeElement as HTMLElement | null)?.dataset?.kf ?? null;
    // a chip per section (orchestra/sections.ts: the desks of one instrument playing the same lines), its
    // desks chosen together; lit when they all play, half lit when some do
    const chips = ensemble.sections.map((sec) => {
      const k = sec.seats[0];
      const v = sec.voice;
      const label = sectionName(sec, names);
      const n = sec.seats.filter((x) => on.has(x)).length;
      const b = h('button', { class: 'kf-part', type: 'button', 'data-kf': `p${k}`, 'data-part': String(k), 'data-seats': sec.seats.join(' '), 'data-voice': v, 'aria-pressed': n === 0 ? 'false' : n === sec.seats.length ? 'true' : 'mixed', 'aria-label': label, 'data-tip': `keys · ${label}` });
      b.append(voiceGlyph(v));
      const badge = sec.seats.length > 1 ? `×${sec.seats.length}` : names[k] !== VOICE_INFO[v].label ? names[k].split(' ').pop()! : '';
      if (badge) b.append(h('span', { class: 'kf-n', 'aria-hidden': 'true' }, badge));
      b.addEventListener('click', () => ensemble.toggleKeys(sec.seats));
      return b;
    });
    const sp = h('button', { class: 'kf-split', type: 'button', 'data-kf': 'split', 'aria-pressed': String(split), 'aria-label': 'Split: a chord is dealt out by register, one note to each instrument', 'data-tip': 'split · one note each, by register' });
    sp.append(splitSign());
    sp.addEventListener('click', () => ensemble.splitKeys(!ensemble.keys.split));
    row.replaceChildren(...chips, sp);
    // the phone's button: the keys sign and what they play (the first instrument; "+2" for two more)
    const parts = [...on];
    const what = split ? 'split' : parts.map((k) => names[k]).join(', ');
    toggle.setAttribute('aria-label', `The keys play: ${what}`);
    toggle.dataset.tip = `keys · ${what}`;
    toggle.replaceChildren(keysSign(), split ? splitSign() : voiceGlyph(voices[parts[0]] ?? 'grand'));
    if (!split && parts.length > 1) toggle.append(h('span', { class: 'kf-more', 'aria-hidden': 'true' }, `+${parts.length - 1}`));
    if (focus) (row.querySelector(`[data-kf="${focus}"]`) as HTMLElement | null)?.focus();
  };
  ensemble.changed.on(build);
  ensemble.keysChanged.on(build);
  build();
  return { el: row, toggle };
}
