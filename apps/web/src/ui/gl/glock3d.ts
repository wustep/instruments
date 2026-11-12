// The glockenspiel on the 3D stage: the 2D stage's own plan (ui/glock-plan.ts: the bars the engine's, each at
// its length, two rows on four felted rails in a trapezoid case) given its height: the bars 9.5 mm of steel
// on their rails, the accidentals' row a bar's thickness higher, the case a shallow tray of dark wood on a
// folding stand at a standing player's height (0.86 m to the bars), and two mallets.
//
// What moves is the engine's (the frame's `glock`): a bar that rings glows as far as the engine says it
// swings, and each mallet is over the bar its hand last struck: it comes down on a bar as it is struck and
// springs back up.
import type { VisualFrame } from '@piano-model/engine';
import { GLOCK_BAR_THICK } from '@piano-model/engine';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, mulInto, rotY, translate, xform } from './gl3d.ts';
import { M, box, cyl, ellipsoid, extrude, variant } from './mesh.ts';
import { boxOf, make } from './horn3d.ts';
import { BARS, CASE, GK_X0, GK_X1, GK_Y0, GK_Y1, HEAD_R, RAILS, SHAFT, barBox, barCentre } from '../glock-plan.ts';

/** the bars' top above the floor, the case's depth under them, the far row's step up */
const TOP = 0.86;
const TRAY = 0.05;
const STEP = 0.012;
const WOOD = variant(M.maple, { name: 'glockCase', col: [0.16, 0.1, 0.06] as never });
// (brushed steel: a flat face turned to a dark room mirrors the dark, so half of its look is its own grey)
const BAR = variant(M.steel, { name: 'glockBar', rough: 0.42, metal: 0.45 });
const HEAD = variant(M.brass, { name: 'glockHead', rough: 0.3 });

export interface GlockModel {
  /** the instrument on its stand, its middle over the stage's: plan x → x, plan y (away from the player) → z
   *  as the meshes are stored */
  T: Mat4;
  statics: Mesh[];
  /** each bar's own mesh (drawn with its glow) */
  bars: Mesh[];
  /** a mallet: its head at the origin, its shaft back along +z and a little up */
  mallet: Mesh;
  /** tests: the bars' count, the lowest bar's length and the highest's, the bars' height above the floor */
  count: number;
  longest: number;
  shortest: number;
  top: number;
  bounds: { c: Vec3; r: number };
}
/** the camera for the glockenspiel alone (scenes3d viewFor): from the player's side and above, the low bars
 *  at the left; a narrow stage may swing round */
export const GLOCK_VIEW = { yaw: 0.2, pitch: 0.62, swing: 0.3 };
/** a glockenspiel in the Orchestra stands by the timpani: its footprint's radius and its top (m) */
export const GLOCK_SEAT = { r: 0.5, top: 1.15 };

/** plan (x, y) at height h → the model's frame */
const at = (x: number, y: number, h: number): Vec3 => [x, h, -y];

export function buildGlockModel(): GlockModel {
  const barY = (i: number) => TOP - GLOCK_BAR_THICK + (BARS[i].sharp ? STEP : 0);
  const statics = make((mb) => {
    // the case: a tray (its floor and four walls round the trapezoid), dark wood
    // (a plan outline (x, y away from the player) lies flat: x, z = −y, and is given its height)
    const flat = (pts: [number, number][], h0: number, h1: number, m: typeof WOOD) => extrude(mb, pts.map(([x, y]): [number, number] => [x, -y]), h0, h1, m);
    flat(CASE.map(([x, y]): [number, number] => [x, y]), TOP - TRAY - 0.012, TOP - TRAY, WOOD);
    const wall = (a: [number, number], b: [number, number]) => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const L = Math.hypot(dx, dy);
      const n: [number, number] = [-dy / L, dx / L];
      const t = 0.012;
      const quad: [number, number][] = [a, b, [b[0] + n[0] * t, b[1] + n[1] * t], [a[0] + n[0] * t, a[1] + n[1] * t]];
      flat(quad, TOP - TRAY, TOP - 0.004, WOOD);
    };
    for (let k = 0; k < CASE.length; k++) wall(CASE[k], CASE[(k + 1) % CASE.length]);
    // the rails: a wooden bar under each row of nodes, felt on it
    RAILS.forEach(([a, b], k) => {
      const h = TOP - GLOCK_BAR_THICK + (k >= 2 ? STEP : 0);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const L = Math.hypot(dx, dy);
      const n: [number, number] = [(-dy / L) * 0.006, (dx / L) * 0.006];
      const quad: [number, number][] = [[a[0] - n[0], a[1] - n[1]], [b[0] - n[0], b[1] - n[1]], [b[0] + n[0], b[1] + n[1]], [a[0] + n[0], a[1] + n[1]]];
      flat(quad, TOP - TRAY, h - 0.003, WOOD);
      flat(quad, h - 0.003, h, M.damperFelt);
    });
    // the stand: two crossed legs at each end, a rail between them
    for (const x of [GK_X0 + 0.07, GK_X1 - 0.07]) {
      const y0 = GK_Y0 + 0.03;
      const y1 = GK_Y1 - 0.06;
      // (each leg from a rubber foot on the floor)
      for (const [a, b2] of [[y0 - 0.1, y1], [y1 + 0.1, y0]]) {
        cyl(mb, at(x, a, 0), at(x, a, 0.014), 0.018, 0.016, 12, M.ebony);
        cyl(mb, at(x, a, 0.014), at(x, b2, TOP - TRAY - 0.012), 0.011, 0.011, 12, M.darkSteel);
      }
    }
    cyl(mb, at(GK_X0 + 0.07, (GK_Y0 + GK_Y1) / 2 - 0.02, 0.42), at(GK_X1 - 0.07, (GK_Y0 + GK_Y1) / 2 - 0.02, 0.42), 0.008, 0.008, 10, M.darkSteel);
  });
  const bars = BARS.map((_, i) =>
    make((mb) => {
      const [x0, y0, x1, y1] = barBox(i);
      const h = barY(i);
      box(mb, [x0, h, -y1], [x1, h + GLOCK_BAR_THICK, -y0], BAR);
    }),
  );
  const mallet = make((mb) => {
    ellipsoid(mb, [0, 0, 0], [HEAD_R, HEAD_R, HEAD_R], 16, HEAD);
    cyl(mb, [0, 0, 0], [0, 0.06, SHAFT], 0.004, 0.0045, 8, M.maple);
  });
  const bx = boxOf([statics]);
  const c: Vec3 = [(bx.lo[0] + bx.hi[0]) / 2, 0, (bx.lo[2] + bx.hi[2]) / 2];
  // (the instrument's middle over the stage's)
  const T = translate(-c[0], 0, -c[2]);
  const r = 0.5 * Math.hypot(bx.hi[0] - bx.lo[0], TOP + 0.2, bx.hi[2] - bx.lo[2] + SHAFT) + 0.02;
  const model: GlockModel = { T, statics: [statics], bars, mallet, count: BARS.length, longest: BARS[0].length, shortest: BARS[BARS.length - 1].length, top: TOP, bounds: { c: [0, (TOP + 0.05) / 2, 0.08], r } };
  if (typeof window !== 'undefined') (window as unknown as { __glock3d?: unknown }).__glock3d = { bounds: model.bounds, state: () => stageState };
  return model;
}

/** what the stage last drew of the single glockenspiel (tests): each bar's glow, each mallet's head (the
 *  model's frame, m) and how far it is lifted */
let stageState: { glow: number[]; heads: Vec3[]; lift: number[]; ringing: number } | null = null;
const PM = new Float32Array(16);
const GLOW: RGBA = [1, 0.74, 0.36, 0];
/** each scene's mallets: where their heads are (plan x, y), eased from frame to frame */
const hands = new WeakMap<GlockModel, { p: [number, number][]; t: number }>();

export function poseGlock(b: Batch, gm: GlockModel, fr: VisualFrame | null, _dt: number, now: number, T: Mat4 = gm.T): void {
  for (const s of gm.statics) b.mesh(s, T);
  const gv = fr?.glock ?? null;
  const glow: number[] = [];
  let ringing = 0;
  for (let i = 0; i < BARS.length; i++) {
    const a = gv ? Math.min(1, gv.amp[i] ?? 0) : 0;
    const g = a > 0.004 ? Math.min(1, 0.12 + 0.9 * Math.sqrt(a)) : 0;
    glow.push(g);
    if (g > 0) ringing++;
    GLOW[3] = g;
    b.mesh(gm.bars[i], T, g > 0 ? GLOW : null);
  }
  // the mallets: each head over its hand's bar, down on it at the stroke and up again
  let h = hands.get(gm);
  if (!h) hands.set(gm, (h = { p: [barCentre(8), barCentre(20)].map(([x, y]) => [x, y] as [number, number]), t: now }));
  const dt = Math.min(0.1, Math.max(0, (now - h.t) / 1000));
  h.t = now;
  const k = 1 - Math.exp(-dt / 0.03);
  const heads: Vec3[] = [];
  const lift: number[] = [];
  for (const hand of [0, 1]) {
    const to = barCentre(gv ? Math.max(0, Math.min(BARS.length - 1, gv.hands[hand])) : hand ? 20 : 8);
    h.p[hand][0] += (to[0] - h.p[hand][0]) * k;
    h.p[hand][1] += (to[1] - h.p[hand][1]) * k;
    const last = gv?.hits.find((x) => x.hand === hand);
    const ago = last ? last.ago : 9;
    const up = ago < 0.03 ? 0 : Math.min(1, 1 - Math.exp(-(ago - 0.03) / 0.07));
    lift.push(up);
    const bar = gv ? gv.hands[hand] : hand ? 20 : 8;
    const y = TOP + (BARS[Math.max(0, Math.min(BARS.length - 1, bar))].sharp ? STEP : 0) + HEAD_R + 0.07 * up;
    // (the meshes are built with plan y away from the player as −z and stored mirrored, as every model's is:
    // in the frame the instances are placed in, away from the player is +z)
    const p: Vec3 = [h.p[hand][0], y, h.p[hand][1]];
    heads.push(p);
    // (the shaft back towards the player, fanned out a little from the instrument's middle)
    const m = translate(p[0], p[1], p[2]);
    mulInto(PM, 0, m, rotY((hand ? -0.16 : 0.16) - (p[0] - (GK_X0 + GK_X1) / 2) * 0.25));
    const W = new Float32Array(16);
    mulInto(W, 0, T, PM);
    b.mesh(gm.mallet, W);
  }
  if (T === gm.T) stageState = { glow, heads: heads.map((p) => xform(T, p)), lift, ringing };
}
