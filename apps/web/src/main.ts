import './styles.css';
import './vector.css';
import { diag, diagEnvironment, diagPanel } from './diag.ts';
diagEnvironment();
import { audio } from './audio.ts';
import { INSTRUMENT_INFO, midiName, type InstrumentId } from '@piano-model/engine';
import { ComputerKeys, createKeyboard } from './ui/keyboard.ts';
import { h, type View } from './ui/dom.ts';
import { pedal } from './ui/controls.ts';
import { MidiPlayer } from './ui/player.ts';
import { ensemble } from './orchestra/ensemble.ts';
import { isKeyboard } from './orchestra/assign.ts';
import { keysRange } from './orchestra/keys.ts';
import { keysForControl } from './ui/keys-for.ts';
import { PIECES } from './orchestra/pieces.ts';
import { installTips } from './ui/tip.ts';
import { stageView } from './views/stage.ts';
import { measureView } from './views/measure.ts';
import { notesView } from './views/notes.ts';
import { startNav } from './nav.ts';
import type { Page } from './address.ts';

/** The name in the browser tab. Nothing on the page itself names it: the instrument speaks. */
export const WORDMARK = 'instruments';

const app = document.getElementById('app')!;
const keys = new ComputerKeys();
const keyboard = createKeyboard();

// ---------------------------------------------------------------- fallboard (above the keys)
const sustainPedal = pedal('sustain', 'Sustain pedal (hold; Space on a keyboard, CC64 on MIDI)', (v) => audio.sustain(v));
const softPedal = pedal('soft', 'Una corda (hold; Shift on a keyboard, CC67 on MIDI)', (v) => audio.soft(v));
// the middle pedal: a grand's sostenuto, an upright's practice muffler (named for the piano shown)
const middlePedal = pedal('sost.', 'Sostenuto (hold; B on a keyboard, CC66 on MIDI)', (v) => audio.sostenuto(v));
let pedalsFor = '';
const syncPedals = () => {
  const up = audio.preset === 'upright' || audio.preset === 'honky-tonk';
  const key = `${audio.instrument}:${up}`;
  if (key === pedalsFor) return;
  pedalsFor = key;
  middlePedal.rename(up ? 'muffler' : 'sost.', up ? 'Practice muffler: a felt strip between hammers and strings (hold; B on a keyboard, CC66 on MIDI)' : 'Sostenuto: holds the dampers of the keys down when pressed (hold; B on a keyboard, CC66 on MIDI)');
  softPedal.rename('soft', up ? 'Soft pedal: the hammers rest nearer the strings (hold; Shift on a keyboard, CC67 on MIDI)' : 'Una corda: the action shifts, the hammers miss a string (hold; Shift on a keyboard, CC67 on MIDI)');
};
const knobSlot = h('div', { class: 'knobs', role: 'group', 'aria-label': 'Physical controls' });
const knobToggle = h('button', { class: 'knob-toggle', type: 'button', 'aria-label': 'Show the knobs', 'aria-expanded': 'false', 'data-tip': 'knobs' }, '◐');
knobToggle.addEventListener('click', () => {
  const open = document.documentElement.toggleAttribute('data-knobs');
  knobToggle.setAttribute('aria-expanded', String(open));
});
// octave: shifts the computer keys (Z/X or −/=) and brings the on-screen keys along
const octDown = h('button', { class: 'oct-btn', type: 'button', 'aria-label': 'Octave down', 'data-tip': 'octave down · Z', onclick: () => keys.octave(-1) }, '‹');
const octUp = h('button', { class: 'oct-btn', type: 'button', 'aria-label': 'Octave up', 'data-tip': 'octave up · X', onclick: () => keys.octave(1) }, '›');
const octLabel = h('span', { class: 'oct-label', 'aria-live': 'polite' });
const octave = h('div', { class: 'octave', role: 'group', 'aria-label': 'Octave' }, octDown, octLabel, octUp);
// an ensemble: in the knobs' place, the instruments the keys play (a phone: behind one button)
const keysFor = keysForControl();
const fallboard = h(
  'div',
  { class: 'fallboard' },
  h('div', { class: 'pedals' }, sustainPedal.el, softPedal.el, middlePedal.el),
  octave,
  knobToggle,
  knobSlot,
  keysFor.toggle,
  keysFor.el,
);
// (over the keys, a thin strip of all 88 with a window on those in view: it slides them)
const dock = h('footer', { class: 'dock' }, fallboard, keyboard.map, keyboard.el);

// ---------------------------------------------------------------- header: pilot lamp and two quiet links
const lampText = h('span', { class: 'lamp-text' }, 'tap a key');
const midiText = h('span', { class: 'midi' });
const srStatus = h('span', { class: 'sr' }, '');
const status = h('div', { class: 'status', 'aria-live': 'polite' }, h('i', { class: 'lamp' }), lampText, midiText, srStatus);
// (each page has its own address: nav.ts; the back link goes to the stage as it is)
const links = [
  h('a', { href: '/measurements', 'data-route': 'measurements' }, 'measurements'),
  h('a', { href: '/notes', 'data-route': 'notes' }, 'notes'),
];
const backLink = h('a', { class: 'back', href: '/', 'data-route': 'stage', 'aria-label': 'back to the instruments', 'data-tip': 'back' }, '←');
const header = h('header', { class: 'top' }, backLink, h('span', { class: 'spacer' }), status, h('nav', { class: 'links', 'aria-label': 'Pages' }, links));
const main = h('main', { id: 'main' });
// drop a .mid file anywhere to hear it (an ensemble's file on an ensemble)
const player = new MidiPlayer();
app.append(header, main, player.el, dock);

const routes: Record<Page, { title: string; make: () => View }> = {
  stage: { title: '', make: () => stageView(keyboard, knobSlot, player) },
  measurements: { title: 'Measurements', make: () => measureView() },
  notes: { title: 'Notes', make: () => notesView() },
};

let current: View | null = null;
function render(id: Page): void {
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
// the address: each tab its own, the Orchestra's setup in it; it sets the page up as it opens
startNav(player, render);

// ---------------------------------------------------------------- computer keyboard
keys.attach();
let lastBase = keys.base;
let slid = false;
const syncOctave = () => {
  keyboard.setLabels(keys.labels());
  octLabel.textContent = midiName(keys.base);
  octLabel.dataset.tip = `computer keys from ${midiName(keys.base)}`;
  octLabel.setAttribute('aria-label', `computer keys start at ${midiName(keys.base)}`);
  if (keys.base !== lastBase && !slid) keyboard.scrollToMidi(keys.base + 6, true);
  lastBase = keys.base;
};
keys.onChange(syncOctave);
syncOctave();
// the keys slid by hand (the position strip): the octave is the one now in view, so its arrows and
// the computer keys carry on from there (the keys stay where the hand left them)
keyboard.onSlide((centre) => {
  slid = true;
  keys.setBase(centre - 6);
  slid = false;
});
requestAnimationFrame(() => keyboard.scrollToMidi(keys.base + 6));

// ---------------------------------------------------------------- status
const fmtLat = () => {
  const l = audio.latencyMs;
  if (!l || !audio.ctx) return '';
  return `${audio.ctx.sampleRate / 1000} kHz · ${(l.base + l.output + l.quantum).toFixed(1)} ms out`;
};
// the lamp never sits on "warming up" silently: after 3 s it says what is going on and
// what to do; a failure shows the actual reason (shortened here, in full on hover)
const LAMP: Record<string, string> = { idle: 'tap a key', starting: 'warming up', running: '', suspended: 'tap a key' };
audio.state.on((s) => {
  const short = (m: string) => (m.length > 64 ? `${m.slice(0, 62)}…` : m);
  lampText.textContent = s === 'error' ? `no sound: ${short(audio.error)} · tap to retry` : s === 'stalled' ? audio.error : (LAMP[s] ?? '');
  srStatus.textContent = s === 'running' ? 'sound on' : s === 'starting' ? 'warming up' : s === 'error' ? `sound failed: ${audio.error}. Tap to retry.` : s === 'stalled' ? audio.error : 'tap a key to start';
  status.title = s === 'running' ? `sound on · ${fmtLat()}${audio.startMs ? ` · started in ${audio.startMs.toFixed(0)} ms` : ''}` : srStatus.textContent;
  document.documentElement.dataset.audio = s;
});
// tapping the lamp itself retries (also when the page has no keyboard)
status.addEventListener('click', () => audio.unlock('lamp'));
document.documentElement.dataset.audio = 'idle';
srStatus.textContent = 'tap a key to start';
// a small MIDI socket that lights up while a device is connected and flickers with
// incoming messages; hidden where the browser has no Web MIDI (Safari)
audio.midiActivity.on(() => {
  midiText.classList.add('blink');
  window.clearTimeout((midiText as HTMLElement & { _t?: number })._t);
  (midiText as HTMLElement & { _t?: number })._t = window.setTimeout(() => midiText.classList.remove('blink'), 80);
});
audio.midiStatus.on((m) => {
  const names = m.inputs.join(', ');
  midiText.textContent = m.inputs.length ? 'midi' : '';
  midiText.title = names ? `MIDI: ${names}` : '';
  midiText.hidden = !m.inputs.length;
  midiText.dataset.full = !m.supported ? 'no Web MIDI' : m.error ? 'MIDI: no access' : m.inputs.length ? `MIDI: ${names}` : 'no MIDI device';
  midiText.setAttribute('aria-label', midiText.dataset.full);
  status.dataset.midi = midiText.dataset.full;
});
audio.stats.on((s) => {
  sustainPedal.set(s.sustain);
  softPedal.set(s.soft);
  middlePedal.set(s.middle ?? audio.middleValue);
  syncPedals();
});
audio.keysChanged.on((ks) => keyboard.setPrepared(new Set(audio.instrument === 'piano' ? ks.filter((k) => k.preparation).map((k) => k.midi) : [])));
// where the computer keys start (always a C): middle C, the violin's and viola's first
// octave above their lowest string's C, the cello's C3, the double bass's C2, the flute's C5, the oboe's C4
// (its low B♭ and B just below), the clarinet's C4 (the chalumeau's top and the throat notes), the bassoon's
// C3 (the top of its first octave, where its parts sing), the horn's C3 (its parts sound F3–C5 and lower), the
// trumpet's C4, the timpani's C2 (the lowest drum's lowest note: the set's whole compass, C2–A3, under the
// computer keys)
const BASE: Record<InstrumentId, number> = { piano: 60, violin: 60, viola: 48, cello: 48, bass: 36, flute: 72, oboe: 60, clarinet: 60, bassoon: 48, horn: 48, trumpet: 60, trombone: 48, timpani: 36 };
const syncInstrument = (id: InstrumentId) => {
  const info = INSTRUMENT_INFO[id];
  keyboard.setRange(info.lo, info.hi);
  keys.setRange(info.lo, info.hi);
  keys.setBase(BASE[id]);
  softPedal.el.hidden = id !== 'piano';
  middlePedal.el.hidden = id !== 'piano';
  syncPedals();
  document.documentElement.dataset.instrument = id;
  requestAnimationFrame(() => keyboard.scrollToMidi(BASE[id] + 6));
};
audio.instrumentChanged.on(syncInstrument);
syncInstrument(audio.instrument);
// an ensemble: the keys span the ranges of the instruments they play (split: every instrument's),
// the computer keys kept inside it; a piano's other pedals while the keys play one
const syncEnsembleKeys = () => {
  if (!ensemble.active) return syncInstrument(audio.instrument);
  const lu = ensemble.lineup;
  const [lo, hi] = keysRange(ensemble.keys, lu);
  keyboard.setRange(lo, hi);
  keys.setRange(lo, hi);
  keys.setBase(keys.base);
  const kbd = ensemble.keyParts.some((k) => isKeyboard(lu[k]));
  softPedal.el.hidden = !kbd;
  middlePedal.el.hidden = !kbd;
};
ensemble.changed.on(syncEnsembleKeys);
ensemble.keysChanged.on(syncEnsembleKeys);
// (an address that opened on the Orchestra brought it on before these were listening)
if (ensemble.active) syncEnsembleKeys();
void audio.initMidi();

// Any gesture starts audio. Desktop browsers accept pointerdown/keydown, phones only
// pointerup/touchend/click, and iOS may interrupt a running context: keep listening.
for (const t of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const) window.addEventListener(t, (e) => audio.unlock(`${t}${(e as PointerEvent).pointerType ? ` (${(e as PointerEvent).pointerType})` : ''}`), { capture: true, passive: true });
// ?debug: the start-up log, live, in a corner
const diagEl = diagPanel();
if (diagEl) document.body.append(diagEl);
diag('page ready');

// expose small handles for automated tests (Playwright)
import { renderOffline } from '@piano-model/engine';
installTips();
(window as unknown as { __piano: typeof audio; __engine: unknown }).__piano = audio;
(window as unknown as { __engine: unknown }).__engine = { renderOffline };
(window as unknown as { __player: MidiPlayer }).__player = player;
(window as unknown as { __orchestra: unknown }).__orchestra = { ensemble, pieces: PIECES, loadPiece: (i: number) => player.loadPiece(i) };
