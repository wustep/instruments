// The piano on the stage, grand (plan view from above) or upright (front view, panels
// off). Strings at their real lengths, one per unison, above their own keys; hammers,
// dampers and the una corda shift follow the live state (key presses with their
// velocity, strike moments, the pedals, string levels from the audio thread). Plate,
// struts, pins, agraffes, bridges and soundboard ribs are drawn faintly, as structure.

import type { KeySummary, VisualFrame } from '@piano-model/engine';
import { AutoScale, INK, ModeField, rgba } from './stage-draw.ts';

export interface PianoGeom {
  keys: KeySummary[];
  /** x (CSS px, stage coordinates) of a key's centre, and its width (may lie off-screen) */
  keyX: (midi: number) => { x: number; w: number };
  kind: 'grand' | 'upright';
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
  strScale: AutoScale;
  lvlScale: AutoScale;
  /** running scale for all sounding strings' shapes together (so quieter ones look smaller) */
  allScale: AutoScale;
  /** smoothed hammer height (0 rest … 1 at the string) and damper lift per key (A0…C8) */
  hammer: Float32Array;
  damper: Float32Array;
  shift: number;
  lastStrike: Map<number, number>;
}

export const newPianoState = (): PianoState => ({
  maxL: 0,
  strikes: new Map(),
  vels: new Map(),
  down: new Set(),
  sustain: 0,
  soft: 0,
  strScale: new AutoScale(2e-6),
  lvlScale: new AutoScale(1e-6, 0.995),
  allScale: new AutoScale(2e-6, 0.99),
  hammer: new Float32Array(88),
  damper: new Float32Array(88),
  shift: 0,
  lastStrike: new Map(),
});

interface Pt {
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
function stepAction(pts: Pt[], st: PianoState): void {
  st.shift += (st.soft - st.shift) * 0.25;
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
    const target = held ? 0.32 : 0;
    st.hammer[p.i] += (target - st.hammer[p.i]) * rate;
    const lift = p.k.hasDamper ? Math.max(held ? 1 : 0, Math.min(1, st.sustain * 1.4)) : 1;
    st.damper[p.i] += (lift - st.damper[p.i]) * (lift > st.damper[p.i] ? 0.45 : 0.22);
  }
}

function levelsOf(fr: VisualFrame | null, st: PianoState): { l: (i: number) => number; s: (i: number) => number } {
  const levels = fr?.levels;
  const sym = fr?.symLevels;
  let mx = 0;
  if (levels) for (let i = 0; i < levels.length; i++) mx = Math.max(mx, levels[i], sym ? sym[i] : 0);
  const norm = st.lvlScale.of(mx);
  return { l: (i) => (levels ? Math.sqrt(levels[i] / norm) : 0), s: (i) => (sym ? Math.sqrt(sym[i] / norm) : 0) };
}

/** a string's static line plus its live glow */
function strokeString(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, wound: boolean, l: number, s: number): void {
  ctx.strokeStyle = rgba(wound ? INK.copper : INK.ivory, wound ? 0.45 : 0.22);
  ctx.lineWidth = wound ? 1.3 : 0.8;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  if (l > 0.02 || s > 0.02) {
    ctx.strokeStyle = l >= s ? rgba(INK.vermilion, 0.15 + 0.85 * l) : rgba(INK.amber, 0.2 + 0.8 * s);
    ctx.lineWidth = 1 + 1.6 * Math.max(l, s);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
}

/** the last struck note's strings, their live shape, from (x0,y0) to (x1,y1) */
function drawFocus(ctx: CanvasRenderingContext2D, focus: NonNullable<VisualFrame['focus']>, ends: (j: number) => [number, number, number, number], w: number, st: PianoState): void {
  let m = 0;
  for (const s of focus.shapes) for (let i = 0; i < s.length; i++) m = Math.max(m, Math.abs(s[i]));
  const scale = st.strScale.of(m);
  const amp = Math.max(10, w * 1.7) / scale;
  focus.shapes.forEach((s, j) => {
    const [x0, y0, x1, y1] = ends(j);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    for (const [wid, a] of [
      [4, 0.18],
      [1.4, 0.95],
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
    const amp = Math.max(8, p.w * 1.5) / scale;
    const [x0, y0, x1, y1] = ends(p);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    const sym = ps.light[j] === 1;
    ctx.strokeStyle = sym ? rgba(INK.amber, 0.7) : rgba(INK.vermilion, 0.85);
    ctx.lineWidth = sym ? 0.9 : 1.2;
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

function felt(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, glow: number): void {
  const r = Math.min(h / 2, 3);
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
  ctx.fillStyle = glow > 0.02 ? `rgba(${Math.round(205 + 50 * glow)},${Math.round(181 - 87 * glow)},${Math.round(146 - 90 * glow)},${(0.55 + 0.45 * glow).toFixed(3)})` : rgba(INK.felt, 0.5);
  ctx.fill();
}

// ================================================================ grand (from above)
export function drawPiano(ctx: CanvasRenderingContext2D, W: number, H: number, g: PianoGeom, fr: VisualFrame | null, st: PianoState, field: ModeField, now: number): void {
  if (g.kind === 'upright') return drawUpright(ctx, W, H, g, fr, st, field, now);
  const keys = g.keys;
  if (!keys.length) return;
  const yKey = H - 2; // front edge (towards the keys)
  const yPin = yKey - 7; // tuning pins in the pin block
  const yCap = yKey - 16; // agraffes / capo bar: the strings' front end
  let visL = 0;
  for (const k of keys) {
    const kx = g.keyX(k.midi);
    if (kx.x > -kx.w && kx.x < W + kx.w) visL = Math.max(visL, k.lengthM);
  }
  if (!visL) visL = keys.reduce((a, k) => Math.max(a, k.lengthM), 0);
  st.maxL = st.maxL > 0 ? st.maxL + (visL - st.maxL) * 0.15 : visL;
  const sc = (yCap - 30) / st.maxL;
  const pts: Pt[] = keys.map((k) => {
    const kx = g.keyX(k.midi);
    return { midi: k.midi, i: k.midi - 21, x: kx.x, w: kx.w, L: k.lengthM, k, wound: k.midi < 48 && k.nStrings <= 2 };
  });
  stepAction(pts, st);
  const whiteW = Math.max(...pts.map((p) => p.w));
  const yEnd = (p: Pt) => yCap - p.L * sc;
  const xL = pts[0].x - whiteW * 0.9;
  const xR = pts[pts.length - 1].x + whiteW * 0.9;
  // ---- case (rim follows the bridge ends: the bentside comes out of the string lengths)
  const outline = new Path2D();
  outline.moveTo(xL, yKey);
  outline.lineTo(xL, yEnd(pts[0]) - 16);
  for (let i = 0; i < pts.length; i += 3) outline.lineTo(pts[i].x, yEnd(pts[i]) - 16);
  outline.lineTo(xR, yEnd(pts[pts.length - 1]) - 16);
  outline.lineTo(xR, yKey);
  outline.closePath();
  ctx.fillStyle = rgba(INK.wood, 0.28);
  ctx.fill(outline);
  ctx.save();
  ctx.clip(outline);
  // soundboard ribs (under the board, seen through it): parallel, across the grain
  ctx.strokeStyle = rgba(INK.felt, 0.06);
  ctx.lineWidth = 3;
  for (let x = xL - H; x < xR; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, yKey);
    ctx.lineTo(x + H * 0.7, yKey - H);
    ctx.stroke();
  }
  // the board's live mode field
  const lv = field.update(fr?.modes ?? null, now / 1000);
  if (lv > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    const top = yCap - st.maxL * sc - 20;
    ctx.drawImage(field.canvas, xL, top, xR - xL, yKey - top);
    ctx.globalCompositeOperation = 'source-over';
  }
  // plate struts, from the front towards the tail and bentside
  ctx.strokeStyle = rgba(INK.felt, 0.1);
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  for (const f of [0.18, 0.36, 0.55, 0.74]) {
    const a = pts[Math.floor(f * (pts.length - 1))];
    const b = pts[Math.floor(Math.min(1, f * 0.55) * (pts.length - 1))];
    ctx.beginPath();
    ctx.moveTo(a.x, yCap - 4);
    ctx.lineTo(b.x, yEnd(b) * 0.9 + yCap * 0.1);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.restore();
  ctx.strokeStyle = rgba(INK.ivory, 0.32);
  ctx.lineWidth = 1.5;
  ctx.stroke(outline);
  // ---- bridges: the long treble bridge and the separate bass bridge
  for (const part of [pts.filter((p) => p.wound), pts.filter((p) => !p.wound)]) {
    if (part.length < 2) continue;
    ctx.strokeStyle = rgba(INK.felt, 0.45);
    ctx.lineWidth = 3;
    ctx.beginPath();
    part.forEach((p, i) => (i ? ctx.lineTo(p.x, yEnd(p)) : ctx.moveTo(p.x, yEnd(p))));
    ctx.stroke();
  }
  // ---- strings, tuning pins, agraffes / capo bar
  const lv2 = levelsOf(fr, st);
  const shift = st.shift;
  for (const p of pts) {
    if (p.x < -p.w || p.x > W + p.w) continue;
    const n = p.k.nStrings;
    const sp = Math.min(2.4, p.w * 0.13);
    for (let j = 0; j < n; j++) {
      const x = p.x + (j - (n - 1) / 2) * sp;
      strokeString(ctx, x, yCap, x, yEnd(p), p.wound, lv2.l(p.i), lv2.s(p.i));
      ctx.fillStyle = rgba(INK.steel, 0.4);
      ctx.fillRect(x - 0.6, yPin - 0.6, 1.2, 1.2);
    }
    if (p.midi < 76) {
      ctx.fillStyle = rgba(INK.ivory, 0.3);
      ctx.fillRect(p.x - p.w * 0.25, yCap - 1, p.w * 0.5, 2);
    }
  }
  const capoFrom = pts.find((p) => p.midi >= 76);
  if (capoFrom) {
    ctx.strokeStyle = rgba(INK.ivory, 0.35);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(capoFrom.x - capoFrom.w / 2, yCap);
    ctx.lineTo(xR - 2, yCap);
    ctx.stroke();
  }
  // ---- dampers (on the strings, just past the strike point) and hammers (under them)
  for (const p of pts) {
    if (p.x < -p.w || p.x > W + p.w) continue;
    const ys = yCap - p.L * sc * 0.12;
    if (p.k.hasDamper) {
      const d = st.damper[p.i];
      const yd = ys - Math.min(16, p.L * sc * 0.06) - 4;
      // lifted dampers rise towards the viewer: offset, lighter, their shadow left behind
      ctx.fillStyle = rgba(INK.ebony, 0.85 - 0.45 * d);
      ctx.strokeStyle = rgba(INK.felt, 0.16 + 0.24 * d);
      ctx.lineWidth = 0.7;
      const dx = 2.5 * d;
      ctx.beginPath();
      ctx.roundRect(p.x - p.w * 0.32 + dx, yd - 3 - 2.5 * d, p.w * 0.64, 6, 1.5);
      ctx.fill();
      ctx.stroke();
    }
    const h = st.hammer[p.i];
    const flash = h > 0.6 ? (h - 0.6) / 0.4 : 0;
    // una corda: the whole action slides towards the treble, off one string of three
    const sx = shift * Math.min(2.4, p.w * 0.13);
    felt(ctx, p.x + sx, ys, p.w * (0.55 + 0.2 * h), 4 + 3 * h, flash);
  }
  // ---- every sounding string, then the last struck note's unisons in detail
  const focus = fr?.focus ?? null;
  drawAllShapes(ctx, fr, new Map(pts.map((p) => [p.midi, p])), (p) => [p.x, yCap, p.x, yEnd(p)], st, W, focus?.midi ?? -1);
  if (focus) {
    const p = pts.find((q) => q.midi === focus.midi);
    if (p) {
      const n = focus.shapes.length;
      const sp = Math.min(2.4, p.w * 0.13);
      drawFocus(ctx, focus, (j) => [p.x + (j - (n - 1) / 2) * sp, yCap, p.x + (j - (n - 1) / 2) * sp, yEnd(p)], p.w, st);
      if (focus.prepAt >= 0) {
        ctx.fillStyle = rgba(INK.steel, 0.95);
        ctx.beginPath();
        ctx.arc(p.x, yCap - focus.prepAt * p.L * sc, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ================================================================ upright (front view)
function drawUpright(ctx: CanvasRenderingContext2D, W: number, H: number, g: PianoGeom, fr: VisualFrame | null, st: PianoState, field: ModeField, now: number): void {
  const keys = g.keys;
  if (!keys.length) return;
  const yBot = H - 4;
  const yTop = 8;
  const yPin = yTop + 12; // pin block: tuning pins
  const yCap = yTop + 26; // pressure bar / agraffes: the strings' upper end
  const maxL = keys.reduce((a, k) => Math.max(a, k.lengthM), 0);
  st.maxL = maxL;
  const sc = (yBot - 18 - yCap) / maxL;
  const pts: Pt[] = keys.map((k) => {
    const kx = g.keyX(k.midi);
    return { midi: k.midi, i: k.midi - 21, x: kx.x, w: kx.w, L: k.lengthM, k, wound: k.midi < 48 && k.nStrings <= 2 };
  });
  stepAction(pts, st);
  const whiteW = Math.max(...pts.map((p) => p.w));
  const xL = pts[0].x - whiteW * 0.9;
  const xR = pts[pts.length - 1].x + whiteW * 0.9;
  // cross-stringing: the bass strings run diagonally over the tenor, on their own bridge
  const bass = pts.filter((p) => p.wound);
  const nb = bass.length;
  const slant = (p: Pt) => (p.wound ? (0.18 + 0.22 * (1 - p.i / Math.max(1, nb))) * p.L * sc * 0.5 : 0);
  const ends = (p: Pt): [number, number, number, number] => {
    const s = slant(p);
    const ydown = Math.sqrt(Math.max(0, (p.L * sc) ** 2 - (2 * s) ** 2));
    // tops at their keys; the bass runs down and across the tenor
    return [p.x, yCap, p.x + 2 * s, yCap + ydown];
  };
  // ---- the case: tall and rectangular
  const box = new Path2D();
  box.roundRect(xL, yTop, xR - xL, yBot - yTop, 6);
  ctx.fillStyle = rgba(INK.wood, 0.3);
  ctx.fill(box);
  ctx.save();
  ctx.clip(box);
  // soundboard ribs, diagonal behind the strings
  ctx.strokeStyle = rgba(INK.felt, 0.06);
  ctx.lineWidth = 3;
  for (let x = xL - H; x < xR + H; x += 44) {
    ctx.beginPath();
    ctx.moveTo(x, yBot);
    ctx.lineTo(x + H * 0.45, yTop);
    ctx.stroke();
  }
  const lv = field.update(fr?.modes ?? null, now / 1000);
  if (lv > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6;
    ctx.drawImage(field.canvas, xL, yCap, xR - xL, yBot - yCap);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  // the plate: pin block band, struts at the section breaks
  ctx.fillStyle = rgba(INK.felt, 0.07);
  ctx.fillRect(xL, yTop, xR - xL, yCap - yTop + 4);
  ctx.strokeStyle = rgba(INK.felt, 0.12);
  ctx.lineWidth = 7;
  const tenor = pts.find((p) => !p.wound);
  for (const p of [tenor, pts[Math.floor(pts.length * 0.62)], pts[Math.floor(pts.length * 0.82)]]) {
    if (!p) continue;
    ctx.beginPath();
    ctx.moveTo(p.x - p.w * 0.7, yCap);
    ctx.lineTo(p.x - p.w * 0.7, yBot - 8);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = rgba(INK.ivory, 0.32);
  ctx.lineWidth = 1.5;
  ctx.stroke(box);
  // ---- bridges: treble/tenor along the lower string ends, the bass bridge on its own
  for (const part of [pts.filter((p) => !p.wound), bass]) {
    if (part.length < 2) continue;
    ctx.strokeStyle = rgba(INK.felt, 0.45);
    ctx.lineWidth = 3;
    ctx.beginPath();
    part.forEach((p, i) => {
      const e = ends(p);
      if (i) ctx.lineTo(e[2], e[3]);
      else ctx.moveTo(e[2], e[3]);
    });
    ctx.stroke();
  }
  // ---- strings (tenor/treble first, the crossing bass over them), pins, pressure bar
  const lv2 = levelsOf(fr, st);
  const order = [...pts.filter((p) => !p.wound), ...bass];
  for (const p of order) {
    if (p.x < -p.w * 4 || p.x > W + p.w * 4) continue;
    const n = p.k.nStrings;
    const sp = Math.min(2.4, p.w * 0.13);
    const [x0, y0, x1, y1] = ends(p);
    for (let j = 0; j < n; j++) {
      const o = (j - (n - 1) / 2) * sp;
      strokeString(ctx, x0 + o, y0, x1 + o, y1, p.wound, lv2.l(p.i), lv2.s(p.i));
      ctx.fillStyle = rgba(INK.steel, 0.45);
      ctx.fillRect(x0 + o - 0.7, yPin - 0.7, 1.4, 1.4);
    }
  }
  ctx.strokeStyle = rgba(INK.ivory, 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xL + 4, yCap);
  ctx.lineTo(xR - 4, yCap);
  ctx.stroke();
  // ---- the action in front of the strings: hammers swing back to strike them at about
  // an eighth of their length; the dampers below press on the strings until lifted
  for (const p of pts) {
    if (p.x < -p.w || p.x > W + p.w) continue;
    const [x0, y0, x1, y1] = ends(p);
    const f = 0.12;
    const xs = x0 + (x1 - x0) * f;
    const ys = y0 + (y1 - y0) * f;
    const h = st.hammer[p.i];
    const flash = h > 0.6 ? (h - 0.6) / 0.4 : 0;
    const sx = st.shift * Math.min(2.4, p.w * 0.13);
    // at rest the head sits nearer the viewer (lower, bigger); striking, it meets the strings
    felt(ctx, xs + sx, ys + 7 * (1 - h), p.w * (0.72 - 0.15 * h), 7 - 2 * h, flash);
    if (p.k.hasDamper) {
      const d = st.damper[p.i];
      const xd = x0 + (x1 - x0) * (f + 0.05);
      const yd = y0 + (y1 - y0) * (f + 0.05) + 10;
      ctx.fillStyle = rgba(INK.ebony, 0.9 - 0.45 * d);
      ctx.strokeStyle = rgba(INK.felt, 0.35 + 0.3 * d);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(xd - p.w * 0.3, yd + 4 * d, p.w * 0.6, 5, 1.5);
      ctx.fill();
      ctx.stroke();
    }
  }
  // ---- every sounding string, then the last struck note's unisons in detail
  const focus = fr?.focus ?? null;
  drawAllShapes(ctx, fr, new Map(pts.map((p) => [p.midi, p])), ends, st, W, focus?.midi ?? -1);
  if (focus) {
    const p = pts.find((q) => q.midi === focus.midi);
    if (p) {
      const n = focus.shapes.length;
      const sp = Math.min(2.4, p.w * 0.13);
      const [x0, y0, x1, y1] = ends(p);
      drawFocus(ctx, focus, (j) => {
        const o = (j - (n - 1) / 2) * sp;
        return [x0 + o, y0, x1 + o, y1];
      }, p.w, st);
    }
  }
}
