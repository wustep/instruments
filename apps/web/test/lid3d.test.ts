// The grand's lid in 3D and the room's light pool: the two prop sticks (fixed lengths on fixed
// pivots, each in its own cup at its rest, never through the lid), the lid's three rests (shut, the
// short stick, the long stick: its knob's notches), the stick that holds it at any opening while it is
// in the hand (pressed down below its rest, its tip on the lid's underside), where it comes to when it
// is let go and how it swings there, the lid taken on the picture (the ray that meets it, the opening
// that keeps the point taken under the pointer), where its knob sits (beside the lid, not moving with
// it), the pool's radius for the room, and the framing, which never depends on the lid.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, PRESETS, buildKeySpecs } from '../../../packages/engine/src/core/design.ts';
import type { KeySummary } from '@piano-model/engine';
import { Batch, lookAt, mul, perspective, project, scaleM, type Vec3 } from '../src/ui/gl/gl3d.ts';
import { LID_OPEN, buildGrandModel, lidHandPoints, lidKnobPoints, lidMatrix, lidPoint, lidRay, newPianoPose, posePiano, stickDir, stickSwing } from '../src/ui/gl/piano3d.ts';
import { invert4, lidFor, rayAt } from '../src/ui/gl/handles3d.ts';
import { fitView } from '../src/ui/gl/fit3d.ts';
import { poolRadius } from '../src/ui/gl/scenes3d.ts';
import { LID_HALF, LID_RESTS, lidNotch, lidNotchStep, lidSettle, lidStick, onNotch } from '../src/ui/lid.ts';
import { newPianoState } from '../src/ui/piano-draw.ts';

const keysOf = (preset: string): KeySummary[] => {
  const d = PRESETS[preset];
  return buildKeySpecs(d, { ...DEFAULT_PARAMS, ...d.defaults }).map((s) => ({ midi: s.midi, f1: s.f1, B: s.B, nStrings: s.nStrings, lengthM: s.L, hasDamper: s.hasDamper, preparation: null }));
};
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('the grand’s lid and the room in 3D', () => {
  const keys = keysOf('grand');
  const grand = buildGrandModel(keys);
  const h = grand.lidHinge;
  const yU = grand.lidSlab!.y0;
  const tipOf = (p: (typeof grand.props)[number], k: number): Vec3 => {
    const d = stickDir(p, k);
    return [p.foot[0] + p.len * d[0], p.foot[1] + p.len * d[1], p.foot[2] + p.len * d[2]];
  };
  /** how far a point is over the lid's underside, the lid at `ang` (m; > 0: through it) */
  const over = (q: Vec3, ang: number) => -Math.sin(ang) * (q[0] - h[0]) + Math.cos(ang) * (q[1] - h[1]) - (yU - h[1]);
  /** a point (the piano's frame) in the lid's own frame, the lid at `ang` */
  const toLid = (q: Vec3, ang: number): Vec3 => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const x = q[0] - h[0];
    const y = q[1] - h[1];
    return [h[0] + c * x + s * y, h[1] - s * x + c * y, q[2]];
  };
  /** whether (x, z) lies inside the lid's plan outline */
  const inLid = (x: number, z: number) => {
    const poly = grand.lidSlab!.poly;
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i];
      const [xj, zj] = poly[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };

  it('two sticks, each a fixed length on its own pivot: up, each sits in its own cup with the lid at its rest (the long one 40°, the short one half stick)', () => {
    expect(grand.props.map((p) => p.rest)).toEqual([1, LID_HALF]);
    const [long, short] = grand.props;
    // a Steinway-style long stick is 31″ (0.79 m); this lid opens a little further, on 0.85 m
    expect(long.len).toBeGreaterThan(0.78);
    expect(long.len).toBeLessThan(0.92);
    expect(short.len).toBeGreaterThan(0.3);
    expect(short.len).toBeLessThan(long.len * 0.55);
    for (const p of grand.props) {
      const cup = lidMatrix(h, p.rest * LID_OPEN);
      const c: Vec3 = [cup[0] * p.cup[0] + cup[4] * p.cup[1] + cup[12], cup[1] * p.cup[0] + cup[5] * p.cup[1] + cup[13], p.cup[2]];
      expect(dist(tipOf(p, 1), c)).toBeLessThan(1e-3);
      // up, it leans in towards the spine (its cup is inside the lid's edge), never out over the rim
      expect(tipOf(p, 1)[0]).toBeLessThan(p.foot[0]);
      expect(p.up[1]).toBeGreaterThan(Math.cos(0.6));
    }
    // the short stick's cup is the one nearer the lid's edge
    expect(short.cup[0]).toBeGreaterThan(long.cup[0]);
  });

  it('folded, each lies level in its cradle inside the rim, under the shut lid and over the strings', () => {
    for (const p of grand.props) {
      expect(Math.abs(stickDir(p, 0)[1])).toBeLessThan(1e-6);
      for (let t = 0; t <= 1; t += 0.1) {
        const d = stickDir(p, 0);
        const q: Vec3 = [p.foot[0] + p.len * t * d[0], p.foot[1], p.foot[2] + p.len * t * d[2]];
        // (the shaft is 11.5 mm in radius; the strings' highest point, the bass bridge, is at 0.927 m)
        expect(q[1] + 0.0115).toBeLessThan(yU);
        expect(q[1] - 0.0115).toBeGreaterThan(0.93);
        // under the main lid (its front flap is folded back, the front open), inside the case
        expect(q[2]).toBeGreaterThan(0.47);
        expect(q[0]).toBeLessThan(0.74 - 0.068);
      }
    }
    // the long one towards the tail, the short one towards the keys: side by side, never on each other
    expect(grand.props[0].flat[2]).toBeGreaterThan(0.5);
    expect(grand.props[1].flat[2]).toBeLessThan(-0.5);
  });

  it('at every opening no stick goes through the lid; one held just under its rest is pressed down and still touches it', () => {
    for (let v = 0; v <= 1.0001; v += 0.01) {
      const ang = v * LID_OPEN;
      for (const p of grand.props) {
        const k = stickSwing(p, 1, h, yU, ang);
        expect(over(tipOf(p, k), ang)).toBeLessThan(0.0005);
      }
    }
    for (const p of grand.props) {
      // at its rest: all the way up
      expect(stickSwing(p, 1, h, yU, p.rest * LID_OPEN)).toBeCloseTo(1, 6);
      // just under it: pressed down, its tip on the underside (in its cup's depth, 3 mm)
      const ang = (p.rest - 0.04) * LID_OPEN;
      const k = stickSwing(p, 1, h, yU, ang);
      expect(k).toBeLessThan(1);
      expect(Math.abs(over(tipOf(p, k), ang) + 0.003)).toBeLessThan(0.0005);
    }
  });

  it('in the hand the lid stands at any opening: the shortest stick that reaches it holds it, pressed down below its rest, its tip on the underside inside the lid', () => {
    expect([0, 0.004, 0.01, 0.2, 0.44, LID_HALF, 0.46, 0.6, 0.73, 0.99, 1].map(lidStick)).toEqual([0, 0, LID_HALF, LID_HALF, LID_HALF, LID_HALF, 1, 1, 1, 1, 1]);
    for (let v = 0.01; v <= 1.0001; v += 0.01) {
      const ang = v * LID_OPEN;
      const p = grand.props.find((q) => q.rest === lidStick(v))!;
      const k = stickSwing(p, 1, h, yU, ang);
      const tip = tipOf(p, k);
      // on the underside (in its cup's depth, 3 mm), within the lid's outline
      expect(Math.abs(over(tip, ang) + 0.003)).toBeLessThan(0.0005);
      const l = toLid(tip, ang);
      expect(inLid(l[0], l[2])).toBe(true);
      // up its own rest it stands all the way up, in its cup; below, the lid has pressed it down
      if (Math.abs(v - p.rest) < 1e-6) expect(k).toBeCloseTo(1, 6);
      else expect(k).toBeLessThan(1);
    }
  });

  it('the lid rests shut, on the short stick or on the long one: let go anywhere, it comes onto the nearest (halfway, the higher); the keys step from rest to rest', () => {
    expect(LID_RESTS).toEqual([0, LID_HALF, 1]);
    // each rest is a stick's own (or none): the stick that holds the lid there stands in its cup
    expect(LID_RESTS.map(lidStick)).toEqual([0, LID_HALF, 1]);
    expect(grand.props.map((p) => p.rest).sort()).toEqual([LID_HALF, 1]);
    expect([0, 0.1, 0.22, 0.23, 0.3, LID_HALF, 0.6, 0.72, 0.73, 0.9, 1].map(lidNotch)).toEqual([0, 0, 0, LID_HALF, LID_HALF, LID_HALF, LID_HALF, LID_HALF, 1, 1, 1]);
    // halfway between two rests: the higher (the stick is reached before the lid drops past it)
    expect(lidNotch(LID_HALF / 2)).toBe(LID_HALF);
    expect(lidNotch((1 + LID_HALF) / 2)).toBe(1);
    // every opening comes onto a rest, the nearest
    for (let v = 0; v <= 1.0001; v += 0.01) {
      const r = lidNotch(v);
      expect(onNotch(r)).toBe(true);
      for (const o of LID_RESTS) expect(Math.abs(r - v)).toBeLessThanOrEqual(Math.abs(o - v) + 1e-9);
    }
    expect([0, 0.3, LID_HALF, 0.7, 1].map(onNotch)).toEqual([true, false, true, false, true]);
    // the keys: up and down a rest at a time, from a rest or from between two, stopping at the ends
    expect([0, 0.3, LID_HALF, 0.7, 1].map((v) => lidNotchStep(v, 1))).toEqual([LID_HALF, LID_HALF, 1, 1, 1]);
    expect([0, 0.3, LID_HALF, 0.7, 1].map((v) => lidNotchStep(v, -1))).toEqual([0, 0, 0, LID_HALF, LID_HALF]);
  });

  it('let go, the lid swings onto its rest: down it falls (faster and faster), up the hand eases it in; it lands, at most half a second on', () => {
    for (const [v0, rest] of [[0.7, LID_HALF], [0.2, 0], [1, 0], [0.8, 1], [0.3, LID_HALF], [0, 1]] as const) {
      let last = v0;
      let landed = Infinity;
      const steps: number[] = [];
      for (let t = 0; t <= 0.6; t += 1 / 120) {
        const f = lidSettle(v0, rest, t);
        // always between where it was let go and its rest, always on its way there
        expect(Math.min(v0, rest) - 1e-9).toBeLessThanOrEqual(f.v);
        expect(f.v).toBeLessThanOrEqual(Math.max(v0, rest) + 1e-9);
        expect(Math.sign(rest - v0) * (f.v - last)).toBeGreaterThanOrEqual(-1e-12);
        steps.push(Math.abs(f.v - last));
        last = f.v;
        if (f.done && landed === Infinity) {
          landed = t;
          expect(f.v).toBe(rest);
        }
      }
      expect(landed).toBeLessThanOrEqual(0.46);
      const n = Math.max(2, Math.floor((landed * 120) / 2));
      // falling: its steps grow; lifted: they shrink
      if (rest < v0) expect(steps[n]).toBeGreaterThan(steps[2]);
      else expect(steps[n]).toBeLessThan(steps[2]);
    }
    // shut from the long stick: about 0.45 s; a short swing is quicker
    expect(lidSettle(1, 0, 0.44).done).toBe(false);
    expect(lidSettle(1, 0, 0.45).done).toBe(true);
    expect(lidSettle(0.55, LID_HALF, 0.25).done).toBe(true);
    // already there: landed
    expect(lidSettle(LID_HALF, LID_HALF, 0)).toEqual({ v: LID_HALF, done: true });
  });

  it('posed at any opening (between the rests too, in the hand): the stick that holds the lid stands, the other lies folded, and they swing over in a fraction of a second', () => {
    const ps = newPianoState();
    const pose = newPianoPose();
    const swing = (lid: number, dt: number) => {
      const b = new Batch();
      posePiano(b, grand, { piano: ps, keys, dt, lid, down: () => false, lite: false }, pose);
      return grand.props.map((p) => {
        const buf = b.inst.get(p.mesh)!;
        expect(buf.n).toBe(20);
        // (the instance's +y: the stick's direction)
        return [buf.a[4], buf.a[5], buf.a[6]] as Vec3;
      });
    };
    const near = (a: Vec3, b: Vec3) => dist(a, b) < 0.02;
    // on its long stick: the long one up, the short one folded
    let d = swing(1, 1 / 60);
    expect(near(d[0], grand.props[0].up)).toBe(true);
    expect(near(d[1], grand.props[1].flat)).toBe(true);
    expect(pose.props).toEqual([1, 0]);
    // 0.73 (between the long stick and the short one): still the long one, pressed down by the lid
    d = swing(0.73, 1 / 60);
    expect(pose.props).toEqual([1, 0]);
    expect(d[0][1]).toBeLessThan(grand.props[0].up[1] - 0.05);
    expect(dist(d[0], stickDir(grand.props[0], stickSwing(grand.props[0], 1, h, yU, 0.73 * LID_OPEN)))).toBeLessThan(1e-6);
    // 0.3 (under half stick): the short one swings up under it, the long one folds, in < 0.4 s
    swing(0.3, 1 / 60);
    d = swing(0.3, 1 / 60);
    expect(near(d[0], grand.props[0].flat)).toBe(false);
    for (let i = 0; i < 24; i++) d = swing(0.3, 1 / 60);
    expect(pose.props[0]).toBeLessThan(0.01);
    expect(pose.props[1]).toBeGreaterThan(0.99);
    expect(near(d[0], grand.props[0].flat)).toBe(true);
    expect(dist(d[1], stickDir(grand.props[1], stickSwing(grand.props[1], 1, h, yU, 0.3 * LID_OPEN)))).toBeLessThan(0.01);
    // shut: both folded
    for (let i = 0; i < 24; i++) d = swing(0, 1 / 60);
    expect(near(d[0], grand.props[0].flat) && near(d[1], grand.props[1].flat)).toBe(true);
  });

  it('the lid taken in the hand on the picture: the ray through the pointer meets it where it is drawn; dragged, the opening that keeps the point taken under the pointer is found back at any opening', () => {
    const pts = lidHandPoints(grand);
    const sl = grand.lidSlab!;
    const xMax = Math.max(...sl.poly.map((q) => q[0]));
    const xMin = Math.min(...sl.poly.map((q) => q[0]));
    /** how far (x, z) is from the lid's outline (m) */
    const fromEdge = (x: number, z: number) => {
      let d = Infinity;
      for (let i = 0; i < sl.poly.length; i++) {
        const [ax, az] = sl.poly[i];
        const [bx, bz] = sl.poly[(i + 1) % sl.poly.length];
        const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
        const t = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / l2));
        d = Math.min(d, Math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az)));
      }
      return d;
    };
    // round the free edge, from the treble side to the tail (≈ 3 m), never on the hinged spine
    expect(pts.length).toBeGreaterThan(18);
    pts.forEach((p, i) => {
      // inside the lid, 4 cm in from its edge, at the edge's middle thickness
      expect(inLid(p[0], p[2])).toBe(true);
      expect(fromEdge(p[0], p[2])).toBeGreaterThan(0.035);
      expect(fromEdge(p[0], p[2])).toBeLessThan(0.0405);
      expect(p[1]).toBeCloseTo((sl.y0 + sl.y1) / 2, 9);
      expect(p[0]).toBeGreaterThan(xMin + 0.1);
      if (i) expect(dist(p, pts[i - 1])).toBeGreaterThan(0.1);
    });
    // the first: on the treble side's straight run, near the front (where a hand lifts the lid)
    expect(pts[0][0]).toBeCloseTo(xMax - 0.04, 3);
    expect(pts[0][2] - Math.min(...sl.poly.map((q) => q[1]))).toBeLessThan(0.15);
    // the last: round the tail
    expect(pts[pts.length - 1][0]).toBeLessThan(0);
    // the hero camera (scenes3d's grand view, as stage3d places it), the renderer's world mirrored in x
    const W = 1200;
    const H = 700;
    const target: Vec3 = [-0.12, 0.58, 1.0];
    const yaw = 0.74;
    const pitch = 0.33;
    const D = 3.8 * (Math.tan(0.3) / Math.tan((12 * Math.PI) / 180));
    const eye: Vec3 = [target[0] + D * Math.cos(pitch) * Math.sin(yaw), target[1] + D * Math.sin(pitch), target[2] - D * Math.cos(pitch) * Math.cos(yaw)];
    const V = lookAt([-eye[0], eye[1], eye[2]], [-target[0], target[1], target[2]], [0, 1, 0]);
    const vp = mul(mul(perspective((24 * Math.PI) / 180, W / H, 0.05, 60), V), scaleM(-1, 1, 1));
    // the ray from the camera through a point of the lid drawn on the picture meets the lid there (the
    // point taken, in the lid's own frame), at the rests and between them
    // (points over the lid every 20 cm, and the hand's along its free edge: those at half stick, the lid
    // seen nearly edge on from this view, are taken through its side)
    const inv = invert4(vp)!;
    const grid: Vec3[] = [];
    for (let x = xMin + 0.1; x < xMax; x += 0.2)
      for (let z = -1; z < 3; z += 0.2) if (inLid(x, z) && fromEdge(x, z) > 0.08) grid.push([x, (sl.y0 + sl.y1) / 2, z]);
    expect(grid.length).toBeGreaterThan(20);
    grid.push(...pts.slice(0, 8));
    for (const v of [1, 0.73, LID_HALF, 0.3, 0]) {
      for (const p of grid) {
        const q = project(vp, lidPoint(grand, p, v), W, H)!;
        const r = rayAt(inv, q[0], q[1], W, H);
        const hit = lidRay(grand, v, r.o, r.d)!;
        expect(hit).not.toBeNull();
        // (on whichever face or side it meets first: seen at a slant, or edge on, that can be some way
        // from the slab's middle; what matters is that the point taken is drawn under the pointer, so
        // the drag keeps it there)
        expect(hit.local[1]).toBeGreaterThanOrEqual(sl.y0 - 1e-9);
        expect(hit.local[1]).toBeLessThanOrEqual(sl.y1 + 1e-9);
        expect(fromEdge(hit.local[0], hit.local[2]) < 1e-6 || inLid(hit.local[0], hit.local[2])).toBe(true);
        const back = project(vp, lidPoint(grand, hit.local, v), W, H)!;
        expect(Math.hypot(back[0] - q[0], back[1] - q[1])).toBeLessThan(0.5);
        expect(lidPoint(grand, hit.local, v)[1]).toBeGreaterThan(0.9);
      }
    }
    // off the lid (the floor in front of the piano), the ray misses it
    const miss = project(vp, [0.2, 0, -0.9], W, H)!;
    const rm = rayAt(inv, miss[0], miss[1], W, H);
    expect(lidRay(grand, 1, rm.o, rm.d)).toBeNull();
    // every opening, the rests' in-betweens included: a point of the lid drawn there, the pointer on
    // it, and the drag starting from far away finds that opening back
    for (const v of [1, 0.92, 0.73, 0.6, LID_HALF, 0.31, 0.12, 0.03]) {
      for (const p of pts.slice(0, 3)) {
        const q = project(vp, lidPoint(grand, p, v), W, H)!;
        const found = lidFor((u) => lidPoint(grand, p, u), vp, W, H, q[0], q[1], v > 0.5 ? 0.1 : 0.9);
        expect(Math.abs(found - v)).toBeLessThan(0.006);
      }
    }
    // the pointer past either end of the lid's sweep: fully open, or shut
    const top = project(vp, lidPoint(grand, pts[0], 1), W, H)!;
    const shut = project(vp, lidPoint(grand, pts[0], 0), W, H)!;
    const away = (a: [number, number], b: [number, number], s: number): [number, number] => [a[0] + s * (a[0] - b[0]), a[1] + s * (a[1] - b[1])];
    const o = away(top, shut, 0.5);
    expect(lidFor((u) => lidPoint(grand, pts[0], u), vp, W, H, o[0], o[1], 0.5)).toBe(1);
    const c = away(shut, top, 0.3);
    expect(lidFor((u) => lidPoint(grand, pts[0], u), vp, W, H, c[0], c[1], 0.5)).toBe(0);
  });

  it('the lid’s knob sits beside the lid, not on it: just outside its free edge on the case’s side, under the rim, front first; the lid moving never moves it', () => {
    const ks = lidKnobPoints(grand);
    const hs = lidHandPoints(grand);
    const sl = grand.lidSlab!;
    expect(ks.length).toBe(hs.length);
    ks.forEach((k, i) => {
      // outside the outline, 10 cm past the edge (14 cm out from the hand's point, 4 cm in)
      expect(inLid(k[0], k[2])).toBe(false);
      expect(Math.hypot(k[0] - hs[i][0], k[2] - hs[i][2])).toBeCloseTo(0.14, 6);
      // on the case's side, 6 cm under the rim the shut lid lies on, over the strings' height
      expect(k[1]).toBeCloseTo(sl.y0 - 0.06, 9);
      expect(k[1]).toBeGreaterThan(0.85);
    });
    // the first by the treble side's front, where a hand lifts the lid; they are points of the piano,
    // not of the lid, so a knob placed on one stays put as the lid turns under the hand
    const xMax = Math.max(...sl.poly.map((q) => q[0]));
    expect(ks[0][0]).toBeCloseTo(xMax + 0.1, 3);
    expect(ks[0][2] - Math.min(...sl.poly.map((q) => q[1]))).toBeLessThan(0.15);
  });

  it('the room’s light pool grows with the room, every step of it', () => {
    for (const r of [1.35, 1.0, 0.38]) {
      let last = 0;
      for (let room = 0; room <= 1.0001; room += 0.05) {
        const R = poolRadius(r, room);
        expect(R).toBeGreaterThan(last);
        last = R;
      }
      // the driest room's pool still reaches past the instrument's middle; the largest is twice it
      expect(poolRadius(r, 0)).toBeGreaterThan(0.7 * r);
      expect(poolRadius(r, 1) / poolRadius(r, 0)).toBeCloseTo(2, 9);
      // past either end it stays in the room's range
      expect(poolRadius(r, 3)).toBe(poolRadius(r, 1));
      expect(poolRadius(r, -1)).toBe(poolRadius(r, 0));
    }
  });

  it('a grand is framed with its lid wide open whatever its opening: the lid moved never moves the camera', () => {
    const fit = (lid: number) => {
      const b = new Batch();
      b.wantFit = true;
      posePiano(b, grand, { piano: newPianoState(), keys, dt: 1 / 60, lid, down: () => false, lite: false }, newPianoPose());
      return fitView(b, { target: [-0.12, 0.58, 1.0], yaw: 0.74 + 0.36, pitch: 0.33 }, Math.tan((12 * Math.PI) / 180), 390 / 600, { l: -0.92, r: 0.92, b: -0.96, t: 0.9 })!;
    };
    const a = fit(1);
    for (const lid of [0, 0.3, LID_HALF]) {
      const f = fit(lid);
      expect(f.dist).toBeCloseTo(a.dist, 9);
      for (let k = 0; k < 3; k++) expect(f.target[k]).toBeCloseTo(a.target[k], 9);
    }
  });
});
