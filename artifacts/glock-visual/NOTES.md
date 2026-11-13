# The glockenspiel: a visual pass

Stephen, 12 Nov 2026: "the glock could use more visual polish, it feels the most underdeveloped out of the mix."

It was: thirty flat rectangles on a brown trapezoid in 2D, and in 3D thirty grey boxes in a tray, 164 lines
against the horn's 1,200. The sound and the engine are untouched; so is the glow on a ringing bar in 3D (its
colour, its strength and when it shows are as they were: that is still Stephen's call).

## What changed

One plan still makes all three pictures (`ui/glock-plan.ts`); it now also has the case's wall and the tray
inside it, the rails' width and the pins' sizes, so 2D, vector lines and 3D agree on them.

**2D (the drawn look)**

* The case is a case: a wooden rim, lit along its top, round a dark tray, with the rim's shadow inside it and
  a plate on each corner.
* The rails are a wooden strip with felt on it (they were a black line).
* The bars stand over the tray: each casts a shadow on it, and has a bevel (its far end catches the light,
  its near end is in its own shade).
* Each bar's two pins are pins: a hole and a head with its light, at the nodes.
* Each bar is stamped with its note at its near end, as a glockenspiel's bars are (the letter, a sharp or a
  flat; no octave). Sunk into the steel, quiet; dropped when the bars are too narrow to carry it (a phone,
  an orchestra's small glockenspiel).
* A ringing bar is lit where it moves: its first bending mode along its length (the engine's own
  `barShape`), brightest at the ends and the middle and dark at the two nodes. It shows why the pins are
  where they are.
* A stroke leaves a ring where the engine says it landed, opening for a fifth of a second.
* The mallets: a tapered rattan shaft lit along one side with its own shadow, a brass head with an edge.

**Vector lines**: the same geometry as lines: the rim's inside edge and corner plates, each rail's two edges,
the pins (amber on a ringing bar), the stroke's ring.

**3D**

* The bars are brushed steel, ground along their length (`mats3.ts` `glockBar`), their top edges broken by a
  1.2 mm bevel that catches the light. They were unnamed grey boxes with no texture.
* A steel pin stands through each node of each bar (sixty), a washer under its head.
* The case is dark rosewood with its grain, its walls mitred from the plan's rim, a nickel plate on each
  corner, two catches and a strap handle on the player's side.
* The stand has a pivot bolt where each pair of legs crosses, a cradle with rubber pads under the case, and a
  second stretcher.
* The mallets have a collar under the head, a tapered shaft and a cork grip.
* The first view looks down more steeply (pitch 0.62 → 0.80, yaw 0.20 → 0.26): the stand is foreshortened, so
  the bars are larger in the same whole-instrument frame. It is still whole on a computer and a phone.

## Tried and dropped

* Anisotropic reflection on the bars' steel: on a flat face it blew out to white with a halo. The brushed
  texture alone gives the grain.
* The environment's reflection turned up on the bars (1.5, as the winds' nickel has it): a flat face turned
  up to the studio's light clips. The bars keep the scene's own.
* Red felt washers under the pins: sixty red dots. They are black.

## Not done

* The 3D bars carry no stamped note names (that needs a painted map per bar).
* No resonators: an orchestral glockenspiel has none.
* The glow in 3D: not touched.

## Checks

`apps/web/test/glock2d.test.ts` (the tray a wall inside the case; a stroke's ring; the stamps),
`glock3d.test.ts` (each bar its own size still; a pin through each node, its head 1–3 mm over the bar);
`e2e/glockenspiel.spec.ts` as it was.

## Pictures

Each is before | after. `desktop-*` at 1440 × 900, `phone-*` at 390 × 844; `rest`, `struck` (a chord, a third
of a second after its strokes), `ringing` (a second after); `desktop-3d-{close,low,behind,top}`; `*-passiton`
(seated among sixteen others).

`BASE=<url> SET=before|after node scripts/shots-glock-visual.mjs` takes them.
