# Bowed instruments, round 2: the carved scroll, the chinrest and the wear

The work is in `apps/web/src/ui/gl/strings3d.ts`. The shared tables only gained entries: `varnishWorn` in
`mesh.ts` `M` and `mats3.ts` `P`, and a `TEX 11` shader branch. The scroll's profile is traced by
`scripts/trace-scroll.py`.

## Shots

| File | What |
|---|---|
| `before-after.jpg` | Cello hero, its scroll in three-quarter and side, violin hero, viola hero; before = `63c5266` |
| `cello-hero-2x.jpg` | Cello hero at 2× DPR |
| `cello-scroll-34.jpg`, `cello-scroll-side.jpg` | Cello scroll close-ups at 2× DPR |
| `violin-scroll-side.jpg`, `violin-scroll-34.jpg`, `viola-scroll-side.jpg` | Violin and viola scrolls |
| `violin-close.jpg`, `cello-detail.jpg` | Chinrest, wear, rosin, f-holes, corners |
| `contact.jpg` | Each instrument next to its CC0 reference (`contact-sheet.py --free`) |

## The scroll, from a photograph

The head is traced from the "Francesca" Strad's scroll in profile (`violin-scroll.jpg`, The Met, CC0):

* **The pegbox and cheeks.** The pegbox's back is read row by row, and the cheeks' front edge is traced by
  hand where the pegs hide it.
* **The volute.** It is a logarithmic spiral fitted to 23 points on its turns. The fit is 4.4 px rms, with
  k = 0.1075 per radian (0.51 per turn). It ends in the eye after 2.6 turns.
* **Sizes.** From Jóhannsson's tables:
  * head length: violin 108 mm, viola 125 mm, cello 204 mm;
  * pegbox width at the nut: 25.5 mm, 27.5 mm, 45 mm;
  * across the eyes (from the Met's photographs): 41 mm, 46 mm, 70 mm.

One swept strip runs from the chin to the eye:

* **The turns step outwards towards the eye.** Each turn stands proud of the one outside it, as on a real
  scroll. The old volute narrowed inwards, which is backwards.
* **The turns are carved.** Each turn's side is hollowed (2 mm on the violin) inside a chamfered rim
  (1.15 mm). Grime collects in the hollows and against the next turn's wall.
* **The back is fluted.** It runs from the chin over the crown and down the front: two channels either
  side of a sharp spine, closing to rounded ends.
* **The pegbox is open.** Chamfered cheeks rise from a floor that rises into the throat. The cheeks' edge
  curls under the first turn over a dark recess, which is the crescent in the photograph.
* **The chin flares out of the neck's back.**
* **The eye.** It is a domed boss in a dark groove round the core that the last turn wraps.

The pegs sit 57 % of the way in from the cheeks' edge, as traced. Each string runs straight back from the
nut to its shaft.

## Three critique/fix cycles

### Cycle 1 (before = `63c5266`)

The top ten things that looked fake, ranked:

1. The scroll was a straight slab pegbox and a smooth donut volute whose turns narrowed inwards. It had no
   chamfers, fluting, throat or chin.
2. The chinrest was a black dish with a dimple, and its barrels floated off the outline as white dots.
3. The varnish was uniformly clean: no wear, no rosin, no scratches, and the neck was varnished like the
   body.
4. The fine tuner read as a white dot.
5. The cello's corners looked clipped.
6. The f-hole edges were serrated in close-ups.
7. The purfling read pale.
8. The pegs were plain.
9. The strings crossed in an X inside the pegbox.
10. The cello's colour was flat.

Fixed:

* (1) The traced, carved scroll.
* (2) A side-mounted chinrest, after `violin-34.png`:
  * a kidney cup 62 × 44 mm, dished 5 mm, with its lip rising 5.5 mm on the outer side;
  * an upper jaw on the top's edge, over cork;
  * a corked lower jaw under the back's edge;
  * two knurled satin-nickel barrels on the outline against the rib.
* (3) Wear at the contact points:
  * on the treble upper bout;
  * beside the chinrest, rubbed through and darkened;
  * at the cello's knees;
  * on the C-bout edges;
  * on the back where it rests.

  Also:

  * rosin dust under the strings;
  * scratches and chips;
  * edge runs and corner tips rubbed pale.

  The worn places dull the clear coat through the aux map's blue channel. The neck's back is bare maple,
  as on the Francesca.
* (4) A satin lever tuner.
* (8) Ring collars on the pegs.
* (9) The strings run straight back from the nut.

### Cycle 2

1. The scroll was flat and plastic. The pale chamfer wear read as painted outlines.
2. The carving was too shallow.
3. The chinrest was still a black blob from above.
4. The f-holes were serrated: the trace's row wobble.
5. The viola was the violin's twin.
6. The rosin was coarse specks, weighted towards the fingerboard.
7. The scratches read as black dashes.

Fixed:

* The f-hole outline is resampled and smoothed (σ 1.2 mm).
* The hollows are 1.5 mm deep. The rims are left to the light and the grime goes into the recesses.
* The flame is stronger.
* The chinrest is rosewood.
* The viola takes the Stainer's deep red-brown (`viola-34.jpg`).
* The rosin is a fine haze by the bridge.
* The scratches are fainter.

### Cycle 3

1. Each corner had a black gap where the ribs failed to meet, and a flap of rib stuck out past the tip.
   The plate's inward offsets folded inside each corner's hook.
2. The volute read as concentric washers rather than a spiral ending on an eye.
3. The flame vanished on faces seen square-on: the figure only flipped with the view.

Fixed:

* Each offset loop is cut out at its self-crossing, which gives the rib's true miter under the tip.
* The eye sits in a groove round a core.
* The hollows are 2 mm deep.
* A share of the figure no longer flips, and the varnish drifts and mottles.

## Frame cost and build

The frame cost is CPU per frame (`stats.ms`), over the review set at 1440 × 900:

| | Before | After |
|---|---|---|
| Violin | 0.50–0.75 ms | 0.60–0.69 ms |
| Viola | 0.48–0.72 ms | 0.56–0.65 ms |
| Cello | 0.45–0.75 ms | 0.56–0.75 ms |

That is within noise: the head is static and built once.

Each model is built once, in about 0.25 s. The vertex counts:

* violin and viola: 228k → 338k (the head adds about 75k, the chinrest about 30k);
* cello: 242k → 322k.

## Still fake, honestly

1. **Close to the eye the volute still reads a little lathe-turned.** The last turn's tail doesn't visibly
   end on the eye as on the Francesca.
2. **The varnish is procedural.** It has no depth or translucency, and the flame is a regular sine figure
   (zebra stripes up close). The colour is more even than any of the Met's instruments.
3. **The wear is placed, not measured.** It is faint at hero distance, and the cello's knee wear reads as
   speckles up close.
4. **The chinrest is a generic side-mount shape.** It is built from rounded superellipse pucks, so the cup
   is simpler than a carved one.
5. **The pegs have no pearl eyes or decorative collars.** The bridge is plainly shaded, with no string
   grooves.
6. **Other simplifications:**
   * the ribs carry no wear;
   * there are no linings, blocks, bass bar or soundpost to see through the f-holes;
   * the arching is analytic.
