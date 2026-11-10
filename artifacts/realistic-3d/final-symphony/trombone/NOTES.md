# Trombone

The thirteenth instrument and the sixth of the symphony phase: a slide trombone in three sizes sharing one
physical model — alto in E♭, tenor in B♭ with an F attachment, bass in B♭ with F and G♭ attachments — in the
brass family (buzzing lips driving a bore), fitted to the University of Iowa MIS tenor and bass trombones;
drawn in both 2D styles and modelled in 3D; an Orchestra voice that trombone lines reach (by name in five
languages and its sizes, or General MIDI program 57), each seat the size its part needs.

Brief: `.autopilot/briefs/TROMBONE.md` (item 6 of `SYMPHONY.md`), with `STANDING-PREFS.md` and
`ART-DIRECTION.md`. Branch `improve/trombone`, based on `main` at `0e0552e`. Engine: Claude Opus 5.5
throughout (the lead, and the 2D and 3D helpers in sibling worktrees, cherry-picked).

## Compass and sizes

Orchestral trombone parts are written at concert pitch (in bass, tenor and alto clefs); the engine plays at
concert pitch.

| size | tube (first position) | bore | bell | valves | the model's compass | MIDI |
|---|---|---|---|---|---|---|
| alto in E♭ (Bach 39, Yamaha YSL-871) | 2.06 m | 12.2 mm (0.481") | 178 mm (7") | none | A2–G5 | 45–79 |
| tenor in B♭/F (Bach 42B, Conn 88H) | 2.74 m | 13.9 mm (0.547") | 216 mm (8½") | F (a fourth) | E1–F5 (pedals E1–B♭1) | 28–77 |
| bass in B♭/F/G♭ (Bach 50B3) | 2.74 m | 14.3 mm (0.562") | 241 mm (9½") | F, G♭; both D | C1–C5 (pedals C1–A1) | 24–72 |
| the Iowa recordings | tenor E2–C5; bass C1 (pp), D♭1 (mf, ff) to B♭4 (pp), G4 (mf), F4 (ff) | | | | | |

The stage's trombone is the tenor; its Size knob (alto · tenor · bass) plays the others, and its keys show the
tenor's compass. The Orchestra's trombone voice spans all three (C1–G5); each trombone seat takes the size its
lines need (`tromboneSizeOf`, `apps/web/src/orchestra/assign.ts`): a line named for one ("Alto trombone",
"Trombone basso", "Bassposaune", "B. Tbn.") is that one; otherwise a part that lives low (its core under E2 or
its middle under C3) a bass trombone, one that stays high (nothing under A2, its middle at or over E4) an alto,
the tenor otherwise. Beethoven's Fifth, IV (alto, tenor, bass) and Bach's Air (below) seat all three.

The slide chart (`tromboneFingering`) is the standard one: the slide alone for positions 1–5 on the lowest
usable partial (2, 3, 4, 5, 6, 8, 9, 10, 12; the 7th and 11th, far from equal temperament, are only
alternatives), the F valve for what the slide alone would play in sixth or seventh position (F2 and C3 in
"T1", E2 and B2 in "T2", as orchestral players use it), pedal notes below the second partial (the bass
trombone's pedal B♭ in first position; C1 on both valves in third). The tenor's low B1 lies past the slide's
reach on any side ("the B natural problem"): taken past the seventh position on the F side, as a player pulling
the F valve's slide would. The slide's positions in metres come from the bore itself (below), so a natural
partial's own tuning shows as a raised or lowered position.

## Sound

### The model (`packages/engine/src/core/trombone.ts`)

Everything is in SI units: pressures in pascals, flows in m³/s, lengths in metres.

| part | model | source |
|---|---|---|
| lips | a one-mass outward-striking valve driven by Δp = mouth − cup pressure, static opening Δp/K, resonance a little under the note; opening h = max(0, h₀ + y), at most h_max; flow u = w·h·√(2\|Δp\|/ρ) | Helmholtz; Elliott & Bowsher 1982; Adachi & Sato 1996; Cullen, Gilbert & Campbell 2000; Velut et al. 2017 |
| mouthpiece | the cup a volume (compliance C = V/ρc², a spherical cap of the mouthpiece's depth over its rim: Bach 6½AL 25.4 mm, 1½G 27.9 mm), joined to the bore by the throat (7.0 / 7.5 mm) and backbore as one inertance M = ρ∫dx/S: a Helmholtz resonator (the mouthpiece's popping frequency); integrated semi-implicitly each sample | Benade 1976 §20; Campbell, Gilbert & Myers 2021 §5 |
| cylinder | the leadpipe, slide and tuning slide as one round-trip delay (fractional, eased at a slide's speed), with Keefe's viscothermal wall loss (α ≈ 3·10⁻⁵ √f / a Np/m) as a one-pole matched at 100 Hz and 800 Hz, the mean pressure reflected whole | Keefe 1984 |
| bell | a Bessel horn r(d) = R·(d₀/(d + d₀))^0.8 (d from the rim; d₀ 4 cm on the tenor), from where it reaches the bore (1.2 m from the rim) to the rim, as Kelly–Lochbaum scattering sections (a sample long each, merged where the radius grows under 4 %: 50 sections at 44.1 kHz on the tenor); the rim's open-end reflection a two-pole low-pass at ka ≈ 1 | Pyle 1975; Braden, Newton & Campbell 2009; Levine & Schwinger 1948 |
| tuning the slide | the cylinder's round trip set so that the n-th resonance of the whole bore (mouthpiece, cylinder, bell) falls on the note: the unwrapped phase of R_mouthpiece·R_bell, computed exactly from the discrete model once per size and rate, ωD = Φ(ω) + 2π(n − 1); a pedal note tunes the 2nd resonance to its octave. The visual slide is that delay's distance from first position | |
| brassiness | nonlinear steepening along the slide: a sample of pressure p arrives β·L·p/ρc³ earlier (β = 1.2, L the cylinder's length), × a fitted factor for the bell section's narrow first half; what it adds (the harmonics above the bell's cutoff) leaves through the rim's complement a bell's length later, while the loop carries the wave as it was | Hirschberg et al. 1996; Campbell 1999 |
| radiation | the rim's complement (what the bell lets out), then the colour: a high-pass, a formant, a low-pass whose corner falls with the dynamic, and the bell's beam (a shelf from about ka = 1: a wide bell's on-axis gain rises ~6 dB an octave) | Kinsler et al. §7.4 |
| slide motion | at most 4 m/s, smoothed over 12 ms; a slur that moves the slide gets a soft legato tongue (the lips' opening dips 85 % while it travels) unless the player glides (CC65 or the knob); the pitch wheel moves the slide | Kleinhammer 1963 |
| tuning | a measured table per size and note at 22.05, 44.1, 48 and 96 kHz at mf (`trombone-tuning.json`, `scripts/tune-trombone.ts`) | |

The bore's series, from `TromboneCore.resonances()` (tenor, B♭3 in first position): **0.70, 1.97, 2.97,
4.02, 5.06, 6.06, 7.09, 8.06** × the pedal; the passive bore's input impedance computed by impulse response
peaks at the same places (0.69, 1.97, 2.97, 4.03, 5.08, 6.08, 7.12, 8.10). A closed cylinder alone gives 1, 3,
5, 7 … × its first: the trombone's near-harmonic series comes from its bell and mouthpiece, as in the
literature, not from an imposed tuning.

### What the fits found (`scripts/fit-trombone.ts`)

The horn's (1+1) evolution strategy over the voicing (40 parameters at the end), scored on the fit half only
(even MIDI numbers) as the judge scores (harmonics, centroid, noise, attack, over the recordings' spreads),
plus the pp→mf→ff level steps paired note by note within each set, the level across the compass (each set's
low third against its high third at mf and ff, and the bass set against the tenor's: one gain plays both),
the analysed notes' pitch (60 ¢ off is another partial), and the register survey of the model alone: every
note of all three sizes at pp, mf and ff at the four rates (`scripts/trombone-regimes.ts`, held 1.5 s, read in
the cup). The bore's measures are not moved; the cup and throat, wall, rim and steepening only as factors on
their measured or physical values. Pitch is left to the tuning table, absolute level to the gain.

Before and between the fits, the structural findings (each a register survey or a probe against Iowa
notes, `scripts/trombone-grid.ts`, `scripts/trombone-cmp.ts`):

1. **The bore makes the series.** The bell as scattering sections and the cup as a resonator turn the
   cylinder's odd series into the trombone's (0.70, 1.97, 2.97, 4.02 … × the pedal) with no tuning imposed;
   the slide is then set by the discrete model's own phase, so every note's n-th resonance lands on it.
2. **The lips must be sharp.** A 48-point grid (lip Q, tuning, stiffness, mouthpiece): at Q 5–12 the upper
   notes fell silent or cracked; Q ≈ 50 with the lips 0.7 semitone under the note held them (the horn's
   finding too; players' lips measure Q 0.5–5: one mass stands in for an embouchure a player keeps
   adjusting). The fitted Q is 54 at the bottom, 38 at the top.
3. **The mouthpiece's popping frequency.** From the 6½AL's catalogue measures its Helmholtz resonance is
   892 Hz, and the top fifth of the tenor's compass (A♭4–F5) did not speak at all; the cup's volume ×1.6
   (705 Hz; the spherical cap under-counts the cup's shoulder and the throat's entry) gave 575/600 at once.
   Fitted ×1.74.
4. **Steepening belongs outside the loop.** Read back into the bore, the wave's amplitude-dependent delay
   dephased the bore's own harmonics every round trip (×3: a nearly pure tone). The loop now carries the
   wave as it was, and what the steepening adds leaves through the rim's complement a bell's length later —
   unfiltered, it had added mostly fundamental. Fitted at 3.2 × the slide's own length (the bell section's
   narrow half steepens too, and the one-mass lips' smoother waveform needs more distance to shock: at ff
   the outgoing wave rises at 17.5 kPa/ms, a shock after 2.3 m against the slide's 1.6 m).
5. **The bell's beam.** Even steepened to a shock's 1/n spectrum, the ff upper harmonics stayed 10–15 dB
   under the recordings': the model radiated the transmitted wave with no directivity, while a 216 mm bell
   sends its highs forward (a piston's on-axis gain rises ~6 dB an octave above ka ≈ 1) and the Iowa
   microphone stood in front of it. A shelf from 1.77 kHz, +13.9 dB.
6. **The lips beat at every dynamic.** Their spectrum's shape barely changes from pp to ff (Q 50 puts every
   dynamic far over threshold, and the opening's closure limits the swing); the dynamic brightness comes from
   the steepening (∝ p²) and a radiation corner falling 4.1 octaves from ff to pp. The pp top notes remain
   richer than the recordings' (below).
7. **The attack follows the breath only when it is slow.** The recordings' long tones grow over 0.1–0.3 s;
   a breath rising in 15–45 ms gave 45–100 ms whatever else moved (the lips saturate early). The fitted rise
   is 0.2 s soft and 0.1 s loud. Then a 50 ms note was 10–14 dB under its long tone: the breath now reaches
   half its pressure in 12 ms (the tongue's release) and swells to the rest (judge vs the fit without it: NO
   CLEAR CHANGE; every tap within 7.1 dB of its long tone).

Passes: 1 (start design, 78 iterations: 16.6 → 9.9), 2 (spectral parameters, steepening out of the loop),
3 and 4 (the rim-filtered steepening, then the beam: 9.7 → 6.3), 5 (attack and noise with the breath's range
widened: 6.0 → 5.9), 6 (all, from 5: 6.2 → 5.7; held-out 5.8 in the fit's own score).

### Against the recordings (Iowa MIS tenor and bass trombones, pp/mf/ff, 218 notes)

The references: the MIS "Tenor Trombone" (`https://theremin.music.uiowa.edu/MIStenortrombone.html`) and "Bass
Trombone" (`…/MISbasstrombone.html`) sets, both 27 July 1997, anechoic chamber, Neumann KM 84 at 5 ft, 16-bit
44.1 kHz mono; the bass set played with vibrato. "May be downloaded and used for any projects, without
restrictions" (`https://theremin.music.uiowa.edu/MIS.html`). Used for analysis only: never played as the
instrument, never committed (they live in `.cache/iowa-ens`). The tenor set: E2–C5 at each dynamic (107
notes); the bass set: C1 (pp; D♭1 at mf and ff) to B♭4 (pp), G4 (mf), F4 (ff) (111 notes), played by the model
at its bass size. The judge pairs each set's notes with themselves.

**Judge** (`npx tsx scripts/judge.ts --instrument trombone --before <start design>`; the start design is
commit `9dc64ce`, the voicing before any fit): **BETTER**, held-out (odd MIDI) 7.70 → **3.97** spreads
(n = 109, Δ 3.73 ± 0.25), fit half 7.72 → 3.81, no guard broken.

| held-out, mean \|error\| | start design | fitted | the recordings' own spread |
|---|---|---|---|
| harmonics, dB RMS | 10.49 | 6.97 | 1.29 |
| centroid, octaves | 0.88 | 0.38 | 0.06 |
| noise (HNR), dB | 9.54 | 3.32 | 0.90 |
| attack, octaves | 0.98 | 0.94 | 0.32 |
| pitch, ¢ | 0.63 | 0.25 | 6.03 |
| level, dB | 5.18 | 2.94 | 0.59 |

The last step (the tongued onset, 7 in the findings) against the fit before it: NO CLEAR CHANGE (held-out
4.00 → 3.97, Δ 0.03 ± 0.05; the long-tone attack 0.84 → 0.94 octave, within its guard), kept for the short
notes it makes speak.

**Against the recordings as the Measurements page shows them** (`scripts/calibrate-ensemble.ts`, all 218
notes; `apps/web/public/data/ensemble.json`, every other instrument's numbers unchanged):

| | start design | fitted |
|---|---|---|
| harmonic profile error, dB RMS (median note) | 9.17 | **6.74** |
| ⅓-octave spectrum (LTAS), dB RMS: all / pp / mf / ff | 25.8 / 3.4 / 12.2 / 25.5 | **5.5** / 7.9 / 2.5 / 5.6 |
| brightness (centroid) × the recording's: all / pp / mf / ff | 0.58 / 0.84 / 0.57 / 0.36 | **1.05** / 1.29 / 1.02 / 0.75 |
| even/odd harmonic balance error, dB | −3.7 | −0.9 |
| noise (HNR) vs recording, dB | +9.0 | **+0.4** |
| attack time × the recording's | 0.51 | **0.79** |
| dynamic range pp → ff, dB (recording 21.7) | 14.5 | **22.0** |
| pitch, ¢ RMS | 1.0 | **0.5** |

Registers (`scripts/trombone-regimes.ts`, held 2 s, read in the cup): **tenor 600/600, bass 588/588, alto
420/420** notes on their partial at pp, mf and ff × 22.05, 44.1, 48 and 96 kHz, every pedal note included.
Pitch: the tuning table per size and rate (bare model 25 ¢ RMS sharp, worst 65 ¢; with it 0.0 ¢ RMS, worst
0.2 ¢ at mf). Level: the median recorded note (tenor pp/mf/ff within 2.5 dB, bass within 1.7 dB); the Iowa
trombone sessions sit ~9 dB under the Iowa horn's and trumpet's at ff, kept as recorded, as every other
instrument keeps its own session's level.

**Known gaps.** The pp/ff contrast in brightness is narrower than a player's: pp ×1.29 too bright, ff ×0.75
too dark (B♭2's ff/pp centroid ratio is 1.28 in the model, 2.1 in the recording). The one-mass lips beat shut
at every dynamic, so the pp top notes keep a second harmonic near the fundamental's level where the
recording's is 9 dB down; a lip model whose swing grows from threshold (two masses, or a collision force)
would be the next step. The steepening is fitted at 3.2 × the slide's length and the lips' Q near 50 (players
measure 0.5–5): both stand in for what one mass on a spring cannot do. The bass set's pedal B♭1 (58 Hz)
fails the analysis on the model's side (it sounds, on its partial: the register survey reads it), so it
counts as missing in the fit. The alto has no recording: it is the same voicing at the alto's measures.

## Orchestra

- **Voice and routing** (`apps/web/src/orchestra/assign.ts`): one voice, 'trombone', compass C1–G5 (the three
  sizes'), centre F3, one note at a time. Names (`voiceFromName`): trombone(s), tromboni, trombón,
  Posaune(n), Alt-/Tenor-/Bassposaune, the sackbut (saqueboute), "Tbn.", "Tbns", "Trb.", "Tromb.", "Pos.",
  alto/tenor/bass trombone — before the double bass's "bass"/"basso" and the viola's "alto". General MIDI
  **57**. The trumpet keeps its names (tromba, trompete, cornet …) and programs 56, 58–63; the tuba stays the
  double bass's (no tuba is built; GM 58 is not routed to the trombone). A track named only for a register
  ("alto", "tenorOne", "bass" — a quartet's voices) weighs as a program when its instrument name or program
  names the instrument, so the Air's four lines are trombones, not a viola and a double bass.
- **Sizes**: each trombone seat takes the size its lines need (`tromboneSizeOf`, see Compass); the engine
  rebuilds its bore when its size changes (`setParams({ size })`).
- **Duplicates**: up to three by the picker (the routing grid adds more), each its own player (vibrato,
  intonation and noise its own: `playersOf`).
- **The pieces**: Bach, Air from the Orchestral Suite No. 3, BWV 1068, for trombone quartet (arranged and
  typeset by Ross Keenum; Mutopia-2008/10/28-461, **public domain**; the file byte for byte, sha256
  `dc3f31aa…37f8`): the trombone's own piece (its top line, the tune, on the tenor: the play icon on
  `/trombone`) and an Orchestra piece in the pieces menu (alto, tenor, tenor, bass trombone). Beethoven's
  Drei Equali (Mutopia, CC BY-SA 3.0) were passed over for the public-domain Air.
- **Tests**: `apps/web/test/trombone-routing.test.ts` (names in five languages and their neighbours, GM 57,
  the compass, the sizes by name and range, a file's trombone and bass trombone lines, the Air on four sizes,
  three by the picker); `e2e/trombone.spec.ts` (a dropped file with "Trombone I" on GM 57, "Posaune 2"
  unprogrammed and "Bass Trombone" routed to three trombones, the bass one a bass trombone; the Air's four
  sizes; three by the picker).

## Paths

`/trombone` (no alias): `INSTRUMENT_PATHS` (from `INSTRUMENT_IDS`), `formatAddress`, and both SPA rewrite groups
in `vercel.json`; `apps/web/test/vercel-paths.test.ts` names it.

## Phone picker

Thirteen picks in the 271 px band: 19 px picks with 2 px gaps (13 × 19 + 12 × 2 = 271), the names at 7.5 px
and −0.08 em (IBM Plex Mono), the trombone "tbn." there (as "vln.", "clar.", "bsn.", "tpt.", "timp."); the
glyphs keep the twelve picks' height (20.75 px), so the band and the stage under it are as tall as before.

## Audio (`artifacts/realistic-3d/final-symphony/trombone/audio`, `scripts/render-trombone.ts`)

Before = the start design (`9dc64ce`), after = fitted; MP3s with the site's room, one gain for both;
spectrograms before (top) over after; `metrics.json` (centroid, level, pitch per long tone, dry).

- `trombone-long-tones` — tenor B♭1 (pedal), E2, B♭2, F3, B♭3, F4, B♭4, F5, each pp, mf, ff.
- `bass-trombone-low` — bass trombone C1 and D1 (pedals on both valves), F1, B♭1 (its pedal in first), D2,
  F2, at mf and ff.
- `trombone-phrase` — an original phrase in B♭: a tongued fanfare up the arpeggio, then a legato line down
  the slide's positions (first to fourth, the F valve's) and back under the soft legato tongue, with a swell.
- `trombone-air` — the play icon's piece (the Air's tune), its first 40 s.
- `trombone-quartet` — the Air for four trombones, alto, tenor, tenor, bass trombone, each its size and player
  (summed, no hall seats), the first strain.

## 2D (`apps/web/src/ui/trombone-plan.ts`, `trombone-draw.ts`, `vector/trombone.ts`)

A real slide trombone in both styles, side on as it is held (the bell section and its bell over the slide,
the slide out to the right), laid out from Yamaha's photographs (YSL-620 tenor, YSL-871 alto, YBL-830 bass)
at the engine's measures: each size's bell and bore from `TROMBONE_SIZES`, the flare checked against the
YSL-620's, and the air path (mouthpiece, leadpipe, inner and outer slide, crook, bell section, tuning slide,
the F loop through its valve when it is down, the bell) within 1 % of the engine's tube for every note of each
size. Nickel-silver inner slides with their stockings, the lacquered outer slide with its sleeves and braces,
the crook with its water key and bumper, the slide lock; the F valve's rotor and thumb lever (tenor), two
rotors with nested loops (bass), none (alto). The outer slide moves by the engine's own `slide` (m, at the
drawing's px/m), the rotor turns a quarter and the lever goes down with `valves`, the lips buzz with the
engine's trace, the wave glows along the air path (classic) or is hatched across it (vector). `tromboneBox()`
sizes its Orchestra cell at the strings' px/m. Review: two cycles against the photographs
(`2d/review-cycle-1.jpg`, `-2.jpg`). Tests: `apps/web/test/trombone2d.test.ts` (14), `e2e/trombone-2d.spec.ts` (4).
Gaps: the slide drawn parallel to the bell section (the tenors' photographs show 3–4°); the tenor's bell 6 mm
higher than photographed, clear of the slide; the bass's valve tubing laid out to the engine's loop lengths,
not traced; the faint position ticks are the chart's (below).

## 3D (`apps/web/src/ui/gl/trombone3d.ts`)

A slide trombone of its own in each size (see `3d/README.md`), from Yamaha's product photographs (YSL-882OR,
YSL-620, YBL-822G, YSL-871) scaled by their bells and checked against the published bores, bells and slides:
the open tube solved to the engine's 2.740 / 2.740 / 2.060 m (F loop 917 mm, D loop 692 mm); tenor overall
1152 mm against the photographed 1175, rim to crook 512 against 513. Bessel-flared bell with a rolled rim,
nickel-silver inner slides and crook, lacquered brass with handling wear, the rotary valve with its bearing
and stop plates, stop arm, crank and a ball-jointed four-bar to the thumb lever, cork barrels, slide lock,
water key, bumper. The slide follows the engine's own value a frame behind; valves turn with `valves`.
Seated: the slide forward and 21° down, the bell left of the face; the Air seats alto, two tenors and a bass.
Four critique cycles (`3d/review-cycle-1…4.jpg`). 2.53 ms a frame at 1440×900 @2× (the horn 2.94), 1.08 ms
on a phone; no WebGL error or warning (solo, bass, the Air, among six; desktop and phone); a phone held
upright frames it whole with room for the slide's travel (43 % × 45 % of the free stage at rest). Tests:
`apps/web/test/trombone3d.test.ts`, `e2e/trombone-3d.spec.ts` (6). Gaps: a wide stage frames the slide to
fifth position, so a sixth-position note runs past its edge; no player's hands; the linkage and the bass
loops laid out, not measured; a faint dotted texture in the bell's brightest highlight at 2× (the shared
renderer's).

**The slide where the player puts it.** Both drawings take the slide from the engine, which sets it by ear
(the cylinder that puts the note's resonance on pitch), not from the chart: C2 on the tenor's F side settles at
0.51–0.56 m, where the chart's equal-tempered sixth position is 0.61 m. The bell turns low frequencies back
early in its flare, so a lower note needs less added cylinder than the whole tube's proportion: the model's
F-side positions are shorter than nominal, as a real F attachment's are short of the B♭ side's proportions
(players learn them by ear).

## Gate

- `pnpm typecheck`: clean. `pnpm build`: ok (the worklet parses in Safari 14.1).
- `pnpm test`: 68 files, 654 tests passed (engine `trombone.test.ts` 7, blocksize/golden/dynamics/sounding/
  taps with the trombone; web `trombone-routing.test.ts` 6, `trombone2d.test.ts` 14, `trombone3d.test.ts`,
  `vercel-paths.test.ts` with `/trombone`).
- Playwright (`E2E_PORT=4213`, desktop 1440×900 and Pixel 7): 218 passed, 26 skipped, 0 failed (including
  `trombone.spec.ts` 10, `trombone-2d.spec.ts`, `trombone-3d.spec.ts`; the pieces menu now four).
- No reference recording committed: this branch adds no .aif/.aiff/.wav/.flac (the only .wav files in the repository are main's own model renders in `artifacts/audio`).

## Engine

Claude Opus 5.5 throughout: the lead (engine, fit, routing, tests, notes) and two helpers in sibling worktrees
(`improve/trombone-2d`, `improve/trombone-3d`), cherry-picked.
