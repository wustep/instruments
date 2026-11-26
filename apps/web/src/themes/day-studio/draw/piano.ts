// Day Studio: both pianos on the 2D stage (the grand's plan is ./grand.ts; the upright is here), and the
// strings' shapes over them, a unison's strings told apart as tints of the one blue. Layouts and live state
// are the shared drawer's (ui/piano-draw.ts).
import type { VisualFrame } from '@piano-model/engine';
import { Layer, path, SYM_VISIBLE } from '../../../ui/grand-plan.ts';
import { levelsOf, type PianoGeom, type PianoState, type Pt, stepAction, upLayout, type UpLayout, upPlate } from '../../../ui/piano-draw.ts';
import { INK, ModeField, rgba } from '../../../ui/stage-draw.ts';
import { BRIDGE, castShadow, damperMark, drawGrandPlan, hammerMark, lightString, paintBoard, paintEnds, paintPlate, RIM, STRING_STEEL, STRING_WOUND } from './grand.ts';
import { LIGHT } from './kit.ts';

/** a unison's strings, told apart as tints of the one blue (they are all sound): the first is the sound's
 *  own ink (read as it draws), then a paler, a deeper */
const UNISON_TINTS = ['104,140,238', '16,40,128'];

/** the last struck note's strings, their live shape, from (x0,y0) to (x1,y1) */
function drawFocus(ctx: CanvasRenderingContext2D, focus: NonNullable<VisualFrame['focus']>, ends: (j: number) => [number, number, number, number], w: number, st: PianoState): void {
  let m = 0;
  for (const s of focus.shapes) for (let i = 0; i < s.length; i++) m = Math.max(m, Math.abs(s[i]));
  const scale = st.strScale.of(m);
  const amp = Math.max(12, w * 1.9) / scale;
  focus.shapes.forEach((s, j) => {
    const [x0, y0, x1, y1] = ends(j);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    for (const [wid, a] of [
      [5, 0.2],
      [1.7, 0.97],
    ] as const) {
      ctx.strokeStyle = rgba(j ? (UNISON_TINTS[j - 1] ?? INK.sound) : INK.sound, a);
      ctx.lineWidth = wid;
      ctx.beginPath();
      for (let i = 0; i < s.length; i++) {
        const f = i / (s.length - 1);
        const x = x0 + (x1 - x0) * f + nx * s[i] * amp;
        const y = y0 + (y1 - y0) * f + ny * s[i] * amp;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  });
}


/** every sounding string at once: struck strings vermilion, sympathetic ones amber and
 *  (being quieter) smaller; all on one scale, so a decaying note visibly settles */
function drawAllShapes(ctx: CanvasRenderingContext2D, fr: VisualFrame | null, byMidi: Map<number, Pt>, ends: (p: Pt) => [number, number, number, number], st: PianoState, W: number, skip: number): void {
  const ps = fr?.pianoShapes;
  if (!ps || !ps.midi.length) return;
  const P = ps.points;
  let mx = 0;
  for (let i = 0; i < ps.shapes.length; i++) mx = Math.max(mx, Math.abs(ps.shapes[i]));
  const scale = st.allScale.of(mx);
  for (let j = 0; j < ps.midi.length; j++) {
    const m = ps.midi[j];
    if (m === skip && !ps.light[j]) continue;
    const p = byMidi.get(m);
    if (!p || p.x < -p.w || p.x > W + p.w) continue;
    const amp = Math.max(10, p.w * 1.7) / scale;
    const [x0, y0, x1, y1] = ends(p);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    const sym = ps.light[j] === 1;
    let alpha = 0.85;
    if (sym) {
      // as faint as the string's real motion, relative to the loudest struck string (the
      // engine's reference, which remembers a released chord for a second or two)
      const rel = fr?.symLevels?.[m - 21] ?? 0;
      if (rel < SYM_VISIBLE) continue;
      alpha = Math.min(0.55, 0.1 + 0.6 * rel);
    }
    // (a struck string's shape is drawn twice: a soft wide glow under a firm line)
    for (let pass = sym ? 1 : 0; pass < 2; pass++) {
      ctx.strokeStyle = sym ? rgba(INK.sound, alpha * 0.8) : rgba(INK.sound, pass ? 0.95 : 0.14);
      ctx.lineWidth = sym ? 1 : pass ? 1.5 : 4.5;
      ctx.beginPath();
      for (let i = 0; i < P; i++) {
        const f = i / (P - 1);
        const d = ps.shapes[j * P + i] * amp;
        const x = x0 + (x1 - x0) * f + nx * d;
        const y = y0 + (y1 - y0) * f + ny * d;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
  }
}

// ================================================================ grand (from above)
export function drawPiano(ctx: CanvasRenderingContext2D, W: number, H: number, g: PianoGeom, fr: VisualFrame | null, st: PianoState, field: ModeField, now: number): void {
  if (g.kind === 'upright') return drawUpright(ctx, W, H, g, fr, st, field, now);
  const keys = g.keys;
  if (!keys.length) return;
  const pts: Pt[] = keys.map((k) => {
    const kx = g.keyX(k.midi);
    return { midi: k.midi, i: k.midi - 21, x: kx.x, w: kx.w, L: k.lengthM, k, wound: k.midi < 48 && k.nStrings <= 2 };
  });
  stepAction(pts, st);
  // the grand from above (grand-plan.ts), then every sounding string's live shape and the last
  // struck note's unisons in detail
  const { ends, unison } = drawGrandPlan(ctx, W, H, pts, g.lid ?? 1, fr, st, field, now, levelsOf(fr, st));
  const focus = fr?.focus ?? null;
  drawAllShapes(ctx, fr, new Map(pts.map((p) => [p.midi, p])), ends, st, W, focus?.midi ?? -1);
  if (focus) {
    const p = pts.find((q) => q.midi === focus.midi);
    if (p) {
      const [x0, y0, x1, y1] = ends(p);
      const off = unison(p);
      drawFocus(ctx, focus, (j) => {
        const o = off[Math.min(off.length - 1, j)] ?? 0;
        return [x0 + o, y0, x1 + o, y1];
      }, p.w, st);
    }
  }
}
const upBase = new Layer();

/** the still picture: the case, the plate over the board, bridges, pressure bar and the strings at rest */
function paintUpBase(lay: UpLayout, W: number, H: number, dpr: number): void {
  const { strings, box, inner, pitch } = lay;
  const bass = strings.filter((s) => s.p.wound);
  const treb = strings.filter((s) => !s.p.wound);
  upBase.paint(W, H, dpr, lay.key, (c) => {
    const pl = upPlate(lay);
    // the case's walls (black lacquer, as the grand's rim) and its shadow, the spruce board in the opening
    castShadow(c, box);
    c.fillStyle = rgba(RIM, 1);
    c.fill(box);
    paintBoard(c, inner, lay.rect);
    c.save();
    c.clip(inner);
    // (the case stands over the board: its shade along the upper and left sides)
    c.save();
    c.shadowColor = 'rgba(60,42,16,0.45)';
    c.shadowBlur = 10;
    c.shadowOffsetX = 3;
    c.shadowOffsetY = 5;
    c.strokeStyle = rgba(RIM, 1);
    c.lineWidth = 2;
    c.stroke(inner);
    c.restore();
    paintPlate(c, pl, inner, lay.rect);
    // the hammer rail: the line the hammers rest along
    c.strokeStyle = rgba('110,82,36', 0.3);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(strings[0].hx - pitch, strings[0].hy + 5);
    c.lineTo(strings[strings.length - 1].hx + pitch, strings[0].hy + 5);
    c.stroke();
    // the bridges: the treble bridge along the strings' lower ends, the bass bridge on its own
    c.lineJoin = 'round';
    c.strokeStyle = rgba(BRIDGE, 0.95);
    c.lineWidth = 3;
    for (const part of [treb, bass]) {
      if (part.length < 2) continue;
      c.beginPath();
      part.forEach((s, k) => (k ? c.lineTo(s.x1, s.y1) : c.moveTo(s.x1, s.y1)));
      c.stroke();
    }
    // the pressure bar: where every speaking length begins, slanting up to the bass
    c.strokeStyle = rgba('110,82,36', 0.65);
    c.lineWidth = 1.5;
    for (const part of [treb, bass]) if (part.length > 1) c.stroke(path(part.map((s): [number, number] => [s.x0, s.y0]), false));
    // the strings at rest: steel tenor and treble, then the copper-wound bass across them
    c.lineCap = 'butt';
    for (const part of [treb, bass]) {
      const wound = part === bass;
      c.strokeStyle = rgba(wound ? STRING_WOUND : STRING_STEEL, wound ? 0.85 : 0.5);
      c.lineWidth = wound ? 1.3 : 0.8;
      c.beginPath();
      for (const s of part)
        for (const o of s.off) {
          c.moveTo(s.x0 + o, s.y0);
          c.lineTo(s.x1 + o, s.y1);
        }
      c.stroke();
    }
    paintEnds(c, pl);
    c.restore();
    c.strokeStyle = rgba(LIGHT, 0.22);
    c.lineWidth = 1;
    c.stroke(inner);
  });
}

function drawUpright(ctx: CanvasRenderingContext2D, W: number, H: number, g: PianoGeom, fr: VisualFrame | null, st: PianoState, field: ModeField, now: number): void {
  const keys = g.keys;
  if (!keys.length) return;
  const pts: Pt[] = keys.map((k) => {
    const kx = g.keyX(k.midi);
    return { midi: k.midi, i: k.midi - 21, x: kx.x, w: kx.w, L: k.lengthM, k, wound: k.midi < 48 && k.nStrings <= 2 };
  });
  stepAction(pts, st);
  // the scale: the longest string whose key is in view (smoothed: a phone's keyboard scrolls), and
  // never so close that the bass is lost
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
  const lay = upLayout(W, H, pts, dpr, st.maxL);
  paintUpBase(lay, W, H, dpr);
  const { rect, pitch } = lay;
  ctx.drawImage(upBase.canvas, 0, 0, W, H);
  ctx.save();
  ctx.clip(lay.inner);
  // ---- the board's live modes, across the whole case
  if (field.update(fr?.modes ?? null, now / 1000) > 0.01) {
    ctx.globalAlpha = 0.8;
    // (a little oversize: the field's still edge falls outside the case)
    ctx.drawImage(field.canvas, rect.x0 - 0.04 * (rect.x1 - rect.x0), rect.y0 - 0.04 * (rect.y1 - rect.y0), 1.08 * (rect.x1 - rect.x0), 1.08 * (rect.y1 - rect.y0));
    ctx.globalAlpha = 1;
  }
  // ---- the sounding strings light along their speaking length
  const lv = levelsOf(fr, st);
  st.hits.length = 0;
  for (const s of lay.strings) {
    const p = s.p;
    if ((s.x0 < -p.w && s.x1 < -p.w) || (s.x0 > W + p.w && s.x1 > W + p.w)) continue;
    st.hits.push({ midi: p.midi, x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, w: p.w });
    lightString(ctx, s.x0, s.y0, s.x1, s.y1, s.off, lv.l(p.i), lv.s(p.i));
  }
  // ---- the action, as two rows of marks: the dampers on the strings, the hammers over the strike
  //      points (at rest a little off the strings; the half-blow rail brings them nearer)
  for (const s of lay.strings) {
    if (s.hx < -pitch || s.hx > W + pitch) continue;
    const h = st.hammer[s.p.i];
    if (s.p.k.hasDamper) damperMark(ctx, s.dx, s.dy, pitch * 0.6, st.damper[s.p.i], lay.dLen, -Math.atan2(s.x1 - s.x0, s.y1 - s.y0));
    hammerMark(ctx, s.hx, s.hy + 5 * (1 - h), pitch * 0.5, h, st.soft);
  }
  // ---- the practice muffler: a felt strip let down between the hammers and the strings
  if (st.middle > 0.02) {
    ctx.strokeStyle = rgba('236,230,214', 0.9 * st.middle);
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    lay.strings.forEach((s, k) => (k ? ctx.lineTo(s.hx, s.hy) : ctx.moveTo(s.hx, s.hy)));
    ctx.stroke();
  }
  st.src = { x: (Math.max(0, rect.x0) + Math.min(W, rect.x1)) / 2, y: (rect.y0 + rect.y1) / 2 };
  st.caseBox = rect;
  st.lidEdge = null;
  // ---- every sounding string's live shape, then the last struck note's unisons in detail
  const ends = (p: Pt): [number, number, number, number] => {
    const s = lay.strings[p.i - lay.strings[0].p.i];
    return [s.x0, s.y0, s.x1, s.y1];
  };
  const focus = fr?.focus ?? null;
  drawAllShapes(ctx, fr, new Map(pts.map((p) => [p.midi, p])), ends, st, W, focus?.midi ?? -1);
  if (focus) {
    const p = pts.find((q) => q.midi === focus.midi);
    if (p) {
      const s = lay.strings[p.i - lay.strings[0].p.i];
      drawFocus(ctx, focus, (j) => {
        const o = s.off[Math.min(s.off.length - 1, j)] ?? 0;
        return [s.x0 + o, s.y0, s.x1 + o, s.y1];
      }, p.w, st);
    }
  }
  ctx.restore();
}
