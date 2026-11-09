// The stage: each instrument drawn in plan view and animated from the simulation's own
// state (string shapes, string levels, bow, bore pressure, board/body modes). Nothing
// here is decorative motion: every moving line is read from the audio thread.

import type { KeySummary, VisualFrame } from '@piano-model/engine';
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
    ear.push([HEAD_EAR.a + (Math.cos(th) * HEAD_EAR.r * e) / Lh, HEAD_EAR.w * e + Math.sin(th) * HEAD_EAR.r * e]);
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
  const x0 = -p.neck - p.head - 0.003;
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

interface BowedLayers {
  key: string;
  lay: BowedLayout;
  plate: HTMLCanvasElement;
  fit: HTMLCanvasElement;
  /** the plate (px, local frame), and the plate less its f-holes (for the modes' glow) */
  body: Path2D;
  glow: Path2D;
}
let bowedLayers: BowedLayers | null = null;
let bwScratch: HTMLCanvasElement | null = null;

/** a line at distance d inside a closed path, w wide (the path stroked wide, the inner part cut away,
 *  kept only inside the path) */
function bwInsetLine(c: CanvasRenderingContext2D, path: Path2D, lay: BowedLayout, dpr: number, d: number, w: number, style: string): void {
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
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  bwPlace(x, lay);
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
  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
    const c = cv.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    bwPlace(c, lay);
    return { cv, c };
  };
  const body = bwPoly(sh.body, sc);
  const holes = sh.fholes.map((f) => bwPoly(f, sc));
  const glow = new Path2D();
  glow.addPath(body);
  for (const h of holes) glow.addPath(h);
  const X = (x: number) => x * sc;

  // ---- the plate
  const A = mk();
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
  // the channel round the edge, deeper in colour
  for (const d of [16, 10, 5.5, 2.5]) {
    a.strokeStyle = 'rgba(14,6,2,0.12)';
    a.lineWidth = 2 * d * MM * S * sc;
    a.stroke(body);
  }
  a.restore();
  // purfling (black–white–black) and the edge's rounded crown catching the light
  bwInsetLine(a, body, lay, dpr, p.purf[0] * sc, Math.max(1.4, p.purf[1] * sc), 'rgba(10,6,3,0.85)');
  bwInsetLine(a, body, lay, dpr, p.purf[0] * sc, Math.max(0.5, p.purf[1] * sc * 0.3), 'rgba(236,214,180,0.16)');
  bwInsetLine(a, body, lay, dpr, 1.6 * MM * S * sc, Math.max(0.8, 1.2 * MM * S * sc), 'rgba(250,200,150,0.10)');
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
  const F = mk();
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
  const HX = (aa: number) => X(xn - aa * Lh);
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
      const aa = ea + (Math.cos(th) * r) / Lh;
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
  const pegCol = g.id === 'cello' ? ['rgb(40,18,10)', 'rgb(104,50,30)'] : ['rgb(12,10,9)', 'rgb(50,45,40)'];
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
  return { key, lay, plate: A.cv, fit: F.cv, body, glow };
}

/** The body's modes as a warm glow only: the same plate shapes as ModeField (sin mπu · sin nπv, in
 *  order of an orthotropic plate's frequencies, aspect 1.8, cross/along stiffness 0.6), weighted by
 *  their live amplitudes, on a coarse grid that is drawn smoothed over the plate. No nodal "sand":
 *  on the varnish it read as stains. Level and peak follow with time constants. */
class BowedGlow {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private f: Float32Array;
  private pairs: [number, number][];
  level = 0;
  private peak = 1e-30;
  constructor(
    readonly gw = 36,
    readonly gh = 20,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = gw;
    this.canvas.height = gh;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(gw, gh);
    this.f = new Float32Array(gw * gh);
    const cand: { m: number; n: number; f: number }[] = [];
    for (let m = 1; m <= 8; m++)
      for (let n = 1; n <= 6; n++) {
        const a = m / 1.8;
        cand.push({ m, n, f: Math.sqrt(0.6 * a ** 4 + n ** 4 + 2 * Math.sqrt(0.6) * 0.6 * a * a * n * n) });
      }
    cand.sort((x, y) => x.f - y.f);
    this.pairs = cand.map((c) => [c.m, c.n]);
  }
  update(amps: Float32Array | null, t: number, dt: number): number {
    let total = 0;
    if (amps) for (let k = 0; k < amps.length; k++) total += amps[k];
    this.peak = Math.max(total, this.peak * Math.exp(-dt / 3));
    const target = total > 0 ? Math.min(1, Math.pow(total / this.peak, 0.6)) : 0;
    this.level += (target - this.level) * (dt > 0 ? 1 - Math.exp(-dt / 0.06) : 1);
    if (!amps || this.level < 0.01) return this.level;
    const { gw, gh, f } = this;
    f.fill(0);
    const K = Math.min(amps.length, this.pairs.length);
    let top = 0;
    for (let k = 0; k < K; k++) top = Math.max(top, amps[k]);
    if (top <= 0) return this.level;
    for (let k = 0; k < K; k++) {
      if (amps[k] < 0.08 * top) continue;
      const [m, n] = this.pairs[k];
      const w = (amps[k] / top) * Math.cos(t * (0.7 + (k % 7) * 0.23) + k * 1.7);
      for (let j = 0; j < gh; j++) {
        const sv = w * Math.sin((n * Math.PI * (j + 0.5)) / gh);
        for (let i = 0; i < gw; i++) f[j * gw + i] += sv * Math.sin((m * Math.PI * (i + 0.5)) / gw);
      }
    }
    let mx = 1e-9;
    for (let i = 0; i < f.length; i++) mx = Math.max(mx, Math.abs(f[i]));
    const d = this.img.data;
    for (let i = 0; i < f.length; i++) {
      const g = Math.pow(Math.abs(f[i]) / mx, 1.4);
      d[i * 4] = 255;
      d[i * 4 + 1] = 160;
      d[i * 4 + 2] = 70;
      d[i * 4 + 3] = 255 * this.level * g;
    }
    this.ctx.putImageData(this.img, 0, 0);
    return this.level;
  }
}
let bwGlow: BowedGlow | null = null;

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
  if (!bowedLayers || bowedLayers.key !== key) bowedLayers = paintBowedLayers(g, p, sh, bowedLayout(g, p, sh, W, H), W, H, dpr, key);
  const ly = bowedLayers;
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
  ctx.drawImage(ly.plate, 0, 0, W, H);
  bwPlace(ctx, ly.lay);

  // the body's modes: a soft warm glow on the plate, kept under the strings and out of the f-holes
  void field;
  bwGlow ??= new BowedGlow();
  const lvl = bwGlow.update(fr?.modes ?? null, now / 1000, dt);
  if (lvl > 0.01) {
    ctx.save();
    ctx.clip(ly.glow, 'evenodd');
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bwGlow.canvas, 0, X(-sh.hwMax), X(B), X(2 * sh.hwMax));
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
  ctx.drawImage(ly.fit, 0, 0, W, H);
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
    const pad = 0.0068;
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
    gr.addColorStop(0, rgba(INK.felt, 0.34 * lit));
    gr.addColorStop(0.7, rgba(INK.felt, 0.2 * lit));
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
  ctx.fillStyle = 'rgba(236,228,210,0.62)';
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
    const gr = ctx.createRadialGradient(gx, gz, 0, gx, gz, 11);
    gr.addColorStop(0, rgba(INK.vermilion, 0.9 * pw));
    gr.addColorStop(1, rgba(INK.vermilion, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(gx - 11, gz - 11, 22, 22);
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

// ---------------------------------------------------------------- flute
export interface FluteState {
  pScale: AutoScale;
  jetScale: AutoScale;
  /** standing-wave envelope: running max of |p| along the sounding length */
  env: Float32Array;
}
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** sounding tube length for a written note (open–open, end-corrected), m */
export const tubeFor = (m: number) => 343 / (2 * et(m)) - 0.03;

export function drawFlute(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: FluteState): void {
  const vertical = H > W * 1.05;
  const Lw = vertical ? H : W;
  const Cw = vertical ? W : H;
  const cork = 0.02;
  const emb = 0.037;
  const full = emb + tubeFor(60) + 0.01;
  const sc = (0.9 * Lw) / (full + 0.02);
  const x0 = (Lw - (full + 0.02) * sc) / 2;
  const X = (m: number) => x0 + m * sc;
  const c = Cw * (vertical ? 0.5 : 0.46);
  const r = Math.max(9, 0.0095 * sc);
  ctx.save();
  if (vertical) {
    ctx.translate(W, 0);
    ctx.rotate(Math.PI / 2);
  }
  // tube body
  const tube = new Path2D();
  tube.rect(X(0), c - r, X(full) - X(0), 2 * r);
  ctx.fillStyle = rgba(INK.steel, 0.06);
  ctx.fill(tube);
  ctx.strokeStyle = rgba(INK.ivory, 0.45);
  ctx.lineWidth = 1.4;
  ctx.stroke(tube);
  // crown and cork
  ctx.fillStyle = rgba(INK.ivory, 0.25);
  ctx.fillRect(X(0) - 6, c - r * 1.1, 6, r * 2.2);
  ctx.fillStyle = rgba(INK.felt, 0.6);
  ctx.fillRect(X(cork) - 2, c - r, 4, 2 * r);
  // joints
  ctx.strokeStyle = rgba(INK.ivory, 0.18);
  for (const j of [0.2, full - 0.12]) {
    ctx.beginPath();
    ctx.moveTo(X(j), c - r * 1.08);
    ctx.lineTo(X(j), c + r * 1.08);
    ctx.stroke();
  }
  const focus = fr?.focus ?? null;
  const Lsound = focus ? focus.lengthM : tubeFor(60);
  const end = emb + Lsound;
  // tone holes for the fingering: covered (filled rings) up to the sounding end, open
  // beyond it; while the breath vibrato runs, the covered rings pulse with it
  const br = fr?.breath;
  const vibNow = br ? br.vib : 0;
  const blow = br ? br.pressure : 0;
  for (let m = 61; m <= 73; m++) {
    const at = emb + tubeFor(m) + 0.006;
    if (at > full - 0.005) continue;
    const open = at >= end - 0.004;
    const rr = r * 0.55 * (open ? 1 : 1 + 2.5 * vibNow);
    ctx.beginPath();
    ctx.arc(X(at), c - r * 0.15, Math.max(1, rr), 0, Math.PI * 2);
    if (open) {
      ctx.strokeStyle = rgba(INK.ivory, 0.55);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      ctx.fillStyle = rgba(INK.amber, Math.min(1, 0.55 + 0.35 * blow + 3 * vibNow));
      ctx.fill();
      ctx.strokeStyle = rgba(INK.amber, 0.25 * blow);
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }
  // the standing pressure wave inside the bore (embouchure → sounding end)
  if (focus && focus.shapes[0]) {
    const s = focus.shapes[0];
    let m = 0;
    for (let i = 0; i < s.length; i++) m = Math.max(m, Math.abs(s[i]));
    const scale = st.pScale.of(m);
    ctx.save();
    ctx.beginPath();
    ctx.rect(X(emb), c - r + 1, X(end) - X(emb), 2 * r - 2);
    ctx.clip();
    const g = ctx.createLinearGradient(X(emb), 0, X(end), 0);
    for (let i = 0; i < s.length; i += 4) g.addColorStop(i / (s.length - 1), rgba(INK.vermilion, 0.1 + 0.75 * Math.abs(s[i]) / scale));
    ctx.fillStyle = g;
    ctx.fillRect(X(emb), c - r, X(end) - X(emb), 2 * r);
    ctx.strokeStyle = rgba(INK.ivory, 0.9);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < s.length; i++) {
      const x = X(emb) + (i / (s.length - 1)) * (X(end) - X(emb));
      const y = c - (s[i] / scale) * (r - 3);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    // standing-wave envelope around the tube: nodes pinch, antinodes swell
    const env = st.env;
    if (env.length !== s.length) st.env = new Float32Array(s.length);
    const A = Math.min(150, Cw * 0.3);
    for (let i = 0; i < s.length; i++) st.env[i] = Math.max(Math.abs(s[i]) / scale, st.env[i] * 0.94);
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      for (let i = 0; i < s.length; i++) {
        const x = X(emb) + (i / (s.length - 1)) * (X(end) - X(emb));
        const y = c + sgn * (r + 4 + st.env[i] * A);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.lineTo(X(end), c + sgn * (r + 4));
      ctx.lineTo(X(emb), c + sgn * (r + 4));
      ctx.closePath();
      ctx.fillStyle = rgba(INK.vermilion, 0.07);
      ctx.fill();
      ctx.strokeStyle = rgba(INK.vermilion, 0.45);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // sounding end marker
    ctx.strokeStyle = rgba(INK.vermilion, 0.6);
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(X(end), c - r * 1.6);
    ctx.lineTo(X(end), c + r * 1.6);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // lip plate, embouchure hole and the jet (the embouchure moves gently with the vibrato)
  ctx.strokeStyle = rgba(INK.ivory, 0.5);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(X(emb), c + vibNow * r * 4, r * 1.6, r * 1.25, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = rgba(INK.ebony, 1);
  ctx.beginPath();
  ctx.ellipse(X(emb), c, r * 0.62, r * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const e = fr?.excite;
  const jetLen = r * 2.6;
  const jx0 = X(emb) - r * 1.5;
  const jy = c - r * 1.9;
  if (e && e.trace.length > 8) {
    // the jet's transverse wave: perturbations from the edge ride the jet at its convection speed
    const tr = e.trace;
    let m = 0;
    for (let i = 0; i < tr.length; i++) m = Math.max(m, Math.abs(tr[i]));
    const sc2 = st.jetScale.of(m);
    const n = Math.min(48, tr.length);
    // the air stream: thicker and brighter as the breath (and its vibrato) pushes
    ctx.strokeStyle = rgba(INK.steel, Math.min(1, 0.55 + 0.4 * blow + 3 * vibNow));
    ctx.lineWidth = 1.2 + 1.6 * blow * (1 + 4 * vibNow);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const v = tr[tr.length - 1 - Math.round(f * (tr.length / 4))] / sc2;
      const x = jx0 + f * jetLen;
      const y = jy + f * (c - jy) * 0.92 + v * f * r * 0.9;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
  } else {
    ctx.strokeStyle = rgba(INK.steel, 0.25);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(jx0, jy);
    ctx.lineTo(jx0 + jetLen, c - 2);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- spectrum hairline
export function drawSpectrum(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, an: AnalyserNode | null, buf: Float32Array, focus: VisualFrame['focus'] | null, family: string): void {
  const f0 = 30;
  const f1 = 12000;
  const X = (f: number) => x0 + (w * Math.log(f / f0)) / Math.log(f1 / f0);
  const dbLo = -115;
  const dbHi = -25;
  const Y = (db: number) => y0 + h * (1 - (db - dbLo) / (dbHi - dbLo));
  ctx.font = '9px "IBM Plex Mono", monospace';
  ctx.fillStyle = rgba(INK.ivory, 0.3);
  for (const [f, t] of [
    [100, '100'],
    [1000, '1k'],
    [10000, '10k'],
  ] as const)
    ctx.fillText(t, X(f) + 3, y0 + h - 2);
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
  pScale: AutoScale;
  env: Float32Array;
  /** where the sound leaves (the bell's mouth), set while drawing */
  src?: { x: number; y: number };
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

/** side view of a B♭ trumpet in the stage's line art (mouthpiece left, bell right): thin tube walls
 *  along the real wrap, the bore's standing pressure wave glowing inside the tube from the lips to
 *  the bell, the lips buzzing at the mouthpiece (their opening from the engine), the pistons the
 *  fingering presses, the valve slides lighting when the air goes through them, and the bell as the
 *  source of the room's wavefronts (st.src) */
export function drawTrumpet(ctx: CanvasRenderingContext2D, W: number, H: number, fr: VisualFrame | null, st: TrumpetState): void {
  const portrait = H > W * 1.05;
  const w = Math.min(W * 0.88, portrait ? W * 0.94 : H * 2.3);
  const u = w / 100; // drawing units
  const x0 = (W - w) / 2;
  const yAx = H * (portrait ? 0.5 : 0.5);
  const P = (x: number, y: number): [number, number] => [x0 + x * u, yAx + y * u];
  const meta = fr?.excite?.meta ?? '';
  const valves = /valves (\S+)/.exec(meta)?.[1] ?? 'open';
  const down = VALVE_DOWN[valves] ?? VALVE_DOWN.open;
  const vx = [42, 50, 58];
  // the air's path, mouthpiece → leadpipe → each valve (down through its slide if pressed) →
  // the main slide loop below → back up to the bell; one polyline, so the wave can run along it
  const path: [number, number][] = [];
  const seg = (a: [number, number], b: [number, number], n: number) => {
    for (let i = path.length ? 1 : 0; i <= n; i++) path.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  };
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) => {
    for (let i = 1; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      path.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  seg([4, 0], [vx[0] - 2, 0], 16);
  for (let k = 0; k < 3; k++) {
    const x = vx[k];
    if (down[k]) {
      // pressed: the air turns down through the valve's slide and back
      const depth = [9, 5, 13][k];
      seg(path[path.length - 1], [x, 0], 2);
      seg([x, 0], [x, depth], 4);
      arc(x + 1.6, depth, 1.6, Math.PI, 0, 5);
      seg([x + 3.2, depth], [x + 3.2, 0], 4);
    } else seg(path[path.length - 1], [x + 3.2, 0], 3);
  }
  // main tuning slide: down, back towards the player, round, and forward to the bell section
  seg(path[path.length - 1], [64, 0], 2);
  arc(64, 9, 9, -Math.PI / 2, Math.PI / 2, 10);
  seg([64, 18], [30, 18], 10);
  arc(30, 9, 9, Math.PI / 2, (3 * Math.PI) / 2, 10);
  seg([30, 0], [30, -10], 3);
  seg([30, -10], [74, -10], 12);
  // the bell section flares from x = 74 to 96
  const bellLen = 22;
  for (let i = 1; i <= 12; i++) path.push([74 + (bellLen * i) / 12, -10]);
  const n = path.length;
  const radius = (i: number) => {
    const x = path[i][0];
    if (i < n - 12) return 0.9;
    const t = (x - 74) / bellLen;
    return 0.9 + 8.5 * Math.pow(t, 3);
  };
  // tube walls: a pale wide stroke with the ground punched through it
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const main = new Path2D();
  path.slice(0, n - 12).forEach(([x, y], i) => (i ? main.lineTo(...P(x, y)) : main.moveTo(...P(x, y))));
  ctx.strokeStyle = rgba(INK.amber, 0.55);
  ctx.lineWidth = 2 * 0.9 * u + 2;
  ctx.stroke(main);
  ctx.strokeStyle = INK.ground;
  ctx.lineWidth = 2 * 0.9 * u - 0.6;
  ctx.stroke(main);
  // slides of valves not in use, faint (the air bypasses them)
  for (let k = 0; k < 3; k++) {
    if (down[k]) continue;
    const x = vx[k];
    const depth = [9, 5, 13][k];
    ctx.strokeStyle = rgba(INK.amber, 0.14);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(...P(x, 1));
    ctx.lineTo(...P(x, depth));
    ctx.arc(...P(x + 1.6, depth), 1.6 * u, Math.PI, 0, true);
    ctx.lineTo(...P(x + 3.2, 1));
    ctx.stroke();
  }
  // the bell: two flaring walls and the rim
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    for (let i = n - 13; i < n; i++) {
      const [x, y] = path[i];
      const q = P(x, y + sgn * radius(i));
      if (i === n - 13) ctx.moveTo(...q);
      else ctx.lineTo(...q);
    }
    ctx.strokeStyle = rgba(INK.amber, 0.6);
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }
  const rim = P(96, -10);
  ctx.beginPath();
  ctx.ellipse(rim[0], rim[1], 1.6 * u, radius(n - 1) * u, 0, 0, Math.PI * 2);
  ctx.strokeStyle = rgba(INK.amber, 0.7);
  ctx.lineWidth = 1.3;
  ctx.stroke();
  st.src = { x: rim[0] + 2 * u, y: rim[1] };
  // the standing pressure wave inside the bore, lips → bell (the engine's own, slowly enveloped)
  const focus = fr?.focus ?? null;
  if (focus && focus.shapes[0]) {
    const s = focus.shapes[0];
    let m = 0;
    for (let i = 0; i < s.length; i++) m = Math.max(m, Math.abs(s[i]));
    const sc = st.pScale.of(m);
    if (st.env.length !== n) st.env = new Float32Array(n);
    // a smoothed amplitude, so the standing wave's nodes stay dark and its antinodes glow
    let em = 0;
    for (let i = 0; i < n; i++) {
      const v = s[Math.min(s.length - 1, Math.round((i / (n - 1)) * (s.length - 1)))] / sc;
      st.env[i] = 0.82 * st.env[i] + 0.18 * Math.abs(v);
      em = Math.max(em, st.env[i]);
    }
    ctx.lineCap = 'butt';
    for (let i = 1; i < n; i++) {
      const e = em > 0 ? st.env[i] / em : 0;
      if (e < 0.06) continue;
      ctx.strokeStyle = rgba(INK.vermilion, 0.08 + 0.5 * e * e);
      ctx.lineWidth = Math.max(1, Math.min(1.4 * u, 0.9 * u * (0.3 + 0.9 * e)));
      ctx.beginPath();
      ctx.moveTo(...P(path[i - 1][0], path[i - 1][1]));
      ctx.lineTo(...P(path[i][0], path[i][1]));
      ctx.stroke();
    }
  }
  // valve casings and pistons (pressed: down, lit)
  vx.forEach((x, k) => {
    const d = down[k] ? 2.2 : 0;
    const c = P(x + 1.6, -3);
    ctx.strokeStyle = rgba(INK.ivory, 0.35);
    ctx.lineWidth = 1;
    ctx.strokeRect(c[0] - 1.6 * u, c[1] - 4 * u, 3.2 * u, 12 * u);
    ctx.strokeStyle = down[k] ? rgba(INK.vermilion, 0.9) : rgba(INK.ivory, 0.55);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(c[0], c[1] - 4 * u + d * u);
    ctx.lineTo(c[0], c[1] - 9 * u + d * u);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(c[0], c[1] - 9.5 * u + d * u, 2 * u, 0.7 * u, 0, 0, Math.PI * 2);
    ctx.fillStyle = down[k] ? rgba(INK.vermilion, 0.75) : rgba(INK.ivory, 0.25);
    ctx.fill();
  });
  // mouthpiece and the lips: the gap is the engine's lip opening (its recent range), the buzz is
  // drawn slowed (the real one is hundreds of times a second)
  const mp = P(2.5, 0);
  ctx.strokeStyle = rgba(INK.ivory, 0.55);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(...P(4, -0.9));
  ctx.lineTo(...P(1.2, -2.6));
  ctx.moveTo(...P(4, 0.9));
  ctx.lineTo(...P(1.2, 2.6));
  ctx.stroke();
  const tr = fr?.excite?.trace;
  let lo = 1;
  let hi = 0;
  if (tr) for (let i = 0; i < tr.length; i += 8) {
    lo = Math.min(lo, tr[i]);
    hi = Math.max(hi, tr[i]);
  }
  const swing = tr ? Math.max(0, hi - lo) : 0;
  const t = performance.now() / 1000;
  const gap = (0.25 + 1.6 * swing * (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 6))) * u;
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(mp[0] - 1.6 * u, mp[1] + sgn * (gap / 2 + 0.9 * u), 1.4 * u, 0.9 * u, 0, 0, Math.PI * 2);
    ctx.fillStyle = swing > 0.02 ? rgba(INK.vermilion, 0.35 + 0.5 * Math.min(1, swing * 2)) : rgba(INK.felt, 0.4);
    ctx.fill();
  }
  ctx.restore();
}
