// The double bass's plate outline, constructed (the violin, viola and cello outlines in outlines.ts are
// traced from the Met's photographs; there is no bass among them). A 3/4 orchestral bass of the
// violin form (corners, an S of C-bouts) with the bass's sloped shoulders: the upper bouts do not
// round out from the neck as a cello's do but run down from it in a nearly straight slope, so the
// upper bout is widest well down the body, about a quarter of its length from the top.
//
// Sizes (3/4 orchestral bass; makers' standard figures, e.g. the plans and specification tables of
// orchestral 3/4 basses): body 1110 mm, upper bout 520, C-bout 375, lower bout 665, the upper corners
// about 37 % of the length down, the lower ones 55 %. The figures are held to within about 1 %
// (apps/web/test/fholes.test.ts checks the bouts against them).
//
// The same convention as a traced outline: the half-width over the body length at 481 stations, the
// outermost edge station by station, so each corner is a step (the drawing hooks it, as it does the
// traced ones: stage-draw.ts bwHookCorners, strings3d.ts hookCorners); monotone cubic between the
// points below, the steps between their pieces.
import type { Outline } from './outlines.ts';

type P2 = [number, number];

/** the outline's pieces (u along the body from the neck end, half-width; both / the body length): the
 *  sloped shoulder and upper bout to the upper corner's tip, the C-bout, the lower bout from the
 *  lower corner's tip */
const PIECES: P2[][] = [
  [
    [0, 0.072],
    [0.02, 0.088],
    [0.05, 0.11],
    [0.09, 0.138],
    [0.13, 0.166],
    [0.17, 0.192],
    [0.21, 0.213],
    [0.245, 0.2275],
    [0.275, 0.2342],
    [0.3, 0.2325],
    [0.325, 0.2255],
    [0.348, 0.2165],
  ],
  [
    [0.349, 0.1835],
    [0.37, 0.1765],
    [0.405, 0.1713],
    [0.445, 0.169],
    [0.48, 0.1696],
    [0.51, 0.174],
    [0.535, 0.1835],
    [0.551, 0.1945],
  ],
  [
    [0.552, 0.2525],
    [0.575, 0.2575],
    [0.61, 0.2665],
    [0.66, 0.282],
    [0.71, 0.2935],
    [0.76, 0.2996],
    [0.81, 0.2978],
    [0.86, 0.2865],
    [0.905, 0.266],
    [0.94, 0.239],
    [0.968, 0.2],
    [0.988, 0.148],
    [1, 0.11],
  ],
];

/** monotone cubic (Fritsch–Carlson) through points with increasing u */
function pchip(p: P2[]): (u: number) => number {
  const n = p.length;
  const h = p.slice(1).map((q, i) => q[0] - p[i][0]);
  const d = p.slice(1).map((q, i) => (q[1] - p[i][1]) / h[i]);
  const m = p.map((_, i) => {
    if (i === 0) return d[0];
    if (i === n - 1) return d[n - 2];
    if (d[i - 1] * d[i] <= 0) return 0;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    return (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  });
  return (u) => {
    let i = 0;
    while (i < n - 2 && u > p[i + 1][0]) i++;
    const t = Math.max(0, Math.min(1, (u - p[i][0]) / h[i]));
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p[i][1] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * p[i + 1][1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

function build(n: number): number[] {
  const f = PIECES.map(pchip);
  const hw: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const k = u < PIECES[1][0][0] ? 0 : u < PIECES[2][0][0] ? 1 : 2;
    hw.push(+f[k](u).toFixed(4));
  }
  // the ends as a trace sees them: nothing at the very first and last station (the drawing closes
  // them with its own caps)
  hw[0] = 0;
  hw[n - 1] = 0;
  return hw;
}

/** a 3/4 orchestral double bass, constructed: violin corners, sloped shoulders (1110 mm body) */
export const BASS: Outline = {
  hw: build(481),
  // the f-hole is constructed (fholes.ts BASS_F); no trace
  fhole: [],
  bouts: { upper: 520 / 1110, c: 375 / 1110, lower: 665 / 1110 },
};
/** the body's length, m */
export const BASS_BODY = 1.11;
