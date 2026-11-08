# Sound audit (round 3)

Stephen: the piano has "this weird robotic mechanic sound"; the cello "doesn't sound great either".
The same passages are rendered by the round-2 engine (`*-before`, commit e292022) and by the audited
engine (`*-after`); each MP3 has a spectrogram (0–8 kHz) of the same render.

* **`piano-a2-held`**: one A2 at mf, held 4.5 s. The clearest view of the main artefact.
* **`piano-attacks`**: four repeated C4s, then treble staccato (C6 E6 G6 C7): attacks and the action knock.
* **`piano-chorale`**: four pedalled chords in the tenor and middle.
* **`cello-d3-long`**: D3 for 5 s with the recorded cellist's vibrato (17 ¢).
* **`cello-phrase`**: a short phrase with vibrato.

Rendered with `npx tsx scripts/render-audit.ts --tag before --engine <e292022>/packages/engine/src/core/index.ts`
and `--tag after`. The comparisons with the Iowa recordings use `scripts/audit-render.ts` (analysis only,
reference audio is not committed) and `scripts/audit-attack.ts`.

## What it was

### Piano: a flanger in the unisons

The two or three strings of a note were exact copies (same stiffness B, same dispersion design) detuned by
a fixed number of cents. Partial k of the pair then beats at a rate proportional to its frequency, so the
cancellations sweep down through the upper partials in a perfectly regular fan: a flanger. The spectrogram
of `piano-a2-held-before` shows it at 2–6 kHz. The recordings have no such pattern.

Fix: each unison string gets its own stiffness, ±2 % (1σ), as real wires and tensions differ. High partials
then detune by different amounts (∝ k²·ΔB) and the beating becomes irregular. Every string has its own
dispersion design, precomputed at build time (designs JSON 32 → 56 kB gzipped; start-up unchanged at ~0.2 s).

### Piano: attacks too clean

The action knock was a smooth 1.6 ms pulse into the soundboard modes, which stop at 3.2 kHz, so the attack
had almost no high-frequency noise. Attack (first 12 ms) minus sustain, 6–12 kHz:

| | before | after | Iowa Steinway |
|---|---|---|---|
| A2 mf | −39 dB | +5 dB | +4 dB |
| C#6 mf | −15 dB | −5 dB | 0 dB |
| C#4 ff | −8 dB | −2 dB | −7 dB |

Fix: the knock adds a 4 ms decaying tick of contact noise, different on every strike. It also reaches the
high-frequency board path.

### Cello: clicks under vibrato, a nasal formant, a dull top

* **Clicks under vibrato.** The bow read the string at whole-sample positions taken from the gliding loop
  length, so vibrato made that read jump a dozen times per cycle. Each jump was a click between the
  harmonics: with vibrato off the model was cleaner than the recording, with vibrato 3.9 dB noisier. The
  bow taps now follow the note's nominal loop (with pitch bend, without vibrato).
* **A nasal formant and a dull top.** The round-2 fit had pushed the bridge-hill formant to +10 dB because
  the string's high-frequency decay was pinned at its 4 s limit. With wider bounds the refit uses a longer
  high-frequency string decay (5.6 s) and more statistical high-frequency body radiation, and lowers the
  formant to +6.7 dB.

Cello against the Iowa recordings (`calibrate:ensemble`, same analyser both sides):

| metric | before | after |
|---|---|---|
| noise (HNR model − recording) | −3.86 dB | −0.17 dB |
| harmonic error | 11.55 dB | 11.20 dB |
| ⅓-octave spectrum error | 17.0 dB | 15.5 dB |
| pp→ff spread (recording 12.5 dB) | 12.4 dB | 11.3 dB |
| pitch scatter | 2.47 ¢ | 3.08 ¢ |
| median centroid ratio | 0.73 | 0.60 |

The centroid ratio by dynamic: pp went from 1.30 (too bright) to 0.96, mf from 0.81 to 0.63, and ff from
0.51 to 0.49. The violin improved too (noise −1.69 → +0.29 dB, pitch 2.73 → 2.18 ¢); the viola is mixed.

### Checked and ruled out

* The horizontal polarisation: a render without it kept the comb exactly as before.

### Not examined in this audit

Aliasing, zipper noise, and the all-pass "diffuser" on the high-frequency board path were suspects but
were not measured. The remaining treble-knock gap (0.3–1 kHz, about 10 dB below the recording at C#6)
is not reached by this knock model.
