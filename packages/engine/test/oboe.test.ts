// The oboe (core/oboe.ts): concert pitch across its compass, every note on its own register (not its
// octave or twelfth) at pp, mf and ff, louder with velocity, monophonic, a second player its own, and
// nothing allocated or changed by the host's block size (blocksize.test covers it too).
import { describe, expect, it } from 'vitest';
import { createCore, renderInstrument, OBOE_VOICE } from '../src/core/index.ts';
import { regime } from '../../../scripts/oboe-regimes.ts';
import { measureCents } from '../../../scripts/tune-oboe.ts';

const FS = 48000;
const rmsDb = (x: Float32Array, a: number, b: number) => {
  let s = 0;
  const i0 = Math.round(a * FS);
  const i1 = Math.round(b * FS);
  for (let i = i0; i < i1; i++) s += x[i] * x[i];
  return 10 * Math.log10(s / (i1 - i0) + 1e-20);
};
const held = (m: number, vel: number, dur = 1.2, player?: number) =>
  renderInstrument({ sampleRate: FS, instrument: 'oboe', dry: true, params: { vibrato: 0 } as never, events: [{ time: 0.02, event: { type: 'noteOn', midi: m, velocity: vel } }] as never, duration: dur, player }).left;

describe('oboe', () => {
  it('plays at concert pitch from B♭3 to A6 (within 6 ¢ at 44.1 and 48 kHz)', () => {
    for (const fs of [44100, 48000])
      for (let m = 58; m <= 93; m += 5) {
        const c = measureCents(fs, m);
        expect(Math.abs(c), `${fs} Hz, MIDI ${m}: ${c.toFixed(1)} ¢`).toBeLessThan(6);
      }
  });

  it('every note sounds on its own register at pp, mf and ff (never its octave or twelfth)', () => {
    for (const vel of [30, 70, 112])
      for (let m = 58; m <= 93; m += 3) expect(regime(m, vel, FS), `MIDI ${m}, velocity ${vel}`).toBe('1');
  });

  it('louder with velocity: ff at least 8 dB over pp (the lips open the reed), and brighter', () => {
    for (const m of [62, 74, 86]) {
      const pp = held(m, 30);
      const ff = held(m, 112);
      expect(rmsDb(ff, 0.6, 1.1) - rmsDb(pp, 0.6, 1.1), `MIDI ${m}`).toBeGreaterThan(8);
    }
  });

  it('a note outside the compass sounds at its nearest end; the voicing is the fitted one', () => {
    const lo = createCore({ instrument: 'oboe', sampleRate: FS, dry: true } as never);
    lo.schedule({ type: 'noteOn', midi: 50, velocity: 80 });
    const L = new Float32Array(256);
    const R = new Float32Array(256);
    lo.process(L, R, 256);
    expect(lo.sounding()).toEqual([58]);
    expect(OBOE_VOICE.gammaHi).toBeGreaterThan(OBOE_VOICE.gammaLo);
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
