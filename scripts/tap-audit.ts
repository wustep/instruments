// Short taps on the winds: how loud is a 30–200 ms key press next to a held note, and how long
// after the key does the note speak? (A tap that releases the breath before the tube has spoken
// is nearly silent; a player cannot do that, the shortest tongued note still speaks.)
//   npx tsx scripts/tap-audit.ts [--instrument trumpet,flute] [--engine <core/index.ts>] [--json]
// Per tap length: the tap's peak in dBFS and relative to the same note held (mean and worst over
// the notes and dynamics); per note held: the lag from the key to 10 % and 50 % of the steady
// level (5 ms RMS envelope). Wet output at 48 kHz, as the page plays it.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Core = typeof import('../packages/engine/src/core/index.ts');
const args = process.argv.slice(2);
const opt = (k: string, d?: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const E = (await import(opt('--engine') ? pathToFileURL(resolve(opt('--engine')!)).href : '../packages/engine/src/core/index.ts')) as Core;
const FS = 48000;
const T0 = 0.05;
const NOTES: Record<string, number[]> = { trumpet: [55, 60, 65, 70, 74, 79, 84], flute: [60, 65, 72, 77, 84, 89, 94] };
const VELS = [30, 70, 112];
const TAPS = [0.03, 0.05, 0.08, 0.12, 0.2];
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));

function render(inst: string, midi: number, vel: number, hold: number, dur: number): Float32Array {
  const r = E.renderInstrument({
    sampleRate: FS,
    instrument: inst as never,
    events: [
      { time: T0, event: { type: 'noteOn', midi, velocity: vel } },
      { time: T0 + hold, event: { type: 'noteOff', midi } },
    ] as never,
    duration: dur,
  });
  return r.left;
}
const peakOf = (x: Float32Array) => {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
};
/** seconds from the key until the 5 ms RMS envelope first reaches `frac` of the steady RMS */
function lag(x: Float32Array, steady: number, frac: number): number {
  const w = Math.round(0.005 * FS);
  for (let p = Math.round(T0 * FS); p + w < x.length; p += Math.round(0.001 * FS)) {
    let a = 0;
    for (let j = p; j < p + w; j++) a += x[j] * x[j];
    if (Math.sqrt(a / w) >= frac * steady) return (p + w / 2) / FS - T0;
  }
  return NaN;
}

const out: Record<string, unknown> = {};
for (const inst of (opt('--instrument', 'trumpet,flute') as string).split(',')) {
  const held: { midi: number; vel: number; peak: number; lag10: number; lag50: number }[] = [];
  const taps = new Map<number, { abs: number[]; rel: number[] }>(TAPS.map((t) => [t, { abs: [], rel: [] }]));
  for (const midi of NOTES[inst])
    for (const vel of VELS) {
      const x = render(inst, midi, vel, 0.8, 1.2);
      // steady: RMS of 0.4–0.8 s after the key
      let e = 0;
      const a0 = Math.round((T0 + 0.4) * FS);
      const a1 = Math.round((T0 + 0.8) * FS);
      for (let i = a0; i < a1; i++) e += x[i] * x[i];
      const steady = Math.sqrt(e / (a1 - a0));
      const pk = peakOf(x);
      held.push({ midi, vel, peak: db(pk), lag10: lag(x, steady, 0.1) * 1000, lag50: lag(x, steady, 0.5) * 1000 });
      for (const t of TAPS) {
        const p = peakOf(render(inst, midi, vel, t, 0.9));
        taps.get(t)!.abs.push(db(p));
        taps.get(t)!.rel.push(db(p / pk));
      }
    }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const f = (x: number) => x.toFixed(1).padStart(6);
  console.log(`\n${inst} (${NOTES[inst].length} notes × ${VELS.length} dynamics, wet, ${FS} Hz)`);
  console.log('  tap ms | peak dBFS mean / worst | re held note mean / worst');
  const tapRows = TAPS.map((t) => {
    const v = taps.get(t)!;
    const row = { ms: t * 1000, peakMean: mean(v.abs), peakWorst: Math.min(...v.abs), relMean: mean(v.rel), relWorst: Math.min(...v.rel) };
    console.log(`  ${String(row.ms).padStart(6)} | ${f(row.peakMean)} / ${f(row.peakWorst)}        | ${f(row.relMean)} / ${f(row.relWorst)}`);
    return row;
  });
  const l10 = held.map((h) => h.lag10);
  const l50 = held.map((h) => h.lag50);
  console.log(`  key → 10 % of steady: mean ${f(mean(l10))} ms, worst ${f(Math.max(...l10))} ms; → 50 %: mean ${f(mean(l50))} ms, worst ${f(Math.max(...l50))} ms`);
  for (const v of VELS) {
    const hs = held.filter((h) => h.vel === v);
    console.log(`    vel ${String(v).padStart(3)}: 10 % ${hs.map((h) => h.lag10.toFixed(0).padStart(4)).join('')}   50 % ${hs.map((h) => h.lag50.toFixed(0).padStart(4)).join('')}  (notes ${NOTES[inst].join(' ')})`);
  }
  out[inst] = { taps: tapRows, held };
}
if (args.includes('--json')) console.log(JSON.stringify(out));
