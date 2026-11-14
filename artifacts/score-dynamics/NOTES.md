# Score dynamics

Five bundled pieces played with no dynamics of their own: Mutopia's files for the Haydn "Emperor" variations,
the Brandenburg No. 5 finale, La Réjouissance, the Air (four trombones) and the Fifth's first movement have
one velocity per line (the Air's is 127; the Fifth's source says why: `\Voice \remove "Dynamic_performer"`).
The page's automatic expression phrased them, but a piano was never a piano. And in "Everything So Far" the
viola held 36 of its 43 notes at velocity 34 (the cello 31 of 42 at 30–31).

Their scores' dynamics are now in the files: note velocities and expression (CC11).

## How

* **The marks are text** (`scripts/score-dynamics/marks/<piece>.ts`): per line, `bar:beat mark …` with
  `ppp … fff` (a `+` or `−`: a third of the way to the next), `sf fz sfz rf`, `fp sfp`, `cresc dim`, hairpins
  `< > !`. `build.ts` writes them into the files; a built file gives itself (`--check`), and nothing but
  velocities and CC11 moves (every other event of every track, tick for tick: the test).
* **Where the marks are from.** Mutopia's LilyPond sources carry them even where the MIDI does not.
  `ly-marks.ts` reads enough LilyPond to keep time through a part and lists its marks by bar and beat; the
  time it keeps is checked against the file (all but one of the Fifth's 6,407 note onsets found in its
  place; all of the Brandenburg's flute and strings but seven, its ornaments, and 97 % of its harpsichord's;
  the Haydn's all but its grace notes). So: the Fifth's are Breitkopf & Härtel's
  as Samelis typeset them, staff by staff; the Haydn's the Kalmus edition's (piano, the fz of the tune's last
  line, pianissimo and hairpins at the close); the Brandenburg's the Bach-Gesellschaft's terraces (bars
  79–189: piano, pianissimo, forte, cantabile). **Handel's score and the Air have none**: theirs are an
  editor's phrasing, and each piece's credit on the Notes page says which is which.
* **A mark is so many decibels under fortissimo on every instrument** (ppp −19, pp −15, p −11, mp −8,
  mf −5.5, f −2.5, ff 0). Each instrument's loudness against velocity was measured
  (`velocity-curve.ts`): 0.19–0.22 dB a step on the strings and the piano, 0.10 on the flute and the trumpet,
  0.29 on the trombone. A string's or a piano's velocity is the one that gives the level. A wind's is the
  mark's timbre (pp 45 … ff 108), and what its velocity does not reach is its CC11 (the flute at piano:
  velocity 56, CC11 89), the page's gain on the part (40·log₁₀(v/127) dB), never under 80.
* **Inside a note**: its velocity is the level it reaches, and CC11 carries what moves under that: a
  crescendo through a held chord, a sforzando's fall (0.15 s), a fortepiano, a long note's own small swell.
  The piano and the timpani get velocities only.
* **Unasked**, and small (the KTH rules' sizes, in dB): the downbeat leaned on (0.7), high notes a little
  louder (0.06 a semitone, ±1), long over short (±0.8), a chord's top (0.5), each note its own (σ 0.35).
* **An editor's, said at the head of each marks file**: a staff that comes in unmarked or with "cresc."
  alone is given the level of the staves round it (`review.ts` lists every entry after a rest and its
  level: the flutes' mf at 38, a p before seven "cresc."); the Fifth's "cresc." at 34 and 278 runs on to the
  forte it leads to; the Haydn's tune swells to the top of each line; the Brandenburg's unmarked outer
  sections are forte, and its terraces are 0.7 of a symphony's (a harpsichord concerto's piano is a step
  down, not a hush).

## Numbers

Velocities and CC11 per line, the files as they came against the files now (`build.ts --report --from <the
files as they came>`):

| piece | line | velocity before → after (distinct) | CC11 after |
|---|---|---|---|
| Haydn | violin I | 75–97 (4) → 46–111 (55) | 92–127 |
| | violin II | 75–81 (3) → 43–109 (48) | 93–127 |
| | viola | 62–79 (4) → 42–84 (42) | 93–127 |
| | cello | 62–67 (3) → 42–90 (47) | 93–127 |
| Brandenburg 5, III | flute | 63 (1) → 60–108 (49) | 92–127 |
| | solo violin | 97 (1) → 60–109 (39) | 109–127 |
| | ripieno violin | 97 (1) → 49–105 (49) | 116–127 |
| | viola | 66 (1) → 46–107 (49) | 116–127 |
| | cello | 79 (1) → 54–107 (37) | 110–127 |
| | violone (not seated) | 79 (1) → 53–105 (32) | 109–127 |
| | harpsichord (two staves) | 90 (1) → 64–106 (37, 33) | none |
| La Réjouissance | trumpet | 90 (1) → 70–107 (33) | 101–127 |
| | organ (two staves, the piano) | 90 (1) → 61–95 (34, 29) | none |
| Air | alto trombone | 127 (1) → 69–113 (34) | 100–127 |
| | tenor I, tenor II, bass | 127 (1) → 66–103, 69–113, 69–109 (31, 30, 35) | 106–127 |
| Symphony No. 5, I | flutes, oboes | 90 (1) → 46–124 (56, 63) | 80–127 |
| | clarinets, bassoons, horns | 90 (1) → 48–124 (71, 72, 62) | 80–127 |
| | trumpets | 90 (1) → 46–124 (43) | 80–127 |
| | timpani | 90 (1) → 43–114 (38) | none |
| | violins I, II | 90 (1) → 42–124 (72, 74) | 106–127 |
| | violas, cellos, basses | 90 (1) → 42–124 (78, 75, 64) | 80–127 |
| Everything So Far | viola | 34–71 (6) → 42–75 (9) | 84–127 (1,200 moves) |
| | cello | 30–67 (7) → 42–80 (11) | 82–127 |
| | its nine other lines | unchanged | at rest |

As sound (`render-orchestra.ts --played --stems --wav`, then `levels.ts`): 32 s of each, before (the files as
they came, the page's automatic expression on) against after. The mix's level, and its range (the 95th
centile of 2 s windows less the 10th):

| piece (excerpt) | mix RMS before → after | range before → after | clips |
|---|---|---|---|
| Haydn, 0:50–1:22 (the rise to the fermata, the two fz, piano) | −26.0 → −25.3 dB | 3.9 → 8.3 dB | `before-haydn.mp3`, `after-haydn.mp3` |
| Brandenburg, 1:13–1:45 (forte, the cantabile at 79, the terraces) | −23.6 → −25.5 | 5.2 → 7.2 | `…-bach.mp3` |
| La Réjouissance, 0:14–0:47 | −20.3 → −22.9 | 5.6 → 4.9 | `…-handel.mp3` |
| Air, 0:00–0:32 | −23.6 → −27.9 | 3.1 → 4.2 | `…-air.mp3` |
| Symphony No. 5, 0:00–0:32 (ff, p, cresc., f, ff, p, cresc. sf, ff) | −25.5 → −24.9 | 11.4 → 15.9 | `…-beethoven5-i.mp3` |
| Everything So Far, 1:38–2:10, the viola alone (the cello alone) | | 6.7 → 8.6 (5.3 → 7.9) | `…-everything-so-far.mp3` |

`levels-<piece>.png` draws each (the Fifth's motto now stands some 10 dB over the piano that answers it;
before, it was no louder than that piano).

Two things the numbers say that are not improvements, as they are:

* **La Réjouissance moves no more than it did** (4.9 dB against 5.6): its score marks nothing, the old
  automatic phrasing already gave it arches, and what replaces them is an editor's (forte, lighter second
  strain, one fortissimo at the close). What changed is that it is in the file.
* **The viola of Everything So Far already swelled as heard**: the automatic expression phrased its flat
  line (6.7 dB as heard). Its swells are now its own (8.6 dB), the same with the hairpin off, and they are
  written to stay under the tune (pianissimo to piano; the one mezzo-forte the part already had, at bar 54).
  The first marks I wrote stood 5 dB over the harp's tune at bar 45: `levels.ts` showed it, and they came
  down a mark and a half.

## Dynamics cost no note

Every note of the string lines read one by one (`strings-notes.ts`: on its pitch, there, how soon) on the
files as they came and as they are: the Haydn (theme and Variation I; Variation IV and the close), the
Fifth (0–80 s, 120–160 s), the Brandenburg (70–130 s), the viola and cello of Everything So Far (whole).
Off-pitch counts are the same within two notes a line either way (the Fifth's second violins 34 → 42 of 276
in the first 80 s is the one that grew: chords, where the reader finds no single pitch), and the time to
speak is unchanged (90th centile within 20 ms).

The winds note by note (`winds-midi-measure.ts`): no note lost in any wind part of the Fifth, in its busiest
30 s, in the second theme's piano (from 35 s) or the pianissimo chords before the recapitulation (from
108 s); none in the Brandenburg's flute, the Handel's trumpet.

**The Air loses two short notes it did not** (of 512): a B4 sixteenth of the first tenor in bar 2 (cracks:
60–80 ¢ off, at any velocity from 82 to 110 I tried) and an F♯4 sixteenth of the alto in bar 19 (on pitch,
13 dB under itself held). One note was already lost at full force (E4 at 50.5 s). These are the trombone's
slurs at a middle breath, not a level I can mark round: left for the engine.

## Balance

A mark is one level on every instrument, so a part's place is its score's. Three places it was set by hand
(`lift`, dB over the marks, said in the marks file): the Haydn's four parts +2 (a singing piano); the Air's
three lower trombones +1.5 to +2.5 over the tune's (a trombone's low register is 8–10 dB softer at one
velocity); the Handel's piano 2.5 under its trumpet, which it doubles.

The pieces are not level with one another, and were not: the Air is 4 dB softer than it was (it was every
note at 127), the Handel 2.6. Levels between pieces are the next job's.

## What is left

* Expression is a gain on the part, as General MIDI has it: a crescendo through a held note grows louder,
  not brighter. The engines can do better (their own `CC_DYNAMICS` moves the bow or the breath), but only
  the page's automatic expression speaks it; a file cannot ask for it.
* The Fifth's second movement, the Mozart pieces and the horn sonata are as flat as these were (their
  sources have their dynamics too: `ly-marks.ts` should read them).
* The trombone's two notes above.
