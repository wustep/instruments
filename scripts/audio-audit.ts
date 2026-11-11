// The audio audit: the same stimuli through every instrument (and the piano's two presets), measured.
// Range walks at pp/mf/ff, a fast legato and a fast detached passage, repeated notes, the extremes
// held, chords (and, for the piano, more notes than it has voices), controller swells sent as a file
// sends them, and a high note at 22.05/44.1/48/96 kHz for aliases. For each: peak, loudness (BS.1770),
// the limiter's deepest cut, clicks (scripts/audio-measure.ts), non-finite samples, DC left after the
// end, and the audio thread's cost per 128-frame block.
//   npx tsx scripts/audio-audit.ts --out <dir> [--engine <repo>/packages/engine/src/core/index.ts]
//       [--only grand,violin,…] [--stim walk-mf,…] [--wav <dir>] [--fs 48000]
// Writes <out>/audit.json (and WAVs into --wav, for plots and listening).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';
import { aliases, clicks, inharmonicDb, jumps, lufs, lufsMaxShort, nonFinite, peakDb, tailDc } from './audio-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts')));
const OUT = resolve(opt('--out', '.cache/audio-audit/now'));
const WAV = opt('--wav', '');
const ONLY = opt('--only', '').split(',').filter(Boolean);
const STIM = opt('--stim', '').split(',').filter(Boolean);
const FS = Number(opt('--fs', '48000'));
/** the piano's voices (the Orchestra gives a piano 48, two pianos 32 each: orchestra/ensemble.ts pianoVoices) */
const VOICES_N = Number(opt('--voices', '0'));
const eng = (await import(pathToFileURL(ENGINE).href)) as typeof import('../packages/engine/src/core/index.ts');
mkdirSync(OUT, { recursive: true });
if (WAV) mkdirSync(WAV, { recursive: true });

type Ev = { time: number; event: Record<string, unknown> };
const on = (time: number, midi: number, velocity: number): Ev => ({ time, event: { type: 'noteOn', midi, velocity } });
const off = (time: number, midi: number): Ev => ({ time, event: { type: 'noteOff', midi } });
const cc = (time: number, c: number, value: number): Ev => ({ time, event: { type: 'control', cc: c, value } });
const ped = (time: number, value: number): Ev => ({ time, event: { type: 'sustain', value } });

interface Who {
  name: string;
  instrument: string;
  preset?: string;
  lo: number;
  hi: number;
  poly: number;
}
const WHO: Who[] = [
  { name: 'grand', instrument: 'piano', preset: 'grand', lo: 21, hi: 108, poly: 88 },
  { name: 'upright', instrument: 'piano', preset: 'upright', lo: 21, hi: 108, poly: 88 },
  ...(['violin', 'viola', 'cello', 'bass'] as const).map((id) => ({ name: id, instrument: id, lo: eng.INSTRUMENT_INFO[id].lo, hi: eng.INSTRUMENT_INFO[id].hi, poly: 4 })),
  ...(['flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trumpet', 'trombone'] as const).map((id) => ({ name: id, instrument: id, lo: eng.INSTRUMENT_INFO[id].lo, hi: eng.INSTRUMENT_INFO[id].hi, poly: 1 })),
  { name: 'timpani', instrument: 'timpani', lo: 36, hi: 57, poly: 4 },
];

/** the stimuli for one instrument: name → [events, seconds] */
function stimuli(w: Who): Record<string, [Ev[], number]> {
  const s: Record<string, [Ev[], number]> = {};
  const mid = Math.round((w.lo + w.hi) / 2);
  const step = w.instrument === 'piano' ? 3 : 2;
  for (const [d, vel] of [['pp', 28], ['mf', 72], ['ff', 118]] as const) {
    const ev: Ev[] = [];
    let t = 0.1;
    for (let m = w.lo; m <= w.hi; m += step) {
      ev.push(on(t, m, vel), off(t + 0.4, m));
      t += 0.6;
    }
    s[`walk-${d}`] = [ev, t + 1.2];
  }
  {
    // a fast legato run (each note overlapping the next by 20 ms), then the same detached and faster
    const ev: Ev[] = [];
    let t = 0.1;
    const run = [0, 2, 4, 5, 7, 9, 11, 12, 14, 12, 11, 9, 7, 5, 4, 2, 0].map((k) => Math.min(w.hi, mid - 7 + k));
    for (const vel of [72, 112])
      for (const m of run) {
        ev.push(on(t, m, vel), off(t + 0.17, m));
        t += 0.15;
      }
    t += 0.4;
    for (const m of run) {
      ev.push(on(t, m, 90), off(t + 0.07, m));
      t += 0.1;
    }
    s.passage = [ev, t + 1.2];
  }
  {
    const ev: Ev[] = [];
    let t = 0.1;
    for (const [m, k] of [[mid, 12], [Math.min(w.hi, w.lo + 5), 8], [Math.max(w.lo, w.hi - 5), 8]] as const)
      for (let i = 0; i < k; i++) {
        ev.push(on(t, m, i % 2 ? 84 : 104), off(t + 0.085, m));
        t += 0.12;
      }
    s.repeat = [ev, t + 1.2];
  }
  {
    const ev: Ev[] = [];
    let t = 0.1;
    for (const m of [w.lo, w.hi])
      for (const vel of [24, 124]) {
        ev.push(on(t, m, vel), off(t + 1.4, m));
        t += 2;
      }
    s.extremes = [ev, t + 0.8];
  }
  {
    const ev: Ev[] = [];
    if (w.instrument === 'piano') {
      // pedal down: three ten-note clusters, then a run of 72 distinct keys 30 ms apart (more notes than
      // the piano has voices), the pedal let up at 5.5 s
      ev.push(ped(0, 1));
      [0.1, 0.6, 1.1].forEach((t, c) => {
        for (let k = 0; k < 10; k++) ev.push(on(t + k * 0.002, 28 + c * 3 + k * 7, 118));
      });
      for (let k = 0; k < 72; k++) ev.push(on(1.8 + k * 0.03, 30 + k, 110));
      ev.push(ped(5.5, 0));
      s.chord = [ev, 7.5];
    } else if (w.poly === 4) {
      // four notes at once (a chord across the strings / drums), then a fifth while they hold, then moving
      const ch = w.instrument === 'timpani' ? [38, 43, 48, 53] : [w.lo, w.lo + 7, w.lo + 14, w.lo + 21];
      for (const m of ch) ev.push(on(0.1, m, 112), off(1.6, m));
      ev.push(on(0.9, ch[2] + 2, 100), off(1.6, ch[2] + 2));
      let t = 2.0;
      for (let i = 0; i < 6; i++) {
        const a = ch[1] + (i % 3), b = ch[2] + (i % 3) + 1;
        ev.push(on(t, a, 90), on(t, b, 90), off(t + 0.3, a), off(t + 0.3, b));
        t += 0.32;
      }
      if (w.instrument === 'timpani') {
        // a roll on two drums, 12 strokes a second
        for (let i = 0; i < 30; i++) ev.push(on(t + 0.2 + i / 12, i % 2 ? 43 : 38, 70 + (i % 3) * 8));
        t += 3;
      }
      s.chord = [ev, t + 1.5];
    } else {
      // a chord asked of one wind (a file's staff two players share, sent whole), then let go together
      for (const m of [mid - 4, mid, mid + 3]) ev.push(on(0.1, m, 96), off(1.2, m));
      ev.push(on(1.6, mid, 96), on(1.62, mid + 4, 96), off(1.7, mid), off(2.4, mid + 4));
      s.chord = [ev, 3.6];
    }
  }
  {
    // a swell on a held note as a file sends it: CC11 in single steps every 30 ms, then CC_DYNAMICS in
    // single velocity steps
    const m = Math.round((w.lo * 2 + w.hi) / 3);
    const ev: Ev[] = [on(0.1, m, 64)];
    let t = 0.4;
    for (let v = 40; v <= 127; v += 1) ev.push(cc((t += 0.02), 11, v / 127));
    for (let v = 127; v >= 40; v -= 1) ev.push(cc((t += 0.02), 11, v / 127));
    ev.push(cc((t += 0.05), 11, -1));
    for (let v = 0; v <= 30; v++) ev.push(cc((t += 0.04), 131, v));
    for (let v = 30; v >= -30; v--) ev.push(cc((t += 0.04), 131, v));
    ev.push(off(t + 0.3, m));
    s.swell = [ev, t + 1.5];
  }
  return s;
}

/** Render with the cost of each 128-frame block and the limiter's deepest cut recorded */
function render(w: Who, events: Ev[], dur: number, fs: number) {
  const core = eng.createCore({ sampleRate: fs, instrument: w.instrument as never, preset: w.preset, maxVoices: VOICES_N || undefined });
  const lim = (core as unknown as { limiter?: { process: (L: Float64Array, R: Float64Array, n: number) => void; reduction: number } }).limiter;
  let minG = 1, cut = 0, calls = 0;
  if (lim) {
    const p = lim.process.bind(lim);
    lim.process = (L, R, n) => {
      p(L, R, n);
      calls++;
      if (lim.reduction < 0.999) cut++;
      if (lim.reduction < minG) minG = lim.reduction;
    };
  }
  const n = Math.ceil(dur * fs);
  const L = new Float32Array(n), R = new Float32Array(n);
  const base = core.frame;
  for (const e of events) core.schedule(e.event, base + Math.round(e.time * fs));
  const q = 128;
  const bl = new Float32Array(q), br = new Float32Array(q);
  const times: number[] = [];
  for (let i = 0; i < n; i += q) {
    const len = Math.min(q, n - i);
    const t0 = performance.now();
    core.process(bl, br, len);
    times.push(performance.now() - t0);
    L.set(len === q ? bl : bl.subarray(0, len), i);
    R.set(len === q ? br : br.subarray(0, len), i);
  }
  const budget = (q / fs) * 1000;
  const warm = times.slice(Math.min(times.length - 1, 40));
  const sorted = [...warm].sort((a, b) => a - b);
  const total = times.reduce((a, b) => a + b, 0);
  const worst = warm.indexOf(sorted[sorted.length - 1]) + Math.min(times.length - 1, 40);
  return {
    L,
    R,
    cpu: {
      pctRealTime: +((total / (dur * 1000)) * 100).toFixed(1),
      maxBlockMs: +sorted[sorted.length - 1].toFixed(3),
      maxBlockAt: +((worst * q) / fs).toFixed(3),
      p999BlockMs: +sorted[Math.floor(0.999 * (sorted.length - 1))].toFixed(3),
      overBudget: warm.filter((x) => x > budget).length,
      budgetMs: +budget.toFixed(3),
    },
    limiter: { minGainDb: +(20 * Math.log10(minG)).toFixed(2), cutFrac: +(cut / Math.max(1, calls)).toFixed(4) },
  };
}

const report: Record<string, Record<string, unknown>> = {};
for (const w of WHO) {
  if (ONLY.length && !ONLY.includes(w.name)) continue;
  report[w.name] = {};
  const st = stimuli(w);
  for (const [name, [events, dur]] of Object.entries(st)) {
    if (STIM.length && !STIM.includes(name)) continue;
    const r = render(w, events, dur, FS);
    const evs = events.map((e) => ({ t: e.time, type: e.event.type as string, midi: e.event.midi as number | undefined }));
    const cl = clicks(r.L, r.R, FS, evs);
    const jp = jumps(r.L, r.R, FS, evs);
    const kinds = { on: 0, off: 0, mid: 0 };
    for (const c of cl) kinds[c.kind]++;
    const row = {
      seconds: dur,
      peakDb: peakDb(r.L, r.R),
      lufs: +lufs(r.L, r.R, FS).toFixed(2),
      lufsMaxShort: +lufsMaxShort(r.L, r.R, FS).toFixed(2),
      limiter: r.limiter,
      nonFinite: nonFinite(r.L, r.R),
      tailDcDb: tailDc(r.L, r.R, FS),
      clicks: kinds,
      // one-sample jumps at note and controller events over the signal's own steps (>2: a discontinuity)
      jumpsOver2: jp.filter((j) => j.ratio > 2 && j.stepDb > -60).length,
      worstJumps: jp.slice(0, 5),
      worstClicks: [...cl].sort((a, b) => b.riseDb + b.hfDb / 4 - (a.riseDb + a.hfDb / 4)).slice(0, 8),
      cpu: r.cpu,
    };
    report[w.name][name] = row;
    if (WAV) writeFileSync(join(WAV, `${w.name}-${name}.wav`), encodeWav({ sampleRate: FS, channels: [r.L, r.R] }, 32));
    console.log(`${w.name.padEnd(9)} ${name.padEnd(9)} peak ${row.peakDb.toFixed(1).padStart(6)}  LUFS ${row.lufs.toFixed(1).padStart(6)}  lim ${row.limiter.minGainDb.toFixed(1).padStart(5)} dB (${(row.limiter.cutFrac * 100).toFixed(1)}%)  clicks on ${kinds.on} off ${kinds.off} mid ${kinds.mid}  jumps>2 ${row.jumpsOver2} (worst ${jp[0]?.ratio ?? 0})  cpu ${row.cpu.pctRealTime}% max ${row.cpu.maxBlockMs} ms${row.nonFinite ? `  NONFINITE ${row.nonFinite}` : ''}`);
  }
  if (!STIM.length || STIM.includes('alias')) {
    // a steady high note, ff and mf, at each rate: folded harmonics and the energy between harmonics
    const m = w.instrument === 'timpani' ? w.hi : w.hi - 4;
    const rows: Record<string, unknown> = {};
    for (const fs of [22050, 44100, 48000, 96000]) {
      for (const vel of [72, 118]) {
        const r = render(w, [on(0.05, m, vel), off(1.9, m)], 2.0, fs);
        const x = Float32Array.from(r.L, (v, i) => 0.5 * (v + r.R[i]));
        const f0 = 440 * Math.pow(2, (m - 69) / 12);
        const t0 = w.instrument === 'piano' || w.instrument === 'timpani' ? 0.15 : 0.8;
        rows[`${fs}-${vel}`] = { alias: aliases(x, fs, f0, t0, 0.9), inharmonicDb: inharmonicDb(x, fs, f0, t0, 0.9, Math.min(16000, 0.45 * fs)) };
        if (WAV && (fs === 44100 || fs === 96000) && vel === 118) writeFileSync(join(WAV, `${w.name}-alias-${fs}.wav`), encodeWav({ sampleRate: fs, channels: [r.L, r.R] }, 32));
      }
    }
    report[w.name].alias = { midi: m, ...rows };
    const a = rows as Record<string, { alias: { worstDb: number; atHz: number }; inharmonicDb: number }>;
    console.log(`${w.name.padEnd(9)} alias m${m}  ff: 22k ${a['22050-118'].alias.worstDb}@${a['22050-118'].alias.atHz}  44k ${a['44100-118'].alias.worstDb}@${a['44100-118'].alias.atHz}  48k ${a['48000-118'].alias.worstDb}  96k ${a['96000-118'].alias.worstDb}  inharm 44k ${a['44100-118'].inharmonicDb} / 96k ${a['96000-118'].inharmonicDb}`);
  }
  writeFileSync(join(OUT, 'audit.json'), JSON.stringify(report, null, 1));
}
writeFileSync(join(OUT, 'audit.json'), JSON.stringify(report, null, 1));
