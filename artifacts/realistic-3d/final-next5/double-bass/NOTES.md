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
   microphones; mid and stereo now agree (side 6–15 dB under mid). The cello shows a milder version
   at G2, next to its 102 Hz A0 (9 dB); it is left as it is (the cello's sound is not this PR's).
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

In the quintet (`render-orchestra.ts`, seats on): violin I −24.1, violin II −26.2, viola −19.6, cello
−28.4, double bass −23.8 dBFS RMS; the bass on the right end of the arc (seat x 1.47 m).

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

## Tests

* Engine: `packages/engine/test/bass.test.ts` (design, pitch ±5 ¢ on every string at 44.1 and 48 kHz,
  darker than the cello on the same notes, the E1 fundamental present), the bass added to
  `instruments.test.ts`, `bow.test.ts` (bow in the hand), `blocksize.test.ts` (bit-identical at
  128/37/500), `golden.test.ts` (new `golden/bass.json`; every other golden unchanged).
* App: `apps/web/test/bass-routing.test.ts`, `assign.test.ts` (Kontrabass and GM 43 now the bass),
  `fholes.test.ts` (the bass's constructed f-hole).
* e2e: `e2e/bass.spec.ts` (picker, compass, the worklet at 22.05/44.1/48/96 kHz, its own piece, a
  quintet file → a quintet with a real bass, two basses by hand); `e2e/app.spec.ts` now counts seven
  instruments and includes the bass in the picker, 3D and no-zoom tests.
