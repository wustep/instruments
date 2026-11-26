// Day Studio: the grand piano's plan in daylight (black lacquer, a bronzed plate, a spruce board, steel
// and copper strings), a sounding string in the blue. The plan's geometry is the shared drawer's
// (ui/grand-plan.ts); what is painted on it, still and live, is here.
import type { VisualFrame } from '@piano-model/engine';
import { catmull, grandDepth, grandPlate, type GStr, GZ, Layer, layout, type Layout, mix, type P, path, type Plate, SYM_VISIBLE } from '../../../ui/grand-plan.ts';
import type { PianoState, Pt } from '../../../ui/piano-draw.ts';
import { INK, type ModeField, rgba } from '../../../ui/stage-draw.ts';
import { LIGHT } from './kit.ts';

/** a sounding unison drawn over its resting lines: struck strings in the blue over a soft wash of it,
 *  sympathetic ones fainter and thin (at most 0.5 alpha even when they move like a struck string) */
export function lightString(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, off: number[], l: number, sym: number): void {
  if (l <= 0.02 && sym <= SYM_VISIBLE) return;
  const struck = l >= sym;
  if (struck) {
    ctx.strokeStyle = rgba(INK.sound, 0.14 * l);
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.strokeStyle = struck ? rgba(INK.sound, 0.2 + 0.8 * l) : rgba(INK.sound, 0.08 + 0.42 * sym);
  ctx.lineWidth = struck ? 1 + 1.6 * l : 0.9 + 0.9 * sym;
  ctx.beginPath();
  for (const o of off) {
    ctx.moveTo(x0 + o, y0);
    ctx.lineTo(x1 + o, y1);
  }
  ctx.stroke();
}

/** a hammer's mark: a short dash of graphite that swells and turns blue at the strike; bronze under the soft pedal */
export function hammerMark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, soft: number): void {
  const flash = h > 0.6 ? (h - 0.6) / 0.4 : 0;
  const hh = 3 + 3 * h;
  ctx.beginPath();
  ctx.roundRect(x - (w * (1 + 0.3 * h)) / 2, y - hh / 2, w * (1 + 0.3 * h), hh, 1.5);
  ctx.fillStyle = flash > 0.02 ? `rgba(${Math.round(60 - 31 * flash)},${Math.round(66 + 6 * flash)},${Math.round(74 + 135 * flash)},${(0.6 + 0.4 * flash).toFixed(3)})` : soft > 0.05 ? rgba(INK.warm, 0.5 + 0.3 * soft) : rgba(INK.line, 0.3 + 0.3 * h);
  ctx.fill();
}

/** a damper: a black head lying along its strings (`len` px long, turned by `ang` with a leaning string;
 *  x, y its middle); lifted, it moves off them, thins and takes a firm edge */
export function damperMark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, d: number, len = 4, ang = 0): void {
  const cx = x + 2 * d;
  const cy = y - 3 * d;
  // (along the string: up the stage when ang = 0)
  const ax = (Math.sin(ang) * len) / 2;
  const ay = (-Math.cos(ang) * len) / 2;
  const bx = (Math.cos(ang) * w) / 2;
  const by = (Math.sin(ang) * w) / 2;
  ctx.beginPath();
  ctx.moveTo(cx - ax - bx, cy - ay - by);
  ctx.lineTo(cx + ax - bx, cy + ay - by);
  ctx.lineTo(cx + ax + bx, cy + ay + by);
  ctx.lineTo(cx - ax + bx, cy - ay + by);
  ctx.closePath();
  ctx.fillStyle = rgba(INK.ebony, 0.94 - 0.5 * d);
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = d > 0.05 ? rgba(INK.line, 0.3 + 0.5 * d) : rgba(INK.line, 0.2);
  ctx.lineWidth = 0.8;
  ctx.stroke();
}
const base = new Layer();

/** gold-bronze lacquer over the plate's iron, in daylight: one soft light across the whole casting */
export const BRONZE = '191,149,76';
export const BRONZE_HI = '240,212,152';
const BRONZE_LIT = [208, 170, 98];
const BRONZE_SHADE = [166, 124, 58];
/** the pin block, opaque: lit along its edge (as BRONZE lies over the board), deepening under the front */
const BLOCK_LIT = [210, 176, 112];
const BLOCK_DARK = [176, 138, 78];
/** the soundboard: spruce in daylight, pale and warm (its lit corner, and its far one) */
export const SPRUCE = '238,223,194';
const SPRUCE_LIT = '245,234,210';
const SPRUCE_SHADE = '228,209,174';
/** the rim: black lacquer seen from above */
export const RIM = '26,28,32';
/** a steel string at rest on the board, and a wound one */
export const STRING_STEEL = '84,92,102';
export const STRING_WOUND = '142,80,40';
/** the bridges: maple, a little deeper than the board they stand on */
export const BRIDGE = '158,118,66';
/** the shadow a case throws on the studio's floor: the window is up and to the left */
export function castShadow(c: CanvasRenderingContext2D, shape: Path2D, k = 1): void {
  c.save();
  c.shadowColor = 'rgba(28,34,42,0.3)';
  c.shadowBlur = 26 * k;
  c.shadowOffsetX = 7 * k;
  c.shadowOffsetY = 12 * k;
  c.fillStyle = rgba(RIM, 1);
  c.fill(shape);
  c.restore();
}
/** the board in its opening: spruce, the light falling off across it */
export function paintBoard(c: CanvasRenderingContext2D, inner: Path2D, box: { x0: number; y0: number; x1: number; y1: number }): void {
  const g = c.createLinearGradient(box.x0, Math.max(0, box.y0), box.x1, box.y1);
  g.addColorStop(0, rgba(SPRUCE_LIT, 1));
  g.addColorStop(0.5, rgba(SPRUCE, 1));
  g.addColorStop(1, rgba(SPRUCE_SHADE, 1));
  c.fillStyle = g;
  c.fill(inner);
}

/** the plate, drawn: bronze where the iron is, the board open between. `perimeter` is the case's inner
 *  face (the caller clips to it), `box` the case on the stage (the light runs across it). */
export function paintPlate(c: CanvasRenderingContext2D, pl: Plate, perimeter: Path2D, box: { x0: number; y0: number; x1: number; y1: number }): void {
  // one light for the whole casting: from the upper left, falling off to the lower right
  const g = c.createLinearGradient(box.x0, Math.max(0, box.y0), box.x1, box.y1);
  g.addColorStop(0, mix(BRONZE_LIT, BRONZE_LIT, 0, 0.96));
  g.addColorStop(0.4, `rgba(${BRONZE},0.96)`);
  g.addColorStop(1, mix(BRONZE_SHADE, BRONZE_SHADE, 0, 0.96));
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.strokeStyle = g;
  c.fillStyle = g;
  // the band inside the case
  c.lineWidth = 2 * pl.band;
  c.stroke(perimeter);
  // the struts: tapering from the pin block
  for (const s of pl.struts) {
    c.beginPath();
    c.moveTo(s.a[0] - s.wa / 2, s.a[1]);
    c.lineTo(s.b[0] - s.wb / 2, s.b[1]);
    c.lineTo(s.b[0] + s.wb / 2, s.b[1]);
    c.lineTo(s.a[0] + s.wa / 2, s.a[1]);
    c.closePath();
    c.fill();
  }
  // the hitch rails, each with its lit edge
  for (const r of pl.rails) {
    const q = path(r, false);
    c.strokeStyle = g;
    c.lineWidth = pl.railW;
    c.stroke(q);
  }
  c.lineCap = 'butt';
  c.strokeStyle = rgba(BRONZE_HI, 0.7);
  c.lineWidth = 1;
  for (const r of pl.rails) c.stroke(path(r.map(([x, y]): P => [x, y - pl.railW / 2 + 1]), false));
  // (and the shade each throws on the board, down and to the right)
  c.strokeStyle = 'rgba(96,70,30,0.3)';
  for (const r of pl.rails) c.stroke(path(r.map(([x, y]): P => [x + 0.5, y + pl.railW / 2 + 0.5]), false));
  // the pin block: bronze along its edge, where the pins stand, then falling into shade towards the case
  // (so a narrow screen's deep block is not a slab). Opaque steps, each over the last: no seams.
  if (pl.edge.length > 1) {
    const e = pl.edge;
    const n = e.length - 1;
    const far = 4000;
    const N = 12;
    for (let j = 0; j <= N; j++) {
      const d = j ? pl.lit + (pl.fade * (j - 1)) / (N - 1) : 0;
      const t = j / N;
      c.fillStyle = mix(BLOCK_LIT, BLOCK_DARK, t * t * (3 - 2 * t), 1);
      c.beginPath();
      c.moveTo(e[0][0] - far, e[0][1] + pl.toward * d);
      for (const [x, y] of e) c.lineTo(x, y + pl.toward * d);
      c.lineTo(e[n][0] + far, e[n][1] + pl.toward * d);
      c.lineTo(e[n][0] + far, pl.limit);
      c.lineTo(e[0][0] - far, pl.limit);
      c.closePath();
      c.fill();
    }
    c.strokeStyle = rgba(BRONZE_HI, 0.75);
    c.lineWidth = 1;
    c.stroke(path(e, false));
  }
}
/** the strings' own ends: the leads to the tuning pins, the tails to the hitch pins, and the pins */
export function paintEnds(c: CanvasRenderingContext2D, pl: Plate): void {
  if (!pl.detail) return;
  c.lineCap = 'butt';
  c.strokeStyle = rgba(STRING_STEEL, 0.4);
  c.lineWidth = 0.7;
  c.beginPath();
  for (const [a, b] of pl.leads) {
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
  }
  for (const [a, b] of pl.tails) {
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
  }
  c.stroke();
  // tuning pins: steel; hitch pins: dark in the rail
  c.fillStyle = rgba('92,96,102', 0.92);
  c.beginPath();
  for (const [x, y] of pl.pins) {
    c.moveTo(x + pl.pinR, y);
    c.arc(x, y, pl.pinR, 0, Math.PI * 2);
  }
  c.fill();
  c.fillStyle = rgba('70,52,26', 0.9);
  c.beginPath();
  for (const [x, y] of pl.hitch) {
    c.moveTo(x + pl.pinR * 0.8, y);
    c.arc(x, y, pl.pinR * 0.8, 0, Math.PI * 2);
  }
  c.fill();
}

/** the still picture: rim, board, struts, bridges, the strings at rest (repainted when the layout changes) */
function paintBase(lay: Layout, W: number, H: number, dpr: number): void {
  const { strs, inner, outline } = lay;
  const bass = strs.filter((s) => s.p.wound);
  const treb = strs.filter((s) => !s.p.wound);
  base.paint(W, H, dpr, lay.key, (c) => {
    // the case on the floor, its shadow under it; the rim's black lacquer; the spruce in its opening
    castShadow(c, outline);
    c.fillStyle = rgba(RIM, 1);
    c.fill(outline);
    const box = { x0: lay.box.x0, y0: lay.box.y0, x1: lay.box.x1, y1: H };
    paintBoard(c, inner, box);
    c.save();
    c.clip(inner);
    // (the rim stands over the board: its shade along the upper and left sides)
    c.save();
    c.shadowColor = 'rgba(60,42,16,0.45)';
    c.shadowBlur = 10;
    c.shadowOffsetX = 3;
    c.shadowOffsetY = 5;
    c.strokeStyle = rgba(RIM, 1);
    c.lineWidth = 2;
    c.stroke(inner);
    c.restore();
    // the plate's frame over the board
    const pl = grandPlate(lay, H);
    paintPlate(c, pl, inner, box);
    // the bridges: the long treble bridge and the bass bridge, each one line under the string ends
    c.lineJoin = 'round';
    c.strokeStyle = rgba(BRIDGE, 0.95);
    c.lineWidth = 3;
    for (const part of [treb, bass]) {
      if (part.length < 2) continue;
      c.stroke(path(catmull(part.filter((_, k) => k % 3 === 0 || k === part.length - 1).map((s) => s.b), 4), false));
    }
    // where the speaking lengths begin (agraffes, the capo bar): a hairline along the string fronts
    c.strokeStyle = rgba('110,82,36', 0.6);
    c.lineWidth = 1.2;
    for (const part of [treb, bass]) if (part.length > 1) c.stroke(path(part.map((s) => s.a), false));
    // the strings at rest: steel trebles, then the copper-wound bass crossing over the tenor
    c.lineCap = 'butt';
    for (const part of [treb, bass]) {
      const wound = part === bass;
      c.strokeStyle = rgba(wound ? STRING_WOUND : STRING_STEEL, wound ? 0.85 : 0.5);
      c.lineWidth = wound ? 1.3 : 0.8;
      c.beginPath();
      for (const s of part)
        for (const o of s.off) {
          c.moveTo(s.a[0] + o, s.a[1]);
          c.lineTo(s.b[0] + o, s.b[1]);
        }
      c.stroke();
    }
    paintEnds(c, pl);
    c.restore();
    // (the lacquer's edge catching the window: a pale line just inside the rim's outer edge)
    c.lineJoin = 'round';
    c.strokeStyle = rgba(LIGHT, 0.22);
    c.lineWidth = 1;
    c.stroke(inner);
  });
}

/** the grand, live. Returns each key's speaking length and its unison's offsets (for the shapes). */
export function drawGrandPlan(ctx: CanvasRenderingContext2D, W: number, H: number, pts: Pt[], lid: number, fr: VisualFrame | null, st: PianoState, field: ModeField, now: number, lv: { l: (i: number) => number; s: (i: number) => number }): { ends: (p: Pt) => [number, number, number, number]; unison: (p: Pt) => number[] } {
  // the depth shown (smoothed: a phone's keyboard scrolls), then the cached layout
  const target = grandDepth(W, pts);
  st.maxL = st.maxL > 0.5 && st.maxL < 3 ? st.maxL + (target - st.maxL) * 0.15 : target;
  if (Math.abs(st.maxL - target) < 4e-4) st.maxL = target;
  const dpr = ctx.getTransform().a || 1;
  const lay = layout(W, H, pts, dpr, st.maxL);
  paintBase(lay, W, H, dpr);
  const { Y, pxm, pitch, strs } = lay;
  const { x0: xL, x1: xR, y0: yTop, y1: yKey } = lay.box;
  const vis = (s: GStr) => s.x > -pitch * 2 && s.x < W + pitch * 2;
  ctx.drawImage(base.canvas, 0, 0, W, H);
  // ---- the board's live modes, across the whole case
  if (field.update(fr?.modes ?? null, now / 1000) > 0.01) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    ctx.clip(lay.inner);
    ctx.globalAlpha = 0.8;
    // (over the part of the case in view, a little oversize: the field's still edge falls outside)
    const fy = Math.max(0, yTop);
    ctx.drawImage(field.canvas, xL - 0.04 * (xR - xL), fy - 0.04 * (yKey - fy), 1.08 * (xR - xL), 1.08 * (yKey - fy));
    ctx.restore();
  }
  // ---- the sounding strings light along their speaking length
  st.hits.length = 0;
  for (const s of strs) {
    const p = s.p;
    if ((s.b[0] < -p.w * 2 && s.a[0] < -p.w * 2) || (s.b[0] > W + p.w * 2 && s.a[0] > W + p.w * 2)) continue;
    st.hits.push({ midi: p.midi, x0: s.a[0], y0: s.a[1], x1: s.b[0], y1: s.b[1], w: p.w });
    lightString(ctx, s.a[0], s.a[1], s.b[0], s.b[1], s.off, lv.l(p.i), lv.s(p.i));
  }
  // ---- the action, as two rows of marks: dampers on the strings, hammers on the strike line (the
  //      una corda slides them to the treble, off one string of each unison)
  const sh = st.shift * Math.max(GZ.shift * pxm, 2.4);
  const yD = Y(GZ.damper);
  const yS = Y(GZ.strike);
  const sv = Y(0) - Y(1);
  const dLen = Math.max(4, Math.min(11, pitch * 0.7));
  for (const s of strs) {
    if (!vis(s)) continue;
    // (a damper head: about 11 px along its strings, from just behind the hammers back; turned with the bass)
    if (s.p.k.hasDamper) damperMark(ctx, s.x + (yS - yD + dLen / 2 - 2) * (s.lean / sv), yD - dLen / 2 + 2, pitch * 0.6, st.damper[s.p.i], dLen, Math.atan(s.lean / sv));
    hammerMark(ctx, s.x + sh, yS, pitch * 0.5, st.hammer[s.p.i], st.shift);
  }
  // ---- a strike: a puff of the blue where the hammer meets the strings
  for (const s of strs) {
    const t = st.strikes.get(s.p.midi);
    if (t === undefined || !vis(s)) continue;
    const age = (now - t) / 320;
    if (age < 0 || age > 1) continue;
    const v = (st.vels.get(s.p.midi) ?? 64) / 127;
    const r = (0.7 + 1.1 * v) * pitch * (0.8 + 0.7 * age);
    const a = (1 - age) ** 2 * (0.35 + 0.5 * v);
    const g = ctx.createRadialGradient(s.x + sh, yS, 0, s.x + sh, yS, r);
    g.addColorStop(0, rgba(INK.sound, a * 0.9));
    g.addColorStop(0.4, rgba(INK.sound, a * 0.4));
    g.addColorStop(1, rgba(INK.sound, 0));
    ctx.fillStyle = g;
    ctx.fillRect(s.x + sh - r, yS - r, 2 * r, 2 * r);
  }
  // ---- the lid: hinged on the spine, it rises towards the viewer and is seen foreshortened;
  //      closed, it covers the strings
  st.caseBox = lay.box;
  st.src = { x: xL + (xR - xL) * 0.42, y: (yTop + yKey) / 2 + 20 };
  const lidOpen = Math.min(1, Math.max(0, lid));
  const cphi = Math.cos(lidOpen * (Math.PI / 2.4));
  ctx.save();
  ctx.translate(xL, 0);
  ctx.scale(cphi, 1);
  ctx.translate(-xL, 0);
  // (its shade: whole when it is down; raised, it thins towards the free edge, so the edge is no seam
  // across the plate)
  const shade = 0.07 + 0.86 * (1 - lidOpen) ** 1.5;
  const sg = ctx.createLinearGradient(xL, 0, xR, 0);
  sg.addColorStop(0, rgba(RIM, shade));
  sg.addColorStop(0.45, rgba(RIM, shade));
  sg.addColorStop(1, rgba(RIM, shade * (1 - lidOpen)));
  ctx.fillStyle = sg;
  ctx.fill(lay.outline);
  ctx.restore();
  // its outline, foreshortened, and its free edge catching the light
  ctx.strokeStyle = rgba(INK.line, 0.3 + 0.2 * (1 - lidOpen));
  ctx.lineWidth = 1;
  ctx.beginPath();
  lay.outer.forEach(([x, y], k) => (k ? ctx.lineTo(xL + (x - xL) * cphi, y) : ctx.moveTo(xL + (x - xL) * cphi, y)));
  ctx.stroke();
  const edgeX = xL + (xR - xL) * cphi;
  // (the free edge: quiet, since it crosses the strings)
  ctx.strokeStyle = rgba(INK.line, 0.22 + 0.14 * lidOpen);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(edgeX, yTop + (yKey - yTop) * 0.25);
  // (it stops at the pin block: no line across the bronze)
  let yEdge = yKey - 6;
  for (const s of strs)
    if (s.a[0] >= edgeX) {
      yEdge = Math.min(yEdge, s.a[1] - 4);
      break;
    }
  ctx.lineTo(edgeX, yEdge);
  ctx.stroke();
  st.lidEdge = { x: edgeX, y: yTop + (yKey - yTop) * 0.55 };
  const of = (p: Pt) => strs[p.i - strs[0].p.i];
  return {
    ends: (p) => {
      const s = of(p);
      return [s.a[0], s.a[1], s.b[0], s.b[1]];
    },
    unison: (p) => of(p).off,
  };
}
