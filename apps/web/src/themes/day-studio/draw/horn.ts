// Day Studio: the horn on the 2D stage, and the metals in daylight that the tuba and the trombone share
// with it (a round tube lit from the window, a rod, the wave's lens inside a tube, an instrument's shadow on
// the floor). Its plan, layout and live state are the shared drawer's (ui/horn-draw.ts).
import type { VisualFrame } from '@piano-model/engine';
import { BAR_X, BAR_Y0, BAR_Y1, CRANK, crankAngle, drawBreath, HN_X0, HN_X1, HN_Y0, HN_Y1, type HnLayout, type HnLive, hornLayout, hornLive, hornRecord, type HornState, LEVERS, paddle, type TubePx } from '../../../ui/horn-draw.ts';
import { AXIS, CAP_R, MOUTH_K, MP_DIR, MP_RIM, RIM_C, RIM_R, ROT_R, ROT_X, ROT_Y, TR, type Tube, TUBES } from '../../../ui/horn-plan.ts';
import { INK, rgba } from '../../../ui/stage-draw.ts';
import { BRASS as BRASS_DAY, SILVER } from './kit.ts';

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

// ---------------------------------------------------------------- the metals in daylight
// The brass stand in the studio's daylight (the window up and to the left): lacquered yellow brass and
// nickel silver as they look there, each tube lit along the side that faces the window and shaded on the
// other, with an edge that stands it off the plaster; one soft shadow on the floor. The horn's, the tuba's
// (./tuba.ts) and the trombone's (./trombone.ts) alike; the timpani's hoops and rods are the nickel.
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
 *  brass (./kit.ts, the trumpet's too), with the bright line a round tube takes */
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
  const L = dayTubes(hornLayout(W, H, top), TUBES);
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

/** A brass layout with its tubes banded for daylight. The shared layouts (hornLayout, tubaLayout) make their
 *  tubes with the shared `tubePx`, whose lit band is wholly on one side of a tube or the other; in daylight
 *  the band crosses a tube's crown where it runs along the light (`tubePx` above). So the tubes are made
 *  again from the plan, at the layout's own scale and place, and kept with the layout: everything else of it
 *  is the shared one's. */
const dayLayouts = new WeakMap<object, unknown>();
export function dayTubes<T extends { sc: number; ox: number; oy: number; tubes: TubePx[]; byId: Map<string, TubePx> }>(L: T, plan: Record<string, Tube>): T {
  let d = dayLayouts.get(L) as T | undefined;
  if (!d) {
    const X = (x: number) => L.ox + x * L.sc;
    const Y = (y: number) => L.oy - y * L.sc;
    const tubes = Object.values(plan).map((t) => tubePx(t, X, Y, L.sc));
    d = { ...L, tubes, byId: new Map(tubes.map((t) => [t.id, t])) };
    dayLayouts.set(L, d);
  }
  return d;
}
