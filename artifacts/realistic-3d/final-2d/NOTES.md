# 2D visualizations: notes

Branch `improve/2d-visualizations`, from `main` at `c253ed4`. Done to `.autopilot/BRIEF-2D.md`.
Each instrument had at least two critique/fix cycles, the upright first and the most.

The lead did the upright, its close-up and the final integration pass. Three parallel passes did the
grand, the bowed strings and the winds, and they were merged here. Each instrument's folder has its
own NOTES.md, with the cycles' ranked critiques: `upright/`, `grand/`, `bowed/` and `winds/`.

## Sheets
* `before-after.jpg`: all seven at desktop size, c253ed4 against this round, the upright first.
* `before-after-phone.jpg`: the same on a 390 × 844 phone.
* `before-after-panels.jpg`: the pianos' close-up panels (the upright's, then the grand's).
* The per-instrument folders have the final shots and their own before/after.

## What changed
* **Upright** (the biggest rework).
  * It used to be a harp-like fan of strings under two rows of dashes. Now it is the upright from
    the front with its panels off, in true proportion from floor to lid, built from the 3D upright's
    measures.
  * The plate has its pin field and openings onto the soundboard. The board's modes glow only in
    those openings.
  * The strings are overstrung, with their bridges.
  * The action stands on the keybed: wippens, backchecks, catchers and bridle tapes, the shanks, a
    deep hammer rail, the hammers on the strike line, and the underdampers. Then the muffler, the
    open fallboard and a quiet row of keys.
  * The parts sit at the 3D's even 13.9 mm pitch.
  * A slight oblique projection makes a strike, a damper's lift and the half-blow rest visible.
  * Static parts are cached in two layers.
* **Upright close-up.** Redrawn as a to-scale section in the grand's style, from the 3D upright's
  parts.
  * It is now an underdamper: the damper was drawn above the hammer before.
  * The rail sits under the head.
  * The soft pedal's half-blow and the muffler work live.
* **Grand** (`grand/`). The plan from above with the lid off, built from the 3D grand:
  * the rim, the gold plate with its windows, rosettes and struts;
  * the pin rows, agraffes and capo bar;
  * the overstrung bass;
  * the hammers and the dampers 37 mm behind the strike line;
  * the una corda, sustain and sostenuto, readable.

  Its close-up is a to-scale section of the Renner/Steinway action. Both close-ups stay piano-only.
* **Violin, viola, cello** (`bowed/`).
  * The outline and f-holes are traced from the Met photographs, with varnish, purfling, and the bass
    bar and soundpost.
  * A front-view head and pegs.
  * Real string gauges, the bridge, the tailpiece and fine tuner, the cello's endpin.
  * A true-length bow, with its frog and hair, string crossings and bow changes.
  * The Helmholtz corner, shifts and vibrato.
  * The mirrored orientation is fixed.
* **Flute** (`winds/`).
  * A Boehm flute from above, polished silver, its keys closing for the engine's note through the
    mechanism (the chart is now shared with the 3D model).
  * The standing wave shows inside the bore, plus quiet lobes outside it.
  * The jet at the lip plate.
* **Trumpet** (`winds/`).
  * An orthographic view of the 3D wrap, in lacquered gold.
  * Pistons, slides (the 3rd kicks), ferrules and the Bessel bell.
  * The air path lit through the pressed valves, the standing wave along it, the lips' buzz.

## Leftovers, honestly
* **The x/depth anisotropy.** Every piano view takes x from the keyboard (about 1130 px/m) and fits
  depth or height to the stage (270–470 px/m). So angles are exaggerated and parts look squat.
* **The bowed instruments.**
  * The true-scale bow runs off the desktop stage.
  * Bow force is read from the bow trace's caption: the visual frame has no force field.
  * The scroll is constructed, not traced.
* **The flute** is small on a phone.
* **The trumpet.** The engine's brass wave keeps an antinode at the bell, which is hidden by the 1/r
  taper in the flare. The grip control overlaps the bell on desktop.
* **The room's wavefronts** start from a fixed point in `stage.ts` for the bowed and wind
  instruments.
* **Found by the 2D passes in the 3D models.**
  * The 3D grand jack tripped the wrong way: fixed in this round.
  * The 3D grand's backcheck doesn't meet the hammer's tail.
  * The 3D trumpet's 2nd crook is long (134 mm where a semitone needs 88).
  * The 3D flute's A6–C7 fall back to the foot's length.
