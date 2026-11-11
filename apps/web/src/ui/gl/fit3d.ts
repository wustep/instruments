// Framing: the nearest camera, on a given bearing, from which a scene fits a rectangle of the picture.
// The stage uses it where the picture is narrow (a phone held upright) so each instrument is as large
// as its stage allows, whole, and clear of what lies over the stage's top (the file player).
import type { Batch, Mat4, Mesh, Vec3 } from './gl3d.ts';

/** a rectangle of the picture in normalised device coordinates (−1 … 1, y up) */
export interface FitRect {
  l: number;
  r: number;
  b: number;
  t: number;
}
export interface Bearing {
  target: Vec3;
  yaw: number;
  pitch: number;
}

/** The camera's frame for an orbit about `target` (stage3d: eye = target + dist·dir, y up), as the
 *  renderer sees it: its world is mirrored in x, so the picture's right is the mirror of the
 *  camera's. `r`, `u`: the picture's right and up in the world; `f`: into the picture. */
function frameOf(yaw: number, pitch: number): { r: Vec3; u: Vec3; f: Vec3 } {
  const dir: Vec3 = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
  // in the mirrored world: forward f′ = (dir.x, −dir.y, −dir.z), right r′ = f′ × up, up u′ = r′ × f′
  const fm: Vec3 = [dir[0], -dir[1], -dir[2]];
  const rl = Math.hypot(fm[2], fm[0]) || 1;
  const rm: Vec3 = [-fm[2] / rl, 0, fm[0] / rl];
  const um: Vec3 = [rm[1] * fm[2] - rm[2] * fm[1], rm[2] * fm[0] - rm[0] * fm[2], rm[0] * fm[1] - rm[1] * fm[0]];
  // back to the scene's own world (x mirrored)
  return { r: [-rm[0], rm[1], rm[2]], u: [-um[0], um[1], um[2]], f: [-fm[0], fm[1], fm[2]] };
}

const boxes = new WeakMap<Mesh, Float32Array>();
/** a mesh's own box (lo x y z, hi x y z), found once */
function boxOf(m: Mesh): Float32Array {
  let bx = boxes.get(m);
  if (bx) return bx;
  bx = new Float32Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  const d = m.data;
  for (let i = 0; i < m.count; i++)
    for (let k = 0; k < 3; k++) {
      const v = d[i * 14 + k];
      if (v < bx[k]) bx[k] = v;
      if (v > bx[3 + k]) bx[3 + k] = v;
    }
  boxes.set(m, bx);
  return bx;
}

const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** every instance the framing counts: what the batch draws (less what it says not to frame), and
 *  what it says to frame though it is not drawn */
function eachInstance(b: Batch, f: (mesh: Mesh, a: Float32Array, o: number) => void): void {
  for (const m of b.meshes()) {
    if (!m.count || b.noFit.has(m)) continue;
    const buf = b.inst.get(m)!;
    for (let o = 0; o < buf.n; o += 20) f(m, buf.a, o);
  }
  for (const e of b.fitAlso) if (e.mesh.count) f(e.mesh, e.m ?? IDENT, 0);
}

/** The largest value over the scene of each of `n` linear forms g(p) = w·(p − t) (w: 3 numbers each
 *  in `forms`). A mesh whose box cannot beat the largest so far is passed over, so the cost is the
 *  scene's instances plus the few meshes on its outline. */
function maxima(b: Batch, t: Vec3, forms: number[], n: number): number[] {
  const best = new Array<number>(n).fill(-Infinity);
  const wl = new Float64Array(3 * n);
  const c = new Float64Array(n);
  const live: number[] = [];
  eachInstance(b, (mesh, a, o) => {
    const bx = boxOf(mesh);
    live.length = 0;
    for (let k = 0; k < n; k++) {
      const wx = forms[3 * k];
      const wy = forms[3 * k + 1];
      const wz = forms[3 * k + 2];
      // the form in the mesh's own frame: w·(M v − t) = (Mᵀw)·v + w·(M's translation − t)
      let hi = (c[k] = wx * (a[o + 12] - t[0]) + wy * (a[o + 13] - t[1]) + wz * (a[o + 14] - t[2]));
      for (let j = 0; j < 3; j++) {
        const l = (wl[3 * k + j] = wx * a[o + 4 * j] + wy * a[o + 4 * j + 1] + wz * a[o + 4 * j + 2]);
        hi += Math.max(l * bx[j], l * bx[3 + j]);
      }
      if (hi > best[k]) live.push(k);
    }
    if (!live.length) return;
    const d = mesh.data;
    for (let i = 0, q = 0; i < mesh.count; i++, q += 14) {
      const x = d[q];
      const y = d[q + 1];
      const z = d[q + 2];
      for (let s = 0; s < live.length; s++) {
        const k = live[s];
        const g = wl[3 * k] * x + wl[3 * k + 1] * y + wl[3 * k + 2] * z + c[k];
        if (g > best[k]) best[k] = g;
      }
    }
  });
  return best;
}

/** the four edges of `rect` as slopes of the view's pyramid (right, left, top, bottom: all positive
 *  for a rectangle that contains the picture's centre) */
const slopes = (rect: FitRect, tanV: number, aspect: number) => [rect.r * tanV * aspect, -rect.l * tanV * aspect, rect.t * tanV, -rect.b * tanV];

/** A point at (x, y) across the picture and z beyond the target is inside the right edge when
 *  x ≤ aR·(D + z): x − aR·z ≤ aR·D, a form linear in the point. So one pass for the largest value of
 *  each edge's form gives everything. */
function edgeForms(v: Bearing, a: number[]): number[] {
  const { r, u, f } = frameOf(v.yaw, v.pitch);
  const out: number[] = [];
  for (let k = 0; k < 3; k++) out[k] = r[k] - a[0] * f[k];
  for (let k = 0; k < 3; k++) out[3 + k] = -r[k] - a[1] * f[k];
  for (let k = 0; k < 3; k++) out[6 + k] = u[k] - a[2] * f[k];
  for (let k = 0; k < 3; k++) out[9 + k] = -u[k] - a[3] * f[k];
  return out;
}

/** The nearest camera on `v`'s bearing from which the scene fits `rect`, the target moved in the
 *  picture's plane so the scene sits in the middle of it: on the axis that binds it touches both
 *  edges, on the other its margins are equal. Exact (every vertex counts), in one pass: with the
 *  target moved by (sx, sy) the right and left edges ask A − sx ≤ aR·D and B + sx ≤ aL·D, so
 *  D ≥ (A + B) / (aR + aL), and likewise top and bottom. Null for an empty scene. */
export function fitView(b: Batch, v: Bearing, tanV: number, aspect: number, rect: FitRect): { target: Vec3; dist: number; binds: 'x' | 'y' } | null {
  const a = slopes(rect, tanV, aspect);
  const [A, B, C, E] = maxima(b, v.target, edgeForms(v, a), 4);
  if (!Number.isFinite(A)) return null;
  const dx = (A + B) / (a[0] + a[1]);
  const dy = (C + E) / (a[2] + a[3]);
  const D = Math.max(dx, dy, 1e-3);
  // the slack on each axis, shared between its two edges
  const sx = A - a[0] * D + ((a[0] + a[1]) * D - (A + B)) / 2;
  const sy = C - a[2] * D + ((a[2] + a[3]) * D - (C + E)) / 2;
  const { r, u } = frameOf(v.yaw, v.pitch);
  return { target: [v.target[0] + sx * r[0] + sy * u[0], v.target[1] + sx * r[1] + sy * u[1], v.target[2] + sx * r[2] + sy * u[2]], dist: D, binds: dx >= dy ? 'x' : 'y' };
}

/** Whether everything the framing counts lies under the height `top` of the picture (NDC, y up)
 *  seen from `dist` on `v`'s bearing: exact, in one pass. A point at y up the picture and z beyond
 *  the target is under it when y ≤ top·tanV·(dist + z): one linear form's largest value. */
export function fitsUnder(b: Batch, v: Bearing, dist: number, tanV: number, top: number): boolean {
  const { u, f } = frameOf(v.yaw, v.pitch);
  const a = top * tanV;
  const [C] = maxima(b, v.target, [u[0] - a * f[0], u[1] - a * f[1], u[2] - a * f[2]], 1);
  return !Number.isFinite(C) || C <= a * dist;
}

/** tests and review shots: the box of everything the framing counts, in CSS pixels of a w×h picture
 *  drawn through `vp` (every vertex projected) */
export function screenBox(b: Batch, vp: Mat4, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const m = new Float64Array(16);
  eachInstance(b, (mesh, a, o) => {
    // vp · M
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) m[c * 4 + r] = vp[r] * a[o + c * 4] + vp[4 + r] * a[o + c * 4 + 1] + vp[8 + r] * a[o + c * 4 + 2] + vp[12 + r] * a[o + c * 4 + 3];
    const d = mesh.data;
    for (let i = 0, q = 0; i < mesh.count; i++, q += 14) {
      const ww = m[3] * d[q] + m[7] * d[q + 1] + m[11] * d[q + 2] + m[15];
      if (ww <= 1e-6) continue;
      const x = (m[0] * d[q] + m[4] * d[q + 1] + m[8] * d[q + 2] + m[12]) / ww;
      const y = (m[1] * d[q] + m[5] * d[q + 1] + m[9] * d[q + 2] + m[13]) / ww;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  });
  if (!Number.isFinite(x0)) return null;
  return { x0: (x0 * 0.5 + 0.5) * w, x1: (x1 * 0.5 + 0.5) * w, y0: (1 - (y1 * 0.5 + 0.5)) * h, y1: (1 - (y0 * 0.5 + 0.5)) * h };
}
