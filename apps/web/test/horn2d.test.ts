// The horn on the 2D stage (horn-plan.ts, horn-draw.ts, vector/horn.ts): its plan at a real double horn's
// measures, the air's path through it as long as the engine's tube for every fingering (each valve slide
// its share of its side's tube), the levers going down for the engine's own fingering (the thumb's change
// valve on the B♭ side) and the rotors turning a quarter turn, the lips following the engine's trace; its
// layout fits a laptop's stage, a phone's and an Orchestra cell; and both styles draw, silent and sounding.
import { describe, expect, it } from 'vitest';
import { HORN_HI, HORN_LO, hornFingering, hornTubeLength, type VisualFrame } from '@piano-model/engine';
import { AXIS, BELL_LEN, CAP_R, MPIECE, MP_LEN, RIM_C, RIM_R, ROT_R, ROT_X, ROT_Y, SLIDES, TR, TUBES, TUBE_LEN, bellR, hornAir, plen, valvesDown, type P } from '../src/ui/horn-plan.ts';
import { HN_X0, HN_X1, HN_Y0, HN_Y1, LEVERS, crankAngle, drawHorn, hornBox, hornLayout, newHornState } from '../src/ui/horn-draw.ts';
import { drawHornV } from '../src/ui/vector/horn.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

installCanvas();
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const near = (v: number, want: number, tol: number, what = '') => expect(Math.abs(v / want - 1), `${what} ${v.toFixed(4)} against ${want.toFixed(4)}`).toBeLessThan(tol);

describe('the 2D horn’s plan, at a real double horn’s measures', () => {
  it('the bell 311 mm across its rim; the corpus about 320 mm across; the horn about 0.6 m long and 0.43 m across', () => {
    expect(RIM_R * 2).toBeCloseTo(0.311, 3);
    expect(bellR(0)).toBeCloseTo(0.1555, 4);
    // (MIMEd 15417's bores: 114 mm at 74.5 mm from the rim, 16.8 at 835 mm; the 11.9 mm bore beyond)
    near(2 * bellR(0.0745), 0.114, 0.05, 'the flare 74.5 mm in');
    near(2 * bellR(0.835), 0.0168, 0.05, 'the tail 835 mm in');
    near(2 * bellR(1.5), 0.0119, 0.01, 'the main bore');
    // the body's laps: the outermost's outside edge 300–326 mm across (MIMEd 15417, 16565, 18259)
    const body = TUBES.body.pts;
    let rOut = 0;
    body.forEach((p, i) => {
      const s = plen(body.slice(0, i + 1));
      const r = typeof TUBES.body.r === 'number' ? TUBES.body.r : TUBES.body.r(s);
      // (round the circle, before it leaves for the bell)
      if (i > body.length * 0.5 && i < body.length * 0.85) rOut = Math.max(rOut, Math.hypot(p[0], p[1]) + r);
    });
    expect(2 * rOut).toBeGreaterThan(0.3);
    expect(2 * rOut).toBeLessThan(0.335);
    // the whole: the bell's rim to the paddles' tips, the bell's sweep to the mouthpiece
    expect(HN_X1 - HN_X0).toBeGreaterThan(0.55);
    expect(HN_X1 - HN_X0).toBeLessThan(0.66);
    expect(HN_Y1 - HN_Y0).toBeGreaterThan(0.4);
    expect(HN_Y1 - HN_Y0).toBeLessThan(0.47);
    // the bell leaves the circle along its tangent, its axis 35° up to the left, 0.30 m to the rim
    expect(BELL_LEN).toBeCloseTo(0.3, 3);
    expect(AXIS[0]).toBeLessThan(0);
    expect(RIM_C[0]).toBeLessThan(-0.3);
  });
  it('the tubing 12.6 mm across; four rotors in a column 36 mm apart, the change valve at the top; the mouthpiece 87 mm with a 17.5 mm cup', () => {
    expect(2 * TR).toBeCloseTo(0.0126, 4);
    for (let k = 1; k < 4; k++) expect(ROT_Y[k - 1] - ROT_Y[k]).toBeCloseTo(0.036, 4);
    expect(ROT_R).toBeGreaterThan(CAP_R);
    expect(MP_LEN).toBeCloseTo(0.087, 3);
    expect(MPIECE[1][0] * 2).toBeGreaterThan(0.017);
    // the levers to the right of the column, the thumb's at the top
    expect(LEVERS[0].hub[1]).toBeGreaterThan(LEVERS[1].hub[1]);
    for (const l of LEVERS) expect(l.tip[0]).toBeGreaterThan(ROT_X + ROT_R);
  });
});

describe('the 2D horn’s air path is the engine’s tube', () => {
  it('open: 3.74 m on the F side, 2.80 m on the B♭ side (the thumb’s valve)', () => {
    near(hornAir('F', [false, false, false, false]).total, 3.74, 0.005, 'F');
    near(hornAir('Bb', [true, false, false, false]).total, 2.8, 0.005, 'B♭');
  });
  it('each valve slide its semitones’ share of its side’s tube (2: one, 1: two, 3: three), within 2 %', () => {
    for (const [side, L] of [['F', 3.74], ['Bb', 2.8]] as const)
      for (const [k, st] of [[1, 2], [2, 1], [3, 3]]) near(TUBE_LEN[`${side}${k}`], L * (Math.pow(2, st / 12) - 1), 0.02, `${side}${k}`);
    // (each slide out of its rotor's side and back into it)
    for (const side of ['F', 'Bb'] as const)
      for (let k = 1; k <= 3; k++) {
        const s = SLIDES[side][k];
        expect(Math.hypot(s[0][0] - ROT_X, s[0][1] - ROT_Y[k])).toBeLessThan(ROT_R + 0.002);
        expect(Math.hypot(s[s.length - 1][0] - ROT_X, s[s.length - 1][1] - ROT_Y[k])).toBeLessThan(ROT_R + 0.002);
      }
  });
  it('every note’s fingering (B♭1–F5): the drawn path within 3.5 % of the engine’s tube (valve combinations run a little short, as on a real horn)', () => {
    for (let m = HORN_LO; m <= HORN_HI; m++) {
      const f = hornFingering(m);
      const a = hornAir(f.side, valvesDown(f));
      near(a.total, hornTubeLength(f), 0.035, `m${m} ${f.side} ${f.valves}`);
      // single valves and the open horn within 1.5 %
      if (!f.valves.includes('+')) near(a.total, hornTubeLength(f), 0.015, `m${m}`);
      // the path is continuous: each run starts where the one before ended
      for (let i = 1; i < a.runs.length; i++) {
        const p: P = a.runs[i - 1].pts[a.runs[i - 1].pts.length - 1];
        const q: P = a.runs[i].pts[0];
        expect(Math.hypot(p[0] - q[0], p[1] - q[1]), `m${m}: ${a.runs[i - 1].id} → ${a.runs[i].id}`).toBeLessThan(0.0011);
      }
      // through the side's own loop and the pressed valves' slides on that side, nothing else
      const ids = new Set(a.runs.map((r) => r.id));
      expect(ids.has(f.side === 'F' ? 'floop' : 'bloop')).toBe(true);
      expect(ids.has(f.side === 'F' ? 'bloop' : 'floop')).toBe(false);
      for (let k = 1; k <= 3; k++) {
        expect(ids.has(`${f.side}${k}`), `m${m} valve ${k}`).toBe(f.valves.includes(String(k)));
        expect(ids.has(`${f.side === 'F' ? 'Bb' : 'F'}${k}`)).toBe(false);
      }
      // the partial's half-waves fit the tube and the cone's missing apex (the engine's: about 5 % more)
      const r = (f.partial * 343) / (2 * et(m)) / a.total;
      expect(r, `m${m}`).toBeGreaterThan(1.03);
      expect(r, `m${m}`).toBeLessThan(1.1);
    }
  });
});

/** a sounding frame for a note: its wave a standing wave of its partial along the bore, the lips shut
 *  for a third of each cycle and open to 1.4 between */
function sounding(midi: number, t: number, blow = 0.8): VisualFrame {
  const f = hornFingering(midi);
  const shape = new Float32Array(160);
  for (let i = 0; i < shape.length; i++) shape[i] = Math.cos((Math.PI * f.partial * i) / (shape.length - 1)) * Math.cos(t);
  const rate = 48000;
  const P = rate / et(midi);
  const trace = new Float32Array(Math.round(4 * P));
  for (let i = 0; i < trace.length; i++) trace[i] = Math.max(0, 1.4 * Math.sin((2 * Math.PI * i) / P) + 0.5);
  return {
    instrument: 'horn', load: 0, voices: 1, sympathetic: 0, maxVoices: 1, sustain: 0, soft: 0, gainReduction: 1, strike: null, modes: new Float32Array(16),
    focus: { midi, nStrings: 1, shapes: [shape], hammerAt: 0.01, prepAt: -1, lengthM: hornTubeLength(f), f1: et(midi), B: 0, damper: 0 },
    excite: { title: 'Lips', unit: '', rate, trace, trace2: trace, trace2Label: '', caption: '', meta: '' },
    lips: { open: 0.8, blow },
  } as unknown as VisualFrame;
}
const levers = (m: number) => valvesDown(hornFingering(m)).reduce((a, d, i) => a | (d ? 1 << i : 0), 0);

describe('the 2D horn’s levers follow the engine’s fingering', () => {
  it('F2 open, G3 valve 1 (F side), A♭2 2+3; D4 the thumb alone, G4 the thumb and 1+2, E♭5 the thumb and 1', () => {
    expect(levers(41)).toBe(0);
    expect(levers(55)).toBe(0b0010);
    expect(levers(44)).toBe(0b1100);
    expect(levers(62)).toBe(0b0001);
    expect(levers(67)).toBe(0b0111);
    expect(levers(75)).toBe(0b0011);
  });
  it('a press turns its rotor’s crank a quarter turn', () => {
    for (let k = 0; k < 4; k++) expect(crankAngle(k, 0) - crankAngle(k, 1)).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('the 2D horn’s layout', () => {
  /** the stage under the top band (W×H) with the file player's px at its top: a laptop, a phone, a Pixel 7;
   *  and an Orchestra cell at 300 px/m and at 120 px/m */
  const b = hornBox();
  const cells: [string, number, number, number][] = [
    ['laptop', 1440, 547, 39],
    ['phone 390×844', 390, 381, 47],
    ['Pixel 7', 412, 439, 47],
    ['Orchestra 300 px/m', Math.round(b.w * 300), Math.round(b.h * 300), 0],
    ['Orchestra 120 px/m', Math.round(b.w * 120), Math.round(b.h * 120), 0],
  ];
  for (const [name, W, H, top] of cells)
    it(`${name} (${W}×${H}, ${top} px of player): whole in its box under the player`, () => {
      const L = hornLayout(W, H, top);
      const X = (x: number) => L.ox + x * L.sc;
      const Y = (y: number) => L.oy - y * L.sc;
      for (const [x, y] of [[HN_X0, HN_Y0], [HN_X1, HN_Y1], [HN_X0, HN_Y1], [HN_X1, HN_Y0]]) {
        expect(X(x)).toBeGreaterThanOrEqual(0);
        expect(X(x)).toBeLessThanOrEqual(W);
        expect(Y(y)).toBeGreaterThanOrEqual(top);
        expect(Y(y)).toBeLessThanOrEqual(H);
      }
      if (name.startsWith('Orchestra')) near(L.sc, Number(name.split(' ')[1]), 0.01, 'px/m');
      // a stage: as large as fits (90 % of the width, a phone's 94 %, or 86 % of the height under the player)
      else expect(Math.max(((HN_X1 - HN_X0) * L.sc) / W / (W < 600 ? 0.94 : 0.9), ((HN_Y1 - HN_Y0) * L.sc) / (H - top) / 0.86)).toBeCloseTo(1, 6);
    });
});

describe('the 2D horn draws, both styles', () => {
  for (const [name, draw] of [['classic', drawHorn], ['vector', drawHornV]] as const)
    it(`${name}: silent, then sounding (the levers going down for the note, the lips following the engine’s), a B♭-side note, back to rest; a phone and an Orchestra cell`, async () => {
      const st = newHornState();
      const { ctx } = recorder();
      draw(ctx, 1440, 547, null, st, 39);
      expect(st.drawn?.levers).toBe(0);
      expect(st.drawn?.side).toBe(null);
      // the sound leaves from the bell's mouth, at the left
      expect(st.src!.x).toBeLessThan(720);
      const step = async (m: number, n: number, blow = 0.8) => {
        for (let k = 0; k < n; k++) {
          draw(ctx, 1440, 547, sounding(m, k, blow), st, 39);
          await new Promise((r) => setTimeout(r, 8));
        }
      };
      await step(55, 12);
      expect(st.drawn?.levers).toBe(levers(55));
      expect(st.drawn?.side).toBe('F');
      // valve 1's lever sprung down, the thumb's up
      expect(st.mech!.pos[1]).toBeGreaterThan(0.5);
      expect(st.mech!.pos[0]).toBeLessThan(0.5);
      // the lips' cycle, read off the trace: shut at its narrowest, open past 1 at its widest
      expect(Math.min(...st.lips!.cyc)).toBeLessThan(0.2);
      expect(Math.max(...st.lips!.cyc)).toBeGreaterThan(1);
      // G4 on the B♭ side: the thumb, 1 and 2
      await step(67, 12);
      expect(st.drawn?.levers).toBe(0b0111);
      expect(st.drawn?.side).toBe('Bb');
      expect(st.mech!.pos[0]).toBeGreaterThan(0.5);
      expect(st.mech!.pos[2]).toBeGreaterThan(0.5);
      // the breath gone: a moment later (0.8 s) the levers lift
      st.mech!.quiet = 0.79;
      await step(67, 3, 0);
      expect(st.drawn?.levers).toBe(0);
      // a phone's box and an Orchestra cell draw as well
      draw(ctx, 390, 381, sounding(75, 0), st, 47);
      expect(st.drawn!.body.y0).toBeGreaterThanOrEqual(47);
      const b = hornBox();
      draw(ctx, Math.round(b.w * 200), Math.round(b.h * 200), sounding(41, 0), st, 0);
      expect(st.drawn!.body.x1).toBeLessThanOrEqual(Math.round(b.w * 200));
    });
});
