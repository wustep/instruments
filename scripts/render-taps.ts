// Short taps on the winds, before/after: the same key presses (30–200 ms, pp to ff) through this
// engine or another (--engine), as MP3 + spectrogram.
//   npx tsx scripts/render-taps.ts --tag after [--engine <core/index.ts>] [--out dir]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';
import { spectrogramPng } from './spectrogram.ts';

type Core = typeof import('../packages/engine/src/core/index.ts');
const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const TAG = opt('--tag', 'after')!;
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'realistic-3d', 'final-fable', 'top3-winds'))!);
const E = (await import(opt('--engine') ? pathToFileURL(resolve(opt('--engine')!)).href : '../packages/engine/src/core/index.ts')) as Core;
mkdirSync(OUT, { recursive: true });
const FS = 48000;
type Ev = { time: number; event: Record<string, unknown> };
const on = (m: number, t: number, d: number, v: number): Ev[] => [
  { time: t, event: { type: 'noteOn', midi: m, velocity: v } },
  { time: t + d, event: { type: 'noteOff', midi: m } },
];
// taps of 30, 50, 80, 120 and 200 ms, each at pp, mf and ff, then one held note; and a quick
// tongued figure (70 ms notes, 110 ms apart) into a held note
const taps = (m: number): Ev[] => [...[0.03, 0.05, 0.08, 0.12, 0.2].flatMap((d, i) => [30, 70, 112].flatMap((v, j) => on(m, 0.1 + (i * 3 + j) * 0.4, d, v))), ...on(m, 6.2, 1.0, 80)];
const figure = (ns: number[]): Ev[] => [...ns.flatMap((m, i) => on(m, 0.1 + i * 0.11, 0.07, 84 + 3 * i)), ...on(ns[ns.length - 1] + 5, 0.1 + ns.length * 0.11, 0.9, 104)];
const passages: [string, string, Ev[], number][] = [
  ['trumpet-taps', 'trumpet', taps(70), 7.8],
  ['trumpet-figure', 'trumpet', figure([62, 62, 62, 65, 65, 65, 69, 69]), 2.4],
  ['flute-taps', 'flute', taps(77), 7.8],
  ['flute-figure', 'flute', figure([74, 74, 74, 77, 77, 77, 81, 81]), 2.4],
];
for (const [name, instrument, events, dur] of passages) {
  const r = E.renderInstrument({ sampleRate: FS, instrument: instrument as never, events: events as never, duration: dur } as never);
  // no normalisation: before and after are at the level the page plays them
  const wav = join(OUT, `${name}-${TAG}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [r.left, r.right] }, 16));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '192k', join(OUT, `${name}-${TAG}.mp3`)]);
  rmSync(wav);
  spectrogramPng(join(OUT, `${name}-${TAG}.png`), [{ data: r.left.map((v, i) => 0.5 * (v + r.right[i])), fs: FS }], { dur, fmax: 8000, win: 1024, hop: 96, height: 300 });
  console.log(`${name}-${TAG}`);
}
