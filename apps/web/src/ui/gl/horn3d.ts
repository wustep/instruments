// The horn in 3D: a full double horn in F and B♭ of the Kruspe pattern (the Conn 8D, Holton H179, Hans
// Hoyer 6801 class), built once and posed from the live state. Real scale (docs/3d-reference.md, "Horn"),
// laid out from BenP's photographs of a Besson BE702 Kruspe double horn seen from both sides and Hk kng's
// numbered drawing of it, the bell's rim as the scale (311 mm: the Conn 8D's and the H179's 12¼″, the
// Hoyer 6801's 310 mm); the coil then measures 0.31–0.32 m across, as the photographs of Yamaha's YHR-667V
// and the others show it:
//
//   the leadpipe: from the receiver (a nickel-silver sleeve) down the lever side, tapering out from Ø 10.5
//     to the main bore (0.468″ = 11.9 mm, tubing Ø 13), into its own wrap inside the coil and round it to
//     the change valve; the mouthpiece (a deep funnel cup, a Denis Wick 7N's proportions, 82 mm, 25 of
//     them in the receiver);
//   four rotary valves in a column (the thumb's change valve nearest the leadpipe, then the first, second
//     and third), casings Ø 25.4 with their caps: on the audience's side the bottom caps, domed with a
//     button; on the player's side the bearing plates, the stop plates with two rubber bumpers each, and
//     the rotors' spindles turning their stop arms and their cranks; each finger valve with two slides,
//     the F horn's in front and the B♭ horn's behind (nickel-silver outer tubes, brass crooks, ferrules);
//   the F horn's long tuning loop and the B♭ horn's short slide off the change valve; the main (general)
//     slide with its water key; the bell branch: the bell tail wound once and a little more round the
//     outside of the coil, widening as a Bessel horn (r ∝ (x + 22 mm)^−0.75 to the rim: Ø 86 at 10 cm
//     from the rim, as the photograph measures), out of the coil into the bell, its rim rolled over a bead
//     wire to Ø 311;
//   the levers: four spatulas on an axle with coil springs, the thumb's for the change valve, their arms
//     driving the rotors' cranks through ball-jointed links (mechanical linkage: a four-bar each, solved
//     so a lever's 10.7 mm of travel turns its rotor a quarter turn); the finger hook, the hand rest (the
//     "duck foot") on the leadpipe, braces soldered with their feet.
//
// Live: the fingering of the engine's note (hornFingering, the engine's own: the F side to C4, the B♭
// side from C♯4) presses the levers on springs (a tiny bounce off their stops), the linkages turning the
// rotors a quarter turn; they spring back a moment after the note stops. While it sounds the bore glows
// faintly along the air's own path (the side and the valves pressed choose it: through the pressed
// valves' slides, not the others), with the standing wave the engine computes (lips → bell); the lips
// buzz at the mouthpiece's rim with their opening (`fr.lips`); the bell's mouth shimmers with the level.
// Approximations: the plumbing inside the valve cluster (the rotors' passages, the knuckles) is not traced
// tube by tube, and the slides' lengths are the photographs' shapes (each within a fifth of the valve's
// own lengthening; the open F path is 3.74 m); the player's right hand in the bell is left out (a hand
// that reads as a hand needs a rigged, skinned model the stage does not have).
import { hornFingering, type HornFingering, type VisualFrame } from '@piano-model/engine';
import { INK } from '../stage-draw.ts';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, add, chain, cross, dot, ink, mulInto, norm, rotX, rotY, rotZ, scale, scaleM, sub, translate, xform } from './gl3d.ts';
import { M, MeshBuilder, cyl, ellipsoid, grid, variant, type Mat } from './mesh.ts';
import { aboutAxis, fillet, frameY, revolve, springTo } from './oboe3d.ts';
import type { WindPose } from './winds3d.ts';

type P2 = [number, number];
const TAU = Math.PI * 2;
const mm = 0.001;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- materials
/** lacquered yellow brass, handled (uv.y: where hands touch it, fingerprints in its coat) */
const BR = M.hornBrass;
/** the bell: burnished brass under a hard lacquer */
const BELL = M.brassBell;
const NS = M.nickelSilver;
const NSS = M.nickelSatin;
const STEEL = M.steel;
const BORE = M.boreDark;
const AG = M.silverPolish;
const RUBBER = M.rubber;
const PAD = M.ebonite;
const CORK = M.cork;
const FELT = M.valveFelt;

// ---------------------------------------------------------------- small helpers
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** a point of the drawing frame, mm → m (the true horn: x right and y up as the player-side photograph
 *  shows it, the bell to the right, z towards the player) */
const V = (x: number, y: number, z: number): Vec3 => [x * mm, y * mm, z * mm];
/** the stage's world is mirrored in x (three3d.ts), so the model is built as its mirror image (z
 *  flipped) to be seen true: everything is drawn in the true frame inside FLIP, and a point or an axis
 *  of the true frame is F3 of it in the model */
const FLIP = scaleM(1, 1, -1);
const F3 = (p: Vec3): Vec3 => [p[0], p[1], -p[2]];
/** a mesh built in the true frame: flipped, its triangles' winding turned back (a mirror image's faces
 *  would face inwards) */
function make(f: (mb: MeshBuilder) => void): Mesh {
  const mb = new MeshBuilder();
  mb.with(FLIP, () => f(mb));
  const m = mb.build();
  const d = m.data;
  const L = m.loc;
  const ids = m.mats;
  for (let t = 0; t < m.count; t += 3) {
    const a = (t + 1) * 14;
    const b = (t + 2) * 14;
    for (let k = 0; k < 14; k++) {
      const v = d[a + k];
      d[a + k] = d[b + k];
      d[b + k] = v;
    }
    if (L)
      for (let k = 0; k < 3; k++) {
        const v = L[(t + 1) * 3 + k];
        L[(t + 1) * 3 + k] = L[(t + 2) * 3 + k];
        L[(t + 2) * 3 + k] = v;
      }
    if (ids) {
      const v = ids[t + 1];
      ids[t + 1] = ids[t + 2];
      ids[t + 2] = v;
    }
  }
  return m;
}

/** a 3D polyline bent round its corners (a bend radius per corner, mm points and radii), as tubing is */
function bend(pts: Vec3[], rad: number | number[], n = 14): Vec3[] {
  const out: Vec3[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const r = typeof rad === 'number' ? rad : rad[i - 1];
    const A = pts[i - 1];
    const B = pts[i];
    const C = pts[i + 1];
    const l1 = len3(sub(A, B));
    const l2 = len3(sub(C, B));
    const u = norm(sub(A, B));
    const v = norm(sub(C, B));
    const th = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
    if (r <= 0 || th > Math.PI - 1e-3 || th < 1e-3) {
      out.push(B);
      continue;
    }
    const d = Math.min(r / Math.tan(th / 2), (i - 1 === 0 ? 0.98 : 0.5) * l1, (i + 1 === pts.length - 1 ? 0.98 : 0.5) * l2);
    const rr = d * Math.tan(th / 2);
    const t1 = add(B, scale(u, d));
    const c = add(B, scale(norm(add(u, v)), rr / Math.sin(th / 2)));
    const e1 = norm(sub(t1, c));
    const e2 = norm(sub(add(B, scale(v, d)), c));
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(e1, e2))));
    const w = norm(sub(e2, scale(e1, dot(e1, e2))));
    const k0 = Math.max(4, Math.round((n * ang) / (Math.PI / 2)));
    for (let k = 0; k <= k0; k++) {
      const a = (ang * k) / k0;
      out.push(add(c, add(scale(e1, rr * Math.cos(a)), scale(w, rr * Math.sin(a)))));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
/** a cubic Bézier from p0 (leaving along t0) to p1 (arriving along t1), k points */
function bezier(p0: Vec3, t0: Vec3, p1: Vec3, t1: Vec3, k: number): Vec3[] {
  const L = len3(sub(p1, p0));
  const c0 = add(p0, scale(norm(t0), L * 0.38));
  const c1 = sub(p1, scale(norm(t1), L * 0.38));
  return Array.from({ length: k + 1 }, (_, i) => {
    const t = i / k;
    const u = 1 - t;
    return [0, 1, 2].map((j) => u * u * u * p0[j] + 3 * u * u * t * c0[j] + 3 * u * t * t * c1[j] + t * t * t * p1[j]) as Vec3;
  });
}
/** a polyline cut so no piece is longer than `step` (straight runs keep their ends) */
function refine(pts: Vec3[], step: number): Vec3[] {
  const out: Vec3[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const n = Math.max(1, Math.ceil(len3(sub(b, a)) / step));
    for (let k = 1; k <= n; k++) out.push(lerp3(a, b, k / n));
  }
  return out;
}
const arcLen = (p: Vec3[]) => {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += len3(sub(p[i], p[i - 1]));
  return s;
};
const mmPts = (p: Vec3[]) => p.map((q) => V(q[0], q[1], q[2]));

/** A round tube along a path (m), its outer radius by arc length (m from the start, and the fraction),
 *  swept with rotation-minimising frames (no twist where the path turns vertical), its normals tilted
 *  where it widens; `hand`: how handled it is along it (fingerprints), `caps` its ends closed */
function tubeAlong(mb: MeshBuilder, path: Vec3[], r: (s: number, f: number) => number, m: Mat, seg = 24, opt: { hand?: (f: number) => number; cap0?: boolean; cap1?: boolean } = {}): void {
  const N = path.length;
  if (N < 2) return;
  const acc = [0];
  for (let i = 1; i < N; i++) acc.push(acc[i - 1] + len3(sub(path[i], path[i - 1])));
  const tot = acc[N - 1] || 1;
  const T = path.map((_, i) => norm(sub(path[Math.min(N - 1, i + 1)], path[Math.max(0, i - 1)])));
  // double reflection (Wang et al. 2008)
  const U: Vec3[] = [];
  let u0 = cross(T[0], Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]);
  u0 = norm(cross(u0, T[0]));
  U.push(u0);
  for (let i = 0; i < N - 1; i++) {
    const v1 = sub(path[i + 1], path[i]);
    const c1 = dot(v1, v1) || 1e-18;
    const rL = sub(U[i], scale(v1, (2 / c1) * dot(v1, U[i])));
    const tL = sub(T[i], scale(v1, (2 / c1) * dot(v1, T[i])));
    const v2 = sub(T[i + 1], tL);
    const c2 = dot(v2, v2);
    const r1 = c2 < 1e-18 ? rL : sub(rL, scale(v2, (2 / c2) * dot(v2, rL)));
    U.push(norm(sub(r1, scale(T[i + 1], dot(r1, T[i + 1])))));
  }
  const R = acc.map((s) => r(s, s / tot));
  const rings: { p: Vec3; n: Vec3 }[][] = [];
  for (let i = 0; i < N; i++) {
    const t = T[i];
    const u = U[i];
    const s = cross(t, u);
    const dr = (R[Math.min(N - 1, i + 1)] - R[Math.max(0, i - 1)]) / Math.max(1e-9, acc[Math.min(N - 1, i + 1)] - acc[Math.max(0, i - 1)]);
    const ring: { p: Vec3; n: Vec3 }[] = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * TAU;
      const rad = add(scale(s, Math.cos(a)), scale(u, Math.sin(a)));
      ring.push({ p: add(path[i], scale(rad, R[i])), n: norm(sub(rad, scale(t, dr))) });
    }
    rings.push(ring);
  }
  const UV = (i: number): [number, number] => [0, opt.hand ? opt.hand(acc[i] / tot) : 0];
  for (let i = 0; i < N - 1; i++)
    for (let k = 0; k < seg; k++) {
      const a = rings[i][k];
      const b = rings[i + 1][k];
      const c = rings[i + 1][k + 1];
      const d = rings[i][k + 1];
      mb.stri(a.p, b.p, c.p, a.n, b.n, c.n, m, UV(i), UV(i + 1), UV(i + 1));
      mb.stri(a.p, c.p, d.p, a.n, c.n, d.n, m, UV(i), UV(i + 1), UV(i));
    }
  const capAt = (i: number, sg: 1 | -1) => {
    const nn = scale(T[i], sg);
    for (let k = 0; k < seg; k++) {
      if (sg > 0) mb.stri(path[i], rings[i][k].p, rings[i][k + 1].p, nn, nn, nn, m);
      else mb.stri(path[i], rings[i][k + 1].p, rings[i][k].p, nn, nn, nn, m);
    }
  };
  if (opt.cap0) capAt(0, -1);
  if (opt.cap1) capAt(N - 1, 1);
}
/** a solid of revolution about the axis through p along `dir` (profile [radius, along], m) */
const latheOn = (mb: MeshBuilder, p: Vec3, dir: Vec3, prof: P2[], seg: number, m: Mat) => mb.with(frameY(p, dir), () => revolve(mb, prof, seg, m));
/** a ferrule (a sleeve soldered over a joint, a bead at each end) round a tube of radius r at p along dir, mm */
function ferrule(mb: MeshBuilder, p: Vec3, dir: Vec3, r: number, L: number, m: Mat = NS): void {
  const h = (L / 2) * mm;
  const R = r * mm;
  latheOn(mb, p, dir, fillet([[R - 0.0002, -h], [R + 0.0009, -h + 0.0002], [R + 0.0009, -h + 0.0011], [R + 0.0005, -h + 0.0015], [R + 0.0005, h - 0.0015], [R + 0.0009, h - 0.0011], [R + 0.0009, h - 0.0002], [R - 0.0002, h]] as P2[], 0.00025, 2), 32, m);
}
/** a brace between two tubes' surfaces: a rod with a flared foot soldered on at each end (mm) */
function brace(mb: MeshBuilder, a: Vec3, b: Vec3, r = 1.6, m: Mat = BR): void {
  const A = V(...a);
  const B = V(...b);
  const d = norm(sub(B, A));
  cyl(mb, A, B, r * mm, r * mm, 14, m, false);
  for (const [P, s] of [[A, 1], [B, -1]] as const) latheOn(mb, P, scale(d, s), fillet([[0, -0.0005], [r * mm + 0.0024, -0.0004], [r * mm + 0.0019, 0.0006], [r * mm, 0.0028], [0, 0.0028]] as P2[], [0, 0.0006, 0.001, 0.0005, 0], 3), 18, m);
}

// ================================================================ the horn's measures (mm, the true frame)
/** the main bore 0.468″ (Conn 8D, Holton H179, Hoyer 6801: 11.9 mm); the tubing's outside radius */
export const HORN_BORE = 11.9;
const RT = 6.5;
/** a slide's outer (sliding) tubes, nickel silver */
const RS = 7.15;
/** the rotors: the column's x, each one's y (the change valve, then the first, second, third), the
 *  casing's radius and its half height along the rotor's axis (z) */
const XR = -48;
const YR = [62, 26, -10, -46];
const RC = 12.7;
const HC = 21;
/** the valves' two levels: the F horn's slides behind (the player's side, under the F loop), the B♭
 *  horn's in front (the audience's) */
const ZF = 11;
const ZB = -11;
/** the bell: its rim (outer Ø 311 mm with its bead: Conn 8D, Holton H179 12¼″; Hoyer 6801 310), its
 *  centre and axis; the Bessel flare r(x) = b / (x + X0)^EPS, x mm from the rim along the bell's axis */
export const BELL_RIM = 311;
const BEAD = 2.6;
const X0 = 22;
const EPS = 0.75;
const BB = (BELL_RIM / 2 - BEAD) * X0 ** EPS;
/** the bell's outer radius (mm) at x mm from the rim along its centre line */
export const bellR = (x: number) => BB / (Math.max(0, x) + X0) ** EPS;
const RIM_C: Vec3 = [317, -17, 97];
const AXIS: Vec3 = norm([Math.cos(27 * DEG) * Math.cos(20 * DEG), Math.sin(27 * DEG) * Math.cos(20 * DEG), Math.sin(20 * DEG)]);
/** the straight part of the bell before the rim (lathed about the axis) */
const STRAIGHT = 290;
/** the bell branch's wrap: a spiral round the outside of the coil, from where the main slide joins it
 *  (θ0, solved below so the B♭ horn's open path is 2.80 m) round once and a little more to θ1, where it
 *  leaves the coil for the bell; its radius and its z by θ (degrees, counter-clockwise from +x) */
const TH1 = 615;
const smooth01 = (t: number) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};
/** (round at r 146 most of the way, inside where it begins and out where its last turn passes over its
 *  first: the coil 0.31 m across, as the photographs measure it) */
const spR = (th: number) => 134 + 12 * smooth01((th - 236) / 54) + 6 * smooth01((th - 560) / 55);
const spZ = (th: number) => lerp(-7, 7, (th - 200) / (TH1 - 200));
const spP = (th: number): Vec3 => [spR(th) * Math.cos(th * DEG), spR(th) * Math.sin(th * DEG), spZ(th)];
/** the leadpipe's own wrap inside the coil, behind the valves' F level */
const RL = 104;
const ZL = -4;
const LTH0 = 214;
const LTH1 = 396;
/** the F horn's and the B♭ horn's open tubes (Fletcher & Rossing §14.6; the engine's HORN_F_LENGTH and
 *  HORN_BB_LENGTH), mm: the routes are solved to them */
const F_LEN = 3740;
const BB_LEN = 2800;
/** the receiver's end, the leadpipe's direction (down the lever side), where its straight run ends */
const RCV: Vec3 = [-104, 192, 16];
const LP_DIR: Vec3 = norm([-0.164, -0.986, 0]);
const LP1: Vec3 = add(RCV, scale(LP_DIR, 146));
/** the mouthpiece: 82 mm, 25 of them in the receiver (Denis Wick 7N's proportions, rim Ø 25) */
const MP_LEN = 82;
const MP_IN = 25;
/** the levers: their axle (along y) at x, z; each lever's hub y (its rotor's), its spatula's y; the
 *  spatula's arm out from the axle (−x), the lever's crank arm up from it (+z, to its link) */
const XA = -82;
const ZA = 30;
const PAD_Y = [45, 14, -9, -32];
const ARM = 38;
const CRANK_UP = 19;
/** a rotor's crank: its radius, its hub's z, its rest angle (degrees: the ball up and away from the
 *  levers; the link pulls it round a quarter turn anticlockwise as the player sees it) */
const RCK = 3.8;
const ZK = 29.5;
const CK0 = 45;
/** a lever's full travel (deg): what turns its rotor a quarter turn through the linkage (solved below) */
export let LEVER_TRAVEL = 18;

// ================================================================ routes: the tubing as centre lines
/** a tube of the horn: its centre line (mm), its outer radius (mm) by arc length (mm) along it, its
 *  material, and whether it is part of the bore (for the glow): `bore` names it in the air's path */
interface Route {
  name: string;
  pts: Vec3[];
  r: (s: number, L: number) => number;
  m: Mat;
  bore: boolean;
  /** how handled (fingerprints: 0 … 1) along it */
  hand?: (f: number) => number;
  seg?: number;
}
const rConst = (r: number) => () => r;

/** the slides of the finger valves: two parallel legs off the rotor's casing (towards +x, at the
 *  valve's F or B♭ level), following a centre line bent through the coil's free space as the photographs'
 *  slides are (the third valve's S-shaped down round the coil's foot), a crook at the end. The straight
 *  run before the crook is solved so each slide lengthens the tube as its valve should: the second a
 *  semitone, the first a tone, the third three semitones (2^(n/12) − 1 of the side's open tube) */
interface SlideDef {
  valve: 1 | 2 | 3;
  side: 'F' | 'Bb';
  /** the centre line's corners after the port (x, y, mm) and their bend radii; the last run is solved */
  path: P2[];
  radii: number[];
  /** the last run's length (mm, solved), and the most it may be (inside the coil) */
  run?: number;
  max: number;
}
const SEMIS = [0, 2, 1, 3];
const slideTarget = (d: SlideDef) => (d.side === 'F' ? F_LEN : BB_LEN) * (2 ** (SEMIS[d.valve] / 12) - 1);
const X_PORT = XR + RC - 1;
const SLIDES: SlideDef[] = [
  // the first valve's: the F slide out and round up over itself, back towards the column; the B♭ slide
  // out and down past the second's crook
  { valve: 1, side: 'F', path: [[78, 26], [78, 58], [40, 58]], radii: [15, 15], max: 56 },
  { valve: 1, side: 'Bb', path: [[66, 26], [66, 10]], radii: [16], max: 40 },
  { valve: 2, side: 'F', path: [], radii: [], max: 110 },
  { valve: 2, side: 'Bb', path: [], radii: [], max: 110 },
  // the third valve's: S-shaped down round the coil's foot (the photographs' long loops)
  { valve: 3, side: 'F', path: [[84, -46], [84, -73], [-24, -73], [-24, -98], [10, -98]], radii: [14, 14, 12, 12], max: 30 },
  { valve: 3, side: 'Bb', path: [[58, -46], [58, -73], [14, -73]], radii: [14, 14], max: 46 },
];
/** tests: each slide's length against its valve's, and how far out from the coil's centre it reaches (mm) */
export const hornSlides = () => SLIDES.map((d) => {
  const L = slideLine(d);
  return { name: `v${d.valve}${d.side}`, len: arcLen(L), want: slideTarget(d), rMax: Math.max(...L.map((q) => Math.hypot(q[0], q[1]))) };
});
/** a slide's legs' half spacing */
const LEG = 7.4;
/** a slide's centre line (mm, at its level): the port, its corners, the solved last run */
function slideCentre(d: SlideDef, run: number): Vec3[] {
  const y = YR[d.valve];
  const z = d.side === 'F' ? ZF : ZB;
  const c: Vec3[] = [[X_PORT, y, z], ...d.path.map(([x, yy]) => [x, yy, z] as Vec3)];
  const n = c.length;
  const dir = n > 1 ? norm(sub(c[n - 1], c[n - 2])) : ([1, 0, 0] as Vec3);
  c.push(add(c[n - 1], scale(dir, run)));
  return refine(bend(c, d.radii, 14), 4);
}
/** the slide's tube: out along the left leg (as it leaves the casing, +y side), round the crook, back
 *  along the right */
function slideLine(d: SlideDef, run = d.run ?? 20): Vec3[] {
  const C = slideCentre(d, run);
  const N = C.length;
  const nrm = C.map((_, i) => {
    const t = norm(sub(C[Math.min(N - 1, i + 1)], C[Math.max(0, i - 1)]));
    return [-t[1], t[0], 0] as Vec3;
  });
  const left = C.map((p, i) => add(p, scale(nrm[i], LEG)));
  const right = C.map((p, i) => sub(p, scale(nrm[i], LEG))).reverse();
  // the crook: a half circle round the centre line's end
  const e = C[N - 1];
  const t = norm(sub(C[N - 1], C[N - 2]));
  const crook: Vec3[] = [];
  for (let k = 1; k < 16; k++) {
    const a = (Math.PI * k) / 16;
    crook.push(add(e, add(scale(nrm[N - 1], LEG * Math.cos(a)), scale(t, LEG * Math.sin(a)))));
  }
  return [...left, ...crook, ...right];
}
/** solve each slide's last run to its length */
for (const d of SLIDES) {
  const want = slideTarget(d);
  let lo = 2;
  let hi = 260;
  for (let k = 0; k < 36; k++) {
    const mid = (lo + hi) / 2;
    if (arcLen(slideLine(d, mid)) < want) lo = mid;
    else hi = mid;
  }
  d.run = Math.min(d.max, (lo + hi) / 2);
}

/** the bell branch's centre line from the spiral's start (θ0) to the start of its straight part (mm) */
function bellLine(th0: number): { spiral: Vec3[]; curve: Vec3[] } {
  const spiral: Vec3[] = [];
  for (let th = th0; th < TH1 - 1e-6; th += 2.5) spiral.push(spP(th));
  spiral.push(spP(TH1));
  const pe = spP(TH1);
  const te = norm(sub(spP(TH1 + 0.5), spP(TH1 - 0.5)));
  const str0 = sub(RIM_C, scale(AXIS, STRAIGHT));
  return { spiral, curve: bezier(pe, te, str0, AXIS, 40).slice(1) };
}
/** the F horn's tuning loop: tall nested ovals on the player's side of the coil, over the F slides (the
 *  photographs' "long tubing for F"): off the change valve's top round the outer oval (clockwise as the
 *  player sees it), inside it round the inner, out under the outer's leg to the first valve. `w` the inner
 *  oval's right side (x), solved for the F horn's length */
const ZFL = 25;
function fLoopLine(ib: number): Vec3[] {
  const z = ZFL;
  const L0 = -22;
  const R0 = 84;
  const top = 124;
  const bot = -122;
  const ro = (R0 - L0) / 2;
  const I0 = 3;
  const w = 62;
  const ri = (w - I0) / 2;
  const itop = top - 21;
  const ibot = ib;
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, zz: number, n = 28): Vec3[] => Array.from({ length: n + 1 }, (_, k) => {
    const a = (a0 + ((a1 - a0) * k) / n) * DEG;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a), zz] as Vec3;
  });
  // (the outer oval entered on its top's arc, 150° round from its right: the leg below stays open for the
  // turn inwards)
  const A0 = 148;
  const outer = [...arc((L0 + R0) / 2, top - ro, ro, A0, 0, z, 24), ...arc((L0 + R0) / 2, bot + ro, ro, 0, -180, z)];
  const e0 = outer[0];
  const et: Vec3 = [Math.sin(A0 * DEG), -Math.cos(A0 * DEG), 0];
  const inner = [...arc((I0 + w) / 2, itop - ri, ri, 180, 0, z), ...arc((I0 + w) / 2, ibot + ri, ri, 0, -180, z)];
  const pts: Vec3[] = [
    ...refine([[XR + 5, YR[0] + RC - 2, ZF], [XR + 5, YR[0] + RC + 6, ZF + 2]], 4),
    ...bezier([XR + 5, YR[0] + RC + 6, ZF + 2], [0, 1, 0.35], e0, et, 22).slice(1),
    ...refine(outer, 8).slice(1),
    ...refine([[L0, bot + ro, z], [L0, 34, z]], 8).slice(1),
    ...bezier([L0, 34, z], [0, 1, 0], [I0, top - ro - 10, z], [0, 1, 0], 18).slice(1),
    ...refine(inner, 8).slice(1),
    ...refine([[I0, ibot + ri, z], [I0, Math.min(12, ibot + ri + 2), z]], 8).slice(1),
    ...bend([[I0, Math.min(12, ibot + ri + 2), z], [I0, Math.min(-2, ibot + ri), z], [-12, YR[1] + 10, 18], [X_PORT + 2, YR[1] + 10, ZF], [X_PORT - 2, YR[1] + 10, ZF]], [10, 12, 6], 12).slice(1),
  ];
  return pts;
}
/** every route of the horn (mm), for a bell spiral starting at th0 and the F loop's inner oval's foot at ib */
function routes(th0: number, ib: number): Route[] {
  const out: Route[] = [];
  // ---- the leadpipe: the receiver down the lever side, curving in to its own wrap and round it, then
  // across to the change valve (behind, at its top)
  {
    const ringStart: Vec3 = [RL * Math.cos(LTH0 * DEG), RL * Math.sin(LTH0 * DEG), ZL];
    const ringT: Vec3 = [-Math.sin(LTH0 * DEG), Math.cos(LTH0 * DEG), 0];
    const into = bezier(LP1, LP_DIR, ringStart, ringT, 24).slice(1);
    const ring: Vec3[] = [];
    for (let th = LTH0 + 2.5; th <= LTH1; th += 2.5) ring.push([RL * Math.cos(th * DEG), RL * Math.sin(th * DEG), ZL]);
    const e = ring[ring.length - 1];
    const et: Vec3 = [-Math.sin(LTH1 * DEG), Math.cos(LTH1 * DEG), 0];
    const toC = bezier(e, et, [XR + 22, YR[0] + 10, ZB], [-1, -0.25, 0], 30).slice(1);
    toC.push([XR + RC - 2, YR[0] + 6, ZB]);
    const pts = [...refine([RCV, LP1], 10), ...into, ...ring, ...toC];
    // (the leadpipe tapers out from Ø 10.5 at the receiver to the main bore over its first 450 mm; the
    // left hand holds it under the levers)
    out.push({ name: 'lead', pts, r: (s) => lerp(5.25, RT, clamp01(s / 450)), m: BR, bore: true, hand: (f) => (f < 0.3 ? 0.9 * Math.sin(Math.PI * clamp01(f / 0.3)) : 0) });
  }
  out.push({ name: 'Floop', pts: fLoopLine(ib), r: rConst(RT), m: BR, bore: true });
  // ---- the B♭ horn's slide: a U standing up off the change valve's top, in front, down its lever side
  // to the first valve
  {
    const z = ZB - 3;
    const pts = bend(
      [
        [XR - 6, YR[0] + RC - 2, ZB],
        [XR - 6, YR[0] + 20, z],
        [XR - 6, 126, z],
        [XR - 23, 126, z],
        [XR - 23, YR[0] - 2, z],
        [XR - 19, YR[1] + 12, z],
        [XR - RC + 1, YR[1] + 9, ZB],
      ],
      [6, 8, 8, 10, 8],
      12,
    );
    out.push({ name: 'Bbslide', pts, r: rConst(RT), m: BR, bore: true });
  }
  // ---- the valves' slides
  for (const d of SLIDES) out.push({ name: `v${d.valve}${d.side}`, pts: slideLine(d), r: rConst(RT), m: BR, bore: true });
  // ---- from the third valve back up the column's lever side to the change valve
  out.push({
    name: 'return',
    pts: bend([[XR - RC + 2, YR[3] - 3, 0], [XR - 21, YR[3] - 3, 0], [XR - 21, YR[0] - 4, 0], [XR - RC + 2, YR[0] - 4, -1]], [7, 7], 12),
    r: rConst(RT),
    m: BR,
    bore: true,
  });
  // ---- the change valve's way out to the bell branch: down the lever side in front, the main slide's U
  // round the column's foot with its water key at the lowest point, into the spiral at θ0
  {
    const s0: Vec3 = spP(th0);
    const t0 = norm(sub(spP(th0 + 0.5), spP(th0 - 0.5)));
    const pre = sub(s0, scale(t0, 24));
    const pts = [
      ...bend([[XR - RC + 2, YR[0] + 6, -12], [XR - 37, YR[0] + 6, -12], [XR - 37, -52, -12]], [10], 12),
      ...bezier([XR - 37, -52, -12], [0, -1, 0.05], pre, t0, 30).slice(1),
      ...refine([pre, s0], 6).slice(1),
    ];
    out.push({ name: 'toMain', pts, r: (s) => RT + 0.25 * clamp01(s / 300), m: BR, bore: true });
  }
  // ---- the bell branch: the spiral, the curve out of the coil (the straight part and the flare are lathed)
  {
    const { spiral, curve } = bellLine(th0);
    const pts = [...spiral, ...curve];
    const L = arcLen(pts);
    out.push({ name: 'tail', pts, r: (s) => bellR(L - s + STRAIGHT), m: BR, bore: true, hand: (f) => (f > 0.82 ? 0.7 * Math.sin(Math.PI * clamp01((f - 0.82) / 0.18)) : 0), seg: 32 });
  }
  return out;
}
/** the open paths' lengths for a design (mm) */
const openLen = (rs: Route[], side: 'F' | 'Bb'): number => {
  const L: Record<string, number> = { bell: STRAIGHT };
  for (const r of rs) L[r.name] = arcLen(r.pts);
  return airPath({ side, valves: '0' }, L).reduce((a, p) => a + p.len, 0);
};
/** the routes solved: θ0 so the B♭ horn's open path is 2.80 m, then the F loop's inner turn so the F
 *  horn's is 3.74 m */
function solvedRoutes(): Route[] {
  let lo = 215;
  let hi = 270;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (openLen(routes(mid, -60), 'Bb') > BB_LEN) lo = mid;
    else hi = mid;
  }
  const th0 = (lo + hi) / 2;
  let a = -100;
  let b = -6;
  for (let k = 0; k < 30; k++) {
    const mid = (a + b) / 2;
    if (openLen(routes(th0, mid), 'F') > F_LEN) a = mid;
    else b = mid;
  }
  return routes(th0, (a + b) / 2);
}

// ================================================================ the rotors and the levers
/** a rotor's casing (static): its body, the knuckle rings, the bottom cap (the audience's side), the
 *  bearing plate and stop plate with its bumpers (the player's side) */
function rotorCasing(mb: MeshBuilder, i: number): void {
  const c = V(XR, YR[i], 0);
  const R = RC * mm;
  const H = HC * mm;
  const z: Vec3 = [0, 0, 1];
  // the body: two rings near either end and a band at the middle
  latheOn(mb, c, z, fillet([[R - 0.0004, -H], [R + 0.0006, -H + 0.0003], [R + 0.0006, -H + 0.0042], [R, -H + 0.005], [R, -0.0021], [R + 0.0004, -0.0017], [R + 0.0004, 0.0017], [R, 0.0021], [R, H - 0.005], [R + 0.0006, H - 0.0042], [R + 0.0006, H - 0.0003], [R - 0.0004, H]] as P2[], 0.00028, 3), 56, BR);
  // the bottom cap (z < 0: the audience's side): a knurled skirt, a domed face, a button
  latheOn(mb, c, z, fillet([[R - 0.0004, -H], [R + 0.0011, -H - 0.0004], [R + 0.0013, -H - 0.0048], [R + 0.0006, -H - 0.0062], [R - 0.0034, -H - 0.0072], [0.0052, -H - 0.0079], [0.0034, -H - 0.0082], [0.0034, -H - 0.0098], [0.0026, -H - 0.0103], [0, -H - 0.0104]] as P2[], [0, 0.0004, 0.0005, 0.0009, 0.003, 0.002, 0.0006, 0.0004, 0.0008, 0], 4), 56, BR);
  // a fine knurl on the cap's skirt (a satin band)
  latheOn(mb, c, z, [[R + 0.0014, -H - 0.0012], [R + 0.0014, -H - 0.004]], 96, NSS);
  // the player's side: the bearing plate (a flange), its boss for the spindle
  latheOn(mb, c, z, fillet([[R - 0.0004, H], [R + 0.0009, H + 0.0003], [R + 0.0009, H + 0.0026], [R - 0.001, H + 0.0034], [0.0052, H + 0.0036], [0.0042, H + 0.0052], [0.0028, H + 0.0056], [0, H + 0.0056]] as P2[], [0, 0.0003, 0.0005, 0.0012, 0.0008, 0.0006, 0], 3), 56, BR);
  // two screws holding the bearing plate
  for (const a of [20, 200]) {
    const p = V(XR + 9.2 * Math.cos(a * DEG), YR[i] + 9.2 * Math.sin(a * DEG), HC + 3.4);
    latheOn(mb, p, z, fillet([[0, 0.0011], [0.0013, 0.001], [0.0014, 0], [0, 0]] as P2[], [0, 0.0005, 0, 0], 3), 14, NS);
  }
  // the stop plate: an arc of nickel silver round the spindle's lower side, its two rubber bumpers where
  // the stop arm rests and where a quarter turn brings it
  const sa = CK0 + 180;
  const pts: Vec3[] = [];
  for (let k = 0; k <= 24; k++) {
    const a = (sa - 40 + (170 * k) / 24) * DEG;
    pts.push(V(XR + 9.8 * Math.cos(a), YR[i] + 9.8 * Math.sin(a), HC + 4.4));
  }
  tubeAlong(mb, pts, () => 0.0011, NS, 10, { cap0: true, cap1: true });
  for (const a of [sa - 19, sa + 90 + 19]) {
    const p = V(XR + 10.4 * Math.cos(a * DEG), YR[i] + 10.4 * Math.sin(a * DEG), HC + 3.6);
    latheOn(mb, p, z, fillet([[0, 0], [0.0017, 0], [0.0017, 0.0042], [0, 0.0044]] as P2[], [0, 0.0003, 0.0006, 0], 3), 16, RUBBER);
  }
}
/** the part of a rotor that turns, seen on the player's side: the spindle's end and its screw, the stop
 *  arm, the crank with its ball; built at rest */
function rotorTop(mb: MeshBuilder, i: number): void {
  const z: Vec3 = [0, 0, 1];
  const c = V(XR, YR[i], 0);
  latheOn(mb, c, z, fillet([[0.0028, HC * mm + 0.0052], [0.0028, ZK * mm - 0.001], [0.0036, ZK * mm - 0.0008], [0.0036, ZK * mm + 0.0012], [0.0024, ZK * mm + 0.0016], [0.0024, ZK * mm + 0.0026], [0, ZK * mm + 0.0028]] as P2[], [0, 0.0003, 0.0003, 0.0004, 0.0003, 0.0004, 0], 3), 28, NS);
  // the screw's slot across the spindle's end (a dark line that turns with it)
  const s0 = V(XR - 2, YR[i], ZK + 2.85);
  const s1 = V(XR + 2, YR[i], ZK + 2.85);
  cyl(mb, s0, s1, 0.00032, 0.00032, 8, BORE, true);
  // the stop arm: out from the spindle opposite the crank, between the bumpers
  const sa = (CK0 + 180) * DEG;
  const arm = [V(XR, YR[i], HC + 6.2), V(XR + 11.6 * Math.cos(sa), YR[i] + 11.6 * Math.sin(sa), HC + 6.2)];
  tubeAlong(mb, refine(arm, 2), (s, f) => (1.5 - 0.35 * f) * mm, NS, 14, { cap1: true });
  // the crank: a short arm to its ball
  const ca = CK0 * DEG;
  const b = V(XR + RCK * Math.cos(ca), YR[i] + RCK * Math.sin(ca), ZK);
  tubeAlong(mb, [V(XR, YR[i], ZK), b], () => 0.0014, NS, 14);
  ellipsoid(mb, b, [0.0021, 0.0021, 0.0021], 18, STEEL);
}
/** where a lever's crank tip is at rest (its link's lever end) and the rotor's crank ball, mm */
const leverTip = (i: number): Vec3 => [XA, YR[i], ZA + CRANK_UP];
const crankBall = (i: number, a = CK0): Vec3 => [XR + RCK * Math.cos(a * DEG), YR[i] + RCK * Math.sin(a * DEG), ZK];
/** the lever's pivot: about the axle (+y) by −φ (the spatula goes down towards the horn) */
function leverAt(p: Vec3, phi: number): Vec3 {
  const dx = p[0] - XA;
  const dz = p[2] - ZA;
  const b = -phi * DEG;
  return [XA + dx * Math.cos(b) + dz * Math.sin(b), p[1], ZA - dx * Math.sin(b) + dz * Math.cos(b)];
}
/** a lever (built at rest): its hub on the axle, the arm out to its spatula, its crank arm up to the
 *  link's ball; the thumb's (i = 0) a longer, turned-up thumb plate */
function lever(mb: MeshBuilder, i: number): void {
  const y = YR[i];
  const yp = PAD_Y[i];
  // the hub: a short tube round the axle
  latheOn(mb, V(XA, y - 3.5, ZA), [0, 1, 0], fillet([[0.0018, 0], [0.0031, 0], [0.0031, 0.007], [0.0018, 0.007]] as P2[], 0.0004, 2), 22, NS);
  // the arm out to the spatula (bending from the hub's height to the spatula's)
  const thumb = i === 0;
  const tipX = XA - ARM - (thumb ? 6 : 0);
  const arm = bend([[XA - 2, y, ZA + 1], [XA - 12, y, ZA + 1.6], [XA - 20, lerp(y, yp, 0.7), ZA + 2.4], [tipX + 10, yp, ZA + 3.2], [tipX, yp, ZA + 3.4]], [6, 8, 6], 10);
  tubeAlongBar(mb, arm.map((q) => V(...q)), 2.3, 1.15, NS);
  // the spatula: a lens-shaped spoon, its face towards the player (+z), the finger's dimple
  spatula(mb, V(tipX + 3, yp, ZA + 3.4), thumb ? 27 : 25, thumb ? 6.8 : 6.2, thumb ? -14 : 0);
  // the crank arm: up from the hub to its ball
  const tip = V(...leverTip(i));
  tubeAlong(mb, [V(XA, y, ZA + 2.8), tip], (s, f) => (1.9 - 0.4 * f) * mm, NS, 14);
  ellipsoid(mb, tip, [0.0024, 0.0024, 0.0024], 18, STEEL);
}
/** a flat bar along a path (half-width w, half-thickness h, mm), its broad face towards +z */
function tubeAlongBar(mb: MeshBuilder, path: Vec3[], w: number, h: number, m: Mat): void {
  const N = path.length;
  const rings: { p: Vec3; n: Vec3 }[][] = [];
  const seg = 16;
  for (let i = 0; i < N; i++) {
    const t = norm(sub(path[Math.min(N - 1, i + 1)], path[Math.max(0, i - 1)]));
    let u: Vec3 = [0, 0, 1];
    u = norm(sub(u, scale(t, dot(u, t))));
    const s = cross(t, u);
    const ring: { p: Vec3; n: Vec3 }[] = [];
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * TAU;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const ex = 2.6;
      const pc = Math.sign(c) * Math.abs(c) ** (2 / ex);
      const ps = Math.sign(sn) * Math.abs(sn) ** (2 / ex);
      const nc = (Math.sign(c) * Math.abs(c) ** (2 - 2 / ex)) / w;
      const ns = (Math.sign(sn) * Math.abs(sn) ** (2 - 2 / ex)) / h;
      ring.push({ p: add(path[i], add(scale(s, w * mm * pc), scale(u, h * mm * ps))), n: norm(add(scale(s, nc), scale(u, ns))) });
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
    const nn = norm(sub(path[i], path[j]));
    for (let k = 0; k < seg; k++) mb.stri(path[i], rings[i][k].p, rings[i][k + 1].p, nn, nn, nn, m);
  }
}
/** a spatula: a lens-shaped spoon centred at c (m), its length along −x (mm), half-width, a turn (deg)
 *  about z; domed on its face (+z), the finger's shallow dimple */
function spatula(mb: MeshBuilder, c: Vec3, L: number, W: number, turn: number): void {
  const ca = Math.cos(turn * DEG);
  const sa = Math.sin(turn * DEG);
  const P = (u: number, v: number, top: boolean): Vec3 => {
    // u along (0 the arm's end … 1 the tip), v across (−1 … 1)
    // (a pear: narrow at the arm, broad towards the tip, rounded off)
    const halfW = W * (0.36 + 0.64 * Math.sin(Math.PI * Math.min(1, 0.2 + u * 0.82)) ** 0.6) * (u > 0.86 ? Math.sqrt(Math.max(0, 1 - ((u - 0.86) / 0.14) ** 2)) : 1);
    const x = -u * L;
    const y = v * halfW;
    const th = 0.75 * (0.55 + 0.45 * Math.sqrt(Math.max(0, 1 - v * v)));
    const dish = -0.35 * Math.max(0, 1 - ((u - 0.6) / 0.35) ** 2 - v * v);
    const zz = top ? th + dish : -th * 0.8;
    return [c[0] + (x * ca - y * sa) * mm, c[1] + (x * sa + y * ca) * mm, c[2] + zz * mm];
  };
  const U = (k: number) => k;
  grid(mb, 18, 16, (u, v) => P(U(u), Math.cos(Math.PI * (1 - v)), true), NS);
  grid(mb, 18, 16, (u, v) => P(U(u), Math.cos(Math.PI * (1 - v)), false), NS, { flip: true });
  // the rim between the faces
  for (const vv of [-1, 1]) grid(mb, 18, 1, (u, w) => (w < 0.5 ? P(u, vv * 0.999, true) : P(u, vv * 0.999, false)), NS, { flip: vv > 0 });
  grid(mb, 1, 16, (w, v) => (w < 0.5 ? P(1, Math.cos(Math.PI * (1 - v)), true) : P(1, Math.cos(Math.PI * (1 - v)), false)), NS);
}
/** the link (a rod with a ball socket at each end) built along +y from 0 to its length L (m) */
function linkMesh(L: number): Mesh {
  return make((mb) => {
    latheOn(mb, [0, 0, 0], [0, 1, 0], fillet([[0, -0.0021], [0.0027, -0.0018], [0.0033, 0], [0.0027, 0.0031], [0.0016, 0.0046], [0.0016, L - 0.0046], [0.0027, L - 0.0031], [0.0033, L], [0.0027, L + 0.0018], [0, L + 0.0021]] as P2[], [0, 0.0013, 0.0018, 0.0015, 0.0009, 0.0009, 0.0015, 0.0018, 0.0013, 0], 4), 20, NS);
  });
}
/** the four-bar: the rotor's crank angle (deg) for a lever's angle (deg), keeping the link's length */
function crankFor(phi: number): number {
  const L0 = len3(sub(crankBall(1), leverTip(1)));
  let g = CK0;
  for (let k = 1; k <= 20; k++) g = solveCrank(1, (phi * k) / 20, L0, g);
  return g - CK0;
}
/** the lever's travel that turns the rotor exactly a quarter turn */
function solveTravel(): number {
  let lo = 8;
  let hi = 30;
  for (let k = 0; k < 30; k++) {
    const mid = (lo + hi) / 2;
    if (crankFor(mid) < 90) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
function solveCrank(i: number, phi: number, L0: number, guess: number): number {
  const A = leverAt(leverTip(i), phi);
  let a = guess;
  for (let k = 0; k < 30; k++) {
    const B = crankBall(i, a);
    const f = len3(sub(B, A)) - L0;
    const B2 = crankBall(i, a + 0.01);
    const df = (len3(sub(B2, A)) - L0 - f) / 0.01;
    if (Math.abs(df) < 1e-9) break;
    const step = Math.max(-8, Math.min(8, f / df));
    a -= step;
    if (Math.abs(step) < 1e-6) break;
  }
  return a;
}

// ================================================================ the model
export interface HornSeg {
  /** the route it is part of, and where along it (mm from the route's start) */
  route: string;
  s0: number;
  s1: number;
  mesh: Mesh;
}
export interface HornModel {
  /** the pose on the stage (the player's side towards the camera's home), the Orchestra's own seat */
  T: Mat4;
  statics: Mesh[];
  /** the bore's tubing in pieces, each glowing with the standing wave where the air goes through it */
  segs: HornSeg[];
  /** the routes' lengths (mm) */
  lengths: Record<string, number>;
  /** the bell's rim and mouth (shimmers with the level) */
  rim: Mesh;
  /** per valve (the change valve, 1, 2, 3): the rotor's turning part, the lever, the link */
  valves: { rotor: Mesh; lever: Mesh; link: Mesh; L0: number; table: Float32Array; axis: Vec3; pivot: Vec3; leverAxis: Vec3; leverPivot: Vec3; ball: Vec3 }[];
  /** the mouthpiece's rim (the lips' place) and its axis, in the model */
  lips: Vec3;
  lipAxis: Vec3;
  bounds: { c: Vec3; r: number };
}

/** the passages inside a valve's casing (and the knuckle to the next), mm */
const PASSAGE = 26;
/** the air's path for a fingering, lips → bell: the routes and the valves' passages in order, each
 *  with its length (mm) */
export function airPath(f: Pick<HornFingering, 'side' | 'valves'>, lengths: Record<string, number>): { route: string; len: number }[] {
  const side = f.side === 'Bb' ? 'Bb' : 'F';
  const down = new Set(f.valves === '0' ? [] : f.valves.split('+'));
  const L = (r: string) => ({ route: r, len: lengths[r] ?? 0 });
  const path = [{ route: 'mouthpiece', len: MP_LEN - MP_IN }, L('lead'), { route: 'passC', len: PASSAGE }, L(side === 'F' ? 'Floop' : 'Bbslide')];
  for (const v of ['1', '2', '3']) {
    path.push({ route: `pass${v}`, len: PASSAGE });
    if (down.has(v)) path.push(L(`v${v}${side}`));
  }
  path.push(L('return'), { route: 'passC2', len: PASSAGE }, L('toMain'), L('tail'), L('bell'));
  return path;
}
/** the length of the air's path (m) for a fingering */
export const hornPathLength = (hm: HornModel, f: Pick<HornFingering, 'side' | 'valves'>): number => airPath(f, hm.lengths).reduce((a, p) => a + p.len, 0) * mm;

export function buildHornModel(): HornModel {
  const RS_ = solvedRoutes();
  const lengths: Record<string, number> = {};
  const segs: HornSeg[] = [];
  const statics: ((mb: MeshBuilder) => void)[] = [];
  for (const rt of RS_) {
    const L = arcLen(rt.pts);
    lengths[rt.name] = L;
    // the bore's routes in pieces of about 120 mm for the glow (each piece a draw call in every pass)
    const P = refine(rt.pts, 7);
    const acc = [0];
    for (let i = 1; i < P.length; i++) acc.push(acc[i - 1] + len3(sub(P[i], P[i - 1])));
    const nPieces = Math.max(1, Math.round(L / 120));
    let i0 = 0;
    for (let k = 1; k <= nPieces; k++) {
      const sEnd = (L * k) / nPieces;
      let i1 = i0;
      while (i1 < P.length - 1 && acc[i1] < sEnd - 1e-6) i1++;
      const sub_ = P.slice(i0, i1 + 1);
      const s0 = acc[i0];
      const s1 = acc[i1];
      const mesh = make((mb) =>
        tubeAlong(mb, mmPts(sub_), (s) => rt.r(s / mm + s0, L) * mm, rt.m, rt.seg ?? 24, { hand: rt.hand ? (f) => rt.hand!((s0 + f * (s1 - s0)) / L) : undefined }),
      );
      segs.push({ route: rt.name, s0, s1, mesh });
      i0 = i1;
    }
  }
  // ---- the bell: the straight part and the flare lathed about its axis, the bead rolled over at the
  // rim, the throat darkening inside
  const str0 = V(...sub(RIM_C, scale(AXIS, STRAIGHT)));
  const bellProf: P2[] = [];
  for (let k = 0; k <= 120; k++) {
    // (dense near the rim, where it flares)
    const x = STRAIGHT * (1 - k / 120) ** 2.2;
    bellProf.push([bellR(x) * mm, (STRAIGHT - x) * mm]);
  }
  const bellPieces = [0, 0.45, 0.8, 1];
  for (let j = 0; j < bellPieces.length - 1; j++) {
    const a = Math.round(bellPieces[j] * 120);
    const b = Math.round(bellPieces[j + 1] * 120);
    const prof = bellProf.slice(a, b + 1);
    const mesh = make((mb) => latheOn(mb, str0, AXIS, prof, j === 2 ? 128 : 96, BR));
    segs.push({ route: 'bell', s0: prof[0][1] / mm, s1: prof[prof.length - 1][1] / mm, mesh });
  }
  lengths.bell = STRAIGHT;
  const rim = make((mb) => {
    // the bead: the bell's edge rolled back over a wire
    const ring: P2[] = [];
    const rc = BELL_RIM / 2 - BEAD;
    for (let i = 0; i <= 20; i++) {
      const a = -Math.PI * 0.55 + (i / 20) * Math.PI * 1.75;
      ring.push([(rc + BEAD * Math.cos(a)) * mm, (STRAIGHT - BEAD * 0.2 + BEAD * Math.sin(a)) * mm]);
    }
    latheOn(mb, str0, AXIS, ring, 192, BELL);
  });
  statics.push((mb) => {
    // the throat seen down the bell: the brass's inside darkening into the tail
    const prof: P2[] = [];
    for (let k = 0; k <= 12; k++) {
      const x = STRAIGHT - 2 - k * 6;
      prof.push([(bellR(x) - 0.6) * mm, (STRAIGHT - x) * mm]);
    }
    prof.push([0, (STRAIGHT - (STRAIGHT - 2 - 12 * 6) - 2) * mm]);
    latheOn(mb, str0, AXIS, prof.map(([r, y]) => [r, y] as P2), 48, BORE);
  });
  // ---- the mouthpiece (silver), along the leadpipe's axis, its rim up
  const up = scale(LP_DIR, -1);
  const mpBase = add(RCV, scale(LP_DIR, MP_IN - 2));
  statics.push((mb) => {
    const p0 = V(...mpBase);
    // the outside: the shank's taper, its collar, the funnel cup's body, the rim
    const o: P2[] = [[4.5, 0], [5.25, 40.5], [5.6, 41.2], [5.6, 43.4], [5.3, 44.2], [6.2, 49], [7.4, 56], [8.8, 62], [10.4, 67.5], [11.6, 71.2], [12.1, 72.4], [12.1, 73.4], [12.5, 74.8], [12.5, 78.8], [11.4, 81.4], [9.6, 82], [8.6, 81.6]];
    latheOn(mb, p0, up, fillet(o.map(([r, s]) => [r * mm, s * mm] as P2), [0, 0.0004, 0.0003, 0.0003, 0.0004, 0.003, 0.006, 0.006, 0.004, 0.001, 0.0002, 0.0003, 0.0012, 0.0016, 0.0012, 0.0004, 0], 4), 48, AG);
    // the cup inside: a deep funnel to the throat
    const cup: P2[] = [[8.6, 81.6], [8.5, 79.5], [7.6, 75], [5.6, 70], [3.4, 64.5], [2.3, 60], [2.15, 56]];
    latheOn(mb, p0, up, fillet(cup.map(([r, s]) => [r * mm, s * mm] as P2), [0, 0.0012, 0.004, 0.005, 0.003, 0.001, 0], 4), 48, AG);
    latheOn(mb, p0, up, [[2.15 * mm, 56 * mm], [0, 54 * mm]], 16, BORE);
  });
  const lips = V(...add(mpBase, scale(up, MP_LEN + 0.6)));
  // ---- the receiver: a nickel-silver sleeve at the leadpipe's top, its mouth rounded
  statics.push((mb) => {
    latheOn(mb, V(...RCV), LP_DIR, fillet([[4.6 * mm, -0.0004], [7.1 * mm, 0], [7.4 * mm, 0.0014], [7.4 * mm, 0.0034], [6.6 * mm, 0.0046], [6.4 * mm, 0.026], [6.9 * mm, 0.0268], [6.9 * mm, 0.0286], [5.6 * mm, 0.0302]] as P2[], [0, 0.0004, 0.0005, 0.0005, 0.0006, 0.0003, 0.0003, 0.0003, 0], 3), 36, NS);
  });
  // ---- the rotors' casings, the knuckles between them, the ports where the tubing meets them
  statics.push((mb) => {
    for (let i = 0; i < 4; i++) rotorCasing(mb, i);
    for (let i = 0; i < 3; i++)
      for (const z of [ZF, ZB]) {
        const a = V(XR, YR[i] - RC + 0.8, z);
        const b = V(XR, YR[i + 1] + RC - 0.8, z);
        latheOn(mb, b, [0, 1, 0], fillet([[RT * mm + 0.0016, -0.0003], [RT * mm + 0.0016, 0.0016], [RT * mm, 0.0028], [RT * mm, len3(sub(a, b)) - 0.0028], [RT * mm + 0.0016, len3(sub(a, b)) - 0.0016], [RT * mm + 0.0016, len3(sub(a, b)) + 0.0003]] as P2[], 0.0004, 3), 32, BR);
      }
    // the slides' and loops' ports: collars where each meets its casing
    for (const d of SLIDES)
      for (const s of [1, -1]) ferrule(mb, V(X_PORT + 2.5, YR[d.valve] + s * LEG, d.side === 'F' ? ZF : ZB), [1, 0, 0], RT, 5, BR);
  });
  // ---- the slides' sleeves (nickel silver), their ferrules and braces; the F loop's and B♭ slide's
  // sliding parts; the main slide's
  statics.push((mb) => {
    for (const d of SLIDES) {
      // the sliding part: the legs' last straight run before the crook, in nickel silver
      const C = slideCentre(d, d.run!);
      const N = C.length;
      const t = norm(sub(C[N - 1], C[N - 2]));
      const nn: Vec3 = [-t[1], t[0], 0];
      const run = Math.min(d.run!, d.path.length ? d.run! : d.run! - 10);
      const e = C[N - 1];
      const s0 = sub(e, scale(t, run - 3));
      if (run > 16)
        for (const sg of [1, -1]) {
          const a = add(s0, scale(nn, sg * LEG));
          const b = add(e, scale(nn, sg * LEG));
          cyl(mb, V(...a), V(...b), RS * mm, RS * mm, 28, NS, false);
          ferrule(mb, V(...a), t, RS, 4, NS);
        }
      // a stay between the legs near the crook
      if (run > 26) brace(mb, add(sub(e, scale(t, 6)), scale(nn, LEG - RS + 0.3)), add(sub(e, scale(t, 6)), scale(nn, -LEG + RS - 0.3)), 1.2, NS);
    }
    // the F loop's slide: the outer oval's top crook pulls out of its legs' sleeves
    for (const x of [-22, 84]) {
      cyl(mb, V(x, 18, ZFL), V(x, 70, ZFL), RS * mm, RS * mm, 28, NS, false);
      ferrule(mb, V(x, 18, ZFL), [0, 1, 0], RS, 4);
    }
    // the B♭ slide's legs
    for (const x of [XR - 6, XR - 23]) {
      cyl(mb, V(x, 84, ZB - 3), V(x, 118, ZB - 3), RS * mm, RS * mm, 28, NS, false);
      ferrule(mb, V(x, 84, ZB - 3), [0, 1, 0], RS, 4);
    }
    // the main slide: its leg down the lever side (sleeve and ferrules), the water key at its lowest point
    cyl(mb, V(XR - 37, 22, -12), V(XR - 37, -34, -12), RS * mm, RS * mm, 28, NS, false);
    ferrule(mb, V(XR - 37, 22, -12), [0, 1, 0], RS, 4);
    ferrule(mb, V(XR - 37, -34, -12), [0, 1, 0], RS, 4);
    waterKey(mb, RS_.find((r) => r.name === 'toMain')!.pts);
  });
  // ---- the lever cluster's axle, its posts and springs; the finger hook; the hand rest; braces
  statics.push((mb) => {
    const top = YR[0] + 6;
    const bot = YR[3] - 8;
    cyl(mb, V(XA, top, ZA), V(XA, bot, ZA), 0.0014, 0.0014, 14, STEEL, true);
    // the axle's posts down to the leadpipe's wrap
    for (const [y, th] of [[top - 1, 134], [bot + 1, 224]] as const) {
      const ring: Vec3 = [RL * Math.cos(th * DEG), RL * Math.sin(th * DEG), ZL + RT - 1];
      brace(mb, [XA, y, ZA - 1.4], ring, 1.8, NS);
      latheOn(mb, V(XA, y, ZA), [0, 1, 0], fillet([[0.0016, -0.0024], [0.0032, -0.0024], [0.0032, 0.0024], [0.0016, 0.0024]] as P2[], 0.0005, 2), 20, NS);
    }
    // each lever's return spring: a short coil round the axle under its hub
    for (let i = 0; i < 4; i++) {
      const y0 = YR[i] - 4.5;
      const y1 = YR[i] - 13;
      const n = 4;
      const coil: Vec3[] = [];
      for (let k = 0; k <= n * 16; k++) {
        const a = (k / 16) * TAU;
        coil.push(V(XA + 2.7 * Math.cos(a), lerp(y0, y1, k / (n * 16)), ZA + 2.7 * Math.sin(a)));
      }
      tubeAlong(mb, coil, () => 0.00065, NS, 8);
    }
    fingerHook(mb);
    handRest(mb);
    // braces: the leadpipe to the coil; the F loop's two ovals to each other (their legs side by side);
    // the bell branch's wrap to the leadpipe's at the coil's foot
    brace(mb, [...add(RCV, scale(LP_DIR, 92)).slice(0, 2), 16 - RT + 1] as Vec3, [spP(495)[0], spP(495)[1], spP(495)[2] + RT - 1], 1.7);
    for (const [x0, x1, y] of [[84, 62, -40], [84, 62, 40], [-22, 3, -70]] as const) brace(mb, [x0 + Math.sign(x1 - x0) * (RT - 0.6), y, ZFL], [x1 - Math.sign(x1 - x0) * (RT - 0.6), y, ZFL], 1.4);
    brace(mb, [spP(300)[0] * 0.95, spP(300)[1] * 0.95, spP(300)[2] + 1], [RL * Math.cos(300 * DEG) * 1.06, RL * Math.sin(300 * DEG) * 1.06, ZL], 1.5);
  });
  // ---- the valves' moving parts and the four-bar tables
  LEVER_TRAVEL = solveTravel();
  const valves = [0, 1, 2, 3].map((i) => {
    const rotor = make((mb) => rotorTop(mb, i));
    const lev = make((mb) => lever(mb, i));
    const A = leverTip(i);
    const B = crankBall(i);
    const L0 = len3(sub(B, A));
    const table = new Float32Array(41);
    let g = CK0;
    for (let k = 0; k <= 40; k++) {
      g = solveCrank(i, (LEVER_TRAVEL * k) / 40, L0, g);
      table[k] = g - CK0;
    }
    return { rotor, lever: lev, link: linkMesh(L0 * mm), L0, table, axis: F3([0, 0, 1]), pivot: F3(V(XR, YR[i], 0)), leverAxis: F3([0, 1, 0]), leverPivot: F3(V(XA, 0, ZA)), ball: F3(V(...B)) };
  });
  // ---- assemble the statics in a few meshes
  const st = make((mb) => {
    for (const f of statics) f(mb);
  });
  const T = HORN_POSE;
  const bx = boxOf([st, ...segs.map((s) => s.mesh), rim, ...valves.map((v) => v.lever)]);
  const c: Vec3 = [(bx.lo[0] + bx.hi[0]) / 2, (bx.lo[1] + bx.hi[1]) / 2, (bx.lo[2] + bx.hi[2]) / 2];
  const r = 0.5 * Math.hypot(bx.hi[0] - bx.lo[0], bx.hi[1] - bx.lo[1], bx.hi[2] - bx.lo[2]) + 0.01;
  const model: HornModel = { T, statics: [st], segs, lengths, rim, valves, lips: F3(lips), lipAxis: F3(up), bounds: { c: xform(T, c), r } };
  // (tests and review shots: the review's views, the routes' lengths, the levers and rotors as the stage
  // last posed them)
  if (typeof window !== 'undefined')
    (window as unknown as { __horn3d?: unknown }).__horn3d = {
      views: hornViews(model),
      lengths,
      levers: () => (stageState ? Array.from(stageState.pos) : null),
      rotors: () => (stageState ? Array.from(stageState.pos, (p, i) => rotorTurn(model, i, p)) : null),
    };
  return model;
}
/** a mesh set's box in the model */
function boxOf(ms: Mesh[]): { lo: Vec3; hi: Vec3 } {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const m of ms)
    for (let i = 0; i < m.count; i++)
      for (let k = 0; k < 3; k++) {
        const v = m.data[i * 14 + k];
        if (v < lo[k]) lo[k] = v;
        if (v > hi[k]) hi[k] = v;
      }
  return { lo, hi };
}

/** the water key on the main slide's crook: its nipple, the lever's cork cup pressed on it, the hinge
 *  saddle and spring, the paddle */
function waterKey(mb: MeshBuilder, route: Vec3[]): void {
  // (the main slide's lowest point, its outward normal there)
  let i = 0;
  for (let k = 1; k < route.length; k++) if (route[k][1] < route[i][1]) i = k;
  const P = route[i];
  const t = norm(sub(route[Math.min(route.length - 1, i + 1)], route[Math.max(0, i - 1)]));
  const n = norm(sub([0, -1, 0], scale(t, -t[1])));
  const nip0 = V(...add(P, scale(n, RT - 1)));
  const nip1 = V(...add(P, scale(n, RT + 3)));
  cyl(mb, nip0, nip1, 0.0023, 0.0019, 18, BR);
  latheOn(mb, V(...add(P, scale(n, RT + 5.6))), scale(n, -1), fillet([[0, -0.0012], [0.0029, -0.0011], [0.0033, -0.0004], [0.0033, 0.0015], [0.003, 0.0017]] as P2[], [0, 0.0008, 0.0004, 0.0002, 0], 3), 24, NS);
  latheOn(mb, V(...add(P, scale(n, RT + 5.6))), scale(n, -1), [[0, 0.0016], [0.003, 0.0016], [0.003, 0.0004]], 24, CORK);
  // the lever along the tube to its hinge, and on to the paddle
  const tdir = t;
  const cup = add(P, scale(n, RT + 6.4));
  const hinge = add(add(P, scale(tdir, 15)), scale(n, RT + 3.2));
  const paddle = add(add(P, scale(tdir, 27)), scale(n, RT + 7.5));
  tubeAlongBar(mb, bend([cup, hinge, paddle], 6, 8).map((q) => V(...q)), 1.7, 0.7, NS);
  cyl(mb, V(...add(hinge, [0, 0, -3])), V(...add(hinge, [0, 0, 3])), 0.0007, 0.0007, 10, NS, true);
  for (const s of [-1, 1]) cyl(mb, V(...add(add(P, scale(tdir, 15)), [0, 0, s * 2.4])), V(...add(hinge, [0, 0, s * 2.4])), 0.0011, 0.001, 10, BR, true);
  // the hinge's coil spring, round its pin (along z)
  const coil: Vec3[] = [];
  for (let k = 0; k <= 64; k++) {
    const a = (k / 16) * TAU;
    coil.push(V(hinge[0] + 1.15 * (Math.cos(a) * n[0] + Math.sin(a) * tdir[0]), hinge[1] + 1.15 * (Math.cos(a) * n[1] + Math.sin(a) * tdir[1]), hinge[2] + lerp(-1.7, 1.7, k / 64)));
  }
  tubeAlong(mb, coil, () => 0.00028, STEEL, 8);
}
/** the finger hook: a brass hook below the levers for the left hand's little finger */
function fingerHook(mb: MeshBuilder): void {
  const base: Vec3 = [RL * Math.cos(208 * DEG), RL * Math.sin(208 * DEG), ZL + RT - 1];
  const path = bend([base, [base[0] + 2, base[1] + 1, ZA - 6], [-114, -54, ZA + 2], [-122, -50, ZA + 9], [-128, -40, ZA + 10], [-129, -33, ZA + 6]], [4, 6, 6, 5], 10);
  tubeAlong(mb, refine(path, 2).map((q) => V(...q)), () => 0.0019, BR, 16, { hand: () => 0.8 });
  ellipsoid(mb, V(-129, -33, ZA + 6), [0.0021, 0.0021, 0.0021], 16, BR);
  latheOn(mb, V(...base), [0, 0, 1], fillet([[0, -0.0005], [0.0045, -0.0004], [0.0036, 0.0008], [0.0019, 0.0034], [0, 0.0034]] as P2[], [0, 0.0008, 0.0012, 0.0005, 0], 3), 18, BR);
}
/** the hand rest ("duck foot"): a clamp on the leadpipe, a short stem out to the lever side, and the
 *  curved plate (nickel silver, a black pad on it) the side of the left hand rests against */
function handRest(mb: MeshBuilder): void {
  const at = add(RCV, scale(LP_DIR, 108));
  // the clamp: a sleeve round the leadpipe with its knurled screw
  latheOn(mb, V(...add(at, scale(LP_DIR, -5))), LP_DIR, fillet([[6.2 * mm, 0], [7.9 * mm, 0.0005], [7.9 * mm, 0.0095], [6.2 * mm, 0.01]] as P2[], 0.0006, 2), 32, NS);
  const sc = add(at, [0, 0, 9]);
  cyl(mb, V(...add(at, [0, 0, 6])), V(...sc), 0.0018, 0.0018, 14, NS, true);
  latheOn(mb, V(...sc), [0, 0, 1], fillet([[0, 0], [0.0034, 0], [0.0034, 0.0032], [0, 0.0034]] as P2[], [0, 0.0006, 0.0008, 0], 3), 24, NSS);
  // the stem: out and a little down from the clamp
  const foot: Vec3 = [at[0] - 22, at[1] - 18, at[2] + 4];
  tubeAlong(mb, refine(bend([add(at, [-6, 0, 1]), [at[0] - 16, at[1] - 10, at[2] + 3], foot], 8, 10), 2).map((q) => V(...q)), () => 0.0021, NS, 14, { cap1: true });
  // the plate: a rounded paddle 26 × 13 mm, curved to the hand, its face towards the player's side and
  // out; a black rubber pad over it
  const ux = norm([-0.86, -0.5, 0.1]);
  const uy = norm(cross([0, 0, 1], ux));
  const nz = cross(ux, uy);
  const P = (u: number, v: number, top: boolean, pad: boolean): Vec3 => {
    const L = 26;
    const halfW = 6.6 * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 6));
    const curl = 2.6 * (2 * u - 1) ** 2;
    const th = (pad ? 1.6 : 0.9) * Math.sqrt(Math.max(0, 1 - v * v)) * (0.6 + 0.4 * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)));
    const x = u * L;
    const yy = v * halfW * (pad ? 0.86 : 1);
    const zz = curl + (top ? th : -0.9) + (pad ? 1 : 0);
    return V(foot[0] + ux[0] * x + uy[0] * yy + nz[0] * zz, foot[1] + ux[1] * x + uy[1] * yy + nz[1] * zz, foot[2] + ux[2] * x + uy[2] * yy + nz[2] * zz);
  };
  const vv = (v: number) => Math.cos(Math.PI * (1 - v));
  grid(mb, 18, 16, (u, v) => P(u, vv(v), true, false), NS);
  grid(mb, 18, 16, (u, v) => P(u, vv(v), false, false), NS, { flip: true });
  grid(mb, 18, 16, (u, v) => P(0.04 + u * 0.92, vv(v), true, true), PAD);
}

// ================================================================ posing
/** where the model stands on its own: upright, the coil's player side towards the camera's home, the
 *  bell to the right, floating a hand's width over the floor (a product photograph's pose) */
export const HORN_POSE: Mat4 = translate(0, 0.335, 0);
/** the hero bearing (scenes3d viewFor): from the player's side, a little round from the levers, a little
 *  above; a phone held upright may turn it up to `swing` further round towards the bell's mouth, which
 *  shortens the bell across a narrow picture */
export const HORN_VIEW = { yaw: -0.18, pitch: 0.15, swing: 0.75 };
/** its seat in the Orchestra (scenes3d ensembleSeats): the coil's centre's height (its mouthpiece then at
 *  a seated player's lips, 1.18 m) and the seat's own turn; `top` the height the framing allows for */
export const HORN_SEAT = { y: 0.96, turn: 0, top: 1.34 };
/** held as a seated player holds it (Karl Bradač's photograph, a horn section's from the front), about
 *  the coil's centre: the coil standing, its valve caps' side turned 37° to the audience on the player's
 *  right (the world here is mirrored: the player's right is −x, the audience at −z); in its plane turned
 *  so the levers come up under the left hand and the leadpipe rises to the lips, the bell going down and
 *  back to rest by the right thigh, its mouth behind */
const HELD_PLANE = 37 * DEG;
const HELD_TURN = -55 * DEG;
export const HORN_HELD: Mat4 = (() => {
  const h: Vec3 = [-Math.cos(HELD_PLANE), 0, Math.sin(HELD_PLANE)];
  const up: Vec3 = [0, 1, 0];
  const nb = cross(up, h);
  const eX = add(scale(h, Math.cos(HELD_TURN)), scale(up, Math.sin(HELD_TURN)));
  const eY = add(scale(h, -Math.sin(HELD_TURN)), scale(up, Math.cos(HELD_TURN)));
  // (the model is the true horn with z flipped: its −z is the player's side, nb)
  return new Float32Array([eX[0], eX[1], eX[2], 0, eY[0], eY[1], eY[2], 0, -nb[0], -nb[1], -nb[2], 0, 0, 0, 0, 1]);
})();

interface HornPoseState {
  /** each lever's spring (0 rest … 1 pressed) */
  pos: Float32Array;
  vel: Float32Array;
  /** seconds since it last sounded */
  quiet: number;
  midi: number | null;
  W: Float32Array;
  R: Float32Array;
  L: Float32Array;
  glow: RGBA;
  lipGap: number;
  /** where each route of the air's path starts along it (mm), this frame */
  at: Map<string, number>;
}
const poses = new WeakMap<WindPose, HornPoseState>();
function hornPose(pose: WindPose): HornPoseState {
  let p = poses.get(pose);
  if (!p) {
    p = { pos: new Float32Array(4), vel: new Float32Array(4), quiet: 10, midi: null, W: new Float32Array(16), R: new Float32Array(16), L: new Float32Array(16), glow: [0, 0, 0, 0], lipGap: 0, at: new Map() };
    poses.set(pose, p);
  }
  return p;
}
/** tests: the levers' springs as posed (the change valve, 1, 2, 3: 1 pressed) */
export const hornLeverState = (pose: WindPose): Float32Array | null => poses.get(pose)?.pos ?? null;
/** tests: the rotor's turn (deg) for a lever's spring position (0 … 1) */
export function rotorTurn(hm: HornModel, i: number, p: number): number {
  const t = hm.valves[i].table;
  const x = clamp01(p) * 40;
  const k = Math.min(39, Math.floor(x));
  return lerp(t[k], t[k + 1], x - k);
}

const C = { verm: (a: number) => ink(INK.vermilion, a), amber: (a: number) => ink(INK.amber, a) };

/** the single stage's pose state, last posed (tests) */
let stageState: HornPoseState | null = null;
export function poseHorn(b: Batch, hm: HornModel, fr: VisualFrame | null, pose: WindPose, dt: number, now: number, rms: number, T: Mat4 = hm.T): void {
  const st = hornPose(pose);
  if (T === hm.T) stageState = st;
  for (const s of hm.statics) b.mesh(s, T);
  const lips = fr?.lips ?? null;
  const blow = lips ? lips.blow : 0;
  const focus = fr?.focus ?? null;
  // the fingering for the note the engine plays, held while it sounds and a moment after
  st.quiet = blow > 0.02 ? 0 : Math.min(9, st.quiet + dt);
  const midi = focus && st.quiet < 0.8 ? (focus.midi ?? null) : null;
  const fg = midi === null ? null : hornFingering(midi);
  const down = fg ? new Set(fg.valves === '0' ? [] : fg.valves.split('+')) : new Set<string>();
  const want = [fg?.side === 'Bb', down.has('1'), down.has('2'), down.has('3')];
  // the levers on their springs; each rotor turned by its linkage (the four-bar's table)
  for (let i = 0; i < 4; i++) {
    const p = springTo(st.pos, st.vel, i, want[i] ? 1 : 0, dt, 16, 0.4);
    const v = hm.valves[i];
    const phi = LEVER_TRAVEL * p;
    // the lever: about the axle (+y, the true frame) by −φ; in the model the angle's sign flips with z
    aboutAxis(st.L, v.leverPivot, v.leverAxis, phi * DEG);
    mulInto(st.W, 0, T, st.L);
    b.mesh(v.lever, st.W);
    const turn = rotorTurn(hm, i, p);
    aboutAxis(st.R, v.pivot, v.axis, -turn * DEG);
    mulInto(st.W, 0, T, st.R);
    b.mesh(v.rotor, st.W);
    // the link: from the lever's crank ball to the rotor's crank ball
    const A = F3(V(...leverAt(leverTip(i), phi)));
    const Bp = F3(V(...crankBall(i, CK0 + turn)));
    const y = norm(sub(Bp, A));
    let x = cross(y, [0, 0, 1]);
    if (len3(x) < 1e-6) x = cross(y, [1, 0, 0]);
    x = norm(x);
    const z = cross(x, y);
    const Lm = new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, A[0], A[1], A[2], 1]);
    mulInto(st.W, 0, T, Lm);
    b.mesh(v.link, st.W);
  }
  // the bore: the standing wave along the air's path (lips → bell), on the tubing the air goes through
  const shape = focus?.shapes?.[0] ?? null;
  let peak = 0;
  if (shape) for (let i = 0; i < shape.length; i++) peak = Math.max(peak, Math.abs(shape[i]));
  const sounding = blow > 0.02 && !!shape && peak > 0 && !!fg;
  const lvl = Math.min(1, Math.sqrt(rms) * 3);
  const setGlow = (a: number): RGBA | null => {
    if (a <= 0.003) return null;
    st.glow[0] = 1;
    st.glow[1] = 0.7;
    st.glow[2] = 0.42;
    st.glow[3] = a;
    return st.glow;
  };
  const at = st.at;
  at.clear();
  let total = 0;
  if (sounding)
    for (const p of airPath(fg!, hm.lengths)) {
      at.set(p.route, total);
      total += p.len;
    }
  for (const s of hm.segs) {
    const off = at.get(s.route);
    let g = 0;
    if (off !== undefined && total > 0) {
      const f = clamp01((off + (s.s0 + s.s1) / 2) / total);
      const j = Math.min(shape!.length - 1, Math.round(f * (shape!.length - 1)));
      g = 0.095 * Math.min(1, blow * 1.4) * (Math.abs(shape![j]) / peak);
    }
    b.mesh(s.mesh, T, setGlow(g));
  }
  // the bell's mouth: a faint shimmer with the level
  b.mesh(hm.rim, T, lvl > 0.02 ? setGlow(0.09 * lvl * (0.75 + 0.25 * Math.sin(now * 0.021))) : null);
  // the lips at the rim: they buzz at the note (drawn slowed), opening with the engine's lips
  const open = lips ? Math.min(1.6, lips.open) : 0;
  st.lipGap += (open - st.lipGap) * (1 - Math.exp(-dt / 0.04));
  if (blow > 0.02) {
    const f1 = focus?.f1 ?? 0;
    const gap = 0.0006 + 0.0011 * st.lipGap * (0.55 + 0.45 * Math.sin(now * 0.001 * Math.min(f1, 14) * TAU));
    const ax = norm(hm.lipAxis);
    const side = norm(cross(ax, [0, 0, 1]));
    const up2 = norm(cross(side, ax));
    for (const sg of [-1, 1]) {
      const pts: Vec3[] = [];
      for (let k = 0; k <= 10; k++) {
        const w = -0.009 + (k / 10) * 0.018;
        const q = add(hm.lips, add(scale(up2, sg * (gap + 0.0024 * (1 - (w / 0.009) ** 2))), scale(side, w)));
        pts.push(xform(T, q));
      }
      b.line(pts, C.verm(0.75), 2.2);
    }
  }
}

/** the review's views (scripts/shots-horn-3d.mjs), in the stage's units (the stage's lens): world points
 *  of the single pose */
function hornViews(hm: HornModel): Record<string, { yaw: number; pitch: number; dist: number; target: Vec3 }> {
  const W = (x: number, y: number, z: number) => xform(hm.T, F3(V(x, y, z))).map((v) => +v.toFixed(4)) as Vec3;
  const mid = W(80, 0, 20);
  return {
    // (the photographs' bearings: the player's side from a little round on the bell's side, the
    // audience's side square on)
    front: { yaw: Math.PI - 0.1, pitch: 0.02, dist: 0.95, target: mid },
    side: { yaw: Math.PI / 2, pitch: 0.02, dist: 0.95, target: mid },
    back: { yaw: 0.32, pitch: 0.04, dist: 0.95, target: mid },
    valves: { yaw: 0.25, pitch: 0.22, dist: 0.24, target: W(-60, 8, 24) },
    linkage: { yaw: -0.65, pitch: 0.3, dist: 0.2, target: W(-74, 10, 30) },
    caps: { yaw: Math.PI + 0.35, pitch: 0.2, dist: 0.26, target: W(-30, 6, -14) },
    leadpipe: { yaw: -0.5, pitch: 0.15, dist: 0.3, target: W(-108, 150, 12) },
    rim: { yaw: 0.75, pitch: 0.25, dist: 0.5, target: W(300, -20, 100) },
  };
}
