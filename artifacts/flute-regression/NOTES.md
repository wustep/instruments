# The flute after #74: what was worse, and the fix

Branch `improve/flute`, off `602ed57`. Stephen, 12 Nov 2026: "the flute sounds worse than it was before."

I cannot hear. What follows is measured (each note's pitch and level read off dry renders, the same notes
through each engine; the University of Iowa MIS flute read by the same tools, analysis only) and looked at
(spectrograms). The clips are for the ear that can: the claim to check is in "What to listen for".

## What was wrong

**The vibrato #74's second round gave the flute was on every note, quick ones included.**

Round 2 measured the Iowa flautist's vibrato on long tones (12 cents, the harmonics above the fundamental
±3–5 dB, 4.9 Hz) and put it in the engine. Round 1 had already made the vibrato "the breath's, not each
note's". Together: once a breath was 0.7 s old, every note of it had the whole vibrato from its first
millisecond, a run's sixteenths the same as a long tone. Each quick note caught the swing wherever it stood.

Three engines, the same notes (`scripts/flute-ab.ts`; notes under 0.3 s):

| | before #74 (`055d8dd`) | round 1 only (`23dba6a`) | main (`602ed57`) | fixed |
|---|---|---|---|---|
| quick notes apart from their pitch (cents, sd): Badinerie + Morning Mood | 0.6 | 0.7 | **9.5** | 2.2 |
| … the worst of them | 2.5 | 1.6 | **20.1** | 6.2 |
| … the same pitch, played again a moment later | 0.5 | 0.5 | **7.9** | 2.0 |
| … the pitch bends inside one quick note (median / 90th) | 0.6 / 4.3 | 1.3 / 2.1 | **10.7 / 27** | 1.0 / 1.9 |
| the flute's own piece (its page's play button), 85 quick notes: apart | 1.5 | 0.7 | **12.0** | 2.6 |
| … the worst / bend inside a note | 8.4 / 0.7 | 1.8 / 1.3 | **23.5 / 16.2** | 7.5 / 0.8 |
| Pass It On, flute 1 from 150 s, 19 quick notes: apart / worst | 0.4 / 1.0 | 0.4 / 1.1 | **6.3 / 14.4** | 2.8 / 7.2 |
| Toward Morning, flute 1 from 150 s: quick notes apart | 0.4 | 0.4 | **11.6** | 1.8 |
| Beethoven 5 II, flute 1 from 260 s, 51 notes of 0.3–0.7 s: apart / bend | 0.8 / 0.4 | 0.8 / 1.0 | **5.3 / 24.3** | 2.3 / 1.7 |

So round 1 alone did not do it (its notes sit where they sat before #74, and its joins are better); round 2's
player did. A tune's notes 6–12 cents apart at random, the same pitch 6–11 cents from itself two notes on,
each bending up to 27 cents while it lasts, its level moving 1–3 dB with it: out of tune and seasick, where
before #74 it was merely plain. The long tones the player was measured on were fine all along (below): the
measuring never left them.

**A second, smaller thing, found on the way.** The player's pitch walk on a held note had been set by its
roughness from one tenth of a second to the next alone. Read at the scale of a quick note (where stretches of
0.15 s and of 0.5 s of one held note sit against the note's own line: `scripts/flute-pitch-walk.ts`), it was
1.7 times the recorded flautist's:

| a held note without vibrato | Iowa (112 notes) | main | fixed |
|---|---|---|---|
| stretches of 0.15 s apart (cents, sd; the median note) | 1.4 | 2.4 | 1.5 |
| stretches of 0.5 s | 0.9 | 1.5 | 0.9 |

## What changed

All in the flute's player (`FLUTE_HUMAN`, `packages/engine/src/core/flute.ts`; the mechanism in
`winds-human.ts`, opt-in: the reeds' specs do not use it).

1. **The vibrato belongs to the notes long enough to carry one** (`VibratoEntry`).
   * A note a file says is short has none: none under 0.3 s, all of it from 0.8 s.
   * A note from silence gets it over 0.3–0.9 s: half its depth 0.6 s in, as the recordings' long tones show
     (Iowa: half depth after 0.57–0.77 s at mf, 0.53–0.69 ff; the fixed engine 0.59).
   * A note joined to a line already carrying a vibrato keeps what the line had, up to its own share: a slow
     slurred line is still one vibrato, a run has none, and it comes back on the long note the run ends on.
   * By hand (a key, a keyboard: no length told) a run sheds it in two notes; a note held on gets it back.
2. **The pitch walk is the recorded size at a quick note's scale**: `wander` 3 → 1.8, `slow` 2 → 1.2.
3. **A quick note keeps 0.4 of the player's placing** (`placeQuick`): the recordings' ±3–5 cents from note to
   note are long tones played alone; a run's notes are fingered. Without this the quick notes sat 3.2–3.5
   cents apart; with it 2.2–2.5.

Not changed: the vibrato's depth, rate and irregularity on a long note (they are the recorded flautist's, and
read the same after the fix), the breath's wander, each note's own strength and tongue, the release. Round 1's
work (the register breaks' `CARRY`, the vent from a told note's first sample) is kept whole: measured again
here, it is what makes the flute better than before #74, and nothing in it is behind the complaint.

`human: 0` is untouched: bit-identical to the engine before it had a player (`23dba6a`), a note alone at 44.1
and 48 kHz by hand and told ahead (`winds-alone-same.ts`: 0 of 78 differ), the bundled flute parts
(`winds-human-same.ts`: every part bit-identical), and to main (`same-sound.ts --params '{"human":0}'`). The
oboe, clarinet and bassoon as played (`human` 1) are bit-identical to main too (`same-sound.ts`,
`winds-alone-same.ts`: largest difference 0). Judge, flute against main: NO CLEAR CHANGE, held-out
3.30 → 3.30, Δ 0.00 ± 0.00 (it renders the model alone). Only the flute's golden is blessed.

## Is it better than before #74, not only than main?

| | before #74 | main | fixed |
|---|---|---|---|
| notes joined to the last, 3024 pairs told ahead (`winds-legato.ts`): on a wrong register over 10 ms | 257 | 2 | 0 |
| … to speak, 90th percentile, slurred / tongued / after a short rest | 72 / 73 / 61 ms | 16 / 16 / 15 | 15 / 16 / 15 |
| … a slur's hole, 10th percentile | 12.2 dB | 1.4 | 1.6 |
| rises across a register that fail (`flute-rise.ts`, of 1008) / falls (of 360) | 28 / 3 | 0 / 0 | 0 / 0 |
| the edge the last round left (joins from D5 and E♭5 upward, 64 players' streams, 6144 joins): wrong register over 10 ms | – | 34 | 8 |
| a long note's vibrato, mf: pitch / the harmonics above / half depth after (Iowa: 12.1 ¢ / 2.7 dB / 0.67 s) | 0.4 ¢ / – / – | 12.1 / 2.6 / 0.5 into the breath | 11.6 / 2.6 / 0.59 |
| quick notes apart from their pitch (the table above) | 0.4–1.5 ¢ | 6–12 | 1.8–2.8 |
| a held note without vibrato: its pitch every 0.15 s (Iowa 1.4 ¢) | 0.0 | 2.4 | 1.5 |
| a long note let go before a rest: to −10 dB (Iowa 68 ms; #74's own measure, not touched here) | 30 ms | 64 | as main |

Against before #74 the fixed flute keeps what #74 was for (notes that arrive across the register breaks; a
long tone that is a flautist's and not an organ pipe's; no two notes stamped alike; a note that dies away) and
gives back what #74 cost: a quick note is straight and within 2–3 cents of its pitch, where the recorded
player's own long tones, played one at a time, are ±3–5 apart.

## What to listen for

Each clip three times: `-before` (`055d8dd`, before #74), `-now` (`602ed57`, main), `-fixed` (this branch).
The same notes, the same render path (the engine's own room and limiter, the file player's told-ahead notes).

* `tune-*` (18.6 s): the Badinerie's opening tongued, twice, then Morning Mood's opening slurred in eighths.
  **The regression at its plainest.** In `-now` the quick notes are sour and wobble; in `-fixed` they are
  straight and the vibrato is only on the last long note. `tune.jpg`: before on top, now, fixed: the wiggles
  in the middle panel's every note are gone from the bottom one but for the last note.
* `demo-*` (22 s): the flute's own piece from 35 s, what its page plays. 104 notes, 85 of them quick.
* `swaps-*` (20 s): both register breaks, slurred and tongued, then a slow slurred line. Round 1's joins are in
  `-now` and `-fixed` alike (in `-before` the notes across a break crack and arrive late); the slow line at
  the end keeps its vibrato.
* `slow-*` (19 s): a slow slurred line twice (mf over the upper break, then p). One breath, one vibrato, in
  `-now` and `-fixed`; `-before` is dead straight. `-fixed` differs from `-now` only on its shorter notes
  (0.45–0.6 s: 19 cents of swing where main has 27).
* `held-*` (20 s): six long notes alone, pp to ff. `-fixed` is `-now` but for the vibrato coming in a little
  later on each (0.3–0.9 s; main 0.3–0.7). If the long-tone vibrato itself is what sounds wrong to you (its
  depth, or the breath noise pulsing with it on E6 and C6), it is here, and it is one number to turn down
  (below).
* `toward-*`, `passiton-*`, `everything-*`: the first flute of each of the three pieces alone, as the Orchestra
  plays it (Toward Morning from 45 s: long notes; Pass It On from 150 s: its busiest; Everything So Far from
  110 s: long notes).
* `held.jpg`, `tune.jpg`, `slow.jpg`, `demo.jpg`: spectrograms to 5 kHz, before / now / fixed from the top.
  `index.json`: every clip's numbers.

## What I did not change, and why

* **The long-tone vibrato's depth.** It reads as the recorded flautist's (pitch 10.0 / 11.6 / 14.9 cents at
  pp / mf / ff against 10.7 / 12.1 / 15.6; harmonic by harmonic from A4 up, `flute-vibrato-detail.ts`: 3.3 /
  2.4 / 2.7 / 1.7 / 2.5 dB at mf for the second to the sixth against the recordings' 3.1 / 3.4 / 2.8 / 5.0 /
  2.8), and a spectrogram of four recorded notes over the engine's same four looks alike: straight at first,
  then swinging, the noise pulsing with it. But those recordings are a player asked for vibrato on long tones. If
  it is still too much in the pieces, `FLUTE_HUMAN.vibrato.cents` and `upperDb` scale it, or the `vibrato`
  parameter (0.06 the default: 0.04 is two thirds of it).
* **The breath's noise pulses with the vibrato a little more than the flautist's** (the noise between the
  harmonics swings 4.0 dB at mf and 5.2 ff where the recordings' swings 3.2 and 4.4; at pp 6.5 against 2.2,
  on three recorded notes): the player's vibrato is a gain on what leaves the flute, the noise with it. Seen
  as vertical stripes on E6 and C6 in `held.jpg`, and in the recordings' own spectrogram. Left: the evidence
  at pp is three notes, and I cannot hear whether it matters.
* **Notes of 0.3–0.7 s get little vibrato** (a third of it at 0.5 s). A flautist playing a slow tune in
  quarters may use more. This is the cautious side of the choice: too little is the flute before #74, too
  much is the complaint.
* **A held note's roughness by the earlier measure** (from one tenth of a second to the next,
  `winds-variation.ts`) is now 0.7 cents where the players' is 1.1–1.6 and main's was 1.2. The two measures
  cannot both be met by this walk; the one kept is the one a quick note is heard by.
* The oboe, clarinet and bassoon (their vibrato is a few cents or none, and they are bit-identical here), the
  tuba's limiter, the glockenspiel's and timpani's 3D glow, the horn's side: untouched.

## Tools (new)

* `scripts/flute-ab.ts --engine before=<old>/packages/engine/src/core/index.ts --engine now=… --engine fixed=.`:
  the same passages and bundled parts through several engines; clips, stacked spectrograms, and each note's
  place and movement by its length.
* `scripts/flute-pitch-walk.ts [--engine .]`: a held note's pitch at the scale of a quick note, the
  recordings and an engine alike.
* `scripts/flute-vibrato-detail.ts [--engine .]`: the vibrato harmonic by harmonic, and the noise between.

Test: `packages/engine/test/winds-human.test.ts`, "the flute's vibrato belongs to the notes long enough to
carry one" (4 cases; on main's engine a run's notes read 10–29 cents of bend and up to 20 off their pitch,
here under 1.5 and 4.5).

## The gate

* `pnpm typecheck`: clean. `pnpm build`: built; the worklet parses in Safari 14.1 (297 kB).
* `pnpm test` (Vitest): 102 files, 1054 tests pass (4 new: the flute's vibrato by note length).
* Playwright, the whole suite (Chrome desktop and Pixel 7, the WebKit smoke test) on port 4611, served by this
  worktree's own build: 376 passed, 32 skipped, none failed, no rerun needed.
* `git ls-files` gains no recording; no banned font.
