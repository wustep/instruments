# The piano's action close-up: audit and fix

Brief: `.autopilot/briefs/HAMMER-ACTION.md`. The close-up of one key's action: the 2D section
(`apps/web/src/ui/action-view.ts`, opened by a click or tap on a piano note's strings; the same
drawing in the default and the vector style) and the 3D fly-to (`zoomTo` in `ui/gl/stage3d.ts`).

Audited on production (https://instruments-wustep.vercel.app, `main` at `0382147`) and on a local
build, at 1440×900, 390×844, 390×664 and 844×390, grand and upright, both 2D styles and 3D. Every
"before" picture here is production; every "after" is this branch's build. All are Chrome (phone
sizes: its emulation at 2×, touch). Nothing was looked at on a real phone.

## What was wrong

Seven things, all present on production and locally before the fix.

1. **A strike nobody played, on opening.** If the key had been played at any time before its
   close-up was opened, opening it replayed that old strike: the jack lit, the hammer flew and
   "×1/40" showed, with no key pressed. The view meant to skip the strike already there, but it
   spent that one skip on its first animation frame, before the engine had sent the key's record
   (which arrives a frame or two later). `2d-*-a-opened-after-playing.jpg`.
2. **The upright's damper did not follow the key.** During the slowed replay it was drawn from the
   engine's live value: with the key held it jumped off the strings the instant the replay began,
   before the drawn key had moved; with a tap it sat on the strings through the strike, the drawn
   key fully down. (The grand's is lifted by the drawn key's own geometry and was right.)
   `2d-*-upright-*-1-held-early.jpg`.
3. **The hammer started for the check, then jumped back.** Between the key going down and its
   strike's record arriving (the hammer's flight plus a frame or two) the hammer and key eased
   towards the held position, then snapped to rest for the replay.
4. **Other keys did nothing.** With the close-up open, playing any other key moved nothing in it.
5. **A change of piano left the wrong action.** Grand → upright with the close-up open kept the
   grand's drawing and label while the upright sounded.
6. **Cut and small on phones.** A tall panel started the section behind the key's front: the grand
   lost its key front and front rail (from 215 mm), the upright showed a 7 mm sliver of key top at
   the panel's edge. On a phone on its side the panel was 174 px high with 56 px of it kept for the
   label, so the drawing was a thumbnail. `2d-*-390x844-*.jpg`, `2d-*-844x390-page.jpg`.
7. **3D on a phone held upright ran out of both sides.** The close-up's distance was worked out as
   if the action were seen square on from far away; from 80° and that near, the key's front ran off
   one side and the damper off the other. A change of piano while zoomed dropped the close-up.
   `3d-*-390x844-*.jpg`.

Not wrong, checked: the parts are complete and named (hover names) in both styles, grand and
upright; the order drive → let-off → free flight → contact → fall → check was already right for the
hammer and jack; the vector style is the same drawing through the line pen and had no stray lines
of its own; the 3D close-up on a wide stage moves with the key live and is unchanged.

## What changed

- **`ui/action-motion.ts` (new): the motion, apart from the drawing.** Time comes in as an argument
  and smoothing is by time constants, so it is the same at 30, 60 and 120 frames a second (it was a
  fraction per frame) and can be tested without a page.
  - A strike is replayed only if its serial is newer than the newest one the engine had reported
    when the close-up came to this key.
  - While a strike is replayed, or awaited (up to 160 ms after the key goes down), the damper is
    where the drawn key puts it: it starts to lift at about half the key's dip. A pedal that holds
    it off still does. Between strikes it is the engine's live value, as before.
- **The close-up follows the playing.** A note played by hand on another key (the keyboard, the
  drawn keys, a plugged-in MIDI keyboard; not a file's notes) moves it to that key and replays that
  strike. A change of piano redraws the same key as the other action.
- **The whole section at every size.** No crop on tall panels. The label's band is kept only when
  the section is too wide to stand between the label and the close button. On a phone the grand's
  panel is 300 px high (the section is long and low), leaving the stage in view above it. On a low
  stage the panel takes the stage's height.
- **3D:** on a narrow stage the close-up is framed exactly (`fitView`, as the whole instrument is):
  the key's action as a box, inside the side margins and under the file player. A close-up now
  outlives a change of piano or of the stage's size: it is framed again.

| Drawing scale, px per mm | before | after |
|---|---|---|
| grand, 1440×900 (panel 820×460) | 1.09 | 1.09 |
| upright, 1440×900 | 0.78 | 0.82 |
| grand, 390×844 | 0.72, from 215 mm behind the key's front | 0.52, whole |
| upright, 390×844 | 0.85, from 140 mm | 0.65, whole |
| grand, 844×390 | 0.38 | 0.52 |
| upright, 844×390 | 0.23 | 0.31 |

The price of "whole" on a phone is a smaller drawing: the grand at 0.52 px/mm is 28 % smaller than
the cropped one. The upright on a phone on its side is still small (a 520 mm section in a 194 px
panel).

## Checks

- `apps/web/test/action-motion.test.ts` (12 tests): no replay of an old strike; a held note in
  order (key, damper, let-off, strike, check) with the damper tied to the drawn key; a tap falls to
  rest, damper off through the strike; the sustain pedal; frame-rate independence; a new key or the
  other piano starts at rest.
- e2e "the action close-up follows the playing …" (desktop and Pixel 7): the section inside its
  panel, rest after opening on a played key, the upright's held sequence, release, another key, the
  other piano.
- e2e "a key’s close-up in 3D on a narrow stage …" (Pixel 7): the action's box inside the stage and
  under the file player, grand and upright, keys 60 and 30, kept across a change of piano.
- `pnpm typecheck`, `pnpm test` (233 passed), Playwright (93 passed, 11 skipped) on this build.

## Left as it is

- The replay is slow motion (×1/12 to ×1/40), so the drawn strike lands after the sound. That is the
  design, and it is labelled. The string's shape and a held key's damper are live.
- A second strike of the same key during a replay restarts the replay from rest.
- The grand's hammer head tilts with its shank (20° at the string), as in the 3D model.
- On a phone on its side (844×390) the 3D stage is under 100 px high; the close-up there is as
  small as everything else.

## Pictures

`2d-<style>-<piano>-<size>-<state>.jpg`, `3d-<piano>-<size>-<state>.jpg`: before left, after right.
States: `a-opened-after-playing` (0.5 s after opening on a key played earlier), `0-rest`,
`1-held-early` (0.45 s into a held note), `2-held-mid` (1.5 s: about the strike), `3-held-settled`,
`5-tap-early`, `page` (the whole page). Retake with
`BASE=<url> OUT=<dir> node scripts/shots-hammer-action.mjs 1440x900 390x844 390x664 844x390`, pair
with `python3 scripts/pairs-hammer-action.py <before> <after> <out>`.
