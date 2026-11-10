// NEXT5 item 1: the violin's and viola's bodies fitted to the Iowa recordings (design.body). The
// fitted numbers are judged against the recordings by scripts/judge.ts; these tests pin the
// mechanisms: the Helmholtz corner's cutoff follows the bow force, louder is brighter, and the
// high-frequency radiation is heard in a mono sum.
import { describe, expect, it } from 'vitest';
import { BOWED, BowedCore } from '../src/core/bowed.ts';
import { renderInstrument } from '../src/core/render.ts';
import { analyzeSustained } from '../src/analysis/index.ts';

const FS = 48000;

/** the corner's cutoff (Hz) after 0.5 s of one bowed note */
function cutoff(inst: 'violin' | 'viola', midi: number, velocity: number, cc1?: number): number {
  const c = new BowedCore({ sampleRate: FS, instrument: inst, dry: true, params: { vibrato: 0 } });
  if (cc1 !== undefined) c.schedule({ type: 'control', cc: 1, value: cc1 });
  c.noteOn(midi, velocity);
  const L = new Float32Array(128);
  const R = new Float32Array(128);
  for (let i = 0; i < Math.round((0.5 * FS) / 128); i++) c.process(L, R, 128);
  return (c as unknown as { fc: number }).fc;
}

function mono(inst: 'violin' | 'viola', midi: number, velocity: number, dur = 1.3): Float32Array {
  const r = renderInstrument({
    sampleRate: FS,
    instrument: inst,
    dry: true,
    params: { vibrato: 0 },
    events: [
      { time: 0.02, event: { type: 'noteOn', midi, velocity } },
      { time: dur - 0.1, event: { type: 'noteOff', midi } },
    ],
    duration: dur,
  });
  const x = new Float32Array(r.left.length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (r.left[i] + r.right[i]);
  return x;
}

/** energy above ~6 kHz (a fourth-order difference, +24 dB/octave), dB */
function topDb(x: Float32Array): number {
  let s = 0;
  for (let i = Math.round(0.4 * FS) + 4; i < Math.round(1.1 * FS); i++) {
    const d = x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
    s += d * d;
  }
  return 10 * Math.log10(s + 1e-30);
}

describe('bowed bodies fitted to the recordings (violin, viola)', () => {
  it('only the violin and viola have a fitted body; the cello keeps its own chain', () => {
    expect(BOWED.violin.body).toBeDefined();
    expect(BOWED.viola.body).toBeDefined();
    expect(BOWED.cello.body).toBeUndefined();
  });

  it('the corner opens with the bow force: louder notes and a harder-pressed bow are brighter', () => {
    for (const inst of ['violin', 'viola'] as const)
      for (const m of inst === 'violin' ? [58, 71, 79] : [50, 64, 71]) {
        const [pp, mf, ff] = [30, 70, 112].map((v) => cutoff(inst, m, v));
        expect(mf, `${inst} ${m}`).toBeGreaterThan(1.3 * pp);
        expect(ff, `${inst} ${m}`).toBeGreaterThan(1.3 * mf);
        // the pressure controller presses the same bow harder
        expect(cutoff(inst, m, 70, 1), `${inst} ${m} CC1`).toBeGreaterThan(1.3 * cutoff(inst, m, 70, 0));
        // and it is a harmonic of the note: an octave up, the same force, twice the cutoff
        const [k1, g] = BOWED[inst].body!.corner;
        expect(k1).toBeGreaterThan(0);
        expect(g).toBeGreaterThan(0.3);
      }
    expect(cutoff('violin', 76, 70) / cutoff('violin', 64, 70)).toBeCloseTo(Math.pow(2, 1), 0);
  });

  it('a fortissimo violin is brighter than a pianissimo one (median spectral centroid over four strings)', () => {
    const med = (v: number) => {
      const c = [58, 64, 71, 79].map((m) => analyzeSustained(mono('violin', m, v), FS, { start: Math.round(0.02 * FS), end: Math.round(1.2 * FS) }, m).centroid).sort((a, b) => a - b);
      return 0.5 * (c[1] + c[2]);
    };
    expect(med(112)).toBeGreaterThan(1.1 * med(30));
  });

  it('the high-frequency radiation is heard in mono (it used to reach the right channel inverted)', () => {
    for (const inst of ['violin', 'viola'] as const) {
      const d = BOWED[inst];
      const hf = d.hf;
      const a = topDb(mono(inst, 74, 90));
      d.hf = [hf[0] * 10, hf[1]];
      let b: number;
      try {
        b = topDb(mono(inst, 74, 90));
      } finally {
        d.hf = hf;
      }
      // ×10 on that path: its share of the mono top octave rises (it cancelled to nothing before)
      expect(b - a, inst).toBeGreaterThan(6);
    }
  });
});
