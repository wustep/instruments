// The polish pass's before and after, from the engines themselves: the harp's, the glockenspiel's or the
// tuba's phrase (scripts/polish-phrases.mjs: one note repeated, long notes, a passage) through an older
// engine (--before) and this checkout, as played (the room, the limiter), as MP3s at one gain, a stacked
// spectrogram (before on top), and the numbers a machine gives itself away by: how far the repeats of one
// note differ from each other (the level and the brightness of each one's first 150 ms: a standard
// deviation), and how much a held note's brightness moves while it is held.
//   npx tsx scripts/render-polish.ts --instrument glockenspiel --before <old>/packages/engine/src/core/index.ts [--out artifacts/round3/glockenspiel-polish]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav, spectrum } from '../packages/engine/src/analysis/index.ts';
import { lufs, peakDb } from './audio-measure.ts';
import { spectrogramPng } from './spectrogram.ts';
// @ts-expect-error (a plain module shared with scripts/sample-live.mjs)
import { polish } from './polish-phrases.mjs';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ID = opt('--instrument', 'glockenspiel')!;
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'round3', `${ID}-polish`))!);
const BEFORE = opt('--before');
const AFTER = resolve(opt('--after', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
type Render = typeof import('../packages/engine/src/core/index.ts').renderInstrument;
const engines: [string, Render][] = [];
for (const [tag, path] of [...(BEFORE ? [['before', resolve(BEFORE)]] : []), ['after', AFTER]]) engines.push([tag, (await import(pathToFileURL(path).href)).renderInstrument]);
mkdirSync(OUT, { recursive: true });
const FS = 48000;
const phrase = polish(ID) as { events: { time: number; event: never }[]; duration: number; repeats: [number, number, number, number][]; held: [number, number, number][] };

const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
/** a span's level (dB) and spectral centroid (Hz, 60 Hz–12 kHz) */
function look(x: Float32Array, from: number, len: number): { db: number; centroid: number } {
  const a = Math.max(0, Math.round(from * FS));
  const n = Math.min(x.length - a, Math.round(len * FS));
  let sq = 0;
  for (let i = 0; i < n; i++) sq += x[a + i] * x[a + i];
  let nfft = 1024;
  while (nfft < n) nfft *= 2;
  const sp = spectrum(x, FS, a, n, nfft, 'hann');
  let num = 0;
  let den = 0;
  for (let b = 0; b < sp.mag.length; b++) {
    const f = b * sp.binHz;
    if (f < 60 || f > 12000) continue;
    num += f * sp.mag[b] * sp.mag[b];
    den += sp.mag[b] * sp.mag[b];
  }
  return { db: 10 * Math.log10(sq / Math.max(1, n) + 1e-20), centroid: den > 0 ? num / den : 0 };
}

const index: Record<string, unknown> = { instrument: ID, seconds: phrase.duration, notes: phrase.events.filter((e) => (e.event as { type: string }).type === 'noteOn').length };
const monos: { data: Float32Array; fs: number }[] = [];
for (const [tag, render] of engines) {
  const out = render({ sampleRate: FS, instrument: ID as never, events: phrase.events, duration: phrase.duration });
  const mono = new Float32Array(out.left.length);
  for (let i = 0; i < mono.length; i++) mono[i] = 0.5 * (out.left[i] + out.right[i]);
  monos.push({ data: mono, fs: FS });
  const wav = join(OUT, `${ID}-${tag}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [out.left, out.right] }));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '96k', join(OUT, `${ID}-${tag}.mp3`)]);
  rmSync(wav);
  // each run of repeats: how its notes differ (the first 150 ms of each, or the gap if shorter)
  const repeats = phrase.repeats.map(([t0, n, step, midi]) => {
    const ls = Array.from({ length: n }, (_, k) => look(mono, t0 + k * step + 0.004, Math.min(0.15, step * 0.9)));
    return { midi, n, levelSdDb: +sd(ls.map((l) => l.db)).toFixed(2), centroidSdCents: +sd(ls.map((l) => 1200 * Math.log2(l.centroid))).toFixed(0), levelsDb: ls.map((l) => +l.db.toFixed(1)) };
  });
  // each held note: its brightness every 100 ms from 0.3 s in, how far that moves (a standard deviation, cents)
  const held = phrase.held.map(([t0, len, midi]) => {
    const cs: number[] = [];
    const ds: number[] = [];
    for (let t = t0 + 0.3; t + 0.2 <= t0 + len; t += 0.1) {
      const l = look(mono, t, 0.2);
      cs.push(1200 * Math.log2(l.centroid));
      ds.push(l.db);
    }
    return { midi, seconds: len, centroidMoveCents: +sd(cs).toFixed(0), levelMoveDb: +sd(ds.map((d, i) => d - (ds[0] + ((ds[ds.length - 1] - ds[0]) * i) / Math.max(1, ds.length - 1)))).toFixed(2) };
  });
  let at = 0;
  for (let i = 1; i < mono.length; i++) if (Math.abs(out.left[i]) > Math.abs(out.left[at])) at = i;
  const row = { peakDb: +peakDb(out.left, out.right).toFixed(1), peakAt: +(at / FS).toFixed(2), lufs: +lufs(out.left, out.right, FS).toFixed(1), repeats, held };
  index[tag] = row;
  console.log(tag, JSON.stringify(row));
}
// (the whole phrase, 1400 columns across; before on top)
spectrogramPng(join(OUT, `${ID}.png`), monos, { start: 0, dur: phrase.duration, hop: Math.round((phrase.duration * 48000) / 1400), win: ID === 'tuba' ? 4096 : 2048, fmax: ID === 'tuba' ? 3000 : ID === 'harp' ? 8000 : 16000, height: 260 });
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1) + '\n');
console.log(`wrote ${OUT}`);
