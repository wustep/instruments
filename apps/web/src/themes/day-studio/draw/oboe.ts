// Day Studio: the oboe on the 2D stage, grenadilla and silver in daylight. Its layout and live state are
// the shared drawer's (ui/oboe-draw.ts).
import type { VisualFrame } from '@piano-model/engine';
import { D2R, keyV, OB_KEYS, OB_LEN, OB_REACH, OB_TOUCHES, type ObLayout, obLobeBase, oboeLayout, oboeLive, type OboeState, obR, obRecord, type ObTouch, RD_TIP_HW, waveInk } from '../../../ui/oboe-draw.ts';
import { INK, rgba } from '../../../ui/stage-draw.ts';
import { breathStream, LIGHT } from './kit.ts';

// ---------------------------------------------------------------- the classic drawing
// In daylight the oboe is an object on pale plaster, lit by a window up and to the left of the screen: its
// silver bright with a shade side and an edge that stands it off the ground, its blackwood near black with
// a cool sheen, one soft shadow on the floor. What sounds is the one blue (the bore's pressure, the reed's
// blades); what a finger holds is graphite ink (a touch, a ring or the plate under its fingertip, a pad
// moved off its rest).
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
 *  a hairline (1 px on a stage; thinner on an orchestra's small oboe, which is its wood and not its keys'
 *  outlines) */
interface Light {
  lit: number;
  cx: number;
  cy: number;
  hair: number;
}
const LYING: Light = { lit: -1, cx: 0.5, cy: 0.86, hair: 1 };
/** (standing, the box is turned a quarter: the screen's down is +x, its left +v) */
const STANDING: Light = { lit: 1, cx: 0.86, cy: -0.5, hair: 1 };

/** the floor's shadow: a blurred picture made once with the layout, drawn each frame as an image */
interface Cast {
  cv: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  s: number;
}
const casts = new WeakMap<ObLayout, Cast | null>();
/** (shadows are kept up to 6 megapixels in all, a dozen at most: a window dragged wider leaves no trail of
 *  canvases, and an orchestra's small ones all stay) */
const kept: { L: ObLayout; px: number }[] = [];
function keep(L: ObLayout, px: number): void {
  const i = kept.findIndex((k) => k.L === L);
  if (i >= 0) kept.splice(i, 1);
  kept.push({ L, px });
  let sum = kept.reduce((a, k) => a + k.px, 0);
  while ((sum > 6e6 || kept.length > 12) && kept.length > 1) {
    const old = kept.shift()!;
    sum -= old.px;
    casts.delete(old.L);
  }
}
/** the canvas px to one of the box's a context draws at (2 at most: a shadow is soft) */
const castScale = (ctx: CanvasRenderingContext2D): number => {
  const t = ctx.getTransform?.();
  return t ? Math.min(2, Math.max(1, Math.round(Math.hypot(t.a, t.b) * 4) / 4)) : 1;
};
/** The oboe's one shadow on the floor: its silhouette (the wood, the reed, the touches) blurred, down and
 *  a little to the right on the screen whichever way the oboe lies, in proportion to its size (on a
 *  computer's stage: a blur of 12 px, 4 px across and 7 down). In the layout's frame, `s` canvas px to one
 *  of the box's. */
function obCast(L: ObLayout, s: number): Cast | null {
  const hit = casts.get(L);
  if (hit !== undefined && (hit === null || hit.s === s)) return hit;
  let cast: Cast | null = null;
  if (typeof document !== 'undefined') {
    const { sc } = L;
    const day = L.vertical ? STANDING : LYING;
    const blur = Math.max(1.5, 0.006 * sc);
    const far = Math.max(1.2, 0.004 * sc);
    const m = Math.ceil(2 * blur + far) + 2;
    const x = Math.floor(L.x0 - m);
    const y = Math.floor(L.c - OB_REACH * sc - m);
    const w = Math.ceil(L.x0 + (OB_LEN + 0.005) * sc + m) - x;
    const h = Math.ceil(L.c + OB_REACH * sc + m) - y;
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
      for (const p of [L.body, L.mouth, L.cane, L.thread, L.staple, L.cork, ...L.touches]) a.fill(p);
      b.shadowColor = 'rgba(28,34,42,0.32)';
      b.shadowBlur = blur * s;
      b.shadowOffsetX = far * day.cx * s;
      b.shadowOffsetY = far * day.cy * s;
      b.drawImage(sil, 0, 0);
      // (the silhouette itself out again: the shadow alone is kept)
      b.shadowColor = 'transparent';
      b.globalCompositeOperation = 'destination-out';
      b.drawImage(sil, 0, 0);
      cast = { cv, x, y, w, h, s };
    }
  }
  casts.set(L, cast);
  keep(L, cast ? cast.cv.width * cast.cv.height : 0);
  return cast;
}

/** The oboe from the front: the reed (its blades fluttering open and shut with the engine's reed, drawn
 *  slowed), the grenadilla body with its silver rings and keywork, the keys closing for the engine's note
 *  by the chart (each on a spring), and the bore's standing wave in blue inside the cone from the reed to
 *  the first open hole, its envelope either side. `top`: the file player's px over the box's top. */
export function drawOboe(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: OboeState, top = 0): void {
  const L = oboeLayout(W, H, top);
  const { sc, c, Hm } = L;
  const X = (x: number) => L.x0 + x * sc;
  const Y = (v: number) => c + v * sc;
  const now = performance.now();
  const lv = oboeLive(fr, st, now);
  const { lvl, ph, end, keyPos } = lv;
  const cast = obCast(L, castScale(ctx));
  const hair = Math.min(1, sc / 600);
  const day: Light = { ...(L.vertical ? STANDING : LYING), hair };
  const { lit } = day;
  /** a gradient across a part of half-height h about the axis, from its lit side */
  const across = (h: number) => ctx.createLinearGradient(0, Y(lit * h), 0, Y(-lit * h));
  ctx.save();
  if (L.vertical) {
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // ---- on the floor: its shadow
  if (cast) ctx.drawImage(cast.cv, cast.x, cast.y, cast.w, cast.h);
  // ---- behind the oboe: the pressure's standing-wave envelope either side, pinched at the nodes
  if (lv.sounding) {
    const hm = Hm * Math.min(1, 0.35 + lvl);
    const M = 96;
    for (const sgn of [-1, 1]) {
      // (the reed is a pressure antinode: the envelope starts at its fullest, its end rounded off)
      const A0 = Math.min(1, Math.abs(lv.ampAt(0))) * hm;
      const b0 = Y(sgn * obLobeBase(0));
      ctx.beginPath();
      ctx.moveTo(X(0) - 0.5 * A0, b0);
      ctx.quadraticCurveTo(X(0) - 0.5 * A0, b0 + sgn * A0, X(0), b0 + sgn * A0);
      for (let i = 0; i <= M; i++) {
        const x = (end * i) / M;
        const A = Math.min(1, Math.abs(lv.ampAt(x)));
        ctx.lineTo(X(x), Y(sgn * obLobeBase(Math.min(OB_LEN, x))) + sgn * hm * A);
      }
      ctx.lineTo(X(end), Y(sgn * obLobeBase(Math.min(OB_LEN, end))));
      ctx.closePath();
      ctx.fillStyle = rgba(INK.sound, 0.09 + 0.07 * lvl);
      ctx.fill();
      ctx.strokeStyle = rgba(INK.sound, 0.3 + 0.3 * lvl);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // ---- behind the wood: the thumb's plate and the thumb rest (what reaches past the body shows)
  OB_TOUCHES.forEach((t, i) => t.back && obTouch(ctx, L.touches[i], Y, t, lv.touchPress[i], day));
  // ---- the reed: the cork in the reed well, the staple, the thread, the cane
  ctx.fillStyle = '#9c7850';
  ctx.fill(L.cork);
  const gk = across(0.0037);
  gk.addColorStop(0, 'rgba(255,240,214,0.08)');
  gk.addColorStop(0.25, 'rgba(255,240,214,0.32)');
  gk.addColorStop(0.6, 'rgba(0,0,0,0)');
  gk.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = gk;
  ctx.fill(L.cork);
  ctx.fillStyle = 'rgba(58,38,22,0.5)';
  ctx.fill(L.corkDots);
  ctx.strokeStyle = 'rgba(60,42,18,0.6)';
  ctx.lineWidth = 0.8 * hair;
  ctx.stroke(L.cork);
  ctx.fillStyle = metalGrad(ctx, Y(lit * 0.0021), Y(-lit * 0.0021));
  ctx.fill(L.staple);
  ctx.strokeStyle = rgba(AG_EDGE, 0.9);
  ctx.stroke(L.staple);
  ctx.fillStyle = '#285236';
  ctx.fill(L.thread);
  const gt = across(0.0028);
  gt.addColorStop(0, 'rgba(170,226,160,0.1)');
  gt.addColorStop(0.3, 'rgba(170,226,160,0.34)');
  gt.addColorStop(0.65, 'rgba(0,0,0,0.05)');
  gt.addColorStop(1, 'rgba(0,0,0,0.36)');
  ctx.fillStyle = gt;
  ctx.fill(L.thread);
  ctx.strokeStyle = 'rgba(10,30,14,0.55)';
  ctx.lineWidth = Math.max(0.5, 0.00018 * sc);
  ctx.stroke(L.winding);
  // the cane: bark at the tie, the scrape pale to the translucent tip, the spine down its middle
  ctx.fillStyle = '#d2b87e';
  ctx.fill(L.cane);
  ctx.fillStyle = '#b0863e';
  ctx.fill(L.bark);
  const gb = across(0.003);
  gb.addColorStop(0, 'rgba(255,244,210,0.1)');
  gb.addColorStop(0.28, 'rgba(255,244,210,0.42)');
  gb.addColorStop(0.5, 'rgba(255,244,210,0.06)');
  gb.addColorStop(1, 'rgba(0,0,0,0.26)');
  ctx.fillStyle = gb;
  ctx.fill(L.bark);
  ctx.fillStyle = 'rgba(240,228,190,0.55)';
  ctx.fill(L.scrape);
  ctx.fillStyle = 'rgba(176,146,90,0.55)';
  ctx.fill(L.spine);
  // (the tip, thinnest: the light through it, brighter as the blades part)
  ctx.fillStyle = `rgba(252,246,222,${(0.55 + 0.25 * Math.min(1, lv.open)).toFixed(3)})`;
  ctx.fill(L.tip);
  ctx.strokeStyle = 'rgba(60,42,18,0.75)';
  ctx.lineWidth = 0.8 * hair;
  ctx.stroke(L.cane);
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
  ctx.fillStyle = rgba(LIGHT, 0.1);
  ctx.fill(L.sheen);
  ctx.fillStyle = rgba(LIGHT, 0.2);
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
  // ---- the tone holes (dark in the wood: the rings' always, a pad's when it lifts)
  OB_KEYS.forEach((k, i) => {
    if (k.style === 'plate') return;
    const p = keyPos[i];
    if (k.style === 'cup' && p < 0.03) return;
    const cphi = Math.cos(k.phi * D2R);
    ctx.beginPath();
    ctx.ellipse(X(k.x), Y(keyV(k)), k.hole * sc, Math.max(0.4, k.hole * sc * cphi), 0, 0, 2 * Math.PI);
    ctx.fillStyle = k.style === 'ring' ? '#030202' : `rgba(3,2,2,${Math.min(1, p * 1.5).toFixed(3)})`;
    ctx.fill();
  });
  // ---- the standing wave inside the bore, laid over the wood: its envelope in blue, and in it the
  // pressure now (compression blue, rarefaction slate); the nodes stay wood
  if (lv.sounding) {
    const ge = ctx.createLinearGradient(X(0), 0, X(end), 0);
    const gw = ctx.createLinearGradient(X(0), 0, X(end), 0);
    const N = 48;
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
  // ---- through the wood: the thumb's plate and the thumb rest behind it (a faint dashed line; firm under
  // the thumb)
  ctx.save();
  ctx.clip(L.body);
  OB_TOUCHES.forEach((t, i) => {
    if (!t.back) return;
    const q = lv.touchPress[i];
    ctx.setLineDash(q > 0.5 ? [] : [0.0016 * sc, 0.0012 * sc]);
    ctx.strokeStyle = rgba(LIGHT, q > 0.5 ? 0.3 + 0.4 * q : 0.26);
    ctx.lineWidth = hair;
    ctx.stroke(L.touches[i]);
  });
  ctx.restore();
  // ---- the mechanism: rods (each a polished axle), hinge tubes
  const wr = Math.max(hair, 0.0021 * sc);
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
  // ---- the keys: each on its arm from its hinge, cups lifting and seating on springs, the rings and
  // L1's plate under the fingers
  for (const k of OB_KEYS) {
    const cy = Y(keyV(k));
    const ry = k.r * sc * Math.cos(k.phi * D2R);
    const rod = Y(k.rod);
    // (a long arm, to a rod across the body, is a slender lever)
    const long = Math.abs(k.rod - keyV(k)) > 0.012;
    obArm(ctx, X(k.x), cy + (Math.sign(rod - cy) || 1) * ry * 0.75, rod, k.r * sc * (long ? 0.2 : 0.42), (long ? 0.0009 : 0.0013) * sc, hair);
  }
  OB_KEYS.forEach((k, i) => {
    const cphi = Math.cos(k.phi * D2R);
    const sphi = Math.sin(k.phi * D2R);
    const p = keyPos[i];
    // the pad's lift (2 mm open), seen from the front: outwards round the body
    const lift = (k.style === 'cup' ? p : 0) * 0.0021 * sc;
    const cx = X(k.x);
    const cy = Y(keyV(k)) + lift * sphi;
    const moved = k.closed ? p : 1 - p;
    if (k.style === 'ring') obRing(ctx, cx, cy, k.r * sc, k.hole * sc, lv.keyPress[i], p, day);
    else if (k.style === 'plate') obPlate(ctx, cx, cy, k.r * sc, lv.keyPress[i], p, lv.half, sc, day);
    else obCup(ctx, cx, cy, k.r * sc, k.r * sc * cphi, p, moved, lift, day);
  });
  // the touches: the levers and spatulas, inked under a finger
  OB_TOUCHES.forEach((t, i) => !t.back && obTouch(ctx, L.touches[i], Y, t, lv.touchPress[i], day));
  // the pillars, over the rods
  ctx.fillStyle = '#e4e7ea';
  ctx.fill(L.posts);
  ctx.strokeStyle = rgba(AG_EDGE, 0.95);
  ctx.lineWidth = hair;
  ctx.stroke(L.posts);
  // ---- the reed's tip, a little from its end: the two blades' edges and the opening between them
  // (exaggerated: at rest about a millimetre each side, shut once a cycle when the note is loud)
  obReedEye(ctx, X(0), Y(0), RD_TIP_HW * 0.94 * sc, lv.open * 0.0022 * sc, sc, Math.min(1, 4 * lv.blow));
  // the breath into the reed: a faint stream from the lips, flowing in
  if (lv.blow > 0.02) {
    const a = Math.min(1, 0.3 + lv.blow) * (1 + 2.5 * lv.vib);
    breathStream(ctx, (b, w) => [X(-b), Y(w)], sc, [[0.016, 0.0042], [0.006, 0.0022], [0.0012, 0.0006]], 0.45 * a, now);
  }
  // ---- the wave's line along the bore's axis, over everything (its nodes stand still): blue, and a light
  // line where it lies on the black wood
  if (lv.sounding) {
    ctx.beginPath();
    const n = 150;
    for (let i = 0; i <= n; i++) {
      const x = (end * i) / n;
      const v = lv.ampAt(x) * ph * Math.min(0.0042, 0.6 * obR(Math.min(OB_LEN, x)));
      if (i) ctx.lineTo(X(x), Y(-v));
      else ctx.moveTo(X(x), Y(-v));
    }
    const a = Math.min(1, 3 * lvl);
    ctx.strokeStyle = rgba(INK.sound, 0.9 * a);
    ctx.lineWidth = 1.5 * hair;
    ctx.stroke();
    ctx.save();
    ctx.clip(L.body);
    ctx.strokeStyle = rgba(LIGHT, 0.9 * a);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  obRecord(L, W, st, lv.fingers);
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
/** a touch (a lever's spatula): silver, lit from the window's side; under a finger (`q`) inked in */
function obTouch(ctx: CanvasRenderingContext2D, path: Path2D, Y: (v: number) => number, t: ObTouch, q: number, day: Light): void {
  const { lit } = day;
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
  ctx.lineWidth = (1 + 0.5 * q) * day.hair;
  ctx.stroke(path);
}
/** a key's arm: from its cup's edge (y0, half-width w0) narrowing to its hinge tube (y1, w1) */
function obArm(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, w0: number, w1: number, hair: number): void {
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
/** a covered key's cup from the front: a silver dome, lifted `p` (1 open), inked where a finger has moved
 *  it off its rest (`moved`), the pad's leather showing under its rim as it lifts */
function obCup(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, p: number, moved: number, lift: number, day: Light): void {
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
    // the pad's leather under the raised rim
    ctx.beginPath();
    ctx.ellipse(cx, cy + 0.5, rx * 1.02, Math.max(0.5, ry * 1.02), 0, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = `rgba(214,190,150,${(0.45 * p).toFixed(3)})`;
    ctx.lineWidth = day.hair;
    ctx.stroke();
  }
  if (rx < 2.5) return;
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
/** a fingertip on a key: graphite, over all of it, silver and hole, inside its edge (radius `r`; `q` how
 *  far it is down) */
function fingertip(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, q: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.fillStyle = rgba(INK.line, 0.9 * q);
  ctx.fill();
}
/** a ring key from the front: the silver ring round its tone hole; under the finger (`q`) the ring goes
 *  down and the fingertip covers the hole and the ring: an open hole is a bright ring, a covered one dark */
function obRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, hole: number, q: number, p: number, day: Light): void {
  const s = 0.965 + 0.035 * p;
  const ro = r * s;
  const ri = hole * 1.25;
  ctx.beginPath();
  ctx.arc(cx, cy, ro, 0, 2 * Math.PI);
  ctx.moveTo(cx + ri, cy);
  ctx.arc(cx, cy, ri, 0, 2 * Math.PI, true);
  const g = ctx.createLinearGradient(0, cy + day.lit * ro, 0, cy - day.lit * ro);
  g.addColorStop(0, AG_LIT);
  g.addColorStop(0.42, AG_BODY);
  g.addColorStop(0.56, '#e6e9ec');
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
  ctx.strokeStyle = rgba(INK.line, 0.5);
  ctx.lineWidth = 0.9 * day.hair;
  ctx.stroke();
  if (q > 0.01) fingertip(ctx, cx, cy, Math.max(ri * 1.05, ro - 0.5 * day.hair), q);
}
/** L1's plate from the front, its small half-hole near its upper end: raised (`p` 1) with the finger off;
 *  under the finger (`q`) the fingertip covers it, rolled down off the perforation when half-holing (`half`) */
function obPlate(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, q: number, p: number, half: number, sc: number, day: Light): void {
  const s = 0.965 + 0.035 * p;
  const rr = r * s;
  if (p > 0.02) {
    ctx.beginPath();
    ctx.arc(cx + 0.7 * day.cx, cy + 0.7 * day.cy, rr * 1.03, 0, 2 * Math.PI);
    ctx.fillStyle = `rgba(24,28,34,${(0.4 * p).toFixed(3)})`;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, rr, 0, 2 * Math.PI);
  const g = ctx.createLinearGradient(0, cy + day.lit * rr, 0, cy - day.lit * rr);
  g.addColorStop(0, AG_LIT);
  g.addColorStop(0.45, AG_BODY);
  g.addColorStop(1, '#a9b1b9');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgba(AG_EDGE, 0.95);
  ctx.lineWidth = day.hair;
  ctx.stroke();
  // the perforation, towards the reed
  const hx = cx - 0.0029 * sc;
  ctx.beginPath();
  ctx.arc(hx, cy, Math.max(0.8, 0.0011 * sc), 0, 2 * Math.PI);
  ctx.fillStyle = '#040303';
  ctx.fill();
  ctx.strokeStyle = rgba(INK.line, 0.5);
  ctx.lineWidth = 0.8 * day.hair;
  ctx.stroke();
  if (q > 0.01) {
    // the fingertip: on the whole plate, or rolled down off the perforation
    const roll = Math.max(0, Math.min(1, half));
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(rr * 0.6, Math.min(rr * 0.92, rr - 1.2)), 0, 2 * Math.PI);
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(cx + roll * 0.0021 * sc, cy, rr * (0.95 - 0.3 * roll), rr * 0.9, 0, 0, 2 * Math.PI);
    ctx.fillStyle = rgba(INK.line, 0.9 * q);
    ctx.fill();
    ctx.restore();
  }
}
/** the reed's tip seen a little from its end: the opening between the two blades as an eye, half-length
 *  `hl` across the reed, half-opening `t` (shut: the blades' edges meet in one line); the blades' edges,
 *  which are what moves, cane at rest and in the blue of what sounds while they are blown (`blown` 0…1) */
function obReedEye(ctx: CanvasRenderingContext2D, cx: number, cy: number, hl: number, t: number, sc: number, blown: number): void {
  const o = Math.max(0, t);
  ctx.beginPath();
  ctx.moveTo(cx, cy - hl);
  ctx.bezierCurveTo(cx - o * 1.33, cy - hl * 0.45, cx - o * 1.33, cy + hl * 0.45, cx, cy + hl);
  ctx.bezierCurveTo(cx + o * 1.33, cy + hl * 0.45, cx + o * 1.33, cy - hl * 0.45, cx, cy - hl);
  ctx.closePath();
  ctx.fillStyle = '#080604';
  ctx.fill();
  ctx.lineWidth = Math.min(1.5, Math.max(Math.min(1, sc / 600), 0.0007 * sc));
  ctx.strokeStyle = 'rgba(60,42,18,0.8)';
  ctx.stroke();
  if (blown > 0.01) {
    ctx.strokeStyle = rgba(INK.sound, 0.9 * blown);
    ctx.stroke();
  }
}
