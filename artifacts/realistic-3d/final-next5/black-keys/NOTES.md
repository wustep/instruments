# Black keys black underneath, and no red play-tint on the 3D pianos

Brief: `.autopilot/briefs/BLACK-KEYS.md`. Branch `fix/black-keys` from `main` at `ed48ecb` (#24).
3D grand and upright only (the orchestra's 3D pianos share the same code). 2D, the keyboard strip and
the engine are untouched.

## What was wrong

### 1. A sharp was open underneath

`keyTop()` in `apps/web/src/ui/gl/piano3d.ts` builds a sharp as a loft from its foot ring (`lo`, at
723 mm) up to its top ring (`hi`), then a bevel and a top cap, all `M.ebony`. The foot ring was never
closed, so the sharp was a shell with no underside: 12 open edges round its foot and **0 mm²** of
downward-facing face.

A sharp overhangs its key stick (13.7 mm over 10.4 mm, 1.65 mm each side), so from below the eye looked
past the stick into the shell, at the inside of its top and sides. In a key's 3D close-up the stage
draws every face seen from its inside as a cut face (the section's solid-looking cuts), so an open
sharp there showed cut-face colour where its ebony underside should be. That happens wherever the
section or the eye gets under a sharp.

**Fix:** an ebony cap on the foot ring, facing down (`fanCap(mb, lo, y0, M.ebony, false)`). The mesh is
shared by every sharp of both pianos and by the close-up, so it covers grand, upright and the 3D
close-up. The key stick under it is still wood and the white keys are still ivory.

| sharp (C♯4) | before | after |
|---|---|---|
| downward-facing area | 0 mm² | 1301 mm² (13.7 × 95 mm, less the rounded corners) |
| open edges | 12 | 0 |
| faces not ebony | 0 | 0 |

The same on the grand and the upright. (The mesh's triangle winding doesn't matter here: `three3d.ts`
rewinds every face to its normals before drawing.)

**How visible it was.** In the stage's usual framings a sharp's underside is barely exposed. The
keybed and the orbit's keep-out box keep the camera from getting under the keyboard, and the close-up
looks from just above the keys. So most app shots look the same before and after for this fix. The
geometry view (`pairs/detail-sharp-underside.jpg`, drawn from the meshes themselves by
`scripts/black-key-underside.py`, magenta = a face seen from its inside) shows the hole and its fix,
and the unit test measures it.

### 2. In 3D a played piano turned red and orange

Stephen: "for the pianos on 3d, don't turn the string/key/etc red when playing them (just on 3d)".

`posePiano()` tinted the played parts through the per-instance glow (the material's emissive):

| constant | what it lit | colour, amount |
|---|---|---|
| `VERM` | a sounding key's top and its key stick | vermilion, 0.32 |
| `GLOW_HELD` | a held key's top and stick | amber, 0.12 |
| `GLOW_JACK` | the jack while its hammer was in flight | vermilion, 0.25 |
| `headGlow` | the hammer head past 60 % of its travel | vermilion, up to 0.6 |
| `GLOW_DAMP` | a lifted damper | amber, 0.18 |
| `PEDAL_GLOW` | a pedal pressed | amber, 0.15 |

`pianoStrings()` also drew additive glow lines:

* a vermilion line over every sounding string (alpha 0.12 to 0.62 by its level);
* an amber line over every sympathetic one;
* the live string shape as a 2.2 px vermilion line (struck strings) or a 1.2 px amber line
  (sympathetic), drawn up to 12 mm off the wire.

**Fix:**

* `posePiano()` passes no glow. The only one left is the case's dissolve, a visibility cue rather than
  a play tint.
* `pianoStrings()` draws no glow lines. A sounding or sympathetic string is now its own wire (steel,
  or the copper winding over its core) in its live shape (the engine's) along the speaking length. It
  swings at most 4 mm (`STRING_SWING`) at the loudest string's antinode: a few wire diameters, so it
  reads as the wire moving rather than a line beside it.
* In the light scene (slow devices), which skips every other idle string, a moving string is always
  drawn.
* The played parts show only their real motion, as before: the key dips, the wippen and jack rise,
  the jack trips, the hammer flies and checks, the damper lifts.
* The 3D scene's `sounding` input (`PianoIn`, `SceneIn`, `EnsPartIn`, `views/stage.ts`) fed only the
  tint, so it is gone. The keyboard strip still asks `audio.isSounding`.

**Unchanged:** both 2D styles' highlights (`2d-*` shots: the sounding strings and keys still lit), the
2D action close-up, the on-screen keyboard strip's highlight, materials, lighting, the lid, the case's
dissolve, and all audio (no engine file changed).

## Confirmed before fixing

* **Production** (https://instruments-wustep.vercel.app, `ed48ecb`): `prod-before/` has the tinted
  keys and sticks on the grand, the orange string glow, and the tinted jack and damper on the upright
  in the close-up at the strike.
* **Locally:** the same at `ed48ecb` (`before/`). The open foot was measured on the mesh (table above).

## Tests

`apps/web/test/models3d.test.ts`, two new tests (each about 5 ms):

* *a sharp is ebony on every face and closed*: on the grand and the upright, for A♯0, C♯4 and A♯7:
  every vertex is ebony; the downward-facing area is at least 97 % of 13.7 × 95 mm, at 723 mm; no open
  edge.
* *in 3D a played piano tints nothing*: on each piano a chord of white and black keys (G3 B♭3 C4 C♯4
  E4 F♯4) is held, struck, with sustain and soft down, for 40 frames that include the hammer past
  60 % and the damper lifted. Asserted:
  * no mesh instance carries any glow;
  * no glow line is drawn;
  * the struck strings' wires swing 4 mm and the sympathetic one 1.2 mm;
  * an idle string stays straight.

Run against the old `piano3d.ts`, both fail:

* `grand 22: expected 0 to be greater than 0.001262455`
* `grand: a played part tinted: expected 1 to be +0`

## Artifacts

* `before/`, `after/`: desktop 1440×900. `scripts/shots-black-keys.mjs` (BASE, OUT, ONLY=2d|3d) takes
  these frames:
  * the hero view with a chord held;
  * the action with the case hidden, at rest and with the chord held;
  * C♯4's close-up at rest, at the strike (60 ms), held, and from the orbit's lowest pitch;
  * 2D default and vector with the same chord (the control);
  * `geometry-*-sharp-underside`: the C♯4 key from below (`scripts/black-key-mesh.ts` dumps the key's
    meshes, with `MODEL=` naming an older piano3d module for the before; `scripts/black-key-underside.py`
    draws them).
* `pairs/`: each frame before | after, plus `detail-*.jpg` enlargements where the tint was
  (`scripts/pairs-black-keys.py`).
* `prod-before/`: production before the fix.

## Left as it is

* The sharp's foot stands 1 mm above its key stick's top (723 vs 722 mm), as before. Now that the
  underside is closed, that gap shows ebony over wood.
* The vibration amplitude (4 mm at the loudest) is a judgement call: the old overlay used 12 mm. The
  constant is `STRING_SWING`.
