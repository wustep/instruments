# Bassoon

The tenth instrument and the third of the symphony phase: a Heckel-system (German) bassoon, in the oboe's
reed family (a waveguide bore driven by a double reed blown closed), fitted to the University of Iowa MIS
bassoon; drawn in both 2D styles and modelled in 3D; an Orchestra voice that bassoon lines (by name or
General MIDI program 70) reach.

Brief: `.autopilot/briefs/BASSOON.md` (item 3 of `SYMPHONY.md`), with `STANDING-PREFS.md` and
`ART-DIRECTION.md`. Branch `improve/bassoon`, based on `main` at `df0d121`. Engine: Claude Opus 5.5
throughout (the lead, and the 2D and 3D helpers in sibling worktrees, cherry-picked).

## Sound

### The model (`packages/engine/src/core/bassoon.ts`)

| part | model | source |
|---|---|---|
| bore | the oboe's "cylindrical saxophone": a truncated cone as two delay lines meeting at the reed, the bore down to the first open hole and the missing apex x₀ (fitted 0.14 m: a narrow cone's point is far behind its reed). Resonances n·c / 2(L + x₀): every harmonic, overblowing at the octave | Dalmont, Gilbert & Kergomard 2000; Ollivier, Dalmont & Kergomard 2004 |
| ends | both reflect through one low-pass (2.5 kHz) and a flat loss, the mean pressure whole (−1 at 0 Hz); the long branch also through a one-pole whose corner is 27 harmonics above the note (the walls' loss growing with frequency) | Fletcher & Rossing 1998 §15 |
| reed | the oboe's: two cane blades blown closed, x = 1 − Δ, u = ζ·x·√\|Δ\|·sgn Δ, solved with p = a₁ + a₂ + u/2 exactly each sample (a cubic in √\|Δ\|, Newton). ζ 1.28 at B♭1 to 1.25 at E5. Quasi-static | Almeida, Vergez & Caussé 2007 |
| dynamics | in the lips, as on the oboe: the reed's rest opening falls to 0.22 of a loud note's at pp (pM ∝ H₀, ζ ∝ √H₀) | Fuks & Sundberg 1999 (bassoon 2–8 kPa) |
| tonguing | the tongue holds the blades for 28 ms while the breath builds (rise 35–53 ms), then lets go over 0.85 of a period; the breath stays on 0.3 s (velocity 1) to 0.1 s (127) for taps | |
| radiation | the flow leaving the open end, differentiated, coloured by a fitted chain: a high-pass at 42 Hz, the main formant at 482 Hz (+18 dB at B♭1 easing to +16.4 dB at E5: the top notes keep their second harmonic), a second at 871 Hz, a low-pass whose corner follows the note and falls 1.4 octaves from ff to pp, a top shelf; the level falling 2.4 dB an octave up the compass | Meyer 2009 (the bassoon's fixed formant near 500 Hz) |
| compass | B♭1–E5 (MIDI 34–76), in C: written as it sounds, in bass and tenor clef. Each note is played on the tube whose fundamental it is (the half-hole, the flick keys and the whisper key are drawn in 2D and 3D, not modelled) | WFG basic chart (`apps/web/src/ui/bassoon-fingering.ts`) |
| tuning | a measured table per note at 22.05, 44.1, 48 and 96 kHz at mf (`bassoon-tuning.json`, `scripts/tune-bassoon.ts`); pp and ff sit within 3 ¢ of it, so no offsets | |

### What the fit found (`scripts/fit-bassoon.ts`)

The oboe's (1+1) evolution strategy over 32 voicing parameters, scored on the fit half only (even MIDI
numbers) as the judge scores (harmonics, centroid, noise, attack, over the recordings' spreads), plus the
pp→mf→ff level steps (paired note by note), the level steps between the compass's thirds, and a register
survey of the model alone. Pitch is left to the tuning table, level to the gain.

1. **The oboe's structure on a long cone.** Held-out 6.43 → 4.61, but the low notes took 0.3–0.8 s to
   settle (the recordings: 20–100 ms): with the bore's high resonances as sharp as its first, a low note's
   waveform kept sharpening for half a second. A one-pole loss in the loop, its corner a number of harmonics
   above the note, made them whole in 60–150 ms.
2. **The formant at the top, the level across the compass.** A fixed +17 dB formant boosted the top notes'
   own fundamentals (the recordings' G4–A4 have their second harmonic strongest): its gain at E5 is now its
   own. The level tilt moved nothing the score saw, and had wandered to −4 dB an octave (the recordings rise
   ~8 dB B♭1→D5 at one dynamic); the score now holds the compass's thirds to the recordings'. And the
   pp→mf→ff steps are paired note by note (a median over each dynamic's notes let the tilt move them).
3. **The register.** A voicing checked at 48 kHz over 0.75 s of radiated sound had **35 of 516** cases
   (every note at pp, mf and ff at 22.05/44.1/48/96 kHz) leave their fundamental within two seconds: they
   spoke on it and slid to their octave or twelfth. `scripts/bassoon-regimes.ts` now holds each note 2 s and
   reads the pressure in the bocal (the radiated sound is tilted to the high harmonics and misreads a note
   on its fundamental as its octave). Tried and rejected, on that survey: the open-hole lattice's cutoff
   (400–700 Hz) in the loop, heavier wall loss (corner 3–15 harmonics, the reflection's corner 0.9–1.5
   kHz), a flat loss of 2 %, an onset damping of everything above the fundamental for 6–12 periods, a seed
   of the fundamental's wave as the tongue lets go, slower and quicker breath and tongue: 12–66 misses each.
   Bisected against the start design (11 misses), the bore's losses were what destabilised it; a slurred-
   into note held its fundamental where the tongued one lost it. The fit then scored the survey at all four
   rates over 1.5 s with the losses held in their stable range (corner ≥ 12 harmonics, reflection ≥ 2.5 kHz).

Final survey: **512 of 516** on their fundamental in the bore (the four left: A2 at mf/ff at 22.05 kHz,
A♭2–A2 at ff at 96 kHz); every case at 44.1 and 48 kHz, with or without the default vibrato. The shipped
oboe, on the same survey, has 423 of 432. Counting also a note on its fundamental that radiates its odd
harmonics 15 dB under its even ones (heard leaning to its octave): **501 of 516** (C♯3–D♯3 at mf/ff at
48 kHz, E♭2 at mf at 44.1 kHz). C♯3 does so in the unfitted start design too. A last fit with that check
in its score (fit 7) judged no better (held-out 2.11 against 2.07) and moved the even-heavy notes elsewhere.

### Against the recordings (Iowa MIS bassoon, pp/mf/ff, 116 notes B♭1–D5)

The reference: the MIS "Bassoon" set (`https://theremin.music.uiowa.edu/MISbassoon.html`; "may be
downloaded and used for any projects, without restrictions"), analysis only, never played, never
committed (`.cache/iowa-ens`), segmented with the oboe's 2-frame bridge. B♭1–D5 at every dynamic (the ff
run C3–B♭3 stops a semitone short; a few notes do not segment cleanly). The recorded player uses vibrato
on about 40 % of the notes. One held-out note's recording (ff B2) analyses at an HNR of 5 dB, a glitch the
noise measure carries on both sides of the judge.

What the recordings say: the strongest harmonic sits at 450–550 Hz from B♭1 to C4 (the 7th–8th at B♭1,
the 3rd at D3, the 2nd at A3): the fixed formant; B♭1's fundamental is 9–14 dB under it. pp to ff is
12.8 dB. The top notes G4–A4 have their second harmonic as strong as their first.

Same analysis on recording and model (`scripts/calibrate-ensemble.ts --only bassoon`), dry, at the
recording's pitch and dynamic:

| | start design (41c5430, unfitted) | fitted |
|---|---|---|
| harmonic profile error, dB RMS (median note) | 9.4 | **8.6** |
| long-term ⅓-octave spectrum, dB RMS | 11.4 (pp 5.4, mf 5.9, ff 14.0) | **8.7** (pp 3.3, mf 3.9, ff 11.0) |
| brightness (centroid), model ÷ recording | 1.13 (pp 1.02, mf 1.09, ff 1.19) | **1.05** (pp 1.07, mf 1.04, ff 1.05) |
| even/odd balance, dB off (low/mid/high third) | −1.2 / 0.8 / −0.5 | 1.8 / −0.5 / −2.4 |
| noise (HNR), model − recording | +1.9 dB | +1.6 dB |
| attack time, model ÷ recording | 2.71 | **0.87** |
| pp → ff level | 14.8 dB (recording 12.8) | 11.9 dB |
| pitch, ¢ RMS | 7.9 | **0.3** |

**The judge** (`npx tsx scripts/judge.ts --instrument bassoon --before <41c5430>/packages/engine/src/core/index.ts`):
**BETTER**. Held-out score 3.68 → 2.07 (n = 55, Δ 1.61 ± 0.12); fit half 3.69 → 1.85 (n = 61); no guard
broken. Held-out per measure: harmonics 9.66 → 8.46 dB, centroid 0.24 → 0.15 octave, noise 4.57 → 4.60 dB
(the closest guard), attack 1.95 → 1.26 octave, pitch 6.65 → 0.15 ¢, level 10.0 → 2.8 dB.

Disclosures: the structure changed four times (the wall loss, the formant's top gain, then two register
experiments rejected) and the fit's score twice (the compass's slope; pairing the dynamics), and each fit
printed its held-out score; fit 7's held-out was worse and fit 6 was kept.

### Loudness, taps, pitch

The median mf note B♭1–E5 is as loud as the oboe's B♭3–A6 (−22.6 dB dry). A 50 ms tap speaks within 8 dB of
the held note at every dynamic (`taps.test.ts`); pitch at pp and ff is within 3 ¢ of mf.

Audio (`audio/`, before = the unfitted start design, after = fitted, one gain, through the site's room):
long tones B♭1, F2, C3, G3, D4, A4, E♭5 at pp, mf, ff; an original legato line in D minor from D2 to A4 and
back with a swell; the Andante as the play icon plays it. Spectrograms stack before over after;
`metrics.json` has each long tone's centroid, level and pitch. `scripts/render-bassoon.ts`.

## Orchestra

- **A voice of its own** (`assign.ts` `VOICE_INFO.bassoon`: B♭1–E5, centre D3, one note at a time), family
  `reed` (seated on the melodic arc with the oboe and the clarinet), heard from its seat; two by the
  picker, more by the routing grid; a second bassoon on a line is a second player.
- **By name**: bassoon(s), Fagotto/-i, Fagott(e), basson(s), fagot, bajón, "Bn.", "Bsn.", "Bsns", "Fg.",
  "Fag." (they went to the cello). The contrabassoon (contrabassoon, Kontrafagott, contrafagotto,
  contrebasson) stays the double bass's until it is built. "Basso", "basse", "bassi" stay the double bass's.
- **By program**: General MIDI 70 (it went to the flute).
- **Beethoven 5**: Mutopia's file carries both bassoons on one track ("four:", instrument "bassoon", GM 70)
  with divisi chords, as it does every wind pair; splitting a two-part line onto two instruments is the
  symphony PR's. Two bassoons on two lines (Fagotto I, II) seat two bassoons (`bassoon-routing.test.ts`).
- **Its own piece** (the play icon, the folder on a phone): the solo line of Mozart's Bassoon Concerto in
  B♭, K. 191, II. Andante ma adagio, from its entry after the strings' introduction through its first two
  phrases (to the held G of bar 14, 32 s). Mutopia-2006/02/25-686 (Liang Seng, from the Breitkopf & Härtel
  edition of the 1880s), **public domain**, the file byte for byte (sha256 in `pieces.ts`).
- **The picker** has ten instruments. On a phone they keep the width six took (271 px): ten 25 px picks
  and their 2 px gaps (268 px), names 8 px and set closer, the bassoon's name its score abbreviation "bsn."
  (its aria-label stays "Bassoon"). One row from 390 px phones to desktops, 518 px from tablets up; the
  band does not grow when a note sounds (Pixel 7 and 390×844, e2e).

## 2D, both styles (`apps/web/src/ui/bassoon-draw.ts`, `apps/web/src/ui/vector/bassoon.ts`)

A Heckel-system bassoon from the front, measured off the Fox photograph (Wikimedia Commons
`File:FoxBassoon.png`, GFDL 1.2, Gregory Maxwell, 0.316 mm a pixel): 1.34 m tall; the 2.53 m bore folded
down the wing joint and the boot's narrow bore, round the U-tube under its cap, up the long joint and the
bell; the 0.30 m bocal with its whisper nipple; a 55 mm reed. 25 keys and holes and 22 touches follow the
chart on springs (L1 rolls half off for the half-hole; the thumbs' keys show faintly through the wood and
light when pressed; the whisper pad seats on the nipple). The reed's tip opening follows the engine's reed
(drawn at twice its 1 mm). The standing wave glows along the folded bore, ending an end correction past
the first open hole: one half-wave in the first octave (every note B♭1–F3 within 3 % of c/2f, with a 0.40 m
apex for the drawing), two in the second, two or more in the third. It lies across a laptop's stage, stands
bell up on a phone, and takes a 1.49 × 0.39 m cell at the strings' px/m in the Orchestra. Review set:
`2d/` (43 JPEGs, 1.5 MB: the oboe stand-in at 41c5430, and the bassoon at rest, F2, G3, D4 and A4, laptop,
Pixel 7 and 390×844, both styles, the Orchestra, close-ups of the reed and the keys);
`scripts/shots-bassoon-2d.mjs`.

## 3D (`apps/web/src/ui/gl/bassoon3d.ts`)

A Heckel-system bassoon laid out from Fox's Renard 220 photographed from both sides (3.16 px/mm),
1340 mm boot foot to bell rim (Wikipedia 1.34 m; the National Music Museum's maple Heckel-system bassoons
1334–1343 mm): boot 419 mm with its U-tube cap; wing joint 486 mm out of the boot with its finger-hole fin;
long joint 580 mm; bell 307 mm swelling to Ø 52.5 and ending in a pale bead ring; the bocal traced from the
photograph (Ø 10 → 5.2 mm); a 55 mm reed with 28 mm blades, 14.8 mm at the tip; the modelled bore 2.59 m.
Flamed maple under a red-brown varnish (a new turned-maple texture), nickel-silver keywork: 35 keys on
springs by the chart (the left thumb's long keys and flick keys, the whisper key on the bocal's nipple,
rings, plates with rollers, the E plate's guard, the hand rest). Live: the keys follow the note and spring
back, the reed's blades close with `reed.open`, closed holes glow faintly with the bore's wave, the bell
shimmers with the level. A wide stage leans it 36° as it is played; a phone held upright stands it; the
Orchestra holds it diagonally. Frame 2.41 ms (the clarinet 2.22), built in 111–150 ms, 798k vertices, no
WebGL warning alone or seated, 86 % of a 390×844 phone's free height. Three critique passes against the
photographs (`3d/review-cycle-1…3.jpg`; credits in `3d/README.md`); measures and sources in
`docs/3d-reference.md`; `scripts/shots-bassoon-3d.mjs`, `scripts/sheet-bassoon-3d.py`.

## Tests

- Engine (`packages/engine/test/bassoon.test.ts`, 7): pitch B♭1–E5 within 6 ¢ at 44.1 and 48 kHz; every
  fourth note in its own register at pp/mf/ff (held 1.5 s, read in the bocal), at most three radiating
  even-heavy; every harmonic in the low register (odd and even within 8 dB on average, D2–A2); the low
  notes' strongest harmonic at 250–800 Hz, over their fundamental; ff ≥ 8 dB over pp; the compass's ends;
  a second player. Also in `blocksize`, `golden` (a new `bassoon.json`, the others unchanged), `dynamics`,
  `sounding`, `taps`.
- Web: `bassoon-routing.test.ts` (4: names in six languages and abbreviations, GM 70, the contrabassoon
  not, the compass, K. 191's demo, two bassoons and a third player, the keys split, seats);
  `assign`/`oboe-routing`/`clarinet-routing`/`bass-routing` updated (the bassoon's names and GM 70 no
  longer reach the cello and flute); `bassoon2d.test.ts` (17); `bassoon3d.test.ts` (7); `vercel-paths`
  (vercel.json rewrites `/bassoon`).
- e2e: `e2e/bassoon.spec.ts` (the picker and "bsn.", the keys' compass, pitch and register through the
  worklet at 22.05–96 kHz, its piece, Fagotto I / Fagott / Bsn. 2 routed to three bassoons, a second by
  hand, ten picks in the phone band), `bassoon-2d.spec.ts`, `bassoon-3d.spec.ts`; `app.spec.ts`,
  `oboe.spec.ts`, `clarinet.spec.ts` count ten picks.

## Known gaps

Sound:
- C♯3–D♯3 at mf/ff (48 kHz) and E♭2 at mf (44.1 kHz) sit on their fundamental in the bore but radiate their
  odd harmonics weakly, so they lean towards their octave by ear; four cases at 22.05/96 kHz slide to their
  octave. The bore's resonances are exactly harmonic in this model (a real bassoon's are not), so its
  regimes compete; the fit holds the losses where the fundamental wins almost everywhere.
- No tone holes, half-hole, flick or whisper key in the sound: each note is the tube whose fundamental it
  is. The top register is approximate: the recordings' G4 and A4 are brighter than their neighbours (their
  second harmonic the strongest), the model's are not.
- The lowest notes' fundamental is too weak: B♭1's is ~45 dB under its strongest harmonic (the
  recordings: 9–14 dB), D2's and F2's ~33–42 dB (14–18). The radiation's derivative, its high-pass and the
  480 Hz formant all weigh against 58–90 Hz. A shelf below 130 Hz (+14 dB) brought them up ~10 dB and the
  harmonics' error down (8.46 → 8.08 dB held-out), but the judge against the fitted voicing said WORSE
  (2.07 → 2.13, Δ −0.06 ± 0.03: slower measured attacks), so it was not kept.
- ff's long-term ⅓-octave spectrum is 11 dB RMS off (pp 3.3, mf 3.9).

Pictures:
- 2D: the thumbs' 13 keys and 9 back pads are faint dashed ghosts; the keywork is sparser than the Fox's;
  the third octave's cross-fingerings draw their wave up to 12 % off; the vector look shows a length label
  while a note sounds, as the clarinet's does.
- 3D: pads the photograph does not show are laid out by the key diagram; the linkages are shown, not
  simulated (the trill key and B♭ sliver never move; the half-hole is one bit); no whisper-key lock; the
  varnish reads redder than a typical maple bassoon; 30 % more vertices than the clarinet.
