import { audio } from '../audio.ts';
import { PRESETS, PRESET_IDS, midiName } from '@piano-model/engine';
import type { ComputerKeys } from '../ui/keyboard.ts';
import { fmt, fmtSci, h, type View } from '../ui/dom.ts';

export function playView(keys: ComputerKeys): View {
  const presetBtns = PRESET_IDS.map((id) =>
    h(
      'button',
      {
        class: 'preset',
        'aria-pressed': String(audio.preset === id),
        onclick: async () => {
          await audio.setPreset(id);
          presetBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(PRESET_IDS[i] === id)));
        },
      },
      h('span', { class: 'mark' }),
      h('span', { class: 'name' }, PRESETS[id].label),
      h('span', { class: 'desc' }, PRESETS[id].description),
    ),
  );

  const noteEl = h('div', { class: 'big-note' }, '—');
  const noteSub = h('div', { class: 'label' }, 'last note');
  const fF = h('div', { class: 'v' }, '–');
  const fB = h('div', { class: 'v' }, '–');
  const fS = h('div', { class: 'v' }, '–');
  const fV = h('div', { class: 'v' }, '–');
  const fact = (label: string, v: HTMLElement) => h('div', { class: 'fact' }, h('div', { class: 'label' }, label), v);

  const startBtn = h('button', { class: 'btn', onclick: () => void audio.start() }, 'Start sound');
  const startNote = h('span', { class: 'hint' }, 'Browsers need one click before audio can play.');
  const startCard = h('div', { class: 'start-card' }, startBtn, startNote);

  const midiLine = h('span', {}, '');
  const el = h(
    'div',
    { class: 'view' },
    h(
      'div',
      { class: 'play-grid' },
      h(
        'section',
        {},
        h('h1', {}, 'A piano that is computed, not recorded.'),
        h(
          'div',
          { class: 'prose lede' },
          h(
            'p',
            {},
            'Every note you hear is a physical simulation running in your browser: a felt hammer compressing against two or three steel strings, waves travelling along them, and a wooden soundboard that all strings share. No samples are played.',
          ),
        ),
        startCard,
        h('div', { class: 'presets', role: 'group', 'aria-label': 'Instrument' }, presetBtns),
      ),
      h(
        'aside',
        { class: 'readout', 'aria-label': 'Now sounding' },
        h('div', { class: 'row' }, h('div', {}, noteSub, noteEl), h('div', {})),
        h('div', { class: 'facts' }, fact('partial 1', fF), fact('inharmonicity B', fB), fact('strings', fS), fact('velocity', fV)),
        h(
          'div',
          { class: 'hint' },
          h('p', {}, 'Play with the keys ', h('kbd', {}, 'A'), '–', h('kbd', {}, "'"), ' (black keys on the row above). ', h('kbd', {}, 'Z'), h('kbd', {}, 'X'), ' shift octave, ', h('kbd', {}, 'C'), h('kbd', {}, 'V'), ' change velocity. Hold ', h('kbd', {}, 'Space'), ' for the sustain pedal, ', h('kbd', {}, 'Shift'), ' for una corda.'),
          h('p', {}, 'On screen, strike nearer the front of a key to play louder. A MIDI keyboard works too, with continuous half-pedalling. ', midiLine),
        ),
      ),
    ),
  );

  const unsubs: (() => void)[] = [];
  return {
    el,
    dock: true,
    mount() {
      const syncStart = () => {
        startCard.hidden = audio.status === 'running';
        startBtn.textContent = audio.status === 'starting' ? 'Starting…' : 'Start sound';
      };
      syncStart();
      unsubs.push(audio.state.on(syncStart));
      unsubs.push(
        audio.notes.on((n) => {
          if (!n.on) return;
          noteEl.textContent = midiName(n.midi);
          const k = audio.piano?.keys.find((x) => x.midi === n.midi);
          if (k) {
            fF.textContent = `${fmt(k.f1, 2)} Hz`;
            fB.textContent = fmtSci(k.B);
            fS.textContent = `${k.nStrings} × ${fmt(k.lengthM * 100, 0)} cm${k.preparation ? ` · ${k.preparation}` : ''}`;
          }
          fV.textContent = String(n.velocity);
        }),
      );
      const m = audio.midi;
      midiLine.textContent = !m.supported ? '(This browser has no Web MIDI.)' : m.inputs.length ? `Connected: ${m.inputs.join(', ')}.` : '';
      void keys;
    },
    unmount() {
      unsubs.forEach((u) => u());
    },
  };
}
