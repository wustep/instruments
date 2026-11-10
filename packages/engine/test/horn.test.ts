// The horn (core/horn.ts): the double horn's fingering (the F side to C4, the B♭ side from C♯4, the usual
// chart), concert pitch across its compass, every note on its own partial (not a neighbour a tone away,
// which high up is all that separates them) at pp, mf and ff, the low notes' weak fundamental under
// harmonics gathered near 500 Hz and the top notes nearly pure, louder and brighter with velocity, a note
// outside the compass at its end, a second player its own (blocksize.test covers the host's block size).
import { describe, expect, it } from 'vitest';
import { createCore, renderInstrument, HORN_VOICE, hornFingering, hornTubeLength } from '../src/core/index.ts';
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
const held = (m: number, vel: number, dur = 1.2, player?: number) =>
  renderInstrument({ sampleRate: FS, instrument: 'horn', dry: true, params: { vibrato: 0 } as never, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: vel } }] as never, duration: dur, player }).left;
/** the note's harmonics 1…n (dB, Hann-windowed, 0.8–1.3 s) */
const harmonics = (x: Float32Array, m: number, n: number) => {
  const f = 440 * 2 ** ((m - 69) / 12);
  const W = Math.round(0.5 * FS);
  const s0 = Math.round(0.8 * FS);
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

describe('horn', () => {
  it('the double horn’s fingering: the F side to C4, the B♭ side from C♯4, the usual chart’s choices', () => {
    // (written for the horn in F a fifth above: written C4 F 0, G4 F 0, B♭4 T1, B4 T2, C5 T0, F♯5 T2, G5 T0,
    // B♭5 T1, B5 T2, C6 T0; low F♯3 F 123)
    const f = (m: number) => {
      const x = hornFingering(m);
      return `${x.side} ${x.valves} ${x.partial}`;
    };
    expect([53, 60, 63, 64, 65, 66, 71, 72, 75, 76, 77].map(f)).toEqual(['F 0 4', 'F 0 6', 'Bb 1 6', 'Bb 2 6', 'Bb 0 6', 'Bb 2+3 8', 'Bb 2 9', 'Bb 0 9', 'Bb 1 12', 'Bb 2 12', 'Bb 0 12']);
    expect([35, 41, 42, 47, 48, 57].map(f)).toEqual(['F 1+2+3 2', 'F 0 2', 'F 1+2+3 3', 'F 2 3', 'F 0 3', 'F 0 5']);
    // the low B♭1 is the B♭ side's pedal
    expect(f(34)).toBe('Bb 0 1');
    // every note of the compass has a fingering, and its tube: the F side's 3.74 m open, the B♭'s 2.8 m
    for (let m = 34; m <= 77; m++) {
      const x = hornFingering(m);
      const base = x.side === 'F' ? 29 : 34;
      expect(base - x.lower + Math.round(12 * Math.log2(x.partial)), `MIDI ${m}`).toBe(m);
    }
    expect(hornTubeLength(hornFingering(53))).toBeCloseTo(3.74, 2);
    expect(hornTubeLength(hornFingering(65))).toBeCloseTo(2.8, 2);
  });

  it('plays at concert pitch from B♭1 to F5 (within 6 ¢ at 44.1 and 48 kHz)', () => {
    for (const fs of [44100, 48000])
      for (let m = 34; m <= 77; m += 5) {
        const c = measureCents(fs, m);
        expect(Math.abs(c), `${fs} Hz, MIDI ${m}: ${c.toFixed(1)} ¢`).toBeLessThan(6);
      }
  });

  it('every note holds its own partial at pp, mf and ff (never a neighbour: a cracked note)', () => {
    // (held 1.5 s, read in the mouthpiece: scripts/horn-regimes.ts; the whole compass at four rates is the fit's)
    for (const vel of [30, 70, 112])
      for (let m = 34; m <= 77; m += 3) expect(regime(m, vel, FS, undefined, 1.5), `MIDI ${m}, velocity ${vel}`).toBe('1');
  });

  it('the low notes’ fundamental is weak, their strongest harmonic near 500 Hz; the top notes nearly pure', () => {
    // the recordings: B♭1–B2 at mf, the fundamental 12–20 dB under the strongest harmonic, at 370–560 Hz;
    // F4 up, the fundamental strongest and the second 6–25 dB under it. (B♭2–B2 have their second harmonic
    // strongest in the model, at 233–247 Hz, the recordings' their fourth: a known gap, NOTES.md)
    for (const m of [34, 36, 39, 41]) {
      const H = harmonics(held(m, 70, 1.4), m, 14);
      const f = 440 * 2 ** ((m - 69) / 12);
      const k = H.indexOf(Math.max(...H));
      expect((k + 1) * f, `MIDI ${m}: strongest harmonic ${k + 1}`).toBeGreaterThan(250);
      expect((k + 1) * f, `MIDI ${m}: strongest harmonic ${k + 1}`).toBeLessThan(800);
      expect(H[k] - H[0], `MIDI ${m}`).toBeGreaterThan(6);
    }
    for (const m of [67, 72, 76]) {
      const H = harmonics(held(m, 70, 1.4), m, 3);
      expect(H[0] - H[1], `MIDI ${m}`).toBeGreaterThan(4);
    }
  });

  it('louder and brighter with velocity: ff at least 8 dB over pp, its upper harmonics stronger (brassy)', () => {
    for (const m of [41, 53, 65, 74]) {
      const pp = held(m, 30, 1.4);
      const ff = held(m, 112, 1.4);
      expect(rmsDb(ff, 0.6, 1.1) - rmsDb(pp, 0.6, 1.1), `MIDI ${m}`).toBeGreaterThan(8);
      const hp = harmonics(pp, m, 4);
      const hf = harmonics(ff, m, 4);
      expect(hf[2] - hf[0], `MIDI ${m}: the third harmonic against the first`).toBeGreaterThan(hp[2] - hp[0]);
    }
  });

  it('a note outside the compass sounds at its nearest end; the voicing is the fitted one', () => {
    const L = new Float32Array(256);
    const R = new Float32Array(256);
    for (const [m, at] of [[28, 34], [84, 77]]) {
      const c = createCore({ instrument: 'horn', sampleRate: FS, dry: true } as never);
      c.schedule({ type: 'noteOn', midi: m, velocity: 80 });
      c.process(L, R, 256);
      expect(c.sounding()).toEqual([at]);
    }
    expect(HORN_VOICE.gammaHi).toBeGreaterThan(HORN_VOICE.gammaLo);
  });

  it('a second player of the same part is another player: other noise, a few cents off', () => {
    const a = held(53, 80, 0.8, 0);
    const b = held(53, 80, 0.8, 1);
    let d = 0;
    for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
    expect(d).toBeGreaterThan(1e-4);
    expect(Math.abs(rmsDb(a, 0.4, 0.75) - rmsDb(b, 0.4, 0.75))).toBeLessThan(3);
  });
});
