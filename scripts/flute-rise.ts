// The flute stepping and leaping UP across its register breaks (flute.ts fluteFingering: the octave from D5,
// the twelfth from D6), note by note: does the upper note speak on its own mode of the tube, how soon, and
// what is heard before it does (the tube's other modes, the last note's ring, noise).
//   npx tsx scripts/flute-rise.ts [--engine <old>/packages/engine/src/core/index.ts] [--fs 48000,44100]
//       [--len 0.1,0.15,0.3,0.6] [--vel 40,80,118] [--art slur,tongue] [--hand] [--list] [--rows] [--json out.json]
//       [--seq '[[85,86],[81,88]]'] [--also falls]
// Each case is two notes sent as the file player sends them (told ahead: `foresee`; --hand: not told, as a
// keyboard's): the lower one (at least 200 ms, so that it sounds), then the upper one for --len, slurred (the
// lower held 30 ms into it) or tongued (it ends where the upper begins). Per case, from the dry render, in
// Hann windows of six periods of the upper note's tube (its fingering's fundamental) every 2.5 ms:
//   mode   the tube's mode that carries the upper note over its 40–90 % (the largest j whose multiples hold
//          85 % of the power at the tube's harmonics); right where it is the fingering's
//   own    the share of the window's power on the note's own harmonics, over the same span
//   speak  ms from the note's beginning until its own harmonics hold 70 % of the power and are within 6 dB of
//          the same note held alone (1.2 s), for 15 ms on; the note's whole length if never
//   burst  what is not the note (the window's power less its own harmonics') from 15 ms after its beginning:
//          its highest level against the held note (dB), and for how long it is both over the note's own
//          harmonics and within 12 dB of the held note (ms): a crack
// A case fails if its mode is wrong, its own share is under 0.7, or it stays 12 dB under the held note.
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { TimedEvent } from '../packages/engine/src/core/render.ts';
import { fluteFingering } from '../packages/engine/src/core/flute.ts';

type Render = typeof import('../packages/engine/src/core/index.ts').renderInstrument;

const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const db = (x: number) => 10 * Math.log10(Math.max(1e-18, x));
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

/** the rises: [from, to], by the break they cross */
export const RISES: Record<string, [number, number][]> = {
  // first → second register (C♯5 | D5)
  'I→II': [[73, 74], [72, 74], [73, 75], [71, 74], [72, 76], [73, 76], [69, 74], [72, 77], [67, 74], [72, 79], [62, 74], [64, 76], [69, 81], [72, 84]],
  // second → third (C♯6 | D6)
  'II→III': [[85, 86], [84, 86], [85, 87], [83, 86], [84, 87], [85, 88], [81, 86], [84, 89], [79, 86], [81, 88], [83, 88], [84, 91], [79, 91], [74, 86], [76, 88], [81, 93]],
  // first → third, and on up to the top
  'I→III': [[72, 86], [67, 86], [72, 88], [73, 91]],
  'top': [[86, 88], [88, 91], [91, 93], [93, 96], [89, 96], [84, 93], [85, 96], [84, 96]],
};
/** the same breaks coming down (what #59 cured), to see that nothing is lost */
export const FALLS: [number, number][] = [[86, 85], [86, 84], [88, 85], [91, 84], [88, 81], [74, 73], [74, 72], [76, 73], [79, 67], [88, 72], [93, 79], [86, 79], [90, 83], [96, 91], [93, 88]];

export interface RiseCase {
  group: string;
  from: number;
  to: number;
  art: 'slur' | 'tongue';
  vel: number;
  len: number;
  fs: number;
  mode: number;
  want: number;
  own: number;
  reach: number;
  speak: number;
  burstDb: number;
  burstMs: number;
  fail: boolean;
}

/** one window: the power at each of the tube's harmonics k·fb (k = 1…K) and the window's whole power */
function tubeAt(x: Float32Array, fs: number, fb: number, c: number, W: number, K: number, H: Float64Array): number {
  const a = c - (W >> 1);
  let sw = 0;
  let sw2 = 0;
  let tot = 0;
  for (let i = 0; i < W; i++) {
    const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / W);
    const v = a + i >= 0 && a + i < x.length ? x[a + i] : 0;
    sw += h;
    sw2 += h * h;
    tot += h * h * v * v;
  }
  for (let k = 1; k <= K; k++) {
    const w = (2 * Math.PI * k * fb) / fs;
    let re = 0;
    let im = 0;
    for (let i = 0; i < W; i++) {
      const v = a + i >= 0 && a + i < x.length ? x[a + i] : 0;
      const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / W);
      re += v * h * Math.cos(w * i);
      im += v * h * Math.sin(w * i);
    }
    const amp = (2 * Math.hypot(re, im)) / sw;
    H[k - 1] = (amp * amp) / 2;
  }
  return tot / sw2;
}

/** a note's frames from sample a to b: its own harmonics' power, the rest, and the tube's mode it is on */
export function trackNote(x: Float32Array, fs: number, midi: number, a: number, b: number): { c: number; own: number; rest: number; mode: number }[] {
  const { mode, boreMidi } = fluteFingering(midi);
  const fb = et(boreMidi);
  const W = Math.round((6 / fb) * fs);
  const K = Math.min(18, Math.floor((0.45 * fs) / fb));
  const H = new Float64Array(K);
  const hop = Math.round(0.0025 * fs);
  const out: { c: number; own: number; rest: number; mode: number }[] = [];
  for (let c = a; c <= b; c += hop) {
    const tot = tubeAt(x, fs, fb, c, W, K, H);
    let own = 0;
    let all = 0;
    for (let k = 1; k <= K; k++) {
      all += H[k - 1];
      if (k % mode === 0) own += H[k - 1];
    }
    let on = 1;
    for (let j = 6; j >= 2; j--) {
      let s = 0;
      for (let k = j; k <= K; k += j) s += H[k - 1];
      if (all > 0 && s / all >= 0.85) {
        on = j;
        break;
      }
    }
    out.push({ c, own, rest: Math.max(0, tot - own), mode: on });
  }
  return out;
}

/** the power of a note held alone (1.2 s, dry, nothing foreseen) on its own harmonics, kept per pitch and strength */
export function heldPower(render: Render, fs: number): (midi: number, vel: number) => number {
  const memo = new Map<string, number>();
  return (midi, vel) => {
    const k = `${midi}:${vel}`;
    let p = memo.get(k);
    if (p === undefined) {
      const r = render({ sampleRate: fs, instrument: 'flute', events: [{ time: 0.05, event: { type: 'noteOn', midi, velocity: vel } }, { time: 1.25, event: { type: 'noteOff', midi } }], duration: 1.3, dry: true });
      const fr = trackNote(r.left, fs, midi, Math.round(0.6 * fs), Math.round(1.1 * fs));
      p = fr.map((f) => f.own).sort((u, v) => u - v)[fr.length >> 1];
      memo.set(k, p);
    }
    return p;
  };
}

export function riseEvents(from: number, to: number, art: 'slur' | 'tongue', vel: number, len: number, hand: boolean): { events: TimedEvent[]; t1: number; end: number } {
  const t0 = 0.1;
  const first = Math.max(len, 0.2);
  const t1 = t0 + first;
  const over = art === 'slur' ? 0.03 : 0;
  const ev: TimedEvent[] = [
    { time: t0, event: { type: 'noteOn', midi: from, velocity: vel } },
    { time: t1 + over, event: { type: 'noteOff', midi: from } },
    { time: t1, event: { type: 'noteOn', midi: to, velocity: vel } },
    { time: t1 + len, event: { type: 'noteOff', midi: to } },
  ];
  // (a file's order at one instant: the ends first)
  ev.sort((p, q) => p.time - q.time || (p.event.type === 'noteOff' ? 0 : 1) - (q.event.type === 'noteOff' ? 0 : 1));
  const fore: TimedEvent[] = hand
    ? []
    : [
        { time: t0, event: { type: 'foresee', midi: from, velocity: vel, dur: first + over } as never },
        { time: t1, event: { type: 'foresee', midi: to, velocity: vel, dur: len } as never },
      ];
  return { events: [...fore, ...ev], t1, end: t1 + len };
}

export function riseCase(render: Render, held: (m: number, v: number) => number, fs: number, group: string, from: number, to: number, art: 'slur' | 'tongue', vel: number, len: number, hand = false): RiseCase {
  const { events, t1, end } = riseEvents(from, to, art, vel, len, hand);
  const r = render({ sampleRate: fs, instrument: 'flute', events, duration: end + 0.25, dry: true });
  const a = Math.round(t1 * fs);
  const b = Math.round(end * fs);
  const fr = trackNote(r.left, fs, to, a, b);
  const ref = held(to, vel);
  const want = fluteFingering(to).mode;
  const body = fr.filter((f) => f.c >= a + 0.4 * (b - a) && f.c <= a + 0.9 * (b - a));
  const med = (v: number[]) => [...v].sort((p, q) => p - q)[v.length >> 1];
  const own = med(body.map((f) => f.own / Math.max(1e-18, f.own + f.rest)));
  const reach = db(med(body.map((f) => f.own)) / ref);
  // (the mode most of the body's frames are on)
  const votes = new Map<number, number>();
  for (const f of body) votes.set(f.mode, (votes.get(f.mode) ?? 0) + 1);
  const mode = [...votes.entries()].sort((p, q) => q[1] - p[1])[0][0];
  const good = (f: { own: number; rest: number }) => f.own >= 0.7 * (f.own + f.rest) && f.own >= 0.25 * ref;
  const hold = 6; // frames: 15 ms
  let speak = len;
  for (let j = 0; j < fr.length; j++) {
    let ok = true;
    for (let q = j; q < Math.min(fr.length, j + hold + 1); q++) if (!good(fr[q])) ok = false;
    if (ok) {
      speak = (fr[j].c - a) / fs;
      break;
    }
  }
  let burst = 0;
  let burstN = 0;
  for (const f of fr) {
    if (f.c < a + 0.015 * fs) continue;
    burst = Math.max(burst, f.rest);
    if (f.rest > f.own && f.rest > ref / 16) burstN++;
  }
  return {
    group, from, to, art, vel, len, fs, mode, want,
    own: +own.toFixed(2),
    reach: +reach.toFixed(1),
    speak: +(speak * 1000).toFixed(1),
    burstDb: +db(burst / ref).toFixed(1),
    burstMs: +(burstN * 2.5).toFixed(1),
    fail: mode !== want || own < 0.7 || reach < -12,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
  const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts'))!);
  const RATES = opt('--fs', '48000,44100')!.split(',').map(Number);
  const LENS = opt('--len', '0.1,0.15,0.3,0.6')!.split(',').map(Number);
  const VELS = opt('--vel', '40,80,118')!.split(',').map(Number);
  const ARTS = opt('--art', 'slur,tongue')!.split(',') as ('slur' | 'tongue')[];
  const HAND = args.includes('--hand');
  const LIST = args.includes('--list');
  const ROWS = args.includes('--rows');
  const groups: Record<string, [number, number][]> = opt('--seq') ? { seq: JSON.parse(opt('--seq')!) } : { ...RISES };
  if (opt('--also') === 'falls') groups.falls = FALLS;
  const render: Render = (await import(pathToFileURL(ENGINE).href)).renderInstrument;
  const all: RiseCase[] = [];
  for (const fs of RATES) {
    const held = heldPower(render, fs);
    for (const [group, pairs] of Object.entries(groups))
      for (const [from, to] of pairs) for (const art of ARTS) for (const vel of VELS) for (const len of LENS) all.push(riseCase(render, held, fs, group, from, to, art, vel, len, HAND));
  }
  const med = (v: number[]) => (v.length ? [...v].sort((p, q) => p - q)[v.length >> 1] : NaN);
  const p90 = (v: number[]) => (v.length ? [...v].sort((p, q) => p - q)[Math.min(v.length - 1, Math.floor(0.9 * v.length))] : NaN);
  const line = (name: string, c: RiseCase[]) =>
    `${name.padEnd(26)} ${`${c.filter((x) => x.fail).length}`.padStart(4)} of ${`${c.length}`.padStart(4)} fail | wrong mode ${`${c.filter((x) => x.mode !== x.want).length}`.padStart(4)} | speak ms med ${`${med(c.map((x) => x.speak))}`.padStart(5)} p90 ${`${p90(c.map((x) => x.speak))}`.padStart(5)} | crack ms med ${`${med(c.map((x) => x.burstMs))}`.padStart(5)} p90 ${`${p90(c.map((x) => x.burstMs))}`.padStart(5)} | burst dB med ${`${med(c.map((x) => x.burstDb))}`.padStart(6)} max ${`${Math.max(...c.map((x) => x.burstDb))}`.padStart(6)}`;
  console.log(`engine ${ENGINE}${HAND ? ' (by hand: nothing foreseen)' : ''}`);
  for (const fs of RATES) {
    console.log(`\n${fs} Hz`);
    for (const group of Object.keys(groups))
      for (const art of ARTS) console.log(line(`${group} ${art}`, all.filter((x) => x.fs === fs && x.group === group && x.art === art)));
    for (const len of LENS) console.log(line(`  all, ${Math.round(len * 1000)} ms`, all.filter((x) => x.fs === fs && x.len === len && x.group !== 'falls')));
    for (const vel of VELS) console.log(line(`  all, velocity ${vel}`, all.filter((x) => x.fs === fs && x.vel === vel && x.group !== 'falls')));
    console.log(line('  all rises', all.filter((x) => x.fs === fs && x.group !== 'falls')));
  }
  if (ROWS) {
    // one row per rise and articulation: fails of the dynamics × lengths, worst speak, worst crack
    console.log('\nrise            art     fs     fail  wrong  speak ms (med, max)  crack ms (max)  burst dB (max)');
    for (const fs of RATES)
      for (const [group, pairs] of Object.entries(groups))
        for (const [from, to] of pairs)
          for (const art of ARTS) {
            const c = all.filter((x) => x.fs === fs && x.group === group && x.from === from && x.to === to && x.art === art);
            console.log(`${`${noteName(from)}→${noteName(to)}`.padEnd(15)} ${art.padEnd(7)} ${fs}  ${`${c.filter((x) => x.fail).length}/${c.length}`.padStart(5)}  ${`${c.filter((x) => x.mode !== x.want).length}`.padStart(5)}  ${`${med(c.map((x) => x.speak))}`.padStart(7)} ${`${Math.max(...c.map((x) => x.speak))}`.padStart(7)}       ${`${Math.max(...c.map((x) => x.burstMs))}`.padStart(7)}        ${`${Math.max(...c.map((x) => x.burstDb))}`.padStart(6)}`);
          }
  }
  if (LIST)
    for (const x of all.filter((y) => y.fail))
      console.log(`  ${x.fs} ${noteName(x.from)}→${noteName(x.to)} ${x.art} v${x.vel} ${Math.round(x.len * 1000)} ms: mode ${x.mode} (want ${x.want}) own ${x.own} reach ${x.reach} dB speak ${x.speak} ms crack ${x.burstMs} ms burst ${x.burstDb} dB`);
  if (opt('--json')) writeFileSync(opt('--json')!, JSON.stringify(all));
}
