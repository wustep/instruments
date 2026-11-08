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

## Round 2 (2026-11): bridge-aware decay fit, unison beat rate

The round-2 audit (`pnpm calibrate --table`, 41 s) found the tenor's prompt
decay error ×2.17 concentrated on the **bass-bridge bichords C♯2–A2**:
- their partials 2–4 had almost no prompt decay (model EDT 46–75 s, reference 1–8 s);
- the fit had driven the bass-bridge admittance down to 6.6e-5 s/kg;
- its ±8-key windows straddled the bass/treble bridge break, so keys on the
  treble bridge were steering the last bass-bridge breakpoint.

Separately, the treble breakpoints sat at the 1e-5 floor while the top octave
still decayed ×0.6 too fast, so something other than the bridge was draining
it.

Sweeps (`scripts/sweep2.ts`, a JSON list of calibration/design patches, per-key
and register medians) showed:

* **Bichords (C♯2–A2):** the prompt decay follows the bridge admittance while
  the aftersound barely moves (Weinreich: the anti-phase unison mode is
  protected).
* **Unichords (A0–F♯1):** both slopes scale with the admittance, and the weakly
  coupled horizontal polarisation (κ 0.12–0.32) changes nothing measurable.
* **Treble (C6–C8):**
  * with the unisons tuned exactly, the register median is ×0.94 / ×0.99 —
    the model's fast "prompt decay" up there was **unison beating** at 2–3 Hz;
  * the cause is a constant cents spread: 1 ¢ at 4 kHz is 2.3 Hz;
  * tuners set unisons by beat rate, so the spread is now scaled by
    `min(1, 500 Hz / f₁)`, which keeps the outer strings within about 0.3 Hz
    (`PianoDesign.unisonBeatCapHz`; the honky-tonk preset keeps a constant
    cents spread).

Fit changes:
* **Admittance breakpoints by bridge segment.** They are now
  21/30 (unichords), 31/45 (bass-bridge bichords) and 46…108 (treble bridge).
  Each learns only from keys on its own segment, using partials 1–3.
* **Zero-mean EQ updates.** An EQ update moving every band one way is the
  output gain's job; without this, EQ and gain drifted into the ±12 dB clamps
  within three iterations.
* **`--decay-only` mode.** It updates only the string losses, the bridge
  admittance and the global gain.
* **Contrast metric.** The pp→ff contrast slope now skips partials not found
  (< −98 dB) on either side, not just on the reference side. One C♯1 outlier
  had read −51 dB/partial. The baseline value is identical under both
  definitions (4.27 vs 4.28).

Iterations: four decay-only fits, then one full fit. The state reported is
the one measured after those five; two further full fits oscillated
(±0.5 dB in level and spectrum on noisy single-performance targets) and were
not kept.

| # | change | tuning ¢ RMS | B log₁₀ RMS | T60 early model/ref (A0–B1, C2–B3, C4–B5, C6–C8) | T60 late model/ref | per-partial log₂ RMS early / late | level err dB pp/mf/ff | ⅓-oct err dB | brightness contrast err dB/partial (bias) |
|---|---|---|---|---|---|---|---|---|---|
| R10 | round-1/2 final (baseline, 6812c18) | 3.79 | 0.063 | 1.14, 2.17, 0.81, 0.60 | 0.68, 0.95, 1.35, 0.98 | 1.72 / 0.67 | 8.0 / 4.4 / 5.2 | 4.54 | 4.28 (+0.46) |
| R11 | bridge-segment fit, 500 Hz beat cap (7e05885) | 4.10 | 0.068 | **1.00, 1.14, 0.93, 0.90** | **0.67, 0.95, 1.11, 1.03** | **1.21** / 0.82 | 8.3 / 4.7 / 5.4 | 4.64 | **2.13 (−0.40)** |

**What improved:**
* every register's prompt decay is now within ×0.90–1.14;
* the tenor gained most (×2.17 → ×1.14) and the top octave went from ×0.60 to ×0.90;
* the per-partial early-decay error fell by 30 %;
* the brightness-contrast error halved.

**What got slightly worse:**
* tuning, by 0.3 ¢ (the mid-register partial-1 frequencies moved about 2 ¢
  with the changed unison coupling);
* the per-partial late-decay spread;
* level at mf and ff, by 0.2–0.3 dB.

**What is unchanged:** the bass aftersound (×0.67).

The felt-relaxation (Stulov) item on the round-2 plan was not implemented:
after this fit the remaining pp→ff contrast bias is −0.4 dB/partial, smaller
than the per-note scatter of the reference.

## Strings and flute against recordings (round 2)

**Reference.** University of Iowa MIS pre-2012 sets, recorded in an anechoic
chamber with a Neumann KM 84 at about 5 ft, 16/44.1 mono:
- violin;
- viola (1996);
- cello (Stradivarius 1736, 2001);
- flute, non-vibrato (2000).

All are at pp, mf and ff. `scripts/ensemble-refs.ts` downloads 56 files on
demand into `.cache/iowa-ens` (gitignored, ~500 MB) and segments each
chromatic run into notes (envelope gate plus harmonic-sum pitch
identification). It keeps only the notes the model plays on the same string
(first position), giving 333 notes:
- violin 79;
- viola 78;
- cello 64;
- flute 109 (C4–C7).

The recordings are analysed, never played or shipped.

**Analysis.** `analyzeSustained`, unit-tested on synthetic signals, works on
the steady part of each note (25 %…85 %). It measures:
- the harmonic band levels H1–H16 (median over frames), relative to the
  strongest;
- the even/odd power ratio, k ≤ 10;
- the harmonic-to-noise ratio (±0.15 f₀ around each harmonic vs the
  inter-harmonic bands, k ≤ 8);
- the third-octave long-term spectrum and centroid;
- the 10–90 % attack;
- vibrato rate and depth from a 10 ms f₀ track;
- RMS level.

`scripts/calibrate-ensemble.ts` renders the same notes with the model:
- dry, at 44.1 kHz;
- velocity 30 / 70 / 112 for pp / mf / ff;
- held 2.6 s;
- **without vibrato where the player used none**.

It then analyses both sides identically and logs to
`docs/ensemble-rounds.json`. Matching the vibrato matters: model vibrato on a
non-vibrato reference moves the measured HNR by 4–12 dB and the harmonic
levels by up to 10 dB. The rounds before R2-5 were measured without it and are
labelled so; the baseline was re-measured on the round-1 engine (6812c18) with
the matched method.

**Metrics:**
- **Harmonic-profile error:** the median over notes of the per-note RMS of the
  H1–H12 difference, using harmonics within 45 dB of the strongest.
- **Spectrum:** the RMS of the third-octave difference between pooled,
  normalised long-term spectra (100 Hz–10 kHz, bands within 45 dB of the
  reference peak).
- **Even/odd and HNR:** median differences, model minus recording.
- **Dynamic spread:** median ff minus median pp level.

| instrument | harmonic err dB | spectrum err dB | centroid ratio | HNR diff dB | pp→ff spread dB | even/odd err dB | pitch ¢ RMS | attack ratio |
|---|---|---|---|---|---|---|---|---|
| violin | 12.08 → **11.39** | 17.45 → **14.74** | 0.65 → **0.76** | +4.35 → **−1.62** | 12.49 → **20.67** (rec. 19.14) | −2.03 → −1.18 | 2.58 → 2.58 | 0.25 → 0.20 |
| viola | 11.06 → 10.89 | 14.17 → **10.73** | 0.63 → **0.91** | +1.83 → −1.93 | 11.24 → **8.15** (rec. 9.86) | −3.58 → −3.28 | 2.12 → 1.65 | 0.31 → 0.49 |
| cello | 13.14 → 13.00 | 20.82 → **16.16** | 0.60 → **0.70** | −0.85 → *−5.24* | 11.62 → 10.87 (rec. 12.48) | +0.32 → +0.52 | 2.78 → *3.69* | 0.72 → 0.94 |
| flute | 8.74 → **7.08** | 8.15 → **4.51** | 0.91 → **0.97** | +21.63 → **+5.28** | 5.14 → **10.49** (rec. 12.55) | −15.1 → **−5.16** | 0.82 → 0.92 | 0.92 → *1.67* |

Before = round-1 engine and after = R2-5 final, both measured with the
matched method. Italics mark regressions.

### Flute

The jet saturated into a near-square wave at about 50 % duty cycle, so the
offset made almost no even harmonics: the model's even/odd balance was −30 dB,
against −4…−19 dB in the recordings. Changes:
- **Vortex-shedding loss.** A passive loss at the labium: the reflection
  R/(1 + γ|y|) weakens with amplitude.
- **Monopole radiation.** Both openings radiate as the time derivative of
  their volume flow.
- **Explicit voicing.** `FLUTE_VOICE` holds the jet gain, the jet offset by
  register, the vortex loss, the jet receptivity, the radiation, the breath
  noise and the velocity→flow/pressure map (pressure may only rise with
  loudness).

`scripts/fit-flute.ts` fits these parameters with a (1+λ) evolution strategy
to per-register × per-dynamic medians:
- H1–H8;
- even/odd balance;
- HNR;
- level spread and register balance.

Penalties enforce pitch (±35 ¢ before the tuning table) and the octave
overblow at 2.5× breath. The top notes then needed a lip-opening gain ramp
(×1.5 at C7). The tuning table was re-measured, and all 37 notes are within
1.2 ¢ at 44.1 and 48 kHz.

The even/odd balance by register (C4–B4, C5–B5, C6–C7) was −30 / −28 / −22 dB
in the model, and is now −12 / −14 / −20 dB. The recordings measure −4 / −12 /
−19 dB.

**Remaining gap.** At mf and ff in the low register the recording's H2 is
about as strong as H1, and the model stays about 10 dB short. The attack also
got slower (×1.7), set by the oscillation's lower small-signal gain rather
than the breath envelope.

### Violin, viola, cello

The bodies' radiation was missing above the modal range: model spectra fell
20–40 dB below the recordings above about 3 kHz. The low-string fundamentals
were also about 10 dB weak.

`scripts/fit-strings.ts` fits each instrument with the same evolution strategy.
The parameters are:
- the statistical high-frequency body path (gain and corner);
- the bridge-hill formant and low shelf gains;
- the bow-speed range across velocity;
- the string loss at 3 kHz.

The loss combines:
- the per-dynamic long-term spectrum;
- harmonic profiles by register and dynamic;
- the pp→ff spread;
- HNR deficit and pitch, both added after a first fit made the violin
  scratchy (HNR 17 dB at ff against the recording's 36 dB).

It uses three notes per group, with matched vibrato.

A fitted bow-force-versus-dynamic map was **rejected**. Values below 1 made
high positions on the E string (A6, above any analysed note) fall under the
minimum bow force: a breathy "surface sound" with the B1− body mode louder
than the fundamental. The bow force stays a fixed fraction of Schelleng's
maximum. Output gains were re-normalised so each instrument keeps its round-1
median mf level (ensemble balance).

The cello default vibrato is now 20 ¢. The cellist's measured median is
17 ¢ at 5.4 Hz, and the model now measures 16 ¢ at 5.25 Hz (8 ¢ before). The
Iowa violinist and violist used vibrato on only 22 % and 6 % of notes, so their
musical defaults are kept.

**Remaining gaps:**
- **Spectral balance:** still 11–16 dB RMS. Above about 4 kHz the modal bodies
  plus a single statistical path cannot follow the measured bridge-hill and
  air-radiation detail.
- **Harmonic profiles:** within about 11–13 dB per note.
- **Cello noise and pitch:** the cello is now 5 dB noisier than its recording
  between harmonics (it was within 1 dB), and its pitch scatter rose to 3.7 ¢.
