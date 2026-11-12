// The glockenspiel on the 2D stage (glock-plan.ts, glock-draw.ts, vector/glock.ts): its plan at an orchestral
// instrument's measures (thirty bars in two rows, each the engine's length, the low bars at the left, the
// accidentals behind and between their neighbours), the bars lit as the engine says they ring, the two
// mallets over the bars the engine's hands struck; its layout fits a laptop's stage, a phone's and an
// Orchestra cell; both styles draw, silent and sounding.
import { describe, expect, it } from 'vitest';
import { glockBars, type VisualFrame } from '@piano-model/engine';
import { BARS, BAR_X, CASE, GK_X0, GK_X1, GK_Y0, GK_Y1, PITCH, RAILS, ROW_Y, barBox, barCentre, barNodes } from '../src/ui/glock-plan.ts';
import { drawGlock, glockBox, glockLayout, newGlockState } from '../src/ui/glock-draw.ts';
import { drawGlockV } from '../src/ui/vector/glock.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

installCanvas();
/** a frame of the engine: these bars ringing (index → swing 0…1), the mallets' hands, the last strokes */
const frame = (amps: Record<number, number>, hands: [number, number] = [8, 20], hits: { bar: number; ago: number; vel: number; hand: number }[] = []): VisualFrame => {
  const amp = new Float32Array(30);
  for (const [i, a] of Object.entries(amps)) amp[+i] = a;
  return { focus: { midi: 84, f1: 1046.5, shapes: [new Float32Array(160)] }, glock: { amp, last: 5, ago: 0.1, vel: 80, hits, hands } } as unknown as VisualFrame;
};

describe('the 2D glockenspiel’s plan', () => {
  it('thirty bars in two rows, each the engine’s length and 31.75 mm wide, the low bars at the left, each row tapering to the treble', () => {
    const E = glockBars();
    expect(BARS.length).toBe(30);
    const nat = BARS.filter((b) => !b.sharp);
    const acc = BARS.filter((b) => b.sharp);
    expect([nat.length, acc.length]).toEqual([18, 12]);
    for (const b of BARS) {
      const [x0, y0, x1, y1] = barBox(b.index);
      expect(x1 - x0).toBeCloseTo(0.03175, 6);
      expect(y1 - y0).toBeCloseTo(E[b.index].length, 9);
      // centred on its row's line
      expect((y0 + y1) / 2).toBeCloseTo(ROW_Y[b.sharp ? 1 : 0], 9);
    }
    // the naturals side by side, a bar and 4 mm apart; an accidental between its neighbours
    for (let k = 1; k < nat.length; k++) expect(BAR_X[nat[k].index] - BAR_X[nat[k - 1].index]).toBeCloseTo(PITCH, 9);
    for (const b of acc) {
      expect(BAR_X[b.index]).toBeGreaterThan(BAR_X[b.index - 1]);
      if (b.index + 1 < 30) expect(BAR_X[b.index]).toBeLessThan(BAR_X[b.index + 1]);
    }
    // the rows do not touch; the far row behind the near one
    const nearTop = Math.max(...nat.map((b) => barBox(b.index)[3]));
    const farBottom = Math.min(...acc.map((b) => barBox(b.index)[1]));
    expect(farBottom).toBeGreaterThan(nearTop + 0.005);
    // the whole instrument: 0.7 m wide, half a metre deep
    expect(GK_X1 - GK_X0).toBeGreaterThan(0.65);
    expect(GK_X1 - GK_X0).toBeLessThan(0.75);
    expect(GK_Y1 - GK_Y0).toBeGreaterThan(0.45);
    expect(GK_Y1 - GK_Y0).toBeLessThan(0.6);
    // every bar inside the case
    const yAt = (k: 0 | 3, x: number) => CASE[k][1] + ((CASE[k === 0 ? 1 : 2][1] - CASE[k][1]) * (x - GK_X0)) / (GK_X1 - GK_X0);
    for (const b of BARS) {
      const [x0, y0, x1, y1] = barBox(b.index);
      expect(x0).toBeGreaterThan(GK_X0);
      expect(x1).toBeLessThan(GK_X1);
      expect(y0).toBeGreaterThan(yAt(0, (x0 + x1) / 2));
      expect(y1).toBeLessThan(yAt(3, (x0 + x1) / 2));
    }
  });
  it('each bar lies on its two nodes (0.224 of its length from each end), where the rails run', () => {
    for (const b of BARS) {
      const [, y0, , y1] = barBox(b.index);
      const [a, c] = barNodes(b.index);
      expect((a[1] - y0) / (y1 - y0)).toBeCloseTo(0.224, 6);
      expect((y1 - c[1]) / (y1 - y0)).toBeCloseTo(0.224, 6);
      expect(a[0]).toBeCloseTo(barCentre(b.index)[0], 9);
    }
    expect(RAILS.length).toBe(4);
    // a row's two rails converge towards the treble (the bars shorten)
    for (const k of [0, 2]) expect(Math.abs(RAILS[k][1][1] - RAILS[k + 1][1][1])).toBeLessThan(Math.abs(RAILS[k][0][1] - RAILS[k + 1][0][1]));
  });
});

describe('the 2D glockenspiel’s layout', () => {
  const b = glockBox();
  const cells: [string, number, number, number][] = [
    ['a laptop’s stage', 1440, 551, 39],
    ['a phone’s stage', 390, 480, 47],
    ['Orchestra 200 px/m', Math.round(b.w * 200), Math.round(b.h * 200), 0],
    ['Orchestra 60 px/m', Math.round(b.w * 60), Math.round(b.h * 60), 0],
  ];
  for (const [name, W, H, top] of cells)
    it(`${name} (${W}×${H}, ${top} px of player): whole in its box under the player`, () => {
      const st = newGlockState();
      const { ctx } = recorder();
      drawGlock(ctx, W, H, null, st, top);
      const d = st.drawn!;
      expect(d.body.x0).toBeGreaterThanOrEqual(0);
      expect(d.body.x1).toBeLessThanOrEqual(W);
      expect(d.body.y0).toBeGreaterThanOrEqual(top);
      expect(d.body.y1).toBeLessThanOrEqual(H);
      for (const [x, y] of d.heads) {
        expect(x).toBeGreaterThan(d.body.x0);
        expect(x).toBeLessThan(d.body.x1);
        expect(y).toBeGreaterThan(d.body.y0);
        expect(y).toBeLessThan(d.body.y1);
      }
      const L = glockLayout(W, H, top);
      if (name.startsWith('Orchestra')) expect(Math.abs(L.sc / Number(name.split(' ')[1]) - 1)).toBeLessThan(0.01);
    });
});

describe('the 2D glockenspiel draws, both styles', () => {
  for (const [name, draw] of [['classic', drawGlock], ['vector', drawGlockV]] as const)
    it(`${name}: silent, then bars ringing (the loudest the brightest), a mallet down on the bar it strikes and up again, the hands where the engine has them`, async () => {
      const st = newGlockState();
      const { ctx } = recorder();
      draw(ctx, 1440, 551, null, st, 39);
      expect(st.drawn?.ringing).toBe(0);
      expect(st.drawn?.bars.length).toBe(30);
      const step = async (fr: VisualFrame | null, n: number) => {
        for (let k = 0; k < n; k++) {
          draw(ctx, 1440, 551, fr, st, 39);
          await new Promise((r) => setTimeout(r, 8));
        }
      };
      // C6 loud under the left hand, just struck; A7 softer under the right
      await step(frame({ 5: 0.8, 26: 0.2 }, [5, 26], [{ bar: 5, ago: 0.005, vel: 100, hand: 0 }, { bar: 26, ago: 0.4, vel: 60, hand: 1 }]), 12);
      expect(st.drawn?.ringing).toBe(2);
      expect(st.drawn?.brightest).toBe(5);
      // the left mallet is down on its bar (inside its box), the right one up again
      expect(st.drawn!.lift[0]).toBeLessThan(0.05);
      expect(st.drawn!.lift[1]).toBeGreaterThan(0.9);
      const box5 = st.drawn!.bars[5];
      const [hx, hy] = st.drawn!.heads[0];
      expect(hx).toBeGreaterThan(box5.x0 - 1);
      expect(hx).toBeLessThan(box5.x1 + 1);
      expect(hy).toBeGreaterThan(box5.y0);
      expect(hy).toBeLessThan(box5.y1);
      // the right hand over A7: to the right of the left
      expect(st.drawn!.heads[1][0]).toBeGreaterThan(hx + 100);
      // silence: the bars go dark
      await step(frame({}, [5, 26], [{ bar: 5, ago: 1.5, vel: 100, hand: 0 }]), 60);
      expect(st.drawn?.ringing).toBe(0);
      expect(st.drawn!.lift[0]).toBeGreaterThan(0.9);
      // a phone's box and an Orchestra cell draw as well
      draw(ctx, 390, 480, frame({ 3: 0.5 }), st, 47);
      expect(st.drawn!.body.y0).toBeGreaterThanOrEqual(47);
      const b = glockBox();
      draw(ctx, Math.round(b.w * 60), Math.round(b.h * 60), frame({ 5: 0.5 }), st, 0);
      expect(st.drawn!.body.x1).toBeLessThanOrEqual(Math.round(b.w * 60));
    });
});
