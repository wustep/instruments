// Violin and viola before/after (NEXT5 item 1: bodies fitted to the Iowa recordings, brightness
// that follows the bow force): the same passages through an older engine (--before) and this
// checkout, as MP3s with the site's room (before and after at one gain, so their loudness compares),
// stacked spectrograms (before on top), and the dry renders' centroid and level per note.
// Original material only.
//   npx tsx scripts/render-bowed.ts --before <old>/packages/engine/src/core/index.ts --out artifacts/realistic-3d/final-next5/1-bowed/audio
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeSustained, encodeWav } from '../packages/engine/src/analysis/index.ts';
import { spectrogramPng } from './spectrogram.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'realistic-3d', 'final-next5', '1-bowed', 'audio'))!);
const BEFORE = opt('--before');
const AFTER = resolve(opt('--after', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
type Render = typeof import('../packages/engine/src/core/index.ts').renderInstrument;
const engines: [string, Render][] = [];
for (const [tag, path] of [...(BEFORE ? [['before', resolve(BEFORE)]] : []), ['after', AFTER]]) engines.push([tag, (await import(pathToFileURL(path).href)).renderInstrument]);
mkdirSync(OUT, { recursive: true });
const FS = 48000;
type Ev = { time: number; event: Record<string, unknown> };
/** [midi, start s, duration s, velocity] */
type Note = [number, number, number, number];
const notes = (ns: Note[]): Ev[] => ns.flatMap(([m, t, d, v]) => [{ time: t, event: { type: 'noteOn', midi: m, velocity: v } }, { time: t + d, event: { type: 'noteOff', midi: m } }]);
type Inst = 'violin' | 'viola';
interface Piece { inst: Inst; name: string; what: string; ns: Note[]; extra?: Ev[]; dur: number; params?: Record<string, unknown> }

const PIECES: Piece[] = [];
for (const [inst, ms] of [
  ['violin', [59, 71, 81]],
  ['viola', [52, 64, 72]],
] as [Inst, number[]][]) {
  // 1. one note on each of three strings at pp, mf, ff: the brightness with the bow's force
  const ns: Note[] = [];
  let t = 0.1;
  for (const m of ms)
    for (const v of [30, 70, 112]) {
      ns.push([m, t, 1.5, v]);
      t += 1.75;
    }
  PIECES.push({ inst, name: `${inst}-dynamics`, what: `${ms.join(', ')} each at pp, mf, ff (velocity 30, 70, 112), 1.5 s, vibrato`, ns, dur: t + 0.8 });
}
// 2. an original legato phrase with a crescendo and a diminuendo
{
  const line = (base: number, steps: number[], vel: number[]): Note[] => {
    const out: Note[] = [];
    let t = 0.1;
    steps.forEach((s, i) => {
      const d = i === steps.length - 1 ? 1.8 : i % 4 === 3 ? 0.9 : 0.45;
      out.push([base + s, t, d + 0.02, vel[i]]);
      t += d;
    });
    return out;
  };
  const steps = [0, 2, 4, 5, 7, 9, 7, 5, 4, 5, 7, 12, 11, 9, 7, 4, 5, 2, 0];
  const vel = steps.map((_, i) => Math.round(40 + 70 * Math.sin((Math.PI * i) / (steps.length - 1))));
  PIECES.push({ inst: 'violin', name: 'violin-phrase', what: 'an original legato line from G4, crescendo to ff and back', ns: line(67, steps, vel), dur: 11.5 });
  PIECES.push({ inst: 'viola', name: 'viola-phrase', what: 'the same line from C4', ns: line(60, steps, vel), dur: 11.5 });
}
// 3. one held note with the bow pressed harder and lighter (mod wheel: the pressure controller)
for (const [inst, m] of [
  ['violin', 69 + 2],
  ['viola', 62 + 2],
] as [Inst, number][]) {
  const extra: Ev[] = [];
  for (let i = 0; i <= 60; i++) extra.push({ time: 0.6 + (i / 60) * 5, event: { type: 'control', cc: 1, value: 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / 60) } });
  extra.unshift({ time: 0, event: { type: 'control', cc: 1, value: 0 } });
  PIECES.push({ inst, name: `${inst}-pressure`, what: `${m} held at mf while the mod wheel presses the bow from light to hard and back (5 s)`, ns: [[m, 0.1, 6.2, 70]], extra, dur: 7 });
}

const mono = (r: { left: ArrayLike<number>; right: ArrayLike<number> }) => Float32Array.from(r.left, (v, i) => 0.5 * (v + r.right[i]));
const events = (p: Piece) => [...(p.extra ?? []), ...notes(p.ns)].sort((a, b) => a.time - b.time);

// ---------------------------------------------------------------- metrics (dry renders)
const metrics: Record<string, Record<string, unknown>> = {};
for (const [tag, render] of engines) {
  const m: Record<string, unknown> = {};
  for (const p of PIECES.filter((q) => q.name.endsWith('dynamics'))) {
    const x = mono(render({ sampleRate: FS, instrument: p.inst, dry: true, events: events(p) as never, duration: p.dur }));
    m[p.name] = p.ns.map(([midi, t, d, v]) => {
      const a = analyzeSustained(x, FS, { start: Math.round(t * FS), end: Math.round((t + d) * FS) }, midi);
      return { midi, velocity: v, centroidHz: Math.round(a.centroid), rmsDb: +a.rmsDb.toFixed(1) };
    });
  }
  metrics[tag] = m;
}

// ---------------------------------------------------------------- audio and spectrograms
for (const p of PIECES) {
  const rs = engines.map(([tag, render]) => [tag, render({ sampleRate: FS, instrument: p.inst, events: events(p) as never, duration: p.dur })] as const);
  let pk = 0;
  for (const [, r] of rs) for (let i = 0; i < r.left.length; i++) pk = Math.max(pk, Math.abs(r.left[i]), Math.abs(r.right[i]));
  const g = pk > 0 ? Math.pow(10, -1 / 20) / pk : 1;
  const monos: { data: Float32Array; fs: number }[] = [];
  for (const [tag, r] of rs) {
    const L = Float32Array.from(r.left, (v) => v * g);
    const R = Float32Array.from(r.right, (v) => v * g);
    const wav = join(OUT, `${p.name}-${tag}.wav`);
    writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }, 16));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '160k', join(OUT, `${p.name}-${tag}.mp3`)]);
    rmSync(wav);
    monos.push({ data: Float32Array.from(L, (v, i) => 0.5 * (v + R[i])), fs: FS });
    console.log(`${p.name}-${tag}.mp3`);
  }
  spectrogramPng(join(OUT, `${p.name}.png`), monos, { start: 0, dur: p.dur, fmax: 12000, win: 2048, hop: Math.max(64, Math.round((p.dur * FS) / 960)), range: 80, height: 220 });
  console.log(`${p.name}.png (${engines.map(([t]) => t).join(' over ')})`);
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify({ pieces: PIECES.map((p) => ({ name: p.name, what: p.what })), metrics }, null, 1) + '\n');
console.log(JSON.stringify(metrics, null, 1));
