# The horn in 3D

* `before-*.jpg`: the placeholder at 3bd698b (the trumpet's model stood in for the horn): the stage's own
  view on a desktop (1440 × 900) and a phone (390 × 844), a note sounding, and the Orchestra.
* `after-*.jpg`: a full double horn in F and B♭ of the Kruspe pattern, the Conn 8D / Holton H179 / Hans Hoyer
  6801 class (`apps/web/src/ui/gl/horn3d.ts`), laid out from BenP's photographs of a Besson BE702 seen from
  both sides and Hk kng's numbered drawing of it, the bell's rim (311 mm) as the scale. `hero` is the stage's
  own view on a desktop, framed whole: the player's side (the levers, their linkage, the tall ovals of the F
  horn's long loop, the bell's mouth), as the photograph shows it (`-2x`: the same at twice the pixels,
  cropped). `phone-*` is a phone held upright, where the view turns round towards the bell's mouth, which
  shortens the horn across the narrow picture. `back`, `front`, `side`: the player's side from a little round
  on the bell's side (the photograph's bearing), the audience's side (the valve caps, the B♭ slides' bundles),
  and edge on from the bell. `valves` and `linkage`: the four rotors' player side (bearing plates, stop plates
  with their rubber bumpers, the stop arms, the cranks), the lever axle with its return springs, the
  spatulas, the ball-jointed links; `caps`: the audience's side of the valve cluster; `leadpipe`: the
  mouthpiece, the receiver, the hand rest; `rim`: the bell's mouth and its rolled bead. `actuated` is A2
  sounding (the F horn, valves 1+2: two levers down, their rotors a quarter turn round, the bore faintly lit
  along the air's path through the F loop and the first and second valves' F slides, the lips at the rim);
  `actuated-Bb` is F♯4 (the B♭ horn: the thumb's lever and valves 2+3); `actuated-F-*`, `actuated-Bb-*` the
  mechanism close up with each. `orchestra`: violin, flute, oboe, clarinet, bassoon, horn, cello, the horn
  held as a seated player holds it (the coil standing, its caps' side three-quarter to the audience, the
  levers up under the left hand, the leadpipe up to the lips, the bell down by the right thigh, its mouth
  behind).
* `review-cycle-1…4.jpg`: the review sheets, each render beside the photographs at the same angle (the
  Besson from both sides and its drawing, Yamaha's YHR-667V, the levers and caps close up, the Denis Wick
  7N mouthpiece, players holding the horn). Cycle 1, the first full build: the axle's spring aliased into
  a white zipper, the spatulas collapsed to slivers (their outline tapered by mistake), the hand rest a
  black blade, spindly levers and links, the coil lopsided (its outer wrap 0.30 m on one side), the bell's
  rim read edge on beside the photograph (the review camera, and a 24° tilt out of the coil's plane, now
  20°). Cycle 2: the levers, links and springs fixed and the rotors turning a full quarter turn (the four-bar
  had its crank on the wrong side of its dead point: 38°); the Orchestra's hold had the bell's mouth to the
  audience, rebuilt from the players' photographs. Cycle 3: two stale braces crossing the coil as spokes, a
  kink where the F loop leaves the change valve, the first valve's F slide 8 % short, the flare's finish
  uniform beside the tubing's lacquer; the shots' actuated hero framed from a close-up's target. Cycle 4: the
  final state.

Reproduce: `pnpm build && pnpm preview --port 4251` (or `vite --port 4532` in `apps/web`), then
`BASE=http://localhost:4251 OUT=<dir> node scripts/shots-horn-3d.mjs` (the hero, its 2× crop, the actuated
frames, the review's views and close-ups, the Orchestra; `PHONE=1 DSF=2` for the phone; `SET=before` on the
placeholder), and `python3 scripts/sheet-horn-3d.py <dir> <sheet.jpg> --rows full,mech,details,play` (it reads
the photographs from `.cache/refs-horn/photos/`, listed in `docs/3d-reference.md` and its `SOURCES.md`).

Measured: the F horn's open path 3.740 m and the B♭ horn's 2.800 m (the routes solved to them); the second
and first valves' slides their semitone and tone to 3 %, the third's 95 % (F) and 80 % (B♭) of three
semitones (their S-loops fold short in the coil's foot); frame 2.80 ms at 1440 × 900 @2× (the bassoon 2.20 in
the same run; @1× 2.28 against 2.19: the difference is the bell's pixels), 1.66 ms on a phone (`scripts/
fps-3d.mjs`); build 113–150 ms, 815,634 vertices; no WebGL warning or error, alone with a note sounding or
in an Orchestra with two horns, desktop and phone (`scripts/webgl-warnings.mjs`); on a 390 × 844 phone 92 % of
the stage's width and 77 % of its free height, 71 % of its area (`scripts/measure-phone-3d.mjs`; the trumpet's
stand-in 73 % × 44 %).

Left out: the player's right hand in the bell. A hand that reads as a hand needs a rigged, skinned model that
this stage does not have; a rigid one would be the first thing to look false in the hero, and the product
photographs the model is matched to show the instrument alone.

The review sheets include photographs from Wikimedia Commons, cropped and set beside the renders, so they
carry their licences (CC BY-SA 4.0 for the sheets as a whole): "French horn back", "French horn front" by BenP
(CC BY 2.5), "French Horn back" (the numbered drawing) by Hk kng (CC BY-SA 3.0), "Yamaha Horn YHR-667V" by
Yamaha Corporation, background removed by Habitator terrae (CC BY-SA 4.0), "French horn mouthpiece" by BenP
(CC BY-SA 2.5), "Karl Bradač" by Dba488 (CC BY-SA 4.0) and "Orchestrahornsection" by slgckgc (CC BY 2.0).
