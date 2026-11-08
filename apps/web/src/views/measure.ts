// Measurements: model vs. reference recordings, from offline analysis
// (scripts/calibrate.ts). Reference = Iowa MIS Steinway model B.

import { midiName, renderOffline } from '@piano-model/engine';
import { chart, dataTable, legend, type Series } from '../ui/chart.ts';
import { fmt, fmtSci, h, type View } from '../ui/dom.ts';

type Dyn = 'pp' | 'mf' | 'ff';
interface Take {
  f1: number;
  B: number;
  np: number;
  fitc: number;
  decays: { k: number; f: number; e: number | null; l: number | null }[];
  levels: number[];
  rmsDb: number;
  peakDb: number;
  attackMs: number;
  centroid: number;
  ltas: number[];
  floor: number[];
}
interface KeyRow {
  midi: number;
  targetB: number;
  targetF1: number;
  ref: Record<Dyn, Take | null>;
  model: Record<Dyn, Take | null>;
}
interface Summary {
  tuningRmsCents: number;
  bLog10Rms: number;
  levelErrDb: Record<Dyn, number>;
  ltasBandRmsDb: number;
  decayByRegister: Record<string, { early: number; late: number }>;
  brightnessContrastErr: { rmsDbPerPartial: number; biasDbPerPartial: number };
}
interface Data {
  generated: string;
  velocities: Record<Dyn, number>;
  gainOffsetDb: number;
  refPitchOffsetCents: number;
  summary: Summary;
  keys: KeyRow[];
  hammer: { midi: number; pp: number; mf: number; ff: number; peakFf: number }[];
  curves: { midi: number; B: number; cents: number }[];
  rounds: { label: string; summary: Summary }[];
}

const THIRD_OCT = [31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000];
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const cents = (a: number, b: number) => 1200 * Math.log2(a / b);
const KEY_TICKS = [21, 36, 48, 60, 72, 84, 96, 108];
const keyAxis = (label = 'key') => ({ label, min: 19, max: 110, ticks: KEY_TICKS, fmt: (m: number) => midiName(m) });
const ok = (t: Take | null) => (t && t.np >= 4 && t.fitc < 3 ? t : null);
const best = (r: Record<Dyn, Take | null>) => ok(r.ff) ?? ok(r.mf) ?? ok(r.pp);
const median = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

function fig(title: string, sub: string, body: HTMLElement[], caption: string, wide = false): HTMLElement {
  return h('figure', { class: wide ? 'wide' : '' }, h('h3', {}, title), h('div', { class: 'fig-sub' }, sub), body, h('figcaption', {}, caption));
}

const REF_LEGEND = () =>
  legend([
    { name: 'Steinway B recording', color: 'ref', kind: 'dot' },
    { name: 'model', color: 'model', kind: 'line' },
  ]);

export function measureView(): View {
  const root = h('div', { class: 'view' });
  const status = h('p', { class: 'prose' }, 'Loading measurements…');
  root.append(status);

  void (async () => {
    let d: Data;
    try {
      d = await (await fetch('/data/calibration.json')).json();
    } catch {
      status.textContent = 'Measurement data is missing; run pnpm calibrate.';
      return;
    }
    status.remove();
    root.append(...build(d));
  })();
  return { el: root, dock: false };
}

function build(d: Data): HTMLElement[] {
  const s = d.summary;
  const dr = s.decayByRegister;
  const out: HTMLElement[] = [];
  out.push(
    h(
      'div',
      { class: 'measure-head' },
      h(
        'div',
        {},
        h('h2', {}, 'Model against a real piano'),
        h(
          'div',
          { class: 'prose', style: 'margin-top:14px' },
          h(
            'p',
            {},
            `The reference is the University of Iowa recording of a Steinway model B (2001): ${d.keys.length} keys at pp, mf and ff, two microphones 8″ above the strings, fixed gain. The same analysis runs on the reference files and on dry renders of the model at the same keys (pp, mf, ff → MIDI velocity ${d.velocities.pp}, ${d.velocities.mf}, ${d.velocities.ff}). The recordings are analysed offline and are not part of the instrument.`,
          ),
          h('p', {}, 'Numbers are per-register medians where single notes are too idiosyncratic to compare — real pianos vary a lot from one note to the next. These measurements cover the piano only; the violin, viola, cello and flute are physically modelled but not yet calibrated against recordings.'),
        ),
      ),
      h(
        'div',
        { class: 'tiles' },
        tile(`${fmt(s.tuningRmsCents, 1)} ¢`, 'RMS deviation from the reference piano’s stretch tuning'),
        tile(`${fmt((Math.pow(10, s.bLog10Rms) - 1) * 100, 0)} %`, 'RMS error of the inharmonicity coefficient B'),
        tile(`${fmt(s.ltasBandRmsDb, 1)} dB`, 'third-octave spectrum error at mf (bands above the noise floor)'),
        tile(`${fmt(s.levelErrDb.mf, 1)} dB`, 'per-note loudness error at mf'),
      ),
    ),
  );

  const figs = h('div', { class: 'figs' });
  out.push(figs);

  // ---- inharmonicity
  {
    const ref: Series = { name: 'recording', color: 'ref', kind: 'dots', points: d.keys.map((k) => ({ x: k.midi, y: best(k.ref)?.B ?? NaN })).filter((p) => p.y > 1e-6), fmt: fmtSci };
    const model: Series = { name: 'model', color: 'model', kind: 'line', points: d.curves.map((c) => ({ x: c.midi, y: c.B })), fmt: fmtSci };
    figs.append(
      fig(
        'Inharmonicity',
        'B in f_k = k·f₀·√(1 + B k²), log scale',
        [REF_LEGEND(), chart({ x: keyAxis(), y: { label: 'B', min: 6e-5, max: 4e-2, log: true, ticks: [1e-4, 1e-3, 1e-2], fmt: (v) => (v >= 1e-3 ? v.toFixed(3) : v.toExponential(0)) }, series: [model, ref], xName: midiName }), dataTable(['key', 'recording', 'model'], d.keys.map((k) => [midiName(k.midi), fmtSci(best(k.ref)?.B ?? NaN), fmtSci(k.targetB)]))],
        'Stiffness makes upper partials sharp. B is lowest in the tenor and rises steeply towards the treble; the model’s curve is fitted to the measured values, and its dispersion filters reproduce each key’s partial series to within a fraction of a cent (tests).',
      ),
    );
  }
  // ---- tuning stretch
  {
    const ref: Series = {
      name: 'recording',
      color: 'ref',
      kind: 'dots',
      points: d.keys
        .map((k) => {
          const b = best(k.ref);
          return { x: k.midi, y: b ? cents(b.f1, et(k.midi)) - d.refPitchOffsetCents : NaN };
        })
        .filter((p) => Math.abs(p.y) < 40),
      fmt: (v) => `${v >= 0 ? '+' : ''}${fmt(v, 1)} ¢`,
    };
    const model: Series = { name: 'model', color: 'model', kind: 'line', points: d.curves.map((c) => ({ x: c.midi, y: c.cents })), fmt: (v) => `${v >= 0 ? '+' : ''}${fmt(v, 1)} ¢` };
    figs.append(
      fig(
        'Stretch tuning',
        'partial 1 relative to equal temperament, cents',
        [REF_LEGEND(), chart({ x: keyAxis(), y: { label: 'cents', min: -25, max: 35, ticks: [-20, -10, 0, 10, 20, 30], fmt: (v) => `${v > 0 ? '+' : ''}${v}` }, series: [model, ref], refLine: 0, xName: midiName })],
        `The model is tuned from its own inharmonicity the way an aural tuner works (2:1 octaves up, 4:2 and 6:3 down). The recorded piano sits ${fmt(d.refPitchOffsetCents, 1)} ¢ sharp of A440 overall; that offset is removed. A0 and the top keys of the recording are left out where its partials cannot be fitted reliably.`,
      ),
    );
  }
  // ---- decay
  {
    const mk = (which: 'e' | 'l'): HTMLElement => {
      const pick = (t: Take | null) => t?.decays.find((x) => x.k === 1)?.[which] ?? NaN;
      const take = (k: KeyRow, src: 'ref' | 'model') => (k[src].mf ? k[src].mf : k[src].ff);
      const ref: Series = { name: 'recording', color: 'ref', kind: 'dots', points: d.keys.map((k) => ({ x: k.midi, y: pick(take(k, 'ref')) })), fmt: (v) => `${fmt(v, 1)} s` };
      const model: Series = { name: 'model', color: 'model', kind: 'line+dots', points: d.keys.map((k) => ({ x: k.midi, y: pick(take(k, 'model')) })), fmt: (v) => `${fmt(v, 1)} s` };
      return chart({ title: which === 'e' ? 'prompt decay (EDT × 6)' : 'aftersound (−15 → −35 dB)', x: keyAxis(), y: { label: 'T60 (s)', min: 0.2, max: 120, log: true, ticks: [0.3, 1, 3, 10, 30, 100], fmt: (v) => String(v) }, series: [ref, model], xName: midiName, width: 1100, height: 260 });
    };
    const reg = Object.entries(dr)
      .map(([name, v]) => `${name}: ×${fmt(v.early, 2)} prompt, ×${fmt(v.late, 2)} late`)
      .join('; ');
    figs.append(
      fig(
        'Decay of the first partial',
        'T60 at mf, log scale; double decay from coupled unison strings',
        [REF_LEGEND(), mk('e'), mk('l')],
        `Median model/recording ratio over partials 1–3 by register — ${reg}. The tenor's prompt decay is still too slow and the bass aftersound too short; per-note scatter in the recording itself is a factor of ten.`,
        true,
      ),
    );
  }
  // ---- spectra vs dynamics, small multiples
  {
    const notes = [37, 61, 85].filter((m) => d.keys.some((k) => k.midi === m));
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 14px' });
    for (const m of notes) {
      const k = d.keys.find((x) => x.midi === m)!;
      for (const dyn of ['pp', 'mf', 'ff'] as Dyn[]) {
        const r = k.ref[dyn];
        const mo = k.model[dyn];
        const n = 14;
        const ref: Series = { name: 'recording', color: 'ref', kind: 'dots', points: (r?.levels ?? []).slice(0, n).map((y, i) => ({ x: i + 1, y: y < -100 ? NaN : y })), fmt: (v) => `${fmt(v, 0)} dB` };
        const model: Series = { name: 'model', color: 'model', kind: 'line+dots', points: (mo?.levels ?? []).slice(0, n).map((y, i) => ({ x: i + 1, y: y + d.gainOffsetDb })), fmt: (v) => `${fmt(v, 0)} dB` };
        grid.append(chart({ title: `${midiName(m)} ${dyn}`, x: { label: 'partial', min: 0, max: n + 1, ticks: [1, 4, 8, 12], fmt: (v) => String(v) }, y: { label: 'dB', min: -110, max: -10, ticks: [-100, -70, -40, -10], fmt: (v) => String(v) }, series: [ref, model], width: 300, height: 190, xName: (x) => `partial ${x}` }));
      }
    }
    figs.append(
      fig(
        'Partial levels across dynamics',
        'levels 60–160 ms after the attack, dB re full scale (one global gain), recording points below −100 dB are noise and omitted',
        [REF_LEGEND(), grid],
        `The nonlinear felt makes loud notes brighter: upper partials gain more than the fundamental from pp to ff. The model reproduces the direction and much of the size, but brightens about ${fmt(-d.summary.brightnessContrastErr.biasDbPerPartial, 1)} dB per partial less than the Steinway. Individual partials also differ by soundboard colouration — the model's board is plausible, not this board.`,
        true,
      ),
    );
  }
  // ---- loudness by register and dynamic
  {
    const mk = (dyn: Dyn) => {
      const ref: Series = { name: 'recording', color: 'ref', kind: 'dots', points: d.keys.map((k) => ({ x: k.midi, y: k.ref[dyn]?.rmsDb ?? NaN })), fmt: (v) => `${fmt(v, 1)} dB` };
      const model: Series = { name: 'model', color: 'model', kind: 'line+dots', points: d.keys.map((k) => ({ x: k.midi, y: (k.model[dyn]?.rmsDb ?? NaN) + d.gainOffsetDb })), fmt: (v) => `${fmt(v, 1)} dB` };
      return chart({ title: dyn, x: keyAxis(), y: { label: 'dB', min: -75, max: -10, ticks: [-70, -55, -40, -25, -10], fmt: (v) => String(v) }, series: [ref, model], xName: midiName, width: 360, height: 210 });
    };
    const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px 14px' }, mk('pp'), mk('mf'), mk('ff'));
    figs.append(
      fig(
        'Loudness',
        'RMS of the first 0.5 s, dB re full scale; one global gain fitted at mf',
        [REF_LEGEND(), grid],
        `Per-note error ${fmt(d.summary.levelErrDb.pp, 1)} / ${fmt(d.summary.levelErrDb.mf, 1)} / ${fmt(d.summary.levelErrDb.ff, 1)} dB RMS at pp / mf / ff. The recording's pp notes are single human performances and swing by ±10 dB between neighbours; the model's dynamic range follows the hammer-velocity mapping fitted to the median.`,
        true,
      ),
    );
  }
  // ---- third-octave spectrum: median per-key difference model − recording
  {
    const bands = THIRD_OCT.map((f, i) => {
      const ds: number[] = [];
      for (const k of d.keys) {
        const r = k.ref.mf;
        const mo = k.model.mf;
        if (!r || !mo || r.ltas[i] - r.floor[i] < 12) continue;
        ds.push(mo.ltas[i] + d.gainOffsetDb - r.ltas[i]);
      }
      return { f, d: ds.length >= 3 ? median(ds) : NaN, n: ds.length };
    });
    const lx = (f: number) => Math.log2(f / 1000);
    const diff: Series = { name: 'model − recording', color: 'model', kind: 'line+dots', points: bands.map((b) => ({ x: lx(b.f), y: b.d })), fmt: (v) => `${v >= 0 ? '+' : ''}${fmt(v, 1)} dB` };
    const fName = (x: number) => {
      const f = 1000 * Math.pow(2, x);
      return f >= 1000 ? `${fmt(f / 1000, 1)} kHz` : `${fmt(f, 0)} Hz`;
    };
    figs.append(
      fig(
        'Spectral balance',
        'third-octave level, model − recording at mf: median over keys of the per-key difference, bands ≥ 12 dB above the recording’s noise floor',
        [
          chart({ x: { label: 'frequency', min: lx(28), max: lx(5600), ticks: [lx(50), lx(100), lx(200), lx(500), lx(1000), lx(2000), lx(5000)], fmt: fName }, y: { label: 'dB', min: -15, max: 15, ticks: [-15, -10, -5, 0, 5, 10, 15], fmt: (v) => `${v > 0 ? '+' : ''}${v}` }, series: [diff], refLine: 0, xName: fName }),
          dataTable(['band', 'model − recording', 'keys'], bands.map((b) => [fName(lx(b.f)), Number.isFinite(b.d) ? `${fmt(b.d, 1)} dB` : '–', b.n])),
        ],
        `Zero is a perfect match. The soundboard modes, radiation and microphone response set this balance; a fitted output EQ closes most of the gap (${fmt(d.summary.ltasBandRmsDb, 1)} dB RMS remains). Above about 4 kHz the recording is dominated by its own hiss, so it is not compared there.`,
      ),
    );
  }
  // ---- hammer
  {
    const ser = (dyn: Dyn, color: 'model' | 'ref' | 'muted', name: string): Series => ({ name, color, kind: 'line', points: d.hammer.map((x) => ({ x: x.midi, y: x[dyn] })), fmt: (v) => `${fmt(v, 2)} ms` });
    figs.append(
      fig(
        'Hammer contact time',
        'model only: duration of felt–string contact, ms',
        [
          legend([
            { name: 'pp', color: 'muted', kind: 'line' },
            { name: 'ff', color: 'model', kind: 'line' },
          ]),
          chart({ x: keyAxis(), y: { label: 'ms', min: 0, max: 5, ticks: [0, 1, 2, 3, 4, 5], fmt: (v) => String(v) }, series: [ser('pp', 'muted', 'pp'), ser('ff', 'model', 'ff')], xName: midiName }),
        ],
        'No contact force was measured on the Steinway, so this is checked against the literature instead: Askenfelt & Jansson report about 4 ms in the bass, 2 ms around C4 and under 1 ms at the top, shorter at higher velocity — the same shape the model produces from hammer mass, felt stiffness and string impedance.',
      ),
    );
  }
  // ---- listening
  out.push(listening(d));
  // ---- rounds
  out.push(roundsTable(d));
  out.push(shortfalls());
  return out;
}

function tile(v: string, s: string): HTMLElement {
  return h('div', { class: 'tile' }, h('div', { class: 'v' }, v), h('div', { class: 's' }, s));
}

function listening(d: Data): HTMLElement {
  const items: { midi: number; dyn: Dyn; file: string }[] = [
    { midi: 21, dyn: 'ff', file: 'iowa-steinway-b-ff-A0.mp3' },
    { midi: 41, dyn: 'mf', file: 'iowa-steinway-b-mf-F2.mp3' },
    { midi: 61, dyn: 'mf', file: 'iowa-steinway-b-mf-Db4.mp3' },
    { midi: 69, dyn: 'pp', file: 'iowa-steinway-b-pp-A4.mp3' },
    { midi: 77, dyn: 'ff', file: 'iowa-steinway-b-ff-F5.mp3' },
    { midi: 97, dyn: 'mf', file: 'iowa-steinway-b-mf-Db7.mp3' },
  ];
  let ctx: AudioContext | null = null;
  let current: { stop: () => void; btn: HTMLElement } | null = null;
  const stop = () => {
    current?.stop();
    current?.btn.classList.remove('playing');
    current = null;
  };
  const playRef = (file: string, btn: HTMLElement) => {
    stop();
    const a = new Audio(`/ref/${file}`);
    void a.play();
    btn.classList.add('playing');
    a.onended = () => btn.classList.remove('playing');
    current = { stop: () => a.pause(), btn };
  };
  const playModel = async (midi: number, dyn: Dyn, btn: HTMLElement) => {
    stop();
    btn.textContent = 'rendering…';
    const buf = await renderOffline({
      sampleRate: 44100,
      duration: 5,
      params: { room: 0, lid: 1 },
      events: [{ time: 0.05, event: { type: 'noteOn', midi, velocity: d.velocities[dyn] } }],
    });
    btn.textContent = 'model';
    ctx ??= new AudioContext();
    await ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
    btn.classList.add('playing');
    src.onended = () => btn.classList.remove('playing');
    current = { stop: () => src.stop(), btn };
  };
  return h(
    'section',
    { class: 'shortfalls' },
    h('h2', {}, 'Listen side by side'),
    h(
      'p',
      { class: 'prose', style: 'margin-top:10px' },
      'Each pair plays a five-second excerpt of the Iowa recording, then the model rendered on the spot in your browser by the same AudioWorklet that you play (dry, lid open). The excerpts are clearly the recording, not the instrument: they come from the University of Iowa Musical Instrument Samples, whose terms allow use “for any projects, without restrictions”, and they are used only here.',
    ),
    h(
      'div',
      { class: 'ab' },
      items.map((it) => {
        const rb = h('button', {}, 'recording');
        const mb = h('button', {}, 'model');
        rb.addEventListener('click', () => playRef(it.file, rb));
        mb.addEventListener('click', () => void playModel(it.midi, it.dyn, mb));
        return h('div', { class: 'ab-item' }, h('div', { class: 't' }, `${midiName(it.midi)} · ${it.dyn}`), h('div', { class: 'btns' }, rb, mb));
      }),
    ),
    h('p', { class: 'hint', style: 'margin-top:12px' }, 'Reference: Steinway & Sons model B, University of Iowa Electronic Music Studios, 2001 — theremin.music.uiowa.edu.'),
  );
}

function roundsTable(d: Data): HTMLElement {
  const pick = d.rounds.filter((_, i, a) => i === 0 || i === a.length - 1 || /iteration 1\b|final|before/.test(a[i].label));
  const regs = ['A0-B1', 'C2-B3', 'C4-B5', 'C6-C8'];
  return h(
    'section',
    { class: 'shortfalls' },
    h('h2', {}, 'Calibration rounds'),
    h('p', { class: 'prose', style: 'margin-top:10px' }, 'Render, analyse, compare, adjust, re-measure. Decay columns are model/recording T60 ratios (1.00 is perfect) for the bass, tenor, middle and treble. Details in docs/CALIBRATION.md.'),
    h(
      'div',
      { style: 'overflow-x:auto' },
      h(
        'table',
        { class: 'rounds' },
        h('thead', {}, h('tr', {}, ['round', 'tuning ¢', 'B err', 'prompt T60 ratio', 'late T60 ratio', 'level dB (mf)', '⅓-oct dB'].map((c) => h('th', {}, c)))),
        h(
          'tbody',
          {},
          pick.map((r) => {
            const s = r.summary;
            const dr = s.decayByRegister;
            return h(
              'tr',
              {},
              h('td', {}, r.label),
              h('td', {}, fmt(s.tuningRmsCents, 1)),
              h('td', {}, `${fmt((Math.pow(10, s.bLog10Rms) - 1) * 100, 0)}%`),
              h('td', {}, dr ? regs.map((g) => fmt(dr[g]?.early ?? NaN, 2)).join(' ') : '–'),
              h('td', {}, dr ? regs.map((g) => fmt(dr[g]?.late ?? NaN, 2)).join(' ') : '–'),
              h('td', {}, fmt(s.levelErrDb.mf, 1)),
              h('td', {}, fmt(s.ltasBandRmsDb, 1)),
            );
          }),
        ),
      ),
    ),
  );
}

function shortfalls(): HTMLElement {
  return h(
    'section',
    { class: 'shortfalls' },
    h('h2', {}, 'Where it falls short'),
    h(
      'div',
      { class: 'prose', style: 'margin-top:10px' },
      h(
        'ul',
        {},
        h('li', {}, h('strong', {}, 'Tenor decay. '), 'Notes from C2 to B3 lose their first 10 dB about 2.5 times more slowly than the Steinway, while their aftersound is close. One bridge parameter per register cannot fix both slopes; the missing mechanism is most likely the second (horizontal) polarisation of each string, which the model omits for cost.'),
        h('li', {}, h('strong', {}, 'Bass sustain. '), 'The lowest octave’s aftersound is about two-thirds as long as the recording’s even with very low string losses — the bass bridge still drains too much energy into the soundboard.'),
        h('li', {}, h('strong', {}, 'Brightness range. '), 'From pp to ff the model brightens less than the real hammers do. Real felt stiffens with the rate of compression (Stulov’s relaxation model); the model uses a simpler Hunt–Crossley law.'),
        h('li', {}, h('strong', {}, 'Soundboard. '), 'About 150 modes with plausible density and damping, driven at three bridge zones — not a measured board. It colours individual partials differently from the Steinway; above 3.2 kHz radiation is a smoothed statistical path.'),
        h('li', {}, h('strong', {}, 'Attack. '), 'There is no key-travel delay (the hammer starts 0.4 mm from the string) and the mechanical noises — key bottoming, damper felt, release thump — are short synthetic force pulses into the soundboard rather than measured action noise.'),
        h('li', {}, h('strong', {}, 'Phantom partials '), 'come from a simple squared-force model through two longitudinal resonances, not a longitudinal waveguide; their levels are not calibrated against measurements.'),
        h('li', {}, h('strong', {}, 'Room. '), 'The listening room and lid are a small feedback-delay reverb and a shelf filter, not physics.'),
      ),
    ),
  );
}
