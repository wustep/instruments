# Woodwinds from note to note, and 3D tone holes without colour

Branch `improve/winds-legato`, on `0ac0ba5` (main, #71). Two asks: the 3D woodwinds' tone holes should not be
coloured, and the flute and the winds "sound off, especially the flute when swapping notes".

I cannot hear. Everything here is measured from renders (level, pitch and periodicity every millisecond
round each change of note; spectra; the pictures below), and the clips are for the ear that can.

## What was wrong, in plain words

**1. The flute stumbled every time it crossed a register.** A flute's notes up to C♯5 are the first mode of
its tube, D5 to C♯6 the second (the same fingerings, overblown), D6 and up the third. Inside one register the
model went from note to note in 12 ms with no hole. Across a break it came 50 to 100 ms late, behind a hole of
about 10 dB, and in a fifth of the cases the wrong octave sounded first (A4 → E5 slurred: E4 for 137 ms,
then E5). Any scale through D5 or D6 did it, slurred, tongued or after a short rest, from a file or by hand.
Then, when the note had arrived, its upper harmonics were 4 to 13 dB too strong for a fifth of a second.

The cause: the model keeps the wave in the tube as a history as long as the tube's round trip. Changing the
tube for another register lost that wave in one of three ways (stretched onto a mode that is not the note;
fed to the new tube's fundamental as much as to the mode wanted; or left to die while the jet, turned up to
hurry things, raised a new one). The earlier audits made those notes arrive (#59, #61); they did not make
them arrive on time.

**2. A short fresh note in the top register was impure.** A note from silence that a file announces as short
gets a quick attack. In the third register that attack raised a second mode of the tube beside the note's
own: F6 and G6 of 140 ms were 40 to 180 ¢ sharp and only half periodic for their whole length, at every
dynamic.

**3. The vibrato began again on every note.** On the flute every note, slurred ones included, restarted the
vibrato's slow entry (nothing for 0.3 s, full after 0.7 s). On the oboe, the clarinet and the bassoon every
note tongued over the breath did, and a file's notes mostly are (each ends where the next begins). So a
slurred or legato line of notes under 0.7 s had no vibrato at all, and a slower one went straight at the
start of each note and bloomed again: the sampler's "delayed vibrato on every key".

**4. In 3D the woodwinds' closed keys were tinted while a note sounded.** On the oboe, the clarinet and the
bassoon each closed key (its cup or ring, its arm, its hinge tube) took a warm tint from the standing wave
under it; on the flute the closed cups pulsed with the vibrato. It was faint (at most +39 of 255 in red on
the silver) and it changed from frame to frame, so it read as a flicker of colour on the keys. Two things the
code also meant to light never showed: the flute's tube (its material asked for a glow the renderer does not
draw) and the clarinet's and bassoon's plain finger holes (their glowing discs sat under the hole's own dark
disc).

## What changed

**The flute's tube takes its wave with it across a break** (`flute.ts` `CARRY`). At a register break the same
standing wave fits both fingerings: C♯5 is the first mode of a short tube, D5 the second mode of one twice as
long, and the short tube's wave is half of the long one's. So the wave is not thrown away: its history is
written once more at the new note's pitch, in as many periods as the new tube holds, and the jet's history
with it. Nothing has to die and nothing has to grow. What is heard goes from the old note to the new over
10 ms, about what a key takes to close (Almeida, Chow, Smith & Wolfe 2009). The three older mechanisms it
replaces are gone (the replaced fingering, the air let fall, the jet aimed sharper at a break). Inside a
register nothing changed.

A wide leap across a break (A4 → E5) is carried the same way. On a real flute the old wave fits the new tube
less well the wider the leap, and the player's lips do the rest in some tens of milliseconds; this is the
model being kinder than the instrument, where before it was far worse than it.

**A fresh note a file announces has its fingering's vent from its first sample** (`VENT`; the third
register, D5 and E♭5 are fingered with a vent hole, which lets every mode but the note's leak). The vent was
only there for joined notes.

**The vibrato is the breath's.** It comes in once over a breath and goes on through the notes slurred or
tongued over it (flute, oboe, clarinet, bassoon). A note after a real rest begins it again.

**3D: nothing on a woodwind's keys, cups, rings, pads or tone holes is lit or tinted, sounding or not.** The
per-key glow is gone from `oboe3d.ts`, `clarinet3d.ts`, `bassoon3d.ts` and the flute in `winds3d.ts`; the
discs that only existed to carry it are gone; the flute's tube is plain polished silver. Key motion and
fingering are as they were. Before and after, each with a note held, and the difference (before minus after,
×8): `flute-3d-holes-before.jpg`, `-after.jpg`, `-diff.png`, and the same for `oboe`, `clarinet`, `bassoon`
(`node scripts/shots-winds-holes.mjs`; the PNG originals are in `artifacts/winds-legato/`, not committed). The tint is subtle side by side; the `-diff` pictures show where it
was. The wood, the tube and the holes themselves are the same pixels before and after.

Left, and Stephen's call: **the reeds' bell still shimmers with the level**, and that is a good deal more
visible than the keys' tint was (the oboe's bell goes from black wood, RGB 52 44 40, to brown, 82 63 47, on a
loud note; the clarinet's from 30 20 18 to 51 34 22). The ask was the tone holes, a bell is not one, so it
stays: `oboe-3d-bell-{silent,sounding}.jpg`, `clarinet-3d-bell-{silent,sounding}.jpg`. Taking it out is one
`if (lvl > 0.02)` block in each of `poseOboe`, `poseClarinet`, `poseBassoon` and their tests' "shimmers"
lines. The reed's blades shimmer with their opening, the flute's breath is still drawn across the embouchure
hole, and the trumpet's valves keep their light: none of those is a tone hole.

## The numbers

All dry, 48 kHz unless said. "Before" is `0ac0ba5`.

### The flute, pair by pair (`scripts/winds-legato.ts`)

3024 pairs of notes over the compass (steps, thirds, a fourth, a fifth, a sixth, an octave, up and down, at
seven places), each slurred, tongued (the first ends where the second begins) and after a 50 ms rest, at
three dynamics and three lengths, sent as the file player sends them. 1242 of them cross a register, 1782 do
not.

| across a register (1242) | before | after |
|---|---|---|
| spoke later than 40 ms | 753 | 0 |
| a wrong register sounded over 10 ms | 257 | 0 |
| time to speak, median / 90th percentile | 47 / 105 ms | 7 / 8 ms (the latest 14) |
| a slur's hole, median / worst | −9.6 / −19.8 dB | −1.1 / −4.0 dB |
| something that is neither note, median | 28 ms | 4 ms |

| within a register (1782) | before | after |
|---|---|---|
| spoke later than 40 ms | 0 | 0 |
| time to speak, median | 12 ms | 12 ms |

By hand (nothing told ahead, as a keyboard sends them), all 3024: later than 40 ms 1157 → 288; a wrong register over 10 ms 229 → 2. Across a register by hand: 951 → 90 late, speaking in 14 ms (median) where it took 62.
(What is left by hand is the note *before* the change still rising: a key in the hand gets the long tone's
slow attack the recordings were fitted on, and at pp it is not up yet after a quarter of a second.)

The earlier audit's own test (`scripts/flute-rise.ts --also falls`, 1008 rises and 360 falls at each of 48
and 44.1 kHz): not on their note: rises 28 → 0 at each rate, falls 4 → 0 and 3 → 0. The rises speak in 7.5 ms (the median; 10 at the 90th percentile, where it was 57), the falls in 10 where they took 30.

The same test by hand: a wrong mode on 18 of 1008 rises before, on none now; not on their note (wrong mode,
impure or 12 dB under the held note) 36 → 22 rises. Of its 180 slurred falls by hand 13 now fail that level
mark where 1 did: all pp notes of 100–150 ms slurred from a pp note 200 ms old, on the right mode and pure
(0.96–0.99 of their power on their own harmonics), 13–19 dB under the held note. That first note is still
coming up (a soft note by hand has the long tone's attack), and a slur now goes on from where the breath
is. Before, crossing a register kicked the jet and hid it; within a register a soft slur by hand was always
so.

At 22.05, 44.1 and 96 kHz the crossings behave as at 48 (a subset of 552 pairs at each): none on a wrong
register; the only late ones (4 at 44.1 kHz, 6 at 22.05) all start from one note that is itself wrong before
the change, E♭6 pp of 250 ms, see "left".

### How the note sounds once it has arrived

A4 → A5 slurred, each harmonic of the A5 against the same note held alone:

| after the join | before | after |
|---|---|---|
| 20–60 ms | fundamental 15 dB under, the rest 20–25 dB under | all within 1 dB |
| 120–200 ms | harmonics 3–7 over by 5, 5, 9, 9, 13 dB | all within 1 dB |
| settled (within 1 dB) | after 300–450 ms | after 60 ms |

### Fresh notes a file announces

Every note of the compass alone, six dynamics, told ahead as 140, 280 and 500 ms, at 44.1 and 48 kHz
(`scripts/winds-legato.ts --fresh`): not on their pitch over their second half, 21 of 1332 before, 0 after.

### The vibrato

Five slurred flute notes of 0.9 s: the breath's swing at the start of the second note was 0.0001 (none) and
is 0.06 (the vibrato's depth). The same for a note tongued over the breath on the flute, the oboe and the
bassoon (`legato.test.ts`).

### The clips (`scripts/render-winds-legato.ts --before <old engine>`)

`flute-swaps-before.mp3` / `flute-swaps-after.mp3` (19.7 s): the flute alone over both breaks. Slurred
steps A4…G5 and back; slurred leaps A4 E5 A5, C5 G5 C6; octaves on one fingering F4 F5, A4 A5; slurred steps
over the upper break A5…E6; the first steps again, tongued and quicker; a slow slurred line D5 C♯5 E5 D5 (one
breath, one vibrato). Of its 50 joined notes, 18 across a register:

| | before | after |
|---|---|---|
| late (over 40 ms) | 10 | 0 |
| a wrong register over 10 ms | 5 | 0 |
| time to speak, 90th percentile | 119 ms | 13 ms |

`winds-before.mp3` / `winds-after.mp3` (22.6 s): the eight woodwinds of Beethoven's Fifth, II (Andante), from
284 s, as the Orchestra routes and plays them (two each of flutes, oboes, clarinets, bassoons; the notes
told ahead, the player's automatic expression), the stretch where the flutes cross a register most. The
flutes' 34 joined notes, 10 across a register: late 4 → 0, time to speak (90th percentile) 41 → 15 ms. The
six reed parts are the same notes sample for sample but for the vibrato (their note changes measured clean,
below), so this pair differs mostly where the flutes cross.

`flute-swaps.png`, `winds.png`: spectrograms, before on top. In `flute-swaps.png` the bright vertical smears
at each register change in the top half (the burst and the over-bright harmonics after it) are what is gone.

## The other winds

Measured the same way, 3024 pairs each, before any change:

* **Clarinet:** clean. Slurs speak in 11 ms with no hole, no wrong register in any pair, tongued notes in
  3 ms. Nothing changed but the vibrato's rule (and its vibrato is off unless asked for).
* **Oboe:** between notes of its upper two registers, clean (10–16 ms, no hole). What is wrong is not the
  change of note but the note: its low register (C4–G4) has two ways to sound, its own pitch and the octave,
  and 6–15 % of the pairs that end on such a note land on the octave for 100 ms or for good, slurred, tongued
  or fresh. Audit 3 measured eleven patches for this and concluded it needs a new voicing fitted to the
  recordings (the reed shuts several times a period down there). Not attempted here; unchanged.
* **Bassoon:** slurs 12 ms, tongued 3 ms; the same two-way low notes as the oboe (48 of 1008 slurs), left for
  the same reason. After a 50 ms rest it takes 41 ms to speak (median), which is about what a bassoon does.
* **Horn, trumpet** (noted, not touched): the same kind of thing does show. A slurred note takes 78 ms
  (horn) and 74 ms (trumpet) to settle, the median of 1008 slurs each, with 74 and 65 ms of sound that is
  neither note; the trumpet's slur has a hole of 5 dB (13 at the 10th percentile) and is slower than its
  tongued notes (38 ms). The pitch overshoots by 80–100 ¢ on the horn (the 90th percentile). Wrong registers
  are rare (13 and 1 of 1008). The lips' own resonance has to find the new partial, and that is their model,
  not a tube's history: a different fix, and brass was not this PR's. (The horn's low notes have periods of
  10–17 ms, so this measure's window is 30–50 ms long there and its times are coarse.)

## Judge, goldens

* A note alone that nothing announced (a key in the hand: what the voicings were fitted on and what the judge
  hears) is bit-identical to `0ac0ba5` on all four woodwinds at 22.05, 44.1, 48 and 96 kHz
  (`scripts/winds-alone-same.ts`: 52–60 notes each, dry and through the room, largest difference 0).
* Judge: NO CLEAR CHANGE on the flute, the oboe, the clarinet and the bassoon, each Δ 0.00 ± 0.00 on the held-out notes (flute 3.30 → 3.30, oboe 2.34 → 2.34, clarinet 1.95 → 1.95, bassoon 2.07 → 2.07): the judge's notes are the same samples (`npx tsx scripts/judge.ts --instrument <i> --before <0ac0ba5>`).
* Golden: only the flute's snapshot changed, and it is blessed. Its passage is C5, E5, G5 by hand with 40 ms
  between: the E5 begins on the still ringing C5, a register apart, so the passage itself held the fault. The
  ⅓-octave bands at 252 and 318 Hz (E4, the octave under the E5) fell 5.5 and 7.7 dB, the loudness in the
  50 ms where the E5 begins rose 2.2 dB, every band above is within 0.7 dB. The other fourteen snapshots pass
  unblessed.
* `packages/engine/test/legato.test.ts` (new, 7 cases, 2 s) fails on `0ac0ba5` in 6 of 7 (the seventh says
  that nothing changed within a register).

## Left

* **The players are too still.** A held note of the engine moves far less than a player's (the Iowa
  recordings' held notes, `scripts/winds-variation.ts`; medians at pp / mf / ff):

  | | pitch wanders, ¢ | level wanders, dB |
  |---|---|---|
  | flute, recorded | 1.6 / 1.1 / 1.2 | 0.51 / 0.11 / 0.18 |
  | flute, engine | 0.3 / 0.3 / 0.3 | 0.31 / 0.07 / 0.04 |
  | oboe, recorded | 1.4 / 0.7 / 0.6 | 0.43 / 0.07 / 0.03 |
  | oboe, engine | 0.1 / 0.1 / 0.2 | 0.08 / 0.04 / 0.02 |
  | bassoon, recorded | 3.5 / 2.5 / 1.0 | 0.17 / 0.07 / 0.07 |
  | bassoon, engine | 0.1 / 0.1 / 0.1 | 0.04 / 0.04 / 0.03 |

  (The clarinet's recordings do not segment into notes with this tool.) And every tongue stroke and every
  attack is the same as the last. That is what a player in the engine would be given (`human`, as the tuba,
  the harp and the glockenspiel have, and the trombone in #72): it is not in this PR. It is a second change
  of a different kind, #72 is the same idea waiting to be heard, and this PR is easier to judge by ear if it
  is only the note changes. The numbers above are ready for it.
* **The flute's vibrato is small:** 6 % of the blowing pressure moves the level by 0.2–0.3 dB. Fletcher (1975)
  measured about 10 % on players, mostly in the upper harmonics. Left as fitted; a player layer is where it
  belongs.
* **E♭6 pp by hand at 44.1 kHz** speaks on its tube's fourth mode when it is shorter than about 0.3 s (a
  single note's attack; bit-identical to before, not touched). By hand a few soft short notes near the lower
  break (D5, E♭5, G5 at pp) are still coming up after 280 ms: the long tone's attack, as fitted.
* **Oboe and bassoon low-register octaves**, above.
* **2D** is untouched: no 2D drawer shares the 3D modules' code (nothing outside `ui/gl/` imports them).
* **The reeds' bell shimmer in 3D**, above: Stephen's call.

## Files

Engine: `packages/engine/src/core/flute.ts` (CARRY, VENT, the vibrato), `oboe.ts`, `clarinet.ts`,
`bassoon.ts` (the vibrato). Test: `packages/engine/test/legato.test.ts`, `golden/flute.json`.
Tools: `scripts/winds-legato.ts`, `winds-legato-lib.ts`, `render-winds-legato.ts`, `winds-alone-same.ts`,
`winds-variation.ts`, `shots-winds-holes.mjs`.
3D: `apps/web/src/ui/gl/winds3d.ts` (the flute), `oboe3d.ts`, `clarinet3d.ts`, `bassoon3d.ts`; their tests
`apps/web/test/{oboe3d,clarinet3d,bassoon3d,models3d}.test.ts`.
