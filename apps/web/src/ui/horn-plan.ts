// The double horn in F and B♭ on the 2D stage: its plan in metres, shared by both styles (horn-draw.ts, the
// stage's own look; vector/horn.ts, the lines). A Kruspe-wrap double horn (the Conn 8D's layout: the
// thumb's change valve at the top of the column of four rotors, nearest the leadpipe) seen from the hall's
// side, as it is when it is played and as the 3D stage first shows it (horn3d.ts HORN_VIEW; the Orchestra's
// seated horn is held that way round, HORN_HELD): the valves' caps towards us, the bell at the left (the
// player's right) going away, seen from 40° round so that its rim shows a little of its mouth, the
// mouthpiece rising at the upper right, back to the player. One side everywhere: 2D, vector lines, 3D,
// alone and seated. The levers and their links are on the player's side of a horn; they are drawn through
// here, as a diagram's: what the fingers do is the picture's subject.
//
// The measures. The bell 311 mm across its rim (Conn 8D, 12¼″; Alexander 103, Hans Hoyer 6801: 310 mm),
// the bore 11.9 mm (8D, 0.468″). The corpus (the wound circle) 300–326 mm across its outside, the horn
// 620–635 mm long and 435 mm across perpendicular to the bell (University of Edinburgh MIMEd 15417, an
// Alexander double horn; 16565, John Grey/Orsi; 18259, Lidl). The bell's flare fitted to MIMEd 15417's
// bores (114 mm at 74.5 mm from the rim, 16.8 mm at 835 mm): r = 0.1555·(0.039 / (d + 0.039))^0.94.
// The layout (the rotors' column, the levers, the slides, the leadpipe, the tuning slides at the top,
// the bell's sweep out of the bottom of the circle) measured off the Besson BE 702's photographs and
// its parts diagram (Wikimedia Commons, File:French horn front.png, CC BY 2.5, and File:French Horn
// back.svg, CC BY-SA 3.0, Hk kng), scaled by its bell; the rotors 36 mm apart, their caps 26 mm.
//
// The air's path. The mouthpiece and the leadpipe (into the main tuning slide at the top), the change
// valve; then the F horn's long loop (wound twice round the middle of the circle) or the B♭ horn's short
// one (its tuning slide beside the main one at the top); valves 1, 2 and 3 down the column, each through
// its slide on that side when pressed, straight through when not; back up into the change valve, and out
// round the circle one and a third times, widening, into the bell. Each side's open tube is the engine's
// (core/horn.ts: 3.74 m in F, 2.80 m in B♭; Fletcher & Rossing 1998 §14.6); each valve slide its
// semitones' share of its side's tube (2: a semitone, 1: a tone, 3: three semitones).
import { HORN_BB_LENGTH, HORN_F_LENGTH, hornFingering, type HornFingering } from '@piano-model/engine';

export type P = [number, number];
const mm = (x: number, y: number): P => [x / 1000, y / 1000];

/** the tubing's outside radius (11.9 mm bore, 12.6 mm outside) */
export const TR = 0.0063;
/** the rotors: across, and their heights (the change valve, then 1, 2, 3 down the column); the casing's
 *  and the cap's radius */
export const ROT_X = 0.07;
export const ROT_Y = [0.062, 0.026, -0.01, -0.046];
export const ROT_R = 0.0148;
export const CAP_R = 0.013;
/** the bell's rim: its centre, its radius, the axis out of the mouth (35° above the horizontal, to the
 *  left), and how much of the mouth is seen (the rim's ellipse, minor over major: the bell turned a
 *  little towards us) */
export const RIM_R = 0.1555;
export const AXIS: P = [-Math.cos((35 * Math.PI) / 180), Math.sin((35 * Math.PI) / 180)];
/** the body's last lap leaves the circle at its lower left (125° below the right, its radius 154 mm: the
 *  corpus 320 mm across its outside), along its tangent: the bell's axis, 0.30 m straight to the rim */
export const BELL_A = (-125 * Math.PI) / 180;
export const CIRCLE_R = 0.154;
export const BELL_STRAIGHT = 0.3;
export const RIM_C: P = [CIRCLE_R * Math.cos(BELL_A) + AXIS[0] * BELL_STRAIGHT, CIRCLE_R * Math.sin(BELL_A) + AXIS[1] * BELL_STRAIGHT];
export const MOUTH_K = 0.3;
/** the bell's inside radius d m back from its rim: the flare (114 mm across 74.5 mm from the rim, MIMEd
 *  15417; a Bessel horn's (d₀/(d + d₀))^1.5, about 36 mm across where it leaves the circle, as the
 *  photographs have it), on the bell tail's gentle cone (16.8 mm across at 835 mm, MIMEd 15417), down to
 *  the 11.9 mm bore */
export const bellR = (d: number): number => {
  const x = Math.max(0, d);
  const flare = 0.1555 * Math.pow(0.0782 / (x + 0.0782), 1.5);
  const cone = x < 0.835 ? 0.0084 + (0.835 - x) * 0.0062 : Math.max(0.00595, 0.0084 - (x - 0.835) * 0.0052);
  return Math.max(flare, cone);
};

// ---------------------------------------------------------------- curves
/** points every `step` m along a polyline through `pts` with its corners rounded (quadratic, `r` m back
 *  from each corner, or per corner) */
export function rounded(pts: P[], r: number | number[], step = 0.0015): P[] {
  const out: P[] = [];
  const line = (a: P, b: P) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let i = out.length ? 1 : 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  };
  let cur = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1];
    const B = pts[i];
    const C = pts[i + 1];
    const ri = typeof r === 'number' ? r : r[i - 1] ?? r[r.length - 1];
    const la = Math.hypot(A[0] - B[0], A[1] - B[1]);
    const lc = Math.hypot(C[0] - B[0], C[1] - B[1]);
    const ka = Math.min(0.5, ri / la);
    const kc = Math.min(0.5, ri / lc);
    const p1: P = [B[0] + (A[0] - B[0]) * ka, B[1] + (A[1] - B[1]) * ka];
    const p2: P = [B[0] + (C[0] - B[0]) * kc, B[1] + (C[1] - B[1]) * kc];
    line(cur, p1);
    const n = Math.max(6, Math.ceil((ri * 2) / step));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const s = 1 - t;
      out.push([s * s * p1[0] + 2 * s * t * B[0] + t * t * p2[0], s * s * p1[1] + 2 * s * t * B[1] + t * t * p2[1]]);
    }
    cur = p2;
  }
  line(cur, pts[pts.length - 1]);
  return out;
}
/** an arc about `c`, radius `r` (or r(θ) for a spiral), from a0 to a1 (radians; a1 < a0 clockwise) */
export function arc(c: P, r: number | ((a: number) => number), a0: number, a1: number, step = 0.0015): P[] {
  const R = typeof r === 'number' ? () => r : r;
  const rm = Math.max(R(a0), R(a1));
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * rm) / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [c[0] + R(a) * Math.cos(a), c[1] + R(a) * Math.sin(a)] as P;
  });
}
/** a cubic Bézier sampled every `step` m (about) */
export function bezier(p0: P, p1: P, p2: P, p3: P, step = 0.0015): P[] {
  const n = Math.max(8, Math.ceil((Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1])) / step));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const s = 1 - t;
    const a = s * s * s;
    const b = 3 * s * s * t;
    const c = 3 * s * t * t;
    const d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]] as P;
  });
}
/** a polyline's length */
export function plen(p: P[]): number {
  let l = 0;
  for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
  return l;
}
const join = (...ps: P[][]): P[] => ps.reduce((a, p) => (a.length ? [...a, ...p.slice(1)] : [...p]), [] as P[]);
const D2R = Math.PI / 180;

// ---------------------------------------------------------------- the tubes
/** a tube: its centre line (in the air's direction), its outside radius (or by the distance along it),
 *  and the layer it is drawn in (0 farthest) */
export interface Tube {
  id: string;
  pts: P[];
  r: number | ((s: number) => number);
  layer: number;
  /** nickel silver (the mouthpiece, the slides' inner tubes); brass otherwise */
  nickel?: boolean;
}

// ---- the lengths fitted to the engine's tubes (the dump in apps/web/test/horn2d.test.ts): the tuning
// slides' crooks, how far round the F loop winds, valve 1's loop, valve 3's loops along the bottom
const BB_TOP = 148;
const BB_LOW = -108;
const F_TOP = 148;
const F_TURNS = 2;
/** (the F loop's way out of its racetrack, down beside it into valve 3) */
const F_TAIL_X = 0.013;
const F1_TOP = 96;
const F3_X = 22;
const F3_IN = -92;
const BB3_IN = 0;
const LEAD_UP = 0.046;

// ---- the mouthpiece and the leadpipe
/** the leadpipe's axis down from the receiver (75° below the horizontal, to the right) */
const LP_DIR: P = [Math.cos(-75 * D2R), Math.sin(-75 * D2R)];
/** the mouthpiece's rim, and the receiver's end (the mouthpiece goes in 20 mm past it) */
export const MP_RIM: P = mm(88, 236);
export const MP_LEN = 0.087;
const MP_VIS = 0.067;
export const RECV: P = [MP_RIM[0] + LP_DIR[0] * MP_VIS, MP_RIM[1] + LP_DIR[1] * MP_VIS];
export const MP_DIR = LP_DIR;
/** the mouthpiece (a horn's deep funnel cup, Holton–Farkas MDC's sizes) as [radius, distance from the
 *  rim]: the rim (17.5 mm cup, 26 mm across), the funnel to the throat, the backbore, the shank's taper */
export const MPIECE: [number, number][] = [
  [0.0088, 0.0006], [0.0118, 0], [0.013, 0.0018], [0.013, 0.004], [0.0118, 0.0065], [0.0092, 0.012], [0.0068, 0.02], [0.0052, 0.03], [0.0046, 0.036], [0.0049, 0.04], [0.0046, 0.044],
  [0.0047, 0.05], [0.0052, 0.058], [0.0055, 0.064], [0.005, MP_LEN],
];
/** the leadpipe: down past the circle at the upper right (over it), in along the inside of the circle
 *  behind the levers, round the main tuning slide's crook at the bottom right and up behind the column into
 *  the change valve */
const LEAD_A0 = 12 * D2R;
const LEAD_A1 = -72 * D2R;
const LEAD_R = 0.11;
const LEAD_PTS: P[] = (() => {
  const s0: P = [RECV[0] + LP_DIR[0] * 0.118, RECV[1] + LP_DIR[1] * 0.118];
  const ar = arc([0, 0], LEAD_R, LEAD_A0, LEAD_A1);
  const t0: P = [Math.sin(LEAD_A0), -Math.cos(LEAD_A0)];
  const e = ar[ar.length - 1];
  return join(
    rounded([RECV, s0], 0),
    bezier(s0, [s0[0] + LP_DIR[0] * 0.022, s0[1] + LP_DIR[1] * 0.022], [ar[0][0] - t0[0] * 0.022, ar[0][1] - t0[1] * 0.022], ar[0]),
    ar,
    rounded([e, mm(34, -112), mm(22, -98), mm(LEAD_UP * 1000, -72), mm(LEAD_UP * 1000, ROT_Y[0] * 1000 - 8), mm(57, ROT_Y[0] * 1000 - 3)], [0.014, 0.012, 0.016, 0.01]),
  );
})();
/** the leadpipe widens from the receiver (8.7 mm bore) to the main bore */
const leadR = (s: number) => 0.0052 + 0.0011 * Math.min(1, s / 0.3);

// ---- the change valve's two loops, each through its tuning slide at the top of the circle
/** the B♭ horn's: up out of the change valve into its tuning slide (legs 62 and 34 mm), round the crook,
 *  down the column's left side behind the slides, and into valve 3 */
const BB_PTS: P[] = rounded([mm(62, ROT_Y[0] * 1000 + 13), mm(62, BB_TOP), mm(34, BB_TOP), mm(34, BB_LOW), mm(57, ROT_Y[3] * 1000 - 13)], [0.014, 0.014, 0.016]);
/** the F horn's: up out of the change valve into its tuning slide (legs 22 and −4 mm), round the crook,
 *  down, and round the middle of the circle twice (a racetrack: the F extension), then across into valve 1
 *  behind the column */
const RT = { x0: -0.096, x1: -0.004, y0: -0.103, y1: 0.094, gap: 0.0146 };
function racetrack(turns: number): P[] {
  // clockwise from the top of the right leg, the loop narrowing by `gap` each turn
  const pts: P[] = [];
  for (let t = 0; t < turns; t++) {
    const g = t * RT.gap;
    const x0 = RT.x0 + g;
    const x1 = RT.x1 - g;
    const y0 = RT.y0 + g;
    const y1 = RT.y1 - g;
    const rr = (x1 - x0) / 2;
    const cxm = (x0 + x1) / 2;
    const top = y1 - rr;
    const bot = y0 + rr;
    // the right leg down, the bottom crook, the left leg up, the top crook (to the next turn's start)
    pts.push(...(pts.length ? [] : [[x1, top] as P]), [x1, bot]);
    pts.push(...arc([cxm, bot], rr, 0, -Math.PI).slice(1));
    pts.push([x0, top]);
    const nx1 = RT.x1 - (t + 1) * RT.gap;
    const last = t === turns - 1;
    pts.push(...arc([cxm, top], rr, Math.PI, last ? Math.PI * 0.25 : 0.05).slice(1));
    if (!last) pts.push([nx1, top - 0.004]);
  }
  return pts;
}
const F_LOOP_PTS: P[] = (() => {
  const rt = racetrack(F_TURNS);
  const end = rt[rt.length - 1];
  return join(rounded([mm(57, ROT_Y[0] * 1000 + 9), mm(22, ROT_Y[0] * 1000 + 9), mm(22, F_TOP), mm(-4, F_TOP), [RT.x1, rt[0][1]]], [0.008, 0.013, 0.013]), rt, rounded([end, [F_TAIL_X, end[1] - 0.032], [F_TAIL_X, -0.084], mm(57, ROT_Y[3] * 1000 - 11)], [0.02, 0.022]));
})();

// ---- the valve slides: each valve's F slide (behind) and B♭ slide (in front), out of the rotor's left
// side and back, their legs 15 mm apart; the long ones (valves 1 and 3) round loops in the circle's left
// side and its lower left
const LEG = 0.0075;
const portX = ROT_X - Math.sqrt(ROT_R * ROT_R - LEG * LEG) + 0.001;
/** a straight U slide out of rotor k (1–3) to its crook's centre at x */
const uSlide = (k: number, x: number): P[] => rounded([[portX, ROT_Y[k] + LEG], [x - LEG, ROT_Y[k] + LEG], [x - LEG, ROT_Y[k] - LEG], [portX, ROT_Y[k] - LEG]], LEG);
/** a slide whose crook is a loop: out along its upper leg, round through the given points, back along
 *  its lower leg */
const loopSlide = (k: number, via: P[], r: number | number[]): P[] => rounded([[portX, ROT_Y[k] + LEG], ...via, [portX, ROT_Y[k] - LEG]], r);
const y1u = (ROT_Y[1] + LEG) * 1000;
const y1l = (ROT_Y[1] - LEG) * 1000;
const y3u = (ROT_Y[3] + LEG) * 1000;
const y3l = (ROT_Y[3] - LEG) * 1000;
export const SLIDES: Record<'F' | 'Bb', P[][]> = {
  // (index 0 unused: valve k at index k)
  F: [
    [],
    // valve 1's: out to the circle's left side, up round a loop and back
    loopSlide(1, [mm(-82, y1u), mm(-108, F1_TOP), mm(-138, 40), mm(-118, y1l - 8), mm(-82, y1l)], [0.022, 0.026, 0.026, 0.02, 0.016]),
    uSlide(2, -0.0408),
    // valve 3's: out to the left, down round the lower left of the circle and along its bottom, up, back
    // along inside its own loop and out along its lower leg
    loopSlide(3, [mm(-100, y3u), mm(-118, -58), mm(-118, -92), mm(-94, -112), mm(F3_X, -112), mm(F3_X + 24, -95), mm(F3_X + 24, -80), mm(F3_X + 4, -72), mm(F3_IN, -72), mm(F3_IN - 12, -62), mm(F3_IN, y3l)], [0.016, 0.02, 0.022, 0.022, 0.018, 0.012, 0.012, 0.012, 0.01, 0.01]),
  ],
  Bb: [
    [],
    uSlide(1, -0.101),
    uSlide(2, -0.0127),
    // valve 3's: the same way round the lower left, its return inside the loop shorter
    loopSlide(3, [mm(-100, y3u), mm(-118, -58), mm(-118, -92), mm(-94, -112), mm(F3_X, -112), mm(F3_X + 24, -95), mm(F3_X + 24, -80), mm(F3_X + 4, -72), mm(BB3_IN, -72), mm(BB3_IN - 12, -62), mm(BB3_IN, y3l)], [0.016, 0.02, 0.022, 0.022, 0.018, 0.012, 0.012, 0.012, 0.01, 0.01]),
  ],
};

// ---- the body: out of the change valve, round the circle clockwise one and a third times (a spiral,
// widening), out of the bottom of the circle into the bell
const BODY_A0 = 34 * D2R;
const BODY_A1 = BELL_A - 2 * Math.PI;
const BODY_R0 = 0.128;
const BODY_R1 = CIRCLE_R;
const bodyR = (a: number) => BODY_R0 + ((BODY_R1 - BODY_R0) * (BODY_A0 - a)) / (BODY_A0 - BODY_A1);
const BODY_PTS: P[] = (() => {
  const sp = arc([0, 0], bodyR, BODY_A0, BODY_A1);
  const a = sp[0];
  // (into the spiral from the change valve's right, heading down it: tangent at the start)
  const t: P = [Math.sin(BODY_A0), -Math.cos(BODY_A0)];
  return join(bezier(mm(84, ROT_Y[0] * 1000 + 4), mm(100, ROT_Y[0] * 1000 + 6), [a[0] - t[0] * 0.016, a[1] - t[1] * 0.016], a), sp);
})();
/** the bell's axis from the circle to the rim (along the spiral's tangent), its length */
const BELL_PTS: P[] = (() => {
  const e = BODY_PTS[BODY_PTS.length - 1];
  return rounded([e, RIM_C], 0, 0.001);
})();
export const BELL_LEN = plen(BELL_PTS);
const BODY_LEN = plen(BODY_PTS);

/** every tube, by id. Layers: 0 the body's circle and the F loop (behind), 1 the tuning slides and the B♭
 *  loop, 2 the valve slides' F side, 3 their B♭ side, 4 the return and the column, 5 the leadpipe in front,
 *  the bell */
export const TUBES: Record<string, Tube> = {
  lead: { id: 'lead', pts: LEAD_PTS, r: leadR, layer: 5 },
  floop: { id: 'floop', pts: F_LOOP_PTS, r: TR, layer: 0 },
  bloop: { id: 'bloop', pts: BB_PTS, r: TR, layer: 1 },
  F1: { id: 'F1', pts: SLIDES.F[1], r: TR, layer: 2 },
  F2: { id: 'F2', pts: SLIDES.F[2], r: TR, layer: 2 },
  F3: { id: 'F3', pts: SLIDES.F[3], r: TR, layer: 2 },
  Bb1: { id: 'Bb1', pts: SLIDES.Bb[1], r: TR, layer: 3 },
  Bb2: { id: 'Bb2', pts: SLIDES.Bb[2], r: TR, layer: 3 },
  Bb3: { id: 'Bb3', pts: SLIDES.Bb[3], r: TR, layer: 3 },
  // (the body widens into the bell's flare over its last lap: its radius by the distance from the rim)
  body: { id: 'body', pts: BODY_PTS, r: (s) => Math.max(TR, bellR(BODY_LEN - s + BELL_LEN) + 0.0007), layer: 0 },
};
export const TUBE_LEN: Record<string, number> = Object.fromEntries(Object.entries(TUBES).map(([k, t]) => [k, plen(t.pts)]));

// ---------------------------------------------------------------- the air's path for a fingering
/** a run of the air's path: a tube (or the bell, or a passage inside the valves: hidden, a straight
 *  line between two points with its own length) */
export interface Run {
  id: string;
  pts: P[];
  len: number;
  hidden?: boolean;
  /** how far along its tube the run starts (m: the leadpipe's first 20 mm hold the mouthpiece's shank) */
  offset?: number;
}
/** the passages inside a rotor (through it, or into a slide and back out) and between two rotors */
const THROUGH = 0.034;
const INTO = 0.017;
const KNUCKLE = 0.024;
const hid = (id: string, a: P, b: P, len: number): Run => ({ id, pts: [a, b], len, hidden: true });
const rot = (k: number): P => [ROT_X, ROT_Y[k]];
const tube = (id: string): Run => ({ id, pts: TUBES[id].pts, len: TUBE_LEN[id] });
const first = (id: string) => TUBES[id].pts[0];
const last = (id: string) => TUBES[id].pts[TUBES[id].pts.length - 1];
/** the mouthpiece's run: its rim to its shank's end */
const MP_RUN: Run = { id: 'mp', pts: [MP_RIM, [MP_RIM[0] + LP_DIR[0] * MP_LEN, MP_RIM[1] + LP_DIR[1] * MP_LEN]], len: MP_LEN };
const BELL_RUN: Run = { id: 'bell', pts: BELL_PTS, len: BELL_LEN };
/** the leadpipe's run: from the mouthpiece's shank, 20 mm into the receiver */
const LEAD_RUN: Run = (() => {
  const pts = TUBES.lead.pts;
  let s = 0;
  let i = 1;
  for (; i < pts.length; i++) {
    s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (s >= MP_LEN - MP_VIS) break;
  }
  return { id: 'lead', pts: pts.slice(i), len: TUBE_LEN.lead - s, offset: s };
})();

/** which valves are down for a fingering: [thumb, 1, 2, 3] */
export const valvesDown = (f: Pick<HornFingering, 'side' | 'valves'>): [boolean, boolean, boolean, boolean] => [f.side === 'Bb', /1/.test(f.valves), /2/.test(f.valves), /3/.test(f.valves)];

/** the air's path from the lips to the bell's rim for a side and the valves down */
export function airPath(side: 'F' | 'Bb', down: readonly boolean[]): Run[] {
  const runs: Run[] = [MP_RUN, LEAD_RUN];
  const loop = side === 'F' ? 'floop' : 'bloop';
  runs.push(hid('v4in', last('lead'), first(loop), INTO + 0.008));
  runs.push(tube(loop));
  let at = last(loop);
  // (down the column: valve 3, 2, 1, then up into the change valve)
  for (const k of [3, 2, 1]) {
    const id = `${side}${k}`;
    if (down[k]) {
      runs.push(hid(`v${k}in`, at, first(id), INTO));
      runs.push(tube(id));
      runs.push(hid(`v${k}out`, last(id), rot(k), INTO));
    } else runs.push(hid(`v${k}`, at, rot(k), THROUGH));
    at = rot(k);
    runs.push(hid(`k${k}`, at, rot(k - 1), KNUCKLE));
    at = rot(k - 1);
  }
  runs.push(hid('v4out', at, first('body'), INTO + 0.008));
  runs.push(tube('body'));
  runs.push(BELL_RUN);
  return runs;
}
const pathCache = new Map<string, { runs: Run[]; total: number; starts: number[] }>();
/** the path for a fingering, its runs' starts (m from the lips) and its whole length (cached) */
export function hornAir(side: 'F' | 'Bb', down: readonly boolean[]): { runs: Run[]; total: number; starts: number[] } {
  const key = `${side}${down.map((d) => (d ? 1 : 0)).join('')}`;
  let a = pathCache.get(key);
  if (!a) {
    const runs = airPath(side, down);
    const starts: number[] = [];
    let s = 0;
    for (const r of runs) {
      starts.push(s);
      s += r.len;
    }
    pathCache.set(key, (a = { runs, total: s, starts }));
  }
  return a;
}
/** the drawn air path's length for the engine's fingering of a note (m) */
export const hornAirLength = (m: number): number => {
  const f = hornFingering(m);
  return hornAir(f.side, valvesDown(f)).total;
};
export { HORN_BB_LENGTH, HORN_F_LENGTH };
