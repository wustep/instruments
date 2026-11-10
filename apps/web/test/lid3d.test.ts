// The grand's lid in 3D and the room's light pool: the two prop sticks (fixed lengths on fixed
// pivots, each in its own cup at its rest, never through the lid), where a lid let go of comes to
// rest and how it gets there, the drag (the opening that puts the point taken under the pointer),
// the pool's radius for the room and back, and the framing, which never depends on the lid.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, PRESETS, buildKeySpecs } from '../../../packages/engine/src/core/design.ts';
import type { KeySummary } from '@piano-model/engine';
import { Batch, lookAt, mul, perspective, project, scaleM, type Vec3 } from '../src/ui/gl/gl3d.ts';
import { LID_OPEN, buildGrandModel, lidMatrix, lidPoint, lidRay, newPianoPose, posePiano, stickDir, stickSwing } from '../src/ui/gl/piano3d.ts';
import { invert4, lidFor, rayAt } from '../src/ui/gl/handles3d.ts';
import { fitView } from '../src/ui/gl/fit3d.ts';
import { poolRadius, poolRoom } from '../src/ui/gl/scenes3d.ts';
import { LID_HALF, lidRest, lidSettle, lidStep } from '../src/ui/lid.ts';
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

  it('posed: the stick for the rest under the lid stands up, the other lies folded, and they swing over in a fraction of a second', () => {
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
    // let down onto half stick: a few frames in they are on their way, after 0.4 s they are there
    swing(LID_HALF, 1 / 60);
    d = swing(LID_HALF, 1 / 60);
    expect(near(d[0], grand.props[0].up)).toBe(false);
    for (let i = 0; i < 24; i++) d = swing(LID_HALF, 1 / 60);
    expect(near(d[1], grand.props[1].up)).toBe(true);
    expect(near(d[0], grand.props[0].flat)).toBe(true);
    // shut: both folded
    for (let i = 0; i < 24; i++) d = swing(0, 1 / 60);
    expect(near(d[0], grand.props[0].flat) && near(d[1], grand.props[1].flat)).toBe(true);
  });

  it('let go, the lid comes down onto the highest stick under it (or is put on one it is just under), else shut; the keys step it between rests', () => {
    expect([1, 0.97, 0.9, 0.6, LID_HALF, 0.42, 0.39, 0.1, 0].map(lidRest)).toEqual([1, 1, LID_HALF, LID_HALF, LID_HALF, LID_HALF, 0, 0, 0]);
    expect(lidStep(1, -1)).toBe(LID_HALF);
    expect(lidStep(LID_HALF, -1)).toBe(0);
    expect(lidStep(0, -1)).toBe(0);
    expect(lidStep(0, 1)).toBe(LID_HALF);
    expect(lidStep(0.6, 1)).toBe(1);
    expect(lidStep(0.6, -1)).toBe(LID_HALF);
    expect(lidStep(1, 1)).toBe(1);
    // falling: it gathers speed (the first half of the time covers a quarter of the way) and lands
    // within half a second, even from the long stick to shut
    const fall = (t: number) => lidSettle(1, 0, t);
    let last = 1;
    for (let t = 0; t <= 0.5; t += 0.02) {
      const f = fall(t);
      expect(f.v).toBeLessThanOrEqual(last + 1e-9);
      last = f.v;
    }
    expect(fall(0.5).done).toBe(true);
    expect(fall(0.5).v).toBe(0);
    expect(1 - fall(0.45 / 2).v).toBeLessThan(0.3);
    // put up onto a stick it was just under: a short move, quickly over
    expect(lidSettle(0.97, 1, 0.2)).toEqual({ v: 1, done: true });
  });

  it('the lid taken anywhere follows the pointer: the opening that puts the point taken under the pointer is found back, from the ray through it', () => {
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
    const inv = invert4(vp)!;
    for (const v of [1, 0.7, LID_HALF, 0.2]) {
      for (const local of [[0.3, yU + 0.022, 1.3], [-0.2, yU + 0.022, 1.6]] as Vec3[]) {
        const q = project(vp, lidPoint(grand, local, v), W, H)!;
        // the ray through that pixel meets the lid (on whichever face the camera sees) at that pixel
        const r = rayAt(inv, q[0], q[1], W, H);
        const hit = lidRay(grand, v, r.o, r.d);
        expect(hit).not.toBeNull();
        const back = project(vp, lidPoint(grand, hit!.local, v), W, H)!;
        expect(Math.hypot(back[0] - q[0], back[1] - q[1])).toBeLessThan(0.5);
        expect(Math.abs(hit!.local[2] - local[2])).toBeLessThan(0.15);
        // and with the lid elsewhere, the opening for the pointer there is found back
        const found = lidFor((u) => lidPoint(grand, hit!.local, u), vp, W, H, q[0], q[1], v > 0.5 ? 0.1 : 0.9);
        expect(Math.abs(found - v)).toBeLessThan(0.006);
      }
    }
    // a ray that passes beside the lid misses it
    const r = rayAt(inv, 4, 4, W, H);
    expect(lidRay(grand, 1, r.o, r.d)).toBeNull();
  });

  it('the room’s light pool grows with the room, and the room is read back from its radius', () => {
    for (const r of [1.35, 1.0, 0.38]) {
      let last = 0;
      for (let room = 0; room <= 1.0001; room += 0.05) {
        const R = poolRadius(r, room);
        expect(R).toBeGreaterThan(last);
        last = R;
        expect(poolRoom(r, R)).toBeCloseTo(room, 9);
      }
      // the driest room's pool still reaches past the instrument's middle; the largest is twice it
      expect(poolRadius(r, 0)).toBeGreaterThan(0.7 * r);
      expect(poolRadius(r, 1) / poolRadius(r, 0)).toBeCloseTo(2, 9);
      // pulled past either end it stays in the room's range
      expect(poolRoom(r, 10 * r)).toBe(1);
      expect(poolRoom(r, 0.01)).toBe(0);
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
