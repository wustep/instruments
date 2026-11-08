import { h, type View } from '../ui/dom.ts';

export function notesView(): View {
  const el = h('div', { class: 'view notes' }, h('h2', {}, 'Notes'), h('p', { class: 'prose' }, 'How it works — coming with the first calibration round.'));
  return { el, dock: false };
}
