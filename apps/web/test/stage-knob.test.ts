// The stage's knobs (ui/stage-knob.ts): the grand's lid and the room (reverb). Turned by a drag (up
// or right = more, Shift finer), they are continuous and stay wherever they are let go; with notches
// (the 3D lid: shut, the short stick, the long stick) they click into the nearest as they turn, and
// their arrows step a notch. The arrows move a continuous knob by 0.05, as the grips' did.
import { describe, expect, it } from 'vitest';
import { KNOB_STEP, detent, keyTo, knobAngle, turnTo } from '../src/ui/stage-knob.ts';
import { LID_HALF, LID_RESTS } from '../src/ui/lid.ts';

describe('the stage’s knobs', () => {
  it('sweep 270°, from −135° (0) to +135° (1), as the fallboard’s', () => {
    expect((knobAngle(0) * 180) / Math.PI).toBeCloseTo(-135, 9);
    expect((knobAngle(0.5) * 180) / Math.PI).toBeCloseTo(0, 9);
    expect((knobAngle(1) * 180) / Math.PI).toBeCloseTo(135, 9);
    expect(knobAngle(2)).toBe(knobAngle(1));
    expect(knobAngle(-1)).toBe(knobAngle(0));
  });

  it('turn with a drag: up or right is more, a whole turn in ≈ 167 px (Shift: four times finer); any value between, held at the ends', () => {
    expect(turnTo(0.3, 0, -50)).toBeCloseTo(0.6, 9);
    expect(turnTo(0.3, 50, 0)).toBeCloseTo(0.6, 9);
    expect(turnTo(0.3, 0, 50)).toBeCloseTo(0, 9);
    expect(turnTo(0.3, 0, -50, true)).toBeCloseTo(0.375, 9);
    expect(turnTo(0, 0, -1000 / 6)).toBeCloseTo(1, 9);
    expect(turnTo(0.9, 0, -400)).toBe(1);
    expect(turnTo(0.1, -400, 0)).toBe(0);
    // continuous: every pixel moves it (no rest it is put onto)
    const seen = new Set<number>();
    for (let px = 0; px <= 100; px++) seen.add(Math.round(turnTo(0.2, 0, -px) * 1e6));
    expect(seen.size).toBe(101);
    expect(detent(0.537, null)).toBe(0.537);
  });

  it('with notches (the 3D lid), a turn clicks into the nearest notch, the higher halfway', () => {
    const at = (u: number) => detent(u, LID_RESTS);
    expect([0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.72, 0.73, 0.9, 1].map(at)).toEqual([0, 0, 0, LID_HALF, LID_HALF, LID_HALF, LID_HALF, 1, 1, 1]);
    expect(at(LID_HALF / 2)).toBe(LID_HALF);
    // from the long stick, a drag down clicks to the short stick, then shut: never in between
    const out = new Set<number>();
    for (let px = 0; px <= 200; px += 2) out.add(at(turnTo(1, 0, px)));
    expect([...out]).toEqual([1, LID_HALF, 0]);
  });

  it('the keys: the arrows by 0.05 (with notches, to the next notch that way), Home and End to the ends; other keys are not theirs', () => {
    expect(KNOB_STEP).toBe(0.05);
    expect(keyTo(0.3, 'ArrowUp', null)).toBeCloseTo(0.35, 9);
    expect(keyTo(0.3, 'ArrowRight', null)).toBeCloseTo(0.35, 9);
    expect(keyTo(0.3, 'ArrowDown', null)).toBeCloseTo(0.25, 9);
    expect(keyTo(0.3, 'ArrowLeft', null)).toBeCloseTo(0.25, 9);
    expect(keyTo(0.98, 'ArrowUp', null)).toBe(1);
    expect(keyTo(0.02, 'ArrowDown', null)).toBe(0);
    expect(keyTo(0.3, 'Home', null)).toBe(0);
    expect(keyTo(0.3, 'End', null)).toBe(1);
    expect(keyTo(0.3, 'a', null)).toBeNull();
    expect(keyTo(0.3, 'Enter', LID_RESTS)).toBeNull();
    const up = (v: number) => keyTo(v, 'ArrowUp', LID_RESTS);
    const down = (v: number) => keyTo(v, 'ArrowDown', LID_RESTS);
    expect([0, 0.3, LID_HALF, 0.7, 1].map(up)).toEqual([LID_HALF, LID_HALF, 1, 1, 1]);
    expect([0, 0.3, LID_HALF, 0.7, 1].map(down)).toEqual([0, 0, 0, LID_HALF, LID_HALF]);
    expect(keyTo(LID_HALF, 'Home', LID_RESTS)).toBe(0);
    expect(keyTo(0, 'End', LID_RESTS)).toBe(1);
  });
});
