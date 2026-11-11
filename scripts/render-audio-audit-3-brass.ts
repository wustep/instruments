// Audio audit 3, the brass: the trumpet's notes tongued over the breath and the trombone's fast slurs, through
// an older engine (--before) and this checkout: MP3s as heard (the room on, 128 kb/s), stacked spectrograms
// (before on top) and each clip's numbers (dry renders of the same notes: scripts/winds-midi-measure.ts,
// scripts/trombone-slurs.ts) in index.json.
//   npx tsx scripts/render-audio-audit-3-brass.ts --before <old>/packages/engine/src/core/index.ts
//       [--out artifacts/round3/audio-audit-3/brass] [--only trumpet]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import type { InstrumentId } from '../packages/engine/src/core/instrument.ts';
import type { TimedEvent } from '../packages/engine/src/core/render.ts';
import { spectrogramPng } from './spectrogram.ts';
import { foreseen, pairNotes, windParts, type PartNote } from './winds-midi-lib.ts';
import { busiest, excerpt, heldLevels, measure, summary } from './winds-midi-measure.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'round3', 'audio-audit-3', 'brass'))!);
const BEFORE = opt('--before');
const ONLY = opt('--only');
const FS = 48000;
type Engine = typeof import('../packages/engine/src/core/index.ts');
const engines: [string, Engine][] = [];
for (const [tag, path] of [...(BEFORE ? [['before', resolve(BEFORE)]] : []), ['after', join(import.meta.dirname, '../packages/engine/src/core/index.ts')]]) engines.push([tag, await import(pathToFileURL(path).href)]);
mkdirSync(OUT, { recursive: true });

interface Clip {
  name: string;
  what: string;
  instrument: InstrumentId;
  player: number;
  events: TimedEvent[];
  notes: PartNote[];
  dur: number;
}
/** notes in a row: [pitch, length in s, how far it is held into the next (s; under 0: a rest that long)] */
function line(seq: [number, number, number?][], vel: number): { events: TimedEvent[]; notes: PartNote[]; dur: number } {
  const ev: TimedEvent[] = [];
  let t = 0.15;
  for (const [m, len, over = 0] of seq) {
    if (m > 0) ev.push({ time: t, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: t + len + over, event: { type: 'noteOff', midi: m } });
    t += len;
  }
  ev.sort((a, b) => a.time - b.time || (a.event.type === 'noteOff' ? 0 : 1) - (b.event.type === 'noteOff' ? 0 : 1));
  const notes = pairNotes(ev, t + 1);
  return { events: [...foreseen(notes), ...ev], notes, dur: t + 1.2 };
}
const rep = (m: number, n: number, len: number): [number, number, number?][] => Array.from({ length: n }, () => [m, len] as [number, number]);
const REST: [number, number] = [0, 0.3];
const clips: Clip[] = [];
// the trumpet, low: a pitch repeated (eighths at 120, sixteenths at 120 and 140), then a bugle's notes joined
// (G3 C4 E4 G4: each on another partial), tongued, at the same speeds
clips.push({
  name: 'trumpet-low-repeated-joined',
  what: 'Trumpet: G3 and C4 repeated (250, 125 and 107 ms notes), then G3 C4 E4 G4 C4 … joined with no rest (250 and 125 ms), forte',
  instrument: 'trumpet',
  player: 0,
  ...line([...rep(55, 4, 0.25), ...rep(60, 4, 0.25), REST, ...rep(55, 6, 0.125), ...rep(60, 6, 0.125), REST, ...rep(55, 8, 0.107), REST, ...[55, 60, 64, 67, 64, 60, 55, 60].map((m) => [m, 0.25] as [number, number]), REST, ...[55, 60, 64, 67, 64, 60, 55, 60, 64, 67, 64, 60, 55].map((m) => [m, 0.125] as [number, number])], 96),
});
// the trombone: a B♭ major scale slurred, up and back (170 and 139 ms a note), then in broken thirds (170 ms)
const SCALE = [46, 48, 50, 51, 53, 55, 57, 58, 57, 55, 53, 51, 50, 48, 46];
const THIRDS = [46, 50, 48, 51, 50, 53, 51, 55, 53, 57, 55, 58];
clips.push({
  name: 'trombone-fast-slur',
  what: 'Tenor trombone: a B♭ major scale slurred up and back at 170 and at 139 ms a note, then in broken thirds at 170 ms (each note held 30 ms into the next)',
  instrument: 'trombone',
  player: 0,
  ...line([...SCALE.map((m, i) => [m, 0.17, i < SCALE.length - 1 ? 0.03 : 0] as [number, number, number]), REST, ...SCALE.map((m, i) => [m, 0.139, i < SCALE.length - 1 ? 0.03 : 0] as [number, number, number]), REST, ...THIRDS.map((m, i) => [m, 0.17, i < THIRDS.length - 1 ? 0.03 : 0] as [number, number, number])], 88),
});
// real passages, as the Orchestra sends them
const parts = windParts();
for (const [name, part, what, seconds] of [
  ['trumpet-beethoven5-i', 'beethoven5-i trumpet 2', 'Trumpet II, Beethoven, Symphony No. 5, I: its busiest 16 s (G3 and C4, repeated and joined)', 16],
  ['trumpet-rejouissance', 'demo trumpet', 'Trumpet alone: Handel, La Réjouissance, its busiest 16 s', 16],
  ['trombone-toward-morning', 'toward-morning trombone 1', 'Trombone, Toward Morning: its busiest 16 s (slurs: its notes overlap)', 16],
  ['trombone-air', 'air trombone 1', 'Trombone I, Bach, Air, arranged for four trombones: its busiest 16 s', 16],
] as const) {
  const p = parts.find((x) => x.name === part);
  if (!p) throw new Error(`no part ${part}`);
  const ex = excerpt(p, busiest(p.notes, seconds, p.duration), seconds);
  clips.push({ name, what, instrument: p.instrument, player: p.player, events: [...foreseen(ex.notes), ...ex.events], notes: ex.notes, dur: ex.dur });
}

const db = (x: number) => 20 * Math.log10(Math.max(1e-9, x));
function mp3(name: string, L: Float32Array, R: Float32Array): void {
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '128k', join(OUT, `${name}.mp3`)]);
  rmSync(wav);
}
const index: Record<string, unknown>[] = [];
for (const c of clips) {
  if (ONLY && !c.name.includes(ONLY)) continue;
  const row: Record<string, unknown> = { clip: c.name, what: c.what, instrument: c.instrument, notes: c.notes.length };
  const monos: { data: Float32Array; fs: number }[] = [];
  for (const [tag, E] of engines) {
    const wet = E.renderInstrument({ sampleRate: FS, instrument: c.instrument, events: c.events, duration: c.dur, player: c.player });
    mp3(`${c.name}-${tag}`, wet.left, wet.right);
    monos.push({ data: wet.left, fs: FS });
    const dry = E.renderInstrument({ sampleRate: FS, instrument: c.instrument, events: c.events, duration: c.dur, dry: true, player: c.player });
    const times = c.events.filter((e) => (e.event as { type: string }).type !== 'foresee').map((e) => e.time);
    const m = { name: c.name, instrument: c.instrument, start: 0, seconds: c.dur, ...measure(dry.left, FS, c.notes, times, heldLevels(E.renderInstrument, c.instrument, FS, c.player)) };
    const s = summary(m);
    let pk = 0;
    for (let i = 0; i < wet.left.length; i++) pk = Math.max(pk, Math.abs(wet.left[i]), Math.abs(wet.right[i]));
    row[tag] = { ...s, 'peak as heard dBFS': +db(pk).toFixed(1) };
    console.log(`${c.name} ${tag}: ${Object.entries(s).filter(([k]) => ['notes', 'lost', 'speak joined ms (med)', 'speak joined ms (p90)', 'hole dB (med)', 'hole ms (med)', 'repeat hole dB (med)', 'repeat hole ms (med)', 'impure notes', 'off-pitch notes (>35 c)', 'worst jump ×', 'jumps > 2×'].includes(k)).map(([k, v]) => `${k} ${v}`).join(' | ')}`);
  }
  const png = join(OUT, `${c.name}.png`);
  spectrogramPng(png, monos, { start: 0, dur: Math.min(c.dur, 12), fmax: 6000, win: 2048, hop: 360, height: 260, range: 70 });
  // (64 colours: a third of the size; skipped where Pillow is not installed)
  try {
    execFileSync('python3', ['-c', 'import sys\nfrom PIL import Image\nim = Image.open(sys.argv[1]).convert("RGB").quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)\nim.save(sys.argv[1], optimize=True)', png], { stdio: 'ignore' });
  } catch {
    /* as written */
  }
  index.push(row);
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1));
