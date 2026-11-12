// Golden sound snapshots: a short passage per instrument, reduced to a fingerprint (loudness
// envelope and ⅓-octave spectrum), compared with the blessed one. A refactor or speed-up that
// changes the sound fails here; a deliberate change is blessed with
//   UPDATE_GOLDEN=1 npx vitest run packages/engine/test/golden.test.ts
// (and its before/after goes in the commit). The bowed strings, the reeds and the trumpet are chaotic
// self-oscillators: any change of timing alters their waveform, so their tolerance is wider.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderInstrument, type InstrumentId } from '../src/core/index.ts';
import { fft } from '../src/analysis/index.ts';

const FS = 48000;
const DIR = join(import.meta.dirname, 'golden');
const PASSAGE: Record<string, number[]> = { piano: [48, 60, 64, 67], violin: [67, 71, 74], cello: [43, 50, 55], bass: [28, 33, 40], flute: [72, 76, 79], oboe: [69, 74, 77], clarinet: [55, 67, 74], bassoon: [41, 50, 55], horn: [41, 53, 65], trumpet: [60, 64, 67], trombone: [46, 53, 58], tuba: [29, 36, 48], harp: [36, 60, 84], glockenspiel: [84, 91, 103], timpani: [43, 48, 52] };
const TOL: Record<string, number> = { piano: 0.3, flute: 0.6, violin: 1.5, cello: 1.5, bass: 1.5, oboe: 1.5, clarinet: 1.5, bassoon: 1.5, horn: 1.5, trumpet: 1.5, trombone: 1.5, tuba: 1.5, harp: 0.3, glockenspiel: 0.3, timpani: 0.3 };

function fingerprint(inst: InstrumentId) {
  const notes = PASSAGE[inst];
  const events = notes.flatMap((m, i) => [
    { time: 0.05 + i * 0.3, event: { type: 'noteOn', midi: m, velocity: 70 + 10 * i } },
    { time: 0.05 + i * 0.3 + 0.26, event: { type: 'noteOff', midi: m } },
  ]);
  const r = renderInstrument({ instrument: inst, sampleRate: FS, events: events as never, duration: 0.05 + notes.length * 0.3 + 0.3, dry: true } as never);
  const x = r.left;
  const env: number[] = [];
  const w = Math.round(0.05 * FS);
  for (let i = 0; i + w <= x.length; i += w) {
    let s = 0;
    for (let j = 0; j < w; j++) s += x[i + j] ** 2;
    env.push(+(10 * Math.log10(s / w + 1e-12)).toFixed(2));
  }
  const N = 4096;
  const acc = new Float64Array(N / 2);
  for (let a = 0; a + N <= x.length; a += N / 2) {
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[a + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 0; k < N / 2; k++) acc[k] += re[k] ** 2 + im[k] ** 2;
  }
  const ltas: number[] = [];
  for (let f = 63; f < 16000; f *= 2 ** (1 / 3)) {
    let s = 0;
    for (let k = Math.round((f * N) / FS); k < Math.round((f * 2 ** (1 / 3) * N) / FS); k++) s += acc[k];
    ltas.push(+(10 * Math.log10(s + 1e-20)).toFixed(2));
  }
  return { env, ltas };
}

describe('golden sound snapshots', () => {
  for (const inst of Object.keys(PASSAGE) as InstrumentId[]) {
    it(`${inst} sounds as blessed`, () => {
      const fp = fingerprint(inst);
      const file = join(DIR, `${inst}.json`);
      if (process.env.UPDATE_GOLDEN || !existsSync(file)) {
        writeFileSync(file, JSON.stringify(fp) + '\n');
        return;
      }
      const g = JSON.parse(readFileSync(file, 'utf8')) as typeof fp;
      const rmsDiff = (a: number[], b: number[], floor: number) => {
        const d = a.map((v, i) => (Math.max(v, floor) - Math.max(b[i], floor)) ** 2);
        return Math.sqrt(d.reduce((s, v) => s + v, 0) / d.length);
      };
      const pk = Math.max(...g.env);
      expect(rmsDiff(fp.env, g.env, pk - 60), `${inst} loudness envelope (dB RMS)`).toBeLessThan(TOL[inst] * 2);
      const top = Math.max(...g.ltas);
      expect(rmsDiff(fp.ltas, g.ltas, top - 70), `${inst} ⅓-octave spectrum (dB RMS)`).toBeLessThan(TOL[inst]);
    });
  }
});
