# Consistency pass: what differed from one instrument to the next, what was fixed, what was left

Branch `improve/consistency`, on `main` at fc111db. All sixteen instruments were read side by side: the
engine by measurement (every note's level, each player's stillness and sameness against the recordings, each
limiter's work, each release), the pictures and the page by photographs and a scripted check of every control
(2D, vector lines and 3D, on a computer at 1440×900 and a phone at 390×844).

I cannot hear. Every claim about sound here is a measurement; the clips in `audio/` are for an ear to judge.

## Fixed

### 1. Five kinds of instrument had no player (the top priority: less mechanical)

The tuba, the trombone, the four woodwinds, the harp and the glockenspiel had a `human` layer. The horn, the
trumpet, the timpani, the bowed strings and the piano did not. Measured the same way as the others
(`scripts/trombone-variation.ts --instrument <id> [--model]`, `scripts/timpani-variation.ts [--model]`):

| | the model alone | the recorded player | now (`human` 1) |
|---|---|---|---|
| horn, a held note's pitch from one tenth of a second to the next | 0.0 ¢ | 2–4 ¢ | 2.0 ¢ |
| horn, note to note: pitch / strength / attack length | ±0.1 ¢ / ±0.06 dB / ±7 % | ±6–10 ¢ / ±0.5–0.8 dB / ±40–50 % | ±4.5 ¢ / ±0.3–0.5 dB / ±12–31 % |
| trumpet, note to note: pitch / strength | ±0.1–0.2 ¢ / ±0.03–0.11 dB | ±5–7 ¢ / ±0.5–0.9 dB | ±4.8 ¢ / ±0.3–0.9 dB |
| timpani, one stroke from its like: level | ±0.00 dB | ±2.0 dB (±0.7 at ff) | ±1.0 dB |
| timpani, the partials (2,1) (3,1) (4,1) against the principal | ±0.00 dB | ±2.6 / 2.6 / 4.9 dB | ±0.4 / 0.8 / 1.6 dB |
| violin, cello: a stopped note's pitch from note to note | ±2.2–4.2 ¢ | ±13–22 ¢ (read roughly) | ±4.1–4.6 ¢ |

* **Horn** (`horn.ts` `HORN_HUMAN`): the tuba's mechanism in `lipcone.ts` (breath that blooms and sags, pitch
  wander, each note's own tongue, kick and breath), with four things the tuba's has not and does not draw for:
  the note put by ear (±3 ¢, the same while its pitch is struck again), a slower wander, the breath's rise
  varied, and less of the attack's variation on a note known to be short. Its fingering's own intonation is
  partly left (half a partial's distance from equal temperament: the Iowa hornist's tenth-partial C♯5 and D5 are
  20 ¢ flat).
* **Trumpet** (`brass.ts` `TRUMPET_HUMAN`): as the trombone's. It also got the `noise` parameter and knob its
  three siblings have.
* **Timpani** (`timpani.ts` `TIMPANI_HUMAN`): where each stroke lands (along the radius and round the playing
  arc, the two hands a hand's width apart), how hard, the two mallets never quite a pair. One thing found on
  the way: turning every mode with the stroke's place made a stroke a hand's width off the axis 13 dB louder
  (the sum of the modes has a null exactly opposite the player, which no hall has), so only the pitched
  partials (1,1)…(5,1) turn.
* **Bowed strings** (`bowed.ts` `BOWED_HUMAN`): they already had most of a player (each note's vibrato begins
  at its own phase and rate and wanders, with the bow's speed and force; the strokes are planned). What was
  missing was the left hand: a stopped note is now put down ±4 ¢ by ear, stays there while it is bowed again,
  and an open string is the string. A side effect worth knowing: a short note exactly on an open string's
  partial (G4, D5 on the violin) was pinned by that string and came out erratic in level (eight D5s: ±2.1 dB);
  put down a few cents off, as players do, ±0.7 dB.
* **Piano**: none, on purpose. Its player is in the velocities and the timing it is sent; a hammer thrown at
  one speed does the same thing twice.

Each is given *under* what the recordings show (those notes were played alone, with nothing to tune to).
Safety, all measured:

* `human` 0 is the engine before, bit for bit: `scripts/same-sound.ts --params '{"human":0}' --before <fc111db>`
  for horn, trumpet, timpani, violin, viola, cello, bass at 44.1 and 48 kHz, dry and through the room; the
  tuba unchanged with its player on. The judge: Δ 0.00 for horn, trumpet, timpani, violin, viola, cello.
* A player costs no note: `scripts/player-regimes.ts`: 660 horn notes and 525 trumpet notes by five players all
  on their pitch (held; the trumpet's short ones too); the strings 0–1 doubtful of 180–207; a scale of 70 ms
  horn notes loses 0 of 96 with or without the player.
* Deterministic: a seeded stream each, the same notes the same samples (`packages/engine/test/players.test.ts`).

Clips, before and after, with a spectrogram each (`audio/<id>-before.mp3`, `-after.mp3`, `<id>.png`;
numbers in `audio/numbers.json`): one note eight times, two held notes, a passage.

| | repeats' level spread, before → after | a held note's brightness movement |
|---|---|---|
| horn | 0.18 → 0.53 dB | 22–28 → 72–81 ¢ |
| trumpet | 0.12 → 0.19 dB | 52–58 → 31–71 ¢ |
| timpani (two runs) | 0.67, 0.14 → 0.97, 0.67 dB | |
| violin (D5 eight times) | 2.14 → 0.72 dB (see above) | |

### 2. Levels

`scripts/levels-compass.ts` (every third note, three dynamics, as played) and `scripts/levels-vs-refs.ts` (the
model's level less its own recording's, by octave and by note) are new. Tables: `tables/`.

* **The harp's wire strings** stood 3.2 dB further under their recordings than the gut strings did (a step of 9
  dB down from A2 to G2; the recorded harp's is 5–6). `wGain` −8.82 → −5.6; the step is now 6 dB. Judge: NO
  CLEAR CHANGE (held-out 1.28 → 1.28, its level error 3.50 → 3.43). Not the judge's BETTER: said so.
* **The double bass's B1–C♯2** stood 6–11 dB over the Iowa bass's beside its other notes at every dynamic (C♯2
  10 dB over its neighbours as played: the "boomy tonic" noted while writing Everything So Far). The 60 Hz air
  mode radiated at 1.0; now 0.5: +1…+4 dB. Judge: NO CLEAR CHANGE (held-out 1.89 → 1.83, fit 1.99 → 1.85, level
  error 7.46 → 6.74). Not BETTER either: said so. D2 at mezzo-forte is now 9 dB under its recording (pp and ff
  2–3 dB under).
* **"The clarinet 15 dB quieter than the flute"**: true as played, and not a fault of either. At one pitch the
  flute, the oboe and the clarinet are within 3 dB of each other. The clarinet's low register (D3–B3: −25…−30
  LUFS at velocity 80) is 15–20 dB under the flute's top octave (C6–C7: −12…−5), and the recorded clarinet and
  flute do the same (the model's level by octave is within 3 dB of each one's own recording). A flatter tilt
  across the clarinet's compass was tried (1.43 → 0.6 dB an octave): held-out 1.95 → 1.90, NO CLEAR CHANGE, not
  kept.

### 3. Pictures and the page

* **The 2D clarinet and oboe vanished into the stage** (contrast of the body with the background 1.00–1.03; on
  a phone the lower joint and the bell could not be seen). The grenadilla is lifted (#14100c → #332820, the
  outline 0.22 → 0.4): 1.32–1.36. `shots/clarinet-2d-phone-before-after.jpg`, `oboe-2d-*`.
  `apps/web/test/reed-wood-contrast.test.ts` holds it over 1.3.
* **3D light that follows the sound**: after #74 no woodwind is lit; the horn's and the tuba's bores still
  glowed (the frame's warm gain with a note held +0.57 and +0.53; the trumpet's and the trombone's 0). Removed:
  0.00 and 0.01. `shots/horn-3d-before-after.jpg`, `tuba-3d-*`. The trumpet's "glow" materials turned out to be
  inert (a shader define nothing read): deleted with its duplicate slide meshes, no picture changes.
* **Air lines**: all eight winds showed the breath in both 2D styles; in 3D the flute (its jet) and the four
  brass did, the three reeds did not. They do now, by the brass's own helper. `shots/clarinet-3d-breath-after.jpg`.
* **Tooltips**: a scripted check of every control on every stage, the Orchestra, the file player, the pieces
  menu, Measurements and Notes, both sizes. Two icon-only controls had no `data-tip`: the Notes page's two
  credit icons (they had a native `title`). Fixed. The other two without one are the key position strip and the
  file player's position line, which the code says are meant to have none: left.
* **Knobs**: the trumpet lacked the noise knob of the horn, the trombone and the tuba, and its breath knob had
  another range and wording (0.4–1.8 "× nominal"): now theirs (0.6–1.4). The timpani's damp reads "l.v." at 0 as
  the harp's and the glockenspiel's do.
* **AGENTS.md**: the stray conflict marker (`||||||| parent of a197657`, between two rows of the rules table)
  is out; the row after it is true and stays. The row that said a reed's bell still shimmers was stale since
  #74. New rows for the players and the levels.

## Checked and found consistent

* Bow direction: a chevron in vector lines only, for all four strings, alone and in the Orchestra (the rule).
* The picker (the bar's row and the phone's sheet), the keys' letters and octave shift, the position strip.
* The address: all sixteen paths and their aliases take `keys`, `ui` and the look alike.
* Orientation: every wind and brass instrument has its mouthpiece at the left and its bell at the right in all
  three looks, but the horn (below).
* Vibrato: each instrument has its recorded player's (strings 12–20 ¢, flute, oboe, bassoon; clarinet, horn,
  trombone, tuba none; the trumpet a trace, 1.7 ¢). `tables/release-vibrato.txt`.

## Left, with the reason

* **The tuba's limiter.** Alone at its recorded fortissimo the tuba's limiter takes 4–6 dB off its bottom
  octave and 1–4 dB off the next (the horn's: 0; the trombone's 1.7; the trumpet's 1.3:
  `tables/limiter.txt`, `scripts/limiter-table.ts`). Its level was set equal to the horn's at ff by RMS, and a
  low brass note is far peakier at one loudness; the model is not too peaky (crest factor 10 dB, the recorded
  tuba's 15: `scripts/crest.ts`). The trumpet's remedy (3 dB under) would halve it and take 3 dB off the tuba
  at every dynamic in the three bundled pieces, which were balanced against it, and in an orchestra its limiter
  does not work at all (it is told its share of the bus). Yours to call: one number in `tuba.ts` (`gain`).
* **The glockenspiel's bars and the timpani's heads still glow in 3D where they ring** (the bars' is the
  strongest tint left in the app), as the trumpet's pressed valves and the strings' stopped notes keep their
  light. They show what is sounding where nothing else moves much. Yours to call.
* **The horn is seen from opposite sides in 2D and in 3D** (2D from the audience: bell at the left; 3D from the
  player's side: bell at the right, as the picker's glyph). Neither is a mirror image of a real horn. Left.
* **Releases differ** (`tables/release-vibrato.txt`: to −20 dB after the key is up, by hand: clarinet 15 ms,
  oboe 55, flute 60, bassoon 70, trumpet 90, trombone 95, horn 130, tuba 280). The woodwinds' file notes before
  a rest are tapered by their players since #74; by hand they are the model's. Not changed without an ear.
* **Dynamics are as wide as each recorded player made them** (velocity 40 → 120: horn 10 dB, trumpet 8, trombone
  20, tuba 20 and the limiter): a chord at one velocity across the brass is not one loudness. A real
  calibration question, not touched.
* The flute's top notes meet its limiter at fortissimo (2.9 dB at C7), the viola's D♯3 at velocity 127 (5.4 dB).
* The vibrato knobs read differently by family (the quantities differ: breath, lips, cents).
* The timpani's strokes land on the instant (the glockenspiel's hands are up to a millisecond late).
* `git ls-files | grep -iE '\.(aiff?|wav|flac)$'` prints three files on main already (`artifacts/audio/*.wav`:
  the engine's own early renders, not reference recordings). Not touched.
* The bundled pieces were not re-balanced: their double bass is 5–8 dB softer on B1–C♯2 and their harp's wire
  strings 3 dB louder.

## Found on the way

* `e2e/trombone-2d.spec.ts` "the slide back in" fails on main itself (fc111db built in a scratch worktree, twice
  running: the slide drawn 6.9 mm out against the test's 5 mm) since the trombone has a player, who puts the
  slide by ear. The test means the chart's positions and now asks for `human` 0, as the other mechanism tests do.
* The e2e "at pitch" checks (all sixteen; the horn's, the bass's, the timpani's own) ask for `human` 0 too, and
  the test that lists the trumpet's knob colours has its fourth.

## The gate

On the final tree (2026-11-12), all local (the repo has no Actions):

* `pnpm typecheck`: clean.
* `pnpm build`: built; the worklet bundle parses for Safari 14.1+ (`processor-CYyhjJT3.js`, 296 kB).
* `pnpm test` (Vitest): 102 files, 1050 tests passed.
* Playwright (`E2E_PORT=4290 npx playwright test`, its own build and server on a port nothing else held): 376 passed, 32 skipped, 0 failed, no flake (neither `.av-speed` nor "the bow in the hand" fired).
* A first Playwright pass, begun before the last test edits, had 373 passed and 3 failed: the two "at pitch" / knob-colour checks this branch's changes called for, and the trombone's slide test, which fails on main itself. All three pass now, alone and in the clean pass.
