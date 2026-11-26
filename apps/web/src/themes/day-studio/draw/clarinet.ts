// Day Studio: the clarinet on the 2D stage, grenadilla and silver in daylight. Its layout and live state
// are the shared drawer's (ui/clarinet-draw.ts).
import type { VisualFrame } from '@piano-model/engine';
import { CL_KEYS, CL_LEN, CL_REACH, CL_TOUCHES, clarinetLayout, clarinetLive, type ClarinetState, clBore, type ClLayout, clLobeBase, clRecord, D2R, keyV, tipEyePaths, waveInk } from '../../../ui/clarinet-draw.ts';
import { INK, rgba } from '../../../ui/stage-draw.ts';
import { breathStream, LIGHT } from './kit.ts';

// ---------------------------------------------------------------- the classic drawing
// In daylight the clarinet is an object on pale plaster, lit by a window up and to the left of the screen:
// its silver bright with a shade side and an edge that stands it off the ground, its blackwood and ebonite
// near black with a cool sheen, one soft shadow on the floor. What sounds is the one blue (the bore's
// pressure, the reed's tip); what a finger holds is graphite ink (a touch, a ring or a hole under its
// fingertip, a pad moved off its rest), and on the black wood, where ink cannot show, a firm light line.
/** silver in daylight: lit, body, shade, and (r,g,b) the edge that stands it off the plaster */
const AG_LIT = '#f6f7f8';
const AG_BODY = '#d3d8dd';
const AG_SHADE = '#98a1aa';
const AG_EDGE = '95,104,114';
/** the grenadilla's fill: African blackwood, near black with a brown cast, as the 3D model's (dark wood,
 *  and well off the pale stage: test) */
export const WOOD = '#2a211e';

/** how the daylight falls in the layout's own frame: `lit` the lit side across the body (−1: −v), and
 *  (`cx`, `cy`) the way a shadow falls (the screen's down and a little to its right); `hair` the width of
 *  a hairline (1 px on a stage; thinner on an orchestra's small clarinet, which is its wood and not its
 *  keys' outlines) */
interface Light {
  lit: number;
  cx: number;
  cy: number;
  hair: number;
}
const LYING: Light = { lit: -1, cx: 0.5, cy: 0.86, hair: 1 };
/** (standing, the box is turned a quarter: the screen's down is +x, its left +v) */
const STANDING: Light = { lit: 1, cx: 0.86, cy: -0.5, hair: 1 };

/** what daylight adds to a layout, made once with it: the floor's shadow (a blurred picture, drawn each
 *  frame as an image), and the black parts the wave's line is light on (the wood and the mouthpiece) */
interface Day {
  dark: Path2D;
  cast: { cv: HTMLCanvasElement; x: number; y: number; w: number; h: number } | null;
  s: number;
}
const days = new WeakMap<ClLayout, Day>();
/** (shadows are kept up to 6 megapixels in all, a dozen at most: a window dragged wider leaves no trail of
 *  canvases, and an orchestra's small ones all stay) */
const kept: { L: ClLayout; px: number }[] = [];
function keep(L: ClLayout, px: number): void {
  const i = kept.findIndex((k) => k.L === L);
  if (i >= 0) kept.splice(i, 1);
  kept.push({ L, px });
  let sum = kept.reduce((a, k) => a + k.px, 0);
  while ((sum > 6e6 || kept.length > 12) && kept.length > 1) {
    const old = kept.shift()!;
    sum -= old.px;
    days.delete(old.L);
  }
}
/** the canvas px to one of the box's a context draws at (2 at most: a shadow is soft) */
const castScale = (ctx: CanvasRenderingContext2D): number => {
  const t = ctx.getTransform?.();
  return t ? Math.min(2, Math.max(1, Math.round(Math.hypot(t.a, t.b) * 4) / 4)) : 1;
};
/** The clarinet's one shadow on the floor: its silhouette (the wood, the mouthpiece and its ligature, the
 *  touches) blurred, down and a little to the right on the screen whichever way the clarinet lies, in
 *  proportion to its size (on a computer's stage: a blur of 12 px, 4 px across and 7 down). In the layout's
 *  frame, `s` canvas px to one of the box's. */
function clDay(L: ClLayout, s: number): Day {
  const hit = days.get(L);
  if (hit && hit.s === s) return hit;
  const dark = new Path2D();
  dark.addPath(L.body);
  dark.addPath(L.mp);
  const day: Day = { dark, cast: null, s };
  if (typeof document !== 'undefined') {
    const { sc } = L;
    const light = L.vertical ? STANDING : LYING;
    const blur = Math.max(1.5, 0.006 * sc);
    const far = Math.max(1.2, 0.004 * sc);
    const m = Math.ceil(2 * blur + far) + 2;
    const x = Math.floor(L.x0 - m);
    const y = Math.floor(L.c - CL_REACH * sc - m);
    const w = Math.ceil(L.x0 + (CL_LEN + 0.006) * sc + m) - x;
    const h = Math.ceil(L.c + CL_REACH * sc + m) - y;
    const mk = () => {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * s));
      cv.height = Math.max(1, Math.round(h * s));
      return cv;
    };
    const sil = mk();
    const cv = mk();
    const a = sil.getContext('2d');
    const b = cv.getContext('2d');
    if (a && b) {
      a.setTransform(s, 0, 0, s, -x * s, -y * s);
      a.fillStyle = '#000';
      for (const p of [L.body, L.mouth, L.mp, L.lig, L.screwTabs, L.screwHeads, ...L.touches.filter((_, i) => !CL_TOUCHES[i].back)]) a.fill(p);
      b.shadowColor = 'rgba(28,34,42,0.32)';
      b.shadowBlur = blur * s;
      b.shadowOffsetX = far * light.cx * s;
      b.shadowOffsetY = far * light.cy * s;
      b.drawImage(sil, 0, 0);
      // (the silhouette itself out again: the shadow alone is kept)
      b.shadowColor = 'transparent';
      b.globalCompositeOperation = 'destination-out';
      b.drawImage(sil, 0, 0);
      day.cast = { cv, x, y, w, h };
    }
  }
  days.set(L, day);
  keep(L, day.cast ? day.cast.cv.width * day.cast.cv.height : 0);
  return day;
}

/** The clarinet from the front: the mouthpiece's beak with its ligature and the reed's tip opening and
 *  shutting with the engine's reed (drawn slowed), the grenadilla joints with their silver rings and
 *  keywork, the keys closing for the engine's note by the chart (each on a spring), the thumb's ring and
 *  register key faint through the wood, and the bore's standing wave in blue inside the cylinder from the
 *  reed to where it leaves the tube, its envelope either side. `top`: the file player's px over the box's
 *  top. */
export function drawClarinet(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: ClarinetState, top = 0): void {
  const L = clarinetLayout(W, H, top);
  const { sc, c, Hm } = L;
  const X = (x: number) => L.x0 + x * sc;
  const Y = (v: number) => c + v * sc;
  const now = performance.now();
  const lv = clarinetLive(fr, st, now);
  const { lvl, ph, end, keyPos } = lv;
  const day = clDay(L, castScale(ctx));
  const hair = Math.min(1, sc / 600);
  const light: Light = { ...(L.vertical ? STANDING : LYING), hair };
  const { lit } = light;
  ctx.save();
  if (L.vertical) {
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ---- on the floor: its shadow
  const cast = day.cast;
  if (cast) ctx.drawImage(cast.cv, cast.x, cast.y, cast.w, cast.h);
  // ---- behind the clarinet: the pressure's standing-wave envelope either side, pinched at the nodes
  if (lv.sounding) {
    const hm = Hm * Math.min(1, 0.35 + lvl);
    const M = 110;
    for (const sgn of [-1, 1]) {
      // (the reed is a pressure antinode: the envelope starts at its fullest, its end rounded off)
      const A0 = Math.min(1, Math.abs(lv.ampAt(0))) * hm;
      const b0 = Y(sgn * clLobeBase(0));
      ctx.beginPath();
      ctx.moveTo(X(0) - 0.5 * A0, b0);
      ctx.quadraticCurveTo(X(0) - 0.5 * A0, b0 + sgn * A0, X(0), b0 + sgn * A0);
      for (let i = 0; i <= M; i++) {
        const x = (end * i) / M;
        const A = Math.min(1, Math.abs(lv.ampAt(x)));
        ctx.lineTo(X(x), Y(sgn * clLobeBase(Math.min(CL_LEN, x))) + sgn * hm * A);
      }
      ctx.lineTo(X(end), Y(sgn * clLobeBase(Math.min(CL_LEN, end))));
      ctx.closePath();
      ctx.fillStyle = rgba(INK.sound, 0.09 + 0.07 * lvl);
      ctx.fill();
      ctx.strokeStyle = rgba(INK.sound, 0.3 + 0.3 * lvl);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // ---- the mouthpiece: black ebonite, its beak's ridge lit (its ligature goes on over the bore's wave)
  ctx.fillStyle = '#0d0d10';
  ctx.fill(L.mp);
  const gm = ctx.createLinearGradient(0, Y(lit * 0.013), 0, Y(-lit * 0.013));
  gm.addColorStop(0, rgba(LIGHT, 0.06));
  gm.addColorStop(0.18, rgba(LIGHT, 0.24));
  gm.addColorStop(0.42, rgba(LIGHT, 0.05));
  gm.addColorStop(0.85, rgba(LIGHT, 0.03));
  gm.addColorStop(1, rgba(LIGHT, 0.1));
  ctx.fillStyle = gm;
  ctx.fill(L.mp);
  // ---- the wood: grenadilla, near black, polished, lit from the window (standing, the lit bands are the
  // other edge's: the axis mirrored)
  ctx.fillStyle = WOOD;
  ctx.fill(L.body);
  ctx.strokeStyle = 'rgba(126,98,76,0.2)';
  ctx.lineWidth = 0.7;
  ctx.stroke(L.grain);
  ctx.save();
  if (L.vertical) {
    ctx.translate(0, 2 * c);
    ctx.scale(1, -1);
  }
  ctx.fillStyle = rgba(LIGHT, 0.15);
  ctx.fill(L.mpRidge);
  ctx.fillStyle = rgba(LIGHT, 0.1);
  ctx.fill(L.sheen);
  ctx.fillStyle = rgba(LIGHT, 0.19);
  ctx.fill(L.spec);
  ctx.fillStyle = rgba(LIGHT, 0.05);
  ctx.fill(L.bounce);
  ctx.strokeStyle = rgba(LIGHT, 0.2);
  ctx.lineWidth = hair;
  ctx.stroke(L.rimUp);
  ctx.restore();
  // (its outline on the plaster)
  ctx.strokeStyle = rgba(INK.line, 0.45);
  ctx.lineWidth = 1;
  ctx.stroke(L.body);
  // the bell's mouth: its rim's face, the inner lip, the dark of the bore
  ctx.fillStyle = '#3a2e29';
  ctx.fill(L.mouth);
  ctx.lineWidth = hair;
  ctx.strokeStyle = rgba(LIGHT, 0.26);
  ctx.stroke(L.mouth);
  ctx.fillStyle = '#050403';
  ctx.fill(L.mouthIn);
  ctx.strokeStyle = rgba(LIGHT, 0.14);
  ctx.stroke(L.mouthIn);
  // ---- the tone holes in the wood: L3's raised chimney, the rings' holes, a pad's hole as it lifts
  CL_KEYS.forEach((k, i) => {
    if (k.back) return;
    const p = keyPos[i];
    const cphi = Math.cos(k.phi * D2R);
    const cx = X(k.x);
    const cy = Y(keyV(k));
    if (k.style === 'plain') {
      ctx.beginPath();
      ctx.arc(cx, cy, k.r * sc, 0, 2 * Math.PI);
      ctx.fillStyle = '#0a0806';
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,132,110,0.34)';
      ctx.lineWidth = hair;
      ctx.stroke();
      // (the chimney's edge towards the window)
      ctx.beginPath();
      if (lit < 0) ctx.arc(cx, cy - 0.00035 * sc, k.r * sc * 0.92, 1.15 * Math.PI, 1.85 * Math.PI);
      else ctx.arc(cx, cy + 0.00035 * sc, k.r * sc * 0.92, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.strokeStyle = rgba(LIGHT, 0.3);
      ctx.stroke();
    }
    if (k.style === 'cup' && p < 0.03) return;
    ctx.beginPath();
    ctx.ellipse(cx, cy, k.hole * sc, Math.max(0.4, k.hole * sc * Math.abs(cphi)), 0, 0, 2 * Math.PI);
    ctx.fillStyle = k.style === 'cup' ? `rgba(3,2,2,${Math.min(1, p * 1.5).toFixed(3)})` : '#020101';
    ctx.fill();
  });
  // ---- the standing wave inside the bore, laid over the wood: its envelope in blue, and in it the
  // pressure now (compression blue, rarefaction slate); the nodes stay wood
  if (lv.sounding) {
    const ge = ctx.createLinearGradient(X(0), 0, X(end), 0);
    const gw = ctx.createLinearGradient(X(0), 0, X(end), 0);
    const N = 56;
    for (let i = 0; i <= N; i++) {
      const A = lv.ampAt((end * i) / N);
      ge.addColorStop(i / N, rgba(INK.sound, 0.75 * Math.min(1, Math.pow(Math.abs(A), 0.9))));
      gw.addColorStop(i / N, rgba(waveInk(A * ph), 0.9 * Math.min(1, Math.abs(A * ph))));
    }
    ctx.fillStyle = ge;
    ctx.fill(L.bore);
    ctx.fillStyle = gw;
    ctx.fill(L.boreIn);
  }
  // ---- the silver rings (metal: the wave stays under them), the joints' seams
  ctx.fillStyle = metalGrad(ctx, Y(lit * 0.016), Y(-lit * 0.016));
  ctx.fill(L.silver);
  ctx.strokeStyle = rgba(AG_EDGE, 0.9);
  ctx.lineWidth = hair;
  ctx.stroke(L.silver);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = Math.max(0.5, hair);
  ctx.stroke(L.seams);
  // ---- the ligature over the mouthpiece (metal too): the screws, then the sleeve
  ctx.fillStyle = metalGrad(ctx, Y(lit * 0.012), Y(-lit * 0.012));
  ctx.fill(L.screwTabs);
  const gs = ctx.createLinearGradient(0, Y(lit < 0 ? 0.012 : 0.022), 0, Y(lit < 0 ? 0.022 : 0.012));
  gs.addColorStop(0, AG_LIT);
  gs.addColorStop(0.5, AG_BODY);
  gs.addColorStop(1, AG_SHADE);
  ctx.fillStyle = gs;
  ctx.fill(L.screwHeads);
  ctx.strokeStyle = rgba(AG_EDGE, 0.7);
  ctx.lineWidth = Math.max(0.5, 0.0003 * sc);
  ctx.stroke(L.screwKnurl);
  ctx.strokeStyle = rgba(AG_EDGE, 0.95);
  ctx.lineWidth = 0.9 * hair;
  ctx.stroke(L.screwTabs);
  ctx.stroke(L.screwHeads);
  ctx.fillStyle = metalGrad(ctx, Y(lit * 0.0125), Y(-lit * 0.0125));
  ctx.fill(L.lig);
  ctx.strokeStyle = rgba(AG_EDGE, 0.6);
  ctx.lineWidth = Math.max(0.6, 0.0004 * sc);
  ctx.stroke(L.ligRib);
  ctx.strokeStyle = rgba(AG_EDGE, 0.95);
  ctx.lineWidth = 0.9 * hair;
  ctx.stroke(L.lig);
  // ---- through the wood: the thumb's ring and the register key on the back (a faint dashed line; firm
  // under the thumb)
  CL_KEYS.forEach((k, i) => {
    if (!k.back) return;
    // (the thumb on its ring; the register key's pad lifted by its lever)
    const q = k.style === 'ring' ? lv.keyPress[i] : keyPos[i];
    ghostKey(ctx, X(k.x), Y(0), k.r * sc, k.style === 'ring' ? k.hole * sc * 1.3 : 0, q, sc, hair);
  });
  CL_TOUCHES.forEach((t, i) => {
    if (!t.back) return;
    const q = lv.touchPress[i];
    if (q > 0.01) {
      ctx.fillStyle = rgba(LIGHT, 0.12 * q);
      ctx.fill(L.touches[i]);
    }
    ctx.save();
    ctx.setLineDash(q > 0.5 ? [] : [0.0016 * sc, 0.0012 * sc]);
    ctx.strokeStyle = rgba(LIGHT, q > 0.5 ? 0.3 + 0.4 * q : 0.28);
    ctx.lineWidth = hair;
    ctx.stroke(L.touches[i]);
    ctx.restore();
  });
  // ---- the mechanism: rods (each a polished axle), hinge tubes
  const wr = Math.max(hair, 0.002 * sc);
  ctx.strokeStyle = `rgb(${AG_EDGE})`;
  ctx.lineWidth = wr;
  ctx.stroke(L.rods);
  if (wr > 1.8) {
    ctx.strokeStyle = AG_BODY;
    ctx.lineWidth = wr - 1.2;
    ctx.stroke(L.rods);
  }
  ctx.strokeStyle = AG_LIT;
  ctx.lineWidth = Math.max(0.5 * hair, 0.0006 * sc);
  ctx.save();
  ctx.translate(0, lit * 0.0004 * sc);
  ctx.stroke(L.rods);
  ctx.restore();
  ctx.fillStyle = AG_BODY;
  ctx.fill(L.hinges);
  ctx.strokeStyle = rgba(AG_EDGE, 0.9);
  ctx.lineWidth = hair;
  ctx.stroke(L.hinges);
  // ---- the keys: each on its arm from its hinge, cups lifting and seating on springs, the rings under
  // the fingers
  for (const k of CL_KEYS) {
    if (!k.rod || k.back) continue;
    const cy = Y(keyV(k));
    const ry = k.r * sc * Math.abs(Math.cos(k.phi * D2R));
    const rod = Y(k.rod);
    // (a long arm, to a rod across the body, is a slender lever)
    const long = Math.abs(k.rod - keyV(k)) > 0.012;
    if (Math.abs(rod - cy) > ry) clArm(ctx, X(k.x), cy + (Math.sign(rod - cy) || 1) * ry * 0.75, rod, k.r * sc * (long ? 0.18 : 0.36), (long ? 0.0009 : 0.0013) * sc, hair);
  }
  CL_KEYS.forEach((k, i) => {
    if (k.back) return;
    const cphi = Math.cos(k.phi * D2R);
    const sphi = Math.sin(k.phi * D2R);
    const p = keyPos[i];
    // the pad's lift (2.5 mm open), seen from the front: outwards round the body
    const lift = (k.style === 'cup' ? p : 0) * 0.0025 * sc;
    const cx = X(k.x);
    const cy = Y(keyV(k)) + lift * sphi;
    const moved = k.closed ? p : 1 - p;
    if (k.style === 'ring') clRing(ctx, cx, cy, k.r * sc, k.hole * sc, lv.keyPress[i], p, light);
    else if (k.style === 'plain') clPlain(ctx, cx, cy, k.hole * sc, lv.keyPress[i], hair);
    else clCup(ctx, cx, cy, k.r * sc, Math.max(0.6, k.r * sc * Math.abs(cphi)), p, moved, lift, light);
  });
  // the touches: the levers and spatulas, inked under a finger
  CL_TOUCHES.forEach((t, i) => {
    if (t.back) return;
    const q = lv.touchPress[i];
    const path = L.touches[i];
    const va = Math.min(t.v0, t.v1) - 0.003;
    const vb = Math.max(t.v0, t.v1) + 0.003;
    const g = ctx.createLinearGradient(0, Y(lit < 0 ? va : vb), 0, Y(lit < 0 ? vb : va));
    g.addColorStop(0, AG_LIT);
    g.addColorStop(0.5, AG_BODY);
    g.addColorStop(1, '#a9b1b9');
    ctx.fillStyle = g;
    ctx.fill(path);
    if (q > 0.01) {
      ctx.fillStyle = rgba(INK.line, 0.62 * q);
      ctx.fill(path);
    }
    ctx.strokeStyle = q > 0.5 ? rgba(INK.line, 0.6 + 0.35 * q) : rgba(AG_EDGE, t.fixed ? 0.75 : 0.95);
    ctx.lineWidth = (1 + 0.5 * q) * hair;
    ctx.stroke(path);
  });
  // the pillars, over the rods
  ctx.fillStyle = '#e4e7ea';
  ctx.fill(L.posts);
  ctx.strokeStyle = rgba(AG_EDGE, 0.95);
  ctx.lineWidth = hair;
  ctx.stroke(L.posts);
  // ---- the reed behind the beak (its outline and vamp, faint through the ebonite), and at the tip the
  // opening between its tip and the tip rail, seen a little from its end (drawn twice its size: 1.2 mm at
  // rest, shut once a cycle when the note is loud)
  ctx.save();
  ctx.setLineDash([0.0018 * sc, 0.0013 * sc]);
  ctx.strokeStyle = 'rgba(232,206,146,0.36)';
  ctx.lineWidth = hair;
  ctx.stroke(L.reed);
  ctx.strokeStyle = 'rgba(232,206,146,0.2)';
  ctx.stroke(L.vamp);
  ctx.restore();
  clTipEye(ctx, X, Y, lv.open * 0.0024, sc, Math.min(1, 4 * lv.blow));
  // the breath into the mouthpiece: a faint stream from the lips, flowing in
  if (lv.blow > 0.02) {
    const a = Math.min(1, 0.3 + lv.blow) * (1 + 2.5 * lv.vib);
    breathStream(ctx, (b, w) => [X(-b), Y(w)], sc, [[0.017, 0.0046], [0.007, 0.0026], [0.0016, 0.0008]], 0.45 * a, now);
  }
  // ---- the wave's line along the bore's axis, over everything (its nodes stand still): blue, a light line
  // where it lies on the black wood and the ebonite (not on the ligature's silver)
  if (lv.sounding) {
    ctx.beginPath();
    const n = 160;
    for (let i = 0; i <= n; i++) {
      const x = (end * i) / n;
      const v = lv.ampAt(x) * ph * Math.min(0.0045, 0.6 * clBore(Math.min(CL_LEN, x)) + 0.0012);
      if (i) ctx.lineTo(X(x), Y(-v));
      else ctx.moveTo(X(x), Y(-v));
    }
    const a = Math.min(1, 3 * lvl);
    ctx.strokeStyle = rgba(INK.sound, 0.9 * a);
    ctx.lineWidth = 1.5 * hair;
    ctx.stroke();
    ctx.save();
    ctx.clip(day.dark);
    ctx.strokeStyle = rgba(LIGHT, 0.9 * a);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.clip(L.lig);
    ctx.strokeStyle = rgba(INK.sound, 0.9 * a);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  clRecord(L, W, st, lv.fingers);
}

/** polished silver across a part, from its lit edge (y0) to its far one (y1): the window's light, the
 *  body, its shade side, the floor's bounce */
function metalGrad(ctx: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#bcc3ca');
  g.addColorStop(0.18, AG_LIT);
  g.addColorStop(0.36, AG_BODY);
  g.addColorStop(0.66, AG_SHADE);
  g.addColorStop(0.88, '#c2c8ce');
  g.addColorStop(1, '#8d96a0');
  return g;
}
/** a key's arm: from its cup's edge (y0, half-width w0) narrowing to its hinge tube (y1, w1) */
function clArm(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, w0: number, w1: number, hair: number): void {
  const m = (y0 + y1) / 2;
  ctx.beginPath();
  ctx.moveTo(x - w0, y0);
  ctx.bezierCurveTo(x - w0 * 0.5, m, x - w1, m, x - w1, y1);
  ctx.lineTo(x + w1, y1);
  ctx.bezierCurveTo(x + w1, m, x + w0 * 0.5, m, x + w0, y0);
  ctx.closePath();
  ctx.fillStyle = '#b4bcc4';
  ctx.fill();
  ctx.strokeStyle = rgba(AG_EDGE, 0.9);
  ctx.lineWidth = 0.9 * hair;
  ctx.stroke();
}
/** a covered key's cup from the front: a silver dome, lifted `p` (1 open), inked where a finger or a
 *  linkage has moved it off its rest (`moved`), the pad's leather showing under its rim as it lifts */
function clCup(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, p: number, moved: number, lift: number, day: Light): void {
  const s = 0.965 + 0.035 * p;
  rx *= s;
  ry *= s;
  if (p > 0.02) {
    // its shadow on the wood
    ctx.beginPath();
    ctx.ellipse(cx + lift * 0.45 * day.cx, cy + lift * 0.45 * day.cy, rx * 1.02, Math.max(0.5, ry * 1.02), 0, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(24,28,34,${(0.4 * p).toFixed(3)})`;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, Math.max(0.5, ry), 0, 0, 2 * Math.PI);
  // (polished silver: a bright crown towards the light, a shade band, the floor's bounce at its skirt)
  const g = ctx.createLinearGradient(0, cy + day.lit * ry, 0, cy - day.lit * ry);
  g.addColorStop(0, AG_LIT);
  g.addColorStop(0.32, '#e1e5e9');
  g.addColorStop(0.66, AG_SHADE);
  g.addColorStop(0.9, '#c2c8ce');
  g.addColorStop(1, '#a9b1b9');
  ctx.fillStyle = g;
  ctx.fill();
  if (moved > 0.01) {
    ctx.fillStyle = rgba(INK.line, 0.3 * moved);
    ctx.fill();
  }
  ctx.strokeStyle = moved > 0.5 ? rgba(INK.line, 0.55 + 0.4 * moved) : rgba(AG_EDGE, 0.95);
  ctx.lineWidth = (1 + 0.6 * moved) * day.hair;
  ctx.stroke();
  if (p > 0.05) {
    ctx.beginPath();
    ctx.ellipse(cx, cy + 0.5, rx * 1.02, Math.max(0.5, ry * 1.02), 0, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = `rgba(214,190,150,${(0.45 * p).toFixed(3)})`;
    ctx.lineWidth = day.hair;
    ctx.stroke();
  }
  if (ry > 2.5) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.74, Math.max(0.4, ry * 0.74), 0, 0, 2 * Math.PI);
    ctx.strokeStyle = rgba(INK.line, 0.18);
    ctx.lineWidth = 1;
    ctx.stroke();
    // the dome's highlight
    ctx.beginPath();
    ctx.ellipse(cx - rx * 0.22, cy + day.lit * ry * 0.4, rx * 0.26, Math.max(0.3, ry * 0.12), 0, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
  }
}
/** a fingertip on a key or a hole: graphite (radius `r`; `q` how far it is down), edged in light where it
 *  lies on the black wood (`hair` the line's width; 0 on a ring, which has its own edge) */
function fingertip(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, q: number, hair: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle = rgba(INK.line, 0.9 * q);
  ctx.fill();
  if (hair <= 0) return;
  ctx.strokeStyle = rgba(LIGHT, 0.5 * q);
  ctx.lineWidth = hair;
  ctx.stroke();
}
/** a ring key from the front: a thin silver ring round its tone hole's raised chimney; under the finger
 *  (`q`) the ring goes down and the fingertip covers the hole and the ring: an open hole is a bright ring,
 *  a covered one dark */
function clRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, hole: number, q: number, p: number, day: Light): void {
  const s = 0.965 + 0.035 * p;
  const ro = r * s;
  const ri = r * 0.74;
  // the chimney's top inside the ring, dark, the hole deeper
  ctx.beginPath();
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI);
  ctx.fillStyle = '#0c0907';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, hole, 0, 2 * Math.PI);
  ctx.fillStyle = '#010101';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, 2 * Math.PI);
  ctx.moveTo(cx + ri, cy);
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI, true);
  const g = ctx.createLinearGradient(0, cy + day.lit * ro, 0, cy - day.lit * ro);
  g.addColorStop(0, AG_LIT);
  g.addColorStop(0.42, AG_BODY);
  g.addColorStop(0.58, '#e6e9ec');
  g.addColorStop(1, AG_SHADE);
  ctx.fillStyle = g;
  ctx.fill('evenodd');
  ctx.strokeStyle = rgba(AG_EDGE, 0.95);
  ctx.lineWidth = day.hair;
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI);
  ctx.strokeStyle = rgba(INK.line, 0.4);
  ctx.lineWidth = 0.8 * day.hair;
  ctx.stroke();
  if (q > 0.01) fingertip(ctx, cx, cy, Math.max(ri * 1.02, ro - 0.5 * day.hair), q, 0);
}
/** L3's plain hole under its finger: the fingertip over the chimney */
function clPlain(ctx: CanvasRenderingContext2D, cx: number, cy: number, hole: number, q: number, hair: number): void {
  if (q <= 0.01) return;
  fingertip(ctx, cx, cy, hole * 1.35, q, hair);
}
/** a key on the back, seen through the wood: its outline a faint dashed light line, firm and faintly
 *  filled under the thumb (`q`); a ring's hole inside it */
function ghostKey(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, hole: number, q: number, sc: number, hair: number): void {
  ctx.save();
  const dash = [0.0016 * sc, 0.0012 * sc];
  ctx.setLineDash(q > 0.5 ? [] : dash);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  if (q > 0.01) {
    ctx.fillStyle = rgba(LIGHT, 0.12 * q);
    ctx.fill();
  }
  ctx.strokeStyle = rgba(LIGHT, q > 0.5 ? 0.3 + 0.4 * q : 0.28);
  ctx.lineWidth = hair;
  ctx.stroke();
  if (hole > 0) {
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.arc(cx, cy, hole, 0, 2 * Math.PI);
    ctx.strokeStyle = rgba(LIGHT, 0.18);
    ctx.stroke();
  }
  ctx.restore();
}
/** the tip's opening: the dark gap, the rail's light edge on the ebonite, and the reed's tip, which is what
 *  moves: cane at rest, in the blue of what sounds while it is blown (`blown` 0…1) */
function clTipEye(ctx: CanvasRenderingContext2D, X: (x: number) => number, Y: (v: number) => number, o: number, sc: number, blown: number): void {
  const { gap, reed, rail } = tipEyePaths(X, Y, o);
  ctx.fillStyle = '#050404';
  ctx.fill(gap);
  ctx.strokeStyle = rgba(LIGHT, 0.4);
  ctx.lineWidth = Math.max(0.7, 0.00025 * sc);
  ctx.stroke(rail);
  ctx.lineWidth = Math.min(1.5, Math.max(Math.min(1, sc / 600), 0.0007 * sc));
  ctx.strokeStyle = 'rgba(206,176,116,0.95)';
  ctx.stroke(reed);
  if (blown > 0.01) {
    ctx.strokeStyle = rgba(INK.sound, 0.9 * blown);
    ctx.stroke(reed);
  }
}
