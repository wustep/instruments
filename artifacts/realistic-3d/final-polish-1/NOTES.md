# Polish pass 1: 3D correctness and metals

This pass is from `.autopilot/BRIEF-CONTINUOUS.md`. It fixes things the 2D passes found in the 3D models, plus one renderer bug.

* **Metals: each material's environment intensity now applies.**
  * The bug: three r186 overwrites a material's `envMapIntensity` with the scene's
    `environmentIntensity` unless the material has an `envMap` of its own. So every intensity set in
    `mats3.ts` was ignored:
    * the winds' metals, 1.4–1.6;
    * the bores and the f-holes' and the case's insides, 0.18–0.35;
    * the upright's plate, 0.75;
    * the floor, 0.35.
  * The fix: materials that set an intensity get the studio environment as their own `envMap`.
  * Effect on the lit pixels' mean luminance:
    * flute close-up 121 → 144 (+18 %), flute hero +15 %;
    * trumpet close-up 86 → 100 (+16 %), trumpet hero +16 %;
    * violin, cello, grand and upright within ±0.2 %.

  The flute's silver and the trumpet's lacquer no longer read as dark chrome. See
  `metals-before-after.jpg`.
* **Flute, 3D:** the standing wave now spans the air column's own length, as in the 2D. That is the
  engine's c / 2f, measured from the near node 50 mm above the embouchure.
  * Before, the wave ended at the open key whose note matched the bore's note. A6 to C7 are
    cross-fingered, so they matched no key and the wave fell back to the whole tube.
* **Trumpet, 3D:** the 2nd valve crook added about 134 mm of tubing. A semitone needs 88 mm
  (2^(1/12) − 1 of 1.48 m), plus about 11 mm for the bypass it replaces. It is now about 104 mm, in
  line with the 2D's 101 mm.
* **Grand, 3D:**
  * The backcheck on the key's tail stood 12 mm behind a checked hammer's tail and a little below
    it. It now meets the tail. See `grand-backcheck.jpg`, the key held.
  * The hammer still checks at the stage's shared 15 mm of travel; the 2D close-up uses 31 mm.
  * The jack's trip direction was fixed in the 2D round.
