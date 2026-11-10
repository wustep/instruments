// The timpani on the 2D stage (timpani-plan.ts, timpani-draw.ts, vector/timpani.ts): four pedal drums at their
// real sizes in the arc a timpanist plays them in (the 32″ on the player's left, seen from behind the player),
// each kettle holding the engine's air (a hemisphere of the head's radius); the layout fits a laptop's stage, a
// phone's and an Orchestra cell; the mallets fall to the head at a stroke and rebound by the engine's `ago`;
// the heads' fields are the engine's modes (a (1,1) dipole across the strike point, a (0,1) round); the pedals
// and the gauges follow the tuning; both styles draw, silent and sounding, without remaking their tables.
import { describe, expect, it } from 'vitest';
import { TIMPANI_DRUMS, besselJ, type TimpaniVisual, type VisualFrame } from '@piano-model/engine';
import { BALL_R, EXT, PAINT_ORDER, REST_LIFT, SET, SIN_E, bowlR, malletLift, malletPose, strikePoint } from '../src/ui/timpani-plan.ts';
import { FG, drawTimpani, gridOf, newTimpaniState, timpaniBox, timpaniLayout } from '../src/ui/timpani-draw.ts';
import { drawTimpaniV } from '../src/ui/vector/timpani.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

installCanvas();

describe('the 2D timpani’s plan, at a real set’s measures', () => {
  it('four heads 32″ 29″ 26″ 23″ (the engine’s), the largest on the player’s left; heads 0.80–0.91 m up; neighbours’ heads 0.1 m apart', () => {
    expect(SET.map((d) => d.inches)).toEqual([32, 29, 26, 23]);
    SET.forEach((d, i) => expect(2 * d.a).toBeCloseTo(TIMPANI_DRUMS[i].d, 6));
    // left to right across the picture, low to high (as the keys run)
    for (let i = 1; i < SET.length; i++) expect(SET[i].cx).toBeGreaterThan(SET[i - 1].cx);
    // the playing height: Premier 85–96 cm to the fittings, Yamaha 79–82 cm, Adams 84–94 cm
    for (const d of SET) {
      expect(d.zh).toBeGreaterThanOrEqual(0.79);
      expect(d.zh).toBeLessThanOrEqual(0.92);
    }
    expect(SET[0].zh).toBeGreaterThan(SET[3].zh);
    for (let i = 1; i < SET.length; i++) {
      const gap = Math.hypot(SET[i].cx - SET[i - 1].cx, SET[i].cy - SET[i - 1].cy) - SET[i].a - SET[i - 1].a;
      expect(gap).toBeCloseTo(0.1, 3);
    }
    // an arc about the player: the outer drums nearer them than the middle two, each facing them
    expect(SET[0].cy).toBeLessThan(SET[1].cy);
    expect(SET[3].cy).toBeLessThan(SET[2].cy);
    // (every drum faces the same point, the player: its near rim 0.7 m from them, the arc centred on them)
    const P = SET.map((d) => [d.cx + d.dx * (d.a + 0.7), d.cy + d.dy * (d.a + 0.7)]);
    for (const [x, y] of P) {
      expect(x).toBeCloseTo(P[0][0], 6);
      expect(y).toBeCloseTo(P[0][1], 6);
    }
    // (the heads centred across the picture, the player a hand's width left of its middle, by the big drums)
    expect(Math.abs(P[0][0])).toBeLessThan(0.15);
    for (const d of SET) expect(Math.hypot(d.dx, d.dy)).toBeCloseTo(1, 6);
    // painted far to near
    for (let k = 1; k < PAINT_ORDER.length; k++) expect(SET[PAINT_ORDER[k]].cy).toBeLessThanOrEqual(SET[PAINT_ORDER[k - 1]].cy);
  });
  it('each kettle holds a hemisphere of its head’s radius (the engine’s `kettle: 1`), about 1.08 radii deep', () => {
    for (const d of SET) {
      let v = 0;
      const n = 2000;
      for (let k = 0; k < n; k++) {
        const r = bowlR(d.a, (k + 0.5) / n);
        v += Math.PI * r * r * (d.D / n);
      }
      expect(v / ((2 / 3) * Math.PI * d.a ** 3)).toBeCloseTo(1, 2);
      expect(d.D / d.a).toBeCloseTo(1.083, 2);
      // the bowl's bottom about half way up: the base and pedal under it
      expect(d.zr - d.D).toBeGreaterThan(0.4);
      expect(d.zr - d.D).toBeLessThan(0.5);
    }
  });
  it('the set about 2.5 m across (each drum d + 0.16 m over its handles), its box at one px per metre', () => {
    const w = EXT.x1 - EXT.x0;
    expect(w).toBeGreaterThan(2.4);
    expect(w).toBeLessThan(2.9);
    const b = timpaniBox();
    expect(b.w).toBeCloseTo(w / 0.92, 6);
    expect(b.h).toBeCloseTo((EXT.v1 - EXT.v0) / 0.86, 6);
    expect(b.w / b.h).toBeGreaterThan(1.5);
  });
});

describe('the mallets', () => {
  it('on the head at the stroke, rebounding the higher the louder in about 0.1 s, back to rest above it', () => {
    expect(malletLift(0, 100)).toBe(0);
    expect(malletLift(0.1, 120)).toBeGreaterThan(malletLift(0.1, 40));
    expect(malletLift(0.1, 120)).toBeGreaterThan(REST_LIFT);
    // a roll's next stroke comes 60–125 ms on: the mallet is still close to the head
    expect(malletLift(0.06, 60)).toBeLessThan(0.08);
    expect(malletLift(1.5, 120)).toBeCloseTo(REST_LIFT, 2);
    expect(malletLift(1e9, 0)).toBe(REST_LIFT);
  });
  it('the ball meets the head at the strike point (a fraction of the radius towards the player); raised, it is higher, the shaft back to the grip', () => {
    for (let i = 0; i < SET.length; i++)
      for (const h of [0, 1]) {
        const d = SET[i];
        const p = malletPose(i, 0.7, h, 0);
        const [sx, sy, sz] = strikePoint(i, 0.7, h);
        expect(p.ball[2]).toBeCloseTo(sz + BALL_R, 6);
        expect(Math.hypot(p.ball[0] - sx, p.ball[1] - sy)).toBeLessThan(1e-6);
        // on the player's side of the centre, about 0.7 of the radius out
        const r = Math.hypot(sx - d.cx, sy - d.cy);
        expect(r / d.a).toBeGreaterThan(0.65);
        expect(r / d.a).toBeLessThan(0.75);
        expect((sx - d.cx) * d.dx + (sy - d.cy) * d.dy).toBeGreaterThan(0);
        // the grip nearer the player and above the head
        expect(Math.hypot(p.grip[0] - p.ball[0], p.grip[1] - p.ball[1], p.grip[2] - p.ball[2])).toBeCloseTo(0.34, 3);
        expect(p.grip[2]).toBeGreaterThan(sz);
        const q = malletPose(i, 0.7, h, 0.15);
        expect(q.ball[2]).toBeCloseTo(p.ball[2] + 0.15, 3);
      }
  });
});

// ---- a frame: four drums, their heads' modes as the engine sends them (m, j, y)
const J = [
  [1, 3.8317],
  [2, 5.1356],
  [0, 2.4048],
  [3, 6.3802],
];
function frame(o: { amps?: number[][]; hands?: TimpaniVisual['hands']; pedal?: number[]; last?: number; ago?: number[] }): VisualFrame {
  const drums = TIMPANI_DRUMS.map((d, i) => {
    const head = new Float32Array(3 * 14);
    J.forEach(([m, j], k) => {
      head[3 * k] = m;
      head[3 * k + 1] = j;
      head[3 * k + 2] = o.amps?.[i]?.[k] ?? 0;
    });
    return { d: d.d, inches: d.inches, lo: d.lo, hi: d.hi, note: d.rest, pedal: o.pedal?.[i] ?? 0.3, level: 0, ago: o.ago?.[i] ?? 9, vel: 100, head };
  });
  const timpani: TimpaniVisual = { drums, hands: o.hands ?? [{ drum: 1, ago: 9, vel: 0, on: false }, { drum: 2, ago: 9, vel: 0, on: false }], spot: 0.7, last: o.last ?? 1 };
  return { instrument: 'timpani', timpani } as unknown as VisualFrame;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('the heads’ fields are the engine’s modes', () => {
  it('a (1,1) alone: a dipole across the strike point (its nodal diameter across), the head down on the struck side first; a (0,1) alone: round', async () => {
    const st = newTimpaniState();
    const { ctx } = recorder();
    // the (1,1) on the 29″, struck 0.05 s ago
    drawTimpani(ctx, 1440, 547, frame({ amps: [[], [1e-4]], ago: [9, 0.05], last: 1 }), st, 39);
    const h = st.heads![1];
    expect(h.env).toBeCloseTo(1e-4, 9);
    const g = gridOf(1);
    // correlate the field with J1(j r)·cos θ on the grid
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let q = 0; q < FG * FG; q++) {
      if (g.r[q] < 0) continue;
      const f = besselJ(1, 3.8317 * g.r[q]) * Math.cos(g.th[q]);
      sxy += f * h.w[q];
      sxx += f * f;
      syy += h.w[q] * h.w[q];
    }
    expect(Math.abs(sxy) / Math.sqrt(sxx * syy)).toBeGreaterThan(0.999);
    // pushed down under the felt (θ = 0, the strike side), up on the far side
    expect(sxy).toBeLessThan(0);
    // the (0,1) alone on the 23″: the same at every angle
    const s2 = newTimpaniState();
    drawTimpani(ctx, 1440, 547, frame({ amps: [[], [], [], [0, 0, 2e-4]], ago: [9, 9, 9, 0.05], last: 3 }), s2, 39);
    const w = s2.heads![3].w;
    const g3 = gridOf(3);
    let lo = Infinity;
    let hi = -Infinity;
    for (let q = 0; q < FG * FG; q++)
      if (Math.abs(g3.r[q] - 0.5) < 0.004) {
        lo = Math.min(lo, w[q]);
        hi = Math.max(hi, w[q]);
      }
    expect(Math.abs(hi - lo) / Math.abs(hi)).toBeLessThan(0.03);
  });
  it('a ringing head keeps its field; a silent one fades; the strongest drum sets the reference', async () => {
    const st = newTimpaniState();
    const { ctx } = recorder();
    for (let k = 0; k < 6; k++) {
      drawTimpani(ctx, 1440, 547, frame({ amps: [[3e-4, 1e-4]], ago: [0.02 + k * 0.03], last: 0 }), st, 39);
      await sleep(5);
    }
    expect(st.drawn!.heads[0].field).toBeGreaterThan(0.9);
    expect(st.drawn!.heads[2].field).toBe(0);
    // the frames stop: the field dies away
    for (let k = 0; k < 8; k++) {
      drawTimpani(ctx, 1440, 547, null, st, 39);
      await sleep(30);
    }
    expect(st.heads![0].env).toBeLessThan(3e-4);
  });
});

describe('the 2D timpani’s layout', () => {
  const b = timpaniBox();
  const cells: [string, number, number, number][] = [
    ['laptop', 1440, 547, 39],
    ['phone 390×844', 390, 381, 47],
    ['Pixel 7', 412, 439, 47],
    ['Orchestra 300 px/m', Math.round(b.w * 300), Math.round(b.h * 300), 0],
    ['Orchestra 60 px/m', Math.round(b.w * 60), Math.round(b.h * 60), 0],
  ];
  for (const [name, W, H, top] of cells)
    it(`${name} (${W}×${H}, ${top} px of player): whole in its box under the player, the heads left to right by size`, () => {
      const st = newTimpaniState();
      const { ctx } = recorder();
      drawTimpani(ctx, W, H, null, st, top);
      const d = st.drawn!;
      expect(d.body.x0).toBeGreaterThanOrEqual(0);
      expect(d.body.x1).toBeLessThanOrEqual(W);
      expect(d.body.y0).toBeGreaterThanOrEqual(top);
      expect(d.body.y1).toBeLessThanOrEqual(H);
      const L = timpaniLayout(W, H, top);
      if (name.startsWith('Orchestra')) expect(L.sc / Number(name.split(' ')[1])).toBeCloseTo(1, 2);
      else expect(Math.max(((EXT.x1 - EXT.x0) * L.sc) / W / (W < 600 ? 0.96 : 0.92), ((EXT.v1 - EXT.v0) * L.sc) / (H - top) / 0.86)).toBeCloseTo(1, 6);
      for (let i = 1; i < 4; i++) {
        expect(d.heads[i].x).toBeGreaterThan(d.heads[i - 1].x);
        expect(d.heads[i].rx).toBeLessThan(d.heads[i - 1].rx);
        expect(d.heads[i].ry / d.heads[i].rx).toBeCloseTo(SIN_E, 6);
      }
      // the gauges and the pedals inside the box
      for (const g of d.gauges) {
        expect(g.box.x0).toBeGreaterThanOrEqual(0);
        expect(g.box.y0).toBeGreaterThanOrEqual(top);
      }
      for (const p of d.pedals) expect(p.y).toBeLessThanOrEqual(H);
      // the layout is made once per size
      expect(timpaniLayout(W, H, top)).toBe(L);
    });
});

describe('the 2D timpani draws, both styles', () => {
  for (const [name, draw] of [['classic', drawTimpani], ['vector', drawTimpaniV]] as const)
    it(`${name}: at rest; a stroke on the 32″ and one on the 23″ (the mallets down and rebounding, the heads moving); a double stop; the pedals and gauges with the tuning; back to rest`, async () => {
      const st = newTimpaniState();
      const { ctx } = recorder();
      draw(ctx, 1440, 547, null, st, 39);
      // at rest: the mallets above the 29″ and the 26″, at rest height
      expect(st.drawn!.mallets.map((m) => m.drum)).toEqual([1, 2]);
      for (const m of st.drawn!.mallets) expect(m.lift).toBeCloseTo(REST_LIFT, 6);
      const rest = st.drawn!.mallets.map((m) => m.y);
      // the left hand strikes the 32″: on the head, then up
      draw(ctx, 1440, 547, frame({ amps: [[2e-4, 5e-5]], ago: [0], hands: [{ drum: 0, ago: 0, vel: 110, on: true }, { drum: 2, ago: 9, vel: 0, on: false }], last: 0 }), st, 39);
      const m0 = st.drawn!.mallets[0];
      expect(m0.drum).toBe(0);
      expect(m0.on).toBe(true);
      expect(m0.lift).toBe(0);
      const hd = st.drawn!.heads[0];
      // the ball over the head's ellipse (towards the player: the lower half)
      expect(((m0.x - hd.x) / hd.rx) ** 2 + ((m0.y - hd.y) / hd.ry) ** 2).toBeLessThan(1);
      expect(m0.y).toBeGreaterThan(hd.y);
      expect(st.src!.x).toBeCloseTo(hd.x, 6);
      draw(ctx, 1440, 547, frame({ amps: [[2e-4, 5e-5]], ago: [0.1], hands: [{ drum: 0, ago: 0.1, vel: 110, on: false }, { drum: 2, ago: 9, vel: 0, on: false }], last: 0 }), st, 39);
      expect(st.drawn!.mallets[0].lift).toBeGreaterThan(REST_LIFT);
      expect(st.drawn!.mallets[0].y).toBeLessThan(m0.y);
      expect(st.drawn!.heads[0].field).toBeGreaterThan(0.5);
      // the right hand on the 23″, the pedal toe down (its top note), the gauge's pointer at the top of its scale
      draw(ctx, 1440, 547, frame({ amps: [[2e-4], [], [], [1e-4]], ago: [0.2, 9, 9, 0.01], pedal: [0.3, 0.3, 0.3, 1], hands: [{ drum: 0, ago: 0.2, vel: 110, on: false }, { drum: 3, ago: 0.01, vel: 90, on: false }], last: 3 }), st, 39);
      expect(st.drawn!.mallets[1].drum).toBe(3);
      expect(st.drawn!.heads[3].field).toBeGreaterThan(0.2);
      const g3 = st.drawn!.gauges[3];
      expect(g3.at).toBe(1);
      const lowG = st.drawn!.gauges[0];
      expect(lowG.at).toBeCloseTo(0.3, 6);
      // (on its plate, the pointer runs low at the player's left to high at their right)
      expect(g3.x).toBeGreaterThanOrEqual(g3.box.x0 - 1);
      expect(g3.x).toBeLessThanOrEqual(g3.box.x1 + 1);
      // the 23″'s pedal toe down: its toe lower in the picture than heel-down's
      const toeTop = st.drawn!.pedals[3].y;
      draw(ctx, 1440, 547, frame({ pedal: [0.3, 0.3, 0.3, 0], hands: [{ drum: 0, ago: 0.3, vel: 110, on: false }, { drum: 3, ago: 0.1, vel: 90, on: false }], last: 3 }), st, 39);
      expect(toeTop).toBeGreaterThan(st.drawn!.pedals[3].y);
      // a double stop: both on (the 29″ and the 26″)
      draw(ctx, 1440, 547, frame({ amps: [[], [1e-4], [1e-4]], ago: [9, 0, 0], hands: [{ drum: 1, ago: 0, vel: 100, on: true }, { drum: 2, ago: 0, vel: 100, on: true }], last: 2 }), st, 39);
      expect(st.drawn!.mallets.map((m) => [m.drum, m.on])).toEqual([[1, true], [2, true]]);
      // back to rest: long after, both above their drums at rest height
      draw(ctx, 1440, 547, frame({ hands: [{ drum: 1, ago: 30, vel: 100, on: false }, { drum: 2, ago: 30, vel: 100, on: false }] }), st, 39);
      expect(st.drawn!.mallets.map((m) => m.y)).toEqual(rest);
      // the head's grid is kept, not remade, frame to frame
      const w = st.heads![1].w;
      draw(ctx, 1440, 547, frame({ amps: [[], [1e-4]] }), st, 39);
      expect(st.heads![1].w).toBe(w);
      // a phone's box and an Orchestra cell draw as well
      draw(ctx, 390, 381, frame({ amps: [[1e-4]] }), st, 47);
      expect(st.drawn!.body.y0).toBeGreaterThanOrEqual(47);
      const b = timpaniBox();
      draw(ctx, Math.round(b.w * 120), Math.round(b.h * 120), frame({ amps: [[1e-4]] }), st, 0);
      expect(st.drawn!.body.x1).toBeLessThanOrEqual(Math.round(b.w * 120));
    });
});
