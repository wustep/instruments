// The mallet's click, the recordings' and the model's: the stroke's first 4 ms in third-octave bands from
// 2 to 16 kHz, re the stroke's own level 80–200 ms on (dB). The head is on the bar a fifth of a millisecond:
// what is heard of that is a click across the whole band, the same on every bar, reaching higher at
// fortissimo; a knock made of two fixed resonances is a small pitched tick instead, the same on every note.
// Over the clean mezzo-forte and fortissimo strokes of the Iowa bells in the compass (scripts/glock-refs.ts),
// the model's stroke on the same bar at the same dynamic and the recorded bar's pitch (the voicing: `human` 0).
//   npx tsx scripts/glock-click.ts [--engine <core/index.ts>] [--voice v.json]
// Prints each dynamic's median band levels, and how far the model's stand from the recording's, band by band
// (dB, RMS over the bands and strokes), for the bars the voicing was fitted on and for those held out (odd MIDI).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeWav } from '../packages/engine/src/analysis/index.ts';
import { renderInstrument } from '../packages/engine/src/core/index.ts';
import { GLOCK_CACHE, GLOCK_FILES, glockRefs, strokes } from './glock-refs.ts';
import { onsetOf } from './waver-lib.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const RENDER: typeof renderInstrument = opt('--engine') ? (await import(pathToFileURL(opt('--engine')!).href)).renderInstrument : renderInstrument;
const voice = opt('--voice') ? JSON.parse(readFileSync(opt('--voice')!, 'utf8')) : undefined;
const VEL: Record<string, number> = { mf: 75, ff: 106 };
/** the bands' centres: 2 … 16 kHz */
const FC = Array.from({ length: 10 }, (_, k) => 2000 * 2 ** (k / 3));
function bands(x: Float32Array, fs: number, i0: number, n: number, tone: number): number[] {
  return FC.map((fc) => {
    let e = 0;
    for (let p = 0; p < 6; p++) {
      const f = fc * 2 ** ((p + 0.5) / 18 - 1 / 6);
      let re = 0;
      let im = 0;
      for (let i = 0; i < n; i++) {
        const xi = (x[i0 + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / n));
        re += xi * Math.cos((2 * Math.PI * f * i) / fs);
        im += xi * Math.sin((2 * Math.PI * f * i) / fs);
      }
      e += ((re * re + im * im) * f) / n;
    }
    return 10 * Math.log10(e / tone + 1e-12);
  });
}
function click(x: Float32Array, fs: number): number[] {
  const on = onsetOf(x);
  let t = 0;
  for (let i = on + Math.round(0.08 * fs); i < on + Math.round(0.2 * fs); i++) t += x[i] * x[i];
  return bands(x, fs, on - Math.round(0.0005 * fs), Math.round(0.004 * fs), t / (0.12 * fs));
}
const refs = (await glockRefs()).filter((r) => r.ok && r.midi >= 79 && r.midi <= 108 && (r.mark === 'mf' || r.mark === 'ff'));
const rows: { midi: number; mark: string; held: boolean; rec: number[]; mod: number[] }[] = [];
const cache = new Map<string, { x: Float32Array; fs: number; segs: { start: number; end: number }[] }>();
for (const r of refs) {
  const f = GLOCK_FILES.find((g) => g.file === r.file)!;
  let c = cache.get(f.file);
  if (!c) {
    const a = decodeWav(readFileSync(join(GLOCK_CACHE, 'wav', f.file.replace(/\.aif$/, '.wav'))));
    c = { x: a.channels[0] as Float32Array, fs: a.sampleRate, segs: strokes(a.channels[0], a.sampleRate, f.lo, f.hi) };
    cache.set(f.file, c);
  }
  const s = c.segs[r.midi - f.lo];
  const rec = Float32Array.from({ length: s.end - s.start }, (_, k) => c!.x[s.start + k]);
  const et = 440 * 2 ** ((r.midi - 69) / 12);
  const out = RENDER({ sampleRate: 44100, instrument: 'glockenspiel' as never, dry: true, params: { human: 0, voice } as never, events: [{ time: 0, event: { type: 'bend', value: Math.max(-0.6, Math.min(0.6, 12 * Math.log2(r.f0 / et))) } }, { time: 0.05, event: { type: 'noteOn', midi: r.midi, velocity: VEL[r.mark] } }], duration: 0.6 });
  const m = new Float32Array(out.left.length);
  for (let i = 0; i < m.length; i++) m[i] = 0.5 * (out.left[i] + out.right[i]);
  rows.push({ midi: r.midi, mark: r.mark, held: r.held, rec: click(rec, c.fs), mod: click(m, 44100) });
}
const med = (xs: number[]) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];
console.log(`band (kHz)        ${FC.map((f) => (f / 1000).toFixed(1).padStart(6)).join('')}`);
for (const mark of ['mf', 'ff'])
  for (const who of ['rec', 'mod'] as const) console.log(`${mark} ${who === 'rec' ? 'the recordings' : 'the model     '} ${FC.map((_, b) => med(rows.filter((r) => r.mark === mark).map((r) => r[who][b])).toFixed(0).padStart(6)).join('')}`);
const err = (rs: typeof rows) => {
  let s = 0;
  let n = 0;
  let bias = 0;
  for (const r of rs)
    for (let b = 0; b < FC.length; b++) {
      const d = r.mod[b] - r.rec[b];
      s += d * d;
      bias += d;
      n++;
    }
  return `${Math.sqrt(s / n).toFixed(1)} dB apart (the model ${(bias / n).toFixed(1)} dB over), n ${rs.length}`;
};
console.log(`the click, band by band: fit bars ${err(rows.filter((r) => !r.held))}; held-out bars ${err(rows.filter((r) => r.held))}`);
for (const [name, lo, hi] of [['G5–B5', 79, 83], ['C6–B6', 84, 95], ['C7–C8', 96, 108]] as const) console.log(`  ${name}: ${err(rows.filter((r) => r.midi >= lo && r.midi <= hi))}`);
