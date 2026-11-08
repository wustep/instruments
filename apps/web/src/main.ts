import './styles.css';
import { audio } from './audio.ts';
import { INSTRUMENT_INFO, type InstrumentId } from '@piano-model/engine';
import { ComputerKeys, createKeyboard } from './ui/keyboard.ts';
import { h, type View } from './ui/dom.ts';
import { pedal } from './ui/controls.ts';
import { stageView } from './views/stage.ts';
import { measureView } from './views/measure.ts';
import { notesView } from './views/notes.ts';

/** The name on the fallboard and in the title. One constant, so a rename is one line. */
export const WORDMARK = 'instruments';

const app = document.getElementById('app')!;
const keys = new ComputerKeys();
const keyboard = createKeyboard();

// ---------------------------------------------------------------- fallboard (above the keys)
const sustainPedal = pedal('sustain', 'Sustain pedal (hold; Space on a keyboard, CC64 on MIDI)', (v) => audio.sustain(v));
const softPedal = pedal('soft', 'Una corda (hold; Shift on a keyboard, CC67 on MIDI)', (v) => audio.soft(v));
const knobSlot = h('div', { class: 'knobs', role: 'group', 'aria-label': 'Physical controls' });
const knobToggle = h('button', { class: 'knob-toggle', type: 'button', 'aria-label': 'Show the knobs', 'aria-expanded': 'false', title: 'Knobs' }, '◐');
knobToggle.addEventListener('click', () => {
  const open = document.documentElement.toggleAttribute('data-knobs');
  knobToggle.setAttribute('aria-expanded', String(open));
});
const fallboard = h(
  'div',
  { class: 'fallboard' },
  h('div', { class: 'pedals' }, sustainPedal.el, softPedal.el),
  h('a', { class: 'inlay', href: '#/' }, WORDMARK),
  knobToggle,
  knobSlot,
);
const dock = h('footer', { class: 'dock' }, fallboard, keyboard.el);

// ---------------------------------------------------------------- header: pilot lamp and two quiet links
const lampText = h('span', { class: 'lamp-text' }, 'tap a key');
const midiText = h('span', { class: 'midi' });
const srStatus = h('span', { class: 'sr' }, '');
const status = h('div', { class: 'status', 'aria-live': 'polite' }, h('i', { class: 'lamp' }), lampText, midiText, srStatus);
const links = [
  h('a', { href: '#/measurements', 'data-route': 'measurements' }, 'measurements'),
  h('a', { href: '#/notes', 'data-route': 'notes' }, 'notes'),
];
const backLink = h('a', { class: 'back', href: '#/', 'data-route': 'stage' }, `← ${WORDMARK.toLowerCase()}`);
const header = h('header', { class: 'top' }, backLink, h('span', { class: 'spacer' }), status, h('nav', { class: 'links', 'aria-label': 'Pages' }, links));
const main = h('main', { id: 'main' });
app.append(header, main, dock);

const routes: Record<string, { title: string; make: () => View }> = {
  stage: { title: '', make: () => stageView(keyboard, knobSlot) },
  measurements: { title: 'Measurements', make: () => measureView() },
  notes: { title: 'Notes', make: () => notesView() },
};
const ALIASES: Record<string, string> = { '': 'stage', play: 'stage', inside: 'stage' };

let current: View | null = null;
function route(): void {
  const raw = (location.hash.replace(/^#\/?/, '') || '').split('?')[0];
  const id = ALIASES[raw] ?? (routes[raw] ? raw : 'stage');
  const r = routes[id];
  current?.unmount?.();
  current = r.make();
  main.replaceChildren(current.el);
  dock.hidden = !current.dock;
  document.documentElement.dataset.route = id;
  links.forEach((a) => (a.dataset.route === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.title = r.title ? `${r.title} · ${WORDMARK}` : WORDMARK;
  current.mount?.();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();

// ---------------------------------------------------------------- computer keyboard
keys.attach();
keys.onChange(() => keyboard.setLabels(keys.labels()));
keyboard.setLabels(keys.labels());
requestAnimationFrame(() => keyboard.scrollToMidi(keys.base + 6));

// ---------------------------------------------------------------- status
const fmtLat = () => {
  const l = audio.latencyMs;
  if (!l || !audio.ctx) return '';
  return `${audio.ctx.sampleRate / 1000} kHz · ${(l.base + l.output + l.quantum).toFixed(1)} ms out`;
};
const LAMP: Record<string, string> = { idle: 'tap a key', starting: 'warming up', running: '', suspended: 'tap a key', error: 'tap to retry' };
audio.state.on((s) => {
  lampText.textContent = LAMP[s] ?? '';
  srStatus.textContent = s === 'running' ? 'sound on' : s === 'starting' ? 'warming up' : s === 'error' ? 'sound failed, tap to retry' : 'tap a key to start';
  status.title = s === 'running' ? `sound on · ${fmtLat()}${audio.startMs ? ` · started in ${audio.startMs.toFixed(0)} ms` : ''}` : srStatus.textContent;
  document.documentElement.dataset.audio = s;
});
document.documentElement.dataset.audio = 'idle';
srStatus.textContent = 'tap a key to start';
audio.midiStatus.on((m) => {
  const names = m.inputs.join(', ');
  midiText.textContent = m.inputs.length ? 'midi' : '';
  midiText.title = names;
  midiText.dataset.full = !m.supported ? 'no Web MIDI' : m.error ? 'MIDI: no access' : m.inputs.length ? `MIDI: ${names}` : 'no MIDI device';
  midiText.setAttribute('aria-label', midiText.dataset.full);
  status.dataset.midi = midiText.dataset.full;
});
audio.stats.on((s) => {
  sustainPedal.set(s.sustain);
  softPedal.set(s.soft);
});
audio.keysChanged.on((ks) => keyboard.setPrepared(new Set(audio.instrument === 'piano' ? ks.filter((k) => k.preparation).map((k) => k.midi) : [])));
const BASE: Record<InstrumentId, number> = { piano: 60, violin: 67, viola: 60, cello: 48, flute: 72 };
const syncInstrument = (id: InstrumentId) => {
  const info = INSTRUMENT_INFO[id];
  keyboard.setRange(info.lo, info.hi);
  keys.setBase(BASE[id]);
  softPedal.el.hidden = id !== 'piano';
  document.documentElement.dataset.instrument = id;
  requestAnimationFrame(() => keyboard.scrollToMidi(BASE[id] + 6));
};
audio.instrumentChanged.on(syncInstrument);
syncInstrument(audio.instrument);
void audio.initMidi();

// Any gesture starts audio. Desktop browsers accept pointerdown/keydown, phones only
// pointerup/touchend/click, and iOS may interrupt a running context: keep listening.
const unlock = () => audio.unlock();
for (const t of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const) window.addEventListener(t, unlock, { capture: true, passive: true });

// expose small handles for automated tests (Playwright)
import { renderOffline } from '@piano-model/engine';
(window as unknown as { __piano: typeof audio; __engine: unknown }).__piano = audio;
(window as unknown as { __engine: unknown }).__engine = { renderOffline };
