// Day Studio: the timpani on the 2D stage, copper bowls and calf heads in daylight, a head's motion in
// the blue. Their layout and live state are the shared drawer's (ui/timpani-draw.ts).
import type { VisualFrame } from '@piano-model/engine';
import { INK, rgba } from '../../../ui/stage-draw.ts';
import { type DrumPx, FG, type HeadField, pedalPts, pointerAt, timpaniLayout, timpaniLive, timpaniRecord, type TimpaniState, type TpLayout, type TpLive, trackHands } from '../../../ui/timpani-draw.ts';
import { BALL_R, type DrumPlan, PAINT_ORDER, SET, SHAFT_R, SIN_E } from '../../../ui/timpani-plan.ts';
import { dprOf, floorShadow, type FloorShadow, hair, layShadow, metalRod, NICKEL } from './horn.ts';
import { LIGHT } from './kit.ts';

// ---------------------------------------------------------------- the drawn look: the set in daylight
// polished copper (lit, body, shade: the light falls from the upper left, so the bright band stands left of a
// kettle's middle), nickel hoops, rods and handles (./horn.ts NICKEL), pale calfskin, dark enamelled bases
const COPPER_STOPS: [number, string][] = [
  [0, '#8a4a26'],
  [0.1, '#b0683e'],
  [0.3, '#dd9468'],
  [0.42, '#e8a57a'],
  [0.58, '#c57a4c'],
  [0.82, '#8a4a26'],
  [1, '#643218'],
];
const COPPER_EDGE = 'rgba(110,56,28,0.9)';
/** the struts, the legs and the cast base: a dark enamel, its edge, the light along it */
const BASE = '#3d3631';
const BASE_DEEP = '#2b2622';

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
  // ---- the drums' shadows on the floor (painted once per layout)
  layShadow(ctx, setShadow(ctx, L));
  for (const i of PAINT_ORDER) drawDrum(ctx, L, i, lv, st);
  drawMallets(ctx, L, lv, st, now);
  ctx.restore();
  timpaniRecord(L, st, lv);
}

/** the four drums' shadows on the floor: under each kettle, fallen a little to the right and towards us (the
 *  window is up and to the left), one soft pool where they meet */
function setShadow(ctx: CanvasRenderingContext2D, L: TpLayout): FloorShadow | null {
  const dpr = dprOf(ctx);
  const { sc } = L;
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const d of L.drums) {
    box.x0 = Math.min(box.x0, d.shadow.x - d.shadow.rx);
    box.x1 = Math.max(box.x1, d.shadow.x + d.shadow.rx);
    box.y0 = Math.min(box.y0, d.shadow.y - d.shadow.ry);
    box.y1 = Math.max(box.y1, d.shadow.y + d.shadow.ry);
  }
  return floorShadow(`timpani|${L.key}|${dpr}`, box, dpr, 0.07 * sc, 0.045 * sc, 0.02 * sc, (c) => {
    for (const d of L.drums) {
      c.beginPath();
      c.ellipse(d.shadow.x, d.shadow.y, d.shadow.rx, d.shadow.ry, 0, 0, 2 * Math.PI);
      c.fill();
    }
  }, 0.28);
}

function drawDrum(ctx: CanvasRenderingContext2D, L: TpLayout, i: number, lv: TpLive, st: TimpaniState): void {
  const d = L.drums[i];
  const pl = SET[i];
  const { sc } = L;
  const hl = hair(0.012 * sc);
  // ---- behind the bowl: the back strut
  ctx.fillStyle = BASE_DEEP;
  ctx.fill(d.backStrut);
  // ---- the base: the legs, the pull rod up into the bowl, the hub, the casters
  ctx.strokeStyle = BASE;
  ctx.lineWidth = Math.max(1.5, 0.03 * sc);
  ctx.stroke(d.legs);
  ctx.strokeStyle = rgba(LIGHT, 0.3);
  ctx.lineWidth = Math.max(0.6, 0.004 * sc);
  ctx.stroke(d.legs);
  ctx.beginPath();
  ctx.moveTo(d.pull[0], d.pull[1]);
  ctx.lineTo(d.pull[2], d.pull[3]);
  metalRod(ctx, null, Math.max(1, 0.012 * sc), NICKEL);
  ctx.fillStyle = BASE;
  ctx.beginPath();
  ctx.ellipse(d.hub.x, d.hub.y, d.hub.rx, d.hub.ry, 0, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = rgba(INK.line, 0.6);
  ctx.lineWidth = hl;
  ctx.stroke();
  for (const [x, y] of d.casters) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, 0.026 * sc), 0, 2 * Math.PI);
    ctx.fillStyle = BASE_DEEP;
    ctx.fill();
    ctx.strokeStyle = rgba(INK.line, 0.6);
    ctx.lineWidth = hl;
    ctx.stroke();
  }
  // ---- the pedal: its link from the hub, the footboard rocking with the tuning
  drawPedal(ctx, L, pl, d, lv.pedal[i]);
  // ---- the kettle: polished copper, lit from the upper left, deepening down to its round bottom
  ctx.save();
  ctx.clip(d.bowl);
  const gx = ctx.createLinearGradient(d.hx - d.rx, 0, d.hx + d.rx, 0);
  for (const [o, c] of COPPER_STOPS) gx.addColorStop(o, c);
  ctx.fillStyle = gx;
  ctx.fill(d.bowl);
  const gy = ctx.createLinearGradient(0, d.hy, 0, d.low);
  gy.addColorStop(0, 'rgba(255,220,190,0.16)');
  gy.addColorStop(0.35, 'rgba(100,50,24,0)');
  gy.addColorStop(1, 'rgba(100,50,24,0.5)');
  ctx.fillStyle = gy;
  ctx.fill(d.bowl);
  ctx.fillStyle = 'rgba(255,226,200,0.3)';
  ctx.fill(d.spec);
  ctx.fillStyle = 'rgba(255,246,236,0.55)';
  ctx.fill(d.glint);
  // (the hoop's shadow on the collar)
  const gc = ctx.createLinearGradient(0, d.hy + d.ry, 0, d.hy + d.ry + 0.06 * sc);
  gc.addColorStop(0, 'rgba(24,28,34,0.4)');
  gc.addColorStop(1, 'rgba(24,28,34,0)');
  ctx.fillStyle = gc;
  ctx.fill(d.bowl);
  ctx.strokeStyle = 'rgba(110,56,28,0.24)';
  ctx.lineWidth = hl;
  ctx.stroke(d.sections);
  ctx.restore();
  ctx.strokeStyle = COPPER_EDGE;
  ctx.lineWidth = hl;
  ctx.stroke(d.bowl);
  // ---- the struts in front of the bowl, the near rods
  ctx.fillStyle = BASE;
  ctx.fill(d.frontStruts);
  ctx.strokeStyle = rgba(INK.line, 0.7);
  ctx.lineWidth = hl;
  ctx.stroke(d.frontStruts);
  ctx.strokeStyle = rgba(LIGHT, 0.34);
  ctx.lineWidth = Math.max(0.7, 0.004 * sc);
  ctx.stroke(d.strutEdges);
  ctx.lineCap = 'butt';
  metalRod(ctx, d.rods, Math.max(0.7, 0.006 * sc), NICKEL);
  ctx.lineCap = 'round';
  // ---- the hoop's face, the head and its field, the hoop's top
  {
    const g = ctx.createLinearGradient(d.hx - d.orx, 0, d.hx + d.orx, 0);
    g.addColorStop(0, '#8f98a2');
    g.addColorStop(0.3, NICKEL.lit);
    g.addColorStop(0.45, '#b9c0c7');
    g.addColorStop(0.75, '#d9dde1');
    g.addColorStop(1, '#7c8590');
    ctx.fillStyle = g;
    ctx.fill(d.hoopFace);
    ctx.strokeStyle = NICKEL.edge;
    ctx.lineWidth = hl;
    ctx.stroke(d.hoopFace);
  }
  drawHead(ctx, L, i, lv, st);
  {
    const g = ctx.createLinearGradient(0, d.hy - d.ory, 0, d.hy + d.ory);
    g.addColorStop(0, '#a7aeb6');
    g.addColorStop(0.5, NICKEL.body);
    g.addColorStop(1, NICKEL.lit);
    ctx.fillStyle = g;
    ctx.fill(d.hoopTop, 'evenodd');
    // (the pale hoop against the plaster and the pale head against the hoop: an edge each)
    ctx.strokeStyle = NICKEL.edge;
    ctx.lineWidth = hl;
    ctx.beginPath();
    ctx.ellipse(d.hx, d.hy, d.rx, d.ry, 0, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(d.hx, d.hy, d.orx, d.ory, 0, 0, 2 * Math.PI);
    ctx.stroke();
  }
  // ---- the T-handles, the gauge
  metalRod(ctx, d.handles, Math.max(0.9, 0.007 * sc), NICKEL);
  for (const [x, y] of d.knobs) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.7, 0.0055 * sc), 0, 2 * Math.PI);
    ctx.fillStyle = NICKEL.body;
    ctx.fill();
    ctx.strokeStyle = NICKEL.edge;
    ctx.lineWidth = hl * 0.8;
    ctx.stroke();
  }
  drawGauge(ctx, L, d, lv.pedal[i]);
}

/** the pedal: the link from the hub to its toe, the footboard (its tread), rocking with the tuning */
function drawPedal(ctx: CanvasRenderingContext2D, L: TpLayout, pl: DrumPlan, d: DrumPx, p: number): void {
  const { sc } = L;
  const f = pedalPts(L, pl, p);
  ctx.strokeStyle = BASE;
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
  g.addColorStop(0, '#a7aeb6');
  g.addColorStop(1, '#e1e4e8');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = NICKEL.edge;
  ctx.lineWidth = hair(0.012 * sc);
  ctx.stroke();
  // (the tread: a few bars across the board)
  ctx.strokeStyle = rgba(INK.line, 0.5);
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

/** the gauge: a white plate with its edge, a graphite tick a semitone, the pointer at the tuning in ink */
function drawGauge(ctx: CanvasRenderingContext2D, L: TpLayout, d: DrumPx, p: number): void {
  const { sc } = L;
  ctx.fillStyle = NICKEL.lit;
  ctx.fill(d.plate);
  ctx.strokeStyle = NICKEL.edge;
  ctx.lineWidth = Math.max(0.6, Math.min(1.2, 0.003 * sc));
  ctx.stroke(d.plate);
  ctx.strokeStyle = rgba(INK.line, 0.6);
  ctx.lineWidth = Math.max(0.5, 0.0022 * sc);
  ctx.stroke(d.ticks);
  const [tx, ty, bx, by] = pointerAt(d, p);
  ctx.strokeStyle = rgba(INK.line, 0.95);
  ctx.lineWidth = Math.max(1, 0.0045 * sc);
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(tx, ty - (by - ty) * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx, by, Math.max(1, 0.0045 * sc), 0, 2 * Math.PI);
  ctx.fillStyle = rgba(INK.line, 0.95);
  ctx.fill();
}

/** the head: pale calfskin on its hoop, a little deeper towards the rim; over it the field (the engine's
 *  modes, slowed) in the blue: deep where the head swings up, paler where down, a graphite hairline along its
 *  nodal lines */
function drawHead(ctx: CanvasRenderingContext2D, L: TpLayout, i: number, lv: TpLive, st: TimpaniState): void {
  const d = L.drums[i];
  ctx.save();
  // (the gradient round the head's centre, drawn in the head's own circle squashed to its ellipse)
  ctx.save();
  ctx.translate(d.hx, d.hy);
  ctx.scale(1, d.ry / d.rx);
  const g = ctx.createRadialGradient(-d.rx * 0.25, -d.rx * 0.3, d.rx * 0.05, 0, 0, d.rx);
  g.addColorStop(0, '#f9f5ea');
  g.addColorStop(0.75, '#efe8d8');
  g.addColorStop(1, '#dcd1bb');
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

/** the blue (stage-draw INK.sound) and its paler tint, as bytes: the head swinging up and down */
const FIELD_UP = [29, 72, 209];
const FIELD_DOWN = [126, 156, 236];
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
    const a = Math.min(0.74, 0.9 * Math.pow(Math.abs(v), 0.75));
    const s = nod * Math.exp(-(w[q] * nw) * (w[q] * nw));
    const o = 4 * q;
    const c = v >= 0 ? FIELD_UP : FIELD_DOWN;
    px[o] = c[0] * (1 - s) + 28 * s;
    px[o + 1] = c[1] * (1 - s) + 34 * s;
    px[o + 2] = c[2] * (1 - s) + 42 * s;
    px[o + 3] = 255 * Math.min(1, a + 0.4 * s);
  }
  c2.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(h.cv as HTMLCanvasElement, d.hx - d.rx, d.hy - d.ry, 2 * d.rx, 2 * d.ry);
}

/** the mallets: each ball's shadow on the head, the streak of a stroke, the stroke's ring on the head (the
 *  blue), the shaft back to the grip, the felt with its edge */
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
      ctx.fillStyle = `rgba(24,28,34,${(0.4 * (1 - 0.6 * u)).toFixed(3)})`;
      ctx.fill();
    }
    // a stroke's streak from where the ball came from (its first 90 ms), and the stroke's ring spreading on the
    // head
    const h = st.hands![k];
    const since = (now - h.t) / 1000;
    if (since >= 0 && since < 0.09 && Number.isFinite(h.fx)) {
      const a = 1 - since / 0.09;
      const g = ctx.createLinearGradient(h.fx, h.fy, bx, by);
      g.addColorStop(0, rgba(INK.line, 0));
      g.addColorStop(1, rgba(INK.line, 0.2 * a));
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
      ctx.strokeStyle = rgba(INK.sound, 0.9 * a * Math.min(1, m.vel / 90));
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
    gs.addColorStop(0, '#ecd09e');
    gs.addColorStop(0.5, '#c79d62');
    gs.addColorStop(1, '#8a6238');
    ctx.fillStyle = gs;
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,46,22,0.75)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    // the felt ball: pale felt, lit from the upper left, its edge (firm while it is on the head), its seam
    const g = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br);
    g.addColorStop(0, '#fdfaf3');
    g.addColorStop(0.6, '#ece5d7');
    g.addColorStop(1, '#bdb4a2');
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, 2 * Math.PI);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = rgba(INK.line, m.on ? 0.95 : 0.55);
    ctx.lineWidth = m.on ? 1.4 : 0.9;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,110,96,0.55)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.ellipse(bx, by, br, br * 0.28, Math.atan2(dy, dx) + Math.PI / 2, 0, Math.PI);
    ctx.stroke();
  });
}
