// Sound audit: the same notes from the Iowa recordings and from the model, as WAV
// (for spectrograms) — analysis only; reference audio is not written to the repo.
//   npx tsx scripts/audit-render.ts <outdir> [--engine path/to/core/index.ts]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodeWav, encodeWav } from '../packages/engine/src/analysis/index.ts';
import { wavPath, type Dyn } from './references.ts';
const args = process.argv.slice(2);
const OUT = resolve(args[0] ?? '.cache/audit');
const ENGINE = args.includes('--engine') ? resolve(args[args.indexOf('--engine') + 1]) : resolve('packages/engine/src/core/index.ts');
const { renderNote } = (await import(pathToFileURL(ENGINE).href)) as typeof import('../packages/engine/src/core/index.ts');
mkdirSync(OUT, { recursive: true });
const FS = 44100;
for (const [m, d] of [[45, 'mf'], [61, 'mf'], [85, 'mf'], [61, 'ff']] as [number, Dyn][]) {
  const ref = decodeWav(readFileSync(wavPath(m, d)));
  const n = Math.round(3 * ref.sampleRate);
  const rx = ref.channels.map((c) => c.slice(0, n));
  // align the reference onset to 50 ms
  let on = 0;
  const pk = Math.max(...Array.from(rx[0].slice(0, Math.round(1.5 * ref.sampleRate))).map(Math.abs));
  while (on < rx[0].length && Math.abs(rx[0][on]) < 0.05 * pk) on++;
  const sh = Math.max(0, on - Math.round(0.05 * ref.sampleRate));
  writeFileSync(join(OUT, `ref-${m}-${d}.wav`), encodeWav({ sampleRate: ref.sampleRate, channels: rx.map((c) => Float32Array.from(c.subarray(sh, sh + n))) }, 16));
  const r = renderNote(m, d === 'ff' ? 112 : 70, 3.05, { sampleRate: FS, dry: true });
  const L = r.left.slice(Math.round(0.01 * FS) - Math.round(0.05 * FS) + Math.round(0.05 * FS));
  let mx = 0;
  for (let i = 0; i < r.left.length; i++) mx = Math.max(mx, Math.abs(r.left[i]), Math.abs(r.right[i]));
  const g = 0.5 / mx;
  writeFileSync(join(OUT, `model-${m}-${d}.wav`), encodeWav({ sampleRate: FS, channels: [Float32Array.from(r.left, (v) => v * g), Float32Array.from(r.right, (v) => v * g)] }, 16));
  void L;
  console.log('wrote', m, d);
}
