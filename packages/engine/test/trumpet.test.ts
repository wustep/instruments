// Trumpet: real B♭ fingerings, in tune, brighter when louder (the lip nonlinearity).
import { describe, expect, it } from 'vitest';
import { renderInstrument, trumpetFingering } from '../src/core/index.ts';
import { analyzeSustained, segmentNotes } from '../src/analysis/index.ts';

const FS = 44100;
const play = (m: number, v: number) => {
  const r = renderInstrument({ sampleRate: FS, instrument: 'trumpet', dry: true, params: { vibrato: 0 } as never, events: [{ time: 0.1, event: { type: 'noteOn', midi: m, velocity: v } }, { time: 1.5, event: { type: 'noteOff', midi: m } }] as never, duration: 1.9 });
  const x = r.left;
  const seg = segmentNotes(x, FS).reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
  return analyzeSustained(x, FS, seg, m);
};

describe('trumpet', () => {
  it('fingers like a B♭ trumpet', () => {
    // concert pitch: B♭3 open, A3 2nd valve, G3 1+2, E3 all three, F4 open (3rd partial), D4 1+2
    expect(trumpetFingering(58)).toMatchObject({ partial: 2, valves: 'open' });
    expect(trumpetFingering(57).valves).toBe('2');
    expect(trumpetFingering(55).valves).toBe('1+2');
    expect(trumpetFingering(52).valves).toBe('1+2+3');
    expect(trumpetFingering(65)).toMatchObject({ partial: 3, valves: 'open' });
    expect(trumpetFingering(62).valves).toBe('1+2');
  });

  it('plays in tune across the range and brightens when louder', () => {
    for (const m of [55, 62, 70, 77]) {
      const soft = play(m, 45);
      const loud = play(m, 110);
      expect(Math.abs(soft.cents), `m${m} soft`).toBeLessThan(10);
      expect(Math.abs(loud.cents), `m${m} loud`).toBeLessThan(10);
      expect(loud.centroid / soft.centroid, `m${m}`).toBeGreaterThan(1.1);
    }
  });
});
