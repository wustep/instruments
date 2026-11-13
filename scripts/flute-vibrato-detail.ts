// The flute's vibrato, harmonic by harmonic, and what it does to the breath's noise between the harmonics:
// the University of Iowa MIS vibrato runs (.cache/iowa-vib, analysis only) and an engine's held notes, read
// the same way. scripts/winds-vibrato.ts reads the fundamental against the sum of what is above it; this reads
// each of the first six harmonics alone and the noise between them (a vibrato put on as a gain moves the
// noise as far as the tone; a flautist's need not).
//   npx tsx scripts/flute-vibrato-detail.ts [--engine <path/to/core/index.ts>] [--params '{"human":1}']
// Per dynamic, medians over the notes from A4 up (below, the bands between harmonics are too narrow to read):
//   the pitch's swing (cents, an amplitude) and rate; each harmonic's level swing at that rate (dB); the
//   noise's swing (dB) and its level under the tone (dB); how the harmonics' swing sits against the pitch's
//   (degrees: 0, loudest when sharpest).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeWav, segmentNotes, spectrum } from '../packages/engine/src/analysis/index.ts';

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const VIB = join(import.meta.dirname, '..', '.cache', 'iowa-vib', 'wav');
const hzOf = (m: number) => 440 * 2 ** ((m - 69) / 12);
const med = (xs: number[]) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : NaN;
};
const HOP = 0.005;
const detrend = (c: number[], m: number) =>
  c.map((v, i) => {
    let s = 0;
    let n = 0;
    for (let k = Math.max(0, i - m); k <= Math.min(c.length - 1, i + m); k++) {
      s += c[k];
      n++;
    }
    return v - s / n;
  });
/** the sine of rate r (Hz) in d: amplitude and phase (radians) */
function sineAt(d: number[], r: number): { amp: number; ph: number } {
  let re = 0;
  let im = 0;
  for (let i = 0; i < d.length; i++) {
    re += d[i] * Math.cos(2 * Math.PI * r * i * HOP);
    im += d[i] * Math.sin(2 * Math.PI * r * i * HOP);
  }
  return { amp: (2 * Math.hypot(re, im)) / d.length, ph: Math.atan2(im, re) };
}

interface Row { dyn: string; midi: number; cents: number; rate: number; h: number[]; noise: number; noiseUnder: number; phase: number }
function detail(x: ArrayLike<number>, fs: number, a: number, b: number, f0: number, dyn: string, midi: number): Row | null {
  const s0 = a + Math.round(0.8 * fs);
  const s1 = b - Math.round(0.25 * fs);
  if (s1 - s0 < 0.8 * fs) return null;
  const hop = Math.round(HOP * fs);
  const win = Math.round(0.06 * fs);
  const c: number[] = [];
  const hs: number[][] = [[], [], [], [], [], []];
  const nz: number[] = [];
  const tone: number[] = [];
  for (let s = s0; s + win <= s1; s += hop) {
    const sp = spectrum(x, fs, s, win, 16384);
    // the note's own frequency now (its vibrato): the fundamental's peak
    const lo = Math.floor((f0 * 0.95) / sp.binHz);
    const hi = Math.ceil((f0 * 1.05) / sp.binHz);
    let top = lo;
    for (let k = lo; k <= hi; k++) if (sp.mag[k] > sp.mag[top]) top = k;
    const l = Math.log(sp.mag[top - 1] + 1e-30);
    const m = Math.log(sp.mag[top] + 1e-30);
    const r = Math.log(sp.mag[top + 1] + 1e-30);
    const den = l - 2 * m + r;
    const f = (top + (den ? (0.5 * (l - r)) / den : 0)) * sp.binHz;
    c.push(1200 * Math.log2(f / f0));
    const band = (fa: number, fb: number) => {
      let e = 0;
      for (let k = Math.floor(fa / sp.binHz); k <= Math.ceil(fb / sp.binHz); k++) e += sp.mag[k] ** 2;
      return e;
    };
    let t = 0;
    for (let k = 1; k <= 6; k++) {
      const e = band(k * f * 0.94, k * f * 1.06);
      hs[k - 1].push(10 * Math.log10(e + 1e-30));
      t += e;
    }
    let n = 0;
    for (let k = 1; k <= 5; k++) n += band((k + 0.3) * f, (k + 0.7) * f);
    nz.push(10 * Math.log10(n + 1e-30));
    tone.push(10 * Math.log10(t + 1e-30));
  }
  if (c.length < 100) return null;
  const d = detrend(c, 30);
  let rate = 5;
  let best = 0;
  for (let r = 3.5; r <= 8; r += 0.05) {
    const v = sineAt(d, r).amp;
    if (v > best) {
      best = v;
      rate = r;
    }
  }
  const pc = sineAt(d, rate);
  const hd = hs.map((h) => sineAt(detrend(h, 30), rate));
  // the phase of the harmonics above the fundamental (the strongest's) against the pitch's
  let k = 1;
  for (let i = 2; i < 6; i++) if (med(hs[i]) > med(hs[k])) k = i;
  let ph = ((hd[k].ph - pc.ph) * 180) / Math.PI;
  ph = ((ph + 540) % 360) - 180;
  return { dyn, midi, cents: pc.amp, rate, h: hd.map((v) => v.amp), noise: sineAt(detrend(nz, 30), rate).amp, noiseUnder: med(tone) - med(nz), phase: ph };
}

const rows: Row[] = [];
const ENGINE = arg('--engine');
if (!ENGINE) {
  if (!existsSync(VIB)) throw new Error('no .cache/iowa-vib');
  for (const f of readdirSync(VIB).filter((n) => n.startsWith('Flute.vib.') && n.endsWith('.wav'))) {
    const [, , dyn, tag] = f.replace(/\.wav$/, '').split('.');
    const lo = { B3B4: 59, C5B5: 72, C6B6: 84, B4Bb5: 71 }[tag] ?? 60;
    const a = decodeWav(readFileSync(join(VIB, f)));
    const x = a.channels[0];
    segmentNotes(x, a.sampleRate).forEach((seg, i) => {
      const m = lo + i;
      if (m < 69) return;
      const r = detail(x, a.sampleRate, seg.start, seg.end, hzOf(m), dyn, m);
      if (r) rows.push(r);
    });
  }
} else {
  const { renderInstrument } = await import(pathToFileURL(ENGINE === '.' ? join(import.meta.dirname, '../packages/engine/src/core/index.ts') : resolve(ENGINE)).href);
  const fs = 44100;
  const params = arg('--params') ? JSON.parse(arg('--params')!) : undefined;
  for (const [dyn, vel] of [['pp', 30], ['mf', 70], ['ff', 112]] as const) {
    const ms: number[] = [];
    for (let m = 69; m <= 94; m += 2) ms.push(m);
    // (told ahead, as a file's notes are: a long note is known to be long)
    const events = ms.flatMap((m, i) => [
      { time: 0.05 + 3.6 * i, event: { type: 'foresee', midi: m, velocity: vel, dur: 3 } },
      { time: 0.05 + 3.6 * i, event: { type: 'noteOn', midi: m, velocity: vel } },
      { time: 3.05 + 3.6 * i, event: { type: 'noteOff', midi: m } },
    ]);
    const out = renderInstrument({ sampleRate: fs, instrument: 'flute', dry: true, params, events, duration: 3.6 * ms.length } as never);
    ms.forEach((m, i) => {
      const r = detail(out.left, fs, Math.round((0.05 + 3.6 * i) * fs), Math.round((3.05 + 3.6 * i) * fs), hzOf(m), dyn, m);
      if (r) rows.push(r);
    });
  }
}
console.log(`flute vibrato in detail, ${ENGINE ? `the engine ${ENGINE}` : 'the recordings'}: ${rows.length} held notes from A4 up`);
for (const dyn of ['pp', 'mf', 'ff', 'all']) {
  const rs = dyn === 'all' ? rows : rows.filter((r) => r.dyn === dyn);
  if (!rs.length) continue;
  const f = (g: (r: Row) => number, d = 1) => med(rs.map(g)).toFixed(d);
  console.log(`  ${dyn.padEnd(3)} (${String(rs.length).padStart(2)}): pitch ${f((r) => r.cents)} ¢ at ${f((r) => r.rate, 2)} Hz; harmonics 1–6 swing ${[0, 1, 2, 3, 4, 5].map((k) => f((r) => r.h[k], 2)).join(' / ')} dB; the noise between them ${f((r) => r.noise, 2)} dB, ${f((r) => r.noiseUnder, 0)} dB under the tone; the upper harmonics lead the pitch by ${f((r) => r.phase, 0)}°`);
}
