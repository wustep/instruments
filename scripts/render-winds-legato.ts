// A wind going from note to note, to hear: through an older engine (--before) and this checkout, as the
// file player sends the notes (told ahead: `foresee`; the player's automatic expression on the pieces' parts).
//   npx tsx scripts/render-winds-legato.ts --before <old>/packages/engine/src/core/index.ts [--out artifacts/winds-legato]
//       [--piece beethoven5-ii] [--start 30] [--seconds 20] [--scan]
//       [--solo "toward-morning flute 1" --solo-start 45 --solo-seconds 16 --solo-name flute-solo]
// Writes
//   flute-swaps-{before,after}.mp3   the flute alone over both its register breaks: slurred steps, leaps and
//                                    octaves, the same steps tongued, a slow slurred line (its vibrato)
//   winds-{before,after}.mp3         the woodwinds of a bundled piece's passage together (every flute, oboe,
//                                    clarinet and bassoon part, as the Orchestra routes and plays them), the
//                                    stretch where the flutes cross their registers most
//   <solo-name>-{before,after}.mp3   with --solo: that one part alone, as the Orchestra plays it (its seat's room
//                                    left out: the instrument's own), from --solo-start for --solo-seconds; and only it
//   flute-swaps.png, winds.png       stacked spectrograms, the older engine on top
//   index.json                       each clip's numbers, from dry renders of the same notes: every note
//                                    joined to the one before it (slurred, tongued or after a rest under
//                                    0.12 s), read as scripts/winds-legato.ts reads a pair
// --scan lists every bundled piece's stretches by how often its flutes cross a register joined.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import type { TimedEvent } from '../packages/engine/src/core/render.ts';
import { fluteFingering } from '../packages/engine/src/core/flute.ts';
import { spectrogramPng } from './spectrogram.ts';
import { measureJoin, med, noteName, pct, type JoinMeasure } from './winds-legato-lib.ts';
import { foreseen, pairNotes, windParts, type PartNote, type WindPart } from './winds-midi-lib.ts';
import { excerpt } from './winds-midi-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'winds-legato'))!);
const BEFORE = opt('--before');
const SECONDS = Number(opt('--seconds', '20'));
const FS = 48000;
const WOODS = ['flute', 'oboe', 'clarinet', 'bassoon'];
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
  spectrogramPng(file, monos, { start: 0, dur, fmax, win: 2048, hop: Math.max(120, Math.round((dur * FS) / 1800)), height: 280, range: 70 });
  try {
    execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGB").quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)\nim.save(sys.argv[1], optimize=True)', file], { stdio: 'ignore' });
  } catch {
    /* as written */
  }
}

/** a wind's notes joined to the one before them (slurred, tongued, or after a rest under 0.12 s: the breath
 *  kept), each read from the dry render */
function joins(x: Float32Array, notes: PartNote[], isFlute: boolean): (JoinMeasure & { from: number; to: number; cross: boolean; t: number })[] {
  const out: (JoinMeasure & { from: number; to: number; cross: boolean; t: number })[] = [];
  for (let i = 1; i < notes.length; i++) {
    const p = notes[i - 1];
    const n = notes[i];
    const end = Math.min(n.end, notes[i + 1]?.t ?? n.end);
    if (n.midi === p.midi || n.t - p.end > 0.12 || end - n.t < 0.06 || n.t - p.t < 0.06) continue;
    const { m } = measureJoin(x, FS, p.midi, n.midi, p.t, n.t, end);
    out.push({ ...m, from: p.midi, to: n.midi, cross: isFlute && fluteFingering(p.midi).mode !== fluteFingering(n.midi).mode, t: n.t });
  }
  return out;
}
function say(j: ReturnType<typeof joins>): Record<string, number | string> {
  // (a note is late if it has not spoken in 40 ms, or in half its length where it is shorter than 80 ms)
  const late = j.filter((x) => x.speakMs > 40);
  const cracked = j.filter((x) => x.crackMs > 10);
  return {
    'notes joined to the last': j.length,
    'across a register': j.filter((x) => x.cross).length,
    'late (over 40 ms)': late.length,
    'on a wrong register over 10 ms': cracked.length,
    'speak ms (median)': med(j.map((x) => x.speakMs)),
    'speak ms (90th percentile)': pct(j.map((x) => x.speakMs), 0.9),
    'neither note, ms (90th percentile)': pct(j.map((x) => x.betweenMs), 0.9),
    'hole dB (10th percentile)': pct(j.map((x) => x.dipDb), 0.1),
    'worst click ×': Math.max(0, ...j.map((x) => x.jump)),
    which: [...new Set([...late, ...cracked].map((x) => `${noteName(x.from)}→${noteName(x.to)}`))].slice(0, 16).join(' '),
  };
}

// ------------------------------------------------------------------ the pieces' woodwinds
const parts = windParts().filter((p) => WOODS.includes(p.instrument) && !p.piece.startsWith('demo-'));
/** how often a piece's flutes cross a register joined to the note before, from `s` for `seconds` */
const crossings = (piece: string, s: number, seconds: number) => {
  let n = 0;
  for (const p of parts.filter((q) => q.piece === piece && q.instrument === 'flute'))
    for (let i = 1; i < p.notes.length; i++) {
      const a = p.notes[i - 1];
      const b = p.notes[i];
      if (b.t >= s && b.t < s + seconds && b.t - a.end <= 0.12 && fluteFingering(a.midi).mode !== fluteFingering(b.midi).mode) n++;
    }
  return n;
};
const pieces = [...new Set(parts.map((p) => p.piece))];
let best = { piece: opt('--piece', '')!, start: Number(opt('--start', '-1')), n: -1 };
for (const piece of pieces) {
  const dur = parts.find((p) => p.piece === piece)!.duration;
  const playing = (s: number) => new Set(parts.filter((p) => p.piece === piece && p.notes.some((x) => x.t >= s && x.t < s + SECONDS)).map((p) => p.instrument)).size;
  let top = { start: 0, n: -1 };
  for (let s = 0; s <= Math.max(0, dur - SECONDS); s += 1) {
    const n = playing(s) >= 3 ? crossings(piece, s, SECONDS) : -1;
    if (n > top.n) top = { start: s, n };
  }
  if (args.includes('--scan')) console.log(`${piece.padEnd(22)} ${parts.filter((p) => p.piece === piece).map((p) => p.name.split(' ').slice(1).join(' ')).join(', ')}: most crossings ${top.n} from ${top.start} s`);
  if (!opt('--piece') && top.n > best.n) best = { piece, start: top.start, n: top.n };
}
if (opt('--piece') && best.start >= 0) best.n = crossings(best.piece, best.start, SECONDS);
if (opt('--piece') && best.start < 0) {
  const dur = parts.find((p) => p.piece === best.piece)!.duration;
  for (let s = 0; s <= Math.max(0, dur - SECONDS); s += 1) {
    const n = crossings(best.piece, s, SECONDS);
    if (n > best.n) best = { ...best, start: s, n };
  }
}
if (args.includes('--scan')) process.exit(0);

/** the part's volume × expression (the browser's gain after the engine), a 20 ms glide to each step */
function applyGain(x: Float32Array, steps: [number, number][], start: number): void {
  if (!steps.length) return;
  let g = 1;
  let target = 1;
  let k = 0;
  while (k < steps.length && steps[k][0] <= start) g = target = steps[k++][1];
  const a = 1 - Math.exp(-1 / (0.02 * FS));
  for (let i = 0; i < x.length; i++) {
    while (k < steps.length && steps[k][0] - start + 0.1 <= i / FS) target = steps[k++][1];
    g += (target - g) * a;
    x[i] *= g;
  }
}

const index: Record<string, unknown>[] = [];

// ------------------------------------------------------------------ one part alone (--solo)
if (opt('--solo')) {
  const p = windParts().find((q) => q.name.includes(opt('--solo')!))!;
  if (!p) throw new Error(`no part ${opt('--solo')}`);
  const start = Number(opt('--solo-start', '0'));
  const secs = Number(opt('--solo-seconds', '16'));
  const name = opt('--solo-name', 'solo')!;
  const ex = excerpt(p as WindPart, start, secs);
  const events = [...foreseen(ex.notes), ...ex.events];
  const monos: { data: Float32Array; fs: number }[] = [];
  for (const [tag, render] of engines) {
    const wet = render({ sampleRate: FS, instrument: p.instrument, events, duration: ex.dur, player: p.player });
    applyGain(wet.left, p.gain, start);
    applyGain(wet.right, p.gain, start);
    mp3(`${name}-${tag}`, wet.left, wet.right);
    monos.push({ data: wet.left, fs: FS });
  }
  png(name, monos, ex.dur, 5000);
  console.log(`${name}: ${p.name}, from ${start} s for ${secs} s, ${ex.notes.length} notes`);
  process.exit(0);
}

// ------------------------------------------------------------------ the flute alone, over its breaks
/** phrases of notes: each [pitches, seconds a note, slurred?], a rest of 0.4 s between phrases */
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
    t += 0.4;
  }
  ev.sort((a, b) => a.time - b.time || (a.event.type === 'noteOff' ? 0 : 1) - (b.event.type === 'noteOff' ? 0 : 1));
  const notes = pairNotes(ev, t + 1);
  return { events: [...foreseen(notes), ...ev], notes, dur: t + 0.5 };
}
{
  const SWAPS: Phrase[] = [
    // steps over the first break (C♯5 | D5), slurred, up and back
    [[69, 71, 73, 74, 76, 78, 79, 78, 76, 74, 73, 71, 69], 0.24, true],
    // leaps over it, slurred
    [[69, 76, 81, 76, 69, 72, 79, 84, 79, 72], 0.3, true],
    // the same fingering's octave, slurred
    [[65, 77, 65, 77, 69, 81, 69], 0.36, true],
    // steps over the second break (C♯6 | D6), slurred
    [[81, 83, 85, 86, 88, 86, 85, 83, 81], 0.24, true],
    // the first steps again, each note tongued where the last ends, quicker
    [[69, 71, 73, 74, 76, 78, 79, 78, 76, 74, 73, 71, 69], 0.16, false],
    // a slow slurred line across the break: one breath, one vibrato
    [[74, 73, 76, 74], 0.95, true],
  ];
  const p = phrases(SWAPS, 80);
  const row: Record<string, unknown> = { clip: 'flute-swaps', what: 'The flute alone over both its register breaks: slurred steps up and back, leaps, octaves on one fingering, steps over the upper break, the first steps tongued, a slow slurred line', seconds: +p.dur.toFixed(1), notes: p.notes.length };
  const monos: { data: Float32Array; fs: number }[] = [];
  for (const [tag, render] of engines) {
    const wet = render({ sampleRate: FS, instrument: 'flute', events: p.events, duration: p.dur });
    mp3(`flute-swaps-${tag}`, wet.left, wet.right);
    monos.push({ data: wet.left, fs: FS });
    const dry = render({ sampleRate: FS, instrument: 'flute', events: p.events, duration: p.dur, dry: true });
    const s = say(joins(dry.left, p.notes, true));
    row[tag] = s;
    console.log(`flute-swaps ${tag}: ${Object.entries(s).map(([k, v]) => `${k} ${v}`).join(' | ')}`);
  }
  png('flute-swaps', monos, p.dur, 5000);
  index.push(row);
}

// ------------------------------------------------------------------ the woodwinds together
{
  const mine = parts.filter((p) => p.piece === best.piece);
  const row: Record<string, unknown> = { clip: 'winds', what: `The woodwinds of ${best.piece} together (${mine.map((p) => p.name.split(' ').slice(1).join(' ')).join(', ')}), from ${best.start} s for ${SECONDS} s: the stretch where its flutes cross a register most (${best.n} times)`, piece: best.piece, from: best.start, seconds: SECONDS };
  console.log(row.what);
  const monos: { data: Float32Array; fs: number }[] = [];
  for (const [tag, render] of engines) {
    const n = Math.ceil((SECONDS + 2.6) * FS);
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    const g = 1 / Math.sqrt(mine.length);
    const per: Record<string, unknown> = {};
    const all: ReturnType<typeof joins> = [];
    for (const p of mine) {
      const ex = excerpt(p as WindPart, best.start, SECONDS);
      if (!ex.notes.length) continue;
      const events = [...foreseen(ex.notes), ...ex.events];
      const wet = render({ sampleRate: FS, instrument: p.instrument, events, duration: ex.dur, player: p.player });
      applyGain(wet.left, p.gain, best.start);
      applyGain(wet.right, p.gain, best.start);
      for (let i = 0; i < Math.min(n, wet.left.length); i++) {
        L[i] += g * wet.left[i];
        R[i] += g * wet.right[i];
      }
      const dry = render({ sampleRate: FS, instrument: p.instrument, events, duration: ex.dur, dry: true, player: p.player });
      const j = joins(dry.left, ex.notes, p.instrument === 'flute');
      per[p.name] = say(j);
      if (p.instrument === 'flute') all.push(...j);
    }
    mp3(`winds-${tag}`, L, R);
    monos.push({ data: L, fs: FS });
    row[tag] = { flutes: say(all), parts: per };
    console.log(`winds ${tag}, the flutes: ${Object.entries(say(all)).map(([k, v]) => `${k} ${v}`).join(' | ')}`);
    for (const [k, v] of Object.entries(per)) console.log(`   ${k}: joined ${(v as Record<string, number>)['notes joined to the last']}, late ${(v as Record<string, number>)['late (over 40 ms)']}, wrong register ${(v as Record<string, number>)['on a wrong register over 10 ms']}, speak ms median ${(v as Record<string, number>)['speak ms (median)']}`);
  }
  png('winds', monos, SECONDS + 1, 5000);
  index.push(row);
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));
