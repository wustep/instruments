// Which stick holds a grand's lid. A grand has two prop sticks (the 3D stage builds them:
// gl/piano3d.ts), each a fixed length on a fixed pivot: up in its own cup, the long one holds the lid
// at the engine's lid = 1 ("full stick"), the short one at LID_HALF ("half stick"). A lid lower than a
// stick's rest presses that stick down, its tip against the lid's underside, so the lid can stand at
// any opening the grips set (0 … 1, as on the 2D stage): on the shortest stick that reaches it.
// No three.js here: the stage view and the tests use it without the 3D chunk.

/** the short stick's rest (the engine's lid; 18° on a lid that opens 40° on its long stick) */
export const LID_HALF = 0.45;
/** The stick that holds the lid at opening `v` (the engine's lid), by its rest: the short one up to
 *  its own rest (pressed down below it), the long one above that, none when the lid is shut. */
export function lidStick(v: number): number {
  if (v < 0.005) return 0;
  return v <= LID_HALF + 0.005 ? LID_HALF : 1;
}
