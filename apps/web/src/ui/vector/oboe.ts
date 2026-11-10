// The oboe on the vector display (see kit.ts): the stage's own drawing (oboe-draw.ts: the same plan in
// metres, the same fingering, springs and reed, the same standing wave folded from the engine's bore
// snapshots), as lines. Blue is the wood and its keywork: each ring and cup crossed and bright when its
// hole is shut, each touch bright under its finger; amber is the bore's standing wave, hatched either side
// of the body over the sounding length (brightest where the pressure swings most) and a line along the
// axis. At the reed the knobs' slots mark where each acts: the breath (green) flowing into the reed, the
// lips' pinch on the blades (red), the turbulence in the reed's channel (pink) and the breath's vibrato
// (white). The state object is the stage's, so a change of style carries the keys, reed and wave over.

import type { VisualFrame } from '@piano-model/engine';
import { OB_KEYS, OB_LEN, OB_TOUCHES, RD_TIP_HW, keyV, obLobeBase, obR, obRecord, oboeLayout, oboeLive, reedHW, type OboeState } from '../oboe-draw.ts';
import { V, beam, dot, handle, heat, label, mix, ring, seg } from './kit.ts';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** how many brightnesses a hatched wave is drawn in (one path each) */
const LEVELS = 6;
const D2R = Math.PI / 180;
/** a repeatable scatter in 0..1 (the turbulence dots keep no state) */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** The oboe from the front, as lines: the wood's outline with its rings and joints, the reed (cane,
 *  thread, staple, cork) and the opening at its tip fluttering with the engine's reed; the rods and
 *  pillars; each ring, plate and cup a circle, crossed and bright while its hole is shut; the touches
 *  bright under the fingers; the standing wave as hatched lobes either side over the sounding length and
 *  a line along the axis; the four slots at the reed. `top`: the file player's px over the box's top. */
export function drawOboeV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: OboeState, top = 0): void {
  const L = oboeLayout(W, H, top);
  const { sc, c, Hm } = L;
  const X = (x: number) => L.x0 + x * sc;
  const Y = (v: number) => c + v * sc;
  const now = performance.now();
  const lv = oboeLive(fr, st, now);
  const { lvl, ph, end, keyPos } = lv;
  // (a phone's stage or an ensemble's cell: thinner lines, smaller handles, fewer marks)
  const small = sc < 900;
  const lw = small ? 1 : 1.25;
  ctx.save();
  if (L.vertical) {
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
  }
  // ---- the standing wave, under the instrument's lines: hatched lobes either side of the body
  if (lv.sounding) {
    const hm = Hm * Math.min(1, 0.35 + lvl);
    const gap = small ? 4 : 7;
    const n = Math.max(8, Math.round((end * sc) / gap));
    const fade = Math.min(1, 3 * lvl);
    for (const sgn of [-1, 1]) {
      const ribs = Array.from({ length: LEVELS }, () => new Path2D());
      const env = new Path2D();
      // (the reed is a pressure antinode: the envelope starts at its fullest, its end rounded off)
      const A0 = Math.min(1, Math.abs(lv.ampAt(0))) * hm;
      const b0 = Y(sgn * obLobeBase(0));
      env.moveTo(X(0) - 0.5 * A0, b0);
      env.quadraticCurveTo(X(0) - 0.5 * A0, b0 + sgn * A0, X(0), b0 + sgn * A0);
      for (let i = 0; i <= n; i++) {
        const x = (end * i) / n;
        const a = lv.ampAt(x);
        const A = Math.min(1, Math.abs(a));
        const y0 = Y(sgn * obLobeBase(Math.min(OB_LEN, x)));
        env.lineTo(X(x), y0 + sgn * hm * A);
        // (the lobe's pressure swings to this side of the body, then to the other)
        const e = A * (0.3 + 0.7 * Math.max(0, Math.sign(a) * sgn * ph));
        const k = Math.round(e * LEVELS);
        if (k < 1 || A < 0.04) continue;
        ribs[k - 1].moveTo(X(x), y0 + sgn * 2.5);
        ribs[k - 1].lineTo(X(x), y0 + sgn * Math.max(3.5, hm * A));
      }
      env.lineTo(X(end), Y(sgn * obLobeBase(Math.min(OB_LEN, end))));
      ribs.forEach((p, i) => {
        const l = (i + 1) / LEVELS;
        beam(ctx, p, heat(0.25 + 0.75 * l), 1, { alpha: Math.min(1, (0.18 + 0.82 * l) * fade), butt: true });
      });
      beam(ctx, env, V.amber, 1, { alpha: (0.3 + 0.35 * lvl) * fade });
    }
  }
  // ---- the reed: cane (its scrape's edge and spine), thread (its winding), staple, cork
  beam(ctx, L.cane, V.blue, lw);
  beam(ctx, L.scrape, V.blueDim, 1, { alpha: 0.8 });
  beam(ctx, L.spine, V.blueDim, 1, { alpha: 0.7 });
  beam(ctx, L.thread, V.blueMid, lw);
  if (!small) beam(ctx, L.winding, V.blueDim, 0.8, { alpha: 0.8, butt: true });
  beam(ctx, L.staple, V.blueMid, 1);
  beam(ctx, L.cork, V.blueMid, 1);
  // ---- the wood: its outline, the rings and joints, the bell's mouth
  beam(ctx, L.silver, V.blueMid, 1, { alpha: 0.9 });
  beam(ctx, L.seams, V.blueMid, 1, { alpha: 0.7, butt: true });
  beam(ctx, L.body, V.blue, lw + 0.1);
  beam(ctx, L.mouth, V.blue, lw, { hot: !small });
  beam(ctx, L.mouthIn, V.blueMid, 1);
  // ---- the mechanism: rods, hinge tubes, the touches, the pillars
  beam(ctx, L.rods, V.blueMid, 1);
  beam(ctx, L.hinges, V.blueDim, 1);
  OB_TOUCHES.forEach((t, i) => {
    const q = lv.touchPress[i];
    beam(ctx, L.touches[i], mix(t.fixed ? V.blueDim : V.blueMid, V.blue, q), lw * (t.back ? 0.8 : 1) + 0.5 * q, { alpha: (t.back ? 0.55 : 0.9) + 0.1 * q, hot: q > 0.5 });
  });
  beam(ctx, L.posts, V.blueMid, 1);
  // ---- the keys: each a circle on a hairline arm from its hinge; shut, bright and crossed
  const arms = new Path2D();
  OB_KEYS.forEach((k, i) => {
    const cphi = Math.cos(k.phi * D2R);
    const sphi = Math.sin(k.phi * D2R);
    const p = keyPos[i];
    const lift = (k.style === 'cup' ? p : 0) * 0.0021 * sc;
    const cx = X(k.x);
    const cy = Y(keyV(k)) + lift * sphi;
    const rx = k.r * sc;
    const ry = Math.max(0.5, k.r * sc * cphi);
    const rod = Y(k.rod);
    arms.moveTo(cx, cy + (Math.sign(rod - cy) || 1) * ry);
    arms.lineTo(cx, rod);
    const shut = clamp(1 - p, 0, 1);
    const s = 0.965 + 0.035 * p;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * s, ry * s, 0, 0, 2 * Math.PI);
    beam(ctx, null, mix(V.blueMid, V.blue, shut), lw + 0.5 * shut, { alpha: 0.75 + 0.25 * shut, hot: shut > 0.5 && k.style !== 'cup' });
    if (k.style !== 'cup') {
      // a ring's tone hole (L1's plate: its small perforation, towards the reed)
      const hx = k.style === 'plate' ? cx - 0.0029 * sc : cx;
      const hr = k.style === 'plate' ? 0.0011 * sc : k.hole * 1.25 * sc;
      const shutH = k.style === 'plate' ? clamp(1 - lv.half, 0, 1) : shut;
      ring(ctx, hx, cy, Math.max(0.6, hr), mix(V.blueMid, V.blue, shutH), 1, { alpha: 0.8 + 0.2 * shutH });
      if (shutH > 0.05) dot(ctx, hx, cy, Math.max(0.6, hr * 0.7), V.blue, 0.8 * shutH);
    }
    if (shut > 0.05) {
      // shut: a cross on the pad (on a ring, the finger over its hole)
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
  const hl = RD_TIP_HW * 0.94 * sc;
  const o = Math.max(0, lv.open) * 0.0022 * sc;
  const eye = new Path2D();
  eye.moveTo(X(0), Y(0) - hl);
  eye.bezierCurveTo(X(0) - o * 1.33, Y(0) - hl * 0.45, X(0) - o * 1.33, Y(0) + hl * 0.45, X(0), Y(0) + hl);
  eye.bezierCurveTo(X(0) + o * 1.33, Y(0) + hl * 0.45, X(0) + o * 1.33, Y(0) - hl * 0.45, X(0), Y(0) - hl);
  beam(ctx, eye, V.blue, lw, { hot: true });
  // ---- the slots at the reed, each where its knob acts
  const hr = clamp(0.0034 * sc, 2.6, 6);
  const live = Math.min(1, 0.45 + 2 * lv.blow);
  const t = now / 1000;
  const xb = -Math.max(0.012, (hr + 8) / sc);
  // breath (green): from the lips into the reed, flowing
  if (lv.blow > 0.02) {
    const flow = new Path2D();
    for (const j of [-1, 0, 1]) {
      flow.moveTo(X(xb), Y(j * 0.003));
      flow.quadraticCurveTo(X(xb * 0.4), Y(j * 0.0016), X(-0.0012), Y(j * 0.0005));
    }
    const d = small ? 3 : 5;
    beam(ctx, flow, V.green, small ? 1 : 1.2, { alpha: Math.min(1, 0.4 + lv.blow) * (1 + 2.5 * lv.vib), dash: [d, d * 0.8] });
    // noise (pink): turbulence in the reed's channel, by the opening
    const frame = Math.floor(t * 20);
    const nd = small ? 4 : 7;
    for (let i = 0; i < nd; i++) {
      const hx = hash(frame * 13 + i * 7.3);
      const hv = hash(frame * 5 + i * 3.1 + 40);
      dot(ctx, X(0.0005 + hx * 0.006), Y((hv * 2 - 1) * 0.0022), small ? 0.9 : 1.2, V.pink, Math.min(1, 0.35 + lv.blow) * (0.5 + 0.5 * hash(frame + i)));
    }
  }
  // the lips' handle (green: the breath), and round it the vibrato's ring (white), breathing with it
  const xh = X(xb) - hr - 2;
  seg(ctx, xh + hr, Y(0), X(xb), Y(0), V.green, 1, { alpha: 0.5 * live });
  handle(ctx, xh, Y(0), V.green, hr, live);
  ring(ctx, xh, Y(0), hr + 3.5 + clamp(lv.vib * 60, -2.5, 6), V.white, 1, { alpha: 0.5 + 0.5 * Math.min(1, Math.abs(lv.vib) * 30 + lv.blow) });
  // the embouchure (red): the lips' pinch on the blades, a little from the tip, its handle beside the reed
  const xl = 0.0065;
  const hw = reedHW(xl);
  const pinch = new Path2D();
  for (const sg of [-1, 1]) {
    pinch.moveTo(X(xl - 0.0035), Y(sg * (hw + 0.0012)));
    pinch.lineTo(X(xl + 0.0035), Y(sg * (hw + 0.0012)));
  }
  beam(ctx, pinch, V.red, 1, { alpha: 0.85 * live });
  const yr = Y(-(hw + 0.0012)) - Math.max(0.0085 * sc, hr + 6);
  seg(ctx, X(xl), Y(-(hw + 0.0012)), X(xl), yr + hr, V.red, 1, { alpha: 0.5 * live });
  handle(ctx, X(xl), yr, V.red, hr, live);
  // ---- the wave's line along the bore's axis, over everything (its nodes stand still)
  if (lv.sounding) {
    const axis = new Path2D();
    const n = small ? 70 : 150;
    for (let i = 0; i <= n; i++) {
      const x = (end * i) / n;
      const v = lv.ampAt(x) * ph * Math.min(0.0042, 0.6 * obR(Math.min(OB_LEN, x)));
      if (i) axis.lineTo(X(x), Y(-v));
      else axis.moveTo(X(x), Y(-v));
    }
    beam(ctx, axis, V.amber, small ? 1.2 : 1.5, { alpha: Math.min(1, 3 * lvl), hot: true });
    // (the sounding length's far end: where the wave leaves the bore, past the first open hole)
    if (!small && !L.vertical) label(ctx, `${Math.round(end * 1000)} mm`, X(Math.min(end, OB_LEN)) + 6, Y(-obR(Math.min(end, OB_LEN))) - 10, { size: 10, color: V.amber, alpha: 0.75 * Math.min(1, 3 * lvl) });
  }
  ctx.restore();
  obRecord(L, W, st, lv.fingers);
}
