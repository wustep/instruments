// The tuba on the vector display (see kit.ts): the stage's own drawing (tuba-draw.ts: the same plan in
// metres, the same fingering, pistons and lips, the same standing wave), as lines. Blue is the brass and its
// mechanism: every tube its two walls (a nearer tube hides what lies behind it), bright along the air's path
// for the fingering held and dim off it; the four casings, their stems and buttons going down under the
// fingers; the bell's flare with a few of its sections and its mouth. Amber is the bore's standing wave,
// hatched across the bore along the air's path (dashed through the valves) and opening out in the bell. At
// the mouthpiece the knobs' slots, drawn as on the horn (vector/horn.ts slots: the breath, the lips, the
// turbulence in their slit, the vibrato). The state object is the stage's, so a change of style carries the
// pistons and the wave over.
import type { VisualFrame } from '@piano-model/engine';
import { tubaLayout, tubaLive, tubaRecord, type TbLayout, type TubaState } from '../tuba-draw.ts';
import { BELL_X, BUTTON_Y, CASING_R, CASING_Y1, MOUTH_K, MP_DIR, MP_RIM, RIM_R, RIM_Y, TRAVEL, VALVE_X, bellR } from '../tuba-plan.ts';
import { airHatch, slots, strokeHatch } from './horn.ts';
import { V, beam, mix, seg } from './kit.ts';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** the bell's sections: three ellipses round its upright axis, each the flare's width there */
function bellSections(L: TbLayout): Path2D {
  const p = new Path2D();
  for (const d of [0.05, 0.14, 0.3]) {
    const r = bellR(d) * L.sc;
    const cx = L.ox + BELL_X * L.sc;
    const cy = L.oy - (RIM_Y - d) * L.sc;
    // (the near half: the far half is behind the flare)
    p.moveTo(cx - r, cy);
    p.ellipse(cx, cy, r, r * MOUTH_K, 0, Math.PI, 0, true);
  }
  return p;
}

/** The tuba from its front, as lines. `top`: the file player's px over the box's top. */
export function drawTubaV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TubaState, top = 0): void {
  const L = tubaLayout(W, H, top);
  const { sc } = L;
  const X = (x: number) => L.ox + x * sc;
  const Y = (y: number) => L.oy - y * sc;
  const now = performance.now();
  const lv = tubaLive(fr, st, now);
  const onPath = new Set(lv.air.runs.map((r) => r.id));
  // (a phone's stage or an ensemble's cell: thinner lines, fewer marks)
  const small = sc < 420;
  const lw = small ? 1 : 1.2;
  ctx.save();
  /** hide what lies behind a shape: lines only, but a nearer part still covers a farther one */
  const mask = (path: Path2D) => {
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fill(path);
    ctx.restore();
  };
  // ---- the bell: its flare's edges and sections (behind the body's tubes), the wave opening out in it
  const B = L.bell;
  mask(B.flare);
  beam(ctx, B.edges, V.blue, lw);
  beam(ctx, bellSections(L), V.blueDim, 1, { alpha: 0.8 });
  const hatch = lv.sounding ? airHatch(L, lv, small, bellR) : null;
  const fade = Math.min(1, 3 * lv.lvl);
  const wave = (id: string) => {
    const h = hatch?.get(id);
    if (h) strokeHatch(ctx, h, fade, small, lv.lvl);
  };
  wave('bell');
  // ---- the tubes, farthest first: each masks what is behind it, its walls bright on the air's path
  for (let layer = 0; layer <= 3; layer++) {
    for (const t of L.tubes) {
      if (t.layer !== layer) continue;
      const on = onPath.has(t.id);
      mask(t.body);
      beam(ctx, t.edges, on ? V.blue : V.blueDim, on ? lw : 1, { alpha: on ? 1 : 0.85 });
      if (on) wave(t.id);
    }
    if (layer === 0) beam(ctx, L.braces, V.blueDim, 1);
  }
  beam(ctx, L.ferrules, V.blueMid, 1, { alpha: 0.7 });
  // the mouth over everything behind it: its inside masked, the rim
  mask(B.mouth);
  beam(ctx, B.mouth, V.blue, lw + 0.3, { hot: !small });
  // ---- the valve block: the knuckles, the casings and their caps, each stem and button at its travel
  mask(L.knuckles);
  beam(ctx, L.knuckles, V.blue, 1);
  mask(L.casings);
  beam(ctx, L.casings, V.blue, lw);
  beam(ctx, L.caps, V.blueMid, 1);
  // the passages through the valves (dashed: the casings cover them)
  if (hatch) for (const [, h] of hatch) if (h.hidden) beam(ctx, h.line, V.amber, 1, { alpha: 0.5 * fade, dash: [2, 3] });
  VALVE_X.forEach((x, k) => {
    const q = clamp(lv.press[k], 0, 1);
    const by = BUTTON_Y - TRAVEL * lv.press[k];
    const c = mix(V.blueMid, V.white, 0.7 * q);
    seg(ctx, X(x), Y(CASING_Y1 + 0.011), X(x), Y(by), c, lw, { hot: q > 0.5 });
    seg(ctx, X(x - 0.0135), Y(by), X(x + 0.0135), Y(by), c, lw + 0.6, { hot: q > 0.5 });
    // (the piston inside its casing, going down with the stem)
    if (!small) seg(ctx, X(x - CASING_R * 0.7), Y(CASING_Y1 - 0.02 - TRAVEL * lv.press[k]), X(x + CASING_R * 0.7), Y(CASING_Y1 - 0.02 - TRAVEL * lv.press[k]), mix(V.blueDim, V.white, 0.5 * q), 1);
  });
  // ---- the mouthpiece, and the four slots at it (the breath, the lips, the noise, the vibrato)
  mask(L.mp);
  beam(ctx, L.mp, V.blue, lw);
  slots(ctx, L, lv, st, fr, now, small, lw, [MP_RIM[0], MP_RIM[1]], [MP_DIR[0], MP_DIR[1]], 0.02);
  // (the rim of the bell names where the sound leaves)
  if (lv.sounding && !small) seg(ctx, X(BELL_X - RIM_R), Y(RIM_Y), X(BELL_X + RIM_R), Y(RIM_Y), V.amber, 1, { alpha: 0.25 * fade });
  ctx.restore();
  tubaRecord(L, st, lv);
}
