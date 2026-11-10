# Orchestra 2D: bows at their instruments' scale, the ensemble centred

Stephen, 9 Nov 2026, 9:56 PM. On production he played Max Richter's *On the Nature of Daylight*
(Orchestra mode, 2D vector / Chimera, routed to violin, violin, viola, cello, cello; the contrabass is
on the second cello). The viola's bow was drawn about 3× a normal bow's length, running across both
cellos to the stage's right edge. The cellos' bows also reached far. The five instruments sat in the
right ~60 % of the stage with the left empty. His screenshot (production after #21, bundle
`index-0qCvtluj.js`) is `.autopilot/fixtures/stephen-daylight-bow-offcenter.png`.

#21 (bows drawn last, unclipped) did not cover this. I confirmed it on production first:
`before-prod-*` below are production at `0382147`.

## What was wrong

1. **Equal cells, each instrument filling its own.** `ensembleCells` / `bowGrid` gave every seat the
   same `w × h`. `drawBowed` / `drawBowedV` then called `bowedLayout(g, p, sh, c.w, c.h)`, which fits
   *that* instrument's length to the cell. A violin (0.59 m drawn) and a cello (1.37 m with 0.16 m of
   endpin) in the same cell come out at very different px/m. In Stephen's window (2245 × 1350, cells
   270 × 918) the violins were at about 1090 px/m and the cellos at 510, so the violin was drawn 2.1×
   the cello's scale.
2. **The bows were drawn at their own instrument's scale.** Each bow is `bowLength × lay.sc`: 0.64 m of
   hair for the violin and viola, 0.60 m for the cello. So the hair came out at 692 px (violins), 607
   (viola) and 303 (cellos). The viola's bow, at nearly a violin's scale, ran through both cellos.
3. **Off centre.** `bowGrid` kept every bow's full reach (`bowReach × lay.sc`) on the stage and set the
   row's start to `max(lo, …)`. The violins' huge frog reach pushed the row right: the cells began
   696 px from the left edge and ended 199 px from the right. When the violins weren't playing, that
   reserved space showed as an empty left third. Vertically the equal cells filled the band, so the
   cellos' endpins touched its bottom (116 px empty at the top, 7 at the bottom).

The deferred-bow closures were fine: each one sets the stage transform back and places its own
cell's layout.

## What changed

- **One px/m for the group** (`ensemble-draw.ts`). Each seat's box is its own instrument's at that
  scale: bowed instruments from `bowedSpan` × `2·hwMax`, the flute from `FL_LEN` over its layout's
  fill, the trumpet from `trumpetBox()` (its bounds over its layout's fill). Each cell carries `sc`.
  `drawBowed` / `drawBowedV` take it as `scale`, and `bowedLayout(…, scale)` uses it instead of
  filling the box. Solo stages pass nothing and are unchanged.
- **Seats spaced for the bows.** Along a row (upright) or a column (lying), each instrument's centre
  sits at the largest of three distances from the previous one: the two boxes plus a 14 px aisle; the
  previous bow's far end plus 6 px plus this box; this bow's far end plus 6 px plus the previous box.
  Bow reach is `bowReach` (frog with the tip on the string, tip with the frog on it, from the outermost
  string). So no bow, at either end of its travel, reaches another instrument's box. Bows may still
  overlap bows in the aisle, as they do in a real section.
- **Centred.** Each line's box (bodies plus bows at full reach) is centred across the band, and the
  stack of lines is centred in its height. The scale is the largest that fits inside a 2 % margin
  (bisection), so the group fills the band one way and the leftover is split evenly.
- **Arrangement.** For one row up to n rows, upright or lying, the arrangement that draws the group
  largest wins. Fewer lines win near-ties (within 2 %). Lying must be 25 % larger to beat upright,
  because a row of standing players reads as a section.
- **Unchanged:** winds-only lineups (equal cells), the pianos' band, 3D seating, and the bows drawn
  last and unclipped. The vector style's β / N readings sit in the aisle beside the bow (the old
  `W − 30` clamp only applies without a shared scale).

## Numbers (Daylight lineup, viola and cellos bowing; `before-prod.json`, `after.json`)

| | Stephen's window 2245 × 1350 | laptop 1440 × 900 | phone 390 × 844 |
|---|---|---|---|
| hair drawn, before: violin / viola / cello px | 692 / 607 / 303 | 441 / 386 / 193 | 150 / 135 / 67 |
| hair drawn, after | 278 / 278 / 260 (438 px/m) | 177 / 177 / 165 (279 px/m) | 72 / 72 / 67 (113 px/m) |
| violin scale ÷ cello scale, before → after | 2.13 → 1.00 | 2.13 → 1.00 | 2.1 → 1.00 |
| cells, before | five 270 × 918, from x = 696 | five 172 × 503, from x = 445 | 195 × 60 lying, bows through the bodies below |
| cells, after | violins 97 × 265, viola 110 × 302, cellos 200 × 606, one row | 64 × 171 … 130 × 389, one row | two rows: violins + viola, then the cellos |
| empty stage around the group (pixels, every bow at both ends of its travel), after: left / right, top / bottom | 34 / 28, 166 / 163 | 17 / 14, 57 / 54 | 9 / 6, 66 / 64 |

The pixel measure finds the vector frog's far end a few px short of `bowReach`, hence 34 vs 28. The
layout centres `bowReach` exactly (unit test, ≤ 3 px). Before, with every bow at full reach, the
oversized violin bows happened to fill the left (50 / 18); with them idle it was 696 px empty left vs
199 right. That is what Stephen saw.

## The cost

At their true relative size the violins are small beside the cellos, and a full bow needs about
0.75 m of clear stage on the frog side. The Daylight row in Stephen's window draws the violins 265 px
tall, where each used to fill a 918 px cell. On a phone they are 73 px tall in two rows. That is the
brief's rule (true scale, no bow through a neighbour, at full reach). Relaxing "full reach" to "where
the bow is now" would let the seats close up, at the price of a layout that moves while you play.

## Tests

- `apps/web/test/ensemble-cells.test.ts`. Stages: 1440 × 505, 1535 × 918, 2245 × 918, 390 × 422,
  412 × 400, 844 × 190, 2560 × 1100. Lineups: Daylight, quartet, flute + quartet (± grand), the
  8-voice set, one cello, one violin, two cellos, viola + two cellos, violin + grand,
  trumpet + cello + upright, the two-piano set. For each it checks:
  - one shared `sc`;
  - each bowed box is its own length and width at that scale (± 8 px), and the flute is too;
  - every bow at full reach is on the stage and crosses no other instrument's box;
  - the group's box (bodies plus bows at full reach) is centred on both axes (≤ 3 px) and fills the
    band one way;
  - the Daylight quintet in Stephen's window and on a laptop is one standing row, in order, with a
    cello 2.3× a violin's length;
  - drawn: the vector `drawEnsemble`, through a context that records every line drawn outside a clip
    (the bows), at the frog and at the tip (Daylight at four sizes). Each hair's px/m comes from its
    drawn length over `bowLength`, is the same for all five, and equals the cells'. The whole drawn
    bow lies within its reach, and no segment of it passes through another box (Liang–Barsky). The
    group is centred.
  - Against `main`'s `ensemble-draw.ts` the drawn test fails with "violin 0: its bow drawn at 2.13 ×
    the cello's scale".
- `e2e/app.spec.ts`, new: "orchestra in 2D, the Daylight quintet …" (desktop and Pixel 7, ~1 s). It
  picks the lineup in the app, sets every bow at the frog and at the tip, and reads `__ens2d`, which
  now also gives each hair's real length and the cell's `sc`. It checks one px/m across the five, no
  hair through another cell, ends on the stage under the player, and the group centred.
- `e2e/app.spec.ts`, "orchestra in 2D: every bow is drawn whole …" (#21): the least drawn share is now
  0.85 (was 0.9). At true scale the hair is 2–3 px wide, and at mid-stroke a few stations where it
  crosses its own instrument's varnish blend into the plate. Its `first` / `last` checks (a bow cut at
  its cell's edge) are unchanged.

Gate: `pnpm typecheck`, `pnpm test` (279 passed), `pnpm e2e` (97 passed, 11 skipped).

## Artifacts

`scripts/shots-ensemble-bows.mjs` (`BASE=…  OUT=…`) builds the Daylight lineup from the picker, puts
the viola and cellos at mid-stroke (`PLAY`, `POS`) and takes `*-{wide,laptop,phone}-{vector,default}.jpg`.
It then sets every bow to the frog and to the tip and composites the two frames into `*-reach.jpg`.
That composite marks the ink's box (amber) and the stage's centre lines (dashed), and the empty stage
on each side is measured from its pixels. `scripts/pairs-ensemble-bows.py` makes the JPEGs and the
`pair-*.jpg` before | after images.

- `pair-wide-vector.jpg` (Stephen's view), `pair-wide-default.jpg`, `pair-laptop-*.jpg`, `pair-phone-*.jpg`
- `pair-*-reach.jpg`: every bow at both ends of its travel, the group's box against the stage's middle
- `before-prod-*` (production, `0382147`), `after-*` (this branch, rebased on `9161900`)

The Daylight MIDI stays in `.autopilot/fixtures/` and is not committed. The layout depends only on
the lineup, so the bows are set by hand (controllers 128 / 129) rather than by the file.
