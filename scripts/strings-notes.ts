// Every note of a file's line on a bowed instrument, read one by one (dry, played as the file player
// sends it: told ahead, then begun and ended): is it on its pitch, is it there at all, how soon has it
// spoken? A player's bowing must cost no note.
//   npx tsx scripts/strings-notes.ts --file <mid> [--line 0] --instrument violin [--from 0 --to 30]
//     [--engine <core/index.ts>] [--human 0] [--hand] [--wav out.wav] [--list]
// Prints: notes; off pitch (over 35 ¢ from the note, or no pitch found); the median and the 90th centile
// of |cents|; level: the median note's and the softest tenth's (dB under the loudest note); spoken: the
// median and the 90th centile of the time a note takes to come within 6 dB of its own level (ms).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type * as Engine from '../packages/engine/src/core/index.ts';
import { parseMidi } from '../apps/web/src/midi-file.ts';
import { placeNote } from '../apps/web/src/orchestra/assign.ts';

const arg = (k: string, d = ''): string => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : (process.argv[i + 1] ?? '');
};
const has = (k: string) => process.argv.includes(`--${k}`);
const { BowedCore } = (await import(arg('engine') ? resolve(arg('engine')) : '../packages/engine/src/core/index.ts')) as typeof Engine;
const FS = 48000;
const inst = arg('instrument', 'violin') as Engine.BowedId;
const from = Number(arg('from', '0'));
const to = Number(arg('to', '30'));
const lineArg = arg('line', 'all');
const buf = readFileSync(arg('file'));
const song = parseMidi(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
const ev = song.events.filter((e) => (e.kind === 'on' || e.kind === 'off') && (lineArg === 'all' || e.line === Number(lineArg)) && e.t >= from && e.t < to);
const T0 = 0.2;
interface Note {
  t: number;
  dur: number;
  midi: number;
  vel: number;
}
const notes: Note[] = [];
const open = new Map<number, Note[]>();
const core = new BowedCore({ sampleRate: FS, instrument: inst, dry: true, params: { vibrato: 0, ...(arg('human') ? { human: Number(arg('human')) } : {}) } });
const sched: { f: number; ev: object }[] = [];
for (const e of ev) {
  if (e.kind !== 'on' && e.kind !== 'off') continue;
  const m = placeNote(e.midi, 0, inst);
  const f = Math.round((T0 + e.t - from) * FS);
  if (e.kind === 'on') {
    const n = { t: T0 + e.t - from, dur: to - e.t, midi: m, vel: e.vel };
    notes.push(n);
    open.set(m, [...(open.get(m) ?? []), n]);
    sched.push({ f, ev: { type: 'noteOn', midi: m, velocity: e.vel } });
  } else {
    const n = open.get(m)?.shift();
    if (n) n.dur = T0 + e.t - from - n.t;
    sched.push({ f, ev: { type: 'noteOff', midi: m } });
  }
}
for (const n of notes) if (!has('hand')) core.schedule({ type: 'foresee', midi: n.midi, velocity: n.vel, dur: n.dur }, Math.round(n.t * FS));
for (const q of sched) core.schedule(q.ev, q.f);
const N = Math.round((T0 + to - from + 0.5) * FS);
const x = new Float32Array(N);
{
  const L = new Float32Array(128);
  const R = new Float32Array(128);
  for (let i = 0; i + 128 <= N; i += 128) {
    core.process(L, R, 128);
    x.set(L, i);
  }
}
if (arg('wav')) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + N * 2, 4);
  h.write('WAVEfmt ', 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(FS, 24);
  h.writeUInt32LE(FS * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(N * 2, 40);
  let pk = 0;
  for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(x[i]));
  const d = Buffer.alloc(N * 2);
  for (let i = 0; i < N; i++) d.writeInt16LE(Math.round((x[i] / (pk || 1)) * 0.8 * 32767), i * 2);
  writeFileSync(arg('wav'), Buffer.concat([h, d]));
}
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);
const rms = (a: number, b: number) => {
  let s = 0;
  for (let i = Math.max(0, a); i < Math.min(N, b); i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));
/** cents from f over [a, a + w): the autocorrelation's best lag within a quarter tone either side, and
 *  how strong it is against the signal (0…1) */
function pitch(a: number, w: number, f: number): { cents: number; clear: number } {
  const lo = Math.floor(FS / (f * 1.03));
  const hi = Math.ceil(FS / (f * 0.97));
  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i < w; i++) s += x[a + i] * x[a + i + lag];
    return s;
  };
  let best = -Infinity;
  let bl = lo;
  for (let lag = lo; lag <= hi; lag++) {
    const v = ac(lag);
    if (v > best) {
      best = v;
      bl = lag;
    }
  }
  const p = ac(bl - 1);
  const q = ac(bl);
  const r = ac(bl + 1);
  const den = p - 2 * q + r;
  const lag = bl + (den !== 0 ? (0.5 * (p - r)) / den : 0);
  return { cents: 1200 * Math.log2(FS / lag / f), clear: best / (ac(0) || 1) };
}
const res: { n: Note; cents: number; clear: number; level: number; spoke: number }[] = [];
for (const n of notes) {
  const a = Math.round(n.t * FS);
  const len = Math.round(Math.min(n.dur, 1.5) * FS);
  // the note's own part: from 35 % of it (30 ms at least) to its end
  const s0 = a + Math.max(Math.round(0.03 * FS), Math.round(0.35 * len));
  const w = Math.max(Math.round(0.02 * FS), a + len - s0 - Math.ceil(FS / (et(n.midi) * 0.97)) - 2);
  const pt = w > 0 && s0 + w < N ? pitch(s0, w, et(n.midi)) : { cents: NaN, clear: 0 };
  const level = rms(s0, a + len);
  let spoke = n.dur;
  const W = Math.round(0.008 * FS);
  for (let k = a; k < a + len; k += W >> 1)
    if (db(rms(k, k + W)) >= db(level) - 6) {
      spoke = (k - a) / FS;
      break;
    }
  res.push({ n, ...pt, level, spoke });
}
const q = (v: number[], p: number) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(p * v.length))];
const top = Math.max(...res.map((r) => r.level));
const off = res.filter((r) => !(Math.abs(r.cents) <= 35) || r.clear < 0.5);
const cents = res.filter((r) => r.cents === r.cents).map((r) => Math.abs(r.cents));
if (has('list')) for (const r of res) console.log(`${r.n.t.toFixed(2).padStart(7)} s ${String(r.n.midi).padStart(3)} ${r.n.dur.toFixed(2)} s vel ${String(r.n.vel).padStart(3)}  ${r.cents.toFixed(0).padStart(4)} ¢ clear ${r.clear.toFixed(2)}  ${(db(r.level) - db(top)).toFixed(1).padStart(6)} dB  spoke ${(r.spoke * 1000).toFixed(0).padStart(4)} ms${!(Math.abs(r.cents) <= 35) || r.clear < 0.5 ? '  <<' : ''}`);
console.log(
  `${arg('file').split('/').pop()} line ${lineArg} on the ${inst}${has('hand') ? ' (by hand)' : ''}: ${res.length} notes · off pitch ${off.length} · |¢| median ${q(cents, 0.5).toFixed(1)} p90 ${q(cents, 0.9).toFixed(1)} · level median ${(db(q(res.map((r) => r.level), 0.5)) - db(top)).toFixed(1)} softest tenth ${(db(q(res.map((r) => r.level), 0.1)) - db(top)).toFixed(1)} dB · spoken median ${(q(res.map((r) => r.spoke), 0.5) * 1000).toFixed(0)} p90 ${(q(res.map((r) => r.spoke), 0.9) * 1000).toFixed(0)} ms · strokes ${core.plan.strokes} of which changes inside ${core.plan.changes}`,
);
