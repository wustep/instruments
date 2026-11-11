# The winds and brass playing a MIDI file

Brief: the seven one-note instruments (flute, oboe, clarinet, bassoon, horn, trumpet, trombone) sound bad when
they play a file (the Orchestra's pieces, a single instrument's file), better by hand; the guess was that files
overlap notes and the one-note handling mishandles that. Branch `improve/winds-midi`. Everything below was
measured on `main`'s engine at `24658cb` (**before**: the audio audits #50 and #55 are in it; nothing in the
engine has changed on `main` since) and on this branch (**after**), with the same notes and the same scripts.
Nothing was tuned by ear.

## What was wrong, in plain words

1. **A file's notes do not overlap: they touch, and touching notes were not articulated.** In the Mutopia
   pieces (LilyPond writes every note its full length) 62–100 % of a wind part's notes begin at the very
   instant the last one ends; none overlap but nine in the bassoon's concerto (`scripts/winds-midi-survey.ts`). The engines took "off, then
   on, in the same sample" as a tongued note, but the tonguing never stopped the tone: the breath was never let
   fall, and the bore rang through the 12–30 ms the tongue held the reed. **A repeated note fell 0.6–1.9 dB
   between its strokes on five of the seven** (trombone 4, clarinet 9 dB for 7 ms): Beethoven's three eighths
   were one long note. In the first movement of the Fifth a third of every wind part's notes are such repeats
   (flute I: 145 of 437).
2. **Every note was begun as a long tone.** The attacks are fitted to the Iowa recordings, which are long
   tones: their 10–90 % rises are 45–240 ms (medians per instrument and dynamic). A note of 139 ms (an eighth
   at Beethoven's tempo) begun from silence reached, of the same note held: the flute −18 dB (median over its
   compass and five dynamics; worst −40), the trombone −13, the horn −6, the oboe −6; 119 of the flute's 185
   such notes never came within 12 dB. So the first notes of an entry were missing or late: after a rest a
   part's notes spoke 38–175 ms after their beat (medians per part). The horn's began up to 300 cents sharp, on the partial above, and came down over 85–140 ms.
3. **The flute stayed on the wrong register after coming down across a break**, and so did every note of that
   register after it until one of the lowest: in 30 s of the Fifth, 12 of flute I's 86 notes sounded another
   pitch (a fifth or more off). Its registers overlap, and descending, the upper one holds: of eleven falls
   across the two breaks, each at two lengths and three dynamics, 77 of 132 joined notes were off their pitch
   tongued and 109 slurred (`scripts/winds-midi-joined.ts --seq falls`).
4. **Order and pairing.** (a) A note-on written before the last note's off at one instant: the off then ended
   the new note (1–2 of 5 notes lost on every instrument). `parseMidi` already sorts a file's events so this
   cannot come from a file, but nothing in the engine was safe against it. (b) A pitch begun again before its
   own end (two voices in unison on one line, a sequencer's overlap): on the single instrument's file player
   the first end cut the second note (the Orchestra's player counted already). (c) A chord sent to one player:
   the last note written was played, after a glide through the others; let go top note first, the tail was
   handed to the note under it.
5. **Not found:** clicks (after #50 the largest one-sample step at any event is 1.65× the tone's own in every
   part measured, 1.52× after), notes left sounding (none: the level 1.5 s after each passage is the room's own), wrong
   voices stolen. Real overlaps (Toward Morning has 2–27 ms ones) were slurred correctly before and still are.

## What changed

* **`packages/engine/src/core/mono.ts`** (new), shared by the seven cores in place of seven copies of the same
  key stack. The notes of one instant are taken together, so their order does not matter: a note over a held
  one is slurred; a note begun where the last ends (or its pitch struck again, or begun while the breath is
  still on) is **tongued over the breath**: a stroke of the tongue stops the tone and lets it go; the end of a
  note no longer playing changes nothing; a chord is its top note; a note begun and ended at one instant is a
  tap; nothing is counted from one instant to the next, so a key can never hang; a different note sooner than
  85 ms after the last stroke is slurred (a grace note, a trill: no tongue is that fast).
* **A file tells the winds the notes to come**, as it tells the bows since #48 (`audio.foreseeFileEvent`, the
  worklet, `'foresee'`): then (i) a note known to be short is tongued to speak within a share of its length
  (the breath's rise at most a twelfth of the note, the oboe's a sixth, the bassoon's a quarter; the flute's jet aimed sharper, the horn's lips set firm and a
  semitone low for 30 ms, the trombone's kicked harder); a note of 1.2 s or more, or of unknown length (a key
  in the hand), keeps the long tone's attack, bit-identical alone; (ii) the stroke before a joined note is made
  14–26 ms ahead of it, so the note speaks on its beat and the one before is that much shorter, as a
  player's is; (iii) a rest under 120 ms is held by the tongue with the breath kept (a staccato), so the next
  note speaks at once; the trombone's slide travels during it.
* **Each core's stroke**: the flow through the reed, the jet, or the mouth's pressure at the lips, closed over
  2 ms, held, let go. Where a bore fitted on held notes rings on too long with its reed shut, the tongue (the
  oboe's) or the stopped lips (horn, trombone) take a little from it; the bassoon's is left whole and its
  breath eased under the tongue instead (its octave regime is as stable as its fundamental: the less a stroke
  empties the bore, the less often the reed is let go onto the octave).
* **The flute lets its air fall** for 50 ms on a note joined to one of a higher register (`FALL`): the falls
  above, 77 → 4 of 132 tongued, 109 → 26 slurred. Rising into its third register a tongued note is let go with
  a first attack's push (`RISE_AIM`): ten rises, 20 → 25 of 120 tongued (the stroke's lighter push left 32),
  72 → 65 slurred.
* **`apps/web/src/file-keys.ts`**: the single instrument's file player pairs a file's notes as the Orchestra's
  did: a pitch held twice at once is struck at each beginning and let go at its last end.
* A new strength is taken up once the tongue is down, so the air through a sounding note never steps (the
  audio audit's click measure stays under 1.8× on the trombone's re-tongued notes).

Hand-played notes: a note alone is bit-identical (`mono.test.ts`), the goldens are unchanged (not re-blessed),
`scripts/judge.ts` against the recordings is NO CLEAR CHANGE for all seven (Δ 0.00 ± 0.00: the notes it
renders are identical). What does change by hand: a pitch struck again while the breath is on is now a stroke of
the tongue (it was no break at all), chords take their top note, and a slur or a note down across the flute's
breaks lets the air fall.

## Measured: each way notes meet, per instrument

`npx tsx scripts/winds-midi-bench.ts` (dry, 48 kHz, mf; the notes sent as the file player sends them, before →
after). The dip is how far the level falls under the softer of the two notes; a note is lost if it stays
12 dB under the same note held, or under a third of its level is at its own pitch.

| what is asked (139 ms notes unless said) | measure | flute | oboe | clarinet | bassoon | horn | trumpet | trombone |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| a pitch repeated with no rest, middle | dip between the notes, dB | 0.6 → 7.9 | 1.6 → 5.6 | 9.3 → 14.4 | 1.2 → 4.1 | 1.9 → 7.7 | 1.8 → 8.2 | 4 → 8.6 |
| the same, low | dip, dB | 0.8 → 7.7 | 0.5 → 4.5 | 4.2 → 5.6 | 2.4 → 5 | 12.9 → 13.2 | 3.2 → 9.4 | 12.2 → 17.5 |
| the same, high | dip, dB | 0.7 → 9.4 | 2.5 → 6.1 | 38.5 → 70.9 | 1.9 → 6 | 2.3 → 8.3 | 0.5 → 6.2 | 6.6 → 11.6 |
| a scale, each note ending where the next begins | dip, dB | 0.5 → 6.3 | 1.6 → 2.3 | 12.6 → 9.7 | 0.2 → 3.6 | 3.4 → 5.4 | 1 → 5.1 | 6.5 → 5.4 |
| the scale, each note held 30 ms into the next | dip, dB | 0 → 0.2 | 0.1 → 0.2 | 0.1 → 0.2 | 0.4 → 0.4 | 2.1 → 1.9 | 1 → 1 | 4.1 → 2.6 |
| a repeat written with each on before the last off | notes lost of 5 | 2 → 0 | 1 → 0 | 1 → 0 | 1 → 0 | 1 → 0 | 1 → 0 | 1 → 0 |
| a pitch begun again before its own end | notes lost of 2 | 2 → 0 | 1 → 0 | 1 → 0 | 1 → 0 | 1 → 0 | 1 → 0 | 1 → 0 |
| the scale, half of each note a rest | notes lost of 8 | 1 → 0 | 1 → 0 | 1 → 0 | 1 → 0 | 1 → 0 | 0 → 0 | 1 → 1 |
|  | weakest note, dB re held | -35.8 → -1.2 | -36 → -1.8 | -32.9 → 0.2 | -29.1 → -3.4 | -15.9 → -5.9 | -8.8 → -7 | -27 → -19 |
| three 90 ms notes after rests | weakest note, dB re held | -34.5 → 1.1 | -30.3 → -5.2 | -11.3 → 0.2 | -12.8 → -3.1 | -12.7 → -5.2 | -0.8 → -0.8 | -24.8 → -2.6 |
|  | speaks in, ms | 32.5 → 40 | 45 → 17.5 | 57.5 → 15 | 55 → 40 | 90 → 67.5 | 42.5 → 42.5 | 37.5 → 27.5 |
| two chords of three, one after the other | top note speaks in, ms | 342.5 → 77.5 | 37.5 → 75 | 25 → 60 | 50 → 65 | 135 → 95 | 47.5 → 42.5 | 127.5 → 80 |

The clarinet's bore decays fastest with its reed shut (its top register is silent within 5 ms, as a real
clarinet's altissimo is): its strokes are the deepest. The slur's dip on the trombone is its slide's soft
tongue, as before.

## Measured: every note from silence, as a file's note

`npx tsx scripts/winds-midi-fresh.ts`: every note of each compass at five dynamics (velocity 36–124) and five
lengths (139 ms–1 s), its length told ahead. A note fails if it stays 12 dB under the same note held, if under
70 % of its level is at its own pitch, or if it speaks on another register.

| instrument | notes that fail, all lengths | at 139 ms: fail | level re held, median (worst), dB | speaks in, ms | at 278 ms: fail | at 1 s: fail |
|---|---:|---:|---:|---:|---:|---:|
| flute | 203 → 0 of 925 | 119 → 0 of 185 | -18.3 (-40) → 2.4 (-3.7) | 70 → 43 | 54 → 0 | 0 → 0 |
| oboe | 101 → 15 of 900 | 70 → 2 of 180 | -5.7 (-41.6) → -0.1 (-13.5) | 60 → 30 | 18 → 1 | 5 → 5 |
| clarinet | 92 → 0 of 1125 | 71 → 0 of 225 | -1.3 (-38.8) → 0 (-4.8) | 58 → 25 | 18 → 0 | 0 → 0 |
| bassoon | 36 → 18 of 1075 | 36 → 18 of 215 | -3.2 (-31.1) → -2.3 (-28) | 68 → 58 | 0 → 0 | 0 → 0 |
| horn | 120 → 41 of 1100 | 110 → 41 of 220 | -6.4 (-19.4) → 0 (-10) | 105 → 73 | 10 → 0 | 0 → 0 |
| trumpet | 0 → 0 of 875 | 0 → 0 of 175 | 1.2 (-4.6) → 1.2 (-4.6) | 45 → 45 | 0 → 0 | 0 → 0 |
| trombone | 288 → 201 of 1250 | 163 → 87 of 250 | -12.9 (-36.4) → -0.5 (-9.8) | 75 → 53 | 51 → 41 | 24 → 23 |

What still fails after: the oboe's notes on their octave (C5, D6, E♭6 and a few more at some dynamics: 5 of
them fail on `main` at 1 s too), 18 of the bassoon's 139 ms notes (36 before), the horn's low notes in
139 ms (41 of 220: a tube of 22 ms a round trip), and the trombone's pedal register, where the measure itself is at its
limit (twelve harmonics of a 41 Hz note end at 500 Hz, under most of a trombone's sound: the same 23 fail at
1 s before and after).

## Measured: the bundled pieces' parts

`npx tsx scripts/winds-midi-measure.ts`: every wind and brass part of the Orchestra's pieces as its routing
sends it, and each instrument's own piece, its busiest 30 s, note by note (before → after).

| part | notes | lost | off their pitch | another register | weakest note after a rest, dB | speaks after a rest, ms | repeated note: dip, dB | joined note: dip, dB | worst step × |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| bach flute 1 | 143 | 6 → 1 | 2 → 0 | 0 → 0 | -32.6 → 1.2 | 92.5 → 40 | 0.2 → 6.8 | 0.5 → 5 | 1.3 → 1.1 |
| handel trumpet 1 | 99 | 0 → 0 | 0 → 0 | 0 → 0 | 0.1 → 0.1 | 37.5 → 37.5 | 0.6 → 7.2 | 0.8 → 4.7 | 1.1 → 1 |
| air trombone 1 | 47 | 1 → 1 | 0 → 1 | 0 → 0 | -5.3 → -0.4 | 92.5 → 60 | – → – | 6.1 → 5.8 | 1.2 → 1.4 |
| air trombone 2 | 45 | 1 → 0 | 0 → 0 | 0 → 0 | -0.4 → 0 | 115 → 87.5 | 3.4 → 8.2 | 5.8 → 5.7 | 1.3 → 1.2 |
| air trombone 3 | 42 | 0 → 0 | 0 → 0 | 0 → 0 | -0.9 → -0.3 | 110 → 70 | 5 → 9 | 5.8 → 6.3 | 1.5 → 1.2 |
| air trombone 4 | 48 | 0 → 0 | 0 → 0 | 0 → 0 | 0.3 → 0.5 | 145 → 130 | 7.6 → 12.7 | 5.4 → 6.2 | 1.4 → 1.1 |
| Beethoven 5 i flute 1 | 86 | 13 → 1 | 12 → 1 | 0 → 0 | -17.6 → 1.9 | 77.5 → 45 | 0.7 → 9.4 | 0.7 → 6.7 | 1 → 1 |
| Beethoven 5 i flute 2 | 63 | 5 → 0 | 1 → 0 | 0 → 0 | -27.8 → 0.9 | 112.5 → 47.5 | 0 → 9.1 | 0.6 → 5.8 | 1 → 1 |
| Beethoven 5 i oboe 1 | 72 | 0 → 0 | 0 → 0 | 0 → 0 | -5.2 → -3.4 | 60 → 37.5 | 1.7 → 5.7 | 0.6 → 2.3 | 1.1 → 1 |
| Beethoven 5 i oboe 2 | 59 | 0 → 0 | 0 → 0 | 1 → 2 | -7.3 → -9.1 | 72.5 → 47.5 | 0.4 → 5.1 | 0.9 → 1.7 | 1.1 → 1 |
| Beethoven 5 i clarinet 1 | 86 | 0 → 0 | 0 → 0 | 0 → 0 | -1 → -0.3 | 50 → 30 | 10.3 → 17.3 | 12.9 → 9.8 | 1.1 → 1.1 |
| Beethoven 5 i clarinet 2 | 82 | 0 → 0 | 0 → 0 | 0 → 0 | -1.1 → -0.3 | 57.5 → 32.5 | 6.6 → 8.8 | 7.1 → 6 | 1.1 → 1.1 |
| Beethoven 5 i bassoon 1 | 91 | 0 → 0 | 0 → 0 | 0 → 0 | -2.1 → -2.2 | 52.5 → 40 | 1.2 → 4.4 | 1.1 → 4 | 1.1 → 1 |
| Beethoven 5 i bassoon 2 | 66 | 0 → 0 | 0 → 0 | 0 → 0 | -7 → -5.7 | 65 → 65 | 0.2 → 4.1 | 0.3 → 4 | 1 → 1.1 |
| Beethoven 5 i horn 1 | 62 | 0 → 0 | 0 → 0 | 0 → 0 | -3.1 → -0.5 | 100 → 40 | 1.8 → 7.1 | 2.2 → 3.8 | 1 → 1 |
| Beethoven 5 i horn 2 | 44 | 0 → 0 | 2 → 0 | 0 → 0 | -9.3 → -0.2 | 155 → 102.5 | 2.4 → 6.6 | 2 → 5.9 | 1.1 → 1 |
| Beethoven 5 i trumpet 1 | 66 | 0 → 0 | 0 → 0 | 0 → 0 | -0.1 → -0.1 | 40 → 40 | 0.5 → 7.3 | 0.2 → 4.7 | 1.1 → 1.1 |
| Beethoven 5 i trumpet 2 | 66 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 42.5 → 42.5 | 1 → 9.6 | 2.8 → 8 | 1.3 → 1.2 |
| Beethoven 5 ii flute 1 | 67 | 5 → 2 | 5 → 2 | 0 → 0 | -19 → 1 | 175 → 67.5 | 0.2 → 7.4 | 0.3 → 5 | 0.9 → 0.7 |
| Beethoven 5 ii flute 2 | 25 | 1 → 1 | 1 → 0 | 0 → 0 | -6.3 → 1.6 | 167.5 → 62.5 | 0.1 → 8.2 | 0.1 → 5.3 | 1 → 0.6 |
| Beethoven 5 ii oboe 1 | 63 | 0 → 0 | 0 → 0 | 0 → 0 | -5.3 → -2.1 | 170 → 75 | 1.6 → 5.6 | 1.1 → 2.1 | 1.2 → 1 |
| Beethoven 5 ii oboe 2 | 23 | 0 → 0 | 0 → 0 | 0 → 2 | -4 → -2 | 102.5 → 95 | 1.2 → 5.3 | 0.4 → 1 | 1.2 → 1 |
| Beethoven 5 ii clarinet 1 | 65 | 0 → 0 | 0 → 0 | 0 → 0 | -0.4 → 0 | 132.5 → 90 | 8.4 → 11.4 | 8.3 → 7 | 1 → 1 |
| Beethoven 5 ii clarinet 2 | 63 | 0 → 0 | 0 → 0 | 0 → 0 | -0.5 → -0.2 | 130 → 97.5 | 6.8 → 11 | 6.6 → 5.5 | 1 → 0.9 |
| Beethoven 5 ii bassoon 1 | 55 | 0 → 0 | 0 → 0 | 0 → 0 | -0.8 → -0.8 | 77.5 → 77.5 | 1.7 → 4.1 | 1.6 → 5.5 | 1 → 1.2 |
| Beethoven 5 ii bassoon 2 | 46 | 0 → 0 | 0 → 0 | 0 → 0 | -0.5 → -0.5 | 75 → 75 | 1.4 → 4.8 | 1 → 4.2 | 1 → 1.2 |
| Beethoven 5 ii horn 1 | 24 | 0 → 0 | 0 → 0 | 0 → 0 | -0.1 → -0.1 | 100 → 42.5 | 2 → 7.2 | 2.1 → 4.6 | 1 → 1.1 |
| Beethoven 5 ii horn 2 | 24 | 0 → 0 | 0 → 0 | 0 → 0 | 0.1 → -0.2 | 155 → 102.5 | 2.7 → 6.5 | 3 → 5.1 | 0.9 → 0.8 |
| Beethoven 5 ii trumpet 1 | 23 | 0 → 0 | 0 → 0 | 0 → 0 | -0.1 → -0.1 | 37.5 → 37.5 | 0.3 → 6.9 | 0.8 → 4.6 | 1 → 0.8 |
| Beethoven 5 ii trumpet 2 | 21 | 0 → 0 | 0 → 0 | 1 → 1 | -0.1 → -0.1 | 40 → 40 | 0.3 → 8.9 | 0.8 → 4.9 | 1 → 1.1 |
| toward-morning flute 1 | 44 | 0 → 0 | 0 → 0 | 0 → 0 | -0.4 → -0.4 | 12.5 → 10 | – → – | 2.1 → 10.7 | 0.9 → 1.1 |
| toward-morning oboe 1 | 44 | 0 → 0 | 0 → 0 | 0 → 0 | -0.7 → -0.3 | 140 → 102.5 | 2 → 5.2 | 0.9 → 1.9 | 1.2 → 1.1 |
| toward-morning clarinet 1 | 144 | 0 → 0 | 0 → 0 | 0 → 0 | -0.9 → -0.2 | 62.5 → 27.5 | – → – | 9.3 → 7 | 1.1 → 1.2 |
| toward-morning bassoon 1 | 59 | 0 → 0 | 0 → 0 | 0 → 0 | -0.1 → -0.1 | 42.5 → 30 | 1.6 → 5.6 | 1.8 → 7.1 | 1 → 1.1 |
| toward-morning horn 1 | 36 | 0 → 0 | 0 → 0 | 0 → 0 | -0.4 → -0.2 | 75 → 55 | 2.7 → 8.3 | 2.1 → 4.1 | 1 → 1.1 |
| toward-morning trumpet 1 | 44 | 0 → 0 | 0 → 0 | 0 → 0 | -0.1 → -0.1 | 30 → 27.5 | 0.2 → 6.8 | 4.1 → 6.2 | 1.1 → 1 |
| toward-morning trombone 1 | 32 | 0 → 0 | 0 → 0 | 0 → 0 | -1.3 → -0.3 | 102.5 → 47.5 | 4 → 9.2 | 7 → 6.2 | 1.5 → 1.4 |
| own piece: flute | 148 | 2 → 4 | 1 → 1 | 0 → 0 | -31.9 → 1.6 | 37.5 → 57.5 | 0 → 7.7 | 0.6 → 5.6 | 1.5 → 1.2 |
| own piece: oboe | 68 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 105 → 105 | 1.5 → 5.8 | 1.3 → 2.1 | 1.1 → 1 |
| own piece: clarinet | 39 | 0 → 0 | 0 → 0 | 0 → 0 | -0.6 → -0.6 | 60 → 60 | 8.8 → 13.4 | 11 → 8.4 | 1.1 → 1.1 |
| own piece: bassoon | 71 | 0 → 0 | 0 → 0 | 0 → 1 | -2.7 → -2 | 67.5 → 67.5 | 0.7 → 4.3 | 0.6 → 3.7 | 1.1 → 1.1 |
| own piece: horn | 77 | 0 → 0 | 0 → 0 | 0 → 0 | -0.6 → -0.5 | 95 → 57.5 | 2.2 → 8.1 | 2.2 → 4.4 | 1 → 1 |
| own piece: trumpet | 98 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 37.5 → 37.5 | 0.5 → 7.1 | 0.8 → 4.7 | 1.1 → 0.7 |
| own piece: trombone | 47 | 1 → 1 | 0 → 1 | 0 → 0 | -6.8 → 0.2 | 90 → 40 | – → – | 6.8 → 7.5 | 1.2 → 1.1 |
| **all** | 2717 | 35 → 11 | 24 → 6 | 2 → 6 | | | | | |

## Toward Morning

A symphonic movement for 13 parts (bundled since #58, CC0) whose wind lines do overlap (by 2–27 ms: slurs),
leave rests of a few milliseconds between half their notes, and repeat pitches. Its whole 261 s, every wind
part (the file routed as a dropped one is; the same seven parts the piece's own plan seats):

| part | notes | lost | off their pitch | another register | weakest note after a rest, dB | speaks after a rest, ms | repeated note: dip, dB | joined note: dip, dB | worst step × |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| flute 1 | 235 | 2 → 0 | 0 → 0 | 0 → 0 | -16.7 → -7.8 | 65 → 35 | 2.7 → 11.3 | 1.9 → 9.6 | 1 → 1 |
| oboe 1 | 259 | 0 → 0 | 0 → 0 | 1 → 0 | -7.3 → -2.3 | 85 → 62.5 | 3.5 → 5.8 | 0.7 → 2 | 1.5 → 1.1 |
| clarinet 1 | 652 | 0 → 0 | 0 → 0 | 0 → 0 | -0.9 → -0.9 | 55 → 50 | 11.7 → 12.1 | 9.4 → 6.9 | 1.2 → 1.5 |
| bassoon 1 | 269 | 0 → 0 | 0 → 0 | 1 → 3 | -3.9 → -2.6 | 47.5 → 37.5 | 1.7 → 5.8 | 1.2 → 3.9 | 1.1 → 1.4 |
| horn 1 | 225 | 0 → 0 | 0 → 0 | 0 → 0 | -0.6 → -0.4 | 92.5 → 65 | 2.5 → 7.8 | 2 → 4.3 | 1.3 → 1.5 |
| trumpet 1 | 198 | 0 → 0 | 0 → 0 | 0 → 0 | -0.2 → -0.2 | 32.5 → 32.5 | 0.2 → 6.7 | 3.5 → 6 | 1.2 → 1.2 |
| trombone 1 | 145 | 0 → 0 | 0 → 0 | 0 → 0 | -1.4 → -0.3 | 105 → 85 | 4 → 9.1 | 6.6 → 6.3 | 1.6 → 1.5 |
| **all** | 1983 | 2 → 0 | 0 → 0 | 2 → 3 | | | | | |

Its short rests are now the tongue's (a staccato with the breath kept), where before the breath was let go and
taken up again for each note.

The three things flagged on it:

* **(a) The bassoon's A "near the octave above".** Two things. Its A3 (59 of its 269 notes) is on its
  fundamental, but radiates its second harmonic 14 dB over its first (the fitted formant at 482 Hz, +18 dB): a
  detector that takes the strongest partial reads A4. And real octaves exist: this bore's octave regime is as
  stable as its fundamental and the start decides, by the reed's noise. Measured by playing the part with ten
  players, each with its own noise (`mode` in `winds-midi-measure.ts`: the note's odd harmonics 20 dB under its
  even ones; `scripts/winds-midi-players.ts`): before 3.4 notes a performance on another register, after
  4.1; C♯3 and D3 carry almost all of them (D3 alone, held, starts on its octave 2–4 times in 8 on `main`).
  Bassoon I and II in the Fifth: 3.2 → 2.3 of 523 and 5.7 → 5.0 of 379 (six players). So this branch does
  not cure it and does not make it worse; the first strokes tried did (9.5 a performance: a reed let go at
  full breath into an emptied bore), which is why the bassoon's stroke leaves its bore whole and eases the
  breath. The cure is in the bore model (#55 documents it as left).
* **(b) The trombone quieter than the horn at full velocity.** Two halves. Its held level was the recording
  session's (−23 against −12 LUFS): #55 gave it its place in the Orchestra (+9 dB as played), and that stands
  here: as heard, G3 held at ff is −15.0 dBFS on the trombone and −16.9 on the horn, and over this piece's
  notes the trombone is at −14.5 dBFS and the horn at −18.4, the same before and after this branch. The
  other half was this brief's: its short notes never reached their level (a 139 ms note from silence −13 dB
  of the held note, median; now −0.5) and spoke 105 ms after a rest in this piece (now 85 ms).
* **(c) Violin quarter notes reading an octave low** (out of scope here, measured only): in the first 90 s, 8
  of Violin I's 88 notes and 12 of Violin II's 124 carry components at half their pitch (f/2 or 3f/2) within
  12 dB of their own fundamental: loud (velocity 99–109) quarters of 320–350 ms on D5 and C5, begun after a
  rest. That is the bowed string's period-doubled motion under a hard, fast start, with these notes' weak
  fundamental (−35…−40 dB) beside it.

## Left as it is

| What | Measurement | Why |
|---|---|---|
| The flute rising across a register break on a joined note | 25 of 120 joined notes off their pitch tongued (before 20: the jet was never stopped), 65 slurred (72); a rising fifth across the second break (A5→E6) can land on the fourth mode | the tube rings on with the old note's second harmonic, which is the new tube's fourth mode; neither more nor less air cures it. Needs the fingering change itself modelled (the delay is glided, not switched) |
| The oboe on its octave | 15 of 900 notes from silence; joined notes 7 of 396 (before 9); Beethoven 5 I, six players: oboe I 1.2 → 0.5 notes a performance, oboe II 0.8 → 2.2 | as the bassoon: two stable regimes. G4 and C5 go when re-tongued, D6 when begun softly |
| The trumpet's low notes after a stroke | within 6 dB of their level 55–65 ms after the beat in the Fifth (before, unarticulated: 13–38 ms) | the lips' buzz regrows from the stroke; its kick is half a first attack's and was not tuned further |
| The trombone's slide in fast slurs | a scale of 139 ms notes slurred: 3 of 8 lost, before and after | the slide's travel at 4 m/s under its soft tongue; a player would take other positions |
| A note after a longer rest is not begun ahead of its beat | speaks 30–100 ms after it (flute 40, horn 40–100) | the stroke ahead is only made on a sounding note; beginning the breath early is a further step |
| Lines that cross on one player (a melody held over moving notes) | the last note begun is played, the held one comes back when it ends | chords begun together take their top note; staggered parts would need the file read as voices (the Orchestra's desks do, `divide`) |

## Clips

`audio/`, each `-before.mp3` and `-after.mp3` (as heard: the room on; 16 s) with a spectrogram (`.png`, before
on top, 0–6 kHz, first 12 s) and its numbers in `audio/index.json`:

* `flute-`, `oboe-`, `clarinet-`, `bassoon-`, `horn-`, `trumpet-beethoven5-i`: one of each pair in Beethoven's
  Fifth, I, the same 16 s (from 195 s of the movement as the Orchestra plays it); `winds-beethoven5-i`: the
  six together.
* `trombone-air`: trombone II in Bach's Air for four trombones.
* `flute-`, `bassoon-`, `horn-`, `trumpet-own-piece`: each instrument's own piece from its start.

Toward Morning's clips are not among them: `npx tsx scripts/render-winds-midi.ts apps/web/public/pieces/fable-toward-morning.mid --out <dir> --seconds 30`
writes each of its seven wind parts' busiest 30 s, before and after.

## Reproduce

```sh
git archive 24658cb packages/engine apps/web/src/orchestra apps/web/src/midi-file.ts apps/web/src/expression.ts | tar -x -C .cache/before-engine
B=.cache/before-engine/packages/engine/src/core/index.ts
npx tsx scripts/winds-midi-survey.ts                      # how the bundled parts' notes meet
npx tsx scripts/winds-midi-bench.ts --bare --engine $B    # each way notes meet, before
npx tsx scripts/winds-midi-bench.ts                       # …after
npx tsx scripts/winds-midi-fresh.ts [--engine $B] [--list]
npx tsx scripts/winds-midi-measure.ts [--engine $B] [--part "beethoven5-i flute 1"] [--notes] [file.mid]
npx tsx scripts/winds-midi-joined.ts [--engine $B] [--only oboe,bassoon] [--seq falls|rises] [--over 0.03]
npx tsx scripts/winds-midi-players.ts "beethoven5-i bassoon 1" [--engine $B] [--players 6]
npx tsx scripts/render-winds-midi.ts --before $B          # the clips and audio/index.json
for i in flute oboe clarinet bassoon horn trumpet trombone; do npx tsx scripts/judge.ts --instrument $i --before $B; done
```
