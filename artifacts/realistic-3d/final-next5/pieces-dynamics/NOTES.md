# A MIDI file's dynamics: the file's own, and automatic expression where it has none

Stephen, 9 Nov 2026, 8:07 PM: "also add dynamics so it's not so stale". He meant dropped-in MIDI,
Max Richter's *On the Nature of Daylight* (string quintet) above all. Brief:
`.autopilot/briefs/PIECES-DYNAMICS.md`. The Daylight MIDI stays in `.autopilot/fixtures/` (not
committed). Only the 70-second excerpt rendered below is here.

## What was stale

1. **The file's controllers were thrown away.** `midi-file.ts` kept notes and the three pedals
   (CC64/66/67). Volume (CC7), expression (CC11) and the mod wheel (CC1) never left the parser, so
   neither the single instrument nor an orchestra part ever heard them. Only a plug-in keyboard
   reached the engines' CC1/CC11.
2. **Most files have no dynamics anyway.** Every built-in piece and every instrument's own piece has
   one velocity per line (Haydn 81/81/63/63; Bach 63/97/97/66/79/79/90/90; Playford's Greensleeves
   all 127; Chopin 28/20 all 90) and CC7 = 100 throughout. Daylight is nearly the same:
   - Violin I is all 60.
   - Violin II alternates 84/81 (an accent pattern).
   - The lower three play 84 for 88 s, then 72 until a short diminuendo in the last 20 s.
   - CC7 is set once per track (100/100/118/94/100). CC11 is 127 until a 10-second fade at the very
     end (beats 353–372 of 372).
   So 330 of its 350 seconds play every note of a part at one level, with no swell on any held chord.
3. **Passing the raw CCs to the engines would not have helped.** I measured this on main, held
   note, velocity 72, RMS 1.2–2.2 s:

   | CC11 → | none | 0 | 32 | 64 | 95 | 127 |
   |---|---|---|---|---|---|---|
   | violin | −32.6 | −35.6 | −35.7 | −31.3 | −30.9 | −29.5 dB |
   | cello | −30.6 | −31.5 | −30.8 | −30.6 | −30.6 | −30.7 dB |
   | flute | −19.9 | **−65.9** | −22.2 | −20.3 | −19.9 | −20.0 dB |
   | trumpet | −19.6 | **−75.2** | −35.3 | −24.3 | −19.6 | −16.5 dB |

   On the strings the engines' CC1/CC11 is bow *force* only, which is timbre. The cello moves
   0.5 dB across the whole range. CC11 = 127, the usual "full" value, also sits above the engines'
   neutral (force ×1.5, breath ×1.2). And 0, a common reset at the top of a GM track, silences the
   flute and trumpet. For comparison, velocity 20 → 127 spans 22 dB on the violin and 14 dB on the
   trumpet.

## What is mapped now

| A file's | piano | bowed strings | flute, trumpet |
|---|---|---|---|
| **CC7 volume** | gain on the part's output | gain | gain |
| **CC11 expression** | gain | gain | gain |
| **CC1 mod wheel**, only where it moves | — | engine CC1 (bow pressure), as the keyboard's wheel | engine CC1 (breath) |
| **velocity** | as written | as written | as written |
| **automatic expression** (flat parts only) | velocities | velocities + swells (bow speed, force, vibrato) | velocities + swells (breath) |

- **Gain.** Each of CC7 and CC11 is 40·log₁₀(value/127) dB (General MIDI Level 2). Volume is measured
  against the loudest the file sets, at least the default 100. A file that sets 100 everywhere (every
  Mutopia piece) plays as one that sets nothing; Daylight's 94/100/118 keep their balance with the
  viola at unity. The gain is `setTargetAtTime(…, 20 ms)` on each engine's own output `GainNode`,
  sample-accurate on the context clock. There are no zipper steps and no DSP change.
- **Mod wheel.** It goes to the engines' existing CC1, remapped to the upper half of its travel
  (0 → 0.5, 127 → 1), so a file's wheel at 0 never silences a flute or trumpet. A wheel set once and
  never moved (a reset) is no gesture and is ignored. When the file stops, the engine gets back the
  hand's own wheel, or `CC_REST` (engine: "as if never moved") if the hand never touched it.
- **Routing.** Everything is per line. In an ensemble, each part that plays a line takes that line's
  dynamics. That covers many-to-many routing and duplicates: a line on two parts reaches both, and a
  second cello on its own line takes its own. A part with several lines takes the loudest line's
  gain, and the mean of the swells and wheels of the lines that move them. Pause, seek, toggling,
  rerouting mid-file and a resume all *chase* the controllers: the last of each, per line, is sent
  again where play starts. Stop puts every engine back at rest (gain 1, no swell, wheel as the hand
  has it).
- **Not regressed.** Pedals (CC64/66/67) are untouched. The plug-in keyboard path (velocity, pedals,
  bend, wheel, aftertouch) is unchanged: `audio.onMidi` was not touched beyond remembering the hand's
  pressure controller for that restore.

## How "flat" is decided (`lineShapes` in `apps/web/src/expression.ts`)

Per line, near each note (three seconds and two notes either way), the file **moves its own
dynamics** if either holds:
- the velocities there spread **6 steps or more**, or
- a CC7, CC11 or CC1 value there travels **6/127 or more** (counting the value in force as the window
  opens).

A line where that holds near **a quarter of its notes or more** is its own. It plays exactly as
written, and `express()` returns the very same events array. Below a quarter, the line is flat and is
phrased. Where an otherwise flat line moves its dynamics (Daylight's end fade, a terrace change), the
phrasing makes way: none on those notes, half within three seconds of them.

Daylight's five lines come out flat (2 %, 7 %, 7 %, 10 %, 10 % of their notes near a move), and the
fade's last notes stay as written. Violin II's 84/81 accent pattern is 3 steps, so it is no gesture.
The lower parts' 84 → 72 terrace is a single step, so they are still flat and both terraces are
kept. A performance (velocities that move note to note) and a file of CC11 hairpins are both "own".
All of these cases are in `apps/web/test/expression.test.ts`.

## Automatic expression (on by default; the hairpin in the player turns it off)

These are the KTH performance rules (Friberg, Bresin & Sundberg 2006, *Adv. Cogn. Psychol.* 2), with
the phrase arch after Todd (1992, *JASA* 91). Everything is in velocity steps, added to the file's
own velocities and centred on each line's mean, so a flat line keeps its level and its terraces.

| rule | size |
|---|---|
| phrase arch: crescendo to ~60 % of the phrase, then diminuendo | 16 steps trough → peak |
| the pair of phrases | 8 |
| the whole piece (peak at 62 %) | 8 |
| high loud: per semitone from the line's middle | 0.25, ±4 at most |
| duration contrast: per doubling of a note's length | 2.5, ±4 |
| downbeat | +4 |
| a chord's top / bass / inner notes | +3 / +1.5 / −1.5 |
| each note's own unevenness, a stream per line ("per-voice variation") | 2.2 (1σ) |
| a note is never moved more than | ±20 |
| ceiling (a file at 127 is phrased below it, its shape kept) | 122 |

- **Phrases** are 1–16 bars, the longest grouping within 15 s, from the file's time signatures (bar
  lines are now parsed). The grid's phase is chosen from the music: of the ways to group the bars,
  the one whose boundaries fall most often where a line lets go of a long note or rests (the KTH
  punctuation cue). Daylight gets 4 bars (14.8 s); Haydn's adagio 2 bars (10 s).
- **Swells (messa di voce)** apply to a chord held 1 s or more until the next one begins: 5 steps at
  1 s, +4 per further second, up to 16. The swell peaks later while its phrase rises and earlier while
  it falls. The note begins softer by the swell's mean, so its average is still the phrase's level.
  The swell goes as `dyn` events (every 0.15 s) to the engine's new `CC_DYNAMICS`.
- **`CC_DYNAMICS`** (engine, `core/instrument.ts`, controller 131) means "the note played on as if
  begun this many velocity steps harder". Velocity is the axis each sustaining core is fitted along
  (pp/mf/ff of the Iowa recordings), so a swell does what a louder note does. It glides with
  τ = 60 ms.
  - **Bowed:** bow speed and force, from the note's velocity curve. The contact point stays where
    the stroke began, because a whole-sample bow tap must not jump under a held note. The speed makes
    up the difference (Helmholtz amplitude ∝ v/β). Vibrato widens ×(1 ± 0.25) over ±20 steps (MacLeod
    2008, *JRME* 56: wider at forte).
  - **Flute and trumpet:** the breath and the lips as velocity sets them.
  - **Piano:** ignores it.

  Measured on a held note at velocity 72, RMS 1.5–2.5 s:

  | Δ steps → | −40 | −20 | −10 | 0 | +10 | +20 | +40 |
  |---|---|---|---|---|---|---|---|
  | violin | −41.0 | −36.6 | −34.5 | −32.5 | −30.4 | −28.3 | −24.4 dB |
  | viola | −34.1 | −29.2 | −26.7 | −24.3 | −22.3 | −20.2 | −16.3 |
  | cello | −37.5 | −34.1 | −32.3 | −30.6 | −28.9 | −27.2 | −23.7 |
  | flute | −25.9 | −22.4 | −21.0 | −19.8 | −18.7 | −17.8 | −16.3 |
  | trumpet | −25.9 | −22.3 | −20.8 | −19.6 | −18.5 | −17.7 | −16.3 |
  | piano | −52.3 | −52.3 | −52.3 | −52.3 | −52.3 | −52.3 | −52.3 |

  Never sent, nothing changes: the golden renders are bit-identical and `blocksize.test.ts` passes.
  Live playing sends no `CC_DYNAMICS`, so live playing is bit-identical. The glide is the same at
  128/37/500 frames per call (`packages/engine/test/dynamics.test.ts`).

## Before / after (`scripts/render-dynamics.ts`)

Each file is played offline as the browser plays it: its plan, seats, bus, and each part's gain and
engine controllers through the same `PartLevels`. All three versions are at one gain, so their levels
compare.

- **before:** main's engine (`ed48ecb`, `--before`), notes and pedals only.
- **written:** this branch, the file's own CCs, automatic expression off.
- **auto:** the default.

The level figures are for the mix: 400 ms RMS every 100 ms, while it sounds. "Slow" is the spread of
its 2 s means. "With the music" is the correlation of what auto adds with the written level (2 s
means): positive leans in, negative evens out.

### Daylight, 160–230 s (Violin I enters at 179 s): flat → phrased

| | velocity σ per line | level σ | level 10–90 % | slow σ | mean |
|---|---|---|---|---|---|
| before | 0 / 1.5 / 0 / 0 / 0 | 2.83 dB | 7.3 dB | 2.24 dB | −21.7 dB |
| written (CC7 balance, CC11 = 127) | 0 / 1.5 / 0 / 0 / 0 | 2.91 | 8.1 | 2.16 | −23.7 |
| **auto** | **5.9 / 7.1 / 7.6 / 7.1 / 7.4** | **3.79** | **9.9** | **3.13** | −23.2 |

The level range widens by about 2 dB and the phrase-level spread by 1 dB. What auto adds goes with
the music's own rise and fall (r = +0.30). There are 7162 swell points over the piece. "Written" is
2 dB quieter than "before" because the file's CC7 (94–118 of 118) is now honoured.
`daylight-level.png` shows it: grey before, blue as written, amber auto; 6 dB × 10 s grid,
−48…−12 dBFS. Each long chord now rises into its middle, and the phrases crest. The excerpt's end
fade is outside it; in the whole file the last notes play as written.

### Haydn, Emperor Quartet II, 0–60 s (built-in piece): flat → phrased

| | velocity σ | level σ | 10–90 % | slow σ | mean |
|---|---|---|---|---|---|
| before = written | 0.7 / 1.1 / 0.9 / 0.7 | 3.61 dB | 9.2 dB | 2.84 dB | −25.2 dB |
| **auto** | **6.5 / 7.5 / 7.1 / 6.8** | 3.52 | 9.0 | 2.95 | −26.6 |

The notes are shaped, but the mix's overall spread does not grow here (r = −0.25). The swells soften
each chord change, where the written level peaks, and fill the sustain. The piece arch starts the
first minute of a nine-minute piece softer. With "high loud" at 0.5 steps/semitone it was worse
(r = −0.33, σ 3.49), because the cello going low, which carries a quartet's level, went softer. That
is why the rule is 0.25 now.

### A file with dynamics of its own: `cc-trio.mid` (constructed here, committed)

A string trio: CC7 per part, CC11 hairpins (70 → 120 → 70 over every two bars, every ⅛ beat), the
violin's CC1 rising and falling, and velocities that follow.

| | level 10–90 % | slow σ | follows the file's CC7 × CC11 (r) |
|---|---|---|---|
| before (CC ignored) | 9.4 dB | 2.95 dB | 0.41 (from the velocities alone) |
| written | **12.2** | **3.84** | **0.71** |
| auto | 12.2 | 3.84 | 0.71 (identical: auto stays off; 0 swell events) |

## Files

- `audio/{daylight,haydn,cc-trio}-{before,written,auto}.mp3`: 160 kb/s.
- `*-level.png`: level over time, three versions.
- `*-spectrogram.jpg`: before (top) and auto (bottom). Each panel is relative to its own peak, so
  read changes over time, not absolute level.
- `*.json`: the numbers above.
- `cc-trio.mid`: the constructed file.
- `shots/`: the player with the Haydn loaded.
  - `{desktop,phone}-player-{before,after}.png`
  - `{desktop,phone}-player-off-after.png`: the hairpin off.
  - `desktop-tip-after.png`
  - `{desktop,phone}-stage-{before,after}.png`
  - "before" is production at `ed48ecb`.

Reproduce:
`npx tsx scripts/render-dynamics.ts --before <main checkout>/packages/engine/src/core/index.ts --name daylight --start 160 --seconds 70 "<Daylight>.mid"`,
`… --piece haydn --seconds 60`, `… --cc-fixture <out>.mid --seconds 40`. `--set phrase=0,swell=0`
tries other sizes. For the shots:
`OUT=… TAG=before|after BASE=… node scripts/shots-pieces-dynamics.mjs`.

## The control

The hairpin (`.pl-expr`) is a messa di voce as a score writes it. It sits in the player's row by the
progress line and shows only while something is loaded, so the overlay at rest is still play,
pieces, open.
- **On (default):** amber, `aria-pressed="true"`.
- **Off:** dimmed.
- **The file has its own dynamics:** dimmer. Its tip says so, and the file plays the same either way.

The tips are "expression · on / off / the file's own". The accessible name is "Automatic expression".
The choice is remembered on the device (`piano-model.expression`). Toggling while a file plays goes
on from the heard position. There is no new stage text and no tooltip on the progress line. On a
390 px phone the row still fits: the progress line gives way, down to 56 px, and the icons keep
their size. The notes page (behind the corner link) and the README explain it.

## Tests

- `apps/web/test/expression.test.ts`: the CC mapping and the flat-file auto-phrase path.
  - The parser: CC per line, a conductor track's CC to its channel's lines, CC121, bar lines, a
    trailing CC not lengthening the piece.
  - GM curves and the volume reference.
  - `PartLevels` per part: the wheel only where it moves, its half-travel map, max-gain over lines,
    nothing sent at rest.
  - The chase.
  - Flat → phrased: about its level, within range, deterministic, long notes swelling and back to 0,
    everything else as written.
  - Phrase length.
  - Own dynamics (hairpins, a performance) → the same events.
  - A flat line with an end fade: phrased except there.
  - Full force kept under the ceiling; terraces kept.
- `packages/engine/test/dynamics.test.ts`: CC_DYNAMICS louder or softer on violin, cello, flute and
  trumpet; unchanged before it moves; back to the note at 0; the piano ignores it; block-size
  invariant; CC_REST as if never moved.
- e2e:
  - "automatic expression: a hairpin by the hairline…": hidden at rest; on by default with its name
    and tip; a flat file phrased; off → as written, and it keeps playing; remembered across a
    reload; on again by the keyboard; a file of hairpins → "own", as written; the row fits; desktop
    and Pixel 7.
  - "a file's volume and expression reach the instrument…": a solo file's CC7 → the engine's output
    gain 0.36, back to 1 on stop; a duo's violin CC11 = 64 → its part at 0.254, the cello at 1, both
    back to 1.
  - The pieces-row test now expects the hairpin in the loaded row.

## Limits and leftovers

- I can't listen. Every judgement here is a number above, and the sizes were tuned on Daylight and
  Haydn with `--set`. Someone should listen to `audio/daylight-*.mp3` and `audio/haydn-*.mp3`.
- Phrase detection is a bar grid with a phase from the music's breaths. It does not read melodic
  structure, so an anacrusis-heavy tune may get its arch a bar off.
- The built-in pieces carry no score dynamics. Chopin 28/20 is "ff to pp" in the score but all 90 in
  the file, so it gets generic phrasing, not its terraces. Dynamics marked beside the file, as the
  other corrections are, would fix that.
- The piano takes CC7/CC11 as gain and auto-expression as velocities. A struck note cannot swell, and
  it ignores `CC_DYNAMICS`.
- CC2 (breath), aftertouch and pitch bend in a file are still not read. CC10 (pan) and CC91/93
  (effects) are ignored on purpose: the parts have their seats and the room.
- A part playing several lines takes the loudest line's gain and the mean of their swells. That is
  exact for one line per part, which is every automatic plan.
