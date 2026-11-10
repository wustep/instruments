// The bassoon on the vector display (see kit.ts): the stage's own drawing (bassoon-draw.ts: the same plan
// in metres, the same fingering, springs and reed, the same standing wave folded from the engine's bore
// snapshots), as lines. Blue is the wood and its keywork: each hole, ring and pad a circle, crossed and
// bright when shut, each touch bright under its finger, the thumbs' keys and pads on the back dashed; amber
// is the bore's standing wave, hatched beside each leg over the sounding length (brightest where the
// pressure swings most) and a line along the folded bore, its nodes marked. At the reed the knobs' slots
// mark where each acts: the breath (green) flowing into the tip, the lips' hold on the blades (red), the
// turbulence in the reed's channel (pink) and the breath's vibrato (white). The state object is the
// stage's, so a change of style carries the keys, reed and wave over.

import type { VisualFrame } from '@piano-model/engine';
import { BS_BORE, BS_KEYS, X_ASC, BS_TOUCHES, LEGS, boreD, boreHU, borePx, bsFrame, bsRecord, bassoonLayout, bassoonLive, reedEyePath, type BassoonState } from '../bassoon-draw.ts';
import { V, beam, dot, handle, heat, label, mix, ring, seg } from './kit.ts';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** how many brightnesses a hatched wave is drawn in (one path each) */
const LEVELS = 6;
/** a repeatable scatter in 0..1 (the turbulence dots keep no state) */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** The bassoon from the front, as lines: the boot, wing, long joint and bell with their rings, the bocal
 *  and the reed (its opening following the engine's reed); the rods and pillars; each hole, ring and pad a
 *  circle, crossed and bright while shut; the touches bright under the fingers, the back's dashed; the
 *  standing wave hatched beside each leg and a line along the bore; the four slots at the reed. `top`: the
 *  file player's px over the box's top. */
export function drawBassoonV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: BassoonState, top = 0): void {
  const L = bassoonLayout(W, H, top);
  const { sc, Hm } = L;
  const X = (h: number) => L.x0 + h * sc;
  const Y = (u: number) => L.c + u * sc;
  const now = performance.now();
  const lv = bassoonLive(fr, st, now);
  const { lvl, ph, end, keyPos } = lv;
  // (a phone's stage or an ensemble's cell: thinner lines, smaller handles, fewer marks)
  const small = sc < 600;
  const lw = small ? 1 : 1.25;
  ctx.save();
  bsFrame(ctx, L);
  // ---- the standing wave, under the instrument's lines: hatched lobes beside each leg
  if (lv.sounding) {
    const hm = Hm * Math.min(1, 0.35 + lvl);
    const gap = small ? 4 : 6;
    const fade = Math.min(1, 3 * lvl);
    for (const g of LEGS) {
      const b = Math.min(end, g.b);
      if (b <= g.a) continue;
      const ribs = Array.from({ length: LEVELS }, () => new Path2D());
      const env = new Path2D();
      const n = Math.max(8, Math.round(((b - g.a) * sc) / gap));
      const y0 = Y(g.base);
      for (let i = 0; i <= n; i++) {
        const x = g.a + ((b - g.a) * i) / n;
        const [h] = boreHU(x);
        const a = lv.ampAt(x);
        const A = Math.min(1, Math.abs(a));
        if (i === 0) {
          env.moveTo(X(h), y0);
          env.lineTo(X(h), y0 + g.sgn * hm * A);
        } else env.lineTo(X(h), y0 + g.sgn * hm * A);
        // (the lobe's pressure swings to this side, then to the other)
        const e = A * (0.3 + 0.7 * Math.max(0, Math.sign(a) * g.sgn * ph));
        const k = Math.round(e * LEVELS);
        if (k < 1 || A < 0.04) continue;
        ribs[k - 1].moveTo(X(h), y0 + g.sgn * 2.5);
        ribs[k - 1].lineTo(X(h), y0 + g.sgn * Math.max(3.5, hm * A));
      }
      const [hb] = boreHU(b);
      env.lineTo(X(hb), y0);
      ribs.forEach((p, i) => {
        const l = (i + 1) / LEVELS;
        beam(ctx, p, heat(0.25 + 0.75 * l), 1, { alpha: Math.min(1, (0.18 + 0.82 * l) * fade), butt: true });
      });
      beam(ctx, env, V.amber, 1, { alpha: (0.3 + 0.35 * lvl) * fade });
    }
  }
  // ---- the wood: the joints' outlines, the rings and caps, the wing's ridge, the bell's mouth
  beam(ctx, L.long, V.blue, lw + 0.1);
  beam(ctx, L.boot, V.blue, lw + 0.1);
  beam(ctx, L.wing, V.blue, lw + 0.1);
  beam(ctx, L.ridge, V.blueDim, 1, { alpha: 0.8 });
  beam(ctx, L.bootRing, V.blueMid, 1, { alpha: 0.9 });
  beam(ctx, L.cap, V.blueMid, 1, { alpha: 0.9 });
  beam(ctx, L.bellRing, V.blueMid, 1, { alpha: 0.9 });
  beam(ctx, L.wingCap, V.blueMid, 1, { alpha: 0.9 });
  beam(ctx, L.lip, V.blue, lw);
  beam(ctx, L.seams, V.blueMid, 1, { alpha: 0.6, butt: true });
  beam(ctx, L.mouth, V.blue, lw, { hot: !small });
  beam(ctx, L.mouthIn, V.blueMid, 1);
  beam(ctx, L.rest, V.blueMid, 1);
  beam(ctx, L.restStem, V.blueDim, 1);
  if (!small) beam(ctx, L.chimneys, V.blueDim, 1, { alpha: 0.6, dash: [2, 3], butt: true });
  // ---- the bocal and the reed: its blades, the wires, the thread
  beam(ctx, L.bocal, V.blue, lw);
  beam(ctx, L.nipple, V.blueMid, 1);
  beam(ctx, L.blades, V.blue, lw);
  beam(ctx, L.wires, V.blueMid, 1, { butt: true });
  beam(ctx, L.thread, V.blueMid, 1);
  if (!small) beam(ctx, L.spine, V.blueDim, 0.8, { alpha: 0.7 });
  // ---- the mechanism: rods, hinge tubes, the touches (the back's dashed), the pillars
  beam(ctx, L.rods, V.blueMid, 1);
  beam(ctx, L.hinges, V.blueDim, 1);
  BS_TOUCHES.forEach((t, i) => {
    const q = lv.touchPress[i];
    beam(ctx, L.touches[i], mix(t.fixed || t.back ? V.blueDim : V.blueMid, V.blue, q), lw * (t.back ? 0.8 : 1) + 0.5 * q, { alpha: (t.back ? 0.6 : 0.9) + 0.1 * q, hot: q > 0.5, dash: t.back && q < 0.5 ? [3, 3] : undefined });
  });
  beam(ctx, L.posts, V.blueMid, 1);
  // ---- the keys: each a circle (a side pad a narrow ellipse) on a hairline arm from its hinge; shut,
  // bright and crossed (the back's dashed, bright while their key moves them)
  const arms = new Path2D();
  BS_KEYS.forEach((k, i) => {
    const p = keyPos[i];
    const shut = clamp(1 - p, 0, 1);
    const cx = X(k.h);
    let cy = Y(k.u);
    let rx = k.r * sc;
    let ry = rx;
    if (k.style === 'side') {
      cy += (k.left ? -1 : 1) * p * 0.0024 * sc;
      ry = Math.max(0.6, 0.0013 * sc);
    }
    if (k.style === 'back') {
      const moved = k.closed ? p : 1 - p;
      ctx.beginPath();
      ctx.arc(cx, cy, rx, 0, 2 * Math.PI);
      beam(ctx, null, mix(V.blueDim, V.blue, moved), 1 + 0.5 * moved, { alpha: 0.55 + 0.45 * moved, dash: moved < 0.5 ? [3, 3] : undefined, hot: moved > 0.5 });
      return;
    }
    if (k.rod && k.style !== 'side') {
      const rod = Y(k.rod);
      if (Math.abs(rod - cy) > ry) {
        arms.moveTo(cx, cy + Math.sign(rod - cy) * ry);
        arms.lineTo(cx, rod);
      }
    }
    const s = 0.965 + 0.035 * p;
    rx *= s;
    ry *= s;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    beam(ctx, null, mix(V.blueMid, V.blue, shut), lw + 0.5 * shut, { alpha: 0.75 + 0.25 * shut, hot: shut > 0.5 && (k.style === 'hole' || k.style === 'ring') });
    if (k.style === 'hole' || k.style === 'ring') {
      const hr = k.hole * sc;
      ring(ctx, cx, cy, Math.max(0.6, hr), mix(V.blueMid, V.blue, shut), 1, { alpha: 0.8 + 0.2 * shut });
      // (L1 rolled down for the half-hole: its upper half left open)
      const q = lv.keyPress[i];
      if (q > 0.05) dot(ctx, cx - (k.id === 'l1' ? lv.half * hr * 0.5 : 0), cy, Math.max(0.6, hr * 0.7 * (k.id === 'l1' ? 1 - 0.4 * lv.half : 1)), V.blue, 0.8 * q);
    }
    if (shut > 0.05 && rx > 1.5 && ry > 1.5) {
      const kx = 0.5 * Math.SQRT1_2;
      ctx.beginPath();
      ctx.moveTo(cx - rx * kx, cy - ry * kx);
      ctx.lineTo(cx + rx * kx, cy + ry * kx);
      ctx.moveTo(cx + rx * kx, cy - ry * kx);
      ctx.lineTo(cx - rx * kx, cy + ry * kx);
      beam(ctx, null, V.blue, lw, { alpha: shut * (k.style === 'cup' ? 0.75 : 1), hot: true });
    }
  });
  beam(ctx, arms, V.blueDim, 1);
  // ---- the reed's tip: the opening between the blades, an eye (exaggerated), shut once a cycle when loud
  beam(ctx, reedEyePath(L, Math.max(0, lv.open) * 0.001 * sc), V.blue, lw, { hot: true });
  // ---- the slots at the reed, each where its knob acts
  const hr = clamp(0.0034 * sc, 2.6, 6);
  const live = Math.min(1, 0.45 + 2 * lv.blow);
  const t = now / 1000;
  const nx = -L.tdy;
  const ny = L.tdx;
  const out = (a: number, w: number): [number, number] => [L.tipX + L.tdx * a * sc + nx * w * sc, L.tipY + L.tdy * a * sc + ny * w * sc];
  // (the lips' handle out along the reed's axis, kept inside the box: an Orchestra cell leaves a narrow
  // margin past the tip)
  const room = (L.tipY - ((L.vertical ? 0 : L.top) + hr + 5)) / (-L.tdy * sc);
  const aH = Math.max(0.004, Math.min(Math.max(0.012, (hr + 8) / sc) + (hr + 2) / sc, room));
  const xb = Math.max(0.002, aH - (hr + 2) / sc);
  // breath (green): from the lips into the tip, flowing
  if (lv.blow > 0.02) {
    const flow = new Path2D();
    for (const j of [-1, 0, 1]) {
      flow.moveTo(...out(xb, j * 0.0042));
      const m = out(xb * 0.4, j * 0.0024);
      const e = out(0.0016, j * 0.0008);
      flow.quadraticCurveTo(m[0], m[1], e[0], e[1]);
    }
    const d = small ? 3 : 5;
    beam(ctx, flow, V.green, small ? 1 : 1.2, { alpha: Math.min(1, 0.4 + lv.blow) * (1 + 2.5 * lv.vib), dash: [d, d * 0.8] });
    // noise (pink): turbulence in the reed's channel, just inside the tip
    const frame = Math.floor(t * 20);
    const nd = small ? 4 : 7;
    for (let i = 0; i < nd; i++) {
      const [px, py] = out(-0.0006 - hash(frame * 13 + i * 7.3) * 0.008, (hash(frame * 5 + i * 3.1 + 40) * 2 - 1) * 0.004);
      dot(ctx, px, py, small ? 0.9 : 1.2, V.pink, Math.min(1, 0.35 + lv.blow) * (0.5 + 0.5 * hash(frame + i)));
    }
  }
  // the lips' handle (green: the breath) past the tip, and round it the vibrato's ring (white)
  const [hx, hy] = out(aH, 0);
  const [bx, by] = out(xb, 0);
  seg(ctx, hx - L.tdx * hr, hy - L.tdy * hr, bx, by, V.green, 1, { alpha: 0.5 * live });
  handle(ctx, hx, hy, V.green, hr, live);
  ring(ctx, hx, hy, hr + 3.5 + clamp(lv.vib * 60, -2.5, 6), V.white, 1, { alpha: 0.5 + 0.5 * Math.min(1, Math.abs(lv.vib) * 30 + lv.blow) });
  // the embouchure (red): the lips on both blades a little from the tip, its handle beside
  const pinch = new Path2D();
  for (const sg of [-1, 1]) {
    pinch.moveTo(...out(-0.004, sg * 0.0084));
    pinch.lineTo(...out(-0.014, sg * 0.0082));
  }
  beam(ctx, pinch, V.red, 1, { alpha: 0.85 * live });
  const [ex, ey] = out(-0.009, 0.0084);
  const [rx, ry] = out(-0.009, 0.0084 + Math.max(0.0085, (hr + 6) / sc));
  seg(ctx, ex, ey, rx, ry, V.red, 1, { alpha: 0.5 * live });
  handle(ctx, rx, ry, V.red, hr, live);
  // ---- the wave's line along the bore, over everything (its nodes stand still, marked)
  if (lv.sounding) {
    const axis = new Path2D();
    const n = small ? 140 : 260;
    const e = Math.min(end, BS_BORE);
    for (let i = 0; i <= n; i++) {
      const x = (e * i) / n;
      const b = borePx(L, x);
      const v = lv.ampAt(x) * ph * Math.min(0.0045, 0.3 * boreD(x) + 0.0012) * sc;
      if (i) axis.lineTo(b.px + b.nx * v, b.py + b.ny * v);
      else axis.moveTo(b.px + b.nx * v, b.py + b.ny * v);
    }
    beam(ctx, axis, V.amber, small ? 1.2 : 1.5, { alpha: Math.min(1, 3 * lvl), hot: true });
    const ticks = new Path2D();
    for (const x of lv.nodes) {
      const b = borePx(L, x);
      const w = 0.006 * sc;
      ticks.moveTo(b.px - b.nx * w, b.py - b.ny * w);
      ticks.lineTo(b.px + b.nx * w, b.py + b.ny * w);
    }
    beam(ctx, ticks, V.amber, 1, { alpha: 0.6 * Math.min(1, 3 * lvl), butt: true });
    // (the sounding length's far end: where the wave leaves the bore, past the first open hole)
    if (!small && !L.vertical) {
      const b = borePx(L, e);
      label(ctx, `${Math.round(end * 1000)} mm`, b.px + 6, e > X_ASC ? Y(0.064) : Y(-0.052), { size: 10, color: V.amber, alpha: 0.75 * Math.min(1, 3 * lvl) });
    }
  }
  ctx.restore();
  bsRecord(L, st, lv.fingers);
}
