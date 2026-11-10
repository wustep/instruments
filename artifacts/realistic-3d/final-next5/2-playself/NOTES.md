# NEXT5 item 2: the app plays itself

Brief: `.autopilot/briefs/NEXT5-2-PLAYSELF.md`. Before this, the MIDI player appeared only after a
`.mid` was dropped on the page. Phones cannot drop a file, so a first visitor heard nothing until
they played something themselves.

## What changed

**The existing top-middle overlay is always there now.** No new control was added elsewhere. With
nothing loaded, the overlay shows two icons:

| icon | does |
|---|---|
| ▶ play | plays **the instrument's own short piece** on the instrument shown. In an ensemble it plays **the built-in Orchestra piece nearest the lineup** (the quartet gets Haydn). Its tooltip names the piece, e.g. `play · Chopin, Prelude in C minor, Op. 28 No. 20`. |
| folder | opens the **device's file picker** for a MIDI file (`accept=".mid,.midi,.kar,.smf,audio/midi,…"`). This gives phones the way in that drag-and-drop gives desktops. Dropping a file still works. |

Once a piece is loaded, the overlay works as before: play/pause, stop, the progress hairline, routing
(for files only), and the folder at the end.

- **Switching instruments while a piece plays** plays the new instrument's piece. You can tap through
  the picker and hear each instrument. If the piece was paused or stopped, the overlay just returns to
  rest. A dropped or opened file is never replaced this way.
- **Stop**, or a piece ending on its own, returns the overlay to rest. A file stays loaded and rewinds,
  as before.
- **Turning on the ensemble while an instrument's piece plays** returns the overlay to rest. The
  instrument's piece is not shared out over the lineup the way a file is. The play icon then plays the
  ensemble's piece.
- **One pieces UI.** The pieces menu (the score icon) is unchanged and still lists the three ensemble
  pieces. The per-instrument pieces are not a menu; the play icon is their only control. Both kinds
  live in one catalogue, `orchestra/pieces.ts` (`PIECES` and `DEMOS`). The trumpet's piece reuses the
  ensemble's Réjouissance file and plays only its trumpet line.
- **No new text on the stage.** The overlay contains no words (an e2e test checks `innerText === ''`).
  Icons have `data-tip` and `aria-label`. The progress hairline still has no tooltip (existing e2e
  test).
- **Phone targets.** Overlay icons are 36 px under `pointer: coarse`; they were 28 px. Desktop is
  unchanged.
- **Credits** are on the notes page, under "Each instrument's own piece", next to the ensemble's
  pieces.

## The pieces (all public domain, Mutopia Project, files unchanged)

| instrument | piece | file (sha256 in `pieces.ts`) | length | what is set beside the file |
|---|---|---|---|---|
| piano | Chopin, Prelude in C minor, Op. 28 No. 20 ([Mutopia 472](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=472)), typeset by Magnus Lewis-Smith from the Peters edition | `chopin-op28-20.mid` | 74 s | nothing (the file's ♩ = 42 and its pedalling) |
| violin | Anon., *Greensleeves to a Ground*, Playford's *The Division Violin* (1705) ([Mutopia 1730](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1730)), typeset by Allen Garvin | `greensleeves-division-violin.mid` | 36 s | stops after the tune and its first division (of 14), on G. Velocity ×0.65, because the file plays every note at 127. |
| viola | Bach, Cello Suite No. 1, Menuet I, in the edition's own viola transposition, an octave up ([Mutopia 517](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=517)), typeset by Andreas Scherer from the Schirmer edition (1916) | `bach-bwv1007-menuet-viola.mid` | 36 s | nothing |
| cello | Bach, Cello Suite No. 1, Prélude (same Mutopia entry, 517) | `bach-bwv1007-prelude.mid` | 126 s | nothing (the file's ♩ = 80) |
| flute | Bach, Partita in A minor BWV 1013, Bourrée anglaise ([Mutopia 1528](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1528)), typeset by Jacob Shapiro from the manuscript (via IMSLP) | `bach-bwv1013-bourree.mid` | 88 s | tempo ×1.6 (♩ = 96). The file has no tempo mark, so it plays at LilyPond's default of ♩ = 60. |
| trumpet | Handel, *La Réjouissance*: the trumpet's line alone ([Mutopia 1864](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1864)), typeset by Cyprien Lecourt | `handel-hwv351-rejouissance.mid` (already shipped) | 46 s | its line only, a tone down to concert pitch (as the ensemble piece does), starting at its first note (the organ's two-bar introduction is left out) |

How the licences were checked: each piece-info page says "Copyright: Public Domain". The BWV 1007
LilyPond header says "Placed in the Public Domain by the typesetter", and its `moreinfo` field
documents the viola transposition. The compositions are long out of copyright.

Not chosen: Paganini's Caprice 24 (CC BY-SA 4.0, and rough going for a bowed model); Bach's *Bist du
bei mir* for trumpet (every note at 127, a song without its bass); C. P. E. Bach and Quantz for flute
(CC BY-SA). Debussy's *Syrinx* is not on Mutopia.

`demoSong()` (pieces.ts, unit-tested) applies the corrections: the lines kept (renumbered), the start
moved to the first note, tempo, transposition, velocity, and an end point. Notes begun before the end
play out, and a pedal still down is lifted with the last note. Each piece fetches once and is cached.

## Numbers

Offline, each piece through its own engine core as the player schedules it
(`npx tsx scripts/render-playself.ts`; MP3s and `levels.json` in `audio/`):

| instrument | notes | out of range | most at once | peak dBFS | loudest second dBFS | CPU, % of real time (offline) |
|---|---|---|---|---|---|---|
| piano | 286 | 0 | 7 | −2.5 | −18.2 | 21.8 |
| violin | 78 | 0 | 1 | −7.5 | −14.7 | 2.1 |
| viola | 134 | 0 | 3 | −6.3 | −19.5 | 2.1 |
| cello | 656 | 0 | 3 | −4.7 | −16.0 | 2.6 |
| flute | 412 | 0 | 1 | −1.0 | −13.8 | 1.3 |
| trumpet | 150 | 0 | 1 | −1.0 | −11.2 | 1.2 |

The level differences between instruments are the instruments' own. Nothing is normalized; each
piece plays as loud as the instrument does when played by hand.

## Tests

- Unit (`apps/web/test/pieces.test.ts`, +3 tests):
  - every instrument has a piece, each file matches its sha256, public domain, 30–130 s, starts at
    once, every note in the instrument's range, the winds one note at a time;
  - `demoSong` on a synthetic file (lines, start, tempo, transposition, velocity, end, the lifted
    pedal; no corrections leaves the file as it is);
  - `pieceForLineup`.
- e2e (`e2e/app.spec.ts`, desktop and Pixel 7):
  - at rest the overlay is play and open, wordless, top middle, clear of the picker; play plays the
    piano's piece; changing to the cello plays the cello's; stop returns it to rest;
  - the folder opens a file chooser (`page.waitForEvent('filechooser')`), and the chosen file plays,
    on the phone too;
  - in an ensemble, the play icon plays Haydn, and an instrument's piece gives way to the ensemble;
  - the tooltip test covers the two new icons.
- Full runs on the branch rebased onto `0251a98` (PR #14, vector lines): `pnpm typecheck` clean;
  `pnpm test` 30 files, 162 tests passed; Playwright (desktop and Pixel 7) 81 passed, 9 skipped (the
  existing desktop-only and phone-only skips), 0 failed.
- Before the rebase, one full Playwright run had one failure: "the bow in the hand", violin 2D,
  "it sounds". The drag starts on the canvas about 240 px below the overlay, and
  `elementFromPoint` there is the canvas, so the overlay is not in its way. The test then passed 3/3
  in isolation and in the post-rebase full run, so it is a timing flake, not this change.

## Screenshots

- `before-after-{desktop,phone}-{2d,3d}.jpg`: the stage at rest, before (main `87fd4de`) on the left
  and after on the right. The only difference is the two-icon overlay.
- `{desktop,phone}-2d-{piano,cello,flute}-playing.jpg`, `*-3d-cello-playing.jpg`: one tap on play.
- `{desktop,phone}-2d-ensemble-playing.jpg`: the quartet's play icon playing Haydn.
- `{desktop,phone}-2d-vector-{rest,cello-playing}.jpg`: the same overlay in the vector-lines style
  from PR #14, which landed during this work. The overlay takes that style's frame from `vector.css`.
- Reproduce: `OUT=… TAG=before|after BASE=http://localhost:<port> node scripts/shots-playself.mjs`.

## Riders

- **Page description** left as is ("A physically modelled acoustic piano in the browser…"). It is
  incomplete (there are six instruments) but not untrue, and this PR does not change what the site
  is. A one-line update can come with a share image if wanted.
- **No share image** made.

## Left open

- **I have not heard these.** Levels, ranges and polyphony are measured. Whether each piece sounds
  good on its model is for a listener: the MP3s are in `audio/`.
- The cello's Prélude is the longest piece at 2 min 6 s. Its first half ends on a dominant-seventh
  pedal, not a cadence, so there is no clean place to stop early. The Menuet or the Gigue (36 s,
  51 s) are the short alternatives in the same file set.
- **Not tried on a real phone.** The iOS and Android pickers were not exercised with
  `accept=".mid,…,audio/midi"`. Some Android file providers label `.mid` as
  `application/octet-stream`, which could grey the file out. If that happens, drop `accept`; a
  non-MIDI file is rejected after reading anyway.
- On a phone in portrait, the overlay sits just over the top of the cello's scroll in 2D. That was
  already true while a file played; now it is true at rest too. It is the same top-middle place the
  brief asks for.
- The pieces menu still says "Pieces for the ensemble" and lists only the three ensemble pieces. It
  was left alone so there is one way to start each kind of piece.
