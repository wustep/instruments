// The two pianos in 3D, built as instruments: each is made once from the engine's own string scale
// (speaking lengths, unisons, which notes have dampers, strike points) and posed every frame from the
// live state. Keys, wippens, jacks, repetition levers, hammers and dampers move per key as one linked
// rig; the pedals and the lid follow the engine; the soundboard glows with its modes; every string is
// drawn as a wire of its real diameter and the sounding ones vibrate.
//
// Geometry (metres; x across the keyboard, bass at −x; y up from the floor; z from the key fronts
// towards the tail / back). Sources (docs/3d-reference.md):
//   * keyboard: white keys 23.5 mm pitch (52 → 1.222 m), black keys 13.7 mm wide at the base, 9.5 at
//     the top, 12.5 mm higher, 95 mm long; key dip 10 mm (Steinway 9.9–10.7, [Steinway manual]);
//     white key tops 725 mm from the floor (Steinway D: 715, [dims-D]);
//   * grand action, modern Renner/Steinway geometry from the Erwin action-ratio gauge [Erwin AR]:
//     hammer centre to hammer 130 mm, wippen centre 113 mm behind the hammer centre (the "spread"),
//     the jack 99 mm and the capstan 66 mm in front of the wippen centre, the knuckle 17 mm from the
//     hammer centre; with the balance rail at 266 mm the action ratio is 5.3 (Erwin: 5–6); blow 47 mm
//     [Askenfelt-Jansson], let-off 2 mm; the backcheck on the key's tail; the damper underlever behind
//     the key, lifted by the key's tail, its wire up through the guide rail to the head;
//   * upright action (Yamaha U pattern): the wippen flanged at the back on the main rail, the jack up
//     to the hammer butt 10 mm in front of the butt centre, a 152 mm shank, the catcher and backcheck,
//     the damper lever pushed by the wippen's spoon, its head on the strings just above the hammers;
//     the hammer rail moves with the soft pedal;
//   * grand case: a ≈2.1 m grand (the engine's scale: its longest string, A0, is 1.58 m; Steinway B
//     is 2.11 × 1.48 m), rim 68 mm thick and 345 mm deep, lid hinged on the spine with its front flap
//     folded back, a long prop stick on the bentside, three square tapered legs on brass casters, a
//     lyre with three pedals; a gold-lacquered cast-iron plate: the front web over the pin block with
//     three staggered rows of tuning pins, agraffes and (treble) a capo bar, the bass strut, struts
//     over the strings, the hitch-pin flange with lightening holes, red understring felts;
//   * upright case: 1.21 × 1.53 × 0.61 m (Yamaha U1, [Yamaha-U]); strings vertical with the bass
//     crossed in front; the plate behind the strings; the upper front panel is off (as a technician
//     sees it) so the action shows; arms, legs on toe blocks, kneeboard, three pedals.
// Approximations: one string scale per piano from the engine (bridges and case follow it); the
// grand's treble side is cut away in front of the bentside so the action can be seen; the hammer's
// flight after let-off follows the stage's action state (strike, rebound, check), not a dynamic
// simulation.
import type { KeySummary, VisualFrame } from '@piano-model/engine';
import { ShapeUtils, Vector2 } from 'three';
import { stepAction, type PianoState, type Pt } from '../piano-draw.ts';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, ink, lerp3, norm, plateModes, xform } from './gl3d.ts';
import { M, MeshBuilder, area, cyl, ellipsoid, lathe, offset, spline, tube, type Mat } from './mesh.ts';
import { INK } from '../stage-draw.ts';

// ---------------------------------------------------------------- keyboard
export const WHITE = 0.0235;
const BLACK_W = 0.0137;
const KEY_TOP = 0.725;
const X0 = -26 * WHITE;
/** the action's pitch: the key sticks fan to a uniform spacing behind the key tops */
const PITCH = (52 * WHITE) / 88;
export const isBlack = (m: number) => [1, 3, 6, 8, 10].includes(m % 12);
function whiteIndex(m: number): number {
  let n = 0;
  for (let k = 21; k < m; k++) if (!isBlack(k)) n++;
  return n;
}
/** x of a key top's centre (A0 at the left) */
export function keyX3(m: number): number {
  if (!isBlack(m)) return X0 + (whiteIndex(m) + 0.5) * WHITE;
  return X0 + whiteIndex(m) * WHITE;
}
/** x of a key's action (hammer, strings at the strike line) */
export const actX = (m: number) => X0 + (m - 21 + 0.5) * PITCH;
/** strike point as a fraction of the speaking length (the engine's scale: 1/8.3 in the bass,
 *  falling to about 1/15 at the top) */
export const strikeBeta = (m: number) => (m <= 60 ? 0.12 : 0.12 - ((m - 60) / 48) * 0.055);
const isWound = (k: KeySummary) => k.midi < 48 && k.nStrings <= 2;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------- shape helpers
type P2 = [number, number];
/** a frame for a flat profile (u, v) extruded along w */
interface Frame {
  U: Vec3;
  V: Vec3;
  W: Vec3;
}
/** plan: a profile in (x, z), its thickness along y */
const PLAN: Frame = { U: [1, 0, 0], V: [0, 0, 1], W: [0, 1, 0] };
/** side: a profile in (z, y), its thickness along x */
const SIDE: Frame = { U: [0, 0, 1], V: [0, 1, 0], W: [1, 0, 0] };
/** front: a profile in (x, y), its thickness along z */
const FRONT: Frame = { U: [1, 0, 0], V: [0, 1, 0], W: [0, 0, 1] };
const fp = (f: Frame, u: number, v: number, w: number): Vec3 => [f.U[0] * u + f.V[0] * v + f.W[0] * w, f.U[1] * u + f.V[1] * v + f.W[1] * w, f.U[2] * u + f.V[2] * v + f.W[2] * w];
const dot2 = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const nrm2 = (x: number, y: number): P2 => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
/** each edge's outward normal (right of travel: outward for a counter-clockwise outline, into the
 *  hole for a clockwise hole) */
function edgeNormals(r: P2[]): P2[] {
  const n = r.length;
  return r.map((p, i) => {
    const q = r[(i + 1) % n];
    return nrm2(q[1] - p[1], -(q[0] - p[0]));
  });
}
const tri2 = (rs: P2[][]) =>
  ShapeUtils.triangulateShape(
    rs[0].map(([u, v]) => new Vector2(u, v)),
    rs.slice(1).map((h) => h.map(([u, v]) => new Vector2(u, v))),
  );

interface SlabOpts {
  /** the rounded edge round both faces (m) */
  bevel?: number;
  /** cos of the crease angle between walls */
  smooth?: number;
  botBevel?: boolean;
  top?: boolean;
  bottom?: boolean;
  topMat?: Mat;
  sideMat?: Mat;
  botMat?: Mat;
  uv?: (u: number, v: number) => [number, number];
}
/** a flat profile with holes, extruded from w0 to w1, its edges rounded: the workhorse for every
 *  cast, sawn or moulded part (a rounded edge catches the light; a square one reads as CG) */
function slab(mb: MeshBuilder, f: Frame, outer0: P2[], holes0: P2[][], w0: number, w1: number, m: Mat, o: SlabOpts = {}): void {
  const outer = area(outer0) > 0 ? outer0 : outer0.slice().reverse();
  const holes = holes0.map((h) => (area(h) < 0 ? h : h.slice().reverse()));
  const rings = [outer, ...holes];
  const b = Math.max(0, Math.min(o.bevel ?? 0, (w1 - w0) * 0.45));
  const sm = o.smooth ?? 0.75;
  const ins = rings.map((r) => (b > 0 ? inset(r, b * 0.9) : r));
  const N = (u: number, v: number, w: number): Vec3 => norm(fp(f, u, v, w));
  const topM = o.topMat ?? m;
  const sideM = o.sideMat ?? m;
  const botM = o.botMat ?? m;
  const uv = o.uv;
  const cap = (pts: P2[], faces: number[][], w: number, sgn: number, mat: Mat) => {
    const nn = N(0, 0, sgn);
    for (const [a, c, d] of faces) {
      const A = pts[a];
      const C = pts[c];
      const D = pts[d];
      mb.stri(fp(f, A[0], A[1], w), fp(f, C[0], C[1], w), fp(f, D[0], D[1], w), nn, nn, nn, mat, uv?.(A[0], A[1]), uv?.(C[0], C[1]), uv?.(D[0], D[1]));
    }
  };
  const botBevel = o.botBevel !== false && b > 0;
  const insFaces = o.top !== false || (o.bottom !== false && botBevel) ? tri2(ins) : [];
  if (o.top !== false) cap(ins.flat(), insFaces, w1, 1, topM);
  if (o.bottom !== false) {
    if (botBevel) cap(ins.flat(), insFaces, w0, -1, botM);
    else cap(rings.flat(), tri2(rings), w0, -1, botM);
  }
  const wb0 = botBevel ? w0 + b : w0;
  const wb1 = b > 0 ? w1 - b : w1;
  rings.forEach((r, k) => {
    const q = ins[k];
    const n = r.length;
    const en = edgeNormals(r);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ep = en[(i + n - 1) % n];
      const ec = en[i];
      const ex = en[j];
      const na: P2 = dot2(ep, ec) >= sm ? nrm2(ep[0] + ec[0], ep[1] + ec[1]) : ec;
      const nb: P2 = dot2(ec, ex) >= sm ? nrm2(ec[0] + ex[0], ec[1] + ex[1]) : ec;
      const NA = N(na[0], na[1], 0);
      const NB = N(nb[0], nb[1], 0);
      const A0 = fp(f, r[i][0], r[i][1], wb0);
      const B0 = fp(f, r[j][0], r[j][1], wb0);
      const A1 = fp(f, r[i][0], r[i][1], wb1);
      const B1 = fp(f, r[j][0], r[j][1], wb1);
      mb.stri(A0, B0, B1, NA, NB, NB, sideM);
      mb.stri(A0, B1, A1, NA, NB, NA, sideM);
      if (b > 0) {
        // the rounded edge: normals turning from the wall's to the face's across the chamfer
        const QA = fp(f, q[i][0], q[i][1], w1);
        const QB = fp(f, q[j][0], q[j][1], w1);
        mb.stri(A1, B1, QB, N(na[0], na[1], 0.45), N(nb[0], nb[1], 0.45), N(nb[0] * 0.45, nb[1] * 0.45, 1), topM);
        mb.stri(A1, QB, QA, N(na[0], na[1], 0.45), N(nb[0] * 0.45, nb[1] * 0.45, 1), N(na[0] * 0.45, na[1] * 0.45, 1), topM);
        if (botBevel) {
          const qa = fp(f, q[i][0], q[i][1], w0);
          const qb = fp(f, q[j][0], q[j][1], w0);
          mb.stri(A0, B0, qb, N(na[0], na[1], -0.45), N(nb[0], nb[1], -0.45), N(nb[0] * 0.45, nb[1] * 0.45, -1), botM);
          mb.stri(A0, qb, qa, N(na[0], na[1], -0.45), N(nb[0] * 0.45, nb[1] * 0.45, -1), N(na[0] * 0.45, na[1] * 0.45, -1), botM);
        }
      }
    }
  });
}
/** a rounded rectangle, counter-clockwise */
function rrect(u0: number, v0: number, u1: number, v1: number, r: number, seg = 3): P2[] {
  const rr = Math.min(r, (u1 - u0) / 2 - 1e-6, (v1 - v0) / 2 - 1e-6);
  if (rr <= 1e-6) return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const out: P2[] = [];
  const cs: [number, number, number][] = [[u1 - rr, v1 - rr, 0], [u0 + rr, v1 - rr, 0.5], [u0 + rr, v0 + rr, 1], [u1 - rr, v0 + rr, 1.5]];
  for (const [cu, cv, a0] of cs)
    for (let k = 0; k <= seg; k++) {
      const a = (a0 + (k / seg) * 0.5) * Math.PI;
      out.push([cu + rr * Math.cos(a), cv + rr * Math.sin(a)]);
    }
  return out;
}
function circle(cu: number, cv: number, r: number, n = 24): P2[] {
  return Array.from({ length: n }, (_, k): P2 => [cu + r * Math.cos((k / n) * Math.PI * 2), cv + r * Math.sin((k / n) * Math.PI * 2)]);
}
/** an axis-aligned box with every edge rounded */
function rbox(mb: MeshBuilder, lo: Vec3, hi: Vec3, m: Mat, b = 0.0015, o: SlabOpts = {}): void {
  slab(mb, PLAN, rrect(lo[0], lo[2], hi[0], hi[2], b, 2), [], lo[1], hi[1], m, { bevel: b, ...o });
}
/** a tuning pin from `p` along `d` (unit): the shaft in the block, a coil of wire, a turned head */
function tuningPin(mb: MeshBuilder, p: Vec3, d: Vec3): void {
  const at = (t: number): Vec3 => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
  cyl(mb, at(0), at(0.012), 0.0035, 0.0035, 10, M.pinSteel, false);
  cyl(mb, at(0.012), at(0.02), 0.0044, 0.0044, 10, M.pinSteel);
  cyl(mb, at(0.02), at(0.031), 0.0035, 0.0035, 10, M.pinSteel, false);
  cyl(mb, at(0.031), at(0.035), 0.0035, 0.0024, 10, M.pinSteel);
}
/** a side profile (z, y) between x0 and x1 */
function sideSlab(mb: MeshBuilder, prof: P2[], x0: number, x1: number, m: Mat, bevel = 0.001, o: SlabOpts = {}): void {
  slab(mb, SIDE, prof, [], x0, x1, m, { bevel, ...o });
}
/** a square post along y with rounded corners: sections [half x, half z, y] from the bottom up */
function post(mb: MeshBuilder, cx: number, cz: number, prof: [number, number, number][], rc: number, m: Mat, seg = 3): void {
  const K = seg + 1;
  const ring = (i: number): { p: Vec3; d: P2 }[] => {
    const [hx, hz, y] = prof[i];
    const r = Math.min(rc, hx * 0.9, hz * 0.9);
    const out: { p: Vec3; d: P2 }[] = [];
    const cs: [number, number, number][] = [[hx - r, hz - r, 0], [-(hx - r), hz - r, 0.5], [-(hx - r), -(hz - r), 1], [hx - r, -(hz - r), 1.5]];
    for (const [ox, oz, a0] of cs)
      for (let k = 0; k < K; k++) {
        const a = (a0 + (k / seg) * 0.5) * Math.PI;
        out.push({ p: [cx + ox + r * Math.cos(a), y, cz + oz + r * Math.sin(a)], d: [Math.cos(a), Math.sin(a)] });
      }
    return out;
  };
  const n = prof.length;
  const th: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dh = (prof[i + 1][0] - prof[i][0] + prof[i + 1][1] - prof[i][1]) / 2;
    th.push(Math.atan2(dh, prof[i + 1][2] - prof[i][2]));
  }
  const rings = prof.map((_, i) => ring(i));
  const NR = rings[0].length;
  for (let i = 0; i < n - 1; i++) {
    let ta = th[i];
    let tb = th[i];
    if (i > 0 && Math.abs(th[i - 1] - th[i]) < 0.45) ta = (th[i - 1] + th[i]) / 2;
    if (i < n - 2 && Math.abs(th[i + 1] - th[i]) < 0.45) tb = (th[i + 1] + th[i]) / 2;
    const Nn = (d: P2, t: number): Vec3 => norm([d[0] * Math.cos(t), -Math.sin(t), d[1] * Math.cos(t)]);
    for (let k = 0; k < NR; k++) {
      const k1 = (k + 1) % NR;
      const a = rings[i][k];
      const b = rings[i][k1];
      const c = rings[i + 1][k1];
      const d = rings[i + 1][k];
      mb.stri(a.p, b.p, c.p, Nn(a.d, ta), Nn(b.d, ta), Nn(c.d, tb), m);
      mb.stri(a.p, c.p, d.p, Nn(a.d, ta), Nn(c.d, tb), Nn(d.d, tb), m);
    }
  }
  for (const [i, s] of [[0, -1], [n - 1, 1]] as const) {
    const r = rings[i];
    const c: Vec3 = [cx, prof[i][2], cz];
    const nn: Vec3 = [0, s, 0];
    for (let k = 0; k < NR; k++) mb.stri(c, r[k].p, r[(k + 1) % NR].p, nn, nn, nn, m);
  }
}
/** a section (n inward from the path, y) swept along an open plan path; each section point may name
 *  the material of the edge that leaves it; the ends are capped */
interface SecPt {
  n: number;
  y: number;
  m?: Mat;
}
function sweepPlan(mb: MeshBuilder, path: P2[], sec: SecPt[], defM: Mat, o: { capA?: Mat | null; capB?: Mat | null; smooth?: number; yOff?: number[] } = {}): void {
  const np = path.length;
  const S = sec.length;
  const left: P2[] = path.map((_, i) => {
    const a = path[Math.max(0, i - 1)];
    const c = path[Math.min(np - 1, i + 1)];
    const t = nrm2(c[0] - a[0], c[1] - a[1]);
    return [-t[1], t[0]];
  });
  const miter = path.map((_, i) => {
    if (i === 0 || i === np - 1) return 1;
    const a = path[i - 1];
    const c = path[i];
    const t = nrm2(c[0] - a[0], c[1] - a[1]);
    return 1 / Math.max(0.6, dot2([-t[1], t[0]], left[i]));
  });
  const P = (i: number, s: SecPt): Vec3 => [path[i][0] + left[i][0] * s.n * miter[i], s.y + (o.yOff?.[i] ?? 0), path[i][1] + left[i][1] * s.n * miter[i]];
  // the section's outward edge normals (in n, y)
  const sp: P2[] = sec.map((s) => [s.n, s.y]);
  const ccw = area(sp) > 0;
  const en = edgeNormals(sp).map(([a, b]): P2 => (ccw ? [a, b] : [-a, -b]));
  const sm = o.smooth ?? 0.8;
  const W = (i: number, nn: P2): Vec3 => norm([left[i][0] * nn[0], nn[1], left[i][1] * nn[0]]);
  for (let j = 0; j < S; j++) {
    const j1 = (j + 1) % S;
    const e = en[j];
    const ep = en[(j + S - 1) % S];
    const ex = en[j1];
    const na: P2 = dot2(ep, e) >= sm ? nrm2(ep[0] + e[0], ep[1] + e[1]) : e;
    const nb: P2 = dot2(e, ex) >= sm ? nrm2(e[0] + ex[0], e[1] + ex[1]) : e;
    const mat = sec[j].m ?? defM;
    for (let i = 0; i < np - 1; i++) {
      mb.stri(P(i, sec[j]), P(i + 1, sec[j]), P(i + 1, sec[j1]), W(i, na), W(i + 1, na), W(i + 1, nb), mat);
      mb.stri(P(i, sec[j]), P(i + 1, sec[j1]), P(i, sec[j1]), W(i, na), W(i + 1, nb), W(i, nb), mat);
    }
  }
  const faces = tri2([sp]);
  for (const [i, mat, sgn] of [[0, o.capA, -1], [np - 1, o.capB, 1]] as const) {
    if (mat === null) continue;
    const a = path[Math.max(0, i - 1)];
    const c = path[Math.min(np - 1, i + 1)];
    const t = nrm2(c[0] - a[0], c[1] - a[1]);
    const nn: Vec3 = [t[0] * sgn, 0, t[1] * sgn];
    for (const [x, y, z] of faces) mb.stri(P(i, sec[x]), P(i, sec[y]), P(i, sec[z]), nn, nn, nn, mat ?? defM);
  }
}
/** distance from p to a polyline (closed: back to the start) */
function distLine(p: P2, l: P2[], closed: boolean): number {
  let d = Infinity;
  const n = l.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = l[i];
    const b = l[(i + 1) % n];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz));
  }
  return d;
}
function inPoly(p: P2, poly: P2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}
/** half-plane clip (keep v ≥ v0, or v ≤ v0 with `below`) of a closed polygon */
function clipV(poly: P2[], v0: number, below = false): P2[] {
  const out: P2[] = [];
  const keep = (p: P2) => (below ? p[1] <= v0 : p[1] >= v0);
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    if (keep(p)) out.push(p);
    if (keep(p) !== keep(q)) {
      const t = (v0 - p[1]) / (q[1] - p[1]);
      out.push([p[0] + (q[0] - p[0]) * t, v0]);
    }
  }
  return out;
}
/** a closed polygon offset to the left of travel by d (inwards for a counter-clockwise outline),
 *  mitred at the corners (offsetting by the neighbours' chord, as for open lines, folds a corner) */
function inset(poly: P2[], d: number): P2[] {
  const n = poly.length;
  return poly.map((c, i) => {
    const a = poly[(i + n - 1) % n];
    const e = poly[(i + 1) % n];
    const t1 = nrm2(c[0] - a[0], c[1] - a[1]);
    const t2 = nrm2(e[0] - c[0], e[1] - c[1]);
    const n1: P2 = [-t1[1], t1[0]];
    const m = nrm2(n1[0] - t2[1], n1[1] + t2[0]);
    const k = d / Math.max(0.35, dot2(m, n1));
    return [c[0] + m[0] * k, c[1] + m[1] * k];
  });
}
const ccw = (p: P2[]): P2[] => (area(p) > 0 ? p : p.slice().reverse());
/** drop points closer than eps to the previous one (triangulation dislikes duplicates) */
function dedupe(poly: P2[], eps = 1e-4): P2[] {
  const out: P2[] = [];
  for (const p of poly) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > eps) out.push(p);
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps) out.pop();
  return out;
}
/** resample a polyline to points about `step` apart */
function resample(l: P2[], step: number): P2[] {
  const out: P2[] = [l[0]];
  let carry = 0;
  for (let i = 0; i < l.length - 1; i++) {
    const a = l[i];
    const b = l[i + 1];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = step - carry;
    while (s < d) {
      out.push([a[0] + ((b[0] - a[0]) * s) / d, a[1] + ((b[1] - a[1]) * s) / d]);
      s += step;
    }
    carry = d - (s - step);
  }
  out.push(l[l.length - 1]);
  return dedupe(out, step * 0.3);
}

// ---------------------------------------------------------------- keys (shared meshes, one per cut)
const KEY_FRONT = 0.05;
const KEY_TOP_LEN = 0.147;
const keyTops = new Map<string, Mesh>();
/** a white key's top (ivory) by its cuts, or a sharp (ebony); centred on x = 0 */
function keyTop(m: number): Mesh {
  const black = isBlack(m);
  const cutL = !black && m > 21 && isBlack(m - 1);
  const cutR = !black && m < 108 && isBlack(m + 1);
  const id = black ? 'b' : `${cutL ? 1 : 0}${cutR ? 1 : 0}`;
  let mesh = keyTops.get(id);
  if (mesh) return mesh;
  const mb = new MeshBuilder();
  const yT = KEY_TOP;
  if (!black) {
    const h = WHITE / 2 - 0.00055;
    const l = cutL ? -WHITE / 2 + BLACK_W / 2 + 0.0007 : -h;
    const r = cutR ? WHITE / 2 - BLACK_W / 2 - 0.0007 : h;
    const poly: P2[] = dedupe([[-h, 0], [h, 0], [h, KEY_FRONT], [r, KEY_FRONT], [r, KEY_TOP_LEN], [l, KEY_TOP_LEN], [l, KEY_FRONT], [-h, KEY_FRONT]]);
    slab(mb, PLAN, poly, [], yT - 0.022, yT, M.keyIvory, { bevel: 0.0009, botBevel: false, smooth: 0.9 });
  } else {
    // a sharp: tapered sides, a sloped front, the top 9.5 mm wide, rounded edges
    const lo = rrect(-BLACK_W / 2, KEY_FRONT, BLACK_W / 2, 0.145, 0.0006, 2);
    const hi = rrect(-0.00475, KEY_FRONT + 0.008, 0.00475, 0.145, 0.0012, 2);
    const y0 = yT - 0.002;
    const y1 = yT + 0.0115;
    const n = lo.length;
    const top = inset(hi, 0.0009);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const A: Vec3 = [lo[i][0], y0, lo[i][1]];
      const B: Vec3 = [lo[j][0], y0, lo[j][1]];
      const C: Vec3 = [hi[j][0], y1, hi[j][1]];
      const D: Vec3 = [hi[i][0], y1, hi[i][1]];
      const nA = sideNormal(lo, hi, i, y1 - y0);
      const nB = sideNormal(lo, hi, j, y1 - y0);
      mb.stri(A, B, C, nA, nB, nB, M.ebony);
      mb.stri(A, C, D, nA, nB, nA, M.ebony);
      const E: Vec3 = [top[j][0], y1 + 0.001, top[j][1]];
      const F: Vec3 = [top[i][0], y1 + 0.001, top[i][1]];
      const uA = norm([nA[0] * 0.4, 1, nA[2] * 0.4]);
      const uB = norm([nB[0] * 0.4, 1, nB[2] * 0.4]);
      mb.stri(D, C, E, nA, nB, uB, M.ebony);
      mb.stri(D, E, F, nA, uB, uA, M.ebony);
    }
    const faces = tri2([top]);
    for (const [a, b, c] of faces) mb.stri([top[a][0], y1 + 0.001, top[a][1]], [top[b][0], y1 + 0.001, top[b][1]], [top[c][0], y1 + 0.001, top[c][1]], [0, 1, 0], [0, 1, 0], [0, 1, 0], M.ebony);
  }
  mesh = mb.build();
  keyTops.set(id, mesh);
  return mesh;
}
/** the outward normal of a lofted side between two rings at vertex i */
function sideNormal(lo: P2[], hi: P2[], i: number, h: number): Vec3 {
  const n = lo.length;
  const a = lo[(i + n - 1) % n];
  const c = lo[(i + 1) % n];
  const tAround: Vec3 = [c[0] - a[0], 0, c[1] - a[1]];
  const tUp: Vec3 = [hi[i][0] - lo[i][0], h, hi[i][1] - lo[i][1]];
  // outward for a counter-clockwise ring in (x, z): up × around points out
  return norm([tUp[1] * tAround[2] - tUp[2] * tAround[1], tUp[2] * tAround[0] - tUp[0] * tAround[2], tUp[0] * tAround[1] - tUp[1] * tAround[0]]);
}
/** the key stick (shared; sheared per key to the action's pitch): stick, key leads, capstan and, on a
 *  grand, the backcheck and the damper lifter */
function keyStick(len: number, capZ: number, capH: number, grand: boolean, stickTop: number, pivY: number): Mesh {
  const mb = new MeshBuilder();
  const w = 0.0052;
  rbox(mb, [-w, pivY, KEY_FRONT + 0.002], [w, stickTop, len], M.keyWood, 0.0008);
  // key leads: lead weights set into the stick's sides
  for (const z of [0.18, 0.205]) cyl(mb, [-w - 0.0003, pivY + 0.011, z], [w + 0.0003, pivY + 0.011, z], 0.0045, 0.0045, 12, M.darkSteel);
  // the balance-rail and front-rail bushings (red cloth) seen from the side
  rbox(mb, [-w - 0.0002, pivY, 0.012], [w + 0.0002, pivY + 0.004, 0.024], M.redFelt, 0.0005);
  // capstan: a brass screw with a rounded head
  lathe(mb, [[0, 0], [0.0042, 0], [0.0042, capH - 0.003], [0.0036, capH - 0.0008], [0.002, capH], [0, capH]].map(([r, y]): P2 => [r, y]), 14, M.brassDull);
  if (grand) {
    // backcheck: wire up from the tail, a wooden head faced with buckskin towards the hammer's tail
    const z = 0.508;
    cyl(mb, [0, stickTop, z], [0, 0.778, z - 0.004], 0.0011, 0.0011, 6, M.steel, false);
    sideSlab(mb, [[z - 0.012, 0.772], [z + 0.002, 0.772], [z + 0.003, 0.794], [z - 0.008, 0.796]], -0.0055, 0.0055, M.actionWood, 0.001);
    sideSlab(mb, [[z - 0.0135, 0.773], [z - 0.011, 0.773], [z - 0.0068, 0.796], [z - 0.0095, 0.7965]], -0.0056, 0.0056, M.buckskin, 0.0004);
    // the damper lifter: a felt pad on the key's tail
    rbox(mb, [-0.0045, stickTop, 0.538], [0.0045, stickTop + 0.004, 0.552], M.redFelt, 0.001);
  }
  const mesh = mb.build();
  // the capstan was lathed at the origin: shift those vertices to (0, stickTop, capZ)
  shiftLathe(mesh, capZ, stickTop);
  return mesh;
}
/** move the capstan (the vertices lathed about the origin, the only ones with |z| < 0.01) into place */
function shiftLathe(mesh: Mesh, z: number, y: number): void {
  const d = mesh.data;
  const loc = mesh.loc!;
  for (let i = 0; i < mesh.count; i++) {
    const o = i * 14;
    if (Math.abs(d[o + 2]) < 0.01 && d[o + 1] < 0.1) {
      d[o + 1] += y;
      d[o + 2] += z;
      loc[i * 3 + 1] += y;
      loc[i * 3 + 2] += z;
    }
  }
}

// ---------------------------------------------------------------- hammers (shared, scaled per key)
/** a hammer head: moulding, underfelt and felt, the crown towards `up`. `upright`: the shank along y,
 *  the crown towards +z; otherwise the shank along z (the head on its end), the crown up (+y). */
function hammerHead(upright: boolean): Mesh {
  const mb = new MeshBuilder();
  // in (along, crown): along the shank (0 = its end), crown up from the shank's axis
  const egg = (a: number, b: number, c0: number, y0: number, n = 26): P2[] => {
    // a half ellipse (crown up) cut at y0, plus its flat bottom
    const out: P2[] = [];
    const t0 = Math.asin(clamp((y0 - c0) / b, -1, 1));
    for (let k = 0; k <= n; k++) {
      const t = t0 + ((Math.PI - 2 * t0) * k) / n;
      // from the right (along +) over the crown to the left
      out.push([a * Math.cos(t), c0 + b * Math.sin(t)]);
    }
    return out;
  };
  const map = (p: P2[]): P2[] => (upright ? p.map(([al, cr]): P2 => [cr, -al]) : p);
  const half = 0.0058;
  const mk = (prof: P2[], hw: number, m: Mat, bevel: number) => slab(mb, SIDE, map(prof), [], -hw, hw, m, { bevel });
  // felt: crown 48 mm above the shank's axis, 29 mm across, crown radius ≈ 6.5 mm; the felt is 10 mm
  // thick at the crown and 5.5 mm on the shoulders, over a 1.5 mm coloured underfelt
  mk(egg(0.0145, 0.032, 0.016, 0.0), half, M.hammerFelt, 0.0016);
  mk(egg(0.009, 0.0226, 0.016, 0.0012), half + 0.00012, M.underfelt, 0.0006);
  // the moulding: under the felt, its top shaped like the felt's inner face; its tail for the
  // backcheck (grand); an upright's head is seen from behind: a narrow wooden back between the felt's shoulders
  const top = egg(0.0075, 0.0211, 0.016, 0.003, 18);
  const mould: P2[] = upright
    ? [[-0.0062, -0.012], [0.0062, -0.012], [0.0068, 0.003], ...top, [-0.0068, 0.003]]
    : [[-0.009, -0.0095], [0.012, -0.0095], [0.0128, -0.002], [0.0095, 0.003], ...top, [-0.0095, 0.003], [-0.0098, -0.002]];
  mk(mould, half + 0.00024, upright ? M.mahogany : M.maple, 0.0007);
  return mb.build();
}

// ---------------------------------------------------------------- the model
interface StringRun {
  /** tuning pin, agraffe (speaking length starts), bridge (ends), hitch pin */
  pin: Vec3;
  a: Vec3;
  b: Vec3;
  hitch: Vec3;
}
interface KeyGeo {
  midi: number;
  i: number;
  k: KeySummary;
  wound: boolean;
  strings: StringRun[];
  /** where the hammer meets the strings (centre of the unison), and the damper's place */
  strike: Vec3;
  damper: Vec3 | null;
  /** the key top (shared by keys of the same cut), placed at `xc` */
  key: Mesh;
  xc: number;
  /** the key stick's shear (it fans from the key top to the action's pitch) */
  shear: Mat4;
  /** hammer head scale (bass hammers are bigger) and its height scale (crowns at the blow distance) */
  hs: number;
  hy: number;
  /** hammer travel to the string (m) */
  blow: number;
}
interface Wire {
  pts: Vec3[];
  col: RGBA;
  d: number;
  odd: boolean;
}
export interface PianoModel {
  kind: 'grand' | 'upright';
  sig: string;
  statics: Mesh[];
  /** the music desk (not part of the case) */
  desk: Mesh | null;
  board: Mesh;
  boardAspect: number;
  keys: KeyGeo[];
  parts: Record<string, Mesh>;
  wires: Wire[];
  lid: Mesh | null;
  lidHinge: Vec3;
  prop: { base: Vec3; tipLocal: Vec3 } | null;
  pedals: { mesh: Mesh; pivot: Vec3 }[];
  bounds: { c: Vec3; r: number };
  floorY: number;
  /** where sound leaves (for the room) */
  src: Vec3;
}

function sigOf(keys: KeySummary[]): string {
  return keys.map((k) => `${k.lengthM.toFixed(3)}${k.nStrings}${k.hasDamper ? 1 : 0}`).join('');
}
/** a key stick's shear: x' = x + xc + s (z − zs) */
function shearOf(xc: number, xa: number, zs: number, len: number): Mat4 {
  const s = (xa - xc) / (len - zs);
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, s, 0, 1, 0, xc - s * zs, 0, 0, 1]);
}
/** the strings as wires: steel trebles 0.8–1.2 mm, copper-wound basses 1.8–5 mm over a steel core */
function wiresOf(geo: KeyGeo[]): Wire[] {
  const out: Wire[] = [];
  const STEEL: RGBA = [0.74, 0.76, 0.79, 0.9];
  const CORE: RGBA = [0.66, 0.67, 0.7, 0.9];
  const COPPER: RGBA = [0.8, 0.5, 0.3, 0.95];
  for (const g of geo) {
    const odd = g.midi % 2 === 1;
    for (const r of g.strings) {
      if (!g.wound) {
        const d = 0.00082 + 0.00036 * clamp((108 - g.midi) / 62, 0, 1);
        out.push({ pts: [r.pin, r.a, r.b, r.hitch], col: STEEL, d, odd });
      } else {
        const d = 0.0018 + 0.0032 * clamp((45 - g.midi) / 24, 0, 1);
        out.push({ pts: [r.pin, r.a, r.b, r.hitch], col: CORE, d: 0.0013, odd });
        const L = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1], r.b[2] - r.a[2]);
        const e = Math.min(0.03, L * 0.04) / L;
        out.push({ pts: [lerp3(r.a, r.b, e), lerp3(r.a, r.b, 1 - e)], col: COPPER, d, odd });
      }
    }
  }
  return out;
}

/** the lit glow for a sounding key */
const VERM: RGBA = [1, 0.37, 0.22, 0.32];

// ================================================================ grand
const G = {
  keyLen: 0.56,
  balZ: 0.266,
  /** the keys' underside, where they rock on the balance rail */
  pivY: 0.698,
  stickTop: 0.722,
  capZ: 0.39,
  capH: 0.01,
  wipZ: 0.456,
  wipY: 0.748,
  jackZ: 0.357,
  knR: 0.017,
  hamZ: 0.34,
  hamY: 0.8,
  shankLen: 0.13,
  strikeZ: 0.47,
  strY: 0.895,
  bassAgY: 0.903,
  bassBrY: 0.927,
  damperZ: 0.575,
  ulPivotZ: 0.665,
  ulY: 0.736,
  bellyZ: 0.62,
  boardY: 0.848,
  rimBottom: 0.62,
  rimTop: 0.965,
  plateY: 0.882,
  plateFront: 0.195,
  blow: 0.047,
  letoff: 0.002,
  dip: 0.01,
  RIM: 0.068,
  cutZ: 0.66,
};
const BASS_ANGLE = 0.18; // the overstrung bass fans towards the treble at the tail

/** the grand's outline (outer face of the rim): treble front → bentside → tail → spine → bass front */
function grandOutline(): P2[] {
  const ctrl: P2[] = [
    [0.74, 0.17], [0.74, 0.6], [0.735, 0.72], [0.7, 0.82], [0.63, 0.93], [0.535, 1.07], [0.43, 1.24], [0.33, 1.43], [0.24, 1.62], [0.165, 1.79], [0.09, 1.93], [-0.02, 2.04], [-0.17, 2.11], [-0.36, 2.135], [-0.53, 2.1], [-0.65, 2.0], [-0.715, 1.87], [-0.74, 1.72], [-0.74, 1.0], [-0.74, 0.17],
  ];
  return resample(spline(ctrl, 10), 0.02);
}

export function buildGrandModel(keys: KeySummary[]): PianoModel {
  const geo: KeyGeo[] = [];
  const DB: Vec3 = [Math.sin(BASS_ANGLE), 0, Math.cos(BASS_ANGLE)];
  const stick = keyStick(G.keyLen, G.capZ, G.capH, true, G.stickTop, G.pivY);
  for (const k of keys) {
    const m = k.midi;
    const i = m - 21;
    const wound = isWound(k);
    const L = Math.max(0.04, k.lengthM);
    const beta = strikeBeta(m);
    const dir: Vec3 = wound ? DB : [0, 0, 1];
    const xs = actX(m);
    const n = Math.max(1, k.nStrings);
    const sp = wound ? 0.0042 : 0.0034;
    const ya = wound ? G.bassAgY : G.strY;
    const yb = wound ? G.bassBrY : G.strY;
    const strings: StringRun[] = [];
    for (let j = 0; j < n; j++) {
      const dx = (j - (n - 1) / 2) * sp;
      const a: Vec3 = [xs + dx - dir[0] * beta * L, ya, G.strikeZ - dir[2] * beta * L];
      const b: Vec3 = [a[0] + dir[0] * L, yb, a[2] + dir[2] * L];
      // three staggered rows of tuning pins on the pin block
      const pin: Vec3 = [a[0], G.plateY + 0.013, 0.208 + 0.024 * j + 0.012 * (i % 2)];
      const hitch: Vec3 = [b[0] + dir[0] * 0.075, G.plateY + 0.007, b[2] + dir[2] * 0.075];
      strings.push({ pin, a, b, hitch });
    }
    const strike: Vec3 = [xs, lerp(ya, yb, beta), G.strikeZ];
    // the dampers sit on the strings along one line behind the hammers (their wires rise through one guide rail)
    const mid = strings[Math.floor(n / 2)];
    const td = (G.damperZ - mid.a[2]) / (mid.b[2] - mid.a[2]);
    const damper: Vec3 | null = k.hasDamper ? [lerp(mid.a[0], mid.b[0], td) - (n === 2 ? sp / 2 : 0), lerp(mid.a[1], mid.b[1], td), G.damperZ] : null;
    const hs = 1.22 - 0.38 * ((m - 21) / 87);
    const hy = (strike[1] - G.blow - G.hamY) / 0.048;
    geo.push({ midi: m, i, k, wound, strings, strike, damper, hs, hy, blow: G.blow, key: keyTop(m), xc: keyX3(m), shear: shearOf(keyX3(m), xs, 0.1, G.keyLen) });
  }
  const mid = (g: KeyGeo) => g.strings[Math.floor(g.strings.length / 2)];
  const bass = geo.filter((g) => g.wound);
  const treble = geo.filter((g) => !g.wound);
  const xL = -0.74;
  const xR = 0.74;
  const outer = grandOutline();
  const inner = offset(outer, G.RIM);
  const mb = new MeshBuilder();
  // ---- the rim: lacquered outside and top, a bottom moulding, black inside; the treble side in front
  //      of the bentside cut away (the section shows the laminated maple)
  const rimSec: SecPt[] = [
    { n: -0.004, y: G.rimBottom, m: M.lacquer },
    { n: -0.004, y: G.rimBottom + 0.014, m: M.lacquer },
    { n: 0, y: G.rimBottom + 0.02, m: M.lacquer },
    { n: 0, y: G.rimTop - 0.008, m: M.lacquer },
    { n: 0.0025, y: G.rimTop - 0.0022, m: M.lacquer },
    { n: 0.008, y: G.rimTop, m: M.lacquer },
    { n: G.RIM - 0.004, y: G.rimTop, m: M.lacquer },
    { n: G.RIM - 0.0005, y: G.rimTop - 0.0035, m: M.lacquerSatin },
    { n: G.RIM, y: G.rimBottom, m: M.lacquerSatin },
  ];
  const cutI = outer.findIndex((p) => p[1] >= G.cutZ);
  sweepPlan(mb, outer.slice(cutI), rimSec, M.lacquer, { capA: M.maple, capB: M.lacquer, smooth: 0.85 });
  // in front of the bentside the treble side is opened as a window onto the action: the rim's top rail
  // and its foot carry on across it (the silhouette stays whole); the sections show the laminated maple
  {
    const front = outer.slice(0, cutI + 1);
    const WT = 0.93;
    const WB = 0.682;
    sweepPlan(mb, front, [
      { n: 0, y: WT, m: M.lacquer }, { n: 0, y: G.rimTop - 0.008, m: M.lacquer }, { n: 0.0025, y: G.rimTop - 0.0022, m: M.lacquer }, { n: 0.008, y: G.rimTop, m: M.lacquer }, { n: G.RIM - 0.004, y: G.rimTop, m: M.lacquer }, { n: G.RIM - 0.0005, y: G.rimTop - 0.0035, m: M.lacquerSatin }, { n: G.RIM, y: WT, m: M.maple },
    ], M.lacquer, { capA: M.lacquer, capB: null, smooth: 0.85 });
    sweepPlan(mb, front, [
      { n: -0.004, y: G.rimBottom, m: M.lacquer }, { n: -0.004, y: G.rimBottom + 0.014, m: M.lacquer }, { n: 0, y: G.rimBottom + 0.02, m: M.lacquer }, { n: 0, y: WB, m: M.maple }, { n: G.RIM, y: WB, m: M.lacquerSatin }, { n: G.RIM, y: G.rimBottom, m: M.lacquerSatin },
    ], M.lacquer, { capA: M.lacquer, capB: null, smooth: 0.85 });
  }
  // the case bottom (a dark rim liner) and the braces under the soundboard
  {
    const poly = dedupe(clipV([...inner, [inner[inner.length - 1][0], 0.17], [inner[0][0], 0.17]] as P2[], G.bellyZ));
    slab(mb, PLAN, poly, [], G.rimBottom + 0.0, G.rimBottom + 0.012, M.caseRaw, { bevel: 0.002 });
    for (const [x0, z0, x1, z1] of [[-0.3, 0.66, -0.55, 1.95], [0.0, 0.66, -0.15, 2.0], [0.3, 0.66, 0.2, 1.5]]) {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const l = Math.hypot(dx, dz);
      const nx = (-dz / l) * 0.03;
      const nz = (dx / l) * 0.03;
      slab(mb, PLAN, [[x0 - nx, z0 - nz], [x1 - nx, z1 - nz], [x1 + nx, z1 + nz], [x0 + nx, z0 + nz]], [], G.rimBottom - 0.035, G.rimBottom, M.lacquerSatin, { bevel: 0.004 });
    }
  }
  // ---- keybed, key slip, cheek blocks, the key frame, the open fallboard
  slab(mb, PLAN, rrect(xL, -0.022, xR, 0.66, 0.004), [], 0.648, 0.682, M.lacquer, { bevel: 0.003, topMat: M.actionWood });
  rbox(mb, [-0.612, 0.682, -0.023], [0.612, 0.708, -0.004], M.lacquer, 0.002);
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? xL : 0.613;
    const x1 = s < 0 ? -0.613 : xR;
    // the cheek: a rounded front, its top 6.5 cm above the keys
    const prof: P2[] = [[-0.022, 0.648], [0.17, 0.648], [0.17, 0.79]];
    for (let k = 0; k <= 8; k++) {
      const a = (Math.PI / 2) * (k / 8);
      prof.push([0.03 - 0.052 * Math.sin(a), 0.738 + 0.052 * Math.cos(a)]);
    }
    sideSlab(mb, prof, x0, x1, M.lacquer, 0.004);
  }
  // key frame: front rail with its punchings, balance rail, back rail with its cloth, the frame's cheeks
  rbox(mb, [-0.612, 0.682, 0.004], [0.612, 0.692, 0.03], M.actionWood, 0.001);
  rbox(mb, [-0.612, 0.692, 0.008], [0.612, 0.6935, 0.026], M.redFelt, 0.0004);
  rbox(mb, [-0.612, 0.682, G.balZ - 0.011], [0.612, 0.698, G.balZ + 0.011], M.actionWood, 0.0015);
  rbox(mb, [-0.612, 0.682, 0.52], [0.612, 0.694, 0.56], M.actionWood, 0.0015);
  rbox(mb, [-0.612, 0.694, 0.52], [0.612, 0.698, 0.56], M.greenFelt, 0.0008);
  // the fallboard, open: folded back behind the keys
  sideSlab(mb, [[0.15, 0.73], [0.168, 0.73], [0.212, 0.862], [0.2, 0.868], [0.186, 0.866], [0.15, 0.76]], -0.613, 0.613, M.lacquer, 0.003);
  rbox(mb, [-0.613, 0.722, 0.147], [0.613, 0.73, 0.18], M.redFelt, 0.001);
  // ---- the action frame: cast brackets, the hammer flange rail, wippen rail, hammer rest rail,
  //      damper guide rail and underlever rail
  {
    // (the key sticks pass under them: each bracket stands on a foot behind the key ends)
    const br = spline([
      [0.6, 0.682], [0.645, 0.682], [0.648, 0.71], [0.635, 0.742], [0.6, 0.752], [0.53, 0.752], [0.47, 0.76], [0.42, 0.776], [0.37, 0.8], [0.34, 0.822], [0.31, 0.828], [0.294, 0.815], [0.298, 0.795], [0.325, 0.782], [0.37, 0.762], [0.43, 0.744], [0.5, 0.738], [0.575, 0.735], [0.6, 0.72],
    ], 4, true);
    for (const x of [-0.605, -0.305, -0.003, 0.297, 0.605]) {
      slab(mb, SIDE, br, [circle(0.392, 0.7724, 0.0072, 16), circle(0.6225, 0.713, 0.0085, 16)], x - 0.0045, x + 0.0045, M.bracketCast, { bevel: 0.0014, smooth: 0.5 });
    }
  }
  rbox(mb, [-0.615, 0.79, 0.298], [0.615, 0.822, 0.332], M.actionWood, 0.002);
  rbox(mb, [-0.615, 0.726, G.wipZ - 0.016], [0.615, 0.742, G.wipZ + 0.016], M.actionWood, 0.0015);
  rbox(mb, [-0.615, 0.775, 0.428], [0.615, 0.79, 0.448], M.actionWood, 0.0015);
  rbox(mb, [-0.615, 0.79, 0.428], [0.615, 0.794, 0.448], M.greenFelt, 0.0008);
  rbox(mb, [-0.615, 0.833, G.damperZ - 0.013], [0.615, 0.848, G.damperZ + 0.013], M.actionWood, 0.0015);
  rbox(mb, [-0.62, 0.698, G.ulPivotZ - 0.008], [0.62, 0.742, G.ulPivotZ + 0.028], M.actionWood, 0.0015);
  // per key: the hammer flange, the let-off button, the wippen flange
  for (const g of geo) {
    const x = g.strike[0];
    rbox(mb, [x - 0.0048, 0.794, 0.33], [x + 0.0048, 0.812, 0.35], M.hornbeam, 0.001);
    cyl(mb, [x, 0.79, 0.339], [x, 0.772, 0.339], 0.0012, 0.0012, 6, M.brassDull, false);
    lathe(mb, [[0, 0.0], [0.0042, 0.0], [0.0042, 0.006], [0.0, 0.006]].map(([r, y]): P2 => [r, y]), 10, M.redFelt);
    shiftX(mb, x, 0.339, 0.767);
    rbox(mb, [x - 0.0046, 0.742, G.wipZ - 0.006], [x + 0.0046, 0.752, G.wipZ + 0.01], M.hornbeam, 0.001);
  }
  // ---- legs (square, tapered, on brass casters) and the lyre
  const leg = (x: number, z: number, top: number) => {
    post(mb, x, z, [[0.034, 0.034, 0.068], [0.037, 0.037, 0.074], [0.037, 0.037, 0.125], [0.031, 0.031, 0.13], [0.043, 0.043, top - 0.13], [0.05, 0.05, top - 0.124], [0.05, 0.05, top - 0.1], [0.06, 0.06, top - 0.09], [0.06, 0.06, top]], 0.004, M.lacquer);
    caster(mb, x, z);
  };
  leg(xL + 0.075, 0.09, 0.648);
  leg(xR - 0.075, 0.09, 0.648);
  leg(-0.3, 1.86, G.rimBottom - 0.035);
  // lyre: posts, the pedal box, the braces back to the case, the pedal rods
  for (const x of [-0.1, 0.1]) post(mb, x, 0.33, [[0.016, 0.02, 0.115], [0.012, 0.017, 0.3], [0.014, 0.019, 0.55], [0.02, 0.026, 0.62], [0.02, 0.026, 0.648]], 0.004, M.lacquer);
  rbox(mb, [-0.15, 0.6, 0.29], [0.15, 0.648, 0.37], M.lacquer, 0.006);
  rbox(mb, [-0.14, 0.03, 0.272], [0.14, 0.115, 0.39], M.lacquer, 0.008);
  for (const s of [-1, 1]) cyl(mb, [s * 0.12, 0.09, 0.385], [s * 0.17, G.rimBottom - 0.035, 0.72], 0.008, 0.008, 10, M.lacquer);
  for (const x of [-0.04, 0, 0.04]) cyl(mb, [x, 0.115, 0.335], [x, 0.6, 0.335], 0.0028, 0.0028, 8, M.brassDull, false);
  // ---- the soundboard (lives: its modes) inside the rim behind the belly rail
  const sb = new MeshBuilder();
  const boardPoly = dedupe(clipV([...inner, [inner[inner.length - 1][0], 0.17], [inner[0][0], 0.17]] as P2[], G.bellyZ));
  const bx0 = Math.min(...boardPoly.map((p) => p[0]));
  const bx1 = Math.max(...boardPoly.map((p) => p[0]));
  const bz0 = G.bellyZ;
  const bz1 = Math.max(...boardPoly.map((p) => p[1]));
  slab(sb, PLAN, boardPoly, [], G.boardY - 0.009, G.boardY, M.spruce, { uv: (x, z) => [(x - bx0) / (bx1 - bx0), (z - bz0) / (bz1 - bz0)] });
  // the belly rail in front of it
  rbox(mb, [-0.62, G.boardY - 0.06, G.bellyZ - 0.03], [0.62, G.boardY + 0.002, G.bellyZ], M.lacquerSatin, 0.002);
  // ---- bridges on the soundboard: the long treble bridge and the bass bridge, with their pins
  const bridge = (gs: KeyGeo[], y1: number, w0: number, w1: number) => {
    const pts = gs.map((g) => [mid(g).b[0], mid(g).b[2]] as P2).sort((p, q) => p[0] - q[0]);
    const path = resample(spline(pts.filter((_, k) => k % 3 === 0 || k === pts.length - 1), 4), 0.015);
    sweepPlan(mb, path, [{ n: -w0, y: G.boardY }, { n: w0, y: G.boardY }, { n: w1, y: y1 - 0.003 }, { n: w1 * 0.6, y: y1 }, { n: -w1 * 0.6, y: y1 }, { n: -w1, y: y1 - 0.003 }], M.maple, { smooth: 0.9 });
  };
  bridge(treble, G.strY - 0.0008, 0.016, 0.011);
  if (bass.length > 1) bridge(bass, G.bassBrY - 0.0008, 0.02, 0.014);
  for (const g of geo)
    for (const s of g.strings) {
      const d: Vec3 = g.wound ? DB : [0, 0, 1];
      for (const t of [-0.006, 0.006]) {
        const p: Vec3 = [s.b[0] + d[0] * t + (t < 0 ? 0.0012 : -0.0012), s.b[1], s.b[2] + d[2] * t];
        cyl(mb, [p[0], p[1] - 0.004, p[2]], [p[0], p[1] + 0.005, p[2]], 0.0009, 0.0009, 5, M.nickel, false);
      }
    }
  // ---- the plate
  plateGrand(mb, geo, inner, DB);
  // ---- the action parts (instanced per key)
  const parts: Record<string, Mesh> = { stick };
  {
    // wippen (in its centre's frame; the body runs forward to −z): body, heel on the capstan,
    // repetition lever support and spring
    const w = new MeshBuilder();
    sideSlab(w, [[0.009, -0.007], [0.009, 0.005], [-0.03, 0.007], [-0.08, 0.006], [-0.112, 0.004], [-0.112, -0.006], [-0.08, -0.01], [-0.045, -0.011], [-0.02, -0.009]], -0.0045, 0.0045, M.hornbeam, 0.0012);
    rbox(w, [-0.0046, -0.016, -0.074], [0.0046, -0.01, -0.058], M.buckskin, 0.0012);
    sideSlab(w, [[-0.05, 0.004], [-0.04, 0.004], [-0.042, 0.031], [-0.049, 0.031]], -0.004, 0.004, M.hornbeam, 0.0008);
    tube(w, [[0, 0.004, -0.03], [0, 0.016, -0.034], [0, 0.026, -0.05]], 0.0008, 5, M.steel);
    // the jack's flange
    rbox(w, [-0.0047, 0.002, -0.107], [0.0047, 0.009, -0.093], M.hornbeam, 0.0008);
    parts.wippen = w.build();
    // jack (in its pivot's frame): upright to the knuckle, its toe forward to the let-off button
    const j = new MeshBuilder();
    sideSlab(j, [[-0.0032, 0.0], [0.0035, 0.0], [0.0035, 0.0305], [-0.0025, 0.0305], [-0.0032, 0.012], [-0.019, 0.009], [-0.02, 0.0045], [-0.0032, 0.003]], -0.0038, 0.0038, M.hornbeam, 0.0008);
    parts.jack = j.build();
    // repetition lever (in its pivot's frame): a long lever under the knuckle, its window for the jack
    const r = new MeshBuilder();
    slab(r, SIDE, [[0.012, -0.0035], [0.012, 0.004], [-0.072, 0.004], [-0.076, 0.0005], [-0.072, -0.003], [-0.02, -0.0035]], [rrect(-0.06, -0.0015, -0.047, 0.0025, 0.001, 1)], -0.0032, 0.0032, M.hornbeam, { bevel: 0.0008 });
    cyl(r, [-0.0055, 0, 0], [0.0055, 0, 0], 0.0013, 0.0013, 8, M.brassDull);
    parts.rep = r.build();
    // hammer shank and knuckle (in the centre pin's frame; the shank runs towards +z)
    const s = new MeshBuilder();
    cyl(s, [0, 0, -0.006], [0, 0.0006, G.shankLen + 0.002], 0.0046, 0.0041, 12, M.hornbeam);
    cyl(s, [-0.0052, -0.011, G.knR], [0.0052, -0.011, G.knR], 0.0065, 0.0065, 16, M.buckskin);
    rbox(s, [-0.0035, -0.0075, G.knR - 0.008], [0.0035, -0.002, G.knR + 0.008], M.hornbeam, 0.001);
    parts.shank = s.build();
    parts.head = hammerHead(false);
    // damper underlever (in its pivot's frame, forward to −z), its lift felt on the key's tail
    const u = new MeshBuilder();
    sideSlab(u, [[0.012, -0.005], [0.012, 0.006], [-0.135, 0.005], [-0.135, -0.004]], -0.0048, 0.0048, M.actionWood, 0.0012);
    rbox(u, [-0.0049, -0.009, -0.127], [0.0049, -0.004, -0.112], M.redFelt, 0.0012);
    rbox(u, [-0.0052, 0.005, -0.096], [0.0052, 0.012, -0.08], M.hornbeam, 0.0008);
    parts.under = u.build();
    // damper heads (at the string's contact): treble flat felt, bass wedges (the head turned with the strings)
    for (const [name, wedge] of [['damperT', false], ['damperB', true]] as const) {
      const d = new MeshBuilder();
      cyl(d, [0, -0.15, 0], [0, 0.012, 0], 0.0011, 0.0011, 6, M.steel, false);
      const len = wedge ? 0.034 : 0.028;
      rbox(d, [-0.0062, 0.006, -len / 2], [0.0062, 0.03, len / 2], M.maple, 0.0012);
      if (!wedge) rbox(d, [-0.006, -0.0005, -len / 2 + 0.001], [0.006, 0.006, len / 2 - 0.001], M.damperFelt, 0.0012);
      else for (const sx of [-1, 1]) slab(d, SIDE, rrect(-len / 2 + 0.001, -0.004, len / 2 - 0.001, 0.006, 0.001, 1), [], sx < 0 ? -0.006 : 0.0003, sx < 0 ? -0.0003 : 0.006, M.damperFelt, { bevel: 0.0012 });
      const mesh = d.build();
      if (wedge) rotateMeshY(mesh, BASS_ANGLE);
      parts[name] = mesh;
    }
  }
  // ---- the lid (hinged on the spine; its front flap folded back over it) and its prop; the desk
  const caseOutline = [...offset(outer, -0.003)];
  const closed: P2[] = dedupe([...caseOutline, [caseOutline[caseOutline.length - 1][0], 0.17], [caseOutline[0][0], 0.17]]);
  const lm = new MeshBuilder();
  const LID_T = 0.022;
  const LID_FOLD = 0.47;
  const y0 = G.rimTop + 0.001;
  slab(lm, PLAN, dedupe(clipV(closed, LID_FOLD)), [], y0, y0 + LID_T, M.lacquer, { bevel: 0.006, smooth: 0.9 });
  const flap = dedupe(clipV(clipV(closed, 0.172), LID_FOLD, true)).map(([x, z]): P2 => [x, 2 * LID_FOLD - z]);
  slab(lm, PLAN, flap, [], y0 + LID_T + 0.0008, y0 + 2 * LID_T + 0.0008, M.lacquer, { bevel: 0.006, smooth: 0.9 });
  rbox(lm, [xL + 0.02, y0 + LID_T - 0.001, LID_FOLD - 0.008], [xR - 0.06, y0 + LID_T + 0.0016, LID_FOLD + 0.008], M.brass, 0.0008);
  for (const z of [0.75, 1.25, 1.75]) cyl(lm, [xL - 0.002, y0 + 0.001, z - 0.032], [xL - 0.002, y0 + 0.001, z + 0.032], 0.0055, 0.0055, 14, M.brass);
  const bentAt = (z: number) => outer.filter((p) => p[0] > 0).reduce((a, p) => (Math.abs(p[1] - z) < Math.abs(a[1] - z) ? p : a));
  const pb = bentAt(0.98);
  const prop = { base: [pb[0] - G.RIM * 0.55, G.rimTop, pb[1] + 0.02] as Vec3, tipLocal: [pb[0] - 0.09, G.rimTop, pb[1] + 0.03] as Vec3 };
  const desk = musicDesk();
  // ---- pedals: brass, from the lyre's box
  const pedals: { mesh: Mesh; pivot: Vec3 }[] = [];
  for (const x of [-0.055, 0, 0.055]) {
    const p = new MeshBuilder();
    tube(p, [[x, 0.075, 0.33], [x, 0.075, 0.27], [x, 0.073, 0.22], [x, 0.068, 0.185]], 0.0065, 12, M.brass, { caps: true, flat: 0.45 });
    ellipsoid(p, [x, 0.066, 0.175], [0.017, 0.0058, 0.03], 18, M.brass);
    pedals.push({ mesh: p.build(), pivot: [x, 0.075, 0.33] });
  }
  return {
    kind: 'grand',
    sig: sigOf(keys),
    statics: [mb.build()],
    desk,
    board: sb.build(),
    boardAspect: (bz1 - bz0) / (bx1 - bx0),
    keys: geo,
    parts,
    wires: wiresOf(geo),
    lid: lm.build(),
    lidHinge: [xL, G.rimTop + 0.012, 0],
    prop,
    pedals,
    bounds: { c: [0, 0.6, 1.0], r: 1.35 },
    floorY: 0,
    src: [0, 1.0, 0.9],
  };
}

/** move the last-lathed vertices (about the origin) to (x, ·, z); `y` lifts them too */
function shiftX(mb: MeshBuilder, x: number, z: number, y = 0): void {
  // MeshBuilder has no handle on "the last part": walk back over the vertices that sit within 1 cm of
  // the y axis at the origin's x/z (lathed parts are built there)
  const v = (mb as unknown as { v: number[]; loc: number[] }).v;
  const loc = (mb as unknown as { v: number[]; loc: number[] }).loc;
  for (let i = v.length / 14 - 1; i >= 0; i--) {
    const o = i * 14;
    if (Math.abs(v[o]) > 0.0101 || Math.abs(v[o + 2]) > 0.0101) break;
    v[o] += x;
    v[o + 1] += y;
    v[o + 2] += z;
    loc[i * 3] += x;
    loc[i * 3 + 1] += y;
    loc[i * 3 + 2] += z;
  }
}
/** turn a built mesh about the y axis (positions and normals) */
function rotateMeshY(mesh: Mesh, a: number): void {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const d = mesh.data;
  for (let i = 0; i < mesh.count; i++) {
    const o = i * 14;
    for (const k of [0, 3]) {
      const x = d[o + k];
      const z = d[o + k + 2];
      d[o + k] = c * x + s * z;
      d[o + k + 2] = -s * x + c * z;
    }
  }
}
/** a brass twin-wheel caster under a leg */
function caster(mb: MeshBuilder, x: number, z: number): void {
  rbox(mb, [x - 0.03, 0.058, z - 0.03], [x + 0.03, 0.068, z + 0.03], M.brass, 0.002);
  rbox(mb, [x - 0.006, 0.03, z - 0.022], [x + 0.006, 0.06, z + 0.012], M.brass, 0.002);
  for (const s of [-1, 1]) {
    const w0 = x + s * 0.007;
    const w1 = x + s * 0.027;
    const zc = z - 0.008;
    cyl(mb, [w0, 0.03, zc], [w1, 0.03, zc], 0.03, 0.03, 22, M.brass);
    cyl(mb, [w1, 0.03, zc], [w1 + s * 0.002, 0.03, zc], 0.026, 0.018, 22, M.brass);
  }
}
/** the music desk: a panel with a shaped top, leaning back on its rail, with its ledge */
function musicDesk(): Mesh {
  const mb = new MeshBuilder();
  const W = 0.42;
  const H = 0.31;
  const prof: P2[] = [[-W, 0], [W, 0]];
  // the top: the corners rounded up into ears, the middle a shallow arch
  for (let k = 0; k <= 24; k++) {
    const t = k / 24;
    const x = W - 2 * W * t;
    const ear = Math.exp(-(((Math.abs(x) - W + 0.05) / 0.05) ** 2)) * 0.02;
    const y = H - 0.035 + 0.035 * Math.cos(Math.PI * (t - 0.5)) ** 2 * 0.6 + ear - (Math.abs(x) > W - 0.02 ? (Math.abs(x) - W + 0.02) * 1.5 : 0);
    prof.push([x, y]);
  }
  const T = new Float32Array([1, 0, 0, 0, 0, Math.cos(0.26), Math.sin(0.26), 0, 0, -Math.sin(0.26), Math.cos(0.26), 0, 0, G.rimTop + 0.035, 0.212, 1]);
  mb.with(T, () => {
    slab(mb, FRONT, prof, [], -0.009, 0.009, M.lacquer, { bevel: 0.004, smooth: 0.85 });
    // the ledge for the music, and its lip
    rbox(mb, [-W + 0.01, -0.01, -0.045], [W - 0.01, 0.006, 0.0], M.lacquer, 0.003);
    rbox(mb, [-W + 0.01, 0.006, -0.046], [W - 0.01, 0.022, -0.04], M.lacquer, 0.002);
  });
  // the desk rail it stands on, across the plate's front, on two posts
  rbox(mb, [-0.46, G.rimTop + 0.004, 0.19], [0.46, G.rimTop + 0.03, 0.24], M.lacquer, 0.005);
  for (const s of [-1, 1]) rbox(mb, [s * 0.4 - 0.02, G.plateY + 0.03, 0.2], [s * 0.4 + 0.02, G.rimTop + 0.006, 0.23], M.lacquer, 0.004);
  return mb.build();
}

/** the grand's cast-iron plate: the front web over the pin block, the bass and treble windows the
 *  strings sound over, the bass strut between them, the hitch-pin flange round the rim with its
 *  lightening holes, the tenor hitch bar, struts over the strings, agraffes, capo bar, pins and felts */
function plateGrand(mb: MeshBuilder, geo: KeyGeo[], inner: P2[], DB: Vec3): void {
  const PY = G.plateY;
  const mid = (g: KeyGeo) => g.strings[Math.floor(g.strings.length / 2)];
  const byM = (m: number) => geo[m - 21];
  const bass = geo.filter((g) => g.wound);
  const tenor = geo.filter((g) => !g.wound);
  const capoFrom = 74;
  // the web's back edge: in front of each note's agraffe and clear of its hammer
  const webEdge = (g: KeyGeo) => Math.min(mid(g).a[2] - 0.008, g.strike[2] - 0.016);
  // a string's line in plan: x at z
  const lineX = (g: KeyGeo, z: number) => {
    const s = mid(g);
    return s.a[0] + ((s.b[0] - s.a[0]) * (z - s.a[2])) / (s.b[2] - s.a[2]);
  };
  const g45 = bass[bass.length - 1];
  const g21 = bass[0];
  const g46 = tenor[0];
  const xIn = -0.74 + G.RIM + 0.006;
  const xInR = 0.74 - G.RIM - 0.006;
  // ---- windows
  const backPt = (g: KeyGeo, e: number): P2 => {
    const s = mid(g);
    const d: Vec3 = g.wound ? DB : [0, 0, 1];
    return [s.b[0] + d[0] * e, s.b[2] + d[2] * e];
  };
  // bass: front edge, the m45 string's line (right), the bass bridge's back (behind), the A0 line (left)
  const wB: P2[] = [];
  for (const g of bass) wB.push([Math.max(xIn + 0.022, mid(g).a[0] - (g === g21 ? 0.016 : 0)), webEdge(g)]);
  wB.push([mid(g45).a[0] + 0.006, webEdge(g45)]);
  const bEnd45 = backPt(g45, 0.035);
  for (let k = 1; k <= 6; k++) {
    const z = lerp(webEdge(g45), bEnd45[1], k / 6);
    wB.push([lineX(g45, z) + 0.006, z]);
  }
  for (let k = bass.length - 2; k >= 0; k--) wB.push(backPt(bass[k], 0.035));
  const bEnd21 = backPt(g21, 0.035);
  for (let k = 1; k <= 6; k++) {
    const z = lerp(bEnd21[1], webEdge(g21), k / 6);
    wB.push([Math.max(xIn + 0.022, lineX(g21, z) - 0.016), z]);
  }
  // treble: front edge, the treble side, the hitch line, then down the bass strut (the m45 line + gap)
  const xLeft = (z: number) => Math.max(mid(g46).a[0] - 0.016, lineX(g45, z) + 0.032);
  const inT = (g: KeyGeo) => backPt(g, 0.035)[0] > xLeft(backPt(g, 0.035)[1]) + 0.006;
  const tIn = tenor.filter(inT);
  const wT: P2[] = [[xLeft(webEdge(g46)), webEdge(g46)]];
  for (const g of tenor) wT.push([mid(g).a[0], webEdge(g)]);
  const gTop = tenor[tenor.length - 1];
  wT.push([Math.min(xInR - 0.03, mid(gTop).a[0] + 0.03), webEdge(gTop)]);
  wT.push([Math.min(xInR - 0.03, mid(gTop).a[0] + 0.03), backPt(gTop, 0.035)[1]]);
  for (let k = tIn.length - 1; k >= 0; k--) wT.push(backPt(tIn[k], 0.035));
  const zl = backPt(tIn[0], 0.035)[1];
  for (let k = 1; k < 12; k++) {
    const z = lerp(zl, webEdge(g46), k / 12);
    wT.push([xLeft(z), z]);
  }
  const windows = [ccw(dedupe(wB, 0.002)), ccw(dedupe(wT, 0.002))];
  // ---- the plate's outline: the rim's inner face round from the treble front to the bass front, the front edge
  const rimIn = offset(inner, 0.006);
  const outline: P2[] = dedupe([...rimIn.filter((p) => p[1] > G.plateFront + 0.01), [rimIn[rimIn.length - 1][0], G.plateFront], [rimIn[0][0], G.plateFront]], 0.004);
  // lightening holes where the flange is wide (between the rim and the windows)
  // (Steinway's "rosettes": four or five big round holes where the flange is widest)
  const holes: P2[][] = [];
  const centres: { c: P2; r: number }[] = [];
  const path = resample(rimIn, 0.02);
  const cands: { c: P2; r: number; w: number }[] = [];
  path.forEach((p, k) => {
    if (p[1] < 0.7) return;
    const a = path[Math.max(0, k - 1)];
    const c = path[Math.min(path.length - 1, k + 1)];
    const t = nrm2(c[0] - a[0], c[1] - a[1]);
    const lft: P2 = [-t[1], t[0]];
    // the width: step inwards until a window is near
    let w = 0;
    while (w < 0.5) {
      const q: P2 = [p[0] + lft[0] * w, p[1] + lft[1] * w];
      if (windows.some((W) => inPoly(q, W) || distLine(q, W, true) < 0.02)) break;
      w += 0.01;
    }
    if (w < 0.16) return;
    const r = Math.min(0.06, (w - 0.08) / 2);
    const d = 0.035 + r + (w - 0.08 - 2 * r) * 0.4;
    cands.push({ c: [p[0] + lft[0] * d, p[1] + lft[1] * d], r, w });
  });
  cands.sort((p, q) => q.w - p.w);
  for (const cd of cands) {
    if (centres.length >= 5) break;
    if (centres.some((o) => Math.hypot(o.c[0] - cd.c[0], o.c[1] - cd.c[1]) < o.r + cd.r + 0.1)) continue;
    centres.push(cd);
    holes.push(circle(cd.c[0], cd.c[1], cd.r, 36));
  }
  slab(mb, PLAN, outline, [...windows, ...holes], PY - 0.016, PY, M.pianoPlate, { bevel: 0.004, smooth: 0.6 });
  // raised lips round the windows and holes (the casting's flanges)
  for (const W of windows) slab(mb, PLAN, inset(W, -0.013), [W], PY - 0.004, PY + 0.006, M.pianoPlate, { bevel: 0.003, botBevel: false, bottom: false, smooth: 0.6 });
  for (const { c, r } of centres) slab(mb, PLAN, circle(c[0], c[1], r + 0.012, 28), [circle(c[0], c[1], r, 28)], PY - 0.004, PY + 0.007, M.pianoPlate, { bevel: 0.0035, botBevel: false, bottom: false });
  // the raised flange all round the plate's edge, where it sits on the rim, and the skirt below it
  slab(mb, PLAN, outline, [inset(outline, 0.024)], PY - 0.004, PY + 0.009, M.pianoPlate, { bevel: 0.004, botBevel: false, bottom: false, smooth: 0.6 });
  // (not across the treble window, where it would hide the action)
  const skirt = rimIn.filter((p) => p[1] > G.plateFront + 0.01 && (p[0] < 0 || p[1] > G.cutZ));
  sweepPlan(mb, skirt, [{ n: 0, y: PY - 0.016 }, { n: 0, y: PY - 0.05 }, { n: 0.006, y: PY - 0.054 }, { n: 0.014, y: PY - 0.05 }, { n: 0.014, y: PY - 0.016 }], M.pianoPlate, { smooth: 0.6 });
  // the pin block (laminated maple) under the web, its back edge the stretcher
  rbox(mb, [xIn + 0.004, 0.808, G.plateFront + 0.004], [xInR - 0.004, PY - 0.0162, 0.29], M.maple, 0.003);
  // ---- the tenor hitch bar: carries the tenor strings' hitch pins under the bass strings
  const tOut = tenor.filter((g) => !inT(g));
  if (tOut.length) {
    const front = tOut.map((g) => backPt(g, 0.035));
    const back = tOut.map((g) => backPt(g, 0.1));
    front[0] = [front[0][0] - 0.012, front[0][1]];
    back[0] = [back[0][0] - 0.012, back[0][1]];
    const zf = front[front.length - 1][1];
    const zb = back[back.length - 1][1];
    const bar: P2[] = dedupe([...front, [lineX(g45, zf) + 0.025, zf], [lineX(g45, zb) + 0.025, zb], ...back.slice().reverse()], 0.002);
    slab(mb, PLAN, bar, [], PY - 0.014, PY + 0.002, M.pianoPlate, { bevel: 0.004 });
  }
  // ---- struts over the strings (oval beams rising from the web to clear the dampers), with feet
  // (a flat bar with raised edges, as cast; it rises off the web, clears the dampers, comes down onto the flange)
  const SEC: SecPt[] = [
    { n: -0.021, y: 0 }, { n: 0.021, y: 0 }, { n: 0.021, y: 0.011 }, { n: 0.0185, y: 0.0165 }, { n: 0.014, y: 0.0165 }, { n: 0.0125, y: 0.0095 }, { n: -0.0125, y: 0.0095 }, { n: -0.014, y: 0.0165 }, { n: -0.0185, y: 0.0165 }, { n: -0.021, y: 0.011 },
  ];
  const strut = (p0: P2, p1: P2, top: number) => {
    const n = 24;
    const path: P2[] = [];
    const yOff: number[] = [];
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const rise = Math.min(1, t / 0.14, (1 - t) / 0.12);
      const e = rise < 1 ? 0.5 - 0.5 * Math.cos(Math.PI * rise) : 1;
      path.push([lerp(p0[0], p1[0], t), lerp(p0[1], p1[1], t)]);
      yOff.push(lerp(PY - 0.006, top - 0.0165, e));
    }
    sweepPlan(mb, path, SEC, M.pianoPlate, { yOff, smooth: 0.6 });
    // the feet: the bar spreads into the web and the flange
    for (const p of [p0, p1]) slab(mb, PLAN, circle(p[0], p[1], 0.03, 24), [], PY - 0.004, PY + 0.008, M.pianoPlate, { bevel: 0.006, botBevel: false });
  };
  // the bass strut: along the gap between the windows, over the tenor strings
  {
    const z0 = webEdge(g45) - 0.01;
    const z1 = backPt(tIn[0], 0.05)[1];
    strut([lineX(g45, z0) + 0.019, z0], [lineX(g45, z1) + 0.019, z1], 0.948);
  }
  for (const [ma, ang] of [[58, 0.06], [70, 0.16], [84, 0.3]] as [number, number][]) {
    const g0 = byM(ma);
    const g1 = byM(ma + 1);
    const x0 = (g0.strike[0] + g1.strike[0]) / 2;
    const z0 = Math.min(webEdge(g0), webEdge(g1)) - 0.01;
    // run back at an angle until the flange (out of the treble window)
    let t = 0.1;
    while (t < 2 && inPoly([x0 + Math.sin(ang) * t, z0 + Math.cos(ang) * t], windows[1]) === inPoly([x0 + Math.sin(ang) * (t - 0.05), z0 + Math.cos(ang) * (t - 0.05)], windows[1])) t += 0.01;
    // continue past the window's back edge a little
    t += 0.06;
    strut([x0, z0], [x0 + Math.sin(ang) * t, z0 + Math.cos(ang) * t], 0.942);
  }
  // ---- capo bar over the treble strings (it starts the speaking length), agraffes below it
  {
    const caps = geo.filter((g) => g.midi >= capoFrom);
    const pts = caps.map((g) => [mid(g).a[0], mid(g).a[2]] as P2);
    pts.unshift([pts[0][0] - 0.02, pts[0][1] - 0.002]);
    pts.push([Math.min(xInR - 0.01, pts[pts.length - 1][0] + 0.03), pts[pts.length - 1][1] + 0.001]);
    const y = G.strY + 0.0006;
    sweepPlan(mb, pts, [{ n: 0.002, y }, { n: 0.002, y: y + 0.012 }, { n: -0.006, y: y + 0.022 }, { n: -0.026, y: y + 0.022 }, { n: -0.032, y: y + 0.012 }, { n: -0.032, y }], M.pianoPlate, { smooth: 0.7 });
    const pe = pts[pts.length - 1];
    slab(mb, PLAN, circle(pe[0], pe[1] - 0.014, 0.018, 16), [], PY - 0.004, y + 0.012, M.pianoPlate, { bevel: 0.004 });
  }
  for (const g of geo) {
    if (g.midi >= capoFrom) continue;
    const s0 = g.strings[0];
    const s1 = g.strings[g.strings.length - 1];
    rbox(mb, [Math.min(s0.a[0], s1.a[0]) - 0.003, PY - 0.002, s0.a[2] - 0.009], [Math.max(s0.a[0], s1.a[0]) + 0.003, s0.a[1] + 0.004, s0.a[2] + 0.0005], M.brassDull, 0.0012);
  }
  // ---- tuning pins (blued steel in the pin block, a bright coil of wire round each), hitch pins
  for (const g of geo)
    for (const s of g.strings) {
      tuningPin(mb, [s.pin[0], PY - 0.004, s.pin[2]], [0, 1, 0]);
      const [hx, , hz] = s.hitch;
      cyl(mb, [hx, PY - 0.002, hz], [hx, PY + 0.016, hz], 0.0021, 0.0019, 6, M.pinSteel);
    }
  // ---- felts: the red understring felt between the pins and the speaking length (treble), and the
  //      hitch felt woven along the hitch pins
  {
    const tre = geo.filter((g) => g.midi >= 52);
    const line = tre.map((g) => [mid(g).a[0], webEdge(g) - 0.03] as P2);
    sweepPlan(mb, line, [{ n: -0.007, y: PY }, { n: 0.007, y: PY }, { n: 0.006, y: G.strY - 0.0012 }, { n: -0.006, y: G.strY - 0.0012 }], M.redFelt, { smooth: 0.5 });
    const hl = tIn.map((g) => backPt(g, 0.052));
    sweepPlan(mb, hl, [{ n: -0.006, y: PY + 0.004 }, { n: 0.006, y: PY + 0.004 }, { n: 0.005, y: G.strY - 0.0012 }, { n: -0.005, y: G.strY - 0.0012 }], M.redFelt, { smooth: 0.5 });
    const bl = bass.map((g) => backPt(g, 0.052)).reverse();
    sweepPlan(mb, bl, [{ n: -0.006, y: PY + 0.004 }, { n: 0.006, y: PY + 0.004 }, { n: 0.005, y: G.bassBrY - 0.0012 }, { n: -0.005, y: G.bassBrY - 0.0012 }], M.redFelt, { smooth: 0.5 });
  }
  // ---- the plate's bolts (nickel nuts on bosses) at the struts' feet and round the web
  for (const [x, z] of [[-0.45, 0.235], [0.05, 0.235], [0.5, 0.235], [-0.2, 0.235]] as P2[]) {
    slab(mb, PLAN, circle(x, z, 0.013, 14), [], PY - 0.002, PY + 0.006, M.pianoPlate, { bevel: 0.003 });
    lathe(mb, [[0, 0], [0.008, 0], [0.008, 0.012], [0.006, 0.014], [0, 0.014]].map(([r, y]): P2 => [r, y]), 6, M.nickel);
    shiftX(mb, x, z, PY + 0.006);
  }
}

// ================================================================ upright
const U = {
  keyLen: 0.42,
  balZ: 0.215,
  pivY: 0.698,
  stickTop: 0.722,
  capZ: 0.335,
  capH: 0.041,
  wipZ: 0.433,
  wipY: 0.78,
  jackZ: 0.375,
  buttZ: 0.385,
  buttY: 0.865,
  knR: 0.01,
  shank: 0.152,
  strZ: 0.478,
  bassStrZ: 0.47,
  plateZ: 0.488,
  boardZ: 0.535,
  back: 0.585,
  top: 1.21,
  dampZ: 0.438,
  dampY: 0.88,
  blow: 0.045,
  letoff: 0.003,
  dip: 0.01,
};
export function buildUprightModel(keys: KeySummary[]): PianoModel {
  const geo: KeyGeo[] = [];
  const yStrike = U.buttY + U.shank;
  const CROSS = 0.3; // the bass strings lean towards the treble at the bottom
  const DB: Vec3 = [Math.sin(CROSS), -Math.cos(CROSS), 0];
  const stick = keyStick(U.keyLen, U.capZ, U.capH, false, U.stickTop, U.pivY);
  for (const k of keys) {
    const m = k.midi;
    const i = m - 21;
    const wound = isWound(k);
    const L = Math.min(1.12, Math.max(0.04, k.lengthM));
    const beta = strikeBeta(m);
    const z = wound ? U.bassStrZ : U.strZ;
    const dir: Vec3 = wound ? DB : [0, -1, 0];
    const xs = actX(m);
    const strike: Vec3 = [xs, yStrike, z];
    const n = Math.max(1, k.nStrings);
    const sp = wound ? 0.0042 : 0.0034;
    const strings: StringRun[] = [];
    for (let j = 0; j < n; j++) {
      const dx = (j - (n - 1) / 2) * sp;
      const a: Vec3 = [strike[0] + dx - dir[0] * beta * L, strike[1] - dir[1] * beta * L, z];
      const b: Vec3 = [a[0] + dir[0] * L, a[1] + dir[1] * L, z];
      // the pins in the block above the agraffes, staggered
      const pin: Vec3 = [a[0], Math.min(1.172, a[1] + 0.028 + 0.016 * j + (wound ? 0 : 0.008 * (i % 2))), U.plateZ - 0.012];
      const hitch: Vec3 = [b[0] + dir[0] * 0.06, b[1] + dir[1] * 0.06, U.plateZ - 0.006];
      strings.push({ pin, a, b, hitch });
    }
    const damper: Vec3 | null = k.hasDamper ? [strike[0] - dir[0] * 0.035, strike[1] + 0.035, z] : null;
    const hs = 1.15 - 0.3 * ((m - 21) / 87);
    // the head's depth from the shank to the crown (48 mm, less where the bass strings come nearer)
    const depth = Math.min(0.048, z - U.blow - U.buttZ);
    geo.push({ midi: m, i, k, wound, strings, strike, damper, hs, hy: depth / 0.048, blow: z - U.buttZ - depth, key: keyTop(m), xc: keyX3(m), shear: shearOf(keyX3(m), xs, 0.1, U.keyLen) });
  }
  const xL = -0.765;
  const xR = 0.765;
  const mb = new MeshBuilder();
  // ---- the case: sides (full height), arms at the keyboard, legs on toe blocks, top, back posts,
  //      kneeboard, toe rail
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? xL : xR - 0.026;
    const x1 = s < 0 ? xL + 0.026 : xR;
    sideSlab(mb, [[0.1, 0.0], [U.back, 0.0], [U.back, U.top - 0.025], [0.03, U.top - 0.025], [0.03, 0.8], [0.1, 0.66]], x0, x1, M.lacquer, 0.004);
    // the arm (key cheek): a block with a rounded front
    const ax0 = s < 0 ? xL : 0.613;
    const ax1 = s < 0 ? -0.613 : xR;
    const prof: P2[] = [[-0.045, 0.655], [0.16, 0.655], [0.16, 0.8]];
    for (let k = 0; k <= 8; k++) {
      const a = (Math.PI / 2) * (k / 8);
      prof.push([0.0 - 0.045 * Math.sin(a), 0.755 + 0.045 * Math.cos(a)]);
    }
    sideSlab(mb, prof, ax0, ax1, M.lacquer, 0.005);
    // the leg under the arm and its toe block
    const lx = s < 0 ? xL + 0.045 : xR - 0.045;
    post(mb, lx, -0.005, [[0.022, 0.022, 0.045], [0.019, 0.019, 0.08], [0.024, 0.024, 0.58], [0.032, 0.032, 0.62], [0.032, 0.032, 0.655]], 0.004, M.lacquer);
    rbox(mb, [lx - 0.034, 0.0, -0.075], [lx + 0.034, 0.045, 0.12], M.lacquer, 0.006);
    // the console: a cove bracket from the leg up under the arm's front
    const cove: P2[] = [[-0.045, 0.655], [0.027, 0.655], [0.027, 0.575]];
    for (let k = 1; k < 10; k++) {
      const a = (k / 10) * (Math.PI / 2);
      cove.push([-0.045 + 0.072 * Math.cos(a), 0.575 + 0.072 * Math.sin(a)]);
    }
    sideSlab(mb, cove, lx - 0.026, lx + 0.026, M.lacquer, 0.004);
  }
  // top (overhanging, rounded front edge) and the top front rail above the action
  slab(mb, PLAN, rrect(xL - 0.012, 0.012, xR + 0.012, U.back + 0.012, 0.012), [], U.top - 0.025, U.top, M.lacquer, { bevel: 0.008 });
  rbox(mb, [xL + 0.026, U.top - 0.075, 0.03], [xR - 0.026, U.top - 0.025, 0.05], M.lacquer, 0.004);
  box3(mb, [xL + 0.026, 0.04, U.back - 0.022], [xR - 0.026, U.top - 0.025, U.back], M.lacquerSatin);
  // kneeboard (the lower front panel, a raised field) and the toe rail
  slab(mb, FRONT, rrect(xL + 0.026, 0.085, xR - 0.026, 0.652, 0.002), [], 0.09, 0.11, M.lacquer, { bevel: 0.003 });
  slab(mb, FRONT, rrect(xL + 0.1, 0.16, xR - 0.1, 0.6, 0.01), [], 0.085, 0.091, M.lacquer, { bevel: 0.004, bottom: false });
  rbox(mb, [xL + 0.026, 0.0, 0.07], [xR - 0.026, 0.085, 0.12], M.lacquer, 0.005);
  // keybed, key slip, key frame
  rbox(mb, [xL + 0.026, 0.655, -0.045], [xR - 0.026, 0.682, 0.44], M.lacquer, 0.003);
  rbox(mb, [-0.613, 0.682, -0.024], [0.613, 0.708, -0.004], M.lacquer, 0.002);
  rbox(mb, [-0.612, 0.682, 0.004], [0.612, 0.692, 0.03], M.actionWood, 0.001);
  rbox(mb, [-0.612, 0.692, 0.008], [0.612, 0.6935, 0.026], M.redFelt, 0.0004);
  rbox(mb, [-0.612, 0.682, U.balZ - 0.011], [0.612, 0.698, U.balZ + 0.011], M.actionWood, 0.0015);
  rbox(mb, [-0.612, 0.682, 0.385], [0.612, 0.694, 0.42], M.actionWood, 0.0015);
  rbox(mb, [-0.612, 0.694, 0.385], [0.612, 0.698, 0.42], M.greenFelt, 0.0008);
  // the fall rail over the key ends (the fallboard is off with the upper panel)
  sideSlab(mb, [[0.148, 0.728], [0.175, 0.728], [0.19, 0.745], [0.19, 0.79], [0.165, 0.795], [0.148, 0.78]], -0.613, 0.613, M.lacquer, 0.004);
  rbox(mb, [-0.613, 0.722, 0.146], [0.613, 0.729, 0.18], M.redFelt, 0.001);
  // pedals (three, brass) through the toe rail
  const pedals: { mesh: Mesh; pivot: Vec3 }[] = [];
  for (const x of [-0.06, 0, 0.06]) {
    const p = new MeshBuilder();
    tube(p, [[x, 0.06, 0.13], [x, 0.06, 0.07], [x, 0.058, 0.02], [x, 0.054, -0.01]], 0.006, 12, M.brass, { caps: true, flat: 0.45 });
    ellipsoid(p, [x, 0.053, -0.02], [0.016, 0.0055, 0.028], 18, M.brass);
    pedals.push({ mesh: p.build(), pivot: [x, 0.06, 0.13] });
  }
  // ---- soundboard and back posts
  const ub = new MeshBuilder();
  const ux0 = xL + 0.03;
  const ux1 = xR - 0.03;
  const uy0 = 0.08;
  const uy1 = 1.16;
  slab(ub, FRONT, [[ux0, uy0], [ux1, uy0], [ux1, uy1], [ux0, uy1]], [], U.boardZ, U.boardZ + 0.009, M.spruce, { uv: (x, y) => [(x - ux0) / (ux1 - ux0), (y - uy0) / (uy1 - uy0)] });
  for (const x of [-0.45, -0.15, 0.15, 0.45]) box3(mb, [x - 0.03, 0.04, U.boardZ + 0.03], [x + 0.03, U.top - 0.025, U.back - 0.022], M.spruceBare);
  rbox(mb, [xL + 0.03, 1.08, U.plateZ + 0.012], [xR - 0.03, U.top - 0.03, U.boardZ + 0.02], M.maple, 0.002);
  // bridges on the soundboard
  const mid = (g: KeyGeo) => g.strings[Math.floor(g.strings.length / 2)];
  const ubr = (gs: KeyGeo[], zf: number) => {
    const pts = gs.filter((_, i) => i % 3 === 0 || i === gs.length - 1).map((g) => mid(g).b);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.006;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const q = (u: number, v: number): P2 => [a[0] + c * u - s * v, a[1] + s * u + c * v];
      slab(mb, FRONT, [q(-0.003, -0.012), q(l, -0.012), q(l, 0.012), q(-0.003, 0.012)], [], zf + 0.002, U.boardZ, M.maple, { bevel: 0.002 });
    }
  };
  const bassU = geo.filter((g) => g.wound);
  const trebU = geo.filter((g) => !g.wound);
  ubr(trebU, U.strZ);
  ubr(bassU, U.bassStrZ);
  // ---- the plate (behind the strings): the pin field at the top, the windows, the bass strut, a
  //      pressure bar over the treble, agraffes, pins
  {
    const PZ = U.plateZ;
    const lineX = (g: KeyGeo, y: number) => {
      const s = mid(g);
      return s.a[0] + ((s.b[0] - s.a[0]) * (y - s.a[1])) / (s.b[1] - s.a[1]);
    };
    const g21 = bassU[0];
    const g45 = bassU[bassU.length - 1];
    const g46 = trebU[0];
    const px0 = xL + 0.05;
    const px1 = xR - 0.05;
    const topE = (g: KeyGeo) => mid(g).a[1] + 0.006;
    const botE = (g: KeyGeo) => mid(g).b[1] - 0.035;
    const wB: P2[] = [];
    for (const g of bassU) wB.push([Math.max(px0 + 0.02, mid(g).a[0] - (g === g21 ? 0.016 : 0)), topE(g)]);
    wB.push([mid(g45).a[0] + 0.006, topE(g45)]);
    for (let k = 1; k <= 6; k++) {
      const y = lerp(topE(g45), botE(g45), k / 6);
      wB.push([lineX(g45, y) + 0.006, y]);
    }
    for (let k = bassU.length - 2; k >= 0; k--) wB.push([mid(bassU[k]).b[0], botE(bassU[k])]);
    for (let k = 1; k <= 6; k++) {
      const y = lerp(botE(g21), topE(g21), k / 6);
      wB.push([Math.max(px0 + 0.02, lineX(g21, y) - 0.016), y]);
    }
    const xLeft = (y: number) => Math.max(mid(g46).a[0] - 0.016, lineX(g45, y) + 0.032);
    const tIn = trebU.filter((g) => mid(g).b[0] > xLeft(botE(g)) + 0.006);
    const wT: P2[] = [[xLeft(topE(g46)), topE(g46)]];
    for (const g of trebU) wT.push([mid(g).a[0], topE(g)]);
    const gTop = trebU[trebU.length - 1];
    wT.push([px1 - 0.03, topE(gTop)], [px1 - 0.03, botE(gTop)]);
    for (let k = tIn.length - 1; k >= 0; k--) wT.push([mid(tIn[k]).b[0], botE(tIn[k])]);
    const yl = botE(tIn[0]);
    for (let k = 1; k < 12; k++) {
      const y = lerp(yl, topE(g46), k / 12);
      wT.push([xLeft(y), y]);
    }
    const windows = [ccw(dedupe(wB, 0.002)), ccw(dedupe(wT, 0.002))];
    const outline: P2[] = [[px0, 0.07], [px1, 0.07], [px1, 1.13], [px1 - 0.05, 1.18], [px0 + 0.05, 1.18], [px0, 1.13]];
    slab(mb, FRONT, outline, windows, PZ, PZ + 0.016, M.pianoPlate, { bevel: 0.004, smooth: 0.6 });
    for (const W of windows) slab(mb, FRONT, inset(W, -0.012), [W], PZ - 0.006, PZ + 0.004, M.pianoPlate, { bevel: 0.003, botBevel: false, smooth: 0.6 });
    // pressure bar over the treble (nickel, screwed through), agraffes for the rest
    const pb = trebU.filter((g) => g.midi >= 74).map((g) => [mid(g).a[0], mid(g).a[1]] as P2);
    for (let k = 0; k < pb.length - 1; k += 3) {
      const a = pb[k];
      const b = pb[Math.min(pb.length - 1, k + 3)];
      slab(mb, FRONT, [[a[0] - 0.004, a[1] - 0.001], [b[0] + 0.004, b[1] - 0.001], [b[0] + 0.004, b[1] + 0.016], [a[0] - 0.004, a[1] + 0.016]], [], U.strZ - 0.012, U.strZ - 0.0015, M.nickel, { bevel: 0.0015 });
    }
    for (let k = 0; k < pb.length; k += 6) cyl(mb, [pb[k][0], pb[k][1] + 0.008, U.strZ - 0.012], [pb[k][0], pb[k][1] + 0.008, U.strZ - 0.016], 0.004, 0.0035, 10, M.nickel);
    for (const g of geo) {
      if (g.midi >= 74) continue;
      const s0 = g.strings[0];
      const s1 = g.strings[g.strings.length - 1];
      rbox(mb, [Math.min(s0.a[0], s1.a[0]) - 0.003, s0.a[1] - 0.0005, s0.a[2] - 0.006], [Math.max(s0.a[0], s1.a[0]) + 0.003, s0.a[1] + 0.009, PZ], M.brassDull, 0.0012);
    }
    for (const g of geo)
      for (const s of g.strings) {
        tuningPin(mb, [s.pin[0], s.pin[1], PZ + 0.004], [0, 0, -1]);
        const [hx, hy] = s.hitch;
        cyl(mb, [hx, hy, PZ], [hx, hy, PZ - 0.016], 0.0021, 0.0019, 6, M.pinSteel);
      }
    // the red felt between the pins and the speaking length
    for (let k = 0; k < trebU.length - 1; k += 4) {
      const a = mid(trebU[k]).a;
      const b = mid(trebU[Math.min(trebU.length - 1, k + 4)]).a;
      slab(mb, FRONT, [[a[0] - 0.005, a[1] + 0.017], [b[0] + 0.005, b[1] + 0.017], [b[0] + 0.005, b[1] + 0.024], [a[0] - 0.005, a[1] + 0.024]], [], U.strZ + 0.0012, PZ, M.redFelt, { bevel: 0.002 });
    }
  }
  // ---- action: brackets (gold-painted castings), the main rail, damper rail, let-off rail
  for (const x of [-0.61, -0.305, 0.0, 0.305, 0.61]) {
    const prof: P2[] = [[0.36, 0.698], [0.47, 0.698], [0.47, 0.72], [0.452, 0.78], [0.468, 0.86], [0.47, 1.0], [0.484, 1.06], [0.484, 1.09], [0.458, 1.09], [0.448, 1.0], [0.44, 0.9], [0.425, 0.79], [0.39, 0.73], [0.36, 0.72]];
    slab(mb, SIDE, prof, [rrect(0.44, 0.94, 0.455, 1.03, 0.006, 2)], x - 0.006, x + 0.006, M.pianoPlate, { bevel: 0.002 });
  }
  // main rail, damper rail (behind the damper levers: the pedal swings them off), let-off rail
  rbox(mb, [-0.62, 0.815, 0.398], [0.62, 0.848, 0.424], M.actionWood, 0.002);
  rbox(mb, [-0.62, 0.89, 0.448], [0.62, 0.905, 0.462], M.actionWood, 0.0015);
  rbox(mb, [-0.62, 0.822, 0.352], [0.62, 0.832, 0.372], M.actionWood, 0.0015);
  for (const g of geo) {
    const x = g.strike[0];
    // butt flange and wippen flange on the main rail, the let-off button over the jack's toe
    rbox(mb, [x - 0.0045, 0.85, 0.383], [x + 0.0045, 0.866, 0.405], M.hornbeam, 0.001);
    rbox(mb, [x - 0.0045, 0.78, 0.426], [x + 0.0045, 0.815, 0.44], M.hornbeam, 0.001);
    lathe(mb, [[0, 0.0], [0.0035, 0.0], [0.0035, 0.006], [0.0, 0.006]].map(([r, y]): P2 => [r, y]), 8, M.redFelt);
    shiftX(mb, x, 0.362, 0.816);
  }
  // ---- parts
  const parts: Record<string, Mesh> = { stick };
  {
    // wippen (pivot at its back on the main rail, the body forward to the capstan): heel, jack flange,
    // backcheck wire and backcheck at the front, the spoon behind, the bridle wire
    const w = new MeshBuilder();
    sideSlab(w, [[0.008, -0.008], [0.008, 0.006], [-0.03, 0.012], [-0.06, 0.012], [-0.112, 0.006], [-0.118, -0.002], [-0.11, -0.012], [-0.06, -0.012]], -0.0045, 0.0045, M.hornbeam, 0.0012);
    rbox(w, [-0.0046, -0.017, -0.106], [0.0046, -0.011, -0.09], M.buckskin, 0.0015);
    rbox(w, [-0.0047, 0.006, -0.066], [0.0047, 0.016, -0.05], M.hornbeam, 0.001);
    cyl(w, [0, 0.006, -0.1], [0, 0.068, -0.108], 0.0011, 0.0011, 6, M.brassDull, false);
    sideSlab(w, [[-0.116, 0.062], [-0.102, 0.062], [-0.1, 0.084], [-0.114, 0.086]], -0.004, 0.004, M.hornbeam, 0.001);
    sideSlab(w, [[-0.1, 0.064], [-0.097, 0.064], [-0.095, 0.083], [-0.1, 0.084]], -0.0041, 0.0041, M.redFelt, 0.0005);
    tube(w, [[0, 0.004, 0.004], [0, 0.03, 0.014], [0, 0.058, 0.01]], 0.0014, 6, M.nickel);
    cyl(w, [0.0042, 0.012, -0.09], [0.0042, 0.07, -0.098], 0.0006, 0.0006, 5, M.brassDull, false);
    parts.wippen = w.build();
    const j = new MeshBuilder();
    sideSlab(j, [[-0.0035, 0], [0.0035, 0], [0.0035, 0.068], [-0.0035, 0.068], [-0.0035, 0.024], [-0.013, 0.02], [-0.013, 0.014], [-0.0035, 0.014]], -0.0036, 0.0036, M.hornbeam, 0.0008);
    parts.jack = j.build();
    // hammer (pivot on the butt flange): butt, its buckskin, the catcher towards the player, the shank
    const s = new MeshBuilder();
    sideSlab(s, [[-0.014, -0.011], [0.013, -0.011], [0.014, 0.004], [0.008, 0.017], [-0.012, 0.017], [-0.015, 0.004]], -0.0048, 0.0048, M.hornbeam, 0.0015);
    rbox(s, [-0.0049, -0.0135, -0.014], [0.0049, -0.0105, 0.0], M.buckskin, 0.001);
    cyl(s, [0, 0.003, -0.013], [0, 0.0, -0.034], 0.0018, 0.0018, 8, M.hornbeam, false);
    ellipsoid(s, [0, -0.002, -0.037], [0.0048, 0.009, 0.0045], 12, M.greenFelt);
    cyl(s, [0, 0.015, 0], [0, U.shank - 0.006, 0.0], 0.0036, 0.0033, 12, M.hornbeam);
    parts.shank = s.build();
    parts.head = hammerHead(true);
    // damper lever (pivot on the damper flange): lever up behind the hammer, its spring and wire, the head
    const d = new MeshBuilder();
    sideSlab(d, [[-0.005, -0.03], [0.006, -0.03], [0.007, 0.1], [-0.004, 0.1]], -0.004, 0.004, M.actionWood, 0.001);
    rbox(d, [-0.0041, -0.03, -0.008], [0.0041, -0.014, -0.005], M.redFelt, 0.001);
    cyl(d, [0.0, 0.097, 0.002], [0.0, 0.165, 0.026], 0.001, 0.001, 6, M.brassDull, false);
    rbox(d, [-0.0062, 0.158, 0.02], [0.0062, 0.186, 0.034], M.maple, 0.0012);
    rbox(d, [-0.006, 0.16, 0.034], [0.006, 0.184, 0.04], M.damperFelt, 0.0012);
    parts.damper = d.build();
    // the hammer rail (moves with the soft pedal): its felt faces the shanks
    const hr = new MeshBuilder();
    rbox(hr, [-0.62, 0.932, 0.36], [0.62, 0.952, 0.378], M.actionWood, 0.002);
    rbox(hr, [-0.62, 0.934, 0.378], [0.62, 0.95, 0.3814], M.greenFelt, 0.001);
    parts.hamRail = hr.build();
  }
  return {
    kind: 'upright',
    sig: sigOf(keys),
    statics: [mb.build()],
    desk: null,
    board: ub.build(),
    boardAspect: (uy1 - uy0) / (ux1 - ux0),
    keys: geo,
    parts,
    wires: wiresOf(geo),
    lid: null,
    lidHinge: [0, 0, 0],
    prop: null,
    pedals,
    bounds: { c: [0, 0.62, 0.28], r: 1.0 },
    floorY: 0,
    src: [0, 1.1, 0.3],
  };
}
/** a plain box (for faces nobody sees edge-on: the case back) */
function box3(mb: MeshBuilder, lo: Vec3, hi: Vec3, m: Mat): void {
  slab(mb, PLAN, [[lo[0], lo[2]], [hi[0], lo[2]], [hi[0], hi[2]], [lo[0], hi[2]]], [], lo[1], hi[1], m);
}

// ================================================================ posing, per frame
export interface PianoPose {
  keyPos: Float32Array;
  /** smoothed jack escape per key (0 under the knuckle … 1 tripped) */
  jack: Float32Array;
  /** whether the jack has tripped at let-off (it resets as the key rises) */
  trip: Uint8Array;
  pedal: [number, number];
}
export const newPianoPose = (): PianoPose => ({ keyPos: new Float32Array(88), jack: new Float32Array(88), trip: new Uint8Array(88), pedal: [0, 0] });

export interface PianoIn {
  piano: PianoState;
  keys: KeySummary[];
  dt: number;
  lid: number;
  down: (m: number) => boolean;
  sounding: (m: number) => boolean;
  lite: boolean;
}

const C = {
  verm: (a: number) => ink(INK.vermilion, a),
  amber: (a: number) => ink(INK.amber, a),
};

function ptsOf(keys: KeySummary[]): Pt[] {
  return keys.map((k) => ({ midi: k.midi, i: k.midi - 21, x: actX(k.midi), w: PITCH, L: k.lengthM, k, wound: isWound(k) }));
}

/** ease towards a target with a time constant (s), frame-rate independent */
const ease = (v: number, target: number, dt: number, tau: number) => v + (target - v) * (1 - Math.exp(-dt / tau));

// scratch matrices (the batch copies each instance's matrix, so they are reused)
const MS = Array.from({ length: 10 }, () => new Float32Array(16));
/** o = translate(x, y, z) · rotX(a) · scale(sx, sy, sz) */
function trs(o: Mat4, x: number, y: number, z: number, a: number, sx = 1, sy = 1, sz = 1): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  o[0] = sx;
  o[1] = 0;
  o[2] = 0;
  o[3] = 0;
  o[4] = 0;
  o[5] = c * sy;
  o[6] = s * sy;
  o[7] = 0;
  o[8] = 0;
  o[9] = -s * sz;
  o[10] = c * sz;
  o[11] = 0;
  o[12] = x;
  o[13] = y;
  o[14] = z;
  o[15] = 1;
  return o;
}
/** o = a · b (o must not be a or b) */
function mul4(o: Mat4, a: Mat4, b: Mat4): Mat4 {
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
/** rotation a about the x-parallel axis through (·, py, pz) */
function aboutX(o: Mat4, py: number, pz: number, a: number): Mat4 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return trs(o, 0, py - (c * py - s * pz), pz - (s * py + c * pz), a);
}

const GLOW_HELD: RGBA = [0.95, 0.65, 0.27, 0.12];
const GLOW_JACK: RGBA = [1, 0.37, 0.22, 0.25];
const GLOW_DAMP: RGBA = [0.95, 0.65, 0.27, 0.18];
const headGlow: RGBA = [1, 0.37, 0.22, 0];

export function posePiano(b: Batch, pm: PianoModel, si: PianoIn, pose: PianoPose): void {
  const ps = si.piano;
  stepAction(ptsOf(si.keys), ps);
  for (const s of pm.statics) b.mesh(s);
  if (pm.desk) b.mesh(pm.desk);
  b.mesh(pm.board);
  const grand = pm.kind === 'grand';
  const P = pm.parts;
  const A = grand ? G : U;
  for (const g of pm.keys) {
    const i = g.i;
    const held = si.down(g.midi);
    pose.keyPos[i] = ease(pose.keyPos[i], held ? 1 : 0, si.dt, held ? 0.018 : 0.04);
    const kp = pose.keyPos[i];
    const sounding = si.sounding(g.midi);
    const hr = ps.hammer[i]; // 0 rest … 1 at the string (the stage's action state, from the engine's strikes)
    const glow = sounding ? VERM : held ? GLOW_HELD : null;
    // the key rocks on its balance pin (front down)
    const kA = (kp * A.dip) / A.balZ;
    const R = aboutX(MS[0], A.pivY, A.balZ, -kA);
    b.mesh(g.key, mul4(MS[1], R, trs(MS[2], g.xc, 0, 0, 0)), glow);
    b.mesh(P.stick, mul4(MS[1], R, g.shear), glow);
    // the linked rig: the capstan lifts the wippen; the wippen lifts the jack; the jack drives the
    // hammer through its knuckle (grand) or butt (upright) until let-off, where it trips and the
    // hammer flies free on the stage's action state (strike, rebound, check)
    const capRise = kA * (A.capZ - A.balZ);
    const wA = capRise / (A.wipZ - A.capZ);
    const jackRise = wA * (A.wipZ - A.jackZ);
    const lever = grand ? G.shankLen : U.shank;
    const jackTravel = (jackRise / A.knR) * lever;
    const free = g.blow - A.letoff;
    if (!pose.trip[i] && (jackTravel >= free || hr > 0.45)) pose.trip[i] = 1;
    else if (pose.trip[i] && kp < 0.3 && hr < 0.3) pose.trip[i] = 0;
    pose.jack[i] = ease(pose.jack[i], pose.trip[i], si.dt, 0.012);
    const travel = pose.trip[i] ? hr * g.blow : Math.max(Math.min(jackTravel, free), hr * g.blow);
    if (si.lite && g.midi % 2 && !held && hr < 0.05 && kp < 0.02) continue;
    const x = g.strike[0];
    headGlow[3] = 0.6 * hr;
    const jg = hr > 0.05 && pose.jack[i] < 0.5 ? GLOW_JACK : null;
    if (grand) {
      const W = trs(MS[3], x, G.wipY, G.wipZ, wA);
      b.mesh(P.wippen, W);
      b.mesh(P.jack, mul4(MS[5], W, trs(MS[4], 0, 0.004, G.jackZ - G.wipZ, 0.28 * pose.jack[i])), jg);
      // the repetition lever rides the wippen and, once the jack has tripped, holds the knuckle up
      b.mesh(P.rep, mul4(MS[5], W, trs(MS[4], 0, 0.028, -0.045, -0.06 * pose.jack[i] * Math.min(1, kp * 2))));
      const sA = Math.atan2(travel, G.shankLen);
      const S = trs(MS[6], x, G.hamY, G.hamZ, -sA);
      b.mesh(P.shank, S);
      b.mesh(P.head, mul4(MS[8], S, trs(MS[7], 0, 0, G.shankLen, 0, 1, g.hy, g.hs)), hr > 0.6 ? headGlow : null);
      // damper: the underlever lifted by the key's tail (or the pedal's rail), the head off the strings
      if (g.damper) {
        const lift = ps.damper[i] * 0.0095;
        b.mesh(P.under, trs(MS[3], g.damper[0], G.ulY, G.ulPivotZ, lift / (G.ulPivotZ - G.damperZ)));
        b.mesh(g.wound ? P.damperB : P.damperT, trs(MS[3], g.damper[0], g.damper[1] + 0.0012 + lift, g.damper[2], 0), ps.damper[i] > 0.3 ? GLOW_DAMP : null);
      }
    } else {
      const W = trs(MS[3], x, U.wipY, U.wipZ, wA);
      b.mesh(P.wippen, W);
      b.mesh(P.jack, mul4(MS[5], W, trs(MS[4], 0, 0.006, U.jackZ - U.wipZ, -0.22 * pose.jack[i])), jg);
      // the soft pedal brings the hammers' rest position nearer the strings (the rail moves)
      const rest = pose.pedal[0] * 0.09;
      const hA = Math.max(rest, Math.asin(Math.min(0.95, travel / U.shank)));
      const S = trs(MS[6], x, U.buttY, U.buttZ, hA);
      b.mesh(P.shank, S);
      b.mesh(P.head, mul4(MS[8], S, trs(MS[7], 0, U.shank, 0, 0, 1, g.hs, g.hy)), hr > 0.6 ? headGlow : null);
      if (g.damper) {
        const off = ps.damper[i];
        b.mesh(P.damper, trs(MS[3], g.damper[0], U.dampY, U.dampZ + g.strike[2] - U.strZ, -off * 0.05), off > 0.3 ? GLOW_DAMP : null);
      }
    }
  }
  // pedals: soft (left) and sustain (right) from the engine
  pose.pedal[0] = ease(pose.pedal[0], ps.soft, si.dt, 0.05);
  pose.pedal[1] = ease(pose.pedal[1], ps.sustain, si.dt, 0.05);
  if (P.hamRail) b.mesh(P.hamRail, trs(MS[3], 0, 0, pose.pedal[0] * 0.012, 0));
  pm.pedals.forEach((p, k) => {
    const v = k === 0 ? pose.pedal[0] : k === pm.pedals.length - 1 ? pose.pedal[1] : 0;
    b.mesh(p.mesh, aboutX(MS[3], p.pivot[1], p.pivot[2], -0.12 * v), v > 0.3 ? [0.95, 0.65, 0.27, 0.15] : null);
  });
  // the lid on its hinge, and its prop
  if (pm.lid) {
    const ang = si.lid * 0.7;
    const h = pm.lidHinge;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    // rotation about the z-parallel axis through the hinge
    const lidM = new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, h[0] - (c * h[0] - s * h[1]), h[1] - (s * h[0] + c * h[1]), 0, 1]);
    b.mesh(pm.lid, lidM);
    if (pm.prop && si.lid > 0.03) {
      const tip = xform(lidM, pm.prop.tipLocal);
      propStick(b, pm.prop.base, tip);
    }
  }
}

const propCache = new Map<string, Mesh>();
function propStick(b: Batch, a: Vec3, c: Vec3): void {
  const key = `${a.map((v) => v.toFixed(3))}${c.map((v) => v.toFixed(3))}`;
  let m = propCache.get(key);
  if (!m) {
    const mb = new MeshBuilder();
    const d: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const L = Math.hypot(...d);
    const at = (t: number): Vec3 => [a[0] + (d[0] * t) / L, a[1] + (d[1] * t) / L, a[2] + (d[2] * t) / L];
    cyl(mb, at(0.0), at(0.03), 0.011, 0.011, 16, M.brass);
    cyl(mb, at(0.03), at(L - 0.03), 0.0115, 0.0085, 16, M.lacquer);
    cyl(mb, at(L - 0.03), at(L), 0.009, 0.012, 16, M.brass);
    m = mb.build();
    if (propCache.size > 32) propCache.clear();
    propCache.set(key, m);
  }
  b.mesh(m);
}

/** the strings: wires of their real diameters (steel, copper-wound in the bass), the sounding ones
 *  glowing over them, and every sounding string's live shape (the engine's) along its speaking length */
export function pianoStrings(b: Batch, pm: PianoModel, fr: VisualFrame | null, sc: (mx: number) => number, lite: boolean): void {
  const lv = fr?.levels;
  const sym = fr?.symLevels;
  let lvMax = 0;
  if (lv) for (let i = 0; i < lv.length; i++) lvMax = Math.max(lvMax, lv[i]);
  const grand = pm.kind === 'grand';
  for (const w of pm.wires) if (!(lite && w.odd)) b.wire(w.pts, w.col, w.d);
  for (const g of pm.keys) {
    const l = lv && lvMax > 0 ? Math.sqrt(lv[g.i] / lvMax) : 0;
    const s = sym ? Math.min(1, sym[g.i]) : 0;
    if (l <= 0.03 && s <= 0.03) continue;
    for (const r of g.strings) {
      if (l > 0.03) b.line([r.a, r.b], C.verm(0.12 + 0.5 * l), 1.4);
      else b.line([r.a, r.b], C.amber(0.06 + 0.35 * s), 1.2);
    }
  }
  const shapes = fr?.pianoShapes;
  if (shapes && shapes.midi.length) {
    let mx = 0;
    for (let i = 0; i < shapes.shapes.length; i++) mx = Math.max(mx, Math.abs(shapes.shapes[i]));
    const scl = sc(mx);
    const P = shapes.points;
    for (let j = 0; j < shapes.midi.length; j++) {
      const g = pm.keys[shapes.midi[j] - 21];
      if (!g) continue;
      const symS = shapes.light[j] === 1;
      const rel = symS ? (sym?.[g.i] ?? 0) : 1;
      if (symS && rel < 0.03) continue;
      const r = g.strings[Math.floor(g.strings.length / 2)];
      const line: Vec3[] = [];
      for (let i = 0; i < P; i++) {
        const q = lerp3(r.a, r.b, i / (P - 1));
        const d = (shapes.shapes[j * P + i] / scl) * 0.012;
        if (grand) q[1] += d;
        else q[2] -= d;
        line.push(q);
      }
      b.line(line, symS ? C.amber(Math.min(0.55, 0.1 + 0.6 * rel)) : C.verm(0.95), symS ? 1.2 : 2.2);
    }
  }
}

/** the soundboard's live modes onto the plate overlay */
export function boardOverlay(b: Batch, pm: PianoModel, amps: Float32Array): void {
  b.ov.amps.set(amps);
  b.ov.mn.set(plateModes(pm.boardAspect));
  b.ov.modalGain = 0.7;
}

/** for clicking a note's strings: each key's speaking length in world space */
export function pianoPickSegments(pm: PianoModel): { midi: number; a: Vec3; b: Vec3 }[] {
  return pm.keys.map((g) => {
    const r = g.strings[Math.floor(g.strings.length / 2)];
    return { midi: g.midi, a: r.a, b: r.b };
  });
}
export type { Mat4 };
