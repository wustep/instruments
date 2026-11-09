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

## Round 4: framing, type, and a sound change measured and not made

Audit of round 3's build across the same six dimensions. Ranked:

1. 3D on a phone: the flute and the trumpet ran off both edges of the stage.
2. 3D on a wide stage: violin and viola small, high in the frame (the price round 1 paid for the bow).
3. Type: labels at 9 and 9.5 px, and five half-pixel sizes (9.5, 10.5, 11.5, 12.5, 15.5).
4. Sound: the cello's brightness against the recording is pp ×1.35, ff ×0.76 (centroid ratio).
5. 2D grand: the lid's free edge, a bright hairline across the bass strings.
6. The hand bow in 3D gave no sign of where it can be taken.

Changes:

- **3D framing** (`scenes3d.ts`, `stage3d.ts`). Violin and viola nearer on a wide stage (dist 0.95 →
  0.86, 1.06 → 0.95), the whole bow still in the picture. On a narrow stage the flute and trumpet step
  back ×1.28 and fit; violin and viola keep their round 1 phone framing. `round4-framing/`.
- **Type** (`styles.css`, the spectrum's axis). A whole-pixel scale with a 10 px floor:
  10 / 11 / 12 / 13 / 15 / 17, then the display sizes. Instrument names, pedal names, knob readouts,
  key names and the spectrum's axis were 9–9.5 px. Still Newsreader and IBM Plex only. `round4-type/`.
- **2D grand**: the lid's free edge drawn quiet (alpha 0.25–0.55 → 0.1–0.2, 1 px); its grip marks it.
- **Hand bow**: in 3D the cursor is a pointer over the bow, the turning hand elsewhere.

**Sound: measured, rejected.** Eight variants of the cello's dynamics (`betaDyn` from [1.22, 0.72] out
to [1.6, 0.5], `forceDyn` from [1.08, 2.2] out to [0.6, 2.6] and [1.08, 3], and both together) through
`scripts/fit-cello.ts --eval`. Held-out total 2.83 at the current values; the variants gave 2.80–2.97,
within the run-to-run spread of a chaotic bow, and the widest ones worsened pitch (2.3 → 2.9 ¢) and
the pp–ff level spread. None would earn a BETTER from the judge, so the engine is unchanged in this
round: no audio difference from round 3.

Left, seen: the desktop 2D upright's right half is board and modes only; in 3D the hand's bow is
exhausted in a short drag on a phone (it is drawn small there); the dynamics' brightness needs
something other than bow position and force (the body's level-dependent radiation, or bow width).

Gate: typecheck clean; vitest 22 files / 110 tests; Playwright 57 passed, 7 skipped (desktop + Pixel 7).

---

# Top-3 fixes + the picker's ring (2026-11-09)

Brief: `.autopilot/briefs/FABLE-52-TOP3-FIX.md`. Four fixes, each with its measurement.

**1. Piano polyphony after another instrument** (`worklet/processor.ts`). The processor kept the
*first* instrument's voice limit as the session's: a page that started on the trumpet or flute (1) or
a bowed string (4) left the piano it switched to with that limit, so C4–E4–G4–C5 sounded one note.
Now the requested polyphony (64) is kept apart from the instrument's own ceiling; the adaptive
load-shedding climbs back only to the instrument's own (it would otherwise have lifted a wind's
figure above 1). Worklet test: start on trumpet, flute, cello → piano has 64 and all four notes of
the chord sound. A session that starts on the piano is bit-identical (piano golden unchanged).

**2. Short taps on the winds** (`brass.ts`, `flute.ts`; `scripts/tap-audit.ts`, 7 notes × pp/mf/ff,
wet, 48 kHz). `top3-winds/`.

| | before | after |
|---|---|---|
| trumpet, 50 ms tap, peak re the held note (mean / worst) | −34.9 / −46.4 dB | −0.6 / −5.1 dB |
| trumpet, 50 ms tap, peak (mean) | −44.5 dBFS | −8.5 dBFS |
| trumpet, key → 10 % of steady level (mean / worst) | 258 / 530 ms | 12 / 37 ms |
| trumpet, key → 50 % (mean / worst) | 314 / 626 ms | 40 / 97 ms |
| flute, 50 ms tap, peak re the held note (mean) | −22.5 dB | −12.5 dB |

Trumpet: the lips start from a kick (`TONGUE_KICK` 0.3), their gain is transiently higher
(`ATTACK_BOOST` 1.5 over 60 ms, as the flute's jet already is), and the breath stays on for a minimum
blow of 0.1 s when the key is let go sooner. Flute: the minimum blow only (0.12 s); a held note is
bit-identical (flute golden unchanged), the trumpet's golden is re-blessed.
Against the Iowa trumpet (`scripts/wind-attack.ts`): 10–90 % attack median pp 50 ms: 155 → 80; ff
30 ms: 55 → 35; mf 130 ms: 70 → 50 (moves away: the recorded mf notes swell). Judge, trumpet:
**NO CLEAR CHANGE**, no guard broken (held-out 3.25 → 3.23; attack 1.41 → 1.37 octaves; harmonics,
centroid, noise, pitch, level unchanged). Judge, flute: NO CLEAR CHANGE (identical). The recordings
cannot show the dead time before a note (they have no key press), so the kick is set on the tap
audit and only guarded by the judge; this is the honest reading of "fitted".
Side effects, known: a held trumpet note's first 60 ms overshoot (peak of a held note +1.7 dB on
average); a tapped wind key stays lit through its minimum blow (it does sound).
Left: the flute's lowest notes at pp barely speak even held (C4 pp −60 dBFS) and its low register is
slow (key → 10 %: mean 110 ms); not touched here.

**3. Phone landscape** (`styles.css`, `@media (max-height: 500px) and (orientation: landscape)`).
844×390: page height 524 → 390 (no scroll); stage 300 px of which the band took 91 → stage 224 px
with a 34 px band (3D canvas 209 → 190 px but now wholly on screen; before, the keyboard was pushed
below the fold). One row: glyph-only picker, presets, note, spectrum; scope hidden; knobs behind ◐;
pedal names hidden; keys 96 px. e2e: the layout test now also runs at 844×390. `top3-landscape/`.

**4. The picker's ring** (priority bug). The orange ring is the keyboard-focus ring (`:focus-visible`,
which Chrome shows on the clicked instrument as soon as a key is played). It was drawn 2 px outside
the button, and the picker sits 2 px (desktop) or 0 px (phone) under the stage's top edge, which
clips (`overflow: hidden`): the top of the ring was cut on every instrument, the left on the piano
on a phone. PR #4 had not changed this. Now the ring is drawn inside the button's own box
(`outline-offset: −1.5px`), so nothing can cut it. e2e: for all six instruments, at the project's
viewport and at 844×390, the ring's box lies inside every clipping ancestor and the viewport, and
nothing lies over its top edge. `top3-picker/` (18 crops before, 18 after).

Gate: typecheck clean; vitest 23 files / 114 tests; Playwright 59 passed, 7 skipped (desktop + Pixel 7).
