# Audio audit 3, double reeds: the octave flips, measured and left

Branch `improve/audio-audit-3-reeds` from `main` at `a561109`. **The engine is unchanged**: no measure tried
cut the wrong-regime rate without moving it to other notes or failing the judge, so nothing was kept. What is
here: the Monte Carlo survey every later change can be judged against, the baseline, clips of the fault, and the
cause, which is narrower than the two earlier rounds had it ("two stable regimes, the noise picks one").

## The baseline (`survey-before.txt`, `pieces-before.txt`)

`scripts/reeds-regimes-mc.ts`: every note of each compass at velocity 40/80/120 in nine contexts, each cell
played by 6 players (the engine's `player`: its own noise and intonation) at 4 start times = 24 trials. A note is
wrong if its harmonics that are not its octave's (twelfth's, double octave's) hold under 1 % of its power over
40–90 % of its length (`modeOf`). No recorded note is under that line (`scripts/reeds-recorded-odd.ts`: 0 of 116
bassoon and 0 of 103 oboe notes; the weakest, the bassoon's A3, has its odd harmonics at −15 dB, B♭3 −13, the
oboe's F5 −18), so the measure never takes the recorded colour for a fault. The recorded A2, B2, E♭2, E2 hold
their odd harmonics at −3…−9 dB: when the model's read as the octave, that is a fault.

| context | oboe wrong / trials | | bassoon wrong / trials | |
|---|---:|---:|---:|---:|
| a key in the hand, from silence (nothing foreseen) | 32 / 2592 | 1.23 % | 33 / 3096 | 1.07 % |
| a file's note of 1 s from silence | 36 / 2592 | 1.39 % | 25 / 3096 | 0.81 % |
| a file's note of 0.28 s from silence | 24 / 2592 | 0.93 % | 16 / 3096 | 0.52 % |
| tongued after a note a fourth lower | 93 / 2592 | 3.59 % | 25 / 3096 | 0.81 % |
| tongued after a note a fourth higher | 32 / 2592 | 1.23 % | 17 / 3096 | 0.55 % |
| slurred from a fourth lower | 81 / 2592 | 3.13 % | 23 / 3096 | 0.74 % |
| slurred from a fourth higher | 33 / 2592 | 1.27 % | 60 / 3096 | 1.94 % |
| its own pitch struck again | 63 / 2592 | 2.43 % | 24 / 3096 | 0.78 % |
| after a rest of 60 ms the tongue holds | 125 / 2592 | 4.82 % | 54 / 3096 | 1.74 % |
| **all** | **519 / 23328** | **2.22 %** | **277 / 27864** | **0.99 %** |

By dynamic (v40 / v80 / v120): oboe 151 / 185 / 183 of 7776 each, bassoon 102 / 84 / 91 of 9288 each: the dynamic
does not matter. By pitch (of 648 trials each; the whole list is in `survey-before.txt`):

* **oboe**: B♭3–G4 and B♭4–C5 carry it: G4 63, B4 64, E♭4 57, C4 44, E4 40, C♯4 37, B♭4 36, C5 35, D4 27, B3 23,
  B♭3 20; then D6 18 and E♭6 10. C♯5–C♯6 and E6–A6: 12 in all.
* **bassoon**: E♭2–E♭3 from silence and in every context: B2 39, D3 32, E♭3 24, A2 15, G2 11, B♭2 11, C3 10, C♯3 9;
  F4 28 and F♯4 51 only joined to another note (F♯4 slurred down from B4: 40 of 72, and then it is the player, not
  the start time: one player's intonation lands every time, another's never).

The pieces, each whole, 12 players (`scripts/winds-midi-players.ts <part> --players 12`):

| part | notes | wrong notes a performance | mean | pitches |
|---|---:|---|---:|---|
| Beethoven 5 I, bassoon I | 523 | 3 4 1 5 0 1 0 5 2 0 1 1 | 1.9 (0.37 %) | E♭3 6, D3 5, B♭2 3, A3 3, A♭3 2, B♭3 2, A♭2 1, G3 1 |
| the bassoon's own piece | 72 | 1 1 0 0 1 0 0 1 1 0 0 0 | 0.4 (0.6 %) | F4 5 |
| Beethoven 5 I, oboe I | 418 | 0 0 0 0 0 3 4 0 0 0 0 0 | 0.6 (0.14 %) | C5 5, D5 1, E♭5 1 |

So "about 2 % of the bassoon's notes on a wrong overtone" is 0.4–0.6 % in the bundled pieces and 1.0 % over the
whole compass and every context; on the eleven worst pitches it is 3.3 % (236 of 7128).

Held longer than the survey looks (a scratch probe: the odd-harmonic share of the pressure at the reed, 0.1–5.5 s,
mf): the bassoon's B2 on its octave at the start is back on its fundamental after 2–3 s in every trial; its D3 on
the octave stays (−23 → −30 dB over 5 s); its B♭2 **leaves** its fundamental for the octave after 2–5 s in 3 of 12
trials; the oboe's C4 does so after 3–5 s in 5 of 9; the oboe's G4 on the octave stays. A regime here is not
chosen once at the start: it drifts for seconds.

## The cause: the low registers do not play the reed's Helmholtz motion

`scripts/reeds-closures.ts` reads the reed's opening and the pressure at it (`closures-before.txt`).

On this bore (two tubes at the reed: Ollivier, Dalmont & Kergomard 2004) the reed's motion is the bowed string's:
shut once a period for the apex's round trip (β = x₀/(L+x₀) of the period), open the rest. The bore is open, so
its mean pressure is zero; the open reed holds the bore at the mouth's pressure γ (the losses are light and ζ is
near 1, so little pressure is lost across it). One closure a period then needs a pulse −γ(1−β)/β deep, in units
of the closing pressure: −16 at the bassoon's B♭1 ff, −5.7 at D3 ff, −13.6 at the oboe's B♭3 ff. A beating reed
feeds the bore only while it crosses its active part (⅓ < Δ < 1), a fixed amount each closure, and the loop's
losses grow with the square of the pulse's depth: the model holds pulses of −2…−5. With the depth limited, the
share of the period the reed must stay shut, γ/(γ+|p|), is 0.2–0.45, and each closure still lasts β: **the reed
shuts several times a period**.

| note (β) | closures a period at 0.15 / 1 / 4 s | deepest pressure at 4 s | one closure would need |
|---|---|---:|---:|
| bassoon B♭1 ff (0.049) | 9.0 / 8.0 / 5.9 | −2.6 | −16.0 |
| bassoon E2 ff (0.069) | 6.1 / 4.4 / 3.0 | −3.4 | −11.0 |
| bassoon A2 ff (0.093) | 4.0 / 3.0 / 2.0 | −3.6 | −8.0 |
| bassoon D3 ff (0.125) | 3.0 / 2.0 / 1.0 | −5.5 | −5.7 |
| bassoon A♭3 ff (0.179) | 1.0 / 1.0 / 1.0 | −3.7 | −3.8 |
| oboe B♭3 ff (0.058) | 4.3 / 3.0 / 3.0 | −5.0 | −13.6 |
| oboe E♭4 ff (0.077) | 3.6 / 2.0 / 2.0 | −4.5 | −10.0 |
| oboe G4 pp / ff (0.098) | 2.2 / 1.0 / 1.0 · 2.0 / 2.0 / 2.0 | −4.6 · −3.8 | −4.8 · −7.7 |
| oboe C♯5 ff (0.140) | 1.0 / 1.0 / 1.0 | −5.2 | −5.1 |

From A♭3 up on the bassoon and C♯5 up on the oboe there is one closure, as deep as the theory says to a tenth:
those notes do not flip from silence (bassoon A♭3–E5: 0 of 4536 trials from silence; oboe C♯5–A6 but D6 and E♭6:
1 of 4104).
Below, the note is a train of 2–9 closures a period. While the closures differ, its harmonics are the note's;
**the moment two (three) of them are alike it is the octave (the twelfth) exactly**. That is why the octave is so
near in B♭1–G3 and B♭3–C5, why the flips are octaves and twelfths (the bassoon's D3: 19 and 13), and why the
dynamic does not matter. It is the bowed string under Schelleng's minimum bow force (∝ 1/β²): several slips a
period, the fundamental weak, the octave beside it.

Where the closures come from: the attack. With the pressure whole behind the tongue and the reed let go at once,
the bassoon's A2 shuts at 0.93, 1.14, 1.35 periods and so on, every 2·D₂: the apex tube's own quarter-wave
(604 Hz on the bassoon, 2.05 kHz on the oboe), which the reed drives while it is in its active part. The first
tenth of a second has close to 1/(2β) closures a period (B♭1 8–9 for 10, E2 6 for 7, A2 4 for 5, D3 3–4 for 4),
with the noise or without it. A real
cone's apex is an inertance: it has no resonance of its own, and the reed snaps shut once. The train then
coarsens, closure by closure, over **seconds** (the loop loses 0.3 % a round trip at the fundamental; a bore this narrow and long takes some
10 % by the usual wall-loss estimate, α ≈ 3·10⁻⁵ √f / r a metre): what a real instrument sorts out in its attack
is still being sorted when the note ends, and the noise decides which closures merge.

A second, smaller family is not this one: notes whose apex is a third of the tube, on one closure a period: the
bassoon's F4 and F♯4 (β 0.31, 0.33: 79 wrong of 1296, every one joined to another note, none from silence) and the oboe's D6 and
E♭6 (β 0.31, 0.33: 28 wrong). There the bore's third resonance is missing (sin 3πβ = 0) and the note stands on
its first and second alone. Not looked into further.

So there are not two clean regimes to choose between. A measure that only moves a parameter moves which notes have
two closures alike at the moment the survey looks: every scan below is that.

## Tried, measured, not kept

Bassoon, the eleven worst pitches, six contexts, three dynamics, 12 trials a cell (2376 trials). Baseline **103**.

| changed (voice) | wrong | | changed | wrong |
|---|---:|---|---|---:|
| noise 0.05, floor 0.003 (a third) | 82 | | ends' low-pass 1500 Hz | 98 |
| noise 0.4 | 113 | | ends' low-pass 4000 Hz | 53 |
| wall 0.99 | 90 | | ζ 1.0 | 79 |
| wall 0.97 | 121 | | ζ 1.6 | 97 |
| wall 0.93 | 114 | | ζ 1.85 | 94 |
| wallK 60 | 99 | | wallK 14 | 96 |

The attack (how the breath comes on, how the tongue lets go), from silence, the whole compass (4644 trials),
baseline **53**: the tongue's hold 80 ms 30, 200 ms 41, 1 ms 158; the breath's rise 10 ms 70, 100 ms 117; hold
200 ms with a 10 ms rise 57; the tongue's withdrawal 0.3 periods 17, 2 periods 173, 5 periods 191; a wider opening
at the release (+40 %) 42. The same over all nine contexts (13932 trials), baseline **148**: withdrawal 0.5 periods
246, 0.3: 106, 0.15: 99, 0.05: 84, 0.3 with a 60 ms hold 70, 0.15 with a 60 ms hold 126. Not monotonic, and B♭2
goes from 9 to 22–24 wrong where B2 goes from 27 to 4: the flips move. The best row would also change every
long tone's attack (the judge's attack term and the golden) for a gain inside the scatter of its neighbours.

The cause addressed directly, each one step alone:

| measure | what happened |
|---|---|
| more flow through the reed (ζ 1.85; the solver's limit is 1.9) | D3 comes to one closure, −5.6 deep, after 1 s; A2 keeps 2, E2 3, B♭1 5. Wrong notes 94 of 2376 (103): the second it takes is the note |
| lighter loss up high (ends' low-pass 8 kHz, wallK 200) | the attack chatters more (B♭1: 33 closures a period at 0.15 s, 9 at 4 s); D3 reaches 1–2 after 4 s |
| the apex's reflection through its own low-pass (2400, 1200, 600 Hz: code tried and removed) | the pulses get shallower, so more closures, not fewer (A2 ff at 600 Hz: 4 closures of −0.9, for good) |
| the mouth's pressure following the pitch (Fuks & Sundberg 1999: ×0.6 at B♭1, whole from G3; code tried and removed) | B♭1 5–6 → 2–4 closures, E2 3 → 2; A2–D3 keep two; at ×0.5 the B♭1 pp does not speak (γ 0.33, the threshold) |
| the ends' low-pass at 4000 Hz, the best row above, over the whole compass and all contexts | 145 wrong of 13932 (148): E3 0 → 11, B♭4 0 → 26, where B2 fell 27 → 8. Judge **WORSE** (held-out 2.07 → 2.48; 3200 Hz: 208 wrong, WORSE 2.33) |
| the apex at 0.21 m, 0.28 m (nearer the bore's own: 4 mm across at the reed and 40 mm at the bell 2.5 m on put its point 0.28 m behind the reed), not refitted | D3 has one closure from the start, but 167 and 267 wrong of 13932 (148): the flips move up to B♭3–E♭4 and E♭5, where β nears ½. Judge **WORSE** both (held-out 2.07 → 2.52 and 3.26; unrefitted, the tuning table not measured again) |

## What a fix is

The low registers have to play one closure a period: the Helmholtz motion the cited theory gives a conical reed
instrument. (That real double reeds do so is the theory's word here, not a measurement: the recordings are of the
radiated sound and cannot show the reed.) That is a new voicing, not a patch: the apex as an inertance with the reed's volume (no quarter-wave
of its own to chatter on at the attack; `oboe.ts` records that this alone put the low register on its octave), at
its real length (β twice as large asks a pulse half as deep and twice as long: the bassoon's formant near 500 Hz
would then be the pulse's own spectrum, where the fitted voicing has an 18 dB peak in the radiation), losses
heavy enough that an attack's train is sorted within the attack, the reed's flow and the mouth's pressure by pitch
fitted so that pulse is held, then the tuning tables at four rates and the radiation refitted, judged against the
recordings. Each step alone measured worse above; together they are a refit of both instruments, which an audit's
time does not hold. The survey here is its test: `reeds-closures.ts` must print 1.0 across B♭1–G3 and B♭3–C5, and
`reeds-regimes-mc.ts --diff` must show the fall.

## Clips (`index-before.json` says what is in each)

As heard (the room on), 128 kb/s, with a spectrogram each (bassoon 0–3 kHz, oboe 0–6 kHz):

* `bassoon-named-before`: C♯3, D3, B2, each first on its fundamental and then, by another player or start time,
  on its octave (every other line of the spectrogram gone).
* `oboe-named-before`: G4, C5 (tongued after G4), D6, the same way.
* `bassoon-passage-before`: Beethoven's Fifth, I, bassoon I, 12 s from 158.3 s, player 0: E♭3 at 4.0 s, D3 at
  6.2 s and E♭3 at 8.2 s on their octave.

There is no "after": the engine is as it was.

## Judge, golden, tests

Nothing audible changed: `scripts/judge.ts --instrument bassoon --before <main>` NO CLEAR CHANGE (Δ 0.00 ± 0.00:
identical renders; held-out 2.07), golden untouched, `npx vitest run packages/engine` 263 passed. No unit test was
added: there is no behaviour to pin.

## Reproduce

```sh
B=<a checkout of main at a561109>/packages/engine/src/core/index.ts
npx tsx scripts/reeds-regimes-mc.ts --engine $B --players 6 --starts 4 --jobs 4 --json before.json   # 75 s
npx tsx scripts/reeds-regimes-mc.ts --players 6 --starts 4 --jobs 4 --json after.json
npx tsx scripts/reeds-regimes-mc.ts --diff before.json after.json                                   # per context, dynamic, pitch
npx tsx scripts/reeds-regimes-mc.ts --only bassoon --voice '{"zeta":1.85,"zetaTop":1.85}' --notes 39,43,45,46,47,48,49,50,51,65,66 --ctx hand,short,up,slur-down,repeat,rest --players 4 --starts 3 --jobs 4
npx tsx scripts/reeds-closures.ts [--only bassoon] [--vels 40,120] [--voice '{"zeta":1.85}']
npx tsx scripts/reeds-recorded-odd.ts
for p in "beethoven5-i bassoon 1" "demo bassoon" "beethoven5-i oboe 1"; do npx tsx scripts/winds-midi-players.ts "$p" --players 12 --engine $B; done
npx tsx scripts/render-reeds-regimes.ts --engine $B --tag before
npx tsx scripts/judge.ts --instrument bassoon --before $B
```
