// The clarinet (core/clarinet.ts): concert pitch across its compass, every note on its own register (not
// its twelfth or a squeak) at pp, mf and ff, odd harmonics in the chalumeau, louder with velocity, a note
// outside the compass at its end, a second player its own (blocksize.test covers the host's block size).
import { describe, expect, it } from 'vitest';
import { createCore, renderInstrument, CLARINET_VOICE } from '../src/core/index.ts';
import { regime } from '../../../scripts/clarinet-regimes.ts';
import { measureCents } from '../../../scripts/tune-clarinet.ts';

const FS = 48000;
const rmsDb = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  const i0 = Math.round(a * FS);
  const i1 = Math.round(b * FS);
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (i1 - i0) + 1e-20);
};
const held = (m: number, vel: number, dur = 1.2, player?: number) =>
  renderInstrument({ sampleRate: FS, instrument: 'clarinet', dry: true, params: { vibrato: 0 } as never, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: vel } }] as never, duration: dur, player }).left;

describe('clarinet', () => {
  it('plays at concert pitch from D3 to B♭6 (within 6 ¢ at 44.1 and 48 kHz)', () => {
    for (const fs of [44100, 48000])
      for (let m = 50; m <= 94; m += 6) {
        const c = measureCents(fs, m);
        expect(Math.abs(c), `${fs} Hz, MIDI ${m}: ${c.toFixed(1)} ¢`).toBeLessThan(6);
      }
  });

  it('every note sounds on its own register at pp, mf and ff (never its twelfth or a squeak)', () => {
    for (const vel of [30, 70, 112])
      for (let m = 50; m <= 94; m += 4) expect(regime(m, vel, FS), `MIDI ${m}, velocity ${vel}`).toBe('1');
  });

  it('the chalumeau is a closed pipe: its odd harmonics stand well over the even ones below the cutoff', () => {
    // G3 (196 Hz) at mf: harmonics 1, 3, 5 against 2, 4 (all under ~1 kHz, where the bore resonates)
    const x = held(55, 70, 1.4);
    const f = 440 * 2 ** ((55 - 69) / 12);
    const W = Math.round(0.5 * FS);
    const s0 = Math.round(0.8 * FS);
    const h = (k: number) => {
      let re = 0;
      let im = 0;
      for (let i = 0; i < W; i++) {
        const hw = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
        re += x[s0 + i] * hw * Math.cos((2 * Math.PI * k * f * i) / FS);
        im += x[s0 + i] * hw * Math.sin((2 * Math.PI * k * f * i) / FS);
      }
      return 20 * Math.log10(Math.hypot(re, im) + 1e-30);
    };
    const odd = Math.max(h(1), h(3), h(5));
    const even = Math.max(h(2), h(4));
    expect(odd - even).toBeGreaterThan(10);
  });

  it('louder with velocity: ff at least 8 dB over pp (the lips open the reed), and brighter', () => {
    for (const m of [55, 67, 79, 88]) {
      const pp = held(m, 30);
      const ff = held(m, 112);
      expect(rmsDb(ff, 0.6, 1.1) - rmsDb(pp, 0.6, 1.1), `MIDI ${m}`).toBeGreaterThan(8);
    }
  });

  it('a note outside the compass sounds at its nearest end; the voicing is the fitted one', () => {
    const lo = createCore({ instrument: 'clarinet', sampleRate: FS, dry: true } as never);
    lo.schedule({ type: 'noteOn', midi: 40, velocity: 80 });
    const L = new Float32Array(256);
    const R = new Float32Array(256);
    lo.process(L, R, 256);
    expect(lo.sounding()).toEqual([50]);
    expect(CLARINET_VOICE.gammaHi).toBeGreaterThan(CLARINET_VOICE.gammaLo);
  });

  it('a second player of the same part is another player: other noise, a few cents off', () => {
    const a = held(69, 80, 0.8, 0);
    const b = held(69, 80, 0.8, 1);
    let d = 0;
    for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
    expect(d).toBeGreaterThan(1e-4);
    expect(Math.abs(rmsDb(a, 0.4, 0.75) - rmsDb(b, 0.4, 0.75))).toBeLessThan(3);
  });
});
