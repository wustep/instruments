// Key-up audit: held-then-released notes through an earlier engine (before) and this one (after),
// as MP3 with a spectrogram each, plus dry close-ups of the release (100 ms before to 400 ms after).
//   npx tsx scripts/render-release.ts --before <repo>/packages/engine/src/core/index.ts [--out dir]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';
import { spectrogramPng, type Mono } from './spectrogram.ts';

type Core = typeof import('../packages/engine/src/core/index.ts');
const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'round3', 'release'))!);
const engines: [string, Core][] = [
  ['before', (await import(pathToFileURL(resolve(opt('--before')!)).href)) as Core],
  ['after', (await import('../packages/engine/src/core/index.ts')) as Core],
];
mkdirSync(OUT, { recursive: true });
const FS = 48000;
type Ev = { time: number; event: Record<string, unknown> };
const on = (m: number, t: number, d: number, v: number): Ev[] => [
  { time: t, event: { type: 'noteOn', midi: m, velocity: v } },
  { time: t + d, event: { type: 'noteOff', midi: m } },
];
const MID = 61; // C#4
const BASS = 33; // A1
const staccato = (m: number) => [0, 1, 2, 3].flatMap((i) => on(m, 0.1 + i * 0.7, 0.35, 70 + i * 4));
const passages: [string, Ev[], number][] = [
  ['mid-held-released', on(MID, 0.1, 1.2, 72), 2.4],
  ['bass-held-released', on(BASS, 0.1, 1.5, 72), 2.8],
  ['mid-staccato', staccato(MID), 3.4],
  ['bass-staccato', staccato(BASS), 3.4],
];
for (const [tag, E] of engines) {
  for (const [name, events, dur] of passages) {
    const r = E.renderInstrument({ sampleRate: FS, instrument: 'piano', events: events as never, duration: dur });
    let pk = 0;
    for (let i = 0; i < r.left.length; i++) pk = Math.max(pk, Math.abs(r.left[i]), Math.abs(r.right[i]));
    const g = Math.pow(10, -1 / 20) / pk;
    const L = r.left.map((v) => v * g);
    const R = r.right.map((v) => v * g);
    const wav = join(OUT, `${name}-${tag}.wav`);
    writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }, 16));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '192k', join(OUT, `${name}-${tag}.mp3`)]);
    rmSync(wav);
    spectrogramPng(join(OUT, `${name}-${tag}.png`), [{ data: L.map((v, i) => 0.5 * (v + R[i])), fs: FS }], { dur, fmax: 8000, win: 1024, hop: 96, height: 320 });
    console.log(`${name}-${tag}`);
  }
}
// release close-ups, dry: held 1 s, released; before over after, each scaled to its own peak
for (const m of [MID, BASS, 45]) {
  const panels: Mono[] = [];
  for (const [, E] of engines) {
    const r = E.renderNote(m, 72, 1.6, { sampleRate: FS, dry: true, release: 1.0 } as never);
    const a = Math.round(0.9 * FS);
    panels.push({ data: r.left.slice(a, a + Math.round(0.5 * FS)), fs: FS });
  }
  spectrogramPng(join(OUT, `release-${m}-before-after.png`), panels, { dur: 0.5, fmax: 8000, win: 1024, hop: 24, height: 240 });
  console.log(`release-${m}`);
}
