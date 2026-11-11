// The winds and brass playing real passages of the bundled pieces, each part as the browser sends it (its
// notes, the notes told ahead, the player's automatic expression: scripts/winds-midi-lib.ts), through an
// older engine (--before) and this checkout: MP3s as heard (the room on), stacked spectrograms (before on
// top), and each clip's numbers (scripts/winds-midi-measure.ts, on dry renders of the same notes).
//   npx tsx scripts/render-winds-midi.ts --before <old>/packages/engine/src/core/index.ts
//       [--out artifacts/realistic-3d/final-symphony/winds-midi/audio] [--only flute] [--seconds 16]
//       [file.mid ...]
// Given MIDI files, their wind and brass parts (routed as a dropped file is) instead of the bundled pieces:
// for a file that is not in the repository, with --out somewhere outside it.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import { spectrogramPng } from './spectrogram.ts';
import { foreseen, windParts, type WindPart } from './winds-midi-lib.ts';
import { busiest, excerpt, heldLevels, measure, summary, type PartMeasure } from './winds-midi-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => {
  const i = args.indexOf(k);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'realistic-3d', 'final-symphony', 'winds-midi', 'audio'))!);
const BEFORE = opt('--before');
const ONLY = opt('--only');
const SECONDS = Number(opt('--seconds', '16'));
const FS = 48000;
type Render = typeof import('../packages/engine/src/core/index.ts').renderInstrument;
const engines: [string, Render][] = [];
for (const [tag, path] of [...(BEFORE ? [['before', resolve(BEFORE)]] : []), ['after', join(import.meta.dirname, '../packages/engine/src/core/index.ts')]]) engines.push([tag, (await import(pathToFileURL(path).href)).renderInstrument]);
mkdirSync(OUT, { recursive: true });

/** the clips: a part and where it starts (default: its busiest stretch) */
interface Clip {
  name: string;
  part: string;
  start?: number;
  what: string;
}
const files = args.length ? args : undefined;
const parts = windParts(files);
const clips: Clip[] = files
  ? parts.map((p) => ({ name: p.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase(), part: p.name, what: `${p.name}, its busiest ${SECONDS} s` }))
  : [
      // Beethoven's Fifth, I, bars 303 on (the recapitulation's tutti: the motif's repeated eighths, runs across
      // the flute's registers), one of each pair, as the Orchestra routes them
      { name: 'flute-beethoven5-i', part: 'beethoven5-i flute 1', what: 'Flute I, Beethoven, Symphony No. 5, I: repeated eighths and falls across the registers' },
      { name: 'oboe-beethoven5-i', part: 'beethoven5-i oboe 1', what: 'Oboe I, the same movement' },
      { name: 'clarinet-beethoven5-i', part: 'beethoven5-i clarinet 1', what: 'Clarinet I, the same movement' },
      { name: 'bassoon-beethoven5-i', part: 'beethoven5-i bassoon 1', what: 'Bassoon I, the same movement' },
      { name: 'horn-beethoven5-i', part: 'beethoven5-i horn 1', what: 'Horn I, the same movement' },
      { name: 'trumpet-beethoven5-i', part: 'beethoven5-i trumpet 1', what: 'Trumpet I, the same movement' },
      { name: 'trombone-air', part: 'air trombone 2', what: 'Trombone II (tenor), Bach, Air, arranged for four trombones' },
      // each instrument's own piece (the player's play icon)
      { name: 'flute-own-piece', part: 'demo flute', start: 0, what: 'Flute alone: Bach, Partita in A minor, Bourrée anglaise, from its start' },
      { name: 'bassoon-own-piece', part: 'demo bassoon', start: 0, what: 'Bassoon alone: Mozart, Bassoon Concerto, II, from its start' },
      { name: 'horn-own-piece', part: 'demo horn', start: 0, what: 'Horn alone: Beethoven, Horn Sonata, I, from the call' },
      { name: 'trumpet-own-piece', part: 'demo trumpet', start: 0, what: 'Trumpet alone: Handel, La Réjouissance, from its start' },
    ];

const db = (x: number) => 20 * Math.log10(Math.max(1e-9, x));
function mp3(name: string, L: Float32Array, R: Float32Array): void {
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '128k', join(OUT, `${name}.mp3`)]);
  rmSync(wav);
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

// (the Beethoven clips share one stretch, so that they can be heard together: the busiest for the six)
const together = clips.filter((c) => c.part.startsWith('beethoven5-i ')).map((c) => parts.find((x) => x.name === c.part)!);
const common = together.length ? busiest(together.flatMap((p) => p.notes), SECONDS, together[0].duration) : 0;
const index: Record<string, unknown>[] = [];
const mixes = new Map<string, { L: Float32Array; R: Float32Array }[]>();
for (const c of clips) {
  if (ONLY && !c.name.includes(ONLY)) continue;
  const p: WindPart | undefined = parts.find((x) => x.name === c.part);
  if (!p) throw new Error(`no part ${c.part}`);
  const start = c.start ?? (c.part.startsWith('beethoven5-i ') && !files ? common : busiest(p.notes, SECONDS, p.duration));
  const ex = excerpt(p, start, SECONDS);
  const events = [...foreseen(ex.notes), ...ex.events];
  const row: Record<string, unknown> = { clip: c.name, what: c.what, part: c.part, instrument: p.instrument, from: start, seconds: SECONDS, notes: ex.notes.length };
  const monos: { data: Float32Array; fs: number }[] = [];
  for (const [tag, render] of engines) {
    // as heard: the room on
    const wet = render({ sampleRate: FS, instrument: p.instrument, events, duration: ex.dur, player: p.player });
    applyGain(wet.left, p.gain, start);
    applyGain(wet.right, p.gain, start);
    mp3(`${c.name}-${tag}`, wet.left, wet.right);
    monos.push({ data: wet.left, fs: FS });
    // the numbers: the same notes dry
    const dry = render({ sampleRate: FS, instrument: p.instrument, events, duration: ex.dur, dry: true, player: p.player });
    const m: PartMeasure = { name: c.part, instrument: p.instrument, start, seconds: SECONDS, ...measure(dry.left, FS, ex.notes, ex.events.map((e) => e.time), heldLevels(render, p.instrument, FS, p.player)) };
    const s = summary(m);
    let pk = 0;
    for (let i = 0; i < wet.left.length; i++) pk = Math.max(pk, Math.abs(wet.left[i]), Math.abs(wet.right[i]));
    row[tag] = { ...s, 'peak as heard dBFS': +db(pk).toFixed(1) };
    console.log(`${c.name} ${tag}: ${Object.entries(s).filter(([k]) => ['lost', 'on another mode', 'reach fresh dB (min)', 'speak fresh ms (med)', 'hole dB (med)', 'repeat hole dB (med)', 'impure notes', 'worst jump ×'].includes(k)).map(([k, v]) => `${k} ${v}`).join(' | ')}`);
    if (c.part.startsWith('beethoven5-i ')) {
      const list = mixes.get(tag) ?? [];
      list.push({ L: wet.left, R: wet.right });
      mixes.set(tag, list);
    }
  }
  const png = join(OUT, `${c.name}.png`);
  spectrogramPng(png, monos, { start: 0, dur: Math.min(SECONDS, 12), fmax: 6000, win: 2048, hop: 360, height: 260, range: 70 });
  // (64 colours: a third of the size; skipped where Pillow is not installed)
  try {
    execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGB").quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)\nim.save(sys.argv[1], optimize=True)', png], { stdio: 'ignore' });
  } catch {
    /* as written */
  }
  index.push(row);
}
// the six Beethoven parts together (one of each pair), at the Orchestra's bus gain for six
if (!files && !ONLY)
  for (const [tag, list] of mixes) {
    const n = Math.max(...list.map((x) => x.L.length));
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    const g = 1 / Math.sqrt(list.length);
    for (const x of list)
      for (let i = 0; i < x.L.length; i++) {
        L[i] += g * x.L[i];
        R[i] += g * x.R[i];
      }
    mp3(`winds-beethoven5-i-${tag}`, L, R);
  }
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));
