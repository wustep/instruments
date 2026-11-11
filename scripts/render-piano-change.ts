// A change of piano (grand ↔ upright) while a piece plays, through the worklet host itself (the
// processor in a fake AudioWorkletGlobalScope, its events timed as the file player times them: 0.2 s
// ahead), on an older engine (--before) and this checkout. The old host rebuilt the one piano in
// place, which stopped everything sounding at once (the room's tail too): a hole until the next note.
// Now another piano takes over and the first rings out (processor.ts `changePiano`).
// MP3s as heard, stacked spectrograms (before on top) and the numbers of each change: the level before
// and after it, the longest silence after it, the step where the old sound stops, the peak.
//   npx tsx scripts/render-piano-change.ts --before <old>/packages/engine/src/worklet/processor.ts
//       [--out artifacts/round3/piano-change]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseMidi, type FileEvent } from '../apps/web/src/midi-file.ts';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import { computeDesigns } from '../packages/engine/src/core/precompute.ts';
import { spectrogramPng } from './spectrogram.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => {
  const i = args.indexOf(k);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const ROOT = join(import.meta.dirname, '..');
const OUT = resolve(opt('--out', join(ROOT, 'artifacts', 'round3', 'piano-change'))!);
const BEFORE = opt('--before');
const FS = 48000;
mkdirSync(OUT, { recursive: true });

// ---- the worklet host of each engine, in a fake AudioWorkletGlobalScope
class FakePort {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage(): void {}
  deliver(m: unknown): void {
    this.onmessage?.({ data: m });
  }
}
type Proc = { port: FakePort; process(i: unknown, o: Float32Array[][]): boolean };
type Ctor = new (o: unknown) => Proc;
const g = globalThis as unknown as { sampleRate: number; currentFrame: number; AudioWorkletProcessor: unknown; registerProcessor: (name: string, c: Ctor) => void };
g.sampleRate = FS;
g.currentFrame = 0;
g.AudioWorkletProcessor = class {
  port = new FakePort();
};
const hosts: [string, Ctor][] = [];
for (const [tag, path] of [...(BEFORE ? [['before', resolve(BEFORE)]] : []), ['after', join(ROOT, 'packages/engine/src/worklet/processor.ts')]] as [string, string][]) {
  let ctor: Ctor | null = null;
  g.registerProcessor = (name, c) => {
    if (name === 'piano-model') ctor = c;
  };
  await import(pathToFileURL(path).href);
  if (!ctor) throw new Error(`${path} registered no processor`);
  hosts.push([tag, ctor]);
}
const designs = [...(await computeDesigns('grand', {}, FS)), ...(await computeDesigns('upright', {}, FS))];

// ---- the piece: Chopin, Prelude in C minor, Op. 28 No. 20 (the app's own piano piece; Mutopia, public domain)
const midi = readFileSync(join(ROOT, 'apps/web/public/pieces/chopin-op28-20.mid'));
const song = parseMidi(midi.buffer.slice(midi.byteOffset, midi.byteOffset + midi.byteLength) as ArrayBuffer);
const BAR = 40 / 7;
const BEAT = BAR / 4;
const at = (bar: number, beat = 1) => (bar - 1) * BAR + (beat - 1) * BEAT;

interface Clip {
  name: string;
  what: string;
  from: number;
  to: number;
  /** the changes of piano: when (song seconds), to which */
  changes: [number, string][];
}
const clips: Clip[] = [
  { name: 'mid-chord', what: 'bars 1–2 (fortissimo): the upright asked for in the middle of the third chord, the grand again in the middle of bar 2', from: at(1), to: at(3), changes: [[at(1, 3) + 0.5 * BEAT, 'upright'], [at(2, 2) + 0.5 * BEAT, 'grand']] },
  { name: 'at-the-turn', what: 'bars 4–5: the upright asked for 50 ms before bar 5, where the piece turns from loud to quiet', from: at(4), to: at(6), changes: [[at(5) - 0.05, 'upright']] },
];

const db = (x: number) => 20 * Math.log10(Math.max(1e-9, x));
function play(Host: Ctor, c: Clip): { L: Float32Array; R: Float32Array } {
  g.currentFrame = 0;
  const p = new Host({ processorOptions: { instrument: 'piano', preset: 'grand', designs, adaptive: false } });
  const ev = song.events.filter((e) => e.t >= c.from - 1e-6 && e.t < c.to + 2);
  const n = Math.ceil(((c.to - c.from + 2.5) * FS) / 128) * 128;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const l = new Float32Array(128);
  const r = new Float32Array(128);
  const send = (e: FileEvent, time: number) => {
    const event = e.kind === 'on' ? { type: 'noteOn', midi: e.midi, velocity: e.vel } : e.kind === 'off' ? { type: 'noteOff', midi: e.midi } : e.kind === 'pedal' ? { type: e.cc === 64 ? 'sustain' : e.cc === 66 ? 'sostenuto' : 'soft', value: e.value } : null;
    if (event) p.port.deliver({ type: 'event', event, time });
  };
  let k = 0;
  let ch = 0;
  // (the piece ends where the clip does: the notes still held are let go there)
  const end = c.to - c.from + 0.12;
  let ended = false;
  for (let f = 0; f < n; f += 128) {
    const now = f / FS;
    // the player: what begins within 0.2 s, 0.12 s after the context's zero
    while (k < ev.length && ev[k].t - c.from + 0.12 <= now + 0.2 && ev[k].t < c.to - 1e-6) send(ev[k], ev[k++].t - c.from + 0.12);
    while (ch < c.changes.length && c.changes[ch][0] - c.from + 0.12 <= now) p.port.deliver({ type: 'preset', preset: c.changes[ch++][1] });
    if (!ended && now >= end) {
      ended = true;
      p.port.deliver({ type: 'clearScheduled' });
      p.port.deliver({ type: 'event', event: { type: 'allNotesOff' } });
      p.port.deliver({ type: 'event', event: { type: 'sustain', value: 0 } });
    }
    p.process([], [[l, r]]);
    L.set(l, f);
    R.set(r, f);
    g.currentFrame += 128;
  }
  return { L, R };
}
function mp3(name: string, L: Float32Array, R: Float32Array): void {
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '128k', join(OUT, `${name}.mp3`)]);
  rmSync(wav);
}
/** the numbers of a change at sample `s` */
function measure(L: Float32Array, R: Float32Array, s: number, until: number) {
  const rms = (a: number, b: number) => {
    let q = 0;
    for (let i = Math.max(0, a); i < Math.min(L.length, b); i++) q += 0.5 * (L[i] * L[i] + R[i] * R[i]);
    return Math.sqrt(q / Math.max(1, b - a));
  };
  const ms = (x: number) => Math.round((x * FS) / 1000);
  // the longest stretch under −60 dBFS (5 ms frames) from the change to the next note's time
  let hole = 0;
  let run = 0;
  for (let i = s; i + ms(5) <= Math.min(L.length, until); i += ms(5)) {
    run = rms(i, i + ms(5)) < 1e-3 ? run + 5 : 0;
    hole = Math.max(hole, run);
  }
  // the step where the sound changes hands, over the largest step of the 50 ms before it
  let before = 0;
  for (let i = s - ms(50); i < s - 130; i++) before = Math.max(before, Math.abs(L[i] - L[i - 1]));
  let step = 0;
  for (let i = s - 130; i < s + 260; i++) step = Math.max(step, Math.abs(L[i] - L[i - 1]));
  return { 'before dBFS (100 ms)': +db(rms(s - ms(100), s)).toFixed(1), 'after dBFS (first 50 ms)': +db(rms(s + 130, s + 130 + ms(50))).toFixed(1), 'after dBFS (50–150 ms)': +db(rms(s + ms(50), s + ms(150))).toFixed(1), 'silence ms': hole, 'step ×': +(step / Math.max(1e-9, before)).toFixed(2) };
}

const index: Record<string, unknown>[] = [];
for (const c of clips) {
  const row: Record<string, unknown> = { clip: c.name, what: c.what };
  const monos: { data: Float32Array; fs: number }[] = [];
  for (const [tag, Host] of hosts) {
    const { L, R } = play(Host, c);
    mp3(`${c.name}-${tag}`, L, R);
    monos.push({ data: L, fs: FS });
    let pk = 0;
    for (let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    const changes = c.changes.map(([t, to]) => {
      const s = Math.round((t - c.from + 0.12) * FS);
      // (until the next note of the piece after the change)
      const next = song.events.find((e) => e.kind === 'on' && e.t > t + 1e-3)?.t ?? c.to;
      return { to, 'at s': +(t - c.from + 0.12).toFixed(2), 'next note in ms': Math.round((next - t) * 1000), ...measure(L, R, s, Math.round((next - c.from + 0.12) * FS)) };
    });
    row[tag] = { 'peak dBFS': +db(pk).toFixed(1), changes };
    for (const ch of changes) console.log(`${c.name} ${tag} → ${ch.to} at ${ch['at s']} s (next note in ${ch['next note in ms']} ms): before ${ch['before dBFS (100 ms)']} dB | after ${ch['after dBFS (first 50 ms)']} dB, then ${ch['after dBFS (50–150 ms)']} dB | silence ${ch['silence ms']} ms | step ×${ch['step ×']} | peak ${db(pk).toFixed(1)} dBFS`);
  }
  const png = join(OUT, `${c.name}.png`);
  spectrogramPng(png, monos, { start: 0, dur: Math.min(12, c.to - c.from + 2), fmax: 5000, win: 2048, hop: 360, height: 260, range: 70 });
  try {
    execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGB").quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)\nim.save(sys.argv[1], optimize=True)', png], { stdio: 'ignore' });
  } catch {
    /* as written */
  }
  index.push(row);
}
writeFileSync(join(OUT, 'clips.json'), `${JSON.stringify(index, null, 1)}\n`);
