// Measure the trumpet's pitch per note (mf, dry) and update brass-tuning.json so each
// note plays at equal temperament (the lips pull the pitch above the bore's mode).
//   npx tsx scripts/tune-trumpet.ts [--passes 3]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fft } from '../packages/engine/src/analysis/index.ts';
const FILE = join(import.meta.dirname, '../packages/engine/src/core/brass-tuning.json');
const args = process.argv.slice(2);
const passes = args.includes('--passes') ? Number(args[args.indexOf('--passes') + 1]) : 3;
const fs = 44100;
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** harmonic-sum pitch, searched ±150 cents around the note */
function pitch(x: Float32Array, m: number): number {
  const N = 65536;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const a = Math.round(0.6 * fs);
  for (let i = 0; i < N && a + i < x.length; i++) re[i] = x[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.min(N, x.length - a)));
  fft(re, im);
  const mag = (f: number) => {
    const k = (f * N) / fs;
    const k0 = Math.floor(k);
    const fr = k - k0;
    const m0 = Math.hypot(re[k0], im[k0]);
    const m1 = Math.hypot(re[k0 + 1], im[k0 + 1]);
    return m0 + fr * (m1 - m0);
  };
  let best = 0;
  let bc = 0;
  for (let c = -150; c <= 150; c += 0.5) {
    const f = et(m) * Math.pow(2, c / 1200);
    let s = 0;
    for (let h = 1; h <= 6; h++) s += Math.log(1e-12 + mag(h * f));
    if (s > best || c === -150) {
      best = s;
      bc = c;
    }
  }
  return bc;
}
for (let pass = 0; pass < passes; pass++) {
  const table = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, number>;
  const { renderInstrument } = await import(`../packages/engine/src/core/index.ts?pass=${pass}`);
  const errs: number[] = [];
  for (let m = 52; m <= 86; m++) {
    const r = renderInstrument({ sampleRate: fs, instrument: 'trumpet', dry: true, params: { vibrato: 0, human: 0 } as never, events: [{ time: 0.05, event: { type: 'noteOn', midi: m, velocity: 80 } }, { time: 1.9, event: { type: 'noteOff', midi: m } }], duration: 2.1 });
    const c = pitch(r.left, m);
    errs.push(c);
    table[m] = +((table[m] ?? 0) + c).toFixed(2);
  }
  writeFileSync(FILE, JSON.stringify(table, null, 0) + '\n');
  const rms = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
  console.log(`pass ${pass + 1}: RMS ${rms.toFixed(1)} c, max ${Math.max(...errs.map(Math.abs)).toFixed(1)} c`);
}
