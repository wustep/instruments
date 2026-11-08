# Calibration log

## How calibration works

**Reference.**
- **Source:** University of Iowa MIS, Steinway & Sons model B, 2001.
- **Microphones:** two KM 84s, 8″ above the bass and treble strings.
- **Format and gain:** 16/44.1, with input gain fixed across dynamics.
- **Notes used:** 23 keys (every 4th key from A0, plus C8) at pp, mf and ff, 67 files.
- **Storage:** downloaded on demand into `.cache/iowa` (gitignored) with `pnpm refs:fetch`.
- **Use:** the recordings are only analysed. The model never plays them back.

**Analysis.** `packages/engine/src/analysis/note.ts` runs identically on the
reference and on dry model renders (44.1 kHz, same keys, pp/mf/ff → MIDI velocity
30/70/112, key held). It measures:
- **Partials and tuning:** partial frequencies, from which stiff-string f₀ and B
  are fitted, plus partial 1 in cents versus equal temperament.
- **Decay:** per-partial decay by Schroeder backward integration with noise-floor
  subtraction. EDT (0 → −10 dB) gives the prompt T60; the −15 → −35 dB span
  gives the late (aftersound) T60.
- **Spectrum:** partial levels 60–160 ms after onset, third-octave spectrum of the
  first second, and a noise-floor estimate from the recording tail.
- **Level and attack:** RMS level, peak level and 10–90 % attack time.

**Metrics reported per round** (`pnpm calibrate`, history in `docs/calibration-rounds.json`):
- **Tuning:** RMS of model minus reference stretch, in cents. The reference
  piano's global offset is removed: it sits +4.9 ¢ sharp of A440.
- **Inharmonicity:** RMS of log₁₀(B_model / B_ref).
- **Decay by register:** median model/reference T60 ratio over partials 1–3, for
  the early and late slopes. Single-note comparisons are not meaningful, because
  even neighbouring reference notes differ 10× in EDT.
- **Level error:** RMS level error per dynamic after one global gain set at mf.
- **Spectrum:** third-octave spectral error at mf, only in bands ≥ 12 dB above
  the recording's noise floor. Above ~4 kHz the reference is mostly hiss.
- **Brightness contrast:** the slope of the ff − pp partial-level gain against
  partial number (dB per partial), model minus reference.

**Fitting** (`pnpm calibrate --fit` → `packages/engine/src/core/calibration-fit.json`):
- **B curve:** the two-asymptote model of Rigaud et al. 2013, fitted by Nelder–Mead.
- **Everything else:** damped (×0.7), bounded (≤ ×2 per step) multiplicative
  corrections at register breakpoints:
  - intrinsic loss (late T60 of partials 1–2 and 3–4);
  - bridge admittance (prompt T60);
  - felt exponent (brightness contrast);
  - hammer velocity range (pp/ff level);
  - register voicing (level at mf, smoothed, ±6 dB);
  - output EQ (third-octave difference).

## Round 1 (literature defaults → fitted)

| # | change | tuning ¢ RMS | B log₁₀ RMS | T60 early model/ref (A0–B1, C2–B3, C4–B5, C6–C8) | T60 late model/ref | level err dB pp/mf/ff | ⅓-oct err dB | brightness contrast err dB/partial |
|---|---|---|---|---|---|---|---|---|
| 0 | literature defaults (+ hammer-position fix) | 18.1* | 0.092 | median 0.73 | median 0.68 | 10.1 / 5.1 / 4.3 | 6.6 | – |
| 1 | Schroeder decay metrics; B fitted | 18.2* | 0.056 | median 0.28 | median 0.74 | 10.1 / 5.1 / 4.3 | 6.2 | – |
| 2–5 | first unbounded fit iterations | 17.7* | 0.060 | median 0.70 | median 1.09 | 8.4 / 3.9 / 4.7 | 5.3 | – |
| 6–8 | register-binned decay metric, contrast-slope felt fit | 18.0* | 0.059 | 0.71, 3.47, 1.56, 0.84 | 0.59, 0.80, 1.14, 1.36 | 8.0 / 4.1 / 5.1 | 4.6 | 4.1 (−0.7) |
| 9 | reset; two-point loss filter design; board modal mass ×2 | 18.1* | 0.060 | 0.24, 0.66, 0.25, 0.31 | 0.21, 0.49, 0.45, 0.53 | 10.1 / 4.9 / 4.2 | 5.6 | 4.0 (−0.9) |
| 10–15 | bounded fit (6 iterations) | 18.1* | 0.057 | 1.08, 2.54, 1.36, 0.60 | 0.80, 0.71, 1.09, 1.02 | 8.2 / 4.4 / 5.6 | 5.5 | 3.5 (−0.3) |
| 16–20 | per-zone board coupling; fixed HF radiation mobility | 18.2* | 0.070 | 1.17, 2.60, 1.26, 0.61 | 0.68, 0.82, 1.15, 1.05 | 8.3 / 4.5 / 5.7 | 4.9 | 3.7 (+0.1) |
| 21–24 | radiation corner 140 → 70 Hz; HF crossover 4th-order 1.2 kHz → 2nd-order 700 Hz | 18.1* | 0.068 | 1.16, 2.58, 1.22, 0.61 | 0.68, 0.91, 1.17, 0.98 | 8.0 / 4.2 / 5.5 | 3.3 | 4.6 (−0.7) |
| 25–26 | final: smoothed, clamped voicing; tuning metric excludes analysis failures* | **4.1** | **0.070** | **1.16, 2.57, 1.22, 0.66** | **0.68, 0.93, 1.18, 1.21** | **9.4 / 5.2 / 5.2** | **4.4** | **4.6 (−0.8)** |

\* The tuning metric before row 25 was dominated by two analysis failures. The
reference A0 partial fit returns +82 ¢, and the model's B fails at C♯7, where only
two partials are detectable. From row 25 these keys are excluded (fit residual
> 3 ¢ or < 4 partials). The model's tuning did not change; the stretch was already
within a few cents.

### What each step taught us

1. **Hammer position bug.** The hammer tap was placed as a fraction of the delay
   line, but in the bass the dispersion filter holds a large share of the loop
   delay. The strike-position comb was therefore in the wrong place: the
   reference shows the expected weak 8th partial for β ≈ 1/8. Fixed by placing
   the tap at β·(fs/f₁)/2 from the agraffe.
2. **Most of the "missing high frequencies" is the reference's noise floor.**
   Comparisons now only use bands ≥ 12 dB above the floor.
3. **Single-note decay comparison is meaningless.** The reference's EDT jumps
   between 1.4 s and 19 s on neighbouring keys, because some partials sit on
   soundboard resonances. Register medians are stable.
4. **An unbounded fit runs away** on any lever the metric is insensitive to
   (intrinsic T60 of C4 → 564 s). Sweeps (`scripts/sweep.ts`) showed that:
   - at C♯4 the late decay is controlled by **soundboard coupling**, not string loss;
   - unison detune and hammer imbalance matter much less than expected.
5. **The one-pole least-squares loss fit was broken for steep σ(f).** It left C4's
   fundamental almost lossless (131 s). It was replaced by an exact two-point
   design: partial 1 plus a high reference partial.
6. **Decay and loudness had to be decoupled.** The HF radiation path had been
   scaled by the loss-calibrated bridge admittance, so lowering admittance for
   longer decay also starved 1–1.6 kHz. It now uses a fixed radiation mobility.

### Where round 1 leaves the model

* **Inharmonicity:** within ≈ 17 % RMS of the measured B across the compass.
* **Stretch tuning:** within 4 ¢ RMS of the reference piano's stretch.
* **Decay, C4–C8:** within ×1.2 of the reference for both slopes.
* **Decay, bass and tenor.** Three problems remain:
  * The A0–B1 aftersound is ×0.68 too short, even with intrinsic string T60 at its
    120 s clamp.
  * The C2–B3 prompt decay is **×2.6 too slow**.
  * The C6–C8 prompt decay is ×0.66 too fast.
  * The bass and tenor share one bridge-admittance lever per region, which cannot
    fix the prompt and late slopes at once. A second string polarisation (not
    modelled) is the physical mechanism most likely missing.
* **Loudness:** ≈ 5 dB RMS per note at mf and ff, 9 dB at pp. The reference pp
  notes themselves vary by ±10 dB, being single human performances.
* **Brightness:** the model brightens less from pp to ff than the Steinway, by
  ≈ 0.8 dB per partial. The felt exponent is near its plausible upper bound in the
  bass. Velocity-dependent felt stiffness (Stulov's relaxation) would help.

## Round 2 (horizontal polarisation)

Round 1 left the tenor's prompt decay ×2.6 too slow while its aftersound was
right. One bridge admittance per register cannot set both slopes. Each struck
string now has a horizontal twin waveguide:
- coupled to the bridge through a transformer ratio κ = 0.32 (0.25 at C6, none
  above), so it loses energy to the board about 10× more slowly;
- excited by 20 % of the hammer force (the felt never pushes perfectly
  vertically);
- detuned by ±0.3 ¢.

It is the mechanism Weinreich (1977) identified alongside unison coupling, and
the only source of double decay for the bass unichords. Sweeps
(`scripts/sweep.ts pol`) showed it was the first lever to move the tenor without
breaking the other registers; three bounded fit iterations followed.

| # | change | tuning ¢ RMS | B log₁₀ RMS | T60 early model/ref (A0–B1, C2–B3, C4–B5, C6–C8) | T60 late model/ref | level err dB pp/mf/ff | ⅓-oct err dB |
|---|---|---|---|---|---|---|---|
| R9 | round-1 final | 4.1 | 0.070 | 1.16, 2.57, 1.22, 0.66 | 0.68, 0.93, 1.18, 1.21 | 9.4 / 5.2 / 5.2 | 4.4 |
| R10 | polarisation κ 0.32, fit iteration 3 | **3.8** | **0.063** | **1.14, 2.17, 0.81, 0.60** | **0.68, 0.95, 1.35, 0.98** | **8.0 / 4.4 / 5.2** | **4.5** |

Net effect:
* The tenor's prompt-decay error fell from ×2.57 to ×2.17.
* The middle register is now slightly fast early (×0.81) and long late (×1.35)
  instead of the reverse.
* The bass aftersound is unchanged at ×0.68. Its loss is dominated by the
  soundboard modes near the bass bridge.

The piano work stops here for this pass (see the README's limitations). Next steps
would be:
* zone-specific modal damping instead of a single loss-factor curve;
* a measured, per-key bridge admittance;
* a velocity-dependent felt law (Stulov) for the brightness range.
