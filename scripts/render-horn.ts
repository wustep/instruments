// The horn's audio examples: long tones across its compass at pp, mf, ff; an original legato phrase,
// a horn call up an arpeggio and a singing line down through the middle register, with a swell; its own
// piece (the horn's line of Beethoven's Horn Sonata, I), through an older engine (--before: the start
// design, the foundation commit's voicing before it was fitted to the Iowa horn) and this checkout, as MP3s
// with the site's room (before and after at one gain), stacked spectrograms (before on top) and the dry
// renders' centroid, level and pitch per note.
//   npx tsx scripts/render-horn.ts [--before <old>/packages/engine/src/core/index.ts] [--out artifacts/realistic-3d/final-symphony/horn/audio]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeSustained, encodeWav } from '../packages/engine/src/analysis/index.ts';
import { parseMidi } from '../apps/web/src/midi-file.ts';
import { DEMOS, demoSong } from '../apps/web/src/orchestra/pieces.ts';
import { spectrogramPng } from './spectrogram.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'realistic-3d', 'final-symphony', 'horn', 'audio'))!);
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
interface Piece { name: string; what: string; ns: Note[]; dur: number }
const PIECES: Piece[] = [];
// 1. long tones across the compass at pp, mf, ff
{
  const ns: Note[] = [];
  let t = 0.1;
  for (const m of [35, 41, 48, 55, 62, 69, 76])
    for (const v of [30, 70, 112]) {
      ns.push([m, t, 1.4, v]);
      t += 1.65;
    }
  PIECES.push({ name: 'horn-long-tones', what: 'B1, F2, C3, G3, D4, A4, E5, each at pp, mf, ff (velocity 30, 70, 112), 1.4 s', ns, dur: t + 1 });
}
// 2. an original line in F: a call up the arpeggio from F2 to C5, then a legato line down through the middle
//    register to the low F, a swell to ff and back
{
  const steps = [0, 7, 12, 16, 19, 24, 28, 31, 29, 28, 26, 24, 22, 21, 19, 17, 16, 14, 12, 11, 9, 7, 5, 4, 2, 0];
  const vel = steps.map((_, i) => Math.round(45 + 67 * Math.sin((Math.PI * i) / (steps.length - 1))));
  const ns: Note[] = [];
  let t = 0.1;
  steps.forEach((s, i) => {
    const d = i === steps.length - 1 ? 2.4 : i < 8 ? (i === 7 ? 1.2 : 0.32) : i % 4 === 3 ? 0.9 : 0.45;
    ns.push([41 + s, t, d + (i < 8 ? -0.04 : 0.02), vel[i]]);
    t += d;
  });
  PIECES.push({ name: 'horn-phrase', what: 'an original line in F: a tongued call up the arpeggio from F2 to C5, then legato down through the middle register to the low F, a swell to ff and back', ns, dur: t + 1.2 });
}
// 3. its own piece (the play icon's): the horn's line of Beethoven's Horn Sonata, I. Allegro moderato
{
  const d = DEMOS.horn;
  const b = readFileSync(join(import.meta.dirname, '..', 'apps/web/public/pieces', d.file));
  const s = demoSong(parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer), d);
  const ns: Note[] = [];
  const open = new Map<number, [number, number]>();
  for (const e of s.events) {
    if (e.kind === 'on') open.set(e.midi, [e.t, e.vel]);
    else if (e.kind === 'off' && open.has(e.midi)) {
      const [t0, v] = open.get(e.midi)!;
      ns.push([e.midi, t0 + 0.1, e.t - t0, v]);
      open.delete(e.midi);
    }
  }
  PIECES.push({ name: 'horn-sonata', what: `${d.composer}, ${d.title} (Mutopia, public domain), as the play icon plays it`, ns, dur: s.duration + 2 });
}

const mono = (r: { left: ArrayLike<number>; right: ArrayLike<number> }) => Float32Array.from(r.left, (v, i) => 0.5 * (v + r.right[i]));
const events = (p: Piece) => notes(p.ns).sort((a, b) => a.time - b.time);

// ---------------------------------------------------------------- metrics (dry renders)
const metrics: Record<string, unknown> = {};
for (const [tag, render] of engines) {
    metrics[tag] = PIECES[0].ns.map(([midi, , d, v]) => {
    const x = mono(render({ sampleRate: FS, instrument: 'horn', dry: true, events: notes([[midi, 0.1, d, v]]) as never, duration: d + 0.3 }));
    const a = analyzeSustained(x, FS, { start: Math.round(0.1 * FS), end: Math.round((0.1 + d) * FS) }, midi);
    return { midi, velocity: v, centroidHz: Math.round(a.centroid), rmsDb: +a.rmsDb.toFixed(1), cents: +a.cents.toFixed(1) };
  });
}

// ---------------------------------------------------------------- audio and spectrograms
for (const p of PIECES) {
  const rs = engines.map(([tag, render]) => [tag, render({ sampleRate: FS, instrument: 'horn', events: events(p) as never, duration: p.dur })] as const);
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
  spectrogramPng(join(OUT, `${p.name}.png`), monos, { start: 0, dur: p.dur, fmax: 4000, win: 4096, hop: Math.max(64, Math.round((p.dur * FS) / 960)), range: 80, height: 220 });
  console.log(`${p.name}.png (${engines.map(([t]) => t).join(' over ')})`);
}

writeFileSync(join(OUT, 'metrics.json'), JSON.stringify({ pieces: PIECES.map((p) => ({ name: p.name, what: p.what })), metrics }, null, 1) + '\n');
console.log(JSON.stringify(metrics));
