// The stage: each instrument drawn in plan view and animated from the simulation's own
// state (string shapes, string levels, bow, bore pressure, board/body modes). Nothing
// here is decorative motion: every moving line is read from the audio thread.

import type { KeySummary, VisualFrame } from '@piano-model/engine';
import { CC, CS, EB, GS, L1, L2, L3, R1, R2, R3, RH, TB, TBB, fingersFor } from './flute-fingering.ts';
import { CELLO, VIOLIN, type Outline } from './gl/outlines.ts';

export const INK = {
  ground: '#0e0d0b',
  ivory: '236,226,206',
  vermilion: '255,94,56',
  amber: '242,166,70',
  copper: '196,128,82',
  steel: '150,182,210',
  felt: '205,181,146',
  wood: '58,42,28',
  ebony: '22,19,16',
};
export const rgba = (c: string, a: number) => `rgba(${c},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

// ---------------------------------------------------------------- mode field
/**
 * A Chladni-style picture of a vibrating plate: the instrument's own modes (board or
 * body), each given a plausible plate shape sin(mπu)·sin(nπv) in order of frequency,
 * weighted by its live amplitude. Bright "sand" collects where the plate is still
 * (nodal lines), a warm glow where it moves most. Phases drift slowly because the true
 * oscillation (tens to thousands of Hz) cannot be shown at 60 frames per second.
 */
export class ModeField {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private field: Float32Array;
  private SU: Float32Array[] = [];
  private SV: Float32Array[] = [];
  private pairs: [number, number][] = [];
  private level = 0;
  private peak = 1e-30;
  constructor(
    readonly gw: number,
    readonly gh: number,
    aspect: number,
    stiffRatio = 1,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = gw;
    this.canvas.height = gh;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(gw, gh);
    this.field = new Float32Array(gw * gh);
    // plate modes in order of frequency (orthotropic plate, along-grain stiffer)
    const cand: { m: number; n: number; f: number }[] = [];
    for (let m = 1; m <= 14; m++)
      for (let n = 1; n <= 10; n++) {
        const a = m / aspect;
        cand.push({ m, n, f: Math.sqrt(stiffRatio * a ** 4 + n ** 4 + 2 * Math.sqrt(stiffRatio) * 0.6 * a * a * n * n) });
      }
    cand.sort((x, y) => x.f - y.f);
    this.pairs = cand.map((c) => [c.m, c.n]);
    for (let m = 0; m <= 14; m++) {
      const su = new Float32Array(gw);
      for (let i = 0; i < gw; i++) su[i] = Math.sin((m * Math.PI * (i + 0.5)) / gw);
      this.SU.push(su);
    }
    for (let n = 0; n <= 10; n++) {
      const sv = new Float32Array(gh);
      for (let j = 0; j < gh; j++) sv[j] = Math.sin((n * Math.PI * (j + 0.5)) / gh);
      this.SV.push(sv);
    }
  }
  /** returns 0..1, how strongly the plate is moving overall */
  update(amps: Float32Array | null, t: number): number {
    const f = this.field;
    f.fill(0);
    let total = 0;
    if (amps) for (let k = 0; k < amps.length; k++) total += amps[k];
    this.peak = Math.max(total, this.peak * 0.995);
    const target = total > 0 ? Math.min(1, Math.pow(total / this.peak, 0.6)) : 0;
    this.level += (target - this.level) * 0.25;
    if (!amps || this.level < 0.01) {
      this.ctx.clearRect(0, 0, this.gw, this.gh);
      return this.level;
    }
    // strongest modes only
    const idx: number[] = [];
    for (let k = 0; k < Math.min(amps.length, this.pairs.length); k++) if (amps[k] > 0) idx.push(k);
    idx.sort((a, b) => amps[b] - amps[a]);
    const use = idx.slice(0, 36);
    const top = use.length ? amps[use[0]] : 1;
    const { gw, gh } = this;
    for (const k of use) {
      const [m, n] = this.pairs[k];
      const w = (amps[k] / top) * Math.cos(t * (0.7 + (k % 7) * 0.23) + k * 1.7);
      const su = this.SU[m];
      const sv = this.SV[n];
      for (let j = 0; j < gh; j++) {
        const a = w * sv[j];
        const row = j * gw;
        for (let i = 0; i < gw; i++) f[row + i] += a * su[i];
      }
    }
    let mx = 1e-9;
    for (let i = 0; i < f.length; i++) mx = Math.max(mx, Math.abs(f[i]));
    const d = this.img.data;
    const lv = this.level;
    for (let i = 0; i < f.length; i++) {
      const x = Math.abs(f[i]) / mx;
      const sand = Math.exp(-(x * x) / 0.0018); // nodal lines
      const glow = Math.pow(x, 1.6);
      const o = i * 4;
      d[o] = 242 * glow + 236 * sand;
      d[o + 1] = 150 * glow + 226 * sand;
      d[o + 2] = 60 * glow + 206 * sand;
      d[o + 3] = 255 * lv * Math.min(1, 0.32 * glow + 0.55 * sand);
    }
    this.ctx.putImageData(this.img, 0, 0);
    return lv;
  }
}

/** Running maximum with slow release, for auto-scaling live traces. */
export class AutoScale {
  v: number;
  constructor(
    private floor: number,
    private release = 0.97,
  ) {
    this.v = floor;
  }
  of(x: number): number {
    this.v = Math.max(x, this.v * this.release, this.floor);
    return this.v;
  }
}

// ---------------------------------------------------------------- violin family
export interface BowedGeom {
  id: 'violin' | 'viola' | 'cello';
  L: number;
  bowLength: number;
  strings: { name: string; open: number }[];
}
export interface BowedState {
  strScale: AutoScale;
  lvlScale: AutoScale;
  /** what the drawing keeps between frames (made on first use) */
  live?: BowedLive;
  /** where the hair was drawn last (stage px: frog end, tip end) and the contact point along it,
   *  for taking the bow in the hand (ui/hand-bow.ts) */
  bowLine?: { fx: number; fy: number; tx: number; ty: number; pos: number };
}

// The plan view of a violin, viola or cello, as in the Met's front photographs (.cache/refs-3d/
// violin-front.jpg, viola-front.jpg, cello-front.jpg): scroll to the left (up on a phone), the bass
// side towards the player (down; left on a phone). Everything is drawn to scale in metres from the
// same figures as the 3D model (strings3d.ts: Strobel's "Messiah" violin table, a 16" viola, the
// "Davidov" cello, Jóhannsson's head lengths); the plate outline and f-holes are the ones traced from
// those photographs (gl/outlines.ts). The still parts are painted once per size into two layers (the
// plate; the fittings over it) and blitted each frame; only the strings, fingers and bow are drawn live.

interface BowedPlan {
  body: number;
  ol: Outline;
  /** nut to the body's edge; fingerboard length; its width at the nut and at its end */
  neck: number;
  fbLen: number;
  fbW: [number, number];
  /** the head: nut to the back of the scroll, pegbox width at the nut, width across the scroll's eyes */
  head: number;
  pbW: number;
  eyeW: number;
  /** string spacing at the bridge and at the nut; the bridge's width and the radius of its top */
  spreadB: number;
  spreadN: number;
  bridgeW: number;
  bridgeR: number;
  /** string diameters, lowest first; wound or plain */
  dia: [number, number, number, number];
  wound: [boolean, boolean, boolean, boolean];
  /** purfling: in from the edge, width */
  purf: [number, number];
  /** the bow: hair ribbon width; stick diameter at the frog end and at the head */
  hairW: number;
  stick: [number, number];
  /** soundpost diameter; bass bar width and length */
  post: number;
  bar: [number, number];
  /** the top's varnish (sRGB, as the 3D model's: the Francesca's gold-brown, Stainer's and Vuillaume's
   *  deeper red-browns) */
  varnish: [number, number, number];
}
const MM = 0.001;
// Stick diameters: Tourte's taper as Vuillaume measured it, 8.6 mm for the first 110 mm, falling to
// 5.3 mm at the head (violin); viola and cello sticks are proportionally heavier. Soundpost and bass bar
// after Strobel (violin post 6.2 mm, bar 5.5 × 270 mm), scaled for the viola and cello.
const BOWED_PLAN: Record<BowedGeom['id'], BowedPlan> = {
  violin: {
    body: 0.356, ol: VIOLIN, neck: 0.13, fbLen: 0.27, fbW: [0.024, 0.042], head: 0.108, pbW: 0.0255, eyeW: 0.041,
    spreadB: 0.0113, spreadN: 0.0055, bridgeW: 0.041, bridgeR: 0.042, dia: [0.8 * MM, 0.8 * MM, 0.6 * MM, 0.26 * MM], wound: [true, true, true, false],
    purf: [4 * MM, 1.2 * MM], hairW: 0.0105, stick: [8.6 * MM, 5.3 * MM], post: 6.2 * MM, bar: [5.5 * MM, 0.27], varnish: [150, 78, 30],
  },
  viola: {
    body: 0.406, ol: VIOLIN, neck: 0.148, fbLen: 0.295, fbW: [0.025, 0.045], head: 0.125, pbW: 0.0275, eyeW: 0.046,
    spreadB: 0.0122, spreadN: 0.0058, bridgeW: 0.045, bridgeR: 0.046, dia: [1.0 * MM, 0.9 * MM, 0.75 * MM, 0.6 * MM], wound: [true, true, true, true],
    purf: [4.3 * MM, 1.3 * MM], hairW: 0.011, stick: [9 * MM, 5.6 * MM], post: 6.6 * MM, bar: [6 * MM, 0.3], varnish: [124, 50, 22],
  },
  cello: {
    body: 0.755, ol: CELLO, neck: 0.28, fbLen: 0.58, fbW: [0.032, 0.075], head: 0.204, pbW: 0.045, eyeW: 0.07,
    spreadB: 0.0205, spreadN: 0.0078, bridgeW: 0.092, bridgeR: 0.066, dia: [1.6 * MM, 1.3 * MM, 1.05 * MM, 0.8 * MM], wound: [true, true, true, true],
    purf: [6.5 * MM, 1.8 * MM], hairW: 0.0145, stick: [10.2 * MM, 6.4 * MM], post: 11 * MM, bar: [10 * MM, 0.59], varnish: [138, 54, 22],
  },
};
type Pt = [number, number];
const bwClamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const bwSstep = (a: number, b: number, x: number) => {
  const t = bwClamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Gaussian smoothing round a closed polyline (σ in points), leaving sharp turns (corner tips) alone */
function bwSmoothClosed(p: Pt[], sig: number, keepTurn = Infinity): Pt[] {
  const n = p.length;
  const k = Math.max(1, Math.ceil(2.5 * sig));
  return p.map((q, i) => {
    const a = p[(i + n - 1) % n];
    const b = p[(i + 1) % n];
    let turn = Math.abs(Math.atan2(b[1] - q[1], b[0] - q[0]) - Math.atan2(q[1] - a[1], q[0] - a[0]));
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    if (turn > keepTurn) return q;
    let x = 0;
    let z = 0;
    let ws = 0;
    for (let j = -k; j <= k; j++) {
      const w = Math.exp(-0.5 * (j / sig) ** 2);
      const r = p[(i + j + n) % n];
      x += r[0] * w;
      z += r[1] * w;
      ws += w;
    }
    return [x / ws, z / ws];
  });
}

/** The traced outline sees only the outermost edge row by row, so each corner comes out as a square
 *  step; a real corner's tip overhangs the C-bout, which curves back out under it. As strings3d.ts's
 *  hookCorners (units of the body length). */
function bwHookCorners(pts: Pt[]): Pt[] {
  const h = 0.012;
  const out: Pt[] = [];
  const at = (x: number, from: number, dir: number): number => {
    for (let k = from; k > 0 && k < pts.length - 1; k += dir) {
      const a = pts[k];
      const b = pts[k + dir];
      if ((b[0] - x) * (a[0] - x) <= 0) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1e-9);
    }
    return pts[from][1];
  };
  const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, k: number): Pt[] =>
    Array.from({ length: k }, (_, i): Pt => {
      const t = (i + 1) / (k + 1);
      const u = 1 - t;
      return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
    });
  let skipUntil = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p[0] < skipUntil) continue;
    const q = pts[i + 1];
    if (q && i > 10 && i < pts.length - 10 && Math.abs(q[1] - p[1]) > 0.02) {
      const D = Math.abs(q[1] - p[1]);
      if (q[1] < p[1]) {
        out.push(p);
        const xe = p[0] + 0.7 * h;
        const ze = at(xe, i + 1, 1);
        out.push(...bez(p, [p[0] - 0.9 * h, p[1] - 0.25 * D], [p[0] - 0.8 * h, ze + 0.12 * D], [xe, ze], 10), [xe, ze]);
        skipUntil = xe + 1e-6;
      } else {
        const xs = q[0] - 0.7 * h;
        const zs = at(xs, i, -1);
        while (out.length && out[out.length - 1][0] > xs) out.pop();
        out.push([xs, zs], ...bez([xs, zs], [q[0] + 0.8 * h, zs + 0.12 * D], [q[0] + 0.9 * h, q[1] - 0.25 * D], q, 10));
      }
      continue;
    }
    out.push(p);
  }
  return out;
}

interface BowedShapes {
  /** the plate outline (metres: x from the body's neck end, z towards the bass side) */
  body: Pt[];
  /** bass and treble f-holes */
  fholes: Pt[][];
  hwMax: number;
}
const bowedShapeCache = new Map<string, BowedShapes>();
function bowedShapes(id: BowedGeom['id'], p: BowedPlan, L: number): BowedShapes {
  const key = `${id}|${L}`;
  const hit = bowedShapeCache.get(key);
  if (hit) return hit;
  const B = p.body;
  const hw = p.ol.hw;
  const N = hw.length;
  // the trace runs square across the very ends (its first and last rows already ~100 mm wide); the
  // Met's photo has both ends round, so the last 9 % at each end is an elliptical cap
  const uc = 0.09;
  const at = (u: number) => {
    const f = bwClamp(u, 0, 1) * (N - 1);
    const i = Math.min(N - 2, Math.floor(f));
    return hw[i] + (hw[i + 1] - hw[i]) * (f - i);
  };
  const h0 = at(uc);
  const h1 = at(1 - uc);
  const bass: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    let w = hw[i];
    if (u < uc) w = h0 * Math.sqrt(1 - (1 - u / uc) ** 2);
    else if (u > 1 - uc) w = h1 * Math.sqrt(1 - (1 - (1 - u) / uc) ** 2);
    bass.push([u, w]);
  }
  const hooked = bwHookCorners(bass);
  const ring: Pt[] = [...hooked, ...hooked.slice(1, hooked.length - 1).reverse().map(([u, z]): Pt => [u, -z])];
  const body = bwSmoothClosed(ring, 1.4, 0.5).map(([u, z]): Pt => [u * B, z * B]);
  // the f-hole: smoothed (σ ≈ 1.2 mm, the trace's row wobble out), its notches on the bridge line
  const fh = p.ol.fhole;
  let per = 0;
  for (let i = 0; i < fh.length; i++) per += Math.hypot(fh[(i + 1) % fh.length][0] - fh[i][0], fh[(i + 1) % fh.length][1] - fh[i][1]);
  const sig = 0.0012 / B / (per / fh.length);
  const sm = bwSmoothClosed(fh as Pt[], Math.max(1, sig));
  let u0 = Infinity;
  let u1 = -Infinity;
  for (const [u] of sm) {
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
  }
  const shift = (L - p.neck) / B - (u0 + u1) / 2;
  const fBass = sm.map(([u, z]): Pt => [(u + shift) * B, z * B]);
  const out: BowedShapes = { body, fholes: [fBass, fBass.map(([x, z]): Pt => [x, -z])], hwMax: Math.max(...hw) * B };
  bowedShapeCache.set(key, out);
  return out;
}

/** The head seen from the front (proportions read off violin-front.jpg, viola-front.jpg and
 *  cello-front.jpg, as fractions a of the head's length from the nut and of half the width across the
 *  eyes): the pegbox's cheeks taper to 0.86 of their width at the nut and end at the throat (a ≈ 0.66);
 *  above it the crown (the back of the scroll curling over towards us, fluted either side of a spine)
 *  rises to a rounded top, and either side the volute's turns stand out as ears round the eyes (a ≈ 0.79). */
const bwPegboxW = (p: BowedPlan, a: number) => (p.pbW / 2) * (1 - 0.14 * Math.min(1, a / 0.68));
const HEAD_EAR = { a: 0.8, w: 0.58, r: 0.42 };
/** the head's length as a front view shows it: the pegbox and scroll lean back from the neck, so the
 *  photographs show nut to crown as 0.85 of the head's length (violin-front.jpg: 90 of 108 mm) */
const HEAD_PROJ = 0.85;
function bwHeadParts(p: BowedPlan): { box: Pt[]; crown: Pt[]; ear: Pt[] } {
  const e = p.eyeW / 2;
  const box: Pt[] = [];
  for (let k = 0; k <= 12; k++) box.push([(0.7 * k) / 12, bwPegboxW(p, (0.7 * k) / 12)]);
  // the crown: from the throat, as broad as the pegbox over the ears, then a dome to the top
  const crown: Pt[] = [];
  for (let k = 0; k <= 10; k++) {
    const a = 0.6 + (0.26 * k) / 10;
    crown.push([a, (0.5 + 0.03 * bwSstep(0.6, 0.74, a)) * e]);
  }
  for (let k = 1; k <= 16; k++) {
    const th = (k / 16) * (Math.PI / 2);
    crown.push([0.86 + 0.14 * Math.sin(th), 0.53 * e * Math.cos(th)]);
  }
  const Lh = p.head;
  // one ear (bass side); a circle, in (a, metres)
  const ear: Pt[] = [];
  for (let k = 0; k < 36; k++) {
    const th = (k / 36) * Math.PI * 2;
    ear.push([HEAD_EAR.a + (Math.cos(th) * HEAD_EAR.r * e) / (Lh * HEAD_PROJ), HEAD_EAR.w * e + Math.sin(th) * HEAD_EAR.r * e]);
  }
  return { box, crown, ear };
}

// the pegs' places along the pegbox (fractions of the head, nearest the nut first: strings3d.ts) and,
// for each string (lowest first), its peg and side: the bass side carries the nearest peg and the third,
// the treble side the second and the fourth (all three front photographs)
const PEG_A = [0.08, 0.205, 0.38, 0.5];
const PEG_OF = [2, 0, 1, 3];
const PEG_SIDE = [1, 1, -1, -1];

interface BowedLayout {
  vertical: boolean;
  /** pixels per metre; where the body's neck end sits on the centre line */
  sc: number;
  ox: number;
  oy: number;
}
function bowedLayout(g: BowedGeom, p: BowedPlan, sh: BowedShapes, W: number, H: number): BowedLayout {
  const vertical = H > W * 1.05;
  const x0 = -p.neck - p.head * HEAD_PROJ - 0.003;
  const x1 = p.body + (g.id === 'cello' ? 0.16 : 0.012);
  const len = x1 - x0;
  const Lw = vertical ? H : W;
  const Cw = vertical ? W : H;
  const fill = vertical ? (g.id === 'violin' ? 0.86 : g.id === 'viola' ? 0.88 : 0.94) : g.id === 'violin' ? 0.72 : g.id === 'viola' ? 0.76 : 0.9;
  const sc = Math.min((fill * Lw) / len, (0.84 * Cw) / (2 * sh.hwMax));
  const along = (Lw - len * sc) / 2 - x0 * sc;
  return vertical ? { vertical, sc, ox: W / 2, oy: along } : { vertical, sc, ox: along, oy: H / 2 };
}
/** local drawing frame: x along the strings (px from the body's neck end), y towards the bass side */
function bwPlace(c: CanvasRenderingContext2D, lay: BowedLayout): void {
  c.translate(lay.ox, lay.oy);
  if (lay.vertical) c.transform(0, 1, -1, 0, 0, 0);
}
const bwPoly = (pts: Pt[], sc: number, close = true): Path2D => {
  const path = new Path2D();
  pts.forEach(([x, z], i) => (i ? path.lineTo(x * sc, z * sc) : path.moveTo(x * sc, z * sc)));
  if (close) path.closePath();
  return path;
};
const bwRng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

/** a layer: a canvas covering only its part's box on the stage (CSS px) */
interface BowedLayer {
  cv: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface BowedLayers {
  key: string;
  lay: BowedLayout;
  plate: BowedLayer;
  fit: BowedLayer;
  /** the plate (px, local frame), and the plate less its f-holes (for the modes' glow) */
  body: Path2D;
  glow: Path2D;
}
/** the painted layers by instrument and size: a few at once (an ensemble draws a violin, a viola and a
 *  cello side by side), the oldest let go */
const bowedLayers = new Map<string, BowedLayers>();
let bwScratch: HTMLCanvasElement | null = null;

/** a line at distance d inside a closed path, w wide (the path stroked wide, the inner part cut away,
 *  kept only inside the path) */
function bwInsetLine(c: CanvasRenderingContext2D, path: Path2D, d: number, w: number, style: string): void {
  const cv = c.canvas;
  if (!bwScratch) bwScratch = document.createElement('canvas');
  const s = bwScratch;
  if (s.width !== cv.width || s.height !== cv.height) {
    s.width = cv.width;
    s.height = cv.height;
  }
  const x = s.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, s.width, s.height);
  x.setTransform(c.getTransform());
  x.lineJoin = 'round';
  x.strokeStyle = style;
  x.lineWidth = 2 * (d + w / 2);
  x.stroke(path);
  x.globalCompositeOperation = 'destination-out';
  x.lineWidth = Math.max(0.01, 2 * (d - w / 2));
  x.strokeStyle = '#000';
  x.stroke(path);
  x.globalCompositeOperation = 'destination-in';
  x.fillStyle = '#000';
  x.fill(path);
  x.globalCompositeOperation = 'source-over';
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(s, 0, 0);
  c.restore();
}

function paintBowedLayers(g: BowedGeom, p: BowedPlan, sh: BowedShapes, lay: BowedLayout, W: number, H: number, dpr: number, key: string): BowedLayers {
  const sc = lay.sc;
  const B = p.body;
  const S = B / 0.356;
  const L = g.L;
  const xb = L - p.neck;
  const xn = -p.neck;
  // each layer covers only its part's box (local metres → stage px, with room for the shadows)
  const mk = (x0: number, x1: number, z0: number, z1: number) => {
    let bx0 = Infinity;
    let by0 = Infinity;
    let bx1 = -Infinity;
    let by1 = -Infinity;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      const px = lay.vertical ? lay.ox - z * sc : lay.ox + x * sc;
      const py = lay.vertical ? lay.oy + x * sc : lay.oy + z * sc;
      bx0 = Math.min(bx0, px);
      by0 = Math.min(by0, py);
      bx1 = Math.max(bx1, px);
      by1 = Math.max(by1, py);
    }
    const m = 44;
    const bx = Math.max(0, Math.floor(bx0 - m));
    const by = Math.max(0, Math.floor(by0 - m));
    const bw = Math.max(1, Math.min(W, Math.ceil(bx1 + m)) - bx);
    const bh = Math.max(1, Math.min(H, Math.ceil(by1 + m)) - by);
    const cv = document.createElement('canvas');
    cv.width = Math.round(bw * dpr);
    cv.height = Math.round(bh * dpr);
    const c = cv.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, -bx * dpr, -by * dpr);
    bwPlace(c, lay);
    return { cv, c, box: { cv, x: bx, y: by, w: bw, h: bh } };
  };
  const body = bwPoly(sh.body, sc);
  const holes = sh.fholes.map((f) => bwPoly(f, sc));
  const glow = new Path2D();
  glow.addPath(body);
  for (const h of holes) glow.addPath(h);
  const X = (x: number) => x * sc;

  // ---- the plate
  const A = mk(0, B, -sh.hwMax, sh.hwMax);
  const a = A.c;
  a.save();
  a.shadowColor = 'rgba(0,0,0,0.6)';
  a.shadowBlur = 26 * dpr;
  a.shadowOffsetY = 10 * dpr;
  const vc = (k: number, al = 1) => `rgba(${p.varnish.map((v) => Math.min(255, Math.round(v * k))).join(',')},${al})`;
  a.fillStyle = vc(0.36);
  a.fill(body);
  a.restore();
  a.save();
  a.clip(body);
  // varnish: lighter over the bouts' crowns, where the arch catches the light
  for (const [u, r, al] of [[0.22, 0.27, 0.34], [0.74, 0.32, 0.34], [0.48, 0.16, 0.14]] as const) {
    const gr = a.createRadialGradient(X(u * B), 0, 0, X(u * B), 0, X(r * B));
    gr.addColorStop(0, vc(1.45, al));
    gr.addColorStop(1, vc(1.45, 0));
    a.fillStyle = gr;
    a.fillRect(X(-0.05 * B), X(-0.4 * B), X(1.1 * B), X(0.8 * B));
  }
  // spruce grain along the plate: close at the centre joint, wider at the flanks (drawn at about twice
  // the real spacing, 0.9 → 2 mm, so it reads at screen scale)
  const rnd = bwRng(g.id.length * 7919 + 17);
  a.lineWidth = 0.6;
  for (const side of [1, -1]) {
    let z = 0.00045;
    while (z < sh.hwMax) {
      const f = z / sh.hwMax;
      a.strokeStyle = `rgba(22,10,4,${(0.1 + 0.16 * rnd()).toFixed(3)})`;
      a.beginPath();
      const ph = rnd() * 6;
      for (let k = 0; k <= 24; k++) {
        const x = (k / 24) * B;
        const zz = side * (z + 0.00035 * S * Math.sin(ph + (x / B) * 7) * (0.4 + f));
        if (k) a.lineTo(X(x), X(zz));
        else a.moveTo(X(x), X(zz));
      }
      a.stroke();
      z += (0.0018 + 0.0022 * f * f) * S ** 0.5 * (0.8 + 0.4 * rnd());
    }
  }
  // the long arch catches the light along the middle; the varnish is mottled, rubbed thin in places
  {
    const ag = a.createLinearGradient(0, X(-sh.hwMax), 0, X(sh.hwMax));
    ag.addColorStop(0, vc(1.6, 0));
    ag.addColorStop(0.5, vc(1.6, 0.13));
    ag.addColorStop(1, vc(1.6, 0));
    a.fillStyle = ag;
    a.fillRect(0, X(-sh.hwMax), X(B), X(2 * sh.hwMax));
    const nw = 14;
    const nh = 8;
    const nc = document.createElement('canvas');
    nc.width = nw;
    nc.height = nh;
    const nx = nc.getContext('2d')!;
    const im = nx.createImageData(nw, nh);
    for (let i = 0; i < nw * nh; i++) {
      const v = rnd();
      const dark = v < 0.5;
      im.data[i * 4] = dark ? 20 : 255;
      im.data[i * 4 + 1] = dark ? 8 : 200;
      im.data[i * 4 + 2] = dark ? 2 : 140;
      im.data[i * 4 + 3] = Math.round(255 * Math.abs(v - 0.5) * (dark ? 0.26 : 0.14));
    }
    nx.putImageData(im, 0, 0);
    a.imageSmoothingEnabled = true;
    a.drawImage(nc, 0, X(-sh.hwMax), X(B), X(2 * sh.hwMax));
  }
  // the channel round the edge, deeper in colour
  for (const d of [16, 10, 5.5, 2.5]) {
    a.strokeStyle = 'rgba(14,6,2,0.12)';
    a.lineWidth = 2 * d * MM * S * sc;
    a.stroke(body);
  }
  a.restore();
  // purfling (black–white–black) and the edge's rounded crown catching the light
  bwInsetLine(a, body, p.purf[0] * sc, Math.max(1.4, p.purf[1] * sc), 'rgba(10,6,3,0.85)');
  bwInsetLine(a, body, p.purf[0] * sc, Math.max(0.5, p.purf[1] * sc * 0.3), 'rgba(236,214,180,0.16)');
  bwInsetLine(a, body, 1.6 * MM * S * sc, Math.max(0.8, 1.2 * MM * S * sc), 'rgba(250,200,150,0.10)');
  a.strokeStyle = rgba(INK.ivory, 0.55);
  a.lineWidth = 1.1;
  a.lineJoin = 'round';
  a.stroke(body);
  // f-holes: cut through to the dark inside, their walls catching a little light
  for (const h of holes) {
    a.fillStyle = 'rgb(6,4,3)';
    a.fill(h);
    a.strokeStyle = 'rgba(236,200,160,0.32)';
    a.lineWidth = 0.75;
    a.stroke(h);
  }

  // ---- the fittings
  const reach = Math.max(sh.hwMax, p.pbW / 2 + 0.0098 * S ** 0.6 + 0.021 * S ** 0.62);
  const F = mk(-p.neck - p.head * HEAD_PROJ - 0.003, B + (g.id === 'cello' ? 0.385 : 0.012), -reach, reach);
  const c = F.c;
  const ebony = (x0: number, x1: number, half: number) => {
    const gr = c.createLinearGradient(0, -half, 0, half);
    gr.addColorStop(0, 'rgb(12,11,10)');
    gr.addColorStop(0.45, 'rgb(40,37,33)');
    gr.addColorStop(0.55, 'rgb(40,37,33)');
    gr.addColorStop(1, 'rgb(12,11,10)');
    void x0;
    void x1;
    return gr;
  };
  // fingerboard, standing well off the top: a soft shadow on the plate
  const fbEnd = xn + p.fbLen;
  const fbw = (x: number) => p.fbW[0] + ((p.fbW[1] - p.fbW[0]) * (x - xn)) / p.fbLen;
  const fb = bwPoly([[xn, -fbw(xn) / 2], [fbEnd, -fbw(fbEnd) / 2], [fbEnd, fbw(fbEnd) / 2], [xn, fbw(xn) / 2]], sc);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.7)';
  c.shadowBlur = 12 * dpr;
  c.shadowOffsetY = 8 * dpr;
  c.fillStyle = ebony(xn, fbEnd, (p.fbW[1] / 2) * sc);
  c.fill(fb);
  c.restore();
  c.fillStyle = ebony(xn, fbEnd, (p.fbW[1] / 2) * sc);
  c.fill(fb);
  c.strokeStyle = rgba(INK.ivory, 0.2);
  c.lineWidth = 0.8;
  c.stroke(fb);
  // the head: pegbox and scroll, front view
  const Lh = p.head;
  const e = p.eyeW / 2;
  const hp = bwHeadParts(p);
  const HX = (aa: number) => X(xn - aa * Lh * HEAD_PROJ);
  const sym = (pts: Pt[]) => {
    const q = new Path2D();
    pts.forEach(([aa, w], i) => (i ? q.lineTo(HX(aa), X(w)) : q.moveTo(HX(aa), X(w))));
    for (let i = pts.length - 1; i >= 0; i--) q.lineTo(HX(pts[i][0]), X(-pts[i][1]));
    q.closePath();
    return q;
  };
  const boxP = sym(hp.box);
  const crownP = sym(hp.crown);
  const earP = [1, -1].map((sg) => {
    const q = new Path2D();
    [...hp.ear].reverse().forEach(([aa, w], i) => (i ? q.lineTo(HX(aa), X(sg * w)) : q.moveTo(HX(aa), X(sg * w))));
    q.closePath();
    return q;
  });
  const headP = new Path2D();
  for (const q of [boxP, crownP, ...earP]) headP.addPath(q);
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.6)';
  c.shadowBlur = 12 * dpr;
  c.shadowOffsetY = 7 * dpr;
  c.fillStyle = vc(0.4);
  for (const q of [boxP, crownP, ...earP]) c.fill(q);
  c.restore();
  // the outline: stroked wide, then the fill laid over it, so only the silhouette's edge shows
  c.strokeStyle = rgba(INK.ivory, 0.5);
  c.lineWidth = 1.8;
  c.lineJoin = 'round';
  c.stroke(headP);
  const hg = c.createLinearGradient(0, X(-e), 0, X(e));
  hg.addColorStop(0, vc(0.55));
  hg.addColorStop(0.5, vc(1.05));
  hg.addColorStop(1, vc(0.55));
  c.fillStyle = hg;
  for (const q of [boxP, crownP, ...earP]) c.fill(q);
  // the ears: each turn's edge where it meets the crown, winding in to the eye (a boss)
  for (const [k, sg] of [[0, 1], [1, -1]] as const) {
    c.save();
    c.clip(crownP);
    c.strokeStyle = 'rgba(30,12,4,0.55)';
    c.lineWidth = 0.9;
    c.stroke(earP[k]);
    c.restore();
    const ea = HEAD_EAR.a;
    const ew = sg * (HEAD_EAR.w + 0.1) * e;
    c.beginPath();
    for (let j = 0; j <= 48; j++) {
      const th = (j / 48) * 2.2 * Math.PI;
      const r = HEAD_EAR.r * e * 0.92 * Math.exp(-0.36 * th);
      const aa = ea + (Math.cos(th) * r) / (Lh * HEAD_PROJ);
      const w = ew + sg * Math.sin(th) * r;
      if (j) c.lineTo(HX(aa), X(w));
      else c.moveTo(HX(aa), X(w));
    }
    c.strokeStyle = 'rgba(30,12,4,0.6)';
    c.lineWidth = 0.9;
    c.stroke();
    c.beginPath();
    c.arc(HX(ea), X(ew), 0.1 * e * sc, 0, Math.PI * 2);
    c.fillStyle = 'rgb(150,88,40)';
    c.fill();
    c.strokeStyle = 'rgba(30,12,4,0.7)';
    c.lineWidth = 0.8;
    c.stroke();
  }
  // the crown's spine and its two flutes
  c.strokeStyle = 'rgba(255,214,160,0.45)';
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(HX(0.68), 0);
  c.lineTo(HX(0.99), 0);
  c.stroke();
  c.strokeStyle = 'rgba(30,12,4,0.5)';
  c.lineWidth = Math.max(0.8, 0.06 * e * sc);
  for (const sg of [-1, 1]) {
    c.beginPath();
    hp.crown.forEach(([aa, w], i) => {
      if (aa < 0.68) return;
      const z = sg * Math.min(0.3 * e, 0.55 * w);
      if (i && aa > 0.68) c.lineTo(HX(aa), X(z));
      else c.moveTo(HX(aa), X(z));
    });
    c.stroke();
  }
  // the pegbox's cavity between the cheeks, closing in a round end at the throat
  const cheek = 4.2 * MM * S ** 0.85;
  const cav = new Path2D();
  const cavPts: Pt[] = [];
  for (let k = 0; k <= 16; k++) {
    const aa = 0.025 + (0.6 * k) / 16;
    cavPts.push([aa, bwPegboxW(p, aa) - cheek]);
  }
  cavPts.forEach(([aa, w], i) => (i ? cav.lineTo(HX(aa), X(w)) : cav.moveTo(HX(aa), X(w))));
  const aT = 0.625;
  const wT = bwPegboxW(p, aT) - cheek;
  cav.bezierCurveTo(HX(aT + 0.05), X(wT), HX(aT + 0.06), X(-wT), HX(aT), X(-wT));
  for (let k = 16; k >= 0; k--) cav.lineTo(HX(cavPts[k][0]), X(-cavPts[k][1]));
  cav.closePath();
  c.fillStyle = 'rgb(9,6,4)';
  c.fill(cav);
  c.strokeStyle = 'rgba(240,190,130,0.3)';
  c.lineWidth = 0.7;
  c.stroke(cav);
  // the nut
  const nutW = 0.0042 * S ** 0.5;
  c.fillStyle = 'rgb(30,27,24)';
  c.fillRect(X(xn - nutW), X(-fbw(xn) * 0.51), X(nutW), X(fbw(xn) * 1.02));
  c.strokeStyle = rgba(INK.ivory, 0.4);
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(X(xn), X(-fbw(xn) * 0.51));
  c.lineTo(X(xn), X(fbw(xn) * 0.51));
  c.stroke();
  // pegs: the shafts across the cavity, each string wound on its own; then the heads outside
  const sR = 0.0031 * S ** 0.6;
  for (let i = 0; i < 4; i++) {
    const aa = PEG_A[PEG_OF[i]];
    const w = bwPegboxW(p, aa);
    c.strokeStyle = 'rgb(28,22,18)';
    c.lineWidth = 2 * sR * sc;
    c.beginPath();
    c.moveTo(HX(aa), X(-w + cheek * 0.5));
    c.lineTo(HX(aa), X(w - cheek * 0.5));
    c.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const aa = PEG_A[PEG_OF[i]];
    const wIn = bwPegboxW(p, aa) - cheek;
    const zs = bwClamp((1.5 - i) * p.spreadN * 1.3, -wIn * 0.6, wIn * 0.6);
    c.strokeStyle = p.wound[i] ? 'rgba(214,204,186,0.75)' : 'rgba(228,234,240,0.85)';
    c.lineWidth = Math.max(0.6, p.dia[i] * sc);
    c.beginPath();
    c.moveTo(X(xn), X((1.5 - i) * p.spreadN));
    c.lineTo(HX(aa), X(zs));
    c.stroke();
    // the winding on the shaft
    c.strokeStyle = 'rgba(214,204,186,0.6)';
    c.lineWidth = 0.6;
    for (let k = -2; k <= 2; k++) {
      c.beginPath();
      c.moveTo(HX(aa) - sR * sc, X(zs + k * 0.0009 * S ** 0.5));
      c.lineTo(HX(aa) + sR * sc, X(zs + k * 0.0009 * S ** 0.5));
      c.stroke();
    }
  }
  const pegCol = g.id === 'cello' ? ['rgb(40,18,10)', 'rgb(110,54,32)'] : ['rgb(16,12,10)', 'rgb(66,52,42)'];
  for (let i = 0; i < 4; i++) {
    const aa = PEG_A[PEG_OF[i]];
    const s = PEG_SIDE[i];
    const w0 = bwPegboxW(p, aa);
    const ax = HX(aa);
    const zc0 = w0 + 0.004 * S ** 0.6;
    const hl = 0.021 * S ** 0.62;
    const hwid = 0.019 * S ** 0.62;
    const shaft = new Path2D();
    shaft.rect(ax - sR * sc, X(s > 0 ? w0 - 0.001 : -zc0), 2 * sR * sc, X(zc0 - w0 + 0.001));
    // the collar (two rings), then the thumb-piece: from the collar it flares to a broad paddle with a
    // rounded end (strings3d.ts's peg head, seen face on)
    const head = new Path2D();
    const z0 = zc0 + 0.0058 * S ** 0.6;
    const N = 18;
    const ptsU: Pt[] = [];
    for (let k = 0; k <= N; k++) {
      const t = k / N;
      // a paddle: flaring quickly out of the collar, its sides a little full, its end squarely rounded
      const end = Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.55) / 0.45, 2.8)), 1 / 2.8);
      const A0 = 0.5 * hwid * (0.42 + 0.58 * bwSstep(0, 0.32, t)) * (0.94 + 0.06 * Math.sin(Math.PI * t)) * end;
      ptsU.push([z0 + t * hl, A0]);
    }
    ptsU.forEach(([z, A0], k) => (k ? head.lineTo(ax - X(A0), X(s * z)) : head.moveTo(ax - X(A0), X(s * z))));
    for (let k = N; k >= 0; k--) head.lineTo(ax + X(ptsU[k][1]), X(s * ptsU[k][0]));
    head.closePath();
    const collar = new Path2D();
    collar.rect(ax - 1.45 * sR * sc, X(s > 0 ? zc0 : -z0), 2.9 * sR * sc, X(z0 - zc0));
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 6 * dpr;
    c.shadowOffsetY = 4 * dpr;
    c.fillStyle = pegCol[0];
    c.fill(shaft);
    c.fill(collar);
    c.fill(head);
    c.restore();
    const pg = c.createLinearGradient(ax - X(hwid / 2), 0, ax + X(hwid / 2), 0);
    pg.addColorStop(0, pegCol[0]);
    pg.addColorStop(0.4, pegCol[1]);
    pg.addColorStop(1, pegCol[0]);
    c.fillStyle = pg;
    c.fill(head);
    c.fill(collar);
    c.fill(shaft);
    c.strokeStyle = rgba(INK.ivory, 0.3);
    c.lineWidth = 0.7;
    c.stroke(head);
    c.stroke(collar);
    c.beginPath();
    c.moveTo(ax - 1.45 * sR * sc, X(s * (zc0 + 0.5 * (z0 - zc0))));
    c.lineTo(ax + 1.45 * sR * sc, X(s * (zc0 + 0.5 * (z0 - zc0))));
    c.stroke();
  }
  // the tailpiece (ebony: broad at its fret, waisted towards the tail), the saddle and tailgut, the end
  // button or the cello's endpin (no chinrest: the Met's photographs, the reference, have none)
  const tpTop = xb + L / 6;
  const tpEnd = B - 0.012 * S;
  const wTop = p.spreadB * 3.7;
  const wBot = p.spreadB * 1.55;
  const tpW = (s: number) => {
    const w = wBot + (wTop - wBot) * Math.pow(1 - s, 1.35);
    const round = s < 0.06 ? Math.sqrt(Math.max(0, 1 - ((0.06 - s) / 0.06) ** 2)) : 1;
    return w * (0.75 + 0.25 * round);
  };
  // saddle and tailgut
  const sadX = B - 0.006 * S;
  const sadW = 0.034 * S ** 0.8;
  c.fillStyle = 'rgb(22,19,17)';
  c.fillRect(X(sadX - 0.0035 * S ** 0.6), X(-sadW / 2), X(0.007 * S ** 0.6), X(sadW));
  c.strokeStyle = rgba(INK.ivory, 0.22);
  c.lineWidth = 0.7;
  c.strokeRect(X(sadX - 0.0035 * S ** 0.6), X(-sadW / 2), X(0.007 * S ** 0.6), X(sadW));
  c.strokeStyle = 'rgba(214,190,150,0.55)';
  c.lineWidth = Math.max(0.8, 0.0018 * S ** 0.6 * sc);
  for (const sg of [-1, 1]) {
    c.beginPath();
    c.moveTo(X(tpEnd), X(sg * 0.0035 * S ** 0.7));
    c.lineTo(X(B + 0.003 * S), X(sg * 0.0015 * S));
    c.stroke();
  }
  if (g.id === 'cello') {
    // endpin: the socket (ebony, with its collar) and the steel rod running on towards the floor
    const sock: Pt[] = [[0, 0.0175], [0.004, 0.019], [0.012, 0.017], [0.016, 0.0185], [0.022, 0.0185], [0.028, 0.012], [0.042, 0.009], [0.044, 0.0105], [0.05, 0.0105]];
    const sockP = new Path2D();
    sock.forEach(([d, r], i) => (i ? sockP.lineTo(X(B + d), X(-r)) : sockP.moveTo(X(B + d), X(-r))));
    for (let i = sock.length - 1; i >= 0; i--) sockP.lineTo(X(B + sock[i][0]), X(sock[i][1]));
    sockP.closePath();
    const rodL = 0.32;
    const rg = c.createLinearGradient(0, X(-0.005), 0, X(0.005));
    rg.addColorStop(0, 'rgb(70,78,86)');
    rg.addColorStop(0.4, 'rgb(214,222,230)');
    rg.addColorStop(1, 'rgb(60,66,72)');
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 8 * dpr;
    c.shadowOffsetY = 5 * dpr;
    c.fillStyle = rg;
    c.beginPath();
    c.moveTo(X(B + 0.05), X(-0.0048));
    c.lineTo(X(B + 0.05 + rodL), X(-0.0048));
    c.lineTo(X(B + 0.05 + rodL + 0.012), 0);
    c.lineTo(X(B + 0.05 + rodL), X(0.0048));
    c.lineTo(X(B + 0.05), X(0.0048));
    c.closePath();
    c.fill();
    c.fillStyle = 'rgb(20,17,15)';
    c.fill(sockP);
    c.restore();
    c.strokeStyle = rgba(INK.ivory, 0.3);
    c.lineWidth = 0.7;
    c.stroke(sockP);
    c.fillStyle = 'rgba(200,206,212,0.85)';
    c.fillRect(X(B + 0.004), X(-0.019), X(0.003), X(0.038));
  } else {
    c.beginPath();
    c.ellipse(X(B + 0.0035 * S), 0, X(0.004 * S), X(0.0052 * S), 0, 0, Math.PI * 2);
    c.fillStyle = 'rgb(22,19,17)';
    c.fill();
    c.strokeStyle = rgba(INK.ivory, 0.3);
    c.lineWidth = 0.7;
    c.stroke();
  }
  const tp = new Path2D();
  const NT = 30;
  for (let k = 0; k <= NT; k++) {
    const s = k / NT;
    const x = tpTop + s * (tpEnd - tpTop);
    if (k) tp.lineTo(X(x), X(-tpW(s) / 2));
    else tp.moveTo(X(x), X(-tpW(s) / 2));
  }
  for (let k = NT; k >= 0; k--) {
    const s = k / NT;
    tp.lineTo(X(tpTop + s * (tpEnd - tpTop)), X(tpW(s) / 2));
  }
  tp.closePath();
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.7)';
  c.shadowBlur = 10 * dpr;
  c.shadowOffsetY = 6 * dpr;
  c.fillStyle = ebony(tpTop, tpEnd, (wTop / 2) * sc);
  c.fill(tp);
  c.restore();
  c.fillStyle = ebony(tpTop, tpEnd, (wTop / 2) * sc);
  c.fill(tp);
  c.strokeStyle = rgba(INK.ivory, 0.22);
  c.lineWidth = 0.8;
  c.stroke(tp);
  // the fret (boxwood) the strings cross, and the holes behind it
  const xf = tpTop + 0.008 * S ** 0.7;
  c.strokeStyle = 'rgba(214,190,150,0.8)';
  c.lineWidth = Math.max(1, 0.0028 * S ** 0.6 * sc);
  c.beginPath();
  c.moveTo(X(xf), X(-wTop * 0.43));
  c.lineTo(X(xf), X(wTop * 0.43));
  c.stroke();
  const tailEnd = (i: number): Pt => [tpTop + 0.012 * S ** 0.7 + (i === 3 ? 0.012 * S ** 0.7 : 0), (1.5 - i) * p.spreadB * 0.62];
  for (let i = 0; i < 4; i++) {
    const [x, z] = tailEnd(i);
    c.beginPath();
    c.arc(X(x), X(z), Math.max(1, 0.0011 * S ** 0.6 * sc), 0, Math.PI * 2);
    c.fillStyle = 'rgb(4,3,3)';
    c.fill();
  }
  // a fine tuner on the highest string (nickel): its lever along the string and the knurled screw head
  {
    const [x, z] = tailEnd(3);
    const k = S ** 0.55;
    c.strokeStyle = 'rgba(150,158,166,0.75)';
    c.lineWidth = Math.max(1, 0.0022 * k * sc);
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(X(x - 0.004 * k), X(z));
    c.lineTo(X(x + 0.0155 * k), X(z));
    c.stroke();
    c.lineCap = 'butt';
    c.beginPath();
    c.arc(X(x + 0.011 * k), X(z), Math.max(1.1, 0.0024 * k * sc), 0, Math.PI * 2);
    c.fillStyle = 'rgb(168,176,184)';
    c.fill();
  }
  // the bridge (maple), seen from above: its feet, the sloping face and the thin top edge
  const bW = p.bridgeW;
  const foot = 0.0042 * S ** 0.7;
  const topT = 0.0013 * S ** 0.7;
  const footL = 0.0105 * S ** 0.8;
  c.save();
  c.shadowColor = 'rgba(0,0,0,0.65)';
  c.shadowBlur = 5 * dpr;
  c.shadowOffsetY = 4 * dpr;
  c.fillStyle = 'rgb(176,150,112)';
  for (const sg of [-1, 1]) c.fillRect(X(xb - foot / 2), X(sg > 0 ? bW / 2 - footL : -bW / 2), X(foot), X(footL));
  c.beginPath();
  c.moveTo(X(xb - foot * 0.42), X(-bW * 0.44));
  c.lineTo(X(xb + topT / 2), X(-bW * 0.44));
  c.lineTo(X(xb + topT / 2), X(bW * 0.44));
  c.lineTo(X(xb - foot * 0.42), X(bW * 0.44));
  c.closePath();
  const bg = c.createLinearGradient(X(xb - foot / 2), 0, X(xb + topT / 2), 0);
  bg.addColorStop(0, 'rgb(170,146,108)');
  bg.addColorStop(1, 'rgb(226,206,168)');
  c.fillStyle = bg;
  c.fill();
  c.restore();
  c.strokeStyle = 'rgba(255,244,222,0.9)';
  c.lineWidth = Math.max(1, topT * sc);
  c.beginPath();
  c.moveTo(X(xb), X(-bW * 0.44));
  c.lineTo(X(xb), X(bW * 0.44));
  c.stroke();
  // the strings' after-length, bridge to tailpiece
  for (let i = 0; i < 4; i++) {
    const [x, z] = tailEnd(i);
    c.strokeStyle = p.wound[i] ? 'rgba(214,204,186,0.6)' : 'rgba(228,234,240,0.7)';
    c.lineWidth = Math.max(0.6, p.dia[i] * sc);
    c.beginPath();
    c.moveTo(X(xb), X((1.5 - i) * p.spreadB));
    c.lineTo(X(x), X(z));
    c.stroke();
  }
  // the scratch canvas was only for the purfling
  if (bwScratch) bwScratch.width = bwScratch.height = 1;
  return { key, lay, plate: A.box, fit: F.box, body, glow };
}

interface BowedLive {
  id: string;
  t: number;
  /** the bow's eased contact (m along, m across), its inclination over the strings, how far it is lifted */
  cx: number;
  cz: number;
  incl: number;
  lift: number;
  bi: number;
  beta: number;
  /** per string: the finger's eased place (m, without vibrato), its presence 0…1, the vibrato's range */
  fx: number[];
  fa: number[];
  vlo: number[];
  vhi: number[];
  /** the bowed string's running envelope (fractions of the displayed amplitude) */
  env: Float32Array;
}

/** the frame's bow force (N), from the bow trace's caption (the visual frame carries it nowhere else) */
const bwForce = (meta: string | undefined): number => {
  const m = meta ? /·\s*([\d.]+)\s*N\b/.exec(meta) : null;
  return m ? parseFloat(m[1]) : 0.5;
};

/** convex hull (monotone chain), for the frog's outline */
function bwHull(pts: Pt[]): Pt[] {
  const s = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [];
  for (const q of s) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: Pt[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const q = s[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

export function drawBowed(ctx: CanvasRenderingContext2D, W: number, H: number, g: BowedGeom, fr: VisualFrame | null, st: BowedState, field: ModeField, now: number): void {
  const p = BOWED_PLAN[g.id];
  const sh = bowedShapes(g.id, p, g.L);
  const dpr = Math.max(1, Math.abs(ctx.getTransform().a) || 1);
  const key = `${g.id}|${g.L}|${W}|${H}|${dpr}`;
  let ly = bowedLayers.get(key);
  if (!ly) {
    ly = paintBowedLayers(g, p, sh, bowedLayout(g, p, sh, W, H), W, H, dpr, key);
    bowedLayers.set(key, ly);
    for (const k of bowedLayers.keys()) {
      if (bowedLayers.size <= 6) break;
      bowedLayers.delete(k);
    }
  }
  const { sc } = ly.lay;
  const B = p.body;
  const S = B / 0.356;
  const L = g.L;
  const xb = L - p.neck;
  const xn = -p.neck;
  const X = (x: number) => x * sc;
  // string i's place across (m) at x along
  const zAt = (i: number, x: number) => (1.5 - i) * (p.spreadN + ((p.spreadB - p.spreadN) * (x - xn)) / L);

  // between frames
  let lv = st.live;
  if (!lv || lv.id !== g.id) lv = st.live = { id: g.id, t: 0, cx: xb - 0.1 * L, cz: zAt(1.5, xb), incl: 0, lift: 1, bi: 1, beta: 0.1, fx: [0, 0, 0, 0], fa: [0, 0, 0, 0], vlo: [0, 0, 0, 0], vhi: [0, 0, 0, 0], env: new Float32Array(0) };
  const dt = lv.t ? bwClamp((now - lv.t) / 1000, 0, 0.1) : 0;
  lv.t = now;
  const ease = (tau: number) => (dt > 0 ? 1 - Math.exp(-dt / tau) : 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  const base = ctx.getTransform();
  ctx.drawImage(ly.plate.cv, ly.plate.x, ly.plate.y, ly.plate.w, ly.plate.h);
  bwPlace(ctx, ly.lay);

  // the body's modes, as sand on a plate: pale nodal lines and a warm glow where it moves, on the
  // varnish, kept under the strings and out of the f-holes
  const lvl = field.update(fr?.modes ?? null, now / 1000);
  if (lvl > 0.01) {
    ctx.save();
    ctx.clip(ly.glow, 'evenodd');
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(field.canvas, 0, X(-sh.hwMax), X(B), X(2 * sh.hwMax));
    ctx.restore();
  }
  // inside, seen as through the top: the bass bar under the bass foot, the soundpost behind the treble
  // foot; they carry the bridge's motion into the plates, so they warm with the body's level
  {
    const zBar = 0.4 * p.bridgeW;
    const x0 = (B - p.bar[1]) / 2;
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = rgba(INK.amber, 0.1 + 0.3 * lvl);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const sg of [-1, 1]) {
      ctx.moveTo(X(x0), X(zBar - 0.002 * S + (sg * p.bar[0]) / 2));
      ctx.quadraticCurveTo(X(B / 2), X(zBar + (sg * p.bar[0]) / 2), X(x0 + p.bar[1]), X(zBar + 0.0015 * S + (sg * p.bar[0]) / 2));
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(xb + 0.003 * S), X(-(p.bridgeW / 2 - 0.0045 * S)), (p.post / 2) * sc, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.setTransform(base);
  ctx.drawImage(ly.fit.cv, ly.fit.x, ly.fit.y, ly.fit.w, ly.fit.h);
  bwPlace(ctx, ly.lay);

  // ---- the strings, the fingers, the bowed string's shape
  const strs = fr?.strings;
  const focus = fr?.focus ?? null;
  const bowedIdx = strs ? strs.findIndex((s) => s.bowing) : -1;
  let mxl = 0;
  if (strs) for (const s of strs) mxl = Math.max(mxl, s.level);
  const norm = st.lvlScale.of(mxl);
  const fingerX: number[] = [xn, xn, xn, xn];
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const s = strs?.[i];
    // the finger: its place eased so a shift slides (τ 35 ms) while vibrato goes straight through,
    // drawn four times larger than life
    const stopped = !!s && s.stop < 0.995;
    const base = s ? xb - s.stop * L : xn;
    if (stopped) {
      if (lv.fa[i] < 0.05) lv.fx[i] = base;
      else lv.fx[i] += (base - lv.fx[i]) * ease(0.035);
    }
    lv.fa[i] += ((stopped ? 1 : 0) - lv.fa[i]) * ease(stopped ? 0.03 : 0.09);
    const dev = s && stopped ? -(s.stopNow ?? s.stop) * L + s.stop * L : 0;
    const fx = lv.fx[i] + 4 * dev;
    const decay = Math.exp(-dt / 0.45);
    lv.vlo[i] = Math.min(4 * dev, lv.vlo[i] * decay);
    lv.vhi[i] = Math.max(4 * dev, lv.vhi[i] * decay);
    fingerX[i] = lv.fa[i] > 0.02 ? fx : xn;
    const l = s ? Math.sqrt(s.level / norm) : 0;
    // the string itself, at its own gauge
    ctx.strokeStyle = p.wound[i] ? 'rgba(214,204,186,0.72)' : 'rgba(228,234,240,0.85)';
    ctx.lineWidth = Math.max(0.6, p.dia[i] * sc);
    ctx.beginPath();
    ctx.moveTo(X(xn), X(zAt(i, xn)));
    ctx.lineTo(X(xb), X(zAt(i, xb)));
    ctx.stroke();
    // a ringing string glows between its finger and the bridge (the bowed one shows its shape instead)
    if (l > 0.03 && !(focus && i === bowedIdx)) {
      const x0 = Math.max(xn, fingerX[i]);
      for (const [w, a] of [[5, 0.12], [1.6, 0.85]] as const) {
        ctx.strokeStyle = rgba(s?.bowing ? INK.vermilion : INK.amber, a * (0.25 + 0.75 * l));
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(X(x0), X(zAt(i, x0)));
        ctx.lineTo(X(xb), X(zAt(i, xb)));
        ctx.stroke();
      }
    }
  }
  // fingertips: a pad pressing the string to the board, rolling with the vibrato (its range a faint
  // bar), the contact a bright line across the string
  for (let i = 0; i < 4; i++) {
    const a = lv.fa[i];
    if (a < 0.02) continue;
    const s = strs?.[i];
    const lit = s?.bowing ? 1 : 0.6;
    const x = fingerX[i];
    const z = zAt(i, x);
    const pad = 0.0066;
    ctx.globalAlpha = a;
    if (lv.vhi[i] - lv.vlo[i] > 0.0004) {
      ctx.strokeStyle = rgba(INK.amber, 0.3 * lit);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(X(lv.fx[i] + lv.vlo[i]), X(z) + X(pad) * 0.95);
      ctx.lineTo(X(lv.fx[i] + lv.vhi[i]), X(z) + X(pad) * 0.95);
      ctx.stroke();
    }
    const roll = (x - lv.fx[i]) * 0.5;
    const gr = ctx.createRadialGradient(X(x - roll), X(z), 0, X(x - roll), X(z), X(pad));
    gr.addColorStop(0, rgba(INK.felt, 0.5 * lit));
    gr.addColorStop(0.65, rgba(INK.felt, 0.32 * lit));
    gr.addColorStop(1, rgba(INK.felt, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(X(x - roll), X(z), X(pad * 0.85), X(pad), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(INK.amber, 0.95 * lit);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(x), X(z - pad * 0.55));
    ctx.lineTo(X(x), X(z + pad * 0.55));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // the bowed string's Helmholtz motion (sideways, in the bowing direction, in plan): its shape now,
  // the envelope it has swept lately, and the travelling corner
  if (focus && bowedIdx >= 0 && focus.shapes[0]) {
    const shp = focus.shapes[0];
    const n = shp.length;
    const x0 = Math.max(xn, fingerX[bowedIdx]);
    let m = 0;
    for (let k = 0; k < n; k++) m = Math.max(m, Math.abs(shp[k]));
    const scale = st.strScale.of(m);
    const amp = (0.9 * p.spreadB) / scale;
    if (lv.env.length !== n) lv.env = new Float32Array(n);
    const decay = Math.exp(-dt / 0.3);
    for (let k = 0; k < n; k++) lv.env[k] = Math.max(Math.abs(shp[k]) / scale, lv.env[k] * decay);
    const xk = (k: number) => x0 + (k / (n - 1)) * (xb - x0);
    ctx.beginPath();
    for (let k = 0; k < n; k++) ctx.lineTo(X(xk(k)), X(zAt(bowedIdx, xk(k)) - lv.env[k] * 0.9 * p.spreadB));
    for (let k = n - 1; k >= 0; k--) ctx.lineTo(X(xk(k)), X(zAt(bowedIdx, xk(k)) + lv.env[k] * 0.9 * p.spreadB));
    ctx.closePath();
    ctx.fillStyle = rgba(INK.vermilion, 0.1);
    ctx.fill();
    ctx.strokeStyle = rgba(INK.vermilion, 0.42);
    ctx.lineWidth = 0.7;
    ctx.stroke();
    let kc = 1;
    let best = -1;
    for (let k = 1; k < n - 1; k++) {
      const d2 = Math.abs(shp[k - 1] - 2 * shp[k] + shp[k + 1]);
      if (d2 > best) {
        best = d2;
        kc = k;
      }
    }
    for (const [w, a] of [[5, 0.16], [1.7, 1]] as const) {
      ctx.strokeStyle = rgba(INK.vermilion, a);
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const x = xk(k);
        const z = zAt(bowedIdx, x) - shp[k] * amp;
        if (k) ctx.lineTo(X(x), X(z));
        else ctx.moveTo(X(x), X(z));
      }
      ctx.stroke();
    }
    const cxk = xk(kc);
    const czk = zAt(bowedIdx, cxk) - shp[kc] * amp;
    const hg = ctx.createRadialGradient(X(cxk), X(czk), 0, X(cxk), X(czk), 9);
    hg.addColorStop(0, rgba(INK.vermilion, 0.55));
    hg.addColorStop(1, rgba(INK.vermilion, 0));
    ctx.fillStyle = hg;
    ctx.fillRect(X(cxk) - 9, X(czk) - 9, 18, 18);
    ctx.fillStyle = rgba(INK.ivory, 0.95);
    ctx.beginPath();
    ctx.arc(X(cxk), X(czk), 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- the bow
  const bow = fr?.bow;
  const playing = bowedIdx >= 0;
  if (playing) {
    lv.bi = bowedIdx;
    if (focus) lv.beta = bwClamp(1 - focus.hammerAt, 0.02, 0.45);
  }
  const sb = strs?.[lv.bi];
  const cxT = xb - lv.beta * (sb ? (sb.stopNow ?? sb.stop) : 1) * L;
  const czT = zAt(lv.bi, cxT);
  // the bow lies tangent to the bridge's arch at the string it plays, so over the outer strings it is
  // inclined and its plan shortens (cos of the slope; strings3d.ts poses it the same way)
  const inclT = Math.atan(((1.5 - lv.bi) * p.spreadB) / p.bridgeR);
  // a lifted bow is set down where it plays; a playing one moves there (string crossings, contact)
  const snap = playing && lv.lift > 0.9;
  lv.cx += (cxT - lv.cx) * (snap ? 1 : ease(0.05));
  lv.cz += (czT - lv.cz) * (snap ? 1 : ease(0.06));
  lv.incl += (inclT - lv.incl) * (snap ? 1 : ease(0.06));
  lv.lift += ((playing ? 0 : 1) - lv.lift) * ease(0.15);
  const Hh = g.bowLength;
  const S2 = Hh / 0.65;
  const pos = bow ? bwClamp(bow.pos, 0, 1) : 0.5;
  const ci = Math.cos(lv.incl);
  // the stick leans towards the fingerboard (the player tilts the hair), so from above it shows beside
  // the hair, closest in the middle where the camber brings it down
  const tilt = Math.sin(0.7);
  const tiltC = Math.cos(0.7);
  // the stick's height over the hair: 17.5 mm at the frog, down to 8 mm at the middle (the camber),
  // rising smoothly into the head
  const hgt = (s: number) => 0.0175 * S2 - 0.0095 * S2 * Math.sin(Math.PI * bwClamp(s / Hh, 0, 1)) + 0.004 * S2 * bwSstep(0.94, 1.01, s / Hh);
  const Zs = (s: number) => lv.cz + (pos * Hh - s) * ci;
  {
    // local (x along the strings, z across) to the stage, as bwPlace turns it
    const { ox, oy, vertical } = ly.lay;
    const P = (x: number, z: number): [number, number] => (vertical ? [ox - X(z), oy + X(x)] : [ox + X(x), oy + X(z)]);
    const [fx, fy] = P(lv.cx, Zs(0));
    const [tx, ty] = P(lv.cx, Zs(Hh));
    st.bowLine = { fx, fy, tx, ty, pos };
  }
  // the hair gives under the string: δ = F·a·(H − a)/(T·H) for hair tension T ≈ 60 N, drawn 3× larger
  const F = bwForce(fr?.excite?.meta);
  const s0 = 0.003 * S2;
  const s1 = Hh - 0.002 * S2;
  const ac = bwClamp(pos * Hh, s0 + 1e-4, s1 - 1e-4);
  const d0 = playing ? Math.min(0.6 * p.hairW, (3 * F * ac * (Hh - ac)) / (60 * Hh)) : 0;
  const defl = (s: number) => (s <= ac ? (d0 * s) / Math.max(1e-6, ac) : (d0 * (Hh - s)) / Math.max(1e-6, Hh - ac));
  const Xh = (s: number, h: number) => X(lv.cx - h * tilt - defl(bwClamp(s, 0, Hh)));
  const alpha = 1 - 0.55 * lv.lift;
  ctx.globalAlpha = alpha;
  // hair: a pale ribbon, its strands dashed so that they ride along with the bow
  const hw = (p.hairW * tiltC) / 2;
  ctx.beginPath();
  for (const s of [s0, ac, s1]) ctx.lineTo(Xh(s, 0) - X(hw), X(Zs(s)));
  for (const s of [s1, ac, s0]) ctx.lineTo(Xh(s, 0) + X(hw), X(Zs(s)));
  ctx.closePath();
  ctx.fillStyle = 'rgba(240,234,218,0.8)';
  ctx.fill();
  ctx.lineCap = 'butt';
  ctx.lineWidth = 0.7;
  const dashes = [[18, 4, 30, 3, 11, 5], [26, 3, 9, 6, 20, 4], [12, 5, 34, 2, 16, 3], [22, 4, 14, 3, 28, 5]];
  for (let k = 0; k < 4; k++) {
    const off = X(hw) * ((k + 0.5) / 2 - 1);
    ctx.setLineDash(dashes[k]);
    ctx.strokeStyle = 'rgba(140,126,104,0.55)';
    ctx.beginPath();
    for (const s of [s0, ac, s1]) ctx.lineTo(Xh(s, 0) + off, X(Zs(s)));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // the stick (pernambuco), round and tapering: Tourte's 110 mm of full diameter, then a taper
  const sBack = -0.085 * S2;
  const sHead = Hh + 0.006 * S2;
  const dia = (s: number) => {
    const t = bwClamp((s - (sBack + 0.11 * S2)) / (sHead - sBack - 0.11 * S2), 0, 1);
    return p.stick[0] * Math.pow(p.stick[1] / p.stick[0], Math.pow(t, 1.2));
  };
  const NS = 28;
  const stick = new Path2D();
  for (let k = 0; k <= NS; k++) {
    const s = sBack + ((sHead - sBack) * k) / NS;
    const x = X(lv.cx - hgt(s) * tilt) - X(dia(s) / 2);
    if (k) stick.lineTo(x, X(Zs(s)));
    else stick.moveTo(x, X(Zs(s)));
  }
  for (let k = NS; k >= 0; k--) {
    const s = sBack + ((sHead - sBack) * k) / NS;
    stick.lineTo(X(lv.cx - hgt(s) * tilt) + X(dia(s) / 2), X(Zs(s)));
  }
  stick.closePath();
  // the head: its profile from strings3d.ts, the ivory face plate at the tip
  // a profile (s along the bow, h above the hair) seen from above, and a part of thickness t as the
  // profile swept across t (its near face turned a little towards us)
  const proj = (pts: Pt[]) => pts.map(([s, h]): Pt => [X(lv.cx - h * tilt), X(Zs(s))]);
  const slab = (pts: Pt[], t: number): Pt[] => {
    const q = proj(pts);
    const d = X((t / 2) * tiltC);
    return bwHull([...q.map(([x, y]): Pt => [x - d, y]), ...q.map(([x, y]): Pt => [x + d, y])]);
  };
  const hTop = hgt(Hh + 0.006 * S2) + 0.003 * S2;
  const headProf: Pt[] = [
    [Hh - 0.004 * S2, 0.0035 * S2], [Hh, -0.0012], [Hh + 0.0085 * S2, -0.0015], [Hh + 0.0105 * S2, 0.004 * S2], [Hh + 0.0095 * S2, 0.0125 * S2], [Hh + 0.006 * S2, hTop], [Hh - 0.006 * S2, hgt(Hh - 0.006 * S2) + 0.4 * p.stick[1]],
  ];
  const headT = p.stick[1] * 1.15;
  const headP = slab(headProf, headT);
  const plateP = slab([[Hh + 0.0086 * S2, -0.0016], [Hh + 0.0108 * S2, -0.0016], [Hh + 0.0128 * S2, 0.004 * S2], [Hh + 0.0116 * S2, 0.0128 * S2], [Hh + 0.0096 * S2, 0.0125 * S2], [Hh + 0.0105 * S2, 0.004 * S2]], p.stick[1] * 1.17);
  const pathOf = (pts: Pt[]) => {
    const q = new Path2D();
    pts.forEach(([x, y], i) => (i ? q.lineTo(x, y) : q.moveTo(x, y)));
    q.closePath();
    return q;
  };
  ctx.fillStyle = 'rgb(98,42,18)';
  ctx.fill(stick);
  const head = pathOf(headP);
  ctx.fill(head);
  ctx.strokeStyle = 'rgba(16,6,2,0.7)';
  ctx.lineWidth = 0.7;
  ctx.stroke(stick);
  ctx.stroke(head);
  ctx.fillStyle = 'rgb(132,62,28)';
  ctx.fill(pathOf(proj(headProf).map(([x, y]): Pt => [x + X((headT / 2) * tiltC), y])));
  ctx.fillStyle = rgba(INK.ivory, 0.92);
  ctx.fill(pathOf(plateP));
  // the stick is round: lit along one side, in shade along the other
  for (const [off, w, col] of [[-0.2, 0.34, 'rgba(206,120,70,0.55)'], [-0.24, 0.1, 'rgba(255,214,176,0.7)'], [0.3, 0.22, 'rgba(30,10,4,0.45)']] as const) {
    ctx.strokeStyle = col;
    ctx.beginPath();
    for (let k = 0; k <= NS; k++) {
      const s = sBack + 0.01 * S2 + ((sHead - sBack - 0.012 * S2) * k) / NS;
      ctx.lineTo(X(lv.cx - hgt(s) * tilt) + X(dia(s) * off), X(Zs(s)));
    }
    ctx.lineWidth = Math.max(0.6, X(p.stick[1] * w));
    ctx.stroke();
  }
  // the winding (silver wire) and the thumb leather by the frog; the button at the end
  const band = (sA: number, sB: number, fill: string, wire: boolean) => {
    const xa = X(lv.cx - hgt((sA + sB) / 2) * tilt);
    const r = X(dia(sA) / 2 + 0.0004);
    ctx.fillStyle = fill;
    ctx.fillRect(xa - r, Math.min(X(Zs(sA)), X(Zs(sB))), 2 * r, Math.abs(X(Zs(sB)) - X(Zs(sA))));
    if (wire) {
      ctx.strokeStyle = 'rgba(90,96,102,0.6)';
      ctx.lineWidth = 0.5;
      const n = Math.max(2, Math.round(Math.abs(X(Zs(sB)) - X(Zs(sA))) / 1.6));
      ctx.beginPath();
      for (let k = 1; k < n; k++) {
        const y = X(Zs(sA + ((sB - sA) * k) / n));
        ctx.moveTo(xa - r, y);
        ctx.lineTo(xa + r, y);
      }
      ctx.stroke();
    }
  };
  band(0.004 * S2, 0.034 * S2, 'rgb(196,202,208)', true);
  band(-0.008 * S2, 0.004 * S2, 'rgb(64,40,26)', false);
  band(sBack - 0.016 * S2, sBack - 0.013 * S2, 'rgb(200,206,212)', false);
  band(sBack - 0.013 * S2, sBack - 0.004 * S2, 'rgb(20,17,15)', false);
  band(sBack - 0.004 * S2, sBack, 'rgb(200,206,212)', false);
  // the frog (ebony): its side profile seen from above with the bow tilted, the silver ferrule where the
  // hair leaves it, the pearl eye
  const fl = 0.047 * S2;
  const top = hgt(-0.02 * S2) - 0.003;
  const fw = 0.0124 * S2;
  const frogProf: Pt[] = [[0.002 * S2, -0.0025], [-fl + 0.004 * S2, -0.0028], [-fl, 0.004 * S2], [-fl + 0.003 * S2, top - 0.001 * S2], [-fl + 0.012 * S2, top], [-0.004 * S2, top], [0, 0.006 * S2]];
  const frog = pathOf(slab(frogProf, fw));
  ctx.fillStyle = 'rgb(14,12,11)';
  ctx.fill(frog);
  ctx.strokeStyle = rgba(INK.ivory, 0.4);
  ctx.lineWidth = 0.8;
  ctx.stroke(frog);
  // its near side face (the one the tilt turns up towards us): polished ebony, the pearl slide along
  // its hair edge, the silver underslide at its back, the pearl eye
  const side = (pts: Pt[]) => pathOf(proj(pts).map(([x, y]): Pt => [x + X((fw / 2) * tiltC), y]));
  ctx.fillStyle = 'rgb(36,33,30)';
  ctx.fill(side(frogProf));
  ctx.fillStyle = 'rgba(226,232,236,0.75)';
  ctx.fill(side([[-0.0005 * S2, -0.0028], [-fl + 0.005 * S2, -0.0028], [-fl + 0.005 * S2, -0.0008], [-0.0005 * S2, -0.0008]]));
  ctx.fillStyle = 'rgb(186,192,198)';
  ctx.fill(side([[-fl + 0.0006 * S2, 0.004 * S2], [-fl + 0.0062 * S2, 0.004 * S2], [-fl + 0.0062 * S2, top - 0.0015 * S2], [-fl + 0.0028 * S2, top - 0.0015 * S2]]));
  ctx.fillStyle = 'rgb(206,212,218)';
  ctx.fill(pathOf(slab([[0.0015 * S2, -0.003 * S2], [0.0047 * S2, -0.003 * S2], [0.0047 * S2, 0.0054 * S2], [0.0015 * S2, 0.0054 * S2]], fw * 1.04)));
  const eye = proj([[-0.022 * S2, 0.006 * S2]])[0];
  ctx.beginPath();
  ctx.ellipse(eye[0] + X((fw / 2) * tiltC), eye[1], X(0.0028 * S2 * tilt), X(0.0028 * S2), 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(232,238,244,0.95)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(160,170,180,0.9)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  // the contact: rosin-bright where hair meets string, by the power the bow puts in; and which way it goes
  if (playing && bow) {
    const v = Math.abs(bow.speed);
    const pw = Math.min(1, Math.sqrt((v * F) / 0.25));
    const gx = X(lv.cx);
    const gz = X(lv.cz);
    const rc = Math.max(4, X(p.spreadB) * (0.35 + 0.45 * Math.min(1.5, Math.sqrt(F / 0.5))));
    const gr = ctx.createRadialGradient(gx, gz, 0, gx, gz, rc);
    gr.addColorStop(0, rgba(INK.vermilion, 0.9 * pw));
    gr.addColorStop(1, rgba(INK.vermilion, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(gx - rc, gz - rc, 2 * rc, 2 * rc);
    if (!bow.changing && v > 0.02) {
      // down-bow draws the frog away from the strings (towards the player)
      const d = bow.dir > 0 ? 1 : -1;
      const zc = gz + d * 26;
      const xc = Xh(ac, 0);
      ctx.strokeStyle = rgba(INK.vermilion, Math.min(1, 0.4 + v));
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(xc - 4.5, zc - d * 4);
      ctx.lineTo(xc, zc);
      ctx.lineTo(xc + 4.5, zc - d * 4);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------------------------------------------------------------- winds: the bore's standing wave
/**
 * The bore's standing wave as the engine computes it, with its sign. Each visual frame carries one
 * snapshot of the pressure along the bore, at a phase that is effectively random at the frame rate;
 * averaging each point's product with the strongest point's gives every point's amplitude with the
 * sign of its lobe (the lobes either side of a node swing in opposite senses), in the engine's units.
 */
export interface BoreWave {
  amp: Float32Array;
  num: Float32Array;
  den: number;
  ref: number;
  last: Float32Array | null;
}
export const newBoreWave = (): BoreWave => ({ amp: new Float32Array(0), num: new Float32Array(0), den: 0, ref: -1, last: null });
/** fold one snapshot (a new frame's shape) into the running standing wave; returns the peak |amp| */
function trackBoreWave(w: BoreWave, s: Float32Array | null): number {
  if (s && s !== w.last && s.length > 1) {
    if (w.num.length !== s.length) {
      w.amp = new Float32Array(s.length);
      w.num = new Float32Array(s.length);
      w.den = 0;
      w.ref = -1;
    }
    w.last = s;
    let k = w.ref;
    if (k < 0 || k >= s.length || w.den < 1e-30) {
      k = 0;
      for (let i = 1; i < s.length; i++) if (Math.abs(s[i]) > Math.abs(s[k])) k = i;
    }
    const c = s[k];
    const a = 0.14;
    w.den = (1 - a) * w.den + a * c * c;
    for (let i = 0; i < s.length; i++) w.num[i] = (1 - a) * w.num[i] + a * s[i] * c;
  } else if (!s) {
    // silence: the wave dies away
    w.den *= 0.9;
    for (let i = 0; i < w.num.length; i++) w.num[i] *= 0.81;
  }
  const d = Math.sqrt(w.den);
  let peak = 0;
  let pk = w.ref;
  for (let i = 0; i < w.num.length; i++) {
    const v = d > 1e-30 ? (Math.SQRT2 * w.num[i]) / d : 0;
    w.amp[i] = v;
    if (Math.abs(v) > peak) {
      peak = Math.abs(v);
      pk = i;
    }
  }
  // follow the strongest point, keeping the sign convention (the new reference's lobe positive)
  if (pk >= 0 && pk !== w.ref && (w.ref < 0 || peak > 1.25 * Math.abs(w.amp[w.ref]))) {
    if (w.amp[pk] < 0) for (let i = 0; i < w.num.length; i++) {
      w.num[i] = -w.num[i];
      w.amp[i] = -w.amp[i];
    }
    w.ref = pk;
  }
  return peak;
}
/** the wave's amplitude at u (0..1 along the bore), linearly interpolated */
const boreAt = (amp: Float32Array, u: number): number => {
  if (amp.length < 2 || u < 0 || u > 1) return 0;
  const f = u * (amp.length - 1);
  const i = Math.min(amp.length - 2, Math.floor(f));
  return amp[i] + (amp[i + 1] - amp[i]) * (f - i);
};
/** a standing wave is drawn slowed: its true period (milliseconds) becomes about a second, a little
 *  quicker for higher notes, so the lobes visibly swing between compression and rarefaction */
const slowPhase = (f1: number, now: number): number => 2 * Math.PI * (0.55 * Math.sqrt(Math.max(0.25, f1 / 262))) * (now / 1000);
/** compression warm, rarefaction cool */
const waveInk = (v: number) => (v >= 0 ? INK.vermilion : INK.steel);

/** a damped spring towards `target` that stops at 0 and 1 with a small bounce (a pad seating, a
 *  piston meeting its felt), in fixed 2 ms steps: the same motion as the 3D keys (winds3d springTo) */
function spring01(pos: Float32Array, vel: Float32Array, i: number, target: number, dt: number, hz: number, zeta: number): number {
  const w = 2 * Math.PI * hz;
  let p = pos[i];
  let v = vel[i];
  const steps = Math.min(60, Math.max(1, Math.ceil(dt / 0.002)));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    v += (w * w * (target - p) - 2 * zeta * w * v) * h;
    p += v * h;
    if (p < 0) {
      p = 0;
      v = -v * 0.22;
    } else if (p > 1) {
      p = 1;
      v = -v * 0.22;
    }
  }
  pos[i] = p;
  vel[i] = v;
  return p;
}

// ---------------------------------------------------------------- flute
export interface FluteState {
  /** (the stage's state object keeps these; the wave now has its own reference, `waveRef`) */
  pScale: AutoScale;
  jetScale: AutoScale;
  env: Float32Array;
  wave?: BoreWave;
  /** the wave's reference level: the loudest of the last few seconds, so a note dying away fades */
  waveRef?: AutoScale;
  /** each key's spring: 1 open, 0 seated */
  keys?: { pos: Float32Array; vel: Float32Array; t: number; quiet: number };
}
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** sounding tube length for a written note (open–open, end-corrected), m */
export const tubeFor = (m: number) => 343 / (2 * et(m)) - 0.03;

// The flute seen from above, the keys towards the audience (down the page): a Boehm C flute laid
// out as the 3D model is (gl/winds3d.ts: a Yamaha YFL-482H measured off flute-side.jpg, scaled to
// McGee's 670 mm), in metres from the crown's end. `v` is across the tube, towards the audience.
const FL_LEN = 0.67;
const FL_EMB = 0.0705; // the embouchure hole's centre (→ 599.5 mm to the foot's end)
const FL_CORK = FL_EMB - 0.017; // the cork's face (17 mm from the hole's centre, standard)
const FL_RB = 0.0098; // body and foot, outer radius (19 mm bore)
const FL_BORE = 0.0095;
const FL_HEAD = 0.1885; // the head tube enters the body's socket
const FL_FOOT = 0.5355; // the foot's socket ring
const flHead = (x: number) => 0.0089 + 0.0008 * Math.pow(Math.max(0, Math.min(1, (x - 0.012) / (FL_HEAD - 0.012))), 0.65);
const FL_YC = FL_RB + 0.0016; // a closed pad's face from the axis
const FL_ROD_V = 0.0137 * Math.sin((79.5 * Math.PI) / 180); // the main rod, seen from above
const FL_FOOT_V = 0.0148 * Math.sin((10 * Math.PI) / 180); // the foot's rod
const FL_MAIN_POSTS = [0.2965, 0.348, 0.412, 0.4605, 0.5375];
const FL_FOOT_POSTS = [0.5505, 0.608, 0.6455];
/** The total end correction of the 3D model's holes, c/2f less the embouchure-to-hole distance, is
 *  56 mm at the open foot and 59–64 mm at the tone holes (the C♯ vent's small hole 73): an open
 *  pipe end's 0.61·a ≈ 6 mm (Levine & Schwinger) at the far end leaves ≈ 50 mm at the embouchure
 *  (its small, lip-shaded hole and the cork cavity). */
const FL_EMB_CORR = 0.05;
type FlCup = 'open' | 'plain' | 'dome' | 'crown';
interface FlKey {
  x: number;
  /** the note the bore sounds when this is the first open hole */
  note: number;
  r: number;
  style: FlCup;
  /** angle round the tube from the top, towards the audience (deg) */
  phi: number;
  /** closed-standing */
  closed?: boolean;
  open: (f: number) => boolean;
  /** its hinge tube along the rod */
  hinge?: [number, number];
  foot?: boolean;
}
/** the keys and the mechanism that moves them (winds3d FKEYS; OSU flute repair manual fig. 2.2) */
const FL_KEYS: FlKey[] = [
  { x: 0.307, note: 73, r: 0.0062, style: 'plain', phi: 0, open: (f) => !(f & L1), hinge: [0.2987, 0.3458] },
  { x: 0.35, note: 72, r: 0.008, style: 'plain', phi: -140, open: (f) => !(f & (TB | TBB)) },
  { x: 0.3575, note: 71, r: 0.00975, style: 'plain', phi: 0, open: (f) => !(f & (TBB | L2 | R1)), hinge: [0.3502, 0.3678] },
  { x: 0.379, note: 70, r: 0.00975, style: 'open', phi: 0, open: (f) => !(f & L2), hinge: [0.3682, 0.3893] },
  { x: 0.4, note: 69, r: 0.00975, style: 'open', phi: 0, open: (f) => !(f & L3), hinge: [0.3897, 0.4098] },
  { x: 0.4125, note: 68, r: 0.0082, style: 'plain', phi: -108, closed: true, open: (f) => !!(f & GS) },
  { x: 0.424, note: 68, r: 0.00975, style: 'plain', phi: 0, open: (f) => !(f & L3), hinge: [0.4142, 0.4335] },
  { x: 0.4475, note: 67, r: 0.00975, style: 'plain', phi: 0, open: (f) => !(f & RH), hinge: [0.437, 0.4583] },
  { x: 0.474, note: 66, r: 0.00975, style: 'open', phi: 0, open: (f) => !(f & R1), hinge: [0.4627, 0.4868] },
  { x: 0.5, note: 65, r: 0.00975, style: 'open', phi: 0, open: (f) => !(f & R2), hinge: [0.4872, 0.5143] },
  { x: 0.529, note: 64, r: 0.00975, style: 'open', phi: 0, open: (f) => !(f & R3), hinge: [0.5147, 0.5353] },
  { x: 0.558, note: 63, r: 0.00975, style: 'plain', phi: -42, closed: true, open: (f) => !!(f & EB), hinge: [0.5527, 0.5735], foot: true },
  { x: 0.591, note: 62, r: 0.0105, style: 'crown', phi: 62, open: (f) => !(f & (CS | CC)), hinge: [0.5741, 0.6058], foot: true },
  { x: 0.625, note: 61, r: 0.0105, style: 'crown', phi: 62, open: (f) => !(f & CC), hinge: [0.6102, 0.6433], foot: true },
];
/** which of the 2D flute's keys stand open for a note (the test holds them to the 3D model's) */
export const fluteKeysOpen = (m: number): { x: number; open: boolean }[] => FL_KEYS.map((k) => ({ x: k.x, open: k.open(fingersFor(m)) }));
const D2R = Math.PI / 180;
/** the tube's outline, radius against x (the crown's dome, the tapered head, the socket's two rings,
 *  the foot's ring and the end ring; winds3d buildFluteModel's profiles) */
const FL_PROFILE: [number, number][] = (() => {
  const p: [number, number][] = [
    [0, 0], [0.0003, 0.005], [0.0016, 0.0078], [0.0034, 0.009], [0.0046, 0.0093], [0.0052, 0.0096], [0.006, 0.0096], [0.0064, 0.0093],
    [0.0068, 0.0096], [0.0076, 0.0096], [0.008, 0.0093], [0.0112, 0.0093],
  ];
  for (let i = 0; i <= 10; i++) {
    const x = 0.0124 + ((FL_HEAD - 0.0124) * i) / 10;
    p.push([x, flHead(x)]);
  }
  const ring = (x: number): [number, number][] => [[x, 0.0104], [x + 0.0005, 0.011], [x + 0.0018, 0.011], [x + 0.0023, 0.01072], [x + 0.0028, 0.011], [x + 0.0042, 0.011], [x + 0.0048, 0.0104]];
  p.push(...ring(FL_HEAD), [0.2286, 0.0103], ...ring(0.229), [0.2345, FL_RB + 0.0001], [0.235, FL_RB]);
  p.push([FL_FOOT, FL_RB], [FL_FOOT + 0.0006, 0.0106], [FL_FOOT + 0.0016, 0.0108], [FL_FOOT + 0.0042, 0.0108], [FL_FOOT + 0.0047, 0.0105], [FL_FOOT + 0.0052, 0.0108], [FL_FOOT + 0.0094, 0.0108], [FL_FOOT + 0.0104, FL_RB + 0.0001], [FL_FOOT + 0.0108, FL_RB]);
  p.push([FL_LEN - 0.0045, FL_RB], [FL_LEN - 0.0038, 0.0103], [FL_LEN - 0.0012, 0.0104], [FL_LEN, 0.01]);
  return p;
})();
/** the joints' and rings' edges, drawn as hairlines across the tube */
const FL_SEAMS = [0.0052, 0.0076, 0.0112, FL_HEAD, FL_HEAD + 0.0023, FL_HEAD + 0.0048, 0.229, 0.2313, 0.2338, FL_FOOT, FL_FOOT + 0.0047, FL_FOOT + 0.0108, FL_LEN - 0.0045];
/** a superellipse, centre (cx, cy), half-sizes a, b, exponent n */
function superEllipse(p: Path2D | CanvasRenderingContext2D, cx: number, cy: number, a: number, b: number, n: number, seg = 48): void {
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * 2 * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = cy + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    if (i) p.lineTo(x, y);
    else p.moveTo(x, y);
  }
  p.closePath();
}
/** a teardrop touch lying along x from x0 (its narrow end) to x1 (round), at v, half-width w */
function teardrop(p: Path2D, X: (x: number) => number, Y: (v: number) => number, x0: number, x1: number, v0: number, v1: number, w: number, sc: number): void {
  const n = 14;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const hw = w * Math.pow(Math.sin(Math.PI * Math.max(0.03, Math.min(0.97, 0.1 + 0.9 * f))), 0.6) * (0.45 + 0.55 * f);
    const x = x0 + (x1 - x0) * f;
    const v = v0 + (v1 - v0) * f;
    // the width runs across the touch's own line
    const dx = x1 - x0;
    const dv = v1 - v0;
    const l = Math.hypot(dx, dv) || 1;
    pts.push([X(x) + (-dv / l) * hw * sc, Y(v) + (dx / l) * hw * sc]);
    pts.unshift([X(x) - (-dv / l) * hw * sc, Y(v) - (dx / l) * hw * sc]);
  }
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
}
interface FluteLayout {
  key: string;
  sc: number;
  x0: number;
  c: number;
  tube: Path2D;
  /** the tube's upper (lit) edge alone */
  rim: Path2D;
  seams: Path2D;
  plate: Path2D;
  hole: Path2D;
  rods: Path2D;
  hinges: Path2D;
  posts: Path2D;
  touches: Path2D;
  rollers: Path2D;
}
let flLayout: FluteLayout | null = null;
function fluteLayout(Lw: number, Cw: number, vertical: boolean): FluteLayout {
  const key = `${Lw}x${Cw}`;
  if (flLayout && flLayout.key === key) return flLayout;
  const sc = (vertical ? 0.86 : 0.9) * Lw / FL_LEN;
  const x0 = (Lw - FL_LEN * sc) / 2;
  // (above the middle on a wide stage: the room's grip sits at its right edge, half way down)
  const c = Cw * (vertical ? 0.5 : 0.4);
  const X = (x: number) => x0 + x * sc;
  const Y = (v: number) => c + v * sc;
  const tube = new Path2D();
  FL_PROFILE.forEach(([x, r], i) => (i ? tube.lineTo(X(x), Y(-r)) : tube.moveTo(X(x), Y(-r))));
  for (let i = FL_PROFILE.length - 1; i >= 0; i--) tube.lineTo(X(FL_PROFILE[i][0]), Y(FL_PROFILE[i][1]));
  tube.closePath();
  const rim = new Path2D();
  FL_PROFILE.forEach(([x, r], i) => (i ? rim.lineTo(X(x), Y(-r)) : rim.moveTo(X(x), Y(-r))));
  const seams = new Path2D();
  for (const x of FL_SEAMS) {
    let r = FL_RB;
    for (let i = 1; i < FL_PROFILE.length; i++) if (FL_PROFILE[i][0] >= x) {
      r = FL_PROFILE[i][1];
      break;
    }
    seams.moveTo(X(x), Y(-r));
    seams.lineTo(X(x), Y(r));
  }
  // the lip plate (45 × 27.6 mm, a superellipse, a little proud of the head) and the embouchure hole
  // (12.4 × 10.2 mm, a rounded rectangle)
  const plate = new Path2D();
  superEllipse(plate, X(FL_EMB), Y(0), 0.0225 * sc, (flHead(FL_EMB) + 0.0011) * sc, 3);
  const hole = new Path2D();
  superEllipse(hole, X(FL_EMB), Y(0), 0.0062 * sc, 0.0051 * sc, 3.6);
  // the rods (main, foot) and their hinge tubes and posts
  const rods = new Path2D();
  rods.moveTo(X(FL_MAIN_POSTS[0] - 0.003), Y(FL_ROD_V));
  rods.lineTo(X(FL_MAIN_POSTS[4] + 0.0005), Y(FL_ROD_V));
  rods.moveTo(X(FL_FOOT_POSTS[0] - 0.003), Y(FL_FOOT_V));
  rods.lineTo(X(FL_FOOT_POSTS[2] + 0.0005), Y(FL_FOOT_V));
  const hinges = new Path2D();
  for (const k of FL_KEYS) {
    if (!k.hinge) continue;
    const v = k.foot ? FL_FOOT_V : FL_ROD_V;
    const hr = 0.002 * sc;
    hinges.roundRect(X(k.hinge[0]), Y(v) - hr, (k.hinge[1] - k.hinge[0]) * sc, 2 * hr, hr);
  }
  const posts = new Path2D();
  for (const x of FL_MAIN_POSTS) {
    posts.moveTo(X(x) + 0.0024 * sc, Y(FL_ROD_V));
    posts.arc(X(x), Y(FL_ROD_V), 0.0024 * sc, 0, 2 * Math.PI);
  }
  for (const x of FL_FOOT_POSTS) {
    posts.moveTo(X(x) + 0.0022 * sc, Y(FL_FOOT_V));
    posts.arc(X(x), Y(FL_FOOT_V), 0.0022 * sc, 0, 2 * Math.PI);
  }
  // the touches: the G♯ key's spatula (the left little finger, on the player's side), the D♯ key's
  // touch on the foot, the D and D♯ trill keys' teardrops between the right hand's cups, the B♭ shake
  // and C♯ trill levers by R1 (winds3d, seen from above: v = r·sin φ)
  const touches = new Path2D();
  const vAt = (r: number, phi: number) => r * Math.sin(phi * D2R);
  teardrop(touches, X, Y, 0.411, 0.3885, vAt(0.0222, -43), vAt(0.0237, -33), 0.0056 * 0.8, sc);
  teardrop(touches, X, Y, 0.5522, 0.5688, vAt(0.0189, 44), vAt(0.0189, 44), 0.0044 * 0.72, sc);
  for (const x of [0.487, 0.5145]) teardrop(touches, X, Y, x, x, vAt(0.0159, 61), vAt(0.0141, 22), 0.0034, sc);
  teardrop(touches, X, Y, 0.46, 0.46, vAt(0.0158, 60), vAt(0.0145, 36), 0.003, sc);
  teardrop(touches, X, Y, 0.4604, 0.4604, vAt(0.0148, 29), vAt(0.0136, 10), 0.0024, sc);
  // the foot's two rollers (the C roller lower, the C♯ roller above it) on their arms
  const rollers = new Path2D();
  for (const [r0, r1, phi, rr, bx] of [
    [0.5525, 0.5655, 90, 0.0184, 0.6112],
    [0.5515, 0.5665, 74, 0.0178, 0.5755],
  ] as const) {
    const v = vAt(rr, phi);
    const hr = 0.0023 * sc;
    rollers.roundRect(X(r0), Y(v) - hr, (r1 - r0) * sc, 2 * hr, hr);
    // the lever: out from its hinge tube, round, and back along the foot to the roller
    rollers.moveTo(X(bx), Y(FL_FOOT_V + 0.002));
    rollers.lineTo(X(bx), Y(v - 0.004));
    rollers.quadraticCurveTo(X(bx), Y(v), X(bx - 0.004), Y(v));
    rollers.lineTo(X(r1 + 0.0012), Y(v));
  }
  flLayout = { key, sc, x0, c, tube, rim, seams, plate, hole, rods, hinges, posts, touches, rollers };
  return flLayout;
}

/** The flute from above: the head (crown, lip plate), the body's Boehm keys and the foot, the keys
 *  closing for the engine's note by the standard fingering (through the mechanism's links, each on a
 *  spring), the breath jet crossing the embouchure hole, and the bore's standing wave inside the
 *  tube over its effective length: the pressure nodes just past the first open hole and ~50 mm
 *  above the embouchure (the end corrections), the lobes swinging between compression and
 *  rarefaction (drawn slowed). */
export function drawFlute(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: FluteState): void {
  const vertical = H > W * 1.05;
  const Lw = vertical ? H : W;
  const Cw = vertical ? W : H;
  const L = fluteLayout(Lw, Cw, vertical);
  const { sc, c } = L;
  const X = (x: number) => L.x0 + x * sc;
  const Y = (v: number) => c + v * sc;
  const now = performance.now();
  const focus = fr?.focus ?? null;
  const br = fr?.breath;
  const blow = br ? br.pressure : 0;
  const vib = br ? br.vib : 0;
  // ---- the fingering: the engine's note while it sounds and a moment after, then the keys go back
  const ks = (st.keys ??= { pos: new Float32Array(FL_KEYS.length).fill(1), vel: new Float32Array(FL_KEYS.length), t: now, quiet: 10 });
  const dt = Math.min(0.1, Math.max(0, (now - ks.t) / 1000));
  ks.t = now;
  ks.quiet = blow > 0.015 ? 0 : ks.quiet + dt;
  const fingers = focus && ks.quiet < 0.8 ? fingersFor(focus.midi) : 0;
  const keyPos = FL_KEYS.map((k, i) => spring01(ks.pos, ks.vel, i, k.open(fingers) ? 1 : 0, dt, 26, 0.62));
  // ---- the effective length (c / 2f of the bore's note, from the engine), from its node above the
  // embouchure: its far node falls just past the first open hole (or among the vents of a
  // cross-fingered third-octave note), at most an end correction past the foot
  const Leff = focus ? focus.lengthM : 0;
  const xNear = FL_EMB - FL_EMB_CORR;
  const xFar = Math.min(FL_LEN + 0.006, xNear + Leff);

  ctx.save();
  if (vertical) {
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // (polished silver: a cool white over a mid grey body, so it reads as metal on the dark stage)
  const silver = (a: number) => rgba('230,232,236', a);
  const SILVER_BODY = 'rgb(62,64,68)';
  // ---- behind the tube: the thumb's key and the G♯ key on the player's side, their cups' edges
  // showing beyond the tube
  FL_KEYS.forEach((k, i) => {
    if (k.phi >= 0 || Math.cos(k.phi * D2R) > 0) return;
    drawFlCup(ctx, X(k.x), Y(FL_YC * Math.sin(k.phi * D2R)), k.r * sc, k.r * sc * Math.abs(Math.cos(k.phi * D2R)), k.style, keyPos[i]);
  });
  // ---- the tube: an opaque body, brushed silver lit from above the player's side
  ctx.fillStyle = SILVER_BODY;
  ctx.fill(L.tube);
  const g = ctx.createLinearGradient(0, Y(-0.0105), 0, Y(0.0105));
  g.addColorStop(0, silver(0.2));
  g.addColorStop(0.17, silver(0.68));
  g.addColorStop(0.3, silver(0.36));
  g.addColorStop(0.62, silver(0.12));
  g.addColorStop(0.9, silver(0.26));
  g.addColorStop(1, silver(0.08));
  ctx.fillStyle = g;
  ctx.fill(L.tube);
  ctx.strokeStyle = silver(0.18);
  ctx.lineWidth = 1;
  ctx.stroke(L.seams);
  ctx.strokeStyle = silver(0.45);
  ctx.lineWidth = 1.1;
  ctx.stroke(L.tube);
  // the lit edge: polished silver catches the light along the tube's upper side
  ctx.strokeStyle = silver(0.75);
  ctx.stroke(L.rim);
  // ---- the bore's standing wave, inside the tube: compression warm, rarefaction cool, nodes dark
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = (st.waveRef ??= new AutoScale(1e-6, 0.997)).of(peak);
  const ph = Math.cos(slowPhase(focus?.f1 ?? 440, now));
  const lvl = Math.min(1, peak / scale);
  if (focus && Leff > 0 && lvl > 0.02) {
    const xa = FL_CORK;
    const xb = Math.min(FL_LEN, xFar);
    // the envelope (where the air's pressure swings most: antinodes glow, nodes stay dark) in a
    // wide soft band, the swing itself (compression warm, rarefaction cool) in a narrower one
    // around the tube: the pressure's standing-wave envelope (|p| along the air column, pinched at
    // the nodes), quiet, as lobes above and below: where the air works hardest is readable at a glance
    {
      const Hm = Math.min(Cw * 0.14, 0.05 * sc) * Math.min(1, 0.35 + lvl);
      const M = 64;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(X(xNear), Y(sgn * FL_RB));
        for (let i = 0; i <= M; i++) {
          const x = xNear + ((xFar - xNear) * i) / M;
          const A = Math.min(1, Math.abs(boreAt(w.amp, (x - xNear) / Leff) / scale));
          ctx.lineTo(X(x), Y(sgn * FL_RB) + sgn * Hm * A);
        }
        ctx.lineTo(X(xFar), Y(sgn * FL_RB));
        ctx.closePath();
        ctx.fillStyle = rgba(INK.vermilion, 0.07 * lvl + 0.03);
        ctx.fill();
        ctx.strokeStyle = rgba(INK.vermilion, 0.16 + 0.22 * lvl);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    const ge = ctx.createLinearGradient(X(xa), 0, X(xb), 0);
    const gw = ctx.createLinearGradient(X(xa), 0, X(xb), 0);
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const x = xa + ((xb - xa) * i) / N;
      const A = boreAt(w.amp, (x - xNear) / Leff) / scale;
      ge.addColorStop(i / N, rgba(INK.vermilion, 0.26 * Math.min(1, Math.pow(Math.abs(A), 1.5))));
      gw.addColorStop(i / N, rgba(waveInk(A * ph), 0.42 * Math.min(1, Math.pow(Math.abs(A * ph), 1.15))));
    }
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const [h, gr] of [[0.8, ge], [0.42, gw]] as const) {
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.roundRect(X(xa), Y(-FL_BORE * h), (xb - xa) * sc, 2 * FL_BORE * h * sc, FL_BORE * h * sc);
      ctx.fill();
    }
    ctx.restore();
  }
  // ---- the lip plate and the embouchure hole
  ctx.fillStyle = SILVER_BODY;
  ctx.fill(L.plate);
  const gp = ctx.createLinearGradient(0, Y(-0.011), 0, Y(0.011));
  gp.addColorStop(0, silver(0.2));
  gp.addColorStop(0.22, silver(0.6));
  gp.addColorStop(0.5, silver(0.3));
  gp.addColorStop(1, silver(0.1));
  ctx.fillStyle = gp;
  ctx.fill(L.plate);
  ctx.strokeStyle = silver(0.6);
  ctx.lineWidth = 1.1;
  ctx.stroke(L.plate);
  ctx.fillStyle = '#060504';
  ctx.fill(L.hole);
  ctx.strokeStyle = silver(0.7);
  ctx.stroke(L.hole);
  // ---- the mechanism: rods, hinge tubes, the touches and rollers, the posts
  ctx.strokeStyle = silver(0.4);
  ctx.lineWidth = Math.max(1, 0.0011 * sc);
  ctx.stroke(L.rods);
  ctx.fillStyle = '#1b1a18';
  ctx.fill(L.hinges);
  ctx.strokeStyle = silver(0.5);
  ctx.lineWidth = 1;
  ctx.stroke(L.hinges);
  ctx.fillStyle = '#1b1a18';
  ctx.fill(L.touches);
  ctx.fill(L.rollers);
  ctx.strokeStyle = silver(0.45);
  ctx.stroke(L.touches);
  ctx.stroke(L.rollers);
  // ---- the keys, seated or open: each cup on its arm's neck from the hinge tube (a French cup's
  // pointed arm runs on over the cup to its hole)
  const seen = FL_KEYS.map((k, i) => ({ k, i, cphi: Math.cos(k.phi * D2R) })).filter((q) => q.cphi >= 0);
  const cupAt = (k: FlKey, cphi: number) => ({ cx: X(k.x), cy: Y(FL_YC * Math.sin(k.phi * D2R)), ry: k.r * sc * cphi, rod: Y(k.foot ? FL_FOOT_V : FL_ROD_V) });
  for (const { k, cphi } of seen) {
    const { cx, cy, ry, rod } = cupAt(k, cphi);
    flNeck(ctx, cx, cy + Math.sign(rod - cy) * ry * 0.82, rod, k.r * sc * 0.36, 0.0017 * sc);
    if (k.note === 73) flNeck(ctx, X(0.338), Y(0.0083 * 0.82), rod, 0.0083 * sc * 0.36, 0.0017 * sc);
  }
  for (const { k, i, cphi } of seen) {
    const { cx, cy, ry, rod } = cupAt(k, cphi);
    drawFlCup(ctx, cx, cy, k.r * sc, ry, k.style, keyPos[i]);
    // the first finger's cup on the C♯ key's lever (one piece with it)
    if (k.note === 73) drawFlCup(ctx, X(0.338), Y(0), 0.0083 * sc, 0.0083 * sc, 'dome', keyPos[i]);
    if (k.style === 'open') flArm(ctx, cx, cy + Math.sign(rod - cy) * ry * 0.98, cy + Math.sign(rod - cy) * 0.0045 * sc * cphi, 0.0016 * sc);
  }
  ctx.fillStyle = '#24221f';
  ctx.fill(L.posts);
  ctx.strokeStyle = silver(0.55);
  ctx.lineWidth = 1;
  ctx.stroke(L.posts);
  // ---- the breath: a sheet of air from the lips (the player's side) across the hole to its far
  // edge, carrying the jet's disturbance (its delay in periods from the engine) downstream, slowed
  const e = fr?.excite;
  if (blow > 0.02 && e) {
    const periods = Number(/= ([\d.]+) periods/.exec(e.meta)?.[1] ?? 0.42);
    let m = 0;
    for (let i = 0; i < e.trace.length; i += 4) m = Math.max(m, Math.abs(e.trace[i]));
    const swing = Math.min(1, m / st.jetScale.of(m));
    // from the lips at the plate's edge to the hole's far (blowing) edge, narrowing as it goes
    const vL = -(flHead(FL_EMB) + 0.0011);
    const vE = 0.0051;
    const t = now / 1000;
    const a = Math.min(1, 0.35 + blow) * (1 + 2.5 * vib);
    const gj = ctx.createLinearGradient(0, Y(vL), 0, Y(vE));
    gj.addColorStop(0, rgba(INK.steel, 0));
    gj.addColorStop(0.35, rgba(INK.steel, 0.5 * a));
    gj.addColorStop(1, rgba(INK.steel, 0.75 * a));
    ctx.strokeStyle = gj;
    for (let j = -2; j <= 2; j++) {
      ctx.beginPath();
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const v = vL + (vE - vL) * f;
        const eta = 0.0015 * Math.pow(f, 1.5) * Math.sin(2 * Math.PI * (periods * f - 0.9 * t) + j * 0.4) * (0.4 + 0.6 * swing) * Math.min(1, blow * 1.6);
        const x = FL_EMB + j * 0.0015 * (1 - 0.45 * f) + eta;
        if (i) ctx.lineTo(X(x), Y(v));
        else ctx.moveTo(X(x), Y(v));
      }
      ctx.lineWidth = j === 0 ? 1.2 : 0.8;
      ctx.stroke();
    }
  }
  // ---- the wave's line along the bore's axis, over everything (its nodes stand still)
  if (focus && Leff > 0 && lvl > 0.02) {
    const xa = FL_CORK;
    const xb = Math.min(FL_LEN, xFar);
    ctx.beginPath();
    const n = 120;
    for (let i = 0; i <= n; i++) {
      const x = xa + ((xb - xa) * i) / n;
      const v = (boreAt(w.amp, (x - xNear) / Leff) / scale) * ph;
      if (i) ctx.lineTo(X(x), Y(-v * FL_BORE * 0.62));
      else ctx.moveTo(X(x), Y(-v * FL_BORE * 0.62));
    }
    ctx.strokeStyle = rgba(INK.ivory, 0.75 * Math.min(1, 3 * lvl));
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}
/** a key's cup from above: its rim and shoulder, the open cups' hole and grommet, the plain cups'
 *  pad washer; `p` 1 open (raised), 0 seated: a seated cup sits lower and its finger (or link) lit */
function drawFlCup(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, style: FlCup, p: number): void {
  const s = 0.965 + 0.035 * p;
  const shut = 1 - p;
  rx *= s;
  ry *= s;
  // the cup: brushed silver, lit from above the player's side; seated, it takes the warm accent
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgb(58,60,64)';
  ctx.fill();
  // (silver like the tube: a bright crown towards the light, a darker skirt)
  const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
  g.addColorStop(0, rgba('230,232,236', 0.62));
  g.addColorStop(0.45, rgba('230,232,236', 0.3));
  g.addColorStop(1, rgba('230,232,236', 0.1));
  ctx.fillStyle = g;
  ctx.fill();
  if (shut > 0.01) {
    ctx.fillStyle = rgba(INK.amber, 0.14 * shut);
    ctx.fill();
  }
  ctx.strokeStyle = shut > 0.5 ? rgba(INK.amber, 0.5 + 0.3 * shut) : rgba(INK.ivory, 0.5);
  ctx.lineWidth = 1 + 0.5 * shut;
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.78, ry * 0.78, 0, 0, 2 * Math.PI);
  ctx.strokeStyle = rgba(INK.ivory, 0.16);
  ctx.lineWidth = 1;
  ctx.stroke();
  if (style === 'open') {
    // the hole through the cup: dark down the bore; a fingertip on it when seated
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.35, ry * 0.35, 0, 0, 2 * Math.PI);
    ctx.fillStyle = '#050403';
    ctx.fill();
    if (shut > 0.01) {
      ctx.fillStyle = rgba(INK.amber, 0.7 * shut);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.43, ry * 0.43, 0, 0, 2 * Math.PI);
    ctx.strokeStyle = rgba(INK.ivory, 0.45);
    ctx.stroke();
  } else if (style !== 'dome') {
    // the pad washer's button
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.13, ry * 0.13, 0, 0, 2 * Math.PI);
    ctx.fillStyle = shut > 0.5 ? rgba(INK.amber, 0.6 * shut) : rgba(INK.ivory, 0.15);
    ctx.fill();
    ctx.strokeStyle = rgba(INK.ivory, 0.35);
    ctx.stroke();
  }
}
/** a key's neck: from the cup's edge (at y0, half-width w0) narrowing to its hinge tube (y1, w1) */
function flNeck(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, w0: number, w1: number): void {
  const m = (y0 + y1) / 2;
  ctx.beginPath();
  ctx.moveTo(x - w0, y0);
  ctx.bezierCurveTo(x - w0 * 0.55, m, x - w1, m, x - w1, y1);
  ctx.lineTo(x + w1, y1);
  ctx.bezierCurveTo(x + w1, m, x + w0 * 0.55, m, x + w0, y0);
  ctx.closePath();
  ctx.fillStyle = '#262421';
  ctx.fill();
  ctx.strokeStyle = rgba(INK.ivory, 0.42);
  ctx.lineWidth = 0.9;
  ctx.stroke();
}
/** a key's arm: from its hinge tube (at y0) to its tip on the cup (y1), tapering */
function flArm(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, hw: number): void {
  ctx.beginPath();
  ctx.moveTo(x - hw * 0.55, y0);
  ctx.quadraticCurveTo(x - hw * 0.5, (y0 + y1) / 2, x, y1);
  ctx.quadraticCurveTo(x + hw * 0.5, (y0 + y1) / 2, x + hw * 0.55, y0);
  ctx.closePath();
  ctx.fillStyle = '#2b2925';
  ctx.fill();
  ctx.strokeStyle = rgba(INK.ivory, 0.42);
  ctx.lineWidth = 0.9;
  ctx.stroke();
}

// ---------------------------------------------------------------- spectrum hairline
export function drawSpectrum(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, an: AnalyserNode | null, buf: Float32Array, focus: VisualFrame['focus'] | null, family: string): void {
  const f0 = 30;
  const f1 = 12000;
  const X = (f: number) => x0 + (w * Math.log(f / f0)) / Math.log(f1 / f0);
  const dbLo = -115;
  const dbHi = -25;
  const Y = (db: number) => y0 + h * (1 - (db - dbLo) / (dbHi - dbLo));
  ctx.font = '10px "IBM Plex Mono", monospace';
  ctx.fillStyle = rgba(INK.ivory, 0.3);
  for (const [f, t] of [
    [100, '100'],
    [1000, '1k'],
    [10000, '10k'],
  ] as const) {
    // (the last label sits left of its frequency where it would run off the end)
    const tw = ctx.measureText(t).width;
    ctx.fillText(t, X(f) + 3 + tw > x0 + w ? X(f) - tw - 3 : X(f) + 3, y0 + h - 2);
  }
  if (an) {
    const bins = an.frequencyBinCount;
    const data = (bins <= buf.length ? buf.subarray(0, bins) : new Float32Array(bins)) as Float32Array<ArrayBuffer>;
    an.getFloatFrequencyData(data);
    const binHz = an.context.sampleRate / an.fftSize;
    ctx.strokeStyle = rgba(INK.ivory, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    let started = false;
    let lastX = -1;
    let acc = -Infinity;
    for (let i = 1; i < bins; i++) {
      const f = i * binHz;
      if (f < f0) continue;
      if (f > f1) break;
      const x = Math.round(X(f));
      acc = Math.max(acc, data[i]);
      if (x === lastX) continue;
      const y = Y(Math.max(dbLo, Math.min(dbHi, acc)));
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
      lastX = x;
      acc = -Infinity;
    }
    ctx.stroke();
  }
  if (focus) {
    // where the partials should be: stiff-string series (vermilion) vs ideal harmonics (steel)
    const fz = focus.f1 / Math.sqrt(1 + focus.B);
    for (let k = 1; k <= 60; k++) {
      const fk = k * fz * Math.sqrt(1 + focus.B * k * k);
      const fh = k * focus.f1;
      if (fh < f1 && family === 'piano') {
        ctx.fillStyle = rgba(INK.steel, 0.5);
        ctx.fillRect(X(fh) - 0.5, y0 - 2, 1, 4);
      }
      if (fk > f1) break;
      ctx.fillStyle = rgba(INK.vermilion, 0.9);
      ctx.fillRect(X(fk) - 0.75, y0 + 3, 1.5, 6);
    }
  }
}

// ---------------------------------------------------------------- trumpet
export interface TrumpetState {
  /** (the stage's state object keeps these; the wave now has its own reference, `waveRef`) */
  pScale: AutoScale;
  env: Float32Array;
  /** where the sound leaves (the bell's mouth), set while drawing */
  src?: { x: number; y: number };
  wave?: BoreWave;
  /** the wave's reference level: the loudest of the last few seconds, so a note dying away fades */
  waveRef?: AutoScale;
  /** pistons (0 up, 1 down) and the 1st and 3rd slides kicked out (0..1), each on a spring */
  mech?: { valves: Float32Array; valveV: Float32Array; slide: Float32Array; slideV: Float32Array; t: number; quiet: number };
}
export const VALVE_DOWN: Record<string, [boolean, boolean, boolean]> = {
  open: [false, false, false],
  '1': [true, false, false],
  '2': [false, true, false],
  '3': [false, false, true],
  '1+2': [true, true, false],
  '2+3': [false, true, true],
  '1+3': [true, false, true],
  '1+2+3': [true, true, true],
};

// The B♭ trumpet as the 3D model builds it (gl/winds3d.ts: laid out from trumpet-side.jpg at the Bach
// 180S37's published sizes, docs/3d-reference.md), in metres: x from the valves towards the bell, y up,
// z away from the viewer (the player's left, the leadpipe's side, is nearest). Drawn in an
// orthographic view from a little in front of the bell and above, so the bell's mouth opens as an
// ellipse and the bell pipe shows above the leadpipe.
type V3 = [number, number, number];
const TR_RT = 0.00635; // tubing: 11.66 mm bore, 12.7 mm outside
const TR_VX = [-0.026, 0, 0.026];
const TR_RC = 0.0099; // valve casings Ø19.8
const TR_CY = 0.052; // casing half-length
const TR_ZL = -0.017; // the leadpipe and slides' side
const TR_ZB = 0.017; // the bell section's side
const TR_XR = -0.15; // the receiver's end
const TR_XB = 0.33; // the bell rim, 480 mm from the receiver
const TR_MP = 0.066; // the 7C mouthpiece out of the receiver
const trLeadY = (x: number) => 0.036 + ((x - TR_XR) * 0.011) / 0.255;
const TR_LEAD_END = 0.098;
const TR_CAP_TOP = TR_CY + 0.0104;
const TR_STEM = 0.017;
const TR_STROKE = 0.0155; // piston travel
const TR_SLIDE_TRAVEL = [0.012, 0, 0.017];
const TR_VALVE_PASSAGES = 0.11;
const TR_BOW_C: V3 = [-0.103, 0.0055, TR_ZB];
const TR_BOW_R = 0.0255;
const TR_BELL0: V3 = [-0.103, 0.031, TR_ZB];
const TR_BELL_END: V3 = [TR_XB, 0.0492, TR_ZB];
const TR_MS_TOP = trLeadY(TR_LEAD_END);
const TR_MS_LOW = -0.034;
const TR_MS_X = 0.15;
const TR_RIM = 0.0611; // 122 mm bell
/** the bell's radius by distance from the rim: the side photograph's profile at a Bessel horn's rate */
const TR_BELL_D = [0, 0.002, 0.005, 0.01, 0.016, 0.025, 0.04, 0.06, 0.085, 0.115, 0.15, 0.2, 0.26, 0.33, 0.434];
const TR_BELL_R = [TR_RIM, 0.0585, 0.0538, 0.0466, 0.0405, 0.0345, 0.0262, 0.0195, 0.0152, 0.0125, 0.0108, 0.0094, 0.0083, 0.0075, 0.0068];
/** monotone cubic through the bell's table (Fritsch–Carlson), as the 3D model's */
const trBellR = (() => {
  const xs = TR_BELL_D;
  const ys = TR_BELL_R;
  const n = xs.length;
  const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) continue;
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    const xc = Math.max(xs[0], Math.min(xs[n - 1], x));
    let i = 0;
    while (i < n - 2 && xc > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (xc - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
})();
const v3add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const v3lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const v3len = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
/** a polyline with its corners rounded (quadratic, radius r), sampled about every `step` m */
function trRound(pts: V3[], r: number, step = 0.003): V3[] {
  const out: V3[] = [];
  const line = (a: V3, b: V3) => {
    const n = Math.max(1, Math.ceil(v3len(a, b) / step));
    for (let i = out.length ? 1 : 0; i <= n; i++) out.push(v3lerp(a, b, i / n));
  };
  let cur = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1];
    const B = pts[i];
    const C2 = pts[i + 1];
    const p1 = v3lerp(B, A, Math.min(0.5, r / v3len(A, B)));
    const p2 = v3lerp(B, C2, Math.min(0.5, r / v3len(B, C2)));
    line(cur, p1);
    const n = 10;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push(v3lerp(v3lerp(p1, B, t), v3lerp(B, p2, t), t));
    }
    cur = p2;
  }
  line(cur, pts[pts.length - 1]);
  return out;
}
/** the view: yaw towards the bell's mouth, pitch from above */
const TR_YAW = 11 * D2R;
const TR_PITCH = 13 * D2R;
const trProj = (p: V3): [number, number] => {
  const depth = -p[0] * Math.sin(TR_YAW) + p[2] * Math.cos(TR_YAW);
  return [p[0] * Math.cos(TR_YAW) + p[2] * Math.sin(TR_YAW), -(p[1] * Math.cos(TR_PITCH) + depth * Math.sin(TR_PITCH))];
};
const trDir = (() => {
  const l = Math.hypot(1, 0.011 / 0.255);
  return [1 / l, 0.011 / 0.255 / l, 0] as V3;
})();
const TR_RECV: V3 = [TR_XR, trLeadY(TR_XR), TR_ZL];
const trAlong = (s: number): V3 => [TR_RECV[0] + trDir[0] * s, TR_RECV[1] + trDir[1] * s, TR_ZL];
/** the main tuning slide's crook: a half turn from the leadpipe's level down to the third valve's */
const TR_CROOK: V3[] = (() => {
  const msR = (TR_MS_TOP - TR_MS_LOW) / 2;
  const c: V3 = [TR_MS_X, (TR_MS_TOP + TR_MS_LOW) / 2, (TR_ZL - 0.002) / 2];
  const u: V3 = [0, msR, TR_ZL - c[2]];
  return Array.from({ length: 41 }, (_, i) => {
    const a = (i / 40) * Math.PI;
    return [c[0] + msR * Math.sin(a), c[1] + u[1] * Math.cos(a), c[2] + u[2] * Math.cos(a)] as V3;
  });
})();
/** each valve's slide: the fixed tubes out of the casing (out, back) and the slide's U, the player's
 *  way to its port order (air out of the lower port, back by the upper) */
interface TrSlide {
  out: V3[];
  back: V3[];
  sleeve: V3[];
  dir: V3;
  group: number;
}
const TR_SLIDES: TrSlide[] = (() => {
  const s: TrSlide[] = [];
  // 1st: back towards the player
  {
    const [y1, y2, xb, xs] = [-0.01, -0.027, -0.0915, -0.052];
    s.push({
      out: trRound([[TR_VX[0], y2, -0.003], [TR_VX[0], y2, TR_ZL], [xs, y2, TR_ZL]], 0.0075),
      back: trRound([[xs, y1, TR_ZL], [TR_VX[0], y1, TR_ZL], [TR_VX[0], y1, -0.003]], 0.0075),
      sleeve: trRound([[xs, y2, TR_ZL], [xb, y2, TR_ZL], [xb, y1, TR_ZL], [xs, y1, TR_ZL]], 0.0085),
      dir: [-1, 0, 0],
      group: 2,
    });
  }
  // 2nd: a short crook out in front. (Tighter than the 3D model's, whose crook, traced with the
  // photograph's perspective, would add 134 mm of tubing: a semitone is 88 mm of the 1.48 m bore.)
  {
    const [a1, a2, z2, xb2] = [-0.008, -0.032, -0.03, -0.021];
    s.push({
      out: trRound([[TR_VX[1], a2, -0.003], [-0.001, a2, -0.019], [-0.008, a2, z2], [-0.0115, a2, z2]], 0.007),
      back: trRound([[-0.0115, a1, z2], [-0.008, a1, z2], [-0.001, a1, -0.019], [TR_VX[1], a1, -0.003]], 0.007),
      sleeve: trRound([[-0.0115, a2, z2], [xb2, a2, z2], [xb2, a1, z2], [-0.0115, a1, z2]], 0.0118),
      dir: [0, 0, 0],
      group: 4,
    });
  }
  // 3rd: forward, inside the main slide's loop
  {
    const [b1, b2, xf, xs3] = [-0.004, -0.02, 0.148, 0.059];
    s.push({
      out: trRound([[TR_VX[2], b2, -0.003], [TR_VX[2], b2, TR_ZL], [xs3, b2, TR_ZL]], 0.0075),
      back: trRound([[xs3, b1, TR_ZL], [TR_VX[2], b1, TR_ZL], [TR_VX[2], b1, -0.003]], 0.0075),
      sleeve: trRound([[xs3, b2, TR_ZL], [xf, b2, TR_ZL], [xf, b1, TR_ZL], [xs3, b1, TR_ZL]], 0.008),
      dir: [1, 0, 0],
      group: 2,
    });
  }
  return s;
})();
const TR_TAIL = trRound([[TR_VX[0], -0.02, 0.003], [TR_VX[0], -0.02, TR_ZB], [TR_BOW_C[0], -0.02, TR_ZB]], 0.009);
const TR_BOW: V3[] = Array.from({ length: 31 }, (_, i) => {
  const t = (i / 30) * Math.PI;
  return [TR_BOW_C[0] - TR_BOW_R * Math.sin(t), TR_BOW_C[1] - TR_BOW_R * Math.cos(t), TR_ZB] as V3;
});
const TR_BELL_LEN = v3len(TR_BELL0, TR_BELL_END);
const TR_LEAD: V3[] = trRound([trAlong(0.024), [TR_LEAD_END, TR_MS_TOP, TR_ZL]], 0, 0.004);
/** the main slide: its top leg from the leadpipe, the crook, the lower leg back into the third valve */
const TR_MAIN: V3[] = [...trRound([[TR_LEAD_END, TR_MS_TOP, TR_ZL], TR_CROOK[0]], 0), ...TR_CROOK.slice(1), ...trRound([TR_CROOK[TR_CROOK.length - 1], [TR_VX[2] + 0.004, TR_MS_LOW, -0.002]], 0).slice(1)];
/** the mouthpiece (Bach 7C) as [radius, distance from its rim]: rim, cup, throat, the shank's taper */
const TR_MPIECE: [number, number][] = [
  [0.0081, 0.0012], [0.0103, 0], [0.0128, 0.0016], [0.013, 0.0038], [0.013, 0.0078], [0.0124, 0.0092], [0.0118, 0.0104], [0.0104, 0.0145], [0.0084, 0.0192],
  [0.0066, 0.0236], [0.0054, 0.0272], [0.0051, 0.03], [0.0055, 0.031], [0.0051, 0.0322], [0.0055, 0.0334], [0.0052, 0.0346], [0.0053, 0.039], [0.006, 0.0402],
  [0.0061, 0.046], [0.0059, 0.0475], [0.0048, 0.088],
];
/** one segment of the air's path: points, the drawing group it is seen in, hidden (inside a casing),
 *  and which slide it rides with (they kick out) */
interface TrRun {
  pts: V3[];
  group: number;
  hidden?: boolean;
  slide?: number;
}
/** the air's path from the lips to the bell's rim for the pistons down: the mouthpiece, the leadpipe,
 *  the main slide, valves 3, 2 and 1 (through a pressed valve's slide, straight through an open one),
 *  the bell tail, the bow, the bell */
function trAirRuns(down: readonly boolean[]): TrRun[] {
  const runs: TrRun[] = [];
  const rim = trAlong(-TR_MP);
  runs.push({ pts: trRound([rim, trAlong(0.024)], 0), group: 3 });
  runs.push({ pts: TR_LEAD, group: 3 });
  runs.push({ pts: TR_MAIN, group: 2 });
  let at: V3 = [TR_VX[2], TR_MS_LOW, 0];
  runs.push({ pts: [TR_MAIN[TR_MAIN.length - 1], at], group: 1, hidden: true });
  for (const k of [2, 1, 0]) {
    const sl = TR_SLIDES[k];
    const exitY = k === 0 ? -0.02 : [-0.02, -0.018, -0.016][k];
    if (down[k]) {
      runs.push({ pts: [at, [TR_VX[k], sl.out[0][1], 0], sl.out[0]], group: 1, hidden: true });
      runs.push({ pts: sl.out, group: sl.group });
      runs.push({ pts: sl.sleeve, group: sl.group, slide: k });
      runs.push({ pts: sl.back, group: sl.group });
      at = [TR_VX[k], sl.back[sl.back.length - 1][1], 0];
      runs.push({ pts: [sl.back[sl.back.length - 1], at], group: 1, hidden: true });
    } else {
      // through the piston's straight port
      const nx: V3 = [TR_VX[k], exitY, 0];
      runs.push({ pts: [at, nx], group: 1, hidden: true });
      at = nx;
    }
    if (k > 0) {
      const nx: V3 = [TR_VX[k - 1], exitY, 0];
      runs.push({ pts: [at, nx], group: 1, hidden: true });
      at = nx;
    }
  }
  runs.push({ pts: [at, TR_TAIL[0]], group: 1, hidden: true });
  runs.push({ pts: TR_TAIL, group: 0 });
  runs.push({ pts: TR_BOW, group: 0 });
  runs.push({ pts: Array.from({ length: 41 }, (_, i) => v3lerp(TR_BELL0, TR_BELL_END, i / 40)), group: 0 });
  return runs;
}
const trAirCache = new Map<string, { runs: TrRun[]; runLen: number[]; total: number }>();
/** the air's path for a fingering, with each run's length and the whole (cached per fingering) */
function trAir(key: string, down: readonly boolean[]): { runs: TrRun[]; runLen: number[]; total: number } {
  let a = trAirCache.get(key);
  if (!a) {
    const runs = trAirRuns(down);
    const geo = runs.map((r) => {
      let l = 0;
      for (let i = 1; i < r.pts.length; i++) l += v3len(r.pts[i - 1], r.pts[i]);
      return l;
    });
    // the passages inside the casings are the same length whichever way a piston routes the air
    // (110 mm through the valve block, as the 3D model's air path counts them)
    const hid = runs.reduce((a, r, i) => a + (r.hidden ? geo[i] : 0), 0);
    const runLen = runs.map((r, i) => (r.hidden ? (geo[i] * TR_VALVE_PASSAGES) / hid : geo[i]));
    const total = runLen.reduce((a, b) => a + b, 0);
    trAirCache.set(key, (a = { runs, runLen, total }));
  }
  return a;
}
/** the air path's length for a fingering (lips to rim, m) */
export const trumpetAirLength = (valves: string): number => trAir(valves, VALVE_DOWN[valves] ?? VALVE_DOWN.open).total;
/** a projected strip of tube: the screen polyline (unit metres) for a 3D one */
const trPoly = (pts: V3[], off: V3 = [0, 0, 0]) => pts.map((p) => trProj(v3add(p, off)));
interface TrLayout {
  key: string;
  S: number;
  ox: number;
  oy: number;
  /** the paths that only change with the canvas's size, built once */
  memo: Map<string, unknown>;
}
let trLayout: TrLayout | null = null;
/** the fit: the instrument's projected extent (mouthpiece rim to bell rim, bottom caps to buttons) */
const TR_BOUNDS = (() => {
  const pts: [number, number][] = [];
  const add = (p: V3) => pts.push(trProj(p));
  add(trAlong(-TR_MP - 0.014));
  for (const t of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) add([TR_XB, TR_BELL_END[1] + TR_RIM * Math.cos(t), TR_ZB + TR_RIM * Math.sin(t)]);
  for (const x of TR_VX) {
    add([x, TR_CAP_TOP + TR_STEM + 0.006, 0]);
    add([x, -TR_CY - 0.012, -TR_RC]);
  }
  add([-0.0915 - 0.008, -0.03, TR_ZL]);
  add([-0.021 - 0.008, -0.04, -0.03]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
})();
function trumpetLayout(W: number, H: number): TrLayout {
  const key = `${W}x${H}`;
  if (trLayout && trLayout.key === key) return trLayout;
  const b = TR_BOUNDS;
  const portrait = H > W * 1.05;
  const S = Math.min(((portrait ? 0.9 : 0.84) * W) / (b.x1 - b.x0), ((portrait ? 0.5 : 0.62) * H) / (b.y1 - b.y0));
  const ox = W / 2 - ((b.x0 + b.x1) / 2) * S;
  const oy = H * (portrait ? 0.38 : 0.47) - ((b.y0 + b.y1) / 2) * S;
  trLayout = { key, S, ox, oy, memo: new Map() };
  return trLayout;
}
// lacquered yellow brass on the dark stage: a dark gold body under the amber edges and highlights
const BRASS_BODY = '#4a3416';
const BRASS_DEEP = '#251a0c';

/** Side view of a B♭ trumpet from the player's left, a little in front of the bell and above: the
 *  mouthpiece and leadpipe, the main tuning slide, three piston valves (the pistons going down with the
 *  engine's fingering, on springs), the first and third slides (kicked out on the notes that need it)
 *  and the second's crook, the bell tail, bow and the flare to the rim. The air's path through the
 *  pressed valves' slides glows faintly, and the bore's standing wave (the engine's, with its sign;
 *  drawn slowed) runs along that path from the lips to the bell; the lips buzz at the rim. */
export function drawTrumpet(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TrumpetState): void {
  const L = trumpetLayout(W, H);
  const { S } = L;
  const P = (q: [number, number]): [number, number] => [L.ox + q[0] * S, L.oy + q[1] * S];
  const memo = <T,>(k: string, f: () => T): T => {
    let v = L.memo.get(k) as T | undefined;
    if (v === undefined) L.memo.set(k, (v = f()));
    return v;
  };
  /** a 3D offset (a slide kicked out, a piston down) on the screen */
  const shift = (o: V3): [number, number] => {
    const q = trProj(o);
    return [q[0] * S, q[1] * S];
  };
  const now = performance.now();
  const meta = fr?.excite?.meta ?? '';
  const valves = /valves (\S+)/.exec(meta)?.[1] ?? 'open';
  const down = VALVE_DOWN[valves] ?? VALVE_DOWN.open;
  const focus = fr?.focus ?? null;
  // ---- the mechanism's springs (the 3D model's: pistons 22 Hz, slides 6 Hz)
  // ---- the standing wave along the air's path
  const w = (st.wave ??= newBoreWave());
  const peak = trackBoreWave(w, focus?.shapes[0] ?? null);
  const scale = (st.waveRef ??= new AutoScale(1e-6, 0.997)).of(peak);
  const lvl = Math.min(1, peak / scale);
  // ---- the mechanism's springs (the 3D model's: pistons 22 Hz, slides 6 Hz); the fingers stay down
  // while the trumpet sounds and a moment after, then lift
  const mc = (st.mech ??= { valves: new Float32Array(3), valveV: new Float32Array(3), slide: new Float32Array(3), slideV: new Float32Array(3), t: now, quiet: 10 });
  const dt = Math.min(0.1, Math.max(0, (now - mc.t) / 1000));
  mc.t = now;
  mc.quiet = lvl > 0.04 ? 0 : mc.quiet + dt;
  const held = mc.quiet < 0.8;
  const pressed = held ? down : VALVE_DOWN.open;
  const partial = Number(/partial (\d+)/.exec(meta)?.[1] ?? 0);
  const combo = !held ? 0 : valves === '1+3' ? 0.6 : valves === '1+2+3' ? 1 : 0;
  const kickTo = [partial >= 4 ? combo : 0, 0, partial > 0 && partial <= 3 ? combo : 0];
  const press = [0, 1, 2].map((k) => spring01(mc.valves, mc.valveV, k, pressed[k] ? 1 : 0, dt, 22, 0.6));
  const kick = [0, 1, 2].map((k) => spring01(mc.slide, mc.slideV, k, kickTo[k], dt, 6, 0.9) * TR_SLIDE_TRAVEL[k]);
  const slideOff = (k: number): V3 => [TR_SLIDES[k].dir[0] * kick[k], 0, 0];
  const ph = Math.cos(slowPhase(focus?.f1 ?? 392, now));
  const { runs, runLen, total } = trAir(valves, down);
  // the pressure at s along the path (m from the lips): the engine's wave, and in the bell's flare the
  // Webster horn's 1/r (p = ψ/r: the loop's wave is ψ, spreading over the widening mouth)
  const ampAt = (s: number) => {
    const d = total - s;
    const taper = d < TR_BELL_LEN ? TR_BELL_R[TR_BELL_R.length - 1] / trBellR(d) : 1;
    return (boreAt(w.amp, s / total) / scale) * taper;
  };

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const D = 2 * TR_RT * S;
  /** tubes along 3D polylines: an edge, the body, a lacquer highlight on the side towards the light
   *  (above, a little behind); their paths are kept per canvas size under `key` */
  const tubes = (key: string, polys: () => V3[][], d = D, edge = rgba(INK.amber, 0.7), body = BRASS_BODY, off?: V3) => {
    const { p, hp } = memo(`tube:${key}`, () => {
      const p = new Path2D();
      const hp = new Path2D();
      for (const pl3 of polys()) {
        const pl = trPoly(pl3).map(P);
        pl.forEach((q, i) => (i ? p.lineTo(...q) : p.moveTo(...q)));
        pl.forEach(([x, y], i) => {
          const a = pl[Math.max(0, i - 1)];
          const b = pl[Math.min(pl.length - 1, i + 1)];
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const nx = -(b[1] - a[1]) / l;
          const ny = (b[0] - a[0]) / l;
          const o = 0.26 * d * (nx * -0.3 + ny * -0.95);
          if (i) hp.lineTo(x + nx * o, y + ny * o);
          else hp.moveTo(x + nx * o, y + ny * o);
        });
      }
      return { p, hp };
    });
    const o = off ? shift(off) : null;
    if (o) {
      ctx.save();
      ctx.translate(o[0], o[1]);
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = d + 2.2;
    ctx.stroke(p);
    ctx.strokeStyle = body;
    ctx.lineWidth = d;
    ctx.stroke(p);
    ctx.strokeStyle = rgba(INK.amber, 0.26);
    ctx.lineWidth = Math.max(1, 0.16 * d);
    ctx.stroke(hp);
    if (o) ctx.restore();
  };
  // a ferrule: the sleeve soldered over a joint, a short band a little proud of the tube
  const ferrule = (p: V3, off: V3 = [0, 0, 0], r = TR_RT) => {
    const a = P(trProj(v3add(p, off)));
    const b = P(trProj(v3add(p, v3add(off, [0.01, 0, 0]))));
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ux = (b[0] - a[0]) / l;
    const uy = (b[1] - a[1]) / l;
    const h = 0.0016 * S;
    const w = (r + 0.0011) * S;
    ctx.beginPath();
    ctx.moveTo(a[0] - ux * h + uy * w, a[1] - uy * h - ux * w);
    ctx.lineTo(a[0] + ux * h + uy * w, a[1] + uy * h - ux * w);
    ctx.lineTo(a[0] + ux * h - uy * w, a[1] + uy * h + ux * w);
    ctx.lineTo(a[0] - ux * h - uy * w, a[1] - uy * h + ux * w);
    ctx.closePath();
    ctx.fillStyle = BRASS_BODY;
    ctx.fill();
    ctx.fillStyle = rgba(INK.amber, 0.16);
    ctx.fill();
    ctx.strokeStyle = rgba(INK.amber, 0.7);
    ctx.lineWidth = 1;
    ctx.stroke();
  };
  // the air's glow inside the tubes of group g: the path faintly, then the wave's lobes by strength
  const glow = (g: number) => {
    if (!focus || lvl < 0.02) return;
    // the runs on the screen, with each point's distance from the lips (kept per fingering)
    const proj = memo(`air:${valves}`, () => {
      let s0 = 0;
      return runs.map((r, ri) => {
        const xy = new Float32Array(2 * r.pts.length);
        const sm = new Float32Array(r.pts.length);
        let s = s0;
        r.pts.forEach((p3, i) => {
          if (i) s += v3len(r.pts[i - 1], p3);
          const q = P(trProj(p3));
          xy[2 * i] = q[0];
          xy[2 * i + 1] = q[1];
          sm[i] = s;
        });
        s0 += runLen[ri];
        return { xy, sm };
      });
    });
    const base = new Path2D();
    const buckets = new Map<number, Path2D>();
    const envB = new Map<number, Path2D>();
    runs.forEach((r, ri) => {
      if (r.group !== g || r.hidden || (g === 0 && ri === runs.length - 1)) return;
      const { xy, sm } = proj[ri];
      const o = r.slide !== undefined ? shift(slideOff(r.slide)) : [0, 0];
      let last = -1;
      let lastE = -1;
      let prev: [number, number] = [xy[0] + o[0], xy[1] + o[1]];
      base.moveTo(...prev);
      for (let i = 1; i < sm.length; i++) {
        const A = ampAt((sm[i - 1] + sm[i]) / 2);
        const v = A * ph;
        const q: [number, number] = [xy[2 * i] + o[0], xy[2 * i + 1] + o[1]];
        base.lineTo(...q);
        const e = Math.round(Math.min(10, 10 * Math.pow(Math.abs(A), 1.5)));
        if (e) {
          let bp = envB.get(e);
          if (!bp) envB.set(e, (bp = new Path2D()));
          if (e !== lastE) bp.moveTo(...prev);
          bp.lineTo(...q);
        }
        lastE = e;
        const a = Math.round(Math.min(10, 10 * Math.pow(Math.abs(v), 1.2)));
        const key = a > 0 ? (v >= 0 ? a : -a) : 0;
        if (key) {
          let bp = buckets.get(key);
          if (!bp) buckets.set(key, (bp = new Path2D()));
          if (key !== last) bp.moveTo(...prev);
          bp.lineTo(...q);
        }
        last = key;
        prev = q;
      }
    });
    ctx.lineCap = 'butt';
    ctx.strokeStyle = rgba(INK.amber, 0.06 + 0.05 * lvl);
    ctx.lineWidth = 0.56 * D;
    ctx.stroke(base);
    for (const [e, bp] of envB) {
      ctx.strokeStyle = rgba(INK.vermilion, (e / 10) * 0.32);
      ctx.stroke(bp);
    }
    ctx.lineWidth = 0.32 * D;
    for (const [key, bp] of buckets) {
      ctx.strokeStyle = rgba(key > 0 ? INK.vermilion : INK.steel, (Math.abs(key) / 10) * 0.44);
      ctx.stroke(bp);
    }
    ctx.lineCap = 'round';
  };

  // ---- group 0: the bell section (tail, bow, the bell pipe flaring to the rim), farthest
  tubes('bellTail', () => [TR_TAIL, TR_BOW]);
  {
    // the bell's outline (its flare about the projected axis), the band inside it that carries the
    // wave, the mouth: built once per canvas size
    const B = memo('bell', () => {
      const pts = Array.from({ length: 61 }, (_, i) => {
        const t = Math.pow(i / 60, 0.6);
        return { q: P(trProj(v3lerp(TR_BELL0, TR_BELL_END, t))), r: trBellR(TR_BELL_LEN * (1 - t)) * S };
      });
      const ax = trPoly([TR_BELL0, TR_BELL_END]);
      const l = Math.hypot(ax[1][0] - ax[0][0], ax[1][1] - ax[0][1]);
      const nx = -(ax[1][1] - ax[0][1]) / l;
      const ny = (ax[1][0] - ax[0][0]) / l;
      const band = (k: number) => {
        const b = new Path2D();
        pts.forEach(({ q, r }, i) => (i ? b.lineTo(q[0] - nx * r * k, q[1] - ny * r * k) : b.moveTo(q[0] - nx * r * k, q[1] - ny * r * k)));
        for (let i = pts.length - 1; i >= 0; i--) b.lineTo(pts[i].q[0] + nx * pts[i].r * k, pts[i].q[1] + ny * pts[i].r * k);
        b.closePath();
        return b;
      };
      const edges = new Path2D();
      for (const sg of [-1, 1]) pts.forEach(({ q, r }, i) => (i ? edges.lineTo(q[0] + sg * nx * r, q[1] + sg * ny * r) : edges.moveTo(q[0] + sg * nx * r, q[1] + sg * ny * r)));
      const mouth = new Path2D();
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * 2 * Math.PI;
        const q = P(trProj([TR_XB, TR_BELL_END[1] + TR_RIM * Math.cos(t), TR_ZB + TR_RIM * Math.sin(t)]));
        if (i) mouth.lineTo(...q);
        else mouth.moveTo(...q);
      }
      mouth.closePath();
      return { bell: band(1), inner: band(0.3), edges, mouth, nx, ny, e0: P(trProj(TR_BELL0)), e1: P(trProj(TR_BELL_END)), c: P(trProj([TR_XB, TR_BELL_END[1], TR_ZB])) };
    });
    const { bell, nx, ny } = B;
    ctx.fillStyle = BRASS_BODY;
    ctx.fill(bell);
    // burnished lacquer: brighter along the upper flank
    const a0 = B.e0;
    const g = ctx.createLinearGradient(a0[0] + nx * -0.06 * S, a0[1] + ny * -0.06 * S, a0[0] + nx * 0.06 * S, a0[1] + ny * 0.06 * S);
    g.addColorStop(0, rgba(INK.amber, 0.04));
    g.addColorStop(0.3, rgba(INK.amber, 0.22));
    g.addColorStop(0.5, rgba(INK.amber, 0.06));
    g.addColorStop(0.75, rgba(INK.amber, 0.12));
    g.addColorStop(1, rgba(INK.amber, 0.02));
    ctx.fillStyle = g;
    ctx.fill(bell);
    ctx.strokeStyle = rgba(INK.amber, 0.7);
    ctx.lineWidth = 1.1;
    ctx.stroke(B.edges);
    // the wave inside the bell: a gradient along its axis, as wide as the flare lets it be
    if (focus && lvl > 0.02) {
      const sBell = total - runLen[runs.length - 1];
      const { e0, e1, inner } = B;
      const gw = ctx.createLinearGradient(e0[0], e0[1], e1[0], e1[1]);
      const ge = ctx.createLinearGradient(e0[0], e0[1], e1[0], e1[1]);
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        const A = ampAt(sBell + u * TR_BELL_LEN);
        ge.addColorStop(u, rgba(INK.vermilion, 0.32 * Math.min(1, Math.pow(Math.abs(A), 1.5))));
        gw.addColorStop(u, rgba(waveInk(A * ph), 0.5 * Math.min(1, Math.pow(Math.abs(A * ph), 1.2))));
      }
      ctx.fillStyle = rgba(INK.amber, 0.05 + 0.04 * lvl);
      ctx.fill(inner);
      ctx.fillStyle = ge;
      ctx.fill(inner);
      ctx.fillStyle = gw;
      ctx.fill(inner);
    }
    // the rim: the bell's mouth as an ellipse, its rolled bead, the dark throat inside
    const { mouth, c } = B;
    const tg = ctx.createRadialGradient(c[0] - 0.01 * S, c[1], 0, c[0], c[1], TR_RIM * S);
    tg.addColorStop(0, BRASS_DEEP);
    tg.addColorStop(0.55, '#1e150c');
    tg.addColorStop(1, rgba(INK.amber, 0.3));
    ctx.fillStyle = tg;
    ctx.fill(mouth);
    ctx.strokeStyle = rgba(INK.amber, 0.85);
    ctx.lineWidth = 1.6;
    ctx.stroke(mouth);
    st.src = { x: c[0] + 0.012 * S, y: c[1] };
  }
  glow(0);
  ferrule([TR_BOW_C[0] + 0.001, -0.02, TR_ZB], [0, 0, 0], 0.0065);
  ferrule([TR_BELL0[0] + 0.0012, TR_BELL0[1], TR_ZB], [0, 0, 0], 0.0068);
  // ---- group 1: the valve casings, their caps, the pistons
  TR_VX.forEach((x, k) => {
    // a horizontal circle round the casing's axis, on the screen (kept per canvas size)
    const ring = (y: number, r: number) =>
      memo(`ring:${k}:${y}:${r}`, () => {
        const pts: [number, number][] = [];
        for (let i = 0; i <= 40; i++) {
          const t = (i / 40) * 2 * Math.PI;
          pts.push(P(trProj([x + r * Math.cos(t), y, r * Math.sin(t)])));
        }
        return pts;
      });
    const cyl = (y0: number, y1: number, r: number, fill: string, edge: string, top = true) => {
      const a = ring(y0, r);
      const b = ring(y1, r);
      const sx0 = Math.min(...a.map((q) => q[0]));
      const sx1 = Math.max(...a.map((q) => q[0]));
      const yb0 = P(trProj([x, y0, 0]))[1];
      const yb1 = P(trProj([x, y1, 0]))[1];
      const body = new Path2D();
      body.rect(sx0, yb1, sx1 - sx0, yb0 - yb1);
      const ell = (pts: [number, number][]) => {
        const e = new Path2D();
        pts.forEach((q, i) => (i ? e.lineTo(...q) : e.moveTo(...q)));
        e.closePath();
        return e;
      };
      ctx.fillStyle = fill;
      ctx.fill(body);
      ctx.fill(ell(a));
      const gx = ctx.createLinearGradient(sx0, 0, sx1, 0);
      gx.addColorStop(0, rgba(INK.amber, 0.04));
      gx.addColorStop(0.28, rgba(INK.amber, 0.22));
      gx.addColorStop(0.45, rgba(INK.amber, 0.06));
      gx.addColorStop(1, rgba(INK.amber, 0.02));
      ctx.fillStyle = gx;
      ctx.fill(body);
      ctx.strokeStyle = edge;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(sx0, yb1);
      ctx.lineTo(sx0, yb0);
      ctx.moveTo(sx1, yb1);
      ctx.lineTo(sx1, yb0);
      ctx.stroke();
      const lower = new Path2D();
      a.slice(20, 41).forEach((q, i) => (i ? lower.lineTo(...q) : lower.moveTo(...q)));
      ctx.stroke(lower);
      if (top) {
        const e = ell(b);
        ctx.fillStyle = fill;
        ctx.fill(e);
        ctx.stroke(e);
      }
    };
    const edge = rgba(INK.amber, 0.7);
    const nickel = rgba(INK.ivory, 0.6);
    // bottom cap (nickel, knurled), the casing, the top cap
    cyl(-TR_CY - 0.0086, -TR_CY, TR_RC + 0.0018, '#1c1a17', nickel, false);
    cyl(-TR_CY, TR_CY, TR_RC, BRASS_BODY, edge);
    cyl(TR_CY, TR_CY + 0.006, TR_RC + 0.0018, '#1c1a17', nickel);
    // the casing's collars (the knuckles' bands, the guide ring): their near halves
    ctx.strokeStyle = rgba(INK.amber, 0.38);
    ctx.lineWidth = 1;
    for (const y of [-TR_CY + 0.0062, 0.0129, TR_CY - 0.0072]) {
      ctx.beginPath();
      ring(y, TR_RC + 0.0005).slice(20, 41).forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
      ctx.stroke();
    }
    // the piston: stem and button (pearl in a polished bezel), down by the stroke when pressed
    const yb = TR_CAP_TOP + TR_STEM;
    const [, dy] = shift([0, -TR_STROKE * press[k], 0]);
    const s0 = P(trProj([x, TR_CY + 0.006, 0]));
    const s1 = P(trProj([x, yb, 0]));
    s1[1] += dy;
    ctx.strokeStyle = rgba(INK.ivory, 0.55);
    ctx.lineWidth = Math.max(1.5, 0.005 * S);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(...s0);
    ctx.lineTo(...s1);
    ctx.stroke();
    ctx.strokeStyle = '#1c1a17';
    ctx.lineWidth = Math.max(0.5, 0.005 * S - 2);
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.save();
    ctx.translate(0, dy);
    cyl(yb, yb + 0.0045, 0.0084, '#1c1a17', nickel);
    ctx.beginPath();
    ring(yb + 0.0045, 0.0053).forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
    ctx.closePath();
    ctx.fillStyle = pressed[k] ? rgba(INK.amber, 0.75) : rgba(INK.ivory, 0.32);
    ctx.fill();
    ctx.restore();
  });
  // ---- group 2: the main tuning slide, the third slide (inside its loop), the first slide
  const slideTubes = (k: number) => {
    const sl = TR_SLIDES[k];
    const on = pressed[k];
    tubes(`fixed${k}`, () => [sl.out, sl.back], D, rgba(INK.amber, on ? 0.78 : 0.48), on ? BRASS_BODY : BRASS_DEEP);
    // kicked out, the slide shows its nickel-silver inner tubes between the fixed tubes and its sleeve
    if (kick[k] > 0.0005) {
      const ends = [sl.out[sl.out.length - 1], sl.back[0]];
      ctx.save();
      const [ox, oy] = shift([sl.dir[0] * (kick[k] + 0.003), 0, 0]);
      // the inner tubes: from the fixed tube's end out to the sleeve, stretched with the kick
      ctx.lineCap = 'butt';
      for (const [wd, col] of [[D * 0.9 + 2, rgba(INK.ivory, 0.55)], [D * 0.9, '#1c1a17']] as const) {
        ctx.strokeStyle = col;
        ctx.lineWidth = wd;
        ctx.beginPath();
        for (const e of ends) {
          const a = P(trProj(e));
          ctx.moveTo(...a);
          ctx.lineTo(a[0] + ox, a[1] + oy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    tubes(`sleeve${k}`, () => [sl.sleeve], D, rgba(INK.amber, on ? 0.78 : 0.48), on ? BRASS_BODY : BRASS_DEEP, slideOff(k));
  };
  tubes('main', () => [TR_MAIN]);
  slideTubes(2);
  slideTubes(0);
  glow(2);
  // the third slide's ring and the first's thumb saddle, riding with them
  {
    const o3 = slideOff(2);
    const c3 = P(trProj(v3add([0.075, 0.0135, TR_ZL - 0.0042], o3)));
    const b3 = P(trProj(v3add([0.075, -0.004 + TR_RT, TR_ZL], o3)));
    ctx.strokeStyle = rgba(INK.amber, 0.55);
    ctx.lineWidth = Math.max(1, 0.0022 * S);
    ctx.beginPath();
    ctx.ellipse(c3[0], c3[1], 0.0105 * S, 0.0105 * S * 0.96, 0, 0, 2 * Math.PI);
    ctx.moveTo(b3[0], b3[1]);
    ctx.lineTo(c3[0], c3[1] + 0.0101 * S);
    ctx.stroke();
    const o1 = slideOff(0);
    const sad = [[-0.0786, 0.016], [-0.078, 0.003], [-0.0752, -0.0028], [-0.0668, -0.01 + TR_RT - 0.0004], [-0.0584, -0.0028], [-0.0556, 0.003], [-0.055, 0.016]].map(([x, y]) => P(trProj(v3add([x, y, TR_ZL], o1))));
    ctx.beginPath();
    sad.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
    ctx.stroke();
  }
  // the ferrules: the main slide's, the 1st and 3rd slides' sleeves (riding with them)
  ferrule([0.1035, TR_MS_TOP, TR_ZL]);
  ferrule([0.1015, TR_MS_LOW, -0.002]);
  for (const k of [0, 2]) {
    const sl = TR_SLIDES[k];
    ferrule(sl.sleeve[0], slideOff(k));
    ferrule(sl.sleeve[sl.sleeve.length - 1], slideOff(k));
  }
  {
    // the 3rd slide's stop rod (clamped to the slide) and its knurled nut, the guide on the fixed tube
    const o3 = slideOff(2);
    const zr = TR_ZL - TR_RT - 0.0027;
    const r0 = P(trProj(v3add([0.018, -0.004, zr], o3)));
    const r1 = P(trProj(v3add([0.113, -0.004, zr], o3)));
    ctx.strokeStyle = rgba(INK.ivory, 0.42);
    ctx.lineWidth = Math.max(1, 0.0024 * S);
    ctx.beginPath();
    ctx.moveTo(...r0);
    ctx.lineTo(...r1);
    ctx.stroke();
    const nut = P(trProj(v3add([0.0225, -0.004, zr], o3)));
    ctx.fillStyle = '#1c1a17';
    ctx.strokeStyle = rgba(INK.ivory, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(nut[0], nut[1] - 0.0031 * S, 0.0048 * S, 0.0062 * S, 0.001 * S);
    ctx.fill();
    ctx.stroke();
    const gd = P(trProj([0.0485, -0.004, zr]));
    ctx.beginPath();
    ctx.arc(gd[0], gd[1], 0.0026 * S, 0, 2 * Math.PI);
    ctx.fillStyle = BRASS_BODY;
    ctx.fill();
    ctx.strokeStyle = rgba(INK.amber, 0.6);
    ctx.stroke();
  }
  {
    // the water key on the main slide's crook: the nipple, the lever's cork cup, its hinge, the paddle
    const msR = (TR_MS_TOP - TR_MS_LOW) / 2;
    const c: V3 = [TR_MS_X, (TR_MS_TOP + TR_MS_LOW) / 2, (TR_ZL - 0.002) / 2];
    const uz = TR_ZL - c[2];
    const at = (a: number, out: number): V3 => {
      const q: V3 = [c[0] + msR * Math.sin(a), c[1] + msR * Math.cos(a), c[2] + uz * Math.cos(a)];
      const l = Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]);
      return [q[0] + ((q[0] - c[0]) / l) * out, q[1] + ((q[1] - c[1]) / l) * out, q[2] + ((q[2] - c[2]) / l) * out];
    };
    // the lever lies along the crook's outside, from its cup back past the hinge to the paddle
    ctx.strokeStyle = rgba(INK.ivory, 0.5);
    ctx.lineWidth = Math.max(1, 0.0017 * S);
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const a = 2.5 - 0.62 * (i / 10);
      const q = P(trProj(at(a, TR_RT + 0.0028 + 0.0035 * Math.max(0, (i - 6) / 4))));
      if (i) ctx.lineTo(...q);
      else ctx.moveTo(...q);
    }
    ctx.stroke();
    const cup = P(trProj(at(2.5, TR_RT + 0.0026)));
    ctx.beginPath();
    ctx.ellipse(cup[0], cup[1], 0.0034 * S, 0.0026 * S, Math.atan2(cup[1] - P(trProj(c))[1], cup[0] - P(trProj(c))[0]) + Math.PI / 2, 0, 2 * Math.PI);
    ctx.fillStyle = '#1c1a17';
    ctx.fill();
    ctx.fillStyle = rgba(INK.felt, 0.35); // the cork
    ctx.fill();
    ctx.stroke();
  }
  // ---- group 3: the leadpipe, the receiver, the finger hook and the mouthpiece
  tubes('lead', () => [TR_LEAD]);
  {
    // the finger hook past the third valve, leaning back, its tip curled
    const xb = 0.0545;
    const y0 = trLeadY(xb);
    const hook = [[xb, y0 + TR_RT - 0.001], [xb - 0.0035, y0 + 0.0095], [xb - 0.0098, y0 + 0.0165], [xb - 0.0098, y0 + 0.0228], [xb - 0.0045, y0 + 0.0262], [xb + 0.0006, y0 + 0.0244], [xb + 0.0016, y0 + 0.0212]].map(([x, y]) => P(trProj([x, y, TR_ZL])));
    ctx.strokeStyle = rgba(INK.amber, 0.55);
    ctx.lineWidth = Math.max(1, 0.0026 * S);
    ctx.beginPath();
    hook.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
    ctx.stroke();
  }
  // the mouthpiece: its silhouette along the leadpipe's axis (silver plate), rim to shank
  {
    const ax0 = P(trProj(trAlong(-TR_MP)));
    const ax1 = P(trProj(trAlong(0)));
    const dx = ax1[0] - ax0[0];
    const dy = ax1[1] - ax0[1];
    const l = Math.hypot(dx, dy);
    const ux = dx / l;
    const uy = dy / l;
    const at = (s: number, r: number): [number, number] => {
      const q = P(trProj(trAlong(-TR_MP + s)));
      return [q[0] - uy * r * S, q[1] + ux * r * S];
    };
    const mp = new Path2D();
    TR_MPIECE.forEach(([r, s], i) => (i ? mp.lineTo(...at(s, r)) : mp.moveTo(...at(s, r))));
    for (let i = TR_MPIECE.length - 1; i >= 0; i--) mp.lineTo(...at(TR_MPIECE[i][1], -TR_MPIECE[i][0]));
    mp.closePath();
    ctx.fillStyle = '#1c1a17';
    ctx.fill(mp);
    const gm = ctx.createLinearGradient(...at(0.03, 0.013), ...at(0.03, -0.013));
    gm.addColorStop(0, rgba(INK.ivory, 0.05));
    gm.addColorStop(0.3, rgba(INK.ivory, 0.22));
    gm.addColorStop(0.55, rgba(INK.ivory, 0.07));
    gm.addColorStop(1, rgba(INK.ivory, 0.03));
    ctx.fillStyle = gm;
    ctx.fill(mp);
    ctx.strokeStyle = rgba(INK.ivory, 0.6);
    ctx.lineWidth = 1.1;
    ctx.stroke(mp);
  }
  glow(3);
  ferrule([TR_LEAD_END - 0.0015, TR_MS_TOP, TR_ZL]);
  // ---- group 4: the second valve's crook, nearest
  slideTubes(1);
  glow(4);
  for (const e of [TR_SLIDES[1].sleeve[0], TR_SLIDES[1].sleeve[TR_SLIDES[1].sleeve.length - 1]]) ferrule(e);
  // ---- the lips at the rim: closed at rest; buzzing (drawn slowed) with the engine's lip opening
  {
    const tr = fr?.excite?.trace;
    let lo = 1;
    let hi = 0;
    if (tr) for (let i = 0; i < tr.length; i += 4) {
      lo = Math.min(lo, tr[i]);
      hi = Math.max(hi, tr[i]);
    }
    const swing = tr && hi > lo ? Math.sqrt(hi) - Math.sqrt(Math.max(0, lo)) : 0;
    const playing = swing > 0.02 && lvl > 0.02;
    const t = now / 1000;
    // drawn slowed, a little quicker for higher notes (the true buzz is the note itself)
    const open01 = playing ? 0.5 - 0.5 * Math.cos(2 * Math.PI * 4.5 * Math.sqrt((focus?.f1 ?? 392) / 392) * t) : 0;
    const gap = (0.0004 + 0.0032 * Math.min(1, swing * 1.6) * open01) * S;
    const rim = P(trProj(trAlong(-TR_MP)));
    const dx = P(trProj(trAlong(0)))[0] - rim[0];
    const dy = P(trProj(trAlong(0)))[1] - rim[1];
    const l = Math.hypot(dx, dy);
    const ux = dx / l;
    const uy = dy / l;
    const nx = uy;
    const ny = -ux;
    for (const sg of [-1, 1]) {
      // each lip: a soft cushion against the rim, from the aperture out past the rim's edge
      ctx.beginPath();
      for (let i = 0; i <= 18; i++) {
        const f = i / 18;
        const across = gap / 2 + f * 0.0135 * S;
        const bulge = (0.0014 + 0.0085 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + 0.98 * f)), 0.7)) * S;
        const q: [number, number] = [rim[0] - ux * bulge + sg * nx * across, rim[1] - uy * bulge + sg * ny * across];
        if (i) ctx.lineTo(...q);
        else ctx.moveTo(...q);
      }
      ctx.fillStyle = playing ? rgba(INK.vermilion, 0.1 + 0.1 * open01) : rgba(INK.felt, 0.12);
      ctx.fill();
      ctx.strokeStyle = rgba(INK.felt, 0.7);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // the lip's inner edge, where it buzzes against the other
      ctx.beginPath();
      ctx.moveTo(rim[0] - ux * 0.0012 * S + sg * nx * gap / 2, rim[1] - uy * 0.0012 * S + sg * ny * gap / 2);
      ctx.lineTo(rim[0] - ux * 0.0075 * S + sg * nx * (gap / 2 + 0.0016 * S), rim[1] - uy * 0.0075 * S + sg * ny * (gap / 2 + 0.0016 * S));
      ctx.strokeStyle = playing ? rgba(INK.vermilion, 0.5 + 0.45 * open01) : rgba(INK.felt, 0.4);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    if (playing) {
      // the puff through the aperture into the cup
      ctx.strokeStyle = rgba(INK.steel, 0.15 + 0.45 * open01);
      ctx.lineWidth = Math.max(1, gap * 0.7);
      ctx.beginPath();
      ctx.moveTo(rim[0] - ux * 0.002 * S, rim[1] - uy * 0.002 * S);
      ctx.lineTo(rim[0] + ux * 0.007 * S, rim[1] + uy * 0.007 * S);
      ctx.stroke();
    }
  }
  ctx.restore();
}
