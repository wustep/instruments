// Violin, viola and cello in 3D: a carved body (arched top and back over ribs, the plates
// overhanging, purfling, f-holes), neck, fingerboard, nut, pegbox and pegs, the scroll, the bridge
// on the top's arch, tailpiece, chinrest or endpin, and a bow — built once per instrument. Live:
// the top shaded by the body's modes, the strings glowing with their levels, the stopping point a
// glowing bar on the fingerboard under its string (rocking with the vibrato), the bowed string's
// shape moving in the bowing direction, and the bow at its contact point and hair position.
//
// Proportions (metres) from luthiers' standard patterns: violin after the Stradivari "Messiah"
// pattern as tabulated by Strobel ("Useful Measurements for Violin Makers"): body 356, bouts
// 168/112/208, ribs 30–32, arch ≈15.5, neck (nut–edge) 130, stop 195, bridge 33 high on the arch,
// fingerboard 270, projection 27; a 16" viola (body 406, bouts 190/130/237, ribs 38, stop 222,
// neck 148); a cello after Strad "Davidov" proportions (body 755, bouts 345/235/440, ribs 120,
// neck 280, stop 410, bridge 90, projection 82). The string length (nut–bridge) is the engine's.
// Approximations: the outline is a smooth bout-and-corner construction rather than a traced
// pattern; the arch is a separable long × cross arch with a shallow edge channel; the scroll is a
// logarithmic volute; the f-holes are drawn as dark shapes on the arch (eyes, stem, notches).
import type { VisualFrame } from '@piano-model/engine';
import type { BowedGeom } from '../stage-draw.ts';
import { INK } from '../stage-draw.ts';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, add, chain, cross, ink, lerp3, mul, norm, plateModes, rotX, rotY, rotZ, scale, sub, translate, xdir, xform } from './gl3d.ts';
import { M, MeshBuilder, cyl, ellipsoid, grid, lathe, tube, type Mat } from './mesh.ts';

interface Spec {
  body: number;
  upper: number;
  cbout: number;
  lower: number;
  rib: number;
  archT: number;
  archB: number;
  neck: number;
  edge: number;
  over: number;
  fbLen: number;
  fbW: [number, number];
  fbThick: number;
  fbCrown: number;
  bridgeH: number;
  bridgeW: number;
  bridgeR: number;
  proj: number;
  overstand: number;
  scroll: number;
  pegbox: number;
  tail: number;
  fh: number;
  spreadB: number;
  spreadN: number;
  neckDepth: [number, number];
  stick: [number, number];
  hairW: number;
  /** total bow length beyond the hair: frog and head */
  frog: number;
}
const SPEC: Record<'violin' | 'viola' | 'cello', Spec> = {
  violin: { body: 0.356, upper: 0.168, cbout: 0.112, lower: 0.208, rib: 0.031, archT: 0.0155, archB: 0.0145, neck: 0.13, edge: 0.0038, over: 0.0026, fbLen: 0.27, fbW: [0.024, 0.042], fbThick: 0.005, fbCrown: 0.003, bridgeH: 0.033, bridgeW: 0.041, bridgeR: 0.042, proj: 0.027, overstand: 0.006, scroll: 0.04, pegbox: 0.07, tail: 0.11, fh: 0.072, spreadB: 0.0113, spreadN: 0.0055, neckDepth: [0.018, 0.021], stick: [0.0043, 0.0028], hairW: 0.0105, frog: 0.03 },
  viola: { body: 0.406, upper: 0.19, cbout: 0.13, lower: 0.237, rib: 0.038, archT: 0.0175, archB: 0.0165, neck: 0.148, edge: 0.004, over: 0.0028, fbLen: 0.295, fbW: [0.025, 0.045], fbThick: 0.0055, fbCrown: 0.0032, bridgeH: 0.037, bridgeW: 0.045, bridgeR: 0.046, proj: 0.029, overstand: 0.007, scroll: 0.045, pegbox: 0.08, tail: 0.125, fh: 0.08, spreadB: 0.0122, spreadN: 0.0058, neckDepth: [0.019, 0.023], stick: [0.0045, 0.003], hairW: 0.011, frog: 0.032 },
  cello: { body: 0.755, upper: 0.345, cbout: 0.235, lower: 0.44, rib: 0.12, archT: 0.026, archB: 0.024, neck: 0.28, edge: 0.0065, over: 0.004, fbLen: 0.58, fbW: [0.032, 0.075], fbThick: 0.009, fbCrown: 0.006, bridgeH: 0.09, bridgeW: 0.092, bridgeR: 0.066, proj: 0.082, overstand: 0.02, scroll: 0.072, pegbox: 0.14, tail: 0.235, fh: 0.135, spreadB: 0.0205, spreadN: 0.0078, neckDepth: [0.03, 0.036], stick: [0.0055, 0.0038], hairW: 0.0145, frog: 0.035 },
};

/** half-width of the outline (rib line) along the body, u = 0 at the neck end … 1 at the tail */
function halfWidth(sp: Spec, u: number): number {
  const Uw = sp.upper / 2;
  const Cw = sp.cbout / 2;
  const Lw = sp.lower / 2;
  const se = (x: number, p: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(x)), p)), 1 / p);
  const uc1 = 0.375;
  const uc2 = 0.615;
  const um = 0.495;
  if (u <= 0.19) return Uw * se((u - 0.19) / 0.19, 2.3);
  if (u <= uc1) return Uw * se((u - 0.19) / 0.215, 2.5);
  if (u >= 0.765) return Lw * se((u - 0.765) / 0.235, 2.3);
  if (u >= uc2) return Lw * se((u - 0.765) / 0.2, 2.5);
  const top = Uw * se((uc1 - 0.19) / 0.215, 2.5) * 0.9;
  const bot = Lw * se((uc2 - 0.765) / 0.2, 2.5) * 0.9;
  if (u < um) return Cw + (top - Cw) * ((um - u) / (um - uc1)) ** 2;
  return Cw + (bot - Cw) * ((u - um) / (uc2 - um)) ** 2;
}
const longArch = (u: number) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, u)))), 0.42);
/** cross arch with a shallow channel before the edge (t = −1 … 1 across) */
function crossArch(t: number): number {
  const a = Math.abs(t);
  const c = Math.pow(Math.cos((Math.PI / 2) * Math.min(1, a)), 1.5);
  const channel = 0.06 * Math.exp(-(((a - 0.9) / 0.05) ** 2));
  return Math.max(0, c - channel);
}

export interface BowedModel {
  id: 'violin' | 'viola' | 'cello';
  sp: Spec;
  L: number;
  /** body → world */
  T: Mat4;
  meshes: Mesh[];
  top: Mesh;
  bow: Mesh;
  hairLen: number;
  /** local string geometry: x of nut and bridge, z of each string at both, y of the string line */
  xn: number;
  xb: number;
  zN: number[];
  zB: number[];
  yN: number;
  yB: number[];
  /** tailpiece end of each string */
  tailEnd: Vec3[];
  pegEnd: Vec3[];
  fbY: (x: number) => number;
  bounds: { c: Vec3; r: number };
  floorY: number;
  src: Vec3;
}

export function buildBowedModel(g: BowedGeom): BowedModel {
  const sp = SPEC[g.id];
  const L = g.L;
  const xn = -sp.neck;
  const xb = L - sp.neck;
  const B = sp.body;
  const mb = new MeshBuilder();
  // ---- plates: top (modal, its own mesh) and back; ribs; edges
  const w = (u: number) => halfWidth(sp, u);
  const wp = (u: number) => w(u) + sp.over * Math.min(1, Math.sin(Math.PI * u) * 8);
  const yTop = (u: number, t: number) => sp.edge + (sp.archT - sp.edge * 0.6) * longArch(u) * crossArch(t);
  const yBack = (u: number, t: number) => -sp.rib - sp.edge - (sp.archB - sp.edge * 0.6) * longArch(u) * crossArch(t);
  const topMb = new MeshBuilder();
  const NU = 72;
  const NV = 26;
  grid(topMb, NU, NV, (u, v) => {
    const t = v * 2 - 1;
    return [u * B, yTop(u, t), t * wp(u)];
  }, M.varnishTop, { uv: (u, v) => [u, v], flip: true });
  grid(mb, NU, NV, (u, v) => {
    const t = v * 2 - 1;
    return [u * B, yBack(u, t), t * wp(u)];
  }, M.varnish);
  // plate edges and the underside of the overhang, ribs
  const ring = (f: (u: number) => number, y: (u: number) => number, side: number) => Array.from({ length: NU + 1 }, (_, i) => [(i / NU) * B, y(i / NU), side * f(i / NU)] as Vec3);
  for (const side of [-1, 1]) {
    const ePlateT = ring(wp, () => sp.edge, side);
    const ePlateT0 = ring(wp, () => 0, side);
    const eRibT = ring(w, () => 0, side);
    const eRibB = ring(w, () => -sp.rib, side);
    const ePlateB0 = ring(wp, () => -sp.rib, side);
    const ePlateB = ring(wp, () => -sp.rib - sp.edge, side);
    for (let i = 0; i < NU; i++) {
      const q = (a: Vec3[], b: Vec3[], m: Mat) => (side > 0 ? mb.quad(a[i], a[i + 1], b[i + 1], b[i], m) : mb.quad(a[i], b[i], b[i + 1], a[i + 1], m));
      q(ePlateT0, ePlateT, M.varnishDark);
      q(eRibT, ePlateT0, M.varnishDark);
      q(eRibB, eRibT, M.varnish);
      q(ePlateB0, eRibB, M.varnishDark);
      q(ePlateB, ePlateB0, M.varnishDark);
    }
  }
  // f-holes: dark shapes on the arch, their notches on the bridge line
  const ub = xb / B;
  const S = B / 0.356;
  for (const side of [-1, 1]) {
    const eyeU: [number, number, number] = [ub - (0.036 * S) / B * 0.356 / 0.356, side * 0.021 * S, 0.0032 * S];
    const eyeL: [number, number, number] = [ub + (0.036 * S) / B, side * 0.05 * S, 0.0042 * S];
    const at = (x: number, z: number, lift = 0.0004): Vec3 => {
      const u = x / B;
      const t = z / Math.max(1e-4, wp(u));
      return [x, yTop(u, t) + lift, z];
    };
    const disk = (cx: number, cz: number, r: number) => {
      const c = at(cx, cz);
      for (let k = 0; k < 14; k++) {
        const a0 = (k / 14) * Math.PI * 2;
        const a1 = ((k + 1) / 14) * Math.PI * 2;
        mb.tri(c, at(cx + r * Math.cos(a1), cz + r * Math.sin(a1)), at(cx + r * Math.cos(a0), cz + r * Math.sin(a0)), M.hole);
      }
    };
    const xU = eyeU[0] * B;
    const xL = eyeL[0] * B;
    disk(xU, eyeU[1], eyeU[2]);
    disk(xL, eyeL[1], eyeL[2]);
    // the stem: an S from eye to eye, widest in the middle, with the notches at the bridge line
    const N = 16;
    for (let k = 0; k < N; k++) {
      const p = (s: number): [number, number, number] => {
        const x = xU + (xL - xU) * s;
        const z = eyeU[1] + (eyeL[1] - eyeU[1]) * (s * s * (3 - 2 * s)) + side * 0.004 * S * Math.sin(Math.PI * 2 * s);
        const wd = (0.0012 + 0.0026 * Math.sin(Math.PI * s)) * S;
        return [x, z, wd];
      };
      const [x0, z0, w0] = p(k / N);
      const [x1, z1, w1] = p((k + 1) / N);
      mb.quad(at(x0, z0 - w0), at(x0, z0 + w0), at(x1, z1 + w1), at(x1, z1 - w1), M.hole);
    }
    for (const sgn of [-1, 1]) {
      const zc = (eyeU[1] + eyeL[1]) / 2;
      mb.quad(at(xb - 0.0008 * S, zc + sgn * 0.002 * S), at(xb + 0.0008 * S, zc + sgn * 0.002 * S), at(xb + 0.0008 * S, zc + sgn * 0.0065 * S), at(xb - 0.0008 * S, zc + sgn * 0.0065 * S), M.hole);
    }
  }
  // ---- neck, fingerboard, nut, pegbox, pegs, scroll
  const fbEdge = sp.overstand + sp.fbThick;
  const slope = (sp.proj - fbEdge) / xb;
  const fbY = (x: number) => sp.proj - slope * (xb - x);
  const fbEnd = xn + sp.fbLen;
  const fbW = (x: number) => sp.fbW[0] + ((sp.fbW[1] - sp.fbW[0]) * (x - xn)) / sp.fbLen;
  grid(mb, 24, 8, (s, v) => {
    const x = xn + s * sp.fbLen;
    const z = (v - 0.5) * fbW(x);
    return [x, fbY(x) - sp.fbCrown * (2 * v - 1) ** 2, z];
  }, M.fittings);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 24; k++) {
      const x0 = xn + (k / 24) * sp.fbLen;
      const x1 = xn + ((k + 1) / 24) * sp.fbLen;
      const p = (x: number, y: number): Vec3 => [x, y, (side * fbW(x)) / 2];
      mb.quad(p(x0, fbY(x0) - sp.fbCrown), p(x1, fbY(x1) - sp.fbCrown), p(x1, fbY(x1) - sp.fbCrown - sp.fbThick), p(x0, fbY(x0) - sp.fbCrown - sp.fbThick), M.fittings);
    }
  }
  // the fingerboard's underside and end
  mb.quad([xn, fbY(xn) - sp.fbCrown - sp.fbThick, -fbW(xn) / 2], [fbEnd, fbY(fbEnd) - sp.fbCrown - sp.fbThick, -fbW(fbEnd) / 2], [fbEnd, fbY(fbEnd) - sp.fbCrown - sp.fbThick, fbW(fbEnd) / 2], [xn, fbY(xn) - sp.fbCrown - sp.fbThick, fbW(xn) / 2], M.fittings);
  mb.quad([fbEnd, fbY(fbEnd) - sp.fbCrown - sp.fbThick, -fbW(fbEnd) / 2], [fbEnd, fbY(fbEnd), -fbW(fbEnd) / 2], [fbEnd, fbY(fbEnd), fbW(fbEnd) / 2], [fbEnd, fbY(fbEnd) - sp.fbCrown - sp.fbThick, fbW(fbEnd) / 2], M.fittings);
  // neck: a rounded section under the fingerboard, deepening into the heel at the body
  const neckBot = (x: number) => fbY(x) - sp.fbCrown - sp.fbThick;
  grid(mb, 20, 12, (s, v) => {
    const x = xn + s * (sp.neck + 0.004);
    const dep = sp.neckDepth[0] + (sp.neckDepth[1] - sp.neckDepth[0]) * s + (s > 0.8 ? ((s - 0.8) / 0.2) ** 2 * (sp.rib * 0.55) : 0);
    const a = Math.PI * v;
    const wn = fbW(x) * 0.92;
    return [x, neckBot(x) - Math.sin(a) * dep, (Math.cos(a) * wn) / 2];
  }, M.varnish);
  // the nut
  const yNut = fbY(xn) + 0.0008 * (B / 0.356);
  cyl(mb, [xn - 0.002, yNut - 0.004, -fbW(xn) / 2], [xn - 0.002, yNut - 0.004, fbW(xn) / 2], 0.004 * (B / 0.356) ** 0.5, 0.004 * (B / 0.356) ** 0.5, 10, M.fittings);
  // pegbox: continuing the neck's line, angled back; cheeks and floor
  const pbLen = sp.pegbox;
  const pbDir = norm([-Math.cos(0.18), -Math.sin(0.18), 0]);
  const pb0: Vec3 = [xn - 0.004, neckBot(xn) + 0.002, 0];
  const pbW = fbW(xn) * 1.02;
  const pbD = sp.neckDepth[0] * 1.25;
  const pbAt = (s: number, dy: number): Vec3 => add(add(pb0, scale(pbDir, s * pbLen)), [Math.sin(0.18) * -dy, Math.cos(0.18) * dy, 0]);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 8; k++) {
      const s0 = k / 8;
      const s1 = (k + 1) / 8;
      const wz = (s: number) => (side * pbW * (1 - 0.18 * s)) / 2;
      const P = (s: number, dy: number, inset: number): Vec3 => {
        const p = pbAt(s, dy);
        return [p[0], p[1], wz(s) - side * inset];
      };
      mb.quad(P(s0, -pbD, 0), P(s1, -pbD, 0), P(s1, 0.002, 0), P(s0, 0.002, 0), M.varnish);
      mb.quad(P(s0, -pbD, 0.0035), P(s0, 0.002, 0.0035), P(s1, 0.002, 0.0035), P(s1, -pbD, 0.0035), M.varnishDark);
      mb.quad(P(s0, 0.002, 0), P(s1, 0.002, 0), P(s1, 0.002, 0.0035), P(s0, 0.002, 0.0035), M.varnishDark);
    }
  }
  {
    const a = pbAt(0, -pbD);
    const b = pbAt(1, -pbD);
    mb.quad([a[0], a[1], -pbW / 2], [b[0], b[1], -pbW / 2 * 0.82], [b[0], b[1], pbW / 2 * 0.82], [a[0], a[1], pbW / 2], M.varnish);
  }
  // pegs: two each side, through the cheeks; the strings wind on their shafts
  const pegEnd: Vec3[] = [];
  const pegS = [0.22, 0.42, 0.62, 0.82];
  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const c = pbAt(pegS[i], -pbD * 0.45);
    const r = 0.0032 * (B / 0.356) ** 0.6;
    cyl(mb, [c[0], c[1], -side * pbW * 0.42], [c[0], c[1], side * (pbW / 2 + 0.012 * (B / 0.356) ** 0.6)], r * 0.8, r, 10, M.fittings);
    // the thumb piece
    const hz = side * (pbW / 2 + 0.024 * (B / 0.356) ** 0.6);
    ellipsoid(mb, [c[0], c[1], hz], [0.011 * (B / 0.356) ** 0.6, 0.0105 * (B / 0.356) ** 0.6, 0.0035 * (B / 0.356) ** 0.6], 14, M.fittings);
    ellipsoid(mb, [c[0], c[1], side * (pbW / 2 + 0.011 * (B / 0.356) ** 0.6)], [0.004, 0.004, 0.0025], 10, M.fittings);
    pegEnd.push([c[0], c[1] + 0.001, (-side * pbW) / 6]);
  }
  // the scroll: a logarithmic volute, its turns touching, narrowing to the eye
  {
    const end = pbAt(1, -pbD * 0.5);
    const R0 = sp.scroll * 0.5;
    const turns = 2.4;
    const k = Math.log(4.2) / (turns * 2 * Math.PI);
    const cx = end[0] - R0 * 0.55;
    const cy = end[1] + R0 * 0.25;
    const a0 = -Math.PI * 0.35;
    grid(mb, 70, 12, (s, v) => {
      const th = s * turns * 2 * Math.PI;
      const r = R0 * Math.exp(-k * th);
      const gap = r * (1 - Math.exp(-k * 2 * Math.PI));
      const ang = a0 - th;
      const dir: [number, number] = [Math.cos(ang), Math.sin(ang)];
      const half = (pbW * 0.5 * (0.35 + 0.65 * Math.exp(-k * th * 1.6))) * 0.98;
      const ph = v * 2 * Math.PI;
      const rr = r - gap * 0.5 + Math.cos(ph) * gap * 0.4;
      return [cx + dir[0] * rr, cy + dir[1] * rr, Math.sin(ph) * half];
    }, M.varnish);
    ellipsoid(mb, [cx, cy, 0], [R0 * 0.28, R0 * 0.28, pbW * 0.18], 12, M.varnishDark);
  }
  // ---- bridge (maple), on the arch at the f-hole notches
  const yArchB = yTop(ub, 0.25);
  const yBtop = (z: number) => yArchB + sp.bridgeH - (z * z) / (2 * sp.bridgeR);
  {
    const th0 = 0.0042 * (B / 0.356) ** 0.7;
    const th1 = 0.0014 * (B / 0.356) ** 0.7;
    const bw = sp.bridgeW;
    const prof: [number, number][] = [];
    // outline in (z, y), feet to top arc
    prof.push([-bw / 2, yTop(ub, -0.32)], [-bw * 0.32, yTop(ub, -0.2)], [-bw * 0.3, yArchB + sp.bridgeH * 0.18], [-bw * 0.36, yArchB + sp.bridgeH * 0.42], [-bw * 0.5, yArchB + sp.bridgeH * 0.62]);
    for (let k = 0; k <= 10; k++) {
      const z = -bw * 0.5 + (k / 10) * bw;
      prof.push([z, yBtop(z * 0.9)]);
    }
    prof.push([bw * 0.5, yArchB + sp.bridgeH * 0.62], [bw * 0.36, yArchB + sp.bridgeH * 0.42], [bw * 0.3, yArchB + sp.bridgeH * 0.18], [bw * 0.32, yTop(ub, 0.2)], [bw / 2, yTop(ub, 0.32)]);
    // a thin slab, thinner at the top: front and back faces, edges
    const n = prof.length;
    const thick = (y: number) => th0 + ((th1 - th0) * (y - yArchB)) / sp.bridgeH;
    const P = (i: number, side: number): Vec3 => [xb + side * thick(prof[i][1]) * 0.5, prof[i][1], prof[i][0]];
    const cIdx = Math.floor(n / 2);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      mb.quad(P(i, -1), P(j, -1), P(j, 1), P(i, 1), M.bridgeMaple);
      for (const side of [-1, 1]) {
        const c: Vec3 = [xb + side * thick(yArchB + sp.bridgeH * 0.5) * 0.5, yArchB + sp.bridgeH * 0.55, 0];
        mb.tri(c, P(i, side), P(j, side), M.bridgeMaple);
      }
    }
    void cIdx;
    // the heart and the kidneys
    for (const [z, y, rz, ry] of [[0, 0.62, 0.07, 0.11], [-0.24, 0.42, 0.06, 0.05], [0.24, 0.42, 0.06, 0.05]] as [number, number, number, number][])
      for (const side of [-1, 1]) ellipsoid(mb, [xb + side * thick(yArchB + sp.bridgeH * y) * 0.5, yArchB + sp.bridgeH * y, z * bw], [0.0003, ry * sp.bridgeH, rz * bw], 10, M.fEdge);
  }
  // ---- strings' geometry; tailpiece (ebony), saddle, chinrest / endpin
  const zN = [0, 1, 2, 3].map((i) => (1.5 - i) * sp.spreadN);
  const zB = [0, 1, 2, 3].map((i) => (1.5 - i) * sp.spreadB);
  const yB = zB.map((z) => yBtop(z) + 0.0004);
  const after = (L / 6) * 1.0; // the afterlength, about 1/6 of the string length
  const tpTop = xb + after;
  const tpEnd = B - 0.012 * (B / 0.356);
  const tpY0 = yTop((tpTop) / B, 0) + 0.011 * (B / 0.356) ** 0.8;
  const tpY1 = sp.edge + 0.005 * (B / 0.356);
  const tailEnd: Vec3[] = zB.map((z) => [tpTop + 0.004, tpY0 + 0.003, z * 0.62]);
  {
    const wTop = sp.spreadB * 3.6;
    const wBot = sp.spreadB * 1.6;
    grid(mb, 12, 8, (s, v) => {
      const x = tpTop + s * (tpEnd - tpTop);
      const wd = wTop + (wBot - wTop) * s;
      const y = tpY0 + (tpY1 - tpY0) * s + 0.003 * (B / 0.356) * Math.sin(Math.PI * v) - 0.004 * (B / 0.356) * Math.sin(Math.PI * s) * 0.4;
      return [x, y, (v - 0.5) * wd];
    }, M.fittings, { flip: true });
    grid(mb, 12, 4, (s, v) => {
      const x = tpTop + s * (tpEnd - tpTop);
      const wd = wTop + (wBot - wTop) * s;
      const y = tpY0 + (tpY1 - tpY0) * s - 0.006 * (B / 0.356) ** 0.8;
      return [x, y, (v - 0.5) * wd];
    }, M.fittings);
    // tailgut over the saddle to the end button
    tube(mb, [[tpEnd, tpY1 - 0.002, 0], [B + 0.002, sp.edge * 0.6, 0], [B + 0.004, -sp.rib * 0.5, 0]], 0.0016 * (B / 0.356) ** 0.6, 6, M.fittings);
    cyl(mb, [B - 0.004, sp.edge - 0.001, -0.009 * (B / 0.356)], [B - 0.004, sp.edge - 0.001, 0.009 * (B / 0.356)], 0.003 * (B / 0.356) ** 0.5, 0.003 * (B / 0.356) ** 0.5, 8, M.fittings);
  }
  if (g.id === 'cello') {
    // endpin: the wooden socket and the steel rod (to the floor, set by the placement)
    const yc = -sp.rib / 2;
    mb.with(chain(translate(B, yc, 0), rotZ(-Math.PI / 2)), () => lathe(mb, [[0, -0.002], [0.017, -0.002], [0.019, 0.02], [0.012, 0.045], [0.0055, 0.05], [0, 0.05]], 16, M.fittings));
  } else {
    // end button and the chinrest over the lower bout, left of the tailpiece
    mb.with(chain(translate(B, -sp.rib / 2, 0), rotZ(-Math.PI / 2)), () => lathe(mb, [[0, 0], [0.006, 0], [0.006, 0.006], [0.0045, 0.009], [0, 0.009]], 12, M.fittings));
    const cz = sp.spreadB * 3.9;
    grid(mb, 14, 10, (s, v) => {
      const a = s * Math.PI * 2;
      const r = v;
      const x = B * 0.88 + Math.cos(a) * 0.034 * r * (B / 0.356);
      const z = cz + Math.sin(a) * 0.024 * r * (B / 0.356);
      const u = x / B;
      const base = yTop(Math.min(0.999, u), Math.max(-1, Math.min(1, z / Math.max(1e-3, wp(u)))));
      return [x, base + 0.012 * (B / 0.356) - 0.006 * (B / 0.356) * (1 - r * r) - 0.004 * r ** 10, z];
    }, M.fittings);
  }
  // purfling and the bow are added below; the bow is its own mesh, posed each frame
  // ---- bow (along +x from the frog's hair end, stick above the hair at +y)
  const hairLen = g.bowLength;
  const bm = new MeshBuilder();
  {
    const hh = 0.0008;
    // hair ribbon
    bm.quad([0, hh, -sp.hairW / 2], [hairLen, hh, -sp.hairW / 2 * 0.85], [hairLen, hh, sp.hairW / 2 * 0.85], [0, hh, sp.hairW / 2], M.bowHair);
    bm.quad([0, -hh, -sp.hairW / 2], [0, -hh, sp.hairW / 2], [hairLen, -hh, sp.hairW / 2 * 0.85], [hairLen, -hh, -sp.hairW / 2 * 0.85], M.bowHair);
    // stick: cambered towards the hair, from behind the frog to the head
    const S2 = hairLen / 0.65;
    const path: Vec3[] = [];
    for (let i = 0; i <= 32; i++) {
      const s = i / 32;
      const x = -0.07 * S2 + s * (hairLen + 0.085 * S2);
      const xs = x / hairLen;
      const hgt = 0.016 * S2 - 0.009 * S2 * Math.sin(Math.PI * Math.min(1, Math.max(0, xs))) + (xs > 0.96 ? (xs - 0.96) * 0.5 * S2 : 0);
      path.push([x, hgt, 0]);
    }
    tube(bm, path, (i) => sp.stick[0] + (sp.stick[1] - sp.stick[0]) * (i / 32), 8, M.pernambuco, { caps: true });
    // head (tip) with its plate
    const hx = hairLen + 0.004;
    bm.with(translate(hx, 0, 0), () => {
      box3(bm, [-0.004, -0.001, -sp.stick[1] * 1.1], [0.008, 0.024 * S2, sp.stick[1] * 1.1], M.pernambuco);
      box3(bm, [0.008, -0.001, -sp.stick[1] * 1.05], [0.0095, 0.022 * S2, sp.stick[1] * 1.05], M.pearl);
    });
    // frog: ebony with the silver ferrule and the pearl eye; adjuster button behind
    box3(bm, [-0.045 * S2, -0.002, -0.0065 * S2], [0.002, 0.0125 * S2, 0.0065 * S2], M.fittings);
    box3(bm, [0.0, -0.0022, -0.0068 * S2], [0.003, 0.004, 0.0068 * S2], M.silver);
    for (const sd of [-1, 1]) ellipsoid(bm, [-0.02 * S2, 0.006 * S2, sd * 0.0066 * S2], [0.0028, 0.0028, 0.0004], 10, M.pearl);
    cyl(bm, [-0.07 * S2, 0.016 * S2, 0], [-0.086 * S2, 0.016 * S2, 0], 0.0048, 0.0048, 10, M.silver);
    cyl(bm, [-0.075 * S2, 0.016 * S2, 0], [-0.081 * S2, 0.016 * S2, 0], 0.0051, 0.0051, 10, M.fittings);
  }
  // placement in the world
  let T: Mat4;
  let floorY: number;
  if (g.id === 'cello') {
    // standing on its endpin, leaning back towards the (absent) player
    const lean = 0.32;
    const tailY = 0.33;
    // local x (scroll → tail) down, local y (the top's normal) towards the front (−z), local z across
    const R0 = new Float32Array([0, -1, 0, 0, 0, 0, -1, 0, 1, 0, 0, 0, 0, 0, 0, 1]);
    T = chain(translate(0, tailY, 0), rotX(lean), R0, translate(-B, sp.rib / 2, 0));
    floorY = 0;
    // endpin rod to the floor
    const base = xform(T, [B + 0.05, -sp.rib / 2, 0]);
    const dir = norm(sub(xform(T, [B + 0.2, -sp.rib / 2, 0]), base));
    const len = base[1] / Math.max(0.2, -dir[1]);
    const Tinv = invertRigid(T);
    const a = xform(Tinv, base);
    const b = xform(Tinv, add(base, scale(dir, len)));
    cyl(mb, a, b, 0.0045, 0.0045, 10, M.steel);
    cyl(mb, xform(Tinv, add(base, scale(dir, len - 0.012))), b, 0.0045, 0.0005, 10, M.darkSteel);
  } else {
    // held at playing height on the shoulder, scroll up and to the left, top tilted up to the light
    const h = g.id === 'viola' ? 0.24 : 0.22;
    T = chain(translate(0, h, 0), rotZ(-0.12), rotX(-0.55), translate(-B * 0.42, 0, 0));
    floorY = 0;
  }
  const c = xform(T, [B * 0.3, 0, 0]);
  const extent = B + sp.neck + sp.pegbox + sp.scroll;
  return {
    id: g.id,
    sp,
    L,
    T,
    meshes: [mb.build()],
    top: topMb.build(),
    bow: bm.build(),
    hairLen,
    xn,
    xb,
    zN,
    zB,
    yN: yNut + 0.0008,
    yB,
    tailEnd,
    pegEnd,
    fbY,
    bounds: { c: [c[0], Math.max(c[1], extent * 0.35), c[2]], r: extent * 0.9 + 0.1 },
    floorY,
    src: xform(T, [xb + 0.05, 0.05, 0]),
  };
}

function box3(mb: MeshBuilder, lo: Vec3, hi: Vec3, m: Mat): void {
  const [x0, y0, z0] = lo;
  const [x1, y1, z1] = hi;
  mb.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], m);
  mb.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], m);
  mb.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], m);
  mb.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], m);
  mb.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], m);
  mb.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], m);
}

/** inverse of a rotation + translation */
function invertRigid(m: Mat4): Mat4 {
  const r = new Float32Array([m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1]);
  const t = xform(r, [m[12], m[13], m[14]]);
  r[12] = -t[0];
  r[13] = -t[1];
  r[14] = -t[2];
  return r;
}

const C = {
  verm: (a: number) => ink(INK.vermilion, a),
  amber: (a: number) => ink(INK.amber, a),
};

export function poseBowed(b: Batch, bm: BowedModel, fr: VisualFrame | null, str: { of(v: number): number }, modes: Float32Array): void {
  const { T, sp } = bm;
  for (const m of bm.meshes) b.mesh(m, T);
  b.mesh(bm.top, T);
  b.ov.amps.set(modes);
  b.ov.mn.set(plateModes(0.55));
  b.ov.modalGain = 0.9;
  const W = (p: Vec3) => xform(T, p);
  const strs = fr?.strings;
  const focus = fr?.focus ?? null;
  const bowedIdx = strs ? strs.findIndex((s) => s.bowing) : -1;
  // purfling: a dark line just inside the edge of the top
  {
    const B = sp.body;
    const N = 60;
    for (const side of [-1, 1]) {
      const pts: Vec3[] = [];
      for (let i = 1; i < N; i++) {
        const u = i / N;
        const wpu = halfWidth(sp, u) + sp.over - 0.0042 * (B / 0.356) ** 0.5;
        const t = wpu / (halfWidth(sp, u) + sp.over);
        pts.push(W([u * B, sp.edge + (sp.archT - sp.edge * 0.6) * longArch(u) * crossArch(t) + 0.0003, side * Math.max(0, wpu)]));
      }
      b.ink(pts, [0.05, 0.02, 0.01, 0.75], 1.4);
    }
  }
  // strings: peg → nut → bridge → tailpiece; their glow; the stopping point; the bowed one's shape
  let mx = 0;
  if (focus) for (const s of focus.shapes) for (let i = 0; i < s.length; i++) mx = Math.max(mx, Math.abs(s[i]));
  const sc = str.of(mx);
  const at = (i: number, x: number): Vec3 => {
    const f = (x - bm.xn) / (bm.xb - bm.xn);
    return [x, bm.yN + (bm.yB[i] - bm.yN) * f, bm.zN[i] + (bm.zB[i] - bm.zN[i]) * f];
  };
  // the bow's direction across the strings: tangent to the bridge arc at the bowed string
  const bi = bowedIdx >= 0 ? bowedIdx : 1;
  const zb = bm.zB[bi];
  const slopeZ = -zb / sp.bridgeR;
  const dirL = norm([0, slopeZ, 1]); // along the hair, local (from frog → tip: towards +z)
  const upL = norm(cross(dirL, [1, 0, 0])); // away from the top: the stick's side
  const beta = focus ? Math.max(0.03, Math.min(0.3, 1 - focus.hammerAt)) : 0.1;
  for (let i = 0; i < 4; i++) {
    const s = strs?.[i];
    const l = s ? Math.min(1, s.level * 3) : 0;
    const wound = i < 3;
    const base: RGBA = bm.id === 'cello' ? [0.62, 0.63, 0.66, 0.9] : wound ? [0.78, 0.76, 0.7, 0.85] : [0.85, 0.86, 0.88, 0.8];
    const nut = at(i, bm.xn);
    const br = at(i, bm.xb);
    b.ink([W(bm.pegEnd[i]), W(nut), W(br), W(bm.tailEnd[i])], base, bm.id === 'cello' ? 1.6 - i * 0.15 : 1.3 - i * 0.12);
    const stopFrac = s ? (s.stopNow ?? s.stop) : 1;
    const xs = bm.xb - stopFrac * bm.L;
    if (l > 0.03) b.line([W(at(i, Math.max(bm.xn, xs))), W(br)], s?.bowing ? C.verm(0.2 + 0.55 * l) : C.amber(0.15 + 0.5 * l), 1.6);
    // the stopping point: a glowing bar on the fingerboard under the string
    if (s && s.stop < 0.999 && s.level > 0.002) {
      const y = bm.fbY(xs) + 0.0006;
      const zc = at(i, xs)[2];
      const half = sp.spreadN * 0.75;
      // a halo, then the bar, then the finger's contact with the string
      b.line([W([xs, y, zc - half * 1.6]), W([xs, y, zc + half * 1.6])], C.amber(0.28), 16);
      b.line([W([xs, y, zc - half]), W([xs, y, zc + half])], C.amber(0.95), 7);
      b.line([W([xs, y, zc]), W(at(i, xs))], C.amber(0.75), 3);
    }
    // the bowed string, moving in the bowing direction between the stop and the bridge
    if (focus && i === bowedIdx && focus.shapes[0]) {
      const sh = focus.shapes[0];
      const x0 = Math.max(bm.xn, xs);
      const line: Vec3[] = [];
      for (let k = 0; k < sh.length; k++) {
        const x = x0 + (k / (sh.length - 1)) * (bm.xb - x0);
        const p = at(i, x);
        const d = (sh[k] / sc) * 0.01 * (sp.body / 0.356);
        line.push(W(add(p, scale(dirL, d))));
      }
      b.line(line, C.verm(0.95), 2.2);
    }
  }
  // the bow: hair on the bowed string at its contact point, at the hair position along the bow
  const bow = fr?.bow;
  const contactX = bm.xb - beta * (strs?.[bi] ? (strs[bi].stopNow ?? strs[bi].stop) : 1) * bm.L;
  const contact = at(bi, contactX);
  const pos = bow ? bow.pos : 0.5;
  // bow frame (local): x' along the hair (frog → tip), y' to the stick, z' along the string
  const ax = dirL; // the frog on the treble side: the hair runs towards the bass strings
  const ay = upL;
  const az = cross(ax, ay);
  const origin = sub(add(contact, scale(ay, 0.0012)), scale(ax, pos * bm.hairLen));
  const Bm = new Float32Array([ax[0], ax[1], ax[2], 0, ay[0], ay[1], ay[2], 0, az[0], az[1], az[2], 0, origin[0], origin[1], origin[2], 1]);
  const bowM = mul(T, Bm);
  b.mesh(bm.bow, bowM, bow?.changing ? [0.95, 0.65, 0.27, 0.35] : null);
  if (bow && bowedIdx >= 0) {
    const c = W(contact);
    const n = norm(xdir(T, upL));
    b.line([sub(c, scale(n, 0.002)), add(c, scale(n, 0.004))], C.verm(0.9), 6);
  }
}

/** a default camera for each */
export function bowedTarget(bm: BowedModel): Vec3 {
  return bm.bounds.c;
}
export { lerp3, rotY };
