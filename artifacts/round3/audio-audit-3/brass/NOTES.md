# Audio audit 3, the brass: the trumpet's tongued notes and the trombone's fast slurs

Two leftovers of the winds' MIDI pass (#59, `artifacts/realistic-3d/final-symphony/winds-midi/NOTES.md`, "Left as it
is"): **the trumpet's low notes after a tongue stroke** ("within 6 dB of their level 55–65 ms after the beat in
the Fifth") and **the trombone's slide in fast slurs** ("a scale of 139 ms notes slurred: 3 of 8 lost"). Branch
`improve/audio-audit-3-brass`, from `main` at `a561109` (**before**: that engine, in a second checkout); **after**:
this branch. Everything below was measured on both with the same notes and the same scripts, dry, 48 kHz, the notes
told ahead as the file player tells them. Nothing was tuned by ear.

## In short

| | before | after |
|---|---|---|
| Trumpet, a note joined to the last on another partial of the bore (a fourth up), E3–C4, 250 ms notes: within 6 dB of its level after | 72.5 ms (median; the latest 92.5) | 30 ms (60) |
| …the same over the compass and four tempi: cells (pitch × strength × tempo × how joined) whose median is 45 ms or more | 234 of 976 | 14 |
| …joined notes lost (12 dB under the held note, or not at their pitch) | 22 of 3456 | 0 |
| Beethoven 5, I, trumpet II (G3 and C4): a joined note speaks in | 65 ms (9 in 10 within 82.5) | 20 ms (50) |
| Trumpet, a pitch struck again with no rest | back in 12.5–30 ms, a dip of 7–10 dB | the same, bit for bit |
| Trombone (tenor), six slurred runs at 80–300 ms a note: notes lost | 118 of 364 | 70 |
| …at 139 ms a note / at 170 ms | 21 / 9 of 52 | 6 / 2 |
| …alto / bass | 62 / 106 of 364 | 43 / 62 |
| …the slide short of the note's place on its beat, a scale at 200 ms (median, the most) | 18.4 cm (50.2) | 0 cm (2.1) |
| Trombone, detached notes (70 ms notes, 70 ms rests): lost, the weakest | 1 of 8, −19 dB | 0, −5 dB |
| `scripts/judge.ts` against the recordings | | trumpet NO CLEAR CHANGE (held-out 3.23 → 3.23, Δ 0.00 ± 0.00), trombone NO CLEAR CHANGE (3.97 → 3.97, Δ 0.00 ± 0.00) |
| Goldens | | unchanged, not re-blessed |
| What got worse | | trumpet: 11 of 92 rising steps onto another partial from C♯5 up leave a hole of 20–47 ms (under 15 before); 31 of 976 cells speak 15 ms or more later (5 → 32.5 ms, median). Trombone: three cells of 126, all in the run with 26–36 cm of slide to every note, lose one note more |

A note alone, a long tone, and everything played by hand on the trumpet are bit-identical to before; on the trombone
too, but for a note that turns a valve (see below).

## Reproduce

```sh
B=<a checkout of a561109>/packages/engine/src/core/index.ts
npx tsx scripts/trumpet-retongue.ts [--engine $B] [--from 52 --to 84] [--len 0.25,0.15,0.125,0.107] [--notes]
npx tsx scripts/trombone-slurs.ts [--engine $B] [--size alto|bass] [--len 0.08,0.1,0.12,0.139,0.17,0.2,0.3] \
    [--tongued] [--hand] [--run steps] [--notes]
npx tsx scripts/winds-midi-bench.ts --only trumpet,trombone [--engine $B] [--notes]
npx tsx scripts/winds-midi-measure.ts --part trumpet [--engine $B] [--notes]     # the bundled pieces' parts
npx tsx scripts/winds-midi-measure.ts --part trombone [--engine $B] [--notes]
npx tsx scripts/winds-midi-joined.ts --only trumpet,trombone --len 0.139,0.278 [--engine $B] [--list]
npx tsx scripts/winds-midi-fresh.ts --only trumpet,trombone [--engine $B]
npx tsx scripts/render-audio-audit-3-brass.ts --before $B                        # the clips here, index.json
for i in trumpet trombone; do npx tsx scripts/judge.ts --instrument $i --before $B; done
npx vitest run packages/engine/test/audit3-brass.test.ts                         # five of its eight fail on a561109
```

`speak`, `hole`, `lost`, `reach` and the click measure are `scripts/winds-midi-measure.ts`'s, as in #59: a note has
spoken when its own harmonics are within 6 dB of the level it settles to, at its pitch; a hole is how far the level
falls under the softer of two joined notes and for how long it stays more than 6 dB under; a note is lost if it
stays 12 dB under the same note held alone, or under a third of its level is at its own pitch.

## 1. The trumpet

### What it was

`scripts/trumpet-retongue.ts`: every pitch E3–C6, mp and f (velocity 56, 100), at eighths at 120 and sixteenths at
100, 120 and 140 (250, 150, 125, 107 ms), struck again with no rest and joined to three other notes.

* **A pitch struck again came back at once, in every register.** G3 repeated, forte: the tongue is down 26 ms; the
  level (8 ms RMS) falls 9–10 dB and is back within 1 dB of the note's **10 ms after the beat: one round trip of
  the bore** (10.9 ms on that fingering; the model radiates the wave where it comes back to the lips). The measure
  says 27–32 ms for E3–C4 because the lips come back a fraction of a period out of step with the ring that outlived
  the stroke: for 20 ms the note's own harmonics, taken over a 20 ms window, read 5–7 dB under the level that is
  there. Hole: 15–20 ms under −6 dB (median), 9–11 dB deep; in the middle 15 ms and 8 dB, at the top 7.5–10 ms and
  7 dB.
* **A note joined to the last on another partial of the bore did not.** That is what the Fifth's 55–65 ms was: its
  trumpet II plays G3 (second partial) and C4 (third); C4 after G3 came within 6 dB of its level **65–82 ms** after
  its beat, the same note from silence 42 ms. Over the compass: from a fourth below (always another partial) 55–72 ms,
  median, in every register; from a fifth above 37–42 ms from C♯4 up; 15 of 288 such notes at the top were lost.
  Meanwhile the last note's ring went on sounding, bent to the new tube: C4's first 60 ms were G3's ring a tone flat
  at −5…−10 dB.

### The cause

Two things in how a stroke made ahead of its note (a file playing: `mono.ts` `plan`) was let go, in `brass.ts`:

1. **The lips were never kicked.** A note tongued over the breath is meant to be kicked as the tongue lets go
   (`lickKick`, half a first attack's). The kick was given where the stroke passed, by itself, from held to letting
   go. A stroke made ahead is let go from `settle` (`Tongue.retongue(struck)` → `release()`), which never passes
   there: for a file's notes the kick never came (by hand, where the stroke is made at the note, it did). The lips'
   gain is too low for a new partial to grow quickly out of the last one's standing wave: G3's lip motion took 45 ms
   to die before C4's began to grow.
2. **The valves and the lips moved under the new note, not under the stroke.** The stroke was made 14 ms ahead, the
   bore's length and the lips' tension were set at the beat and glide for about 20 ms (time constants of 7 and
   6 ms): the tongue let go onto the last note's tube and lips.

### The fix (`packages/engine/src/core/brass.ts`)

* A stroke made ahead that lets go at its note **kicks the lips with the next sample** (`kickNow`), where the lips
  have a new partial to find (`trumpetFingering(…).partial` differs).
* **The valves and the lips go to the note to come once the tongue is down** (2 ms after it begins: `fingerAhead`,
  `finger`), under a stroke made ahead and over a rest the tongue holds (`stop`). If the note does not come within
  30 ms of when it was due they go back.
* After a rest of 40 ms or more that the tongue held (`REST_KICK`), any note is kicked, as a first one is: the bore's
  standing wave (130 dB/s with the lips shut) is down by then.
* Notes foreseen to overlap the last by less than `mono.ts` can tell from a joined note (under 12 ms: Toward Morning's
  2–27 ms) get the stroke ahead and then arrive as a slur; they are kicked as joined notes are.

Not kicked, on purpose: a note on the same partial as the last (a pitch struck again, a step taken by the valves
alone). There the standing wave outlives the stroke, the valves carry it over to the new length, and it sets the lips
buzzing again by itself in a round trip or two. Measured both ways (below): a kick against it only throws them out
of step.

### Numbers (before → after)

Speak: ms after the beat, the median over the cells of a register and the latest single note; cells: pitch ×
strength × tempo.

| register | joined how | speak, ms: median (latest) | cells with a median of 45 ms or more | hole under −6 dB, ms: median (longest) | hole, dB (median) | level re held, dB | lost |
|---|---|---:|---:|---:|---:|---:|---:|
| E3–C4 | the pitch struck again | 30 (55) → 30 (55) | 0 → 0 of 72 | 17.5 (42.5) → 17.5 (42.5) | 9.9 → 9.9 | 1.9 → 1.9 | 0 → 0 of 360 |
| E3–C4 | from a whole tone above | 30 (65) → 22.5 (47.5) | 2 → 0 of 72 | 2.5 (50) → 5 (15) | 6.5 → 6.8 | 2.1 → 2 | 1 → 0 of 216 |
| E3–C4 | from a fourth below | 22.5 (92.5) → 30 (60) | 11 → 2 of 32 | 0 (45) → 2.5 (12.5) | 5 → 6.4 | 1.1 → 1.9 | 2 → 0 of 96 |
| E3–C4 | from a fifth above | 5 (60) → 7.5 (47.5) | 3 → 1 of 72 | 0 (7.5) → 0 (2.5) | 4.2 → 2.3 | 1.6 → 2 | 0 → 0 of 216 |
| C♯4–C5 | the pitch struck again | 17.5 (37.5) → 17.5 (37.5) | 0 → 0 of 96 | 15 (32.5) → 15 (32.5) | 8.2 → 8.2 | 1.1 → 1.1 | 0 → 0 of 480 |
| C♯4–C5 | from a whole tone above | 17.5 (85) → 12.5 (40) | 21 → 0 of 96 | 0 (45) → 0 (12.5) | 5.8 → 5.7 | 1 → 1.1 | 0 → 0 of 288 |
| C♯4–C5 | from a fourth below | 55 (80) → 32.5 (67.5) | 79 → 5 of 96 | 2.5 (32.5) → 0 (10) | 6.5 → 5.9 | 0.5 → 1.1 | 0 → 0 of 288 |
| C♯4–C5 | from a fifth above | 37.5 (80) → 27.5 (40) | 24 → 0 of 96 | 0 (45) → 0 (0) | 3.7 → 2.7 | 0.9 → 1.1 | 1 → 0 of 288 |
| C♯5–C6 | the pitch struck again | 12.5 (22.5) → 12.5 (22.5) | 0 → 0 of 96 | 7.5 (17.5) → 7.5 (17.5) | 7 → 7 | 0.5 → 0.5 | 0 → 0 of 480 |
| C♯5–C6 | from a whole tone above | 27.5 (57.5) → 25 (57.5) | 4 → 4 of 96 | 0 (0) → 0 (7.5) | 4 → 4 | 0.4 → 0.4 | 0 → 0 of 288 |
| C♯5–C6 | from a fourth below | 50 (140) → 30 (102.5) | 69 → 2 of 96 | 0 (72.5) → 0 (72.5) | 5.2 → 4.7 | 0 → 0.4 | 15 → 0 of 288 |
| C♯5–C6 | from a fifth above | 42.5 (67.5) → 30 (45) | 21 → 0 of 56 | 0 (10) → 0 (2.5) | 3.9 → 3 | 0.3 → 0.5 | 3 → 0 of 168 |

All 976 cells: 234 → 14 with a median of 45 ms or more; 255 faster by more than 15 ms, **31 slower by more than
15 ms** (their medians 5 → 32.5 ms, the slowest 50: notes the measure took as spoken at once because the last note's
harmonics lay on theirs, a fifth or an octave apart); holes 37 shorter by more than 10 ms, 2 longer (B5 and C6 from
a fourth below: 0 → 15 and 22.5 ms).

E3–C4 by tempo:

| joined how | note length, ms | speak, ms: median (latest) | hole under −6 dB, ms: median (longest) | hole, dB | lost |
|---|---:|---:|---:|---:|---:|
| the pitch struck again | 250 | 27.5 (55) → 27.5 (55) | 17.5 (32.5) → 17.5 (32.5) | 10.9 → 10.9 | 0 → 0 of 90 |
| the pitch struck again | 150 | 30 (55) → 30 (55) | 20 (35) → 20 (35) | 10.1 → 10.1 | 0 → 0 of 90 |
| the pitch struck again | 125 | 30 (55) → 30 (55) | 20 (37.5) → 20 (37.5) | 9.8 → 9.8 | 0 → 0 of 90 |
| the pitch struck again | 107 | 32.5 (42.5) → 32.5 (42.5) | 15 (42.5) → 15 (42.5) | 9.2 → 9.2 | 0 → 0 of 90 |
| from a whole tone above | 250 | 25 (55) → 20 (37.5) | 2.5 (50) → 7.5 (12.5) | 6.7 → 7.8 | 0 → 0 of 54 |
| from a whole tone above | 150 | 30 (57.5) → 17.5 (37.5) | 2.5 (42.5) → 7.5 (15) | 6.7 → 7 | 0 → 0 of 54 |
| from a whole tone above | 125 | 30 (65) → 30 (47.5) | 2.5 (17.5) → 7.5 (12.5) | 6.5 → 6.9 | 1 → 0 of 54 |
| from a whole tone above | 107 | 30 (45) → 27.5 (42.5) | 2.5 (12.5) → 2.5 (12.5) | 6 → 6.4 | 0 → 0 of 54 |
| from a fourth below | 250 | 72.5 (92.5) → 30 (60) | 15 (45) → 2.5 (5) | 8.8 → 7.2 | 0 → 0 of 24 |
| from a fourth below | 150 | 70 (90) → 30 (37.5) | 20 (40) → 2.5 (5) | 9.4 → 7.9 | 0 → 0 of 24 |
| from a fourth below | 125 | 20 (77.5) → 35 (45) | 0 (30) → 2.5 (12.5) | 5.8 → 6.4 | 0 → 0 of 24 |
| from a fourth below | 107 | 17.5 (85) → 30 (45) | 0 (7.5) → 2.5 (5) | 4.5 → 6.6 | 2 → 0 of 24 |
| from a fifth above | 250 | 5 (60) → 10 (47.5) | 0 (5) → 0 (0) | 3.5 → 0.3 | 0 → 0 of 54 |
| from a fifth above | 150 | 10 (60) → 7.5 (42.5) | 0 (7.5) → 0 (2.5) | 4.4 → 2 | 0 → 0 of 54 |
| from a fifth above | 125 | 10 (57.5) → 5 (45) | 0 (5) → 0 (0) | 5 → 2.6 | 0 → 0 of 54 |
| from a fifth above | 107 | 5 (57.5) → 10 (37.5) | 0 (5) → 0 (2.5) | 4.7 → 3 | 0 → 0 of 54 |

From a fourth below at 125 and 107 ms the median was 20 and 17.5 ms before because half those notes read as spoken
on the last note's ring and the other half took 60–85 ms, 2 lost; now all are within 45 ms.

`scripts/winds-midi-bench.ts`, the trumpet's rows that changed (the others are identical): the joined scale,
middle: speaks in 40 → 25 ms (the latest 57.5 → 42.5); low: 35 → 25 (85 → 45), the weakest note −0.5 → +1.8 dB;
high: 40 → 27.5 ms, **the latest 47.5 → 70** (one note, C♯6 after B5: a hole of 13.5 dB and 60 ms for 6.9 dB and
5 ms; see "Left"); detached
(half of each note a rest): 37.5 → 27.5 ms, the weakest −7 → −1.6 dB, the least of a note at its own pitch 0.67 →
0.95; the largest step at an event 1.76 → 1.12 × the steps around it (the most of any row, 1.51 in the low repeats, is as it was). Joined
notes over the compass (`winds-midi-joined.ts`): 0 of 768 fail, before and after. Notes from silence
(`winds-midi-fresh.ts`): identical.

Steps upwards (a semitone, a tone, a minor third, each note alternating with the one under it; 250 and 125 ms; the
latest of each cell's notes, and its longest hole): on the same partial nothing moves by more than 2.5 ms; onto
another partial E3–C4 82.5 → 40 ms (median of 20 cells), the hole 52.5 → 5 ms, 2 → 0 lost; C♯4–C5 57.5 → 35 ms, the
hole 22.5 → 2.5 ms; C♯5–D6 50 → 30 ms (the worst 87.5 → 57.5), **but 11 of its 92 cells get a longer hole** (B♭5 to
B5, B5 to C♯6, A5 to C6 and a few more: 0–12.5 → 20–47.5 ms, to 13.5 dB) and 7 a shorter one.

### Tried and not kept

| what | measured | |
|---|---|---|
| a first attack's whole kick and transient on a note on another partial (`LICK_BOOST` 1 for 0.5) | none of the 92 top cells with a longer hole (the worst 17.5 ms), a fourth below from C♯5 up 25 ms (the latest 37.5); but the joined notes' level over the same note held: median 0.7 → 1.1 dB, cells over +3 dB 15 → 41 of 356 (7 before), the most 3.7 → 6.2 dB (mp sixteenths, E3–A3) | an accent nobody asked for; at 0.75: 3 cells with a longer hole, 28 over +3 dB |
| the kick on a pitch struck again too | E3–C4 repeated: the latest note back after 55 → 132.5 ms, the longest hole 32.5 → 107.5 ms (250 ms notes), 2 of 90 lost at 125 ms | the standing wave does it better |
| the kick on every note that moves, the same partial too | steps in C♯4–C5: median 12.5 → 22.5–27.5 ms, the longest hole 12.5 → 40 ms | kept only across partials |
| the kick after every rest the tongue held, however short | Toward Morning's repeated pitches over rests of a few ms: 11.7 → 18.8 ms (mean), the latest 12.5 → 30 | kept from 40 ms |
| the valves and lips under the stroke, without the kick | fourth below, C♯4–C5: 57.5 → 40 ms, but from a fifth above 37.5 → 55–60 ms, 4 of 72 lost | both, or neither |
| a first attack's whole transient on a moved note (`LICK_BOOST` 1), without the kick | fourth below, C♯4–C5: 60 → 60 ms, the latest 65 → 80; +1.3 dB | the gain alone does nothing |
| the lips kept from answering the bore while the tongue is down | G3 repeated: the dip under the tongue 9 → 4.5 dB, but the level within 3 dB of the note's 27 ms after the beat for 10; fourth below, E3–C4: 20 → 65 ms | lips at rest have to start again |
| the stopped lips taking 3–6 dB a round trip from the bore (as the horn's and trombone's do) | C4 after G3: 65 ms still; a repeated pitch's hole 20 ms and 10 dB → 52–65 ms and 21–22 dB | the ring is what fills the stroke |
| the bore losing 6 dB a round trip while the valves travel | C4 after G3 within 6 dB after 85–100 ms | it takes from the new note too |
| the bore emptied at the beat (a probe, not a fix) | C4 after G3: 65 → 50–65 ms | the last note's ring is not what holds the new one back: the lips' start is |

### Left

* **A pitch struck again on a low note** is as it was: back at its level one round trip after the beat, a 9–11 dB
  dip of 15–20 ms, and 20 ms of the lips settling into step with the ring (which the measure reads as 27–32 ms). The
  round trip is the model's reading point (the wave back at the lips), 9–12 ms on a trumpet's tube whatever the
  note; reading it at the bell, half a round trip earlier, would move every note of the instrument 5 ms and change
  the goldens for no audible gain between notes.
* **A note joined on another partial still takes 30 ms (median), not a first attack's 15–20 ms at once**: the lips
  are a passive resonator that the bore's return has to lock (5–6 round trips to full level from an empty bore, with
  the breath on). 14 cells of 976 remain at 45 ms or more (the latest single notes 60–102 ms).
* **Rising onto a neighbouring partial at the top (C♯5 up)**, 11 of 92 cells have a hole of 20–47 ms where there was
  one under 15 (the valves now move under the stroke, and half a first attack's kick does not always carry the lips
  over to a partial a tone away); 7 cells the other way, and the notes speak in 30 ms for 50. A whole kick cures it
  and accents the low notes (table above): it wants a kick that grows with the partial, measured, in a later pass.
* The valves' glide is a fraction a sample (`D += (target − D) · 0.003`): 7 ms at 48 kHz, 3.5 ms at 96 kHz. Seen,
  not touched (it would move the goldens).

## 2. The trombone

### What it was

`scripts/trombone-slurs.ts`: six runs (a B♭ major scale up and back; broken thirds; a chromatic fall along one
partial; F3–D3–F3–D♭3 along the third partial, 26 and 36 cm of slide each way; the lips alone in first position;
thirds across partials), slurred as a file slurs (each note held 30 ms into the next), at 80–300 ms a note.

* The slide set off **on the note's beat** and travelled at its 4 m/s: 18 cm short on the beat (median of a scale),
  there 55 ms later (the most 134 ms), the soft tongue over all of it. A note a third or more away on the slide
  spent its first 65–90 ms under the tongue with the lips already on the new partial and the tube still the last
  note's. At 139 ms a note 21 of 52 notes were lost, at 200 ms still 4.
* **A valve turned at the slide's speed.** The tube is one length in the model; the F attachment's 0.9 m came in
  as 46 cm of slide would, 115–134 ms, under a soft tongue as long. C3 (F valve, first position) after B♭2 was lost
  in the slurred scale at every length under 300 ms (−34 dB at 200 ms).
* A file's **detached notes were never kicked** (the same fault as the trumpet's: the kick meant for a note after a
  rest the tongue held, `1 + QUICK_KICK`, waited for a stroke to let go by itself). The bench's scale of 70 ms
  notes with 70 ms rests: 1 of 8 lost, the weakest −19 dB.

### The fix (`packages/engine/src/core/trombone.ts`, and one addition to `mono.ts`)

* **The slide sets off ahead for a note that is known to come and will be slurred to** (`slideAhead`), by its
  travel, and is there on the beat; the last note is that much shorter under the soft tongue, as a player's is.
  Only where the note playing keeps 35 ms of its own first (`MIN_OWN`): in a run faster than its slide, it sets off
  on the beat as before. If the note does not come within 30 ms it goes back. Not when gliding (`gliss`, CC65).
  `mono.ts` gains `upcoming(frame, within)` (the next foreseen note, however it will be joined; `upMidi`, `upSlur`):
  additive, asked only by the trombone, nothing of `settle`/`coming`/`plan` changes.
* **A valve's loop is its own** (`weigh`, `aim`, `valveLeft`): it begins to turn 12 ms after the soft tongue (the
  tongue is down by then) and is in or out with a time constant of 8 ms, through in 36 ms. Where a valve's loop and
  the slide's travel oppose each other (C3 on the valve in first to C♯3 in fifth: the loop out, the slide 36 cm out),
  what cancels is not moved: the tube is reached the short way, as before, as a player takes such a pair on the slide
  alone. The drawn slide (`getVisual().trombone.slide`) no longer shows a valve's loop as slide.
* **A note known to be short (0.3 s or less) is kicked after a rest the tongue held**, as a short note from silence is.

Tongued notes (each ending where the next begins) and everything played by hand keep the slide as it was; they are
bit-identical unless a valve turns.

### Numbers (before → after)

Notes lost, and in brackets those of the rest that sound on another partial of the tube.

**tenor, slurred, told ahead**

| run (notes) | 80 ms | 100 ms | 120 ms | 139 ms | 170 ms | 200 ms | 300 ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| steps (14) | 9 (0) → 5 (1) | 6 (1) → 4 (1) | 5 (1) → 2 (0) | 4 (1) → 0 (1) | 3 (1) → 0 (0) | 3 (0) → 0 (0) | 1 (0) → 0 (0) |
| thirds (11) | 11 (0) → 8 (1) | 10 (0) → 6 (0) | 6 (0) → 4 (0) | 6 (0) → 0 (1) | 3 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) |
| chromatic (8) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) |
| far (6) | 5 (0) → 5 (0) | 6 (0) → 6 (0) | 6 (0) → 6 (0) | 6 (0) → 4 (0) | 2 (0) → 2 (0) | 1 (0) → **2** (0) | 0 (0) → 0 (0) |
| lips (6) | 0 (4) → 0 (4) | 0 (3) → 0 (4) | 0 (1) → 0 (2) | 0 (0) → 0 (0) | 0 (1) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) |
| leaps (7) | 7 (0) → 7 (0) | 7 (0) → 4 (1) | 5 (1) → 3 (1) | 5 (2) → 2 (0) | 1 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) |
| **all** | 32 → 25 | 29 → 20 | 22 → 15 | 21 → 6 | 9 → 2 | 4 → 2 | 1 → 0 |

118 → 70 of 364 lost; on another partial 16 → 17. At 200 ms a note: the slide short of its place on the beat
18.4 cm (median; 50.2 the most) → 0 (2.1); there 55 ms after the beat (134) → 16 ms before it (12 after: a valve
still turning); a note speaks in 40 ms (the latest 122.5) → 12.5 (75) in the scale, 95 (112.5) → 27.5 (82.5) in the
leaps; the weakest note of the scale −26 → −3.6 dB of its held level (139 ms: −25.9 → −11.8).

**alto, slurred, told ahead**

| run (notes) | 80 ms | 100 ms | 120 ms | 139 ms | 170 ms | 200 ms | 300 ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| steps (14) | 6 (1) → 6 (0) | 4 (1) → 3 (1) | 3 (1) → 1 (1) | 2 (1) → 1 (1) | 1 (0) → 1 (0) | 1 (0) → 0 (0) | 0 (0) → 0 (0) |
| thirds (11) | 8 (0) → 7 (0) | 5 (0) → 5 (0) | 5 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) |
| chromatic (8) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) |
| far (6) | 5 (0) → 5 (0) | 5 (0) → 5 (0) | 3 (0) → 3 (0) | 1 (0) → **2** (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) |
| lips (6) | 0 (4) → 0 (2) | 0 (1) → 0 (1) | 0 (1) → 0 (1) | 0 (1) → 0 (1) | 0 (1) → 0 (1) | 0 (1) → 0 (1) | 0 (0) → 0 (0) |
| leaps (7) | 6 (0) → 2 (1) | 5 (1) → 2 (0) | 2 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) |
| **all** | 25 → 20 | 19 → 15 | 13 → 4 | 3 → 3 | 1 → 1 | 1 → 0 | 0 → 0 |

62 → 43 of 364; on another partial 14 → 11.

**bass, slurred, told ahead**

| run (notes) | 80 ms | 100 ms | 120 ms | 139 ms | 170 ms | 200 ms | 300 ms |
|---|---:|---:|---:|---:|---:|---:|---:|
| steps (14) | 8 (0) → 4 (3) | 6 (1) → 4 (1) | 5 (1) → 2 (1) | 3 (1) → 1 (1) | 3 (1) → 0 (1) | 3 (1) → 0 (0) | 0 (0) → 0 (0) |
| thirds (11) | 11 (0) → 7 (0) | 9 (0) → 4 (0) | 5 (0) → 4 (0) | 4 (0) → 0 (1) | 1 (1) → 0 (0) | 0 (1) → 0 (0) | 0 (0) → 0 (0) |
| chromatic (8) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) | 0 (0) → 0 (0) |
| far (6) | 5 (0) → 5 (0) | 5 (0) → 5 (0) | 6 (0) → 6 (0) | 4 (0) → 3 (0) | 2 (0) → 1 (0) | 0 (0) → **1** (0) | 0 (0) → 0 (0) |
| lips (6) | 3 (2) → 0 (3) | 0 (4) → 0 (4) | 0 (3) → 0 (3) | 0 (3) → 0 (3) | 0 (2) → 0 (2) | 0 (2) → 0 (3) | 0 (0) → 0 (0) |
| leaps (7) | 7 (0) → 7 (0) | 7 (0) → 4 (1) | 5 (1) → 3 (1) | 4 (1) → 1 (1) | 0 (1) → 0 (2) | 0 (0) → 0 (0) | 0 (0) → 0 (0) |
| **all** | 34 → 23 | 27 → 17 | 21 → 15 | 15 → 5 | 6 → 1 | 3 → 1 | 0 → 0 |

106 → 62 of 364; on another partial 26 → 31.

**Three cells of the 126 lose one note more** (bold), all in `far`, where every note is 26–36 cm from the last: the
tenor's and the bass's at 200 ms, the alto's at 139 ms. The note is F3 before the 36 cm to D♭3: it now speaks 30 ms
after its beat (105 ms before) and sounds 57 ms at its pitch before the slide leaves for the next note (113 ms of
travel), where before it began 105 ms late and held to its end; the measure reads a note's 40–90 %, which is now
under the next note's soft tongue. The same run speaks in 22.5–105 ms (median, the latest 112.5) → 17.5–30 (35) at
200 ms on the two, and over all its lengths loses 26 → 25, 14 → 15, 22 → 21 notes.

**tenor, tongued (each note ending where the next begins), told ahead**: 27 → 23 of 364 lost (80 ms: 20 → 16; the
rest equal), on another partial 14 → 12, no cell with more; what changed is the valve (C3 in the scale at 120 ms:
"sounds B2", 0.44 of it at its pitch → C3, 0.77).

**tenor, slurred, nothing told ahead** (a keyboard): 121 → 99 of 364 (the valve alone: 80 ms 34 → 28, 100 ms 29 → 25,
120 ms 22 → 18, 139 ms 20 → 18, 170 ms 9 → 6, 200 ms 6 → 4, 300 ms 1 → 0), no cell with more.

`winds-midi-bench.ts`, the trombone's rows that changed: **slur** (the scale, each note 30 ms into the next, 139 ms):
lost 3 → 1 of 8, speaks in 80 → 25 ms (the latest 137.5 → 102.5), the note furthest off its pitch 167 → 101 cents;
the dip between notes 2.6 → 9 dB and 0 → 15 ms under −6 dB, the median note −3.6 dB of its held level for +0.3 (the
soft tongue now lies before the beat, inside the last note's measured span). **detached**: lost 1 → 0, the weakest
−19 → −5.1 dB, speaks in 20 → 15 ms (the latest 62.5 → 30), off its pitch at most 157 → 37 cents. **The joined scale
at the bottom** (G1 up: valve notes): speaks in 22.5 → 30 ms, the weakest −6.4 → −7.8 dB, the hole 25 → 17.5 ms.
Every other row identical. Joined notes over the compass (`winds-midi-joined.ts`): 147 → 138 of 1128 fail (nine
valve notes pass, none newly fails). Notes from silence (`winds-midi-fresh.ts`): identical.

The largest sample step of the slurred runs, anywhere, against the 99th percentile of the steps within 50 ms (six
runs): 2.38–3.47 before, 2.78–2.96 after; at an event, at most 2.11 before, 1.74 after.

### Tried and not kept

| what | measured | |
|---|---|---|
| the slide ahead for tongued notes too, under the soft tongue | tongued runs: 25 → 75 of 260 lost | the soft tongue is a slur's; tongued notes left as they were |
| no least time of its own for the note playing | 80 ms: the scale 9 → 14 of 14 lost | `MIN_OWN` |
| …20 ms | chromatic at 80 ms: 0 → 1 lost | 35 ms: no cell worse but the three of `far` below |
| the slide's travel at most half the note | 139 ms: the scale 3 lost, the thirds 5 (for 0 and 0) | the moves that matter at 139 ms are 0.64 of the note |
| the valve turned at once, 5 ms | a step 5.0 × the steps around it in the thirds at 139 ms | 12 ms after the tongue, 8 ms: 2.9 |
| the valve's loop and the slide always apart (no short way) | joined notes over the compass: 147 → 150 fail (F2 to F♯2, C3 to C♯3: the loop out and 36 cm of slide at once, where the old single length moved 2 cm) | what cancels is not moved: 138 |
| the kick on a note joined to the last (the trumpet's fix) | joined over the compass 148 → 146, tongued runs 23 → 21, but the bench's joined scale speaks in 27.5 → 42.5 ms (median) | left unkicked |
| the kick after a held rest whatever the note's length | Toward Morning's notes after its short rests: 47.5 → 62.5–70 ms (median) | notes of 0.3 s or less only: 47.5 |

### Left

* **A note shorter than its slide's travel plus 35 ms** is as before: at 4 m/s (and 24 ms of the hand's start and
  stop) a third on the slide (26 cm) takes 89 ms, 36 cm 113 ms. The scale at 100 ms still loses 4 of 14, `far` 5–6 of 6
  to 120 ms. A player would take other positions (F3 in sixth beside G3 in fourth); the chart here is one position a
  note. Not attempted: it changes which partial every such note is on.
* **The soft tongue covers the whole travel.** The last 65–113 ms of a note before a long move are under it (a dip of
  9 dB by the bench, the pitch on its way): the note is on its beat now, and its end is short. Masking only the
  middle of the travel would give a real legato's smear at both ends; not tried.
* **The lips alone across partials at speed** (`lips`: B♭2 F3 B♭3 D4 in first position): no note lost, but 4 of 6
  on another partial at 80–100 ms, 2–3 at 120–200 ms, before and after. The lips' retuning (6 ms) is not what
  limits it; the tube's own regime is. Untouched.
* **Tongued notes** (the Air's, most of a typeset file's) keep the slide setting off on the beat: 23 of 364 lost in
  the runs, the slide 18 cm short on the beat. Sending it ahead needs something other than the soft tongue to cover
  the last note's end (first row of the table above).
* **C3 on the valve in a slurred scale** is the weakest note of it: −3.6 dB of its held level at 200 ms a note (−26
  before), −11.8 at 139 ms (−25.9): a new tube and a new partial at once.
* Barely overlapping notes (under 12 ms, Toward Morning's) get `mono.ts`'s tongue stroke and then arrive as a
  slur: with a long move the note is still late (F♯3 after D4, 36 cm: a 27 dB hole of 90 ms; 35 dB and 92 ms before).

## The bundled pieces' parts

`winds-midi-measure.ts`, each part's busiest 30 s as the Orchestra sends it (before → after; one value: unchanged).

| part | notes | lost | joined note speaks, ms (median) | (9 in 10 within) | after a rest, ms | joined: dip, dB | dip under −6 dB, ms | repeated: dip, dB | off pitch | impure | worst step × | steps over 2× |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| La Réjouissance trumpet 1 | 99 | 0 | 25 → 22.5 | 55 → 35 | 37.5 | 4.7 | 0 | 7.2 → 7.1 | 0 | 0 | 1.01 → 1.03 | 0 |
| Beethoven 5 i trumpet 1 | 66 | 0 | 55 → 32.5 | 55 → 40 | 40 | 4.7 → 4.2 | 0 | 7.3 → 7.2 | 0 | 0 | 1.09 → 1.12 | 0 |
| Beethoven 5 i trumpet 2 | 66 | 0 | 65 → 20 | 82.5 → 50 | 42.5 | 8 → 6.7 | 12.5 → 2.5 | 9.6 | 0 | 0 | 1.17 → 1.15 | 0 |
| Beethoven 5 ii trumpet 1 | 23 | 0 | 32.5 → 27.5 | 57.5 → 37.5 | 37.5 | 4.6 → 4.3 | 0 | 6.9 | 0 | 0 | 0.75 → 1.08 | 0 |
| Beethoven 5 ii trumpet 2 | 21 | 0 | 47.5 → 27.5 | 55 → 32.5 | 40 | 4.9 → 4.3 | 0 | 8.9 | 0 | 0 | 1.11 | 0 |
| Toward Morning trumpet 1 | 44 | 0 | 42.5 → 27.5 | 82.5 → 37.5 | 27.5 → 25 | 6.2 → 3.8 | 2.5 → 0 | 6.8 | 0 | 0 | 1.03 → 1.05 | 0 |
| own piece: trumpet | 98 | 0 | 25 → 15 | 55 → 32.5 | 37.5 | 4.7 → 4.6 | 0 | 7.1 → 7 | 0 | 0 | 0.72 → 1.03 | 0 |
| Air trombone 1 | 47 | 1 | 25 | 82.5 | 60 | 5.8 | 0 | – | 1 | 1 | 1.42 | 0 |
| Air trombone 2 | 45 | 0 | 22.5 | 75 | 87.5 | 5.7 | 0 | 8.2 | 0 | 0 | 1.24 | 0 |
| Air trombone 3 | 42 | 0 | 22.5 → 20 | 80 | 70 | 6.3 | 2.5 | 9 | 0 | 0 | 1.23 | 0 |
| Air trombone 4 (bass) | 48 | 0 | 22.5 | 52.5 | 130 | 6.2 → 6.1 | 2.5 | 12.7 → 12.5 | 0 | 0 | 1.14 → 1.2 | 0 |
| Toward Morning trombone 1 | 32 | 0 | 22.5 | 82.5 → 55 | 47.5 | 6.2 → 6.3 | 2.5 | 9.2 | 0 | 0 | 1.41 → 1.48 | 0 |
| own piece: trombone | 47 | 1 | 30 | 178.6 | 40 | 7.5 | 7.5 | – | 1 | 1 | 1.13 | 0 |

No part loses a note it had, none gains a note off its pitch, on another register or impure, no step over 2 ×. The
Air's notes are tongued (each ends where the next begins): its slides are as they were, and its two lost notes
(parts 1 and the trombone's own piece, the same passage) are the ones #59 lists. Toward Morning's whole 261 s:
the trumpet's joined notes speak in 45 → 27.5 ms (9 in 10 within 87.5 → 37.5); the trombone's in 27.5 → 27.5 ms (9 in 10 within 97.5 → 95), none lost
in either, before or after.

## Verdicts and tests

* `scripts/judge.ts --before` (held-out notes of the Iowa recordings): **trumpet NO CLEAR CHANGE** (fit 3.27 → 3.27,
  held-out 3.23 → 3.23, Δ 0.00 ± 0.00), **trombone NO CLEAR CHANGE** (3.81 → 3.81, 3.97 → 3.97, Δ 0.00 ± 0.00): the
  notes it renders are identical.
* `npx vitest run packages/engine`: green, `golden.test.ts` untouched (nothing blessed), `blocksize.test.ts`,
  `mono.test.ts` (a note alone bit-identical), `clicks.test.ts`, `worklet.test.ts` as they were. `pnpm test`
  (engine and web), `pnpm typecheck` and `pnpm build` (the Safari 14.1 worklet check) green.
* New: `packages/engine/test/audit3-brass.test.ts` (8 tests, under a second). Five fail on `a561109`: the trumpet a
  fourth up 30–70 ms after its beat (−18.8 dB of its level at worst before, over −9 now, median over −3); a staccato
  pitch over held rests (G3 −19.4 dB → over −8); the trombone's slide on the beat (0 → 0.26 m) and a valve through
  60 ms after it; a slurred scale at 200 ms with no note 15 dB under the others (−34 before); detached notes (−17 →
  over −10). Three guard: a pitch struck again as it was, `MonoKeys.upcoming`, and both paths bit-identical at 128
  and 37 frames a call.

## Clips

Each `-before.mp3` / `-after.mp3` as heard (the room on, 128 kb/s) with a stacked spectrogram (`.png`, before on top,
0–6 kHz, the first 12 s) and its numbers in `index.json`.

* `trumpet-low-repeated-joined`: G3 and C4 repeated at 250, 125 and 107 ms a note, then G3 C4 E4 G4 C4 … joined
  with no rest at 250 and 125 ms. The repeats are the same in both; the bugle's notes speak in 47.5 → 30 ms (9 in 10
  within 67.5 → 40).
* `trombone-fast-slur`: a B♭ major scale slurred up and back at 170 and at 139 ms a note, then broken thirds at
  170 ms: lost 10 → 1 of 42, 9 in 10 joined notes speak within 80 → 42.5 ms. By the same measure 2 → 12 notes read
  more than 35 cents off: it takes a note's pitch over its 40–90 %, where the slide now leaves for the next note
  under the soft tongue (before, the note's first 65–90 ms were the smear, and were not read).
* `trumpet-beethoven5-i`: trumpet II in the Fifth, I, its busiest 16 s. `trumpet-rejouissance`: its own piece.
* `trombone-toward-morning`: the trombone in Toward Morning (its notes overlap: slurs). `trombone-air`: trombone I
  in the Air (tongued: nothing to hear between the two, by design).

## Seen on the way, for the other winds

* **`horn.ts` has the trumpet's never-given kick** (`if (this.lickKick && wasDown && !lick.down)` after a stroke let
  go from `settle`): its notes after a stroke made ahead, and after a rest the tongue held, are not kicked as the
  comments say. Not touched here (the horn is not this branch's). On the trumpet the kick wanted care: only across
  partials, and after rests of 40 ms or more; on the trombone only for short notes after a held rest.
* `mono.ts` `coming()` makes a tongue's stroke ahead for a note foreseen to overlap the last by less than
  `FORESEE_TOL` (12 ms); the note then arrives as a slur and every core lets the stroke go. For all seven winds such
  notes (Toward Morning: 2–27 ms) are a stroke and a slur at once.
* `MonoKeys.upcoming` is there for any core that wants to ready more than its tongue (a flute's fingers, a
  bassoon's).
* The measure's `speak` reads a pitch struck again on a low note 15–20 ms late (a 20 ms window over a ring and a
  buzz out of step); the level is back sooner. It will read so on any wind.
