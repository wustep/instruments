# The trombone in 3D

* `before-*.jpg`: the placeholder at dbc9d95 (the trumpet's model stood in for the trombone): the stage's own
  view on a desktop (1440 × 900) and a phone (390 × 844), a note sounding, and the Orchestra with Bach's Air.
* `after-*.jpg`: a slide trombone of its own in each of the engine's three sizes (`apps/web/src/ui/gl/
  trombone3d.ts`), laid out from Yamaha's product photographs (YSL-882OR and YSL-620 tenors, YBL-822G bass,
  YSL-871 alto) scaled by their bells, checked against the published bores, bells and slides (Bach 42B /
  Conn 88H, Bach 50B3, Bach 39). `hero` is the stage's own view on a desktop: three-quarter from the player's
  right, the slide in front of the bell section (`-2x`: twice the pixels, cropped). `actuated` is C2 on the
  tenor (the F attachment in sixth position: the lever down, the rotor a quarter turn round, the slide out
  to where the engine's player put it, 0.51 m; a wide stage frames the slide to fifth position, so the sixth
  runs past its edge), `actuated-5th` B♭2 in fifth on the slide alone (0.32 m). `side`, `left`, `front`: the
  player's right side square on (the photographs' bearing), the left side (the bell section in front), into
  the bell. `valve`, `linkage` (and `actuated-` of each): the rotary valve's near side (bearing plate, stop
  plate with its bumpers, stop arm, crank) and its four-bar (the ball-jointed link, the thumb lever on its post
  off the bell brace, its return spring, the paddle). `crook`: the nickel-silver crook, the water key, the
  bumper. `slidetop`: the receiver, the inner brace, the cork barrels, the outer slide's grip, the lock nut
  and the slide lock. `mouthpiece`, `rim`. `size-alto`, `size-bass` (and their `-side`): the alto (no valve)
  and the bass; `actuated-bass` D2 (both valves: the F valve on the main line, the D valve on the F loop,
  dependent, as the YBL-822G), `actuated-bass-valves` both close up. `orchestra-air`: Bach's Air, alto, two
  tenors and a bass trombone, each its line's size, held as seated players hold them (the slide forward and
  21° down, the bell section turned nearly a right angle about the lock nut so the bell sits left of the face,
  the tuning slide over the left shoulder); `orchestra`: two among violin, flute, clarinet, horn and cello.
  `phone-*`: the phone held upright, framed whole with room for the slide's full travel (`phone-actuated`
  fills it).
* `review-cycle-1…4.jpg`: the review sheets, each render beside the photographs at the same angle. Cycle 1, the
  first build: the bell's inside black (its dark throat began at the rim), the main line kinked under the
  valve through ports at 45°, the thumb lever a stick with a roller floating behind the tuning slide, the
  counterweight a spool, the slide frozen and the sizes all the tenor (the worklet did not pass the frame's
  `trombone` field on: the lead's 8922832 forwards it; the stage now passes each trombone's size too), the
  hero's slide travel framed as empty space. Cycle 2: the line straight through the casing, the loop's ports
  on its top, a thumb plate; the shots left the slide out for the still views; a dotted band down the bell
  (fingerprint ridges on the tail's inside, seen through the throat: the handled zone kept by the brace); the
  Orchestra hold too steep. Cycle 3: the engine's slide is where its player put it, short of the chart's, so
  the drawn slide is interpolated a frame behind the engine's (never past it); the hold lowered to 21°; the
  F loop's return swoops into its valve over 64 mm (it pinched); two rows on a phone checked clear. Cycle 4:
  the final state.

Reproduce: `pnpm build && pnpm preview --port 4212`, then `BASE=http://localhost:4212 OUT=<dir> node
scripts/shots-trombone-3d.mjs` (`PHONE=1 DSF=2` for the phone; `SET=before` on the placeholder), and `python3
scripts/sheet-trombone-3d.py <dir> <sheet.jpg>` (the photographs from `.cache/refs-trombone/photos/`, listed in
`docs/3d-reference.md` and the cache's `SOURCES.md`).

Measured (the unit test checks each): the open tube 2.740 m (tenor, bass) and 2.060 m (alto), the routes
solved to the engine's; the F loop 0.917 m and the D loop 0.692 m (2.74 m × (2^(k/12) − 1)); bells 178, 216,
241 mm; overall 876 / 1152 / 1140 mm against the photographs' 854 / 1175 / 1150, the rim to the crook's end
393 / 512 / 505 against 392 / 513 / 506; the lever's 41.6° turns a rotor a quarter turn. 302k, 445k and 574k
vertices, built in 70–200 ms. 2.53 ms a frame at 1440 × 900 @2× (the horn 2.94, the trumpet 2.38), 1.08 ms on
a phone (`scripts/fps-3d.mjs`); no WebGL warning or error alone, the bass, among six or as the quartet,
desktop and phone (`scripts/webgl-warnings.mjs`); on a 390 × 844 phone at rest 43 % × 45 % of the free stage
(`scripts/measure-phone-3d.mjs`), with room for the full travel.

Left out: the players' hands; the rotors' passages traced tube by tube; the alto's and bass's own mouthpiece
shapes (the cup, throat and shank are each size's, the outline the tenor's scaled).

The review sheets include photographs from Wikimedia Commons, cropped and set beside the renders, so they carry
their licences (CC BY-SA 4.0 for the sheets as a whole): Yamaha Corporation's YSL-882OR, YSL-871 and YBL-822G
(CC BY-SA 4.0); swisstbone.com (Daniel Alessi)'s Bach 42G bell section, Conn 70H slide and Kruspe bell (CC BY
4.0); Jonathanischoice's Rath R4 (CC BY 4.0); Samntrombone's Courtois crook (CC BY 4.0); Dhscommtech's Schilke
51C4 mouthpiece (CC BY-SA 3.0); Petra Klawikowski's player (CC BY-SA 3.0); the U.S. Navy Concert Band's section
(public domain).
