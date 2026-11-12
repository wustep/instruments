# Harp: a player, what a harder pluck does, and a reference with two dynamics

## More reference material, and what the judge says with it

The harp was fitted (#64) to VSCO 2 CE's harp: one pluck a string, twenty-three strings, and the judge could
not tell the fit from the voicing set by hand (NO CLEAR CHANGE, 1.59 → 1.32). The same harp, in the same
maker's **Versilian Community Sample Library** (`sgossner/VCSL`, CC0 1.0, "Concert Harp"), has every one of
those strings at two dynamics (the library's f, and mf; G1 mp, D7 and F7 p; E1 its f alone): **forty-five
plucks**. `scripts/harp-refs.ts` now reads that set (77 MB in `.cache/vcsl-harp`, analysis only, never
committed), every second string held out, both its plucks.

With it:

* `npx tsx scripts/judge.ts --instrument harp --before <b038010>/packages/engine/src/core/index.ts`, the
  voicing that ships: **NO CLEAR CHANGE**, held-out 1.29 → 1.28 (n = 22, Δ 0.01 ± 0.02); no guard broken
  (attack 3.60 → 3.65 dB, brightness 0.29 → 0.31 octaves, the rest within 0.02).
* A whole refit of the voicing on the fit half with the new terms (`scripts/fit-harp.ts --polish`, both
  folds): the fit half 0.979 → 0.959 (then 0.948 with every parameter free), the held-out half 1.290 → 1.290
  (1.277). In two folds 1.16 → 1.20. **Not kept**: the base voicing is production's, unchanged.

So the judge is not beaten, with twice the material. What it shows is why: a held-out string is 1.3 spreads
from any voicing fitted without it, where 1.0 is how far a string is from its neighbour; twenty-three
strings of one harp each have their own character (a wire string's partials 10–25 ¢ off the next one's law,
its level at forte 10–20 dB over its mezzo-forte where a gut string's is 5), and a smooth voicing does not
follow them. More plucks of the same strings do not help that; more strings would.

## What the second dynamic did show: a harder pluck is not the same pluck louder

`npx tsx scripts/harp-dynamics.ts`: each string's forte pluck against its softer one.

| on the held-out strings (n = 11) | the recordings | the model before | now |
|---|---|---|---|
| brighter by (octaves of the centroid) | 0.17 (up to 0.86 on one string) | 0.02 | 0.13 |
| attack stronger by (the first 20 ms against what follows) | 2.84 dB | −0.01 dB | 0.78 dB |
| falls 20 dB sooner by (octaves of the time) | 0.55 | 0.01 | 0.09 |

The old model's pluck only got louder. Now (`HARP_VOICE`, the new terms; chosen on the fit half's score with
the base voicing held: 0.999 → 0.976):

* `slopeVel` 0.6: the finger lets go of a string it has drawn further more abruptly, its upper partials
  stronger.
* `knockVel` 2: the knock on the board and the pluck's noise grow faster than the note.
* `noise` 0.1: the fingertip leaving the string, a few milliseconds of noise near 2.5 kHz, 20 dB under the
  pluck at mezzo-forte; twice that on the wound wire strings (the scrape across the winding). The judge's
  measures do not see it either way (the fit half 0.976 with and without).
* `buzz`: a wire string swung wider than the recorded forte rattles against its disc, each meeting and
  leaving a tap on the board: 2–9 dB more at 0.8–4 kHz on a pluck at velocity 100–120, 0.1 dB on its whole
  level, nothing at or under the recorded forte, gone as the string dies. **Not from the recordings**: they
  have no rattle (set to rattle at forte, the fit half's brightness error went 0.73 → 0.90), so the limit
  is above them and the rattle is there for a pluck harder than any recorded. Said so on the Notes page.

## The player (`human`, 1 by default; 0 is the voicing itself, what is judged)

* No two plucks alike: where the finger takes the string (7 % of the pluck's place), how much of its pad
  (0.22 of an octave of the release's corner), how hard (0.9 dB); four fingers in turn as the line moves, the
  thumb the roundest and strongest. A harp has no recorded set of one string plucked many times to measure
  these on, so they are kept small (a third of the recorded strings' own spread about the voicing).
* A chord's notes are plucked from the bottom string up, 7 ms apart on average, each a moment late.
* A string that still rings is touched before it is plucked again: told the notes to come (a file
  playing), the finger is on it 45 ms early and stops it (on a quick repeat, no more than a third of the
  way back to the last pluck), with a small rattle on a wire string.
* With `human` 0 and the new terms off the engine is bit-identical to production (checked: largest
  difference 0, dry and through the room).

Already there, unchanged: the other strings answering (sympathetic resonance), the two-stage decay, the
soundboard's knock, près de la table and étouffé (the `pluck` and `damp` knobs), the pedals.

## Heard

`harp-before.mp3` / `harp-after.mp3` (`scripts/render-polish.ts`, as played): C4 six times, the C2 wire
string four times, a spread chord left to ring, an arpeggio, a figure of overlapping notes, glissandi, a last
chord. `harp.jpg`: before on top.

| | before | after |
|---|---|---|
| six C4s: their levels' spread (SD) | 0.48 dB | 1.12 dB |
| four C2s (wire): their brightness's spread | 58 ¢ | 216 ¢ |
| loudness, peak | −22.6 LUFS, −6.4 dBFS | −22.4 LUFS, −6.7 dBFS |

Beside the others as played (`scripts/levels-table.ts`): −28.3 LUFS at mf, −21.0 at ff over C3–C5 (it was
−28.5 and −21.7; the piano −25.3 and −17.9): 3 LU under the piano, as set.

## Left

* The judge's verdict above. The wire strings are the least like the recordings (their partials' levels
  12 dB out, their stretch 10–25 ¢), and the two folds do not agree on how to voice them: three recorded
  wire strings a fold.
* What a harder pluck does is right on average and wrong in where: the model's forte is brightest over its
  softer pluck in the bass (0.3 of an octave) and hardly at all at the top, the recordings' in the fifth
  octave (0.4–0.9) and hardly in the bass (the last chart of the harp's Measurements). A harpist may take a
  loud note lower on the string; the model's finger keeps its place.
* The player's scatter is reasoned, not measured.
* No harmonics, no pedal slides, no enharmonic doubling of a quickly repeated note.
* A long piece left to ring still gathers its bass: a harpist's muffling at a change of harmony is not played.

## Tests

`packages/engine/test/harp.test.ts` (13: a harder pluck; the player; the finger before a repluck),
`e2e/harp.spec.ts`, `e2e/notes-credit.spec.ts` (VCSL credited). The harp's golden is blessed; `harp.json`
(the Measurements page) is the forty-five plucks, with a chart of the forte pluck's brightness over the
softer one's.
