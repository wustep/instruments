// The horn on the 2D stage (the drawn look): its plan (horn-plan.ts) drawn at its real sizes in metres, an
// object in the studio's daylight as the trumpet beside it (lacquered yellow brass lit from the upper left,
// nickel-silver rotor caps, ferrules, levers and mouthpiece, one soft shadow on the floor), and its live
// state, shared with the vector display (vector/horn.ts).
//
// What moves. The thumb's change valve and valves 1–3 go down for the engine's note by its own fingering
// (hornFingering: the F horn to C4, the B♭ horn from C♯4), each lever on a spring, and back up a moment
// after the note stops: the paddle goes down under the finger, its link turns the rotor's crank a quarter
// turn, and the rotor (its two passages engraved on the cap) turns with it; what is held is ink. The bore's
// standing wave (the engine's, with its sign; drawn slowed) runs in the blue along the air's path (the
// side's loop and the pressed valves' slides) from the lips to the bell's rim, where it spreads (the
// Webster horn's 1/r); the tubes it skips carry none. The breath goes into the mouthpiece as it does on every wind (the
// reeds' faint streams, stage-draw breathStream), pulsing with the engine's own lip opening (its trace, one
// cycle played back slowed). No hand is drawn in the bell: the engine has no hand (no stopping, no hand
// position; its fitted colour is fixed), so a hand there would follow nothing that is played.
import { hornFingering, type HornFingering, type VisualFrame } from '@piano-model/engine';
import { AXIS, CAP_R, MOUTH_K, MPIECE, MP_DIR, MP_LEN, MP_RIM, RECV, RIM_C, RIM_R, ROT_R, ROT_X, ROT_Y, TR, TUBES, bellR, hornAir, valvesDown, type P, type Run, type Tube } from './horn-plan.ts';
import { AutoScale, BRASS as BRASS_DAY, BRASS_BREATH, INK, SILVER, boreAt, brassBreath, breathStream, newBoreWave, rgba, slowPhase, spring01, trackBoreWave, type BoreWave } from './stage-draw.ts';

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

/** a tube's outline and shading, in px: its body (filled), its two edges, its lit and shaded bands (the
 *  tuba's drawing uses it too: tuba-draw.ts) */
export interface TubePx {
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
  /** a slide's nickel-silver inner tubes, out of the rotor to the sleeves' ferrules */
  nickel?: Path2D;
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
  bell: { flare: Path2D; edges: Path2D; mouth: Path2D; inner: Path2D; hi: Path2D; spec: Path2D; shade: Path2D; ax: Float32Array; d: Float32Array; r: Float32Array };
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
  // (a phone's narrow stage: 94 % of its width)
  const sc = Math.max(1, Math.min((W * (W < 600 && top > 0 ? 0.94 : 0.9)) / pw, ((H - top) * 0.86) / ph));
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
  /** a band along the flare between k0·r and k1·r off its axis (+: its lower side) */
  const band = (k0: number, k1: number) => {
    const p = new Path2D();
    const A: [number, number][] = [];
    const B: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = bp[Math.max(0, i - 1)];
      const b = bp[Math.min(n - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / l;
      const ny = (b[0] - a[0]) / l;
      const r = bellR(dd[i]);
      A.push([X(bp[i][0] + nx * r * k1), Y(bp[i][1] + ny * r * k1)]);
      B.push([X(bp[i][0] + nx * r * k0), Y(bp[i][1] + ny * r * k0)]);
    }
    [...A, ...B.reverse()].forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  };
  // the flare's lit side (its top, towards the light at the upper left), a long specular streak along it,
  // its shaded underside, as its photographs have them; the band the wave fills
  const hi = band(-0.8, -0.18);
  const spec = band(-0.6, -0.44);
  const shade = band(0.42, 0.98);
  const inner = band(-0.42, 0.42);
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
    ferruleAt(t, 0.031);
    ferruleAt(t, L - 0.031);
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
  const L: HnLayout = { key, W, H, top, sc, ox, oy, tubes, byId, bell: { flare, edges, mouth, inner, hi, spec, shade, ax, d: dd, r: rr }, mp, mpHi, hook, ferrules, braces };
  if (layouts.size > 8) layouts.clear();
  layouts.set(key, L);
  return L;
}
/** a tube in px: its outline (from its centre line and radius), its edges and its lit and shaded bands */
export function tubePx(t: Tube, X: (x: number) => number, Y: (y: number) => number, sc: number): TubePx {
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
    // (where the tube runs along the light the band crosses its crown: no jump from one side to the other)
    const lit = Math.max(-1, Math.min(1, (nx * -0.45 + ny * 0.89) * 3));
    HI.push([X(pts[i][0] + lit * nx * ri * 0.42), Y(pts[i][1] + lit * ny * ri * 0.42)]);
    SH.push([X(pts[i][0] - lit * nx * ri * 0.62), Y(pts[i][1] - lit * ny * ri * 0.62)]);
  }
  const body = new Path2D();
  [...A, ...[...B].reverse()].forEach(([x, y], i) => (i ? body.lineTo(x, y) : body.moveTo(x, y)));
  body.closePath();
  // (a valve slide: its inner tubes nickel silver from the rotor to the ferrules, 30 mm along each leg)
  let nickel: Path2D | undefined;
  if (/^(F|Bb)\d$/.test(t.id)) {
    nickel = new Path2D();
    const L = s[n - 1];
    for (const [a, b] of [[0.004, 0.03], [L - 0.03, L - 0.004]]) {
      const idx = [...s.keys()].filter((i) => s[i] >= a && s[i] <= b);
      [...idx.map((i) => A[i]), ...idx.reverse().map((i) => B[i])].forEach(([x, y], k) => (k ? nickel!.lineTo(x, y) : nickel!.moveTo(x, y)));
      nickel.closePath();
    }
  }
  const edges = new Path2D();
  const hi = new Path2D();
  const sh = new Path2D();
  for (const [p, q] of [[edges, A], [edges, B], [hi, HI], [sh, SH]] as const) q.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  return { id: t.id, layer: t.layer, body, edges, hi, sh, xy, s, r, nickel };
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

/** The lips' opening now and their swing over the cycle, from the engine's trace (one cycle kept from its
 *  narrowest, played back slowed on the wave's clock); the horn's and the tuba's alike. */
export function lipsLive(st: Pick<HornState, 'lips'>, fr: VisualFrame | null, blow: number, dt: number, now: number): { open: number; swing: number } {
  const focus = fr?.focus ?? null;
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
  return { open, swing: Math.max(0, hi - lo) };
}

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
  const { open, swing } = lipsLive(st, fr, blow, dt, now);
  return { f, down, press, air, side, lvl, ph, sounding: !!focus && lvl > 0.02 && !!f, ampAt, open, blow, swing };
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

// ---------------------------------------------------------------- the metals in daylight
// The brass stand in the studio's daylight (the window up and to the left): lacquered yellow brass and
// nickel silver as they look there, each tube lit along the side that faces the window and shaded on the
// other, with an edge that stands it off the plaster; one soft shadow on the floor. The horn's, the tuba's
// (tuba-draw.ts) and the trombone's (trombone-draw.ts) alike; the timpani's hoops and rods are the nickel.
/** a metal: lit, its body, its shade side, the edge that stands it off the plaster, the bright line in the
 *  light */
export interface Metal {
  lit: string;
  body: string;
  shade: string;
  edge: string;
  spec: string;
}
/** lacquered yellow brass (`deep`: its deep shade, and the bore seen down a bell): the stage's one daylight
 *  brass (stage-draw.ts, the trumpet's too), with the bright line a round tube takes */
export const BRASS = { ...BRASS_DAY, spec: 'rgba(255,251,236,0.8)' };
/** nickel silver, and a mouthpiece's silver plate: the stage's one daylight silver */
export const NICKEL = { lit: SILVER.lit, body: SILVER.body, shade: SILVER.shade, edge: SILVER.edge, spec: 'rgba(255,255,255,0.95)' };
/** an edge line's width on a part `r` px in radius: a hairline, finer on a small drawing (an orchestra's seat)
 *  so that the edges do not swallow the metal */
export const hair = (r: number): number => Math.min(1, Math.max(0.4, r * 0.3));

/** a round tube in daylight: its body, its shade side, the light along the side that faces the window and
 *  the bright line in it, its two edges. `r`: its radius (px); `clip`: a tube that widens along its length
 *  (its bands are one width: kept inside it) */
export function metalTube(ctx: CanvasRenderingContext2D, t: { body: Path2D; edges: Path2D; hi: Path2D; sh: Path2D }, r: number, m: Metal, clip = false): void {
  ctx.fillStyle = m.body;
  ctx.fill(t.body);
  if (clip) {
    ctx.save();
    ctx.clip(t.body);
  }
  ctx.lineCap = 'butt';
  ctx.strokeStyle = m.shade;
  ctx.lineWidth = Math.max(1, 0.66 * r);
  ctx.stroke(t.sh);
  ctx.strokeStyle = m.lit;
  ctx.lineWidth = Math.max(0.8, 0.5 * r);
  ctx.stroke(t.hi);
  if (r > 2.5) {
    ctx.strokeStyle = m.spec;
    ctx.lineWidth = Math.max(0.6, 0.12 * r);
    ctx.stroke(t.hi);
  }
  if (clip) ctx.restore();
  ctx.lineCap = 'round';
  ctx.strokeStyle = m.edge;
  ctx.lineWidth = hair(r);
  ctx.stroke(t.edges);
}
/** a thin rod or stay, a line `w` px wide (`path` null: the context's own path): its edge, and its body
 *  inside it where there is room for one */
export function metalRod(ctx: CanvasRenderingContext2D, path: Path2D | null, w: number, m: Metal): void {
  const go = () => (path ? ctx.stroke(path) : ctx.stroke());
  ctx.strokeStyle = m.edge;
  ctx.lineWidth = w >= 1.8 ? w + 0.6 : w;
  go();
  if (w >= 1.8) {
    ctx.strokeStyle = m.body;
    ctx.lineWidth = Math.max(0.8, w - 0.8);
    go();
    if (w >= 3) {
      ctx.strokeStyle = m.lit;
      ctx.lineWidth = (w - 0.8) * 0.3;
      go();
    }
  }
}

/** the pale ground the wave's envelope is drawn on inside a tube (the blue at 0.12 over the light): on the
 *  gold itself a wash of the blue would be mud */
const WAVE_PALE = 'rgba(222,229,247,0.94)';
/** how much of a tube's width the wave's lens takes at a loud note's antinode: the metal stays in sight
 *  either side of it */
const WAVE_FILL = 0.56;
/** the widest tube the lens still fills, in the instrument's own bore's radii: in a wide body or a bell the
 *  wave stays a ribbon along the middle (a tuba's body would be all blue) */
export const WAVE_CAP = 1.7;
/** The wave along a tube's centre line (`n` points, px), drawn slowed inside it as two lenses: its envelope
 *  (how far the pressure swings there: over half the tube's width at a loud note's antinode, nothing at a
 *  node), pale with a hairline of the blue round it, and in it the pressure now, in the blue: firm where the
 *  air is compressed, lighter where it is rarefied. `half(i)`: the tube's radius there (px); `amp(i)`: the
 *  pressure's amplitude there with its sign (−1…1); `ph`: the slow phase's cosine. */
export function waveLens(ctx: CanvasRenderingContext2D, xy: ArrayLike<number>, n: number, half: (i: number) => number, amp: (i: number) => number, ph: number): void {
  if (n < 2) return;
  const A: number[] = [];
  const B: number[] = [];
  const up = new Path2D();
  const dn = new Path2D();
  // the pressure's lens, one run of a sign at a time: x, y, and the half-width along the normal
  let run: number[] = [];
  const close = (path: Path2D) => {
    const m = run.length / 4;
    if (m >= 2) {
      for (let k = 0; k < m; k++) {
        const x = run[4 * k] + run[4 * k + 2];
        const y = run[4 * k + 1] + run[4 * k + 3];
        if (k) path.lineTo(x, y);
        else path.moveTo(x, y);
      }
      for (let k = m - 1; k >= 0; k--) path.lineTo(run[4 * k] - run[4 * k + 2], run[4 * k + 1] - run[4 * k + 3]);
      path.closePath();
    }
    run = [];
  };
  let any = false;
  let anyUp = false;
  let anyDn = false;
  let sg = 0;
  let x0 = 0;
  let y0 = 0;
  let v0 = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const dx = xy[2 * b] - xy[2 * a];
    const dy = xy[2 * b + 1] - xy[2 * a + 1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l;
    const ny = dx / l;
    const x = xy[2 * i];
    const y = xy[2 * i + 1];
    const am = amp(i);
    const h = WAVE_FILL * half(i);
    const e = Math.min(1, Math.abs(am)) * h;
    if (e > 0.3) any = true;
    A.push(x + nx * e, y + ny * e);
    B.push(x - nx * e, y - ny * e);
    const v = am * ph;
    const s = v > 0 ? 1 : v < 0 ? -1 : 0;
    if (i && s !== sg && sg !== 0) {
      // a node: the pressure crosses nothing between the last point and this one
      const t = Math.abs(v0) / (Math.abs(v0) + Math.abs(v) || 1);
      const cx = x0 + (x - x0) * t;
      const cy = y0 + (y - y0) * t;
      run.push(cx, cy, 0, 0);
      close(sg > 0 ? up : dn);
      if (s !== 0) run.push(cx, cy, 0, 0);
    }
    if (s !== 0) {
      const w = Math.min(1, Math.abs(v)) * h;
      run.push(x, y, nx * w, ny * w);
      if (w > 0.3) {
        if (s > 0) anyUp = true;
        else anyDn = true;
      }
    }
    sg = s;
    x0 = x;
    y0 = y;
    v0 = v;
  }
  if (sg !== 0) close(sg > 0 ? up : dn);
  if (!any) return;
  const env = new Path2D();
  for (let i = 0; i < n; i++) {
    if (i) env.lineTo(A[2 * i], A[2 * i + 1]);
    else env.moveTo(A[0], A[1]);
  }
  for (let i = n - 1; i >= 0; i--) env.lineTo(B[2 * i], B[2 * i + 1]);
  env.closePath();
  ctx.fillStyle = WAVE_PALE;
  ctx.fill(env);
  ctx.strokeStyle = rgba(INK.sound, 0.55);
  ctx.lineWidth = 0.8;
  ctx.stroke(env);
  if (anyUp) {
    ctx.fillStyle = rgba(INK.sound, 0.92);
    ctx.fill(up);
  }
  if (anyDn) {
    ctx.fillStyle = rgba(INK.sound, 0.42);
    ctx.fill(dn);
  }
}

/** an instrument's shadow on the floor, painted once: its canvas and where it lies (box px) */
export interface FloorShadow {
  cv: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}
const floorShadows = new Map<string, FloorShadow | null>();
/** the scale a context draws at (device px per box px): what a cached layer is painted at */
export const dprOf = (ctx: CanvasRenderingContext2D): number => Math.max(1, Math.abs(ctx.getTransform?.()?.a ?? 1) || 1);
/** An instrument's one soft shadow on the studio's floor (the window is up and to the left: it falls down and
 *  a little to the right), painted once per `key` into a canvas of its own and laid under the drawing each
 *  frame (layShadow): never a blur in the live path. `paint` fills the silhouette (box px, in black) inside
 *  `box`; only its shadow is kept, so the parts that cross do not darken it twice. `blur`, `dx`, `dy`: box px.
 *  Null where there is no document (the tests). */
export function floorShadow(key: string, box: { x0: number; y0: number; x1: number; y1: number }, dpr: number, blur: number, dx: number, dy: number, paint: (c: CanvasRenderingContext2D) => void, alpha = 0.32): FloorShadow | null {
  const hit = floorShadows.get(key);
  if (hit !== undefined) return hit;
  let out: FloorShadow | null = null;
  if (typeof document !== 'undefined') {
    // (drawn small, an orchestra's seat, it still casts a shadow that can be seen)
    blur = Math.max(3, blur);
    dx = Math.max(2, dx);
    dy = Math.max(3.5, dy);
    const m = 1.5 * blur + 2;
    const x = Math.floor(box.x0 - m + Math.min(0, dx));
    const y = Math.floor(box.y0 - m + Math.min(0, dy));
    const w = Math.max(1, Math.ceil(box.x1 + m + Math.max(0, dx)) - x);
    const h = Math.max(1, Math.ceil(box.y1 + m + Math.max(0, dy)) - y);
    const cw = Math.max(1, Math.round(w * dpr));
    const ch = Math.max(1, Math.round(h * dpr));
    // three canvases while it is made: the silhouette; one twice as wide, the silhouette at its left and its
    // shadow thrown to its right half (no engine is asked for the shadow of a shape off its canvas); and that
    // right half alone, which is kept
    const sil = document.createElement('canvas');
    const wide = document.createElement('canvas');
    const cv = document.createElement('canvas');
    const off = cw + 16;
    sil.width = cv.width = cw;
    wide.width = off + cw;
    sil.height = wide.height = cv.height = ch;
    const s = sil.getContext('2d');
    const t = wide.getContext('2d');
    const c = cv.getContext('2d');
    if (s && t && c) {
      s.setTransform(dpr, 0, 0, dpr, -x * dpr, -y * dpr);
      s.fillStyle = '#000';
      s.strokeStyle = '#000';
      s.lineJoin = 'round';
      s.lineCap = 'round';
      paint(s);
      t.shadowColor = `rgba(28,34,42,${alpha})`;
      t.shadowBlur = blur * dpr;
      t.shadowOffsetX = off + dx * dpr;
      t.shadowOffsetY = dy * dpr;
      t.drawImage(sil, 0, 0);
      c.drawImage(wide, -off, 0);
      out = { cv, x, y, w, h };
    }
  }
  // (a window dragged to another size leaves its shadows behind: the oldest go)
  if (floorShadows.size >= 20) floorShadows.delete(floorShadows.keys().next().value as string);
  floorShadows.set(key, out);
  return out;
}
/** lay a shadow under the drawing (moved `ox` px across: a trombone's slide) */
export function layShadow(ctx: CanvasRenderingContext2D, s: FloorShadow | null, ox = 0): void {
  if (s) ctx.drawImage(s.cv, s.x + ox, s.y, s.w, s.h);
}

// ---------------------------------------------------------------- the drawn look
/** The double horn from its outside: the body wound round the circle into the bell, the leadpipe and its
 *  tuning slide, the F horn's loop and the B♭ horn's, the valve slides (each valve's F slide behind its B♭
 *  one), the four rotors with their caps turning, the lever bar, the paddles going down for the engine's
 *  fingering (ink while held); the standing wave along the air's path in the blue, the breath going into the
 *  mouthpiece. `top`: the file player's px over the box's top. */
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
  // ---- its shadow on the floor
  layShadow(ctx, hornShadow(ctx, L));
  const tube = (t: TubePx) => {
    const rm = t.r[t.r.length >> 1];
    metalTube(ctx, t, rm, BRASS, Math.abs(t.r[t.r.length - 1] - t.r[0]) > 0.15 * rm);
    if (t.nickel) {
      // (a valve slide's inner legs: the same tube in nickel silver, out of the rotor to the ferrules)
      ctx.save();
      ctx.clip(t.nickel);
      metalTube(ctx, t, rm, NICKEL);
      ctx.restore();
      ctx.strokeStyle = NICKEL.edge;
      ctx.lineWidth = hair(rm);
      ctx.stroke(t.nickel);
    }
  };
  // ---- the bell (the body's last lap leads into it), behind everything
  {
    const B = L.bell;
    ctx.fillStyle = BRASS.body;
    ctx.fill(B.flare);
    // (the lacquer brighter towards the rim, where the flare faces the light)
    const n2 = B.ax.length / 2 - 1;
    const g = ctx.createLinearGradient(B.ax[0], B.ax[1], B.ax[2 * n2], B.ax[2 * n2 + 1]);
    g.addColorStop(0, 'rgba(243,220,154,0.5)');
    g.addColorStop(0.6, 'rgba(243,220,154,0.8)');
    g.addColorStop(1, 'rgba(243,220,154,1)');
    ctx.fillStyle = g;
    ctx.fill(B.hi);
    ctx.fillStyle = 'rgba(255,251,236,0.5)';
    ctx.fill(B.spec);
    ctx.fillStyle = 'rgba(176,134,58,0.7)';
    ctx.fill(B.shade);
    ctx.strokeStyle = BRASS.edge;
    ctx.lineWidth = 1.1 * hair(sc * TR);
    ctx.stroke(B.edges);
    if (lv.sounding) bellWave(ctx, L, lv);
  }
  // ---- the tubes, farthest first; each with the wave along the air's path where it carries it
  for (let layer = 0; layer <= 5; layer++)
    for (const t of L.tubes) {
      if (t.layer !== layer) continue;
      tube(t);
      // (the farther tubes in the shade of the nearer: the circle's and the F loop's, then the loops')
      if (layer < 2) {
        ctx.fillStyle = layer === 0 ? 'rgba(125,92,34,0.3)' : 'rgba(125,92,34,0.14)';
        ctx.fill(t.body);
      }
      if (lv.sounding && onPath.has(t.id)) glowTube(ctx, t, lv, WAVE_CAP * TR * sc);
    }
  // the ferrules (nickel silver), the stays
  ctx.fillStyle = NICKEL.body;
  ctx.fill(L.ferrules);
  ctx.strokeStyle = NICKEL.edge;
  ctx.lineWidth = hair(sc * TR);
  ctx.stroke(L.ferrules);
  metalRod(ctx, L.braces, Math.max(1, 0.0022 * sc), BRASS);
  // ---- the bell's mouth: its inside (the far wall lit along the rim, the bore dark down its throat), the
  // rim's bead
  {
    const B = L.bell;
    const tc = [X(RIM_C[0] - AXIS[0] * RIM_R * MOUTH_K * 0.6), Y(RIM_C[1] - AXIS[1] * RIM_R * MOUTH_K * 0.6)];
    const gm = ctx.createRadialGradient(tc[0], tc[1], 0, tc[0], tc[1], RIM_R * sc * 1.05);
    gm.addColorStop(0, '#5a4117');
    gm.addColorStop(0.3, BRASS.deep);
    gm.addColorStop(0.75, BRASS.shade);
    gm.addColorStop(1, '#e2c26c');
    ctx.fillStyle = gm;
    ctx.fill(B.mouth);
    if (lv.sounding) {
      // the sound leaving the mouth: the blue down the throat (kept there: thinned over the brass it is mud),
      // firmer with the wave's level at the rim
      const rg = ctx.createRadialGradient(tc[0], tc[1], 0, tc[0], tc[1], RIM_R * sc * 1.05);
      mouthBlue(rg, lv.lvl, lv.ampAt(lv.air.total - 0.001), 0.28, 0.62);
      ctx.fillStyle = rg;
      ctx.fill(B.mouth);
    }
    // the rim's rolled bead: its edge, and its bright crown
    ctx.strokeStyle = BRASS.edge;
    ctx.lineWidth = Math.max(1.4, 0.004 * sc);
    ctx.stroke(B.mouth);
    ctx.strokeStyle = BRASS.lit;
    ctx.lineWidth = Math.max(0.7, 0.0018 * sc);
    ctx.stroke(B.mouth);
  }
  // ---- the rotors: casings, caps (their passages engraved, turning), the cranks and links to the levers
  ROT_Y.forEach((y, k) => drawRotor(ctx, X(ROT_X), Y(y), sc, lv.press[k], k, lv));
  // ---- the lever bar (its springs), the paddles
  drawLevers(ctx, L, lv);
  // ---- the little finger's hook
  metalRod(ctx, L.hook, Math.max(1, 0.0026 * sc), BRASS);
  // ---- the mouthpiece (silver), the breath going into it
  paintMouthpiece(ctx, L.mp, L.mpHi, X(MP_RIM[0] + MP_DIR[0] * 0.03 - MP_DIR[1] * 0.013), Y(MP_RIM[1] + MP_DIR[1] * 0.03 + MP_DIR[0] * 0.013), X(MP_RIM[0] + MP_DIR[0] * 0.03 + MP_DIR[1] * 0.013), Y(MP_RIM[1] + MP_DIR[1] * 0.03 - MP_DIR[0] * 0.013), sc);
  drawBreath(ctx, L, lv, now);
  ctx.restore();
  hornRecord(L, st, lv);
}

/** the blue down a bell's throat while it sounds: firm at the bore, gone by `r1` of the gradient's radius (the
 *  bore's own gradient: `r0` its dark core); in with the note's level `lvl`, firmer with the pressure `A` at
 *  the rim */
export function mouthBlue(g: CanvasGradient, lvl: number, A: number, r0: number, r1: number): void {
  const a = Math.min(1, lvl * 4) * (0.5 + 0.4 * Math.min(1, Math.abs(A)) * lvl);
  g.addColorStop(0, rgba(INK.sound, a));
  g.addColorStop(r0, rgba(INK.sound, 0.7 * a));
  g.addColorStop(r1, rgba(INK.sound, 0));
}

/** a mouthpiece in silver plate: lit along the side facing the window, shaded on the other (the light across
 *  it from (x0, y0) to (x1, y1), px), its bright line and its edge */
export function paintMouthpiece(ctx: CanvasRenderingContext2D, mp: Path2D, mpHi: Path2D, x0: number, y0: number, x1: number, y1: number, sc: number): void {
  const gm = ctx.createLinearGradient(x0, y0, x1, y1);
  gm.addColorStop(0, '#c3c9cf');
  gm.addColorStop(0.3, NICKEL.lit);
  gm.addColorStop(0.6, NICKEL.body);
  gm.addColorStop(1, NICKEL.shade);
  ctx.fillStyle = gm;
  ctx.fill(mp);
  ctx.strokeStyle = NICKEL.spec;
  ctx.lineWidth = Math.max(0.8, 0.0016 * sc);
  ctx.stroke(mpHi);
  ctx.strokeStyle = NICKEL.edge;
  ctx.lineWidth = Math.max(0.6, Math.min(1.1, 0.0016 * sc));
  ctx.stroke(mp);
}

/** the horn's shadow on the floor: the whole of it as it rests (the levers up), painted once per layout */
function hornShadow(ctx: CanvasRenderingContext2D, L: HnLayout): FloorShadow | null {
  const dpr = dprOf(ctx);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  return floorShadow(`horn|${L.key}|${dpr}`, { x0: X(HN_X0), y0: Y(HN_Y1), x1: X(HN_X1), y1: Y(HN_Y0) }, dpr, 0.014 * sc, 0.0045 * sc, 0.008 * sc, (c) => {
    c.fill(L.bell.flare);
    c.fill(L.bell.mouth);
    for (const t of L.tubes) c.fill(t.body);
    c.fill(L.ferrules);
    c.fill(L.mp);
    for (const y of ROT_Y) {
      c.beginPath();
      c.arc(X(ROT_X), Y(y), ROT_R * sc, 0, 2 * Math.PI);
      c.fill();
    }
    c.lineWidth = Math.max(2, 0.0052 * sc);
    c.beginPath();
    c.moveTo(X(BAR_X), Y(BAR_Y1));
    c.lineTo(X(BAR_X), Y(BAR_Y0));
    c.stroke();
    for (const lvr of LEVERS) c.fill(paddle(X, Y, lvr.hub, lvr.tip, lvr.w0, lvr.w1));
    c.lineWidth = Math.max(1, 0.0026 * sc);
    c.stroke(L.hook);
    c.stroke(L.braces);
  });
}

/** the wave along a tube on the air's path, drawn slowed inside it (waveLens): its envelope pale, the
 *  pressure now in the blue (firm where compressed, lighter where rarefied). `cap`: the widest the tube is
 *  taken to be (px: WAVE_CAP bores). (Its name is the night bench's, kept for the tuba's drawing: nothing
 *  glows now.) */
export function glowTube(ctx: CanvasRenderingContext2D, t: TubePx, lv: Pick<HnLive, 'ampAt' | 'ph'> & { air: { runs: { id: string; offset?: number }[]; starts: number[] } }, cap = Infinity): void {
  const runs = lv.air.runs;
  const ri = runs.findIndex((r) => r.id === t.id);
  if (ri < 0) return;
  // (the run may start a little way along its tube: the leadpipe's after the mouthpiece's shank)
  const s0 = lv.air.starts[ri] - (runs[ri].offset ?? 0);
  waveLens(ctx, t.xy, t.s.length, (i) => Math.min(t.r[i], cap), (i) => lv.ampAt(s0 + t.s[i]), lv.ph);
}
/** the wave in the bell: along its axis inside the flare, where the pressure spreads over the widening mouth
 *  (1/r: the lens thins away towards the rim) */
function bellWave(ctx: CanvasRenderingContext2D, L: HnLayout, lv: HnLive): void {
  const B = L.bell;
  const cap = WAVE_CAP * TR * L.sc;
  waveLens(ctx, B.ax, B.d.length, (i) => Math.min(B.r[i], cap), (i) => lv.ampAt(lv.air.total - B.d[i]), lv.ph);
}
/** a rotor seen end on: its brass casing, the nickel cap with its bevel and centre screw, the rotor's two
 *  passages engraved (turned a quarter turn by `press`; in the blue where the wave goes through them), the
 *  crank and its ball (ink while held) */
function drawRotor(ctx: CanvasRenderingContext2D, cx: number, cy: number, sc: number, press: number, k: number, lv: HnLive): void {
  const R = ROT_R * sc;
  const r = CAP_R * sc;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.fillStyle = BRASS.body;
  ctx.fill();
  ctx.strokeStyle = BRASS.edge;
  ctx.lineWidth = hair(r / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, NICKEL.lit);
  g.addColorStop(0.55, NICKEL.body);
  g.addColorStop(1, NICKEL.shade);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = NICKEL.edge;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(95,104,114,0.45)';
  ctx.stroke();
  // the passages: two arcs across the rotor, turned with it (the blue while the wave goes through them)
  const a = -(Math.PI / 2) * press;
  const lit = lv.sounding && (k === 0 || lv.f) ? 0.55 + 0.4 * lv.lvl : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-a);
  ctx.lineWidth = Math.max(1, r * 0.13);
  ctx.strokeStyle = lit ? rgba(INK.sound, lit) : rgba(INK.line, 0.5);
  for (const sg of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(sg * r * 0.95, 0, r * 0.62, sg > 0 ? Math.PI * 0.62 : -Math.PI * 0.38, sg > 0 ? Math.PI * 1.38 : Math.PI * 0.38);
    ctx.stroke();
  }
  ctx.restore();
  // the centre screw
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.2, 0, 2 * Math.PI);
  ctx.fillStyle = NICKEL.shade;
  ctx.fill();
  ctx.strokeStyle = rgba(INK.line, 0.8);
  ctx.lineWidth = hair(r / 2);
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.16 * Math.cos(a), cy + r * 0.16 * Math.sin(a));
  ctx.lineTo(cx + r * 0.16 * Math.cos(a), cy - r * 0.16 * Math.sin(a));
  ctx.stroke();
  // the crank on the spindle and its ball (turning with the rotor), ink while held down
  const ca = crankAngle(k, press);
  const bx = cx + Math.cos(ca) * CRANK * sc;
  const by = cy - Math.sin(ca) * CRANK * sc;
  const held = press > 0.05;
  ctx.strokeStyle = held ? rgba(INK.line, 0.55 + 0.4 * press) : NICKEL.edge;
  ctx.lineWidth = Math.max(1.2, 0.0024 * sc);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx, by, Math.max(1.2, 0.0022 * sc), 0, 2 * Math.PI);
  ctx.fillStyle = held ? rgba(INK.line, 0.9) : NICKEL.body;
  ctx.fill();
  ctx.lineWidth = hair(r / 2);
  ctx.stroke();
}
/** the lever bar with its springs, each lever's link from its hub to its rotor's crank, and the paddles
 *  (the thumb's at the top), going down under the fingers: nickel silver at rest, ink while held */
function drawLevers(ctx: CanvasRenderingContext2D, L: HnLayout, lv: HnLive): void {
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const hl = hair(0.004 * sc);
  // the bar: a rod with its spring barrels
  ctx.lineCap = 'butt';
  ctx.strokeStyle = NICKEL.body;
  ctx.lineWidth = Math.max(2, 0.0052 * sc);
  ctx.beginPath();
  ctx.moveTo(X(BAR_X), Y(BAR_Y1));
  ctx.lineTo(X(BAR_X), Y(BAR_Y0));
  ctx.stroke();
  ctx.strokeStyle = NICKEL.edge;
  ctx.lineWidth = hl;
  ctx.beginPath();
  ctx.moveTo(X(BAR_X) - 0.0026 * sc, Y(BAR_Y1));
  ctx.lineTo(X(BAR_X) - 0.0026 * sc, Y(BAR_Y0));
  ctx.moveTo(X(BAR_X) + 0.0026 * sc, Y(BAR_Y1));
  ctx.lineTo(X(BAR_X) + 0.0026 * sc, Y(BAR_Y0));
  ctx.stroke();
  // (the springs: fine coils on the barrel by each hub)
  ctx.strokeStyle = 'rgba(95,104,114,0.6)';
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
    ctx.strokeStyle = q > 0.05 ? rgba(INK.line, 0.5 + 0.4 * q) : NICKEL.edge;
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
    const g = ctx.createLinearGradient(0, Y(lvr.hub[1] + lvr.w1), 0, Y(lvr.hub[1] - lvr.w1));
    g.addColorStop(0, NICKEL.lit);
    g.addColorStop(0.5, NICKEL.body);
    g.addColorStop(1, NICKEL.shade);
    ctx.fillStyle = g;
    ctx.fill(p);
    if (q > 0.01) {
      ctx.fillStyle = rgba(INK.line, 0.86 * q);
      ctx.fill(p);
    }
    ctx.strokeStyle = q > 0.5 ? rgba(INK.line, 0.95) : NICKEL.edge;
    ctx.lineWidth = hl * (1 + 0.4 * q);
    ctx.stroke(p);
    // the hub on the bar
    ctx.beginPath();
    ctx.arc(X(lvr.hub[0]), Y(lvr.hub[1]), Math.max(1.5, 0.0034 * sc), 0, 2 * Math.PI);
    ctx.fillStyle = NICKEL.shade;
    ctx.fill();
    ctx.strokeStyle = NICKEL.edge;
    ctx.lineWidth = hl;
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
/** the breath into the mouthpiece while the note is blown: the reeds' streams (stage-draw breathStream),
 *  converging on the lips' aperture at the rim's middle, pulsing with the lips' opening (drawn slowed) */
function drawBreath(ctx: CanvasRenderingContext2D, L: HnLayout, lv: HnLive, now: number): void {
  if (!(lv.sounding && lv.blow > 0.01)) return;
  const { sc } = L;
  const rx = L.ox + MP_RIM[0] * sc;
  const ry = L.oy - MP_RIM[1] * sc;
  // (the axis into the cup on the screen, (ux, uy), and across it)
  const ux = MP_DIR[0];
  const uy = -MP_DIR[1];
  const o = lv.open / Math.max(0.3, lv.swing + 0.2);
  breathStream(ctx, (a, w) => [rx - ux * a * sc + uy * w * sc, ry - uy * a * sc - ux * w * sc], sc, BRASS_BREATH, brassBreath(lv.lvl, o), now);
}
