# Horn

The eleventh instrument and the fourth of the symphony phase: a double horn in F and B♭, in the trumpet's
brass family (buzzing lips driving a bore), fitted to the University of Iowa MIS horn; drawn in both 2D
styles and modelled in 3D; an Orchestra voice that horn lines (by name in five languages, in any key, or
General MIDI program 60) reach, with parts typed at their written pitch heard at their sounding one.

Brief: `.autopilot/briefs/HORN.md` (item 4 of `SYMPHONY.md`), with `STANDING-PREFS.md` and
`ART-DIRECTION.md`. Branch `improve/horn`, based on `main` at `c9325be`. Engine: Claude Opus 5.5
throughout (the lead, and the 2D and 3D helpers in sibling worktrees, cherry-picked).

## Compass and transposition

| | written (horn in F) | sounding (concert) | MIDI |
|---|---|---|---|
| the model's compass | F2–C6 | B♭1–F5 | 34–77 |
| the usual orchestral compass | F♯2–C6 | B1–F5 | 35–77 |
| the Iowa recordings | F2–C6 | B♭1–F5 | 34–77 |

The engine plays at concert pitch: MIDI 53 is the F below middle C, the horn in F's written C4. The keys
show the sounding notes (B♭1–F5); the computer keys start at C3. The horn in F sounds a fifth below its
part; older parts are written for horns crooked in other keys (Beethoven's Fifth: horns in E♭, a major
sixth down; in C, an octave down) — see the Orchestra section for how a file's parts are heard.

## Sound

### The model (`packages/engine/src/core/horn.ts`)

| part | model | source |
|---|---|---|
| lips | a one-mass outward-striking valve: a mass on a spring driven by Δp = mouth − mouthpiece pressure, pushed open by it, its resonance 0.61 semitone under the note (an outward-striking valve plays above its own resonance, where its motion lags the pressure by more than a quarter cycle); opening h = max(0, h₀ + y), at most 2.1; its quality factor fitted at 47 (B♭1) to 55 (F5) | Helmholtz; Fletcher 1979; Elliott & Bowsher 1982; Adachi & Sato 1996 |
| flow | Bernoulli's through the slit, u = ζ·h·√\|Δp\|·sgn Δp, solved with the mouthpiece pressure p = a₁ + a₂ + u/2 in closed form each sample (a quadratic in √\|Δp\|) | |
| bore | the oboe's and bassoon's "cylindrical saxophone": two delay lines meeting at the lips, the tube and its missing apex, both open (−1 at 0 Hz). A single tube closed at the lips plays only the odd multiples of c/4L (a clarinet); a cone, the whole series n·c/2(L + x₀). The apex is an effective length set so that the cone's weak resonance falls at 3.46 × the note (long on a low note, short on a high one) | Dalmont, Gilbert & Kergomard 2000 |
| bell | reflects through a second-order low-pass at 1.2 kHz (Q 0.54), the round trip's loss 5.4 % at audio frequencies; radiates the complement | Fletcher & Rossing 1998 §14 |
| brassiness | the wave reaching the bell steepened by its own pressure (a crest travels faster than a trough), 0.0205 of the round trip per unit pressure (at most a sixth of the note's period), in the radiated sound | Hirschberg et al. 1996; Campbell 1999 |
| radiation | a high-pass at 267 Hz, a broad lift at 663 Hz (+1.5 dB, Q 0.32), a low-pass at 1.9 kHz whose corner falls 1.9 octaves from ff to pp (the hand in the bell, the bell turned away), a shelf −18.6 dB above 3 kHz; the level +2.3 dB an octave up the compass | fitted |
| fingering | the double horn's usual chart: the F side (3.74 m) to C4, the B♭ side (2.8 m, the thumb valve) from C♯4; the fewest valves on the lowest usable partial (7th, 11th, 13th, 14th avoided); the low B♭1 the B♭ side's pedal (`hornFingering`) | Farkas 1956; Fletcher & Rossing §14.6 |
| dynamics | the mouth pressure γ from velocity, 0.25 to 0.64 (velocity^2.16), a little higher up the compass | |
| tonguing | the lips held still 12 ms while the breath builds (rise 17 ms at velocity 1 to 48 ms at 127), then let go over 2.6 periods, swinging (a kick at their own frequency) and loose (their Q starts 39 % lower and firms up over 113 ms), their coupling ×2 at first (87 ms) | the trumpet's (brass.ts) |
| noise | turbulence in the slit, ∝ the flow (0.17) | fitted |
| tuning | a measured table per note at 22.05, 44.1, 48 and 96 kHz at mf (`horn-tuning.json`, `scripts/tune-horn.ts`) | |

### What the fits found (`scripts/fit-horn.ts`)

The bassoon's (1+1) evolution strategy over the voicing (37 parameters at the end), scored on the fit half
only (even MIDI numbers) as the judge scores (harmonics, centroid, noise, attack, over the recordings'
spreads), plus the pp→mf→ff level steps paired note by note, the level across the compass (ff, the one
dynamic recorded over the whole of it, and mf's low against its high notes), the analysed notes' pitch
(a note 60 ¢ off is on another partial), and the register survey of the model alone: every note at pp, mf
and ff at the four rates, held 1.5 s. Pitch is left to the tuning table, absolute level to the gain.

Before any fitting, three structural findings (each a register survey, `scripts/horn-regimes.ts`):

1. **A cylinder is not a horn.** The first bore was one delay line closed at the lips and inverted at the
   bell: its resonances are the odd multiples of half the tube's fundamental, and nearly every note sounded
   on its tube's pedal or a wrong partial (2 of 132 right). The two-branch cone plays the whole series.
2. **The lips must be sharp.** An outward-striking valve feeds the bore mode just above its resonance; at Q
   6–16 the neighbouring partials (a tone apart up high) competed and the low notes did not speak; at Q ~45
   all 528 cases held their partial. But a resonance that sharp builds slowly (its bandwidth f/Q is 1.3 Hz
   at 60 Hz): the low notes took 300–600 ms to speak. What made them quick was a long apex on the low
   notes (strong low resonances), not a lower Q or a kick.
3. **Where the cone's gap falls.** A gap a fixed number of partials above the note (fit 1: 7.9) put it on
   the second harmonic of every note on its tube's sixth partial (C4, E♭4–F4: their second harmonic 15 dB
   weak, their third too strong). As a multiple of the note (3.46×, between the third and fourth harmonics)
   it costs nothing audible: harmonics 5.98 → 3.81 dB RMS at one stroke.

And one physical addition: the top notes at ff were far too pure (their 3rd–5th harmonics 20 dB under the
recordings'), as no colour filter could fix without making pp wrong. A loud horn is brassy because the wave
steepens on its way down a long narrow tube (Hirschberg et al. 1996); read with the bell's wave shifted by
its own pressure, the ff top notes gained 10–20 dB in their upper harmonics and pp almost nothing.

Fits: 1 (start design → 3.16 on the fit half, held-out 3.97); 2 (with the multiple-of-the-note gap and the
steepening as free parameters, stopped when the search sat on its old optimum: the stronger steepening and
the 3.5× gap, tried by hand, were far better); 3 (from there); 4 (with the noise and the breath's rise
following the note): fit half 2.81, held-out 3.68 in the fit's own score.

### Against the recordings (Iowa MIS horn, pp/mf/ff, 87 notes B♭1–F5)

The reference: the MIS "French Horn" set (`https://theremin.music.uiowa.edu/MISFrenchhorn.html`, Jessica
Wiskus, 1997, anechoic, Neumann KM 84 at 5 ft; "may be downloaded and used for any projects, without
restrictions"), analysis only, never played, never committed (`.cache/iowa-ens`). Its runs are uneven: ff
covers B♭1–F5, mf B♭1–B2 and C4–F5 (its C4–F4 do not segment: 6 of 12), pp only B♭1–B1 and C4–F5; the set
has no pp C2–B3 and no mf C3–B3 runs (the post-2012 page has only the same ff, split). About a third of the
low notes carry a slow 3–4 Hz lip wobble; the model plays without.

What the recordings say: the harmonics gather near 450–600 Hz from B♭1 to C4 (the strongest the 7th–9th
at B♭1, the 3rd at E♭3, the 2nd at C4), the low notes' fundamental 12–20 dB under it; from F4 up the
fundamental is the strongest and pp is nearly pure (the 2nd 10–30 dB under); ff is brassy, its top notes'
harmonics strong to 2–3 kHz; the harmonics-to-noise ratio rises from ~32 dB at B♭1 to ~48 dB at F5.

Same analysis on recording and model (`scripts/calibrate-ensemble.ts --only horn`), dry, at the
recording's pitch and dynamic:

| | start design (3bd698b, unfitted) | fitted |
|---|---|---|
| harmonic profile error, dB RMS (median note) | 10.1 | **3.9** |
| long-term ⅓-octave spectrum, dB RMS | 22.7 (pp 6.5, mf 10.0, ff 22.8) | **14.4** (pp 3.3, mf 3.8, ff 14.4) |
| brightness (centroid), model ÷ recording | 0.73 (pp 0.98, mf 0.73, ff 0.69) | **1.00** (pp 1.01, mf 1.01, ff 0.94) |
| even/odd balance, dB off (low/mid/high third) | −0.8 / −3.1 / −8.2 | −0.2 / 0.8 / −0.5 |
| noise (HNR), model − recording | +13.4 dB | **+0.7 dB** |
| attack time, model ÷ recording | 2.78 | **1.14** |
| pitch, ¢ RMS | 6.9 | **0.2** |

**The judge** (`npx tsx scripts/judge.ts --instrument horn --before <3bd698b>/packages/engine/src/core/index.ts`):
**BETTER**. Held-out score 7.77 → 2.26 (n = 44, Δ 5.51 ± 0.23); fit half 7.94 → 2.18 (n = 43); no guard
broken. Held-out per measure: harmonics 9.90 → 4.96 dB, centroid 0.42 → 0.10 octave, noise 12.2 → 2.4 dB,
attack 1.64 → 1.05 octave, pitch 6.15 → 0.15 ¢, level 6.65 → 1.47 dB.

Disclosures: the structure changed five times (the bore, the lips' Q range, the apex twice, the
steepening, the noise and rise by the note) and each fit printed its held-out score; fit 2 was stopped and
the hand-tried start of fit 3 (the 3.5× gap, steepening 0.02) chosen on the whole set's numbers, not the
held-out half's alone.

### Registers, loudness, taps, pitch

Every note B♭1–F5 at pp, mf and ff at 22.05, 44.1, 48 and 96 kHz, held 2 s and read in the mouthpiece,
sounds on its own partial: **528 of 528**. The level is the median recorded note's (pp, mf, ff each within
0.3 dB); its ff (−17.5 dB) sits with the Iowa trumpet's (−16.9) and bassoon's (−18.1), so the Orchestra's
balance is the recordings'. A 50 ms tap speaks within 8 dB of the held note (`taps.test.ts`); pitch at pp,
mf and ff is within 1 ¢ (one table, no offsets).

Audio (`audio/`, before = the unfitted start design, after = fitted, one gain, through the site's room):
long tones B1, F2, C3, G3, D4, A4, E5 at pp, mf, ff; an original call in F up the arpeggio from F2 to C5 and
a legato line back down with a swell; the Op. 17 line as the play icon plays it. Spectrograms stack before
over after; `metrics.json` has each long tone's centroid, level and pitch. `scripts/render-horn.ts`.

## Orchestra

- **A voice of its own** (`assign.ts` `VOICE_INFO.horn`: B♭1–F5, centre C4, one note at a time), family
  `brass` (seated with the trumpet), heard from its seat; up to four by the picker (Beethoven's Fifth has
  two, sometimes four), more by the routing grid; a second horn on a line is a second player (its own
  noise, tuning and vibrato).
- **By name**: horn(s), French horn, Waldhorn, Hörner, corno/corni, cor(s), cor d'harmonie, trompa(s),
  mellophone, "Hn.", "Hns", "Hr.", in any key ("Horn in F", "Corni in Es", "Corni in B basso", "Horn in B♭
  alto": the horn rule runs before the double bass's "basso" and the viola's "alto"). They went to the
  trumpet. Its namesakes stay where they were: the English horn and cor anglais (the oboe's), the basset
  horn and corno di bassetto (the clarinet's), the flugelhorn, post horn, cornet and cornetto (the
  trumpet's; the Flügelhorn's "fl" before its umlaut no longer reads as the flute's abbreviation).
- **By program**: General MIDI 60 (it went to the trumpet). The rest of the brass (56–63) stay the
  trumpet's until the trombone is built.
- **Transposing parts sound at concert pitch.** A MIDI file's notes are normally its sounding pitches (a
  notation program writes the horn in F's part a fifth above the sound and its MIDI at the sound:
  LilyPond's `\transposition`, Mutopia's files, MuseScore, Sibelius), so a horn part plays as the file has
  it. A part typed into a file at its written pitch would sound a fifth too high. Its name says what it was
  written for (`keyOfName`: English, German — B is B♭, H is B, Es, As, Fis —, Italian and French: "Horn in
  F", "Corni in Es", "Clarinetto in A", "Cor en Fa", "Corno in Mi♭"; a horn named without a key is in F);
  `transpositionOf`: a horn in X sounds X below the written C (F −7, E♭ −9, D −10, C 0 or an octave), the
  others the nearer way (B♭ −2, A −3, E♭ +3, D +2); octaves are left to the line's fit to its instrument.
  `concertShift` moves the line only when its pitch classes, moved, match the other lines' (each counting
  equally) better by 0.25 in Pearson's r, with at least 16 notes: a natural horn's part in E♭ written in C
  (its Cs, Es and Gs are the file's E♭s, Gs and B♭s) moves a sixth down, a horn part in F written in C in
  an F-major piece a fifth, a clarinet in A's a minor third; each of them typed as it sounds stays, and so
  does every line of every shipped file (tested; the Réjouissance's trumpet, written a tone high, keeps its
  piece's own −2). A part moved this way plays at concert pitch on whatever plays it (a cello reading the
  horn's written part too). Shown in e2e: a constructed file with "Corno I in F" as it sounds, "Horn in F"
  as written and "Hn. 3" — three horns, the written one a fifth down.
- **A line's core range.** The name test and the octave fit read a line's range without its outermost 2 %
  of notes (`MidiLine.core`): the Horn Sonata's 13 pedal notes in 1120 (F1, C1: written C2 and G1) had sent
  its horn line to the double bass. Every other shipped file plans as before, but one: Mozart's K. 191
  dropped in as a file, whose solo bassoon line (double stops: no wind holds it) went to the double bass
  and now goes to the cello, at pitch.
- **Beethoven's Fifth** (Mutopia's `Symphony5_1.mid`, which the symphony PR will ship): its horns are line
  "five:" with instrument name "english horn" and GM 69 (and its trumpets "six:", the same), at concert
  pitch (the horns' G G G E♭). Neither name nor program says horn, so they reach the oboe or a string by
  range; a horn chosen for the line plays it as the file has it (tested). Routing that file by line is the
  symphony PR's.
- **Its own piece** (the play icon, the folder on a phone): the horn's line of Beethoven's Sonata for Piano
  with Horn in F, Op. 17, I. Allegro moderato, from its second call (bar 11, after the piano has answered
  the first) to the low C that closes the theme (bar 29, 37 s). Mutopia-2007/02/01-919 (Jay Anderson, from
  the Mollo edition of 1801), **public domain**, the file byte for byte (sha256 in `pieces.ts`); the file
  gives the horn its sounding pitch. `Demo.start` (new) begins a demo after a rest.
- **The picker** has eleven instruments. On a phone they keep the width six took (271 px): eleven 22.8 px
  picks and their 2 px gaps (270.8 px); names 8 px, and the violin, clarinet, bassoon and trumpet show their
  score abbreviations there ("vln.", "clar.", "bsn.", "tpt.": with eleven, "pianoviolinviola" and
  "horntrumpet" read as one word). The band does not grow when a note sounds (Pixel 7 and 390×844, e2e).
- **Its addresses**: `/horn` and the alias `/french-horn` (address.ts `INSTRUMENT_PATHS`), both in both of
  vercel.json's SPA rewrites; `apps/web/test/vercel-paths.test.ts` names both, so production cannot 404 on
  them as it did on `/oboe` after #30.

## 2D, both styles (`apps/web/src/ui/horn-draw.ts`, `apps/web/src/ui/vector/horn.ts`, `apps/web/src/ui/horn-plan.ts`)

A Kruspe-wrap double horn from its outside, as makers photograph it: the bell to the left, the mouthpiece
up at the right, the four rotors in a column (the thumb's change valve on top), drawn to measure from the
Besson BE 702 (front, back and parts diagram), the Yamaha YHR-667V, the Buescher 400 and Martin Steiger's
horn (Wikimedia Commons, CC BY 2.5 / CC BY-SA 3.0 / 4.0 / CC0) and museum records: bell rim 311 mm (Conn 8D
12¼″; Alexander 103, Hoyer 6801 310 mm), the flare fitted to an Edinburgh (MIMEd) Alexander double horn's
bore readings (114 mm at 74.5 mm from the rim, 16.8 mm at 835 mm), the circle ~0.32 m (records 300–326),
the horn 0.61 × 0.43 m (records 620–635 × 435), tubing 12.6 mm, rotors 36 mm apart with 26 mm caps, an
87 mm mouthpiece. The leadpipe, the F and B♭ tuning slides, the F side's long loop, each valve's F and B♭
slides and the body winding round into the bell are one plan in metres (`horn-plan.ts`) whose air path
matches the engine's tube: the open F side 3.739 m (the engine 3.74), the open B♭ side 2.800 m, every
valve slide within 1.1 % of its share, every note B♭1–F5 within 3.0 % of `hornTubeLength`. Live: the levers
follow `hornFingering` on springs (the thumb down on the B♭ side), each rotor's crank and the two passages
engraved on its cap turn a quarter turn, the levers lift 0.8 s after the breath stops; the standing wave
(`focus.shapes[0]`) runs along the actual air path through the pressed slides (a glow in the classic style,
hatching that nearer tubes hide in the vector one); the lips buzz with one cycle of the engine's trace,
slowed; a cupped right hand sits in the bell in both styles. About 1110 px/m on a laptop (86 % of the
stage's height), 94 % of a phone's width, clear of the file player and the keys; an Orchestra cell at the
strings' px/m (`hornBox()`). Two critique passes against the Besson photograph (`2d/review-cycle-1…2.jpg`):
the bell leaving the circle along its tangent, the flare refitted, the hand with fingers and a thumb, the
slides' nickel inner tubes, a quieter glow. Review set: `2d/` (50 JPEGs, 2.0 MB: the trumpet stand-in at
3bd698b, and the horn at rest, F2, A♭2, G3, D4, G4 and E♭5, laptop, Pixel 7 and 390×844, both styles, the
Orchestra on a laptop and a phone in both styles, close-ups of the valves and the lips);
`scripts/shots-horn-2d.mjs`; the `__horn2d` test hook; `apps/web/test/horn2d.test.ts` (14),
`e2e/horn-2d.spec.ts` (4).

## 3D (`apps/web/src/ui/gl/horn3d.ts`)

A Kruspe double horn in F/B♭ (the Conn 8D, Holton H179, Hoyer 6801 class) at real scale, laid out from
the Besson BE 702 photographed from both sides (0.621 mm a pixel at its 311 mm rim) and its numbered
drawing, the Yamaha YHR-667V, a Denis Wick 7N beside a rule, players' photographs and makers' specs
(0.468″ bore, 12¼″ bell; Hoyer 11.9 mm / 310 mm): the leadpipe (Ø 10.5 → 13 mm) into its own wrap; the bell
branch round the outside of the coil (312 mm across, the photographs 314–317), widening as a Bessel horn
to a 311 mm rolled rim (Ø 86 mm at 100 mm from the rim, the photograph 84); the F loop as the photographs'
tall nested ovals; each valve's F and B♭ slides on two levels, the main slide with its water key, braces,
ferrules, nickel-silver slide tubes; four rotary valves (bearing and stop plates, rubber bumpers) turned by
four levers on an axle with return springs and spatulas through a four-bar linkage (18° of lever, ~11 mm at
the spatula, turns its rotor exactly 90°); the finger hook, the hand rest, the mouthpiece. Air paths F
3.740 m and B♭ 2.800 m (the engine's 3.74 and 2.80). Lacquered yellow brass (`hornBrass`: a lacquer drift,
fingerprints where the hands hold it), nickel trim. Live: `hornFingering` presses the thumb's lever on the
B♭ side and the valves' levers, on springs with a small bounce, back ~0.8 s after the note; the bore glows
faintly along the air's actual path (the side played, the pressed valves' slides only) while the lips
blow; the lips' line at the rim follows `fr.lips`, the bell's mouth shimmers with the level. The hero is
the player's side; a phone held upright swings round towards the bell's mouth (92 % of a 390×844 phone's
width, 77 % of its free height); in the Orchestra it is held as a seated player holds it (the caps' side
37° to the audience, levers up, the bell down and back by the right thigh, the mouthpiece at 1.18 m).
Frame 2.80 ms at 1440×900 @2× (the bassoon 2.20 in the same run; @1× 2.28 against 2.19: the extra is the
bell's area), 1.66 ms on a phone (lite), built in 113–150 ms, 816k vertices, no WebGL warning or error alone
or in an Orchestra with two horns, desktop and phone. Four critique passes against the photographs
(`3d/review-cycle-1…4.jpg`; credits in `3d/README.md`); measures and sources in `docs/3d-reference.md`;
`scripts/shots-horn-3d.mjs`, `scripts/sheet-horn-3d.py`; `apps/web/test/horn3d.test.ts` (8),
`e2e/horn-3d.spec.ts` (6). `stage3d.ts`'s framing key names the brass instrument, so going from the trumpet
to the horn reframes.

## Tests

- Engine (`packages/engine/test/horn.test.ts`, 7): the double horn's chart (the F side to C4, the B♭ side
  from C♯4, the usual choices note by note, every note's tube); pitch B♭1–F5 within 6 ¢ at 44.1 and 48 kHz;
  every third note on its own partial at pp/mf/ff (held 1.5 s, read in the mouthpiece); the low notes'
  strongest harmonic at 250–800 Hz over their fundamental and the top notes' fundamental over their second;
  ff ≥ 8 dB over pp and brighter; the compass's ends; a second player. Also in `blocksize` (bit-identical at
  128/37/500), `golden` (a new `horn.json`, the others unchanged), `dynamics` (CC_DYNAMICS, CC_REST),
  `sounding`, `taps` (a 50 ms tap speaks within 8 dB of the held note).
- Web: `horn-routing.test.ts` (9: names in five languages, keys and abbreviations, its namesakes, GM 60,
  the compass, keys of names, written→sounding, concert shifts on constructed files and on every shipped
  file, the core range, Op. 17's demo, two to four horns and their players, Beethoven's Fifth's
  "english horn" lines); `address.test.ts` (`/horn`, `/french-horn`, four horns in an Orchestra address);
  `vercel-paths` (both paths); `assign`/`oboe-routing`/`clarinet-routing`/`bassoon-routing` updated
  ("Corno in F" and GM 60 reach the horn).
- e2e: `e2e/horn.spec.ts` (/horn and /french-horn and a reload, the picker, the keys' compass, pitch on its
  partial through the worklet at 22.05–96 kHz on both sides, louder with velocity, its piece from the
  overlay, the constructed Orchestra file with a written-pitch part, four horns by hand); `app.spec.ts`,
  `oboe.spec.ts`, `clarinet.spec.ts`, `bassoon.spec.ts` count eleven picks (and the phone's
  abbreviations); the horn is in `app.spec.ts`'s every-instrument checks (at pitch, the vector display, 3D
  from live frames, no close-up off the pianos, no WebGL warning); `horn-2d.spec.ts` (4), `horn-3d.spec.ts`
  (6).
- The gate on the merged branch: `pnpm typecheck`; `pnpm build` (the worklet parses in Safari 14.1);
  `pnpm test` 579 passed; Playwright 180 passed, 22 skipped (desktop and Pixel 7; "the bow in the hand"
  failed once, the known flake, and passed on its rerun).

## Known gaps

Sound:
- The lips' fitted Q (~50) is far above the 3–10 measured on players' lips: the one-mass model needs it to
  hold a note on its partial (see the fits). Its cost is a start limited by the lips' bandwidth, softened
  (attack ×1.14 overall) but not gone.
- The bore's resonances are exactly harmonic (a real horn's are not: its lowest resonance is far below the
  pedal, which it does not support), so the low B♭1 (the B♭ side's pedal) is as easy as any note, and
  lipping a note off its partial, "bending", is easier than on a horn.
- No stopped or hand-horn notes: the right hand is in the radiation's colour only; no half-valve, lip trill
  or rip between partials beyond what the lips' glide does on a slur.
- B♭2–B2 have their second harmonic strongest (at 233–247 Hz); the recordings' have their fourth (the
  formant region), the second ~4 dB under.
- ff's long-term ⅓-octave spectrum is 14 dB RMS off (pp 3.3, mf 3.8): the ff recordings keep more energy
  above 2 kHz than the model, though the steepening brought their harmonics most of the way.
- Fit on 87 notes with holes: no pp C2–B3, no mf C3–B3 in the Iowa set; the middle register's soft playing
  is the model's own extrapolation. The recordings' low notes' slow lip wobble is not modelled.
- Beethoven's Fifth's horns (Mutopia's file) are labelled "english horn" (GM 69): routing them by line is
  the symphony PR's.

Pictures:
- 2D: the bell is drawn to its measured size and reads longer than in photographs (their perspective
  magnifies the bell); the inner loops follow the parts diagram rather than an 8D's exact plumbing; the
  levers' links stretch a little as the cranks turn; the lips are small at laptop scale (as the trumpet's);
  the vector style's vibrato slot reads the vibrato off the pitch (the frame has no vibrato field).
- 3D: no right hand in the bell (it would need a rigged, skinned model the stage does not have); the third
  valve's slides are 95 % (F) and 80 % (B♭) of their theoretical length (no room left in the coil's foot);
  the plumbing inside the valve cluster is not traced tube by tube; the linkage's sizes and the leadpipe's
  taper are typical, not sourced; the rotor caps are plain, not engraved.
