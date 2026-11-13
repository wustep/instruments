// How far a held flute note's pitch walks, at the time scales a quick note would catch it: the University of
// Iowa MIS non-vibrato flute (analysis only) and an engine's held notes without vibrato, read the same way.
// scripts/winds-variation.ts reads the roughness from one tenth of a second to the next (a second difference:
// blind to anything slower than half a second); this reads where stretches of 0.15 s and of 0.5 s of one held
// note sit against the note's own pitch: what a run's notes would be apart by, were they cut from it.
//   npx tsx scripts/flute-pitch-walk.ts [--engine <path/to/core/index.ts>|.] [--params '{"vibrato":0}']
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeWav, segmentNotes, spectrum } from '../packages/engine/src/analysis/index.ts';
import { ENS_CACHE, REF_FILES } from './ensemble-refs.ts';

const arg = (k: string) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const hzOf = (m: number) => 440 * 2 ** ((m - 69) / 12);
const q = (xs: number[], p: number) => {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.floor(p * (v.length - 1))] : NaN;
};
const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
interface Row { dyn: string; all: number; b15: number; b50: number; drift: number }
function walk(x: ArrayLike<number>, fs: number, a: number, b: number, f0: number, dyn: string): Row | null {
  const s0 = a + Math.round(0.35 * fs);
  const s1 = b - Math.round(0.3 * fs);
  if (s1 - s0 < 1.0 * fs) return null;
  const hop = Math.round(0.01 * fs);
  const win = Math.round(0.06 * fs);
  const c: number[] = [];
  for (let s = s0; s + win <= s1; s += hop) {
    const sp = spectrum(x, fs, s, win, 16384, 'hann');
    const lo = Math.floor((f0 * 0.94) / sp.binHz);
    const hi = Math.ceil((f0 * 1.06) / sp.binHz);
    let top = lo;
    for (let k = lo; k <= hi; k++) if (sp.mag[k] > sp.mag[top]) top = k;
    const l = Math.log(sp.mag[top - 1] + 1e-30);
    const m = Math.log(sp.mag[top] + 1e-30);
    const r = Math.log(sp.mag[top + 1] + 1e-30);
    const den = l - 2 * m + r;
    c.push(1200 * Math.log2(((top + (den ? (0.5 * (l - r)) / den : 0)) * sp.binHz) / f0));
  }
  if (c.length < 80) return null;
  // (the note's own line: where it sits and its drift from its beginning to its end are the note's, not a walk)
  const n = c.length;
  const tm = (n - 1) / 2;
  const mean = c.reduce((p, v) => p + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  c.forEach((v, i) => {
    sxy += (i - tm) * (v - mean);
    sxx += (i - tm) ** 2;
  });
  const slope = sxy / sxx;
  const d = c.map((v, i) => v - mean - slope * (i - tm));
  const blocks = (len: number) => {
    const out: number[] = [];
    for (let i = 0; i + len <= d.length; i += len) out.push(d.slice(i, i + len).reduce((p, v) => p + v, 0) / len);
    return out;
  };
  return { dyn, all: sd(d), b15: sd(blocks(15)), b50: blocks(50).length > 2 ? sd(blocks(50)) : NaN, drift: Math.abs(slope) * 100 };
}
const rows: Row[] = [];
const ENGINE = arg('--engine');
if (!ENGINE) {
  for (const f of REF_FILES.filter((r) => r.instrument === 'flute')) {
    const a = decodeWav(readFileSync(join(ENS_CACHE, 'wav', f.file.replace(/\.aiff$/, '.wav'))));
    const x = a.channels[0];
    segmentNotes(x, a.sampleRate, f.merge ? { merge: f.merge } : {}).forEach((seg, i) => {
      const r = walk(x, a.sampleRate, seg.start, seg.end, hzOf(f.range[0] + i), f.dyn);
      if (r) rows.push(r);
    });
  }
} else {
  const { renderInstrument } = await import(pathToFileURL(ENGINE === '.' ? join(import.meta.dirname, '../packages/engine/src/core/index.ts') : resolve(ENGINE)).href);
  const fs = 44100;
  const params = arg('--params') ? JSON.parse(arg('--params')!) : { vibrato: 0 };
  for (const [dyn, vel] of [['pp', 30], ['mf', 70], ['ff', 112]] as const) {
    const ms: number[] = [];
    for (let m = 60; m <= 94; m += 2) ms.push(m);
    const events = ms.flatMap((m, i) => [
      { time: 0.05 + 3.6 * i, event: { type: 'foresee', midi: m, velocity: vel, dur: 3 } },
      { time: 0.05 + 3.6 * i, event: { type: 'noteOn', midi: m, velocity: vel } },
      { time: 3.05 + 3.6 * i, event: { type: 'noteOff', midi: m } },
    ]);
    const out = renderInstrument({ sampleRate: fs, instrument: 'flute', dry: true, params, events, duration: 3.6 * ms.length } as never);
    ms.forEach((m, i) => {
      const r = walk(out.left, fs, Math.round((0.05 + 3.6 * i) * fs), Math.round((3.05 + 3.6 * i) * fs), hzOf(m), dyn);
      if (r) rows.push(r);
    });
  }
}
console.log(`a held flute note's pitch about its own line, ${ENGINE ? `the engine ${ENGINE} ${arg('--params') ?? '{"vibrato":0}'}` : 'the recordings (non-vibrato)'}: ${rows.length} notes`);
for (const dyn of ['pp', 'mf', 'ff', 'all']) {
  const rs = dyn === 'all' ? rows : rows.filter((r) => r.dyn === dyn);
  if (!rs.length) continue;
  const f = (g: (r: Row) => number) => [0.25, 0.5, 0.75].map((p) => q(rs.map(g), p).toFixed(1)).join(' / ');
  console.log(`  ${dyn.padEnd(3)} (${String(rs.length).padStart(2)}): every 10 ms ${f((r) => r.all)} ¢; stretches of 0.15 s ${f((r) => r.b15)} ¢, of 0.5 s ${f((r) => r.b50)} ¢; drift ${f((r) => r.drift)} ¢/s   (standard deviations; quartiles over the notes)`);
}
