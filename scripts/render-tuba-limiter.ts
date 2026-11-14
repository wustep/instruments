// The tuba's low register at fortissimo, alone, through an older engine (--before) and this checkout, as
// played (room, limiter): WAVs and MP3s at one gain, a stacked spectrogram (before on top), each note's
// limiter (the most it took off, dB) and how far the note's body sank under its own attack (the level 0.25–0.6 s
// into the note less its first 120 ms: a limiter working on one note ducks its body).
//   npx tsx scripts/render-tuba-limiter.ts --before <old>/packages/engine/src/core/index.ts [--out artifacts/round3/tuba-limiter]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';
import { lufs, peakDb } from './audio-measure.ts';
import { spectrogramPng } from './spectrogram.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'round3', 'tuba-limiter'))!);
const BEFORE = opt('--before');
const AFTER = resolve(opt('--after', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
type Eng = typeof import('../packages/engine/src/core/index.ts');
const engines: [string, Eng][] = [];
for (const [tag, path] of [...(BEFORE ? [['before', resolve(BEFORE)]] : []), ['after', AFTER]]) engines.push([tag, await import(pathToFileURL(path).href)]);
mkdirSync(OUT, { recursive: true });
const FS = 48000;
// [midi, start s, length s, velocity]: a low line at the recorded ff (112), its last notes harder
const NOTES: [number, number, number, number][] = [
  [29, 0.3, 1.3, 112], [36, 1.7, 0.6, 112], [34, 2.4, 0.6, 112], [27, 3.1, 1.8, 112],
  [29, 5.3, 0.3, 120], [29, 5.7, 0.3, 120], [36, 6.1, 0.3, 120], [29, 6.5, 1.2, 120],
  [26, 8.1, 2.0, 127], [38, 10.5, 1.4, 112],
];
const DUR = 12.6;
const index: Record<string, unknown> = { notes: NOTES.map(([m, t, d, v]) => ({ midi: m, t, d, v })) };
const monos: { data: Float32Array; fs: number }[] = [];
for (const [tag, E] of engines) {
  const core = E.createCore({ sampleRate: FS, instrument: 'tuba' });
  for (const [m, t, d, v] of NOTES) {
    core.schedule({ type: 'noteOn', midi: m, velocity: v }, Math.round(t * FS));
    core.schedule({ type: 'noteOff', midi: m }, Math.round((t + d) * FS));
  }
  const n = Math.round(DUR * FS);
  const L = new Float32Array(n), R = new Float32Array(n), gr = new Float32Array(Math.ceil(n / 128));
  const l = new Float32Array(128), r = new Float32Array(128);
  for (let i = 0, b = 0; i < n; i += 128, b++) {
    core.process(l, r, 128);
    L.set(l.subarray(0, Math.min(128, n - i)), i); R.set(r.subarray(0, Math.min(128, n - i)), i);
    gr[b] = (core as unknown as { limiter: { reduction: number } }).limiter.reduction;
  }
  const lvl = (a: number, b: number) => {
    let s = 0;
    for (let i = Math.round(a * FS); i < Math.round(b * FS); i++) s += L[i] * L[i] + R[i] * R[i];
    return 10 * Math.log10(s / (2 * (b - a) * FS) + 1e-20);
  };
  const notes = NOTES.map(([m, t, d, v]) => {
    let g = 1;
    for (let b = Math.floor(t * FS / 128); b < Math.ceil((t + d) * FS / 128); b++) g = Math.min(g, gr[b]);
    const body = d >= 0.6 ? lvl(t + 0.25, t + 0.6) - lvl(t, t + 0.12) : NaN;
    return { note: E.midiName(m), v, limiterDb: +(-20 * Math.log10(g)).toFixed(1), bodyUnderAttackDb: Number.isFinite(body) ? +body.toFixed(1) : null, levelDb: +lvl(t, t + Math.min(d, 0.6)).toFixed(1) };
  });
  index[tag] = { lufs: +lufs(L, R, FS).toFixed(1), peakDb: +peakDb(L, R).toFixed(1), notes };
  const wav = join(OUT, `tuba-ff-low-${tag}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '192k', join(OUT, `tuba-ff-low-${tag}.mp3`)]);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = 0.5 * (L[i] + R[i]);
  monos.push({ data: mono, fs: FS });
  if (!args.includes('--wav')) rmSync(wav);
}
spectrogramPng(join(OUT, 'tuba-ff-low-spectrogram.png'), monos, { dur: DUR, fmax: 4000, win: 4096, hop: 512, height: 260, range: 70 });
writeFileSync(join(OUT, 'numbers.json'), JSON.stringify(index, null, 1) + '\n');
for (const [tag] of engines) {
  const x = index[tag] as { lufs: number; peakDb: number; notes: { note: string; v: number; limiterDb: number; bodyUnderAttackDb: number | null }[] };
  console.log(`${tag.padEnd(7)} ${x.lufs} LUFS, peak ${x.peakDb} dBFS   ` + x.notes.map((q) => `${q.note}/${q.v} ${q.limiterDb}${q.bodyUnderAttackDb === null ? '' : ` (${q.bodyUnderAttackDb >= 0 ? '+' : ''}${q.bodyUnderAttackDb})`}`).join('  '));
}
