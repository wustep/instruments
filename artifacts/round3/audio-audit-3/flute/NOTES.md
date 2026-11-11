# Audio audit 3: the flute rising across a register break

Branch `improve/audio-audit-3-flute`, on `main` at `a561109` (**before**). Everything below is measured with the
same notes on both engines; nothing was tuned by ear. The flute's registers here (`flute.ts` `fluteFingering`):
C4–C♯5 on the tube's first mode, D5–C♯6 on the second (the octave) of the tube an octave below, D6–C7 on the
third (the twelfth) of the tube a twelfth below.

## What was wrong

Sent two notes as a file sends them (told ahead, slurred or tongued), the upper note of a rise across a break
did not arrive: **526 of 1008 rises** at 48 kHz (533 at 44.1 kHz) were not on their note (another mode of the
tube, under 70 % of the level at their own pitch, or 12 dB under the same note held), 396 of the 504 that last
100 or 150 ms. A step up (C♯5→D5, C♯6→D6) sounded the octave or the twelfth below for 150–300 ms and then
broke upward: the crack. A leap to the third register on a tube the second register also uses (G5→D6, A5→E6:
the same tube in this model) never arrived at all, 48 of 48, and sat on the tube's second or fourth mode.
(#59 measured ten rises with a pitch-and-level measure and found 25 of 120; a tracker of the tube's own modes
finds far more, because a note an octave low is still "in tune".)

## Root causes (three, each measured apart)

1. **The tube was stretched, not re-fingered.** Every new note glided the bore delay to its new length (5 ms
   time constant). That carries the standing wave along with its mode number: C♯5→D5 is the C♯5 tube (554 Hz,
   first mode) stretched into the D4 tube, the wave bent down to 294 Hz, still the first mode, and the jet,
   already set for D5, then has to overblow it against the ring of a sounding tube: 150–250 ms. A real change of
   register is another fingering (many holes at once, in about 10 ms: Almeida, Chow, Smith & Wolfe 2009, JASA
   126, 1521): the old note rings on at its own pitch, a step under the new tube's next mode.
   Replacing the tube on such a rise (the wave turned back from both lengths, the new one's share growing over
   10 ms) alone: 526 → 291 of 1008. Within a register the glide is kept (one finger shading one hole does bend
   the pitch), and those slurs are as before.
2. **No vent.** Every third-register fingering of a flute, and D5 and E♭5, opens a hole part-way up the tube
   where the wanted mode has a pressure node, so the other modes leak and that one does not. The model's tube
   had none: its second and fourth modes were as ready to sound as its third, and a rise took whichever the last
   note's ring was nearest. With a leak there (20 % of the pressure at the hole, sent back both ways; one period
   of the note from the foot's reflection, so the wanted mode cancels at it): tongued rises to the third register
   139 → 0 of 192; all rises 291 → 162.
3. **A slur gave the jet nothing to raise the new mode with.** A tongued note gets a sharper aim for 60 ms
   (`ATTACK_BOOST`, fitted on the recordings' attacks); a slur got none, and the new mode grew from the jet's
   small-signal gain alone: 130–300 ms. A slur to another register is now aimed as a long tone's attack is
   (twice that up to a vented note, as #59 already did when tongued): 162 → 28.

And one that the rises laid bare: **coming down across a break** was slow too (105–230 ms slurred, 50–90 ms
tongued), which had been hidden wherever the note before had failed to go up (it had no register to come down
from). With the rises fixed alone, two notes in ten seconds of the flute's own piece that were right became late (E4
after D5 and after G5, 156 ms notes, 13–14 dB under the held note). The same aim on a fall (slurred, and tongued in place of half of it):
falls 82 → 4 of 360, and those notes are right again.

## The change (`packages/engine/src/core/flute.ts` only; `mono.ts` untouched)

* `FINGER` (10 ms): a fingering that goes **up** a register on another tube replaces the tube: two reflections
  (old length, new length) crossfaded, the delay no longer glided.
* `VENT` (0.2): a scattering junction across the bore for D5, E♭5 and D6–C7, computed only for a note joined to
  another (begun over a sounding tube). A note from silence speaks on its mode without it and is bit-identical.
* `CROSS_AIM` (1): the jet's aim on a note joined to one of another register, slurred either way or tongued
  coming down (`RISE_AIM`, 2, slurred up to a vented note as when tongued).
* No allocation in the audio path (one more 8192-sample history, made with the core); everything per sample or
  per internal block, so the host block size changes nothing (tested).

Not touched: a note alone from silence (bit-identical: `mono.test.ts`, the judge's Δ 0.00), slurs and tongued
notes within a register, the tuning table, the long tone's attack.

## Numbers

`npx tsx scripts/flute-rise.ts`: 42 rises (every step, third, fourth, fifth and octave across each break, the
first register to the third, and on up to C7) × slurred/tongued × velocity 40/80/118 × 100/150/300/600 ms =
1008 cases a rate, and 15 falls the same way (360). Full tables: `flute-rise-before.txt`, `flute-rise-after.txt`.

| | 48 kHz before → after | 44.1 kHz before → after |
|---|---:|---:|
| rises not on their note, of 1008 | **526 → 28** | **533 → 28** |
| … on another mode of the tube | 491 → 23 | 496 → 24 |
| … first → second register, slurred, of 168 | 91 → 18 | 89 → 18 |
| … first → second register, tongued, of 168 | 59 → 10 | 64 → 10 |
| … second → third, slurred, of 192 | 165 → 0 | 161 → 0 |
| … second → third, tongued, of 192 | 139 → 0 | 147 → 0 |
| … first → third, slurred / tongued, of 48 | 25 → 0 / 8 → 0 | 25 → 0 / 6 → 0 |
| … up to the top (from C6, C♯6 and within the third), slurred / tongued, of 96 | 21 → 0 / 18 → 0 | 22 → 0 / 19 → 0 |
| … notes of 100 ms / 150 ms / 300 ms / 600 ms, of 252 each | 209 → 18 / 187 → 10 / 95 → 0 / 35 → 0 | 209 → 17 / 191 → 11 / 105 → 0 / 28 → 0 |
| … velocity 40 / 80 / 118, of 336 each | 182 → 10 / 172 → 9 / 172 → 9 | 188 → 10 / 170 → 9 / 175 → 9 |
| the upper note speaks in, ms (median; 90th percentile) | 145; 300 → 15; 57.5 | 147; 300 → 15; 60 |
| a crack (something else louder than the note, within 12 dB of the held note), ms (median; 90th pct) | 10; 135 → 0; 0 | 10; 132.5 → 0; 0 |
| what is not the note, loudest, dB re the held note (median; worst) | −6.9; +2.3 → −11.5; −1.8 | −7.5; +1.9 → −11.6; −1.5 |
| falls not on their note, slurred / tongued, of 180 each | 71 → 1 / 11 → 3 | 72 → 0 / 14 → 3 |
| a fallen note speaks in, ms, slurred / tongued (median) | 107.5 → 30 / 50 → 32.5 | 117 → 32 / 52 → 32 |

By hand (nothing foreseen, `--hand`, 48 kHz): rises 538 → 36 of 1008, falls 116 → 9 of 360.

#59's own measure (`scripts/winds-midi-joined.ts`, 139 and 278 ms, three dynamics): rises tongued 25 → 3 of 120,
slurred (`--over 0.03`) 64 → 3; falls tongued 4 → 1 of 132, slurred 24 → 1.

Clicks (the audit's measure, `worstJump`, over the 342 joins at 300 ms): the largest one-sample step at a join
2.12× → 1.56× the tone's own; over 2×: 1 → 0.

Each rise at 48 kHz (12 cases a cell: three dynamics × four lengths; before → after):

| | | slurred: fail of 12 | speaks in, ms (median) | crack, ms (longest) | tongued: fail of 12 | speaks in, ms (median) | crack, ms (longest) |
|---|---|---:|---:|---:|---:|---:|---:|
| I→II | C♯5→D5 | 8 → 0 | 182.5 → 7.5 | 17.5 → 0 | 8 → 0 | 150 → 2.5 | 65 → 0 |
| I→II | C5→D5 | 6 → 0 | 187.5 → 7.5 | 17.5 → 0 | 4 → 0 | 115 → 5 | 10 → 0 |
| I→II | C♯5→E♭5 | 8 → 0 | 177.5 → 7.5 | 17.5 → 0 | 7 → 0 | 150 → 5 | 57.5 → 0 |
| I→II | B4→D5 | 9 → 0 | 200 → 10 | 15 → 0 | 6 → 0 | 150 → 7.5 | 12.5 → 0 |
| I→II | C5→E5 | 6 → 0 | 177.5 → 7.5 | 12.5 → 0 | 4 → 0 | 100 → 17.5 | 10 → 0 |
| I→II | C♯5→E5 | 7 → 0 | 175 → 7.5 | 12.5 → 0 | 6 → 0 | 150 → 7.5 | 37.5 → 0 |
| I→II | A4→D5 | 7 → 0 | 217.5 → 12.5 | 12.5 → 0 | 6 → 0 | 122.5 → 35 | 12.5 → 0 |
| I→II | C5→F5 | 6 → 0 | 172.5 → 20 | 10 → 0 | 3 → 0 | 100 → 37.5 | 10 → 0 |
| I→II | G4→D5 | 6 → 0 | 197.5 → 20 | 15 → 0 | 3 → 0 | 107.5 → 72.5 | 12.5 → 0 |
| I→II | C5→G5 | 6 → 5 | 165 → 92.5 | 10 → 42.5 | 1 → 3 | 97.5 → 100 | 7.5 → 0 |
| I→II | D4→D5 | 6 → 0 | 205 → 20 | 10 → 0 | 4 → 0 | 120 → 75 | 15 → 0 |
| I→II | E4→E5 | 6 → 6 | 182.5 → 100 | 10 → 30 | 6 → 6 | 102.5 → 102.5 | 12.5 → 12.5 |
| I→II | A4→A5 | 5 → 4 | 150 → 77.5 | 10 → 32.5 | 1 → 1 | 80 → 80 | 7.5 → 7.5 |
| I→II | C5→C6 | 5 → 3 | 147.5 → 60 | 7.5 → 25 | 0 → 0 | 65 → 65 | 5 → 5 |
| II→III | C♯6→D6 | 9 → 0 | 265 → 7.5 | 67.5 → 0 | 6 → 0 | 150 → 5 | 132.5 → 0 |
| II→III | C6→D6 | 11 → 0 | 300 → 7.5 | 70 → 0 | 7 → 0 | 150 → 7.5 | 147.5 → 0 |
| II→III | C♯6→E♭6 | 9 → 0 | 272.5 → 7.5 | 62.5 → 0 | 7 → 0 | 150 → 7.5 | 145 → 0 |
| II→III | B5→D6 | 10 → 0 | 300 → 10 | 72.5 → 0 | 7 → 0 | 167.5 → 12.5 | 152.5 → 0 |
| II→III | C6→E♭6 | 11 → 0 | 300 → 10 | 65 → 0 | 7 → 0 | 160 → 10 | 147.5 → 0 |
| II→III | C♯6→E6 | 9 → 0 | 285 → 10 | 62.5 → 0 | 8 → 0 | 150 → 12.5 | 140 → 0 |
| II→III | A5→D6 | 12 → 0 | 300 → 37.5 | 410 → 0 | 11 → 0 | 270 → 40 | 352.5 → 0 |
| II→III | C6→F6 | 12 → 0 | 300 → 32.5 | 440 → 0 | 10 → 0 | 192.5 → 32.5 | 380 → 0 |
| II→III | G5→D6 | 12 → 0 | 300 → 35 | 435 → 2.5 | 12 → 0 | 300 → 32.5 | 587.5 → 2.5 |
| II→III | A5→E6 | 12 → 0 | 300 → 30 | 437.5 → 0 | 12 → 0 | 300 → 35 | 587.5 → 0 |
| II→III | B5→E6 | 12 → 0 | 300 → 47.5 | 190 → 0 | 10 → 0 | 222.5 → 40 | 327.5 → 0 |
| II→III | C6→G6 | 12 → 0 | 300 → 22.5 | 437.5 → 0 | 10 → 0 | 182.5 → 25 | 322.5 → 0 |
| II→III | G5→G6 | 9 → 0 | 180 → 12.5 | 57.5 → 0 | 8 → 0 | 150 → 15 | 122.5 → 0 |
| II→III | D5→D6 | 9 → 0 | 275 → 15 | 80 → 0 | 9 → 0 | 165 → 17.5 | 172.5 → 0 |
| II→III | E5→E6 | 10 → 0 | 255 → 15 | 172.5 → 0 | 9 → 0 | 150 → 17.5 | 147.5 → 0 |
| II→III | A5→A6 | 6 → 0 | 157.5 → 12.5 | 47.5 → 0 | 6 → 0 | 122.5 → 15 | 105 → 0 |
| I→III | C5→D6 | 7 → 0 | 215 → 22.5 | 0 → 0 | 2 → 0 | 55 → 27.5 | 10 → 0 |
| I→III | G4→D6 | 7 → 0 | 222.5 → 15 | 0 → 0 | 4 → 0 | 82.5 → 17.5 | 77.5 → 0 |
| I→III | C5→E6 | 7 → 0 | 202.5 → 25 | 0 → 0 | 2 → 0 | 52.5 → 30 | 22.5 → 0 |
| I→III | C♯5→G6 | 4 → 0 | 147.5 → 12.5 | 0 → 0 | 0 → 0 | 40 → 12.5 | 2.5 → 0 |
| top | D6→E6 | 0 → 0 | 7.5 → 7.5 | 0 → 0 | 0 → 0 | 10 → 10 | 0 → 0 |
| top | E6→G6 | 0 → 0 | 10 → 10 | 0 → 0 | 0 → 0 | 12.5 → 10 | 0 → 0 |
| top | G6→A6 | 0 → 0 | 7.5 → 7.5 | 0 → 0 | 0 → 0 | 10 → 10 | 0 → 0 |
| top | A6→C7 | 0 → 0 | 10 → 10 | 0 → 0 | 0 → 0 | 10 → 10 | 0 → 0 |
| top | F6→C7 | 0 → 0 | 15 → 15 | 0 → 0 | 0 → 0 | 17.5 → 15 | 0 → 0 |
| top | C6→A6 | 9 → 0 | 205 → 22.5 | 47.5 → 0 | 6 → 0 | 142.5 → 20 | 137.5 → 0 |
| top | C♯6→C7 | 6 → 0 | 150 → 12.5 | 37.5 → 0 | 6 → 0 | 120 → 15 | 130 → 0 |
| top | C6→C7 | 6 → 0 | 150 → 10 | 40 → 0 | 6 → 0 | 105 → 12.5 | 95 → 0 |
| falls | D6→C♯6 | 4 → 0 | 130 → 35 | 5 → 15 | 0 → 0 | 50 → 32.5 | 0 → 2.5 |
| falls | D6→C6 | 5 → 0 | 145 → 37.5 | 5 → 15 | 0 → 0 | 55 → 35 | 0 → 2.5 |
| falls | E6→C♯6 | 5 → 0 | 150 → 37.5 | 2.5 → 10 | 0 → 0 | 52.5 → 32.5 | 0 → 0 |
| falls | G6→C6 | 6 → 0 | 175 → 35 | 0 → 0 | 0 → 0 | 77.5 → 42.5 | 0 → 5 |
| falls | E6→A5 | 7 → 0 | 227.5 → 52.5 | 2.5 → 12.5 | 2 → 0 | 87.5 → 50 | 0 → 0 |
| falls | D5→C♯5 | 3 → 0 | 105 → 17.5 | 0 → 2.5 | 0 → 0 | 45 → 17.5 | 0 → 0 |
| falls | D5→C5 | 4 → 0 | 107.5 → 17.5 | 0 → 2.5 | 0 → 0 | 50 → 17.5 | 0 → 0 |
| falls | E5→C♯5 | 3 → 0 | 122.5 → 17.5 | 0 → 0 | 0 → 0 | 15 → 17.5 | 0 → 0 |
| falls | G5→G4 | 8 → 0 | 0 → 60 | 0 → 0 | 5 → 3 | 0 → 85 | 0 → 0 |
| falls | E6→C5 | 7 → 1 | 12.5 → 15 | 0 → 0 | 3 → 0 | 15 → 15 | 0 → 0 |
| falls | A6→G5 | 4 → 0 | 145 → 32.5 | 2.5 → 7.5 | 0 → 0 | 67.5 → 42.5 | 0 → 5 |
| falls | D6→G5 | 8 → 0 | 210 → 47.5 | 10 → 12.5 | 1 → 0 | 92.5 → 50 | 0 → 5 |
| falls | F♯6→B5 | 7 → 0 | 205 → 52.5 | 0 → 10 | 0 → 0 | 82.5 → 47.5 | 0 → 0 |
| falls | C7→G6 | 0 → 0 | 12.5 → 12.5 | 0 → 0 | 0 → 0 | 12.5 → 12.5 | 0 → 0 |
| falls | A6→E6 | 0 → 0 | 12.5 → 12.5 | 0 → 0 | 0 → 0 | 12.5 → 12.5 | 0 → 0 |

### The bundled pieces' flute parts

`npx tsx scripts/flute-parts.ts`: each part's busiest 60 s, played by four players (each its own noise: a note
growing from a small ring depends on the noise it meets, so one performance says little about one note),
measured with `scripts/winds-midi-measure.ts` (before → after, the four players):

| part | notes | lost | impure (< 70 % at its pitch) | another register | joined notes speak in, 90th pct, ms |
|---|---:|---:|---:|---:|---:|
| Bach, Brandenburg Concerto No. 5, III, flute | 245 | 6 9 3 3 → 0 0 0 0 | 0 → 0 | 0 → 0 | 60 → 17.5 |
| Beethoven 5, I, flute 1 | 141 | 1 1 1 1 → 0 0 0 0 | 1 1 2 2 → 0 0 0 1 | 0 → 0 | 52–70 → 30 |
| Beethoven 5, I, flute 2 | 87 | 2 0 1 1 → 0 0 0 0 | 3 1 1 1 → 1 0 0 0 | 0 → 0 | 25–45 → 12.5–15 |
| Beethoven 5, II, flute 1 | 103 | 2 2 4 2 → 0 0 0 0 | 3 1 4 2 → 0 0 0 0 | 0 0 1 0 → 0 0 1 0 | 55–60 → 17.5 |
| Beethoven 5, II, flute 2 | 25 | 1 1 0 1 → 0 0 0 0 | 1 0 0 0 → 0 0 0 0 | 0 → 0 | 55–60 → 20–30 |
| Toward Morning, flute | 80 | 0 → 0 | 0 → 0 | 0 → 0 | 15 → 15 |
| the flute's own piece (Bach, Partita, Bourrée anglaise) | 287 | 6 8 7 7 → 0 0 1 0 | 1 2 2 1 → 0 0 0 0 | 0 → 0 | 62–65 → 32–37 |
| **all, 3872 notes played** | | **70 → 1** | **29 → 2** | 1 → 1 | |

The existing table (`npx tsx scripts/winds-midi-measure.ts --part flute`, one player, busiest 30 s) with the
rises fixed and before the falls were: lost 9 → 2, impure 4 → 0, no note on another register either way, and one
note good → bad (B♭4 after G5 in the Brandenburg concerto, −10.6 → −14.4 dB: a fall); it and the own piece's two are what
the aim on a fall was added for.

### What must not change

* A note alone from the keys, and a held long tone: bit-identical (`packages/engine/test/mono.test.ts`; the
  judge renders single notes and finds them identical).
* `npx tsx scripts/judge.ts --instrument flute --before <main>`: **NO CLEAR CHANGE** — fit 3.40 → 3.40 (n=56),
  held-out 3.30 → 3.30 (n=53, Δ 0.00 ± 0.00).
* `npx vitest run packages/engine`: 35 files, 267 tests pass. `golden.test.ts` was **blessed for the flute
  alone** (`packages/engine/test/golden/flute.json`): its passage is C5, E5, G5 with 40 ms between them, and the
  E5, begun over the ringing C5 tube, used to spend its first 140 ms on the octave below (at 20 ms its own
  harmonics −42 dB, the rest −31 dB; its level reached at 180 ms); it is now on its note from the start (−26 dB
  against −35 dB at 20 ms, its level at 60 ms). C5 and G5 are unchanged. No other instrument's golden moved
  (on this machine `UPDATE_GOLDEN=1` also rewrites `bass.json`, `cello.json` and `clarinet.json` within their
  tolerance; those were checked out again).
* New: `packages/engine/test/flute-rise.test.ts` (0.3 s): six steps and five leaps, slurred and tongued, on
  their note; the vent takes nothing from a settled note; bit-identical at 128/37/500 frames a call. On `main`'s
  `flute.ts` two of its four tests fail (C♯5→D5 slurred: 8 % of the level at its pitch; G5→D6: 0.6 %).
* `pnpm typecheck`, `pnpm build` (the worklet parses for Safari 14.1).

## Clips

Each `-before.mp3` / `-after.mp3` (as heard, the room on, 128 kb/s) with a spectrogram (`.png`, before on top,
0–6 kHz) and its numbers in `index.json`:

| clip | what | before → after |
|---|---|---|
| `steps` | B4 C♯5 D5 E♭5 E5 and B5 C♯6 D6 E♭6 E6, 220 ms a note, slurred then tongued | rises not on their note 3 → 0 of 16; C♯5→D5 and C♯6→D6 speak in 155–220 ms → 3–8 ms |
| `leaps` | G5 D6, A5 E6, C6 G6, C5 E6, 300 ms a note, slurred then tongued | 5 → 0 of 8; speak in 200–300 ms (or never) → 23–38 ms |
| `scale` | D major, D4 to F♯6, 120 ms a note, tongued then slurred | 4 → 0 of 32; the notes after each break 120 ms (never) → 5–8 ms |
| `own-piece` | the flute's own piece, its busiest 10 s | lost 1 → 0; joined notes speak in (90th pct) 70 → 57.5 ms; weakest tenth −5.9 → −0.9 dB of the held note |
| `beethoven5-ii` | Flute I, Beethoven 5, II, its busiest 10 s | nothing lost either way; unchanged numbers (a passage with no break in it: a control) |

## Left as it is

| What | Measurement | Why |
|---|---|---|
| An octave up on one fingering into the unvented second register (E4→E5, A4→A5, C5→C6), and C5→G5, in notes of 100–150 ms | all 28 of the rises that still fail at 48 kHz: E4→E5 6 of 12 slurred and 6 tongued (as before), A4→A5 4 and 1 (5 and 1), C5→C6 3 and 0 (5 and 0), C5→G5 5 and 3 (6 and 1). The upper note speaks in 60–100 ms (150–205 before); meanwhile, slurred, the octave below is over the note for up to 25–43 ms, at −2…−7 dB of the held note at worst (before: 10 ms at −10 dB, and the note itself 150–200 ms late) | E5–C♯6 have no vent on a real flute either: the lips do it (a shorter, narrower jet). The model's jet already has the shorter delay; what it lacks is a jet that is deaf to the lower mode (its receptivity is a low-pass only; a real jet's gain also falls below its band). That is a filter inside the loop: it moves the loop's phase, the tuning table and every long tone, so it cannot be done leaving single notes as they are. A faster jet for 50 ms (the mirror of `FALL`, +30 %) was tried: 33 → 66 failures at that stage (it throws the note to the next mode up) |
| C5→G5 tongued got worse by two cases | 1 → 3 of 12 (velocity 40 and 80, 100 and 150 ms): on its mode (89–98 % at its pitch) but 12–17 dB under the held note; speaks in 100 ms as before | the replaced tube leaves the old ring (523 Hz) between the new tube's modes (392, 784), where the glide carried it onto the first; the long tone's aim on such a tongued rise cures it (1 of 12) but breaks C5→C6 tongued (0 → 2), so it was not taken |
| Falls: G5→G4 tongued, E6→C5 slurred | 3 of 12 (5 before) and 1 of 12 (7 before) | an octave down on one tube: the same wall as above, from the other side |
| A slurred fall's accent | what is not the note peaks at −7.6 dB of the held note (median; before −11.8), +3.4 dB at worst, and is over the note for 15 ms at most (10 ms before) | the aim that brings the lower note in 30 ms instead of 107 also brightens the upper one's last ring |
| The vent is a resistance, and only on joined notes | a settled slurred E6 is within 1 dB of the held one and 97 % at its pitch (tested) | the air's mass in the hole is left out (it would detune the other modes, as on a flute, rather than only damp them); computing it on a note from silence would change every long tone by the foot's loss at the hole, for nothing heard |
| 96 kHz and 22.05 kHz | not measured here (the rise table is 48 and 44.1 kHz; `flute-rates.test.ts` passes) | time |
| Noticed, not changed | in `settle()`, a tongued note from silence over a ringing tube sets `fallNow` from the *last* note's register step (it is read before `setNote`); and the per-sample glides of the bore and jet delays (0.004, 0.01 a sample) are faster in time at higher rates | not measured; outside this brief |

## Reproduce

```sh
B=<a checkout of main at a561109>/packages/engine/src/core/index.ts
npx tsx scripts/flute-rise.ts --engine $B --rows --also falls     # before (flute-rise-before.txt)
npx tsx scripts/flute-rise.ts --rows --also falls [--list] [--hand] [--fs 48000] [--seq '[[81,88]]']
npx tsx scripts/flute-parts.ts [--engine $B] [--players 4] [--seconds 60]
npx tsx scripts/winds-midi-measure.ts --part flute [--engine $B] [--notes]
npx tsx scripts/winds-midi-joined.ts --seq rises --len 0.139,0.278 [--over 0.03] [--engine $B]   # and --seq falls
npx tsx scripts/render-flute-rise.ts --before $B                  # the clips, spectrograms, index.json
npx tsx scripts/judge.ts --instrument flute --before $B
npx vitest run packages/engine
```
