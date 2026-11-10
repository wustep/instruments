// Where a grand's lid rests, and how it comes down onto a rest when let go of. A grand's lid stands on
// one of two prop sticks (the 3D stage builds them: gl/piano3d.ts): the long stick in its cup near the
// lid's edge (the engine's lid = 1, "full stick"), or the short one beside it ("half stick"). A stick
// is a fixed length on a fixed pivot, so it holds the lid at one opening only; in between, the hand
// holds it. (The 2D stage's lid grip sets any opening: it draws the lid from above, without sticks.)
// No three.js here: the stage view uses it before the 3D chunk loads.

/** the short stick's rest (the engine's lid; 18° on a lid that opens 40° on its long stick) */
export const LID_HALF = 0.45;
/** a lid let go of within this much (of the engine's lid) under a stick's rest is put on that stick */
const REST_TOL = 0.05;
/** where the lid can rest (the engine's lid): shut, on the short stick, on the long stick */
export const LID_RESTS: readonly number[] = [0, LID_HALF, 1];
/** where a lid let go of at `v` (the engine's lid) comes to rest: down onto the highest stick under
 *  it (or put on one it is just under), else shut. The stick for that rest is the one that is up. */
export function lidRest(v: number): number {
  if (v >= 1 - REST_TOL) return 1;
  if (v >= LID_HALF - REST_TOL) return LID_HALF;
  return 0;
}
/** the next rest above or below `v` (the keyboard steps the lid between them) */
export function lidStep(v: number, dir: 1 | -1): number {
  if (dir > 0) return LID_RESTS.find((r) => r > v + 1e-3) ?? 1;
  return [...LID_RESTS].reverse().find((r) => r < v - 1e-3) ?? 0;
}
/** A lid let go of: it comes down onto its rest under its own weight (from `v0` to `rest`, the
 *  engine's lid), or is put up onto a stick it was just under. The opening `t` seconds after, and
 *  whether it has landed. A fall from the long stick to shut takes ≈ 0.45 s. */
export function lidSettle(v0: number, rest: number, t: number): { v: number; done: boolean } {
  const dv = rest - v0;
  if (Math.abs(dv) < 1e-4) return { v: rest, done: true };
  // (falling: accelerating; put up by the hand: eased out)
  const dur = 0.12 + 0.33 * Math.sqrt(Math.abs(dv));
  const u = Math.min(1, Math.max(0, t / dur));
  const e = dv < 0 ? u * u : 1 - (1 - u) * (1 - u);
  return { v: v0 + dv * e, done: u >= 1 };
}
