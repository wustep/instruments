// The clarinet in 3D: a Boehm-system B♭ clarinet (17 keys, 6 rings), Yamaha's YCL-CSG III, built once
// and posed from the live state. Real scale (docs/3d-reference.md, "Clarinet"), laid out in pixels from
// Yamaha's own full-length photograph of it (8.71 px/mm):
//
//   the mouthpiece: black hard rubber, 67.9 mm out of the barrel; its beak, from a 13.5 mm tip to the
//     Ø 27 shank; underneath, the flat table and the rails, which curve away from the reed over the
//     last 21 mm (the lay: Yamaha's Custom facing) so the reed's tip stands 1.1 mm off the tip rail;
//     the window, dark, under the reed;
//   the reed: 68 mm of cane, 13 mm wide at its tip, the vamp (scraped, pale) 34 mm long at its heart,
//     the bark glossy behind it; the ligature: a nickel-plated band 24.5 mm wide round the beak and
//     the reed's heel, its two flanges on the reed's side drawn together by two knurled screws;
//   the barrel (54 mm: Yamaha's own) swelling from Ø 28.7 under its top ring to Ø 31.9; the upper
//     joint (196 mm, Ø 30 under the barrel, then 28.5), the lower joint (234 mm, Ø 28.7, flaring to
//     31.5 into the bell's ring), the bell (112 mm) flaring over its last 25 mm into a thick rounded
//     rim of Ø 73.6, its mouth Ø 60 inside (Debut, Kergomard & Laloë's Buffet); silver rings at the
//     barrel's ends, the lower joint's socket and the bell's;
//   the keywork, silver-plated, in the photograph's places: the register key on the back, its vent
//     high on the joint; the A key on its hinge across the front (a seesaw: the spatula pressed, the
//     pad lifts); the G♯ key and its long touch on the player's left; the four side (trill) keys down
//     the player's right with their touches stacked at the joint; the thumb ring; the rings of L1 and
//     L2 with the pad between them the ring mechanism closes; L3 a plain hole; the E♭/B♭ sliver; the
//     C♯/G♯ key; the bridge over the joint; R1–R3's rings, the bridge's pad above them, the B/F♯ sliver;
//     the left little finger's long levers up to their spatulas beside the joint, the right little
//     finger's four spatulas across the front; the G♯/D♯ key; the F♯, F and E pads on the low keys'
//     line down the front; posts on their flanges, hinge tubes on steel pivots, needle springs, white
//     pads; the thumb rest on the back of the lower joint.
//
// Live: the rings and keys follow the clarinet's Boehm fingering for the engine's note (clarinet-
// fingering.ts, the chart the 2D stage uses): each pad seats with a small bounce or overshoots a little
// off its stop as it opens (the oboe's springs); the reed's tip curls onto the lay with its opening
// (`fr.reed.open`: blown shut once a cycle when loud, a hair's tremor with the level), and the breath goes
// into the mouthpiece (winds3d breathIn: faint steel streams, as on the brass). The rings, the keys, their pads, the
// tone holes and the bell are never lit or tinted: silver, pad skin and wood, sounding or not. A moment after the clarinet stops sounding the keys go back to rest.
// Approximations: the linkages are shown, not simulated (each key springs to the state the mechanism
// gives it: the low pads close with the little fingers' touches through their clutches, the bridge and
// the ring pad with the second ring); the trill keys never open (the chart has no trills).
import type { VisualFrame } from '@piano-model/engine';
import { L1, L2, LA, LCS, LE, LFS, LGS, R1, R2, R3, RAB, RE, REG, RF, SEB, T, clarinetFingersFor } from '../clarinet-fingering.ts';
import { type Batch, type Mat4, type Mesh, type Vec3, chain, cross, dot, mulInto, norm, rotX, rotY, rotZ, scale, sub, translate, xform } from './gl3d.ts';
import { M, MeshBuilder, cyl, ellipsoid, extrude, grid, spline, variant, type Mat } from './mesh.ts';
import { aboutAxis, dome, fillet, frameY, lx, pchip, pipe, revolve, spline3, springTo, sweep } from './oboe3d.ts';
import { breathIn, type WindPose } from './winds3d.ts';

type P2 = [number, number];
const TAU = Math.PI * 2;
const mm = 0.001;

// ---------------------------------------------------------------- materials
const WOOD = M.grenadilla; // lathed about its own y (the tube's axis)
const DARK = M.hole;
/** the bell's throat (a little lighter than a hole: the light reaches some way in) */
const THROAT = variant(M.grenadilla, { col: [0.06, 0.045, 0.04], tint: true });
/** the countersink round a tone hole */
const SINK = variant(M.grenadillaX, { col: [0.045, 0.032, 0.028], tint: true });
const AG = M.silverKeys;
const STEEL = M.steel;
const CORK = M.cork;
/** the pads: white skin over felt */
const PAD = M.padSkin;
const RUBBER = M.ebonite;
/** the ligature: nickel-plated brass, polished */
const LIG = M.nickel;
const CANE = M.cane;
const SCRAPE = M.caneScraped;
/** the reed's flat underside and cut edges: the cane's inside, paler and matte */
const CANE_CUT = variant(M.caneScraped, { col: [0.84, 0.74, 0.52], tint: true });

// ---------------------------------------------------------------- small helpers
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const deg = (d: number) => (d * Math.PI) / 180;
const smooth = (t: number) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};

// ================================================================ the clarinet's measures (mm from the mouthpiece's tip)
// Measured off Yamaha's own photograph of the YCL-CSG III (clarinet-yamaha-csg3-front.jpg, 8.71 px/mm:
// its 54 mm barrel, Yamaha's specification, is 470.5 px; the whole is then 664 mm tip to bell, as Debut,
// Kergomard & Laloë measured a Buffet Crampon, reed tip to bell end; docs/3d-reference.md)
/** the photograph's scale (px/mm, both ways) and its axis (px across) */
const PX = 8.71;
const AXIS_X = 327;
/** mm from the tip of a row of the photograph */
const rb = (row: number): number => row / PX;
/** the mouthpiece: its tip at 0, its shank into the barrel's socket */
const MPE = rb(591);
/** the barrel (54 mm), with its socket rings */
const BAR0 = MPE;
const BAR1 = rb(1062);
/** the upper (left-hand) joint, from the barrel to the lower joint's socket ring */
const UJ0 = BAR1;
const UJ1 = rb(2769);
/** the lower (right-hand) joint, its socket ring at the top */
const LJ0 = UJ1;
const LJ1 = rb(4808);
/** the bell, from its socket ring to the end of its rim */
const BE0 = LJ1;
export const CLARINET_LEN = 0.664;
const BE1 = CLARINET_LEN / mm;
/** the bell's rim, outside radius (m): Ø 73.6 */
export const CLARINET_RIM = 0.0368;
/** model x of a point `b` mm down from the mouthpiece's tip */
const X = (b: number) => b * mm;

// the outside of the wood, mm from the tip → radius (mm), off the photograph: the barrel swelling from
// under its top ring to its widest 40 mm down; the upper joint full under the barrel, then Ø 28.5; the
// lower joint's socket, its body, the flare into the bell's ring; the bell's slow flare, opening fast
// over its last 25 mm into the rim's thick bead, rolled under to the mouth (inside, Ø 60: Debut)
const BARREL: P2[] = [[rb(645), 14.3], [rb(680), 14.35], [rb(720), 14.5], [rb(760), 14.7], [rb(800), 15.0], [rb(840), 15.3], [rb(880), 15.7], [rb(920), 15.95], [rb(960), 15.95], [rb(1003), 15.8]];
const UPPER: P2[] = [[UJ0, 15.0], [UJ0 + 2, 14.95], [UJ0 + 6, 14.7], [UJ0 + 13, 14.45], [UJ0 + 24, 14.3], [UJ1 - 30, 14.25], [UJ1 - 4, 14.3], [UJ1, 14.35]];
const LOWER: P2[] = [[rb(2837), 15.25], [rb(2837) + 6, 15.1], [rb(2837) + 13, 14.6], [rb(2837) + 22, 14.38], [rb(4400), 14.35], [rb(4700), 14.45], [rb(4760), 14.7], [rb(4790), 15.4], [LJ1, 15.75]];
const BELL_OUT: P2[] = [[rb(4871), 16.0], [rb(4900), 16.15], [rb(5000), 17.15], [rb(5100), 18.4], [rb(5200), 19.7], [rb(5300), 21.1], [rb(5400), 22.6], [rb(5500), 25.0], [rb(5550), 26.9], [rb(5600), 29.3], [rb(5650), 31.3], [rb(5680), 33.4], [654.0, 35.6]];
const BELL_LIP: P2[] = [[655.4, 36.5], [657.4, 36.8], [659.8, 36.5], [662.0, 35.6], [663.4, 34.1], [664.0, 32.4], [663.8, 31.1], [663.2, 30.4]];
const BELL_IN: P2[] = [[663.2, 30.4], [660, 28.4], [654, 24.6], [645, 20.0], [635, 16.6], [620, 13.6], [598, 11.1], [578, 9.2], [565, 8.45], [557, 7.6]];
const fit = (pts: P2[]) => pchip(pts.map((p) => p[0]), pts.map((p) => p[1]));
const barrel = fit(BARREL);
const upper = fit(UPPER);
const lower = fit(LOWER);
const bell = fit(BELL_OUT);
const clampTo = (pts: P2[], b: number) => Math.max(pts[0][0], Math.min(pts[pts.length - 1][0], b));
/** the outer radius of the wood (mm) at `b` mm from the tip (the rings stand proud of it) */
export function rOut(b: number): number {
  if (b < BAR0) return 13.5;
  if (b < BAR1) return barrel(clampTo(BARREL, b));
  if (b < UJ1) return upper(clampTo(UPPER, b));
  if (b < LJ1) return lower(clampTo(LOWER, b));
  return bell(clampTo(BELL_OUT, b));
}

/** the side a positive angle is on (φ from the front, the rings' side, towards the player's left) */
const SIDE = -1;
/** a point at `b` mm from the tip, φ degrees round from the front, `r` mm from the axis */
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
/** a point's place: mm from the tip, and φ */
const placeOf = (p: Vec3): [number, number] => [p[0] / mm, (Math.atan2(-p[2], p[1]) * 180) / Math.PI / SIDE];

// ================================================================ the mouthpiece, the reed, the ligature
// The mouthpiece's underside is the table the reed is clamped to: a plane TAB mm behind the axis (the
// back, φ = 180°, the player's side: the reed rests on the lower lip). Towards the tip its side rails
// curve away from the reed (the lay, LAY mm long), so the reed's tip stands TIPO mm off the tip rail.
const TAB = 11.35;
const LAY = 21;
const TIPO = 1.1;
/** the lay: the rails' height over the table plane (mm, towards the axis) at `b` */
const layAt = (b: number) => (b >= LAY ? 0 : TIPO * ((LAY - b) / LAY) ** 2.2);
/** the mouthpiece's plan (half-width, mm), its height over the table (the beak), and the table's
 *  half-width (the rails' outside edges), from the tip to the shank */
const MP_W = pchip([0, 2.3, 6.9, 11.5, 17.2, 23, 28.7, 40, 52, 60, MPE], [6.6, 6.75, 8.8, 10.0, 10.8, 11.2, 11.6, 12.4, 13.1, 13.4, 13.5]);
const MP_H = pchip([0, 4, 12, 22, 32, 42, 50, 58, MPE], [3.6, 5.4, 8.9, 13.2, 17.6, 21.6, 24.0, 24.8, 24.85]);
const MP_T = pchip([0, 10, 30, 50, MPE], [6.55, 6.75, 6.95, 7.2, 7.3]);
/** the tip's arch in plan: the rail recedes at its corners (mm, at z = ±half-width) */
const TIPC = 1.4;

/** the section of the mouthpiece at `b`: an ellipse over the table, cut flat by it, its two corners
 *  (the rails' outer edges) rounded. Points (z, y) in mm (y up from the axis, the table at −TAB), from
 *  the right-hand corner over the top to the left-hand one, `n` of them evenly by length */
function mpSection(b: number, n: number): P2[] {
  const yb = -TAB + layAt(b);
  const A = MP_W(b);
  const H = MP_H(b);
  const W = Math.min(MP_T(b), A - 0.05);
  const q = Math.sqrt(Math.max(0, 1 - (W * W) / (A * A)));
  const t = (q * H) / (1 + q);
  const yc = yb + t;
  const B = H - t;
  const th0 = Math.asin(Math.max(-1, Math.min(1, (yb - yc) / B)));
  const raw: P2[] = [[W - 0.7, yb]];
  for (let i = 0; i <= 48; i++) {
    const th = lerp(th0, Math.PI - th0, i / 48);
    raw.push([A * Math.cos(th), yc + B * Math.sin(th)]);
  }
  raw.push([-(W - 0.7), yb]);
  const r = fillet(raw, raw.map((_, i) => (i === 1 || i === raw.length - 2 ? 0.55 : 0)), 5);
  return resample(r, n);
}
/** a polyline resampled to `n` points evenly by length */
function resample(pts: P2[], n: number): P2[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const tot = acc[acc.length - 1];
  const out: P2[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (tot * k) / (n - 1);
    while (j < pts.length - 2 && acc[j + 1] < s) j++;
    const f = (s - acc[j]) / Math.max(1e-9, acc[j + 1] - acc[j]);
    out.push([lerp(pts[j][0], pts[j + 1][0], f), lerp(pts[j][1], pts[j + 1][1], f)]);
  }
  return out;
}
/** a point of the mouthpiece in the model (b along, z across to the player's left, y towards the front) */
const MPp = (b: number, z: number, y: number): Vec3 => [X(b), y * mm, z * mm];

function mouthpiece(mb: MeshBuilder): void {
  // stations along the length, close at the tip; the tip's front edge rounded over its last 0.8 mm
  const bs: number[] = [];
  for (let i = 0; i <= 10; i++) bs.push(0.8 * (1 - Math.cos((Math.PI / 2) * (i / 10))) - 0.8);
  for (let b = 0.4; b < MPE + 1; b += b < 26 ? 1.3 : 2.4) bs.push(b);
  bs.push(MPE + 1);
  const NV = 72;
  const secs = bs.map((b) => {
    if (b >= 0) return mpSection(b, NV);
    // the tip's front: the section drawn in towards the rail's edge
    const k = Math.sqrt(Math.max(0, 1 - (b / 0.8) ** 2));
    const s0 = mpSection(0, NV);
    const yb = -TAB + layAt(0);
    return s0.map(([z, y]) => [z * (0.82 + 0.18 * k), yb + (y - yb) * k] as P2);
  });
  // the tip's arch in plan: the stations near the tip pushed back at the sides
  const bAt = (i: number, z: number) => {
    const b = bs[i];
    return b + TIPC * (z / MP_W(0)) ** 2 * clamp01(1 - Math.max(0, b) / 7);
  };
  grid(mb, bs.length - 1, NV - 1, (u, v) => {
    const i = Math.round(u * (bs.length - 1));
    const [z, y] = secs[i][Math.round(v * (NV - 1))];
    return MPp(bAt(i, z), z, y);
  }, RUBBER);
  // the table and the rails between the corners: the rails' faces, the window (the chamber's dark
  // opening under the reed, from 2.5 mm behind the tip rail to 36 mm), the table behind it
  const rail = (i: number, side: 1 | -1, f: number) => {
    const s = secs[i];
    const e = side > 0 ? s[0] : s[NV - 1];
    return [e[0] * f, e[1]] as P2;
  };
  const iw0 = bs.findIndex((b) => b >= 2.5);
  const iw1 = bs.findIndex((b) => b >= 36);
  const flat = (i0: number, i1: number, f0: number, f1: number, m: Mat, sink = 0) =>
    grid(mb, i1 - i0, 4, (u, v) => {
      const i = i0 + Math.round(u * (i1 - i0));
      const [z, y] = rail(i, 1, lerp(f0, f1, v));
      return MPp(bAt(i, z), z, y + sink);
    }, m, { flip: true });
  // (the rails: 1.1 mm wide either side of the window)
  const wr = (i: number) => Math.max(0.01, 1 - 1.1 / Math.max(1.2, rail(i, 1, 1)[0]));
  flat(0, iw0, 1, -1, RUBBER);
  flat(iw1, bs.length - 1, 1, -1, RUBBER);
  for (let i = iw0; i < iw1; i++) {
    const w0 = wr(i);
    const w1 = wr(i + 1);
    const pts = (k: number, f: number): Vec3 => {
      const [z, y] = rail(k, 1, f);
      return MPp(bAt(k, z), z, y);
    };
    // right rail, window (sunk 0.4 mm), left rail
    mb.quad(pts(i, 1), pts(i, w0), pts(i + 1, w1), pts(i + 1, 1), RUBBER);
    mb.quad(pts(i, -w0), pts(i, -1), pts(i + 1, -1), pts(i + 1, -w1), RUBBER);
    const d = (k: number, f: number): Vec3 => {
      const p = pts(k, f);
      return [p[0], p[1] + 0.0004, p[2]];
    };
    mb.quad(d(i, w0), d(i, -w0), d(i + 1, -w1), d(i + 1, w1), DARK);
  }
}

// The reed: 67.5 mm of cane (Vandoren's B♭ clarinet reed), its tip with the mouthpiece's tip, 13 mm wide
// there; the vamp (the cut, thinned part) 34 mm long at the heart, the bark behind it; flat underneath on
// the table. Its tip part (b < LAY) closes onto the lay with the engine's opening: three pieces, each
// turning a little further, so it curls onto the curve of the lay instead of cutting through it.
const REED_L = 68;
const REED_W = pchip([0, 10, 30, 50, REED_L], [6.5, 6.45, 6.2, 5.9, 5.7]);
/** where the bark begins (mm from the tip) across the reed (u −1 … 1): the vamp's U-shaped shoulder */
const VAMP = (u: number) => 34 - 8.5 * u * u;
/** the reed's thickness (mm) at `b` across u */
function reedTh(b: number, u: number): number {
  const v = VAMP(u);
  // the bark: an arc of the cane's tube (radius ≈ 14 mm) over the flat
  const w = REED_W(b) * u;
  const bark = 3.1 - (14 - Math.sqrt(14 * 14 - w * w));
  if (b >= v) return bark * (b > REED_L - 1.2 ? 0.6 + 0.4 * Math.sqrt(Math.max(0, (REED_L - b) / 1.2)) : 1);
  // the vamp: the tip, the heart (thicker down the middle), into the shoulder
  const s = b / v;
  const heart = 0.1 + 2.75 * s ** 1.6;
  const across = 0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - u * u));
  return Math.min(bark, heart * lerp(across, 1, s ** 3));
}
/** the reed's split points along it (the pieces that curl onto the lay: tip … LAY) */
const REED_CUTS = [0, 8, 15, LAY];
/** a point of the reed's outside at (b, u) */
const reedOut = (b: number, u: number): Vec3 => {
  const bb = b + TIPC * u * u * clamp01(1 - b / 7);
  return MPp(bb, REED_W(b) * u, -TAB - reedTh(b, u));
};
const reedIn = (b: number, u: number): Vec3 => {
  const bb = b + TIPC * u * u * clamp01(1 - b / 7);
  return MPp(bb, REED_W(b) * u, -TAB);
};
/** the reed from b0 to b1 (its outside, underside, rails; the tip's edge or the heel's butt if at an end) */
function reedPiece(mb: MeshBuilder, b0: number, b1: number): void {
  const n = Math.max(3, Math.round((b1 - b0) / 1.1));
  const U = (v: number) => Math.sin((Math.PI / 2) * (2 * v - 1));
  // the outside: the vamp (scraped, pale and matte) and the bark (glossy)
  const vampEnd = (u: number) => Math.min(b1, Math.max(b0, VAMP(u)));
  if (b0 < VAMP(1)) grid(mb, n, 26, (a, v) => reedOut(lerp(b0, vampEnd(U(v)), a), U(v)), SCRAPE, { flip: true });
  if (b1 > VAMP(1)) grid(mb, n, 26, (a, v) => reedOut(lerp(vampEnd(U(v)), b1, a), U(v)), CANE, { flip: true });
  // the underside on the table
  grid(mb, n, 8, (a, v) => reedIn(lerp(b0, b1, a), U(v)), CANE_CUT);
  // the rails (the cut sides)
  for (const s of [-1, 1] as const) grid(mb, n, 1, (a, v) => (v < 0.5 ? reedIn : reedOut)(lerp(b0, b1, a), s), CANE_CUT, { flip: s < 0 });
  if (b0 === 0) grid(mb, 1, 26, (a, v) => (a < 0.5 ? reedIn : reedOut)(0, U(v)), CANE_CUT);
  if (b1 === REED_L) {
    // the heel's butt, its corners rounded
    grid(mb, 1, 26, (a, v) => {
      const u = U(v);
      const b = REED_L - 2.2 * (1 - Math.sqrt(Math.max(0, 1 - u ** 8)));
      return a < 0.5 ? reedIn(b, u) : reedOut(b, u);
    }, CANE_CUT, { flip: true });
  }
}

/** the ligature: a band of nickel-plated brass round the mouthpiece and the reed's heel, its two
 *  flanges on the reed's side drawn together by two screws (the standard ligature) */
const LIG0 = rb(278);
const LIG1 = rb(491);
function ligature(mb: MeshBuilder): void {
  // the band: round the beak (the mouthpiece's section, 0.5 mm off it) and under the reed's bark
  const NV = 64;
  const ring = (b: number, off: number): P2[] => {
    const top = mpSection(b, 40).map(([z, y]) => {
      const c = 0;
      const d = Math.hypot(z, y - c) || 1;
      return [z + (off * z) / d, y + (off * (y - c)) / d] as P2;
    });
    // under the reed: its bark's arc
    const W = REED_W(b);
    const under: P2[] = [];
    for (let i = 0; i <= 16; i++) {
      const u = 1 - (2 * i) / 16;
      const flare = Math.abs(u) > 0.92 ? 1 : 0;
      under.push([(W + off) * u * (1 + 0.06 * flare), -TAB - reedTh(b, u) - off]);
    }
    const loop = [...top, ...under.reverse()];
    return resample([...loop, loop[0]], NV);
  };
  // (stations every 2 mm between the rounded edges: the band follows the beak's swell, not its chords)
  const mid = Array.from({ length: 11 }, (_, i) => lerp(LIG0 + 2.2, LIG1 - 2.2, (i + 1) / 12));
  const bs = [LIG0, LIG0 + 0.35, LIG0 + 1, LIG0 + 2.2, ...mid, LIG1 - 2.2, LIG1 - 1, LIG1 - 0.35, LIG1];
  const lip = (i: number) => (i === 0 || i === bs.length - 1 ? 0.15 : i === 1 || i === bs.length - 2 ? 0.45 : i === 2 || i === bs.length - 3 ? 0.62 : 0.7);
  const outer = bs.map((b, i) => ring(b, lip(i)));
  grid(mb, bs.length - 1, NV - 1, (u, v) => {
    const i = Math.round(u * (bs.length - 1));
    const [z, y] = outer[i][Math.round(v * (NV - 1))];
    return MPp(bs[i], z, y);
  }, LIG);
  // the flanges on the reed's side, and the two screws through them (their knurled heads to the
  // player's right)
  const yF = -TAB - 3.3;
  // (a frame whose x runs along the clarinet, y across it (the plate's thickness), z away from the reed)
  const L = (LIG1 - LIG0 - 1) / 2;
  const outline = fillet([[-L, -0.6], [-L, 3.9], [L, 3.9], [L, -0.6]] as P2[], [0, 1.4, 1.4, 0], 4).map(([a, c]) => [a * mm, c * mm] as P2);
  for (const s of [-1, 1]) {
    const F = new Float32Array([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, X((LIG0 + LIG1) / 2), yF * mm, s * 2.4 * mm, 1]);
    mb.with(F, () => extrude(mb, outline, -0.00035, 0.00035, LIG, { smooth: 0.5 }));
  }
  for (const b of [LIG0 + 3.6, LIG1 - 3.6]) {
    const y = yF - 1.6;
    // the screw's shank across both flanges, and its head
    cyl(mb, MPp(b, -4.2, y), MPp(b, 3.6, y), 0.0009, 0.0009, 12, STEEL, true);
    mb.with(frameY(MPp(b, -3.0, y), [0, 0, -1]), () => {
      const prof: P2[] = [[0, 0], [0.0018, 0], [0.0018, 0.0006], [0.0029, 0.0011], [0.0029, 0.0061], [0.0026, 0.0068], [0, 0.0069]];
      revolve(mb, fillet(prof, [0, 0, 0.0002, 0.0004, 0.0005, 0.0003, 0], 3), 24, LIG);
      // its knurling: fine ridges along the head
      for (let k = 0; k < 18; k++) {
        const a = (k / 18) * TAU;
        const p0: Vec3 = [Math.cos(a) * 0.00292, 0.0014, Math.sin(a) * 0.00292];
        const p1: Vec3 = [Math.cos(a) * 0.00292, 0.0058, Math.sin(a) * 0.00292];
        cyl(mb, p0, p1, 0.00016, 0.00016, 4, LIG, false);
      }
    });
  }
}

// ================================================================ the keywork's parts (as oboe3d.ts's)
/** a rod line: the steel the keys' hinge tubes turn on, between its end posts (mm from the tip), `h` mm
 *  off the surface there, at φ degrees round from the front */
interface Rod {
  phi: number;
  h: number;
  b0: number;
  b1: number;
  posts: number[];
}
const rodR = (r: Rod, b: number) => lerp(rOut(r.b0) + r.h, rOut(r.b1) + r.h, (b - r.b0) / (r.b1 - r.b0));
const rodP = (r: Rod, b: number): Vec3 => P(b, r.phi, rodR(r, b));

/** the frame of a cup at (b, φ): y out of the tube (the pad's face at y = 0, `gap` mm off the
 *  surface), x along the tube, z round it */
const cupFrame = (b: number, phi: number, gap = 0.15): Mat4 => chain(translate(X(b), 0, 0), rotX(-SIDE * deg(phi)), translate(0, (rOut(b) + gap) * mm, 0));
/** a cup's shell height over its pad's face */
const cupTop = (r: number) => 0.0017 + 0.1 * r;
type CupStyle = 'plain' | 'screw';
/** a key's cup: a domed shell (an adjusting screw's head in the middle of a vent's) over its pad,
 *  white skin, a little proud of the skirt */
function cup(mb: MeshBuilder, Cf: Mat4, style: CupStyle, r: number): void {
  const top = cupTop(r);
  mb.with(Cf, () => {
    const cap = dome(0, r - 0.0011, top + (r > 0.005 ? 0.0009 : 0.0003), top - 0.0004);
    const prof: P2[] = [...cap, [r, top - 0.0013], [r, 0.0006], [r - 0.0005, 0.0006]];
    const rads = prof.map((_, i) => (i === cap.length - 1 ? 0.0006 : i === cap.length ? 0.0005 : i === cap.length + 1 ? 0.0002 : 0));
    revolve(mb, fillet(prof, rads, 4), 40, AG);
    if (style === 'screw') {
      mb.with(translate(0, top + 0.0002, 0), () => revolve(mb, fillet([[0, 0.0006], [0.001, 0.0005], [0.0011, 0], [0, 0]], [0, 0.0003, 0, 0], 3), 20, AG));
      const y = top + 0.00082;
      mb.quad([-0.0009, y, -0.00012], [-0.0009, y, 0.00012], [0.0009, y, 0.00012], [0.0009, y, -0.00012], DARK);
    }
    revolve(mb, fillet([[0, 0], [r - 0.0009, 0], [r - 0.0005, 0.0003], [r - 0.0005, 0.0009]], [0, 0.0003, 0.0002, 0], 3), 40, PAD);
  });
}

/** a key's arm from its hinge tube (`from`, on its rod) round the tube to the cup: a flat bar that
 *  broadens into the cup's side */
function arm(mb: MeshBuilder, Cf: Mat4, r: number, from: Vec3, cupB: number, cupPhi: number, viaH = 3.0): void {
  const top = cupTop(r);
  const q = sub(from, [X(cupB), 0, 0]);
  const a = SIDE * deg(cupPhi);
  const z = q[1] * Math.sin(a) + q[2] * Math.cos(a);
  const sg = z < 0 ? -1 : 1;
  const near = xform(Cf, [0, top * 0.45, sg * (r + 0.0032)]);
  const rim = xform(Cf, [0, top - 0.0007, sg * (r - 0.0004)]);
  const inside = xform(Cf, [0, top - 0.0009, sg * (r * 0.3)]);
  const [fb, fphi] = placeOf(from);
  const [nb, nphi] = placeOf(near);
  const mid = S(lerp(fb, nb, 0.5), lerp(fphi, nphi, 0.5), viaH);
  const path = spline3([from, mid, near, rim, inside], 6);
  const wEnd = 0.62 * r;
  sweep(mb, path, OUT, (f) => (f < 0.42 ? 0.00145 : 0.00145 + (wEnd - 0.00145) * Math.sin((Math.PI / 2) * Math.min(1, (f - 0.42) / 0.4)) ** 2), () => 0.00075, AG, 16, 3.2);
}

/** a hinge tube on a rod line, from b0 to b1, with rounded ends */
function hinge(mb: MeshBuilder, r: Rod, b0: number, b1: number, rr = 0.0019): void {
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
  mb.with(frameY(base, sub(top, base)), () => revolve(mb, fillet([[0, 0], [0.0033, 0], [0.0033, 0.0005], [0.002, 0.0012], [0.0016, L - 0.0018], [0.002, L - 0.001]], [0, 0, 0.0004, 0.0006, 0.0006, 0], 3), 20, AG));
  ellipsoid(mb, top, [0.0025, 0.0025, 0.0025], 18, AG);
}
/** the steel pivot of a rod line, seen between its hinge tubes, with its screw's head at the top */
function steel(mb: MeshBuilder, r: Rod): void {
  const a = rodP(r, r.b0);
  const c = rodP(r, r.b1);
  cyl(mb, a, c, 0.00075, 0.00075, 12, STEEL, false);
  const d = norm(sub(a, c));
  mb.with(frameY(a, d), () => revolve(mb, fillet([[0, 0.0016], [0.0013, 0.0016], [0.0013, 0.0026], [0, 0.0026]], [0, 0.0003, 0.0003, 0], 2), 16, AG));
}
/** a needle spring: from a post, along beside the rod, into a key's catch */
function needle(mb: MeshBuilder, r: Rod, bPost: number, bCatch: number): void {
  const off = (b: number): Vec3 => {
    const R = rodR(r, b);
    return P(b, r.phi - Math.sign(r.phi || 1) * ((2.1 / R) * 180) / Math.PI, R - 0.5);
  };
  const p0 = off(bPost);
  const p1 = off(bCatch);
  pipe(mb, [p0, p1], 0.00027, STEEL, 8);
  const c = rodP(r, bCatch);
  cyl(mb, c, p1, 0.00055, 0.00048, 10, AG);
}
/** a touch: a teardrop spatula swept along `path` (its narrow end first), `w` its half-width at the
 *  round end, face out from the tube */
function spoon(mb: MeshBuilder, path: Vec3[], w: number, up: (p: Vec3) => Vec3 = OUT): void {
  // a pear: from the stem it swells to its full width, then closes in a half-round end of that width
  let L = 0;
  for (let i = 1; i < path.length; i++) L += len3(sub(path[i], path[i - 1]));
  const c = Math.max(0.35, Math.min(0.85, 1 - w / Math.max(1e-6, L)));
  const width = (f: number) => (f <= c ? w * (0.26 + 0.74 * Math.sin((Math.PI / 2) * (f / c)) ** 0.8) : w * Math.sqrt(Math.max(0.0004, 1 - ((f - c) / (1 - c)) ** 2)));
  sweep(mb, path, up, width, (f) => 0.00085 * (f <= c ? 0.8 + 0.2 * (f / c) : Math.sqrt(Math.max(0.05, 1 - ((f - c) / (1 - c)) ** 2))), AG, 22, 2.6);
}
/** the front (a touch's face beside the tube, turned to the fingers) */
const FRONT = (): Vec3 => [0, 1, 0];
/** a touch: a stem from `from` through `via` to the spatula, which runs along `sp` (its narrow end
 *  first), face to the front */
function touch(mb: MeshBuilder, from: Vec3, via: Vec3[], sp: Vec3[], w: number, up: (p: Vec3) => Vec3 = FRONT): void {
  stem(mb, spline3([from, ...via, sp[0]], 6), 0.0013, 0.0008);
  spoon(mb, spline3(sp, 6), w, up);
}
/** a lever's stem: a bar from a hinge tube along a path */
const stem = (mb: MeshBuilder, path: Vec3[], w = 0.0011, h = 0.0007) => sweep(mb, path, OUT, () => w, () => h, AG, 12, 2.6);
/** a roller: a small turned cylinder between two touches, its axis from a to b */
function roller(mb: MeshBuilder, a: Vec3, b: Vec3, r = 0.0016): void {
  const L = len3(sub(b, a));
  mb.with(frameY(a, sub(b, a)), () => revolve(mb, fillet([[0, 0], [r * 0.8, 0], [r, 0.0005], [r, L - 0.0005], [r * 0.8, L], [0, L]], [0, 0.0003, 0.0004, 0.0004, 0.0003, 0], 3), 20, AG));
}

/** the curve of a tone hole's edge or a ring round it, wrapped onto the tube: at (b, φ), radius ρ (m),
 *  angle a round the hole, `lift` mm off the wood */
const wrapped = (b: number, phi: number, rho: number, a: number, lift: number): Vec3 => {
  const db = (rho * Math.cos(a)) / mm;
  const s = rho * Math.sin(a);
  const rr = rOut(b + db);
  return P(b + db, phi + ((s / (rr * mm)) * 180) / Math.PI, rr + lift);
};
/** a tone hole drilled into the wood at (b, φ): its dark well and the countersink round it */
function toneHole(mb: MeshBuilder, b: number, phi: number, hole: number, sink = 0.0008): void {
  grid(mb, 3, 40, (u, v) => wrapped(b, phi, hole * u, v * TAU, 0.03), DARK, { wrapV: true });
  grid(mb, 2, 40, (u, v) => wrapped(b, phi, hole + sink * u, v * TAU, 0.03 - 0.02 * u), SINK, { wrapV: true });
}
/** a ring key's ring: a thin band of silver round a finger hole, bent to the tube, `lift` mm off the wood
 *  (r: its outside radius, w: the band's width, m) */
function ringBand(mb: MeshBuilder, b: number, phi: number, r: number, w: number, lift: number): void {
  const N = 48;
  const rc = r - w / 2;
  const path = Array.from({ length: N + 1 }, (_, i) => wrapped(b, phi, rc, (i / N) * TAU, lift));
  sweep(mb, path, OUT, () => w / 2, () => 0.00048, AG, 12, 2.6);
}

// ---------------------------------------------------------------- the body
/** a silver ring round a joint: from b0 to b1, its outside radius r (mm), its edges rounded, an inner
 *  face down to rIn where it shows (a socket's mouth) */
function band(mb: MeshBuilder, b0: number, b1: number, r: number, rIn0: number, rIn1: number): void {
  lx(mb, fillet([[rIn0 * mm, X(b0)], [(r - 0.3) * mm, X(b0)], [r * mm, X(b0 + 0.6)], [r * mm, X(b1 - 0.6)], [(r - 0.3) * mm, X(b1)], [rIn1 * mm, X(b1)]], [0, 0.0003, 0.0004, 0.0004, 0.0003, 0], 3), 80, AG);
}
/** the wood from b0 to b1 (its profile rOut), sampled closer towards its ends, where it swells */
function wood(mb: MeshBuilder, b0: number, b1: number, n: number): void {
  const prof: P2[] = Array.from({ length: n + 1 }, (_, i) => {
    const b = lerp(b0, b1, (1 - Math.cos((Math.PI * i) / n)) / 2);
    return [rOut(b) * mm, X(b)] as P2;
  });
  lx(mb, prof, 80, WOOD);
}
function body(mb: MeshBuilder): void {
  // the barrel: its socket rings at both ends, the wood between with its waist
  band(mb, BAR0, rb(645), 14.45, 13.4, 14.3);
  wood(mb, rb(645), rb(1003), 24);
  band(mb, rb(1003), BAR1, 15.65, 15.8, 15.0);
  // the upper joint (its tenon in the barrel), its foot's ring into the lower joint's socket
  wood(mb, UJ0, UJ1, 36);
  // the lower joint's socket ring, the joint, the ring of its foot
  band(mb, LJ0, rb(2837), 15.55, 14.35, 15.25);
  wood(mb, rb(2837), LJ1, 44);
  // (the bell is its own mesh; the dark of the bore beyond its throat)
  lx(mb, [[7.7 * mm, X(557)], [0, X(556.5)]], 32, DARK);
}
/** the bell: its socket ring, then one turned piece flaring into the rim and rolled under to the mouth,
 *  the throat inside (dark) */
function bellMesh(): Mesh {
  const mb = new MeshBuilder();
  band(mb, BE0, rb(4871), 16.2, 15.75, 16.0);
  const curve = spline([...BELL_OUT, ...BELL_LIP].map(([b, r]) => [r * mm, X(b)] as P2), 4);
  lx(mb, curve, 96, WOOD);
  lx(mb, spline(BELL_IN.map(([b, r]) => [r * mm, X(b)] as P2), 3), 64, THROAT);
  return mb.build();
}

// ================================================================ the keys
interface KeyDef {
  name: string;
  /** a cup (`open`: whether it stands open for these fingers), a touch (`open`: pressed), or a ring
   *  round a finger hole (`open`: pressed, the finger on the hole) */
  kind: 'cup' | 'lever' | 'ring';
  rod: Rod;
  /** where its hinge tube runs (mm) */
  hb: [number, number];
  /** the cup or ring: mm from the tip, φ, outer radius (m), and the tone hole's radius (m) */
  b?: number;
  phi?: number;
  r?: number;
  hole?: number;
  style?: CupStyle;
  /** closed-standing (a vent its spring holds shut) */
  closed?: boolean;
  open: (f: number) => boolean;
  /** how far it opens at the cup's middle (or a touch or a ring travels), m */
  lift?: number;
  /** the rest of the piece: a touch, a spatula, a roller (in the model's frame) */
  extra?: (mb: MeshBuilder) => void;
  /** the point that travels (a touch's): default the cup's or ring's centre */
  at?: Vec3;
  /** a hinge across the tube instead of along a rod (the A key's): its two ends, on their posts */
  axis?: { a: Vec3; c: Vec3 };
  /** its arm drawn by `extra` (not from the rod to the cup) */
  noArm?: boolean;
}
const never = () => false;

// The keys' places are measured off the same photograph: its rows (rb), and across, its pixels off the
// axis over the tube's radius there
/** φ of a point of the surface the photograph shows `x` px across at `row` */
const ph = (x: number, row: number): number => (Math.asin(Math.max(-1, Math.min(1, (x - AXIS_X) / (rOut(rb(row)) * PX)))) * 180) / Math.PI;

// ---------------------------------------------------------------- rod lines
// the upper joint: the side (trill) keys' line on the player's right, furthest round; the rings' line
// beside it; the register key's on the back; the G♯ key's in front on the left; the thumb ring's on the
// back; the E♭/B♭ sliver key's on the left; the C♯/G♯ key's on the right at the joint's foot
const TR: Rod = { phi: -112, h: 3.2, b0: rb(1400), b1: rb(2690), posts: [rb(1400), rb(1700), rb(2080), rb(2690)] };
const RR: Rod = { phi: -76, h: 3.3, b0: rb(2095), b1: rb(2655), posts: [rb(2095), rb(2265), rb(2655)] };
const RG: Rod = { phi: 152, h: 3.0, b0: rb(1250), b1: rb(1985), posts: [rb(1250), rb(1640), rb(1985)] };
const GS: Rod = { phi: 36, h: 3.0, b0: rb(1720), b1: rb(1950), posts: [rb(1720), rb(1950)] };
const TH: Rod = { phi: -146, h: 3.0, b0: rb(2015), b1: rb(2165), posts: [rb(2015), rb(2165)] };
const SL: Rod = { phi: 64, h: 3.2, b0: rb(2340), b1: rb(2500), posts: [rb(2340), rb(2500)] };
const CS: Rod = { phi: -52, h: 2.9, b0: rb(2590), b1: rb(2762), posts: [rb(2590), rb(2762)] };
// the lower joint: the rings' line (and the bridge's pad) on the right; the little fingers' two long
// lines in front on the left; the low keys' line down the front; the G♯/D♯ key's on the right
const LR: Rod = { phi: -76, h: 3.3, b0: rb(2852), b1: rb(3590), posts: [rb(2852), rb(3060), rb(3300), rb(3590)] };
const LP1: Rod = { phi: 34, h: 3.4, b0: rb(2995), b1: rb(4135), posts: [rb(2995), rb(3420), rb(3870), rb(4135)] };
const LP2: Rod = { phi: 56, h: 4.0, b0: rb(2995), b1: rb(4135), posts: [rb(2995), rb(3420), rb(3870), rb(4135)] };
const FR: Rod = { phi: -8, h: 3.6, b0: rb(3955), b1: rb(4740), posts: [rb(3955), rb(4180), rb(4470), rb(4740)] };
const GR: Rod = { phi: -134, h: 3.2, b0: rb(3885), b1: rb(3990), posts: [rb(3885), rb(3990)] };
const RODS = [TR, RR, RG, GS, TH, SL, CS, LR, LP1, LP2, FR, GR];
/** the needle springs: [rod, its post, the key's catch] (mm) */
const NEEDLES: [Rod, number, number][] = [
  [RR, rb(2265), rb(2140)],
  [RR, rb(2265), rb(2400)],
  [LR, rb(3060), rb(2960)],
  [LR, rb(3060), rb(3100)],
  [LR, rb(3300), rb(3330)],
  [LR, rb(3590), rb(3520)],
  [FR, rb(4180), rb(4050)],
  [FR, rb(4470), rb(4320)],
  [FR, rb(4740), rb(4640)],
  [TR, rb(1700), rb(1560)],
  [TR, rb(2080), rb(2300)],
  [RG, rb(1640), rb(1300)],
];
/** the plain finger hole (the left hand's third finger: no ring) */
const PLAIN = [{ name: 'L3', b: rb(2620), phi: ph(320, 2620), hole: 0.004 }];

/** a side key's long lever from its hinge tube down the player's right to its touch (stacked at the
 *  joint's foot, pressed by the side of the right forefinger) */
const sideLever = (hb: number, rowTouch: number, fwd: number) => (mb: MeshBuilder) => {
  const b1 = rb(rowTouch);
  touch(mb, rodP(TR, hb), [Lp(hb + 8, -19.4, fwd + 0.8), Lp(lerp(hb, b1, 0.5), -20.4, fwd), Lp(b1 - 18, -21.6, fwd), Lp(b1 - 9, -26, fwd)], [Lp(b1 - 6, -29.5, fwd), Lp(b1 - 2, -30.6, fwd), Lp(b1 + 2.5, -31.0, fwd)], 0.0034);
};

// the A key's hinge: across the front below its pad, on two posts (a seesaw: the spatula below the
// hinge pressed, the pad above it lifts)
const A_HB = rb(1865);
const A_AXIS = { a: S(A_HB, -30, 3.0), c: S(A_HB, 16, 3.0) };
/** the register key's touch, above the thumb ring on the back */
const REG_TOUCH = rb(1990);

/** the keys that move */
const KEYS: KeyDef[] = [
  // the register key: its vent high on the back, its lever down the back to the touch over the thumb ring
  {
    name: 'reg', kind: 'cup', rod: RG, hb: [rb(1262), rb(1630)], b: rb(1300), phi: 120, r: 0.0036, hole: 0.0015, style: 'plain', closed: true, open: (f) => !!(f & REG), lift: 0.0016,
    extra: (mb) => {
      stem(mb, spline3([rodP(RG, rb(1600)), S(rb(1700), 164, 3.1), S(rb(1860), 176, 2.9), S(REG_TOUCH - 4, 182, 2.7)], 7), 0.0012, 0.0007);
      spoon(mb, spline3([S(REG_TOUCH - 4, 182, 2.7), S(REG_TOUCH, 183, 2.6), S(REG_TOUCH + 3.5, 184, 2.6)], 5), 0.0028);
    },
  },
  // the A key: its pad on the front at the top of the joint, the spatula below its hinge
  {
    name: 'A', kind: 'cup', rod: RG, hb: [0, 0], axis: A_AXIS, noArm: true, b: rb(1700), phi: ph(312, 1700), r: 0.0046, hole: 0.0022, style: 'plain', closed: true, open: (f) => !!(f & LA), lift: 0.0018,
    extra: (mb) => {
      const phiA = ph(312, 1700);
      // the arm from the cup down the front to the hinge, and on into the spatula
      stem(mb, spline3([S(rb(1712), phiA, 3.1), S(rb(1760), phiA - 1, 3.5), S(A_HB - 3, -7, 3.7), S(A_HB, -7, 3.6)], 6), 0.0011, 0.0007);
      spoon(mb, spline3([S(A_HB, -7, 3.6), S(rb(1915), -7, 3.4), S(rb(1990), -7, 3.0), S(rb(2060), -7, 2.6)], 6), 0.0052);
    },
  },
  // the G♯ key: its pad on the front to the right, a crossbar from its hinge over the front, its long
  // touch curving out past the tube on the player's left
  {
    name: 'gs', kind: 'cup', rod: GS, hb: [rb(1725), rb(1945)], noArm: true, b: rb(1812), phi: ph(245, 1812), r: 0.0047, hole: 0.0022, style: 'plain', closed: true, open: (f) => !!(f & LGS), lift: 0.0018,
    extra: (mb) => {
      const phiP = ph(245, 1812);
      const bb = rb(1797);
      sweep(mb, Array.from({ length: 13 }, (_, i) => S(bb, lerp(36, phiP + 4, i / 12), lerp(3.0, 2.4, i / 12) + 0.25 * Math.sin((Math.PI * i) / 12))), OUT, () => 0.0011, () => 0.00055, AG, 12, 3);
      touch(mb, rodP(GS, rb(1935)), [S(rb(1948), 48, 3.8)], [Lp(rb(1955), 15.0, 10.0), Lp(rb(2010), 16.6, 8.6), Lp(rb(2060), 17.4, 7.0), Lp(rb(2092), 17.4, 6.0)], 0.0042);
    },
  },
  // the thumb ring on the back
  { name: 'T', kind: 'ring', rod: TH, hb: [rb(2025), rb(2150)], b: rb(2085), phi: 180, r: 0.0062, hole: 0.0039, open: (f) => !!(f & T) },
  // the left hand's two rings, and the pad between them the ring mechanism closes
  { name: 'L1', kind: 'ring', rod: RR, hb: [rb(2105), rb(2175)], b: rb(2140), phi: ph(318, 2140), r: 0.0058, hole: 0.0034, open: (f) => !!(f & L1) },
  { name: 'rpad', kind: 'cup', rod: RR, hb: [rb(2275), rb(2330)], b: rb(2290), phi: ph(310, 2290), r: 0.0052, hole: 0.0024, style: 'plain', open: (f) => !(f & L2), lift: 0.0018 },
  { name: 'L2', kind: 'ring', rod: RR, hb: [rb(2370), rb(2450)], b: rb(2410), phi: ph(315, 2410), r: 0.0068, hole: 0.0048, open: (f) => !!(f & L2) },
  // the bridge: the ring mechanism's lever over the joint, onto the lower joint's
  {
    name: 'bridgeU', kind: 'lever', rod: RR, hb: [rb(2470), rb(2645)], open: (f) => !!(f & L2), lift: 0.0012, at: Lp(rb(2790), -13.5, 8.5),
    extra: (mb) => stem(mb, spline3([rodP(RR, rb(2635)), Lp(rb(2700), -15.6, 6.4), Lp(rb(2760), -14.6, 8.2), Lp(rb(2795), -13.5, 8.8)], 6), 0.0013, 0.0008),
  },
  // the side E♭/B♭ key (the fourth side key): its vent on the right-hand side
  { name: 'seb', kind: 'cup', rod: TR, hb: [rb(2270), rb(2345)], b: rb(2300), phi: -132, r: 0.0038, hole: 0.0017, style: 'plain', closed: true, open: (f) => !!(f & SEB), lift: 0.0016, extra: sideLever(rb(2335), 2915, -4.5) },
  // the C♯/G♯ key: its vent on the right at the joint's foot, its spatula across the front for the
  // left little finger
  {
    name: 'csgs', kind: 'cup', rod: CS, hb: [rb(2600), rb(2752)], b: rb(2668), phi: -102, r: 0.0046, hole: 0.0021, style: 'plain', closed: true, open: (f) => !!(f & LCS), lift: 0.0018,
    extra: (mb) => touch(mb, rodP(CS, rb(2745)), [S(rb(2752), -26, 3.4), S(rb(2755), 6, 3.7), S(rb(2754), 30, 4.0)], [Lp(rb(2752), 12, 14), Lp(rb(2749), 18, 12.2), Lp(rb(2745), 24, 9.6), Lp(rb(2742), 28.5, 7.6)], 0.0046),
  },
  // the lower joint: the bridge's pad (closed through the bridge by the ring mechanism) and its lever
  {
    name: 'bridge', kind: 'cup', rod: LR, hb: [rb(2860), rb(2995)], b: rb(2962), phi: ph(331, 2962), r: 0.006, hole: 0.0028, style: 'plain', open: (f) => !(f & L2), lift: 0.0022,
    extra: (mb) => stem(mb, spline3([rodP(LR, rb(2866)), Lp(rb(2835), -15.4, 7.0), Lp(rb(2806), -14.2, 7.6)], 6), 0.0013, 0.0008),
  },
  // the right hand's three rings
  { name: 'R1', kind: 'ring', rod: LR, hb: [rb(3040), rb(3150)], b: rb(3094), phi: ph(319, 3094), r: 0.0071, hole: 0.005, open: (f) => !!(f & R1) },
  { name: 'R2', kind: 'ring', rod: LR, hb: [rb(3265), rb(3380)], b: rb(3321), phi: ph(319, 3321), r: 0.0071, hole: 0.005, open: (f) => !!(f & R2) },
  { name: 'R3', kind: 'ring', rod: LR, hb: [rb(3450), rb(3580)], b: rb(3519), phi: ph(319, 3519), r: 0.0071, hole: 0.005, open: (f) => !!(f & R3) },
  // the left little finger's E/B and F♯/C♯ touches: long levers from the little fingers' lines, up the
  // left side to their spatulas beside the joint
  { name: 'tE_L', kind: 'lever', rod: LP1, hb: [rb(3005), rb(3400)], open: (f) => !!(f & LE), lift: 0.0026, at: Lp(rb(2800), 14.2, 14.2), extra: (mb) => touch(mb, rodP(LP1, rb(3040)), [Lp(rb(3010), 12.0, 14.6), Lp(rb(2960), 14.4, 13.8)], [Lp(rb(2915), 15.0, 13.6), Lp(rb(2870), 14.6, 14.0), Lp(rb(2820), 14.2, 14.2), Lp(rb(2786), 14.0, 14.2)], 0.0047) },
  { name: 'tFs_L', kind: 'lever', rod: LP2, hb: [rb(3005), rb(3400)], open: (f) => !!(f & LFS), lift: 0.0026, at: Lp(rb(2860), 24.6, 8.2), extra: (mb) => touch(mb, rodP(LP2, rb(3060)), [Lp(rb(3030), 18.6, 10.0), Lp(rb(2985), 23.0, 8.2)], [Lp(rb(2950), 24.4, 8.0), Lp(rb(2905), 24.8, 8.2), Lp(rb(2862), 24.6, 8.2), Lp(rb(2838), 24.4, 8.0)], 0.0043) },
  // the right little finger's touches: across the front to the player's right, round ends outward
  { name: 'tAb', kind: 'lever', rod: LP2, hb: [rb(3600), rb(3690)], open: (f) => !!(f & RAB), lift: 0.0024, at: Lp(rb(3650), -24, 10.4), extra: (mb) => touch(mb, rodP(LP2, rb(3660)), [S(rb(3668), 30, 3.6), S(rb(3672), -2, 3.5), S(rb(3672), -34, 3.6)], [Lp(rb(3672), -12.5, 13.6), Lp(rb(3664), -17.5, 12.2), Lp(rb(3653), -23, 10.6), Lp(rb(3645), -28, 9.2), Lp(rb(3642), -30, 8.6)], 0.0052) },
  { name: 'tF_R', kind: 'lever', rod: LP1, hb: [rb(3625), rb(3715)], open: (f) => !!(f & RF), lift: 0.0024, at: Lp(rb(3680), -14, 18.2), extra: (mb) => touch(mb, rodP(LP1, rb(3700)), [S(rb(3712), 22, 5.4)], [Lp(rb(3716), 2, 20.2), Lp(rb(3704), -4, 20.0), Lp(rb(3690), -10, 19.0), Lp(rb(3676), -16, 17.4), Lp(rb(3668), -19, 16.6)], 0.0052) },
  { name: 'tE_R', kind: 'lever', rod: LP1, hb: [rb(3740), rb(3830)], open: (f) => !!(f & RE), lift: 0.0024, at: Lp(rb(3796), -14, 18.2), extra: (mb) => touch(mb, rodP(LP1, rb(3815)), [S(rb(3828), 22, 5.4)], [Lp(rb(3832), 2, 20.2), Lp(rb(3820), -4, 20.0), Lp(rb(3806), -10, 19.0), Lp(rb(3792), -16, 17.4), Lp(rb(3784), -19, 16.6)], 0.0052) },
  // the G♯/D♯ key (closed-standing), on the right
  { name: 'gsd', kind: 'cup', rod: GR, hb: [rb(3890), rb(3985)], b: rb(3936), phi: -108, r: 0.0054, hole: 0.0025, style: 'plain', closed: true, open: (f) => !!(f & RAB), lift: 0.002 },
  // the low keys' pads: F♯/C♯ (closed by its own touch and, through the crow's foot, by the F and E keys),
  // F/C (and by the E key), E/B
  { name: 'fs', kind: 'cup', rod: FR, hb: [rb(3990), rb(4100)], b: rb(4042), phi: ph(190, 4042), r: 0.0066, hole: 0.0034, style: 'plain', open: (f) => !(f & (LFS | RF | LE | RE)), lift: 0.0028 },
  { name: 'f', kind: 'cup', rod: FR, hb: [rb(4250), rb(4365)], b: rb(4306), phi: 52, r: 0.0068, hole: 0.0036, style: 'plain', open: (f) => !(f & (RF | LE | RE)), lift: 0.0028 },
  { name: 'e', kind: 'cup', rod: FR, hb: [rb(4580), rb(4700)], b: rb(4640), phi: -80, r: 0.007, hole: 0.0038, style: 'plain', open: (f) => !(f & (LE | RE)), lift: 0.003 },
];

/** the keys that never move here: the three trill keys, the slivers, the left F/C and right F♯/C♯
 *  touches the chart leaves alone, the crow's foot */
const FIXED: KeyDef[] = [
  { name: 'tr1', kind: 'cup', rod: TR, hb: [rb(1410), rb(1495)], b: rb(1440), phi: -90, r: 0.0036, hole: 0.0016, style: 'plain', closed: true, open: never, extra: sideLever(rb(1490), 2690, 3.0) },
  { name: 'tr2', kind: 'cup', rod: TR, hb: [rb(1540), rb(1625)], b: rb(1570), phi: -88, r: 0.0036, hole: 0.0016, style: 'plain', closed: true, open: never, extra: sideLever(rb(1620), 2745, 1.0) },
  { name: 'tr3', kind: 'cup', rod: TR, hb: [rb(1745), rb(1830)], b: rb(1780), phi: -92, r: 0.0038, hole: 0.0017, style: 'plain', closed: true, open: never, extra: sideLever(rb(1825), 2830, -1.5) },
  // the E♭/B♭ sliver key on the left, its hook below the second ring
  {
    name: 'sliver', kind: 'lever', rod: SL, hb: [rb(2345), rb(2495)], open: never,
    extra: (mb) => {
      stem(mb, spline3([rodP(SL, rb(2490)), S(rb(2502), 40, 3.4), S(rb(2512), 14, 3.0), S(rb(2508), -6, 2.8)], 6), 0.0012, 0.0007);
      spoon(mb, spline3([S(rb(2508), -6, 2.8), S(rb(2500), -14, 2.6), S(rb(2488), -16, 2.5)], 4), 0.0017);
    },
  },
  // the B/F♯ sliver between the second and third rings of the right hand
  {
    name: 'sliverR', kind: 'lever', rod: LR, hb: [rb(3395), rb(3435)], open: never,
    extra: (mb) => {
      stem(mb, spline3([rodP(LR, rb(3415)), S(rb(3418), -40, 3.0), S(rb(3420), -24, 2.6)], 5), 0.0011, 0.0007);
      spoon(mb, spline3([S(rb(3420), -24, 2.6), S(rb(3419), -14, 2.4), S(rb(3414), -2, 2.3)], 5), 0.0018);
    },
  },
  // the left F/C touch (between the left E/B and F♯/C♯) and the right F♯/C♯ touch
  { name: 'tF_L', kind: 'lever', rod: LP2, hb: [rb(3410), rb(3500)], open: never, extra: (mb) => touch(mb, rodP(LP2, rb(3440)), [Lp(rb(3380), 18.8, 9.4), Lp(rb(3200), 21.4, 6.8), Lp(rb(3080), 22.6, 5.0)], [Lp(rb(3035), 23.2, 4.6), Lp(rb(2990), 23.8, 4.4), Lp(rb(2945), 24.0, 4.2), Lp(rb(2912), 23.8, 4.0)], 0.0042) },
  { name: 'tFs_R', kind: 'lever', rod: LP2, hb: [rb(3720), rb(3810)], open: never, extra: (mb) => touch(mb, rodP(LP2, rb(3775)), [S(rb(3783), 30, 3.6), S(rb(3787), -2, 3.5), S(rb(3787), -34, 3.6)], [Lp(rb(3787), -12.5, 13.6), Lp(rb(3779), -17.5, 12.2), Lp(rb(3768), -23, 10.6), Lp(rb(3760), -28, 9.2), Lp(rb(3757), -30, 8.6)], 0.0052) },
  // the long tubes of the little fingers' lines between the keys on them
  { name: 'lp1a', kind: 'lever', rod: LP1, hb: [rb(3420), rb(3615)], open: never },
  { name: 'lp1b', kind: 'lever', rod: LP1, hb: [rb(3840), rb(4125)], open: never },
  { name: 'lp2a', kind: 'lever', rod: LP2, hb: [rb(3510), rb(3590)], open: never },
  { name: 'lp2b', kind: 'lever', rod: LP2, hb: [rb(3820), rb(4125)], open: never },
  // the low keys' line between its keys
  { name: 'fr1', kind: 'lever', rod: FR, hb: [rb(4110), rb(4240)], open: never },
  {
    name: 'fr2', kind: 'lever', rod: FR, hb: [rb(4375), rb(4570)], open: never,
    // the crow's foot: the low keys' clutch across the front to the F key's arm, its adjusting screw
    extra: (mb) => {
      const bb = rb(4562);
      sweep(mb, Array.from({ length: 11 }, (_, i) => S(bb, lerp(-8, 60, i / 10), lerp(3.6, 2.6, Math.min(1, (2 * i) / 10)) + 0.3 * Math.sin((Math.PI * i) / 10))), OUT, (f) => 0.0013 + 0.0005 * Math.max(0, 1 - f / 0.2), () => 0.0006, AG, 12, 3);
      const e = S(bb, 60, 2.6);
      mb.with(frameY(e, OUT(e)), () => {
        revolve(mb, fillet([[0, -0.0006], [0.0009, -0.0006], [0.0009, 0.0008], [0, 0.0009]], [0, 0.0001, 0.0003, 0], 2), 16, AG);
        mb.quad([-0.0008, 0.00091, -0.0001], [-0.0008, 0.00091, 0.0001], [0.0008, 0.00091, 0.0001], [0.0008, 0.00091, -0.0001], DARK);
      });
    },
  },
  // the trill keys' line between its keys
  { name: 'tr4', kind: 'lever', rod: TR, hb: [rb(1840), rb(2260)], open: never },
  { name: 'rg2', kind: 'lever', rod: RG, hb: [rb(1650), rb(1975)], open: never },
];
const ALL = [...KEYS, ...FIXED];

/** the thumb rest on the back of the lower joint: a base screwed to the wood, a hook for the right thumb */
function thumbRest(mb: MeshBuilder): void {
  const Cf = cupFrame(rb(3150), 180, 0.0);
  mb.with(Cf, () => {
    revolve(mb, fillet([[0, 0.0011], [0.0062, 0.0009], [0.0067, 0.0002], [0.0063, -0.0006], [0, -0.0006]], [0, 0.003, 0.0004, 0.0003, 0], 4), 36, AG);
    for (const x of [-0.0041, 0.0041]) {
      mb.with(translate(x, 0.0011, 0), () => revolve(mb, fillet([[0, 0.0003], [0.001, 0.0002], [0.001, 0], [0, 0]], [0, 0.0002, 0, 0], 2), 16, AG));
      mb.quad([x - 0.0008, 0.00142, -0.00012], [x - 0.0008, 0.00142, 0.00012], [x + 0.0008, 0.00142, 0.00012], [x + 0.0008, 0.00142, -0.00012], DARK);
    }
  });
  // the hook: up off the plate, over towards the bell
  const hook = spline3([xform(Cf, [-0.0025, 0.001, 0]), xform(Cf, [-0.0008, 0.005, 0]), xform(Cf, [0.003, 0.0078, 0]), xform(Cf, [0.0085, 0.0083, 0]), xform(Cf, [0.0125, 0.0068, 0])], 7);
  const c = xform(Cf, [0.003, 0.0035, 0]);
  sweep(mb, hook, (p) => sub(p, c), () => 0.0048, () => 0.00075, AG, 18, 3);
}

// ================================================================ the model
export interface ClarinetKey {
  name: string;
  kind: 'cup' | 'lever' | 'ring';
  closed: boolean;
  /** a cup: open for these fingers; a touch or ring: pressed */
  open: (f: number) => boolean;
  mesh: Mesh;
  /** its rod line (a point and the unit direction), and the turn that opens or presses it */
  p0: Vec3;
  u: Vec3;
  sign: number;
  maxAng: number;
}
export interface ClarinetModel {
  T: Mat4;
  statics: Mesh[];
  /** the bell: its ring, flare, rim and throat */
  bell: Mesh;
  keys: ClarinetKey[];
  /** the reed's tip, in pieces that curl onto the lay (each turns about its own hinge line, b mm from
   *  the tip, on the table) */
  reed: { mesh: Mesh; b: number }[];
  bounds: { c: Vec3; r: number };
  /** the tone holes the keys and fingers cover (model x) and their names */
  holes: { x: number; name: string }[];
}

/** a key's piece, built at rest (a cup on its hole, a touch at rest, a ring up off its hole) */
function keyPiece(mb: MeshBuilder, k: KeyDef): void {
  if (k.axis) crossHinge(mb, k.axis.a, k.axis.c);
  else hinge(mb, k.rod, k.hb[0], k.hb[1]);
  if (k.b !== undefined && k.kind === 'cup') {
    const Cf = cupFrame(k.b, k.phi!);
    cup(mb, Cf, k.style ?? 'plain', k.r!);
    const hbArm = Math.max(k.hb[0] + 2, Math.min(k.hb[1] - 2, k.b));
    const dphi = Math.abs(((k.rod.phi - k.phi! + 540) % 360) - 180);
    if (!k.noArm) arm(mb, Cf, k.r!, rodP(k.rod, hbArm), k.b, k.phi!, dphi > 60 ? 3.6 : 3.0);
  } else if (k.b !== undefined && k.kind === 'ring') {
    ringBand(mb, k.b, k.phi!, k.r!, RING_W, RING_LIFT);
    // its arm: from the hinge tube level with it, round the tube to the band's side
    const hbArm = Math.max(k.hb[0] + 2, Math.min(k.hb[1] - 2, k.b));
    const from = rodP(k.rod, hbArm);
    const [, fphi] = placeOf(from);
    const sg = Math.sign(fphi - k.phi!) || 1;
    const edge = wrapped(k.b, k.phi!, k.r! - RING_W * 0.3, (sg * Math.PI) / 2, RING_LIFT + 0.2);
    const [eb, ephi] = placeOf(edge);
    const mid = S(lerp(placeOf(from)[0], eb, 0.5), lerp(fphi, ephi, 0.5), RING_LIFT + 1.6);
    sweep(mb, spline3([from, mid, edge], 7), OUT, (f) => 0.00105 + 0.0004 * f, () => 0.00052, AG, 12, 3);
  }
  k.extra?.(mb);
}
/** a hinge tube across the tube (the A key's), from a to c, its posts under both ends */
function crossHinge(mb: MeshBuilder, a: Vec3, c: Vec3): void {
  const L = len3(sub(c, a));
  mb.with(frameY(a, sub(c, a)), () => revolve(mb, fillet([[0, 0], [0.0016, 0], [0.0016, L], [0, L]], [0, 0.0004, 0.0004, 0], 3), 18, AG));
  for (const p of [a, c]) {
    const [pb, pphi] = placeOf(p);
    const base = S(pb, pphi, -0.25);
    const Lp2 = len3(sub(p, base));
    mb.with(frameY(base, sub(p, base)), () => revolve(mb, fillet([[0, 0], [0.003, 0], [0.003, 0.00045], [0.0018, 0.0011], [0.0014, Lp2 - 0.0012], [0.0018, Lp2 - 0.0006]], [0, 0, 0.0004, 0.0006, 0.0006, 0], 3), 20, AG));
    ellipsoid(mb, p, [0.0021, 0.0021, 0.0021], 18, AG);
  }
}
/** a ring's band width and how far it stands off the wood at rest (it is pressed flush) */
const RING_W = 0.0016;
const RING_LIFT = 1.5;

/** where the model stands: held as a player holds it, the mouthpiece up and back towards the player,
 *  the bell down and out towards the audience, the rings turned to the audience */
export const CLARINET_POSE = { tilt: 56, lean: 0.18, turn: 14, swing: 0.45, y: 0.3 };

export function buildClarinetModel(): ClarinetModel {
  const mb = new MeshBuilder();
  mouthpiece(mb);
  ligature(mb);
  reedPiece(mb, LAY, REED_L);
  body(mb);
  for (const k of ALL) if (k.b !== undefined) toneHole(mb, k.b, k.phi!, k.hole!, k.kind === 'ring' ? 0.0005 : 0.0008);
  for (const h of PLAIN) toneHole(mb, h.b, h.phi, h.hole, 0.0011);
  for (const r of RODS) {
    for (const b of r.posts) post(mb, r, b);
    steel(mb, r);
  }
  for (const [r, p, c] of NEEDLES) needle(mb, r, p, c);
  for (const k of FIXED) keyPiece(mb, k);
  thumbRest(mb);
  // the keys that move: each its own piece, turning about its rod line
  const keys: ClarinetKey[] = KEYS.map((k) => {
    const kb = new MeshBuilder();
    keyPiece(kb, k);
    const p0 = k.axis ? k.axis.a : rodP(k.rod, k.rod.b0);
    const u = norm(k.axis ? sub(k.axis.c, k.axis.a) : sub(rodP(k.rod, k.rod.b1), p0));
    const ref = k.at ?? (k.kind === 'ring' ? P(k.b!, k.phi!, rOut(k.b!) + RING_LIFT) : xform(cupFrame(k.b!, k.phi!), [0, 0, 0]));
    // which way it turns: a cup opens away from the tube, a touch or a ring is pressed towards it
    const q = xform(aboutAxis(new Float32Array(16), p0, u, 0.05), ref);
    const out = Math.hypot(q[1], q[2]) > Math.hypot(ref[1], ref[2]);
    const sign = (k.kind === 'cup') === out ? 1 : -1;
    const d = sub(ref, p0);
    const armL = len3(sub(d, scale(u, dot(d, u))));
    const travel = k.lift ?? (k.kind === 'ring' ? (RING_LIFT - 0.15) * mm : 0.0016);
    return { name: k.name, kind: k.kind, closed: !!k.closed, open: k.open, mesh: kb.build(), p0, u, sign, maxAng: travel / Math.max(0.002, armL) };
  });
  // the reed's tip pieces
  const reed = REED_CUTS.slice(0, -1).map((b0, i) => {
    const rb = new MeshBuilder();
    reedPiece(rb, b0, REED_CUTS[i + 1]);
    return { mesh: rb.build(), b: REED_CUTS[i + 1] };
  });
  const { tilt, lean, turn, swing, y } = CLARINET_POSE;
  const T = chain(translate(0, y, 0.02), rotY(swing), rotX(lean), rotZ(-deg(90 - tilt)), rotX(-Math.PI / 2 + deg(turn)), translate(-CLARINET_LEN / 2, 0, 0));
  const holes = [...ALL.filter((k) => k.b !== undefined).map((k) => ({ x: X(k.b!), name: k.name })), ...PLAIN.map((h) => ({ x: X(h.b), name: h.name }))].sort((a, b) => a.x - b.x);
  return { T, statics: [mb.build()], bell: bellMesh(), keys, reed, bounds: { c: xform(T, [CLARINET_LEN / 2, 0, 0]), r: 0.37 }, holes };
}

// ================================================================ posing
interface ClarinetPose {
  pos: Float32Array;
  vel: Float32Array;
  /** seconds since the clarinet last sounded */
  quiet: number;
  /** the reed's opening, eased (1 at rest) */
  open: number;
  R: Float32Array;
  R2: Float32Array;
  W: Float32Array;
}
/** each seat's own springs (the shared WindPose carries the flute's and the trumpet's) */
const poses = new WeakMap<WindPose, ClarinetPose>();
function clarinetPose(pose: WindPose, cm: ClarinetModel): ClarinetPose {
  let p = poses.get(pose);
  if (!p || p.pos.length !== cm.keys.length) {
    const pos = Float32Array.from(cm.keys, (k) => (k.kind === 'cup' && k.open(0) ? 1 : 0));
    p = { pos, vel: new Float32Array(cm.keys.length), quiet: 10, open: 1, R: new Float32Array(16), R2: new Float32Array(16), W: new Float32Array(16) };
    poses.set(pose, p);
  }
  return p;
}
/** tests: a clarinet's springs as posed (1 open / pressed) */
export const clarinetKeyState = (pose: WindPose): Float32Array | null => poses.get(pose)?.pos ?? null;

export function poseClarinet(b: Batch, cm: ClarinetModel, fr: VisualFrame | null, pose: WindPose, dt: number, now: number, rms: number): void {
  const T = cm.T;
  const st = clarinetPose(pose, cm);
  for (const s of cm.statics) b.mesh(s, T);
  const br = fr?.breath;
  const blow = br ? br.pressure : 0;
  const focus = fr?.focus ?? null;
  // the fingers for the note the engine plays, held while it sounds and for a moment after
  st.quiet = blow > 0.015 ? 0 : Math.min(9, st.quiet + dt);
  const midi = focus && st.quiet < 0.8 ? (focus.midi ?? null) : null;
  const fingers = midi === null ? 0 : clarinetFingersFor(midi);
  const lvl = Math.min(1, Math.sqrt(rms) * 3);
  // the rings and keys, each turned on its rod to where its spring has it: drawn as built, with no light
  // on them
  for (let i = 0; i < cm.keys.length; i++) {
    const k = cm.keys[i];
    const p = springTo(st.pos, st.vel, i, k.open(fingers) ? 1 : 0, dt, 26, 0.62);
    aboutAxis(st.R, k.p0, k.u, k.sign * k.maxAng * p);
    mulInto(st.W, 0, T, st.R);
    b.mesh(k.mesh, st.W);
  }
  // the reed: its tip curls onto the lay as it closes (blown shut once a cycle when loud), and shimmers
  const want = fr?.reed ? Math.min(1.3, fr.reed.open) : 1;
  st.open += (want - st.open) * (1 - Math.exp(-dt / 0.05));
  const f1 = focus?.f1 ?? 0;
  const shim = blow > 0.02 ? 0.04 * lvl * Math.sin(now * 0.001 * Math.min(f1, 16) * TAU) : 0;
  const c = Math.max(-0.3, Math.min(1, 1 - st.open + shim));
  // each piece turns about its hinge line (on the table, across the reed) by the lay's slope there,
  // scaled by how far the reed has closed: chained from the heel towards the tip
  st.W.set(T);
  let prev = LAY;
  for (let i = cm.reed.length - 1; i >= 0; i--) {
    const pc = cm.reed[i];
    const b0 = i > 0 ? cm.reed[i - 1].b : 0;
    // the lay's slope over this piece (rad), less the slope already turned by the pieces behind it
    const slope = (layAt(b0) - layAt(pc.b)) / (pc.b - b0);
    const behind = i < cm.reed.length - 1 ? (layAt(pc.b) - layAt(prev)) / (prev - pc.b) : 0;
    aboutAxis(st.R, [X(pc.b), -TAB * mm, 0], [0, 0, 1], -c * (slope - behind));
    mulInto(st.R2, 0, st.W, st.R);
    st.W.set(st.R2);
    b.mesh(pc.mesh, st.W);
    prev = pc.b;
  }
  // the bell as it is, sounding or not: no light on it
  b.mesh(cm.bell, T);
  // the breath into the mouthpiece's tip while the note is blown, as on the brass (the tip is the model's x = 0)
  if (blow > 0.02) breathIn(b, T, [0, 0, 0], [-1, 0, 0], [0, 0, 1], Math.min(1, 0.35 + lvl) * (0.7 + 0.3 * Math.min(1, st.open)), now);
}

/** tests: the measures the model is built to (mm from the mouthpiece's tip) */
export const CLARINET_MEASURES = {
  mouthpiece: MPE,
  barrel: [BAR0, BAR1] as const,
  upper: [UJ0, UJ1] as const,
  lower: [LJ0, LJ1] as const,
  bell: [BE0, BE1] as const,
  ligature: [LIG0, LIG1] as const,
  reed: { length: REED_L, tipWidth: 2 * REED_W(0) },
  /** the reed's tip off the tip rail at rest, and the table's distance behind the axis */
  tipOpening: TIPO,
  table: TAB,
};
