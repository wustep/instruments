// The trombone in 3D: a slide trombone in each of the engine's three sizes (TROMBONE_SIZES: the alto in E♭,
// the tenor in B♭ with its F attachment, the bass in B♭ with its F and D valves), built once per size at real
// scale (docs/3d-reference.md, "Trombone") and posed from the live state. Laid out from Yamaha's product
// photographs (the YSL-882OR and YSL-620 tenors, the YBL-822G bass, the YSL-871 alto), each scaled by its
// bell's published rim, checked against the published bores, bells and slides (Bach 42B / Conn 88H, Bach 50B3,
// Bach 39) and the engine's own tube lengths:
//
//   the hand slide: the inner slide (nickel silver under chrome, Ø bore + 0.6 mm), its tubes 82 mm apart on
//     the tenor (a replacement crook's published 85; the photographs' 72 is a projection), the mouthpiece's
//     receiver on the upper tube, the bell's lock nut (knurled) on the lower, the inner brace between them,
//     the cork barrels where the outer slide comes to rest, the slide lock, the stockings (the last 100 mm of
//     each inner tube, 0.3 mm fuller: Yamaha); the outer slide over it (lacquered brass, Ø 15.4 on the
//     tenor, its tops in nickel silver), the hand grip's brace, the crook (nickel silver) with its water key
//     (the nipple, the lever's cork pad, its saddle, hinge and spring) and the rubber bumper at its end;
//   the bell section, joined to the lower slide tube at the lock nut and turned about it out of the slide's
//     plane (as photographed, ≈36°; in the hand "slightly less than 90°", which puts the bell on the
//     player's left): the receiver and the neck back to the main tuning slide's bow (its nickel-silver
//     slide tubes, two stays, a counterweight), the bell tail forward from it, widening as the engine's
//     Bessel horn r ∝ (d + d₀)^−0.8 (d from the rim; 80 mm across 0.1 m from a tenor's rim) to the rim, rolled
//     over a bead wire; the bell brace from the bell tail down to the receiver, which the left hand holds;
//   the valves (the tenor's F attachment, the bass's F and, on the F loop, its D valve: dependent, as the
//     YBL-822G): rotary valves, the casing with its knuckles, the bottom cap on the far side, on the near side
//     the bearing plate, the stop plate with its two bumpers, the rotor's stop arm and crank; the thumb
//     lever on its post with its return spring, the ball-jointed link to the crank (a four-bar, solved so
//     the lever's travel turns the rotor a quarter turn); the open-wrap loop (the tenor: one large loop
//     behind the main tuning slide, its own tuning slide at the back, as the YSL-882OR's), each loop solved
//     to the tubing its valve adds (2.74 m × (2^(k/12) − 1): the F valve's 0.92 m);
//   the mouthpiece (silver plated: a 6½AL's 25.4 mm cup on the tenor, the engine's cups and throats).
//
// The routes are solved so the open tube, lips to rim with the slide closed, is the engine's (the tenor's
// and the bass's 2.74 m, the alto's 2.06 m).
//
// Live: the outer slide stands out by the engine's `trombone.slide` (moving at the engine's own speed between
// its frames), the levers of the valves the engine's chart takes go down on their springs (a small bounce
// off their stops) and their links turn the rotors a quarter turn, back a moment after the note; the lips
// buzz at the mouthpiece's rim with their opening (`fr.lips`); the bell's rim shimmers with the level.
// Approximations: the rotors' passages and the knuckles inside the valve are not traced tube by tube; the
// bell section's turn in the hand is one angle (players set their own); the player's hands are left out.
import { TROMBONE_SIZES, tromboneFingering, tromboneSlideOut, tromboneTubeLength, type TromboneBore, type TromboneSize, type VisualFrame } from '@piano-model/engine';
import { INK } from '../stage-draw.ts';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, add, chain, cross, dot, ink, mulInto, norm, rotX, scale, sub, translate, xform } from './gl3d.ts';
import { M, MeshBuilder, cyl, ellipsoid, grid, type Mat } from './mesh.ts';
import { aboutAxis, fillet, springTo } from './oboe3d.ts';
import { F3, FLIP, arcLen, bend, bezier, boxOf, brace, ferrule, latheOn, make, refine, tubeAlong, tubeAlongBar } from './horn3d.ts';
import type { WindPose } from './winds3d.ts';

type P2 = [number, number];
const TAU = Math.PI * 2;
const mm = 0.001;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- materials
/** lacquered yellow brass, handled (uv.y: where the hands hold it, fingerprints in the coat) */
const BR = M.hornBrass;
/** the bell's rim: burnished brass under a hard lacquer */
const BELL = M.brassBell;
const NS = M.nickelSilver;
const NSS = M.nickelSatin;
const KN = M.nickelKnurl;
/** the inner slides: nickel silver under chrome */
const CHR = M.slideChrome;
const AG = M.silverPolish;
const BORE = M.boreDark;
const STEEL = M.steel;
const RUBBER = M.rubber;
const CORK = M.cork;

// ---------------------------------------------------------------- small helpers (mm)
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const Vm = (p: Vec3): Vec3 => [p[0] * mm, p[1] * mm, p[2] * mm];
/** a tube along a path in mm, its outer radius in mm (a number, or by arc length s and fraction f) */
function tube(mb: MeshBuilder, pts: Vec3[], r: number | ((s: number, f: number) => number), m: Mat, seg = 28, opt: { hand?: (f: number) => number; cap0?: boolean; cap1?: boolean } = {}): void {
  tubeAlong(mb, pts.map(Vm), typeof r === 'number' ? () => r * mm : (s, f) => r(s / mm, f) * mm, m, seg, opt);
}
/** a solid of revolution about the axis through p (mm) along dir, its profile [radius, along] in mm,
 *  its corners rounded by `fr` mm */
function lathe(mb: MeshBuilder, p: Vec3, dir: Vec3, prof: P2[], seg: number, m: Mat, fr?: number | number[]): void {
  const pm = prof.map(([r, s]) => [r * mm, s * mm] as P2);
  latheOn(mb, Vm(p), norm(dir), fr === undefined ? pm : fillet(pm, Array.isArray(fr) ? fr.map((x) => x * mm) : fr * mm, 3), seg, m);
}
/** a straight run of points from a to b, at most `step` mm apart */
const run = (a: Vec3, b: Vec3, step = 8): Vec3[] => refine([a, b], step);
/** the length of a path that joins pieces end to start (their shared points once) */
const join = (...ps: Vec3[][]): Vec3[] => ps.reduce((acc, p) => (acc.length ? [...acc, ...p.slice(1)] : [...p]), [] as Vec3[]);

// ================================================================ the measures (mm)
/** a valve: on its line (the main line, or the F loop's lower run: the bass's D valve is dependent, as the
 *  YBL-822G's), its loop running back behind the bell section's plane (w) at two heights */
interface ValveDef {
  /** along the slide (u) and the line it sits on: its height (v) and depth (w) */
  u: number;
  lineV: number;
  lineW: number;
  /** semitones the loop lowers the tube by (with the valves before it in the line down) */
  semis: number;
  /** the loop's runs: their heights and depth */
  vHi: number;
  vLo: number;
  w: number;
  /** the valve whose loop this valve's line is (−1: the main line) */
  on: number;
  /** the thumb lever's pivot from the valve's centre (u, v), and the paddle's direction from the pivot */
  pivot: P2;
  paddle: P2;
}
interface Layout {
  /** the slide's tubes, centre to centre; the receiver's end (tube A's top, x = 0) to the outer slide's
   *  top at first position; the outer tubes' length beyond the slide's travel (the inner tubes' least
   *  overlap); tube B's top (the bell's lock nut) behind tube A's */
  S: number;
  top: number;
  over: number;
  bLock: number;
  /** the bell's rim forward of tube A's top; its axis from tube B's line in the bell section's plane; that
   *  plane turned from the slide's as photographed and as held (deg); the main tuning slide's tubes */
  rimX: number;
  vb: number;
  beta: number;
  held: number;
  slideTubes: number;
  /** the bell brace (u) */
  brace: number;
  /** the mouthpiece: its length, its rim's outer diameter, how far its shank goes into the receiver */
  mp: { L: number; rim: number; ins: number };
  /** the bell's bead wire */
  bead: number;
  valves: ValveDef[];
  /** a counterweight on the main tuning slide */
  weight: boolean;
}
// (Yamaha's photographs, scaled by the bells: the tenor's rim 513 mm behind the crook's end, the bell's axis
// 141 mm above the lower slide tube in the picture, 1175 mm overall; the bass's 506, 155, 1150; the alto's
// 392, 121, 854. The bell section's plane is turned out of the slide's until the upper slide tube clears the
// rim, as the photographs show it passing in front of the bell)
const LAYOUT: Record<TromboneSize, Layout> = {
  alto: { S: 54, top: 62, over: 28, bLock: -16, rimX: 210, vb: 141, beta: 31, held: 80, slideTubes: 75, brace: -44, mp: { L: 80, rim: 35, ins: 20 }, bead: 2.0, valves: [], weight: false },
  tenor: {
    S: 82, top: 80, over: 30, bLock: -23, rimX: 296, vb: 175, beta: 36, held: 82, slideTubes: 95, brace: -54, mp: { L: 84, rim: 38.5, ins: 23 }, bead: 2.4, weight: true,
    valves: [{ u: -102, lineV: 0, lineW: 0, semis: 5, vHi: 136, vLo: 9, w: -22, on: -1, pivot: [48, 30], paddle: [-1, 0.12] }],
  },
  bass: {
    S: 84, top: 84, over: 30, bLock: -25, rimX: 308, vb: 191, beta: 36, held: 82, slideTubes: 100, brace: -52, mp: { L: 90, rim: 41, ins: 25 }, bead: 2.6, weight: true,
    valves: [
      { u: -96, lineV: 0, lineW: 0, semis: 5, vHi: 150, vLo: 36, w: -23, on: -1, pivot: [44, 30], paddle: [-1, 0.12] },
      { u: -176, lineV: 36, lineW: -23, semis: 8, vHi: 108, vLo: 64, w: -48, on: 0, pivot: [40, 34], paddle: [-0.55, -1] },
    ],
  },
};

/** everything about one size, in mm */
interface Dims {
  size: TromboneSize;
  B: TromboneBore;
  L: Layout;
  bore: number;
  /** outer radii: the inner slide's tubes, the outer slide's, the bell section's tubing */
  rIn: number;
  rOut: number;
  rT: number;
  travel: number;
  /** the outer tubes' straight length, and where they end (the crook's start) at first position */
  lo: number;
  xe: number;
  /** the bell's rim radius (outside its bead) */
  R: number;
  /** the main tuning slide's straight legs end at u = −d (solved) */
  d: number;
  /** each valve's loop: its U's back (u, solved) */
  dl: number[];
  /** the valves' casings: radius and half height */
  Rc: number;
  Hc: number;
}
const dimsOf = (size: TromboneSize): Dims => {
  const B = TROMBONE_SIZES[size];
  const L = LAYOUT[size];
  const bore = B.bore / mm;
  const travel = B.travel / mm;
  const lo = travel + L.over;
  const rT = (bore + 1.3) / 2;
  return { size, B, L, bore, rIn: (bore + 0.6) / 2, rOut: (bore + 1.5) / 2, rT, travel, lo, xe: L.top + lo, R: B.bell / mm / 2, d: 200, dl: L.valves.map(() => 300), Rc: rT + 8, Hc: rT + 9.5 };
};

// ================================================================ the bell section's frame
/** The bell section is built in its own frame: u along the slide (x), v from tube B's line towards the
 *  bell (in its plane), w out of its plane towards the slide's side. It is placed by a turn about tube B's
 *  line (the lock nut's joint), `beta` from the slide's plane: in the slide's frame (mm, x along the slide,
 *  y up, z the player's right) a point (u, v, w) is at (u, −S + v cos β + w sin β, −v sin β + w cos β) */
const bellToSlide = (D: Dims, beta: number): Mat4 => {
  // (in the model the slide's frame is z-flipped: FLIP · R · FLIP)
  const R = chain(translate(0, -D.L.S * mm, 0), rotX(-beta * DEG));
  return chain(FLIP, R, FLIP);
};

/** the bell's outer radius (mm) at u along its axis: the tuning slide's tubing, then the engine's Bessel
 *  horn (r ∝ (d + d₀)^−ε, d from the rim) scaled to meet the rim */
function bellRadius(D: Dims, u: number): number {
  const d0 = D.B.flareD0 / mm;
  const bes = (x: number) => (d0 / (Math.max(0, x) + d0)) ** D.B.flare;
  const u0 = -D.d + D.L.slideTubes;
  const bJ = bes(D.L.rimX - u0);
  if (u <= u0) return D.rT;
  return D.rT + (D.R - D.L.bead - D.rT) * clamp01((bes(D.L.rimX - u) - bJ) / (1 - bJ));
}

// ================================================================ routes (the bell section's frame, mm)
interface Route {
  name: string;
  pts: Vec3[];
  r: number;
  m: Mat;
  hand?: (f: number) => number;
}
/** a valve's centre, and a port on its casing at an angle (deg, in the (u, v) plane: 0 forward, 90 towards
 *  the bell) and how far out from the casing's wall */
const vCentre = (D: Dims, i: number): Vec3 => {
  const v = D.L.valves[i];
  return [v.u, v.lineV, v.lineW];
};
const port = (D: Dims, i: number, deg: number, out = 0): Vec3 => {
  const c = vCentre(D, i);
  const r = D.Rc + out;
  return [c[0] + r * Math.cos(deg * DEG), c[1] + r * Math.sin(deg * DEG), c[2]];
};
const pdir = (deg: number): Vec3 => [Math.cos(deg * DEG), Math.sin(deg * DEG), 0];
/** the ports: the line through the casing (in from the front, out at the back) and the loop's (out at the
 *  front-top, back in at the back-top) */
const PORT_IN = 0;
const PORT_OUT = 180;
const LOOP_OUT = 62;
const LOOP_IN = 118;
/** the passage through a rotor, port to port a quarter turn round (mm) */
const passage = (D: Dims) => 0.5 * Math.PI * D.Rc * 0.9;
/** into a port (from `from` heading `t0`), the last few mm straight in */
const intoPort = (D: Dims, i: number, deg: number, from: Vec3, t0: Vec3, k = 24): Vec3[] => {
  const p1 = port(D, i, deg, 6);
  return join(bezier(from, t0, p1, scale(pdir(deg), -1), k), run(p1, port(D, i, deg, 0), 3));
};
const outOfPort = (D: Dims, i: number, deg: number, to: Vec3, t1: Vec3, k = 24): Vec3[] => {
  const p0 = port(D, i, deg, 6);
  return join(run(port(D, i, deg, 0), p0, 3), bezier(p0, pdir(deg), to, t1, k));
};

/** the main line: the bell's receiver back through the valves on it to the tuning slide's lower leg (u = −d) */
function mainLine(D: Dims): Vec3[][] {
  const L = D.L;
  const start: Vec3 = [L.bLock - 34, 0, 0];
  const end: Vec3 = [-D.d, 0, 0];
  const onMain = L.valves.map((v, i) => (v.on < 0 ? i : -1)).filter((i) => i >= 0);
  if (!onMain.length) return [run(start, end, 10)];
  const out: Vec3[][] = [];
  let at = start;
  let t: Vec3 = [-1, 0, 0];
  for (const i of onMain) {
    out.push(intoPort(D, i, PORT_IN, at, t));
    at = port(D, i, PORT_OUT, 6);
    t = pdir(PORT_OUT);
    // (the next piece starts at the far port)
    out.push(run(port(D, i, PORT_OUT, 0), at, 3));
  }
  const uT = Math.max(-D.d + 2, at[0] - 40);
  const tail = bezier(at, t, [uT, 0, 0], [-1, 0, 0], 20);
  out.push(uT > -D.d + 3 ? join(tail, run(tail[tail.length - 1], end, 10)) : tail);
  return out;
}
/** a valve's loop: out of its front-top port, up and back along the upper run, round its U at u = −dl, forward
 *  along the lower run, and up into its back-top port; a dependent valve's own line is its parent loop's
 *  lower run, which passes through it */
function loopPieces(D: Dims, i: number): Vec3[][] {
  const V = D.L.valves[i];
  const c = vCentre(D, i);
  const dl = D.dl[i];
  const ru = (V.vHi - V.vLo) / 2;
  const hiStart: Vec3 = [c[0] - 22, V.vHi, V.w];
  const up = outOfPort(D, i, LOOP_OUT, hiStart, [-1, 0, 0], 30);
  const hi = run(hiStart, [-dl, V.vHi, V.w], 10);
  const u: Vec3[] = [];
  for (let k = 0; k <= 36; k++) {
    const a = Math.PI / 2 + (Math.PI * k) / 36;
    u.push([-dl + ru * Math.cos(a), (V.vHi + V.vLo) / 2 + ru * Math.sin(a), V.w]);
  }
  const loEnd: Vec3 = [c[0] - 46, V.vLo, V.w];
  // a dependent valve sits on this loop's lower run: the run passes through it
  const child = D.L.valves.findIndex((v) => v.on === i);
  if (child >= 0) {
    const cc = vCentre(D, child);
    const lo1 = run([-dl, V.vLo, V.w], [cc[0] - 40, V.vLo, V.w], 10);
    // (the run goes through the dependent valve as the main line goes through the first: in at its back,
    // out at its front)
    const into = intoPort(D, child, PORT_OUT, lo1[lo1.length - 1], [1, 0, 0]);
    const outP = outOfPort(D, child, PORT_IN, [cc[0] + 34, V.vLo, V.w], [1, 0, 0]);
    const lo2 = run([cc[0] + 34, V.vLo, V.w], loEnd, 10);
    const back = intoPort(D, i, LOOP_IN, loEnd, [1, 0, 0], 30);
    return [join(up, hi, u), join(lo1, into), join(outP, lo2, back)];
  }
  const lo = run([-dl, V.vLo, V.w], loEnd, 10);
  const back = intoPort(D, i, LOOP_IN, loEnd, [1, 0, 0], 30);
  return [join(up, hi, u, lo, back)];
}
/** the open tube's length, lips to rim, slide closed (mm) */
function openLength(D: Dims): number {
  const L = D.L;
  const nMain = L.valves.filter((v) => v.on < 0).length;
  const main = mainLine(D).reduce((a, p) => a + arcLen(p), 0) + nMain * passage(D);
  return L.mp.L + (D.xe - L.mp.ins) + (Math.PI * L.S) / 2 + (D.xe - L.bLock) + main + (Math.PI * L.vb) / 2 + (D.d + L.rimX);
}
/** what a valve's loop adds to the tube (mm), its own valve's passages counted */
function loopLength(D: Dims, i: number): number {
  const ps = loopPieces(D, i);
  const child = D.L.valves.findIndex((v) => v.on === i);
  return ps.reduce((a, p) => a + arcLen(p), 0) + passage(D) + (child >= 0 ? passage(D) : 0);
}
/** what a valve's loop must add: the open tube with the valves to it down, lowered by its semitones, less the
 *  tube already there (a dependent valve: the F side's) */
function loopTarget(D: Dims, i: number): number {
  const V = D.L.valves[i];
  const L0 = D.B.length / mm;
  const before = V.on < 0 ? 0 : D.L.valves[V.on].semis;
  return L0 * (2 ** (V.semis / 12) - 2 ** (before / 12));
}
/** solve the tuning slide's legs (d) for the open tube, then each loop's back (dl) for its valve */
function solve(D: Dims): void {
  const want = D.B.length / mm;
  let lo = 40;
  let hi = 600;
  for (let k = 0; k < 40; k++) {
    D.d = (lo + hi) / 2;
    if (openLength(D) < want) lo = D.d;
    else hi = D.d;
  }
  D.d = (lo + hi) / 2;
  // (a dependent valve's loop is solved first: its parent's length counts its line's run, not its loop)
  const order = D.L.valves.map((_, i) => i).sort((a, b) => D.L.valves[b].on - D.L.valves[a].on);
  for (const i of order) {
    let a = 60;
    let b = 900;
    for (let k = 0; k < 40; k++) {
      D.dl[i] = (a + b) / 2;
      if (loopLength(D, i) < loopTarget(D, i)) a = D.dl[i];
      else b = D.dl[i];
    }
    D.dl[i] = (a + b) / 2;
  }
}

// ================================================================ the model
export interface TromboneValve {
  /** the rotor's turning part (the spindle's end, the stop arm, the crank and its ball), the lever, the link */
  rotor: Mesh;
  lever: Mesh;
  link: Mesh;
  /** the rotor's axis and centre, the lever's pivot (the bell section's frame, m: as built, unflipped) */
  axis: Vec3;
  centre: Vec3;
  pivot: Vec3;
  /** the four-bar: the crank's turn (deg) for the lever's travel 0 … 1 (41 steps), the link's length (mm) */
  table: Float32Array;
  L0: number;
  /** the lever's travel (deg) that turns the rotor a quarter turn */
  travel: number;
  /** the lever's crank tip and the rotor's crank ball at rest (the bell section's frame, mm) */
  tip: Vec3;
  ball: Vec3;
}
export interface TromboneModel {
  size: TromboneSize;
  /** the measures (mm) */
  dims: Dims;
  /** the pose on the stage on its own (product photograph's: the bell section turned as photographed) */
  T: Mat4;
  /** held as a seated player holds it (relative to its seat: the lips at the seat's origin) */
  held: Mat4;
  /** the slide's statics (the inner slide, the mouthpiece) and the outer slide (moves along x by the slide) */
  slideStatics: Mesh[];
  outer: Mesh;
  /** the bell section's statics, its rim (shimmers with the level), placed by `bellT` (solo) or `bellHeld` */
  bellStatics: Mesh[];
  rim: Mesh;
  bellT: Mat4;
  bellHeld: Mat4;
  valves: TromboneValve[];
  /** the mouthpiece's rim (the lips' place) and its axis, in the model */
  lips: Vec3;
  lipAxis: Vec3;
  /** the slide's reach beyond first position (m) */
  travel: number;
  /** bounds on its own (the slide all the way out) */
  bounds: { c: Vec3; r: number };
  /** measures for the tests (mm): the open tube, each loop, the slide's tubes, the bell */
  measures: { open: number; loops: number[]; loopWant: number[]; spacing: number; outerOD: number; innerOD: number; bell: number; overall: number; rimToCrook: number; d: number };
}

/** the inner slide: the receiver on tube A, the inner tubes (chrome) with their stockings, the cork barrels,
 *  the inner brace, the bell's lock nut on tube B, the slide lock; the mouthpiece */
function innerSlide(mb: MeshBuilder, D: Dims): void {
  const { L, rIn, rOut } = D;
  const X: Vec3 = [1, 0, 0];
  const yB = -L.S;
  const end = D.xe - 18;
  // the receiver: a nickel-silver sleeve on tube A's top, its mouth rounded, two bands
  lathe(mb, [0, 0, 0], X, [[rIn - 0.3, -0.5], [rIn + 3.0, 0], [rIn + 3.4, 1.2], [rIn + 3.4, 5], [rIn + 2.4, 6.4], [rIn + 2.4, 31], [rIn + 3.0, 32.4], [rIn + 3.0, 36], [rIn + 1.2, 38.5], [rIn, 40]], 40, NS, 0.5);
  // the inner tubes: chrome, the last 100 mm a stocking (0.15 mm fuller), the end bevelled
  for (const [y, x0] of [[0, 38], [yB, L.bLock + 10]] as const) {
    lathe(mb, [0, y, 0], X, [[rIn, x0], [rIn, end - 100], [rIn + 0.15, end - 99], [rIn + 0.15, end - 1], [rIn - 0.4, end], [rIn - 0.9, end]], 36, CHR);
    // the cork barrel: where the outer slide comes to rest (a sleeve, its cork's face at the end)
    lathe(mb, [0, y, 0], X, [[rIn, L.top - 26], [rOut + 0.9, L.top - 25], [rOut + 1.2, L.top - 23], [rOut + 1.2, L.top - 3], [rOut + 0.4, L.top - 0.6], [rIn + 0.5, L.top - 0.4]], 40, NS, 0.4);
    lathe(mb, [0, y, 0], X, [[rIn + 0.5, L.top - 0.4], [rOut - 0.3, L.top - 0.3]], 40, CORK);
  }
  // the bell's lock nut on tube B (knurled), and the tube's collar under it
  lathe(mb, [0, yB, 0], X, [[rIn, L.bLock - 2], [rIn + 4.2, L.bLock - 1], [rIn + 4.6, L.bLock + 1], [rIn + 4.6, L.bLock + 9], [rIn + 3.6, L.bLock + 10.5], [rIn, L.bLock + 11]], 48, NS, 0.5);
  lathe(mb, [0, yB, 0], X, [[rIn + 4.75, L.bLock + 2.2], [rIn + 4.75, L.bLock + 7.8]], 72, KN);
  // the slide lock: a knurled collar that turns on tube B, its latch hook reaching forward to the outer
  // slide's pin
  const lk = L.top - 46;
  lathe(mb, [0, yB, 0], X, [[rIn, lk], [rIn + 2.4, lk + 0.5], [rIn + 2.6, lk + 2], [rIn + 2.6, lk + 9], [rIn + 2.0, lk + 10.5], [rIn, lk + 11]], 40, NS, 0.4);
  lathe(mb, [0, yB, 0], X, [[rIn + 2.7, lk + 3], [rIn + 2.7, lk + 8]], 64, KN);
  const hook = [Vm([lk + 9, yB - rIn - 2.2, 1.5]), Vm([lk + 20, yB - rIn - 2.6, 1.5]), Vm([lk + 26, yB - rIn - 1.2, 1.5]), Vm([lk + 27, yB - rIn + 0.6, 1.5])];
  tubeAlongBar(mb, refine(hook, 0.0015), 1.4, 0.55, NS);
  // the inner brace between the tubes' tops, nickel-silver collars where it meets them
  const xb = 20;
  for (const y of [0, yB]) lathe(mb, [xb - 7, y, 0], X, [[rIn - 0.2, 0], [rIn + 1.3, 0.3], [rIn + 1.3, 13.7], [rIn - 0.2, 14]], 32, NS, 0.4);
  brace(mb, [xb, -rIn - 1.0, 0], [xb, yB + rIn + 1.0, 0], 2.9, BR);
  // ---- the mouthpiece (silver), its shank in the receiver, its rim towards the player
  const { L: Lm, rim, ins } = L.mp;
  const cupR = D.B.cup / mm / 2;
  const thr = D.B.throat / mm / 2;
  const sh = D.B.shank / mm / 2;
  const cd = D.B.cupDepth / mm;
  const base: Vec3 = [ins, 0, 0];
  const back: Vec3 = [-1, 0, 0];
  const R = rim / 2;
  // (the outside: the shank's taper 1:20, its collar, the cup's body flaring to the rim, the rim's round)
  lathe(mb, base, back, [[sh, 0], [sh + 1.2, ins + 10], [sh + 1.6, ins + 12], [sh + 2.1, ins + 13.5], [sh + 2.4, ins + 16], [sh + 3.6, Lm - 26], [cupR + 3.2, Lm - 15], [R - 0.8, Lm - 6.5], [R, Lm - 4.2], [R, Lm - 2.2], [R - 1.2, Lm - 0.4], [R - 3.2, Lm]], 48, AG, [0, 0.4, 0.6, 0.5, 1.5, 6, 6, 2, 1.2, 1.4, 1.2, 0]);
  // the cup: from the rim's inner edge down to the throat, then the backbore into the dark
  lathe(mb, base, back, [[R - 3.2, Lm], [cupR, Lm - 1.2], [cupR - 0.4, Lm - 3], [cupR - 2.6, Lm - cd * 0.55], [thr + 2.6, Lm - cd], [thr, Lm - cd - 3.5], [thr, Lm - cd - 9]], 48, AG, [0, 1.2, 1.5, 3, 2.5, 1, 0]);
  lathe(mb, base, back, [[thr, Lm - cd - 9], [0, Lm - cd - 14]], 20, BORE);
}

/** the outer slide (built at first position): its tubes (nickel-silver tops, lacquered brass), the hand
 *  grip's brace, the crook (nickel silver) with its ferrules, the rubber bumper, the water key, the lock's pin */
function outerSlide(mb: MeshBuilder, D: Dims): void {
  const { L, rOut, xe } = D;
  const X: Vec3 = [1, 0, 0];
  const yB = -L.S;
  const t0 = L.top;
  // (the right hand holds the grip: fingerprints on the tubes round it)
  for (const y of [0, yB]) {
    // the top: a nickel-silver sleeve, its lip rounded where it meets the cork barrel
    lathe(mb, [0, y, 0], X, [[rOut - 0.6, t0], [rOut + 0.6, t0 + 0.4], [rOut + 0.95, t0 + 2], [rOut + 0.95, t0 + 7], [rOut + 0.55, t0 + 8.5], [rOut + 0.55, t0 + 44], [rOut, t0 + 46]], 40, NS, 0.4);
    // the tube: lacquered brass to the crook's ferrule
    const pts: Vec3[] = run([t0 + 45, y, 0], [xe - 3, y, 0], 40);
    tube(mb, pts, rOut, BR, 40, { hand: (f) => 0.85 * Math.exp(-((((f * (xe - t0 - 48)) - 20) / 90) ** 2)) });
    ferrule(mb, Vm([xe - 6, y, 0]), X, rOut, 12, NS);
  }
  // the hand grip: a brace between the tubes near their tops, collars round each
  const xg = t0 + 26;
  for (const y of [0, yB]) lathe(mb, [xg - 8, y, 0], X, [[rOut - 0.2, 0], [rOut + 1.1, 0.3], [rOut + 1.1, 15.7], [rOut - 0.2, 16]], 32, NS, 0.4);
  brace(mb, [xg, -rOut - 0.9, 0], [xg, yB + rOut + 0.9, 0], 3.3, BR);
  // the crook: a half circle in nickel silver (its centre line S/2 round), ferrules at both ends
  const cr: Vec3[] = [];
  for (let k = 0; k <= 48; k++) {
    const a = Math.PI / 2 - (Math.PI * k) / 48;
    cr.push([xe + (L.S / 2) * Math.cos(a), yB / 2 + (L.S / 2) * Math.sin(a), 0]);
  }
  tube(mb, join(run([xe - 3, 0, 0], [xe, 0, 0], 3), cr, run([xe, yB, 0], [xe - 3, yB, 0], 3)), rOut, NS, 40);
  // the bumper: a rubber cap on the crook's end
  lathe(mb, [xe + L.S / 2 + rOut - 2.2, yB / 2, 0], X, [[0, 0], [5.6, 0], [6.0, 1.4], [5.6, 4.6], [4.2, 6.6], [0, 7.2]], 32, RUBBER, [0, 0.4, 1, 2, 1.6, 0]);
  waterKey(mb, D);
  // the lock's pin on tube B's sleeve (the latch on the inner slide catches it)
  cyl(mb, Vm([t0 + 6, yB - rOut - 0.5, 1.5]), Vm([t0 + 6, yB - rOut - 3.6, 1.5]), 0.0011, 0.0011, 14, NS, true);
}

/** the water key on the crook, by tube B: its nipple, the lever's cork pad pressed on it, the saddle with its
 *  hinge pin and coil spring, the lever back along the tube to its paddle */
function waterKey(mb: MeshBuilder, D: Dims): void {
  const { L, rOut, xe } = D;
  const yB = -L.S;
  const a = -62 * DEG;
  const c: Vec3 = [xe, yB / 2, 0];
  const P: Vec3 = add(c, [(L.S / 2) * Math.cos(a), (L.S / 2) * Math.sin(a), 0]);
  const n: Vec3 = [Math.cos(a), Math.sin(a), 0];
  const t: Vec3 = [-Math.sin(a), Math.cos(a), 0];
  cyl(mb, Vm(add(P, scale(n, rOut - 1))), Vm(add(P, scale(n, rOut + 3.2))), 0.0024, 0.002, 18, NS);
  const cup = add(P, scale(n, rOut + 5.8));
  lathe(mb, cup, scale(n, -1), [[0, -1.4], [3.6, -1.3], [4.1, -0.5], [4.1, 1.7], [3.8, 1.9]], 28, NS, [0, 0.9, 0.5, 0.2, 0]);
  lathe(mb, cup, scale(n, -1), [[0, 1.8], [3.8, 1.8], [3.8, 0.5]], 28, CORK);
  // the lever back along tube B's underside: the saddle soldered to the tube 20 mm behind the crook's ferrule
  const hingeX = xe - 24;
  const hinge: Vec3 = [hingeX, yB - rOut - 3.4, 0];
  const lev = bend([add(cup, scale(n, 1.6)), add(add(cup, scale(n, 2.2)), scale(t, -7)), hinge, [hingeX - 14, yB - rOut - 5.5, 0], [hingeX - 22, yB - rOut - 8.6, 0]], [5, 6, 6], 8);
  tubeAlongBar(mb, refine(lev.map(Vm), 0.0015), 2.3, 0.9, NS);
  // the paddle: a rounded pad at the lever's end
  ellipsoid(mb, Vm([hingeX - 24, yB - rOut - 9.3, 0]), [0.0058, 0.0018, 0.0046], 20, NSS);
  // the saddle: two cheeks on a foot, the pin through them, the spring round the pin
  for (const s of [-1, 1]) {
    cyl(mb, Vm([hingeX, yB - rOut + 0.6, s * 2.4]), Vm([hingeX, yB - rOut - 3.4, s * 2.4]), 0.0011, 0.001, 10, NS, true);
  }
  lathe(mb, [hingeX - 4, yB - rOut + 0.2, 0], [1, 0, 0], [[0, 0], [3.6, 0], [3.6, 8], [0, 8]], 12, NS, 0.6);
  cyl(mb, Vm([hingeX, hinge[1], -3.2]), Vm([hingeX, hinge[1], 3.2]), 0.00068, 0.00068, 10, STEEL, true);
  const coil: Vec3[] = [];
  for (let k = 0; k <= 64; k++) {
    const q = (k / 16) * TAU;
    coil.push(Vm([hingeX + 1.15 * Math.cos(q), hinge[1] + 1.15 * Math.sin(q), lerp(-1.7, 1.7, k / 64)]));
  }
  tubeAlong(mb, coil, () => 0.00028, STEEL, 8);
}

/** the bell section (its own frame): the receiver and the main line, the main tuning slide with its stays and
 *  counterweight, the bell tail (the flare is lathed separately), the bell brace, the valves' casings, the
 *  loops with their tuning slides */
function bellSection(mb: MeshBuilder, D: Dims): void {
  const { L, rT } = D;
  const X: Vec3 = [1, 0, 0];
  const rS = rT + 0.95;
  // the receiver: the nickel-silver sleeve the lock nut screws onto, back to the main line
  lathe(mb, [L.bLock - 36, 0, 0], X, [[rT - 0.2, 0], [rT + 1.1, 0.6], [rT + 1.1, 3], [rT + 0.7, 4], [rT + 0.7, 26], [rT + 1.6, 27.2], [rT + 1.6, 34.6], [D.rIn + 0.2, 36]], 40, NS, 0.4);
  // the main line, the receiver to the tuning slide's lower leg, through the valves on it
  const handNear = (f: number) => 0.7 * Math.exp(-((f / 0.25) ** 2));
  mainLine(D).forEach((p, k) => tube(mb, p, rT, BR, 28, k === 0 ? { hand: handNear } : {}));
  // ---- the main tuning slide: the bow (brass) and its outer tubes (nickel silver), ferrules
  const u0 = -D.d;
  const ru = L.vb / 2;
  const bow: Vec3[] = [];
  for (let k = 0; k <= 56; k++) {
    const a = -Math.PI / 2 - (Math.PI * k) / 56;
    bow.push([u0 + 4 + ru * Math.cos(a), ru + ru * Math.sin(a), 0]);
  }
  tube(mb, join(run([u0 + 6, 0, 0], [u0 + 4, 0, 0], 2), bow, run([u0 + 4, L.vb, 0], [u0 + 6, L.vb, 0], 2)), rS, BR, 32);
  for (const v of [0, L.vb]) {
    lathe(mb, [u0 + 2, v, 0], X, [[rS - 0.3, 0], [rS + 0.8, 0.4], [rS + 0.8, 7], [rS, 8.2], [rS, L.slideTubes - 9], [rS + 0.8, L.slideTubes - 8], [rS + 0.8, L.slideTubes - 1], [rT - 0.2, L.slideTubes]], 36, NS, 0.35);
  }
  // two stays between the slide's legs (as the YSL-882OR's), a counterweight clamped on the rear one
  for (const du of [16, L.slideTubes - 16]) {
    const u = u0 + du;
    brace(mb, [u, rS + 0.4, 0], [u, L.vb - bellRadius(D, u) - 0.4, 0], 2.4, BR);
    for (const v of [0, L.vb]) lathe(mb, [u - 5, v, 0], X, [[rS - 0.2, 0], [rS + 1.1, 0.3], [rS + 1.1, 9.7], [rS - 0.2, 10]], 28, NS, 0.35);
  }
  if (L.weight) {
    // (a brass weight clamped on the rear stay, as players add to balance the slide: rounded ends, a knurled
    // band where it is gripped to turn it on)
    const u = u0 + 16;
    const v = L.vb * 0.44;
    lathe(mb, [u, v, 0], [0, 1, 0], [[2.4, 0], [6.5, 0.3], [9.2, 2.2], [9.8, 5], [9.8, 19], [9.2, 21.8], [6.5, 23.7], [2.4, 24]], 48, BR, [0, 1.2, 2, 1.2, 1.2, 2, 1.2, 0]);
    lathe(mb, [u, v, 0], [0, 1, 0], [[9.9, 8.5], [9.9, 15.5]], 96, KN);
  }
  // ---- the bell brace: a nickel-silver post from the receiver up to the bell tail, a knurled ring at its
  // middle (the left hand's grip), feet soldered to both
  const ub = L.brace;
  const top = L.vb - bellRadius(D, ub);
  brace(mb, [ub, rT + 0.2, 0], [ub, top - 0.2, 0], 3.1, NS);
  lathe(mb, [ub, (rT + top) / 2 - 7, 0], [0, 1, 0], [[3, 0], [4.6, 0.4], [4.8, 1.4], [4.8, 12.6], [4.6, 13.6], [3, 14]], 40, NS, 0.5);
  lathe(mb, [ub, (rT + top) / 2 - 7, 0], [0, 1, 0], [[4.9, 3], [4.9, 11]], 64, KN);
  diamond(mb, D, ub);
  // ---- the valves' casings and the loops
  D.L.valves.forEach((_, i) => {
    valveCasing(mb, D, i);
    loopPieces(D, i).forEach((p) => tube(mb, p, rT, BR, 28));
    loopSlide(mb, D, i);
  });
}

/** the diamond foot plate where the bell brace meets the bell tail (a rhombus of sheet brass, bent round the
 *  tube and soldered) */
function diamond(mb: MeshBuilder, D: Dims, ub: number): void {
  const v0 = D.L.vb;
  const P = (s: number, t: number, lift: number): Vec3 => {
    const u = ub + s * 15;
    const rr = bellRadius(D, u) + lift;
    const ang = -Math.PI / 2 + t * 0.62;
    return Vm([u, v0 + rr * Math.sin(ang), rr * Math.cos(ang)]);
  };
  const shape = (u: number, v: number): [number, number] => {
    // a rhombus: |s| + |t| ≤ 1, (u, v) ∈ [0, 1]² mapped onto it
    const s = 2 * u - 1;
    const half = 1 - Math.abs(s);
    return [s, (2 * v - 1) * Math.max(0.02, half)];
  };
  grid(mb, 16, 8, (u, v) => {
    const [s, t] = shape(u, v);
    return P(s, t, 0.65 * (1 - Math.abs(s)) ** 0.3 * Math.max(0.2, 1 - Math.abs(t)));
  }, NS);
}

/** a valve's casing (static): the body with its bands, the bottom cap on the far side (−w), the bearing
 *  plate, its screws and the stop plate with two rubber bumpers on the near side (+w); collars at the ports */
function valveCasing(mb: MeshBuilder, D: Dims, i: number): void {
  const c = vCentre(D, i);
  const R = D.Rc;
  const H = D.Hc;
  const W: Vec3 = [0, 0, 1];
  lathe(mb, c, W, [[R - 0.4, -H], [R + 0.7, -H + 0.3], [R + 0.7, -H + 4.6], [R, -H + 5.4], [R, -2.3], [R + 0.45, -1.8], [R + 0.45, 1.8], [R, 2.3], [R, H - 5.4], [R + 0.7, H - 4.6], [R + 0.7, H - 0.3], [R - 0.4, H]], 64, BR, 0.3);
  // the bottom cap: a knurled skirt, a domed face, a button
  lathe(mb, c, W, [[R - 0.4, -H], [R + 1.2, -H - 0.4], [R + 1.4, -H - 5], [R + 0.6, -H - 6.4], [R - 3.6, -H - 7.6], [5.6, -H - 8.4], [3.6, -H - 8.7], [3.6, -H - 10.4], [2.7, -H - 10.9], [0, -H - 11]], 64, NS, [0, 0.4, 0.5, 0.9, 3, 2, 0.6, 0.4, 0.8, 0]);
  lathe(mb, c, W, [[R + 1.5, -H - 1.2], [R + 1.5, -H - 4.2]], 112, KN);
  // the bearing plate and its boss
  lathe(mb, c, W, [[R - 0.4, H], [R + 1.0, H + 0.3], [R + 1.0, H + 2.8], [R - 1.0, H + 3.6], [5.6, H + 3.8], [4.4, H + 5.4], [3, H + 5.8], [0, H + 5.8]], 64, BR, [0, 0.3, 0.5, 1.2, 0.8, 0.6, 0]);
  for (const a of [30, 210]) {
    const p: Vec3 = [c[0] + (R - 4.6) * Math.cos(a * DEG), c[1] + (R - 4.6) * Math.sin(a * DEG), c[2] + H + 3.6];
    lathe(mb, p, W, [[0, 1.1], [1.4, 1.0], [1.5, 0], [0, 0]], 14, NS, [0, 0.5, 0, 0]);
  }
  // the stop plate: an arc of nickel silver round the spindle, its two bumpers where the stop arm rests
  // and where a quarter turn brings it
  const sa = CRANK0 + 180;
  const arc: Vec3[] = [];
  for (let k = 0; k <= 24; k++) {
    const a = (sa - 30 + (150 * k) / 24) * DEG;
    arc.push(Vm([c[0] + 10.4 * Math.cos(a), c[1] + 10.4 * Math.sin(a), c[2] + H + 4.6]));
  }
  tubeAlong(mb, arc, () => 0.0011, NS, 10, { cap0: true, cap1: true });
  for (const a of [sa - 10, sa - 90 + 10]) {
    const p: Vec3 = [c[0] + 11 * Math.cos(a * DEG), c[1] + 11 * Math.sin(a * DEG), c[2] + H + 3.8];
    lathe(mb, p, W, [[0, 0], [1.8, 0], [1.8, 4.2], [0, 4.4]], 16, RUBBER, [0, 0.3, 0.6, 0]);
  }
  // collars at the ports
  for (const a of [PORT_IN, PORT_OUT, LOOP_OUT, LOOP_IN]) ferrule(mb, Vm(port(D, i, a, 3)), pdir(a), D.rT, 6, BR);
}
/** a loop's own tuning slide: nickel-silver outer tubes on both runs just ahead of its bow, ferrules, a stay */
function loopSlide(mb: MeshBuilder, D: Dims, i: number): void {
  const V = D.L.valves[i];
  const u0 = -D.dl[i];
  const rS = D.rT + 0.95;
  const Ls = 62;
  for (const v of [V.vHi, V.vLo]) lathe(mb, [u0 + 1, v, V.w], [1, 0, 0], [[rS - 0.3, 0], [rS + 0.8, 0.4], [rS + 0.8, 6], [rS, 7.2], [rS, Ls - 8], [rS + 0.8, Ls - 7], [rS + 0.8, Ls - 1], [D.rT - 0.2, Ls]], 36, NS, 0.35);
  brace(mb, [u0 + Ls - 14, V.vLo + rS + 0.4, V.w], [u0 + Ls - 14, V.vHi - rS - 0.4, V.w], 2.1, BR);
}

// ================================================================ the rotors, the levers, the four-bar
/** the rotor's crank at rest (deg, in the (u, v) plane): up and back; the link pulls it forward, a quarter
 *  turn clockwise as the near side sees it */
const CRANK0 = 135;
const RK = 8.5;
/** the lever's crank arm (mm) from its pivot, down at rest */
const ARM = 17;
/** the mechanism's plane: in front of the casing's bearing plate */
const wMech = (D: Dims, i: number) => vCentre(D, i)[2] + D.Hc + 7.2;
const crankBall = (D: Dims, i: number, a = CRANK0): Vec3 => {
  const c = vCentre(D, i);
  return [c[0] + RK * Math.cos(a * DEG), c[1] + RK * Math.sin(a * DEG), wMech(D, i)];
};
const pivotOf = (D: Dims, i: number): Vec3 => {
  const c = vCentre(D, i);
  const p = D.L.valves[i].pivot;
  return [c[0] + p[0], c[1] + p[1], wMech(D, i)];
};
/** the lever's crank tip turned by φ (deg) about its pivot (+w: anticlockwise as the near side sees it) */
const leverTip = (D: Dims, i: number, phi: number): Vec3 => {
  const o = pivotOf(D, i);
  const a = (-90 + phi) * DEG;
  return [o[0] + ARM * Math.cos(a), o[1] + ARM * Math.sin(a), o[2]];
};
function solveCrank(D: Dims, i: number, phi: number, L0: number, guess: number): number {
  const A = leverTip(D, i, phi);
  let a = guess;
  for (let k = 0; k < 40; k++) {
    const f = len3(sub(crankBall(D, i, a), A)) - L0;
    const df = (len3(sub(crankBall(D, i, a + 0.01), A)) - L0 - f) / 0.01;
    if (Math.abs(df) < 1e-9) break;
    const step = Math.max(-6, Math.min(6, f / df));
    a -= step;
    if (Math.abs(step) < 1e-7) break;
  }
  return a;
}
/** the lever's travel (deg) that turns the rotor a quarter turn, and the table */
function fourBar(D: Dims, i: number): { L0: number; travel: number; table: Float32Array } {
  const L0 = len3(sub(crankBall(D, i), leverTip(D, i, 0)));
  const turnAt = (phi: number) => {
    let g = CRANK0;
    for (let k = 1; k <= 24; k++) g = solveCrank(D, i, (phi * k) / 24, L0, g);
    return CRANK0 - g;
  };
  let lo = 5;
  let hi = 80;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (turnAt(mid) < 90) lo = mid;
    else hi = mid;
  }
  const travel = (lo + hi) / 2;
  const table = new Float32Array(41);
  let g = CRANK0;
  for (let k = 0; k <= 40; k++) {
    g = solveCrank(D, i, (travel * k) / 40, L0, g);
    table[k] = CRANK0 - g;
  }
  return { L0, travel, table };
}
/** the part of a rotor that turns (at rest): the spindle's end and its screw, the stop arm, the crank with
 *  its ball */
function rotorTop(mb: MeshBuilder, D: Dims, i: number): void {
  const c = vCentre(D, i);
  const W: Vec3 = [0, 0, 1];
  const H = D.Hc;
  const zk = wMech(D, i) - c[2];
  lathe(mb, c, W, [[2.8, H + 5.2], [2.8, zk - 1], [3.6, zk - 0.8], [3.6, zk + 1.2], [2.4, zk + 1.6], [2.4, zk + 2.6], [0, zk + 2.8]], 28, NS, [0, 0.3, 0.3, 0.4, 0.3, 0.4, 0]);
  cyl(mb, Vm([c[0] - 2, c[1], c[2] + zk + 2.85]), Vm([c[0] + 2, c[1], c[2] + zk + 2.85]), 0.00032, 0.00032, 8, BORE, true);
  const sa = (CRANK0 + 180) * DEG;
  tube(mb, refine([[c[0], c[1], c[2] + H + 6.3], [c[0] + 12 * Math.cos(sa), c[1] + 12 * Math.sin(sa), c[2] + H + 6.3]], 2), (s, f) => 1.5 - 0.35 * f, NS, 14, { cap1: true });
  const b = crankBall(D, i);
  tube(mb, [[c[0], c[1], b[2]], b], 1.4, NS, 14);
  ellipsoid(mb, Vm(b), [0.0021, 0.0021, 0.0021], 18, STEEL);
}
/** a lever (at rest): its hub on the pivot, the crank arm down to its ball, the arm up to the thumb's
 *  paddle (a knurled roller, as the Rath's and the Bach's); the pivot's post and the return spring are static */
function lever(mb: MeshBuilder, D: Dims, i: number): void {
  const o = pivotOf(D, i);
  const W: Vec3 = [0, 0, 1];
  lathe(mb, [o[0], o[1], o[2] - 4], W, [[1.6, 0], [3.4, 0], [3.4, 8], [1.6, 8]], 24, NS, 0.5);
  const tip = leverTip(D, i, 0);
  tube(mb, [o, tip], (s, f) => 1.9 - 0.5 * f, NS, 14);
  ellipsoid(mb, Vm(tip), [0.0024, 0.0024, 0.0024], 18, STEEL);
  const pd = norm([D.L.valves[i].paddle[0], D.L.valves[i].paddle[1], 0]);
  // the arm out to the paddle, then turned out of the mechanism's plane towards the thumb (+w)
  const end = add(o, scale(pd, 30));
  const arm = bend([add(o, scale(pd, 3)), add(o, scale(pd, 18)), add(end, [0, 0, 3]), add(end, [0, 0, 9])], [5, 4], 10);
  tubeAlongBar(mb, refine(arm.map(Vm), 0.0012), 2.6, 1.15, NS);
  // the paddle: a plate under the thumb, its face towards the push (the lever turns anticlockwise about +w:
  // at the paddle that is along +w × pd), dished a little, rounded corners
  const push = norm(cross([0, 0, 1], pd));
  plate(mb, add(end, [0, 0, 15]), [0, 0, 1], pd, scale(push, -1), 11, 7.5, 1.5, NSS);
}
/** a rounded plate centred at c (mm): ex its length (half a), ey its width (half b), its face along n,
 *  thickness t, a shallow dish in its face */
function plate(mb: MeshBuilder, c: Vec3, ex: Vec3, ey: Vec3, n: Vec3, a: number, b: number, t: number, m: Mat): void {
  const P = (u: number, v: number, side: number): Vec3 => {
    // (a superellipse outline, exponent 4)
    const th = u * TAU;
    const cu = Math.cos(th);
    const su = Math.sin(th);
    const x = a * Math.sign(cu) * Math.abs(cu) ** 0.5 * v;
    const y = b * Math.sign(su) * Math.abs(su) ** 0.5 * v;
    const dish = side > 0 ? -0.45 * (1 - v * v) : 0;
    const edge = (t / 2) * Math.sqrt(Math.max(0, 1 - Math.max(0, v - 0.86) ** 2 / 0.0196));
    const h = side * edge + dish;
    return Vm(add(c, add(add(scale(ex, x), scale(ey, y)), scale(n, h))));
  };
  grid(mb, 48, 10, (u, v) => P(u, v, 1), m, { flip: true });
  grid(mb, 48, 10, (u, v) => P(u, v, -1), m);
}
/** a lever's post (from the bell brace or the tuning slide's stay to the pivot) and its return spring */
function leverPost(mb: MeshBuilder, D: Dims, i: number): void {
  const o = pivotOf(D, i);
  // (from the bell brace, or the tuning slide's stay: both in the bell section's plane, w = 0; a hub that
  // reaches the plane clamps round the stay itself)
  if (o[2] - 4.6 > 3.4 + 2) brace(mb, [o[0], o[1], 3.4], add(o, [0, 0, -4.6]), 1.9, NS);
  lathe(mb, [o[0], o[1], o[2] + 4], [0, 0, 1], [[0, 0], [2.3, 0], [2.4, 1.6], [1.6, 2.4], [0, 2.6]], 16, NS, [0, 0.3, 0.5, 0]);
  const coil: Vec3[] = [];
  for (let k = 0; k <= 4 * 16; k++) {
    const a = (k / 16) * TAU;
    coil.push(Vm([o[0] + 2.4 * Math.cos(a), o[1] + 2.4 * Math.sin(a), lerp(o[2] - 5, o[2] - 12, k / 64)]));
  }
  tubeAlong(mb, coil, () => 0.0006, STEEL, 8);
}
/** the link (a rod with a ball socket at each end) built along +y from 0 to its length L (m) */
function linkMesh(L: number): Mesh {
  return make((mb) => {
    latheOn(mb, [0, 0, 0], [0, 1, 0], fillet([[0, -0.0021], [0.0027, -0.0018], [0.0033, 0], [0.0027, 0.0031], [0.0015, 0.0046], [0.0015, L - 0.0046], [0.0027, L - 0.0031], [0.0033, L], [0.0027, L + 0.0018], [0, L + 0.0021]] as P2[], [0, 0.0013, 0.0018, 0.0015, 0.0009, 0.0009, 0.0015, 0.0018, 0.0013, 0], 4), 20, NS);
  });
}

// ================================================================ build
const models = new Map<TromboneSize, TromboneModel>();
/** the model of a size (built on first use) */
export function buildTromboneModel(size: TromboneSize = 'tenor'): TromboneModel {
  const have = models.get(size);
  if (have) return have;
  const D = dimsOf(size);
  solve(D);
  const L = D.L;
  // ---- the slide
  const slideStatics = [make((mb) => innerSlide(mb, D))];
  const outer = make((mb) => outerSlide(mb, D));
  // ---- the bell section (its own frame), the bell lathed about its axis, the rim, the throat
  const bellParts = make((mb) => {
    bellSection(mb, D);
    D.L.valves.forEach((_, i) => leverPost(mb, D, i));
  });
  const u0 = -D.d + L.slideTubes;
  const prof: P2[] = [];
  const N = 150;
  for (let k = 0; k <= N; k++) {
    // (dense near the rim, where it flares)
    const u = L.rimX - (L.rimX - u0) * (1 - k / N) ** 2.2;
    prof.push([bellRadius(D, u) * mm, (u - u0) * mm]);
  }
  // (the left hand on the tail by the brace; narrow: further forward the tail's inside shows down the bell, and
  // a fingerprint's ridges there read as a dotted band)
  const handBell = (u: number) => (u > L.brace + 40 ? 0 : 0.55 * Math.exp(-(((u - L.brace) / 34) ** 2)));
  const bellMesh = make((mb) => {
    // (the bell in pieces of its profile: the tail's handled stretch by the brace, the flare)
    latheOn(mb, Vm([u0, L.vb, 0]), [1, 0, 0], prof, 120, BR);
    // the throat seen down the bell: the brass's inside darkening into the tail, from where the bell is
    // a fifth of its rim across (the light no longer reaches)
    // (kept 2.5 mm inside the brass: nearer, the two surfaces fight for the same depth at a distance)
    let ua = L.rimX;
    while (ua > u0 && bellRadius(D, ua) > D.R * 0.17) ua -= 2;
    const th: P2[] = [];
    for (let k = 0; k <= 12; k++) {
      const u = ua - k * 7;
      th.push([(bellRadius(D, u) - 2.5) * mm, (u - u0) * mm]);
    }
    th.push([0, (ua - 12 * 7 - 4 - u0) * mm]);
    latheOn(mb, Vm([u0, L.vb, 0]), [1, 0, 0], th, 48, BORE);
  });
  // (fingerprints where the left hand holds the bell tail by the brace: a separate pass over its vertices)
  markHand(bellMesh, (x) => handBell(x / mm));
  const rim = make((mb) => {
    const ring: P2[] = [];
    const rc = D.R - L.bead;
    for (let i = 0; i <= 22; i++) {
      const a = -Math.PI * 0.55 + (i / 22) * Math.PI * 1.75;
      ring.push([(rc + L.bead * Math.cos(a)) * mm, (L.rimX - L.bead * 0.2 + L.bead * Math.sin(a) - u0) * mm]);
    }
    latheOn(mb, Vm([u0, L.vb, 0]), [1, 0, 0], ring, 200, BELL);
  });
  // ---- the valves' moving parts and their four-bars
  const valves: TromboneValve[] = L.valves.map((_, i) => {
    const fb = fourBar(D, i);
    return { rotor: make((mb) => rotorTop(mb, D, i)), lever: make((mb) => lever(mb, D, i)), link: linkMesh(fb.L0 * mm), axis: [0, 0, 1], centre: Vm(vCentre(D, i)), pivot: Vm(pivotOf(D, i)), table: fb.table, L0: fb.L0, travel: fb.travel, tip: leverTip(D, i, 0), ball: crankBall(D, i) };
  });
  const bellStatics = [bellParts, bellMesh];
  // ---- poses
  const bellT = bellToSlide(D, L.beta);
  const bellHeld = bellToSlide(D, L.held);
  const lipsTrue: Vec3 = [-(L.mp.L - L.mp.ins) - 0.6, 0, 0];
  const lips = F3(Vm(lipsTrue));
  const lipAxis = F3([-1, 0, 0]);
  // the box with the slide all the way out
  const travel = D.travel * mm;
  const box = boxIn([...slideStatics.map((m) => ({ m, T: null })), { m: outer, T: null }, { m: outer, T: translate(travel, 0, 0) }, ...[...bellStatics, rim, ...valves.map((v) => v.lever)].map((m) => ({ m, T: bellT }))]);
  // on its own: the slide level, its middle (the slide halfway out) over the stage's centre, floating a hand's
  // breadth over the floor
  const cx = (box.lo[0] + box.hi[0]) / 2;
  const cz = (box.lo[2] + box.hi[2]) / 2;
  const T = translate(-cx, 0.2 - box.lo[1], -cz);
  const c: Vec3 = [0, 0.2 + (box.hi[1] - box.lo[1]) / 2, 0];
  const r = 0.5 * Math.hypot(box.hi[0] - box.lo[0], box.hi[1] - box.lo[1], box.hi[2] - box.lo[2]) + 0.01;
  const measures = {
    open: openLength(D),
    loops: L.valves.map((_, i) => loopLength(D, i)),
    loopWant: L.valves.map((_, i) => loopTarget(D, i)),
    spacing: L.S,
    outerOD: 2 * D.rOut,
    innerOD: 2 * D.rIn,
    bell: 2 * D.R,
    overall: D.xe + L.S / 2 + D.rOut + 10.4 - 1.6 + (D.d - 4 + L.vb / 2 + D.rT + 0.95),
    rimToCrook: D.xe + L.S / 2 + D.rOut + 10.4 - 1.6 - L.rimX,
    d: D.d,
  };
  const tm: TromboneModel = { size, dims: D, T, held: heldPose(lips), slideStatics, outer, bellStatics, rim, bellT, bellHeld, valves, lips, lipAxis, travel, bounds: { c, r }, measures };
  models.set(size, tm);
  return tm;
}
/** the box of meshes, each placed by its matrix */
function boxIn(ps: { m: Mesh; T: Mat4 | null }[]): { lo: Vec3; hi: Vec3 } {
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const { m, T } of ps) {
    const b = boxOf([m]);
    for (const x of [b.lo[0], b.hi[0]])
      for (const y of [b.lo[1], b.hi[1]])
        for (const z of [b.lo[2], b.hi[2]]) {
          const p = T ? xform(T, [x, y, z]) : ([x, y, z] as Vec3);
          for (let k = 0; k < 3; k++) {
            lo[k] = Math.min(lo[k], p[k]);
            hi[k] = Math.max(hi[k], p[k]);
          }
        }
  }
  return { lo, hi };
}
/** fingerprints (uv.y) on a mesh's vertices by their x (m) */
function markHand(m: Mesh, f: (x: number) => number): void {
  for (let i = 0; i < m.count; i++) {
    const o = i * 14;
    m.data[o + 13] = Math.max(m.data[o + 13], f(m.data[o]));
  }
}

// ================================================================ posing
type TromboneOf = NonNullable<VisualFrame['trombone']>;
/** The trombone as a frame carries it (`fr.trombone`: its size, the slide now and where it is heading, the
 *  valves down). A host that does not pass that field on (the worklet's visual message lists its fields)
 *  still gives the note and the tube's length (`focus`): the fingering is the engine's own chart for it, the
 *  size the one whose chart gives that length (the tenor where the tenor's and the bass's agree), and the
 *  slide heads for its position from where it was */
const derived = new WeakMap<object, TromboneOf>();
export function tromboneOf(fr: VisualFrame | null | undefined, hint?: TromboneSize): TromboneOf | null {
  if (!fr) return null;
  if (fr.trombone) return fr.trombone;
  const f = fr.focus;
  if (!f || typeof f.midi !== 'number') return null;
  let d = derived.get(f);
  if (!d || (hint && d.size !== hint)) {
    const m = f.midi;
    const sizes: TromboneSize[] = hint ? [hint] : ['tenor', 'alto', 'bass'];
    const size = hint ?? sizes.find((s) => Math.abs(tromboneTubeLength(tromboneFingering(m, s), s) / Math.max(1e-6, f.lengthM ?? 0) - 1) < 0.004) ?? 'tenor';
    const fg = tromboneFingering(m, size);
    const out = tromboneSlideOut(fg, size);
    d = { size, slide: NaN, target: out, position: fg.position, valves: fg.valves, side: fg.side, partial: fg.partial };
    derived.set(f, d);
  }
  return d;
}
/** the size a frame's trombone is (the stage's own: the Size knob; an Orchestra seat: its line's) */
export const tromboneSizeIn = (fr: VisualFrame | null | undefined, hint?: TromboneSize): TromboneSize => {
  const s = fr?.trombone?.size ?? hint ?? tromboneOf(fr)?.size;
  return s === 'alto' || s === 'bass' ? s : 'tenor';
};
/** the hero bearing (scenes3d viewFor): from the player's right, in front of the bell (the slide in front of
 *  the bell section, the bell's mouth turned a little towards the camera), a little above; a phone held
 *  upright may turn it up to `swing` further round towards the bell's mouth, which shortens the slide across
 *  a narrow picture */
export const TROMBONE_VIEW = { yaw: 0.55, pitch: 0.19, swing: 0.7 };
/** its seat in the Orchestra (scenes3d ensembleSeats): the height of a seated player's lips (the model is held
 *  with its mouthpiece's rim there), the seat's own turn; the footprint (the slide reaches forward, towards the
 *  audience: its centre `dz` forward of the player, its radius) and the height the framing allows for */
export const TROMBONE_SEAT = { y: 1.16, turn: 0, dz: -0.5, r: 0.5, top: 1.5 };
/** held as a seated player holds it (the U.S. Navy Band's section, a three-quarter from the front): the slide
 *  forward and down 27°, a little to the player's right, the bell section turned about the lock nut nearly a
 *  right angle from the slide's plane (bellHeld) and the whole rolled 26° so the bell sits to the left of the
 *  face and the tuning slide's bow over the left shoulder; the lips at the seat's origin. The audience is at
 *  −z; the world is mirrored in x (the player's right is −x); the model is the true trombone with z flipped */
const PITCH = 27 * DEG;
const ROLL = 26 * DEG;
const YAW = 7 * DEG;
function heldPose(lips: Vec3): Mat4 {
  const f0: Vec3 = [0, -Math.sin(PITCH), -Math.cos(PITCH)];
  const u0: Vec3 = [0, Math.cos(PITCH), -Math.sin(PITCH)];
  const r0: Vec3 = [1, 0, 0];
  // the roll about the slide: tube B (−u) towards the player's left (+x)
  const u1 = sub(scale(u0, Math.cos(ROLL)), scale(r0, Math.sin(ROLL)));
  const r1 = add(scale(r0, Math.cos(ROLL)), scale(u0, Math.sin(ROLL)));
  // the yaw: the slide a little to the player's right (−x)
  const yaw = (v: Vec3): Vec3 => [v[0] * Math.cos(YAW) + v[2] * Math.sin(YAW), v[1], -v[0] * Math.sin(YAW) + v[2] * Math.cos(YAW)];
  const f = yaw(f0);
  const u = yaw(u1);
  const rr = yaw(r1);
  const R = new Float32Array([f[0], f[1], f[2], 0, u[0], u[1], u[2], 0, rr[0], rr[1], rr[2], 0, 0, 0, 0, 1]);
  const t = xform(R, lips);
  R[12] = -t[0];
  R[13] = -t[1];
  R[14] = -t[2];
  return R;
}

interface TromPoseState {
  /** each lever's spring (0 rest … 1 down) */
  pos: Float32Array;
  vel: Float32Array;
  /** seconds since it last sounded */
  quiet: number;
  /** the slide as drawn (mm out), the engine's last frame's slide, when it came (ms), its slide then */
  s: number;
  last: object | null;
  /** the drawn slide's run from one frame's to the next: where it started (mm) and over how long (ms) */
  from: number;
  dur: number;
  tFrame: number;
  base: number;
  W: Float32Array;
  R: Float32Array;
  L: Float32Array;
  S: Float32Array;
  glow: RGBA;
  lipGap: number;
}
const poses = new WeakMap<WindPose, TromPoseState>();
function tromPose(pose: WindPose): TromPoseState {
  let p = poses.get(pose);
  if (!p) {
    p = { pos: new Float32Array(2), vel: new Float32Array(2), quiet: 10, s: 0, last: null, from: 0, dur: 33, tFrame: 0, base: 0, W: new Float32Array(16), R: new Float32Array(16), L: new Float32Array(16), S: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), glow: [0, 0, 0, 0], lipGap: 0 };
    poses.set(pose, p);
  }
  return p;
}
/** tests: the slide as drawn (m out from first position), the levers' springs (0 … 1) */
export const tromboneSlideState = (pose: WindPose): number | null => (poses.has(pose) ? poses.get(pose)!.s * mm : null);
export const tromboneLeverState = (pose: WindPose): Float32Array | null => poses.get(pose)?.pos ?? null;
/** tests: a rotor's turn (deg) for its lever's spring position (0 … 1) */
export function tromboneRotorTurn(tm: TromboneModel, i: number, p: number): number {
  const t = tm.valves[i].table;
  const x = clamp01(p) * 40;
  const k = Math.min(39, Math.floor(x));
  return lerp(t[k], t[k + 1], x - k);
}
/** the engine's slide speed (m/s: core/trombone.ts SLIDE_SPEED): the drawn slide runs on towards the
 *  frame's target at it between frames (they come at ≈30 Hz, the stage draws at 60) */
const SLIDE_SPEED = 4;

const C = { verm: (a: number) => ink(INK.vermilion, a) };
/** the single stage's pose state and model, last posed (tests, the review's hooks) */
let stageState: TromPoseState | null = null;
let stageModel: TromboneModel | null = null;
/** how far out the framing counts the slide on a wide stage (m): fifth position on a tenor, where all but the
 *  lowest notes of the engine's chart lie (a sixth or seventh runs out of the picture, as a wide stage crops a
 *  cello's endpin); a narrow stage (a phone held upright) frames it all the way out */
const WIDE_REACH = 0.36;
export function poseTrombone(b: Batch, tm: TromboneModel, fr: VisualFrame | null, pose: WindPose, dt: number, now: number, rms: number, T: Mat4 = tm.T, sizeHint?: TromboneSize, wide = false): void {
  const st = tromPose(pose);
  const solo = T === tm.T;
  if (solo) {
    stageState = st;
    if (stageModel !== tm) {
      stageModel = tm;
      if (typeof window !== 'undefined')
        (window as unknown as { __trombone3d?: unknown }).__trombone3d = {
          size: tm.size,
          views: tromboneViews(tm),
          measures: tm.measures,
          slide: () => (stageState ? +(stageState.s * mm).toFixed(4) : null),
          /** the engine's own last frame: its slide (m), where it is heading, the valves down */
          engine: () => {
            const t = stageState?.last as { slide?: number; target?: number; valves?: number[] } | null;
            return t ? { slide: t.slide, target: t.target, valves: t.valves } : null;
          },
          levers: () => (stageState ? Array.from(stageState.pos.subarray(0, tm.valves.length)) : null),
          rotors: () => (stageState ? tm.valves.map((_, i) => tromboneRotorTurn(tm, i, stageState!.pos[i])) : null),
        };
    }
  }
  const BT = solo ? tm.bellT : tm.bellHeld;
  const tb = tromboneOf(fr, sizeHint ?? tm.size);
  const lips = fr?.lips ?? null;
  const blow = lips ? lips.blow : 0;
  // ---- the slide: where the engine has it, running on towards its target at the engine's speed between
  // its frames, lightly smoothed
  const travel = tm.dims.travel;
  if (tb) {
    const target = Math.max(0, Math.min(travel, tb.target / mm));
    if (Number.isFinite(tb.slide)) {
      // (each frame from the worklet is a new object.) The engine's slide, drawn a frame behind it: from where
      // it is drawn to the frame's over the time between frames (they come at ≈30 Hz, the stage draws at 60),
      // so it moves as smoothly as the engine's own and never past where the engine has it
      if (tb !== st.last) {
        st.dur = Math.max(10, Math.min(100, now - st.tFrame));
        st.last = tb;
        st.tFrame = now;
        st.from = st.s;
        st.base = Math.max(0, Math.min(travel, tb.slide / mm));
      }
      // (counting this draw's own step: a frame that comes with every draw is drawn where it says)
      const k = Math.max(0, Math.min(1, (now - st.tFrame + dt * 1000) / st.dur));
      st.s = st.from + (st.base - st.from) * k;
    } else {
      // (a frame read from its note has no slide of its own: it runs from where it was drawn)
      const step = (SLIDE_SPEED / mm) * dt;
      st.s += Math.max(-step, Math.min(step, target - st.s));
    }
  }
  for (const s of tm.slideStatics) b.mesh(s, T);
  st.S[12] = st.s * mm;
  mulInto(st.W, 0, T, st.S);
  b.mesh(tm.outer, st.W);
  if (b.wantFit && solo) b.fitAlso.push({ mesh: tm.outer, m: chain(T, translate(wide ? Math.min(tm.travel, WIDE_REACH) : tm.travel, 0, 0)) });
  // ---- the bell section
  const TB = chain(T, BT);
  for (const s of tm.bellStatics) b.mesh(s, TB);
  // the valves the engine's chart takes, held while it sounds and a moment after; the levers on their
  // springs, each rotor turned by its linkage
  st.quiet = blow > 0.02 ? 0 : Math.min(9, st.quiet + dt);
  const down = tb && st.quiet < 0.8 ? tb.valves : [];
  tm.valves.forEach((v, i) => {
    const p = springTo(st.pos, st.vel, i, down.includes(i + 1) ? 1 : 0, dt, 16, 0.4);
    const phi = v.travel * p;
    // (built in the true frame, drawn flipped: a turn by θ about an axis there is −θ about its mirror here)
    aboutAxis(st.L, F3(v.pivot), F3(v.axis), -phi * DEG);
    mulInto(st.W, 0, TB, st.L);
    b.mesh(v.lever, st.W);
    const turn = tromboneRotorTurn(tm, i, p);
    aboutAxis(st.R, F3(v.centre), F3(v.axis), turn * DEG);
    mulInto(st.W, 0, TB, st.R);
    b.mesh(v.rotor, st.W);
    // the link: from the lever's crank ball to the rotor's crank ball
    const D = tm.dims;
    const A = F3(Vm(leverTip(D, i, phi)));
    const Bp = F3(Vm(crankBall(D, i, CRANK0 - turn)));
    const y = norm(sub(Bp, A));
    let x = cross(y, [0, 0, 1]);
    if (len3(x) < 1e-6) x = cross(y, [1, 0, 0]);
    x = norm(x);
    const z = cross(x, y);
    const Lm = new Float32Array([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, A[0], A[1], A[2], 1]);
    mulInto(st.W, 0, TB, Lm);
    b.mesh(v.link, st.W);
  });
  // ---- the bell's mouth: a faint shimmer with the level
  const lvl = Math.min(1, Math.sqrt(rms) * 3);
  let g: RGBA | null = null;
  if (lvl > 0.02) {
    st.glow[0] = 1;
    st.glow[1] = 0.7;
    st.glow[2] = 0.42;
    st.glow[3] = 0.09 * lvl * (0.75 + 0.25 * Math.sin(now * 0.021));
    g = st.glow;
  }
  b.mesh(tm.rim, TB, g);
  // ---- the lips at the rim: they buzz at the note (drawn slowed), opening with the engine's lips
  const open = lips ? Math.min(1.6, lips.open) : 0;
  st.lipGap += (open - st.lipGap) * (1 - Math.exp(-dt / 0.04));
  if (blow > 0.02) {
    const f1 = fr?.focus?.f1 ?? 0;
    const gap = 0.0006 + 0.0011 * st.lipGap * (0.55 + 0.45 * Math.sin(now * 0.001 * Math.min(f1, 14) * TAU));
    const ax = norm(tm.lipAxis);
    const side = norm(cross(ax, [0, 1, 0]));
    const up2 = norm(cross(side, ax));
    for (const sg of [-1, 1]) {
      const pts: Vec3[] = [];
      for (let k = 0; k <= 10; k++) {
        const w = -0.0095 + (k / 10) * 0.019;
        const q = add(tm.lips, add(scale(up2, sg * (gap + 0.0025 * (1 - (w / 0.0095) ** 2))), scale(side, w)));
        pts.push(xform(T, q));
      }
      b.line(pts, C.verm(0.75), 2.2);
    }
  }
}

/** the review's views (scripts/shots-trombone-3d.mjs), in the stage's units: world points of the single pose */
function tromboneViews(tm: TromboneModel): Record<string, { yaw: number; pitch: number; dist: number; target: Vec3 }> {
  const D = tm.dims;
  const L = D.L;
  const W = (p: Vec3) => xform(tm.T, F3(Vm(p))).map((v) => +v.toFixed(4)) as Vec3;
  const WB = (p: Vec3) => xform(chain(tm.T, tm.bellT), F3(Vm(p))).map((v) => +v.toFixed(4)) as Vec3;
  const mid = W([(D.xe - D.d) / 2, -L.S / 2 + 40, -40]);
  const v0 = L.valves.length ? vCentre(D, 0) : ([L.brace, 30, 0] as Vec3);
  return {
    // (the photographs' bearing: the player's right side square on, the bell to the right; into the bell's
    // mouth; the player's left side, the bell section in front of the slide)
    side: { yaw: 0.0, pitch: 0.02, dist: 1.45, target: mid },
    front: { yaw: Math.PI / 2 - 0.04, pitch: 0.08, dist: 1.0, target: mid },
    left: { yaw: Math.PI, pitch: 0.04, dist: 1.45, target: mid },
    valve: { yaw: 0.35, pitch: 0.35, dist: 0.24, target: WB([v0[0] + 20, v0[1] + 16, v0[2] + 16]) },
    linkage: { yaw: -0.25, pitch: 0.6, dist: 0.2, target: WB([v0[0] + 26, v0[1] + 18, v0[2] + 22]) },
    crook: { yaw: 0.55, pitch: 0.2, dist: 0.3, target: W([D.xe, -L.S * 0.55, 0]) },
    slidetop: { yaw: 0.45, pitch: 0.3, dist: 0.34, target: W([L.top - 20, -L.S / 2, 0]) },
    mouthpiece: { yaw: -0.35, pitch: 0.2, dist: 0.24, target: W([-20, -6, 0]) },
    rim: { yaw: 1.05, pitch: 0.18, dist: 0.62, target: WB([L.rimX - 30, L.vb, 0]) },
  };
}
