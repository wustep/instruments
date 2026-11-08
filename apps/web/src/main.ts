import './styles.css';
import { audio } from './audio.ts';
import { ComputerKeys, createKeyboard } from './ui/keyboard.ts';
import { h, type View } from './ui/dom.ts';
import { playView } from './views/play.ts';
import { insideView } from './views/inside.ts';
import { measureView } from './views/measure.ts';
import { notesView } from './views/notes.ts';

const app = document.getElementById('app')!;
const keys = new ComputerKeys();

const routes: Record<string, { title: string; make: () => View }> = {
  play: { title: 'Play', make: () => playView(keys) },
  inside: { title: 'Look inside', make: () => insideView() },
  measurements: { title: 'Measurements', make: () => measureView() },
  notes: { title: 'Notes', make: () => notesView() },
};

const navLinks = Object.entries(routes).map(([id, r]) => h('a', { href: `#/${id}`, 'data-route': id }, r.title));
const statusAudio = h('span', {}, h('i', { class: 'dot' }), 'audio off');
const statusLat = h('span', { class: 'hide-sm' }, '');
const statusMidi = h('span', {}, '');
const masthead = h(
  'header',
  { class: 'masthead' },
  h('a', { class: 'wordmark', href: '#/play' }, 'Piano Model'),
  h('nav', { class: 'nav', 'aria-label': 'Sections' }, navLinks),
  h('div', { class: 'status', 'aria-live': 'polite' }, statusAudio, statusLat, statusMidi),
);
const main = h('main', { id: 'main' });

// keyboard dock (persistent across views that want it)
const keyboard = createKeyboard();
const sustainBar = h('i');
const softBar = h('i');
const octaveInfo = h('span', { class: 'num hide-sm' });
const voiceInfo = h('span', { class: 'num' });
const dock = h(
  'footer',
  { class: 'dock' },
  h(
    'div',
    { class: 'dock-bar' },
    h('span', { class: 'pedal-chip', title: 'Sustain pedal (CC64, continuous; hold Space)' }, 'sustain', h('span', { class: 'bar' }, sustainBar)),
    h('span', { class: 'pedal-chip', title: 'Una corda (CC67; hold Shift)' }, 'una corda', h('span', { class: 'bar' }, softBar)),
    h('span', { class: 'spacer' }),
    octaveInfo,
    voiceInfo,
  ),
  keyboard.el,
);
app.append(masthead, main, dock);

let current: View | null = null;
function route(): void {
  const id = (location.hash.replace(/^#\/?/, '') || 'play').split('?')[0];
  const r = routes[id] ?? routes.play;
  current?.unmount?.();
  current = r.make();
  main.replaceChildren(current.el);
  dock.hidden = !current.dock;
  navLinks.forEach((a) => (a.dataset.route === id ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  document.title = id === 'play' ? 'Piano Model' : `${r.title} · Piano Model`;
  current.mount?.();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route();

// computer keyboard
keys.attach();
const refreshKeys = () => {
  keyboard.setLabels(keys.labels());
  octaveInfo.textContent = `keys C${Math.floor(keys.base / 12) - 1}–  vel ${keys.velocity}`;
};
keys.onChange(refreshKeys);
refreshKeys();
requestAnimationFrame(() => keyboard.scrollToMidi(keys.base + 6));

// status line
const fmtLat = () => {
  const l = audio.latencyMs;
  if (!l) return '';
  const total = l.base + l.output + l.quantum;
  return `${audio.ctx!.sampleRate / 1000} kHz · ${total.toFixed(1)} ms out`;
};
audio.state.on((s) => {
  statusAudio.lastChild!.textContent = s === 'running' ? 'audio on' : s === 'starting' ? 'starting…' : 'audio off';
  (statusAudio.firstChild as HTMLElement).classList.toggle('on', s === 'running');
  statusLat.textContent = fmtLat();
  statusLat.title = (() => {
    const l = audio.latencyMs;
    return l ? `baseLatency ${l.base.toFixed(1)} ms + outputLatency ${l.output.toFixed(1)} ms + one render quantum ${l.quantum.toFixed(2)} ms` : '';
  })();
});
audio.midiStatus.on((m) => {
  statusMidi.textContent = !m.supported ? 'no Web MIDI' : m.error ? 'MIDI: no access' : m.inputs.length ? `MIDI: ${m.inputs.join(', ')}` : 'no MIDI device';
});
audio.stats.on((s) => {
  sustainBar.style.width = `${s.sustain * 100}%`;
  softBar.style.width = `${s.soft * 100}%`;
  voiceInfo.textContent = `${s.voices} notes${s.sympathetic ? ` + ${s.sympathetic} sympathetic` : ''} · dsp ${(s.load * 100).toFixed(0)}%`;
});
audio.keysChanged.on((ks) => keyboard.setPrepared(new Set(ks.filter((k) => k.preparation).map((k) => k.midi))));
void audio.initMidi();

// first gesture anywhere starts audio
const kick = () => {
  void audio.start();
  window.removeEventListener('pointerdown', kick);
  window.removeEventListener('keydown', kick);
};
window.addEventListener('pointerdown', kick);
window.addEventListener('keydown', kick);

// expose a tiny handle for automated tests
(window as unknown as { __piano: typeof audio }).__piano = audio;
