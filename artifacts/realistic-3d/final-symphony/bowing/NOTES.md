# Bowing: the bow planned ahead, and no direction arrow in the drawn 2D style

Brief: `.autopilot/briefs/BOWING.md`. Branch `improve/bowing`, from main at #47 (`02c3a25`).

## What changed

### 1. The bow is planned ahead when a file or a piece plays

Before, the engine learned of each note as it began. A détaché note took the other bow, the speed came
from the velocity alone, and the bow turned wherever the hair ran out. A long note changed bow at an
arbitrary point inside it, and a rhythm of long and short notes crept to one end of the bow.

Now the file player tells every bowed engine the notes to come, and the engine plans each stroke with
what it can see:

| Where | What |
|---|---|
| `apps/web/src/ui/player.ts` `tick` | each note is told `BOW_AHEAD` = 5 s before it sounds: when it begins, how hard, how long, and its line's automatic dynamics over it. The notes themselves are scheduled as before, 0.2 s ahead on the AudioContext clock, sample-accurate |
| `apps/web/src/midi-file.ts` `notesAhead` | each note's length and mean `dyn` |
| `apps/web/src/audio.ts` `foreseeFileEvent`, `orchestra/ensemble.ts` `foresee` | to the single instrument, or through the Orchestra's routing (the same parts, desks and pitch as `schedule`; routing itself is untouched) |
| `packages/engine` `Piano.foresee`, event `foresee`, `worklet/processor.ts` | the message; only bowed cores receive it; `clearScheduled` (pause, stop, seek) also forgets it |
| `packages/engine/src/core/bowed.ts` `foresee`, `match`, `scan`, `design1`, `strokeStart`, `strokeChange`, `strokeOn`, `airborne`, `bowControl` | the planner |

What the planner does, with a horizon of `BOW_LOOK` = 4 s:

* **Détaché alternates.** A note that begins as the last ends takes the other bow.
* **A slur stays on one bow.** Notes that overlap (a slur, a chord, a double stop) are one stroke. A group
  too long for the hair, however slowly drawn, changes bow where one of its notes begins; a single note
  too long for one bow is shared out evenly over the fewest bows.
* **Speed and hair follow length and dynamic.** A stroke's speed is `k` × the speed its velocity asks
  for, and the contact point moves by the same `k` (nearer the bridge for a slower bow), so the string's
  amplitude v/β and the force's place under Schelleng's maximum stay the dynamic's. `k` is 0.45…1.25,
  always inside the instrument's `bowSpeed`, and β inside 0.04…0.28. A long note is drawn slower so one
  bow carries it. On the cello and the bass, a short note beside a long one is drawn faster and the long
  one slower, so a dotted rhythm does not creep.
* **A stroke begins where it has room.** After a rest the bow is set down for the stroke to come: a loud
  short stroke in the lower half, a soft one further out, a long one from the end, and far enough along
  that the strokes following straight after stay on the hair. A phrase begins down-bow, unless short
  notes lead straight to a longer one: then the long one is the down-bow (Beethoven's three quavers go
  up, down, up, and the minim down).
* **The lifted bow moves in the rest.** In the 0.45 s before a note the bow, off the string, goes to
  where the stroke will begin, so nothing jumps when the hair lands.
* **Crossings inside a slur** arrive on the new string already moving, on all four instruments (before:
  the cello only), in the same direction, with no new stroke.
* **The dynamics to come are counted in.** The player sends each note's mean `dyn`, so a swell does not
  run the stroke out of hair. If it still would, the bow is held back near the end by up to 15 %.

### 2. Live input is the old path, unchanged

Nothing is foreseen from the keys, a plugged-in keyboard or the bow in the hand, so `newStroke` and the
change-when-the-hair-runs-out run exactly as before. `golden.test.ts` and `blocksize.test.ts` pass
unchanged, with no golden blessed. The hand still overrides everything (`createHandBow` untouched). A
note played by hand in the middle of a file is bowed the old way.

### 3. No direction arrow in the drawn 2D style

`apps/web/src/ui/stage-draw.ts` `drawBow`: the vermilion chevron is gone, alone and in the Orchestra
(the same drawer). The contact's glow stays. The vector style keeps its chevron
(`ui/vector/bowed.ts`, untouched). 3D has none, and no text was added anywhere. The scope caption
("down-bow / up-bow / bow change") is as it was.

### 4. A bug found on the way: a paused file could leave a note sounding

A file paused in the instant after a note began in the engine, before it reached the keys on screen,
left that note bowed for ever: `stopFile` let go only of the notes already shown, and the note's own end
had just been forgotten with the rest of the queue. `node scripts/pause-stuck.mjs` (the cello's own
piece, Pixel 7 profile, 30 pauses): **5 of 30 on production, 0 of 30 here**. `audio.ts` now keeps the
notes it sent and lets go of every one whose end was forgotten.

## Numbers

Offline, one line on its instrument, dry, `npx tsx scripts/bow-trace.ts` (before: as from the keys, the
old path; after: `--plan`). Pictures in `traces/`.

| Passage | Notes | Changes inside a note | Bowed time within 4 % of an end | Level, dB RMS |
|---|---|---|---|---|
| Daylight, Violin II, 60–100 s | 22 | 3 → 0 | 4.3 % → 0 | −28.59 → −28.67 |
| Daylight, Viola, 20–80 s | 16 | 0 → 0 | 1.2 % → 0 | −16.58 → −16.34 |
| Daylight, Violoncello, 0–60 s | 17 | 16 → 0 | 2.5 % → 0 | −17.16 → −17.26 |
| Daylight, Contrabass, 0–60 s | 17 | 16 → 0 | 1.6 % → 0 | −24.48 → −24.90 |
| Daylight, Violin I, 179–239 s | 17 | 0 → 0 | 1.1 % → 0 | −29.36 → −29.35 |
| Beethoven 5 I, violin I, 0–30 s | 108 | 1 → 0 | 0.3 % → 0 | −23.82 → −23.66 |
| Beethoven 5 I, cello, 0–30 s | 51 | 4 → 1 | 1.2 % → 0.3 % | −23.50 → −23.57 |
| Beethoven 5 II, viola, 0–40 s | 40 | 3 → 0 | 1.4 % → 0 | −26.66 → −25.82 |
| Beethoven 5 II, cello, 0–40 s | 36 | 6 → 0 | 1.6 % → 0 | −25.41 → −25.57 |
| Beethoven 5 II, violin I, 20–60 s | 25 | 1 → 1 | 1.1 % → 0 | −27.91 → −27.58 |
| Haydn Op. 76/3 II, violin I, 0–40 s | 34 | 1 → 2 | 0.2 % → 0 | −29.24 → −29.17 |
| Bach, Prélude, cello, 0–30 s | 160 | 1 → 0 | 0.3 % → 0 | −30.78 → −30.73 |
| Greensleeves, violin, 0–30 s | 66 | 0 → 0 | 0 → 0 | −14.61 → −14.37 |
| Beethoven 5 I, every line on one violin, 0–20 s | 311 | 0 → 0 | 1.5 % → 0 | −13.50 → −12.92 |

Levels move by at most 0.84 dB over a passage. The speed range was measured, not chosen by ear:
`npx tsx scripts/bow-plan-range.ts` → `bow-plan-range.txt` (level and periodicity of a held note at each
`k`, every string, three dynamics). The cello and the bass hold within about 1 dB from k = 0.45 to 1.5 on nearly every note (three single-note
outliers in the table: cello C2 at k = 1.25, bass C3 and G3 at k = 0.6).

## Limits, as measured

* **The bundled Mutopia files carry no slurs.** LilyPond writes every note end to end, slurred or not
  (gap < 1 ms on 716 of 755 notes of the Haydn's first violin). So those pieces play détaché, a bow per
  note, as before. A file whose slurred notes overlap is slurred. I did not guess slurs from note
  lengths.
* **Violin and viola: single notes can differ by a few dB when `k` ≠ 1.** Their contact is a
  whole-sample tap on the delay line, so β moves in steps, and single held notes vary by ±2–8 dB with
  any small change of bow (the table in `bow-plan-range.txt`; k = 1 is itself in a weak regime on some
  notes). So on these two the planner keeps k = 1 unless the hair forces otherwise, uses only factors a
  whole-sample move gives exactly, and never brings the tap under 3 samples (below that the note loses
  its periodicity: violin A5 at k ≤ 0.8). The bow-sharing rule for dotted rhythms is cello and bass only.
* **So a long high violin note in mid-bow can still change inside the note** (Haydn, 1 → 2 in this
  excerpt; Beethoven 5 II violin I, 1 → 1). The change is now planned at the note's middle, not where
  the hair happened to end.
* The planner looks one stroke ahead once the bow is on the string (and up to eight when it is set
  down). It does not yet save hair two strokes early for a long note it can see coming.
* After the Orchestra's routing changes mid-play, the newly routed bows are told again from that moment;
  for up to 5 s some notes may be bowed the old way.

## How it was tested

* `packages/engine/test/bow.test.ts`: 9 → 20 tests. New, "the bow planned ahead": alternating détaché; a
  slur on one bow and the next note on the other; a slur too long changes at a note's start; a long soft
  note on one bow, slower, nearer the bridge, within 1.5 dB and 6 cents; a swell counted in; a short
  note beside a long one faster, never past `bowSpeed`; where a stroke begins, the upbeat rule, the
  lifted bow moving in a rest with no jump on landing; a slurred crossing on all four instruments;
  nothing foreseen is bit-identical to before, and forgotten foresight changes nothing; the hand
  overrides the plan; the plan does not depend on the host's block size nor on when the notes were told.
* `apps/web/test/bow-direction.test.ts` (16): the drawn style draws no chevron, the vector style one, on
  the side the bow goes to, none while it turns; four instruments, laptop and phone boxes. Checked
  against the old drawer: the 8 drawn-style cases fail there.
* `apps/web/test/note-lengths.test.ts` (2).
* `e2e/bowing.spec.ts` (3 × desktop and Pixel 7): the cello's own piece is planned, no change inside a
  note, no string left bowed after a pause, a key afterwards is unplanned; a dropped file with a 5 s
  note and a slur plays as three strokes, down, up, down, the long note frog to tip; a quartet's piece in
  the Orchestra, all four parts planned.
* Gate: see the pull request.

## Pictures

Before: this checkout at `02c3a25`, built and served, shot before any change. After: this branch.
`node scripts/shots-bowing.mjs`, then `python3 scripts/pair-shots.py` and `scripts/pairs-bowing.py`.
The Daylight file is local only (`.autopilot/fixtures`, not in the repo); its trace pictures show note
lengths only.

* `contact/`: the bow's contact close up, before | after. Drawn 2D, violin and cello, laptop and phone:
  the chevron there, then gone. `…-vector-…`: still there in both. `contact-before-after-quintet-cello-2d-desktop.jpg`:
  the Orchestra's cello, the same.
* `shots/` (78 pairs, before | after): `held-*` a held note; `piece-*` the violin's and the cello's own
  piece, three moments; `quintet-*` the string quintet with Daylight dropped on it, three moments;
  `symphony-*` Beethoven's Fifth, two moments. Each in drawn 2D, vector 2D and 3D, laptop and phone.
* `traces/` (14): the bow's place on the hair over time, before over after. See `daylight-cello.png`
  (every long note on one bow), `b5i-violin1.png` (the motif up, down, up, down; the bow moved in the
  rests), `b5ii-cello.png` (the dotted theme held in the bow's middle), `b5i-all-violin.png`.
* `clips/` (4, silent, before | after): the cello's Prélude and the Daylight quintet, drawn 2D and 3D.
