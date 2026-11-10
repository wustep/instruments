// The volute's plan: where every string, pipe and bar is, in metres, seen from above (x to the
// right, z towards the viewer; the hub's centre at the origin). The 2D stage draws this plan and the
// 3D stage builds it; the sizes are the engine's (voluteGeometry: string lengths, pipe lengths and
// diameters, bar lengths).
import { voluteGeometry, VOLUTE_PIPE_LO, type VoluteNote } from '@piano-model/engine';

export type P2 = [number, number];
export interface VolutePlan {
  hubR: number;
  bridgeR: number;
  notes: VoluteNote[];
  /** each string: on the bridge, under the band, and at its hitch pin on the frame */
  strings: { midi: number; a: P2; band: P2; b: P2; dir: P2; wound: boolean }[];
  /** each pipe (C3–C6), standing on the frame: centre, radius, height */
  pipes: { midi: number; c: P2; r: number; len: number }[];
  /** each bar, lying radially outside the pipes: inner and outer end, width */
  bars: { midi: number; a: P2; b: P2; w: number }[];
  /** the frame: a closed outline (the spiral's inner edge out, its outer edge back) and the column
   *  that closes the turn from the treble end to the bass end */
  frame: P2[];
  column: [P2, P2];
  columnW: number;
  /** the two rails the bars lie on, through their nodes (22.4 % of the length from each end) */
  rails: [P2[], P2[]];
  /** the twelve sympathetic strings on the hub, C to B: a star inside the bridge */
  halo: { a: P2; b: P2 }[];
  /** the whole plan's box */
  box: { x0: number; z0: number; x1: number; z1: number };
}

/** the turn the plan is drawn at: the bass strings to the lower left, the column at the bottom */
const ROT = -2.05;
/** the band: this fraction of each string from the bridge (the engine's BETA) */
export const VOLUTE_BAND = 0.09;
const et = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const polar = (r: number, a: number): P2 => [r * Math.cos(a + ROT), -r * Math.sin(a + ROT)];

let cached: VolutePlan | null = null;
export function volutePlan(): VolutePlan {
  if (cached) return cached;
  const g = voluteGeometry();
  const notes = g.notes;
  const n = notes.length;
  const step = notes[1].angle - notes[0].angle;
  // the frame's radii at any (fractional) note: the strings' law continued
  const lenAt = (i: number) => 0.16 * Math.sqrt(et(notes[n - 1].midi) / et(notes[0].midi + i));
  const pipeDAt = (i: number) => 0.06 * Math.pow(2, -(Math.max(notes[0].midi + i, VOLUTE_PIPE_LO) - VOLUTE_PIPE_LO) / 16);
  const inner = (i: number) => g.bridgeR + lenAt(i) - 0.014;
  const outer = (i: number) => g.bridgeR + lenAt(i) + 0.03 + pipeDAt(i);
  const strings = notes.map((s) => {
    const dir = polar(1, s.angle);
    return {
      midi: s.midi,
      a: polar(g.bridgeR, s.angle),
      band: polar(g.bridgeR + VOLUTE_BAND * s.string, s.angle),
      b: polar(s.hitch, s.angle),
      dir,
      // the lowest octave and a half is wound (copper on steel)
      wound: s.midi < 55,
    };
  });
  const pipes = notes
    .filter((s) => s.midi >= VOLUTE_PIPE_LO)
    .map((s) => ({ midi: s.midi, c: polar(s.hitch + 0.016 + s.pipeD / 2, s.angle), r: s.pipeD / 2, len: s.pipe }));
  const bars = notes
    .filter((s) => s.midi >= VOLUTE_PIPE_LO)
    .map((s) => {
      const r0 = outer(s.midi - notes[0].midi) + 0.035;
      return { midi: s.midi, a: polar(r0, s.angle), b: polar(r0 + s.bar, s.angle), w: 0.026 + 0.012 * (s.bar / 0.4) };
    });
  const frame: P2[] = [];
  const K = 4;
  for (let k = -2; k <= (n - 1) * K + 2; k++) frame.push(polar(inner(k / K), (k / K) * step));
  for (let k = (n - 1) * K + 2; k >= -2; k--) frame.push(polar(outer(k / K), (k / K) * step));
  const mid = (i: number) => (inner(i) + outer(i)) / 2;
  const column: [P2, P2] = [polar(mid(n - 1 + 0.5), (n - 1 + 0.5) * step), polar(mid(-0.5), 2 * Math.PI - 0.5 * step)];
  const rail = (u: number) => bars.map((b): P2 => [b.a[0] + (b.b[0] - b.a[0]) * u, b.a[1] + (b.b[1] - b.a[1]) * u]);
  const halo = Array.from({ length: 12 }, (_, j) => {
    const a = (j / 12) * 2 * Math.PI + 0.13;
    // C the longest, B the shortest
    return { a: polar(0.045, a), b: polar(0.235 - 0.07 * (j / 11), a) };
  });
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of [...frame, ...bars.map((b) => b.b), ...column]) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    z0 = Math.min(z0, p[1]);
    z1 = Math.max(z1, p[1]);
  }
  cached = { hubR: g.hubR, bridgeR: g.bridgeR, notes, strings, pipes, bars, frame, column, columnW: 0.05, rails: [rail(0.224), rail(0.776)], halo, box: { x0: x0 - 0.02, z0: z0 - 0.02, x1: x1 + 0.02, z1: z1 + 0.02 } };
  return cached;
}

/** The hub's mode shapes over the disc, for drawing: (nodal diameters n, nodal circles s) in the
 *  order of the engine's modes. The first eight are a free plate's (Leissa 1969), with its nodal
 *  circles where his tables put them ((0,1) at 0.68 of the radius, (1,1) 0.78, (2,1) 0.82, (0,2)
 *  0.39 and 0.84); the dense ones above are given plausible shapes in order. */
const HUB_SHAPES: [number, number][] = [
  [2, 0], [0, 1], [3, 0], [1, 1], [4, 0], [5, 0], [2, 1], [0, 2],
];
const NODES: Record<string, number[]> = { '0,1': [0.68], '1,1': [0.781], '2,1': [0.822], '0,2': [0.391, 0.841] };
export function hubMode(k: number, rho: number, theta: number): number {
  let n: number;
  let s: number;
  if (k < HUB_SHAPES.length) [n, s] = HUB_SHAPES[k];
  else {
    n = (k * 5) % 7;
    s = 1 + Math.floor((k - HUB_SHAPES.length) / 5);
  }
  let r = Math.pow(rho, n);
  const nodes = NODES[`${n},${s}`];
  if (nodes) for (const q of nodes) r *= 1 - (rho * rho) / (q * q);
  else if (s > 0) r *= Math.cos(Math.PI * (s + 0.3) * rho);
  return r * Math.cos(n * theta + k * 0.7);
}
