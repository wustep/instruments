// Seeds as it sounds, note by note: every note of every player in a stretch rendered as the page plays it
// (scripts/render-orchestra.ts --piece seeds --played --stems --wav --out <dir>), read in the player's own
// stem. A soft, long note must still be there, on its pitch, and speak in a player's time.
//   npx tsx scripts/seeds-check.ts --dir <dir> [--notes] [--name seeds]
// A blown or bowed note (1.2 s and longer): whether it is heard at its pitch (its fundamental there, not
// the octave under it, not only its harmonics), cents from it, its level over its middle (dB, K-weighted),
// and how long it takes to come within 12 dB of that (ms: it begins under a swell). A struck or plucked
// one: its level over its first 0.4 s.
// Prints each player's notes by pitch (how many, the median of each number), and what is out of line:
//   OFF   heard at another note            FLAT/SHARP  over 25 cents from its pitch
//   LATE  over 600 ms to speak             ODD   6 dB or more from the player's median level
// --notes: every note.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeSustained, decodeWav, envelopeDb } from '../packages/engine/src/analysis/index.ts';
import { kWeight } from './audio-measure.ts';

const arg = (k: string, d = ''): string => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : (process.argv[i + 1] ?? '');
};
const DIR = arg('dir');
const NAME = arg('name', 'seeds');
const ALL = process.argv.includes('--notes');
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const nm = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
const med = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[v.length >> 1] : NaN);
const RING = new Set(['harp', 'grand', 'upright', 'glockenspiel', 'timpani']);

const meta = JSON.parse(readFileSync(join(DIR, `${NAME}-stems.json`), 'utf8')) as { seconds: number; parts: { file: string; voice: string; notes: { t: number; midi: number; vel: number; len: number }[] }[] };
let bad = 0;
for (const part of meta.parts) {
  const a = decodeWav(new Uint8Array(readFileSync(join(DIR, `${part.file}.wav`))));
  const fs = a.sampleRate;
  const x = new Float32Array(a.channels[0].length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (a.channels[0][i] + (a.channels[1] ?? a.channels[0])[i]);
  // (levels as the ear weighs them: K-weighted, BS.1770)
  const kw = kWeight(x, fs);
  const env = envelopeDb(kw, fs, 0.01);
  const ring = RING.has(part.voice);
  const rows: { t: number; midi: number; vel: number; len: number; heard: number; cents: number; db: number; speak: number }[] = [];
  for (const n of part.notes) {
    if (n.t + Math.max(n.len, 0.5) > meta.seconds - 0.5 || !n.len) continue;
    if (ring) {
      let p = -200;
      for (let k = Math.round(n.t / 0.01); k < Math.round((n.t + 0.4) / 0.01) && k < env.length; k++) p = Math.max(p, env[k]);
      rows.push({ ...n, heard: n.midi, cents: 0, db: p, speak: 0 });
      continue;
    }
    if (n.len < 1.2) continue;
    const seg = { start: Math.round((n.t + 0.3 * n.len) * fs), end: Math.round((n.t + 0.85 * n.len) * fs) };
    // its pitch: the level at the note's own fundamental against the octave under it and against its own
    // strongest harmonic (a reed's odd harmonics fool a detector that looks for the best comb)
    const s = analyzeSustained(x, fs, seg, n.midi);
    const under = analyzeSustained(x, fs, seg, n.midi - 12);
    const low = under.harmAbs[0] > s.harmAbs[0] - 12 && under.harmAbs[2] > s.harmAbs[0] - 12;
    const high = s.harm[0] < -30;
    const heard = low ? n.midi - 12 : high ? n.midi + (s.harm[1] > s.harm[2] ? 12 : 19) : n.midi;
    let level = 0;
    let c = 0;
    for (let k = Math.round((n.t + 0.3 * n.len) / 0.01); k < Math.round((n.t + 0.85 * n.len) / 0.01) && k < env.length; k++, c++) level += Math.pow(10, env[k] / 10);
    const dB = 10 * Math.log10(level / Math.max(1, c) + 1e-30);
    let speak = n.len * 1000;
    for (let k = Math.round(n.t / 0.01); k < Math.round((n.t + n.len) / 0.01) && k < env.length; k++)
      if (env[k] >= dB - 12) {
        speak = (k * 0.01 - n.t) * 1000;
        break;
      }
    rows.push({ ...n, heard, cents: s.cents, db: dB, speak: Math.max(0, speak) });
  }
  const level = med(rows.map((r) => r.db));
  console.log(`\n${part.voice}: ${rows.length} notes, median level ${level.toFixed(1)} dB${ring ? ' (the stroke)' : `, to speak ${med(rows.map((r) => r.speak)).toFixed(0)} ms`}`);
  const flag = (r: (typeof rows)[number]) => {
    const f: string[] = [];
    if (r.heard !== r.midi) f.push(`OFF (heard ${nm(r.heard)})`);
    else if (Math.abs(r.cents) > 25) f.push(r.cents < 0 ? 'FLAT' : 'SHARP');
    if (r.speak > 600) f.push('LATE');
    if (Math.abs(r.db - level) >= 6) f.push('ODD');
    return f;
  };
  const by = new Map<number, typeof rows>();
  for (const r of rows) by.set(r.midi, [...(by.get(r.midi) ?? []), r]);
  for (const [m, rs] of [...by].sort((a, b) => a[0] - b[0])) {
    const flags = new Map<string, number>();
    for (const r of rs) for (const f of flag(r)) flags.set(f, (flags.get(f) ?? 0) + 1);
    bad += [...flags.values()].reduce((a, b) => a + b, 0);
    console.log(
      `  ${nm(m).padEnd(4)} ×${String(rs.length).padStart(2)}  v${Math.min(...rs.map((r) => r.vel))}–${Math.max(...rs.map((r) => r.vel))}  ${med(rs.map((r) => r.db)).toFixed(1).padStart(6)} dB${ring ? '' : `  ${med(rs.map((r) => r.cents)).toFixed(0).padStart(4)} ¢  speaks ${med(rs.map((r) => r.speak)).toFixed(0).padStart(4)} ms`}  ${[...flags].map(([f, c]) => `${f} ×${c}`).join(', ')}`,
    );
    if (ALL) for (const r of rs) console.log(`        ${r.t.toFixed(2).padStart(7)} s  v${r.vel}  ${r.len.toFixed(1)} s  ${r.db.toFixed(1)} dB${ring ? '' : `  ${r.cents.toFixed(0)} ¢  ${r.speak.toFixed(0)} ms`}  ${flag(r).join(', ')}`);
  }
}
console.log(`\n${bad} out of line`);
