# The oboe in 3D

* `before-*.jpg`: the placeholder at 95c567c (the flute's model stood in for the oboe): the stage's own
  view on a desktop (1440 × 900) and a phone (390 × 844), a note sounding, and the Orchestra.
* `after-*.jpg`: the conservatoire oboe (`apps/web/src/ui/gl/oboe3d.ts`). `hero` is the stage's own view,
  framed whole (`-2x`: the same at twice the pixels, cropped); `front`, `side`, `back` are taken across the
  oboe's axis (square on to the plates, from the player's left, from behind); `reed`, `upper`, `lowerF`
  (square on to R1–R3), `bellH` (the bell from the hero's bearing), `right` (the low keys on the player's
  right), `thumb` (the back: thumb plate, thumb rest), `graze` (low across the top joint's plates, where
  an open plate's lift shows). `actuated-*` is the same view with D4 sounding: every plate down, the closed
  keys faintly lit by the bore's standing wave. `phone-*` is a Pixel-class phone held upright. `orchestra`:
  violin, flute, oboe, trumpet, cello.
* `review-cycle-1…4.jpg`: the review sheets of the four critique passes, each render turned upright
  beside Yamaha's photograph of the YOB-831 at the same scale.

Reproduce: `pnpm build && pnpm preview --port 4332`, then
`OUT=<dir> node scripts/shots-oboe-3d.mjs` (`PHONE=1` for the phone, `SET=before` on the placeholder),
and `python3 scripts/sheet-oboe-3d.py <dir> <sheet.jpg>` (it reads the photographs from `.cache/refs-oboe/`,
listed in `docs/3d-reference.md`).

The review sheets include CC BY-SA 4.0 photographs, so they are CC BY-SA 4.0 themselves: "Yamaha Oboe
YOB-831" by Yamaha Corporation and "Anches hautbois conservatoire et baroque" by Cdang, both from
Wikimedia Commons (CC BY-SA 4.0), cropped and set beside the renders.
