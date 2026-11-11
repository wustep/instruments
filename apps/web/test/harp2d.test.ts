// The harp on the 2D stage (harp-plan.ts, harp-draw.ts, vector/harp.ts): its plan at a concert grand harp's
// measures (1.88 m tall, 47 strings plumb between the neck's curve and the rising soundboard, each the
// engine's length), the strings swinging as wide as the engine says, the pedals in their notches and the
// strings stopped by their discs; its layout fits a laptop's stage, a phone's and an Orchestra cell; both
// styles draw, silent and sounding.
import { describe, expect, it } from 'vitest';
import { HARP_PEDALS, harpStrings, type VisualFrame } from '@piano-model/engine';
import { BOARD_A, BOARD_B, COLUMN_X, CROWN_Y, HP_X0, HP_X1, HP_Y0, HP_Y1, PEDAL_STEP, PEDAL_X, STRINGS, STRING_X, STRING_Y0, STRING_Y1, boardY, neckLower, neckUpper, pedalFoot, pedalOf, stopY } from '../src/ui/harp-plan.ts';
import { drawHarp, harpBox, harpLayout, newHarpState, stringInk, swingPx } from '../src/ui/harp-draw.ts';
import { drawHarpV } from '../src/ui/vector/harp.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

installCanvas();
/** a frame of the engine: these strings ringing (index → swing 0…1), the pedals as set */
const frame = (amps: Record<number, number>, set = [0, 0, 0, 0, 0, 0, 0], pedals = set): VisualFrame => {
  const amp = new Float32Array(47);
  for (const [i, a] of Object.entries(amps)) amp[+i] = a;
  const shapes = Object.keys(amps).slice(0, 8).map((i) => ({ string: +i, shape: Float32Array.from({ length: 32 }, (_, k) => Math.sin((Math.PI * k) / 31) * amps[+i]) }));
  return { focus: { midi: 60, f1: 261.6, shapes: [new Float32Array(160)] }, harp: { pedals, set, amp, last: 21, ago: 0.1, vel: 80, plucked: Array.from({ length: 47 }, () => -1), shapes } } as unknown as VisualFrame;
};

describe('the 2D harp’s plan, at a concert grand harp’s measures', () => {
  it('1.9 m to its crown, the column at the left, 47 strings 17 to 12.6 mm apart, each plumb and the engine’s length', () => {
    expect(CROWN_Y).toBeGreaterThan(1.85);
    expect(CROWN_Y).toBeLessThan(1.92);
    expect(HP_Y1 - HP_Y0).toBeLessThan(1.95);
    expect(HP_X1 - HP_X0).toBeGreaterThan(0.85);
    expect(HP_X1 - HP_X0).toBeLessThan(1.05);
    expect(STRINGS.length).toBe(47);
    const S = harpStrings();
    for (let i = 0; i < 47; i++) {
      expect(STRING_Y1[i] - STRING_Y0[i]).toBeCloseTo(S[i].length, 9);
      expect(STRING_Y0[i]).toBeCloseTo(boardY(STRING_X[i]), 9);
      if (i) {
        const gap = STRING_X[i] - STRING_X[i - 1];
        expect(gap).toBeGreaterThan(0.0125);
        expect(gap).toBeLessThan(0.0171);
      }
    }
    expect(STRING_X[0]).toBeGreaterThan(COLUMN_X + 0.04);
    // the soundboard rises from the base to the knee; every string's foot is on it
    expect(BOARD_B[1] - BOARD_A[1]).toBeGreaterThan(1);
    // the neck's harmonic curve: over every string's top, highest at the column, dipping, up again at the knee
    for (let i = 0; i < 47; i++) {
      expect(neckLower[i + 1][1]).toBeGreaterThan(STRING_Y1[i]);
      expect(neckUpper[i + 1][1]).toBeGreaterThan(neckLower[i + 1][1] + 0.04);
    }
    const tops = STRING_Y1;
    const low = tops.indexOf(Math.min(...tops));
    expect(tops[0]).toBeGreaterThan(1.75);
    expect(low).toBeGreaterThan(28);
    expect(low).toBeLessThan(42);
    expect(tops[46]).toBeGreaterThan(tops[low] + 0.05);
  });
  it('seven pedals in the order at the feet (D C B | E F G A), three notches each; a pedal down stops its strings a semitone or two short', () => {
    expect(PEDAL_X.length).toBe(7);
    for (let k = 1; k < 7; k++) expect(PEDAL_X[k]).toBeGreaterThan(PEDAL_X[k - 1]);
    // the feet's gap between B and E
    expect(PEDAL_X[3] - PEDAL_X[2]).toBeGreaterThan(1.5 * (PEDAL_X[1] - PEDAL_X[0]));
    expect(pedalFoot(0, -1)[1] - pedalFoot(0, 0)[1]).toBeCloseTo(PEDAL_STEP, 9);
    expect(pedalFoot(0, 0)[1] - pedalFoot(0, 1)[1]).toBeCloseTo(PEDAL_STEP, 9);
    // every C string belongs to the C pedal, and so on
    for (let i = 0; i < 47; i++) expect(HARP_PEDALS[pedalOf(i)]).toBe(STRINGS[i].letter);
    // flat: open; natural: a semitone shorter; sharp: two
    const L = STRINGS[21].length;
    expect(stopY(21, -1)).toBeCloseTo(STRING_Y1[21], 9);
    expect(STRING_Y1[21] - stopY(21, 0)).toBeCloseTo(L * (1 - 2 ** (-1 / 12)), 9);
    expect(STRING_Y1[21] - stopY(21, 1)).toBeCloseTo(L * (1 - 2 ** (-2 / 12)), 9);
    // the Cs red, the Fs dark, the others their own
    expect(stringInk(21)).not.toBe(stringInk(22));
    expect(stringInk(21)).toBe(stringInk(28));
    expect(stringInk(24)).toBe(stringInk(31));
    expect(stringInk(22)).toBe(stringInk(23));
    expect(stringInk(0)).toBe(stringInk(7));
    expect(stringInk(1)).not.toBe(stringInk(22));
  });
});

describe('the 2D harp’s layout', () => {
  const b = harpBox();
  const cells: [string, number, number, number][] = [
    ['a laptop’s stage', 1440, 551, 39],
    ['a phone’s stage', 390, 480, 47],
    ['Orchestra 200 px/m', Math.round(b.w * 200), Math.round(b.h * 200), 0],
    ['Orchestra 60 px/m', Math.round(b.w * 60), Math.round(b.h * 60), 0],
  ];
  for (const [name, W, H, top] of cells)
    it(`${name} (${W}×${H}, ${top} px of player): whole in its box under the player`, () => {
      const L = harpLayout(W, H, top);
      const X = (x: number) => L.ox + x * L.sc;
      const Y = (y: number) => L.oy - y * L.sc;
      for (const [x, y] of [[HP_X0, HP_Y0], [HP_X1, HP_Y1]]) {
        expect(X(x)).toBeGreaterThanOrEqual(0);
        expect(X(x)).toBeLessThanOrEqual(W);
        expect(Y(y)).toBeGreaterThanOrEqual(top);
        expect(Y(y)).toBeLessThanOrEqual(H);
      }
      if (name.startsWith('Orchestra')) expect(Math.abs(L.sc / Number(name.split(' ')[1]) - 1)).toBeLessThan(0.01);
      else expect(Math.max(((HP_X1 - HP_X0) * L.sc) / W, ((HP_Y1 - HP_Y0) * L.sc) / (H - top))).toBeCloseTo(0.9, 6);
    });
});

describe('the 2D harp draws, both styles', () => {
  for (const [name, draw] of [['classic', drawHarp], ['vector', drawHarpV]] as const)
    it(`${name}: silent, then strings ringing (as wide as the engine says, the loudest widest), a pedal moved and its strings stopped shorter; a phone and an Orchestra cell`, async () => {
      const st = newHarpState();
      const { ctx } = recorder();
      draw(ctx, 1440, 551, null, st, 39);
      expect(st.drawn?.ringing).toBe(0);
      expect(st.drawn?.set).toEqual([0, 0, 0, 0, 0, 0, 0]);
      const rest = st.drawn!.pedalY.slice();
      // the sound leaves from the soundboard, right of the column
      expect(st.src!.x).toBeGreaterThan(720 - 100);
      const step = async (fr: VisualFrame | null, n: number) => {
        for (let k = 0; k < n; k++) {
          draw(ctx, 1440, 551, fr, st, 39);
          await new Promise((r) => setTimeout(r, 8));
        }
      };
      // C4 loud, G2 softer, one more barely
      await step(frame({ 21: 0.8, 11: 0.2, 30: 0.02 }), 10);
      expect(st.drawn?.ringing).toBe(3);
      expect(st.drawn?.widest).toBe(21);
      expect(st.drawn!.swing).toBeGreaterThan(2);
      expect(swingPx(0.8, 21, 250)).toBeGreaterThan(swingPx(0.2, 21, 250));
      expect(swingPx(0, 21, 250)).toBe(0);
      // the F pedal down (sharp), the B pedal up (flat): their feet lower and higher than the others'
      await step(frame({ 21: 0.5 }, [0, 0, -1, 0, 1, 0, 0]), 3);
      expect(st.drawn?.set).toEqual([0, 0, -1, 0, 1, 0, 0]);
      expect(st.drawn!.pedalY[4]).toBeGreaterThan(rest[4] + 1);
      expect(st.drawn!.pedalY[2]).toBeLessThan(rest[2] - 1);
      expect(st.drawn!.pedalY[0]).toBeCloseTo(rest[0], 3);
      // silence: the strings come to rest
      await step(frame({}), 40);
      expect(st.drawn?.ringing).toBe(0);
      // a phone's box and an Orchestra cell draw as well
      draw(ctx, 390, 480, frame({ 21: 0.5 }), st, 47);
      expect(st.drawn!.body.y0).toBeGreaterThanOrEqual(47);
      const b = harpBox();
      draw(ctx, Math.round(b.w * 60), Math.round(b.h * 60), frame({ 5: 0.5 }), st, 0);
      expect(st.drawn!.body.x1).toBeLessThanOrEqual(Math.round(b.w * 60));
    });
});
