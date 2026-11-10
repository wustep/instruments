// The timpani on the 2D stage (the classic look): the set of four pedal drums of timpani-plan.ts at their
// real sizes, seen from behind the player a little above (the low drum on the left, as the keys run), lit
// like the other instruments on the dark stage: polished copper kettles, chrome counterhoops, rods and
// T-handles, dark struts and cast bases, the pedals, a tuning gauge on each drum, two felt mallets.
//
// What moves. Each drum's pedal rocks with the engine's tuning (heel down at the bottom of its range, toe
// down at the top, gliding as the engine's pedal travels) and its gauge's pointer runs along its scale with
// it. The mallets: each over the drum it last struck, falling onto the head at a stroke (its felt on the head
// while the engine says so), rebounding (the louder, the higher) and settling to rest above it; a roll
// alternates the hands close to the head; a stroke leaves a short streak where the mallet came from, and the
// ball's shadow on the head shows how high it is. The heads: each head's displacement from the engine's own
// modes (w = Σ y·J_m(j r/a)·cos m(θ − θ₀), θ₀ the strike point, towards the player), drawn slowed (the true
// motion is 60–500 Hz): each mode's amplitude followed through the frames, all set going by the stroke, the
// head pushed down under the felt (cool) and swinging up (warm) about its nodal lines, the thump of the (0,1)
// dying first and the (1,1) dipole ringing on. The sound leaves from the struck head.
import type { VisualFrame, TimpaniVisual } from '@piano-model/engine';
import { TIMPANI_DRUMS, besselJ } from '@piano-model/engine';
import { AutoScale, INK, rgba } from './stage-draw.ts';
import {
  BALL_R, COS_E, EXT, FOOT_R, FOOT_Z, GAUGE_HALF, GAUGE_OUT, GAUGE_Z0, GAUGE_Z1, HOOP_H, HOOP_W, HUB_Z, PAINT_ORDER, PEDAL_AT, PEDAL_HALF,
  PEDAL_LEN, PEDAL_TILT, PEDAL_Z, REST_LIFT, ROD_OUT, SET, SHAFT_R, SIN_E, STRUT_AZ, STRUT_W, T_HALF, T_UP, around, bowlR, malletLift, malletPose, type DrumPlan,
} from './timpani-plan.ts';

type Box = { x0: number; y0: number; x1: number; y1: number };
export interface TimpaniDrawn {
  /** the whole set (box px) */
  body: Box;
  /** each drum's head as drawn (centre and radii, box px), low to high; and how strongly its field shows (0..1) */
  heads: { x: number; y: number; rx: number; ry: number; field: number }[];
  /** the two mallets (left hand, right hand): the ball's centre (box px), the drum it is over, its height over
   *  the head (m) and whether its felt is on the head */
  mallets: { x: number; y: number; drum: number; lift: number; on: boolean }[];
  /** each drum's gauge: its plate (box px), the pointer's place (0 the bottom of the range … 1 the top) and
   *  where it points (box px) */
  gauges: { box: Box; at: number; x: number; y: number }[];
  /** each drum's pedal: its travel (0 heel down … 1 toe down) and its footboard's toe (box px) */
  pedals: { at: number; x: number; y: number }[];
}
export interface TimpaniState {
  /** where its sound leaves (the struck head: the room's wavefronts start there), px in the box */
  src?: { x: number; y: number };
  /** the heads' fields' reference (m): the loudest of the last few seconds, so a dying drum fades */
  scale: AutoScale;
  /** each head's modes as followed through the frames */
  heads?: HeadField[];
  /** each hand's last stroke seen (its `ago`, the drum), the ball where it was drawn and where a new stroke
   *  came from (box px), and when that stroke was (ms) */
  hands?: { ago: number; drum: number; x: number; y: number; fx: number; fy: number; t: number }[];
  /** test hook and the review's close-ups: where it was last drawn */
  drawn?: TimpaniDrawn;
}
export const newTimpaniState = (): TimpaniState => ({ scale: new AutoScale(2e-6, 0.998) });

// ---------------------------------------------------------------- the box and the layout
const PW = EXT.x1 - EXT.x0;
const PH = EXT.v1 - EXT.v0;
/** the box (m) the set is drawn in at one px per metre (an Orchestra cell sizes it from the strings' scale) */
export const timpaniBox = (): { w: number; h: number } => ({ w: PW / 0.92, h: PH / 0.86 });

/** a drum's fixed parts in px */
export interface DrumPx {
  /** the head's ellipse (centre, radii) and the hoop's outer one */
  hx: number;
  hy: number;
  rx: number;
  ry: number;
  orx: number;
  ory: number;
  bowl: Path2D;
  /** the bowl's lowest point (px), the light's bands down its front, its sections (front halves) */
  low: number;
  spec: Path2D;
  glint: Path2D;
  sections: Path2D;
  /** the hoop: its top (a ring) and its front face */
  hoopTop: Path2D;
  hoopFace: Path2D;
  /** struts, legs and the hub: the back strut (behind the bowl) and the front ones */
  backStrut: Path2D;
  frontStruts: Path2D;
  strutEdges: Path2D;
  legs: Path2D;
  casters: [number, number][];
  hub: { x: number; y: number; rx: number; ry: number };
  /** the pull rod from the hub up to the bowl's bottom */
  pull: [number, number, number, number];
  /** the tension rods on the near side, and every T-handle (stem and bar) */
  rods: Path2D;
  handles: Path2D;
  knobs: [number, number][];
  /** the gauge's plate, its ticks (one per semitone of the pedal's range), and where each tick is */
  plate: Path2D;
  plateBox: Box;
  ticks: Path2D;
  tickAt: [number, number, number, number][];
  /** the floor's shadow */
  shadow: { x: number; y: number; rx: number; ry: number };
}
export interface TpLayout {
  key: string;
  W: number;
  H: number;
  top: number;
  sc: number;
  ox: number;
  oy: number;
  X: (x: number) => number;
  Y: (x: number, y: number, z: number) => number;
  drums: DrumPx[];
}
const layouts = new Map<string, TpLayout>();

/** The layout for a W×H box (the file player's `top` px kept clear at its top): the set as large as fits in
 *  92 % of the width (a phone's narrow stage: 96 %) and 86 % of the height under the player, centred. A cell
 *  sized by timpaniBox at the group's px/m draws it at that scale. */
export function timpaniLayout(W: number, H: number, top = 0): TpLayout {
  const key = `${W}x${H}x${top}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const sc = Math.max(1, Math.min((W * (W < 600 && top > 0 ? 0.96 : 0.92)) / PW, ((H - top) * 0.86) / PH));
  const ox = W / 2 - ((EXT.x0 + EXT.x1) / 2) * sc;
  const oy = top + (H - top) / 2 + ((EXT.v0 + EXT.v1) / 2) * sc;
  const X = (x: number) => ox + x * sc;
  const Y = (_x: number, y: number, z: number) => oy - (z * COS_E + y * SIN_E) * sc;
  const drums = SET.map((d, i) => drumPx(d, i, X, Y, sc));
  const L: TpLayout = { key, W, H, top, sc, ox, oy, X, Y, drums };
  if (layouts.size > 8) layouts.clear();
  layouts.set(key, L);
  return L;
}

function drumPx(d: DrumPlan, i: number, X: (x: number) => number, Y: (x: number, y: number, z: number) => number, sc: number): DrumPx {
  const P = (az: number, r: number, z: number): [number, number] => {
    const [x, y] = around(d, az, r);
    return [X(x), Y(x, y, z)];
  };
  const hx = X(d.cx);
  const hy = Y(d.cx, d.cy, d.zh);
  const rx = d.a * sc;
  const ry = d.a * SIN_E * sc;
  const ro = d.a + HOOP_W;
  // ---- the bowl: its silhouette (the lower envelope of its sections), closed over the top by the collar
  const lev = 48;
  const bowl = new Path2D();
  let low = -Infinity;
  {
    const n = 56;
    const pts: [number, number][] = [];
    for (let k = 0; k <= n; k++) {
      const xx = (-1 + (2 * k) / n) * d.a;
      let best = -Infinity;
      for (let l = 0; l <= lev; l++) {
        const t = l / lev;
        const r = bowlR(d.a, t);
        if (Math.abs(xx) > r) continue;
        // (the section's point nearest the viewer in this column)
        best = Math.max(best, Y(0, d.cy - Math.sqrt(r * r - xx * xx), d.zr - t * d.D));
      }
      if (best === -Infinity) best = Y(0, d.cy, d.zr);
      pts.push([X(d.cx + xx), best]);
      low = Math.max(low, best);
    }
    pts.forEach(([x, y], k) => (k ? bowl.lineTo(x, y) : bowl.moveTo(x, y)));
    for (let k = 0; k <= 24; k++) {
      const a = (k / 24) * Math.PI;
      bowl.lineTo(X(d.cx + d.a * Math.cos(a)), Y(0, d.cy + d.a * Math.sin(a), d.zr));
    }
    bowl.closePath();
  }
  /** a band down the bowl's face between two azimuths (from the viewer's straight-on line, + to the left) */
  const band = (az0: number, az1: number, t0: number, t1: number) => {
    const p = new Path2D();
    const A: [number, number][] = [];
    const B: [number, number][] = [];
    for (let l = 0; l <= 20; l++) {
      const t = t0 + ((t1 - t0) * l) / 20;
      const r = bowlR(d.a, t);
      const z = d.zr - t * d.D;
      for (const [az, arr] of [[az0, A], [az1, B]] as const) {
        const x = d.cx - r * Math.sin(az);
        const y = d.cy - r * Math.cos(az);
        arr.push([X(x), Y(x, y, z)]);
      }
    }
    [...A, ...B.reverse()].forEach(([x, y], k) => (k ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  };
  // the light from the upper left: a broad lit band left of centre, a narrow glint in it
  const spec = band(0.62, 0.2, 0.02, 0.86);
  const glint = band(0.47, 0.4, 0.03, 0.8);
  const sections = new Path2D();
  for (const t of [0.3, 0.58, 0.82]) {
    const r = bowlR(d.a, t);
    const z = d.zr - t * d.D;
    for (let k = 0; k <= 32; k++) {
      const a = Math.PI + (k / 32) * Math.PI;
      const x = d.cx + r * Math.cos(a);
      const y = d.cy + r * Math.sin(a);
      if (k) sections.lineTo(X(x), Y(x, y, z));
      else sections.moveTo(X(x), Y(x, y, z));
    }
  }
  // ---- the hoop: its top ring (head's edge to its outer edge) and the face down its near side
  const hoopTop = new Path2D();
  hoopTop.ellipse(hx, hy, ro * sc, ro * SIN_E * sc, 0, 0, 2 * Math.PI);
  hoopTop.ellipse(hx, hy, rx, ry, 0, 0, 2 * Math.PI);
  const hoopFace = new Path2D();
  hoopFace.ellipse(hx, hy, ro * sc, ro * SIN_E * sc, 0, 0, Math.PI);
  hoopFace.ellipse(hx, hy + HOOP_H * COS_E * sc, ro * sc, ro * SIN_E * sc, 0, Math.PI, 0, true);
  hoopFace.closePath();
  // ---- the struts: flat bars from each leg's foot up to the bowl's round bottom, then up its wall to the collar
  // (a little way out from it), as on the Ludwig Professional; each a band STRUT_W wide, its lit edge
  const strut = (az: number, band: Path2D, edge: Path2D) => {
    const pts: [number, number][] = [];
    const tB = 0.8;
    const n = 18;
    for (let l = 0; l <= n; l++) {
      let r: number;
      let z: number;
      if (l <= 4) {
        // from the foot to where it meets the bowl
        const u = l / 4;
        const r1 = bowlR(d.a, tB) + 0.01;
        const z1 = d.zr - tB * d.D;
        r = d.a * FOOT_R + (r1 - d.a * FOOT_R) * u;
        z = FOOT_Z + (z1 - FOOT_Z) * u;
      } else {
        const t = tB * (1 - (l - 4) / (n - 4)) + 0.03 * ((l - 4) / (n - 4));
        r = bowlR(d.a, t) + 0.01;
        z = d.zr - t * d.D;
      }
      pts.push(P(az, r, z));
    }
    const hw = (STRUT_W / 2) * sc;
    const A: [number, number][] = [];
    const B: [number, number][] = [];
    pts.forEach((p, k) => {
      const a = pts[Math.max(0, k - 1)];
      const b = pts[Math.min(pts.length - 1, k + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = (-(b[1] - a[1]) / l) * hw;
      const ny = ((b[0] - a[0]) / l) * hw;
      A.push([p[0] + nx, p[1] + ny]);
      B.push([p[0] - nx, p[1] - ny]);
    });
    [...A, ...[...B].reverse()].forEach(([x, y], k) => (k ? band.lineTo(x, y) : band.moveTo(x, y)));
    band.closePath();
    // (the edge towards the light, at the upper left)
    const lit = A[A.length >> 1][0] < B[B.length >> 1][0] ? A : B;
    lit.forEach(([x, y], k) => (k ? edge.lineTo(x, y) : edge.moveTo(x, y)));
  };
  const backStrut = new Path2D();
  const frontStruts = new Path2D();
  const strutEdges = new Path2D();
  const legs = new Path2D();
  const casters: [number, number][] = [];
  for (const az of STRUT_AZ) {
    if (Math.abs(az) > Math.PI / 2) strut(az, backStrut, new Path2D());
    else strut(az, frontStruts, strutEdges);
    const [fx, fy] = P(az, d.a * FOOT_R, FOOT_Z);
    const [hx2, hy2] = P(az, 0.07, HUB_Z);
    legs.moveTo(hx2, hy2);
    legs.lineTo(fx, fy);
    casters.push(P(az, d.a * FOOT_R, 0.03));
  }
  const [hubx, huby] = P(0, 0, HUB_Z);
  const [, pullTop] = P(0, 0, d.zr - d.D + 0.01);
  // ---- the rods (the near half: the far ones are behind the bowl) and every T-handle
  const rods = new Path2D();
  const handles = new Path2D();
  const knobs: [number, number][] = [];
  for (const az of d.rods) {
    const rr = d.a + ROD_OUT;
    if (Math.cos(az) > -0.25) {
      const [x0, y0] = P(az, rr, d.zh + 0.006);
      const [x1, y1] = P(az, rr, d.zh - 0.17);
      rods.moveTo(x0, y0);
      rods.lineTo(x1, y1);
    }
    const [sx, sy] = P(az, rr, d.zh + 0.006);
    const [tx, ty] = P(az, rr, d.zh + T_UP);
    handles.moveTo(sx, sy);
    handles.lineTo(tx, ty);
    // the bar across, along the hoop's tangent
    const da = T_HALF / rr;
    const [ax, ay] = P(az - da, rr, d.zh + T_UP);
    const [bx, by] = P(az + da, rr, d.zh + T_UP);
    handles.moveTo(ax, ay);
    handles.lineTo(bx, by);
    knobs.push([ax, ay], [bx, by]);
  }
  // ---- the gauge: a curved plate standing over the hoop on the player's side, its ticks a semitone apart
  const spec0 = TIMPANI_DRUMS[i];
  const rg = d.a + GAUGE_OUT;
  const half = GAUGE_HALF / rg;
  const plate = new Path2D();
  const pb: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  {
    const A: [number, number][] = [];
    const B: [number, number][] = [];
    for (let k = 0; k <= 12; k++) {
      const az = d.gaugeAz + half - (2 * half * k) / 12;
      A.push(P(az, rg, d.zh + GAUGE_Z1));
      B.push(P(az, rg, d.zh + GAUGE_Z0));
    }
    [...A, ...B.reverse()].forEach(([x, y], k) => {
      if (k) plate.lineTo(x, y);
      else plate.moveTo(x, y);
      pb.x0 = Math.min(pb.x0, x);
      pb.x1 = Math.max(pb.x1, x);
      pb.y0 = Math.min(pb.y0, y);
      pb.y1 = Math.max(pb.y1, y);
    });
    plate.closePath();
  }
  const ticks = new Path2D();
  const tickAt: [number, number, number, number][] = [];
  const nT = spec0.hi - spec0.lo;
  for (let k = 0; k <= nT; k++) {
    // (low at the player's left)
    const az = d.gaugeAz + half * 0.86 - (2 * half * 0.86 * k) / nT;
    const big = (spec0.lo + k) % 12 === 0 || k === 0 || k === nT;
    const [x0, y0] = P(az, rg, d.zh + GAUGE_Z1 - 0.004);
    const [x1, y1] = P(az, rg, d.zh + GAUGE_Z1 - (big ? 0.02 : 0.012));
    ticks.moveTo(x0, y0);
    ticks.lineTo(x1, y1);
    tickAt.push([x0, y0, x1, y1]);
  }
  const [shx, shy] = P(0, 0, 0);
  return {
    hx, hy, rx, ry, orx: ro * sc, ory: ro * SIN_E * sc, bowl, low, spec, glint, sections, hoopTop, hoopFace, backStrut, frontStruts, strutEdges, legs, casters,
    hub: { x: hubx, y: huby, rx: 0.085 * sc, ry: 0.085 * SIN_E * sc }, pull: [hubx, huby, hubx, pullTop], rods, handles, knobs, plate, plateBox: pb, ticks, tickAt,
    shadow: { x: shx, y: shy, rx: d.a * 0.95 * sc, ry: d.a * 0.95 * SIN_E * sc },
  };
}

// ---------------------------------------------------------------- the heads' fields
/** the field's grid across a head (cells per diameter) */
export const FG = 72;
/** the modes the engine sends per head */
const NM = 14;
export interface HeadField {
  m: Int8Array;
  j: Float32Array;
  /** each mode's amplitude (m), followed through the frames: the largest sampled lately, released slowly */
  amp: Float32Array;
  /** its sign at the strike point (the felt pushes the head down there) */
  sg: Float32Array;
  last: Float32Array | null;
  t: number;
  /** the stroke's time (ms, performance.now's clock) */
  t0: number;
  /** the displacement now on the grid (m), its strongest |w|, the field's envelope (Σ amplitudes, m) */
  w: Float32Array;
  peak: number;
  env: number;
  /** its picture (a FG×FG canvas), made when first drawn */
  cv?: HTMLCanvasElement | null;
  img?: ImageData | null;
}
const newHead = (): HeadField => ({ m: new Int8Array(NM), j: new Float32Array(NM), amp: new Float32Array(NM), sg: new Float32Array(NM), last: null, t: 0, t0: -1e9, w: new Float32Array(FG * FG), peak: 0, env: 0 });

/** J_m on a table (x = 0 … 40, 1/64 apart), made once per order */
const JX = 64;
const JMAX = 40;
const jTables: Float32Array[] = [];
function jTable(m: number): Float32Array {
  let t = jTables[m];
  if (t) return t;
  t = new Float32Array(JMAX * JX + 2);
  for (let i = 0; i < t.length; i++) t[i] = besselJ(m, i / JX);
  jTables[m] = t;
  return t;
}
/** each drum's grid: r (0..1; −1 outside the head) and θ from the player's side (+ to their left), made once;
 *  cos mθ per order as needed. Columns run across the picture (+x), rows up it (away from the viewer, +y). */
const grids: { r: Float32Array; th: Float32Array; cos: Float32Array[] }[] = [];
export function gridOf(i: number): { r: Float32Array; th: Float32Array; cos: Float32Array[] } {
  let g = grids[i];
  if (g) return g;
  const d = SET[i];
  const r = new Float32Array(FG * FG);
  const th = new Float32Array(FG * FG);
  for (let q = 0; q < FG; q++)
    for (let p = 0; p < FG; p++) {
      const u = ((p + 0.5) / FG) * 2 - 1;
      const v = 1 - ((q + 0.5) / FG) * 2;
      const rr = Math.hypot(u, v);
      const k = q * FG + p;
      r[k] = rr <= 1 ? rr : -1;
      th[k] = Math.atan2(u * d.lx + v * d.ly, u * d.dx + v * d.dy);
    }
  g = { r, th, cos: [] };
  grids[i] = g;
  return g;
}
function cosOf(i: number, m: number): Float32Array {
  const g = gridOf(i);
  let c = g.cos[m];
  if (c) return c;
  c = new Float32Array(FG * FG);
  for (let k = 0; k < c.length; k++) c[k] = Math.cos(m * g.th[k]);
  g.cos[m] = c;
  return c;
}
/** the slowed swing of a mode (rad/s): the (1,1) about once a second, the others faster by their zeros */
const slowOmega = (j: number) => 2 * Math.PI * 0.9 * Math.pow(j / 3.8317, 0.8);

/** fold the frame's head into the drum's field and compute the field on its grid now (both styles) */
export function headUpdate(h: HeadField, i: number, dv: TimpaniVisual['drums'][number] | undefined, spot: number, now: number): void {
  const head = dv?.head ?? null;
  const dt = Math.max(0, Math.min(0.5, (now - (h.t || now)) / 1000));
  if (head && head !== h.last) {
    h.last = head;
    h.t = now;
    const rel = Math.exp(-dt / 0.35);
    for (let k = 0; k < NM; k++) {
      const b = 3 * k;
      const y = b + 2 < head.length ? head[b + 2] : 0;
      const m = b < head.length ? head[b] : 0;
      const j = b + 1 < head.length ? head[b + 1] : 0;
      if (m !== h.m[k] || Math.abs(j - h.j[k]) > 1e-3) {
        h.m[k] = m;
        h.j[k] = j;
        h.amp[k] = 0;
        h.sg[k] = j > 0 ? (besselJ(m, j * spot) >= 0 ? 1 : -1) : 0;
      }
      h.amp[k] = Math.max(Math.abs(y), h.amp[k] * rel);
    }
    // the stroke's time, from the frame's `ago` (kept unless it moves: the frames come about 30 a second)
    const t0 = now - (dv?.ago ?? 1e3) * 1000;
    if (Math.abs(t0 - h.t0) > 40) h.t0 = t0;
  } else if (!head) {
    h.t = now;
    const rel = Math.exp(-dt / 0.2);
    for (let k = 0; k < NM; k++) h.amp[k] *= rel;
  }
  let env = 0;
  for (let k = 0; k < NM; k++) env += h.amp[k];
  h.env = env;
  h.peak = 0;
  const w = h.w;
  if (env <= 1e-12) {
    if (w[0] !== 0 || w[w.length >> 1] !== 0) w.fill(0);
    return;
  }
  // w = −Σ A·s·sin(Ωτ + ε)·J_m(j r)·cos mθ: every mode set going by the stroke, the head pushed down where struck
  const tau = Math.max(0, (now - h.t0) / 1000);
  const g = gridOf(i);
  w.fill(0);
  for (let k = 0; k < NM; k++) {
    const A = h.amp[k];
    if (A < env * 0.01 || !(h.j[k] > 0)) continue;
    const c = -A * h.sg[k] * Math.sin(slowOmega(h.j[k]) * tau + 0.35);
    const J = jTable(h.m[k]);
    const C = cosOf(i, h.m[k]);
    const jj = h.j[k] * JX;
    for (let q = 0; q < w.length; q++) {
      const r = g.r[q];
      if (r < 0) continue;
      const x = jj * r;
      const xi = x | 0;
      w[q] += c * (J[xi] + (J[xi + 1] - J[xi]) * (x - xi)) * C[q];
    }
  }
  let pk = 0;
  for (let q = 0; q < w.length; q++) pk = Math.max(pk, Math.abs(w[q]));
  h.peak = pk;
}

// ---------------------------------------------------------------- the live state (both styles)
export interface TpLive {
  tv: TimpaniVisual | null;
  /** each drum's pedal (0 heel down … 1 toe down) */
  pedal: number[];
  /** each drum's field's strength (0..1 of the reference), and the reference (m) */
  lvl: number[];
  ref: number;
  /** the mallets: the drum each is over, its lift (m), felt on the head, the ball's and the grip's points (m) */
  mallets: { drum: number; lift: number; on: boolean; ago: number; vel: number; ball: [number, number, number]; grip: [number, number, number] }[];
  spot: number;
  last: number;
}
const restPedal = TIMPANI_DRUMS.map((d) => (d.rest - d.lo) / (d.hi - d.lo));

/** the frame into the drawing's live state (the same for both styles: a change of style carries it) */
export function timpaniLive(fr: VisualFrame | null, st: TimpaniState, now: number): TpLive {
  const tv = fr?.timpani ?? null;
  const spot = tv?.spot ?? 0.7;
  const heads = (st.heads ??= SET.map(newHead));
  let top = 0;
  heads.forEach((h, i) => {
    headUpdate(h, i, tv?.drums[i], spot, now);
    top = Math.max(top, h.env);
  });
  const ref = st.scale.of(top);
  const lvl = heads.map((h) => Math.min(1, h.env / ref));
  const pedal = SET.map((_, i) => tv?.drums[i]?.pedal ?? restPedal[i]);
  const hs = (st.hands ??= [0, 1].map((k) => ({ ago: 1e9, drum: k + 1, x: NaN, y: NaN, fx: NaN, fy: NaN, t: -1e9 })));
  const mallets = [0, 1].map((k) => {
    const hd = tv?.hands[k];
    const drum = hd && hd.drum >= 0 && hd.drum < SET.length ? hd.drum : hs[k].drum;
    const ago = hd ? hd.ago : 1e9;
    const on = !!hd?.on;
    const lift = on ? 0 : hd ? malletLift(ago, hd.vel) : REST_LIFT;
    const p = malletPose(drum, spot, k, lift);
    return { drum, lift, on, ago, vel: hd?.vel ?? 0, ball: p.ball, grip: p.grip };
  });
  return { tv, pedal, lvl, ref, mallets, spot, last: tv?.last ?? 1 };
}

/** a mallet's stroke seen for the first time: where it came from (for its streak) */
export function trackHands(L: TpLayout, st: TimpaniState, lv: TpLive, now: number): void {
  const hs = st.hands!;
  lv.mallets.forEach((m, k) => {
    const h = hs[k];
    const x = L.X(m.ball[0]);
    const y = L.Y(m.ball[0], m.ball[1], m.ball[2]);
    if (m.ago < h.ago - 1e-3 || m.drum !== h.drum) {
      // a new stroke: the streak from where the ball was (or, the first, from its rest above the head)
      if (Number.isFinite(h.x)) {
        h.fx = h.x;
        h.fy = h.y;
      } else {
        const p = malletPose(m.drum, lv.spot, k, REST_LIFT);
        h.fx = L.X(p.ball[0]);
        h.fy = L.Y(p.ball[0], p.ball[1], p.ball[2]);
      }
      h.t = now - Math.min(m.ago, 1) * 1000;
    }
    h.ago = m.ago;
    h.drum = m.drum;
    h.x = x;
    h.y = y;
  });
}

/** record where it was drawn and where its sound leaves */
export function timpaniRecord(L: TpLayout, st: TimpaniState, lv: TpLive): void {
  const { X, Y, sc } = L;
  st.drawn = {
    body: { x0: X(EXT.x0), x1: X(EXT.x1), y0: L.oy - EXT.v1 * sc, y1: L.oy - EXT.v0 * sc },
    heads: L.drums.map((d, i) => ({ x: d.hx, y: d.hy, rx: d.rx, ry: d.ry, field: lv.lvl[i] })),
    mallets: lv.mallets.map((m) => ({ x: X(m.ball[0]), y: Y(m.ball[0], m.ball[1], m.ball[2]), drum: m.drum, lift: m.lift, on: m.on })),
    gauges: L.drums.map((d, i) => {
      const [x, y] = pointerAt(d, lv.pedal[i]);
      return { box: d.plateBox, at: lv.pedal[i], x, y };
    }),
    pedals: SET.map((d, i) => {
      const f = pedalPts(L, d, lv.pedal[i]);
      return { at: lv.pedal[i], x: f.toe[0], y: f.toe[1] };
    }),
  };
  const d = L.drums[lv.last] ?? L.drums[1];
  st.src = { x: d.hx, y: d.hy };
}
/** the gauge's pointer at travel p: its tip on the scale (px), and its foot under the plate */
export function pointerAt(d: DrumPx, p: number): [number, number, number, number] {
  const n = d.tickAt.length - 1;
  const f = Math.max(0, Math.min(1, p)) * n;
  const k = Math.min(n - 1, Math.floor(f));
  const u = f - k;
  const a = d.tickAt[k];
  const b = d.tickAt[k + 1];
  const tx = a[0] + (b[0] - a[0]) * u;
  const ty = a[1] + (b[1] - a[1]) * u;
  const bx = a[2] + (b[2] - a[2]) * u;
  const by = a[3] + (b[3] - a[3]) * u;
  // (the foot: down the plate, past its bottom edge)
  return [tx, ty, bx + (bx - tx) * 1.6, by + (by - ty) * 1.6];
}
/** the pedal's footboard at travel p: its corners (px), its toe (the drum's end), heel (the player's end), and
 *  the hinge its link comes down to */
export function pedalPts(L: TpLayout, d: DrumPlan, p: number): { quad: [number, number][]; toe: [number, number]; heel: [number, number]; hinge: [number, number] } {
  const tilt = (p - 0.5) * 2 * PEDAL_TILT;
  const r0 = d.a * PEDAL_AT;
  const pv = PEDAL_LEN * 0.45;
  const at = (s: number, side: number): [number, number] => {
    // s along the board from the toe (0) to the heel; the toe goes down as p rises
    const r = r0 + pv + (s - pv) * Math.cos(tilt);
    const z = PEDAL_Z + (s - pv) * Math.sin(tilt);
    const [x, y] = around(d, 0, r);
    const xx = x + d.lx * side;
    const yy = y + d.ly * side;
    return [L.X(xx), L.Y(xx, yy, z)];
  };
  const w0 = PEDAL_HALF * 0.8;
  const quad: [number, number][] = [at(0, w0), at(PEDAL_LEN, PEDAL_HALF), at(PEDAL_LEN, -PEDAL_HALF), at(0, -w0)];
  const [hx, hy] = around(d, 0, r0 - 0.02);
  return { quad, toe: at(0, 0), heel: at(PEDAL_LEN, 0), hinge: [L.X(hx), L.Y(hx, hy, PEDAL_Z + 0.02)] };
}

// ---------------------------------------------------------------- the classic drawing
const chrome = (a: number) => rgba('226,228,232', a);
const COPPER_STOPS: [number, string][] = [
  [0, '#2a140a'],
  [0.12, '#5e2f17'],
  [0.3, '#a8622f'],
  [0.42, '#c98448'],
  [0.56, '#9a5428'],
  [0.78, '#5a2c14'],
  [1, '#1e0e06'],
];

/** The set of four drums, far to near, then the mallets over them. `top`: the file player's px over the box's
 *  top. */
export function drawTimpani(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TimpaniState, top = 0): void {
  const L = timpaniLayout(W, H, top);
  const now = performance.now();
  const lv = timpaniLive(fr, st, now);
  trackHands(L, st, lv, now);
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const i of PAINT_ORDER) drawDrum(ctx, L, i, lv, st);
  drawMallets(ctx, L, lv, st, now);
  ctx.restore();
  timpaniRecord(L, st, lv);
}

function drawDrum(ctx: CanvasRenderingContext2D, L: TpLayout, i: number, lv: TpLive, st: TimpaniState): void {
  const d = L.drums[i];
  const pl = SET[i];
  const { sc } = L;
  // ---- the floor's shadow
  {
    const s = d.shadow;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(1, s.ry / s.rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s.rx);
    g.addColorStop(0, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, s.rx, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  }
  // ---- behind the bowl: the back strut
  ctx.fillStyle = '#17120e';
  ctx.fill(d.backStrut);
  // ---- the base: the legs, the pull rod up into the bowl, the hub, the casters
  ctx.strokeStyle = '#2e241d';
  ctx.lineWidth = Math.max(1.5, 0.03 * sc);
  ctx.stroke(d.legs);
  ctx.strokeStyle = rgba('150,124,100', 0.5);
  ctx.lineWidth = Math.max(0.6, 0.004 * sc);
  ctx.stroke(d.legs);
  ctx.strokeStyle = chrome(0.55);
  ctx.lineWidth = Math.max(1, 0.012 * sc);
  ctx.beginPath();
  ctx.moveTo(d.pull[0], d.pull[1]);
  ctx.lineTo(d.pull[2], d.pull[3]);
  ctx.stroke();
  ctx.fillStyle = '#26201b';
  ctx.beginPath();
  ctx.ellipse(d.hub.x, d.hub.y, d.hub.rx, d.hub.ry, 0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = rgba('150,132,112', 0.45);
  ctx.lineWidth = 1;
  ctx.stroke();
  for (const [x, y] of d.casters) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, 0.026 * sc), 0, 2 * Math.PI);
    ctx.fillStyle = '#141110';
    ctx.fill();
    ctx.strokeStyle = rgba('150,140,130', 0.4);
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // ---- the pedal: its link from the hub, the footboard rocking with the tuning
  drawPedal(ctx, L, pl, d, lv.pedal[i]);
  // ---- the kettle: polished copper, lit from the upper left, darkening down to its round bottom
  ctx.save();
  ctx.clip(d.bowl);
  const gx = ctx.createLinearGradient(d.hx - d.rx, 0, d.hx + d.rx, 0);
  for (const [o, c] of COPPER_STOPS) gx.addColorStop(o, c);
  ctx.fillStyle = gx;
  ctx.fill(d.bowl);
  const gy = ctx.createLinearGradient(0, d.hy, 0, d.low);
  gy.addColorStop(0, 'rgba(255,190,130,0.1)');
  gy.addColorStop(0.35, 'rgba(0,0,0,0)');
  gy.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = gy;
  ctx.fill(d.bowl);
  ctx.fillStyle = rgba('255,196,140', 0.16);
  ctx.fill(d.spec);
  ctx.fillStyle = rgba('255,226,190', 0.22);
  ctx.fill(d.glint);
  // (the hoop's shadow on the collar)
  const gc = ctx.createLinearGradient(0, d.hy + d.ry, 0, d.hy + d.ry + 0.06 * sc);
  gc.addColorStop(0, 'rgba(0,0,0,0.45)');
  gc.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gc;
  ctx.fill(d.bowl);
  ctx.strokeStyle = rgba(INK.copper, 0.12);
  ctx.lineWidth = 1;
  ctx.stroke(d.sections);
  ctx.restore();
  ctx.strokeStyle = rgba(INK.copper, 0.55);
  ctx.lineWidth = 1;
  ctx.stroke(d.bowl);
  // ---- the struts in front of the bowl, the near rods
  ctx.fillStyle = '#2a1d15';
  ctx.fill(d.frontStruts);
  ctx.strokeStyle = 'rgba(10,6,4,0.7)';
  ctx.lineWidth = 1;
  ctx.stroke(d.frontStruts);
  ctx.strokeStyle = rgba('196,150,112', 0.45);
  ctx.lineWidth = Math.max(0.7, 0.004 * sc);
  ctx.stroke(d.strutEdges);
  ctx.strokeStyle = chrome(0.42);
  ctx.lineWidth = Math.max(0.7, 0.006 * sc);
  ctx.stroke(d.rods);
  // ---- the hoop's face, the head and its field, the hoop's top
  {
    const g = ctx.createLinearGradient(d.hx - d.orx, 0, d.hx + d.orx, 0);
    g.addColorStop(0, '#3a3c40');
    g.addColorStop(0.3, '#c9ccd2');
    g.addColorStop(0.45, '#7d8086');
    g.addColorStop(0.75, '#a9acb2');
    g.addColorStop(1, '#2c2e31');
    ctx.fillStyle = g;
    ctx.fill(d.hoopFace);
  }
  drawHead(ctx, L, i, lv, st);
  {
    const g = ctx.createLinearGradient(0, d.hy - d.ory, 0, d.hy + d.ory);
    g.addColorStop(0, '#5b5e63');
    g.addColorStop(0.5, '#b8bbc1');
    g.addColorStop(1, '#e6e8ec');
    ctx.fillStyle = g;
    ctx.fill(d.hoopTop, 'evenodd');
    ctx.strokeStyle = 'rgba(20,20,22,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(d.hx, d.hy, d.rx, d.ry, 0, 0, 2 * Math.PI);
    ctx.stroke();
  }
  // ---- the T-handles, the gauge
  ctx.strokeStyle = chrome(0.6);
  ctx.lineWidth = Math.max(0.9, 0.007 * sc);
  ctx.stroke(d.handles);
  ctx.fillStyle = '#a9acb2';
  for (const [x, y] of d.knobs) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.7, 0.0055 * sc), 0, 2 * Math.PI);
    ctx.fill();
  }
  drawGauge(ctx, L, d, lv.pedal[i], lv.lvl[i]);
}

/** the pedal: the link from the hub to its toe, the footboard (its tread), rocking with the tuning */
function drawPedal(ctx: CanvasRenderingContext2D, L: TpLayout, pl: DrumPlan, d: DrumPx, p: number): void {
  const { sc } = L;
  const f = pedalPts(L, pl, p);
  ctx.strokeStyle = '#2a221c';
  ctx.lineWidth = Math.max(1, 0.016 * sc);
  ctx.beginPath();
  ctx.moveTo(d.hub.x, d.hub.y);
  ctx.lineTo(f.hinge[0], f.hinge[1]);
  ctx.lineTo(f.toe[0], f.toe[1]);
  ctx.stroke();
  ctx.beginPath();
  f.quad.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  const g = ctx.createLinearGradient(f.toe[0], f.toe[1], f.heel[0], f.heel[1]);
  g.addColorStop(0, '#4c4f54');
  g.addColorStop(1, '#85888e');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = chrome(0.7);
  ctx.lineWidth = 1;
  ctx.stroke();
  // (the tread: a few bars across the board)
  ctx.strokeStyle = 'rgba(30,30,32,0.55)';
  ctx.lineWidth = Math.max(0.6, 0.004 * sc);
  ctx.beginPath();
  for (let k = 1; k <= 4; k++) {
    const u = 0.15 + k * 0.16;
    const a = [f.quad[0][0] + (f.quad[1][0] - f.quad[0][0]) * u, f.quad[0][1] + (f.quad[1][1] - f.quad[0][1]) * u];
    const b = [f.quad[3][0] + (f.quad[2][0] - f.quad[3][0]) * u, f.quad[3][1] + (f.quad[2][1] - f.quad[3][1]) * u];
    ctx.moveTo(a[0] + (b[0] - a[0]) * 0.15, a[1] + (b[1] - a[1]) * 0.15);
    ctx.lineTo(a[0] + (b[0] - a[0]) * 0.85, a[1] + (b[1] - a[1]) * 0.85);
  }
  ctx.stroke();
}

/** the gauge: its dark plate, a tick a semitone, the pointer at the tuning (amber) */
function drawGauge(ctx: CanvasRenderingContext2D, L: TpLayout, d: DrumPx, p: number, lvl: number): void {
  const { sc } = L;
  ctx.fillStyle = '#16181b';
  ctx.fill(d.plate);
  ctx.strokeStyle = chrome(0.7);
  ctx.lineWidth = Math.max(0.8, 0.003 * sc);
  ctx.stroke(d.plate);
  ctx.strokeStyle = rgba(INK.ivory, 0.6);
  ctx.lineWidth = Math.max(0.6, 0.0022 * sc);
  ctx.stroke(d.ticks);
  const [tx, ty, bx, by] = pointerAt(d, p);
  ctx.strokeStyle = rgba(INK.amber, 0.85 + 0.15 * lvl);
  ctx.lineWidth = Math.max(1, 0.004 * sc);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(tx, ty - (by - ty) * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx, by, Math.max(1, 0.004 * sc), 0, 2 * Math.PI);
  ctx.fillStyle = chrome(0.8);
  ctx.fill();
}

/** the head: the white Mylar on its hoop, a little darker towards the rim; over it the field (the engine's
 *  modes, slowed): warm where the head swings up, cool where down, dark along its nodal lines */
function drawHead(ctx: CanvasRenderingContext2D, L: TpLayout, i: number, lv: TpLive, st: TimpaniState): void {
  const d = L.drums[i];
  ctx.save();
  // (the gradient round the head's centre, drawn in the head's own circle squashed to its ellipse)
  ctx.save();
  ctx.translate(d.hx, d.hy);
  ctx.scale(1, d.ry / d.rx);
  const g = ctx.createRadialGradient(-d.rx * 0.25, -d.rx * 0.3, d.rx * 0.05, 0, 0, d.rx);
  g.addColorStop(0, '#d9d2c3');
  g.addColorStop(0.75, '#c4bcab');
  g.addColorStop(1, '#9f9787');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, d.rx, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(d.hx, d.hy, d.rx, d.ry, 0, 0, 2 * Math.PI);
  ctx.clip();
  const h = st.heads![i];
  if (lv.lvl[i] > 0.004 && h.peak > 0) paintField(ctx, d, h, lv.ref);
  ctx.restore();
}

/** the field's picture on its own little canvas, laid into the head's ellipse */
function paintField(ctx: CanvasRenderingContext2D, d: DrumPx, h: HeadField, ref: number): void {
  if (h.cv === undefined) {
    h.cv = typeof document !== 'undefined' ? (document.createElement('canvas') as HTMLCanvasElement) : null;
    if (h.cv) {
      h.cv.width = FG;
      h.cv.height = FG;
    }
  }
  const c2 = h.cv?.getContext('2d') ?? null;
  if (!c2) return;
  if (h.img === undefined) h.img = c2.createImageData?.(FG, FG) ?? null;
  const img = h.img;
  if (!img) return;
  const px = img.data;
  const w = h.w;
  // (the pattern by the head's own envelope, its strength by the loudest of late, compressed: a head ringing
  // on at a fifth of the stroke's level still shows its (1,1) clearly)
  const inv = (1.7 / h.env) * Math.sqrt(Math.min(1, h.env / ref));
  // (the nodal lines show only while the head moves clearly: at a swing's turn the whole field is near zero)
  const sharp = h.peak * inv;
  const nod = sharp > 0.15 ? Math.min(1, (sharp - 0.15) * 2.5) : 0;
  const nw = 1 / (0.06 * h.peak);
  for (let q = 0; q < w.length; q++) {
    const v = Math.max(-1.2, Math.min(1.2, w[q] * inv));
    const a = Math.min(0.8, 0.95 * Math.pow(Math.abs(v), 0.75));
    const s = nod * Math.exp(-(w[q] * nw) * (w[q] * nw));
    const o = 4 * q;
    const up = v >= 0;
    px[o] = (up ? 255 : 150) * (1 - s) + 30 * s;
    px[o + 1] = (up ? 94 : 182) * (1 - s) + 24 * s;
    px[o + 2] = (up ? 56 : 210) * (1 - s) + 20 * s;
    px[o + 3] = 255 * Math.min(1, a + 0.55 * s);
  }
  c2.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(h.cv as HTMLCanvasElement, d.hx - d.rx, d.hy - d.ry, 2 * d.rx, 2 * d.ry);
}

/** the mallets: each ball's shadow on the head, the streak of a stroke, the shaft back to the grip, the felt */
function drawMallets(ctx: CanvasRenderingContext2D, L: TpLayout, lv: TpLive, st: TimpaniState, now: number): void {
  const { sc, X, Y } = L;
  lv.mallets.forEach((m, k) => {
    const pl = SET[m.drum];
    const bx = X(m.ball[0]);
    const by = Y(m.ball[0], m.ball[1], m.ball[2]);
    const gx = X(m.grip[0]);
    const gy = Y(m.grip[0], m.grip[1], m.grip[2]);
    const br = BALL_R * sc;
    const sx = X(m.ball[0]);
    const sy = Y(m.ball[0], m.ball[1], pl.zh);
    // the shadow straight down on the head (fainter and wider the higher the ball)
    {
      const u = Math.min(1, m.lift / 0.25);
      ctx.beginPath();
      ctx.ellipse(sx, sy, br * (1 + 0.8 * u), br * (1 + 0.8 * u) * SIN_E, 0, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(20,14,10,${(0.55 * (1 - 0.6 * u)).toFixed(3)})`;
      ctx.fill();
    }
    // a stroke's streak from where the ball came from (its first 90 ms), and the felt's ring spreading on the head
    const h = st.hands![k];
    const since = (now - h.t) / 1000;
    if (since >= 0 && since < 0.09 && Number.isFinite(h.fx)) {
      const a = 1 - since / 0.09;
      const g = ctx.createLinearGradient(h.fx, h.fy, bx, by);
      g.addColorStop(0, rgba(INK.felt, 0));
      g.addColorStop(1, rgba(INK.felt, 0.45 * a));
      ctx.strokeStyle = g;
      ctx.lineWidth = br * 1.6;
      ctx.beginPath();
      ctx.moveTo(h.fx, h.fy);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }
    if (m.ago < 0.25) {
      const a = 1 - m.ago / 0.25;
      const r = br * (1.2 + 5 * m.ago);
      ctx.beginPath();
      ctx.ellipse(sx, sy, r, r * SIN_E, 0, 0, 2 * Math.PI);
      ctx.strokeStyle = rgba(INK.vermilion, 0.55 * a * Math.min(1, m.vel / 90));
      ctx.lineWidth = Math.max(1, 0.004 * sc);
      ctx.stroke();
    }
    // the shaft: a light wood, a little thicker at the grip, lit along its top
    const dx = gx - bx;
    const dy = gy - by;
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const w0 = Math.max(1.2, SHAFT_R * sc * 0.85);
    const w1 = Math.max(1.4, SHAFT_R * sc * 1.15);
    ctx.beginPath();
    ctx.moveTo(bx + nx * w0, by + ny * w0);
    ctx.lineTo(gx + nx * w1, gy + ny * w1);
    ctx.lineTo(gx - nx * w1, gy - ny * w1);
    ctx.lineTo(bx - nx * w0, by - ny * w0);
    ctx.closePath();
    const gs = ctx.createLinearGradient(bx + nx * w0, by + ny * w0, bx - nx * w0, by - ny * w0);
    gs.addColorStop(0, '#e2c08a');
    gs.addColorStop(0.5, '#b38a52');
    gs.addColorStop(1, '#6e5030');
    ctx.fillStyle = gs;
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,26,14,0.6)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // the felt ball: pale felt, lit from the upper left, its seam
    const g = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br);
    g.addColorStop(0, '#fbf7ef');
    g.addColorStop(0.6, '#ddd5c6');
    g.addColorStop(1, '#9d9484');
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, 2 * Math.PI);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = m.on ? rgba(INK.vermilion, 0.9) : 'rgba(60,50,40,0.7)';
    ctx.lineWidth = m.on ? 1.4 : 0.8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,110,96,0.5)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(bx, by, br, br * 0.28, Math.atan2(dy, dx) + Math.PI / 2, 0, Math.PI);
    ctx.stroke();
  });
}

/** the head's displacement at (r, θ) straight from a frame's triples (r in 0…1 of the radius, θ from the
 *  strike point): the field's reference, for the tests */
export function headAt(head: Float32Array, r: number, th: number): number {
  let s = 0;
  for (let i = 0; i + 2 < head.length; i += 3) {
    const y = head[i + 2];
    if (!y) continue;
    s += y * besselJ(head[i], head[i + 1] * r) * Math.cos(head[i] * th);
  }
  return s;
}
