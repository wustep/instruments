// The glockenspiel on the 2D stage (the drawn look): its plan (glock-plan.ts) at its real sizes in metres,
// from above as its player sees it: the case, the felted rails, thirty steel bars in two rows, each on its
// two pins. And its live state, the engine's own (the frame's `glock`): a bar that rings is lit as far as the
// engine says it swings, and the two mallets are where the engine's two hands are: each hangs over the bar it
// last struck, comes down on a bar as it is struck and springs back up.
import type { VisualFrame } from '@piano-model/engine';
import { BARS, BAR_W, CASE, GK_X0, GK_X1, GK_Y0, GK_Y1, HEAD_R, RAILS, SHAFT, barBox, barCentre, barNodes, type P, strokePlace } from './glock-plan.ts';
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
  const rails = new Path2D();
  for (const [a, b] of RAILS) {
    rails.moveTo(X(a[0]), Y(a[1]));
    rails.lineTo(X(b[0]), Y(b[1]));
  }
  const L: GkLayout = { key, sc, ox, oy, top, casePath, rails };
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
  // ---- the case (dark wood, its inside felted) and the rails
  {
    const g = ctx.createLinearGradient(0, Y(GK_Y1), 0, Y(GK_Y0));
    g.addColorStop(0, '#2b1c10');
    g.addColorStop(1, '#3d2816');
    ctx.fillStyle = g;
    ctx.fill(L.casePath);
    ctx.strokeStyle = rgba(INK.amber, 0.45);
    ctx.lineWidth = 1;
    ctx.stroke(L.casePath);
    ctx.strokeStyle = 'rgba(18,14,12,0.9)';
    ctx.lineWidth = Math.max(2, 0.014 * sc);
    ctx.stroke(L.rails);
  }
  // ---- the bars: brushed steel, each on its two pins; a ringing bar lit as far as it swings
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
    if (a > 0.01) {
      ctx.fillStyle = rgba('255,214,150', Math.min(0.75, 0.15 + 0.7 * Math.sqrt(a)));
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
      ctx.fillStyle = 'rgba(30,26,22,0.85)';
      for (const [nx, ny] of barNodes(i)) {
        ctx.beginPath();
        ctx.arc(X(nx), Y(ny), Math.max(0.8, 0.0035 * sc), 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }
  // ---- the mallets: a shaft and a hard head, its shadow under it while it is up
  for (const h of [0, 1] as const) {
    const head = lv.head[h];
    const up = lv.lift[h];
    const end = shaftEnd(head, h);
    const r = HEAD_R * sc * (1 + 0.18 * up);
    const hx = X(head[0]);
    const hy = Y(head[1]) - up * 0.012 * sc;
    ctx.fillStyle = `rgba(0,0,0,${(0.32 * (1 - 0.5 * up)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(X(head[0]) + up * 0.01 * sc, Y(head[1]) + up * 0.014 * sc, r, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#c7a877';
    ctx.lineWidth = Math.max(1.2, 0.006 * sc);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(X(end[0]), Y(end[1]) - up * 0.012 * sc);
    ctx.stroke();
    const g = ctx.createRadialGradient(hx - r * 0.3, hy - r * 0.3, r * 0.1, hx, hy, r);
    g.addColorStop(0, '#fff3d6');
    g.addColorStop(1, '#b9893e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
  glockRecord(L, st, lv);
}
export { BAR_W };
