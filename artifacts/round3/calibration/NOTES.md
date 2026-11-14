# Calibration: everything re-measured, one guide, two refits (2026-11-14)

Before = `4682092` (main). I cannot hear: every claim below is a measurement, and the clips are here to be
listened to.

## What was asked

(a) One clear guide in place of the scattered calibration notes. (b) Every instrument re-measured against
its recordings, and whatever drifted or measures poorly re-tuned, without overfitting. The harp and the
glockenspiel were to be measured and left alone.

## The guide

`docs/CALIBRATION.md` is rewritten from a round-by-round log of five instruments into a guide to all
sixteen: the idea, the commands, how a comparison is made, how the judge reaches BETTER / WORSE / NO CLEAR
CHANGE and how to read it, each instrument's recordings and their oddities, current scores, each
instrument's fit, verdicts and known limits, players, levels, the method's limits, a short history.

Brought into line with it: `README.md`, `docs/RESEARCH.md` (it still said the strings and flute were not
calibrated), `AGENTS.md` (the rule's row, the commands, the `git ls-files` check that never printed
nothing), the Measurements page (the trumpet was measured and never shown; "Where it falls short" now lists
what the guide lists; a link to the guide), the Notes page's calibration section (the harp's library, the
piano's and horn's numbers), and a few script and engine comments that named files or flags that do not
exist.

## What the re-measurement found

`pnpm refs:fetch`, `pnpm calibrate`, `pnpm refs:ensemble`, `pnpm calibrate:ensemble`,
`calibrate-{timpani,harp,glock}.ts`, against the committed Measurements data:

| instrument | drift since its last measurement |
|---|---|
| violin, viola, cello, flute, oboe, clarinet, bassoon, horn, trumpet, trombone, tuba, timpani, glockenspiel | none: identical to the last digit |
| double bass | #75's air-mode change was never re-measured: harmonics 6.84 → 6.97 dB, spectrum 4.88 → 4.98 dB (it was a level fix, judged NO CLEAR CHANGE then) |
| harp | #75's wire-string level: third decimal |
| **piano** | **yes.** #2 rebuilt the board's high-frequency path and re-set the action's tick; no round was logged after. Level error mf 4.72 → 5.45 dB, ff 5.50 → 6.21; single treble keys moved by up to 9 dB |

## What changed

### Piano: a held-out judge, and the output EQ smoothed

The piano was the one instrument never judged on notes held out of its fit. `scripts/piano-judge.ts`
(`judge.ts --instrument piano`) does it: `pnpm refs:fetch --all` brings every key of the Steinway (261 notes
on 88 keys); the fit sees 23 keys, the other 65 are held out. Measures: level, partials, brightness, early
and late decay, tuning, stiffness, each over the Steinway's own key-to-key spread.

Its first use found the fitted **output EQ overfit**. Fitted band by band to those 23 keys' median spectrum,
it stood at +12 dB at 4 kHz (on its bound) beside −5 dB at 2.5 kHz, and +10.7 dB at 100 Hz between two
bands at +2. On the held-out keys:

| the EQ | held-out score | level dB | partials dB | brightness oct |
|---|---|---|---|---|
| as fitted (before) | 3.10 | 4.19 | 8.82 | 0.49 |
| none at all | 3.03 (Δ 0.06 ± 0.03) | 3.89 | 8.46 | 0.47 |
| the 4 kHz band alone taken out | 2.99 (Δ 0.11 ± 0.04) | 4.45 | 8.36 | 0.43 |
| **each band averaged with its neighbours** | **3.00 (Δ 0.09 ± 0.02): BETTER** | 4.16 | 8.60 | 0.45 |

The smoothed EQ is kept: it is the rule the fit already applies to its voicing (neighbouring breakpoints
should not zig-zag), it is BETTER, it breaks no guard, and it improves the fit keys too (3.41 → 3.26). The
single-band variant scored a hair better and was not chosen: it is a choice made on the held-out keys, and
its level error is worse. `calibrate.ts --fit` now smooths its EQ by rule and prints every constant that
ends on its bound (there are several: the bass strings' loss, the treble bridge's admittance, the bass
felt's exponent; each is a known limit in the guide).

EQ, dB at 63 / 100 / 160 / 250 / 400 / 630 / 1k / 1.6k / 2.5k / 4k Hz:
before 2.4 / 10.7 / 2.0 / 1.6 / 3.2 / −3.2 / 6.9 / 2.2 / −5.1 / 12.0;
after 6.5 / 6.4 / 4.1 / 2.1 / 1.2 / 0.9 / 3.2 / 1.5 / 1.0 / 3.4.

On the 23 fit keys (`pnpm calibrate`): level error pp / mf / ff 8.62 / 5.45 / 6.21 → 8.58 / 5.00 / 5.73 dB;
brightness of the attack ×1.63 / 1.19 / 1.28 → ×1.46 / 1.13 / 1.20; the third-octave spectrum 4.63 → 5.09 dB
(the one number the old EQ was fitted to, on these keys). Decays, tuning and stiffness are untouched.
Loudness as played (C3–C5 walk, room and limiter): −25.3 / −17.9 → −25.3 / −18.0 LUFS at mf / ff (the
output gain set for that: 49.58 → 50.27).

Clips (`piano/`, before and after at one gain, before on top in the pictures): `piano-top-keys` (every key
C5–C8), `piano-scale` (C major over four octaves, ff then pp), `piano-piece` (the opening of its own piece).
What the numbers say to listen for: A7–C8 less forward (4 kHz came down 8.6 dB) and C♯7–F7 less
recessed (2.5 kHz came up 6.1 dB); G2–A2 less boomy (100 Hz down 4.2 dB); a touch less of the 1 kHz
presence (down 3.7 dB).

### Horn: the fortissimo's upper harmonics

At fortissimo the model's harmonics above 2 kHz stood 8–30 dB under the Iowa horn's (the long-term spectrum
14.4 dB RMS off at ff, 3–4 at pp and mf): the fit had ended with a −18.6 dB shelf above 3 kHz. A refit of
the radiated colour, the breath noise and the steepening alone (`fit-horn.ts --only …`, 160 steps on the
fit half; these are outside the loop, so no note's register or pitch can move):

| | before | after |
|---|---|---|
| steepening | 0.0205 | 0.0247 |
| shelf above 3 kHz | −18.6 dB | −11.2 dB |
| formant | 663 Hz, +1.5 dB | 722 Hz, −0.2 dB |
| low-pass | 1914 Hz | 1795 Hz |
| breath noise, low / top | 0.174 / 0.170 | 0.190 / 0.128 |

Judge: **BETTER**, held-out 2.26 → 2.09 (Δ 0.17 ± 0.04), fit half 2.18 → 2.02; harmonics 4.96 → 4.58 dB,
brightness 0.10 → 0.08 octave, noise 2.40 → 1.98 dB, attack 1.05 → 1.05, pitch 0.15 → 0.15 ¢; no guard
broken. Summary: spectrum 14.4 → 11.2 dB (ff 14.4 → 11.2, mf 3.8 → 3.2, pp 3.3 → 3.3), brightness at ff
×0.94 → ×1.00. Every note of the compass on its partial at four sample rates (528 of 528). The level is the
median recorded note's, as before (gain 0.5617 → 0.6088); by octave within 0.3 dB of before; as played
−18.8 / −14.4 → −18.7 / −14.2 LUFS; its limiter works 0.2 dB more on the loudest E5.

Clips (`horn/`): long tones at pp, mf, ff; an original phrase with a swell; the opening of its own piece.
What the numbers say to listen for: loud notes from about C4 up a little brassier; soft and middle dynamics
unchanged.

## Tried and not kept

* **Piano, a whole refit** (`calibrate --fit`, one step): NO CLEAR CHANGE on the held-out keys (3.10 → 3.12),
  worse on the fit keys' own level. As before, the fit oscillates on single-take targets.
* **Piano, more of the board's high-frequency path direct** (0.6 → 0.8, 0.9; the rest is a 30 ms diffuse
  tail). It evens the top keys: steps between neighbours at mf above F♯6, 5.2 → 3.7 dB by a plain half-second
RMS (the Steinway, by the judge's reading: 2.6; the model there: 4.2),
  and the attack's tail comes onto the Steinway's (−1.7 → 0.0 dB). The judge: NO CLEAR CHANGE (Δ 0.00 ±
  0.01). It would change the character of every treble note and I cannot hear it, so it is left as designed.
  A candidate for a listening test: `Diffuser`'s `direct` in `post.ts`.
* **Oboe, its radiated colour refitted** (thirteen filter constants, as the horn's). The judge's score fell
  2.34 → 2.17, but nearly all of it is the level term (the session's gain, 8.3 → 6.9 dB); harmonics 8.37 →
  8.50 dB, and it moved the low cut up (300 → 393 Hz) on an instrument whose low notes already lack their
  fundamental. Not kept. The lesson is in the guide: read the measures, not the score, when level moved.
* **Bassoon, the same**: stopped. Its register survey makes each step minutes long, and its known faults
  (the lowest notes' fundamental, the regimes) are in the reed, not the filters.

## Measured and left

The guide's "Instrument by instrument" lists each known limit. The ones this round looked at again:

* **Oboe B♭3–E♭4, bassoon B♭1–F2**: the fundamental 20–30 dB under the strongest harmonic at mf and ff
  (the recordings: 9–14). The reed shuts several times a period down there. A new reed model, not a filter.
* **Tuba**: spectrum error 14 dB at ff, 25 at pp. The pp recordings are brighter than the mf ones (hiss);
  fitting to that would add noise to match noise.
* **Piano's attack**: with the attack judge's window fixed (below), the 6–12 kHz burst over the sustain is
  +1.5 dB on the fit half and +8.2 dB on the held-out half. The halves disagree; the tick's level stays.
* **Violin's long-tone attack** (×0.30), **viola's dynamics** (16 dB against 10), **cello's brightness
  across dynamics**, **trumpet's and trombone's pianissimo**: as the guide says, each wants a change of
  mechanism, not of constants.
* **Harp, glockenspiel**: measured (unchanged: 1.28 and 1.28 on their held-out halves), not touched.

## A fault in a tool

`scripts/attack-judge.ts` read its 200 ms of sustain (8820 samples) with a 4096-point transform: the Hann
window was cut off at its top, and the "sustain at 6–12 kHz" was that cut's splatter, ±20 dB from note to
note by where the wave stood. The "burst over sustain" numbers quoted since round 3 (fit −8.2, held-out
+2.4 dB) were mostly that. Fixed (the transform is as long as the window): +1.1 / +7.9 dB before this
round's change, +1.5 / +8.2 after. The tail measure (short windows) was never affected.

## Scores, before → after

`npx tsx scripts/judge-all.ts --before <4682092>/packages/engine/src/core/index.ts`, held-out halves:

| instrument | before | after | |
|---|---|---|---|
| piano | 3.10 | 3.00 | BETTER (Δ 0.09 ± 0.02) |
| horn | 2.26 | 2.09 | BETTER (Δ 0.17 ± 0.04) |
| violin 2.97, viola 4.30, cello 1.85, double bass 1.83, flute 3.30, oboe 2.34, clarinet 1.95, bassoon 2.07, trumpet 3.49, trombone 3.97, tuba 5.81 (5.00 on main since #84's level), timpani 3.50, harp 1.28, glockenspiel 1.28 | | | identical |

(A score is in units of the recorded instrument's own note-to-note spread, and is comparable only inside
one run: see the guide.)

## Checks

* `packages/engine/test/golden.test.ts`: the piano's and the horn's snapshots blessed (deliberate changes,
  the clips above); the other thirteen untouched.
* `human` 0: nothing about any player changed; the fourteen untouched instruments render bit-identically
  (judge Δ 0.00 on every measure).
* New tools: `scripts/piano-judge.ts`, `scripts/judge-all.ts`, `scripts/judge-voice.ts`,
  `scripts/render-calibration.ts`; `--only` on `fit-oboe.ts`, `fit-bassoon.ts`, `fit-horn.ts`.
