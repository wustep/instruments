# The horn's orientation

Stephen, 12 Nov 2026: "the horn is facing the wrong direction in symphony mode, it faces backwards."

## What was wrong

Three pictures of the horn, three different answers to "which side is this":

| | before | |
|---|---|---|
| 3D, seated in the Orchestra | the coil stood 37° off square to the hall, the mouthpiece pointing **53° to the player's right** of the way back, the bell's rim **straight under the mouthpiece** (36 mm off it, 490 mm down) | a horn nobody could be behind: its player would sit off to one side, facing across the stage, the bell in the lap |
| 3D, alone | seen from the **player's side** (the levers, the linkage, the bell's mouth), the bell at the picture's right | the back of what the Orchestra showed: the horn's own review views call this bearing `back` |
| 2D and vector lines | the hall's layout (the bell at the left, the mouthpiece at the upper right) | the mirror image of the 3D horn alone |

So the seated horn pointed the wrong way, and the horn alone was shown from the opposite side in 3D to the one
2D and the Orchestra showed. That second one was the open "horn 2D vs 3D side" item.

## What a horn does

Held by a seated player: the mouthpiece at the lips, the leadpipe falling 30–45° towards the hall; the left hand
on the levers; the bell down beside the right hip, its mouth going back and to the player's right, away from
the hall (the right hand's place). The hall sees the valves' caps, obliquely, and the back of the bell, at its
own left.

## What changed

One side everywhere: **the hall's**. The valves' caps towards us, the bell at the picture's left going away,
the mouthpiece at the upper right going back to the player.

* **Seated (3D Orchestra)**: `horn3d.ts` `HORN_HELD` is now built about the mouthpiece's rim from two angles
  with a meaning: the leadpipe's fall from the lips (38°) and the coil's turn about the leadpipe (60°: the
  levers' side from facing the player's left round towards the lap). The mouthpiece's axis points straight
  back at the player (0.00 to either side; before 0.72 to the right); the bell's rim is 0.35 m to the player's
  right of the lips and 0.35 m under them (before 0.04 m and 0.49 m), its mouth going back (0.85) and right
  (0.48); the caps face the hall. The lips at 1.18 m, the horn's footprint over the seat's middle.
* **Alone (3D)**: the first view is from the hall's side (`HORN_VIEW` yaw π − 0.7), 40° round towards the bell,
  so the rim shows as much of its mouth as the 2D drawing's does (0.28 against the plan's 0.30). The player's
  side is a drag away, as before. A phone's swing turns back past square on, never round to the player's side.
* **2D and vector lines**: the drawing is as it was; it was already the hall's layout. Its header now says so,
  and says that the levers and their links (the player's side's) are drawn through as a diagram.
* `AGENTS.md`: a rule with its checks. `apps/web/test/horn3d.test.ts`: two new tests (the hold; the first view).

Not changed: the model, the sound, the seats' places, the routing, any other instrument.

## What is still true, and might still read as "backwards"

In the Orchestra the bell's mouth goes away from the hall. That is how a horn is held; it is not a trumpet. If
what read as backwards was the bell's back, it is the horn's, and now the horn alone shows the same side.

## Pictures

Each is before | after. `desktop-*` at 1440 × 900, `phone-*` at 390 × 844.

* alone: `*-solo-2d.jpg`, `*-solo-vector.jpg`, `*-solo-3d.jpg`
* a brass quartet: `*-quartet-{2d,vector,3d}.jpg`; the seated horn from four sides:
  `desktop-quartet-3d-horn-{front,behind,left,right}.jpg` (front is the hall's)
* seven players: `*-five-{2d,vector,3d}.jpg`
* Beethoven's eighteen (two horns side by side): `*-beethoven-{2d,vector,3d}.jpg`, `desktop-beethoven-3d-horn-*.jpg`
* Toward Morning (`/symphony`): `*-symphony-{2d,vector,3d}.jpg`, `desktop-symphony-3d-horn-*.jpg`
* Pass It On (`/passiton`): `*-passiton-{2d,vector,3d}.jpg`, `desktop-passiton-3d-horn-*.jpg`

`BASE=<url> SET=before|after node scripts/shots-horn-orientation.mjs` takes them.
