// The stage shows every sounding string: the visual state carries a shape for each
// active voice (struck and sympathetic), not just the last struck note.
import { describe, expect, it } from 'vitest';
import { on, ped, render } from './helpers.ts';

describe('visual state', () => {
  it('several held notes all report their moving strings; the pedal adds sympathetic ones', () => {
    const held = [48, 55, 64, 72];
    const { core } = render([ped(0, 1), ...held.map((m, i) => on(0.01 + i * 0.02, m, 90))], 0.5);
    const v = core.getVisual();
    const ps = v.pianoShapes!;
    const struck = new Map<number, number>();
    for (let j = 0; j < ps.midi.length; j++) {
      if (ps.light[j]) continue;
      let mx = 0;
      for (let i = 0; i < ps.points; i++) mx = Math.max(mx, Math.abs(ps.shapes[j * ps.points + i]));
      struck.set(ps.midi[j], mx);
    }
    for (const m of held) expect(struck.get(m) ?? 0, `m${m}`).toBeGreaterThan(1e-9);
    expect(Array.from(ps.light).filter((x) => x === 1).length).toBeGreaterThan(0);
  });
});
