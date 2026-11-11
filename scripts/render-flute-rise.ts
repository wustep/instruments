// The flute rising across its register breaks, to hear: a few passages of steps and leaps up (told ahead as
// a file's notes) and two real ones from the bundled pieces, through an older engine (--before) and this
// checkout: MP3s as heard (the room on), stacked spectrograms (before on top), and each clip's numbers
// (scripts/flute-rise.ts trackNote and scripts/winds-midi-measure.ts, on dry renders of the same notes).
//   npx tsx scripts/render-flute-rise.ts --before <old>/packages/engine/src/core/index.ts
//       [--out artifacts/round3/audio-audit-3/flute]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import type { TimedEvent } from '../packages/engine/src/core/render.ts';
import { fluteFingering } from '../packages/engine/src/core/flute.ts';
import { heldPower, noteName, trackNote } from './flute-rise.ts';
import { spectrogramPng } from './spectrogram.ts';
import { foreseen, pairNotes, windParts, type PartNote } from './winds-midi-lib.ts';
import { busiest, excerpt, heldLevels, measure, summary } from './winds-midi-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'round3', 'audio-audit-3', 'flute'))!);
const BEFORE = opt('--before');
const FS = 48000;
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
function png(name: string, monos: { data: Float32Array; fs: number }[], dur: number, fmax: number): void {
  const file = join(OUT, `${name}.png`);
  spectrogramPng(file, monos, { start: 0, dur, fmax, win: 2048, hop: Math.max(120, Math.round((dur * FS) / 1600)), height: 260, range: 70 });
  try {
    execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGB").quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)\nim.save(sys.argv[1], optimize=True)', file], { stdio: 'ignore' });
  } catch {
    /* as written */
  }
}

/** phrases of notes: each [pitches, seconds a note, slurred?], a rest of 0.35 s between phrases */
type Phrase = [number[], number, boolean];
function phrases(ps: Phrase[], vel: number): { events: TimedEvent[]; notes: PartNote[]; dur: number } {
  const ev: TimedEvent[] = [];
  let t = 0.15;
  for (const [pitches, len, slur] of ps) {
    pitches.forEach((p, i) => {
      const last = i === pitches.length - 1;
      ev.push({ time: t, event: { type: 'noteOn', midi: p, velocity: vel } }, { time: t + len + (slur && !last ? 0.03 : 0), event: { type: 'noteOff', midi: p } });
      t += len;
    });
    t += 0.35;
  }
  ev.sort((a, b) => a.time - b.time || (a.event.type === 'noteOff' ? 0 : 1) - (b.event.type === 'noteOff' ? 0 : 1));
  const notes = pairNotes(ev, t + 1);
  return { events: [...foreseen(notes), ...ev], notes, dur: t + 0.6 };
}

const CLIPS: { name: string; what: string; vel: number; ps: Phrase[] }[] = [
  {
    name: 'steps',
    what: 'Steps up across both breaks, slurred then tongued, 220 ms a note: B4 C♯5 D5 E♭5 E5 · B5 C♯6 D6 E♭6 E6',
    vel: 80,
    ps: [[[71, 73, 74, 75, 76], 0.22, true], [[83, 85, 86, 87, 88], 0.22, true], [[71, 73, 74, 75, 76], 0.22, false], [[83, 85, 86, 87, 88], 0.22, false]],
  },
  {
    name: 'leaps',
    what: 'Leaps up to the third register, slurred then tongued, 300 ms a note: G5 D6 · A5 E6 · C6 G6 · C5 E6',
    vel: 84,
    ps: [[[79, 86], 0.3, true], [[81, 88], 0.3, true], [[84, 91], 0.3, true], [[72, 88], 0.3, true], [[79, 86], 0.3, false], [[81, 88], 0.3, false], [[84, 91], 0.3, false], [[72, 88], 0.3, false]],
  },
  {
    name: 'scale',
    what: 'D major up two octaves and a third (D4–F♯6) in notes of 120 ms, tongued, then slurred',
    vel: 76,
    ps: [[[62, 64, 66, 67, 69, 71, 73, 74, 76, 78, 79, 81, 83, 85, 86, 88, 90], 0.12, false], [[62, 64, 66, 67, 69, 71, 73, 74, 76, 78, 79, 81, 83, 85, 86, 88, 90], 0.12, true]],
  },
];

const index: Record<string, unknown>[] = [];
for (const c of CLIPS) {
  const p = phrases(c.ps, c.vel);
  const row: Record<string, unknown> = { clip: c.name, what: c.what, velocity: c.vel, notes: p.notes.length };
  const monos: { data: Float32Array; fs: number }[] = [];
  for (const [tag, render] of engines) {
    const wet = render({ sampleRate: FS, instrument: 'flute', events: p.events, duration: p.dur });
    mp3(`${c.name}-${tag}`, wet.left, wet.right);
    monos.push({ data: wet.left, fs: FS });
    // the numbers, dry: each note that is higher than the one before it and joined to it
    const dry = render({ sampleRate: FS, instrument: 'flute', events: p.events, duration: p.dur, dry: true });
    const held = heldPower(render, FS);
    const bad: string[] = [];
    const speak: number[] = [];
    let rises = 0;
    p.notes.forEach((n, i) => {
      const prev = p.notes[i - 1];
      if (!prev || n.t - prev.end > 0.01 || n.midi <= prev.midi) return;
      rises++;
      const a = Math.round(n.t * FS);
      const b = Math.round(Math.min(n.end, p.notes[i + 1]?.t ?? n.end) * FS);
      const fr = trackNote(dry.left, FS, n.midi, a, b);
      const ref = held(n.midi, n.vel);
      const body = fr.filter((f) => f.c >= a + 0.4 * (b - a) && f.c <= a + 0.9 * (b - a));
      const own = body.map((f) => f.own / Math.max(1e-18, f.own + f.rest)).sort((u, v) => u - v)[body.length >> 1];
      const lvl = body.map((f) => f.own).sort((u, v) => u - v)[body.length >> 1];
      let s = (b - a) / FS;
      for (let j = 0; j < fr.length; j++) {
        let ok = true;
        for (let q = j; q < Math.min(fr.length, j + 7); q++) if (!(fr[q].own >= 0.7 * (fr[q].own + fr[q].rest) && fr[q].own >= 0.25 * ref)) ok = false;
        if (ok) {
          s = (fr[j].c - a) / FS;
          break;
        }
      }
      speak.push(Math.round(s * 1000));
      if (own < 0.7 || lvl < ref / 16) bad.push(`${noteName(prev.midi)}→${noteName(n.midi)}${fluteFingering(n.midi).mode !== fluteFingering(prev.midi).mode ? '*' : ''}`);
    });
    row[tag] = { rises, 'not on their note': bad.length, which: bad.join(' '), 'speak ms (each rise)': speak.join(' ') };
    console.log(`${c.name} ${tag}: ${bad.length} of ${rises} rises not on their note${bad.length ? ` (${bad.join(' ')})` : ''}; speak ms ${speak.join(' ')}`);
  }
  png(c.name, monos, Math.min(p.dur, 12), 6000);
  index.push(row);
}

// two real passages: the flute's own piece (Bach, the Partita's Bourrée anglaise) and Flute I in the Andante
// of Beethoven's Fifth, each its busiest 10 s
const parts = windParts();
for (const [name, partName, what] of [
  ['own-piece', 'demo flute', 'Flute alone: Bach, Partita in A minor, Bourrée anglaise, its busiest 10 s'],
  ['beethoven5-ii', 'beethoven5-ii flute 1', 'Flute I, Beethoven, Symphony No. 5, II, its busiest 10 s'],
] as const) {
  const part = parts.find((x) => x.name === partName)!;
  const start = busiest(part.notes, 10, part.duration);
  const ex = excerpt(part, start, 10);
  const events = [...foreseen(ex.notes), ...ex.events];
  const row: Record<string, unknown> = { clip: name, what, part: partName, from: start, seconds: 10, notes: ex.notes.length };
  const monos: { data: Float32Array; fs: number }[] = [];
  for (const [tag, render] of engines) {
    const wet = render({ sampleRate: FS, instrument: 'flute', events, duration: ex.dur, player: part.player });
    mp3(`${name}-${tag}`, wet.left, wet.right);
    monos.push({ data: wet.left, fs: FS });
    const dry = render({ sampleRate: FS, instrument: 'flute', events, duration: ex.dur, dry: true, player: part.player });
    const s = summary({ name: partName, instrument: 'flute', start, seconds: 10, ...measure(dry.left, FS, ex.notes, ex.events.map((e) => e.time), heldLevels(render, 'flute', FS, part.player)) });
    row[tag] = s;
    console.log(`${name} ${tag}: ${['lost', 'impure notes', 'on another mode', 'speak joined ms (med)', 'speak joined ms (p90)', 'reach dB (p10)', 'worst jump ×'].map((k) => `${k} ${s[k]}`).join(' | ')}`);
  }
  png(name, monos, 10, 6000);
  index.push(row);
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));
