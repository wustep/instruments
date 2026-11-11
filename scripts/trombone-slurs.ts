// The trombone's fast slurs: runs asked of it as a file asks them (each note held a little into the next:
// a slur; or each ending where the next begins: --tongued), at note lengths from 80 to 300 ms. Which notes
// speak, on which partial, how late, and where the slide is against where it should be. Dry, 48 kHz, the notes
// told ahead as the file player tells them.
//   npx tsx scripts/trombone-slurs.ts [--engine <old>/packages/engine/src/core/index.ts] [--size tenor|alto|bass]
//       [--len 0.08,0.1,0.139,0.2,0.3] [--vel 84] [--over 0.03] [--tongued] [--hand] [--gliss 1] [--run steps]
//       [--notes] [--json out.json]
// The runs (written for the tenor and the bass in B♭; the alto plays them a fourth higher, on the same
// positions):
//   steps      a B♭ major scale up an octave from B♭2 and back (the slide crosses back and forth: 1 6 4 3 1 4 2 1)
//   thirds     the same scale in broken thirds
//   chromatic  F3 down to D♭3 and back (one position at a time along the third partial)
//   far        F3 D3 F3 D♭3 F3 D3 F3 (the third partial, positions 1–4 and 1–5: 26 and 36 cm)
//   lips       B♭2 F3 B♭3 D4 B♭3 F3 B♭2 (first position: the lips alone, partials 2 3 4 5)
//   leaps      B♭2 D3 F3 A3 C4 A3 F3 D3 (thirds across partials with the slide moving: 1 4 1 2 3 2 1 4)
// Per note:
//   lost     it stays 12 dB under the same note held, or under a third of its level is at its own pitch
//            (scripts/winds-midi-measure.ts)
//   speak    ms from its beat until its own harmonics are within 6 dB of the level it settles to, in tune
//   sounds   the pitch heard over its 40–90 % (autocorrelation), and the partial of the tube that is
//   slide    how far the tube is from the note's at its beat (cm of slide; a valve's loop counts as the slide
//            it is worth), and when it comes within 5 mm of it (ms after the beat; negative: before)
// The table: per run and length, notes lost / on another partial of the run's notes after the first, the
// median and the latest speak, the latest slide.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TimedEvent } from '../packages/engine/src/core/render.ts';
import { foreseen, pairNotes } from './winds-midi-lib.ts';
import { measure, type NoteMeasure } from './winds-midi-measure.ts';

type Engine = typeof import('../packages/engine/src/core/index.ts');
const C_AIR = 343.2;
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const noteName = (m: number): string => `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const med = (a: number[]): number => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
};

export const RUNS: Record<string, number[]> = {
  steps: [46, 48, 50, 51, 53, 55, 57, 58, 57, 55, 53, 51, 50, 48, 46],
  thirds: [46, 50, 48, 51, 50, 53, 51, 55, 53, 57, 55, 58],
  chromatic: [53, 52, 51, 50, 49, 50, 51, 52, 53],
  far: [53, 50, 53, 49, 53, 50, 53],
  lips: [46, 53, 58, 62, 58, 53, 46],
  leaps: [46, 50, 53, 57, 60, 57, 53, 50],
};

export interface SlurNote extends NoteMeasure {
  /** the pitch heard (MIDI, fractional) and the tube's partial that is; the partial asked */
  heard: number;
  partial: number;
  asked: number;
  position: number;
  /** the slide at the beat: cm from the note's position; ms after the beat until within 5 mm */
  slideCm: number;
  slideMs: number;
}

/** the pitch of x over [a, b): the first strong peak of its autocorrelation (Hz; 0: none) */
function pitchOf(x: Float32Array, fs: number, a: number, b: number): number {
  const n = b - a;
  const lo = Math.floor(fs / 900);
  const hi = Math.min(n >> 1, Math.ceil(fs / 28));
  if (hi <= lo + 2) return 0;
  let e0 = 0;
  for (let i = a; i < b; i++) e0 += x[i] * x[i];
  if (e0 <= 0) return 0;
  const r = new Float64Array(hi + 2);
  let best = 0;
  for (let k = lo; k <= hi + 1; k++) {
    let s = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = a; i < b - k; i++) {
      s += x[i] * x[i + k];
      e1 += x[i] * x[i];
      e2 += x[i + k] * x[i + k];
    }
    r[k] = s / Math.sqrt(Math.max(1e-30, e1 * e2));
    if (r[k] > best) best = r[k];
  }
  if (best < 0.3) return 0;
  for (let k = lo + 1; k <= hi; k++)
    // (the shortest period that repeats nearly as well as the best: a little of the tube's own round trip in
    // the tone must not read as its pedal)
    if (r[k] > 0.8 * best && r[k] >= r[k - 1] && r[k] >= r[k + 1]) {
      const d = r[k - 1] - 2 * r[k] + r[k + 1];
      const off = d ? (0.5 * (r[k - 1] - r[k + 1])) / d : 0;
      return fs / (k + off);
    }
  return 0;
}

/** one run at one note length, through an engine */
export function slurRun(E: Engine, pitches: number[], len: number, o: { size?: string; vel?: number; over?: number; hand?: boolean; gliss?: number; held?: Map<string, number>; fs?: number } = {}): SlurNote[] {
  const fs = o.fs ?? 48000;
  const size = o.size ?? 'tenor';
  const vel = o.vel ?? 84;
  const over = o.over ?? 0.03;
  const shift = size === 'alto' ? 5 : 0;
  const seq = pitches.map((p) => p + shift);
  const params = { size, gliss: o.gliss ?? 0 };
  const ev: TimedEvent[] = [];
  let t = 0.1;
  for (const p of seq) {
    ev.push({ time: t, event: { type: 'noteOn', midi: p, velocity: vel } }, { time: t + len + over, event: { type: 'noteOff', midi: p } });
    t += len;
  }
  // (a file's order at one instant: the ends first)
  ev.sort((a, b) => a.time - b.time || (a.event.type === 'noteOff' ? 0 : 1) - (b.event.type === 'noteOff' ? 0 : 1));
  const dur = t + 0.5;
  // the notes as they are heard: each to the next one's beat
  const notes = seq.map((p, i) => ({ t: 0.1 + i * len, end: 0.1 + (i + 1) * len, midi: p, vel }));
  const told = pairNotes(ev, dur);
  const core = E.createCore({ sampleRate: fs, instrument: 'trombone', dry: true, params: params as never });
  for (const e of o.hand ? ev : [...foreseen(told), ...ev]) core.schedule(e.event, Math.round(e.time * fs));
  const n = Math.ceil(dur * fs);
  const x = new Float32Array(n);
  const Q = 32;
  const bl = new Float32Array(Q);
  const br = new Float32Array(Q);
  // the slide's round trip against where it is heading (samples), per chunk
  const dNow = new Float32Array(Math.ceil(n / Q));
  const c = core as unknown as { D: number; Dtarget: number };
  for (let i = 0, k = 0; i < n; i += Q, k++) {
    const m = Math.min(Q, n - i);
    core.process(bl, br, m);
    x.set(m === Q ? bl : bl.subarray(0, m), i);
    dNow[k] = c.D;
  }
  // each note's own slide position: the round trip its fingering asks (found by playing it alone)
  const want = (m: number): number => {
    const k = `D:${size}:${m}`;
    let v = o.held?.get(k);
    if (v === undefined) {
      const one = E.createCore({ sampleRate: fs, instrument: 'trombone', dry: true, params: params as never });
      one.schedule({ type: 'noteOn', midi: m, velocity: vel }, 0);
      one.process(bl, br, Q);
      v = (one as unknown as { Dtarget: number }).Dtarget;
      o.held?.set(k, v);
    }
    return v;
  };
  const heldLevel = (m: number, v: number): number => {
    const k = `L:${size}:${m}:${v}`;
    let L = o.held?.get(k);
    if (L === undefined) {
      const r = E.renderInstrument({ sampleRate: fs, instrument: 'trombone', events: [{ time: 0.05, event: { type: 'noteOn', midi: m, velocity: v } }, { time: 1.25, event: { type: 'noteOff', midi: m } }], duration: 1.4, dry: true, params: params as never });
      L = measure(r.left, fs, [{ t: 0.05, end: 1.25, midi: m, vel: v }], []).notes[0].levelDb;
      o.held?.set(k, L);
    }
    return L;
  };
  const M = measure(x, fs, notes, ev.map((e) => e.time), heldLevel);
  const cm = (d: number) => (d * C_AIR * 100) / (4 * fs);
  return M.notes.map((nm, i) => {
    const a = Math.round(notes[i].t * fs);
    const b = Math.round(notes[i].end * fs);
    const f = pitchOf(x, fs, a + Math.round(0.4 * (b - a)), a + Math.round(0.9 * (b - a)));
    const heard = f > 0 ? 69 + 12 * Math.log2(f / 440) : NaN;
    const fg = E.tromboneFingering(seq[i], size as never);
    const partial = f > 0 ? Math.max(1, Math.round((fg.partial * f) / et(seq[i]))) : 0;
    const D = want(seq[i]);
    const k0 = Math.floor(a / Q);
    // when it came within 5 mm of the note's place: the first time from half a note before the beat on
    let arrive = Math.floor(b / Q);
    for (let k = Math.max(0, Math.floor((a - (b - a) / 2) / Q)); k <= Math.floor(b / Q); k++)
      if (Math.abs(cm(dNow[k] - D)) <= 0.5) {
        arrive = k;
        break;
      }
    return { ...nm, heard, partial, asked: fg.partial, position: fg.position, slideCm: +cm(dNow[k0] - D).toFixed(1), slideMs: +(((arrive * Q - a) / fs) * 1000).toFixed(0) };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
  const SIZE = opt('--size', 'tenor')!;
  const LENS = opt('--len', '0.08,0.1,0.139,0.2,0.3')!.split(',').map(Number);
  const VEL = Number(opt('--vel', '84'));
  const OVER = args.includes('--tongued') ? 0 : Number(opt('--over', '0.03'));
  const HAND = args.includes('--hand');
  const GLISS = Number(opt('--gliss', '0'));
  const ONLY = opt('--run');
  const NOTES = args.includes('--notes');
  const JSON_OUT = opt('--json');
  const E: Engine = await import(pathToFileURL(ENGINE).href);
  const held = new Map<string, number>();
  const f = (v: number, w = 5) => (Number.isFinite(v) ? `${+v.toFixed(1)}` : '–').padStart(w);
  const out: Record<string, unknown>[] = [];
  console.log(`${SIZE} trombone, ${OVER ? `slurred (each note ${Math.round(OVER * 1000)} ms into the next)` : 'tongued (each note ending where the next begins)'}${HAND ? ', nothing told ahead' : ''}, v${VEL}`);
  console.log(`${'run'.padEnd(10)}${'ms'.padStart(4)}  lost  other partial  speak med (max) ms  slide at the beat, cm: med (max)  slide there, ms after: med (max)  weakest dB`);
  let lostAll = 0;
  let offAll = 0;
  let all = 0;
  for (const [name, pitches] of Object.entries(RUNS)) {
    if (ONLY && name !== ONLY) continue;
    for (const len of LENS) {
      const N = slurRun(E, pitches, len, { size: SIZE, vel: VEL, over: OVER, hand: HAND, gliss: GLISS, held });
      const later = N.slice(1);
      const lost = later.filter((n) => n.lost).length;
      const off = later.filter((n) => !n.lost && n.partial !== n.asked).length;
      lostAll += lost;
      offAll += off;
      all += later.length;
      out.push({ size: SIZE, run: name, len, notes: later.length, lost, otherPartial: off, speakMed: med(later.map((n) => n.speak)), speakMax: Math.max(...later.map((n) => n.speak)), slideCmMed: med(later.map((n) => Math.abs(n.slideCm))), slideCmMax: Math.max(...later.map((n) => Math.abs(n.slideCm))), slideMsMed: med(later.map((n) => n.slideMs)), slideMsMax: Math.max(...later.map((n) => n.slideMs)), reachMin: Math.min(...later.map((n) => n.reach)) });
      console.log(
        `${name.padEnd(10)}${`${Math.round(len * 1000)}`.padStart(4)}  ${`${lost}/${later.length}`.padStart(5)}  ${`${off}`.padStart(7)}        ${f(med(later.map((n) => n.speak)))} (${f(Math.max(...later.map((n) => n.speak)))})        ${f(med(later.map((n) => Math.abs(n.slideCm))))} (${f(Math.max(...later.map((n) => Math.abs(n.slideCm))))})                 ${f(med(later.map((n) => n.slideMs)))} (${f(Math.max(...later.map((n) => n.slideMs)))})            ${f(Math.min(...later.map((n) => n.reach)))}`,
      );
      if (NOTES)
        for (const n of N)
          console.log(
            `      ${n.t.toFixed(3)} ${noteName(n.midi).padEnd(4)} pos ${n.position} partial ${n.asked}: speak ${f(n.speak, 6)} ms  reach ${f(n.reach, 6)} dB  pure ${n.pure.toFixed(2)}  sounds ${Number.isFinite(n.heard) ? `${noteName(Math.round(n.heard))}${n.heard - Math.round(n.heard) >= 0 ? '+' : '−'}${Math.abs(Math.round((n.heard - Math.round(n.heard)) * 100))}c` : '–'} (partial ${n.partial})  slide ${f(n.slideCm, 6)} cm at the beat, there ${f(n.slideMs, 5)} ms after${n.lost ? '  LOST' : n.partial !== n.asked ? '  OTHER PARTIAL' : ''}`,
          );
    }
  }
  console.log(`all: ${lostAll} of ${all} notes lost, ${offAll} more on another partial`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
}
