// The glockenspiel on the vector display (see kit.ts): the stage's own drawing (glock-draw.ts: the same plan
// in metres, the same bars and mallets, the engine's own swings), as lines. Blue is the instrument: the
// case's rim (its outside, the tray's edge inside it, its corner plates), the rails' two edges, each bar's
// outline and its two pins. Amber is what sounds: a ringing bar's outline and pins and, across it, its
// bending between its nodes, as far as the engine says it swings. The mallets are two lines and two rings,
// bright as they land; a stroke leaves a ring where it landed, opening as it fades.
import type { VisualFrame } from '@piano-model/engine';
import { barShape } from '@piano-model/engine';
import { glockLayout, glockLive, glockRecord, shaftEnd, strokeRings, type GlockState } from '../glock-draw.ts';
import { BARS, HEAD_R, PIN_R, RAIL_W, barBox, barNodes } from '../glock-plan.ts';
import { V, beam, heat, mix, ring, seg } from './kit.ts';

/** The glockenspiel from above, as lines. `top`: the file player's px over the box's top. */
export function drawGlockV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: GlockState, top = 0): void {
  const L = glockLayout(W, H, top);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const lv = glockLive(fr, st, performance.now());
  const small = sc < 300;
  const lw = small ? 1 : 1.2;
  ctx.save();
  // the case's rim (its outside and the tray's edge inside it), its corner plates; each rail's two edges
  beam(ctx, L.casePath, V.blue, lw);
  beam(ctx, L.trayPath, V.blueDim, 1, { alpha: 0.9 });
  if (!small) beam(ctx, L.corners, V.blueDim, 1, { alpha: 0.7 });
  if (small) beam(ctx, L.rails, V.blueDim, 1, { alpha: 0.8 });
  else {
    const d = (RAIL_W / 2) * sc;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(0, side * d);
      beam(ctx, L.rails, V.blueDim, 1, { alpha: 0.8 });
      ctx.restore();
    }
  }
  for (let i = 0; i < BARS.length; i++) {
    const [x0, y0, x1, y1] = barBox(i);
    const a = lv.amp[i];
    const p = new Path2D();
    p.rect(X(x0), Y(y1), (x1 - x0) * sc, (y1 - y0) * sc);
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fill(p);
    ctx.restore();
    beam(ctx, p, a > 0.01 ? mix(V.blue, V.amber, Math.min(1, 0.3 + a)) : V.blueMid, a > 0.01 ? lw : 1, { hot: a > 0.3 && !small });
    // its two pins
    if (!small) for (const [nx, ny] of barNodes(i)) ring(ctx, X(nx), Y(ny), Math.max(1, PIN_R * sc), a > 0.01 ? V.amber : V.blueDim, 1, { alpha: 0.9 });
    if (a > 0.01) {
      // the bar's bending along its length, drawn across it: its middle one way, its ends the other
      const w = (x1 - x0) * sc * 0.42 * Math.min(1, 0.25 + Math.sqrt(a));
      const cx = X((x0 + x1) / 2);
      const q = new Path2D();
      const n = small ? 8 : 16;
      for (const side of [1, -1])
        for (let k = 0; k <= n; k++) {
          const u = k / n;
          const px = cx + side * w * barShape(u) * 0.6;
          const py = Y(y0 + (y1 - y0) * u);
          if (k) q.lineTo(px, py);
          else q.moveTo(px, py);
        }
      beam(ctx, q, heat(a), 1, { alpha: Math.min(1, 0.35 + a) });
    }
  }
  // a stroke's ring where it landed, opening as it fades
  for (const { at, k } of strokeRings(fr)) ring(ctx, X(at[0]), Y(at[1]), HEAD_R * sc * (1 + 2.2 * k), V.white, 1, { alpha: 0.9 * (1 - k) });
  for (const h of [0, 1] as const) {
    const head = lv.head[h];
    const up = lv.lift[h];
    const end = shaftEnd(head, h);
    const c = mix(V.white, V.blue, up);
    seg(ctx, X(head[0]), Y(head[1]), X(end[0]), Y(end[1]), c, lw, { alpha: 0.9 });
    ring(ctx, X(head[0]), Y(head[1]), HEAD_R * sc * (1 + 0.18 * up), c, lw + 0.3, { hot: up < 0.3 });
  }
  ctx.restore();
  glockRecord(L, st, lv);
}
