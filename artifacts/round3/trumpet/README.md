# Trumpet, round 3b: evidence-led iterations

Stephen: the trumpet "feels most unlike the other instruments". It is now measured against the Iowa B♭
trumpet: 105 notes (non-vibrato, pp/mf/ff, E3–E♭6), analysis only, never played. Every change is judged by
`scripts/judge.ts` (via `scripts/trumpet-iter.ts`).

* **Score:** each note's error in units of the recording's own note-to-note variation, averaged over six
  measures: harmonic profile, centroid, noise, attack, pitch and level.
* **Halves:** notes alternate between a fit half and a held-out half.
* **Verdict:** taken from the held-out half; a guard measure that worsens caps it.

## What the audit found (iteration 0, the trumpet as of `f185c2a`)

* **Fundamental-heavy:** the model's 1st harmonic was the strongest. In the Iowa trumpet the 3rd is, with
  the 1st 5–11 dB below it. The long-term spectrum was 14.9 dB off, with too much below 800 Hz and too little
  around 1–1.6 kHz.
* **Dark and odd-heavy:** the centroid was 0.54× the recording's and even/odd was −8 dB, which is
  clarinet-like.
* **Too pure:** the harmonic-to-noise ratio was 16.7 dB above the recording's. The recordings are clean
  (SNR 64 dB, HNR 39 dB), so this is breath noise the model lacked, not hiss.
* **Narrow dynamics:** 6.2 dB from pp to ff, against 9.6 dB.

## Iterations

| # | change | verdict (held-out score, lower is better) | kept |
|---|---|---|---|
| 1 | **The bell radiates ∝ f² below its cutoff:** a two-pole high-pass at 1.4 kHz on the radiated pressure. Before, the bell radiated the bore pressure plus a little derivative. | **BETTER** 12.93 → 7.24 (Δ 5.69 ± 0.58). Spectrum 14.9 → 3.2 dB, centroid 0.54 → 0.93, even/odd −8.1 → −1.4 dB, dynamics 6.2 → 9.2 dB, harmonics 8.7 → 4.2 dB | yes |
| 2 | **Breath turbulence at the lips:** flow noise ∝ the flow through the opening, which the bore then resonates | **BETTER** 7.24 → 4.11 (Δ 3.14 ± 0.27). HNR excess 16.1 → 0.8 dB | yes |
| 3 | **Output level** matched to the recordings, as for the other instruments (+5.7 dB) | **BETTER** 4.11 → 3.25 (Δ 0.86 ± 0.14) | yes |
| 3a–c | **Tongue release** (lips start from a kick) and a faster envelope | NO CLEAR CHANGE ×3. The median attack moves (1.43 → 0.8–1.15×), but the per-note scatter dominates | no |
| 4a–b | **Lower pp blowing pressure** (pp nearer the threshold) | WORSE ×2. Notes stop speaking cleanly: pitch, level and noise guards broken | no |
| 5a–c | **A dynamic brightness tilt** (a low-pass falling towards pp) | WORSE ×3. Harmonics improve, 5.6 → 4.7 dB, but the centroid guard breaks | no |
| 6a–c | **Spectral enrichment:** a low-pass at N·f₀, N growing with pressure | WORSE ×3, for the same reason | no |

**Overall, held out:** 12.93 → 3.25.

| | iteration 0 | now | Iowa |
|---|---|---|---|
| harmonic error (median) | 8.7 dB | 4.2 dB | — |
| ⅓-octave spectrum error | 14.9 dB | 3.3 dB | — |
| centroid ratio | 0.54 | 0.93 | 1 |
| even/odd error | −8.1 dB | −1.4 dB | 0 |
| HNR, model − recording | +16.7 dB | +0.8 dB | 0 |
| pp → ff | 6.2 dB | 9.2 dB | 9.6 dB |
| pitch | 2.7 ¢ | 2.7 ¢ | — |

## The stage

The trumpet is redrawn in the ensemble's line art: thin tube walls along the wrap, the bore's standing wave
glowing inside the tube (nodes dark, antinodes bright), the lips buzzing at the mouthpiece with the engine's
lip opening, the pistons pressed for the fingering, the valve slides lit when the air goes through them, and
the room's wavefronts leaving the bell. Shots: `stage-it3-*.png`. Before: `../9-trumpet-*.png`.

## Files

* **Audio:**
  * `phrase-it{0,1,3}.mp3`: an original fanfare-like line, pp → ff, slur, repeated tongued notes;
  * `c4-pp`, `c4-ff`, `g5-mf` single notes, same tags;
  * a spectrogram `.png` for each MP3.
* **Close-ups:** `note-*-iowa-vs-it*.png`, the Iowa note (top) against the model (bottom), 60 dB range.
* `it2` sounds the same as `it3` once peak-normalised (iteration 3 is only a level change).

## Limitations (honest)

* **pp is still too bright in its upper harmonics** in the middle and high registers. The recording falls
  away steeply above the 5th harmonic, the model by 7–20 dB less. Both filters that cut those harmonics
  also darkened the low harmonics, where the model is already slightly dark (centroid 0.91 at pp). A real fix
  needs a different lip waveform at pp: smooth, not closing.
* **The high register is short of 2nd harmonic,** by about 3 dB (even/odd −4 dB above C5).
* **Attack is 1.4× slow on the median,** with a large per-note scatter.
* **The bore is still an ideal harmonic loop** (no mouthpiece or bell impedance curve), and there are no
  mutes. The Iowa set is non-vibrato, so vibrato is not judged.
