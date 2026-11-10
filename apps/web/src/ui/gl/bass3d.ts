// The double bass's own fittings in 3D. strings3d.ts builds the bass as it builds the cello (plates,
// ribs, neck, carved head, tailpiece, endpin, bow) and calls on these for what a bass has instead:
//
//   the machines: worm-and-cog tuners, as on nearly every modern bass. A brass plate is screwed to the
//     outside of each cheek, and four rollers run through the pegbox at four heights, with the strings
//     wound on them. Each plate carries two cogs on the ends of its two rollers and bushings for the
//     other side's two. A steel worm turns each cog, held in two lugs, and its shaft runs back past the
//     pegbox's back to a flat key, so the player reaches over the scroll to tune. The sizes come from
//     makers' sets for 3/4 basses (Rubner, Roth & Junius, Thomann's listings: plates about 45 mm
//     wide, cogs about 26 mm, rollers about 10 mm; docs/3d-reference.md);
//   the bridge: a French bass bridge (a 3/4 blank's feet are 147–155 mm across, 59–72 mm apart inside:
//     Aubert, Despiau and Teller blanks). The legs stand under a tall arch, with the heart and the
//     kidneys above it. Each leg is cut through and joined again by a height adjuster: a threaded steel
//     rod with a brass insert in each half and a knurled aluminium thumbwheel between them, as on most
//     orchestral basses.
import { ShapeUtils, Vector2 } from 'three';
import { type Mat4, type Vec3, add, cross, dot, norm, scale, sub } from './gl3d.ts';
import { M, MeshBuilder, cyl, grid, lathe, spline, tube, type Mat } from './mesh.ts';

type P2 = [number, number];
const mm = 0.001;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** a frame: its axes X, Y, Z (unit, as columns) at the origin o */
const frameM = (o: Vec3, X: Vec3, Y: Vec3, Z: Vec3): Mat4 => new Float32Array([X[0], X[1], X[2], 0, Y[0], Y[1], Y[2], 0, Z[0], Z[1], Z[2], 0, o[0], o[1], o[2], 1]);

const areaOf = (p: P2[]) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
};

/** A flat part: an outline in the local x–y plane extruded from z = 0 to z = t, its front edge
 *  chamfered by `bev` (the highlight that sells a machined or sawn edge). Normals: the faces flat, the
 *  walls smooth round the outline, the chamfer between the two. */
export function slab(mb: MeshBuilder, poly0: P2[], t: number, bev: number, m: Mat): void {
  const poly = areaOf(poly0) < 0 ? poly0.slice().reverse() : poly0;
  const n = poly.length;
  // outward normals at the points (the mean of the two edges')
  const nrm = poly.map((p, i): P2 => {
    const a = poly[(i + n - 1) % n];
    const b = poly[(i + 1) % n];
    const e1: P2 = [p[0] - a[0], p[1] - a[1]];
    const e2: P2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(e1[0], e1[1]) || 1;
    const l2 = Math.hypot(e2[0], e2[1]) || 1;
    const nx = e1[1] / l1 + e2[1] / l2;
    const ny = -e1[0] / l1 - e2[0] / l2;
    const l = Math.hypot(nx, ny) || 1;
    return [nx / l, ny / l];
  });
  const inner = poly.map((p, i): P2 => [p[0] - nrm[i][0] * bev, p[1] - nrm[i][1] * bev]);
  const faces = ShapeUtils.triangulateShape(poly.map(([x, y]) => new Vector2(x, y)), []);
  const back: Vec3 = [0, 0, -1];
  const front: Vec3 = [0, 0, 1];
  for (const [a, b, c] of faces) {
    mb.stri([poly[a][0], poly[a][1], 0], [poly[c][0], poly[c][1], 0], [poly[b][0], poly[b][1], 0], back, back, back, m);
    mb.stri([inner[a][0], inner[a][1], t], [inner[b][0], inner[b][1], t], [inner[c][0], inner[c][1], t], front, front, front, m);
  }
  const zc = t - bev;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ni: Vec3 = [nrm[i][0], nrm[i][1], 0];
    const nj: Vec3 = [nrm[j][0], nrm[j][1], 0];
    mb.stri([poly[i][0], poly[i][1], 0], [poly[j][0], poly[j][1], 0], [poly[j][0], poly[j][1], zc], ni, nj, nj, m);
    mb.stri([poly[i][0], poly[i][1], 0], [poly[j][0], poly[j][1], zc], [poly[i][0], poly[i][1], zc], ni, nj, ni, m);
    if (bev > 0) {
      const ci = norm([nrm[i][0], nrm[i][1], 1]);
      const cj = norm([nrm[j][0], nrm[j][1], 1]);
      mb.stri([poly[i][0], poly[i][1], zc], [poly[j][0], poly[j][1], zc], [inner[j][0], inner[j][1], t], ci, cj, cj, m);
      mb.stri([poly[i][0], poly[i][1], zc], [inner[j][0], inner[j][1], t], [inner[i][0], inner[i][1], t], ci, cj, ci, m);
    }
  }
}

/** a toothed wheel's outline: `teeth` teeth on radius r (tips r + add, roots r − add) */
function gearOutline(r: number, teeth: number, addendum: number): P2[] {
  const out: P2[] = [];
  for (let k = 0; k < teeth; k++) {
    const a0 = (k / teeth) * Math.PI * 2;
    const da = (Math.PI * 2) / teeth;
    // root, flank up, the tip's two corners, flank down (a trapezoid tooth)
    for (const [f, rr] of [[0.0, r - addendum], [0.18, r - addendum], [0.34, r + addendum], [0.62, r + addendum], [0.78, r - addendum]] as [number, number][])
      out.push([Math.cos(a0 + f * da) * rr, Math.sin(a0 + f * da) * rr]);
  }
  return out;
}

/** The head's frame, as strings3d.ts's carved scroll gives it: the neck-local point at (a, h) of the
 *  head's side profile (fractions of the head's length Lh: a along the neck towards the scroll from
 *  the nut, h towards the strings) and z across; the neck's axis A and the strings' side H; the
 *  pegbox's half-width at a (m), the h of its front edge and of its back at a; its cheeks' thickness */
export interface HeadFrame {
  toL: (a: number, h: number, z: number) => Vec3;
  A: Vec3;
  H: Vec3;
  Lh: number;
  w: (a: number) => number;
  front: (a: number) => number;
  back: (a: number) => number;
  cheek: number;
}

/** one roller: where it is along the pegbox (a, profile units), the side its machine is on (+1 the
 *  bass side, z > 0), and the string wound on it (its z across the pegbox, its diameter) */
export interface Roller {
  a: number;
  side: number;
  z: number;
  dia: number;
}

// the machines' sizes (m)
const R_ROLL = 5 * mm;
const R_COG = 12.5 * mm;
const T_COG = 3.2 * mm;
const R_WORM = 3.6 * mm;
const L_WORM = 15 * mm;
const T_PLATE = 2.2 * mm;

/** The machines: plates, rollers, cogs, worms, keys, bushings and the strings' coils. Returns the
 *  rollers' centres and each one's point where its string leaves it for the nut (neck-local).
 *  `depth`: where the rollers sit between the cheeks' front edge and the back (0–1); `nut`: the nut's
 *  top (neck-local). */
export function buildMachines(mb: MeshBuilder, hf: HeadFrame, rollers: Roller[], depth: number, nut: Vec3): { centres: Vec3[]; departs: Vec3[] } {
  const { A, H, Lh } = hf;
  const Z: Vec3 = [0, 0, 1];
  // the rollers' centres on a straight line (a machine plate is straight) through the first and last
  const cen = (a: number) => {
    const hf0 = hf.front(a);
    const hb0 = hf.back(a);
    return hf0 + (hb0 - hf0) * depth;
  };
  const a0 = rollers[0].a;
  const a3 = rollers[rollers.length - 1].a;
  const h0 = cen(a0);
  const h3 = cen(a3);
  const hOf = (a: number) => h0 + ((h3 - h0) * (a - a0)) / (a3 - a0);
  const C = rollers.map((r) => hf.toL(r.a, hOf(r.a), 0));
  // the plate's axes in the neck's side plane: e1 along the rollers' line (towards the scroll), e2
  // across it towards the pegbox's back (where the keys are)
  const e1 = norm(sub(C[C.length - 1], C[0]));
  let e2 = norm(cross(Z, e1));
  if (dot(e2, H) > 0) e2 = scale(e2, -1);
  // the cheeks taper towards the scroll: a cheek's outer face is the plane z = ±w(a)
  const dwda = (hf.w(a3) - hf.w(a0)) / (a3 - a0); // m per unit a
  const departs: Vec3[] = [];
  const mid = scale(add(C[0], C[C.length - 1]), 0.5);
  for (const s of [1, -1]) {
    // the cheek's outward normal, and the plate's frame on it: X along e1 (tilted with the taper),
    // Y = e2, N out of the cheek
    const nC = norm(add([0, 0, s], scale(A, (-s * dwda) / Lh)));
    const X = norm(sub(e1, scale(nC, dot(e1, nC))));
    const Y = norm(cross(nC, X));
    const Yb = dot(Y, e2) > 0 ? Y : scale(Y, -1);
    const onCheek = (p: Vec3, d: number): Vec3 => {
      // p (z = 0) moved out onto the cheek's face (and d beyond it)
      const a = dot(sub(p, hf.toL(0, 0, 0)), A) / Lh;
      return add([p[0], p[1], s * hf.w(a)], scale(nC, d + 0.25 * mm));
    };
    const at = (u: number, v: number, d: number): Vec3 => add(onCheek(add(mid, add(scale(e1, u), scale(e2, v))), 0), add(scale(nC, d), [0, 0, 0]));
    // the plate: the cheek's own shape (a few millimetres in from its front edge and its back), from
    // in front of the first roller to behind the last, its corners rounded and its edge chamfered,
    // screwed round its edge (as the full-length plates of German and French sets are)
    const O = at(0, 0, 0);
    const toPlate = (a: number, h: number): P2 => {
      const q = sub(onCheek(hf.toL(a, h, 0), 0), O);
      return [dot(q, X), dot(q, Yb)];
    };
    const aS = a0 - 0.06;
    const aE = a3 + 0.075;
    const NS = 24;
    const fr: P2[] = [];
    const bk: P2[] = [];
    for (let q = 0; q <= NS; q++) {
      const a = aS + ((aE - aS) * q) / NS;
      fr.push(toPlate(a, hf.front(a) - (3.5 * mm) / Lh));
      bk.push(toPlate(a, hf.back(a) + (5 * mm) / Lh));
    }
    let outline: P2[] = [...fr, ...bk.reverse()];
    // (Chaikin's corner cutting, three times: the corners round off to about 5 mm)
    for (let it = 0; it < 3; it++) {
      const nx: P2[] = [];
      for (let i = 0; i < outline.length; i++) {
        const pa = outline[i];
        const pb = outline[(i + 1) % outline.length];
        nx.push([0.75 * pa[0] + 0.25 * pb[0], 0.75 * pa[1] + 0.25 * pb[1]], [0.25 * pa[0] + 0.75 * pb[0], 0.25 * pa[1] + 0.75 * pb[1]]);
      }
      outline = nx;
    }
    mb.with(frameM(O, X, Yb, nC), () => slab(mb, outline, T_PLATE, 0.7 * mm, M.brassHandled));
    // the screws: every ~32 mm round the edge, 5.5 mm in, clear of the cogs, bushings, lugs and shafts
    const busy: { u: number; v0: number; v1: number; r: number }[] = [];
    rollers.forEach((r, k) => {
      const u = dot(sub(C[k], mid), e1);
      if (r.side === s) {
        busy.push({ u, v0: 0, v1: 0, r: R_COG + 3.5 * mm }, { u: u + R_COG + R_WORM - 0.7 * mm, v0: -14 * mm, v1: 1, r: 7.5 * mm });
      } else busy.push({ u, v0: 0, v1: 0, r: 10.5 * mm });
    });
    const per: number[] = [0];
    for (let i = 1; i <= outline.length; i++) per.push(per[i - 1] + Math.hypot(outline[i % outline.length][0] - outline[i - 1][0], outline[i % outline.length][1] - outline[i - 1][1]));
    const total = per[outline.length];
    const nScrew = Math.round(total / (32 * mm));
    for (let q = 0; q < nScrew; q++) {
      const sd = ((q + 0.5) / nScrew) * total;
      let i = 0;
      while (per[i + 1] < sd) i++;
      const pa = outline[i];
      const pb = outline[(i + 1) % outline.length];
      const t = (sd - per[i]) / (per[i + 1] - per[i] || 1);
      const tx = pb[0] - pa[0];
      const ty = pb[1] - pa[1];
      const tl = Math.hypot(tx, ty) || 1;
      // inwards (the outline runs counter-clockwise or clockwise: towards the plate's middle)
      let nx = -ty / tl;
      let ny = tx / tl;
      const px = pa[0] + tx * t;
      const py = pa[1] + ty * t;
      const cx = outline.reduce((acc, p2) => acc + p2[0], 0) / outline.length;
      const cy = outline.reduce((acc, p2) => acc + p2[1], 0) / outline.length;
      if (nx * (cx - px) + ny * (cy - py) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const u = px + nx * 5.5 * mm;
      const v = py + ny * 5.5 * mm;
      // (the plate's frame and the rollers' frame share their origin and axes, near enough)
      if (busy.some((b) => Math.abs(u - b.u) < b.r && (b.v1 === 0 ? Math.hypot(u - b.u, v) < b.r : v > b.v0))) continue;
      mb.with(frameM(at(u, v, T_PLATE), X, nC, Yb), () => lathe(mb, [[0.00001, 1.1 * mm], [1.3 * mm, 0.95 * mm], [2.1 * mm, 0.55 * mm], [2.5 * mm, 0], [0.00001, 0]], 14, M.brassDull));
    }
    rollers.forEach((r, k) => {
      const u = dot(sub(C[k], mid), e1);
      if (r.side !== s) {
        // the other side's roller: its end in a bushing, flush with a domed end
        mb.with(frameM(at(u, 0, T_PLATE), X, nC, Yb), () =>
          lathe(mb, [[0.00001, 0], [7.4 * mm, 0], [7.4 * mm, 1.0 * mm], [6.6 * mm, 1.9 * mm], [R_ROLL + 0.4 * mm, 2.0 * mm], [R_ROLL, 2.0 * mm], [R_ROLL * 0.8, 2.5 * mm], [0.00001, 2.7 * mm]], 24, M.brassHandled),
        );
        return;
      }
      // the machine: a hub on the plate, the cog on it (its mid-plane level with the worm's axis), a
      // dome-headed screw in its centre
      const dC = R_WORM + 1.4 * mm + T_PLATE;
      mb.with(frameM(at(u, 0, T_PLATE), X, nC, Yb), () => lathe(mb, [[0.00001, 0], [6.4 * mm, 0], [6.4 * mm, dC - T_COG / 2 - T_PLATE], [0.00001, dC - T_COG / 2 - T_PLATE]], 22, M.brass));
      mb.with(frameM(at(u, 0, dC - T_COG / 2), X, Yb, nC), () => slab(mb, gearOutline(R_COG, 26, 0.85 * mm), T_COG, 0.3 * mm, M.brassDull));
      mb.with(frameM(at(u, 0, dC + T_COG / 2), X, nC, Yb), () => lathe(mb, [[0.00001, 1.6 * mm], [1.9 * mm, 1.35 * mm], [3.2 * mm, 0.7 * mm], [3.8 * mm, 0], [0.00001, 0]], 16, M.nickelSatin));
      // the worm beside the cog (on its scroll side), its axis along e2, meshing at the cog's edge
      const uw = u + R_COG + R_WORM - 0.7 * mm;
      const wc = at(uw, 0, dC);
      const prof: [number, number][] = [[0.00001, -L_WORM / 2 - 0.6 * mm], [R_WORM - 0.9 * mm, -L_WORM / 2 - 0.6 * mm]];
      const turns = 9;
      for (let q = 0; q <= turns * 2; q++) prof.push([q % 2 ? R_WORM : R_WORM - 0.75 * mm, -L_WORM / 2 + (L_WORM * q) / (turns * 2)]);
      prof.push([R_WORM - 0.9 * mm, L_WORM / 2 + 0.6 * mm], [0.00001, L_WORM / 2 + 0.6 * mm]);
      mb.with(frameM(wc, X, Yb, nC), () => lathe(mb, prof, 18, M.nickelSatin));
      // its two lugs (tombstones standing on the plate, the shaft through their round tops)
      const lug: P2[] = [[-4.6 * mm, 0], [4.6 * mm, 0]];
      for (let q = 0; q <= 10; q++) {
        const ang = (q / 10) * Math.PI;
        lug.push([Math.cos(ang) * 4.6 * mm, dC - T_PLATE + Math.sin(ang) * 4.6 * mm]);
      }
      for (const v of [-(L_WORM / 2 + 3.6 * mm), L_WORM / 2 + 0.8 * mm])
        mb.with(frameM(at(uw, v, T_PLATE), X, nC, Yb), () => slab(mb, lug, 2.8 * mm, 0.5 * mm, M.brassHandled));
      // the shaft back past the pegbox's back, and the key: a flat, rounded paddle (its faces
      // parallel to the plate), on a turned collar
      let vb = L_WORM / 2;
      for (; vb < 0.2; vb += 0.5 * mm) {
        const p = add(C[k], add(scale(e1, uw - u), scale(e2, vb)));
        const pa = dot(sub(p, hf.toL(0, 0, 0)), A) / Lh;
        const ph = dot(sub(p, hf.toL(0, 0, 0)), H) / Lh;
        if (ph < hf.back(pa)) break;
      }
      const vk = vb + 12 * mm;
      cyl(mb, at(uw, L_WORM / 2, dC), at(uw, vk + 2 * mm, dC), 2.3 * mm, 2.3 * mm, 14, M.nickelSatin);
      mb.with(frameM(at(uw, vk, dC), X, Yb, nC), () => lathe(mb, [[0.00001, -1 * mm], [3.4 * mm, -1 * mm], [4.2 * mm, 0.5 * mm], [4.2 * mm, 3.2 * mm], [3.3 * mm, 4.4 * mm], [3.0 * mm, 6 * mm], [0.00001, 6 * mm]], 20, M.brassHandled));
      const KL = 32 * mm;
      const KW = 12.5 * mm;
      const KT = 2.6 * mm;
      const k0 = at(uw, vk + 5 * mm, dC);
      grid(mb, 20, 28, (t, vv) => {
        const ang = vv * Math.PI * 2;
        // a flattened pear: a waist into the collar, broadest two thirds out, a round end
        const e = Math.sqrt(Math.max(0, 1 - ((t - 0.56) / 0.44) ** 2));
        const hw = Math.max(2.6 * mm, KW * e * (0.72 + 0.28 * sstep(0.1, 0.6, t)));
        const ht = Math.max(2.3 * mm, KT * Math.pow(e, 0.4));
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const w2 = Math.sign(ca) * Math.pow(Math.abs(ca), 0.55) * hw;
        const t2 = Math.sign(sa) * Math.pow(Math.abs(sa), 0.7) * ht;
        return add(k0, add(add(scale(Yb, t * KL), scale(X, w2)), scale(nC, t2)));
      }, M.brassHandled, { wrapV: true });
    });
  }
  // the rollers through the pegbox (brass), each with its string wound on it
  rollers.forEach((r, k) => {
    const c = C[k];
    const a = r.a;
    const zz = hf.w(a) + T_PLATE + 2 * mm;
    cyl(mb, [c[0], c[1], -zz], [c[0], c[1], zz], R_ROLL, R_ROLL, 18, M.brass);
    // where the string leaves the roller: tangent to it, on its way to the nut
    const toNut = sub(nut, c);
    const dn = norm([toNut[0], toNut[1], 0]);
    let nn: Vec3 = [-dn[1], dn[0], 0];
    if (dot(nn, H) < 0) nn = scale(nn, -1);
    const Rc = R_ROLL + r.dia / 2;
    // the coil: three and a half turns towards the cheek nearer it, inside the cavity
    const cav = hf.w(a) - hf.cheek - 1.5 * mm;
    const pitch = r.dia * 1.08;
    const turns = 3.5;
    const len = pitch * turns;
    const dir = r.z >= 0 ? 1 : -1;
    const z0 = clamp(r.z, -cav + (dir < 0 ? len : 0), cav - (dir > 0 ? len : 0));
    const th0 = Math.atan2(dot(nn, H), dot(nn, A));
    const path: Vec3[] = [];
    const NP = Math.round(turns * 24);
    for (let q = 0; q <= NP; q++) {
      const t = q / NP;
      const th = th0 - dir * t * turns * Math.PI * 2;
      path.push(add(c, add(add(scale(A, Math.cos(th) * Rc), scale(H, Math.sin(th) * Rc)), [0, 0, z0 + dir * t * len])));
    }
    tube(mb, path, r.dia / 2, 8, M.stringWound);
    departs.push(add(c, add(scale(nn, Rc), [0, 0, z0])));
  });
  return { centres: C, departs };
}

/** The bass bridge: its outline (normalised: z across by the feet's span W, h up by its height H) cut
 *  from maple, thick at the feet and thin at the top, the feet fitted to the arch, each leg cut at
 *  [hCut0, hCut1] for its adjuster. `xb`: where it stands along the body, `yBase` the arch's height
 *  there, `yArch(z)` the arch under the feet, `R` the radius of its top's curve. */
export function bassBridge(mb: MeshBuilder, xb: number, W: number, H: number, R: number, yBase: number, yArch: (z: number) => number, m: Mat): void {
  // the outer side, from the foot's outer corner up (z ≥ 0)
  const side: P2[] = [
    [0.5, 0], [0.5, 0.028], [0.47, 0.055], [0.44, 0.1], [0.418, 0.17], [0.402, 0.25], [0.386, 0.34], [0.37, 0.43], [0.366, 0.5],
    // the ear: out, round and back in under the top's shoulder
    [0.39, 0.57], [0.425, 0.625], [0.432, 0.675], [0.41, 0.72], [0.372, 0.77], [0.362, 0.82], [0.357, 0.86], [0.352, 0.895],
  ];
  // the arch between the feet: their inner corners (72 mm apart on a 150 mm span) up to its crown
  const inner: P2[] = [[0.24, 0], [0.236, 0.07], [0.222, 0.17], [0.19, 0.27], [0.13, 0.36], [0.06, 0.405], [0, 0.415]];
  const top: P2[] = [];
  for (let k = 0; k <= 14; k++) {
    const z = 0.342 - (0.684 * k) / 14;
    top.push([z, 1 - (z * W) ** 2 / (2 * R) / H]);
  }
  const outline: P2[] = [];
  for (const [z, h] of inner) outline.push([-z, h]);
  for (const [z, h] of inner.slice(0, -1).reverse()) outline.push([z, h]);
  for (const p of side) outline.push(p);
  for (const p of top) outline.push(p);
  for (const [z, h] of side.slice().reverse()) outline.push([-z, h]);
  const smooth = spline(outline, 3, true);
  // the heart (point down) and the two kidneys
  const heart: P2[] = [];
  for (let k = 0; k < 28; k++) {
    const t = (k / 28) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    heart.push([(x / 16) * 0.078, 0.6 + (y / 17) * 0.085]);
  }
  const kid = (cz: number, ch: number, rot: number): P2[] =>
    Array.from({ length: 18 }, (_, k): P2 => {
      const t = (k / 18) * Math.PI * 2;
      const a = 0.066 * Math.cos(t);
      const b = 0.026 * Math.sin(t);
      return [cz + a * Math.cos(rot) - b * Math.sin(rot), ch + a * Math.sin(rot) + b * Math.cos(rot)];
    });
  const holes = [heart, kid(-0.18, 0.775, 0.42), kid(0.18, 0.775, -0.42)];
  // the cuts: each leg parted between hc0 and hc1 (7 mm)
  const hc0 = 0.15;
  const hc1 = hc0 + 0.007 / H;
  const clipH = (poly: P2[], keep: (p: P2) => boolean, at: number): P2[] => {
    const out: P2[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if (keep(a)) out.push(a);
      if (keep(a) !== keep(b)) {
        const t = (at - a[1]) / (b[1] - a[1]);
        out.push([a[0] + (b[0] - a[0]) * t, at]);
      }
    }
    return out;
  };
  const clipZ = (poly: P2[], sgn: number): P2[] => {
    const out: P2[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const ka = sgn * a[0] >= 0;
      const kb = sgn * b[0] >= 0;
      if (ka) out.push(a);
      if (ka !== kb) {
        const t = a[0] / (a[0] - b[0]);
        out.push([0, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  const upper = clipH(smooth, (p) => p[1] >= hc1, hc1);
  const feet = [1, -1].map((sg) => clipH(clipZ(smooth, sg), (p) => p[1] <= hc0, hc0));
  const toY = (z: number, h: number) => yBase + h * H + (1 - sstep(0, 0.12, h)) * (yArch(z * W) - yBase);
  // thickness: 22 mm at the feet to 6 mm at the top (a bass blank's)
  const th = (h: number) => 0.022 * (1 - h) ** 1.15 + 0.006 * (1 - (1 - h) ** 1.15);
  const P = (z: number, h: number, sd: number): Vec3 => [xb + (sd * th(h)) / 2, toY(z, h), z * W];
  const piece = (loop: P2[], hs: P2[][]) => {
    const faces = ShapeUtils.triangulateShape(loop.map(([z, h]) => new Vector2(z, h)), hs.map((hp) => hp.map(([z, h]) => new Vector2(z, h))));
    const all = [...loop, ...hs.flat()];
    for (const sd of [-1, 1]) {
      const nn: Vec3 = [sd, 0, 0];
      for (const [a, b, c] of faces) mb.stri(P(all[a][0], all[a][1], sd), P(all[b][0], all[b][1], sd), P(all[c][0], all[c][1], sd), nn, nn, nn, m);
    }
    // the walls, their normals out of the wood (round the outline: outwards; round a hole: into it)
    for (const [lp, isHole] of [[loop, false], ...hs.map((hp) => [hp, true] as const)] as [P2[], boolean][]) {
      const sgn = (areaOf(lp) > 0 ? 1 : -1) * (isHole ? -1 : 1);
      const n = lp.length;
      for (let i = 0; i < n; i++) {
        const a = lp[i];
        const c = lp[(i + 1) % n];
        const dz = c[0] - a[0];
        const dh = c[1] - a[1];
        const nn = norm([0, (-sgn * dz) / H, (sgn * dh) / W]);
        mb.stri(P(a[0], a[1], -1), P(a[0], a[1], 1), P(c[0], c[1], 1), nn, nn, nn, m);
        mb.stri(P(a[0], a[1], -1), P(c[0], c[1], 1), P(c[0], c[1], -1), nn, nn, nn, m);
      }
    }
  };
  piece(upper, holes);
  for (const f of feet) piece(f, []);
  // the adjusters, one in each leg's cut: a steel rod through a brass insert in each half, and the
  // thumbwheel (knurled aluminium) on it
  const hm = (hc0 + hc1) / 2;
  for (const sg of [1, -1]) {
    // the leg's middle at the cut
    const xs: number[] = [];
    for (let i = 0; i < smooth.length; i++) {
      const a = smooth[i];
      const b = smooth[(i + 1) % smooth.length];
      if ((a[1] - hm) * (b[1] - hm) <= 0 && sg * (a[0] + b[0]) > 0 && a[1] !== b[1]) xs.push(Math.abs(a[0] + ((b[0] - a[0]) * (hm - a[1])) / (b[1] - a[1])));
    }
    const zc = (sg * (Math.min(...xs) + Math.max(...xs))) / 2;
    const y0 = toY(zc, hc0);
    const y1 = toY(zc, hc1);
    const c: Vec3 = [xb, (y0 + y1) / 2, zc * W];
    cyl(mb, [xb, y0 - 0.004, zc * W], [xb, y1 + 0.004, zc * W], 2.5 * mm, 2.5 * mm, 12, M.darkSteel, false);
    for (const [y, d] of [[y0, 1], [y1, -1]] as [number, number][]) cyl(mb, [xb, y, zc * W], [xb, y + d * 0.0006, zc * W], 4.6 * mm, 4.6 * mm, 18, M.brassDull);
    // the wheel: 24 mm across, 4.4 mm thick, knurled round its rim
    const knurl: P2[] = [];
    const NK = 72;
    for (let k = 0; k < NK; k++) {
      const a = (k / NK) * Math.PI * 2;
      const r = (k % 2 ? 11.6 : 12) * mm;
      knurl.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const tW = 4.4 * mm;
    mb.with(frameM([c[0], c[1] - tW / 2, c[2]], [1, 0, 0], [0, 0, -1], [0, 1, 0]), () => slab(mb, knurl, tW, 0.5 * mm, M.nickelSatin));
  }
}
