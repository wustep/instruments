# The bassoon in 3D

* `before-*.jpg`: the placeholder at 41c5430 (the oboe's model stood in for the bassoon): the stage's own
  view on a desktop (1440 × 900) and a phone (390 × 844), a note sounding, and the Orchestra.
* `after-*.jpg`: the Heckel-system bassoon (`apps/web/src/ui/gl/bassoon3d.ts`), 1340 mm, laid out from
  Fox's Renard 220 photographed from both sides. `hero` is the stage's own view on a desktop, framed whole:
  a wide stage leans the bassoon 36° across, as it is played, bell up, the bocal arcing back towards the
  player (`-2x`: the same at twice the pixels, cropped). `phone-*` is a phone held upright, where it stands
  (7° off upright) as a product photograph shows it. `front`, `side`, `back` are the upright pose (a tall
  stage) from the fingers' side, the long joint's outside and the thumbs' side; `reed` (the reed and the
  bocal's end), `whisper` (the bocal leaving the wing's cap: its cork, collar, nipple and the whisper key's
  pad), `wing` (the wing joint's three finger holes and the L3 ring, the E♭ and E touches, the left little
  finger's plate), `thumb` (the left thumb's long keys and touches, the flick keys), `boot` (the right
  hand's side: the B hole, the A hole's ring, the G touch, the little finger's F plate with its rollers, the
  F, F♯, A♭ pads), `bootback` (the right thumb's E plate in its guard, the B♭ key, the F♯ and A♭ touches,
  the hand rest), `cap` (the U-tube's cap), `bell` (the bead ring and the throat). `actuated` and
  `actuated-*` are the same with F2 sounding (both hands down, the whisper key on the bocal's nipple, the
  right little finger's F key: the rings pressed, the pads seated, the closed holes faintly lit by the
  bore's standing wave, the reed's blades beating). `orchestra`: violin, flute, oboe, clarinet, bassoon,
  cello (the bassoon held diagonally, its boot by the seated player's thigh).
* `review-cycle-1…3.jpg`: the review sheets of the three critique passes, each render beside the
  photographs at the same angle. Cycle 1: the first build (flat orange wood, thin spatulas, cropped
  cameras); cycle 2: the turned-maple flame, domed touches, the E plate's guard and the plates' rollers;
  cycle 3: the flame in uneven drifting bands, fuller thumb pears, a dark throat, close-ups of the reed and
  the whisper key.

Reproduce: `pnpm build && pnpm preview --port 4532` (or `vite --port 4532` in `apps/web`), then
`OUT=<dir> node scripts/shots-bassoon-3d.mjs` (the hero, the actuated frame and the Orchestra; `TALL=1` for
the review's views and close-ups; `PHONE=1` for the phone; `SET=before` on the placeholder), and
`python3 scripts/sheet-bassoon-3d.py <dir> <sheet.jpg> --rows full|keys|details` (it reads the photographs
from `.cache/refs-bassoon/photos/`, listed in `docs/3d-reference.md`).

Measured: frame 2.41 ms (the clarinet 2.22, the oboe 2.19; `scripts/fps-3d.mjs`, 1440 × 900 at 2×), build
111–150 ms, 798k vertices; no WebGL warning or error, alone or in the Orchestra, desktop and phone
(`scripts/webgl-warnings.mjs`); on a 390 × 844 phone 86 % of the stage's free height (the clarinet's 86 %),
22 % of its width (`scripts/measure-phone-3d.mjs`).

The review sheets include photographs from Wikimedia Commons, cropped and set beside the renders, so they
carry their licences (CC BY-SA 4.0 for the sheets as a whole): "FoxBassoon" by Gregory F. Maxwell (GFDL 1.2),
"Yamaha Bassoon YFG-812 II" by Yamaha Corporation (CC BY-SA 4.0), "Bassoon showing left and right hand finger
positions", "… thumb keys" and "… close up of right hand rest and thumb keys" by John Yesberg (CC BY-SA 4.0),
"Wiki loves Music - Hamburg-5688" by Wuselig (CC BY-SA 4.0), "Heckel Biebrich Bassoon Bocal" by
themusicgrove (CC BY 2.0) and "Bassoon 001" by mark.drummer (CC BY 2.0).
