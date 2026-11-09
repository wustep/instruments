# Cello audio, round 2: before / after

The same passages through the engine at `6a919e5` (`*-before.mp3`, the cello as round 1 left it)
and this round's cello (`*-after.mp3`). Each file is peak-normalised to −1 dBFS, with the site's
room (0.32), 48 kHz, 128 kbps. Each `<piece>.png` is a spectrogram (0–8 kHz, linear, 80 dB, mono
sum): **before on top, after below**. Level differences are in the metrics, not in the files.
Rendered with

    npx tsx scripts/render-cello.ts --seeds 12 --before <6a919e5>/packages/engine/src/core/index.ts --out artifacts/realistic-3d/final-r2/cello-audio

| piece | what it plays |
|---|---|
| `phrase` | C3 E3 G3 C4 B3 A3 G3, vibrato 17 ¢ |
| `bach-prelude` | Bach, Suite No. 1, Prelude, bars 1–4: crossings over G–D–A, slurs of four |
| `sustained` | long tones with vibrato: C2 pp, G2 mf, D3 ff, A3 mf, E4 ff, A4 pp |
| `sustained-novib` | G2 mf, D3 ff, A3 mf, D4 mf, no vibrato |
| `transitions` | legato D3–A3, slurred G2↔D3 crossings, détaché G3s, a long ff D3 with bow changes |

Violin, viola, flute, trumpet, grand and upright are unchanged sample for sample: 24 of 24 cases
(44.1 and 48 kHz, dry and with the room) against `6a919e5`, and `golden.test.ts` passes for them
without re-blessing. Only `test/golden/cello.json` was re-blessed.

## The numbers

Against the Iowa MIS cello (67 notes, pp/mf/ff, matched vibrato; `scripts/cello-diag.ts`). The
first column pair is the calibration's own render (the cello's default seed). The model is
chaotic and seeded (rosin noise, vibrato and bow wander, the statistical body), so the second pair
is the mean ± SD over 8 seeds.

| measure | before | after | before, 8 seeds | after, 8 seeds |
|---|---|---|---|---|
| pitch RMS over notes | 2.46 ¢ | 2.47 ¢ | 2.24 ± 0.52 ¢ | **1.87 ± 0.51 ¢** |
| centroid ratio, pp | ×1.59 | **×1.35** | ×1.63 ± 0.14 | **×1.39 ± 0.19** |
| centroid ratio, mf | ×1.01 | ×1.05 | ×1.09 ± 0.13 | ×1.05 ± 0.06 |
| centroid ratio, ff | ×0.84 | ×0.76 | ×0.88 ± 0.09 | ×0.83 ± 0.09 |
| ⅓-octave RMS error | 4.33 dB | **4.20 dB** | 4.54 ± 0.22 dB | 4.42 ± 0.19 dB |
| harmonic-to-noise, model − recording | +1.62 dB | **+0.18 dB** | +1.75 ± 0.71 dB | **+0.39 ± 0.55 dB** |
| harmonic profile H1–H12, median RMS error | 10.64 dB | 11.15 dB | 11.44 ± 0.94 dB | 11.57 ± 0.85 dB |
| attack time, model / recording | 0.90 | 0.93 | 0.88 ± 0.08 | 0.96 ± 0.15 |
| pp → ff level spread (recording 12.5 dB) | 11.4 dB | 14.3 dB | | |

From the renders (`metrics.json`, dry; clicks are the mean over 12 seeds per piece):

| measure | before | after |
|---|---|---|
| clicks, phrase | 2.50 | 2.00 |
| clicks, bach-prelude | 0.92 | 1.17 |
| clicks, sustained | 4.33 | 7.42 |
| clicks, sustained-novib | 0.42 | 0.33 |
| clicks, transitions | 0.58 | 0.58 |
| **clicks, all five pieces** | **8.75** | **11.50** |
| renders with any click (of 60) | 18 | 15 |
| largest single render | 29 | 73 |
| pitch without vibrato (G2, D3, A3, D4), offset | +1.5, −2, 0, −0.5 ¢ | +2.5, 0, +1.5, 0 ¢ |

**Sample rate** (the soft tone of G2 and D3 changed between 44.1 and 96 kHz). Power centroid
below 10 kHz of the steady part, no vibrato (as in `cello.test.ts`):

| note | before, 44.1 → 96 kHz | after, 44.1 → 96 kHz |
|---|---|---|
| G2 pp | 485 → 785 Hz (+0.69 oct) | 442 → 478 Hz (**+0.11 oct**) |
| D3 pp | 939 → 1343 Hz (+0.52 oct) | 774 → 844 Hz (**+0.13 oct**) |
| A3 pp | 1520 → 1540 Hz (+0.02 oct) | 869 → 858 Hz (−0.02 oct) |
| G2 / D3 / A3 mf | +0.15 / +0.11 / +0.04 oct | +0.10 / +0.11 / −0.04 oct |
| G2 / D3 / A3 ff | +0.07 / +0.12 / 0.00 oct | +0.08 / +0.14 / +0.09 oct |

Over all 67 calibration notes (third-octave centroid ≤ 10 kHz, no vibrato): mean |Δ| 0.207 →
**0.118 octave**, median 0.141 → 0.068, notes more than 0.25 octave apart 17 → 6.

**Judge** (`npx tsx scripts/judge.ts --instrument cello --before <6a919e5>`, held-out odd-MIDI notes):

```
cello: before (6a919e5) → after: NO CLEAR CHANGE
  score (mean |error| / spread): fit 1.64 → 1.75 (n=35); held-out 1.86 → 1.85 (n=32, Δ 0.01 ± 0.06)
  harmonics  held-out |err| 12.04 → 11.40 (spread 6.60)
  centroid   held-out |err| 0.67 → 0.68 (spread 0.28)
  noise      held-out |err| 5.80 → 5.56 (spread 2.88)
  attack     held-out |err| 1.39 → 1.44 (spread 0.45)
  pitch      held-out |err| 1.55 → 1.51 (spread 13.99)
  level      held-out |err| 3.52 → 3.50 (spread 1.93)
```

No guard is broken. (Before vs before, as a check of the tool: NO CLEAR CHANGE, Δ 0.00 ± 0.00.)
The fit half's score is worse (1.64 → 1.75) although the refit optimised the fit half: the fit's
best point on a chaotic, single-seed objective is optimistic, and the pitch weighting and the
intonation by ear came after it. The kept change rests on NO CLEAR CHANGE plus clear wins on the
targeted measures (pp brightness, the sample rate, harmonic-to-noise), not on BETTER.

## What I found

1. **The pp notes were not in Helmholtz motion.** A slip counter that also measures each slip's
   length showed the soft A, D and G-string notes slipping once per period, but for only 0.7–0.8 of
   the bow–bridge round trip βT. A ripple trapped between the stuck bow and a nearly rigid bridge
   (period βT, decaying about 1 % per cycle) ended the slip early. The bridge force then carried a
   formant at harmonic 1/β ≈ 7.6, up to 20 dB above a sawtooth. That formant was most of pp's
   brightness. It is a stable state: gliding a clean ff note down to the pp bowing ends there too.
   With lower force the same notes broke into two slips per period instead.
2. **The sample rate picked the state.** The soft G2 and D3 have several stable motions (the same
   parameters end clean, short-slipped or double-slipped depending on the attack). Small per-sample
   differences sent 96 kHz into double slipping (+0.5–0.7 octave of centroid). The per-sample
   constants (the loop's glide, the rosin noise's low-pass and level, the torsional loss filter) and
   the rounded torsional bow position also moved with the rate. The string's loss filter did not:
   its T60 matches to 20 kHz at both rates.
3. **The pitch RMS did not really rise last round.** Over 8 seeds the round-1 v2 engine
   (`624c0bf`) scores 2.45 ± 0.67 ¢, and `6a919e5` scores 2.24 ± 0.52 ¢. The 1.8 ¢ was a lucky seed.
   Without vibrato the pitch was already within 0.9 ¢ RMS. Most of the RMS comes from how the
   analysis reads vibrato. Each frame takes the strongest of harmonics 1–4. When a harmonic sweeps
   across a body resonance, the frames that pick it are biased; for C♯2, k = 3 frames read −8.5 ¢
   and k = 4 frames +3.5 ¢. The tone's true mean pitch (unwrapped phase) was within ~1 ¢ at pp and
   mf. That bias is not a pitch error the model can fix honestly.
4. **Most "clicks" are not at bow changes.** In both engines they come in episodes: one note in one
   seed enters an intermittent double slip under vibrato or after a pp attack, and it clicks every
   period for a second. The same detector on the Iowa cello recordings finds 0.16 clicks per second
   of note (98 in 619 s, most at ff). The five pieces (56.6 s) give 0.155/s before and 0.20/s after.

## What changed (cello only; all in `packages/engine/src/core/bowed.ts`, gated on cello design fields)

1. **The bridge hill in the admittance the strings see** (`bridgeMass`, fitted 2.2 g). This is the
   main change. The bridge's rocking resonance already shaped the force reaching the body
   (`radiation.bridge[0]`, now refitted to 949 Hz, Q 1.9). It is now also a heavily damped,
   non-radiating mode at the string notch, so the input admittance rises into a resistive hill
   around it (Woodhouse 2005, "On the 'bridge hill' of the violin"; Reinicke 1973 for the cello
   bridge).

   The strings lose energy into it in the 0.5–2.5 kHz band where the bow–bridge ripple rings. The
   soft notes now hold slips of βT, and the bridge force shows Schelleng's dips at n/β instead of
   peaks. The upper harmonics now follow the bow force: at ff the bridge force stays near a sawtooth
   to the 16th harmonic, while at pp it falls 10–40 dB below it.
2. **Rate-invariant constants** (`rateInvariant`). The round-1 per-sample fractions are now time
   constants with their 44.1 kHz values: the loop glide (τ 1.1 ms), the rosin noise's one-pole
   (585 Hz) with its level held, and the torsional loss pole (τ 16 µs). The bow taps the torsional
   waves at its exact, fractional place (linear weights, transposed for the write, so the junction
   stays passive). This change alone is NO CLEAR CHANGE at 44.1 kHz (held-out 1.86 → 1.85).
3. **Intonation by ear** (`byEar`, τ 0.3 s). A cellist moves the finger until the note sounds in
   tune. The stopped string's period is measured slip to slip once the stroke has settled (bow near
   its speed, consecutive periods within 2 %). The finger then follows the error against the
   intended pitch, vibrato included, with a time constant a few times the 0.1–0.2 s latency of
   auditory pitch correction (Burnett et al. 1998). Open strings stay as tuned. Without vibrato,
   the fit half's notes at pp/mf/ff read 0.91 → 0.60 ¢ RMS, open strings included; most stopped
   notes are within 0.3 ¢, and two ff notes are still 1–2 ¢ flat.
4. **Pitch weighting for open strings** (`tuneWeight`, fitted 0.85). With the bridge hill, the 1/k
   phase sum made open strings 2–4 ¢ sharp. The weights are now 1/k^0.85, fitted on the fit half's
   open C2 and D3 (RMS 1.46 → 1.27 ¢). On the held-out G2 and A3 it gives 2.81 → 2.13 ¢.
5. **The bow change keeps the weight under Schelleng's maximum for the moment's speed**
   (`forceWithSpeed`, extended). Each change restarts the Helmholtz motion, as an attack does
   (Guettler 2002). Before, the force was eased by 18 % at the turn whatever the speed.
6. **Refit** (`scripts/fit-cello.ts --free hfG,hfF,hill,hillF,low,gain,bm,fPp,fFf,b1f,b1q --rate 96000`,
   even-MIDI half). The new `--rate` option renders each fit note at 96 kHz too and scores the
   centroid change as a seventh measure. Results:
   * the bridge hill's mass: 2.23 g;
   * the bridge resonance: 839 Hz Q 0.85 → 949 Hz Q 1.9;
   * the force multiplier: ×1.36/×1.82 → **×1.08 at pp, ×2.2 at ff**;
   * the hill EQ: −2.3 dB at 1.6 kHz → −0.8 dB at 1.44 kHz;
   * the low shelf: +6.2 → +2.9 dB;
   * the high-frequency path: 0.037 above 6.5 kHz → 0.016 above 5.8 kHz.

   Everything else keeps round 1's values.

   A first, unrestricted 34-parameter refit was tried and **rejected**. It scored NO CLEAR CHANGE
   (1.86 → 1.82), but over 6 seeds it worsened pp (×1.69), HNR (+3.2 dB) and pitch (3.6 ± 2.0 ¢).
   It had moved the idle-string coupling to 0.84, and open strings then pull the pitch.

Tried and not kept:
* an attack force capped below Schelleng's maximum (0.65 and 0.8 of it): no faster settling, and
  worse at ff;
* a player who adds weight when he hears double slipping: it cured the C2 pp episode but raised the
  share of non-Helmholtz periods at pp and mf;
* splitting the torsional loss between the nut and the bridge: more ripple-locked notes;
* friction-curve variants (v0 0.1–1.0 m/s, μs, μd): the pp state did not move.

New tests:
* `cello.test.ts`: G2, D3 and A3 pp within 0.2 octave of centroid between 44.1 and 96 kHz.
* The pp/ff test is tightened from < 0.45 to < 0.2 (it now reads −0.02; before +0.26).
* `controllers.test.ts` is back to its 1.1 margin (the default seed reads 1.12; before 1.08).

## Listening notes

I can't hear these files. The notes below come from the spectrograms and the measures.

* `sustained`: the closing A4 pp is visibly darker after; its upper harmonics above the 7th no
  longer stand out. C2 pp still starts with a short raucous patch in the default seed.
* The pp notes all through should sound rounder and less glassy; ff is a little darker than before.
* `phrase` and `transitions` click about as often as before. One `sustained` render (C2 pp in one
  of 12 seeds) clicks every period for over a second, and that render holds most of the click
  total.

## Still open

* **pp is still too bright: ×1.35–1.39, not 1.0–1.2.** The model now has no wrong-way dynamics
  (pp no brighter than ff), but it lacks most of the recording's darkening. For the same note, ff
  is 1.0–2.7× the pp centroid in the recording (median ~1.6) and 0.8–1.1× in the model. The bridge
  force does darken at pp above the 8th harmonic, but the radiated centroid is carried by harmonics
  2–6, which stay sawtooth-like at every dynamic. The recording's pp rolls off from the 2nd–3rd
  harmonic: a corner far rounder than this friction model makes at low force. The next physical
  steps would be a thermal (rosin-temperature) friction law (Smith & Woodhouse 2000; Woodhouse 2003)
  or a ribbon with differential slipping (Pitteroff & Woodhouse 1998). Neither was done.
* **ff is darker** (×0.84 → ×0.76 on the default seed, ×0.83 over 8 seeds), the price of the refit
  balancing pp against ff with a chain that brightens every dynamic alike.
* **Clicks: not fixed.** 8.75 → 11.5 per set of five renders, within the episode noise: fewer
  renders click (18 → 15 of 60), but one episode is larger. Soft attacks still take ~0.3 s to reach
  Helmholtz motion (median, pp), and ~10 % of steady pp periods are not Helmholtz.
* **Pitch RMS: 1.87 ± 0.51 ¢ over 8 seeds, but 2.47 ¢ on the default seed** (the number the
  calibration prints). The rest is the analysis's vibrato bias, which seeds move by ±0.5 ¢.
* The harmonic profile error grew a little (10.6 → 11.2 dB, default seed), and the level spread now
  overshoots (14.3 dB against 12.5).
* Fitted, not measured: the bridge-hill mass (2.2 g), the pitch weighting (0.85) and the time
  constant of intonation by ear (0.3 s, chosen from the literature's latency, not fitted).
