import { audio } from '../audio.ts';
import { INSTRUMENT_IDS, INSTRUMENT_INFO, PRESETS, PRESET_IDS, midiName, type InstrumentId } from '@piano-model/engine';
import type { ComputerKeys } from '../ui/keyboard.ts';
import { fmt, fmtSci, h, type View } from '../ui/dom.ts';

const LEDE: Record<InstrumentId, string> = {
  piano:
    'Every note you hear is a physical simulation running in your browser: a felt hammer compressing against two or three steel strings, waves travelling along them, and a wooden soundboard that all strings share. No samples are played.',
  violin:
    'A bow drags a string by friction until it slips, catches, and slips again once per period — Helmholtz motion, computed sample by sample. The bridge passes it to a resonant wooden body, and the open strings answer.',
  viola: 'The violin’s larger, darker sibling: longer and heavier strings, a bigger body whose air and wood resonances sit lower.',
  cello: 'Long, heavy strings bowed at low speed on a big body: its air resonance near 100 Hz and wood modes around 200 Hz give the warmth.',
  flute: 'A jet of breath across a hole, deflected in and out of a tube by the sound inside it. Blow harder and the jet travels faster, the tone brightens, and the tube leaps to its next mode.',
};

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
  const presets = h('div', { class: 'presets', role: 'group', 'aria-label': 'Piano' }, presetBtns);

  const title = h('h1', {});
  const lede = h('p', {});
  const blurb = h('div', { class: 'inst-blurb' });
  const instBtns = INSTRUMENT_IDS.map((id) =>
    h(
      'button',
      {
        'aria-pressed': String(audio.instrument === id),
        onclick: () => void audio.setInstrument(id),
      },
      INSTRUMENT_INFO[id].label,
    ),
  );

  const noteEl = h('div', { class: 'big-note' }, '—');
  const noteSub = h('div', { class: 'label' }, 'last note');
  const fF = h('div', { class: 'v' }, '–');
  const fB = h('div', { class: 'v' }, '–');
  const fS = h('div', { class: 'v' }, '–');
  const fV = h('div', { class: 'v' }, '–');
  const lB = h('div', { class: 'label' }, 'inharmonicity B');
  const lS = h('div', { class: 'label' }, 'strings');
  const fact = (label: HTMLElement, v: HTMLElement) => h('div', { class: 'fact' }, label, v);

  const startBtn = h('button', { class: 'btn', onclick: () => void audio.start() }, 'Start sound');
  const startNote = h('span', { class: 'hint' }, 'Browsers need one click before audio can play.');
  const startCard = h('div', { class: 'start-card' }, startBtn, startNote);
  const hint = h('p', {});

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
        title,
        h('div', { class: 'prose lede' }, lede),
        startCard,
        h('div', { class: 'instruments', role: 'group', 'aria-label': 'Instrument' }, instBtns),
        blurb,
        presets,
      ),
      h(
        'aside',
        { class: 'readout', 'aria-label': 'Now sounding' },
        h('div', { class: 'row' }, h('div', {}, noteSub, noteEl), h('div', {})),
        h('div', { class: 'facts' }, fact(h('div', { class: 'label' }, 'partial 1'), fF), fact(lB, fB), fact(lS, fS), fact(h('div', { class: 'label' }, 'velocity'), fV)),
        h(
          'div',
          { class: 'hint' },
          h('p', {}, 'Play with the keys ', h('kbd', {}, 'A'), '–', h('kbd', {}, "'"), ' (black keys on the row above). ', h('kbd', {}, 'Z'), h('kbd', {}, 'X'), ' shift octave, ', h('kbd', {}, 'C'), h('kbd', {}, 'V'), ' change velocity. ', hint),
          h('p', {}, 'On screen, strike nearer the front of a key to play louder. A MIDI keyboard works too. ', midiLine),
        ),
      ),
    ),
  );

  const syncInstrument = (id: InstrumentId) => {
    const info = INSTRUMENT_INFO[id];
    title.textContent = id === 'piano' ? 'A piano that is computed, not recorded.' : `A ${info.label.toLowerCase()} that is computed, not recorded.`;
    lede.textContent = LEDE[id];
    blurb.textContent = `${info.blurb} Range ${midiName(info.lo)}–${midiName(info.hi)}.`;
    instBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(INSTRUMENT_IDS[i] === id)));
    presets.hidden = id !== 'piano';
    lB.textContent = id === 'piano' ? 'inharmonicity B' : id === 'flute' ? 'register' : 'string';
    lS.textContent = id === 'piano' ? 'strings' : id === 'flute' ? 'tube length' : 'vibrating length';
    hint.textContent =
      id === 'piano'
        ? 'Hold Space for the sustain pedal, Shift for una corda.'
        : id === 'flute'
          ? 'Hold a key to keep blowing; overlapping keys slur (legato). Hold Space to keep the note going.'
          : 'Hold a key to keep bowing; release lifts the bow and the string rings on. Up to four notes, one per string.';
  };

  const unsubs: (() => void)[] = [];
  return {
    el,
    dock: true,
    mount() {
      syncInstrument(audio.instrument);
      unsubs.push(audio.instrumentChanged.on(syncInstrument));
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
            if (audio.instrument === 'piano') {
              fB.textContent = fmtSci(k.B);
              fS.textContent = `${k.nStrings} × ${fmt(k.lengthM * 100, 0)} cm${k.preparation ? ` · ${k.preparation}` : ''}`;
            } else {
              fB.textContent = k.preparation ?? '–';
              fS.textContent = `${fmt(k.lengthM * 100, 1)} cm`;
            }
          } else {
            fF.textContent = 'out of range';
            fB.textContent = '–';
            fS.textContent = '–';
          }
          fV.textContent = String(n.velocity);
        }),
      );
      const m = audio.midi;
      midiLine.textContent = !m.supported ? '(This browser has no Web MIDI.)' : m.inputs.length ? `Connected: ${m.inputs.join(', ')}.` : 'CC64 sustains, CC67 is una corda; CC1 vibrato and CC11 / CC2 expression for strings and flute.';
      void keys;
    },
    unmount() {
      unsubs.forEach((u) => u());
    },
  };
}
