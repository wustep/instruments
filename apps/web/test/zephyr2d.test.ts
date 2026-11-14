// The zephyr on the 2D stage (zephyr-plan.ts, zephyr-draw.ts, vector/zephyr.ts): its plan as it would be
// built (a sail: the mast, the yard over the ribbons' tops, the boom with its keyboard, the wind's blade
// across the ribbons at their slots; 61 ribbons plumb over their keys, each the engine's length), the
// ribbons swinging as wide as the engine says, a slot lit and its key down while it blows; its layout fits a
// laptop's stage, a phone's and an Orchestra cell; both styles draw, silent and sounding.
import { describe, expect, it } from 'vitest';
import { ZEPHYR_SLOT, zephyrStrings, type VisualFrame } from '@piano-model/engine';
import { BLADE, BOARD_Y, BOOM_X0, BOOM_X1, BRIDGE_H, KEYS_X0, KEYS_X1, KEYS_Y0, KEYS_Y1, MAST_X, MAST_Y1, PITCH, RIBBONS, RIBBON_X, RIBBON_Y0, RIBBON_Y1, WHITES, WHITE_W, ZP_X0, ZP_X1, ZP_Y0, ZP_Y1, kindOf, slotY, whiteX, yardLower, yardUpper } from '../src/ui/zephyr-plan.ts';
import { drawZephyr, newZephyrState, ribbonInk, swingPx, zephyrBox, zephyrLayout } from '../src/ui/zephyr-draw.ts';
import { drawZephyrV } from '../src/ui/vector/zephyr.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

installCanvas();
/** a frame of the engine: these ribbons swinging (index → swing 0…1), their slots blowing */
const frame = (amps: Record<number, number>, winds: Record<number, number> = amps): VisualFrame => {
  const amp = new Float32Array(61);
  const wind = new Float32Array(61);
  for (const [i, a] of Object.entries(amps)) amp[+i] = a;
  for (const [i, w] of Object.entries(winds)) wind[+i] = w;
  const shapes = Object.keys(amps).slice(0, 4).map((i) => ({ string: +i, shape: Float32Array.from({ length: 33 }, (_, k) => Math.sin((Math.PI * k) / 32) * 0.005) }));
  return { focus: { midi: 60, f1: 261.6, shapes: [new Float32Array(160)] }, zephyr: { amp, swing: amp.map((a) => a * 0.01), wind, shapes, last: 24, ago: 0.1, vel: 80, chest: 1 } } as unknown as VisualFrame;
};

describe('the 2D zephyr’s plan: a sail', () => {
  it('2.1 m to the mast’s head, a metre across; 61 ribbons a semitone of keys apart, each plumb, the engine’s length, standing on the bridge', () => {
    expect(MAST_Y1).toBeGreaterThan(2.05);
    expect(MAST_Y1).toBeLessThan(2.25);
    expect(ZP_X1 - ZP_X0).toBeGreaterThan(1.0);
    expect(ZP_X1 - ZP_X0).toBeLessThan(1.3);
    expect(RIBBONS.length).toBe(61);
    const S = zephyrStrings();
    for (let i = 0; i < 61; i++) {
      expect(RIBBON_Y1[i] - RIBBON_Y0[i]).toBeCloseTo(S[i].length, 9);
      expect(RIBBON_Y0[i]).toBeCloseTo(BOARD_Y + BRIDGE_H, 9);
      if (i) expect(RIBBON_X[i] - RIBBON_X[i - 1]).toBeCloseTo(PITCH, 9);
    }
    // an octave of ribbons is an octave of keys (165 mm), and the mast stands clear of the first
    expect(RIBBON_X[12] - RIBBON_X[0]).toBeCloseTo(0.165, 6);
    expect(RIBBON_X[0]).toBeGreaterThan(MAST_X + 0.05);
    // the yard: over every ribbon's top, falling all the way from the mast to the treble end
    for (let i = 0; i < 61; i++) {
      expect(yardLower[i + 1][1]).toBeGreaterThan(RIBBON_Y1[i]);
      expect(yardUpper[i + 1][1]).toBeGreaterThan(yardLower[i + 1][1] + 0.02);
      if (i) expect(yardLower[i + 1][1]).toBeLessThan(yardLower[i][1]);
    }
    // the boom carries the bridge from end to end, at a keyboard's height
    expect(BOOM_X0).toBeLessThan(RIBBON_X[0]);
    expect(BOOM_X1).toBeGreaterThan(RIBBON_X[60]);
    expect(KEYS_Y1).toBeGreaterThan(0.7);
    expect(KEYS_Y1).toBeLessThan(0.76);
  });
  it('the keyboard: 61 keys under their ribbons, 36 naturals; the blade crosses every ribbon at its slot, 0.38 of the way up', () => {
    expect(WHITES).toBe(36);
    expect(RIBBONS.filter((r) => !r.sharp).length).toBe(36);
    expect(whiteX(36)).toBeCloseTo(KEYS_X0 + 36 * WHITE_W, 9);
    expect(Math.abs(whiteX(36) - KEYS_X1)).toBeLessThan(0.02);
    expect(KEYS_Y1).toBeGreaterThan(KEYS_Y0);
    // each natural's key is under its ribbon (its ribbon within the key, or a few millimetres off its edge)
    let k = 0;
    for (let i = 0; i < 61; i++) {
      if (RIBBONS[i].sharp) continue;
      expect(RIBBON_X[i]).toBeGreaterThan(whiteX(k) - 0.012);
      expect(RIBBON_X[i]).toBeLessThan(whiteX(k + 1) + 0.012);
      k++;
    }
    const inBlade = (x: number, y: number) => {
      // (the blade's outline at x: between its lower and its upper edge)
      const lo = BLADE.slice(0, BLADE.length / 2);
      const hi = BLADE.slice(BLADE.length / 2).reverse();
      const at = (pts: [number, number][]) => {
        for (let j = 1; j < pts.length; j++) if (x <= pts[j][0] + 1e-9) return pts[j - 1][1] + ((pts[j][1] - pts[j - 1][1]) * (x - pts[j - 1][0])) / (pts[j][0] - pts[j - 1][0]);
        return pts[pts.length - 1][1];
      };
      return y >= at(lo) - 1e-9 && y <= at(hi) + 1e-9;
    };
    for (let i = 0; i < 61; i++) {
      const [a, b] = slotY(i);
      expect((a + b) / 2).toBeCloseTo(RIBBON_Y0[i] + ZEPHYR_SLOT * RIBBONS[i].length, 9);
      expect(b - a).toBeCloseTo(RIBBONS[i].slot, 9);
      expect(inBlade(RIBBON_X[i], a), `ribbon ${i} slot foot`).toBe(true);
      expect(inBlade(RIBBON_X[i], b), `ribbon ${i} slot top`).toBe(true);
    }
    // the Cs warm, the accidentals dark, the other naturals pale
    expect(kindOf(0)).toBe('c');
    expect(kindOf(1)).toBe('sharp');
    expect(kindOf(2)).toBe('natural');
    expect(kindOf(60)).toBe('c');
    expect(ribbonInk(0)).toBe(ribbonInk(12));
    expect(ribbonInk(0)).not.toBe(ribbonInk(2));
    expect(ribbonInk(1)).not.toBe(ribbonInk(2));
  });
});

describe('the 2D zephyr’s layout', () => {
  const b = zephyrBox();
  const cells: [string, number, number, number][] = [
    ['a laptop’s stage', 1440, 551, 39],
    ['a phone’s stage', 390, 480, 47],
    ['Orchestra 200 px/m', Math.round(b.w * 200), Math.round(b.h * 200), 0],
    ['Orchestra 60 px/m', Math.round(b.w * 60), Math.round(b.h * 60), 0],
  ];
  for (const [name, W, H, top] of cells)
    it(`${name} (${W}×${H}, ${top} px of player): whole in its box under the player`, () => {
      const L = zephyrLayout(W, H, top);
      const X = (x: number) => L.ox + x * L.sc;
      const Y = (y: number) => L.oy - y * L.sc;
      for (const [x, y] of [[ZP_X0, ZP_Y0], [ZP_X1, ZP_Y1]]) {
        expect(X(x)).toBeGreaterThanOrEqual(0);
        expect(X(x)).toBeLessThanOrEqual(W);
        expect(Y(y)).toBeGreaterThanOrEqual(top);
        expect(Y(y)).toBeLessThanOrEqual(H);
      }
      if (name.startsWith('Orchestra')) expect(Math.abs(L.sc / Number(name.split(' ')[1]) - 1)).toBeLessThan(0.01);
      else expect(Math.max(((ZP_X1 - ZP_X0) * L.sc) / W, ((ZP_Y1 - ZP_Y0) * L.sc) / (H - top))).toBeCloseTo(0.9, 6);
    });
});

describe('the 2D zephyr draws, both styles', () => {
  for (const [name, draw] of [['classic', drawZephyr], ['vector', drawZephyrV]] as const)
    it(`${name}: silent, then ribbons swinging (as wide as the engine says, the loudest widest), their slots lit and their keys down; a phone and an Orchestra cell`, async () => {
      const st = newZephyrState();
      const { ctx } = recorder();
      draw(ctx, 1440, 551, null, st, 39);
      expect(st.drawn?.ringing).toBe(0);
      expect(st.drawn?.blowing).toBe(0);
      expect(st.drawn?.down).toEqual([]);
      // the sound leaves from the soundboard, under the ribbons
      expect(st.src!.y).toBeGreaterThan(st.drawn!.ribbons.y1 - 1);
      expect(st.drawn!.keys.y0).toBeGreaterThan(st.drawn!.ribbons.y1);
      expect(st.drawn!.blade.y0).toBeGreaterThan(st.drawn!.ribbons.y0);
      expect(st.drawn!.blade.y1).toBeLessThan(st.drawn!.ribbons.y1);
      const step = async (fr: VisualFrame | null, n: number) => {
        for (let k = 0; k < n; k++) {
          draw(ctx, 1440, 551, fr, st, 39);
          await new Promise((r) => setTimeout(r, 8));
        }
      };
      // C4 loud, G2 softer, one more barely (its slot shut already: it is dying away)
      await step(frame({ 24: 0.8, 7: 0.2, 40: 0.02 }, { 24: 1, 7: 0.5 }), 10);
      expect(st.drawn?.ringing).toBe(3);
      expect(st.drawn?.widest).toBe(24);
      expect(st.drawn!.swing).toBeGreaterThan(1.5);
      expect(st.drawn?.blowing).toBe(2);
      expect(st.drawn?.down).toEqual([7, 24]);
      // each lit slot is on its own ribbon, inside the blade's box
      for (const s of st.drawn!.slots) {
        expect(s.box.y0).toBeGreaterThanOrEqual(st.drawn!.blade.y0 - 1);
        expect(s.box.y1).toBeLessThanOrEqual(st.drawn!.blade.y1 + 1);
        expect(s.box.x1 - s.box.x0).toBeGreaterThan(1);
      }
      expect(swingPx(0.8, 24, 250)).toBeGreaterThan(swingPx(0.2, 24, 250));
      expect(swingPx(0, 24, 250)).toBe(0);
      // (never as wide as into the next ribbon but one)
      expect(swingPx(1, 0, 250)).toBeLessThanOrEqual(1.6 * PITCH * 250 + 1e-9);
      // silence: the ribbons come to rest and the slots go dark
      await step(frame({}), 40);
      expect(st.drawn?.ringing).toBe(0);
      expect(st.drawn?.blowing).toBe(0);
      // a phone's box and an Orchestra cell draw as well
      draw(ctx, 390, 480, frame({ 24: 0.5 }), st, 47);
      expect(st.drawn!.body.y0).toBeGreaterThanOrEqual(47);
      const b = zephyrBox();
      draw(ctx, Math.round(b.w * 60), Math.round(b.h * 60), frame({ 5: 0.5 }), st, 0);
      expect(st.drawn!.body.x1).toBeLessThanOrEqual(Math.round(b.w * 60));
    });
});
