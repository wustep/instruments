// The glockenspiel on the 3D stage: the 2D stage's own plan (ui/glock-plan.ts: the bars the engine's, each at
// its length, two rows on four felted rails in a trapezoid case) given its height: the bars 9.5 mm of
// brushed steel (ground along their length, their top edges broken by a 1.2 mm bevel) on their rails, each
// on two steel pins through its nodes, a felt washer under each pin's head; the accidentals' row a bar's
// thickness higher; the case a shallow tray of dark rosewood (a rim round its top, a nickel plate on each
// corner, two catches and a handle on the player's side, where its lid comes off) on a folding stand at a
// standing player's height (0.86 m to the bars: two crossed legs at each end on a pivot, a cradle under
// the case, two stretchers), and two mallets (a brass head on a rattan shaft, a cord grip).
//
// What moves is the engine's (the frame's `glock`): a bar that rings glows as far as the engine says it
// swings, and each mallet is over the bar its hand last struck: it comes down on a bar as it is struck and
// springs back up.
import type { VisualFrame } from '@piano-model/engine';
import { GLOCK_BAR_THICK } from '@piano-model/engine';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, mulInto, rotY, translate, xform } from './gl3d.ts';
import { M, bbox, cyl, ellipsoid, extrude, tube, variant } from './mesh.ts';
import { boxOf, make } from './horn3d.ts';
import { BARS, CASE, GK_X0, GK_X1, GK_Y0, GK_Y1, HEAD_R, HOLE_R, PIN_R, RAILS, RAIL_W, SHAFT, TRAY as TRAY_IN, WALL, barBox, barCentre, barNodes, strokePlace } from '../glock-plan.ts';

/** the bars' top above the floor, the case's depth under them, the far row's step up */
const TOP = 0.86;
const TRAY = 0.05;
const STEP = 0.012;
/** the bars' bevel, the pins' heads above the bars */
const BEVEL = 0.0012;
const PIN_UP = 0.0022;
// (the case: rosewood under a thin coat, its grain along the case; the tray's floor the same wood, in shadow)
const WOOD = M.rosewood;
// (brushed steel, ground along the bar: mats3 `glockBar`. A flat face turned to a dark room mirrors the
// dark, so part of its look is its own grey)
const BAR = variant(M.steel, { name: 'glockBar', rough: 0.34, metal: 0.7 });
const HEAD = variant(M.brass, { name: 'glockHead', rough: 0.3 });
const PLATE = M.nickelSatin;

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
export const GLOCK_VIEW = { yaw: 0.26, pitch: 0.8, swing: 0.3 };
/** a glockenspiel in the Orchestra stands by the timpani: its footprint's radius and its top (m) */
export const GLOCK_SEAT = { r: 0.5, top: 1.15 };

/** plan (x, y) at height h → the model's frame */
const at = (x: number, y: number, h: number): Vec3 => [x, h, -y];

export function buildGlockModel(): GlockModel {
  const barY = (i: number) => TOP - GLOCK_BAR_THICK + (BARS[i].sharp ? STEP : 0);
  const statics = make((mb) => {
    // (a plan outline (x, y away from the player) lies flat: x, z = −y, and is given its height)
    const flat = (pts: [number, number][], h0: number, h1: number, m: typeof WOOD) => extrude(mb, pts.map(([x, y]): [number, number] => [x, -y]), h0, h1, m);
    const FLOOR = TOP - TRAY;
    const RIM = TOP - 0.004;
    // the case: a tray: its floor, and its four walls round the trapezoid, each from the case's outline in
    // to the tray's (mitred at the corners), dark wood
    flat(CASE.map(([x, y]): [number, number] => [x, y]), FLOOR - 0.012, FLOOR, WOOD);
    for (let k = 0; k < CASE.length; k++) {
      const j = (k + 1) % CASE.length;
      flat([CASE[k], CASE[j], TRAY_IN[j], TRAY_IN[k]], FLOOR, RIM, WOOD);
    }
    // a nickel plate over each corner (26 mm along each side, wrapped over the rim), and its foot under it
    CASE.forEach((c, i) => {
      const along = (to: [number, number], d: number): [number, number] => {
        const L = Math.hypot(to[0] - c[0], to[1] - c[1]);
        return [c[0] + ((to[0] - c[0]) / L) * d, c[1] + ((to[1] - c[1]) / L) * d];
      };
      const a = along(CASE[(i + CASE.length - 1) % CASE.length], 0.026);
      const b2 = along(CASE[(i + 1) % CASE.length], 0.026);
      // (the outline runs anticlockwise: b2, the corner, a is clockwise, which the cap's faces want here)
      const out = (p: [number, number]): [number, number] => [c[0] + (p[0] - c[0]) * 1.0, c[1] + (p[1] - c[1]) * 1.0];
      flat([out(a), [c[0], c[1]], out(b2)], RIM, RIM + 0.0012, PLATE);
      flat([out(a), [c[0], c[1]], out(b2)], FLOOR - 0.013, FLOOR - 0.012, PLATE);
    });
    // the player's side: two catches (the lid's, their hasps down) and a handle between them
    {
      const [p0, p1] = [CASE[0], CASE[1]];
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const d: [number, number] = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L];
      const o: [number, number] = [d[1], -d[0]]; // out of the case, towards the player
      const on = (u: number, out: number): [number, number] => [p0[0] + d[0] * u * L + o[0] * out, p0[1] + d[1] * u * L + o[1] * out];
      for (const u of [0.2, 0.8]) {
        const q = [on(u - 0.02, 0), on(u + 0.02, 0), on(u + 0.02, 0.003), on(u - 0.02, 0.003)];
        flat(q, FLOOR + 0.008, RIM - 0.006, PLATE);
        const hasp = [on(u - 0.009, 0.003), on(u + 0.009, 0.003), on(u + 0.009, 0.0052), on(u - 0.009, 0.0052)];
        flat(hasp, FLOOR + 0.014, RIM - 0.001, M.nickelSilver);
      }
      const hy = (FLOOR + RIM) / 2 - 0.004;
      const h0 = on(0.5 - 0.055 / L, 0);
      const h1 = on(0.5 + 0.055 / L, 0);
      for (const h of [h0, h1]) {
        const e: [number, number] = [h[0] + o[0] * 0.006, h[1] + o[1] * 0.006];
        cyl(mb, at(h[0], h[1], hy), at(e[0], e[1], hy), 0.006, 0.006, 12, PLATE);
      }
      // (a strap of black hide, bowed out from its two mounts)
      const path: Vec3[] = [];
      for (let k = 0; k <= 12; k++) {
        const u = k / 12;
        const out = 0.006 + 0.02 * Math.sin(Math.PI * u);
        const x = h0[0] + (h1[0] - h0[0]) * u + o[0] * out;
        const y = h0[1] + (h1[1] - h0[1]) * u + o[1] * out;
        path.push(at(x, y, hy - 0.004 * Math.sin(Math.PI * u)));
      }
      tube(mb, path, 0.0042, 8, M.rubber);
    }
    // the rails: a wooden bar under each row of nodes, felt on it
    RAILS.forEach(([a, b], k) => {
      const h = TOP - GLOCK_BAR_THICK + (k >= 2 ? STEP : 0);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const L = Math.hypot(dx, dy);
      const n: [number, number] = [(-dy / L) * (RAIL_W / 2), (dx / L) * (RAIL_W / 2)];
      const quad: [number, number][] = [[a[0] - n[0], a[1] - n[1]], [b[0] - n[0], b[1] - n[1]], [b[0] + n[0], b[1] + n[1]], [a[0] + n[0], a[1] + n[1]]];
      flat(quad, FLOOR, h - 0.003, WOOD);
      flat(quad, h - 0.003, h, M.damperFelt);
    });
    // the pins: one through each node of each bar, from its rail up through the bar: a felt washer on the
    // bar, the pin's domed head on it
    for (let i = 0; i < BARS.length; i++) {
      const top = barY(i) + GLOCK_BAR_THICK;
      for (const [x, y] of barNodes(i)) {
        cyl(mb, at(x, y, top - 0.0002), at(x, y, top + 0.0009), HOLE_R, HOLE_R, 12, M.rubber);
        cyl(mb, at(x, y, top + 0.0009), at(x, y, top + PIN_UP * 0.55), PIN_R, PIN_R, 10, M.pinSteel);
        ellipsoid(mb, at(x, y, top + PIN_UP * 0.55), [PIN_R, PIN_UP * 0.45, PIN_R], 10, M.pinSteel);
      }
    }
    // the stand: at each end two crossed legs on a pivot, each from a rubber foot on the floor up to the
    // cradle the case lies on; two stretchers between the ends
    const ends = [GK_X0 + 0.07, GK_X1 - 0.07];
    const y0 = GK_Y0 + 0.03;
    const y1 = GK_Y1 - 0.06;
    const under = FLOOR - 0.012;
    for (const x of ends) {
      for (const [a, b2] of [[y0 - 0.1, y1], [y1 + 0.1, y0]]) {
        cyl(mb, at(x, a, 0), at(x, a, 0.014), 0.018, 0.016, 12, M.rubber);
        cyl(mb, at(x, a, 0.014), at(x, b2, under - 0.016), 0.011, 0.011, 14, M.darkSteel);
      }
      // the pivot where they cross (half way up), its bolt's two heads
      const ym = (y0 - 0.1 + y1 + 0.1 + y1 + y0) / 4;
      const hm = (0.014 + under - 0.016) / 2;
      cyl(mb, at(x - 0.016, ym, hm), at(x + 0.016, ym, hm), 0.006, 0.006, 10, M.nickelSatin);
      // the cradle: a flat bar across under the case, a rubber pad at each end of it
      bbox(mb, [x - 0.014, under - 0.016, -(y1 + 0.02)], [x + 0.014, under - 0.004, -(y0 - 0.02)], M.darkSteel, 0.002);
      for (const y of [y0, y1]) bbox(mb, [x - 0.016, under - 0.004, -(y + 0.018)], [x + 0.016, under, -(y - 0.018)], M.rubber, 0.001);
    }
    const mid = (GK_Y0 + GK_Y1) / 2 - 0.02;
    cyl(mb, at(ends[0], mid, 0.42), at(ends[1], mid, 0.42), 0.008, 0.008, 12, M.darkSteel);
    // (the second stretcher low between the back feet's legs, where they are a hand over the floor)
    const lowY = y1 + 0.1 - (y1 + 0.1 - y0) * 0.16;
    const lowH = 0.014 + (under - 0.03) * 0.16;
    cyl(mb, at(ends[0], lowY, lowH), at(ends[1], lowY, lowH), 0.007, 0.007, 12, M.darkSteel);
  });
  const bars = BARS.map((_, i) =>
    make((mb) => {
      const [x0, y0, x1, y1] = barBox(i);
      const h = barY(i);
      bbox(mb, [x0, h, -y1], [x1, h + GLOCK_BAR_THICK, -y0], BAR, BEVEL);
    }),
  );
  const mallet = make((mb) => {
    // the head (hard brass), a collar under it; the shaft back along +z and a little up: rattan, thinner
    // at the head, the last hand's width of it bound with cord
    ellipsoid(mb, [0, 0, 0], [HEAD_R, HEAD_R, HEAD_R], 20, HEAD);
    const p = (u: number): Vec3 => [0, 0.06 * u, SHAFT * u];
    cyl(mb, p(HEAD_R / SHAFT), p(HEAD_R / SHAFT + 0.02), 0.0046, 0.0036, 12, HEAD);
    cyl(mb, p(0), p(0.7), 0.0032, 0.0042, 10, M.maple);
    cyl(mb, p(0.7), p(1), 0.0052, 0.0054, 12, M.cork);
    ellipsoid(mb, p(1), [0.0054, 0.0054, 0.003], 10, M.cork);
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
    // (where the engine says its last stroke landed on the bar)
    const last = gv?.hits.find((x) => x.hand === hand);
    const over = gv ? Math.max(0, Math.min(BARS.length - 1, gv.hands[hand])) : hand ? 20 : 8;
    const to = last && last.bar === over ? strokePlace(over, last.along, last.across) : barCentre(over);
    h.p[hand][0] += (to[0] - h.p[hand][0]) * k;
    h.p[hand][1] += (to[1] - h.p[hand][1]) * k;
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
