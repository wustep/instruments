// The bow off the string in a rest, as the pictures draw it: the engine says how far it is lifted
// (bowed.ts BOW_AIR, VisualFrame.bow.lift); the 3D bow stands that far clear of the strings, and the 2D
// styles fade it by it inside a phrase and keep it off the string when the stage is at rest.
import { describe, expect, it } from 'vitest';
import { BOWED } from '../../../packages/engine/src/core/bowed.ts';
import type { VisualFrame } from '@piano-model/engine';
import { Batch } from '../src/ui/gl/gl3d.ts';
import { buildBowedModel, poseBowed } from '../src/ui/gl/strings3d.ts';
import { bowLift, type BowedLive } from '../src/ui/stage-draw.ts';

const live = (): BowedLive => ({ id: 'violin', t: 0, cx: 0, cz: 0, incl: 0, lift: 1, bi: 1, beta: 0.1, fx: [0, 0, 0, 0], fa: [0, 0, 0, 0], vlo: [0, 0, 0, 0], vhi: [0, 0, 0, 0], env: new Float32Array(0) });

describe('the bow off the string in a rest, as it is drawn', () => {
  it('3D: lifted, the bow stands clear of the strings, straight up from them: a violin’s by 5 cm, a bass’s by twice that; on the string it is where it was', () => {
    const high: Record<string, number> = {};
    for (const id of ['violin', 'viola', 'cello', 'bass'] as const) {
      const d = BOWED[id];
      const bm = buildBowedModel({ id, L: d.L, bowLength: d.bowLength, strings: d.strings.map((s) => ({ name: s.name, open: s.open })) });
      const frame = (lift?: number) =>
        ({
          strings: d.strings.map((s) => ({ open: s.open, stop: 1, stopNow: 1, level: 0, bowing: false })),
          focus: null,
          bow: { dir: 1, pos: 0.5, changing: false, speed: 0, ...(lift === undefined ? {} : { lift }) },
        }) as unknown as VisualFrame;
      const line = (lift?: number) => {
        poseBowed(new Batch(), bm, frame(lift), { of: () => 1 });
        return { a: [...bm.bowLine!.a], b: [...bm.bowLine!.b] };
      };
      const on = line(0);
      // (an engine that says nothing of it: on the string, as before)
      const old = line();
      const up = line(1);
      const half = line(0.5);
      const mid = (l: { a: number[]; b: number[] }) => l.a.map((v, k) => (v + l.b[k]) / 2);
      const dist = (p: number[], q: number[]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      expect(dist(mid(old), mid(on))).toBeLessThan(1e-6);
      // the point of the hair over the string (the middle, at pos 0.5) goes straight off the strings
      const h = dist(mid(up), mid(on));
      high[id] = h;
      expect(dist(mid(half), mid(on)) / h).toBeCloseTo(0.5, 2);
      const hair = on.b.map((v, k) => v - on.a[k]);
      const len = Math.hypot(hair[0], hair[1], hair[2]);
      const move = mid(up).map((v, k) => v - mid(on)[k]);
      expect(Math.abs(move[0] * hair[0] + move[1] * hair[1] + move[2] * hair[2]) / (len * h)).toBeLessThan(0.05);
      // the hair as long as ever, the frog's end a little the higher of the two
      const upHair = up.b.map((v, k) => v - up.a[k]);
      expect(Math.hypot(upHair[0], upHair[1], upHair[2])).toBeCloseTo(len, 4);
      expect(dist(up.a, on.a)).toBeGreaterThan(dist(up.b, on.b));
    }
    expect(high.violin).toBeGreaterThan(0.045);
    expect(high.violin).toBeLessThan(0.06);
    expect(high.viola).toBeGreaterThan(high.violin);
    expect(high.cello).toBeGreaterThan(high.viola);
    expect(high.bass).toBeGreaterThan(0.09);
    expect(high.bass).toBeLessThan(0.12);
  });

  it('2D: inside a phrase the bow is as far off the string as the engine has it; with nothing bowed for a while, off it, as the stage at rest has always shown it', () => {
    const lv = live();
    // sounding: on the string
    expect(bowLift(lv, true, 0, 0.016)).toBe(0);
    expect(lv.quiet).toBe(0);
    // a gap too short to lift it in (the engine: 0): it stays down; it used to begin to fade after every note
    expect(bowLift(lv, false, 0, 0.05)).toBe(0);
    // a rest: where the engine has it
    expect(bowLift(lv, false, 0.4, 0.2)).toBe(0.4);
    // … and once nothing has been bowed for over 0.6 s, off the string whatever the engine says
    expect(bowLift(lv, false, 0.4, 0.4)).toBe(1);
    expect(bowLift(lv, false, 0, 5)).toBe(1);
    // a note: down again, and the count begins anew
    expect(bowLift(lv, true, 0, 0.016)).toBe(0);
    expect(bowLift(lv, false, 0.2, 0.1)).toBe(0.2);
    // an engine that says nothing of it (an older frame, no engine yet): as before, off when nothing sounds
    expect(bowLift(live(), false, undefined, 0.016)).toBe(1);
  });
});
