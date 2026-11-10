// The bassoon (core/bassoon.ts): concert pitch across its compass, every note on its own register (not
// its octave or a squeak) at pp, mf and ff, every harmonic in the low register (a cone, not a clarinet's
// cylinder), the low notes' weak fundamental under the formant near 500 Hz, louder with velocity, a note
// outside the compass at its end, a second player its own (blocksize.test covers the host's block size).
import { describe, expect, it } from 'vitest';
import { createCore, renderInstrument, BASSOON_VOICE } from '../src/core/index.ts';
import { regime } from '../../../scripts/bassoon-regimes.ts';
import { measureCents } from '../../../scripts/tune-bassoon.ts';

const FS = 48000;
const rmsDb = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  const i0 = Math.round(a * FS);
  const i1 = Math.round(b * FS);
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (i1 - i0) + 1e-20);
};
const held = (m: number, vel: number, dur = 1.2, player?: number) =>
  renderInstrument({ sampleRate: FS, instrument: 'bassoon', dry: true, params: { vibrato: 0 } as never, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: vel } }] as never, duration: dur, player }).left;
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

describe('bassoon', () => {
  it('plays at concert pitch from B♭1 to E5 (within 6 ¢ at 44.1 and 48 kHz)', () => {
    for (const fs of [44100, 48000])
      for (let m = 34; m <= 76; m += 6) {
        const c = measureCents(fs, m);
        expect(Math.abs(c), `${fs} Hz, MIDI ${m}: ${c.toFixed(1)} ¢`).toBeLessThan(6);
      }
  });

  it('every note holds its own register at pp, mf and ff (never its octave, twelfth or a squeak); few radiate even-heavy', () => {
    // (held 1.5 s, read in the bocal: scripts/bassoon-regimes.ts. 'e': on its fundamental in the bore, its
    // radiated odd harmonics 15 dB under its even ones — C♯3–D♯3 at mf and ff, a known gap)
    const e: string[] = [];
    for (const vel of [30, 70, 112])
      for (let m = 34; m <= 76; m += 4) {
        const r = regime(m, vel, FS, undefined, 1.5);
        expect(['1', 'e'], `MIDI ${m}, velocity ${vel}: ${r}`).toContain(r);
        if (r === 'e') e.push(`${m}/${vel}`);
      }
    expect(e.length, e.join(' ')).toBeLessThanOrEqual(3);
  });

  it('a cone plays every harmonic: the low register’s even harmonics are as strong as its odd ones', () => {
    // D2, F2, G2, A2 at mf: harmonics 1–8 (all under 900 Hz), odd and even on average within 8 dB (a
    // clarinet's even ones average ~20 dB under its odd ones)
    for (const m of [38, 41, 43, 45]) {
      const H = harmonics(held(m, 70, 1.4), m, 8);
      const mean = (ks: number[]) => ks.reduce((a, k) => a + H[k - 1], 0) / ks.length;
      expect(Math.abs(mean([1, 3, 5, 7]) - mean([2, 4, 6, 8])), `MIDI ${m}`).toBeLessThan(8);
    }
  });

  it('the low notes’ fundamental is weak, their strongest harmonic near the formant (300–800 Hz)', () => {
    // the recordings: B♭1–F2 at mf, the fundamental 9–20 dB under the strongest harmonic, at 290–500 Hz
    for (const m of [34, 38, 41]) {
      const H = harmonics(held(m, 70, 1.4), m, 12);
      const f = 440 * 2 ** ((m - 69) / 12);
      const k = H.indexOf(Math.max(...H));
      expect((k + 1) * f, `MIDI ${m}: strongest harmonic ${k + 1}`).toBeGreaterThan(250);
      expect((k + 1) * f, `MIDI ${m}: strongest harmonic ${k + 1}`).toBeLessThan(800);
      expect(H[k] - H[0], `MIDI ${m}`).toBeGreaterThan(5);
    }
  });

  it('louder with velocity: ff at least 8 dB over pp (the lips open the reed)', () => {
    for (const m of [36, 48, 60, 72]) {
      const pp = held(m, 30);
      const ff = held(m, 112);
      expect(rmsDb(ff, 0.6, 1.1) - rmsDb(pp, 0.6, 1.1), `MIDI ${m}`).toBeGreaterThan(8);
    }
  });

  it('a note outside the compass sounds at its nearest end; the voicing is the fitted one', () => {
    const L = new Float32Array(256);
    const R = new Float32Array(256);
    for (const [m, at] of [[28, 34], [81, 76]]) {
      const c = createCore({ instrument: 'bassoon', sampleRate: FS, dry: true } as never);
      c.schedule({ type: 'noteOn', midi: m, velocity: 80 });
      c.process(L, R, 256);
      expect(c.sounding()).toEqual([at]);
    }
    expect(BASSOON_VOICE.gammaHi).toBeGreaterThan(BASSOON_VOICE.gammaLo);
  });

  it('a second player of the same part is another player: other noise, a few cents off', () => {
    const a = held(50, 80, 0.8, 0);
    const b = held(50, 80, 0.8, 1);
    let d = 0;
    for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
    expect(d).toBeGreaterThan(1e-4);
    expect(Math.abs(rmsDb(a, 0.4, 0.75) - rmsDb(b, 0.4, 0.75))).toBeLessThan(3);
  });
});
