// Voicing pass for the flute model: play every note at nominal breath, measure the
// sounding pitch (autocorrelation, 0.6–1.4 s), and store the correction in cents.
// Two iterations converge to within ~1 cent. Run: npx tsx scripts/tune-flute.ts [--fs 22050,96000]
// (--fs: tune only these rates, adding their rows and keeping every other rate's row as it is)
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FluteCore } from '../packages/engine/src/core/flute.ts';

const OUT = join(import.meta.dirname, '..', 'packages/engine/src/core/flute-tuning.json');
const midis = Array.from({ length: 37 }, (_, i) => 60 + i);
const argFs = process.argv.includes('--fs') ? process.argv[process.argv.indexOf('--fs') + 1].split(',').map(Number) : null;
const kept = JSON.parse(readFileSync(OUT, 'utf8')) as { fs: number[]; midi: number[]; cents: number[][] };
/** the rates tuned now, and the table's rates when done (sorted: the core interpolates between them) */
const FSS = argFs ?? [44100, 48000];
const ALL = [...new Set([...(argFs ? kept.fs : []), ...FSS])].sort((a, b) => a - b);

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
  const cur = JSON.parse(readFileSync(OUT, 'utf8')) as { fs: number[]; midi: number[]; cents: number[][] };
  FluteCore.tuningTable = cur;
  // a rate not yet in the table starts from the nearest row (what the core played there until now)
  const rowOf = (fs: number) => {
    const i = cur.fs.indexOf(fs);
    if (i >= 0) return cur.cents[i];
    const near = cur.fs.reduce((a, b) => (Math.abs(b - fs) < Math.abs(a - fs) ? b : a));
    return cur.cents[cur.fs.indexOf(near)];
  };
  let maxErr = 0;
  const table: number[][] = ALL.map((fs) => {
    const prev = rowOf(fs);
    if (!FSS.includes(fs)) return prev;
    return midis.map((m, mi) => {
      const err = measure(fs, m);
      if (Number.isFinite(err)) maxErr = Math.max(maxErr, Math.abs(err));
      return Number.isFinite(err) ? +(prev[mi] + err).toFixed(2) : prev[mi];
    });
  });
  writeFileSync(OUT, JSON.stringify({ fs: ALL, midi: midis, cents: table }) + '\n');
  console.log(`iteration ${iter + 1}: max |err| before update`, maxErr.toFixed(1));
}
// verify; a note that did not converge (the model does not speak it at that rate: at 22.05 kHz the top of
// the flute's compass, periods of ten samples, sounds another mode whatever the correction) keeps what
// it had before, so tuning a new rate never makes a note worse
const done = JSON.parse(readFileSync(OUT, 'utf8')) as { fs: number[]; midi: number[]; cents: number[][] };
FluteCore.tuningTable = done;
for (const fs of FSS) {
  const fi = done.fs.indexOf(fs);
  const start = kept.fs.includes(fs) ? kept.cents[kept.fs.indexOf(fs)] : kept.cents[kept.fs.indexOf(kept.fs.reduce((a, b) => (Math.abs(b - fs) < Math.abs(a - fs) ? b : a)))];
  const res = midis.map((m) => measure(fs, m));
  const off = midis.filter((_, mi) => !(Math.abs(res[mi]) <= 25));
  for (const m of off) done.cents[fi][m - midis[0]] = start[m - midis[0]];
  console.log(`residual cents @${fs / 1000}k`, res.map((x) => x.toFixed(1)).join(' '));
  if (off.length) console.log(`  not converged at ${fs / 1000}k, kept as before: ${off.map((m) => `m${m}`).join(' ')}`);
}
writeFileSync(OUT, JSON.stringify(done) + '\n');
