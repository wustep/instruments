// The volute's demo and its numbers: a short original piece through the engine (MP3 + spectrogram),
// each choir alone on one chord, and the levels, onsets and tails that the voicing was set by.
//   npx tsx scripts/render-volute.ts [--out dir]
// There is no "before": the instrument is new, and no recording of one exists to judge it against.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderInstrument, CC_VOLUTE_SWELL, CC_VOLUTE_WEAVE } from '../packages/engine/src/core/index.ts';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';
import { spectrogramPng } from './spectrogram.ts';

const args = process.argv.slice(2);
const OUT = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : join(import.meta.dirname, '..', 'artifacts', 'round3', 'volute'));
mkdirSync(OUT, { recursive: true });
const FS = 48000;
type Ev = { time: number; event: Record<string, unknown> };
const note = (m: number, t: number, d: number, v: number): Ev[] => [
  { time: t, event: { type: 'noteOn', midi: m, velocity: v } },
  { time: t + d, event: { type: 'noteOff', midi: m } },
];
const chord = (ms: number[], t: number, d: number, v: number, roll = 0.03): Ev[] => ms.flatMap((m, i) => note(m, t + i * roll, d - i * roll, v));
/** a controller gliding from a to b over [t0, t1] (the engine's own values: weave 0…1; swell = 0.4 + 0.9·value) */
const glide = (cc: number, a: number, b: number, t0: number, t1: number): Ev[] => {
  const n = Math.max(2, Math.round((t1 - t0) / 0.05));
  return Array.from({ length: n }, (_, i) => ({ time: t0 + ((t1 - t0) * i) / (n - 1), event: { type: 'control', cc, value: a + ((b - a) * i) / (n - 1) } }));
};
const swell = (x: number) => (x - 0.4) / 0.9;

// An original piece, 30 s: the strings alone, soft; the weave turns to the middle and the bars
// carry a tune over the changing chords; the pipes alone, quiet; then everything, swelling, and
// the halo left ringing.
const piece: Ev[] = [
  ...glide(CC_VOLUTE_WEAVE, 0, 0, 0, 0.1),
  ...glide(CC_VOLUTE_SWELL, swell(0.75), swell(1), 0, 4),
  ...chord([38, 45, 50, 53], 0.3, 4.0, 46, 0.12),
  ...chord([57, 62], 2.2, 2.1, 52, 0.1),
  ...glide(CC_VOLUTE_WEAVE, 0, 0.5, 4.0, 5.6),
  // B♭, F, C under a tune on the bars
  ...chord([46, 53, 58, 62], 4.45, 2.5, 66),
  ...note(77, 4.5, 1.1, 108), ...note(74, 5.7, 0.55, 96), ...note(72, 6.3, 0.6, 100),
  ...chord([41, 48, 53, 57], 7.0, 2.5, 68),
  ...note(69, 7.05, 1.1, 104), ...note(72, 8.25, 0.55, 98), ...note(77, 8.85, 0.6, 108),
  ...chord([36, 43, 48, 52], 9.55, 2.6, 70),
  ...note(79, 9.6, 1.2, 114), ...note(76, 10.85, 0.6, 100), ...note(72, 11.5, 0.65, 96),
  // the pipes alone
  ...glide(CC_VOLUTE_WEAVE, 0.5, 1, 11.6, 12.4),
  ...glide(CC_VOLUTE_SWELL, swell(1), swell(0.8), 11.6, 12.4),
  ...chord([43, 50, 55, 58, 62], 12.4, 3.1, 58, 0.05),
  ...glide(CC_VOLUTE_SWELL, swell(0.8), swell(1.0), 15.4, 18.6),
  ...chord([45, 52, 57, 61, 64], 15.6, 3.2, 66, 0.05),
  ...note(76, 17.2, 1.6, 60),
  // everything
  ...glide(CC_VOLUTE_WEAVE, 1, 0.5, 18.2, 19.0),
  ...glide(CC_VOLUTE_SWELL, swell(1.0), swell(1.12), 19.0, 23.5),
  ...chord([38, 45, 50, 54, 57, 62], 19.0, 5.6, 84, 0.02),
  ...note(74, 19.6, 1.0, 112), ...note(78, 20.3, 1.0, 112), ...note(81, 21.0, 3.6, 118),
];
const mid = (r: { left: Float32Array; right: Float32Array }) => r.left.map((v, i) => 0.5 * (v + r.right[i]));
const rms = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  for (let i = Math.round(a * FS); i < Math.min(x.length, Math.round(b * FS)); i++) s += x[i] * x[i];
  return 10 * Math.log10(s / ((b - a) * FS) + 1e-30);
};
const peak = (r: { left: Float32Array; right: Float32Array }) => {
  let p = 0;
  for (let i = 0; i < r.left.length; i++) p = Math.max(p, Math.abs(r.left[i]), Math.abs(r.right[i]));
  return p;
};
function write(name: string, r: { left: Float32Array; right: Float32Array; cpuMs: number }, dur: number, normalise: boolean): void {
  const pk = peak(r);
  const g = normalise ? Math.pow(10, -1 / 20) / Math.max(pk, 1e-9) : 1;
  const L = r.left.map((v) => v * g);
  const R = r.right.map((v) => v * g);
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }, 16));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '192k', join(OUT, `${name}.mp3`)]);
  rmSync(wav);
  spectrogramPng(join(OUT, `${name}.png`), [{ data: mid({ left: L, right: R }), fs: FS }], { dur, fmax: 8000, win: 2048, hop: Math.max(96, Math.round((dur * FS) / 1400)), height: 320 });
  console.log(`${name}: ${dur} s, peak ${pk.toFixed(3)}${normalise ? ` (written at −1 dBFS, ×${g.toFixed(2)})` : ''}, cpu ${((r.cpuMs / (dur * 1000)) * 100).toFixed(1)} % of real time`);
}
const demo = renderInstrument({ sampleRate: FS, instrument: 'volute', events: piece as never, duration: 30 });
write('demo', demo, 30, true);
const x = mid(demo);
console.log(`  levels (dB RMS, as rendered): strings alone ${rms(x, 1.5, 4).toFixed(1)}, tune over chords ${rms(x, 5, 11).toFixed(1)}, pipes alone ${rms(x, 13, 18).toFixed(1)}, everything ${rms(x, 20, 24.5).toFixed(1)}, halo and room 1 s after the keys ${rms(x, 25.6, 26.6).toFixed(1)}, at 4 s ${rms(x, 28.6, 29.6).toFixed(1)}`);
// each choir alone on the same chord (dry: no room), and all three
const CH = [48, 55, 60, 64, 67];
const choirs: [string, Record<string, number>][] = [
  ['choir-strings', { weave: 0, strike: 0, halo: 0 }],
  ['choir-pipes', { weave: 1, strike: 0, halo: 0 }],
  ['choir-bars', { swell: 0, halo: 0 }],
  ['choir-all', {}],
];
for (const [name, params] of choirs) {
  const r = renderInstrument({ sampleRate: FS, instrument: 'volute', dry: true, params, events: chord(CH, 0.2, 3, 84, 0.25) as never, duration: 5 });
  write(name, r, 5, false);
  const m = mid(r);
  console.log(`  held ${rms(m, 2, 3.1).toFixed(1)} dB, first 150 ms of the last key ${rms(m, 1.2, 1.35).toFixed(1)} dB, 0.5 s after the keys ${rms(m, 3.7, 4).toFixed(1)} dB`);
}
