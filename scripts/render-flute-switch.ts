// The flute switched quickly from note to note, to hear: the same passages through an older engine (--before)
// and this checkout, through the room, the player as it plays (`human` 1).
//   npx tsx scripts/render-flute-switch.ts --before <old>/packages/engine/src/core/index.ts [--out artifacts/flute2]
// Writes
//   keys-{before,after}.mp3      as a computer keyboard plays it (velocity 84, every event on a render quantum, as
//                                the worklet takes a live key): runs, arpeggios, trills and leaps over both register
//                                breaks, the next key pressed before the last is let go, with it, or a few to some
//                                tens of milliseconds after, as fingers on a keyboard do
//   pointer-{before,after}.mp3   as the on-screen keys play it: a finger drawn across them (each key let go as the
//                                next is reached, one instant) and keys tapped at the depth that sets their velocity
//   random-{before,after}.mp3    scripts/winds-switch.ts's random passages, one after another: many switches
//   golden-{before,after}.mp3    the golden test's passage (three notes of 260 ms, 40 ms apart, by hand), in three
//                                registers
//   file-{before,after}.mp3      detached short notes as a file plays them (each told ahead with its length)
//   keys.png, golden.png         spectrograms, the older engine on top
//   index.json                   each clip's notes measured as scripts/winds-switch.ts measures them (dry)
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import { spectrogramPng } from './spectrogram.ts';
import { med } from './winds-legato-lib.ts';
import { events, makeRef, measurePassage, passage, rng, type NoteMeasure, type SwitchNote } from './winds-switch.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'flute2'))!);
const BEFORE = opt('--before');
const FS = 48000;
const Q = 128 / FS;
type Render = typeof import('../packages/engine/src/core/index.ts').renderInstrument;
const engines: [string, Render][] = [];
for (const [tag, path] of [...(BEFORE ? [['before', resolve(BEFORE)]] : []), ['after', join(import.meta.dirname, '../packages/engine/src/core/index.ts')]]) engines.push([tag, (await import(pathToFileURL(path).href)).renderInstrument]);
mkdirSync(OUT, { recursive: true });

function mp3(name: string, L: Float32Array, R: Float32Array): void {
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '128k', join(OUT, `${name}.mp3`)]);
  rmSync(wav);
}
function png(name: string, monos: { data: Float32Array; fs: number }[], start: number, dur: number): void {
  const file = join(OUT, `${name}.png`);
  spectrogramPng(file, monos, { start, dur, fmax: 10000, win: 1024, hop: Math.max(48, Math.round((dur * FS) / 1800)), height: 260, range: 70 });
  try {
    execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGB").quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)\nim.save(sys.argv[1], optimize=True)', file], { stdio: 'ignore' });
  } catch {
    /* as written */
  }
}
const snap = (t: number) => Math.round(t / Q) * Q;

/** notes played by hand on a computer keyboard: each `[midi, held s]`; the next key pressed, by a seeded
 *  draw, 10–50 ms before the last is let go (a third of the time), with it (a sixth), or 4–70 ms after */
function byKeys(line: [number, number][], r: () => number, t0: number, vel = 84): { notes: SwitchNote[]; end: number } {
  const notes: SwitchNote[] = [];
  let t = t0;
  for (const [m, held] of line) {
    if (m < 0) {
      t += held;
      continue;
    }
    const on = snap(t);
    const off = snap(t + held);
    notes.push({ midi: m, vel, on, off });
    const u = r();
    const gap = u < 1 / 3 ? -(0.01 + 0.04 * r()) : u < 0.5 ? 0 : 0.004 + 0.066 * r();
    t = t + held + gap;
  }
  return { notes, end: t };
}
const scale = (from: number, to: number, held: number): [number, number][] => {
  const MAJ = [0, 2, 4, 5, 7, 9, 11];
  const out: [number, number][] = [];
  const s = Math.sign(to - from);
  for (let m = from; s > 0 ? m <= to : m >= to; m += s) if (MAJ.includes(((m % 12) + 12) % 12)) out.push([m, held]);
  return out;
};
const rest = (s: number): [number, number] => [-1, s];

/** the computer keyboard's passage */
function keysPassage(): SwitchNote[] {
  const r = rng(77);
  const line: [number, number][] = [
    // runs over C♯5 | D5 and C♯6 | D6, up and down
    ...scale(67, 86, 0.15), ...scale(84, 67, 0.15), rest(0.4),
    ...scale(72, 91, 0.12), ...scale(89, 72, 0.12), rest(0.4),
    // arpeggios across the breaks
    ...[69, 72, 76, 81, 84, 88, 93, 88, 84, 81, 76, 72, 69].map((m): [number, number] => [m, 0.16]), rest(0.4),
    ...[67, 71, 74, 79, 83, 86, 91, 86, 83, 79, 74, 71, 67].map((m): [number, number] => [m, 0.13]), rest(0.4),
    // trills, at the breaks and in a register
    ...Array.from({ length: 16 }, (_, i): [number, number] => [i % 2 ? 74 : 73, 0.1]), rest(0.3),
    ...Array.from({ length: 16 }, (_, i): [number, number] => [i % 2 ? 86 : 85, 0.1]), rest(0.3),
    ...Array.from({ length: 16 }, (_, i): [number, number] => [i % 2 ? 79 : 77, 0.11]), rest(0.4),
    // leaps and repeated notes
    ...[72, 84, 74, 86, 76, 88, 77, 89, 79, 91].map((m): [number, number] => [m, 0.18]), rest(0.3),
    ...[81, 81, 81, 84, 84, 84, 88, 88, 88, 86, 86, 84].map((m): [number, number] => [m, 0.14]), rest(0.4),
    // a slower line, then quick again
    ...scale(79, 91, 0.24), ...scale(89, 72, 0.13),
  ];
  return byKeys(line, r, 0.2).notes;
}

/** the on-screen keys: drags (each key let go as the next is reached: one instant) and taps */
function pointerPassage(): SwitchNote[] {
  const r = rng(91);
  const notes: SwitchNote[] = [];
  let t = 0.2;
  const drag = (keys: number[], step: number, vel: number) => {
    for (let i = 0; i < keys.length; i++) {
      const on = snap(t + i * step);
      const off = snap(t + (i + 1) * step);
      notes.push({ midi: keys[i], vel, on, off });
    }
    t += keys.length * step + 0.35;
  };
  const whites = (from: number, to: number) => scale(from, to, 0).map(([m]) => m);
  drag(whites(67, 91), 0.07, 90);
  drag(whites(91, 67), 0.06, 70);
  drag(whites(72, 89), 0.09, 110);
  drag(whites(88, 72), 0.08, 50);
  // taps: down, up some 60–200 ms later, the next 20–150 ms after that, at the depth that sets the velocity
  for (let i = 0; i < 40; i++) {
    const m = 70 + Math.floor(r() * 22);
    const vel = Math.round(28 + 96 * Math.pow(r(), 0.8));
    const on = snap(t);
    const off = snap(t + 0.06 + 0.14 * r());
    notes.push({ midi: m, vel, on, off });
    t = off + 0.02 + 0.13 * r();
  }
  return notes;
}

/** the golden test's passage in three registers */
function goldenPassage(): SwitchNote[] {
  const notes: SwitchNote[] = [];
  let t = 0.2;
  for (const triad of [[72, 76, 79], [79, 83, 86], [84, 88, 91]]) {
    triad.forEach((m, i) => notes.push({ midi: m, vel: 70 + 10 * i, on: t + i * 0.3, off: t + i * 0.3 + 0.26 }));
    t += 1.2;
  }
  return notes;
}

/** detached short notes as a file plays them (told ahead): staccato runs and arpeggios */
function filePassage(): SwitchNote[] {
  const notes: SwitchNote[] = [];
  let t = 0.2;
  const run = (ms: number[], len: number, step: number, vel: number) => {
    for (const m of ms) {
      notes.push({ midi: m, vel, on: t, off: t + len });
      t += step;
    }
    t += 0.3;
  };
  run(scale(72, 91, 0).map(([m]) => m), 0.12, 0.18, 80);
  run(scale(89, 72, 0).map(([m]) => m), 0.1, 0.15, 95);
  run([67, 71, 74, 79, 83, 86, 91, 86, 83, 79, 74, 71], 0.14, 0.2, 64);
  run([76, 76, 76, 79, 79, 79, 84, 84, 84, 88, 88, 88], 0.09, 0.14, 105);
  return notes;
}

function randomPassage(): SwitchNote[] {
  const notes: SwitchNote[] = [];
  let t = 0;
  for (let tr = 0; tr < 12; tr++) {
    const ns = passage('flute', rng(1000 + tr), 14, Q);
    const shift = snap(t) - ns[0].on + 0.2;
    for (const n of ns) notes.push({ ...n, on: n.on + shift, off: n.off + shift });
    t = notes[notes.length - 1].off + shift * 0 + 0.5;
  }
  return notes;
}

const CLIPS: { name: string; notes: SwitchNote[]; told: boolean }[] = [
  { name: 'keys', notes: keysPassage(), told: false },
  { name: 'pointer', notes: pointerPassage(), told: false },
  { name: 'random', notes: randomPassage(), told: false },
  { name: 'golden', notes: goldenPassage(), told: false },
  { name: 'file', notes: filePassage(), told: true },
];

const index: Record<string, unknown> = {};
for (const clip of CLIPS) {
  const dur = clip.notes[clip.notes.length - 1].off + 1;
  const dryRuns: Float32Array[] = [];
  const row: Record<string, unknown> = { notes: clip.notes.length, seconds: +dur.toFixed(1) };
  for (const [tag, render] of engines) {
    const ev = events(clip.notes, clip.told);
    const wet = render({ sampleRate: FS, instrument: 'flute', events: ev, duration: dur } as never);
    mp3(`${clip.name}-${tag}`, wet.left, wet.right);
    const dry = render({ sampleRate: FS, instrument: 'flute', events: ev, duration: dur, dry: true } as never);
    dryRuns.push(dry.left);
    const ms: NoteMeasure[] = measurePassage(dry.left, FS, clip.notes, makeRef(render, 'flute', FS), 0, 60, 96);
    row[tag] = {
      square20: ms.filter((m) => m.buzzMs > 20).length,
      squareMaxMs: Math.max(0, ...ms.map((m) => m.buzzMs)),
      peakMedDb: +med(ms.map((m) => m.peakDb)).toFixed(1),
      over3dB: ms.filter((m) => m.peakDb > 3).length,
      speakMedMs: med(ms.map((m) => m.speakMs)),
      measured: ms.length,
    };
  }
  index[clip.name] = row;
  console.log(clip.name, JSON.stringify(row));
  if (clip.name === 'keys') png('keys', dryRuns.map((data) => ({ data, fs: FS })), 0.2, 6);
  if (clip.name === 'golden') png('golden', dryRuns.map((data) => ({ data, fs: FS })), 0.15, 3.5);
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));
