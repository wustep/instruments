// The slide trombone on the 2D stage (the classic look): its plan (trombone-plan.ts) drawn at its real
// sizes in metres, lit like the horn and the trumpet beside it (lacquered yellow brass on the dark stage, the
// slide's inner tubes, its sleeves, the rotor caps, the levers and the mouthpiece nickel silver), and its live
// state, shared with the vector display (vector/trombone.ts).
//
// What moves. The outer slide (its two tubes, the crook with its water key and bumper, the hand brace) stands
// out from first position by the engine's own slide (frame.trombone.slide, m: the engine moves it at a
// player's speed between notes; drawn at the drawing's px per metre, eased over a frame or two), baring the
// inner tubes; the seven positions are ticked very faintly under the slide. The thumb's trigger goes down for
// the engine's F valve (and the bass's second lever for its G♭ valve), each on a spring, and lifts a moment
// after the note stops; its link turns the rotor's crank a quarter turn and the rotor (its passages engraved
// on the cap) with it. The air's path (the slide, the valve loops the fingering takes, the tuning slide, the
// bell) is lit, the loops it skips dark; the bore's standing wave (the engine's, with its sign; drawn slowed)
// runs along it from the lips to the bell's rim, where it opens out (the Webster horn's 1/r). The breath goes
// into the mouthpiece as it does on every wind (the reeds' faint streams, stage-draw breathStream), pulsing
// with the engine's own lip opening (its trace, one cycle played back slowed).
// All three sizes are drawn at one px per metre, so the alto stands smaller than the tenor and the bass.
import type { TromboneVisual, VisualFrame } from '@piano-model/engine';
import { SIZES, bellRuns, extent, plan, positionOut, slideRuns, type Down, type P, type Plan, type Run, type Size, type Tube } from './trombone-plan.ts';
import { AutoScale, BRASS_BREATH, INK, boreAt, brassBreath, breathStream, newBoreWave, rgba, slowPhase, spring01, trackBoreWave, type BoreWave } from './stage-draw.ts';

type Box = { x0: number; y0: number; x1: number; y1: number };
export interface TromboneState {
  /** the size the stage or the seat has asked for (the Size knob, the seat's lines), for a frame that does
   *  not say */
  sizeHint?: Size;
  /** where its sound leaves (the bell's mouth: the room's wavefronts start there), px in the box */
  src?: { x: number; y: number };
  wave?: BoreWave;
  /** the wave's reference level: the loudest of the last few seconds, so a note dying away fades */
  waveRef?: AutoScale;
  /** the levers' springs (the F valve's, the G♭ valve's: 0 up, 1 down), the slide as drawn (m, eased
   *  towards the engine's), the clock, how long the breath has been gone (s) */
  mech?: { pos: Float32Array; vel: Float32Array; slide: number; t: number; quiet: number; size: Size };
  /** the lips' opening over one cycle (from the cycle's narrowest), from the engine's trace */
  lips?: { cyc: Float32Array; last: Float32Array | null; ref: number };
  /** where it was last drawn (box px: the whole box the slide moves in, the instrument with its slide as it
   *  stands, the outer slide, the mouthpiece and lips, the bell's mouth, the valves and levers (null: the
   *  alto has none)); the levers held (bit 0 the F valve, bit 1 the G♭ valve); the slide drawn and the
   *  engine's (m), the crook's far end (px), the size, the position and the side (tests, and the review's
   *  close-ups) */
  drawn?: {
    body: Box;
    inst: Box;
    slideBox: Box;
    mouth: Box;
    bell: Box;
    valves: Box | null;
    levers: number;
    slide: number;
    target: number;
    crookX: number;
    pxPerM: number;
    size: Size;
    position: number;
    side: string | null;
  };
}
export const newTromboneState = (): TromboneState => ({});

// ---------------------------------------------------------------- the box: all three sizes at one scale
const EXT = Object.fromEntries(SIZES.map((s) => [s, extent(plan(s))])) as Record<Size, ReturnType<typeof extent>>;
/** the widest and the tallest of the three (m) */
export const TB_W = Math.max(...SIZES.map((s) => EXT[s].x1 - EXT[s].x0));
export const TB_H = Math.max(...SIZES.map((s) => EXT[s].y1 - EXT[s].y0));
/** the box (m) the trombone is drawn in at one px per metre (an ensemble sizes it from the strings' scale):
 *  its length with the slide all the way out over 90 % of the width, its height over 86 % */
export const tromboneBox = (): { w: number; h: number } => ({ w: TB_W / 0.9, h: TB_H / 0.86 });

// ---------------------------------------------------------------- the layout (cached per box and size)
/** a tube in px: its outline, its edges, its lit and shaded bands, its centre line (px) with each point's
 *  distance along it (m), its radius (px) */
export interface TubePx {
  id: string;
  layer: number;
  nickel: boolean;
  body: Path2D;
  edges: Path2D;
  hi: Path2D;
  sh: Path2D;
  xy: Float32Array;
  s: Float32Array;
  r: number;
}
export interface TbLayout {
  key: string;
  W: number;
  H: number;
  top: number;
  sc: number;
  ox: number;
  oy: number;
  size: Size;
  p: Plan;
  /** the bell section's tubes (the loops, the tuning slide, the receiver) */
  tubes: TubePx[];
  byId: Map<string, TubePx>;
  /** the bell: its flare, its edges, the mouth (the rim seen nearly edge on), the band the wave fills, its
   *  lit and shaded bands; its axis (px) and each point's distance from the rim (m) */
  bell: { flare: Path2D; edges: Path2D; mouth: Path2D; inner: Path2D; hi: Path2D; spec: Path2D; shade: Path2D; ax: Float32Array; d: Float32Array };
  /** the inner slide (fixed, nickel silver): its two tubes, the receiver and the cork barrels, its brace,
   *  the slide lock's nut */
  inner: TubePx[];
  innerBrace: TubePx[];
  collars: TubePx[];
  nut: TubePx;
  /** the outer slide at first position (drawn shifted by the slide): its tubes and crook, its sleeves,
   *  the hand brace, the water key, the bumper */
  outer: TubePx;
  outerSleeves: TubePx[];
  handBrace: TubePx[];
  waterKey: TubePx[];
  waterCup: Path2D;
  bumper: Path2D;
  /** the bell section's sleeves (the tuning slide's, the loops'), its braces, the bell brace and its
   *  flange */
  sleeves: TubePx[];
  stays: Path2D;
  bellBrace: TubePx;
  flange: Path2D;
  /** the mouthpiece (its visible part, rim to receiver), its highlight */
  mp: Path2D;
  mpHi: Path2D;
  /** the seven positions (B♭ side: px of the hand brace for each), the ticks' row (px) */
  ticks: number[];
  tickY: number;
}
const layouts = new Map<string, TbLayout>();

/** The layout for a W×H box (the file player's `top` px kept clear at its top) and a size: the widest of
 *  the three sizes, its slide all the way out, as large as fits in 90 % of the width (a phone's narrow stage:
 *  94 %) and 86 % of the height under the player; this size centred in it at that scale. A cell sized by
 *  tromboneBox at the group's px/m draws it at that scale. */
export function tromboneLayout(W: number, H: number, top = 0, size: Size = 'tenor'): TbLayout {
  const key = `${W}x${H}x${top}x${size}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const p = plan(size);
  const e = EXT[size];
  const sc = Math.max(1, Math.min((W * (W < 600 && top > 0 ? 0.94 : 0.9)) / TB_W, ((H - top) * 0.86) / TB_H));
  const ox = W / 2 - ((e.x0 + e.x1) / 2) * sc;
  const oy = top + (H - top) / 2 + ((e.y0 + e.y1) / 2) * sc;
  const X = (x: number) => ox + x * sc;
  const Y = (y: number) => oy - y * sc;
  const tubes = Object.values(p.tubes).map((t) => tubePx(t, X, Y, sc));
  const byId = new Map(tubes.map((t) => [t.id, t]));
  // ---- the bell: the flare about its axis, from its tail at the tuning slide to the rim
  const bp = p.bell.pts;
  const n = bp.length;
  const ax = new Float32Array(2 * n);
  const dd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    dd[i] = p.rimX - bp[i][0];
    ax[2 * i] = X(bp[i][0]);
    ax[2 * i + 1] = Y(bp[i][1]);
  }
  /** a band along the flare between k0·r and k1·r off its axis (+: below it) */
  const band = (k0: number, k1: number) => {
    const q = new Path2D();
    for (let i = 0; i < n; i++) q[i ? 'lineTo' : 'moveTo'](X(bp[i][0]), Y(p.axisY - p.bellR(dd[i]) * k0));
    for (let i = n - 1; i >= 0; i--) q.lineTo(X(bp[i][0]), Y(p.axisY - p.bellR(dd[i]) * k1));
    q.closePath();
    return q;
  };
  const flare = band(-1, 1);
  const edges = new Path2D();
  for (const sg of [-1, 1]) for (let i = 0; i < n; i++) edges[i ? 'lineTo' : 'moveTo'](X(bp[i][0]), Y(p.axisY + sg * p.bellR(dd[i])));
  // the rim seen from a little in front of the bell: a narrow ellipse
  const mouth = new Path2D();
  mouth.ellipse(X(p.rimX), Y(p.axisY), p.R * MOUTH_K * sc, p.R * sc, 0, 0, 2 * Math.PI);
  // the flare's lit top (the light at the upper left), a specular streak along it, its shaded underside;
  // the band the wave fills
  const hi = band(-0.82, -0.2);
  const spec = band(-0.62, -0.46);
  const shade = band(0.4, 0.98);
  const inner = band(-0.42, 0.42);
  // ---- the inner slide: its tubes from the receiver and the slide lock to their stockings
  const inner2 = [
    tubePx({ id: 'innerUp', pts: [[-0.002, 0], [p.xs, 0]], r: p.rIn, layer: 3, nickel: true }, X, Y, sc),
    tubePx({ id: 'innerDown', pts: [[p.xl, -p.sp], [p.xs, -p.sp]], r: p.rIn, layer: 3, nickel: true }, X, Y, sc),
  ];
  /** a short straight nickel-silver tube (a sleeve, a collar, a brace) */
  const nk = (x0: number, y0: number, x1: number, y1: number, r: number) => tubePx({ id: 'nk', pts: [[x0, y0], [x1, y1]], r, layer: 0, nickel: true }, X, Y, sc);
  // the receiver (its ferrule) and the cork barrels where the outer slide rests at first position; the inner
  // slide's brace with its two ferrules; the slide lock's knurled nut on the bell section's receiver
  const collars = [nk(-0.003, 0, 0.012, 0, p.rIn + 0.0016), nk(0.03, 0, p.xo, 0, p.rIn + 0.0012), nk(p.xo - 0.022, -p.sp, p.xo, -p.sp, p.rIn + 0.0012)];
  const innerBrace = [nk(p.xi, -p.rIn, p.xi, -p.sp + p.rIn, 0.0032), nk(p.xi, -p.rIn + 0.001, p.xi, -p.rIn - 0.006, 0.005), nk(p.xi, -p.sp + p.rIn - 0.001, p.xi, -p.sp + p.rIn + 0.006, 0.005)];
  const nut = nk(p.xl - 0.007, -p.sp, p.xl + 0.007, -p.sp, p.rIn + 0.0034);
  // ---- the outer slide at first position: out of its top along the upper tube, round the crook, back
  const r2 = p.sp / 2;
  const crook: P[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI / 2 - (i / 24) * Math.PI;
    crook.push([p.xc + r2 * Math.cos(a), -r2 + r2 * Math.sin(a)]);
  }
  const outer = tubePx({ id: 'outer', pts: [[p.xo, 0], ...crook, [p.xo, -p.sp]], r: p.rOut, layer: 4 }, X, Y, sc);
  // the tops' rings, the crook's sleeves (soldered over the joints), the hand brace with its ferrules
  const outerSleeves: TubePx[] = [];
  for (const y of [0, -p.sp]) outerSleeves.push(nk(p.xo, y, p.xo + 0.007, y, p.rOut + 0.0011), nk(p.xc - 0.024, y, p.xc - 0.001, y, p.rOut + 0.0009));
  const handBrace = [nk(p.xh, -p.rOut, p.xh, -p.sp + p.rOut, 0.0034), nk(p.xh, -p.rOut + 0.001, p.xh, -p.rOut - 0.007, 0.0056), nk(p.xh, -p.sp + p.rOut - 0.001, p.xh, -p.sp + p.rOut + 0.007, 0.0056)];
  // the water key on the crook's lower leg: a lever along it from its hinge, its cork cup on the crook, the
  // spring under it
  const wy = -p.sp - p.rOut;
  const waterKey = [nk(p.xc - 0.032, wy - 0.0026, p.xc + 0.004, wy - 0.0042, 0.0014), nk(p.xc - 0.032, wy - 0.001, p.xc - 0.032, wy - 0.0045, 0.0022)];
  const waterCup = new Path2D();
  waterCup.ellipse(X(p.xc + 0.006), Y(wy - 0.0035), 0.0062 * sc, 0.0034 * sc, 0, 0, 2 * Math.PI);
  // the bumper: a rubber nub on the crook's far end
  const bumper = new Path2D();
  bumper.ellipse(X(p.xc + r2 + p.rOut + 0.0035), Y(-r2), 0.0045 * sc, 0.0068 * sc, 0, 0, 2 * Math.PI);
  // ---- the bell section's sleeves, braces and the bell brace
  const sleeves: TubePx[] = [];
  for (const [a, b] of p.sleeves.slice(0, 1)) sleeves.push(nk(a, p.tsUp, b, p.tsUp, p.rT + 0.0011), nk(a, p.tsLo, b, p.tsLo, p.rT + 0.0011));
  for (const [x, y0, y1] of p.vsleeves) if (y1 - y0 > 0.006) sleeves.push(nk(x, y0, x, y1, p.rT + 0.0011));
  for (const [a, b] of p.sleeves.slice(1)) {
    // (a loop's sleeves, where its legs run straight)
    for (const t of Object.values(p.tubes)) {
      if (t.id === 'tuning' || t.id === 'recv') continue;
      for (let i = 1; i < t.pts.length; i++) {
        const [x0, y0] = t.pts[i - 1];
        const [x1, y1] = t.pts[i];
        if (Math.abs(y1 - y0) > 1e-6) continue;
        const lo = Math.max(Math.min(x0, x1), a);
        const hi2 = Math.min(Math.max(x0, x1), b);
        if (hi2 - lo > 0.004) sleeves.push(nk(lo, y0, hi2, y0, p.rT + 0.0011));
      }
    }
  }
  const stays = new Path2D();
  const stay = (x: number, y0: number, y1: number) => {
    stays.moveTo(X(x), Y(y0));
    stays.lineTo(X(x), Y(y1));
  };
  // a stay across the alto's tuning slide (the YSL-871's); on the tenor, two posts in the F loop's oval
  if (p.size === 'alto') stay(p.tailX - 0.03, p.tsUp - p.rT, p.tsLo + p.rT);
  if (p.size === 'tenor') {
    stay(-0.2, 0.028 - p.rT, -0.021 + p.rT);
    stay(-0.24, -0.021 - p.rT, -0.053 + p.rT);
  }
  const tailR = p.bellR(p.rimX - p.braceX);
  const bellBrace = nk(p.braceX, -p.sp + p.rT, p.braceX, p.axisY - tailR, 0.0034);
  // its flange: a leaf soldered along the bell's tail, pointed at both ends
  const flange = new Path2D();
  const fy = p.axisY - tailR + 0.0014;
  flange.moveTo(X(p.braceX - 0.024), Y(fy));
  flange.quadraticCurveTo(X(p.braceX - 0.008), Y(fy - 0.0012), X(p.braceX - 0.0042), Y(fy - 0.0064));
  flange.lineTo(X(p.braceX + 0.0042), Y(fy - 0.0064));
  flange.quadraticCurveTo(X(p.braceX + 0.008), Y(fy - 0.0012), X(p.braceX + 0.024), Y(fy));
  flange.quadraticCurveTo(X(p.braceX), Y(fy + 0.0016), X(p.braceX - 0.024), Y(fy));
  flange.closePath();
  // ---- the mouthpiece: its outline from the rim to where it goes into the receiver
  const mp = new Path2D();
  const mpHi = new Path2D();
  const vis = p.mpProfile.filter(([, s]) => s <= p.mpVis + 0.0005);
  const xs = (s: number) => X(-p.mpVis + s);
  vis.forEach(([r, s], i) => mp[i ? 'lineTo' : 'moveTo'](xs(s), Y(r)));
  mp.lineTo(xs(p.mpVis + 0.001), Y(vis[vis.length - 1][0]));
  mp.lineTo(xs(p.mpVis + 0.001), Y(-vis[vis.length - 1][0]));
  for (let i = vis.length - 1; i >= 0; i--) mp.lineTo(xs(vis[i][1]), Y(-vis[i][0]));
  mp.closePath();
  vis.forEach(([r, s], i) => mpHi[i ? 'lineTo' : 'moveTo'](xs(s), Y(r * 0.5)));
  // ---- the positions' ticks: the hand brace's place for each position on the slide alone
  const ticks = Array.from({ length: 7 }, (_, k) => X(p.xh + positionOut(size, k + 1)));
  const tickY = Y(-p.sp - p.rOut - 0.009);
  const L: TbLayout = {
    key, W, H, top, sc, ox, oy, size, p, tubes, byId,
    bell: { flare, edges, mouth, inner, hi, spec, shade, ax, d: dd },
    inner: inner2, innerBrace, collars, nut, outer, outerSleeves, handBrace, waterKey, waterCup, bumper,
    sleeves, stays, bellBrace, flange, mp, mpHi, ticks, tickY,
  };
  if (layouts.size > 12) layouts.clear();
  layouts.set(key, L);
  return L;
}
/** how much of the bell's mouth shows (the rim's ellipse, minor over major: seen from a little in front) */
export const MOUTH_K = 0.1;

/** a tube in px: its outline (from its centre line and radius), its edges and its lit and shaded bands */
function tubePx(t: Tube, X: (x: number) => number, Y: (y: number) => number, sc: number): TubePx {
  const pts = t.pts;
  const n = pts.length;
  const xy = new Float32Array(2 * n);
  const s = new Float32Array(n);
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
    const ri = t.r;
    xy[2 * i] = X(pts[i][0]);
    xy[2 * i + 1] = Y(pts[i][1]);
    A.push([X(pts[i][0] + nx * ri), Y(pts[i][1] + ny * ri)]);
    B.push([X(pts[i][0] - nx * ri), Y(pts[i][1] - ny * ri)]);
    // the light from the upper left: the lit band on the side facing it, the shade on the other
    const lit = Math.max(-1, Math.min(1, (nx * -0.45 + ny * 0.89) * 3));
    HI.push([X(pts[i][0] + lit * nx * ri * 0.42), Y(pts[i][1] + lit * ny * ri * 0.42)]);
    SH.push([X(pts[i][0] - lit * nx * ri * 0.62), Y(pts[i][1] - lit * ny * ri * 0.62)]);
  }
  const body = new Path2D();
  [...A, ...[...B].reverse()].forEach(([x, y], i) => (i ? body.lineTo(x, y) : body.moveTo(x, y)));
  body.closePath();
  const edges = new Path2D();
  const hi = new Path2D();
  const sh = new Path2D();
  for (const [q, arr] of [[edges, A], [edges, B], [hi, HI], [sh, SH]] as const) arr.forEach(([x, y], i) => (i ? q.lineTo(x, y) : q.moveTo(x, y)));
  // (a sleeve or a ferrule: its ends too)
  if (t.nickel && n === 2)
    for (const i of [0, 1]) {
      edges.moveTo(A[i][0], A[i][1]);
      edges.lineTo(B[i][0], B[i][1]);
    }
  return { id: t.id, layer: t.layer, nickel: !!t.nickel, body, edges, hi, sh, xy, s, r: t.r * sc };
}

// ---------------------------------------------------------------- the live state (both styles)
export interface TbLive {
  size: Size;
  p: Plan;
  /** the slide as drawn and where the engine has it (m out from first position; or where it is heading, from
   *  a frame that does not carry the slide) */
  slide: number;
  target: number;
  /** the valves held (the F valve, the G♭ valve) and each lever's travel (0 up, 1 down), on its spring */
  down: Down;
  press: number[];
  /** the air's path for the slide and the valves held (the open tube's at rest) */
  air: { runs: Run[]; total: number; starts: number[] };
  /** the position and the side (null: nothing held) */
  position: number;
  side: string | null;
  /** the wave: its level (0..1 of the recent loudest), slow phase (−1..1), the pressure at s m along the path
   *  (the engine's, with the bell's 1/r) */
  lvl: number;
  ph: number;
  sounding: boolean;
  ampAt: (s: number) => number;
  /** the lips' opening now (drawn slowed; about 1 at a loud note's widest), the blowing pressure (kPa), the
   *  lips' swing over the cycle */
  open: number;
  blow: number;
  swing: number;
}
const CYC = 32;
const bellCache = new Map<string, Run[]>();
const bellOf = (p: Plan, down: Down): Run[] => {
  const k = `${p.size}${+down[0]}${+down[1]}`;
  let r = bellCache.get(k);
  if (!r) bellCache.set(k, (r = bellRuns(p, down)));
  return r;
};

/** the trombone's part of a frame: the engine's own (frame.trombone), or, from a host that does not pass it
 *  on, read off the frame's caption ("F valve · position 6 · partial 2") and its tube's length (the side's
 *  open tube lengthened by the position's semitones: the slide stands out half of what it adds); the slide
 *  itself then unknown (NaN: the drawing moves it at the engine's speed) */
export function tromboneOf(fr: VisualFrame | null, hint: Size = 'tenor'): TromboneVisual | null {
  if (fr?.trombone) return fr.trombone;
  const meta = fr?.excite?.meta ?? '';
  const m = /position (\d+)/.exec(meta);
  const L = fr?.focus?.lengthM ?? 0;
  if (!m || !(L > 0)) return null;
  const position = Number(m[1]);
  const side = /G♭ valves/.test(meta) ? 'D' : /F valve/.test(meta) ? 'F' : 'Bb';
  const lower = position - 1;
  const sideLower = side === 'D' ? 8 : side === 'F' ? 5 : 0;
  const open = L / Math.pow(2, (sideLower + lower) / 12);
  const size: Size = side === 'D' ? 'bass' : open < 2.4 ? 'alto' : hint === 'bass' ? 'bass' : 'tenor';
  const partial = /pedal/.test(meta) ? 1 : Number(/partial (\d+)/.exec(meta)?.[1] ?? 0);
  return { size, slide: NaN, target: (L * (1 - Math.pow(2, -lower / 12))) / 2, position, valves: side === 'D' ? [1, 2] : side === 'F' ? [1] : [], side: size === 'alto' ? 'Eb' : side, partial };
}
/** the slide's top speed (m/s), the engine's (core/trombone.ts SLIDE_SPEED) */
const SLIDE_SPEED = 4;

/** the frame into the drawing's live state (the same for both styles: a change of style carries it) */
export function tromboneLive(fr: VisualFrame | null, st: TromboneState, now: number): TbLive {
  const tb = tromboneOf(fr, st.sizeHint);
  const size: Size = tb?.size ?? st.mech?.size ?? st.sizeHint ?? 'tenor';
  const p = plan(size);
  const focus = fr?.focus ?? null;
  const blow = fr?.lips?.blow ?? 0;
  // ---- the standing wave along the bore (lips 0 → rim 1)
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = (st.waveRef ??= new AutoScale(1e-6, 0.997)).of(peak);
  const lvl = Math.min(1, peak / scale);
  // ---- the slide (the engine's, eased over a frame or two: frames come at about 30 Hz), the levers (held
  // while the note is blown and a moment after, then they lift)
  const mc = (st.mech ??= { pos: new Float32Array(2), vel: new Float32Array(2), slide: 0, t: now, quiet: 10, size });
  const dt = Math.min(0.1, Math.max(0, (now - mc.t) / 1000));
  mc.t = now;
  const known = tb && Number.isFinite(tb.slide);
  const target = Math.max(0, Math.min(p.travel, (known ? tb.slide : tb?.target) ?? 0));
  if (mc.size !== size) {
    mc.size = size;
    mc.slide = target;
  } else if (known) mc.slide += (target - mc.slide) * (1 - Math.exp(-dt / 0.03));
  else mc.slide += Math.max(-SLIDE_SPEED * dt, Math.min(SLIDE_SPEED * dt, (target - mc.slide) * (1 - Math.exp(-dt / 0.02))));
  mc.quiet = blow > 0.05 || (lvl > 0.04 && blow > 0.005) ? 0 : mc.quiet + dt;
  const held = !!tb && mc.quiet < 0.8;
  const down: Down = [held && tb!.valves.includes(1), held && tb!.valves.includes(2)];
  // (a rotary valve's trigger: quick, with a small bounce off its stop)
  const press = [0, 1].map((k) => spring01(mc.pos, mc.vel, k, down[k] ? 1 : 0, dt, 22, 0.6));
  // ---- the air's path: the slide's runs as it stands, the bell section's for the valves held
  const runs = [...slideRuns(p, mc.slide), ...bellOf(p, down)];
  const starts: number[] = [];
  let total = 0;
  for (const r of runs) {
    starts.push(total);
    total += r.len;
  }
  const ph = Math.cos(slowPhase(focus?.f1 ?? 175, now));
  const bellStart = starts[starts.length - 1];
  const bellLen = total - bellStart;
  const tailR = p.bellR(bellLen);
  const ampAt = (s: number): number => {
    // in the bell's flare the pressure spreads over the widening mouth: p = ψ/r
    const taper = s > bellStart ? tailR / p.bellR(total - s) : 1;
    return (boreAt(w.amp, s / total) / scale) * taper;
  };
  // ---- the lips: their opening over a cycle, from the cycle's narrowest, played back on the wave's clock
  const lp = (st.lips ??= { cyc: new Float32Array(CYC), last: null, ref: 1 });
  const e = fr?.excite;
  const tr = e?.trace;
  const f1 = focus?.f1 ?? 175;
  if (e && tr && tr !== lp.last && focus && blow > 0.05) {
    lp.last = tr;
    const P = (e.rate || 48000) / f1;
    if (P >= 4 && tr.length >= 2 * P + 2) {
      let i0 = Math.floor(tr.length - 2 * P);
      let lo = Infinity;
      for (let i = i0; i < tr.length - P - 1; i++)
        if (tr[i] < lo) {
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
  } else if (!(blow > 0.05)) {
    // the breath gone: the lips close
    const k = 1 - Math.exp(-dt / 0.06);
    for (let i = 0; i < CYC; i++) lp.cyc[i] *= 1 - k;
  }
  const th = ((((slowPhase(f1, now) * 1.6) / (2 * Math.PI)) % 1) + 1) % 1;
  const ci = th * CYC;
  const c0 = Math.floor(ci) % CYC;
  const open = lp.cyc[c0] + (lp.cyc[(c0 + 1) % CYC] - lp.cyc[c0]) * (ci - Math.floor(ci));
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < CYC; i++) {
    lo = Math.min(lo, lp.cyc[i]);
    hi = Math.max(hi, lp.cyc[i]);
  }
  return {
    size, p, slide: mc.slide, target, down, press, air: { runs, total, starts }, position: held ? tb!.position : 0, side: held ? tb!.side : null,
    lvl, ph, sounding: !!focus && lvl > 0.02 && held, ampAt, open, blow, swing: Math.max(0, hi - lo),
  };
}

/** record where it was drawn (and the levers held) and where its sound leaves */
export function tromboneRecord(L: TbLayout, st: TromboneState, lv: TbLive): void {
  const { p, sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0: X(x0), y0: Y(y1), x1: X(x1), y1: Y(y0) });
  const e = EXT[L.size];
  const s = lv.slide;
  const far = p.xc + s + p.sp / 2 + p.rOut + 0.0085;
  const r0 = p.rotors[0];
  st.drawn = {
    body: box(e.x0, e.y0, e.x1, e.y1),
    inst: box(e.x0, e.y0, far, e.y1),
    slideBox: box(p.xo + s, -p.sp - p.rOut - 0.008, far, p.rOut + 0.002),
    mouth: box(-p.mpVis - 0.03, -0.035, -p.mpVis + 0.05, 0.035),
    bell: box(p.rimX - 0.08, p.axisY - p.R - 0.01, p.rimX + 0.03, p.axisY + p.R + 0.01),
    valves: r0 ? box(Math.min(...p.rotors.map((r) => r.c[0])) - 0.03, -p.sp + 0.002, p.braceX + 0.05, Math.max(...p.rotors.map((r) => r.c[1])) + 0.03) : null,
    levers: (lv.down[0] ? 1 : 0) | (lv.down[1] ? 2 : 0),
    slide: s,
    target: lv.target,
    crookX: X(p.xc + s + p.sp / 2 + p.rOut),
    pxPerM: sc,
    size: L.size,
    position: lv.position,
    side: lv.side,
  };
  st.src = { x: X(p.rimX + 0.01), y: Y(p.axisY) };
}

// ---------------------------------------------------------------- the trigger levers (plan, m)
/** each valve's thumb lever: its pivot on the bell brace, its arm out to the paddle (a hook the thumb pulls
 *  down), its arm back to the link; how far a press turns it (radians) */
export function leverOf(p: Plan, k: number): { pivot: P; paddle: P[]; back: P; turn: number } {
  // (the bass's second lever beside the first, a little lower and farther out)
  const ox = 0.007 * k;
  const y = -0.024 - 0.005 * k;
  const pivot: P = [p.braceX + 0.002, y];
  // the hook (the YSL-620's): out along the slide from the brace, down and round, its spoon back under the
  // thumb
  const paddle: P[] = [
    [pivot[0] + 0.02 + ox, y],
    [pivot[0] + 0.027 + ox, y - 0.005],
    [pivot[0] + 0.03 + ox, y - 0.016],
    [pivot[0] + 0.027 + ox, y - 0.025],
    [pivot[0] + 0.02 + ox, y - 0.028],
    [pivot[0] + 0.011 + ox, y - 0.027],
  ];
  return { pivot, paddle, back: [pivot[0] - 0.013, y], turn: (14 * Math.PI) / 180 };
}
/** a point of a lever turned by its press (about its pivot; the paddle goes down) */
export const turned = (q: P, pivot: P, a: number): P => {
  const c = Math.cos(-a);
  const s = Math.sin(-a);
  const dx = q[0] - pivot[0];
  const dy = q[1] - pivot[1];
  return [pivot[0] + dx * c - dy * s, pivot[1] + dx * s + dy * c];
};
/** a rotor's crank (from its spindle, at rest: towards its lever's back arm) and its angle for a press */
export const CRANK = 0.0105;
export const crankAngle = (p: Plan, k: number, press: number): number => {
  const r = p.rotors[k];
  const b = leverOf(p, k).back;
  return Math.atan2(b[1] - r.c[1], b[0] - r.c[0]) - (Math.PI / 2) * press;
};

// ---------------------------------------------------------------- the classic drawing
// lacquered yellow brass on the dark stage (the horn's and the trumpet's), nickel silver
const BRASS_BODY = '#4a3416';
const BRASS_DEEP = '#2a1d0c';
const NICKEL_BODY = '#3c3a36';
/** a polished nickel-silver tube's body (the slide's inner tubes, the sleeves, the braces) */
const NICKEL_TUBE = '#55534e';
const nickel = (a: number) => rgba('236,230,216', a);
const waveInk = (v: number) => (v >= 0 ? INK.vermilion : INK.steel);

/** The slide trombone from the player's right: the bell section (the tuning slide, the valve loops, the
 *  bell), the rotors and the thumb's levers, the inner slide and the outer slide standing out by the engine's
 *  slide, the mouthpiece with the breath going into it; the air's path lit and the standing wave along it.
 *  `top`: the file player's px over the box's top. */
export function drawTrombone(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TromboneState, top = 0): void {
  const now = performance.now();
  const lv = tromboneLive(fr, st, now);
  const L = tromboneLayout(W, H, top, lv.size);
  const { sc, p } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const onPath = new Set(lv.air.runs.map((r) => r.id));
  const dx = lv.slide * sc;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const tube = (t: TubePx, on: boolean) => {
    if (t.nickel) {
      // nickel silver, polished: a cool grey body, its shaded underside, a broad sheen and a bright streak
      // along its lit side
      ctx.fillStyle = NICKEL_TUBE;
      ctx.fill(t.body);
      ctx.strokeStyle = 'rgba(10,10,12,0.32)';
      ctx.lineWidth = Math.max(1, 0.5 * t.r);
      ctx.stroke(t.sh);
      ctx.strokeStyle = nickel(0.32);
      ctx.lineWidth = Math.max(1, 0.7 * t.r);
      ctx.stroke(t.hi);
      ctx.strokeStyle = nickel(0.78);
      ctx.lineWidth = Math.max(0.7, 0.16 * t.r);
      ctx.stroke(t.hi);
      ctx.strokeStyle = nickel(0.62);
      ctx.lineWidth = 1;
      ctx.stroke(t.edges);
      return;
    }
    ctx.fillStyle = on ? BRASS_BODY : BRASS_DEEP;
    ctx.fill(t.body);
    ctx.strokeStyle = rgba(INK.amber, on ? 0.16 : 0.08);
    ctx.lineWidth = Math.max(1, 0.42 * t.r);
    ctx.stroke(t.sh);
    ctx.strokeStyle = rgba(INK.amber, on ? 0.36 : 0.2);
    ctx.lineWidth = Math.max(0.8, 0.22 * t.r);
    ctx.stroke(t.hi);
    ctx.strokeStyle = rgba(INK.amber, on ? 0.72 : 0.42);
    ctx.lineWidth = 1;
    ctx.stroke(t.edges);
  };
  const nickelBand = (path: Path2D, a = 1) => {
    ctx.fillStyle = NICKEL_BODY;
    ctx.fill(path);
    ctx.fillStyle = nickel(0.16 * a);
    ctx.fill(path);
    ctx.strokeStyle = nickel(0.6 * a);
    ctx.lineWidth = 1;
    ctx.stroke(path);
  };
  // ---- the bell section, farthest first: the valve loops, the tuning slide (and the bell's tail out of it)
  for (let layer = 0; layer <= 2; layer++)
    for (const t of L.tubes) {
      if (t.layer !== layer) continue;
      const on = onPath.has(t.id);
      tube(t, on);
      if (layer < 1) {
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fill(t.body);
      }
      if (on && lv.sounding) glowRun(ctx, L, lv, t.id, 0);
    }
  for (const t of L.sleeves) tube(t, true);
  ctx.strokeStyle = rgba(INK.amber, 0.42);
  ctx.lineWidth = Math.max(1, 0.0045 * sc);
  ctx.lineCap = 'butt';
  ctx.stroke(L.stays);
  ctx.lineCap = 'round';
  // ---- the bell: its tail and flare, the lacquer's light, the wave inside, the mouth and its rolled rim
  {
    const B = L.bell;
    ctx.fillStyle = BRASS_BODY;
    ctx.fill(B.flare);
    const n2 = B.ax.length / 2 - 1;
    const g = ctx.createLinearGradient(B.ax[0], B.ax[1], B.ax[2 * n2], B.ax[2 * n2 + 1]);
    g.addColorStop(0, rgba(INK.amber, 0.12));
    g.addColorStop(0.6, rgba(INK.amber, 0.2));
    g.addColorStop(1, rgba(INK.amber, 0.34));
    ctx.fillStyle = g;
    ctx.fill(B.hi);
    ctx.fillStyle = rgba('255,226,160', 0.16);
    ctx.fill(B.spec);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill(B.shade);
    ctx.strokeStyle = rgba(INK.amber, 0.74);
    ctx.lineWidth = 1.1;
    ctx.stroke(B.edges);
    if (lv.sounding) bellGlow(ctx, L, lv);
    // the inside of the mouth: the far wall lit at its rim, dark down the throat
    const cx = X(p.rimX);
    const cy = Y(p.axisY);
    const gm = ctx.createRadialGradient(cx - p.R * 0.6 * sc, cy, 0, cx, cy, p.R * sc);
    gm.addColorStop(0, '#0c0804');
    gm.addColorStop(0.45, '#2a1d0c');
    gm.addColorStop(0.85, '#6a4c1c');
    gm.addColorStop(1, '#8a6626');
    ctx.fillStyle = gm;
    ctx.fill(B.mouth);
    if (lv.sounding) {
      const A = Math.min(1, Math.abs(lv.ampAt(lv.air.total - 0.001)));
      ctx.fillStyle = rgba(INK.vermilion, 0.1 + 0.22 * A * lv.lvl);
      ctx.fill(B.mouth);
    }
    ctx.strokeStyle = rgba(INK.amber, 0.88);
    ctx.lineWidth = Math.max(1.3, 0.0032 * sc);
    ctx.stroke(B.mouth);
    ctx.strokeStyle = rgba('255,236,190', 0.45);
    ctx.lineWidth = Math.max(0.8, 0.0012 * sc);
    ctx.stroke(B.mouth);
  }
  // ---- the bell brace and its flange on the bell's tail
  nickelBand(L.flange, 0.8);
  tube(L.bellBrace, true);
  // ---- the receiver into the rotor (or the alto's neckpipe), the rotors, their cranks, links and levers
  for (const t of L.tubes) {
    if (t.layer !== 3) continue;
    tube(t, onPath.has(t.id));
    if (onPath.has(t.id) && lv.sounding) glowRun(ctx, L, lv, t.id, 0);
  }
  p.rotors.forEach((r, k) => drawRotor(ctx, L, r, k, lv));
  drawLevers(ctx, L, lv);
  // ---- the inner slide (nickel silver), its brace, the receiver's ferrule and the cork barrels, the nut
  for (const t of L.inner) tube(t, true);
  for (const t of L.collars) tube(t, true);
  for (const t of L.innerBrace) tube(t, true);
  tube(L.nut, true);
  ctx.save();
  ctx.clip(L.nut.body);
  ctx.strokeStyle = 'rgba(20,18,16,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = L.nut.xy[0] + 2; x < L.nut.xy[2]; x += 2.5) {
    ctx.moveTo(x, L.nut.xy[1] - L.nut.r);
    ctx.lineTo(x, L.nut.xy[1] + L.nut.r);
  }
  ctx.stroke();
  ctx.restore();
  // ---- the seven positions, ticked faintly under the slide (the hand brace stands over its tick)
  {
    const tl = Math.max(2, 0.006 * sc);
    ctx.lineWidth = 1;
    ctx.lineCap = 'butt';
    for (let k = 0; k < 7; k++) {
      const on = lv.sounding && lv.position === k + 1 && (lv.side === 'Bb' || lv.side === 'Eb');
      ctx.strokeStyle = on ? rgba(INK.amber, 0.55) : rgba(INK.ivory, 0.13);
      ctx.beginPath();
      ctx.moveTo(L.ticks[k], L.tickY);
      ctx.lineTo(L.ticks[k], L.tickY + tl);
      ctx.stroke();
    }
    ctx.lineCap = 'round';
  }
  // ---- the outer slide, where the engine has it: its tubes and crook, the sleeves, the hand brace, the
  // water key, the bumper
  ctx.save();
  ctx.translate(dx, 0);
  tube(L.outer, true);
  for (const t of L.outerSleeves) tube(t, true);
  for (const t of L.handBrace) tube(t, true);
  ctx.fillStyle = '#2c2622';
  ctx.fill(L.bumper);
  ctx.strokeStyle = 'rgba(150,140,128,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke(L.bumper);
  for (const t of L.waterKey) tube(t, true);
  ctx.fillStyle = '#56524a';
  ctx.fill(L.waterCup);
  ctx.strokeStyle = nickel(0.65);
  ctx.lineWidth = 1;
  ctx.stroke(L.waterCup);
  ctx.restore();
  // the wave along the slide (on the tubes as they stand)
  if (lv.sounding) for (const id of ['up', 'crook', 'down']) glowRun(ctx, L, lv, id, id === 'up' ? p.rIn : p.rOut);
  // ---- the mouthpiece (silver plate), the breath going into it
  ctx.fillStyle = NICKEL_BODY;
  ctx.fill(L.mp);
  {
    const x = X(-p.mpVis + 0.012);
    const r = p.mpProfile[3][0];
    const gm = ctx.createLinearGradient(x, Y(r), x, Y(-r));
    gm.addColorStop(0, nickel(0.08));
    gm.addColorStop(0.28, nickel(0.48));
    gm.addColorStop(0.55, nickel(0.14));
    gm.addColorStop(1, nickel(0.04));
    ctx.fillStyle = gm;
    ctx.fill(L.mp);
  }
  ctx.strokeStyle = nickel(0.34);
  ctx.lineWidth = Math.max(1, 0.002 * sc);
  ctx.stroke(L.mpHi);
  ctx.strokeStyle = nickel(0.66);
  ctx.lineWidth = 1.1;
  ctx.stroke(L.mp);
  drawBreath(ctx, L, lv, now);
  ctx.restore();
  tromboneRecord(L, st, lv);
}

/** the wave along a run of the air's path (a tube of the bell section, or the slide's runs as they stand):
 *  its envelope (vermilion, by strength) and its sign (warm compression, cool rarefaction), drawn slowed */
function glowRun(ctx: CanvasRenderingContext2D, L: TbLayout, lv: TbLive, id: string, rTube: number): void {
  const runs = lv.air.runs;
  const ri = runs.findIndex((r) => r.id === id);
  if (ri < 0) return;
  const run = runs[ri];
  const { sc } = L;
  const s0 = lv.air.starts[ri];
  const rp = Math.max(1, (rTube || L.p.rT) * sc);
  const wc = Math.max(1, Math.round(rp * 0.9));
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  // (sampled every few px along the run)
  const step = Math.max(2, 3 / sc);
  const env = new Map<number, Path2D>();
  const sgn = new Map<number, Path2D>();
  let lastE = -1;
  let lastK = 0;
  let s = 0;
  const geo = run.pts.reduce((a, q, i) => (i ? a + Math.hypot(q[0] - run.pts[i - 1][0], q[1] - run.pts[i - 1][1]) : 0), 0);
  const k = geo > 0 ? run.len / geo : 1;
  let px = X(run.pts[0][0]);
  let py = Y(run.pts[0][1]);
  for (let i = 1; i < run.pts.length; i++) {
    const a = run.pts[i - 1];
    const b = run.pts[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nseg = Math.max(1, Math.ceil(l / step));
    for (let j = 1; j <= nseg; j++) {
      const f = j / nseg;
      const qx = X(a[0] + (b[0] - a[0]) * f);
      const qy = Y(a[1] + (b[1] - a[1]) * f);
      const sm = s0 + (s + (l * (j - 0.5)) / nseg) * k;
      const A = lv.ampAt(sm);
      const v = A * lv.ph;
      const e = Math.round(Math.min(10, 10 * Math.pow(Math.abs(A), 1.5)));
      const ke = e ? e * 1000 + wc : 0;
      if (ke) {
        let q = env.get(ke);
        if (!q) env.set(ke, (q = new Path2D()));
        if (ke !== lastE) q.moveTo(px, py);
        q.lineTo(qx, qy);
      }
      lastE = ke;
      const av = Math.round(Math.min(10, 10 * Math.pow(Math.abs(v), 1.2)));
      const kk = av ? (v >= 0 ? 1 : -1) * (av * 1000 + wc) : 0;
      if (kk) {
        let q = sgn.get(kk);
        if (!q) sgn.set(kk, (q = new Path2D()));
        if (kk !== lastK) q.moveTo(px, py);
        q.lineTo(qx, qy);
      }
      lastK = kk;
      px = qx;
      py = qy;
    }
    s += l;
  }
  ctx.save();
  ctx.lineCap = 'butt';
  for (const [key, q] of env) {
    ctx.strokeStyle = rgba(INK.vermilion, (Math.floor(key / 1000) / 10) * 0.2);
    ctx.lineWidth = 2.1 * (key % 1000);
    ctx.stroke(q);
  }
  for (const [key, q] of sgn) {
    const a = Math.abs(key);
    ctx.strokeStyle = rgba(key > 0 ? INK.vermilion : INK.steel, (Math.floor(a / 1000) / 10) * 0.46);
    ctx.lineWidth = 1.24 * (a % 1000);
    ctx.stroke(q);
  }
  ctx.restore();
}
/** the wave in the bell: a gradient along its axis inside the flare */
function bellGlow(ctx: CanvasRenderingContext2D, L: TbLayout, lv: TbLive): void {
  const B = L.bell;
  const n = B.d.length;
  const sB = lv.air.starts[lv.air.starts.length - 1];
  const len = lv.air.total - sB;
  const ge = ctx.createLinearGradient(B.ax[0], B.ax[1], B.ax[2 * (n - 1)], B.ax[2 * (n - 1) + 1]);
  const gw = ctx.createLinearGradient(B.ax[0], B.ax[1], B.ax[2 * (n - 1)], B.ax[2 * (n - 1) + 1]);
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
/** a rotor seen end on: its brass casing, the nickel cap with its bevel and centre screw, the rotor's two
 *  passages engraved (turned a quarter turn by its lever; lit while the air goes through the loop), its
 *  crank and ball */
function drawRotor(ctx: CanvasRenderingContext2D, L: TbLayout, r: { c: P; R: number; cap: number }, k: number, lv: TbLive): void {
  const { sc } = L;
  const cx = L.ox + r.c[0] * sc;
  const cy = L.oy - r.c[1] * sc;
  const R = r.R * sc;
  const rc = r.cap * sc;
  const press = lv.press[k];
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.fillStyle = BRASS_BODY;
  ctx.fill();
  ctx.strokeStyle = rgba(INK.amber, 0.75);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rc, 0, 2 * Math.PI);
  const g = ctx.createRadialGradient(cx - rc * 0.35, cy - rc * 0.4, rc * 0.1, cx, cy, rc);
  g.addColorStop(0, '#a29d93');
  g.addColorStop(0.5, '#5e5a52');
  g.addColorStop(1, '#2e2c28');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = nickel(0.65);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, rc * 0.74, 0, 2 * Math.PI);
  ctx.strokeStyle = nickel(0.22);
  ctx.stroke();
  // the passages: two arcs across the rotor, turned with it (lit while the air goes round the loop)
  const a = (Math.PI / 2) * press;
  const lit = lv.sounding && lv.down[k] ? 0.35 + 0.45 * lv.lvl : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.lineWidth = Math.max(1, rc * 0.13);
  for (const sg of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sg * rc * 0.95, 0, rc * 0.62, sg > 0 ? Math.PI * 0.62 : -Math.PI * 0.38, sg > 0 ? Math.PI * 1.38 : Math.PI * 0.38);
    ctx.strokeStyle = 'rgba(14,12,10,0.7)';
    ctx.stroke();
    if (lit) {
      ctx.strokeStyle = rgba(INK.vermilion, lit * 0.6);
      ctx.lineWidth = Math.max(0.8, rc * 0.07);
      ctx.stroke();
      ctx.lineWidth = Math.max(1, rc * 0.13);
    }
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, cy, rc * 0.2, 0, 2 * Math.PI);
  ctx.fillStyle = '#8a857b';
  ctx.fill();
}
/** each valve's lever: the link from its back arm to the rotor's crank, the crank, the lever on its pivot on
 *  the bell brace with its spring, the hook the thumb pulls (amber while held down) */
function drawLevers(ctx: CanvasRenderingContext2D, L: TbLayout, lv: TbLive): void {
  const { sc, p } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  p.rotors.forEach((r, k) => {
    const q = lv.press[k];
    const lvr = leverOf(p, k);
    const a = lvr.turn * q;
    const back = turned(lvr.back, lvr.pivot, a);
    const ca = crankAngle(p, k, q);
    const bx = r.c[0] + Math.cos(ca) * CRANK;
    const by = r.c[1] + Math.sin(ca) * CRANK;
    // the crank and the link
    ctx.strokeStyle = q > 0.05 ? rgba(INK.amber, 0.5 + 0.4 * q) : nickel(0.7);
    ctx.lineWidth = Math.max(1.2, 0.0024 * sc);
    ctx.beginPath();
    ctx.moveTo(X(r.c[0]), Y(r.c[1]));
    ctx.lineTo(X(bx), Y(by));
    ctx.stroke();
    ctx.lineWidth = Math.max(1, 0.0016 * sc);
    ctx.strokeStyle = q > 0.05 ? rgba(INK.amber, 0.45 + 0.4 * q) : nickel(0.5);
    ctx.beginPath();
    ctx.moveTo(X(bx), Y(by));
    ctx.lineTo(X(back[0]), Y(back[1]));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(bx), Y(by), Math.max(1.2, 0.002 * sc), 0, 2 * Math.PI);
    ctx.fillStyle = '#6a665e';
    ctx.fill();
    // the lever: its back arm, the pivot, the arm out and the hook, its spoon under the thumb
    const hook = lvr.paddle.map((x) => turned(x, lvr.pivot, a));
    const pts = [back, lvr.pivot, ...hook];
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = Math.max(2.4, 0.0046 * sc);
    ctx.stroke();
    ctx.strokeStyle = q > 0.5 ? rgba(INK.amber, 0.55 + 0.35 * q) : nickel(0.55);
    ctx.lineWidth = Math.max(1.6, 0.0032 * sc);
    ctx.stroke();
    ctx.strokeStyle = nickel(0.35);
    ctx.lineWidth = Math.max(0.6, 0.0011 * sc);
    ctx.stroke();
    {
      const e = hook[hook.length - 1];
      const f = hook[hook.length - 2];
      ctx.save();
      ctx.translate(X(e[0]), Y(e[1]));
      ctx.rotate(Math.atan2(-(e[1] - f[1]), e[0] - f[0]));
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.0052 * sc, 0.0026 * sc, 0, 0, 2 * Math.PI);
      ctx.fillStyle = q > 0.5 ? rgba(INK.amber, 0.5 + 0.3 * q) : '#5a564e';
      ctx.fill();
      ctx.strokeStyle = nickel(0.6);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    // the spring's coil at the pivot, the pivot screw
    ctx.beginPath();
    ctx.arc(X(lvr.pivot[0]), Y(lvr.pivot[1]), Math.max(1.6, 0.0034 * sc), 0, 2 * Math.PI);
    ctx.fillStyle = '#4a4741';
    ctx.fill();
    ctx.strokeStyle = nickel(0.6);
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}
/** the breath into the mouthpiece while the note is blown: the reeds' streams (stage-draw breathStream),
 *  converging on the lips' aperture at the rim's middle, pulsing with the lips' opening (drawn slowed) */
function drawBreath(ctx: CanvasRenderingContext2D, L: TbLayout, lv: TbLive, now: number): void {
  if (!(lv.sounding && lv.blow > 0.05)) return;
  const { sc, p } = L;
  const rx = L.ox - p.mpVis * sc;
  const ry = L.oy;
  const o = lv.open / Math.max(0.3, lv.swing + 0.2);
  breathStream(ctx, (a, w) => [rx - a * sc, ry + w * sc], sc, BRASS_BREATH, brassBreath(lv.lvl, o), now);
}
