// Orchestra mode, offline: each built-in piece (or a MIDI file) through one engine core per part, as
// the browser plays it (the plan's routes, octave moves, players and the bus gain of
// orchestra/ensemble.ts), mixed. Prints each part's and the mix's peak and RMS, and how alike two parts
// of one voice on one line are (their correlation); writes MP3s.
//   npx tsx scripts/render-orchestra.ts [--seconds 40] [--out artifacts/realistic-3d/final-orchestra/audio] [--cap 6] [--solo violin] [--piece handel] [--parts "trumpet:0;trumpet:0;grand:1,2;grand:1,2"] [--name x] [--one-player] [--wav] [file.mid ...]
// --solo <instrument>: every line on that one instrument, as a dropped file played before orchestra mode
// --parts: a routing by hand (voice:lines; …) over the piece's (or file's) lines, as the routing grid sets it
// --one-player: every part player 0 (two of a voice on one line as one instrument twice: the comparison)
// --wav: keep the WAV next to the MP3 (for scripts/spectrogram.ts)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderInstrument, type TimedEvent } from '../packages/engine/src/core/render.ts';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import { parseMidi } from '../apps/web/src/midi-file.ts';
import { autoPlan, placeNote, planOf, playersOf, shiftsOf, VOICE_INFO, VOICES, type Plan, type Voice } from '../apps/web/src/orchestra/assign.ts';
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
const PIECE = opt('--piece', '');
const PARTS = opt('--parts', '');
const NAME = opt('--name', '');
const ONE = args.includes('--one-player') ? (args.splice(args.indexOf('--one-player'), 1), true) : false;
const WAV = args.includes('--wav') ? (args.splice(args.indexOf('--wav'), 1), true) : false;
const FS = 48000;
mkdirSync(OUT, { recursive: true });

/** a routing by hand: "voice:0,1;voice:2" (the piece's own octave moves kept, as the grid keeps them) */
const handPlan = (l: Parameters<typeof autoPlan>[0], base: Plan): Plan =>
  planOf(
    PARTS.split(';').map((q) => {
      const [v, ls] = q.split(':');
      if (!VOICES.includes(v as Voice)) throw new Error(`no voice ${v}`);
      return { voice: v as Voice, lines: (ls ?? '').split(',').filter(Boolean).map(Number) };
    }),
    l,
    shiftsOf(base),
  );
let jobs: { name: string; buf: Buffer; plan: (l: Parameters<typeof autoPlan>[0]) => Plan }[] = args.length
  ? args.map((f) => ({ name: f.split('/').pop()!.replace(/\.midi?$/i, ''), buf: readFileSync(f), plan: (l) => autoPlan(l, { cap: CAP }) }))
  : PIECES.map((p) => ({ name: p.id, buf: readFileSync(join('apps/web/public/pieces', p.file)), plan: (l) => piecePlan(p, l, CAP) }));
if (PIECE) jobs = jobs.filter((j) => j.name === PIECE);
if (PARTS) jobs = jobs.map((j) => ({ ...j, name: NAME || `${j.name}-routed`, plan: (l) => handPlan(l, j.plan(l)) }));

const db = (x: number) => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1);
for (const job of jobs) {
  const song = parseMidi(job.buf.buffer.slice(job.buf.byteOffset, job.buf.byteOffset + job.buf.byteLength) as ArrayBuffer);
  const plan: Plan = SOLO ? { parts: [{ voice: SOLO, lines: song.lines.map((_, i) => i) }], lines: song.lines.map(() => [{ part: 0, shift: 0 }]) } : job.plan(song.lines);
  const players = ONE ? plan.parts.map(() => 0) : playersOf(plan);
  const dur = Math.min(SECONDS, song.duration + 2);
  const n = Math.ceil(dur * FS);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const g = SOLO ? 1 : busGain(plan.parts.filter((p) => p.lines.length).length);
  console.log(`\n${job.name}: ${plan.parts.map((p, k) => `${p.voice}${players[k] ? `(player ${players[k]})` : ''}[${p.lines.join(',')}]`).join(' ')}  bus ×${g.toFixed(3)}`);
  let cpu = 0;
  const outs: Float32Array[] = [];
  for (const [k, part] of plan.parts.entries()) {
    const info = VOICE_INFO[part.voice];
    const events: TimedEvent[] = [];
    for (const e of song.events) {
      if (e.t > dur - 1 || e.line === undefined || !part.lines.includes(e.line)) continue;
      const sh = plan.lines[e.line].find((r) => r.part === k)?.shift ?? 0;
      if (e.kind === 'on') events.push({ time: e.t + 0.05, event: { type: 'noteOn', midi: placeNote(e.midi, sh, part.voice), velocity: e.vel } });
      else if (e.kind === 'off') events.push({ time: e.t + 0.05, event: { type: 'noteOff', midi: placeNote(e.midi, sh, part.voice) } });
      else if (e.cc === 64 && (SOLO || part.voice === 'grand' || part.voice === 'upright')) events.push({ time: e.t + 0.05, event: { type: 'sustain', value: e.value } });
    }
    const r = renderInstrument({ sampleRate: FS, instrument: info.instrument, preset: info.preset, events, duration: dur, player: players[k], maxVoices: info.instrument === 'piano' ? (plan.parts.filter((q) => q.voice === 'grand' || q.voice === 'upright').length > 1 ? 32 : 48) : undefined });
    cpu += r.cpuMs;
    outs.push(r.left);
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
  // two of a voice on one line: how alike they sound (1: one instrument twice; two players less)
  for (let a = 0; a < plan.parts.length; a++)
    for (let b = a + 1; b < plan.parts.length; b++) {
      const pa = plan.parts[a];
      const pb = plan.parts[b];
      if (pa.voice !== pb.voice || !pa.lines.some((i) => pb.lines.includes(i))) continue;
      let xy = 0;
      let xx = 0;
      let yy = 0;
      for (let i = 0; i < n; i++) {
        xy += outs[a][i] * outs[b][i];
        xx += outs[a][i] * outs[a][i];
        yy += outs[b][i] * outs[b][i];
      }
      console.log(`  ${pa.voice} ${a} and ${b} on one line: correlation ${(xy / Math.sqrt(xx * yy + 1e-30)).toFixed(3)}`);
    }
  let pk = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    s2 += L[i] * L[i];
  }
  console.log(`  mix      peak ${db(pk)} dBFS  rms ${db(Math.sqrt(s2 / n))} dBFS  (all parts ${(cpu / dur / 10).toFixed(1)} % of real time)`);
  const name = SOLO ? `${job.name}-before-one-${SOLO}` : ONE ? `${job.name}-one-player` : job.name;
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '160k', join(OUT, `${name}.mp3`)]);
  if (!WAV) execFileSync('rm', [wav]);
}
