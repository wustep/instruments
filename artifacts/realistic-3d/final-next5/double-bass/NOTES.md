# Double bass (contrabass)

A seventh instrument: a 3/4 orchestral double bass, in the same physical-model family as the cello,
checked against the University of Iowa MIS double bass; drawn in both 2D styles and modelled in 3D; an
Orchestra voice that bass lines (by name or General MIDI program) reach.

Brief: `.autopilot/briefs/DOUBLE-BASS.md`. Branch `improve/double-bass`, based on `main` at `9cc76b6`.

## Sound

### The model

`packages/engine/src/core/bowed.ts` `BASS`: the cello's v2 physics (stick–slip friction with
torsional waves, the hair ribbon's width, the bridge hill, intonation by ear, rate-invariant
constants) on a bass's strings and body.

| | value | source |
|---|---|---|
| string length | 1.05 m | 3/4 orchestral mensur, 1.04–1.06 m (makers' 41–41.5") |
| strings | E1 A1 D2 G2, 330/315/300/285 N | steel-cored orchestral sets, 27–34 kgf (manufacturers' tension tables) |
| body modes | A0 60 Hz, corpus modes 88–125 Hz | Askenfelt, "Eigenmodes and tone quality of the double bass", STL-QPSR 23(4), 1982; the cello's set scaled |
| modal damping | 2.5 × the cello's loss factors | fitted (below) |
| bow | hair 0.58 m, ribbon contact 13 mm | French bass bow, makers' figures |
| radiation | half-octave bands from 50 Hz, the corner (brightness with bow force) | fitted to Iowa (`bowed-fit.json`, `scripts/fit-bodies.ts bass`) |
| loudness | median mf note equal to the cello's | the recordings' absolute levels are the microphone's gain |
| vibrato | 12 ¢ at 5.2–6 Hz | the Iowa bassist plays most notes without; real vibrato on a few at 6–7 Hz, 15–30 ¢ (the many "3 Hz, 3–8 ¢" detections are slow drift) |

Two findings on the way, both bass-only changes (every other instrument is bit-identical: their
golden snapshots and their calibration numbers are unchanged):

1. **Mono cancellation of the bass's lowest notes.** The bowed core sends every third body mode to
   the right microphone inverted (for stereo width). Mode 0 is A0, the f-hole air mode. On the
   violin, viola and cello A0 sits above the fundamentals; on the bass it is at 60 Hz, among them,
   so the mono sum cancelled D2 by 23 dB and C2 by 15 dB, and the first body fit (which, like the
   recordings' analysis, listens in mono) made up for it with a +24 dB band at 71 Hz that was far too
   loud in stereo (in the quintet the bass came out 14 dB over the cello). `design.inPhase` makes
   the signature modes (A0 and the B1 pair, the body's monopole radiators) radiate in phase at both
   microphones, with one weight at both (a monopole is the same in every direction: a random pan had
   left the bass 6.3 dB to the left wherever it sat; now 3.3 dB unseated, about the other bowed
   bodies' lean, and the mono sum, which the fit used, is identical either way); mid and stereo now
   agree (side 6–15 dB under mid). The cello shows a milder version at G2, next to its 102 Hz A0
   (9 dB); it is left as it is (the cello's sound is not this PR's).
2. **Uneven notes.** With the cello's modal damping, a note whose harmonic met a body mode came out up
   to 10 dB louder than its neighbours (median step between neighbouring notes 6.4 dB at mf; the
   recording's 3.0 dB). With 2.5× the damping: 4.5 dB, and the notes' levels follow the recording's
   within 6.5 / 4.8 / 3.9 dB SD at pp / mf / ff (the cello's: 4.4 / 4.1 / 3.7).

### Against the recordings (Iowa MIS double bass, arco, pp/mf/ff, 112 notes E1–G4)

Same analysis on recording and model (`scripts/calibrate-ensemble.ts --only bass`), the model rendered
dry at the recording's pitch and dynamic, vibrato only where the player used one.

| | start design (the cello's physics, unfitted) | fitted |
|---|---|---|
| harmonic profile error, dB RMS (median note) | 14.7 | **6.9** |
| long-term ⅓-octave spectrum, dB RMS | 9.4 | **4.9** (pp 7.1, mf 5.0, ff 4.9) |
| brightness (spectral centroid), model ÷ recording | 2.75 | **0.95** |
| even/odd harmonic balance, dB off (low/mid/high register) | 1.9 / 9.2 / 8.4 | 5.1 / 2.1 / 2.7 |
| noise (HNR), model − recording | −1.6 dB | +1.7 dB |
| attack time, model ÷ recording (median) | 1.21 | 1.37 |
| pitch, ¢ RMS | 2.4 | **2.1** |
| dynamic range pp→ff, dB (recording 11.0) | 14.3 | 13.7 |

For comparison, the Notes page's row for the cello: harmonics 11.2 dB, spectrum 15.5 dB, brightness
×0.60, pitch 3.1 ¢.

**Judge** (`scripts/judge.ts --instrument bass --before <start engine>`; notes alternate between a fit
half and a held-out half; the fit used the fit half only): **BETTER**, held-out score 3.68 → 1.98
(Δ 1.70 ± 0.16); harmonics 15.1 → 7.5 dB, centroid 1.43 → 0.30 octaves, pitch 0.70 → 0.63 ¢ (all
held-out |error|), noise 4.1 → 4.2 dB and attack 1.29 → 1.29 (log₂) unchanged, level (microphone gain)
8.8 → 8.8 dB. I looked at the held-out verdict after each of the three fits (the start → fit 1, the
corner variant, the final); the choices themselves were made on the fit half (the corner variant was
dropped as NO CLEAR CHANGE).

**Robustness** (`scripts/bowed-regimes.ts bass,cello`: every note of the lowest 28 semitones at five
velocities, 44.1 and 48 kHz, no vibrato): 3.9 % of the bass's notes start in a wrong regime (more than
15 ¢ off, or the first two harmonics 20 dB under the strongest) in 0.35–0.85 s, 0.7 % still after
0.85 s; the cello, the same survey: 2.1 % and 1.8 %. The cases a listener may meet: E3 on the G string
at velocity 90 (48 kHz) stays about 19 ¢ flat for as long as it is held, in a multiple-slip regime with
its fourth harmonic leading (intonation by ear cannot correct it: it measures only clean slips); the
open E at velocity 30 or 70 (48 kHz) starts on a higher partial and settles within about a second.

### Audio (`audio/`)

Rendered with `scripts/render-bass.ts --before <start engine>` (before = the start design, after =
fitted; one gain for both, the site's room) and `scripts/render-orchestra.ts`. Original material and
public-domain Bach only; no recordings are in the repository.

| file | what |
|---|---|
| `bass-open-strings-{before,after}.mp3`, `.png` | E1, A1, D2, G2 open, each at pp, mf, ff |
| `bass-phrase-{before,after}.mp3`, `.png` | an original legato line from E1, crescendo to ff and back |
| `bass-menuet-{before,after}.mp3`, `.png` | its own piece (the play icon's): Bach, Suite No. 1, Menuet II, as bassists play it, 22 s |
| `quintet-constructed.mid` | eight original chords in five tracks named Violin I, Violin II, Viola, Violoncello, Contrabass on GM 40/40/41/42/43 (the Daylight quintet's names and programs) |
| `quintet-constructed-before.mp3` | that file as the old routing played it: the Contrabass line on a second cello, an octave up |
| `quintet-constructed-after.mp3`, `quintet-constructed.png` | as it routes now: two violins, viola, cello and the double bass, the bass line as written |

Spectrograms: before on top. Per-note numbers (dry, each note alone) in `audio/metrics.json`: the
open strings' centroid falls from 290–1060 Hz to 79–217 Hz.

In the quintet (`render-orchestra.ts`, seats on): violin I −24.2, violin II −26.1, viola −19.4, cello
−28.2, double bass −24.9 dBFS RMS; the bass at the right end of the arc (seat x 1.60 m, 0.25 m
upstage), heard there: L − R −1.4 dB, the right channel 0.46 ms earlier.

## Orchestra

`apps/web/src/orchestra/assign.ts`:

* General MIDI: 32–39 (acoustic bass … synth bass) and 43 (contrabass) → the double bass; 42 → cello.
* Names: contrabass, double bass, contrebasse, Kontrabass, contrabbasso, contrabajo, violone, upright /
  string / acoustic bass, "Cb.", "CB", "Kb.", "D.B.", bass / basso / basse / bassi, tuba,
  contrabassoon → the double bass. Violoncello / "Vc." / basso continuo / bassoon stay the cello's; a
  bass clarinet, bass trombone or bass drum is not a bass ("upright bass" is not the upright piano).
* An unnamed line that goes below the cello's C has the bass as a candidate (it plays it as written
  rather than an octave up on the cello).
* Its compass E1–G4 (28–67); notes outside move by octaves. Centre (where its parts lie) E2.
* Max Richter's *On the Nature of Daylight* (the local copy in `.autopilot/fixtures`, not committed)
  now auto-routes to violin, violin, viola, cello, bass, every line unshifted; before, the Contrabass
  line went to a second cello an octave up. Tests use a constructed file with the same names and
  programs (`apps/web/test/bass-routing.test.ts`, `e2e/bass.spec.ts`).
* Duplicates: two basses on one line are two players (their own random stream and intonation);
  `addPart`, `setRoute`, `setPartVoice`, `reassign`, a hand-picked lineup all take the bass.

Its own piece (the play icon): Bach, Cello Suite No. 1, Menuet II (Mutopia 517, public domain), a
minor seventh down as bassists read the suites in solo tuning, ×0.9 tempo; every note in E1–F3.

## 2D (both styles)

`apps/web/src/ui/stage-draw.ts`, `ui/vector/bowed.ts`, `ui/ensemble-draw.ts` (drawn by a helper agent in
its own worktree, reviewed and cherry-picked; its notes are summarised here).

* The plate outline is constructed (`ui/gl/bass-outline.ts`: a 3/4 bass, body 1110 mm, bouts
  520/375/665, violin corners, sloped shoulders: the upper bout widest a quarter of the way down), and
  the f-holes are the constructed ones of #21 with one new `FHole` (`BASS_F`: 245 mm, eyes 22 and
  30 mm, `fholes.test.ts`). Shared with 3D.
* Machine heads (no pegs): a brass plate down each cheek, four staggered rollers with the strings
  coiled on them, a cog, a worm and an oval key per tuner; E and A keys on the bass side (E farthest
  from the nut), D and G on the treble side, as the cello's pegs are strung (no two strings cross in
  the pegbox: tested).
* Endpin (socket, thumbscrew, steel rod to its point 200 mm out), a 121 mm tailpiece on a steel tail
  wire, no fine tuner, bridge feet with a height adjuster in each leg, a French bass bow (frog and
  head 1.25× a violin's, its own 0.58 m of hair).
* Alone: lying on a laptop (675 px/m, the bass 95 % of the stage's width) and on a phone (183 px/m at
  390×844, its bow's whole travel inside the stage); upright boxes covered by unit tests.
* Orchestra (#24's one px/m): in the quintet every part at 229 px/m (desktop), the bass's cell 158×470
  against the cello's 108×320, its drawn plate 1.47× the cello's; every bow end at least 6 px from
  another instrument's cell at both ends of its travel; the group centred (gaps 133/137 px desktop,
  23/22 phone; two basses 13/16 and 11/11).
* Violin, viola and cello: all 36 offscreen renders (both styles, alone and at ensemble scale, three
  box sizes) pixel-identical to before (`scripts/bowed-2d-hash.mjs`).

## 3D

`apps/web/src/ui/gl/strings3d.ts`, the new `ui/gl/bass3d.ts`, `scenes3d.ts`, `stage3d.ts`,
`orchestra/seats.ts` (a helper agent's, reviewed and cherry-picked; references in
`docs/3d-reference.md`).

| | model | reference |
|---|---|---|
| body | 1109.8 mm | 1110 |
| upper / lower bout | 519 / 665 | 520 / 665 |
| ribs, neck block → tail | 148 → 200 | the Met's Plumerel bass: 156 / 200 / 197 |
| back | flat (1.8 mm off flat below the break), bent at the break at 24 % of the length, 10.5° | a bass's flat back with its cant |
| top arch | 30 mm | 25–30 |
| fingerboard / head | 880 / 330 | 880 / ~330 |
| height to the scroll | 1.97 m (endpin socket 0.22 m up, 15.5° lean) | the cello: 1.49 m |

* Worm-and-cog machines: a brass plate on each cheek following its shape, screwed round its edge;
  four brass rollers 40 mm apart with the strings coiled on them; 26-tooth cogs, steel worms in lugs,
  the shafts running back past the pegbox to brass keys. A French bass bridge (160 mm on 150 mm feet,
  heart and kidneys, a thumbwheel adjuster in each leg), steel tail wire, 5.5 cm silks, a 45 mm endpin
  collar with its thumbscrew and a 12 mm rod; a French bass bow.
* Framing: the hero view frames it whole (96 % of the free height on desktop and on a Pixel 7; it was
  cropped top and bottom before); phones 86–87 % of the stage's height, clear of the file player.
* Orchestra: a bass stands 1.1 m from its neighbours (others 0.8) and 0.35 m upstage; lineups without
  a bass seat exactly as before (80,000 random lineups at four aspect ratios byte-identical;
  `seats.test.ts` unchanged).
* 0 WebGL errors or warnings (alone and in a quintet, desktop and phone); varnish speckle mean 0.47,
  p99 2.17 (limits 0.8 / 5); frame time 2.45–2.50 ms against the cello's 2.76 (474 k vertices against
  408 k).

## Images

* `shots/`: the bass alone in 2D classic, 2D vector and 3D, desktop and phone, and the cello beside it
  for scale (this branch, `scripts/shots-bass.mjs`).
* `orchestra/`: the constructed quintet file dropped on the stage, playing, in each view, desktop and
  phone: `-before` from production (`main` at 9cc76b6: the Contrabass line on a second cello), `-after`
  from this branch (a real double bass) (`scripts/shots-bass-quintet.mjs`).
* `2d/`: the 2D helper's set: the placeholder (`before-`, the foundation commit) and now, alone and in
  the quintet, two basses, the bows at both ends of their travel, head, tail and bridge close-ups
  (taken before the picker's name became "bass").
* `3d/`: the 3D helper's review set: hero, front, side, back, the head and its machines, bridge, foot,
  phone, the cello for scale, quintets, and before/after compare sheets.

## Tests

* Engine: `packages/engine/test/bass.test.ts` (design, pitch ±5 ¢ on every string at 44.1 and 48 kHz,
  darker than the cello on the same notes, the E1 fundamental present), the bass added to
  `instruments.test.ts`, `bow.test.ts` (bow in the hand), `blocksize.test.ts` (bit-identical at
  128/37/500), `golden.test.ts` (new `golden/bass.json`; every other golden unchanged).
* App: `apps/web/test/bass-routing.test.ts` (names, programs, a constructed Daylight-like quintet,
  duplicates, hand routing, the keys), `assign.test.ts` (Kontrabass and GM 43 now the bass),
  `fholes.test.ts` (the bass's constructed f-hole), `bass2d.test.ts`, `ensemble-cells.test.ts` and
  `vector.test.ts` (2D: alone, the quintet at one px/m, bows clear), `models3d.test.ts` (3D: flat back,
  machines and no pegs, the endpin to the floor, a smooth arch).
* e2e: `e2e/bass.spec.ts` (picker, compass, the worklet at 22.05/44.1/48/96 kHz, its own piece, a
  quintet file → a quintet with a real bass, two basses by hand), `e2e/bass-2d.spec.ts` (alone and in
  the quintet, both styles), `e2e/bass-3d.spec.ts` (framed whole, no WebGL warning, varnish);
  `e2e/app.spec.ts` now counts seven instruments and includes the bass in the picker, 3D and no-zoom
  tests.
* The phone picker: seven instruments now fit in the width six took (37 px each), so a held note's
  readout still fits beside them; with 44 px the band grew 63 px when a note sounded and the 3D view
  reframed (the e2e "pianos in 3D: sustain leaves the camera alone" caught it).

## Left as it is

* The bass's pianissimo is 5–10 dB short between 600 Hz and 4 kHz; notes' levels still differ from the
  recording's by 5–6 dB SD note to note; the start-up regimes above.
* Alone in 2D the bass fills its own stage, so it is only about 5 % larger than the cello alone; it is
  1.47× in Orchestra, where the scale is shared. On a laptop its bow is cut at the stage's edge at the
  far ends of its travel, as the cello's is.
* 2D machine heads are a stylised front view (keys straight out to the side; on a bass the worms point
  back and out); the 2D frog is the cello's shape scaled.
* 3D: the scroll is the traced violin scroll scaled up, not a bass carving; the flame on the scroll and
  neck reads as strong wavy bands (the shader the cello shares); the height from the back to the
  bridge's top is 400 mm against 440–460 mm on makers' listings (the brief's 160 mm bridge kept).
* Found in passing, not fixed here: the cello's strings stand 26–28 mm off the fingerboard's end in 3D
  (its `proj` is low), and its G2 loses 9 dB in a mono sum (its inverted A0).
