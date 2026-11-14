// The piano before and after a calibration change, to listen to: every key of the top three octaves in turn
// (how even they are), a scale over four octaves loud and then soft, and the opening of its own piece;
// through an older engine (--before) and this checkout, as MP3s with the site's room (before and after at
// one gain), stacked spectrograms (before on top), and each top key's dry level.
//   npx tsx scripts/render-calibration.ts --before <old>/packages/engine/src/core/index.ts [--out artifacts/round3/calibration/piano]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';
import { parseMidi } from '../apps/web/src/midi-file.ts';
import { DEMOS, demoSong } from '../apps/web/src/orchestra/pieces.ts';
import { spectrogramPng } from './spectrogram.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'round3', 'calibration', 'piano'))!);
const BEFORE = opt('--before');
const AFTER = resolve(opt('--after', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
type Engine = typeof import('../packages/engine/src/core/index.ts');
const engines: [string, Engine][] = [];
for (const [tag, path] of [...(BEFORE ? [['before', resolve(BEFORE)]] : []), ['after', AFTER]]) engines.push([tag, await import(pathToFileURL(path).href)]);
mkdirSync(OUT, { recursive: true });
const FS = 48000;
type Ev = { time: number; event: Record<string, unknown> };
/** [midi, start s, duration s, velocity] */
type Note = [number, number, number, number];
const notes = (ns: Note[]): Ev[] => ns.flatMap(([m, t, d, v]) => [{ time: t, event: { type: 'noteOn', midi: m, velocity: v } }, { time: t + d, event: { type: 'noteOff', midi: m } }]).sort((a, b) => a.time - b.time);
interface Piece { name: string; what: string; ns: Note[]; dur: number; fmax: number }
const PIECES: Piece[] = [];
{
  const ns: Note[] = [];
  let t = 0.1;
  for (let m = 72; m <= 108; m++) {
    ns.push([m, t, 0.3, 80]);
    t += 0.34;
  }
  PIECES.push({ name: 'piano-top-keys', what: 'every key from C5 to C8 in turn, velocity 80', ns, dur: t + 1.5, fmax: 10000 });
}
{
  const ns: Note[] = [];
  let t = 0.1;
  const scale = [0, 2, 4, 5, 7, 9, 11];
  for (const v of [108, 40]) {
    for (let o = 0; o < 4; o++) for (const s of scale) {
      ns.push([48 + 12 * o + s, t, 0.22, v]);
      t += 0.2;
    }
    ns.push([96, t, 1.2, v]);
    t += 1.8;
  }
  PIECES.push({ name: 'piano-scale', what: 'C major, C3 to C7, fortissimo then pianissimo (velocity 108, 40)', ns, dur: t + 1, fmax: 8000 });
}
{
  const d = DEMOS.piano;
  const b = readFileSync(join(import.meta.dirname, '..', 'apps/web/public/pieces', d.file));
  const s = demoSong(parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer), d);
  const ns: Note[] = [];
  const open = new Map<number, [number, number]>();
  for (const e of s.events) {
    if (e.t > 24) break;
    if (e.kind === 'on') open.set(e.midi, [e.t, e.vel]);
    else if (e.kind === 'off' && open.has(e.midi)) {
      const [t0, v] = open.get(e.midi)!;
      ns.push([e.midi, t0 + 0.1, e.t - t0, v]);
      open.delete(e.midi);
    }
  }
  PIECES.push({ name: 'piano-piece', what: `${d.composer}, ${d.title} (Mutopia, public domain), its first 24 s as the play icon plays it (no pedal here)`, ns, dur: 26, fmax: 8000 });
}

// each top key's dry level (mono, the first half second), the engines side by side
const levels: Record<string, number[]> = {};
for (const [tag, E] of engines) {
  levels[tag] = [];
  for (let m = 72; m <= 108; m++) {
    const r = E.renderNote(m, 70, 0.75, { sampleRate: 44100, dry: true });
    let pk = 0;
    for (let i = 0; i < r.left.length; i++) pk = Math.max(pk, Math.abs(r.left[i]));
    let on = 0;
    while (Math.abs(r.left[on]) < 0.05 * pk) on++;
    let s = 0;
    const n = Math.round(0.5 * 44100);
    for (let i = on; i < on + n; i++) s += (0.5 * (r.left[i] + r.right[i])) ** 2;
    levels[tag].push(+(10 * Math.log10(s / n)).toFixed(1));
  }
  const d = levels[tag].slice(1).map((v, i) => Math.abs(v - levels[tag][i])).sort((a, b) => a - b);
  console.log(`${tag}: C5–C8 at mf, steps between neighbouring keys: median ${d[d.length >> 1].toFixed(1)} dB, 90th percentile ${d[Math.floor(0.9 * (d.length - 1))].toFixed(1)} dB`);
}

for (const p of PIECES) {
  const rs = engines.map(([tag, E]) => [tag, E.renderInstrument({ sampleRate: FS, instrument: 'piano', events: notes(p.ns) as never, duration: p.dur })] as const);
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
  spectrogramPng(join(OUT, `${p.name}.png`), monos, { start: 0, dur: p.dur, fmax: p.fmax, win: 4096, hop: Math.max(64, Math.round((p.dur * FS) / 960)), range: 80, height: 220 });
  console.log(`${p.name}.png (${engines.map(([t]) => t).join(' over ')})`);
}
writeFileSync(join(OUT, 'metrics.json'), JSON.stringify({ pieces: PIECES.map((p) => ({ name: p.name, what: p.what })), topKeysDb: { keys: 'C5…C8 (MIDI 72–108), mf, dry, mono, first 0.5 s', ...levels } }, null, 1) + '\n');
