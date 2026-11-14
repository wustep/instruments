// The zephyr on the vector display (see kit.ts): the stage's own drawing (zephyr-draw.ts: the same plan in
// metres, the same ribbons, slots and keys, the engine's own swings), as lines. Blue is the frame: the mast
// and the blower, the yard, the boom and its keyboard, the blade; the ribbons are thin lines, the Cs red, the
// accidentals' dim. Amber is what sounds: each swinging ribbon's envelope and, for the loudest, its own
// shape. White is the wind: the slot of each key that is down.
import type { VisualFrame } from '@piano-model/engine';
import { BLOWS, swingPx, zephyrLayout, zephyrLive, zephyrRecord, type ZephyrState } from '../zephyr-draw.ts';
import { KEYS_X0, KEYS_X1, KEYS_Y0, KEYS_Y1, PITCH, RIBBONS, RIBBON_X, RIBBON_Y0, RIBBON_Y1, kindOf, slotY, whiteX } from '../zephyr-plan.ts';
import { V, beam, heat, seg } from './kit.ts';

/** The zephyr from its player's side, as lines. `top`: the file player's px over the box's top. */
export function drawZephyrV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: ZephyrState, top = 0): void {
  const L = zephyrLayout(W, H, top);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const lv = zephyrLive(fr, st, performance.now());
  const small = sc < 150;
  const lw = small ? 1 : 1.2;
  ctx.save();
  const mask = (path: Path2D) => {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fill(path);
    ctx.restore();
  };
  // ---- the frame behind the ribbons: the blower, the feet and the leg, the blade and its duct
  beam(ctx, L.blower, V.blueMid, 1);
  beam(ctx, L.feet, V.blueMid, 1);
  beam(ctx, L.legs, V.blueMid, 1);
  beam(ctx, L.blade, V.blueDim, 1);
  beam(ctx, L.duct, V.blue, lw);
  // ---- the wind: the slot of each key that is down, a bright stroke either side of its ribbon
  for (let i = 0; i < RIBBONS.length; i++) {
    const w = lv.wind[i];
    if (w <= BLOWS) continue;
    const [a, b] = slotY(i);
    const x = X(RIBBON_X[i]);
    const hw = Math.max(2, 0.45 * PITCH * sc);
    for (const s of [-1, 1]) seg(ctx, x + s * hw, Y(a), x + s * hw, Y(b), V.white, lw, { alpha: Math.min(1, 0.35 + 0.65 * w), hot: w > 0.6 && !small });
  }
  mask(L.mast);
  beam(ctx, L.mast, V.blue, lw);
  mask(L.boom);
  beam(ctx, L.boom, V.blue, lw);
  beam(ctx, L.board, V.blue, lw + 0.4, { hot: !small });
  beam(ctx, L.bridge, V.blueMid, 1);
  // ---- the keyboard: the naturals' edges, the accidentals as ticks; a key that blows is bright
  if (!small) {
    const y0 = Y(KEYS_Y1);
    const y1 = Y(KEYS_Y0);
    seg(ctx, X(KEYS_X0), y0, X(KEYS_X1), y0, V.blueMid, 1);
    seg(ctx, X(KEYS_X0), y1, X(KEYS_X1), y1, V.blueMid, 1);
    let k = 0;
    for (let i = 0; i < RIBBONS.length; i++) {
      const dn = lv.wind[i] > BLOWS;
      if (RIBBONS[i].sharp) {
        const x = X(RIBBON_X[i]);
        seg(ctx, x, y0 - 0.45 * (y1 - y0), x, y0 + 0.2 * (y1 - y0), dn ? V.white : V.blueMid, dn ? lw + 0.4 : 1, { butt: true, hot: dn });
        continue;
      }
      const x0 = X(whiteX(k));
      const x1 = X(whiteX(k + 1));
      seg(ctx, x0, y0, x0, y1, V.blueDim, 1, { butt: true });
      if (dn) seg(ctx, x0 + 1.5, (y0 + y1) / 2, x1 - 1.5, (y0 + y1) / 2, V.white, lw + 0.6, { hot: true });
      k++;
    }
    seg(ctx, X(KEYS_X1), y0, X(KEYS_X1), y1, V.blueDim, 1, { butt: true });
  }
  // ---- the ribbons
  for (let i = 0; i < RIBBONS.length; i++) {
    const x = X(RIBBON_X[i]);
    const y0 = Y(RIBBON_Y0[i]);
    const y1 = Y(RIBBON_Y1[i]);
    const a = lv.amp[i];
    const w = swingPx(a, i, sc);
    const kind = kindOf(i);
    const col = kind === 'c' ? V.red : kind === 'sharp' ? V.blueDim : V.blue;
    seg(ctx, x, y1, x, y0, col, 1, { alpha: kind === 'c' ? 0.95 : small ? 0.5 : kind === 'sharp' ? 0.75 : 0.7, butt: true });
    if (w > 0) {
      // what sounds, in amber: the envelope either side, and the loudest ribbons' own shapes
      const env = new Path2D();
      env.moveTo(x, y1);
      env.quadraticCurveTo(x + 2 * w, (y0 + y1) / 2, x, y0);
      env.quadraticCurveTo(x - 2 * w, (y0 + y1) / 2, x, y1);
      beam(ctx, env, heat(0.35 + 0.65 * Math.min(1, a * 2.5)), 1, { alpha: 0.35 + 0.6 * Math.min(1, a * 3) });
      const sh = lv.shapes.get(i);
      if (sh && sh.length > 2) {
        let pk = 1e-12;
        for (let q = 0; q < sh.length; q++) pk = Math.max(pk, Math.abs(sh[q]));
        const p = new Path2D();
        for (let q = 0; q < sh.length; q++) {
          const u = q / (sh.length - 1);
          const px = x + (sh[q] / pk) * w;
          const py = y0 + (y1 - y0) * u;
          if (q) p.lineTo(px, py);
          else p.moveTo(px, py);
        }
        beam(ctx, p, V.amber, lw, { hot: a > 0.3 });
      }
    }
  }
  // ---- the yard over the ribbons' tops, its post
  mask(L.post);
  beam(ctx, L.post, V.blue, lw);
  mask(L.yard);
  beam(ctx, L.yard, V.blue, lw);
  ctx.restore();
  zephyrRecord(L, st, lv);
}
