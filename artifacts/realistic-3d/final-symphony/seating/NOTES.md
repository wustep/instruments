# The Orchestra seated as an orchestra (2D and 3D, a computer and a phone)

Symphony phase, item (4): real orchestral seating. Engine: **Claude Opus 5.5**. No engine file touched (the golden
and block-size tests are unchanged). No new path or address parameter: `vercel.json` is unchanged and the compact
address (`?v=1&seats=…&lines=…`) reads and writes exactly as before. The Beethoven 5 and Daylight quintet presets
open the same lineups and routing; only where the players sit (and so where each is heard from) changed.

## What was wrong (measured on `main` b827441)

* **Every player stood on one arc, in the lineup's order.** The address and the pieces list the lineup in score
  order (flutes … timpani, then the strings), so Beethoven's Fifth stood flutes at the audience's far left and the
  strings at the far right: the first violin at x = +3.0 m, the double bass at +6.0 m.
* **3D**: one 12 m arc of seventeen instruments, the timpani 1.45 m behind its middle, the horns in front of the
  drums (#40's note). On a phone held upright the arc split into two rows and everything was small: the eighteen
  stood in a band about 80 px tall on a 390 × 460 px stage.
* **2D**: the lineup's order in equal-ish lines: winds and brass in the top line, then timpani beside the strings.
* **The sound followed the arc**: the strings were heard from the far right and 6–10 dB under the woodwinds (the
  room's cardioid pair, 3 m out, saw them off-axis): violins −30.7/−30.3 dBFS RMS, flutes −21.5/−22.8.

## The plan (`orchestra/seats.ts`)

Up to four players (a quartet, a trio with a piano, a soloist at the piano) keep their arc, unchanged to the bit
(every chamber test is as it was). Five or more sit as an orchestra, the American (Stokowski) seating most
orchestras keep, with the Beethoven-era back row:

* **Strings in front**, round the podium: first violins at the audience's left, seconds, violas, cellos at the
  right. With more than one violin the first half are the firsts. A section's desks sit together, two abreast,
  the next pair behind them (a phone: one abreast when two would not fit). **Basses** stand behind the cellos'
  right edge, on the floor, clear of the woodwinds.
* **Woodwinds** behind the strings, centred, in two rows: flutes then oboes, and behind them clarinets then
  bassoons (the principals meeting in the middle); four or fewer share one row.
* **Brass** behind the woodwinds: horns at the left, trumpets, trombones at the right.
* **Timpani** at the back: past the brass row's left end, beyond the woodwinds (never behind or in front of
  another instrument). When that row would be too long (a phone) they get a row of their own behind the brass.
* **Risers**: every row behind the strings stands a step (18 cm) higher than the one in front, as a concert
  stage's risers do; so the back rows show over the front ones.
* **Keyboards** stand at the back on the left (where an orchestra's piano, celesta and harps go).
* **A phone held upright** (stage narrower than 1.1 : 1) gets shorter rows (≤ 4.3 m of arc, a computer's 9.6 m):
  more rows, a narrower and deeper plan, and a higher camera. The sound always takes the computer's plan.

The rows are arcs round one point (the podium), each row's seats spaced by what the player takes (a violin
0.8 m, a bass 1.1 m, a trombone 0.98 m with its slide, a timpani set 2.8 m), so nobody overlaps.

## 3D (`ui/gl/scenes3d.ts`, `stage3d.ts`)

* Each seat stands on its riser (`Place.y`, the seat's `c[1]`); a tap on a seat measures its column from its
  riser to its top (`seatAt`), so a back-row instrument is tapped where it is drawn.
* The risers are built once per shape: an arc of stage extruded to its height, a 2 cm chamfer on its top edge
  (`caseInner` stained wood top, `caseRaw` fascia).
* The camera: from the audience, higher over an orchestra (0.5 rad; a phone 0.66) so the rows behind show, every
  seat and riser fitted, and kept under the file player (it lies over the top middle, where the back row is).
  It aims at the podium when that costs < 3 % of the size, else at the plan's middle (the timpani hang left).
* Small groups keep their views as they were.

## 2D (`ui/ensemble-draw.ts`, both styles)

* The same plan's rows, front at the bottom: strings (basses at the right end), woodwinds, brass with the timpani
  past its left end. Every instrument at one scale (its true size), every bow clear of every other instrument.
* Each row comes down as far as the instruments in front allow (a bassoon or a timpani set over a violin, not
  over the bass beside it), so the rows nest as an orchestra seen from the hall does.
* Tried, and the one drawing the orchestra largest kept: the computer's plan and the phone's, the strings in one
  line or their last sections behind the first, the woodwinds in their two rows or one.
* The orchestra's middle (its strings) is kept in the stage's middle unless that would put the group off it.
* A stage too short for rows (a phone on its side, 844×190) keeps the old single line (no instrument under 24 px).

## Sound (no engine change)

Each part is still heard from its seat (the room's `seat`, `core/post.ts`), now the orchestra's. Beethoven 5 I,
first 30 s, offline (`scripts/render-orchestra.ts --piece beethoven5-i --seconds 30 --json`); before = `main`'s
seats. `audio/beethoven5-i-before.mp3`, `audio/beethoven5-i-after.mp3`, each part's numbers in the JSON.

| seat | part | before: seat (x, z) m | L−R dB | RMS dBFS | after: seat (x, z) m | L−R dB | RMS dBFS |
|---|---|---|---|---|---|---|---|
| 1 | flute | -6.00, -2.26 | +5.9 | -21.5 | -1.11, 1.01 | +1.9 | -20.2 |
| 2 | flute | -5.37, -1.76 | +6.5 | -22.8 | -0.31, 1.19 | -0.1 | -23.5 |
| 3 | oboe | -4.71, -1.31 | +8.0 | -26.1 | 0.46, 1.17 | +0.3 | -27.1 |
| 4 | oboe | -4.01, -0.93 | +9.5 | -22.1 | 1.16, 0.99 | -1.2 | -25.9 |
| 5 | clarinet | -3.27, -0.61 | +6.1 | -25.3 | -1.16, 2.12 | +1.6 | -28.4 |
| 6 | clarinet | -2.52, -0.36 | +6.4 | -28.3 | -0.43, 2.26 | -0.1 | -32.6 |
| 7 | bassoon | -1.74, -0.17 | +5.2 | -19.3 | 0.34, 2.27 | +0.9 | -24.6 |
| 8 | bassoon | -0.95, -0.05 | +4.9 | -22.5 | 1.13, 2.13 | -1.0 | -27.4 |
| 9 | horn | -0.15, -0.00 | +0.5 | -19.0 | -1.23, 3.42 | +0.5 | -21.0 |
| 10 | horn | 0.65, -0.02 | -3.1 | -21.8 | -0.36, 3.55 | -1.6 | -26.1 |
| 11 | trumpet | 1.44, -0.12 | -4.6 | -27.3 | 0.48, 3.54 | -0.3 | -26.8 |
| 12 | trumpet | 2.23, -0.28 | -5.1 | -34.5 | 1.27, 3.42 | -0.6 | -34.6 |
| 13 | timpani | 0.00, 1.45 | +0.4 | -42.9 | -2.93, 3.04 | +4.5 | -44.4 |
| 14 | violin | 2.99, -0.51 | -10.1 | -30.7 | -1.19, -0.37 | +2.3 | -21.5 |
| 15 | violin | 3.74, -0.80 | -10.9 | -30.3 | -0.47, -0.05 | +0.4 | -19.6 |
| 16 | viola | 4.45, -1.16 | -7.5 | -32.6 | 0.34, -0.03 | -0.4 | -23.8 |
| 17 | cello | 5.13, -1.58 | -11.0 | -34.7 | 1.14, -0.34 | -5.2 | -25.0 |
| 18 | bass | 6.00, -1.91 | -6.2 | -39.5 | 2.08, 0.26 | -4.5 | -36.2 |
| | **mix** | | | −24.2 | | | −24.1 |

* The first violins are now heard on the left (+2.3 dB L−R, was −10.1), the cellos and bass on the right, the
  woodwinds and brass near the middle, the timpani back-left.
* The strings come up 3–11 dB (in front, on the microphones' axis); the woodwinds and horns go down 1–5 dB
  (behind them); the mix's level is the same (−24.1 vs −24.2 dBFS RMS). An orchestra's balance, where before
  Beethoven's Fifth sounded wind-heavy with the strings far right.
* The image is narrower than the old arc's extremes: the plan is 6 m across, not 12. The room's depth is clamped
  as before (a seat more than ~2.6 m upstage stands at the hall's back wall), so the brass and timpani are not
  pushed further than the room allows.

## Tests

* `apps/web/test/seats.test.ts`: the chamber cases as before; Beethoven 5 and the same with three trombones, on a
  computer and a phone: strings in front (first violins left, cellos right, basses behind the cellos), woodwinds
  in two rows on risers, brass behind, the timpani at the back past the woodwinds (a phone: behind the brass),
  nobody on anybody; a phone's plan narrower and deeper; the sound on the wide plan; missing instruments (no
  strings, no woodwinds, a string quintet, basses alone); desks two abreast; a keyboard back-left; every raised
  seat on its riser and nobody on the floor under one; the 3D seats lifted with their risers.
* `apps/web/test/ensemble-cells.test.ts`: the orchestral lineups join every stage's invariants (one scale, every
  bow clear and on the stage, the group in the middle, filling the stage one way) and a row-order test.
* `bassoon3d` / `horn3d`: their "others' seats as they were" checks use four players (the arc), since five
  are an orchestra.
* `e2e/seating.spec.ts` (desktop and Pixel 7): Beethoven 5's preset and the 21-seat lineup in 2D, vector and 3D,
  read from where the stage draws each seat: woodwinds above the strings, brass above the woodwinds, first violin
  left of the cello, timpani at the back; every seat on the stage under the file player, none on another; no
  WebGL error; the timpani tapped in 3D open their section's menu.

## Pictures

`before-after-*.jpg` (before left: production, `main` b827441; after right), shot by `scripts/shots-seating.mjs`
on a computer (1440×900) and a phone (390×844), paired by `scripts/pair-shots.py`.
