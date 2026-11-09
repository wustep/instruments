# Fable 5.2 rounds

Self-directed from the live build at `7befb7b`, the art direction and the standing preferences.

## Round 1: light and staging (all seven instruments, no audio change)

Critique of `7befb7b`, ranked:

1. Polished ebony read as a hole: the grand's rim and the whole upright showed no studio in their lacquer.
2. No floor: the instruments sat in murk and their shadows barely registered.
3. Brass was an even mustard: nothing dark between its highlights.
4. Violin and viola: seen almost in plan, the bow standing through the top and bottom of the stage.
5. Phone: violin and viola clipped at the right edge.

Changes:

- `three3d.ts` studio: softboxes feathered to nothing at their edges (were hard-edged cards), darker
  walls, two strip lights beside the camera, a wider card behind it, and a lit floor in front of the
  instrument (what a vertical lacquered front and a bell's underside actually reflect).
- Floor: albedo 0.018 → 0.075 (warm), so the key light makes a pool and the shadow lands on something.
- `lacquer` takes the environment at 2.2× (exposed for the black, as a piano photograph is).
- Violin and viola default view: yaw 0.25 → −0.5, pitch 0.6 → 0.42, from the scroll's side; the whole
  bow is in the picture on desktop and phone.

Before (top / left) and after (bottom / right): `round1-light/*.jpg` — hero, close-up and actuated
frame for each instrument at 1440×900, and the phone heroes at 390×844.

Gate: typecheck clean; vitest 106/106; Playwright 55 passed, 7 skipped (desktop + Pixel 7).

Left as it is, on purpose: the underside of the grand's lid is still a black field (a real one
mirrors the plate and strings; that needs a planar reflection pass, not an environment trick).

## Round 2: the grand's lid mirrors the plate and strings

The one thing round 1 left: under the open lid was a black field. A polished lid is a mirror, and the
plate and strings in it are the picture of a grand.

- `three3d.ts`: a planar reflection. The scene (and the strings' lines, sounding ones glowing) is drawn
  from the camera's mirror image in the lid's plane into its own target, then added over the lacquer by
  its Fresnel reflectance (capped at 0.42, ×1.3). The lid itself is left out of that pass; the shadow
  map is drawn once and shared. Follows the lid as it is dragged, fades with the case, off in a key's
  close-up section, off in the phones' light scene, off when the camera is above the lid.
- Cost on the grand at 2880×1100: frame median 0.9 → 1.5 ms (unthrottled). The mirror's target is not
  multisampled: resolving a second multisampled target with a depth texture cost ≈ 2.5 ms a frame.
- `lacquer` environment 2.2× → 1.7× (the lid's top, seen from behind, was a white slab).
- e2e: the case test now checks the mirror is drawn for the grand on desktop, stops when the lid shuts,
  and is never drawn for the upright or on the phone.

Before (top) and after (bottom): `round2-lid/grand-{hero,side,under}.jpg`.

Gate: typecheck clean; vitest 106/106; Playwright 55 passed, 7 skipped.

## Round 3: the bow in the hand, 2D back to the sound, 3D without drawn waves

Audit of `9ce6125` across sound, 2D, 3D, features, UI/UX and type, with Stephen's four items first.

**The bow did nothing under a finger (priority bug).** Reproduced on Pixel 7 touch emulation, 2D and
3D, violin / viola / cello: keys sounded, a drag on the stage or the bow never did. Root cause: the
bow had no pointer path at all (it moved only while a key was held), and in 2D the stage canvas had
no `touch-action`, so the browser would take the touch as a pan anyway.

- Engine (`bowed.ts`): the bow in the player's hand. Controllers 128 (signed speed, m/s), 129 (contact
  point along the hair) and 130 (let go). While it is held the keys only stop the strings; with none
  held the bow plays the string last played. No hand event, no change: golden and block-size tests
  are bit-identical, and `scripts/judge.ts` against `9ce6125` gives identical held-out errors for
  violin, viola and cello.
- UI (`ui/hand-bow.ts`): a drag along the bow's own line, touch or mouse. 2D: anywhere on the stage.
  3D: start on the bow (30 px by touch, 14 by mouse); anywhere else still turns the instrument. The
  bow stops when the hair runs out. One pointer holds the bow, the rest are free for the keys.
- Tests: 4 unit tests (`bow.test.ts`), one Playwright test on both projects (CDP touch on the phone,
  mouse on desktop; six instrument × view cases, 6–8 s).
- Proof: `round3-touch-bow/touch-bow-{violin,viola,cello}.gif` (2D left, 3D right, the finger
  marked). `scripts/touch-bow.mjs` prints level and contact point per stroke.
- Limit: on iOS the very first touch of a page cannot start audio until it lifts (the platform's
  rule), so a first-ever drag is silent until then.

**3D only: drawn wave overlays removed.** The room's wavefront rings and outline on the floor, the
mode light on soundboards and bodies, and the standing-wave light in the flute and trumpet tubes are
gone, with their shader code. Kept: the strings' own vibration and glow, the stopping mark, the bow's
contact, the flute's jet, the trumpet's lips. Before (top) / after (bottom): `round3-3d-no-waves/`.

**2D: back to the sound.** Before/after: `round3-2d-pianos/` (its own NOTES.md) and
`round3-2d-strings/`.

- Pianos: the literal hardware of the 2D round is out (plate, windows, struts, pin fields, agraffes,
  felts, hammer and damper heads; on the upright also the action stack, the muffler rail and the row
  of keys drawn on the stage). Back: bold string shapes with a glow, lit strings at their old weight,
  the soundboard's mode field across the whole case. Hammers and dampers are two quiet rows of marks
  that still follow the keys and all three pedals. `piano-draw.ts` + `grand-plan.ts`: 1725 → 826 lines.
- Upright on a phone: its height fits the longest string in view, so two octaves fill the stage.
- Violin, viola, cello: the body's modes are sand on the plate again (nodal lines and glow, on the
  varnish, out of the f-holes); they had been reduced to a faint warm wash.

**Also.** 3D cello nearer on a wide stage (dist 2.55 → 2.25). The spectrum's "10k" no longer runs off
the phone's edge. Notes page: the hand bow; the 3D paragraph no longer claims mode shading.

**Sound audit (measured, nothing changed).** Cello against Iowa: centroid ratio pp ×1.35, mf ×1.05,
ff ×0.76; LTAS 4.2 dB RMS; pitch 2.5 ¢ RMS. Round 4 candidate.

**Type audit.** Newsreader, IBM Plex Sans and Mono only; no banned face. Stray half-pixel sizes
(9.5, 10.5, 11.5, 12.5, 15.5 px) and 9 px labels are a round 4 candidate.

Left, seen: the desktop upright's right half is board and modes only (its treble strings are short);
the grand's lid edge crosses the bass strings at the default angle; with sustain down the damper row
is the busiest thing on the piano stage.

Gate: typecheck clean; vitest 22 files / 110 tests; Playwright 57 passed, 7 skipped (desktop + Pixel 7).
