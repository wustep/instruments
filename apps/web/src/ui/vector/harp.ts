// The harp on the vector display (see kit.ts): the stage's own drawing (harp-draw.ts: the same plan in
// metres, the same strings, pedals and discs, the engine's own swings), as lines. Blue is the frame: the
// column and its crown, the neck, the soundbox, the base; the strings are thin lines, the Cs red and the Fs
// bright, as the hand finds them. Amber is what sounds: each ringing string's envelope and, for the loudest,
// its own shape. The pedals are seven levers in their slots, bright when they are off the middle notch.
import type { VisualFrame } from '@piano-model/engine';
import { harpLayout, harpLive, harpRecord, swingPx, type HarpState } from '../harp-draw.ts';
import { PEDAL_LEN, PEDAL_X, PEDAL_Y, STRINGS, STRING_X, STRING_Y0, STRING_Y1, pedalFoot, pedalOf, stopY } from '../harp-plan.ts';
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
    ctx.fillStyle = '#000';
    ctx.fill(path);
    ctx.restore();
  };
  // ---- the frame: the soundbox behind, the base, the column and its crown, the neck over the strings' tops
  mask(L.body);
  beam(ctx, L.body, V.blue, lw);
  beam(ctx, L.board, V.blue, lw + 0.4, { hot: !small });
  mask(L.base);
  beam(ctx, L.base, V.blueMid, 1);
  mask(L.column);
  beam(ctx, L.column, V.blue, lw);
  mask(L.crown);
  beam(ctx, L.crown, V.blue, lw);
  // ---- the strings
  for (let i = 0; i < STRINGS.length; i++) {
    const s = STRINGS[i];
    const x = X(STRING_X[i]);
    const y0 = Y(STRING_Y0[i]);
    const y1 = Y(stopY(i, lv.ped[pedalOf(i)]));
    const a = lv.amp[i];
    const w = swingPx(a, i, sc);
    const col = s.colour === 'red' ? V.red : s.colour === 'black' ? V.blue : V.blueDim;
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
        beam(ctx, p, V.amber, lw, { hot: a > 0.3 });
      }
    }
  }
  mask(L.neck);
  beam(ctx, L.neck, V.blue, lw);
  // ---- the pedals in their slots: up flat, the middle natural, down sharp
  beam(ctx, L.slots, V.blueDim, 1);
  for (let k = 0; k < 7; k++) {
    const [fx, fy] = pedalFoot(k, lv.ped[k]);
    const off = Math.abs(lv.ped[k]) > 0.02;
    const p = new Path2D();
    p.moveTo(X(PEDAL_X[k] - 0.035), Y(PEDAL_Y + 0.004));
    p.lineTo(X(fx), Y(fy));
    p.lineTo(X(fx + PEDAL_LEN * 0.5), Y(fy - 0.004));
    beam(ctx, p, off ? V.white : V.blue, lw + 0.3, { hot: off && !small });
  }
  ctx.restore();
  harpRecord(L, st, lv);
}
