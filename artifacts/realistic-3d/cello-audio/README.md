# Cello audio: before / after (realistic-3d round)

The same passages through the engine at `af4f97e` (`*-before.mp3`) and the cello v2 model
(`*-after.mp3`). Each file is peak-normalised to −1 dBFS and has the site's room (0.32), 48 kHz,
128 kbps. Each `<piece>.png` is a spectrogram (0–8 kHz, linear, 80 dB, mono sum) with
**before on top and after below**. The level differences are in the metrics, not the files.

| piece | what it plays |
|---|---|
| `phrase` | the round-3 audit phrase: C3 E3 G3 C4 B3 A3 G3, vibrato 17 ¢ (matches `artifacts/round3/audit/cello-phrase-*`) |
| `bach-prelude` | Bach, Suite No. 1, Prelude, bars 1–4 (public domain): string crossings over G–D–A, slurs of four |
| `sustained` | long tones with vibrato: C2 pp, G2 mf, D3 ff, A3 mf, E4 ff, A4 pp |
| `sustained-novib` | G2 mf, D3 ff, A3 mf, D4 mf, no vibrato (pitch stability, the bare tone) |
| `transitions` | legato D3–A3 on one string; slurred crossings G2↔D3; détaché repeated G3s; one long ff D3 that runs out of bow |

Rendered with `npx tsx scripts/render-cello.ts --before <af4f97e>/packages/engine/src/core/index.ts`
(it writes these files and `metrics.json`).

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

## Against the Iowa MIS cello (67 notes, pp/mf/ff, `scripts/calibrate-ensemble.ts --only cello`)

| measure | before (af4f97e) | after | recording |
|---|---|---|---|
| ⅓-octave long-term spectrum, RMS error | **15.7 dB** (pp 12.2, mf 13.0, ff 17.2) | **5.0 dB** (pp 4.6, mf 4.8, ff 5.3) | — |
| spectral centroid, model/recording | 0.57 (pp 1.10, mf 0.71, ff 0.49) | 1.22 (pp 2.02, mf 1.10, ff 0.68) | 1 |
| harmonic profile H1–H12, median RMS error | 11.1 dB | 10.8 dB | — |
| harmonic-to-noise, model − recording | −0.3 dB | +2.6 dB | 0 |
| attack time, model/recording | 1.12 | 0.92 | 1 |
| pp → ff level spread | 10.6 dB | 13.0 dB | 12.5 dB |
| pitch, RMS over notes (matched vibrato) | 3.3 ¢ | 1.8 ¢ | — |
| notes the analyser could not read | 2 | 0 | 0 |
| vibrato depth / rate | 18.0 ¢ / 5.25 Hz | 16.4 ¢ / 5.25 Hz | 16.8 ¢ / 5.4 Hz |

The calibration judge (`npx tsx scripts/judge.ts --instrument cello --before <af4f97e engine>`),
held-out notes only (odd MIDI numbers, never used in the fit):

```
cello: before → this checkout: BETTER
  score (mean |error| / spread): fit 2.46 → 2.08 (n=35); held-out 2.68 → 2.09 (n=30, Δ 0.58 ± 0.15)
  harmonics  held-out |err| 12.32 → 12.11 (spread 6.50)
  centroid   held-out |err| 1.21 → 0.97 (spread 0.26)
  noise      held-out |err| 7.74 → 6.27 (spread 2.87)
  attack     held-out |err| 1.60 → 1.14 (spread 0.41)
  pitch      held-out |err| 2.61 → 1.52 (spread 14.11)
  level      held-out |err| 5.31 → 3.75 (spread 1.88)
```

Every measure improves on the held-out half; no guard is broken.

## From the renders (`metrics.json`, dry)

* **Pitch stability without vibrato** (fine track, 20 ms hop). Before, D3/A3/D4 wandered with an
  SD of 10–12 ¢ (A3's track spanned 98 ¢; the open strings were beating against the note). After,
  G2 and D4 hold within 0.2–0.3 ¢ SD; the ff D3 and the A3 still span ~60 ¢ only because each runs
  out of bow and changes direction mid-note (the median absolute deviation is ≤ 1 ¢).
* **Clicks** (2 ms frames of the 4–12 kHz band that stand > 10 dB above both neighbours, counted
  on the left channel because the old chain hides its high band in mono): before 3 in the phrase
  and 1 in the transitions; after 0 everywhere (worst frame 9.5 dB). The Iowa cello's steady tones
  have 0.08 such spikes per second.

## Listen notes (honest)

I cannot hear these files; the notes come from the spectrograms, the measures above and the
model's behaviour, and say what to listen for.

* **Before**: the mono spectrogram stops dead at ~3.5 kHz (the high band cancelled), and most of the
  energy sits below 1 kHz with a strong 150–200 Hz band: a muffled, boxy cello. In stereo the high
  band is there but out of phase between the ears.
* **After**: harmonics continue up to 6–8 kHz and fall off like the recording's; the 150–200 Hz box
  is gone; the low strings are darker than the A string, as on the instrument. Octaves above open
  strings (C3, G3, D4) now speak at the same level as their neighbours. Soft notes start more slowly. In the Bach, each slurred crossing speaks at once.
* **Listen for** (remaining): pp notes are brighter than the recording (centroid ×2 at pp) — the
  tone at pp is thinner than a real pianissimo; some sustained notes still have a faint grain under
  vibrato (below).

## Remaining limitations

* **pp is too bright** (centroid ×2.0 at pp, ×1.1 at mf, ×0.7 at ff): a lighter bow does not round
  the Helmholtz corner enough in this friction model. Finite bow width / hair compliance would be
  the physical fix; not done.
* **Vibrato grain**: under vibrato the slip lands on a whole-sample grid that slides against the
  moving period, which can give short high-frequency spikes in some notes (present before too, then
  hidden in the inverted channel). A sub-sample bow junction or 2× oversampling of the string loop
  is the fix; not done.
* **Per-note harmonic profiles** still differ by ~11 dB RMS from the Strad's: the body above the
  five signature modes is statistical, not that instrument's.
* **The idle-string coupling (0.245) and the torsional Q (2.8) are fitted**, not measured; the Q is
  lower than published torsional Qs (≈ 15–50) because it also stands in for the bow hair's
  compliance at the contact.
* The second bridge resonance went to the search bound (3.5 kHz, Q 0.74): it acts as a gentle
  roll-off, not a distinct resonance.
* Violin and viola keep the round-2 chain (bit-identical), including its inverted high-frequency
  copy; they would likely gain from the same changes.
