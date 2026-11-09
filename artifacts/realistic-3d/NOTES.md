# Realistic 3D + cello audio — notes

## Round 2 (branch `improve/realistic-3d-r2`, from `63c5266`)

Held to `.autopilot/ART-DIRECTION.md` and `.autopilot/BRIEF-R2.md`. The upright, the stage and the UI
were done by the lead. The grand, the bowed strings, the winds and the cello's sound were done in
parallel worktrees, merged into this branch.

Deliverables are in `final-r2/`:
* `before-after.jpg` / `before-after-close.jpg`: every instrument's hero and close-up, against
  `63c5266`.
* `contact-*.jpg`: each instrument next to its reference photograph (CC0/public domain; the winds'
  sheet is CC BY-SA, credited in `final/README.md`).
* Per topic: `grand/`, `bowed/` (the cello hero at 2×, the scroll), `winds/`, `pedals/`,
  `cello-audio/`. Each has its own `NOTES.md` with its critique cycles.

### A renderer bug: the strings drew through the parts in front of them

The strings (and their glow) are screen-space ribbons depth-tested against the scene. The test had
been pulled 0.0004 NDC towards the eye. With the near plane at 2 cm, that is 0.01·z² m: 9 cm at the
hero's 3 m. So the strings, 45 mm behind the upright's hammers, drew in front of them: the "busy
gold cage". The bias is now in metres: 2 mm + 0.06 % of the distance. Close-ups of the grand, violin,
viola and cello are unchanged by eye.

### Upright (three cycles against `upright-action-close.jpg`, Kawai, and `upright-action.jpg`, Yamaha)

* **An underdamper action.** The dampers sat 35 mm above the strike line (the old "birdcage"
  overdamper layout), a row of orange blocks over the hammers. They now touch the strings 50 mm below
  it, behind the shanks, as in every modern upright. Above the hammers you now see the strings,
  agraffes, understring felt and pin field, as in both photographs.
* **The vitrine is gone.** The top front rail no longer frames the opening as a window. The fallboard
  opens with a rounded edge and hinges, the lid has a piano hinge, and the pedals are cast brass feet
  in red-felt slots.
* **The action.** Rails of pale beech, and a deep hammer rail just under the heads (both photographs).
  Catchers with green felt faces; bridle wires with red leather and white cotton tapes; pale, slimmer
  damper levers; shorter hammer-moulding tails in a less red brown; a satin pressure bar.
* **The harp opens onto the soundboard** below the treble hitch-pin flange. You see it when the case
  is hidden.
* `upright-cycle3.jpg`: before/after.

### Grand, bowed strings, winds

See `final-r2/grand/NOTES.md`, `final-r2/bowed/NOTES.md` and `final-r2/winds/NOTES.md`. In short:

* **Grand.** A whole rim and plate (no cut-away). The plate is gold-bronze at the hero: sRGB (153,
  121, 72) against the reference's (130–160, 100–125, 70–85); it was (193, 165, 134). The action
  shows through the lid. The cast plate has struts, agraffes and shaped dampers. **The music desk is
  removed** (with its rail and posts): there was no non-piano stand, so per Stephen's rule the desk
  was the part to go. The casters stand on the floor.
* **Bowed.** A scroll traced from the Francesca Strad: a log-spiral volute, fluting and chamfers. A
  real rosewood chinrest. Clean corner miters. Painted wear and rosin at the contact points.
* **Winds.** The flute follows the Boehm fingering chart with its keywork: the F♯ bridge, Briccialdi
  lever, thumb and G♯ keys, needle springs and pads. The trumpet has an open finger hook, a real water
  key and satin knurls.

### Stage and interaction

* **Action close-up is piano-only** (2D and 3D). One predicate gates every way in. A change of
  instrument closes the panel and clears the zoom cursor. Tested over a grid of clicks on the five
  other instruments.
* **3D key fly-to (pianos).**
  * A click or long-press on a key's strings or key top flies the camera (0.9 s, eased) to that
    key's action, nearly in profile.
  * A section plane sweeps in, cutting away the keys between the camera and it. The rest stays as
    context and plays live.
  * Back with Esc, a click off the keys, a double-click or a small ×.
  * GIFs: `key-zoom-*.gif`.
* **Hide the case (pianos, 3D).**
  * An icon beside "3d", or I. Remembered for the session.
  * The cabinet dissolves (screen-door, in the shadow pass too) and leaves the plate, strings,
    soundboard, keys and action.
  * `case-toggle-upright.jpg`.
* **The full pedal set** (`pedals/`).
  * Grand: una corda, sostenuto, sustain.
  * Upright: half-blow soft, the practice muffler (the U1's middle pedal; chosen over a bass
    sustain), sustain.
  * In sound, 2D and 3D, on screen, with B for the middle pedal, and CC64/66/67.
  * The default sound is bit-identical (golden tests).
  * Levels: upright soft −2.8 dB (all strings struck), muffler −9.6 dB and darker. Both are
    estimates, flagged in `voice.ts`: no recordings of either.
* **The "sustain" camera bug.**
  * Sustain never moved the camera. But a piano's orbit target lies inside its case, and the
    wheel/pinch clamp let the camera through the plate into the action.
  * The camera now stops 6 cm outside each piano's box (the new test fails without it: the camera
    ends at (0.30, 0.80, 0.54)).
  * `bug-sustain-camera-before-after.jpg`.
* **MIDI file player** at the top middle of the stage, under its band, in 2D and 3D, covering
  nothing. Its hairline has no tooltip. `midi-player-top.jpg`.

### Frame cost (CPU per frame, 1440×900, hero)

| | 63c5266 | round 2 |
|---|---|---|
| grand | 0.74 ms | 0.68 ms |
| upright | 0.59 | 0.63 |
| violin, viola, cello | 0.44–0.47 | 0.48 |
| flute, trumpet | 0.45–0.49 | 0.46–0.47 |

### Cello audio

Cello only (the other instruments are sample-for-sample identical to `6a919e5`: 24 of 24 cases at
44.1 and 48 kHz, dry and with the room; their goldens pass without re-blessing). Details, every table
and the rejected attempts: `final-r2/cello-audio/README.md`. MP3s and spectrograms of the five pieces
against `6a919e5` are there too.

* **Judge** (held-out notes):
  * Final against `6a919e5`: **NO CLEAR CHANGE**, 1.86 → 1.85 (Δ 0.01 ± 0.06), no guard broken.
    Harmonics improved (12.04 → 11.40) and noise improved (5.80 → 5.56); attack slipped a little
    (1.39 → 1.44).
  * Kept under last round's rule: no clear change overall, clear wins on the targeted measures.
  * A 34-parameter refit also scored NO CLEAR CHANGE but was rejected: over 6 seeds it made pp,
    noise and pitch worse.
* **What changed in the model.**
  * The bridge's own resonance now appears in what the strings see (the "bridge hill", effective mass
    2.2 g, Woodhouse 2005). Soft notes were cutting each slip short with a ripple trapped against a
    nearly rigid bridge, which made a peak near the 7th–8th harmonic. They now hold full Helmholtz
    slips.
  * Per-sample constants became time constants, and the bow's torsion taps sit between samples.
  * The stopping finger follows the heard pitch, with a fitted weighting for the open strings.
  * The bow-change force stays under the maximum for the bow's speed at that moment.
  * 11 parameters were refitted, with a 96 kHz measure included.

| | before (6a919e5) | after |
|---|---|---|
| centroid ratio pp / mf / ff (default seed) | 1.59 / 1.01 / 0.84 | **1.35** / 1.05 / 0.76 |
| same, mean of 8 seeds | 1.63 / 1.09 / 0.88 | 1.39 / 1.05 / 0.83 |
| pitch RMS, mean of 8 seeds | 2.24 ¢ | 1.87 ± 0.51 ¢ (default seed: 2.46 → 2.47) |
| ⅓-octave RMS error | 4.33 dB | 4.20 dB |
| harmonic-to-noise vs the recording | +1.62 dB | **+0.18 dB** |
| soft G2 / D3 centroid, 44.1 → 96 kHz | +0.69 / +0.52 octave | **+0.11 / +0.13 octave** |
| clicks over five pieces (mean of 12 seeds) | 8.75 | 11.50 |

* **Sample rate.** Over all 67 calibration notes, the mean 44.1/96 kHz difference fell from 0.207 to
  0.118 octave. A new test holds soft G2, D3 and A3 within 0.2 octave. The controllers test's margin is
  back to 1.1.
* **Pitch.** Last round's "rise from 1.8 ¢" was seed luck: 624c0bf scores 2.45 ± 0.67 ¢ over 8
  seeds.
* **Not fixed: clicks.** Fewer renders click (18 → 15 of 60), but one C2 pp render clicks every
  period for over a second and holds most of the total. The same detector finds 0.16 clicks per
  second in the Iowa cellist; the model went from 0.155 to 0.20.
* **Also not fixed:** pp is still ×1.35 (target 1.0–1.2), and ff got darker (×0.76 on the default
  seed).

### Leftovers, honestly

* Close up, nothing passes as a photograph.
* The upright's hammers are a little blocky from the front, and the inner faces of its sides are
  plain black.
* The grand's plate goes mustard in dim interior views. Its castings are smoother than real ones, and
  its cheeks and lid are plain slabs.
* The scroll's last turn doesn't visibly end on the eye. The varnish has no depth, and the flame is a
  regular pattern.
* The flute's silver reads as dark chrome and the trumpet's lacquer highlights are soft: the shared
  studio lighting. Also, three r186 ignores a material's `envMapIntensity` when the light comes from
  `scene.environment`; found by the grand agent, not yet acted on.
* The una corda's 2.5 mm shift is real-sized, so it is hard to see.
* The muffler and half-blow levels are estimates.
* The 2D upright is still the old drawing: it is the 2D phase's first job.

## Round 1


Branch `improve/realistic-3d-cello`, from `af4f97e` (production).

The round had two stages. The first rebuilt the 3D stage from extruded diagrams into lit whole instruments
and gave the cello a new sound model (`624c0bf`). The supervisor judged that first 3D "programmer art". A
polish pass followed, held to `.autopilot/ART-DIRECTION.md` with these steps, in order:

1. references;
2. silhouette;
3. forms;
4. materials;
5. lighting;
6. animation;
7. polish;
8. harsh critique/fix cycles against reference photographs, side by side.

The pass switched the renderer to three.js, rebuilt the violin family, the pianos and the winds, and
polished the cello's sound.

The before/after of every instrument's default view is `final/before-after.jpg`. The contact sheets are
`final/contact-*.jpg` (each instrument next to its reference photograph), the shots are in `final/shots/`,
and the cello audio is in `final/cello-audio/`.

## What changed: the 3D stage

### Process

Each instrument went through at least three full critique/fix cycles. Each cycle had four steps:

* render a fixed review set: hero three-quarter, front, side, a mechanism close-up and an actuated frame
  (`scripts/review-3d.mjs`);
* lay it out next to reference photographs (`scripts/contact-sheet.py`);
* list the top things that made it look fake, ranked;
* fix the top items.

The violin family had 4 cycles, the pianos 4 and the winds 4. The reference photographs are freely licensed
(most are CC0 Open Access photographs from The Metropolitan Museum of Art) and measured dimensions are in
`docs/3d-reference.md`. The photographs stay in `.cache/` and are not committed, except inside the contact
sheets as credited in `final/README.md`.

### Renderer: three.js (`three3d.ts`, `mats3.ts`)

The raw WebGL2 path could not reach the look, so the stage now renders with three.js 0.186.1. It loads only
when 3D is first switched on: a separate chunk of 685 kB (185 kB gzip). The page's own bundle is unchanged.

* **Materials.** One MeshPhysicalMaterial per material family:
  * clearcoat over lacquer, varnish and brass;
  * sheen on felt and bow hair;
  * anisotropic drawn steel;
  * iridescent pearl.

  Wood is textured in the shader from each part's own coordinates: spruce grain, flamed maple whose stripes
  flip light and dark with the viewing angle, ebony and maple fleck. Roughness has micro-variation
  throughout.
* **Light, the way a product studio lights it:**
  * a generated image-based light (PMREM) with a large overhead softbox, a key softbox, a wide card behind
    the camera (so polished brass and silver have something bright to reflect), and tall rim strips;
  * a warm key light with a soft PCF shadow, a cool rim light and a low fill;
  * ground-truth ambient occlusion (GTAO, half resolution);
  * a slight bloom on specular hot spots, with a capped soft knee;
  * Khronos PBR Neutral tone mapping;
  * a dark floor that takes the shadow and occlusion, and a softly lit backdrop. Both fade into the page's
    own ground colour.
* **Strings** are drawn as metal "wires" at their real diameter, shaded as cylinders, at least one pixel
  wide. The live glows (strings, stopping marks, breath, wavefronts) are drawn over the picture and hidden
  behind nearer surfaces.
* **Camera:**
  * a 24° lens (about 55 mm) instead of 34°;
  * damped orbit (about 70 ms) that never goes below the floor;
  * the cello's hero view is from its bass side, a little below centre.
* **Budget.**
  * Slow frames drop the occlusion, then switch to the light scene, then drop shadows.
  * Phones start with no occlusion, no bloom, a 1024 px shadow map and 2× multisampling.
  * 2× multisampling is also used on very large canvases.

### Violin, viola, cello (`strings3d.ts`, `outlines.ts`)

**Outline and f-holes.** Both are traced from front photographs (`scripts/trace-outline.py`, `make-outlines.py`):

* a J.-B. Vuillaume cello: its bouts come out 345 / 238 / 444 mm at a 755 mm body (Davidov: 345 / 235 / 440);
* the Stradivari "Francesca" violin: 166 / 111 / 208 (Messiah: 168 / 112 / 208). The viola uses the
  violin's outline at 406 mm.

The tracer sees the outermost edge row by row, which squares off the corners, so each corner is rebuilt as
a real hook: the C-bout curves back out under the tip.

**Plates.** Height fields (a long arch × a cross arch) rise out of a channel round the edge. The edge is
rounded and overhangs the ribs. The edge band is built as rings that follow the outline, so the channel is
never aliased; the interior is a grid clipped to the outline. Insets are fold-free, which keeps the corners
sharp.

**Painted maps:**

* spruce grain, the varnish (deeper in the channel, the C-bouts and round the f-holes, worn thin on the
  crowns), and black–white–black purfling;
* the back two-piece flamed maple with its button;
* the f-holes cut through with their walls, antialiased by alpha to coverage; the inside of the body is dark.

**Fittings:**

* a swept volute scroll whose turns step in, with a fluted back and hollowed sides;
* flat satin fiddle pegs;
* the neck's heel down to the button;
* a bridge cut from its outline (feet, heart, kidneys, ears);
* a tailpiece with its fret and a fine tuner;
* the chinrest, and the endpin with its rubber;
* the bow: head plate, frog, ferrule, slide, pearl eye, winding, leather and button.

The bow crosses strings in an arc instead of snapping.

### Grand and upright (`piano3d.ts`)

**Grand: 2.16 × 1.49 m.** That is within 3 % of a Steinway B, matching the engine's 1.58 m A0 string.

* **Case:** the bentside traced and swept into a bevelled rim with a bottom moulding and a black inner face.
* **Lid and desk:** the lid on its prop with the front flap folded back and brass hinges, and a music desk.
* **Legs:** square tapered legs on twin brass casters, and a lyre with braces, rods and brass pedals.
* **Plate:** gold-bronze paint, modelled as mostly diffuse metal flake in lacquer. It has:
  * the web over the pin block, the bass and treble windows, cast U-channel struts and the hitch flange
    with its rosettes;
  * the capo bar, agraffes, three staggered rows of satin tuning pins and the red felts.
* **Strings:** wires at real diameters: steel 0.8–1.2 mm, copper-wound bass 1.8–5 mm.
* **Action:** shaped hammers (white felt over red underfelt on a moulding), wippen, jack, repetition lever,
  backcheck, underlevers, wedge damper felts in the bass, and cast brackets.

**The action is a linked rig:** key → capstan → wippen → jack → knuckle.

* It uses the Erwin gauge geometry: hammer-to-key ratio 5.3:1, and the jack trips at let-off.
* After let-off the repetition lever holds the knuckle up.
* The backcheck catch follows the stage's own hammer state.

The treble cut-away became a window under the rim's top rail, so the case's silhouette stays whole.

**Upright: 1.21 × 1.53 m (U1).**

* the case with arms, consoles and toe blocks;
* the plate behind the strings and the pressure bar;
* hammer butts with catchers;
* narrow wooden hammer backs between cream felt shoulders;
* damper levers;
* a hammer rail that moves with the soft pedal.

**Cost.** Key tops are shared by cut, there is one shared key-stick mesh, and the pose is allocation-free:
a handful of draw calls instead of about 300. Grand frames went from 1.7–2.2 ms to 0.6–0.9 ms CPU.

### Flute and trumpet (`winds3d.ts`)

**Flute.** A Boehm C flute with a C foot, 670 mm long, laid out from `flute-side.jpg` and scaled to McGee's
figures (embouchure 70.5 mm from the crown).

* **Head:** crown, a measured head taper, and the lip plate (45 × 27.6 mm) on its riser.
* **Body:** drawn tone-hole chimneys.
* **Keys:**
  * five open-hole cups with grommets and pointed arms, plus three plain French cups;
  * the thumb key, the C♯ key, the trill keys with their touches, the B/B♭ thumb levers and the G♯ spoon;
  * hinge tubes on rods, and posts on ribs;
  * needle springs and pads.
* **Foot:** the keys and rollers.
* **Live:** every hole above the engine's bore note closes. The keys return on springs, with a small bounce
  as each pad seats.

**Trumpet.** 480 mm from receiver to rim (NMM 9107).

* **Tubing and bell:** 12.7 mm tubing, and a 122.2 mm Bessel-like bell with a rolled bead.
* **Mouthpiece:** the Bach 7C profile.
* **Leadpipe and main slide:** the leadpipe, and the main tuning slide with its brace and water key.
* **Valves:** 19.8 mm casings on a 26 mm pitch, knurled nickel caps, felts, and buttons with pearl inlays.
* **Slides:** the first with its saddle, the third with its ring and stop rod.
* **Braces:** braces and the finger hook.
* **Live:**
  * Valves travel 15.5 mm on a spring, with a bounce off the felt.
  * The first and third slides kick on the notes that need them. That is player practice; the engine
    doesn't model it.
  * The rim shimmers with the amplitude.

### Interaction (unchanged)

* The 2D/3D toggle, orbit, zoom and double-click reset all work.
* The no-WebGL2 fallback still applies: without WebGL2, no toggle appears.
* Single-key inspect still works: a click on a note's strings opens that key's action, in 2D and in 3D.
* The live state (keys, hammers, dampers, pedals, lid, bow, stopping marks, cups, valves, breath, lips,
  wavefronts) is still driven by the engine's own frames.

### Frame cost

CPU per frame (`stats.ms`, scene + submit, Chrome on an M-series Mac, review set at 1440×900):

* grand 0.6–0.9 ms
* upright 0.6–0.75 ms
* violin family 0.45–0.65 ms
* flute and trumpet 0.35–0.65 ms

On a Pixel 7 emulation (light scene) 0.3–0.96 ms.

Building a model takes 0.1–0.3 s, once per instrument, and is kept out of the frame budget.

## Approximations (3D), honestly

* **Close up, nothing passes as a photograph.** At hero distance the cello, violin, viola, grand and
  trumpet read as their instruments.
* **Bowed instruments:**
  * The scroll is a swept section, not a carved one: its volute is too smooth.
  * The chinrest reads as a dark dish.
  * The plate arching is analytic, not measured.
  * The varnish is painted from noise, not from an instrument.
* **Grand:**
  * The plate goes champagne under the studio's overhead light at the hero angle. It is gold-bronze from
    the treble side and in close-ups.
  * The treble window is a technician's cut-away, not a product shot.
  * The hammers are hard to see in the default actuated view, because they sit under the web, as they do.
  * Surfaces are clean: there is no dust or wear.
* **Upright:** its action reads as a busy cage at hero distance, not the clean cream band of the
  photographs. It is the weakest of the seven.
* **Flute:**
  * The keywork is simplified: no clutches or F♯ bridge, no right-hand B♭ lever, and a partial thumb
    mechanism.
  * Fingering follows the engine's single bore length, so it is not true Boehm (LH1 stays open on B4).
* **Trumpet:** perfectly clean lacquer (no fingerprints or patina), and no solder fillets or engraving.
* **No assets:** everything is built procedurally in code. There are no models or texture files.

## References (3D)

* **Measured dimensions** with a source for each: `docs/3d-reference.md`. It covers the Davidov and Messiah
  Strads and other measured cellos, the Steinway D and B, the Yamaha U1, grand action regulation, McGee's
  flute and the NMM's Bach trumpets.
* **Reference photographs:** listed in `.cache/refs-3d/SOURCES.md` (not committed). Those inside the
  committed contact sheets are credited in `final/README.md`.

## What changed: cello audio (cello only)

The full write-up, with sources, every measure and the listen notes, is in
[`cello-audio/README.md`](cello-audio/README.md). In short, all the changes are in
`packages/engine/src/core/bowed.ts`, gated on design fields that only the cello sets. The fitted values are in
`bowed-fit.json`, fitted on the even-MIDI half of the Iowa cello notes by `scripts/fit-cello.ts`. Items 1–7
are the v2 model (`624c0bf`); item 8 is a later polish (`a6baebd`) that took on the two problems v2 left open.

1. **Radiation from acceleration.** The body radiates from its acceleration, not its velocity, and the force
   reaches it through two bridge resonances (Fletcher & Rossing §7.1; Reinicke, in Cremer ch. 9). The old
   chain was 6 dB/octave too dark and propped up with an EQ boost.
2. **In-phase high band.** The high-frequency body path now reaches both channels in phase. Before, an
   inverted copy cancelled everything above about 3.6 kHz in mono.
3. **Idle open strings couple loosely to the bridge** (a passive transformer ratio, fitted). Before, the
   octave above each open string (C3, G3, D4) came out 5–11 dB weak and up to 15 ¢ off.
4. **Torsion at the bow.** A damped torsional loop at the bow steadies the stick–slip (Cremer ch. 5–6;
   Woodhouse & Galluzzo 2004).
5. **Faster high-frequency loss on the wound C and G strings.**
6. **Pitch compensation over 40 harmonics** instead of 3.
7. **Performance:**
   * a slower bow attack at pp;
   * β moving away from the bridge at pp;
   * slurred crossings that start at the bow's speed;
   * a slow random wander of vibrato rate and depth and of bow speed and force (Mellody & Wakefield 2000;
     Askenfelt 1989);
   * CBR and B1− radiate less.

8. **Polish (`a6baebd`): a bow of finite width, between samples.** The two known problems (pp ×2 too bright,
   a grain under vibrato) had one root. A slip counter showed that the point bow on whole samples rarely held
   Helmholtz motion: only 4 of 22 pp, 8 of 22 mf and 0 of 23 ff Iowa notes had one slip per period. The
   Helmholtz corner was one sample wide at any sample rate, and the pulses it left between bow and bridge
   tripped extra slips at low force; multiple slipping is bright, so the model's pp came out brighter than its
   ff. Under vibrato the bow–bridge segment itself swung in length (the bow taps sat on the nominal loop).
   * **The bow touches the string over the hair ribbon's width** (`bowWidth`, fitted 9.8 mm; Guettler;
     Pitteroff & Woodhouse 1998): it reads the string's velocity averaged over a raised-cosine contact and
     spreads the friction force over the same taps (passive; Bilbao 2009's spreading operator), at its exact
     fractional place. Vibrato and bend now lengthen the finger side of the loop, not the bow–bridge segment.
   * **Rosin noise** for the cello (fitted 0.226, ~2.7 % RMS of the friction; Smith & Woodhouse 2000): clean
     Helmholtz motion otherwise reads too harmonic.
   * **In an attack the force stays under Schelleng's maximum for the speed the bow has reached** (Guettler
     2002): the heavier refitted forces otherwise creaked open-G strokes into multiple slipping.
   * **Refit** on the even-MIDI half: string HF T60 at 3 kHz 7.35 → 0.53 s (literature 1.0 s), force ×1.36 at
     pp and ×1.82 at ff, attack 255 ms at pp and 108 ms at ff.

   Notes holding Helmholtz motion now: pp 21 of 22, mf 18 of 22, ff 14 of 23. The full account, with every
   measure, is in [`cello-audio/README.md`](cello-audio/README.md) ("Polish").

Against the Iowa MIS cello (67 notes, pp/mf/ff):

| measure | before (`af4f97e`) | v2 (`624c0bf`) | final (`a6baebd`) | recording |
|---|---|---|---|---|
| ⅓-octave spectrum, RMS error | 15.7 dB | 5.0 dB | **4.3 dB** | — |
| spectral centroid, model/recording | 0.57 | 1.22 (pp 2.02, mf 1.10, ff 0.68) | **1.02 (pp 1.59, mf 1.01, ff 0.84)** | 1 |
| harmonic-to-noise, model − recording | −0.3 dB | +2.6 dB | +1.6 dB | 0 |
| attack time, model/recording | 1.12 | 0.92 | 0.90 | 1 |
| pp → ff level spread | 10.6 dB | 13.0 dB | 11.4 dB | 12.5 dB |
| pitch, RMS over notes (matched vibrato) | 3.3 ¢ | 1.8 ¢ | 2.5 ¢ | — |
| notes the analyser could not read | 2 | 0 | 0 | 0 |
| clicks per render, all five pieces (mean of 12 seeds) | 47.0 | 40.5 | **8.8** | — |

**Judge.** `npx tsx scripts/judge.ts --instrument cello --before <engine>`, held-out (odd-MIDI) notes:

* against `af4f97e`: **BETTER**, 2.68 → 1.91, Δ 0.77 ± 0.15; every measure improves (the v2 model alone
  scored 2.09).
* against `624c0bf`: **NO CLEAR CHANGE**, 2.05 → 1.86, Δ 0.19 ± 0.11, just under the 0.22 that BETTER needs.
  The centroid improves by a full spread (0.96 → 0.67), harmonics, noise and level improve, attack (+0.11)
  and pitch (+0.01) barely move, and no guard is broken.

**From the renders** (`cello-audio/metrics.json`; clicks are means over 12 renders that differ only in the
cello's seed, because one render of a chaotic bow says little about rare events: the round's single render of
the `624c0bf` phrase had 0 clicks, while 7 of 12 seeds have some):

* Clicks under vibrato fell by 60–90 % against `624c0bf`: phrase 21.7 → 2.5 per render, sustained 11.3 → 4.3,
  sustained-novib 7.2 → 0.4. Stroke starts and crossings click a little more often (Bach 0.3 → 0.9,
  transitions 0.2 → 0.6). The worst click is 10–12 dB (16–17 dB in the phrase before).
* Without vibrato, G2, A3 and D4 hold within 0.3–0.5 ¢ SD (`af4f97e`: 2–12 ¢).

**Listening.** Neither I nor the sub-agents can hear the files. The listen notes come from the spectrograms
and the measures, and say so. To hear the difference yourself, play
`cello-audio/{phrase,bach-prelude,sustained,sustained-novib,transitions}-{before,after}.mp3` (after = the
final cello; the same files are in `final/cello-audio/`). Each pair is peak-normalised to −1 dBFS; the level
differences are in the metrics, not the files.

**Other instruments are unchanged, bit for bit.** Violin, viola, flute, trumpet and piano were compared
sample-for-sample against the `af4f97e` engine at 44.1 and 48 kHz, dry and with room: max |Δ| = 0 in all 20
cases (`scratchpad/bitid.ts`, re-run after merging). After the polish, violin, viola, flute, trumpet, grand and
upright were compared again against `624c0bf`: 24 of 24 identical. Only `test/golden/cello.json` was
re-blessed, both times.

### Remaining limitations (cello)

* **pp is still too bright**, though much less: the centroid is ×1.59 the recording's at pp (×2.02 before
  the polish). Most pp notes now hold Helmholtz motion; what remains is mostly the bow–bridge ripple of a pp
  bow far from the bridge, strongest on the A string, where the contact is only 1.5–2 samples wide. A ribbon
  with its own stick/slip state across its width, or 2× oversampling of the string, would be next; neither
  was done.
* **Vibrato grain is mostly, not entirely, gone** (clicks −60–90 %), and rare clicks at stroke starts and
  crossings are a little more frequent.
* **Sample rate:** the soft tone of G2 and D3 still differs by 0.5–0.7 octave of centroid between 44.1 and
  96 kHz (other notes ≤ 0.1).
* **Pitch RMS** rose from 1.8 to 2.5 ¢ with the heavier bow (the flattening effect).
* **Per-note harmonic profiles** still differ from the Iowa instrument's by about 11 dB RMS: the body above
  the five signature modes is statistical, not that instrument's.
* **Fitted, not measured:**
  * the idle-string coupling (0.306);
  * the torsional Q (2.9, below the published 15–50, because it also stands in for the hair's compliance);
  * the contact width (9.8 mm) and the rosin noise (0.226), both within physical ranges;
  * the second bridge resonance, which acts as a roll-off.
* **Violin and viola** keep the old chain and the point bow, including the inverted high band. They would likely
  gain from the same changes, but they were not touched.

## Shots and contact sheets

* `final/before-after.jpg`: every instrument's default view at `624c0bf`, next to the same view now.
* `final/contact-{bowed,pianos,winds}.jpg`: reference photographs next to the hero, close-up and actuated
  renders.
* `final/shots/`: desktop 1440×900 (JPEG at half the device pixels):
  * hero, close and actuated for all seven;
  * the cello's detail and scroll views;
  * phone heroes.
* The first stage's shots (before = `af4f97e`, after = `624c0bf`) stay in `shots/`.

To regenerate, start a dev server and run `BASE=http://localhost:<port> scripts/final-3d.sh`.

## Checks: exact commands and results

Final branch, everything merged:

* `pnpm build`: passes; the worklet bundle is "ok for Safari 14.1+".
* `pnpm typecheck` (engine and web): clean.
* `npx vitest run`: 21 files, **99/99 pass** (including `models3d.test.ts`, 7 tests, under 1 s; blocksize; golden, with only `cello.json` re-blessed; `cello.test.ts`).
* `npx playwright test` (desktop + Pixel 7): **43 pass, 7 skipped** (the existing phone-only skips). The fresh preview build was on :4199 and nothing else was holding the port. This includes the 3D stage on every instrument, single-key inspect in 3D, the no-WebGL2 fallback and the 390×844 layout.
* Cello judge against `af4f97e` (production): **BETTER** (2.68 → 1.91); against `624c0bf`: NO CLEAR CHANGE
  (Δ 0.19 ± 0.11).
* Bit-identity of the non-cello instruments against `624c0bf`: 24/24.

Earlier, per stage (kept for the record):

* First stage: 97/97 unit tests; e2e 43 pass, 7 skipped; cello judge **BETTER** against `af4f97e`;
  bit-identity of the non-cello instruments against `af4f97e`, 20/20.
* Cello polish (`a6baebd`), in its own worktree:
  * 98/98 unit tests.
  * `cello.test.ts` gains a pp-not-brighter-than-ff check.
  * A drafted sample-rate check was dropped (see the limitations).
  * The controllers test's brighter-with-force margin is 1.05, down from 1.1: D4 now stays in Helmholtz
    motion at both ends and brightens by 9 %.

## How to verify

**Visually.** Run `pnpm dev`, press `3d`, and go through every instrument:

* drag to orbit, scroll or pinch to zoom, double-click to reset;
* hold keys or the pedal: keys dip, hammers rise and fall, dampers lift;
* look through the grand's treble window to see the action;
* click a string to open that key's action;
* on the bowed instruments, play a stopped note and watch the bar on the fingerboard and the bow;
* on the flute, watch the keys close; on the trumpet, play C♯4 to press all three valves.

Or look at `final/`.

**Audio.** Play the before/after MP3 pairs in `final/cello-audio/`. To re-measure, run
`npx tsx scripts/calibrate-ensemble.ts --only cello` and the judge above.
