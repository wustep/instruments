// The instrument stage: play and look inside in one place. The selected instrument is
// drawn in plan view and moves with the simulation; the controls are knobs on the
// fallboard; there is almost no text.

import { audio } from '../audio.ts';
import { DEFAULT_PARAMS, INSTRUMENT_IDS, INSTRUMENT_INFO, PRESETS, PRESET_IDS, bowedGeometry, midiName, pianoKeySummary, type InstrumentId, type KeySummary, type VisualFrame } from '@piano-model/engine';
import { cssVar, fitCanvas, fmt, h, type View } from '../ui/dom.ts';
import type { KeyboardHandle } from '../ui/keyboard.ts';
import { openActionView } from '../ui/action-view.ts';
import type { Stage3D } from '../ui/gl/stage3d.ts';
import { webgl2Available } from '../ui/gl/webgl2.ts';
import { ensembleIcon, glyph, knob, scoreIcon, voiceGlyph, type KnobSpec } from '../ui/controls.ts';
import { ensemble, QUARTET, stageCap, type PartLive } from '../orchestra/ensemble.ts';
import { isKeyboard, lineupPlan, planOf, VOICE_INFO, type Voice } from '../orchestra/assign.ts';
import { PIECES } from '../orchestra/pieces.ts';
import { drawEnsemble, ensembleCells, newPartDraw, syncPianoState, type Cell, type PartDraw } from '../ui/ensemble-draw.ts';
import type { EnsPartIn } from '../ui/gl/scenes3d.ts';
import type { MidiPlayer } from '../ui/player.ts';
import { AutoScale, INK, ModeField, drawBowed, drawFlute, drawSpectrum, drawTrumpet, rgba, type BowedGeom, type BowedState } from '../ui/stage-draw.ts';
import { drawPiano, newPianoState, stringAt } from '../ui/piano-draw.ts';
import { drawRoom, newRoomState, roomRect } from '../ui/room-draw.ts';
import { createHandBow, type HandBow } from '../ui/hand-bow.ts';

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
const TRUMPET_KNOBS: KnobSpec[] = [
  { key: 'breath', label: 'Breath pressure', short: 'breath', sub: '× nominal blowing pressure', min: 0.4, max: 1.8, step: 0.01, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'lip', label: 'Lip tension', short: 'lips', sub: 'semitones above or below the note; far enough, the next partial speaks', min: -3, max: 3, step: 0.05, fmt: (v) => `${v > 0 ? '+' : ''}${fmt(v, 2)} st` },
  { key: 'vibrato', label: 'Vibrato', short: 'vibrato', sub: 'lip vibrato depth', min: 0, max: 0.02, step: 0.0005, fmt: (v) => fmt(v * 1000, 1) },
];
const PRESET_SHORT: Record<string, string> = { grand: 'grand', upright: 'upright', 'honky-tonk': 'honky-tonk', prepared: 'prepared' };
/** presets offered on the stage; 'honky-tonk' and 'prepared' still exist in the engine
 *  (PRESETS) and come back by adding them here */
const VISIBLE_PRESETS = ['grand', 'upright'];

/** the order instruments take in a lineup picked by hand: score order (winds, brass, strings, piano),
 *  which is also their seats from the audience's left */
const SCORE_ORDER: Voice[] = ['flute', 'trumpet', 'violin', 'viola', 'cello', 'grand', 'upright'];
/** how many of each one lineup may have (a tap on its button adds one, past this it has none; the
 *  routing grid adds more, up to the stage's cap) */
const MOST: Record<Voice, number> = { flute: 2, trumpet: 2, violin: 3, viola: 2, cello: 2, grand: 2, upright: 2 };
const familyOf = (v: Voice) => INSTRUMENT_INFO[VOICE_INFO[v].instrument].family;

export function stageView(kb: KeyboardHandle, knobSlot: HTMLElement, player: MidiPlayer): View {
  let inst: InstrumentId = audio.instrument;
  const family = () => INSTRUMENT_INFO[inst].family;
  /** the action close-up (click or tap a note's strings → that key's action) is the pianos' alone:
   *  the bowed strings and the winds offer no string zoom in 2D or 3D, only orbit and camera zoom;
   *  an ensemble offers none */
  const closeUpOffered = () => family() === 'piano' && !ensemble.active;

  // ---------------------------------------------------------------- picker
  const instBtns = INSTRUMENT_IDS.map((id) => {
    const b = h('button', { class: 'pick', type: 'button', 'aria-label': INSTRUMENT_INFO[id].label, title: INSTRUMENT_INFO[id].blurb, 'aria-pressed': String(inst === id), onclick: () => (ensemble.active ? addToLineup(id) : void audio.setInstrument(id)) }, h('span', { class: 'pick-name' }, INSTRUMENT_INFO[id].label.toLowerCase()), h('span', { class: 'pick-n', 'aria-hidden': 'true' }));
    b.prepend(glyph(id) as unknown as HTMLElement);
    return b;
  });
  // ---------------------------------------------------------------- orchestra mode
  // the ensemble: on, the instrument buttons count instruments into the lineup (a tap adds one, past the
  // most it may have none); the pieces: a few public-domain scores that bring their own lineup
  const ensBtn = h('button', { class: 'ens-toggle', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Ensemble: several instruments', 'data-tip': 'ensemble · tap instruments to add them' });
  ensBtn.append(ensembleIcon());
  const scoreBtn = h('button', { class: 'score-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Pieces for the ensemble', 'data-tip': 'pieces' });
  scoreBtn.append(scoreIcon());
  let lastLineup: Voice[] = QUARTET;
  const pianoVoice = (): Voice => (audio.preset === 'upright' || audio.preset === 'honky-tonk' ? 'upright' : 'grand');
  const voiceOfPick = (id: InstrumentId): Voice => (id === 'piano' ? pianoVoice() : (id as Voice));
  const countOf = (id: InstrumentId, lineup: Voice[]) => lineup.filter((v) => (id === 'piano' ? isKeyboard(v) : v === id)).length;
  const addToLineup = (id: InstrumentId) => {
    const lineup = ensemble.lineup;
    const v = voiceOfPick(id);
    const n = countOf(id, lineup);
    let next: Voice[];
    if (n >= MOST[v] || lineup.length >= stageCap()) next = lineup.filter((x) => (id === 'piano' ? !isKeyboard(x) : x !== id));
    else next = [...lineup, v];
    if (!next.length) return;
    next.sort((a, b) => SCORE_ORDER.indexOf(a) - SCORE_ORDER.indexOf(b));
    lastLineup = next;
    ensemble.setLineup(next);
  };
  ensBtn.addEventListener('click', () => {
    if (ensemble.active) {
      lastLineup = ensemble.lineup;
      ensemble.exit();
      player.ensembleLeft();
    } else {
      // a file already loaded is shared out over the lineup
      const song = player.loaded;
      player.stop();
      ensemble.enter(song ? ensemble.planForLineup(song, lastLineup) : lineupPlan(lastLineup), song, null, true);
      void ensemble.ensureEngines();
    }
  });
  // the routing grid asked for while a file plays on the one instrument shown: the ensemble comes on
  // with that instrument playing every line (more are added in the grid)
  player.onSolo = (song) => {
    const v = voiceOfPick(audio.instrument);
    ensemble.enter(planOf([{ voice: v, lines: song.lines.map((_, i) => i) }], song.lines), song, null, false);
    void ensemble.ensureEngines();
  };
  let scoreMenu: HTMLElement | null = null;
  const closeScore = (refocus = false) => {
    scoreMenu?.remove();
    scoreMenu = null;
    scoreBtn.setAttribute('aria-expanded', 'false');
    if (refocus) scoreBtn.focus();
  };
  scoreBtn.addEventListener('click', () => {
    if (scoreMenu) return closeScore();
    const items = PIECES.map((pc, i) => {
      const b = h('button', { class: 'sm-item', type: 'button', role: 'menuitem', 'data-piece': pc.id }, h('span', { class: 'sm-who' }, pc.composer), h('span', { class: 'sm-what' }, pc.title), h('span', { class: 'sm-lineup', 'aria-hidden': 'true' }, ...pc.parts.map((q) => voiceGlyph(q.voice))));
      b.setAttribute('aria-label', `${pc.composer}, ${pc.title}: ${pc.parts.map((q) => VOICE_INFO[q.voice].label).join(', ')}`);
      b.addEventListener('click', () => {
        closeScore();
        fadeIn();
        void player.loadPiece(i).catch((e) => console.warn('piece:', e));
      });
      return b;
    });
    const credit = h('a', { class: 'sm-credit', href: '#/notes', 'data-route': 'notes' }, 'public domain · Mutopia Project');
    credit.addEventListener('click', () => closeScore());
    scoreMenu = h('div', { class: 'score-menu', role: 'menu', 'aria-label': 'Pieces' }, ...items, credit);
    el.append(scoreMenu);
    const r = scoreBtn.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    scoreMenu.style.left = `${Math.max(8, Math.min(er.width - scoreMenu.offsetWidth - 8, r.left - er.left))}px`;
    scoreMenu.style.top = `${r.bottom - er.top + 6}px`;
    scoreBtn.setAttribute('aria-expanded', 'true');
    (items[0] as HTMLElement | undefined)?.focus();
  });
  document.addEventListener('pointerdown', (e) => {
    if (scoreMenu && !scoreMenu.contains(e.target as Node) && !scoreBtn.contains(e.target as Node)) closeScore();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && scoreMenu) closeScore(true);
  });
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
          await audio.setPreset(id);
          fadeIn();
          presetBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(shownPresets[i] === id)));
          keysFallback = pianoKeySummary(id);
          if (audio.piano) syncKnobs(audio.piano.params as unknown as Record<string, number>);
        },
      },
      PRESET_SHORT[id] ?? id,
    ),
  );
  const presets = h('div', { class: 'presets', role: 'group', 'aria-label': 'Piano' }, presetBtns);
  // 2D / 3D: only offered where WebGL2 runs (elsewhere the 2D stage simply stays)
  const has3d = webgl2Available();
  let want3d = false;
  try {
    want3d = has3d && localStorage.getItem('piano-model.3d') === '1';
  } catch {
    /* storage blocked */
  }
  const dimBtn = h('button', { class: 'dim-toggle', type: 'button', 'aria-pressed': String(want3d), 'aria-label': '3D view', 'data-tip': '3D · drag to turn, pinch to zoom' }, '3d');
  dimBtn.hidden = !has3d;
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
  const picker = h('div', { class: 'picker' }, h('div', { class: 'instruments', role: 'group', 'aria-label': 'Instrument' }, instBtns), h('div', { class: 'picker-row' }, presets, dimBtn, caseBtn, ensBtn, scoreBtn));

  // ---------------------------------------------------------------- readout, spectrum, scope
  const noteEl = h('div', { class: 'r-note' }, '');
  const hzEl = h('div', { class: 'r-hz' }, '');
  const readout = h('div', { class: 'readout', 'aria-live': 'polite' }, noteEl, hzEl);
  const specCv = h('canvas', { class: 'spec', role: 'img', 'aria-label': 'Spectrum of the output, with the predicted partials of the last note' });
  const scopeCv = h('canvas', { class: 'scope-cv', role: 'img', 'aria-label': 'Excitation: hammer force, bow friction or air jet' });
  const scopeCap = h('div', { class: 'scope-cap' });
  const scope = h('div', { class: 'scope' }, scopeCv, scopeCap);
  const top = h('div', { class: 'stage-top' }, picker, readout, h('div', { class: 'spec-wrap' }, specCv), scope);
  const canvas = h('canvas', { class: 'stage-cv', role: 'img', 'aria-label': 'The instrument, moving as the simulation computes it' });
  // direct manipulation: drag the room's edge (reverb) and the grand's lid
  // (no visible labels: a short tooltip on hover, focus and drag says what each one is)
  const grip = (name: string, label: string) => h('div', { class: `grip grip-${name}`, role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '1' });
  const gripRoom = grip('room', 'Reverb: room size and decay time');
  const gripLid = grip('lid', 'Piano lid: how far open');
  /** the room parameter as heard: the hall's reverberation time (mid frequencies) */
  const roomText = (v: number) => `reverb · ${(0.7 + 1.7 * v).toFixed(1)} s`;
  const lidText = (v: number) => (v < 0.02 ? 'lid · closed' : `lid · ${Math.round(v * 100)} % open`);
  const label = (g: HTMLElement, v: number, text: string) => {
    if (g.dataset.tip === text) return;
    g.dataset.tip = text;
    g.setAttribute('aria-valuenow', String(v));
    g.setAttribute('aria-valuetext', text);
  };
  // in 3D, a key's action close up: back to the whole piano (also Esc, a click off the keys, a double-click)
  const zoomBack = h('button', { class: 'zoom-back', type: 'button', 'aria-label': 'Back to the whole piano', 'data-tip': 'whole piano · Esc' });
  zoomBack.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  zoomBack.hidden = true;
  zoomBack.addEventListener('click', () => s3?.zoomOut());
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && s3 && want3d && s3.zoomed !== null) s3.zoomOut();
  });
  const el = h('div', { class: 'view stage' }, canvas, top, gripRoom, gripLid, zoomBack);
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
    s.grab = (e) => hand.down(e);
    hands.push(hand);
    let at3: { x: number; y: number } | null = null;
    cv3.addEventListener('pointerdown', (e) => {
      at3 = { x: e.clientX, y: e.clientY };
    });
    cv3.addEventListener('pointerup', (e) => {
      if (!at3 || !s3 || Math.hypot(e.clientX - at3.x, e.clientY - at3.y) > 6 || !closeUpOffered()) return;
      at3 = null;
      const r = cv3.getBoundingClientRect();
      const m = s3.pick(e.clientX - r.left, e.clientY - r.top);
      if (m !== null) s3.zoomTo(m);
      else if (s3.zoomed !== null) s3.zoomOut();
    });
    cv3.addEventListener('pointermove', (e) => {
      if (e.buttons || !s3) return;
      if (!closeUpOffered()) {
        // over the bow: it can be taken (elsewhere the stage turns)
        cv3.style.cursor = hand.over(e) ? 'pointer' : '';
        return;
      }
      const r = cv3.getBoundingClientRect();
      cv3.style.cursor = s3.pick(e.clientX - r.left, e.clientY - r.top) !== null ? 'zoom-in' : s3.zoomed !== null ? 'zoom-out' : '';
    });
  };
  const set3d = (on: boolean) => {
    want3d = on && has3d;
    dimBtn.setAttribute('aria-pressed', String(want3d));
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
  const show3d = () => {
    caseBtn.hidden = !(want3d && family() === 'piano') || ensemble.active;
    if (s3) s3.el.hidden = !want3d;
    el.classList.toggle('is-3d', want3d && !!s3);
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
  canvas.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY };
    hand2d.down(e);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || !closeUpOffered()) return;
    downAt = null;
    const r = canvas.getBoundingClientRect();
    const topH = top.getBoundingClientRect().height;
    const m = stringAt(pianoState, e.clientX - r.left, e.clientY - r.top - topH);
    if (m !== null) openAction(m);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!closeUpOffered()) {
      canvas.style.cursor = '';
      return;
    }
    const r = canvas.getBoundingClientRect();
    const hit = stringAt(pianoState, e.clientX - r.left, e.clientY - r.top - top.getBoundingClientRect().height);
    canvas.style.cursor = hit !== null ? 'zoom-in' : '';
  });
  const openAction = (m: number) => {
    action?.close();
    if (!closeUpOffered()) return;
    const kind = audio.preset === 'upright' || audio.preset === 'honky-tonk' ? 'upright' : 'grand';
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
  const dragGrip = (g: HTMLElement, onMove: (x: number, y: number) => void, step: (d: number) => void) => {
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      g.setPointerCapture(e.pointerId);
      g.classList.add('dragging');
    });
    g.addEventListener('pointermove', (e) => {
      if (!g.hasPointerCapture(e.pointerId)) return;
      const r = canvas.getBoundingClientRect();
      onMove(e.clientX - r.left, e.clientY - r.top);
    });
    const end = () => g.classList.remove('dragging');
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
    g.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.05 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.05 : 0;
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      step(d);
    });
  };
  // the room: its right edge's distance from the centre sets the size (0.55 + 0.45·room)
  dragGrip(gripRoom, (x) => {
    const W = canvas.clientWidth;
    const size = (2 * Math.abs(x - W / 2) + 12) / W;
    setRoom((size - 0.55) / 0.45);
  }, (d) => setRoom(roomVal() + d));
  // the lid: hinged on the bass side; its free edge's projected distance is cos(angle)
  dragGrip(gripLid, (x) => {
    const b = pianoState.caseBox;
    const c = Math.min(1, Math.max(0, (x - b.x0) / Math.max(1, b.x1 - b.x0)));
    setLid(Math.acos(c) / (Math.PI / 2.4));
  }, (d) => setLid(lidVal() + d));

  // ---------------------------------------------------------------- knobs
  const knobsFor = (id: InstrumentId) => {
    const f = INSTRUMENT_INFO[id].family;
    return f === 'piano' ? PIANO_KNOBS : f === 'bowed' ? BOWED_KNOBS : f === 'brass' ? TRUMPET_KNOBS : FLUTE_KNOBS;
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
  let strike: VisualFrame['strike'] = null;
  let lastFocus: VisualFrame['focus'] = null;
  let keysFallback: KeySummary[] = pianoKeySummary(audio.preset);
  const pianoState = newPianoState();
  const bowedState: BowedState = { strScale: new AutoScale(2e-6), lvlScale: new AutoScale(1e-6, 0.995) };
  const fluteState = { pScale: new AutoScale(1e-6), jetScale: new AutoScale(1e-9), env: new Float32Array(0) };
  const trumpetState: { pScale: AutoScale; env: Float32Array; src?: { x: number; y: number } } = { pScale: new AutoScale(1e-6), env: new Float32Array(0) };
  const roomState = newRoomState();
  const tdBuf = new Float32Array(2048);
  const fields = { piano: new ModeField(208, 100, 2.2, 3), bowed: new ModeField(150, 84, 1.8, 0.6) };
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
  /** the part that began a note last (the readout, the spectrum's partials and the scope follow it) */
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
        kind: p.voice === 'upright' ? 'upright' : 'grand',
        fr: p.frame,
        keys: isKeyboard(p.voice) ? ensemble.keysOf(p) : [],
        piano: st,
        bowed: d?.bowed?.geom ?? null,
        down: (m: number) => p.down.has(m),
        sounding: (m: number) => p.down.has(m),
      };
    });
  /** the stage as the ensemble changes: the picker counts its instruments, the single instrument's own
   *  controls (knobs, close-up, case, lid) step aside */
  const applyEnsemble = () => {
    const on = ensemble.active;
    const lineup = ensemble.lineup;
    ensBtn.setAttribute('aria-pressed', String(on));
    el.toggleAttribute('data-ensemble', on);
    document.documentElement.toggleAttribute('data-ensemble', on);
    instBtns.forEach((b, i) => {
      const id = INSTRUMENT_IDS[i];
      const n = on ? countOf(id, lineup) : 0;
      b.setAttribute('aria-pressed', String(on ? n > 0 : inst === id));
      (b.querySelector('.pick-n') as HTMLElement).textContent = n > 1 ? `×${n}` : '';
      b.dataset.tip = on ? (n ? `${INSTRUMENT_INFO[id].label.toLowerCase()} ×${n} · tap for another` : `add a ${INSTRUMENT_INFO[id].label.toLowerCase()}`) : '';
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
    noteEl.textContent = '';
    hzEl.textContent = '';
    buildKnobs();
    if (ensemble.active) applyEnsemble();
  };

  // ---------------------------------------------------------------- drawing
  const drawScope = (frame: VisualFrame | null, fam: string, strike: VisualFrame['strike'], bowedGeom: BowedGeom | null) => {
    const family = () => fam;
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
      scopeCap.textContent = `${midiName(s.midi)} · ${fmt(s.vHammer, 2)} m/s · ${fmt(s.peak, 1)} N · ${fmt(s.duration * 1000, 1)} ms`;
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
    } else scopeCap.textContent = family() === 'wind' ? 'jet' : family() === 'brass' ? `lips · ${e.meta}` : '';
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
      drawEnsemble(ctx, cells, ensemble.parts, draws, (p) => ensemble.keysOf(p), now);
    } else if (family() === 'piano') {
      const sr = canvas.getBoundingClientRect();
      const kr = kb.strip.getBoundingClientRect();
      pianoState.down = new Set(audio.down.keys());
      pianoState.sustain = audio.lastStats?.sustain ?? audio.sustainValue;
      pianoState.soft = audio.lastStats?.soft ?? audio.softValue;
      pianoState.middle = audio.lastStats?.middle ?? audio.middleValue;
      pianoState.upright = audio.preset === 'upright' || audio.preset === 'honky-tonk';
      const keys = audio.piano && audio.piano.instrument === 'piano' && audio.piano.keys.length ? audio.piano.keys : keysFallback;
      const kind = audio.preset === 'upright' || audio.preset === 'honky-tonk' ? 'upright' : 'grand';
      drawPiano(ctx, w, ih, { keys, kind, lid: lidVal(), keyX: (m) => ({ x: kr.left - sr.left + kb.keyFrac(m).c * kr.width, w: kb.keyFrac(m).w * kr.width }) }, frame, pianoState, fields.piano, now);
    } else if (family() === 'bowed' && bowedGeom) drawBowed(ctx, w, ih, bowedGeom, frame, bowedState, fields.bowed, now);
    else if (family() === 'brass') drawTrumpet(ctx, w, ih, frame, trumpetState);
    else drawFlute(ctx, w, ih, frame, fluteState);
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
    const src = ens ? { x: w / 2, y: ih / 2 } : fam === 'piano' ? pianoState.src : fam === 'bowed' ? { x: w * 0.62, y: ih / 2 } : fam === 'brass' ? (trumpetState.src ?? { x: w * 0.85, y: ih * 0.55 }) : { x: w * 0.5, y: ih * 0.45 };
    // (an ensemble's cells have no room drawn round them: its outline would cross the instruments)
    const rg = in3d || ens ? { x0: 0, y0: 0, x1: 0, y1: 0 } : drawRoom(ctx, w, ih, roomState, src, roomVal(), rms, now, grand ? { open: lidVal(), dir: -Math.PI / 4 } : null);
    ctx.restore();
    if (in3d && s3) {
      pianoState.down = new Set(audio.down.keys());
      pianoState.sustain = audio.lastStats?.sustain ?? audio.sustainValue;
      pianoState.soft = audio.lastStats?.soft ?? audio.softValue;
      pianoState.middle = audio.lastStats?.middle ?? audio.middleValue;
      pianoState.upright = audio.preset === 'upright' || audio.preset === 'honky-tonk';
      const keys = audio.piano && audio.piano.instrument === 'piano' && audio.piano.keys.length ? audio.piano.keys : keysFallback;
      s3.frame(now, topH, {
        fr: frame,
        family: fam as 'piano' | 'bowed' | 'wind' | 'brass',
        kind: grand ? 'grand' : 'upright',
        keys,
        piano: pianoState,
        bowed: bowedGeom,
        lid: lidVal(),
        room: roomVal(),
        rms,
        down: (m) => audio.down.has(m),
        sounding: (m) => audio.isSounding(m),
        caseHidden,
        ensemble: ens ? ensIn() : null,
      });
    }
    gripRoom.hidden = in3d || ens;
    // the MIDI file player sits at the top middle, just under this band (a fixed overlay)
    const bandY = Math.round(top.getBoundingClientRect().bottom);
    if (bandY !== lastBandY) {
      lastBandY = bandY;
      document.documentElement.style.setProperty('--stage-band-y', `${bandY}px`);
    }
    zoomBack.hidden = !(in3d && s3!.zoomed !== null);
    if (!zoomBack.hidden) zoomBack.style.top = `${topH + 12}px`;
    // place the grips (stage coordinates: the instrument area starts below the top band)
    gripRoom.style.transform = `translate(${rg.x1 - 7}px, ${topH + (rg.y0 + rg.y1) / 2 - 14}px)`;
    label(gripRoom, roomVal(), roomText(roomVal()));
    const le = grand && !in3d && !ens ? pianoState.lidEdge : null;
    gripLid.hidden = !le;
    if (le) {
      gripLid.style.transform = `translate(${le.x - 7}px, ${topH + le.y - 14}px)`;
      label(gripLid, lidVal(), lidText(lidVal()));
    }
    // spectrum hairline
    const sp = fitCanvas(specCv);
    sp.ctx.clearRect(0, 0, sp.w, sp.h);
    const lead = ens ? leadPart() : null;
    if (lead) {
      const lf = lead.frame;
      const lfam = familyOf(lead.voice);
      drawSpectrum(sp.ctx, 0, 6, sp.w, sp.h - 8, audio.analyser, specBuf, lf?.focus ?? null, lfam);
      const ld = draws[ensemble.parts.indexOf(lead)];
      drawScope(lf, lfam, lead.strike, ld?.bowed?.geom ?? null);
    } else {
      drawSpectrum(sp.ctx, 0, 6, sp.w, sp.h - 8, audio.analyser, specBuf, focus, family());
      drawScope(frame, family(), strike, bowedGeom);
    }
    if (focus && !noteEl.textContent && !ens) {
      noteEl.textContent = midiName(focus.midi);
      hzEl.textContent = `${fmt(focus.f1, 1)} Hz`;
    }
    raf = requestAnimationFrame(loop);
  };

  let unsubVis: (() => void) | null = null;
  const attach = () => {
    if (!audio.piano || unsubVis) return;
    syncKnobs(audio.piano.params as unknown as Record<string, number>);
    unsubVis = audio.piano.onVisual((v) => {
      frame = v;
      if (v.strike) strike = v.strike;
    });
  };
  let lastBandY = -1;
  const unsubs: (() => void)[] = [];
  return {
    el,
    dock: true,
    mount() {
      attach();
      unsubs.push(audio.state.on(() => attach()));
      unsubs.push(audio.instrumentChanged.on(applyInstrument));
      unsubs.push(ensemble.changed.on(applyEnsemble));
      unsubs.push(
        ensemble.notes.on((n) => {
          if (!n.on) return;
          noteEl.textContent = midiName(n.midi);
          const k = ensemble.parts[n.part]?.engine?.keys.find((x) => x.midi === n.midi);
          hzEl.textContent = `${fmt(k?.f1 ?? 440 * 2 ** ((n.midi - 69) / 12), 1)} Hz`;
        }),
      );
      unsubs.push(
        audio.notes.on((n) => {
          if (!n.on) return;
          pianoState.strikes.set(n.midi, performance.now());
          pianoState.vels.set(n.midi, n.velocity);
          noteEl.textContent = midiName(n.midi);
          const k = audio.piano?.keys.find((x) => x.midi === n.midi);
          hzEl.textContent = k ? `${fmt(k.f1, 1)} Hz` : '';
        }),
      );
      applyInstrument(audio.instrument);
      applyEnsemble();
      if (want3d) set3d(true);
      document.body.style.setProperty('--ground', cssVar('--ground'));
      raf = requestAnimationFrame(loop);
    },
    unmount() {
      action?.close();
      s3?.dispose();
      s3 = null;
      cancelAnimationFrame(raf);
      unsubVis?.();
      unsubVis = null;
      unsubs.forEach((u) => u());
      knobSlot.replaceChildren();
    },
  };
}
