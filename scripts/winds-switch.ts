// Fast switches between notes as a hand plays them on the keys (nothing foreseen), many at random, each note's
// first milliseconds measured against the same note played alone: does anything sound that is not a flute's
// note? A hand's notes reach the worklet between its render quanta (processor.ts schedules a live event at
// the core's frame, so its time is a multiple of 128 frames), and whether a key let go and the next pressed
// land on one frame or two, or the next comes inside the last note's shortest breath (MIN_BLOW), is chance.
//   npx tsx scripts/winds-switch.ts [--engine <old>/packages/engine/src/core/index.ts] [--instrument flute]
//       [--trials 40] [--notes 14] [--seed 1] [--fs 48000] [--params '{"human":0}'] [--exact]
//       [--told] [--wav out-dir] [--json out.json] [--worst 12] [--quiet]
// Each trial is a passage of `notes` notes: steps, thirds, fourths, fifths and octaves (a third of them across a
// register break), held 40–260 ms, the next pressed 70 ms before the last is let go (a slur) … 130 ms after (a
// rest), a sixth of them on the same instant; velocities as the pointer gives them (28–124). --exact: the
// events at their own sample, not on the quantum. --told: as a file plays them (each note foreseen with its
// length; with --exact, as the file player schedules them).
// What is measured (a note's segment: from its key down until the next note begins or 30 ms after its key is
// let go): its level's peak over the same note alone (held, at the same velocity: its steady level), its
// brightness (the share of its power above its 4th harmonic, in 10 ms windows) over that note's, how long it
// sounds a pitch that is neither it nor the last note (and of that, a wrong register of it), and the click.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { INSTRUMENT_INFO, type InstrumentId } from '../packages/engine/src/core/instrument.ts';
import type { TimedEvent } from '../packages/engine/src/core/render.ts';
import { encodeWav } from '../packages/engine/src/analysis/wav.ts';
import { cents, db, et, med, noteName, pct, trackFrames } from './winds-legato-lib.ts';

type Render = typeof import('../packages/engine/src/core/index.ts').renderInstrument;

export interface SwitchNote {
  midi: number;
  vel: number;
  on: number;
  off: number;
}

/** a seeded stream (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** the register breaks of an instrument (the first note of the upper register), where a switch is likeliest
 *  to go wrong */
export const BREAKS: Partial<Record<InstrumentId, number[]>> = {
  flute: [74, 86],
  oboe: [76, 89],
  clarinet: [71, 84],
  bassoon: [53, 65],
  horn: [53, 60, 65, 70],
  trumpet: [60, 67, 72, 76],
  trombone: [46, 53, 58, 62],
  tuba: [34, 41, 46, 50],
};

/** one passage of fast switches */
export function passage(id: InstrumentId, r: () => number, notes: number, q: number | null): SwitchNote[] {
  const { lo, hi } = INSTRUMENT_INFO[id];
  const breaks = BREAKS[id] ?? [];
  const steps = [1, 2, 3, 4, 5, 7, 12];
  let m = Math.round(lo + 4 + r() * (hi - lo - 8));
  let t = 0.15;
  const out: SwitchNote[] = [];
  const snap = (x: number) => (q ? Math.round(x / q) * q : x);
  for (let k = 0; k < notes; k++) {
    const vel = Math.round(28 + 96 * Math.pow(r(), 0.8));
    const hold = 0.04 + 0.22 * r();
    const on = snap(t);
    // (the next pressed before this one is let go, on the same instant, or after a rest)
    const u = r();
    const gap = u < 1 / 6 ? 0 : u < 0.5 ? -0.07 * r() : 0.13 * r();
    let off = snap(t + hold);
    if (off <= on) off = on + (q ?? 1 / 48000);
    out.push({ midi: m, vel, on, off });
    t = Math.max(t + 0.03, t + hold + gap);
    // the next pitch: across a break a third of the time
    let next = m;
    if (breaks.length && r() < 1 / 3) {
      const b = breaks[Math.floor(r() * breaks.length)];
      next = r() < 0.5 ? b - 1 - Math.floor(r() * 3) : b + Math.floor(r() * 3);
    } else {
      const s = steps[Math.floor(r() * steps.length)];
      next = m + (r() < 0.5 ? -s : s);
    }
    m = Math.max(lo, Math.min(hi, next));
  }
  return out;
}

/** the passage's events; `told`: as a file sends them, each note foreseen with its length (audio.foreseeFileEvent) */
export function events(ns: SwitchNote[], told = false): TimedEvent[] {
  const ev: TimedEvent[] = [];
  if (told) for (const n of ns) ev.push({ time: n.on, event: { type: 'foresee', midi: n.midi, velocity: n.vel, dur: n.off - n.on } as never });
  for (const n of ns) {
    ev.push({ time: n.on, event: { type: 'noteOn', midi: n.midi, velocity: n.vel } });
    ev.push({ time: n.off, event: { type: 'noteOff', midi: n.midi } });
  }
  // (at one instant, as a keyboard's are: in the order they came, and a key let go before the next pressed)
  ev.sort((a, b) => a.time - b.time || (a.event.type === 'noteOff' ? 0 : 1) - (b.event.type === 'noteOff' ? 0 : 1));
  return ev;
}

/** the powers of the first K harmonics of f0 in a window of 4 periods centred at sample c (Hann) */
export function harmonics(x: Float32Array, fs: number, c: number, f0: number, K = 16): number[] {
  const N = Math.max(32, Math.round((4 * fs) / f0));
  const a = c - (N >> 1);
  const out: number[] = [];
  for (let k = 1; k <= K; k++) {
    const f = k * f0;
    if (f > 0.45 * fs) {
      out.push(0);
      continue;
    }
    const w = (2 * Math.PI * f) / fs;
    let re = 0;
    let im = 0;
    for (let i = 0; i < N; i++) {
      const v = a + i >= 0 && a + i < x.length ? x[a + i] : 0;
      const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re += v * h * Math.cos(w * i);
      im -= v * h * Math.sin(w * i);
    }
    out.push((re * re + im * im) / (N * N));
  }
  return out;
}
/** of the harmonics' power, the share above the second (a square wave's odd harmonics, a buzz) */
export const upperShare = (h: number[]): number => {
  let t = 0;
  let u = 0;
  for (let k = 0; k < h.length; k++) {
    t += h[k];
    if (k >= 2) u += h[k];
  }
  return t > 0 ? u / t : 0;
};
const hsum = (h: number[]) => h.reduce((s, v) => s + v, 0);
/** the odd harmonics over the even (3, 5, 7 over 2, 4, 6), dB: a jet clipped hard both ways is a square wave */
export const oddEven = (h: number[]): number => db((h[2] + h[4] + h[6]) / Math.max(1e-30, h[1] + h[3] + h[5]));

export interface NoteMeasure {
  trial: number;
  k: number;
  midi: number;
  prev: number;
  vel: number;
  /** how the note came: slur (pressed before the last let go), same (one frame), gap (ms after) */
  how: string;
  gapMs: number;
  /** the last note's key had been down this long when this one came (ms) */
  prevHeldMs: number;
  /** the segment's loudest 5 ms against the note alone (dB) */
  peakDb: number;
  /** its brightest moment (of its harmonics' power, the share above the 2nd, in windows of 4 periods every 4 ms
   *  where it is within 10 dB of its level alone) over the note alone's brightest (dB) */
  brightDb: number;
  /** ms in which it sounds as a square wave: its odd harmonics 6 dB or more over its even ones against the note's
   *  steady sound, and that share 3 dB or more over its steady one, within 10 dB of its level alone */
  buzzMs: number;
  /** ms of a periodic pitch that is neither this note nor the last; of that, a wrong register of this one */
  wrongMs: number;
  crackMs: number;
  /** ms it took to be on its pitch (30 ¢, periodic) for 10 ms */
  speakMs: number;
  /** the click: the largest sample step in the first 3 ms over the 99th percentile of the next 40 */
  jump: number;
}

interface Ref {
  /** the note alone: its steady harmonic power, and its brightest moment where within 10 dB of that */
  p: number;
  b: number;
  /** its steady brightness, and its odd harmonics over its even (dB) */
  bs: number;
  oe: number;
}

export function makeRef(render: Render, id: InstrumentId, fs: number, params?: Record<string, unknown>) {
  const cache = new Map<string, Ref>();
  return (midi: number, vel: number): Ref => {
    const vb = Math.max(8, Math.round(vel / 8) * 8);
    const key = `${midi}:${vb}`;
    const hit = cache.get(key);
    if (hit) return hit;
    // (told ahead as a long note: the fingering a note joined to another has, the flute's vent among it, VENT;
    // its steady sound is what is compared, its attack is not)
    const r = render({ sampleRate: fs, instrument: id, events: [{ time: 0.05, event: { type: 'foresee', midi, velocity: vb, dur: 1 } }, { time: 0.05, event: { type: 'noteOn', midi, velocity: vb } }, { time: 1.05, event: { type: 'noteOff', midi } }], duration: 1.1, dry: true, params } as never);
    const f0 = et(midi);
    const rows: { p: number; b: number; oe: number }[] = [];
    for (let t = 0.054; t < 1.04; t += 0.004) {
      const h = harmonics(r.left, fs, Math.round(t * fs), f0);
      rows.push({ p: hsum(h), b: upperShare(h), oe: oddEven(h) });
    }
    const p = med(rows.slice(-60).map((q) => q.p));
    const b = Math.max(...rows.filter((q) => q.p >= p / 10).map((q) => q.b));
    const bs = med(rows.slice(-60).map((q) => q.b));
    const ref = { p, b, bs, oe: med(rows.slice(-60).map((q) => q.oe)) };
    cache.set(key, ref);
    return ref;
  };
}

export function measurePassage(x: Float32Array, fs: number, ns: SwitchNote[], ref: (m: number, v: number) => Ref, trial: number, clampLo: number, clampHi: number): NoteMeasure[] {
  const out: NoteMeasure[] = [];
  for (let k = 1; k < ns.length; k++) {
    const n = ns[k];
    const pv = ns[k - 1];
    const midi = Math.max(clampLo, Math.min(clampHi, n.midi));
    const prev = Math.max(clampLo, Math.min(clampHi, pv.midi));
    const end = Math.min(k + 1 < ns.length ? ns[k + 1].on : Infinity, n.off + 0.03);
    if (end - n.on < 0.02) continue;
    const gapMs = (n.on - pv.off) * 1000;
    const how = n.on < pv.off ? 'slur' : n.on === pv.off ? 'same' : 'gap';
    const R = ref(midi, n.vel);
    const Rp = ref(prev, pv.vel);
    // (a slur or a stroke over the breath begins at the last note's level)
    const level = how === 'gap' ? R.p : Math.max(R.p, Rp.p);
    const lo = Math.min(midi, prev);
    const hi = Math.max(midi, prev);
    const fr = trackFrames(x, fs, n.on, end, et(lo), et(hi), 0.001);
    let wrong = 0;
    let crack = 0;
    let speak = (end - n.on) * 1000;
    let run = 0;
    const f = et(midi);
    const fp = et(prev);
    const near = (a: number, b: number) => Math.abs(cents(a, b)) <= 30;
    for (const q of fr) {
      const dt = q.t - n.on;
      const per = q.clear >= 0.8 && q.f > 0;
      const isNew = per && near(q.f, f);
      if (isNew) {
        if (++run >= 10 && speak === (end - n.on) * 1000) speak = Math.max(0, (dt - 0.009) * 1000);
      } else run = 0;
      if (per && q.p >= R.p / 16 && !isNew && !(dt < 0.03 && near(q.f, fp))) {
        wrong++;
        if (near(q.f, 2 * f) || near(q.f, 3 * f) || near(q.f, f / 2) || near(q.f, 1.5 * f) || near(q.f, f / 3)) crack++;
      }
    }
    // the level and the brightness at the note's harmonics (from 8 ms on: the window has left the last note)
    let peak = 0;
    let bmax = 0;
    let buzz = 0;
    for (let t = n.on + 0.008; t <= end - 0.002; t += 0.004) {
      const h = harmonics(x, fs, Math.round(t * fs), f);
      const p = hsum(h);
      peak = Math.max(peak, p);
      if (p >= R.p / 10) {
        const u = upperShare(h);
        bmax = Math.max(bmax, u);
        if (u > 2 * R.bs && oddEven(h) > R.oe + 6) buzz += 4;
      }
    }
    const c = Math.round(n.on * fs);
    let worst = 0;
    for (let i = c + 1; i < Math.min(x.length, c + Math.round(0.003 * fs)); i++) worst = Math.max(worst, Math.abs(x[i] - x[i - 1]));
    const around: number[] = [];
    for (let i = c + Math.round(0.003 * fs); i < Math.min(x.length, c + Math.round(0.043 * fs)); i++) around.push(Math.abs(x[i] - x[i - 1]));
    out.push({
      trial,
      k,
      midi,
      prev,
      vel: n.vel,
      how,
      gapMs: +gapMs.toFixed(1),
      prevHeldMs: +((n.on - pv.on) * 1000).toFixed(1),
      peakDb: +db(peak / level).toFixed(1),
      brightDb: bmax > 0 ? +db(bmax / Math.max(1e-6, R.b)).toFixed(1) : -99,
      buzzMs: buzz,
      wrongMs: wrong,
      crackMs: crack,
      speakMs: +speak.toFixed(0),
      jump: +(worst / Math.max(1e-9, pct(around, 0.99))).toFixed(2),
    });
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
  const id = opt('--instrument', 'flute') as InstrumentId;
  const fs = Number(opt('--fs', '48000'));
  const TRIALS = Number(opt('--trials', '40'));
  const NOTES = Number(opt('--notes', '14'));
  const SEED = Number(opt('--seed', '1'));
  const PARAMS = opt('--params') ? (JSON.parse(opt('--params')!) as Record<string, unknown>) : undefined;
  const WAV = opt('--wav');
  const WORST = Number(opt('--worst', '12'));
  const q = args.includes('--exact') ? null : 128 / fs;
  const TOLD = args.includes('--told');
  const render: Render = (await import(pathToFileURL(ENGINE).href)).renderInstrument;
  const ref = makeRef(render, id, fs, PARAMS);
  const { lo, hi } = INSTRUMENT_INFO[id];
  const clampLo = id === 'flute' ? 60 : lo;
  const clampHi = id === 'flute' ? 96 : hi;
  const all: NoteMeasure[] = [];
  if (WAV) mkdirSync(WAV, { recursive: true });
  for (let tr = 0; tr < TRIALS; tr++) {
    const r = rng(SEED * 1000 + tr);
    const ns = passage(id, r, NOTES, q);
    const end = ns[ns.length - 1].off + 0.4;
    const out = render({ sampleRate: fs, instrument: id, events: events(ns, TOLD), duration: end, dry: true, params: PARAMS } as never);
    const ms = measurePassage(out.left, fs, ns, ref, tr, clampLo, clampHi);
    all.push(...ms);
    if (WAV) {
      writeFileSync(join(WAV, `${id}-trial${tr}.wav`), encodeWav({ sampleRate: fs, channels: [out.left] } as never));
      writeFileSync(join(WAV, `${id}-trial${tr}.json`), JSON.stringify(ns));
    }
  }
  const by = (how: string) => all.filter((m) => how === 'all' || m.how === how);
  console.log(`engine ${ENGINE} · ${id} · ${TRIALS}×${NOTES} notes · seed ${SEED}${q ? ' · on the quantum' : ' · exact'}${TOLD ? ' · told ahead' : ' · by hand'}${PARAMS ? ` · ${JSON.stringify(PARAMS)}` : ''}`);
  console.log('how    n    peak dB (p50/p99/max)   bright dB (p50/p99/max)  >+3 dB   buzz ms (p90/max, >20)   wrong ms>10   crack>5   speak ms p90   jump>4');
  for (const how of ['slur', 'same', 'gap', 'all']) {
    const s = by(how);
    if (!s.length) continue;
    const P = s.map((m) => m.peakDb);
    const B = s.map((m) => m.brightDb);
    console.log(
      `${how.padEnd(5)} ${String(s.length).padStart(4)}   ${med(P).toFixed(1).padStart(5)} ${pct(P, 0.99).toFixed(1).padStart(5)} ${Math.max(...P).toFixed(1).padStart(5)}        ${med(B).toFixed(1).padStart(5)} ${pct(B, 0.99).toFixed(1).padStart(5)} ${Math.max(...B).toFixed(1).padStart(6)}    ${String(s.filter((m) => m.brightDb > 3 || m.peakDb > 3).length).padStart(4)}     ${pct(s.map((m) => m.buzzMs), 0.9).toFixed(0).padStart(4)} ${Math.max(...s.map((m) => m.buzzMs)).toFixed(0).padStart(4)} ${String(s.filter((m) => m.buzzMs > 20).length).padStart(4)}          ${String(s.filter((m) => m.wrongMs > 10).length).padStart(4)}       ${String(s.filter((m) => m.crackMs > 5).length).padStart(4)}       ${pct(s.map((m) => m.speakMs), 0.9).toFixed(0).padStart(4)}        ${String(s.filter((m) => m.jump > 4).length).padStart(4)}`,
    );
  }
  if (!args.includes('--quiet')) {
    const score = (m: NoteMeasure) => Math.max(0, m.peakDb) * 2 + m.buzzMs / 4 + m.wrongMs / 5 + Math.max(0, m.jump - 3);
    const worst = [...all].sort((a, b) => score(b) - score(a)).slice(0, WORST);
    console.log('\nworst:');
    for (const m of worst) console.log(`  trial ${m.trial} #${m.k} ${noteName(m.prev)}→${noteName(m.midi)} v${m.vel} ${m.how} ${m.gapMs}ms (prev held ${m.prevHeldMs}) peak ${m.peakDb} dB bright ${m.brightDb} dB buzz ${m.buzzMs} ms wrong ${m.wrongMs} (crack ${m.crackMs}) speak ${m.speakMs} jump ${m.jump}`);
  }
  if (opt('--json')) writeFileSync(opt('--json')!, JSON.stringify(all, null, 1));
}
