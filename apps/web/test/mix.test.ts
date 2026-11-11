// The Orchestra's bus (orchestra/mix.ts): 1/√n for parts at their calibrated level; a part played louder
// than its calibration (the engine's PLAYBACK_DB: the trombone's and the timpani's session gain) counts at
// that level, so a lineup of trombones alone sounds as it did before their gain (audio audit 2).
import { describe, expect, it } from 'vitest';
import { busGain } from '../src/orchestra/mix.ts';
import { PLAYBACK_DB } from '../../../packages/engine/src/core/instrument.ts';

describe('the ensemble bus', () => {
  it('n parts at their calibrated level: 1/√n, as before', () => {
    expect(busGain(4)).toBeCloseTo(0.5, 12);
    expect(busGain([0, 0, 0, 0])).toBeCloseTo(0.5, 12);
    expect(busGain([])).toBe(1);
  });
  it('four trombones (the Air): each heard exactly as before their playback gain', () => {
    const tb = PLAYBACK_DB.trombone!;
    expect(tb).toBeGreaterThan(0);
    expect(busGain([tb, tb, tb, tb]) * Math.pow(10, tb / 20)).toBeCloseTo(0.5, 12);
  });
  it('a trombone among others: louder against them than before, the others a little under 1/√n', () => {
    const parts = [0, 0, 0, 0, PLAYBACK_DB.trombone!];
    const g = busGain(parts);
    expect(g).toBeLessThan(busGain(5));
    expect(g * Math.pow(10, PLAYBACK_DB.trombone! / 20)).toBeGreaterThan(busGain(5));
  });
});
