// The grand on the stage: seen from above with its lid off (grand-inside.jpg), built from the 3D
// grand's own plan (gl/piano3d.ts: `G`, `BASS_ANGLE`, `strikeBeta`, `grandOutline`, `plateGrand`).
// From the keys back: the open fallboard; the gold plate's web over the pin block with its tuning
// pins in three staggered rows, the red understring felt and the agraffes (a capo bar over the top
// treble); the action under the strings, the hammers on the strike line (their shanks show where
// the web stops short); the dampers sitting on the strings 37 mm behind it on their guide rail; the
// soundboard (glued over the belly rail) through the plate's two windows, the copper-wound bass
// crossing the tenor on its own bridge; the struts over the strings, the flange round the rim with
// its rosettes, bolts and hitch pins; the black rim.
//
// x follows the on-screen keyboard: each key's strings and action sit on the action's even pitch
// (88 steps across the 52 white keys, as the 3D model's `actX`, the key sticks fanning to it), so
// a key's strings are above it. z (depth, from the key fronts) runs up the stage at its own scale,
// fitted to the longest visible strings; directions lean twice as much as the true plan would show
// at that scale (`DIR`), so the overstrung bass and the struts read as they do from above.
// Live: hammers rise to the strings (bigger, brighter, lit at contact) and shift with the una corda;
// dampers lift off the strings (their shadows stay), by key, sustain or sostenuto; the struck
// strings light along their speaking length, sympathetic ones faintly amber; a strike flares where
// the hammer meets the strings; the board's modes glow in the plate's windows.
import type { VisualFrame } from '@piano-model/engine';
import type { PianoState, Pt } from './piano-draw.ts';
import { INK, type ModeField, rgba } from './stage-draw.ts';

type P = [number, number];

/** the 3D grand's plan (metres; z from the key fronts towards the tail) */
const GZ = {
  /** the stage's bottom edge: just behind the key tops, under the open fallboard */
  front: 0.15,
  fall: 0.212,
  plate: 0.195,
  pinBlock: 0.334,
  strike: 0.47,
  /** the dampers, 37 mm behind the strike line, over their guide rail (z 0.494–0.52) */
  damper: 0.507,
  rail: 0.494,
  /** the soundboard, glued over the belly rail from 30 mm in front of its back face */
  board: 0.52,
  flange: 0.035,
  hitch: 0.075,
  shank: 0.13,
  hamZ: 0.34,
  blow: 0.047,
  /** half a hammer head's depth along the shank, and its width (m) */
  headHalf: 0.0145,
  headW: 0.0116,
  damperW: 0.0124,
  /** the una corda: the action moves 2.5 mm towards the treble */
  shift: 0.0025,
  /** a damper's lift at the head (m) */
  lift: 0.0095,
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
/** colours: the 3D materials (gl/mesh.ts), as the upright's stage drawing has them */
const C = {
  lacquer: '14,12,11',
  sheen: '120,112,102',
  plate: '170,128,60',
  plateLit: '236,198,122',
  plateDark: '92,66,28',
  board: '196,160,108',
  maple: '168,122,72',
  bridge: '142,98,56',
  hornbeam: '230,212,172',
  hFelt: '238,231,214',
  head: '30,26,23',
  red: '160,44,36',
  green: '44,96,72',
  pin: '206,210,216',
  brass: '214,176,101',
};
const SYM_VISIBLE = 0.03;

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
function inPoly(p: P, poly: P[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const path = (ps: P[], close = true, into = new Path2D()) => {
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
  aZ: number;
  bZ: number;
  a: P;
  b: P;
  hitch: P;
  off: number[];
  pins: P[];
  /** the front row of tuning pins (z) */
  pinZ: number;
  webZ: number;
  /** the head's depth scale (bass heads are bigger) */
  hs: number;
}
interface Layout {
  key: string;
  Y: (z: number) => number;
  sv: number;
  pxm: number;
  pitch: number;
  strs: GStr[];
  at: (s: GStr, z: number) => number;
  under: HTMLCanvasElement;
  over: HTMLCanvasElement;
  board: Path2D;
  outline: Path2D;
  outer: P[];
  struts: Path2D;
  strutLit: Path2D;
  box: { x0: number; x1: number; y0: number; y1: number };
}
let cache: Layout | null = null;

/** where the stage's top edge sits in depth: the rim's tail when the whole keyboard shows; on a
 *  narrow screen, a little past the longest visible strings */
export function grandDepth(W: number, pts: Pt[]): number {
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
  const strs: GStr[] = pts.map((p) => {
    const beta = strikeBeta(p.midi);
    const L = Math.max(0.04, p.L);
    const c = p.wound ? Math.cos(BASS_ANGLE) : 1;
    const x = kx0 + (p.i + 0.5) * pitch;
    const ln = p.wound ? tanB * sv : 0;
    const aZ = GZ.strike - c * beta * L;
    const bZ = aZ + c * L;
    const at = (z: number) => x + (z - GZ.strike) * ln;
    const n = Math.max(1, p.k.nStrings);
    const sp = pitch * (p.wound ? 0.3 : 0.245);
    const off = Array.from({ length: n }, (_, j) => (j - (n - 1) / 2) * sp);
    const webZ = Math.min(aZ - 0.008, GZ.strike - 0.016);
    // three staggered rows of tuning pins, the front row 15.5 cm ahead of the web's edge
    const pinZ = Math.max(0.222, Math.min(0.27, webZ - 0.155));
    const pins = off.map((o, j): P => [at(aZ) + o, Y(pinZ + 0.024 * j + 0.012 * (p.i % 2))]);
    const hz = bZ + c * GZ.hitch;
    return { p, x, lean: ln, aZ, bZ, a: [at(aZ), Y(aZ)], b: [at(bZ), Y(bZ)], hitch: [at(hz), Y(hz)], off, pins, pinZ, webZ, hs: 1.22 - 0.38 * ((p.midi - 21) / 87) };
  });
  const at = (s: GStr, z: number) => s.x + (z - GZ.strike) * s.lean;
  const bass = strs.filter((s) => s.p.wound);
  const treb = strs.filter((s) => !s.p.wound);
  // ---- the case: the rim's outer face, and its inner face a rim's thickness in (on screen)
  const outer: P[] = catmull(OUTLINE, 8).map(([x, z]): P => [X(x), Y(z)]);
  outer[0][1] = yF + 2;
  outer[outer.length - 1][1] = yF + 2;
  const rimPx = Math.max(5, Math.min(13, 0.068 * sv * 0.7));
  const inner: P[] = outer.map((q, i) => {
    const a = outer[Math.max(0, i - 1)];
    const b = outer[Math.min(outer.length - 1, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    // (on screen the outline runs up the treble side, over the tail, down the spine: inward is to
    // the left of travel, y pointing down)
    return [q[0] + (ty / l) * rimPx, q[1] - (tx / l) * rimPx];
  });
  const xMin = Math.min(...outer.map((q) => q[0]));
  const xMax = Math.max(...outer.map((q) => q[0]));
  const yTail = Math.min(...outer.map((q) => q[1]));
  const outline = path(outer);
  const innerPath = path(inner);
  const clipBelow = (poly: P[], y: number): P[] => {
    // the part of a closed polygon above (behind) the line y (screen y smaller)
    const out: P[] = [];
    for (let i = 0; i < poly.length; i++) {
      const p0 = poly[i];
      const p1 = poly[(i + 1) % poly.length];
      const in0 = p0[1] <= y;
      const in1 = p1[1] <= y;
      if (in0) out.push(p0);
      if (in0 !== in1) {
        const t = (y - p0[1]) / (p1[1] - p0[1]);
        out.push([p0[0] + (p1[0] - p0[0]) * t, y]);
      }
    }
    return out;
  };
  const boardPoly = clipBelow(inner, Y(GZ.board));
  const board = path(boardPoly);
  // ---- the plate's windows (as the 3D plate: the bass window, the treble window right of the
  //      bass strut), in stage px
  const mm = pxm / 1000;
  const backPt = (s: GStr): P => {
    const z = s.bZ + (s.p.wound ? Math.cos(BASS_ANGLE) : 1) * GZ.flange;
    return [at(s, z), Y(z)];
  };
  const xIn = (y: number) => {
    // the rim's inner face on the spine side at height y
    let best = xMin;
    for (let i = inner.length - 1; i > inner.length / 2; i--) {
      const q0 = inner[i];
      const q1 = inner[i - 1];
      if ((q0[1] - y) * (q1[1] - y) <= 0) {
        best = q0[0] + ((q1[0] - q0[0]) * (y - q0[1])) / (q1[1] - q0[1] || 1);
        break;
      }
    }
    return best;
  };
  const xInR = (y: number) => {
    let best = xMax;
    for (let i = 0; i < inner.length / 2; i++) {
      const q0 = inner[i];
      const q1 = inner[i + 1];
      if ((q0[1] - y) * (q1[1] - y) <= 0) {
        best = q0[0] + ((q1[0] - q0[0]) * (y - q0[1])) / (q1[1] - q0[1] || 1);
        break;
      }
    }
    return best;
  };
  const windows: P[][] = [];
  const g45 = bass[bass.length - 1];
  const g21 = bass[0];
  const lineAtY = (s: GStr, y: number) => at(s, GZ.front + (yF - y) / sv);
  if (bass.length > 1) {
    const w: P[] = [];
    for (const s of bass) w.push([Math.max(xIn(Y(s.webZ)) + 4, s.a[0] - (s === g21 ? 16 * mm : 0)), Y(s.webZ)]);
    w.push([g45.a[0] + 6 * mm, Y(g45.webZ)]);
    const e45 = backPt(g45);
    for (let k = 1; k <= 6; k++) {
      const y = Y(g45.webZ) + (e45[1] - Y(g45.webZ)) * (k / 6);
      w.push([lineAtY(g45, y) + 6 * mm, y]);
    }
    for (let k = bass.length - 2; k >= 0; k--) w.push(backPt(bass[k]));
    const e21 = backPt(g21);
    for (let k = 1; k <= 6; k++) {
      const y = e21[1] + (Y(g21.webZ) - e21[1]) * (k / 6);
      w.push([Math.max(xIn(y) + 4, lineAtY(g21, y) - 16 * mm), y]);
    }
    windows.push(w);
  }
  const g46 = treb[0];
  const xLeft = (y: number) => Math.max(g46.a[0] - 16 * mm, g45 ? lineAtY(g45, y) + 32 * mm : -Infinity);
  const tIn = treb.filter((s) => backPt(s)[0] > xLeft(backPt(s)[1]) + 6 * mm);
  const gTop = treb[treb.length - 1];
  {
    const w: P[] = [[xLeft(Y(g46.webZ)), Y(g46.webZ)]];
    for (const s of treb) w.push([s.a[0], Y(s.webZ)]);
    const xr = Math.min(xInR(Y(gTop.webZ)) - 6, gTop.a[0] + 30 * mm);
    w.push([xr, Y(gTop.webZ)]);
    w.push([xr, backPt(gTop)[1]]);
    for (let k = tIn.length - 1; k >= 0; k--) w.push(backPt(tIn[k]));
    const yl = backPt(tIn[0])[1];
    for (let k = 1; k < 12; k++) {
      const y = yl + (Y(g46.webZ) - yl) * (k / 12);
      w.push([xLeft(y), y]);
    }
    windows.push(w);
  }
  // the tenor strings whose ends lie under the bass hitch on the tenor hitch bar (a window of
  // their own between the bass strut and the bass bridge's ends is closed by the bar)
  // ---- rosettes: the plate's big round lightening holes where its flange is widest
  const hitchPts = strs.map((s) => s.hitch);
  const rosettes: { c: P; r: number }[] = [];
  {
    const cands: { c: P; r: number; w: number }[] = [];
    const step = 3;
    for (let i = step; i < inner.length - step; i += step) {
      const q = inner[i];
      if (q[1] > Y(0.8) || q[0] < -60 || q[0] > W + 60) continue;
      const a = inner[i - step];
      const b = inner[i + step];
      const tx = b[0] - a[0];
      const ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      const n: P = [ty / l, -tx / l];
      let w = 0;
      while (w < 160) {
        const pt: P = [q[0] + n[0] * w, q[1] + n[1] * w];
        if (hitchPts.some((h) => Math.abs(h[0] - pt[0]) < 8 && Math.abs(h[1] - pt[1]) < 8) || windows.some((win) => inPoly(pt, win))) break;
        w += 4;
      }
      const r = Math.min(Math.max(7, 0.045 * sv), (w - 12) / 2);
      if (r < 6) continue;
      const d = 5 + r + (w - 12 - 2 * r) * 0.4;
      cands.push({ c: [q[0] + n[0] * d, q[1] + n[1] * d], r, w });
    }
    cands.sort((p, q) => q.w - p.w);
    for (const cd of cands) {
      if (rosettes.length >= 4) break;
      if (cd.c[0] < -40 || cd.c[0] > W + 40) continue;
      if (rosettes.some((o) => Math.hypot(o.c[0] - cd.c[0], o.c[1] - cd.c[1]) < o.r + cd.r + 0.12 * sv)) continue;
      rosettes.push(cd);
    }
  }
  // ---- struts over the strings: the bass strut between the windows, three across the treble
  const struts = new Path2D();
  const strutLit = new Path2D();
  const strutW = Math.max(5, Math.min(0.018 * pxm, 1.15 * pitch));
  const strut = (p0: P, p1: P) => {
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * (strutW / 2);
    const ny = (dx / l) * (strutW / 2);
    // a beam with rounded ends, flaring a little where it springs from the web and the flange
    const a = Math.atan2(dy, dx);
    const f = 1.5;
    struts.moveTo(p0[0] - nx * f, p0[1] - ny * f);
    struts.quadraticCurveTo(p0[0] - nx + dx * 0.12, p0[1] - ny + dy * 0.12, p0[0] - nx + dx * 0.25, p0[1] - ny + dy * 0.25);
    struts.lineTo(p1[0] - nx - dx * 0.2, p1[1] - ny - dy * 0.2);
    struts.quadraticCurveTo(p1[0] - nx - dx * 0.08, p1[1] - ny - dy * 0.08, p1[0] - nx * f, p1[1] - ny * f);
    struts.lineTo(p1[0] + nx * f, p1[1] + ny * f);
    struts.quadraticCurveTo(p1[0] + nx - dx * 0.08, p1[1] + ny - dy * 0.08, p1[0] + nx - dx * 0.2, p1[1] + ny - dy * 0.2);
    struts.lineTo(p0[0] + nx + dx * 0.25, p0[1] + ny + dy * 0.25);
    struts.quadraticCurveTo(p0[0] + nx + dx * 0.12, p0[1] + ny + dy * 0.12, p0[0] + nx * f, p0[1] + ny * f);
    struts.closePath();
    void a;
    // its rounded crown catches the light along one line
    strutLit.moveTo(p0[0] - nx * 0.35, p0[1] - ny * 0.35);
    strutLit.lineTo(p1[0] - nx * 0.35, p1[1] - ny * 0.35);
  };
  if (g45) {
    const z0 = g45.webZ - 0.01;
    const y1 = backPt(tIn[0])[1] - 0.015 * sv;
    strut([lineAtY(g45, Y(z0)) + 19 * mm, Y(z0)], [lineAtY(g45, y1) + 19 * mm, y1]);
  }
  for (const [ma, ang] of [[58, 0.06], [70, 0.16], [84, 0.3]] as P[]) {
    const s0 = strs[ma - 21];
    const s1 = strs[ma - 20];
    if (!s0 || !s1) continue;
    const x0 = (s0.x + s1.x) / 2;
    const y0 = Y(Math.min(s0.webZ, s1.webZ) - 0.01);
    const a = lean(ang);
    const d: P = [Math.sin(a), -Math.cos(a)];
    let t = 0.1 * sv;
    const inside = (u: number) => inPoly([x0 + d[0] * u, y0 + d[1] * u], windows[windows.length - 1]);
    while (t < 3 * H && inside(t) === inside(t - 4)) t += 2;
    t += 0.06 * sv;
    strut([x0, y0], [x0 + d[0] * t, y0 + d[1] * t]);
  }
  // ---- the cached layers
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * dpr));
    c.height = Math.max(1, Math.round(H * dpr));
    const x = c.getContext('2d')!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, x };
  };
  // under the plate and the strings: the rim, the soundboard and its ribs, the action's well, the
  // pin block and the damper guide rail
  const { c: under, x: u } = mk();
  {
    u.fillStyle = rgba(C.lacquer, 1);
    u.fill(outline);
    u.save();
    u.clip(innerPath);
    u.fillStyle = rgba('8,7,6', 1);
    u.fill(innerPath);
    // the soundboard: spruce, its grain running from the bass front towards the bentside
    u.fillStyle = rgba(C.board, 0.1);
    u.fill(board);
    u.save();
    u.clip(board);
    u.strokeStyle = rgba(C.board, 0.07);
    u.lineWidth = 1;
    const gx = Math.sin(lean(0.43));
    const gy = -Math.cos(lean(0.43));
    for (let k = -H * 3; k < W + H * 3; k += 5) {
      u.beginPath();
      u.moveTo(k, yF);
      u.lineTo(k + gx * H * 4, yF + gy * H * 4);
      u.stroke();
    }
    // its ribs underneath, across the grain, 13.5 cm apart (seen through the board as shade)
    u.strokeStyle = rgba('0,0,0', 0.16);
    u.lineWidth = Math.max(2, 0.023 * sv * 0.8);
    const rx = -gy;
    const ry = gx;
    const span = (W + H) * 3;
    for (let t = 0.32; t < 2.6; t += 0.135) {
      const cx = X(-0.672) + gx * t * sv * 1.4;
      const cy = Y(GZ.board) + gy * t * sv;
      u.beginPath();
      u.moveTo(cx - rx * span, cy - ry * span);
      u.lineTo(cx + rx * span, cy + ry * span);
      u.stroke();
    }
    u.restore();
    // the pin block (laminated maple) and, behind it, the action's well
    u.fillStyle = rgba(C.maple, 0.3);
    u.fillRect(xMin, Y(GZ.pinBlock), xMax - xMin, Y(GZ.plate) - Y(GZ.pinBlock));
    // the hammer rest rail's green cloth under the shanks
    u.fillStyle = rgba(C.green, 0.4);
    u.fillRect(xMin, Y(0.448), xMax - xMin, Math.max(1, 0.02 * sv));
    // the damper guide rail (hornbeam, on the belly rail's face)
    u.fillStyle = rgba(C.hornbeam, 0.2);
    u.fillRect(xMin, Y(GZ.board), xMax - xMin, Y(GZ.rail) - Y(GZ.board));
    u.fillStyle = rgba(C.hornbeam, 0.35);
    u.fillRect(xMin, Y(GZ.board) - 0.5, xMax - xMin, 1);
    u.restore();
  }
  // over the action: the plate, felts, bridges, the strings at rest, agraffes and pins, the fallboard
  const { c: over, x: o } = mk();
  {
    o.save();
    o.clip(innerPath);
    // the plate: gold lacquer over cast iron, its windows and rosettes cut out
    const plateOuter = clipBelow(inner.map(([x, y]): P => [x, y]), Y(GZ.plate));
    const plate = path(plateOuter);
    for (const w of windows) path(w, true, plate);
    for (const r of rosettes) {
      plate.moveTo(r.c[0] + r.r, r.c[1]);
      plate.arc(r.c[0], r.c[1], r.r, 0, Math.PI * 2);
    }
    const gr = o.createLinearGradient(0, yTail, 0, yF);
    gr.addColorStop(0, rgba(C.plate, 0.36));
    gr.addColorStop(0.75, rgba(C.plate, 0.42));
    gr.addColorStop(1, rgba('196,150,70', 0.55));
    o.fillStyle = gr;
    o.fill(plate, 'evenodd');
    // the casting's raised lips round the windows and holes: lit on the far side, shaded on the near
    o.lineJoin = 'round';
    for (const w of windows) {
      const wp = path(w);
      // the lip's shadow falls into the window
      o.save();
      o.clip(wp);
      o.strokeStyle = rgba('0,0,0', 0.35);
      o.lineWidth = 12;
      o.stroke(wp);
      o.restore();
      o.strokeStyle = rgba(C.plateDark, 0.7);
      o.lineWidth = 3;
      o.stroke(wp);
      o.strokeStyle = rgba(C.plateLit, 0.55);
      o.lineWidth = 1.1;
      o.stroke(wp);
    }
    for (const r of rosettes) {
      o.strokeStyle = rgba(C.plateDark, 0.75);
      o.lineWidth = 3.2;
      o.beginPath();
      o.arc(r.c[0], r.c[1], r.r + 1, 0, Math.PI * 2);
      o.stroke();
      o.strokeStyle = rgba(C.plateLit, 0.6);
      o.lineWidth = 1.2;
      o.beginPath();
      o.arc(r.c[0], r.c[1], r.r + 1.5, Math.PI * 0.9, Math.PI * 2.1);
      o.stroke();
      // the soundboard seen through the hole
      o.fillStyle = rgba(C.board, 0.1);
      o.beginPath();
      o.arc(r.c[0], r.c[1], r.r, 0, Math.PI * 2);
      o.fill();
    }
    // the raised flange where the plate sits on the rim
    o.strokeStyle = rgba(C.plateLit, 0.32);
    o.lineWidth = 1;
    o.stroke(path(plateOuter.map(([x, y]): P => [x, y]), false));
    // bolts into the rim: nickel nuts on cast bosses round the flange, about 25 cm apart
    {
      let acc = 0;
      const every = Math.max(36, 0.25 * sv * 1.4);
      for (let i = 1; i < inner.length - 1; i++) {
        const q = inner[i];
        acc += Math.hypot(q[0] - inner[i - 1][0], q[1] - inner[i - 1][1]);
        if (acc < every || q[1] > Y(0.45)) continue;
        const a = inner[i - 1];
        const b = inner[i + 1];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const c: P = [q[0] + ((b[1] - a[1]) / l) * 9, q[1] - ((b[0] - a[0]) / l) * 9];
        if (windows.some((w) => inPoly(c, w)) || rosettes.some((r) => Math.hypot(r.c[0] - c[0], r.c[1] - c[1]) < r.r + 8) || hitchPts.some((h) => Math.hypot(h[0] - c[0], h[1] - c[1]) < 6)) continue;
        acc = 0;
        o.fillStyle = rgba(C.plateDark, 0.8);
        o.beginPath();
        o.arc(c[0] + 0.6, c[1] + 0.6, 3.6, 0, Math.PI * 2);
        o.fill();
        o.fillStyle = rgba(C.pin, 0.45);
        o.beginPath();
        o.arc(c[0], c[1], 2, 0, Math.PI * 2);
        o.fill();
      }
    }
    // the bridges on the board: the long treble bridge and the bass bridge (maple, graphited caps)
    for (const part of [treb, bass]) {
      if (part.length < 2) continue;
      const pts2 = catmull(part.filter((_, k) => k % 3 === 0 || k === part.length - 1).map((s) => s.b), 4);
      o.lineCap = 'round';
      o.strokeStyle = rgba(C.bridge, 0.85);
      o.lineWidth = Math.max(3, 0.026 * sv);
      o.stroke(path(pts2, false));
      o.strokeStyle = rgba('60,52,44', 0.9);
      o.lineWidth = Math.max(1, 0.008 * sv);
      o.stroke(path(pts2, false));
    }
    // the hitch felts (red, woven along the hitch pins) and the hitch pins
    for (const part of [tIn, bass]) {
      if (part.length < 2) continue;
      const hp = part.map((s): P => {
        const z = s.bZ + (s.p.wound ? Math.cos(BASS_ANGLE) : 1) * 0.052;
        return [at(s, z), Y(z)];
      });
      o.strokeStyle = rgba(C.red, 0.6);
      o.lineWidth = Math.max(1.5, 0.012 * sv);
      o.stroke(path(hp, false));
    }
    o.fillStyle = rgba(C.pin, 0.6);
    for (const s of strs) for (const off of s.off) o.fillRect(s.hitch[0] + off - 0.8, s.hitch[1] - 0.8, 1.6, 1.6);
    // the strings at rest: steel trebles, copper-wound basses over their steel cores; the bass
    // crosses over the tenor. Before the agraffe and past the bridge they are dead lengths, quieter
    for (const part of [treb, bass]) {
      for (const s of part) {
        if (s.x < -W && s.x > 2 * W) continue;
        for (const [j, off] of s.off.entries()) {
          o.strokeStyle = rgba(INK.ivory, 0.13);
          o.lineWidth = 0.6;
          o.beginPath();
          o.moveTo(s.pins[j][0], s.pins[j][1]);
          o.lineTo(s.a[0] + off, s.a[1]);
          o.moveTo(s.b[0] + off, s.b[1]);
          o.lineTo(s.hitch[0] + off, s.hitch[1]);
          o.stroke();
          o.strokeStyle = rgba(INK.ivory, 0.3);
          o.lineWidth = 0.65;
          o.beginPath();
          o.moveTo(s.a[0] + off, s.a[1]);
          o.lineTo(s.b[0] + off, s.b[1]);
          o.stroke();
          if (s.p.wound) {
            const e = 0.04;
            o.strokeStyle = rgba(INK.copper, 0.62);
            o.lineWidth = Math.min(2.4, Math.max(1, (0.0018 + 0.0032 * Math.min(1, (45 - s.p.midi) / 24)) * pxm * 0.9));
            o.beginPath();
            o.moveTo(s.a[0] + off + (s.b[0] - s.a[0]) * e, s.a[1] + (s.b[1] - s.a[1]) * e);
            o.lineTo(s.b[0] + off - (s.b[0] - s.a[0]) * e, s.b[1] - (s.b[1] - s.a[1]) * e);
            o.stroke();
          }
        }
      }
    }
    // the red understring felt just behind the pins, under every string
    for (const part of [bass, treb]) {
      if (part.length < 2) continue;
      // (as the 3D: 4 cm behind each key's back row, the running max over seven keys eased over
      // nine, so a step in the pin field is a gentle bend; clear of the pins and the agraffes)
      const own = part.map((s) => s.pinZ + 0.024 * (s.off.length - 1) + 0.012 * (s.p.i % 2));
      const z = part.map((s, k) => own[k] - 0.012 * (s.p.i % 2) + 0.04);
      const rm = z.map((_, k) => Math.max(...z.slice(Math.max(0, k - 3), k + 4)));
      const fl = part.map((s, k): P => {
        const w = rm.slice(Math.max(0, k - 4), k + 5);
        const fz = Math.min(Math.max(w.reduce((a, b) => a + b, 0) / w.length, own[k] + 0.012), s.aZ - 0.014);
        return [at(s, s.aZ), Y(fz)];
      });
      o.strokeStyle = rgba(C.red, 0.85);
      o.lineWidth = Math.max(2, 0.012 * sv);
      o.lineCap = 'butt';
      o.stroke(path(fl, false));
    }
    // agraffes (brass studs, the unison through them) and, over the top treble, the capo bar
    for (const s of strs) {
      if (s.p.midi >= 74) continue;
      const w = (s.off[s.off.length - 1] - s.off[0]) + 7 * mm;
      o.fillStyle = rgba(C.brass, 0.85);
      o.beginPath();
      o.roundRect(s.a[0] - w / 2, s.a[1], w, Math.max(2, 0.0085 * sv), 1);
      o.fill();
    }
    const capo = strs.filter((s) => s.p.midi >= 74);
    if (capo.length > 1) {
      const cp = capo.map((s): P => [s.a[0], s.a[1] + 0.012 * sv]);
      cp.unshift([cp[0][0] - 20 * mm, cp[0][1]]);
      cp.push([Math.min(xInR(cp[cp.length - 1][1]) - 4, cp[cp.length - 1][0] + 30 * mm), cp[cp.length - 1][1]]);
      o.lineCap = 'round';
      o.strokeStyle = rgba(C.plateDark, 0.9);
      o.lineWidth = Math.max(3, 0.03 * sv);
      o.stroke(path(cp, false));
      o.strokeStyle = rgba(C.plateLit, 0.55);
      o.lineWidth = 1;
      o.stroke(path(cp.map(([x, y]): P => [x, y - Math.max(1, 0.008 * sv)]), false));
    }
    // tuning pins: nickel heads in their staggered rows, each with a bright coil
    const pr = Math.max(1, Math.min(2.2, pitch * 0.13));
    o.fillStyle = rgba('0,0,0', 0.5);
    for (const s of strs)
      for (const [x, y] of s.pins) {
        o.beginPath();
        o.arc(x + 0.5, y + 0.6, pr, 0, Math.PI * 2);
        o.fill();
      }
    o.fillStyle = rgba(C.pin, 0.78);
    for (const s of strs)
      for (const [x, y] of s.pins) {
        o.beginPath();
        o.arc(x, y, pr, 0, Math.PI * 2);
        o.fill();
      }
    o.fillStyle = rgba('255,255,255', 0.55);
    for (const s of strs) for (const [x, y] of s.pins) o.fillRect(x - pr * 0.45, y - pr * 0.55, pr * 0.7, pr * 0.4);
    o.restore();
    // the rim's edges: the lacquer catching the light along its top, the inner veneer's line
    o.lineJoin = 'round';
    o.strokeStyle = rgba(C.sheen, 0.75);
    o.lineWidth = 1.2;
    o.stroke(outline);
    o.strokeStyle = rgba('92,52,34', 0.6);
    o.lineWidth = 1;
    o.stroke(innerPath);
    // the open fallboard over the key ends: black lacquer, its rounded top lit
    const yf0 = Y(GZ.fall);
    const fg = o.createLinearGradient(0, yf0, 0, yF);
    fg.addColorStop(0, rgba(C.sheen, 0.95));
    fg.addColorStop(0.12, rgba('40,36,32', 0.97));
    fg.addColorStop(0.6, rgba(C.lacquer, 0.97));
    fg.addColorStop(1, rgba('30,27,24', 0.97));
    o.fillStyle = fg;
    o.fillRect(xMin, yf0, xMax - xMin, yF - yf0);
  }
  cache = { key, Y, sv, pxm, pitch, strs, at, under, over, board, outline, outer, struts, strutLit, box: { x0: xMin, x1: xMax, y0: yTail, y1: H - 2 } };
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
  const { Y, sv, pxm, pitch, strs } = lay;
  const vis = (s: GStr) => s.x > -pitch * 2 && s.x < W + pitch * 2;
  ctx.drawImage(lay.under, 0, 0, W, H);
  // ---- the board's live modes, under the plate (they show in its windows)
  const fl = field.update(fr?.modes ?? null, now / 1000);
  if (fl > 0.01) {
    ctx.save();
    ctx.clip(lay.board);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.13;
    const y0 = Y(2.15);
    ctx.drawImage(field.canvas, lay.box.x0, y0, lay.box.x1 - lay.box.x0, Y(GZ.board) - y0);
    ctx.restore();
  }
  // ---- the hammers under the strings: shanks from the flange rail, heads on the strike line. A
  //      strike carries the head up to the strings (towards the viewer: it grows and brightens; the
  //      shank's arc draws it 8 mm towards the keys); the una corda slides the action to the treble
  const sh = st.shift * GZ.shift * pxm;
  const shankW = Math.max(1, pitch * 0.42);
  ctx.strokeStyle = rgba(C.hornbeam, 0.32);
  ctx.lineWidth = shankW;
  ctx.beginPath();
  for (const s of strs) {
    if (!vis(s)) continue;
    const a = Math.atan2(st.hammer[s.p.i] * GZ.blow, GZ.shank);
    const zh = GZ.hamZ + GZ.shank * Math.cos(a);
    ctx.moveTo(s.x + sh, Y(GZ.pinBlock));
    ctx.lineTo(s.x + sh, Y(zh - GZ.headHalf));
  }
  ctx.stroke();
  const hw = (GZ.headW / 0.0139) * pitch;
  for (const s of strs) {
    if (!vis(s)) continue;
    const h = st.hammer[s.p.i];
    const a = Math.atan2(h * GZ.blow, GZ.shank);
    const zh = GZ.hamZ + GZ.shank * Math.cos(a);
    const grow = 1 + 0.16 * h;
    const w = hw * grow;
    const d = 2 * GZ.headHalf * s.hs * sv * grow;
    const x = s.x + sh;
    const y = Y(zh);
    const flash = h > 0.6 ? (h - 0.6) / 0.4 : 0;
    // its shadow on the action below, left behind as it rises
    if (h > 0.05) {
      ctx.fillStyle = rgba('0,0,0', 0.35 * h);
      ctx.fillRect(x - w / 2 + 2 * h, y - d / 2 + 2.5 * h, w, d);
    }
    ctx.fillStyle = flash > 0.02 ? rgba(INK.vermilion, 0.6 + 0.4 * flash) : rgba(C.hFelt, 0.5 + 0.35 * h);
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - d / 2, w, d, Math.min(w, d) * 0.4);
    ctx.fill();
    // the crown: the felt's highest line, across the head
    ctx.fillStyle = flash > 0.02 ? rgba('255,214,190', 0.8 * flash) : rgba('255,250,240', 0.3 + 0.5 * h);
    ctx.fillRect(x - w / 2 + 1, y - Math.max(0.6, d * 0.08), w - 2, Math.max(1.2, d * 0.16));
  }
  ctx.drawImage(lay.over, 0, 0, W, H);
  // ---- the sounding strings light along their speaking length (sympathetic ones amber, faintly)
  st.hits = [];
  ctx.lineCap = 'butt';
  for (const part of [false, true]) {
    for (const s of strs) {
      if (s.p.wound !== part) continue;
      const p = s.p;
      if (s.b[0] < -p.w * 2 && s.a[0] < -p.w * 2) continue;
      if (s.b[0] > W + p.w * 2 && s.a[0] > W + p.w * 2) continue;
      st.hits.push({ midi: p.midi, x0: s.a[0], y0: s.a[1], x1: s.b[0], y1: s.b[1], w: p.w });
      const l = lv.l(p.i);
      const sym = lv.s(p.i);
      if (l <= 0.02 && sym <= SYM_VISIBLE) continue;
      const struck = l >= sym;
      if (struck) {
        // a soft bloom under the unison, then each wire lit
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(INK.vermilion, 0.1 * l);
        ctx.lineWidth = Math.max(3, pitch * 0.5);
        ctx.beginPath();
        ctx.moveTo(s.a[0], s.a[1]);
        ctx.lineTo(s.b[0], s.b[1]);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.strokeStyle = struck ? rgba(INK.vermilion, 0.2 + 0.75 * l) : rgba(INK.amber, 0.06 + 0.42 * sym);
      ctx.lineWidth = struck ? 0.8 + 0.8 * l : 0.8;
      ctx.beginPath();
      for (const off of s.off) {
        ctx.moveTo(s.a[0] + off, s.a[1]);
        ctx.lineTo(s.b[0] + off, s.b[1]);
      }
      ctx.stroke();
    }
  }
  // ---- the dampers on the strings, over their guide rail: black heads with a chamfered top and a
  //      brass boss. Lifted (by the key, the sustain pedal's tray or the sostenuto) they rise 9.5 mm
  //      towards the viewer: the head grows, lightens, moves up-left; its shadow stays on the strings
  const dw = (GZ.damperW / 0.0139) * pitch;
  for (const s of strs) {
    if (!s.p.k.hasDamper || !vis(s)) continue;
    const d = st.damper[s.p.i];
    const len = (s.p.wound ? 0.034 : 0.028) * sv;
    const cx = lay.at(s, GZ.damper);
    const cy = Y(GZ.damper);
    const up = d * GZ.lift * sv * 0.9;
    const grow = 1 + 0.12 * d;
    const w = dw * grow;
    const hgt = len * grow;
    ctx.save();
    ctx.translate(cx, cy);
    if (s.p.wound) ctx.rotate(Math.atan(s.lean / sv));
    // its shadow on the strings (left behind as it rises)
    ctx.fillStyle = rgba('0,0,0', 0.4 + 0.25 * d);
    ctx.fillRect(-dw / 2 + 0.6 + 0.8 * up, -len / 2 + 0.8 + 0.6 * up, dw, len);
    ctx.translate(-0.35 * up, -0.7 * up);
    // the head (lacquered wood, as the 3D `damperHead`): its top chamfered front and back to a flat
    // between them; lit from the tail, so the back chamfer is bright and the front one dark
    const x0 = -w / 2;
    const y0 = -hgt / 2;
    ctx.fillStyle = rgba(C.head, 1);
    ctx.fillRect(x0, y0, w, hgt);
    ctx.fillStyle = rgba(C.sheen, 0.5 + 0.3 * d);
    ctx.fillRect(x0, y0, w, hgt * 0.25);
    ctx.fillStyle = rgba('52,46,41', 1);
    ctx.fillRect(x0, y0 + hgt * 0.25, w, hgt * 0.5);
    // lifted: the head glows amber at its edge, as in 3D
    if (d > 0.05) {
      ctx.strokeStyle = rgba(INK.amber, 0.25 + 0.6 * d);
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 - 0.5, y0 - 0.5, w + 1, hgt + 1);
    }
    // the wire's brass boss in the middle
    ctx.fillStyle = rgba(C.brass, 0.7 + 0.3 * d);
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(0.8, Math.min(w * 0.16, 0.0024 * pxm)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // ---- the struts, over strings and dampers
  // (raised over the strings: each casts a shadow to the lower right)
  ctx.save();
  ctx.translate(3, 4);
  ctx.fillStyle = rgba('0,0,0', 0.4);
  ctx.fill(lay.struts);
  ctx.restore();
  ctx.fillStyle = rgba('150,112,52', 0.97);
  ctx.fill(lay.struts);
  ctx.strokeStyle = rgba(C.plateDark, 0.95);
  ctx.lineWidth = 1;
  ctx.stroke(lay.struts);
  ctx.strokeStyle = rgba(C.plateLit, 0.6);
  ctx.lineWidth = 1.3;
  ctx.stroke(lay.strutLit);
  // ---- a strike flares where the hammer meets the strings
  ctx.globalCompositeOperation = 'lighter';
  for (const s of strs) {
    const t = st.strikes.get(s.p.midi);
    if (t === undefined || !vis(s)) continue;
    const age = (now - t) / 240;
    if (age < 0 || age > 1) continue;
    const v = (st.vels.get(s.p.midi) ?? 64) / 127;
    const r = (0.6 + 0.9 * v) * pitch * (0.8 + 0.6 * age);
    const a = (1 - age) ** 2 * (0.35 + 0.5 * v);
    const x = s.x + sh;
    const y = Y(GZ.strike);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba('255,200,160', a));
    g.addColorStop(0.35, rgba(INK.vermilion, a * 0.6));
    g.addColorStop(1, rgba(INK.vermilion, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  ctx.globalCompositeOperation = 'source-over';
  // ---- the lid: hinged on the spine, it rises towards the viewer and is seen foreshortened;
  //      closed, it covers the strings
  const { x0: xL, x1: xR, y0: yTop, y1: yKey } = lay.box;
  st.caseBox = lay.box;
  st.src = { x: xL + (xR - xL) * 0.42, y: (yTop + yKey) / 2 + 20 };
  const lidOpen = Math.min(1, Math.max(0, lid));
  const cphi = Math.cos(lidOpen * (Math.PI / 2.4));
  ctx.save();
  ctx.translate(xL, 0);
  ctx.scale(cphi, 1);
  ctx.translate(-xL, 0);
  ctx.fillStyle = rgba(C.lacquer, 0.22 + 0.6 * (1 - lidOpen));
  ctx.fill(lay.outline);
  ctx.restore();
  // its outline, foreshortened: the lacquer's edge catching the light
  ctx.strokeStyle = rgba(C.sheen, 0.25 + 0.35 * (1 - lidOpen));
  ctx.lineWidth = 1;
  ctx.beginPath();
  lay.outer.forEach(([x, y], k) => (k ? ctx.lineTo(xL + (x - xL) * cphi, y) : ctx.moveTo(xL + (x - xL) * cphi, y)));
  ctx.stroke();
  const edgeX = xL + (xR - xL) * cphi;
  ctx.strokeStyle = rgba(C.sheen, 0.35 + 0.45 * lidOpen);
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
