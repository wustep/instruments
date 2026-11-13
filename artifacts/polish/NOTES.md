# Polish pass, 2026-11-12: what was found, what was fixed, what was left

Branch `improve/polish`, from `main` at 602ed57 (after #73, #74, #75). The brief: reduce what still sounds
mechanical or like MIDI, and fix rough edges in 2D, vector lines and 3D, on a phone and a computer, the
pieces' pages included. Usage was nearly spent, so this is three fixes that measured clearly, not a sweep.

I cannot hear. Everything about the sound below is measured (the tools are named); the clips are for
your ears, and both sound changes are ones to listen to before merging.

## How it was audited

* **Sound.** The three original pieces rendered as the page plays them, every part alone
  (`scripts/render-orchestra.ts --piece <id> --played --stems --wav`), and each part read by
  `scripts/mechanical.ts`: how exposed it is, how its held notes move, how alike its repeated notes are.
  Then the strings' vibrato against the recordings (`scripts/winds-vibrato.ts --instrument violin,viola,cello`,
  with `--model` for the engine), and every bundled file's onsets (are its lines on one tick?).
* **Pictures.** `/symphony`, `/everything` and `/passiton` at rest and playing, in 2D, vector lines and 3D,
  at 1440×900 and 390×844; all sixteen instruments alone, playing their own piece, the same six ways; the
  pieces' menu on both; Measurements on a phone. About 140 pictures, read as contact sheets, with the
  console watched (no error, no warning, no horizontal scroll anywhere).

## Fixed

### 1. Pass It On's oboe and clarinet were not drawn (2D and vector lines, computer and phone)

The seventeen seats' woodwind row was a flute, two empty seats and a bassoon. The ensemble's drawer
skipped a seat whose cell was under 8 px across, and among seventeen seats an oboe's and a clarinet's cells
are 5–8 px (their box is the bore's width and the keys' reach at the strings' scale). The flute and the
bassoon were just wide enough. Production shows it today. Now a cell is drawn from 2 px
(`ensemble-draw.ts` `drawable`).

* `shots/passiton-desktop-before-after.png`, `shots/passiton-phone-before-after.png`: before (production)
  at the left, after at the right; 2D above, vector lines below.
* Tests: every seat of every bundled piece, on eight stage sizes, has a cell that is drawn; the three reeds'
  outlines stand inside their cells among seventeen seats (`apps/web/test/ensemble-cells.test.ts`; both fail
  with the old 8 px).
* `BASE=<url> TAG=before|after node scripts/shots-orchestra-reeds.mjs` takes the pictures on any build.

### 2. The strings' vibrato began again on every note, and the violin's and viola's was a generator's

Two things measured:

* Every note began plain for 0.25 s and rose over the next 0.35 s, at a new phase. So no note under 0.6 s
  was ever fully vibrated, and a melody in crotchets had no vibrato at all. Share of each part's sounding
  time that is vibrated (the engine's own rule applied to the notes as sent): Toward Morning's first violin
  43 %, its cello 49 %; Pass It On's strings 7–11 %.
* The violin's and the viola's vibrato was one sine: one cycle within 1–2 % of the next in length and 4 % in
  swing. The cello and the bass already had the measured wander of a hand (Mellody & Wakefield 2000), 4–6 %.
  In the pieces the strings' vibrato read 89–95 % "one sine".

`bowed.ts` `VIB_HAND`, scaled by `human`:

* In a line a file plays (the notes are told ahead, so their lengths are known), a note of 0.4 s or more
  that follows a vibrated note within 0.12 s goes on at the hand's phase and rate, from half the depth it
  had reached, and rises as before. A short note (an accompaniment's quavers), a note after a rest, an open
  string and a note played on the keys begin plain, exactly as they did.
* The violin's and the viola's hand wanders as the cello's does (rate 6 %, depth 20 %, 0.3 s).

| | before | after |
|---|---|---|
| violin, one cycle to the next: length / swing | 1 % / 4 % | 6 % / 17 % |
| viola, the same | 2 % / 4 % | 5 % / 17 % |
| strings' vibrato in the three pieces, "one sine" | 89–95 % | 75–90 % |
| Toward Morning, vibrated share: violin I / violin II / cello / bass | 43 / 36 / 49 / 61 % | 67 / 51 / 75 / 85 % |
| Toward Morning, viola (its 0.3 s figure) | 15 % | 18 % (left plain, on purpose) |
| Pass It On, vibrated share: violins / viola / cello | 7–9 / 9 / 11 % | 27–29 / 22 / 25 % |

* `human` 0 is the engine before, bit for bit: `scripts/same-sound.ts --instrument violin,viola,cello,bass
  --params '{"human":0}'`, at 44.1 and 48 kHz, dry and through the room, largest difference 0.
* The judge (the model alone is what it judges): violin and viola NO CLEAR CHANGE, held-out 2.97 → 2.97 and
  4.30 → 4.30, Δ 0.00.
* No note is lost: `scripts/player-regimes.ts --instrument violin,viola`: 0 silent; the one violin note it
  flags (G6, velocity 112, the second player) is flagged on the engine before too.
* The violin's golden snapshot is blessed (its passage is played by hand, so it is the wander that moved
  it: third-octave spectrum 2.3 dB RMS from the old one, 1.5 allowed). The others pass untouched.
* One test changed for a reason that is not this change: two violin players' average level was compared
  over four notes, where one note is one draw (they stood 1.6–1.7 dB apart at another dynamic before and
  after alike). Over twelve notes four players are within 0.8 dB, before and after; the test now uses twelve.
* A thing to know: a repeated D5 on the violin now varies more at its start (the level of each repeat's first
  150 ms: 0.72 → 1.56 dB, a standard deviation, one repeat 4 dB under the others). D5 sits on the open D
  string's partial, and a vibrato already under way moves the note on and off it.
* Not measured against a recording: the University of Iowa violin and viola are played almost without
  vibrato (medians 5.9 ¢ and 0.6 ¢, and no cycle to speak of), so the wander is the cello's cited one, and
  the half depth at a finger change is my choice, not a measurement.
* Clips: `audio/violin-line-before.mp3` / `-after.mp3` (a line of crotchets, then repeats and long notes),
  `audio/violin-line-spectrogram.jpg` (before above, after below), `audio/viola-line-*.mp3`,
  `audio/toward-morning-strings-before.mp3` / `-after.mp3` (the five string parts alone, 2:30–2:55).

### 3. Files typed on one tick were played on one tick

Eleven of the twenty bundled files are typed: Everything So Far, both Beethoven movements, the Haydn, the
Mozart quintet and Dies irae, the Brandenburg, the Handel, the Air, the horn sonata and the Chopin begin
their lines' notes on one tick (in the three measured below, the first and the last part of a chord
written together were 0.0 ms apart). No ensemble does that (Rasch 1979, "Synchronization in
performed ensemble music", Acustica 43: 30–50 ms between a trio's players, a standard deviation). Toward
Morning and Pass It On were written with their lines apart (7 ms and 42 ms, medians) and are not touched.

`expression.ts` `TIMING`, part of the automatic expression and under its hairpin (off: every file exactly
as written): where nine in ten of those instants are together to the millisecond, each line takes a place
in time of its own, slowly moving either side of the beat (9 ms, a standard deviation; never over 22 ms;
about a third of what Rasch measured). The whole line moves, so a chord inside a line stays a chord, a
note keeps its length to within 6 %, and nothing in a line changes order. A keyboard's or a harp's two
staves are one player's hands and move as one, so a pedal written on the left hand's staff keeps its place
against the right hand's notes (Chopin's prelude is the case).

| first to last part of a chord written together, as sent | before | after |
|---|---|---|
| Everything So Far (159 such instants) | 0.0 ms | 13.9 ms median, 9 in 10 under 28.5 |
| Beethoven 5, I (first 40 s, 141) | 0.0 ms | 17.6 ms, under 30.4 |
| Haydn, Emperor (first 40 s, 32) | 0.0 ms | 11.0 ms, under 26.0 |
| Toward Morning (453) | 7.2 ms | 7.2 ms (its own) |
| Pass It On (415) | 42.4 ms | 42.4 ms (its own) |

* The mix is as loud as it was (Everything So Far −31.6 dBFS RMS both).
* The hairpin's tip no longer says "the file's own" for a file whose dynamics are its own but whose timing
  is given (Everything So Far): it says on or off, because the button now does something for it.
* Tests: `apps/web/test/expression.test.ts` "a typed file's lines each in their own time" (four tests). One
  end-to-end check that a dropped quintet's five first notes fall on one sample now allows 50 ms (it is
  there to catch an engine that came late, which is far more).
* Clips: `audio/everything-so-far-before.mp3` / `-after.mp3` (1:00–1:25), `audio/beethoven5-i-before.mp3` /
  `-after.mp3` (the opening).

## Looked at and left

* **Left for you, untouched, as asked:** the tuba's limiter gain, the glockenspiel's bars and the timpani's
  heads glowing in 3D, the horn's side in 2D against 3D. Nothing I saw made any of them clearly wrong.
* **The oboe's and the clarinet's repeated notes begin alike** (the beginnings of one pitch struck again
  correlate 0.89–0.94; the bassoon 0.69–0.83, the brass 0.48–0.78, the flute 0.41–0.67). #74 tried to vary
  the reeds' breath rise and soft low notes stopped speaking, so I did not try again on this budget. For
  scale, two recorded takes of one timpani stroke correlate 0.95.
* **On a phone in 3D the room's knob sits on the oboe's and the clarinet's bell and on the tip of the violin's
  and the viola's bow.** The knob is on the floor where the light ends, by its rule, and the instrument framed
  whole reaches that corner. Moving it is your call.
* **Notes played on the keys do not carry the vibrato on.** Nothing is known of a note's length there, and
  the rule that nothing foreseen is the old path stands.
* **Releases and dynamic ranges** are as #75 left them (the horn spans 4 dB over velocities 36–100 in Pass It
  On, as its recorded player does). Not touched without an ear.
* The trombone in a 2D box on a phone is small because its box is as long as its slide all the way out. As
  designed.
* Everything else in the pictures was in order: each 3D instrument whole on a phone and clear of the
  player, the pieces' menu inside the window, no part of an orchestra under the lines, no console message.

## The gate

On the final tree (2026-11-12), all local (the repo has no Actions):

* `pnpm typecheck`: clean.
* `pnpm build`: built; the worklet bundle parses for Safari 14.1+ (`processor-DgZinM3o.js`, 297 kB).
* `pnpm test` (Vitest): 102 files, 1059 tests passed.
* Playwright (`E2E_PORT=4577 npx playwright test`, its own build and server on a port nothing else held):
  375 passed, 32 skipped, 1 failed: the known flake, the action close-up's `.av-speed` empty
  (`e2e/app.spec.ts:1257`, desktop). Rerun once, alone, on desktop and phone: 2 passed. "The bow in the hand"
  did not fire.
* The banned-fonts grep prints nothing. `git ls-files | grep -iE '\.(aiff?|wav|flac)$'` prints the sixteen
  `artifacts/audio/*.wav` that are on main already (the engine's own early renders, not reference
  recordings; #75 noted them); this branch adds none.
