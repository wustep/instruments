// The horn on the 2D stage (the classic look): its plan (horn-plan.ts) drawn at its real sizes in metres,
// lit like the trumpet beside it (lacquered yellow brass on the dark stage, nickel-silver rotor caps,
// levers and mouthpiece), and its live state, shared with the vector display (vector/horn.ts).
//
// What moves. The thumb's change valve and valves 1–3 go down for the engine's note by its own fingering
// (hornFingering: the F horn to C4, the B♭ horn from C♯4), each lever on a spring, and back up a moment
// after the note stops: the paddle goes down under the finger, its link turns the rotor's crank a quarter
// turn, and the rotor (its two passages engraved on the cap) turns with it. The air's path through the
// side's loop and the pressed valves' slides is lit, the others are dark; the bore's standing wave (the
// engine's, with its sign; drawn slowed) runs along that path from the lips to the bell's rim, where it
// opens out (the Webster horn's 1/r). The lips buzz against the mouthpiece's rim with the engine's own lip
// opening (its trace, one cycle played back slowed). The player's right hand is cupped in the bell.
import { hornFingering, type HornFingering, type VisualFrame } from '@piano-model/engine';
import { AXIS, CAP_R, MOUTH_K, MPIECE, MP_DIR, MP_LEN, MP_RIM, RECV, RIM_C, RIM_R, ROT_R, ROT_X, ROT_Y, TR, TUBES, bellR, hornAir, valvesDown, type P, type Run, type Tube } from './horn-plan.ts';
import { AutoScale, INK, boreAt, newBoreWave, rgba, slowPhase, spring01, trackBoreWave, type BoreWave } from './stage-draw.ts';

type Box = { x0: number; y0: number; x1: number; y1: number };
export interface HornState {
  /** where its sound leaves (the bell's mouth: the room's wavefronts start there), px in the box */
  src?: { x: number; y: number };
  wave?: BoreWave;
  /** the wave's reference level: the loudest of the last few seconds, so a note dying away fades */
  waveRef?: AutoScale;
  /** the levers' springs (thumb, 1, 2, 3: 0 up, 1 down) */
  mech?: { pos: Float32Array; vel: Float32Array; t: number; quiet: number; f: HornFingering | null };
  /** the lips' opening over one cycle (from the cycle's narrowest), from the engine's trace */
  lips?: { cyc: Float32Array; last: Float32Array | null; ref: number };
  /** where it was last drawn (box px): the whole horn; the valves and levers; the mouthpiece and lips; the
   *  bell's mouth; the levers held (bit 0 the thumb, bits 1–3 valves 1–3) (tests, and the review's
   *  close-ups) */
  drawn?: { body: Box; valves: Box; mouth: Box; bell: Box; levers: number; side: 'F' | 'Bb' | null };
}
export const newHornState = (): HornState => ({});

// ---------------------------------------------------------------- the levers (plan, m)
/** the lever bar (the springs' barrel) across, its top and bottom */
export const BAR_X = 0.098;
const BAR_Y0 = -0.06;
const BAR_Y1 = 0.046;
/** each lever's hub on the bar and its paddle's tip (thumb, 1, 2, 3); the paddles' half-widths at the hub
 *  and at the spoon */
export const LEVERS: { hub: P; tip: P; w0: number; w1: number }[] = [
  { hub: [0.1, 0.046], tip: [0.124, 0.06], w0: 0.003, w1: 0.0058 },
  { hub: [BAR_X, 0.01], tip: [0.15, 0.012], w0: 0.0028, w1: 0.0066 },
  { hub: [BAR_X, -0.014], tip: [0.15, -0.014], w0: 0.0028, w1: 0.0066 },
  { hub: [BAR_X, -0.038], tip: [0.148, -0.04], w0: 0.0028, w1: 0.0066 },
];
/** each rotor's crank (from its spindle, at rest: towards its lever) and how far a press turns it */
export const CRANK = 0.0105;
export const crankAngle = (k: number, press: number): number => {
  const [hx, hy] = LEVERS[k].hub;
  const a0 = Math.atan2(hy - ROT_Y[k], hx - 0.012 - ROT_X);
  return a0 - (Math.PI / 2) * press;
};
/** the little finger's hook, on the circle at the right */
export const HOOK: P[] = [[0.138, -0.06], [0.152, -0.066], [0.158, -0.076], [0.153, -0.084], [0.147, -0.08]];

// ---------------------------------------------------------------- the layout (cached per box)
/** the plan's extent (m): the bell's rim at the left, the paddles' tips at the right, the bell's sweep at the
 *  bottom, the mouthpiece at the top (and the lips' room past it) */
const rimPt = (a: number): P => {
  const n: P = [-AXIS[1], AXIS[0]];
  return [RIM_C[0] + n[0] * RIM_R * Math.cos(a) + AXIS[0] * RIM_R * MOUTH_K * Math.sin(a), RIM_C[1] + n[1] * RIM_R * Math.cos(a) + AXIS[1] * RIM_R * MOUTH_K * Math.sin(a)];
};
export const HN_X0 = Math.min(...Array.from({ length: 72 }, (_, i) => rimPt((i / 72) * 2 * Math.PI)[0])) - 0.004;
export const HN_X1 = 0.168;
export const HN_Y0 = -0.176;
export const HN_Y1 = MP_RIM[1] + 0.016;
/** the box (m) the horn is drawn in at one px per metre (an ensemble sizes it from the strings' scale) */
export const hornBox = (): { w: number; h: number } => ({ w: (HN_X1 - HN_X0) / 0.9, h: (HN_Y1 - HN_Y0) / 0.86 });

/** a tube's outline and shading, in px: its body (filled), its two edges, its lit and shaded bands */
interface TubePx {
  id: string;
  layer: number;
  body: Path2D;
  edges: Path2D;
  hi: Path2D;
  sh: Path2D;
  /** its centre line (px) and each point's distance along it (m), its radius (px) there */
  xy: Float32Array;
  s: Float32Array;
  r: Float32Array;
}
export interface HnLayout {
  key: string;
  W: number;
  H: number;
  top: number;
  sc: number;
  ox: number;
  oy: number;
  tubes: TubePx[];
  byId: Map<string, TubePx>;
  /** the bell: its flare, its edges, the mouth (the rim's ellipse), the inside band the wave fills, the
   *  axis (px) and each point's distance from the rim (m) */
  bell: { flare: Path2D; edges: Path2D; mouth: Path2D; inner: Path2D; hi: Path2D; ax: Float32Array; d: Float32Array; r: Float32Array };
  /** the hand in the bell */
  hand: Path2D;
  handNails: Path2D;
  mp: Path2D;
  mpHi: Path2D;
  hook: Path2D;
  /** the ferrules (short bands over joints) and the braces (thin stays between tubes) */
  ferrules: Path2D;
  braces: Path2D;
}
const layouts = new Map<string, HnLayout>();

/** The layout for a W×H box (the file player's `top` px kept clear at its top): the horn as large as fits in
 *  90 % of the width and 86 % of the height under the player, centred (it is about as wide as it is tall:
 *  no box turns it). A cell sized by hornBox at the group's px/m draws it at that scale. */
export function hornLayout(W: number, H: number, top = 0): HnLayout {
  const key = `${W}x${H}x${top}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const pw = HN_X1 - HN_X0;
  const ph = HN_Y1 - HN_Y0;
  // (a stage fills 86 % of its height under the player; a cell, as hornBox sizes it)
  const sc = Math.max(1, Math.min((W * 0.9) / pw, ((H - top) * 0.86) / ph));
  const ox = W / 2 - ((HN_X0 + HN_X1) / 2) * sc;
  const oy = top + (H - top) / 2 + ((HN_Y0 + HN_Y1) / 2) * sc;
  const X = (x: number) => ox + x * sc;
  const Y = (y: number) => oy - y * sc;
  const tubes = Object.values(TUBES).map((t) => tubePx(t, X, Y, sc));
  const byId = new Map(tubes.map((t) => [t.id, t]));
  // ---- the bell: the flare about its axis (the body's spiral's last point to the rim), its mouth
  const bellRun = hornAir('F', [false, false, false, false]).runs.at(-1)!;
  const bp = bellRun.pts;
  const n = bp.length;
  const ax = new Float32Array(2 * n);
  const dd = new Float32Array(n);
  const rr = new Float32Array(n);
  let acc = 0;
  for (let i = n - 1; i >= 0; i--) {
    if (i < n - 1) acc += Math.hypot(bp[i + 1][0] - bp[i][0], bp[i + 1][1] - bp[i][1]);
    dd[i] = acc;
  }
  const sideA: [number, number][] = [];
  const sideB: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = bp[Math.max(0, i - 1)];
    const b = bp[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l;
    const ny = (b[0] - a[0]) / l;
    const r = bellR(dd[i]) + 0.0007;
    rr[i] = r * sc;
    ax[2 * i] = X(bp[i][0]);
    ax[2 * i + 1] = Y(bp[i][1]);
    sideA.push([X(bp[i][0] + nx * r), Y(bp[i][1] + ny * r)]);
    sideB.push([X(bp[i][0] - nx * r), Y(bp[i][1] - ny * r)]);
  }
  const flare = new Path2D();
  [...sideA, ...[...sideB].reverse()].forEach(([x, y], i) => (i ? flare.lineTo(x, y) : flare.moveTo(x, y)));
  flare.closePath();
  const edges = new Path2D();
  for (const s of [sideA, sideB]) s.forEach(([x, y], i) => (i ? edges.lineTo(x, y) : edges.moveTo(x, y)));
  const mouth = new Path2D();
  for (let i = 0; i <= 96; i++) {
    const p = rimPt((i / 96) * 2 * Math.PI);
    if (i) mouth.lineTo(X(p[0]), Y(p[1]));
    else mouth.moveTo(X(p[0]), Y(p[1]));
  }
  mouth.closePath();
  const band = (k: number) => {
    const p = new Path2D();
    const A: [number, number][] = [];
    const B: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = bp[Math.max(0, i - 1)];
      const b = bp[Math.min(n - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / l;
      const ny = (b[0] - a[0]) / l;
      const r = bellR(dd[i]) * k;
      A.push([X(bp[i][0] + nx * r), Y(bp[i][1] + ny * r)]);
      B.push([X(bp[i][0] - nx * r), Y(bp[i][1] - ny * r)]);
    }
    [...A, ...B.reverse()].forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  };
  // the flare's lit band (towards the upper left), as on its photographs
  const hi = band(0.62);
  const inner = band(0.42);
  // ---- the hand in the bell (the right hand, cupped, as horn players hold it): seen through the mouth,
  // in from the rim's lower end along the bell's wall, its knuckles towards the throat, the thumb along the
  // top, the fingers together (m: a along the rim towards its upper end, b along the axis out of the mouth)
  const eu: P = [AXIS[1], -AXIS[0]];
  const H2 = (a: number, b: number): [number, number] => [X(RIM_C[0] + eu[0] * a + AXIS[0] * b), Y(RIM_C[1] + eu[1] * a + AXIS[1] * b)];
  const hand = new Path2D();
  {
    const pts: [number, number][] = [
      [-0.2, -0.036], [-0.13, -0.036], [-0.09, -0.033], [-0.062, -0.028], [-0.046, -0.02], [-0.038, -0.008], [-0.036, 0.004], [-0.04, 0.016], [-0.05, 0.024], [-0.058, 0.028],
      [-0.052, 0.034], [-0.054, 0.042], [-0.066, 0.046], [-0.084, 0.04], [-0.1, 0.034], [-0.13, 0.034], [-0.2, 0.034],
    ];
    pts.forEach(([a, b], i) => (i ? hand.lineTo(...H2(a, b)) : hand.moveTo(...H2(a, b))));
    hand.closePath();
  }
  // the fingers' partings and the thumb's crease
  const handNails = new Path2D();
  for (const [a0, b0, a1, b1] of [[-0.078, -0.016, -0.044, -0.013], [-0.08, -0.003, -0.039, -0.001], [-0.078, 0.01, -0.042, 0.011], [-0.088, 0.027, -0.06, 0.03]]) {
    handNails.moveTo(...H2(a0, b0));
    handNails.lineTo(...H2(a1, b1));
  }
  // ---- the mouthpiece (its silhouette along the leadpipe's axis, rim to shank)
  const nm: P = [-MP_DIR[1], MP_DIR[0]];
  const MPt = (s: number, r: number): [number, number] => [X(MP_RIM[0] + MP_DIR[0] * s + nm[0] * r), Y(MP_RIM[1] + MP_DIR[1] * s + nm[1] * r)];
  const mp = new Path2D();
  MPIECE.forEach(([r, s], i) => (i ? mp.lineTo(...MPt(s, r)) : mp.moveTo(...MPt(s, r))));
  for (let i = MPIECE.length - 1; i >= 0; i--) mp.lineTo(...MPt(MPIECE[i][1], -MPIECE[i][0]));
  mp.closePath();
  const mpHi = new Path2D();
  MPIECE.forEach(([r, s], i) => (i ? mpHi.lineTo(...MPt(s, r * 0.45)) : mpHi.moveTo(...MPt(s, r * 0.45))));
  // ---- the little finger's hook
  const poly = (pts: P[], close = true) => {
    const p = new Path2D();
    pts.forEach(([x, y], i) => (i ? p.lineTo(X(x), Y(y)) : p.moveTo(X(x), Y(y))));
    if (close) p.closePath();
    return p;
  };
  const hook = poly(HOOK, false);
  // ---- ferrules: at the slides' sleeves and the tuning slides' crooks, on the circle's joints
  const ferrules = new Path2D();
  const ferruleAt = (t: TubePx, s: number) => {
    let i = 1;
    while (i < t.s.length - 1 && t.s[i] < s) i++;
    const x = t.xy[2 * i];
    const y = t.xy[2 * i + 1];
    const dx = t.xy[2 * i] - t.xy[2 * i - 2];
    const dy = t.xy[2 * i + 1] - t.xy[2 * i - 1];
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l;
    const uy = dy / l;
    const w = t.r[i] + Math.max(0.8, 0.0012 * sc);
    const h = Math.max(1, 0.0028 * sc);
    ferrules.moveTo(x - ux * h + uy * w, y - uy * h - ux * w);
    ferrules.lineTo(x + ux * h + uy * w, y + uy * h - ux * w);
    ferrules.lineTo(x + ux * h - uy * w, y + uy * h + ux * w);
    ferrules.lineTo(x - ux * h - uy * w, y - uy * h + ux * w);
    ferrules.closePath();
  };
  for (const id of ['F1', 'F2', 'F3', 'Bb1', 'Bb2', 'Bb3']) {
    const t = byId.get(id)!;
    const L = t.s[t.s.length - 1];
    ferruleAt(t, 0.03);
    ferruleAt(t, L - 0.03);
  }
  for (const id of ['bloop', 'lead']) {
    const t = byId.get(id)!;
    const L = t.s[t.s.length - 1];
    ferruleAt(t, id === 'lead' ? 0.012 : 0.035);
    ferruleAt(t, L - 0.05);
  }
  {
    const b = byId.get('body')!;
    for (const s of [0.07, 0.42]) ferruleAt(b, s);
    const f = byId.get('floop')!;
    ferruleAt(f, 0.09);
  }
  // ---- braces: thin stays between the circle and the loops and slides
  const braces = new Path2D();
  for (const [a, b] of [
    [[-0.004, 0.064], [-0.087, 0.064]],
    [[-0.104, 0.022], [-0.122, 0.04]],
    [[0.03, -0.112], [0.022, -0.13]],
    [[0.118, 0.07], [0.128, 0.064]],
    [[-0.004, 0.12], [-0.004, 0.13]],
  ] as [P, P][]) {
    braces.moveTo(X(a[0]), Y(a[1]));
    braces.lineTo(X(b[0]), Y(b[1]));
  }
  const L: HnLayout = { key, W, H, top, sc, ox, oy, tubes, byId, bell: { flare, edges, mouth, inner, hi, ax, d: dd, r: rr }, hand, handNails, mp, mpHi, hook, ferrules, braces };
  if (layouts.size > 8) layouts.clear();
  layouts.set(key, L);
  return L;
}
/** a tube in px: its outline (from its centre line and radius), its edges and its lit and shaded bands */
function tubePx(t: Tube, X: (x: number) => number, Y: (y: number) => number, sc: number): TubePx {
  const pts = t.pts;
  const n = pts.length;
  const xy = new Float32Array(2 * n);
  const s = new Float32Array(n);
  const r = new Float32Array(n);
  const A: [number, number][] = [];
  const B: [number, number][] = [];
  const HI: [number, number][] = [];
  const SH: [number, number][] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    s[i] = acc;
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l;
    const ny = (b[0] - a[0]) / l;
    const ri = typeof t.r === 'number' ? t.r : t.r(acc);
    r[i] = ri * sc;
    xy[2 * i] = X(pts[i][0]);
    xy[2 * i + 1] = Y(pts[i][1]);
    A.push([X(pts[i][0] + nx * ri), Y(pts[i][1] + ny * ri)]);
    B.push([X(pts[i][0] - nx * ri), Y(pts[i][1] - ny * ri)]);
    // the light from the upper left: the lit band on the side facing it, the shade on the other
    const lit = nx * -0.45 + ny * 0.89 >= 0 ? 1 : -1;
    HI.push([X(pts[i][0] + lit * nx * ri * 0.42), Y(pts[i][1] + lit * ny * ri * 0.42)]);
    SH.push([X(pts[i][0] - lit * nx * ri * 0.62), Y(pts[i][1] - lit * ny * ri * 0.62)]);
  }
  const body = new Path2D();
  [...A, ...[...B].reverse()].forEach(([x, y], i) => (i ? body.lineTo(x, y) : body.moveTo(x, y)));
  body.closePath();
  const edges = new Path2D();
  const hi = new Path2D();
  const sh = new Path2D();
  for (const [p, q] of [[edges, A], [edges, B], [hi, HI], [sh, SH]] as const) q.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  return { id: t.id, layer: t.layer, body, edges, hi, sh, xy, s, r };
}

// ---------------------------------------------------------------- the live state (both styles)
export interface HnLive {
  /** the fingering held (null: all up), its side and valves down [thumb, 1, 2, 3] */
  f: HornFingering | null;
  down: boolean[];
  /** each lever's travel (thumb, 1, 2, 3: 0 up, 1 down), on its spring */
  press: number[];
  /** the air's path for the fingering held (the open F horn's at rest) */
  air: { runs: Run[]; total: number; starts: number[] };
  side: 'F' | 'Bb';
  /** the wave: its level (0..1 of the recent loudest), slow phase (−1..1), and the pressure at s m along
   *  the path (the engine's, with the bell's 1/r) */
  lvl: number;
  ph: number;
  sounding: boolean;
  ampAt: (s: number) => number;
  /** the lips' opening now (drawn slowed; about 1 at a loud note's widest), the blowing pressure */
  open: number;
  blow: number;
  /** the lips' swing over the cycle (0 at rest) */
  swing: number;
}
const CYC = 32;
const NONE = [false, false, false, false];

/** the frame into the drawing's live state (the same for both styles: a change of style carries it) */
export function hornLive(fr: VisualFrame | null, st: HornState, now: number): HnLive {
  const focus = fr?.focus ?? null;
  const blow = fr?.lips?.blow ?? 0;
  // ---- the standing wave along the bore (lips 0 → bell 1)
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = (st.waveRef ??= new AutoScale(1e-6, 0.997)).of(peak);
  const lvl = Math.min(1, peak / scale);
  // ---- the fingering: the engine's note while it is blown and a moment after, then the levers lift
  const mc = (st.mech ??= { pos: new Float32Array(4), vel: new Float32Array(4), t: now, quiet: 10, f: null });
  const dt = Math.min(0.1, Math.max(0, (now - mc.t) / 1000));
  mc.t = now;
  mc.quiet = blow > 0.02 || (lvl > 0.04 && blow > 0.002) ? 0 : mc.quiet + dt;
  const f = focus && mc.quiet < 0.8 ? hornFingering(focus.midi) : null;
  mc.f = f;
  const down = f ? valvesDown(f) : NONE;
  // (a rotary valve's lever: quick, with a small bounce off its stop, 24 Hz)
  const press = [0, 1, 2, 3].map((k) => spring01(mc.pos, mc.vel, k, down[k] ? 1 : 0, dt, 24, 0.6));
  const side = f?.side ?? 'F';
  const air = hornAir(side, down);
  const ph = Math.cos(slowPhase(focus?.f1 ?? 175, now));
  const bellStart = air.starts[air.starts.length - 1];
  const ampAt = (s: number): number => {
    // in the bell's flare the pressure spreads over the widening mouth: p = ψ/r
    const taper = s > bellStart ? bellR(air.total - bellStart) / bellR(air.total - s) : 1;
    return (boreAt(w.amp, s / air.total) / scale) * taper;
  };
  // ---- the lips: their opening over a cycle, from the cycle's narrowest, played back on the wave's clock
  const lp = (st.lips ??= { cyc: new Float32Array(CYC), last: null, ref: 1 });
  const e = fr?.excite;
  const tr = e?.trace;
  const f1 = focus?.f1 ?? 175;
  if (e && tr && tr !== lp.last && focus && blow > 0.01) {
    lp.last = tr;
    const P = (e.rate || 48000) / f1;
    if (P >= 4 && tr.length >= 2 * P + 2) {
      let i0 = Math.floor(tr.length - 2 * P);
      let lo = Infinity;
      for (let i = i0; i < tr.length - P - 1; i++) if (tr[i] < lo) {
        lo = tr[i];
        i0 = i;
      }
      let hi = 0;
      for (let k = 0; k < CYC; k++) {
        const q = i0 + (k * P) / CYC;
        const qi = Math.floor(q);
        const v = tr[qi] + (tr[Math.min(tr.length - 1, qi + 1)] - tr[qi]) * (q - qi);
        lp.cyc[k] += (Math.max(0, Math.min(2.5, v)) - lp.cyc[k]) * 0.35;
        hi = Math.max(hi, lp.cyc[k]);
      }
      lp.ref = Math.max(0.3, hi, lp.ref * 0.995);
    }
  } else if (!(blow > 0.01)) {
    // the breath gone: the lips close
    const k = 1 - Math.exp(-dt / 0.06);
    for (let i = 0; i < CYC; i++) lp.cyc[i] *= 1 - k;
  }
  const th = (((slowPhase(f1, now) * 1.6) / (2 * Math.PI)) % 1 + 1) % 1;
  const ci = th * CYC;
  const c0 = Math.floor(ci) % CYC;
  const open = lp.cyc[c0] + (lp.cyc[(c0 + 1) % CYC] - lp.cyc[c0]) * (ci - Math.floor(ci));
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < CYC; i++) {
    lo = Math.min(lo, lp.cyc[i]);
    hi = Math.max(hi, lp.cyc[i]);
  }
  return { f, down, press, air, side, lvl, ph, sounding: !!focus && lvl > 0.02 && !!f, ampAt, open, blow, swing: Math.max(0, hi - lo) };
}

/** record where it was drawn (and the levers held) and where its sound leaves */
export function hornRecord(L: HnLayout, st: HornState, lv: HnLive): void {
  const X = (x: number) => L.ox + x * L.sc;
  const Y = (y: number) => L.oy - y * L.sc;
  const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0: X(x0), y0: Y(y1), x1: X(x1), y1: Y(y0) });
  const levers = lv.f ? lv.down.reduce((a, d, i) => a | (d ? 1 << i : 0), 0) : 0;
  st.drawn = {
    body: box(HN_X0, HN_Y0, HN_X1, HN_Y1),
    valves: box(ROT_X - 0.03, ROT_Y[3] - 0.026, 0.156, 0.075),
    mouth: box(MP_RIM[0] - 0.03, MP_RIM[1] - 0.06, MP_RIM[0] + 0.035, MP_RIM[1] + 0.022),
    bell: box(RIM_C[0] - 0.09, RIM_C[1] - 0.14, RIM_C[0] + 0.09, RIM_C[1] + 0.14),
    levers,
    side: lv.f ? lv.f.side : null,
  };
  st.src = { x: X(RIM_C[0] + AXIS[0] * 0.02), y: Y(RIM_C[1] + AXIS[1] * 0.02) };
}

// ---------------------------------------------------------------- the classic drawing
// lacquered yellow brass on the dark stage (the trumpet's), nickel silver
const BRASS_BODY = '#4a3416';
const BRASS_DEEP = '#2a1d0c';
const NICKEL_BODY = '#3c3a36';
const nickel = (a: number) => rgba('236,230,216', a);
const waveInk = (v: number) => (v >= 0 ? INK.vermilion : INK.steel);

/** The double horn from its outside: the body wound round the circle into the bell (the right hand cupped
 *  in it), the leadpipe and its tuning slide, the F horn's loop and the B♭ horn's, the valve slides (each
 *  valve's F slide behind its B♭ one), the four rotors with their caps turning, the lever bar, the paddles
 *  going down for the engine's fingering; the air's path lit, the standing wave along it, the lips buzzing
 *  at the mouthpiece. `top`: the file player's px over the box's top. */
export function drawHorn(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: HornState, top = 0): void {
  const L = hornLayout(W, H, top);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const now = performance.now();
  const lv = hornLive(fr, st, now);
  const onPath = new Set(lv.air.runs.map((r) => r.id));
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const tube = (t: TubePx, on: boolean) => {
    ctx.fillStyle = on ? BRASS_BODY : BRASS_DEEP;
    ctx.fill(t.body);
    ctx.strokeStyle = rgba(INK.amber, on ? 0.16 : 0.08);
    ctx.lineWidth = Math.max(1, 0.0034 * sc);
    ctx.stroke(t.sh);
    ctx.strokeStyle = rgba(INK.amber, on ? 0.34 : 0.2);
    ctx.lineWidth = Math.max(0.8, 0.0018 * sc);
    ctx.stroke(t.hi);
    ctx.strokeStyle = rgba(INK.amber, on ? 0.72 : 0.42);
    ctx.lineWidth = 1;
    ctx.stroke(t.edges);
  };
  const glow = (t: TubePx) => glowTube(ctx, L, t, lv);
  // ---- the bell (the body's last lap leads into it), behind everything but the hand's wrist
  {
    const B = L.bell;
    ctx.fillStyle = BRASS_BODY;
    ctx.fill(B.flare);
    const a0 = [B.ax[0], B.ax[1]];
    const n2 = B.ax.length / 2 - 1;
    const g = ctx.createLinearGradient(a0[0], a0[1], B.ax[2 * n2], B.ax[2 * n2 + 1]);
    g.addColorStop(0, rgba(INK.amber, 0.06));
    g.addColorStop(0.6, rgba(INK.amber, 0.14));
    g.addColorStop(1, rgba(INK.amber, 0.26));
    ctx.fillStyle = g;
    ctx.fill(B.hi);
    ctx.strokeStyle = rgba(INK.amber, 0.72);
    ctx.lineWidth = 1.1;
    ctx.stroke(B.edges);
    if (lv.sounding) bellGlow(ctx, L, lv);
  }
  // ---- the tubes, farthest first; each glowing along the air's path where it carries it
  for (let layer = 0; layer <= 5; layer++)
    for (const t of L.tubes) {
      if (t.layer !== layer) continue;
      const on = onPath.has(t.id);
      tube(t, on);
      // (the farther tubes in the shadow of the nearer: the circle's and the F loop's, then the loops')
      if (layer < 2) {
        ctx.fillStyle = `rgba(0,0,0,${layer === 0 ? 0.22 : 0.1})`;
        ctx.fill(t.body);
      }
      if (on && lv.sounding) glow(t);
    }
  ctx.fillStyle = BRASS_BODY;
  ctx.fill(L.ferrules);
  ctx.fillStyle = rgba(INK.amber, 0.18);
  ctx.fill(L.ferrules);
  ctx.strokeStyle = rgba(INK.amber, 0.7);
  ctx.lineWidth = 1;
  ctx.stroke(L.ferrules);
  ctx.strokeStyle = rgba(INK.amber, 0.45);
  ctx.lineWidth = Math.max(1, 0.0022 * sc);
  ctx.stroke(L.braces);
  // ---- the bell's mouth: its inside (the far wall, lit at the top), the hand cupped in it, the rim's bead
  {
    const B = L.bell;
    const c = [X(RIM_C[0]), Y(RIM_C[1])];
    const gm = ctx.createLinearGradient(X(RIM_C[0] + AXIS[1] * RIM_R), Y(RIM_C[1] - AXIS[0] * RIM_R), X(RIM_C[0] - AXIS[1] * RIM_R), Y(RIM_C[1] + AXIS[0] * RIM_R));
    gm.addColorStop(0, '#3a2810');
    gm.addColorStop(0.45, '#1c140a');
    gm.addColorStop(1, '#5a4018');
    ctx.fillStyle = gm;
    ctx.fill(B.mouth);
    if (lv.sounding) {
      // the sound leaving the mouth: a warm shimmer over the inside, with the wave's level at the rim
      const A = Math.min(1, Math.abs(lv.ampAt(lv.air.total - 0.001)));
      const rg = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], RIM_R * sc);
      rg.addColorStop(0, rgba(INK.vermilion, 0.1 + 0.22 * A * lv.lvl));
      rg.addColorStop(1, rgba(INK.vermilion, 0));
      ctx.fillStyle = rg;
      ctx.fill(B.mouth);
    }
    ctx.save();
    ctx.clip(B.mouth);
    drawHand(ctx, L);
    ctx.restore();
    ctx.strokeStyle = rgba(INK.amber, 0.9);
    ctx.lineWidth = Math.max(1.4, 0.0035 * sc);
    ctx.stroke(B.mouth);
    ctx.strokeStyle = rgba('255,236,190', 0.35);
    ctx.lineWidth = 1;
    ctx.stroke(B.mouth);
  }
  // ---- the rotors: casings, caps (their passages engraved, turning), the cranks and links to the levers
  ROT_Y.forEach((y, k) => drawRotor(ctx, X(ROT_X), Y(y), sc, lv.press[k], k, lv));
  // ---- the lever bar (its springs), the paddles
  drawLevers(ctx, L, lv);
  // ---- the little finger's hook
  ctx.strokeStyle = rgba(INK.amber, 0.6);
  ctx.lineWidth = Math.max(1, 0.0026 * sc);
  ctx.stroke(L.hook);
  // ---- the mouthpiece (silver), the lips at its rim
  ctx.fillStyle = NICKEL_BODY;
  ctx.fill(L.mp);
  {
    const nm: P = [-MP_DIR[1], MP_DIR[0]];
    const c: P = [MP_RIM[0] + MP_DIR[0] * 0.03, MP_RIM[1] + MP_DIR[1] * 0.03];
    const gm = ctx.createLinearGradient(X(c[0] + nm[0] * 0.013), Y(c[1] + nm[1] * 0.013), X(c[0] - nm[0] * 0.013), Y(c[1] - nm[1] * 0.013));
    gm.addColorStop(0, nickel(0.06));
    gm.addColorStop(0.3, nickel(0.4));
    gm.addColorStop(0.55, nickel(0.12));
    gm.addColorStop(1, nickel(0.04));
    ctx.fillStyle = gm;
    ctx.fill(L.mp);
  }
  ctx.strokeStyle = nickel(0.32);
  ctx.lineWidth = Math.max(1, 0.002 * sc);
  ctx.stroke(L.mpHi);
  ctx.strokeStyle = nickel(0.62);
  ctx.lineWidth = 1.1;
  ctx.stroke(L.mp);
  drawLips(ctx, L, lv, now);
  ctx.restore();
  hornRecord(L, st, lv);
}

/** the wave along a tube on the air's path: its envelope (vermilion, by strength) and its sign (warm
 *  compression, cool rarefaction), drawn slowed */
function glowTube(ctx: CanvasRenderingContext2D, L: HnLayout, t: TubePx, lv: HnLive): void {
  const runs = lv.air.runs;
  const ri = runs.findIndex((r) => r.id === t.id);
  if (ri < 0) return;
  // (the run may start a little way along its tube: the leadpipe's after the mouthpiece's shank)
  const s0 = lv.air.starts[ri] - (runs[ri].offset ?? 0);
  const env = new Map<number, Path2D>();
  const sgn = new Map<number, Path2D>();
  let lastE = -1;
  let lastK = 0;
  const n = t.s.length;
  for (let i = 1; i < n; i++) {
    const A = lv.ampAt(s0 + (t.s[i - 1] + t.s[i]) / 2);
    const v = A * lv.ph;
    // (width class: the tube's radius in px, so the widening body's glow widens with it)
    const wc = Math.max(1, Math.round(t.r[i] * 0.9));
    const e = Math.round(Math.min(10, 10 * Math.pow(Math.abs(A), 1.5)));
    const ke = e ? e * 1000 + wc : 0;
    if (ke) {
      let p = env.get(ke);
      if (!p) env.set(ke, (p = new Path2D()));
      if (ke !== lastE) p.moveTo(t.xy[2 * i - 2], t.xy[2 * i - 1]);
      p.lineTo(t.xy[2 * i], t.xy[2 * i + 1]);
    }
    lastE = ke;
    const a = Math.round(Math.min(10, 10 * Math.pow(Math.abs(v), 1.2)));
    const kk = a ? (v >= 0 ? 1 : -1) * (a * 1000 + wc) : 0;
    if (kk) {
      let p = sgn.get(kk);
      if (!p) sgn.set(kk, (p = new Path2D()));
      if (kk !== lastK) p.moveTo(t.xy[2 * i - 2], t.xy[2 * i - 1]);
      p.lineTo(t.xy[2 * i], t.xy[2 * i + 1]);
    }
    lastK = kk;
  }
  ctx.save();
  ctx.lineCap = 'butt';
  for (const [k, p] of env) {
    ctx.strokeStyle = rgba(INK.vermilion, (Math.floor(k / 1000) / 10) * 0.26);
    ctx.lineWidth = 1.05 * (k % 1000);
    ctx.stroke(p);
  }
  for (const [k, p] of sgn) {
    const a = Math.abs(k);
    ctx.strokeStyle = rgba(k > 0 ? INK.vermilion : INK.steel, (Math.floor(a / 1000) / 10) * 0.46);
    ctx.lineWidth = 0.62 * (a % 1000);
    ctx.stroke(p);
  }
  ctx.restore();
}
/** the wave in the bell: a gradient along its axis inside the flare */
function bellGlow(ctx: CanvasRenderingContext2D, L: HnLayout, lv: HnLive): void {
  const B = L.bell;
  const n = B.d.length;
  const sB = lv.air.starts[lv.air.starts.length - 1];
  const len = lv.air.total - sB;
  const e0 = [B.ax[0], B.ax[1]];
  const e1 = [B.ax[2 * (n - 1)], B.ax[2 * (n - 1) + 1]];
  const ge = ctx.createLinearGradient(e0[0], e0[1], e1[0], e1[1]);
  const gw = ctx.createLinearGradient(e0[0], e0[1], e1[0], e1[1]);
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    const A = lv.ampAt(sB + u * len);
    ge.addColorStop(u, rgba(INK.vermilion, 0.3 * Math.min(1, Math.pow(Math.abs(A), 1.5))));
    gw.addColorStop(u, rgba(waveInk(A * lv.ph), 0.46 * Math.min(1, Math.pow(Math.abs(A * lv.ph), 1.2))));
  }
  ctx.fillStyle = ge;
  ctx.fill(B.inner);
  ctx.fillStyle = gw;
  ctx.fill(B.inner);
}
/** the hand in the bell: a warm, shadowed silhouette (the inside of the bell is dark) */
function drawHand(ctx: CanvasRenderingContext2D, L: HnLayout): void {
  const X = (x: number) => L.ox + x * L.sc;
  const Y = (y: number) => L.oy - y * L.sc;
  // (lit from the rim, in shade towards the throat)
  const eu: P = [AXIS[1], -AXIS[0]];
  const g = ctx.createLinearGradient(X(RIM_C[0] - eu[0] * 0.15), Y(RIM_C[1] - eu[1] * 0.15), X(RIM_C[0] - eu[0] * 0.03), Y(RIM_C[1] - eu[1] * 0.03));
  g.addColorStop(0, 'rgb(150,104,80)');
  g.addColorStop(0.6, 'rgb(104,70,52)');
  g.addColorStop(1, 'rgb(58,38,28)');
  ctx.fillStyle = g;
  ctx.fill(L.hand);
  ctx.strokeStyle = 'rgba(236,196,166,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke(L.hand);
  ctx.strokeStyle = 'rgba(30,16,10,0.55)';
  ctx.stroke(L.handNails);
}
/** a rotor seen end on: its brass casing, the nickel cap with its bevel and centre screw, the rotor's two
 *  passages engraved (turned a quarter turn by `press`; lit where the air goes), the crank and its ball */
function drawRotor(ctx: CanvasRenderingContext2D, cx: number, cy: number, sc: number, press: number, k: number, lv: HnLive): void {
  const R = ROT_R * sc;
  const r = CAP_R * sc;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.fillStyle = BRASS_BODY;
  ctx.fill();
  ctx.strokeStyle = rgba(INK.amber, 0.75);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#77736b');
  g.addColorStop(0.55, '#4a4741');
  g.addColorStop(1, '#2a2825');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = nickel(0.65);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, 2 * Math.PI);
  ctx.strokeStyle = nickel(0.22);
  ctx.stroke();
  // the passages: two arcs across the rotor, turned with it (lit while the air goes through them)
  const a = -(Math.PI / 2) * press;
  const lit = lv.sounding && (k === 0 || lv.f) ? 0.35 + 0.45 * lv.lvl : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-a);
  ctx.lineWidth = Math.max(1, r * 0.13);
  for (const sg of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sg * r * 0.95, 0, r * 0.62, sg > 0 ? Math.PI * 0.62 : -Math.PI * 0.38, sg > 0 ? Math.PI * 1.38 : Math.PI * 0.38);
    ctx.strokeStyle = 'rgba(14,12,10,0.7)';
    ctx.stroke();
    if (lit) {
      ctx.strokeStyle = rgba(INK.vermilion, lit * 0.6);
      ctx.lineWidth = Math.max(0.8, r * 0.07);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, r * 0.13);
    }
  }
  ctx.restore();
  // the centre screw
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.2, 0, 2 * Math.PI);
  ctx.fillStyle = '#8a857b';
  ctx.fill();
  ctx.strokeStyle = 'rgba(20,18,16,0.8)';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.16 * Math.cos(a), cy + r * 0.16 * Math.sin(a));
  ctx.lineTo(cx + r * 0.16 * Math.cos(a), cy - r * 0.16 * Math.sin(a));
  ctx.stroke();
  // the crank on the spindle and its ball (turning with the rotor), lit while down
  const ca = crankAngle(k, press);
  const bx = cx + Math.cos(ca) * CRANK * sc;
  const by = cy - Math.sin(ca) * CRANK * sc;
  ctx.strokeStyle = press > 0.05 ? rgba(INK.amber, 0.5 + 0.4 * press) : nickel(0.7);
  ctx.lineWidth = Math.max(1.2, 0.0024 * sc);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx, by, Math.max(1.2, 0.0022 * sc), 0, 2 * Math.PI);
  ctx.fillStyle = '#6a665e';
  ctx.fill();
  ctx.stroke();
}
/** the lever bar with its springs, each lever's link from its hub to its rotor's crank, and the paddles
 *  (the thumb's at the top), going down under the fingers (amber) */
function drawLevers(ctx: CanvasRenderingContext2D, L: HnLayout, lv: HnLive): void {
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  // the bar: a rod with its spring barrels
  ctx.lineCap = 'butt';
  ctx.strokeStyle = NICKEL_BODY;
  ctx.lineWidth = Math.max(2, 0.0052 * sc);
  ctx.beginPath();
  ctx.moveTo(X(BAR_X), Y(BAR_Y1));
  ctx.lineTo(X(BAR_X), Y(BAR_Y0));
  ctx.stroke();
  ctx.strokeStyle = nickel(0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X(BAR_X) - 0.0026 * sc, Y(BAR_Y1));
  ctx.lineTo(X(BAR_X) - 0.0026 * sc, Y(BAR_Y0));
  ctx.moveTo(X(BAR_X) + 0.0026 * sc, Y(BAR_Y1));
  ctx.lineTo(X(BAR_X) + 0.0026 * sc, Y(BAR_Y0));
  ctx.stroke();
  // (the springs: fine coils on the barrel by each hub)
  ctx.strokeStyle = nickel(0.28);
  ctx.beginPath();
  for (const lvx of LEVERS.slice(1)) for (let j = 1; j <= 4; j++) {
    const y = Y(lvx.hub[1] + 0.004 + j * 0.0022);
    ctx.moveTo(X(BAR_X) - 0.0026 * sc, y + 0.0008 * sc);
    ctx.lineTo(X(BAR_X) + 0.0026 * sc, y - 0.0008 * sc);
  }
  ctx.stroke();
  ctx.lineCap = 'round';
  LEVERS.forEach((lvr, k) => {
    const q = lv.press[k];
    // the link: from the lever's arm by the hub to the crank's ball
    const ca = crankAngle(k, q);
    const bx = X(ROT_X) + Math.cos(ca) * CRANK * sc;
    const by = Y(ROT_Y[k]) - Math.sin(ca) * CRANK * sc;
    const hx = X(lvr.hub[0] - 0.006 - 0.003 * q);
    const hy = Y(lvr.hub[1]);
    ctx.strokeStyle = q > 0.05 ? rgba(INK.amber, 0.45 + 0.4 * q) : nickel(0.55);
    ctx.lineWidth = Math.max(1, 0.0018 * sc);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // the paddle: from the hub out to its spoon, foreshortened a little as it goes down
    const fx = 1 - 0.1 * q;
    const tx = lvr.hub[0] + (lvr.tip[0] - lvr.hub[0]) * fx;
    const ty = lvr.hub[1] + (lvr.tip[1] - lvr.hub[1]) * fx;
    const p = paddle(X, Y, lvr.hub, [tx, ty], lvr.w0, lvr.w1);
    ctx.fillStyle = NICKEL_BODY;
    ctx.fill(p);
    const g = ctx.createLinearGradient(0, Y(lvr.hub[1] + lvr.w1), 0, Y(lvr.hub[1] - lvr.w1));
    g.addColorStop(0, nickel(0.55 - 0.2 * q));
    g.addColorStop(0.5, nickel(0.18));
    g.addColorStop(1, nickel(0.08));
    ctx.fillStyle = g;
    ctx.fill(p);
    if (q > 0.01) {
      ctx.fillStyle = rgba(INK.amber, 0.55 * q);
      ctx.fill(p);
    }
    ctx.strokeStyle = q > 0.5 ? rgba(INK.amber, 0.6 + 0.35 * q) : nickel(0.6);
    ctx.lineWidth = 1 + 0.4 * q;
    ctx.stroke(p);
    // the hub on the bar
    ctx.beginPath();
    ctx.arc(X(lvr.hub[0]), Y(lvr.hub[1]), Math.max(1.5, 0.0034 * sc), 0, 2 * Math.PI);
    ctx.fillStyle = '#4a4741';
    ctx.fill();
    ctx.strokeStyle = nickel(0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}
/** a lever's paddle: an arm from the hub widening to a spoon at the tip (rounded) */
export function paddle(X: (x: number) => number, Y: (y: number) => number, hub: P, tip: P, w0: number, w1: number): Path2D {
  const dx = tip[0] - hub[0];
  const dy = tip[1] - hub[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const nx = -uy;
  const ny = ux;
  const at = (s: number, w: number): [number, number] => [X(hub[0] + ux * s + nx * w), Y(hub[1] + uy * s + ny * w)];
  const p = new Path2D();
  const sp = l * 0.52;
  p.moveTo(...at(0, w0));
  p.bezierCurveTo(...at(sp * 0.6, w0), ...at(sp * 0.9, w1 * 0.8), ...at(sp + (l - sp) * 0.35, w1));
  p.bezierCurveTo(...at(l + w1 * 0.3, w1), ...at(l + w1 * 0.3, -w1), ...at(sp + (l - sp) * 0.35, -w1));
  p.bezierCurveTo(...at(sp * 0.9, -w1 * 0.8), ...at(sp * 0.6, -w0), ...at(0, -w0));
  p.closePath();
  return p;
}
/** the lips against the mouthpiece's rim: two cushions, apart by the engine's lip opening (drawn slowed,
 *  exaggerated), the puff of air through them into the cup */
function drawLips(ctx: CanvasRenderingContext2D, L: HnLayout, lv: HnLive, now: number): void {
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const rim = [X(MP_RIM[0]), Y(MP_RIM[1])];
  // (the axis into the cup on the screen, and across it)
  const ux = MP_DIR[0];
  const uy = -MP_DIR[1];
  const nx = uy;
  const ny = -ux;
  const playing = lv.sounding && lv.blow > 0.01;
  const o = playing ? Math.min(1.3, lv.open / Math.max(0.3, lv.swing + 0.2)) : 0;
  const gap = (0.0004 + 0.003 * o) * sc;
  for (const sg of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= 18; i++) {
      const f = i / 18;
      const across = gap / 2 + f * 0.0145 * sc;
      const bulge = (0.0014 + 0.009 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + 0.98 * f)), 0.7)) * sc;
      const qx = rim[0] - ux * bulge + sg * nx * across;
      const qy = rim[1] - uy * bulge + sg * ny * across;
      if (i) ctx.lineTo(qx, qy);
      else ctx.moveTo(qx, qy);
    }
    ctx.fillStyle = playing ? rgba(INK.vermilion, 0.1 + 0.12 * o) : rgba(INK.felt, 0.12);
    ctx.fill();
    ctx.strokeStyle = rgba(INK.felt, 0.7);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rim[0] - ux * 0.0012 * sc + (sg * nx * gap) / 2, rim[1] - uy * 0.0012 * sc + (sg * ny * gap) / 2);
    ctx.lineTo(rim[0] - ux * 0.008 * sc + sg * nx * (gap / 2 + 0.0016 * sc), rim[1] - uy * 0.008 * sc + sg * ny * (gap / 2 + 0.0016 * sc));
    ctx.strokeStyle = playing ? rgba(INK.vermilion, 0.5 + 0.45 * Math.min(1, o)) : rgba(INK.felt, 0.4);
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  if (playing) {
    ctx.strokeStyle = rgba(INK.steel, 0.15 + 0.4 * Math.min(1, o));
    ctx.lineWidth = Math.max(1, gap * 0.7);
    ctx.beginPath();
    ctx.moveTo(rim[0] - ux * 0.002 * sc, rim[1] - uy * 0.002 * sc);
    ctx.lineTo(rim[0] + ux * 0.008 * sc, rim[1] + uy * 0.008 * sc);
    ctx.stroke();
  }
  void now;
}
