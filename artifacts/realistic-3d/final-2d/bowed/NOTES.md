# 2D violin, viola, cello (`drawBowed`)

Before is c253ed4 (cycle 0). After is this branch. Shots come from `scripts/review-2d.mjs`: desktop 1440×900 at 2×, phone 390×844 at 3×, with the stage cropped to y 128–680 (desktop) or 140–640 (phone). The motion sequences come from a scratch script that plays this sequence and captures it frame by frame:

1. an open string;
2. a slur to another note;
3. a slurred string crossing;
4. holding until the bow changes;
5. the bow lifted;
6. a low string.

| File | What |
|---|---|
| `before-after.jpg` | Rows are violin, viola and cello: before on the left, after on the right. The last row is the phones, before ×3 then after ×3. |
| `violin.jpg`, `viola.jpg`, `cello.jpg` | Final desktop stage, as the review script plays it. |
| `phone-*.jpg` | Final phone stage. |
| `motion-violin.jpg` | Desktop sequence, read left to right and top to bottom. |
| `motion-cello-phone.jpg` | The same sequence on a phone. The whole cello bow fits, so it slides frog to tip. |
| `cycles/cycle{0,1,2}-*.jpg` | Each cycle's review shots. |

## What it draws now

The view is a plan of the front, as in the Met photographs (`.cache/refs-3d/*-front.jpg`). The scroll points left (up on a phone), and the bass side faces the player: down on desktop, left on a phone. Before, it was mirrored. Everything is in metres, from the 3D model's figures (`strings3d.ts` SPEC).

- **Plate**
  - The traced outline from `gl/outlines.ts`: 481 stations, corners hooked as `strings3d.ts` does, and an elliptical cap on the last 9 % at each end. The trace runs about 100 mm square across both ends, but the photo is round there.
  - The traced f-holes, smoothed with σ 1.2 mm, notches on the bridge line.
  - Varnish per instrument, using the 3D colours: lighter over the bouts' crowns and along the arch, darker in the channel.
  - Spruce grain, purfling (4 mm in from the edge on the violin, 6.5 mm on the cello) and the edge's crown.
- **Inside, as if seen through the top:** the bass bar, dashed, under the bass foot (5.5 × 270 mm on the violin), and the soundpost behind the treble foot. Both warm with the body's level.
- **Head, front view**
  - The pegbox cavity, and the crown with its spine and two flutes.
  - The turns stand out as ears around the eyes.
  - Foreshortened to 0.85, as the photos show it: 90 of 108 mm.
  - Pegs are paddles. The bass side carries the peg nearest the nut and the third peg, as in all three photos.
- **Fittings**
  - Strings at their gauges (violin 0.8 / 0.8 / 0.6 / 0.26 mm; wound strings are warmer, steel E is cooler).
  - Nut, bridge (feet, sloping face, top edge), tailpiece (fret, holes, fine tuner).
  - Saddle and tailgut, end button, and the cello's endpin (socket plus a 0.32 m rod).
- **Live**
  - The finger: its base place eases with τ 35 ms, so a shift slides. Vibrato goes straight through, drawn 4× larger, and the pad rolls by half of it. A faint bar shows the vibrato range over the last ~0.45 s. Fingers fade in and out.
  - The bowed string's Helmholtz shape, sideways in plan, about one string spacing at full scale. Around it, the envelope swept over the last 0.3 s, and the corner (the shape's sharpest kink) as a dot with a halo.
  - Sympathetic and ringing strings glow amber.
- **Bow, true length**
  - The stick is 8.6 mm for Tourte's first 110 mm, then tapers to 5.3 mm. Its camber runs 17.5 → 8 mm over the hair.
  - The bow is tilted 40° towards the fingerboard, so the hair shows beside the stick. The hair strands are dashed so they ride with the bow.
  - Frog: ferrule, pearl slide, underslide and eye. Head: its face plate. Then the winding, leather and button.
  - The contact eases over 50–60 ms, so a string crossing slides. The bow's plan shortens by cos of the bridge-arch slope on the outer strings.
  - The contact patch is sized by the bow force (√(F/0.5 N), parsed from the frame's bow trace) and lit by the power v·F. A chevron shows the direction, and it is hidden during a bow change. A lifted bow fades to 45 %.
- **Modes:** a warm-only glow from the same plate shapes as `ModeField`, on a 36×20 grid smoothed over the plate. It stays under the fittings and out of the f-holes, with time-constant smoothing.
- **Cost:** the still parts are painted once per size into two layers, each cropped to its box, and blitted each frame.

| Per frame, 1440×552 at 2× | Before (c253ed4) | After |
|---|---|---|
| violin | 1.08 ms | 0.60 ms |
| cello | 1.12 ms | 0.67 ms |
| Layer paint, once per size or instrument | — | 9–12 ms |

The old per-frame cost was mostly the ModeField pass, which the bowed view no longer runs.

## Cycle 0: c253ed4, harsh critique (ranked)

1. The bow is a two-line pole across the whole stage. Its frog is a box at the stage edge, and there is no tip, hair or camber.
2. The body is the old hand-tabulated outline: lumpy, flat, translucent. The pale "sand" mode lines dominate it.
3. The view is mirrored: the bass side faces away from the player, against every photo.
4. The scroll is a spiral seen from the side in a front view, and the pegs are four lines.
5. The f-holes are two S-curves with dots.
6. The string shape is so large that it crosses the other strings, and there is no envelope or corner.
7. Line weights are uniform and thin, and the strings don't follow gauge.
8. The cello has a stub for an endpin, a violin's head and a violin's tailpiece.

## Cycle 1: what changed, then its critique

Everything above was redrawn from the 3D figures: outline, f-holes, head, pegs, fittings, the bow at scale, the side corrected, and the layers.

Critique of the result (ranked):

1. The `ModeField` glow, blurred, read as pale blotches or stains on the varnish.
2. The stick covered the hair. The stick was a flat brown band.
3. The scroll read as a spade or arrowhead.
4. The peg heads looked like light bulbs.
5. The chinrest (as in the 3D) read as a hole, and none of the reference photos has one.
6. The fine tuner was too bright.
7. The bass-bar dashes looked like construction lines.
8. The Helmholtz envelope was too faint.
9. The fingertip had a UI-like ring.

Fixed in cycle 1:

1. An own warm-only glow (`BowedGlow`); `ModeField` is untouched.
2. The tilt went to 40°, the stick is shaded round (lit side, shade side), and the hair is brighter.
3. The head is the crown plus two ears.
4. The pegs are paddles at the photos' size, about 19 mm.
5. No chinrest.
6. The tuner is quieter.
7. The bass bar is a fine dotted line.
8. The envelope edges are stronger.
9. The finger ring is gone.

## Cycle 2: critique, side by side with violin-front.jpg plus the motion sequence (ranked)

1. The stick kinked into a "Y" at the head, from a linear ramp in the camber. The head was a crude wedge, and the frog was a black box.
2. The head was too long: 108 mm drawn, against 90 mm in the photo's front view.
3. The varnish was a smooth airbrush gradient. The photo shows a light ridge along the arch and mottling.
4. The bow force was unreadable. In a true plan the hair's give is vertical: the V is drawn in the oblique reading, but it spans the whole hair and can't be seen.
5. The hair strip was dim. The fingertip was nearly invisible, and the Helmholtz corner had no presence.
6. On the phone, the contact glow (fixed in px) swamped the cello's strings.

Fixed in cycle 2:

1. The camber rises smoothly into the head, and the head and frog get their near side faces, pearl slide and underslide.
2. The head is foreshortened to 0.85.
3. An arch highlight, and a coarse faint mottle. The first try at 56×32 cells looked like camouflage and was cut to 14×8 at about half the alpha.
4. The contact patch is sized by force and scaled to the string spacing.
5. The hair alpha went from 0.62 to 0.8. The finger pad is brighter, and the corner has a halo.
6. Contact glow fixed by item 4.

## Cycle 3: critique (ranked) and changes

1. Memory: two full-stage layers plus a full-stage scratch canvas came to 3 × 12.7 MB = 38 MB at 1440×552@2×, and more on large screens. Each layer is now cropped to its part's box (violin: plate 4.9 MB plus fittings 8 MB), and the scratch canvas is released after the purfling is painted. The render is unchanged.
2. The ebony pegs read as grey plastic, so they are warmed slightly.
3. Checked the idle and lifted bow, the vibrato close-up, slurred crossings, the bow change at the tip and at the frog, and the phone sequence. No new defects.

## Remaining weaknesses (honest, ranked)

1. **The desktop bow runs off the stage.** At true scale the hair is 0.64 m, twice the stage height. The frog shows only in roughly the first quarter of a stroke and the head in the last quarter; mid-stroke both ends are off-stage. On the phone the cello's whole bow fits, but the violin's and viola's don't.
2. **Hair deflection is honest but invisible.** In a plan view, the give under the bow force is perpendicular to the top. It is drawn as a shallow V (3×, T 60 N), but the force really reads through the contact patch's size. A side inset would show it, but that would be new UI.
3. **The bow force comes from parsing the bow trace's caption** (`… 0.56 N …`). The visual frame carries no force field. A `bow.force` field would be cleaner, but that is an engine change.
4. **The head is constructed, not traced**: a crown plus two circular ears, plus a spiral line. Close up it is schematic next to the photos. The pegs are flat-shaded paddles.
5. **The viola uses the violin outline scaled to 406 mm**, as the 3D does. The Stainer viola in the photo has its own pattern.
6. **The Helmholtz shape is a ~60 Hz snapshot of a 200–1000 Hz motion**, so the corner jumps from frame to frame; only the envelope shows its path. Early in a note, before Helmholtz motion settles, the shape is ragged (that is the engine's).
7. **The room's wavefronts** start at `stage.ts`'s fixed `{x: 0.62 w, y: ih/2}`. On desktop that is about 50 px left of the bridge, and on a phone it is off the instrument. That is `stage.ts`, not `drawBowed`, so I didn't change it.
8. **`stage.ts` still allocates `fields.bowed` (`ModeField`) and passes it in**, but `drawBowed` now ignores it (`void field`). It could be dropped from `stage.ts`.
