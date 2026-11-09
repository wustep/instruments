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
