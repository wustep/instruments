// Orchestra mode, offline: each built-in piece (or a MIDI file) through one engine core per part, as
// the browser plays it (the plan's lines, octave moves and the bus gain of orchestra/ensemble.ts),
// mixed. Prints each part's and the mix's peak and RMS; writes MP3s.
//   npx tsx scripts/render-orchestra.ts [--seconds 40] [--out artifacts/realistic-3d/final-orchestra/audio] [--cap 6] [--solo violin] [file.mid ...]
// --solo <instrument>: every line on that one instrument, as a dropped file played before orchestra mode
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderInstrument, type TimedEvent } from '../packages/engine/src/core/render.ts';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import { parseMidi } from '../apps/web/src/midi-file.ts';
import { autoPlan, placeNote, VOICE_INFO, type Plan } from '../apps/web/src/orchestra/assign.ts';
import { PIECES, piecePlan } from '../apps/web/src/orchestra/pieces.ts';
import { busGain } from '../apps/web/src/orchestra/mix.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => {
  const i = args.indexOf(k);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const SECONDS = Number(opt('--seconds', '40'));
const OUT = opt('--out', 'artifacts/realistic-3d/final-orchestra/audio');
const CAP = Number(opt('--cap', '6'));
const SOLO = opt('--solo', '') as '' | 'violin' | 'viola' | 'cello' | 'flute' | 'trumpet' | 'grand';
const FS = 48000;
mkdirSync(OUT, { recursive: true });

const jobs: { name: string; buf: Buffer; plan: (l: Parameters<typeof autoPlan>[0]) => Plan }[] = args.length
  ? args.map((f) => ({ name: f.split('/').pop()!.replace(/\.midi?$/i, ''), buf: readFileSync(f), plan: (l) => autoPlan(l, { cap: CAP }) }))
  : PIECES.map((p) => ({ name: p.id, buf: readFileSync(join('apps/web/public/pieces', p.file)), plan: (l) => piecePlan(p, l, CAP) }));

const db = (x: number) => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1);
for (const job of jobs) {
  const song = parseMidi(job.buf.buffer.slice(job.buf.byteOffset, job.buf.byteOffset + job.buf.byteLength) as ArrayBuffer);
  const plan: Plan = SOLO ? { parts: [{ voice: SOLO, lines: song.lines.map((_, i) => i) }], lines: song.lines.map(() => ({ part: 0, shift: 0 })) } : job.plan(song.lines);
  const dur = Math.min(SECONDS, song.duration + 2);
  const n = Math.ceil(dur * FS);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const g = SOLO ? 1 : busGain(plan.parts.length);
  console.log(`\n${job.name}: ${plan.parts.map((p) => `${p.voice}[${p.lines.join(',')}]`).join(' ')}  bus ×${g.toFixed(3)}`);
  let cpu = 0;
  for (const part of plan.parts) {
    const info = VOICE_INFO[part.voice];
    const events: TimedEvent[] = [];
    for (const e of song.events) {
      if (e.t > dur - 1 || e.line === undefined || !part.lines.includes(e.line)) continue;
      const sh = plan.lines[e.line].shift;
      if (e.kind === 'on') events.push({ time: e.t + 0.05, event: { type: 'noteOn', midi: placeNote(e.midi, sh, part.voice), velocity: e.vel } });
      else if (e.kind === 'off') events.push({ time: e.t + 0.05, event: { type: 'noteOff', midi: placeNote(e.midi, sh, part.voice) } });
      else if (e.cc === 64 && (SOLO || part.voice === 'grand' || part.voice === 'upright')) events.push({ time: e.t + 0.05, event: { type: 'sustain', value: e.value } });
    }
    const r = renderInstrument({ sampleRate: FS, instrument: info.instrument, preset: info.preset, events, duration: dur });
    cpu += r.cpuMs;
    let pk = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      pk = Math.max(pk, Math.abs(r.left[i]), Math.abs(r.right[i]));
      s2 += r.left[i] * r.left[i];
      L[i] += g * r.left[i];
      R[i] += g * r.right[i];
    }
    console.log(`  ${part.voice.padEnd(8)} peak ${db(pk)} dBFS  rms ${db(Math.sqrt(s2 / n))} dBFS  (${(r.cpuMs / dur / 10).toFixed(1)} % of real time)`);
  }
  let pk = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    s2 += L[i] * L[i];
  }
  console.log(`  mix      peak ${db(pk)} dBFS  rms ${db(Math.sqrt(s2 / n))} dBFS  (all parts ${(cpu / dur / 10).toFixed(1)} % of real time)`);
  const name = SOLO ? `${job.name}-before-one-${SOLO}` : job.name;
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '160k', join(OUT, `${name}.mp3`)]);
  execFileSync('rm', [wav]);
}
