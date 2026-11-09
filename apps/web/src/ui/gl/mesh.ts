// Geometry for the 3D stage: a mesh builder and the few primitives the instruments are made of
// (boxes, lathed solids, tubes swept along a path, extruded outlines, parametric surfaces), and
// the materials. Everything is built once per instrument; units are metres.
import { type Mat4, type Mesh, type Vec3, add, cross, norm, scale, sub, xdir, xform } from './gl3d.ts';

/** a surface: sRGB colour, roughness, metalness, and a kind (0 plain, 1 modal plate, 2 tube glow,
 *  3 floor). The renderer turns each into a physically based material (`mats3.ts`, by `name`);
 *  `paint` gives a surface its own painted maps (a violin's plates: varnish, purfling, f-holes). */
export interface Mat {
  col: Vec3;
  rough: number;
  metal: number;
  kind?: number;
  /** the material family the renderer shades it as (set below for the shared ones) */
  name?: string;
  /** a per-instrument painted surface: drawn once, in the browser, when first shown */
  paint?: PaintSpec;
  /** use `col` instead of the family's own colour */
  tint?: boolean;
}
/** maps painted on a canvas over a plate's local (x, z) rectangle: colour (+ alpha cut-outs) and an
 *  auxiliary map (r: figure/flame for the angle-dependent sheen, g: distance from the edge) */
export interface PaintSpec {
  key: string;
  /** the local rectangle [x0, z0, x1, z1] (metres) the maps cover; u along x, v along z */
  rect: [number, number, number, number];
  /** pixels along x (z follows the aspect) */
  px: number;
  draw: (c: CanvasRenderingContext2D, aux: CanvasRenderingContext2D, w: number, h: number) => void;
  /** holes: alpha below 0.5 is cut away */
  cut?: boolean;
}
/** every material by id (the meshes store ids per vertex) */
export const MAT_LIST: Mat[] = [];
const matIds = new Map<Mat, number>();
export function matId(m: Mat): number {
  let id = matIds.get(m);
  if (id === undefined) {
    id = MAT_LIST.length;
    MAT_LIST.push(m);
    matIds.set(m, id);
  }
  return id;
}
const hex = (h: string): Vec3 => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export const M = {
  // a hand-rubbed polished ebonised case (most concert grands), read on a dark ground through its reflections
  lacquer: { col: hex('#0b0a0a'), rough: 0.16, metal: 0 },
  lacquerSatin: { col: hex('#100e0d'), rough: 0.32, metal: 0 },
  caseInner: { col: hex('#2a1d14'), rough: 0.45, metal: 0 },
  // the cast-iron frame, gold-bronze lacquer
  plate: { col: hex('#b48c4c'), rough: 0.36, metal: 0.75 },
  // Sitka spruce soundboard (varnished), maple bridges, hard-maple pin block
  spruce: { col: hex('#b98f58'), rough: 0.42, metal: 0, kind: 1 },
  spruceBare: { col: hex('#c9a46c'), rough: 0.55, metal: 0 },
  maple: { col: hex('#a87a48'), rough: 0.45, metal: 0 },
  // action woods: hornbeam shanks, maple mouldings, key sticks (basswood/spruce)
  hornbeam: { col: hex('#e2c99a'), rough: 0.5, metal: 0 },
  keyWood: { col: hex('#c6a57a'), rough: 0.7, metal: 0 },
  actionWood: { col: hex('#a87b4c'), rough: 0.6, metal: 0 },
  // felts: hammer felt (pressed wool, cream), damper felt (white), the red/green cloth of rails
  hammerFelt: { col: hex('#ece4cf'), rough: 0.95, metal: 0 },
  damperFelt: { col: hex('#d9d6cf'), rough: 0.96, metal: 0 },
  redFelt: { col: hex('#7a1f1c'), rough: 0.95, metal: 0 },
  buckskin: { col: hex('#b39876'), rough: 0.92, metal: 0 },
  // key tops
  ivory: { col: hex('#ece6d6'), rough: 0.26, metal: 0 },
  ebony: { col: hex('#141212'), rough: 0.3, metal: 0 },
  // metals
  steel: { col: hex('#c9ccd0'), rough: 0.22, metal: 1 },
  darkSteel: { col: hex('#5b5e63'), rough: 0.4, metal: 1 },
  nickel: { col: hex('#d6d6d2'), rough: 0.14, metal: 1 },
  copper: { col: hex('#c78a5c'), rough: 0.3, metal: 1 },
  brass: { col: hex('#d7b065'), rough: 0.17, metal: 1 },
  brassGlow: { col: hex('#d7b065'), rough: 0.17, metal: 1, kind: 2 },
  brassDull: { col: hex('#b8975a'), rough: 0.35, metal: 1 },
  silver: { col: hex('#dcdcdc'), rough: 0.1, metal: 1 },
  silverGlow: { col: hex('#dcdcdc'), rough: 0.1, metal: 1, kind: 2 },
  pad: { col: hex('#e8dcc0'), rough: 0.8, metal: 0 },
  pearl: { col: hex('#efe9df'), rough: 0.18, metal: 0 },
  castAction: { col: hex('#8c8a86'), rough: 0.45, metal: 0.8 },
  // the violin family: spirit/oil varnish over flamed maple and spruce, ebony fittings
  varnish: { col: hex('#56240f'), rough: 0.22, metal: 0 },
  varnishTop: { col: hex('#6e3519'), rough: 0.22, metal: 0, kind: 1 },
  varnishDark: { col: hex('#3e1607'), rough: 0.24, metal: 0 },
  fEdge: { col: hex('#2a1206'), rough: 0.5, metal: 0 },
  hole: { col: hex('#050302'), rough: 1, metal: 0 },
  fittings: { col: hex('#1a1412'), rough: 0.28, metal: 0 },
  bridgeMaple: { col: hex('#dcc196'), rough: 0.6, metal: 0 },
  pernambuco: { col: hex('#6b2e14'), rough: 0.3, metal: 0 },
  bowHair: { col: hex('#ede7da'), rough: 0.85, metal: 0 },
  floor: { col: hex('#13110e'), rough: 0.7, metal: 0, kind: 3 },
  // inside a violin's body (seen through the f-holes), pegs and fittings, strings and their silk
  interior: { col: hex('#2a160b'), rough: 0.9, metal: 0 },
  rosewood: { col: hex('#3a1a0e'), rough: 0.35, metal: 0 },
  boxwood: { col: hex('#d9b878'), rough: 0.4, metal: 0 },
  gut: { col: hex('#2a2420'), rough: 0.5, metal: 0 },
  rubber: { col: hex('#151413'), rough: 0.85, metal: 0 },
  leather: { col: hex('#2b1a12'), rough: 0.75, metal: 0 },
  silk: { col: hex('#b0281e'), rough: 0.6, metal: 0 },
  silkGold: { col: hex('#c9962a'), rough: 0.6, metal: 0 },
  stringSteel: { col: hex('#c9ccd2'), rough: 0.24, metal: 1 },
  stringWound: { col: hex('#a7a9ad'), rough: 0.3, metal: 1 },
  // the flute and the trumpet (winds3d.ts): polished silver (the flute, the mouthpiece), the dark
  // bore seen down a hole, lacquered yellow brass, nickel silver (caps, stems, inner slides), the
  // valves' felts, the water key's cork, the buttons' pearl
  silverPolish: { col: hex('#e8e8e6'), rough: 0.12, metal: 1 },
  boreDark: { col: hex('#2b2b2a'), rough: 0.45, metal: 1 },
  brassLacquer: { col: hex('#e9c06a'), rough: 0.2, metal: 1 },
  nickelSilver: { col: hex('#d9d8d2'), rough: 0.14, metal: 1 },
  valveFelt: { col: hex('#4a1a14'), rough: 0.95, metal: 0 },
  cork: { col: hex('#a98458'), rough: 0.9, metal: 0 },
  pearlInlay: { col: hex('#efe9df'), rough: 0.3, metal: 0 },
  nickelSatin: { col: hex('#d9d8d2'), rough: 0.32, metal: 1 },
  silverKeys: { col: hex('#e8e8e6'), rough: 0.18, metal: 1 },
  // pianos: the plate's gold-bronze lacquer over cast iron, the hammers' coloured underfelt, the
  // green baize of the action, bronze action brackets, mahogany hammer mouldings, the key tops
  pianoPlate: { col: hex('#a27a36'), rough: 0.38, metal: 0.8 },
  underfelt: { col: hex('#5c1418'), rough: 1, metal: 0 },
  greenFelt: { col: hex('#1f4a36'), rough: 1, metal: 0 },
  bracketCast: { col: hex('#7d7354'), rough: 0.42, metal: 0.85 },
  mahogany: { col: hex('#6b3219'), rough: 0.5, metal: 0 },
  keyIvory: { col: hex('#f0ebdf'), rough: 0.3, metal: 0 },
  pinSteel: { col: hex('#bfc2c7'), rough: 0.34, metal: 1 },
  caseRaw: { col: hex('#151210'), rough: 0.85, metal: 0 },
} satisfies Record<string, Mat>;
for (const [k, m] of Object.entries(M)) (m as Mat).name = k;
/** a variant of a shared material (same shading family, its own colour or maps) */
export const variant = (m: Mat, o: Partial<Mat>): Mat => ({ ...m, ...o, name: o.name ?? m.name });

export class MeshBuilder {
  private v: number[] = [];
  private ids: number[] = [];
  private loc: number[] = [];
  /** the transform applied to everything added (positions and normals) */
  T: Mat4 | null = null;
  vert(p: Vec3, n: Vec3, m: Mat, uv: [number, number] = [0, 0]): void {
    const q = this.T ? xform(this.T, p) : p;
    const nn = this.T ? norm(xdir(this.T, n)) : n;
    this.v.push(q[0], q[1], q[2], nn[0], nn[1], nn[2], m.col[0], m.col[1], m.col[2], m.rough, m.metal, m.kind ?? 0, uv[0], uv[1]);
    this.ids.push(matId(m));
    // the part's own coordinates (before `T`): solid textures (wood grain) follow the part
    this.loc.push(p[0], p[1], p[2]);
  }
  /** a flat triangle (normal from its winding) */
  tri(a: Vec3, b: Vec3, c: Vec3, m: Mat, uv?: [[number, number], [number, number], [number, number]]): void {
    const n = norm(cross(sub(b, a), sub(c, a)));
    this.vert(a, n, m, uv?.[0]);
    this.vert(b, n, m, uv?.[1]);
    this.vert(c, n, m, uv?.[2]);
  }
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, m: Mat): void {
    this.tri(a, b, c, m);
    this.tri(a, c, d, m);
  }
  /** smooth triangle with given normals */
  stri(a: Vec3, b: Vec3, c: Vec3, na: Vec3, nb: Vec3, nc: Vec3, m: Mat, ua?: [number, number], ub?: [number, number], uc?: [number, number]): void {
    this.vert(a, na, m, ua);
    this.vert(b, nb, m, ub);
    this.vert(c, nc, m, uc);
  }
  get count(): number {
    return this.v.length / 14;
  }
  build(): Mesh {
    return { data: new Float32Array(this.v), count: this.v.length / 14, mats: Uint16Array.from(this.ids), loc: new Float32Array(this.loc) };
  }
  /** run `f` with an extra transform */
  with(T: Mat4, f: () => void): void {
    const old = this.T;
    this.T = old ? mulM(old, T) : T;
    f();
    this.T = old;
  }
}
function mulM(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}

/** an axis-aligned box from min to max corner */
export function box(mb: MeshBuilder, lo: Vec3, hi: Vec3, m: Mat): void {
  const [x0, y0, z0] = lo;
  const [x1, y1, z1] = hi;
  mb.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], m); // top
  mb.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], m); // bottom
  mb.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], m); // front (−z)
  mb.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], m); // back
  mb.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], m); // −x
  mb.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], m); // +x
}

/** a box with its vertical edges and top edges softened (a bevel of size b) */
export function bbox(mb: MeshBuilder, lo: Vec3, hi: Vec3, m: Mat, b: number): void {
  const [x0, y0, z0] = lo;
  const [x1, y1, z1] = hi;
  const poly: [number, number][] = [
    [x0 + b, z0], [x1 - b, z0], [x1, z0 + b], [x1, z1 - b], [x1 - b, z1], [x0 + b, z1], [x0, z1 - b], [x0, z0 + b],
  ];
  extrude(mb, poly, y0, y1 - b, m, { smooth: 0.9 });
  // the bevelled top: an inset cap and its chamfer
  const inset = poly.map(([x, z]): [number, number] => [x + (x < (x0 + x1) / 2 ? b : -b) * 0.7, z + (z < (z0 + z1) / 2 ? b : -b) * 0.7]);
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    mb.quad([poly[i][0], y1 - b, poly[i][1]], [inset[i][0], y1, inset[i][1]], [inset[j][0], y1, inset[j][1]], [poly[j][0], y1 - b, poly[j][1]], m);
  }
  fanCap(mb, inset, y1, m, true);
}

/** a solid of revolution about the local y axis: profile [radius, y] from bottom to top */
export function lathe(mb: MeshBuilder, prof: [number, number][], seg: number, m: Mat, uvRange: [number, number] | null = null): void {
  const n = prof.length;
  // profile normals in (r, y): perpendicular to the averaged tangent
  const pn: [number, number][] = prof.map((_, i) => {
    const a = prof[Math.max(0, i - 1)];
    const b = prof[Math.min(n - 1, i + 1)];
    const tr = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tr, ty) || 1;
    return [ty / l, -tr / l];
  });
  let total = 0;
  const acc = [0];
  for (let i = 1; i < n; i++) acc.push((total += Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1])));
  for (let i = 0; i < n - 1; i++)
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2;
      const a1 = ((k + 1) / seg) * Math.PI * 2;
      const P = (j: number, a: number): Vec3 => [prof[j][0] * Math.cos(a), prof[j][1], prof[j][0] * Math.sin(a)];
      const N = (j: number, a: number): Vec3 => norm([pn[j][0] * Math.cos(a), pn[j][1], pn[j][0] * Math.sin(a)]);
      const u = (j: number): [number, number] => (uvRange ? [uvRange[0] + ((uvRange[1] - uvRange[0]) * acc[j]) / (total || 1), 0] : [0, 0]);
      mb.stri(P(i, a0), P(i + 1, a0), P(i + 1, a1), N(i, a0), N(i + 1, a0), N(i + 1, a1), m, u(i), u(i + 1), u(i + 1));
      mb.stri(P(i, a0), P(i + 1, a1), P(i, a1), N(i, a0), N(i + 1, a1), N(i, a1), m, u(i), u(i + 1), u(i));
    }
}

/** a cylinder (or cone frustum) from a to b */
export function cyl(mb: MeshBuilder, a: Vec3, b: Vec3, r0: number, r1: number, seg: number, m: Mat, caps = true): void {
  const d = sub(b, a);
  const L = Math.hypot(d[0], d[1], d[2]);
  if (L < 1e-9) return;
  const y = scale(d, 1 / L);
  const x = norm(Math.abs(y[1]) < 0.9 ? cross(y, [0, 1, 0]) : cross(y, [1, 0, 0]));
  const z = cross(x, y);
  const T = new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, a[0], a[1], a[2], 1]);
  mb.with(T, () => {
    const prof: [number, number][] = caps ? [[0, 0], [r0, 0], [r0, 0], [r1, L], [r1, L], [0, L]] : [[r0, 0], [r1, L]];
    if (caps) {
      lathe(mb, [[0, 0], [r0, 0]], seg, m);
      lathe(mb, [[r0, 0], [r1, L]], seg, m);
      lathe(mb, [[r1, L], [0, L]], seg, m);
    } else lathe(mb, prof, seg, m);
  });
}

/** a sphere / ellipsoid (normals from the inverse-transposed scale) */
export function ellipsoid(mb: MeshBuilder, c: Vec3, r: Vec3, seg: number, m: Mat): void {
  const nr = Math.max(4, Math.round(seg / 2));
  const P = (i: number, k: number): [Vec3, Vec3] => {
    const a = -Math.PI / 2 + (i / nr) * Math.PI;
    const b = (k / seg) * Math.PI * 2;
    const s: Vec3 = [Math.cos(a) * Math.cos(b), Math.sin(a), Math.cos(a) * Math.sin(b)];
    return [[c[0] + r[0] * s[0], c[1] + r[1] * s[1], c[2] + r[2] * s[2]], norm([s[0] / r[0], s[1] / r[1], s[2] / r[2]])];
  };
  for (let i = 0; i < nr; i++)
    for (let k = 0; k < seg; k++) {
      const [a, na] = P(i, k);
      const [b, nb] = P(i + 1, k);
      const [cc, nc] = P(i + 1, k + 1);
      const [d, nd] = P(i, k + 1);
      mb.stri(a, b, cc, na, nb, nc, m);
      mb.stri(a, cc, d, na, nc, nd, m);
    }
}

/** parallel-transport frames along a path */
function frames(path: Vec3[]): { t: Vec3[]; n: Vec3[]; b: Vec3[] } {
  const N = path.length;
  const t: Vec3[] = path.map((_, i) => norm(sub(path[Math.min(N - 1, i + 1)], path[Math.max(0, i - 1)])));
  const n: Vec3[] = [];
  const b: Vec3[] = [];
  let nn = norm(Math.abs(t[0][1]) < 0.9 ? cross(t[0], [0, 1, 0]) : cross(t[0], [1, 0, 0]));
  for (let i = 0; i < N; i++) {
    if (i > 0) {
      // remove the component along the new tangent (rotation-minimising, near enough)
      const d = t[i][0] * nn[0] + t[i][1] * nn[1] + t[i][2] * nn[2];
      nn = norm(sub(nn, scale(t[i], d)));
    }
    n.push(nn);
    b.push(cross(t[i], nn));
  }
  return { t, n, b };
}

/** a tube swept along a path; radius per point; uv.x runs 0..1 along the path (for the tube glow) */
export function tube(mb: MeshBuilder, path: Vec3[], radius: number | ((i: number) => number), seg: number, m: Mat, opts: { caps?: boolean; uv0?: number; uv1?: number; flat?: number } = {}): void {
  const N = path.length;
  if (N < 2) return;
  const { n, b } = frames(path);
  const R = (i: number) => (typeof radius === 'number' ? radius : radius(i));
  const acc = [0];
  for (let i = 1; i < N; i++) acc.push(acc[i - 1] + Math.hypot(...sub(path[i], path[i - 1])));
  const tot = acc[N - 1] || 1;
  const u0 = opts.uv0 ?? 0;
  const u1 = opts.uv1 ?? 1;
  const fl = opts.flat ?? 1; // squash in the binormal direction (an oval section)
  const ring = (i: number, k: number): [Vec3, Vec3] => {
    const a = (k / seg) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a) * fl;
    const dir = add(scale(n[i], c), scale(b[i], s));
    const nd = norm(add(scale(n[i], Math.cos(a) * fl), scale(b[i], Math.sin(a))));
    return [add(path[i], scale(dir, R(i))), nd];
  };
  for (let i = 0; i < N - 1; i++) {
    const ua: [number, number] = [u0 + ((u1 - u0) * acc[i]) / tot, 0];
    const ub: [number, number] = [u0 + ((u1 - u0) * acc[i + 1]) / tot, 0];
    for (let k = 0; k < seg; k++) {
      const [p00, n00] = ring(i, k);
      const [p01, n01] = ring(i, k + 1);
      const [p10, n10] = ring(i + 1, k);
      const [p11, n11] = ring(i + 1, k + 1);
      mb.stri(p00, p10, p11, n00, n10, n11, m, ua, ub, ub);
      mb.stri(p00, p11, p01, n00, n11, n01, m, ua, ub, ua);
    }
  }
  if (opts.caps) {
    for (const [i, sgn] of [[0, -1], [N - 1, 1]] as const) {
      const t = norm(sub(path[Math.min(N - 1, i + 1)], path[Math.max(0, i - 1)]));
      const nn = scale(t, sgn);
      for (let k = 0; k < seg; k++) {
        const a = ring(i, k)[0];
        const c = ring(i, k + 1)[0];
        if (sgn > 0) mb.stri(path[i], a, c, nn, nn, nn, m);
        else mb.stri(path[i], c, a, nn, nn, nn, m);
      }
    }
  }
}

// ---------------------------------------------------------------- polygons
/** signed area of a polygon in (x, z) */
export function area(p: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, z0] = p[i];
    const [x1, z1] = p[(i + 1) % p.length];
    s += x0 * z1 - x1 * z0;
  }
  return s / 2;
}
/** ear-clipping triangulation of a simple polygon; returns index triples (counter-clockwise in x,z) */
export function triangulate(poly: [number, number][]): [number, number, number][] {
  const n = poly.length;
  const idx = Array.from({ length: n }, (_, i) => i);
  if (area(poly) < 0) idx.reverse();
  const out: [number, number, number][] = [];
  const cr = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: number[], a: number[], b: number[], c: number[]) => cr(a, b, p) >= -1e-12 && cr(b, c, p) >= -1e-12 && cr(c, a, p) >= -1e-12;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length];
      const ib = idx[i];
      const ic = idx[(i + 1) % idx.length];
      const a = poly[ia];
      const b = poly[ib];
      const c = poly[ic];
      if (cr(a, b, c) <= 1e-12) continue;
      let ok = true;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (inside(poly[j], a, b, c)) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
/** a horizontal cap at height y (up: normal +y) */
export function fanCap(mb: MeshBuilder, poly: [number, number][], y: number, m: Mat, up: boolean, uv?: (x: number, z: number) => [number, number]): void {
  const tris = triangulate(poly);
  const n: Vec3 = up ? [0, 1, 0] : [0, -1, 0];
  for (const [a, b, c] of tris) {
    const P = (i: number): Vec3 => [poly[i][0], y, poly[i][1]];
    const U = (i: number) => (uv ? uv(poly[i][0], poly[i][1]) : undefined);
    // counter-clockwise in (x, z) seen from +y is clockwise: order for an upward normal
    if (up) mb.stri(P(a), P(c), P(b), n, n, n, m, U(a), U(c), U(b));
    else mb.stri(P(a), P(b), P(c), n, n, n, m, U(a), U(b), U(c));
  }
}
/** a prism: the outline (x, z) from y0 to y1, with caps; side normals smoothed below `smooth` (cos of the crease angle) */
export function extrude(mb: MeshBuilder, poly: [number, number][], y0: number, y1: number, m: Mat, opts: { smooth?: number; top?: boolean; bottom?: boolean; topMat?: Mat; uv?: (x: number, z: number) => [number, number] } = {}): void {
  const n = poly.length;
  const ccw = area(poly) > 0;
  const en: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % n];
    const l = Math.hypot(x1 - x0, z1 - z0) || 1;
    // outward normal of edge i
    en.push(ccw ? [(z1 - z0) / l, -(x1 - x0) / l] : [-(z1 - z0) / l, (x1 - x0) / l]);
  }
  const sm = opts.smooth ?? 0.7;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const e = en[i];
    const vn = (k: number, other: [number, number]): Vec3 => {
      const d = e[0] * other[0] + e[1] * other[1];
      if (d < sm) return [e[0], 0, e[1]];
      const x = e[0] + other[0];
      const z = e[1] + other[1];
      const l = Math.hypot(x, z) || 1;
      void k;
      return [x / l, 0, z / l];
    };
    const na = vn(i, en[(i + n - 1) % n]);
    const nb = vn(j, en[j]);
    const a0: Vec3 = [poly[i][0], y0, poly[i][1]];
    const b0: Vec3 = [poly[j][0], y0, poly[j][1]];
    const a1: Vec3 = [poly[i][0], y1, poly[i][1]];
    const b1: Vec3 = [poly[j][0], y1, poly[j][1]];
    mb.stri(a0, b0, b1, na, nb, nb, m);
    mb.stri(a0, b1, a1, na, nb, na, m);
  }
  if (opts.top !== false) fanCap(mb, poly, y1, opts.topMat ?? m, true, opts.uv);
  if (opts.bottom !== false) fanCap(mb, poly, y0, m, false, opts.uv);
}
/** a wall along an open polyline (x, z) from y0 to y1, both faces */
export function wall(mb: MeshBuilder, line: [number, number][], y0: number, y1: number, m: Mat): void {
  for (let i = 0; i < line.length - 1; i++) {
    const [x0, z0] = line[i];
    const [x1, z1] = line[i + 1];
    mb.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], m);
  }
}
/** offset a closed or open polyline (x, z) sideways by d (positive: to the left of travel) */
export function offset(line: [number, number][], d: number, closed = false): [number, number][] {
  const n = line.length;
  return line.map((p, i) => {
    const a = line[closed ? (i + n - 1) % n : Math.max(0, i - 1)];
    const b = line[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0];
    const tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    return [p[0] - (tz / l) * d, p[1] + (tx / l) * d];
  });
}

/** a parametric surface f(u, v) over [0,1]², nu × nv cells; normals from the grid; uv passed through */
export function grid(mb: MeshBuilder, nu: number, nv: number, f: (u: number, v: number) => Vec3, m: Mat, opts: { flip?: boolean; uv?: (u: number, v: number) => [number, number]; wrapV?: boolean } = {}): void {
  const P: Vec3[][] = [];
  for (let i = 0; i <= nu; i++) {
    P.push([]);
    for (let j = 0; j <= nv; j++) P[i].push(f(i / nu, j / nv));
  }
  // with wrapV the v = 0 and v = 1 rows are the same loop: their normals are taken across the seam
  const at = (i: number, j: number): Vec3 => {
    if (opts.wrapV) return P[i][((j % nv) + nv) % nv];
    return P[i][Math.max(0, Math.min(nv, j))];
  };
  const Nr: Vec3[][] = P.map((row, i) =>
    row.map((_, j) => {
      const du = sub(P[Math.min(nu, i + 1)][j], P[Math.max(0, i - 1)][j]);
      const dv = sub(at(i, j + 1), at(i, j - 1));
      let n = cross(du, dv);
      if (Math.hypot(...n) < 1e-14) n = [0, 1, 0];
      n = norm(n);
      return opts.flip ? scale(n, -1) : n;
    }),
  );
  const U = (i: number, j: number) => (opts.uv ? opts.uv(i / nu, j / nv) : undefined);
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = P[i][j];
      const b = P[i + 1][j];
      const c = P[i + 1][j + 1];
      const d = P[i][j + 1];
      if (opts.flip) {
        mb.stri(a, c, b, Nr[i][j], Nr[i + 1][j + 1], Nr[i + 1][j], m, U(i, j), U(i + 1, j + 1), U(i + 1, j));
        mb.stri(a, d, c, Nr[i][j], Nr[i][j + 1], Nr[i + 1][j + 1], m, U(i, j), U(i, j + 1), U(i + 1, j + 1));
      } else {
        mb.stri(a, b, c, Nr[i][j], Nr[i + 1][j], Nr[i + 1][j + 1], m, U(i, j), U(i + 1, j), U(i + 1, j + 1));
        mb.stri(a, c, d, Nr[i][j], Nr[i + 1][j + 1], Nr[i][j + 1], m, U(i, j), U(i + 1, j + 1), U(i, j + 1));
      }
    }
}
export function spline(pts: [number, number][], per: number, closed = false): [number, number][] {
  const n = pts.length;
  const out: [number, number][] = [];
  const P = (i: number) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

/** the floor: a large quad the shadow falls on, fading into the ground */
export function floorMesh(c: Vec3, half: number): Mesh {
  const mb = new MeshBuilder();
  const [x, y, z] = c;
  mb.quad([x - half, y, z - half], [x - half, y, z + half], [x + half, y, z + half], [x + half, y, z - half], M.floor);
  return mb.build();
}
