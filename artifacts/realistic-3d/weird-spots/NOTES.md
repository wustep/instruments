# Weird spots (branch `fix/weird-spots`)

Stephen, 2026-11-09: "please clean up some of the weird spots in instruments", then three more notes the
same evening. Every pair here is `before (main, 284e436)` on the left and `after` on the right, shot by
the same script from the two builds. His own screenshots are the `reported-*.jpg`.

## 1. The cello's blotches and the smeared highlight (3D)

`reported-cello.jpg` → `cello-as-reported.jpg`, `cello-closeup.jpg`, `cello-upper-bout.jpg`,
`cello-lower-bout.jpg`, `cello-back.jpg`, `cello-under-strings.jpg`, `cello-hero.jpg`.

Two different faults, one in the paint and one in the surface.

**The blotches were painted on.** Each worn place on a plate (the thumb's on the treble upper bout, the
knees', the chest's on the back) was a soft glow strewn with 70 small pale polygons, "islands rubbed
through to the ground". At the hero's distance they were texture; close up they were a patch of
speckle. The same drawing put 2200 rosin dots under the strings, 60 pale chips out on the plate, and 180
round clouds of mottle. Now (`strings3d.ts` `paintPlate`):

- a worn place is one soft thinning of the varnish, its outline wandering and streaked along the grain,
  drawn per pixel; no islands;
- rosin is a faint haze; no dots;
- chips sit only on the edge, outside the purfling; scratches are fewer and fainter;
- the mottle is long faint drifts along the grain, not round clouds;
- a rubbed edge fades out at its ends, and dulls the coat along the edge itself (it used to dull a disc
  up to 4 cm across, out on the plate).

Measured on the top's painted map, in the thumb's place (mean and 99th percentile of how far a pixel
stands from its neighbours 6 px either side along the grain, in 8-bit levels):

| | main | now |
|---|---|---|
| cello | 1.51 / 10.0 | 0.40 / 2.3 |
| violin | 1.25 / 8.5 | 0.38 / 2.7 |

**The smear was the mesh.** `cello-reflection-check.jpg` shows it bare: the same view with the varnish
made a perfect mirror and the lights off, so only the studio's reflection is left. On main the
reflection's edge runs in steps the size of the plate's cells. Three causes, all in the arch:

- the arch rose by the exact distance to the outline, which has a crease along a line in from every
  corner (where the nearest point of the edge changes sides): the rise now follows that distance
  smoothed (signed, a Gaussian of 1.6 % of the body length);
- the rise was a cubic step, whose curvature stops dead where the rise ends (a line round the plate):
  now a quintic;
- the cells over the arch's shoulder were 13 mm on a cello: now a quarter of that out to the end of the
  rise.

The worst turn of a facet's normal above the edge and channel: cello 17.4° → 7.9°, viola 19.8° → 9.1°,
violin 22.1° → 9.0°. The top has half as many triangles again (cello 30 400 → 45 200); the mesher now
shares its grid vertices, so building a cello stalls the page 433 ms against 417 ms on main (violin 233
and 233, viola 250 and 250).

## 2. The audit: all seven in 3D

Each instrument was looked at from eight or more views (hero, top, both ends, back, underside, its
mechanism close up) at 2×, on main and on the branch.

| Instrument | Found | Done |
|---|---|---|
| cello | the blotches and the smear (above); a black slit at the tail where the ribs folded over (`cello-tail.jpg`); f-hole edges in stair-steps | fixed |
| violin, viola | the same paint (worn patch by the chinrest, dots under the strings: `violin-top.jpg`, `viola-top.jpg`, `*-close.jpg`); the same stepped reflection; both ends of the body cut square; f-hole edges in stair-steps (`violin-fhole-edge.jpg`) | fixed |
| upright | grey pepper on the damper levers, seen between the hammer shanks (`upright-action.jpg`, `upright-front.jpg`) | fixed |
| grand | nothing of this kind | the occlusion change applies to it; its views are unchanged to the eye |
| flute | nothing of this kind | unchanged |
| trumpet | nothing of this kind | unchanged. The thin rod with a small circle on the main slide's crook is the water key, and the two curved lines at the mouthpiece rim are the lip buzz: both meant, both left alone, as Stephen said |

- **The ends of a traced outline** are one row of the photograph: the width jumps from nothing to 10–15 %
  of the length, and the cello's tail also took in the lower rib under the edge. Each end was a straight
  cut with a sharp corner either side, and at the cello's tail the ribs folded over at that corner. The
  ends are now closed by a conic fitted to the bout's own stations (`closeEnds`).
- **F-hole edges** were cut where the painted map's alpha passed 0.02, which runs round the outside of
  every texel the hole touches: steps wherever the map is magnified. Cut at 0.5 the edge runs between
  texels.
- **The upright's pepper** was the ambient-occlusion denoiser. Its depth tolerance was left at the
  pass's default, 2 m, so it mixed the occlusion of whatever stood in front into what lay behind, a
  different mix at every pixel. It now keeps to a surface (1 % of the instrument's size). I first took
  this for the felt's and the hornbeam's own textures and changed those; that was wrong (the pepper
  stayed), and those edits are not in the branch.

Seen and left: the flame on a violin's back shows a faint chevron moiré at a grazing angle; the upper
edge of the grand's rim is a plain white reflection of the overhead softbox seen from behind.

Frame cost (ms a frame, `scripts/fps-3d.mjs`, desktop 1440×900 @2x, main → branch): grand 4.36 → 4.38,
upright 2.46 → 2.41, violin 2.91 → 3.08, cello 2.22 → 2.69, flute 2.32 → 2.29, trumpet 2.38 → 2.56. One
run each; run to run these move by about ±0.3.

## 3. F-holes, in both 2D styles and 3D

`reported-fholes.jpg` → `fholes-2d-{cello,violin,viola}-{vector,classic}.jpg`.

The f-hole was the photograph's trace, row by row: a wobbling stem, a bulge at the middle, eyes that
were not round, hooks left open. More smoothing would have rubbed out the nicks and the eyes. It is
now constructed (`apps/web/src/ui/gl/fholes.ts`): two round eyes, the lower larger and farther out; an
S stem widest at the middle; each hook a wide arc that runs into its eye along a tangent, so the hook's
outer edge becomes the eye's circle and its inner edge meets it at the wing's tip; a nick in each edge
on the bridge line. One `FHole` (eyes, turns, three stem points, seven widths, the nick) per family: the
violin's from the Met's "Francesca" Stradivari, used for the viola too, and the cello's from the Met's
Vuillaume, both measured off the same photographs as before. A double bass adds one more. The treble
hole is the bass hole mirrored. The two 2D styles and the 3D top all draw the one outline.

## 4. Orchestra in 2D: the bows were cut

`reported-bows.jpg` → `bows-before-*.jpg`, `bows-after-*.jpg` (flute and string quartet: a 1440×900
window in both styles, the 1535×1330 window of the report, and a phone; bows at the frog or at the tip).

Each bowed instrument of an ensemble was drawn inside two clips, both its own cell (the ensemble's, and
the instrument's own). A bow is longer than its instrument, so in a cell it was a stub. Now every bow is
drawn last, unclipped, over all the instruments, in both styles, and the vector style's two readings by
the contact go with it.

Overflow alone was not enough. A violin's bow travels 1.43 m and the violin is 0.6 m long: at the old
sizes a bow at the frog or the tip ran off the stage itself (on a 1440×900 window 48 % of a violin's bow
travel was off the stage). So a lineup with bowed strings is now laid out where every bow, frog or tip on
the string, ends on the stage and under the player, at the largest size that allows. **That makes the
instruments smaller in several layouts.** A violin's scale, px per metre, before → after:

| Window | Lineup | Before | After |
|---|---|---|---|
| 1440×900 | flute + quartet | 679 | 733 |
| 1440×900 | quartet | 874 | 733 |
| 1440×900 | with a grand | 553 | 396 |
| 1440×900 | eight parts | 727 | 622 |
| 1535×1330 (the report's) | flute + quartet | 1240 | 792 |
| 390×844 | flute + quartet | 339 | 237 |
| 390×844 | quartet | 428 | 237 |

A cello alone in an ensemble of one goes 945 → 360. Desktop ensembles with strings now stand upright in
one row (it was a grid of lying instruments at 1440×900). Lineups without bowed strings are laid out as
before. To have the old sizes back with bows running off the stage's edge, drop the
`if (melV.some(bowedId))` block in `ensembleCells`.

Left: on a single instrument's 2D stage the bow still runs off the stage at the ends of its travel.

## 5. The pieces (set list) button

`setlist-before-*.jpg`, `setlist-after-*.jpg` (the menu open: one instrument and an ensemble, desktop
and phone).

It was a chip in the picker's row, at the far left of the top band, away from the transport it feeds. It
is now one icon of the player's overlay, between routing and open: at rest `play · pieces · open`,
loaded `play/pause · stop · position · routing · pieces · open`. Same label, same tip, the player's own
icon language; no new text. Its menu hangs under it and stays 6 px inside the window (at 390 px wide it
spans 85–305 px at rest, 165–385 px with a piece loaded). It shows for one instrument and for an
ensemble alike, as it did: a piece brings its own ensemble.

The two small amber icons under the transport in `reported-bows.jpg` are not this button. They are the
player's line chips (one per line of the file, lit while it sounds), and they are unchanged.

## 6. The trumpet's line

`reported-trumpet.jpg`. The thin rod off the main slide's crook, ending in a small circle, is the water
key (default 2D style, `drawTrumpet`), and the two curved lines at the mouthpiece rim in 3D are the lip
buzz. Both are meant. Neither was changed.

## 7. Checks

- `apps/web/test/fholes.test.ts`: two eyes each on one circle for more than 240°, the upper smaller and
  nearer the centre line; the edge changes the way it bends fewer than 30 times; exactly four sharp
  corners (two nicks on the bridge line, two wing tips on the eyes); never crosses itself; treble is the
  mirror of bass. The trace it replaces has no round eye and changes its bend more than 60 times.
- `apps/web/test/models3d.test.ts` "a smooth arch": no facet of a bowed top turns more than 12°.
- e2e "3D varnish …": the speckle measure above, on the live painted map, cello and violin. Run against
  main it fails (cello 1.52, limit 0.8).
- `apps/web/test/ensemble-cells.test.ts`: 8 lineups × 6 stage sizes, every bow's whole travel ends on the
  stage and the cells do not overlap (47 of the 48 fail with the old cells).
- e2e "orchestra in 2D: every bow is drawn whole …": each bowed part played at the frog, the middle and
  the tip, both styles, desktop and 390×844: the hair's line is bow-coloured along more than 90 % of its
  length, both ends on the stage and under the player. With the old drawing the least share was 0.21
  (desktop) and 0.40 (phone).
- e2e "the pieces are in the player's overlay …": the button is in the player's row and not in the
  picker; the row's icons in order at rest, loaded and for an ensemble; the menu under its button, whole
  and on the screen. It fails on main.

Whole suite on the branch: typecheck clean; unit 33 files; e2e desktop and Pixel 7, 90 passed, 10
skipped (the phone project's own skips), none failed.
