# Orchestra, free-direction polish (Opus): notes

Branch `improve/orchestra-opus`, from `main` at `0522d1e`. Brief:
`.autopilot/briefs/NEXT5-ORCHESTRA-OPUS.md` (with `STANDING-PREFS.md` and `ART-DIRECTION.md`).

## What I chose, and why

I listened through the numbers first: the three pieces rendered offline (`scripts/render-orchestra.ts`),
each part's level and its place between the channels; then the stage in 2D and 3D, desktop and phone.

The biggest gap was the sound's layout, not its balance. Every instrument on the stage was heard from
one point, the middle. The 3D stage seats a quartet across 2.2 m and the Brandenburg sextet across
2.9 m with the piano behind, but every part's engine put its source in the same place in its room.
On `main` every part sits within 3.5 dB of the middle, and in no order. The first violin is no
further left than the cello (`stage-chart.png`, hollow rings).

On the way I found two bugs:

* **The room's taps could spike.** A delay gliding onto a whole sample from above read its sample
  7,684 times too loud. The engine's limiter then ducked the whole sound under each spike, every
  0.16 s. Seating set this off every time (a seated trumpet lost 9 dB instead of 5). `main`'s solo
  instruments did not hit it in the room changes I tried, but the same pattern was in four reads.
* **The grand's polished lid showed no strings.** The mirror pass's line draws were all refused by
  WebGL as a feedback loop: 183 console warnings in 3 s on a solo grand, 256 (Chrome's cap) with an
  ensemble.

I left alone what measured fine or wasn't mine to change. The parts' balance is each instrument's
level matched to its Iowa recording, and the bus is 1/√n. The pieces, the assignment and routing,
and the UI are also as they were.

## 1. Each instrument is heard from its seat

**Engine (`packages/engine/src/core/post.ts`, the `Room`).** The room already models a hall's early
reflections from image sources, picked up by a pair of cardioids 0.6 m apart at ±50°, 3.2 m from the
stage. It now takes a `seat` (x across, z upstage, metres from the single instrument's place).

* **The direct sound.** An instrument's output is its direct sound from the middle of the stage. From
  a seat, that sound reaches each microphone at its own time and level:
  * the path's length (1/r);
  * the cardioid's angle;
  * the far microphone a whole number of samples later (0.73 ms for a seat 1.75 m to the side).
* **The early reflections.** The image sources move with the seat.
* **The late field** stays: it is the hall's.
* **A seat change glides** over 80 ms, as a room change already does. The delays settle on whole
  samples, so nothing is left filtered.

Every core passes `params.seat` to its room.

* **Without a seat, nothing changes, sample for sample.** Max |Δ| = 0 against `main`, room and
  limiter on: grand, upright, violin, viola, cello, flute and trumpet. The golden and block-size tests
  pass.
* **The pieces' "before" is `main`.** `render-orchestra.ts --flat` renders each piece's 45 s byte for
  byte as `main`'s renderer does.

**App (`apps/web/src/orchestra/seats.ts`).** The 3D stage's seating moved here (`seatPlaces`). Over
six lineups at three aspects its matrices are the same as `main`'s (max |Δ| = 0).

* The ensemble gives each part's engine its seat. A lineup change moves the engines that stay, and
  they glide.
* The sound takes a computer's wide stage whatever the view. A phone held upright seats two rows in
  3D, but the sound does not move when the view changes.

**What it does** (`render-orchestra.ts --json`, first 45 s, before the browser's limiter;
`data/*.json`). R − L is the level difference between the channels, in dB. Negative is the left.

| piece | part (seat across) | R − L before | R − L after |
|---|---|---|---|
| Haydn quartet | first violin (−1.10 m) | +3.4 | **−0.9** |
| | second violin (−0.40 m) | +1.8 | +0.7 |
| | viola (+0.40 m) | −1.4 | −0.3 |
| | cello (+1.10 m) | +3.2 | **+7.6** |
| Brandenburg 5 | flute (−1.47 m, nearest the audience) | −1.1 | **−6.1** |
| | solo violin (−0.78 m) | +1.9 | −1.3 |
| | second violin (0) | +3.0 | +2.5 |
| | viola (+0.78 m) | −1.5 | +1.3 |
| | cello (+1.47 m) | +2.3 | **+8.5** |
| | grand (0, 1.55 m upstage) | +2.3 | +1.8 |
| Handel | trumpet (+1.75 m, beside the piano) | −0.9 | **+3.4** |
| | grand (0) | +1.6 | +1.5 |

How to read the table:

* Each bowed body has its own lean between the microphones: every body mode couples to each
  microphone with its own coefficient. From the middle the strings lean 2–3 dB to the right. The
  seats move each part from where its own lean puts it.
* The time difference adds to the level. The microphone nearer the seat hears the direct sound first:
  0.57 ms for the quartet's outer seats, 0.73 ms for the trumpet, 0.92 ms for the flute.
* Depth:
  * The Brandenburg's grand stands 1.55 m upstage. Its direct sound is 3.3 dB weaker against the
    same hall, so it sounds further away.
  * The flute stands 0.9 m nearer the audience, about 3 dB stronger.

The roll calls make it plainest: each player alone in turn, then all together
(`scripts/render-seats.ts`). R − L per turn, in dB (level only):

| | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| quartet, before | +2.1 | +2.0 | −0.8 | +3.0 | | |
| quartet, after | **−3.1** | +0.9 | 0.0 | **+7.5** | | |
| sextet, before | −0.3 | +2.1 | +2.6 | −1.5 | +3.1 | +3.9 |
| sextet, after | **−5.6** | −2.5 | +1.3 | +1.3 | **+10.0** | +3.6 |

The quartet's turns are first violin, second violin, viola, cello. The sextet's are flute, violin,
violin, viola, cello, grand.

The mix's channel correlation (`scripts/stage-image.ts`; lower is wider):

* Handel: 0.76 → 0.15.
* Brandenburg: 0.22 → −0.11.
* The quartet: −0.11 → −0.19. It was already decorrelated by the bodies' own stereo.

**What it costs.**

* **Mono.** A mono sum (one phone speaker) keeps the time differences as a comb. Handel's mono sum
  loses 2.4 dB, against 0.6 dB before, with a 9 dB dip in the 2 kHz third-octave: the trumpet's
  0.73 ms. In stereo (laptops, phones held upright, headphones) there is none. The bowed instruments
  already lost 3.5 dB in mono on `main`. `handel-mono-spectrogram.png` shows 4–7 s of the mono sum,
  before above and after below.
* **The audio thread.** Two interpolated taps a sample per part, next to the room's sixteen lines.
  Offline the quartet takes 8.3 → 8.5 % of real time and the sextet 17.5 → 18.0 %, within the
  run-to-run spread.
* **Loudness.** It moves with the seats: Haydn −0.3 dB, Brandenburg +1.8 dB, Handel left −3.7 dB.
  Peaks stay under the bus limiter's −2 dBFS except where they already reached it (Handel).

## 2. The room's taps

`core/post.ts`: when `w − d` is a hair below zero, `p += length` can round to exactly the length. The
index was wrapped to 0, but the fraction `p − i0` was then the whole length, and the interpolation
multiplied by about 7,684.

* **The fix.** The position itself wraps before it is split. It is fixed in the four reads that had
  the pattern: the reflections, the predelay, the late lines and the seat's own tap.
* **Bit-identity.** Only the case that read garbage changes, so a solo instrument stays bit-identical.
* **Measured.** A held 0.5 sine through a seated room peaked at 18–23 before and peaks under 0.8
  after.

## 3. The lid's mirror draws the strings

`ui/gl/three3d.ts`: the mirror pass drew the strings (lines) while sampling its own target's depth
texture. WebGL refuses every such draw.

* **The fix.** The pass's depth is copied to a float target first (`EXT_color_buffer_float`, which
  desktop browsers have). The lines test against the copy. Phones draw no mirror, as before.
* **Without the extension** the strings are left out of the lid: what every browser showed until now,
  minus the warnings.
* **Measured.** 0 refused draws, against 183 on `main` in 3 s on a solo grand. The 3D frame cost is
  one full-screen copy per mirror.

`before-after-lid-{grand,bach,handel}.jpg`: the lid twice its size, `main` above, this branch below.
The strings' reflection fans across the lid's underside. `before-after-desktop-3d-*.jpg` are the whole
frames.

## Files here

* `stage-chart.png`: where each part is heard, before (hollow) and after (filled).
* `audio/`:
  * `{haydn,bach,handel}-{before,after}.mp3`: the first 45 s. "Before" is `main`.
  * `roll-{quartet,sextet}-{before,after}.mp3`: the roll calls. Best on headphones.
* `handel-mono-spectrogram.png`: the mono sum's cost, as above.
* `before-after-lid-*.jpg`, `before-after-desktop-3d-*.jpg` and the single frames
  `desktop-3d-*-{before,after}.jpg`.
* `data/*.json`: each part's numbers, from `render-orchestra.ts --json`.
* Scripts:
  * `scripts/render-orchestra.ts` (`--flat`, `--json`);
  * `scripts/render-seats.ts`;
  * `scripts/stage-chart.mjs`;
  * `scripts/stage-image.ts`;
  * `scripts/shots-orchestra-opus.mjs`.

  Before was `main` at `0522d1e`, built and served beside this branch.

## Tests

* **`packages/engine/test/seat.test.ts`** (6):
  * no seat, a null seat and the middle are bit-identical;
  * left and right mirror each other (level > 3 dB, the far microphone 0.6–1.1 ms later);
  * the same place at 22.05, 44.1 and 96 kHz;
  * upstage is weaker by the path (−3.1 dB for 1.5 m);
  * a seat moved while playing glides;
  * the taps stay bounded (the sine case above).
* **`apps/web/test/seats.test.ts`** (4): a quartet's order and symmetry, the piano behind, the sound's
  stage whatever the view, two of a kind apart.
* **e2e:**
  * **"orchestra seats"** (desktop and phone) measures the worklet's own output: the first violin's
    note against the cello's. From the middle it is −3.75 dB, seated +3.89 dB offline, 4.1 dB live.
  * **The 3D piano test** now fails on any refused GPU draw. It saw 33 on `main`'s build and none here.

## Left

* **Mono.** The far microphone's delay combs a mono sum (above). Level-only seating would avoid that
  but needs about 15 dB between the channels to place a part fully to one side. I kept the room's own
  microphones, the ones its reflections already use.
* **A piano trio.** Two melodic players and a piano both stand beside the piano's curve, as a
  soloist does, so both are heard to the right. It reads as a recital, and the sound follows the
  picture. A trio seated around the piano would be the next seating change.
* **Phone audio.** The audio-thread cost on a real phone is still not measured. Seating adds about 1 %
  of one part's cost.
