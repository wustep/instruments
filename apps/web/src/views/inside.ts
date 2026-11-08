import { audio } from '../audio.ts';
import { DEFAULT_PARAMS, INSTRUMENT_INFO, PRESETS, PRESET_IDS, midiName, type InstrumentId, type VisualFrame } from '@piano-model/engine';
import { cssVar, fitCanvas, fmt, fmtSci, h, type View } from '../ui/dom.ts';

interface Ctl {
  key: string;
  label: string;
  sub: string;
  min: number;
  max: number;
  step: number;
  log?: boolean;
  fmt: (v: number) => string;
}

const PIANO_CONTROLS: Ctl[] = [
  { key: 'hammerHardness', label: 'Hammer hardness', sub: 'felt stiffness K in F = K·x^p', min: 0.25, max: 4, step: 0.01, log: true, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'stringStiffness', label: 'String stiffness', sub: 'inharmonicity B; 0 = ideal string', min: 0, max: 5, step: 0.05, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'unisonDetune', label: 'Unison detune', sub: 'spread of the 2–3 strings per note', min: 0, max: 30, step: 0.1, fmt: (v) => `${fmt(v, 1)} ¢` },
  { key: 'soundboardDamping', label: 'Soundboard damping', sub: 'modal loss factor', min: 0.25, max: 5, step: 0.01, log: true, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'sustain', label: 'String decay', sub: 'intrinsic string losses', min: 0.3, max: 2.5, step: 0.01, log: true, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'lid', label: 'Lid', sub: 'closed … open', min: 0, max: 1, step: 0.01, fmt: (v) => (v < 0.05 ? 'closed' : v > 0.95 ? 'open' : fmt(v, 2)) },
  { key: 'room', label: 'Room', sub: 'close mics … hall', min: 0, max: 1, step: 0.01, fmt: (v) => fmt(v, 2) },
];

const BOWED_CONTROLS: Ctl[] = [
  { key: 'bowPosition', label: 'Bow position', sub: 'distance from the bridge: sul ponticello … sul tasto', min: 0.04, max: 0.25, step: 0.005, fmt: (v) => `β ${fmt(v, 3)}` },
  { key: 'bowPressure', label: 'Bow force', sub: 'fraction of Schelleng’s maximum: airy … raucous', min: 0.05, max: 1.1, step: 0.01, log: true, fmt: (v) => fmt(v, 2) },
  { key: 'vibrato', label: 'Vibrato', sub: 'finger rocking depth, cents', min: 0, max: 40, step: 0.5, fmt: (v) => `${fmt(v, 0)} ¢` },
  { key: 'bodyDamping', label: 'Body damping', sub: 'loss of the wood and air modes', min: 0.25, max: 4, step: 0.01, log: true, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'room', label: 'Room', sub: 'close … hall', min: 0, max: 1, step: 0.01, fmt: (v) => fmt(v, 2) },
];

const FLUTE_CONTROLS: Ctl[] = [
  { key: 'breath', label: 'Breath pressure', sub: '× nominal; past ~2 the tube overblows', min: 0.4, max: 2.6, step: 0.01, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'embouchure', label: 'Lip–edge distance', sub: 'jet length: shorter is brighter and sharper', min: 0.6, max: 1.5, step: 0.01, fmt: (v) => `×${fmt(v, 2)}` },
  { key: 'noise', label: 'Breath noise', sub: 'turbulence of the jet', min: 0, max: 3, step: 0.01, fmt: (v) => fmt(v, 2) },
  { key: 'vibrato', label: 'Vibrato', sub: 'breath pressure modulation', min: 0, max: 0.2, step: 0.005, fmt: (v) => fmt(v, 3) },
  { key: 'room', label: 'Room', sub: 'close … hall', min: 0, max: 1, step: 0.01, fmt: (v) => fmt(v, 2) },
];

const TITLES: Record<'piano' | 'bowed' | 'wind', [string, string, string, string]> = {
  piano: ['String', 'Hammer', 'Soundboard', 'Spectrum'],
  bowed: ['String', 'Bow', 'Body', 'Spectrum'],
  wind: ['Bore', 'Jet', 'Pipe resonances', 'Spectrum'],
};
const CAPS: Record<'piano' | 'bowed' | 'wind', [string, string]> = {
  piano: [
    'Displacement along the speaking length, reconstructed from the travelling waves of each unison string (vertical scale exaggerated). Agraffe left, bridge right; the tick marks the hammer.',
    'Modal amplitudes of the shared soundboard, by frequency. Every string drives these modes through the bridge, and the modes push back on every undamped string.',
  ],
  bowed: [
    'Displacement of the bowed string from the finger (left) to the bridge (right), reconstructed from its travelling waves. The tick is the bow: watch the Helmholtz corner circulate.',
    'Modal amplitudes of the body: the air (A0) and wood (B1−, B1+) resonances low down, denser modes above. All four strings drive them through the bridge — and the open strings are driven back.',
  ],
  wind: [
    'Acoustic pressure along the tube, from the embouchure hole (left) to the open foot (right): a standing wave with pressure nodes near both open ends.',
    'Energy at the tube’s resonances (harmonics of the fingered tube length). In the upper registers the sounding pitch is the 2nd or 3rd of these.',
  ],
};

export function insideView(): View {
  // ---------------------------------------------------------------- panels
  const mkPanel = (title: string, cap: string) => {
    const canvas = h('canvas', { role: 'img', 'aria-label': title });
    const meta = h('span', { class: 'meta' });
    const t = h('h3', {}, title);
    const c = h('p', { class: 'cap' }, cap);
    const el = h('section', { class: 'panel' }, h('header', {}, t, meta), canvas, c);
    return { el, canvas, meta, t, c };
  };
  const pString = mkPanel('String', 'Displacement along the speaking length, reconstructed from the travelling waves of each unison string (vertical scale exaggerated). Agraffe left, bridge right; the tick marks the hammer.');
  const pHammer = mkPanel('Hammer', 'Contact force of the last strike over time. Inset: force against felt compression — the loop is the hysteresis of the felt (Hunt–Crossley).');
  const pBoard = mkPanel('Soundboard', 'Modal amplitudes of the shared soundboard, by frequency. Every string drives these modes through the bridge, and the modes push back on every undamped string.');
  const pSpec = mkPanel('Spectrum', 'Output spectrum. Red ticks: the partials of the last note, k·f₀·√(1+Bk²). Grey ticks: where an ideal, harmonic string would put them.');

  // ---------------------------------------------------------------- controls
  let inst: InstrumentId = audio.instrument;
  const family = () => INSTRUMENT_INFO[inst].family;
  const ctlsFor = (id: InstrumentId) => (INSTRUMENT_INFO[id].family === 'piano' ? PIANO_CONTROLS : INSTRUMENT_INFO[id].family === 'bowed' ? BOWED_CONTROLS : FLUTE_CONTROLS);
  const toSlider = (c: Ctl, v: number) => (c.log ? Math.log(v / c.min) / Math.log(c.max / c.min) : (v - c.min) / (c.max - c.min));
  const fromSlider = (c: Ctl, x: number) => (c.log ? c.min * Math.pow(c.max / c.min, x) : c.min + x * (c.max - c.min));
  const ctlBox = h('div', { class: 'controls-list', style: 'display:grid;gap:18px' });
  let ctlEls: { c: Ctl; el: HTMLElement; input: HTMLInputElement; val: HTMLElement }[] = [];
  const currentParams = (): Record<string, number> => ({ ...(inst === 'piano' ? DEFAULT_PARAMS : {}), ...(audio.piano?.params ?? {}) }) as Record<string, number>;
  const buildControls = () => {
    const params = currentParams();
    ctlEls = ctlsFor(inst).map((c) => {
      const v0 = Number.isFinite(params[c.key]) ? params[c.key] : (c.min + c.max) / 2;
      const val = h('span', { class: 'num' }, c.fmt(v0));
      const input = h('input', { type: 'range', min: '0', max: '1', step: '0.001', value: String(toSlider(c, v0)), 'aria-label': c.label }) as HTMLInputElement;
      let timer = 0;
      input.addEventListener('input', () => {
        const v = Math.round(fromSlider(c, Number(input.value)) / c.step) * c.step;
        val.textContent = c.fmt(v);
        // slow controls redesign filters; debounce them
        const slow = c.key === 'stringStiffness' || c.key === 'sustain' || c.key === 'unisonDetune';
        window.clearTimeout(timer);
        if (slow) timer = window.setTimeout(() => audio.setParams({ [c.key]: v }), 140);
        else audio.setParams({ [c.key]: v });
      });
      const el = h('label', { class: 'control' }, h('div', { class: 'top' }, h('span', {}, c.label), val), input, h('span', { class: 'sub' }, c.sub));
      return { c, el, input, val };
    });
    ctlBox.replaceChildren(...ctlEls.map((x) => x.el));
  };
  const syncControls = (p: Record<string, number>) => {
    for (const x of ctlEls) {
      const v = p[x.c.key];
      if (!Number.isFinite(v)) continue;
      x.input.value = String(toSlider(x.c, v));
      x.val.textContent = x.c.fmt(v);
    }
  };
  const presetBtns = PRESET_IDS.map((id) =>
    h(
      'button',
      {
        'aria-pressed': String(audio.preset === id),
        onclick: async () => {
          await audio.setPreset(id);
          presetBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(PRESET_IDS[i] === id)));
          if (audio.piano) syncControls(audio.piano.params as unknown as Record<string, number>);
        },
      },
      PRESETS[id].label,
    ),
  );
  const presetRow = h('div', { class: 'control' }, h('span', { class: 'label' }, 'Piano preset'), h('div', { class: 'seg' }, presetBtns));
  const instBtns = (Object.keys(INSTRUMENT_INFO) as InstrumentId[]).map((id) =>
    h('button', { 'aria-pressed': String(inst === id), onclick: () => void audio.setInstrument(id) }, INSTRUMENT_INFO[id].label),
  );
  const reset = h(
    'button',
    {
      class: 'btn ghost',
      onclick: async () => {
        // re-selecting the instrument restores its defaults
        await audio.setInstrument(inst);
        if (inst === 'piano') {
          const d = { ...DEFAULT_PARAMS, ...PRESETS[audio.preset].defaults } as unknown as Record<string, number>;
          const p: Record<string, number> = {};
          for (const x of ctlEls) p[x.c.key] = d[x.c.key];
          audio.setParams(p);
        }
        buildControls();
      },
    },
    'Reset controls',
  );
  const controls = h(
    'aside',
    { class: 'controls', 'aria-label': 'Physical controls' },
    h('div', { class: 'control' }, h('span', { class: 'label' }, 'Instrument'), h('div', { class: 'seg' }, instBtns)),
    presetRow,
    ctlBox,
    h('div', {}, reset),
  );
  const applyInstrument = (id: InstrumentId) => {
    inst = id;
    instBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(Object.keys(INSTRUMENT_INFO)[i] === id)));
    presetRow.hidden = id !== 'piano';
    const f = INSTRUMENT_INFO[id].family;
    [pString, pHammer, pBoard, pSpec].forEach((pn, i) => (pn.t.textContent = TITLES[f][i]));
    pString.c.textContent = CAPS[f][0];
    pBoard.c.textContent = CAPS[f][1];
    pHammer.c.textContent =
      f === 'piano'
        ? 'Contact force of the last strike over time. Inset: force against felt compression — the loop is the hysteresis of the felt (Hunt–Crossley).'
        : f === 'bowed'
          ? 'Top: friction force of the bow on the string. Bottom: the string’s velocity under the bow — it sticks to the bow (flat) and flies back once per period. Helmholtz motion emerges from the friction law.'
          : 'Top: flow the jet sends into the tube as it flaps across the edge. Bottom: sound returning to the embouchure, which deflects the jet after its convection delay.';
    frame = null;
    strike = null;
    lastFocus = null;
    modeFreqs = audio.piano?.modeFrequencies ?? [];
    buildControls();
  };
  buildControls();

  const el = h(
    'div',
    { class: 'view' },
    h('h2', {}, 'Look inside'),
    h('p', { class: 'prose', style: 'margin:10px 0 28px' }, 'Play a note and watch the model think. Everything here is read live from the audio thread.'),
    h('div', { class: 'inside' }, h('div', { class: 'panels' }, pString.el, pHammer.el, pBoard.el, pSpec.el), controls),
  );

  // ---------------------------------------------------------------- drawing
  let frame: VisualFrame | null = null;
  let modeFreqs: number[] = audio.piano?.modeFrequencies ?? [];
  let strike: VisualFrame['strike'] = null;
  let strScale = 1e-4;
  let modeScale = 1e-9;
  let lastFocus: VisualFrame['focus'] = null;
  let raf = 0;
  let unsubVis: (() => void) | null = null;
  const spec = new Float32Array(4096);

  const colors = () => ({
    ink: cssVar('--ink'),
    muted: cssVar('--muted'),
    rule: cssVar('--rule'),
    rule2: cssVar('--rule-2'),
    accent: cssVar('--accent'),
    ref: cssVar('--ref'),
  });

  function drawString(c: ReturnType<typeof colors>): void {
    const { ctx, w, h: hh } = fitCanvas(pString.canvas);
    ctx.clearRect(0, 0, w, hh);
    const f = frame?.focus ?? lastFocus;
    const pad = 14;
    const mid = hh / 2;
    ctx.strokeStyle = c.rule2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, mid);
    ctx.lineTo(w - pad, mid);
    ctx.stroke();
    // terminations
    ctx.fillStyle = c.muted;
    ctx.fillRect(pad - 3, mid - 14, 3, 28);
    ctx.fillRect(w - pad, mid - 14, 3, 28);
    if (!f) {
      pString.meta.textContent = 'play a note';
      return;
    }
    lastFocus = f;
    let mx = 0;
    for (const s of f.shapes) for (let i = 0; i < s.length; i++) mx = Math.max(mx, Math.abs(s[i]));
    strScale = Math.max(mx, strScale * 0.97, 2e-6);
    const amp = (hh / 2 - 18) / strScale;
    const xs = (i: number, n: number) => pad + ((w - 2 * pad) * i) / (n - 1);
    const shades = [c.ink, c.accent, c.ref];
    f.shapes.forEach((s, si) => {
      ctx.strokeStyle = shades[si % 3];
      ctx.globalAlpha = si === 0 ? 0.95 : 0.7;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < s.length; i++) {
        const x = xs(i, s.length);
        const y = mid - s[i] * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    pString.meta.textContent =
      family() === 'wind'
        ? `${midiName(f.midi)} · ${fmt(f.lengthM * 100, 1)} cm tube`
        : family() === 'bowed'
          ? `${midiName(f.midi)} · ${fmt(f.lengthM * 100, 1)} cm · ±${fmt(strScale * 1000, 3)} mm`
          : `${midiName(f.midi)} · ${fmt(f.f1, 1)} Hz · ${f.nStrings} str · ±${fmt(strScale * 1000, 3)} mm${f.damper > 0.5 ? ' · damped' : ''}`;
    // hammer / bow + preparation
    if (family() === 'wind') return;
    const hx = pad + (w - 2 * pad) * f.hammerAt;
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx, hh - 8);
    ctx.lineTo(hx, hh - 18);
    ctx.stroke();
    if (f.prepAt >= 0) {
      const px = pad + (w - 2 * pad) * f.prepAt;
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.arc(px, mid, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawExcite(c: ReturnType<typeof colors>): void {
    const { ctx, w, h: hh } = fitCanvas(pHammer.canvas);
    ctx.clearRect(0, 0, w, hh);
    const e = frame?.excite;
    if (!e || e.trace.length < 2) {
      pHammer.meta.textContent = 'play a note';
      return;
    }
    // two stacked traces with their own scales (no dual axis)
    const pad = 12;
    const rows: [Float32Array, string, string][] = [[e.trace, c.accent, e.unit ? `force (${e.unit})` : 'jet flow']];
    if (e.trace2) rows.push([e.trace2, c.ink, e.trace2Label ?? '']);
    const rh = (hh - pad) / rows.length;
    ctx.font = '10px "IBM Plex Mono", monospace';
    rows.forEach(([tr, col, label], r) => {
      let mx = 0;
      for (let i = 0; i < tr.length; i++) mx = Math.max(mx, Math.abs(tr[i]));
      mx = mx || 1;
      const y0 = pad / 2 + r * rh + rh / 2;
      ctx.strokeStyle = c.rule2;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad, y0);
      ctx.lineTo(w - pad, y0);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < tr.length; i++) {
        const x = pad + ((w - 2 * pad) * i) / (tr.length - 1);
        const y = y0 - (tr[i] / mx) * (rh / 2 - 8);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = c.muted;
      ctx.fillText(label, pad + 2, pad / 2 + r * rh + 10);
    });
    pHammer.meta.textContent = e.meta;
  }

  function drawHammer(c: ReturnType<typeof colors>): void {
    if (family() !== 'piano') return drawExcite(c);
    const { ctx, w, h: hh } = fitCanvas(pHammer.canvas);
    ctx.clearRect(0, 0, w, hh);
    const s = strike;
    if (!s || s.force.length < 2) {
      pHammer.meta.textContent = 'play a note';
      return;
    }
    const n = s.force.length;
    const dur = n / s.fs;
    const tMax = Math.max(0.002, Math.min(0.012, dur * 1.15));
    const pad = 16;
    const fMax = s.peak * 1.12 || 1;
    const X = (t: number) => pad + ((w * 0.62 - pad) * t) / tMax;
    const Y = (f: number) => hh - pad - ((hh - 2 * pad) * f) / fMax;
    // axes
    ctx.strokeStyle = c.rule2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, Y(0));
    ctx.lineTo(w * 0.62, Y(0));
    ctx.stroke();
    ctx.fillStyle = c.muted;
    ctx.font = '10px "IBM Plex Mono", monospace';
    for (let ms = 0; ms <= tMax * 1000 + 1e-9; ms += tMax > 0.006 ? 2 : 1) {
      ctx.fillText(ms === 0 ? '0 ms' : `${ms}`, X(ms / 1000) - 3, hh - 3);
    }
    // force curve
    ctx.fillStyle = cssVar('--accent-soft');
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    for (let i = 0; i < n; i++) ctx.lineTo(X(i / s.fs), Y(s.force[i]));
    ctx.lineTo(X((n - 1) / s.fs), Y(0));
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    for (let i = 0; i < n; i++) (i ? ctx.lineTo : ctx.moveTo).call(ctx, X(i / s.fs), Y(s.force[i]));
    ctx.stroke();
    // inset: force vs compression (hysteresis)
    const ix0 = w * 0.68;
    const iw = w - ix0 - 10;
    const iy0 = 18;
    const ih = hh - 40;
    let xMax = 0;
    for (let i = 0; i < n; i++) xMax = Math.max(xMax, s.compression[i]);
    xMax = xMax || 1e-4;
    ctx.strokeStyle = c.rule2;
    ctx.strokeRect(ix0, iy0, iw, ih);
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < n; i++) {
      if (s.force[i] <= 0 && !started) continue;
      const x = ix0 + (iw * s.compression[i]) / xMax;
      const y = iy0 + ih - (ih * s.force[i]) / fMax;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = c.muted;
    ctx.fillText(`x ≤ ${fmt(xMax * 1000, 2)} mm`, ix0, hh - 6);
    pHammer.meta.textContent = `${midiName(s.midi)} · v=${fmt(s.vHammer, 2)} m/s · peak ${fmt(s.peak, 1)} N · ${fmt(s.duration * 1000, 2)} ms`;
  }

  function drawBoard(c: ReturnType<typeof colors>): void {
    const { ctx, w, h: hh } = fitCanvas(pBoard.canvas);
    ctx.clearRect(0, 0, w, hh);
    const modes = frame?.modes;
    const pad = 16;
    const f0 = 40;
    const f1 = 4000;
    const X = (f: number) => pad + ((w - 2 * pad) * Math.log(f / f0)) / Math.log(f1 / f0);
    ctx.fillStyle = c.muted;
    ctx.font = '10px "IBM Plex Mono", monospace';
    for (const f of [50, 100, 200, 500, 1000, 2000]) {
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, X(f) - 6, hh - 3);
      ctx.strokeStyle = c.rule;
      ctx.beginPath();
      ctx.moveTo(X(f), 8);
      ctx.lineTo(X(f), hh - 16);
      ctx.stroke();
    }
    if (!modes || !modeFreqs.length) {
      pBoard.meta.textContent = `${modeFreqs.length || '…'} modes`;
      return;
    }
    let mx = 0;
    for (let i = 0; i < modes.length; i++) mx = Math.max(mx, modes[i]);
    modeScale = Math.max(mx, modeScale * 0.985, 1e-12);
    const base = hh - 18;
    ctx.lineWidth = 2;
    for (let i = 0; i < modes.length && i < modeFreqs.length; i++) {
      const a = modes[i] / modeScale;
      const db = Math.max(0, 1 + (20 * Math.log10(Math.max(a, 1e-6))) / 50);
      const x = X(modeFreqs[i]);
      ctx.strokeStyle = c.ink;
      ctx.globalAlpha = 0.25 + 0.75 * db;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x, base - (base - 10) * db);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    pBoard.meta.textContent =
      family() === 'wind'
        ? `tube f₁ ${fmt(modeFreqs[0], 1)} Hz`
        : `${modeFreqs.length} modes · ${fmt(modeFreqs[0], 0)} Hz – ${fmt(modeFreqs[modeFreqs.length - 1] / 1000, 1)} kHz`;
  }

  function drawSpectrum(c: ReturnType<typeof colors>): void {
    const { ctx, w, h: hh } = fitCanvas(pSpec.canvas);
    ctx.clearRect(0, 0, w, hh);
    const an = audio.analyser;
    const pad = 16;
    const f0 = 25;
    const f1 = 12000;
    const X = (f: number) => pad + ((w - 2 * pad) * Math.log(f / f0)) / Math.log(f1 / f0);
    const dbLo = -120;
    const dbHi = -20;
    const Y = (db: number) => 10 + (hh - 28) * (1 - (db - dbLo) / (dbHi - dbLo));
    ctx.fillStyle = c.muted;
    ctx.font = '10px "IBM Plex Mono", monospace';
    for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
      ctx.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, X(f) - 6, hh - 3);
      ctx.strokeStyle = c.rule;
      ctx.beginPath();
      ctx.moveTo(X(f), 10);
      ctx.lineTo(X(f), hh - 18);
      ctx.stroke();
    }
    if (!an) {
      pSpec.meta.textContent = 'audio off';
      return;
    }
    const bins = an.frequencyBinCount;
    const data = bins <= spec.length ? spec.subarray(0, bins) : new Float32Array(bins);
    an.getFloatFrequencyData(data);
    const binHz = an.context.sampleRate / an.fftSize;
    ctx.strokeStyle = c.ink;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    let started = false;
    let lastX = -1;
    let acc = -Infinity;
    for (let i = 1; i < bins; i++) {
      const f = i * binHz;
      if (f < f0) continue;
      if (f > f1) break;
      const x = Math.round(X(f));
      acc = Math.max(acc, data[i]);
      if (x === lastX) continue;
      const y = Y(Math.max(dbLo, Math.min(dbHi, acc)));
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
      lastX = x;
      acc = -Infinity;
    }
    ctx.stroke();
    const fo = lastFocus;
    if (fo) {
      const fz = fo.f1 / Math.sqrt(1 + fo.B);
      for (let k = 1; k <= 60; k++) {
        const fk = k * fz * Math.sqrt(1 + fo.B * k * k);
        const fh = k * fo.f1;
        if (fh < f1) {
          ctx.strokeStyle = c.rule2;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(X(fh), 10);
          ctx.lineTo(X(fh), 16);
          ctx.stroke();
        }
        if (fk > f1) break;
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(X(fk), 17);
        ctx.lineTo(X(fk), 25);
        ctx.stroke();
      }
      pSpec.meta.textContent =
        family() === 'piano'
          ? `${midiName(fo.midi)} · B = ${fmtSci(fo.B)} · partial 10 is ${fmt(1200 * Math.log2(Math.sqrt(1 + fo.B * 100) / Math.sqrt(1 + fo.B)), 1)} ¢ sharp`
          : `${midiName(fo.midi)} · harmonic series of ${fmt(fo.f1, 1)} Hz`;
    } else pSpec.meta.textContent = '';
  }

  const loop = () => {
    const c = colors();
    drawString(c);
    drawHammer(c);
    drawBoard(c);
    drawSpectrum(c);
    raf = requestAnimationFrame(loop);
  };

  const attach = () => {
    if (!audio.piano || unsubVis) return;
    modeFreqs = audio.piano.modeFrequencies;
    syncControls(audio.piano.params as unknown as Record<string, number>);
    unsubVis = audio.piano.onVisual((v) => {
      frame = v;
      if (v.strike) strike = v.strike;
      if (v.modeFreqs) modeFreqs = v.modeFreqs;
    });
  };
  const unsubs: (() => void)[] = [];
  return {
    el,
    dock: true,
    mount() {
      attach();
      unsubs.push(audio.state.on(() => attach()));
      unsubs.push(audio.keysChanged.on(() => (modeFreqs = audio.piano?.modeFrequencies ?? modeFreqs)));
      unsubs.push(audio.instrumentChanged.on(applyInstrument));
      applyInstrument(audio.instrument);
      raf = requestAnimationFrame(loop);
    },
    unmount() {
      cancelAnimationFrame(raf);
      unsubVis?.();
      unsubVis = null;
      unsubs.forEach((u) => u());
    },
  };
}
