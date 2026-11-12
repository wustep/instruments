# Toward Morning: the instrument that sounded mechanical is the trombone

Stephen heard the launch clip of `/symphony` (`01-symphony-v3.mp4`: bar 158 to the last chord, 206–262 s of
the piece) and said one instrument sounds too robotic. I cannot hear; this is the measured answer.

## Which one, and why

Every part was rendered alone as seated, as the player plays it (`scripts/render-orchestra.ts --played
--stems`), and read by `scripts/mechanical.ts` next to the recordings read the same way. In the clip:

| | trombone | the next most exposed |
|---|---|---|
| loudest part of the orchestra | **58 % of the time** | viola 17 %, bass 11 %, clarinet 5 % |
| under the mix | 6.7 dB | viola 7.7, bass 10.4, clarinet 10.8 |
| its notes' dynamics (90th over 10th percentile) | **2.8 dB** (every velocity 118–127) | clarinet 2.9, horn 4.0, viola 12.3 |
| a held note's pitch | **±0.1 ¢** (the recorded trombonist ±1.9) | horn ±0.2 (recorded ±2.1) |
| a held note's level | **±0.11 dB** (recorded ±0.30) | horn ±0.18 (recorded ±0.13) |

It carries the coda's chorale, 50 joined notes at one dynamic, 17 of them held over a second, each held
dead still: the stillest sound on the stage, and the one in front for more than half the clip.

## The ranking (most mechanical first, in the clip)

1. **Trombone**: the table above.
2. **Horn**: as still (18 held notes, ±0.2 ¢, ±0.18 dB), but 12 dB under the mix and loudest 1 % of the time.
3. **Clarinet**: 195 notes within 2.9 dB of each other and no movement in a held one; its runs and its level
   (10.8 dB under) hide it.
4. **Trumpet**: repeated notes begin much alike (0.79 correlated, spectra 3.8 dB apart), held ±0.6 ¢; 13 dB under.
5. **Oboe**: its repeats' beginnings are the most alike of the winds (0.93); 12.7 dB under, never in front.
6. **Bassoon**: held ±0.5 ¢, repeats 0.78 alike; 14 dB under.
7. **Flute**: held pitch ±0.2 ¢ (recorded ±1.4) but its level moves (±0.9 dB: its vibrato) and no two
   attacks are alike (spectra 10 dB apart).
8. **Timpani**: my first suspect (157 strokes, six rolls), cleared by measurement. Two strokes are 0.93 alike
   where two recorded takes of one stroke are 0.95; its rolls read as the recorded rolls do (strokes 6.7 dB
   out of the roll against 8.1, 21 % of the level at one rate against 17 %); and it is 16 dB under the mix.
9. **Double bass**: its vibrato is 84 % one sine, but the pitch moves (±4.6 ¢) and it is in front 11 % of the time
   on long notes that do.
10. **Viola**: in front 17 % of the time on repeated double stops, but they are the least alike of any part's
    repeats (0.37) and span 12 dB.
11. **Violins, cello**: planned bows, vibrato that wanders, repeats 0.33–0.68 alike.

(The recorded violin, cello, bass, trumpet and clarinet runs did not come apart into held notes in this
reader, so those five have no recorded figure beside them; the tool says so rather than print one.)

## The fix: the trombone has a player

`packages/engine/src/core/trombone.ts`, `TROMBONE_HUMAN`, the `human` parameter (1 by default), the pattern
of the glockenspiel, tuba and harp (#67–#69). Measured on the Iowa tenor trombone
(`scripts/trombone-variation.ts`):

| | recorded | the model alone | with its player |
|---|---|---|---|
| pitch from note to note | ±5.0–6.4 ¢ | ±0.1 ¢ | ±5.5 ¢ (the slide put by ear: ±4 ¢, the same again on a repeated pitch) |
| pitch within a held note, a tenth of a second to the next | 1.3–2.5 ¢ | 0.0–0.1 ¢ | 1.3–1.4 ¢ |
| level within a held note | ±0.11–0.13 dB | ±0.03–0.06 dB | ±0.09–0.12 dB |
| a held note's level after its peak | −0.7 to −1.5 dB/s | +0.1 to +0.7 dB/s | −0.6 to −0.8 dB/s (the breath spent; a new tongued note takes a new one) |
| the attack's length from note to note | ±22–43 % | ±11–16 % (across pitches; one pitch: none) | ±24–35 % |
| brightness within a held note | 15–16 ¢ | 2–5 ¢ | 10–22 ¢ |

Each tongued note also has its own breath (±2 % of the mouth pressure: ±0.4 dB) and a puff of air as the
tongue lets go. A note known to be short gets less of the attack's variation and a quick one none: with all
of it, a scale of 70 ms notes lost 8 of 96 notes over twelve players where the model alone lost 3; as
shipped, 3 against 2 (`--detached`).

In the clip the trombone's held notes now move ±1.2 ¢ and ±0.25 dB (were ±0.1 ¢, ±0.11 dB; recorded ±1.9,
±0.30), and its notes span 3.5 dB (2.8). The other twelve stems are byte-identical before and after.

Not changed: the part's velocities (118–127 throughout: the piece's, not the engine's), and the other still
instruments (horn, clarinet).

## The judge stays on the model alone

`human: 0` is the engine as it was: `scripts/same-sound.ts --instrument trombone --params '{"human":0}'`
against the engine before, bit-identical at 44.1 and 48 kHz, dry and through the room (horn, trumpet, tuba,
flute, oboe, clarinet, bassoon bit-identical with nothing set). The fit and the judge already ask for
`human: 0` (`calibrate-ensemble.ts` `matchedParams`), and the tuning and regime tools now do:
`scripts/judge.ts --instrument trombone` before → after: **NO CLEAR CHANGE**, held-out 3.97 → 3.97, Δ 0.00 ± 0.00,
every measure identical. Nothing was refitted.

## Files

`trombone-coda-before.mp3` / `-after.mp3`: the trombone alone as seated, the clip's stretch (206–262 s), both
at −20.0 LUFS. `symphony-coda-before.mp3` / `-after.mp3`: the orchestra over the same stretch, both at −18.0 LUFS.
`trombone-coda.jpg`: 240.4–250.4 s of the trombone, before above, after below. `before.json`, `after.json`:
every part's numbers. The whole movement (4:23), the same way, is in `artifacts/symphony-robot/` (not
committed: 5 MB each): `trombone-before.mp3`, `trombone-after.mp3`, `symphony-before.mp3`, `symphony-after.mp3`.

To make them again: `npx tsx scripts/render-orchestra.ts --piece toward-morning --seconds 280 --played --stems
--wav --out <dir>` on each engine, `npx tsx scripts/mechanical.ts --stems <dir> --from 206 --to 262 --refs`,
`npx tsx scripts/pair-loudness.ts`.
