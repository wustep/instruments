// Does an instrument's player cost it its notes? Every note of the compass at three dynamics, by several
// players (each his own stream), held 0.9 s by hand and, with --short, as a file's short note (0.12 s, told
// ahead): is it on its pitch (within 50 ¢ over its last 0.25 s, or the short note's own middle) and there at
// all (within 15 dB of the model alone)? With the player (`human` 1) beside the model alone (`human` 0): a
// player must add no wrong note.
//   npx tsx scripts/player-regimes.ts --instrument horn,trumpet [--players 6] [--short] [--step 1]
import { INSTRUMENT_INFO, renderInstrument, midiName, type InstrumentId, type TimedEvent } from '../packages/engine/src/core/index.ts';

const args = process.argv.slice(2);
const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const ids = (opt('--instrument') ?? 'horn,trumpet').split(',') as InstrumentId[];
const PLAYERS = Number(opt('--players') ?? 6);
const SHORT = args.includes('--short');
const STEP = Number(opt('--step') ?? 1);
const FS = 48000;

/** the pitch of x[a..b) near f (Hz), by the normalised autocorrelation's peak within ±3 semitones; and its RMS */
function pitchNear(x: Float32Array, a: number, b: number, f: number): { cents: number; rms: number; clarity: number } {
  let e = 0;
  for (let i = a; i < b; i++) e += x[i] * x[i];
  const rms = Math.sqrt(e / Math.max(1, b - a));
  const lo = Math.floor(FS / (f * 2 ** (7 / 12)));
  const hi = Math.ceil(FS / (f * 2 ** (-7 / 12)));
  const n = b - a - hi;
  if (n < 64) return { cents: NaN, rms, clarity: 0 };
  let best = -1, bl = lo;
  const r: number[] = [];
  for (let L = lo; L <= hi; L++) {
    let s = 0, p = 0, q = 0;
    for (let i = a; i < a + n; i++) { s += x[i] * x[i + L]; p += x[i] * x[i]; q += x[i + L] * x[i + L]; }
    const v = (2 * s) / (p + q + 1e-30);
    r.push(v);
    if (v > best) { best = v; bl = L; }
  }
  const k = bl - lo;
  let lag = bl;
  if (k > 0 && k < r.length - 1) { const d = r[k - 1] - 2 * r[k] + r[k + 1]; if (d < 0) lag += (0.5 * (r[k - 1] - r[k + 1])) / d; }
  return { cents: 1200 * Math.log2(FS / lag / f), rms, clarity: best };
}

for (const id of ids) {
  const info = INSTRUMENT_INFO[id];
  for (const human of [0, 1]) {
    let n = 0, wrong = 0, weak = 0;
    const bad: string[] = [];
    for (const vel of [30, 70, 112]) {
      for (let m = info.lo; m <= info.hi; m += STEP) {
        for (let pl = 0; pl < (human ? PLAYERS : 1); pl++) {
          const f = 440 * 2 ** ((m - 69) / 12);
          const len = SHORT ? 0.12 : 0.9;
          const events: TimedEvent[] = [];
          // (a few notes before it, so the player's stream is somewhere new each time)
          if (SHORT) events.push({ time: 0.2, event: { type: 'foresee', midi: m, velocity: vel, dur: len } as never });
          events.push({ time: 0.3, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 0.3 + len, event: { type: 'noteOff', midi: m } });
          const o = renderInstrument({ sampleRate: FS, instrument: id, dry: true, player: pl, params: { human } as never, events, duration: 0.3 + len + 0.1 });
          const a = Math.round((SHORT ? 0.3 + 0.05 : 0.3 + len - 0.25) * FS);
          const b = Math.round((SHORT ? 0.3 + len : 0.3 + len) * FS);
          const p = pitchNear(o.left, a, b, f);
          n++;
          const silent = p.rms < 1e-4;
          if (silent) { weak++; bad.push(`${midiName(m)} v${vel} p${pl} silent`); }
          else if (!(Math.abs(p.cents) < 50) || p.clarity < 0.5) { wrong++; bad.push(`${midiName(m)} v${vel} p${pl} ${p.cents.toFixed(0)}¢ (${p.clarity.toFixed(2)})`); }
        }
      }
    }
    console.log(`${id} human ${human}${SHORT ? ' short' : ''}: ${n} notes, ${wrong} off pitch, ${weak} silent${bad.length ? '\n   ' + bad.slice(0, 24).join('; ') + (bad.length > 24 ? ` … (${bad.length})` : '') : ''}`);
  }
}
