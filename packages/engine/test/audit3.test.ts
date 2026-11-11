// Audio audit, round 3, the strings (artifacts/round3/audio-audit-3/strings/NOTES.md): what it fixed stays fixed.
import { describe, expect, it } from 'vitest';
import { renderInstrument } from '../src/core/index.ts';

type Ev = { time: number; event: Record<string, unknown> };
const on = (time: number, midi: number, velocity: number): Ev => ({ time, event: { type: 'noteOn', midi, velocity } });
const off = (time: number, midi: number): Ev => ({ time, event: { type: 'noteOff', midi } });
/** dB RMS of the mono sum between two times */
const level = (r: { left: Float32Array; right: Float32Array; sampleRate: number }, a: number, b: number) => {
  let s = 0;
  const i0 = Math.round(a * r.sampleRate);
  const i1 = Math.round(b * r.sampleRate);
  for (let i = i0; i < i1; i++) s += (0.5 * (r.left[i] + r.right[i])) ** 2;
  return 10 * Math.log10(Math.max(1e-24, s / (i1 - i0)));
};

describe('the viola’s idle open strings (loosely coupled to the bridge, its bands refitted)', () => {
  // as the judge holds a note: mf, dry, 44.1 kHz, no vibrato, the level once the note has settled
  const held = new Map<number, number>();
  const lv = (m: number) => {
    if (!held.has(m)) held.set(m, level(renderInstrument({ sampleRate: 44100, instrument: 'viola', events: [on(0.1, m, 70)] as never, duration: 2.6, dry: true, params: { vibrato: 0 } }), 1, 2.6));
    return held.get(m)!;
  };
  it('A♯4 stands no more than 7.5 dB over A4 and B4 (it was 9.8 dB: they played 9–11 dB under the recording’s)', () => {
    expect(lv(70) - (lv(69) + lv(71)) / 2).toBeLessThan(7.5);
  });
  it('G4, the open G’s octave, is no more than 6 dB under F♯4 and A♭4 (it was 11.8 dB: the open string pinned the bridge)', () => {
    expect(lv(67) - (lv(66) + lv(68)) / 2).toBeGreaterThan(-6);
  });
  it('after D5, which rings the open D, the sound is 25 dB under the note 0.3–0.5 s after the bow has left (it was 13 dB)', () => {
    const r = renderInstrument({ sampleRate: 48000, instrument: 'viola', events: [on(0.05, 74, 100), off(0.65, 74)] as never, duration: 1.2, dry: true, params: { vibrato: 0 } });
    expect(level(r, 0.95, 1.15) - level(r, 0.35, 0.65)).toBeLessThan(-25);
  });
});
