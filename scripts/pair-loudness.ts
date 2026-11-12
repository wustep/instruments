// A before/after pair of clips at one loudness, for listening: both WAVs (or the same stretch of each) are
// brought to the same integrated loudness (ITU-R BS.1770, scripts/audio-measure.ts `lufs`), by one gain each,
// the target lowered for both if either would peak over −1 dBFS; written as MP3 (and WAV with --wav).
//   npx tsx scripts/pair-loudness.ts --out artifacts/symphony-robot --name trombone --before a.wav --after b.wav
//       [--start 206 --dur 56] [--lufs -18] [--wav] [--kbps 160]
// Prints each one's loudness and peak as it was and as written.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeWav, encodeWav } from '../packages/engine/src/analysis/index.ts';
import { lufs } from './audio-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d = '') => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = opt('--out', '.');
const NAME = opt('--name', 'clip');
const START = Number(opt('--start', '0'));
const DUR = Number(opt('--dur', '0'));
const TARGET = Number(opt('--lufs', '-18'));
const KBPS = opt('--kbps', '160');
const WAV = args.includes('--wav');
mkdirSync(OUT, { recursive: true });

function load(path: string): { L: Float32Array; R: Float32Array; fs: number } {
  const a = decodeWav(new Uint8Array(readFileSync(path)));
  const fs = a.sampleRate;
  const i0 = Math.round(START * fs);
  const i1 = DUR > 0 ? Math.min(a.channels[0].length, i0 + Math.round(DUR * fs)) : a.channels[0].length;
  return { L: a.channels[0].slice(i0, i1), R: (a.channels[1] ?? a.channels[0]).slice(i0, i1), fs };
}
const peakDb = (x: { L: Float32Array; R: Float32Array }) => {
  let p = 0;
  for (let i = 0; i < x.L.length; i++) p = Math.max(p, Math.abs(x.L[i]), Math.abs(x.R[i]));
  return 20 * Math.log10(p + 1e-12);
};
const clips = [
  { tag: 'before', x: load(opt('--before')) },
  { tag: 'after', x: load(opt('--after')) },
].map((c) => ({ ...c, lufs: lufs(c.x.L, c.x.R, c.x.fs), peak: peakDb(c.x) }));
// one target for both: lowered if either would peak over −1 dBFS
let target = TARGET;
for (const c of clips) target = Math.min(target, c.lufs + (-1 - c.peak));
for (const c of clips) {
  const g = 10 ** ((target - c.lufs) / 20);
  const L = c.x.L.map((v) => v * g);
  const R = c.x.R.map((v) => v * g);
  // (a 30 ms fade at each end of a stretch cut out of a longer take: no click)
  if (START > 0 || DUR > 0) {
    const n = Math.round(0.03 * c.x.fs);
    for (let i = 0; i < n && i < L.length; i++) {
      const w = 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
      L[i] *= w;
      R[i] *= w;
      L[L.length - 1 - i] *= w;
      R[R.length - 1 - i] *= w;
    }
  }
  const wav = join(OUT, `${NAME}-${c.tag}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: c.x.fs, channels: [L, R] }));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', `${KBPS}k`, join(OUT, `${NAME}-${c.tag}.mp3`)]);
  if (!WAV) rmSync(wav);
  console.log(`${NAME}-${c.tag}: ${c.lufs.toFixed(1)} LUFS, peak ${c.peak.toFixed(1)} dBFS as rendered → ${lufs(L, R, c.x.fs).toFixed(1)} LUFS, peak ${peakDb({ L, R }).toFixed(1)} dBFS (${(L.length / c.x.fs).toFixed(1)} s)`);
}
