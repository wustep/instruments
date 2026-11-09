// The pianos' pedals, before/after: the same passages through an older engine (--before) and this
// checkout, as MP3s (dry, one gain per passage across both engines, so loudness differences stay
// audible) and stacked spectrograms (before on top), plus each passage's level per pedal.
//   npx tsx scripts/render-pedals.ts --before <old>/packages/engine/src/core/index.ts --out <dir>
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';
import { spectrogramPng } from './spectrogram.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'realistic-3d', 'final-r2', 'pedals'))!);
const BEFORE = opt('--before');
const AFTER = resolve(join(import.meta.dirname, '../packages/engine/src/core/index.ts'));
type Render = typeof import('../packages/engine/src/core/index.ts').renderInstrument;
const engines: [string, Render][] = [];
for (const [tag, path] of [...(BEFORE ? [['before', resolve(BEFORE)]] : []), ['after', AFTER]]) engines.push([tag, (await import(pathToFileURL(path).href)).renderInstrument]);
mkdirSync(OUT, { recursive: true });
const FS = 48000;
type Ev = { time: number; event: Record<string, unknown> };
const note = (m: number, t: number, d: number, v: number): Ev[] => [{ time: t, event: { type: 'noteOn', midi: m, velocity: v } }, { time: t + d, event: { type: 'noteOff', midi: m } }];
const ped = (type: string, t: number, value: number): Ev => ({ time: t, event: { type, value } });
/** a phrase (C major, a broken chord and a held chord) starting at t0 */
const phrase = (t0: number): Ev[] => [...[60, 64, 67, 72, 67, 64].flatMap((m, i) => note(m, t0 + i * 0.28, 0.26, 82)), ...[48, 60, 64, 67].flatMap((m) => note(m, t0 + 1.8, 1.6, 86))];
const PIECES: { name: string; what: string; preset: string; ev: Ev[]; dur: number; marks: [string, number, number][] }[] = [
  {
    name: 'upright-soft',
    what: 'upright: the phrase without, then with the soft pedal (before: una corda; after: the half-blow rail)',
    preset: 'upright',
    ev: [...phrase(0.1), ped('soft', 3.9, 1), ...phrase(4.0), ped('soft', 7.7, 0)],
    dur: 7.9,
    marks: [['no pedal', 0.1, 3.5], ['soft pedal', 4.0, 7.4]],
  },
  {
    name: 'upright-middle',
    what: 'upright: the phrase without, then with the middle pedal (before: a sostenuto; after: the practice muffler)',
    preset: 'upright',
    ev: [...phrase(0.1), ped('sostenuto', 3.9, 1), ...phrase(4.0), ped('sostenuto', 7.7, 0)],
    dur: 7.9,
    marks: [['no pedal', 0.1, 3.5], ['middle pedal', 4.0, 7.4]],
  },
  {
    name: 'grand-sostenuto',
    what: 'grand: C2–G2–C3 held, sostenuto, released; a staccato melody over it stays damped (unchanged)',
    preset: 'grand',
    ev: [...[36, 43, 48].flatMap((m) => note(m, 0.1, 0.6, 90)), ped('sostenuto', 0.4, 1), ...[72, 74, 76, 77, 79, 77, 76, 74, 72].flatMap((m, i) => note(m, 1.0 + i * 0.3, 0.12, 80)), ped('sostenuto', 4.4, 0)],
    dur: 5.4,
    marks: [['held by the sostenuto', 1.0, 4.3]],
  },
];
const rmsDb = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  const i0 = Math.round(a * FS);
  const i1 = Math.min(x.length, Math.round(b * FS));
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / Math.max(1, i1 - i0) + 1e-30);
};
const metrics: Record<string, Record<string, Record<string, number>>> = {};
for (const p of PIECES) {
  const rs = engines.map(([tag, render]) => [tag, render({ sampleRate: FS, instrument: 'piano', preset: p.preset, events: p.ev as never, duration: p.dur } as never)] as const);
  let pk = 0;
  for (const [, r] of rs) for (let i = 0; i < r.left.length; i++) pk = Math.max(pk, Math.abs(r.left[i]), Math.abs(r.right[i]));
  const g = pk > 0 ? Math.pow(10, -1 / 20) / pk : 1;
  const monos: { data: Float32Array; fs: number }[] = [];
  metrics[p.name] = {};
  for (const [tag, r] of rs) {
    const L = Float32Array.from(r.left, (v) => v * g);
    const R = Float32Array.from(r.right, (v) => v * g);
    const wav = join(OUT, `${p.name}-${tag}.wav`);
    writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }, 16));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '128k', join(OUT, `${p.name}-${tag}.mp3`)]);
    rmSync(wav);
    const m = Float32Array.from(L, (v, i) => 0.5 * (v + R[i]));
    monos.push({ data: m, fs: FS });
    metrics[p.name][tag] = Object.fromEntries(p.marks.map(([k, a, b]) => [k, +rmsDb(m, a, b).toFixed(2)]));
  }
  spectrogramPng(join(OUT, `${p.name}.png`), monos, { start: 0, dur: p.dur, fmax: 8000, win: 2048, hop: Math.max(64, Math.round((p.dur * FS) / 960)), range: 80, height: 220 });
  console.log(p.name, JSON.stringify(metrics[p.name]));
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify({ pieces: PIECES.map((p) => ({ name: p.name, what: p.what })), rmsDb: metrics }, null, 2));
