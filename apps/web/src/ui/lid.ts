// A grand's lid: which stick holds it, where it can rest, and how it comes onto a rest. A grand has
// two prop sticks (the 3D stage builds them: gl/piano3d.ts), each a fixed length on a fixed pivot: up
// in its own cup, the long one holds the lid at the engine's lid = 1 ("full stick"), the short one at
// LID_HALF ("half stick"). So a 3D lid rests in one of three places: shut, on the short stick, on the
// long stick (`LID_RESTS`), and its knob has those three notches. Held in the hand between them, a lid
// lower than a stick's rest presses that stick down, its tip against the lid's underside (`lidStick`);
// let go, it comes onto the nearest rest (`lidNotch`, `lidSettle`). The 2D stage draws the lid from
// above, without sticks: its knob sets any opening (0 … 1).
// No three.js here: the stage view and the tests use it without the 3D chunk.

/** the short stick's rest (the engine's lid; 18° on a lid that opens 40° on its long stick) */
export const LID_HALF = 0.45;
/** where the 3D lid can rest (the engine's lid): shut, on the short stick, on the long stick */
export const LID_RESTS: readonly number[] = [0, LID_HALF, 1];
/** The stick that holds the lid at opening `v` (the engine's lid), by its rest: the short one up to
 *  its own rest (pressed down below it), the long one above that, none when the lid is shut. */
export function lidStick(v: number): number {
  if (v < 0.005) return 0;
  return v <= LID_HALF + 0.005 ? LID_HALF : 1;
}
/** the rest nearest opening `v`: where a 3D lid let go of at `v` comes to (halfway between two, the
 *  higher: the stick is reached before the lid drops past it) */
export function lidNotch(v: number): number {
  let best = LID_RESTS[0];
  for (const r of LID_RESTS) if (Math.abs(r - v) <= Math.abs(best - v) + 1e-9) best = r;
  return best;
}
/** whether `v` is one of the rests (to the engine's hundredths) */
export const onNotch = (v: number): boolean => LID_RESTS.some((r) => Math.abs(r - v) < 0.005);
/** the rest after `v` going up (`dir` 1) or down (−1); `v` itself between two rests steps to the next
 *  one that way, and past the end stays there */
export function lidNotchStep(v: number, dir: 1 | -1): number {
  if (dir > 0) return LID_RESTS.find((r) => r > v + 0.005) ?? LID_RESTS[LID_RESTS.length - 1];
  return [...LID_RESTS].reverse().find((r) => r < v - 0.005) ?? LID_RESTS[0];
}
/** A lid let go of, or its knob turned to another notch: the picture's lid swinging from `v0` onto
 *  `rest` (the engine's lid is already there). Its opening `t` seconds on, and whether it has landed.
 *  Coming down it falls (accelerating); put up, the hand eases it in. Shut from the long stick takes
 *  ≈ 0.45 s; a short swing ≈ 0.15 s. */
export function lidSettle(v0: number, rest: number, t: number): { v: number; done: boolean } {
  const dv = rest - v0;
  if (Math.abs(dv) < 1e-4) return { v: rest, done: true };
  const dur = 0.12 + 0.33 * Math.sqrt(Math.abs(dv));
  const u = Math.min(1, Math.max(0, t / dur));
  const e = dv < 0 ? u * u : 1 - (1 - u) * (1 - u);
  return { v: u >= 1 ? rest : v0 + dv * e, done: u >= 1 };
}
