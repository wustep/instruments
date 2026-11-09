// A short tap on a wind still speaks: the tongue's kick starts the trumpet's lips, and the breath
// stays on for a minimum blow when the key is let go sooner (scripts/tap-audit.ts has the numbers).
import { describe, expect, it } from 'vitest';
import { renderInstrument } from '../src/core/index.ts';

const FS = 48000;
const T0 = 0.05;
const play = (instrument: 'trumpet' | 'flute', midi: number, vel: number, hold: number, quantum = 128) =>
  renderInstrument({ sampleRate: FS, instrument, dry: true, quantum, events: [{ time: T0, event: { type: 'noteOn', midi, velocity: vel } }, { time: T0 + hold, event: { type: 'noteOff', midi } }] as never, duration: 0.7 }).left;
const peak = (x: Float32Array, from = 0, to = x.length) => {
  let p = 0;
  for (let i = from; i < to; i++) p = Math.max(p, Math.abs(x[i]));
  return p;
};
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-12));

describe('short taps on the winds', () => {
  it('trumpet: a 50 ms tap is within 6 dB of the held note, and the note speaks within 40 ms of the key', () => {
    for (const [midi, vel] of [[60, 40], [70, 80], [79, 110]] as const) {
      const held = play('trumpet', midi, vel, 0.5);
      const tap = play('trumpet', midi, vel, 0.05);
      expect(db(peak(tap) / peak(held)), `m${midi} v${vel}`).toBeGreaterThan(-6);
      // 10 % of the held note's peak inside the first 40 ms
      expect(peak(held, Math.round(T0 * FS), Math.round((T0 + 0.04) * FS)) / peak(held), `m${midi} v${vel} onset`).toBeGreaterThan(0.1);
    }
  });

  it('flute: a 50 ms tap sounds as a 120 ms one does (the minimum blow), about as loud as the held note at most', () => {
    for (const [midi, vel] of [[72, 80], [84, 110]] as const) {
      const held = play('flute', midi, vel, 0.5);
      const tap = play('flute', midi, vel, 0.05);
      const tap120 = play('flute', midi, vel, 0.12);
      expect(Math.abs(db(peak(tap) / peak(tap120))), `m${midi} v${vel} 50 vs 120 ms`).toBeLessThan(0.1);
      expect(db(peak(tap) / peak(held)), `m${midi} v${vel}`).toBeGreaterThan(-20);
      expect(db(peak(tap) / peak(held)), `m${midi} v${vel}`).toBeLessThan(2);
    }
  });

  it('the minimum blow ends: silence after a tap, a held key is untouched, and block size does not matter', () => {
    for (const inst of ['trumpet', 'flute'] as const) {
      const tap = play(inst, 72, 80, 0.03);
      expect(db(peak(tap, Math.round(0.6 * FS)) / peak(tap)), inst).toBeLessThan(-40);
      expect(play(inst, 72, 80, 0.03, 37), inst).toEqual(tap);
      // a note held past the minimum blow releases exactly when the key does
      const a = play(inst, 72, 80, 0.3);
      const b = play(inst, 72, 80, 0.31);
      const n = Math.round((T0 + 0.3) * FS);
      expect(a.subarray(0, n)).toEqual(b.subarray(0, n));
      expect(a.subarray(n + 480)).not.toEqual(b.subarray(n + 480));
    }
  });
});
