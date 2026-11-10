# NEXT5 item 5: the piano's WebGL feedback loop, and the action close-up relit

Branch `fix/next5-webgl`, on `main` at `0522d1e`. Brief: `.autopilot/briefs/NEXT5-5-WEBGL.md` (with
`STANDING-PREFS.md` and `ART-DIRECTION.md`). No audio code touched.

Every picture here is before (top, or left on a phone) and after (bottom, or right). "Before" is
`main` at `0522d1e`, built and served beside the branch.

## A. The feedback loop

**What it was.** The grand's open lid is a mirror: a second pass draws the scene from the camera's
mirror image into its own target. The strings are lines, hidden behind nearer surfaces by comparing
each fragment with a depth texture. In the mirror's pass that texture was the depth of the very target
being drawn into. Reading a texture attached to the framebuffer you are drawing to is a feedback loop,
and WebGL refuses the draw: `GL_INVALID_OPERATION: glDrawElements: Feedback loop formed between
Framebuffer and active Texture`, once a frame.

**Where.** Only the grand, whole, lid open, on a desktop (the phones' light scene has no mirror). The
upright and both close-ups were clean; the few messages counted in those scenes before are the grand's
first frames, before the preset or the camera changed. Two grands in an ensemble (PR #13) had it twice
a frame.

**Count** (`webgl-warnings.txt`; 2.3 s a scene, `gl.getError()` every frame and the console):

| scene, 1440×900 | before | after |
|---|---|---|
| grand, lid open | 140 errors in 140 frames (the console stops at 256) | 0 |
| grand close-up, upright, upright close-up | 0 in the scene itself | 0 |
| violin, viola, cello, flute, trumpet | 0 | 0 |
| everything at 390×844 | 0 | 0 |

**What the dropped draw was.** The strings in the lid. Since PR #7 the mirror has shown the plate and
soundboard without them on every Chrome. They are there now, the sounding ones glowing:
`lid-mirror.jpg`.

**Fix.** In a pass that has its depth attached, the lines use the depth buffer's own test, with a
program that has no depth sampler at all (`gl3d.ts` `DEPTH_TEX`, `three3d.ts` `LineLayer.matZ`). Over
the finished picture, which has no depth of its own, they compare with the texture as before. The
lines' buffers are now sent once a frame, not once a pass.

**Kept from coming back.**

* e2e "3D draws without one WebGL warning": the grand (mirror on), the upright, the flight into a
  key's close-up, the close-up with a key struck, the flight back, then the five other instruments.
  It fails on any console message about WebGL and on any `gl.getError()`. On `main` it fails at the
  first check: 30 errors in 30 frames.
* The two-grand ensemble test checks `gl.getError()` with both mirrors drawn.
* `node scripts/webgl-warnings.mjs` prints the table above. `AGENTS.md` has the rule.

**Other instruments.** `scripts/others-3d.mjs`, each at rest, before against after:

| | largest difference | mean | pixels off by more than 2 |
|---|---|---|---|
| phone, all five | 0 | 0 | 0 % (bit-identical) |
| desktop, all five | 33–47 of 255 | 0.013–0.037 | 0.14–0.47 % |
| desktop, `main` against `main` again | 34–38 | 0.012–0.037 | 0.13–0.48 % |

The desktop differences are the ambient occlusion's random noise: the same build differs from itself
by as much.

## B. The close-up

What was wrong with it, worst first, and what changed.

**1. Every part the section crossed was a hollow shell.** This is what read as "parts cut by the near
plane". The near plane itself cut nothing in the default frame: it stood 27 mm from the lens on the
grand and the camera is 0.6 m from the action. The section did: rails, keybed, pin block, fallboard and
rim were open tubes you looked down, with the brackets and tuning pins inside them.

* Where the eye sees into a cut part, the shader now draws the face the cut would show: end grain
  across a part's grain and long grain along it, the pale wood under a case's lacquer, a white key's
  facing over its wood, felt, grey iron for the plate (`mats3.ts`, `cap`).
* The long parts that run across the keyboard carry a cross-wall at every key's boundary
  (`piano3d.ts` `webs`). The cut falls 0.8 mm in front of one, so the face is there and hides what is
  inside the part. A unit test checks that for all 88 keys on both pianos.

**2. No modelling.** The key light cast no shadow in a section, because the parts cut away would have
shadowed the cut. The rim and fill lights shone through the keys left standing.

* The cut is now each material's own clipping plane, so the shadow pass is cut too. The key light
  comes in through the open side, whichever end the section was cut from, and its shadow map is fitted
  to the action (0.5 mm a texel, was 1.4).
* Rim, fill and the studio's ambient are turned down; the fill is warm. Ambient occlusion works at
  3.5 cm, not the case's 12.
* The light, the exposure and the near plane ease in and out with the camera's flight.

**3. Whites.** Exposure is capped at 0.74 in the close-up (1 for the whole piano). Share of the
stage's pixels at or over 235 in all three channels (`whites.txt`):

| close-up, 1440×900 | before | after |
|---|---|---|
| grand C4 | 0.20 % | 0.07 % |
| grand C7 (the soundboard's edge went white) | 0.50 % | 0.02 % |
| upright C4 | 0.21 % | 0.02 % |
| upright C7 | 0.21 % | 0.02 % |

Clipped pixels (250 and over) on the grand's C4 went from 0.039 % to 0.006 %. What still clips is
metal: the tuning pins' highlights. The whole-piano views are unchanged (0.27 % and 0.26 %).

**4. Near plane and the camera.** The near plane is 4 mm in the close-up (27 mm on the whole grand).
Two things were in the way of using it:

* The wheel and the pinch could not go nearer. Their floor was 0.12 of the whole piano's distance,
  which is farther than the close-up itself. They now move between a third and twice the close-up's
  own framing. `look/grand-60-3-zoomed-in.jpg`, `look/upright-72-3-zoomed-in.jpg`.
* The orbit could carry the camera past the cut into the keys left standing, where the near plane
  really does cut parts. It now stops 6 cm short of the cut's plane. `look/*-turned-*.jpg`.

**5. Felt and wood.** They shared one felt noise and one wood grain, tinted.

* Felt: pressed wool. Fibres and slow density, a nap in relief, no gloss, a soft sheen at grazing
  angles. The fibres fade out before a pixel holds more than one, so they do not sparkle from afar.
* Wood, each its own: hornbeam for wippens, jacks, shanks and flanges (pale, even); bare spruce for
  the key sticks (straight latewood lines); hard maple for rails and levers (golden, flecked); beech
  for the upright's rails (short dark rays). Matched by eye to `grand-action-side.jpg` and
  `upright-action-close.jpg`; `docs/3d-reference.md` has the table.
* A white key's sides under its facing are wood. Key leads are lead grey (they were black holes).
  Damper and backcheck wires are satin steel: as bright nickel they clipped to white, and on a phone
  the row of them beat against the pixel grid (`phone-grand-c4.jpg`, left).

**6. Cost.** `frame-cost.txt`: mean ms a frame with the frame rate unlimited, M5 Pro.

| 2880×1094 | before | after |
|---|---|---|
| grand, whole | 3.6 | 4.6 |
| grand, C4 close-up | 4.4 | 5.7 |
| grand, C7 close-up | 5.0 | 5.4 |
| upright close-ups | 2.4, 2.9 | 3.2, 3.6 |

About 1 ms more. The whole grand pays for strings that are now really drawn in the mirror. The
close-up pays for its shadows. Two things hold it down: a depth-only pass first in a section (up to 88
keys' parts stand one behind another), and the keys drawn from the cut backwards. At the phone's size
every view is 2 to 3 ms. The upright's whole-view row is left out: its occlusion had been switched off
by the stage's own budget in the "before" run, so the two are not comparable. Not measured on a real
phone.

## Left

* A cut face is drawn on the part's inner wall or its nearest cross-wall, not exactly in the cut's
  plane. Parts without cross-walls (the plate, the rim, the bridges) still show what stands inside
  them: tuning pins through the plate's web. Exact faces need a stencil count per solid.
* A cut rim shows one wood, with no line for its lacquer skin.
* Hammer felt has no layer lines.
* On a phone the close-up is still small in a tall stage: the action's depth sets the distance.

## Gate

Typecheck clean. Vitest 138 passed (26 files; one test new). Playwright 71 passed, 9 skipped (desktop and
Pixel 7; two new, 10 s and 9 s on desktop). No audio file added.

## Reproduce

```
node scripts/webgl-warnings.mjs                       # BASE=…, PHONE=1
OUT=raw TAG=before BASE=… node scripts/shots-next5-webgl.mjs
OUT=raw TAG=after  BASE=… node scripts/shots-next5-webgl.mjs
python3 scripts/pairs-next5-webgl.py raw <out>        # pairs and whites
node scripts/look-closeup.mjs                         # zoomed in, turned, from above, case hidden
node scripts/others-3d.mjs                            # the other five, at rest
ZOOM=60 node scripts/fps-3d.mjs                       # frame cost in a close-up
```
