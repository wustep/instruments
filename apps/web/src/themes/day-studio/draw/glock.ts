// Day Studio: the glockenspiel on the 2D stage. The case casts one soft shadow on the floor, and what
// rings is drawn in the blue (a bar's motion a wash by its level and an outline, a stroke's ring), never
// as a glow. Its layout and live state are the shared drawer's (ui/glock-draw.ts).
import type { VisualFrame } from '@piano-model/engine';
import { barStamp, type GkLayout, glockLayout, glockLive, glockRecord, type GlockState, MODE, shaftEnd, strokeRings } from '../../../ui/glock-draw.ts';
import { BAR_W, barBox, barNodes, BARS, GK_X0, GK_X1, GK_Y0, GK_Y1, HEAD_R, HOLE_R, PIN_R, RAIL_W } from '../../../ui/glock-plan.ts';
import { INK, rgba } from '../../../ui/stage-draw.ts';
import { theme } from '../../index.ts';
import { floorShadow, type FloorShadow, SILVER } from './kit.ts';

/** The glockenspiel from above. `top`: the file player's px over the box's top. */
export function drawGlock(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: GlockState, top = 0): void {
  // (the floor's shadow is kept with the shared layout: `shade` is this drawer's own on it)
  const L: GkLayout & { shade?: FloorShadow | null } = glockLayout(W, H, top);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const lv = glockLive(fr, st, performance.now());
  const small = sc < 300;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ---- the case's shadow on the floor (kept with the layout)
  if (L.shade === undefined) {
    const k = ((GK_X1 - GK_X0) * sc) / 700;
    L.shade = floorShadow({ x0: X(GK_X0), y0: Y(GK_Y1), x1: X(GK_X1), y1: Y(GK_Y0) }, Math.max(2, 24 * k), 7 * k, 12 * k, (c) => c.fill(L.casePath));
  }
  if (L.shade) ctx.drawImage(L.shade.cv, L.shade.x, L.shade.y, L.shade.w, L.shade.h);
  // ---- the case: a wooden rim (rosewood, in daylight) round a dark tray, a plate on each corner
  {
    const g = ctx.createLinearGradient(0, Y(GK_Y1), 0, Y(GK_Y0));
    g.addColorStop(0, '#6a4428');
    g.addColorStop(0.5, '#5c3a20');
    g.addColorStop(1, '#4c2e18');
    ctx.fillStyle = g;
    ctx.fill(L.casePath);
    const t = ctx.createLinearGradient(0, Y(GK_Y1), 0, Y(GK_Y0));
    t.addColorStop(0, '#1e1610');
    t.addColorStop(1, '#2a2018');
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
      // (nickel plates)
      ctx.fillStyle = SILVER.body;
      ctx.fill(L.corners);
      ctx.strokeStyle = SILVER.edge;
      ctx.lineWidth = 0.8;
      ctx.stroke(L.corners);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke(L.trayPath);
    ctx.strokeStyle = 'rgba(44,26,12,0.85)';
    ctx.stroke(L.casePath);
    // the rails: a wooden strip, felt on it
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#2a1b10';
    ctx.lineWidth = Math.max(2, (RAIL_W + 0.006) * sc);
    ctx.stroke(L.rails);
    ctx.strokeStyle = small ? '#5a544b' : '#7a7468';
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
  // ringing bar washed in the blue where it moves (its first mode: nothing at the nodes), as far as it
  // swings, and outlined in it
  const stampPx = Math.round(BAR_W * sc * 0.4);
  if (stampPx >= 7) {
    const face = theme().draw.stamp;
    ctx.font = `${face.weight} ${stampPx}px ${face.family}`;
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
    g.addColorStop(0, '#98a1aa');
    g.addColorStop(0.2, '#f1f3f5');
    g.addColorStop(0.5, '#cdd3d9');
    g.addColorStop(0.82, '#dfe3e7');
    g.addColorStop(1, '#8a939c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(px, py, w, h, r);
    ctx.fill();
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
      const k = Math.min(0.5, 0.1 + 0.42 * Math.sqrt(a));
      const gm = ctx.createLinearGradient(0, py, 0, py + h);
      MODE.forEach((m, j) => gm.addColorStop(j / 10, rgba(INK.sound, k * (small ? 0.8 : 0.12 + 0.88 * m))));
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
    if (a > 0.01) {
      ctx.strokeStyle = rgba(INK.sound, Math.min(0.95, 0.3 + 0.7 * Math.sqrt(a)));
      ctx.lineWidth = small ? 1 : 1.5;
      ctx.stroke();
    }
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
  // ---- a stroke's ring where it landed (the stroke is what sets the bar sounding: in the blue)
  for (const { at, k } of strokeRings(fr)) {
    ctx.strokeStyle = rgba(INK.sound, 0.9 * (1 - k));
    ctx.lineWidth = Math.max(1.5, 0.003 * sc * (1 - 0.5 * k));
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
    ctx.fillStyle = `rgba(24,28,34,${(0.3 * Math.max(0.2, 1 - 0.5 * up)).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(X(head[0]) + sx, Y(head[1]) + sy, r, 0, 2 * Math.PI);
    ctx.fill();
    if (!small) {
      ctx.strokeStyle = `rgba(24,28,34,${(0.2 * Math.max(0.2, 1 - 0.5 * up)).toFixed(3)})`;
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
    ctx.fillStyle = '#c9a56c';
    ctx.beginPath();
    ctx.moveTo(hx + nx * w0, hy + ny * w0);
    ctx.lineTo(ex + nx * w1, ey + ny * w1);
    ctx.lineTo(ex - nx * w1, ey - ny * w1);
    ctx.lineTo(hx - nx * w0, hy - ny * w0);
    ctx.closePath();
    ctx.fill();
    // (rattan is pale: an edge, for where the shaft lies over the plaster)
    ctx.strokeStyle = 'rgba(104,74,34,0.75)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
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
    ctx.strokeStyle = 'rgba(104,74,20,0.9)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.restore();
  glockRecord(L, st, lv);
}
