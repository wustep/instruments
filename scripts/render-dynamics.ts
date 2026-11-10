// A MIDI file's dynamics before and after (PIECES-DYNAMICS), offline, as the browser plays it: one
// engine core per part (the plan of orchestra/assign.ts or a built-in piece's own, the bus gain and the
// seats of orchestra/ensemble.ts), each part's lines' volume, expression, mod wheel and swells through
// expression.ts PartLevels exactly as audio.ts sendLevel sends them (gain on the part's output, CC1 and
// CC_DYNAMICS to a bowed or wind engine). Three versions, at one gain so their levels compare:
//   before   as main played a file: notes and pedals only, through --before <engine> (an older checkout)
//   written  the file's own dynamics (CC7, CC11, CC1): automatic expression off
//   auto     with automatic expression (the default)
// Prints, per version: the note velocities' spread per line, and the mix's short-term level (400 ms
// RMS, every 100 ms, while it sounds): its spread (1σ), its 10–90 % range, its slow part (2 s means)
// and, when the file moves CC7/CC11, how the level follows them (correlation with the file's own
// volume × expression in dB). Writes MP3s, a level chart and a stacked spectrogram (before, auto).
//   npx tsx scripts/render-dynamics.ts --before <old>/packages/engine/src/core/index.ts \
//     --out artifacts/realistic-3d/final-next5/pieces-dynamics [--start 150] [--seconds 60] \
//     [--name daylight] [--piece haydn] [--cc-fixture out.mid] [--set phrase=0,swell=0] [file.mid]
// --cc-fixture writes the constructed file with dynamics of its own (CC7, CC11 hairpins, CC1, shaped
// velocities) and renders it.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CC_DYNAMICS, CC_REST } from '../packages/engine/src/core/instrument.ts';
import type { TimedEvent } from '../packages/engine/src/core/render.ts';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import { parseMidi, type FileEvent, type MidiSong } from '../apps/web/src/midi-file.ts';
import { express, modLines, modValue, PartLevels, PHRASING, volumeRef, type PartLevel } from '../apps/web/src/expression.ts';
import { autoPlan, placeNote, VOICE_INFO, type Plan } from '../apps/web/src/orchestra/assign.ts';
import { PIECES, piecePlan } from '../apps/web/src/orchestra/pieces.ts';
import { busGain } from '../apps/web/src/orchestra/mix.ts';
import { soundSeats } from '../apps/web/src/orchestra/seats.ts';
import { spectrogramPng } from './spectrogram.ts';

const args = process.argv.slice(2);
const opt = (k: string, d = '') => {
  const i = args.indexOf(k);
  if (i < 0) return d;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const BEFORE = opt('--before');
const OUT = opt('--out', 'artifacts/realistic-3d/final-next5/pieces-dynamics');
const START = Number(opt('--start', '0'));
const SECONDS = Number(opt('--seconds', '60'));
const PIECE = opt('--piece');
const FIXTURE = opt('--cc-fixture');
let NAME = opt('--name');
// --set phrase=0,swell=0: try the phrasing's sizes (expression.ts PHRASING) without editing them
for (const kv of opt('--set').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (!(k in PHRASING)) throw new Error(`no PHRASING.${k}`);
  (PHRASING as Record<string, number>)[k] = Number(v);
}
const FS = 48000;
const AUDIO = join(OUT, 'audio');
mkdirSync(AUDIO, { recursive: true });

type Render = (o: { sampleRate: number; instrument: string; preset?: string; events: TimedEvent[]; duration: number; player?: number; params?: Record<string, unknown>; maxVoices?: number }) => { left: Float32Array; right: Float32Array };
const after: Render = (await import('../packages/engine/src/core/render.ts')).renderInstrument as unknown as Render;
const before: Render = BEFORE ? (await import(pathToFileURL(resolve(BEFORE)).href)).renderInstrument : after;

// ------------------------------------------------------------- the constructed file with its own dynamics
/** a Standard MIDI File (format 1) from tracks of [delta, ...bytes] */
function smf(ppq: number, tracks: number[][][]): Uint8Array {
  const vlq = (n: number) => {
    const o = [n & 0x7f];
    while ((n >>= 7)) o.unshift((n & 0x7f) | 0x80);
    return o;
  };
  const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const body = [...'MThd'].map((c) => c.charCodeAt(0)).concat(u32(6), [0, 1, 0, tracks.length, ppq >> 8, ppq & 255]);
  for (const t of tracks) {
    const data: number[] = [];
    for (const [d, ...b] of t) data.push(...vlq(d), ...b);
    data.push(0, 0xff, 0x2f, 0);
    body.push(...[...'MTrk'].map((c) => c.charCodeAt(0)), ...u32(data.length), ...data);
  }
  return Uint8Array.from(body);
}
/** A string trio, eight bars of slow chords (♩ = 60, 4/4), each part on its own channel, with dynamics
 *  of its own: volume set per part, an expression hairpin over every two bars (CC11 70 → 120 → 70,
 *  every 1/8 beat), the violin's mod wheel rising and falling, and velocities that follow the hairpins. */
function ccFixture(): Uint8Array {
  const Q = 480;
  const chords = [
    [74, 65, 50], [76, 67, 48], [77, 69, 53], [76, 67, 48],
    [72, 64, 45], [74, 65, 50], [71, 62, 43], [72, 64, 48],
  ];
  const conductor = [[0, 0xff, 0x51, 3, 0x0f, 0x42, 0x40], [0, 0xff, 0x58, 4, 4, 2, 24, 8]];
  const name = (s: string) => [0xff, 0x03, s.length, ...[...s].map((c) => c.charCodeAt(0))];
  const tracks = [conductor];
  ['Violin', 'Viola', 'Cello'].forEach((nm, k) => {
    const ch = k;
    const ev: [number, number[]][] = [];
    ev.push([0, name(nm)], [0, [0xc0 | ch, [40, 41, 42][k]]], [0, [0xb0 | ch, 7, [110, 96, 104][k]]]);
    const bar = 4 * Q;
    for (let b = 0; b < chords.length; b++) {
      const vel = [70, 88, 98, 78, 66, 84, 94, 72][b] - 4 * k;
      ev.push([b * bar, [0x90 | ch, chords[b][k], vel]], [(b + 1) * bar - 20, [0x80 | ch, chords[b][k], 0]]);
    }
    // the hairpins: two bars each, every eighth of a beat
    for (let t = 0; t <= chords.length * bar; t += Q / 8) {
      const u = (t % (2 * bar)) / (2 * bar);
      ev.push([t, [0xb0 | ch, 11, Math.round(70 + 50 * Math.sin(Math.PI * u))]]);
      if (k === 0) ev.push([t, [0xb0 | ch, 1, Math.round(20 + 90 * Math.sin(Math.PI * Math.min(1, t / (chords.length * bar))))]]);
    }
    ev.sort((a, b) => a[0] - b[0]);
    let last = 0;
    tracks.push(ev.map(([t, b]) => {
      const d = t - last;
      last = t;
      return [d, ...b];
    }));
  });
  return smf(Q, tracks);
}

// ------------------------------------------------------------- playing it
const toBuf = (b: Buffer | Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
let song: MidiSong;
let plan: Plan;
if (FIXTURE) {
  const bytes = ccFixture();
  writeFileSync(FIXTURE, bytes);
  song = parseMidi(toBuf(bytes));
  NAME ||= 'cc-trio';
} else if (PIECE) {
  const pc = PIECES.find((p) => p.id === PIECE)!;
  song = parseMidi(toBuf(readFileSync(join('apps/web/public/pieces', pc.file))));
  NAME ||= PIECE;
} else {
  const f = args[0];
  song = parseMidi(toBuf(readFileSync(f)));
  NAME ||= f.split('/').pop()!.replace(/\.midi?$/i, '');
}
plan = PIECE ? piecePlan(PIECES.find((p) => p.id === PIECE)!, song.lines, 6) : autoPlan(song.lines, { cap: 6 });
const ensemble = plan.parts.length > 1;
const seats = ensemble ? soundSeats(plan.parts.map((p) => VOICE_INFO[p.voice])) : null;
const bus = ensemble ? busGain(plan.parts.filter((p) => p.lines.length).length) : 1;
const a = Math.max(0, START - 8);
const b = Math.min(song.duration + 2, START + SECONDS);
const dur = b - a;
const n = Math.ceil(dur * FS);
console.log(`${NAME}: ${plan.parts.map((p) => `${p.voice}[${p.lines.join(',')}]`).join(' ')}  excerpt ${START}–${b.toFixed(0)} s (rendered from ${a} s)`);

/** one version's events, rendered and mixed (stereo), with the parts' gains as the browser glides them */
function play(tag: 'before' | 'written' | 'auto'): { L: Float32Array; R: Float32Array; events: FileEvent[] } {
  const all = tag === 'auto' ? express(song).events : tag === 'written' ? song.events : song.events.filter((e) => e.kind === 'on' || e.kind === 'off' || e.kind === 'pedal');
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const ref = volumeRef(song);
  const wheels = modLines(song);
  plan.parts.forEach((part, k) => {
    const info = VOICE_INFO[part.voice];
    const keys = info.instrument === 'piano';
    const lv = new PartLevels(ref, wheels);
    const events: TimedEvent[] = [];
    const gains: [number, number][] = [];
    const level = (prev: PartLevel | null, next: PartLevel, time: number) => {
      if (next.gain !== (prev?.gain ?? 1)) gains.push([time, next.gain]);
      if (keys) return;
      if (next.mod !== (prev?.mod ?? null)) events.push({ time, event: { type: 'control', cc: 1, value: next.mod === null ? CC_REST : modValue(next.mod) } });
      if (next.dyn !== (prev?.dyn ?? 0)) events.push({ time, event: { type: 'control', cc: CC_DYNAMICS, value: next.dyn } });
    };
    const take = (e: FileEvent, time: number) => {
      if (!lv.take(e)) return;
      const prev = lv.sent;
      const next = lv.next(part.lines);
      if (next) level(prev, next, time);
    };
    // the controllers as they stand where the render begins (the player chases them the same way)
    for (const e of PartLevels.chase(all, a)) if (e.line !== undefined && part.lines.includes(e.line)) take(e, 0);
    for (const e of all) {
      if (e.t < a || e.t > b - 1 || e.line === undefined || !part.lines.includes(e.line)) continue;
      const time = e.t - a + 0.05;
      const sh = plan.lines[e.line].find((r) => r.part === k)?.shift ?? 0;
      if (e.kind === 'on') events.push({ time, event: { type: 'noteOn', midi: placeNote(e.midi, sh, part.voice), velocity: e.vel } });
      else if (e.kind === 'off') events.push({ time, event: { type: 'noteOff', midi: placeNote(e.midi, sh, part.voice) } });
      else if (e.kind === 'pedal') {
        if (keys) events.push({ time, event: { type: e.cc === 64 ? 'sustain' : e.cc === 66 ? 'sostenuto' : 'soft', value: e.value } as TimedEvent['event'] });
      } else take(e, time);
    }
    const render = tag === 'before' ? before : after;
    const r = render({ sampleRate: FS, instrument: info.instrument, preset: info.preset, events, duration: dur, player: 0, params: seats ? { seat: seats[k] } : undefined, maxVoices: keys ? (plan.parts.filter((q) => VOICE_INFO[q.voice].instrument === 'piano').length > 1 ? 32 : 48) : undefined });
    // the output gain: setTargetAtTime(g, t, 20 ms) from each change on
    let g = 1;
    let target = 1;
    let gi = 0;
    const kg = 1 - Math.exp(-1 / (0.02 * FS));
    for (let i = 0; i < n; i++) {
      while (gi < gains.length && gains[gi][0] * FS <= i) target = gains[gi++][1];
      g += (target - g) * kg;
      L[i] += bus * g * r.left[i];
      R[i] += bus * g * r.right[i];
    }
  });
  return { L, R, events: all };
}

// ------------------------------------------------------------- numbers
const db = (x: number) => 20 * Math.log10(Math.max(1e-9, x));
const cut = (x: Float32Array) => x.subarray(Math.round((START - a) * FS));
/** short-term level (dB): 400 ms RMS every 100 ms */
function levels(L: Float32Array, R: Float32Array): number[] {
  const w = Math.round(0.4 * FS);
  const hop = Math.round(0.1 * FS);
  const out: number[] = [];
  for (let i = 0; i + w <= L.length; i += hop) {
    let s = 0;
    for (let j = i; j < i + w; j++) s += L[j] * L[j] + R[j] * R[j];
    out.push(db(Math.sqrt(s / (2 * w))));
  }
  return out;
}
const pct = (xs: number[], p: number) => [...xs].sort((u, v) => u - v)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const sd = (xs: number[]) => {
  const m = xs.reduce((u, v) => u + v, 0) / xs.length;
  return Math.sqrt(xs.reduce((u, v) => u + (v - m) ** 2, 0) / xs.length);
};
/** the file's own volume × expression (dB, the loudest line's), every 100 ms over the excerpt */
function written(events: FileEvent[], count: number): number[] {
  const ref = volumeRef(song);
  const lv = new PartLevels(ref, new Set());
  const all = song.lines.map((_, i) => i);
  const out: number[] = [];
  let k = 0;
  const cc = events.filter((e) => e.kind === 'cc');
  for (let i = 0; i < count; i++) {
    const t = START + i * 0.1 + 0.2;
    while (k < cc.length && cc[k].t <= t) lv.take(cc[k++]);
    out.push(db(lv.level(all).gain));
  }
  return out;
}
const corr = (x: number[], y: number[]) => {
  const m = Math.min(x.length, y.length);
  const mx = x.slice(0, m).reduce((u, v) => u + v, 0) / m;
  const my = y.slice(0, m).reduce((u, v) => u + v, 0) / m;
  let xy = 0;
  let xx = 0;
  let yy = 0;
  for (let i = 0; i < m; i++) {
    xy += (x[i] - mx) * (y[i] - my);
    xx += (x[i] - mx) ** 2;
    yy += (y[i] - my) ** 2;
  }
  return xx && yy ? xy / Math.sqrt(xx * yy) : 0;
};

const rows: Record<string, unknown>[] = [];
const traces: Record<string, number[]> = {};
const wavs: Record<string, string> = {};
for (const tag of ['before', 'written', 'auto'] as const) {
  const { L, R, events } = play(tag);
  const l = cut(L);
  const r = cut(R);
  const lev = levels(l, r);
  const on = lev.filter((v) => v > Math.max(...lev) - 40);
  // slow: means over 2 s
  const slow: number[] = [];
  for (let i = 0; i + 20 <= lev.length; i += 20) slow.push(lev.slice(i, i + 20).reduce((u, v) => u + v, 0) / 20);
  const own = written(song.events, lev.length);
  const follows = sd(own) > 0.5 ? +corr(own, lev).toFixed(2) : null;
  const vels = song.lines.map((_, li) => {
    const v = events.filter((e) => e.kind === 'on' && e.line === li && e.t >= START && e.t <= b).map((e) => (e as { vel: number }).vel);
    return v.length ? +sd(v).toFixed(1) : null;
  });
  let pk = 0;
  for (let i = 0; i < l.length; i++) pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i]));
  const row = { version: tag, velocitySd: vels, levelSdDb: +sd(on).toFixed(2), level10to90Db: +(pct(on, 0.9) - pct(on, 0.1)).toFixed(1), slowSdDb: +sd(slow).toFixed(2), meanDb: +(on.reduce((u, v) => u + v, 0) / on.length).toFixed(1), peakDb: +db(pk).toFixed(1), followsFileCC: follows, dynEvents: events.filter((e) => e.kind === 'dyn').length };
  rows.push(row);
  traces[tag] = lev;
  console.log(' ', JSON.stringify(row));
  const wav = join(AUDIO, `${NAME}-${tag}.wav`);
  writeFileSync(wav, encodeWav({ sampleRate: FS, channels: [l, r] }));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-b:a', '160k', join(AUDIO, `${NAME}-${tag}.mp3`)]);
  wavs[tag] = wav;
}
// does the phrasing go with the music's own rise and fall (the level as written, 2 s means), or against
// it? (the correlation of what it adds with what was there: negative fights, positive leans in)
{
  const slow = (x: number[]) => {
    const o: number[] = [];
    for (let i = 0; i + 20 <= x.length; i += 10) o.push(x.slice(i, i + 20).reduce((u, v) => u + v, 0) / 20);
    return o;
  };
  const w = slow(traces.written);
  const add = slow(traces.auto).map((v, i) => v - w[i]);
  const r = sd(add) > 0.05 ? +corr(add, w).toFixed(2) : null;
  (rows[2] as Record<string, unknown>).withTheMusic = r;
  console.log(`  auto − written against written (2 s means): r = ${r}`);
}
writeFileSync(join(OUT, `${NAME}.json`), JSON.stringify({ file: NAME, excerpt: [START, +b.toFixed(2)], parts: plan.parts.map((p) => p.voice), versions: rows }, null, 1));

// ------------------------------------------------------------- pictures
// the level over time: before (grey), as written (blue), automatic expression (amber)
{
  const W = 1200;
  const H = 360;
  const pad = { l: 48, r: 12, t: 12, b: 28 };
  const img = new Uint8Array(W * H * 3).fill(250);
  const put = (x: number, y: number, c: number[]) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (Math.round(y) * W + Math.round(x)) * 3;
    img[i] = c[0];
    img[i + 1] = c[1];
    img[i + 2] = c[2];
  };
  const all = Object.values(traces).flat().filter(Number.isFinite);
  const top = Math.ceil(Math.max(...all) / 6) * 6;
  const bottom = top - 36;
  const X = (i: number, len: number) => pad.l + (i / Math.max(1, len - 1)) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + ((top - Math.max(bottom, Math.min(top, v))) / (top - bottom)) * (H - pad.t - pad.b);
  // grid: every 6 dB, every 10 s
  for (let v = bottom; v <= top; v += 6) for (let x = pad.l; x < W - pad.r; x++) put(x, Y(v), [226, 224, 218]);
  const len = traces.before.length;
  for (let s = 0; s <= (len - 1) / 10; s += 10) for (let y = pad.t; y < H - pad.b; y++) put(X(s * 10, len), y, [226, 224, 218]);
  const colours: Record<string, number[]> = { before: [150, 148, 142], written: [70, 110, 190], auto: [214, 120, 30] };
  for (const [tag, tr] of Object.entries(traces)) {
    const c = colours[tag];
    for (let i = 1; i < tr.length; i++) {
      const x0 = X(i - 1, tr.length);
      const x1 = X(i, tr.length);
      const y0 = Y(tr[i - 1]);
      const y1 = Y(tr[i]);
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
      for (let s = 0; s <= steps; s++) {
        const x = x0 + ((x1 - x0) * s) / steps;
        const y = y0 + ((y1 - y0) * s) / steps;
        put(x, y, c);
        put(x, y + 1, c);
      }
    }
  }
  const ppm = Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), Buffer.from(img)]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-c:v', 'ppm', '-i', '-', join(OUT, `${NAME}-level.png`)], { input: ppm });
  console.log(`  level chart: ${top - 36}…${top} dB, grid 6 dB × 10 s; grey before, blue as written, amber automatic`);
}
{
  const { decodeWav } = await import('../packages/engine/src/analysis/index.ts');
  const mono = (f: string) => {
    const w = decodeWav(readFileSync(f));
    const d = new Float32Array(w.channels[0].length);
    for (let i = 0; i < d.length; i++) d[i] = 0.5 * (w.channels[0][i] + w.channels[1][i]);
    return { data: d, fs: w.sampleRate };
  };
  spectrogramPng(join(OUT, `${NAME}-spectrogram.jpg`), [mono(wavs.before), mono(wavs.auto)], { start: 0, dur: Math.min(SECONDS, b - START), fmax: 6000, win: 4096, hop: 1536, range: 70, height: 260 });
}
for (const f of Object.values(wavs)) rmSync(f);
