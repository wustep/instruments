// F-holes, constructed.
//
// The outlines in outlines.ts carry an f-hole traced from a photograph, row by row: a lumpy polygon
// (a wobbling stem, a bulge at the middle, eyes that are not round, hooks left open where the trace
// lost the thin channel). Smoothing it more would only rub out the nicks and the eyes. So the hole is
// laid out the way a maker draws one, and the trace and its photograph give only the measurements:
//
//   two eyes, round: the upper one (towards the neck) smaller and nearer the centre line, the lower
//     one larger and farther out;
//   a stem between them, an S: the opening's centre line a smooth curve through three points, widest
//     at the middle;
//   at each end the stem turns through an arc (the hook) and runs into its eye along a tangent: the
//     hook's outer edge becomes the eye's own circle, its inner edge meets that circle at a point (the
//     wing's tip), and the opening is narrowest there;
//   two nicks at the middle, one in each edge, on the bridge line.
//
// Everything is in body lengths (u along the body from the neck end, z out from the centre line), for
// the bass side; the treble side is its mirror image. A new instrument needs one `FHole` (a double
// bass: its own eyes, turns, stem and widths).
import { CELLO, VIOLIN, type Outline } from './outlines.ts';
import { BASS } from './bass-outline.ts';

type P2 = [number, number];

export interface FHole {
  /** the upper eye: centre (u, z) and radius */
  upper: [number, number, number];
  /** the lower eye: centre (u, z) and radius */
  lower: [number, number, number];
  /** each hook's turn, upper then lower: the centre (u, z) and radius of the arc the opening's centre
   *  line turns through between the stem and the eye */
  turn: [[number, number, number], [number, number, number]];
  /** the stem's centre line: where it leaves the upper hook, the middle (on the bridge line, where
   *  the nicks are cut), where it enters the lower hook */
  stem: [P2, P2, P2];
  /** the opening's width at the upper wing's tip, in the upper turn, at the stem's three points, in
   *  the lower turn, at the lower wing's tip */
  width: [number, number, number, number, number, number, number];
  /** the nicks: how deep, and how wide at the mouth */
  nick: [number, number];
}

/** A. Stradivari's "Francesca" (the Met's violin, 356 mm body; violin-front.jpg): eyes 7.5 and 10 mm
 *  across, the stem 5.4 mm at the nicks, 72 mm from end to end. The viola's is the same hole on its
 *  longer body. */
const VIOLIN_F: FHole = {
  upper: [0.469, 0.0715, 0.0105],
  lower: [0.6155, 0.1728, 0.014],
  turn: [[0.4665, 0.0895, 0.0155], [0.6205, 0.1512, 0.0253]],
  stem: [[0.487, 0.111], [0.5484, 0.1175], [0.598, 0.1235]],
  width: [0.0045, 0.0072, 0.011, 0.0152, 0.0115, 0.0075, 0.0052],
  nick: [0.0026, 0.0042],
};
/** J.-B. Vuillaume's cello (the Met's, 755 mm body; cello-front.jpg): eyes 14 and 18 mm across, the
 *  stem 10.7 mm at the nicks, 132 mm from end to end */
const CELLO_F: FHole = {
  upper: [0.4545, 0.0735, 0.0092],
  lower: [0.5835, 0.1555, 0.0122],
  turn: [[0.4515, 0.0895, 0.0145], [0.5865, 0.139, 0.0172]],
  stem: [[0.47, 0.1085], [0.5205, 0.1115], [0.568, 0.1168]],
  width: [0.0042, 0.007, 0.0105, 0.0142, 0.0108, 0.0072, 0.0048],
  nick: [0.0021, 0.0034],
};

/** A 3/4 double bass (1110 mm body; bass-outline.ts): the cello's hole drawn longer and more upright, as
 *  a bass's are: 245 mm from end to end, eyes 22 and 30 mm across, the stem 15 mm at the nicks, which
 *  sit on the bridge line 125 mm out from the centre (makers' figures for orchestral 3/4 basses) */
export const BASS_F: FHole = {
  upper: [0.472, 0.073, 0.0099],
  lower: [0.644, 0.163, 0.0135],
  turn: [[0.468, 0.091, 0.0155], [0.648, 0.145, 0.019]],
  stem: [[0.493, 0.1117], [0.56, 0.115], [0.623, 0.1208]],
  width: [0.004, 0.0067, 0.01, 0.0135, 0.0103, 0.0068, 0.0046],
  nick: [0.002, 0.0032],
};

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const rot = (a: P2, t: number): P2 => [a[0] * Math.cos(t) - a[1] * Math.sin(t), a[0] * Math.sin(t) + a[1] * Math.cos(t)];
const unit = (a: P2): P2 => {
  const l = Math.hypot(a[0], a[1]) || 1;
  return [a[0] / l, a[1] / l];
};

/** A hook's centre line from the stem's end S to its eye, turning anticlockwise (u to the right, z
 *  up) all the way: straight to the turn's circle, round it, straight on to the circle half a throat
 *  inside the eye's, arriving along its tangent. Returns the points and where the turn's middle is. */
function hook(S: P2, H: P2, rho: number, E: P2, rhoE: number): { pts: P2[]; mid: number } {
  // the tangent from S onto the turn's circle (the centre on the left of the way)
  const hs = sub(S, H);
  const beta = Math.acos(Math.min(1, rho / Math.hypot(hs[0], hs[1])));
  const A = ((): P2 => {
    for (const sg of [1, -1]) {
      const r = rot(unit(hs), sg * beta);
      const a: P2 = [H[0] + rho * r[0], H[1] + rho * r[1]];
      // anticlockwise there: the way on is a quarter turn left of the radius
      if ((a[0] - S[0]) * -r[1] + (a[1] - S[1]) * r[0] > 0) return a;
    }
    return S;
  })();
  // the tangent the two circles share on the same side
  const D = sub(E, H);
  const dist = Math.hypot(D[0], D[1]);
  const run = Math.sqrt(Math.max(1e-12, dist * dist - (rhoE - rho) ** 2));
  const d = rot(unit(D), -Math.atan2(rhoE - rho, run));
  const n: P2 = [-d[1], d[0]];
  const Ph: P2 = [H[0] - rho * n[0], H[1] - rho * n[1]];
  const Pe: P2 = [E[0] - rhoE * n[0], E[1] - rhoE * n[1]];
  const pts: P2[] = [];
  const line = (a: P2, b: P2, k: number, last: boolean) => {
    for (let j = 0; j < k + (last ? 1 : 0); j++) pts.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  };
  line(S, A, 8, false);
  const a0 = Math.atan2(A[1] - H[1], A[0] - H[0]);
  let a1 = Math.atan2(Ph[1] - H[1], Ph[0] - H[0]);
  while (a1 < a0) a1 += 2 * Math.PI;
  const k = Math.max(4, Math.ceil((a1 - a0) / 0.07));
  const mid = pts.length + Math.round(k / 2);
  for (let j = 0; j < k; j++) pts.push([H[0] + rho * Math.cos(a0 + ((a1 - a0) * j) / k), H[1] + rho * Math.sin(a0 + ((a1 - a0) * j) / k)]);
  line(Ph, Pe, 12, true);
  return { pts, mid };
}

/** the closed outline of a constructed f-hole (bass side), a polygon fine enough to be a curve at any
 *  zoom the stage reaches (about 500 points) */
export function fholeOutline(f: FHole): P2[] {
  const E1: P2 = [f.upper[0], f.upper[1]];
  const E2: P2 = [f.lower[0], f.lower[1]];
  const r1 = f.upper[2];
  const r2 = f.lower[2];
  const [Su, Mid, Sl] = f.stem;
  const W = f.width;
  // the lower hook as it stands; the upper one is drawn the same way from the stem to its eye, then
  // walked backwards (the whole way from the upper eye to the lower is an S: a turn to the right, then
  // one to the left)
  const up = hook(Su, [f.turn[0][0], f.turn[0][1]], f.turn[0][2], E1, r1 - W[0] / 2);
  const lo = hook(Sl, [f.turn[1][0], f.turn[1][1]], f.turn[1][2], E2, r2 - W[6] / 2);
  // the stem: through its three points, leaving and entering the hooks along their own lines
  const Q = [Su, Mid, Sl];
  const d = [Math.hypot(Mid[0] - Su[0], Mid[1] - Su[1]), Math.hypot(Sl[0] - Mid[0], Sl[1] - Mid[1])];
  const m: P2[] = [
    unit(sub(Su, up.pts[1])),
    [0, 1].map((k) => (((Sl[k] - Mid[k]) / d[1]) * d[0] + ((Mid[k] - Su[k]) / d[0]) * d[1]) / (d[0] + d[1])) as P2,
    unit(sub(lo.pts[1], Sl)),
  ];
  const M = 40;
  const stem: P2[] = [];
  for (let i = 0; i < 2; i++)
    for (let j = 1; j <= (i ? M - 1 : M); j++) {
      const t = j / M;
      const h00 = 2 * t ** 3 - 3 * t * t + 1;
      const h10 = t ** 3 - 2 * t * t + t;
      const h01 = -2 * t ** 3 + 3 * t * t;
      const h11 = t ** 3 - t * t;
      stem.push([0, 1].map((k) => h00 * Q[i][k] + h10 * d[i] * m[i][k] + h01 * Q[i + 1][k] + h11 * d[i] * m[i + 1][k]) as P2);
    }
  const head = up.pts.slice().reverse();
  const S: P2[] = [...head, ...stem, ...lo.pts];
  const N = S.length;
  // the width along it: eased between the seven places it is given at
  const at = [0, head.length - 1 - up.mid, head.length - 1, head.length - 1 + M, head.length + stem.length, head.length + stem.length + lo.mid, N - 1];
  const len = [0];
  for (let i = 1; i < N; i++) len.push(len[i - 1] + Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1]));
  const width = (i: number) => {
    let k = 0;
    while (k < 5 && i > at[k + 1]) k++;
    const t = Math.max(0, Math.min(1, (len[i] - len[at[k]]) / (len[at[k + 1]] - len[at[k]])));
    return W[k] + (W[k + 1] - W[k]) * t * t * (3 - 2 * t);
  };
  // its two edges (left and right of the way from the upper eye to the lower)
  const L: P2[] = [];
  const R: P2[] = [];
  const Nrm: P2[] = [];
  for (let i = 0; i < N; i++) {
    const t = unit(sub(S[Math.min(N - 1, i + 1)], S[Math.max(0, i - 1)]));
    const w = width(i);
    Nrm.push([-t[1], t[0]]);
    L.push([S[i][0] - (t[1] * w) / 2, S[i][1] + (t[0] * w) / 2]);
    R.push([S[i][0] + (t[1] * w) / 2, S[i][1] - (t[0] * w) / 2]);
  }
  // the nicks: a small V in each edge at the middle of the stem, pointing away from it
  const mid = at[3];
  const ds = (len[mid + 4] - len[mid - 4]) / 8;
  const kN = Math.max(1, Math.round(f.nick[1] / 2 / ds));
  const nick = (Ed: P2[], sign: 1 | -1): P2[] => {
    const apex: P2 = [Ed[mid][0] + sign * Nrm[mid][0] * f.nick[0], Ed[mid][1] + sign * Nrm[mid][1] * f.nick[0]];
    return [...Ed.slice(0, mid - kN + 1), apex, ...Ed.slice(mid + kN)];
  };
  const Ln = nick(L, 1);
  const Rn = nick(R, -1);
  // where each hook's inner edge crosses its eye's circle (the wing's tip): the right edge at the upper
  // eye, the left one at the lower
  const cut = (Ed: P2[], E: P2, r: number, fromStart: boolean): { i: number; x: P2 } => {
    const n = Ed.length;
    const out = (p: P2) => Math.hypot(p[0] - E[0], p[1] - E[1]) > r;
    for (let s = 1; s < n; s++) {
      const i = fromStart ? s : n - 1 - s;
      if (!out(Ed[i])) continue;
      const a = Ed[fromStart ? i - 1 : i + 1];
      const b = Ed[i];
      let lo2 = 0;
      let hi = 1;
      for (let it = 0; it < 30; it++) {
        const t = (lo2 + hi) / 2;
        if (out([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) hi = t;
        else lo2 = t;
      }
      return { i, x: [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi] };
    }
    return { i: fromStart ? 1 : n - 2, x: Ed[fromStart ? 0 : n - 1] };
  };
  const xr = cut(Rn, E1, r1, true);
  const xl = cut(Ln, E2, r2, false);
  // round each eye, anticlockwise, from where the hook's outer edge has become the circle to the wing's tip
  const arc = (E: P2, r: number, from: P2, to: P2): P2[] => {
    const a0 = Math.atan2(from[1] - E[1], from[0] - E[0]);
    let a1 = Math.atan2(to[1] - E[1], to[0] - E[0]);
    while (a1 <= a0) a1 += 2 * Math.PI;
    const k = Math.max(8, Math.ceil(((a1 - a0) / (2 * Math.PI)) * 90));
    const o: P2[] = [];
    for (let j = 1; j < k; j++) o.push([E[0] + r * Math.cos(a0 + ((a1 - a0) * j) / k), E[1] + r * Math.sin(a0 + ((a1 - a0) * j) / k)]);
    return o;
  };
  return [xr.x, ...Rn.slice(xr.i), ...arc(E2, r2, Rn[Rn.length - 1], xl.x), xl.x, ...Ln.slice(0, xl.i + 1).reverse(), ...arc(E1, r1, Ln[0], xr.x)];
}

const made = new Map<FHole, P2[]>();
/** the f-hole of the instrument an outline was traced from (the bass side, in body lengths) */
export function fholeOf(ol: Outline): P2[] {
  const f = ol === CELLO ? CELLO_F : ol === VIOLIN ? VIOLIN_F : ol === BASS ? BASS_F : null;
  if (!f) return ol.fhole;
  let p = made.get(f);
  if (!p) made.set(f, (p = fholeOutline(f)));
  return p;
}
