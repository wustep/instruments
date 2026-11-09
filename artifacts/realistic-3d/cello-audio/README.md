# Cello audio: before / after (realistic-3d round)

The same passages through the engine at `af4f97e` (`*-before.mp3`) and the final cello of this
round (`*-after.mp3`): the v2 model (`624c0bf`) plus the bow of finite width, rosin noise and the
attack force limit (`a6baebd`, "Polish" below). The same files are in `../final/cello-audio/`.
Each file is peak-normalised to −1 dBFS and has the site's room (0.32), 48 kHz, 128 kbps. Each
`<piece>.png` is a spectrogram (0–8 kHz, linear, 80 dB, mono sum) with **before on top and after
below**. The level differences are in the metrics, not the files.

| piece | what it plays |
|---|---|
| `phrase` | the round-3 audit phrase: C3 E3 G3 C4 B3 A3 G3, vibrato 17 ¢ (matches `artifacts/round3/audit/cello-phrase-*`) |
| `bach-prelude` | Bach, Suite No. 1, Prelude, bars 1–4 (public domain): string crossings over G–D–A, slurs of four |
| `sustained` | long tones with vibrato: C2 pp, G2 mf, D3 ff, A3 mf, E4 ff, A4 pp |
| `sustained-novib` | G2 mf, D3 ff, A3 mf, D4 mf, no vibrato (pitch stability, the bare tone) |
| `transitions` | legato D3–A3 on one string; slurred crossings G2↔D3; détaché repeated G3s; one long ff D3 that runs out of bow |

Rendered with `npx tsx scripts/render-cello.ts --seeds 12 --before <af4f97e>/packages/engine/src/core/index.ts`
(it writes these files and `metrics.json`; `--seeds 12` averages the click and grain measures over
twelve renders that differ only in the cello's random seed, see "From the renders").

## What changed in the model (cello only; violin and viola are bit-identical)

All of it is in `packages/engine/src/core/bowed.ts`, behind design fields only the cello sets;
the fitted values are in `bowed-fit.json` (`scripts/fit-cello.ts`, fitted on the even-MIDI half of
the Iowa notes; the odd half is what the judge holds out).

1. **Radiation from acceleration, through the bridge.** Far-field pressure follows the body's
   volume acceleration (Fletcher & Rossing, *The Physics of Musical Instruments*, §7.1); the old
   chain radiated velocity, 6 dB/octave too dark, then patched it with a +6.7 dB "bridge hill" EQ.
   Now the modal velocities are differentiated, and the force reaches the body through two
   bridge resonances (fitted: 803 Hz Q 1.6, and a gentle roll-off at the 3.5 kHz search bound;
   Reinicke 1973, in Cremer, *The Physics of the Violin* ch. 9, puts the cello bridge's first
   in-plane resonance near 1 kHz). The old +6.7 dB "hill" EQ stage refitted to −5.5 dB at 1.1 kHz.
2. **The high-frequency body path was invisible in mono.** The round-2 chain sends an *inverted*
   copy of the statistical high-frequency radiation to the right channel: in a mono sum (a phone
   speaker, and the one-microphone recordings it was fitted to) everything above ~3.6 kHz
   cancelled, and in stereo it sounded phasey. It now reaches both channels in phase. (The fit had
   pushed that path to 7 kHz because it had no effect on the mono analysis.)
3. **Open strings no longer swallow the octave above them.** The one-point bridge let an undamped
   open string pin the bridge at its harmonics (a dynamic absorber): C3, G3 and D4 came out
   5–11 dB weaker than their neighbours, their sympathetic ring after release was as loud as the
   note, and they pulled up to 15 ¢ off pitch. Idle open strings now couple to the bridge through
   a transformer ratio of 0.245 (fitted; it stands in for the bridge's second degree of freedom,
   the strings' two polarizations and the tailpiece). C3, G3 and D4 now sound within ~1 dB of the
   same note with the open strings left out, and of their neighbours; the open strings still ring
   sympathetically, but below the played string's own decay after release.
4. **Torsion at the bow.** The bow grips the string's surface, which also rolls; a short, heavily
   damped torsional loop (speed 5× transverse, surface impedance 3.8 Z, effective Q 2.8 at the bow)
   in parallel with the transverse string (Cremer ch. 5–6; Woodhouse & Galluzzo 2004; Gillan &
   Elliott 1989 for the speed ratio). It steadies the stick–slip: the model's harmonic-to-noise
   ratio had fallen 4–6 dB below the recording once the upper partials were radiated properly.
5. **Overwound C and G strings lose their upper partials faster** (×0.21 and ×0.63 of the A
   string's high-frequency decay; D ×1.07): the low strings were too bright and too loud.
6. **Pitch over 40 harmonics.** The bridge's reflection phase and the loss filter's delay are
   averaged over the sawtooth's harmonics (weights 1/k) instead of the first three: open C and G
   strings were +2.5–3 ¢ sharp.
7. **Performance:** soft notes start with a slower bow (attack time constant 144 ms at pp, 97 ms
   at ff, was 45 ms everywhere; Guettler 2002); players move the bow away from the bridge to play
   softly (β ×1.17 at pp, ×0.70 at ff, constrained to that direction); a slurred string crossing
   starts the new string at the bow's speed instead of from rest; vibrato rate/depth and bow
   speed/force wander slowly (6 % / 20 % / 1.5 % / 2 %, τ 0.3 s; Mellody & Wakefield 2000,
   Askenfelt 1989). CBR and B1− radiate less (0.1 and 0.3, were 0.25 and 0.85): with radiation
   from acceleration the 160 Hz third-octave read +12 dB over the recording.

## Polish: a bow of finite width, between samples (`a6baebd`)

The round's two known problems, pp ×2 too bright and a grain under vibrato, turned out to have one
root. A slip counter in the friction solve showed that the point bow on whole samples rarely held
Helmholtz motion: only 4 of 22 pp, 8 of 22 mf and 0 of 23 ff Iowa notes had one slip per period in
their steady part. Nothing physical set the width of the Helmholtz corner, so it was one sample
wide at any sample rate (at 88.2 kHz pp notes slipped up to 12 times per period). The one-sample
pulses it left between the bow and the bridge tripped extra slips at low bow force, and multiple
slipping is bright with a weak fundamental. The model's pp came out brighter than its ff, the
opposite of the recording; the round-2/3 fit had balanced that by brightening the whole chain.
Under vibrato the bow taps sat on the note's nominal loop while the bridge read the gliding one, so
the bow–bridge segment itself swung in length (±1.3 of its 6 samples on E4 with 17 ¢ of vibrato):
the ripple trapped there wandered across the harmonics as curved inter-harmonic partials, and the
slip timing with it.

8. **The bow touches the string over the hair ribbon's width** (`bowWidth`, fitted 9.8 mm within
   4–15 mm; the ribbon is about 1 cm wide, Guettler, "Some physical properties of the modern violin
   bow"; Pitteroff & Woodhouse 1998, Acta Acustica 84, on how a finite-width contact reflects and
   transmits waves and shapes the corner). The bow reads the string's velocity averaged over a
   raised-cosine contact (pressure falling to zero at the ribbon's edges) and spreads the friction
   force over the same taps, the transpose of the read, so the junction stays passive; one
   stick/slip state for the ribbon, as the spreading operator of finite-difference bowed strings
   (Bilbao, *Numerical Sound Synthesis*, 2009, ch. 7). Its width in samples is w·fs/c, about 5 on
   the C string and 1.5 on the A string at 44.1 kHz; for widths ≥ 2 samples the contact's
   admittance (Σh²) does not change as it slides between samples. The contact sits at its exact,
   fractional distance from the bridge, and on the returning wave at the loop's current length
   minus that distance: vibrato and pitch bend now lengthen the finger side of the loop, as on the
   instrument, and the bow–bridge segment keeps its length.
9. **Rosin noise** (`rosinNoise`, fitted 0.226, i.e. ~2.7 % RMS fluctuation of the friction
   coefficient after its low-pass; violin and viola keep 0.04). Rosin softens and re-hardens under
   the sliding hair (Smith & Woodhouse 2000, J. Mech. Phys. Solids 48). Once in clean Helmholtz
   motion the model read several dB more harmonic than the recordings.
10. **In an attack the player presses no harder than the moving bow can carry**
    (`forceWithSpeed`): the force still rises on its 12 ms time constant, but never above
    Schelleng's maximum for the speed the bow has reached so far. A clean attack needs a force
    within a window that scales with the bow's acceleration (Guettler 2002, Acta Acustica 88); the
    refitted, heavier forces otherwise creaked open-G-string strokes in the Bach into 3–5 slips per
    period for 100 ms or more. (A force that only follows the speed was tried and rejected: it
    starts below the window and the string multiple-slips for up to a second.)
11. **Refit** (`scripts/fit-cello.ts`, even-MIDI half only, with `bowWidth` and `rosinNoise` in the
    search and new `--fix`/`--free` options): the strings' high-frequency loss went back towards
    the literature (T60 at 3 kHz 7.35 → 0.53 s; the design's literature value was 1.0 s), the bow
    force rose (×1.36 at pp, ×1.82 at ff of the round's 0.3 of Schelleng's maximum; a near-bridge
    ff needs it, F_min ∝ 1/β²), and the attack time constants are 255 ms at pp and 108 ms at ff
    (soft notes start at least as slowly as loud ones, enforced). The refit also moved v2's fitted
    values, which items 1–7 give as of `624c0bf`: idle-string coupling 0.245 → 0.306; torsion
    3.79 → 3.68 Z, Q 2.81 → 2.92; high-frequency decay of C/G/D 0.21/0.63/1.07 → 0.25/0.57/0.53 of
    the A string's; β ×1.17/×0.70 → ×1.22/×0.72 at pp/ff; bridge resonances 803 Hz Q 1.6 and
    3.5 kHz Q 0.74 → 839 Hz Q 0.85 and 2.7 kHz Q 0.58; the hill stage −5.5 dB at 1.1 kHz →
    −2.3 dB at 1.6 kHz; the high-frequency path 0.0029 above 1.55 kHz → 0.037 above 6.5 kHz.

Notes holding Helmholtz motion (one slip per period over 1.2–2.6 s of the calibration notes):
pp 4 → 21 of 22, mf 8 → 18 of 22, ff 0 → 14 of 23. Cello CPU: 22 → 25 ms per second of audio
(M-series, with the room).

## Against the Iowa MIS cello (67 notes, pp/mf/ff, `scripts/calibrate-ensemble.ts --only cello`)

| measure | before (`af4f97e`) | v2 (`624c0bf`) | final (`a6baebd`) | recording |
|---|---|---|---|---|
| ⅓-octave long-term spectrum, RMS error | 15.7 dB (pp 12.2, mf 13.0, ff 17.2) | 5.0 dB (pp 4.6, mf 4.8, ff 5.3) | **4.3 dB** (pp 3.5, mf 4.1, ff 4.6) | — |
| spectral centroid, model/recording | 0.57 (pp 1.10, mf 0.71, ff 0.49) | 1.22 (pp 2.02, mf 1.10, ff 0.68) | **1.02 (pp 1.59, mf 1.01, ff 0.84)** | 1 |
| harmonic profile H1–H12, median RMS error | 11.1 dB | 10.8 dB | 10.6 dB | — |
| harmonic-to-noise, model − recording | −0.3 dB | +2.6 dB | +1.6 dB | 0 |
| attack time, model/recording | 1.12 | 0.92 | 0.90 | 1 |
| pp → ff level spread | 10.6 dB | 13.0 dB | 11.4 dB | 12.5 dB |
| pitch, RMS over notes (matched vibrato) | 3.3 ¢ | 1.8 ¢ | 2.5 ¢ | — |
| notes the analyser could not read | 2 | 0 | 0 | 0 |
| vibrato depth / rate | 18.0 ¢ / 5.25 Hz | 16.4 ¢ / 5.25 Hz | 15.6 ¢ / 5.25 Hz | 16.8 ¢ / 5.4 Hz |

The calibration judge (`npx tsx scripts/judge.ts --instrument cello --before <engine>`), held-out
notes only (odd MIDI numbers, never used in a fit):

```
cello: before (af4f97e) → final: BETTER
  score (mean |error| / spread): fit 2.46 → 1.71 (n=35); held-out 2.68 → 1.91 (n=30, Δ 0.77 ± 0.15)
  harmonics  held-out |err| 12.32 → 11.73 (spread 6.50)
  centroid   held-out |err| 1.21 → 0.66 (spread 0.26)
  noise      held-out |err| 7.74 → 6.10 (spread 2.87)
  attack     held-out |err| 1.60 → 1.31 (spread 0.41)
  pitch      held-out |err| 2.61 → 1.59 (spread 14.11)
  level      held-out |err| 5.31 → 3.34 (spread 1.88)

cello: v2 (624c0bf) → final: NO CLEAR CHANGE
  score (mean |error| / spread): fit 1.99 → 1.64 (n=35); held-out 2.05 → 1.86 (n=32, Δ 0.19 ± 0.11)
  harmonics  held-out |err| 12.65 → 12.04 (spread 6.60)
  centroid   held-out |err| 0.96 → 0.67 (spread 0.28)
  noise      held-out |err| 6.01 → 5.80 (spread 2.88)
  attack     held-out |err| 1.28 → 1.39 (spread 0.45)
  pitch      held-out |err| 1.54 → 1.55 (spread 13.99)
  level      held-out |err| 3.82 → 3.52 (spread 1.93)
```

Against `af4f97e` every measure improves (the v2 model alone scored 2.09). Against `624c0bf` the
held-out score improves by 0.19, just under the two standard errors (0.22) BETTER needs; the
centroid, the problem this polish set out to fix, improves by a full spread, and no guard is
broken (attack +0.11 against a 0.23 limit). (The same `624c0bf` engine scores 2.05 here and 2.09
against `af4f97e`: the judge pairs only the notes both engines can read.)

## From the renders (`metrics.json`, dry)

The bowed string is chaotic, so a single render says little about rare events: one render of the
`624c0bf` phrase (the default seed), as the round reported, had 0 clicks, but 7 of 12 seeds have
some (21.7 per render on average, up to 65). The click and grain figures below are means over 12 renders per engine that differ only
in the cello's random seed (rosin noise, vibrato and bow wander, and the statistical body modes
above 240 Hz, i.e. statistically equivalent bodies).

* **Clicks** (2 ms frames of the 4–12 kHz band that stand > 10 dB above the 20 ms either side,
  left channel), per render:

  | piece | before (`af4f97e`) | v2 (`624c0bf`) | final |
  |---|---|---|---|
  | phrase (vibrato) | 23.8 | 21.7 | **2.5** |
  | sustained (vibrato) | 17.1 | 11.3 | **4.3** |
  | sustained-novib | 4.4 | 7.2 | **0.4** |
  | transitions | 1.8 | 0.2 | 0.6 |
  | bach-prelude | 0 | 0.3 | 0.9 |
  | all five | 47.0 | 40.5 | **8.8** |

  The worst click is 10–12 dB now (16–17 dB in the phrase before). Most of the v2 phrase clicks
  were in C3, the octave above the open C string, under vibrato. The few left in the Bach are at
  the open-G strokes that begin its bars; those in the transitions at the slurred G2↔D3 crossings
  and the ff D3's automatic bow change.
* **Grain, pitch-synchronously** (the > 6 kHz band in one-period frames over the steady part of
  each long note): no period stands 6 dB above its neighbours in any engine; the period-to-period
  roughness is 0.4–1.2 dB in all three (final: lower than `624c0bf` in the two sustained pieces,
  higher in the phrase, 0.84 → 1.19, and the transitions, 0.44 → 0.94). Energy between the harmonics at 3–8 kHz is higher after
  (e.g. −28 vs −33 dB without vibrato), mostly the fitted rosin noise, which the recordings ask
  for; it no longer isolates grain.
* **Pitch stability without vibrato** (fine track, 20 ms hop): G2 0.3 ¢ SD, A3 0.5 ¢, D4 0.3 ¢
  (`af4f97e`: 2–12 ¢); the ff D3 spans 64 ¢ only because it runs out of bow and changes direction
  mid-note (median absolute deviation 1.5 ¢).

## Listen notes (honest)

I cannot hear these files; the notes come from the spectrograms, the measures above and the
model's behaviour, and say what to listen for.

* **Before**: the mono spectrogram stops dead at ~3.5 kHz (the high band cancelled), and most of the
  energy sits below 1 kHz with a strong 150–200 Hz band: a muffled, boxy cello. In stereo the high
  band is there but out of phase between the ears.
* **After**: harmonics continue up to 6–8 kHz and fall off like the recording's; the 150–200 Hz box
  is gone; the low strings are darker than the A string, as on the instrument. Octaves above open
  strings (C3, G3, D4) speak at the same level as their neighbours. In the phrase the C3 under
  vibrato now draws clean, separate harmonic lines where `624c0bf` smeared noise between them;
  the gaps between notes are cleaner (the stopped strings lose their highs faster). Soft notes
  start more slowly.
* **Listen for** (remaining): pp is still brighter than the recording (centroid ×1.6); a faint
  click can remain at the start of an open-G stroke in the Bach, at a slurred crossing, and at the
  ff D3's automatic bow change.

## Remaining limitations

* **pp is still too bright**, though much less: centroid ×1.59 at pp, ×1.01 at mf, ×0.84 at ff
  (was ×2.02 / ×1.10 / ×0.68). Most pp notes now hold Helmholtz motion; what remains is mostly
  the bow–bridge ripple of a pp bow placed far from the bridge (β ≈ 0.13), a formant near harmonic
  1/β ≈ 7–8 that lifts harmonics 6–12 by 5–10 dB above a sawtooth on the A string, where the contact is only 1.5–2 samples
  wide. In the model the pp tone is still ~1.2× brighter than its ff (`cello.test.ts`); in the
  recording it is ~1.6× darker. A ribbon with its own stick/slip state across the width
  (Pitteroff & Woodhouse's differential slipping) or 2× oversampling of the string are the next
  physical steps; neither was done.
* **Vibrato grain is mostly, not entirely, gone**: clicks under vibrato fell by 60–90 %, but a few
  per render remain, and rare ones are more frequent at stroke starts and crossings (Bach 0.3 →
  0.9, transitions 0.2 → 0.6 per render).
* **Sample rate**: the soft tone of G2 and D3 still differs by 0.5–0.7 octave of centroid between
  44.1 and 96 kHz (other notes ≤ 0.1); one suspect is the rosin noise's low-pass, which is set per
  sample (shared with the violin and viola, so not changed).
* **Pitch RMS rose from 1.8 to 2.5 ¢** with the heavier bow (the flattening effect); still small.
* **Per-note harmonic profiles** still differ by ~11 dB RMS from the Strad's: the body above the
  five signature modes is statistical, not that instrument's.
* **Fitted, not measured**: the idle-string coupling (0.306), the torsional Q (2.9, below the
  published 15–50 because it also stands in for the hair's compliance), the contact width and the
  rosin noise level (both within physical ranges, but fitted).
* The second bridge resonance acts as a roll-off (2.7 kHz, Q 0.58), not a distinct resonance.
* Violin and viola keep the round-2 chain and the point bow (bit-identical); they would likely gain
  from the same changes.
