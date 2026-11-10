# The 3D piano's lid and reverb: back to the grips

Branch `fix/lid-reverb-toggles`, on `main` at `c40967c` (#35). Brief: `.autopilot/briefs/LID-TOGGLES.md`.
Stephen: *"I'd like to turn the lid + reverb back into toggles (in 3d piano though, there's only three
notches and it forces you into a notch)"*.

No audio code touched: the lid and the room are still the engine's `lid` and `room`, set the way the
2D grips have always set them.

## What git history shows

There were never on/off buttons called "lid" or "reverb". Before #29 (`3066879`) the two controls were
the stage's **grips** (`gripLid`, `gripRoom` in `views/stage.ts`): continuous, any lid opening 0–1, any
room 0–1 (T₆₀ 0.7–2.4 s). In 3D both were hidden, so you went back to 2D to change them; the 3D lid
followed the value on one stick that stretched (0.40–0.88 m).

#29 (`5ffac9e`) left the grips hidden in 3D (reachable only by the keyboard) and made two things on the
3D stage the controls:

- **the lid**: grab it anywhere and turn it on its hinge. On release it **fell onto a rest**: the long
  stick (1), the short stick (0.45) or shut (`lidRest`, `lidSettle`). The arrow keys jumped from rest to
  rest (`lidStep`). That is the three-notch snap.
- **the room**: grab the rim of the pool of light on the floor and pull it out or in.

## What it does now

**The grips are the controls in 2D and in 3D, and they work the same way.** Drag a grip and the value
follows it continuously. Let go and it stays where it is: any opening, any room. The arrow keys move
either one by 0.05, as in 2D. Hovering or holding a grip shows its tooltip (`lid · 73 % open`,
`reverb · 1.6 s`), as in 2D.

- **The lid's grip sits on the 3D lid's free edge**: by default on the treble side's straight run, where
  you lift a real grand's lid (the 2D grip sits on the same edge). If that point is off the picture,
  for example the fully open lid cropped at the top on desktop, it moves to the next point round the
  bentside or the tail (`piano3d.ts` `lidGripPoints`, every 12 cm, 4 cm in from the edge). While you
  drag, the lid turns so that the point under the grip stays under the pointer (`handles3d.ts`
  `lidFor`, solved to 0.001), the same way the 2D grip keeps the 2D lid's edge under the pointer.
- **The room's grip sits where it does in 2D**, with the same drag: its x is the room's right edge
  (0.55 + 0.45·room of the stage's width). In 3D it is level with the floor under the instrument, the
  pool's centre (`stage3d.ts` `poolCentre`). At mid-height it would cover the lid's grip on a phone.
  The pool of light still shows the room, and its rim brightens while the grip is under the pointer,
  held or focused.
- **Gone:** grabbing the 3D lid anywhere, its fall onto a rest (`lidRest` / `lidSettle` / `lidStep`),
  grabbing the pool's rim, and the hit testing behind both (`lidRay`, `rayAt`, `floorHit`, `blocked`,
  `invert4`, `poolRoom`). Also gone: the CSS that hid the grips in 3D.

**Kept from #29:** the two fixed-length prop sticks on their brass bracket, their cups and felt
cradles, and the rule that no stick goes through the lid at any opening. Also kept: the pool of light on
the floor, and framing the grand with its lid wide open, so moving the lid never moves the camera.

**Which stick holds the lid (`ui/lid.ts` `lidStick`).** Now that the lid can stop anywhere, it stands on
the shortest stick that reaches it:

| opening | stick |
|---|---|
| 0 | none (both folded) |
| up to 0.45 | the short stick, pressed down below its rest |
| 0.45 | the short stick, in its cup |
| above 0.45 | the long stick, pressed down |
| 1 | the long stick, in its cup |

A stick "pressed down" has its tip against the lid's underside. The unit test checks that at every
opening from 0.01 to 1, a hundredth apart, that tip touches the underside, sits inside the lid's
outline, and never goes through it. Before, a lid set between the rests (from 2D, or by `setParams`)
floated over a stick that didn't reach it (0.73: the short stick stood up about 25 cm short of the lid), or over
no stick at all (0.3).

## Numbers

The same drag on both builds: take the lid's control at full stick, bring it down below 0.75, and let
go (`scripts/shots-lid-toggles.mjs`; desktop with the mouse, Pixel-width phone with touch):

| | held | 0.9 s after letting go | sticks |
|---|---|---|---|
| before (`main` `c40967c`) | 0.74 | **0.45** (fell onto the short stick) | short up |
| after | 0.74 | **0.74** (stays) | long, pressed down |

Frame cost (`scripts/fps-3d.mjs`, 1440×900 @2×, mean ms a frame, two runs each): grand 4.52 / 4.58
before, 4.53 / 4.74 after (CPU 3.96 / 3.88 vs 3.97 / 3.89); cello 2.68 / 2.77 vs 2.71 / 2.77. No
WebGL message in any shot on either build.

## Pictures

Each pair is before (top on desktop, left on a phone) and after. Desktop 1440×900 @2×, phone 390×844
@3×. "Before" is `main` at `c40967c`, built and served beside the branch, with the same parameters.

| | |
|---|---|
| lid on the long stick (1), with both grips showing after | `desktop-lid-100.jpg`, `phone-lid-100.jpg` |
| **lid at 0.73**, between the old rests: before, the short stick stands under it with a gap; after, the long stick, pressed down, holds it | `desktop-lid-73.jpg`, `phone-lid-73.jpg` |
| lid on the short stick (0.45) | `desktop-lid-45.jpg`, `phone-lid-45.jpg` |
| **lid at 0.3**, under half stick: before, held by nothing; after, on the short stick, pressed down | `desktop-lid-30.jpg`, `phone-lid-30.jpg` |
| lid shut | `desktop-lid-0.jpg`, `phone-lid-0.jpg` |
| the room, driest and largest (the pool of light, and after, its grip) | `desktop-room-0.jpg`, `desktop-room-100.jpg` (and phone) |
| **the drag**: held at 0.74, then 0.9 s after letting go (before → 0.45, after → 0.74) | `desktop-drag-sequence.jpg`, `phone-drag-sequence.jpg` |
| the grips in use: the lid let go at 71–73 % and at 29 %, lifted back to full stick, the room's grip pulled out and pushed back in with a chord ringing (the white dot is the pointer, drawn for the recording only) | `desktop-grips-in-use.jpg`, `phone-grips-in-use.jpg`, `desktop-clip.mp4`, `phone-clip.mp4` |

## Checks

- `apps/web/test/lid3d.test.ts` (8): the sticks' lengths and cups; folded clear of the lid and the
  strings; never through the lid at any opening; **at every opening, the stick that holds it touches
  the underside inside the outline**; **posed at 1, 0.73, 0.3 and 0, with no rest anywhere**; the
  grip's points on the free edge; the opening found back from the grip's pointer at eight openings,
  including 0.92, 0.73, 0.31 and 0.12, and clamped past either end; the pool's radius; the framing
  independent of the lid.
- e2e "3D: the grand's lid and the room are set by their grips …" (desktop, mouse; phone, touch): both
  grips visible in 3D; the lid brought down to between 0.55 and 0.8 and let go stays there exactly,
  held by the long stick; lower than 0.3, it stays, and the short stick swings up; the camera never
  moves; ArrowUp / ArrowUp / ArrowDown move it by +0.05, +0.05, −0.05; the room's grip pulled right
  and pushed left, its read-out following; the tooltip on hover.
- The 2D e2e tests "room and lid are dragged on the stage …" and "icon-only stage controls …" pass
  unchanged.

Tools: `scripts/shots-lid-toggles.mjs` (the pairs' raw shots and the drag, on either build),
`scripts/clip-lid-room.mjs` (rewritten to drive the grips: the clip and its stills).

## Not done

- **No new chrome.** The grips are the same 14×28 px pills as in 2D. Nothing on the stage says what
  they are apart from the tooltip on hover, focus or hold.
- **The upright has no lid grip in 3D**, as before #29 and after it. Its 3D model shows the case with
  its upper front panel off, and it has no stick lid. Its room grip works like everyone else's.
- **No grips in an ensemble or a key's close-up**, as before.
