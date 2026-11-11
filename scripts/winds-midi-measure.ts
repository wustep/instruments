// How the winds and brass play a MIDI file's notes, measured note by note on dry renders of the bundled
// pieces' real passages (each part as the browser sends it: scripts/winds-midi-lib.ts).
//   npx tsx scripts/winds-midi-measure.ts [--engine <old>/packages/engine/src/core/index.ts] [--part <text>]
//       [--seconds 30] [--start <s>] [--json out.json] [--wav <dir>] [--notes] [--hand] [--fs 48000] [file.mid ...]
// Each part: its busiest --seconds (or from --start). Per note, from the render:
//   speak   ms from the note-on until the level at the note's own pitch (its first twelve harmonics, heterodyned)
//           is within 6 dB of what the note settles to (the median over its 40–90 %)
//   hole    at a note that begins where the last one ends (or over it): how far the level falls under the
//           softer of the two notes (dB), and for how long it stays more than 6 dB under (ms)
//   pure    the share of the note's level that is at its own pitch, over its 40–90 % (a note that sounds
//           another partial, or the last note's pitch, is far under 1)
//   cents   its pitch against equal temperament there
//   reach   its level (the same median) against the same pitch at the same strength held for 1.2 s alone: how
//           much of the note there is
//   mode    the bore mode it sounds on, from which of its harmonics carry it over its 40–90 %: 2 where all
//           but its even harmonics are 20 dB down (its octave is heard), 3 (the twelfth), 4; 1 is the note
//   lost    the note stays more than 12 dB under that, or under a third of its level is at its own pitch (it
//           did not speak, was cut, or sounded another pitch)
//   jump    the largest one-sample step within −0.2…+0.3 ms of an event over the 99th percentile of the
//           steps in the 50 ms either side (a click the model switched in: audio audit's measure)
// and after the part's last note: stuck, the level 1.5 s after it has ended against the passage's own.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import type { TimedEvent } from '../packages/engine/src/core/render.ts';
import { foreseen, windParts, type PartNote, type WindPart } from './winds-midi-lib.ts';

type Render = typeof import('../packages/engine/src/core/index.ts').renderInstrument;

export interface NoteMeasure {
  t: number;
  dur: number;
  midi: number;
  vel: number;
  /** how it meets the last note: 'first' (after silence), 'abut', 'overlap', 'gap' (a rest under 30 ms), 'rest' */
  join: 'first' | 'abut' | 'overlap' | 'gap' | 'rest';
  same: boolean;
  speak: number;
  holeDb: number;
  holeMs: number;
  pure: number;
  cents: number;
  levelDb: number;
  /** its level against the same note held (a 1.2 s note of its pitch and strength, alone), dB */
  reach: number;
  /** the bore mode it sounds on: 1 its own; 2 its octave (only its even harmonics sound), 3 its twelfth, 4 */
  mode: number;
  lost: boolean;
}
export interface PartMeasure {
  name: string;
  instrument: string;
  start: number;
  seconds: number;
  notes: NoteMeasure[];
  jump: number;
  jumps2: number;
  stuckDb: number;
  rmsDb: number;
  peakDb: number;
}

const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const db = (x: number) => 20 * Math.log10(Math.max(1e-9, x));
const median = (a: number[]) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};
const quant = (a: number[], q: number) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

/** the busiest `seconds` of a part (the most notes begun), by the second */
export function busiest(notes: PartNote[], seconds: number, duration: number): number {
  let best = 0;
  let bestN = -1;
  for (let s = 0; s <= Math.max(0, duration - seconds); s += 1) {
    let n = 0;
    for (const x of notes) if (x.t >= s && x.t < s + seconds) n++;
    if (n > bestN) {
      bestN = n;
      best = s;
    }
  }
  return best;
}

/** a part's events from `start` for `seconds`, moved to begin 0.1 s in; notes sounding at the cut are let go */
export function excerpt(part: WindPart, start: number, seconds: number): { events: TimedEvent[]; notes: PartNote[]; dur: number } {
  const lead = 0.1;
  const events: TimedEvent[] = [];
  const open = new Map<number, number>();
  // (controllers as they stand at the start)
  const last = new Map<number, TimedEvent>();
  for (const e of part.events) {
    const ev = e.event as { type: string; midi?: number; cc?: number };
    if (e.time < start - 1e-9) {
      if (ev.type === 'control') last.set(ev.cc!, e);
      continue;
    }
    if (e.time >= start + seconds) {
      // an end of a note begun inside still counts
      if (ev.type === 'noteOff' && (open.get(ev.midi!) ?? 0) > 0) {
        open.set(ev.midi!, open.get(ev.midi!)! - 1);
        events.push({ time: Math.min(e.time, start + seconds + 2) - start + lead, event: e.event });
      }
      continue;
    }
    if (ev.type === 'noteOn') open.set(ev.midi!, (open.get(ev.midi!) ?? 0) + 1);
    else if (ev.type === 'noteOff') {
      if (!(open.get(ev.midi!) ?? 0)) continue;
      open.set(ev.midi!, open.get(ev.midi!)! - 1);
    }
    events.push({ time: e.time - start + lead, event: e.event });
  }
  const head: TimedEvent[] = [...last.values()].map((e) => ({ time: 0, event: e.event }));
  const all = [...head, ...events];
  const notes = part.notes.filter((n) => n.t >= start - 1e-9 && n.t < start + seconds).map((n) => ({ ...n, t: n.t - start + lead, end: Math.min(n.end, start + seconds + 2) - start + lead }));
  const end = notes.reduce((a, n) => Math.max(a, n.end), 0);
  return { events: all, notes, dur: end + 2.2 };
}

/** RMS of x over ±half around sample c */
function rmsAt(x: Float32Array, c: number, half: number): number {
  let s = 0;
  let n = 0;
  for (let i = Math.max(0, c - half); i < Math.min(x.length, c + half); i++) {
    s += x[i] * x[i];
    n++;
  }
  return Math.sqrt(s / Math.max(1, n));
}

/** the level (RMS) of the harmonics k·f0 (k = 1…K) in a Hann window about sample c, and the strongest one's phase */
function harmonicsAt(x: Float32Array, fs: number, f0: number, c: number, half: number, K: number): { level: number; k: number; phase: number } {
  let p2 = 0;
  let bestA = 0;
  let bestK = 1;
  let bestPh = 0;
  const a = Math.max(0, c - half);
  const b = Math.min(x.length, c + half);
  for (let k = 1; k <= K; k++) {
    const w = (2 * Math.PI * k * f0) / fs;
    if (k * f0 > 0.45 * fs) break;
    let re = 0;
    let im = 0;
    let sw = 0;
    for (let i = a; i < b; i++) {
      const h = 0.5 + 0.5 * Math.cos((Math.PI * (i - c)) / half);
      const ph = w * (i - c);
      re += x[i] * h * Math.cos(ph);
      im -= x[i] * h * Math.sin(ph);
      sw += h;
    }
    const amp = (2 * Math.hypot(re, im)) / Math.max(1e-9, sw);
    p2 += (amp * amp) / 2;
    if (amp > bestA) {
      bestA = amp;
      bestK = k;
      // (the phase from one time origin for every frame: the local one turned back by w·c)
      bestPh = Math.atan2(im, re) - w * c;
    }
  }
  return { level: Math.sqrt(p2), k: bestK, phase: bestPh };
}

/** Which of a note's harmonics carry it over [a, b): 1 all of them (the note), d = 2, 3, 4 where those that
 *  are not multiples of d hold under 1 % of the power (it sounds on its d-th mode: the octave, the twelfth,
 *  two octaves up). Windows of at least eight periods; a span too short to tell is 1. */
export function modeOf(x: Float32Array, fs: number, f0: number, a: number, b: number): number {
  const need = Math.round((8 / f0) * fs);
  if (b - a < need) {
    const mid = (a + b) >> 1;
    a = mid - (need >> 1);
    b = a + need;
    if (a < 0 || b > x.length) return 1;
  }
  const W = b - a;
  const H: number[] = [];
  let tot = 0;
  for (let k = 1; k <= 12; k++) {
    if (k * f0 > 0.45 * fs) {
      H.push(0);
      continue;
    }
    const w = (2 * Math.PI * k * f0) / fs;
    let re = 0;
    let im = 0;
    for (let i = 0; i < W; i++) {
      const hw = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
      re += x[a + i] * hw * Math.cos(w * i);
      im += x[a + i] * hw * Math.sin(w * i);
    }
    const p = re * re + im * im;
    H.push(p);
    tot += p;
  }
  if (tot <= 0) return 1;
  for (const d of [4, 3, 2]) {
    let off = 0;
    for (let k = 1; k <= 12; k++) if (k % d) off += H[k - 1];
    if (off / tot < 0.01) return d;
  }
  return 1;
}

/** the audio audit's click measure over a set of event times */
export function worstJump(L: Float32Array, fs: number, times: number[]): { worst: number; over2: number } {
  let worst = 0;
  let over2 = 0;
  for (const time of times) {
    const c = Math.round(time * fs);
    let j = 0;
    for (let i = c - Math.round(0.0002 * fs); i < c + Math.round(0.0003 * fs); i++) if (i > 0 && i < L.length) j = Math.max(j, Math.abs(L[i] - L[i - 1]));
    const around: number[] = [];
    for (let i = c - Math.round(0.05 * fs); i < c + Math.round(0.05 * fs); i++) if (Math.abs(i - c) > Math.round(0.002 * fs) && i > 0 && i < L.length) around.push(Math.abs(L[i] - L[i - 1]));
    around.sort((a, b) => a - b);
    const ref = around[Math.floor(0.99 * (around.length - 1))] ?? 0;
    if (j > 1e-5) {
      const r = j / Math.max(ref, 1e-6);
      worst = Math.max(worst, r);
      if (r > 2) over2++;
    }
  }
  return { worst, over2 };
}

/** measure one rendered excerpt */
export function measure(x: Float32Array, fs: number, notes: PartNote[], eventTimes: number[], held?: (midi: number, vel: number) => number): Omit<PartMeasure, 'name' | 'instrument' | 'start' | 'seconds'> {
  const hop = Math.round(0.0025 * fs);
  const raw = notes.map((n, i) => {
    const f0 = et(n.midi);
    const half = Math.round(Math.min(0.03, Math.max(0.008, 2 / f0)) * fs);
    const a = Math.round(n.t * fs);
    const b = Math.round(n.end * fs);
    // the note's own span: to its end, or to the next note's start (a note under another is heard to there)
    const next = notes[i + 1];
    const stop = next && next.t < n.end ? Math.round(next.t * fs) : b;
    const frames: { c: number; H: number; E: number; k: number; ph: number }[] = [];
    for (let c = a; c <= Math.max(stop, a + hop); c += hop) {
      const h = harmonicsAt(x, fs, f0, c, half, 12);
      frames.push({ c, H: h.level, E: rmsAt(x, c, half), k: h.k, ph: h.phase });
    }
    const body = frames.filter((f) => f.c >= a + 0.4 * (stop - a) && f.c <= a + 0.9 * (stop - a));
    const B = body.length ? body : frames;
    const Href = median(B.map((f) => f.H));
    const Eref = median(B.map((f) => f.E));
    // each frame's pitch against the note's: the strongest harmonic's phase advance since the last frame
    const centsAt = (j: number): number => {
      if (j < 1 || frames[j].k !== frames[j - 1].k) return NaN;
      let d = frames[j].ph - frames[j - 1].ph;
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      const df = (d * fs) / (2 * Math.PI * (frames[j].c - frames[j - 1].c));
      const fk = frames[j].k * f0;
      return 1200 * Math.log2(Math.max(1e-3, (fk + df) / fk));
    };
    // spoken: at its level (within 6 dB) and at its pitch (within 35 cents), and still so 5 ms on
    let speak = (stop - a) / fs;
    for (let j = 1; j < frames.length; j++) {
      const ok = (q: number) => q < frames.length && frames[q].H >= Href * 0.5 && Math.abs(centsAt(q)) < 35;
      if (ok(j) && (j + 2 >= frames.length || ok(j + 2))) {
        speak = (frames[j].c - a) / fs;
        break;
      }
    }
    const cents: number[] = [];
    for (let j = 1; j < frames.length; j++) if (frames[j].c >= a + 0.4 * (stop - a) && frames[j].c <= a + 0.9 * (stop - a) && Number.isFinite(centsAt(j))) cents.push(centsAt(j));
    const mode = modeOf(x, fs, f0, Math.round(a + 0.4 * (stop - a)), Math.round(a + 0.9 * (stop - a)));
    return { n, a, b, stop, half, Href, Eref, speak, mode, cents: cents.length ? median(cents) : NaN, pure: Eref > 1e-7 ? Math.min(1, Href / Eref) : 0 };
  });
  const usual = median(raw.map((r) => r.Href).filter((v) => v > 0));
  const out: NoteMeasure[] = raw.map((r, i) => {
    const prev = raw[i - 1];
    const gap = prev ? r.n.t - prev.n.end : Infinity;
    const join: NoteMeasure['join'] = !prev ? 'first' : Math.abs(gap) < 1e-6 ? 'abut' : gap < 0 ? 'overlap' : gap < 0.03 ? 'gap' : 'rest';
    let holeDb = 0;
    let holeMs = 0;
    if (prev && join !== 'rest') {
      const ref = Math.min(prev.Eref, r.Eref);
      const w = Math.round(0.004 * fs);
      let lo = Infinity;
      let under = 0;
      const to = Math.min(r.stop, r.a + Math.round(0.12 * fs));
      for (let c = r.a - Math.round(0.01 * fs); c <= to; c += hop) {
        const e = rmsAt(x, c, w);
        lo = Math.min(lo, e);
        if (e < ref * 0.5) under += hop;
      }
      holeDb = ref > 1e-7 ? Math.max(0, db(ref) - db(lo)) : 0;
      holeMs = (under / fs) * 1000;
    }
    return {
      t: +r.n.t.toFixed(4),
      dur: +(r.n.end - r.n.t).toFixed(4),
      midi: r.n.midi,
      vel: r.n.vel,
      join,
      same: !!prev && prev.n.midi === r.n.midi,
      speak: +(r.speak * 1000).toFixed(1),
      holeDb: +holeDb.toFixed(1),
      holeMs: +holeMs.toFixed(1),
      pure: +r.pure.toFixed(3),
      cents: +r.cents.toFixed(1),
      levelDb: +db(r.Href).toFixed(1),
      reach: held ? +(db(r.Href) - held(r.n.midi, r.n.vel)).toFixed(1) : NaN,
      mode: r.mode,
      lost: (held ? db(r.Href) - held(r.n.midi, r.n.vel) < -12 : r.Href < usual * 0.25) || r.pure < 0.35,
    };
  });
  const j = worstJump(x, fs, eventTimes);
  const lastEnd = notes.reduce((a, n) => Math.max(a, n.end), 0);
  let s2 = 0;
  let pk = 0;
  const to = Math.min(x.length, Math.round(lastEnd * fs));
  for (let i = 0; i < to; i++) {
    s2 += x[i] * x[i];
    pk = Math.max(pk, Math.abs(x[i]));
  }
  const rms = Math.sqrt(s2 / Math.max(1, to));
  const stuck = rmsAt(x, Math.round((lastEnd + 1.5) * fs), Math.round(0.1 * fs));
  return { notes: out, jump: +j.worst.toFixed(2), jumps2: j.over2, stuckDb: +(db(stuck) - db(rms)).toFixed(1), rmsDb: +db(rms).toFixed(1), peakDb: +db(pk).toFixed(1) };
}

/** The level of a note held alone (1.2 s, dry, nothing foreseen: the long tone), by pitch and strength (in
 *  steps of 6): what `reach` is measured against. One render per pitch and step, kept. */
export function heldLevels(render: Render, instrument: string, fs: number, player = 0): (midi: number, vel: number) => number {
  const memo = new Map<string, number>();
  return (midi, vel) => {
    const v = Math.max(1, Math.min(127, Math.round(vel / 6) * 6));
    const k = `${midi}:${v}`;
    let L = memo.get(k);
    if (L === undefined) {
      const r = render({ sampleRate: fs, instrument: instrument as never, events: [{ time: 0.05, event: { type: 'noteOn', midi, velocity: v } }, { time: 1.25, event: { type: 'noteOff', midi } }], duration: 1.4, dry: true, player });
      const m = measure(r.left, fs, [{ t: 0.05, end: 1.25, midi, vel: v }], []);
      L = m.notes[0].levelDb;
      memo.set(k, L);
    }
    return L;
  };
}

export function summary(m: PartMeasure): Record<string, number | string> {
  const N = m.notes;
  const joined = N.filter((n) => n.join === 'abut' || n.join === 'overlap' || n.join === 'gap');
  const moved = joined.filter((n) => !n.same);
  const same = joined.filter((n) => n.same);
  const fresh = N.filter((n) => n.join === 'first' || n.join === 'rest');
  const f = (v: number, d = 1) => (Number.isFinite(v) ? +v.toFixed(d) : NaN);
  return {
    part: m.name,
    notes: N.length,
    lost: N.filter((n) => n.lost).length,
    'reach dB (med)': f(median(N.map((n) => n.reach))),
    'reach dB (p10)': f(quant(N.map((n) => n.reach), 0.1)),
    'reach fresh dB (med)': f(median(fresh.map((n) => n.reach))),
    'reach fresh dB (min)': f(Math.min(...fresh.map((n) => n.reach))),
    'speak joined ms (med)': f(median(moved.map((n) => n.speak))),
    'speak joined ms (p90)': f(quant(moved.map((n) => n.speak), 0.9)),
    'speak fresh ms (med)': f(median(fresh.map((n) => n.speak))),
    'hole dB (med)': f(median(moved.map((n) => n.holeDb))),
    'hole dB (p90)': f(quant(moved.map((n) => n.holeDb), 0.9)),
    'hole ms (med)': f(median(moved.map((n) => n.holeMs))),
    'repeat hole dB (med)': f(median(same.map((n) => n.holeDb))),
    'repeat hole ms (med)': f(median(same.map((n) => n.holeMs))),
    'on another mode': N.filter((n) => n.mode !== 1).length,
    'pure (med)': f(median(N.map((n) => n.pure)), 2),
    'impure notes': N.filter((n) => n.pure < 0.7).length,
    '|cents| (med)': f(median(N.map((n) => Math.abs(n.cents)).filter(Number.isFinite))),
    'off-pitch notes (>35 c)': N.filter((n) => Math.abs(n.cents) > 35).length,
    'worst jump ×': m.jump,
    'jumps > 2×': m.jumps2,
    'stuck dB': m.stuckDb,
    'rms dBFS': m.rmsDb,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (k: string, d?: string) => {
    const i = args.indexOf(k);
    if (i < 0) return d;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const flag = (k: string) => (args.includes(k) ? (args.splice(args.indexOf(k), 1), true) : false);
  const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
  const PART = opt('--part', '')!;
  const SECONDS = Number(opt('--seconds', '30'));
  const START = opt('--start');
  const JSON_OUT = opt('--json');
  const WAV = opt('--wav');
  const FS = Number(opt('--fs', '48000'));
  const NOTES = flag('--notes');
  // --hand: nothing foreseen (the notes as a keyboard would send them)
  const HAND = flag('--hand');
  const render: Render = (await import(pathToFileURL(ENGINE).href)).renderInstrument;
  const parts = windParts(args.length ? args : undefined).filter((p) => p.name.includes(PART));
  const all: PartMeasure[] = [];
  if (WAV) mkdirSync(WAV, { recursive: true });
  for (const p of parts) {
    const start = START !== undefined ? Number(START) : busiest(p.notes, SECONDS, p.duration);
    const ex = excerpt(p, start, SECONDS);
    if (!ex.notes.length) continue;
    const r = render({ sampleRate: FS, instrument: p.instrument, events: HAND ? ex.events : [...foreseen(ex.notes), ...ex.events], duration: ex.dur, dry: true, player: p.player });
    const times = ex.events.map((e) => e.time);
    const m: PartMeasure = { name: p.name, instrument: p.instrument, start, seconds: SECONDS, ...measure(r.left, FS, ex.notes, times, heldLevels(render, p.instrument, FS, p.player)) };
    all.push(m);
    if (WAV) writeFileSync(join(WAV, `${p.name.replace(/\s+/g, '-')}.wav`), encodeWav({ sampleRate: FS, channels: [r.left, r.right] }));
    const s = summary(m);
    console.log(Object.entries(s).map(([k, v]) => (k === 'part' ? `${v}`.padEnd(26) + ` @${start}s` : `${k} ${v}`)).join(' | '));
    if (NOTES)
      for (const n of m.notes)
        console.log(`    ${n.t.toFixed(3).padStart(7)} ${`${n.midi}`.padStart(3)} v${`${n.vel}`.padStart(3)} ${(n.dur * 1000).toFixed(0).padStart(5)} ms ${n.join.padEnd(7)}${n.same ? '=' : ' '} speak ${`${n.speak}`.padStart(6)} hole ${`${n.holeDb}`.padStart(5)} dB ${`${n.holeMs}`.padStart(5)} ms pure ${n.pure.toFixed(2)} cents ${`${n.cents}`.padStart(6)} level ${`${n.levelDb}`.padStart(6)} reach ${`${n.reach}`.padStart(6)}${n.mode !== 1 ? `  MODE ${n.mode}` : ''}${n.lost ? '  LOST' : ''}`);
  }
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(all.map((m) => ({ ...m, summary: summary(m) })), null, 1));
}
