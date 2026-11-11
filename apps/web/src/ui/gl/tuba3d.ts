// The tuba on the 3D stage: the contrabass tuba in C with four front-action pistons, built from the 2D
// stage's own plan (ui/tuba-plan.ts: the body's flattened spiral, the valves' loops, the main tuning slide
// and the leadpipe, every length the engine's) given its depth: the body in one plane, the bell's stack
// standing in it, the valve block and its loops in front of it (front-action valves stand before the body,
// under the right hand), the leadpipe wound round the front of the bell from the mouthpiece beside it.
// Lacquered yellow brass (the horn's, handled), nickel-silver caps, stems and ferrules, pearl buttons, a
// silver-plated mouthpiece. Measures: 0.97 m to the rim, a bell 0.48 m across with a rolled bead, a 19 mm bore
// through the valves, casings 33 mm across and 140 mm tall, 21 mm of piston travel (the makers' figures for
// the Conn 52J/54J and the Yamaha YCB-822; docs/3d-reference.md).
//
// What moves, by the engine's own state: the pistons go down for the note's fingering (tubaFingering), each
// on its spring; the tubing the air goes through glows with the bore's standing wave (the loops of the valves
// that are down among it), the bell's mouth shimmers with the level, the breath goes into the mouthpiece.
import { tubaFingering, valvesDown, type VisualFrame } from '@piano-model/engine';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, chain, cross, mulInto, norm, rotX, rotY, translate, xform } from './gl3d.ts';
import { M, cyl } from './mesh.ts';
import { F3, boxOf, latheOn, make, tubeAlong } from './horn3d.ts';
import { fillet, springTo } from './oboe3d.ts';
import { breathIn, type WindPose } from './winds3d.ts';
import { BELL_LEN, BELL_X, BORE, BUTTON_Y, CASING_R, CASING_Y0, CASING_Y1, MPIECE, MP_RIM, RIM_R, RIM_Y, TRAVEL, TUBES, VALVE_X, VALVE_Y, bellR, tubaAir } from '../tuba-plan.ts';

type P2 = [number, number];
const BR = M.hornBrass;
const NS = M.nickelSilver;
const TAU = 2 * Math.PI;
/** how far in front of the body's plane the valve block and its tubing stand (m) */
export const VALVE_Z = 0.078;
/** a tube clear of the bell: how far in front of the bell's axis a point at (x, y) must be */
const overBell = (x: number, y: number, r: number): number => {
  if (y < 0.2 || y > RIM_Y) return 0;
  const R = bellR(RIM_Y - y) + r + 0.004;
  const dx = x - BELL_X;
  return Math.abs(dx) < R ? Math.sqrt(R * R - dx * dx) : 0;
};
const smooth = (u: number) => {
  const t = Math.min(1, Math.max(0, u));
  return t * t * (3 - 2 * t);
};

/** a plan tube's centre line in space (m): every `step`-th of its points, at the depth `z` gives it */
function lift(id: string, step: number, z: (x: number, y: number, f: number) => number): Vec3[] {
  const p = TUBES[id].pts;
  const out: Vec3[] = [];
  for (let i = 0; i < p.length; i += step) out.push([p[i][0], p[i][1], z(p[i][0], p[i][1], i / (p.length - 1))]);
  const l = p[p.length - 1];
  if ((p.length - 1) % step) out.push([l[0], l[1], z(l[0], l[1], 1)]);
  return out;
}
const lenOf = (p: Vec3[]) => {
  let s = 0;
  for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]);
  return s;
};

export interface TubaSeg {
  /** the run of the air's path it is part of (tuba-plan.ts airPath's ids), and where along that run (m) */
  route: string;
  s0: number;
  s1: number;
  mesh: Mesh;
}
export interface TubaModel {
  /** standing on its bottom bow, alone on the stage */
  T: Mat4;
  statics: Mesh[];
  /** the bore's tubing in pieces, each glowing with the standing wave where the air goes through it */
  segs: TubaSeg[];
  /** the bell's rim and inside (shimmers with the level) */
  rim: Mesh;
  /** each piston's moving part (its stem and button), valves 1–4 */
  pistons: Mesh[];
  /** the mouthpiece's rim (the lips' place) and the axis out of its cup, in the model */
  lips: Vec3;
  lipAxis: Vec3;
  /** each plan tube's length as built (m), and the whole height and the rim's width (tests) */
  lengths: Record<string, number>;
  height: number;
  bellWidth: number;
  bounds: { c: Vec3; r: number };
}

/** the camera for the tuba alone (scenes3d viewFor): from its front, a little round towards the bell's side
 *  and above, so the valves, the leadpipe and the bell's mouth all read; a narrow stage may swing further */
export const TUBA_VIEW = { yaw: -0.42, pitch: 0.2, swing: 0.3 };
/** its seat in the Orchestra (scenes3d ensembleSeats): the height its bottom bow rests at on the seated
 *  player's lap, the seat's own turn, the height the framing allows for and the footprint's radius */
export const TUBA_SEAT = { y: 0.46, turn: 0, top: 1.5, r: 0.5 };
/** held as a seated player holds it: upright on the lap, leaning a little back and to the player's left, the
 *  valves under the right hand */
export const TUBA_HELD: Mat4 = chain(rotY(0.25), rotX(-0.14));

export function buildTubaModel(): TubaModel {
  const segs: TubaSeg[] = [];
  const lengths: Record<string, number> = {};
  /** a tube cut into pieces about `piece` m long, each its own mesh (they glow apart) */
  const pieces = (route: string, path: Vec3[], r: (s: number) => number, piece: number, seg: number, hand: number) => {
    const acc = [0];
    for (let i = 1; i < path.length; i++) acc.push(acc[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]));
    lengths[route] = acc[acc.length - 1];
    let i0 = 0;
    while (i0 < path.length - 1) {
      let i1 = i0 + 1;
      while (i1 < path.length - 1 && acc[i1] - acc[i0] < piece) i1++;
      const part = path.slice(i0, i1 + 1);
      const s0 = acc[i0];
      segs.push({ route, s0, s1: acc[i1], mesh: make((mb) => tubeAlong(mb, part, (s) => r(s0 + s), BR, seg, { hand: () => hand })) });
      i0 = i1;
    }
  };
  // ---- the body: the plan's spiral in its plane, widening all the way
  const bodyR = TUBES.body.r as (s: number) => number;
  pieces('body', lift('body', 4, () => 0), bodyR, 0.09, 28, 0.5);
  // ---- the bell: the stack and the flare, turned about its axis in rings (the wave's last run)
  const ring = (d0: number, d1: number): Mesh =>
    make((mb) => {
      const prof: P2[] = [];
      const n = Math.max(2, Math.ceil((d0 - d1) / (d1 < 0.2 ? 0.004 : 0.012)));
      for (let i = 0; i <= n; i++) {
        const d = d0 + ((d1 - d0) * i) / n;
        prof.push([bellR(d), RIM_Y - d]);
      }
      latheOn(mb, [BELL_X, 0, 0], [0, 1, 0], prof, 72, BR);
    });
  const cuts = [BELL_LEN, 0.62, 0.48, 0.36, 0.25, 0.15, 0.07, 0];
  for (let i = 1; i < cuts.length; i++) segs.push({ route: 'bell', s0: BELL_LEN - cuts[i - 1], s1: BELL_LEN - cuts[i], mesh: ring(cuts[i - 1], cuts[i]) });
  // the rim's rolled bead and the bell's inside, down to the throat
  const rim = make((mb) => {
    const prof: P2[] = [[RIM_R, RIM_Y], [RIM_R + 0.0035, RIM_Y - 0.0012], [RIM_R + 0.0052, RIM_Y + 0.002], [RIM_R + 0.0035, RIM_Y + 0.0052], [RIM_R - 0.0005, RIM_Y + 0.0056], [RIM_R - 0.003, RIM_Y + 0.003]];
    for (let d = 0.006; d < BELL_LEN; d += d < 0.2 ? 0.006 : 0.02) prof.push([Math.max(0.004, bellR(d) - 0.0016), RIM_Y - d]);
    latheOn(mb, [BELL_X, 0, 0], [0, 1, 0], prof, 72, BR);
  });
  // ---- the small tubing: the leadpipe round the bell's front, the loops and the main slide by the valves
  const front = (x: number, y: number) => Math.max(VALVE_Z, overBell(x, y, BORE));
  const leadR = TUBES.lead.r as (s: number) => number;
  // (from the mouthpiece beside the bell, over the bell's front, down to the first valve)
  pieces('lead', lift('lead', 2, (x, y, f) => Math.max(overBell(x, y, BORE), VALVE_Z * smooth((f - 0.45) / 0.4))), leadR, 0.07, 18, 0.7);
  for (const id of ['L1', 'L2', 'L3', 'L4']) pieces(id, lift(id, 2, front), () => BORE, 0.07, 18, 0.6);
  // (the main slide leaves the fourth valve in front and comes back into the body's plane as it rises)
  pieces('slide', lift('slide', 2, (_x, _y, f) => VALVE_Z * (1 - smooth((f - 0.45) / 0.5))), () => 0.011, 0.07, 18, 0.4);
  // ---- the statics: the valve block, the mouthpiece, ferrules and stays
  const statics = make((mb) => {
    VALVE_X.forEach((x, k) => {
      // the casing, its top cap (the stem's guide) and its bottom cap, each a knurled nickel ring
      cyl(mb, [x, CASING_Y0, VALVE_Z], [x, CASING_Y1, VALVE_Z], CASING_R, CASING_R, 36, BR, false);
      latheOn(mb, [x, CASING_Y1, VALVE_Z], [0, 1, 0], fillet([[0.004, 0.0125], [CASING_R - 0.002, 0.0125], [CASING_R + 0.002, 0.0105], [CASING_R + 0.002, 0.001], [CASING_R, 0]] as P2[], 0.0008, 3), 36, NS);
      latheOn(mb, [x, CASING_Y0, VALVE_Z], [0, -1, 0], fillet([[0, 0.014], [CASING_R - 0.004, 0.014], [CASING_R + 0.002, 0.0115], [CASING_R + 0.002, 0.001], [CASING_R, 0]] as P2[], 0.0008, 3), 36, NS);
      // the knuckle of the main line to the next casing
      if (k < 3) cyl(mb, [x - CASING_R + 0.002, VALVE_Y, VALVE_Z], [VALVE_X[k + 1] + CASING_R - 0.002, VALVE_Y, VALVE_Z], BORE, BORE, 20, BR, false);
    });
    // the leadpipe's way into the first valve, the block's stays to the body behind it
    for (const [a, b] of [
      [[VALVE_X[0], 0.5, VALVE_Z - CASING_R], [-0.045, 0.5, 0.03]],
      [[VALVE_X[3], 0.39, VALVE_Z - CASING_R], [-0.2, 0.39, 0.045]],
      [[VALVE_X[2], 0.5, VALVE_Z - CASING_R], [-0.125, 0.5, 0.02]],
      [[-0.06, 0.82, overBell(-0.06, 0.82, BORE) - 0.006], [-0.03, 0.82, overBell(-0.03, 0.82, 0) - 0.01]],
    ] as [Vec3, Vec3][]) cyl(mb, a, b, 0.0028, 0.0028, 10, BR, true);
    // the ferrules where each slide's legs leave their sleeves
    const band = (p: Vec3, dir: Vec3, r: number) => latheOn(mb, p, dir, fillet([[r, -0.006], [r + 0.0012, -0.0055], [r + 0.0012, 0.0055], [r, 0.006]] as P2[], 0.0004, 2), 24, NS);
    for (const id of ['L1', 'L2', 'L3', 'L4']) {
      const p = lift(id, 2, front);
      for (const at of [id === 'L4' ? 0.13 : 0.04, lenOf(p) - (id === 'L4' ? 0.13 : 0.04)]) {
        let s = 0;
        for (let i = 1; i < p.length; i++) {
          s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]);
          if (s >= at) {
            band(p[i], norm([p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]]), BORE);
            break;
          }
        }
      }
    }
    // the mouthpiece: a deep funnel, silver plate, its rim towards the player
    latheOn(mb, [MP_RIM[0], MP_RIM[1], 0], [-1, 0, 0], [[0.0128, 0.0015] as P2, ...MPIECE.map(([r, s]): P2 => [r, s])], 40, M.silverPolish);
    // (the cup's inside, seen through the rim)
    latheOn(mb, [MP_RIM[0], MP_RIM[1], 0], [-1, 0, 0], [[0.0128, 0.0015], [0.012, 0.012], [0.008, 0.028], [0.004, 0.04]] as P2[], 32, M.boreDark);
  });
  // ---- the pistons' moving parts: the stem and the pearl button
  const pistons = VALVE_X.map((x) =>
    make((mb) => {
      cyl(mb, [x, CASING_Y1 + 0.006, VALVE_Z], [x, BUTTON_Y - 0.004, VALVE_Z], 0.0026, 0.0026, 14, NS, false);
      latheOn(mb, [x, BUTTON_Y - 0.0045, VALVE_Z], [0, 1, 0], fillet([[0, 0], [0.0135, 0], [0.0135, 0.0035], [0.011, 0.0055], [0, 0.0062]] as P2[], 0.0012, 3), 32, NS);
      latheOn(mb, [x, BUTTON_Y + 0.0012, VALVE_Z], [0, 1, 0], fillet([[0, 0.0012], [0.0098, 0.0008], [0.0104, 0], [0, 0]] as P2[], 0.0004, 2), 28, M.pearlButton);
    }),
  );
  const T = translate(0, 0, 0);
  const bx = boxOf([statics, rim, ...segs.map((s) => s.mesh), ...pistons]);
  const c: Vec3 = [(bx.lo[0] + bx.hi[0]) / 2, (bx.lo[1] + bx.hi[1]) / 2, (bx.lo[2] + bx.hi[2]) / 2];
  const r = 0.5 * Math.hypot(bx.hi[0] - bx.lo[0], bx.hi[1] - bx.lo[1], bx.hi[2] - bx.lo[2]) + 0.01;
  const model: TubaModel = { T, statics: [statics], segs, rim, pistons, lips: F3([MP_RIM[0], MP_RIM[1], 0]), lipAxis: F3([1, 0, 0]), lengths, height: bx.hi[1] - bx.lo[1], bellWidth: 2 * (RIM_R + 0.0052), bounds: { c: xform(T, c), r } };
  // (tests and review shots: the pistons as the stage last posed them, the lengths as built)
  if (typeof window !== 'undefined') (window as unknown as { __tuba3d?: unknown }).__tuba3d = { lengths, pistons: () => (stageState ? Array.from(stageState.pos) : null), bounds: model.bounds };
  return model;
}

interface TubaPoseState {
  /** each piston's spring (0 up … 1 down) */
  pos: Float32Array;
  vel: Float32Array;
  /** seconds since it last sounded */
  quiet: number;
  W: Float32Array;
  glow: RGBA;
  lipGap: number;
}
const poses = new WeakMap<WindPose, TubaPoseState>();
/** tests: the pistons' springs as posed (valves 1–4: 1 down) */
export const tubaPistonState = (pose: WindPose): Float32Array | null => poses.get(pose)?.pos ?? null;
/** the single stage's pose state, last posed (tests) */
let stageState: TubaPoseState | null = null;
const NONE = [false, false, false, false];
const DOWN = new Float32Array(16);

export function poseTuba(b: Batch, tm: TubaModel, fr: VisualFrame | null, pose: WindPose, dt: number, now: number, rms: number, T: Mat4 = tm.T): void {
  let st = poses.get(pose);
  if (!st) poses.set(pose, (st = { pos: new Float32Array(4), vel: new Float32Array(4), quiet: 10, W: new Float32Array(16), glow: [0, 0, 0, 0], lipGap: 0 }));
  if (T === tm.T) stageState = st;
  for (const s of tm.statics) b.mesh(s, T);
  const lips = fr?.lips ?? null;
  const blow = lips ? lips.blow : 0;
  const focus = fr?.focus ?? null;
  // the fingering for the note the engine plays, held while it sounds and a moment after
  st.quiet = blow > 0.02 ? 0 : Math.min(9, st.quiet + dt);
  const fg = focus && st.quiet < 0.8 ? tubaFingering(focus.midi) : null;
  const down = fg ? valvesDown(fg.valves, 4) : NONE;
  for (let k = 0; k < 4; k++) {
    const p = springTo(st.pos, st.vel, k, down[k] ? 1 : 0, dt, 16, 0.5);
    // (the model is built with its z flipped: a move along y is the same in both)
    DOWN.set(translate(0, -TRAVEL * p, 0));
    mulInto(st.W, 0, T, DOWN);
    b.mesh(tm.pistons[k], st.W);
  }
  // the bore: the standing wave along the air's path (lips → bell), on the tubing the air goes through
  const shape = focus?.shapes?.[0] ?? null;
  let peak = 0;
  if (shape) for (let i = 0; i < shape.length; i++) peak = Math.max(peak, Math.abs(shape[i]));
  const sounding = blow > 0.02 && !!shape && peak > 0 && !!fg;
  const lvl = Math.min(1, Math.sqrt(rms) * 3);
  const setGlow = (a: number): RGBA | null => {
    if (a <= 0.003) return null;
    st!.glow[0] = 1;
    st!.glow[1] = 0.7;
    st!.glow[2] = 0.42;
    st!.glow[3] = a;
    return st!.glow;
  };
  const air = sounding ? tubaAir(down) : null;
  for (const s of tm.segs) {
    let g = 0;
    if (air) {
      const ri = air.runs.findIndex((r) => r.id === s.route);
      if (ri >= 0) {
        const off = air.starts[ri] - (air.runs[ri].offset ?? 0);
        const f = Math.min(1, Math.max(0, (off + (s.s0 + s.s1) / 2) / air.total));
        const j = Math.min(shape!.length - 1, Math.round(f * (shape!.length - 1)));
        g = 0.095 * Math.min(1, blow * 1.4) * (Math.abs(shape![j]) / peak);
      }
    }
    b.mesh(s.mesh, T, setGlow(g));
  }
  // the bell's mouth: a faint shimmer with the level
  b.mesh(tm.rim, T, lvl > 0.02 ? setGlow(0.09 * lvl * (0.75 + 0.25 * Math.sin(now * 0.021))) : null);
  // the breath into the mouthpiece while the note is blown (winds3d breathIn), pulsing with the engine's lips
  const open = lips ? Math.min(1.6, lips.open) : 0;
  st.lipGap += (open - st.lipGap) * (1 - Math.exp(-dt / 0.04));
  if (blow > 0.02) {
    const f1 = focus?.f1 ?? 65;
    const buzz = 0.5 - 0.5 * Math.cos(TAU * 4.5 * Math.sqrt(Math.max(0.1, f1 / 98)) * (now / 1000));
    const ax = norm(tm.lipAxis);
    breathIn(b, T, tm.lips, ax, norm(cross(ax, [0, 1, 0])), Math.min(1, 0.35 + lvl) * (0.6 + 0.4 * Math.min(1, st.lipGap) * buzz), now);
  }
}
