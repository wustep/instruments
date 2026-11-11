# Polish pass (before the launch)

Every view was looked at on a computer (1440×900), a narrow laptop (1100×700) and a phone (390×844 upright,
844×390 sideways), in 2D, vector lines and 3D, one instrument and the Orchestra; the copy was read against
what the code and the data say; the start-up, a change of piano and an orchestra's coming and going were
timed. Only what could be seen or measured was changed. Each picture here is the build before (production,
ed36a50) on the left and this one on the right (`scripts/shots-polish.mjs`, `scripts/shots-polish-pairs.py`).

## What was polished

### Performance

| | before | after | held by |
|---|---|---|---|
| An engine let go kept rendering for ever (a disconnected worklet node whose `process()` returns true): after an orchestra had come and gone twice, the audio thread was over its budget and the sound's clock ran at 0.245 of real time | 0.245× | over 0.9× | `e2e/engine-dispose.spec.ts`, `worklet.test.ts` “an engine disposed of stops rendering” |
| The upright's string designs were computed on the page at the first change to it (the grand's ship precomputed) | first grand → upright 1004 ms; `/piano/upright` start 706 ms | 17 ms; 61 ms | `e2e/piano-change.spec.ts` |

### Sound

The seven instrument faults the earlier rounds left: `../audio-audit-3/NOTES.md` (flute rises across a
register break, the viola's notes beside A♯4, the trumpet's joined low notes and the trombone's fast slurs
fixed; the violin's ring and the reeds' regimes measured and left, with why).

### Visual and UX (the phone, mostly)

| | before | after | picture |
|---|---|---|---|
| A phone, 2D and vector, a piece playing: the file player lay over the room's knob, and a tap on the knob opened the file picker | a tap in the knob's middle reaches `.pl-open` | the knob sits under the player; every tap on it reaches it | `phone-2d-playing-room-knob.jpg` |
| A phone, 2D and vector: the violin's, viola's and cello's scroll and the flute's crown were under the file player's buttons (16–36 px) | under the player | they stand in the box under it, as the bass and the reeds did | `phone-violin-2d-head.jpg`, `phone-cello-2d-head.jpg`, `phone-flute-2d-head.jpg` |
| The pieces menu on a short window (a phone held sideways): it ran past the window's bottom, the last two pieces out of reach | ends at 519 of 390 px | ends at 384, scrolls inside itself | `land-pieces-menu.jpg` |
| The pieces menu: thirteen instruments' glyphs ran 8–12 px past their row's end; the credit broke with “5.2” alone on a line | 12 px over | inside; one line | |
| A phone, vector lines: the symphony's thirteen lines wrapped to two rows (the style's 1 px border) | 2 rows | 1 row, as in 2D and 3D | `phone-symphony-vector-lines.jpg` |
| Measurements on a phone: two charts to a row, drawn at 0.29 of their size (figures 3 px high); the three-up charts 111 px wide | 0.29 | one chart to a row, the widest scrolling sideways in its own box at 0.64 | `phone-measurements-charts.jpg` |

All six are held by `e2e/polish.spec.ts` (each fails on the build before).

### Copy

- Notes: the instruments' table read from the shipped measurements (its numbers were three rounds old), with
  its header saying what the columns are; the pieces' licence said as it is (the oboe's is CC BY 3.0, not
  public domain); how many seats an orchestra takes; the knobs named as they are now (“room”, “lid”); what
  is still wrong said as measured in audit 3; twelve cited sources that were missing from the list.
- Measurements: the heading “Strings, woodwinds and brass against recordings” (it said strings and winds
  only); “four-fifths”; curly apostrophes throughout; every chart an `aria-label`.
- The stage: the orchestra button is named “Orchestra” where it read “Ensemble”; “add an oboe” (it was “a
  oboe”).
- README: the piano's two kinds (it listed four presets), which instruments are compared with recordings,
  the strings' numbers as they are measured now (they were round 2's), “four-fifths”.

### Fonts

None of the banned faces is used (Inter, Instrument Serif, Fraunces, Bricolage Grotesque, Space Grotesk,
Sora, Young Serif, Bodoni, Geist, Syne): the page's are Newsreader, IBM Plex Sans and IBM Plex Mono, and the
vector style's Hershey strokes. The check in `AGENTS.md` matched words like “Interval”; it now looks at
font declarations and packages only.

## Seen and left

- A phone in 3D: the room's knob lies on the oboe's and the clarinet's bell (its place on the floor falls
  there on a narrow stage). Moving it is a change to a rule with its own tests (`stage3d.roomKnob`).
- A phone held sideways: the stage is about 145 px high and the file player lies over the instruments. The
  framing rule is for a phone held upright; sideways needs a layout of its own.
- The bar's buttons move about 61 px when the lamp's hint (“tap a key”) goes at the first note.
- Before the sound starts the room's knob shows 0.3 for every instrument, then its own value (0.22 the
  piano, 0.35 the violin).
- The readout spells a note by its chord (G♯4 in F♯add9), the scope's caption by itself (A♭4).
- For the owner: the bundled oboe piece is CC BY 3.0 where `AGENTS.md` asks for public domain; sixteen
  `artifacts/audio/*.wav` are tracked on `main`, against the “no recordings committed” check (they are the
  engine's own renders, not reference recordings).
