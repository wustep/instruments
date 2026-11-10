// The timpani on the vector display (see kit.ts): the stage's own drawing (timpani-draw.ts: the same plan in
// metres seen from behind the player, the same pedals, gauges and mallets, the same head fields folded from
// the engine's modes), as lines. Blue is the set: each drum's kettle (its outline and a few sections), the
// hoop and the head's edge, the struts, base and pedal, the rods and T-handles, the gauge's plate and ticks
// (a nearer drum hides what lies behind it). Amber is sound: each head's field traced, its nodal lines bright
// and a contour either side round the parts that swing most (the down side dashed), and the gauge's pointer
// at the pitch. The knobs' slots mark where each acts: the mallets' felt (green) on the balls; the strike
// point (red) on the struck head, its ring at that radius; the fingers' place to damp (pink) at the near rim,
// lit while a head is being stopped; the roll (white) between the two hands, lit while they alternate fast.
// The state object is the stage's, so a change of style carries the mallets and the fields over.

import type { VisualFrame } from '@piano-model/engine';
import { FG, gridOf, pedalPts, pointerAt, timpaniLayout, timpaniLive, timpaniRecord, trackHands, type HeadField, type TpLayout, type TpLive, type TimpaniState } from '../timpani-draw.ts';
import { BALL_R, PAINT_ORDER, SET, SIN_E } from '../timpani-plan.ts';
import { V, beam, dot, handle, mix, ring, seg } from './kit.ts';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** each head's envelope a moment ago, to see it stopped (the fingers on it), kept per state object */
const damping = new WeakMap<TimpaniState, { env: Float32Array; t: number; on: Float32Array }>();

/** The set as lines: the drums far to near, each masking what is behind it; the heads' fields traced; the
 *  mallets; the four slots. `top`: the file player's px over the box's top. */
export function drawTimpaniV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TimpaniState, top = 0): void {
  const L = timpaniLayout(W, H, top);
  const now = performance.now();
  const lv = timpaniLive(fr, st, now);
  trackHands(L, st, lv, now);
  // (a phone's stage or an ensemble's cell: thinner lines, smaller handles)
  const small = L.sc < 260;
  const lw = small ? 1 : 1.2;
  const dm = stopped(st, lv, now);
  ctx.save();
  for (const i of PAINT_ORDER) drum(ctx, L, i, lv, st, lw, small);
  mallets(ctx, L, lv, st, now, lw, small);
  slots(ctx, L, lv, dm, small);
  ctx.restore();
  timpaniRecord(L, st, lv);
}

/** hide what lies behind a shape: lines only, but a nearer drum still covers a farther one */
function mask(ctx: CanvasRenderingContext2D, path: Path2D): void {
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fill(path);
  ctx.restore();
}

function drum(ctx: CanvasRenderingContext2D, L: TpLayout, i: number, lv: TpLive, st: TimpaniState, lw: number, small: boolean): void {
  const d = L.drums[i];
  const pl = SET[i];
  // ---- behind the bowl: the back strut, the legs, the hub, the pull rod, the casters, the pedal
  beam(ctx, d.backStrut, V.blueDim, 1, { alpha: 0.8 });
  beam(ctx, d.legs, V.blueDim, lw);
  ring(ctx, d.hub.x, d.hub.y, Math.max(1, d.hub.rx * 0.6), V.blueDim, 1);
  seg(ctx, d.pull[0], d.pull[1], d.pull[2], d.pull[3], V.blueDim, 1);
  for (const [x, y] of d.casters) ring(ctx, x, y, Math.max(1, 0.022 * L.sc), V.blueDim, 1);
  const f = pedalPts(L, pl, lv.pedal[i]);
  const board = new Path2D();
  f.quad.forEach(([x, y], k) => (k ? board.lineTo(x, y) : board.moveTo(x, y)));
  board.closePath();
  seg(ctx, d.hub.x, d.hub.y, f.hinge[0], f.hinge[1], V.blueDim, 1);
  seg(ctx, f.hinge[0], f.hinge[1], f.toe[0], f.toe[1], V.blueMid, 1);
  mask(ctx, board);
  beam(ctx, board, V.blue, lw);
  // ---- the kettle: masked, its outline and sections; the struts and near rods over it
  mask(ctx, d.bowl);
  beam(ctx, d.bowl, V.blue, lw);
  beam(ctx, d.sections, V.blueDim, 1, { alpha: 0.7 });
  beam(ctx, d.frontStruts, V.blueMid, lw);
  beam(ctx, d.rods, V.blueDim, 1);
  // ---- the hoop's face and top, the head masked
  mask(ctx, d.hoopFace);
  beam(ctx, d.hoopFace, V.blueMid, 1);
  const hoop = new Path2D();
  hoop.ellipse(d.hx, d.hy, d.orx, d.ory, 0, 0, 2 * Math.PI);
  mask(ctx, hoop);
  beam(ctx, hoop, V.blue, lw + 0.2);
  const inner = new Path2D();
  inner.ellipse(d.hx, d.hy, d.rx, d.ry, 0, 0, 2 * Math.PI);
  beam(ctx, inner, V.blueMid, 1);
  // ---- the head's field, traced
  const h = st.heads![i];
  if (lv.lvl[i] > 0.01 && h.peak > 0) field(ctx, L, i, h, lv, small);
  // ---- the T-handles, the gauge (its pointer at the pitch, amber)
  beam(ctx, d.handles, V.blueMid, 1);
  mask(ctx, d.plate);
  beam(ctx, d.plate, V.blue, 1);
  beam(ctx, d.ticks, V.blueDim, 1);
  const [tx, ty, bx, by] = pointerAt(d, lv.pedal[i]);
  seg(ctx, bx, by, tx, ty, V.amber, small ? 1 : 1.3, { alpha: 0.7 + 0.3 * lv.lvl[i], hot: lv.lvl[i] > 0.3 });
}

/** the head's field as lines: the nodal lines (bright), a contour either side at 40 % of the swing (the
 *  down side dashed), by marching squares over the field's grid laid into the head's ellipse */
function field(ctx: CanvasRenderingContext2D, L: TpLayout, i: number, h: HeadField, lv: TpLive, small: boolean): void {
  const d = L.drums[i];
  const g = gridOf(i);
  const x0 = d.hx - d.rx;
  const y0 = d.hy - d.ry;
  const sx = (2 * d.rx) / FG;
  const sy = (2 * d.ry) / FG;
  // (as the drawn look: the pattern by the head's own envelope, its strength by the loudest of late, compressed)
  const strong = clamp(((1.7 * h.peak) / h.env) * Math.sqrt(Math.min(1, h.env / lv.ref)), 0, 1);
  const w = h.w;
  const at = (c: number) => {
    const p = new Path2D();
    const ln = (u0: number, v0: number, u1: number, v1: number) => {
      p.moveTo(u0, v0);
      p.lineTo(u1, v1);
    };
    for (let q = 0; q < FG - 1; q++)
      for (let k = 0; k < FG - 1; k++) {
        const i0 = q * FG + k;
        const i1 = i0 + 1;
        const i3 = i0 + FG;
        const i2 = i3 + 1;
        // (cells by the rim are left out: every mode is still there, no line runs round it)
        const r0 = g.r[i0];
        const r1 = g.r[i1];
        const r2 = g.r[i2];
        const r3 = g.r[i3];
        if (r0 < 0 || r1 < 0 || r2 < 0 || r3 < 0 || r0 > 0.95 || r1 > 0.95 || r2 > 0.95 || r3 > 0.95) continue;
        const a = w[i0] - c;
        const b = w[i1] - c;
        const e = w[i2] - c;
        const f = w[i3] - c;
        const code = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (e > 0 ? 4 : 0) | (f > 0 ? 8 : 0);
        if (code === 0 || code === 15) continue;
        const X0 = x0 + (k + 0.5) * sx;
        const Y0 = y0 + (q + 0.5) * sy;
        // crossings on the cell's edges: top (a–b), right (b–e), bottom (f–e), left (a–f)
        const tx = X0 + (a / (a - b)) * sx;
        const ry = Y0 + (b / (b - e)) * sy;
        const bx = X0 + (f / (f - e)) * sx;
        const ly = Y0 + (a / (a - f)) * sy;
        const rx = X0 + sx;
        const by = Y0 + sy;
        switch (code) {
          case 1:
          case 14:
            ln(X0, ly, tx, Y0);
            break;
          case 2:
          case 13:
            ln(tx, Y0, rx, ry);
            break;
          case 3:
          case 12:
            ln(X0, ly, rx, ry);
            break;
          case 4:
          case 11:
            ln(rx, ry, bx, by);
            break;
          case 6:
          case 9:
            ln(tx, Y0, bx, by);
            break;
          case 7:
          case 8:
            ln(X0, ly, bx, by);
            break;
          case 5:
            ln(X0, ly, tx, Y0);
            ln(rx, ry, bx, by);
            break;
          case 10:
            ln(tx, Y0, rx, ry);
            ln(X0, ly, bx, by);
            break;
        }
      }
    return p;
  };
  const c = 0.4 * h.peak;
  beam(ctx, at(c), V.amber, small ? 0.8 : 1, { alpha: 0.35 + 0.45 * strong });
  beam(ctx, at(-c), V.amber, small ? 0.8 : 1, { alpha: 0.35 + 0.45 * strong, dash: [3, 3] });
  if (strong > 0.12) beam(ctx, at(0), V.amber, small ? 1 : 1.4, { alpha: Math.min(1, 0.3 + lv.lvl[i]), hot: strong > 0.5 });
}

/** the mallets: the shafts (masked, their edges), the balls (green: the felt's slot; white on the head), a
 *  stroke's streak, the felt's ring spreading on the head, and a dotted drop to the head under a raised ball */
function mallets(ctx: CanvasRenderingContext2D, L: TpLayout, lv: TpLive, st: TimpaniState, now: number, lw: number, small: boolean): void {
  const { sc, X, Y } = L;
  lv.mallets.forEach((m, k) => {
    const pl = SET[m.drum];
    const bx = X(m.ball[0]);
    const by = Y(m.ball[0], m.ball[1], m.ball[2]);
    const gx = X(m.grip[0]);
    const gy = Y(m.grip[0], m.grip[1], m.grip[2]);
    const br = Math.max(2, BALL_R * sc);
    const sy = Y(m.ball[0], m.ball[1], pl.zh);
    if (m.lift > 0.01) seg(ctx, bx, sy, bx, by + br, V.blueDim, 1, { alpha: 0.6, dash: [1, 3] });
    const h = st.hands![k];
    const since = (now - h.t) / 1000;
    if (since >= 0 && since < 0.09 && Number.isFinite(h.fx)) seg(ctx, h.fx, h.fy, bx, by, V.green, br, { alpha: 0.35 * (1 - since / 0.09) });
    if (m.ago < 0.25) {
      const r = br * (1.2 + 5 * m.ago);
      ctx.beginPath();
      ctx.ellipse(bx, sy, r, r * SIN_E, 0, 0, 2 * Math.PI);
      beam(ctx, null, V.amber, 1, { alpha: 0.8 * (1 - m.ago / 0.25) });
    }
    const dx = gx - bx;
    const dy = gy - by;
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * Math.max(1, 0.005 * sc);
    const ny = (dx / l) * Math.max(1, 0.005 * sc);
    const shaft = new Path2D();
    shaft.moveTo(bx + nx, by + ny);
    shaft.lineTo(gx + nx * 1.3, gy + ny * 1.3);
    shaft.lineTo(gx - nx * 1.3, gy - ny * 1.3);
    shaft.lineTo(bx - nx, by - ny);
    shaft.closePath();
    mask(ctx, shaft);
    beam(ctx, shaft, V.blue, small ? 1 : lw);
    const ball = new Path2D();
    ball.arc(bx, by, br, 0, 2 * Math.PI);
    mask(ctx, ball);
    beam(ctx, ball, m.on ? V.white : V.green, lw + (m.on ? 0.6 : 0.2), { hot: m.on || m.ago < 0.08 });
  });
}

/** a head stopped by the fingers: its envelope falling faster than a ringing head's (past the stroke's
 *  thump), so `damp` is seen working */
function stopped(st: TimpaniState, lv: TpLive, now: number): Float32Array {
  let s = damping.get(st);
  if (!s) damping.set(st, (s = { env: new Float32Array(SET.length), t: now, on: new Float32Array(SET.length) }));
  const dt = Math.max(1e-3, (now - s.t) / 1000);
  s.t = now;
  const hs = st.heads!;
  for (let i = 0; i < SET.length; i++) {
    const e = hs[i].env;
    const ago = lv.tv?.drums[i]?.ago ?? 1e9;
    const rate = s.env[i] > 0 && e > 0 ? Math.log(s.env[i] / e) / dt : 0;
    const want = ago > 0.4 && rate > 5 && lv.lvl[i] > 0.03 ? 1 : 0;
    s.on[i] += (want - s.on[i]) * Math.min(1, dt / 0.12);
    s.env[i] = e;
  }
  return s.on;
}

/** the four slots: the mallets' felt (green: the balls, drawn with them); the strike point (red) on the struck
 *  head, its radius ringed; the fingers' place (pink) at its near rim, lit while a head is being stopped; the
 *  roll (white) between the hands, lit while they alternate fast */
function slots(ctx: CanvasRenderingContext2D, L: TpLayout, lv: TpLive, dm: Float32Array, small: boolean): void {
  const i = lv.last;
  const d = L.drums[i];
  const pl = SET[i];
  const hr = clamp(0.014 * L.sc, 2.6, 6);
  // the strike point: the ring at its radius, its handle
  const spot = lv.spot;
  const sp = new Path2D();
  sp.ellipse(d.hx, d.hy, d.rx * spot, d.ry * spot, 0, 0, 2 * Math.PI);
  beam(ctx, sp, V.red, 1, { alpha: 0.3, dash: [2, 5] });
  const px = L.X(pl.cx + pl.dx * spot * pl.a);
  const py = L.Y(0, pl.cy + pl.dy * spot * pl.a, pl.zh);
  handle(ctx, px, py, V.red, hr, 0.75);
  // the fingers' place: the near rim of each head, lit on a head being stopped
  for (let k = 0; k < SET.length; k++) {
    const q = SET[k];
    const a = dm[k];
    const fx = L.X(q.cx + q.dx * q.a * 0.93);
    const fy = L.Y(0, q.cy + q.dy * q.a * 0.93, q.zh);
    if (k === i) handle(ctx, fx, fy, V.pink, hr * 0.8, 0.45 + 0.55 * a);
    if (a > 0.05) for (const s of [-2, -1, 0, 1, 2]) dot(ctx, fx + q.lx * s * 0.025 * L.sc, fy, small ? 1.2 : 1.8, V.pink, a);
  }
  // the roll: both hands striking within a fifth of a second of each other, alternately
  const [m0, m1] = lv.mallets;
  const rolling = m0.ago < 0.2 && m1.ago < 0.2 && Math.abs(m0.ago - m1.ago) > 0.01 ? 1 : 0;
  const g0x = L.X(m0.grip[0]);
  const g0y = L.Y(m0.grip[0], m0.grip[1], m0.grip[2]);
  const g1x = L.X(m1.grip[0]);
  const g1y = L.Y(m1.grip[0], m1.grip[1], m1.grip[2]);
  if (rolling) seg(ctx, g0x, g0y, g1x, g1y, V.white, 1, { alpha: 0.6, dash: [2, 4] });
  handle(ctx, (g0x + g1x) / 2, (g0y + g1y) / 2, mix(V.white, V.blue, 0.4 * (1 - rolling)), hr * 0.8, 0.45 + 0.55 * rolling);
}
