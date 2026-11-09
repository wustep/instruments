# Grand, round 2

This round had three targets for the grand (BRIEF-R2 item 2):

* a plate that reads as gold-bronze lacquer at the default hero angle;
* a whole rim and plate in place of the treble cut-away;
* the action shown through the lid's opening.

Stephen also asked for the music desk to go.

The work went through three critique/fix cycles against `grand-inside.jpg` and `grand-34.jpg` at
matching angles. The changes are in `piano3d.ts`, where only the grand's code changed: the upright's
meshes have the same checksum before and after. There are grand-only materials in `mats3.ts` and
`mesh.ts`.

## Shots

* `before-after.jpg`: the hero and the action close-up, `63c5266` against now. The hero shows the
  desk gone. Before, the close-up looked through the cut-away; now it looks through the lid.
* `hero.jpg`: the default view, unchanged.
* `close.jpg`: the action through the lid, with the sustain pedal down.
* `act.jpg`: D4 to G4 struck.
* `interior.jpg`: about `grand-inside.jpg`'s angle.
* `low-three-quarter.jpg`: the piano on its legs and casters, on the floor.
* `inside-case-hidden.jpg`: the lead's case toggle, with the action seen from the treble side.

## No music desk

Removed:

* the desk itself: the panel, its ledge and lip;
* the desk rail across the plate's front;
* the rail's two posts, which would have floated over the pins on their own.

`desk` is now null in the model. The plate's front and pins, the fallboard, the key slip and the
cheeks stay, as a grand shows them with the desk lifted off. The before/after is in the hero row of
`before-after.jpg`.

The low side view and the low three-quarter show the piano standing on its three casters:

* the wheels touch y = 0 (radius 30 mm, axles at 30 mm), with each leg's cuff on its caster plate;
* the lyre's box sits 30 mm above the floor and its pedals 66 mm, as on `grand-34.jpg`;
* nothing hovers and nothing sinks below the floor.

The ring on the floor is the room's sound-wavefront overlay, not a stand.

## The plate's colour, measured

The script masked the plate's pixels at the default hero view and took their mean. The target was
`grand-inside.jpg`'s lit plate, sRGB ≈ (130–160, 100–125, 70–85).

|                          | mean sRGB       | hue | sat. | brightest 10 % |
|--------------------------|-----------------|-----|------|----------------|
| before (`pianoPlate`)    | (193, 165, 134) | 32° | 0.31 | (246, 227, 215), sat. 0.12 |
| after (`grandPlate`)     | (153, 121, 72)  | 36° | 0.53 | (211, 178, 136), sat. 0.35 |

Before, half of the plate's pixels had a value above 0.94. The plate was over-bright, and the
Neutral tone mapper desaturated it towards white. Lowering the roughness made it paler again,
because the plate then mirrors the 9 × 6 m overhead softbox. What works is metal flake (metalness
0.9), roughness 0.62, and a darker, yellower base (`#8a6522`).

Renderer finding: three r186 ignores a material's `envMapIntensity` when the IBL comes from
`scene.environment`. `WebGLRenderer` overwrites it with `scene.environmentIntensity`. So the
`envMapIntensity` values in `mats3.ts` P have no effect: `pianoPlate` 0.75, `interior` 0.18 and the
winds' 1.6. This round did not change that.

## Cycle 1: top fakes and fixes

1. The treble cut-away window was a technician's view, not a product shot. **Fixed:** the rim is
   swept whole and the fallboard runs from rim to rim.
2. The plate went pale champagne at the hero. **Fixed:** the new `grandPlate` material (numbers
   above).
3. The inside of the rim was black satin and read as a void. **Fixed:** a polished mahogany veneer,
   `rimVeneer`, as in `grand-inside.jpg`.
4. No view other than the cut-away showed the action.
   * **Fixed:** the dampers moved from 105 mm to 37 mm behind the strike line, with their guide rail
     on the belly rail.
   * The soundboard is now glued over the belly rail from 50 mm behind the strike line.
   * From above, the hammers now show between the agraffes and the dampers.
5. The top treble's bridge stood in mid-air over a black void. **Fixed:** it now sits on the board,
   which follows from item 4.
6. The tuning pins read as a grey carpet. **Fixed:** satin nickel pins, `pinNickel`.
7. The red felt ran only from E3 upwards, 15 cm behind the pins. **Fixed:** it now runs just behind
   the pins under every string, and the pin field follows the agraffes back towards the treble.
8. The damper heads read as a beige comb. **Fixed:** black-stained heads with satin wires.
9. With the case hidden, the soundboard's underside was bare. **Fixed:** 15 spruce ribs run across
   the grain.
10. The case was not separable. **Fixed:** the case now has its own mesh in `cases`, for the lead's
    hide-case toggle.

## Cycle 2: top fakes and fixes

1. The flange read as flat painted card. **Fixed:**
   * waviness in the casting's normals: about 1 mm over 10 cm, applied as a bump in metres in the
     shader, `grandPlate` only;
   * a raised oval cartouche, left plain;
   * a rounded lip along the front edge;
   * a partition between the bass and tenor pin fields;
   * a yellower gold: hue 31° → 36°.
2. The agraffes were flat tiles. **Fixed:** brass studs on seats.
3. The damper heads were plain boxes. **Fixed:** chamfered heads with a brass boss.
4. With the case hidden, the plate's skirt hid the hammers. **Fixed:** the skirt now runs only round
   the soundboard.
5. The red felt zigzagged with the pins' stagger. **Fixed:** it is smoothed.

## Cycle 3: top fakes and fixes

1. The struts were flat channel bars. **Fixed:** a solid beam with a rounded crown, which carries one
   long highlight, as in the reference.
2. The struts' feet read as rings on the web. **Fixed:** the pads are drawn out along each strut.
3. The bridges merged with the soundboard. **Fixed:** graphited caps, `bridgeCap`.
4. The hitch pins were dark mirrors. **Fixed:** nickel.
5. Against `grand-34.jpg`, the legs looked spindly. **Fixed:** a coved capital, and a cuff over each
   caster.

## Still fake, in rank order

1. In dim interior views the plate goes mustard. Gold flake mirrors the dark studio: saturation is
   about 0.75 in the interior view, against about 0.5 in the reference's bright room. At the hero it
   is on target.
2. The broad flange is still smoother and more even than a real casting. It has no cast lettering
   and no casting seams.
3. The struts and the capo bar are smooth sweeps, with no draft or fillets where they meet the web.
   The web is not cast as one tray per section: there are no gaps in the string scale for the
   partitions to pass through. Two agraffes next to a strut cut into its foot pad.
4. The top treble's hammers sit under the capo bar, true to life, so the action through the lid is
   seen best between A3 and B5.
5. The cheeks and the lid are as they were in round 1: plain lacquered slabs.

## Frame cost (CPU ms)

The CPU frame cost is the median `stats.ms` over 5 s. The runs alternated between the lead's branch
head and this branch, three rounds each, on the same machine, while the other agents were rendering
too.

| view  | improve/realistic-3d-r2 (1a82fac) | this branch |
|-------|-----------------------------------|-------------|
| hero  | 0.68–0.78                         | 0.72–0.83   |
| close | 0.68–0.80                         | 0.72–0.87   |

`63c5266`'s hero, measured the same day with the review script, was 0.66–0.86.
