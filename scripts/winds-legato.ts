// A wind going from one note to the next, measured in the milliseconds where it happens.
//   npx tsx scripts/winds-legato.ts [--engine <old>/packages/engine/src/core/index.ts] [--instrument flute]
//       [--fs 48000] [--len 0.12,0.25,0.5] [--vel 44,80,112] [--art slur,join,gap] [--hand] [--rows] [--json out.json]
//       [--trace 67,69,slur,80,0.25]   (one case, every millisecond: level dB, pitch in cents of the new note, periodicity)
//       [--params '{"human":0}']
//       [--fresh]   (no pairs: every note of the compass alone, from silence, at six dynamics, told ahead as
//                    lasting 140, 280 and 500 ms and, by hand, 280 ms: is it on its own pitch over its second half?)
// Each case is two notes (scripts/winds-legato-lib.ts pairEvents), sent as the file player sends them (told
// ahead: `foresee`) or, with --hand, as a keyboard does: slurred (the first held 30 ms into the second),
// joined (the first ends where the second begins: what a file's legato usually is) or with 50 ms between.
// The pairs: steps, thirds and leaps within each register of the instrument and across its breaks, up and down.
// What is measured (measureJoin): the hole in the level, when the new note has spoken, how long something
// sounds that is neither note, a wrong register, the pitch's overshoot, the click at the join.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { INSTRUMENT_INFO, type InstrumentId } from '../packages/engine/src/core/instrument.ts';
import { cents, db, et, measureJoin, med, noteName, pairEvents, pct, trackFrames, type Join, type JoinMeasure } from './winds-legato-lib.ts';

type Render = typeof import('../packages/engine/src/core/index.ts').renderInstrument;

/** the pairs for an instrument: from the bottom to the top of its compass, steps (1, 2), thirds (3, 4), a
 *  fourth, a fifth, a sixth and an octave, up and down, at seven places */
export function pairsFor(id: InstrumentId): [number, number][] {
  const { lo, hi } = INSTRUMENT_INFO[id];
  const out: [number, number][] = [];
  const steps = [1, 2, 3, 4, 5, 7, 9, 12];
  for (let k = 0; k < 7; k++) {
    const base = Math.round(lo + 2 + ((hi - lo - 16) * k) / 6);
    for (const s of steps) {
      if (base + s > hi) continue;
      out.push([base, base + s], [base + s, base]);
    }
  }
  return out;
}

export interface LegatoCase extends JoinMeasure {
  instrument: string;
  from: number;
  to: number;
  art: Join;
  vel: number;
  len: number;
  fs: number;
}

export function legatoCase(render: Render, id: InstrumentId, fs: number, from: number, to: number, art: Join, vel: number, len: number, hand: boolean, params?: Record<string, unknown>): LegatoCase {
  const { events, t0, t1, end } = pairEvents(from, to, art, vel, len, hand);
  const r = render({ sampleRate: fs, instrument: id, events, duration: end + 0.2, dry: true, params } as never);
  const { m } = measureJoin(r.left, fs, from, to, t0, t1, end);
  return { instrument: id, from, to, art, vel, len, fs, ...m };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
  const IDS = opt('--instrument', 'flute')!.split(',') as InstrumentId[];
  const RATES = opt('--fs', '48000')!.split(',').map(Number);
  const LENS = opt('--len', '0.12,0.25,0.5')!.split(',').map(Number);
  const VELS = opt('--vel', '44,80,112')!.split(',').map(Number);
  const ARTS = opt('--art', 'slur,join,gap')!.split(',') as Join[];
  const HAND = args.includes('--hand');
  const PARAMS = opt('--params') ? (JSON.parse(opt('--params')!) as Record<string, unknown>) : undefined;
  const render: Render = (await import(pathToFileURL(ENGINE).href)).renderInstrument;
  console.log(`engine ${ENGINE}${HAND ? ' (by hand: nothing foreseen)' : ''}${PARAMS ? ` ${JSON.stringify(PARAMS)}` : ''}`);

  if (args.includes('--fresh')) {
    let off = 0;
    let all = 0;
    for (const id of IDS) {
      const { lo, hi } = INSTRUMENT_INFO[id];
      for (const fs of RATES)
        for (const [len, told] of [[0.14, true], [0.28, true], [0.5, true], [0.28, false]] as [number, boolean][]) {
          const bad: string[] = [];
          let n = 0;
          for (let m = lo; m <= hi; m++)
            for (const vel of [30, 44, 60, 80, 100, 118]) {
              const events = [...(told ? [{ time: 0.1, event: { type: 'foresee', midi: m, velocity: vel, dur: len } }] : []), { time: 0.1, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 0.1 + len, event: { type: 'noteOff', midi: m } }];
              const r = render({ sampleRate: fs, instrument: id, events: events as never, duration: len + 0.3, dry: true, params: PARAMS } as never);
              const c = med(trackFrames(r.left, fs, 0.1 + 0.5 * len, 0.1 + 0.95 * len, et(m), et(m), 0.003).filter((q) => q.clear > 0.5).map((q) => cents(q.f, et(m))));
              n++;
              if (!(Math.abs(c) <= 40)) bad.push(`${noteName(m)}/v${vel}:${Number.isFinite(c) ? c.toFixed(0) : '–'}`);
            }
          if (told) {
            off += bad.length;
            all += n;
          }
          console.log(`${id} ${fs} ${told ? 'told ahead' : 'by hand'}, ${len * 1000} ms: ${bad.length} of ${n} not on their pitch (40 ¢) over their second half${bad.length ? `: ${bad.join(' ')}` : ''}`);
        }
    }
    console.log(`told ahead, in all: ${off} of ${all}`);
    process.exit(0);
  }

  if (opt('--trace')) {
    const [a, b, art, vel, len] = opt('--trace')!.split(',');
    const id = IDS[0];
    const fs = RATES[0];
    const from = Number(a);
    const to = Number(b);
    const { events, t0, t1, end } = pairEvents(from, to, art as Join, Number(vel ?? 80), Number(len ?? 0.25), HAND);
    const r = render({ sampleRate: fs, instrument: id, events, duration: end + 0.2, dry: true, params: PARAMS } as never);
    const { m, frames } = measureJoin(r.left, fs, from, to, t0, t1, end);
    console.log(`${id} ${noteName(from)}→${noteName(to)} ${art} v${vel} ${len} s`, JSON.stringify(m));
    const ref = Math.max(...frames.map((q) => q.p));
    console.log('   ms   level dB   cents of new   periodic');
    for (const q of frames) {
      const dt = Math.round((q.t - t1) * 1000);
      if (dt < -12 || dt > 90) continue;
      const lv = db(q.p / ref);
      console.log(`${`${dt}`.padStart(5)}  ${lv.toFixed(1).padStart(7)}  ${(Number.isFinite(cents(q.f, et(to))) ? cents(q.f, et(to)).toFixed(0) : '–').padStart(8)}       ${q.clear.toFixed(2)}  ${'#'.repeat(Math.max(0, Math.round(40 + lv)))}`);
    }
    process.exit(0);
  }

  const all: LegatoCase[] = [];
  for (const id of IDS)
    for (const fs of RATES)
      for (const [from, to] of pairsFor(id)) for (const art of ARTS) for (const vel of VELS) for (const len of LENS) all.push(legatoCase(render, id, fs, from, to, art, vel, len, HAND, PARAMS));

  const f = (v: number, w = 6, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–').padStart(w);
  const line = (name: string, c: LegatoCase[]) =>
    `${name.padEnd(22)}${`${c.length}`.padStart(5)} | hole dB med${f(med(c.map((x) => x.dipDb)))} p10${f(pct(c.map((x) => x.dipDb), 0.1))} | hole ms med${f(med(c.map((x) => x.dipMs)), 5, 0)} p90${f(pct(c.map((x) => x.dipMs), 0.9), 5, 0)} | speak ms med${f(med(c.map((x) => x.speakMs)), 5, 0)} p90${f(pct(c.map((x) => x.speakMs), 0.9), 5, 0)} | neither ms med${f(med(c.map((x) => x.betweenMs)), 5, 0)} p90${f(pct(c.map((x) => x.betweenMs), 0.9), 5, 0)} | crack>10ms${`${c.filter((x) => x.crackMs > 10).length}`.padStart(5)} | over ¢ p90${f(pct(c.map((x) => x.overCents), 0.9), 5, 0)} | click× p90${f(pct(c.map((x) => x.jump), 0.9), 5, 2)} max${f(Math.max(...c.map((x) => x.jump)), 6, 2)} | rise dB/ms med${f(med(c.map((x) => x.riseDbMs)), 5, 2)}`;
  for (const id of IDS)
    for (const fs of RATES) {
      console.log(`\n${id}, ${fs} Hz`);
      const mine = all.filter((x) => x.instrument === id && x.fs === fs);
      for (const art of ARTS) {
        console.log(line(`${art}`, mine.filter((x) => x.art === art)));
        for (const len of LENS) console.log(line(`  ${art} ${Math.round(len * 1000)} ms`, mine.filter((x) => x.art === art && x.len === len)));
        for (const vel of VELS) console.log(line(`  ${art} velocity ${vel}`, mine.filter((x) => x.art === art && x.vel === vel)));
      }
    }
  if (args.includes('--rows')) {
    console.log('\npair            art    hole dB (worst)  speak ms (med, max)  neither ms (max)  crack ms (max)  click× (max)');
    for (const id of IDS)
      for (const [from, to] of pairsFor(id))
        for (const art of ARTS) {
          const c = all.filter((x) => x.instrument === id && x.from === from && x.to === to && x.art === art);
          console.log(`${`${noteName(from)}→${noteName(to)}`.padEnd(15)} ${art.padEnd(6)} ${f(Math.min(...c.map((x) => x.dipDb)), 9)}        ${f(med(c.map((x) => x.speakMs)), 7, 0)} ${f(Math.max(...c.map((x) => x.speakMs)), 7, 0)}        ${f(Math.max(...c.map((x) => x.betweenMs)), 7, 0)}        ${f(Math.max(...c.map((x) => x.crackMs)), 7, 0)}        ${f(Math.max(...c.map((x) => x.jump)), 6, 2)}`);
        }
  }
  if (opt('--json')) writeFileSync(opt('--json')!, JSON.stringify(all));
}
