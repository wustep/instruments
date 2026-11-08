// Trumpet iteration artifacts: the same passages through this engine (or --engine), MP3 + spectrogram,
// tagged by iteration; and close-ups of single notes next to the Iowa trumpet (analysis only:
// the recording's audio is never written out).
//   npx tsx scripts/render-trumpet.ts --tag it0 [--engine <path>] [--out dir]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeWav, encodeWav, identifyNote, segmentNotes } from '../packages/engine/src/analysis/index.ts';
import { spectrogramPng, type Mono } from './spectrogram.ts';
import { ENS_CACHE } from './ensemble-refs.ts';

type Core = typeof import('../packages/engine/src/core/index.ts');
const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const TAG = opt('--tag', 'now')!;
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'round3', 'trumpet'))!);
const E = (await import(opt('--engine') ? pathToFileURL(resolve(opt('--engine')!)).href : '../packages/engine/src/core/index.ts')) as Core;
mkdirSync(OUT, { recursive: true });
const FS = 48000;
type Ev = { time: number; event: Record<string, unknown> };
const on = (m: number, t: number, d: number, v: number): Ev[] => [
  { time: t, event: { type: 'noteOn', midi: m, velocity: v } },
  { time: t + d, event: { type: 'noteOff', midi: m } },
];
// an original fanfare-like line, pp to ff, with a slur and repeated tongued notes
const phrase: Ev[] = [
  ...on(60, 0.1, 0.5, 40), ...on(64, 0.65, 0.5, 55), ...on(67, 1.2, 0.9, 70),
  ...on(72, 2.2, 0.22, 90), ...on(72, 2.48, 0.22, 95), ...on(72, 2.76, 0.22, 100),
  ...on(76, 3.05, 0.4, 108), ...on(74, 3.5, 0.3, 104), ...on(72, 3.85, 1.2, 116),
];
const passages: [string, Ev[], number][] = [
  ['phrase', phrase, 5.6],
  ['c4-pp', on(60, 0.1, 1.6, 30), 2.4],
  ['c4-ff', on(60, 0.1, 1.6, 112), 2.4],
  ['g5-mf', on(79, 0.1, 1.6, 70), 2.4],
];
for (const [name, events, dur] of passages) {
  const r = E.renderInstrument({ sampleRate: FS, instrument: 'trumpet', events: events as never, duration: dur } as never);
  let pk = 0;
  for (let i = 0; i < r.left.length; i++) pk = Math.max(pk, Math.abs(r.left[i]), Math.abs(r.right[i]));
  const g = Math.pow(10, -1 / 20) / Math.max(pk, 1e-9);
  const L = r.left.map((v) => v * g);
  const R = r.right.map((v) => v * g);
  const wav = join(OUT, `${name}-${TAG}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }, 16));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '192k', join(OUT, `${name}-${TAG}.mp3`)]);
  rmSync(wav);
  spectrogramPng(join(OUT, `${name}-${TAG}.png`), [{ data: L.map((v, i) => 0.5 * (v + R[i])), fs: FS }], { dur, fmax: 12000, win: 1024, hop: 96, height: 300 });
}
// single notes, dry, next to the recording: C4 pp and ff, G5 mf (first 1.2 s)
const iowa = (dyn: string, file: string, midi: number): Mono | null => {
  const p = join(ENS_CACHE, 'wav', file);
  if (!existsSync(p)) return null;
  const a = decodeWav(readFileSync(p));
  const x = a.channels[0];
  // the segment that is this note (identified by pitch), the longest if several
  const segs = segmentNotes(x, a.sampleRate).filter((sg) => identifyNote(x, a.sampleRate, sg, midi - 2, midi + 2).midi === midi);
  const seg = segs.sort((p, q) => q.end - q.start - (p.end - p.start))[0];
  if (!seg) return null;
  void dyn;
  return { data: x.slice(Math.max(0, seg.start - Math.round(0.05 * a.sampleRate)), seg.start + Math.round(1.2 * a.sampleRate)), fs: a.sampleRate };
};
for (const [midi, dyn, vel, file] of [[60, 'pp', 30, 'Trumpet.novib.pp.C4B4.wav'], [60, 'ff', 112, 'Trumpet.novib.ff.C4B4.wav'], [79, 'mf', 70, 'Trumpet.novib.mf.C5B5.wav']] as const) {
  const panels: Mono[] = [];
  const ref = iowa(dyn, file, midi);
  if (ref) panels.push(ref);
  const r = E.renderNote(midi, vel, 1.4, { sampleRate: FS, dry: true, instrument: 'trumpet' } as never);
  const x = E.renderInstrument({ sampleRate: FS, instrument: 'trumpet', dry: true, events: [{ time: 0.05, event: { type: 'noteOn', midi, velocity: vel } }] as never, duration: 1.3 } as never).left;
  void r;
  panels.push({ data: x, fs: FS });
  spectrogramPng(join(OUT, `note-${midi}-${dyn}-iowa-vs-${TAG}.png`), panels, { dur: 1.25, fmax: 12000, win: 2048, hop: 128, height: 260, range: 60 });
}
console.log(`trumpet artifacts ${TAG} → ${OUT}`);
