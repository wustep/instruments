// The piano on the stage, as a diagram: the grand from above (grand-plan.ts) or the upright from
// the front. Strings at their real lengths above their own keys, the bridges, a quiet outline of
// the case; over them the sound itself: the soundboard's modes across the whole board, sounding
// strings lit, and every sounding string's live shape. The action is two rows of marks (hammers,
// dampers) that follow the live state: key presses with their velocity, strike moments, the pedals.

import type { KeySummary, VisualFrame } from '@piano-model/engine';
import { AutoScale, INK, ModeField, rgba } from './stage-draw.ts';
import { Layer, SPRUCE, SYM_VISIBLE, damperMark, drawGrandPlan, hammerMark, lightString, paintEnds, paintPlate, path, plateOf, type Plate } from './grand-plan.ts';

export interface PianoGeom {
  keys: KeySummary[];
  /** x (CSS px, stage coordinates) of a key's centre, and its width (may lie off-screen) */
  keyX: (midi: number) => { x: number; w: number };
  kind: 'grand' | 'upright';
  /** lid opening 0 (closed) … 1 (fully open) */
  lid?: number;
}

export interface PianoState {
  /** longest visible string, smoothed (sets the drawing scale; phones show part of the keyboard) */
  maxL: number;
  /** strike moments (performance.now) and velocities per key */
  strikes: Map<number, number>;
  vels: Map<number, number>;
  down: Set<number>;
  sustain: number;
  soft: number;
  /** the middle pedal: a grand's sostenuto, an upright's muffler (0 … 1) */
  middle: number;
  /** an upright's action: the soft pedal is the half-blow rail, the middle pedal the muffler */
  upright: boolean;
  /** keys whose dampers the sostenuto holds (latched as it went down) */
  sost: Uint8Array;
  sostWas: boolean;
  strScale: AutoScale;
  lvlScale: AutoScale;
  /** running scale for all sounding strings' shapes together (so quieter ones look smaller) */
  allScale: AutoScale;
  /** smoothed hammer height (0 rest … 1 at the string) and damper lift per key (A0…C8) */
  hammer: Float32Array;
  damper: Float32Array;
  shift: number;
  lastStrike: Map<number, number>;
  /** set while drawing: where sound leaves the instrument, the case, and the lid's free edge */
  src: { x: number; y: number };
  caseBox: { x0: number; x1: number; y0: number; y1: number };
  lidEdge: { x: number; y: number } | null;
  /** each visible key's strings as drawn (for clicking a note's strings) */
  hits: { midi: number; x0: number; y0: number; x1: number; y1: number; w: number }[];
}

/** the key whose strings are nearest (x, y) in stage coordinates, if close enough */
export function stringAt(st: PianoState, x: number, y: number): number | null {
  let best: number | null = null;
  let bd = Infinity;
  for (const h of st.hits) {
    const dx = h.x1 - h.x0;
    const dy = h.y1 - h.y0;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - h.x0) * dx + (y - h.y0) * dy) / L2));
    const d = Math.hypot(x - (h.x0 + t * dx), y - (h.y0 + t * dy));
    if (d < Math.max(6, h.w * 0.6) && d < bd) {
      bd = d;
      best = h.midi;
    }
  }
  return best;
}

export const newPianoState = (): PianoState => ({
  maxL: 0,
  strikes: new Map(),
  vels: new Map(),
  down: new Set(),
  sustain: 0,
  soft: 0,
  middle: 0,
  upright: false,
  sost: new Uint8Array(88),
  sostWas: false,
  strScale: new AutoScale(2e-6),
  lvlScale: new AutoScale(1e-6, 0.995),
  allScale: new AutoScale(2e-6, 0.99),
  hammer: new Float32Array(88),
  damper: new Float32Array(88),
  shift: 0,
  lastStrike: new Map(),
  src: { x: 0, y: 0 },
  caseBox: { x0: 0, x1: 0, y0: 0, y1: 0 },
  lidEdge: null,
  hits: [],
});

export interface Pt {
  midi: number;
  i: number;
  x: number;
  w: number;
  L: number;
  k: KeySummary;
  wound: boolean;
}

/** advance the action: hammers jump to the string when struck, rebound with the key's
 *  velocity, are caught by the backcheck while the key is held; dampers follow the key
 *  and the sustain pedal (half-pedal lifts them part way) */
export function stepAction(pts: Pt[], st: PianoState): void {
  // a grand's soft pedal shifts the action; an upright's brings the hammers nearer the strings
  st.shift += ((st.upright ? 0 : st.soft) - st.shift) * 0.25;
  // the sostenuto (a grand's middle pedal) latches the keys down as it goes down, as the engine does
  const sostOn = !st.upright && st.middle >= 0.5;
  for (const p of pts) {
    if (!sostOn) st.sost[p.i] = 0;
    else if (st.sostWas === false && st.down.has(p.midi)) st.sost[p.i] = 1;
  }
  st.sostWas = sostOn;
  for (const p of pts) {
    const t = st.strikes.get(p.midi);
    if (t !== undefined && st.lastStrike.get(p.midi) !== t) {
      st.lastStrike.set(p.midi, t);
      st.hammer[p.i] = 1;
    }
    const held = st.down.has(p.midi);
    const v = (st.vels.get(p.midi) ?? 64) / 127;
    // louder strikes rebound faster and further
    const rate = 0.1 + 0.18 * v;
    // (the half-blow rail holds an upright's hammers about 45 % of the way to the strings)
    const target = Math.max(held ? 0.32 : 0, st.upright ? 0.45 * st.soft : 0);
    st.hammer[p.i] += (target - st.hammer[p.i]) * rate;
    const lift = p.k.hasDamper ? Math.max(held || st.sost[p.i] ? 1 : 0, Math.min(1, st.sustain * 1.4)) : 1;
    st.damper[p.i] += (lift - st.damper[p.i]) * (lift > st.damper[p.i] ? 0.45 : 0.22);
  }
}

/** struck strings: √level on an auto scale, so a decaying note stays visible while it sounds.
 *  Sympathetic strings: their real displacement relative to the loudest struck string, linear
 *  (the engine's `symLevels`), so they glow only when they really move. Under a bass note the
 *  undamped treble moves at about −70 dB and stays dark; a pedalled octave builds to −10 dB. */
export function levelsOf(fr: VisualFrame | null, st: PianoState): { l: (i: number) => number; s: (i: number) => number } {
  const levels = fr?.levels;
  const sym = fr?.symLevels;
  let mx = 0;
  if (levels) for (let i = 0; i < levels.length; i++) mx = Math.max(mx, levels[i]);
  const norm = st.lvlScale.of(mx);
  return { l: (i) => (levels ? Math.sqrt(levels[i] / norm) : 0), s: (i) => (sym ? Math.min(1, sym[i]) : 0) };
}

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
      ctx.strokeStyle = rgba(j === 0 ? INK.vermilion : j === 1 ? INK.amber : INK.steel, a);
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
      ctx.strokeStyle = sym ? rgba(INK.amber, alpha) : rgba(INK.vermilion, pass ? 0.92 : 0.16);
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

// ================================================================ upright (front view)
// The upright from the front: the case, and in it the plate's frame over the spruce board. The hammers
// stand in one level row, as an upright's do, each at its string's strike point; so the strings' tops
// step up towards the bass under the slanting pressure bar, with the tuning pins in the block above it
// (their real lengths; the wound bass crossing the tenor to its own bridge). The dampers are a row of
// heads just under the hammers. x follows the on-screen keyboard (the action's even pitch, 88 steps
// across the 52 white keys); the height is fitted to the longest string in view, so a phone showing two
// octaves shows them large.
/** strike point as a fraction of the speaking length (the engine's scale) */
const strikeBeta = (m: number) => (m <= 60 ? 0.12 : 0.12 - ((m - 60) / 48) * 0.055);
export interface UpString {
  p: Pt;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  off: number[];
  /** the strike point (every string's at one height) and the damper's middle, on the string */
  hx: number;
  hy: number;
  dx: number;
  dy: number;
}
export interface UpLayout {
  key: string;
  strings: UpString[];
  pitch: number;
  box: Path2D;
  rect: { x0: number; x1: number; y0: number; y1: number };
  /** the case's inside (its walls a little in from the box): the opening the plate and board show in */
  inner: Path2D;
  in: { x0: number; x1: number; y0: number; y1: number };
  /** a damper head's length along its string (px) */
  dLen: number;
}
let upCache: UpLayout | null = null;
const upBase = new Layer();

/** the upright's front view on a W×H stage (cached; the vector display draws from the same one) */
export function upLayout(W: number, H: number, pts: Pt[], dpr: number, maxL: number): UpLayout {
  const key = `${W}|${H}|${dpr}|${pts[0].x.toFixed(1)}|${pts[pts.length - 1].x.toFixed(1)}|${maxL.toFixed(4)}|${pts.map((p) => p.L.toFixed(3)).join('')}`;
  if (upCache && upCache.key === key) return upCache;
  const kx0 = pts[0].x - pts[0].w / 2;
  const kx1 = pts[pts.length - 1].x + pts[pts.length - 1].w / 2;
  const pitch = (kx1 - kx0) / 88;
  const margin = Math.max(8, Math.min(kx0 - 4, pitch * 1.4));
  const rect = { x0: kx0 - margin, x1: kx1 + margin, y0: 6, y1: H - 6 };
  // room over the longest string's top for its pins, and under its bridge for the hitch rail
  const head = Math.max(12, Math.min(34, 0.07 * (rect.y1 - rect.y0), 2.2 * pitch));
  const foot = Math.max(12, Math.min(30, 0.07 * (rect.y1 - rect.y0), 2 * pitch));
  const top = rect.y0 + head;
  const sc = (rect.y1 - foot - top) / maxL;
  const sp = Math.min(2.4, pitch * 0.2);
  const nb = pts.reduce((a, p) => a + (p.wound ? 1 : 0), 0);
  // the strike line: level, where the longest string in view (hung from the top) is struck
  const yS = top + 0.12 * maxL * sc;
  const dLen = Math.max(4, Math.min(8, pitch * 0.5));
  const strings: UpString[] = pts.map((p, k) => {
    const x0 = kx0 + (p.i + 0.5) * pitch;
    const len = Math.max(0.04, p.L) * sc;
    // cross-stringing: the bass runs down and across the tenor, the lowest strings leaning most
    const sx = p.wound ? (0.18 + 0.22 * (1 - k / Math.max(1, nb))) * len : 0;
    const ly = Math.sqrt(Math.max(0, len * len - sx * sx));
    const f = strikeBeta(p.midi);
    const y0 = yS - f * ly;
    const n = Math.max(1, p.k.nStrings);
    // the damper's head: just under the hammers' row
    const fd = Math.min(0.92, f + (10 + dLen / 2) / Math.max(1, ly));
    return { p, x0, y0, x1: x0 + sx, y1: y0 + ly, off: Array.from({ length: n }, (_, j) => (j - (n - 1) / 2) * sp), hx: x0 + sx * f, hy: yS, dx: x0 + sx * fd, dy: y0 + ly * fd };
  });
  const box = new Path2D();
  box.roundRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0, 8);
  const wall = Math.max(3, Math.min(9, margin * 0.4));
  const lip = Math.max(3, Math.min(5, margin * 0.4));
  const inn = { x0: rect.x0 + wall, x1: rect.x1 - wall, y0: rect.y0 + lip, y1: rect.y1 - lip };
  const inner = new Path2D();
  inner.roundRect(inn.x0, inn.y0, inn.x1 - inn.x0, inn.y1 - inn.y0, 3);
  upCache = { key, strings, pitch, box, rect, inner, in: inn, dLen };
  return upCache;
}

const upPlates = new WeakMap<UpLayout, Plate>();
/** the upright's plate: the pin block over the pressure bar, the hitch rails under the bridges, the band
 *  inside the case, the struts (cached with the layout) */
export function upPlate(lay: UpLayout): Plate {
  let pl = upPlates.get(lay);
  if (pl) return pl;
  const { pitch } = lay;
  const r = lay.in;
  const band = Math.max(3, Math.min(7, pitch * 0.45));
  const k = Math.min(1, pitch / 14);
  pl = plateOf(
    lay.strings.map((s) => ({ a: [s.x0, s.y0], b: [s.x1, s.y1], off: s.off, i: s.p.i, midi: s.p.midi, wound: s.p.wound })),
    {
      pitch,
      inside: (x, y) => x > r.x0 + 2 && x < r.x1 - 2 && y > r.y0 + 2 && y < r.y1 - 2,
      tail: (wound, j, n) => (wound ? 13 : 12 + 8 * (1 - j / n)) * k,
      toward: -1,
      limit: lay.rect.y0 - 6,
      band,
      strutEnd: () => r.y1 - band,
    },
  );
  upPlates.set(lay, pl);
  return pl;
}

/** the still picture: the case, the plate over the board, bridges, pressure bar and the strings at rest */
function paintUpBase(lay: UpLayout, W: number, H: number, dpr: number): void {
  const { strings, box, inner, pitch } = lay;
  const bass = strings.filter((s) => s.p.wound);
  const treb = strings.filter((s) => !s.p.wound);
  upBase.paint(W, H, dpr, lay.key, (c) => {
    const pl = upPlate(lay);
    // the case's walls (ebony, as the grand's rim), the spruce board in the opening
    c.fillStyle = rgba(INK.ebony, 1);
    c.fill(box);
    c.fillStyle = rgba(SPRUCE, 0.4);
    c.fill(inner);
    c.save();
    c.clip(inner);
    paintPlate(c, pl, inner, lay.rect);
    // the hammer rail: the line the hammers rest along
    c.strokeStyle = rgba(INK.felt, 0.14);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(strings[0].hx - pitch, strings[0].hy + 5);
    c.lineTo(strings[strings.length - 1].hx + pitch, strings[0].hy + 5);
    c.stroke();
    // the bridges: the treble bridge along the strings' lower ends, the bass bridge on its own
    c.lineJoin = 'round';
    c.strokeStyle = rgba(INK.felt, 0.5);
    c.lineWidth = 3;
    for (const part of [treb, bass]) {
      if (part.length < 2) continue;
      c.beginPath();
      part.forEach((s, k) => (k ? c.lineTo(s.x1, s.y1) : c.moveTo(s.x1, s.y1)));
      c.stroke();
    }
    // the pressure bar: where every speaking length begins, slanting up to the bass
    c.strokeStyle = rgba(INK.ivory, 0.3);
    c.lineWidth = 1.5;
    for (const part of [treb, bass]) if (part.length > 1) c.stroke(path(part.map((s): [number, number] => [s.x0, s.y0]), false));
    // the strings at rest: steel tenor and treble, then the copper-wound bass across them
    c.lineCap = 'butt';
    for (const part of [treb, bass]) {
      const wound = part === bass;
      c.strokeStyle = rgba(wound ? INK.copper : INK.ivory, wound ? 0.5 : 0.24);
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
    c.strokeStyle = rgba(INK.ivory, 0.1);
    c.lineWidth = 1;
    c.stroke(inner);
    c.strokeStyle = rgba(INK.ivory, 0.34);
    c.lineWidth = 1.4;
    c.stroke(box);
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
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    // (a little oversize: the field's still edge falls outside the case)
    ctx.drawImage(field.canvas, rect.x0 - 0.04 * (rect.x1 - rect.x0), rect.y0 - 0.04 * (rect.y1 - rect.y0), 1.08 * (rect.x1 - rect.x0), 1.08 * (rect.y1 - rect.y0));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
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
    ctx.strokeStyle = rgba(INK.felt, 0.55 * st.middle);
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

