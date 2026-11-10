// The slide trombone on the 2D stage (trombone-plan.ts, trombone-draw.ts, vector/trombone.ts): its plan at
// each size's real measures (TROMBONE_SIZES: the bell, the bore, the open tube, the slide's reach), the air's
// path through it as long as the engine's tube for every note's fingering (the slide out by the engine's
// slide, each valve's loop its share), the outer slide drawn out by the engine's slide at the drawing's px
// per metre, the levers going down for the engine's valves; its layout fits a laptop's stage, a phone's and an
// Orchestra cell; both styles draw, silent and sounding, from the engine's trombone frame or (a host that does
// not pass it on) from the frame's caption.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TROMBONE_SIZES, tromboneFingering, tromboneSlideOut, tromboneTubeLength, type VisualFrame } from '@piano-model/engine';
import { F_LOOP, GB_LOOP, OPEN, SIZES, airLength, bellRuns, extent, plan, positionOut, slideRuns, type Size } from '../src/ui/trombone-plan.ts';
import { TB_H, TB_W, drawTrombone, newTromboneState, tromboneBox, tromboneLayout, tromboneOf } from '../src/ui/trombone-draw.ts';
import { drawTromboneV } from '../src/ui/vector/trombone.ts';
import { installCanvas, recorder } from './recording-ctx.ts';

installCanvas();
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const near = (v: number, want: number, tol: number, what = '') => expect(Math.abs(v / want - 1), `${what} ${v.toFixed(4)} against ${want.toFixed(4)}`).toBeLessThan(tol);
const downOf = (valves: number[]): [boolean, boolean] => [valves.includes(1), valves.includes(2)];

describe('the 2D trombone’s plan, at each size’s measures', () => {
  it('the bells (7″, 8½″, 9½″), the bores, the slide’s reach and the mouthpieces are the engine’s, within 3 %', () => {
    for (const s of SIZES) {
      const p = plan(s);
      const B = TROMBONE_SIZES[s];
      near(2 * p.R, B.bell, 0.001, `${s} bell`);
      near(2 * p.bellR(0), B.bell, 0.001, `${s} rim`);
      // the tubing's outside a little over the bore (its walls), the outer slide over the inner
      expect(2 * p.rIn).toBeGreaterThan(B.bore);
      near(2 * p.rIn, B.bore, 0.08, `${s} inner slide`);
      expect(p.rOut).toBeGreaterThan(p.rIn);
      // the slide reaches the engine's travel (the bass's as far as its stockings: past its seventh)
      if (s === 'bass') expect(p.travel).toBeGreaterThan(positionOut('bass', 7) + 0.02);
      else expect(p.travel).toBeCloseTo(B.travel, 6);
      // the outer slide stays on the inner tubes' stockings all the way out
      expect(p.xo + p.travel).toBeLessThan(p.xs);
      // the mouthpiece's rim about 1.55 × its cup (a 6½AL: 40 mm over 25.4)
      near(2 * p.mpProfile[3][0], 1.57 * B.cup, 0.03, `${s} mouthpiece rim`);
    }
    // the bell's flare at the YSL-620's measures (Ø 147 mm 17 mm in from the rim, 90 at 49, 59 at 97, 44 at
    // 161, 25 at 385)
    const t = plan('tenor');
    for (const [d, D] of [[0.017, 0.147], [0.049, 0.09], [0.097, 0.059], [0.161, 0.0445], [0.385, 0.025]]) near(2 * t.bellR(d), D, 0.08, `tenor bell at ${d}`);
    // the slide's tubes 72 mm apart (tenor), 70 (bass), 46.5 (alto); its crook 0.73 m down from the receiver
    expect(t.sp).toBeCloseTo(0.072, 4);
    expect(plan('bass').sp).toBeCloseTo(0.07, 4);
    expect(plan('alto').sp).toBeCloseTo(0.0465, 4);
    expect(t.xc).toBeCloseTo(0.73, 3);
  });
  it('the whole: a tenor about 1.18 m long with its slide in (the YSL-620: 1.185 m), the alto about 0.83, the bass about 1.2; each about a quarter metre tall', () => {
    const closed = (s: Size) => {
      const e = extent(plan(s));
      return e.x1 - e.x0 - plan(s).travel;
    };
    near(closed('tenor'), 1.185, 0.03, 'tenor');
    near(closed('alto'), 0.83, 0.06, 'alto');
    near(closed('bass'), 1.21, 0.04, 'bass');
    for (const s of SIZES) {
      const e = extent(plan(s));
      expect(e.y1 - e.y0, s).toBeGreaterThan(0.2);
      expect(e.y1 - e.y0, s).toBeLessThan(0.3);
    }
    // the shared box: the widest (with its slide out) and the tallest of the three
    expect(TB_W).toBeGreaterThan(1.75);
    expect(TB_W).toBeLessThan(1.95);
    expect(TB_H).toBeLessThan(0.3);
  });
  it('the valves per size: none on the alto, the F rotor on the tenor, the F and G♭ rotors on the bass', () => {
    expect(plan('alto').rotors.length).toBe(0);
    expect(plan('tenor').rotors.length).toBe(1);
    expect(plan('bass').rotors.length).toBe(2);
    expect(plan('tenor').tubes.floop).toBeTruthy();
    expect(plan('bass').tubes.gloop).toBeTruthy();
  });
});

describe('the 2D trombone’s air path is the engine’s tube', () => {
  it('open: 2.06 m (alto), 2.74 m (tenor, bass); the F loop a fourth, the G♭ loop to a minor sixth with it', () => {
    for (const s of SIZES) near(airLength(plan(s), 0, [false, false]), OPEN(s), 0.001, s);
    for (const s of ['tenor', 'bass'] as const) near(airLength(plan(s), 0, [true, false]) - OPEN(s), F_LOOP(s), 0.002, `${s} F`);
    near(airLength(plan('bass'), 0, [true, true]), OPEN('bass') * Math.pow(2, 8 / 12), 0.002, 'bass D');
    near(airLength(plan('bass'), 0, [true, true]) - airLength(plan('bass'), 0, [true, false]), GB_LOOP('bass'), 0.003, 'bass G♭');
  });
  it('every note of each size’s compass: with the slide out by the engine’s slide and its valves, the drawn path within 1 % of the engine’s tube, continuous', () => {
    for (const s of SIZES) {
      const B = TROMBONE_SIZES[s];
      const p = plan(s);
      for (let m = B.lo; m <= B.hi; m++) {
        const f = tromboneFingering(m, s);
        const out = tromboneSlideOut(f, s);
        // (the bass's few notes past its stockings are drawn at its slide's end)
        if (out > p.travel) continue;
        near(airLength(p, out, downOf(f.valves)), tromboneTubeLength(f, s), 0.01, `${s} m${m} ${f.side} ${f.position}`);
        const runs = [...slideRuns(p, out), ...bellRuns(p, downOf(f.valves))];
        for (let i = 1; i < runs.length; i++) {
          const a = runs[i - 1].pts[runs[i - 1].pts.length - 1];
          const b = runs[i].pts[0];
          expect(Math.hypot(a[0] - b[0], a[1] - b[1]), `${s} m${m}: ${runs[i - 1].id} → ${runs[i].id}`).toBeLessThan(0.0011);
        }
        // through the loops of the valves held and no other
        const ids = new Set(runs.map((r) => r.id));
        expect(ids.has('floop'), `${s} m${m}`).toBe(f.valves.includes(1));
        expect(ids.has('gloop'), `${s} m${m}`).toBe(f.valves.includes(2));
      }
    }
  });
  it('the positions: each a semitone down the slide (the engine’s tromboneSlideOut), the tenor’s seventh 0.57 m out', () => {
    expect(positionOut('tenor', 7)).toBeCloseTo(0.567, 2);
    for (let n = 1; n <= 7; n++) expect(positionOut('tenor', n)).toBeCloseTo(tromboneSlideOut({ side: 'Bb', valves: [], position: n, sideLower: 0, lower: n - 1, partial: 3 }, 'tenor'), 9);
  });
});

/** a sounding frame: the engine's trombone for a note on a size (its slide where the engine has it, or held
 *  back with `bare` as a host that does not pass it on), a standing wave of its partial, the lips' trace */
function sounding(midi: number, t: number, size: Size = 'tenor', blow = 3, bare = false): VisualFrame {
  const f = tromboneFingering(midi, size);
  const shape = new Float32Array(160);
  for (let i = 0; i < shape.length; i++) shape[i] = Math.cos((Math.PI * Math.max(1, f.partial) * i) / (shape.length - 1)) * Math.cos(t);
  const rate = 48000;
  const P = rate / et(midi);
  const trace = new Float32Array(Math.round(4 * P));
  for (let i = 0; i < trace.length; i++) trace[i] = Math.max(0, 1.4 * Math.sin((2 * Math.PI * i) / P) + 0.5);
  const side = f.side === 'F' ? 'F valve · ' : f.side === 'D' ? 'F+G♭ valves · ' : '';
  return {
    instrument: 'trombone', load: 0, voices: 1, sympathetic: 0, maxVoices: 1, sustain: 0, soft: 0, gainReduction: 1, strike: null, modes: new Float32Array(16),
    focus: { midi, nStrings: 1, shapes: [shape], hammerAt: 0.01, prepAt: -1, lengthM: tromboneTubeLength(f, size), f1: et(midi), B: 0, damper: 0 },
    excite: { title: 'Lips', unit: '', rate, trace, trace2: trace, trace2Label: '', caption: '', meta: `${side}position ${f.position} · ${f.partial === 1 ? 'pedal' : `partial ${f.partial}`}` },
    lips: { open: 0.8, blow },
    trombone: bare ? undefined : { size, slide: tromboneSlideOut(f, size), target: tromboneSlideOut(f, size), position: f.position, valves: f.valves, side: f.side, partial: f.partial },
  } as unknown as VisualFrame;
}

describe('the 2D trombone’s layout', () => {
  /** the stage under the top band (W×H) with the file player's px at its top: a laptop, a phone, a Pixel 7;
   *  and an Orchestra cell at 300 px/m and at 120 px/m */
  const b = tromboneBox();
  const cells: [string, number, number, number][] = [
    ['laptop', 1440, 547, 39],
    ['phone 390×844', 390, 381, 47],
    ['Pixel 7', 412, 439, 47],
    ['Orchestra 300 px/m', Math.round(b.w * 300), Math.round(b.h * 300), 0],
    ['Orchestra 120 px/m', Math.round(b.w * 120), Math.round(b.h * 120), 0],
  ];
  for (const [name, W, H, top] of cells)
    it(`${name} (${W}×${H}, ${top} px of player): every size whole in its box under the player, the slide all the way out, at one px/m`, () => {
      const scs = new Set<number>();
      for (const s of SIZES) {
        const L = tromboneLayout(W, H, top, s);
        const e = extent(L.p);
        const X = (x: number) => L.ox + x * L.sc;
        const Y = (y: number) => L.oy - y * L.sc;
        expect(X(e.x0)).toBeGreaterThanOrEqual(0);
        expect(X(e.x1)).toBeLessThanOrEqual(W);
        expect(Y(e.y1)).toBeGreaterThanOrEqual(top);
        expect(Y(e.y0)).toBeLessThanOrEqual(H);
        scs.add(Math.round(L.sc * 1000));
      }
      // (the three at one scale: the alto stands smaller)
      expect(scs.size).toBe(1);
      const L = tromboneLayout(W, H, top);
      // (an Orchestra cell's height is whole px: 40 px at 120 px/m, so within 1.5 %)
      if (name.startsWith('Orchestra')) near(L.sc, Number(name.split(' ')[1]), 0.015, 'px/m');
      // a stage: as large as fits (90 % of the width, a phone's 94 %, or 86 % of the height under the player)
      else expect(Math.max((TB_W * L.sc) / W / (W < 600 ? 0.94 : 0.9), (TB_H * L.sc) / (H - top) / 0.86)).toBeCloseTo(1, 6);
    });
});

describe('the 2D trombone draws, both styles', () => {
  // (a clock the drawing reads, a frame every 16 ms: no waiting)
  let clock = 0;
  beforeAll(() => {
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
  });
  afterAll(() => vi.restoreAllMocks());
  const step = async (draw: typeof drawTrombone, ctx: CanvasRenderingContext2D, st: ReturnType<typeof newTromboneState>, fr: () => VisualFrame | null, n: number, W = 1440, H = 547, top = 39) => {
    for (let k = 0; k < n; k++) {
      clock += 16;
      draw(ctx, W, H, fr(), st, top);
    }
  };
  for (const [name, draw] of [['classic', drawTrombone], ['vector', drawTromboneV]] as const)
    it(`${name}: at rest, then the slide out for a fifth- and an F-side sixth-position note (its crook out by the slide at the drawing’s px/m, the trigger down), back in for B♭3, the trigger up after; the bass’s two valves; a phone and an Orchestra cell`, async () => {
      const st = newTromboneState();
      const { ctx } = recorder();
      draw(ctx, 1440, 547, null, st, 39);
      const d0 = st.drawn!;
      expect(d0.levers).toBe(0);
      expect(d0.slide).toBe(0);
      expect(d0.size).toBe('tenor');
      // the sound leaves from the bell's mouth, at the right of the bell section
      expect(st.src!.x).toBeGreaterThan(d0.mouth.x1);
      // C♯3: the slide alone, fifth position
      let k = 0;
      await step(draw, ctx, st, () => sounding(49, k++), 14);
      const d5 = st.drawn!;
      const want5 = tromboneSlideOut(tromboneFingering(49), 'tenor');
      expect(d5.position).toBe(5);
      // (the engine's slide, eased over a frame or two)
      expect(d5.target).toBeCloseTo(want5, 9);
      near(d5.slide, want5, 0.02, 'the slide drawn');
      // the crook out by exactly the slide, at the drawing's px per metre
      expect(d5.crookX - d0.crookX).toBeCloseTo(d5.slide * d5.pxPerM, 3);
      expect(d5.levers).toBe(0);
      // C2: the F valve, sixth position, the slide 0.61 m out
      await step(draw, ctx, st, () => sounding(36, k++), 16);
      expect(st.drawn!.levers).toBe(1);
      expect(st.drawn!.side).toBe('F');
      expect(st.drawn!.slide).toBeGreaterThan(0.6);
      expect(st.mech!.pos[0]).toBeGreaterThan(0.5);
      // the lips' cycle, read off the trace: shut at its narrowest, open past 1 at its widest
      expect(Math.min(...st.lips!.cyc)).toBeLessThan(0.2);
      expect(Math.max(...st.lips!.cyc)).toBeGreaterThan(1);
      // B♭3: first position, the slide back in
      await step(draw, ctx, st, () => sounding(58, k++), 16);
      expect(st.drawn!.target).toBe(0);
      expect(st.drawn!.slide).toBeLessThan(0.002);
      expect(st.drawn!.position).toBe(1);
      // the F valve again, then the breath gone: a moment later (0.8 s) the trigger lifts
      await step(draw, ctx, st, () => sounding(48, k++), 4);
      expect(st.drawn!.levers).toBe(1);
      st.mech!.quiet = 0.79;
      await step(draw, ctx, st, () => sounding(48, k++, 'tenor', 0), 3);
      expect(st.drawn!.levers).toBe(0);
      // the bass: D side (both valves) for B1, the alto (no valve) its seventh for A2
      await step(draw, ctx, st, () => sounding(35, k++, 'bass'), 14);
      expect(st.drawn!.size).toBe('bass');
      expect(st.drawn!.levers).toBe(3);
      expect(st.drawn!.valves).not.toBe(null);
      await step(draw, ctx, st, () => sounding(45, k++, 'alto'), 14);
      expect(st.drawn!.size).toBe('alto');
      expect(st.drawn!.valves).toBe(null);
      expect(st.drawn!.position).toBe(7);
      near(st.drawn!.slide, tromboneSlideOut(tromboneFingering(45, 'alto'), 'alto'), 0.02, 'the alto’s seventh');
      // a phone's box and an Orchestra cell draw as well
      draw(ctx, 390, 381, sounding(53, 0), st, 47);
      expect(st.drawn!.body.y0).toBeGreaterThanOrEqual(47);
      expect(st.drawn!.body.x1).toBeLessThanOrEqual(390);
      const b = tromboneBox();
      draw(ctx, Math.round(b.w * 200), Math.round(b.h * 200), sounding(41, 0), st, 0);
      expect(st.drawn!.body.x1).toBeLessThanOrEqual(Math.round(b.w * 200));
    });
  it('a frame without the engine’s trombone (a host that does not pass it on): the fingering and the slide’s goal read off its caption and its tube; the slide moves there at the engine’s speed', async () => {
    for (const [m, s] of [[49, 'tenor'], [36, 'tenor'], [35, 'bass'], [45, 'alto'], [58, 'tenor']] as const) {
      const tb = tromboneOf(sounding(m, 0, s, 3, true), s === 'bass' ? 'bass' : 'tenor')!;
      const f = tromboneFingering(m, s);
      expect(tb.size).toBe(s);
      expect(tb.position).toBe(f.position);
      expect(tb.valves).toEqual(f.valves);
      expect(tb.target).toBeCloseTo(tromboneSlideOut(f, s), 9);
      expect(Number.isNaN(tb.slide)).toBe(true);
    }
    const st = newTromboneState();
    const { ctx } = recorder();
    let k = 0;
    await step(drawTrombone, ctx, st, () => sounding(36, k++, 'tenor', 3, true), 3);
    // (not there yet: 4 m/s)
    expect(st.drawn!.slide).toBeGreaterThan(0);
    expect(st.drawn!.slide).toBeLessThan(0.6);
    await step(drawTrombone, ctx, st, () => sounding(36, k++, 'tenor', 3, true), 30);
    expect(st.drawn!.slide).toBeCloseTo(tromboneSlideOut(tromboneFingering(36), 'tenor'), 2);
  });
});
