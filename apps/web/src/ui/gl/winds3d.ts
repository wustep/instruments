// The flute and the trumpet in 3D, built once and posed from the live state.
//
// Flute: a Boehm C flute with a C foot, laid out from a Yamaha YFL-482H (`flute-side.jpg`, measured
// in pixels) and scaled to McGee's 670 mm overall and ≈600 mm sounding length (docs/3d-reference.md):
// the crown, a head tube that tapers (Ø17.8 → 19.6 mm measured off the photograph), the lip plate on
// its riser around a 12.4 × 10.2 mm embouchure hole 70.5 mm from the crown's end, the body's socket
// with its two rings, drawn tone-hole chimneys, and the keywork: five open-hole (French) cups with
// their grommets and pointed arms (LH 2, 3; RH 1, 2, 3), plain French cups (LH 1, G♯, the F♯ key),
// the thumb's dome cup, the small C♯ key, the D and D♯ trill keys with their levers to the right hand,
// the B♭ thumb levers, the G♯ spatula, hinge tubes on steel rods between posts soldered to ribs, needle
// springs, cream pads (Yamaha's pad set: 18 mm main, 19.5 mm foot, 12 mm small); the foot joint with
// its D♯ key and touch, and the C♯ and C keys with their rollers.
// Live: the keys close for the engine's fingering. The bore note it plays (from focus.lengthM)
// closes every hole above it, as on a simple open-standing system; the G♯ and D♯ keys stand closed.
// Each key returns on a spring that seats the pad (a small bounce, no timing of its own). The breath
// jet crosses the embouchure hole, and the bore's standing wave glows faintly along the tube up to
// the first open hole.
//
// Trumpet: a B♭ trumpet laid out from `trumpet-side.jpg` at the Bach 180S37's published sizes
// (docs/3d-reference.md): 480 mm from the receiver to the bell rim, an 11.66 mm bore in 12.7 mm
// tubing, a one-piece bell with a Bessel-like flare to a 122 mm rim rolled over a bead, a Bach 7C
// mouthpiece (16.2 mm cup, 88 mm long, 22 mm of it in the receiver). The leadpipe runs on the
// player's left to the main tuning slide in front (with its water key); three piston valves (casings
// with collars and knuckles, knurled nickel top and bottom caps, felts, stems, knurled buttons with
// pearl inlays); the first slide back with its thumb saddle, the third forward with its ring, the
// short second crook; the bell tail back to the bell bow and the bell pipe forward on the right; the
// finger hook and the braces. Lacquered yellow brass, nickel silver.
// Live: the pistons press for the engine's fingering ("valves 1+3 · partial 4"; 15.5 mm of travel,
// a spring return with a tiny bounce off the felt). The pressed valves' slides join the glowing air
// path, the lips buzz at the rim, the bore's standing wave glows faintly along the brass, and the rim
// shimmers with the level.
// Approximations: the flute's linkages between keys (clutches, the F♯ bridge, the Briccialdi
// lever's rod) are left out and its fingering is the engine's single bore length; the trumpet's
// wrap follows one photograph (perspective included) checked against the published sizes, not a
// drawing.
import type { VisualFrame } from '@piano-model/engine';
import { INK, VALVE_DOWN } from '../stage-draw.ts';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, about, add, chain, cross, dot, ink, norm, rotX, rotZ, scale, sub, translate, xform } from './gl3d.ts';
import { M, MeshBuilder, cyl, ellipsoid, grid, variant, type Mat } from './mesh.ts';

type P2 = [number, number];
const TAU = Math.PI * 2;
const C = {
  verm: (a: number) => ink(INK.vermilion, a),
  amber: (a: number) => ink(INK.amber, a),
  steel: (a: number) => ink(INK.steel, a),
};

// ---------------------------------------------------------------- materials
const AG = M.silverPolish;
/** the flute's tube: the bore's standing wave as a faint light (uv.x along the bore) */
const AGG = variant(M.silverPolish, { kind: 2 });
const BORE = M.boreDark;
const BR = M.brassLacquer;
/** brass on the air path (uv.x from the mouthpiece to the bell) */
const BRG = variant(M.brassLacquer, { kind: 2 });
const NS = M.nickelSilver;

// ---------------------------------------------------------------- geometry helpers
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const deg = (d: number) => (d * Math.PI) / 180;
/** a point at angle φ around the x axis (from +y towards −z, the camera's side) at radius r */
const polar = (x: number, phi: number, r: number): Vec3 => [x, r * Math.cos(phi), -r * Math.sin(phi)];
/** local y → world x: solids of revolution along the tube */
const TOX = new Float32Array([0, 1, 0, 0, 1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]);

/** a frame at p whose local y runs along `dir` */
function frameY(p: Vec3, dir: Vec3): Mat4 {
  const y = norm(dir);
  let x = cross(y, [0, 0, 1]);
  if (len3(x) < 1e-6) x = cross(y, [1, 0, 0]);
  x = norm(x);
  const z = cross(x, y);
  return new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, p[0], p[1], p[2], 1]);
}

/** a solid of revolution about local y (profile [radius, y]), with uv.x per profile point */
function revolve(mb: MeshBuilder, prof: P2[], seg: number, m: Mat, uvAt?: (i: number) => number): void {
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
    const ua: [number, number] = [uvAt ? uvAt(i) : 0, 0];
    const ub: [number, number] = [uvAt ? uvAt(i + 1) : 0, 0];
    for (let k = 0; k < seg; k++) {
      mb.stri(P(i, k), P(i + 1, k), P(i + 1, k + 1), N(i, k), N(i + 1, k), N(i + 1, k + 1), m, ua, ub, ub);
      mb.stri(P(i, k), P(i + 1, k + 1), P(i, k + 1), N(i, k), N(i + 1, k + 1), N(i, k + 1), m, ua, ub, ua);
    }
  }
}
/** revolve about the x axis (profile [radius, x]) */
const lx = (mb: MeshBuilder, prof: P2[], seg: number, m: Mat, uvAt?: (i: number) => number) => mb.with(TOX, () => revolve(mb, prof, seg, m, uvAt));

/** a 2D polyline with its corners rounded (radius per point; the ends are kept) */
function fillet(pts: P2[], rad: number | number[], n = 5): P2[] {
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

/** a 3D polyline bent round its corners (a bend radius per corner), as tubing is */
function bend(pts: Vec3[], rad: number | number[], n = 12): Vec3[] {
  const out: Vec3[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const r = typeof rad === 'number' ? rad : rad[i - 1];
    const A = pts[i - 1];
    const B = pts[i];
    const Cc = pts[i + 1];
    const l1 = len3(sub(A, B));
    const l2 = len3(sub(Cc, B));
    const u = norm(sub(A, B));
    const v = norm(sub(Cc, B));
    const th = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
    if (r <= 0 || th > Math.PI - 1e-3) {
      out.push(B);
      continue;
    }
    const lim1 = i - 1 === 0 ? 0.98 * l1 : 0.5 * l1;
    const lim2 = i + 1 === pts.length - 1 ? 0.98 * l2 : 0.5 * l2;
    const d = Math.min(r / Math.tan(th / 2), lim1, lim2);
    const rr = d * Math.tan(th / 2);
    const t1 = add(B, scale(u, d));
    const center = add(B, scale(norm(add(u, v)), rr / Math.sin(th / 2)));
    const e1 = norm(sub(t1, center));
    const e2 = norm(sub(add(B, scale(v, d)), center));
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(e1, e2))));
    const w = norm(sub(e2, scale(e1, dot(e1, e2))));
    for (let k = 0; k <= n; k++) {
      const a = (ang * k) / n;
      out.push(add(center, add(scale(e1, rr * Math.cos(a)), scale(w, rr * Math.sin(a)))));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** a Catmull-Rom curve through the points */
function spline3(pts: Vec3[], per: number): Vec3[] {
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

/** arc length along a path, and its total */
function arcs(path: Vec3[]): number[] {
  const acc = [0];
  for (let i = 1; i < path.length; i++) acc.push(acc[i - 1] + len3(sub(path[i], path[i - 1])));
  return acc;
}

/** a bar swept along a path: a rounded-rectangle section (superellipse, exponent `ex`) of half-width
 *  w(f) across and half-height h(f) along `up` (f = 0..1 along the path); optional uv along it */
function sweep(mb: MeshBuilder, path: Vec3[], upAt: (p: Vec3, t: Vec3) => Vec3, w: (f: number) => number, h: (f: number) => number, m: Mat, seg = 14, ex = 2.4, uv?: [number, number]): void {
  const N = path.length;
  const acc = arcs(path);
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
  const U = (i: number): [number, number] => [uv ? lerp(uv[0], uv[1], acc[i] / tot) : 0, 0];
  for (let i = 0; i < N - 1; i++)
    for (let k = 0; k < seg; k++) {
      const a = rings[i][k];
      const b = rings[i + 1][k];
      const c = rings[i + 1][k + 1];
      const d = rings[i][k + 1];
      mb.stri(a.p, b.p, c.p, a.n, b.n, c.n, m, U(i), U(i + 1), U(i + 1));
      mb.stri(a.p, c.p, d.p, a.n, c.n, d.n, m, U(i), U(i + 1), U(i));
    }
  // caps where the section has not come to a point
  for (const [i, j] of [[0, 1], [N - 1, N - 2]] as const) {
    if (w(i === 0 ? 0 : 1) < 1e-4) continue;
    const nn = norm(sub(path[i], path[j]));
    for (let k = 0; k < seg; k++) mb.stri(path[i], rings[i][k].p, rings[i][k + 1].p, nn, nn, nn, m, U(i), U(i), U(i));
  }
}
/** a round tube along a path (radius per arc-length fraction), uv along it */
const pipe = (mb: MeshBuilder, path: Vec3[], r: number | ((f: number) => number), m: Mat, seg = 22, uv?: [number, number]) => {
  const rf = typeof r === 'number' ? () => r : r;
  sweep(mb, path, (_p, t) => (Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]), rf, rf, m, seg, 2, uv);
};

/** a superellipse point at angle a */
const se = (A: number, B: number, n: number, a: number): P2 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [A * Math.sign(c) * Math.abs(c) ** (2 / n), B * Math.sign(s) * Math.abs(s) ** (2 / n)];
};

/** a straight knurl about local y: radius r from y0 to y1, `n` ridges `depth` deep */
function knurl(mb: MeshBuilder, r: number, y0: number, y1: number, n: number, depth: number, m: Mat): void {
  grid(mb, 1, n * 4, (u, v) => {
    const a = v * TAU;
    const rr = r - depth * 0.5 * (1 - Math.cos(a * n));
    return [rr * Math.cos(a), lerp(y0, y1, u), rr * Math.sin(a)];
  }, m, { wrapV: true });
}

/** monotone cubic interpolation through (xs, ys) */
function pchip(xs: number[], ys: number[]): (x: number) => number {
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

/** a damped spring towards `target` (0 closed / up, 1 open / down) that stops at both ends with a
 *  small bounce, as a pad seats or a piston meets its felt; integrated in fixed 2 ms steps */
function springTo(pos: Float32Array, vel: Float32Array, i: number, target: number, dt: number, hz: number, zeta: number): number {
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

// ================================================================ flute
const FL = 0.67; // overall, crown to the foot's end (McGee: 670–672)
const EMB = 0.0705; // embouchure-hole centre from the crown's end (→ 599.5 mm sounding length)
const RB = 0.0098; // body and foot tube, outer radius (Ø19.6 measured; 19 mm bore)
const HEAD_END = 0.1885; // the head tube enters the body's socket
const FOOT_J = 0.5355; // the foot's socket ring
/** the head tube's outer radius: drawn with a taper, Ø17.8 at the crown to Ø19.4 at the socket */
const rHead = (x: number) => 0.0089 + 0.0008 * Math.pow(clamp01((x - 0.012) / (HEAD_END - 0.012)), 0.65);
const HT = 0.0016; // drawn tone-hole chimneys stand 1.6 mm above the tube's top
const YC = RB + HT; // a closed pad's face, from the tube's axis
const ROD_PHI = deg(79.5); // the main rod: towards the audience, a little above the side
const ROD_R = 0.0137;
const TRILL_PHI = deg(128); // the trill keys' rod, below it
const TRILL_R = 0.0152;
// the foot's rod, above its cups; the whole foot is turned (as players align it) so that its C♯ and C
// cups face the audience a little upwards and catch the studio's low front card
const FOOT_PHI = deg(10);
const FOOT_R = 0.0148;
const BACK_R = 0.0142; // the thumb and G♯ rods on the player's side

type CupStyle = 'open' | 'plain' | 'dome' | 'crown';
interface FKey {
  x: number;
  /** the note the bore plays when this is the first open hole */
  note: number;
  style: CupStyle;
  /** cup outer radius, tone-hole outer radius */
  r: number;
  hole: number;
  phi: number;
  rodPhi: number;
  rodR: number;
  /** closed-standing (the G♯ and D♯ keys) */
  closed?: boolean;
  mesh: 'open' | 'plain' | 'dome' | 'small' | 'dsharp' | 'footA' | 'footB';
}
// positions measured off flute-side.jpg (7.75 px/mm, × 0.98 to McGee's 670 mm C-foot flute)
const MAIN = { rodPhi: ROD_PHI, rodR: ROD_R };
const FOOT = { rodPhi: FOOT_PHI, rodR: FOOT_R };
const BIG = { r: 0.00975, hole: 0.0071 };
const FKEYS: FKey[] = [
  { x: 0.307, note: 73, style: 'plain', r: 0.0062, hole: 0.0039, phi: 0, ...MAIN, mesh: 'small' }, // C♯
  { x: 0.338, note: 72, style: 'dome', r: 0.0083, hole: 0.0062, phi: 0, ...MAIN, mesh: 'dome' }, // thumb (B / B♭)
  { x: 0.3575, note: 71, style: 'plain', ...BIG, phi: 0, ...MAIN, mesh: 'plain' }, // LH 1
  { x: 0.379, note: 70, style: 'open', ...BIG, phi: 0, ...MAIN, mesh: 'open' }, // LH 2
  { x: 0.4, note: 69, style: 'open', ...BIG, phi: 0, ...MAIN, mesh: 'open' }, // LH 3
  { x: 0.424, note: 68, style: 'plain', ...BIG, phi: 0, ...MAIN, closed: true, mesh: 'plain' }, // G♯
  { x: 0.4475, note: 67, style: 'plain', ...BIG, phi: 0, ...MAIN, mesh: 'plain' }, // F♯ key
  { x: 0.474, note: 66, style: 'open', ...BIG, phi: 0, ...MAIN, mesh: 'open' }, // RH 1
  { x: 0.5, note: 65, style: 'open', ...BIG, phi: 0, ...MAIN, mesh: 'open' }, // RH 2
  { x: 0.529, note: 64, style: 'open', ...BIG, phi: 0, ...MAIN, mesh: 'open' }, // RH 3
  { x: 0.558, note: 63, style: 'plain', ...BIG, phi: deg(-42), ...FOOT, closed: true, mesh: 'dsharp' }, // D♯
  { x: 0.591, note: 62, style: 'crown', r: 0.0105, hole: 0.0074, phi: deg(62), ...FOOT, mesh: 'footA' }, // C♯ key
  { x: 0.625, note: 61, style: 'crown', r: 0.0105, hole: 0.0074, phi: deg(62), ...FOOT, mesh: 'footB' }, // C key
];
const MAIN_POSTS = [0.2965, 0.348, 0.412, 0.4605, 0.5375];
const FOOT_POSTS = [0.5505, 0.608, 0.6455];
const TRILL_POSTS = [0.262, 0.459, 0.5205];

export interface FluteModel {
  T: Mat4;
  statics: Mesh[];
  keys: { x: number; note: number; closed: boolean; mesh: Mesh; rod: Vec3; sign: number; maxAng: number }[];
  /** the tone holes the keys close (position along the flute, the note each opens) */
  holes: { x: number; m: number }[];
  bounds: { c: Vec3; r: number };
  src: Vec3;
}

const cupTop = (r: number) => Math.max(0.0024, 0.0031 * Math.min(1, r / 0.00975 + 0.15));
/** a key's cup (shell and pad) in the frame `Cf` (y along the cup's axis, the pad's face at 0) */
function cupInto(mb: MeshBuilder, Cf: Mat4, style: CupStyle, r: number, hole: number): void {
  const k = r / 0.00975;
  const top = cupTop(r);
  const ph = hole * 0.48; // the open hole in the cup (Ø6.8 in an 18 mm pad)
  mb.with(Cf, () => {
    let prof: P2[];
    let rads: number[];
    if (style === 'open') {
      // grommet lip round the hole, a shallow valley, the domed shoulder, the skirt
      prof = [[ph, 0.0002], [ph, top + 0.0002], [ph + 0.0009, top + 0.0002], [ph + 0.0013, top - 0.0003], [r - 0.0013 * k, top], [r, top - 0.0009], [r, 0.0006], [r - 0.0006, 0.0006]];
      rads = [0, 0.0002, 0.00025, 0.0003, 0.0007, 0.0005, 0.0002, 0];
    } else if (style === 'plain') {
      // the pad washer's button in a shallow dish, then the shoulder and skirt
      prof = [[0, top + 0.0001], [0.0013 * k, top + 0.0001], [0.0017 * k, top - 0.0002], [0.0048 * k, top - 0.0002], [r - 0.0013 * k, top], [r, top - 0.0009], [r, 0.0006], [r - 0.0006, 0.0006]];
      rads = [0, 0.0003, 0.0002, 0.0005, 0.0007, 0.0005, 0.0002, 0];
    } else if (style === 'crown') {
      // a convex French cup (the foot's): a dome rising to the pad washer's button
      prof = [[0, top + 0.0009], [0.0014 * k, top + 0.0009], [0.0019 * k, top + 0.0005], [r - 0.0016 * k, top - 0.0001], [r, top - 0.0011], [r, 0.0006], [r - 0.0006, 0.0006]];
      rads = [0, 0.0004, 0.0003, 0.0016, 0.0006, 0.0002, 0];
    } else {
      prof = [[0, top + 0.0005], [r - 0.0024 * k, top + 0.0001], [r, top - 0.0011], [r, 0.0006], [r - 0.0006, 0.0006]];
      rads = [0, 0.004, 0.0007, 0.0002, 0];
    }
    revolve(mb, fillet(prof, rads, 5), 44, AG);
    // the pad: its face seats on the chimney; it shows as a cream line under the skirt
    const pin = style === 'open' ? ph + 0.0002 : 0;
    revolve(mb, [[pin, 0], [r - 0.0009, 0], [r - 0.0006, 0.0003], [r - 0.0006, 0.0008]], 44, M.pad);
  });
}
/** the key's arm from its hinge tube on the rod to the cup: a French pointed arm over the cup to the
 *  hole (open cups) or the centre (plain ones); the dome cup's arm meets its edge */
function armInto(mb: MeshBuilder, Cf: Mat4, phi: number, style: CupStyle, r: number, hole: number, rod: Vec3): void {
  const rc = xform(chain(translate(0, -YC, 0), rotX(phi)), rod);
  const sg = rc[2] < 0 ? -1 : 1;
  const top = cupTop(r);
  const ph = hole * 0.48;
  const tipZ = style === 'open' ? ph + 0.0019 : 0.0011 * (r / 0.00975);
  const local: Vec3[] =
    style === 'dome'
      ? [[0, rc[1], rc[2]], [0, rc[1] * 0.45 + 0.0004, (rc[2] + sg * (r + 0.0009)) * 0.5 + sg * 0.0012], [0, top * 0.35, sg * (r + 0.0006)], [0, top - 0.0002, sg * (r - 0.0014)]]
      : [[0, rc[1], rc[2]], [0, rc[1] * 0.45 + 0.0004, (rc[2] + sg * (r + 0.0009)) * 0.5 + sg * 0.0012], [0, top * 0.35, sg * (r + 0.0007)], [0, top + 0.0003, sg * (r - 0.0009)], [0, top + 0.0006, sg * (r * 0.55 + tipZ * 0.45)], [0, top + 0.0004, sg * tipZ]];
  const path = spline3(local.map((p) => xform(Cf, p)), 7);
  const outward = (p: Vec3): Vec3 => [0, p[1], p[2]];
  if (style === 'dome') sweep(mb, path, outward, (f) => 0.0017 - 0.0004 * f, () => 0.0008, AG, 14, 3);
  else sweep(mb, path, outward, (f) => (f < 0.58 ? 0.0018 - 0.0005 * (f / 0.58) : 0.0013 * (1 - ((f - 0.58) / 0.42) ** 1.5) + 0.00012), (f) => 0.0009 - 0.0004 * f, AG, 14, 3);
}
/** a tone-hole chimney at (x, φ) with its dark bore inside */
function toneHole(mb: MeshBuilder, x: number, phi: number, ro: number): void {
  const ri = ro - 0.0005;
  const deep = RB - 0.0045;
  mb.with(chain(translate(x, 0, 0), rotX(-phi)), () => {
    revolve(mb, fillet([[ro, deep], [ro, YC - 0.0002], [ro - 0.00025, YC], [ri + 0.0001, YC], [ri, YC - 0.0003], [ri, deep]], [0, 0.00025, 0.00015, 0.00015, 0.0001, 0], 3), 40, AG);
    // the floor: the tube's own surface inside the chimney, dark
    grid(mb, 4, 40, (u, v) => {
      const a = v * TAU;
      const px = ri * u * Math.cos(a);
      const pz = ri * u * Math.sin(a);
      return [px, Math.sqrt((RB + 0.00005) ** 2 - pz * pz), pz];
    }, BORE, { wrapV: true });
  });
}
/** a post: a turned pillar on the rib with a ball round the rod */
function pillar(mb: MeshBuilder, x: number, phi: number, rTop: number, m: Mat = AG): void {
  const base = polar(x, phi, RB + 0.0003);
  const top = polar(x, phi, rTop);
  const L = len3(sub(top, base));
  mb.with(frameY(base, sub(top, base)), () => revolve(mb, fillet([[0, -0.0006], [0.0021, -0.0006], [0.0021, 0.0002], [0.00135, 0.0011], [0.00125, L - 0.0016], [0.0016, L - 0.0009]], [0, 0, 0.0004, 0.0005, 0.0006, 0], 3), 18, m));
  ellipsoid(mb, top, [0.00215, 0.00215, 0.00215], 18, m);
}
/** a hinge tube along x on a rod line, with rounded ends */
function barrel(mb: MeshBuilder, x0: number, x1: number, phi: number, r: number, rr = 0.0017): void {
  const c = polar(0, phi, r);
  mb.with(translate(0, c[1], c[2]), () => lx(mb, fillet([[0, x0], [rr, x0], [rr, x1], [0, x1]], [0, 0.0004, 0.0004, 0], 3), 20, AG));
}
/** a rib: the strap soldered along the tube under a row of posts */
function rib(mb: MeshBuilder, x0: number, x1: number, phi: number, half: number): void {
  const L = x1 - x0;
  grid(mb, Math.max(8, Math.round(L / 0.004)), 6, (u, v) => {
    const eu = Math.min(1, Math.min(u * L, (1 - u) * L) / 0.0012);
    const ev = Math.min(1, Math.min(v, 1 - v) / 0.18);
    return polar(x0 + u * L, phi + (v - 0.5) * 2 * half, RB - 0.00012 + 0.00062 * Math.sqrt(eu * ev));
  }, AG);
}
/** the steel rod of a rod line (seen in the gaps between hinge tubes), with its pointed screw end */
function steelRod(mb: MeshBuilder, x0: number, x1: number, phi: number, r: number): void {
  const a = polar(x0, phi, r);
  const b = polar(x1, phi, r);
  cyl(mb, a, b, 0.0008, 0.0008, 10, NS, false);
  cyl(mb, b, add(b, [0.0032, 0, 0]), 0.0013, 0.0001, 12, AG);
}
/** a needle spring: a fine wire from a post along the tube to the key's catch */
function needle(mb: MeshBuilder, x0: number, x1: number, phi: number): void {
  const a = polar(x0, phi + deg(10), ROD_R - 0.0016);
  const b = polar(x1, phi + deg(10), ROD_R - 0.0016);
  cyl(mb, a, b, 0.0004, 0.0004, 8, NS, false);
  cyl(mb, b, polar(x1, phi + deg(3), ROD_R - 0.0004), 0.0004, 0.0004, 8, AG);
}

/** the lip plate on its riser, round the embouchure hole, with the dark bore below */
function lipPlate(mb: MeshBuilder): void {
  const Ah = 0.0062;
  const Bh = 0.0051;
  const nh = 3.6; // the hole: 12.4 × 10.2, a rounded rectangle
  const Ap = 0.0225;
  const Bp = 0.0138;
  const np = 3; // the plate: 45 long, 27.6 across (arc length), standing 4.2 mm proud at the hole
  const rho = (s: number, w: number) => (Math.abs(s / Ap) ** np + Math.abs(w / Bp) ** np) ** (1 / np);
  const lift = (r: number) => (r <= 1 ? 0.001 + 0.0032 * Math.sqrt(Math.max(0, 1 - r ** 3)) : 0.001 * Math.sqrt(Math.max(0, 1 - ((r - 1) / 0.035) ** 2)));
  const place = (s: number, w: number, d: number): Vec3 => {
    const x = EMB + s;
    const rr = rHead(x) + d;
    const th = w / rHead(x);
    return [x, rr * Math.cos(th), -rr * Math.sin(th)];
  };
  // rows from inside the riser up over the rounded edge of the hole and out over the plate to its rolled edge
  const rows: { lam: number; d: number | null }[] = [{ lam: 0, d: -0.0007 }, { lam: 0, d: -1 }, { lam: 0.012, d: -2 }];
  for (let k = 0; k <= 26; k++) rows.push({ lam: 0.03 + (1.035 - 0.03) * (k / 26) ** 0.9, d: null });
  grid(mb, rows.length - 1, 80, (u, v) => {
    const row = rows[Math.round(u * (rows.length - 1))];
    const a = v * TAU;
    const [hs, hw] = se(Ah, Bh, nh, a);
    const [ps, pw] = se(Ap, Bp, np, a);
    const top = lift(rho(lerp(hs, ps, 0.03), lerp(hw, pw, 0.03)));
    const s = lerp(hs, ps, row.lam);
    const w = lerp(hw, pw, row.lam);
    const d = row.d === null ? lift(rho(s, w)) : row.d === -1 ? top - 0.0006 : row.d === -2 ? top - 0.00012 : row.d;
    return place(s, w, d);
  }, AG, { wrapV: true });
  // the dark bore inside the hole
  grid(mb, 5, 48, (u, v) => {
    const [hs, hw] = se(Ah, Bh, nh, v * TAU);
    return place(hs * u * 0.999, hw * u * 0.999, 0.00005);
  }, BORE, { wrapV: true });
}

export function buildFluteModel(): FluteModel {
  const mb = new MeshBuilder();
  const uvx = (x: number) => (x - EMB) / (FL - EMB);
  // ---- the tube
  // crown: a domed cap and two beads
  lx(mb, fillet([[0, 0], [0.005, 0.0003], [0.0078, 0.0016], [0.009, 0.0034], [0.0093, 0.0046], [0.0096, 0.0052], [0.0096, 0.006], [0.0093, 0.0064], [0.0096, 0.0068], [0.0096, 0.0076], [0.0093, 0.008], [0.0093, 0.0112], [rHead(0.0124), 0.0124]], [0, 0.003, 0.003, 0.002, 0.0003, 0.0003, 0.0002, 0.0002, 0.0002, 0.0002, 0.0002, 0.0003, 0], 4), 48, AG);
  // the head tube (no glow behind the cork), then from the lip plate on
  {
    const xs = Array.from({ length: 6 }, (_, i) => lerp(0.0124, 0.047, i / 5));
    lx(mb, xs.map((x) => [rHead(x), x] as P2), 56, AG);
    const xg = Array.from({ length: 14 }, (_, i) => lerp(0.047, HEAD_END + 0.0004, i / 13));
    lx(mb, xg.map((x) => [rHead(x), x] as P2), 56, AGG, (i) => uvx(xg[i]));
  }
  lipPlate(mb);
  // the body's socket with its two rings
  {
    const ring = (x: number): P2[] => [[0.0104, x], [0.011, x + 0.0005], [0.011, x + 0.0018], [0.01072, x + 0.0023], [0.011, x + 0.0028], [0.011, x + 0.0042], [0.0104, x + 0.0048]];
    const prof: P2[] = [[rHead(HEAD_END - 0.0005), HEAD_END - 0.0005], ...ring(HEAD_END), [0.0103, 0.2286], ...ring(0.229), [RB + 0.0001, 0.2345], [RB, 0.235]];
    lx(mb, fillet(prof, 0.00025, 3), 56, AG);
  }
  lx(mb, [[RB, 0.235], [RB, FOOT_J]], 64, AGG, (i) => uvx(i ? FOOT_J : 0.235));
  // the foot's socket ring
  lx(mb, fillet([[RB, FOOT_J], [0.0106, FOOT_J + 0.0006], [0.0108, FOOT_J + 0.0016], [0.0108, FOOT_J + 0.0042], [0.0105, FOOT_J + 0.0047], [0.0108, FOOT_J + 0.0052], [0.0108, FOOT_J + 0.0094], [RB + 0.0001, FOOT_J + 0.0104], [RB, FOOT_J + 0.0108]], 0.0002, 3), 56, AG);
  lx(mb, [[RB, FOOT_J + 0.0108], [RB, FL - 0.0045]], 64, AGG, (i) => uvx(i ? FL - 0.0045 : FOOT_J + 0.0108));
  // the foot's end ring, the open end and the bore inside it
  lx(mb, fillet([[RB, FL - 0.0045], [0.0103, FL - 0.0038], [0.0104, FL - 0.0012], [0.01, FL], [0.0095, FL], [0.0095, FL - 0.006]], [0, 0.0002, 0.0004, 0.0003, 0.0002, 0], 3), 56, AG);
  lx(mb, [[0, FL - 0.006], [0.0095, FL - 0.006]], 40, BORE);
  // ---- tone holes
  for (const k of FKEYS) toneHole(mb, k.x, k.phi, k.hole);
  // ---- the main rod line: rib, posts, steel, hinge tubes, needle springs
  rib(mb, 0.2925, 0.5405, ROD_PHI, deg(11));
  for (const x of MAIN_POSTS) pillar(mb, x, ROD_PHI, ROD_R);
  steelRod(mb, MAIN_POSTS[0] - 0.003, MAIN_POSTS[MAIN_POSTS.length - 1] + 0.0005, ROD_PHI, ROD_R);
  {
    const keysX = FKEYS.filter((k) => k.rodPhi === ROD_PHI).map((k) => k.x);
    const cuts = [...MAIN_POSTS.map((x) => ({ x, post: true })), ...keysX.slice(1).map((x, i) => ({ x: (x + keysX[i]) / 2, post: false }))].sort((a, b) => a.x - b.x);
    for (const kx of keysX) {
      const lo = cuts.filter((c) => c.x < kx).pop()!;
      const hi = cuts.find((c) => c.x > kx)!;
      // a post among the cuts that is not this key's own neighbour is skipped by filter order
      barrel(mb, lo.x + (lo.post ? 0.0022 : 0.00025), hi.x - (hi.post ? 0.0022 : 0.00025), ROD_PHI, ROD_R);
      const post = MAIN_POSTS.reduce((b, p) => (Math.abs(p - kx) < Math.abs(b - kx) ? p : b), MAIN_POSTS[0]);
      needle(mb, post, kx + (post < kx ? -0.004 : 0.004), ROD_PHI);
    }
  }
  // ---- trill keys (D and D♯, closed), their rod and the touches by the right hand
  rib(mb, 0.258, 0.524, TRILL_PHI, deg(8));
  for (const x of TRILL_POSTS) pillar(mb, x, TRILL_PHI, TRILL_R);
  steelRod(mb, TRILL_POSTS[0] - 0.003, TRILL_POSTS[2] + 0.0005, TRILL_PHI, TRILL_R);
  barrel(mb, 0.2642, 0.2768, TRILL_PHI, TRILL_R);
  barrel(mb, 0.2774, 0.4568, TRILL_PHI, TRILL_R, 0.0015);
  barrel(mb, 0.4612, 0.5183, TRILL_PHI, TRILL_R, 0.0015);
  for (const x of [0.269, 0.2846]) {
    toneHole(mb, x, deg(96), 0.0042);
    const Cf = chain(rotX(-deg(96)), translate(0, YC, 0));
    mb.with(translate(x, 0, 0), () => {
      cupInto(mb, Cf, 'dome', 0.0062, 0.0042);
      armInto(mb, Cf, deg(96), 'dome', 0.0062, 0.0042, polar(0, TRILL_PHI, TRILL_R));
    });
  }
  for (const x of [0.4875, 0.5125]) {
    const path = spline3([polar(x, TRILL_PHI, TRILL_R), polar(x, deg(104), 0.0188), polar(x, deg(80), 0.0198), polar(x - 0.0005, deg(60), 0.0186), polar(x - 0.0008, deg(48), 0.0176)], 6);
    sweep(mb, path, (p) => [0, p[1], p[2]], (f) => (f < 0.55 ? 0.0011 : 0.0011 + 0.0012 * Math.sin(Math.min(1, (f - 0.55) / 0.45) * Math.PI * 0.85)), () => 0.0007, AG, 12);
  }
  // ---- the thumb's levers (B and the Briccialdi B♭) and the G♯ spatula, on the player's side
  rib(mb, 0.31, 0.357, deg(-120), deg(9));
  for (const x of [0.3125, 0.354]) pillar(mb, x, deg(-120), BACK_R);
  barrel(mb, 0.3147, 0.3518, deg(-120), BACK_R);
  for (const [x0, x1, phi, r, w] of [[0.318, 0.337, deg(-152), 0.0152, 0.0052], [0.3225, 0.3445, deg(-176), 0.0162, 0.0042]] as const) {
    const xm = (x0 + x1) / 2;
    sweep(mb, spline3([polar(xm, deg(-120), BACK_R), polar(xm, (deg(-120) + phi) / 2, r + 0.0006), polar(xm, phi, r)], 5), (p) => [0, p[1], p[2]], () => 0.0012, () => 0.0007, AG, 10);
    sweep(mb, Array.from({ length: 9 }, (_, i) => polar(lerp(x0, x1, i / 8), phi, r)), (p) => [0, p[1], p[2]], (f) => w * Math.sqrt(Math.sin(Math.PI * Math.max(0.02, Math.min(0.98, f)))), () => 0.0007, AG, 14, 3);
  }
  for (const x of [0.4045, 0.4225]) pillar(mb, x, deg(-98), BACK_R);
  barrel(mb, 0.4067, 0.4203, deg(-98), BACK_R);
  {
    // the G♯ spatula: a stem rising on the player's side from its lever, then a teardrop spoon
    // (~22 × 11 mm) laid along the tube towards the head, face up for the little finger
    const stem = spline3([polar(0.414, deg(-98), BACK_R), polar(0.4135, deg(-80), 0.0176), polar(0.4115, deg(-62), 0.0205), polar(0.407, deg(-50), 0.0222)], 6);
    sweep(mb, stem, (p) => [0, p[1], p[2]], () => 0.0011, () => 0.0009, AG, 12);
    const blade = Array.from({ length: 17 }, (_, i) => {
      const t = i / 16;
      return polar(lerp(0.4085, 0.3835, t), deg(lerp(-50, -38, t)), lerp(0.0222, 0.0236, t) + 0.0012 * Math.sin(t * Math.PI));
    });
    const tear = (f: number) => 0.0058 * Math.pow(Math.sin(Math.PI * Math.max(0.02, Math.min(0.985, 0.08 + 0.92 * f))), 0.62) * (0.62 + 0.38 * f);
    sweep(mb, blade, (p) => [0, p[1], p[2]], tear, () => 0.00075, AG, 18, 3);
  }
  // ---- the foot's rod line
  rib(mb, 0.5475, 0.6485, FOOT_PHI, deg(10));
  for (const x of FOOT_POSTS) pillar(mb, x, FOOT_PHI, FOOT_R);
  steelRod(mb, FOOT_POSTS[0] - 0.003, FOOT_POSTS[2] + 0.0005, FOOT_PHI, FOOT_R);
  barrel(mb, 0.5527, 0.5735, FOOT_PHI, FOOT_R);
  barrel(mb, 0.5741, 0.6058, FOOT_PHI, FOOT_R);
  barrel(mb, 0.6102, 0.6433, FOOT_PHI, FOOT_R);
  needle(mb, 0.5505, 0.562, FOOT_PHI);
  needle(mb, 0.608, 0.598, FOOT_PHI);
  needle(mb, 0.6455, 0.632, FOOT_PHI);

  // ---- the keys that move: one mesh per shape, posed about their rods
  const meshes = new Map<string, { mesh: Mesh; rod: Vec3; sign: number; maxAng: number }>();
  for (const k of FKEYS) {
    if (meshes.has(k.mesh)) continue;
    meshes.set(k.mesh, keyMesh(k));
  }
  const keys = FKEYS.map((k) => ({ x: k.x, note: k.note, closed: !!k.closed, ...meshes.get(k.mesh)! }));
  const T = chain(translate(-FL / 2, 0.17, 0), rotX(-0.32));
  return { T, statics: [mb.build()], keys, holes: FKEYS.map((k) => ({ x: k.x, m: k.note })), bounds: { c: xform(T, [FL / 2, 0, 0]), r: 0.38 }, src: xform(T, [FL, 0, 0]) };
}

/** a key that moves, built in its own tube frame (x = 0 at the key): cup, pad, arm, and on the foot
 *  the touch or roller it is played by; it turns about its rod */
function keyMesh(k: FKey): { mesh: Mesh; rod: Vec3; sign: number; maxAng: number } {
  const mb = new MeshBuilder();
  const Cf = chain(rotX(-k.phi), translate(0, YC, 0));
  const rod = polar(0, k.rodPhi, k.rodR);
  cupInto(mb, Cf, k.style, k.r, k.hole);
  armInto(mb, Cf, k.phi, k.style, k.r, k.hole, rod);
  const outward = (p: Vec3): Vec3 => [0, p[1], p[2]];
  if (k.mesh === 'dsharp') {
    // the D♯ touch: a curved paddle beyond the rod (the key is a lever: press it and the cup lifts)
    sweep(mb, spline3([polar(0.004, FOOT_PHI, FOOT_R), polar(0.004, deg(24), 0.0168), polar(0.004, deg(40), 0.0186)], 5), outward, () => 0.0012, () => 0.0007, AG, 10);
    sweep(mb, Array.from({ length: 9 }, (_, i) => polar(lerp(-0.0058, 0.0108, i / 8), deg(44), 0.0189)), outward, (f) => 0.0044 * Math.sqrt(Math.sin(Math.PI * Math.max(0.02, Math.min(0.98, f)))), () => 0.0007, AG, 14, 3);
  }
  if (k.mesh === 'footA' || k.mesh === 'footB') {
    // the roller this key is played by, on an arm from its hinge tube
    const A = k.mesh === 'footA';
    const r0 = (A ? 0.5515 : 0.5525) - k.x;
    const r1 = (A ? 0.5665 : 0.5655) - k.x;
    const phi = A ? deg(74) : deg(90);
    const rr = A ? 0.0178 : 0.0184;
    const bx = (A ? 0.5755 : 0.6112) - k.x;
    const arm = A
      ? [polar(bx, FOOT_PHI, FOOT_R), polar(bx - 0.003, deg(28), 0.0188), polar(r1 + 0.003, deg(56), 0.0195), polar(r1 + 0.0016, phi, rr - 0.0018)]
      : [polar(bx, FOOT_PHI, FOOT_R), polar(bx - 0.004, deg(22), 0.0206), polar(0.556 - k.x + 0.0135, deg(32), 0.0218), polar(r1 + 0.0035, deg(66), 0.022), polar(r1 + 0.0016, phi, rr - 0.0018)];
    sweep(mb, spline3(arm, 6), outward, () => 0.0011, () => 0.0007, AG, 10);
    // the table under the roller and the roller's two end brackets
    sweep(mb, [polar(r1 + 0.0016, phi, rr - 0.0018), polar(r0 - 0.0016, phi, rr - 0.0018)], outward, () => 0.0016, () => 0.0006, AG, 10);
    for (const xe of [r0 - 0.0012, r1 + 0.0012]) cyl(mb, polar(xe, phi, rr - 0.0022), polar(xe, phi, rr + 0.0002), 0.0011, 0.0011, 10, AG);
    const a = polar(0, phi, rr);
    mb.with(translate(0, a[1], a[2]), () => lx(mb, fillet([[0, r0], [0.0023, r0], [0.0023, r1], [0, r1]], [0, 0.0008, 0.0008, 0], 4), 22, AG));
  }
  const c0 = xform(Cf, [0, 0, 0]);
  const t = xform(about(rod, rotX(0.05)), c0);
  const sign = Math.hypot(t[1], t[2]) > Math.hypot(c0[1], c0[2]) ? 1 : -1;
  return { mesh: mb.build(), rod, sign, maxAng: 0.0031 / len3(sub(c0, rod)) };
}

export interface WindPose {
  env: Float32Array;
  cups: Float32Array;
  cupV: Float32Array;
  valves: Float32Array;
  valveV: Float32Array;
  /** the trumpet's 1st and 3rd slides kicked out (0..1) */
  slide: Float32Array;
  slideV: Float32Array;
}
export const newWindPose = (): WindPose => ({ env: new Float32Array(48), cups: new Float32Array(16).fill(1), cupV: new Float32Array(16), valves: new Float32Array(3), valveV: new Float32Array(3), slide: new Float32Array(3), slideV: new Float32Array(3) });

/** the bore's standing wave, enveloped (nodes dark, antinodes glowing), into the tube-glow overlay
 *  over the first `frac` of the tube (the rest beyond the sounding end stays dark), at `gain` */
function waveOverlay(b: Batch, fr: VisualFrame | null, pose: WindPose, frac: number, scale: { of(v: number): number }, gain: number): void {
  const s = fr?.focus?.shapes[0];
  const out = b.ov.wave;
  if (!s || !s.length) {
    for (let i = 0; i < 48; i++) out[i] = (pose.env[i] *= 0.9) * gain;
    return;
  }
  let mx = 0;
  for (let i = 0; i < s.length; i++) mx = Math.max(mx, Math.abs(s[i]));
  const sc = scale.of(mx);
  for (let i = 0; i < 48; i++) {
    const x = i / 47;
    let v = 0;
    if (x <= frac) v = Math.abs(s[Math.min(s.length - 1, Math.round((x / Math.max(1e-3, frac)) * (s.length - 1)))] / sc);
    pose.env[i] = 0.8 * pose.env[i] + 0.2 * Math.min(1.2, v);
    out[i] = pose.env[i] * gain;
  }
}

/** the note the bore sounds, from its length (the engine's own c / 2f) */
const boreNote = (lengthM: number) => Math.round(69 + 12 * Math.log2(343 / (2 * lengthM * 440)));

export function poseFlute(b: Batch, fm: FluteModel, fr: VisualFrame | null, pose: WindPose, dt: number, now: number, scale: { of(v: number): number }): void {
  const T = fm.T;
  for (const s of fm.statics) b.mesh(s, T);
  const br = fr?.breath;
  const blow = br ? br.pressure : 0;
  const vib = br ? br.vib : 0;
  const focus = fr?.focus ?? null;
  const bore = focus ? boreNote(focus.lengthM) : null;
  // the sounding end: the first open hole (or the foot's end for the low C)
  const first = bore === null ? null : fm.keys.find((k) => k.note === bore);
  const endX = first ? first.x : FL;
  // the wave as a faint warm sheen in the silver (an accent, not a colour)
  waveOverlay(b, fr, pose, (endX - EMB) / (FL - EMB), scale, 0.45);
  b.ov.waveCol = [1, 0.6, 0.36];
  fm.keys.forEach((k, i) => {
    // fingered: every hole above the sounding one closes, the closed-standing keys open only for
    // their own note (G♯) or from it up (D♯, the little finger's key); at rest the keys stand
    const open = bore === null ? !k.closed : k.closed ? (k.note === 68 ? bore === 68 : bore >= k.note) : k.note <= bore;
    const p = springTo(pose.cups, pose.cupV, i, open ? 1 : 0, dt, 26, 0.62);
    const m = chain(T, translate(k.x, 0, 0), about(k.rod, rotX(k.sign * k.maxAng * p)));
    // the closed cups pulse faintly with the breath vibrato, nothing more
    const pulse = Math.min(0.06, 0.9 * vib * blow);
    b.mesh(k.mesh, m, focus && p < 0.5 && pulse > 0.004 ? ([1, 0.7, 0.42, pulse] as RGBA) : null);
  });
  // the breath: a sheet from the player's lips (on the plate, +z) across the embouchure hole to its
  // far edge, waving more as it goes (the jet's instability), faint
  if (blow > 0.02) {
    const r = rHead(EMB);
    const a: Vec3 = polar(0, deg(-35), r + 0.0062);
    const e: Vec3 = polar(0, deg(31), r + 0.0036);
    for (let j = -2; j <= 2; j++) {
      const jet: Vec3[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        const wob = 0.0009 * t ** 1.5 * Math.sin(now / 23 - t * 9 + j * 0.9) * blow;
        jet.push(xform(T, [EMB + j * 0.0018 * (1 + 0.25 * t), lerp(a[1], e[1], t) + wob, lerp(a[2], e[2], t)]));
      }
      b.line(jet, C.steel(0.1 + 0.28 * blow * (1 + 3 * vib)), 1.1);
    }
  }
}

// ================================================================ trumpet
const RT = 0.00635; // tubing: 11.66 mm (0.459″) bore, 12.7 mm outside
const VX = [-0.026, 0, 0.026]; // the three valves, 1 nearest the player
// valve casing Ø19.8: 1.56 × the tubing, as measured on trumpet-side.jpg (a 17 mm piston in a
// thick two-piece casing)
const RC = 0.0099;
const CY = 0.052; // casing half-length (104 mm between the caps)
const ZL = -0.017; // the player's left (the camera's side): leadpipe, slides
const ZB = 0.017; // the player's right: the bell section
const XR = -0.15; // the receiver's end
const XB = 0.33; // the bell rim: 480 mm from the receiver (NMM 9107)
const MP = 0.066; // the mouthpiece out of the receiver (88 mm long, 22 mm in)
const LEAD_SLOPE = 0.011 / 0.255;
const leadY = (x: number) => 0.036 + (x - XR) * LEAD_SLOPE;
const LEAD_END = 0.098;
const CAP_TOP = CY + 0.0104;
const STEM = 0.017;
const STROKE = 0.0155;
/** how far the 1st and 3rd slides kick out (the 3rd's stop nut meets its guide at 18 mm) */
const SLIDE_TRAVEL = [0.012, 0, 0.017];
const BOW_C: Vec3 = [-0.103, 0.0055, ZB];
const BOW_R = 0.0255;
const BELL0: Vec3 = [-0.103, 0.031, ZB];
const BELL_END: Vec3 = [XB, 0.0492, ZB];
const MS_TOP = leadY(LEAD_END);
const MS_LOW = -0.034;
const MS_X = 0.15;
const RIM = 0.0611; // 122.2 mm bell (Bach #37)
// the bell's outer radius by distance from the rim (m), after the side photograph's profile and a
// Bessel horn's (r ∝ d^−0.7) rate; the last few millimetres turn out flat to the rolled rim
const BELL_D = [0, 0.002, 0.005, 0.01, 0.016, 0.025, 0.04, 0.06, 0.085, 0.115, 0.15, 0.2, 0.26, 0.33, 0.434];
const BELL_R = [RIM, 0.0585, 0.0538, 0.0466, 0.0405, 0.0345, 0.0262, 0.0195, 0.0152, 0.0125, 0.0108, 0.0094, 0.0083, 0.0075, 0.0068];

export interface TrumpetModel {
  T: Mat4;
  /** the body, then the mouthpiece */
  statics: Mesh[];
  /** each valve's slide: the fixed tubes, and the slide itself (the U and its outer tubes) that the
   *  player kicks out along `dir` on the notes that need it (the 1st and 3rd) */
  slides: { plain: Mesh; glow: Mesh; sleeve: Mesh; sleeveGlow: Mesh; dir: Vec3 }[];
  piston: Mesh;
  /** the rolled rim (shimmers with the level) */
  rimBead: Mesh;
  valveX: number[];
  bounds: { c: Vec3; r: number };
  src: Vec3;
  rim: number;
  /** the mouthpiece's rim (lips) and its axis, in the model's frame */
  lips: Vec3;
  axis: Vec3;
}

export function buildTrumpetModel(): TrumpetModel {
  const mb = new MeshBuilder();
  const leadDir = norm([1, LEAD_SLOPE, 0]);
  const recv: Vec3 = [XR, leadY(XR), ZL];
  // ---- the air path, mouthpiece → bell, for the glow coordinate
  const leadPath: Vec3[] = [add(recv, scale(leadDir, 0.024)), [LEAD_END, MS_TOP, ZL]];
  const msR = (MS_TOP - MS_LOW) / 2;
  const msC: Vec3 = [MS_X, (MS_TOP + MS_LOW) / 2, (ZL - 0.002) / 2];
  const msU: Vec3 = [0, msR, ZL - msC[2]];
  const crook = Array.from({ length: 29 }, (_, i) => {
    const a = (i / 28) * Math.PI;
    return add(msC, add(scale(msU, Math.cos(a)), [msR * Math.sin(a), 0, 0]));
  });
  const msPath: Vec3[] = [[LEAD_END, MS_TOP, ZL], ...crook, [VX[2] + 0.004, MS_LOW, -0.002]];
  const tailPath = bend([[VX[0], -0.02, 0.003], [VX[0], -0.02, ZB], [BOW_C[0], -0.02, ZB]], 0.009, 10);
  const bowPath = Array.from({ length: 25 }, (_, i) => {
    const t = (i / 24) * Math.PI;
    return [BOW_C[0] - BOW_R * Math.sin(t), BOW_C[1] - BOW_R * Math.cos(t), ZB] as Vec3;
  });
  const bellLen = len3(sub(BELL_END, BELL0));
  const pl = (p: Vec3[]) => arcs(p)[p.length - 1];
  const VALVES = 0.11;
  const lens = [0.088, pl(leadPath), pl(msPath), VALVES, pl(tailPath), pl(bowPath), bellLen];
  const total = lens.reduce((a, b) => a + b, 0);
  let acc = 0;
  const U = (l: number): [number, number] => {
    const u0 = acc / total;
    acc += l;
    return [u0, acc / total];
  };
  const uMp = U(lens[0]);
  const uLead = U(lens[1]);
  const uMs = U(lens[2]);
  const uV = U(lens[3]);
  const uTail = U(lens[4]);
  const uBow = U(lens[5]);
  const uBell = U(lens[6]);
  void uMp;

  // ---- receiver and leadpipe
  const Fr = chain(frameY(recv, leadDir));
  mb.with(Fr, () => {
    revolve(mb, fillet([[0.0054, -0.0004], [0.0074, 0.0], [0.0079, 0.0012], [0.0079, 0.0028], [0.0071, 0.0042], [0.0068, 0.0196], [0.0073, 0.0204], [0.0073, 0.0222], [0.0062, 0.0244]], [0, 0.0003, 0.0004, 0.0004, 0.0006, 0.0003, 0.0003, 0.0003, 0], 3), 32, BR);
    revolve(mb, [[0.0054, -0.0004], [0.0054, 0.006]], 24, BORE);
  });
  pipe(mb, leadPath, (f) => lerp(0.0061, RT, Math.min(1, f * 1.4)), BRG, 26, uLead);
  // ---- the main tuning slide: fixed tubes, the slide (a little larger) with ferrules, the nickel
  // silver of the inner tubes where they show
  pipe(mb, msPath, RT, BRG, 26, uMs);
  {
    const fr = (p: Vec3) => (a: number) => cyl(mb, add(p, [a, 0, 0]), add(p, [a + 0.003, 0, 0]), RT + 0.0012, RT + 0.0012, 26, BR);
    const outerTop: Vec3[] = [[0.108, MS_TOP, ZL], ...crook, [0.106, MS_LOW, -0.002]];
    const a0 = (0.108 - LEAD_END) / pl(msPath);
    pipe(mb, outerTop, RT + 0.0007, BRG, 26, [uMs[0] + (uMs[1] - uMs[0]) * a0, uMs[0] + (uMs[1] - uMs[0]) * (1 - (0.106 - VX[2] - 0.004) / pl(msPath))]);
    fr([0.108, MS_TOP, ZL])(0);
    fr([0.106, MS_LOW, -0.002])(0);
    cyl(mb, [LEAD_END - 0.0005, MS_TOP, ZL], [0.108, MS_TOP, ZL], RT + 0.0002, RT + 0.0002, 26, NS, false);
    cyl(mb, [0.097, MS_LOW, -0.002], [0.106, MS_LOW, -0.002], RT + 0.0002, RT + 0.0002, 26, NS, false);
    cyl(mb, [LEAD_END - 0.003, MS_TOP, ZL], [LEAD_END, MS_TOP, ZL], RT + 0.0011, RT + 0.0011, 26, BR);
    cyl(mb, [0.094, MS_LOW, -0.002], [0.097, MS_LOW, -0.002], RT + 0.0011, RT + 0.0011, 26, BR);
    // the main slide's brace between its two legs
    cyl(mb, [0.128, MS_TOP - RT, ZL + 0.0006], [0.128, MS_LOW + RT, -0.0026], 0.0019, 0.0019, 12, BR);
    // the water key: nipple, cork, lever on its hinge
    const a = 2.45;
    const P = add(msC, add(scale(msU, Math.cos(a)), [msR * Math.sin(a), 0, 0]));
    const rn = norm(sub(P, add(msC, [0, 0, 0])));
    const n0 = add(P, scale(rn, RT - 0.001));
    const n1 = add(P, scale(rn, RT + 0.0028));
    cyl(mb, n0, n1, 0.0021, 0.0019, 16, BR);
    cyl(mb, n1, add(n1, scale(rn, 0.0016)), 0.0024, 0.0024, 16, M.cork);
    const tip = add(n1, scale(rn, 0.0026));
    const hinge: Vec3 = [0.143, MS_LOW - RT - 0.0026, -0.0022];
    cyl(mb, [0.143, MS_LOW - RT + 0.0005, -0.0022], hinge, 0.0014, 0.0014, 10, BR);
    cyl(mb, add(hinge, [0, 0, -0.003]), add(hinge, [0, 0, 0.003]), 0.0016, 0.0016, 12, BR);
    const lever = spline3([hinge, lerp3(hinge, tip, 0.5), tip, add(tip, add(scale(rn, 0.002), [0.007, 0, 0]))], 6);
    sweep(mb, lever, () => rn, () => 0.0018, () => 0.0006, BR, 12, 3);
  }
  // ---- valve casings, caps, knuckles
  for (const x of VX)
    mb.with(translate(x, 0, 0), () => {
      revolve(mb, fillet([[RC, -CY - 0.0006], [RC + 0.0009, -CY], [RC + 0.0009, -CY + 0.0058], [RC, -CY + 0.0066], [RC, 0.0115], [RC + 0.0005, 0.012], [RC + 0.0005, 0.0138], [RC, 0.0143], [RC, CY - 0.0076], [RC + 0.001, CY - 0.0068], [RC + 0.001, CY - 0.0004], [RC, CY]], 0.00025, 3), 48, BR);
      // the top cap: a knurled band, a domed top, the felt round the stem
      revolve(mb, fillet([[RC + 0.0003, CY - 0.0002], [RC + 0.0016, CY + 0.0004], [RC + 0.0016, CY + 0.0014]], 0.0002, 3), 48, NS);
      knurl(mb, RC + 0.0022, CY + 0.0014, CY + 0.0072, 68, 0.00028, NS);
      revolve(mb, fillet([[RC + 0.0022, CY + 0.0072], [RC + 0.0021, CY + 0.0079], [RC + 0.0012, CY + 0.0087], [0.0058, CY + 0.009], [0.0035, CY + 0.009], [0.0035, CY + 0.004]], [0, 0.0003, 0.0006, 0.0006, 0.0002, 0], 3), 48, M.nickelSatin);
      revolve(mb, fillet([[0.0035, CY + 0.0089], [0.0057, CY + 0.0089], [0.0057, CAP_TOP], [0.0035, CAP_TOP]], 0.0003, 3), 32, M.valveFelt);
      // the bottom cap: knurled, a domed foot with a dimple
      revolve(mb, fillet([[RC + 0.0003, -CY + 0.0002], [RC + 0.0013, -CY - 0.0006], [RC + 0.0013, -CY - 0.0018]], 0.0002, 3), 48, NS);
      knurl(mb, RC + 0.0018, -CY - 0.0086, -CY - 0.0018, 68, 0.00028, NS);
      revolve(mb, fillet([[0, -CY - 0.0114], [0.0018, -CY - 0.0116], [0.004, -CY - 0.0119], [RC - 0.0002, -CY - 0.0113], [RC + 0.0016, -CY - 0.0096], [RC + 0.0018, -CY - 0.0086]], [0, 0.0005, 0.002, 0.002, 0.0008, 0], 4), 48, M.nickelSatin);
    });
  // the knuckles between the casings, at two heights
  for (let k = 0; k < 2; k++)
    for (const y of [0.013, -0.04]) {
      const x0 = VX[k] + RC * 0.85;
      const x1 = VX[k + 1] - RC * 0.85;
      mb.with(translate(0, y, 0), () => lx(mb, fillet([[0, x0], [0.0042, x0], [0.003, x0 + 0.0022], [0.0028, (x0 + x1) / 2], [0.003, x1 - 0.0022], [0.0042, x1], [0, x1]], [0, 0, 0.0008, 0.002, 0.0008, 0, 0], 3), 16, BR));
    }
  // ---- the bell section: tail, bow, bell pipe and flare (one piece), the rolled rim
  pipe(mb, tailPath, (f) => lerp(RT, 0.0065, f), BRG, 26, uTail);
  pipe(mb, bowPath, (f) => lerp(0.0065, 0.0068, f), BRG, 26, uBow);
  const bellR = pchip(BELL_D, BELL_R);
  const tilt = Math.atan2(BELL_END[1] - BELL0[1], BELL_END[0] - BELL0[0]);
  const Fb = chain(translate(BELL0[0], BELL0[1], BELL0[2]), rotZ(tilt), TOX);
  {
    const N = 90;
    const prof: P2[] = [];
    const ss: number[] = [];
    for (let i = 0; i <= N; i++) {
      const d = 0.0012 + (bellLen - 0.0012) * (1 - i / N) ** 2.4;
      prof.push([bellR(d), bellLen - d]);
      ss.push(bellLen - d);
    }
    mb.with(Fb, () => revolve(mb, prof, 96, BRG, (i) => lerp(uBell[0], uBell[1], ss[i] / bellLen)));
  }
  const rb = new MeshBuilder();
  rb.with(Fb, () => {
    const ring: P2[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * TAU;
      ring.push([RIM - 0.0017 + 0.0017 * Math.cos(a), bellLen - 0.0017 + 0.0017 * Math.sin(a)]);
    }
    revolve(rb, ring, 120, BR);
  });
  // ---- the braces
  const brace = (a: Vec3, b: Vec3, r = 0.0021) => {
    const d = norm(sub(b, a));
    cyl(mb, a, b, r, r, 12, BR);
    cyl(mb, add(a, scale(d, -0.0012)), add(a, scale(d, 0.0022)), r + 0.0016, r, 14, BR);
    cyl(mb, add(b, scale(d, -0.0022)), add(b, scale(d, 0.0012)), r, r + 0.0016, 14, BR);
  };
  const bellY = (x: number) => BELL0[1] + (x - BELL0[0]) * Math.tan(tilt);
  brace([-0.09, leadY(-0.09), ZL + RT * 0.7], [-0.09, bellY(-0.09), ZB - RT * 0.7]);
  brace([0.128, MS_TOP - 0.002, ZL + RT * 0.8], [0.128, bellY(0.128) - 0.001, ZB - bellR(XB - 0.128) + 0.0008]);
  for (const x of [VX[0], VX[2]]) {
    brace([x, leadY(x), ZL + RT * 0.8], [x, leadY(x), -RC + 0.0006], 0.0024);
    brace([x, bellY(x), ZB - 0.0067 * 0.8], [x, bellY(x), RC - 0.0006], 0.0024);
  }
  // the finger hook on the leadpipe
  {
    const y0 = leadY(0.043);
    const path = spline3([[0.0445, y0 + RT - 0.001, ZL - 0.0006], [0.0445, y0 + 0.016, ZL - 0.0012], [0.041, y0 + 0.0235, ZL - 0.0018], [0.0335, y0 + 0.0248, ZL - 0.0018], [0.0282, y0 + 0.0205, ZL - 0.0014], [0.029, y0 + 0.0168, ZL - 0.001]], 7);
    pipe(mb, path, 0.0016, BR, 12);
    ellipsoid(mb, [0.0445, y0 + RT - 0.0004, ZL - 0.0005], [0.0034, 0.0012, 0.0024], 14, BR);
  }

  // ---- the valve slides: fixed tubes from the casing's ports (plain, and glowing when their valve
  // sends the air through them), and the slide itself, which moves: its U and outer tubes with
  // ferrules, sliding over nickel-silver inner tubes that show when it is kicked out
  interface Slide { fixed: Vec3[][]; inner: [Vec3, Vec3][]; sleeve: Vec3[]; ferrules: Vec3[]; ports: Vec3[]; dir: Vec3; onSleeve?: (s: MeshBuilder, m: Mat) => void; onFixed?: (s: MeshBuilder, m: Mat) => void }
  const slideDefs: Slide[] = [];
  {
    // 1st: back towards the player, with the thumb saddle
    const y1 = -0.01;
    const y2 = -0.027;
    const xb = -0.0915;
    const xs = -0.052;
    slideDefs.push({
      fixed: [y1, y2].map((y) => bend([[VX[0], y, -0.003], [VX[0], y, ZL], [xs, y, ZL]], 0.0075, 12)),
      inner: [y1, y2].map((y) => [[xs + 0.001, y, ZL], [xs - 0.026, y, ZL]] as [Vec3, Vec3]),
      sleeve: bend([[xs, y1, ZL], [xb, y1, ZL], [xb, y2, ZL], [xs, y2, ZL]], [0.0085, 0.0085], 12),
      ferrules: [[xs, y1, ZL], [xs, y2, ZL]],
      ports: [[VX[0], y1, -RC + 0.0004], [VX[0], y2, -RC + 0.0004]],
      dir: [-1, 0, 0],
      onSleeve: (s, m) => {
        const path = spline3([[-0.0786, y1 + 0.026, ZL - 0.0042], [-0.078, y1 + 0.013, ZL - 0.0026], [-0.0752, y1 + 0.0072, ZL - 0.0012], [-0.0668, y1 + RT + 0.0005, ZL], [-0.0584, y1 + 0.0072, ZL - 0.0012], [-0.0556, y1 + 0.013, ZL - 0.0026], [-0.055, y1 + 0.026, ZL - 0.0042]], 7);
        pipe(s, path, 0.0017, m, 12);
        ellipsoid(s, [-0.0668, y1 + RT - 0.0002, ZL], [0.004, 0.0014, 0.0026], 14, m);
      },
    });
    // 2nd: a short crook, out beyond the first slide (it does not move in playing)
    const z2 = -0.032;
    const a1 = -0.004;
    const a2 = -0.036;
    const xb2 = -0.034;
    slideDefs.push({
      fixed: [a1, a2].map((y) => bend([[VX[1], y, -0.003], [-0.001, y, -0.02], [-0.009, y, z2], [-0.0135, y, z2]], [0.008, 0.008], 12)),
      inner: [],
      sleeve: bend([[-0.0135, a1, z2], [xb2, a1, z2], [xb2, a2, z2], [-0.0135, a2, z2]], [0.016, 0.016], 14),
      ferrules: [[-0.0135, a1, z2], [-0.0135, a2, z2]],
      ports: [[VX[1], a1, -RC + 0.0004], [VX[1], a2, -RC + 0.0004]],
      dir: [0, 0, 0],
    });
    // 3rd: forward, with the ring and its stop rod
    const b1 = -0.004;
    const b2 = -0.02;
    const xf = 0.148;
    const xs3 = 0.059;
    const zr = ZL - RT - 0.0027;
    slideDefs.push({
      fixed: [b1, b2].map((y) => bend([[VX[2], y, -0.003], [VX[2], y, ZL], [xs3, y, ZL]], 0.0075, 12)),
      inner: [b1, b2].map((y) => [[xs3 - 0.001, y, ZL], [xs3 + 0.03, y, ZL]] as [Vec3, Vec3]),
      sleeve: bend([[xs3, b1, ZL], [xf, b1, ZL], [xf, b2, ZL], [xs3, b2, ZL]], [0.008, 0.008], 12),
      ferrules: [[xs3, b1, ZL], [xs3, b2, ZL]],
      ports: [[VX[2], b1, -RC + 0.0004], [VX[2], b2, -RC + 0.0004]],
      dir: [1, 0, 0],
      onSleeve: (s, m) => {
        const c: Vec3 = [0.075, 0.0135, ZL - 0.0042];
        const ring = Array.from({ length: 41 }, (_, i) => {
          const a = (i / 40) * TAU;
          return add(c, [0.0105 * Math.cos(a), 0.0105 * Math.sin(a) * 0.96, 0.0105 * Math.sin(a) * -0.28]);
        });
        pipe(s, ring, 0.0016, m, 12);
        cyl(s, [0.075, b1 + RT - 0.0006, ZL - 0.0004], [0.075, c[1] - 0.0101, c[2] + 0.0028], 0.0017, 0.0015, 12, m);
        ellipsoid(s, [0.075, b1 + RT - 0.0002, ZL], [0.0032, 0.0012, 0.0024], 14, m);
        // the stop rod beside the upper leg, clamped to the slide at its end, with a knurled stop
        // nut that meets the guide on the fixed tube at full travel
        cyl(s, [0.018, b1, zr], [0.113, b1, zr], 0.0012, 0.0012, 12, NS);
        s.with(chain(translate(0.0225, b1, zr), rotZ(-Math.PI / 2)), () => {
          revolve(s, fillet([[0.0012, -0.0003], [0.0028, 0], [0.0028, 0.0005]], 0.0002, 2), 24, NS);
          knurl(s, 0.0031, 0.0005, 0.0048, 28, 0.00022, NS);
          revolve(s, fillet([[0.0028, 0.0048], [0.0028, 0.0053], [0.0012, 0.0056]], 0.0002, 2), 24, NS);
        });
        ellipsoid(s, [0.111, b1, zr], [0.0028, 0.0026, 0.0024], 14, m);
        cyl(s, [0.111, b1, zr + 0.0012], [0.111, b1, ZL - RT * 0.6], 0.0016, 0.0019, 12, m);
      },
      onFixed: (s, m) => {
        ellipsoid(s, [0.0485, b1, zr], [0.0028, 0.0026, 0.0024], 14, m);
        cyl(s, [0.0485, b1, zr + 0.0012], [0.0485, b1, ZL - RT * 0.6], 0.0016, 0.0019, 12, m);
      },
    });
  }
  const slides = slideDefs.map((d, k) => {
    const u: [number, number] = [uV[0] + ((uV[1] - uV[0]) * k) / 3, uV[0] + ((uV[1] - uV[0]) * (k + 1)) / 3];
    const fixedMesh = (glow: boolean) => {
      const s = new MeshBuilder();
      const m = glow ? BRG : BR;
      for (const f of d.fixed) pipe(s, f, RT, m, 24, u);
      for (const [a, b] of d.inner) cyl(s, a, b, RT - 0.0001, RT - 0.0001, 24, NS, false);
      for (const p of d.ports) cyl(s, p, add(p, [0, 0, -0.0035]), RT + 0.0011, RT + 0.0008, 24, BR);
      d.onFixed?.(s, BR);
      return s.build();
    };
    const sleeveMesh = (glow: boolean) => {
      const s = new MeshBuilder();
      pipe(s, d.sleeve, RT + 0.0007, glow ? BRG : BR, 24, u);
      for (const f of d.ferrules) cyl(s, add(f, [-0.0015, 0, 0]), add(f, [0.0015, 0, 0]), RT + 0.0012, RT + 0.0012, 24, BR);
      d.onSleeve?.(s, BR);
      return s.build();
    };
    return { plain: fixedMesh(false), glow: fixedMesh(true), sleeve: sleeveMesh(false), sleeveGlow: sleeveMesh(true), dir: d.dir };
  });
  // ports where the main slide and the bell tail enter the casings
  cyl(mb, [VX[2] + RC - 0.0004, MS_LOW, -0.002], [VX[2] + RC + 0.0032, MS_LOW, -0.002], RT + 0.0011, RT + 0.0008, 24, BR);
  cyl(mb, [VX[0], -0.02, RC - 0.0004], [VX[0], -0.02, RC + 0.0032], RT + 0.0011, RT + 0.0008, 24, BR);
  // ---- the piston: stem, button with its pearl (in the casing's frame, at rest)
  const pm = new MeshBuilder();
  const yb = CAP_TOP + STEM;
  pm.with(translate(0, 0, 0), () => {
    revolve(pm, [[0.0025, CY + 0.004], [0.0025, yb - 0.0012]], 16, NS);
    revolve(pm, fillet([[0.0025, yb - 0.0018], [0.0042, yb - 0.0012], [0.0046, yb], [0.008, yb + 0.0001], [0.0084, yb + 0.0006]], [0, 0.0004, 0.0003, 0.0003, 0], 3), 40, NS);
    knurl(pm, 0.0084, yb + 0.0006, yb + 0.0034, 56, 0.00022, NS);
    revolve(pm, fillet([[0.0084, yb + 0.0034], [0.0083, yb + 0.0043], [0.0072, yb + 0.0046], [0.0066, yb + 0.004], [0.0063, yb + 0.004]], [0, 0.0005, 0.0004, 0.0002, 0], 3), 40, NS);
    revolve(pm, fillet([[0.0063, yb + 0.0036], [0.0063, yb + 0.0041], [0.004, yb + 0.0045], [0, yb + 0.0047]], [0, 0.0003, 0.004, 0], 4), 40, M.pearlInlay);
  });
  // ---- the mouthpiece (Bach 7C), along the leadpipe's axis
  const mp = new MeshBuilder();
  mp.with(Fr, () => {
    const s0 = -MP;
    // rim (26 mm), the cup's bowl necking in to the throat, two rings, the shank's sleeve and taper
    const o: P2[] = [[0.0081, 0.0012], [0.0103, 0.0], [0.0128, 0.0016], [0.013, 0.0038], [0.013, 0.0078], [0.0124, 0.0092], [0.0118, 0.0104], [0.0104, 0.0145], [0.0084, 0.0192], [0.0066, 0.0236], [0.0054, 0.0272], [0.0051, 0.03], [0.0055, 0.031], [0.0051, 0.0322], [0.0055, 0.0334], [0.0052, 0.0346], [0.0053, 0.039], [0.006, 0.0402], [0.0061, 0.046], [0.0059, 0.0475], [0.0048, 0.088], [0.0031, 0.088]];
    revolve(mp, fillet(o.map(([r, s]) => [r, s0 + s] as P2), [0, 0.0012, 0.0014, 0.0008, 0.0003, 0.0004, 0.0016, 0.006, 0.006, 0.004, 0.0015, 0.0003, 0.0003, 0.0003, 0.0003, 0.0003, 0.0002, 0.0002, 0.0003, 0.002, 0.0003, 0], 4), 48, AG);
    // the cup inside, and the throat (dark)
    const cup: P2[] = [[0.0081, 0.0012], [0.0078, 0.003], [0.0068, 0.006], [0.0045, 0.0085], [0.0019, 0.0098], [0.0018, 0.012]];
    revolve(mp, fillet(cup.map(([r, s]) => [r, s0 + s] as P2), [0, 0.002, 0.003, 0.002, 0.0006, 0], 5), 48, AG);
    revolve(mp, [[0.0018, s0 + 0.0118], [0, s0 + 0.0124]], 16, BORE);
  });
  const lips = add(recv, scale(leadDir, -MP - 0.0006));
  const T = chain(translate(-0.057, 0.2, 0), rotX(-0.18));
  return { T, statics: [mb.build(), mp.build()], slides, piston: pm.build(), rimBead: rb.build(), valveX: VX, bounds: { c: xform(T, [0.06, 0.005, 0.0]), r: 0.33 }, src: xform(T, [XB, BELL_END[1], ZB]), rim: RIM, lips, axis: leadDir };
}

export function poseTrumpet(b: Batch, tm: TrumpetModel, fr: VisualFrame | null, pose: WindPose, dt: number, now: number, rms: number, wave: { of(v: number): number }): void {
  const T = tm.T;
  for (const s of tm.statics) b.mesh(s, T);
  const meta = fr?.excite?.meta ?? '';
  const valves = /valves (\S+)/.exec(meta)?.[1] ?? 'open';
  const down = VALVE_DOWN[valves] ?? VALVE_DOWN.open;
  const lvl = Math.min(1, Math.sqrt(rms) * 3);
  // the slides players kick out to flatten the sharp combinations: the 3rd for low D and C♯
  // (1+3, 1+2+3 on the third partial, the engine's count from the pedal), the 1st higher up
  const partial = Number(/partial (\d+)/.exec(meta)?.[1] ?? 0);
  const combo = valves === '1+3' ? 0.6 : valves === '1+2+3' ? 1 : 0;
  const kick = [partial >= 4 ? combo : 0, 0, partial > 0 && partial <= 3 ? combo : 0];
  tm.valveX.forEach((x, k) => {
    const p = springTo(pose.valves, pose.valveV, k, down[k] ? 1 : 0, dt, 22, 0.6);
    b.mesh(tm.piston, chain(T, translate(x, -STROKE * p, 0)), down[k] ? [1, 0.62, 0.34, 0.05] : null);
    const sl = tm.slides[k];
    b.mesh(down[k] ? sl.glow : sl.plain, T);
    const q = springTo(pose.slide, pose.slideV, k, kick[k], dt, 6, 0.9) * SLIDE_TRAVEL[k];
    b.mesh(down[k] ? sl.sleeveGlow : sl.sleeve, q ? chain(T, translate(sl.dir[0] * q, sl.dir[1] * q, sl.dir[2] * q)) : T);
  });
  // the rim: a faint shimmer with the level
  b.mesh(tm.rimBead, T, lvl > 0.02 ? [1, 0.7, 0.4, 0.1 * lvl * (0.75 + 0.25 * Math.sin(now * 0.021))] : null);
  waveOverlay(b, fr, pose, 1, wave, 0.55);
  b.ov.waveCol = [1, 0.37, 0.22];
  // the lips at the rim: they buzz at the note (drawn slowed), opening with the level
  const f = fr?.focus?.f1 ?? 0;
  const gap = lvl > 0.02 ? 0.0012 + 0.0018 * lvl * (0.5 + 0.5 * Math.sin(now * 0.001 * Math.min(f, 18) * 6.283)) : 0.0005;
  const up = norm(cross([0, 0, 1], tm.axis));
  for (const sgn of [-1, 1]) {
    const lip: Vec3[] = [];
    for (let k = 0; k <= 10; k++) {
      const z = -0.011 + (k / 10) * 0.022;
      lip.push(xform(T, add(tm.lips, add(scale(up, sgn * (gap + 0.0032 * (1 - (z / 0.011) ** 2))), [0, 0, z]))));
    }
    b.line(lip, lvl > 0.02 ? C.verm(0.85) : C.amber(0.35), 2.6);
  }
}
