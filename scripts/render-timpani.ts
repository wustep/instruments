// The timpani's audio examples: strokes across the set's compass at pp, mf and ff; an original passage for a
// pair in C (strokes on the tonic and dominant, a roll on G2 swelling from pp to ff and back, a pedal
// glissando under a ringing head, a double stop); their own piece (the timpani's line of Mozart's Dies irae),
// through an older engine (--before: the start design, the foundation commit's voicing before it was fitted to
// the VSCO 2 CE timpani) and this checkout, as MP3s with the site's room (before and after at one gain),
// stacked spectrograms (before on top) and the dry strokes' principal tone, centroid, level and decay.
//   npx tsx scripts/render-timpani.ts [--before <old>/packages/engine/src/core/index.ts] [--out artifacts/realistic-3d/final-symphony/timpani/audio]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeStruck, encodeWav } from '../packages/engine/src/analysis/index.ts';
import { parseMidi } from '../apps/web/src/midi-file.ts';
import { DEMOS, demoSong } from '../apps/web/src/orchestra/pieces.ts';
import { spectrogramPng } from './spectrogram.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'realistic-3d', 'final-symphony', 'timpani', 'audio'))!);
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
interface Piece { name: string; what: string; ev: Ev[]; dur: number; strokes?: Note[] }
const PIECES: Piece[] = [];
// 1. strokes across the compass, each at pp, mf, ff
{
  const ns: Note[] = [];
  let t = 0.1;
  for (const m of [36, 41, 45, 48, 52, 57])
    for (const v of [30, 70, 112]) {
      ns.push([m, t, 0.3, v]);
      t += 2.0;
    }
  PIECES.push({ name: 'timpani-strokes', what: 'C2, F2, A2, C3, E3, A3, each at pp, mf, ff (velocity 30, 70, 112), 2 s apart, left to ring', ev: notes(ns), dur: t + 1.5, strokes: ns });
}
// 2. an original passage for a pair in C: tonic and dominant strokes, a roll swelling pp → ff → p on G2,
//    the pedal under the ringing G2 up a tone and back, a double stop to close
{
  const ev: Ev[] = [];
  let t = 0.1;
  for (const [m, d, v] of [[48, 0.45, 100], [43, 0.45, 80], [48, 0.45, 90], [43, 0.9, 110], [48, 0.3, 70], [48, 0.3, 75], [43, 0.6, 105]] as const) {
    ev.push({ time: t, event: { type: 'noteOn', midi: m, velocity: v } }, { time: t + 0.2, event: { type: 'noteOff', midi: m } });
    t += d;
  }
  // the roll: the mod wheel rolls the held key, the file's dynamics swell it
  t += 0.4;
  ev.push({ time: t - 0.01, event: { type: 'control', cc: 1, value: 0.55 } }, { time: t, event: { type: 'noteOn', midi: 43, velocity: 40 } });
  for (let k = 0; k <= 40; k++) {
    const u = k / 40;
    ev.push({ time: t + u * 4, event: { type: 'control', cc: 131, value: Math.round(70 * Math.sin(Math.PI * u) ** 1.5 - 10 * u) } });
  }
  ev.push({ time: t + 4, event: { type: 'noteOff', midi: 43 } }, { time: t + 4.01, event: { type: 'control', cc: 1, value: 0 } });
  t += 4.6;
  // a ringing G2, its pedal up a tone and back (a glissando)
  ev.push({ time: t, event: { type: 'noteOn', midi: 43, velocity: 105 } }, { time: t + 0.2, event: { type: 'noteOff', midi: 43 } });
  for (let k = 0; k <= 20; k++) ev.push({ time: t + 0.5 + (k / 20) * 1.2, event: { type: 'bend', value: 2 * Math.sin((Math.PI * k) / 20) } });
  t += 2.2;
  // a double stop on the tonic and dominant, ff
  ev.push({ time: t, event: { type: 'noteOn', midi: 43, velocity: 118 } }, { time: t, event: { type: 'noteOn', midi: 48, velocity: 118 } }, { time: t + 0.3, event: { type: 'noteOff', midi: 43 } }, { time: t + 0.3, event: { type: 'noteOff', midi: 48 } });
  PIECES.push({ name: 'timpani-passage', what: 'an original passage for a pair in C: strokes on C3 and G2, a roll on G2 swelling pp → ff → p (the mod wheel and the file’s dynamics), a pedal glissando under the ringing G2, a double stop ff', ev, dur: t + 3.5 });
}
// 3. their own piece (the play icon's): the timpani's line of Mozart's Dies irae
{
  const d = DEMOS.timpani;
  const b = readFileSync(join(import.meta.dirname, '..', 'apps/web/public/pieces', d.file));
  const s = demoSong(parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer), d);
  const ev: Ev[] = [];
  for (const e of s.events) {
    if (e.kind === 'on') ev.push({ time: e.t + 0.1, event: { type: 'noteOn', midi: e.midi, velocity: e.vel } });
    else if (e.kind === 'off') ev.push({ time: e.t + 0.1, event: { type: 'noteOff', midi: e.midi } });
  }
  PIECES.push({ name: 'timpani-dies-irae', what: `${d.composer}, ${d.title} (Mutopia, public domain), as the play icon plays it`, ev, dur: s.duration + 3 });
}

const mono = (r: { left: ArrayLike<number>; right: ArrayLike<number> }) => Float32Array.from(r.left, (v, i) => 0.5 * (v + r.right[i]));
const sorted = (ev: Ev[]) => ev.slice().sort((a, b) => a.time - b.time);

// ---------------------------------------------------------------- metrics (dry strokes)
const metrics: Record<string, unknown> = {};
for (const [tag, render] of engines) {
  metrics[tag] = PIECES[0].strokes!.map(([midi, , , v]) => {
    const x = mono(render({ sampleRate: FS, instrument: 'timpani', dry: true, events: [{ time: 0.05, event: { type: 'noteOn', midi, velocity: v } }] as never, duration: 2.6 }));
    const a = analyzeStruck(x, FS, 440 * 2 ** ((midi - 69) / 12));
    return { midi, velocity: v, cents: +(1200 * Math.log2(a.f11 / (440 * 2 ** ((midi - 69) / 12)))).toFixed(1), centroidHz: Math.round(a.centroid), levelDb: +a.level.toFixed(1), decay11DbPerS: +a.decay11.toFixed(1), l21Db: +a.levels[0].toFixed(1) };
  });
}

// ---------------------------------------------------------------- audio and spectrograms
for (const p of PIECES) {
  const rs = engines.map(([tag, render]) => [tag, render({ sampleRate: FS, instrument: 'timpani', events: sorted(p.ev) as never, duration: p.dur })] as const);
  const monos: { data: Float32Array; fs: number }[] = [];
  for (const [tag, r] of rs) {
    // (each engine to −1 dBFS at its peak: the start design's gain was never fitted, 36 dB above the fitted one)
    let pk = 0;
    for (let i = 0; i < r.left.length; i++) pk = Math.max(pk, Math.abs(r.left[i]), Math.abs(r.right[i]));
    const g = pk > 0 ? Math.pow(10, -1 / 20) / pk : 1;
    const L = Float32Array.from(r.left, (v) => v * g);
    const R = Float32Array.from(r.right, (v) => v * g);
    const wav = join(OUT, `${p.name}-${tag}.wav`);
    writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }, 16));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '160k', join(OUT, `${p.name}-${tag}.mp3`)]);
    rmSync(wav);
    monos.push({ data: Float32Array.from(L, (v, i) => 0.5 * (v + R[i])), fs: FS });
    console.log(`${p.name}-${tag}.mp3`);
  }
  spectrogramPng(join(OUT, `${p.name}.png`), monos, { start: 0, dur: p.dur, fmax: 3000, win: 4096, hop: Math.max(64, Math.round((p.dur * FS) / 960)), range: 80, height: 220 });
  console.log(`${p.name}.png (${engines.map(([t]) => t).join(' over ')})`);
}

writeFileSync(join(OUT, 'metrics.json'), JSON.stringify({ pieces: PIECES.map((p) => ({ name: p.name, what: p.what })), metrics }, null, 1) + '\n');
console.log(JSON.stringify(metrics));
