# Glockenspiel: a sixteenth instrument (and the trumpet's fortissimo)

Orchestra bells: thirty steel bars, G5–C8 as they sound, struck with hard mallets and left to ring; in 2D
(both styles), 3D and the Orchestra. General MIDI program 10 (byte 9).

## The octave

The instrument sounds two octaves above where its part is written. Here **a note is its sounding pitch**,
G5–C8 (MIDI 79–108), and a note outside that compass is read as written and brought in by octaves: in the
engine (`glockBarOf`: a key or a MIDI note under G5 plays the bar octaves above it) and in the Orchestra's
routing (a line named or programmed for the glockenspiel comes up whole, by one or two octaves, and the
octaves cost its match nothing). So a part typed at sounding pitch, an octave under or two octaves under
all play where a glockenspiel sounds.

## The engine (`packages/engine/src/core/glockenspiel.ts`)

* A bar is six exact two-pole resonators, set going by the stroke from nothing (no click) and left alone:
  its pitch, and five families of partials.
* **The families are the recordings', not a thin bar's.** A thin free bar's overtones are 1 : 2.76 : 5.40 :
  8.93 : 13.34. The Iowa bells show none of those: a mallet lands on the bar's middle, where the second and
  fourth flatwise modes have a node, and the bar is a third as thick as it is wide. What they show, on every
  bar and at every dynamic, is partials near 3.1, 6.3 and 14 times the pitch at C6 that fall slowly as the
  bars shorten (read here as the bar bending edgewise, a thick beam: w/h = 3.3), and near 3.8 and 8 times it
  that fall as 1/√f (read as twisting: its pitch goes as 1/L, the bending's as 1/L²). The reading is a
  reading; the ratios are measured.
* Each family's ratio, level and decay is a smooth function of the bar's pitch and of the stroke
  (`GLOCK_VOICE`): the low bars carry strong high partials for a fraction of a second (a ting at 4–9 kHz),
  the top bars are nearly a sine and a knock; a harder stroke is brighter. The pitch rings for seconds (5
  dB/s through the middle, 20 and more in the top octave).
* The mallet's knock is two short resonators. The `mallet` knob goes from rubber through plastic (the
  recordings) to brass; `damp` 0 (the default) lets every bar ring, as the instrument does.
* Two mallets, the engine's own hands (`glock.hands`, `glock.hits` in the visual frame): they take the bars
  without crossing and alternate on a bar struck again.
* Dynamics: the bar's level goes as the velocity squared, as the recordings' do (their pp is 21 dB under
  their mf, their ff 6 dB over: velocities 22, 75 and 106).
* Cost: 1.3 on the stage's scale (a flute 1.3, a double bass 2.9).

## Fitted to recordings, and judged

Reference: the University of Iowa MIS "Bells" (orchestra bells, 2001, anechoic; C5–E8; plastic mallets pp, mf
and ff, and brass mallets), analysis only, in `.cache/iowa-bells` (never committed). Each run is a chromatic
row of strokes; a stroke is found where the level at its own pitch is highest (the quiet runs are gated and
their noise comes and goes), and analysed as a note left to ring (`analysis/ring.ts`), its partials looked
for round the six families.

* **Fit** (`scripts/fit-glock.ts`): not a search but a regression. On every second bar of G5–C8 (the even MIDI
  notes), each family's ratio (log₂ on the octaves), level (on the octaves; how it grows with the stroke from
  the bars that have it at mf and ff) and decay are regressed; only the knock is found by trying.
* **Judge: BETTER.** `npx tsx scripts/judge.ts --instrument glockenspiel --before textbook` (before = this
  engine with the voicing it was first wired with, a thin free bar's overtones, no recording looked at:
  `GLOCK_TEXTBOOK`): held-out bars 1.86 → 1.48 (n = 42, Δ 0.38 ± 0.09); the partials' ratios 88 → 23 ¢,
  their levels 26.4 → 13.5 dB, the upper partials' decay 0.95 → 0.25 octaves, the pitch's decay 0.53 → 0.41.
  No guard broken. The fit half 1.71 → 1.28.
* All 84 clean strokes now (`apps/web/public/data/glockenspiel.json`, the Measurements page): ratios 21 ¢,
  levels 13.6 dB, third-octave spectrum 12.8 dB, brightness ×0.98, the pitch's decay ×1.05, the time to fall
  20 dB ×1.21 (medians).
* What the recordings could not give: a pianissimo stroke's partials are in the recording's noise (only its
  pitch's decay and its level are compared); the brass mallets' run is 15–25 dB lower, gated, and a third of
  its strokes do not read as strokes, so it is neither fitted to nor judged by (the knob's brass is the
  median of its clean strokes, by hand). 11 of 164 strokes are left out as unclean.

## Known weaknesses

* The partials are measured families, not derived from the bar's elasticity; bar-to-bar differences (two bars
  of the recorded instrument die three times as fast as their neighbours) are not modelled.
* Levels of the upper partials still miss by 14 dB RMS: they vary a great deal from stroke to stroke with
  where the mallet lands; the model strikes every bar at one place.
* No brass-mallet fit; no roll articulation of its own (repeated notes alternate the hands); no dampening by
  the fingers but the `damp` knob.
* The recorded instrument goes down to C5; the model is the orchestral G5–C8.

## The drawings

One plan in metres (`apps/web/src/ui/glock-plan.ts`) for both 2D styles and the 3D model: the bars at the
engine's lengths in two rows on four felted rails under their nodes, in a trapezoid case; from above in 2D, on
a folding stand in 3D. A ringing bar is lit as far as the engine says it swings (in vector lines its bending
between its nodes is drawn across it); each mallet is over the bar its hand last struck, down on it at the
stroke and up again. See `docs/3d-reference.md`. In the Orchestra it stands with the timpani at the back
row's left end.

## The picker (Stephen's addendum, finished)

Sixteen instruments: on a computer one row of the bar (the glockenspiel is "glock" under its glyph, as the
double bass is "bass"; the row folds into its sheet under 1340 px, 1320 before); the sheet is four rows of
four, every row a kind: piano, harp, timpani, glockenspiel; the strings; the woodwinds; the brass. The
piano's kind is out of the grid (with the view in the bar; on a phone at the sheet's foot).

## The trumpet's fortissimo (Stephen's addition)

The trumpet is now played **3 dB under** the level its Iowa recordings were matched at (`brass.ts` `gain`).
Measured over a walk C4–C6 through the room and limiter (`scripts/audio-measure.ts` `lufs`):

| | mezzo-forte | fortissimo | peak at ff |
|---|---|---|---|
| trumpet, before | −10.8 LUFS | −9.2 LUFS | −1.0 dBFS (its limiter taking 3–4 dB; +2.4 dBFS unlimited) |
| **trumpet, now** | **−13.7** | **−11.1** | −1.0 (at the limiter's ceiling, under 1 dB taken on the top notes) |
| horn | −16.4 | −11.2 | −1.2 |
| trombone | −18.9 | −11.6 | −1.0 |
| flute | −13.5 | −10.1 | −1.0 |

Why 3 dB: before, the trumpet was the loudest instrument by far (5.6 dB over the horn at mf) and had 1.6 dB
between its mf and its ff, because its own limiter flattened its loudest notes. At −3 dB its fortissimo is
level with the horn's and the trombone's, its dynamics have their shape again (2.6 dB mf to ff over the walk,
more below the top), and it is still the loudest brass at mf. At −4 dB its limiter would be idle but its ff
would fall under the horn's. Its golden envelope is 3.00 dB lower throughout and otherwise identical; the
judge's level measure (not a guard) moves by 3 dB. Before and after clips are in `artifacts/new3/` (not
committed).

## The harp's level (a correction to #64)

The harp was merged 8 dB too quiet: its level was set 3 dB under the piano's on dry renders, and the piano
is played 6 dB over its dry level (`PLAYBACK_GAIN_DB`); as heard, a mezzo-forte middle C was 9.4 dB under the
piano's and a mezzo-forte walk 14 LU under (−36.5 LUFS against −22.5), the quietest instrument by far. It is
now 8 dB up (`HARP_VOICE.gainDb` −18): middle C 1.4 dB under the piano's, the walk 6 LU under (−28.5 LUFS mf,
−21.3 ff). Its golden envelope is 8.00 dB higher throughout and otherwise identical.

## Pictures

`glockenspiel-2d.jpg`, `glockenspiel-vector.jpg`, `glockenspiel-3d.jpg` (C6 ringing), `glockenspiel-phone-2d.jpg`,
`glockenspiel-phone-3d.jpg`, `orchestra-2d.jpg`, `orchestra-3d.jpg` (sixteen seats). No audio is committed.

## Tests and tools

* `packages/engine/test/glockenspiel.test.ts` (6), `blocksize.test.ts` and `golden.test.ts` with it (and the
  trumpet's golden blessed).
* `apps/web/test/glock2d.test.ts`, `glock3d.test.ts`, `glock-routing.test.ts`.
* `e2e/glockenspiel.spec.ts` (7 cases: address and alias, worklet at four rates and the octave, both 2D
  styles, 3D, its piece, Orchestra).
* `scripts/glock-refs.ts`, `calibrate-glock.ts` (`--table`, `--write`, `--voice textbook`), `fit-glock.ts`,
  `judge.ts --instrument glockenspiel --before textbook`.
