# Beethoven, Symphony No. 5 (I and II): built-in pieces and an Orchestra preset

Symphony phase, item (1). Engine: **Claude Opus 5.5**. Both movements ship. Movements III and IV do not
(see "III and IV" below).

## The preset

```
https://instruments-wustep.vercel.app/orchestra?v=1&seats=flute,flute,oboe,oboe,clarinet,clarinet,bassoon,bassoon,horn,horn,trumpet,trumpet,timpani,violin,violin,viola,cello,bass&lines=one~73:1.2,two~68:3.4,three~71:5.6,four~70:7.8,five~69:9.10,six~69:11.12,seven~47:13,eight~40:14,nine~40:15,ten~41:16,eleven~42:17,twelve~43:18
```

* **Format.** The preset uses the same v=1 format as the Daylight quintet's address. No new path and no
  new parameter, so `vercel.json` is unchanged.
* **The seats.** Eighteen, in the score's order, which is also the picker's sort order: two each of
  flutes, oboes, clarinets, bassoons, horns and trumpets, then the timpani, two violins, viola, cello and
  double bass.
* **The routing.** Each of Mutopia's twelve staves is routed by its line name ("one" … "twelve") and its
  General MIDI program.
* **Opening it** seats the orchestra. Its play icon plays the first movement (`pieceForLineup`).
* **Loading either movement** from the pieces menu writes this same address back into the bar.
* **Dropping Mutopia's own `Symphony5_1.mid` or `Symphony5_2.mid`** on the preset routes it staff by staff
  exactly as the built-in piece does (unit test).

## The files (Mutopia, public domain, byte for byte)

| | Mutopia | Typesetting | File here | sha256 |
|---|---|---|---|---|
| I. Allegro con brio | [941](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=941), Mutopia-2017/11/05-941 | Stelios Samelis (adapted by Johannes Heinecke), from Breitkopf & Härtel (1862–1865); Public Domain | `public/pieces/beethoven-op67-i.mid` (`Symphony5_1.mid`) | `0ce1bca9…df52046` |
| II. Andante con moto | [1437](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1437), Mutopia-2017/12/08-1437 | same | `public/pieces/beethoven-op67-ii.mid` (`Symphony5_2.mid`) | `3f360acf…1d7bac` |

What the files actually contain, read from the MIDI and checked against Mutopia's LilyPond sources
(`Symphony5_{1,2}-lys.zip`, which were read and not kept):

* **Twelve tracks, one per staff.** The track names are LilyPond's staff names, "one:" … "twelve:".
* **The programs.** Flute 73, oboe 68, clarinet 71, bassoon 70, timpani 47, violins 40, viola 41,
  cello 42, contrabass 43.
* **Staves five and six.** Staff five is the horns (`cornies.ly`, "Corni in Es"). Staff six is the
  trumpets (`trombec.ly`: "Tb", its instrumentName copied as "Corni in Es." in I, "Trombe in C" in II).
  Both set `midiInstrument = "english horn"`, so both are **GM 69 with the instrument name "english
  horn"**. They are routed by line name ("five" → the horns, "six" → the trumpets): never to an English
  horn or oboe, and not by program 69. A unit test reorders the staves and they still find their seats.
* **Each wind staff holds its pair** (line poly 2). Chords are the two parts; a unison is written twice
  (`<< { c'''4 } \\ { c'''4 } >>`); a single note is one player's.
* **Pitch in I.** It sounds at concert pitch (`\transposition bes` for the clarinets, `\transposition
  ees` for the horns), so nothing moves.
* **Pitch in II.** Its horns in C have no `\transposition`, so the file gives them their written pitch,
  an octave above the sound of horns in C basso. The piece moves them down an octave (an explicit shift
  of −12, the same as the octave fit gives), so they sound C3–C5.
* **Dynamics.** I has no dynamics at all: every note is velocity 90, with no CC, because its score
  removes `Dynamic_performer`. The automatic expression (KTH phrasing) therefore shapes it, as for any
  flat file. II has velocities 37–127 and 756 CC7 changes, and plays as written (#26's machinery,
  unchanged).
* **Tempo.** Beethoven's own metronome marks are used: I at half note = 108 (the file has 96), II at
  eighth note = 92 (the file has 62). This is a `rate` beside the file, like the demos'; the file itself
  is untouched. I runs 4:41 without the exposition's repeat (the file has none), II runs 8:03.

## What changed

* **A staff that two players share is divided** (`midi-file.ts` `divide`, `assign.ts` `deskOf`).
  * **How each note gets its voice.** Notes a line begins together are dealt from the top down to the
    voices that are free. A voice whose note ends within 40 ms counts as free: that is a legato overlap,
    not a second part.
  * **Who plays which voice.** The k-th wind or brass instrument of one kind on a line of two or more
    voices plays voice k. More players than voices double in turn (four horns on a two-horn staff).
  * **What doesn't change.** A line of one voice is still played whole by every instrument on it, so
    hand-doubling a tune on two flutes behaves as before. Bowed strings, pianos and the timpani always
    take every note.
  * **Where it applies.** In the browser (`ensemble.schedule`) and in the offline renderer.
  * **In I**, the first flute plays 437 notes and the second 222. The first oboe plays 418 and the second
    251, the clarinets 494 and 380, the bassoons 523 and 379, the horns 320 and 151, and the trumpets
    232 and 210. Every note is played by exactly one of its pair (a unison by both), and every note-on
    has its note-off on the same player.
* **How many instruments a stage seats** (`assign.ts` `VOICE_COST`, `heaviestCost`, `fitLineup`).
  * **By hand**, the limit is unchanged: eight on a computer, six on a phone (`stageCap`).
  * **A piece or an address** may seat more, as long as its measured cost is no more than the heaviest
    lineup the count already allowed (two pianos plus the heaviest others).
  * **What uses it.** `enterOrchestra`, `setLineup` and `planFor(piece)`. Before, an address's seats
    were cut to eight; production seats the preset's first eight (all winds) on a computer and six on a
    phone.
  * **The address** reads up to 24 seats (it was 16).
* **The pieces menu.** A lineup of more than ten instruments shows each kind once, with a small ×2 count,
  so the row fits the 220 px menu. A title no longer wraps.
* **One tap is now a no-op.** On a full stage, tapping an instrument that isn't on it now does nothing.
  Before, it re-applied the same lineup, which re-matched a loaded file by register and lost the
  symphony's routing.
* **Notes page and README** describe the divided staves, the seating budget and the preset.

## The audio thread

`npx tsx scripts/stage-cost.ts` renders each engine core offline on one core of this M-series Mac,
playing its own piece and idle, and reports the busier of the two as a share of real time at 48 kHz:

| voice | playing | idle | `VOICE_COST` |
|---|---|---|---|
| grand (48 voices; 32: 15.8, 24: 15.4) | 15.68 | 3.25 | 16 |
| upright | 16.61 | 2.78 | 17 |
| violin / viola | 1.96 / 1.98 | 1.83 / 1.85 | 2 / 2 |
| cello / double bass | 2.53 / 2.90 | 1.99 / 2.29 | 2.6 / 2.9 |
| flute, oboe, clarinet, bassoon | 1.23–1.28 | 1.21–1.28 | 1.3 |
| horn, trumpet | 1.20, 1.15 | 1.18, 1.13 | 1.2 |
| trombone | 1.74 | 1.70 | 1.8 |
| timpani | 1.99 | 1.08 | 2 |

* **What the count already allowed.** Two uprights and six double basses on a computer cost 51.4; two
  uprights and four double basses on a phone cost 45.6.
* **The symphony's eighteen cost 28.3.** It therefore seats on both, inside what the stage already
  accepted.
* **Offline, all eighteen** take 28.2 % of real time on one core (`render-orchestra`, the first 45 s of
  I).
* **In Chrome**, the sum of the parts' own load meters while I plays is 24–29 % on desktop. The
  "phone" runs (390×844, touch) give 24–30 %; the audio thread is not throttled in those runs. On
  production the Brandenburg sextet (with a grand) measures 23–31 % the same way.
* **Not measured: a real phone.** Geekbench puts a Pixel 7's single core at about 0.55× an M1's, which
  would make it roughly 50 % there. The cap that phones already had allowed more than this.

## Pictures

Each picture is the preset opened, then 9 s into the first movement. Before is production at `d9360d3`;
after is this branch.

* `before-after-desktop-{2d,vector,3d}.jpg`: preset (top) and playing (bottom), before on the left.
  Before, the address seats the first eight seats only (both flutes, oboes, clarinets and bassoons). Its
  play icon then plays the Brandenburg on that piece's own sextet. After, all eighteen are seated and
  play the symphony.
* `before-after-phone-{preset,playing}.jpg` (390×844): 2D, vector and 3D, each before then after.
  Before, the phone seats six winds; after, all eighteen.

Seating is the next PR. Today the melodic instruments stand on one arc (two rows on a phone held upright)
with the timpani behind, as any lineup does.
* **Desktop 2D and vector** read well: the winds in a row above the timpani and strings.
* **3D** is crowded. The horns stand in front of the timpani at the arc's back; on a phone the
  instruments are small, though whole and clear of the player.
* **The proper fix** is the orchestral seating PR (strings in front, winds behind, brass and timpani at
  the back), which this one deliberately does not start.

## Audio (`audio/`, offline, the file as written, no automatic phrasing)

* `beethoven5-i.mp3`: the first 45 s of I on the eighteen, each pair divided. No wind is ever sent a
  chord. The second of each pair plays the lower voice, and the pairs' correlation is about 0.00, two
  players rather than one twice.
* `beethoven5-i-undivided.mp3`: the same with each staff sent whole to both of its players (`render-orchestra
  --undivided`), which is what happened before for anyone who routed two winds onto one staff. In 45 s
  each flute was sent 11 chords, each oboe 19, clarinet 17, bassoon 26, horn 14 and trumpet 15. A
  one-note instrument then plays the chord's last note: both players play the same note, so the
  harmony's second part is lost. The pairs' correlation is 0.02–0.12.
* `beethoven5-ii.mp3`: the first 60 s of II.
* `beethoven5-i-undivided-vs-divided-spectrogram.png`: bars 17–23 (9.0–12.5 s, up to 4 kHz), undivided
  on top. The chord counts above carry the evidence better than the picture does.
* `*.json`: each part's numbers.

## III and IV

These are not shipped. Mutopia lists only I and II (and a piano reduction). Project Gutenberg's eBook #156 has
four MIDI files, but the page labels it "Copyrighted", with "(C) 1994, 2001 Geof Pawlicki". It is
distributed under the Project Gutenberg License with "check the laws of your country"; that is neither
public domain nor a CC licence, so it is not bundled. The MIDI sites found (MidiShow and others) carry
uploader credits and no clear licence. Kunst der Fuge forbids redistribution. IV would also need a
piccolo, a contrabassoon and three trombones (the trombone exists; the other two do not).

## Tests

* `apps/web/test/beethoven5.test.ts` (20 tests):
  * the voice split on constructed lines and a constructed file;
  * `deskOf` (pairs, four horns, one-voice lines, strings, pianos, timpani);
  * the cost budget;
  * the shipped files' staves, names and programs;
  * each staff on its instruments, with every wind note played by exactly one of its pair;
  * the octave and tempo of each movement;
  * the play icon;
  * the preset: parsed, written back, written by both pieces, and Mutopia's files dropped on it
    (including in another order), on a phone too.
* `e2e/beethoven5.spec.ts` (desktop and Pixel 7):
  * the preset seats eighteen and its play icon plays I on eighteen engines;
  * the line chips show the staves on their instruments;
  * from bar 17, no wind engine is ever sent two notes at once, and the clarinets' chords are divided
    top and bottom;
  * the address stays the preset;
  * both movements are in the pieces menu, which fits on both devices, and II plays.
* Older tests adjusted: the pieces menu has six items (`app.spec`). The "pieces as before" guards in
  `assign.test.ts` and `horn-routing.test.ts` now account for the symphony: its second winds are second
  players, and its files came after the core-range check.

## Tools

* `scripts/stage-cost.ts`: the cost table above.
* `scripts/shots-beethoven5.mjs`: these pictures (`BASE`, `TAG`, `OUT`).
* `scripts/render-orchestra.ts`: now divides pairs, seats a large piece whole, and adds `--undivided`
  and `--start`.
