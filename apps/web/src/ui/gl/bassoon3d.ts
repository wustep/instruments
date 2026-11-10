// The bassoon in 3D: a Heckel-system bassoon of the Fox / Heckel / Yamaha class, 1340 mm tall, built
// once and posed from the live state. Real scale (docs/3d-reference.md, "Bassoon"), laid out from Fox's
// photograph of a Renard 220 seen from both sides (bassoon-fox-renard220-front.jpg, 3.16 px/mm: its
// 1340 mm from the boot's foot to the bell's rim, Wikipedia's 1.34 m, the National Music Museum's
// maple Heckel-system bassoons 1334–1343 mm):
//
//   the boot: its two bores in one piece of maple, an oval 71 × 42 mm under its silver ring, narrowing
//     to 62 mm at its foot, which the U-tube's cap (a nickel-silver sleeve 57 mm tall, its plate across
//     the bottom held by two screws) closes; 419 mm with its ring;
//   the wing joint: Ø 28.5, 486 mm out of the boot to its silver cap, with the wing — the thick fin of
//     wood that reaches in front of the long joint from 505 to 725 mm, through which the left hand's
//     three finger holes are drilled on a slant (L1 small, L2, L3 inside its ring key); the bocal's
//     socket in its cap;
//   the long joint: Ø 43, 580 mm out of the boot to its 34 mm silver ring; the bell: 307 mm over the
//     ring, swelling to Ø 52.5 and narrowing to Ø 44.6 under its rim, which a pale bead ring (Ø 55)
//     finishes;
//   the bocal: a silver crook, Ø 10 at its cork tapering to Ø 5.2, rising 57 mm out of the wing's cap
//     and falling away 206 mm sideways to the reed (the photograph's curve), its whisper-key nipple on
//     the rise; the reed: 55 mm of cane (Wikipedia: "around 5.5 cm"), its blades 28 mm, 14.8 mm wide at
//     the tip, three wires (the first at the blades' base, the second just above the turban, the third
//     under it) and the turban of red thread over the tube;
//   the keywork, silver-plated: the left thumb's low B♭, B, C and D touches at the foot of the long
//     joint and their long keys up it to their pads (B♭'s on the bell, across the ring); the whisper key's
//     long lever up the wing to the bocal's nipple; the C♯ key and the A, C and D flick keys (vents high
//     on the wing); the left little finger's E♭ and C♯ keys (pads on the long joint); the E and E♭ touches
//     on the wing; the right thumb's E plate, B♭, F♯ and A♭ keys on the boot's back; the right hand's B
//     hole, the A hole's ring key, the G key (R3) and the little finger's F (with rollers), F♯ and A♭
//     keys; the C♯-trill key; posts on their flanges, hinge tubes on steel pivots, needle springs, pads
//     of tan leather; the hand rest on the boot.
//
// Live: the keys and rings follow the bassoon's Heckel fingering for the engine's note (bassoon-
// fingering.ts, the chart the 2D stage uses), on springs, back to rest a moment after it stops; the
// closed holes (a seated pad, a pressed ring, a finger hole under its finger) glow faintly with the
// standing wave in the bore under them (the engine's pressure shape, reed → open end, the bore folded
// down the wing and the boot and up the long joint and the bell); the reed's blades close with its
// opening (`fr.reed.open`) and shimmer; the bell shimmers with the level.
// Approximations: the linkages are shown, not simulated (each pad springs to the state its touches give
// it); the trill keys never move (the chart has no trills); the keys' places are the photograph's where
// it shows them and the bassoon diagram's order elsewhere.
import type { VisualFrame } from '@piano-model/engine';
import { FA, FB, FD, HALF, L1, L2, L3, LB, LBB, LC, LCS, LD, LEB, PF, PFS, PGS, R1, R2, R3, RBB, RE, RFS, RGS, SEB, TCS, W, bassoonFingersFor } from '../bassoon-fingering.ts';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, add, chain, cross, dot, mulInto, norm, rotY, rotZ, scale, sub, translate, xform } from './gl3d.ts';
import { M, MeshBuilder, cyl, ellipsoid, grid, variant, type Mat } from './mesh.ts';
import { aboutAxis, fillet, frameY, lx, pchip, revolve, spline3, springTo, sweep } from './oboe3d.ts';
import type { WindPose } from './winds3d.ts';

type P2 = [number, number];
const TAU = Math.PI * 2;
const mm = 0.001;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- materials
const WOOD = M.bassoonMaple;
const DARK = M.hole;
/** the bell's throat: the varnish's colour on the bore's end grain, in shadow */
const THROAT = variant(M.bassoonMaple, { col: [0.06, 0.025, 0.015], tint: true });
/** the countersink round a tone hole: the end grain under the varnish, darker */
const SINK = variant(M.bassoonMaple, { col: [0.13, 0.045, 0.022], tint: true });
const AG = M.silverKeys;
const STEEL = M.steel;
const CORK = M.cork;
/** the pads: tan leather (bassoon-wlm-5688.jpg: a golden-brown rim under every cup) */
const PAD = variant(M.leather, { col: [0.58, 0.42, 0.24], tint: true });
const BOCAL = M.silverPolish;
const BEAD = M.bellBead;
const THREAD = M.silk;
const WIRE = M.brassDull;
const CANE = M.cane;
const SCRAPE = M.caneScraped;
const CANE_IN = variant(M.cane, { col: [0.42, 0.3, 0.14], tint: true });
/** the hand rest: a turned and polished hardwood, and the little fingers' rollers (hard rubber) */
const REST = M.rosewood;
const ROLLER = M.ebonite;

// ---------------------------------------------------------------- small helpers
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (t: number) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};
/** a model point from mm */
const V = (x: number, y: number, z: number): Vec3 => [x * mm, y * mm, z * mm];

// ================================================================ the bassoon's measures (mm, y up from the boot's foot)
// Off bassoon-fox-renard220-front.jpg (1920 × 4392, the bell's rim at row 56 and the boot's foot at row
// 4290: 3.16 px/mm for 1340 mm): mm from the foot = 1340 − (row − 56) / 3.16
export const BASSOON_H = 1340;
/** the stage's world is mirrored in x (three3d.ts: the scenes are laid out with a piano's bass at −x),
 *  so the model is built as its mirror image, to be seen true: its long joint at −x, its wing at +x */
const MIR = -1;
/** the two bores' axes: the wing joint's (and the boot's small bore) and the long joint's (the large) */
const XW = -17.75 * MIR;
const XL = 17.75 * MIR;
/** the boot: its cap (the U-tube's), its ring, its top */
const CAP1 = 57;
const BOOT_RING0 = 381;
const BOOT_TOP = 419;
/** the wing joint's cap (the bocal's socket) */
const WING_CAP0 = 869;
const WING_TOP = 905;
/** the long joint's ring, under the bell */
const LJ_TOP = 998.5;
const BELL0 = 1033;
/** the bell's pale bead ring */
const RIM0 = 1329;

// the bell's outside (mm from the foot → radius), off the photograph: swelling over the long joint's
// ring (its socket), a waist, the swell a third of the way up, the neck under the rim
const BELL_OUT: P2[] = [[BELL0, 23.4], [1040, 24.2], [1052, 24.6], [1072, 24.3], [1100, 23.3], [1120, 23.0], [1145, 23.6], [1170, 24.9], [1192, 26.2], [1210, 25.6], [1236, 23.5], [1260, 22.4], [1300, 22.3], [1316, 22.7], [RIM0, 23.6]];
const bellFit = pchip(BELL_OUT.map((p) => p[0]), BELL_OUT.map((p) => p[1]));
const bellR = (y: number) => bellFit(Math.max(BELL0, Math.min(RIM0, y)));
const longR = (y: number) => lerp(21.4, 21.6, clamp01((y - BOOT_TOP) / (LJ_TOP - BOOT_TOP)));

// the wing joint: a tube of Ø 28.5 and, from 505 to 725 mm, the wing: a fin of wood (a superellipse in
// section, its front flat) reaching across in front of the long joint, joined to the tube smoothly
const WR = 14.25;
const LOBE = { cx: 13, cz: 8, ax: 25, az: 16, n: 4 };
const lobeK = (y: number) => smooth((y - 492) / 40) * (1 - smooth((y - 688) / 44));
/** the distance from the origin along the unit direction (dx, dz) to a superellipse's edge (origin inside) */
function seHit(dx: number, dz: number, cx: number, cz: number, ax: number, az: number, n: number): number {
  let lo = 0;
  let hi = 90;
  for (let k = 0; k < 34; k++) {
    const t = (lo + hi) / 2;
    if (Math.abs((t * dx - cx) / ax) ** n + Math.abs((t * dz - cz) / az) ** n < 1) lo = t;
    else hi = t;
  }
  return lo;
}
function wingR(y: number, th: number): number {
  const k = lobeK(y);
  if (k <= 0) return WR;
  const a = th * DEG;
  const rs = k * seHit(Math.sin(a), Math.cos(a), LOBE.cx, LOBE.cz, LOBE.ax, LOBE.az, LOBE.n);
  return (WR ** 10 + rs ** 10) ** 0.1;
}

// the boot: a superellipse in section about its middle, a little deeper on the large bore's side
const BN = 2.3;
const bootF = (y: number) => clamp01((y - CAP1) / (BOOT_TOP - CAP1));
const bootA = (y: number) => lerp(31, 35.6, bootF(y));
const bootXc = (y: number) => MIR * lerp(3.2, 3.6, bootF(y));
const bootB = (y: number) => lerp(18.6, 20.6, bootF(y));
const DEEP = 0.12;
/** a point of the boot's section at angle parameter t (0 the front, +z; π/2 the large bore's side, +x),
 *  `off` mm out from its surface */
function bootPt(y: number, t: number, off = 0): P2 {
  const s = Math.sin(t);
  const c = Math.cos(t);
  const u = Math.sign(s) * Math.abs(s) ** (2 / BN);
  const w = Math.sign(c) * Math.abs(c) ** (2 / BN);
  return [bootXc(y) + MIR * (bootA(y) + off) * u, (bootB(y) * (1 + DEEP * u) + off) * w];
}
function bootR(y: number, th: number): number {
  const a = th * DEG;
  const dx = Math.sin(a);
  const dz = Math.cos(a);
  const A = bootA(y);
  const B = bootB(y);
  let lo = 0;
  let hi = 60;
  for (let k = 0; k < 34; k++) {
    const t = (lo + hi) / 2;
    const u = (t * dx) / A;
    if (Math.abs(u) ** BN + Math.abs((t * dz) / (B * (1 + DEEP * u))) ** BN < 1) lo = t;
    else hi = t;
  }
  return lo;
}

// ---------------------------------------------------------------- the parts' surfaces
type Part = 'bell' | 'long' | 'wing' | 'boot';
const cOf = (p: Part, y: number): number => (p === 'wing' ? XW : p === 'boot' ? bootXc(y) : XL);
function radius(p: Part, y: number, th: number): number {
  if (p === 'bell') return bellR(y);
  if (p === 'long') return longR(y);
  if (p === 'wing') return wingR(y, th);
  return bootR(y, th);
}
/** a point `h` mm off a part's surface at height y (mm), θ degrees round from the front (the fingers'
 *  side, +z) towards the long joint's outside (+x) */
const S = (p: Part, y: number, th: number, h = 0): Vec3 => {
  const a = th * DEG;
  const r = radius(p, y, th) + h;
  return V(cOf(p, y) + MIR * r * Math.sin(a), y, r * Math.cos(a));
};
/** the outward normal of a part's surface */
function nrm(p: Part, y: number, th: number): Vec3 {
  const a = S(p, y, th - 0.5);
  const b = S(p, y, th + 0.5);
  const c = S(p, y - 0.5, th);
  const d = S(p, y + 0.5, th);
  let n = norm(cross(sub(d, c), sub(b, a)));
  const o = S(p, y, th);
  if (n[0] * (o[0] - cOf(p, y) * mm) + n[2] * o[2] < 0) n = scale(n, -1);
  return n;
}
/** the frame of a point of a surface: x up along the part, y out of it, z round it; `gap` mm off */
function frameAt(p: Part, y: number, th: number, gap = 0): Mat4 {
  const n = nrm(p, y, th);
  const up = norm(sub([0, 1, 0], scale(n, n[1])));
  const z = cross(up, n);
  const o = add(S(p, y, th), scale(n, gap * mm));
  return new Float32Array([up[0], up[1], up[2], 0, n[0], n[1], n[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1]);
}
/** a model point's place on a part: its height and θ */
const placeOf = (p: Part, q: Vec3): [number, number] => {
  const y = q[1] / mm;
  return [y, Math.atan2(MIR * (q[0] / mm - cOf(p, y)), q[2] / mm) / DEG];
};
/** out from a part's axis (sweeps' up) */
const OUTof = (p: Part) => (q: Vec3): Vec3 => [q[0] - cOf(p, q[1] / mm) * mm, 0, q[2]];
/** a point of a circle drawn on a surface round (y, θ): radius ρ (m), angle a from up, `lift` mm off */
function wrapped(p: Part, y: number, th: number, rho: number, a: number, lift: number): Vec3 {
  const F = frameAt(p, y, th);
  const q: Vec3 = [F[12] + rho * (Math.cos(a) * F[0] + Math.sin(a) * F[8]), F[13] + rho * (Math.cos(a) * F[1] + Math.sin(a) * F[9]), F[14] + rho * (Math.cos(a) * F[2] + Math.sin(a) * F[10])];
  const [yy, tt] = placeOf(p, q);
  return S(p, yy, tt, lift);
}

// ================================================================ the body
/** a solid of revolution about a vertical axis at x = cx (mm), its profile [r, y] in mm */
function lathe(mb: MeshBuilder, cx: number, prof: P2[], seg: number, m: Mat): void {
  mb.with(translate(cx * mm, 0, 0), () => revolve(mb, prof.map(([r, y]) => [r * mm, y * mm] as P2), seg, m));
}
/** the boot's surface between heights, `off(y)` mm out from the wood */
function bootSurf(mb: MeshBuilder, ys: number[], off: (i: number) => number, m: Mat, at: (i: number) => number = (i) => ys[i]): void {
  grid(mb, ys.length - 1, 120, (u, v) => {
    const i = Math.round(u * (ys.length - 1));
    const [x, z] = bootPt(at(i), v * TAU, off(i));
    return V(x, ys[i], z);
  }, m, { wrapV: true });
}
/** a flat cap over the boot's section at height y, `off` mm out, shrunk to its middle */
function bootCap(mb: MeshBuilder, y: number, yAt: number, off: number, m: Mat, dome = 0): void {
  const xc = bootXc(yAt);
  grid(mb, 6, 120, (u, v) => {
    const [x, z] = bootPt(yAt, v * TAU, off);
    const k = 1 - u;
    return V(xc + (x - xc) * k, y + dome * (1 - k * k), z * k);
  }, m, { wrapV: true });
}
function body(mb: MeshBuilder): void {
  // the boot's wood, its ring (38 mm, its edges rounded, flat across the top where the joints go in),
  // the U-tube's cap: a sleeve with a lip at its foot and the plate across the bottom
  const span = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));
  bootSurf(mb, span(CAP1 - 2, BOOT_RING0 + 2, 30), () => 0, WOOD);
  const ring = fillet([[0, BOOT_RING0], [1.15, BOOT_RING0], [1.15, BOOT_TOP], [-0.8, BOOT_TOP]] as P2[], [0, 0.6, 0.7, 0], 3);
  bootSurf(mb, ring.map((p) => p[1]), (i) => ring[i][0], AG, () => BOOT_TOP - 1);
  bootCap(mb, BOOT_TOP, BOOT_TOP - 1, -0.8, AG);
  const cap = fillet([[0, CAP1 + 0.6], [0.9, CAP1], [0.9, 5], [1.4, 3.2], [1.4, 1.4], [0.4, 0], [-1.2, 0]] as P2[], [0, 0.3, 0.6, 0.4, 0.5, 0.4, 0], 3);
  bootSurf(mb, cap.map((p) => p[1]), (i) => cap[i][0], AG, () => CAP1);
  bootCap(mb, 0, CAP1, -1.2, AG, -0.4);
  // the cap's plate screws, either end of its foot
  for (const t of [Math.PI / 2, -Math.PI / 2]) {
    const [x, z] = bootPt(CAP1, t, 1.4);
    const o = V(x, 2.3, z);
    mb.with(frameY(o, [MIR * Math.sign(Math.sin(t)), 0, 0]), () => revolve(mb, fillet([[0, 0.0007], [0.0016, 0.0006], [0.0017, 0], [0, -0.0003]], [0, 0.0005, 0, 0], 3), 16, AG));
  }
  // the long joint: its tenon in the boot, its body, under its ring
  lathe(mb, XL, [[longR(BOOT_TOP - 4), BOOT_TOP - 4], [longR(700), 700], [longR(LJ_TOP + 1), LJ_TOP + 1]], 96, WOOD);
  // its ring, under the bell (the bell's socket swells over it)
  lathe(mb, XL, fillet([[21.5, LJ_TOP - 0.2], [23.4, LJ_TOP], [23.65, LJ_TOP + 0.8], [23.65, BELL0 - 0.8], [23.4, BELL0], [22.6, BELL0]] as P2[], [0, 0.3, 0.6, 0.6, 0.3, 0], 3), 96, AG);
  // the wing joint: the tube and its wing, from inside the boot to its cap
  const ys: number[] = [];
  for (let y = BOOT_TOP - 4; y < WING_CAP0 + 1; y += y > 470 && y < 760 ? 4 : 12) ys.push(y);
  ys.push(WING_CAP0 + 1);
  grid(mb, ys.length - 1, 128, (u, v) => {
    const y = ys[Math.round(u * (ys.length - 1))];
    const th = v * 360;
    const r = wingR(y, th);
    return V(XW + MIR * r * Math.sin(th * DEG), y, r * Math.cos(th * DEG));
  }, WOOD, { wrapV: true });
  // its cap (the bocal's socket): the silver ring, its top, the socket's dark mouth, the bocal's cork
  lathe(mb, XW, fillet([[14.0, WING_CAP0 - 0.2], [15.2, WING_CAP0], [15.3, WING_CAP0 + 0.8], [15.3, WING_TOP - 0.8], [15.0, WING_TOP], [6.2, WING_TOP], [5.9, WING_TOP - 0.6]] as P2[], [0, 0.3, 0.5, 0.6, 0.4, 0.3, 0], 3), 72, AG);
  lathe(mb, XW, [[5.9, WING_TOP - 0.6], [5.9, WING_TOP - 6], [3, WING_TOP - 8]], 36, DARK);
  lathe(mb, XW, fillet([[5.0, WING_TOP - 2], [5.85, WING_TOP - 1.5], [5.85, WING_TOP + 3.2], [5.2, WING_TOP + 4.2], [4.9, WING_TOP + 4.4]] as P2[], [0, 0.3, 0.6, 0.3, 0], 3), 36, CORK);
}
/** the bell: its wood from the long joint's ring, its bead ring rolled over to the mouth (Ø 40 inside),
 *  the throat inside, dark */
function bellMesh(): Mesh {
  const mb = new MeshBuilder();
  const prof: P2[] = [];
  for (let y = BELL0; y < RIM0; y += 3) prof.push([bellR(y), y]);
  prof.push([bellR(RIM0), RIM0]);
  lathe(mb, XL, prof, 96, WOOD);
  lathe(mb, XL, fillet([[23.4, RIM0 - 0.4], [27.0, RIM0], [27.4, RIM0 + 3], [27.3, RIM0 + 7.5], [26.0, BASSOON_H], [21.0, BASSOON_H], [20.2, BASSOON_H - 1.5]] as P2[], [0, 0.6, 1.2, 1.8, 1.4, 0.8, 0], 4), 96, BEAD);
  lathe(mb, XL, [[20.2, BASSOON_H - 1.5], [19.6, 1300], [18.4, 1250], [16.8, 1180], [14, 1120], [0, 1110]], 64, THROAT);
  return mb.build();
}

// ================================================================ the bocal and the reed
// The bocal's centre line off the photograph (mm from the wing's axis at the cap's top: across, away from
// the long joint, and up), from its cork inside the socket to the reed
const BOCAL_PATH: P2[] = [[0, -22], [0, 0], [0.4, 18], [1.6, 36], [5.5, 48.5], [13, 55.5], [24, 57.4], [38, 54.4], [55, 46.6], [70, 38.4], [86, 25.6], [101, 10.6], [117, -1.2], [133, -11.6], [150, -19.8], [168, -26.2], [187, -31], [206, -35]];
const bocalPts = spline3(BOCAL_PATH.map(([a, b]) => V(XW - MIR * a, WING_TOP + b, 0)), 8);
/** the bocal's outside radius along it (f 0 cork … 1 the reed's end) */
const bocalR = (f: number) => lerp(5.0, 2.6, f ** 0.85);
/** the whisper key's nipple: on the bocal's rise, facing away from the long joint */
const PIP_Y = WING_TOP + 24;
/** the bocal's centre line where the nipple is */
const pipAt = (): Vec3 => bocalPts[bocalPts.findIndex((p) => p[1] >= PIP_Y * mm)];
// the reed: in its own frame (x along it from its butt, y across the blades' width, z through them)
const REED_L = 55;
/** the blades: from the first wire to the tip */
const XB0 = 27;
const BW = (t: number) => 4.8 + 2.6 * t ** 0.85;
const BO = (t: number) => 1.9 - 1.18 * t ** 0.85;
const BT = (t: number) => 0.95 - 0.83 * t ** 0.7;
const SCR_T = (u: number) => 0.2 + 0.08 * (1 - u * u);
/** how far the bocal goes into the reed's tube */
const REED_ON = 11;
function reedFrame(): Mat4 {
  const n = bocalPts.length;
  const e = bocalPts[n - 1];
  const d = norm(sub(e, bocalPts[n - 3]));
  const o = sub(e, scale(d, REED_ON * mm));
  const z: Vec3 = [0, 0, 1];
  const y = norm(cross(z, d));
  return new Float32Array([d[0], d[1], d[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, o[0], o[1], o[2], 1]);
}
function blade(s: 1 | -1): Mesh {
  const mb = new MeshBuilder();
  const pt = (t: number, u: number, outer: boolean): Vec3 => {
    const e = 0.5 + 0.3 * (1 - t);
    const zin = BO(t) * Math.pow(Math.max(0, 1 - u * u), e);
    const th = BT(t) * (0.45 + 0.55 * Math.sqrt(Math.max(0, 1 - u * u)));
    return V(XB0 + t * (REED_L - XB0), u * BW(t), s * (zin + (outer ? th : 0)));
  };
  const U = (v: number) => Math.sin(Math.PI * (v - 0.5));
  const flip = s < 0;
  // the outside: the bark's collar from the first wire, then the scraped blade to the tip
  grid(mb, 6, 28, (a, v) => pt(a * SCR_T(U(v)), U(v), true), CANE, { flip });
  grid(mb, 20, 28, (a, v) => {
    const t0 = SCR_T(U(v));
    return pt(t0 + a * (1 - t0), U(v), true);
  }, SCRAPE, { flip });
  grid(mb, 20, 28, (a, v) => pt(a, U(v), false), CANE_IN, { flip: !flip });
  grid(mb, 1, 28, (a, v) => pt(1, U(v), a > 0.5), SCRAPE, { flip: !flip });
  for (const u of [-1, 1]) grid(mb, 20, 1, (a, v) => pt(a, u * 0.999, v > 0.5), SCRAPE, { flip: u > 0 !== flip });
  return mb.build();
}
/** the reed's tube (round at its butt, flattening to the blades), its wires and its turban */
function reedTube(mb: MeshBuilder): void {
  const sec = (x: number, t: number): Vec3 => {
    const f = clamp01(x / XB0) ** 1.4;
    const w = lerp(3.75, BW(0), f);
    const h = lerp(3.75, BO(0) + BT(0), f);
    const n = lerp(2, 2.6, f);
    const s = Math.sin(t);
    const c = Math.cos(t);
    return V(x, w * Math.sign(s) * Math.abs(s) ** (2 / n), h * Math.sign(c) * Math.abs(c) ** (2 / n));
  };
  grid(mb, 14, 40, (u, v) => sec(lerp(15, XB0 + 0.2, u), v * TAU), CANE, { wrapV: true });
  // the wires: brass, twisted, round the flattening tube
  for (const x of [20.5, XB0 - 0.6]) {
    const ring = Array.from({ length: 41 }, (_, i) => {
      const p = sec(x, (i / 40) * TAU);
      const k = 1 + 0.38 / Math.max(2.8, Math.hypot(p[1], p[2]) / mm);
      return [p[0], p[1] * k, p[2] * k] as Vec3;
    });
    sweep(mb, ring, () => [1, 0, 0], () => 0.00034, () => 0.00034, WIRE, 8, 2);
    // the twisted ends
    const e = sec(x, Math.PI / 2);
    cyl(mb, [e[0], e[1] + 0.0002, e[2]], [e[0], e[1] + 0.0016, e[2] + 0.0003], 0.00032, 0.00028, 8, WIRE);
  }
  // the turban: the thread wound over the tube's butt and its third wire, coated, a bead at its top
  const prof: P2[] = [[3.0, -0.4], [4.35, 0], [4.65, 0.6]];
  for (let i = 0; i <= 40; i++) {
    const x = 1 + (14 * i) / 40;
    prof.push([4.65 + 0.12 * Math.sin((x / 15) * Math.PI) + 0.03 * Math.sin(i * 2.2), x]);
  }
  prof.push([4.95, 15.8], [4.85, 16.9], [4.2, 17.6], [3.8, 17.7]);
  lx(mb, fillet(prof.map(([r, x]) => [r * mm, x * mm] as P2), 0.0002, 2), 36, THREAD);
}
function bocal(mb: MeshBuilder): void {
  const n = bocalPts.length;
  sweep(mb, bocalPts, () => [0, 0, 1], (f) => bocalR(f) * mm, (f) => bocalR(f) * mm, BOCAL, 24, 2);
  // the whisper nipple: a short pip on the rise, its pin-hole
  const i = bocalPts.findIndex((p) => p[1] >= PIP_Y * mm);
  const f = i / (n - 1);
  const c = bocalPts[i];
  const out: Vec3 = [-MIR, 0, 0];
  const a = add(c, scale(out, (bocalR(f) - 0.4) * mm));
  mb.with(frameY(a, out), () => {
    revolve(mb, fillet([[0, 0], [0.0012, 0], [0.0011, 0.0019], [0.0009, 0.0024], [0.0003, 0.0024]], [0, 0, 0.0003, 0.0002, 0], 3), 16, BOCAL);
    revolve(mb, [[0.00035, 0.0024], [0.00035, 0.0018], [0, 0.0018]], 10, DARK);
  });
  // a silver collar where the crook leaves its cork
  const k = bocalPts.findIndex((p) => p[1] >= (WING_TOP + 4.4) * mm);
  mb.with(frameY(bocalPts[k], [0, 1, 0]), () => revolve(mb, fillet([[0.0049, -0.0002], [0.0056, 0], [0.0056, 0.0022], [0.0051, 0.0026]], [0, 0.0003, 0.0003, 0], 2), 32, BOCAL));
}

// ================================================================ the keywork's parts
/** a rod line: the steel the keys' hinge tubes turn on, `h` mm off a part's surface at θ, between its
 *  end posts (mm) */
interface Rod {
  p: Part;
  th: number;
  h: number;
  y0: number;
  y1: number;
  posts: number[];
}
const rodP = (r: Rod, y: number): Vec3 => lerp3(S(r.p, r.y0, r.th, r.h), S(r.p, r.y1, r.th, r.h), (y - r.y0) / (r.y1 - r.y0));
/** a cup's shell height over its pad's face */
const cupTop = (r: number) => 0.0016 + 0.08 * r;
/** a key's cup (as Heckel's and Fox's: a drawn shell, its crown coned to a point) over its pad */
function cup(mb: MeshBuilder, Cf: Mat4, r: number): void {
  const top = cupTop(r);
  const cone = 0.16 * r;
  mb.with(Cf, () => {
    revolve(mb, fillet([[0, top + cone], [0.0011, top + cone * 0.86], [r - 0.0009, top + 0.0001], [r, top - 0.0005], [r, 0.0006], [r - 0.0005, 0.0006]] as P2[], [0, 0.0003, 0.0009, 0.0004, 0.0002, 0], 4), 40, AG);
    revolve(mb, fillet([[0, 0], [r - 0.0006, 0], [r - 0.0003, 0.0004], [r - 0.0003, 0.0009]] as P2[], [0, 0.0003, 0.0002, 0], 3), 40, PAD);
  });
}
/** a key's arm from its hinge tube (`from`) round the part to the cup's side, broadening into it */
function arm(mb: MeshBuilder, p: Part, Cf: Mat4, r: number, from: Vec3, viaH = 3.4): void {
  const top = cupTop(r);
  const o: Vec3 = [Cf[12], Cf[13], Cf[14]];
  const ex: Vec3 = [Cf[0], Cf[1], Cf[2]];
  const ez: Vec3 = [Cf[8], Cf[9], Cf[10]];
  const d = sub(from, o);
  let a = dot(d, ex);
  let c = dot(d, ez);
  const l = Math.hypot(a, c) || 1;
  a /= l;
  c /= l;
  const dir = add(scale(ex, a), scale(ez, c));
  const ey: Vec3 = [Cf[4], Cf[5], Cf[6]];
  const near = add(add(o, scale(dir, r + 0.0032)), scale(ey, top * 0.45));
  const rim = add(add(o, scale(dir, r - 0.0004)), scale(ey, top - 0.0006));
  const inside = add(add(o, scale(dir, r * 0.3)), scale(ey, top - 0.0008));
  const [fy, ft] = placeOf(p, from);
  const [ny, nt] = placeOf(p, near);
  const mid = S(p, lerp(fy, ny, 0.5), lerp(ft, nt, 0.5), viaH);
  const path = spline3([from, mid, near, rim, inside], 6);
  sweep(mb, path, OUTof(p), (f) => (f < 0.42 ? 0.00155 : 0.00155 + (0.62 * r - 0.00155) * Math.sin((Math.PI / 2) * Math.min(1, (f - 0.42) / 0.4)) ** 2), () => 0.0008, AG, 14, 3.2);
}
/** a hinge tube on a rod line from y0 to y1, its ends rounded */
function hinge(mb: MeshBuilder, r: Rod, y0: number, y1: number, rr = 0.0019): void {
  const a = rodP(r, y0);
  const c = rodP(r, y1);
  const L = len3(sub(c, a));
  mb.with(frameY(a, sub(c, a)), () => revolve(mb, fillet([[0, 0], [rr, 0], [rr, L], [0, L]] as P2[], [0, 0.0005, 0.0005, 0], 3), 18, AG));
}
/** a post: a turned pillar on its flange, a ball round the rod */
function post(mb: MeshBuilder, r: Rod, y: number): void {
  const base = S(r.p, y, r.th, -0.3);
  const top = rodP(r, y);
  const L = len3(sub(top, base));
  mb.with(frameY(base, sub(top, base)), () => revolve(mb, fillet([[0, 0], [0.0036, 0], [0.0036, 0.0005], [0.0022, 0.0013], [0.0017, L - 0.002], [0.0022, L - 0.0011]] as P2[], [0, 0, 0.0004, 0.0007, 0.0006, 0], 3), 20, AG));
  ellipsoid(mb, top, [0.0027, 0.0027, 0.0027], 18, AG);
}
/** the steel pivot of a rod line, seen between its hinge tubes, its screw's head at the top */
function steel(mb: MeshBuilder, r: Rod): void {
  const a = rodP(r, r.y0);
  const c = rodP(r, r.y1);
  cyl(mb, a, c, 0.0008, 0.0008, 12, STEEL, false);
  const d = norm(sub(c, a));
  mb.with(frameY(c, d), () => revolve(mb, fillet([[0, 0.0024], [0.0014, 0.0024], [0.0014, 0.0034], [0, 0.0034]] as P2[], [0, 0.0003, 0.0003, 0], 2), 16, AG));
}
/** a needle spring: from a post, along beside the rod, into a key's catch */
function needle(mb: MeshBuilder, r: Rod, yPost: number, yCatch: number): void {
  const off = (y: number): Vec3 => {
    const R = radius(r.p, y, r.th) + r.h;
    return S(r.p, y, r.th + ((2.3 / R) * 180) / Math.PI, r.h - 0.6);
  };
  const p0 = off(yPost);
  const p1 = off(yCatch);
  sweep(mb, [p0, p1], (_q, t) => (Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]), () => 0.0003, () => 0.0003, STEEL, 8, 2);
  cyl(mb, rodP(r, yCatch), p1, 0.0006, 0.0005, 10, AG);
}
/** a touch: a pear-shaped spatula swept along `path` (its narrow end first), `w` its half-width */
function spoon(mb: MeshBuilder, path: Vec3[], w: number, up: (p: Vec3) => Vec3): void {
  let L = 0;
  for (let i = 1; i < path.length; i++) L += len3(sub(path[i], path[i - 1]));
  const c = Math.max(0.35, Math.min(0.85, 1 - w / Math.max(1e-6, L)));
  const width = (f: number) => (f <= c ? w * (0.26 + 0.74 * Math.sin((Math.PI / 2) * (f / c)) ** 0.8) : w * Math.sqrt(Math.max(0.0004, 1 - ((f - c) / (1 - c)) ** 2)));
  // (a lens in section: domed, so it catches the studio's lights wherever it is turned)
  sweep(mb, path, up, width, (f) => 0.00115 * (f <= c ? 0.75 + 0.25 * (f / c) : Math.sqrt(Math.max(0.05, 1 - ((f - c) / (1 - c)) ** 2))), AG, 24, 2.15);
}
/** a lever's stem: a bar along a path */
const stem = (mb: MeshBuilder, p: Part, path: Vec3[], w = 0.0012, h = 0.00075) => sweep(mb, path, OUTof(p), () => w, () => h, AG, 12, 2.6);
/** a touch: a stem from the hinge through `via` to a spatula along `sp` */
function touch(mb: MeshBuilder, p: Part, from: Vec3, via: Vec3[], sp: Vec3[], w: number): void {
  stem(mb, p, spline3([from, ...via, sp[0]], 6), 0.0013, 0.0008);
  spoon(mb, spline3(sp, 6), w, OUTof(p));
}
/** a roller: a turned cylinder of hard rubber between two of the little fingers' touches */
function roller(mb: MeshBuilder, a: Vec3, b: Vec3, r = 0.0021): void {
  const L = len3(sub(b, a));
  mb.with(frameY(a, sub(b, a)), () => revolve(mb, fillet([[0, 0], [r * 0.75, 0], [r, 0.0006], [r, L - 0.0006], [r * 0.75, L], [0, L]] as P2[], [0, 0.0003, 0.0005, 0.0005, 0.0003, 0], 3), 22, ROLLER));
  for (const e of [a, b]) cyl(mb, e, add(e, scale(norm(sub(b, a)), e === a ? -0.0012 : 0.0012)), 0.0007, 0.0007, 10, AG);
}
/** a tone hole: its dark well, a silver lining's lip (the finger holes'), the countersink round it */
function toneHole(mb: MeshBuilder, p: Part, y: number, th: number, hole: number, sink: number, lining = 0): void {
  grid(mb, 3, 40, (u, v) => wrapped(p, y, th, hole * u, v * TAU, 0.03), DARK, { wrapV: true });
  if (lining) {
    grid(mb, 3, 40, (u, v) => wrapped(p, y, th, hole + lining * u, v * TAU, 0.1 + 0.25 * Math.sin(Math.PI * u)), AG, { wrapV: true });
    grid(mb, 2, 40, (u, v) => wrapped(p, y, th, hole + lining + sink * u, v * TAU, 0.03 - 0.02 * u), SINK, { wrapV: true });
  } else grid(mb, 2, 40, (u, v) => wrapped(p, y, th, hole + sink * u, v * TAU, 0.03 - 0.02 * u), SINK, { wrapV: true });
}
/** a ring key's ring: a band of silver round a finger hole, `lift` mm off the wood (r outside, w wide, m) */
function ringBand(mb: MeshBuilder, p: Part, y: number, th: number, r: number, w: number, lift: number): void {
  const N = 48;
  const path = Array.from({ length: N + 1 }, (_, i) => wrapped(p, y, th, r - w / 2, (i / N) * TAU, lift));
  sweep(mb, path, OUTof(p), () => w / 2, () => 0.00055, AG, 12, 2.6);
}

// ================================================================ the keys
interface KeyDef {
  name: string;
  /** a cup (`open`: whether it stands open for these fingers), a touch or a ring (`open`: pressed) */
  kind: 'cup' | 'touch' | 'ring';
  rod: Rod;
  /** its hinge tube's span (mm) */
  hb: [number, number];
  /** the cup or ring: where (on the rod's part unless `on` says), its outer radius and the hole's (m) */
  y?: number;
  th?: number;
  on?: Part;
  r?: number;
  hole?: number;
  closed?: boolean;
  open: (f: number) => boolean;
  /** how far it travels at its cup or touch (mm) */
  lift?: number;
  /** the rest of the piece (a touch, a stem, rollers) */
  extra?: (mb: MeshBuilder) => void;
  /** the point that travels, if not the cup's or ring's centre (a touch's) */
  at?: () => Vec3;
  /** its arm drawn by `extra` */
  noArm?: boolean;
}
const never = () => false;
const has = (bits: number) => (f: number) => !!(f & bits);
const not = (bits: number) => (f: number) => !(f & bits);

// ---------------------------------------------------------------- rod lines
// the wing joint: the whisper key's long rod up its back (away from the long joint), the C♯ key's and
// the flick keys' on its back, the E♭/E keys' beside the wing's front, the L3 ring's beside it
const RW_WH: Rod = { p: 'wing', th: 262, h: 4.2, y0: 596, y1: 893, posts: [597, 748, 892] };
const RW_CS: Rod = { p: 'wing', th: 194, h: 3.8, y0: 636, y1: 758, posts: [637, 757] };
const RW_FL: Rod = { p: 'wing', th: 204, h: 3.8, y0: 776, y1: 862, posts: [777, 861] };
const RW_E: Rod = { p: 'wing', th: -34, h: 3.4, y0: 603, y1: 717, posts: [604, 652, 716] };
const RW_L3: Rod = { p: 'wing', th: 14, h: 3.0, y0: 546, y1: 577, posts: [547, 576] };
// the long joint: the left thumb's four long keys up its back, the left little finger's E♭ and C♯ keys'
// on its front and outside; the bell's B♭ key's
const RL_D: Rod = { p: 'long', th: 160, h: 4.4, y0: 640, y1: 757, posts: [641, 701, 756] };
const RL_C: Rod = { p: 'long', th: 172, h: 4.4, y0: 640, y1: 862, posts: [641, 701, 780, 861] };
const RL_B: Rod = { p: 'long', th: 184, h: 4.4, y0: 640, y1: 968, posts: [641, 701, 840, 967] };
const RL_BB: Rod = { p: 'long', th: 196, h: 4.4, y0: 640, y1: 992, posts: [641, 701, 850, 991] };
const RB_BB: Rod = { p: 'bell', th: 196, h: 4.4, y0: 1042, y1: 1128, posts: [1043, 1127] };
const RL_CS: Rod = { p: 'long', th: 74, h: 4.0, y0: 524, y1: 778, posts: [525, 642, 777] };
const RL_EB: Rod = { p: 'long', th: 34, h: 4.0, y0: 466, y1: 572, posts: [467, 571] };
// the boot's front: the trill key's, the R2 ring's and the B♭ sliver's line; the G key's; the little
// finger's F, F♯ and A♭ keys'
const RB_TR: Rod = { p: 'boot', th: 38, h: 3.4, y0: 275, y1: 378, posts: [276, 313, 377] };
const RB_G: Rod = { p: 'boot', th: -58, h: 3.6, y0: 251, y1: 288, posts: [252, 287] };
const RB_F: Rod = { p: 'boot', th: -42, h: 4.6, y0: 134, y1: 252, posts: [135, 200, 251] };
const RB_FS: Rod = { p: 'boot', th: 54, h: 3.8, y0: 197, y1: 263, posts: [198, 262] };
const RB_GS: Rod = { p: 'boot', th: 70, h: 3.8, y0: 69, y1: 247, posts: [70, 165, 246] };
// the boot's back: the right thumb's E plate, B♭ key and F♯ and A♭ touches
const RB_E: Rod = { p: 'boot', th: 192, h: 4.2, y0: 293, y1: 335, posts: [294, 334] };
const RB_BBT: Rod = { p: 'boot', th: 204, h: 3.8, y0: 338, y1: 377, posts: [339, 376] };
const RB_TH: Rod = { p: 'boot', th: 206, h: 3.8, y0: 251, y1: 292, posts: [252, 291] };
const RODS = [RW_WH, RW_CS, RW_FL, RW_E, RW_L3, RL_D, RL_C, RL_B, RL_BB, RB_BB, RL_CS, RL_EB, RB_TR, RB_G, RB_F, RB_FS, RB_GS, RB_E, RB_BBT, RB_TH];
/** the needle springs: [rod, its post, the key's catch] (mm) */
const NEEDLES: [Rod, number, number][] = [
  [RW_WH, 748, 700],
  [RL_C, 780, 820],
  [RL_B, 840, 900],
  [RL_BB, 850, 930],
  [RL_CS, 642, 700],
  [RB_F, 200, 170],
  [RB_GS, 165, 100],
  [RW_E, 652, 700],
];

// the finger holes the fingers close (no key): L1 (small: the half-hole), L2 on the wing's front, R1 on
// the boot's (the photograph's places: the wing's three holes in a line 26 mm across from its axis)
const TH_WH = 44;
const PLAIN = [
  { name: 'L1', p: 'wing' as Part, y: 640, th: TH_WH - 1, hole: 0.0023, lining: 0.0012, bit: L1 | HALF },
  { name: 'L2', p: 'wing' as Part, y: 598, th: TH_WH, hole: 0.0032, lining: 0.0013, bit: L2 },
  { name: 'R1', p: 'boot' as Part, y: 348, th: 12, hole: 0.0021, lining: 0.0011, bit: R1 },
];

/** a point on a part (helper for the touches' paths) */
const at = (p: Part, y: number, th: number, h: number) => () => S(p, y, th, h);

/** the keys that move */
const KEYS: KeyDef[] = [
  // ---- the left thumb: the whisper key (its pad on the bocal's nipple), its touch low on the wing's back
  {
    name: 'W', kind: 'cup', rod: RW_WH, hb: [599, 890], noArm: true, closed: false, open: not(W), lift: 2.0,
    at: () => add(pipAt(), V(-7.05 * MIR, 0, 0)),
    extra: (mb) => {
      // up from the hinge's top beside the cap, round to the nipple: the pad faces it
      const padC = add(pipAt(), V(-7.05 * MIR, 0, 0));
      const top = rodP(RW_WH, 888);
      const y = padC[1] / mm;
      stem(mb, 'wing', spline3([top, V(XW - 16.5 * MIR, 901, -9.5), V(XW - 14 * MIR, y - 12, -6.5), V(XW - 11.5 * MIR, y - 3, -2.2), add(padC, V(-2.6 * MIR, 0, 0))], 7), 0.0013, 0.0009);
      cup(mb, frameY(padC, [-MIR, 0, 0]), 0.0036);
      touch(mb, 'wing', rodP(RW_WH, 602), [S('wing', 602, 214, 5.2)], [S('wing', 606, 196, 5.4), S('wing', 612, 184, 5.6), S('wing', 619, 176, 5.4)], 0.0058);
    },
  },
  // the C♯ key: its vent high on the wing's back, its touch above the whisper key's
  { name: 'pCsT', kind: 'cup', rod: RW_CS, hb: [700, 755], y: 744, th: 166, r: 0.0046, hole: 0.0022, closed: true, open: has(TCS), lift: 2.2 },
  { name: 'tCsT', kind: 'touch', rod: RW_CS, hb: [639, 690], open: has(TCS), lift: 2.4, at: at('wing', 652, 168, 5), extra: (mb) => touch(mb, 'wing', rodP(RW_CS, 645), [S('wing', 646, 182, 4.6)], [S('wing', 648, 172, 4.9), S('wing', 653, 164, 5.0), S('wing', 658, 158, 4.8)], 0.0045) },
  // the flick keys (A, C, D): small vents high on the wing's back, their long levers down to the
  // thumb, its touches stepping up beside the long joint
  ...([['FA', FA, 782, 798, 790, 228, 700, 0], ['FB', FB, 806, 826, 816, 234, 716, 1], ['FD', FD, 834, 858, 846, 240, 732, 2]] as const).map(([name, bit, h0, h1, y, th, yt, k]): KeyDef => ({
    name, kind: 'cup', rod: RW_FL, hb: [h0, h1], y, th, r: 0.0036, hole: 0.0014, closed: true, open: has(bit), lift: 1.8,
    extra: (mb) => {
      const from = rodP(RW_FL, h0 + 2);
      // (over the C♯ key's hinge tube)
      touch(mb, 'wing', from, [S('wing', lerp(h0, yt, 0.3), 200 - 2 * k, 7.0), S('wing', lerp(h0, yt, 0.75), 194 - 4 * k, 7.8)], [S('wing', yt + 6, 184 - 6 * k, 8.0), S('wing', yt + 2, 174 - 6 * k, 8.2), S('wing', yt - 1, 166 - 6 * k, 8.0)], 0.0033);
    },
  })),
  // the left thumb's long keys: touches at the long joint's foot (B♭, B, C side by side, D's long pear
  // below them), their pads up the joint's back (D, C, B) and on the bell (B♭), each closed by its own
  // touch and the touches below it
  { name: 'tLD', kind: 'touch', rod: RL_D, hb: [643, 699], open: has(LD), lift: 2.6, at: at('long', 632, 214, 6), extra: (mb) => touch(mb, 'long', rodP(RL_D, 646), [S('long', 640, 186, 5.5)], [S('long', 652, 216, 6.0), S('long', 640, 218, 6.4), S('long', 624, 218, 6.4), S('long', 606, 216, 6.2)], 0.0058) },
  { name: 'tLC', kind: 'touch', rod: RL_C, hb: [643, 699], open: has(LC), lift: 2.6, at: at('long', 680, 238, 6), extra: (mb) => touch(mb, 'long', rodP(RL_C, 662), [S('long', 660, 214, 5.0)], [S('long', 662, 237, 5.8), S('long', 674, 239, 6.2), S('long', 692, 239, 6.2)], 0.0041) },
  { name: 'tLB', kind: 'touch', rod: RL_B, hb: [643, 699], open: has(LB), lift: 2.6, at: at('long', 685, 222, 6), extra: (mb) => touch(mb, 'long', rodP(RL_B, 668), [S('long', 666, 204, 5.0)], [S('long', 668, 221, 5.8), S('long', 680, 222, 6.2), S('long', 698, 222, 6.2)], 0.0041) },
  { name: 'tLBB', kind: 'touch', rod: RL_BB, hb: [643, 699], open: has(LBB), lift: 2.6, at: at('long', 692, 205, 6), extra: (mb) => touch(mb, 'long', rodP(RL_BB, 674), [S('long', 672, 199, 5.0)], [S('long', 676, 204, 5.8), S('long', 688, 205, 6.2), S('long', 706, 205, 6.2)], 0.0041) },
  { name: 'pD', kind: 'cup', rod: RL_D, hb: [703, 754], y: 742, th: 140, r: 0.0088, hole: 0.0048, open: not(LD | LC | LB | LBB), lift: 3.2 },
  { name: 'pC', kind: 'cup', rod: RL_C, hb: [703, 859], y: 848, th: 140, r: 0.0092, hole: 0.005, open: not(LC | LB | LBB), lift: 3.4 },
  { name: 'pB', kind: 'cup', rod: RL_B, hb: [703, 965], y: 954, th: 141, r: 0.0096, hole: 0.0052, open: not(LB | LBB), lift: 3.4 },
  {
    name: 'lBB', kind: 'touch', rod: RL_BB, hb: [703, 989], open: has(LBB), lift: 0.8, at: () => rodP(RL_BB, 989),
    // (the B♭ key's long tube, and its lug up over the ring to the bell's key)
    extra: (mb) => stem(mb, 'long', spline3([rodP(RL_BB, 986), S('long', 996, 196, 5.4), S('long', 1012, 196, 6.6), S('long', 1028, 196, 6.4)], 5), 0.0013, 0.0008),
  },
  {
    name: 'pBb', kind: 'cup', rod: RB_BB, hb: [1045, 1125], on: 'bell', y: 1112, th: 168, r: 0.0094, hole: 0.0052, open: not(LBB), lift: 3.4,
    extra: (mb) => stem(mb, 'bell', spline3([rodP(RB_BB, 1046), S('bell', 1040, 196, 6.2), S('bell', 1033.5, 196, 6.9)], 4), 0.0013, 0.0008),
  },
  // ---- the left hand: the E♭ key's touch between L1 and L2 (its vent above the wing), the high E
  // touch above L1 (still), the L3 ring
  {
    name: 'tEb', kind: 'touch', rod: RW_E, hb: [606, 630], open: has(SEB), lift: 2.2, at: at('wing', 619, 30, 4.2),
    extra: (mb) => touch(mb, 'wing', rodP(RW_E, 618), [S('wing', 620, -16, 4.2)], [S('wing', 620, 6, 4.2), S('wing', 619, 20, 4.4), S('wing', 619, 32, 4.4)], 0.0034),
  },
  { name: 'pEb', kind: 'cup', rod: RW_E, hb: [688, 714], y: 708, th: -6, r: 0.0042, hole: 0.0018, closed: true, open: has(SEB), lift: 2.0 },
  {
    name: 'L3', kind: 'ring', rod: RW_L3, hb: [549, 574], y: 560, th: TH_WH + 1, r: 0.0058, hole: 0.0031, open: has(L3), lift: 1.4,
  },
  // the left little finger: the E♭ (resonance) and C♯ touches at the wing's foot, their pads on the
  // long joint's front and outside
  {
    name: 'tLEb', kind: 'touch', rod: RL_EB, hb: [532, 569], open: has(LEB), lift: 2.4, at: at('long', 548, -16, 7.6),
    extra: (mb) => {
      touch(mb, 'long', rodP(RL_EB, 552), [S('long', 552, 14, 6.4)], [S('long', 552, -4, 7.2), S('long', 549, -16, 7.6), S('long', 545, -28, 7.4)], 0.0052);
      // (its roller along the plate's outer edge, towards the C♯ touch below)
      roller(mb, S('long', 549, -31, 8.9), S('long', 537, -31, 8.9), 0.0018);
    },
  },
  { name: 'pLEb', kind: 'cup', rod: RL_EB, hb: [469, 528], y: 484, th: 56, r: 0.0068, hole: 0.0034, closed: true, open: has(LEB), lift: 2.6 },
  {
    name: 'tLCs', kind: 'touch', rod: RL_CS, hb: [527, 560], open: has(LCS), lift: 2.4, at: at('long', 528, -14, 8.2),
    extra: (mb) => touch(mb, 'long', rodP(RL_CS, 532), [S('long', 532, 50, 6.4), S('long', 531, 20, 7.4)], [S('long', 530, 0, 7.8), S('long', 528, -14, 8.2), S('long', 525, -28, 8.0)], 0.005),
  },
  { name: 'pLCs', kind: 'cup', rod: RL_CS, hb: [563, 775], y: 766, th: 94, r: 0.0072, hole: 0.0036, closed: true, open: has(LCS), lift: 2.8 },
  // ---- the right hand: the A hole's ring (R2); the G key's touch (R3) on the front and its pad on the
  // boot's side; the little finger's F (rollers), F♯ and A♭ keys, their pads down the front
  { name: 'R2', kind: 'ring', rod: RB_TR, hb: [292, 311], y: 301, th: 13, r: 0.0060, hole: 0.0024, open: has(R2), lift: 1.5 },
  {
    name: 'tG', kind: 'touch', rod: RB_G, hb: [254, 268], open: has(R3), lift: 2.4, at: at('boot', 268, 6, 4.6),
    extra: (mb) => touch(mb, 'boot', rodP(RB_G, 262), [S('boot', 264, -36, 4.4)], [S('boot', 266, -18, 4.6), S('boot', 268, -2, 4.8), S('boot', 268, 12, 4.8)], 0.0046),
  },
  { name: 'pG', kind: 'cup', rod: RB_G, hb: [271, 285], y: 274, th: -100, r: 0.0072, hole: 0.0036, open: not(R3), lift: 2.8 },
  {
    name: 'tF', kind: 'touch', rod: RB_F, hb: [204, 249], open: has(PF), lift: 2.6, at: at('boot', 244, -20, 6),
    extra: (mb) => {
      touch(mb, 'boot', rodP(RB_F, 240), [S('boot', 242, -34, 5.4)], [S('boot', 250, -10, 6.2), S('boot', 246, -20, 6.6), S('boot', 237, -30, 6.4)], 0.0086);
      roller(mb, S('boot', 255, -4, 9.4), S('boot', 255, -24, 9.4), 0.0026);
      roller(mb, S('boot', 230, -12, 9.0), S('boot', 230, -34, 9.0), 0.0026);
    },
  },
  { name: 'pF', kind: 'cup', rod: RB_F, hb: [137, 196], y: 141, th: 8, r: 0.0118, hole: 0.0064, open: not(PF), lift: 3.6 },
  {
    name: 'tFsP', kind: 'touch', rod: RB_FS, hb: [233, 260], open: has(PFS), lift: 2.4, at: at('boot', 253, 24, 5.4),
    extra: (mb) => touch(mb, 'boot', rodP(RB_FS, 255), [S('boot', 256, 44, 5.0)], [S('boot', 254, 34, 5.4), S('boot', 253, 24, 5.6), S('boot', 252, 14, 5.4)], 0.004),
  },
  { name: 'pFs', kind: 'cup', rod: RB_FS, hb: [200, 229], y: 210, th: 34, r: 0.0058, hole: 0.0028, closed: true, open: has(PFS | RFS), lift: 2.4 },
  {
    name: 'tGsP', kind: 'touch', rod: RB_GS, hb: [212, 244], open: has(PGS), lift: 2.4, at: at('boot', 237, 16, 5.4),
    extra: (mb) => touch(mb, 'boot', rodP(RB_GS, 236), [S('boot', 236, 56, 5.0)], [S('boot', 236, 38, 5.4), S('boot', 237, 26, 5.6), S('boot', 238, 14, 5.4)], 0.004),
  },
  { name: 'pGs', kind: 'cup', rod: RB_GS, hb: [72, 122], y: 84, th: 32, r: 0.0078, hole: 0.0038, closed: true, open: has(PGS | RGS), lift: 2.8 },
  // ---- the right thumb: the E plate (its own cup, pressed shut), the B♭ key above it (its vent on the
  // small bore's back), the F♯ and A♭ touches below it
  { name: 'E', kind: 'cup', rod: RB_E, hb: [296, 332], y: 314, th: 150, r: 0.0134, hole: 0.0072, open: not(RE), lift: 3.4 },
  {
    name: 'Bb', kind: 'cup', rod: RB_BBT, hb: [341, 374], y: 352, th: 226, r: 0.0052, hole: 0.0024, closed: true, open: has(RBB), lift: 2.2,
    extra: (mb) => {
      touch(mb, 'boot', rodP(RB_BBT, 370), [S('boot', 371, 192, 5.0)], [S('boot', 369, 178, 5.8), S('boot', 366, 166, 6.4), S('boot', 360, 156, 6.6), S('boot', 352, 151, 6.4)], 0.0056);
      roller(mb, S('boot', 374, 184, 8.6), S('boot', 372, 162, 9.4), 0.0024);
    },
  },
  { name: 'tFsR', kind: 'touch', rod: RB_TH, hb: [274, 290], open: has(RFS), lift: 2.4, at: at('boot', 282, 166, 5.6), extra: (mb) => touch(mb, 'boot', rodP(RB_TH, 282), [S('boot', 282, 190, 5.2)], [S('boot', 282, 178, 5.6), S('boot', 282, 168, 5.8), S('boot', 281, 158, 5.6)], 0.0042) },
  { name: 'tGsR', kind: 'touch', rod: RB_TH, hb: [254, 270], open: has(RGS), lift: 2.4, at: at('boot', 262, 168, 5.6), extra: (mb) => touch(mb, 'boot', rodP(RB_TH, 262), [S('boot', 262, 192, 5.2)], [S('boot', 262, 180, 5.6), S('boot', 261, 170, 5.8), S('boot', 260, 160, 5.6)], 0.0042) },
];

/** the keys that never move here: the high E touch, the C♯ trill key and its hook, the B♭ sliver */
const FIXED: KeyDef[] = [
  { name: 'tE', kind: 'touch', rod: RW_E, hb: [655, 680], open: never, extra: (mb) => touch(mb, 'wing', rodP(RW_E, 668), [S('wing', 671, -14, 4.2)], [S('wing', 672, 8, 4.4), S('wing', 671, 22, 4.6), S('wing', 667, 32, 4.6), S('wing', 661, 34, 4.4)], 0.0032) },
  {
    name: 'trill', kind: 'cup', rod: RB_TR, hb: [316, 375], y: 324, th: 22, r: 0.0046, hole: 0.002, closed: true, open: never,
    extra: (mb) => touch(mb, 'boot', rodP(RB_TR, 371), [S('boot', 372, 26, 5.0)], [S('boot', 373, 10, 5.4), S('boot', 371, 0, 5.6), S('boot', 366, -2, 5.4)], 0.0032),
  },
  { name: 'sliver', kind: 'touch', rod: RB_TR, hb: [278, 289], open: never, extra: (mb) => touch(mb, 'boot', rodP(RB_TR, 284), [S('boot', 284, 30, 4.2)], [S('boot', 284, 20, 4.4), S('boot', 284, 12, 4.4), S('boot', 285, 4, 4.2)], 0.0022) },
];
const ALL = [...KEYS, ...FIXED];

/** the E plate's guard: a rail arched round its outer side, on two posts, that keeps the right thumb's
 *  hand off it */
function eGuard(mb: MeshBuilder): void {
  const N = 28;
  const rr = 0.0134 + 0.0042;
  const path = Array.from({ length: N + 1 }, (_, i) => wrapped('boot', 314, 150, rr, lerp(-0.62 * Math.PI, 0.62 * Math.PI, i / N) + Math.PI / 2, 6.2));
  sweep(mb, path, OUTof('boot'), () => 0.0011, () => 0.0011, AG, 12, 2);
  for (const e of [path[0], path[N]]) {
    const [y, th] = placeOf('boot', e);
    const base = S('boot', y, th, -0.3);
    const L = len3(sub(e, base));
    mb.with(frameY(base, sub(e, base)), () => revolve(mb, fillet([[0, 0], [0.0032, 0], [0.0032, 0.0005], [0.0019, 0.0012], [0.0014, L], [0, L]] as P2[], [0, 0, 0.0004, 0.0006, 0, 0], 3), 18, AG));
  }
}

/** the hand rest: a bracket on the boot's player side, a rod, the turned comma of wood the right hand's
 *  crook rests on */
function handRest(mb: MeshBuilder): void {
  const Cf = frameAt('boot', 356, -90, 0);
  mb.with(Cf, () => {
    revolve(mb, fillet([[0, 0.0016], [0.0068, 0.0014], [0.0072, 0.0004], [0.0068, -0.0004], [0, -0.0004]] as P2[], [0, 0.003, 0.0005, 0.0003, 0], 4), 36, AG);
    revolve(mb, fillet([[0, 0.0016], [0.0032, 0.0016], [0.0032, 0.0112], [0.0026, 0.0118], [0, 0.0118]] as P2[], [0, 0, 0.0004, 0.0002, 0], 3), 24, AG);
  });
  // the knurled nut that holds it, and the paddle
  const o = xform(Cf, [0, 0.0118, 0]);
  const out = norm([Cf[4], Cf[5], Cf[6]]);
  const c = add(o, scale(out, 0.004));
  ellipsoid(mb, c, [0.004, 0.0042, 0.004], 20, AG);
  const P = (dy: number, dx: number, dz: number): Vec3 => add(add(c, scale(out, dx * mm)), [0, dy * mm, dz * mm]);
  const path = spline3([P(-46, 14, 2), P(-34, 13, 1), P(-18, 9.5, 0), P(-2, 7.5, -0.5), P(14, 8.2, -0.6), P(26, 11, 0), P(32, 14.5, 0.5)], 7);
  sweep(mb, path, () => [0, 0, 1], (f) => (f < 0.12 ? lerp(0.0032, 0.0058, f / 0.12) : f < 0.8 ? lerp(0.0058, 0.0118, (f - 0.12) / 0.68) ** 1 : 0.0118 * Math.sqrt(Math.max(0.03, 1 - ((f - 0.8) / 0.2) ** 2))), (f) => 0.0052 * (f > 0.8 ? Math.sqrt(Math.max(0.15, 1 - ((f - 0.8) / 0.2) ** 2)) : 1), REST, 26, 2.2);
}

// ================================================================ the model
export interface BassoonKey {
  name: string;
  kind: 'cup' | 'touch' | 'ring';
  closed: boolean;
  open: (f: number) => boolean;
  mesh: Mesh;
  /** how far down the bore its hole is from the reed's tip (m), for the glow (-1: none) */
  s: number;
  p0: Vec3;
  u: Vec3;
  sign: number;
  maxAng: number;
}
export interface BassoonModel {
  /** standing nearly upright (a tall stage, the Orchestra's seat leans it itself) */
  T: Mat4;
  /** leaned across as a player holds it (a wide stage) */
  Tw: Mat4;
  statics: Mesh[];
  /** the bell: its wood, its bead ring and its throat (it shimmers with the level) */
  bell: Mesh;
  keys: BassoonKey[];
  /** the reed's two blades (each turns at the first wire towards the other) */
  blades: { mesh: Mesh; s: 1 | -1 }[];
  /** the reed's frame in the model (x along it from its butt, z through the blades) */
  reedF: Mat4;
  /** the finger holes with no key: drawn when the finger closes them, to glow */
  plain: { mesh: Mesh; s: number; bit: number; half: number }[];
  bounds: { c: Vec3; r: number };
  boundsW: { c: Vec3; r: number };
  /** the tone holes the keys and fingers cover: name, height (mm) and place along the bore (m) */
  holes: { name: string; y: number; s: number }[];
}

// the bore folded in the instrument (mm from the reed's tip): down the bocal and the wing and the boot's
// small bore to the U-tube, across it, up the large bore, the long joint and the bell
/** the bore at the wing's top (the reed beyond the bocal's end, and the bocal along its curve) */
let S_TOP = 0;
const U_Y = 22;
/** the U-tube's length (across between the bores, and round) */
const U_LEN = 64;
const boreS = (p: Part, y: number, th: number): number => {
  const down = p === 'wing' || (p === 'boot' && Math.sin(th * DEG) < 0.35);
  if (down) return S_TOP + (WING_TOP - y);
  return S_TOP + (WING_TOP - U_Y) + U_LEN + (y - U_Y);
};

/** a key's piece, built at rest (a cup on its hole, a touch at rest, a ring up off its hole) */
function keyPiece(mb: MeshBuilder, k: KeyDef): void {
  hinge(mb, k.rod, k.hb[0], k.hb[1]);
  const p = k.on ?? k.rod.p;
  if (k.y !== undefined && k.kind === 'cup') {
    const Cf = frameAt(p, k.y, k.th!, 0.15);
    cup(mb, Cf, k.r!);
    const yArm = Math.max(k.hb[0] + 2, Math.min(k.hb[1] - 2, k.y));
    if (!k.noArm) arm(mb, p, Cf, k.r!, rodP(k.rod, yArm));
  } else if (k.y !== undefined && k.kind === 'ring') {
    ringBand(mb, p, k.y, k.th!, k.r!, RING_W, RING_LIFT);
    const yArm = Math.max(k.hb[0] + 2, Math.min(k.hb[1] - 2, k.y));
    const from = rodP(k.rod, yArm);
    const [, fth] = placeOf(p, from);
    const sg = Math.sign(fth - k.th!) || 1;
    const edge = wrapped(p, k.y, k.th!, k.r! - RING_W * 0.3, (sg * Math.PI) / 2, RING_LIFT + 0.2);
    const [ey, eth] = placeOf(p, edge);
    const mid = S(p, lerp(placeOf(p, from)[0], ey, 0.5), lerp(fth, eth, 0.5), RING_LIFT + 1.8);
    sweep(mb, spline3([from, mid, edge], 7), OUTof(p), (f) => 0.00115 + 0.0004 * f, () => 0.00056, AG, 12, 3);
  }
  k.extra?.(mb);
}
const RING_W = 0.0014;
const RING_LIFT = 1.5;

/** where the model stands on its own: on a tall stage (a phone held upright) nearly upright, on a wide
 *  one leaned across as a player holds it, the bell up and away, the boot low (scenes3d frames it);
 *  tilt in degrees from upright, swing the turn about the vertical, y the boot's lift (m) */
export const BASSOON_POSE = { tall: { tilt: 7, face: 42, y: 0.06 }, wide: { tilt: 36, face: 42, y: 0.1 } };
/** the pose: turned about its own axis so that the side `face` degrees round from its fingers' side
 *  towards its long joint's outside looks at the audience (−z), then leaned in the picture's plane */
const poseT = (q: { tilt: number; face: number; y: number }): Mat4 => chain(translate(0, q.y, 0), rotZ(-q.tilt * DEG), rotY(Math.PI - MIR * q.face * DEG));

export function buildBassoonModel(): BassoonModel {
  // the bore's length to the wing's top: the reed beyond the bocal, and the bocal's curve
  let Lb = 0;
  for (let i = 1; i < bocalPts.length; i++) Lb += len3(sub(bocalPts[i], bocalPts[i - 1]));
  S_TOP = REED_L - REED_ON + (Lb / mm - 22);
  const mb = new MeshBuilder();
  body(mb);
  bocal(mb);
  const reedF = reedFrame();
  mb.with(reedF, () => reedTube(mb));
  for (const k of ALL) if (k.y !== undefined) toneHole(mb, k.on ?? k.rod.p, k.y, k.th!, k.hole!, k.kind === 'ring' ? 0.0006 : 0.0009, k.kind === 'ring' ? 0.0011 : 0);
  for (const h of PLAIN) toneHole(mb, h.p, h.y, h.th, h.hole, 0.001, h.lining);
  for (const r of RODS) {
    for (const y of r.posts) post(mb, r, y);
    steel(mb, r);
  }
  for (const [r, p, c] of NEEDLES) needle(mb, r, p, c);
  for (const k of FIXED) keyPiece(mb, k);
  handRest(mb);
  eGuard(mb);
  const keys: BassoonKey[] = KEYS.map((k) => {
    const kb = new MeshBuilder();
    keyPiece(kb, k);
    const p = k.on ?? k.rod.p;
    const p0 = rodP(k.rod, k.rod.y0);
    const u = norm(sub(rodP(k.rod, k.rod.y1), p0));
    const ref = k.at ? k.at() : k.kind === 'ring' ? S(p, k.y!, k.th!, RING_LIFT) : S(p, k.y!, k.th!, 0.15);
    // which way it turns: a cup opens away from its part, a touch or a ring is pressed towards it
    const q = xform(aboutAxis(new Float32Array(16), p0, u, 0.05), ref);
    const [ry] = placeOf(p, ref);
    const cx = (k.name === 'W' ? XW : cOf(p, ry)) * mm;
    const out = Math.hypot(q[0] - cx, q[2]) > Math.hypot(ref[0] - cx, ref[2]);
    const sign = (k.kind === 'cup') === out ? 1 : -1;
    const d = sub(ref, p0);
    const armL = len3(sub(d, scale(u, dot(d, u))));
    const travel = (k.lift ?? 2) * mm;
    const s = k.y !== undefined ? boreS(p, k.y, k.th!) * mm : -1;
    return { name: k.name, kind: k.kind, closed: !!k.closed, open: k.open, mesh: kb.build(), s, p0, u, sign, maxAng: travel / Math.max(0.002, armL) };
  });
  const blades = ([1, -1] as const).map((s) => ({ mesh: bladeIn(reedF, s), s }));
  const plain = PLAIN.map((h) => {
    const pb = new MeshBuilder();
    grid(pb, 3, 36, (u, v) => wrapped(h.p, h.y, h.th, h.hole * u, v * TAU, -0.25), DARK, { wrapV: true });
    return { mesh: pb.build(), s: boreS(h.p, h.y, h.th) * mm, bit: h.bit, half: h.bit & HALF };
  });
  const T = poseT(BASSOON_POSE.tall);
  const Tw = poseT(BASSOON_POSE.wide);
  const holes = [...ALL.filter((k) => k.y !== undefined).map((k) => ({ name: k.name, y: k.y!, s: boreS(k.on ?? k.rod.p, k.y!, k.th!) * mm })), ...PLAIN.map((h) => ({ name: h.name, y: h.y, s: boreS(h.p, h.y, h.th) * mm }))];
  return { T, Tw, statics: [mb.build()], bell: bellMesh(), keys, blades, reedF, plain, bounds: { c: xform(T, V(-30 * MIR, BASSOON_H / 2, 0)), r: 0.74 }, boundsW: { c: xform(Tw, V(-30 * MIR, BASSOON_H / 2, 0)), r: 0.74 }, holes };
}
/** a blade, built in the reed's frame */
function bladeIn(F: Mat4, s: 1 | -1): Mesh {
  const local = blade(s);
  const n = local.count;
  const d = local.data;
  const out = new Float32Array(d);
  for (let i = 0; i < n; i++) {
    const o = i * 14;
    const p = xform(F, [d[o], d[o + 1], d[o + 2]]);
    out[o] = p[0];
    out[o + 1] = p[1];
    out[o + 2] = p[2];
    const nx = F[0] * d[o + 3] + F[4] * d[o + 4] + F[8] * d[o + 5];
    const ny = F[1] * d[o + 3] + F[5] * d[o + 4] + F[9] * d[o + 5];
    const nz = F[2] * d[o + 3] + F[6] * d[o + 4] + F[10] * d[o + 5];
    out[o + 3] = nx;
    out[o + 4] = ny;
    out[o + 5] = nz;
  }
  return { ...local, data: out };
}

// ================================================================ posing
interface BassoonPose {
  pos: Float32Array;
  vel: Float32Array;
  /** seconds since the bassoon last sounded */
  quiet: number;
  /** the reed's opening, eased (1 at rest) */
  open: number;
  R: Float32Array;
  W: Float32Array;
  glow: RGBA;
}
/** each seat's own springs (the shared WindPose carries the flute's and the trumpet's) */
const poses = new WeakMap<WindPose, BassoonPose>();
function bassoonPose(pose: WindPose, bm: BassoonModel): BassoonPose {
  let p = poses.get(pose);
  if (!p || p.pos.length !== bm.keys.length) {
    const pos = Float32Array.from(bm.keys, (k) => (k.kind === 'cup' && k.open(0) ? 1 : 0));
    p = { pos, vel: new Float32Array(bm.keys.length), quiet: 10, open: 1, R: new Float32Array(16), W: new Float32Array(16), glow: [0, 0, 0, 0] };
    poses.set(pose, p);
  }
  return p;
}
/** tests: a bassoon's springs as posed (1 open / pressed) */
export const bassoonKeyState = (pose: WindPose): Float32Array | null => poses.get(pose)?.pos ?? null;
/** the reed's tip at rest: half its opening (mm), and where its blades turn (mm from its butt) */
export const REED_TIP = { halfOpen: BO(1), hingeX: XB0, length: REED_L };

export function poseBassoon(b: Batch, bm: BassoonModel, fr: VisualFrame | null, pose: WindPose, dt: number, now: number, rms: number, T: Mat4 = bm.T): void {
  const st = bassoonPose(pose, bm);
  for (const s of bm.statics) b.mesh(s, T);
  const br = fr?.breath;
  const blow = br ? br.pressure : 0;
  const vib = br ? br.vib : 0;
  const focus = fr?.focus ?? null;
  // the fingers for the note the engine plays, held while it sounds and for a moment after
  st.quiet = blow > 0.015 ? 0 : Math.min(9, st.quiet + dt);
  const midi = focus && st.quiet < 0.8 ? (focus.midi ?? null) : null;
  const fingers = midi === null ? 0 : bassoonFingersFor(midi);
  // the standing wave in the bore (reed → open end), for the closed keys' glow
  const shape = focus?.shapes?.[0] ?? null;
  const Lb = focus?.lengthM ?? 0;
  let peak = 0;
  if (shape) for (let i = 0; i < shape.length; i++) peak = Math.max(peak, Math.abs(shape[i]));
  const sounding = blow > 0.02 && !!shape && peak > 0 && Lb > 0;
  const glowAt = (s: number): number => {
    if (!sounding || s < 0 || s >= Lb) return 0;
    const j = Math.min(shape!.length - 1, Math.round((s / Lb) * (shape!.length - 1)));
    return (0.09 + 0.06 * vib) * Math.min(1, blow * 1.5) * (Math.abs(shape![j]) / peak);
  };
  const lvl = Math.min(1, Math.sqrt(rms) * 3);
  const setGlow = (a: number): RGBA | null => {
    if (a <= 0.003) return null;
    st.glow[0] = 1;
    st.glow[1] = 0.72;
    st.glow[2] = 0.45;
    st.glow[3] = a;
    return st.glow;
  };
  for (let i = 0; i < bm.keys.length; i++) {
    const k = bm.keys[i];
    const p = springTo(st.pos, st.vel, i, k.open(fingers) ? 1 : 0, dt, 24, 0.62);
    aboutAxis(st.R, k.p0, k.u, k.sign * k.maxAng * p);
    mulInto(st.W, 0, T, st.R);
    const closed = k.kind === 'cup' ? p < 0.5 : k.kind === 'ring' && p > 0.5;
    b.mesh(k.mesh, st.W, closed ? setGlow(glowAt(k.s)) : null);
  }
  // the finger holes under their fingers (L1 half covered for the half-hole)
  for (const h of bm.plain) if (fingers & h.bit) b.mesh(h.mesh, T, setGlow(glowAt(h.s) * (fingers & ~HALF & h.bit ? 1 : 0.5)));
  // the reed: its blades close with its opening (blown shut once a cycle when loud), and shimmer
  const want = fr?.reed ? Math.min(1.3, fr.reed.open) : 1;
  st.open += (want - st.open) * (1 - Math.exp(-dt / 0.05));
  const f1 = focus?.f1 ?? 0;
  const shim = blow > 0.02 ? 0.06 * lvl * Math.sin(now * 0.001 * Math.min(f1, 16) * TAU) : 0;
  const shut = Math.max(-0.25, Math.min(1, 1 - st.open + shim)) * BO(1) * mm;
  const F = bm.reedF;
  const hingeP = xform(F, [XB0 * mm, 0, 0]);
  const axis: Vec3 = [F[4], F[5], F[6]];
  for (const bl of bm.blades) {
    // a turn about the width at the first wire, the tip towards the other blade
    aboutAxis(st.R, hingeP, axis, (bl.s * shut) / ((REED_L - XB0) * mm));
    mulInto(st.W, 0, T, st.R);
    b.mesh(bl.mesh, st.W);
  }
  // the bell shimmers with the level
  if (lvl > 0.02) b.mesh(bm.bell, T, setGlow(0.07 * lvl * (0.75 + 0.25 * Math.sin(now * 0.021))));
  else b.mesh(bm.bell, T);
}

/** tests: the measures the model is built to (mm from the boot's foot) */
export const BASSOON_MEASURES = {
  height: BASSOON_H,
  boot: [0, BOOT_TOP] as const,
  bootCap: CAP1,
  wing: [BOOT_TOP, WING_TOP] as const,
  long: [BOOT_TOP, LJ_TOP] as const,
  bell: [BELL0, BASSOON_H] as const,
  /** diameters (mm): the long joint, the wing tube, the bell's swell and neck and rim, the boot's width */
  longD: 2 * longR(700),
  wingD: 2 * WR,
  bellSwellD: 2 * bellR(1192),
  bellNeckD: 2 * bellR(1280),
  rimD: 2 * 27.4,
  bootW: (y: number) => 2 * bootA(y),
  /** the bocal's rise over the cap and its reach to the reed (mm), its diameters at the cork and the tip */
  bocalRise: Math.max(...BOCAL_PATH.map((p) => p[1])),
  bocalReach: BOCAL_PATH[BOCAL_PATH.length - 1][0],
  bocalD: [2 * bocalR(0), 2 * bocalR(1)] as const,
  reed: { length: REED_L, tipWidth: 2 * BW(1), blade: REED_L - XB0 },
  holes: { L1: 640, L2: 598, L3: 560, R1: 348, R2: 301 },
};
/** tests: the bore's place of a height on the wing (descending) and on the long joint (ascending) */
export const boreAt = (p: 'wing' | 'long', y: number) => boreS(p, y, 0) * mm;

/** its seat in the Orchestra (scenes3d.ts ensembleSeats): the model lifted to a seated player's hold
 *  (its boot by the right thigh), turned to its hero angle and leaned 30° across the player, its bell up
 *  past the left shoulder; `top` the height the framing allows for (the bell's rim at ≈ 1.45 m) */
export const BASSOON_SEAT = { y: 0.24, turn: 0, lean: 0.52, top: 1.62 };
/** the stage's aspect from which it is leaned (BASSOON_POSE.wide), and the hero bearing for each pose */
export const BASSOON_WIDE = 1.1;
export const BASSOON_VIEW = { tall: 0, wide: 0 };
