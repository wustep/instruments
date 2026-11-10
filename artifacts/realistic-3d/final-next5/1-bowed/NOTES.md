# NEXT5 item 1: bowed-string bodies fitted to the Iowa recordings

Violin and viola: their sketched radiation EQ is replaced by a response fitted note by note to the
University of Iowa MIS recordings, and their brightness now grows with the bow's force. **Judge:
violin BETTER, viola BETTER** (held-out notes). The cello was tried twice, the judge said WORSE both
times, so it is **bit-identical to main**. So are the piano, flute and trumpet.

All numbers: `main` = `e6ca833`. Recordings are analysis only (`.cache/`, never committed).

## What changed in the engine (`packages/engine/src/core/bowed.ts`, `design.body`)

1. **The high-frequency radiation is heard in mono.** The violin's and viola's round-2 chain sent
   the high-frequency path to the left channel and *inverted* to the right. It cancelled exactly in
   a mono sum: a phone speaker, or the one-microphone recordings it was fitted to. Its gain had no
   effect on anything the calibration measured. That is why round 2's fit could not reach the top
   octave ("modal bodies plus a single statistical path cannot follow…", CALIBRATION.md). It is now
   in phase, as the cello's v2 chain already was.
2. **A fitted body envelope** (`body.bands`): 15 half-octave peaking sections replace the
   hand-set bridge-hill and low-shelf EQ and the 7 kHz shelf. The modal body still radiates its own
   modes through them (fine structure, stereo, vibrato flicker); the bands set where the energy sits
   on average.
3. **Brightness follows bow force** (`body.corner`). The bridge force here is a near-perfect
   sawtooth to its 16th harmonic at every dynamic (probed directly). The velocity-only friction law
   leaves the Helmholtz corner as sharp at pp as at ff, and main's ff even came out *darker* than
   its pp at the same pressure. A first-order low-pass on the radiated sound stands in for the
   corner's rounding (Cremer 1984, ch. 7: corner width falls as bow force rises; Schoonderwaldt,
   Guettler & Askenfelt 2008: spectral centroid rises with bow force). Its cutoff is a harmonic of
   the note: `fc = corner[0] · f0 · (F/Z)^corner[1]`, with F the bow force actually applied and Z the
   string's impedance. So the mod wheel (bow pressure) brightens a held note live. A cutoff in Hz
   fitted the fit half worse than one in harmonics: the violin's E string sounds far brighter than
   its G.
4. **Fitted along with it:**
   - violin: rosin noise 0.04 → 0.2 (the cello's independent fit was 0.226); bow speed 0.03–0.40 →
     0.052–0.25 m/s, to the recordings' pp/ff level spread.
   - viola: rosin noise 0.08; `attackTau` [0.2 s pp, 0.12 s ff], the cello's existing mechanism
     (cello: [0.255, 0.108]). Its speeds stay as on main (see below).

| | corner (harmonic at 1 m/s, exponent) | hf gain | output gain |
|---|---|---|---|
| violin | 1.61, 1.4 | 4.24e-4 → 1.46e-3 | 43.7 → 123 |
| viola | 2.67, 0.9 | 3.53e-4 → 5.2e-4 | 45.5 → 146 |

The output gains keep each instrument's median mf note exactly as loud as on main. The recordings'
absolute levels are the microphone's gain: the Iowa viola sits 17 dB below the Iowa violin.

## How it was fitted (`scripts/fit-bodies.ts`, `scripts/fit-half.ts`)

- **Data: the fit half only**, the even MIDI notes of every dynamic. `scripts/judge.ts` holds out
  the odd ones. Every harmonic k ≤ 16 below 10 kHz within 45 dB of the note's strongest gives one row:
  recording − model (dB) = the note's own level + ΔC(k·f0) + the corner's change at k·f0.
- ΔC sits on knots 3 per octave from the lowest note to 10 kHz, with a curvature penalty λ = 3.
  The knot density and λ were chosen by cross-validation *inside* the fit half (notes ≡ 0 vs 2
  mod 4): finer envelopes (6–12 per octave) did worse there.
- The corner comes from a grid. The bands are refitted to the new envelope by Gauss–Newton (realised
  within 2.0–2.5 dB RMS). The envelope's mean need above 5 kHz goes to the hf path's gain. Then the
  fit half is re-rendered, 7 passes.
- Rosin noise and the viola's attack constants were chosen by `scripts/fit-half.ts`: the judge's own
  score on the fit half, with main's spreads.

**Honesty about the held-out half:** I ran the judge after each step (violin 4 variants, viola 6),
so the held-out verdicts were seen along the way. Every choice above was made on the fit half or
on a broken guard, never on a held-out score. One viola variant scored BETTER on held-out (bands fitted
at refitted speeds, then run at main's speeds) and was **not** kept, because it was inconsistent
and its fit-half score was no better.

## Judge (held-out half; `judge-*.txt`)

```
violin: BETTER   held-out 3.86 → 3.03 (n=41, Δ 0.83 ± 0.22); fit 3.56 → 2.94
  harmonics 11.88 → 9.15 dB   centroid 0.83 → 0.67 oct   noise 11.02 → 6.87 dB
  attack 2.20 → 2.09 oct      pitch 1.76 → 1.69 ¢        level 5.82 → 4.68 dB
viola:  BETTER   held-out 5.20 → 4.34 (n=36, Δ 0.85 ± 0.20); fit 5.17 → 4.01
  harmonics 11.56 → 10.17 dB  centroid 0.76 → 0.62 oct   noise 9.02 → 7.39 dB
  attack 1.42 → 0.98 oct      pitch 1.18 → 1.27 ¢        level 15.46 → 14.62 dB
cello:  NO CLEAR CHANGE (Δ 0.00: bit-identical to main)
```

Steps along the way (held-out Δ ± SE):

| step | violin | viola |
|---|---|---|
| envelope + corner (hf path still inverted) | +0.21 ± 0.14, no clear change | — |
| + hf in phase, + bow-speed level spread | +0.52 ± 0.16, BETTER | +0.32 ± 0.25, attack guard broken (pp bow speed 0.045 → 0.080) |
| viola with main's speeds, refitted | | +0.21 ± 0.16, no clear change |
| + rosin noise (fit-half pick), refitted | +0.83 ± 0.22, **BETTER** | +0.10 ± 0.23, attack guard broken |
| + viola `attackTau` [0.2, 0.12], refitted | | +0.85 ± 0.20, **BETTER** |

**Cello, rejected twice** (so it stays as on main):

```
1. same fit, main's speeds:                  WORSE  held-out 1.85 → 2.37 (Δ −0.52 ± 0.10), centroid 0.68 → 1.27 (guard)
2. corner ≥ fundamental, exponent ≥ 0.3,
   hf path left alone (--corner-floor --keep-hf): WORSE  held-out 1.85 → 2.41 (Δ −0.57 ± 0.10), centroid 0.68 → 1.31 (guard)
```

The cello's harmonics up to 16 reach only ~1 kHz on its low notes. A harmonic-only objective leaves
everything above that free, and that is where the centroid lives. The first fit slid the corner to a
fixed 150 Hz, the second to no corner at all. The cello's ff is still dark (centroid ×0.76).

## Calibration summary (`calibrate-before.json` → `calibrate-after.json`, all notes)

| | violin | viola | cello |
|---|---|---|---|
| long-term spectrum RMS error | **14.04 → 4.01 dB** | **10.52 → 3.98 dB** | 4.20 (unchanged) |
| … pp / mf / ff | 9.3/10.7/14.9 → 6.4/3.6/4.3 | 10.3/7.9/10.8 → 2.8/4.0/4.1 | 4.0/4.3/4.3 |
| centroid model/recording pp / mf / ff | 1.18/0.82/**0.61** → 1.07/0.85/**0.82** | 1.18/0.85/**0.78** → 0.88/0.90/**0.89** | 1.35/1.05/0.76 |
| harmonic profile, median per note | 11.67 → 9.05 dB | 10.98 → 9.51 dB | 11.15 |
| attack time model/recording | 0.27 → 0.32 | 0.52 → 0.84 | 0.93 |
| pp→ff level spread (recording) | 17.4 → 18.9 (19.1) | 9.5 → **15.1** (9.9) | 14.3 (12.5) |
| pitch RMS | 2.41 → 1.97 ¢ | 1.70 → 1.63 ¢ | 2.47 ¢ |
| notes' level evenness vs the recording, pp/mf/ff (offset removed) | 5.6/4.8/5.9 → 4.7/4.3/5.8 dB | 3.3/7.1/5.7 → 3.9/5.4/4.4 dB | — |

`ltas.svg` / `ltas.png`: the long-term spectra, recording vs main vs this change, per dynamic.

Median spectral centroid of the model over the violin's reference notes: pp/mf/ff 1119/1032/978 Hz
on main (louder was darker) → 1130/1183/1299 Hz. The recording's is 820/1317/1455 Hz.

## Bit-identity (everything not deliberately changed)

Phrases with chords, CC1 and pitch bend, dry and wet, at 44.1 and 48 kHz, this checkout against
main: **max |Δ| = 0** for piano, cello, flute and trumpet. Violin and viola changed (deliberately).
Golden: only `golden/violin.json` re-blessed (the golden passage has no viola).

## Audio (`audio/`, before = main, after = this change; one gain per pair, the site's room)

- `violin-dynamics`, `viola-dynamics`: one note on each of three strings at pp, mf, ff.
- `violin-phrase`, `viola-phrase`: an original legato line with a crescendo and a diminuendo.
- `violin-pressure`, `viola-pressure`: one held note while the mod wheel presses the bow from light
  to hard and back. On main only the level moves; now the tone opens with the pressure.
- `*.png`: stacked spectrograms, before on top. `metrics.json`: per-note centroid and level of the
  dynamics passages (dry).

## Tests

- New `packages/engine/test/bodies.test.ts`: the corner opens with velocity and with the pressure
  controller, and scales with the note; a ff violin is brighter than a pp one (median over four
  strings); the hf path is heard in mono.
- `cello.test.ts`: "only the cello uses v2" now allows the violin's and viola's fitted rosin noise
  and checks that only they have `body`.
- `player.test.ts`: a second violinist is as loud as the first *on average over four notes*. On
  main, five players of the test's one G4 already spanned 5.3 dB (the stick–slip settles
  differently per random stream). The old single-note check passed on main by 0.6 dB of luck and
  failed here by 3.2 dB.

## Gaps left

- **Viola dynamics widened**: pp→ff 9.5 → 15.1 dB against the recording's 9.9. Refitting its bow
  speeds closes it (pp 0.045 → 0.080 m/s) but scored worse on the fit half (4.13 vs 4.01) and broke
  the attack guard once, so main's speeds stay. The viola's pp is ~4 dB quieter and its ff ~2 dB
  louder than on main.
- **Violin ff still a little dark** above 2 kHz (5–8 dB under the recording at 3–10 kHz; centroid
  ×0.82), and pp a little bright (×1.07).
- **Per-note harmonic profiles** still 9–10 dB per note against the recordings' own neighbour
  spread of ~5.5 dB. The model's string regime varies note to note (noise, scratchy or too-clean
  notes, onset bursts), which no body can fix. Torsion and bow width, which steadied the cello, are
  still cello-only.
- **Cello**: unchanged; its ff stays dark (×0.76). A cello body fit needs an objective that sees
  above the 16th harmonic (the long-term spectrum or the centroid), not harmonics alone.
- The corner is a filter on the radiated sound, not the string's own motion: the Look-inside traces
  and the string's waveform are as before.
