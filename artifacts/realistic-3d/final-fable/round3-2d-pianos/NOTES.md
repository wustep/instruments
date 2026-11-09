# Round 3: the pianos' 2D stage, back to a diagram

Files: `apps/web/src/ui/piano-draw.ts` (shared parts and the upright), `apps/web/src/ui/grand-plan.ts`
(the grand). 1725 lines before, 826 after. No engine, stage, 3D or e2e file was touched.

Sheets (before on top or left, after below or right; 1440×900 and 390×844, a pedalled C2 C3 G3 E4 G4 C5):
`upright-desktop.jpg`, `upright-phone.jpg`, `grand-desktop.jpg`, `grand-phone.jpg`.

## Restored (the 63c5266 look)

* The string waves read again: nothing is drawn over or around them. A struck string's shape is a firm
  1.5 px line over a soft 4.5 px glow; the focus note's unison shapes (vermilion, amber, steel) are
  1.7 px over a 5 px glow; amplitudes are the old ones or a little larger.
* Sounding strings are lit at the old weight (1 to 2.6 px per wire) with a soft bloom under the unison.
* The soundboard's mode field covers the whole case of both pianos again (it only showed through the
  plate's windows). It is drawn a little oversize so its bright still edge falls outside the case, and
  at 0.5 (upright) and 0.65 (grand) so the nodal lines stay behind the waves.
* Hammers and dampers are two quiet rows of marks, as the old dashes were.

## Removed

Upright: the key row with its red key fronts, the fallboard and keybed, wippens, backchecks, catchers,
bridle tapes and hooks, shanks, the hammer rail, the action brackets, hammer heads and damper heads as
hardware, the muffler rail, the gold plate with its windows, the pin block band, the pin field, agraffes,
the pressure bar as hardware, understring felt, hitch pins, the dead string lengths, the spruce grain,
and the oblique projection that stacked all of it into bands.

Grand: the gold plate with its windows and cast lips, rosettes, flange and bolts, the four struts and
their shadows, the pin block and three rows of tuning pins, agraffes and the capo bar, understring and
hitch felts, hitch pins, the dead string lengths, the hammer rest cloth, the damper guide rail, shanks,
hammer heads with crowns and string grooves, damper heads with chamfers and brass bosses, the fallboard,
the board's grain and ribs.

## What is left, and why

* Upright: a rounded outline of the case, the strings hanging from one hairline (the pressure bar), the
  wound bass crossing the tenor, the two bridges as single lines, the two rows of marks, the modes.
* Grand: the rim's silhouette from the 3D plan (it is what says "grand"), the strings, the two bridges,
  a hairline along the string fronts, the two rows of marks, the strike flare, the lid and its grip.
* Pedals still show: sustain lifts the damper marks (their edge turns amber); the grand's una corda
  slides the hammer marks to the treble and turns them amber; the upright's soft pedal brings the hammer
  marks nearer the strings (amber); the upright's muffler lays a felt line along the strike points; the
  sostenuto holds its dampers up.
* Clicking a key's strings still opens its action close-up (`stringAt` on the drawn speaking lengths).

## Layout

* Both pianos put each key's strings on the action's even pitch above the on-screen keyboard. Unisons
  are at most 2.4 px apart, so a unison reads as one string.
* The upright's height is fitted to the longest string whose key is in view (smoothed, never closer than
  0.45 of the longest string), so a phone showing two octaves shows them filling the stage instead of
  the top third. On a desktop the whole keyboard is in view and the scale is the full one.
* The static picture of each piano is one cached canvas, repainted only when the layout changes.

## Still not right

* The upright on a desktop is honest but lopsided: the treble's strings are short, so the right half of
  the case is board and modes only.
* The grand's lid edge (a vertical line with its grip) still crosses the bass strings at the default lid
  angle. It belongs to the lid control in `stage.ts`, which this pass did not own.
* The field's nodal lines are as wide as before; on a phone, where the field is stretched across a case
  five screens wide, they are soft bands rather than lines.
