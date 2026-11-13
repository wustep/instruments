// A woodwind's vibrato, read off held notes: the University of Iowa MIS flute played with vibrato (fetched to
// .cache/iowa-vib by hand: Flute.vib.{pp,mf,ff}.B3B4, mf/ff.C5B5, mf.C6B6; analysis only, never committed),
// the oboe and bassoon runs (scripts/ensemble-refs.ts), or the engine's own notes (--model). Per held note:
//   pitch: the vibrato's depth (cents, the amplitude of the best sine 3.5–9 Hz) and its rate;
//   level: how far the level swings at that rate (dB, an amplitude);
//   from cycle to cycle: how far one cycle's length and one cycle's swing differ from the next (%: a
//     generator 0), and how much of the pitch's movement is one sine (a generator: 100 %);
//   how soon after the note begins the vibrato is at half its depth (s).
// A note's held part is from 0.25 s after it begins to 0.2 s before it ends.
//   npx tsx scripts/winds-vibrato.ts [--instrument flute,oboe,bassoon] [--model] [--params '{"human":1}'] [--vel 70] [--player 0]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeWav, segmentNotes, spectrum } from '../packages/engine/src/analysis/index.ts';
import { INSTRUMENT_INFO, renderInstrument, type InstrumentId } from '../packages/engine/src/core/index.ts';
import { ENS_CACHE, REF_FILES } from './ensemble-refs.ts';

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const IDS = (arg('--instrument') ?? 'flute,oboe,bassoon').split(',') as InstrumentId[];
const PARAMS = arg('--params') ? (JSON.parse(arg('--params')!) as Record<string, unknown>) : undefined;
const MODEL = process.argv.includes('--model');
const VIB = join(import.meta.dirname, '..', '.cache', 'iowa-vib', 'wav');

const q = (xs: number[], p: number) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(p * (v.length - 1))] : NaN;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};

export interface Vib { dyn: string; midi: number; depth: number; rate: number; levelDb: number; fundDb: number; upperDb: number; rateCv: number; depthCv: number; sine: number; onset: number }

/** the strongest of the first six harmonics under 4 kHz, over [a, b) */
function harmonicOf(x: ArrayLike<number>, fs: number, a: number, b: number, f0: number): number {
  const win = Math.min(b - a, Math.round(0.3 * fs));
  const sp = spectrum(x, fs, Math.round((a + b - win) / 2), win, 32768, 'hann');
  let best = 1;
  let bm = 0;
  for (let h = 1; h <= 6 && h * f0 < 4000; h++) {
    let m = 0;
    for (let k = Math.floor((h * f0 * 0.97) / sp.binHz); k <= Math.ceil((h * f0 * 1.03) / sp.binHz); k++) m = Math.max(m, sp.mag[k]);
    if (m > bm) {
      bm = m;
      best = h;
    }
  }
  return best;
}
function pitchAt(x: ArrayLike<number>, fs: number, s: number, win: number, f: number, nfft: number): number {
  const sp = spectrum(x, fs, s, win, nfft, 'hann');
  const lo = Math.max(2, Math.floor((f * 0.95) / sp.binHz));
  const hi = Math.min(sp.mag.length - 2, Math.ceil((f * 1.05) / sp.binHz));
  let top = lo;
  for (let k = lo; k <= hi; k++) if (sp.mag[k] > sp.mag[top]) top = k;
  const l = Math.log(sp.mag[top - 1] + 1e-30);
  const c = Math.log(sp.mag[top] + 1e-30);
  const r = Math.log(sp.mag[top + 1] + 1e-30);
  const den = l - 2 * c + r;
  return 1200 * Math.log2(((top + (den ? (0.5 * (l - r)) / den : 0)) * sp.binHz) / f);
}
/** less its own slow part (a running mean over ±m points) */
const detrend = (c: number[], m: number) =>
  c.map((v, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - m); j <= Math.min(c.length - 1, i + m); j++) {
      s += c[j];
      n++;
    }
    return v - s / n;
  }).slice(m, -m);
function bestSine(d: number[], hop: number): { rate: number; amp: number } {
  let rate = NaN;
  let amp = 0;
  for (let r = 3.5; r <= 9; r += 0.05) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < d.length; i++) {
      const ph = 2 * Math.PI * r * i * hop;
      re += d[i] * Math.cos(ph);
      im += d[i] * Math.sin(ph);
    }
    const A = (2 * Math.hypot(re, im)) / d.length;
    if (A > amp) {
      amp = A;
      rate = r;
    }
  }
  return { rate, amp };
}
const ampAt = (d: number[], hop: number, r: number) => {
  let re = 0;
  let im = 0;
  for (let i = 0; i < d.length; i++) {
    const ph = 2 * Math.PI * r * i * hop;
    re += d[i] * Math.cos(ph);
    im += d[i] * Math.sin(ph);
  }
  return (2 * Math.hypot(re, im)) / d.length;
};

/** one note, x[a, b) from its onset to its end, of pitch f0 (Hz) */
export function vibratoOf(x: ArrayLike<number>, fs: number, a: number, b: number, f0: number, dyn: string, midi: number): Vib | null {
  const s0 = a + Math.round(0.25 * fs);
  const s1 = b - Math.round(0.2 * fs);
  if (s1 - s0 < 0.8 * fs) return null;
  const h = harmonicOf(x, fs, s0, s1, f0);
  const HOP = 0.005;
  const hop = Math.round(HOP * fs);
  const win = Math.max(Math.round(0.05 * fs), Math.round((6 * fs) / (h * f0)));
  const c: number[] = [];
  const lv: number[] = [];
  const lwin = Math.max(Math.round(0.02 * fs), Math.round((3 * fs) / f0));
  // (the fundamental's level and the harmonics' above it, from a window of four periods, at most 50 ms)
  const fu: number[] = [];
  const up: number[] = [];
  const hw = Math.min(Math.round(0.05 * fs), Math.max(Math.round(0.02 * fs), Math.round((4 * fs) / f0)));
  for (let s = s0; s + win <= s1; s += hop) {
    c.push(pitchAt(x, fs, s, win, h * f0, 8192));
    {
      const sp = spectrum(x, fs, s + Math.round((win - hw) / 2), hw, 8192, 'hann');
      const band = (fc: number) => {
        let e = 0;
        for (let k = Math.floor((fc * 0.93) / sp.binHz); k <= Math.ceil((fc * 1.07) / sp.binHz); k++) e += sp.mag[k] ** 2;
        return e;
      };
      fu.push(10 * Math.log10(band(f0) + 1e-30));
      let e = 0;
      for (let k = 2; k <= 10 && k * f0 < 0.45 * fs; k++) e += band(k * f0);
      up.push(10 * Math.log10(e + 1e-30));
    }
    let e = 0;
    const m = s + Math.round((win - lwin) / 2);
    for (let i = 0; i < lwin; i++) e += x[m + i] * x[m + i];
    lv.push(10 * Math.log10(e / lwin + 1e-20));
  }
  const M = 30; // ±150 ms
  const d = detrend(c, M);
  const dl = detrend(lv, M);
  if (d.length < 60) return null;
  const { rate, amp } = bestSine(d, HOP);
  const v = d.reduce((p, y) => p + y * y, 0) / d.length;
  const sine = v > 0 ? Math.min(1, (amp * amp) / 2 / v) : NaN;
  // cycle by cycle: a light smoothing (±10 ms), then upward zero crossings
  const sm = d.map((_, i) => mean(d.slice(Math.max(0, i - 2), i + 3)));
  const ups: number[] = [];
  for (let i = 1; i < sm.length; i++) if (sm[i - 1] < 0 && sm[i] >= 0) ups.push(i - 1 + -sm[i - 1] / (sm[i] - sm[i - 1]));
  const lens: number[] = [];
  const swings: number[] = [];
  for (let k = 1; k < ups.length; k++) {
    const L = (ups[k] - ups[k - 1]) * HOP;
    if (L < 1 / 10 || L > 1 / 3) continue;
    lens.push(L);
    const seg = sm.slice(Math.floor(ups[k - 1]), Math.ceil(ups[k]) + 1);
    swings.push(Math.max(...seg) - Math.min(...seg));
  }
  const cv = (xs: number[]) => (xs.length >= 3 ? (100 * sd(xs)) / mean(xs) : NaN);
  // how soon it comes in: the swing over each 200 ms from the note's start, against the held part's
  let onset = NaN;
  {
    const e0 = a + Math.round(0.05 * fs);
    const cc: number[] = [];
    for (let s = e0; s + win <= Math.min(b, a + Math.round(1.6 * fs)); s += hop) cc.push(pitchAt(x, fs, s, win, h * f0, 8192));
    const dd = detrend(cc, 20);
    const full = amp;
    for (let i = 0; i + 40 <= dd.length; i += 4) {
      if (ampAt(dd.slice(i, i + 40), HOP, rate) >= 0.5 * full) {
        onset = 0.05 + (i + 20 + 20) * HOP;
        break;
      }
    }
  }
  return { dyn, midi, depth: amp, rate, levelDb: ampAt(dl, HOP, rate), fundDb: ampAt(detrend(fu, M), HOP, rate), upperDb: ampAt(detrend(up, M), HOP, rate), rateCv: cv(lens), depthCv: cv(swings), sine, onset };
}

const hzOf = (m: number) => 440 * 2 ** ((m - 69) / 12);
function recorded(id: InstrumentId): Vib[] {
  const rows: Vib[] = [];
  const files: { path: string; dyn: string; lo: number; merge?: number }[] = [];
  if (id === 'flute' && existsSync(VIB)) {
    for (const f of readdirSync(VIB).filter((n) => n.startsWith('Flute.vib.') && n.endsWith('.wav'))) {
      const [, , dyn, tag] = f.replace(/\.wav$/, '').split('.');
      const lo = { B3B4: 59, C5B5: 72, C6B6: 84, B4Bb5: 71 }[tag] ?? 60;
      files.push({ path: join(VIB, f), dyn, lo });
    }
  } else
    for (const f of REF_FILES.filter((r) => r.instrument === id))
      files.push({ path: join(ENS_CACHE, 'wav', f.file.replace(/\.aiff$/, '.wav')), dyn: f.dyn, lo: f.range[0], merge: f.merge });
  for (const f of files) {
    const a = decodeWav(readFileSync(f.path));
    const x = a.channels[0];
    const segs = segmentNotes(x, a.sampleRate, f.merge ? { merge: f.merge } : {});
    segs.forEach((seg, i) => {
      const m = f.lo + i;
      const r = vibratoOf(x, a.sampleRate, seg.start, seg.end, hzOf(m), f.dyn, m);
      if (r) rows.push(r);
    });
  }
  return rows;
}
function model(id: InstrumentId): Vib[] {
  const fs = 44100;
  const rows: Vib[] = [];
  const { lo, hi } = INSTRUMENT_INFO[id];
  const player = Number(arg('--player') ?? 0);
  // (each dynamic's notes in one sitting, 3 s each and a breath between, as the recordings' runs are: the
  // player's stream runs on from note to note)
  for (const [dyn, vel] of [['pp', 30], ['mf', 70], ['ff', 112]] as const) {
    const ms: number[] = [];
    for (let m = lo + 2; m <= hi - 2; m += 3) ms.push(m);
    const events = ms.flatMap((m, i) => [{ time: 0.05 + 3.6 * i, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 3.05 + 3.6 * i, event: { type: 'noteOff', midi: m } }]);
    const out = renderInstrument({ sampleRate: fs, instrument: id, dry: true, player, params: PARAMS, events, duration: 3.6 * ms.length } as never);
    ms.forEach((m, i) => {
      const r = vibratoOf(out.left, fs, Math.round((0.05 + 3.6 * i) * fs), Math.round((3.05 + 3.6 * i) * fs), hzOf(m), dyn, m);
      if (r) rows.push(r);
    });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const id of IDS) {
    const rows = MODEL ? model(id) : recorded(id);
    console.log(`${id}${MODEL ? ` (the engine${PARAMS ? ` ${JSON.stringify(PARAMS)}` : ''})` : ' (the recordings)'}: ${rows.length} held notes`);
    for (const dyn of ['pp', 'mf', 'ff', 'all']) {
      const rs = dyn === 'all' ? rows : rows.filter((r) => r.dyn === dyn);
      if (!rs.length) continue;
      const f = (k: keyof Vib, d = 1) => [0.25, 0.5, 0.75].map((p) => q(rs.map((r) => r[k] as number), p).toFixed(d)).join(' / ');
      console.log(`  ${dyn.padEnd(3)} (${String(rs.length).padStart(2)}): pitch ${f('depth')} ¢ at ${f('rate', 2)} Hz (note to note ±${sd(rs.map((r) => r.rate)).toFixed(2)} Hz); level ${f('levelDb', 2)} dB (the fundamental ${f('fundDb', 2)}, the harmonics above ${f('upperDb', 2)}); cycle to cycle: length ${f('rateCv', 0)} %, swing ${f('depthCv', 0)} %; one sine ${f('sine', 2)}; half depth after ${f('onset', 2)} s   (quartiles)`);
    }
  }
}
