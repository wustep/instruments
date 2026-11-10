# Orchestra mode: notes

Branch `improve/orchestra`, from `main` at `95bed0f`. Brief: `.autopilot/briefs/BRIEF-ORCHESTRA.md`
(with `STANDING-PREFS.md` and `ART-DIRECTION.md`).

## What it is

* **Several instruments.** A new picker button (four dots on an arc) turns the ensemble on. The
  instrument buttons then count instruments into the lineup: a tap adds one, a small `×2` shows
  doubles, and past the most it may have (3 violins, 2 of most others, 1 piano; 6 in all) an
  instrument drops out. Off again, the single instrument comes back as it was.
* **A MIDI file.** A dropped file whose lines want more than one instrument (or any file while the
  ensemble is on) is shared out. A line is one track's notes on one channel, so format 0 files
  split by channel. Each line gets an instrument from three clues:
  * its track name, which counts most (Italian, German, French and English names, abbreviations);
  * its instrument name, which counts less (notation programs often write a default);
  * its General MIDI program, which counts least.
  A clue counts only if that instrument can play the line as written: a "violin" track that goes
  below G3 is not a violin part. These clues are weighed against register fit. A part outside its
  instrument's range moves by whole octaves into it. Chords of four or more go to the piano. Piano
  lines share one piano.
* **Reassigning.** A row of glyphs under the player shows each line's instrument. It lights while
  that line sounds. A tap opens the seven instruments plus "silent". The menu greys out choices the
  stage has no room for.
* **Hand-picked lineups.** With a lineup picked by hand, a file's lines are matched to it by
  register: high to high, the busiest lines leading, in an order-preserving dynamic programme. Lines
  left over join the nearest instrument that can hold more than one note.
* **A full stage.** With more lines than the stage holds, bowed lines first form sections (double
  stops on one instrument). Then a piano takes bowed lines before winds. A trumpet or flute is never
  swallowed while strings remain.
* **Played by hand.** A chord is dealt out by register, one note to each melodic instrument (lowest
  to the cello, highest to the violin or flute). A piano takes the rest. Pedals, the mod wheel and
  pitch bend reach every part.
* **Pieces.** A page icon next to the ensemble button opens a small menu of three pieces. Each
  credit is one line ("public domain · Mutopia Project", linking to the notes page, which has the
  full credits).

## The pieces (verified)

Each piece is the Mutopia Project's own MIDI file, unchanged. Its sha256 is checked by a unit test.
Each piece-info page says **Copyright: Public Domain**: the typesetter placed it in the public domain
(creativecommons.org/licenses/publicdomain). The compositions are 18th-century.

| Piece | Lineup | Mutopia | Typesetter, edition |
|---|---|---|---|
| Haydn, String Quartet Op. 76 No. 3 "Emperor", II. Poco adagio, cantabile | violin, violin, viola, cello | [385](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=385) (`score-1.mid` of the set; checked by its opening, G A B A C B A F♯ G) | Maurizio Tomasi, Kalmus |
| Bach, Brandenburg Concerto No. 5, III. Allegro | flute, violin (solo), violin, viola, cello, grand (the harpsichord) | [548](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=548) | Joshua Koo, Bach-Gesellschaft |
| Handel, La Réjouissance (Royal Fireworks), trumpet and organ | trumpet, grand (the organ's two staves) | [1864](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1864) | Cyprien Lecourt, IMSLP |

Two corrections are made in the plan, not in the files:

* **Brandenburg No. 5.** The violone doubles the cello at the same written pitch, so it is left
  silent (one tap brings it back).
* **La Réjouissance.** The source writes a B♭ trumpet at written pitch (`\transpose d c`), a tone
  above the organ (`\transpose d bes,`). The trumpet line plays 2 semitones lower: concert pitch.

Rejected candidates:

* **Brandenburg No. 2.** Its trumpet is written with `\transposition f`, where it should be `f'`, so
  the MIDI sounds an octave low. The real part (up to about G6) is also above the engine's trumpet
  (top D6).
* **Pachelbel's Canon.** It is CC BY, not PD, and its lineup is close to the quartet.
* **Mozart K. 478.** It is fine. Its viola track, labelled "violin", became a test case for the
  register rule.

## How it is built

* **Audio** (`apps/web/src/orchestra/ensemble.ts`):
  * One `AudioWorkletNode` engine per instrument, on the page's one context. Engines are made with
    `waitReady: false`, so start-up never waits on a round trip.
  * They share a bus at 1/√n, then a limiter (−2 dBFS, 20:1, 2 ms), then the destination and the
    analyser.
  * The single instrument's engine is taken out of the graph while the ensemble plays. Idle, an
    engine costs as much as playing (2.7–3.8 % for the piano and strings): its reverb runs. It is
    taken out only after its first report, which is what says sound has started.
  * A lineup change keeps every engine whose instrument stays.
* **Routing.** `audio.route`: notes, pedals, controllers, params and file events go to the ensemble
  while it is active. The keys on screen still show the file's own notes.
* **Assignment** (`apps/web/src/orchestra/assign.ts`) is pure and unit-tested with line profiles from
  the real files.
* **2D** (`ui/ensemble-draw.ts`): one cell per instrument, each drawn by the single instrument's own
  drawing functions from its own engine's frames.
  * Pianos take a full-width band at the bottom.
  * The others share the grid that draws an instrument of about 2.8:1 largest. On a phone held
    upright that is one column.
  * The cells start under the file player.
  * Each part's mode field is coarser (96×54).
  * The bowed layers cache became a 6-entry map, so a violin, viola and cello side by side do not
    repaint each frame.
  * No room outline is drawn: it would cross the cells.
* **3D** (`gl/scenes3d.ts` `buildEnsemble`, `ensembleSeats`, `ensembleView`):
  * `Batch.world` places each instrument. It is premultiplied into the mesh matrices and applied to
    the line points, with no allocation.
  * Two violins share one violin's meshes, drawn twice, each seat with its own bow pose.
  * Seats run on an arc, first violin at the audience's left. Held instruments sit about where a
    seated player holds them. Each is turned to its single-instrument hero angle.
  * A piano sits behind, side-on, its lid open to the audience. One or two players stand beside it.
  * A phone held upright gets two rows.
  * The camera is fitted through the real lens: each seat's box is projected, the distance is
    searched, and the picture is centred.
* **Not offered in an ensemble:** the action close-up, the bow in the hand, the knobs, the case
  toggle and the lid grip. They are the single instrument's.

## Measurements

`scripts/perf-orchestra.mjs` (Chrome on an M-series Mac; "phone" = 390×844 at 3× with the main
thread slowed 4× by CDP; the audio thread is not slowed):

| piece | view | 2D fps | 3D fps | 3D frame (ms) | audio thread (sum of part loads) |
|---|---|---|---|---|---|
| quartet | desktop | 60 | 60 | 0.76 | 12–15 % |
| quartet | phone | 60 | 60 | 1.48 (lite) | 8–12 % |
| Brandenburg, 6 | desktop | 60 | 60 | 1.52 | 14 % |
| Brandenburg, 6 | phone | 60 | 60 | 3.24 (lite) | 12–14 % |
| trumpet + grand | desktop | 60 | 60 | 1.14 | 13 % |
| trumpet + grand | phone | 60 | 60 | 2.28 (lite) | 7–12 % |

The in-browser load meter is coarse: the worklet has only `Date.now()`. Offline, the same cores
take 7.9 % (quartet), 16 % (six with the grand) and 11 % (duo) of real time on one core.

Mix levels are from `scripts/render-orchestra.ts` (first 40 s, bus included, before the browser's
limiter):

* the quartet peaks at −10.4 dBFS (RMS −26.8);
* the sextet peaks at −7.2 dBFS;
* the duo peaks at −0.2 dBFS, so the limiter works there.

## Files here

* **Screenshots.** For each piece: `desktop-{2d,3d}-*-after.jpg` and `phone-{2d,3d}-*-after.jpg`.
  The menus: `*-menu-pieces.jpg` and `*-menu-line.jpg`.
* **Before/after.** `before-after-*.jpg` and `*-before.jpg`. "Before" is `main` at `95bed0f` with
  the quartet's file dropped on it: every line on the one violin.
* **Audio** (`audio/`). The first 40 s of each piece: `haydn.mp3`, `bach.mp3`, `handel.mp3`. Also
  `haydn-op76-3-ii-before-one-violin.mp3`: the same file on one violin, as before.
* **Scripts.** `scripts/shots-orchestra.mjs`, `scripts/look-orchestra.mjs`,
  `scripts/look-orchestra-ui.mjs`, `scripts/perf-orchestra.mjs` and
  `scripts/render-orchestra.ts`.

## Tests

* **Unit.** `apps/web/test/assign.test.ts` has 8 tests. `pieces.test.ts` has 3. `midi-file.test.ts`
  gains lines in format 0 and 1.
* **e2e** (`e2e/app.spec.ts`, under 3 s each):
  * a piece from the menu, in 2D and 3D, then the ensemble off;
  * a dropped trio, shared out, a line moved and a line silenced (desktop);
  * the ensemble picked by hand, a chord dealt out.
* **Tooltip test.** It now covers the two new buttons.

## Left

* **Phone audio.** The audio thread's cost on a real phone was not measured. The cap is six
  instruments everywhere. A worst case (six parts, piano included) is about 16 % of a desktop core,
  so a phone at 3× would sit near 50 %.
* **Seats.** There are no players. Held instruments float at a player's height, as the single
  instruments do at a display height.
* **Mid-play changes.** A reassigned line's new engine misses notes already held.
