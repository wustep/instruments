// The grand on the stage, as a diagram seen from above: the rim's silhouette (the 3D grand's own
// plan, gl/piano3d.ts `grandOutline`), the strings at their real lengths with the overstrung bass
// crossing the tenor, and the two bridges. The sound is the
// picture: the board's modes glow across the whole case, sounding strings light up, and their
// live shapes are drawn over everything (piano-draw.ts). The action is two quiet rows of marks:
// hammers on the strike line (they flash at a strike and slide with the una corda) and the dampers
// just behind (they lift with their key, the sustain pedal or the sostenuto).
//
// x follows the on-screen keyboard: each key's strings sit on the action's even pitch (88 steps
// across the 52 white keys), so a key's strings are above it. z (depth, from the key fronts) runs
// up the stage at its own scale, fitted to the longest visible strings; directions lean twice as
// much as the true plan would show at that scale (`DIR`), so the overstrung bass reads as it does
// from above.
import type { VisualFrame } from '@piano-model/engine';
import type { PianoState, Pt } from './piano-draw.ts';
import { INK, type ModeField, rgba } from './stage-draw.ts';

type P = [number, number];

/** the 3D grand's plan (metres; z from the key fronts towards the tail) */
const GZ = {
  /** the stage's bottom edge: the rim's front face */
  front: 0.17,
  strike: 0.47,
  /** the dampers, 37 mm behind the strike line */
  damper: 0.507,
  /** the una corda: the action moves 2.5 mm towards the treble */
  shift: 0.0025,
};
/** the overstrung bass fans towards the treble at the tail (rad, in plan) */
const BASS_ANGLE = 0.18;
/** directions lean this much more than the plan at the stage's scale would show (see the header) */
const DIR = 2;
const lean = (a: number) => Math.atan(Math.tan(a) * DIR);
/** strike point as a fraction of the speaking length (the engine's scale, as the 3D model) */
const strikeBeta = (m: number) => (m <= 60 ? 0.12 : 0.12 - ((m - 60) / 48) * 0.055);
/** the rim's outer face (gl/piano3d.ts `grandOutline`): treble front → bentside → tail → spine → bass front */
const OUTLINE: P[] = [
  [0.74, 0.17], [0.74, 0.6], [0.735, 0.72], [0.7, 0.82], [0.63, 0.93], [0.535, 1.07], [0.43, 1.24], [0.33, 1.43], [0.24, 1.62], [0.165, 1.79], [0.09, 1.93], [-0.02, 2.04], [-0.17, 2.11], [-0.36, 2.135], [-0.53, 2.1], [-0.65, 2.0], [-0.715, 1.87], [-0.74, 1.72], [-0.74, 1.0], [-0.74, 0.17],
];
const KB = 0.611; // half the keyboard (52 × 23.5 mm)
/** below this relative displacement (−30 dB) a sympathetic string is not drawn as moving */
export const SYM_VISIBLE = 0.03;

/** a layer the size of the stage, repainted only when its key changes (one canvas, reused) */
export class Layer {
  readonly canvas = document.createElement('canvas');
  private key = '';
  paint(W: number, H: number, dpr: number, key: string, draw: (ctx: CanvasRenderingContext2D) => void): void {
    if (key === this.key) return;
    this.key = key;
    const w = Math.max(1, Math.round(W * dpr));
    const h = Math.max(1, Math.round(H * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const x = this.canvas.getContext('2d')!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, w, h);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(x);
  }
}

/** a sounding unison lit over its resting lines: struck strings vermilion with a soft bloom,
 *  sympathetic ones amber and faint (at most 0.55 alpha even when they move like a struck string) */
export function lightString(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, off: number[], l: number, sym: number): void {
  if (l <= 0.02 && sym <= SYM_VISIBLE) return;
  const struck = l >= sym;
  if (struck) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(INK.vermilion, 0.16 * l);
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.strokeStyle = struck ? rgba(INK.vermilion, 0.15 + 0.85 * l) : rgba(INK.amber, 0.08 + 0.47 * sym);
  ctx.lineWidth = struck ? 1 + 1.6 * l : 0.9 + 0.9 * sym;
  ctx.beginPath();
  for (const o of off) {
    ctx.moveTo(x0 + o, y0);
    ctx.lineTo(x1 + o, y1);
  }
  ctx.stroke();
}

/** a hammer's mark: a short felt dash that swells and lights at the strike; amber under the soft pedal */
export function hammerMark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, soft: number): void {
  const flash = h > 0.6 ? (h - 0.6) / 0.4 : 0;
  const hh = 3 + 3 * h;
  ctx.beginPath();
  ctx.roundRect(x - (w * (1 + 0.3 * h)) / 2, y - hh / 2, w * (1 + 0.3 * h), hh, 1.5);
  ctx.fillStyle = flash > 0.02 ? `rgba(${Math.round(205 + 50 * flash)},${Math.round(181 - 87 * flash)},${Math.round(146 - 90 * flash)},${(0.55 + 0.45 * flash).toFixed(3)})` : soft > 0.05 ? rgba(INK.amber, 0.34 + 0.3 * soft) : rgba(INK.felt, 0.34 + 0.3 * h);
  ctx.fill();
}

/** a damper's mark: a dark dash on the strings; lifted, it moves off them and its edge turns amber */
export function damperMark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, d: number): void {
  ctx.beginPath();
  ctx.roundRect(x - w / 2 + 2 * d, y - 2 - 3 * d, w, 4, 1.5);
  ctx.fillStyle = rgba(INK.ebony, 0.9 - 0.5 * d);
  ctx.fill();
  ctx.strokeStyle = d > 0.05 ? rgba(INK.amber, 0.2 + 0.45 * d) : rgba(INK.felt, 0.2);
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function catmull(pts: P[], per: number): P[] {
  const n = pts.length;
  const out: P[] = [];
  const at = (i: number) => pts[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}
const path = (ps: P[], close = true) => {
  const into = new Path2D();
  ps.forEach(([x, y], k) => (k ? into.lineTo(x, y) : into.moveTo(x, y)));
  if (close) into.closePath();
  return into;
};

interface GStr {
  p: Pt;
  /** the action's x (the strike point, at rest) */
  x: number;
  /** x offset per metre of depth (the bass leans towards the treble) */
  lean: number;
  /** the speaking length: agraffe (a) to bridge (b), stage px */
  a: P;
  b: P;
  off: number[];
}
interface Layout {
  key: string;
  Y: (z: number) => number;
  pxm: number;
  pitch: number;
  strs: GStr[];
  inner: Path2D;
  outline: Path2D;
  outer: P[];
  box: { x0: number; x1: number; y0: number; y1: number };
}
let cache: Layout | null = null;
const base = new Layer();

/** where the stage's top edge sits in depth: the rim's tail when the whole keyboard shows; on a
 *  narrow screen, a little past the longest visible strings */
function grandDepth(W: number, pts: Pt[]): number {
  const kx0 = pts[0].x - pts[0].w / 2;
  const kx1 = pts[pts.length - 1].x + pts[pts.length - 1].w / 2;
  const pitch = (kx1 - kx0) / 88;
  let zs = 0;
  for (const p of pts) {
    const x = kx0 + (p.i + 0.5) * pitch;
    if (x < -pitch * 3 || x > W + pitch * 3) continue;
    const beta = strikeBeta(p.midi);
    const c = p.wound ? Math.cos(BASS_ANGLE) : 1;
    zs = Math.max(zs, GZ.strike + c * (1 - beta) * Math.max(0.04, p.L));
  }
  const pxm = (kx1 - kx0) / (2 * KB);
  let zo = 0;
  for (const [x, z] of OUTLINE) {
    const sx = kx0 + (x + KB) * pxm;
    if (sx > -40 && sx < W + 40) zo = Math.max(zo, z);
  }
  // the whole keyboard on screen: the whole rim, its tail at the top
  if (kx0 > -pitch && kx1 < W + pitch) return Math.max(zo, 0.6) + 0.004;
  return Math.max(0.6, Math.min(Math.max(zo, 0.6), zs + 0.2));
}

function layout(W: number, H: number, pts: Pt[], dpr: number, zTop: number): Layout {
  const key = `${W}|${H}|${dpr}|${pts[0].x.toFixed(1)}|${pts[pts.length - 1].x.toFixed(1)}|${zTop.toFixed(4)}|${pts.map((p) => p.L.toFixed(3)).join('')}`;
  if (cache && cache.key === key) return cache;
  const kx0 = pts[0].x - pts[0].w / 2;
  const kx1 = pts[pts.length - 1].x + pts[pts.length - 1].w / 2;
  const pitch = (kx1 - kx0) / 88;
  const pxm = (kx1 - kx0) / (2 * KB);
  const yF = H + 1;
  const sv = (yF - 7) / (zTop - GZ.front);
  const Y = (z: number) => yF - (z - GZ.front) * sv;
  // x of a plan point: the keyboard's own scale across the keys; past its ends the case's cheeks and
  // rim are pressed into what margin the stage has
  const room = Math.max(10, Math.min(kx0, W - kx1, 0.129 * pxm));
  const X = (xm: number) => (xm < -KB ? kx0 - ((-KB - xm) / 0.129) * room : xm > KB ? kx1 + ((xm - KB) / 0.129) * room : kx0 + (xm + KB) * pxm);
  const tanB = Math.tan(lean(BASS_ANGLE));
  // ---- each key's strings: the strike point over its key; the bass leaning towards the treble
  const sp = Math.min(2.4, pitch * 0.2);
  const strs: GStr[] = pts.map((p) => {
    const beta = strikeBeta(p.midi);
    const L = Math.max(0.04, p.L);
    const c = p.wound ? Math.cos(BASS_ANGLE) : 1;
    const x = kx0 + (p.i + 0.5) * pitch;
    const ln = p.wound ? tanB * sv : 0;
    const aZ = GZ.strike - c * beta * L;
    const bZ = aZ + c * L;
    const n = Math.max(1, p.k.nStrings);
    const off = Array.from({ length: n }, (_, j) => (j - (n - 1) / 2) * sp);
    return { p, x, lean: ln, a: [x + (aZ - GZ.strike) * ln, Y(aZ)], b: [x + (bZ - GZ.strike) * ln, Y(bZ)], off };
  });
  const bass = strs.filter((s) => s.p.wound);
  const treb = strs.filter((s) => !s.p.wound);
  // ---- the case: the rim's outer face, and its inner face a rim's thickness in (on screen)
  const outer: P[] = catmull(OUTLINE, 8).map(([x, z]): P => [X(x), Y(z)]);
  outer[0][1] = yF + 2;
  outer[outer.length - 1][1] = yF + 2;
  const rimPx = Math.max(5, Math.min(11, 0.068 * sv * 0.6));
  const innerPts: P[] = outer.map((q, i) => {
    const a = outer[Math.max(0, i - 1)];
    const b = outer[Math.min(outer.length - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    // (on screen the outline runs up the treble side, over the tail, down the spine: inward is to
    // the left of travel, y pointing down)
    return [q[0] + (ty / l) * rimPx, q[1] - (tx / l) * rimPx];
  });
  let xMin = Infinity;
  let xMax = -Infinity;
  let yTail = Infinity;
  for (const q of outer) {
    xMin = Math.min(xMin, q[0]);
    xMax = Math.max(xMax, q[0]);
    yTail = Math.min(yTail, q[1]);
  }
  const outline = path(outer);
  const inner = path(innerPts);
  // ---- the still picture: rim, board, struts, bridges, the strings at rest
  base.paint(W, H, dpr, key, (c) => {
    c.fillStyle = rgba(INK.ebony, 1);
    c.fill(outline);
    c.fillStyle = rgba(INK.wood, 0.42);
    c.fill(inner);
    c.save();
    c.clip(inner);
    // the bridges: the long treble bridge and the bass bridge, each one line under the string ends
    c.lineJoin = 'round';
    c.strokeStyle = rgba(INK.felt, 0.5);
    c.lineWidth = 3;
    for (const part of [treb, bass]) {
      if (part.length < 2) continue;
      c.stroke(path(catmull(part.filter((_, k) => k % 3 === 0 || k === part.length - 1).map((s) => s.b), 4), false));
    }
    // where the speaking lengths begin (agraffes, the capo bar): a hairline along the string fronts
    c.strokeStyle = rgba(INK.ivory, 0.22);
    c.lineWidth = 1.2;
    for (const part of [treb, bass]) if (part.length > 1) c.stroke(path(part.map((s) => s.a), false));
    // the strings at rest: steel trebles, then the copper-wound bass crossing over the tenor
    c.lineCap = 'butt';
    for (const part of [treb, bass]) {
      const wound = part === bass;
      c.strokeStyle = rgba(wound ? INK.copper : INK.ivory, wound ? 0.5 : 0.24);
      c.lineWidth = wound ? 1.3 : 0.8;
      c.beginPath();
      for (const s of part)
        for (const o of s.off) {
          c.moveTo(s.a[0] + o, s.a[1]);
          c.lineTo(s.b[0] + o, s.b[1]);
        }
      c.stroke();
    }
    c.restore();
    c.lineJoin = 'round';
    c.strokeStyle = rgba(INK.ivory, 0.34);
    c.lineWidth = 1.4;
    c.stroke(outline);
    c.strokeStyle = rgba(INK.ivory, 0.1);
    c.lineWidth = 1;
    c.stroke(inner);
  });
  cache = { key, Y, pxm, pitch, strs, inner, outline, outer, box: { x0: xMin, x1: xMax, y0: yTail, y1: H - 2 } };
  return cache;
}

/** the grand, live. Returns each key's speaking length and its unison's offsets (for the shapes). */
export function drawGrandPlan(ctx: CanvasRenderingContext2D, W: number, H: number, pts: Pt[], lid: number, fr: VisualFrame | null, st: PianoState, field: ModeField, now: number, lv: { l: (i: number) => number; s: (i: number) => number }): { ends: (p: Pt) => [number, number, number, number]; unison: (p: Pt) => number[] } {
  // the depth shown (smoothed: a phone's keyboard scrolls), then the cached layout
  const target = grandDepth(W, pts);
  st.maxL = st.maxL > 0.5 && st.maxL < 3 ? st.maxL + (target - st.maxL) * 0.15 : target;
  if (Math.abs(st.maxL - target) < 4e-4) st.maxL = target;
  const dpr = ctx.getTransform().a || 1;
  const lay = layout(W, H, pts, dpr, st.maxL);
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
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.65;
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
  for (const s of strs) {
    if (!vis(s)) continue;
    if (s.p.k.hasDamper) damperMark(ctx, s.x + (GZ.damper - GZ.strike) * s.lean, yD, pitch * 0.6, st.damper[s.p.i]);
    hammerMark(ctx, s.x + sh, yS, pitch * 0.5, st.hammer[s.p.i], st.shift);
  }
  // ---- a strike flares where the hammer meets the strings
  ctx.globalCompositeOperation = 'lighter';
  for (const s of strs) {
    const t = st.strikes.get(s.p.midi);
    if (t === undefined || !vis(s)) continue;
    const age = (now - t) / 320;
    if (age < 0 || age > 1) continue;
    const v = (st.vels.get(s.p.midi) ?? 64) / 127;
    const r = (0.7 + 1.1 * v) * pitch * (0.8 + 0.7 * age);
    const a = (1 - age) ** 2 * (0.35 + 0.5 * v);
    const g = ctx.createRadialGradient(s.x + sh, yS, 0, s.x + sh, yS, r);
    g.addColorStop(0, rgba('255,200,160', a));
    g.addColorStop(0.35, rgba(INK.vermilion, a * 0.6));
    g.addColorStop(1, rgba(INK.vermilion, 0));
    ctx.fillStyle = g;
    ctx.fillRect(s.x + sh - r, yS - r, 2 * r, 2 * r);
  }
  ctx.globalCompositeOperation = 'source-over';
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
  ctx.fillStyle = rgba(INK.ebony, 0.22 + 0.6 * (1 - lidOpen));
  ctx.fill(lay.outline);
  ctx.restore();
  // its outline, foreshortened, and its free edge catching the light
  ctx.strokeStyle = rgba(INK.ivory, 0.12 + 0.2 * (1 - lidOpen));
  ctx.lineWidth = 1;
  ctx.beginPath();
  lay.outer.forEach(([x, y], k) => (k ? ctx.lineTo(xL + (x - xL) * cphi, y) : ctx.moveTo(xL + (x - xL) * cphi, y)));
  ctx.stroke();
  const edgeX = xL + (xR - xL) * cphi;
  ctx.strokeStyle = rgba(INK.ivory, 0.25 + 0.3 * lidOpen);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(edgeX, yTop + (yKey - yTop) * 0.25);
  ctx.lineTo(edgeX, yKey - 6);
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
