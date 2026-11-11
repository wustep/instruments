// Orchestra mode, offline: each built-in piece (or a MIDI file) through one engine core per part, as
// the browser plays it (the plan's routes, octave moves, players and the bus gain of
// orchestra/ensemble.ts), mixed. Prints each part's and the mix's peak and RMS, and how alike two parts
// of one voice on one line are (their correlation); writes MP3s.
//   npx tsx scripts/render-orchestra.ts [--seconds 40] [--out artifacts/realistic-3d/final-orchestra/audio] [--cap 6] [--solo violin] [--piece handel] [--parts "trumpet:0;trumpet:0;grand:1,2;grand:1,2"] [--name x] [--one-player] [--wav] [file.mid ...]
// --solo <instrument>: every line on that one instrument, as a dropped file played before orchestra mode
// --parts: a routing by hand (voice:lines; …) over the piece's (or file's) lines, as the routing grid sets it
// --one-player: every part player 0 (two of a voice on one line as one instrument twice: the comparison)
// --wav: keep the WAV next to the MP3 (for scripts/spectrogram.ts)
// --flat: every part from the single instrument's place (no seats: the mix as it was before seating)
// --json: also write <name>.json, each part's numbers (for scripts/stage-chart.mjs)
// --undivided: a wind staff two players share sent whole to each (as before they divided it: a chord asked
// of one wind; the comparison)
// --start <s>: from this time of the piece (at its tempo), to --seconds after it
// --post-bus: each part's own limiter blind to the bus gain after it (as before audio audit 2; ensemble.ts
//   tells every part its share, the engine's Limiter.bus: a part's limiter works on the level the bus hears)
// A built-in piece of more than six instruments is seated whole (as the stage seats it: ensemble.ts).
// Each part's place in the picture is printed: its level difference between the channels (L − R, dB)
// and the time lag between them (positive: the right channel later, the part on the left).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderInstrument, type TimedEvent } from '../packages/engine/src/core/render.ts';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import { parseMidi } from '../apps/web/src/midi-file.ts';
import { autoPlan, deskOf, placeNote, planOf, playersOf, playsNote, shiftsOf, VOICE_INFO, VOICES, type Plan, type Voice } from '../apps/web/src/orchestra/assign.ts';
import { PIECES, piecePlan, pieceSong } from '../apps/web/src/orchestra/pieces.ts';
import { busGain } from '../apps/web/src/orchestra/mix.ts';
import { PLAYBACK_DB } from '../packages/engine/src/core/instrument.ts';
import { soundSeats } from '../apps/web/src/orchestra/seats.ts';
import { Limiter } from '../packages/engine/src/core/post.ts';

// each part's own limiter, metered: its deepest cut and how much of the time it works
const limStats = new WeakMap<Limiter, { minG: number; on: number; all: number }>();
const limProcess = Limiter.prototype.process;
Limiter.prototype.process = function (L: Float64Array, R: Float64Array, len: number) {
  limProcess.call(this, L, R, len);
  const st = limStats.get(this) ?? limStats.set(this, { minG: 1, on: 0, all: 0 }).get(this)!;
  st.all++;
  if (this.reduction < 0.999) st.on++;
  st.minG = Math.min(st.minG, this.reduction);
};

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
const FLAT = args.includes('--flat') ? (args.splice(args.indexOf('--flat'), 1), true) : false;
const JSON_OUT = args.includes('--json') ? (args.splice(args.indexOf('--json'), 1), true) : false;
const UNDIVIDED = args.includes('--undivided') ? (args.splice(args.indexOf('--undivided'), 1), true) : false;
const START = Number(opt('--start', '0'));
const POST_BUS = args.includes('--post-bus') ? (args.splice(args.indexOf('--post-bus'), 1), true) : false;
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
let jobs: { name: string; buf: Buffer; plan: (l: Parameters<typeof autoPlan>[0]) => Plan; piece?: (typeof PIECES)[number] }[] = args.length
  ? args.map((f) => ({ name: f.split('/').pop()!.replace(/\.midi?$/i, ''), buf: readFileSync(f), plan: (l) => autoPlan(l, { cap: CAP }) }))
  : PIECES.map((p) => ({ name: p.id, buf: readFileSync(join('apps/web/public/pieces', p.file)), plan: (l) => piecePlan(p, l, Math.max(CAP, p.parts.length > 6 ? p.parts.length : 0)), piece: p }));
if (PIECE) jobs = jobs.filter((j) => j.name === PIECE);
if (PARTS) jobs = jobs.map((j) => ({ ...j, name: NAME || `${j.name}-routed`, plan: (l) => handPlan(l, j.plan(l)) }));

const db = (x: number) => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1);
/** a stereo signal's place: the channels' level difference (dB) and the lag (ms, ±2) that best lines
 *  them up (their cross-correlation's peak; positive: the right channel later) */
function image(l: Float32Array, r: Float32Array): { ild: number; lag: number } {
  let el = 0;
  let er = 0;
  for (let i = 0; i < l.length; i++) {
    el += l[i] * l[i];
    er += r[i] * r[i];
  }
  const M = Math.round(0.002 * FS);
  let best = 0;
  let bestV = -Infinity;
  // (every 4th sample: enough for the peak's place)
  for (let k = -M; k <= M; k++) {
    let v = 0;
    for (let i = Math.max(0, -k); i < l.length - Math.max(0, k); i += 4) v += l[i] * r[i + k];
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return { ild: 10 * Math.log10((el + 1e-30) / (er + 1e-30)), lag: (best / FS) * 1000 };
}
for (const job of jobs) {
  const song = pieceSong(parseMidi(job.buf.buffer.slice(job.buf.byteOffset, job.buf.byteOffset + job.buf.byteLength) as ArrayBuffer), job.piece ?? null);
  const plan: Plan = SOLO ? { parts: [{ voice: SOLO, lines: song.lines.map((_, i) => i) }], lines: song.lines.map(() => [{ part: 0, shift: 0 }]) } : job.plan(song.lines);
  const players = ONE ? plan.parts.map(() => 0) : playersOf(plan);
  const dur = Math.min(SECONDS, song.duration - START + 2);
  const n = Math.ceil(dur * FS);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const g = SOLO ? 1 : busGain(plan.parts.filter((p) => p.lines.length).map((p) => PLAYBACK_DB[VOICE_INFO[p.voice].instrument] ?? 0));
  console.log(`\n${job.name}: ${plan.parts.map((p, k) => `${p.voice}${players[k] ? `(player ${players[k]})` : ''}[${p.lines.join(',')}]`).join(' ')}  bus ×${g.toFixed(3)}`);
  let cpu = 0;
  const outs: Float32Array[] = [];
  const seats = SOLO || FLAT ? null : soundSeats(plan.parts.map((p) => VOICE_INFO[p.voice]));
  const rows: { voice: string; lines: number[]; seat: number[] | null; peakDb: number; rmsDb: number; ildDb: number; lagMs: number; limiterDb: number; limiterFrac: number }[] = [];
  // the bus gain after every part; its limiter told of it (as ensemble.ts does), or not (--post-bus)
  const post = SOLO ? 1 : g;
  for (const [k, part] of plan.parts.entries()) {
    const info = VOICE_INFO[part.voice];
    const events: TimedEvent[] = [];
    /** notes this part is sent at one moment (a wind asked for a chord: more than one) */
    const at = new Map<number, number>();
    for (const e of song.events) {
      if (e.t < START || e.t - START > dur - 1 || e.line === undefined || !part.lines.includes(e.line)) continue;
      // (a wind of a pair on one staff plays its own voice: orchestra/ensemble.ts schedule)
      if ((e.kind === 'on' || e.kind === 'off') && !SOLO && !UNDIVIDED && !playsNote(e, deskOf(plan, song.lines, e.line, k))) continue;
      const sh = plan.lines[e.line].find((r) => r.part === k)?.shift ?? 0;
      const time = e.t - START + 0.05;
      if (e.kind === 'on') {
        events.push({ time, event: { type: 'noteOn', midi: placeNote(e.midi, sh, part.voice), velocity: e.vel } });
        at.set(e.t, (at.get(e.t) ?? 0) + 1);
      } else if (e.kind === 'off') events.push({ time, event: { type: 'noteOff', midi: placeNote(e.midi, sh, part.voice) } });
      else if (e.kind === 'pedal' && e.cc === 64 && (SOLO || part.voice === 'grand' || part.voice === 'upright')) events.push({ time, event: { type: 'sustain', value: e.value } });
    }
    const notes = [...at.values()].reduce((a, b) => a + b, 0);
    const chords = [...at.values()].filter((n) => n > 1).length;
    const r = renderInstrument({ sampleRate: FS, instrument: info.instrument, preset: info.preset, events, duration: dur, player: players[k], params: seats ? { seat: seats[k] } : undefined, bus: SOLO || POST_BUS ? undefined : g, maxVoices: info.instrument === 'piano' ? (plan.parts.filter((q) => q.voice === 'grand' || q.voice === 'upright').length > 1 ? 32 : 48) : undefined });
    cpu += r.cpuMs;
    outs.push(r.left);
    let pk = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      pk = Math.max(pk, Math.abs(r.left[i]), Math.abs(r.right[i]));
      s2 += r.left[i] * r.left[i];
      L[i] += post * r.left[i];
      R[i] += post * r.right[i];
    }
    const im = image(r.left, r.right);
    const ls = limStats.get((r.core as unknown as { limiter: Limiter }).limiter) ?? { minG: 1, on: 0, all: 1 };
    // (a part's own level: as it reaches the bus)
    pk *= post;
    s2 *= post * post;
    rows.push({ voice: part.voice, lines: part.lines, seat: seats ? [...seats[k]] : null, peakDb: +db(pk), rmsDb: +db(Math.sqrt(s2 / n)), ildDb: +im.ild.toFixed(2), lagMs: +im.lag.toFixed(3), limiterDb: +db(ls.minG), limiterFrac: +(ls.on / ls.all).toFixed(4) });
    console.log(`  ${part.voice.padEnd(8)} peak ${db(pk)} dBFS  rms ${db(Math.sqrt(s2 / n))} dBFS  own limiter ${db(ls.minG)} dB (${((100 * ls.on) / ls.all).toFixed(1)} %)  L−R ${im.ild.toFixed(1).padStart(5)} dB  lag ${im.lag.toFixed(2).padStart(5)} ms${seats ? `  seat ${seats[k].map((v) => v.toFixed(2)).join(', ')}` : ''}  ${notes} notes${VOICE_INFO[part.voice].poly === 1 ? `, ${chords} chords` : ''}  (${(r.cpuMs / dur / 10).toFixed(1)} % of real time)`);
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
  const name = POST_BUS ? `${job.name}-post-bus` : SOLO ? `${job.name}-before-one-${SOLO}` : ONE ? `${job.name}-one-player` : FLAT ? `${job.name}-flat` : UNDIVIDED ? `${job.name}-undivided` : job.name;
  if (JSON_OUT) writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ piece: job.name, seconds: dur, flat: FLAT, bus: g, parts: rows, mix: { peakDb: +db(pk), rmsDb: +db(Math.sqrt(s2 / n)) } }, null, 1));
  const wav = join(OUT, `${name}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [L, R] }));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '160k', join(OUT, `${name}.mp3`)]);
  if (!WAV) execFileSync('rm', [wav]);
}
