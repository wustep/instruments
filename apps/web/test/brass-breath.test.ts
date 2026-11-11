// The brass embouchure drawn as every wind's breath (stage-draw breathStream, vector/kit.ts breathFlow and
// lipLine, gl/winds3d.ts breathIn): the horn, the trumpet and the trombone take the breath into their
// mouthpieces as the reeds take it into theirs — three faint dashed streams converging on the tip while the
// note is blown, nothing at rest — in the drawn style, the vector style (the green breath, the red lips on the
// rim as the reeds' pinch is drawn) and 3D (faint steel streams, as the flute's jet). No lip cushions. And
// the horn's bell is empty: the engine has no hand (no stopping, no hand position), so none is drawn.
import { describe, expect, it } from 'vitest';
import { hornFingering, hornTubeLength, tromboneFingering, tromboneSlideOut, tromboneTubeLength, type VisualFrame } from '@piano-model/engine';
import { BRASS_BREATH, INK, TR_MP, breathStream, drawTrumpet, trAlong, trProj, trumpetLayout, AutoScale, type TrumpetState } from '../src/ui/stage-draw.ts';
import { drawHorn, hornLayout, newHornState } from '../src/ui/horn-draw.ts';
import { AXIS, MOUTH_K, MP_RIM, RIM_C, RIM_R } from '../src/ui/horn-plan.ts';
import { drawTrombone, newTromboneState, tromboneLayout } from '../src/ui/trombone-draw.ts';
import { drawHornV } from '../src/ui/vector/horn.ts';
import { drawTromboneV } from '../src/ui/vector/trombone.ts';
import { drawTrumpetV } from '../src/ui/vector/winds.ts';
import { V, breathFlow, lipLine } from '../src/ui/vector/kit.ts';
import { Batch, xform, type Vec3 } from '../src/ui/gl/gl3d.ts';
import { buildHornModel, poseHorn } from '../src/ui/gl/horn3d.ts';
import { buildTromboneModel, poseTrombone } from '../src/ui/gl/trombone3d.ts';
import { breathIn, buildTrumpetModel, newWindPose, poseTrumpet } from '../src/ui/gl/winds3d.ts';
import { installCanvas } from './recording-ctx.ts';

installCanvas();
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

type Pt = [number, number];
/** one fill or stroke: its style, its dash, its points (stage px) and the Path2D it drew, if one */
interface Op {
  kind: 'fill' | 'stroke';
  style: unknown;
  dash: number[];
  pts: Pt[];
  path: object | null;
}
/** a 2D context that keeps its transform and state and records every fill and stroke, in order */
function spy() {
  type M = [number, number, number, number, number, number];
  let m: M = [1, 0, 0, 1, 0, 0];
  const st = { strokeStyle: '' as unknown, fillStyle: '' as unknown, dash: [] as number[] };
  const stack: { m: M; s: typeof st }[] = [];
  const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const at = (x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  let cur: Pt[] = [];
  const ops: Op[] = [];
  const grad = { addColorStop: () => undefined };
  const record = (kind: Op['kind'], path?: { pts?: Pt[] }) => {
    const pts = path?.pts ? path.pts.map(([x, y]) => at(x, y)) : [...cur];
    ops.push({ kind, style: kind === 'fill' ? st.fillStyle : st.strokeStyle, dash: [...st.dash], pts, path: path ?? null });
  };
  const own: Record<string, unknown> = {
    save: () => stack.push({ m: [...m] as M, s: { ...st, dash: [...st.dash] } }),
    restore: () => {
      const s = stack.pop();
      if (s) {
        m = s.m;
        Object.assign(st, s.s);
      }
    },
    translate: (x: number, y: number) => (m = mul(m, [1, 0, 0, 1, x, y])),
    scale: (x: number, y: number) => (m = mul(m, [x, 0, 0, y, 0, 0])),
    rotate: (t: number) => (m = mul(m, [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0])),
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => (m = mul(m, [a, b, c, d, e, f])),
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => (m = [a, b, c, d, e, f]),
    getTransform: () => ({ a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] }),
    setLineDash: (d: number[]) => (st.dash = [...d]),
    beginPath: () => (cur = []),
    moveTo: (x: number, y: number) => cur.push(at(x, y)),
    lineTo: (x: number, y: number) => cur.push(at(x, y)),
    quadraticCurveTo: (_a: number, _b: number, x: number, y: number) => cur.push(at(x, y)),
    bezierCurveTo: (_a: number, _b: number, _c: number, _d: number, x: number, y: number) => cur.push(at(x, y)),
    arc: (x: number, y: number, r: number) => {
      for (let k = 0; k <= 12; k++) cur.push(at(x + r * Math.cos((k * Math.PI) / 6), y + r * Math.sin((k * Math.PI) / 6)));
    },
    ellipse: (x: number, y: number) => cur.push(at(x, y)),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: () => ({ width: 0 }),
    fill: (p?: { pts?: Pt[] }) => record('fill', p),
    stroke: (p?: { pts?: Pt[] }) => record('stroke', p),
  };
  const ctx = new Proxy(own, {
    get: (o, k: string) => (k in o ? o[k] : k === 'strokeStyle' ? st.strokeStyle : k === 'fillStyle' ? st.fillStyle : () => undefined),
    set: (_o, k: string, v) => {
      if (k === 'strokeStyle') st.strokeStyle = v;
      if (k === 'fillStyle') st.fillStyle = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** the drawn style's breath: dashed strokes in the steel ink */
const steelDashed = (ops: Op[]) => ops.filter((o) => o.kind === 'stroke' && o.dash.length > 0 && typeof o.style === 'string' && o.style.startsWith(`rgba(${INK.steel},`));
/** the lips' opening over four cycles, shut for part of each, open to 1.4 between */
const lipTrace = (midi: number, rate = 48000) => {
  const P = rate / et(midi);
  return Float32Array.from({ length: Math.round(4 * P) }, (_, i) => Math.max(0, 1.4 * Math.sin((2 * Math.PI * i) / P) + 0.5));
};
const base = { load: 0, voices: 1, sympathetic: 0, maxVoices: 1, sustain: 0, soft: 0, gainReduction: 1, strike: null, modes: new Float32Array(16) };
const shapeOf = (partial: number, t: number) => Float32Array.from({ length: 160 }, (_, i) => Math.cos((Math.PI * Math.max(1, partial) * i) / 159) * Math.cos(t));
function hornFrame(midi: number, t: number): VisualFrame {
  const f = hornFingering(midi);
  const trace = lipTrace(midi);
  return {
    ...base,
    instrument: 'horn',
    focus: { midi, nStrings: 1, shapes: [shapeOf(f.partial, t)], hammerAt: 0.01, prepAt: -1, lengthM: hornTubeLength(f), f1: et(midi), B: 0, damper: 0 },
    excite: { title: 'Lips', unit: '', rate: 48000, trace, trace2: trace, trace2Label: '', caption: '', meta: '' },
    lips: { open: 0.8, blow: 0.8 },
  } as unknown as VisualFrame;
}
function tromboneFrame(midi: number, t: number): VisualFrame {
  const f = tromboneFingering(midi, 'tenor');
  const trace = lipTrace(midi);
  const out = tromboneSlideOut(f, 'tenor');
  return {
    ...base,
    instrument: 'trombone',
    focus: { midi, nStrings: 1, shapes: [shapeOf(f.partial, t)], hammerAt: 0.01, prepAt: -1, lengthM: tromboneTubeLength(f, 'tenor'), f1: et(midi), B: 0, damper: 0 },
    excite: { title: 'Lips', unit: '', rate: 48000, trace, trace2: trace, trace2Label: '', caption: '', meta: `position ${f.position} · partial ${f.partial}` },
    lips: { open: 0.8, blow: 3 },
    trombone: { size: 'tenor', slide: out, target: out, position: f.position, valves: f.valves, side: f.side, partial: f.partial },
  } as unknown as VisualFrame;
}
function trumpetFrame(midi: number, t: number): VisualFrame {
  const trace = lipTrace(midi);
  return {
    ...base,
    instrument: 'trumpet',
    focus: { midi, nStrings: 1, shapes: [shapeOf(4, t)], hammerAt: 0.01, prepAt: -1, lengthM: 1.48, f1: et(midi), B: 0, damper: 0 },
    excite: { title: 'Lips', unit: '', rate: 48000, trace, trace2: trace, trace2Label: '', caption: '', meta: 'valves 1+2 · partial 4' },
  } as unknown as VisualFrame;
}
const newTrumpet = (): TrumpetState => ({ pScale: new AutoScale(1e-6), env: new Float32Array(0) });

/** each brass instrument on a laptop's stage: its drawn and vector drawings, a sounding frame, a fresh state,
 *  and where its mouthpiece's rim is on the stage (px) with the screen direction into its cup */
const W = 1440;
const H = 547;
const TOP = 39;
const BRASS = [
  {
    name: 'horn',
    draw: (ctx: CanvasRenderingContext2D, fr: VisualFrame | null, st: unknown) => drawHorn(ctx, W, H, fr, st as ReturnType<typeof newHornState>, TOP),
    drawV: (ctx: CanvasRenderingContext2D, fr: VisualFrame | null, st: unknown) => drawHornV(ctx, W, H, fr, st as ReturnType<typeof newHornState>, TOP),
    frame: (t: number) => hornFrame(55, t),
    state: (): unknown => newHornState(),
    rim: (): { at: Pt; sc: number } => {
      const L = hornLayout(W, H, TOP);
      return { at: [L.ox + MP_RIM[0] * L.sc, L.oy - MP_RIM[1] * L.sc], sc: L.sc };
    },
  },
  {
    name: 'trombone',
    draw: (ctx: CanvasRenderingContext2D, fr: VisualFrame | null, st: unknown) => drawTrombone(ctx, W, H, fr, st as ReturnType<typeof newTromboneState>, TOP),
    drawV: (ctx: CanvasRenderingContext2D, fr: VisualFrame | null, st: unknown) => drawTromboneV(ctx, W, H, fr, st as ReturnType<typeof newTromboneState>, TOP),
    frame: (t: number) => tromboneFrame(53, t),
    state: (): unknown => newTromboneState(),
    rim: (): { at: Pt; sc: number } => {
      const L = tromboneLayout(W, H, TOP, 'tenor');
      return { at: [L.ox - L.p.mpVis * L.sc, L.oy], sc: L.sc };
    },
  },
  {
    name: 'trumpet',
    draw: (ctx: CanvasRenderingContext2D, fr: VisualFrame | null, st: unknown) => drawTrumpet(ctx, W, H, fr, st as TrumpetState),
    drawV: (ctx: CanvasRenderingContext2D, fr: VisualFrame | null, st: unknown) => drawTrumpetV(ctx, W, H, fr, st as TrumpetState),
    frame: (t: number) => trumpetFrame(67, t),
    state: (): unknown => newTrumpet(),
    rim: (): { at: Pt; sc: number } => {
      const L = trumpetLayout(W, H);
      const q = trProj(trAlong(-TR_MP));
      return { at: [L.ox + q[0] * L.S, L.oy + q[1] * L.S], sc: L.S };
    },
  },
];
/** draw `n` frames 8 ms apart (the springs and the lips' cycle settle); the last frame's ops */
async function run(draw: (ctx: CanvasRenderingContext2D, fr: VisualFrame | null, st: unknown) => void, st: unknown, fr: (k: number) => VisualFrame | null, n = 10): Promise<Op[]> {
  let ops: Op[] = [];
  for (let k = 0; k < n; k++) {
    const s = spy();
    draw(s.ctx, fr(k), st);
    ops = s.ops;
    await new Promise((r) => setTimeout(r, 8));
  }
  return ops;
}

describe('the breath, drawn alike on every wind', () => {
  it('breathStream: three dashed streams from the lips converging on the tip, the dashes flowing in', () => {
    const sc = 1000;
    const tip: Pt = [500, 300];
    const s = spy();
    breathStream(s.ctx, (a, w) => [tip[0] - a * sc, tip[1] + w * sc], sc, BRASS_BREATH, 0.45, 0);
    const st = steelDashed(s.ops);
    expect(st.length).toBe(3);
    for (const o of st) {
      expect(o.dash).toEqual([0.003 * sc, 0.0025 * sc]);
      const [p0, p1] = o.pts;
      // from 17 mm out to 1.2 mm from the tip, narrowing onto its axis
      expect(tip[0] - p0[0]).toBeCloseTo(17, 6);
      expect(tip[0] - p1[0]).toBeCloseTo(1.2, 6);
      expect(Math.abs(p1[1] - tip[1])).toBeLessThan(Math.abs(p0[1] - tip[1]) + 1e-9);
    }
    const ends = st.map((o) => o.pts[1][1]).sort((a, b) => a - b);
    expect(ends[2] - ends[0]).toBeCloseTo(1.2, 6);
  });

  it('kit.breathFlow and lipLine: the green breath converging on the tip, the red lips on the rim parted by their opening', () => {
    const tip: Pt = [500, 300];
    const sc = 1000;
    const at = (a: number, w: number): Pt => [tip[0] - a * sc, tip[1] + w * sc];
    const s = spy();
    breathFlow(s.ctx, at, 0.02, [0.0034, 0.0018, 0.0006], 0.0016, false, 1, 0);
    lipLine(s.ctx, at, 0.002, 0.0125, 1.4, 1, true);
    const green = s.ops.filter((o) => o.style === V.green && o.path);
    expect(green.length).toBe(1);
    expect(green[0].dash.length).toBe(2);
    // three streams: start, end; the ends 1.6 mm out, 1.2 mm apart
    const g = green[0].pts;
    expect(g.length).toBe(6);
    for (let j = 0; j < 3; j++) {
      expect(tip[0] - g[2 * j][0]).toBeCloseTo(20, 6);
      expect(tip[0] - g[2 * j + 1][0]).toBeCloseTo(1.6, 6);
    }
    const red = s.ops.filter((o) => o.style === V.red && o.path);
    expect(red.length).toBeGreaterThan(0);
    // (a beam strokes its path once, and again for a hot core)
    const r = red[0].pts;
    expect(r.length).toBe(4);
    // across the axis, 0.8 mm back from the rim, a 2 mm gap in the middle, 12.5 mm out each side
    for (const p of r) expect(tip[0] - p[0]).toBeCloseTo(0.8, 6);
    const ys = r.map((p) => p[1] - tip[1]).sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-13.5, 6);
    expect(ys[1]).toBeCloseTo(-1, 6);
    expect(ys[2]).toBeCloseTo(1, 6);
    expect(ys[3]).toBeCloseTo(13.5, 6);
  });

  for (const b of BRASS)
    it(`${b.name}, drawn: nothing at the mouthpiece at rest; sounding, the reeds’ three streams converging on the rim, no lip cushions`, async () => {
      const st = b.state();
      const { at: rim, sc } = b.rim();
      const rest = await run(b.draw, st, () => null, 3);
      expect(steelDashed(rest).length, 'at rest').toBe(0);
      const ops = await run(b.draw, st, (k) => b.frame(k * 0.4), 12);
      const br = steelDashed(ops);
      expect(br.length, 'sounding: three streams').toBe(3);
      for (const o of br) {
        const [p0, p1] = o.pts;
        // each ends at the lips' aperture, a millimetre or so from the rim's middle, and starts 17 mm out
        expect(dist(p1, rim) / sc, `${b.name}: the stream's end from the rim (m)`).toBeLessThan(0.0016);
        expect(dist(p0, rim) / sc).toBeGreaterThan(0.016);
        expect(dist(p0, rim) / sc).toBeLessThan(0.018);
      }
      // no cushion: nothing filled at the rim that lies wholly within 20 mm of it (the old lips' cushions did)
      const near = ops.filter((o) => o.kind === 'fill' && o.pts.length > 2 && o.pts.every((p) => dist(p, rim) < 0.02 * sc));
      expect(near.length, `${b.name}: fills wholly at the rim`).toBe(0);
    });

  for (const b of BRASS)
    it(`${b.name}, vector: sounding, the green breath converging on the rim and the red lips on it, as the reeds’ slots are drawn`, async () => {
      const st = b.state();
      const { at: rim, sc } = b.rim();
      const rest = await run(b.drawV, st, () => null, 3);
      expect(rest.filter((o) => o.style === V.green && o.path && o.dash.length).length, 'at rest: no breath').toBe(0);
      const ops = await run(b.drawV, st, (k) => b.frame(k * 0.4), 12);
      const flows = ops.filter((o) => o.style === V.green && o.path && o.dash.length);
      expect(flows.length, 'one breath').toBe(1);
      const f = flows[0].pts;
      expect(f.length).toBe(6);
      for (let j = 0; j < 3; j++) expect(dist(f[2 * j + 1], rim) / sc, `${b.name}: the stream's end`).toBeLessThan(0.0018);
      // the lips: red paths at the rim of two strokes across it (no cushion of many points)
      const lips = ops.filter((o) => o.style === V.red && o.path && o.pts.every((p) => dist(p, rim) < 0.02 * sc));
      expect(lips.length).toBeGreaterThan(0);
      for (const l of lips) expect(l.pts.length, `${b.name}: the lips' path`).toBe(4);
    });
});

describe('the horn’s bell is empty: no hand in it (the engine has none)', () => {
  /** is a stage point (px) inside the bell's mouth (its rim's ellipse), shrunk to `k` of its size? */
  const inMouth = (p: Pt, k: number): boolean => {
    const L = hornLayout(W, H, TOP);
    const x = (p[0] - L.ox) / L.sc - RIM_C[0];
    const y = (L.oy - p[1]) / L.sc - RIM_C[1];
    const n: Pt = [-AXIS[1], AXIS[0]];
    const a = (x * n[0] + y * n[1]) / RIM_R;
    const b = (x * AXIS[0] + y * AXIS[1]) / (RIM_R * MOUTH_K);
    return a * a + b * b < k * k;
  };
  for (const [style, draw] of [['drawn', drawHorn], ['vector', drawHornV]] as const)
    it(`${style}: once the mouth is drawn, nothing more is drawn inside it but the mouth itself (at rest and sounding)`, async () => {
      const L = hornLayout(W, H, TOP);
      const st = newHornState();
      for (const fr of [null, hornFrame(55, 0)]) {
        const ops = await run((ctx, f, s) => draw(ctx, W, H, f, s as ReturnType<typeof newHornState>, TOP), st, () => fr, 4);
        const first = ops.findIndex((o) => o.path === L.bell.mouth);
        expect(first, 'the mouth is drawn').toBeGreaterThan(0);
        const after = ops.slice(first).filter((o) => o.path !== L.bell.mouth && o.pts.some((p) => inMouth(p, 0.85)));
        expect(after.length, `${style}, ${fr ? 'sounding' : 'at rest'}: drawn inside the mouth after it`).toBe(0);
      }
      expect('hand' in L).toBe(false);
    });
});

describe('the breath in 3D: faint steel streams into the mouthpiece while it sounds, as the flute’s jet', () => {
  const steel = INK.steel.split(',').map((c) => Number(c) / 255);
  /** the lines' points (world) and colours */
  const linesOf = (b: Batch): { p: Vec3; c: number[] }[] => {
    const out: { p: Vec3; c: number[] }[] = [];
    const a = b.glow.lv.a;
    for (let v = 0; v < b.glow.nv; v++) out.push({ p: [a[v * 15], a[v * 15 + 1], a[v * 15 + 2]], c: [a[v * 15 + 10], a[v * 15 + 11], a[v * 15 + 12], a[v * 15 + 13]] });
    return out;
  };
  it('breathIn: three streams in dashes, converging on the tip from the player’s side, flowing in', () => {
    const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const b = new Batch();
    breathIn(b, I, [0, 0, 0], [1, 0, 0], [0, 1, 0], 1, 0);
    const L = linesOf(b);
    expect(L.length).toBeGreaterThan(12);
    for (const { p, c } of L) {
      expect(p[0]).toBeGreaterThan(0.0011);
      expect(p[0]).toBeLessThan(0.0171);
      expect(Math.abs(p[1])).toBeLessThan(0.0047);
      expect(p[2]).toBe(0);
      expect(c[0]).toBeCloseTo(steel[0], 5);
      expect(c[3]).toBeLessThan(0.45);
    }
    // a moment later the dashes have moved in
    const b2 = new Batch();
    breathIn(b2, I, [0, 0, 0], [1, 0, 0], [0, 1, 0], 1, 60);
    const minX = (q: { p: Vec3 }[]) => Math.min(...q.map((v) => v.p[0]));
    expect(linesOf(b2).map((v) => v.p[0])).not.toEqual(L.map((v) => v.p[0]));
    expect(minX(linesOf(b2))).toBeGreaterThan(0.0011);
    // nothing when there is no breath
    const b3 = new Batch();
    breathIn(b3, I, [0, 0, 0], [1, 0, 0], [0, 1, 0], 0, 0);
    expect(b3.glow.nv).toBe(0);
  });

  const hm = buildHornModel();
  const tm = buildTromboneModel('tenor');
  const um = buildTrumpetModel();
  const MODELS = [
    { name: 'horn', lips: xform(hm.T, hm.lips), pose: (b: Batch, fr: VisualFrame | null, p: ReturnType<typeof newWindPose>, k: number, rms: number) => poseHorn(b, hm, fr, p, 1 / 60, k * 16.7, rms), frame: () => hornFrame(55, 0) },
    { name: 'trombone', lips: xform(tm.T, tm.lips), pose: (b: Batch, fr: VisualFrame | null, p: ReturnType<typeof newWindPose>, k: number, rms: number) => poseTrombone(b, tm, fr, p, 1 / 60, k * 16.7, rms), frame: () => tromboneFrame(53, 0) },
    { name: 'trumpet', lips: xform(um.T, um.lips), pose: (b: Batch, fr: VisualFrame | null, p: ReturnType<typeof newWindPose>, k: number, rms: number) => poseTrumpet(b, um, fr, p, 1 / 60, k * 16.7, rms), frame: () => trumpetFrame(67, 0) },
  ];
  for (const md of MODELS)
    it(`${md.name}: no line at rest; sounding, only the steel streams at the mouthpiece (no vermilion lips)`, () => {
      const pose = newWindPose();
      const b = new Batch();
      for (let k = 0; k < 20; k++) {
        b.clear();
        md.pose(b, null, pose, k, 0);
      }
      expect(b.glow.nv, 'at rest').toBe(0);
      for (let k = 0; k < 30; k++) {
        b.clear();
        md.pose(b, md.frame(), pose, k, 0.05);
      }
      const L = linesOf(b);
      expect(L.length, 'sounding').toBeGreaterThan(0);
      for (const { p, c } of L) {
        expect(Math.hypot(p[0] - md.lips[0], p[1] - md.lips[1], p[2] - md.lips[2]), `${md.name}: a line point from the lips (m)`).toBeLessThan(0.018);
        expect(c[0]).toBeCloseTo(steel[0], 5);
        expect(c[1]).toBeCloseTo(steel[1], 5);
      }
    });
});
