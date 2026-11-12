# Tuba: a player, the valves' intonation, and the instrument the right way round

## The orientation (Stephen's report: it looked wrong)

It was wrong. As first drawn (#62) the plan was the mirror image of a front-action tuba (the bell and the
mouthpiece at one side, the valves at the other, but the wrong sides for a right hand), with the mouthpiece
at the height of the bell's flare (0.87 m of 0.97) and the pistons bolt upright: a tuba no one could hold.

Checked against photographs (Wikimedia Commons, looked at and not kept: Yamaha YCB-822/YFB-822 front-action,
YBB-641 rotary, YBB-321 top-action; seated tubists at a U.S. Navy Band concert and a Concertgebouw
principal's portrait): a front-action tuba is held with its bell at the player's left and its valves before
his right hand. From the valve side, as the makers photograph it:

| | before | now |
|---|---|---|
| bell and valves | the bell at the right, the valves at its left | the bell's stack at the left, the wound body and valves at its right |
| the bell | bolt upright | leaning 4° towards the mouthpiece's side |
| mouthpiece | at the right, 0.87 m up (the flare), pointing right | at the left past the stack, 0.58 m up (0.60 of the height, a seated player's mouth), pointing out to the player |
| leadpipe | 0.82 m, over the bell's throat | 0.81 m: across the stack's front, down along it, round and up into the first valve |
| pistons | upright | leaning 22°, their buttons up and towards the player's side |
| in the Orchestra | its valve side square to the hall, 0.34 m up, the mouthpiece pointing along the row | on the lap (0.56 m: the mouthpiece at the lips, 1.14 m), the mouthpiece going back to the player, the bell beside his head, the valves half towards the hall; leaning a little back and to his left |

One plan still makes all of it (`apps/web/src/ui/tuba-plan.ts`: the head of the file says which way round and
why), so the classic 2D, the vector lines, the 3D model, the Orchestra's rows and seats and the picker's glyph
all changed together; every tube is still the engine's length (the open path 4.88 m, each valve alone its
loop exactly). `/symphony` ("Toward Morning") has thirteen seats and no tuba among them; the sixteen-seat
Orchestra below has.

`orientation-before-after.jpg`: 2D before and after, 3D before and after. `tuba-2d.jpg`, `tuba-vector.jpg`,
`tuba-3d.jpg` (F1: valves 1 and 4 down), `tuba-phone.jpg` (2D and 3D at 390×844), `orchestra-2d.jpg`,
`orchestra-3d.jpg` (sixteen seats, the tuba at the brass row's right end).

## The sound

* **A player** (`core/lipcone.ts` `LipConeHuman`, the tuba's: `TUBA_HUMAN`; the `human` parameter, 1 by
  default, 0 the model alone, which is what is fitted and judged; the horn has none and is bit-identical).
  A held note's breath comes up over its first quarter second and sags as the air is spent (0.6 dB in the
  first second, 1.5 dB in five: a third of what the Iowa tubist's isolated notes do, which peak a quarter to
  a third of the way through and fall 2–4 dB/s); it wanders (±0.2 dB) and so does the pitch (1.3 ¢ from one
  tenth of a second to the next; the recordings 1.7–2.8, the model alone 0.4–0.8: `scripts/tuba-variation.ts`).
  No vibrato: the Iowa tubist uses none (the knob and aftertouch still give it). From one tongued note to the
  next the tongue's hold, the lips' kick, the breath and the lips' first setting each differ a little, and the
  tongue's release is a puff of air.
* **Intonation** (`tuba.ts` `tubaIntonation`). Valves together stand sharp, each loop being cut for the open
  tube: 1+2 by 10 ¢, 2+4 by 24, 1+4 by 48, 1+2+4 by 79, all four by 175 (the fourth valve stands in for 1+3,
  30 ¢, and 2+4 for 1+2+3, 52 ¢); the tube's fifth and tenth partials are 14 ¢ flat. The player leaves 15 % of
  the valves' sharpness, never more than 12 ¢, and half the partial's: A1 +1.6 ¢, G♭1 +3.7, F1 +7.2, E1 to D♭1
  +12, D3–E3 −6.8. The tube alone (`human` 0) plays every note at pitch, as before. (The Iowa tubist's own
  notes: the fifth-partial ones 14 ¢ under their neighbours, the valve combinations within a few cents of the
  open notes, his E♭1 at fortissimo 76 ¢ sharp.)
* **The breath noise, fitted again** (`scripts/fit-tuba-noise.ts`, on the fit half). The first fit held the
  noise under a bound and ended on it: soft low notes were 6 dB cleaner than the recordings', the middle and
  top at mf and ff 2–4 dB noisier. Now: less at the top (`noiseTop` 0.244 → 0.16) and a soft note airier than
  a loud one (`noiseSoft` 0.5).

## Judged

`npx tsx scripts/judge.ts --instrument tuba --before <b038010>/packages/engine/src/core/index.ts` (the model
alone, as it is fitted): **BETTER**, held-out 5.89 → 5.81 (n = 52, Δ 0.08 ± 0.04): harmonics over noise
4.35 → 3.87 dB, attack 0.99 → 0.95, harmonics, brightness and pitch unchanged; no guard broken. The fit half
5.60 → 5.52. Small: it is one parameter family.

**"Quiet low notes too dark"**: not changed, and here is why. The pianissimo recordings' brightness (716 Hz
over C1–B1) is above their own mezzo-forte's (423 Hz), at −61 dBFS: that is the session's hiss, not the
tuba. The model's pp (388 Hz) is under its mf (437 Hz) as an instrument's is. The noise is now 0.5 dB nearer
(above); the tone is left alone.

The horn and the trumpet are bit-identical to main (`scripts/same-sound.ts`: largest difference 0 in all
eight renders).

## Heard

`tuba-before.mp3` / `tuba-after.mp3` (`scripts/render-polish.ts`: one phrase before and after, as played): a
long C2 and a soft long G1, F2 tongued eight times, a march's bass, a slurred phrase. `tuba.jpg`: before on
top.

| | before | after |
|---|---|---|
| eight tongued F2s: their levels' spread (SD) | 0.33 dB | 1.52 dB |
| … their brightness's spread | 29 ¢ | 78 ¢ |
| loudness, peak | −22.2 LUFS, −3.8 dBFS | −22.4 LUFS, −4.3 dBFS |

Beside the others as played (`scripts/levels-table.ts`): −23.2 LUFS at mf, −13.8 at ff (the horn −18.2 and
−13.7, the trombone −21.2 and −13.6, the double bass −26.3 and −19.3): level with the brass at ff, as it was
set.

## Left

* Alone on its page, the lowest notes at velocities over 110 work its own limiter (2–3 dB at 112, up to 7 dB
  on D1 at 127): their waveform is a pulse, peaks 15 dB over the level. In an ensemble the limiter is told
  its share of the bus and is idle. As before this pass.
* No fifth valve, no F or E♭ tuba, no mute. The player's vibrato is off unless asked.
* The pistons lean in the plan's plane; a real front-action piston also tips towards the player's hand.

## Tests

`packages/engine/test/tuba.test.ts` (10: the intonation; the player), `apps/web/test/tuba2d.test.ts` and
`tuba3d.test.ts` (17: which way round, the leaning bell and pistons, the mouthpiece at the lips in its seat),
`e2e/tuba.spec.ts` (13 on desktop and a phone). The tuba's golden is blessed; `ensemble.json` regenerated
(only the tuba's entries changed).
