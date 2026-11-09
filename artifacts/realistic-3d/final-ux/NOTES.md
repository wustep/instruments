# UI/UX: notes

Branch `improve/ui-ux`, from `main` at `4c7cd64`. The work follows `.autopilot/BRIEF-UX.md`.

The review set is `scripts/review-ux.mjs`. It renders whole pages on desktop (1440×900 at 2×) and on
a phone (390×844 at 3×):

* 2D and 3D;
* a bowed instrument;
* the trumpet in 3D;
* the knobs open;
* the MIDI player;
* keyboard focus;
* a tooltip;
* the measurements and notes pages.

## Critique and fixes
* **A 320 px phone scrolled 4 px sideways.** Round 2's middle pedal widened the bar until the
  knob toggle overran it. Below 361 px the bar's gaps now tighten from 18 to 10 px. scrollWidth at
  320/360/390 px is now 320/360/390.
* **Tooltips covered the instrument picker.** The 3d toggle's tooltip opened above the toggle,
  over the picker. Controls in the top band now take their name below them; others keep it
  above, unless there is no room.
* **Switches cut abruptly.** Changing instrument, preset or between 2D and 3D now fades the stage
  in over 220 ms (ease-out). With `prefers-reduced-motion` there is no fade.
* **The notes page was out of date.** It now covers:
  * the full pedal set on both pianos (and that the upright's half-blow and muffler levels are
    estimates);
  * the three.js 3D view;
  * the action close-ups and the 3D fly-to;
  * the case toggle (I).

  Its limits line now says what the drawings are made from.

## Checked, and fine as is
* **Focus:** all 24 focusable controls show the amber focus ring. These are the header links, the
  picker, the presets, the 3d toggle, the grips, the three pedals, the octave buttons, the knobs
  and their reset.
* **Picker:** its selected state, an amber glyph with a 4 px glow, is whole at 320, 360, 390 and
  1440 px. It has hover states.
* **No permanent explanatory text** was added to the stage. Banned fonts: none.

## Shots
* `before-after.jpg`: the tooltip before and after, and the phone set after.
* `desk-*.jpg`: the final desktop pages.
