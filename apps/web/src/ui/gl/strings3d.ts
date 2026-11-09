// Violin, viola and cello in 3D, built once per instrument as a luthier would describe it:
//   the plates — outline traced from a real instrument (outlines.ts), arched as a height field (a
//     long arch × a cross arch, rising out of a channel that runs round the edge), with a rounded
//     edge overhanging the ribs; the top painted with spruce grain, varnish, purfling and edge wear,
//     its f-holes cut through (with their walls); the back two-piece flamed maple with its button;
//   the ribs (flamed), with dark interior surfaces seen through the f-holes;
//   the neck and heel, the ebony fingerboard (crowned, scooped), the nut, the pegbox (open cheeks)
//     with turned pegs, and the scroll — a volute swept along a logarithmic spiral, its sides stepping
//     in turn by turn, the back fluted either side of a spine;
//   the bridge cut from its real outline (feet, legs, heart, kidneys, ears), standing on the arch;
//   the tailpiece with its fret, string holes and a fine tuner, the tailgut over the saddle, the end
//     button (or the cello's endpin), a chinrest; the strings as wound and plain steel, with silk;
//   the bow: an octagonal cambered stick, the head with its face plate, the hair ribbon, the ebony
//     frog with ferrule, slide and pearl eye, the winding, the thumb leather and the button.
// Live: the top lit by the body's modes, the strings glowing with their levels, the stopping point a
// glowing bar on the fingerboard under its string (rocking with the vibrato), the bowed string's
// shape moving in the bowing direction, and the bow at its contact point and hair position.
//
// Proportions (metres): violin after the Stradivari "Messiah" pattern as tabulated by Strobel
// ("Useful Measurements for Violin Makers"): body 356, bouts 168/112/208, ribs 30–32, arch ≈15.5,
// neck (nut–edge) 130, stop 195, bridge 33 high, fingerboard 270, projection 27; a 16" viola (body
// 406, bouts 190/130/237, ribs 38, neck 148); a cello after Strad "Davidov" proportions (body 755,
// bouts 345/235/440, ribs 115–120, neck 280, stop 410, bridge 90, projection 82). The traced
// outlines reproduce these bouts within about 2 % (scripts/trace-outline.py; docs/3d-reference.md).
// The string length (nut–bridge) is the engine's. Edge, purfling, channel and plate thicknesses are
// typical figures (violin edge 3.8, purfling 4 in, 1.2 wide; cello edge 5.8, purfling 6.5 in, 1.8).
import type { VisualFrame } from '@piano-model/engine';
import { ShapeUtils, Vector2 } from 'three';
import type { BowedGeom } from '../stage-draw.ts';
import { INK } from '../stage-draw.ts';
import { type Batch, type Mat4, type Mesh, type RGBA, type Vec3, add, chain, cross, ink, lerp3, mul, norm, plateModes, rotY, rotZ, scale, sub, translate, xdir, xform } from './gl3d.ts';
import { M, MeshBuilder, cyl, grid, lathe, spline, tube, variant, type Mat, type PaintSpec } from './mesh.ts';
import { CELLO, VIOLIN, type Outline } from './outlines.ts';

type P2 = [number, number];
type RGB = [number, number, number];

interface Spec {
  body: number;
  ol: Outline;
  rib: number;
  archT: number;
  archB: number;
  /** edge thickness (plate edge, top of the round), overhang beyond the ribs, edge round radius */
  edgeT: number;
  over: number;
  rE: number;
  plateT: number;
  ribT: number;
  /** purfling: distance in from the edge, width */
  purf: [number, number];
  /** the channel: centre (in from the edge), half-width, depth; the arch's rise beyond it */
  chan: [number, number, number];
  rise: number;
  /** the back's button (radius) */
  button: number;
  neck: number;
  fbLen: number;
  fbW: [number, number];
  fbThick: number;
  fbCrown: number;
  bridgeH: number;
  bridgeW: number;
  bridgeR: number;
  proj: number;
  overstand: number;
  scroll: number;
  pegbox: number;
  pbDepth: number;
  tail: number;
  spreadB: number;
  spreadN: number;
  neckDepth: [number, number];
  stick: [number, number];
  hairW: number;
  /** string diameters, lowest first (metres) */
  dia: [number, number, number, number];
  wound: [boolean, boolean, boolean, boolean];
  /** grain spacing at the centre and the flanks (top), flame wavelength (back) */
  grain: [number, number];
  flame: number;
  /** varnish: top, back/ribs, edges (sRGB 0–255) */
  vTop: RGB;
  vBack: RGB;
  vEdge: RGB;
}
const mm = 0.001;
const SPEC: Record<'violin' | 'viola' | 'cello', Spec> = {
  violin: {
    body: 0.356, ol: VIOLIN, rib: 0.031, archT: 0.0155, archB: 0.0145, edgeT: 3.8 * mm, over: 2.6 * mm, rE: 1.6 * mm, plateT: 2.8 * mm, ribT: 1.1 * mm,
    purf: [4 * mm, 1.2 * mm], chan: [4.6 * mm, 2.2 * mm, 0.55 * mm], rise: 22 * mm, button: 10 * mm,
    neck: 0.13, fbLen: 0.27, fbW: [0.024, 0.042], fbThick: 0.005, fbCrown: 0.003, bridgeH: 0.033, bridgeW: 0.041, bridgeR: 0.042, proj: 0.027, overstand: 0.006,
    scroll: 0.04, pegbox: 0.07, pbDepth: 0.021, tail: 0.11, spreadB: 0.0113, spreadN: 0.0055, neckDepth: [0.018, 0.021], stick: [0.0043, 0.0028], hairW: 0.0105,
    dia: [0.8 * mm, 0.8 * mm, 0.6 * mm, 0.26 * mm], wound: [true, true, true, false], grain: [0.9 * mm, 2.0 * mm], flame: 3.6 * mm,
    vTop: [172, 96, 40], vBack: [166, 84, 32], vEdge: [92, 40, 14],
  },
  viola: {
    body: 0.406, ol: VIOLIN, rib: 0.038, archT: 0.0175, archB: 0.0165, edgeT: 4.1 * mm, over: 2.8 * mm, rE: 1.8 * mm, plateT: 3 * mm, ribT: 1.2 * mm,
    purf: [4.3 * mm, 1.3 * mm], chan: [5 * mm, 2.5 * mm, 0.65 * mm], rise: 26 * mm, button: 11 * mm,
    neck: 0.148, fbLen: 0.295, fbW: [0.025, 0.045], fbThick: 0.0055, fbCrown: 0.0032, bridgeH: 0.037, bridgeW: 0.045, bridgeR: 0.046, proj: 0.029, overstand: 0.007,
    scroll: 0.045, pegbox: 0.08, pbDepth: 0.024, tail: 0.125, spreadB: 0.0122, spreadN: 0.0058, neckDepth: [0.019, 0.023], stick: [0.0045, 0.003], hairW: 0.011,
    dia: [1.0 * mm, 0.9 * mm, 0.75 * mm, 0.6 * mm], wound: [true, true, true, true], grain: [1.0 * mm, 2.2 * mm], flame: 4.2 * mm,
    vTop: [150, 70, 30], vBack: [140, 60, 24], vEdge: [80, 32, 12],
  },
  cello: {
    body: 0.755, ol: CELLO, rib: 0.12, archT: 0.026, archB: 0.024, edgeT: 5.8 * mm, over: 3.8 * mm, rE: 2.6 * mm, plateT: 4.5 * mm, ribT: 1.4 * mm,
    purf: [6.5 * mm, 1.8 * mm], chan: [9 * mm, 4.2 * mm, 1.1 * mm], rise: 48 * mm, button: 19 * mm,
    neck: 0.28, fbLen: 0.58, fbW: [0.032, 0.075], fbThick: 0.009, fbCrown: 0.006, bridgeH: 0.09, bridgeW: 0.092, bridgeR: 0.066, proj: 0.082, overstand: 0.02,
    scroll: 0.072, pegbox: 0.14, pbDepth: 0.046, tail: 0.235, spreadB: 0.0205, spreadN: 0.0078, neckDepth: [0.03, 0.036], stick: [0.0055, 0.0038], hairW: 0.0145,
    dia: [1.6 * mm, 1.3 * mm, 1.05 * mm, 0.8 * mm], wound: [true, true, true, true], grain: [1.4 * mm, 3.2 * mm], flame: 7 * mm,
    vTop: [150, 64, 26], vBack: [142, 56, 22], vEdge: [74, 26, 10],
  },
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- the plate outline
interface Plate {
  B: number;
  /** closed outline (x, z): along the bass side (z > 0) to the tail, back along the treble side */
  poly: P2[];
  /** outward unit normals */
  nrm: P2[];
  hwMax: number;
  /** a smoothed half-width envelope (the cross arch's scale) */
  W: (x: number) => number;
  /** the spine the plate's mesh fans from: x clamped to [xa, xb] on the centre line */
  xa: number;
  xb: number;
  /** distance to the outline (from a precomputed grid) */
  dist: (x: number, z: number) => number;
}

/** resample a closed polyline to n points, closer together where it turns (the corners) */
function resample(pts0: P2[], n: number, bend: number): P2[] {
  // first a fine, even resampling, then by arc length plus `bend` × the turning angle
  const even = (pts: P2[], m: number): P2[] => {
    const acc = [0];
    for (let i = 1; i <= pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i % pts.length];
      acc.push(acc[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = acc[pts.length];
    const out: P2[] = [];
    let j = 0;
    for (let k = 0; k < m; k++) {
      const s = (k / m) * total;
      while (acc[j + 1] < s) j++;
      const a = pts[j];
      const b = pts[(j + 1) % pts.length];
      const t = (s - acc[j]) / Math.max(1e-12, acc[j + 1] - acc[j]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return out;
  };
  const fine = even(pts0, 4000);
  const m = fine.length;
  const acc = [0];
  for (let i = 1; i <= m; i++) {
    const a = fine[(i - 1) % m];
    const b = fine[i % m];
    const c = fine[(i + 1) % m];
    const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let turn = Math.abs(t2 - t1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;
    acc.push(acc[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]) + bend * turn);
  }
  const total = acc[m];
  const out: P2[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * total;
    while (acc[j + 1] < s) j++;
    const a = fine[j];
    const b = fine[(j + 1) % m];
    const t = (s - acc[j]) / Math.max(1e-12, acc[j + 1] - acc[j]);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

function makePlate(ol: Outline, B: number, n: number, button: number): Plate {
  const N = ol.hw.length;
  const bass: P2[] = [];
  for (let i = 0; i < N; i++) bass.push([(i / (N - 1)) * B, ol.hw[i] * B]);
  let pts: P2[] = [...bass, ...bass.slice(1, N - 1).reverse().map(([x, z]): P2 => [x, -z])];
  if (button > 0) {
    // the back's button at the neck end: a half-round tongue the neck's heel sits on
    const keep = pts.filter(([x, z]) => Math.abs(z) >= button || x > button * 3);
    const arc: P2[] = [];
    for (let k = 0; k <= 12; k++) {
      const th = -Math.PI / 2 + (k / 12) * Math.PI;
      arc.push([-button * 0.85 * Math.cos(th), button * Math.sin(th)]);
    }
    pts = [...arc, ...keep];
  }
  const poly = resample(pts, n, 0.012 * B);
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    area += a[0] * b[1] - b[0] * a[1];
  }
  // normals from the outline smoothed over ~3.5 mm (×B/0.356), so that offsets of a few millimetres
  // (the edge round, the overhang, the ribs) round the corners' tips instead of folding over
  let per = 0;
  for (let i = 0; i < n; i++) per += Math.hypot(poly[(i + 1) % n][0] - poly[i][0], poly[(i + 1) % n][1] - poly[i][1]);
  const win = Math.max(1, Math.round((0.0035 * (B / 0.356) ** 0.5) / (per / n)));
  const sm = poly.map((_, i): P2 => {
    let x = 0;
    let z = 0;
    let wsum = 0;
    for (let k = -win; k <= win; k++) {
      const wk = Math.exp(-((k / win) ** 2) * 2);
      const q = poly[(i + k + n) % n];
      x += q[0] * wk;
      z += q[1] * wk;
      wsum += wk;
    }
    return [x / wsum, z / wsum];
  });
  const nrm = poly.map((_, i): P2 => {
    const a = sm[(i + n - 1) % n];
    const b = sm[(i + 1) % n];
    const tx = b[0] - a[0];
    const tz = b[1] - a[1];
    const l = Math.hypot(tx, tz) || 1;
    return area > 0 ? [tz / l, -tx / l] : [-tz / l, tx / l];
  });
  // the envelope: a running max over ±4 % of the length, then smoothed
  const hw = ol.hw;
  const env = hw.map((_, i) => {
    let m = 0;
    for (let j = Math.max(0, i - 19); j <= Math.min(N - 1, i + 19); j++) m = Math.max(m, hw[j]);
    return m;
  });
  const envS = env.map((_, i) => {
    let s = 0;
    let c = 0;
    for (let j = Math.max(0, i - 24); j <= Math.min(N - 1, i + 24); j++) {
      s += env[j];
      c++;
    }
    return s / c;
  });
  const hwMax = Math.max(...hw) * B;
  const W = (x: number) => {
    const f = clamp(x / B, 0, 1) * (N - 1);
    const i = Math.min(N - 2, Math.floor(f));
    return Math.max(hwMax * 0.3, (envS[i] + (envS[i + 1] - envS[i]) * (f - i)) * B);
  };
  let ia = 0;
  let ib = N - 1;
  for (let i = 0; i < N / 2; i++) if (hw[i] > hw[ia]) ia = i;
  for (let i = Math.floor(N / 2); i < N; i++) if (hw[i] > hw[ib] || ib === N - 1) ib = i;
  // the distance grid over the plate's box
  const x0 = -0.06 * B;
  const x1 = 1.04 * B;
  const z0 = -hwMax - 0.02 * B;
  const z1 = hwMax + 0.02 * B;
  const GX = 240;
  const GZ = Math.round((GX * (z1 - z0)) / (x1 - x0));
  const D = new Float32Array((GX + 1) * (GZ + 1));
  const px = new Float64Array(n);
  const pz = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    px[i] = poly[i][0];
    pz[i] = poly[i][1];
  }
  for (let gz = 0; gz <= GZ; gz++)
    for (let gx = 0; gx <= GX; gx++) {
      const x = x0 + ((x1 - x0) * gx) / GX;
      const z = z0 + ((z1 - z0) * gz) / GZ;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ex = px[j] - px[i];
        const ez = pz[j] - pz[i];
        const t = clamp(((x - px[i]) * ex + (z - pz[i]) * ez) / (ex * ex + ez * ez || 1), 0, 1);
        const dx = x - px[i] - ex * t;
        const dz = z - pz[i] - ez * t;
        const d2 = dx * dx + dz * dz;
        if (d2 < best) best = d2;
      }
      D[gz * (GX + 1) + gx] = Math.sqrt(best);
    }
  const dist = (x: number, z: number) => {
    const fx = clamp(((x - x0) / (x1 - x0)) * GX, 0, GX - 1e-6);
    const fz = clamp(((z - z0) / (z1 - z0)) * GZ, 0, GZ - 1e-6);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const r = GX + 1;
    const a = D[iz * r + ix] + (D[iz * r + ix + 1] - D[iz * r + ix]) * tx;
    const b = D[(iz + 1) * r + ix] + (D[(iz + 1) * r + ix + 1] - D[(iz + 1) * r + ix]) * tx;
    return a + (b - a) * tz;
  };
  return { B, poly, nrm, hwMax, W, xa: (ia / (N - 1)) * B, xb: (ib / (N - 1)) * B, dist };
}

/** the arch above the edge level: a long × cross arch, rising out of the channel round the edge */
function arch(sp: Spec, pl: Plate, x: number, z: number, h: number): number {
  const d = pl.dist(x, z);
  const u = x / pl.B;
  const t = Math.min(1, Math.abs(z) / pl.W(x));
  const [cc, cw, cd] = sp.chan;
  const S = sstep(cc * 0.8, cc * 0.8 + sp.rise, d);
  const L = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * u - 1), 2.4)), 0.62);
  const C = Math.pow(Math.cos((Math.PI / 2) * t), 1.25);
  return h * L * C * S - cd * Math.exp(-(((d - cc) / cw) ** 2));
}

// ---------------------------------------------------------------- painted plates
const hash2 = (i: number, j: number) => {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function vnoise(x: number, y: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j) + (hash2(i + 1, j) - hash2(i, j)) * sx;
  const b = hash2(i, j + 1) + (hash2(i + 1, j + 1) - hash2(i, j + 1)) * sx;
  return a + (b - a) * sy;
}
/** a seeded random sequence */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const rgba = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function paintPlate(id: string, sp: Spec, pl: Plate, holes: P2[][] | null, kind: 'top' | 'back'): PaintSpec {
  const B = pl.B;
  const rect: [number, number, number, number] = [-0.06 * B, -pl.hwMax - 0.02 * B, 1.04 * B, pl.hwMax + 0.02 * B];
  return {
    key: `${id}-${kind}`,
    rect,
    px: 2048,
    cut: !!holes,
    draw(c, aux, w, h) {
      const sx = w / (rect[2] - rect[0]);
      const sz = h / (rect[3] - rect[1]);
      const X = (x: number) => (x - rect[0]) * sx;
      const Z = (z: number) => (z - rect[1]) * sz;
      const pm = sx * mm; // pixels per millimetre
      const pathOf = (pts: P2[]) => {
        const p = new Path2D();
        pts.forEach(([x, z], i) => (i ? p.lineTo(X(x), Z(z)) : p.moveTo(X(x), Z(z))));
        p.closePath();
        return p;
      };
      const path = pathOf(pl.poly);
      const base = kind === 'top' ? sp.vTop : sp.vBack;
      c.fillStyle = rgba(sp.vEdge);
      c.fillRect(0, 0, w, h);
      c.save();
      c.clip(path);
      c.fillStyle = rgba(base);
      c.fillRect(0, 0, w, h);
      const r = rng(kind === 'top' ? 7 : 11);
      if (kind === 'top') {
        // spruce: latewood lines along the plate, closest at the centre joint, wider at the flanks
        c.lineCap = 'round';
        for (const side of [1, -1]) {
          let z = 0.4 * mm;
          while (z < pl.hwMax) {
            const f = z / pl.hwMax;
            const s = (sp.grain[0] + (sp.grain[1] - sp.grain[0]) * Math.pow(f, 1.3)) * (0.7 + 0.6 * r());
            z += s;
            const ph = r() * 10;
            c.beginPath();
            for (let x = -0.05 * B; x <= 1.04 * B; x += 3 * mm) {
              const zz = side * (z + 0.25 * s * Math.sin(x * 9 + ph) + 0.4 * s * (vnoise(x * 18, z * 300) - 0.5));
              if (x <= -0.05 * B) c.moveTo(X(x), Z(zz));
              else c.lineTo(X(x), Z(zz));
            }
            c.strokeStyle = `rgba(52,18,6,${0.16 + 0.22 * r()})`;
            c.lineWidth = Math.max(0.8, (0.22 + 0.2 * r()) * s * pm * 1000 * mm);
            c.stroke();
          }
        }
      } else {
        // the back's flame: drawn per pixel at a lower resolution, then laid over
        const fw = Math.min(1024, w);
        const fh = Math.max(8, Math.round((h * fw) / w));
        const off = document.createElement('canvas');
        off.width = fw;
        off.height = fh;
        const g = off.getContext('2d')!;
        const img = g.createImageData(fw, fh);
        const offA = document.createElement('canvas');
        offA.width = fw;
        offA.height = fh;
        const gA = offA.getContext('2d')!;
        const imgA = gA.createImageData(fw, fh);
        const lam = sp.flame;
        for (let py = 0; py < fh; py++) {
          const z = rect[1] + ((py + 0.5) / fh) * (rect[3] - rect[1]);
          const az = Math.abs(z);
          for (let qx = 0; qx < fw; qx++) {
            const x = rect[0] + ((qx + 0.5) / fw) * (rect[2] - rect[0]);
            const n1 = vnoise((x / lam) * 0.35, (az / lam) * 0.12);
            const n2 = vnoise((x / lam) * 1.3 + 40, (az / lam) * 0.5);
            const ph = ((x - 0.55 * az) / lam) * Math.PI * 2 + 3.2 * n1;
            const f = Math.sin(ph);
            const strength = 0.45 + 0.55 * sstep(0.25, 0.75, n2);
            const fl = sstep(-0.35, 0.85, f) * strength;
            const o = (py * fw + qx) * 4;
            img.data[o] = 40;
            img.data[o + 1] = 14;
            img.data[o + 2] = 4;
            img.data[o + 3] = Math.round(255 * 0.2 * (1 - fl));
            imgA.data[o] = Math.round(128 + 120 * (fl - 0.45) * 1.6);
            imgA.data[o + 1] = 0;
            imgA.data[o + 2] = 0;
            imgA.data[o + 3] = 255;
          }
        }
        g.putImageData(img, 0, 0);
        gA.putImageData(imgA, 0, 0);
        c.drawImage(off, 0, 0, w, h);
        aux.drawImage(offA, 0, 0, w, h);
        // the centre joint
        c.strokeStyle = 'rgba(40,14,4,0.25)';
        c.lineWidth = Math.max(1, 0.3 * pm);
        c.beginPath();
        c.moveTo(X(0), Z(0));
        c.lineTo(X(B), Z(0));
        c.stroke();
      }
      // the varnish: deeper in colour towards the edges, lighter where it has worn thin
      const glow = (cx: number, cz: number, rad: number, col: RGB, a: number) => {
        const g = c.createRadialGradient(X(cx), Z(cz), 0, X(cx), Z(cz), rad * sx);
        g.addColorStop(0, rgba(col, a));
        g.addColorStop(1, rgba(col, 0));
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
      };
      glow(0.26 * B, 0, 0.2 * B, [236, 150, 72], 0.16);
      glow(0.74 * B, 0, 0.26 * B, [236, 150, 72], 0.14);
      glow(0.5 * B, 0.04 * B, 0.1 * B, [236, 150, 72], 0.08);
      for (let k = 1; k <= 12; k++) {
        c.strokeStyle = rgba(sp.vEdge, 0.05);
        c.lineWidth = 2 * k * 2.2 * pm * (B / 0.356) ** 0.5;
        c.stroke(path);
      }
      for (let k = 0; k < 40; k++) glow(r() * B, (r() * 2 - 1) * pl.hwMax, (0.02 + 0.06 * r()) * B, r() < 0.5 ? sp.vEdge : [200, 120, 60], 0.06 + 0.06 * r());
      // purfling (black–white–black) and a worn line at the edge
      const band = (d1: number, d2: number, style: string) => {
        const L = document.createElement('canvas');
        L.width = w;
        L.height = h;
        const g = L.getContext('2d')!;
        g.lineJoin = 'round';
        g.strokeStyle = style;
        g.lineWidth = 2 * d2 * pm * 1000;
        g.stroke(path);
        if (d1 > 0) {
          g.globalCompositeOperation = 'destination-out';
          g.lineWidth = 2 * d1 * pm * 1000;
          g.stroke(path);
        }
        c.drawImage(L, 0, 0);
      };
      const [pd, pw] = sp.purf;
      band(pd, pd + pw, 'rgba(14,6,3,0.97)');
      band(pd + pw * 0.33, pd + pw * 0.67, 'rgba(150,104,56,0.85)');
      band(0.25 * mm, 1.0 * mm, 'rgba(200,128,62,0.14)');
      band(0, 0.3 * mm, 'rgba(30,10,4,0.5)');
      c.restore();
      // the f-holes: a dark cut edge, then cut out
      if (holes) {
        for (const hp of holes) {
          const p = pathOf(hp);
          c.strokeStyle = 'rgba(28,10,4,0.9)';
          c.lineWidth = 1.1 * pm;
          c.stroke(p);
          c.globalCompositeOperation = 'destination-out';
          c.fillStyle = '#000';
          c.fill(p);
          c.globalCompositeOperation = 'source-over';
        }
      }
      if (kind === 'top') {
        aux.fillStyle = 'rgb(128,0,0)';
        aux.fillRect(0, 0, w, h);
      }
    },
  };
}

// ---------------------------------------------------------------- the model
export interface BowedModel {
  id: 'violin' | 'viola' | 'cello';
  sp: Spec;
  L: number;
  /** body → world */
  T: Mat4;
  meshes: Mesh[];
  top: Mesh;
  bow: Mesh;
  hairLen: number;
  /** local string geometry: x of nut and bridge, z of each string at both, y of the string line */
  xn: number;
  xb: number;
  zN: number[];
  zB: number[];
  yN: number;
  yB: number[];
  /** tailpiece end of each string */
  tailEnd: Vec3[];
  pegEnd: Vec3[];
  fbY: (x: number) => number;
  bounds: { c: Vec3; r: number };
  floorY: number;
  src: Vec3;
}

export function buildBowedModel(g: BowedGeom): BowedModel {
  const sp = SPEC[g.id];
  const L = g.L;
  const xn = -sp.neck;
  const xb = L - sp.neck;
  const B = sp.body;
  const S = B / 0.356; // the violin's scale, for small fittings
  const mb = new MeshBuilder();
  const topMb = new MeshBuilder();
  const N = g.id === 'cello' ? 600 : 520;
  const pl = makePlate(sp.ol, B, N, 0);
  const plB = makePlate(sp.ol, B, N, sp.button);
  // the inside (seen only through the f-holes) needs far less
  const plIn = makePlate(sp.ol, B, Math.round(N / 4), 0);
  const ribH = (x: number) => sp.rib * (0.955 + 0.045 * clamp(x / B, 0, 1));
  const yTop = (x: number, z: number) => sp.edgeT + arch(sp, pl, x, z, sp.archT - sp.edgeT);
  const yBack = (x: number, z: number) => -ribH(x) - sp.edgeT - arch(sp, plB, x, z, sp.archB - sp.edgeT);
  // f-holes, from the traced one, its notches on the bridge line
  const fb = sp.ol.fhole;
  let fu0 = Infinity;
  let fu1 = -Infinity;
  for (const [u] of fb) {
    fu0 = Math.min(fu0, u);
    fu1 = Math.max(fu1, u);
  }
  const shift = xb / B - (fu0 + fu1) / 2;
  const fBass: P2[] = fb.map(([u, z]) => [(u + shift) * B, z * B]);
  const fTreble: P2[] = fBass.map(([x, z]) => [x, -z]);
  const holes = [fBass, fTreble];
  // ---- materials (painted plates; the rest flamed or plain)
  const mTop = variant(M.varnishTop, { paint: paintPlate(g.id, sp, pl, holes, 'top'), kind: 1 });
  const mBack = variant(M.varnish, { paint: paintPlate(g.id, sp, plB, null, 'back') });
  const flamed = variant(M.varnish, { col: [sp.vBack[0] / 255, sp.vBack[1] / 255, sp.vBack[2] / 255], tint: true });
  const flamedDark = variant(M.varnishDark, { col: [sp.vEdge[0] / 255, sp.vEdge[1] / 255, sp.vEdge[2] / 255], tint: true });
  // ---- plates: arched surfaces fanned from the spine to the edge round's inner line
  const plateSurface = (b: MeshBuilder, p: Plate, yf: (x: number, z: number) => number, inset: number, m: Mat, down: boolean) => {
    const K = 20;
    const n = p.poly.length;
    const e = 0.25 * mm;
    const rows: { pos: Vec3; nrm: Vec3; uv: [number, number] }[][] = [];
    for (let i = 0; i < n; i++) {
      const [px, pz] = p.poly[i];
      const [nx, nz] = p.nrm[i];
      const qx = px - nx * inset;
      const qz = pz - nz * inset;
      const cx = clamp(px, p.xa, p.xb);
      const row: { pos: Vec3; nrm: Vec3; uv: [number, number] }[] = [];
      for (let k = 0; k <= K; k++) {
        const v = 1 - Math.pow(1 - k / K, 1.7);
        const x = cx + (qx - cx) * v;
        const z = qz * v;
        const y = yf(x, z);
        const gx = (yf(x + e, z) - yf(x - e, z)) / (2 * e);
        const gz = (yf(x, z + e) - yf(x, z - e)) / (2 * e);
        const nn = norm(down ? [gx, -1, gz] : [-gx, 1, -gz]);
        row.push({ pos: [x, y, z], nrm: nn, uv: [x / B, 0.5 + z / (2 * p.hwMax)] });
      }
      rows.push(row);
    }
    for (let i = 0; i < n; i++) {
      const A = rows[i];
      const C = rows[(i + 1) % n];
      for (let k = 0; k < K; k++) {
        const a = A[k];
        const b2 = A[k + 1];
        const c2 = C[k + 1];
        const d = C[k];
        b.stri(a.pos, b2.pos, c2.pos, a.nrm, b2.nrm, c2.nrm, m, a.uv, b2.uv, c2.uv);
        b.stri(a.pos, c2.pos, d.pos, a.nrm, c2.nrm, d.nrm, m, a.uv, c2.uv, d.uv);
      }
    }
  };
  plateSurface(topMb, pl, yTop, sp.rE, mTop, false);
  plateSurface(mb, plB, yBack, sp.rE, mBack, true);
  // the inside: the plates' inner faces and the ribs' inner faces, dark (seen through the f-holes)
  plateSurface(mb, plIn, (x, z) => yTop(x, z) - sp.plateT, sp.over + sp.ribT, M.interior, true);
  plateSurface(mb, plIn, (x, z) => yBack(x, z) + sp.plateT, sp.over + sp.ribT, M.interior, false);
  // ---- the edges: a round from the plate's surface over the edge to the overhang's underside
  const edge = (b: MeshBuilder, p: Plate, top: boolean, m: Mat) => {
    const n = p.poly.length;
    const rE = sp.rE;
    const rB = 0.6 * mm * S ** 0.5;
    const prof = (i: number): { o: number; y: number; no: number; ny: number }[] => {
      const [px, pz] = p.poly[i];
      const [nx, nz] = p.nrm[i];
      const qx = px - nx * rE;
      const qz = pz - nz * rE;
      const out: { o: number; y: number; no: number; ny: number }[] = [];
      const s = top ? 1 : -1;
      const y0 = top ? yTop(qx, qz) : yBack(qx, qz);
      const yRib = top ? 0 : -ribH(px);
      const yc = y0 - s * rE;
      for (let k = 0; k <= 4; k++) {
        const ph = (k / 4) * (Math.PI / 2);
        out.push({ o: -rE + rE * Math.sin(ph), y: yc + s * rE * Math.cos(ph), no: Math.sin(ph), ny: s * Math.cos(ph) });
      }
      for (let k = 0; k <= 3; k++) {
        const ph = (k / 3) * (Math.PI / 2);
        out.push({ o: -rB + rB * Math.cos(ph), y: yRib + s * rB - s * rB * Math.sin(ph), no: Math.cos(ph), ny: -s * Math.sin(ph) });
      }
      out.push({ o: -sp.over, y: yRib, no: 0, ny: -s });
      return out;
    };
    const P = Array.from({ length: n }, (_, i) => prof(i));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const A = P[i];
      const C = P[j];
      const pa = p.poly[i];
      const pc = p.poly[j];
      const na = p.nrm[i];
      const nc = p.nrm[j];
      const V = (pp: P2, nn: P2, q: { o: number; y: number }): Vec3 => [pp[0] + nn[0] * q.o, q.y, pp[1] + nn[1] * q.o];
      const NN = (nn: P2, q: { no: number; ny: number }): Vec3 => norm([nn[0] * q.no, q.ny, nn[1] * q.no]);
      for (let k = 0; k < A.length - 1; k++) {
        const a = V(pa, na, A[k]);
        const b2 = V(pa, na, A[k + 1]);
        const c2 = V(pc, nc, C[k + 1]);
        const d = V(pc, nc, C[k]);
        const uvs = (q: Vec3): [number, number] => [q[0] / B, 0.5 + q[2] / (2 * p.hwMax)];
        b.stri(a, b2, c2, NN(na, A[k]), NN(na, A[k + 1]), NN(nc, C[k + 1]), m, uvs(a), uvs(b2), uvs(c2));
        b.stri(a, c2, d, NN(na, A[k]), NN(nc, C[k + 1]), NN(nc, C[k]), m, uvs(a), uvs(c2), uvs(d));
      }
    }
  };
  edge(topMb, pl, true, mTop);
  edge(mb, plB, false, mBack);
  // ---- ribs: the outline inset by the overhang, outer face flamed, inner face dark
  {
    const n = pl.poly.length;
    const rib = (i: number, inset: number): [Vec3, Vec3, Vec3] => {
      const [px, pz] = pl.poly[i];
      const [nx, nz] = pl.nrm[i];
      const x = px - nx * (sp.over + inset);
      const z = pz - nz * (sp.over + inset);
      return [[x, 0, z], [x, -ribH(x), z], [nx, 0, nz]];
    };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      for (const [inset, m, sgn] of [[0, flamed, 1], [sp.ribT, M.interior, -1]] as [number, Mat, number][]) {
        if (inset > 0 && i % 4) continue;
        const [a0, a1, na] = rib(i, inset);
        const [c0, c1, nc] = rib(inset > 0 ? (i + 4) % n : j, inset);
        const NA = scale(na, sgn);
        const NC = scale(nc, sgn);
        mb.stri(a0, a1, c1, NA, NA, NC, m);
        mb.stri(a0, c1, c0, NA, NC, NC, m);
      }
    }
  }
  // ---- f-hole walls: the top's thickness, end grain
  for (const hp of holes) {
    const n = hp.length;
    let area = 0;
    for (let i = 0; i < n; i++) area += hp[i][0] * hp[(i + 1) % n][1] - hp[(i + 1) % n][0] * hp[i][1];
    for (let i = 0; i < n; i++) {
      const a = hp[i];
      const c2 = hp[(i + 1) % n];
      const tx = c2[0] - a[0];
      const tz = c2[1] - a[1];
      const l = Math.hypot(tx, tz) || 1;
      // into the hole
      const nn: Vec3 = area > 0 ? [-tz / l, 0, tx / l] : [tz / l, 0, -tx / l];
      const ya = yTop(a[0], a[1]);
      const yc = yTop(c2[0], c2[1]);
      topMb.stri([a[0], ya, a[1]], [a[0], ya - sp.plateT, a[1]], [c2[0], yc - sp.plateT, c2[1]], nn, nn, nn, M.fEdge);
      topMb.stri([a[0], ya, a[1]], [c2[0], yc - sp.plateT, c2[1]], [c2[0], yc, c2[1]], nn, nn, nn, M.fEdge);
    }
  }

  // ---- neck, fingerboard, nut
  const fbEdge = sp.overstand + sp.fbThick;
  const slope = (sp.proj - fbEdge) / xb;
  const fbY = (x: number) => sp.proj - slope * (xb - x);
  const fbEnd = xn + sp.fbLen;
  const fbW = (x: number) => sp.fbW[0] + ((sp.fbW[1] - sp.fbW[0]) * (x - xn)) / sp.fbLen;
  // the fingerboard: crowned top, a slight scoop along it, bevelled sides, hollowed underside
  grid(mb, 40, 22, (s, v) => {
    const x = xn + s * sp.fbLen;
    const wv = fbW(x);
    const scoop = 0.0009 * S ** 0.6 * Math.sin(Math.PI * s);
    const yTopF = fbY(x) - scoop;
    const yBot = fbY(x) - sp.fbCrown - sp.fbThick;
    // the cross-section loop: top (crowned), down the sides, along the bottom
    const a = v * 2 * Math.PI;
    const t = (Math.cos(a) + 1) / 2; // 1 at the top centre
    const zz = (Math.sin(a) * wv) / 2;
    const zc = Math.abs(Math.sin(a));
    const top = yTopF - sp.fbCrown * zc * zc;
    const y = t > 0.5 ? top - (1 - t) * 0.12 * sp.fbThick : yBot + t * 0.12 * sp.fbThick;
    return [x, y, zz * (t > 0.5 ? 1 : 0.94)];
  }, M.fittings, { wrapV: true });
  {
    const yb = (x: number) => fbY(x) - sp.fbCrown - sp.fbThick;
    // ends
    for (const [x, sgn] of [[xn, -1], [fbEnd, 1]] as [number, number][]) {
      const w2 = fbW(x) / 2;
      const nn: Vec3 = [sgn, 0, 0];
      const cTop: Vec3 = [x, fbY(x) - sp.fbCrown * 0.3, 0];
      const pts: Vec3[] = [];
      for (let k = 0; k <= 12; k++) {
        const z = -w2 + (2 * w2 * k) / 12;
        pts.push([x, fbY(x) - sp.fbCrown * (z / w2) ** 2, z]);
      }
      pts.push([x, yb(x), w2], [x, yb(x), -w2]);
      for (let k = 0; k < pts.length; k++) mb.stri(cTop, pts[k], pts[(k + 1) % pts.length], nn, nn, nn, M.fittings);
    }
  }
  // the neck: a D section under the fingerboard, deepening into the heel, which runs down the
  // body's end to the back's button
  const neckBot = (x: number) => fbY(x) - sp.fbCrown - sp.fbThick;
  grid(mb, 30, 18, (s, v) => {
    const x = xn + s * (sp.neck + 0.002);
    const heel = sstep(0.72, 1, s);
    const dep = sp.neckDepth[0] + (sp.neckDepth[1] - sp.neckDepth[0]) * s + heel * (neckBot(0) + ribH(0) + sp.edgeT - sp.neckDepth[1]);
    const a = Math.PI * v;
    const wn = fbW(x) * (0.9 + 0.12 * heel);
    const yy = neckBot(x) - Math.sin(a) * dep;
    return [x - heel * Math.sin(a) * 0.012 * S ** 0.6, yy, (Math.cos(a) * wn) / 2];
  }, flamed);
  // the nut (ebony)
  const yNut = fbY(xn) + 0.0008 * S;
  grid(mb, 1, 16, (s, v) => {
    const a = v * Math.PI * 2;
    const r = 0.0042 * S ** 0.5;
    return [xn - 0.0022 * S ** 0.5 + Math.cos(a) * r * 0.55, yNut - 0.0035 * S ** 0.5 + Math.sin(a) * r, (s - 0.5) * fbW(xn) * 1.02];
  }, M.fittings, { wrapV: true });

  // ---- pegbox: two cheeks and a floor, open on top, angled back from the nut
  const al = 0.2;
  const ax: Vec3 = [-Math.cos(al), -Math.sin(al), 0];
  const up: Vec3 = [-Math.sin(al), Math.cos(al), 0];
  const pbH = sp.pbDepth;
  const pbLen = sp.pegbox;
  const O: Vec3 = sub([xn - 0.002 * S ** 0.5, yNut - 0.0018 * S ** 0.5, 0], scale(up, pbH));
  const pbW = (s: number) => fbW(xn) * 1.04 * (1 - 0.16 * s);
  const cheek = 0.0034 * S ** 0.75;
  const floorT = 0.003 * S ** 0.75;
  const PB = (s: number, hh: number, z: number): Vec3 => add(add(O, scale(ax, s * pbLen)), [up[0] * hh, up[1] * hh, z]);
  for (const side of [-1, 1]) {
    // outer cheek, its chamfered top edge, inner cheek
    grid(mb, 10, 8, (s, v) => {
      const w2 = pbW(s) / 2;
      // the loop over the cheek's section: outer face up, chamfer, top, chamfer, inner face down
      const pts: [number, number][] = [
        [w2, 0],
        [w2, pbH * 0.86],
        [w2 - cheek * 0.25, pbH],
        [w2 - cheek * 0.75, pbH],
        [w2 - cheek, pbH * 0.88],
        [w2 - cheek, floorT],
      ];
      const f = v * (pts.length - 1);
      const k = Math.min(pts.length - 2, Math.floor(f));
      const t = f - k;
      const zz = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t;
      const hh = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t;
      return PB(s * 1.02, hh, side * zz);
    }, flamed, { flip: side < 0 });
  }
  // the floor (outside: the back of the pegbox; inside: dark)
  grid(mb, 10, 6, (s, v) => PB(s * 1.02, 0, (v - 0.5) * pbW(s)), flamed, { flip: true });
  grid(mb, 10, 6, (s, v) => PB(s * 1.02, floorT, (v - 0.5) * (pbW(s) - 2 * cheek)), M.interior);
  // the throat: closing the pegbox's end under the nut
  grid(mb, 1, 6, (s, v) => PB(0, s * pbH * 0.9, (v - 0.5) * pbW(0)), flamed);
  // pegs: two each side; the strings wind on their shafts. String i (0 = lowest) → its peg.
  const pegS = [0.8, 0.42, 0.24, 0.62];
  const pegSide = [1, 1, -1, -1];
  const pegEnd: Vec3[] = [];
  const pegMat = g.id === 'cello' ? M.rosewood : M.fittings;
  for (let i = 0; i < 4; i++) {
    const side = pegSide[i];
    const s = pegS[i];
    const c = PB(s, pbH * 0.46, 0);
    const w2 = pbW(s) / 2;
    const r = 0.0031 * S ** 0.6;
    // the shaft, through both cheeks
    cyl(mb, [c[0], c[1], -side * (w2 + 0.002 * S ** 0.5)], [c[0], c[1], side * (w2 + 0.004 * S ** 0.6)], r * 0.8, r * 1.05, 14, pegMat);
    // the collar and the head (a flattened pear, broad in the plane of the neck)
    const z0 = side * (w2 + 0.004 * S ** 0.6);
    const hl = 0.03 * S ** 0.62;
    const hw = 0.022 * S ** 0.62;
    lathe2(mb, [c[0], c[1], z0], side, [
      [r * 1.05, 0],
      [r * 1.5, 0.0015 * S ** 0.6],
      [r * 1.25, 0.0028 * S ** 0.6],
      [r * 1.55, 0.004 * S ** 0.6],
      [r * 1.2, 0.0055 * S ** 0.6],
    ], pegMat);
    grid(mb, 18, 20, (t, v) => {
      const a = v * Math.PI * 2;
      const A = 0.5 * hw * Math.pow(Math.sin(Math.PI * (0.13 + 0.87 * t)), 0.55);
      const Bt = A * (0.4 + 0.6 * Math.pow(1 - t, 5));
      const along = Math.cos(a) * A;
      const thick = Math.sin(a) * Bt;
      const zz = z0 + side * (0.0055 * S ** 0.6 + t * hl);
      return [c[0] + ax[0] * along + up[0] * thick, c[1] + ax[1] * along + up[1] * thick, zz];
    }, pegMat, { wrapV: true });
    pegEnd.push(PB(s, pbH * 0.52, -side * pbW(s) * 0.16));
  }
  // ---- the scroll: a volute on a logarithmic spiral from the pegbox's back
  {
    const R0 = sp.scroll * 0.5;
    const turns = 2.55;
    const TH = turns * 2 * Math.PI;
    const k = Math.log(1 / 0.16) / TH;
    const P0 = PB(1.0, 0, 0);
    const cC = add(P0, scale(up, R0));
    const r = (th: number) => R0 * Math.exp(-k * th);
    const W1 = pbW(1);
    const wz = (th: number) => W1 * (0.4 + 0.6 * Math.exp(-th / (1.25 * Math.PI)));
    const dir = (th: number): Vec3 => add(scale(up, -Math.cos(th)), scale(ax, Math.sin(th)));
    const prof = (th: number): [number, number][] => {
      const thick = r(th) - r(th + 2 * Math.PI);
      const fl = 0.07 * thick * (1 - sstep(1.2 * Math.PI, 2 * Math.PI, th));
      const ch = Math.min(0.14 * thick, 0.0025 * S ** 0.7);
      const half: [number, number][] = [
        [0, 0],
        [-fl, 0.3],
        [-fl * 0.35, 0.62],
        [-ch * 0.25, 0.86],
        [-ch, 1],
        [-thick + ch * 0.6, 1],
        [-thick, 0.86],
        [-thick, 0],
      ];
      return [...half, ...half.slice(1, -1).reverse().map(([a, b]): [number, number] => [a, -b])];
    };
    const np = prof(0).length;
    grid(mb, 150, np, (s, v) => {
      const th = s * TH;
      const pr = prof(th);
      const f = v * np;
      const j = Math.floor(f) % np;
      const t = f - Math.floor(f);
      const a = pr[j];
      const b2 = pr[(j + 1) % np];
      const rho = r(th) + a[0] + (b2[0] - a[0]) * t;
      const zz = (a[1] + (b2[1] - a[1]) * t) * (wz(th) / 2);
      const d = dir(th);
      return [cC[0] + d[0] * rho, cC[1] + d[1] * rho, zz];
    }, flamed, { wrapV: true });
    // the eye
    const re = r(TH) * 1.05;
    lathe2(mb, [cC[0], cC[1], -wz(TH) * 0.52], 1, [
      [0.001, 0],
      [re * 0.9, 0],
      [re, wz(TH) * 0.08],
      [re, wz(TH) * 0.96],
      [re * 0.9, wz(TH) * 1.04],
      [0.001, wz(TH) * 1.04],
    ], flamed);
  }

  // ---- bridge (maple), cut from its outline, standing on the arch at the f-holes' notches
  const ub = xb / B;
  const yArchB = yTop(xb, sp.bridgeW * 0.32);
  const yBtop = (z: number) => yArchB + sp.bridgeH - (z * z) / (2 * sp.bridgeR);
  bridge(mb, g.id, sp, xb, yArchB, (z) => yTop(xb, z));
  void ub;
  // ---- strings' geometry; tailpiece, saddle, end button or endpin, chinrest
  const zN = [0, 1, 2, 3].map((i) => (1.5 - i) * sp.spreadN);
  const zB = [0, 1, 2, 3].map((i) => (1.5 - i) * sp.spreadB);
  const yB = zB.map((z) => yBtop(z) + 0.0004);
  const after = L / 6;
  const tpTop = xb + after;
  const tpEnd = B - 0.012 * S;
  const tpY0 = yTop(tpTop, 0) + 0.011 * S ** 0.8;
  const tpY1 = sp.edgeT + 0.005 * S;
  const tailEnd: Vec3[] = zB.map((z, i): Vec3 => [tpTop + 0.012 * S ** 0.7 + (i === 3 ? 0.012 * S ** 0.7 : 0), tpY0 + 0.0045 * S ** 0.7, z * 0.62]);
  tailpiece(mb, g.id, sp, tpTop, tpEnd, tpY0, tpY1, tailEnd, S);
  // the saddle and the tailgut to the end
  {
    const ys = yTop(B - 0.004 * S, 0);
    grid(mb, 6, 12, (s, v) => {
      const a = v * Math.PI * 2;
      return [B - 0.006 * S + Math.cos(a) * 0.0035 * S ** 0.6, ys + 0.0012 * S ** 0.6 + Math.max(-0.002, Math.sin(a)) * 0.002 * S ** 0.6, (s - 0.5) * 0.034 * S ** 0.8];
    }, M.fittings, { wrapV: true });
    for (const sgn of [-1, 1]) tube(mb, [[tpEnd + 0.002 * S, tpY1 + 0.0015 * S, sgn * 0.0035 * S ** 0.7], [B - 0.006 * S, ys + 0.0035 * S ** 0.6, sgn * 0.004 * S ** 0.7], [B + 0.0022 * S, sp.edgeT * 0.4, sgn * 0.003 * S ** 0.7], [B + 0.003 * S, -ribH(B) * 0.5, 0]], 0.0009 * S ** 0.6, 8, M.gut);
  }
  if (g.id === 'cello') {
    // endpin: the socket (ebony, with its collar) and the steel rod (to the floor, set below)
    const yc = -ribH(B) / 2;
    mb.with(chain(translate(B, yc, 0), rotZ(-Math.PI / 2)), () =>
      lathe(mb, [[0, -0.003], [0.0175, -0.003], [0.019, 0.004], [0.017, 0.012], [0.0185, 0.016], [0.0185, 0.022], [0.012, 0.028], [0.009, 0.042], [0.0105, 0.044], [0.0105, 0.05], [0, 0.05]], 28, M.fittings),
    );
  } else {
    // the end button, and a chinrest on the bass side of the tailpiece
    mb.with(chain(translate(B, -ribH(B) / 2, 0), rotZ(-Math.PI / 2)), () => lathe(mb, [[0, -0.001], [0.0045, -0.001], [0.0052, 0.002], [0.0042, 0.004], [0.0056, 0.0065], [0.0045, 0.0095], [0, 0.0102]], 18, M.fittings));
    chinrest(mb, sp, B, yTop, ribH, S);
  }
  // the strings' silk at the tailpiece (the colours a maker uses to mark each string); the strings
  // themselves are drawn each frame as wires (poseBowed)
  for (let i = 0; i < 4; i++) {
    const r = Math.max(sp.dia[i] / 2, 0.00018);
    const br: Vec3 = [xb, yB[i], zB[i]];
    const te = tailEnd[i];
    const silk = [M.silkGold, M.silk, M.silkGold, M.silk][i];
    const dirT = norm(sub(br, te));
    tube(mb, [te, add(te, scale(dirT, 0.012 * S ** 0.7))], r * 1.4, 10, silk);
  }
  // ---- the bow (along +x from the frog's hair end, stick above the hair at +y)
  const hairLen = g.bowLength;
  const bm = new MeshBuilder();
  buildBow(bm, sp, hairLen);

  // ---- placement in the world
  let T: Mat4;
  let floorY: number;
  if (g.id === 'cello') {
    // standing on its endpin, leaning back towards the (absent) player
    const lean = 0.32;
    const tailY = 0.33;
    // local x (scroll → tail) down, local y (the top's normal) towards the front (−z), local z across
    const R0 = new Float32Array([0, -1, 0, 0, 0, 0, -1, 0, 1, 0, 0, 0, 0, 0, 0, 1]);
    T = chain(translate(0, tailY, 0), rotXm(lean), R0, translate(-B, sp.rib / 2, 0));
    floorY = 0;
    const base = xform(T, [B + 0.05, -sp.rib / 2, 0]);
    const dir = norm(sub(xform(T, [B + 0.2, -sp.rib / 2, 0]), base));
    const len = base[1] / Math.max(0.2, -dir[1]);
    const Tinv = invertRigid(T);
    const a = xform(Tinv, base);
    const b2 = xform(Tinv, add(base, scale(dir, len - 0.03)));
    const tip = xform(Tinv, add(base, scale(dir, len)));
    cyl(mb, a, b2, 0.0045, 0.0045, 16, M.steel);
    // the rubber stop on its point
    cyl(mb, b2, xform(Tinv, add(base, scale(dir, len - 0.004))), 0.011, 0.012, 20, M.rubber);
    cyl(mb, xform(Tinv, add(base, scale(dir, len - 0.004))), tip, 0.012, 0.009, 20, M.rubber);
  } else {
    // held at playing height on the shoulder, scroll up and to the left, top tilted up to the light
    const h = g.id === 'viola' ? 0.24 : 0.22;
    T = chain(translate(0, h, 0), rotZ(-0.12), rotXm(-0.55), translate(-B * 0.42, 0, 0));
    floorY = 0;
  }
  const c = xform(T, [B * 0.3, 0, 0]);
  const extent = B + sp.neck + sp.pegbox + sp.scroll;
  return {
    id: g.id,
    sp,
    L,
    T,
    meshes: [mb.build()],
    top: topMb.build(),
    bow: bm.build(),
    hairLen,
    xn,
    xb,
    zN,
    zB,
    yN: yNut + 0.0008,
    yB,
    tailEnd,
    pegEnd,
    fbY,
    bounds: { c: [c[0], Math.max(c[1], extent * 0.35), c[2]], r: extent * 0.9 + 0.1 },
    floorY,
    src: xform(T, [xb + 0.05, 0.05, 0]),
  };
}

const rotXm = (a: number): Mat4 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
};

/** a lathe whose axis is along z (from `at`, towards `side`·z): profile (radius, distance) */
function lathe2(mb: MeshBuilder, at: Vec3, side: number, prof: [number, number][], m: Mat): void {
  mb.with(chain(translate(at[0], at[1], at[2]), new Float32Array([1, 0, 0, 0, 0, 0, side, 0, 0, side, 0, 0, 0, 0, 0, 1])), () => lathe(mb, prof.map(([r, d]): [number, number] => [r, d]), 24, m));
}

/** the bridge: its outline (feet, legs, the arch between them, ears) with the heart and kidneys
 *  cut through, extruded thinner towards the top, the feet fitted to the arch */
function bridge(mb: MeshBuilder, id: string, sp: Spec, xb: number, yBase: number, yArch: (z: number) => number): void {
  const W = sp.bridgeW;
  const H = sp.bridgeH;
  const cello = id === 'cello';
  // half outline, from the foot's outer bottom corner up the side, over the top, (z ≥ 0), normalised
  const half: P2[] = cello
    ? [[0.5, 0], [0.5, 0.05], [0.45, 0.12], [0.4, 0.3], [0.38, 0.5], [0.42, 0.6], [0.36, 0.65], [0.41, 0.7], [0.5, 0.8], [0.48, 0.86]]
    : [[0.5, 0], [0.5, 0.06], [0.44, 0.15], [0.37, 0.32], [0.36, 0.45], [0.41, 0.53], [0.35, 0.58], [0.38, 0.64], [0.48, 0.73], [0.5, 0.8], [0.48, 0.84]];
  // the arch between the feet
  const archH = cello ? 0.36 : 0.2;
  const foot = cello ? 0.27 : 0.22;
  const inner: P2[] = [[foot, 0], [foot - 0.01, archH * 0.45], [foot * 0.6, archH * 0.9], [0, archH]];
  const top: P2[] = [];
  for (let k = 0; k <= 16; k++) {
    const z = 0.48 - (0.96 * k) / 16;
    top.push([z, 1 - ((z * W) ** 2 / (2 * sp.bridgeR)) / H]);
  }
  const ctrl: P2[] = [
    ...inner.slice().reverse().map(([z, h]): P2 => [-z, h]).slice(0, -1),
    ...inner.slice(0, -1).reverse().slice(0, 0),
  ];
  void ctrl;
  // the full outline, counter-clockwise from the right foot's inner corner
  const outline: P2[] = [
    ...inner.slice().reverse().map(([z, h]): P2 => [z, h]).reverse(),
  ];
  outline.length = 0;
  // inner arch from the left foot's inner corner over to the right foot's inner corner
  for (const [z, h] of inner) outline.push([-z, h]);
  for (const [z, h] of inner.slice(0, -1).reverse()) outline.push([z, h]);
  // the right side up (feet → top), the top arc right → left, the left side down
  for (const p of half) outline.push(p);
  for (const p of top) outline.push(p);
  for (const [z, h] of half.slice().reverse()) outline.push([-z, h]);
  const smooth = spline(outline, 3, true);
  // holes: the heart and the kidneys
  const heartAt = cello ? 0.62 : 0.5;
  const heart: P2[] = [];
  for (let k = 0; k < 24; k++) {
    const t = (k / 24) * Math.PI * 2;
    // a heart curve, point down
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    heart.push([(x / 16) * (cello ? 0.075 : 0.07), heartAt + (y / 17) * (cello ? 0.07 : 0.085)]);
  }
  const kid = (cz: number, ch: number, rot: number): P2[] =>
    Array.from({ length: 16 }, (_, k): P2 => {
      const t = (k / 16) * Math.PI * 2;
      const a = 0.06 * Math.cos(t);
      const b = 0.028 * Math.sin(t);
      return [cz + a * Math.cos(rot) - b * Math.sin(rot), ch + a * Math.sin(rot) + b * Math.cos(rot)];
    });
  const holes = cello ? [heart] : [heart, kid(-0.19, 0.69, 0.5), kid(0.19, 0.69, -0.5)];
  // to metres (z across, y up), the feet following the arch
  const toY = (z: number, h: number) => {
    const fit = 1 - sstep(0, 0.12, h);
    return yBase + h * H + fit * (yArch(z * W) - yBase);
  };
  const th = (h: number) => (0.0042 * (W / 0.041) ** 0.7) * (1 - h) + (0.0014 * (W / 0.041) ** 0.7) * h;
  const contour = smooth.map(([z, h]) => new Vector2(z, h));
  const hv = holes.map((hp) => hp.map(([z, h]) => new Vector2(z, h)));
  const faces = ShapeUtils.triangulateShape(contour, hv);
  const all: P2[] = [...smooth, ...holes.flat()];
  for (const side of [-1, 1]) {
    const P = (i: number): Vec3 => [xb + (side * th(all[i][1])) / 2, toY(all[i][0], all[i][1]), all[i][0] * W];
    const nn: Vec3 = [side, 0, 0];
    for (const [a, b, c] of faces) mb.stri(P(a), P(b), P(c), nn, nn, nn, M.bridgeMaple);
  }
  // the walls round every contour
  for (const loop of [smooth, ...holes]) {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = loop[i];
      const c = loop[(i + 1) % n];
      const tz = c[0] - a[0];
      const th2 = c[1] - a[1];
      const l = Math.hypot(tz, th2) || 1;
      const nn = norm([0, -tz / l, th2 / l]);
      const A0: Vec3 = [xb - th(a[1]) / 2, toY(a[0], a[1]), a[0] * W];
      const A1: Vec3 = [xb + th(a[1]) / 2, toY(a[0], a[1]), a[0] * W];
      const C0: Vec3 = [xb - th(c[1]) / 2, toY(c[0], c[1]), c[0] * W];
      const C1: Vec3 = [xb + th(c[1]) / 2, toY(c[0], c[1]), c[0] * W];
      mb.stri(A0, A1, C1, nn, nn, nn, M.bridgeMaple);
      mb.stri(A0, C1, C0, nn, nn, nn, M.bridgeMaple);
    }
  }
}

/** the tailpiece: an ebony slab, waisted, crowned, its fret and string holes, a fine tuner */
function tailpiece(mb: MeshBuilder, id: string, sp: Spec, x0: number, x1: number, y0: number, y1: number, ends: Vec3[], S: number): void {
  const wTop = sp.spreadB * 3.7;
  const wBot = sp.spreadB * 1.55;
  const th0 = 0.0095 * S ** 0.75;
  const th1 = 0.0068 * S ** 0.75;
  const width = (s: number) => {
    const w = wBot + (wTop - wBot) * Math.pow(1 - s, 1.35);
    // the rounded top end
    const round = s < 0.06 ? Math.sqrt(Math.max(0, 1 - ((0.06 - s) / 0.06) ** 2)) : 1;
    return w * (0.75 + 0.25 * round);
  };
  const L = x1 - x0;
  grid(mb, 36, 24, (s, v) => {
    const x = x0 + s * L;
    const w = width(s);
    const yb = y0 + (y1 - y0) * s;
    const th = th0 + (th1 - th0) * s;
    const a = v * Math.PI * 2;
    // section: a flattened rounded rectangle, the top crowned
    const cz = Math.cos(a);
    const sz2 = Math.sin(a);
    const zz = (Math.sign(cz) * Math.pow(Math.abs(cz), 0.35) * w) / 2;
    const yy = sz2 >= 0 ? yb + th * (0.55 + 0.45 * Math.pow(sz2, 0.4)) - 0.0012 * S ** 0.6 * Math.pow(Math.abs(cz), 3) : yb + th * 0.55 * (1 - Math.pow(-sz2, 0.4));
    return [x, yy, zz];
  }, M.fittings, { wrapV: true });
  // the fret the strings cross, and the string holes behind it
  const xf = x0 + 0.008 * S ** 0.7;
  grid(mb, 1, 12, (s, v) => {
    const a = v * Math.PI * 2;
    return [xf + Math.cos(a) * 0.0018 * S ** 0.6, y0 + th0 + 0.0012 * S ** 0.6 + Math.sin(a) * 0.0016 * S ** 0.6, (s - 0.5) * wTop * 0.86];
  }, M.boxwood, { wrapV: true });
  for (const e of ends) cyl(mb, [e[0], e[1] - 0.0045 * S ** 0.7, e[2]], [e[0], e[1] + 0.0004, e[2]], 0.0011 * S ** 0.6, 0.0011 * S ** 0.6, 10, M.hole);
  // a fine tuner on the highest string: lever, screw and its knurled head (nickel)
  const e = ends[3];
  const sc = S ** 0.55;
  cyl(mb, [e[0] - 0.004 * sc, e[1] - 0.001, e[2]], [e[0] + 0.016 * sc, e[1] + 0.003 * sc, e[2]], 0.0016 * sc, 0.0013 * sc, 12, M.nickel);
  cyl(mb, [e[0] + 0.011 * sc, e[1] - 0.002, e[2]], [e[0] + 0.011 * sc, e[1] + 0.009 * sc, e[2]], 0.0011 * sc, 0.0011 * sc, 12, M.nickel);
  cyl(mb, [e[0] + 0.011 * sc, e[1] + 0.009 * sc, e[2]], [e[0] + 0.011 * sc, e[1] + 0.0125 * sc, e[2]], 0.0032 * sc, 0.0032 * sc, 18, M.nickel);
  void id;
}

/** a chinrest (ebony) over the lower bout's edge on the bass side: a dished, rimmed cup on a
 *  pedestal, clamped to the rib by two nickel barrels */
function chinrest(mb: MeshBuilder, sp: Spec, B: number, yTop: (x: number, z: number) => number, ribH: (x: number) => number, S: number): void {
  const cx = B * 0.9;
  const cz = sp.spreadB * 3.1;
  const ra = 0.03 * S;
  const rb = 0.021 * S;
  const base = yTop(cx, cz);
  const h = 0.011 * S;
  // the cup: dished, its rim rounded over, higher on the outside
  grid(mb, 40, 16, (s, v) => {
    const a = s * Math.PI * 2;
    const x = cx + Math.cos(a) * ra * v;
    const z = cz + Math.sin(a) * rb * v;
    const lift = 0.0025 * S * Math.max(0, Math.cos(a - 0.4));
    const dish = 0.0035 * S * (1 - v * v);
    const roll = v > 0.82 ? (1 - Math.cos(((v - 0.82) / 0.18) * Math.PI * 0.5)) * h * 0.45 : 0;
    return [x, base + h + lift - dish - roll, z];
  }, M.ebony);
  // its side, tapering in to a pedestal on the plate
  grid(mb, 40, 6, (s, v) => {
    const a = s * Math.PI * 2;
    const k = 1 - 0.35 * v;
    const x = cx + Math.cos(a) * ra * k;
    const z = cz + Math.sin(a) * rb * k;
    const lift = 0.0025 * S * Math.max(0, Math.cos(a - 0.4));
    const top = base + h + lift - h * 0.45;
    const yp = yTop(Math.min(B * 0.995, x), z) + 0.0015 * S;
    return [x, top + (yp - top) * v, z];
  }, M.ebony, { flip: true });
  for (const dz of [-0.015 * S, 0.015 * S]) {
    const x = B + 0.0035 * S;
    cyl(mb, [x, 0.001, cz + dz], [x, -ribH(B) * 0.85, cz + dz], 0.0021 * S ** 0.6, 0.0021 * S ** 0.6, 16, M.nickel);
  }
}

/** the bow: stick (octagonal, cambered), head and its plate, hair, frog, winding, leather, button */
function buildBow(bm: MeshBuilder, sp: Spec, hairLen: number): void {
  const S2 = hairLen / 0.65;
  const hh = 0.0006;
  const hw = sp.hairW;
  // the hair: a flat ribbon from the frog's ferrule to the head
  grid(bm, 1, 8, (s, v) => {
    const a = v * Math.PI * 2;
    const x = s * hairLen;
    const w = hw * (1 - 0.15 * s);
    return [x, Math.sin(a) * hh, (Math.cos(a) * w) / 2];
  }, M.bowHair, { wrapV: true });
  // the stick: from the button to the head, closest to the hair in the middle
  const path: Vec3[] = [];
  const NS = 48;
  const xBack = -0.085 * S2;
  const xHead = hairLen + 0.006 * S2;
  const hgt = (x: number) => {
    const xs = x / hairLen;
    return 0.0175 * S2 - 0.0095 * S2 * Math.sin(Math.PI * clamp(xs, 0, 1)) + (xs > 0.97 ? (xs - 0.97) * 0.7 * S2 : 0);
  };
  for (let i = 0; i <= NS; i++) {
    const x = xBack + (i / NS) * (xHead - xBack);
    path.push([x, hgt(x), 0]);
  }
  const rad = (i: number) => {
    const s = i / NS;
    return (sp.stick[0] + (sp.stick[1] - sp.stick[0]) * Math.pow(Math.max(0, (s - 0.15) / 0.85), 0.8)) / 2;
  };
  tube(bm, path, rad, 8, M.pernambuco, { caps: true });
  // the head: rising from the stick and dropping to the hair, with its face plate
  {
    const x0 = hairLen - 0.004 * S2;
    const hTop = hgt(xHead) + 0.003 * S2;
    const prof: P2[] = [
      [x0, 0.0035 * S2],
      [x0 + 0.004 * S2, -0.0012],
      [hairLen + 0.0085 * S2, -0.0015],
      [hairLen + 0.0105 * S2, 0.004 * S2],
      [hairLen + 0.0095 * S2, 0.0125 * S2],
      [hairLen + 0.006 * S2, hTop],
      [hairLen - 0.002 * S2, hgt(hairLen - 0.002 * S2)],
    ];
    const t = sp.stick[1] * 1.15;
    extrudeZ(bm, spline(prof, 4, true), t, M.pernambuco);
    const plate: P2[] = [
      [hairLen + 0.0086 * S2, -0.0016],
      [hairLen + 0.0108 * S2, -0.0016],
      [hairLen + 0.0128 * S2, 0.004 * S2],
      [hairLen + 0.0116 * S2, 0.0128 * S2],
      [hairLen + 0.0096 * S2, 0.0125 * S2],
      [hairLen + 0.0105 * S2, 0.004 * S2],
    ];
    extrudeZ(bm, plate, t * 1.02, M.ivory);
  }
  // the frog (ebony): its side profile extruded, the ferrule, the slide and the pearl eye
  {
    const fl = 0.047 * S2;
    const top = hgt(-0.02 * S2) - sp.stick[0] * 0.5;
    const prof: P2[] = [
      [0.002 * S2, -0.0025],
      [-fl + 0.004 * S2, -0.0028],
      [-fl, 0.004 * S2],
      [-fl + 0.003 * S2, top - 0.001 * S2],
      [-fl + 0.012 * S2, top],
      [-0.004 * S2, top],
      [0.0, 0.006 * S2],
    ];
    const w = 0.0062 * S2;
    extrudeZ(bm, spline(prof, 3, true), w * 2, M.ebony);
    // ferrule: a silver band where the hair leaves the frog
    grid(bm, 1, 18, (s, v) => {
      const a = v * Math.PI * 2;
      return [0.0015 * S2 + s * 0.0032 * S2, 0.0012 * S2 + Math.sin(a) * 0.0042 * S2, Math.cos(a) * w * 1.04];
    }, M.silver, { wrapV: true });
    // the slide (pearl) on the hair's side of the frog and the eyes
    grid(bm, 1, 1, (s, v) => [-fl + 0.004 * S2 + s * (fl - 0.005 * S2), -0.0029, (v - 0.5) * w * 1.6], M.pearl);
    for (const sd of [-1, 1]) lathe2(bm, [-0.022 * S2, 0.006 * S2, sd * w * 1.0], sd, [[0.0001, 0], [0.0028, 0], [0.0028, 0.0004], [0.0001, 0.0005]], M.pearl);
    // the silver underslide along the frog's back
    grid(bm, 1, 1, (s, v) => [-fl + 0.0005 + s * 0.006 * S2, 0.003 * S2 + v * 0.008 * S2, w * 1.01], M.silver);
  }
  // the winding (silver wire) and the thumb leather, the button (ebony with silver rings)
  const at = (x: number): Vec3 => [x, hgt(x), 0];
  tube(bm, [at(0.004 * S2), at(0.034 * S2)], sp.stick[0] / 2 + 0.0004, 16, M.silver);
  tube(bm, [at(-0.008 * S2), at(0.004 * S2)], sp.stick[0] / 2 + 0.0006, 16, M.leather);
  const xb = xBack;
  for (const [a, b, r, m] of [[0, 0.004, 1.02, M.silver], [0.004, 0.013, 1.0, M.ebony], [0.013, 0.016, 1.02, M.silver]] as [number, number, number, Mat][])
    cyl(bm, [xb - a * S2, hgt(xb), 0], [xb - b * S2, hgt(xb), 0], (sp.stick[0] / 2) * r * 1.05, (sp.stick[0] / 2) * r * 1.05, 16, m);
}

/** a flat profile in x–y extruded across z (thickness t, centred), its walls smooth */
function extrudeZ(mb: MeshBuilder, prof: P2[], t: number, m: Mat): void {
  const contour = prof.map(([x, y]) => new Vector2(x, y));
  const faces = ShapeUtils.triangulateShape(contour, []);
  for (const side of [-1, 1]) {
    const nn: Vec3 = [0, 0, side];
    for (const [a, b, c] of faces) mb.stri([prof[a][0], prof[a][1], (side * t) / 2], [prof[b][0], prof[b][1], (side * t) / 2], [prof[c][0], prof[c][1], (side * t) / 2], nn, nn, nn, m);
  }
  const n = prof.length;
  const nrm = prof.map((_, i): Vec3 => {
    const a = prof[(i + n - 1) % n];
    const b = prof[(i + 1) % n];
    return norm([b[1] - a[1], -(b[0] - a[0]), 0]);
  });
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const A0: Vec3 = [prof[i][0], prof[i][1], -t / 2];
    const A1: Vec3 = [prof[i][0], prof[i][1], t / 2];
    const C0: Vec3 = [prof[j][0], prof[j][1], -t / 2];
    const C1: Vec3 = [prof[j][0], prof[j][1], t / 2];
    mb.stri(A0, A1, C1, nrm[i], nrm[i], nrm[j], m);
    mb.stri(A0, C1, C0, nrm[i], nrm[j], nrm[j], m);
  }
}

/** inverse of a rotation + translation */
function invertRigid(m: Mat4): Mat4 {
  const r = new Float32Array([m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1]);
  const t = xform(r, [m[12], m[13], m[14]]);
  r[12] = -t[0];
  r[13] = -t[1];
  r[14] = -t[2];
  return r;
}

const C = {
  verm: (a: number) => ink(INK.vermilion, a),
  amber: (a: number) => ink(INK.amber, a),
};

export function poseBowed(b: Batch, bm: BowedModel, fr: VisualFrame | null, str: { of(v: number): number }, modes: Float32Array): void {
  const { T, sp } = bm;
  for (const m of bm.meshes) b.mesh(m, T);
  b.mesh(bm.top, T);
  b.ov.amps.set(modes);
  b.ov.mn.set(plateModes(0.55));
  b.ov.modalGain = 0.55;
  const W = (p: Vec3) => xform(T, p);
  const strs = fr?.strings;
  const focus = fr?.focus ?? null;
  const bowedIdx = strs ? strs.findIndex((s) => s.bowing) : -1;
  // strings: their glow while they sound; the stopping point; the bowed one's shape
  let mx = 0;
  if (focus) for (const s of focus.shapes) for (let i = 0; i < s.length; i++) mx = Math.max(mx, Math.abs(s[i]));
  const sc = str.of(mx);
  const at = (i: number, x: number): Vec3 => {
    const f = (x - bm.xn) / (bm.xb - bm.xn);
    return [x, bm.yN + (bm.yB[i] - bm.yN) * f, bm.zN[i] + (bm.zB[i] - bm.zN[i]) * f];
  };
  // the bow's direction across the strings: tangent to the bridge arc at the bowed string
  const bi = bowedIdx >= 0 ? bowedIdx : 1;
  const zb = bm.zB[bi];
  const slopeZ = -zb / sp.bridgeR;
  const dirL = norm([0, slopeZ, 1]); // along the hair, local (from frog → tip: towards +z)
  const upL = norm(cross(dirL, [1, 0, 0])); // away from the top: the stick's side
  const beta = focus ? Math.max(0.03, Math.min(0.3, 1 - focus.hammerAt)) : 0.1;
  for (let i = 0; i < 4; i++) {
    const s = strs?.[i];
    const l = s ? Math.min(1, s.level * 3) : 0;
    const br = at(i, bm.xb);
    // the string: peg → nut → bridge → tailpiece (wound strings darker than plain steel)
    const col: RGBA = sp.wound[i] ? [0.6, 0.6, 0.62, 1] : [0.82, 0.83, 0.85, 1];
    b.wire([W(bm.pegEnd[i]), W(at(i, bm.xn)), W(br), W(bm.tailEnd[i])], col, sp.dia[i]);
    const stopFrac = s ? (s.stopNow ?? s.stop) : 1;
    const xs = bm.xb - stopFrac * bm.L;
    if (l > 0.03) b.line([W(at(i, Math.max(bm.xn, xs))), W(br)], s?.bowing ? C.verm(0.18 + 0.45 * l) : C.amber(0.12 + 0.4 * l), 1.4);
    // the stopping point: a glowing bar on the fingerboard under the string
    if (s && s.stop < 0.999 && s.level > 0.002) {
      const y = bm.fbY(xs) + 0.0006;
      const zc = at(i, xs)[2];
      const half = sp.spreadN * 0.75;
      b.line([W([xs, y, zc - half * 1.6]), W([xs, y, zc + half * 1.6])], C.amber(0.24), 14);
      b.line([W([xs, y, zc - half]), W([xs, y, zc + half])], C.amber(0.9), 6);
      b.line([W([xs, y, zc]), W(at(i, xs))], C.amber(0.7), 2.5);
    }
    // the bowed string, moving in the bowing direction between the stop and the bridge
    if (focus && i === bowedIdx && focus.shapes[0]) {
      const sh = focus.shapes[0];
      const x0 = Math.max(bm.xn, xs);
      const line: Vec3[] = [];
      for (let k = 0; k < sh.length; k++) {
        const x = x0 + (k / (sh.length - 1)) * (bm.xb - x0);
        const p = at(i, x);
        const d = (sh[k] / sc) * 0.008 * (sp.body / 0.356);
        line.push(W(add(p, scale(dirL, d))));
      }
      b.line(line, C.verm(0.85), 1.8);
    }
  }
  // the bow: hair on the bowed string at its contact point, at the hair position along the bow
  const bow = fr?.bow;
  const contactX = bm.xb - beta * (strs?.[bi] ? (strs[bi].stopNow ?? strs[bi].stop) : 1) * bm.L;
  const contact = at(bi, contactX);
  const pos = bow ? bow.pos : 0.5;
  const ax = dirL;
  const ay = upL;
  const az = cross(ax, ay);
  const origin = sub(add(contact, scale(ay, 0.0012)), scale(ax, pos * bm.hairLen));
  const Bm = new Float32Array([ax[0], ax[1], ax[2], 0, ay[0], ay[1], ay[2], 0, az[0], az[1], az[2], 0, origin[0], origin[1], origin[2], 1]);
  const bowM = mul(T, Bm);
  b.mesh(bm.bow, bowM, bow?.changing ? [0.95, 0.65, 0.27, 0.3] : null);
  if (bow && bowedIdx >= 0) {
    const c = W(contact);
    const n = norm(xdir(T, upL));
    b.line([sub(c, scale(n, 0.002)), add(c, scale(n, 0.004))], C.verm(0.85), 5);
  }
}

/** a default camera for each */
export function bowedTarget(bm: BowedModel): Vec3 {
  return bm.bounds.c;
}
export { lerp3, rotY };
