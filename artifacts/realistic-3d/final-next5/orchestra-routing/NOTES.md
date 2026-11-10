# Orchestra routing, many to many: notes

Branch `improve/orchestra-routing`, from `main` at `00afe3b`. Brief:
`.autopilot/briefs/NEXT5-ORCHESTRA-ROUTING.md` (with `STANDING-PREFS.md` and `ART-DIRECTION.md`).

## What it is

* **(a) Any line to any instrument.** As before, a line's chip moves it to another instrument and only
  to that one. The chip's menu now lights every instrument the line plays on. A chip on more than
  one shows a small `+1`.
* **(b) One line, or the whole file, on several instruments.** A grid button sits at the player's
  right. It opens the routing grid:
  * a row per instrument on the stage;
  * a column per line of the file;
  * a last column for every line at once.
  A dot puts a line on that instrument as well. The row under the grid adds an instrument. A row's
  glyph changes that instrument in its seat, or takes it off. A file playing on the one instrument
  shown uses the same button: the ensemble comes on with that instrument on every line, and the
  grid opens.
* **(c) The same instrument twice.** Another of a kind already on the stage is its own engine and its
  own seat. Two violins sharing one violin's meshes is how it already worked; now there can also be
  two grands, two uprights, or a third cello. The grid numbers them (`cello 1`, `cello 2`). The
  picker's piano button now counts to two pianos.
* **Auto-assignment is unchanged.** It runs by name, program and range. It never doubles a line, and
  shares a file over at most 6 instruments. The built-in pieces keep their own plans: same lineup,
  one route per line, every player 0. A unit test checks both.

## The cap

| | instruments on the stage | pianos' polyphony with two pianos |
|---|---|---|
| a file shared out by itself, a piece | 6 (as before) | — |
| picked or routed by hand, computer | 8 | 32 each (one piano: 48) |
| picked or routed by hand, phone (coarse pointer, screen < 820 px) | 6 | 24 each |

When the stage is full, the grid's add row and the menus' choices grey out ("the stage is full").

## Two of a kind on one line: a second player

Two engines of one instrument are deterministic. Fed the same line, they are one instrument twice as
loud, and the second engine is wasted. So a part that doubles a line already played by an earlier
part of the same voice gets the engine's new `player` option (assign.ts `playersOf`). A quartet's two
violins play two lines, so they stay player 0.

The `player` option (default 0, bit-identical) gives:

* **its own random stream.** This covers the bowed strings' vibrato phase, rate and wander and bow
  noise, the flute's breath noise, the trumpet's lip noise, and the piano's hammer noise. For the
  piano it also covers its unisons and hammer balance (`buildKeySpecs`). B and the dispersion
  designs' keys are unchanged, so the precomputed designs still serve it.
* **its own vibrato phase and rate** for the flute and trumpet: 0, then the golden angle apart, the
  rate ±4 %. Flute vibrato runs 4–6 Hz across players (Fletcher 1975).
* **its own intonation.** It is +4, −4, +8, −8 cents for players 1 to 4 (a constant bend under any
  bend). Players of one section in unison are 5–15 cents apart (Ternström 2003).

Measured with `scripts/render-orchestra.ts` (offline, 48 kHz, 30 s, bus included, before the
browser's −2 dBFS limiter). La Réjouissance was rendered on two trumpets (the tune) and two grands
(the organ's staves):

| | trumpets' correlation | grands' correlation | mix RMS | mix peak |
|---|---|---|---|---|
| the duo as shipped (trumpet + grand, bus 1/√2) | — | — | −15.6 dBFS | −0.2 dBFS |
| doubled, one player twice (no `player`) | 1.000 | 1.000 | −12.6 dBFS | +2.8 dBFS |
| **doubled, two players** | **−0.025** | **0.313** | **−15.2 dBFS** | +2.5 dBFS |

With two players, the doubled ensemble sums as power. At 1/√n it is as loud as the duo (+0.4 dB).
One player twice would be 3 dB louder. The peak is an attack, which the limiter catches.

Player 0 against `main`'s engine: max |Δ| = 0 for the grand, the upright, the violin, the viola, the
cello, the flute and the trumpet, over a passage with a bend. The golden test and the block-size test
pass.

Audio: `artifacts/round3/orchestra-players/`.

* `handel-doubled.mp3` is two players.
* `handel-doubled-one-player.mp3` is one player twice.
* `haydn-doubled.mp3` is the quartet with its tune also on a flute and a second cello on every line.
* `handel-doubled-spectrogram.png` is 6–9 s: one player twice at the top, two players below. The
  difference is fine beating, so the table carries the evidence.

## Cost

`ROUTED=1 node scripts/perf-orchestra.mjs` (Chrome on an M-series Mac; "phone" is 390×844 at 3× with
the main thread slowed 4×; the audio thread is not slowed):

| scene | view | 2D fps | 3D fps | 3D frame (ms) | 3D mirrors | audio thread (sum of part loads) |
|---|---|---|---|---|---|---|
| quartet + flute on the tune + 2nd cello on every line (6) | desktop | 60 | 60 | 0.99 | 0 | 13.5–16.7 % |
| the same | phone | 60 | 60 | 3.04 (lite) | 0 | 13.2–15.8 % |
| the same + 2 grands on every line (8) | desktop | 60 | 59 | 2.49 | 2 | 34.3–34.6 % |
| 2 trumpets + 2 grands (4) | desktop | 60 | 60 | 1.52 | 2 | 20.8–22.9 % |
| the same | phone | 60 | 60 | 3.82 (lite) | 0 | 22–22.6 % |

Offline, one core: the Brandenburg sextet takes 16.4 % of real time. The same with a second flute and
a second grand (8 instruments) takes 25.0 %.

## 3D and 2D

* **Two grands, two mirrors.** `Batch.mirror` became `Batch.mirrors`. The renderer draws up to two
  lid mirrors, one pass each: the first pass draws the shadow map and the second reuses it, and every
  mirror's surface is hidden in every pass. Phones (lite) draw none, as before.
* **Seating.** Two pianos stand 2.5 m apart. The players beside a piano now stand beside the right-hand
  one; before, a trumpet stood inside the second grand. A single piano's seating is unchanged.
* **2D.** The pianos share the bottom band, side by side, as they already could.

## Files here

* `before-after-{desktop,phone}-routing.jpg`: `main`'s one-instrument line menu, then the routing grid.
* `before-after-{desktop,phone}-{2d,3d}-haydn.jpg`: the quartet as it was, then the quartet with its
  tune on a flute as well and a second cello on every line.
* `before-after-{desktop,phone}-{2d,3d}-handel.jpg`: trumpet and grand, then two trumpets and two
  grands.
* `*-routing-doubled-after.jpg`: the grid after doubling.
* `*-line-menu-after.jpg`: a doubled line's chip menu, its three instruments lit.
* The single frames: `*-before.jpg` and `*-after.jpg`.
* Script: `scripts/shots-routing.mjs`. Before = `main` at `00afe3b`.

## Tests

* **Unit.**
  * `apps/web/test/assign.test.ts` (8 tests updated, 8 new): auto-assignment never doubles and the
    pieces are unchanged; one line on several instruments; the whole file on several; two cellos and
    two grands, with their players; the cap; changing or removing a seat; a chip move on a doubled
    line; a piece's correction kept on a second instrument.
  * `packages/engine/test/player.test.ts`: player 0 sample for sample; another player decorrelated
    and as loud; its intonation.
* **e2e** (`e2e/app.spec.ts`):
  * **many to many**, desktop and phone, 7 s. A tune on a flute and a violin, both sounding. A second
    cello on every line: its own engine, player 1. On a desktop, two grands: eight engines, eight
    frames, the bus at 1/√8, both lids mirrored in 3D, the stage full. Then a seat changed and one
    taken off. On a phone, the seventh is refused.
  * **a one-instrument file onto several from the routing button** (desktop).
  * The tooltip test covers the routing button.

## Left

* **Phone audio.** The audio-thread cost on a real phone is still not measured. On a phone, two pianos
  drop to 24 voices each and the stage holds six.
* **Mid-play changes.** A seat whose lines change lets go of what it holds. Without that, a note
  whose line moved away would never end. A line newly added to a seat starts at its next note.
* **Two grands on one line.** They decorrelate less than strings or winds (0.31). A piano has no
  vibrato, so its unisons, hammers and four cents of tuning have to do it.
