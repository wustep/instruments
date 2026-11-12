# Glockenspiel: a player's strokes, rolls, and the upper partials at their recorded level

The glockenspiel as shipped (#66) played every stroke the same way on the same spot: a machine. This pass
gives it a player, corrects what it was measured to miss, and adds the roll.

## What changed (`packages/engine/src/core/glockenspiel.ts`)

* **No two strokes alike** (`human`, 1 by default; 0 is the voicing itself, what is fitted and judged). The
  recordings say by how much a player's strokes differ (`scripts/glock-variation.ts`: the mezzo-forte and the
  fortissimo stroke on each bar against the fitted curves): each family of upper partials 3.9–7.8 dB from one
  stroke to the next (where the mallet lands), a correlation of about 0.3 between them, and part of a bar's
  offset kept from stroke to stroke (the bar's own). The engine's hands play so: each stroke has its place
  along and across the bar (the pitch is set going less off the middle: the bar's mode shape), its strength
  (1.1 dB), its instant (up to 3 ms late, never early), and its mallet: the left head a little softer than the
  right, each with its own knock. The knock is the noise of a quarter-millisecond contact, not one sample's
  kick, and rises in pitch with the stroke (Hertz's contact time). Every bar has its own tuning (within 2 ¢),
  decay and colour.
* **A bar struck while it rings has the stroke added to its motion.** It was halved and overwritten. The
  mallet is on the bar a quarter of a millisecond, going ten times as fast as the bar's face, and its blow is
  given whatever the bar is doing (less the 6–15 % the mallet takes of the bar's motion under it:
  `MALLET_TAKES`). So a repeated note is louder or softer as the stroke meets the bar's swing, and repeats
  gather: four strokes a second on G6 settle 3 dB over a single stroke.
* **Rolls** (`roll`, a knob on the stage; the modulation wheel; pressing into a key): a held key is struck on
  by the two mallets in turn, 10–16 times a second, each a little early or late, with strokes light enough
  that the roll settles 2 dB over the note's own single stroke on every bar (the bar gathers them). The note
  wavers as it is held, as a metal roll does.
* **The upper partials at their recorded level.** The first fit regressed each family's level straight from
  the analysis's reading, and a partial that dies in a tenth of a second reads 17–29 dB under where it began:
  the model's upper partials were 14–18 dB too weak (a nearly pure tone with a faint ting). Now each family's
  level is fitted through the model (`scripts/fit-glock.ts`: the model's stroke read as the recording's is,
  each stroke at its own measured decays, a ridge on the slopes chosen by leaving one bar out on the fit
  half), with a term in the octaves squared (the top octave has little of any). No family begins more than
  6 dB over the bar's pitch, and above the recorded fortissimo a stroke is louder, not brighter.
* The knock's level no longer depends on the sample rate (a resonator kicked by one sample rings louder at
  96 kHz than at 44.1: 6 dB).

## Judged

`npx tsx scripts/judge.ts --instrument glockenspiel --before <b038010>/packages/engine/src/core/index.ts`,
each stroke now compared at the recorded bar's own pitch (the recorded instrument is 10–30 ¢ sharp; every
fourth bar lies a fifth of a semitone under a third-octave band's edge and was read in the wrong band:
`--et` gives the old comparison).

| held-out bars (n = 42) | before | after | the recordings' own spread |
|---|---|---|---|
| upper partials' levels | 13.54 dB | **8.72 dB** | 8.33 |
| spectrum (third octaves) | 7.92 dB | **5.88 dB** | 7.01 |
| time to fall 20 dB (octaves) | 0.53 | 0.44 | 0.26 |
| attack (dB) | 2.70 | 2.64 | 2.19 |
| brightness (octaves) | 0.10 | 0.10 | 0.10 |
| ratios, decays, level | 23.4 ¢, 0.41, 3.80 dB | the same | |
| **whole score** | 1.34 | 1.28 | Δ 0.06 ± 0.03: **NO CLEAR CHANGE** |

In two folds (each bar judged by the voicing fitted without it, `--folds`): 1.30 → 1.30 (Δ 0.00 ± 0.04), the
partials' levels 13.61 → 8.46 dB, the spectrum 8.02 → 5.67 dB. So: the weakness named (the upper partials'
levels, 14 dB out) is corrected to what one recorded stroke differs from the next by, no guard is broken,
and the judge's whole score does not move clearly: the rest of it is the bars' and the strokes' own scatter
(the pitch's decay, the level), which a smooth voicing cannot follow. The change is kept as a measured
correction of a bias that is plain to hear (the ting was 14–18 dB too quiet), not on a BETTER verdict. Against
the textbook bar the verdict stays BETTER (1.74 → 1.28). A further polish of the levels on the fit half's
whole score was tried and dropped (fit half 1.158 → 1.114, held-out 1.34 → 1.34, brightness worse).

All 84 clean strokes now (the Measurements page): ratios 21 ¢, levels 7.6 dB (13.6), spectrum 5.5 dB,
brightness ×1.00, the pitch's decay ×1.06, the time to fall 20 dB ×1.10.

## Heard

`glockenspiel-before.mp3` / `glockenspiel-after.mp3` (`scripts/render-polish.ts`: one phrase through the
engine before and after, as played): G6 eight times, C7 in sixteenths, a tune growing from piano to forte, a
long E6 with the wheel up, a chord left to ring. `glockenspiel.png`: before on top.

| | before | after |
|---|---|---|
| eight G6s: their levels' spread (SD) | 2.1 dB | 3.6 dB |
| … their brightness's spread | 2 ¢ | 85 ¢ |
| eight C7s (sixteenths): brightness's spread | 17 ¢ | 140 ¢ |
| the long E6, wheel up | one stroke dying away | a roll (about 35 strokes), its brightness moving 162 ¢ |
| loudness, peak | −18.2 LUFS, −4.7 dBFS | −18.1 LUFS, −2.4 dBFS |

As played beside the others (`scripts/levels-table.ts`, a walk at mf and ff): −20.1 and −13.3 LUFS, as before
(the oboe −18.3 and −13.2, the horn −18.2 and −13.7); no single stroke reaches its limiter (the hardest, the
lowest bar at velocity 127, peaks at −2.6 dBFS).

## Seen

Each mallet comes down where the engine's stroke landed on its bar (2D, vector lines, 3D), not on the middle
every time; in a roll the two come down in turn. The roll has its knob beside the mallets' and the damping's.

## Left

* Rolls waver as the physics has it (each stroke meets the bar's swing where it falls); a player's rolls are
  not recorded in the Iowa set, so their evenness is not checked against one.
* The bars' own differences are drawn from their measured spread, not measured bar by bar.
* No brass-mallet fit (its recorded run is in its own noise).

## Tests

`packages/engine/test/glockenspiel.test.ts` (9: a player's strokes; a bar struck while it rings; a roll; the
knock at every rate), `apps/web/test/glock2d.test.ts` (the mallets land where the strokes did),
`e2e/glockenspiel.spec.ts` (a roll on the stage). The glockenspiel's golden is blessed.
