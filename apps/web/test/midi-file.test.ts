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

  it('keeps each line apart: a track per part (format 1), a channel per part (format 0), names, programs, ranges', () => {
    const name = (t: string) => [0xff, 0x03, t.length, ...[...t].map((c) => c.charCodeAt(0))];
    const fmt1 = smf(480, [
      [[0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20]],
      [[0, ...name('Violin I')], [0, 0xc0, 40], [0, 0x90, 76, 90], [480, 0x80, 76, 0], [0, 0x90, 79, 90], [480, 0x80, 79, 0]],
      [[0, ...name('Piano')], [0, 0xc1, 0], [0, 0x91, 48, 80], [0, 0x91, 52, 80], [0, 0x91, 55, 80], [960, 0x81, 48, 0], [0, 0x81, 52, 0], [0, 0x81, 55, 0]],
    ]);
    const a = parseMidi(fmt1.buffer as ArrayBuffer);
    expect(a.lines.map((l) => [l.track, l.name, l.program, l.notes, l.lo, l.hi, l.poly])).toEqual([
      [1, 'Violin I', 40, 2, 76, 79, 1],
      [2, 'Piano', 0, 3, 48, 55, 3],
    ]);
    expect(a.events.filter((e) => e.kind === 'on').map((e) => e.line)).toEqual([0, 1, 1, 1, 0]);
    // format 0: two channels in one track are two lines
    const fmt0 = smf(480, [[[0, 0xc0, 73], [0, 0xc1, 42], [0, 0x90, 72, 80], [0, 0x91, 40, 80], [480, 0x80, 72, 0], [0, 0x81, 40, 0]]]);
    const b = parseMidi(fmt0.buffer as ArrayBuffer);
    expect(b.lines.map((l) => [l.channel, l.program, l.median])).toEqual([
      [0, 73, 72],
      [1, 42, 40],
    ]);
  });

  it('rejects files that are not MIDI', () => {
    expect(() => parseMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]).buffer)).toThrow();
  });
});
