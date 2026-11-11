// Audio audit 3, the strings: before/after clips, rendered by an earlier checkout's engine (--before) and
// by this one, as played (the room on), each with a stacked spectrogram (before over after, 0–6 kHz) and
// its own numbers printed.
//   npx tsx scripts/render-audio-audit-3-strings.ts --before <repo>/packages/engine/src/core/index.ts
//       [--out artifacts/round3/audio-audit-3/strings] [--only name,…]
// MP3 (128 kb/s) and PNG go to --out, the numbers to <out>/clips.json. A clip the two engines render the
// same, sample for sample, is written once (-before).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { encodeWav } from '../packages/engine/src/analysis/index.ts';
import { lufs } from './audio-measure.ts';
import { spectrogramPng } from './spectrogram.ts';
import { engine, et, filed, name, readNote, stringParts, type Ev } from './strings-lib.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const OUT = resolve(opt('--out', join(import.meta.dirname, '..', 'artifacts', 'round3', 'audio-audit-3', 'strings')));
const ONLY = opt('--only', '').split(',').filter(Boolean);
const FS = 48000;
mkdirSync(OUT, { recursive: true });
const engs = { before: (await engine(opt('--before', ''))) as any, after: (await engine()) as any };

interface Clip {
  name: string;
  what: string;
  instrument: string;
  events: Ev[];
  /** rendered from 0 to `to`, heard from `from` */
  from: number;
  to: number;
  player?: number;
  measure?: (x: Float32Array, dry: Float32Array) => string;
}
const clips: Clip[] = [];
const rmsDb = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  for (let i = Math.round(a * FS); i < Math.round(b * FS); i++) s += x[i] * x[i];
  return 10 * Math.log10(Math.max(1e-24, s / Math.round((b - a) * FS)));
};

{
  // 1. the violin's loud C5 and D5 in a file (the bow planned): after the note a fifth above, 55 ms between
  // them (as in Toward Morning's quarters), then each alone after a rest
  const ev: Ev[] = [];
  const at: [number, number][] = [];
  let t = 0.2;
  for (const [a, b] of [[79, 72], [81, 74]] as const) {
    ev.push(...filed(t, a, 104, 0.33), ...filed(t + 0.385, b, 108, 0.33));
    at.push([t + 0.385, b]);
    t += 1.6;
    ev.push(...filed(t, b, 108, 0.33));
    at.push([t, b]);
    t += 1.2;
  }
  clips.push({
    name: 'violin-c5-d5',
    what: 'the violin in a file: G5 then C5, C5 alone, A5 then D5, D5 alone (quarters of 0.33 s, v104–108)',
    instrument: 'violin',
    events: ev,
    from: 0,
    to: t + 0.3,
    measure: (_x, dry) => at.map(([s, m], i) => `${name(m)} ${i & 1 ? 'alone' : 'after the fifth above'}: the octave below’s harmonics ${readNote(dry, FS, s, s + 0.33, et(m)).subDb.toFixed(1)} dB re the note’s`).join('; '),
  });
}
{
  // 2. a real violin passage: the Haydn quartet's first violin, where its C5s after G5 read an octave low
  const p = stringParts(['violin'], ['haydn'])[0];
  clips.push({ name: 'violin-haydn', what: 'Haydn, Op. 76 No. 3 II, first violin, 164–176 s as the browser plays it', instrument: 'violin', events: p.events.filter((e) => e.time < 176.5), from: 164, to: 176.5, player: p.player });
}
{
  // 3. the viola's scale through A♯4: F♯4–D5, mf then ff, each note 0.6 s
  const ev: Ev[] = [];
  const at: [number, number, number][] = [];
  let t = 0.2;
  for (const vel of [70, 112])
    for (let m = 66; m <= 74; m++) {
      ev.push(...filed(t, m, vel, 0.6));
      at.push([t, m, vel]);
      t += 0.66;
    }
  clips.push({
    name: 'viola-scale',
    what: 'the viola in a file: F♯4 to D5 by semitones, 0.6 s each, mf (v70) then ff (v112)',
    instrument: 'viola',
    events: ev,
    from: 0,
    to: t + 0.5,
    measure: (_x, dry) =>
      [70, 112]
        .map((vel) => {
          const lv = new Map(at.filter((q) => q[2] === vel).map(([s, m]) => [m, rmsDb(dry, s + 0.3, s + 0.6)]));
          return `v${vel}: ${[...lv].map(([m, v]) => `${name(m)} ${v.toFixed(1)}`).join(' ')} dB; A♯4 over A4 and B4 ${(lv.get(70)! - (lv.get(69)! + lv.get(71)!) / 2).toFixed(1)} dB, G4 over F♯4 and A♭4 ${(lv.get(67)! - (lv.get(66)! + lv.get(68)!) / 2).toFixed(1)} dB`;
        })
        .join('; '),
  });
}
{
  // 4. a real viola passage: the Haydn quartet's viola
  const p = stringParts(['viola'], ['haydn'])[0];
  clips.push({ name: 'viola-haydn', what: 'Haydn, Op. 76 No. 3 II, viola, 60–72 s as the browser plays it', instrument: 'viola', events: p.events.filter((e) => e.time < 72.5), from: 60, to: 72.5, player: p.player });
}

const report: Record<string, unknown>[] = [];
for (const c of clips) {
  if (ONLY.length && !ONLY.includes(c.name)) continue;
  const got: Record<string, { L: Float32Array; R: Float32Array; x: Float32Array; note: string }> = {};
  for (const k of ['before', 'after'] as const) {
    const r = engs[k].renderInstrument({ sampleRate: FS, instrument: c.instrument, events: c.events, duration: c.to, player: c.player });
    const d = c.measure ? engs[k].renderInstrument({ sampleRate: FS, instrument: c.instrument, events: c.events, duration: c.to, player: c.player, dry: true }) : null;
    const a = Math.round(c.from * FS);
    const L = r.left.subarray(a) as Float32Array;
    const R = r.right.subarray(a) as Float32Array;
    const x = Float32Array.from(L, (v, i) => 0.5 * (v + R[i]));
    const dry = d ? Float32Array.from(d.left as Float32Array, (v: number, i: number) => 0.5 * (v + d.right[i])) : x;
    let peak = 0;
    for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    got[k] = { L, R, x, note: `${lufs(L, R, FS).toFixed(1)} LUFS, peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS${c.measure ? `; ${c.measure(x, dry)}` : ''}` };
  }
  let same = true;
  for (let i = 0; i < got.before.L.length && same; i++) if (got.before.L[i] !== got.after.L[i] || got.before.R[i] !== got.after.R[i]) same = false;
  for (const k of same ? (['before'] as const) : (['before', 'after'] as const)) {
    const wav = join(OUT, `${c.name}-${k}.wav`);
    writeFileSync(wav, Buffer.from(encodeWav({ channels: [got[k].L, got[k].R], sampleRate: FS } as never)));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '128k', join(OUT, `${c.name}-${k}.mp3`)]);
    rmSync(wav);
  }
  spectrogramPng(join(OUT, `${c.name}.png`), (same ? [got.before] : [got.before, got.after]).map((g) => ({ data: g.x, fs: FS })), { start: 0, dur: c.to - c.from, fmax: 6000, win: 2048, hop: Math.max(64, Math.round(((c.to - c.from) * FS) / 800)), height: 180 });
  console.log(`${c.name}: ${c.what}\n  before: ${got.before.note}\n  after:  ${same ? 'the same, sample for sample' : got.after.note}`);
  report.push({ name: c.name, what: c.what, before: got.before.note, after: same ? 'identical' : got.after.note });
}
writeFileSync(join(OUT, 'clips.json'), JSON.stringify(report, null, 1) + '\n');
