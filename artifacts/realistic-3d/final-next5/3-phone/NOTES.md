# NEXT5 item 3: the phone play surface

Brief: `.autopilot/briefs/NEXT5-3-PHONE.md`. At 390×844 the keys showed 12 white keys labelled with
computer-keyboard letters, the octave arrows were the only way to move along them, and in 3D the
instruments sat small in the stage (or, on a shorter page, ran out of it).

All pictures here are Chrome's phone emulation (390×844 at 2×, touch). Nothing was measured on a
real phone.

## What changed

**1. No letters on touch.** Where the main input is a finger (`hover: none` and `pointer: coarse`)
the computer-key letters are off the keys. Each C keeps its name, on the line the letters had. If a
keyboard is plugged into the phone or tablet, its first note key (or `Z`/`X`) brings the letters
back. A computer is unchanged.

**2. A position strip over the keys.** A 24 px strip between the fallboard and the keys shows all
88 keys in miniature, with a brass window on the ones in view.

- Dragging on the strip slides the keys. The window is held where the finger took it; a touch off
  the window brings it under the finger first. Once down, the finger can leave the strip's height.
- At 390 px the strip is 362 px wide, so 1 px of finger slides the keys 4.4 px, and the whole
  keyboard is 273 px of travel.
- **A drag on the keys is still a glissando.** The keys keep their own pointer and never scroll.
- Notes light on the strip too, so a note off the screen's edge is still seen while a piece plays.
  Keys outside the instrument's range are dimmer there, as on the keys.
- The octave arrows stay. After a slide the octave label is the octave now in view, so the arrows
  carry on from there.
- The strip is a scrollbar to assistive tech (`role="scrollbar"`, arrow keys move an octave,
  Home/End the ends). It has no tooltip, like the file player's position line.
- It shows wherever the keys do not all fit: a phone, a narrow window, and (new) any touch screen
  under 1560 px wide. It is 18 px high on a phone held sideways. A wide computer window still shows
  all 88 keys and no strip.

**3. 3D framed to fit a phone held upright.** The old rule stepped every view back by a factor
guessed from the stage's shape. Now the camera is placed exactly: every vertex of the instrument is
projected, and the nearest camera on the instrument's own bearing that shows all of it is found in
one pass (`gl/fit3d.ts`). The picture is centred in the part of the stage that is free, which starts
under the file player's row.

- The **cello** runs scroll to endpin over the free height.
- The **upright** is wider than tall, so on a narrow stage its view turns further round its treble
  end (yaw 0.45 → 0.81 at 390×844) to whichever angle shows it largest. It then touches both sides
  and nearly both ends of the free height.
- The **grand** is whole, the lid's tip and the casters included.
- The same rule frames the violin, viola, flute and trumpet.
- A stage is framed this way when it is under 600 px wide or narrower than 1.4:1. **A wide stage
  keeps the scenes' own views**, which crop like a photograph (the grand's lid runs out of the top).
  Desktop 3D is unchanged: 0.003 % of pixels or fewer differ from the build before, which is the
  occlusion's own noise.
- The framing is redone when the stage changes size or the phone turns. It moves the camera only if
  the camera was still where the framing left it; a view the player has turned is left alone.
- A bowed instrument is framed with its bow across the strings at the middle of its hair. At a
  stroke's ends the bow runs out of a narrow picture (it did before too).
- A piano with its case hidden is framed as if the case were there, so the picture does not jump
  when it comes back.

## Numbers

### The page at 390×844 (CSS px)

| | before | after |
|---|---|---|
| header | 34 | 34 |
| stage (of which the 3D canvas) | 606 (468) | 576 (444) |
| fallboard | 54 | 54 |
| position strip | none | 24 |
| keys and their bottom padding | 156 | 156 |
| total | 850: the page scrolled 6 px | 844: it does not scroll |
| white keys in view, each | 12, 30 px | 12, 30 px |
| ways along the keys | octave arrows | the strip, and the arrows |

### How much of the 3D stage each instrument takes

`node scripts/measure-phone-3d.mjs 390x844 390x664` (full output: `stage-share.txt`). The box is the
instrument's own, every vertex projected, the sound off (a bow at the middle of its hair). "Before"
is rebuilt in the new build from the old rule on the old stage; its picture matches the real before
screenshot pixel for pixel in the stage area (cello, grand, violin and flute checked).

390×844:

| | stage | instrument's box | of the height | of the width | of the area | camera |
|---|---|---|---|---|---|---|
| grand, before | 390×468 | 250×302 | 64 % | 64 % | 41 % | 8.55 m |
| grand, after | 390×444 | 301×381 | 86 % | 77 % | 66 % | 6.66 m |
| upright, before | 390×468 | 294×262 | 56 % | 75 % | 42 % | 6.30 m |
| upright, after | 390×444 | 359×368 | 83 % | 92 % | 76 % | 4.50 m |
| cello, before | 390×468 | 141×327 | 70 % | 36 % | 25 % | 5.06 m |
| cello, after | 390×444 | 164×381 | 86 % | 42 % | 36 % | 4.11 m |
| violin, before | 390×468 | 298×273 | 58 % | 76 % | 45 % | 2.24 m |
| violin, after | 390×444 | 359×329 | 74 % | 92 % | 68 % | 1.82 m |
| viola, before | 390×468 | 293×247 | 53 % | 75 % | 40 % | 2.48 m |
| viola, after | 390×444 | 359×303 | 68 % | 92 % | 63 % | 1.98 m |
| flute, before | 390×468 | 368×54 | 11 % | 94 % | 11 % | 1.96 m |
| flute, after | 390×444 | 359×54 | 12 % | 92 % | 11 % | 1.90 m |
| trumpet, before | 390×468 | 346×93 | 20 % | 89 % | 18 % | 1.73 m |
| trumpet, after | 390×444 | 359×95 | 21 % | 92 % | 20 % | 1.58 m |

The 86 % is the whole free height. The other 14 % of the stage is the file player's row (47 px)
and the margins (7 px over the instrument, 9 px under it).

390×664, the page an iPhone's Safari gives with its toolbars showing. The stage is under 300 px
high, and before, the grand, the upright and the cello ran out of it and behind the file player:

| | stage | instrument's box | of the height | cut off | top behind the file player |
|---|---|---|---|---|---|
| grand, before | 390×288 | 252×327 | 114 % | yes | yes |
| grand, after | 390×264 | 166×208 | 79 % | no | no |
| upright, before | 390×288 | 296×263 | 91 % | yes | yes |
| upright, after | 390×264 | 231×208 | 79 % | no | no |
| cello, before | 390×288 | 140×326 | 113 % | yes | yes |
| cello, after | 390×264 | 89×208 | 79 % | no | no |

Here the instruments are whole and clear, and smaller than they were. See "Left open".

### Cost

Projecting every vertex of the grand as drawn (794 000) takes 5.8 ms on this Mac. The framing pass
does less than that (it passes over the meshes whose boxes cannot reach the picture's edge), once per
instrument or change of stage. Across a resize no gap between frames was longer than one refresh
(18 ms). Nothing is added to an ordinary frame.

## Also changed, not in the brief

- **The file player's icons are 36 px on touch.** Item 2 wrote that rule and its notes say so, but
  the 28 px rule came after it in the stylesheet and won. The media rule now comes last. On a
  computer they are still 28 px.
- **The page no longer scrolls 6 px** on a phone held upright (the keys' bottom padding was not
  counted in the stage's height).
- **Touch screens wider than a phone keep finger-wide keys.** A phone held sideways (844 px) used to
  squeeze all 88 keys in at 15 px each. Any touch screen under 1560 px now keeps them at 30 px, with
  the strip to move. The cost: in 2D the grand's plan, drawn over its own keys, no longer shows whole
  there. To undo, drop `(pointer: coarse) and (max-width: 1559px)` from the strip's media rule in
  `styles.css`.

## Tests

- typecheck clean.
- vitest 167/167 (+5, `apps/web/test/fit3d.test.ts`: the framing checked against a camera built
  independently from `gl3d`'s matrices: inside the rectangle, edge to edge on the axis that binds,
  equal margins on the other, and no nearer camera shows it whole).
- Playwright 85 passed, 9 skipped (+4: two new tests on desktop and phone).
  - "phone keys …": letters hidden on touch and back with a hardware key; the strip's place, height
    and 88 keys; its window equal to the keys in view; a 90 px touch drag slides the keys by that
    share of all 88 and sounds nothing; the octave label follows; a tap off the window; a touch
    drag across five keys plays those five in order and slides nothing; the page does not scroll. On
    desktop: no strip, letters shown, and the strip appears in a 700 px window.
  - "3D on a phone held upright …": grand, upright and cello inside the canvas and under the file
    player's row; cello over 93 % of the free height, upright over 90 % of it and of the width. On
    desktop: the grand's and cello's home views are exactly the scenes' own.

## Pictures

Each is before (left, or top) and after.

| | |
|---|---|
| `phone-3d-cello.jpg`, `phone-3d-grand.jpg`, `phone-3d-upright.jpg` | the three the brief names, 3D |
| `phone-3d-violin.jpg`, `-viola`, `-flute`, `-trumpet` | the others, 3D |
| `phone-2d-*.jpg` | every instrument in 2D (the stage's own drawing is unchanged) |
| `phone-keys-grand.jpg`, `phone-keys-cello.jpg` | the fallboard and keys close up: letters gone, the strip |
| `phone-short-3d-*.jpg` | 390×664 |
| `phone-land-2d-grand.jpg`, `phone-land-3d-cello.jpg` | the phone held sideways (844×390) |
| `phone-2d-grand-slid.jpg`, `phone-keys-grand-slid.jpg` | after only: a finger holding the window at the bass end |
| `phone-2d-grand-playing.jpg`, `phone-keys-grand-playing.jpg`, `phone-3d-cello-playing.jpg` | after only: a piece playing, its notes lit on the strip |
| `phone-keys-cello-vector.jpg` | after only: the strip in the vector lines style |

Made by `scripts/shots-phone.mjs` (before: the build at `6aed1de`) and `scripts/pairs-phone.py`.

## Left open

- **No real phone.** The strip's feel under a thumb, iOS Safari's handling of the drag, and whether
  every phone reports `hover: none` are untested outside Chrome's emulation.
- **A short page leaves a small 3D stage.** At 390×664 the canvas is 264 px high and the file
  player's row takes 47 of them, so the cello is 89×208 px. The framing is right for that stage; the
  stage is what is short. The top band is 132 px there, of which the spectrum's row is about 56.
- **The bow at a stroke's ends** leaves a narrow picture and can pass behind the file player. Framing
  the middle half of every stroke was tried: the violin came out 18 % smaller (camera 1.82 → 2.21 m),
  about its size before, so the nearer view was kept.
- **2D is as it was.** The grand's plan is still as wide as its keys, so a phone shows the part over
  the keys in view; the strip now slides it.
- **A phone held sideways keeps the wide 3D views**, cropped as on a computer.
- A computer's page still overflows by the same 6 px (not touched: it would move every desktop
  picture).
- A key's close-up on a phone is unchanged.
