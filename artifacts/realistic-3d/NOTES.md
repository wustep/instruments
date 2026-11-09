# Realistic 3D + cello audio — notes

Branch `improve/realistic-3d-cello`, from `af4f97e`. Local commits only: nothing is pushed, merged or deployed.

## What changed: the 3D stage

Before, the 3D stage drew the 2D diagrams extruded into space: glowing lines, flat translucent fills and no
lighting. After, each instrument is a complete, lit model, built once from real proportions and the engine's
own scale. Each frame it is posed from the engine's live state.

### Renderer

Raw WebGL2, still with no libraries (`apps/web/src/ui/gl/gl3d.ts`):

* static meshes drawn instanced, each with a model matrix and a glow;
* GGX specular and Schlick Fresnel;
* reflections of a dim studio: an overhead softbox, a strip light and warm walls;
* a warm key light with a 3×3 PCF shadow map (2048 px on desktop, 1024 on phones), a cool unshadowed fill
  and a hemisphere ambient;
* ACES tone mapping;
* a floor that takes the shadow and fades into the page's ground.

Materials are hand-tuned: polished ebonised lacquer, the gilt cast-iron plate, spruce, maple, hornbeam,
hammer and damper felt, ivory and ebony key tops, steel, nickel, brass, silver, pearl, and oil varnish over
spruce and maple. Spruce gets a procedural grain.

Two live overlays are computed in the shader:

* the soundboard and the violin-family tops glow from the engine's mode amplitudes, as before;
* the flute's and the trumpet's tubing glow along the bore with the engine's standing wave.

The glowing lines are still used for the live state: vibrating strings, sympathetic glow, stopping marks, the
breath jet, the lips and the room's wavefronts. They are now depth-tested against the solid models.

### Grand (`piano3d.ts`)

The case and its fittings:

* a rim shaped from the engine's bridge line;
* the lid on its spine hinge, at the engine's `lid`, with its prop;
* three turned legs on casters, and a lyre with three brass pedals (sustain and soft move with the engine);
* the key slip, cheeks and fallboard.

Inside:

* a gilt plate with its front web over the pin block, struts and capo bar, and 230 tuning pins (one per
  string);
* the strings at the engine's lengths, unisons and strike ratios, with the wound bass overstrung;
* the bridges, on a spruce soundboard that shows its live modes.

Each of the 88 keys carries its own action:

* the key on its balance rail, with its capstan;
* the wippen on its flange, the jack (which tips out at escapement) and the repetition lever;
* the hammer shank with its knuckle, and the hammer head (bigger in the bass);
* the backcheck on the key's tail;
* the damper underlever, its wire, and the damper head on the strings behind the strike line. The top
  octaves have no dampers, as in the engine.

The treble cheek and rim are cut away in front of the bentside so you can see the action in profile.

### Upright

The upright is built separately and has its own vertical action:

* the wippen is flanged at the back, with its jack, backcheck, spoon and bridle wire;
* the hammer butt has a catcher, and its shank stands upright so the head strikes back into the strings;
* the damper lever stands behind the hammer, with its head pressing the strings above the strike point.

Around the action:

* the bass is cross-strung in front of the tenor;
* behind the strings are the plate, the vertical soundboard, the back posts and the pin block, with its
  tuning pins pointing at the player;
* the case has arms, legs on toes, a kneeboard and two pedals;
* the upper front panel is off, as a technician sees it, so the action shows.

### Violin, viola, cello (`strings3d.ts`)

The body:

* top and back arched with a long × cross arch and a shallow channel at the edge, over ribs, with the plates
  overhanging;
* purfling, and f-holes (eyes, stem and the notches on the bridge line).

The neck and fittings:

* the neck and its heel, an ebony fingerboard with crown, the nut, the pegbox with four pegs, and the scroll
  (a logarithmic volute);
* the bridge (with its heart and kidneys) standing on the arch;
* the tailpiece and tailgut;
* a chinrest on the violin and viola, an end button, and on the cello a wooden socket with a steel endpin
  that reaches the floor.

The bow has a cambered stick, the hair ribbon, the frog with its ferrule and eyes, the adjuster, and the head
with its plate. It lies on the bowed string, tangent to the bridge arch, at the engine's contact point (β of
the vibrating length) and at its hair position. It glows amber during a bow change.

The live state is drawn on the instrument:

* the stopping point is a glowing bar on the real fingerboard under its string, rocking with the live
  vibrato;
* the bowed string's shape moves in the bowing direction.

The violin and viola are held at playing tilt; the cello stands on its endpin, leaning back.

### Flute (`winds3d.ts`)

* The tube: a tapered headjoint, crown, lip plate on its riser, and the embouchure hole.
* The keywork: joint rings, tone holes at the engine's own sounding lengths, padded cups on arms (five of
  them open-hole), rods on posts, the thumb key, and rollers on the foot.
* The cups close (amber) up to the sounding end and open beyond it. They pulse with the breath vibrato.
* The breath jet crosses the embouchure hole, and the bore's standing wave glows along the silver.

### Trumpet

* Mouthpiece, receiver, leadpipe, and the main tuning slide (with its water key) in front of the valves.
* Three valve casings with top and bottom caps, nickel stems and pearl buttons. They press down for the
  engine's fingering.
* The first slide runs forward and has a thumb saddle; the third runs back towards the player and has a
  ring; the second is short. A slide glows when its valve sends the air through it.
* The bell tail runs to the bell bow, and the bell pipe to a 123 mm Bessel-like flare.
* The lips buzz at the rim, and the standing wave glows along the brass.

### Interaction (unchanged or extended)

* The 2D/3D toggle, orbit (drag), zoom (wheel/pinch) and double-click reset all work as before.
* Without WebGL2 there is no toggle. The model build time is kept out of the frame budget. If a frame
  costs more than about 9 ms, the scene switches to its light version (every other string, fewer action
  parts); if that is still too slow, shadows are dropped.
* **Single-key inspect now works in 3D.** A click (not a drag) on a note's strings opens that key's action
  view; the cursor becomes `zoom-in` over strings. Before, it only worked in 2D.
* For tests and shots, `window.__stage3d.setView({ yaw, pitch, dist, target })` sets the camera and
  `screenOf(midi)` returns a key's on-screen position.

### Frame cost

Scene build plus submit, CPU, measured as `stats.ms` in Chrome on an M-series Mac:

| | desktop | Pixel 7 emulation (light scene) |
|---|---|---|
| grand | 0.5 ms (1.1–1.4 ms with keys moving) | 0.4–0.9 ms |
| upright | 0.45 ms | 0.36–0.9 ms |
| violin, viola, cello | 0.2–0.4 ms | 0.2–0.35 ms |
| flute, trumpet | 0.15–0.3 ms | 0.15–0.3 ms |

* About 175k vertices in the pianos and 30–48k in the others.
* Building a model takes about 40 ms for the grand, once per instrument.

## References consulted (3D)

**Piano actions.** I looked up parts and their order. The positions follow the site's own action view
(`apps/web/src/ui/action-view.ts`, round 3) and standard technician diagrams:

* [Piano action (Wikipedia)](https://en.wikipedia.org/wiki/Piano_action): the capstan and backcheck are on
  the key's rising side; the jack pushes a knuckle near the shank's pivot; in the upright, the spoon and
  backcheck are on the wippen and a bridle connects them.
* [Steve's Piano Service, grand action diagram](https://www.stevespianoservice.com/Diagrams/grand-piano-action-diagram.htm):
  the parts list, from the wippen flange to the damper felt contact point.
* [Illinois MechSE, "How a piano works"](https://mechse.illinois.edu/news/blogs/how-piano-works): the key as
  a lever on its balance pin, and the damper lever at the far end.
* [Howard Piano Industries, "How a vertical piano action works"](https://www.howardpianoindustries.com/how-a-vertical-piano-action-works/)
  and the [Visual Dictionary's upright action](https://www.ikonet.com/en/visualdictionary/arts-and-architecture/music/keyboard-instruments/upright-piano-action.php):
  the upright's catcher, bridle, spoon and damper.
* Dimensions: white keys 23.5 mm, key dip 10 mm, blow distance 47 mm (grand) and 45 mm (upright), let-off
  about 2.5 mm, a knuckle about 18 mm from the centre pin. These are the standard regulating figures the
  action view already used; I did not re-fetch them.

**Violin family.**

* Violin body 356 mm with bouts 168/112/208: the standard Stradivari pattern figures. I did not re-fetch
  these.
* Cello body 755 mm, bouts 345/235/440 and ribs 120 mm. These were checked against measured instruments:
  * [Payton Violins, English cello c. 1900](https://paytonviolins.com/shop/vc3857c-english-cello-c-1900-4-4-10583)
    (back 756, bouts 334/231/429);
  * [Payton, Novizio student cello](https://paytonviolins.com/shop/vc1873-novizio-advanced-student-cello-model-521-5029)
    (back 754, bouts 341/233/432);
  * [NMM museum object 12462](https://emuseum.nmmusd.org/objects/12462/violoncello) (back 750, ribs 115–117);
  * [Hans Jóhannsson's cello measurements](https://www.hansjohannsson.com/resources/mescello.html) (body
    750, ribs about 120).

  My bouts are about 10 mm wider than these.
* The string length is the engine's own (`L`).

**Trumpet.**

* A 123 mm bell: [Yamaha trumpet brochure](https://th.yamaha.com/files/download/brochure/2/1575112/W215R17_trumpets.pdf).
* Where the parts are (the main slide joining the leadpipe to the valves, slide functions, water keys):
  [hellomusictheory: parts of the trumpet](https://hellomusictheory.com/learn/parts-of-the-trumpet/),
  [theinstrumentplace: anatomy of the trumpet](https://www.theinstrumentplace.com/parts-of-the-trumpet/) and
  [jazzfuel: parts of the trumpet](https://jazzfuel.com/parts-of-the-trumpet/).

**Flute.**

* The Boehm layout (tone holes, cups on rods and posts, open-hole cups, the foot's rollers) is from general
  knowledge of the instrument; I did not look up a fresh drawing.
* The tone-hole positions are the engine's own sounding lengths (`tubeFor`).

## Approximations (3D), honestly

* The action parts are simplified solids, though they are in the right places and proportions. The hammer's
  flight comes from the stage's action state (strike, rebound, check), as in 2D; it is not a lever-ratio
  simulation. The wippen and jack follow the key through real lever arms, so their ratios are approximate.
* On the grand, the treble cheek and rim are cut away (a deliberate cutaway, not a real construction), and
  the music desk is omitted.
* The case outline is a spline through points offset from the engine's bridges, not a traced instrument.
  The bentside's S-curve is a little stronger than on most grands.
* The violin outline is a smooth bout-and-corner construction, not a traced pattern. The arch is separable
  (long × cross). The scroll is a logarithmic volute without carved fluting. The f-holes are dark shapes on
  the surface; they are not cut through.
* The varnish is one flat colour per surface, with spruce grain only on the tops: there is no flame on the
  maple, and no wear or shading.
* The flute's keywork has no needle springs, trill keys or clutches. Its cups are distributed along the
  engine's lengths, not at a maker's exact hole positions.
* The trumpet's wrap is laid out from typical proportions and has not been measured on one instrument. The
  bell pipe passes beside the valve block, offset 22 mm.
* Lighting is one shadowed key light plus unshadowed fills. There is no ambient occlusion, so the inside of
  the case is lit by the fill rather than darkened.
* None of this is photoreal. It is a lit, proportioned model in the site's dark, minimal style.


## What changed: cello audio (cello only)

The full write-up, with sources, every measure and the listen notes, is in
[`cello-audio/README.md`](cello-audio/README.md). In short, all the changes are in
`packages/engine/src/core/bowed.ts`, gated on design fields that only the cello sets. The fitted values are in
`bowed-fit.json`, fitted on the even-MIDI half of the Iowa cello notes by `scripts/fit-cello.ts`.

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

Against the Iowa MIS cello (67 notes, pp/mf/ff):

| measure | before (`af4f97e`) | after | recording |
|---|---|---|---|
| ⅓-octave spectrum, RMS error | 15.7 dB | **5.0 dB** | — |
| spectral centroid, model/recording | 0.57 | 1.22 (pp 2.02, mf 1.10, ff 0.68) | 1 |
| harmonic-to-noise, model − recording | −0.3 dB | +2.6 dB | 0 |
| attack time, model/recording | 1.12 | 0.92 | 1 |
| pp → ff level spread | 10.6 dB | 13.0 dB | 12.5 dB |
| pitch, RMS over notes (matched vibrato) | 3.3 ¢ | **1.8 ¢** | — |
| notes the analyser could not read | 2 | 0 | 0 |

**Judge.** `npx tsx scripts/judge.ts --instrument cello --before <af4f97e engine>` says **BETTER** on the
held-out (odd-MIDI) notes: 2.68 → 2.09, Δ 0.58 ± 0.15. Every measure improves and no guard breaks. I re-ran it
myself after merging and got the same result.

**From the renders:**

* Without vibrato, G2 and D4 now hold to within 0.2–0.3 ¢ SD; before, the SD was 10–12 ¢.
* High-band clicks in the left channel went from 4 to 0.
* Earlier history said pitch scatter had worsened from 2.47 to 3.08 ¢. Re-measured at HEAD it was 3.3 ¢;
  it is now 1.8 ¢.

**Listening.** Neither I nor the sub-agent can hear the files. The listen notes come from the spectrograms
and the measures, and say so. To hear the difference yourself, play
`cello-audio/{phrase,bach-prelude,sustained,sustained-novib,transitions}-{before,after}.mp3`. Each pair is
peak-normalised to −1 dBFS; the level differences are in the metrics, not the files.

**Other instruments are unchanged, bit for bit.** Violin, viola, flute, trumpet and piano were compared
sample-for-sample against the `af4f97e` engine at 44.1 and 48 kHz, dry and with room: max |Δ| = 0 in all 20
cases (`scratchpad/bitid.ts`, re-run after merging). Only `test/golden/cello.json` was re-blessed.

### Remaining limitations (cello)

* **pp is too bright.** The centroid is about 2× the recording's at pp. The physical fix would be a finite
  bow width or hair compliance; that was not done.
* **Vibrato grain.** Under vibrato, some notes can still produce short high-frequency spikes, because the
  slip happens on whole-sample positions. The fix would be a sub-sample bow junction or 2× oversampling; that
  was not done.
* **Per-note harmonic profiles** still differ from the Iowa instrument's by about 11 dB RMS: the body above
  the five signature modes is statistical, not that instrument's.
* **Fitted, not measured:**
  * the idle-string coupling (0.245);
  * the torsional Q (2.8, below the published 15–50, because it also stands in for the hair's compliance);
  * the second bridge resonance, which ended at its search bound and acts as a roll-off.
* **Violin and viola** keep the old chain, including the inverted high band. They would likely gain from the
  same changes, but they were not touched.

## Shots

In `shots/`, before (`af4f97e`) and after, at 1440×900 (desktop) and on a Pixel 7. The images are JPEG at
half the device pixels. Each instrument has three views:

* `whole`: the default view, playing;
* `close`: the mechanism or keywork;
* `act`: actuated (keys down, pedals, a stopped and bowed string, valves down, cups closed).

To regenerate them, build both versions and serve them on two ports. Then run:

```
BASE=http://localhost:<before> PREFIX=before node scripts/shots-realistic-3d.mjs
BASE=http://localhost:<after>  PREFIX=after  node scripts/shots-realistic-3d.mjs
python3 scripts/shots-compress.py artifacts/realistic-3d/shots
```

## Checks: exact commands and results

All of these were run on the final branch, with the cello merged:

* `pnpm build`: passes. The worklet bundle is "ok for Safari 14.1+".
* `pnpm typecheck` (engine and web): clean.
* `npx vitest run` (the full unit suite): 21 files, **97/97 pass**, including:
  * the new `apps/web/test/models3d.test.ts` (6 tests);
  * the new `packages/engine/test/cello.test.ts`;
  * golden (cello re-blessed, others unchanged), blocksize, bow, worklet and the rest.
* Playwright, the full e2e suite on desktop and Pixel 7: **43 pass, 7 skipped**. The skips are the
  pre-existing phone-only ones (scope, start-up paths, file drop, `?debug`, drags, computer keys).
  * It ran through a copy of `playwright.config.ts` pointed at port 4291. Another session holds :4199, and
    `reuseExistingServer` would otherwise have tested that stale server.
* `npx tsx scripts/judge.ts --instrument cello --before <af4f97e engine>`: **BETTER**.
* Bit-identity of the non-cello instruments against `af4f97e`: 20/20 identical.

## How to verify

**Visually.** Run `pnpm dev`, press `3d`, and go through every instrument:

* drag to orbit, scroll or pinch to zoom, double-click to reset;
* hold keys or the pedal: keys dip, hammers rise and fall, dampers lift;
* orbit to the grand's treble side to see the action through the cutaway;
* click a string to open that key's action;
* on the bowed instruments, play a stopped note and watch the bar on the fingerboard and the bow;
* on the flute, watch the cups; on the trumpet, play C♯4 to press all three valves.

Or look at `shots/`.

**Audio.** Play the before/after MP3 pairs in `cello-audio/`. To re-measure, run
`npx tsx scripts/calibrate-ensemble.ts --only cello` and the judge above.
