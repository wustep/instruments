# Orchestra UI for a large lineup: sections, room by the audio budget, a tap on the stage

Symphony phase, item (3). Engine: **Claude Opus 5.5**. No audio change (no engine file touched; the golden and
block-size tests are unchanged). No new path, no new address parameter: `vercel.json` is unchanged.

The brief: make it much easier to organise a large lineup (adding, removing and duplicating instruments, routing
tracks to instruments, grouping sections), with Beethoven's Fifth (18 seats) as the size to handle, on a computer
and a phone, keeping the UI minimal (no new stage text, no new panels) and the existing player and picker language.

## What was wrong at 18 seats (measured on `main` 46e4350)

* **Nothing could be added by hand.** The hand cap was a count: 8 seats on a computer, 6 on a phone. The preset
  seats 18 through the cost budget (`fitLineup`), so in the routing grid the "+" was disabled, and the line chips'
  menus refused any voice that needed a seat of its own.
* **A picker tap wrecked the routing.** With 18 seats (over the count cap), a tap on any instrument the stage had
  took all of that kind off. A tap on one it did not have did nothing. With the file loaded, the remaining
  lineup was then re-matched by register (`setLineup` → `matchLineup`). Taking the timpani off moved **10 of the
  11 other staves** onto other instruments: the oboes' staff onto a violin, the horns' onto a viola, the
  violin I staff onto a trumpet. Trumpets off: 9 moved. Violins off: 9 moved. (A one-off vitest probe of
  `autoPlan(lines, { lineup })` against the preset's routing.)
* **The grid was 18 rows.** Each row was one seat, as a glyph and a number. On a phone the grid was 366 × 522 px
  and covered the stage. The two flutes on the flutes' staff were two rows with identical dots.
* **The play icon threw the lineup away.** Pressing play at rest loaded the fitting piece *with its own lineup*.
  So any change made to the seated preset (a desk added, a seat taken off, a line given) was undone by play.
  The Daylight quintet's own address lost its double bass this way: Haydn's quartet replaced it.
* **No duplicate.** Another instrument arrived silent. Doubling a part meant adding a seat, then setting each of
  its cells to match.

## What changed

* **Sections** (`orchestra/sections.ts`, pure). A section is neighbouring seats of one instrument that play the
  same lines, one seat per desk. A seat waiting for a line is a section of its own.
  * The symphony's 18 seats are **12 sections**, one per staff (`flute 1–2`, `violin 1`, `violin 2`, …).
  * With no file loaded, the sections come from the address's routing, so the seated preset groups the same way.
  * A section is changed as one: its instrument, its lines, **another desk**, one desk fewer, or off the stage.
  * Another desk is a seat like the section's last, beside it, on the same lines. It is a player of its own
    (`playersOf`: own vibrato and intonation). A third flute on the flutes' two-voice staff doubles the first
    flute (`deskOf`).
* **Room is the audio thread's** (`assign.ts` `fitsStage`, `mayBecome`). This is the room pieces and addresses
  already had (`fitLineup`), now applied to hand changes too.
  * The limit is eight of anything, then more as far as the lineup costs no more than two pianos and six of the
    heaviest others: **51.4 %** on a computer and **45.6 %** on a phone.
  * There are never more than 24 seats, the most an address is read for.
  * A change that seats no more and costs no more is always allowed.
  * Because hand changes and addresses share one rule, what is built by hand reopens from its address seat for
    seat. The symphony costs 28.7 %, so it still takes a trombone, more string desks, or one piano (44.7 %, on
    both). A second piano fits on neither.
* **The routing grid by section** (`ui/player.ts`).
  * One row per section. The glyph carries a `×2` badge, in the picker's language.
  * A hairline separates the families (woodwinds, brass, percussion, strings, keyboards).
  * A cell routes every desk of the section alike.
  * The corner button switches to **desk by desk** (one row per seat, as before) whenever a section has more
    than one desk.
  * A row's glyph opens the section's menu.
  * Symphony grid: **18 → 12 rows**. Phone: 366 × 522 → 366 × 387 px. Desktop: 387 × 387 px. It is all on
    screen with nothing scrolled, and the keys stay visible on the phone.
* **Tap an instrument on the stage** (2D, vector lines and 3D; `stage3d.seatAt` projects each seat's column).
  * It opens that section's menu where it was tapped. The menu holds the instruments, then (with a file
    loaded) the file's lines numbered as the grid's columns, lit where the section plays, then ＋ (another desk),
    − (one fewer) and ✕ (off).
  * The menu stays open while desks and lines change.
  * There are no words on the stage. The menu is glyphs and numbers, with tooltips and accessible names.
  * A drag still turns the 3D stage. Only a tap (≤ 6 px of movement) opens the menu.
* **The picker keeps every other seat's routing** (`ensemble.addVoice` / `removeSeats`).
  * A tap adds one. Past the most, or with no room, a tap takes that kind off. Its tooltip now says which it
    will do ("violin ×3 · tap to take them off").
  * A second of a kind joins its last section as a desk.
  * A kind added back takes back the lines it left silent. For example: the timpani off, then on again,
    staff seven back on the timpani.
  * New instruments sit in the score's order (a trombone after the trumpets).
* **Play at rest plays on the lineup as it stands** (`ensemble.planOnStage`).
  * The fitting piece is routed by the lineup's rules, and the piece's own corrections are kept (II's horns
    an octave down).
  * The pieces menu still brings a piece's own lineup.
  * The preset plays exactly as before: the same 18 seats, the same routing, and the piece id
    `beethoven5-i`.
* **The fallboard's keys row is by section too.** A chip chooses all of a section's desks together. It is half
  lit (`aria-pressed="mixed"`) when only some desks play, as by default, when only the first flute plays.
* **On a phone, the line chips are 28 px**, so the symphony's 12 fit one row.

## How many steps (symphony preset, seated)

| To | Before (main) | After |
|---|---|---|
| Add a trombone | impossible (cap 8) | 1 tap (picker) |
| A second cello desk on the cellos' staff | impossible | 2 taps (the cello on the stage, ＋) |
| Take the timpani off | 1 picker tap, but with the file loaded 10 other staves re-matched | 2 taps (the timpani, ✕), routing kept |
| Give the trombone the bass's staff | impossible to seat it | 2 taps (the trombone on the stage, 12) |
| Keep these changes and play | play replaced the lineup with the piece's | play keeps them |
| See the routing on a phone | 18 rows, 522 px | 12 rows, 387 px |

## The addresses

* **The format** is unchanged (`v=1`). Sections are not written: they are worked out from the seats and lines.
* **The Beethoven 5 preset** reads as before: 18 seats in 12 sections, and the same routing (unit test and e2e).
* **The Daylight quintet preset** reads as before: 5 seats, each its own section (e2e).
* **Changes made with no file loaded** are carried in the address's rules, seat by seat (`rulesThrough`).
  * A desk added plays its section's staff (`eleven~42:17.18`).
  * A seat taken off leaves its staff silent (`seven~47:-`). Before, the staff was dropped and went by register.
  * Every later seat moves along.
  * Reopening the address gives the same orchestra.

## Tests

* **Unit.** `apps/web/test/sections.test.ts` (13 tests), covering:
  * room by budget, and seat placement;
  * the symphony's 12 sections, by plan and by address;
  * adding and removing desks, voice and line changes;
  * rules through seat changes, with an address round trip;
  * the presets;
  * keys by section.

  `assign.test.ts`'s two count-cap tests were rewritten for the budget.
* **e2e.** `e2e/orchestra-ui.spec.ts`, 3 tests × desktop and Pixel 7:
  1. The symphony grid: 12 rows on screen, a section's line, a desk added and removed, the timpani off, desk by
     desk.
  2. A stage tap in 2D, vector and 3D opens the section's menu. A desk and a trombone survive a reload and Play.
     The trombone is given a staff from the stage.
  3. The picker: a violin desk, all violins off, then one back with both staves restored. Keys by section.
     Both presets.

  `app.spec`'s many-to-many test was updated: a third piano is refused, a flute still fits on a computer, and
  two grands on every line are one section.

## Pictures

Before = production (`main` 46e4350, this branch's base), after = this branch. Each pair is shown side by side,
before on the left. All pictures are 2D unless named 3D.

| | Desktop 1440 × 900 | Phone 390 × 844 |
|---|---|---|
| Symphony preset, seated | `before-after-symphony-desktop-1-seated.jpg` | `before-after-symphony-phone-1-seated.jpg` |
| Symphony, file loaded, routing open | `before-after-symphony-desktop-2-routing.jpg` | `before-after-symphony-phone-2-routing.jpg` |
| Quintet preset, seated | `before-after-quintet-desktop-1-seated.jpg` | `before-after-quintet-phone-1-seated.jpg` |
| Quintet, play, routing open | `before-after-quintet-desktop-2-routing.jpg` | `before-after-quintet-phone-2-routing.jpg` |
| The cello tapped on the stage | `after-symphony-desktop-3-seat.jpg`, `after-symphony-desktop-3d-seat.jpg` (3D) | `after-symphony-phone-3-seat.jpg` |
| The quintet's cello tapped | `after-quintet-desktop-3-seat.jpg` | `after-quintet-phone-3-seat.jpg` |

Grid sizes measured by the script (CSS px, `pl-grid`):

| | Desktop before | Desktop after | Phone before | Phone after |
|---|---|---|---|---|
| Symphony | 18 rows, 384 × 522 | 12 rows, 387 × 387 | 18 rows, 366 × 522 | 12 rows, 366 × 387 |
| Quintet | 4 rows, 176 × 158 (play had dropped the bass) | 5 rows, 180 × 184 | the same | the same |

The quintet line shows the play-icon fix on the smaller preset too.

* **Before.** Pressing play on the Daylight quintet's address loaded the nearest piece (Haydn's quartet) with
  its own four seats. That took the double bass off the stage and rewrote the address as a quartet.
* **After.** The five seats stay. The bass waits with no line, since Haydn wrote none for it, and one tap gives
  it one.

Made with `scripts/shots-orch-ui.mjs` (BASE / TAG / OUT / ONLY / LOOK) and paired by `scripts/pair-shots.py`.

## Left for later

* **Seating** is the next PR. The 2D rows and the 3D arc are still the old ones: at 18 to 20 seats the 3D arc
  is crowded, and new seats go in score order rather than real orchestral places.
* **No mark on the stage for the section whose menu is open.** The menu sits at the tapped instrument instead.
* **The routing grid lives with a loaded file.** With only an address loaded, its routing is changed from the
  stage menus (desks, instruments, off), but its lines appear only once the file is loaded.
* **Real-phone audio load is still unmeasured.** The phone budget (45.6 %) is the one the presets already use.
