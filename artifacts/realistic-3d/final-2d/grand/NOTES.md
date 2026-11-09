# 2D grand: notes

Before is c253ed4: the first cycle's shots, taken before any change. After is this branch. All shots
come from `scripts/review-2d.mjs` (desktop 1440×900 at 2×, phone 390×844 at 3×). The stage is cropped
to y 128–680 of 900.

| file | what |
|---|---|
| `before-after.jpg` | Stage (top) and the C3 close-up (bottom): before on the left, after on the right |
| `stage.jpg` | The stage, a chord with the sustain pedal down |
| `phone-before.jpg`, `phone-after.jpg` | The phone stage |
| `panel.jpg` | The close-up, mid-replay |
| `panel-strike.jpg` | The close-up through one strike of C3. Five frames: the jack driving (vermilion), let-off, the flight, the hammer checked, held. The sixth frame shows the sostenuto: the key is up, the rod's lip (amber) holds the damper off |
| `pedals.jpg` | The plan at rest, with the una corda, and with the sustain pedal. Last, the close-up with the sustain pedal's tray up |
| `vs-reference.jpg` | Beside `grand-inside.jpg`, the action model and Braid White's diagram (both mirrored so the player is on the left, as drawn) |

## Where the numbers come from

Both views are built from the 3D grand in `apps/web/src/ui/gl/piano3d.ts`: `G`, `BASS_ANGLE`,
`strikeBeta`, `grandOutline`, `plateGrand`, `keyStick`, `hammerHead`, and the wippen, jack,
repetition-lever and underlever meshes. They use the modern Renner/Steinway geometry of the
Erwin action-ratio gauge, as `docs/3d-reference.md` cites it:

- **Key and action:** balance rail 266 mm, capstan 390, wippen centre 456. The spread is 113 mm (wippen centre to the hammer flange at 340). The jack is 99 mm in front of the wippen centre, the knuckle 17 mm from the hammer centre.
- **Hammer and key travel:** the shank is 130 mm. Blow 47, let-off 2, dip 10.
- **Dampers:** 37 mm behind the strike line (z 0.507 m). Their underlevers pivot at 665 mm and are lifted by the key's tail.
- **Plate and board:** the pin block lies under the plate's web, which ends 8 mm before each agraffe and 16 mm before the strike line. The soundboard is glued over the belly rail from 520 mm. The constants are copied (`GZ` in `grand-plan.ts`, `GA` in `action-view.ts`) and cite the 3D source, so the 2D does not pull three.js into the main bundle.

## Cycle 1: critique of c253ed4, ranked

**Plan**
1. The soundboard's mode field (alpha 1.0, additive) dominates: big white Chladni curves over everything.
2. Hammers and dampers are faint dashes in two rows, with no sense of what they are or where they sit.
3. The case is a jagged polyline 16 px past the bridge ends. There is no plate to speak of (four faint strut lines), no pin field, no agraffes, no felts, no fallboard.
4. Nothing reads as a grand from above. The bass isn't overstrung, the strings aren't on the action's pitch, there are no windows onto the board, no rosettes, no struts over the strings.
5. Struck strings are thick vermilion bars, three per key.

**Close-up**
1. It is a schematic of loose lines, not an action: a long line for a key, a bent line for a wippen, a red stick for the jack, a disc for the hammer, a box for the damper.
2. The geometry isn't the 3D's. The hammer is 130 mm from the wrong pivot. There is no knuckle at 17 mm, no spread, no repetition-lever window, no backcheck catching the tail. The damper is a box on a wire at an arbitrary place.
3. The let-off is 2.5 mm; the 3D model and the brief say 2 mm.
4. The pedals don't show at all.

**What changed (d7cf1db, a026d36)**
- **Plan:** a new module, `grand-plan.ts`. The 3D rim, black lacquer with a lit edge. The open fallboard. The gold plate: its web over the pin block, and its bass and treble windows onto the spruce board. Four rosettes where the flange is widest. Bolts. The bass strut and three treble struts (keys 58, 70, 84) over the strings. Three staggered rows of tuning pins (24 mm apart, a 12 mm stagger). The red understring felt. Brass agraffes, and the capo bar from key 74. The overstrung bass (keys 21–45) on its own bridge, crossing the tenor. Hitch pins and hitch felts.
- **Plan, under the strings:** the action's shanks and hammers on the strike line, the dampers on their guide rail.
- **Plan, layout:** x is on the action's even pitch (88 steps across the 52 white keys, the 3D `actX`), as the upright does. The mode field is down to 0.13 and shows only through the windows.
- **Close-up:** redrawn to scale from the 3D meshes. During the drive the key follows the hammer through the jack: at let-off it is at 84 % of its dip (as the 3D's `jackTravel`), then it goes on to the key bed.
- **Close-up, let-off and check:** the jack tips forward when its toe meets the button. The repetition lever is pressed down once the jack has tripped. The tail is caught by the backcheck at the check height.
- **Close-up, damper:** it lifts by geometry (the key's lifter felt) or by the engine's contact, whichever is higher. The felt squashes at contact. The sustain tray lifts the underlever.
- **Shared code:** the let-off is now per kind: grand 2 mm, upright still 2.5 mm.

Inside cycle 1 I fixed my own first draft:
- The inner rim was offset to the wrong side, so the board and plate flooded past the case.
- The plate gold was too saturated (0.5–0.66, now 0.36–0.55).
- The mode field at 0.3 made the windows read as more plate.
- The struts were "bones" with elliptical feet.
- The dampers read as buttons.
- The understring felt was placed in screen space, over the shanks.

## Cycle 2: critique, ranked

**Plan**
1. The una corda is invisible. Rest and soft-pedal shots are identical: the 2.5 mm shift is under 3 px, and nothing ties a hammer to its strings.
2. The strike flare (240 ms) is too short to notice.
3. Hammers at rest are dim for white felt.
4. Fitting the depth to the strings + 0.2 m, for phones, cut the rim's tail off on desktop.

**Close-up**
1. The fixed frame (rails, pin block, bracket) is as bright as the moving levers. The motion doesn't stand out.
2. The hammer's dark maple moulding swallows its felt.
3. The bass string's live shape is 2.7 px wide and hides the copper.
4. A damper held by the sostenuto stays up with no visible cause.

**What changed (c03cb62)**
- **Una corda:** each hammer shows a groove under each string it still strikes. Slid 2.5 mm, the 11.6 mm head misses the left string of three (strings 3.4 mm apart). Three grooves become two, and the heads glow amber, as the 3D's pedals do.
- **Plan:** the flare lasts 320 ms. The felt is brighter. The whole rim shows whenever the whole keyboard does.
- **Close-up:** the frame is drawn quiet, in outline, and the moving parts stay solid. A lighter moulding and a lit felt crown. A 1.6 px bass shape over the copper.
- **Sostenuto:** a rod along the underlevers. With the middle pedal down, its lip turns in under the tab of an already-raised underlever and holds that damper off (amber while it holds).

## Cycle 3: critique against `grand-inside.jpg`, ranked

1. The photo's identity cue, the bold red understring felt, is a thin dark line here.
2. On a phone the close-up uses 0.66 px/mm. It could be larger.

**What changed (5ae0c9b)**
- The understring felt is a 14 mm woven band (a dark under-edge, a bright face), and the hitch felts are brighter.
- A phone's close-up starts at z 215 mm, at 0.73 px/mm.

## Numbers

- **Frame cost:** `drawPiano` (grand) takes 1.1 ms a frame (median of 240; p90 1.4 ms) at 1440×540×2 with a pedalled chord. That matches c253ed4's 1.1 ms. A layout rebuild (resize, a phone's scroll) costs 8 ms once.
- **Tests:** `pnpm typecheck` and `npx vitest run apps/web/test` (13 tests) pass. Run on port 4211 with a copied config, these e2e tests pass on desktop and phone:
  - "click a note's strings…";
  - "the stage: live strings…";
  - "layout fits the viewport";
  - "room and lid are dragged" (desktop only);
  - "several held notes";
  - "the action close-up is the pianos' alone";
  - "the full pedal set".

  The C3 click at 80 % of the stage height still lands on C3's strings, so the test is unchanged.

## Remaining weaknesses, ranked

1. **The plan is anisotropic.** x follows the keyboard (about 1130 px/m on desktop); depth is fitted to the stage (about 270 px/m). Directions are drawn at twice the vertical scale (`DIR`), so the bass leans 20° on screen against a true 10°. Heads and dampers are squat, and the rosettes are circles, not the ellipses a true projection would give.
2. **The plate's flange is a large, flat field.** Its casting relief, the cast lips and raised bosses, reads only at the window and rosette edges.
3. **The una corda is invisible in the close-up.** The shift is perpendicular to a side section. The plan carries it alone.
4. **The bass strings lean, so a click at a bass key's centre can land on its left neighbour's string.** At 80 % height it lands a few mm off. That neighbour's panel opens, which is correct for the string drawn, but surprising. Tenor and treble strings are straight, so the e2e is unaffected.
5. **The sostenuto rod and tab are schematic.** Their place and shape on the underlever are illustrative, not measured; the 3D model has no sostenuto.
6. **On a phone the close-up is still about 40 % of the panel's height.** A 2.3:1 side section in a portrait panel.

## Findings for the 3D (not changed here)

- **The jack trips the wrong way in `posePiano`.** The 3D rotates it `+0.28 · pose.jack`, about x in the wippen's frame. That raises its toe into the let-off button and swings its top towards the strings. On a grand the button holds the toe down, so the top swings towards the keys, out from under the knuckle. The 2D close-up draws it that way (Braid White's diagram: the toe (12) points to the player, the button (14, 15) above it).
- **The 3D backcheck can't catch the hammer.**
  - The 3D moulding's tail ends 9.5 mm under the shank, and the backcheck head sits at y 0.772–0.796 on the key's tail.
  - At the 3D's check (a travel of 15 mm, `hammer` 0.32), the tail is at about (z 0.482, y 0.814): 18 mm in front of the backcheck and 9 mm above it.
  - The 2D close-up draws the tail down to −19.5 mm and the backcheck taller, so they meet at the 2D's check (16 mm under the string, `CHECK.grand`).
  - The 3D's check height (32 mm under the string) and the close-up's (16 mm) also differ.
