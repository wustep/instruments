// The 3D stage's lid, as geometry: the grand's lid taken in the hand on the picture (a ray from the
// camera through the pointer, the lid it meets first with nothing in front of it) and the opening
// that keeps the point taken under the pointer as it is dragged. The stage (stage3d.ts) asks it; the
// view (views/stage.ts) sets the engine's lid, and puts it onto its nearest rest when it is let go
// (ui/lid.ts). Everything here is in the scene's own frame (metres, the bass at −x: the renderer's
// mirror is inside the view-projection).
import type { Batch, Mat4, Mesh, Vec3 } from './gl3d.ts';
import { project } from './gl3d.ts';

/** the inverse of a 4×4 matrix (column-major), or null if it has none */
export function invert4(m: Mat4): Float64Array | null {
  const inv = new Float64Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (!det) return null;
  for (let i = 0; i < 16; i++) inv[i] /= det;
  return inv;
}

export interface Ray {
  o: Vec3;
  d: Vec3;
}
/** the ray from the camera through (x, y) (CSS px in a w×h canvas), from the inverse of the
 *  view-projection the picture was drawn with */
export function rayAt(inv: Float64Array, x: number, y: number, w: number, h: number): Ray {
  const nx = (x / w) * 2 - 1;
  const ny = 1 - (y / h) * 2;
  const un = (z: number): Vec3 => {
    const X = inv[0] * nx + inv[4] * ny + inv[8] * z + inv[12];
    const Y = inv[1] * nx + inv[5] * ny + inv[9] * z + inv[13];
    const Z = inv[2] * nx + inv[6] * ny + inv[10] * z + inv[14];
    const W = inv[3] * nx + inv[7] * ny + inv[11] * z + inv[15];
    return [X / W, Y / W, Z / W];
  };
  const a = un(-1);
  const b = un(1);
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return { o: a, d: [d[0] / l, d[1] / l, d[2] / l] };
}

const boxes = new WeakMap<Mesh, Float32Array>();
function boxOf(m: Mesh): Float32Array {
  let bx = boxes.get(m);
  if (bx) return bx;
  bx = new Float32Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  for (let i = 0; i < m.count; i++)
    for (let k = 0; k < 3; k++) {
      const v = m.data[i * 14 + k];
      if (v < bx[k]) bx[k] = v;
      if (v > bx[3 + k]) bx[3 + k] = v;
    }
  boxes.set(m, bx);
  return bx;
}
/** the ray's entry into an axis-aligned box (its distance), or Infinity */
function slabT(r: Ray, lo: ArrayLike<number>, hi: ArrayLike<number>): number {
  let t0 = 0;
  let t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(r.d[k]) < 1e-12) {
      if (r.o[k] < lo[k] || r.o[k] > hi[k]) return Infinity;
      continue;
    }
    let a = (lo[k] - r.o[k]) / r.d[k];
    let b = (hi[k] - r.o[k]) / r.d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return Infinity;
  }
  return t0;
}
const lo = new Float64Array(3);
const hi = new Float64Array(3);
/** Whether anything the batch draws (but `skip`) stands in front of the point the ray meets at `t`:
 *  each instance's box, as the world sees it (its eight corners' bounds: on the safe side, a part's
 *  box hides a little more than the part) */
export function blocked(b: Batch, r: Ray, t: number, skip: ReadonlySet<Mesh>): boolean {
  for (const m of b.meshes()) {
    if (!m.count || skip.has(m)) continue;
    const bx = boxOf(m);
    const buf = b.inst.get(m)!;
    for (let o = 0; o < buf.n; o += 20) {
      const a = buf.a;
      lo[0] = lo[1] = lo[2] = Infinity;
      hi[0] = hi[1] = hi[2] = -Infinity;
      for (let c = 0; c < 8; c++) {
        const x = c & 1 ? bx[3] : bx[0];
        const y = c & 2 ? bx[4] : bx[1];
        const z = c & 4 ? bx[5] : bx[2];
        for (let k = 0; k < 3; k++) {
          const v = a[o + k] * x + a[o + 4 + k] * y + a[o + 8 + k] * z + a[o + 12 + k];
          if (v < lo[k]) lo[k] = v;
          if (v > hi[k]) hi[k] = v;
        }
      }
      if (slabT(r, lo, hi) < t - 1e-3) return true;
    }
  }
  return false;
}

/** The opening (0 … 1) that puts a point of the lid (`at(v)`: where the lid at opening v puts it,
 *  the piano's frame) nearest the pointer (x, y) on the picture. Every opening is tried a
 *  hundredth apart, then the best one's neighbourhood a thousandth apart; among near-equal ones, the
 *  one nearest the last (`prev`), so the lid never jumps where its arc folds back on screen. */
export function lidFor(at: (v: number) => Vec3, vp: Mat4, w: number, h: number, x: number, y: number, prev: number): number {
  const cost = (v: number) => {
    const q = project(vp, at(v), w, h);
    if (!q) return Infinity;
    return Math.hypot(q[0] - x, q[1] - y) + 4 * Math.abs(v - prev);
  };
  let best = prev;
  let bc = cost(prev);
  for (let i = 0; i <= 100; i++) {
    const v = i / 100;
    const c = cost(v);
    if (c < bc) {
      bc = c;
      best = v;
    }
  }
  const b0 = best;
  for (let i = -10; i <= 10; i++) {
    const v = Math.min(1, Math.max(0, b0 + i / 1000));
    const c = cost(v);
    if (c < bc) {
      bc = c;
      best = v;
    }
  }
  return best;
}
