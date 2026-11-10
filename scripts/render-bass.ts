// The double bass's audio examples: the instrument alone (the open strings at pp, mf, ff; an original
// legato line with a crescendo and a diminuendo; its own piece, Bach's Menuet II as bassists play it),
// through an older engine (--before: the start design, the cello's physics on the bass's strings
// before its body was fitted) and this checkout, as MP3s with the site's room (before and after at
// one gain), stacked spectrograms (before on top) and the dry renders' centroid and level per note.
// Also writes a constructed quintet MIDI file (original material: eight chords for Violin I, Violin II,
// Viola, Violoncello and Contrabass on GM 40/40/41/42/43, the names and programs of Max Richter's
// "On the Nature of Daylight" quintet) for scripts/render-orchestra.ts to route and play.
//   npx tsx scripts/render-bass.ts [--before <old>/packages/engine/src/core/index.ts] [--out artifacts/realistic-3d/final-next5/double-bass/audio]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzeSustained, encodeWav } from '../packages/engine/src/analysis/index.ts';
import { parseMidi } from '../apps/web/src/midi-file.ts';
import { DEMOS, demoSong } from '../apps/web/src/orchestra/pieces.ts';
import { smf } from '../apps/web/test/smf.ts';
import { spectrogramPng } from './spectrogram.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'realistic-3d', 'final-next5', 'double-bass', 'audio'))!);
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
// 1. the open strings at pp, mf, ff
{
  const ns: Note[] = [];
  let t = 0.1;
  for (const m of [28, 33, 38, 43])
    for (const v of [30, 70, 112]) {
      ns.push([m, t, 1.6, v]);
      t += 1.85;
    }
  PIECES.push({ name: 'bass-open-strings', what: 'E1, A1, D2, G2 open, each at pp, mf, ff (velocity 30, 70, 112), 1.6 s', ns, dur: t + 1 });
}
// 2. an original legato line from E1, crescendo to ff and back
{
  const steps = [0, 2, 3, 5, 7, 8, 7, 5, 3, 5, 7, 12, 10, 8, 7, 3, 5, 2, 0];
  const vel = steps.map((_, i) => Math.round(40 + 70 * Math.sin((Math.PI * i) / (steps.length - 1))));
  const line = (base: number): Note[] => {
    const out: Note[] = [];
    let t = 0.1;
    steps.forEach((s, i) => {
      const d = i === steps.length - 1 ? 2.2 : i % 4 === 3 ? 1.1 : 0.55;
      out.push([base + s, t, d + 0.02, vel[i]]);
      t += d;
    });
    return out;
  };
  PIECES.push({ name: 'bass-phrase', what: 'an original legato line from E1 (E minor), crescendo to ff and back', ns: line(28), dur: 14 });
}
// 3. its own piece (the play icon's): Bach, Menuet II from the first cello suite, as bassists play it
{
  const d = DEMOS.bass;
  const b = readFileSync(join(import.meta.dirname, '..', 'apps/web/public/pieces', d.file));
  const s = demoSong(parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer), d);
  const ns: Note[] = [];
  const open = new Map<number, [number, number]>();
  for (const e of s.events) {
    if (e.t > 22) break;
    if (e.kind === 'on') open.set(e.midi, [e.t, e.vel]);
    else if (e.kind === 'off' && open.has(e.midi)) {
      const [t0, v] = open.get(e.midi)!;
      ns.push([e.midi, t0 + 0.1, e.t - t0, v]);
      open.delete(e.midi);
    }
  }
  PIECES.push({ name: 'bass-menuet', what: `${d.composer}, ${d.title} (public domain, Mutopia), the first 22 s as the play icon plays it`, ns, dur: 23.5 });
}

const mono = (r: { left: ArrayLike<number>; right: ArrayLike<number> }) => Float32Array.from(r.left, (v, i) => 0.5 * (v + r.right[i]));
const events = (p: Piece) => notes(p.ns).sort((a, b) => a.time - b.time);

// ---------------------------------------------------------------- metrics (dry renders)
const metrics: Record<string, unknown> = {};
for (const [tag, render] of engines) {
  // (each note alone: in the passage the open strings ring on undamped under the next, as on the bass)
  metrics[tag] = PIECES[0].ns.map(([midi, , d, v]) => {
    const x = mono(render({ sampleRate: FS, instrument: 'bass', dry: true, events: notes([[midi, 0.1, d, v]]) as never, duration: d + 0.3 }));
    const a = analyzeSustained(x, FS, { start: Math.round(0.1 * FS), end: Math.round((0.1 + d) * FS) }, midi);
    return { midi, velocity: v, centroidHz: Math.round(a.centroid), rmsDb: +a.rmsDb.toFixed(1), cents: +a.cents.toFixed(1) };
  });
}

// ---------------------------------------------------------------- audio and spectrograms
for (const p of PIECES) {
  const rs = engines.map(([tag, render]) => [tag, render({ sampleRate: FS, instrument: 'bass', events: events(p) as never, duration: p.dur })] as const);
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

// ---------------------------------------------------------------- the constructed quintet
{
  // eight slow chords, D minor (i VI III VII i iv V i), each part one note at a time; the bass goes down
  // to G1 (below the cello's C), so a part it cannot reach would show
  const chords = [
    [69, 65, 57, 50, 38],
    [70, 65, 58, 50, 34],
    [72, 65, 57, 48, 41],
    [72, 64, 55, 52, 36],
    [69, 62, 57, 53, 38],
    [67, 62, 58, 50, 31],
    [73, 64, 57, 49, 33],
    [74, 65, 57, 50, 38],
  ];
  const parts = [
    ['Violin I', 40],
    ['Violin II', 40],
    ['Viola', 41],
    ['Violoncello', 42],
    ['Contrabass', 43],
  ] as const;
  const name = (s: string): [number, ...number[]] => [0, 0xff, 0x03, s.length, ...[...s].map((c) => c.charCodeAt(0))];
  // ♩ = 60 (1 s a beat), each chord two beats, a swell over the first four and the last four
  const tracks: [number, ...number[]][][] = [[[0, 0xff, 0x51, 3, 0x0f, 0x42, 0x40]]];
  parts.forEach(([n, prog], ch) => {
    const t: [number, ...number[]][] = [name(n), [0, 0xc0 | ch, prog]];
    chords.forEach((c, i) => {
      const v = Math.round(52 + 30 * Math.sin((Math.PI * ((i % 4) + 0.5)) / 4));
      t.push([0, 0x90 | ch, c[ch], v], [i === chords.length - 1 ? 1920 : 950, 0x80 | ch, c[ch], 0]);
      if (i < chords.length - 1) t.push([10, 0xb0 | ch, 64, 0]);
    });
    tracks.push(t);
  });
  writeFileSync(join(OUT, 'quintet-constructed.mid'), smf(480, tracks));
  console.log('quintet-constructed.mid (Violin I, Violin II, Viola, Violoncello, Contrabass; GM 40/40/41/42/43)');
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify({ pieces: PIECES.map((p) => ({ name: p.name, what: p.what })), metrics }, null, 1) + '\n');
console.log(JSON.stringify(metrics));
