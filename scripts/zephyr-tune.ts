// The zephyr, note by note (there is no recording to judge it by: these are the model's own numbers).
//
//   npx tsx scripts/zephyr-tune.ts                 a table: every sixth string at pp, mf and ff: its pitch (¢
//                                                  from the note), how long it takes to speak (to half and to
//                                                  nine tenths of its level), its level, its first harmonics
//   npx tsx scripts/zephyr-tune.ts --write         measures every string untuned at mezzo-forte and writes
//                                                  packages/engine/src/core/zephyr-tuning.json (what each is
//                                                  drawn sharp by so that its note is on its pitch)
//   --fs 44100   --every 1   --human 0|1 (the table; the tuning is always the model alone)
//
// The pitch is read from the fundamental's phase: the signal against a sine at the note's own frequency over
// two Hann windows; what the phase has turned between them is how far the note is from it.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZEPHYR_LO, ZEPHYR_STRINGS, renderInstrument, zephyrStrings } from '../packages/engine/src/core/index.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const FS = Number(opt('--fs') ?? 48000);
const EVERY = Number(opt('--every') ?? 6);
const HUMAN = Number(opt('--human') ?? 0);
const TILT = opt('--tilt');
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** the fundamental's phase and level about f over [t0, t0 + win) */
function demod(x: Float32Array, fs: number, f: number, t0: number, win: number): { ph: number; amp: number } {
  const n0 = Math.round(t0 * fs);
  const n = Math.round(win * fs);
  let re = 0;
  let im = 0;
  let ws = 0;
  for (let k = 0; k < n; k++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * k) / n);
    const ph = (2 * Math.PI * f * k) / fs;
    re += w * x[n0 + k] * Math.cos(ph);
    im -= w * x[n0 + k] * Math.sin(ph);
    ws += w;
  }
  return { ph: Math.atan2(im, re), amp: (2 * Math.hypot(re, im)) / ws };
}

/** a note's pitch (¢ from f) over its steady part */
export function centsFrom(x: Float32Array, fs: number, f: number, t0: number, t1: number): number {
  const win = Math.max(0.12, 12 / f);
  const hop = Math.min(0.05, 0.25 / (f * 0.03));
  let f0 = f;
  // (twice: the second pass about the first's answer, so that a note 30 ¢ out is read as well as one on it)
  for (let pass = 0; pass < 2; pass++) {
    let sum = 0;
    let cnt = 0;
    for (let t = t0; t + hop + win <= t1; t += hop) {
      const a = demod(x, fs, f0, t, win);
      const b = demod(x, fs, f0, t + hop, win);
      let d = b.ph - a.ph - 2 * Math.PI * f0 * hop;
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      sum += d / (2 * Math.PI * hop);
      cnt++;
    }
    f0 += cnt ? sum / cnt : 0;
  }
  return 1200 * Math.log2(f0 / f);
}

function note(midi: number, vel: number, params: Record<string, unknown>, hold = 1.6) {
  const out = renderInstrument({ sampleRate: FS, instrument: 'zephyr', dry: true, params: params as never, events: [{ time: 0.05, event: { type: 'noteOn', midi, velocity: vel } }, { time: 0.05 + hold, event: { type: 'noteOff', midi } }], duration: hold + 0.6 });
  return out.left;
}

/** the envelope (rms over 1.5 periods), and when it first reaches a share of its steady level (s from the key) */
function speaks(x: Float32Array, f: number, hold: number): { t50: number; t90: number; level: number; off: number; over: number } {
  const w = Math.max(64, Math.round((1.5 * FS) / f));
  const env: number[] = [];
  const hop = Math.round(FS / 1000);
  for (let n = 0; n + w < x.length; n += hop) {
    let s = 0;
    for (let k = 0; k < w; k++) s += x[n + k] * x[n + k];
    env.push(Math.sqrt(s / w));
  }
  const at = (t: number) => env[Math.min(env.length - 1, Math.round(((t + 0.05) * FS) / hop))];
  let level = 0;
  let c = 0;
  for (let t = hold * 0.6; t < hold * 0.95; t += 0.01) {
    level += at(t);
    c++;
  }
  level /= c;
  const first = (share: number) => {
    for (let k = Math.round((0.05 * FS) / hop); k < env.length; k++) if (env[k] >= share * level) return (k * hop + w / 2) / FS - 0.05;
    return NaN;
  };
  // how long after the key is let go the note is 20 dB down
  let off = NaN;
  for (let k = Math.round(((0.05 + hold) * FS) / hop); k < env.length; k++)
    if (env[k] < 0.1 * level) {
      off = (k * hop + w / 2) / FS - 0.05 - hold;
      break;
    }
  let top = 0;
  for (let t = 0; t < 0.5; t += 0.002) top = Math.max(top, at(t));
  return { t50: first(0.5), t90: first(0.9), level, off, over: 20 * Math.log10(top / level) };
}

const strings = zephyrStrings();
if (args.includes('--write')) {
  const cents: number[] = [];
  for (let i = 0; i < ZEPHYR_STRINGS; i++) {
    const m = ZEPHYR_LO + i;
    // (two passes: the string drawn sharp by what it was flat, then by what is left)
    let up = 0;
    for (let pass = 0; pass < 3; pass++) {
      const out = renderInstrument({ sampleRate: 48000, instrument: 'zephyr', dry: true, params: { human: 0, untuned: true } as never, events: [{ time: 0, event: { type: 'bend', value: up / 100 } }, { time: 0.05, event: { type: 'noteOn', midi: m, velocity: 75 } }], duration: 1.9 });
      up -= centsFrom(out.left, 48000, et(m), 0.9, 1.85);
    }
    cents.push(Math.round(up * 100) / 100);
    process.stdout.write(`${strings[i].name} ${up.toFixed(1)}  `);
  }
  writeFileSync(resolve(import.meta.dirname, '../packages/engine/src/core/zephyr-tuning.json'), JSON.stringify({ note: 'What each string is drawn sharp by (cents) so that its note is on its pitch at mezzo-forte: scripts/zephyr-tune.ts --write', cents }) + '\n');
  console.log('\nwritten');
} else {
  console.log(`fs ${FS}, human ${HUMAN}`);
  console.log('string   L mm  D mm   Q   wind |  dyn   cents   t50 ms  t90 ms  off ms  over dB  level dB   h2   h3   h4   h5   h8  (dB re h1)');
  for (let i = 0; i < ZEPHYR_STRINGS; i += EVERY) {
    const s = strings[i];
    const f = et(s.midi);
    for (const [name, vel] of [['pp', 20], ['mf', 75], ['ff', 120]] as const) {
      const x = note(s.midi, vel, { human: HUMAN, ...(TILT ? { tilt: Number(TILT) } : {}) });
      const sp = speaks(x, f, 1.6);
      const c = centsFrom(x, FS, f, 0.9, 1.6);
      const h = (k: number) => (k * f < 0.45 * FS ? demod(x, FS, k * f * Math.pow(2, c / 1200), 1.0, 0.4).amp : 0);
      const h1 = h(1);
      const db = (k: number) => (h(k) > 0 ? (20 * Math.log10(h(k) / h1)).toFixed(0) : '  ·').padStart(4);
      console.log(`${s.name.padEnd(4)} ${(s.length * 1000).toFixed(0).padStart(7)} ${(s.width * 1000).toFixed(2).padStart(5)} ${s.Q.toFixed(0).padStart(4)} ${s.wind.toFixed(1).padStart(6)} |  ${name}  ${c.toFixed(1).padStart(6)}  ${(sp.t50 * 1000).toFixed(0).padStart(6)}  ${(sp.t90 * 1000).toFixed(0).padStart(6)}  ${(sp.off * 1000).toFixed(0).padStart(6)}  ${sp.over.toFixed(1).padStart(6)}   ${(20 * Math.log10(sp.level)).toFixed(1).padStart(7)}   ${db(2)} ${db(3)} ${db(4)} ${db(5)} ${db(8)}`);
    }
  }
}
