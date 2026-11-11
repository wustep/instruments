// Block-rate lines: a core that changes a control value once per internal block (64 samples)
// without interpolating it puts a small step into its output at every block boundary: lines at
// k·fs/64 (750 Hz, 1.5 kHz … at 48 kHz; 689 Hz … at 44.1 kHz) that are no harmonic of the note.
// For a held note of each instrument, at both rates: each such line's level over the spectrum's
// local floor (dB) where it lies clear of the note's harmonics, and the strongest one relative to
// the note's strongest harmonic.
//   npx tsx scripts/audio-zipper.ts [--engine <core/index.ts>] [--only flute,…] [--block 64] [--json out.json]
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fft, makeWindow } from '../packages/engine/src/analysis/index.ts';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ENGINE = resolve(opt('--engine', join(import.meta.dirname, '../packages/engine/src/core/index.ts')));
const ONLY = opt('--only', '').split(',').filter(Boolean);
const B = Number(opt('--block', '64'));
const JSON_OUT = opt('--json', '');
const eng = (await import(pathToFileURL(ENGINE).href)) as typeof import('../packages/engine/src/core/index.ts');
const NOTE: Record<string, number> = { grand: 61, upright: 61, violin: 73, viola: 61, cello: 49, bass: 37, flute: 73, oboe: 73, clarinet: 61, bassoon: 49, horn: 61, trumpet: 67, trombone: 49, timpani: 45 };
const db = (x: number) => 20 * Math.log10(Math.max(1e-15, x));
const out: Record<string, unknown> = {};
for (const [name, m] of Object.entries(NOTE)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const row: Record<string, unknown> = { midi: m };
  for (const fs of [44100, 48000]) {
    for (const vel of [72, 112]) {
      const inst = name === 'grand' || name === 'upright' ? 'piano' : name;
      const r = eng.renderInstrument({ sampleRate: fs, instrument: inst as never, preset: inst === 'piano' ? name : undefined, events: [{ time: 0.05, event: { type: 'noteOn', midi: m, velocity: vel } }, { time: 3.4, event: { type: 'noteOff', midi: m } }] as never, duration: 3.5 });
      const t0 = inst === 'piano' || inst === 'timpani' ? 0.3 : 1.2;
      const N = 65536;
      const a = Math.round(t0 * fs);
      const w = makeWindow(N, 'blackman-harris');
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = 0.5 * ((r.left[a + i] ?? 0) + (r.right[a + i] ?? 0)) * w[i];
      fft(re, im);
      const mag = new Float64Array(N / 2);
      for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
      const bin = fs / N;
      const f0 = 440 * Math.pow(2, (m - 69) / 12);
      let top = 0;
      for (let k = 1; k < N / 2; k++) top = Math.max(top, mag[k]);
      const lines: [number, number][] = [];
      let worstRel = -Infinity;
      for (let k = 1; k * (fs / B) < Math.min(12000, fs / 2); k++) {
        const f = (k * fs) / B;
        const r0 = f / f0;
        if (Math.abs(r0 - Math.round(r0)) * f0 < Math.max(0.04 * f0, 15)) continue;
        const c = Math.round(f / bin);
        let pk = 0;
        for (let j = c - 2; j <= c + 2; j++) pk = Math.max(pk, mag[j]);
        const fl: number[] = [];
        for (let j = c - 40; j <= c + 40; j++) if (Math.abs(j - c) > 6) fl.push(mag[j]);
        fl.sort((p, q) => p - q);
        const over = db(pk) - db(fl[fl.length >> 1]);
        lines.push([Math.round(f), +over.toFixed(1)]);
        if (over > 10) worstRel = Math.max(worstRel, db(pk) - db(top));
      }
      const strong = lines.filter(([, o]) => o > 10).length;
      row[`${fs}-${vel}`] = { linesOver10dB: strong, of: lines.length, strongestRelDb: +worstRel.toFixed(1), first: lines.slice(0, 6) };
      console.log(`${name.padEnd(9)} ${fs} v${vel}: ${strong}/${lines.length} block-rate lines >10 dB over floor; strongest ${worstRel.toFixed(1)} dB re top harmonic; ${lines.slice(0, 5).map(([f, o]) => `${f}:${o}`).join(' ')}`);
    }
  }
  out[name] = row;
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 1));
