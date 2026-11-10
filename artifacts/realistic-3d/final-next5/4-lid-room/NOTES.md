# NEXT5 item 4: the 3D lid, on its sticks, and the room as a pool of light

Branch `improve/next5-lid`, on `main` at `3066879` (Orchestra URL, #28). Brief:
`.autopilot/briefs/NEXT5-4-LID.md` (with `STANDING-PREFS.md` and `ART-DIRECTION.md`). No audio code
touched: the lid and the room are the engine's own `lid` and `room` parameters, set as the 2D grips
set them.

Every picture is before (top, or left on a phone) and after (bottom, or right). "Before" is `main` at
`3066879`, built and served beside the branch. Desktop 1440×900 @2×, phone 390×844 @3×.

## What it was

In 3D the stage had no handle at all: the 2D grips (the room's edge, the lid's edge) hide in 3D, so the
lid and the reverb could only be changed by going back to 2D. The grand's lid did follow the parameter,
but on a prop stick that stretched: a cylinder from a fixed point on the rim to a fixed point under the
lid, as long as it had to be (0.40 m at half stick, 0.88 m at full), its foot standing loose on the rim's
top (`close-bracket-full.jpg`, top). On a phone, a new lid opening framed the camera again, so the
picture jumped as the lid moved.

## What it does now

**The lid is taken anywhere on it and turned on its hinge** (mouse or finger). The point taken stays
under the pointer: each move tries every opening a hundredth apart and keeps the one that puts that point
nearest the pointer, then refines it to a thousandth (`handles3d.ts` `lidFor`). The sound follows while
it moves (the engine's `lid`: a high shelf on the direct sound, post.ts).

**It stands on real sticks.** A grand carries two lid props, a long one and a short "half stick"; the
short stick's cup is the one nearer the lid's edge, the long stick's further in, and a Steinway-style
stick is 31″ (0.79 m) long ([relativekeys, "Piano lid props"](https://relativekeys.blogspot.com/2011/09/technical-tuesday-piano-lid-props.html);
[luxury-pianos.com, "How to open a piano lid"](https://luxury-pianos.com/how-to-open-a-piano-lid/);
[Steve's Piano Service, grand hardware](https://www.stevespianoservice.com/Online-Piano-Parts-Catalog/grand-piano-hardware.htm)).
Here: a long stick of 0.85 m and a short one of 0.41 m, each a fixed length on its own pivot (a brass
knuckle on a brass bracket inside the bentside), each with its own brass cup under the lid. Folded, each
lies in a felt-topped cradle along the rim, under the shut lid and over the strings (the long one towards
the tail, the short one towards the keys).

A stick of fixed length on a fixed pivot holds a lid at one opening only, so, as on a real piano, the
hand holds the lid in between. **Let go, the lid comes down onto the highest stick under it, or shut**
(within 5 % under a stick's rest it is put up onto that stick). It falls as a weight does, gathering
speed: from the long stick to shut in 0.45 s. The stick for the rest under the lid swings up into its cup
(τ 70 ms), the other folds into its cradle; a lid held a little lower than a stick's top presses the
stick down, so no stick ever goes through the lid (`lid3d.test.ts` checks every opening a hundredth
apart). The rests, the engine's lid: 1 (40°, the long stick), 0.45 (18°, the short stick), 0.

**The room is the pool of light on the floor.** Its radius is the room: 0.75 of the instrument's radius
in the driest room, 1.5 of it in the largest (`scenes3d.ts` `poolRadius`), so in the default rooms it
lights the floor about as far as the floor's glow reached before. Its rim is the handle: pulled out, a larger hall and a longer
reverb (T₆₀ 0.7 + 1.7·room s, as on the 2D stage); pushed in, a drier one. Under a mouse the rim
brightens a little; held, it stays bright. The pool's light follows the sound in the room: the output's
level, its reverberation's tail included, so a larger room's light lingers longer. It is light on the
floor, not a drawn wave: nothing is drawn over the 3D picture.

**Nothing new in the chrome**, no new words on the stage and no tooltip for a pointer: the lid and the
pool are their own affordances (the cursor turns to a hand over them). The 2D grips stay in the page in
3D, unseen until the keyboard focuses them, over the handle they move: there the arrows step the lid
from rest to rest (it is put up, or comes down) and the room by 0.05, with the value read out as in 2D.

**The camera never moves with the lid.** A grand is framed with its lid wide open whatever its opening
(the framing counts the lid at full stick), so on a phone the picture stays still while the lid moves.
At the default lid (open) the framing is the same as before.

## Pictures

Each `*.jpg` but the sequences is a pair, before over after (a phone's side by side); the close-ups are
from the same camera on both builds.

| | |
|---|---|
| lid on its long stick (1) | `desktop-lid-100.jpg`, `phone-lid-100.jpg` |
| lid on its short stick (0.45) | `desktop-lid-45.jpg`, `phone-lid-45.jpg` |
| lid shut | `desktop-lid-0.jpg`, `phone-lid-0.jpg` |
| the room, driest / largest | `desktop-room-0.jpg`, `desktop-room-100.jpg` (and phone) |
| the room with a chord ringing | `desktop-room-played.jpg` |
| the cello's room | `desktop-cello-room-0.jpg`, `desktop-cello-room-100.jpg` |
| the sticks close up: the bracket, the sticks from the side at full and half stick, the cups, folded | `close-*.jpg` |
| the upright (no lid handle: its top is not a lid that opens on a stick; the room's pool is there) | `desktop-upright.jpg`, `phone-upright.jpg` |
| the handles in use | `desktop-sequence.jpg`, `phone-sequence.jpg` (stills), `desktop-clip.mp4`, `phone-clip.mp4` |

## Not done

* **The upright has no lid handle.** Its engine `lid` (0.35 by default) stands for how open its case is;
  its 3D model shows it as a technician sees it, the upper front panel off. A U1's top is a flap on a
  piano hinge with no stick, and the brief says not to invent a grand-style lid on it. The room's pool
  works on it as on every single instrument.
* **No pool in an ensemble.** Its parts each have their own engine and room; the 2D stage has no room
  grip in an ensemble either.
* **A lid set between rests in 2D** (the 2D grip still sets any opening) is drawn in 3D at that opening
  with the stick under it up and the lid above it, as if held. It comes down onto that stick the moment
  it is taken and let go in 3D.

## Cost

The frame (`scripts/fps-3d.mjs`, 1440×900 @2×, mean ms a frame, frame rate unlimited):

| | before | after |
|---|---|---|
| grand, lid open (its mirror on) | 4.31 | 4.31 |
| upright | 2.37 | 2.35 |
| cello | 2.58 | 2.54 |

The sticks are two meshes posed by a matrix each (the old stick was built again for every new opening:
dragged, that would have left a GPU buffer behind for each). Pointing at a handle tests one ray against
the lid's two faces, the floor, and the boxes of what is drawn, on pointer moves only: 0.05 ms over the
lid or the rim (where the boxes are tested), 0.01 ms elsewhere; a drag's move, 0.01 ms (the grand,
1440×900 @2×, timed in the page).

## Checks

* `apps/web/test/lid3d.test.ts`: the sticks' lengths and cups, folded clear of the lid and the strings,
  never through the lid at any opening, the pose for each rest, where a lid let go of comes down and how
  fast, the drag solved back from a picture of the hero camera, the pool's radius ↔ room, the framing
  independent of the lid.
* e2e "3D: the grand’s lid is taken and comes down onto its stick …" (desktop: mouse; phone: touch): the
  lid follows the hand, comes down onto the short stick and then shut, the sticks swing, the camera stays,
  the keyboard steps it back up; the pool's rim pulled out and pushed in moves the room and its read-out.
* The 2D e2e "room and lid are dragged on the stage (and work from the keyboard)" passes as it was.
* Whole suites: typecheck; `pnpm test` 43 files, 428 tests; Playwright 121 passed, 15 skipped (as on
  `main`), desktop and Pixel 7. No WebGL message in any of the shots (`shots-lid-room.mjs` counts them).

Tools: `scripts/shots-lid-room.mjs` (the pairs' raw shots; `scripts/pairs-next5-webgl.py` lays them
out), `scripts/clip-lid-room.mjs` (the clip and its stills).
