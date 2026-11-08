import { describe, expect, it } from 'vitest';
import { parseMidi } from '../src/midi-file.ts';
import { smf } from './smf.ts';

describe('MIDI file reader', () => {
  it('merges tracks, applies the tempo map, pedals, running status; skips drums', () => {
    const bytes = smf(480, [
      // conductor: 120 bpm, then 60 bpm from beat 2
      [[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20], [960, 0xff, 0x51, 3, 0x0f, 0x42, 0x40]],
      [
        [0, 0xb0, 64, 127], // sustain down
        [0, 0x90, 60, 100], // C4 on
        [480, 64, 90], //       running status: E4 on (t = 0.5 s)
        [480, 60, 0], //        velocity 0 = C4 off (t = 1.0 s)
        [480, 0x80, 64, 0], //  E4 off at tick 1440 = 1.0 s + 480 ticks at 1 s/beat = 2.0 s
        [0, 0x99, 36, 100], //  drum channel: skipped
        [0, 0xb0, 64, 0], //    sustain up
      ],
    ]);
    const s = parseMidi(bytes.buffer as ArrayBuffer);
    const on = s.events.filter((e) => e.kind === 'on');
    expect(on.map((e) => (e.kind === 'on' ? [e.midi, e.vel, +e.t.toFixed(3)] : null))).toEqual([
      [60, 100, 0],
      [64, 90, 0.5],
    ]);
    const off = s.events.filter((e) => e.kind === 'off').map((e) => [e.kind === 'off' && e.midi, +e.t.toFixed(3)]);
    expect(off).toEqual([
      [60, 1],
      [64, 2],
    ]);
    const ped = s.events.filter((e) => e.kind === 'pedal').map((e) => [e.kind === 'pedal' && e.value, +e.t.toFixed(3)]);
    expect(ped).toEqual([
      [1, 0],
      [0, 2],
    ]);
    expect(s.duration).toBeCloseTo(2, 6);
  });

  it('rejects files that are not MIDI', () => {
    expect(() => parseMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]).buffer)).toThrow();
  });
});
