// Key-down judge: the piano's 6–12 kHz attack burst against the Iowa Steinway, with held-out notes.
//   burst: first 12 ms over the sustain (100–300 ms), model minus recording, dB
//   tail:  12–40 ms over the first 12 ms, model minus recording, dB (a ringing attack reads high)
// Only notes whose recorded burst clears the recording's hiss by 10 dB are judged (mostly ff);
// notes alternate between the fit half and the held-out half.
//   npx tsx scripts/attack-judge.ts [<repo>/packages/engine/src/core/index.ts]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeWav, fft } from '../packages/engine/src/analysis/index.ts';
import { wavPath, type Dyn } from './references.ts';
const E = (await import(pathToFileURL(resolve(process.argv[2] ?? 'packages/engine/src/core/index.ts')).href)) as typeof import('../packages/engine/src/core/index.ts');
function band(x: Float32Array, fs: number, a: number, len: number, lo: number, hi: number) {
  const N = 4096;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < len && a + i < x.length; i++) re[i] = x[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / len));
  fft(re, im);
  let s = 0;
  for (let k = Math.round((lo * N) / fs); k < Math.round((hi * N) / fs); k++) s += re[k] ** 2 + im[k] ** 2;
  return 10 * Math.log10(s / len + 1e-30);
}
function metrics(x: Float32Array, fs: number) {
  let pk = 0;
  for (let i = 0; i < Math.min(fs, x.length); i++) pk = Math.max(pk, Math.abs(x[i]));
  let on = 0;
  while (Math.abs(x[on]) < 0.05 * pk) on++;
  const a = Math.max(0, on - 20), W = Math.round(0.012 * fs);
  const b0 = band(x, fs, a, W, 6000, 12000);
  const burst = b0 - band(x, fs, on + Math.round(0.1 * fs), Math.round(0.2 * fs), 6000, 12000);
  const tail = band(x, fs, a + W, Math.round(0.028 * fs), 6000, 12000) - b0;
  const floor = b0 - band(x, fs, Math.max(0, on - Math.round(0.15 * fs)), Math.round(0.1 * fs), 6000, 12000);
  return [burst, tail, floor];
}
const notes = [33, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81, 85, 89, 93, 97, 101];
const acc = { fit: [[], []] as number[][], held: [[], []] as number[][] };
notes.forEach((m, ni) => {
  for (const d of ['mf', 'ff'] as Dyn[]) {
    let ref;
    try {
      ref = decodeWav(readFileSync(wavPath(m, d)));
    } catch {
      continue;
    }
    const r = metrics(ref.channels[0].slice(0, 2 * ref.sampleRate), ref.sampleRate);
    if (r[2] < 10) continue;
    const mo = metrics(E.renderNote(m, d === 'ff' ? 112 : 70, 0.6, { sampleRate: 44100, dry: true }).left, 44100);
    const k = ni % 2 ? 'held' : 'fit';
    acc[k][0].push(mo[0] - r[0]);
    acc[k][1].push(mo[1] - r[1]);
  }
});
const st = (a: number[]) => `${(a.reduce((s, v) => s + v, 0) / a.length).toFixed(1).padStart(5)} / ${(a.reduce((s, v) => s + Math.abs(v), 0) / a.length).toFixed(1).padStart(4)} (n=${a.length})`;
console.log(`burst (mean / |mean| dB): fit ${st(acc.fit[0])}, held-out ${st(acc.held[0])}`);
console.log(`tail  (mean / |mean| dB): fit ${st(acc.fit[1])}, held-out ${st(acc.held[1])}`);
