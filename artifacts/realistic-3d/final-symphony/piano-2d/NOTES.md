# Piano 2D: slightly more like the instrument

Built from `.autopilot/briefs/PIANO-2D-RECOMMENDATION.md`, on `main` 44ca07e. Visual only: the engine is
untouched (golden and block-size tests cannot move). Both pianos, both 2D styles, laptop and phone.

## What changed

| | Grand (from above) | Upright (from the front) |
|---|---|---|
| Plate, as a frame | Pin block from the agraffe line to the front; a hitch rail past each bridge; a band inside the rim; three struts | Pin block over the pressure bar; hitch rails under the bridges; a band inside the case; three struts |
| Strings' ends | A faint lead from every string to its own tuning pin (steel dot), a faint tail to its hitch pin (dark dot in the rail) | The same |
| Board | Spruce (`108,78,44` at 40 %) where it was the case's brown | The same; the case's walls are ebony, like the grand's rim |
| Dampers | Black heads 11 px along the string, turned with the leaning bass | Heads 8 px, in a row under the hammers |
| Hammer line | unchanged | **Straightened**: every strike point at one height; the strings' tops step up to the bass under a slanting pressure bar; a quiet rest rail |

Vector style: the same geometry as lines only (leads and tails dim blue, pins as points, each hitch rail one
mid-blue line, each strut two hairlines that close towards its far end, the upright's inner case a hairline).
No fill, no new colour.

One geometry for both styles and both pianos: `plateOf()` in `apps/web/src/ui/grand-plan.ts`, called by
`grandPlate(layout)` and `upPlate(upLayout)`. Each plate is built once per layout (a `WeakMap` on the layout)
and painted into the cached still layer; nothing is added per frame except the damper heads, which replace
the old damper dashes one for one.

## The mock's issues, and what was done

- **Phone grand, pin block a flat slab.** The block is bronze only along its edge, where the pins stand
  (1.7 key pitches deep), then falls into shade towards the front over another 2.2 pitches. Drawn as twelve
  opaque steps, each over the last, so there are no seams. The same shading runs up the upright's deep
  treble block.
- **Bass/tenor break crowded.** The bass hitch rail stops two keys short of the break. The break's strut runs
  through the gap to the band at the far side, and the treble rail springs from that strut. The last bass
  strings past the rail's end keep their tails and hitch pins.
- **Struts plain bars.** Each tapers (0.42 → 0.25 of a key pitch) and ends on the hitch rail it meets, or on
  the band if it meets none. The first strut stands at the real break (the first plain-steel key), not at C3:
  the engine's scale has three plain keys below C3.
- **Lid shade seam on the bronze.** The shade now thins towards the free edge as the lid rises (whole when it
  is down), and the free edge's line stops at the pin block.
- **Flat bronze.** One linear gradient across the whole case (lit upper left, shaded lower right) for band,
  struts and rails, plus a one-pixel lit edge on the rails and along the block. No texture.

## The upright's hammer line

Done, the lower-risk way. Every string keeps its x exactly as before (top over its own key, the bass leaning
across); each string only moved vertically so that its strike point sits on one level line. So hit-testing
(`st.hits`), which key a string belongs to, and the close-up are untouched in x; the muffler strip, which
follows the strike points, became a straight line by itself. The recommendation's mock put the strike point
over the key instead, which pushed the lowest strings' tops out of the case (and off a phone's left edge); and
it took the strike line from the longest string anywhere, which on a phone scrolled to the treble dropped the
line a quarter of the way down the stage. Here it comes from the longest string in view.

Strings are about 6 % shorter on screen than before (room above for the pins, below for the hitch rail).

## Small pianos (the Orchestra)

Sizes follow the key pitch. Under 6 px a key the pins, leads and tails are not built or drawn
(`PLATE_DETAIL_PITCH`); the frame, the board and the damper heads (scaled down) stay. A three-seat ensemble on
a laptop is above the threshold (15 px a key) and shows pins; on a phone it is below (4 px) and does not.

## Known, left as it is

- On a phone scrolled fully to the bass, the two lowest strings' front ends lie under the rim (they did
  before). Their pins are pulled back along the string until they stand inside the case.
- On a phone's upright, strings longer than the longest in view (off to the side) run out of the case's foot,
  as before; their hitch pins go with them.
- Hitch pins are dark on a dark board where the bass rail stops short: nearly invisible there.

## Tests

- `apps/web/test/piano-plate.test.ts` (8 tests, 0.1 s): grand and upright on a laptop, a phone mid-keyboard
  and a phone at the bass: one pin and one hitch pin per string (wire), each inside the case, each lead and
  tail on its string's line; two rails, the bass's short of the break; three tapered struts, the first between
  the rails; the upright's hammers at one y, dampers under them, tops stepping up to the bass; a small piano
  has the frame and no pins.
- `e2e/piano-2d.spec.ts` (5 tests × desktop and Pixel 7): each piano in each style: strings in view from the
  new `window.__piano2d()` probe, bronze measured past a pin end (classic), a click on a string's middle opens
  that key's close-up, no horizontal scroll, no error; a small piano in the Orchestra in both styles.

## Pictures

`before-after-*.jpg` here: before (main 44ca07e) left, after right, same notes and frame.
`{grand,upright}-{classic,vector}-{laptop,phone}-{rest,sounding}`, `…-phone-bass` (scrolled to the bass),
`grand-…-laptop-lid-half`, `ensemble-{grand,upright}-{classic,vector}-{laptop,phone}`.

Regenerate: `pnpm build && pnpm preview --port 4473 --strictPort &` then
`OUT=<dir> TAG=after node scripts/shots-piano-2d.mjs` and `python3 scripts/pair-shots.py <dir> <out>`.
