// The timpani's plan for the 2D stage: four pedal kettledrums at their real sizes in metres, set out in the
// arc a timpanist plays them in, and the view they are drawn from. Shared by both styles (timpani-draw.ts,
// vector/timpani.ts); nothing here draws.
//
// The view. The set is seen from behind the player, a little above (over the timpanist's shoulders; the
// player is not drawn), the way the photographs of a setup are taken from the stool ("Standard timpani
// setup", Wikimedia Commons, CC BY-SA 3.0). From there the largest drum is on the left and the smallest on
// the right (the American layout: the 32″ under the player's left hand), so the drums run low to high left to
// right like the keys under the stage and the piano's own picture; the pedals and the tuning gauges face the
// player, so only from this side are they seen; and the strike point (on the player's side of each head, a
// quarter of the diameter in from the rim) is nearest the eye, where the mallet meets the head in full view.
// The projection is orthographic at ELEV below the horizontal: across the stage one px per metre stays one px
// per metre (the Orchestra draws the strings at one scale), and a head is an ellipse sin(ELEV) as tall as wide.
//
// The sizes (m):
//   heads 32″ 29″ 26″ 23″ (the engine's TIMPANI_DRUMS: 0.813, 0.737, 0.66, 0.584; Fletcher & Rossing 1998
//   §18.2; Ludwig LTP504PG and Adams Philharmonic sets of four, 23–32″);
//   the height to the head 0.80 m (23″) … 0.91 m (32″): Premier's Elite/Concert pedal timpani stand 85 cm
//   (23″) … 96 cm (32″) to the top of their fittings, Yamaha's TP-3300 heads adjust 79–82 cm, Adams'
//   Revolution 84–94 cm;
//   the overall width about d + 0.16 m across the tension rods' lugs and handles (Premier: 75 cm for the 23″,
//   90 cm for the 29″, 96 cm for the 32″);
//   the kettle holds a hemisphere of the head's radius (the engine's `kettle: 1`), drawn as the deep rounded
//   bowl of a Ludwig Professional (Commons "Ludwig Professional timpani 01", public domain): walls upright at
//   the collar, curving in to a round bottom, r(z) = a·√(1 − (z/D)^1.6), so D = (2/3)(2.6/1.6)·a ≈ 1.08 a;
//   six tension rods with T-handles on the 23″, eight on the larger drums; three struts from the base's legs
//   to the collar; a balanced-action pedal to the player's side of the base, its footboard 0.29 m;
//   a felt mallet: a 0.34 m shaft, 11 mm across, the felt ball 44 mm (Adams, Freer, Ludwig general mallets),
//   held in the German grip, the two shafts turned 40° out from straight back to the player.
import { TIMPANI_DRUMS } from '@piano-model/engine';

export type P2 = [number, number];
/** the view's elevation below the horizontal (rad): the photographs from the stool, about a third of a right
 *  angle */
export const ELEV = (33 * Math.PI) / 180;
export const SIN_E = Math.sin(ELEV);
export const COS_E = Math.cos(ELEV);
/** a point (x across, y away from the player, z up; m) on the picture plane: across, and up the picture */
export const proj = (x: number, y: number, z: number): P2 => [x, z * COS_E + y * SIN_E];

/** the counterhoop beyond the head's edge, its depth down the collar; the bowl's collar below the head */
export const HOOP_W = 0.024;
export const HOOP_H = 0.034;
export const COLLAR = 0.022;
/** the rods' line out from the head's edge, the T-handles' height over the hoop and their bar's half-width */
export const ROD_OUT = 0.048;
export const T_UP = 0.03;
export const T_HALF = 0.026;
/** the bowl's profile exponent (r = a·√(1 − (z/D)^n)) and so its depth for a hemisphere's volume */
export const BOWL_N = 1.6;
export const bowlDepth = (a: number) => ((2 / 3) * (BOWL_N + 1) * a) / BOWL_N;
export const bowlR = (a: number, t: number) => a * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, Math.min(1, t)), BOWL_N)));
/** the base: its hub's height, the legs' feet (fraction of the head's radius out, height of the caster's top),
 *  the struts' azimuths from the player's side (one at the back, hidden) */
export const HUB_Z = 0.15;
export const FOOT_R = 0.66;
export const FOOT_Z = 0.07;
export const STRUT_AZ = [Math.PI / 3, -Math.PI / 3, Math.PI];
/** the struts' width (flat bars) */
export const STRUT_W = 0.03;
/** the pedal: its hinge (fraction of the radius out towards the player, height), the footboard's length and
 *  half-width, and its tilt either way of level (rad; heel down at 0, toe down at 1) */
export const PEDAL_AT = 0.3;
export const PEDAL_Z = 0.075;
export const PEDAL_LEN = 0.29;
export const PEDAL_HALF = 0.05;
export const PEDAL_TILT = (13 * Math.PI) / 180;
/** the mallet: shaft, ball radius, shaft radius; the shaft's fall to the head at contact (rad) and its turn
 *  outwards from straight back to the player (rad); the hands' strike points either side of the line */
export const MALLET_L = 0.34;
export const BALL_R = 0.022;
export const SHAFT_R = 0.0055;
export const SHAFT_FALL = (18 * Math.PI) / 180;
export const SHAFT_TURN = (40 * Math.PI) / 180;
export const HAND_SPLIT = 0.035;
/** the gauge: its plate along the hoop (half its arc, m), its height over the hoop (bottom, top), how far it
 *  stands out from the head's edge, and its azimuth from the player's side (towards the set's outside, clear
 *  of the other hand's mallet) */
export const GAUGE_HALF = 0.08;
export const GAUGE_Z0 = 0.022;
export const GAUGE_Z1 = 0.062;
export const GAUGE_OUT = 0.036;
export const GAUGE_AZ = (24 * Math.PI) / 180;

export interface DrumPlan {
  /** the head's radius, the height to it */
  a: number;
  zh: number;
  /** its centre on the floor (m) */
  cx: number;
  cy: number;
  /** towards the player from the centre (unit), and the player's left as they face it */
  dx: number;
  dy: number;
  lx: number;
  ly: number;
  /** the bowl's depth, its collar's height */
  D: number;
  zr: number;
  /** tension rods' azimuths (rad, from the player's side, positive towards the player's left) */
  rods: number[];
  /** the gauge's azimuth */
  gaugeAz: number;
  inches: number;
}
/** a point at azimuth az (from the player's side, + towards the player's left) r m out from a drum's centre */
export const around = (d: DrumPlan, az: number, r: number): P2 => [d.cx + r * (Math.cos(az) * d.dx + Math.sin(az) * d.lx), d.cy + r * (Math.cos(az) * d.dy + Math.sin(az) * d.ly)];

/** the head edges' gap between neighbours (their handles interleave), and how far the near rim is from the
 *  player's middle */
const GAP = 0.1;
const REACH = 0.7;

/** The set in its arc: each drum's centre on a circle about the player (the near rim REACH from them), side by
 *  side, the 32″ on the player's left; the whole centred across. */
function buildSet(): DrumPlan[] {
  const n = TIMPANI_DRUMS.length;
  const R = TIMPANI_DRUMS.map((d) => d.d / 2 + REACH);
  const phi = new Array<number>(n).fill(0);
  // (the angles from straight ahead, solved one after another so neighbours keep GAP between their heads)
  for (let i = 1; i < n; i++) {
    const need = TIMPANI_DRUMS[i - 1].d / 2 + TIMPANI_DRUMS[i].d / 2 + GAP;
    let lo = phi[i - 1];
    let hi = phi[i - 1] + Math.PI;
    for (let k = 0; k < 60; k++) {
      const m = (lo + hi) / 2;
      const dd = Math.hypot(R[i] * Math.sin(m) - R[i - 1] * Math.sin(phi[i - 1]), R[i] * Math.cos(m) - R[i - 1] * Math.cos(phi[i - 1]));
      if (dd < need) lo = m;
      else hi = m;
    }
    phi[i] = (lo + hi) / 2;
  }
  // the arc turned so it is symmetric about straight ahead
  const mid = (phi[0] + phi[n - 1]) / 2;
  const out: DrumPlan[] = [];
  for (let i = 0; i < n; i++) {
    const t = TIMPANI_DRUMS[i];
    const f = phi[i] - mid;
    const a = t.d / 2;
    const cx = R[i] * Math.sin(f);
    const cy = R[i] * Math.cos(f);
    const dx = -Math.sin(f);
    const dy = -Math.cos(f);
    // (facing the drum, the player's left: the forward direction (−dx, −dy) turned a quarter left)
    const lx = dy;
    const ly = -dx;
    const zh = 0.8 + ((t.d - 0.584) / (0.813 - 0.584)) * 0.11;
    const N = t.inches <= 23 ? 6 : 8;
    // (the rods set so that none stands at the strike point: half a pitch off the player's side)
    const rods = Array.from({ length: N }, (_, k) => ((k + 0.5) * 2 * Math.PI) / N);
    out.push({ a, zh, cx, cy, dx, dy, lx, ly, D: bowlDepth(a), zr: zh - COLLAR, rods, gaugeAz: i < n / 2 ? GAUGE_AZ : -GAUGE_AZ, inches: t.inches });
  }
  const x0 = Math.min(...out.map((d) => d.cx - d.a));
  const x1 = Math.max(...out.map((d) => d.cx + d.a));
  for (const d of out) d.cx -= (x0 + x1) / 2;
  return out;
}
export const SET: DrumPlan[] = buildSet();
/** the drums far to near (the order they are painted in) */
export const PAINT_ORDER: number[] = SET.map((_, i) => i).sort((i, j) => SET[j].cy - SET[i].cy);

/** where a hand's mallet meets drum i: spot (fraction of the radius) out towards the player, the hand's own
 *  side of the line */
export function strikePoint(i: number, spot: number, hand: number): [number, number, number] {
  const d = SET[i];
  const s = hand === 0 ? 1 : -1;
  return [d.cx + d.dx * spot * d.a + d.lx * HAND_SPLIT * s, d.cy + d.dy * spot * d.a + d.ly * HAND_SPLIT * s, d.zh];
}

/** A mallet's pose: the ball's centre and the hand's grip (m), the ball `lift` m over its strike point on drum
 *  i. The shaft pivots about the wrist (two thirds of the lift) and the forearm rises (a third). */
export function malletPose(i: number, spot: number, hand: number, lift: number): { ball: [number, number, number]; grip: [number, number, number] } {
  const d = SET[i];
  const [tx, ty, tz] = strikePoint(i, spot, hand);
  // the shaft runs back towards the player, turned outwards (the left hand's to the player's left)
  const s = hand === 0 ? 1 : -1;
  const c = Math.cos(SHAFT_TURN);
  const sn = Math.sin(SHAFT_TURN) * s;
  const ux = d.dx * c + d.lx * sn;
  const uy = d.dy * c + d.ly * sn;
  const zb = tz + BALL_R;
  // the grip at contact; raised, the forearm lifts a third of the way and the wrist turns the rest
  const arm = lift / 3;
  const gx = tx + ux * MALLET_L * Math.cos(SHAFT_FALL);
  const gy = ty + uy * MALLET_L * Math.cos(SHAFT_FALL);
  const gz = zb + MALLET_L * Math.sin(SHAFT_FALL) + arm;
  const sinT = Math.max(-0.95, Math.min(0.95, Math.sin(SHAFT_FALL) - (lift - arm) / MALLET_L));
  const cosT = Math.sqrt(1 - sinT * sinT);
  return { ball: [gx - ux * MALLET_L * cosT, gy - uy * MALLET_L * cosT, gz - MALLET_L * sinT], grip: [gx, gy, gz] };
}

/** the lift (m) a mallet rests at between strokes, and the highest a stroke rebounds to at full force */
export const REST_LIFT = 0.07;
export const PEAK_LIFT = 0.18;
/** The mallet's height over the head `ago` s after its stroke (vel the MIDI velocity): on the head at the
 *  stroke, rebounding up (the louder the higher) in about 0.1 s, settling back to rest above the head. A roll
 *  strikes again before it is high (its strokes 60–125 ms apart): it stays close to the head. */
export function malletLift(ago: number, vel: number): number {
  if (!(ago >= 0) || ago > 30) return REST_LIFT;
  const v = Math.max(0, Math.min(1, vel / 127));
  const peak = 0.05 + (PEAK_LIFT - 0.05) * v * v;
  const T = 0.11;
  const rise = (ago / T) * Math.exp(1 - ago / T);
  const settle = 1 - Math.exp(-ago / 0.06);
  return REST_LIFT * settle + (peak - REST_LIFT * 0.83) * rise;
}

/** The plan's extent on the picture plane (m): across, and up the picture, with the mallets at their highest
 *  over any drum and the handles and gauges on every rim */
function extent(): { x0: number; x1: number; v0: number; v1: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let v0 = Infinity;
  let v1 = -Infinity;
  const add = ([x, v]: P2) => {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
  };
  SET.forEach((d, i) => {
    for (let k = 0; k < 64; k++) {
      const az = (k / 64) * 2 * Math.PI;
      const [x, y] = around(d, az, d.a + ROD_OUT + T_HALF * 0.5);
      add(proj(x, y, d.zh + T_UP));
      const [fx, fy] = around(d, az, d.a * FOOT_R + 0.03);
      add(proj(fx, fy, 0));
    }
    // the pedal's heel, on the floor towards the player
    const [px, py] = around(d, 0, d.a * PEDAL_AT + PEDAL_LEN + 0.02);
    add(proj(px, py, 0));
    for (const h of [0, 1])
      for (const lift of [0, PEAK_LIFT]) {
        const p = malletPose(i, 0.9, h, lift);
        add(proj(p.ball[0], p.ball[1], p.ball[2] + BALL_R));
        add(proj(p.grip[0], p.grip[1], p.grip[2]));
        const q = malletPose(i, 0.2, h, lift);
        add(proj(q.ball[0], q.ball[1], q.ball[2] + BALL_R));
      }
  });
  return { x0: x0 - 0.02, x1: x1 + 0.02, v0: v0 - 0.02, v1: v1 + 0.02 };
}
export const EXT = extent();
