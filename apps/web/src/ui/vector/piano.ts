// The pianos on the vector display (see kit.ts): the same plans as the stage's own (grand-plan.ts's
// grand from above, piano-draw.ts's upright from the front: every string at its real length over its
// own key), drawn as beams. Blue is the instrument: the rim, the strings at rest, the agraffe line,
// the dampers. Amber is the sound: the board's modes traced across the case, the sounding strings and
// their live shapes. The iron plate is lines too, all in the instrument's blue: each string's lead to its
// tuning pin and its tail to its hitch pin (dim), the pins as points, a hitch rail past each bridge, the
// struts as two dim hairlines. The knobs' slots: the hammers are green (hammer hardness), the last note's other
// unison strings pink (unison detune), the bridges white (the board they drive).
//
// The drawing keeps the stage's state as the other one does (the strings to click, the case's box,
// where the sound leaves, the lid's free edge): the grips, the close-up and the room read it.
import type { VisualFrame } from '@piano-model/engine';
import { GZ, Layer, SYM_VISIBLE, catmull, grandDepth, grandPlate, layout, path, type GStr, type Layout, type Plate } from '../grand-plan.ts';
import { levelsOf, stepAction, upLayout, upPlate, type PianoGeom, type PianoState, type Pt, type UpLayout, type UpString } from '../piano-draw.ts';
import { SLOTS, V, beam, handle, ring, seg, type Contours } from './kit.ts';

const HAMMER = SLOTS[0];
const DETUNE = SLOTS[2];
const BOARD = SLOTS[3];

/** each piano's still lines (strings at rest, bridges), repainted when its layout changes; one per
 *  drawing state, so an ensemble's pianos keep their own */
const layers = new WeakMap<PianoState, Layer>();
const layerOf = (st: PianoState): Layer => {
  let l = layers.get(st);
  if (!l) layers.set(st, (l = new Layer()));
  return l;
};

type Ends = [number, number, number, number];

/** the plate as lines (grand-plan.ts `Plate`): the strings' leads and tails dim, the pins as points, each
 *  hitch rail one line, each strut two hairlines closing towards its far end. No fill, no new colour. */
function plateV(c: CanvasRenderingContext2D, pl: Plate): void {
  if (pl.detail) {
    c.beginPath();
    for (const [a, b] of pl.leads) {
      c.moveTo(a[0], a[1]);
      c.lineTo(b[0], b[1]);
    }
    for (const [a, b] of pl.tails) {
      c.moveTo(a[0], a[1]);
      c.lineTo(b[0], b[1]);
    }
    beam(c, null, V.blueDim, 0.6, { alpha: 0.42, butt: true });
  }
  for (const r of pl.rails) beam(c, path(r, false), V.blueMid, 1, { alpha: 0.7 });
  c.beginPath();
  for (const s of pl.struts)
    for (const d of [-0.5, 0.5]) {
      c.moveTo(s.a[0] + d * s.wa, s.a[1]);
      c.lineTo(s.b[0] + d * s.wb, s.b[1]);
    }
  beam(c, null, V.blueDim, 0.8, { alpha: 0.6, butt: true });
  if (!pl.detail) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = V.blueMid;
  c.globalAlpha = 0.9;
  c.beginPath();
  for (const ps of [pl.pins, pl.hitch])
    for (const [x, y] of ps) {
      c.moveTo(x + 1, y);
      c.arc(x, y, Math.min(1, pl.pinR), 0, Math.PI * 2);
    }
  c.fill();
  c.restore();
}

/** the strings at rest, by register: the plain steel dim and thin, the wound bass a little brighter */
function restStrings(c: CanvasRenderingContext2D, parts: { wound: boolean; lines: { x0: number; y0: number; x1: number; y1: number; off: number[] }[] }[]): void {
  for (const part of parts) {
    c.beginPath();
    for (const s of part.lines)
      for (const o of s.off) {
        c.moveTo(s.x0 + o, s.y0);
        c.lineTo(s.x1 + o, s.y1);
      }
    beam(c, null, V.blueDim, part.wound ? 0.9 : 0.6, { alpha: part.wound ? 0.62 : 0.6, butt: true });
  }
}

/** a sounding unison over its resting lines: struck strings bright amber, sympathetic ones faint
 *  (the levels as grand-plan.ts's lightString takes them) */
function lightStringV(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, off: number[], l: number, sym: number): void {
  if (l <= 0.02 && sym <= SYM_VISIBLE) return;
  const struck = l >= sym;
  ctx.beginPath();
  for (const o of off) {
    ctx.moveTo(x0 + o, y0);
    ctx.lineTo(x1 + o, y1);
  }
  if (struck) beam(ctx, null, V.amber, 0.8 + 0.5 * l, { alpha: 0.15 + 0.8 * l, hot: l > 0.9, butt: true });
  else beam(ctx, null, V.amber, 0.8, { alpha: 0.1 + 0.45 * sym, butt: true });
}

/** a string's shape from (x0,y0) to (x1,y1): `at(i)` its displacement in px at point i of n */
function shapePath(ctx: CanvasRenderingContext2D, e: Ends, n: number, at: (i: number) => number): void {
  const [x0, y0, x1, y1] = e;
  const len = Math.hypot(x1 - x0, y1 - y0) || 1;
  const nx = -(y1 - y0) / len;
  const ny = (x1 - x0) / len;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const d = at(i);
    const x = x0 + (x1 - x0) * f + nx * d;
    const y = y0 + (y1 - y0) * f + ny * d;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
}

/** every sounding string's live shape on one scale (struck amber, sympathetic faint), then the last
 *  struck note's unison in detail: its first string amber, the others in the detune knob's pink */
function shapesV(ctx: CanvasRenderingContext2D, fr: VisualFrame | null, pts: Pt[], ends: (p: Pt) => Ends, unison: (p: Pt) => number[], st: PianoState, W: number): void {
  const focus = fr?.focus ?? null;
  const ps = fr?.pianoShapes;
  const first = pts[0].midi;
  const of = (m: number): Pt | undefined => pts[m - first];
  if (ps && ps.midi.length) {
    const P = ps.points;
    let mx = 0;
    for (let i = 0; i < ps.shapes.length; i++) mx = Math.max(mx, Math.abs(ps.shapes[i]));
    const scale = st.allScale.of(mx);
    for (let j = 0; j < ps.midi.length; j++) {
      const m = ps.midi[j];
      if (m === (focus?.midi ?? -1) && !ps.light[j]) continue;
      const p = of(m);
      if (!p || p.x < -p.w || p.x > W + p.w) continue;
      const amp = Math.max(10, p.w * 1.7) / scale;
      const sym = ps.light[j] === 1;
      let alpha = 0.9;
      if (sym) {
        const rel = fr?.symLevels?.[m - 21] ?? 0;
        if (rel < SYM_VISIBLE) continue;
        alpha = Math.min(0.5, 0.1 + 0.6 * rel);
      }
      shapePath(ctx, ends(p), P, (i) => ps.shapes[j * P + i] * amp);
      beam(ctx, null, V.amber, sym ? 0.9 : 1.4, { alpha, hot: !sym });
    }
  }
  if (!focus) return;
  const p = of(focus.midi);
  if (!p) return;
  let m = 0;
  for (const s of focus.shapes) for (let i = 0; i < s.length; i++) m = Math.max(m, Math.abs(s[i]));
  const amp = Math.max(12, p.w * 1.9) / st.strScale.of(m);
  const [x0, y0, x1, y1] = ends(p);
  const off = unison(p);
  // (the other strings first, so the first string's amber lies over them)
  for (let j = focus.shapes.length - 1; j >= 0; j--) {
    const s = focus.shapes[j];
    const o = off[Math.min(off.length - 1, j)] ?? 0;
    shapePath(ctx, [x0 + o, y0, x1 + o, y1], s.length, (i) => s[i] * amp);
    beam(ctx, null, j === 0 ? V.amber : DETUNE, j === 0 ? 1.7 : 1.3, { alpha: j === 0 ? 1 : 0.9, hot: j === 0 });
  }
}

/** the action as two rows of marks. Dampers: a blue dash on the strings that lifts off them (with its
 *  key, the sustain pedal or the sostenuto). Hammers: a green dash at the strike point that swells as
 *  it rises and burns at the strike. The marks at rest go down as two strokes. */
function actionV(ctx: CanvasRenderingContext2D, marks: { i: number; damper: boolean; dx: number; dy: number; hx: number; hy: number }[], pitch: number, st: PianoState): void {
  const dw = pitch * 0.3;
  const hw = pitch * 0.25;
  ctx.beginPath();
  let any = false;
  for (const k of marks) {
    if (!k.damper || st.damper[k.i] > 0.03) continue;
    ctx.moveTo(k.dx - dw, k.dy);
    ctx.lineTo(k.dx + dw, k.dy);
    any = true;
  }
  if (any) beam(ctx, null, V.blueMid, 1.4, { alpha: 0.5, butt: true });
  ctx.beginPath();
  any = false;
  for (const k of marks) {
    if (st.hammer[k.i] > 0.03) continue;
    ctx.moveTo(k.hx - hw, k.hy);
    ctx.lineTo(k.hx + hw, k.hy);
    any = true;
  }
  if (any) beam(ctx, null, HAMMER, 1.4, { alpha: 0.32, butt: true });
  for (const k of marks) {
    const d = st.damper[k.i];
    if (k.damper && d > 0.03) seg(ctx, k.dx - dw + 2 * d, k.dy - 4 * d, k.dx + dw + 2 * d, k.dy - 4 * d, V.blue, 1.4, { alpha: 0.55 + 0.4 * d, butt: true });
    const h = st.hammer[k.i];
    if (h > 0.03) {
      const w = hw * (1 + 0.3 * h);
      seg(ctx, k.hx - w, k.hy, k.hx + w, k.hy, HAMMER, 1.6 + 1.6 * h, { alpha: 0.5 + 0.5 * h, hot: h > 0.6, butt: true });
    }
  }
}

/** a strike: a green ring leaving the strike point, larger and brighter for a harder blow; the
 *  hammer knob's handle marks the point while it fades */
function strikesV(ctx: CanvasRenderingContext2D, at: (midi: number) => { x: number; y: number } | null, st: PianoState, pitch: number, now: number, focus: number): void {
  for (const [midi, t] of st.strikes) {
    const age = (now - t) / 320;
    if (age < 0 || age > 1) continue;
    const q = at(midi);
    if (!q) continue;
    const v = (st.vels.get(midi) ?? 64) / 127;
    const a = (1 - age) ** 2 * (0.4 + 0.6 * v);
    ring(ctx, q.x, q.y, Math.max(3, (0.5 + 0.9 * v) * pitch * (0.5 + 1.1 * age)), HAMMER, 1.2, { alpha: a, hot: age < 0.3 });
    if (midi === focus) handle(ctx, q.x, q.y, HAMMER, Math.max(4, Math.min(7, pitch * 0.45)), 1 - age);
  }
}

export function drawPianoV(ctx: CanvasRenderingContext2D, W: number, H: number, g: PianoGeom, fr: VisualFrame | null, st: PianoState, field: Contours, now: number): void {
  const keys = g.keys;
  if (!keys.length) return;
  const pts: Pt[] = keys.map((k) => {
    const kx = g.keyX(k.midi);
    return { midi: k.midi, i: k.midi - 21, x: kx.x, w: kx.w, L: k.lengthM, k, wound: k.midi < 48 && k.nStrings <= 2 };
  });
  stepAction(pts, st);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  if (g.kind === 'upright') uprightV(ctx, W, H, pts, fr, st, field, now);
  else grandV(ctx, W, H, pts, g.lid ?? 1, fr, st, field, now);
  ctx.restore();
}

// ================================================================ grand (from above)
function grandV(ctx: CanvasRenderingContext2D, W: number, H: number, pts: Pt[], lid: number, fr: VisualFrame | null, st: PianoState, field: Contours, now: number): void {
  // the depth shown (smoothed: a phone's keyboard scrolls), then the plan (as drawGrandPlan)
  const target = grandDepth(W, pts);
  st.maxL = st.maxL > 0.5 && st.maxL < 3 ? st.maxL + (target - st.maxL) * 0.15 : target;
  if (Math.abs(st.maxL - target) < 4e-4) st.maxL = target;
  const dpr = ctx.getTransform().a || 1;
  const lay: Layout = layout(W, H, pts, dpr, st.maxL);
  const { Y, pxm, pitch, strs } = lay;
  const { x0: xL, x1: xR, y0: yTop, y1: yKey } = lay.box;
  const vis = (s: GStr) => s.x > -pitch * 2 && s.x < W + pitch * 2;
  const lidOpen = Math.min(1, Math.max(0, lid));

  // ---- the still lines inside the case: bridges, the agraffe line, the strings at rest
  const layer = layerOf(st);
  layer.paint(W, H, dpr, `g|${lay.key}`, (c) => {
    c.save();
    c.clip(lay.inner);
    plateV(c, grandPlate(lay, H));
    const bass = strs.filter((s) => s.p.wound);
    const treb = strs.filter((s) => !s.p.wound);
    restStrings(
      c,
      [treb, bass].map((part) => ({ wound: part === bass, lines: part.map((s) => ({ x0: s.a[0], y0: s.a[1], x1: s.b[0], y1: s.b[1], off: s.off })) })),
    );
    // where the speaking lengths begin (agraffes, the capo bar)
    for (const part of [treb, bass]) if (part.length > 1) beam(c, path(part.map((s) => s.a), false), V.blueMid, 1, { alpha: 0.8 });
    // the bridges, which carry the strings into the board
    for (const part of [treb, bass]) {
      if (part.length < 2) continue;
      beam(c, path(catmull(part.filter((_, k) => k % 3 === 0 || k === part.length - 1).map((s) => s.b), 4), false), BOARD, 1.3, { alpha: 0.42 });
    }
    c.restore();
  });
  // (a closed lid covers them: they dim under it)
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.3 + 0.7 * lidOpen;
  ctx.drawImage(layer.canvas, 0, 0, W, H);
  ctx.restore();
  // ---- the rim: its outer face, and the inner face a hairline
  beam(ctx, lay.inner, V.blueDim, 0.9, { alpha: 0.7 });
  beam(ctx, lay.outline, V.blue, 1.4, { alpha: 0.95 });

  // ---- the board's live modes, across the whole case
  field.update(fr?.modes ?? null, now / 1000);
  if (field.level > 0.02) {
    ctx.save();
    ctx.clip(lay.inner);
    const fy = Math.max(0, yTop);
    field.draw(ctx, xL, fy, xR - xL, yKey - fy, 0.75);
    ctx.restore();
  }
  // ---- the sounding strings light along their speaking length
  const lv = levelsOf(fr, st);
  st.hits.length = 0;
  for (const s of strs) {
    const p = s.p;
    if ((s.b[0] < -p.w * 2 && s.a[0] < -p.w * 2) || (s.b[0] > W + p.w * 2 && s.a[0] > W + p.w * 2)) continue;
    st.hits.push({ midi: p.midi, x0: s.a[0], y0: s.a[1], x1: s.b[0], y1: s.b[1], w: p.w });
    lightStringV(ctx, s.a[0], s.a[1], s.b[0], s.b[1], s.off, lv.l(p.i), lv.s(p.i));
  }
  // ---- the action: dampers on the strings, hammers on the strike line (the una corda slides them
  //      towards the treble, off one string of each unison)
  const sh = st.shift * Math.max(GZ.shift * pxm, 2.4);
  const yD = Y(GZ.damper);
  const yS = Y(GZ.strike);
  const marks = [];
  for (const s of strs) if (vis(s)) marks.push({ i: s.p.i, damper: s.p.k.hasDamper, dx: s.x + (GZ.damper - GZ.strike) * s.lean, dy: yD, hx: s.x + sh, hy: yS });
  actionV(ctx, marks, pitch, st);
  const i0 = strs[0].p.i;
  strikesV(
    ctx,
    (m) => {
      const s = strs[m - 21 - i0];
      return s && vis(s) ? { x: s.x + sh, y: yS } : null;
    },
    st,
    pitch,
    now,
    fr?.focus?.midi ?? -1,
  );
  // ---- the shapes of the sounding strings
  const of = (p: Pt) => strs[p.i - i0];
  shapesV(
    ctx,
    fr,
    pts,
    (p) => {
      const s = of(p);
      return [s.a[0], s.a[1], s.b[0], s.b[1]];
    },
    (p) => of(p).off,
    st,
    W,
  );

  // ---- the lid: hinged on the spine, it rises towards the viewer and is seen foreshortened: its
  //      outline dashed, hatched as it comes down over the strings
  st.caseBox = lay.box;
  st.src = { x: xL + (xR - xL) * 0.42, y: (yTop + yKey) / 2 + 20 };
  const cphi = Math.cos(lidOpen * (Math.PI / 2.4));
  ctx.beginPath();
  lay.outer.forEach(([x, y], k) => (k ? ctx.lineTo(xL + (x - xL) * cphi, y) : ctx.moveTo(xL + (x - xL) * cphi, y)));
  beam(ctx, null, V.blueMid, 1, { alpha: 0.45 + 0.4 * (1 - lidOpen), dash: [5, 4] });
  if (lidOpen < 0.98) {
    ctx.save();
    const base = ctx.getTransform();
    ctx.translate(xL, 0);
    ctx.scale(cphi, 1);
    ctx.translate(-xL, 0);
    ctx.clip(lay.outline);
    ctx.setTransform(base);
    ctx.beginPath();
    const y0 = Math.max(0, yTop);
    const hh = yKey - y0;
    for (let x = xL - hh; x < xR; x += 12) {
      ctx.moveTo(x, yKey);
      ctx.lineTo(x + hh, y0);
    }
    beam(ctx, null, V.blueDim, 0.8, { alpha: 0.55 * (1 - lidOpen), butt: true });
    ctx.restore();
  }
  const edgeX = xL + (xR - xL) * cphi;
  seg(ctx, edgeX, yTop + (yKey - yTop) * 0.25, edgeX, yKey - 6, V.blueMid, 1, { alpha: 0.35 + 0.2 * lidOpen, dash: [2, 5] });
  st.lidEdge = { x: edgeX, y: yTop + (yKey - yTop) * 0.55 };
}

// ================================================================ upright (front view)
function uprightV(ctx: CanvasRenderingContext2D, W: number, H: number, pts: Pt[], fr: VisualFrame | null, st: PianoState, field: Contours, now: number): void {
  // the scale: the longest string whose key is in view (smoothed), never so close that the bass is lost
  let full = 0;
  let visL = 0;
  for (const p of pts) {
    full = Math.max(full, p.L);
    if (p.x > -p.w && p.x < W + p.w) visL = Math.max(visL, p.L);
  }
  const target = Math.max(visL || full, 0.45 * full);
  st.maxL = st.maxL > 0.2 && st.maxL < 3 ? st.maxL + (target - st.maxL) * 0.15 : target;
  if (Math.abs(st.maxL - target) < 4e-4) st.maxL = target;
  const dpr = ctx.getTransform().a || 1;
  const lay: UpLayout = upLayout(W, H, pts, dpr, st.maxL);
  const { rect, pitch, strings } = lay;

  // ---- the still lines: the strings at rest, the pressure bar, the bridges
  const layer = layerOf(st);
  layer.paint(W, H, dpr, `u|${lay.key}`, (c) => {
    c.save();
    c.clip(lay.inner);
    plateV(c, upPlate(lay));
    const bass = strings.filter((s) => s.p.wound);
    const treb = strings.filter((s) => !s.p.wound);
    restStrings(
      c,
      [treb, bass].map((part) => ({ wound: part === bass, lines: part })),
    );
    // the pressure bar, slanting up to the bass
    for (const part of [treb, bass]) if (part.length > 1) beam(c, path(part.map((s): [number, number] => [s.x0, s.y0]), false), V.blueMid, 1.2, { alpha: 0.9 });
    for (const part of [treb, bass]) {
      if (part.length < 2) continue;
      beam(c, path(part.map((s): [number, number] => [s.x1, s.y1]), false), BOARD, 1.3, { alpha: 0.42 });
    }
    c.restore();
  });
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(layer.canvas, 0, 0, W, H);
  ctx.restore();
  beam(ctx, lay.inner, V.blueDim, 0.9, { alpha: 0.7 });
  beam(ctx, lay.box, V.blue, 1.4, { alpha: 0.95 });
  ctx.save();
  ctx.clip(lay.inner);
  // ---- the board's live modes, across the whole case
  field.update(fr?.modes ?? null, now / 1000);
  field.draw(ctx, rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0, 0.7);
  // ---- the sounding strings light along their speaking length
  const lv = levelsOf(fr, st);
  st.hits.length = 0;
  for (const s of strings) {
    const p = s.p;
    if ((s.x0 < -p.w && s.x1 < -p.w) || (s.x0 > W + p.w && s.x1 > W + p.w)) continue;
    st.hits.push({ midi: p.midi, x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, w: p.w });
    lightStringV(ctx, s.x0, s.y0, s.x1, s.y1, s.off, lv.l(p.i), lv.s(p.i));
  }
  // ---- the action: dampers just under the strike points, hammers at rest a little off the strings
  //      (the half-blow rail brings them nearer)
  const marks = [];
  for (const s of strings) {
    if (s.hx < -pitch || s.hx > W + pitch) continue;
    marks.push({ i: s.p.i, damper: s.p.k.hasDamper, dx: s.dx, dy: s.dy, hx: s.hx, hy: s.hy + 5 * (1 - st.hammer[s.p.i]) });
  }
  actionV(ctx, marks, pitch, st);
  // ---- the practice muffler: a felt strip let down between the hammers and the strings
  if (st.middle > 0.02) beam(ctx, path(strings.map((s): [number, number] => [s.hx, s.hy]), false), V.white, 2.2, { alpha: 0.6 * st.middle });
  const i0 = strings[0].p.i;
  const of = (p: Pt): UpString => strings[p.i - i0];
  strikesV(
    ctx,
    (m) => {
      const s = strings[m - 21 - i0];
      return s && s.hx > -pitch && s.hx < W + pitch ? { x: s.hx, y: s.hy } : null;
    },
    st,
    pitch,
    now,
    fr?.focus?.midi ?? -1,
  );
  st.src = { x: (Math.max(0, rect.x0) + Math.min(W, rect.x1)) / 2, y: (rect.y0 + rect.y1) / 2 };
  st.caseBox = rect;
  st.lidEdge = null;
  shapesV(
    ctx,
    fr,
    pts,
    (p) => {
      const s = of(p);
      return [s.x0, s.y0, s.x1, s.y1];
    },
    (p) => of(p).off,
    st,
    W,
  );
  ctx.restore();
}
