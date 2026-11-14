# Harp and glockenspiel: an improvement round (14 Nov 2026)

What was asked: less mechanical, more natural attack, decay, resonance and dynamics, with nothing kept that
does not still sound natural; pictures consistent with the other instruments. Every change below started
from a measurement on the reference recordings (the VCSL concert harp, the Iowa bells), not from the judge:
the judge reads levels over a quarter second and the slope of a decay, and neither instrument's largest
faults were there. The verdicts are given as they came.

Numbers: `numbers.txt` (every tool's output, old engine and new). Clips: `harp-before.mp3`, `harp-after.mp3`,
`../glock-round/glockenspiel-before.mp3`, `-after.mp3` (the same notes through the old engine and this one,
as played: room and limiter), spectrograms beside them (before on top).

## Harp

| | measured on the recordings | the model before | now | tool |
|---|---|---|---|---|
| The board's knock: its own modes ringing for a few hundredths of a second under each pluck (216, 324, 372, 408, 468, 552, 612, 660, 720, 804 Hz: peaks of the first 80 ms that are no partial of the plucked string, the same under nine to sixteen of the plucks) | under D6–F7, 380–850 Hz stands 4–17 dB under the tone | 26.6 dB (fit strings) and 29.0 dB (held-out) further under, and at 172–458 Hz | 0.8 dB over and 2.7 dB under | `scripts/harp-knock.ts [--modes]` |
| What a forte pluck does to the even partials (the second and fourth against the first, forte less the softer pluck) | +4.7 dB (held-out), +7.1 (fit) | +2.1, +1.9 | +6.9, +6.1 | `scripts/harp-dynamics.ts` |
| A partial's waver about its own straight fall | 1.7 dB, quartiles 1.2–2.7 | 0.8, 0.3–1.1 | 1.0, 0.5–1.7 | `scripts/harp-waver.ts` |
| The strings that answer | (not separable) | added to the pluck at its instant | taken from the plucked string: the first 4 ms are the same with and without them | `harp.test.ts` |

* **The judge: NO CLEAR CHANGE** (held-out 1.28 → 1.33, Δ −0.05 ± 0.05; no guard broken). Spectrum better
  (12.39 → 11.73), attack worse (3.65 → 4.25), ring worse (0.58 → 0.78). The attack: the judge compares a dry
  model with a recording made in a room, where the first 20 ms are the direct sound alone; the first fit had
  answered that by making the knock 27 dB too small. Read where the room cannot matter (under the
  fundamental, a narrow band) it is now right. As played (`HARP_OWN=1`): NO CLEAR CHANGE, 1.28 → 1.31.
* **Tried and not kept.** (1) The polarisations apart by what the recordings' beat *rates* suggested (2.5 Hz
  at 440 Hz): the waver matched (2.0 dB, 3.1 crossings a second against 1.7 and 3.4) but the split is 20–60 ¢
  on the long strings and the pitch test heard strings 6–8 ¢ off; the split is in cents now, 2.5 at most, and
  the waver is what that gives. (2) The slow polarisation heard against the other on half the partials (the
  recordings' partials begin under their later level as often as over it): D4 and F4 then sat 7–11 dB under
  their neighbours for a second. (3) A polish of fifteen constants on the fit half: 0.996 → 0.970 there,
  1.33 → 1.33 on the held-out strings, and the knock's low centre on its bound: overfitting, left out.
* **Left.** The recordings' fundamentals fall 10–20 dB and come back within half a second on some strings
  (A4, C5): that is the other strings beating against the plucked one through the board, at ten times the
  coupling the voicing has; raising it moves every decay and needs its own fit. A forte pluck's attack is
  3–4 dB stronger than a mezzo-forte's in the recordings and 0.1–0.2 in the model (it was 0.7): the knock
  under the top strings grows *less* than the tone with the dynamic, so the forte attack is in the tone
  itself, and no one mechanism was found for it.
* As played: −22.5 → −22.6 LUFS on the round's phrase (`gainDb` −18 → −17.5 for what the strings' own
  polarisations take), the limiter idle to velocity 127.

Pictures (2D, vector lines, 3D): the action plate under the neck with each string's two discs, its bridge
pin and its tuning pin; a fluted column with gilt rings; sound holes down the soundbox's back (3D); a pluck's
mark where the engine's finger took the string (a ring that widens and fades in 0.28 s: no two in one place);
a ringing string lit (3D). `harp-*-before-after.jpg`, `harp-3d-{close,neck,behind,foot,orchestra}.jpg`,
`harp-2d-plucked.jpg`, `harp-phone-3d.jpg`.

## Glockenspiel

| | measured on the recordings | the model before | now | tool |
|---|---|---|---|---|
| The stroke's first 4 ms at 4 and 5 kHz, mezzo-forte (re the stroke's level 80–200 ms on) | 44, 45 | 28, 22 (a knock of two resonances at 3.2 and 6.1 kHz, the same tick on every note) | 39, 39 | `scripts/glock-click.ts` |
| … band by band, 2–16 kHz, all strokes | | 16.4 dB apart (fit bars), 15.5 (held-out) | 14.9, 13.5 | |
| The pitch's waver about its straight fall (a player's bars) | 0.4 dB, 0.2–0.6; 1.4 crossings a second | 0.0 | 0.4, 0.3–0.5; 1.0 | `scripts/glock-waver.ts --human 1` |

* **The click is not the recordings' whole size, on purpose.** Their mezzo-forte click's peak stands 10 dB
  over the note's own and their fortissimo's more (the first 3 ms of a fortissimo C6–B6 are 11.5 dB over what
  follows; the model's 3.7 before, 4.4 now). The instrument's fortissimo is played with its peaks at the
  limiter's threshold, and a click of the recorded size put them 3–6 dB over it: the limiter then ducks the
  note for a fifth of a second, which is worse than a small click. So it has the room there is: full at and
  under mezzo-forte less 4 dB, growing a fifth as fast as the note above it. Limiter alone on a note: 0 dB at
  velocities 75 and 106, 1.1 dB at 127 (1.9 before).
* **The judge: NO CLEAR CHANGE** (held-out 1.28 → 1.29): it reads the first 20 ms against the next 180 and
  cannot see 3 ms.
* The strokes are the same strokes as before (the click has a random stream of its own): −18.1 → −17.9 LUFS
  on the round's phrase.

Pictures: a stroke throws its mallet back, the higher the harder (4 cm for a soft stroke, 14 for a
fortissimo, then back to 7 cm over the bar), in 2D, vector lines and 3D; in 3D the mallet turns about the
hand that holds it (`../glock-round/glock-3d-rebound.jpg`). **The bars' material and light in 3D are as they
were:** that pass was to follow the ring-glow change (#85), which had not merged when this was gated.
