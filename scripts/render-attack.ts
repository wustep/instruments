// Key-down audit: the same passages through an earlier engine (before) and this one (after), as
// MP3 with a spectrogram each, plus 0–300 ms attack close-ups of single notes (dry) next to the
// Iowa Steinway (analysis only: the recordings' audio is never written out).
//   npx tsx scripts/render-attack.ts --before <repo>/packages/engine/src/core/index.ts [--out dir]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeWav, encodeWav } from '../packages/engine/src/analysis/index.ts';
import { spectrogramPng, type Mono } from './spectrogram.ts';
import { wavPath, type Dyn } from './references.ts';

type Core = typeof import('../packages/engine/src/core/index.ts');
const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'round3', 'attack'))!);
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
const repeated = (m: number, n: number, gap: number, hold: number) =>
  Array.from({ length: n }, (_, i) => on(m, 0.1 + i * gap, i === n - 1 ? 1.2 : hold, 66 + ((i * 7) % 5) * 3)).flat();
const MID = 61; // C#4 (an Iowa note)
const BASS = 33; // A1
const passages: [string, Ev[], number][] = [
  ['mid-single', on(MID, 0.1, 1.4, 72), 2.2],
  ['bass-single', on(BASS, 0.1, 1.8, 72), 2.6],
  ['mid-repeated', repeated(MID, 10, 0.11, 0.07), 2.6],
  ['bass-repeated', repeated(BASS, 10, 0.11, 0.07), 2.8],
];
for (const [tag, E] of engines) {
  for (const [name, events, dur] of passages) {
    // as heard on the site: default parameters, room included
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
    spectrogramPng(join(OUT, `${name}-${tag}.png`), [{ data: L.map((v, i) => 0.5 * (v + R[i])), fs: FS }], { dur, fmax: 12000, win: 1024, hop: 96, height: 320 });
    console.log(`${name}-${tag}`);
  }
}
// attack close-ups, dry, 20 ms before the onset to 280 ms after: Iowa / before / after
function onsetOf(x: Float32Array): number {
  let pk = 0;
  for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i]));
  let o = 0;
  while (o < x.length && Math.abs(x[o]) < 0.05 * pk) o++;
  return o;
}
const cut = (m: Mono): Mono => {
  const o = onsetOf(m.data);
  const a = Math.max(0, o - Math.round(0.02 * m.fs));
  return { data: m.data.slice(a, a + Math.round(0.3 * m.fs)), fs: m.fs };
};
for (const [m, d, vel] of [[MID, 'mf', 72], [MID, 'ff', 112], [BASS, 'mf', 72], [45, 'mf', 72]] as [number, Dyn, number][]) {
  const panels: Mono[] = [];
  if (existsSync(wavPath(m, d))) {
    const ref = decodeWav(readFileSync(wavPath(m, d)));
    panels.push(cut({ data: ref.channels[0].slice(0, 3 * ref.sampleRate), fs: ref.sampleRate }));
  }
  for (const [, E] of engines) {
    const r = E.renderNote(m, vel, 1.0, { sampleRate: FS, dry: true });
    panels.push(cut({ data: r.left, fs: FS }));
  }
  spectrogramPng(join(OUT, `attack-${m}-${d}-iowa-before-after.png`), panels, { dur: 0.3, fmax: 12000, win: 256, hop: 12, height: 240 });
  console.log(`attack-${m}-${d}`);
}
