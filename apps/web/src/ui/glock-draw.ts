// The glockenspiel on the 2D stage (the drawn look): its plan (glock-plan.ts) at its real sizes in metres,
// from above as its player sees it: the case (a wooden rim with its corner plates round a dark tray), the
// rails (a wooden strip with felt on it under each row of nodes), thirty steel bars in two rows standing
// over the tray (each casts its shadow on it), bevelled, each on its two pins through its nodes, its note
// stamped at its near end as a glockenspiel's bars are. And its live state, the engine's own (the frame's
// `glock`): a bar that rings is lit where it moves, as far as the engine says it swings (its first bending
// mode, `barShape`: brightest at its ends and its middle, dark at the two nodes, which is why the pins are
// there); a stroke leaves a ring where it landed for a fifth of a second; and the two mallets are where the
// engine's two hands are: each hangs over the bar it last struck, comes down on a bar as it is struck and
// springs back up.
import type { VisualFrame } from '@piano-model/engine';
import { barShape } from '@piano-model/engine';
import { BARS, BAR_W, CASE, GK_X0, GK_X1, GK_Y0, GK_Y1, HEAD_R, HOLE_R, PIN_R, RAILS, RAIL_W, SHAFT, TRAY, barBox, barCentre, barNodes, type P, strokePlace } from './glock-plan.ts';
import { INK, rgba } from './stage-draw.ts';

type Box = { x0: number; y0: number; x1: number; y1: number };
export interface GlockState {
  /** where the sound leaves (the bars' middle), px in the box drawn */
  src?: { x: number; y: number };
  /** each bar's swing as drawn (eased from the engine's); each mallet's head (m, in the plan) and how far it
   *  is lifted (0 on the bar … 1 up) */
  amp?: Float32Array;
  head?: [P, P];
  lift?: [number, number];
  t?: number;
  /** what was drawn last (px in the box drawn): the case, each bar's box; how many bars ring, the brightest's
   *  index; each mallet's head and its lift */
  drawn?: { body: Box; bars: Box[]; ringing: number; brightest: number; heads: P[]; lift: number[] };
}
export const newGlockState = (): GlockState => ({});
/** the glockenspiel's box on the stage, m (its plan, the mallets' shafts towards the player, with margins) */
const MALLET_ROOM = 0.13;
export const glockBox = (): { w: number; h: number } => ({ w: (GK_X1 - GK_X0) / 0.9, h: (GK_Y1 - GK_Y0 + MALLET_ROOM) / 0.9 });

export interface GkLayout {
  key: string;
  sc: number;
  ox: number;
  oy: number;
  top: number;
  casePath: Path2D;
  /** the tray inside the rim, the rim's four corner plates */
  trayPath: Path2D;
  corners: Path2D;
  rails: Path2D;
}
const layouts = new Map<string, GkLayout>();

/** The layout for a W×H box (the file player's `top` px kept clear at its top): the instrument as large as
 *  fits in 90 % of the width and of the height under the player, centred; y grows away from the player, so
 *  up the screen. */
export function glockLayout(W: number, H: number, top = 0): GkLayout {
  const key = `${W}x${H}x${top}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const h = GK_Y1 - GK_Y0 + MALLET_ROOM;
  const sc = Math.max(1, Math.min((W * 0.9) / (GK_X1 - GK_X0), ((H - top) * 0.9) / h));
  const ox = W / 2 - ((GK_X0 + GK_X1) / 2) * sc;
  const oy = top + (H - top) / 2 + ((GK_Y0 - MALLET_ROOM + GK_Y1) / 2) * sc;
  const X = (x: number) => ox + x * sc;
  const Y = (y: number) => oy - y * sc;
  const casePath = new Path2D();
  CASE.forEach(([x, y], i) => (i ? casePath.lineTo(X(x), Y(y)) : casePath.moveTo(X(x), Y(y))));
  casePath.closePath();
  const trayPath = new Path2D();
  TRAY.forEach(([x, y], i) => (i ? trayPath.lineTo(X(x), Y(y)) : trayPath.moveTo(X(x), Y(y))));
  trayPath.closePath();
  // (a corner plate: the rim's corner, 26 mm along each side, cut straight across)
  const corners = new Path2D();
  CASE.forEach((c, i) => {
    const along = (to: P): P => {
      const d = Math.hypot(to[0] - c[0], to[1] - c[1]);
      return [c[0] + ((to[0] - c[0]) / d) * 0.026, c[1] + ((to[1] - c[1]) / d) * 0.026];
    };
    const a = along(CASE[(i + CASE.length - 1) % CASE.length]);
    const b = along(CASE[(i + 1) % CASE.length]);
    corners.moveTo(X(c[0]), Y(c[1]));
    corners.lineTo(X(a[0]), Y(a[1]));
    corners.lineTo(X(b[0]), Y(b[1]));
    corners.closePath();
  });
  const rails = new Path2D();
  for (const [a, b] of RAILS) {
    rails.moveTo(X(a[0]), Y(a[1]));
    rails.lineTo(X(b[0]), Y(b[1]));
  }
  const L: GkLayout = { key, sc, ox, oy, top, casePath, trayPath, corners, rails };
  if (layouts.size > 8) layouts.clear();
  layouts.set(key, L);
  return L;
}

/** the frame into what both styles draw: each bar's swing (0…1, eased: a stroke lights it in a frame and it
 *  dies as the engine's does), each mallet's head (it travels to its hand's bar in a few hundredths of a
 *  second) and its lift (down on the bar at the stroke, up again in a fifth of a second) */
export function glockLive(fr: VisualFrame | null, st: GlockState, now: number): { amp: Float32Array; head: [P, P]; lift: [number, number]; hit: number } {
  const gv = fr?.glock ?? null;
  const amp = (st.amp ??= new Float32Array(BARS.length));
  const head = (st.head ??= [barCentre(8), barCentre(20)]);
  const lift = (st.lift ??= [1, 1]);
  const dt = Math.min(0.1, Math.max(0, (now - (st.t ?? now)) / 1000));
  st.t = now;
  const kUp = 1 - Math.exp(-dt / 0.01);
  const kDn = 1 - Math.exp(-dt / 0.08);
  for (let i = 0; i < amp.length; i++) {
    const a = gv ? Math.min(1, gv.amp[i] ?? 0) : 0;
    amp[i] += (a - amp[i]) * (a > amp[i] ? kUp : kDn);
    if (amp[i] < 1e-4) amp[i] = 0;
  }
  const kGo = 1 - Math.exp(-dt / 0.03);
  let hit = -1;
  for (const h of [0, 1] as const) {
    // (its last stroke: on the bar for 30 ms, where the engine says it landed, then springing up over a
    // fifth of a second)
    const last = gv?.hits.find((x) => x.hand === h);
    const bar = gv ? Math.max(0, Math.min(BARS.length - 1, gv.hands[h])) : h ? 20 : 8;
    const to = last && last.bar === bar ? strokePlace(bar, last.along, last.across) : barCentre(bar);
    head[h] = [head[h][0] + (to[0] - head[h][0]) * kGo, head[h][1] + (to[1] - head[h][1]) * kGo];
    const ago = last ? last.ago : 9;
    lift[h] = ago < 0.03 ? 0 : Math.min(1, 1 - Math.exp(-(ago - 0.03) / 0.07));
    if (last && ago < 0.12) hit = last.bar;
  }
  return { amp, head, lift, hit };
}

/** record what was drawn */
export function glockRecord(L: GkLayout, st: GlockState, lv: ReturnType<typeof glockLive>): void {
  const X = (x: number) => L.ox + x * L.sc;
  const Y = (y: number) => L.oy - y * L.sc;
  const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0: X(x0), y0: Y(y1), x1: X(x1), y1: Y(y0) });
  let ringing = 0;
  let brightest = -1;
  for (let i = 0; i < lv.amp.length; i++) {
    if (lv.amp[i] > 0.01) ringing++;
    if (lv.amp[i] > 0.01 && (brightest < 0 || lv.amp[i] > lv.amp[brightest])) brightest = i;
  }
  st.drawn = { body: box(GK_X0, GK_Y0 - MALLET_ROOM, GK_X1, GK_Y1), bars: BARS.map((_, i) => box(...barBox(i))), ringing, brightest, heads: lv.head.map(([x, y]) => [X(x), Y(y)] as P), lift: [...lv.lift] };
  st.src = { x: X((GK_X0 + GK_X1) / 2), y: Y((GK_Y0 + GK_Y1) / 2) };
}

/** a mallet's shaft: from its head back towards the player, fanned a little from the instrument's middle */
export const shaftEnd = (head: P, h: number): P => [head[0] + (h ? 0.05 : -0.05) + (head[0] - (GK_X0 + GK_X1) / 2) * 0.12, head[1] - SHAFT];

/** a stroke's ring: how long it shows (s), and how far it opens (head radii) */
export const RING_S = 0.2;
/** the rings to draw now: each hand's last stroke while it is fresh: where (plan, m), how far through (0 … 1) */
export function strokeRings(fr: VisualFrame | null): { at: P; k: number }[] {
  const out: { at: P; k: number }[] = [];
  for (const x of fr?.glock?.hits ?? []) if (x.ago < RING_S && x.bar >= 0 && x.bar < BARS.length) out.push({ at: strokePlace(x.bar, x.along, x.across), k: Math.max(0, x.ago / RING_S) });
  return out;
}
/** a bar's light along its length where it rings: its first mode's motion (0 at the nodes, 1 at the ends),
 *  at eleven places */
const MODE: number[] = Array.from({ length: 11 }, (_, k) => Math.min(1, Math.abs(barShape(k / 10)) / Math.abs(barShape(0))));
/** a bar's stamped name: its letter, a sharp after it (no octave: the bars are in order) */
export const barStamp = (i: number): string => BARS[i].name.replace(/\d+$/, '').replace('#', '♯');

/** The glockenspiel from above. `top`: the file player's px over the box's top. */
export function drawGlock(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: GlockState, top = 0): void {
  const L = glockLayout(W, H, top);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const lv = glockLive(fr, st, performance.now());
  const small = sc < 300;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ---- the case: a wooden rim (lit along its top edges) round a dark tray, a plate on each corner
  {
    const g = ctx.createLinearGradient(0, Y(GK_Y1), 0, Y(GK_Y0));
    g.addColorStop(0, '#3a2414');
    g.addColorStop(0.5, '#4a2f1a');
    g.addColorStop(1, '#5a3a20');
    ctx.fillStyle = g;
    ctx.fill(L.casePath);
    const t = ctx.createLinearGradient(0, Y(GK_Y1), 0, Y(GK_Y0));
    t.addColorStop(0, '#120c07');
    t.addColorStop(1, '#1d140c');
    ctx.fillStyle = t;
    ctx.fill(L.trayPath);
    if (!small) {
      // (the rim's shadow on the tray: along its inside)
      ctx.save();
      ctx.clip(L.trayPath);
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 0.016 * sc;
      ctx.stroke(L.trayPath);
      ctx.restore();
      ctx.fillStyle = '#8f8a80';
      ctx.fill(L.corners);
      ctx.strokeStyle = 'rgba(20,18,16,0.7)';
      ctx.lineWidth = 0.8;
      ctx.stroke(L.corners);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke(L.trayPath);
    ctx.strokeStyle = rgba(INK.amber, 0.45);
    ctx.stroke(L.casePath);
    // the rails: a wooden strip, felt on it
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#2a1b10';
    ctx.lineWidth = Math.max(2, (RAIL_W + 0.006) * sc);
    ctx.stroke(L.rails);
    ctx.strokeStyle = small ? '#4d4840' : '#6b655a';
    ctx.lineWidth = Math.max(1.4, RAIL_W * sc);
    ctx.stroke(L.rails);
    ctx.lineCap = 'round';
  }
  // ---- the bars' shadows on the tray and the rails (they stand a finger over the tray)
  if (!small) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const d = 0.005 * sc;
    for (let i = 0; i < BARS.length; i++) {
      const [x0, y0, x1, y1] = barBox(i);
      ctx.beginPath();
      ctx.roundRect(X(x0) + d * 0.7, Y(y1) + d, (x1 - x0) * sc, (y1 - y0) * sc, 2);
      ctx.fill();
    }
  }
  // ---- the bars: brushed steel, bevelled, each on its two pins, its note stamped at its near end; a
  // ringing bar lit where it moves, as far as it swings
  const stampPx = Math.round(BAR_W * sc * 0.4);
  if (stampPx >= 7) {
    ctx.font = `500 ${stampPx}px "IBM Plex Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
  }
  for (let i = 0; i < BARS.length; i++) {
    const [x0, y0, x1, y1] = barBox(i);
    const px = X(x0);
    const py = Y(y1);
    const w = (x1 - x0) * sc;
    const h = (y1 - y0) * sc;
    const a = lv.amp[i];
    const r = Math.min(3, 0.1 * w);
    const g = ctx.createLinearGradient(px, 0, px + w, 0);
    g.addColorStop(0, '#7f8791');
    g.addColorStop(0.18, '#d7dde3');
    g.addColorStop(0.5, '#aab2bb');
    g.addColorStop(0.82, '#c9d0d7');
    g.addColorStop(1, '#6f7780');
    if (a > 0.01 && !small) {
      ctx.shadowColor = rgba(INK.amber, 0.25 + 0.6 * a);
      ctx.shadowBlur = 4 + 14 * a;
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(px, py, w, h, r);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (w > 8) {
      // the bevel: the far end catching the light, the near end in its own shade
      const e = Math.max(1.5, 0.0035 * sc);
      const gb = ctx.createLinearGradient(0, py, 0, py + h);
      gb.addColorStop(0, 'rgba(255,255,255,0.42)');
      gb.addColorStop(Math.min(0.45, e / h), 'rgba(255,255,255,0)');
      gb.addColorStop(Math.max(0.55, 1 - e / h), 'rgba(0,0,0,0)');
      gb.addColorStop(1, 'rgba(0,0,0,0.38)');
      ctx.fillStyle = gb;
      ctx.beginPath();
      ctx.roundRect(px, py, w, h, r);
      ctx.fill();
    }
    if (a > 0.01) {
      // (the first mode along the bar: the screen's top is the bar's far end)
      const k = Math.min(0.8, 0.15 + 0.7 * Math.sqrt(a));
      const gm = ctx.createLinearGradient(0, py, 0, py + h);
      MODE.forEach((m, j) => gm.addColorStop(j / 10, rgba('255,214,150', k * (small ? 1 : 0.25 + 0.75 * m))));
      ctx.fillStyle = gm;
      ctx.beginPath();
      ctx.roundRect(px, py, w, h, r);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(20,22,26,0.7)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(px, py, w, h, r);
    ctx.stroke();
    if (w > 5) {
      // each pin in its hole: the hole's dark, the pin's head with its light
      for (const [nx, ny] of barNodes(i)) {
        ctx.fillStyle = 'rgba(22,20,18,0.9)';
        ctx.beginPath();
        ctx.arc(X(nx), Y(ny), Math.max(0.8, HOLE_R * sc), 0, 2 * Math.PI);
        ctx.fill();
        if (w > 12) {
          ctx.fillStyle = '#b9bfc6';
          ctx.beginPath();
          ctx.arc(X(nx), Y(ny), PIN_R * sc, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.beginPath();
          ctx.arc(X(nx) - PIN_R * sc * 0.3, Y(ny) - PIN_R * sc * 0.3, PIN_R * sc * 0.35, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }
    if (stampPx >= 7) {
      // the stamp: sunk into the steel (its dark, the light caught on its lower edge)
      const tx = px + w / 2;
      const ty = py + h - Math.max(3, 0.011 * sc);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText(barStamp(i), tx, ty + 0.8);
      ctx.fillStyle = 'rgba(38,42,48,0.72)';
      ctx.fillText(barStamp(i), tx, ty);
    }
  }
  // ---- a stroke's ring where it landed
  for (const { at, k } of strokeRings(fr)) {
    ctx.strokeStyle = rgba('255,236,200', 0.85 * (1 - k));
    ctx.lineWidth = Math.max(1, 0.003 * sc * (1 - 0.5 * k));
    ctx.beginPath();
    ctx.arc(X(at[0]), Y(at[1]), HEAD_R * sc * (1 + 2.2 * k), 0, 2 * Math.PI);
    ctx.stroke();
  }
  // ---- the mallets: a rattan shaft (thinner at the head) and a hard brass head, their shadow under them
  // while they are up
  for (const h of [0, 1] as const) {
    const head = lv.head[h];
    const up = lv.lift[h];
    const end = shaftEnd(head, h);
    const r = HEAD_R * sc * (1 + 0.18 * up);
    const hx = X(head[0]);
    const hy = Y(head[1]) - up * 0.012 * sc;
    const ex = X(end[0]);
    const ey = Y(end[1]) - up * 0.012 * sc;
    const sx = up * 0.01 * sc;
    const sy = up * 0.014 * sc;
    ctx.fillStyle = `rgba(0,0,0,${(0.32 * (1 - 0.5 * up)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(X(head[0]) + sx, Y(head[1]) + sy, r, 0, 2 * Math.PI);
    ctx.fill();
    if (!small) {
      ctx.strokeStyle = `rgba(0,0,0,${(0.22 * (1 - 0.5 * up)).toFixed(3)})`;
      ctx.lineWidth = Math.max(1.2, 0.006 * sc);
      ctx.beginPath();
      ctx.moveTo(X(head[0]) + sx, Y(head[1]) + sy);
      ctx.lineTo(X(end[0]) + sx, Y(end[1]) + sy);
      ctx.stroke();
    }
    // the shaft: a long quadrilateral, 5 mm at the hand, 3.4 at the head, lit along one side
    const L2 = Math.hypot(ex - hx, ey - hy) || 1;
    const nx = -(ey - hy) / L2;
    const ny = (ex - hx) / L2;
    const w0 = Math.max(0.6, 0.0017 * sc);
    const w1 = Math.max(0.8, 0.0026 * sc);
    ctx.fillStyle = '#b89662';
    ctx.beginPath();
    ctx.moveTo(hx + nx * w0, hy + ny * w0);
    ctx.lineTo(ex + nx * w1, ey + ny * w1);
    ctx.lineTo(ex - nx * w1, ey - ny * w1);
    ctx.lineTo(hx - nx * w0, hy - ny * w0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,240,210,0.5)';
    ctx.lineWidth = Math.max(0.6, 0.0009 * sc);
    ctx.beginPath();
    ctx.moveTo(hx - nx * w0 * 0.4, hy - ny * w0 * 0.4);
    ctx.lineTo(ex - nx * w1 * 0.4, ey - ny * w1 * 0.4);
    ctx.stroke();
    const g = ctx.createRadialGradient(hx - r * 0.3, hy - r * 0.3, r * 0.1, hx, hy, r);
    g.addColorStop(0, '#fff3d6');
    g.addColorStop(0.55, '#d2a556');
    g.addColorStop(1, '#8d6427');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40,26,8,0.6)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.restore();
  glockRecord(L, st, lv);
}
export { BAR_W };
