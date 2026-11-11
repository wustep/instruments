# Audio audit 3, the strings: the violin's notes "an octave low", the viola's A♯4

Branch `improve/audio-audit-3-strings` from `a561109`. `before` is that commit's engine, `after` this branch.
Everything was measured on both with the same scripts; nothing was tuned by ear. The University of Iowa MIS
recordings are used for analysis only (`.cache/`, never committed).

| # | What | Before | After | |
|---|---|---|---|---|
| 1 | **Violin: quarter notes an octave low** (a loud C5 or D5 in a file) | the bowed string itself never leaves Helmholtz motion (0 of 1 404 test notes, 0 of 3 536 single notes of the pieces); what reads an octave low is the ring of the note before (55 single notes of 3 536, 1.6 %; every one was there before the note began) | engine unchanged | measured, cause found, left (below) |
| 2 | **Viola: A♯4 hot against its neighbours** | 9.8 dB over its neighbours (mf, held, dry; the recording's A♯4 3.3 dB over its own); against the recording A♯4 itself is −2.2 dB, its neighbours G4 −10.9, A4 −10.9, B4 −9.3, C5 −8.6 dB | 5.3 dB over its neighbours; G4 +3.7, A4 −5.0, B4 −6.5, C5 −3.5 dB against the recording | fixed |

## How it was measured (new scripts)

* `scripts/strings-lib.ts`: a bowed instrument rendered on any checkout's engine with the string's own motion
  kept beside the sound (its velocity under the bow and the friction force, every sample; the bow's force,
  speed and contact point every 128 samples), and the bowed parts of the bundled pieces as the browser sends
  them (the routes, the automatic expression, each note told ahead with its length and dynamics).
* `scripts/strings-octave.ts`: every note read every 5 ms, twice. **The string**: octave low (period-doubled:
  the octave below's own harmonics, f0/2 and its odd multiples, within 12 dB of the note's and 6 dB over what
  lies between them) or rough (no pitch). **The sound**: the same of what is heard, where anything still
  ringing counts too. A note is counted when a reading holds for a quarter of it (30 ms at least). `--grid`:
  A4–A5 from a file, after a rest, inside a line and slurred, pp/mf/ff, 0.15–1 s, three players. Default: the
  pieces' parts note by note, single notes only (no other note of the part within 20 ms: double stops are out).
* `scripts/strings-levels.ts`: each semitone held as the judge holds it, against the Iowa notes: model −
  recording with the two curves laid over each other, and each note over its neighbours, model and recording.
* `scripts/strings-tails.ts`: how long the sound takes to fall from 10 to 30 dB under the held level once a
  note has ended, recording and model, the notes that ring an open string apart from the rest; `--idle`
  tries the idle strings' coupling.
* `scripts/render-audio-audit-3-strings.ts`: the clips here (`clips.json` has their numbers).

## 1. The violin: not the bow

**The named case.** `violin-c5-d5-before.mp3` (as a file plays them, the bow planned; quarters of 0.33 s,
v104–108): G5 then C5, C5 alone after a rest, A5 then D5, D5 alone. The octave below's harmonics against the
note's own: C5 after G5 **−7.7 dB**, C5 alone −22.7 dB; D5 after A5 **−9.7 dB**, D5 alone −27.7 dB.

**The bowed string is in Helmholtz motion every time.** Single notes A4–A5 from a file (156 per row; the
string's own velocity under the bow), `strings-octave.ts --grid`:

| context | dyn | string: octave low | string: rough | settles, median / worst | sound: octave low | of them a ring | F / F_max | bow m/s | β |
|---|---|---|---|---|---|---|---|---|---|
| after a rest | pp | 0 | 0 | 0 / 0 ms | 0 | 0 | 0.30 | 0.042 | 0.116 |
| | mf | 0 | 0 | 0 / 20 | 0 | 0 | 0.30 | 0.069 | 0.093 |
| | ff | 0 | 5 (3.2 %) | 15 / 50 | 1 | 0 | 0.30 | 0.107 | 0.073 |
| in a line | pp | 0 | 0 | 0 / 0 | 5 (3.2 %) | 3 | 0.30 | 0.044 | 0.116 |
| | mf | 0 | 0 | 0 / 25 | 3 | 3 | 0.30 | 0.072 | 0.093 |
| | ff | 0 | 1 | 10 / 80 | 2 | 1 | 0.30 | 0.111 | 0.073 |
| slurred | pp | 0 | 0 | 0 / 0 | 1 | 1 | 0.30 | 0.085 | 0.116 |
| | mf | 0 | 0 | 0 / 0 | 3 | 3 | 0.30 | 0.140 | 0.093 |
| | ff | 0 | 0 | 0 / 0 | 3 | 3 | 0.30 | 0.216 | 0.073 |

The planner's stroke for a loud quarter-note D5 after a rest is the dynamic's own: k = 1 (on a string this
short the contact is three samples from the bridge and cannot move by a fraction, so the plan leaves speed and
contact point alone), the force 0.30 of Schelleng's maximum 30 ms in. A first note from silence reads the same
from a file and from the keys, number for number. The force rises faster (12 ms) than the speed (45 ms): by the
two time constants it is 1.2 × Schelleng's maximum for the speed the bow has at the first instant, 1.0 × at
6 ms, 0.7 × at 20 ms; a loud attack is rough for 15 ms (median; 50–80 ms at worst) and then periodic at the
note's pitch.
Pressing harder does break the motion (pressure 1.2 of the maximum: rough for 0.7 s of 0.8 s), and the reading
sees it; it does not happen at the pressures played.

**The pieces**, first and second violins, single notes (`strings-octave.ts`):

| part | single notes | short (< 0.5 s) | string: octave low | string: rough for a quarter of the note | sound: octave low | of them a ring from before |
|---|---|---|---|---|---|---|
| Haydn violin 1 | 747 | 404 | 0 | 0 | 8 (1.1 %) | 8 |
| Haydn violin 2 | 432 | 42 | 0 | 0 | 3 (0.7 %) | 3 |
| Beethoven 5 I violin 1 | 849 | 777 | 0 | 46 (5.4 %) | 22 (2.6 %) | 22 |
| Beethoven 5 I violin 2 | 758 | 650 | 0 | 79 (10.4 %) | 21 (2.8 %) | 21 |
| Toward Morning violin 1 | 325 | 202 | 0 | 0 | 0 | 0 |
| Toward Morning violin 2 | 425 | 331 | 0 | 0 | 1 (0.2 %) | 1 |

The earlier "9–13 % of Beethoven's short violin notes" is the *rough* column: quavers of 0.14 s whose attack
takes 35 ms or more to become periodic (5.4 % and 10.4 %). They are not an octave low: there is as much between
the octave below's harmonics as on them. Guettler and Askenfelt (1997, JASA 101) put the acceptable length of
such a transient on a violin at about 50 ms; the worst here are 50–80 ms at ff.

**What does read an octave low is a ring.** All 55 readings were on those frequencies before the note began.
The Haydn's C5 at 173.13 s follows a G5: the bowed A string is clean from 30 ms (its own harmonics 50 dB, the
octave below's 20 dB), while in the sound the G5 still rings at 24–30 dB against the C5's 16–24 dB. G5 is the
third harmonic of C4 and C5 its second: together they are heard as C4. Two things make it so loud:

1. **An open string in tune with the note rings as hard as the bowed one.** While G5 is bowed, the open G string
   (its fourth partial) carries a wave 12 dB under the bowed string's, and goes on once the bow has left: the
   tail of a short G5 is 1–3 dB down after 50 ms, 10–12 dB after 200 ms, 19 dB after 500 ms (F5, which rings
   nothing: 35 dB after 100 ms). Against the Iowa violin (`strings-tails.ts`, the fall from 10 to 30 dB under
   the held note, medians): the recording 0.41 s after notes that ring an open string (10 notes) and 0.47 s
   after the rest (36); the model **1.13 s** and 0.29 s.
2. **C5–E♭5 are weak.** Against the recording at ff: C5 −5.1, C♯5 −6.3, D5 −10.1, E♭5 −5.5 dB (mf: −3.7, −3.1,
   −1.1, +1.2), under the fitted 566 Hz band (−16 dB) beside the narrow B1+ (540 Hz, Q 45).

**Tried: the idle open strings loosely coupled** (`idleCoupling`, the cello's and the bass's mechanism; the
ratio from the tails: 0.5 → 0.98 s, **0.3 → 0.43 s**, 0.2 → 0.18 s, against the recording's 0.41 s), with the
bands refitted (`fit-bodies.ts violin --levels 6 --iters 5`):

* the tail after a short G5: 25 dB down at 100 ms (was 6–10); A5 30 dB at 200 ms (was 17–19; the recording's 26);
* the test notes: octave-low readings of the sound 18 of 1 404 → 4; **the pieces: 55 → 49** (Beethoven's second
  violin 21 → 25);
* the judge: NO CLEAR CHANGE each time, held-out Δ −0.21 unrefitted; −0.15, −0.12, −0.01, −0.18 refitted (bow
  speeds kept; refitted; with the high-frequency path; the level rows doubled); +0.01 and +0.02 with B1+ at η
  0.045 and 0.07 (each ± 0.13–0.16). The third refit run again after a change of 4 parts in 10⁵ in the
  coupling's first 0.1 s gave −0.22: a re-roll of the strings' chaotic regimes moves the score as far as the
  change does;
* levels: A5 at mf from +6.3 to +9…+10.7 dB over the recording's, short G5 and A5 5–8 dB over their neighbours
  (they had been notched level with them); the C5–D5 hole unchanged (−7.6, −9.4, −9.4 dB at ff).

**Left as it is.** The pieces' readings do not move, the judge cannot tell it from noise and two notes get
hotter: by this round's rule (measured better, nothing worse) it is not a fix. The violin's body was fitted
around the open strings' notches, so loosening them needs the body refitted in the same step, with what the
bands cannot do: the B1 modes themselves (540 Hz on C5–C♯5) fitted against the level curve. That is a body
round, not an audit. The engine is untouched for the violin: its judge and golden are identical.

Clips: `violin-c5-d5-before.mp3` (above), `violin-haydn-before.mp3` (the Haydn's first violin, 164–176 s, with
the C5s after G5 at 165.9 and 173.1 s), each with its spectrogram. Both engines render them the same.

## 2. The viola: its neighbours were weak (`bowed.ts`, `bowed-fit.json`)

Is the real viola hot at A♯4? No, and neither was the model's A♯4. Held as the judge holds a note (mf, dry),
model − recording with the curves laid over each other, and each note over its neighbours
(`strings-levels.ts viola`):

| mf | F♯4 | G4 | A♭4 | A4 | **A♯4** | B4 | C5 | C♯5 | D5 |
|---|---|---|---|---|---|---|---|---|---|
| model − recording, before | −3.6 | **−10.9** | −2.0 | **−10.9** | −2.2 | **−9.3** | **−8.6** | −3.2 | (no pitch found) |
| after | −3.9 | +3.7 | −4.4 | −5.0 | −2.7 | −6.5 | −3.5 | −6.1 | −3.4 |
| over its neighbours: recording | +3.8 | −2.6 | −1.5 | −0.8 | **+3.3** | +0.7 | −4.9 | +6.2 | −5.9 |
| model before | +1.4 | −10.6 | +3.8 | −6.1 | **+9.8** | −1.6 | −10.9 | +7.1 | · |
| model after | −0.7 | +5.0 | −4.1 | −3.0 | **+5.3** | −0.3 | −2.3 | +5.0 | −5.5 |

At ff: G4 −8.4 → +1.6, A4 −5.0 → −4.6, A♯4 +0.2 → −1.5, B4 −7.2 → −6.7; A♯4 over its neighbours +5.6 → +3.6 (the
recording's +0.8).

**The cause.** The viola's idle open strings were coupled to the bridge whole (the round-2 junction). One in tune
with the note bowed beside it pins the bridge at that partial, a tuned absorber: G4 (the open G's octave), C5
(the open C's fourth partial), D5 (the open D's octave; at mf the analysis found no pitch in it), C4, G5, A5
played 6–13 dB under their neighbours. The bands, fitted to the even notes around those holes, sat 13–15 dB down
from 400 to 566 Hz and left A4 and B4 (odd, held out of the fit) as far under. A♯4, on the narrow B1+ (465 Hz),
was the one note of the region at the recording's level. The same strings rang on after the bow: 1.73 s from
10 to 30 dB under the held note, the Iowa viola's 0.35 s. The cello met this in its v2 (`idleCoupling`: "the
octave above each open string came out 5–11 dB weaker than its neighbours … which the Iowa cello does not
show").

**The fix.** `idleCoupling: 0.2` for the viola, the ratio whose tails are the recording's (`strings-tails.ts viola
--idle 0.5,0.3,0.2`: 1.77, 0.52, **0.32 s** against 0.35 s; the cello's fitted ratio is 0.306), and the bands
refitted with it (`fit-bodies.ts viola --levels 6 --keep-speed --keep-hf --iters 4 --write`: the level rows as
in audit 2, bow speeds and the high-frequency path kept). No notch, no EQ: the modes are as they were.

| viola, model − recording (dB RMS over the recorded notes) | pp | mf | ff |
|---|---|---|---|
| all notes, before → after | 4.90 → 3.64 | 5.21 → 4.06 | 4.17 → 3.45 |
| the held-out (odd) notes | 3.84 → 3.28 | 6.14 → 4.45 | 4.90 → 3.59 |
| each note over its neighbours, model against recording | 4.84 → 4.02 | 4.59 → 3.96 | 3.69 → 3.11 |
| notes more than 5 dB off | 6 → 4 | 8 → 6 | 6 → 3 |

* The tail after a note that rings an open string: 1.73 → 0.32 s (recording 0.35 s). A short D5 (v100): 13 →
  42 dB under the note 0.3–0.5 s after the bow; G4 12 → 26 dB.
* **Judge: viola NO CLEAR CHANGE**, held-out 4.42 → 4.29 (Δ +0.13 ± 0.18), fit half 4.03 → 4.03; harmonics
  10.06 → 9.59 dB, noise 7.78 → 7.13 dB, attack 1.02 → 0.69 oct, pitch 1.11 → 1.09 ¢, centroid 0.54 → 0.63 oct
  (half a spread: the guard holds). No guard broken. **Violin, cello, bass: identical** (Δ 0.00 ± 0.00).
* Also tried: B1+ damped (η 0.05) with the refit: held-out 4.19 but the centroid guard broken (0.68); B1+ and
  B1− damped (η 0.05, 0.045): held-out 4.20, no guard broken, levels mf 3.94 / ff 3.73 dB (mixed against 4.06 /
  3.45). Not kept: the coupling alone does it, and the modes stay the literature's.
* Levels by dynamic (`audio-levels.ts`, the centre ± 7 semitones, held): pp −28.3 → −28.7, mf −20.1 → −19.8,
  ff −12.1 → −13.5 LUFS. **In a piece the viola is louder**: the Haydn's viola line (60–72 s) −23.3 → −20.4 LUFS,
  its G's, C's and D's no longer notched. In the Orchestra's mix that is the viola 2–3 dB forward in G and C
  major; its own limiter is far off (peak −10.8 dBFS).
* The pieces' viola parts, single notes: octave-low (ring) readings in Beethoven 5 I 25 → 17 of 715, Haydn 1 → 1.
* In a file's short notes the step is smaller than held: `viola-scale` (F♯4–D5, 0.6 s each): A♯4 over A4 and B4
  7.3 → 6.7 dB at mf, 2.6 → 1.4 at ff; G4 over its neighbours +0.2 → +4.9 (mf), −6.5 → +4.4 (ff). At mf A4 (the
  open string) and B4 are still 9 dB under their held level 0.3–0.6 s in: the viola's fitted attack (below).
* Golden: unchanged (it has no viola; violin, cello and bass are untouched). Tests: `packages/engine/test/audit3.test.ts`
  (A♯4 no more than 7.5 dB over A4 and B4: 9.8 before, 4.8 after; G4 no more than 6 dB under F♯4 and A♭4: 11.8
  under before, 4.2 over after; the tail after D5 25 dB down: 13 before, 42 after), under 2 s in all; `cello.test.ts`
  now says which instruments couple their idle strings loosely.

Clips: `viola-scale-before/after.mp3` (F♯4 to D5, mf then ff), `viola-haydn-before/after.mp3`, with stacked
spectrograms (before over after).

## What remains, and why

* **The violin's ring and its weak C5–E♭5** (above): the cause is the same as the viola's, but its body was
  fitted around the open strings' notches and loosening them alone is no better by the judge or in the pieces.
  Needs the coupling, the bands and the B1 modes fitted together against the level curve and the tails.
* **The viola speaks slowly in short notes.** Its attack (0.2 s at pp to 0.12 s at ff, fitted to the Iowa long
  tones, whose player starts each softly) is the same for a quaver: 371 of the 715 single viola notes of
  Beethoven 5 I (52 %) are rough for a quarter of their length, before and after. A file tells the bow each
  note's length; a planned short note could be given an attack that is a share of it, as the winds' tongue is
  (`mono.ts`), leaving the keys' path as it is. Not done: it is a third item, and it changes the cello and the
  bass too.
* **The violin's loud attacks**: rough for 15 ms (median), 50–80 ms at worst, 5–10 % of Beethoven's quavers for
  35 ms or more. Under Schelleng's maximum throughout but for the first 5 ms; no shorter with what was tried
  here (nothing was: the string's motion is right once it settles, and the limit is the bow's 45 ms rise).
* The viola's B4 (−6.5 dB) and C♯5 (−6.1 dB) at mf, E3 (+7.2 dB): the bands' half-octave grain.
* The idle strings' coupling glides to its rest with a 10 ms time constant from the moment an engine is made
  (viola, cello, bass): a note begun 0.1 s later, as the judge's are, meets it 4 parts in 10⁵ from its rest.
  Starting it at rest would re-roll the cello's and the bass's fitted notes (it moved the violin candidate's
  judge by 0.2); left.

## Reproduce

```sh
B=<checkout of a561109>/packages/engine/src/core/index.ts
npx tsx scripts/strings-octave.ts violin --grid --pieces beethoven5-i,toward-morning,haydn [--engine $B] [--list]
npx tsx scripts/strings-octave.ts viola [--engine $B]
npx tsx scripts/strings-levels.ts viola [--engine $B]          # violin too
npx tsx scripts/strings-tails.ts viola --engine $B --idle 0.5,0.3,0.2   # violin too
npx tsx scripts/fit-bodies.ts viola --levels 6 --keep-speed --keep-hf --iters 4 [--write]
npx tsx scripts/judge.ts --instrument viola --before $B         # violin, cello, bass
npx tsx scripts/audio-levels.ts --only viola [--engine $B]
npx tsx scripts/render-audio-audit-3-strings.ts --before $B
npx vitest run packages/engine
```
