// The tuba on the 2D stage (the drawn look): its plan (tuba-plan.ts) at its real sizes in metres, lit like
// the horn and the trombone beside it (lacquered yellow brass on the dark stage, nickel-silver valve caps,
// stems and mouthpiece, pearl finger buttons), and its live state, shared with the vector display
// (vector/tuba.ts).
//
// What moves. The four pistons go down for the engine's note by its own fingering (tubaFingering: the fourth
// valve in place of 1+3, 2+4 in place of 1+2+3), each on its spring, and come back up a moment after the note
// stops. The air's path through the pressed valves' loops is lit, the others are dark; the bore's standing
// wave (the engine's, with its sign; drawn slowed) runs along that path from the lips to the bell's rim,
// widening with the body. The breath goes into the mouthpiece as on every wind (stage-draw breathStream),
// pulsing with the engine's own lip opening.
import { tubaFingering, valvesDown, type TubaFingering, type VisualFrame } from '@piano-model/engine';
import { glowTube, lipsLive, tubePx, type HornState, type TubePx } from './horn-draw.ts';
import type { P, Run } from './horn-plan.ts';
import { BELL_LEN, BELL_PTS, BELL_TILT, BELL_TOP_X, LEAD_X, LEAD_Y0, BORE, BUTTON_Y, CASING_R, CASING_Y0, CASING_Y1, MOUTH_K, MPIECE, MP_DIR, MP_RIM, RIM_R, RIM_Y, STACK_Y0, TB_X0, TB_X1, TB_Y0, TB_Y1, TRAVEL, TUBES, VALVE_X, VALVE_Y, bellR, tubaAir, PISTON_LEAN, lean } from './tuba-plan.ts';
import { AutoScale, BRASS_BREATH, INK, boreAt, brassBreath, breathStream, newBoreWave, rgba, slowPhase, spring01, trackBoreWave, type BoreWave } from './stage-draw.ts';

type Box = { x0: number; y0: number; x1: number; y1: number };
export interface TubaState {
  /** where its sound leaves (the bell's mouth), px in the box */
  src?: { x: number; y: number };
  wave?: BoreWave;
  /** the wave's reference level: the loudest of the last few seconds, so a note dying away fades */
  waveRef?: AutoScale;
  /** the pistons' springs (valves 1–4: 0 up, 1 down) */
  mech?: { pos: Float32Array; vel: Float32Array; t: number; quiet: number; f: TubaFingering | null };
  /** the lips' opening over one cycle, from the engine's trace (horn-draw.ts lipsLive) */
  lips?: HornState['lips'];
  /** where it was last drawn (box px): the whole tuba; the valves (casings to buttons); the mouthpiece and
   *  lips; the bell's mouth; the valves held (bit k: valve k + 1); each button's height (px) (tests) */
  drawn?: { body: Box; valves: Box; mouth: Box; bell: Box; levers: number; buttons: number[] };
}
export const newTubaState = (): TubaState => ({});
/** the tuba's box on the stage, m (its plan with the margins its drawing keeps) */
export const tubaBox = (): { w: number; h: number } => ({ w: (TB_X1 - TB_X0) / 0.9, h: (TB_Y1 - TB_Y0) / 0.86 });

export interface TbLayout {
  key: string;
  W: number;
  H: number;
  top: number;
  sc: number;
  ox: number;
  oy: number;
  tubes: TubePx[];
  byId: Map<string, TubePx>;
  /** the bell: its flare, its edges, the mouth (the rim's ellipse from the front, a little above), the band
   *  the wave fills, the lit and shaded bands, the axis (px) */
  bell: { flare: Path2D; edges: Path2D; mouth: Path2D; inner: Path2D; hi: Path2D; spec: Path2D; shade: Path2D; ax: Float32Array };
  mp: Path2D;
  mpHi: Path2D;
  /** the valve block: the casings, their caps, the knuckles between them; the braces and the ferrules */
  casings: Path2D;
  caps: Path2D;
  knuckles: Path2D;
  braces: Path2D;
  ferrules: Path2D;
}
const layouts = new Map<string, TbLayout>();

/** The layout for a W×H box (the file player's `top` px kept clear at its top): the tuba as large as fits in
 *  90 % of the width and 86 % of the height under the player, centred. A cell sized by tubaBox at the
 *  group's px/m draws it at that scale. */
export function tubaLayout(W: number, H: number, top = 0): TbLayout {
  const key = `${W}x${H}x${top}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const pw = TB_X1 - TB_X0;
  const ph = TB_Y1 - TB_Y0;
  const sc = Math.max(1, Math.min((W * (W < 600 && top > 0 ? 0.94 : 0.9)) / pw, ((H - top) * 0.86) / ph));
  const ox = W / 2 - ((TB_X0 + TB_X1) / 2) * sc;
  const oy = top + (H - top) / 2 + ((TB_Y0 + TB_Y1) / 2) * sc;
  const X = (x: number) => ox + x * sc;
  const Y = (y: number) => oy - y * sc;
  const tubes = Object.values(TUBES).map((t) => tubePx(t, X, Y, sc));
  const byId = new Map(tubes.map((t) => [t.id, t]));
  // ---- the bell: the flare about its upright axis, the mouth
  const n = BELL_PTS.length;
  const ax = new Float32Array(2 * n);
  BELL_PTS.forEach((p, i) => {
    ax[2 * i] = X(p[0]);
    ax[2 * i + 1] = Y(p[1]);
  });
  /** a band of the flare between k0·r and k1·r off its axis (−: its left side, towards the light) */
  const band = (k0: number, k1: number, close = true) => {
    const p = new Path2D();
    const A = BELL_PTS.map((q) => [X(q[0] + k1 * (bellR(RIM_Y - q[1]) + 0.0008)), Y(q[1])]);
    const B = BELL_PTS.map((q) => [X(q[0] + k0 * (bellR(RIM_Y - q[1]) + 0.0008)), Y(q[1])]);
    if (close) {
      [...A, ...B.reverse()].forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      p.closePath();
    } else for (const s of [A, B]) s.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    return p;
  };
  // (the mouth across the leaning axis: its near side lower at the left)
  const mouth = new Path2D();
  mouth.ellipse(X(BELL_TOP_X), Y(RIM_Y), RIM_R * sc, RIM_R * MOUTH_K * sc, -BELL_TILT, 0, 2 * Math.PI);
  // ---- the mouthpiece (its silhouette along its axis, rim to shank)
  const MPt = (s: number, r: number): [number, number] => [X(MP_RIM[0] + MP_DIR[0] * s), Y(MP_RIM[1] + r)];
  const mp = new Path2D();
  MPIECE.forEach(([r, s], i) => (i ? mp.lineTo(...MPt(s, r)) : mp.moveTo(...MPt(s, r))));
  for (let i = MPIECE.length - 1; i >= 0; i--) mp.lineTo(...MPt(MPIECE[i][1], -MPIECE[i][0]));
  mp.closePath();
  const mpHi = new Path2D();
  MPIECE.forEach(([r, s], i) => (i ? mpHi.lineTo(...MPt(s, r * 0.45)) : mpHi.moveTo(...MPt(s, r * 0.45))));
  // ---- the valve block: casings, their top and bottom caps, the knuckles of the main line between them
  const casings = new Path2D();
  const caps = new Path2D();
  const knuckles = new Path2D();
  /** a piston's upright rectangle, leaning with it (plan lean) */
  const leaning = (path: Path2D, k: number, x0: number, y0: number, x1: number, y1: number) => {
    ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as P[]).forEach((q, i) => {
      const [x, y] = lean(k, q);
      if (i) path.lineTo(X(x), Y(y));
      else path.moveTo(X(x), Y(y));
    });
    path.closePath();
  };
  VALVE_X.forEach((x, k) => {
    leaning(casings, k, x - CASING_R, CASING_Y0, x + CASING_R, CASING_Y1);
    for (const [y0, y1] of [[CASING_Y1, CASING_Y1 + 0.011], [CASING_Y0 - 0.013, CASING_Y0]]) leaning(caps, k, x - CASING_R - 0.0018, y0, x + CASING_R + 0.0018, y1);
    if (k < 3) knuckles.rect(X(x), Y(VALVE_Y + BORE), (VALVE_X[k + 1] - x) * sc, 2 * BORE * sc);
  });
  // ---- braces: the stays between the bell's stack and the body, the leadpipe on the bell, the fourth loop
  const braces = new Path2D();
  for (const [a, b] of [
    [[0.016, 0.3], [0, 0.3]],
    [[0.2, 0.42], [0.262, 0.42]],
    [[LEAD_X, 0.5], [LEAD_X - 0.02, 0.5]],
    [[LEAD_X, LEAD_Y0 + 0.05], [LEAD_X - 0.022, LEAD_Y0 + 0.05]],
    [[0.045, 0.6], [0.09, 0.6]],
  ] as [P, P][]) {
    braces.moveTo(X(a[0]), Y(a[1]));
    braces.lineTo(X(b[0]), Y(b[1]));
  }
  // ---- ferrules: where each slide's legs leave their sleeves, on the body's joints
  const ferrules = new Path2D();
  const ferruleAt = (t: TubePx, s: number) => {
    let i = 1;
    while (i < t.s.length - 1 && t.s[i] < s) i++;
    const x = t.xy[2 * i];
    const y = t.xy[2 * i + 1];
    const dx = x - t.xy[2 * i - 2];
    const dy = y - t.xy[2 * i - 1];
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l;
    const uy = dy / l;
    const w = t.r[i] + Math.max(0.8, 0.0014 * sc);
    const h = Math.max(1, 0.003 * sc);
    ferrules.moveTo(x - ux * h + uy * w, y - uy * h - ux * w);
    ferrules.lineTo(x + ux * h + uy * w, y + uy * h - ux * w);
    ferrules.lineTo(x + ux * h - uy * w, y + uy * h + ux * w);
    ferrules.lineTo(x - ux * h - uy * w, y - uy * h + ux * w);
    ferrules.closePath();
  };
  for (const id of ['L1', 'L2', 'L3', 'L4', 'slide']) {
    const t = byId.get(id)!;
    const len = t.s[t.s.length - 1];
    ferruleAt(t, id === 'L4' ? 0.13 : 0.035);
    ferruleAt(t, len - (id === 'L4' ? 0.13 : 0.035));
  }
  {
    const b = byId.get('body')!;
    for (const s of [0.28, 0.72, 1.25, 1.95]) ferruleAt(b, s);
    ferruleAt(byId.get('lead')!, 0.014);
  }
  const L: TbLayout = { key, W, H, top, sc, ox, oy, tubes, byId, bell: { flare: band(-1, 1), edges: band(-1, 1, false), mouth, inner: band(-0.42, 0.42), hi: band(-0.8, -0.18), spec: band(-0.6, -0.44), shade: band(0.42, 0.98), ax }, mp, mpHi, casings, caps, knuckles, braces, ferrules };
  if (layouts.size > 8) layouts.clear();
  layouts.set(key, L);
  return L;
}

// ---------------------------------------------------------------- the live state (both styles)
export interface TbLive {
  /** the fingering held (null: all up) and the valves down [1, 2, 3, 4] */
  f: TubaFingering | null;
  down: boolean[];
  /** each piston's travel (0 up, 1 down), on its spring */
  press: number[];
  /** the air's path for the fingering held (the open tube's at rest) */
  air: { runs: Run[]; total: number; starts: number[] };
  /** the wave: its level (0..1 of the recent loudest), slow phase (−1..1), and the pressure at s m along the
   *  path (the engine's, spreading in the bell's flare) */
  lvl: number;
  ph: number;
  sounding: boolean;
  ampAt: (s: number) => number;
  /** the lips' opening now (drawn slowed), the blowing pressure, the lips' swing over the cycle */
  open: number;
  blow: number;
  swing: number;
}
const NONE = [false, false, false, false];

/** the frame into the drawing's live state (the same for both styles: a change of style carries it) */
export function tubaLive(fr: VisualFrame | null, st: TubaState, now: number): TbLive {
  const focus = fr?.focus ?? null;
  const blow = fr?.lips?.blow ?? 0;
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = (st.waveRef ??= new AutoScale(1e-6, 0.997)).of(peak);
  const lvl = Math.min(1, peak / scale);
  // the fingering: the engine's note while it is blown and a moment after, then the pistons come up
  const mc = (st.mech ??= { pos: new Float32Array(4), vel: new Float32Array(4), t: now, quiet: 10, f: null });
  const dt = Math.min(0.1, Math.max(0, (now - mc.t) / 1000));
  mc.t = now;
  mc.quiet = blow > 0.02 || (lvl > 0.04 && blow > 0.002) ? 0 : mc.quiet + dt;
  const f = focus && mc.quiet < 0.8 ? tubaFingering(focus.midi) : null;
  mc.f = f;
  const down = f ? valvesDown(f.valves, 4) : NONE;
  // (a piston on its spring: a little slower than a rotor's lever, 21 mm of travel, 16 Hz)
  const press = [0, 1, 2, 3].map((k) => spring01(mc.pos, mc.vel, k, down[k] ? 1 : 0, dt, 16, 0.7));
  const air = tubaAir(down);
  const ph = Math.cos(slowPhase(focus?.f1 ?? 65, now));
  const bellStart = air.starts[air.starts.length - 1];
  const ampAt = (s: number): number => {
    // in the bell's flare the pressure spreads over the widening mouth
    const taper = s > bellStart ? Math.sqrt(bellR(BELL_LEN) / bellR(air.total - s)) : 1;
    return (boreAt(w.amp, s / air.total) / scale) * taper;
  };
  const { open, swing } = lipsLive(st, fr, blow, dt, now);
  return { f, down, press, air, lvl, ph, sounding: !!focus && lvl > 0.02 && !!f, ampAt, open, blow, swing };
}

/** record where it was drawn (and the valves held) and where its sound leaves */
export function tubaRecord(L: TbLayout, st: TubaState, lv: TbLive): void {
  const X = (x: number) => L.ox + x * L.sc;
  const Y = (y: number) => L.oy - y * L.sc;
  const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0: X(x0), y0: Y(y1), x1: X(x1), y1: Y(y0) });
  st.drawn = {
    body: box(TB_X0, TB_Y0, TB_X1, TB_Y1),
    // (the leaning pistons: from the first one's button to the fourth one's foot)
    valves: box(lean(0, [VALVE_X[0], BUTTON_Y])[0] - 0.03, CASING_Y0 - 0.02, lean(3, [VALVE_X[3], CASING_Y0])[0] + 0.03, BUTTON_Y + 0.012),
    mouth: box(MP_RIM[0] - 0.03, MP_RIM[1] - 0.03, MP_RIM[0] + 0.075, MP_RIM[1] + 0.03),
    bell: box(BELL_TOP_X - RIM_R, RIM_Y - 0.12, BELL_TOP_X + RIM_R, RIM_Y + RIM_R * MOUTH_K),
    levers: lv.f ? lv.down.reduce((a, d, i) => a | (d ? 1 << i : 0), 0) : 0,
    buttons: lv.press.map((p, k) => Y(lean(k, [VALVE_X[k], BUTTON_Y - TRAVEL * p])[1])),
  };
  st.src = { x: X(BELL_TOP_X), y: Y(RIM_Y) };
}

// ---------------------------------------------------------------- the drawn look
const BRASS_BODY = '#4a3416';
const BRASS_DEEP = '#2a1d0c';
const NICKEL_BODY = '#3c3a36';
const nickel = (a: number) => rgba('236,230,216', a);
const waveInk = (v: number) => (v >= 0 ? INK.vermilion : INK.steel);

/** The tuba from its valve side: the body's spiral into the bell, the leadpipe across the stack's front, the four
 *  pistons with their loops, the main tuning slide; the pistons going down for the engine's fingering, the
 *  air's path lit, the standing wave along it, the breath going into the mouthpiece. `top`: the file player's
 *  px over the box's top. */
export function drawTuba(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TubaState, top = 0): void {
  const L = tubaLayout(W, H, top);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const now = performance.now();
  const lv = tubaLive(fr, st, now);
  const onPath = new Set(lv.air.runs.map((r) => r.id));
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const tube = (t: TubePx, on: boolean) => {
    const rm = t.r[t.r.length >> 1];
    ctx.fillStyle = on ? BRASS_BODY : BRASS_DEEP;
    ctx.fill(t.body);
    ctx.strokeStyle = rgba(INK.amber, on ? 0.16 : 0.08);
    ctx.lineWidth = Math.max(1, 0.5 * rm);
    ctx.stroke(t.sh);
    ctx.strokeStyle = rgba(INK.amber, on ? 0.34 : 0.2);
    ctx.lineWidth = Math.max(0.8, 0.3 * rm);
    ctx.stroke(t.hi);
    ctx.strokeStyle = rgba(INK.amber, on ? 0.72 : 0.42);
    ctx.lineWidth = 1;
    ctx.stroke(t.edges);
  };
  // ---- the bell's stack and flare (the body's last lap leads into it), behind everything
  const B = L.bell;
  {
    ctx.fillStyle = BRASS_BODY;
    ctx.fill(B.flare);
    const g = ctx.createLinearGradient(0, Y(STACK_Y0), 0, Y(RIM_Y));
    g.addColorStop(0, rgba(INK.amber, 0.1));
    g.addColorStop(0.6, rgba(INK.amber, 0.18));
    g.addColorStop(1, rgba(INK.amber, 0.3));
    ctx.fillStyle = g;
    ctx.fill(B.hi);
    ctx.fillStyle = rgba('255,226,160', 0.16);
    ctx.fill(B.spec);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill(B.shade);
    ctx.strokeStyle = rgba(INK.amber, 0.72);
    ctx.lineWidth = 1.1;
    ctx.stroke(B.edges);
    if (lv.sounding) bellGlow(ctx, L, lv);
  }
  // ---- the tubes, farthest first; each glowing along the air's path where it carries it
  for (let layer = 0; layer <= 3; layer++) {
    for (const t of L.tubes) {
      if (t.layer !== layer) continue;
      const on = onPath.has(t.id);
      tube(t, on);
      if (on && lv.sounding) glowTube(ctx, t, lv);
    }
    if (layer === 0) {
      // the stays, on the body and under the small tubing
      ctx.strokeStyle = rgba(INK.amber, 0.45);
      ctx.lineWidth = Math.max(1, 0.003 * sc);
      ctx.stroke(L.braces);
    }
  }
  ctx.fillStyle = BRASS_BODY;
  ctx.fill(L.ferrules);
  ctx.fillStyle = rgba(INK.amber, 0.18);
  ctx.fill(L.ferrules);
  ctx.strokeStyle = rgba(INK.amber, 0.7);
  ctx.lineWidth = 1;
  ctx.stroke(L.ferrules);
  // ---- the bell's mouth: its inside (the far wall lit along the rim, dark down the throat), the rim's bead
  {
    const gm = ctx.createRadialGradient(X(BELL_TOP_X), Y(RIM_Y - 0.01), 0, X(BELL_TOP_X), Y(RIM_Y), RIM_R * sc * 1.02);
    gm.addColorStop(0, '#0c0804');
    gm.addColorStop(0.35, '#1d1409');
    gm.addColorStop(0.8, '#4a3414');
    gm.addColorStop(1, '#7a5a22');
    ctx.fillStyle = gm;
    ctx.fill(B.mouth);
    if (lv.sounding) {
      const A = Math.min(1, Math.abs(lv.ampAt(lv.air.total - 0.001)));
      const rg = ctx.createRadialGradient(X(BELL_TOP_X), Y(RIM_Y), 0, X(BELL_TOP_X), Y(RIM_Y), RIM_R * sc);
      rg.addColorStop(0, rgba(INK.vermilion, 0.1 + 0.22 * A * lv.lvl));
      rg.addColorStop(1, rgba(INK.vermilion, 0));
      ctx.fillStyle = rg;
      ctx.fill(B.mouth);
    }
    ctx.strokeStyle = rgba(INK.amber, 0.9);
    ctx.lineWidth = Math.max(1.4, 0.005 * sc);
    ctx.stroke(B.mouth);
    ctx.strokeStyle = rgba('255,236,190', 0.45);
    ctx.lineWidth = Math.max(0.8, 0.0015 * sc);
    ctx.stroke(B.mouth);
  }
  // ---- the valve block: the knuckles of the main line, the casings (lit down their left), the nickel caps,
  // each piston's stem and pearl button at its travel
  ctx.fillStyle = BRASS_BODY;
  ctx.fill(L.knuckles);
  ctx.strokeStyle = rgba(INK.amber, 0.6);
  ctx.lineWidth = 1;
  ctx.stroke(L.knuckles);
  ctx.fillStyle = BRASS_BODY;
  ctx.fill(L.casings);
  VALVE_X.forEach((x, k) => {
    // (drawn upright about the main line's passage and leaned with the piston: the plan's lean)
    ctx.save();
    ctx.translate(X(x), Y(VALVE_Y));
    ctx.rotate(-PISTON_LEAN);
    const yy = (y: number) => -(y - VALVE_Y) * sc;
    const g = ctx.createLinearGradient(-CASING_R * sc, 0, CASING_R * sc, 0);
    g.addColorStop(0, rgba(INK.amber, 0.1));
    g.addColorStop(0.28, rgba('255,226,160', lv.down[k] ? 0.42 : 0.3));
    g.addColorStop(0.55, rgba(INK.amber, 0.1));
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(-CASING_R * sc, yy(CASING_Y1), 2 * CASING_R * sc, (CASING_Y1 - CASING_Y0) * sc);
    // the stem and the button, down by the piston's travel
    const by = BUTTON_Y - TRAVEL * lv.press[k];
    ctx.strokeStyle = nickel(0.55);
    ctx.lineWidth = Math.max(1, 0.0042 * sc);
    ctx.beginPath();
    ctx.moveTo(0, yy(CASING_Y1 + 0.011));
    ctx.lineTo(0, yy(by));
    ctx.stroke();
    ctx.fillStyle = lv.down[k] ? rgba('255,246,226', 0.95) : rgba('226,218,200', 0.8);
    ctx.beginPath();
    ctx.ellipse(0, yy(by), 0.0135 * sc, Math.max(1.2, 0.0045 * sc), 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
  });
  ctx.strokeStyle = rgba(INK.amber, 0.7);
  ctx.lineWidth = 1;
  ctx.stroke(L.casings);
  ctx.fillStyle = NICKEL_BODY;
  ctx.fill(L.caps);
  ctx.fillStyle = nickel(0.22);
  ctx.fill(L.caps);
  ctx.strokeStyle = nickel(0.6);
  ctx.stroke(L.caps);
  // ---- the mouthpiece (silver plate), the breath going into it
  ctx.fillStyle = NICKEL_BODY;
  ctx.fill(L.mp);
  {
    const gm = ctx.createLinearGradient(0, Y(MP_RIM[1] + 0.024), 0, Y(MP_RIM[1] - 0.024));
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
  if (lv.sounding && lv.blow > 0.01) {
    // (the breath comes from the player's side, into the cup: the reeds' streams, pulsing with the lips'
    // opening; drawn 1.7 times the horn's, as the cup is)
    const o = lv.open / Math.max(0.3, lv.swing + 0.2);
    const k = 1.7 * sc;
    breathStream(ctx, (a, w) => [X(MP_RIM[0]) - MP_DIR[0] * a * k, Y(MP_RIM[1]) - w * k], k, BRASS_BREATH, brassBreath(lv.lvl, o), now);
  }
  ctx.restore();
  tubaRecord(L, st, lv);
}

/** the wave in the bell: a gradient up its axis inside the flare */
function bellGlow(ctx: CanvasRenderingContext2D, L: TbLayout, lv: TbLive): void {
  const B = L.bell;
  const n = B.ax.length / 2;
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
