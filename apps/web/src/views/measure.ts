import { h, type View } from '../ui/dom.ts';

export function measureView(): View {
  const el = h('div', { class: 'view' }, h('h2', {}, 'Measurements'), h('p', { class: 'prose' }, 'Calibration data is being prepared.'));
  return { el, dock: false };
}
