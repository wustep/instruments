// Every bundled piece's loudness as the page plays it, and each part's place in it.
//
// The ensemble's pieces (orchestra/pieces.ts PIECES) and each instrument's own piece (DEMOS), whole,
// through the played path: the automatic expression and the ensemble timing (expression.ts express),
// the file's volume and expression as each part's output gain (CC7, CC11: a 20 ms glide), its swells
// and wheel to the engine, every note told ahead (foresee), each part from its seat with its own
// limiter told its share of the bus (ensemble.ts), the bus at 1/√Σwᵢ² (mix.ts) and the bus's own
// limiter after it (a Web Audio DynamicsCompressor at −2 dBFS, ratio 20, knee 0, 2 ms attack, 150 ms
// release, modelled here as Chromium runs it: its 6 ms look-ahead and its make-up gain). A demo is
// one instrument, every line on it, straight to the output (audio.ts: no bus, no bus limiter).
//
// Two steps, so that a level can be tried without rendering again:
//   npx tsx scripts/levels-pieces.ts render --tag before [--only haydn,demo:flute] [--jobs 8]
//     each part's sound (before any per-part trim) to .cache/levels-pieces/<tag>/<id>/<k>.f32
//   npx tsx scripts/levels-pieces.ts measure --tag before [--only …] [--json out.json] [--wav dir --from 60 --seconds 30]
//     the mix with the trims and piece gains the code sets now (or as the cache was rendered:
//     --as-rendered), and the numbers: integrated loudness (BS.1770-4, LUFS), the loudness range,
//     the sample peak, the bus limiter's work (its deepest cut, and how much of the time it takes
//     more than 1 dB), and each part: its own loudness as it reaches the bus, and its place in the mix
//     (the median, over the 400 ms blocks where the part is within 20 dB of its own loudest, of its
//     loudness less the mix's: how far under the whole it stands while it plays; and at its loudest, the
//     blocks within 6 dB of its own 95th percentile: a stroke, an entry).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderInstrument, type TimedEvent } from '../packages/engine/src/core/render.ts';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import { notesAhead, parseMidi, type MidiSong } from '../apps/web/src/midi-file.ts';
import { express, modLines, modValue, PartLevels, volumeRef } from '../apps/web/src/expression.ts';
import { CC_DYNAMICS, CC_REST, foresees, PLAYBACK_DB, type InstrumentId } from '../packages/engine/src/core/instrument.ts';
import { deskOf, placeNote, playersOf, playsNote, VOICE_INFO, type Plan } from '../apps/web/src/orchestra/assign.ts';
import * as P from '../apps/web/src/orchestra/pieces.ts';
import { busGain } from '../apps/web/src/orchestra/mix.ts';
import { soundSeats } from '../apps/web/src/orchestra/seats.ts';
import { kWeight } from './audio-measure.ts';

const FS = 48000;
const args = process.argv.slice(2);
const mode = args.shift();
const opt = (k: string, d: string) => {
  const i = args.indexOf(k);
  return i < 0 ? d : args[i + 1];
};
const flag = (k: string) => args.includes(k);
const TAG = opt('--tag', 'now');
const CACHE = join('.cache/levels-pieces', TAG);
const ONLY = opt('--only', '')
  .split(',')
  .filter(Boolean);

// (the per-part and per-piece trims, where the code has them: read loosely, so the harness runs on an
// engine from before they existed)
type Part = { voice: P.Piece['parts'][number]['voice']; lines: number[]; gain?: number };
type PieceX = P.Piece & { gain?: number; parts: Part[] };
type DemoX = P.Demo & { gain?: number };
const PIECES = P.PIECES as PieceX[];
const DEMOS = P.DEMOS as Record<InstrumentId, DemoX>;

const load = (f: string): MidiSong => {
  const b = readFileSync(join('apps/web/public/pieces', f));
  return parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
};

interface Job {
  id: string;
  kind: 'piece' | 'demo';
  song: MidiSong;
  plan: Plan;
  /** the bus gain (1 for a demo) and the piece's own gain on it */
  bus: number;
  pieceGain: number;
  /** each part's trim (linear) */
  trims: number[];
  instruments: InstrumentId[];
  presets: (string | undefined)[];
  players: number[];
  seats: (readonly number[])[] | null;
  maxVoices: (number | undefined)[];
}

const dbl = (db: number | undefined) => Math.pow(10, (db ?? 0) / 20);

function jobOf(id: string): Job {
  if (id.startsWith('demo:')) {
    const inst = id.slice(5) as InstrumentId;
    const d = DEMOS[inst];
    const song = P.demoSong(load(d.file), d);
    const plan: Plan = { parts: [{ voice: inst === 'piano' ? 'grand' : (inst as never), lines: song.lines.map((_, i) => i) }], lines: song.lines.map(() => [{ part: 0, shift: 0 }]) };
    return { id, kind: 'demo', song, plan, bus: 1, pieceGain: dbl(d.gain), trims: [1], instruments: [inst], presets: [inst === 'piano' ? 'grand' : undefined], players: [0], seats: null, maxVoices: [undefined] };
  }
  const p = PIECES.find((q) => q.id === id);
  if (!p) throw new Error(`no piece ${id}`);
  const song = P.pieceSong(load(p.file), p);
  // (seated whole, as the stage seats a piece of more than six: ensemble.ts)
  const plan = P.piecePlan(p, song.lines, Math.max(6, p.parts.length));
  const sounding = plan.parts.filter((q) => q.lines.length);
  const bus = busGain(sounding.map((q) => PLAYBACK_DB[VOICE_INFO[q.voice].instrument] ?? 0));
  const pianos = plan.parts.filter((q) => q.voice === 'grand' || q.voice === 'upright').length;
  // each plan part's trim (pieces.ts pieceTrims, as the stage sets it; none on an engine from before)
  const trims = (P as { pieceTrims?: (p: P.Piece, plan: Plan) => number[] }).pieceTrims?.(p, plan) ?? plan.parts.map(() => 1);
  return {
    id,
    kind: 'piece',
    song,
    plan,
    bus,
    pieceGain: dbl(p.gain),
    trims,
    instruments: plan.parts.map((q) => VOICE_INFO[q.voice].instrument),
    presets: plan.parts.map((q) => VOICE_INFO[q.voice].preset),
    players: playersOf(plan),
    seats: soundSeats(plan.parts.map((q) => VOICE_INFO[q.voice])),
    maxVoices: plan.parts.map((q) => (VOICE_INFO[q.voice].instrument === 'piano' ? (pianos > 1 ? 32 : 48) : undefined)),
  };
}

const allIds = () => [...PIECES.map((p) => p.id), ...Object.keys(DEMOS).map((k) => `demo:${k}`)];
const ids = () => (ONLY.length ? ONLY : allIds());

/** one part, rendered as the page plays it, its output gain (CC7/CC11) applied: no trim */
function renderPart(job: Job, k: number): { L: Float32Array; R: Float32Array; cpuMs: number } {
  const { song, plan } = job;
  const part = plan.parts[k];
  const inst = job.instruments[k];
  const x = express(song);
  const played = x.shaped || x.timed ? x.events : song.events;
  const ahead = notesAhead(played);
  const dur = song.duration + 4;
  const n = Math.ceil(dur * FS);
  const events: TimedEvent[] = [];
  const lv = new PartLevels(volumeRef(song), modLines(song));
  const gains: [number, number][] = [];
  const demo = job.kind === 'demo';
  for (const [i, e] of played.entries()) {
    if (e.line === undefined || !part.lines.includes(e.line)) continue;
    const time = e.t + 0.05;
    if (e.kind === 'cc' || e.kind === 'dyn') {
      if (!lv.take(e)) continue;
      const prev = lv.sent;
      const next = lv.next(part.lines);
      if (!next) continue;
      if (next.gain !== (prev?.gain ?? 1)) gains.push([time, next.gain]);
      if (inst !== 'piano') {
        if (next.mod !== (prev?.mod ?? null)) events.push({ time, event: { type: 'control', cc: 1, value: next.mod === null ? CC_REST : modValue(next.mod) } as never });
        if (next.dyn !== (prev?.dyn ?? 0)) events.push({ time, event: { type: 'control', cc: CC_DYNAMICS, value: next.dyn } as never });
      }
      continue;
    }
    if (!demo && (e.kind === 'on' || e.kind === 'off') && !playsNote(e, deskOf(plan, song.lines, e.line, k))) continue;
    const sh = demo ? 0 : (plan.lines[e.line].find((r) => r.part === k)?.shift ?? 0);
    const midi = demo ? (e as { midi: number }).midi : placeNote((e as { midi: number }).midi, sh, part.voice);
    if (e.kind === 'on') {
      if (ahead.len[i] > 0 && foresees(inst)) events.push({ time, event: { type: 'foresee', midi, velocity: e.vel, dur: ahead.len[i], dyn: ahead.dyn[i] } as never });
      events.push({ time, event: { type: 'noteOn', midi, velocity: e.vel } });
    } else if (e.kind === 'off') events.push({ time, event: { type: 'noteOff', midi } });
    else if (e.kind === 'pedal' && inst === 'piano') {
      if (e.cc === 64) events.push({ time, event: { type: 'sustain', value: e.value } });
    }
  }
  const r = renderInstrument({
    sampleRate: FS,
    instrument: inst,
    preset: job.presets[k],
    events,
    duration: dur,
    player: job.players[k],
    // (a part's trim, and a demo's gain, are the engine's own volume: before its limiter, as the page sets it)
    params: { ...(job.seats ? { seat: job.seats[k] } : {}), ...(demo ? (job.pieceGain !== 1 ? { volume: job.pieceGain } : {}) : job.trims[k] !== 1 ? { volume: job.trims[k] } : {}) } as never,
    bus: demo ? undefined : job.bus * job.pieceGain,
    maxVoices: job.maxVoices[k],
  });
  if (gains.length) {
    const kg = 1 - Math.exp(-1 / (0.02 * FS));
    let gi = 0;
    let target = 1;
    let cur = 1;
    for (let i = 0; i < n; i++) {
      while (gi < gains.length && gains[gi][0] * FS <= i) target = gains[gi++][1];
      cur += (target - cur) * kg;
      r.left[i] *= cur;
      r.right[i] *= cur;
    }
  }
  return { L: r.left.slice(0, n), R: r.right.slice(0, n), cpuMs: r.cpuMs };
}

const partFile = (id: string, k: number) => join(CACHE, id.replace(':', '-'), `${k}.f32`);
function savePart(id: string, k: number, L: Float32Array, R: Float32Array, meta: object): void {
  mkdirSync(join(CACHE, id.replace(':', '-')), { recursive: true });
  const buf = new Float32Array(L.length * 2);
  buf.set(L, 0);
  buf.set(R, L.length);
  writeFileSync(partFile(id, k), Buffer.from(buf.buffer));
  writeFileSync(partFile(id, k) + '.json', JSON.stringify(meta));
}
function readPart(id: string, k: number): { L: Float32Array; R: Float32Array; meta: { bus: number; pieceGain: number; trim?: number } } {
  const b = readFileSync(partFile(id, k));
  const all = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
  const n = all.length / 2;
  return { L: all.slice(0, n), R: all.slice(n), meta: JSON.parse(readFileSync(partFile(id, k) + '.json', 'utf8')) };
}

// ------------------------------------------------------------- the bus limiter
/** Web Audio's DynamicsCompressor as Chromium runs it (DynamicsCompressorKernel): a 6 ms look-ahead,
 *  the static curve (knee 0: the threshold, then 1/ratio), the attack and release on the gain, and
 *  its make-up gain ((1/fullRangeGain)^0.6, fullRangeGain the curve's gain at 0 dBFS). Returns the gain
 *  it applied (min) and how much of the time it cut more than 1 dB. */
function busLimiter(L: Float32Array, R: Float32Array, threshold = -2, ratio = 20, attack = 0.002, release = 0.15) {
  const thr = Math.pow(10, threshold / 20);
  const curve = (x: number) => (x <= thr ? x : thr * Math.pow(x / thr, 1 / ratio));
  const full = curve(1);
  const makeup = Math.pow(1 / full, 0.6);
  const look = Math.round(0.006 * FS);
  const ka = 1 - Math.exp(-1 / (attack * FS));
  const kr = 1 - Math.exp(-1 / (release * FS));
  const n = L.length;
  let g = 1;
  let minG = 1;
  let over1 = 0;
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = Math.min(n - 1, i + look);
    const x = Math.max(Math.abs(L[j]), Math.abs(R[j]));
    const want = x > thr ? curve(x) / x : 1;
    g += (want - g) * (want < g ? ka : kr);
    if (g < minG) minG = g;
    if (g < 0.891) over1++;
    outL[i] = L[i] * g * makeup;
    outR[i] = R[i] * g * makeup;
  }
  return { L: outL, R: outR, minDb: 20 * Math.log10(minG), over1: over1 / n, makeupDb: 20 * Math.log10(makeup) };
}

// ------------------------------------------------------------- loudness
/** the 400 ms blocks' mean square (K-weighted, both channels summed), every 100 ms */
function blocks(L: Float32Array, R: Float32Array): Float64Array {
  const kl = kWeight(L, FS);
  const kr = kWeight(R, FS);
  const blk = Math.round(0.4 * FS);
  const hop = Math.round(0.1 * FS);
  const out: number[] = [];
  for (let a = 0; a + blk <= kl.length; a += hop) {
    let s = 0;
    for (let i = a; i < a + blk; i++) s += kl[i] * kl[i] + kr[i] * kr[i];
    out.push(s / blk);
  }
  return Float64Array.from(out);
}
const ld = (p: number) => -0.691 + 10 * Math.log10(p + 1e-30);
function integrated(z: Float64Array): number {
  const abs = [...z].filter((p) => ld(p) > -70);
  if (!abs.length) return -Infinity;
  const rel = ld(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter((p) => ld(p) > rel);
  return ld(g.reduce((a, b) => a + b, 0) / g.length);
}
/** EBU loudness range: 3 s windows (here the 400 ms blocks' 3 s means), gated −70 and −20 relative,
 *  the 10th to the 95th percentile */
function lra(z: Float64Array): number {
  const w = 30;
  const st: number[] = [];
  for (let a = 0; a + w <= z.length; a += 10) {
    let s = 0;
    for (let i = a; i < a + w; i++) s += z[i];
    st.push(s / w);
  }
  const abs = st.filter((p) => ld(p) > -70);
  if (!abs.length) return 0;
  const rel = ld(abs.reduce((a, b) => a + b, 0) / abs.length) - 20;
  const g = abs
    .filter((p) => ld(p) > rel)
    .map(ld)
    .sort((a, b) => a - b);
  return g[Math.floor(0.95 * (g.length - 1))] - g[Math.floor(0.1 * (g.length - 1))];
}
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

// ------------------------------------------------------------- render
async function renderAll(): Promise<void> {
  const jobs = Number(opt('--jobs', '6'));
  const units: string[] = [];
  for (const id of ids()) {
    const j = jobOf(id);
    for (let k = 0; k < j.plan.parts.length; k++) if (j.plan.parts[k].lines.length && (flag('--force') || !existsSync(partFile(id, k)))) units.push(`${id}#${k}`);
  }
  // the longest first
  units.sort((a, b) => jobOf(b.split('#')[0]).song.duration - jobOf(a.split('#')[0]).song.duration);
  console.log(`${units.length} parts to render, ${jobs} at a time`);
  let next = 0;
  let done = 0;
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: jobs }, async () => {
      while (next < units.length) {
        const u = units[next++];
        await new Promise<void>((res, rej) => {
          const c = spawn('npx', ['tsx', 'scripts/levels-pieces.ts', 'part', '--tag', TAG, '--unit', u], { stdio: ['ignore', 'pipe', 'inherit'] });
          let out = '';
          c.stdout.on('data', (d) => (out += d));
          c.on('exit', (code) => (code ? rej(new Error(`${u}: exit ${code}`)) : res()));
          c.on('exit', () => console.log(`  [${++done}/${units.length}, ${((Date.now() - t0) / 1000).toFixed(0)} s] ${out.trim()}`));
        });
      }
    }),
  );
}
function renderUnit(u: string): void {
  const [id, ks] = u.split('#');
  const k = Number(ks);
  const job = jobOf(id);
  const r = renderPart(job, k);
  savePart(id, k, r.L, r.R, { bus: job.bus, pieceGain: job.pieceGain, trim: job.trims[k], voice: job.plan.parts[k].voice, seconds: job.song.duration });
  console.log(`${id} ${k} ${job.plan.parts[k].voice}: ${(r.cpuMs / 1000).toFixed(1)} s cpu, ${((r.cpuMs / 10) / job.song.duration).toFixed(1)} % of real time`);
}

// ------------------------------------------------------------- measure
interface PieceRow {
  id: string;
  /** the piece's own gain (pieces.ts `gain`), dB, as measured */
  gainDb: number;
  seconds: number;
  lufs: number;
  lra: number;
  peakDb: number;
  /** the mix's peak before the bus limiter */
  prePeakDb: number;
  busLimDb: number;
  busLimOver1: number;
  parts: { voice: string; lines: number[]; trimDb: number; lufs: number; inMixDb: number; loudDb: number; peakDb: number }[];
}
function measureOne(id: string): { row: PieceRow; L: Float32Array; R: Float32Array } {
  const job = jobOf(id);
  const asRendered = flag('--as-rendered');
  const parts: { k: number; L: Float32Array; R: Float32Array; g: number; trim: number }[] = [];
  let n = 0;
  for (let k = 0; k < job.plan.parts.length; k++) {
    if (!job.plan.parts[k].lines.length || !existsSync(partFile(id, k))) continue;
    const p = readPart(id, k);
    // the gain after the rendered part: a piece's bus (and its own gain on it); the change of a trim or
    // of a demo's gain since the render (they were the engine's volume: its limiter is left as rendered)
    let g: number;
    if (job.kind === 'demo') g = asRendered ? 1 : job.pieceGain / p.meta.pieceGain;
    else g = asRendered ? p.meta.bus * p.meta.pieceGain : job.bus * job.pieceGain * (job.trims[k] / (p.meta.trim ?? 1));
    parts.push({ k, L: p.L, R: p.R, g, trim: asRendered ? (p.meta.trim ?? 1) : job.trims[k] });
    n = Math.max(n, p.L.length);
  }
  if (!parts.length) throw new Error(`${id}: nothing rendered (render --tag ${TAG} first)`);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const stems: { k: number; z: Float64Array; peak: number; trim: number }[] = [];
  for (const p of parts) {
    const g = p.g;
    const sl = new Float32Array(n);
    const sr = new Float32Array(n);
    let pk = 0;
    for (let i = 0; i < p.L.length; i++) {
      sl[i] = p.L[i] * g;
      sr[i] = p.R[i] * g;
      L[i] += sl[i];
      R[i] += sr[i];
      pk = Math.max(pk, Math.abs(sl[i]), Math.abs(sr[i]));
    }
    stems.push({ k: p.k, z: blocks(sl, sr), peak: pk, trim: p.trim });
  }
  let pre = 0;
  for (let i = 0; i < n; i++) pre = Math.max(pre, Math.abs(L[i]), Math.abs(R[i]));
  const lim = job.kind === 'demo' ? { L, R, minDb: 0, over1: 0 } : busLimiter(L, R);
  let pk = 0;
  for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(lim.L[i]), Math.abs(lim.R[i]));
  const zm = blocks(lim.L, lim.R);
  const row: PieceRow = {
    id,
    gainDb: +(20 * Math.log10(job.pieceGain)).toFixed(2),
    seconds: +job.song.duration.toFixed(1),
    lufs: +integrated(zm).toFixed(2),
    lra: +lra(zm).toFixed(1),
    peakDb: +(20 * Math.log10(pk)).toFixed(2),
    prePeakDb: +(20 * Math.log10(pre)).toFixed(2),
    busLimDb: +lim.minDb.toFixed(2),
    busLimOver1: +lim.over1.toFixed(4),
    parts: stems.map((s) => {
      const top = Math.max(...[...s.z].map(ld));
      const d: number[] = [];
      for (let i = 0; i < s.z.length; i++) if (ld(s.z[i]) > top - 20 && ld(s.z[i]) > -70) d.push(ld(s.z[i]) - ld(zm[i]));
      // (at its loudest: the blocks within 6 dB of its own 95th percentile; a stroke, an entry)
      const act = [...s.z].map(ld).filter((v) => v > -70).sort((a, b) => a - b);
      const p95 = act[Math.floor(0.95 * (act.length - 1))] ?? -Infinity;
      const dl: number[] = [];
      for (let i = 0; i < s.z.length; i++) if (ld(s.z[i]) > p95 - 6) dl.push(ld(s.z[i]) - ld(zm[i]));
      return {
        voice: job.plan.parts[s.k].voice,
        lines: job.plan.parts[s.k].lines,
        trimDb: +(20 * Math.log10(s.trim)).toFixed(1),
        lufs: +integrated(s.z).toFixed(2),
        inMixDb: +median(d).toFixed(1),
        loudDb: +median(dl).toFixed(1),
        peakDb: +(20 * Math.log10(s.peak)).toFixed(2),
      };
    }),
  };
  return { row, L: lim.L, R: lim.R };
}

if (mode === 'render') await renderAll();
else if (mode === 'part') renderUnit(opt('--unit', ''));
else if (mode === 'measure') {
  const rows: PieceRow[] = [];
  const WAVDIR = opt('--wav', '');
  for (const id of ids()) {
    if (!existsSync(partFile(id, 0)) && !existsSync(join(CACHE, id.replace(':', '-')))) continue;
    const { row, L, R } = measureOne(id);
    rows.push(row);
    console.log(`${id.padEnd(22)} ${row.seconds.toFixed(0).padStart(4)} s  ${row.lufs.toFixed(1).padStart(6)} LUFS  LRA ${row.lra.toFixed(1).padStart(4)}  peak ${row.peakDb.toFixed(1).padStart(5)} dBFS (pre-bus ${row.prePeakDb.toFixed(1)})  bus limiter ${row.busLimDb.toFixed(1)} dB, ${(100 * row.busLimOver1).toFixed(2)} % over 1 dB`);
    if (row.parts.length > 1)
      for (const p of row.parts) console.log(`    ${p.voice.padEnd(9)} [${p.lines.join(',')}]`.padEnd(30) + `${p.lufs.toFixed(1).padStart(6)} LUFS  in mix ${p.inMixDb.toFixed(1).padStart(5)} dB (loudest ${p.loudDb.toFixed(1).padStart(5)})  peak ${p.peakDb.toFixed(1).padStart(6)}${p.trimDb ? `  trim ${p.trimDb > 0 ? '+' : ''}${p.trimDb} dB` : ''}`);
    if (WAVDIR) {
      mkdirSync(WAVDIR, { recursive: true });
      const from = Math.round(Number(opt('--from', '0')) * FS);
      const len = Math.round(Number(opt('--seconds', '30')) * FS);
      const name = join(WAVDIR, `${id.replace(':', '-')}-${TAG}`);
      writeFileSync(`${name}.wav`, encodeWav({ sampleRate: FS, channels: [L.slice(from, from + len), R.slice(from, from + len)] }));
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${name}.wav`, '-b:a', '192k', `${name}.mp3`]);
    }
  }
  const J = opt('--json', '');
  if (J) writeFileSync(J, JSON.stringify(rows, null, 1));
  const ens = rows.filter((r) => !r.id.startsWith('demo:'));
  const all = rows.map((r) => r.lufs);
  if (all.length > 1) {
    const mean = all.reduce((a, b) => a + b, 0) / all.length;
    console.log(`\nall ${rows.length}: mean ${mean.toFixed(1)} LUFS, ${Math.min(...all).toFixed(1)} … ${Math.max(...all).toFixed(1)} (spread ${(Math.max(...all) - Math.min(...all)).toFixed(1)} LU)`);
    if (ens.length) console.log(`ensemble ${ens.length}: ${Math.min(...ens.map((r) => r.lufs)).toFixed(1)} … ${Math.max(...ens.map((r) => r.lufs)).toFixed(1)}`);
  }
} else {
  console.error('usage: levels-pieces.ts render|measure --tag <tag> [--only ids] …');
  process.exit(1);
}
