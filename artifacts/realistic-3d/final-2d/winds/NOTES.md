# 2D flute and trumpet: notes

`drawFlute` and `drawTrumpet` in `apps/web/src/ui/stage-draw.ts`, and their own helpers placed next to them.

The before shots come from c253ed4, the first shots taken before any change. The after shots are the final state. All shots use `scripts/review-2d.mjs`: the flute plays D5 and the trumpet plays G4 (valves 1+2). Desktop is 1440×900 at 2×, and the phone is 390×844 at 3×.

The contact sheets crop the stage to y 128–680 of 900.

| File | Contents |
|---|---|
| `before-after.jpg` | The reference photographs, then before and after on desktop, then before and after on the phone |
| `cycles-flute.jpg`, `cycles-trumpet.jpg` | Each critique cycle's shot, from 0 (before) to 4 (final) |
| `range-flute.jpg` | Flute at C4, A4, E6 (cross-fingered) and A6 |
| `range-trumpet.jpg` | Trumpet at F♯3 (2+3), C4 (1+3, 3rd slide kicked out) and C5 (open) |
| `final-*.jpg` | Final desktop and phone screenshots |

## What the drawings show now

### Flute

The flute is drawn from above, as a Boehm C flute laid out at the 3D model's measured positions. Those positions come from `gl/winds3d.ts`: a Yamaha YFL-482H measured off `flute-side.jpg` and scaled to McGee's 670 mm.

**The instrument:**
- the crown's dome and the head's taper;
- the lip plate (45 × 27.6 mm superellipse) and the embouchure hole (12.4 × 10.2 mm);
- the socket's two rings and the foot's ring;
- the 14 keys:
  - French cups with their holes, grommets and pointed arms;
  - plain cups with pad washers;
  - the C♯ key's lever cup;
  - the thumb key and the G♯ key, whose cups show past the tube's edge on the player's side, where they really sit (φ −140° and −108°);
  - the foot's D♯, C♯ and C keys (foreshortened at their φ), with the rollers and their levers;
- the G♯ spatula, the D♯ touch, the trill touches and the B♭ shake touch;
- the rods, the hinge tubes and the posts.

**The fingering:**
- The Boehm chart now lives in `ui/flute-fingering.ts`, shared with the 3D model.
- Keys move through the mechanism's links. For example, R1 closes the F♯ and B♭ keys, and L3 takes the duplicate G♯ key down.
- Each key moves on the 3D model's spring (26 Hz, ζ 0.62). A seated cup sinks 3.5 % and takes an amber rim, with a fingertip over an open hole.
- The keys return to rest 0.8 s after the breath stops.
- A test holds the 2D keys to the 3D keys for every note from C4 to C7.

**The bore's standing wave:**
- It is drawn inside the tube over the effective length: c/2f, from the engine's `focus.lengthM`.
- The near node sits 50 mm above the embouchure. The 3D model's holes give 56–64 mm of total end correction; an open end's 0.61·a ≈ 6 mm (Levine & Schwinger) leaves about 50 mm at the embouchure.
- So the far node falls just past the first open hole. For a cross-fingered third-octave note, it falls among the vents.

**The jet:**
- Five fine steel streamlines run from the lips at the plate's edge, narrowing to the hole's far edge.
- They carry the jet's disturbance as many wavelengths as the engine's jet delay in periods (`τj … = 0.42 periods`). This is drawn slowed, and it grows downstream.
- The jet brightens with the breath and its vibrato.

### Trumpet

The trumpet is an orthographic view of the 3D model's wrap (yaw 11°, pitch 13°). The bell's mouth opens as an ellipse, and the caps read as ellipses.

**The parts:**
- the 7C mouthpiece's profile, the leadpipe and its ferrule;
- the main slide (top leg, crook, lower leg) with its ferrules and the water key;
- three piston valves: casings with collars, knurled caps, stems, and buttons with pearls;
- the 1st slide with its thumb saddle;
- the 3rd slide inside the main slide's loop, with its ring and stop rod;
- the 2nd crook out in front;
- the bell tail, the bow with its ferrules, and the bell's flare to a 122 mm rim, using the 3D model's Bessel profile through a monotone cubic.

**The mechanism:**
- The pistons go down 15.5 mm on a 22 Hz spring.
- The 3rd slide kicks out for 1+3 and 1+2+3 below the 4th partial, and the 1st slide from the 4th partial up. When a slide is out, the nickel inner tubes show.
- The fingers lift 0.8 s after the sound stops.

**The air path and the standing wave:**
- The air's path runs from the lips to the rim: mouthpiece, leadpipe, main slide, then valves 3, 2 and 1, through a pressed valve's slide.
- A pressed valve's slide joins the glow. A slide out of the path is drawn darker.
- The standing wave runs along that path by arc length.
- In the flare, the pressure has the Webster horn's 1/r taper (p = ψ/r).
- A test checks the path's length against the engine's. Valves 2, 1 and 3 add 101, 164 and 276 mm; the engine's ratios want 88, 181 and 280 mm. The combinations come out sharp, as on every three-valve trumpet: 1+3 adds 441 mm against 496.

**The lips:**
- Two soft cushions sit against the rim.
- Their buzz is drawn slowed and opens by the engine's lip opening.
- A steel puff passes into the cup.

### Both instruments

**The wave's sign:**
- Each visual frame holds one snapshot of the bore, at an arbitrary phase.
- `trackBoreWave` correlates every point with the strongest point. This recovers each point's amplitude with its lobe's sign, in the engine's units.

**How the wave is drawn:**
- An envelope (vermilion, |A|^1.5) keeps the nodes dark and the antinodes lit at every phase.
- A slowed swing on top of it shows compression in vermilion and rarefaction in steel. Its rate is about 0.55·√(f/262) Hz.
- The wave's reference level is the loudest of the last few seconds (AutoScale release 0.997). So a released note fades; it is not re-normalised to full glow.

**Cost:** 0.06 ms of canvas calls per frame for the flute and 0.22 ms for the trumpet (Chrome, desktop). The paths are cached per canvas size, and the trumpet's air path per fingering.

## Cycles: ranked critiques and what changed

### Cycle 0 → 1: the redraw (shots: `cycles-*` rows 0 and 1)

**Flute before, worst first:**

1. A huge vermilion lobed envelope outside the tube dominates the stage. It reads as a graph pasted over the instrument, not as the air inside it.
2. The flute is a featureless rectangle: no crown, lip plate or joints. Its "keys" are 13 equal dots at semitone positions computed from `tubeFor`, not the Boehm layout.
3. The fingering is a slide-whistle model: holes are "covered up to the sounding end". There are no cross-fingerings, no C♯ vent and no thumb, G♯ or D♯ keys. The covered dots pulse with the vibrato, which real keys do not.
4. The wave's ivory line is the raw instantaneous snapshot, which jumps every frame. The gradient band is a uniform smear, and the end corrections are ignored.
5. The jet is a single blue squiggle above the hole, not tied to the hole or to the jet's delay.
6. Every line has the same weight, and there is no material.
7. On the phone, the lobes fill the screen and the flute is a stick.

**Trumpet before, worst first:**

1. It is a diagram, not a trumpet: an oval loop with U-dips, not a trumpet's wrap. There is no bow, no mouthpiece shape and no finger hook.
2. The valves are ovals on stalks over hollow rectangles, not casings, caps and buttons.
3. The standing wave is a thick, saturated red band of stroke segments that ignores depth and runs through the casings.
4. The slides are bare U's, with no sleeves, ring, saddle or kick.
5. The bell is a cubic flare, not the Bessel horn.
6. The lips are two big vermilion ellipses detached from the mouthpiece.

**Changed:** both instruments were redrawn from the 3D model's geometry, as described above.

### Cycle 1 → 2 (rows 1 and 2)

**Flute, worst first:**

1. The bore glow is oversaturated and hard-edged, and the rarefaction half in the head reads as a light-sabre.
2. The closed keys are solid amber coins, heavy and noisy.
3. The arms read as black spikes on the cups.
4. The room's grip control sits on the foot.
5. The jet lines poke out above the plate like whiskers.
6. The silver tube reads as near-black.

**Trumpet, worst first:**

1. Every tube in the path glows red or blue: loud, not subtle.
2. The bell's flare fills with a bright red cone. The engine's loop sums its forward and returning waves into an antinode at the bell, where the open mouth has a node.
3. The lips read as a red bow-tie.
4. Whenever the slowed swing passed through zero, the whole wave vanished, so a screenshot could miss it.

**Changed:**
- An envelope layer now sits under the swing, so the nodes read at every phase. The swing's alpha is down to 0.42–0.44 and its width to 0.32 D.
- The flare has the Webster 1/r taper.
- The flute's band is two soft layers drawn in `screen` mode.
- The cups now take an amber rim with a 0.14 fill; the arms are thinner and silver.
- The flute moved to 0.40 H, clear of the grip.
- The jet fades in from the lips and narrows to the edge.
- The tube's highlight is brighter.
- The lips are felt cushions, warm only when buzzing.

### Cycle 2 → 3 (rows 2 and 3)

**Flute, worst first:**

1. The cups float. On real keys the cup grows out of a neck from its hinge tube (`flute-joints.png`).
2. The tube lacks its lit edge.
3. The foot's roller levers were diagonal scribbles. (Cycle 4 made them L-shaped levers along the foot.)

**Trumpet, worst first:**

1. It still reads as clean tubing, not an instrument. It lacks the ferrules, the 3rd slide's stop rod, the water key, and the inner tubes when a slide is out.
2. The 2nd crook is 50 % too long: the 3D model's crook adds 134 mm against the engine's 88 mm.
3. Slides out of the air path look the same as the slides in it.
4. **Bug:** the wave was normalised by the stage's fast AutoScale, so a released note kept glowing at full brightness.
5. The pistons stayed down forever after the last note.

**Changed:**
- The flute's cups now grow out of pear-shaped necks, and the French pointed arm runs over the cup to its grommet.
- The flute's tube has its lit upper edge.
- The trumpet gained ferrules, the stop rod and nut, the water key along the crook (with its cork), and the inner tubes.
- The 2nd crook is tighter in 2D (it adds 101 mm) and pinned by a test.
- The valve passages count as 110 mm whichever way a piston routes the air.
- Slides out of the path are drawn darker.
- The wave uses its own slow reference, so it is dark 1.5 s after release.
- The pistons lift 0.8 s after silence.
- The lips' slowed buzz rate scales with pitch.
- The paths are cached.

### Cycle 3 → 4 (rows 3 and 4; `range-*`)

**Flute, worst first:**

1. A6–C7 (bore notes 74–77) have no key that sounds that note. The far end fell back to the foot, so their wave was drawn near the foot.
2. The foot's levers.

**Trumpet, worst first:**

1. The envelope was a little too faint to show the pattern at a glance.
2. The water key's cup read as a ring.

**Changed:**
- The flute's wave is now placed from its embouchure node plus c/2f. Notes with a key land where they did before; A6's three lobes now end by the C♯ vent.
- The foot's levers are L-shaped, running along the foot.
- The envelope alpha went up: flute 0.22 → 0.26, trumpet 0.24 → 0.32.
- The water key's cup shows its cork.

## Remaining weaknesses, worst first

1. **The flute is small on the stage.** It is a 670 mm tube across 1440 px: 38 px tall on desktop and about 13 px on the phone. The wave inside the body is mostly under the cups; only the hairline crosses them. The head joint carries most of the visible wave.
2. **The trumpet's leadpipe hides most of the bell pipe**, as in the photograph. The air path's glow in the bell pipe is only visible from the bow and past the main slide.
3. **The engine's brass wave puts an antinode at the bell.** Its loop sums the forward and returning waves without the bell's inversion. The Webster taper hides this in the flare, but the pattern just before the flare is still the engine's closed–closed one.
4. **The swing is slowed to about 0.5–1 Hz on purpose**, so it is a depiction, not the real oscillation. The lips' buzz (4.5·√(f/392) Hz) is also slowed and is not phase-locked to the wave's swing.
5. **The 2D trumpet's 2nd crook is tighter than the 3D model's.** The 3D crook adds 134 mm of tubing where a semitone needs 88. That is worth fixing in `winds3d.ts` (out of my scope).
6. **The same far-end fallback exists in the 3D model.** In `poseFlute`, `fm.keys.find((k) => k.note === bore)` falls back to the foot for A6–C7, so the 3D model draws those notes' wave over the whole tube.
7. **The trill keys' cups (φ 96°) and the thumb's B and B♭ levers are not drawn.** They are hidden from above. The thumb's state shows only as the edge of its cup past the tube.
8. **The room's grip control still sits over the trumpet's bell on desktop.** It is at the room rectangle's right edge, halfway down, and the stage code places it.
9. **The flute's sound source for the room's wavefronts is still the stage's fixed centre** (`stage.ts`). It is not the embouchure or the first open hole.

## Shared code and tests

**Shared code:**
- `INK`, `AutoScale`, `ModeField` and `drawSpectrum` are unchanged.
- The Boehm fingering chart (`FINGERING`, `fingersFor`, the finger bits, `boreNote`) moved from `gl/winds3d.ts` to the new `ui/flute-fingering.ts`. `winds3d.ts` imports it from there; its behaviour is unchanged and `models3d.test.ts` passes.
- `FluteState` and `TrumpetState` only gained optional fields. `stage.ts` is unchanged.
- New exports from `stage-draw.ts`, for the tests: `fluteKeysOpen`, `trumpetAirLength`, `BoreWave` and `newBoreWave`.
- `VALVE_DOWN` and `tubeFor` are kept.

**Tests:**
- New: `apps/web/test/winds2d.test.ts`, which checks the 2D flute's keys against the 3D model's for every note from C4 to C7, and the 2D trumpet's air-path lengths against the engine's.
- Unit: `npx vitest run apps/web/test` passes 15/15, and `pnpm typecheck` is clean.
- e2e (`pnpm build` included): "keys light only the notes the engine really sounds…" and "layout fits the viewport" (desktop and Pixel 7) pass, on a private port.
