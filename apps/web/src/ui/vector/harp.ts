// The harp on the vector display (see kit.ts): the stage's own drawing (harp-draw.ts: the same plan in
// metres, the same strings, pedals and discs, the engine's own swings), as lines. Blue is the frame: the
// column and its crown, the neck, the soundbox, the base; the strings are thin lines, the Cs red and the Fs
// bright, as the hand finds them. Amber is what sounds: each ringing string's envelope and, for the loudest,
// its own shape. The pedals are seven levers in their slots, bright when they are off the middle notch.
import type { VisualFrame } from '@piano-model/engine';
import { PLUCK_SHOWN, harpLayout, harpLive, harpRecord, pluckXY, swingPx, type HarpState } from '../harp-draw.ts';
import { DISC_DY, PEDAL_LEN, PEDAL_X, PEDAL_Y, PIN_DY, STRINGS, STRING_X, STRING_Y0, STRING_Y1, discScale, pedalFoot, pedalOf, stopY } from '../harp-plan.ts';
import { V, beam, heat, seg } from './kit.ts';

/** The harp from its side, as lines. `top`: the file player's px over the box's top. */
export function drawHarpV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: HarpState, top = 0): void {
  const L = harpLayout(W, H, top);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const lv = harpLive(fr, st, performance.now());
  const small = sc < 260;
  const lw = small ? 1 : 1.2;
  ctx.save();
  const mask = (path: Path2D) => {
    ctx.save();
    ctx.fillStyle = V.ground;
    ctx.fill(path);
    ctx.restore();
  };
  // ---- the frame: the soundbox behind, the base, the column and its crown, the neck over the strings' tops
  mask(L.body);
  beam(ctx, L.body, V.line, lw);
  beam(ctx, L.board, V.line, lw + 0.4, { hot: !small });
  mask(L.base);
  beam(ctx, L.base, V.lineMid, 1);
  mask(L.column);
  beam(ctx, L.column, V.line, lw);
  mask(L.crown);
  beam(ctx, L.crown, V.line, lw);
  // ---- the strings
  for (let i = 0; i < STRINGS.length; i++) {
    const s = STRINGS[i];
    const x = X(STRING_X[i]);
    const y0 = Y(STRING_Y0[i]);
    const y1 = Y(stopY(i, lv.ped[pedalOf(i)]));
    const a = lv.amp[i];
    const w = swingPx(a, i, sc);
    const col = s.colour === 'red' ? V.rose : s.colour === 'black' ? V.line : V.lineDim;
    seg(ctx, x, Y(STRING_Y1[i]), x, y0, col, 1, { alpha: s.colour === 'plain' ? (small ? 0.55 : 0.7) : 0.95, butt: true });
    if (w > 0) {
      // what sounds, in amber: the envelope either side, and the loudest strings' own shapes
      const env = new Path2D();
      env.moveTo(x, y1);
      env.quadraticCurveTo(x + 2 * w, (y0 + y1) / 2, x, y0);
      env.quadraticCurveTo(x - 2 * w, (y0 + y1) / 2, x, y1);
      beam(ctx, env, heat(0.35 + 0.65 * Math.min(1, a * 2.5)), 1, { alpha: 0.35 + 0.6 * Math.min(1, a * 3) });
      const sh = lv.shapes.get(i);
      if (sh && sh.length > 2) {
        let pk = 1e-9;
        for (let k = 0; k < sh.length; k++) pk = Math.max(pk, Math.abs(sh[k]));
        const p = new Path2D();
        for (let k = 0; k < sh.length; k++) {
          const u = k / (sh.length - 1);
          const px = x + (sh[k] / pk) * w;
          const py = y0 + (y1 - y0) * u;
          if (k) p.lineTo(px, py);
          else p.moveTo(px, py);
        }
        beam(ctx, p, V.sound, lw, { hot: a > 0.3 });
      }
    }
  }
  mask(L.neck);
  beam(ctx, L.neck, V.line, lw);
  // (the action plate under it; each string's discs as ticks, bright when its pedal has closed them; its
  // tuning pin a point in the neck)
  beam(ctx, L.plate, V.lineDim, 1);
  if (!small)
    for (let i = 0; i < STRINGS.length; i++) {
      const x = X(STRING_X[i]);
      const yTop = Y(STRING_Y1[i]);
      const acc = lv.set[pedalOf(i)] ?? 0;
      for (let d = 0; d < 2; d++) {
        const y = yTop + DISC_DY[d] * discScale(i) * sc;
        const on = acc >= d;
        seg(ctx, x - 0.004 * sc, y, x + 0.004 * sc, y, on ? V.white : V.lineDim, 1, { alpha: on ? 0.95 : 0.6, butt: true });
      }
      seg(ctx, x, yTop - PIN_DY * sc - 1, x, yTop - PIN_DY * sc + 1, V.line, 1.4, { alpha: 0.9 });
    }
  // ---- the fingers: where each string plucked a moment ago was taken
  for (const p of lv.plucks) {
    const { x, y } = pluckXY(L, p.string, p.at, lv.ped[pedalOf(p.string)]);
    const u = p.age / PLUCK_SHOWN;
    const ring = new Path2D();
    ring.arc(x, y, (0.006 + 0.022 * u) * sc, 0, 2 * Math.PI);
    beam(ctx, ring, V.white, 1, { alpha: 0.9 * (1 - u) * (1 - u) });
  }
  // ---- the pedals in their slots: up flat, the middle natural, down sharp
  beam(ctx, L.slots, V.lineDim, 1);
  for (let k = 0; k < 7; k++) {
    const [fx, fy] = pedalFoot(k, lv.ped[k]);
    const off = Math.abs(lv.ped[k]) > 0.02;
    const p = new Path2D();
    p.moveTo(X(PEDAL_X[k] - 0.035), Y(PEDAL_Y + 0.004));
    p.lineTo(X(fx), Y(fy));
    p.lineTo(X(fx + PEDAL_LEN * 0.5), Y(fy - 0.004));
    beam(ctx, p, off ? V.white : V.line, lw + 0.3, { hot: off && !small });
  }
  ctx.restore();
  harpRecord(L, st, lv);
}
