// The glockenspiel on the 2D stage (glock-plan.ts, glock-draw.ts, vector/glock.ts): its plan at an orchestral
// instrument's measures (thirty bars in two rows, each the engine's length, the low bars at the left, the
// accidentals behind and between their neighbours), the bars lit as the engine says they ring, the two
// mallets over the bars the engine's hands struck; its layout fits a laptop's stage, a phone's and an
// Orchestra cell; both styles draw, silent and sounding.
import { describe, expect, it } from 'vitest';
import { glockBars, type VisualFrame } from '@piano-model/engine';
import { BARS, BAR_X, CASE, GK_X0, GK_X1, GK_Y0, GK_Y1, HEAD_R, PITCH, RAILS, ROW_Y, TRAY, WALL, barBox, barCentre, barNodes, strokePlace } from '../src/ui/glock-plan.ts';
import { RING_S, barStamp, drawGlock, glockBox, glockLayout, glockLive, newGlockState, strokeRings } from '../src/ui/glock-draw.ts';
import { drawGlockV } from '../src/ui/vector/glock.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

installCanvas();
/** a frame of the engine: these bars ringing (index → swing 0…1), the mallets' hands, the last strokes */
const frame = (amps: Record<number, number>, hands: [number, number] = [8, 20], hits: { bar: number; ago: number; vel: number; hand: number }[] = []): VisualFrame => {
  const amp = new Float32Array(30);
  for (const [i, a] of Object.entries(amps)) amp[+i] = a;
  return { focus: { midi: 84, f1: 1046.5, shapes: [new Float32Array(160)] }, glock: { amp, last: 5, ago: 0.1, vel: 80, hits, hands } } as unknown as VisualFrame;
};

describe('the mallets land where the strokes did', () => {
  it('a stroke’s place is on its bar: as far along it and across it as the engine’s hands ever land, the head whole on the steel', () => {
    for (const i of [0, 1, 12, 29]) {
      const [x0, y0, x1, y1] = barBox(i);
      for (const [al, ac] of [[0.14, 1], [-0.14, -1], [0.14, -1], [0, 0], [9, 9]] as const) {
        const [x, y] = strokePlace(i, al, ac);
        expect(x - HEAD_R * 0.5).toBeGreaterThan(x0);
        expect(x + HEAD_R * 0.5).toBeLessThan(x1);
        expect(y).toBeGreaterThan(y0);
        expect(y).toBeLessThan(y1);
      }
      expect(strokePlace(i)).toEqual(barCentre(i));
    }
  });

  it('each mallet’s head goes to where its last stroke landed (no two strokes on one spot), not to the bar’s middle every time', () => {
    const st = newGlockState();
    const f1 = { ...frame({ 5: 0.8 }, [5, 20], [{ bar: 5, ago: 0.01, vel: 90, hand: 0 }]) } as VisualFrame;
    (f1.glock!.hits[0] as { along?: number; across?: number }).along = 0.1;
    (f1.glock!.hits[0] as { along?: number; across?: number }).across = -0.8;
    let lv = glockLive(f1, st, 1000);
    for (let t = 1016; t < 1400; t += 16) lv = glockLive(f1, st, t);
    const want = strokePlace(5, 0.1, -0.8);
    expect(lv.head[0][0]).toBeCloseTo(want[0], 4);
    expect(lv.head[0][1]).toBeCloseTo(want[1], 4);
    expect(Math.hypot(want[0] - barCentre(5)[0], want[1] - barCentre(5)[1])).toBeGreaterThan(0.01);
    // the other mallet, which has struck nothing, hangs over its bar's middle
    expect(lv.head[1][0]).toBeCloseTo(barCentre(20)[0], 4);
    expect(lv.head[1][1]).toBeCloseTo(barCentre(20)[1], 4);
    // an older engine's frame (no place said): the middle
    const st2 = newGlockState();
    const f2 = frame({ 5: 0.8 }, [5, 20], [{ bar: 5, ago: 0.01, vel: 90, hand: 0 }]);
    let l2 = glockLive(f2, st2, 1000);
    for (let t = 1016; t < 1400; t += 16) l2 = glockLive(f2, st2, t);
    expect(l2.head[0][0]).toBeCloseTo(barCentre(5)[0], 4);
  });
});

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

describe('the glockenspiel’s case, its strokes’ rings and its bars’ stamps', () => {
  it('the tray lies inside the case, a wall in from every side', () => {
    expect(TRAY.length).toBe(CASE.length);
    const n = CASE.length;
    for (let i = 0; i < n; i++) {
      // each of the tray's corners is the wall away from the two sides of the case that meet at its corner
      for (const k of [(i + n - 1) % n, i]) {
        const a = CASE[k];
        const b = CASE[(k + 1) % n];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const d = ((b[0] - a[0]) * (TRAY[i][1] - a[1]) - (b[1] - a[1]) * (TRAY[i][0] - a[0])) / L;
        expect(d).toBeCloseTo(WALL, 9);
      }
    }
    // every bar inside the tray's reach
    for (const b of BARS) {
      const [x0, , x1] = barBox(b.index);
      expect(x0).toBeGreaterThan(TRAY[0][0]);
      expect(x1).toBeLessThan(TRAY[1][0]);
    }
  });
  it('a stroke leaves a ring where it landed, opening for a fifth of a second, then nothing', () => {
    const fr = (ago: number) => ({ glock: { amp: new Float32Array(30), hands: [5, 26], hits: [{ hand: 0, bar: 5, along: 0.05, across: -0.4, ago }] } }) as unknown as VisualFrame;
    expect(strokeRings(null)).toEqual([]);
    const a = strokeRings(fr(0.02));
    expect(a.length).toBe(1);
    expect(a[0].at).toEqual(strokePlace(5, 0.05, -0.4));
    expect(a[0].k).toBeCloseTo(0.02 / RING_S, 9);
    expect(strokeRings(fr(RING_S * 0.9))[0].k).toBeGreaterThan(a[0].k);
    expect(strokeRings(fr(RING_S + 0.01))).toEqual([]);
  });
  it('each bar is stamped with its note, no octave: G at the bottom, C at the top', () => {
    expect(barStamp(0)).toBe('G');
    expect(barStamp(BARS.length - 1)).toBe('C');
    for (const b of BARS) {
      expect(barStamp(b.index)).toMatch(/^[A-G][♯♭]?$/);
      expect(barStamp(b.index).length > 1).toBe(b.sharp);
    }
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
