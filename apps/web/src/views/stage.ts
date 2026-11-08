// The instrument stage: play and look inside in one place. The selected instrument is
// drawn in plan view and moves with the simulation; the controls are knobs on the
// fallboard; there is almost no text.

import { audio } from '../audio.ts';
import { DEFAULT_PARAMS, INSTRUMENT_IDS, INSTRUMENT_INFO, PRESETS, PRESET_IDS, bowedGeometry, midiName, pianoKeySummary, type InstrumentId, type KeySummary, type VisualFrame } from '@piano-model/engine';
import { cssVar, fitCanvas, fmt, h, type View } from '../ui/dom.ts';
import type { KeyboardHandle } from '../ui/keyboard.ts';
import { glyph, knob, type KnobSpec } from '../ui/controls.ts';
import { AutoScale, INK, ModeField, drawBowed, drawFlute, drawPiano, drawSpectrum, rgba, type BowedGeom } from '../ui/stage-draw.ts';

const PIANO_KNOBS: KnobSpec[] = [
  { key: 'hammerHardness', label: 'Hammer hardness', short: 'hammer', sub: 'felt stiffness K in F = K·xᵖ', min: 0.25, max: 4, step: 0.01, log: true, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'stringStiffness', label: 'String stiffness', short: 'stiffness', sub: 'inharmonicity B; 0 = ideal string', min: 0, max: 5, step: 0.05, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'unisonDetune', label: 'Unison detune', short: 'detune', sub: 'spread of the 2–3 strings of a note', min: 0, max: 30, step: 0.1, fmt: (v) => `${fmt(v, 1)} ¢` },
  { key: 'soundboardDamping', label: 'Soundboard damping', short: 'board', sub: 'loss of the soundboard modes', min: 0.25, max: 5, step: 0.01, log: true, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'sustain', label: 'String decay', short: 'decay', sub: 'intrinsic string losses', min: 0.3, max: 2.5, step: 0.01, log: true, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'lid', label: 'Lid', short: 'lid', sub: 'closed … open', min: 0, max: 1, step: 0.01, fmt: (v) => (v < 0.05 ? 'closed' : v > 0.95 ? 'open' : fmt(v, 2)) },
  { key: 'room', label: 'Room', short: 'room', sub: 'close microphones … hall', min: 0, max: 1, step: 0.01, fmt: (v) => fmt(v, 2) },
];
const BOWED_KNOBS: KnobSpec[] = [
  { key: 'bowPosition', label: 'Bow position', short: 'contact', sub: 'distance from the bridge β: sul ponticello … sul tasto', min: 0.04, max: 0.25, step: 0.005, fmt: (v) => `β ${fmt(v, 3)}` },
  { key: 'bowPressure', label: 'Bow force', short: 'force', sub: 'fraction of Schelleng’s maximum: airy … raucous', min: 0.05, max: 1.1, step: 0.01, log: true, fmt: (v) => fmt(v, 2) },
  { key: 'vibrato', label: 'Vibrato', short: 'vibrato', sub: 'finger rocking depth, cents', min: 0, max: 40, step: 0.5, fmt: (v) => `${fmt(v, 0)} ¢` },
  { key: 'bodyDamping', label: 'Body damping', short: 'body', sub: 'loss of the wood and air modes', min: 0.25, max: 4, step: 0.01, log: true, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'bowChangeTime', label: 'Bow change', short: 'change', sub: 'time to reverse the bow: seamless … laboured', min: 0.02, max: 0.25, step: 0.005, log: true, fmt: (v) => `${fmt(v * 1000, 0)} ms` },
  { key: 'room', label: 'Room', short: 'room', sub: 'close … hall', min: 0, max: 1, step: 0.01, fmt: (v) => fmt(v, 2) },
];
const FLUTE_KNOBS: KnobSpec[] = [
  { key: 'breath', label: 'Breath pressure', short: 'breath', sub: '× nominal; past about ×2 the tube overblows', min: 0.4, max: 2.6, step: 0.01, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'embouchure', label: 'Lip–edge distance', short: 'lip', sub: 'jet length: shorter is brighter and sharper', min: 0.6, max: 1.5, step: 0.01, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'noise', label: 'Breath noise', short: 'noise', sub: 'turbulence of the jet', min: 0, max: 3, step: 0.01, fmt: (v) => fmt(v, 2) },
  { key: 'vibrato', label: 'Vibrato', short: 'vibrato', sub: 'breath pressure modulation', min: 0, max: 0.2, step: 0.005, fmt: (v) => fmt(v, 3) },
  { key: 'room', label: 'Room', short: 'room', sub: 'close … hall', min: 0, max: 1, step: 0.01, fmt: (v) => fmt(v, 2) },
];
const PRESET_SHORT: Record<string, string> = { grand: 'grand', upright: 'upright', 'honky-tonk': 'honky-tonk', prepared: 'prepared' };

export function stageView(kb: KeyboardHandle, knobSlot: HTMLElement): View {
  let inst: InstrumentId = audio.instrument;
  const family = () => INSTRUMENT_INFO[inst].family;

  // ---------------------------------------------------------------- picker
  const instBtns = INSTRUMENT_IDS.map((id) => {
    const b = h('button', { class: 'pick', type: 'button', 'aria-label': INSTRUMENT_INFO[id].label, title: INSTRUMENT_INFO[id].blurb, 'aria-pressed': String(inst === id), onclick: () => void audio.setInstrument(id) }, h('span', { class: 'pick-name' }, INSTRUMENT_INFO[id].label.toLowerCase()));
    b.prepend(glyph(id) as unknown as HTMLElement);
    return b;
  });
  const presetBtns = PRESET_IDS.map((id) =>
    h(
      'button',
      {
        type: 'button',
        title: PRESETS[id].description,
        'aria-pressed': String(audio.preset === id),
        onclick: async () => {
          await audio.setPreset(id);
          presetBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(PRESET_IDS[i] === id)));
          keysFallback = pianoKeySummary(id);
          if (audio.piano) syncKnobs(audio.piano.params as unknown as Record<string, number>);
        },
      },
      PRESET_SHORT[id] ?? id,
    ),
  );
  const presets = h('div', { class: 'presets', role: 'group', 'aria-label': 'Piano' }, presetBtns);
  const picker = h('div', { class: 'picker' }, h('div', { class: 'instruments', role: 'group', 'aria-label': 'Instrument' }, instBtns), presets);

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
  const el = h('div', { class: 'view stage' }, canvas, top);

  // ---------------------------------------------------------------- knobs
  const knobsFor = (id: InstrumentId) => (INSTRUMENT_INFO[id].family === 'piano' ? PIANO_KNOBS : INSTRUMENT_INFO[id].family === 'bowed' ? BOWED_KNOBS : FLUTE_KNOBS);
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
        title: 'Reset the knobs',
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
  const pianoState = { maxL: 0, strikes: new Map<number, number>(), down: new Set<number>(), sustain: 0, strScale: new AutoScale(2e-6), lvlScale: new AutoScale(1e-6, 0.995) };
  const bowedState = { strScale: new AutoScale(2e-6), lvlScale: new AutoScale(1e-6, 0.995) };
  const fluteState = { pScale: new AutoScale(1e-6), jetScale: new AutoScale(1e-9), env: new Float32Array(0) };
  const fields = { piano: new ModeField(208, 100, 2.2, 3), bowed: new ModeField(150, 84, 1.8, 0.6) };
  let bowedGeom: BowedGeom | null = null;
  const specBuf = new Float32Array(4096);
  const forceScale = new AutoScale(1e-6);

  const applyInstrument = (id: InstrumentId) => {
    inst = id;
    instBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(INSTRUMENT_IDS[i] === id)));
    presets.hidden = id !== 'piano';
    el.dataset.family = INSTRUMENT_INFO[id].family;
    bowedGeom = INSTRUMENT_INFO[id].family === 'bowed' ? { id: id as BowedGeom['id'], ...bowedGeometry(id as BowedGeom['id']) } : null;
    frame = null;
    strike = null;
    lastFocus = null;
    noteEl.textContent = '';
    hzEl.textContent = '';
    buildKnobs();
  };

  // ---------------------------------------------------------------- drawing
  const drawScope = () => {
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
    } else scopeCap.textContent = family() === 'wind' ? 'jet' : '';
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
    if (family() === 'piano') {
      const sr = canvas.getBoundingClientRect();
      const kr = kb.strip.getBoundingClientRect();
      pianoState.down = new Set(audio.down.keys());
      pianoState.sustain = audio.lastStats?.sustain ?? audio.sustainValue;
      const keys = audio.piano && audio.piano.instrument === 'piano' && audio.piano.keys.length ? audio.piano.keys : keysFallback;
      drawPiano(ctx, w, ih, { keys, keyX: (m) => ({ x: kr.left - sr.left + kb.keyFrac(m).c * kr.width, w: kb.keyFrac(m).w * kr.width }) }, frame, pianoState, fields.piano, now);
    } else if (family() === 'bowed' && bowedGeom) drawBowed(ctx, w, ih, bowedGeom, frame, bowedState, fields.bowed, now);
    else drawFlute(ctx, w, ih, frame, fluteState);
    ctx.restore();
    // spectrum hairline
    const sp = fitCanvas(specCv);
    sp.ctx.clearRect(0, 0, sp.w, sp.h);
    drawSpectrum(sp.ctx, 0, 6, sp.w, sp.h - 8, audio.analyser, specBuf, focus, family());
    drawScope();
    if (focus && !noteEl.textContent) {
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
      if (v.strike) {
        strike = v.strike;
        pianoState.strikes.set(v.strike.midi, performance.now() - 8);
      }
    });
  };
  const unsubs: (() => void)[] = [];
  return {
    el,
    dock: true,
    mount() {
      attach();
      unsubs.push(audio.state.on(() => attach()));
      unsubs.push(audio.instrumentChanged.on(applyInstrument));
      unsubs.push(
        audio.notes.on((n) => {
          if (!n.on) return;
          pianoState.strikes.set(n.midi, performance.now());
          noteEl.textContent = midiName(n.midi);
          const k = audio.piano?.keys.find((x) => x.midi === n.midi);
          hzEl.textContent = k ? `${fmt(k.f1, 1)} Hz` : '';
        }),
      );
      applyInstrument(audio.instrument);
      document.body.style.setProperty('--ground', cssVar('--ground'));
      raf = requestAnimationFrame(loop);
    },
    unmount() {
      cancelAnimationFrame(raf);
      unsubVis?.();
      unsubVis = null;
      unsubs.forEach((u) => u());
      knobSlot.replaceChildren();
    },
  };
}
