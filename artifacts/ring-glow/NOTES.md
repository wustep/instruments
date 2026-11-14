# The glockenspiel's and the timpani's ring glow in 3D

Visual only: no engine file is touched; the sound is bit-identical.

## Before

* **Glockenspiel**: each bar's glow was `0.12 + 0.9·√amp` at alpha up to 1 in `[1, 0.74, 0.36]`.
  That was the strongest tint left in the app: the shader's emission `rgb²·a·0.55` made a struck bar peach
  (+78 R, +43 G over the bar at rest: the table below). The √ held it high long after the ring had dropped. A floor of 0.12
  switched it off in one step when the level fell under 0.004.
* **Timpani**: a "shimmer" on loud strokes only, `lv²·exp(−t/0.35)`. Its clock was the stroke's age, not
  the drum's ring: every stroke faded in 0.35 s whatever the drum did, and a soft one lit nothing. It
  carried a 6 Hz flicker, and at alpha ≤ 0.13 on a near-white head it could not be seen at all.

## After (`apps/web/src/ui/gl/ring-glow.ts`)

* **One envelope for both**, read from the engine's own measure of the note: the glockenspiel's `amp`
  (0–1 of a hard stroke) and a drum's `level` (÷ `TIMPANI_HARD` = 12, near a fortissimo stroke's peak of
  20–25 in the core's units). The glow is `(1 + dB/36)²`, clamped to 0–1:
  * It lights on the stroke, because the engine's level is a peak held as it comes.
  * It fades as the ear hears the ring go, and is gone 36 dB under a hard stroke, with no step on the way.
  * The low G5 still glows at 0.23 three seconds after a hard stroke. The top bar's light is gone with its
    ring in about a second, and a bar the hand stops is dark within 0.25 s.
  * A soft stroke glows at about a seventh of a hard one.
  * A timpani roll keeps the head lit; a single stroke dies with the drum, over a second or two.
* **One light**: `[1, 0.78, 0.5]` at alpha ≤ 0.3. That is a third of the glockenspiel's old emission, and
  above the trumpet's pressed piston (`[1, 0.62, 0.34]` at 0.05).
* **The shader** (`mats3.ts`): the ring light is passed with a negative alpha, and a part lit so also
  takes the light's colour in what it reflects (`diffuse × mix(1, rgb, 0.6·|a|)`). A cream timpani head
  shows a warm cast where added light alone only clipped. Every other glow (alpha 0–1: the trumpet's
  pistons) is added light only, exactly as before.
* **Nothing is remembered per frame.** The engine smooths its level already, with a 50 ms fall, so a seat
  in the Orchestra glows exactly as the instrument does alone. The test poses the same frame both ways.
* The 6 Hz flicker is gone.

Measured on a patch of the low G5 bar after a stroke at velocity 110 (1440×900, the same view; the median
RGB over the bar at rest, which is (160, 168, 181)):

| | struck | 1 s | 3 s | 6 s |
|---|---|---|---|---|
| before | +78 R +43 G +8 B | +62 +35 +9 | +42 +23 +6 | +26 +14 +4 |
| after | +30 R +15 G −1 B | +18 +9 −1 | +8 +4 −1 | 0 |

A struck bar is now a pale warm grey, not peach (`compare-glock.jpg`).

## Pictures and checks

* `compare-glock.jpg`: top row before, bottom row after; at rest, struck, then 1 s and 3 s on.
* `compare-timpani.jpg`: before and after; at rest, struck, and two seconds into a roll.
* `node scripts/shots-ring-glow.mjs` (`BASE=… SET=before|after`) takes the pictures and prints each glow.
* `node scripts/clip-ring-glow.mjs` records the clip.
* `apps/web/test/ring-glow.test.ts` checks the envelope on the engine's own frames.
