// What a trombonist does that a model alone does not (the University of Iowa MIS tenor trombone, analysis
// only): from one note of a run to the next, how far the pitch is from the run's own tuning (cents), the
// strength from the run's own line (dB), the attack's length from the run's own (a share), and where the
// pitch starts against where it settles (cents: the lips and the slide finding the note); within a held note,
// the level's shape (where it peaks, how it falls) and how far the level, the brightness and the pitch wander.
// These are what the engine's player is given to vary by (core/trombone.ts TROMBONE_HUMAN).
//   npx tsx scripts/trombone-variation.ts [--model [--human 0]] [--bass] [--detached]
// --model: the engine's own notes (a run of them in one sitting, so its player's stream runs on), read the
// same way; --human 0: the model alone (what is fitted and judged)
// --detached: what a player's variation must not cost. A scale of 70 ms notes with 70 ms rests, as a file
// plays it (each note told ahead), twelve players through: how many of its 96 notes are more than 10 dB under
// the scale's median note, with the player and with the model alone
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeSustained, decodeWav, segmentNotes, spectrum } from '../packages/engine/src/analysis/index.ts';
import { createCore, renderInstrument, type TimedEvent } from '../packages/engine/src/core/index.ts';
import { ENS_CACHE, REF_FILES, analyseFile } from './ensemble-refs.ts';
import { look, q, sd, type Row } from './variation-lib.ts';

const args = process.argv.slice(2);
const MODEL = args.includes('--model');
const HUMAN = args.includes('--human') ? Number(args[args.indexOf('--human') + 1]) : 1;
const BASS = args.includes('--bass');
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

interface NoteRow extends Row { midi: number; run: string; cents: number; rms: number; attack: number; scoop: number }

/** where the pitch starts against where it settles (cents): the strongest low partial's frequency over
 *  the note's first 60–160 ms, less its median over the held part */
function scoopOf(x: ArrayLike<number>, fs: number, a: number, b: number, f0: number): number {
  const win = Math.round(0.08 * fs);
  const at = (s: number, h: number) => {
    const sp = spectrum(x, fs, s, win, 16384, 'hann');
    const lo = Math.floor((h * f0 * 0.95) / sp.binHz);
    const hi = Math.ceil((h * f0 * 1.05) / sp.binHz);
    let top = lo;
    for (let k = lo; k <= hi; k++) if (sp.mag[k] > sp.mag[top]) top = k;
    const l = Math.log(sp.mag[top - 1] + 1e-30);
    const c = Math.log(sp.mag[top] + 1e-30);
    const r = Math.log(sp.mag[top + 1] + 1e-30);
    return { c: 1200 * Math.log2(((top + (0.5 * (l - r)) / (l - 2 * c + r)) * sp.binHz) / (h * f0)), m: sp.mag[top] };
  };
  // the harmonic to follow: the strongest of the first six at the note's middle
  let h = 1;
  let bm = 0;
  for (let k = 1; k <= 6; k++) {
    const v = at(Math.round((a + b) / 2), k).m;
    if (v > bm) {
      bm = v;
      h = k;
    }
  }
  const steady: number[] = [];
  for (let s = a + Math.round(0.4 * fs); s + win < b - Math.round(0.2 * fs); s += Math.round(0.05 * fs)) steady.push(at(s, h).c);
  if (steady.length < 4) return NaN;
  const first = at(a + Math.round(0.06 * fs), h).c;
  return first - q(steady, 0.5);
}

if (args.includes('--detached')) {
  const FS = 48000;
  const seq = [53, 55, 57, 58, 60, 58, 57, 55];
  /** the level at a pitch (its first six harmonics) over [t0, t1] */
  const at = (x: Float32Array, midi: number, t0: number, t1: number) => {
    const f0 = hz(midi);
    const a = Math.round(t0 * FS);
    const W = Math.round((t1 - t0) * FS);
    let p = 0;
    for (let k = 1; k <= 6; k++) {
      let re = 0;
      let im = 0;
      let sw = 0;
      for (let i = 0; i < W; i++) {
        const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
        re += x[a + i] * w * Math.cos((2 * Math.PI * k * f0 * i) / FS);
        im += x[a + i] * w * Math.sin((2 * Math.PI * k * f0 * i) / FS);
        sw += w;
      }
      p += ((2 * Math.hypot(re, im)) / sw) ** 2 / 2;
    }
    return 10 * Math.log10(p + 1e-18);
  };
  for (const human of [0, 1]) {
    let lost = 0;
    let worst = 0;
    for (let player = 0; player < 12; player++) {
      const core = createCore({ sampleRate: FS, instrument: 'trombone', dry: true, params: { human }, player });
      seq.forEach((m, i) => core.schedule({ type: 'foresee', midi: m, velocity: 80, dur: 0.07 } as never, Math.round((0.1 + i * 0.139) * FS)));
      seq.forEach((m, i) => {
        core.schedule({ type: 'noteOn', midi: m, velocity: 80 }, Math.round((0.1 + i * 0.139) * FS));
        core.schedule({ type: 'noteOff', midi: m }, Math.round((0.17 + i * 0.139) * FS));
      });
      const n = Math.round(1.6 * FS);
      const L = new Float32Array(n);
      const bl = new Float32Array(128);
      const br = new Float32Array(128);
      for (let i = 0; i < n; i += 128) {
        core.process(bl, br, Math.min(128, n - i));
        L.set(bl.subarray(0, Math.min(128, n - i)), i);
      }
      const lv = seq.map((m, i) => at(L, m, 0.125 + i * 0.139, 0.165 + i * 0.139));
      const mid = q(lv, 0.5);
      for (const v of lv) {
        if (v - mid < -10) lost++;
        worst = Math.min(worst, v - mid);
      }
    }
    console.log(`human ${human}: ${lost} of ${12 * seq.length} notes more than 10 dB under their scale's median note (the weakest ${worst.toFixed(0)} dB)`);
  }
  process.exit(0);
}

const rows: NoteRow[] = [];
function take(x: ArrayLike<number>, fs: number, a: number, b: number, dyn: string, run: string, midi: number): void {
  const r = look(x, fs, a, b, dyn);
  if (!r) return;
  const s = analyzeSustained(x, fs, { start: a, end: b }, midi);
  if (!Number.isFinite(s.f0) || Math.abs(s.cents) > 60) return;
  rows.push({ ...r, midi, run, cents: s.cents, rms: s.rmsDb, attack: s.attackMs, scoop: scoopOf(x, fs, a, b, hz(midi) * 2 ** (s.cents / 1200)) });
}

if (MODEL) {
  const fs = 44100;
  // a run as the recordings are: each note 2 s, a breath between, the three dynamics
  for (const [dyn, vel] of [['pp', 30], ['mf', 70], ['ff', 112]] as const) {
    const notes: number[] = [];
    for (let m = BASS ? 34 : 40; m <= (BASS ? 65 : 72); m++) notes.push(m);
    const events: TimedEvent[] = [];
    notes.forEach((m, i) => {
      events.push({ time: 0.05 + 3 * i, event: { type: 'noteOn', midi: m, velocity: vel } });
      events.push({ time: 2.05 + 3 * i, event: { type: 'noteOff', midi: m } });
    });
    const out = renderInstrument({ sampleRate: fs, instrument: 'trombone', dry: true, params: { human: HUMAN, ...(BASS ? { size: 'bass' } : {}) }, events, duration: 3 * notes.length });
    notes.forEach((m, i) => take(out.left, fs, Math.round((0.05 + 3 * i) * fs), Math.round((2.2 + 3 * i) * fs), dyn, dyn, m));
  }
} else {
  for (const f of REF_FILES.filter((r) => r.instrument === 'trombone' && (BASS ? r.variant === 'bass' : !r.variant))) {
    const a = decodeWav(new Uint8Array(readFileSync(join(ENS_CACHE, 'wav', f.file.replace(/\.aiff$/, '.wav')))));
    const x = a.channels[0];
    // (the notes as the fit takes them: one segment a note, its pitch known)
    const known = analyseFile(f);
    for (const seg of segmentNotes(x, a.sampleRate, f.merge ? { merge: f.merge } : {})) {
      const mid = (seg.start + seg.end) / 2 / a.sampleRate;
      void mid;
      const s = analyzeSustained(x, a.sampleRate, seg, 60);
      const n = known.find((k) => Math.abs(k.durSec - s.durSec) < 1e-6 && Math.abs(k.rmsDb - s.rmsDb) < 0.5) ?? known.find((k) => Math.abs(k.durSec - s.durSec) < 1e-6);
      if (!n) continue;
      take(x, a.sampleRate, seg.start, seg.end, f.dyn, f.file, n.midi);
    }
  }
}

/** each value less the line through its run's (against the pitch): what is the note's own */
function own(rs: NoteRow[], key: (r: NoteRow) => number): number[] {
  const out: number[] = [];
  for (const run of new Set(rs.map((r) => r.run))) {
    const g = rs.filter((r) => r.run === run && Number.isFinite(key(r))).sort((a, b) => a.midi - b.midi);
    // (against the mean of its neighbours either side: a run's slow trend across the compass is not the player's
    // unevenness; × √(2/3): the difference of a value and two others' mean has 3/2 its variance)
    for (let i = 1; i < g.length - 1; i++) out.push((key(g[i]) - (key(g[i - 1]) + key(g[i + 1])) / 2) * Math.sqrt(2 / 3));
  }
  return out;
}
console.log(MODEL ? `the engine's ${BASS ? 'bass' : 'tenor'} trombone, human ${HUMAN}` : `the recorded ${BASS ? 'bass' : 'tenor'} trombone (University of Iowa MIS)`);
for (const dyn of ['pp', 'mf', 'ff']) {
  const rs = rows.filter((r) => r.dyn === dyn);
  if (!rs.length) continue;
  const f = (k: keyof Row, d = 2) => [0.25, 0.5, 0.75].map((p) => q(rs.map((r) => r[k] as number), p).toFixed(d)).join(' / ');
  console.log(`${dyn} (${rs.length} notes, held ${q(rs.map((r) => r.dur), 0.5).toFixed(1)} s)`);
  console.log(`   within a note: the level peaks ${f('peakAt')} of the way through; falls ${f('fall', 1)} dB/s; wanders ${f('levelSd')} dB; brightness ${f('centSd', 0)} ¢; pitch ${f('pitchSd', 1)} ¢   (quartiles)`);
  console.log(`   from note to note: pitch ±${sd(own(rs, (r) => r.cents)).toFixed(1)} ¢; strength ±${sd(own(rs, (r) => r.rms)).toFixed(2)} dB; attack ${q(rs.map((r) => r.attack), 0.5).toFixed(0)} ms ±${(100 * sd(own(rs, (r) => Math.log(r.attack)))).toFixed(0)} %; the pitch starts ${q(rs.map((r) => r.scoop), 0.5).toFixed(1)} ¢ from where it settles (±${sd(own(rs, (r) => r.scoop)).toFixed(1)} ¢; quartiles ${[0.25, 0.75].map((p) => q(rs.map((r) => r.scoop), p).toFixed(1)).join(' / ')})`);
}
