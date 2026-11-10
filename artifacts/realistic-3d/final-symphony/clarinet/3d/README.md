# The clarinet in 3D

* `before-*.jpg`: the placeholder at 4c64f23 (the oboe's model stood in for the clarinet): the stage's own
  view on a desktop (1440 × 900) and a phone (390 × 844), a note sounding, and the Orchestra.
* `after-*.jpg`: the Boehm B♭ clarinet, Yamaha's YCL-CSG III (`apps/web/src/ui/gl/clarinet3d.ts`). `hero` is
  the stage's own view, framed whole (`-2x`: the same at twice the pixels, cropped); `front`, `side`, `back`
  are taken across the clarinet's axis (square on to the rings, from the player's left, from behind);
  `mouthpiece` (the ligature's screws, from the player's right) and `reed` (from behind: the reed on the
  table); `upper`, `lower`, `low` (each joint square on to its rings, as the photograph is taken);
  `pinkies` (the right little finger's spatulas), `lpinky` (the left's, from the player's left), `thumb`
  (the back: thumb ring, register key), `bell`, `graze` (low across the upper joint, where a raised ring
  and an open pad show). `actuated-*` is the same view with G3 sounding (written A3: the thumb, the left
  hand, R1 and R2 down; their rings pressed, the bridge and the ring pad shut, the closed holes faintly lit
  by the bore's standing wave; the reed's tip closing on the lay). `phone-*` is a Pixel-class phone held
  upright. `orchestra`: violin, flute, oboe, clarinet, cello.
* `review-cycle-1…3.jpg`: the review sheets of the three critique passes, each render turned upright
  beside Yamaha's photograph of the YCL-CSG III at the same scale.

Reproduce: `pnpm build && pnpm preview --port 4377`, then `OUT=<dir> node scripts/shots-clarinet-3d.mjs`
(`PHONE=1` for the phone, `TALL=1` for the sheets' close-ups, `SET=before` on the placeholder), and
`python3 scripts/sheet-clarinet-3d.py <dir> <sheet.jpg>` (it reads the photographs from
`.cache/refs-clarinet/`, listed in `docs/3d-reference.md`).

The review sheets include CC BY-SA photographs, so they are CC BY-SA 4.0 themselves: "Yamaha Clarinet
YCL-CSGIII" by Yamaha Corporation (CC BY-SA 4.0) and "Clarinet002" by Fewskulchor (CC BY-SA 3.0), both from
Wikimedia Commons, cropped and set beside the renders.
