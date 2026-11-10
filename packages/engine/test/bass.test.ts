// The double bass: the cello's physics (v2: torsion, the hair ribbon, the bridge hill, intonation by
// ear, the same at any rate) on a 3/4 bass's strings and body, its radiation fitted to the Iowa double
// bass (scripts/fit-bodies.ts; bowed-fit.json). What makes it a bass and not a large cello is checked
// here; its pitch across the strings is in instruments.test.ts, its sound in golden.test.ts.
import { describe, expect, it } from 'vitest';
import { BOWED, INSTRUMENT_INFO, renderInstrument } from '../src/core/index.ts';
import { analyzeSustained } from '../src/analysis/index.ts';

const FS = 48000;
function play(instrument: 'bass' | 'cello', m: number, dur: number, params: Record<string, unknown> = {}, fs = FS, vel = 80) {
  const r = renderInstrument({ sampleRate: fs, instrument, dry: true, params, duration: dur, events: [{ time: 0.01, event: { type: 'noteOn' as const, midi: m, velocity: vel } }] });
  return r.left.map((v, i) => 0.5 * (v + r.right[i]));
}

describe('double bass', () => {
  it('is a 3/4 orchestral bass: four strings in fourths from E1, 1.05 m long, the cello’s v2 physics, a fitted body', () => {
    const d = BOWED.bass;
    expect(d.strings.map((s) => s.open)).toEqual([28, 33, 38, 43]);
    expect(d.L).toBeGreaterThan(1.03);
    expect(d.L).toBeLessThan(1.07);
    expect(d.L / BOWED.cello.L).toBeGreaterThan(1.45);
    // its strings are heavier and tighter than the cello's: a higher impedance
    const Z = (id: 'bass' | 'cello', i: number) => BOWED[id].strings[i].T / (2 * BOWED[id].L * 440 * 2 ** ((BOWED[id].strings[i].open - 69) / 12));
    expect(Z('bass', 0)).toBeGreaterThan(2 * Z('cello', 0));
    for (const k of ['radiation', 'torsion', 'bowWidth', 'bridgeMass', 'byEar', 'rateInvariant'] as const) expect(d[k], k).toBeDefined();
    // the fitted body reaches below the E string (41 Hz): its lowest band is at 50 Hz
    expect(d.body?.bands[0][0]).toBe(50);
    expect(INSTRUMENT_INFO.bass.lo).toBe(28);
    expect(INSTRUMENT_INFO.bass.hi).toBe(67);
  });

  it('bowed notes sound at pitch within ±5 ¢ on every string (no vibrato), at 44.1 and 48 kHz', () => {
    for (const fs of [44100, 48000])
      for (const m of [28, 31, 36, 40, 45, 50]) {
        const x = play('bass', m, 1.4, { vibrato: 0 }, fs);
        expect(x.every((v) => Number.isFinite(v) && Math.abs(v) < 20)).toBe(true);
        const c = analyzeSustained(x, fs, { start: Math.round(0.6 * fs), end: x.length }, m).cents;
        expect(Math.abs(c), `fs ${fs} m${m}`).toBeLessThan(5);
      }
  });

  it('darker than the cello on the same note (E2, G2): its spectral centroid well below', () => {
    for (const m of [40, 43]) {
      const b = analyzeSustained(play('bass', m, 1.4, { vibrato: 0 }), FS, { start: Math.round(0.6 * FS), end: Math.round(1.4 * FS) }, m);
      const c = analyzeSustained(play('cello', m, 1.4, { vibrato: 0 }), FS, { start: Math.round(0.6 * FS), end: Math.round(1.4 * FS) }, m);
      expect(b.centroid, `m${m}`).toBeLessThan(0.75 * c.centroid);
    }
  });

  it('the open E sounds its 41 Hz fundamental (weak, as on the recordings, but there: not cut by the high-pass)', () => {
    const a = analyzeSustained(play('bass', 28, 1.6, { vibrato: 0 }), FS, { start: Math.round(0.7 * FS), end: Math.round(1.6 * FS) }, 28);
    // the Iowa bass's E1: the fundamental 16–17 dB under its strongest harmonic (scripts/ensemble-refs.ts)
    expect(a.harm[0]).toBeGreaterThan(-30);
    expect(a.harm[0]).toBeLessThan(-3);
  });
});
