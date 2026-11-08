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

describe('sympathetic strings on the stage', () => {
  it('a bass note leaves the undamped treble dark; a pedalled octave rings visibly but faintly', () => {
    // the stage asks ~60 times a second; do the same over the last 0.25 s
    const watch = (core: ReturnType<typeof render>['core']) => {
      let v = core.getVisual();
      for (let k = 0; k < 15; k++) {
        render([], 1 / 60, {}, core);
        v = core.getVisual();
      }
      return v;
    };
    // no pedal: only the undamped top (F6 and up on the grand) can ring with A1
    const a = watch(render([on(0.01, 33, 90)], 0.3).core);
    const topSym = Math.max(...Array.from(a.symLevels!.subarray(89 - 21)));
    expect(topSym).toBeLessThan(0.01); // real motion ~ −70 dB re the struck string
    // with the pedal, C3 rings with C2 (its 2nd partial) — visible, but well below the struck string
    const b = watch(render([ped(0, 1), on(0.01, 36, 100)], 1.25).core);
    const c3 = b.symLevels![48 - 21];
    expect(c3).toBeGreaterThan(0.03);
    expect(c3).toBeLessThan(0.6);
  });
});
