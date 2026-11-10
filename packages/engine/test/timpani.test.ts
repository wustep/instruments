// The timpani (core/timpani.ts): the Bessel modes, the air-loaded series that makes a pitch, the principal
// tone at the note at every rate, louder and brighter when struck harder, the set's drums (a drum tuned to
// the note is used, a double stop sounds two, a note outside the compass by octaves), a roll, the fingers'
// damping, a second player, the pictures' telemetry.
import { describe, expect, it } from 'vitest';
import { analyzeStruck } from '../src/analysis/index.ts';
import { besselJ, besselZeros, createCore, renderInstrument, TIMPANI_DRUMS, TIMPANI_LO, TIMPANI_HI } from '../src/core/index.ts';

const FS = 48000;
const et = (m: number) => 440 * 2 ** ((m - 69) / 12);
const stroke = (m: number, vel: number, opts: { fs?: number; dur?: number; params?: Record<string, unknown>; player?: number } = {}) => {
  const fs = opts.fs ?? FS;
  const r = renderInstrument({ sampleRate: fs, instrument: 'timpani', dry: true, params: opts.params as never, player: opts.player, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: vel } }], duration: opts.dur ?? 1.6 } as never);
  const x = new Float32Array(r.left.length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (r.left[i] + r.right[i]);
  return { x, fs, core: r.core };
};
const rmsDb = (x: Float32Array, fs: number, a: number, b: number) => {
  let s = 0;
  for (let i = Math.round(a * fs); i < Math.round(b * fs); i++) s += x[i] * x[i];
  return 10 * Math.log10(s / ((b - a) * fs) + 1e-30);
};

describe('timpani', () => {
  it('the Bessel functions and their zeros (Abramowitz & Stegun table 9.5)', () => {
    expect(besselJ(0, 1)).toBeCloseTo(0.765198, 6);
    expect(besselJ(3, 7.5)).toBeCloseTo(-0.258061, 5);
    const Z = besselZeros();
    expect(Z[0][0]).toBeCloseTo(2.40483, 4);
    expect(Z[0][1]).toBeCloseTo(5.52008, 4);
    expect(Z[1][0]).toBeCloseTo(3.83171, 4);
    expect(Z[2][0]).toBeCloseTo(5.13562, 4);
    expect(Z[5][0]).toBeCloseTo(8.77148, 4);
    expect(Z[1][2]).toBeCloseTo(10.17347, 4);
  });

  it('the air draws the head’s series into a pitch: (2,1) (3,1) (4,1) near 1.5, 2, 2.4 times the (1,1) (in vacuo 1.59, 2.14, 2.65)', () => {
    for (const m of [43, 50]) {
      const { x, fs } = stroke(m, 70);
      const a = analyzeStruck(x, fs, et(m));
      expect(a.ratios[0], `${m} (2,1)`).toBeGreaterThan(1.42);
      expect(a.ratios[0], `${m} (2,1)`).toBeLessThan(1.55);
      expect(a.ratios[1], `${m} (3,1)`).toBeGreaterThan(1.85);
      expect(a.ratios[1], `${m} (3,1)`).toBeLessThan(2.06);
      expect(a.ratios[2], `${m} (4,1)`).toBeGreaterThan(2.28);
      expect(a.ratios[2], `${m} (4,1)`).toBeLessThan(2.6);
    }
  });

  it('the principal tone is the note at 22.05, 44.1, 48 and 96 kHz, over the compass', () => {
    for (const fs of [22050, 44100, 48000, 96000])
      for (const m of [TIMPANI_LO, 45, 50, TIMPANI_HI]) {
        const { x } = stroke(m, 70, { fs, dur: 1.2 });
        const a = analyzeStruck(x, fs, et(m));
        expect(Math.abs(1200 * Math.log2(a.f11 / et(m))), `${m} at ${fs}`).toBeLessThan(4);
      }
  });

  it('struck harder: louder and brighter', () => {
    for (const m of [41, 52]) {
      const pp = stroke(m, 30);
      const ff = stroke(m, 112);
      const a = analyzeStruck(pp.x, pp.fs, et(m));
      const b = analyzeStruck(ff.x, ff.fs, et(m));
      expect(b.level - a.level, `${m}`).toBeGreaterThan(12);
      expect(b.centroid, `${m}`).toBeGreaterThan(a.centroid * 1.2);
    }
  });

  it('the set: a drum already tuned to the note takes it; a double stop sounds two drums; a note outside the compass by octaves', () => {
    const c = createCore({ instrument: 'timpani', sampleRate: FS, dry: true } as never);
    const L = new Float32Array(256);
    const R = new Float32Array(256);
    const run = (n: number) => {
      for (let i = 0; i < n; i += 256) c.process(L, R, 256);
    };
    // the drums rest in fourths: D2 G2 C3 F3
    expect(TIMPANI_DRUMS.map((d) => d.rest)).toEqual([38, 43, 48, 53]);
    c.schedule({ type: 'noteOn', midi: 43, velocity: 90 });
    c.schedule({ type: 'noteOn', midi: 48, velocity: 90 });
    run(4800);
    const v = c.getVisual() as { timpani: { drums: { note: number; ago: number; level: number }[] } };
    // G2 on the 29″, C3 on the 26″, neither retuned
    expect(v.timpani.drums.map((d) => d.note)).toEqual([38, 43, 48, 53]);
    expect(v.timpani.drums[1].ago).toBeLessThan(0.2);
    expect(v.timpani.drums[2].ago).toBeLessThan(0.2);
    expect(c.sounding().sort()).toEqual([43, 48]);
    // A2 (not tuned anywhere): the 32″ (its pedal travels least among drums not ringing), retuned
    c.schedule({ type: 'noteOn', midi: 45, velocity: 90 });
    run(2400);
    const v2 = c.getVisual() as { timpani: { drums: { note: number }[] } };
    expect(v2.timpani.drums[0].note).toBe(45);
    // C4 is played as C3 (the compass C2–A3)
    c.schedule({ type: 'noteOn', midi: 60, velocity: 90 });
    run(2400);
    expect(c.sounding()).toContain(48);
    expect(c.sounding()).not.toContain(60);
  });

  it('a held key rolls (8–16 strokes a second), the pedal under a ringing head glides it, the fingers damp it', () => {
    const c = createCore({ instrument: 'timpani', sampleRate: FS, dry: true, params: { roll: 0.5 } } as never);
    const L = new Float32Array(480);
    const R = new Float32Array(480);
    c.schedule({ type: 'noteOn', midi: 48, velocity: 80 });
    let strokes = 0;
    let last = Infinity;
    for (let i = 0; i < 100; i++) {
      c.process(L, R, 480);
      const ago = (c.getVisual() as { timpani: { drums: { ago: number }[] } }).timpani.drums[2].ago;
      if (ago < last) strokes++;
      last = ago;
    }
    expect(strokes).toBeGreaterThanOrEqual(8);
    expect(strokes).toBeLessThanOrEqual(16);
    // damping: released at 0.3 s, with the fingers (damp 1) it is far quieter by 1 s than left to ring
    const ring = (damp: number) => {
      const r = renderInstrument({ sampleRate: FS, instrument: 'timpani', dry: true, params: { damp } as never, events: [{ time: 0.02, event: { type: 'noteOn', midi: 45, velocity: 90 } }, { time: 0.3, event: { type: 'noteOff', midi: 45 } }], duration: 1.2 });
      return rmsDb(r.left, FS, 0.9, 1.1);
    };
    expect(ring(0) - ring(1)).toBeGreaterThan(30);
  });

  it('a second player is its own (not the same samples) and in tune within a few cents', () => {
    const a = stroke(48, 80, { dur: 1.0 });
    const b = stroke(48, 80, { dur: 1.0, player: 1 });
    let d = 0;
    for (let i = 0; i < a.x.length; i++) d = Math.max(d, Math.abs(a.x[i] - b.x[i]));
    expect(d).toBeGreaterThan(1e-4);
    const fa = analyzeStruck(a.x, a.fs, et(48)).f11;
    const fb = analyzeStruck(b.x, b.fs, et(48)).f11;
    expect(Math.abs(1200 * Math.log2(fb / fa))).toBeLessThan(8);
  });

  it('the pictures: four drums with their heads’ modes, the two mallets, the strike point; nothing not finite', () => {
    const { core, x } = stroke(50, 100, { dur: 0.3 });
    for (const v of x) expect(Number.isFinite(v)).toBe(true);
    const v = core.getVisual() as { timpani: { drums: { d: number; head: Float32Array; pedal: number; level: number }[]; hands: { drum: number; on: boolean }[]; spot: number; last: number } };
    expect(v.timpani.drums.map((d) => d.d)).toEqual(TIMPANI_DRUMS.map((d) => d.d));
    expect(v.timpani.drums[v.timpani.last].level).toBeGreaterThan(0);
    const head = v.timpani.drums[v.timpani.last].head;
    expect(head.length % 3).toBe(0);
    expect(head[0]).toBe(0); // the first mode in frequency order: a (0,1) or the (1,1)
    expect(Array.from(head).some((y, i) => i % 3 === 2 && y !== 0)).toBe(true);
    expect(v.timpani.hands).toHaveLength(2);
    expect(v.timpani.spot).toBeGreaterThan(0.3);
  });
});
