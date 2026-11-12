// The instrument stage: play and look inside in one place. The selected instrument is
// drawn in plan view and moves with the simulation; the controls are knobs on the
// fallboard; there is almost no text.

import { audio } from '../audio.ts';
import { DEFAULT_PARAMS, INSTRUMENT_IDS, INSTRUMENT_INFO, PRESETS, PRESET_IDS, bowedGeometry, pianoKeySummary, tromboneSizeOf, type InstrumentId, type KeySummary, type VisualFrame } from '@piano-model/engine';
import { cssVar, fitCanvas, fmt, h, type View } from '../ui/dom.ts';
import type { KeyboardHandle } from '../ui/keyboard.ts';
import { openActionView } from '../ui/action-view.ts';
import type { Stage3D } from '../ui/gl/stage3d.ts';
import { webgl2Available } from '../ui/gl/webgl2.ts';
import { ensembleIcon, glyph, knob, voiceGlyph, type KnobSpec } from '../ui/controls.ts';
import { etHz, noteName, partNotes, summarize } from '../ui/readout.ts';
import { ensemble, type PartLive } from '../orchestra/ensemble.ts';
import { isKeyboard, planOf, VOICE_INFO, type Voice } from '../orchestra/assign.ts';
import { enterOrchestra, leaveOrchestra } from '../orchestra/setup.ts';
import { look } from '../look.ts';
import { drawEnsemble, ensembleCells, newPartDraw, syncPianoState, type Cell, type PartDraw } from '../ui/ensemble-draw.ts';
import type { EnsPartIn } from '../ui/gl/scenes3d.ts';
import type { MidiPlayer } from '../ui/player.ts';
import { AutoScale, INK as STAGE_INK, ModeField, drawBowed, drawFlute, drawSpectrum, drawTrumpet, rgba, type BowedGeom, type BowedState } from '../ui/stage-draw.ts';
import { drawPiano, keysAcross, newPianoState, stringAt } from '../ui/piano-draw.ts';
import { drawRoom, newRoomState } from '../ui/room-draw.ts';
import { createHandBow, type HandBow } from '../ui/hand-bow.ts';
import { stageKnob } from '../ui/stage-knob.ts';
import { LID_RESTS, lidNotch, lidSettle, onNotch } from '../ui/lid.ts';
import { Contours, SCOPE_INK_V, SPECTRUM_INK_V, SPECTRUM_INK_V_PIANO, drawBassoonV, drawBowedV, drawClarinetV, drawFluteV, drawHarpV, drawOboeV, drawPianoV, drawRoomV, drawTrumpetV, drawHornV, drawTromboneV, drawTubaV, drawTimpaniV, glow, loadVectorFont, slotColor } from '../ui/vector/index.ts';
import { drawOboe, newOboeState } from '../ui/oboe-draw.ts';
import { drawClarinet, newClarinetState } from '../ui/clarinet-draw.ts';
import { drawBassoon, newBassoonState } from '../ui/bassoon-draw.ts';
import { drawHorn, newHornState } from '../ui/horn-draw.ts';
import { drawTrombone, newTromboneState } from '../ui/trombone-draw.ts';
import { drawTuba, newTubaState } from '../ui/tuba-draw.ts';
import { drawHarp, newHarpState } from '../ui/harp-draw.ts';
import { drawTimpani, newTimpaniState } from '../ui/timpani-draw.ts';

const PIANO_KNOBS: KnobSpec[] = [
  { key: 'hammerHardness', label: 'Hammer hardness', short: 'hammer', sub: 'felt stiffness K in F = K·xᵖ', min: 0.25, max: 4, step: 0.01, log: true, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'stringStiffness', label: 'String stiffness', short: 'stiffness', sub: 'inharmonicity B; 0 = ideal string', min: 0, max: 5, step: 0.05, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'unisonDetune', label: 'Unison detune', short: 'detune', sub: 'spread of the 2–3 strings of a note', min: 0, max: 30, step: 0.1, fmt: (v) => `${fmt(v, 1)} ¢` },
  { key: 'soundboardDamping', label: 'Soundboard damping', short: 'board', sub: 'loss of the soundboard modes', min: 0.25, max: 5, step: 0.01, log: true, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'sustain', label: 'String decay', short: 'decay', sub: 'intrinsic string losses', min: 0.3, max: 2.5, step: 0.01, log: true, fmt: (v) => `×${fmt(v, 2)}` },
];
const BOWED_KNOBS: KnobSpec[] = [
  { key: 'bowPosition', label: 'Bow position', short: 'contact', sub: 'distance from the bridge β: sul ponticello … sul tasto', min: 0.04, max: 0.25, step: 0.005, fmt: (v) => `β ${fmt(v, 3)}` },
  { key: 'bowPressure', label: 'Bow force', short: 'force', sub: 'fraction of Schelleng’s maximum: airy … raucous', min: 0.05, max: 1.1, step: 0.01, log: true, fmt: (v) => fmt(v, 2) },
  { key: 'vibrato', label: 'Vibrato', short: 'vibrato', sub: 'finger rocking depth, cents', min: 0, max: 40, step: 0.5, fmt: (v) => `${fmt(v, 0)} ¢` },
  { key: 'bodyDamping', label: 'Body damping', short: 'body', sub: 'loss of the wood and air modes', min: 0.25, max: 4, step: 0.01, log: true, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'bowChangeTime', label: 'Bow change', short: 'change', sub: 'time to reverse the bow: seamless … laboured', min: 0.02, max: 0.25, step: 0.005, log: true, fmt: (v) => `${fmt(v * 1000, 0)} ms` },
];
const FLUTE_KNOBS: KnobSpec[] = [
  { key: 'breath', label: 'Breath pressure', short: 'breath', sub: '× nominal; past about ×2 the tube overblows', min: 0.4, max: 2.6, step: 0.01, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'embouchure', label: 'Lip–edge distance', short: 'lip', sub: 'jet length: shorter is brighter and sharper', min: 0.6, max: 1.5, step: 0.01, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'noise', label: 'Breath noise', short: 'noise', sub: 'turbulence of the jet', min: 0, max: 3, step: 0.01, fmt: (v) => fmt(v, 2) },
  { key: 'vibrato', label: 'Vibrato', short: 'vibrato', sub: 'breath pressure modulation', min: 0, max: 0.2, step: 0.005, fmt: (v) => fmt(v, 3) },
];
const OBOE_KNOBS: KnobSpec[] = [
  { key: 'breath', label: 'Breath pressure', short: 'breath', sub: '× the dynamic’s blowing pressure: harder, the blades beat and the tone brightens', min: 0.6, max: 1.4, step: 0.01, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'embouchure', label: 'Embouchure', short: 'reed', sub: 'the lips on the reed: pinched (darker, softer) … open', min: 0.6, max: 1.5, step: 0.01, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'noise', label: 'Breath noise', short: 'noise', sub: 'turbulence in the reed’s channel', min: 0, max: 4, step: 0.01, fmt: (v) => fmt(v, 2) },
  { key: 'vibrato', label: 'Vibrato', short: 'vibrato', sub: 'breath pressure modulation', min: 0, max: 0.12, step: 0.005, fmt: (v) => fmt(v, 3) },
];
const TRUMPET_KNOBS: KnobSpec[] = [
  { key: 'breath', label: 'Breath pressure', short: 'breath', sub: '× nominal blowing pressure', min: 0.4, max: 1.8, step: 0.01, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'lip', label: 'Lip tension', short: 'lips', sub: 'semitones above or below the note; far enough, the next partial speaks', min: -3, max: 3, step: 0.05, fmt: (v) => `${v > 0 ? '+' : ''}${fmt(v, 2)} st` },
  { key: 'vibrato', label: 'Vibrato', short: 'vibrato', sub: 'lip vibrato depth', min: 0, max: 0.02, step: 0.0005, fmt: (v) => fmt(v * 1000, 1) },
];
const HORN_KNOBS: KnobSpec[] = [
  { key: 'breath', label: 'Breath pressure', short: 'breath', sub: '× the dynamic’s blowing pressure: harder, the lips close sharper and the tone turns brassy', min: 0.6, max: 1.4, step: 0.01, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'lip', label: 'Lip tension', short: 'lips', sub: 'semitones above or below the note; high up the partials are a tone apart, so not far before the next one speaks', min: -3, max: 3, step: 0.05, fmt: (v) => `${v > 0 ? '+' : ''}${fmt(v, 2)} st` },
  { key: 'noise', label: 'Breath noise', short: 'noise', sub: 'turbulence in the lips’ slit', min: 0, max: 4, step: 0.01, fmt: (v) => fmt(v, 2) },
  { key: 'vibrato', label: 'Vibrato', short: 'vibrato', sub: 'lip vibrato depth (horn players mostly play without)', min: 0, max: 0.01, step: 0.0005, fmt: (v) => fmt(v * 1000, 1) },
];
const TROMBONE_KNOBS: KnobSpec[] = [
  { key: 'breath', label: 'Breath pressure', short: 'breath', sub: '× the dynamic’s blowing pressure: harder, the wave steepens down the slide and the tone turns brassy', min: 0.6, max: 1.4, step: 0.01, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'lip', label: 'Lip tension', short: 'lips', sub: 'semitones above or below the note; far enough, the next partial speaks', min: -3, max: 3, step: 0.05, fmt: (v) => `${v > 0 ? '+' : ''}${fmt(v, 2)} st` },
  { key: 'noise', label: 'Breath noise', short: 'noise', sub: 'turbulence in the lips’ slit', min: 0, max: 4, step: 0.01, fmt: (v) => fmt(v, 2) },
  { key: 'vibrato', label: 'Vibrato', short: 'vibrato', sub: 'lip vibrato depth', min: 0, max: 0.01, step: 0.0005, fmt: (v) => fmt(v * 1000, 1) },
  { key: 'gliss', label: 'Slide', short: 'slide', sub: 'a slur that moves the slide: a soft legato tongue (0) … a glissando (1)', min: 0, max: 1, step: 1, fmt: (v) => (v >= 0.5 ? 'gliss' : 'legato') },
  { key: 'size', label: 'Size', short: 'size', sub: 'alto in E♭ · tenor in B♭/F · bass in B♭/F/G♭: one model at each one’s measures', min: 0, max: 2, step: 1, fmt: (v) => ['alto', 'tenor', 'bass'][Math.round(v)] ?? 'tenor' },
];
/** a pedal's three notches, as the note it gives */
const pedalKnob = (key: string, letter: string): KnobSpec => ({ key, label: `${letter} pedal`, short: letter, sub: `every ${letter} string: up, flat · the middle notch, natural · down, sharp`, min: -1, max: 1, step: 1, fmt: (v) => `${letter}${v < -0.5 ? '♭' : v > 0.5 ? '♯' : '♮'}` });
/** the pedals' parameters, in their order at the harpist's feet */
const HARP_PEDAL_KEYS = ['pedalD', 'pedalC', 'pedalB', 'pedalE', 'pedalF', 'pedalG', 'pedalA'];
const HARP_KNOBS: KnobSpec[] = [
  { key: 'pluck', label: 'Pluck point', short: 'pluck', sub: 'where the finger takes the string, from the soundboard: by the board, thin (près de la table) … the middle, round', min: 0.08, max: 0.5, step: 0.01, fmt: (v) => fmt(v, 2) },
  { key: 'damp', label: 'Damping', short: 'damp', sub: 'a key let go: the string rings on (0, laissez vibrer) … the hand stops it (1, étouffé)', min: 0, max: 1, step: 0.01, fmt: (v) => (v < 0.02 ? 'l.v.' : fmt(v, 2)) },
  pedalKnob('pedalD', 'D'),
  pedalKnob('pedalC', 'C'),
  pedalKnob('pedalB', 'B'),
  pedalKnob('pedalE', 'E'),
  pedalKnob('pedalF', 'F'),
  pedalKnob('pedalG', 'G'),
  pedalKnob('pedalA', 'A'),
];
const TUBA_KNOBS: KnobSpec[] = [
  { key: 'breath', label: 'Breath pressure', short: 'breath', sub: '× the dynamic’s blowing pressure: harder, the tone opens and brightens', min: 0.6, max: 1.4, step: 0.01, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'lip', label: 'Lip tension', short: 'lips', sub: 'semitones above or below the note; far enough, the next partial speaks', min: -3, max: 3, step: 0.05, fmt: (v) => `${v > 0 ? '+' : ''}${fmt(v, 2)} st` },
  { key: 'noise', label: 'Breath noise', short: 'noise', sub: 'turbulence in the lips’ slit', min: 0, max: 4, step: 0.01, fmt: (v) => fmt(v, 2) },
  { key: 'vibrato', label: 'Vibrato', short: 'vibrato', sub: 'lip vibrato depth', min: 0, max: 0.01, step: 0.0005, fmt: (v) => fmt(v * 1000, 1) },
];
const TIMPANI_KNOBS: KnobSpec[] = [
  { key: 'mallet', label: 'Mallet', short: 'mallet', sub: 'the felt’s hardness: soft and round … hard, a short bright stroke', min: 0.25, max: 4, step: 0.01, log: true, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'spot', label: 'Strike point', short: 'spot', sub: 'out from the head’s centre (a fraction of its radius): the middle thumps, near the rim rings thin', min: 0.2, max: 0.9, step: 0.01, fmt: (v) => fmt(v, 2) },
  { key: 'damp', label: 'Damping', short: 'damp', sub: 'a released key: the drum rings on (0) … the fingers stop the head at once', min: 0, max: 1, step: 0.01, fmt: (v) => fmt(v, 2) },
  { key: 'roll', label: 'Roll', short: 'roll', sub: 'a held key rolls: single strokes (0) … a fast roll', min: 0, max: 1, step: 0.01, fmt: (v) => (v < 0.02 ? 'off' : fmt(v, 2)) },
];
const PRESET_SHORT: Record<string, string> = { grand: 'grand', upright: 'upright', 'honky-tonk': 'honky-tonk', prepared: 'prepared' };
/** presets offered on the stage; 'honky-tonk' and 'prepared' still exist in the engine
 *  (PRESETS) and come back by adding them here */
const VISIBLE_PRESETS = ['grand', 'upright'];

/** how many of each one lineup may have (a tap on its button adds one, past this it has none; a
 *  section's menu adds more desks, as far as the stage has room: assign.ts fitsStage) */
const MOST: Record<Voice, number> = { flute: 2, oboe: 2, clarinet: 2, bassoon: 2, horn: 4, trumpet: 2, trombone: 3, tuba: 1, timpani: 2, violin: 3, viola: 2, cello: 2, bass: 2, harp: 2, grand: 2, upright: 2 };
const familyOf = (v: Voice) => INSTRUMENT_INFO[VOICE_INFO[v].instrument].family;
/** the picker's groups, as a score orders them after the keys (the harp is written with them): the eye finds
 *  a family, then the instrument */
const GROUPS = ['keys', 'strings', 'woodwinds', 'brass', 'percussion'] as const;
const groupOf = (id: InstrumentId): (typeof GROUPS)[number] => {
  const f = INSTRUMENT_INFO[id].family;
  return f === 'piano' || f === 'plucked' ? 'keys' : f === 'bowed' ? 'strings' : f === 'brass' ? 'brass' : f === 'percussion' ? 'percussion' : 'woodwinds';
};
/** where the picker folds behind one button (a sheet of every instrument, large enough to read and to
 *  touch): a phone either way up, a narrow window */
const COMPACT = '(max-width: 1320px), (max-height: 500px) and (orientation: landscape)';
/** where the stage's own tools (the view, the piano's case) sit in the band under the bar, beside the readout */
const PHONE = '(max-width: 760px)';
/** where the bar has no room for the piano's kind beside the view (a phone either way up, a narrow window):
 *  there it is at the foot of the picker's sheet, under the instruments; everywhere else it is with the
 *  stage's tools in the bar, as on a wide window */
const KIND_IN_SHEET = '(max-width: 900px), (max-height: 500px) and (orientation: landscape)';

/** the top bar's two places for the stage's controls (main.ts): the picker's, and the view's tools' */
export interface BarSlots {
  pick: HTMLElement;
  tools: HTMLElement;
}

export function stageView(kb: KeyboardHandle, knobSlot: HTMLElement, player: MidiPlayer, bar: BarSlots): View {
  let inst: InstrumentId = audio.instrument;
  const family = () => INSTRUMENT_INFO[inst].family;
  /** the action close-up (click or tap a note's strings → that key's action) is the pianos' alone:
   *  the bowed strings and the winds offer no string zoom in 2D or 3D, only orbit and camera zoom;
   *  an ensemble offers none */
  const closeUpOffered = () => family() === 'piano' && !ensemble.active;

  // ---------------------------------------------------------------- picker
  // (the double bass's name under its glyph is "bass", one word as the others are; its full name is its
  // accessible name and tooltip)
  const instBtns = INSTRUMENT_IDS.map((id) => {
    const b = h(
      'button',
      {
        class: 'pick',
        type: 'button',
        'aria-label': INSTRUMENT_INFO[id].label,
        title: INSTRUMENT_INFO[id].blurb,
        'aria-pressed': String(inst === id),
        onclick: () => {
          if (ensemble.active) return addToLineup(id);
          // (one instrument: chosen, the sheet is done)
          setOpen(false);
          void audio.setInstrument(id);
        },
      },
      h('span', { class: 'pick-name' }, (id === 'bass' ? 'bass' : INSTRUMENT_INFO[id].label).toLowerCase()),
      h('span', { class: 'pick-n', 'aria-hidden': 'true' }),
    );
    b.prepend(glyph(id) as unknown as HTMLElement);
    return b;
  });
  // ---------------------------------------------------------------- orchestra mode
  // the ensemble: on, the instrument buttons count instruments into the lineup (a tap adds one, past the
  // most it may have, or with no room for another, it has none), every other seat's routing kept
  // (orchestra/ensemble.ts addVoice). (The pieces, a few public-domain scores that bring their own
  // lineup, are in the player's overlay, with play and open: ui/player.ts.)
  const ensBtn = h('button', { class: 'ens-toggle', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Orchestra: several instruments', 'data-tip': 'orchestra · tap instruments to add them' }, h('span', { class: 'pick-name' }, 'orchestra'));
  ensBtn.prepend(ensembleIcon() as unknown as HTMLElement);
  const pianoVoice = (): Voice => (audio.preset === 'upright' || audio.preset === 'honky-tonk' ? 'upright' : 'grand');
  const voiceOfPick = (id: InstrumentId): Voice => (id === 'piano' ? pianoVoice() : (id as Voice));
  const countOf = (id: InstrumentId, lineup: Voice[]) => lineup.filter((v) => (id === 'piano' ? isKeyboard(v) : v === id)).length;
  /** the seats of a pick's kind (the piano's: both pianos) */
  const seatsOf = (id: InstrumentId, lineup: Voice[]) => lineup.flatMap((v, k) => ((id === 'piano' ? isKeyboard(v) : v === id) ? [k] : []));
  /** what a tap on a pick does now: adds one, or takes them all off (past the most, or no room) */
  const tapAdds = (id: InstrumentId) => countOf(id, ensemble.lineup) < MOST[voiceOfPick(id)] && ensemble.roomFor(voiceOfPick(id));
  const addToLineup = (id: InstrumentId) => {
    if (tapAdds(id)) ensemble.addVoice(voiceOfPick(id));
    // (the last instruments stay: the stage is never empty; a kind it does not have and no room: nothing)
    else ensemble.removeSeats(seatsOf(id, ensemble.lineup));
  };
  // on: the lineup and routing it last had (else the quartet), a file already loaded shared out over
  // it (orchestra/setup.ts)
  ensBtn.addEventListener('click', () => (ensemble.active ? leaveOrchestra(player) : enterOrchestra(player, null)));
  // the routing grid asked for while a file plays on the one instrument shown: the ensemble comes on
  // with that instrument playing every line (more are added in the grid)
  player.onSolo = (song) => {
    const v = voiceOfPick(audio.instrument);
    ensemble.enter(planOf([{ voice: v, lines: song.lines.map((_, i) => i) }], song.lines), song, null, false);
    void ensemble.ensureEngines();
  };
  const shownPresets = PRESET_IDS.filter((id) => VISIBLE_PRESETS.includes(id));
  const presetBtns = shownPresets.map((id) =>
    h(
      'button',
      {
        type: 'button',
        title: PRESETS[id].description,
        'aria-pressed': String(audio.preset === id),
        onclick: async () => {
          if (ensemble.active) {
            // each piano becomes the other kind in its own seat, its lines (the routing) kept
            const v: Voice = id === 'upright' ? 'upright' : 'grand';
            ensemble.lineup.forEach((x, k) => isKeyboard(x) && x !== v && ensemble.partVoice(k, v));
          }
          // (the buttons follow the change: showPreset)
          if (!ensemble.active) setOpen(false);
          await audio.setPreset(id);
          if (audio.piano) syncKnobs(audio.piano.params as unknown as Record<string, number>);
        },
      },
      PRESET_SHORT[id] ?? id,
    ),
  );
  const presets = h('div', { class: 'presets', role: 'group', 'aria-label': 'Piano' }, presetBtns);
  /** the piano's preset changed (its button, or an address walked to) */
  const showPreset = (id: string) => {
    fadeIn();
    presetBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(shownPresets[i] === id)));
    keysFallback = pianoKeySummary(id);
    void audio.presetSettled.then(() => audio.piano && syncKnobs(audio.piano.params as unknown as Record<string, number>));
  };
  // 2D / 3D: only offered where WebGL2 runs (elsewhere the 2D stage simply stays); remembered on the
  // device, or as the address asks (look.ts)
  const has3d = webgl2Available();
  let want3d = has3d && look.want3d;
  const dimBtn = h('button', { class: 'dim-toggle', type: 'button', 'aria-pressed': String(want3d), 'aria-label': '3D view', 'data-tip': '3D · drag to turn, pinch to zoom' }, '3d');
  // the view is one choice of three, side by side: as drawn, in vector lines, in 3D (the last two each still
  // turn off where they are pressed again: back to the drawing)
  const flatBtn = h('button', { class: 'view-2d', type: 'button', 'aria-pressed': 'false', 'aria-label': '2D view', 'data-tip': '2D · the drawing' }, '2d');
  dimBtn.hidden = !has3d;
  // the vector display: the 2D stage's other style (ui/vector/kit.ts). The stage as it was stays the
  // default; the choice is remembered, and ?view=vector (or =2d; the old ?style=vector) in the address
  // sets it. It is the middle of the view's three (2d · vector · 3d).
  let wantVector = look.wantVector;
  const vecBtn = h('button', { class: 'vec-toggle', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Vector lines', 'data-tip': 'vector lines' }, 'vector');
  const viewSeg = h('div', { class: 'view-seg', role: 'group', 'aria-label': 'View' }, flatBtn, vecBtn, dimBtn);
  // pianos in 3D: hide the case (the plate, strings, soundboard, keys and the whole action stay);
  // remembered for the session; the I key ("inside") toggles it too (no note or octave key uses I)
  let caseHidden = false;
  try {
    caseHidden = sessionStorage.getItem('piano-model.case') === '0';
  } catch {
    /* storage blocked */
  }
  const caseBtn = h('button', { class: 'case-toggle', type: 'button', 'aria-pressed': String(caseHidden), 'aria-label': 'Hide the case', 'data-tip': 'inside · I' });
  caseBtn.innerHTML = '<svg viewBox="0 0 14 12" width="14" height="12" aria-hidden="true"><path d="M1.5 1.5h11v9h-11z" fill="none" stroke="currentColor" stroke-width="1.1" stroke-dasharray="2 1.6"/><path d="M4.5 3.5v5M7 3.5v5M9.5 3.5v5" stroke="currentColor" stroke-width="1.1"/></svg>';
  caseBtn.hidden = true;
  const setCase = (hide: boolean) => {
    caseHidden = hide;
    caseBtn.setAttribute('aria-pressed', String(hide));
    caseBtn.setAttribute('aria-label', hide ? 'Show the case' : 'Hide the case');
    try {
      sessionStorage.setItem('piano-model.case', hide ? '0' : '1');
    } catch {
      /* storage blocked */
    }
  };
  caseBtn.addEventListener('click', () => setCase(!caseHidden));
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyI' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || caseBtn.hidden) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault();
    setCase(!caseHidden);
  });
  // the picker: the instruments by family. Where there is no room for all of them at a size to read and
  // touch (COMPACT), one button names what is on the stage and opens them as a sheet
  const fams = GROUPS.map((g) => h('div', { class: 'fam', 'data-fam': g }, instBtns.filter((_, i) => groupOf(INSTRUMENT_IDS[i]) === g)));
  const instruments = h('div', { class: 'instruments', role: 'group', 'aria-label': 'Instrument' }, fams);
  const pop = h('div', { class: 'picker-pop', id: 'picker-pop' }, instruments);
  const openName = h('span', { class: 'po-name' });
  const openBtn = h('button', { class: 'pick-open', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'picker-pop', 'aria-label': 'Instruments' }, openName, h('span', { class: 'po-chev', 'aria-hidden': 'true' }));
  const picker = h('div', { class: 'picker' }, openBtn, pop, ensBtn);
  const setOpen = (on: boolean) => {
    if (on === picker.hasAttribute('data-open')) return;
    picker.toggleAttribute('data-open', on);
    document.documentElement.toggleAttribute('data-picker', on);
    openBtn.setAttribute('aria-expanded', String(on));
  };
  openBtn.addEventListener('click', () => setOpen(!picker.hasAttribute('data-open')));
  // (shut by a touch anywhere else, and by Esc)
  const shutOutside = (e: Event) => {
    if (picker.hasAttribute('data-open') && !picker.contains(e.target as Node)) setOpen(false);
  };
  const shutEsc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !picker.hasAttribute('data-open')) return;
    setOpen(false);
    openBtn.focus();
  };
  /** the button says what is on the stage: the instrument, or how many play */
  const showOpen = () => {
    const on = ensemble.active;
    const n = ensemble.lineup.length;
    openBtn.querySelector('svg')?.remove();
    // (an orchestra's own sign is the button beside this one)
    if (!on) openBtn.prepend(glyph(inst) as unknown as HTMLElement);
    openBtn.toggleAttribute('data-count', on);
    openName.textContent = on ? `${n} ${n === 1 ? 'player' : 'players'}` : (inst === 'bass' ? 'bass' : INSTRUMENT_INFO[inst].label).toLowerCase();
    openBtn.setAttribute('aria-label', on ? `Instruments: ${n} in the orchestra` : `Instrument: ${INSTRUMENT_INFO[inst].label}`);
  };
  // the stage's own tools: which piano, its case, the view
  const tools = h('div', { class: 'stage-tools' }, caseBtn, viewSeg);

  // ---------------------------------------------------------------- readout, spectrum, scope
  // the readout says what is sounding, all of it (ui/readout.ts): a note and its frequency; a few notes by
  // name with the chord they make; many, counted; an ensemble's parts. Let go, it keeps what was last
  // heard, dimmed
  const noteEl = h('div', { class: 'r-note' }, '');
  const hzEl = h('div', { class: 'r-hz' }, '');
  const readout = h('div', { class: 'readout', 'aria-live': 'polite', 'data-idle': '' }, noteEl, hzEl);
  /** an ensemble: who is sounding, an instrument at a time (in the scope's place: one hammer's or one bow's
   *  trace says nothing of eighteen players) */
  const partsEl = h('div', { class: 'parts', role: 'group', 'aria-label': 'The parts sounding' });
  const specCv = h('canvas', { class: 'spec', role: 'img', 'aria-label': 'Spectrum of the output, with the predicted partials of the note sounding, or a mark at each note of several' });
  const scopeCv = h('canvas', { class: 'scope-cv', role: 'img', 'aria-label': 'Excitation: hammer force, bow friction or air jet' });
  const scopeCap = h('div', { class: 'scope-cap' });
  const scope = h('div', { class: 'scope' }, scopeCv, scopeCap);
  const top = h('div', { class: 'stage-top' }, readout, h('div', { class: 'spec-wrap' }, specCv), scope, partsEl);
  // where each control sits follows the window: the piano's kind with the view's tools in the bar, or (no
  // room there) at the foot of the picker's sheet; the tools in the bar, or (a phone) in the band beside
  // the readout
  const mqCompact = typeof matchMedia === 'function' ? matchMedia(COMPACT) : null;
  const mqPhone = typeof matchMedia === 'function' ? matchMedia(PHONE) : null;
  const mqKind = typeof matchMedia === 'function' ? matchMedia(KIND_IN_SHEET) : null;
  const place = () => {
    if (mqKind?.matches) pop.append(presets);
    else tools.prepend(presets);
    if (mqPhone?.matches) top.insertBefore(tools, readout.nextSibling);
    else bar.tools.append(tools);
    if (!mqCompact?.matches) setOpen(false);
  };
  const canvas = h('canvas', { class: 'stage-cv', role: 'img', 'aria-label': 'The instrument, moving as the simulation computes it' });
  // the room (reverb) and the grand's lid: a knob each on the stage, in 2D and in 3D (ui/stage-knob.ts)
  // (no visible labels: a short tooltip on hover, focus and turning says what each one is)
  /** the room parameter as heard: the hall's reverberation time (mid frequencies) */
  const roomText = (v: number) => `reverb · ${(0.7 + 1.7 * v).toFixed(1)} s`;
  const lidText = (v: number) => (v < 0.02 ? 'lid · closed' : `lid · ${Math.round(v * 100)} % open`);
  /** the 3D grand's lid rests: shut, on the short stick, on the long stick (ui/lid.ts); the 2D lid,
   *  drawn from above without sticks, takes any opening */
  const lid3 = () => (want3d && s3 ? s3 : null);
  const knobRoom = stageKnob({ name: 'room', label: 'Reverb: room size and decay time', text: roomText, get: () => roomVal(), set: (v) => setRoom(v), notches: () => null });
  const knobLid = stageKnob({ name: 'lid', label: 'Piano lid: how far open', text: lidText, get: () => lidVal(), set: (v) => setLid(v), notches: () => (lid3() ? LID_RESTS : null) });
  /** the knobs' half size (px): 18, or 22 for a finger (styles.css `.stage-knob`) */
  const mqCoarse = typeof matchMedia === 'function' ? matchMedia('(pointer: coarse)') : null;
  // in 3D, a key's action close up: back to the whole piano (also Esc, a click off the keys, a double-click)
  const zoomBack = h('button', { class: 'zoom-back', type: 'button', 'aria-label': 'Back to the whole piano', 'data-tip': 'whole piano · Esc' });
  zoomBack.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  zoomBack.hidden = true;
  zoomBack.addEventListener('click', () => s3?.zoomOut());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && s3 && want3d && s3.zoomed !== null) s3.zoomOut();
  });
  const el = h('div', { class: 'view stage' }, canvas, top, knobRoom.el, knobLid.el, zoomBack);
  /** the bow in the hand, on the 2D and the 3D stage (ui/hand-bow.ts) */
  const hands: HandBow[] = [];
  window.addEventListener('blur', () => hands.forEach((hb) => hb.drop()));
  let s3: Stage3D | null = null;
  // three.js and the 3D stage load on first use (a separate chunk)
  let loading3d: Promise<void> | null = null;
  const wire3d = (s: Stage3D) => {
    // in 3D, a click or a long press (not a drag) on a key's strings or its key top flies the camera to
    // that key's action; a click off the keys flies back out
    const cv3 = s.el;
    // the bowed strings: a pointer that lands on the bow takes it in the hand; anywhere else still
    // turns the instrument
    const hand = createHandBow(
      cv3,
      () => {
        const l = family() === 'bowed' && bowedGeom && !ensemble.active ? s.bowLine() : null;
        if (!l) return null;
        const r = cv3.getBoundingClientRect();
        return { fx: l.fx + r.left, fy: l.fy + r.top, tx: l.tx + r.left, ty: l.ty + r.top, pos: l.pos, hair: bowedGeom!.bowLength };
      },
      (e) => (e.pointerType === 'mouse' ? 14 : 30),
    );
    // the grand's lid, taken in the hand on the picture: it follows the hand, and let go it comes onto
    // its nearest rest (shut, the short stick, the long stick: ui/lid.ts), swinging there (lidPicture)
    let lidHand: number | null = null;
    const takeLid = (e: PointerEvent) => {
      // (a second finger while one holds the lid: it neither turns the stage nor takes the lid again)
      if (lidHand !== null) return true;
      if (e.button > 0 || ensemble.active) return false;
      const r = cv3.getBoundingClientRect();
      if (!s.takeLid(e.clientX - r.left, e.clientY - r.top)) return false;
      cv3.setPointerCapture(e.pointerId);
      lidHand = e.pointerId;
      cv3.style.cursor = 'grabbing';
      return true;
    };
    const letGoLid = (e: PointerEvent) => {
      if (lidHand === null || e.pointerId !== lidHand) return;
      lidHand = null;
      s.dropLid();
      setLid(lidNotch(lidVal()));
      cv3.style.cursor = '';
    };
    s.grab = (e) => hand.down(e) || takeLid(e);
    cv3.addEventListener('pointerup', letGoLid);
    cv3.addEventListener('pointercancel', letGoLid);
    cv3.addEventListener('lostpointercapture', letGoLid);
    hands.push(hand);
    let at3: { x: number; y: number } | null = null;
    cv3.addEventListener('pointerdown', (e) => {
      at3 = { x: e.clientX, y: e.clientY };
    });
    cv3.addEventListener('pointerup', (e) => {
      if (!at3 || !s3 || Math.hypot(e.clientX - at3.x, e.clientY - at3.y) > 6) return;
      at3 = null;
      const r = cv3.getBoundingClientRect();
      // an ensemble: a tap on an instrument opens its section's menu there (ui/player.ts)
      if (ensemble.active) {
        const k = s3.seatAt(e.clientX - r.left, e.clientY - r.top);
        if (k !== null && k < ensemble.parts.length) player.tapSeat(k, e.clientX, e.clientY);
        return;
      }
      if (!closeUpOffered()) return;
      const m = s3.pick(e.clientX - r.left, e.clientY - r.top);
      if (m !== null) s3.zoomTo(m);
      else if (s3.zoomed !== null) s3.zoomOut();
    });
    cv3.addEventListener('pointermove', (e) => {
      if (!s3) return;
      const r = cv3.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (lidHand !== null && e.pointerId === lidHand) {
        const v = s3.dragLid(x, y);
        if (v !== null) setLid(v);
        return;
      }
      if (e.buttons) return;
      // over the grand's lid: it can be taken
      if (e.pointerType === 'mouse' && !ensemble.active && s3.lidAt(x, y)) {
        cv3.style.cursor = 'grab';
        return;
      }
      if (ensemble.active) {
        // over an instrument: a tap opens its menu (elsewhere the stage turns)
        cv3.style.cursor = s3.seatAt(x, y) !== null ? 'pointer' : '';
        return;
      }
      if (!closeUpOffered()) {
        // over the bow: it can be taken (elsewhere the stage turns)
        cv3.style.cursor = hand.over(e) ? 'pointer' : '';
        return;
      }
      cv3.style.cursor = s3.pick(x, y) !== null ? 'zoom-in' : s3.zoomed !== null ? 'zoom-out' : '';
    });
  };
  /** 2D or 3D (`remember`: the device keeps the choice; not when the address asked for it) */
  const set3d = (on: boolean, remember = true) => {
    want3d = on && has3d;
    dimBtn.setAttribute('aria-pressed', String(want3d));
    if (remember)
      try {
        localStorage.setItem('piano-model.3d', want3d ? '1' : '0');
      } catch {
        /* storage blocked */
      }
    if (want3d && !s3 && !loading3d) {
      loading3d = import('../ui/gl/stage3d.ts')
        .then(({ createStage3D }) => {
          s3 = createStage3D(el);
          if (!s3) {
            // WebGL2 said yes and then failed: stay in 2D
            want3d = false;
            dimBtn.hidden = true;
            dimBtn.setAttribute('aria-pressed', 'false');
            el.classList.remove('is-3d');
          } else wire3d(s3);
          show3d();
        })
        .catch(() => {
          want3d = false;
          dimBtn.hidden = true;
          el.classList.remove('is-3d');
        });
    }
    show3d();
  };
  /** the vector display shows on the 2D stage only: in 3D the stage and its chrome are as they were */
  const vectorOn = () => wantVector && !want3d;
  const showStyle = () => {
    const on = vectorOn();
    vecBtn.setAttribute('aria-pressed', String(on));
    flatBtn.setAttribute('aria-pressed', String(!on && !want3d));
    // (the address follows: nav.ts)
    look.shows(want3d, wantVector);
    if (on) {
      document.documentElement.dataset.style = 'vector';
      loadVectorFont();
    } else delete document.documentElement.dataset.style;
    // (the page's ground follows: the body keeps its own copy for the overscroll colour)
    document.body.style.setProperty('--ground', cssVar('--ground'));
  };
  const setVector = (on: boolean) => {
    wantVector = on;
    try {
      localStorage.setItem('piano-model.style', wantVector ? 'vector' : 'classic');
    } catch {
      /* storage blocked */
    }
    // asked for from the 3D stage: back to 2D, where it shows
    if (wantVector && want3d) set3d(false);
    showStyle();
    fadeIn();
  };
  vecBtn.addEventListener('click', () => setVector(!vectorOn()));
  flatBtn.addEventListener('click', () => {
    if (want3d) set3d(false);
    setVector(false);
  });
  const show3d = () => {
    caseBtn.hidden = !(want3d && family() === 'piano') || ensemble.active;
    if (s3) s3.el.hidden = !want3d;
    el.classList.toggle('is-3d', want3d && !!s3);
    showStyle();
    (window as unknown as { __stage3d?: Stage3D | null }).__stage3d = want3d ? s3 : null;
  };
  dimBtn.addEventListener('click', () => {
    set3d(!want3d);
    fadeIn();
  });
  // click a note's strings on the piano: that key's action, close up
  let action: { close: () => void } | null = null;
  let downAt: { x: number; y: number } | null = null;
  // the bowed strings in 2D: a drag anywhere on the stage moves the bow along its own line
  const hand2dLine = () => {
    const l = family() === 'bowed' && bowedGeom && !(want3d && s3) && !ensemble.active ? bowedState.bowLine : null;
    if (!l) return null;
    const r = canvas.getBoundingClientRect();
    const y0 = r.top + top.getBoundingClientRect().height;
    return { fx: l.fx + r.left, fy: l.fy + y0, tx: l.tx + r.left, ty: l.ty + y0, pos: l.pos, hair: bowedGeom!.bowLength };
  };
  const hand2d = createHandBow(canvas, hand2dLine, () => Infinity);
  hands.push(hand2d);
  // tests: where the 2D stage last drew the hair (client px) and the contact point along it
  (window as unknown as { __bow2d?: () => unknown }).__bow2d = () => hand2dLine();
  // tests: where the 2D stage last drew the bowed instrument and the box its bow sweeps at the far ends
  // of its travel (client px), and the stage it was drawn in
  (window as unknown as { __bowed2d?: () => unknown }).__bowed2d = () => {
    const d = family() === 'bowed' && bowedGeom && !(want3d && s3) && !ensemble.active ? bowedState.drawn : null;
    if (!d) return null;
    const r = canvas.getBoundingClientRect();
    const y0 = r.top + top.getBoundingClientRect().height;
    const at = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: r.left + b.x0, x1: r.left + b.x1, y0: y0 + b.y0, y1: y0 + b.y1 });
    return { id: bowedGeom!.id, body: at(d.body), bow: at(d.bow), stage: { x0: r.left, x1: r.right, y0, y1: r.bottom } };
  };
  // tests: where the 2D stage last drew the oboe (client px: reed tip to bell rim and its keys' reach, the
  // reed's tip, the keywork), and the stage it was drawn in
  (window as unknown as { __oboe2d?: () => unknown }).__oboe2d = () => {
    const d = family() === 'reed' && inst === 'oboe' && !(want3d && s3) && !ensemble.active ? oboeState.drawn : null;
    if (!d) return null;
    const r = canvas.getBoundingClientRect();
    const y0 = r.top + top.getBoundingClientRect().height;
    const at = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: r.left + b.x0, x1: r.left + b.x1, y0: y0 + b.y0, y1: y0 + b.y1 });
    return { body: at(d.body), keys: at(d.keys), reed: { x: r.left + d.reed.x, y: y0 + d.reed.y }, vertical: d.vertical, fingers: d.fingers, stage: { x0: r.left, x1: r.right, y0, y1: r.bottom } };
  };
  // tests: where the 2D stage last drew the clarinet (client px: reed tip to bell rim and its keys' reach,
  // the reed's tip, the keywork, the mouthpiece), and the stage it was drawn in
  (window as unknown as { __clarinet2d?: () => unknown }).__clarinet2d = () => {
    const d = family() === 'reed' && inst === 'clarinet' && !(want3d && s3) && !ensemble.active ? clarinetState.drawn : null;
    if (!d) return null;
    const r = canvas.getBoundingClientRect();
    const y0 = r.top + top.getBoundingClientRect().height;
    const at = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: r.left + b.x0, x1: r.left + b.x1, y0: y0 + b.y0, y1: y0 + b.y1 });
    return { body: at(d.body), keys: at(d.keys), mouth: at(d.mouth), reed: { x: r.left + d.reed.x, y: y0 + d.reed.y }, vertical: d.vertical, fingers: d.fingers, stage: { x0: r.left, x1: r.right, y0, y1: r.bottom } };
  };
  // tests: where the 2D stage last drew the bassoon (client px: boot to bell and its reach across, the
  // reed's tip, the reed and bocal, the keywork), and the stage it was drawn in
  (window as unknown as { __bassoon2d?: () => unknown }).__bassoon2d = () => {
    const d = family() === 'reed' && inst === 'bassoon' && !(want3d && s3) && !ensemble.active ? bassoonState.drawn : null;
    if (!d) return null;
    const r = canvas.getBoundingClientRect();
    const y0 = r.top + top.getBoundingClientRect().height;
    const at = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: r.left + b.x0, x1: r.left + b.x1, y0: y0 + b.y0, y1: y0 + b.y1 });
    return { body: at(d.body), keys: at(d.keys), reedBox: at(d.reedBox), reed: { x: r.left + d.reed.x, y: y0 + d.reed.y }, vertical: d.vertical, fingers: d.fingers, stage: { x0: r.left, x1: r.right, y0, y1: r.bottom } };
  };
  // tests: the 2D piano as last drawn (client px): each key's strings in view (pin end x0,y0 to bridge end
  // x1,y1), the case, and the stage it was drawn in
  (window as unknown as { __piano2d?: () => unknown }).__piano2d = () => {
    if (inst !== 'piano' || (want3d && s3) || ensemble.active || !pianoState.hits.length) return null;
    const r = canvas.getBoundingClientRect();
    const y0 = r.top + top.getBoundingClientRect().height;
    const b = pianoState.caseBox;
    return { upright: pianoState.upright, strings: pianoState.hits.map((q) => ({ midi: q.midi, x0: r.left + q.x0, y0: y0 + q.y0, x1: r.left + q.x1, y1: y0 + q.y1 })), box: { x0: r.left + b.x0, x1: r.left + b.x1, y0: y0 + b.y0, y1: y0 + b.y1 }, stage: { x0: r.left, x1: r.right, y0, y1: r.bottom } };
  };
  // tests: where the 2D stage last drew the horn (client px: bell rim to levers and mouthpiece to the
  // bell's sweep, the valves and levers, the mouthpiece and lips, the bell's mouth; the levers held: bit 0
  // the thumb's change valve, bits 1–3 valves 1–3), and the stage it was drawn in
  (window as unknown as { __horn2d?: () => unknown }).__horn2d = () => {
    const d = inst === 'horn' && !(want3d && s3) && !ensemble.active ? hornState.drawn : null;
    if (!d) return null;
    const r = canvas.getBoundingClientRect();
    const y0 = r.top + top.getBoundingClientRect().height;
    const at = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: r.left + b.x0, x1: r.left + b.x1, y0: y0 + b.y0, y1: y0 + b.y1 });
    return { body: at(d.body), valves: at(d.valves), mouth: at(d.mouth), bell: at(d.bell), levers: d.levers, side: d.side, stage: { x0: r.left, x1: r.right, y0, y1: r.bottom } };
  };
  // tests: where the 2D stage last drew the harp (client px: the whole instrument, the strings' band, the
  // pedals' row; how many strings swing, the widest's index and swing; each pedal's foot; the notches)
  (window as unknown as { __harp2d?: () => unknown }).__harp2d = () => {
    const d = inst === 'harp' && !(want3d && s3) && !ensemble.active ? harpState.drawn : null;
    if (!d) return null;
    const r = canvas.getBoundingClientRect();
    const y0 = r.top + top.getBoundingClientRect().height;
    const at = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: r.left + b.x0, x1: r.left + b.x1, y0: y0 + b.y0, y1: y0 + b.y1 });
    return { ...d, body: at(d.body), strings: at(d.strings), pedals: at(d.pedals), pedalY: d.pedalY.map((y) => y0 + y), stage: { x0: r.left, x1: r.right, y0, y1: r.bottom } };
  };
  // tests: where the 2D stage last drew the tuba (client px: the whole instrument, the valves from their
  // casings' feet to the buttons, the mouthpiece, the bell's mouth; the valves held: bit k, valve k + 1; each
  // button's height), and the stage it was drawn in
  (window as unknown as { __tuba2d?: () => unknown }).__tuba2d = () => {
    const d = inst === 'tuba' && !(want3d && s3) && !ensemble.active ? tubaState.drawn : null;
    if (!d) return null;
    const r = canvas.getBoundingClientRect();
    const y0 = r.top + top.getBoundingClientRect().height;
    const at = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: r.left + b.x0, x1: r.left + b.x1, y0: y0 + b.y0, y1: y0 + b.y1 });
    return { body: at(d.body), valves: at(d.valves), mouth: at(d.mouth), bell: at(d.bell), levers: d.levers, buttons: d.buttons.map((y) => y0 + y), stage: { x0: r.left, x1: r.right, y0, y1: r.bottom } };
  };
  // tests: where the 2D stage last drew the trombone (client px: the box its slide moves in, the instrument
  // with its slide as it stands, the outer slide, the mouthpiece and lips, the bell's mouth, the valves and
  // levers; the levers held: bit 0 the F valve, bit 1 the G♭ valve; the slide drawn and the engine's, m;
  // the crook's far end; px per metre; the size, position and side), and the stage it was drawn in
  (window as unknown as { __trombone2d?: () => unknown }).__trombone2d = () => {
    const d = inst === 'trombone' && !(want3d && s3) && !ensemble.active ? tromboneState.drawn : null;
    if (!d) return null;
    const r = canvas.getBoundingClientRect();
    const y0 = r.top + top.getBoundingClientRect().height;
    const at = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: r.left + b.x0, x1: r.left + b.x1, y0: y0 + b.y0, y1: y0 + b.y1 });
    return { ...d, body: at(d.body), inst: at(d.inst), slideBox: at(d.slideBox), mouth: at(d.mouth), bell: at(d.bell), valves: d.valves ? at(d.valves) : null, crookX: r.left + d.crookX, stage: { x0: r.left, x1: r.right, y0, y1: r.bottom } };
  };
  (window as unknown as { __timpani2d?: () => unknown }).__timpani2d = () => {
    const d = inst === 'timpani' && !(want3d && s3) && !ensemble.active ? timpaniState.drawn : null;
    if (!d) return null;
    const r = canvas.getBoundingClientRect();
    const y0 = r.top + top.getBoundingClientRect().height;
    const at = (b: { x0: number; y0: number; x1: number; y1: number }) => ({ x0: r.left + b.x0, x1: r.left + b.x1, y0: y0 + b.y0, y1: y0 + b.y1 });
    return {
      body: at(d.body),
      heads: d.heads.map((hd) => ({ ...hd, x: r.left + hd.x, y: y0 + hd.y })),
      mallets: d.mallets.map((m) => ({ ...m, x: r.left + m.x, y: y0 + m.y })),
      gauges: d.gauges.map((g) => ({ box: at(g.box), at: g.at, x: r.left + g.x, y: y0 + g.y })),
      pedals: d.pedals.map((p) => ({ at: p.at, x: r.left + p.x, y: y0 + p.y })),
      stage: { x0: r.left, x1: r.right, y0, y1: r.bottom },
    };
  };
  canvas.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
    hand2d.down(e);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) return;
    downAt = null;
    // an ensemble: a tap on an instrument opens its section's menu there (ui/player.ts)
    if (ensemble.active) {
      const k = seat2d(e.clientX, e.clientY);
      if (k !== null) player.tapSeat(k, e.clientX, e.clientY);
      return;
    }
    if (!closeUpOffered()) return;
    const r = canvas.getBoundingClientRect();
    const topH = top.getBoundingClientRect().height;
    const m = stringAt(pianoState, e.clientX - r.left, e.clientY - r.top - topH);
    if (m !== null) openAction(m);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!closeUpOffered()) {
      canvas.style.cursor = ensemble.active && !e.buttons && seat2d(e.clientX, e.clientY) !== null ? 'pointer' : '';
      return;
    }
    const r = canvas.getBoundingClientRect();
    const hit = stringAt(pianoState, e.clientX - r.left, e.clientY - r.top - top.getBoundingClientRect().height);
    canvas.style.cursor = hit !== null ? 'zoom-in' : '';
  });
  const openAction = (m: number) => {
    action?.close();
    if (!closeUpOffered()) return;
    const kind = () => (audio.preset === 'upright' || audio.preset === 'honky-tonk' ? 'upright' : 'grand');
    action = openActionView({ midi: m, kind, host: el, latest: () => frame, onClose: () => (action = null) });
  };
  const paramOf = (k: string, d: number) => {
    const v = (audio.piano?.params as Record<string, unknown> | undefined)?.[k];
    return typeof v === 'number' ? v : d;
  };
  const roomVal = () => paramOf('room', 0.3);
  const lidVal = () => paramOf('lid', 1);
  const setRoom = (v: number) => audio.setParams({ room: Math.round(Math.min(1, Math.max(0, v)) * 100) / 100 });
  const setLid = (v: number) => audio.setParams({ lid: Math.round(Math.min(1, Math.max(0, v)) * 100) / 100 });
  /** The 3D lid as drawn: in the hand, where the hand holds it; otherwise it swings onto the engine's
   *  lid when that moves (let go of, onto its nearest rest; its knob clicked to another notch; the
   *  view switched to 3D with the lid between rests), falling as a lid does (ui/lid.ts `lidSettle`). */
  let lidDrawn = 1;
  let lidSwing: { v0: number; to: number; t0: number } | null = null;
  const lidPicture = (now: number, on: boolean): number => {
    const v = lidVal();
    if (!on || s3?.lidHeld) {
      lidSwing = null;
      return (lidDrawn = v);
    }
    if (lidSwing?.to !== v) lidSwing = Math.abs(v - lidDrawn) < 1e-4 ? null : { v0: lidDrawn, to: v, t0: now };
    if (!lidSwing) return (lidDrawn = v);
    const f = lidSettle(lidSwing.v0, v, (now - lidSwing.t0) / 1000);
    if (f.done) lidSwing = null;
    return (lidDrawn = f.v);
  };

  // ---------------------------------------------------------------- knobs
  const knobsFor = (id: InstrumentId) => {
    const f = INSTRUMENT_INFO[id].family;
    return f === 'piano' ? PIANO_KNOBS : f === 'bowed' ? BOWED_KNOBS : f === 'plucked' ? HARP_KNOBS : f === 'percussion' ? TIMPANI_KNOBS : id === 'horn' ? HORN_KNOBS : id === 'tuba' ? TUBA_KNOBS : id === 'trombone' ? TROMBONE_KNOBS : f === 'brass' ? TRUMPET_KNOBS : f === 'reed' ? OBOE_KNOBS : FLUTE_KNOBS;
  };
  let knobEls: { c: KnobSpec; k: ReturnType<typeof knob> }[] = [];
  const currentParams = (): Record<string, number> => ({ ...(inst === 'piano' ? DEFAULT_PARAMS : {}), ...(audio.piano?.params ?? {}) }) as Record<string, number>;
  const buildKnobs = () => {
    const p = currentParams();
    knobEls = knobsFor(inst).map((c) => {
      const v0 = Number.isFinite(p[c.key]) ? p[c.key] : (c.min + c.max) / 2;
      let timer = 0;
      const k = knob(c, v0, (v) => {
        // slow controls redesign the string filters; debounce them
        const slow = c.key === 'stringStiffness' || c.key === 'sustain' || c.key === 'unisonDetune';
        window.clearTimeout(timer);
        if (slow) timer = window.setTimeout(() => audio.setParams({ [c.key]: v }), 140);
        else audio.setParams({ [c.key]: v });
      });
      return { c, k };
    });
    // each knob's slot colour (the vector display draws what the knob moves in it)
    knobEls.forEach((x, i) => x.k.el.style.setProperty('--slot', slotColor(i)));
    const reset = h(
      'button',
      {
        class: 'k-reset',
        type: 'button',
        'data-tip': 'reset knobs',
        'aria-label': 'Reset the knobs',
        onclick: async () => {
          await audio.setInstrument(inst);
          if (inst === 'piano') {
            const d = { ...DEFAULT_PARAMS, ...PRESETS[audio.preset].defaults } as unknown as Record<string, number>;
            const q: Record<string, number> = {};
            for (const x of knobEls) q[x.c.key] = d[x.c.key];
            audio.setParams(q);
          }
          buildKnobs();
        },
      },
      '↺',
    );
    knobSlot.replaceChildren(...knobEls.map((x) => x.k.el), reset);
  };
  const syncKnobs = (p: Record<string, number>) => {
    for (const x of knobEls) x.k.set(p[x.c.key]);
  };

  // ---------------------------------------------------------------- state for drawing
  let frame: VisualFrame | null = null;
  /** the harp's pedal notches as the knobs last showed them (D C B E F G A) */
  let pedalsShown: number[] = [0, 0, 0, 0, 0, 0, 0];
  let strike: VisualFrame['strike'] = null;
  let lastFocus: VisualFrame['focus'] = null;
  let keysFallback: KeySummary[] = pianoKeySummary(audio.preset);
  const pianoState = newPianoState();
  const bowedState: BowedState = { strScale: new AutoScale(2e-6), lvlScale: new AutoScale(1e-6, 0.995) };
  const fluteState = { pScale: new AutoScale(1e-6), jetScale: new AutoScale(1e-9), env: new Float32Array(0) };
  const trumpetState: { pScale: AutoScale; env: Float32Array; src?: { x: number; y: number } } = { pScale: new AutoScale(1e-6), env: new Float32Array(0) };
  const oboeState = newOboeState();
  const clarinetState = newClarinetState();
  const bassoonState = newBassoonState();
  const hornState = newHornState();
  const tromboneState = newTromboneState();
  const tubaState = newTubaState();
  const harpState = newHarpState();
  const timpaniState = newTimpaniState();
  const roomState = newRoomState();
  const tdBuf = new Float32Array(2048);
  const fields = { piano: new ModeField(208, 100, 2.2, 3), bowed: new ModeField(150, 84, 1.8, 0.6) };
  // the same plates on the vector display, traced as lines (made when first shown)
  let vfields: { piano: Contours; bowed: Contours } | null = null;
  let bowedGeom: BowedGeom | null = null;
  const specBuf = new Float32Array(4096);
  const forceScale = new AutoScale(1e-6);

  // ---------------------------------------------------------------- the ensemble's drawing
  let draws: PartDraw[] = [];
  let cells: Cell[] = [];
  let cellsKey = '';
  const syncDraws = () => {
    draws = ensemble.parts.map((p, i) => (draws[i]?.voice === p.voice ? draws[i] : newPartDraw(p.voice)));
    cellsKey = '';
  };
  // tests: the ensemble on the 2D stage, each part's cell (and the group's px/m) and where its bow's
  // hair was last drawn (client px: the frog's end, the tip's end; the contact point along it; the
  // hair's real length, m)
  (window as unknown as { __ens2d?: () => unknown }).__ens2d = () => {
    const r = canvas.getBoundingClientRect();
    const y0 = r.top + top.getBoundingClientRect().height;
    return ensemble.parts.map((p, i) => {
      const c = cells[i];
      const b = draws[i]?.bowed;
      const l = b?.st.bowLine;
      if (!c) return null;
      const [x, y] = [r.left + c.x, y0 + c.y];
      return { voice: p.voice, cell: { x, y, w: c.w, h: c.h, sc: c.sc ?? null }, bow: l && b ? { fx: x + l.fx, fy: y + l.fy, tx: x + l.tx, ty: y + l.ty, pos: l.pos, hair: b.geom.bowLength } : null };
    });
  };
  /** the ensemble's seat drawn under a point on the 2D stage (client px), if any */
  const seat2d = (cx: number, cy: number): number | null => {
    if (!ensemble.active || (want3d && s3)) return null;
    const r = canvas.getBoundingClientRect();
    const x = cx - r.left;
    const y = cy - r.top - top.getBoundingClientRect().height;
    const i = cells.findIndex((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
    return i >= 0 && i < ensemble.parts.length ? i : null;
  };
  // tests and review shots: where seat k's instrument is on the screen (client px), in 2D or 3D
  (window as unknown as { __seatAt?: (k: number) => [number, number] | null }).__seatAt = (k) => {
    if (!ensemble.active) return null;
    if (want3d && s3) {
      const q = s3.seatScreen(k);
      const r = s3.el.getBoundingClientRect();
      return q ? [r.left + q[0], r.top + q[1]] : null;
    }
    const c = cells[k];
    if (!c) return null;
    const r = canvas.getBoundingClientRect();
    return [r.left + c.x + c.w / 2, r.top + top.getBoundingClientRect().height + c.y + c.h / 2];
  };
  // ---------------------------------------------------------------- what is sounding
  /** the ensemble's strip: a cell for each instrument it has (its desks together), in the lineup's order */
  let partCells: { seats: number[]; el: HTMLElement; notes: HTMLElement; key: string }[] = [];
  let partsKey = '';
  const buildParts = () => {
    const lineup = ensemble.active ? ensemble.lineup : [];
    if (lineup.join() === partsKey) return;
    partsKey = lineup.join();
    const kinds = [...new Set(lineup)];
    partCells = kinds.map((v) => {
      const seats = lineup.flatMap((x, k) => (x === v ? [k] : []));
      const notes = h('span', { class: 'part-notes' });
      const name = VOICE_INFO[v].label.toLowerCase();
      const cell = h('div', { class: 'part', 'data-voice': v, 'data-tip': seats.length > 1 ? `${name} ×${seats.length}` : name }, seats.length > 1 ? h('span', { class: 'part-n', 'aria-hidden': 'true' }, `×${seats.length}`) : null, notes);
      cell.prepend(voiceGlyph(v) as unknown as HTMLElement);
      return { seats, el: cell, notes, key: '' };
    });
    partsEl.replaceChildren(...partCells.map((c) => c.el));
    partsEl.dataset.n = String(partCells.length);
  };
  /** the notes sounding now, lowest first; an ensemble's, with how many of its parts sound */
  const heard: number[] = [];
  let heardParts = 0;
  let heardKey = 'none';
  /** each sounding note's frequency, where more than one sounds (the spectrum marks them) */
  let marks: number[] | null = null;
  const gather = (ens: boolean) => {
    heard.length = 0;
    heardParts = 0;
    if (ens) {
      for (const p of ensemble.parts) {
        if (!p.down.size) continue;
        heardParts++;
        for (const m of p.down) if (!heard.includes(m)) heard.push(m);
      }
    } else {
      // (the engine's word where it has given it: a one-voice instrument sounds one of the keys held, a
      // piano's pedal keeps notes whose keys are up)
      for (const m of audio.down.keys()) if (audio.isSounding(m)) heard.push(m);
      if (audio.soundingKnown) for (const m of audio.sounding) if (!heard.includes(m)) heard.push(m);
    }
    heard.sort((a, b) => a - b);
  };
  const hzOf = (ens: boolean) => (m: number) => {
    const eng = ens ? ensemble.parts.find((p) => p.down.has(m))?.engine : audio.piano;
    return eng?.keys.find((k) => k.midi === m)?.f1 ?? etHz(m);
  };
  /** the head line, its accidentals set as signs (the text face has none: a borrowed one sits wide and upright) */
  const setHead = (text: string) => noteEl.replaceChildren(...text.split(/([♭♯])/).map((t) => (t === '♭' || t === '♯' ? h('span', { class: 'acc' }, t) : t)));
  const showHeard = (ens: boolean) => {
    gather(ens);
    const key = heard.length ? `${ens ? `${heardParts}:` : ''}${heard.join()}` : '';
    if (key !== heardKey) {
      heardKey = key;
      const r = summarize(heard, { hz: hzOf(ens), parts: ens ? heardParts : 0 });
      // (nothing sounding: what was last heard stays, dimmed)
      readout.toggleAttribute('data-idle', !r);
      if (r) {
        setHead(r.head);
        hzEl.textContent = r.sub;
        readout.dataset.size = String(r.size);
      }
      marks = heard.length > 1 ? heard.map(hzOf(ens)) : null;
    }
    if (!ens) return;
    for (const c of partCells) {
      let k = '';
      for (const i of c.seats) {
        const d = ensemble.parts[i]?.down;
        if (d?.size) k += `${[...d].join()};`;
      }
      if (k === c.key) continue;
      c.key = k;
      c.el.toggleAttribute('data-on', !!k);
      // (silent, it keeps its last notes' place: the strip does not shift)
      if (k) c.notes.textContent = partNotes(c.seats.flatMap((i) => [...(ensemble.parts[i]?.down ?? [])]));
    }
  };
  /** nothing heard yet (a change of instrument, of ensemble) */
  const clearHeard = () => {
    noteEl.textContent = '';
    hzEl.textContent = '';
    readout.setAttribute('data-idle', '');
    delete readout.dataset.size;
    heardKey = 'none';
    marks = null;
  };
  /** the part that began a note last (alone, the spectrum shows its partials) */
  const leadPart = (): PartLive | null => {
    let best: PartLive | null = null;
    for (const p of ensemble.parts) if (!best || p.lastOn > best.lastOn) best = p;
    return best;
  };
  const ensIn = (): EnsPartIn[] =>
    ensemble.parts.map((p, i) => {
      const d = draws[i];
      const st = d?.piano?.st ?? pianoState;
      if (d?.piano) syncPianoState(st, p);
      return {
        family: familyOf(p.voice),
        reed: p.voice === 'clarinet' || p.voice === 'bassoon' ? p.voice : 'oboe',
        brass: p.voice === 'horn' ? 'horn' : p.voice === 'trombone' ? 'trombone' : p.voice === 'tuba' ? 'tuba' : 'trumpet',
        tromboneSize: p.voice === 'trombone' ? (p.size ?? 'tenor') : undefined,
        kind: p.voice === 'upright' ? 'upright' : 'grand',
        fr: p.frame,
        keys: isKeyboard(p.voice) ? ensemble.keysOf(p) : [],
        piano: st,
        bowed: d?.bowed?.geom ?? null,
        down: (m: number) => p.down.has(m),
      };
    });
  /** the stage as the ensemble changes: the picker counts its instruments, the single instrument's own
   *  controls (knobs, close-up, case, lid) step aside */
  const applyEnsemble = () => {
    const on = ensemble.active;
    const lineup = ensemble.lineup;
    ensBtn.setAttribute('aria-pressed', String(on));
    // (many voices change faster than they can be read out: the readout speaks for one instrument only)
    readout.setAttribute('aria-live', on ? 'off' : 'polite');
    if (on !== el.hasAttribute('data-ensemble')) clearHeard();
    buildParts();
    showOpen();
    el.toggleAttribute('data-ensemble', on);
    document.documentElement.toggleAttribute('data-ensemble', on);
    instBtns.forEach((b, i) => {
      const id = INSTRUMENT_IDS[i];
      const n = on ? countOf(id, lineup) : 0;
      b.setAttribute('aria-pressed', String(on ? n > 0 : inst === id));
      (b.querySelector('.pick-n') as HTMLElement).textContent = n > 1 ? `×${n}` : '';
      const name = INSTRUMENT_INFO[id].label.toLowerCase();
      // (what a tap will do: another, or (past the most, or no room) none; a kind there is no room for)
      const adds = on && tapAdds(id);
      b.dataset.tip = on ? (n ? `${name} ×${n} · ${adds ? 'tap for another' : n > 1 ? 'tap to take them off' : 'tap to take it off'}` : adds ? `add ${/^[aeiou]/.test(name) ? 'an' : 'a'} ${name}` : `${name} · the stage is full`) : '';
      if (!on) delete b.dataset.tip;
    });
    presets.hidden = on ? !lineup.some(isKeyboard) : inst !== 'piano';
    caseBtn.hidden = on || !(want3d && family() === 'piano');
    if (on) {
      action?.close();
      for (const hb of hands) hb.drop();
      canvas.style.cursor = '';
      if (s3) s3.el.style.cursor = '';
    }
    syncDraws();
    fadeIn();
  };

  // a change of instrument, preset or view fades the stage in (a short ease-out, none with reduced motion)
  const reduceMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const fadeIn = () => {
    if (reduceMotion?.matches) return;
    for (const c of [canvas, s3?.el]) c?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
  };
  const applyInstrument = (id: InstrumentId) => {
    for (const hb of hands) hb.drop();
    inst = id;
    fadeIn();
    instBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(INSTRUMENT_IDS[i] === id)));
    presets.hidden = id !== 'piano';
    caseBtn.hidden = !(want3d && INSTRUMENT_INFO[id].family === 'piano');
    el.dataset.family = INSTRUMENT_INFO[id].family;
    bowedGeom = INSTRUMENT_INFO[id].family === 'bowed' ? { id: id as BowedGeom['id'], ...bowedGeometry(id as BowedGeom['id']) } : null;
    frame = null;
    strike = null;
    lastFocus = null;
    // no close-up state survives a change of instrument: the panel shuts, the zoom cursor goes
    action?.close();
    canvas.style.cursor = '';
    if (s3) s3.el.style.cursor = '';
    clearHeard();
    showOpen();
    buildKnobs();
    if (ensemble.active) applyEnsemble();
  };

  // ---------------------------------------------------------------- drawing
  const drawScope = (frame: VisualFrame | null, fam: string, strike: VisualFrame['strike'], bowedGeom: BowedGeom | null) => {
    const family = () => fam;
    // (the vector display: the excitation is sound, amber; its second trace the structure's blue)
    const INK = vectorOn() ? SCOPE_INK_V : STAGE_INK;
    const { ctx, w, h: hh } = fitCanvas(scopeCv);
    ctx.clearRect(0, 0, w, hh);
    const mid = hh / 2;
    ctx.strokeStyle = rgba(INK.ivory, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, mid);
    ctx.lineTo(w, mid);
    ctx.stroke();
    if (family() === 'piano') {
      const s = strike;
      if (!s || s.force.length < 2) {
        scopeCap.textContent = '';
        return;
      }
      const n = s.force.length;
      const tMax = Math.max(0.002, Math.min(0.012, (n / s.fs) * 1.15));
      const fMax = s.peak * 1.1 || 1;
      const X = (t: number) => (w * 0.66 * t) / tMax;
      const Y = (f: number) => hh - 4 - ((hh - 10) * f) / fMax;
      ctx.fillStyle = rgba(INK.vermilion, 0.18);
      ctx.strokeStyle = rgba(INK.vermilion, 0.95);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      for (let i = 0; i < n; i++) ctx.lineTo(X(i / s.fs), Y(s.force[i]));
      ctx.lineTo(X((n - 1) / s.fs), Y(0));
      ctx.fill();
      ctx.stroke();
      // felt hysteresis: force against compression
      let xm = 0;
      for (let i = 0; i < n; i++) xm = Math.max(xm, s.compression[i]);
      const ix = w * 0.72;
      const iw = w - ix - 2;
      ctx.strokeStyle = rgba(INK.ivory, 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      let on = false;
      for (let i = 0; i < n; i++) {
        if (s.force[i] <= 0 && !on) continue;
        const x = ix + (iw * s.compression[i]) / (xm || 1);
        const y = Y(s.force[i]);
        if (on) ctx.lineTo(x, y);
        else {
          ctx.moveTo(x, y);
          on = true;
        }
      }
      ctx.stroke();
      scopeCap.textContent = `${noteName(s.midi)} · ${fmt(s.vHammer, 2)} m/s · ${fmt(s.peak, 1)} N · ${fmt(s.duration * 1000, 1)} ms`;
      return;
    }
    const e = frame?.excite;
    if (!e || e.trace.length < 2) {
      scopeCap.textContent = '';
      return;
    }
    const rows: [Float32Array, string][] = [[e.trace, INK.vermilion]];
    if (e.trace2) rows.push([e.trace2, INK.ivory]);
    const rh = hh / rows.length;
    rows.forEach(([tr, col], r) => {
      let mx = 0;
      for (let i = 0; i < tr.length; i++) mx = Math.max(mx, Math.abs(tr[i]));
      const sc = r === 0 ? forceScale.of(mx) : mx || 1;
      const y0 = r * rh + rh / 2;
      ctx.strokeStyle = rgba(col, 0.9);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let i = 0; i < tr.length; i++) {
        const x = (w * i) / (tr.length - 1);
        const y = y0 - (tr[i] / sc) * (rh / 2 - 3);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    });
    const b = frame?.bow;
    if (family() === 'bowed' && b && bowedGeom) {
      const si = frame?.strings?.findIndex((s) => s.bowing) ?? -1;
      const name = si >= 0 ? bowedGeom.strings[si].name : (/^(\S+) string/.exec(e.meta)?.[1] ?? '');
      scopeCap.textContent = `${name} string · ${b.changing ? 'bow change' : b.dir > 0 ? 'down-bow' : 'up-bow'} · ${Math.round(100 * b.pos)} % from the frog`;
    } else scopeCap.textContent = family() === 'wind' ? 'jet' : family() === 'brass' ? `lips · ${e.meta}` : family() === 'reed' ? `reed · ${e.meta}` : family() === 'percussion' ? `mallet · ${e.meta}` : family() === 'plucked' ? `string · ${e.meta}` : '';
  };

  /** how far down from the instrument area's top the file player's row lies over it (px): a narrow
   *  3D stage frames its instrument clear of it */
  const overTop = () => (player.el.hidden ? 0 : Math.max(0, (player.el.firstElementChild ?? player.el).getBoundingClientRect().bottom - top.getBoundingClientRect().bottom));
  /** and how far down the lines of an ensemble's file reach, under that row (one row of them, or two
   *  where a long score's wrap on a phone): the 3D stage keeps an orchestra's back row out from under
   *  them. The row's own reach when no lines show. */
  const overLines = () => {
    const lines = player.el.hidden ? null : player.el.querySelector<HTMLElement>('.pl-lines:not([hidden])');
    return lines ? Math.max(0, lines.getBoundingClientRect().bottom - top.getBoundingClientRect().bottom) : overTop();
  };
  let raf = 0;
  const loop = (now: number) => {
    const { ctx, w, h: hh } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, hh);
    const topH = top.getBoundingClientRect().height;
    const ih = hh - topH;
    const focus = frame?.focus ?? lastFocus;
    if (frame?.focus) lastFocus = frame.focus;
    ctx.save();
    ctx.translate(0, topH);
    const in3d = want3d && !!s3;
    const vec = vectorOn();
    if (vec) vfields ??= { piano: new Contours(72, 36, 2.2, 3), bowed: new Contours(64, 36, 1.8, 0.6) };
    const ens = ensemble.active && ensemble.parts.length > 0;
    if (ens && draws.length !== ensemble.parts.length) syncDraws();
    if (in3d) {
      // the 3D stage draws the instrument and the room; the 2D canvas keeps only the top band
    } else if (ens) {
      // (under the file player when it shows: it sits at the top middle, over the first row)
      const pl = player.el.hidden ? 0 : Math.max(0, Math.round(player.el.getBoundingClientRect().bottom - top.getBoundingClientRect().bottom));
      const key = `${ensemble.lineup.join()}|${w}|${ih}|${pl}`;
      if (key !== cellsKey) {
        cellsKey = key;
        cells = ensembleCells(ensemble.lineup, w, ih - pl).map((c) => ({ ...c, y: c.y + pl }));
      }
      drawEnsemble(ctx, cells, ensemble.parts, draws, (p) => ensemble.keysOf(p), now, vec);
    } else if (family() === 'piano') {
      const sr = canvas.getBoundingClientRect();
      // the strings stand over their keys; with no keys on the screen (keys=0, ui=0) over where all 88
      // would lie across the stage, the case whole between its sides
      const kr = look.keysShown ? kb.strip.getBoundingClientRect() : keysAcross({ left: sr.left, width: w });
      pianoState.down = new Set(audio.down.keys());
      pianoState.sustain = audio.lastStats?.sustain ?? audio.sustainValue;
      pianoState.soft = audio.lastStats?.soft ?? audio.softValue;
      pianoState.middle = audio.lastStats?.middle ?? audio.middleValue;
      pianoState.upright = audio.preset === 'upright' || audio.preset === 'honky-tonk';
      const keys = audio.piano && audio.piano.instrument === 'piano' && audio.piano.keys.length ? audio.piano.keys : keysFallback;
      const kind = audio.preset === 'upright' || audio.preset === 'honky-tonk' ? 'upright' : 'grand';
      const pg = { keys, kind, lid: lidVal(), keyX: (m: number) => ({ x: kr.left - sr.left + kb.keyFrac(m).c * kr.width, w: kb.keyFrac(m).w * kr.width }) } as const;
      if (vec) drawPianoV(ctx, w, ih, pg, frame, pianoState, vfields!.piano, now);
      else drawPiano(ctx, w, ih, pg, frame, pianoState, fields.piano, now);
    } else if (family() === 'bowed' && bowedGeom) {
      // (the double bass keeps clear of the file player at the top of the stage, and the others where
      // they stand under it, on a phone: bowedLayout)
      const pl = !player.el.hidden ? Math.max(0, Math.round(player.el.getBoundingClientRect().bottom - top.getBoundingClientRect().bottom)) : 0;
      if (vec) drawBowedV(ctx, w, ih, bowedGeom, frame, bowedState, vfields!.bowed, now, false, undefined, pl);
      else drawBowed(ctx, w, ih, bowedGeom, frame, bowedState, fields.bowed, now, false, undefined, pl);
    } else if (family() === 'brass') {
      // (the horn keeps clear of the file player at the top of the stage, as the reeds do)
      const pl = player.el.hidden ? 0 : Math.max(0, Math.round(player.el.getBoundingClientRect().bottom - top.getBoundingClientRect().bottom));
      if (inst === 'horn') (vec ? drawHornV : drawHorn)(ctx, w, ih, frame, hornState, pl);
      // (the trombone too, its slide's full reach kept on the stage)
      else if (inst === 'trombone') {
        tromboneState.sizeHint = tromboneSizeOf((audio.piano?.params as Record<string, unknown> | undefined)?.size);
        (vec ? drawTromboneV : drawTrombone)(ctx, w, ih, frame, tromboneState, pl);
      }
      // (the tuba too)
      else if (inst === 'tuba') (vec ? drawTubaV : drawTuba)(ctx, w, ih, frame, tubaState, pl);
      else (vec ? drawTrumpetV : drawTrumpet)(ctx, w, ih, frame, trumpetState);
    } else if (family() === 'plucked') {
      // (the harp keeps clear of the file player at the top of the stage)
      (vec ? drawHarpV : drawHarp)(ctx, w, ih, frame, harpState, player.el.hidden ? 0 : Math.max(0, Math.round(player.el.getBoundingClientRect().bottom - top.getBoundingClientRect().bottom)));
    } else if (family() === 'percussion') {
      // (the timpani keep clear of the file player at the top of the stage, as the reeds do)
      (vec ? drawTimpaniV : drawTimpani)(ctx, w, ih, frame, timpaniState, player.el.hidden ? 0 : Math.max(0, Math.round(player.el.getBoundingClientRect().bottom - top.getBoundingClientRect().bottom)));
    }
    else if (family() === 'reed') {
      // (the oboe keeps clear of the file player at the top of the stage, as the bass does)
      const pl = player.el.hidden ? 0 : Math.max(0, Math.round(player.el.getBoundingClientRect().bottom - top.getBoundingClientRect().bottom));
      if (inst === 'clarinet') (vec ? drawClarinetV : drawClarinet)(ctx, w, ih, frame, clarinetState, pl);
      else if (inst === 'bassoon') (vec ? drawBassoonV : drawBassoon)(ctx, w, ih, frame, bassoonState, pl);
      else (vec ? drawOboeV : drawOboe)(ctx, w, ih, frame, oboeState, pl);
    }
    else (vec ? drawFluteV : drawFlute)(ctx, w, ih, frame, fluteState, player.el.hidden ? 0 : Math.max(0, Math.round(player.el.getBoundingClientRect().bottom - top.getBoundingClientRect().bottom)));
    // the room: wavefronts from the instrument, reflections, the lid's throw
    let rms = 0;
    if (audio.analyser) {
      audio.analyser.getFloatTimeDomainData(tdBuf);
      let s2 = 0;
      for (let i = 0; i < tdBuf.length; i++) s2 += tdBuf[i] * tdBuf[i];
      rms = Math.sqrt(s2 / tdBuf.length);
    }
    const fam = family();
    const grand = fam === 'piano' && !(audio.preset === 'upright' || audio.preset === 'honky-tonk') && !ens;
    const src = ens ? { x: w / 2, y: ih / 2 } : fam === 'piano' ? pianoState.src : fam === 'bowed' ? { x: w * 0.62, y: ih / 2 } : fam === 'brass' ? ((inst === 'horn' ? hornState : inst === 'trombone' ? tromboneState : inst === 'tuba' ? tubaState : trumpetState).src ?? { x: w * 0.85, y: ih * 0.55 }) : fam === 'reed' ? ((inst === 'clarinet' ? clarinetState : inst === 'bassoon' ? bassoonState : oboeState).src ?? { x: w * 0.8, y: ih * 0.5 }) : fam === 'percussion' ? (timpaniState.src ?? { x: w * 0.5, y: ih * 0.45 }) : fam === 'plucked' ? (harpState.src ?? { x: w * 0.5, y: ih * 0.5 }) : { x: w * 0.5, y: ih * 0.45 };
    // (an ensemble's cells have no room drawn round them: its outline would cross the instruments)
    if (!in3d && !ens) (vec ? drawRoomV : drawRoom)(ctx, w, ih, roomState, src, roomVal(), rms, now, grand ? { open: lidVal(), dir: -Math.PI / 4 } : null);
    ctx.restore();
    // the display's glow, over everything drawn this frame
    if (vec) glow(ctx);
    // the 3D grand's lid rests on a stick or shut: out of the hand, it is always on one of its rests
    // (the 2D lid at any opening, switched to 3D, comes onto the nearest; so does a preset's)
    const lidOn3d = in3d && grand;
    if (lidOn3d && audio.piano && !s3!.lidHeld && !onNotch(lidVal())) setLid(lidNotch(lidVal()));
    const lidShown = lidPicture(now, lidOn3d);
    if (in3d && s3) {
      pianoState.down = new Set(audio.down.keys());
      pianoState.sustain = audio.lastStats?.sustain ?? audio.sustainValue;
      pianoState.soft = audio.lastStats?.soft ?? audio.softValue;
      pianoState.middle = audio.lastStats?.middle ?? audio.middleValue;
      pianoState.upright = audio.preset === 'upright' || audio.preset === 'honky-tonk';
      const keys = audio.piano && audio.piano.instrument === 'piano' && audio.piano.keys.length ? audio.piano.keys : keysFallback;
      s3.frame(now, topH, {
        fr: frame,
        family: fam,
        reed: inst === 'clarinet' || inst === 'bassoon' ? inst : 'oboe',
        brass: inst === 'horn' ? 'horn' : inst === 'trombone' ? 'trombone' : inst === 'tuba' ? 'tuba' : 'trumpet',
        tromboneSize: inst === 'trombone' ? tromboneSizeOf(audio.piano?.params?.size) : undefined,
        kind: grand ? 'grand' : 'upright',
        keys,
        piano: pianoState,
        bowed: bowedGeom,
        lid: lidShown,
        room: roomVal(),
        rms,
        down: (m) => audio.down.has(m),
        caseHidden,
        ensemble: ens ? ensIn() : null,
      }, overTop(), overLines());
    }
    // the knobs, in 2D and in 3D (not in a key's close-up); in 3D the pool's rim brightens while the
    // room's knob is under the pointer, turned or focused
    const g3 = in3d && !ens && s3!.zoomed === null;
    const kr = knobRoom.el;
    // (in 3D the room's knob is on the floor or not shown: stage3d `roomKnob` gives its place, also
    // through the flight back out of a close-up; never the 2D stage's corner)
    const rk = in3d ? s3!.roomKnob() : null;
    kr.hidden = ens || (in3d && !rk);
    if (in3d) s3!.roomHot = !kr.hidden && (kr.classList.contains('dragging') || document.activeElement === kr || kr.matches(':hover'));
    // the MIDI file player sits at the top middle, just under this band (a fixed overlay)
    const bandY = Math.round(top.getBoundingClientRect().bottom);
    if (bandY !== lastBandY) {
      lastBandY = bandY;
      document.documentElement.style.setProperty('--stage-band-y', `${bandY}px`);
    }
    zoomBack.hidden = !(in3d && s3!.zoomed !== null);
    if (!zoomBack.hidden) zoomBack.style.top = `${topH + 12}px`;
    // place the knobs (stage coordinates: the instrument area starts below the top band), each by what
    // it moves and where it does not move while it is turned: the room's in the top right corner, the
    // corner of the room at its largest (every instrument's 2D drawing leaves it clear; in 3D on the
    // floor, where the pool of light at its largest ends: stage3d `roomKnob`); the lid's on the lid by
    // its hinge (in 3D beside the lid on the treble side, under the rim: stage3d `lidKnob`)
    const kh = mqCoarse?.matches ? 22 : 18;
    const rx = Math.max(kh + 10, Math.min(w - kh - 10, rk ? rk[0] : w));
    let ry = rk ? Math.min(ih - kh - 6, Math.max(kh + 6, rk[1])) : kh + 10;
    // (2D: its corner, or under the file player where that reaches the corner: on a phone a piece's
    // controls lay over the knob, and a tap on the knob opened the file picker)
    if (!in3d && !player.el.hidden) {
      const pr = player.el.getBoundingClientRect();
      const sr = canvas.getBoundingClientRect();
      if (pr.width > 0 && pr.right > sr.left + rx - kh - 6 && pr.bottom > sr.top + topH) ry = Math.max(ry, pr.bottom - (sr.top + topH) + kh + 6);
    }
    kr.style.transform = `translate(${Math.round(rx - kh)}px, ${Math.round(topH + ry - kh)}px)`;
    knobRoom.show(roomVal());
    const cb = pianoState.caseBox;
    const le2 = pianoState.lidEdge;
    const le = !grand || ens ? null : in3d ? (g3 && !caseHidden ? s3!.lidKnob() : null) : le2 && ([Math.min(w - kh - 10, Math.max(kh + 10, cb.x0 + 0.12 * (cb.x1 - cb.x0))), le2.y] as [number, number]);
    knobLid.el.hidden = !le;
    if (le) knobLid.el.style.transform = `translate(${Math.round(le[0] - kh)}px, ${Math.round(topH + le[1] - kh)}px)`;
    knobLid.show(lidVal());
    // spectrum hairline
    const sp = fitCanvas(specCv);
    sp.ctx.clearRect(0, 0, sp.w, sp.h);
    showHeard(ens);
    const sink = vec ? (f: string) => (f === 'piano' ? SPECTRUM_INK_V_PIANO : SPECTRUM_INK_V) : () => undefined;
    if (ens) {
      // (one part alone: its note's partials; several: a mark at each note)
      const lead = heard.length === 1 ? leadPart() : null;
      const lfam = lead ? familyOf(lead.voice) : 'ensemble';
      drawSpectrum(sp.ctx, 0, 6, sp.w, sp.h - 8, audio.analyser, specBuf, lead?.frame?.focus ?? null, lfam, sink(lfam), marks);
    } else {
      drawSpectrum(sp.ctx, 0, 6, sp.w, sp.h - 8, audio.analyser, specBuf, focus, family(), sink(family()), marks);
      drawScope(frame, family(), strike, bowedGeom);
    }
    raf = requestAnimationFrame(loop);
  };

  let unsubVis: (() => void) | null = null;
  /** the engine whose frames the stage draws: a retry after a failed start builds another (audio.ts
   *  `restart`), and the stage follows it (it used to stay on the one that was gone: sound, and a
   *  picture that never moved again) */
  let visOf: unknown = null;
  const attach = () => {
    const p = audio.piano;
    if (!p || p === visOf) return;
    unsubVis?.();
    visOf = p;
    syncKnobs(p.params as unknown as Record<string, number>);
    // (an engine's own parameters are known when it is ready: a page opened on an instrument's address
    // showed every knob at its middle until then, and for good)
    void p.ready.then(
      () => audio.piano === p && syncKnobs(p.params as unknown as Record<string, number>),
      () => {},
    );
    unsubVis = p.onVisual((v) => {
      frame = v;
      // the harp's pedals move themselves for a note no string has (engine core/harp.ts): the pedals' knobs
      // follow the engine's notches
      if (v.harp && inst === 'harp') {
        const set = v.harp.set;
        if (set.some((x, k) => x !== pedalsShown[k])) {
          pedalsShown = set.slice();
          for (const x of knobEls) {
            const k = HARP_PEDAL_KEYS.indexOf(x.c.key);
            if (k >= 0) x.k.set(set[k]);
          }
        }
      }
      if (v.strike) strike = v.strike;
    });
  };
  let lastBandY = -1;
  const unsubs: (() => void)[] = [];
  return {
    el,
    dock: true,
    mount() {
      bar.pick.replaceChildren(picker);
      place();
      for (const mq of [mqCompact, mqPhone, mqKind]) {
        mq?.addEventListener('change', place);
        unsubs.push(() => mq?.removeEventListener('change', place));
      }
      document.addEventListener('pointerdown', shutOutside, true);
      window.addEventListener('keydown', shutEsc);
      unsubs.push(() => document.removeEventListener('pointerdown', shutOutside, true), () => window.removeEventListener('keydown', shutEsc));
      attach();
      unsubs.push(audio.state.on(() => attach()));
      unsubs.push(audio.instrumentChanged.on(applyInstrument));
      unsubs.push(ensemble.changed.on(applyEnsemble));
      unsubs.push(
        audio.notes.on((n) => {
          if (!n.on) return;
          pianoState.strikes.set(n.midi, performance.now());
          pianoState.vels.set(n.midi, n.velocity);
        }),
      );
      unsubs.push(audio.presetChanged.on(showPreset));
      applyInstrument(audio.instrument);
      applyEnsemble();
      if (want3d) set3d(true, false);
      showStyle();
      raf = requestAnimationFrame(loop);
    },
    unmount() {
      action?.close();
      delete document.documentElement.dataset.style;
      document.body.style.setProperty('--ground', cssVar('--ground'));
      s3?.dispose();
      s3 = null;
      cancelAnimationFrame(raf);
      unsubVis?.();
      unsubVis = null;
      visOf = null;
      unsubs.forEach((u) => u());
      setOpen(false);
      bar.pick.replaceChildren();
      tools.remove();
      knobSlot.replaceChildren();
    },
  };
}
