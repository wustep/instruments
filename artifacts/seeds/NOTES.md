# Seeds

`/seeds` — an endless piece for ten of the instruments, after Brian Eno's *Music for Airports*. Nothing of it
is stored: every note is worked out in the page from a word, the seed (`/seeds?seed=kelumo`).

Nobody had listened to it when this was written. Everything below is measured or counted; where a number
stands for "does it sound like players in a room", it says what was measured and what was not.

## What it is

Ten players: flute, clarinet, horn, glockenspiel, harp, piano, violin, viola, cello, double bass. Each is
given a phrase of one to five notes and a loop of its own length to come back to it on.

* **The loops share no measure.** Each is a whole number of hundredths of a second, between 17 and 59 s,
  and no two share a factor. For the seed `kelumo` they are 22.82, 30.33, 19.85, 49.73, 23.09, 19.79,
  29.69, 49.01, 49.03 and 36.77 s: were every entry on its loop's instant, the ten would come round
  together after 2.6 × 10²⁵ years.
* **A phrase is under a third of its loop** for everyone who blows or bows (Eno: "a silence at least twice
  as long as the sound"), at its longest: the slowest pace, the longest notes, a lifted bow. A blown phrase
  is one breath (flute 8.5 s, clarinet 10.5, horn 10 at most).
* **The harmony is five notes that move one at a time.** Three collections (D E F♯ A B; G A B D E; C D E G
  A), each under its major root and its relative minor: six fields. A field lasts 130–260 s; the next is a
  neighbour that differs by one note or by its bass alone, never the one just left. Each player takes a new
  field up at their own next entry, up to 34 s after it comes, so for a while two fields overlap (never
  three). The bass has the root (the fifth one entry in four), the cello the triad, the others the five. A
  sixth note, the major seventh over the root (the ninth, in the minor fields), may be a phrase's last note
  on the flute, the violin, the piano or the glockenspiel, one entry in five to ten.
* **They are players, not loops.** An entry is up to a second early or late (a slow wander over its
  entries, plus each one's own 0.12 s); the phrase is taken at its own pace each time (× 0.90–1.14), each
  note its own length (± 10 %); no two entries at one strength. A blown or bowed phrase begins 8–9 dB under
  its top, swells, and dies away 14–16 dB under it (expression, CC11, in steps under 1 dB), the bow or the
  breath swelling with it (the engines' own dynamics controller, 6–9 velocity steps). Bowed notes are
  joined or, one time in three, lifted between; blown ones slurred (seven in ten) or tongued. The piano has
  its pedal under each phrase.
* **A phrase grows.** A player begins a stay with one note of its phrase (the harp with two) and adds one
  every one or two entries. A stay is 190–430 s, an eighth of it away; one entry in twenty is sat out.
  Now and then a phrase is moved a step in its register for a few entries, or (glockenspiel, piano) taken
  an octave away.
* **They listen.** When nothing has sounded for 7–10 s, a player who is present and clear of their own
  loop comes in with their phrase. This is the one rule that looks across the players; it is still a
  function of the time alone (it is worked out from what the loops would have done over the two minutes
  before).
* **It begins at once** (0.4 s) and the ten come in one at a time, 4–12 s apart: everyone within two
  minutes.

It is a pure function of the seed and the time. The same seed is the same music; any stretch can be asked
for, in any pieces; nothing keeps state. The file player asks for 30 s more whenever under 30 s are left and
lets go of what is 20 s past.

## What I read, and what I took

| Read | Taken |
|---|---|
| Brian Eno, "Generative Music", a talk at the Imagination Conference, San Francisco, 8 June 1996 (In Motion Magazine, inmotionmagazine.com/eno1.html) | The construction of *Music for Airports* 2/1 as he tells it: a sung note to a loop, "23 1/2 seconds… 25 7/8… 29 15/16", in "cycles that are called incommensurable — they are not likely to come back into sync again". "Seeds" against "forests": a few rules and little material. Rules that are "probabilistic… an envelope of possibilities", and "one very exotic harmony that can only occur under particular conditions" (the field's sixth note). That such music "sometimes has quite large gaps in it", and that the gaps come from the rules. |
| Brian Eno, liner notes to *Ambient 1: Music for Airports* (1978), as quoted in the Wikipedia article on the album; the article's account of how 2/1 was made | "As ignorable as it is interesting"; "calm and a space to think". "A silence at least twice as long as the sound" and "complicated rather than simple relationships" between the loops: the third-of-a-loop rule, and loop lengths with no common factor. Everything between pianissimo and mezzo-piano. |
| Tero Parviainen, "JavaScript Systems Music" (2016, teropa.info), on 2/1 and on *It's Gonna Rain* | The seven notes of 2/1 (F A♭ C D♭ E♭ F A♭): of their 21 pairs one is a minor second, so "whatever the system may throw at us will generally sound pretty good". Hence five-note fields with no semitone in them, and the semitone kept for the colour. (I could read only the first third of the article verbatim; the loop lengths he uses came from a summary.) |
| Brian Eno, *Discreet Music* (1975), from the Wikipedia article (the liner notes themselves would not load) | Two lines of different lengths and a system left to run; music heard "as part of the ambience". The piece has no climax and no end. |
| Steve Reich, "Music as a Gradual Process" (1968) | "I want to be able to hear the process happening throughout the sounding music"; "once the process is set up and loaded it runs by itself"; a process that moves like "a minute hand on a watch". So nothing is hidden: the loops are steady enough to be heard slipping past each other, a phrase grows a note at a time, the harmony moves one note in minutes. Reich also says "one can't improvise in a musical process"; the players' wander here is not improvisation, it is the same phrase played by a person. |
| Terry Riley, *In C* (1964): the performing directions as summarised in the Wikipedia article, with the quotations it gives from the 1989 and 2005 directions; Robert Carl's introduction to his book on the piece (New Music USA) | Everyone has the same material and moves through it at their own pace, within two or three patterns of each other: the shared field, each player's own lag, never more than one field apart. "Listen very carefully to one another", drop out and come back in: the time away, the entries sat out, the rule that fills a long silence. Patterns "may be transposed by octaves". (I did not see the score's own page of directions: two copies would not load.) |

What I did not take: a pulse (In C's is optional, and Riley came to dislike it "out in front"); Reich's
strictness (two identical loops drifting apart is a different piece); Eno's tape (a loop that never varies
is right for a tape and wrong for a bow).

## The numbers

**As a score** (`npx tsx scripts/seeds-survey.ts --seeds 40`: forty seeds, thirty minutes each; least …
median … most):

| | |
|---|---|
| blown or bowed notes held at once, on average | 1.31 … 1.41 … 1.49 |
| the share of the time nothing sounds (a ringing string counted 4 s) | 8 … 11 … 14 % |
| the longest such silence | 7.3 … 9.5 … 12.9 s |
| notes a minute | 27 … 32 … 38 |
| silences filled by the listening rule, a minute | 0 … 0.03 … 0.20 |
| five or more held at once | under 1 % of the time |
| a pitch begun while its line still holds it | never |

Before the listening rule the longest silences were 7.3 … 11.6 … 20.7 s (one of 15–20 s about once an
hour).

**As it sounds** (`render-orchestra.ts --piece seeds --played --stems --wav`, then `seeds-check.ts`: every
note read in its own player's stem). Three ten-minute renders of two seeds, six fields between them:

* every blown or bowed note is at its pitch: its fundamental there, never the octave under it; within 9
  cents of equal temperament (the worst: the bass's A2, 9 cents flat; the violin's B5, 8 sharp);
* every note is there within 0.6 s (the slowest: the flute's D5, 0.52 s to come within 12 dB of its level
  under its swell; the bass, 0.2–0.4 s);
* the ten are in balance by their expression, which the piece carries itself (`seeds.ts` `top`): each
  player's loudness as it reaches the bus is within 5 LU of the others' (−24.1 … −29.2 LUFS at the piece's
  gain). Notes that stood out of line with their neighbours at this dynamic are eased note by note
  (`even`: the viola's G4 was 8 dB over its F♯4, the bass's D2 13 dB under its B1, the violin's D6 7 dB
  over its A5, the clarinet's A4 4–7 dB over its G4);
* the piano is kept at A5 and under: at these velocities its D6, E6 and G6 were 10–20 dB under its middle;
* the double bass is kept off F♯2 (9 dB under its B1 and slow).

**Its level** (`levels-pieces.ts`, the first five minutes of `kelumo` as the page plays it): −21.5 LUFS at
a gain of 19.5 dB on the bus (it is played between pianissimo and mezzo-piano: −40.8 LUFS without), the
piano 3 dB up; its peak as it reaches the bus limiter −3.1 dBFS (the limiter begins at −2), so the limiter
does not work. Twenty minutes of another seed (`tavide`) at the same gain: −21.4 LUFS, the peak −4.5 dBFS,
the limiter still. The table
(`artifacts/round3/rebalance/levels.json`) has its row; the other pieces stand at −21.4 … −19.6.

**Left playing** (`scripts/seeds-soak.mjs`: headless Chrome on this Mac, the built page, 3D, 13 minutes of
`kelumo`, read every 30 s):

| | |
|---|---|
| the piece's position against the wall clock | moved 10 ms in 12.5 minutes (−183 … −173 ms; the offset is the start's: the scheduling lead and the output's latency) |
| the sound's clock against the wall clock | moved 9 ms (no block was late enough to slow it) |
| events the player holds | 1 938 … 2 733, no trend (−8 a minute over the last two thirds) |
| the page's JS heap, after a forced collection | 768 … 797 MB, no trend (−0.6 MB a minute); the 3D stage's own |
| keys down at a reading | 0–5; none left down after stop |
| the engines' own load reports | the heaviest 5–23 % of a block's time, the ten together 23–46 % |
| page errors | 0 |

An hour of it on the player's own bookkeeping, with no sound (`seeds.test.ts`): every event sent once, in
order; every note told ahead has its end in the list; the list never over 6 000 events.

Offline the ten engines cost 23 % of one core (the piano 7 %, the others 1.2–2.7 % each).

## What was not done, and what I am not sure of

* Nobody has heard it. "Players in a room, never a sequencer" was built in (no pulse, no two entries
  alike, swells, breath and bow lengths, silence) and each part of it is tested as a property of the score;
  whether it is felt is for a listener.
* The balance is measured on two seeds. A seed whose flute sits low or whose horn sits at D3 lands a few
  dB from the others (the horn's low notes are eased by 6 dB for that).
* A clarinet note read 6 dB apart between two renders of the same pitch and strength (its G4: −48 and −54
  dB): the reed model's two regimes at a soft dynamic. It is on pitch in both.
* The piece's gain is large (19.5 dB) because it is played softly; a stretch where the piano's loudest
  strokes meet could reach the bus limiter (1.1 dB to spare on one seed, 2.5 on another). In 25 minutes
measured it did not.
* Reorganised by hand (a line moved to another instrument), the balance is no longer the piece's: the
  expression belongs to the line, the piano's 3 dB to its seat.
* On Safari the word is the same music in structure; a sine or two may differ in its last digit from
  Chrome's (the decisions are whole-number arithmetic, the wander is not).

## Tools

* `npx tsx scripts/seeds-survey.ts [--seed <word> | --seeds 40] [--minutes 30] [--score 120]`: the score
  with no sound.
* `npx tsx scripts/render-orchestra.ts --piece seeds --seed <word> --played --stems --wav --seconds 600
  [--start 0] --out <dir>`, then `npx tsx scripts/seeds-check.ts --dir <dir> [--notes]`: every note as it
  sounds. (`render-orchestra.ts` and `levels-pieces.ts` now read a piece with no file.)
* `npx tsx scripts/levels-pieces.ts render --tag <t> --only seeds`, then `measure --tag <t> --only seeds
  [--json …] [--wav <dir> --from 0 --seconds 128]`: its level, each player's place, an excerpt as played.
* `BASE=<url> node scripts/seeds-soak.mjs --minutes 12 [--view 3d]`: left playing in a browser.

`seeds-kelumo-opening.mp3` here is the first two minutes of `/seeds?seed=kelumo` as the page plays it
(offline render: the piece's gain, the piano's trim, the bus limiter's model).
