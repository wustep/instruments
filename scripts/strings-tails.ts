// What rings on after a bowed note, against the Iowa recordings (audio audit 3): how long a note's sound
// takes to fall from 10 dB to 30 dB under its held level once it has ended (10 ms envelope; the first
// moment under each), in the recording and in the model holding the same note (2.6 s, dry, 44.1 kHz, the
// recording's vibrato or none). The notes are told apart by what can ring with them: those whose
// fundamental is a partial of another, open string (within 15 cents: that string sounds in sympathy and
// goes on when the bow has left), and the rest.
//   npx tsx scripts/strings-tails.ts violin [--engine <repo>/packages/engine/src/core/index.ts]
//       [--idle 1,0.5,0.3,0.2] [--dyn mf,ff] [--list]
// --idle: the model again with its idle open strings coupled to the bridge by each of these ratios
// (design.idleCoupling), to find the one whose tails are the recordings'. Printed: the median fall time
// of each group, recording and model, and the model's median distance from the recording (log2).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeWav, identifyNote, segmentNotes } from '../packages/engine/src/analysis/index.ts';
import { DYN_VEL } from './calibrate-ensemble.ts';
import { ENS_CACHE, REF_FILES, referenceNotes, type Dyn } from './ensemble-refs.ts';
import { engine, et, name } from './strings-lib.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const inst = args.find((a) => ['violin', 'viola', 'cello', 'bass'].includes(a)) ?? 'violin';
const dyns = opt('--dyn', 'mf,ff').split(',') as Dyn[];
const idles = opt('--idle', '').split(',').filter(Boolean).map(Number);
const FS = 44100;
const HOLD = 2.6;

const eng = (await engine(opt('--engine', ''))) as unknown as {
  renderInstrument: (o: Record<string, unknown>) => { left: Float32Array; right: Float32Array };
  BOWED: Record<string, { strings: { open: number }[]; idleCoupling?: number }>;
};
const opens = eng.BOWED[inst].strings.map((s) => s.open);
/** the open string (not the one stopped for it: the highest that reaches) a note's fundamental rings */
const partner = (m: number): boolean => {
  const own = [...opens].reverse().find((o) => m >= o);
  for (const o of opens) {
    if (o === own && m !== o) continue;
    if (m === o) continue;
    for (let k = 1; k <= 6; k++) if (Math.abs(1200 * Math.log2(et(m) / (k * et(o)))) < 15) return true;
  }
  return false;
};

/** seconds from the moment the sound first falls 10 dB under the held level (the bow has left) to the moment
 *  it is first 30 dB under it, after the note's middle (NaN: it never falls so far before `lim`) */
function fall(x: ArrayLike<number>, fs: number, a: number, end: number, lim: number): number {
  const hop = Math.round(0.005 * fs);
  const env: number[] = [];
  for (let i = a; i + 2 * hop <= lim; i += hop) {
    let e = 0;
    for (let j = i; j < i + 2 * hop; j++) e += x[j] * x[j];
    env.push(10 * Math.log10(e / (2 * hop) + 1e-20));
  }
  const n1 = Math.floor((end - a) / hop);
  const held = [...env.slice(Math.floor(0.25 * n1), Math.floor(0.75 * n1))].sort((p, q) => p - q);
  const ref = held[held.length >> 1];
  let t10 = -1;
  for (let i = Math.floor(0.6 * n1); i < env.length; i++) {
    if (t10 < 0 && env[i] < ref - 10) t10 = i;
    if (t10 >= 0 && env[i] < ref - 30) return Math.max(0.005, (i - t10) * 0.005);
  }
  return NaN;
}

const refs = (await referenceNotes()).filter((r) => r.instrument === inst && dyns.includes(r.dyn));
// the recordings' tails
const rec = new Map<string, number>();
for (const f of REF_FILES.filter((q) => q.instrument === inst && dyns.includes(q.dyn))) {
  const w = decodeWav(readFileSync(join(ENS_CACHE, 'wav', f.file.replace(/\.aiff$/, '.wav'))));
  const x = w.channels[0];
  const segs = segmentNotes(x, w.sampleRate, f.merge ? { merge: f.merge } : {});
  segs.forEach((s, i) => {
    const id = identifyNote(x, w.sampleRate, s, Math.max(f.range[0] - 1, 24), f.range[1] + 1);
    const m = segs.length === f.range[1] - f.range[0] + 1 && Math.abs(id.midi - (f.range[0] + i)) <= 1 ? f.range[0] + i : id.midi;
    if (m < f.use[0] || m > f.use[1]) return;
    const lim = i + 1 < segs.length ? segs[i + 1].start : x.length;
    const t = fall(x, w.sampleRate, s.start, s.end, lim);
    if (Number.isFinite(t)) rec.set(`${f.dyn}:${m}`, t);
  });
}

function model(idle: number | null): Map<string, number> {
  const d = eng.BOWED[inst];
  const was = d.idleCoupling;
  if (idle !== null) d.idleCoupling = idle;
  const out = new Map<string, number>();
  for (const r of refs) {
    if (!rec.has(`${r.dyn}:${r.midi}`)) continue;
    const g = eng.renderInstrument({
      sampleRate: FS,
      instrument: inst,
      dry: true,
      params: r.vibRate > 0 ? {} : { vibrato: 0 },
      events: [
        { time: 0.1, event: { type: 'noteOn', midi: r.midi, velocity: DYN_VEL[r.dyn] } },
        { time: 0.1 + HOLD, event: { type: 'noteOff', midi: r.midi } },
      ],
      duration: HOLD + 2.6,
    });
    const x = new Float32Array(g.left.length);
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * (g.left[i] + g.right[i]);
    const t = fall(x, FS, Math.round(0.1 * FS), Math.round((0.1 + HOLD) * FS), x.length);
    // (still within 30 dB 2.5 s after the bow: counted as that long)
    out.set(`${r.dyn}:${r.midi}`, Number.isFinite(t) ? t : 2.5);
  }
  d.idleCoupling = was;
  return out;
}

const med = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : NaN;
};
const keys = [...rec.keys()];
const midiOf = (k: string) => Number(k.split(':')[1]);
const groups: [string, string[]][] = [
  ['rings an open string', keys.filter((k) => partner(midiOf(k)))],
  ['an open string itself', keys.filter((k) => opens.includes(midiOf(k)))],
  ['the rest', keys.filter((k) => !partner(midiOf(k)) && !opens.includes(midiOf(k)))],
];
console.log(`${inst} (${dyns.join(', ')}): the fall from −10 to −30 dB after a note, s (median); ${keys.length} recorded notes with a clean end`);
console.log(`recording:   ${groups.map(([g, ks]) => `${g} ${med(ks.map((k) => rec.get(k)!)).toFixed(2)} (${ks.length})`).join('; ')}`);
for (const idle of [null, ...idles]) {
  const m = model(idle);
  const row = groups.map(([g, ks]) => {
    const d = ks.filter((k) => m.has(k)).map((k) => Math.log2(m.get(k)! / rec.get(k)!));
    return `${g} ${med(ks.filter((k) => m.has(k)).map((k) => m.get(k)!)).toFixed(2)} (×${Math.pow(2, med(d)).toFixed(1)} the recording's, |log2| mean ${(d.reduce((a, v) => a + Math.abs(v), 0) / Math.max(1, d.length)).toFixed(2)})`;
  });
  console.log(`model${idle === null ? ' as it is' : `, idle strings × ${idle}`}: ${row.join('; ')}`);
  if (args.includes('--list')) for (const k of keys) if (m.has(k)) console.log(`   ${k.split(':')[0]} ${name(midiOf(k)).padEnd(4)} recording ${rec.get(k)!.toFixed(2)} s, model ${m.get(k)!.toFixed(2)} s${partner(midiOf(k)) ? '  (rings an open string)' : ''}`);
}
