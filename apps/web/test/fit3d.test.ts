// The stage's framing (fit3d.ts), checked against a camera built another way: the renderer's own
// (three.js draws a world mirrored in x: view-projection = P · lookAt(mirrored eye, mirrored target) ·
// mirror), here from gl3d's matrices. A fitted scene touches both edges of the rectangle on the axis
// that binds and has equal margins on the other; nothing is outside it.
import { describe, expect, it } from 'vitest';
import { Batch, lookAt, mul, perspective, rotY, scaleM, translate, type Mesh, type Vec3 } from '../src/ui/gl/gl3d.ts';
import { fitView, screenBox, type FitRect } from '../src/ui/gl/fit3d.ts';

/** a box as a mesh (its 8 corners: the framing reads positions only) */
function box(lo: Vec3, hi: Vec3): Mesh {
  const data = new Float32Array(8 * 14);
  for (let i = 0; i < 8; i++) {
    data[i * 14] = i & 1 ? hi[0] : lo[0];
    data[i * 14 + 1] = i & 2 ? hi[1] : lo[1];
    data[i * 14 + 2] = i & 4 ? hi[2] : lo[2];
  }
  return { data, count: 8 };
}
const FOV = (24 * Math.PI) / 180;
/** the renderer's view-projection for an orbit camera (stage3d: eye = target + dist·dir) */
function vpOf(target: Vec3, yaw: number, pitch: number, dist: number, aspect: number) {
  const dir: Vec3 = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
  const eye: Vec3 = [target[0] + dist * dir[0], target[1] + dist * dir[1], target[2] + dist * dir[2]];
  return mul(mul(perspective(FOV, aspect, 0.01, 100), lookAt([-eye[0], eye[1], eye[2]], [-target[0], target[1], target[2]], [0, 1, 0])), scaleM(-1, 1, 1));
}
/** a rectangle of the picture in px of a w×h canvas */
const px = (r: FitRect, w: number, h: number) => ({ x0: ((r.l + 1) / 2) * w, x1: ((r.r + 1) / 2) * w, y0: ((1 - r.t) / 2) * h, y1: ((1 - r.b) / 2) * h });

describe('3D framing', () => {
  const W = 390;
  const rect: FitRect = { l: -0.92, r: 0.92, b: -0.96, t: 0.76 };
  const scene = (parts: { mesh: Mesh; m: Float32Array | null }[]) => {
    const b = new Batch();
    for (const p of parts) b.mesh(p.mesh, p.m);
    return b;
  };
  // a cello's proportions leaning back, with a bow across it; an upright's; a flute's
  const tall = () => scene([{ mesh: box([-0.22, 0, -0.12], [0.22, 1.25, 0.12]), m: null }, { mesh: box([-0.36, -0.01, -0.01], [0.36, 0.01, 0.01]), m: mul(translate(0.05, 0.62, -0.15), rotY(0.3)) }]);
  const wide = () => scene([{ mesh: box([-0.75, 0, -0.3], [0.75, 1.25, 0.3]), m: null }]);
  const thin = () => scene([{ mesh: box([-0.33, 0.16, -0.01], [0.33, 0.18, 0.01]), m: null }]);

  for (const [name, make, v, H, binds] of [
    ['a tall instrument on a tall stage: bound by its height', tall, { target: [0, 0.78, 0.08] as Vec3, yaw: 0.62, pitch: 0.07 }, 444, 'y'],
    ['a wide one: bound by its width, in the middle of the free height', wide, { target: [0, 0.62, 0.25] as Vec3, yaw: 0.45, pitch: 0.26 }, 444, 'x'],
    ['a thin one', thin, { target: [0, 0.17, 0] as Vec3, yaw: 0.24, pitch: 0.5 }, 444, 'x'],
    ['a wide instrument on a short stage: bound by its height', wide, { target: [0, 0.62, 0.25] as Vec3, yaw: -0.5, pitch: 0.26 }, 180, 'y'],
  ] as const) {
    it(name, () => {
      const b = make();
      const tanV = Math.tan(FOV / 2);
      const fit = fitView(b, v, tanV, W / H, rect)!;
      expect(fit.binds).toBe(binds);
      const got = screenBox(b, vpOf(fit.target, v.yaw, v.pitch, fit.dist, W / H), W, H)!;
      const want = px(rect, W, H);
      // inside the rectangle (to a hundredth of a pixel) …
      expect(got.x0).toBeGreaterThan(want.x0 - 0.01);
      expect(got.x1).toBeLessThan(want.x1 + 0.01);
      expect(got.y0).toBeGreaterThan(want.y0 - 0.01);
      expect(got.y1).toBeLessThan(want.y1 + 0.01);
      if (binds === 'y') {
        // … edge to edge on the axis that binds, the same margin left and right on the other
        expect(got.y0).toBeCloseTo(want.y0, 1);
        expect(got.y1).toBeCloseTo(want.y1, 1);
        expect(got.x0 - want.x0).toBeGreaterThan(1);
      } else {
        expect(got.x0).toBeCloseTo(want.x0, 1);
        expect(got.x1).toBeCloseTo(want.x1, 1);
        expect(got.y0 - want.y0).toBeGreaterThan(1);
      }
      // (the margins are shared in the view's own units: equal on screen to within the perspective
      // across the instrument's depth)
      const mx = [got.x0 - want.x0, want.x1 - got.x1];
      const my = [got.y0 - want.y0, want.y1 - got.y1];
      expect(Math.abs(mx[0] - mx[1])).toBeLessThan(0.2 * (mx[0] + mx[1]) + 0.1);
      expect(Math.abs(my[0] - my[1])).toBeLessThan(0.2 * (my[0] + my[1]) + 0.1);
      // no nearer camera on that line shows it whole
      const nearer = screenBox(b, vpOf(fit.target, v.yaw, v.pitch, fit.dist * 0.97, W / H), W, H)!;
      expect(nearer.x0 < want.x0 || nearer.x1 > want.x1 || nearer.y0 < want.y0 || nearer.y1 > want.y1).toBe(true);
    });
  }

  it('what a scene says not to frame is left out, what it says to frame is counted though not drawn', () => {
    const tanV = Math.tan(FOV / 2);
    const v = { target: [0, 0.6, 0] as Vec3, yaw: 0.3, pitch: 0.2 };
    const body = box([-0.2, 0, -0.1], [0.2, 1.2, 0.1]);
    const bow = box([-0.4, -0.01, -0.01], [0.4, 0.01, 0.01]);
    const alone = fitView(scene([{ mesh: body, m: null }]), v, tanV, 0.9, rect)!;
    // the bow far out of the picture: not framed
    const b = scene([{ mesh: body, m: null }, { mesh: bow, m: translate(3, 0.6, 0) }]);
    b.noFit.add(bow);
    expect(fitView(b, v, tanV, 0.9, rect)!.dist).toBeCloseTo(alone.dist, 6);
    // framed where it rests instead (well to one side): the camera steps back for it
    b.fitAlso.push({ mesh: bow, m: translate(1.2, 0.6, 0) });
    expect(fitView(b, v, tanV, 0.9, rect)!.dist).toBeGreaterThan(alone.dist * 1.05);
    expect(fitView(new Batch(), v, tanV, 0.9, rect)).toBeNull();
  });
});
