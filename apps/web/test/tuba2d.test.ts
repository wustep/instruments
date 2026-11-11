// The tuba on the 2D stage (tuba-plan.ts, tuba-draw.ts, vector/tuba.ts): its plan at a contrabass tuba's
// measures, the air's path through it as long as the engine's tube (the open tube and each valve alone
// exactly, valves together short of it as a real tuba's are), the pistons going down for the engine's own
// fingering, the lips following the engine's trace; its layout fits a laptop's stage, a phone's and an
// Orchestra cell; and both styles draw, silent and sounding.
import { describe, expect, it } from 'vitest';
import { TUBA_HI, TUBA_LENGTH, TUBA_LO, tubaFingering, tubaTubeLength, valvesDown, type VisualFrame } from '@piano-model/engine';
import { plen } from '../src/ui/horn-plan.ts';
import { BELL_X, BORE, CASING_R, MPIECE, MP_LEN, MP_RIM, RIM_R, RIM_Y, TB_X0, TB_X1, TB_Y0, TB_Y1, TUBES, TUBE_LEN, VALVE_X, bellR, loopLength, tubaAir, tubaAirLength } from '../src/ui/tuba-plan.ts';
import { drawTuba, newTubaState, tubaBox, tubaLayout } from '../src/ui/tuba-draw.ts';
import { drawTubaV } from '../src/ui/vector/tuba.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

installCanvas();
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const near = (v: number, want: number, tol: number, what = '') => expect(Math.abs(v / want - 1), `${what} ${v.toFixed(4)} against ${want.toFixed(4)}`).toBeLessThan(tol);
/** a frame of the engine playing `m`: the standing wave lips → bell, the lips' trace over a few cycles */
const sounding = (m: number, k: number, blow = 0.8): VisualFrame =>
  ({
    focus: { midi: m, lengthM: 4.88, f1: et(m), shapes: [Float32Array.from({ length: 160 }, (_, i) => Math.cos(2 * Math.PI * (i / 159)) * (1 + 0.01 * k))] },
    lips: { open: 0.6, blow },
    excite: { rate: 48000, trace: Float32Array.from({ length: 4096 }, (_, i) => Math.max(0, 0.7 + 0.7 * Math.sin((2 * Math.PI * et(m) * (i + 37 * k)) / 48000))) },
  }) as unknown as VisualFrame;
const levers = (m: number) => valvesDown(tubaFingering(m).valves, 4).reduce((a, d, i) => a | (d ? 1 << i : 0), 0);

describe('the 2D tuba’s plan, at a contrabass tuba’s measures', () => {
  it('0.97 m to a rim 0.48 m across, a 19 mm bore through four pistons 45 mm apart, a deep mouthpiece', () => {
    expect(RIM_Y).toBeCloseTo(0.97, 2);
    expect(2 * RIM_R).toBeCloseTo(0.48, 3);
    expect(bellR(0)).toBeCloseTo(0.24, 6);
    // the flare falls steadily to the stack's foot, where the body's last bow is as wide
    for (let d = 0.02; d < 0.76; d += 0.02) expect(bellR(d)).toBeLessThan(bellR(d - 0.02));
    const body = TUBES.body;
    const rEnd = (body.r as (s: number) => number)(TUBE_LEN.body);
    near(rEnd, bellR(0.77), 0.01, 'the body’s end against the stack’s foot');
    // the body widens all the way (a tuba's is conical): from the main slide's 11 mm to 55 mm
    let last = 0;
    for (let s = 0; s <= TUBE_LEN.body; s += 0.05) {
      const r = (body.r as (s: number) => number)(s);
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
    expect(2 * (BORE - 0.001)).toBeCloseTo(0.019, 3);
    for (let k = 1; k < 4; k++) expect(VALVE_X[k - 1] - VALVE_X[k]).toBeCloseTo(0.045, 6);
    expect(2 * CASING_R).toBeCloseTo(0.033, 3);
    expect(MP_LEN).toBeCloseTo(0.09, 3);
    expect(2 * Math.max(...MPIECE.map((p) => p[0]))).toBeGreaterThan(0.045);
    // the whole: about 0.65 m across (the fourth loop to the mouthpiece) and a metre tall
    expect(TB_X1 - TB_X0).toBeGreaterThan(0.6);
    expect(TB_X1 - TB_X0).toBeLessThan(0.72);
    expect(TB_Y1 - TB_Y0).toBeGreaterThan(0.97);
    expect(TB_Y1 - TB_Y0).toBeLessThan(1.05);
    // every tube inside the plan's box
    for (const t of Object.values(TUBES)) for (const [x, y] of t.pts) {
      expect(x).toBeGreaterThan(TB_X0);
      expect(x).toBeLessThan(TB_X1);
      expect(y).toBeGreaterThan(TB_Y0);
      expect(y).toBeLessThan(TB_Y1);
    }
    // the mouthpiece beside the bell, under its rim; the bell right of the valves
    expect(MP_RIM[0]).toBeGreaterThan(BELL_X + RIM_R);
    expect(MP_RIM[1]).toBeLessThan(RIM_Y);
    expect(Math.max(...VALVE_X)).toBeLessThan(BELL_X);
  });
  it('the open tube is the engine’s 4.88 m; each valve alone adds its semitones’ share exactly', () => {
    expect(tubaAir([false, false, false, false]).total).toBeCloseTo(TUBA_LENGTH, 3);
    [2, 1, 3, 5].forEach((semis, k) => {
      const down = [false, false, false, false];
      down[k] = true;
      const extra = tubaAir(down).total - TUBA_LENGTH;
      expect(extra).toBeCloseTo(TUBA_LENGTH * (2 ** (semis / 12) - 1), 3);
      expect(loopLength(k)).toBeCloseTo(extra, 3);
      // (the loop itself is that long: the ports into it take the passage's place)
      near(plen(TUBES[`L${k + 1}`].pts), extra, 0.003);
    });
  });
  it('every note’s fingering (C1–F4): the drawn path is the engine’s tube, valves together up to 10 % short (as a real tuba’s: each loop is cut for the open tube)', () => {
    for (let m = TUBA_LO; m <= TUBA_HI; m++) {
      const f = tubaFingering(m);
      const want = tubaTubeLength(f);
      const got = tubaAirLength(m);
      const n = f.valves === '0' ? 0 : f.valves.split('+').length;
      if (n <= 1) expect(got, `MIDI ${m} (${f.valves})`).toBeCloseTo(want, 3);
      else {
        expect(got, `MIDI ${m} (${f.valves})`).toBeLessThan(want);
        expect(got / want, `MIDI ${m} (${f.valves})`).toBeGreaterThan(0.9);
      }
      // the path runs lips to rim without a break in its runs' starts
      const a = tubaAir(valvesDown(f.valves, 4));
      expect(a.runs[0].id).toBe('mp');
      expect(a.runs[a.runs.length - 1].id).toBe('bell');
      for (let i = 1; i < a.starts.length; i++) expect(a.starts[i]).toBeCloseTo(a.starts[i - 1] + a.runs[i - 1].len, 9);
      // a valve down: its loop on the path; up: not
      valvesDown(f.valves, 4).forEach((d, k) => expect(a.runs.some((r) => r.id === `L${k + 1}`), `MIDI ${m} valve ${k + 1}`).toBe(d));
    }
  });
});

describe('the 2D tuba’s layout', () => {
  const b = tubaBox();
  const cells: [string, number, number, number][] = [
    ['a laptop’s stage', 1440, 551, 39],
    ['a phone’s stage', 390, 480, 47],
    ['Orchestra 300 px/m', Math.round(b.w * 300), Math.round(b.h * 300), 0],
    ['Orchestra 90 px/m', Math.round(b.w * 90), Math.round(b.h * 90), 0],
  ];
  for (const [name, W, H, top] of cells)
    it(`${name} (${W}×${H}, ${top} px of player): whole in its box under the player`, () => {
      const L = tubaLayout(W, H, top);
      const X = (x: number) => L.ox + x * L.sc;
      const Y = (y: number) => L.oy - y * L.sc;
      for (const [x, y] of [[TB_X0, TB_Y0], [TB_X1, TB_Y1]]) {
        expect(X(x)).toBeGreaterThanOrEqual(0);
        expect(X(x)).toBeLessThanOrEqual(W);
        expect(Y(y)).toBeGreaterThanOrEqual(top);
        expect(Y(y)).toBeLessThanOrEqual(H);
      }
      if (name.startsWith('Orchestra')) near(L.sc, Number(name.split(' ')[1]), 0.01, 'px/m');
      else expect(Math.max(((TB_X1 - TB_X0) * L.sc) / W / (W < 600 ? 0.94 : 0.9), ((TB_Y1 - TB_Y0) * L.sc) / (H - top) / 0.86)).toBeCloseTo(1, 6);
    });
});

describe('the 2D tuba draws, both styles', () => {
  for (const [name, draw] of [['classic', drawTuba], ['vector', drawTubaV]] as const)
    it(`${name}: silent, then sounding (the pistons going down for the note, the lips following the engine’s), another fingering, back to rest; a phone and an Orchestra cell`, async () => {
      const st = newTubaState();
      const { ctx } = recorder();
      draw(ctx, 1440, 551, null, st, 39);
      expect(st.drawn?.levers).toBe(0);
      // the sound leaves from the bell's mouth, at the top, right of the middle
      expect(st.src!.x).toBeGreaterThan(720);
      expect(st.src!.y).toBeLessThan(200);
      const up = st.drawn!.buttons.slice();
      const step = async (m: number, n: number, blow = 0.8) => {
        for (let k = 0; k < n; k++) {
          draw(ctx, 1440, 551, sounding(m, k, blow), st, 39);
          await new Promise((r) => setTimeout(r, 8));
        }
      };
      // F1: valves 1 and 4
      await step(29, 14);
      expect(st.drawn?.levers).toBe(levers(29));
      expect(st.drawn?.levers).toBe(0b1001);
      expect(st.mech!.pos[0]).toBeGreaterThan(0.5);
      expect(st.mech!.pos[3]).toBeGreaterThan(0.5);
      expect(st.mech!.pos[1]).toBeLessThan(0.5);
      // their buttons are down (lower on the screen), the others where they were
      expect(st.drawn!.buttons[0]).toBeGreaterThan(up[0] + 2);
      expect(st.drawn!.buttons[3]).toBeGreaterThan(up[3] + 2);
      expect(st.drawn!.buttons[1]).toBeCloseTo(up[1], 0);
      // the lips' cycle, read off the trace: shut at its narrowest, open past 1 at its widest
      expect(Math.min(...st.lips!.cyc)).toBeLessThan(0.2);
      expect(Math.max(...st.lips!.cyc)).toBeGreaterThan(1);
      // C2 open: every piston comes up
      await step(36, 16);
      expect(st.drawn?.levers).toBe(0);
      expect(Math.max(...st.mech!.pos)).toBeLessThan(0.5);
      // D♭1: all four
      await step(25, 14);
      expect(st.drawn?.levers).toBe(0b1111);
      // the breath gone: a moment later (0.8 s) the pistons come up
      st.mech!.quiet = 0.79;
      await step(25, 3, 0);
      expect(st.drawn?.levers).toBe(0);
      // a phone's box and an Orchestra cell draw as well
      draw(ctx, 390, 480, sounding(48, 0), st, 47);
      expect(st.drawn!.body.y0).toBeGreaterThanOrEqual(47);
      const b = tubaBox();
      draw(ctx, Math.round(b.w * 120), Math.round(b.h * 120), sounding(41, 0), st, 0);
      expect(st.drawn!.body.x1).toBeLessThanOrEqual(Math.round(b.w * 120));
    });
});
