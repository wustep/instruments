// The trombone's audio examples: long tones across the tenor's compass at pp, mf, ff (a pedal included) and
// the bass trombone's low notes; an original phrase (a tongued fanfare up the B♭ arpeggio, then a legato line
// down through the slide's positions under its soft tongue, ending on a glissando); its own piece (the top
// line of Bach's Air, on the tenor); and the Air for four trombones (alto, tenor, tenor, bass, each its own
// size), through an older engine (--before: the start design, the commit before the voicing was fitted to the
// Iowa trombones) and this checkout, as MP3s with the site's room (before and after at one gain), stacked
// spectrograms (before on top) and the dry renders' centroid, level and pitch per note.
//   npx tsx scripts/render-trombone.ts [--before <old>/packages/engine/src/core/index.ts] [--out artifacts/realistic-3d/final-symphony/trombone/audio]
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
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'realistic-3d', 'final-symphony', 'trombone', 'audio'))!);
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
type Ev2 = Ev & { size?: string };
const notes = (ns: Note[]): Ev[] => ns.flatMap(([m, t, d, v]) => [{ time: t, event: { type: 'noteOn', midi: m, velocity: v } }, { time: t + d, event: { type: 'noteOff', midi: m } }]);
interface Piece { name: string; what: string; ns: Note[]; dur: number; size?: string }
const PIECES: Piece[] = [];
// 1. long tones across the tenor's compass at pp, mf, ff (its pedal B♭1 first)
{
  const ns: Note[] = [];
  let t = 0.1;
  for (const m of [34, 40, 46, 53, 58, 65, 70, 77])
    for (const v of [30, 70, 112]) {
      ns.push([m, t, 1.4, v]);
      t += 1.65;
    }
  PIECES.push({ name: 'trombone-long-tones', what: 'tenor: B♭1 (the pedal), E2, B♭2, F3, B♭3, F4, B♭4, F5, each at pp, mf, ff (velocity 30, 70, 112), 1.4 s', ns, dur: t + 1 });
}
// 2. the bass trombone's low register: pedal C1 and D1 on both valves, F1, B♭1 (its pedal), D2 on both valves, F2
{
  const ns: Note[] = [];
  let t = 0.1;
  for (const m of [24, 26, 29, 34, 38, 41])
    for (const v of [70, 112]) {
      ns.push([m, t, 1.6, v]);
      t += 1.85;
    }
  PIECES.push({ name: 'bass-trombone-low', what: 'bass trombone: C1 and D1 (pedals on both valves), F1, B♭1 (its pedal in first position), D2 (both valves), F2, each at mf and ff', ns, dur: t + 1, size: 'bass' } as Piece);
}
// 3. an original phrase in B♭: a tongued fanfare up the arpeggio, then legato down the slide's positions
//    (B♭3 1st, A3 2nd, A♭3 3rd, G3 4th, G♭3 5th, F3 1st, E3 2nd, E♭3 3rd), a swell, a glissando to the end
{
  const ns: Note[] = [];
  let t = 0.1;
  for (const [m, d] of [[46, 0.28], [53, 0.28], [58, 0.28], [62, 0.28], [65, 1.0]] as [number, number][]) {
    ns.push([m, t, d - 0.04, 100]);
    t += d;
  }
  const line = [58, 57, 56, 55, 54, 53, 52, 51, 50, 51, 53, 55, 58];
  line.forEach((m, i) => {
    const d = i === line.length - 1 ? 1.8 : 0.42;
    ns.push([m, t, d + 0.03, Math.round(50 + 55 * Math.sin((Math.PI * i) / (line.length - 1)))]);
    t += d;
  });
  PIECES.push({ name: 'trombone-phrase', what: 'an original phrase in B♭ (tenor): a tongued fanfare up the arpeggio from B♭2 to F4, then a legato line down the slide’s positions from B♭3 (first) to D3 (fourth) and back up, the slide masked by a soft tongue, with a swell', ns, dur: t + 1.2 });
}
// 4. its own piece (the play icon's): the top line of Bach's Air, on the tenor
{
  const d = DEMOS.trombone;
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
  PIECES.push({ name: 'trombone-air', what: `${d.composer}, ${d.title} (Mutopia, public domain), as the play icon plays it, its first 40 s`, ns: ns.filter((n) => n[1] < 40), dur: 42 });
}

const mono = (r: { left: ArrayLike<number>; right: ArrayLike<number> }) => Float32Array.from(r.left, (v, i) => 0.5 * (v + r.right[i]));
const events = (p: Piece) => notes(p.ns).sort((a, b) => a.time - b.time);

// ---------------------------------------------------------------- metrics (dry renders)
const metrics: Record<string, unknown> = {};
for (const [tag, render] of engines) {
    metrics[tag] = PIECES[0].ns.map(([midi, , d, v]) => {
    const x = mono(render({ sampleRate: FS, instrument: 'trombone', dry: true, params: { vibrato: 0 } as never, events: notes([[midi, 0.1, d, v]]) as never, duration: d + 0.3 }));
    const a = analyzeSustained(x, FS, { start: Math.round(0.1 * FS), end: Math.round((0.1 + d) * FS) }, midi);
    return { midi, velocity: v, centroidHz: Math.round(a.centroid), rmsDb: +a.rmsDb.toFixed(1), cents: +a.cents.toFixed(1) };
  });
}

// ---------------------------------------------------------------- audio and spectrograms
for (const p of PIECES) {
  const rs = engines.map(([tag, render]) => [tag, render({ sampleRate: FS, instrument: 'trombone', params: (p.size ? { size: p.size } : {}) as never, events: events(p) as never, duration: p.dur })] as const);
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
