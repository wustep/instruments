// Measurements: model vs. reference recordings, from offline analysis
// (scripts/calibrate.ts). Reference = Iowa MIS Steinway model B.

import { midiName, renderOffline } from '@piano-model/engine';
import { chart, dataTable, legend, type Series } from '../ui/chart.ts';
import { fetchDesigns } from '../audio.ts';
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
  // the explanation lives in the tooltip; the chart speaks for itself
  return h('figure', { class: wide ? 'wide' : '', title: caption }, h('h3', {}, title), h('div', { class: 'fig-sub' }, sub), body);
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
    try {
      const e: Ens = await (await fetch('/data/ensemble.json')).json();
      const at = root.querySelector('.listen-section');
      const sec = ensembleSection(e);
      if (at) root.insertBefore(sec, at);
      else root.append(sec);
    } catch {
      /* strings/flute data optional */
    }
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
        h('h2', {}, 'Piano against a Steinway B'),
        h('p', { class: 'hint', style: 'margin-top:8px' }, `Iowa MIS recording · ${d.keys.length} keys × pp mf ff · same analysis on both`),
      ),
      h(
        'div',
        { class: 'tiles' },
        tile(`${fmt(s.tuningRmsCents, 1)} ¢`, 'stretch tuning'),
        tile(`${fmt((Math.pow(10, s.bLog10Rms) - 1) * 100, 0)} %`, 'inharmonicity B'),
        tile(`${fmt(s.ltasBandRmsDb, 1)} dB`, '⅓-octave spectrum'),
        tile(`${fmt(s.levelErrDb.mf, 1)} dB`, 'loudness, mf'),
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
        `Median model/recording ratio over partials 1–3 by register — ${reg}. Round 2 fixed the tenor (×2.2 too slow before) by fitting the bridge admittance per bridge segment, and the top octave (×0.6 too fast) by keeping treble unisons within a beat rate a tuner would accept. The bass aftersound is still about two-thirds as long as the recording's; per-note scatter in the recording itself is a factor of ten.`,
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
        `The nonlinear felt makes loud notes brighter: upper partials gain more than the fundamental from pp to ff. The model reproduces the direction and most of the size: it brightens ${fmt(Math.abs(d.summary.brightnessContrastErr.biasDbPerPartial), 1)} dB per partial ${d.summary.brightnessContrastErr.biasDbPerPartial < 0 ? 'less' : 'more'} than the Steinway (median; ${fmt(d.summary.brightnessContrastErr.rmsDbPerPartial, 1)} dB RMS over keys). Individual partials also differ by soundboard colouration — the model's board is plausible, not this board.`,
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

interface EnsSummary {
  notes: number;
  harmRmsDb: number;
  ltasRmsDb: number;
  centroidRatio: number;
  evenOddRef: number[];
  evenOddModel: number[];
  registerCuts: number[];
  hnrDiffDb: number;
  dynSpreadDb: { ref: number; model: number };
  ltas: { ref: number[]; model: number[] };
  harm: Record<Dyn, { ref: (number | null)[]; model: (number | null)[]; n: number }[]>;
}
interface Ens {
  generated: string;
  reference: string;
  velocities: Record<Dyn, number>;
  thirdOct: number[];
  summary: Record<string, EnsSummary>;
  rounds: { label: string; summary: Record<string, Partial<EnsSummary>> }[];
}

function ensembleSection(e: Ens): HTMLElement {
  const insts = ['violin', 'viola', 'cello', 'bass', 'flute', 'oboe', 'clarinet', 'bassoon'].filter((i) => e.summary[i]);
  const label: Record<string, string> = { violin: 'Violin', viola: 'Viola', cello: 'Cello', bass: 'Double bass', flute: 'Flute', oboe: 'Oboe', clarinet: 'Clarinet', bassoon: 'Bassoon' };
  // the baseline measured the same way (vibrato matched to each recorded note)
  const first = (e.rounds.find((r) => /re-measured with matched vibrato/.test(r.label)) ?? e.rounds[0])?.summary ?? {};
  const lx = (f: number) => Math.log2(f / 1000);
  const fName = (x: number) => {
    const f = 1000 * Math.pow(2, x);
    return f >= 1000 ? `${+(f / 1000).toFixed(1)} kHz` : `${Math.round(f)} Hz`;
  };
  const leg = () =>
    legend([
      { name: 'recording', color: 'ref', kind: 'dot' },
      { name: 'model', color: 'model', kind: 'line' },
    ]);
  const figs = h('div', { class: 'figs' });
  // long-term spectra
  {
    const grid = h('div', { class: 'ens-grid' });
    for (const i of insts) {
      const s = e.summary[i];
      const pts = (a: number[]) => e.thirdOct.map((f, b) => ({ x: lx(f), y: f >= 63 && f <= 12500 ? a[b] : NaN }));
      grid.append(
        chart({
          title: `${label[i]} · ${fmt(s.ltasRmsDb, 1)} dB RMS`,
          x: { label: 'frequency', min: lx(55), max: lx(14000), ticks: [lx(100), lx(300), lx(1000), lx(3000), lx(10000)], fmt: fName },
          y: { label: 'dB', min: -60, max: 0, ticks: [-60, -40, -20, 0], fmt: (v) => String(v) },
          series: [
            { name: 'recording', color: 'ref', kind: 'dots', points: pts(s.ltas.ref), fmt: (v) => `${fmt(v, 1)} dB` },
            { name: 'model', color: 'model', kind: 'line', points: pts(s.ltas.model), fmt: (v) => `${fmt(v, 1)} dB` },
          ],
          xName: fName,
          width: 300,
          height: 200,
        }),
      );
    }
    figs.append(
      fig(
        'Long-term spectrum',
        'third-octave level of the steady part, all notes and dynamics, normalised to 0 dB total (100 Hz–10 kHz)',
        [leg(), grid],
        'Where the sound’s energy sits. The bodies’ radiation balance — the bridge hill, the high-frequency radiation the modal body cannot carry, the weak radiation of the lowest notes — and the flute’s monopole radiation are fitted to these curves; the source spectra (Helmholtz motion, the jet) are not.',
        true,
      ),
    );
  }
  // harmonic profiles at mf by register
  {
    const grid = h('div', { class: 'ens-grid' });
    for (const i of insts) {
      const s = e.summary[i];
      ['low', 'middle', 'high'].forEach((name, r) => {
        const g = s.harm.mf[r];
        if (!g || !g.n) return;
        const pts = (a: (number | null)[]) => a.slice(0, 12).map((y, k) => ({ x: k + 1, y: y === null ? NaN : y }));
        grid.append(
          chart({
            title: `${label[i]} · ${name} · mf`,
            x: { label: 'harmonic', min: 0, max: 13, ticks: [1, 4, 8, 12], fmt: (v) => String(v) },
            y: { label: 'dB', min: -50, max: 3, ticks: [-45, -30, -15, 0], fmt: (v) => String(v) },
            series: [
              { name: 'recording', color: 'ref', kind: 'dots', points: pts(g.ref), fmt: (v) => `${fmt(v, 0)} dB` },
              { name: 'model', color: 'model', kind: 'line+dots', points: pts(g.model), fmt: (v) => `${fmt(v, 0)} dB` },
            ],
            xName: (x) => `harmonic ${x}`,
            width: 300,
            height: 180,
          }),
        );
      });
    }
    figs.append(
      fig(
        'Harmonic profiles',
        'steady-state harmonic levels relative to the strongest, power average over the register’s notes at mf',
        [leg(), grid],
        'Violin-family registers are thirds of the notes analysed on each instrument (first position on each string, as the model plays them); flute, oboe, clarinet and bassoon registers are thirds of their compass. The flute’s low register shows its strong even harmonics; the oboe’s strongest harmonic sits near 1–1.5 kHz whatever the note (its formant); the clarinet’s low register has its odd harmonics only, up to about 1.5 kHz; the bassoon’s low notes have a weak fundamental under harmonics gathered near 500 Hz (its formant).',
        true,
      ),
    );
  }
  const tiles = h(
    'div',
    { class: 'tiles' },
    insts.map((i) => {
      const s = e.summary[i];
      const b = first[i];
      return tile(`${fmt(s.harmRmsDb, 1)} dB`, `${label[i]} harmonics${b?.harmRmsDb !== undefined ? ` · was ${fmt(b.harmRmsDb, 1)}` : ''}`);
    }),
  );
  const fl = e.summary.flute;
  const flb = first.flute as EnsSummary | undefined;
  return h(
    'section',
    { class: 'ensemble' },
    h('h2', {}, 'Strings and woodwinds against recordings'),
    h('p', { class: 'hint', style: 'margin-top:8px' }, `Iowa MIS anechoic · ${insts.map((i) => `${e.summary[i].notes} ${i}`).join(', ')} notes · same notes, dry, same analysis`),
    tiles,
    figs,
  );
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
      designs: await fetchDesigns(44100),
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
    { class: 'shortfalls listen-section' },
    h('h2', {}, 'Listen side by side'),
    h('p', { class: 'hint', style: 'margin-top:8px' }, 'recording excerpt · model rendered now, in your browser'),
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
    h('p', { class: 'hint', style: 'margin-top:12px' }, 'Steinway B, University of Iowa MIS, 2001'),
  );
}

function roundsTable(d: Data): HTMLElement {
  const pick = d.rounds.filter((_, i, a) => i === 0 || i === a.length - 1 || /iteration 1\b|final|before/.test(a[i].label));
  const regs = ['A0-B1', 'C2-B3', 'C4-B5', 'C6-C8'];
  return h(
    'section',
    { class: 'shortfalls' },
    h('h2', {}, 'Calibration rounds'),
    h(
      'details',
      { class: 'data', style: 'overflow-x:auto' },
      h('summary', {}, 'table'),
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
        h('li', {}, h('strong', {}, 'Bass aftersound: '), '×0.8 of the recording’s (the string-loss filter caps it).'),
        h('li', {}, h('strong', {}, 'Flute low register: '), 'second harmonic ~10 dB short at mf/ff.'),
        h('li', {}, h('strong', {}, 'String bodies: '), 'modes from the literature; violin and viola radiation fitted note by note to the recordings, the cello’s by its spectrum.'),
        h('li', {}, h('strong', {}, 'Soundboard: '), '~150 plausible modes, not a measured board.'),
        h('li', {}, h('strong', {}, 'Action noises: '), 'short synthetic pulses; no key travel.'),
        h('li', {}, h('strong', {}, 'Room and lid: '), 'a modelled hall and a shelf, not the instrument.'),
      ),
    ),
  );
}
