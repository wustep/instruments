// A short tap on a wind still speaks: the tongue's kick starts the trumpet's lips, and the breath
// stays on for a minimum blow when the key is let go sooner (scripts/tap-audit.ts has the numbers).
import { describe, expect, it } from 'vitest';
import { renderInstrument } from '../src/core/index.ts';

const FS = 48000;
const T0 = 0.05;
const play = (instrument: 'trumpet' | 'flute' | 'oboe' | 'clarinet' | 'bassoon' | 'horn' | 'trombone', midi: number, vel: number, hold: number, quantum = 128) =>
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

  it('oboe: a 50 ms tap still speaks, within 8 dB of the held note (the minimum blow: longer for a soft note, which takes longer to speak)', () => {
    for (const [midi, vel] of [[62, 30], [74, 50], [74, 80], [86, 110]] as const) {
      const held = play('oboe', midi, vel, 0.6);
      const tap = play('oboe', midi, vel, 0.05);
      expect(db(peak(tap) / peak(held)), `m${midi} v${vel}`).toBeGreaterThan(-8);
      // speaking (10 % of the held note's peak): within 80 ms from mezzo-forte up, 250 ms at pianissimo
      // (the recordings' soft notes swell in)
      const by = vel >= 80 ? 0.08 : 0.25;
      expect(peak(held, Math.round(T0 * FS), Math.round((T0 + by) * FS)) / peak(held), `m${midi} v${vel} onset`).toBeGreaterThan(0.1);
    }
  });

  it('clarinet: a 50 ms tap still speaks, within 8 dB of the held note (the minimum blow)', () => {
    for (const [midi, vel] of [[55, 30], [67, 50], [67, 80], [79, 110]] as const) {
      const held = play('clarinet', midi, vel, 0.6);
      const tap = play('clarinet', midi, vel, 0.05);
      expect(db(peak(tap) / peak(held)), `m${midi} v${vel}`).toBeGreaterThan(-8);
      // speaking (10 % of the held note's peak): within 80 ms from mezzo-forte up, 350 ms at
      // pianissimo (blown just over its threshold, a soft low note grows slowly, as the recordings' swell)
      const by = vel >= 80 ? 0.08 : 0.35;
      expect(peak(held, Math.round(T0 * FS), Math.round((T0 + by) * FS)) / peak(held), `m${midi} v${vel} onset`).toBeGreaterThan(0.1);
    }
  });

  it('bassoon: a 50 ms tap still speaks, within 8 dB of the held note (the minimum blow)', () => {
    for (const [midi, vel] of [[38, 30], [50, 50], [50, 80], [65, 110]] as const) {
      const held = play('bassoon', midi, vel, 0.6);
      const tap = play('bassoon', midi, vel, 0.05);
      expect(db(peak(tap) / peak(held)), `m${midi} v${vel}`).toBeGreaterThan(-8);
      // speaking (10 % of the held note's peak): within 80 ms from mezzo-forte up, 250 ms at pianissimo
      const by = vel >= 80 ? 0.08 : 0.25;
      expect(peak(held, Math.round(T0 * FS), Math.round((T0 + by) * FS)) / peak(held), `m${midi} v${vel} onset`).toBeGreaterThan(0.1);
    }
  });

  it('horn: a 50 ms tap still speaks, within 8 dB of the held note (the minimum blow)', () => {
    for (const [midi, vel] of [[41, 30], [53, 60], [65, 90], [74, 110]] as const) {
      const held = play('horn', midi, vel, 0.6);
      const tap = play('horn', midi, vel, 0.05);
      expect(db(peak(tap) / peak(held)), `m${midi} v${vel}`).toBeGreaterThan(-8);
      // speaking (10 % of the held note's peak): within 120 ms from mezzo-forte up, 250 ms at pianissimo
      const by = vel >= 60 ? 0.12 : 0.25;
      expect(peak(held, Math.round(T0 * FS), Math.round((T0 + by) * FS)) / peak(held), `m${midi} v${vel} onset`).toBeGreaterThan(0.1);
    }
  });

  it('trombone: a 50 ms tap still speaks, within 8 dB of the held note (the minimum blow)', () => {
    for (const [midi, vel] of [[41, 40], [53, 70], [65, 90], [72, 110]] as const) {
      const held = play('trombone', midi, vel, 0.6);
      const tap = play('trombone', midi, vel, 0.05);
      expect(db(peak(tap) / peak(held)), `m${midi} v${vel}`).toBeGreaterThan(-8);
      // speaking (10 % of the held note's peak): within 150 ms from mezzo-forte up, 300 ms at piano
      const by = vel >= 60 ? 0.15 : 0.3;
      expect(peak(held, Math.round(T0 * FS), Math.round((T0 + by) * FS)) / peak(held), `m${midi} v${vel} onset`).toBeGreaterThan(0.1);
    }
  });

  it('the minimum blow ends: silence after a tap, a held key is untouched, and block size does not matter', () => {
    for (const inst of ['trumpet', 'flute', 'oboe', 'clarinet', 'bassoon', 'horn', 'trombone'] as const) {
      const tap = play(inst, inst === 'trombone' ? 60 : 72, 80, 0.03);
      expect(db(peak(tap, Math.round(0.6 * FS)) / peak(tap)), inst).toBeLessThan(-40);
      expect(play(inst, inst === 'trombone' ? 60 : 72, 80, 0.03, 37), inst).toEqual(tap);
      // a note held past the minimum blow releases exactly when the key does
      const a = play(inst, inst === 'trombone' ? 60 : 72, 80, 0.3);
      const b = play(inst, inst === 'trombone' ? 60 : 72, 80, 0.31);
      const n = Math.round((T0 + 0.3) * FS);
      expect(a.subarray(0, n)).toEqual(b.subarray(0, n));
      expect(a.subarray(n + 480)).not.toEqual(b.subarray(n + 480));
    }
  });
});
