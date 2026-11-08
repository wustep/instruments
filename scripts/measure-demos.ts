// Measure the round-2 demo files themselves (decoded MP3): flute even/odd, piano tenor
// time-to-−10 dB, before (round-1 engine) vs after.  npx tsx scripts/measure-demos.ts
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeSustained, decodeWav, envelopeDb } from '../packages/engine/src/analysis/index.ts';
const S = mkdtempSync(join(tmpdir(), 'demos-'));
const load = (p: string) => {
  const w = `${S}/dm.wav`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', p, '-ac', '1', '-ar', '48000', w]);
  const a = decodeWav(readFileSync(w));
  return { x: a.channels[0], fs: a.sampleRate };
};
for (const tag of ['before', 'audio']) {
  const dir = `${import.meta.dirname}/../artifacts/round2/${tag}`;
  // flute: even/odd per note
  {
    const { x, fs } = load(`${dir}/flute-low-register.mp3`);
    const eo: number[] = [];
    for (const [m, t0, d] of [[60, 0.1, 0.9], [62, 1.05, 0.9], [64, 2.0, 0.9], [67, 2.95, 1.8], [65, 4.85, 0.9], [64, 5.8, 0.9], [62, 6.75, 0.9], [60, 7.7, 2.2]]) {
      const a = analyzeSustained(x, fs, { start: Math.round(t0 * fs), end: Math.round((t0 + d) * fs) }, m);
      eo.push(a.evenOddDb);
    }
    eo.sort((a, b) => a - b);
    console.log(tag, 'flute-low-register median even/odd dB', eo[Math.floor(eo.length / 2)].toFixed(1));
  }
  // piano tenor: time for the level to fall 10 dB after each strike (broadband EDT proxy)
  {
    const { x, fs } = load(`${dir}/piano-tenor-notes.mp3`);
    const env = envelopeDb(x, fs, 0.01);
    const out: string[] = [];
    for (const t0 of [0.1, 3.3, 6.5, 9.7]) {
      const i0 = Math.round(t0 / 0.01) + 3;
      let pk = -200;
      for (let i = i0; i < i0 + 10; i++) pk = Math.max(pk, env[i]);
      let j = i0 + 10;
      while (j < i0 + 300 && env[j] > pk - 10) j++;
      out.push(j < i0 + 300 ? `${((j - i0) * 0.01).toFixed(2)} s` : '>3 s');
    }
    console.log(tag, 'piano-tenor-notes: time to -10 dB (F2 A2 C3 E3):', out.join(', '));
  }
}
