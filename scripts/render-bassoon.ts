// The bassoon's audio examples: long tones across its compass at pp, mf, ff; an original legato phrase
// from the low register up through the tenor and back, with a swell and a dying fall; its own piece (the
// solo line of Mozart's Bassoon Concerto Andante), through an older engine (--before: the start design,
// the foundation commit's voicing before it was fitted to the Iowa bassoon) and this checkout, as MP3s
// with the site's room (before and after at one gain), stacked spectrograms (before on top) and the dry
// renders' centroid, level and pitch per note.
//   npx tsx scripts/render-bassoon.ts [--before <old>/packages/engine/src/core/index.ts] [--out artifacts/realistic-3d/final-symphony/bassoon/audio]
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
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'realistic-3d', 'final-symphony', 'bassoon', 'audio'))!);
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
  for (const m of [34, 41, 48, 55, 62, 69, 75])
    for (const v of [30, 70, 112]) {
      ns.push([m, t, 1.4, v]);
      t += 1.65;
    }
  PIECES.push({ name: 'bassoon-long-tones', what: 'B♭1, F2, C3, G3, D4, A4, E♭5, each at pp, mf, ff (velocity 30, 70, 112), 1.4 s', ns, dur: t + 1 });
}
// 2. an original legato line in D minor from D2 up through the tenor register to A4 and back, a swell
{
  const steps = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 22, 24, 26, 27, 29, 31, 29, 26, 24, 22, 19, 15, 12, 7, 3, 0];
  const vel = steps.map((_, i) => Math.round(40 + 72 * Math.sin((Math.PI * i) / (steps.length - 1))));
  const ns: Note[] = [];
  let t = 0.1;
  steps.forEach((s, i) => {
    const d = i === steps.length - 1 ? 2.4 : i % 4 === 3 ? 0.9 : 0.45;
    ns.push([38 + s, t, d + 0.02, vel[i]]);
    t += d;
  });
  PIECES.push({ name: 'bassoon-phrase', what: 'an original legato line from D2 (D minor) up through the tenor register to A4 and back, a swell to ff and back', ns, dur: t + 1.2 });
}
// 3. its own piece (the play icon's): the solo line of Mozart's Bassoon Concerto, II. Andante ma adagio
{
  const d = DEMOS.bassoon;
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
  PIECES.push({ name: 'bassoon-andante', what: `${d.composer}, ${d.title} (Mutopia, public domain), as the play icon plays it`, ns, dur: s.duration + 2 });
}

const mono = (r: { left: ArrayLike<number>; right: ArrayLike<number> }) => Float32Array.from(r.left, (v, i) => 0.5 * (v + r.right[i]));
const events = (p: Piece) => notes(p.ns).sort((a, b) => a.time - b.time);

// ---------------------------------------------------------------- metrics (dry renders)
const metrics: Record<string, unknown> = {};
for (const [tag, render] of engines) {
    metrics[tag] = PIECES[0].ns.map(([midi, , d, v]) => {
    const x = mono(render({ sampleRate: FS, instrument: 'bassoon', dry: true, events: notes([[midi, 0.1, d, v]]) as never, duration: d + 0.3 }));
    const a = analyzeSustained(x, FS, { start: Math.round(0.1 * FS), end: Math.round((0.1 + d) * FS) }, midi);
    return { midi, velocity: v, centroidHz: Math.round(a.centroid), rmsDb: +a.rmsDb.toFixed(1), cents: +a.cents.toFixed(1) };
  });
}

// ---------------------------------------------------------------- audio and spectrograms
for (const p of PIECES) {
  const rs = engines.map(([tag, render]) => [tag, render({ sampleRate: FS, instrument: 'bassoon', events: events(p) as never, duration: p.dur })] as const);
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
