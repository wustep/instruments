// The flute through several engines, the same notes: to hear (mp3s, a stacked spectrogram) and to read (each
// note's pitch and level from a dry render, by how long the note is). Written for the regression after #74
// ("the flute sounds worse than it was before"): what a player's vibrato, wander and release do to notes of
// every length, not only to the long tones they were measured on.
//   npx tsx scripts/flute-ab.ts --engine before=<old>/packages/engine/src/core/index.ts [--engine now=…] [--engine fixed=.]
//       [--out artifacts/flute-regression] [--only held,swaps,tune,slow,toward,toward-busy,passiton,everything,demo,beethoven]
//       [--no-audio] [--<clip>-start <s>]
// Clips (each `<clip>-<tag>.mp3`, `<clip>.png` the engines stacked in the order given, `index.json` the numbers):
//   held        long notes alone, pp to ff, low to high (told ahead, as a file's)
//   swaps       the flute over both register breaks (render-winds-legato's passage)
//   tune        a quick tongued tune and a slurred one in eighths: notes too short for a vibrato
//   slow        a slow slurred line: long notes joined, one breath
//   toward, toward-busy, passiton, everything   the first flute of each of the project's three pieces alone, as the
//               Orchestra plays it (Toward Morning twice: its long notes from 45 s, its busiest 20 s from 150 s)
//   demo        the flute's own piece (what the flute's page plays), its busiest 20 s
//   beethoven   Beethoven's Fifth, II, the first flute's busiest 20 s
// Per note (dry render, the left channel): where its pitch sits (the median over its held part, cents off equal
// temperament), how far the pitch moves inside it (5th to 95th percentile), how far its level moves (the same,
// dB, over 20 ms). Summed by length: short (under 0.3 s), middling, long (0.7 s and more).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import type { TimedEvent } from '../packages/engine/src/core/render.ts';
import { spectrogramPng } from './spectrogram.ts';
import { cents, et, med, pct, trackFrames } from './winds-legato-lib.ts';
import { foreseen, pairNotes, windParts, type PartNote, type WindPart } from './winds-midi-lib.ts';
import { excerpt } from './winds-midi-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'flute-regression'))!);
const ONLY = opt('--only')?.split(',');
const AUDIO = !args.includes('--no-audio');
const FS = 48000;
type Render = typeof import('../packages/engine/src/core/index.ts').renderInstrument;
const engines: [string, Render][] = [];
for (let i = 0; i < args.length; i++)
  if (args[i] === '--engine') {
    const [tag, p] = args[i + 1].split('=');
    const path = p === '.' ? join(import.meta.dirname, '../packages/engine/src/core/index.ts') : resolve(p);
    engines.push([tag, (await import(pathToFileURL(path).href)).renderInstrument]);
  }
if (!engines.length) throw new Error('--engine tag=path/to/core/index.ts (or tag=. for this checkout), once or more');
mkdirSync(OUT, { recursive: true });

function mp3(name: string, L: Float32Array, R: Float32Array): void {
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '128k', join(OUT, `${name}.mp3`)]);
  rmSync(wav);
}
function png(name: string, monos: { data: Float32Array; fs: number }[], dur: number, fmax: number): void {
  const file = join(OUT, `${name}.png`);
  spectrogramPng(file, monos, { start: 0, dur, fmax, win: 2048, hop: Math.max(120, Math.round((dur * FS) / 1800)), height: 260, range: 70 });
  try {
    execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGB").quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)\nim.save(sys.argv[1], optimize=True)', file], { stdio: 'ignore' });
  } catch {
    /* as written */
  }
}

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

/** phrases of notes: each [pitches, seconds a note (or one length per note), slurred?, velocity], a rest of
 *  `rest` s between phrases */
type Phrase = [number[], number | number[], boolean, number?];
function phrases(ps: Phrase[], vel: number, rest = 0.4): { events: TimedEvent[]; notes: PartNote[]; dur: number } {
  const ev: TimedEvent[] = [];
  let t = 0.15;
  for (const [pitches, lens, slur, v] of ps) {
    pitches.forEach((p, i) => {
      const len = typeof lens === 'number' ? lens : lens[i];
      const last = i === pitches.length - 1;
      ev.push({ time: t, event: { type: 'noteOn', midi: p, velocity: v ?? vel } }, { time: t + len + (slur && !last ? 0.03 : 0), event: { type: 'noteOff', midi: p } });
      t += len;
    });
    t += rest;
  }
  ev.sort((a, b) => a.time - b.time || (a.event.type === 'noteOff' ? 0 : 1) - (b.event.type === 'noteOff' ? 0 : 1));
  const notes = pairNotes(ev, t + 1);
  return { events: [...foreseen(notes), ...ev], notes, dur: t + 0.8 };
}

interface NoteStat { midi: number; len: number; vel: number; off: number; move: number; swing: number; level: number }
/** each note of a dry render: its pitch's place and movement, its level's movement */
function read(x: Float32Array, notes: PartNote[]): NoteStat[] {
  const out: NoteStat[] = [];
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const end = Math.min(n.end, notes[i + 1]?.t ?? n.end);
    const len = end - n.t;
    if (len < 0.09) continue;
    // (the held part: past the attack or the join, short of the end)
    const a = n.t + Math.min(0.12, 0.4 * len);
    const b = end - Math.min(0.03, 0.15 * len);
    const fr = trackFrames(x, FS, a, b, et(n.midi), et(n.midi), 0.002, 4).filter((f) => f.f > 0 && f.clear > 0.8);
    if (fr.length < 8) continue;
    const c = fr.map((f) => cents(f.f, et(n.midi))).filter((v) => Math.abs(v) < 80);
    if (c.length < 8) continue;
    // (smoothed over 10 ms: the tracker's own scatter out)
    const cs: number[] = [];
    for (let k = 2; k < c.length - 2; k++) cs.push((c[k - 2] + c[k - 1] + c[k] + c[k + 1] + c[k + 2]) / 5);
    const lv: number[] = [];
    const W = Math.round(0.02 * FS);
    for (let s = Math.round(a * FS); s + W <= Math.round(b * FS); s += W >> 1) {
      let p = 0;
      for (let k = 0; k < W; k++) p += x[s + k] * x[s + k];
      lv.push(10 * Math.log10(p / W + 1e-18));
    }
    out.push({ midi: n.midi, len, vel: n.vel, off: med(c), move: cs.length ? pct(cs, 0.95) - pct(cs, 0.05) : 0, swing: lv.length > 2 ? pct(lv, 0.95) - pct(lv, 0.05) : 0, level: med(lv) });
  }
  return out;
}
const sd = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const r1 = (x: number) => (Number.isFinite(x) ? +x.toFixed(1) : null);
function sum(st: NoteStat[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [name, lo, hi] of [['short (under 0.3 s)', 0, 0.3], ['middling', 0.3, 0.7], ['long (0.7 s and more)', 0.7, 1e9]] as const) {
    const s = st.filter((n) => n.len >= lo && n.len < hi);
    if (!s.length) continue;
    // (a note's place against the others of its pitch: what the tuning table leaves is not the player's)
    const by = new Map<number, number[]>();
    for (const n of s) by.set(n.midi, [...(by.get(n.midi) ?? []), n.off]);
    const rel: number[] = [];
    for (const v of by.values()) if (v.length > 1) for (const o of v) rel.push(o - v.reduce((a, b) => a + b, 0) / v.length);
    row[name] = {
      notes: s.length,
      'pitch off, cents (sd over the notes)': r1(sd(s.map((n) => n.off))),
      'pitch off, cents (worst)': r1(Math.max(...s.map((n) => Math.abs(n.off)))),
      'the same pitch again, cents apart (sd)': rel.length > 2 ? r1(sd(rel)) : null,
      'pitch moves inside a note, cents (median, 90th)': [r1(med(s.map((n) => n.move))), r1(pct(s.map((n) => n.move), 0.9))],
      'level moves inside a note, dB (median, 90th)': [r1(med(s.map((n) => n.swing))), r1(pct(s.map((n) => n.swing), 0.9))],
    };
  }
  return row;
}
const line = (s: Record<string, unknown>) =>
  Object.entries(s)
    .map(([k, v]) => {
      const o = v as Record<string, unknown>;
      return `   ${k.split(' ')[0].padEnd(8)} n ${String(o.notes).padStart(3)} | off sd ${o['pitch off, cents (sd over the notes)']} worst ${o['pitch off, cents (worst)']} again ${o['the same pitch again, cents apart (sd)']} | moves ${(o['pitch moves inside a note, cents (median, 90th)'] as number[]).join('/')} ¢ | level ${(o['level moves inside a note, dB (median, 90th)'] as number[]).join('/')} dB`;
    })
    .join('\n');

interface Clip { name: string; what: string; events: TimedEvent[]; notes: PartNote[]; dur: number; player?: number; gain?: [number, number][]; start?: number; fmax?: number }
const clips: Clip[] = [];
const want = (k: string) => !ONLY || ONLY.includes(k);

if (want('held')) {
  const p = phrases([[[67], 2.6, false, 40], [[69], 2.6, false, 72], [[74], 2.6, false, 72], [[81], 2.6, false, 72], [[88], 2.6, false, 72], [[84], 2.6, false, 105]], 72, 0.6);
  clips.push({ name: 'held', what: 'Long notes alone (2.6 s each, a file’s): G4 pp, A4 mf, D5 mf, A5 mf, E6 mf, C6 ff', ...p });
}
if (want('swaps')) {
  const p = phrases(
    [
      [[69, 71, 73, 74, 76, 78, 79, 78, 76, 74, 73, 71, 69], 0.24, true],
      [[69, 76, 81, 76, 69, 72, 79, 84, 79, 72], 0.3, true],
      [[65, 77, 65, 77, 69, 81, 69], 0.36, true],
      [[81, 83, 85, 86, 88, 86, 85, 83, 81], 0.24, true],
      [[69, 71, 73, 74, 76, 78, 79, 78, 76, 74, 73, 71, 69], 0.16, false],
      [[74, 73, 76, 74], 0.95, true],
    ],
    80,
  );
  clips.push({ name: 'swaps', what: 'The flute over both register breaks: slurred steps, leaps, octaves, the upper break, the steps tongued, a slow slurred line', ...p });
}
if (want('tune')) {
  // Bach, Badinerie (BWV 1067), its opening, tongued; Grieg, Morning Mood, its opening, slurred in eighths
  const e = 0.25;
  const s = 0.125;
  const bad: Phrase = [[83, 86, 83, 78, 83, 78, 74, 78, 74, 71, 66, 71, 74, 71, 73, 71, 73, 71, 70, 73, 76, 73, 74, 71], [e, s, s, e, s, s, e, s, s, 2 * e, s, s, s, s, s, s, s, s, s, s, s, s, e, e], false];
  const g = 0.3;
  const grieg: Phrase = [[83, 80, 78, 76, 78, 80, 83, 80, 78, 76, 78, 80, 78, 80, 83, 80, 83, 85, 80, 85, 83, 80, 78, 76], [g, g, g, g, g, g, g, g, g, g, g, g, g, g, g, g, g, g, g, g, g, g, g, 1.2], true, 64];
  const p = phrases([bad, bad, grieg], 84, 0.5);
  clips.push({ name: 'tune', what: 'Quick notes: the Badinerie’s opening tongued (twice), then Morning Mood’s opening slurred in eighths of 0.3 s', ...p });
}
if (want('slow')) {
  const p = phrases(
    [
      [[77, 81, 84, 89, 88, 84, 81, 79, 77], [1.2, 0.6, 0.6, 1.8, 0.6, 0.6, 1.2, 0.6, 2.2], true, 66],
      [[72, 74, 76, 72, 79, 77, 76, 74, 72], [0.9, 0.45, 0.45, 0.9, 1.35, 0.45, 0.45, 0.45, 2.0], true, 54],
    ],
    66,
    0.7,
  );
  clips.push({ name: 'slow', what: 'A slow slurred line, twice (mf across the upper break, then p in the low and middle registers): long notes joined in one breath', ...p });
}
{
  const parts = ONLY && !['toward', 'toward-busy', 'passiton', 'everything', 'demo', 'beethoven'].some((k) => ONLY.includes(k)) ? [] : windParts();
  const solo = (key: string, find: string, start: number, secs: number) => {
    if (!want(key)) return;
    const p = parts.find((q) => q.name.includes(find));
    if (!p) throw new Error(`no part ${find}: ${parts.map((q) => q.name).join(', ')}`);
    const ex = excerpt(p as WindPart, start, secs);
    clips.push({ name: key, what: `${p.name} alone, as the Orchestra plays it, from ${start} s for ${secs} s (${ex.notes.length} notes)`, events: [...foreseen(ex.notes), ...ex.events], notes: ex.notes, dur: ex.dur, player: p.player, gain: p.gain, start });
  };
  const at = (k: string, d: number) => Number(opt(`--${k}-start`, String(d)));
  solo('toward', 'toward-morning flute 1', at('toward', 45), 20);
  solo('toward-busy', 'toward-morning flute 1', at('toward-busy', 150), 20);
  solo('passiton', 'pass-it-on flute 1', at('passiton', 150), 20);
  solo('everything', 'everything-so-far flute 1', at('everything', 110), 20);
  solo('demo', 'demo flute', at('demo', 35), 20);
  solo('beethoven', 'beethoven5-ii flute 1', at('beethoven', 260), 20);
}

const index: Record<string, unknown>[] = [];
for (const c of clips) {
  const row: Record<string, unknown> = { clip: c.name, what: c.what, seconds: +c.dur.toFixed(1), notes: c.notes.length };
  console.log(`\n${c.name}: ${c.what}`);
  const monos: { data: Float32Array; fs: number }[] = [];
  for (const [tag, render] of engines) {
    if (AUDIO) {
      const wet = render({ sampleRate: FS, instrument: 'flute', events: c.events, duration: c.dur, player: c.player });
      if (c.gain) {
        applyGain(wet.left, c.gain, c.start ?? 0);
        applyGain(wet.right, c.gain, c.start ?? 0);
      }
      mp3(`${c.name}-${tag}`, wet.left, wet.right);
      monos.push({ data: wet.left, fs: FS });
    }
    const dry = render({ sampleRate: FS, instrument: 'flute', events: c.events, duration: c.dur, dry: true, player: c.player });
    const s = sum(read(dry.left, c.notes));
    row[tag] = s;
    console.log(` ${tag}\n${line(s)}`);
  }
  if (AUDIO) png(c.name, monos, c.dur, c.fmax ?? 5000);
  index.push(row);
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));
