// The clarinet on the vector display (see kit.ts): the stage's own drawing (clarinet-draw.ts: the same plan
// in metres, the same fingering, springs and reed, the same standing wave folded from the engine's bore
// snapshots), as lines. Blue is the wood and its keywork: each ring and cup crossed and bright when its
// hole is shut, each touch bright under its finger, the thumb's ring and the register key on the back
// dashed; amber is the bore's standing wave, hatched either side of the body over the sounding length
// (brightest where the pressure swings most) and a line along the axis, its quarter-waves marked. At the
// mouthpiece the knobs' slots mark where each acts: the breath (green) flowing into the tip, the lips' hold
// on the reed (red), the turbulence in the reed's channel (pink) and the breath's vibrato (white). The
// state object is the stage's, so a change of style carries the keys, reed and wave over.

import type { VisualFrame } from '@piano-model/engine';
import { CL_KEYS, CL_LEN, CL_TOUCHES, clBore, clLobeBase, clR, clRecord, clarinetLayout, clarinetLive, keyV, mpHW, tipEyePaths, type ClarinetState } from '../clarinet-draw.ts';
import { V, beam, breathFlow, dot, handle, heat, label, mix, ring, seg } from './kit.ts';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** how many brightnesses a hatched wave is drawn in (one path each) */
const LEVELS = 6;
const D2R = Math.PI / 180;
/** a repeatable scatter in 0..1 (the turbulence dots keep no state) */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** The clarinet from the front, as lines: the mouthpiece's beak, the ligature and its screws, the reed
 *  behind (dashed) and the opening at its tip following the engine's reed; the joints' outline with its
 *  rings, the rods and pillars; each ring, plain hole and cup a circle, crossed and bright while its hole is
 *  shut; the touches bright under the fingers; the standing wave as hatched lobes either side over the
 *  sounding length and a line along the axis; the four slots at the mouthpiece. `top`: the file player's
 *  px over the box's top. */
export function drawClarinetV(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: ClarinetState, top = 0): void {
  const L = clarinetLayout(W, H, top);
  const { sc, c, Hm } = L;
  const X = (x: number) => L.x0 + x * sc;
  const Y = (v: number) => c + v * sc;
  const now = performance.now();
  const lv = clarinetLive(fr, st, now);
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
      const b0 = Y(sgn * clLobeBase(0));
      env.moveTo(X(0) - 0.5 * A0, b0);
      env.quadraticCurveTo(X(0) - 0.5 * A0, b0 + sgn * A0, X(0), b0 + sgn * A0);
      for (let i = 0; i <= n; i++) {
        const x = (end * i) / n;
        const a = lv.ampAt(x);
        const A = Math.min(1, Math.abs(a));
        const y0 = Y(sgn * clLobeBase(Math.min(CL_LEN, x)));
        env.lineTo(X(x), y0 + sgn * hm * A);
        // (the lobe's pressure swings to this side of the body, then to the other)
        const e = A * (0.3 + 0.7 * Math.max(0, Math.sign(a) * sgn * ph));
        const k = Math.round(e * LEVELS);
        if (k < 1 || A < 0.04) continue;
        ribs[k - 1].moveTo(X(x), y0 + sgn * 2.5);
        ribs[k - 1].lineTo(X(x), y0 + sgn * Math.max(3.5, hm * A));
      }
      env.lineTo(X(end), Y(sgn * clLobeBase(Math.min(CL_LEN, end))));
      ribs.forEach((p, i) => {
        const l = (i + 1) / LEVELS;
        beam(ctx, p, heat(0.25 + 0.75 * l), 1, { alpha: Math.min(1, (0.18 + 0.82 * l) * fade), butt: true });
      });
      beam(ctx, env, V.amber, 1, { alpha: (0.3 + 0.35 * lvl) * fade });
    }
  }
  // ---- the mouthpiece: its beak, the reed behind it (dashed), the ligature's sleeve and screws
  beam(ctx, L.reed, V.blueDim, 1, { alpha: 0.8, dash: [3, 3] });
  beam(ctx, L.vamp, V.blueDim, 1, { alpha: 0.55, dash: [3, 3] });
  beam(ctx, L.mp, V.blue, lw);
  beam(ctx, L.mpRidge, V.blueDim, 1, { alpha: 0.6 });
  beam(ctx, L.lig, V.blueMid, lw);
  if (!small) beam(ctx, L.ligRib, V.blueDim, 0.8, { alpha: 0.8, butt: true });
  beam(ctx, L.screwTabs, V.blueMid, 1);
  beam(ctx, L.screwHeads, V.blueMid, 1);
  if (!small) beam(ctx, L.screwKnurl, V.blueDim, 0.8, { alpha: 0.7, butt: true });
  // ---- the wood: its outline, the rings and joints, the bell's mouth
  beam(ctx, L.silver, V.blueMid, 1, { alpha: 0.9 });
  beam(ctx, L.seams, V.blueMid, 1, { alpha: 0.7, butt: true });
  beam(ctx, L.body, V.blue, lw + 0.1);
  beam(ctx, L.mouth, V.blue, lw, { hot: !small });
  beam(ctx, L.mouthIn, V.blueMid, 1);
  // ---- the mechanism: rods, hinge tubes, the touches, the pillars
  beam(ctx, L.rods, V.blueMid, 1);
  beam(ctx, L.hinges, V.blueDim, 1);
  CL_TOUCHES.forEach((t, i) => {
    const q = lv.touchPress[i];
    beam(ctx, L.touches[i], mix(t.fixed || t.back ? V.blueDim : V.blueMid, V.blue, q), lw * (t.back ? 0.8 : 1) + 0.5 * q, { alpha: (t.back ? 0.55 : 0.9) + 0.1 * q, hot: q > 0.5, dash: t.back && q < 0.5 ? [3, 3] : undefined });
  });
  beam(ctx, L.posts, V.blueMid, 1);
  // ---- the keys: each a circle on a hairline arm from its hinge; shut, bright and crossed (the back's
  // dashed, bright under the thumb)
  const arms = new Path2D();
  CL_KEYS.forEach((k, i) => {
    const cphi = Math.cos(k.phi * D2R);
    const sphi = Math.sin(k.phi * D2R);
    const p = keyPos[i];
    const lift = (k.style === 'cup' && !k.back ? p : 0) * 0.0025 * sc;
    const cx = X(k.x);
    const cy = Y(keyV(k)) + lift * sphi;
    const rx = k.r * sc;
    const ry = k.back ? rx : Math.max(0.5, k.r * sc * Math.abs(cphi));
    if (k.rod && !k.back) {
      const rod = Y(k.rod);
      if (Math.abs(rod - cy) > ry) {
        arms.moveTo(cx, cy + (Math.sign(rod - cy) || 1) * ry);
        arms.lineTo(cx, rod);
      }
    }
    // shut: a ring's hole under its finger, a cup seated (a closed-standing key at rest is shut too)
    const shut = clamp(1 - p, 0, 1);
    if (k.back) {
      // (on the back: the thumb on its ring, the register key's pad lifted)
      const on = k.style === 'ring' ? lv.keyPress[i] : p;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      beam(ctx, null, mix(V.blueDim, V.blue, on), 1 + 0.5 * on, { alpha: 0.6 + 0.4 * on, dash: on < 0.5 ? [3, 3] : undefined, hot: on > 0.5 });
      return;
    }
    const s = 0.965 + 0.035 * p;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * s, ry * s, 0, 0, 2 * Math.PI);
    beam(ctx, null, mix(V.blueMid, V.blue, shut), lw + 0.5 * shut, { alpha: 0.75 + 0.25 * shut, hot: shut > 0.5 && k.style !== 'cup' });
    if (k.style !== 'cup') {
      // a ring's (or the plain hole's) tone hole
      const hr = k.hole * sc;
      ring(ctx, cx, cy, Math.max(0.6, hr), mix(V.blueMid, V.blue, shut), 1, { alpha: 0.8 + 0.2 * shut });
      if (shut > 0.05) dot(ctx, cx, cy, Math.max(0.6, hr * 0.7), V.blue, 0.8 * shut);
    }
    if (shut > 0.05 && ry > 1.5) {
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
  // ---- the tip: the opening between the reed and the tip rail, an eye (exaggerated), shut once a cycle when loud
  const eye = tipEyePaths(X, Y, Math.max(0, lv.open) * 0.0024);
  beam(ctx, eye.reed, V.blue, lw, { hot: true });
  // ---- the slots at the mouthpiece, each where its knob acts
  const hr = clamp(0.0034 * sc, 2.6, 6);
  const live = Math.min(1, 0.45 + 2 * lv.blow);
  const t = now / 1000;
  const xb = -Math.max(0.012, (hr + 8) / sc);
  // breath (green): from the lips into the tip, flowing
  if (lv.blow > 0.02) {
    breathFlow(ctx, (a, w) => [X(-a), Y(w)], -xb, [0.0034, 0.0018, 0.0006], 0.0016, small, Math.min(1, 0.4 + lv.blow) * (1 + 2.5 * lv.vib), now);
    // noise (pink): turbulence in the reed's channel, by the tip
    const frame = Math.floor(t * 20);
    const nd = small ? 4 : 7;
    for (let i = 0; i < nd; i++) {
      const hx = hash(frame * 13 + i * 7.3);
      const hv = hash(frame * 5 + i * 3.1 + 40);
      dot(ctx, X(0.0006 + hx * 0.007), Y((hv * 2 - 1) * 0.0034), small ? 0.9 : 1.2, V.pink, Math.min(1, 0.35 + lv.blow) * (0.5 + 0.5 * hash(frame + i)));
    }
  }
  // the lips' handle (green: the breath), and round it the vibrato's ring (white), breathing with it
  // (kept inside the box: an Orchestra cell leaves a narrow margin past the tip)
  const xh = Math.max((L.vertical ? L.top : 0) + hr + 10, X(xb) - hr - 2);
  if (X(xb) > xh + hr) seg(ctx, xh + hr, Y(0), X(xb), Y(0), V.green, 1, { alpha: 0.5 * live });
  handle(ctx, xh, Y(0), V.green, hr, live);
  ring(ctx, xh, Y(0), hr + 3.5 + clamp(lv.vib * 60, -2.5, 6), V.white, 1, { alpha: 0.5 + 0.5 * Math.min(1, Math.abs(lv.vib) * 30 + lv.blow) });
  // the embouchure (red): the lips round the beak and the reed, a little from the tip, its handle beside
  const xl = 0.013;
  const hw = mpHW(xl);
  const pinch = new Path2D();
  for (const sg of [-1, 1]) {
    pinch.moveTo(X(xl - 0.0045), Y(sg * (hw + 0.0012)));
    pinch.lineTo(X(xl + 0.0045), Y(sg * (hw + 0.0012)));
  }
  beam(ctx, pinch, V.red, 1, { alpha: 0.85 * live });
  const yr = Y(-(hw + 0.0012)) - Math.max(0.0085 * sc, hr + 6);
  seg(ctx, X(xl), Y(-(hw + 0.0012)), X(xl), yr + hr, V.red, 1, { alpha: 0.5 * live });
  handle(ctx, X(xl), yr, V.red, hr, live);
  // ---- the wave's line along the bore's axis, over everything (its nodes stand still, marked)
  if (lv.sounding) {
    const axis = new Path2D();
    const n = small ? 80 : 160;
    for (let i = 0; i <= n; i++) {
      const x = (end * i) / n;
      const v = lv.ampAt(x) * ph * Math.min(0.0045, 0.6 * clBore(Math.min(CL_LEN, x)) + 0.0012);
      if (i) axis.lineTo(X(x), Y(-v));
      else axis.moveTo(X(x), Y(-v));
    }
    beam(ctx, axis, V.amber, small ? 1.2 : 1.5, { alpha: Math.min(1, 3 * lvl), hot: true });
    const ticks = new Path2D();
    for (const x of lv.nodes) {
      ticks.moveTo(X(x), Y(-0.0035));
      ticks.lineTo(X(x), Y(0.0035));
    }
    beam(ctx, ticks, V.amber, 1, { alpha: 0.6 * Math.min(1, 3 * lvl), butt: true });
    // (the sounding length's far end: where the wave leaves the bore, past the first open hole)
    if (!small && !L.vertical) label(ctx, `${Math.round(end * 1000)} mm`, X(Math.min(end, CL_LEN)) + 6, Y(-clR(Math.min(end, CL_LEN))) - 10, { size: 10, color: V.amber, alpha: 0.75 * Math.min(1, 3 * lvl) });
  }
  ctx.restore();
  clRecord(L, W, st, lv.fingers);
}
