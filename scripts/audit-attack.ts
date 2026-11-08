// Sound audit: energy in the first 12 ms after the onset relative to the sustain (100–300 ms),
// per band, for the reference and model notes written by scripts/audit-render.ts.
//   npx tsx scripts/audit-render.ts .cache/audit && npx tsx scripts/audit-attack.ts
import { readFileSync } from 'node:fs';
import { decodeWav, fft } from '../packages/engine/src/analysis/index.ts';
const bands = [[100, 300], [300, 1000], [1000, 3000], [3000, 6000], [6000, 12000]];
function bandDb(x: Float32Array, fs: number, a: number, len: number): number[] {
  const N = 4096;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < len && a + i < x.length; i++) re[i] = x[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / len));
  fft(re, im);
  return bands.map(([lo, hi]) => {
    let s = 0;
    for (let k = Math.round((lo * N) / fs); k < Math.round((hi * N) / fs); k++) s += re[k] * re[k] + im[k] * im[k];
    return 10 * Math.log10(s / len + 1e-30);
  });
}
for (const f of ['45-mf', '61-mf', '85-mf', '61-ff']) {
  const out: string[] = [];
  for (const w of ['ref', 'model']) {
    const a = decodeWav(readFileSync(`.cache/audit/${w}-${f}.wav`));
    const x = a.channels[0];
    const fs = a.sampleRate;
    let pk = 0;
    for (let i = 0; i < fs; i++) pk = Math.max(pk, Math.abs(x[i]));
    let on = 0;
    while (Math.abs(x[on]) < 0.05 * pk) on++;
    const att = bandDb(x, fs, Math.max(0, on - 20), Math.round(0.012 * fs));
    const sus = bandDb(x, fs, on + Math.round(0.1 * fs), Math.round(0.2 * fs));
    out.push(`${w}: ${att.map((v, i) => (v - sus[i]).toFixed(0).padStart(4)).join('')}`);
  }
  console.log(f.padEnd(6), 'attack-minus-sustain dB per band [0.1-.3 .3-1 1-3 3-6 6-12 kHz]', out.join('  |  '));
}
