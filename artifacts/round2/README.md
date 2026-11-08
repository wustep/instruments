# Round-2 artifacts

Everything here was synthesised by the physical models in this repository; no recorded sample is part of any sound. The Iowa MIS recordings used for calibration are analysed only and are not included.

## Audio — `audio/` (after) and `before/`

* **Format:** MP3, 192 kbps, 48 kHz stereo, rendered by `npx tsx scripts/render-round2.ts`. The scores are original, written for these demos.
* **Output chain:** the full chain (room, limiter), attenuated to a −1 dBFS peak but never raised, so pp stays pp.
* **Before:** `before/` holds the **same scores rendered by the round-1 engine** (commit `6812c18`, run from a git worktree with `--engine`), for honest A/B listening. Instrument levels at mf were kept equal to round 1, so pairs are level-comparable.

| after | before | seconds | what you hear |
|---|---|---:|---|
| [`piano-tenor-notes.mp3`](audio/piano-tenor-notes.mp3) | [before](before/piano-tenor-notes.mp3) | 13.5 | Piano: F2, A2, C3, E3 at mf, each held 3 s — the tenor’s fast first decay into a long aftersound (round 2 fixed a ×2.2 too-slow prompt decay here) |
| [`piano-treble-notes.mp3`](audio/piano-treble-notes.mp3) | [before](before/piano-treble-notes.mp3) | 10.8 | Piano: C6, E6, G6, C7 at mf, held 2.4 s each — treble unisons kept within a tuner’s beat rate, decaying like the recording instead of collapsing in a beat |
| [`piano-chorale.mp3`](audio/piano-chorale.mp3) | – | 16 | Piano: an eight-chord chorale in C minor with legato pedalling — tenor and bass voicing where the decay changes matter most |
| [`violin-long-tones-bow-changes.mp3`](audio/violin-long-tones-bow-changes.mp3) | [before](before/violin-long-tones-bow-changes.mp3) | 15.2 | Violin: D4 forte for 8 s, then A4 for 6 s — the bow runs out of hair and changes direction automatically (cosine reversal, ~70 ms); listen for the turns |
| [`violin-detache.mp3`](audio/violin-detache.mp3) | – | 8.2 | Violin: a détaché melody in G — each new note takes the other bow direction (down, up, down…), slurred pairs stay in one bow |
| [`viola-melody.mp3`](audio/viola-melody.mp3) | – | 12.6 | Viola: a slow melody on the C and G strings, long notes with bow changes |
| [`cello-long-tones.mp3`](audio/cello-long-tones.mp3) | [before](before/cello-long-tones.mp3) | 14.5 | Cello: C2 and G2 held forte, then an arpeggio up to C4 — bow changes on the long notes, open strings ringing sympathetically |
| [`flute-low-register.mp3`](audio/flute-low-register.mp3) | [before](before/flute-low-register.mp3) | 10.4 | Flute: a low-register phrase at mf (C4–G4) — the strong second harmonic of a real flute’s low notes, from the offset jet and monopole radiation |
| [`flute-dynamics.mp3`](audio/flute-dynamics.mp3) | [before](before/flute-dynamics.mp3) | 13 | Flute: G4, G5, G6 each played pp, mf, ff — the tone fills out with the jet as it does on a real flute (fitted to the Iowa recordings) |
| [`ensemble-chorale.mp3`](audio/ensemble-chorale.mp3) | [before](before/ensemble-chorale.mp3) | 17 | All five instruments: an original chorale in G for flute, violin, viola, cello and piano (each rendered separately and summed) |

### Measured on these files (decoded MP3, mono)

| demo | measure | before (round 1) | after (round 2) |
|---|---|---|---|
| `piano-tenor-notes` | time for the level to fall 10 dB after the strike, F2 / A2 / C3 / E3 | 1.07 / 2.37 / 0.60 / 0.74 s | 0.67 / 0.73 / 0.60 / 0.74 s |
| `flute-low-register` | median even/odd harmonic power over the 8 notes | −29.0 dB | −10.0 dB (Iowa flute C4–B4: −4 at mf, −13 at pp) |
| `violin-long-tones-bow-changes` | automatic bow changes (D4 8 s ff, A4 6 s f) | none (no bow model) | 7, at 1.89 3.72 5.55 7.38 9.21 11.36 13.51 s |

* **Piano tenor.** F2 and A2 sit on the bass bridge, where round 2 fixed the ×2.2 too-slow prompt decay. C3 and E3 are on the treble bridge and did not change.
* **Method.** `npx tsx scripts/measure-demos.ts` reproduces the piano and flute rows. The bow changes are counted from `BowedCore.bow` while rendering the same score.

## Screenshots — `shots/`

* **Capture:** `ROUND=2 node scripts/screenshots.mjs` against `pnpm preview`, after the page settled.
* **Sizes:** desktop 1440×900 @2x; phone = Pixel 7.

| file | shows |
|---|---|
| `play-piano.png` | Play page with a pedalled chord including F2 |
| `inside-piano-tenor.png` | Look inside: tenor A2 + E3 strings, hammer force loop, soundboard modes |
| `inside-violin-bow.png` | Look inside, violin D4 at ff: Helmholtz stick–slip (one slip per period, β 0.071 near the bridge), the bow bar (frog → tip, contact point, up-bow arrow) |
| `inside-cello-bow.png` | Look inside, cello G2 forte: bow trace and bar, body modes |
| `inside-flute-low.png` | Look inside, flute E4: bore standing wave, jet flow vs returning pressure, pipe resonances |
| `measurements-piano.png` | Measurements: piano vs Steinway B (round-2 tiles) |
| `measurements-strings-flute.png` | Measurements: new strings-and-flute section — tiles with before/after, long-term spectra vs Iowa recordings |
| `measurements-full.png` | the whole measurements page |
| `notes.png` | Notes page (updated for round-2 physics) |
| `phone-inside-violin.png`, `phone-measurements-strings.png` | phone layouts |
