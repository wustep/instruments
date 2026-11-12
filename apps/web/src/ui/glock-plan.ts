// The glockenspiel's plan, in metres, seen from above as its player sees it: thirty steel bars in two rows,
// the naturals near the player and the accidentals behind them, the low bars at the left. The bars are the
// engine's (glockBars: each one's length from its pitch, 251 mm at G5 to 108 mm at C8; 31.75 mm wide, 9.5 mm
// thick: an orchestral instrument's 1¼ × ⅜ in steel). Each row's bars are centred on one line, so the rows
// taper towards the treble; each bar lies on two felted rails under its nodes (0.224 of its length from
// each end), which converge as the bars shorten, and is held by a pin through each node. The case is a
// trapezoid round both rows. x to the right, y away from the player; the origin at the near left corner of
// the case.
import { GLOCK_BAR_WIDTH, glockBars, type GlockBar } from '@piano-model/engine';

export type P = [number, number];
export const BARS: GlockBar[] = glockBars();
/** bar to bar along a row (the bar and 4 mm of air) */
export const PITCH = GLOCK_BAR_WIDTH + 0.004;
export const BAR_W = GLOCK_BAR_WIDTH;
/** the case's margin round the bars */
const MARGIN = 0.03;
/** the rows' centre lines */
export const ROW_Y = [MARGIN + BARS[0].length / 2, MARGIN + BARS[0].length + 0.018 + BARS[1].length / 2];

/** each bar's centre x: the naturals side by side; an accidental between its neighbours */
export const BAR_X: number[] = (() => {
  const out = new Array<number>(BARS.length).fill(0);
  let n = 0;
  for (const b of BARS) if (!b.sharp) out[b.index] = MARGIN + PITCH / 2 + PITCH * n++;
  for (const b of BARS)
    if (b.sharp) {
      const lo = out[b.index - 1];
      const hi = b.index + 1 < BARS.length ? out[b.index + 1] : lo + PITCH;
      out[b.index] = (lo + hi) / 2;
    }
  return out;
})();
/** each bar's box (x0, y0, x1, y1) and its centre */
export const barBox = (i: number): [number, number, number, number] => {
  const y = ROW_Y[BARS[i].sharp ? 1 : 0];
  return [BAR_X[i] - BAR_W / 2, y - BARS[i].length / 2, BAR_X[i] + BAR_W / 2, y + BARS[i].length / 2];
};
export const barCentre = (i: number): P => [BAR_X[i], ROW_Y[BARS[i].sharp ? 1 : 0]];
/** where a stroke landed on bar i (the engine's: along the bar from its middle as a share of its length,
 *  across it −1 … 1): no player's two strokes land on one spot. The mallet's head keeps on the bar. */
export const strokePlace = (i: number, along = 0, across = 0): P => {
  const [x, y] = barCentre(i);
  return [x + Math.max(-1, Math.min(1, across)) * 0.25 * BAR_W, y + Math.max(-0.14, Math.min(0.14, along)) * BARS[i].length];
};
/** a bar's nodes (its pins): 0.224 of its length from each end */
export const barNodes = (i: number): [P, P] => {
  const [x, y] = barCentre(i);
  const d = (0.5 - 0.224) * BARS[i].length;
  return [[x, y - d], [x, y + d]];
};
const naturals = BARS.filter((b) => !b.sharp);
const sharps = BARS.filter((b) => b.sharp);
/** the case: a trapezoid round both rows (its right side shorter) */
export const GK_X0 = 0;
export const GK_X1 = BAR_X[naturals[naturals.length - 1].index] + PITCH / 2 + MARGIN;
export const GK_Y0 = 0;
export const GK_Y1 = ROW_Y[1] + sharps[0].length / 2 + MARGIN;
const taper = (row: number, side: 1 | -1, x: number): number => {
  const bs = row ? sharps : naturals;
  const a = bs[0];
  const b = bs[bs.length - 1];
  const u = (x - BAR_X[a.index]) / (BAR_X[b.index] - BAR_X[a.index]);
  return ROW_Y[row] + side * (0.5 * (a.length + (b.length - a.length) * u));
};
export const CASE: P[] = [
  [GK_X0, taper(0, -1, GK_X0) - MARGIN * 0.6],
  [GK_X1, taper(0, -1, GK_X1) - MARGIN * 0.6],
  [GK_X1, taper(1, 1, GK_X1) + MARGIN * 0.6],
  [GK_X0, GK_Y1],
];
/** the four rails (felt strips under the nodes), each from the row's first bar to its last */
export const RAILS: [P, P][] = [0, 1].flatMap((row) => {
  const bs = row ? sharps : naturals;
  const a = bs[0].index;
  const b = bs[bs.length - 1].index;
  return [0, 1].map((k) => [[BAR_X[a] - BAR_W * 0.7, barNodes(a)[k][1]], [BAR_X[b] + BAR_W * 0.7, barNodes(b)[k][1]]] as [P, P]);
});
/** the mallets: a head's radius, the shaft's length; at rest a mallet's head hangs over its bar's middle and
 *  its shaft runs back towards the player */
export const HEAD_R = 0.014;
export const SHAFT = 0.3;
