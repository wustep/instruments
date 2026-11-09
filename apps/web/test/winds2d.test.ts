import { describe, expect, it } from 'vitest';
import { fingersFor } from '../src/ui/flute-fingering.ts';
import { buildFluteModel } from '../src/ui/gl/winds3d.ts';
import { VALVE_DOWN, fluteKeysOpen, trumpetAirLength } from '../src/ui/stage-draw.ts';

describe('the 2D winds follow the instruments', () => {
  it('the 2D flute closes the same keys as the 3D model, through the same linkages, for every note of the chart', () => {
    const f = buildFluteModel();
    for (let m = 60; m <= 96; m++) {
      const two = fluteKeysOpen(m);
      expect(two.length).toBe(f.keys.length);
      for (const k of f.keys) {
        const d = two.find((q) => Math.abs(q.x - k.x) < 1e-9);
        expect(d, `a 2D key at ${k.x}`).toBeTruthy();
        expect(d!.open, `m${m}, the key at ${k.x}`).toBe(k.open(fingersFor(m)));
      }
    }
  });

  // the air's path the 2D trumpet draws the standing wave along: the open horn about the engine's
  // 1.48 m less its end corrections, each valve's slide lengthening it by about the engine's own ratio
  // (2nd: a semitone, 1st: a tone, 3rd: three semitones), and the combinations short of their sums
  // (sharp, as on every three-valve trumpet: why the 3rd slide is kicked for 1+3 and 1+2+3)
  it('the 2D trumpet’s air path lengthens with the valves as the engine’s bore does', () => {
    const open = trumpetAirLength('open');
    expect(open).toBeGreaterThan(1.25);
    expect(open).toBeLessThan(1.48);
    const lower: Record<string, number> = { '2': 1, '1': 2, '1+2': 3, '3': 3, '2+3': 4, '1+3': 5, '1+2+3': 6 };
    for (const v of Object.keys(VALVE_DOWN)) {
      if (v === 'open') continue;
      const added = trumpetAirLength(v) - open;
      const want = 1.48 * (2 ** (lower[v] / 12) - 1);
      const msg = `valves ${v}: ${(added * 1000).toFixed(0)} mm added, the engine's ${(want * 1000).toFixed(0)}`;
      if (v.length === 1) {
        expect(added / want, msg).toBeGreaterThan(0.85);
        expect(added / want, msg).toBeLessThan(1.2);
      } else {
        expect(added / want, msg).toBeGreaterThan(0.85);
        expect(added / want, msg).toBeLessThan(1.02);
      }
    }
  });
});
