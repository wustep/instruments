// The oboe in 3D: a conservatoire-system (Gillet) oboe of the Lorée / Marigaux / Yamaha class, built
// once and posed from the live state. Real scale (docs/3d-reference.md, "Oboe"):
//
//   the reed: two blades of gouged, shaped and scraped cane, 71.5 mm long overall (oboe-reeds.jpg, by
//     the rule in the picture), tied on a 47 mm staple with green nylon thread, the staple's cork
//     pushed 18 mm into the reed well (Lorée: the well Ø 7.4 × 18.2 deep), so 53.5 mm of reed stand
//     out of the top joint. The blades are 6.9 mm wide at the tip, narrowing to the thread; at rest
//     their tip is open about a millimetre (a lens), the scraped tip and heart pale and matte, the
//     bark glossy behind them;
//   the body: 600 mm without the reed (Lorée's 601; Bate collection Howarth and Kohlert bodies
//     597–598), laid out from Yamaha's own photograph of the YOB-831 (oboe-yamaha-side.jpg, 4013 px
//     for the 600 mm, measured in pixels): the top joint 238 mm with its turned bulb under the
//     silver ferrule (Ø 23.7 at its widest) and its body tapering Ø 20.1 → 23.2; the lower joint
//     236 mm, Ø 27.2 → 28.0, with the silver ring of its socket; the bell 126 mm (Lorée's 127),
//     Ø 28.8 under its ring flaring to a thick, rounded rim of Ø 50 (Bate: 53–56 for older bodies);
//     the bell's throat inside, flaring to the choke at its rim;
//   the keywork, silver-plated, in the photograph's places (mm from the top of the body): the second
//     (side) octave key's vent at 29 and its long tube down the left-hand side to the touch beside
//     L1; the first octave key's vent at 80 and its thumb plate on the back; three trill vents; the
//     perforated plates of L1 (with its half-hole plate below it), L2, L3, R1 (with its crescent),
//     R2, the ring of R3; the G♯ vent; the left little finger's G♯, E♭, B and B♭ touches hanging
//     past the joint; the right little finger's C, C♯ and E♭ touches; the E♭ and F-resonance keys;
//     the big C♯ and C keys on the lower joint's side, and the B and B♭ keys on the bell; posts
//     screwed into the wood on their flanges, hinge tubes on steel pivots, needle springs, cork pads
//     on the small keys and leather on the big ones; the thumb rest; the bridge across the bell joint.
//
// Live: the keys follow the oboe's standard fingering for the engine's note (oboe-fingering.ts, the
// chart the 2D stage uses): each plate seats with a small bounce or overshoots a little off its stop
// as it opens (the flute's springs); the reed's blades close with its opening
// (`fr.reed.open`: blown shut once a cycle when loud, a hair's tremor with the level) and the breath goes into
// the reed's tip (winds3d breathIn: faint steel streams, as on the brass). The keys, their pads, the tone holes and the bell
// are never lit or tinted: silver, cork, leather and wood, sounding or not. A moment after the oboe stops sounding the keys go back to rest.
// Approximations: the linkages are shown, not simulated (each key springs to the state the mechanism
// gives it), the trill keys never open (the chart has no trills), and the half-hole is the small
// plate below L1 lifting.
import type { VisualFrame } from '@piano-model/engine';
import { HALF, L1, L2, L3, LB, LBB, LEB, LGS, OCT1, OCT2, R1, R2, R3, RC, RCS, REB, RF, oboeFingersFor } from '../oboe-fingering.ts';
import { type Batch, type Mat4, type Mesh, type Vec3, add, chain, cross, dot, mulInto, norm, rotX, rotY, rotZ, scale, sub, translate, xform } from './gl3d.ts';
import { M, MeshBuilder, cyl, ellipsoid, grid, spline, variant, type Mat } from './mesh.ts';
import { breathIn, type WindPose } from './winds3d.ts';

type P2 = [number, number];
const TAU = Math.PI * 2;
const mm = 0.001;

// ---------------------------------------------------------------- materials
const WOOD = M.grenadilla; // lathed about its own y (the tube's axis)
/** the bore and the tone holes' wells: the wood's dark inside */
const DARK = M.hole;
/** the bell's throat (a little lighter than a hole: the light reaches some way in) */
const THROAT = variant(M.grenadilla, { col: [0.06, 0.045, 0.04], tint: true });
/** the countersink round a tone hole */
const SINK = variant(M.grenadillaX, { col: [0.045, 0.032, 0.028], tint: true });
const AG = M.silverKeys;
const STEEL = M.steel;
const CORK = M.cork;
/** the big keys' pads: black leather (oboe-yamaha-side.jpg: a dark ring under each low key) */
const SKIN = variant(M.leather, { col: [0.035, 0.028, 0.025], tint: true });
const CANE = M.cane;
const SCRAPE = M.caneScraped;
const CANE_IN = variant(M.cane, { col: [0.42, 0.3, 0.14], tint: true });
const THREAD = M.reedThread;

// ---------------------------------------------------------------- geometry helpers (as winds3d's)
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const deg = (d: number) => (d * Math.PI) / 180;
/** local y → model x: solids of revolution along the tube */
const TOX = new Float32Array([0, 1, 0, 0, 1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);

/** a frame at p whose local y runs along `dir` */
export function frameY(p: Vec3, dir: Vec3): Mat4 {
  const y = norm(dir);
  let x = cross(y, [0, 0, 1]);
  if (len3(x) < 1e-6) x = cross(y, [1, 0, 0]);
  x = norm(x);
  const z = cross(x, y);
  return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, p[0], p[1], p[2], 1]);
}

/** a solid of revolution about local y (profile [radius, y]) */
export function revolve(mb: MeshBuilder, prof: P2[], seg: number, m: Mat): void {
  const n = prof.length;
  const pn: P2[] = prof.map((_, i) => {
    const a = prof[Math.max(0, i - 1)];
    const b = prof[Math.min(n - 1, i + 1)];
    const tr = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tr, ty) || 1;
    return [ty / l, -tr / l];
  });
  const cs: P2[] = Array.from({ length: seg + 1 }, (_, k) => [Math.cos((k / seg) * TAU), Math.sin((k / seg) * TAU)]);
  const P = (j: number, q: number): Vec3 => [prof[j][0] * cs[q][0], prof[j][1], prof[j][0] * cs[q][1]];
  const N = (j: number, q: number): Vec3 => [pn[j][0] * cs[q][0], pn[j][1], pn[j][0] * cs[q][1]];
  for (let i = 0; i < n - 1; i++) {
    if (prof[i][0] < 1e-7 && prof[i + 1][0] < 1e-7) continue;
    for (let k = 0; k < seg; k++) {
      mb.stri(P(i, k), P(i + 1, k), P(i + 1, k + 1), N(i, k), N(i + 1, k), N(i + 1, k + 1), m);
      mb.stri(P(i, k), P(i + 1, k + 1), P(i, k + 1), N(i, k), N(i + 1, k + 1), N(i, k + 1), m);
    }
  }
}
/** revolve about the model's x axis (profile [radius, x]) */
export const lx = (mb: MeshBuilder, prof: P2[], seg: number, m: Mat) => mb.with(TOX, () => revolve(mb, prof, seg, m));

/** a 2D polyline with its corners rounded (radius per point; the ends are kept) */
export function fillet(pts: P2[], rad: number | number[], n = 5): P2[] {
  const out: P2[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const r = typeof rad === 'number' ? rad : (rad[i] ?? 0);
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const [cx, cy] = pts[i + 1];
    const l1 = Math.hypot(ax - bx, ay - by);
    const l2 = Math.hypot(cx - bx, cy - by);
    if (r <= 0 || l1 < 1e-9 || l2 < 1e-9) {
      out.push(pts[i]);
      continue;
    }
    const ux = (ax - bx) / l1;
    const uy = (ay - by) / l1;
    const vx = (cx - bx) / l2;
    const vy = (cy - by) / l2;
    const th = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy)));
    if (th > Math.PI - 1e-3 || th < 1e-3) {
      out.push(pts[i]);
      continue;
    }
    const d = Math.min(r / Math.tan(th / 2), 0.48 * l1, 0.48 * l2);
    const rr = d * Math.tan(th / 2);
    const t1: P2 = [bx + ux * d, by + uy * d];
    const t2: P2 = [bx + vx * d, by + vy * d];
    const bl = Math.hypot(ux + vx, uy + vy);
    const cd = rr / Math.sin(th / 2);
    const ccx = bx + ((ux + vx) / bl) * cd;
    const ccy = by + ((uy + vy) / bl) * cd;
    const a1 = Math.atan2(t1[1] - ccy, t1[0] - ccx);
    let da = Math.atan2(t2[1] - ccy, t2[0] - ccx) - a1;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    for (let k = 0; k <= n; k++) out.push([ccx + rr * Math.cos(a1 + (da * k) / n), ccy + rr * Math.sin(a1 + (da * k) / n)]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** a Catmull-Rom curve through the points */
export function spline3(pts: readonly Vec3[], per: number): Vec3[] {
  const n = pts.length;
  const P = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];
  const out: Vec3[] = [];
  for (let i = 0; i < n - 1; i++)
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const p0 = P(i - 1);
      const p1 = P(i);
      const p2 = P(i + 1);
      const p3 = P(i + 2);
      out.push([0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)) as Vec3);
    }
  out.push(pts[n - 1]);
  return out;
}

/** a bar swept along a path: a rounded-rectangle section (superellipse, exponent `ex`) of half-width
 *  w(f) across and half-height h(f) along `up` (f = 0..1 along the path) */
export function sweep(mb: MeshBuilder, path: Vec3[], upAt: (p: Vec3, t: Vec3) => Vec3, w: (f: number) => number, h: (f: number) => number, m: Mat, seg = 14, ex = 2.4): void {
  const N = path.length;
  const acc = [0];
  for (let i = 1; i < N; i++) acc.push(acc[i - 1] + len3(sub(path[i], path[i - 1])));
  const tot = acc[N - 1] || 1;
  const rings: { p: Vec3; n: Vec3 }[][] = [];
  for (let i = 0; i < N; i++) {
    const t = norm(sub(path[Math.min(N - 1, i + 1)], path[Math.max(0, i - 1)]));
    let u = upAt(path[i], t);
    u = sub(u, scale(t, dot(u, t)));
    if (len3(u) < 1e-9) u = Math.abs(t[1]) < 0.9 ? cross(t, [0, 1, 0]) : cross(t, [1, 0, 0]);
    u = norm(u);
    const s = cross(t, u);
    const f = acc[i] / tot;
    const W = Math.max(2e-5, w(f));
    const H = Math.max(2e-5, h(f));
    const ring: { p: Vec3; n: Vec3 }[] = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * TAU;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const pc = Math.sign(c) * Math.abs(c) ** (2 / ex);
      const ps = Math.sign(sn) * Math.abs(sn) ** (2 / ex);
      const nc = (Math.sign(c) * Math.abs(c) ** (2 - 2 / ex)) / W;
      const ns = (Math.sign(sn) * Math.abs(sn) ** (2 - 2 / ex)) / H;
      ring.push({ p: add(path[i], add(scale(s, W * pc), scale(u, H * ps))), n: norm(add(scale(s, nc), scale(u, ns))) });
    }
    rings.push(ring);
  }
  for (let i = 0; i < N - 1; i++)
    for (let k = 0; k < seg; k++) {
      const a = rings[i][k];
      const b = rings[i + 1][k];
      const c = rings[i + 1][k + 1];
      const d = rings[i][k + 1];
      mb.stri(a.p, b.p, c.p, a.n, b.n, c.n, m);
      mb.stri(a.p, c.p, d.p, a.n, c.n, d.n, m);
    }
  for (const [i, j] of [[0, 1], [N - 1, N - 2]] as const) {
    if (w(i === 0 ? 0 : 1) < 1e-4) continue;
    const nn = norm(sub(path[i], path[j]));
    for (let k = 0; k < seg; k++) mb.stri(path[i], rings[i][k].p, rings[i][k + 1].p, nn, nn, nn, m);
  }
}
/** a round tube along a path */
export const pipe = (mb: MeshBuilder, path: Vec3[], r: number, m: Mat, seg = 14) => sweep(mb, path, (_p, t) => (Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]), () => r, () => r, m, seg, 2);

/** monotone cubic interpolation through (xs, ys) */
export function pchip(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  const h: number[] = [];
  const dl: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    dl.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m = new Array<number>(n);
  m[0] = dl[0];
  m[n - 1] = dl[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (dl[i - 1] * dl[i] <= 0) m[i] = 0;
    else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i]);
    }
  }
  return (x: number) => {
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = clamp01((x - xs[i]) / h[i]);
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

/** a damped spring towards `target` (0 seated / at rest, 1 open / pressed) that stops at both ends
 *  with a small bounce, as a pad seats; integrated in fixed 2 ms steps (winds3d's) */
export function springTo(pos: Float32Array, vel: Float32Array, i: number, target: number, dt: number, hz: number, zeta: number): number {
  const w = TAU * hz;
  let p = pos[i];
  let v = vel[i];
  const steps = Math.min(60, Math.max(1, Math.ceil(dt / 0.002)));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    v += (w * w * (target - p) - 2 * zeta * w * v) * h;
    p += v * h;
    if (p < 0) {
      p = 0;
      v = -v * 0.22;
    } else if (p > 1) {
      p = 1;
      v = -v * 0.22;
    }
  }
  pos[i] = p;
  vel[i] = v;
  return p;
}

// ================================================================ the oboe's own measures
/** the reed's length out of the top joint (71.5 mm reed, 18 mm of its cork in the 18.2 mm well) */
const REED = 0.0535;
/** the body, top of the ferrule to the bell's rim (Lorée 601; the Yamaha photograph scaled to 600) */
const BODY = 0.6;
/** reed tip to bell rim */
export const OBOE_LEN = REED + BODY;
/** model x of a point `b` mm down the body */
const X = (b: number) => REED + b * mm;
/** the joints (mm down the body): the top joint's foot meets the lower joint's socket ring; the lower
 *  joint's foot meets the bell's */
const J1 = 236;
const J1R = 240.5;
const J2 = 471.5;
const J2R = 478;
/** the bell's rim: its widest (mm down the body) */
const RIM0 = 589;
/** the rim's outer radius (m): Ø 50, the photograph's */
export const OBOE_RIM = 0.025;

// The outside, mm from the top of the body → radius (mm), off oboe-yamaha-side.jpg: the bulb under
// the ferrule; the top joint's taper; the lower joint (a little fuller at its socket); the bell's flare
// to its rim
const BULB_B = [2.6, 3.6, 5, 7, 9, 11.5, 13.5, 15.5, 17.2, 18.6, 19.4];
const BULB_R = [6.15, 7.3, 8.9, 10.3, 11.15, 11.7, 11.85, 11.7, 11.1, 10.45, 10.25];
// the bell (oboe-yamaha-side.jpg's outline): a slow flare that opens quickly over its last 15 mm into
// the rim, then rolls under to the mouth; inside, the throat flares to the choke at the mouth
const BELL_OUT: P2[] = [[478, 14.4], [486, 14.6], [500, 15.15], [515, 15.6], [530, 16.25], [545, 17.1], [556, 17.9], [565, 18.8], [571, 19.7], [575, 20.6], [578, 21.8], [580.5, 23.1], [583, 24.2], [586, 24.85], [589, 24.95]];
const BELL_LIP: P2[] = [[592, 24.6], [594.5, 23.8], [596.6, 22.6], [598.3, 21.2], [599.5, 19.8], [600, 18.6], [599.9, 17.9], [599.4, 17.4], [598.5, 17.15]];
const BELL_IN: P2[] = [[598.5, 17.15], [596, 17.1], [592, 17.0], [586, 16.4], [578, 15.4], [566, 13.9], [548, 11.9], [528, 10.1], [508, 8.9], [490, 8.2]];
const BELL_B = BELL_OUT.map((p) => p[0]);
const BELL_R = BELL_OUT.map((p) => p[1]);
const bulb = pchip(BULB_B, BULB_R);
const bell = pchip(BELL_B, BELL_R);
const TJ_TOP = 23.5;
const tjR = (b: number) => 10.05 + ((b - TJ_TOP) * (11.6 - 10.05)) / (J1 - TJ_TOP);
const ljR = (b: number) => (b < 258 ? lerp(13.95, 13.6, ((b - J1R) / (258 - J1R)) ** 0.8) : lerp(13.6, 14.0, (b - 258) / (J2 - 258)));
/** the outer radius (mm) at `b` mm down the body (the wood; the rings stand proud of it) */
export function rOut(b: number): number {
  if (b < BULB_B[BULB_B.length - 1]) return bulb(Math.max(BULB_B[0], b));
  if (b < TJ_TOP) return lerp(10.25, 10.05, (b - 19.4) / (TJ_TOP - 19.4));
  if (b <= J1) return tjR(b);
  if (b < J1R) return 13.95;
  if (b <= J2) return ljR(b);
  if (b < J2R) return 14.7;
  return bell(Math.min(RIM0, b));
}

/** the side of the oboe a positive angle is on (φ from the front, the plates' side, towards the
 *  player's left: the picture's right in the front view, as in oboe-yamaha-side.jpg) */
const SIDE = -1;
/** a point at `b` mm down the body, φ degrees round from the front, `r` mm from the axis */
const P = (b: number, phi: number, r: number): Vec3 => {
  const a = SIDE * deg(phi);
  return [X(b), r * mm * Math.cos(a), -r * mm * Math.sin(a)];
};
/** a point `h` mm off the surface */
const S = (b: number, phi: number, h: number): Vec3 => P(b, phi, rOut(b) + h);
/** outward from the axis (sweeps' up) */
const OUT = (p: Vec3): Vec3 => [0, p[1], p[2]];
/** a point beside the tube: `lat` mm to the player's left (the +φ side), `fwd` mm to the front */
const Lp = (b: number, lat: number, fwd: number): Vec3 => [X(b), fwd * mm, -SIDE * lat * mm];
/** the front (a touch's face, turned to the finger) */
const FRONT = (): Vec3 => [0, 1, 0];
/** a point's place: mm down the body, and φ */
const placeOf = (p: Vec3): [number, number] => [p[0] / mm - REED / mm, (Math.atan2(-p[2], p[1]) * 180) / Math.PI / SIDE];

// ---------------------------------------------------------------- rod lines
/** a rod line: the steel the keys' hinge tubes turn on, between its end posts (mm down the body),
 *  `h` mm off the surface there, at φ degrees round from the front */
interface Rod {
  phi: number;
  h: number;
  b0: number;
  b1: number;
  posts: number[];
}
const rodR = (r: Rod, b: number) => lerp(rOut(r.b0) + r.h, rOut(r.b1) + r.h, (b - r.b0) / (r.b1 - r.b0));
const rodP = (r: Rod, b: number): Vec3 => P(b, r.phi, rodR(r, b));
// the top joint: the main line on the player's right (L1–L3's hinges), the vents' line in front on
// the left, the side octave key's long tube and the left little finger's touches further round
const TA: Rod = { phi: -80, h: 3.4, b0: 38, b1: 232, posts: [38, 80, 96, 119, 151, 177, 204, 232] };
const TB: Rod = { phi: 36, h: 3.2, b0: 63.5, b1: 192.5, posts: [63.5, 99, 136, 162.5, 192.5] };
const TC1: Rod = { phi: 84, h: 3.8, b0: 23.5, b1: 126.5, posts: [23.5, 126.5] };
const TC2: Rod = { phi: 84, h: 3.8, b0: 193.5, b1: 234.5, posts: [193.5, 234.5] };
// the lower joint: R1–R3's line; the vents' line; the long links on the left; the right little
// finger's touches and the big side keys, round the back on the right
const LA: Rod = { phi: -80, h: 3.6, b0: 244.5, b1: 333.5, posts: [244.5, 284.5, 333.5] };
const LBR: Rod = { phi: 34, h: 3.4, b0: 259.5, b1: 434.5, posts: [259.5, 284.5, 343.5, 372.5, 405.5, 434.5] };
const LC: Rod = { phi: 84, h: 4.0, b0: 246, b1: 465.5, posts: [246, 281.5, 352, 465.5] };
const LD: Rod = { phi: -100, h: 3.8, b0: 327.5, b1: 465, posts: [327.5, 359, 371.5, 398.5, 437.5, 465] };
// the bell: the B key on the right, the B♭ key on the left
const BD: Rod = { phi: -116, h: 3.8, b0: 482, b1: 512, posts: [482, 512] };
const BC: Rod = { phi: 100, h: 3.8, b0: 506, b1: 538, posts: [506, 538] };
const RODS = [TA, TB, TC1, TC2, LA, LBR, LC, LD, BD, BC];

// ---------------------------------------------------------------- parts
/** the frame of a cup at (b, φ): y out of the tube (the pad's face at y = 0, `gap` mm off the
 *  surface), x along the tube, z round it */
const cupFrame = (b: number, phi: number, gap = 0.15): Mat4 => chain(translate(X(b), 0, 0), rotX(-SIDE * deg(phi)), translate(0, (rOut(b) + gap) * mm, 0));
type CupStyle = 'perf' | 'plain' | 'ring' | 'screw';
/** a cup's shell height over its pad's face */
const cupTop = (r: number) => (0.0016 + 0.12 * r) * (r > 0.0055 ? 1 : 0.92);

/** a spherical cap's profile from radius r0 (height y0 at the middle) to r1 (height y1) */
export function dome(r0: number, r1: number, y0: number, y1: number): P2[] {
  const k = (y0 - y1) / (r1 * r1);
  return Array.from({ length: 9 }, (_, i) => {
    const r = lerp(r0, r1, i / 8);
    return [r, y0 - k * r * r] as P2;
  });
}
/** a key's cup: its shell (a perforated plate, a plain domed cup, an open ring, a vent cup with its
 *  adjusting screw) and pad (cork on the small keys, leather on the big ones), in the frame `Cf` */
function cup(mb: MeshBuilder, Cf: Mat4, style: CupStyle, r: number, hole: number): void {
  const top = cupTop(r);
  const ph = style === 'ring' ? hole : style === 'perf' ? hole * 0.36 : 0; // a plate's perforation, a ring's open middle
  mb.with(Cf, () => {
    let prof: P2[];
    let rads: number[];
    if (style === 'perf') {
      // a polished convex plate (one smooth spherical cap), its small perforation's edge rounded in,
      // the shoulder rolled to a short skirt (oboe-yamaha-side.jpg: each plate one bright dome)
      const cap = dome(ph + 0.0004, r - 0.0011, top + 0.0003, top - 0.0004);
      prof = [[ph, -0.0002], [ph, top - 0.0001], ...cap, [r, top - 0.0014], [r, 0.0005], [r - 0.0005, 0.0005]];
      rads = prof.map((_, i) => (i === 1 ? 0.0003 : i === cap.length + 1 ? 0.0006 : i === cap.length + 2 ? 0.0005 : i === cap.length + 3 ? 0.0002 : 0));
    } else if (style === 'ring') {
      // an open ring: its inner edge rolled in, its outer shoulder rounded
      prof = [[ph, -0.0002], [ph, top - 0.0003], [ph + 0.0006, top + 0.0001], [r - 0.0011, top - 0.0001], [r, top - 0.0013], [r, 0.0005], [r - 0.0005, 0.0005]];
      rads = [0, 0.0003, 0.0005, 0.0014, 0.0006, 0.0002, 0];
    } else {
      // a domed cup (the screw's head in the middle of an adjustable one)
      const cap = dome(0, r - 0.0011, top + (r > 0.0048 ? 0.0011 : 0.0003), top - 0.0004);
      prof = [...cap, [r, top - 0.0013], [r, 0.0005], [r - 0.0005, 0.0005]];
      rads = prof.map((_, i) => (i === cap.length - 1 ? 0.0006 : i === cap.length ? 0.0005 : i === cap.length + 1 ? 0.0002 : 0));
    }
    revolve(mb, fillet(prof, rads, 4), 40, AG);
    if (style === 'screw') {
      // the adjusting screw's head and its slot
      mb.with(translate(0, top + 0.0002, 0), () => revolve(mb, fillet([[0, 0.0006], [0.001, 0.0005], [0.0011, 0], [0, 0]], [0, 0.0003, 0, 0], 3), 20, AG));
      const y = top + 0.00082;
      mb.quad([-0.0009, y, -0.00012], [-0.0009, y, 0.00012], [0.0009, y, 0.00012], [0.0009, y, -0.00012], DARK);
    }
    // the pad: its face on the tone hole, a little proud of the skirt
    const big = r > 0.006;
    const pin = ph ? ph + 0.0002 : 0;
    revolve(mb, fillet([[pin, 0], [r - 0.0009, 0], [r - 0.0005, 0.0003], [r - 0.0005, 0.0008]], [0, 0.0003, 0.0002, 0], 3), 40, big ? SKIN : CORK);
    // down the perforation or the ring: the bore, dark
    if (ph) revolve(mb, [[0, -0.0004], [ph, -0.0004]], 24, DARK);
  });
}

/** a key's arm from its hinge tube (`from`, on its rod) round the tube to the cup: a flat bar that
 *  broadens into the plate's side, plate and arm one keyhole-shaped piece, as oboe keys are forged
 *  (oboe-yamaha-side.jpg) */
function arm(mb: MeshBuilder, Cf: Mat4, r: number, from: Vec3, cupB: number, cupPhi: number, viaH = 3.0): void {
  const top = cupTop(r);
  // which side of the cup the rod is on (the cup frame's z)
  const q = sub(from, [X(cupB), 0, 0]);
  const a = SIDE * deg(cupPhi);
  const z = q[1] * Math.sin(a) + q[2] * Math.cos(a);
  const sg = z < 0 ? -1 : 1;
  const near = xform(Cf, [0, top * 0.45, sg * (r + 0.0034)]);
  const rim = xform(Cf, [0, top - 0.0007, sg * (r - 0.0004)]);
  const inside = xform(Cf, [0, top - 0.0009, sg * (r * 0.3)]);
  // round the tube, held off the wood, level with the cup
  const [fb, fphi] = placeOf(from);
  const [nb, nphi] = placeOf(near);
  const mid = S(lerp(fb, nb, 0.5), lerp(fphi, nphi, 0.5), viaH);
  const path = spline3([from, mid, near, rim, inside], 6);
  const wEnd = 0.78 * r;
  sweep(mb, path, OUT, (f) => (f < 0.42 ? 0.00105 : 0.00105 + (wEnd - 0.00105) * Math.sin((Math.PI / 2) * Math.min(1, (f - 0.42) / 0.4)) ** 2), () => 0.0006, AG, 16, 3.2);
}

/** a hinge tube on a rod line, from b0 to b1, with rounded ends */
function hinge(mb: MeshBuilder, r: Rod, b0: number, b1: number, rr = 0.0017): void {
  const a = rodP(r, b0);
  const c = rodP(r, b1);
  const L = len3(sub(c, a));
  mb.with(frameY(a, sub(c, a)), () => revolve(mb, fillet([[0, 0], [rr, 0], [rr, L], [0, L]], [0, 0.0004, 0.0004, 0], 3), 18, AG));
}
/** a post: a turned pillar screwed into the wood on its flange, a ball round the rod */
function post(mb: MeshBuilder, r: Rod, b: number): void {
  const base = S(b, r.phi, -0.25);
  const top = rodP(r, b);
  const L = len3(sub(top, base));
  mb.with(frameY(base, sub(top, base)), () => revolve(mb, fillet([[0, 0], [0.0029, 0], [0.0029, 0.00045], [0.0017, 0.0011], [0.0013, L - 0.0017], [0.0017, L - 0.0009]], [0, 0, 0.0004, 0.0006, 0.0006, 0], 3), 20, AG));
  ellipsoid(mb, top, [0.0021, 0.0021, 0.0021], 18, AG);
}
/** the steel pivot of a rod line, seen between its hinge tubes, with its screw's head at the top */
function steel(mb: MeshBuilder, r: Rod): void {
  const a = rodP(r, r.b0);
  const c = rodP(r, r.b1);
  cyl(mb, a, c, 0.00072, 0.00072, 12, STEEL, false);
  const d = norm(sub(a, c));
  mb.with(frameY(a, d), () => revolve(mb, fillet([[0, 0.0016], [0.0013, 0.0016], [0.0013, 0.0026], [0, 0.0026]], [0, 0.0003, 0.0003, 0], 2), 16, AG));
}
/** a needle spring: from a post, along beside the rod, into a key's catch (a small stud on its tube) */
function needle(mb: MeshBuilder, r: Rod, bPost: number, bCatch: number): void {
  // beside the hinge tube, against it (2.1 mm off the rod's axis, round towards the front)
  const off = (b: number): Vec3 => {
    const R = rodR(r, b);
    return P(b, r.phi - Math.sign(r.phi || 1) * ((2.0 / R) * 180) / Math.PI, R - 0.5);
  };
  const p0 = off(bPost);
  const p1 = off(bCatch);
  pipe(mb, [p0, add(scale(add(p0, p1), 0.5), scale(norm(OUT(p0)), -0.0001)), p1], 0.00026, STEEL, 8);
  // the catch: a small stud on the key's tube that takes the spring's tip
  const c = rodP(r, bCatch);
  cyl(mb, c, p1, 0.00055, 0.00048, 10, AG);
}
/** a touch: a teardrop spoon swept along `path` (its narrow end first), `w` its half-width at the
 *  round end, face out from the tube */
function spoon(mb: MeshBuilder, path: Vec3[], w: number, up: (p: Vec3) => Vec3 = FRONT, m: Mat = AG): void {
  sweep(mb, path, up, (f) => w * Math.pow(Math.sin(Math.PI * Math.max(0.03, Math.min(0.97, 0.1 + 0.9 * f))), 0.55) * (0.4 + 0.6 * f), () => 0.0007, m, 18, 3);
}
/** a lever's stem: a bar from a hinge tube along a path */
const stem = (mb: MeshBuilder, path: Vec3[], w = 0.0011, h = 0.0007) => sweep(mb, path, OUT, () => w, () => h, AG, 12, 2.6);

/** a tone hole drilled into the wood at (b, φ): its dark well and the countersink round it */
function toneHole(mb: MeshBuilder, b: number, phi: number, hole: number): void {
  const at = (rho: number, a: number, lift: number): Vec3 => {
    const db = (rho * Math.cos(a)) / mm;
    const s = rho * Math.sin(a);
    const rr = rOut(b + db);
    return P(b + db, phi + ((s / (rr * mm)) * 180) / Math.PI, rr + lift);
  };
  grid(mb, 3, 36, (u, v) => at(hole * u, v * TAU, 0.03), DARK, { wrapV: true });
  grid(mb, 2, 36, (u, v) => at(hole + 0.0007 * u, v * TAU, 0.03 - 0.02 * u), SINK, { wrapV: true });
}

// ================================================================ the keys
interface KeyDef {
  name: string;
  /** a cup (`open`: whether it stands open for the fingers down) or a touch (`open`: pressed) */
  kind: 'cup' | 'lever';
  rod: Rod;
  /** where its hinge tube runs (mm) */
  hb: [number, number];
  /** the cup: mm down the body, φ, outer radius and tone hole (m), style */
  b?: number;
  phi?: number;
  r?: number;
  hole?: number;
  style?: CupStyle;
  /** closed-standing (a vent its spring holds shut) */
  closed?: boolean;
  open: (f: number) => boolean;
  /** how far it opens at the cup's middle (or a touch travels), m */
  lift?: number;
  /** the rest of the piece: a touch, a spine, a crescent (in the model's frame) */
  extra?: (mb: MeshBuilder) => void;
  /** the point that travels (a touch's): default the cup's centre */
  at?: Vec3;
}

const never = () => false;
type Touch = readonly [string, number, readonly [number, number], readonly Vec3[], number];
/** the little fingers' touches: a stem from its hinge tube, then the spoon (its round end last),
 *  face to the front as the photograph shows them */
const touches = (rod: Rod, list: readonly Touch[], k0: number): KeyDef[] =>
  list.map(([name, bit, hb, pts, w]) => ({
    name,
    kind: 'lever' as const,
    rod,
    hb: [hb[0], hb[1]] as [number, number],
    open: (f: number) => !!(f & bit),
    lift: 0.0026,
    at: pts[pts.length - 1],
    extra: (mb: MeshBuilder) => {
      const path = spline3([rodP(rod, (hb[0] + hb[1]) / 2), ...pts], 6);
      const k = Math.floor(path.length * k0);
      stem(mb, path.slice(0, k + 1), 0.0012, 0.0007);
      spoon(mb, path.slice(k), w);
    },
  }));

/** the keys that move */
const KEYS: KeyDef[] = [
  // the second (side) octave key: its vent high on the top joint, its long tube down the left-hand side
  // to the touch the side of L1 presses
  {
    name: 'oct2', kind: 'cup', rod: TC1, hb: [26, 124], b: 29, phi: 14, r: 0.003, hole: 0.0013, style: 'plain', closed: true, open: (f) => !!(f & OCT2), lift: 0.0012,
    extra: (mb) => {
      stem(mb, spline3([rodP(TC1, 121), Lp(121, 19, 3), Lp(118, 23, 3.4)], 6));
      spoon(mb, spline3([Lp(118, 23, 3.4), Lp(110, 25.5, 3.8), Lp(98, 26.5, 4.2)], 6), 0.0031);
    },
  },
  // the first octave key: its vent in front, a spine up the middle to the adjusting screw the thumb
  // plate's crossbar works
  {
    name: 'oct1', kind: 'cup', rod: TB, hb: [66, 96.5], b: 80, phi: 0, r: 0.0031, hole: 0.0014, style: 'plain', closed: true, open: (f) => !!(f & OCT1), lift: 0.0012,
    extra: (mb) => {
      sweep(mb, [S(79, 0, 2.3), S(70, 0, 2.15), S(60, 0, 2.05), S(50, 0, 2.05)], OUT, () => 0.0011, () => 0.0006, AG, 12, 3);
      mb.with(cupFrame(49.5, 0, 1.9), () => revolve(mb, fillet([[0, 0], [0.0016, 0], [0.0016, 0.0008], [0, 0.0009]], [0, 0.0002, 0.0003, 0], 3), 24, AG));
    },
  },
  // the thumb plate on the back: its lever on the main line, round the tube to a round plate, and the
  // crossbar across the front to the octave key's screw
  {
    name: 'thumb', kind: 'lever', rod: TA, hb: [98.5, 116.5], open: (f) => !!(f & OCT1), lift: 0.0018,
    at: S(108, -172, 2.6),
    extra: (mb) => {
      stem(mb, spline3([rodP(TA, 106), S(106, -110, 3.4), S(107, -140, 2.9), S(108, -160, 2.6)], 6), 0.0013, 0.0007);
      mb.with(cupFrame(108, -172, 2.0), () => revolve(mb, fillet([[0, 0.0011], [0.0054, 0.0009], [0.0058, 0.0004], [0.0052, 0], [0, 0.0001]], [0, 0.003, 0.0003, 0.0003, 0], 4), 36, AG));
      stem(mb, spline3([rodP(TA, 99.5), S(97, -55, 3.0), S(85, -25, 2.8), S(72, -6, 2.9), S(71, 0, 3.0)], 6), 0.001, 0.0006);
    },
  },
  // L1: the perforated plate, the half-hole plate below it
  { name: 'L1', kind: 'cup', rod: TA, hb: [121.5, 139], b: 131, phi: 0, r: 0.0063, hole: 0.0026, style: 'perf', open: (f) => !(f & L1), lift: 0.0022 },
  { name: 'half', kind: 'cup', rod: TA, hb: [141, 148.5], b: 141.8, phi: 2, r: 0.0036, hole: 0.0014, style: 'plain', open: (f) => !(f & L1) || !!(f & HALF), lift: 0.0017 },
  { name: 'L2', kind: 'cup', rod: TA, hb: [153.5, 174.5], b: 162.5, phi: 0, r: 0.0064, hole: 0.003, style: 'perf', open: (f) => !(f & L2), lift: 0.0022 },
  // the G♯ vent, opened by the left little finger
  { name: 'gs', kind: 'cup', rod: TB, hb: [165, 190], b: 178, phi: 12, r: 0.0036, hole: 0.0017, style: 'plain', closed: true, open: (f) => !!(f & LGS), lift: 0.0013 },
  { name: 'L3', kind: 'cup', rod: TA, hb: [179.5, 201.5], b: 193, phi: 0, r: 0.0064, hole: 0.0032, style: 'perf', open: (f) => !(f & L3), lift: 0.0022 },
  // the left little finger's touches (G♯, E♭, B, B♭): on the lower joint's left-hand rod, their stems
  // rising past the joint to the spoons (round ends up), fanned out beside the tube
  ...touches(LC, [
    ['tGS', LGS, [248.5, 255], [Lp(246, 18, 3.5), Lp(234, 21, 4.5), Lp(222, 25, 5.5), Lp(208, 32, 6.5)], 0.0036],
    ['tEB', LEB, [256.5, 263], [Lp(252, 18, 3.5), Lp(242, 19.5, 4), Lp(228, 21.5, 4.5), Lp(212, 23, 5)], 0.0043],
    ['tB', LB, [264.5, 271], [Lp(260, 21, 3), Lp(248, 26, 3.5), Lp(234, 28.5, 4), Lp(216, 30, 4.5)], 0.0043],
    ['tBB', LBB, [272.5, 279], [Lp(268, 24, 2.5), Lp(256, 33, 2.5), Lp(242, 36, 3), Lp(222, 38, 3.5)], 0.0045],
  ], 0.42),
  // R1 (and its crescent), R2, the F key's touch, the ring of R3
  {
    name: 'R1', kind: 'cup', rod: LA, hb: [247, 268], b: 255, phi: 0, r: 0.0066, hole: 0.0032, style: 'perf', open: (f) => !(f & R1), lift: 0.0022,
    extra: (mb) => {
      // the crescent below the plate (one piece with it)
      mb.with(cupFrame(263.6, -2, 0.4), () => {
        const pts: Vec3[] = Array.from({ length: 13 }, (_, i) => {
          const a = deg(-62 + (124 * i) / 12);
          return [0.0011 - 0.0024 * Math.cos(a) * 0.3, 0.0013, 0.0042 * Math.sin(a)];
        });
        sweep(mb, pts, () => [0, 1, 0], (f) => 0.0019 * Math.sqrt(Math.sin(Math.PI * Math.max(0.04, Math.min(0.96, f)))), () => 0.0008, AG, 14, 3);
      });
    },
  },
  { name: 'R2', kind: 'cup', rod: LA, hb: [287, 302], b: 293, phi: 0, r: 0.0067, hole: 0.0034, style: 'perf', open: (f) => !(f & R2), lift: 0.0022 },
  {
    name: 'tF', kind: 'lever', rod: LA, hb: [304, 313], open: (f) => !!(f & RF), lift: 0.0018, at: S(306.5, -8, 2.2),
    extra: (mb) => {
      stem(mb, spline3([rodP(LA, 308.5), S(308, -55, 3.2), S(307, -30, 2.6)], 6), 0.0012, 0.0007);
      // the half-moon plate between R2 and R3
      const pts: Vec3[] = Array.from({ length: 13 }, (_, i) => S(306.5 + 1.6 * Math.sin((Math.PI * i) / 12), lerp(-38, 22, i / 12), 2.3));
      sweep(mb, pts, OUT, (f) => 0.0029 * Math.pow(Math.sin(Math.PI * Math.max(0.04, Math.min(0.96, f))), 0.45), () => 0.00075, AG, 16, 3);
    },
  },
  { name: 'R3', kind: 'cup', rod: LA, hb: [315, 331], b: 320, phi: 0, r: 0.0064, hole: 0.0031, style: 'ring', open: (f) => !(f & R3), lift: 0.0022 },
  // the right little finger's touches (C, C♯, E♭): out to the player's right, round ends up
  ...touches(LD, [
    ['tC', RC, [330, 337.5], [Lp(336, -18, 2.5), Lp(334, -22, 3.5), Lp(328, -28, 4.5), Lp(320, -31, 5)], 0.0044],
    ['tCS', RCS, [339.5, 347], [Lp(345, -18, 2.5), Lp(343, -25, 3), Lp(337, -32, 3.5), Lp(329, -37, 4)], 0.0043],
    ['tEB2', REB, [349, 356.5], [Lp(354, -17, 3.5), Lp(352, -19, 4.5), Lp(346, -22, 5.5), Lp(337, -24, 6.5)], 0.004],
  ], 0.38),
  // the E♭ key (closed-standing)
  { name: 'eb', kind: 'cup', rod: LBR, hb: [346, 370], b: 358, phi: 28, r: 0.0052, hole: 0.0025, style: 'plain', closed: true, open: (f) => !!(f & (REB | LEB)), lift: 0.0018 },
  // the C♯ and C keys: big cups on the lower joint's right-hand side
  { name: 'cs', kind: 'cup', rod: LD, hb: [374, 396], b: 384, phi: -74, r: 0.0065, hole: 0.0034, style: 'plain', open: (f) => !(f & (RC | RCS)), lift: 0.0026 },
  // the F resonance key (closed-standing), opened with the F key
  { name: 'fres', kind: 'cup', rod: LBR, hb: [408, 432], b: 420, phi: 26, r: 0.0052, hole: 0.0024, style: 'plain', closed: true, open: (f) => !!(f & RF), lift: 0.0018 },
  { name: 'c', kind: 'cup', rod: LD, hb: [440, 462.5], b: 452, phi: -74, r: 0.0068, hole: 0.0036, style: 'plain', open: (f) => !(f & RC), lift: 0.0028 },
  // the bell's B and B♭ keys
  { name: 'b', kind: 'cup', rod: BD, hb: [484.5, 509.5], b: 497, phi: -76, r: 0.0068, hole: 0.0036, style: 'plain', open: (f) => !(f & (LB | LBB)), lift: 0.003 },
  { name: 'bb', kind: 'cup', rod: BC, hb: [508.5, 535.5], b: 522, phi: 64, r: 0.0066, hole: 0.0036, style: 'plain', open: (f) => !(f & LBB), lift: 0.003 },
];

/** the keys that never move here: the trill vents and the levers the chart's fingerings leave alone */
const FIXED: KeyDef[] = [
  { name: 't90', kind: 'cup', rod: TA, hb: [82.5, 93.5], b: 90, phi: -16, r: 0.003, hole: 0.0013, style: 'plain', closed: true, open: never },
  { name: 't110', kind: 'cup', rod: TB, hb: [101.5, 116.5], b: 110, phi: 16, r: 0.003, hole: 0.0013, style: 'plain', closed: true, open: never },
  { name: 't122', kind: 'cup', rod: TB, hb: [118.5, 133.5], b: 122, phi: 16, r: 0.003, hole: 0.0013, style: 'plain', closed: true, open: never },
  {
    name: 'v150', kind: 'cup', rod: TB, hb: [138.5, 160], b: 150.5, phi: 14, r: 0.0035, hole: 0.0015, style: 'plain', closed: true, open: never,
    extra: (mb) => spoon(mb, spline3([rodP(TB, 145), S(144, 18, 3.4), S(146, -8, 3.2), S(145.5, -22, 3.0)], 5), 0.0017),
  },
  { name: 'v228', kind: 'cup', rod: TA, hb: [206.5, 229.5], b: 228.5, phi: 0, r: 0.0034, hole: 0.0014, style: 'screw', closed: true, open: never },
  // the left F key's long touch, down the right-hand side past the joint
  {
    name: 'leftF', kind: 'lever', rod: TA, hb: [206.5, 229.5], open: never,
    extra: (mb) => {
      const path = spline3([rodP(TA, 210), Lp(207, -18, 2.5), Lp(214, -23, 3.5), Lp(230, -25, 4), Lp(248, -24, 4.5), Lp(262, -22, 5)], 6);
      const k = Math.floor(path.length * 0.55);
      stem(mb, path.slice(0, k + 1), 0.0012, 0.0007);
      spoon(mb, path.slice(k), 0.0034);
    },
  },
  { name: 'v271', kind: 'cup', rod: LBR, hb: [262, 282], b: 271.5, phi: 2, r: 0.0042, hole: 0.0018, style: 'plain', closed: true, open: never },
  // the "banana" touch between R1 and R2
  {
    name: 'banana', kind: 'lever', rod: LA, hb: [270.5, 282], open: never,
    extra: (mb) => {
      stem(mb, spline3([rodP(LA, 276), S(278, -62, 3.4), S(280, -48, 2.8)], 5), 0.0012, 0.0007);
      spoon(mb, spline3([S(280, -48, 2.8), S(280.5, -30, 2.6), S(280.2, -8, 2.5)], 5), 0.0023);
    },
  },
  // the long links on the left of the lower joint (the left little finger's keys to the bell's)
  { name: 'links', kind: 'lever', rod: LC, hb: [284, 349.5], open: never },
  { name: 'links2', kind: 'lever', rod: LC, hb: [354.5, 463], open: never },
  // the long tubes between the keys' (the links that cross the joints and run down to the low keys)
  { name: 'tubeTA', kind: 'lever', rod: TA, hb: [40.5, 77.5], open: never },
  { name: 'tubeLB1', kind: 'lever', rod: LBR, hb: [287, 341], open: never },
  { name: 'tubeLB2', kind: 'lever', rod: LBR, hb: [375, 403], open: never },
  { name: 'tubeLD', kind: 'lever', rod: LD, hb: [401, 435], open: never },
];
const ALL = [...KEYS, ...FIXED];

export interface OboeKey {
  name: string;
  kind: 'cup' | 'lever';
  closed: boolean;
  /** a cup: open for these fingers; a touch: pressed */
  open: (f: number) => boolean;
  mesh: Mesh;
  /** its rod line (a point and the unit direction), and the turn that opens or presses it */
  p0: Vec3;
  u: Vec3;
  sign: number;
  maxAng: number;
}
export interface OboeModel {
  T: Mat4;
  statics: Mesh[];
  /** the bell: its flare, rim and throat */
  rim: Mesh;
  keys: OboeKey[];
  /** the reed's two blades (they close with its opening): the side each is on (±1 along y) */
  blades: { mesh: Mesh; s: number }[];
  bounds: { c: Vec3; r: number };
  /** the tone holes the keys cover (model x) and the keys' names */
  holes: { x: number; name: string }[];
}

/** a key's piece, built seated (a cup on its hole, a touch at rest) in the model's frame */
function keyPiece(mb: MeshBuilder, k: KeyDef): void {
  hinge(mb, k.rod, k.hb[0], k.hb[1]);
  if (k.b !== undefined) {
    const Cf = cupFrame(k.b, k.phi!);
    cup(mb, Cf, k.style!, k.r!, k.hole!);
    // the arm from its hinge tube, level with the cup (or from the tube's end nearer it)
    const hbArm = Math.max(k.hb[0] + 2, Math.min(k.hb[1] - 2, k.b));
    arm(mb, Cf, k.r!, rodP(k.rod, hbArm), k.b, k.phi!, Math.abs(k.rod.phi - k.phi!) > 60 ? 3.4 : 2.9);
  }
  k.extra?.(mb);
}

// ---------------------------------------------------------------- the reed
/** the reed's cane: from its tip (x = 0) to under the thread */
const XT = 0.026;
const THREAD0 = 0.0225;
const THREAD1 = 0.0395;
/** half-width, half-opening (at rest) and blade thickness (mm) along the cane (t = 0 tip … 1 thread) */
const RW = (t: number) => 3.45 - 1.55 * t ** 1.7;
const RO = (t: number) => 0.48 + 1.42 * t ** 1.35;
const RT = (t: number) => 0.1 + 0.42 * Math.min(1, t / 0.45) ** 0.8;
/** where the scrape ends and the bark begins (t, across the blade: u −1 … 1) */
const SCRAPE_T = (u: number) => 0.44 + 0.08 * (1 - u * u);
function blade(s: 1 | -1): Mesh {
  const mb = new MeshBuilder();
  const pt = (t: number, u: number, outer: boolean): Vec3 => {
    const e = 0.5 + 0.3 * (1 - t);
    const yin = RO(t) * Math.pow(Math.max(0, 1 - u * u), e);
    const th = RT(t) * (0.45 + 0.55 * Math.sqrt(Math.max(0, 1 - u * u)));
    return [t * XT, s * (yin + (outer ? th : 0)) * mm, u * RW(t) * mm];
  };
  const U = (v: number) => Math.sin(Math.PI * (v - 0.5));
  // the outside: the scraped tip and heart, then the bark
  const flip = s < 0;
  grid(mb, 18, 28, (a, v) => {
    const u = U(v);
    return pt(a * SCRAPE_T(u), u, true);
  }, SCRAPE, { flip });
  grid(mb, 14, 28, (a, v) => {
    const u = U(v);
    const t0 = SCRAPE_T(u);
    return pt(t0 + a * (1 - t0), u, true);
  }, CANE, { flip });
  // the inside, darker
  grid(mb, 20, 28, (a, v) => pt(a, U(v), false), CANE_IN, { flip: !flip });
  // the tip's edge and the rails
  grid(mb, 1, 28, (a, v) => pt(0, U(v), a > 0.5), SCRAPE, { flip: !flip });
  for (const u of [-1, 1]) grid(mb, 20, 1, (a, v) => pt(a, u * 0.999, v > 0.5), SCRAPE, { flip: u > 0 !== flip });
  return mb.build();
}
/** the thread wound over the cane and the staple, and the cork */
function reedBinding(mb: MeshBuilder): void {
  // fine ridges of the winding (≈0.3 mm thread), a little fuller towards the cork
  const prof: P2[] = [[0.0019, THREAD0 - 0.0002]];
  const n = Math.round((THREAD1 - THREAD0) / 0.00032);
  for (let i = 0; i <= n * 3; i++) {
    const x = THREAD0 + ((THREAD1 - THREAD0) * i) / (n * 3);
    const base = lerp(2.32, 2.5, (x - THREAD0) / (THREAD1 - THREAD0)) * mm;
    prof.push([base + 0.00005 * Math.abs(Math.sin((Math.PI * i) / 3)), x]);
  }
  prof.push([0.0024, THREAD1 + 0.0001]);
  lx(mb, prof, 28, THREAD);
  // the cork: bevelled at its top, into the well
  lx(mb, fillet([[0.0024, THREAD1], [0.00352, THREAD1 + 0.0003], [0.00358, THREAD1 + 0.004], [0.00352, REED + 0.004]], [0, 0.0005, 0, 0], 4), 36, CORK);
}

// ---------------------------------------------------------------- the body
function body(mb: MeshBuilder): void {
  const prof = (bs: number[]): P2[] => bs.map((b) => [rOut(b) * mm, X(b)]);
  const span = (b0: number, b1: number, n: number) => Array.from({ length: n + 1 }, (_, i) => lerp(b0, b1, i / n));
  // the ferrule: a silver cap round the reed well, rolled at its edge, and the well's dark inside
  lx(mb, fillet([[0.0037, X(-0.05)], [0.0053, X(-0.05)], [0.0057, X(0.5)], [0.0059, X(2.0)], [0.00615, X(2.6)]], [0, 0.0004, 0.0004, 0.0002, 0], 4), 48, AG);
  lx(mb, [[0.0037, X(-0.05)], [0.0037, X(14)], [0.002, X(18.2)]], 32, DARK);
  // the top joint: the bulb, a bead under it, the taper to the joint
  {
    const bead: P2[] = fillet([[10.25, 19.4], [10.18, 19.9], [10.5, 20.5], [10.5, 21.3], [10.18, 21.9], [10.05, TJ_TOP]] as P2[], [0, 0.15, 0.3, 0.3, 0.15, 0], 3).map(([r, b]) => [r * mm, X(b)] as P2);
    lx(mb, [...prof(span(2.6, 19.4, 22).slice(0, -1)), ...bead, ...prof(span(TJ_TOP + 4, J1 - 0.6, 16)), [11.45 * mm, X(J1)]], 72, WOOD);
  }
  // the lower joint's socket ring, the lower joint, the bell's ring
  const ring = (b0: number, b1: number, r0: number, r: number, rIn: number) =>
    lx(mb, fillet([[rIn, X(b0)], [r - 0.0003, X(b0)], [r, X(b0 + 0.6)], [r, X(b1 - 0.6)], [r - 0.0002, X(b1)], [r0, X(b1)]], [0, 0.0003, 0.0004, 0.0004, 0.0002, 0], 3), 72, AG);
  ring(J1, J1R, 13.85 * mm, 14.15 * mm, 11.45 * mm);
  lx(mb, [...prof(span(J1R, J2 - 0.5, 18)), [13.9 * mm, X(J2)]], 72, WOOD);
  ring(J2, J2R, 14.4 * mm, 14.85 * mm, 13.9 * mm);
  // (the bell is its own mesh; the dark of the bore beyond its throat)
  lx(mb, [[8.2 * mm, X(490)], [0, X(489)]], 32, DARK);
}
/** the bell: one turned piece, its flare opening into the rim and rolled under to the mouth, the
 *  throat inside (dark) flaring to the choke; the profile one smooth curve (no crease, no step) */
function bellMesh(): Mesh {
  const mb = new MeshBuilder();
  const curve = spline([...BELL_OUT, ...BELL_LIP].map(([b, r]) => [r * mm, X(b)] as P2), 6);
  lx(mb, curve, 96, WOOD);
  lx(mb, spline(BELL_IN.map(([b, r]) => [r * mm, X(b)] as P2), 4), 72, THROAT);
  return mb.build();
}

/** the thumb rest on the back of the lower joint: a base screwed to the wood, a hook for the right thumb */
function thumbRest(mb: MeshBuilder): void {
  const Cf = cupFrame(296, 180, 0.0);
  mb.with(Cf, () => {
    revolve(mb, fillet([[0, 0.0011], [0.0055, 0.0009], [0.006, 0.0002], [0.0056, -0.0006], [0, -0.0006]], [0, 0.003, 0.0004, 0.0003, 0], 4), 36, AG);
    for (const x of [-0.0035, 0.0035]) {
      mb.with(translate(x, 0.0011, 0), () => revolve(mb, fillet([[0, 0.0003], [0.0009, 0.0002], [0.0009, 0], [0, 0]], [0, 0.0002, 0, 0], 2), 16, AG));
      mb.quad([x - 0.0007, 0.00142, -0.00012], [x - 0.0007, 0.00142, 0.00012], [x + 0.0007, 0.00142, 0.00012], [x + 0.0007, 0.00142, -0.00012], DARK);
    }
  });
  // the hook: up off the plate, over towards the bell
  const hook = spline3([xform(Cf, [-0.002, 0.001, 0]), xform(Cf, [-0.0005, 0.0045, 0]), xform(Cf, [0.003, 0.0068, 0]), xform(Cf, [0.0075, 0.0072, 0]), xform(Cf, [0.0105, 0.0058, 0])], 7);
  const c = xform(Cf, [0.003, 0.003, 0]);
  sweep(mb, hook, (p) => sub(p, c), () => 0.0042, () => 0.0007, AG, 18, 3);
}

/** a crossbar: one of the links that reach across the front from a key's hinge tube on a rod line to
 *  its neighbour (a tongue, with the adjusting screw through its end and the cork under it), at `b` mm
 *  out to φ1 */
function crossbar(mb: MeshBuilder, rod: Rod, b: number, phi1: number, h = 2.9): void {
  const n = 9;
  const R0 = rodR(rod, b) - rOut(b);
  const path = Array.from({ length: n }, (_, i) => S(b, lerp(rod.phi, phi1, i / (n - 1)), lerp(R0, h, Math.min(1, (2 * i) / (n - 1))) + 0.25 * Math.sin((Math.PI * i) / (n - 1))));
  sweep(mb, path, OUT, (f) => 0.00105 + 0.0004 * Math.max(0, 1 - f / 0.15), () => 0.00048, AG, 12, 3);
  // the adjusting screw at its free end, and the cork it bears on
  const e = S(b, phi1, h);
  mb.with(frameY(e, OUT(e)), () => {
    revolve(mb, fillet([[0, -0.0006], [0.00085, -0.0006], [0.00085, 0.0007], [0, 0.0008]], [0, 0.0001, 0.0003, 0], 2), 16, AG);
    mb.quad([-0.0007, 0.00081, -0.0001], [-0.0007, 0.00081, 0.0001], [0.0007, 0.00081, 0.0001], [0.0007, 0.00081, -0.0001], DARK);
  });
  const c = S(b, phi1, 0.6);
  mb.with(frameY(c, OUT(c)), () => revolve(mb, fillet([[0, 0], [0.0011, 0], [0.0011, 0.0008], [0, 0.0008]], 0.0002, 2), 14, CORK));
}

/** the bridge keys across the lower joint and the bell (their two lugs and the adjusting eyes) */
function bridge(mb: MeshBuilder): void {
  for (const [phi, dir] of [[52, 1], [60, -1]] as const) {
    const b0 = dir > 0 ? 462 : 486;
    const b1 = dir > 0 ? 474.5 : 475.5;
    stem(mb, [S(b0, phi, 3.6), S(lerp(b0, b1, 0.5), phi, 4.1), S(b1, phi, 4.3)], 0.0012, 0.0006);
    ellipsoid(mb, S(b1, phi, 4.3), [0.0016, 0.0016, 0.0016], 14, AG);
  }
  for (const phi of [44, 68]) {
    const c = S(470.5, phi, 4.6);
    mb.with(frameY(c, OUT(c)), () => revolve(mb, fillet([[0.0006, -0.0008], [0.0014, -0.0008], [0.0014, 0.0008], [0.0006, 0.0008]], 0.0003, 2), 16, AG));
  }
}

/** a rotation by `a` about the line through p with unit direction u, written into `out` */
export function aboutAxis(out: Float32Array, p: Vec3, u: Vec3, a: number): Float32Array {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const C = 1 - c;
  const [x, y, z] = u;
  const r00 = c + x * x * C;
  const r01 = x * y * C - z * s;
  const r02 = x * z * C + y * s;
  const r10 = y * x * C + z * s;
  const r11 = c + y * y * C;
  const r12 = y * z * C - x * s;
  const r20 = z * x * C - y * s;
  const r21 = z * y * C + x * s;
  const r22 = c + z * z * C;
  out[0] = r00;
  out[1] = r10;
  out[2] = r20;
  out[3] = 0;
  out[4] = r01;
  out[5] = r11;
  out[6] = r21;
  out[7] = 0;
  out[8] = r02;
  out[9] = r12;
  out[10] = r22;
  out[11] = 0;
  out[12] = p[0] - (r00 * p[0] + r01 * p[1] + r02 * p[2]);
  out[13] = p[1] - (r10 * p[0] + r11 * p[1] + r12 * p[2]);
  out[14] = p[2] - (r20 * p[0] + r21 * p[1] + r22 * p[2]);
  out[15] = 1;
  return out;
}

/** where the model stands: held as a player holds it, the reed up and back towards the player, the
 *  bell down and out towards the audience, the plates turned to the audience */
export const OBOE_POSE = { tilt: 56, lean: 0.18, turn: 14, swing: 0.45, y: 0.3 };

export function buildOboeModel(): OboeModel {
  const mb = new MeshBuilder();
  body(mb);
  reedBinding(mb);
  for (const k of ALL) if (k.b !== undefined) toneHole(mb, k.b, k.phi!, k.hole!);
  toneHole(mb, 263.6, -2, 0.0012);
  for (const r of RODS) {
    for (const b of r.posts) post(mb, r, b);
    steel(mb, r);
  }
  for (const [r, p, c] of [[TA, 119, 130], [TA, 151, 160], [TA, 177, 190], [LA, 284.5, 262], [LA, 284.5, 297], [LA, 333.5, 324], [LBR, 372.5, 360], [LBR, 405.5, 418], [LD, 398.5, 388], [LD, 437.5, 448]] as const) needle(mb, r, p, c);
  for (const k of FIXED) keyPiece(mb, k);
  thumbRest(mb);
  bridge(mb);
  for (const [r, b, p1] of [[TA, 101, -22], [TB, 116, -12], [TA, 209, -10], [TA, 217, 10], [LD, 337, -30], [LBR, 330, 2], [LD, 404, -22], [LBR, 395, -6], [LD, 433, -24]] as const) crossbar(mb, r, b, p1);
  // the keys that move: each its own piece, turning about its rod line
  const keys: OboeKey[] = KEYS.map((k) => {
    const kb = new MeshBuilder();
    keyPiece(kb, k);
    const p0 = rodP(k.rod, k.rod.b0);
    const u = norm(sub(rodP(k.rod, k.rod.b1), p0));
    const ref = k.at ?? xform(cupFrame(k.b!, k.phi!), [0, 0, 0]);
    // which way it turns: a cup opens away from the tube, a touch is pressed towards it
    const q = xform(aboutAxis(new Float32Array(16), p0, u, 0.05), ref);
    const out = Math.hypot(q[1], q[2]) > Math.hypot(ref[1], ref[2]);
    const sign = (k.kind === 'cup') === out ? 1 : -1;
    const d = sub(ref, p0);
    const arm = len3(sub(d, scale(u, dot(d, u))));
    return { name: k.name, kind: k.kind, closed: !!k.closed, open: k.open, mesh: kb.build(), p0, u, sign, maxAng: (k.lift ?? 0.0016) / Math.max(0.002, arm) };
  });
  const blades = ([1, -1] as const).map((s) => ({ mesh: blade(s), s }));
  const { tilt, lean, turn, swing, y } = OBOE_POSE;
  const T = chain(translate(0, y, 0.02), rotY(swing), rotX(lean), rotZ(-deg(90 - tilt)), rotX(-Math.PI / 2 + deg(turn)), translate(-OBOE_LEN / 2, 0, 0));
  const holes = ALL.filter((k) => k.b !== undefined).map((k) => ({ x: X(k.b!), name: k.name }));
  return { T, statics: [mb.build()], rim: bellMesh(), keys, blades, bounds: { c: xform(T, [OBOE_LEN / 2, 0, 0]), r: 0.36 }, holes };
}

// ================================================================ posing
interface OboePose {
  pos: Float32Array;
  vel: Float32Array;
  /** seconds since the oboe last sounded */
  quiet: number;
  /** the reed's opening, eased (1 at rest) */
  open: number;
  R: Float32Array;
  W: Float32Array;
}
/** each seat's own springs (the shared WindPose carries the flute's and the trumpet's) */
const poses = new WeakMap<WindPose, OboePose>();
function oboePose(pose: WindPose, om: OboeModel): OboePose {
  let p = poses.get(pose);
  if (!p || p.pos.length !== om.keys.length) {
    // every key where it rests
    const pos = Float32Array.from(om.keys, (k) => (k.kind === 'cup' && k.open(0) ? 1 : 0));
    p = { pos, vel: new Float32Array(om.keys.length), quiet: 10, open: 1, R: new Float32Array(16), W: new Float32Array(16) };
    poses.set(pose, p);
  }
  return p;
}
/** tests: an oboe's springs as posed (1 open / pressed) */
export const oboeKeyState = (pose: WindPose): Float32Array | null => poses.get(pose)?.pos ?? null;

export function poseOboe(b: Batch, om: OboeModel, fr: VisualFrame | null, pose: WindPose, dt: number, now: number, rms: number): void {
  const T = om.T;
  const st = oboePose(pose, om);
  for (const s of om.statics) b.mesh(s, T);
  const br = fr?.breath;
  const blow = br ? br.pressure : 0;
  const focus = fr?.focus ?? null;
  // the fingers for the note the engine plays, held while it sounds and for a moment after
  st.quiet = blow > 0.015 ? 0 : Math.min(9, st.quiet + dt);
  const midi = focus && st.quiet < 0.8 ? (focus.midi ?? null) : null;
  const fingers = midi === null ? 0 : oboeFingersFor(midi);
  const lvl = Math.min(1, Math.sqrt(rms) * 3);
  // the keys, each turned on its rod to where its spring has it: drawn as built, with no light on them
  for (let i = 0; i < om.keys.length; i++) {
    const k = om.keys[i];
    const p = springTo(st.pos, st.vel, i, k.open(fingers) ? 1 : 0, dt, 26, 0.62);
    aboutAxis(st.R, k.p0, k.u, k.sign * k.maxAng * p);
    mulInto(st.W, 0, T, st.R);
    b.mesh(k.mesh, st.W);
  }
  // the reed: its blades close with its opening (blown shut once a cycle when loud), and shimmer
  const want = fr?.reed ? Math.min(1.3, fr.reed.open) : 1;
  st.open += (want - st.open) * (1 - Math.exp(-dt / 0.05));
  const f1 = focus?.f1 ?? 0;
  const shim = blow > 0.02 ? 0.00006 * lvl * Math.sin(now * 0.001 * Math.min(f1, 16) * TAU) : 0;
  const shut = Math.max(-0.0002, Math.min(0.00044, 0.00038 * (1 - st.open) + shim));
  for (const bl of om.blades) {
    // a turn about the cane's end under the thread, the tip towards the other blade
    const a = (bl.s * shut) / XT;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const R = st.R;
    R.fill(0);
    R[0] = c;
    R[1] = s;
    R[4] = -s;
    R[5] = c;
    R[10] = 1;
    R[15] = 1;
    R[12] = XT - c * XT;
    R[13] = -s * XT;
    mulInto(st.W, 0, T, R);
    b.mesh(bl.mesh, st.W);
  }
  // the bell's rim as it is, sounding or not: no light on it
  b.mesh(om.rim, T);
  // the breath into the reed's tip while the note is blown, as on the brass (the reed's tip is the model's x = 0)
  if (blow > 0.02) breathIn(b, T, [0, 0, 0], [-1, 0, 0], [0, 0, 1], Math.min(1, 0.35 + lvl) * (0.7 + 0.3 * Math.min(1, st.open)), now);
}
