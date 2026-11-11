// The tuba (core/tuba.ts): the horn's engine (core/lipcone.ts) at the contrabass tuba in C's compass and
// voicing. Its four-valve fingering (the fourth in place of 1+3, the usual chart), concert pitch across its
// compass, every note on its own partial at pp, mf and ff, the low notes' weak fundamental under harmonics
// gathered near 300–600 Hz and the top notes nearly their fundamental and second, louder and brighter with
// velocity, a note outside the compass at its end, a second player its own; and the engine it shares: the
// valve search is the trumpet's and the horn's (core/valves.ts).
import { describe, expect, it } from 'vitest';
import { createCore, renderInstrument, HornCore, LipConeCore, TubaCore, TUBA_HI, TUBA_LENGTH, TUBA_LO, TUBA_VOICE, VALVES3, VALVES4, hornFingering, trumpetFingering, tubaFingering, tubaTubeLength, valveFingering, valvesDown } from '../src/core/index.ts';
import { regime } from '../../../scripts/horn-regimes.ts';
import { measureCents } from '../../../scripts/tune-horn.ts';

const FS = 48000;
const rmsDb = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  const i0 = Math.round(a * FS);
  const i1 = Math.round(b * FS);
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (i1 - i0) + 1e-20);
};
const held = (m: number, vel: number, dur = 1.6, player?: number) =>
  renderInstrument({ sampleRate: FS, instrument: 'tuba', dry: true, params: { vibrato: 0 } as never, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: vel } }] as never, duration: dur, player }).left;
/** the note's harmonics 1…n (dB, Hann-windowed, 0.9–1.5 s) */
const harmonics = (x: Float32Array, m: number, n: number) => {
  const f = 440 * 2 ** ((m - 69) / 12);
  const W = Math.round(0.6 * FS);
  const s0 = Math.round(0.9 * FS);
  return Array.from({ length: n }, (_, j) => {
    let re = 0;
    let im = 0;
    for (let i = 0; i < W; i++) {
      const hw = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
      re += x[s0 + i] * hw * Math.cos((2 * Math.PI * (j + 1) * f * i) / FS);
      im += x[s0 + i] * hw * Math.sin((2 * Math.PI * (j + 1) * f * i) / FS);
    }
    return 20 * Math.log10(Math.hypot(re, im) + 1e-30);
  });
};

describe('tuba', () => {
  it('the four-valve fingering: the chart’s choices, the fourth valve in place of 1+3 and 2+4 of 1+2+3', () => {
    const f = (m: number) => {
      const x = tubaFingering(m);
      return `${x.valves} ${x.partial}`;
    };
    // C2 down to D♭1 on the second partial: open, 2, 1, 1+2, 2+3, 4, 2+4, 1+4, 1+2+4, 2+3+4, 1+3+4, 1+2+3+4
    expect([36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25].map(f)).toEqual(['0 2', '2 2', '1 2', '1+2 2', '2+3 2', '4 2', '2+4 2', '1+4 2', '1+2+4 2', '2+3+4 2', '1+3+4 2', '1+2+3+4 2']);
    // the pedal C1 is the open tube's own; above C2 the least lowering on the lowest partial
    expect(f(24)).toBe('0 1');
    expect([38, 41, 43, 48, 50, 52, 55, 60, 62, 64, 65].map(f)).toEqual(['4 3', '1 3', '0 3', '0 4', '1 5', '0 5', '0 6', '0 8', '0 9', '0 10', '1 12']);
    for (let m = TUBA_LO; m <= TUBA_HI; m++) {
      const x = tubaFingering(m);
      expect(24 - x.lower + Math.round(12 * Math.log2(x.partial)), `MIDI ${m}`).toBe(m);
      // (never 1+3 or 1+2+3: the fourth valve stands in for them)
      expect(['1+3', '1+2+3']).not.toContain(x.valves);
    }
    expect(tubaTubeLength(tubaFingering(36))).toBeCloseTo(TUBA_LENGTH, 6);
    expect(tubaTubeLength(tubaFingering(31))).toBeCloseTo(TUBA_LENGTH * 2 ** (5 / 12), 6);
    expect(valvesDown('1+2+4', 4)).toEqual([true, true, false, true]);
    expect(valvesDown('0', 4)).toEqual([false, false, false, false]);
  });

  it('the valves are the brass’s own: one search for the trumpet, the horn and the tuba', () => {
    // (the trumpet's and the horn's fingerings are this search's, as they were before it was shared)
    expect([trumpetFingering(58), trumpetFingering(60), trumpetFingering(67)]).toEqual([{ partial: 2, lower: 0, valves: 'open' }, { partial: 3, lower: 5, valves: '1+3' }, { partial: 4, lower: 3, valves: '1+2' }]);
    expect(valveFingering(53, 29, [2, 3, 4, 5, 6], VALVES3)).toEqual({ valves: '0', lower: 0, partial: 4 });
    expect(hornFingering(53)).toMatchObject({ side: 'F', valves: '0', partial: 4 });
    expect(valveFingering(31, 24, [2, 3, 4], VALVES4)).toEqual({ valves: '4', lower: 5, partial: 2 });
    expect(valveFingering(20, 24, [2, 3, 4], VALVES4)).toBeNull();
    // and the engine: the horn and the tuba are the same core at their own compass and voicing
    const horn = new HornCore({ sampleRate: FS, dry: true });
    const tuba = new TubaCore({ sampleRate: FS, dry: true });
    expect(horn).toBeInstanceOf(LipConeCore);
    expect(tuba).toBeInstanceOf(LipConeCore);
    expect([horn.id, tuba.id]).toEqual(['horn', 'tuba']);
    expect(tuba.keySummary().length).toBe(TUBA_HI - TUBA_LO + 1);
    expect(tuba.keySummary()[1].preparation).toBe('valves 1+2+3+4, partial 2');
  });

  it('plays at concert pitch from C1 to F4 (within 6 ¢ at 44.1 and 48 kHz)', () => {
    for (const fs of [44100, 48000])
      for (let m = TUBA_LO; m <= TUBA_HI; m += 7) {
        const c = measureCents(fs, m, 70, 'tuba');
        expect(Math.abs(c), `${fs} Hz, MIDI ${m}: ${c.toFixed(1)} ¢`).toBeLessThan(6);
      }
  });

  it('every note holds its own partial at pp, mf and ff (never a neighbour: a cracked note)', () => {
    // (held 1.5 s, read in the mouthpiece: scripts/horn-regimes.ts --instrument tuba; the whole compass at
    // four rates is the fit's: 504 of 504)
    for (const vel of [30, 70, 112]) for (let m = TUBA_LO; m <= TUBA_HI; m += 4) expect(regime(m, vel, FS, undefined, 1.5, 'tuba'), `MIDI ${m}, velocity ${vel}`).toBe('1');
  });

  it('the low notes’ fundamental is weak under harmonics gathered near 300–700 Hz; the top notes are their first two', () => {
    // the recordings (Iowa MIS tuba, mf): C1–B1 the fundamental 16–35 dB under the strongest harmonic, which
    // lies at 250–450 Hz; from C3 the first and second harmonics lead and the rest fall away
    for (const m of [24, 29, 33, 36]) {
      const H = harmonics(held(m, 70), m, 20);
      const f = 440 * 2 ** ((m - 69) / 12);
      const k = H.indexOf(Math.max(...H));
      expect((k + 1) * f, `MIDI ${m}: strongest harmonic ${k + 1}`).toBeGreaterThan(200);
      expect((k + 1) * f, `MIDI ${m}: strongest harmonic ${k + 1}`).toBeLessThan(750);
      expect(H[k] - H[0], `MIDI ${m}`).toBeGreaterThan(10);
    }
    for (const m of [55, 60, 64]) {
      const H = harmonics(held(m, 70), m, 6);
      expect(Math.max(H[0], H[1]) - Math.max(H[3], H[4], H[5]), `MIDI ${m}`).toBeGreaterThan(8);
    }
  });

  it('louder and brighter with velocity: ff at least 8 dB over pp, its upper harmonics stronger', () => {
    for (const m of [29, 41, 53, 62]) {
      const pp = held(m, 30);
      const ff = held(m, 112);
      expect(rmsDb(ff, 0.8, 1.4) - rmsDb(pp, 0.8, 1.4), `MIDI ${m}`).toBeGreaterThan(8);
      const hp = harmonics(pp, m, 6);
      const hf = harmonics(ff, m, 6);
      expect(hf[5] - hf[1], `MIDI ${m}: the sixth harmonic against the second`).toBeGreaterThan(hp[5] - hp[1]);
    }
  });

  it('a note outside the compass sounds at its nearest end; the voicing is the fitted one', () => {
    const L = new Float32Array(256);
    const R = new Float32Array(256);
    for (const [m, at] of [[20, TUBA_LO], [72, TUBA_HI]]) {
      const c = createCore({ instrument: 'tuba', sampleRate: FS, dry: true } as never);
      c.schedule({ type: 'noteOn', midi: m, velocity: 80 });
      c.process(L, R, 256);
      expect(c.sounding()).toEqual([at]);
    }
    // (a wide bell lets go of the highs lower than a horn's)
    expect(TUBA_VOICE.bellFc).toBeLessThan(1213);
    expect(TUBA_VOICE.gammaHi).toBeGreaterThan(TUBA_VOICE.gammaLo);
  });

  it('a second player of the same part is another player: other noise, a few cents off', () => {
    const a = held(41, 80, 1.0, 0);
    const b = held(41, 80, 1.0, 1);
    let d = 0;
    for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
    expect(d).toBeGreaterThan(1e-4);
    expect(Math.abs(rmsDb(a, 0.5, 0.95) - rmsDb(b, 0.5, 0.95))).toBeLessThan(3);
  });
});
