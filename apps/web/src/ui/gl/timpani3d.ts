// The timpani in 3D: a set of four pedal timpani of the Dresden pattern (Adams Philharmonic, Ringer,
// Hardtke, Lefima; Ludwig's balanced action is the same shape), built once and posed from the live state.
// Real scale (docs/3d-reference.md, "Timpani"): the heads 32″, 29″, 26″ and 23″ (0.813, 0.737, 0.660 and
// 0.584 m, the engine's own TIMPANI_DRUMS), the playing surface 0.80–0.83 m over the floor, each:
//
//   the kettle: copper raised to a parabolic bowl (its depth about 0.55 of its diameter), planished by hand
//     (every blow a facet: mats3 TEX 20), rolled over a wire at the bearing edge, a vent at the bottom;
//   the head: Mylar on an aluminium flesh hoop, its collar pulled down over the edge (≈ 2.5 cm), milky and
//     satin; the counterhoop, a chrome channel over it, its T-handled tension screws (eight on the two big
//     drums, six on the small: Ludwig's and Adams' counts) in lugs on its flange;
//   the pull rods from the lugs down the outside of the bowl to the spider under it, the suspension ring
//     round the bowl's shoulder with the rods' guides, three struts down to a cast base on three casters;
//   the pedal on the player's side (a balanced action: heel down the lowest note, toe down the highest),
//     its spring column under the bowl; the tuning gauge on the counterhoop by the player (a pointer on an
//     arc of semitones), and the fine tuner's hand wheel.
//
// The set stands in the American order (the 32″ on the player's left, the 23″ on the right), in an arc
// round the player, who stands behind it facing the audience; each drum is struck about two thirds of the
// way out on the player's side (the engine's `spot`).
//
// Live (the engine's `frame.timpani`): each pedal at its own angle (`pedal`, gliding); each gauge's pointer
// at the note the drum is tuned to; each head moving as its modes do — the engine's first fourteen (m, n),
// their amplitudes from the head's own displacement, shown slowed and exaggerated (the strike's dent at the
// strike point, spreading into the modes' own shapes, decaying as the drum does), a faint shimmer on a loud
// stroke; and two mallets (birch, cream felt) driven by the engine's strokes (`hands`): the felt on the
// head while the engine says it is, a rebound as high as the stroke was hard (lower in a roll), back to
// rest above the drum it last struck.
// Left out: the player (as with every instrument: a hand that reads as a hand needs a rigged, skinned
// model), the clutch's ratchet teeth, the pedal's linkage inside the base.
import { besselJ, type VisualFrame } from '@piano-model/engine';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, add, cross, mulInto, norm, rotY, scale, sub, translate, xform } from './gl3d.ts';
import { M, MeshBuilder, cyl, ellipsoid, lathe, tube, type Mat } from './mesh.ts';
import { aboutAxis, fillet } from './oboe3d.ts';

type P2 = [number, number];
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const COPPER = M.copperHammered;
const MYLAR = M.mylar;
const CHROME = M.chrome;
const BLACK = M.frameBlack;
const GRIP = M.rubberGrip;
const RUBBER = M.rubber;
const FELT = M.hammerFelt;
const BIRCH = M.hornbeam;
const DARK = M.ebony;
const STEEL = M.darkSteel;

// ---------------------------------------------------------------- the set's measures (m)
/** the drums, low to high (the engine's TIMPANI_DRUMS: diameter, inches, range), with their kettles */
export interface DrumSpec {
  d: number;
  inches: number;
  /** the playing surface's height over the floor */
  h: number;
  /** the bowl's depth below the bearing edge */
  depth: number;
  /** tension rods */
  rods: number;
}
export const TIMPANI_SET: DrumSpec[] = [
  { d: 0.813, inches: 32, h: 0.8, depth: 0.47, rods: 8 },
  { d: 0.737, inches: 29, h: 0.81, depth: 0.43, rods: 8 },
  { d: 0.66, inches: 26, h: 0.82, depth: 0.39, rods: 8 },
  { d: 0.584, inches: 23, h: 0.83, depth: 0.345, rods: 6 },
];
/** the counterhoop: its inner and outer radius past the head's, its top over the playing surface */
const HOOP_IN = 0.011;
const HOOP_OUT = 0.027;
const HOOP_TOP = 0.012;
const HOOP_BOT = -0.032;
/** the tension screws' circle past the head's radius */
const ROD_R = 0.046;
/** the suspension ring, below the playing surface */
const RING_Y = -0.115;
/** the felt ball's radius; the stick's length */
export const MALLET_BALL = 0.019;
export const MALLET_LEN = 0.36;
/** where the player stands from each drum's centre (past its radius), so the drums stand in an arc
 *  round them with a hand's breadth between counterhoops */
const REACH = 0.55;
const GAP = 0.05;

/** the bowl's radius at a depth s (0 at the bearing edge … 1 at the bottom): a parabolic kettle, its wall
 *  steep under the edge and rounding into a broad bottom */
export const bowlR = (a: number, s: number): number => a * Math.pow(Math.max(0, 1 - Math.pow(clamp01(s), 2.3)), 0.6);

/** the drums' places: centres (x, z) on the floor and the direction each faces its player (unit, xz),
 *  in the set's frame (the audience at −z, the player at +z; the renderer's world is mirrored in x, so
 *  +x is the player's left, the audience's right). The 32″ on the player's left. */
export function drumPlaces(): { c: Vec3; toward: Vec3; phi: number }[] {
  const a = TIMPANI_SET.map((s) => s.d / 2);
  const R = a.map((r) => r + ROD_R + 0.016);
  const rho = a.map((r) => r + REACH);
  const phi = [0];
  for (let k = 1; k < 4; k++) {
    const L = R[k - 1] + R[k] + GAP;
    const c = (rho[k - 1] ** 2 + rho[k] ** 2 - L * L) / (2 * rho[k - 1] * rho[k]);
    phi.push(phi[k - 1] - Math.acos(Math.max(-1, Math.min(1, c))));
  }
  // the middle gap straight ahead of the player
  const mid = (phi[1] + phi[2]) / 2;
  for (let k = 0; k < 4; k++) phi[k] -= mid;
  const raw = phi.map((f, k) => [rho[k] * Math.sin(f), -rho[k] * Math.cos(f)] as P2);
  // the set centred on its footprint
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  raw.forEach(([x, z], k) => {
    x0 = Math.min(x0, x - R[k]);
    x1 = Math.max(x1, x + R[k]);
    z0 = Math.min(z0, z - R[k]);
    z1 = Math.max(z1, z + R[k]);
  });
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  return raw.map(([x, z], k) => ({ c: [x - cx, 0, z - cz] as Vec3, toward: [-Math.sin(phi[k]), 0, Math.cos(phi[k])] as Vec3, phi: phi[k] }));
}
/** where the player stands (the arc's centre), in the set's frame */
export function playerPlace(): Vec3 {
  const p = drumPlaces();
  const k = 1;
  const rho = TIMPANI_SET[k].d / 2 + REACH;
  return add(p[k].c, scale(p[k].toward, rho));
}

// ---------------------------------------------------------------- building
/** a drum's own frame: on the floor under the head's centre, y up, +z towards the player (θ = 0, the
 *  strike point's side), +x the player's left */
const polar = (r: number, th: number, y: number): Vec3 => [r * Math.sin(th), y, r * Math.cos(th)];

/** a lathe about the drum's axis with a profile [r, y], `seg` segments */
const turn = (mb: MeshBuilder, prof: P2[], seg: number, m: Mat) => lathe(mb, prof, seg, m);

/** a torus (a ring of round section) about the y axis at height y */
function torus(mb: MeshBuilder, R: number, r: number, y: number, seg: number, m: Mat, segR = 10): void {
  const prof: P2[] = [];
  for (let k = 0; k <= segR; k++) {
    const a = -Math.PI / 2 + (k / segR) * TAU;
    prof.push([R + r * Math.cos(a), y + r * Math.sin(a)]);
  }
  turn(mb, prof, seg, m);
}

/** the kettle: the copper bowl, its rolled bearing edge, the vent's ring at the bottom */
function kettle(mb: MeshBuilder, s: DrumSpec): void {
  const a = s.d / 2;
  const top = s.h - 0.0015;
  const prof: P2[] = [[0.028, top - s.depth + 0.001]];
  const N = 36;
  for (let i = N; i >= 0; i--) {
    const sd = i / N;
    const r = Math.max(0.028, bowlR(a, sd));
    prof.push([r, top - s.depth * sd]);
  }
  // (the edge: the copper rolled outwards over a wire, 6 mm round)
  prof.push([a + 0.0025, top - 0.0005], [a + 0.0048, top - 0.0035], [a + 0.0052, top - 0.0075], [a + 0.003, top - 0.0105], [a - 0.0004, top - 0.012]);
  turn(mb, prof, 112, COPPER);
  // the vent at the bottom (a brass ring round a hole; the spider's hub below it)
  const yb = top - s.depth;
  torus(mb, 0.024, 0.004, yb + 0.002, 32, CHROME, 8);
  turn(mb, [[0, yb + 0.004], [0.022, yb + 0.004]], 32, DARK);
}

/** the head's collar (the Mylar pulled down over the edge) and its flesh hoop under the counterhoop */
function collar(mb: MeshBuilder, s: DrumSpec): void {
  const a = s.d / 2;
  const h = s.h;
  const prof = fillet(
    [
      [a + 0.0125, h - 0.03],
      [a + 0.0105, h - 0.014],
      [a + 0.0045, h - 0.003],
      [a - 0.004, h],
    ],
    0.006,
    3,
  );
  turn(mb, prof, 128, MYLAR);
  // the flesh hoop (aluminium, its edge just showing under the counterhoop)
  turn(mb, fillet([[a + 0.0125, h - 0.036], [a + 0.0145, h - 0.036], [a + 0.0145, h - 0.026], [a + 0.0125, h - 0.026]], 0.0012, 1), 128, M.nickelSatin);
}

/** the counterhoop: a chrome channel, rolled at the top, a flange at the bottom for the lugs */
function counterhoop(mb: MeshBuilder, s: DrumSpec): void {
  const a = s.d / 2;
  const h = s.h;
  // (counter-clockwise in (r, y), from the flange's outer edge: the normals face out of the metal)
  const prof = fillet(
    [
      [a + HOOP_OUT + 0.009, h + HOOP_BOT],
      [a + HOOP_OUT + 0.009, h + HOOP_BOT + 0.004],
      [a + HOOP_OUT, h + HOOP_BOT + 0.006],
      [a + HOOP_OUT, h + HOOP_TOP - 0.006],
      [a + HOOP_OUT - 0.003, h + HOOP_TOP],
      [a + HOOP_IN + 0.003, h + HOOP_TOP],
      [a + HOOP_IN, h + HOOP_TOP - 0.006],
      [a + HOOP_IN, h + HOOP_BOT + 0.004],
      [a + HOOP_IN + 0.004, h + HOOP_BOT],
    ],
    [0, 0.0015, 0.002, 0.003, 0.004, 0.004, 0.003, 0.0015, 0],
    3,
  );
  turn(mb, prof, 144, CHROME);
}

/** each tension screw: its lug on the flange, the T-handle over it, and its pull rod down the bowl's
 *  outside to the spider under the bottom; the suspension ring with its guides */
function rodsAndRing(mb: MeshBuilder, s: DrumSpec): void {
  const a = s.d / 2;
  const h = s.h;
  const top = h - 0.0015;
  const yb = top - s.depth;
  const N = s.rods;
  const rr = a + ROD_R;
  // the suspension ring: a chrome flange round the bowl's shoulder (Adams: "single-flange chrome
  // suspension ring"), standing off it on its brackets
  const yR = h + RING_Y;
  const sR = (top - yR) / s.depth;
  const rIn = bowlR(a, sR) + 0.012;
  turn(mb, fillet([[rIn + 0.014, yR - 0.004], [rIn + 0.014, yR + 0.004], [rIn, yR + 0.004], [rIn, yR - 0.004]], 0.0018, 2).concat([[rIn + 0.014, yR - 0.004]]), 128, CHROME);
  turn(mb, fillet([[rIn + 0.002, yR - 0.022], [rIn + 0.002, yR + 0.004], [rIn - 0.001, yR + 0.004], [rIn - 0.001, yR - 0.022]], 0.001, 1).concat([[rIn + 0.002, yR - 0.022]]), 128, CHROME);
  for (let j = 0; j < N; j++) {
    const th = ((j + 0.5) / N) * TAU;
    const P = (r: number, y: number) => polar(r, th, y);
    // the lug: a casting on the flange, under the screw
    mb.with(rotY(th), () => {
      const lug = fillet([[0.0, h + HOOP_BOT - 0.016], [0.011, h + HOOP_BOT - 0.016], [0.011, h + HOOP_BOT + 0.004], [0.0, h + HOOP_BOT + 0.004]], 0.003, 3);
      mb.with(translate(0, 0, rr), () => turn(mb, lug, 14, CHROME));
      // its web back to the hoop
      cyl(mb, [0, h + HOOP_BOT - 0.004, a + HOOP_OUT + 0.004], [0, h + HOOP_BOT - 0.004, rr], 0.006, 0.007, 12, CHROME);
    });
    // the screw, up through the lug and the flange, and its T-handle
    const yT = h + HOOP_TOP + 0.026;
    cyl(mb, P(rr, h + HOOP_BOT - 0.016), P(rr, yT), 0.0042, 0.0042, 14, CHROME, false);
    mb.with(translate(...P(rr, 0)), () => {
      turn(mb, fillet([[0.0, yT - 0.012], [0.0068, yT - 0.012], [0.0068, yT + 0.004], [0, yT + 0.004]], 0.002, 3), 16, CHROME);
    });
    const tg: Vec3 = [Math.cos(th), 0, -Math.sin(th)];
    const half = 0.032;
    const c = P(rr, yT);
    cyl(mb, add(c, scale(tg, -half)), add(c, scale(tg, half)), 0.0046, 0.0046, 14, CHROME, false);
    for (const sg of [-1, 1]) ellipsoid(mb, add(c, scale(tg, sg * (half + 0.003))), [0.0062, 0.0062, 0.0062], 10, CHROME);
    // the pull rod: from under the lug, off the bowl's wall by 16 mm, down round its bottom to the spider
    const path: Vec3[] = [P(rr, h + HOOP_BOT - 0.016), P(rr, h + HOOP_BOT - 0.05)];
    const K = 16;
    for (let i = 1; i <= K; i++) {
      const sd = 0.12 + (0.86 * i) / K;
      const r = Math.max(0.07, bowlR(a, sd) + 0.016);
      const y = top - s.depth * sd;
      // blend from the screw's circle onto the bowl's wall
      const w = clamp01((i - 1) / 5);
      path.push(P(lerp(rr, r, w * w * (3 - 2 * w)), y - 0.004 * w));
    }
    path.push(P(0.066, yb - 0.022));
    tube(mb, smoothPath(path, 1), 0.004, 8, CHROME);
    // its guide on the suspension ring: a little eye
    const g = P(Math.max(rIn + 0.018, bowlR(a, sR) + 0.016), yR);
    mb.with(translate(...g), () => turn(mb, fillet([[0.004, -0.014], [0.009, -0.014], [0.009, 0.014], [0.004, 0.014]], 0.002, 2), 14, BLACK));
  }
  // the spider: a hub under the bowl the pull rods come to
  const ys = yb - 0.022;
  turn(mb, fillet([[0, ys - 0.03], [0.05, ys - 0.03], [0.074, ys - 0.008], [0.074, ys + 0.006], [0.03, ys + 0.012], [0, ys + 0.012]], [0, 0.006, 0.006, 0.004, 0.004, 0], 3), 48, BLACK);
}

/** a polyline rounded by Chaikin's corner cutting */
function smoothPath(p: Vec3[], n: number): Vec3[] {
  let q = p;
  for (let k = 0; k < n; k++) {
    const o: Vec3[] = [q[0]];
    for (let i = 0; i < q.length - 1; i++) {
      o.push(add(scale(q[i], 0.75), scale(q[i + 1], 0.25)), add(scale(q[i], 0.25), scale(q[i + 1], 0.75)));
    }
    o.push(q[q.length - 1]);
    q = o;
  }
  return q;
}

/** the frame: three struts from the suspension ring to the cast base, its casters; the spring column */
function frame(mb: MeshBuilder, s: DrumSpec): void {
  const a = s.d / 2;
  const h = s.h;
  const top = h - 0.0015;
  const yb = top - s.depth;
  const yR = h + RING_Y;
  const sR = (top - yR) / s.depth;
  const rRing = bowlR(a, sR) + 0.024;
  const rBase = 0.62 * a + 0.07;
  const yArm = 0.105;
  // the struts at 60°, 180° and 300° from the player (the player's side open for the pedal)
  for (const th of [60 * DEG, 180 * DEG, 300 * DEG]) {
    const P = (r: number, y: number) => polar(r, th, y);
    // the bracket on the ring
    const b0 = P(rRing + 0.006, yR);
    mb.with(translate(...b0), () => mb.with(rotY(th), () => turn(mb, fillet([[0, -0.04], [0.019, -0.04], [0.019, 0.02], [0, 0.02]], 0.004, 3), 20, BLACK)));
    // the strut: a black tube, down and out to the arm's end
    const foot = P(rBase, yArm + 0.03);
    tube(mb, smoothPath([P(rRing + 0.006, yR - 0.03), P(rRing + 0.02, yR - 0.12), foot], 2), 0.0155, 20, BLACK);
    // the arm from the hub, and the caster under its end
    const hub = P(0.07, yArm);
    tube(mb, [hub, P(rBase * 0.55, yArm + 0.004), P(rBase, yArm)], (i) => (i === 0 ? 0.03 : i === 1 ? 0.024 : 0.021), 18, BLACK, { caps: true });
    caster(mb, P(rBase, 0), th);
  }
  // the hub: the base's casting
  turn(mb, fillet([[0, 0.07], [0.09, 0.07], [0.1, 0.09], [0.1, 0.13], [0.075, 0.15], [0, 0.15]], [0, 0.01, 0.008, 0.008, 0.01, 0], 3), 48, BLACK);
  // the spring column: a black housing over the hub, the chrome pull rod above it up to the spider
  turn(mb, fillet([[0, 0.15], [0.034, 0.15], [0.034, 0.33], [0.024, 0.345], [0, 0.345]], [0, 0.004, 0.004, 0.004, 0], 3), 40, BLACK);
  cyl(mb, [0, 0.34, 0], [0, yb - 0.05, 0], 0.009, 0.009, 20, CHROME, false);
}

/** a swivel caster: its plate, the fork, the wheel (rubber on a hub), at a foot on the floor */
function caster(mb: MeshBuilder, at: Vec3, th: number): void {
  // (3″ wheels: Ludwig AV1454)
  const R = 0.038;
  const w = 0.026;
  mb.with(translate(at[0], 0, at[2]), () =>
    mb.with(rotY(th + Math.PI / 2), () => {
      // the swivel's plate and kingpin
      turn(mb, fillet([[0, 0.092], [0.026, 0.092], [0.026, 0.103], [0, 0.103]], 0.002, 2), 24, CHROME);
      // the fork: two cheeks from the swivel down to the axle, trailing
      for (const sg of [-1, 1]) {
        const z = sg * (w / 2 + 0.004);
        tube(mb, [[0, 0.092, z], [0.008, 0.066, z], [0.016, R, z]], 0.0035, 10, CHROME);
      }
      // the wheel about the z axis
      mb.with(translate(0.016, R, 0), () =>
        mb.with(new Float32Array([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1]), () => {
          turn(mb, fillet([[0.012, -w / 2], [R, -w / 2], [R, w / 2], [0.012, w / 2]], 0.009, 4), 28, RUBBER);
          turn(mb, [[0, -w / 2 - 0.004], [0.012, -w / 2 - 0.002], [0.012, w / 2 + 0.002], [0, w / 2 + 0.004]], 20, CHROME);
        }),
      );
    }),
  );
}

/** the pedal, flat at its pivot (posed by its angle): a black casting with a ribbed rubber top, its toe
 *  under the bowl, its heel towards the player */
export const PEDAL = { pivot: [0, 0.085, 0.2] as Vec3, toe: 0.06, heel: 0.43, width: 0.105, lo: 15 * DEG, hi: -9 * DEG };
function pedal(mb: MeshBuilder): void {
  const y = PEDAL.pivot[1];
  const z0 = PEDAL.toe;
  const z1 = PEDAL.heel;
  const W = PEDAL.width / 2;
  // the footboard's outline (plan): narrower at the toe, rounded corners
  const outline = fillet(
    [
      [-W * 0.78, z0],
      [W * 0.78, z0],
      [W, z0 + 0.08],
      [W, z1],
      [-W, z1],
      [-W, z0 + 0.08],
    ],
    [0.02, 0.02, 0.03, 0.025, 0.025, 0.03],
    4,
  );
  const poly = outline.concat([outline[0]]);
  // the casting: a slab 22 mm thick with a rounded edge
  const yt = y + 0.012;
  const yb = y - 0.01;
  for (let i = 0; i < poly.length - 1; i++) {
    const [x0, z0_] = poly[i];
    const [x1, z1_] = poly[i + 1];
    mb.quad([x0, yb, z0_], [x1, yb, z1_], [x1, yt, z1_], [x0, yt, z0_], BLACK);
  }
  const cx = 0;
  const cz = (z0 + z1) / 2;
  for (let i = 0; i < poly.length - 1; i++) {
    mb.tri([cx, yt, cz], [poly[i][0], yt, poly[i][1]], [poly[i + 1][0], yt, poly[i + 1][1]], BLACK);
    mb.tri([cx, yb, cz], [poly[i + 1][0], yb, poly[i + 1][1]], [poly[i][0], yb, poly[i][1]], BLACK);
  }
  // the rubber top: ribs across it
  const inset = 0.012;
  for (let z = z0 + 0.05; z < z1 - 0.02; z += 0.016) {
    const wz = W - inset;
    cyl(mb, [-wz, yt + 0.0015, z], [wz, yt + 0.0015, z], 0.004, 0.004, 8, GRIP);
  }
  // the pivot's bosses and the axle
  cyl(mb, [-W - 0.012, y, PEDAL.pivot[2]], [W + 0.012, y, PEDAL.pivot[2]], 0.011, 0.011, 18, CHROME);
  // the toe's link up into the base
  cyl(mb, [0, y, z0 + 0.01], [0, y + 0.03, z0 - 0.03], 0.01, 0.01, 12, BLACK);
}
/** the pedal's tilt (rad, toe up positive) for the engine's travel (0 heel down … 1 toe down) */
export const pedalTilt = (p: number): number => lerp(PEDAL.lo, PEDAL.hi, clamp01(p));
/** the stand the pedal pivots in: two cheeks from the hub out to the axle */
function pedalStand(mb: MeshBuilder): void {
  const W = PEDAL.width / 2 + 0.02;
  for (const sg of [-1, 1]) tube(mb, [[sg * 0.05, 0.11, 0.07], [sg * W, 0.1, 0.15], [sg * W, PEDAL.pivot[1], PEDAL.pivot[2]]], 0.011, 14, BLACK, { caps: true });
}

/** the tuning gauge, on the counterhoop by the player, a little to the left of the strike point: a post,
 *  an arc of semitone ticks (the drum's range), its pointer's pivot. In the gauge's own frame: x across
 *  (the hoop's tangent), y up, z out (towards the player) */
export const GAUGE = { th: 32 * DEG, R: 0.05, span: 38 * DEG };
function gaugeAt(s: DrumSpec): Mat4 {
  const a = s.d / 2;
  const th = GAUGE.th;
  const c = polar(a + HOOP_OUT + 0.012, th, s.h + HOOP_TOP + 0.03);
  return chainM(translate(c[0], c[1], c[2]), rotY(th));
}
function gauge(mb: MeshBuilder, s: DrumSpec, ticks: number): void {
  const R = GAUGE.R;
  mb.with(gaugeAt(s), () => {
    // the post down to the hoop's flange
    cyl(mb, [0, -0.07, -0.004], [0, -0.012, -0.004], 0.005, 0.005, 12, CHROME);
    // the dial: a chrome arc plate (a sector of a ring), its face towards the player
    const n = 24;
    const r0 = R * 0.62;
    const r1 = R * 1.12;
    for (let i = 0; i < n; i++) {
      const a0 = -GAUGE.span * 1.12 + (2 * GAUGE.span * 1.12 * i) / n;
      const a1 = -GAUGE.span * 1.12 + (2 * GAUGE.span * 1.12 * (i + 1)) / n;
      const p = (r: number, a: number, z: number): Vec3 => [r * Math.sin(a), -0.03 + r * Math.cos(a), z];
      mb.quad(p(r0, a0, 0.002), p(r1, a0, 0.002), p(r1, a1, 0.002), p(r0, a1, 0.002), M.nickelSatin);
      mb.quad(p(r0, a0, -0.002), p(r0, a1, -0.002), p(r1, a1, -0.002), p(r1, a0, -0.002), CHROME);
      mb.quad(p(r1, a0, -0.002), p(r1, a1, -0.002), p(r1, a1, 0.002), p(r1, a0, 0.002), CHROME);
    }
    // the ticks: one per semitone of the drum's range
    for (let i = 0; i < ticks; i++) {
      const a = -GAUGE.span + (2 * GAUGE.span * i) / (ticks - 1);
      const p = (r: number): Vec3 => [r * Math.sin(a), -0.03 + r * Math.cos(a), 0.0026];
      cyl(mb, p(R * 0.9), p(R * 1.06), 0.0008, 0.0008, 6, DARK, false);
    }
    // the pointer's pivot (the pointer is its own part)
    cyl(mb, [0, -0.03, 0], [0, -0.03, 0.006], 0.004, 0.004, 14, CHROME);
  });
}
/** the pointer, about its pivot (the gauge's (0, −0.03, 0)), pointing straight up */
function pointer(mb: MeshBuilder): void {
  tube(mb, [[0, 0, 0.0045], [0, GAUGE.R * 0.6, 0.0045], [0, GAUGE.R * 1.04, 0.0045]], (i) => (i === 0 ? 0.0016 : i === 1 ? 0.0011 : 0.0005), 8, DARK);
  cyl(mb, [0, 0, 0.003], [0, 0, 0.007], 0.0028, 0.0028, 12, M.silk);
}
/** the pointer's angle (rad, + towards the player's left) for a note in the drum's range */
export const pointerAngle = (note: number, lo: number, hi: number): number => lerp(-GAUGE.span, GAUGE.span, clamp01((note - lo) / Math.max(1, hi - lo)));

/** the fine tuner: a hand wheel on a short spindle on the suspension ring, to the player's right */
function fineTuner(mb: MeshBuilder, s: DrumSpec): void {
  const a = s.d / 2;
  const top = s.h - 0.0015;
  const yR = s.h + RING_Y;
  const sR = (top - yR) / s.depth;
  const r = bowlR(a, sR) + 0.05;
  const th = -38 * DEG;
  const base = polar(r, th, yR);
  cyl(mb, polar(r - 0.03, th, yR), base, 0.006, 0.006, 12, BLACK);
  cyl(mb, base, add(base, [0, 0.06, 0]), 0.005, 0.005, 12, CHROME);
  mb.with(translate(base[0], base[1] + 0.06, base[2]), () => {
    torus(mb, 0.026, 0.004, 0, 40, BLACK, 10);
    for (let k = 0; k < 3; k++) {
      const q = (k / 3) * TAU;
      cyl(mb, [0, 0, 0], [0.024 * Math.cos(q), 0, 0.024 * Math.sin(q)], 0.0025, 0.0025, 8, BLACK, false);
    }
    turn(mb, fillet([[0, -0.006], [0.008, -0.006], [0.008, 0.006], [0, 0.006]], 0.002, 2), 16, CHROME);
    // the knob on its rim
    cyl(mb, [0.026, 0, 0], [0.026, 0.03, 0], 0.0055, 0.0045, 14, BLACK);
  });
}

/** a mallet along its own +z: the felt ball's centre at the origin, the stick to its butt at MALLET_LEN */
function mallet(mb: MeshBuilder): void {
  const b = MALLET_BALL;
  // the felt over its core, a little long along the stick (the cover gathered at the neck)
  ellipsoid(mb, [0, 0, 0.001], [b, b, b * 1.05], 28, FELT);
  cyl(mb, [0, 0, b * 0.8], [0, 0, b * 1.25], 0.0085, 0.0062, 18, FELT);
  // the stick: birch, 11 mm at the hand tapering to 9 at the ball
  const L = MALLET_LEN;
  cyl(mb, [0, 0, b * 0.9], [0, 0, L - 0.006], 0.0046, 0.0056, 16, BIRCH, false);
  ellipsoid(mb, [0, 0, L - 0.006], [0.0056, 0.0056, 0.006], 14, BIRCH);
}

const chainM = (...ms: Mat4[]): Mat4 => ms.reduce((a, b) => {
  const o = new Float32Array(16);
  mulInto(o, 0, a, b);
  return o;
});

// ---------------------------------------------------------------- the head (a moving surface)
const NR = 18;
const NT = 72;
/** a head's mesh: a polar grid (NR rings, NT spokes, a centre) at the playing surface, its vertices
 *  rewritten each frame it moves (Mesh.dyn); `node[v]` the grid node each vertex is */
export interface HeadMesh {
  mesh: Mesh;
  node: Uint16Array;
  /** the nodes' displacement (m) and normals, scratch */
  w: Float32Array;
  flat: boolean;
}
const nodeR = (k: number) => k / NR;
const nodeIx = (k: number, l: number) => (k === 0 ? 0 : 1 + (k - 1) * NT + (((l % NT) + NT) % NT));
function buildHead(s: DrumSpec): HeadMesh {
  const a = s.d / 2;
  const mb = new MeshBuilder();
  const nodes: number[] = [];
  const P = (k: number, l: number): Vec3 => polar(a * nodeR(k), (l / NT) * TAU, s.h);
  const up: Vec3 = [0, 1, 0];
  const tri = (A: [number, number], B: [number, number], C: [number, number]) => {
    mb.stri(P(...A), P(...B), P(...C), up, up, up, MYLAR);
    nodes.push(nodeIx(...A), nodeIx(...B), nodeIx(...C));
  };
  for (let l = 0; l < NT; l++) tri([0, 0], [1, l], [1, l + 1]);
  for (let k = 1; k < NR; k++)
    for (let l = 0; l < NT; l++) {
      tri([k, l], [k + 1, l], [k + 1, l + 1]);
      tri([k, l], [k + 1, l + 1], [k, l + 1]);
    }
  const mesh = mb.build();
  mesh.dyn = 0;
  return { mesh, node: Uint16Array.from(nodes), w: new Float32Array((1 + NR * NT) * 4), flat: true };
}

// ---------------------------------------------------------------- the model
export interface TimpDrum {
  spec: DrumSpec;
  /** the drum's frame in the set (on the floor under its head's centre, +z towards the player) */
  T: Mat4;
  statics: Mesh;
  pedal: Mesh;
  pointer: Mesh;
  /** the pointer's pivot and axis, and the pedal's, in the drum's frame */
  gauge: Mat4;
  /** the radial factors J_m(j r/a) at each ring for the modes last seen, keyed by (m, j) */
  radial: Map<string, Float32Array>;
}
export interface TimpaniModel {
  drums: TimpDrum[];
  mallet: Mesh;
  /** where the player stands, in the set's frame */
  player: Vec3;
  bounds: { c: Vec3; r: number };
}

export function buildTimpaniModel(): TimpaniModel {
  const places = drumPlaces();
  const RANGES = [
    [36, 45],
    [41, 48],
    [46, 53],
    [50, 57],
  ];
  const drums = TIMPANI_SET.map((s, k): TimpDrum => {
    const pl = places[k];
    const T = chainM(translate(pl.c[0], 0, pl.c[2]), rotY(Math.atan2(pl.toward[0], pl.toward[2])));
    const mb = new MeshBuilder();
    kettle(mb, s);
    collar(mb, s);
    counterhoop(mb, s);
    rodsAndRing(mb, s);
    frame(mb, s);
    pedalStand(mb);
    gauge(mb, s, RANGES[k][1] - RANGES[k][0] + 1);
    fineTuner(mb, s);
    const pm = new MeshBuilder();
    pedal(pm);
    const pt = new MeshBuilder();
    pointer(pt);
    return { spec: s, T, statics: mb.build(), pedal: pm.build(), pointer: pt.build(), gauge: chainM(gaugeAt(s), translate(0, -0.03, 0)), radial: new Map() };
  });
  const mm = new MeshBuilder();
  mallet(mm);
  // bounds: the set's footprint and its height
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const d of drums) {
    const c = xform(d.T, [0, 0, 0]);
    const R = d.spec.d / 2 + ROD_R + 0.02;
    x0 = Math.min(x0, c[0] - R);
    x1 = Math.max(x1, c[0] + R);
    z0 = Math.min(z0, c[2] - R);
    z1 = Math.max(z1, c[2] + R);
  }
  const c: Vec3 = [(x0 + x1) / 2, 0.5, (z0 + z1) / 2];
  const r = 0.5 * Math.hypot(x1 - x0, z1 - z0, 1.0);
  const model: TimpaniModel = { drums, mallet: mm.build(), player: playerPlace(), bounds: { c, r } };
  if (typeof window !== 'undefined')
    (window as unknown as { __timpani3d?: unknown }).__timpani3d = {
      views: timpaniViews(model),
      pose: () => (stageState ? { mallets: stageState.ball.map((b) => [...b]), alpha: Array.from(stageState.alpha), pedal: Array.from(stageState.tilt), pointer: Array.from(stageState.needle), heads: stageState.heads.map((h) => peakOf(h)) } : null),
    };
  return model;
}

// ---------------------------------------------------------------- posing
/** the hero bearing (scenes3d viewFor): from the audience's side, round towards the big drums' end, a
 *  little above, so the heads read as ellipses and the end drum's pedal and gauge show past its kettle */
export const TIMPANI_VIEW = { yaw: 0.62, pitch: 0.42, swing: 0.35 };
/** its seat in the Orchestra (scenes3d ensembleSeats): the set's half-width for the framing, and its
 *  height (the mallets at rest over the heads) */
export const TIMPANI_SEAT = { r: 1.3, top: 1.05 };

export interface TimpaniPose {
  /** each drum's moving head (built per pose: two sets in the Orchestra each move their own) */
  heads: HeadMesh[];
  /** each drum's per-mode amplitude (the envelope of the engine's displacement), and its clock since
   *  its last stroke */
  amp: Float32Array[];
  tDrum: Float32Array;
  /** each hand's clock since its last stroke, the interval before it, its drum and the lift (rad) */
  tHand: Float32Array;
  gapHand: Float32Array;
  handDrum: Int8Array;
  alpha: Float32Array;
  /** the pedals' tilt and the pointers' angle, eased */
  tilt: Float32Array;
  needle: Float32Array;
  ball: Vec3[];
  lastFrame: unknown;
  shimmer: Float32Array;
  W: Float32Array;
  R: Float32Array;
  glow: RGBA;
}
export function newTimpaniPose(): TimpaniPose {
  return {
    heads: [],
    amp: [0, 1, 2, 3].map(() => new Float32Array(16)),
    tDrum: new Float32Array(4).fill(99),
    tHand: new Float32Array(2).fill(99),
    gapHand: new Float32Array(2).fill(9),
    handDrum: Int8Array.from([1, 2]),
    alpha: new Float32Array(2).fill(REST_ALPHA),
    tilt: new Float32Array(4).fill(Number.NaN),
    needle: new Float32Array(4).fill(Number.NaN),
    ball: [
      [0, 0, 0],
      [0, 0, 0],
    ],
    lastFrame: null,
    shimmer: new Float32Array(4),
    W: new Float32Array(16),
    R: new Float32Array(16),
    glow: [0, 0, 0, 0],
  };
}
let stageState: TimpaniPose | null = null;
const peakOf = (h: HeadMesh) => {
  let m = 0;
  for (let i = 0; i < h.w.length; i += 4) m = Math.max(m, Math.abs(h.w[i]));
  return m;
};

/** the mallet's lift at rest (rad about the grip) and its geometry over the strike point: the grip's
 *  place from the strike point (towards the player, up), the two hands apart */
const REST_ALPHA = 0.2;
const GRIP_AT: Vec3 = [0, 0.115, 0.26];
const HANDS_APART = 0.034;
const CONTACT = 0.017;
/** the lift (rad) a stroke rebounds to, by its velocity, and how it settles (s) */
export function malletLift(t: number, vel: number, gap: number, on: boolean): number {
  // (the felt is on the head for a few milliseconds: held there one frame so the stroke is seen)
  t -= CONTACT;
  if (on || t <= 0) return 0;
  // in a roll (the same hand again within a quarter second) the stroke stays low
  const roll = gap < 0.25 ? 0.45 + 0.55 * clamp01((gap - 0.06) / 0.19) : 1;
  const peak = REST_ALPHA + (0.12 + 0.42 * clamp01(vel / 127)) * roll - (1 - roll) * 0.15;
  const T1 = 0.075;
  if (t < T1) return peak * Math.sin((Math.PI / 2) * (t / T1));
  return REST_ALPHA + (peak - REST_ALPHA) * Math.exp(-(t - T1) / 0.11);
}

/** the strike point (the drum's frame) for a hand (0 left, 1 right), at the engine's `spot` */
export function strikePoint(s: DrumSpec, spot: number, hand: number): Vec3 {
  return [hand === 0 ? HANDS_APART : -HANDS_APART, s.h, spot * (s.d / 2)];
}

/** the mallet's matrix in the drum's frame for a lift α (rad) over the strike point S: the ball about
 *  the grip, the stick from the ball through the grip */
export function malletMatrix(out: Float32Array, S: Vec3, hand: number, alpha: number): Vec3 {
  const B0: Vec3 = [S[0], S[1] + MALLET_BALL, S[2]];
  const F: Vec3 = [S[0] + GRIP_AT[0] + (hand === 0 ? 0.05 : -0.05), S[1] + GRIP_AT[1], S[2] + GRIP_AT[2]];
  const v = sub(B0, F);
  // lift about the horizontal axis across the stick (through the grip), in the sense that raises the ball
  const ax = norm(cross(norm([v[0], 0, v[2]]), [0, 1, 0]));
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  // (Rodrigues: v′ = v c + (ax × v) s + ax (ax·v)(1 − c))
  const axv = cross(ax, v);
  const adv = ax[0] * v[0] + ax[1] * v[1] + ax[2] * v[2];
  const B = add(F, [v[0] * c + axv[0] * s + ax[0] * adv * (1 - c), v[1] * c + axv[1] * s + ax[1] * adv * (1 - c), v[2] * c + axv[2] * s + ax[2] * adv * (1 - c)]);
  const z = norm(sub(F, B));
  const x = norm(cross([0, 1, 0], z));
  const y = cross(z, x);
  out.set([x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, B[0], B[1], B[2], 1]);
  return B;
}

/** the head's displacement shown, from the modes' envelopes: the dent at the strike point spreading
 *  into the modes' shapes (each slowed to a visible rate in proportion to its own frequency), the
 *  whole exaggerated so a loud stroke moves the 32″ head ≈ 2 cm, compressed so a soft one still shows */
const SLOW_HZ = 1.6;
const VIS_PEAK = 0.02;
const VIS_REF = 0.0025;
function poseHead(hm: HeadMesh, dr: TimpDrum, modes: Float32Array | null, amp: Float32Array, t: number, spot: number, dt: number): boolean {
  const a = dr.spec.d / 2;
  const nv = modes ? Math.min(16, Math.floor(modes.length / 3)) : 0;
  let S = 0;
  const decay = Math.exp(-dt / 0.3);
  for (let i = 0; i < 16; i++) {
    const y = i < nv ? Math.abs(modes![3 * i + 2]) : 0;
    amp[i] = Math.max(y, amp[i] * decay);
    if (i >= nv) amp[i] = 0;
    S += amp[i];
  }
  const w = hm.w;
  if (S < 1e-7) {
    if (hm.flat) return false;
    w.fill(0);
    hm.flat = true;
  } else {
    hm.flat = false;
    const g = (VIS_PEAK * (dr.spec.d / 0.813) * Math.sqrt(Math.min(1, S / VIS_REF))) / S;
    // each mode: its radial factor on the rings, its sign at the strike point, its slowed phase
    const coef = new Float32Array(16);
    const ms = new Int8Array(16);
    const rad: Float32Array[] = [];
    for (let i = 0; i < nv; i++) {
      const m = modes![3 * i];
      const j = modes![3 * i + 1];
      const key = `${m}:${j.toFixed(4)}`;
      let R = dr.radial.get(key);
      if (!R) {
        R = new Float32Array(NR + 1);
        for (let k = 0; k <= NR; k++) R[k] = besselJ(m, j * nodeR(k));
        dr.radial.set(key, R);
      }
      rad.push(R);
      ms[i] = m;
      const sg = Math.sign(besselJ(m, j * spot)) || 1;
      const om = TAU * SLOW_HZ * (j / 3.8317);
      coef[i] = -g * amp[i] * sg * Math.cos(om * t);
    }
    // the nodes: w = Σ c·J_m(j r/a)·cos mθ (θ from the strike point)
    w[0] = 0;
    for (let i = 0; i < nv; i++) if (ms[i] === 0) w[0] += coef[i] * rad[i][0];
    for (let k = 1; k <= NR; k++)
      for (let l = 0; l < NT; l++) {
        const th = (l / NT) * TAU;
        let s = 0;
        for (let i = 0; i < nv; i++) s += coef[i] * rad[i][k] * Math.cos(ms[i] * th);
        // (the rim is held: its ring is still whatever the modes' zeros say)
        w[4 * nodeIx(k, l)] = k === NR ? 0 : s;
      }
  }
  // normals from the grid's slopes (∂w/∂r, (1/r)∂w/∂θ), then the vertices
  const dr_ = a / NR;
  const n = (1 + NR * NT);
  for (let q = 0; q < n; q++) {
    w[4 * q + 1] = 0;
    w[4 * q + 2] = 1;
    w[4 * q + 3] = 0;
  }
  if (!hm.flat)
    for (let k = 1; k <= NR; k++)
      for (let l = 0; l < NT; l++) {
        const th = (l / NT) * TAU;
        const wi = w[4 * nodeIx(k, l)];
        const wo = k < NR ? w[4 * nodeIx(k + 1, l)] : 0;
        const wn = k > 1 ? w[4 * nodeIx(k - 1, l)] : w[0];
        const dwr = (wo - wn) / (2 * dr_);
        const r = a * nodeR(k);
        const dwt = (w[4 * nodeIx(k, l + 1)] - w[4 * nodeIx(k, l - 1)]) / (2 * (TAU / NT) * r);
        // the slope in x (the player's left) and z (towards the player): r̂ = (sin θ, cos θ), θ̂ = (cos θ, −sin θ)
        const gx = dwr * Math.sin(th) + dwt * Math.cos(th);
        const gz = dwr * Math.cos(th) - dwt * Math.sin(th);
        const L = Math.hypot(gx, 1, gz);
        const q = nodeIx(k, l);
        w[4 * q + 1] = -gx / L;
        w[4 * q + 2] = 1 / L;
        w[4 * q + 3] = -gz / L;
      }
  const d = hm.mesh.data;
  const node = hm.node;
  const h = dr.spec.h;
  for (let v = 0; v < node.length; v++) {
    const q = node[v];
    const o = v * 14;
    d[o + 1] = h + w[4 * q];
    d[o + 3] = w[4 * q + 1];
    d[o + 4] = w[4 * q + 2];
    d[o + 5] = w[4 * q + 3];
  }
  hm.mesh.dyn = (hm.mesh.dyn ?? 0) + 1;
  return true;
}

/** pose the set: `T` places it (the single stage: its own frame; the Orchestra: the seat) */
export function poseTimpani(b: Batch, tm: TimpaniModel, fr: VisualFrame | null, pose: TimpaniPose, dt: number, now: number, T: Mat4 | null = null, single = true): void {
  if (single) stageState = pose;
  const tv = fr?.timpani ?? null;
  const fresh = !!fr && fr !== pose.lastFrame;
  pose.lastFrame = fr;
  const spot = tv?.spot ?? 0.7;
  const W = pose.W;
  for (let k = 0; k < 4; k++) {
    const dr = tm.drums[k];
    const D = T ? chainM(T, dr.T) : dr.T;
    b.mesh(dr.statics, D);
    const dv = tv?.drums[k] ?? null;
    // the pedal at its travel (eased: the engine's glide is the pedal's own; this only smooths the frames)
    const want = pedalTilt(dv ? dv.pedal : 0.25);
    if (Number.isNaN(pose.tilt[k])) pose.tilt[k] = want;
    pose.tilt[k] += (want - pose.tilt[k]) * (1 - Math.exp(-dt / 0.05));
    aboutAxis(pose.R, PEDAL.pivot, [1, 0, 0], -pose.tilt[k]);
    mulInto(W, 0, D, pose.R);
    b.mesh(dr.pedal, W);
    // the gauge's pointer at the tuned note
    const ang = dv ? pointerAngle(dv.note, dv.lo, dv.hi) : 0;
    if (Number.isNaN(pose.needle[k])) pose.needle[k] = ang;
    pose.needle[k] += (ang - pose.needle[k]) * (1 - Math.exp(-dt / 0.06));
    aboutAxis(pose.R, [0, 0, 0], [0, 0, 1], pose.needle[k]);
    const G = chainM(D, dr.gauge);
    mulInto(W, 0, G, pose.R);
    b.mesh(dr.pointer, W);
    // the head
    let hm = pose.heads[k];
    if (!hm) hm = pose.heads[k] = buildHead(dr.spec);
    // (the clocks start at the frame that brings a stroke: the frames arrive some tens of milliseconds after
    // the engine struck, about as late as its sound reaches the ear, so the stroke is drawn from its start)
    if (dv && fresh && dv.ago + 0.02 < pose.tDrum[k]) pose.tDrum[k] = 0;
    else if (dv && fresh && pose.tDrum[k] > 0.3 && Math.abs(dv.ago - pose.tDrum[k]) > 0.3) pose.tDrum[k] = dv.ago;
    else pose.tDrum[k] += dt;
    poseHead(hm, dr, dv?.head ?? null, pose.amp[k], pose.tDrum[k], spot, dt);
    // a loud stroke: a faint shimmer across the head, quick up, settling with the drum
    const lv = dv ? clamp01((20 * Math.log10(Math.max(1e-6, dv.level)) - 4) / 20) : 0;
    const sh = lv * lv * Math.exp(-pose.tDrum[k] / 0.35);
    pose.shimmer[k] += (sh - pose.shimmer[k]) * (1 - Math.exp(-dt / (sh > pose.shimmer[k] ? 0.015 : 0.12)));
    const s = pose.shimmer[k];
    let glow: RGBA | null = null;
    if (s > 0.004) {
      glow = pose.glow;
      glow[0] = 1;
      glow[1] = 0.9;
      glow[2] = 0.74;
      glow[3] = 0.13 * s * (0.85 + 0.15 * Math.sin(now * 0.037));
    }
    b.mesh(hm.mesh, D, glow);
  }
  // the mallets: each hand from the engine's strokes
  for (let h = 0; h < 2; h++) {
    const hv = tv?.hands[h] ?? null;
    if (hv) {
      const struck = fresh && hv.ago + 0.02 < pose.tHand[h];
      if (struck) {
        pose.gapHand[h] = pose.tHand[h];
        pose.tHand[h] = 0;
      } else if (fresh && pose.tHand[h] > 0.3 && Math.abs(hv.ago - pose.tHand[h]) > 0.3) pose.tHand[h] = hv.ago;
      else pose.tHand[h] += dt;
      if (hv.drum >= 0 && hv.drum < 4 && (struck || hv.on || pose.tHand[h] > 50)) pose.handDrum[h] = hv.drum;
      if (hv.on) pose.tHand[h] = 0;
    } else pose.tHand[h] += dt;
    const k = Math.max(0, Math.min(3, pose.handDrum[h]));
    const dr = tm.drums[k];
    const never = pose.tHand[h] > 1e5;
    const al = never ? REST_ALPHA : malletLift(pose.tHand[h], hv?.vel ?? 80, pose.gapHand[h], !!hv?.on);
    pose.alpha[h] = al;
    const S = strikePoint(dr.spec, spot, h);
    const D = T ? chainM(T, dr.T) : dr.T;
    const Bl = malletMatrix(pose.R, S, h, al);
    mulInto(W, 0, D, pose.R);
    const Bw = xform(D, Bl);
    pose.ball[h][0] = Bw[0];
    pose.ball[h][1] = Bw[1];
    pose.ball[h][2] = Bw[2];
    b.mesh(tm.mallet, W);
  }
}

/** the review's views (scripts/shots-timpani-3d.mjs), in the stage's units: world points of the set */
function timpaniViews(tm: TimpaniModel): Record<string, { yaw: number; pitch: number; dist: number; target: Vec3 }> {
  const D = (k: number, p: Vec3) => xform(tm.drums[k].T, p).map((v) => +v.toFixed(4)) as Vec3;
  /** the bearing that looks back along a drum's own direction θ (from its +z, the player's side) */
  const yawOf = (k: number, th: number) => {
    const n = xform(tm.drums[k].T, [Math.sin(th), 0, Math.cos(th)]);
    const o = xform(tm.drums[k].T, [0, 0, 0]);
    return +Math.atan2(n[0] - o[0], -(n[2] - o[2])).toFixed(3);
  };
  const s0 = tm.drums[0].spec;
  const s3 = tm.drums[3].spec;
  const g = polar(s0.d / 2 + HOOP_OUT + 0.012, GAUGE.th, s0.h + HOOP_TOP + 0.012);
  const P = tm.player;
  return {
    front: { yaw: 0, pitch: 0.04, dist: 4.2, target: [0, 0.5, 0] },
    side: { yaw: Math.PI / 2, pitch: 0.04, dist: 4.2, target: [0, 0.5, 0] },
    above: { yaw: 0.0, pitch: 1.25, dist: 4.4, target: [0, 0.5, 0] },
    player: { yaw: Math.PI, pitch: 0.42, dist: 3.9, target: [0, 0.55, 0] },
    pedal: { yaw: yawOf(0, 0.55), pitch: 0.38, dist: 0.95, target: D(0, [0, 0.16, 0.3]) },
    gauge: { yaw: yawOf(0, GAUGE.th + 0.15), pitch: 0.42, dist: 0.42, target: D(0, g) },
    hoop: { yaw: yawOf(3, Math.PI - 0.35), pitch: 0.32, dist: 0.62, target: D(3, [0.08, s3.h - 0.04, -s3.d / 2]) },
    mallets: { yaw: Math.PI + 0.25, pitch: 0.55, dist: 1.25, target: [P[0], 0.86, P[2] - 0.55] },
  };
}
