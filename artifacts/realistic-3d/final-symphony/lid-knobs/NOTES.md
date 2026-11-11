# The piano's lid and reverb: rotary knobs

Branch `improve/lid-knobs`, on `main` at `bf6b62d` (#45). Brief: `.autopilot/briefs/LID-KNOBS.md`.

This is a visual and control change only. The engine is untouched: the lid and the room are still the
engine's `lid` and `room`, set to the same hundredths, and the golden and block-size tests pass
unchanged.

## What it was (#36)

The stage had two grips, small amber pills. The room's grip sat on the room's right edge and moved as
the room changed. The lid's grip sat on the lid's free edge (in 3D, on the 3D lid's edge) and moved with
the lid. Both were continuous, and the 3D lid stood at any opening on whichever stick reached it.

## What it is now

**Two rotary knobs on the stage, in 2D (classic and vector) and in 3D.** They use the fallboard knobs'
face (`.k-*`: ticks, track, the value's arc, cap and pointer, so the vector style draws them in its own
lines) on a dark disc that keeps them legible over the drawing. They carry no word. A tooltip and a
slider's accessible name say what each one is and its value (`lid · 45 % open`, `reverb · 1.2 s`), as
the grips did. They are 36 px, or 44 px under a coarse pointer (a finger).

**Turning a knob:** drag up or right for more (one turn ≈ 167 px; Shift is four times finer), the same
as the fallboard knobs. The wheel and the keyboard work too: the arrows move it by 0.05, and Home and
End go to the ends.

**Each knob sits by what it moves, in a place that does not move while you turn it.** (A grip that
followed its value, under a finger turning a knob, would slide away from the finger.)

| | 2D (classic and vector) | 3D |
|---|---|---|
| **room** | the stage's top-right corner, the corner of the room at its largest. All twelve 2D drawings leave it clear, on a laptop and on a phone. The old place (the right edge, half way down) caught the clarinet's bell and the bass's endpin on a laptop, and the horn and the timpani on a phone. | on the floor, where the pool of light at its largest ends, on the picture's right (`stage3d.ts` `roomKnob`; new `Pool.Rmax`). Turned to the top, the pool reaches the knob. The pool's rim still brightens while the knob is under the pointer, turned or focused. |
| **lid** | on the lid, by its hinge: 12 % of the case's width in from the spine, which is on the lid at every opening (the drawn lid's free edge is never nearer the spine than 26 %). On a phone, where the spine has scrolled away, it stays at the stage's left edge. | beside the lid on the treble side, 10 cm out from its free edge and 6 cm under the rim, on the case's side (`piano3d.ts` `lidKnobPoints`). It is a point of the piano, not of the lid, so the lid swinging never moves it. If the camera turns it off the picture, it moves to the next point round the bentside. |

**Room: continuous everywhere,** with the same range (0–1, T₆₀ 0.7–2.4 s). It stays wherever you let
go.

**2D lid: continuous,** wherever you let go. The 2D lid is drawn from above without sticks, so there is
nothing for it to rest on. I kept it continuous, as the brief preferred.

**3D lid: three notches, the rests a real grand's lid has.** These are shut, the short stick (0.45,
18°) and the long stick (1, 40°) (`ui/lid.ts` `LID_RESTS`). The knob shows three long ticks at those
notches in place of its eleven fine ones.

- **Turning the knob** clicks the lid from one rest to the next as you pass halfway between them. It
  never stops in between, so you hear and see shut, half stick, full stick. The lid swings to each rest
  (`lidSettle`): falling, it speeds up; lifted, it eases in. Shut from the long stick takes ≤ 0.45 s.
- **The arrows step a notch** (shut, short, long) in place of 0.05. This is the documented change the
  brief allowed. Home and End go to shut and to the long stick.
- **Taking the lid itself.** Press on the 3D lid (mouse or finger) and drag. The point you took stays
  under the pointer (`handles3d.ts` `lidFor`, to 0.001), so **while you hold it, the lid follows your
  hand continuously**, standing on the shortest stick that reaches it, pressed down (never through it).
  That is how a real lid feels: you lift it freely, then set it down on a stick. **Let go and it comes
  onto the nearest rest** (`lidNotch`; exactly halfway, the higher one), swinging there. The knob
  follows: between the notches while you hold the lid, on a notch once you let go. A mouse over the lid
  shows a grab cursor.
- **Hit test.** The ray from the camera through the pointer has to meet the lid with nothing in front
  of it (#29's `lidRay` and `blocked`, brought back). It now meets the slab's sides as well as its
  faces. At half stick, the stage's own view sees the lid nearly edge on (the camera is about 19° up,
  the lid 18°), so the side is most of what shows. Before, rays there went in through the side and
  missed.
- **A 2D lid between rests, switched to 3D,** comes onto the nearest rest, and you see it swing there.
  So does a preset's lid that falls between rests. In 3D the lid is always on a rest unless it is in
  your hand. Back in 2D it is continuous again, from that rest.
- **The camera never moves.** The grand is framed with its lid wide open whatever its opening, as
  before.

Clicking the lid without dragging still opens the action close-up of the key under it, as before. A
press that moves less than 6 px does not move the lid.

## Numbers

- **The hand on the lid**, `scripts/shots-lid-knobs.mjs` (laptop and phone): taken at full stick and
  brought down to 0.64, held there (long stick pressed down, `[1, 0]`), let go → 0.45, the short stick
  up (`[0, 1]`). `scripts/clip-lid-knobs.mjs`: held at 0.60 (laptop) and 0.61 (phone) → 0.45; lifted to
  0.81 → 1.
- **Frame cost**, 3D grand, laptop (1440 × 900, two runs each, `__stage3d.stats.ms` sampled six times):
  before 1.66 / 1.75 ms, after 1.68 / 1.72 ms (the same).
- **Hover hit test** (only on mouse moves, never per frame): `lidAt` 0.04 ms over the lid, 0.003 ms
  off it. Placing the knobs each frame: `lidKnob` < 0.001 ms, `roomKnob` 0.001 ms.
- **The gate:** `pnpm typecheck` clean; `pnpm build` with the Safari 14.1 worklet check ok; vitest
  772/772 (74 files); Playwright 255 passed, 24 skipped, 1 failed: the known "click a note's strings…"
  `.av-speed`-empty flake (desktop). It passed on rerun, desktop and phone.

## Tests

- `apps/web/test/lid3d.test.ts` (11): the rests and the nearest one (every 0.01); the key steps; the
  swing (always on its way, falling speeds up, lifting eases, lands ≤ 0.46 s); the ray meets the lid
  where it is drawn (a grid over it and the hand's points along the edge, at 1, 0.73, 0.45, 0.3 and 0;
  the point taken projects back under the pointer within 0.5 px) and misses off it; the drag finds every
  opening back; the knob's points sit outside the outline, under the rim, front first. Also kept: the
  sticks never go through the lid, the stick that holds it at any opening, the pool and the framing.
- `apps/web/test/stage-knob.test.ts` (4): the sweep; drag to value (continuous: 101 values over 100 px);
  notches (a drag down from the long stick passes only 1 → 0.45 → 0); the keys.
- e2e, `e2e/app.spec.ts`:
  - "room and lid are turned on their knobs on the stage …" (2D, desktop): room up and stays; lid down
    to between 0.55 and 0.8 and stays; arrows by 0.05.
  - "3D: the grand's lid rests shut, on its short stick or on its long one …" (desktop and Pixel 7, by
    mouse and by touch):
    - the 2D lid at 0.3 comes onto 0.45 in 3D;
    - the knob turned up passes only 0.45 and 1, and turned down passes only rests to 0;
    - the arrows step 0 → 0.45 → 1 → 0.45 → 1;
    - the lid taken by hand and held at 0.5–0.7 stays there on the long stick, and let go comes to 0.45
      (short stick up);
    - lifted past 0.8 and let go, it comes to 1;
    - the camera's eye is unchanged throughout;
    - the room knob turned up > +0.2 stays, back down, arrow +0.05;
    - the tooltip on hover.
  - "icon-only stage controls say what they are …": the same assertions on `.knob-room` and `.knob-lid`.

## Pictures and clips

Before is `main` at `bf6b62d` (the grips); after is this branch. Shots are of the whole stage view at
1440 × 900 (laptop) and 390 × 844 (phone).

- `desktop-2d-before-after.jpg`, `phone-2d-before-after.jpg`: 2D classic, lid at 100, 70, 35 and 0 %,
  room at 0 and 1.
- `desktop-vector-before-after.jpg`, `phone-vector-before-after.jpg`: the same in the vector style.
- `desktop-3d-before-after.jpg`, `phone-3d-before-after.jpg`: 3D, lid on the long stick, on the short
  stick and shut; room at 0 and 1 (the pool small and large).
- `desktop-3d-lid-by-hand.jpg`, `phone-3d-lid-by-hand.jpg`: the lid on its long stick; taken by hand
  and held at 0.64 (the long stick pressed down under it, the knob's pointer between notches); let go,
  on the short stick.
- `desktop-3d-sequence.jpg`, `phone-3d-sequence.jpg`, `desktop-clip.mp4`, `phone-clip.mp4`: the knob
  turned a notch down, then shut; the lid by hand, held, let go (falling, then on the short stick),
  lifted past halfway and let go (up onto the long stick); the room's knob turned up and down with a
  chord ringing (the pool grows to the knob and shrinks). The white dot is the pointer, drawn for the
  recording only.

Remake them with:

    OUT=<dir> TAG=before BASE=<main's dev server> node scripts/shots-lid-knobs.mjs
    OUT=<dir> TAG=after  BASE=<this branch's>     node scripts/shots-lid-knobs.mjs
    OUT=<dir> BASE=<this branch's> [PHONE=1] node scripts/clip-lid-knobs.mjs

## Left as is

- The upright has no lid control (as before). Its room knob is the same as the grand's.
- Ensembles show neither knob (as before). Each part's room is its own.
- `scripts/shots-lid-toggles.mjs` and `scripts/clip-lid-room.mjs` drive #36's grips. They still work on
  builds from before this branch, for comparisons.
