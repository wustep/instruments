// A bowed instrument's level note by note against the Iowa recordings' own notes (audio audit 3): every
// semitone held as the judge holds it (2.6 s, dry, 44.1 kHz, the recording's vibrato or none), at pp, mf and
// ff, on this checkout's engine or another's. Per dynamic the recording's absolute level is its microphone's
// gain, so the two curves are laid over each other by their median difference; what is left is the note's
// own: + a note the model plays hotter than the instrument recorded, − weaker. Beside it, how far each
// stands over its neighbours (the median of the two semitones either side), model and recording.
//   npx tsx scripts/strings-levels.ts viola [--engine <repo>/packages/engine/src/core/index.ts] [--lo 48 --hi 84] [--dyn mf,ff] [--json out.json]
// Printed: the table, then the notes more than 5 dB off, and the RMS of the differences (all, and the odd
// MIDI notes the fits never saw).
import { writeFileSync } from 'node:fs';
import { analyzeSustained, segmentNotes } from '../packages/engine/src/analysis/index.ts';
import { DYN_VEL } from './calibrate-ensemble.ts';
import { referenceNotes, type Dyn } from './ensemble-refs.ts';
import { engine, name } from './strings-lib.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const inst = args.find((a) => ['violin', 'viola', 'cello', 'bass'].includes(a)) ?? 'viola';
const RANGE: Record<string, [number, number]> = { violin: [55, 96], viola: [48, 84], cello: [36, 72], bass: [28, 60] };
const lo = Number(opt('--lo', String(RANGE[inst][0])));
const hi = Number(opt('--hi', String(RANGE[inst][1])));
const dyns = opt('--dyn', 'pp,mf,ff').split(',') as Dyn[];
const FS = 44100;
const HOLD = 2.6;

const eng = (await engine(opt('--engine', ''))) as unknown as { renderInstrument: (o: Record<string, unknown>) => { left: Float32Array; right: Float32Array } };
const refs = (await referenceNotes()).filter((r) => r.instrument === inst);

function level(midi: number, dyn: Dyn, vibrato: boolean): number {
  const r = eng.renderInstrument({
    sampleRate: FS,
    instrument: inst,
    dry: true,
    params: vibrato ? {} : { vibrato: 0 },
    events: [
      { time: 0.1, event: { type: 'noteOn', midi, velocity: DYN_VEL[dyn] } },
      { time: 0.1 + HOLD, event: { type: 'noteOff', midi } },
    ],
    duration: HOLD + 0.8,
  });
  const x = new Float32Array(r.left.length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (r.left[i] + r.right[i]);
  const segs = segmentNotes(x, FS);
  if (!segs.length) return NaN;
  const seg = segs.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  return analyzeSustained(x, FS, seg, midi).rmsDb;
}

const med = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? (s.length & 1 ? s[s.length >> 1] : 0.5 * (s[s.length / 2 - 1] + s[s.length / 2])) : NaN;
};
/** a note over the median of the two semitones either side of it */
const over = (lv: Map<number, number>, m: number): number => {
  const nb = [m - 2, m - 1, m + 1, m + 2].map((q) => lv.get(q) ?? NaN).filter(Number.isFinite);
  return nb.length >= 2 && Number.isFinite(lv.get(m) ?? NaN) ? lv.get(m)! - med(nb) : NaN;
};
const f1 = (x: number) => (Number.isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(1) : '   ·').padStart(6);

const out: Record<string, unknown>[] = [];
const summary: string[] = [];
for (const dyn of dyns) {
  const rec = new Map<number, number>();
  const vib = new Map<number, boolean>();
  for (const r of refs) if (r.dyn === dyn) (rec.set(r.midi, r.rmsDb), vib.set(r.midi, r.vibRate > 0));
  const mod = new Map<number, number>();
  for (let m = lo; m <= hi; m++) mod.set(m, level(m, dyn, vib.get(m) ?? false));
  const off = med([...rec.keys()].filter((m) => mod.has(m)).map((m) => mod.get(m)! - rec.get(m)!));
  console.log(`\n${inst} ${dyn} (v${DYN_VEL[dyn]}): model − recording, the curves laid over each other (${rec.size} recorded notes)`);
  console.log('note   model dB   over its neighbours: model  recording   model − recording');
  const hot: string[] = [];
  let s2 = 0;
  let n = 0;
  let h2 = 0;
  let hn = 0;
  let p2 = 0;
  let pn = 0;
  for (let m = lo; m <= hi; m++) {
    const d = rec.has(m) ? mod.get(m)! - rec.get(m)! - off : NaN;
    const om = over(mod, m);
    const or = over(rec, m);
    console.log(`${name(m).padEnd(4)} ${mod.get(m)!.toFixed(1).padStart(8)}   ${f1(om)}  ${f1(or)}   ${f1(d)}${Math.abs(d) > 5 ? (d > 0 ? '  hot' : '  weak') : ''}`);
    out.push({ dyn, midi: m, model: mod.get(m), recording: rec.get(m) ?? null, diff: Number.isFinite(d) ? d : null, overModel: om, overRecording: Number.isFinite(or) ? or : null });
    if (Number.isFinite(d)) {
      s2 += d * d;
      n++;
      if (m & 1) (h2 += d * d, hn++);
      if (Math.abs(d) > 5) hot.push(`${name(m)} ${f1(d).trim()}`);
    }
    if (Number.isFinite(om) && Number.isFinite(or)) (p2 += (om - or) ** 2, pn++);
  }
  summary.push(`${inst} ${dyn}: model − recording RMS ${Math.sqrt(s2 / Math.max(1, n)).toFixed(2)} dB (${n} notes; held-out odd notes ${Math.sqrt(h2 / Math.max(1, hn)).toFixed(2)} dB, ${hn}); over-neighbours RMS ${Math.sqrt(p2 / Math.max(1, pn)).toFixed(2)} dB; more than 5 dB off: ${hot.join(', ') || 'none'}`);
}
console.log('');
for (const s of summary) console.log(s);
if (args.includes('--json')) writeFileSync(opt('--json', ''), JSON.stringify(out));
