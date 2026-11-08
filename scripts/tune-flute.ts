// Voicing pass for the flute model: play every note at nominal breath, measure the
// sounding pitch (autocorrelation, 0.6–1.4 s), and store the correction in cents.
// Two iterations converge to within ~1 cent. Run: npx tsx scripts/tune-flute.ts
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FluteCore } from '../packages/engine/src/core/flute.ts';

const OUT = join(import.meta.dirname, '..', 'packages/engine/src/core/flute-tuning.json');
const midis = Array.from({ length: 37 }, (_, i) => 60 + i);
const FSS = [44100, 48000];

function measure(fs: number, m: number): number {
  const c = new FluteCore({ sampleRate: fs, dry: true, params: { vibrato: 0, noise: 0.3 } });
  c.schedule({ type: 'noteOn', midi: m, velocity: 80 }, 64);
  const n = Math.round(1.5 * fs / 128) * 128;
  const L = new Float32Array(n);
  const bl = new Float32Array(128), br = new Float32Array(128);
  for (let i = 0; i < n; i += 128) { c.process(bl, br, 128); L.set(bl, i); }
  const f = 440 * 2 ** ((m - 69) / 12);
  const s0 = Math.round(0.6 * fs), W = Math.round(0.6 * fs);
  const ac = (lag: number) => { let s = 0; for (let i = 0; i < W; i++) s += L[s0 + i] * L[s0 + i + lag]; return s; };
  const lo = Math.floor(fs / (f * 1.08)), hi = Math.ceil(fs / (f * 0.93));
  let best = -Infinity, bl2 = lo;
  for (let lag = lo; lag <= hi; lag++) { const v = ac(lag); if (v > best) { best = v; bl2 = lag; } }
  const a = ac(bl2 - 1), b = ac(bl2), cc = ac(bl2 + 1);
  const p = (0.5 * (a - cc)) / (a - 2 * b + cc);
  return 1200 * Math.log2(fs / (bl2 + p) / f);
}

for (let iter = 0; iter < 2; iter++) {
  const cur = JSON.parse(readFileSync(OUT, 'utf8'));
  FluteCore.tuningTable = cur;
  const table: number[][] = FSS.map((fs, fi) => midis.map((m, mi) => {
    const err = measure(fs, m);
    const prev = cur.cents?.[fi]?.[mi] ?? 0;
    return Number.isFinite(err) ? +(prev + err).toFixed(2) : prev;
  }));
  writeFileSync(OUT, JSON.stringify({ fs: FSS, midi: midis, cents: table }) + '\n');
  console.log(`iteration ${iter + 1}: max |err| before update`, Math.max(...table.flat().map((v, i) => Math.abs(v - ((cur.cents?.flat?.() ?? [])[i] ?? 0)))).toFixed(1));
}
// verify
FluteCore.tuningTable = JSON.parse(readFileSync(OUT, 'utf8'));
const res = FSS.map((fs) => midis.map((m) => measure(fs, m)));
console.log('residual cents @44.1k', res[0].map((x) => x.toFixed(1)).join(' '));
console.log('residual cents @48k  ', res[1].map((x) => x.toFixed(1)).join(' '));
