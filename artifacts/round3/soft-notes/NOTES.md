# Soft notes (2026-11-15)

Where the pieces written for this page had to work around the engines: soft double-reed notes on the wrong
register, the piano's soft treble, the clarinet's notes about its break. Before is `main` at 176c3ff;
after is this branch.

## The double reeds' registers: a player's ear (`core/register-ear.ts`)

A conical bore's resonances are harmonic, so a soft note's octave is as stable as the note. How the note
begins decides which it keeps, and the oboe's low register played softly and joined landed on its octave
half the time. The player now hears the note on another regime and puts it back, as an oboist does in a few
tens of milliseconds. The reed's pressure is checked against the note's own frequency (the oboe) or for its
odd harmonics (the bassoon). Once the note has spoken and stopped swelling, a wrong regime held for 40 ms
gets the bore's last round trip rewritten as one period of the note. This only happens with `human` over 0;
at `human` 0 the engine is bit-identical (`same-sound-human0.txt`).

| | before | after |
|---|---|---|
| soft low oboe phrase (`oboe-soft-low`, v46): notes off their pitch | 8 of 15 | 0 of 15 (2 with no clear pitch either way) |
| the same at v56 (`oboe-soft-low-p`) | 8 of 11 | 0 of 11 |
| oboe, 1.5 s notes at v40–90, cracks over 10 ms: slur / join / after 50 ms | 55 / 57 / 63 of 448 | 0 / 1 / 10 |
| oboe from silence, off their pitch over the second half: 280 ms / 500 ms / by hand | 8 / 8 / 9 of 216 | 7 / 0 / 8 |
| bassoon, the same: slur / join / after 50 ms | 21 / 32 / 70 of 448 | 9 / 22 / 57 |
| bassoon from silence: 280 ms / 500 ms / by hand | 4 / 4 / 5 of 258 | 4 / 0 / 4 |
| budget (`soft-notes.test.ts`): oboe B♭3–C♯5, bassoon C2–C4, v44 and v60, alone / joined / slurred, 1 s | oboe 7 of 96, bassoon 8 of 78 | 0 of 96, 2 of 78 |

The bassoon listens for the octave alone. Listening for its fundamental, as the oboe does, took correct
soft low notes for wrong ones (their fundamental is weak on their own register too). The ear's nudge then
set them on a louder branch, 3–4 dB over. Its two remaining notes (F♯2 joined, 1591 ¢; A♭2 alone, 874 ¢)
are regimes off its harmonics.

Things that were tried on the way and left:

* Seeding the fundamental at the tongue's release, or carrying the old note's wave into the new tube (the
  flute's `CARRY`), moved the counts by a few.
* A nudge added to what was in the bore held a strong squeal on (the bassoon's E2).
* A nudge of twice the oscillation's amplitude lifted correct soft notes 3–4 dB.

## The piano's soft treble (`Calibration.lift`)

F6–C8 stood 6.6 dB under the Steinway at pp and 2.8 dB under at mf, and level at ff (`scripts/piano-judge.ts
--table`, fit keys). A soft treble stroke is now quicker by 6 dB of hammer velocity at velocity 1. The lift
fades as (1 − x)² to nothing at 127.

* On the fit keys: pp −6.6 → +0.2 dB, mf −2.8 → +0.2.
* On all 88 keys: NO CLEAR CHANGE, held-out 3.00 → 3.04 (Δ −0.03 ± 0.03). Level 4.16 → 3.92 dB, partials
  8.60 → 8.52, brightness 0.45 → 0.47 octave (`judge-piano.txt`).
* Kept for the level, and said so in `docs/CALIBRATION.md`.

Clips: `piano-soft-treble.mp3` (F6–C8 at velocity 40), `piano-soft-treble.png`.

## The clarinet's break (`vent`)

G♯4–B4 concert stood 4–7 dB over the recording beside their neighbours, at every dynamic. These are the
notes the register key's one vent serves worst. A −4.5 dB dip there, 1.6 semitones wide, set on the fit
notes G♯4 and B♭4:

* NO CLEAR CHANGE, held-out 1.95 → 1.91 (Δ 0.03 ± 0.02), level 2.47 → 2.28 dB (`judge-clarinet.txt`).
* At pp, G♯4 / A4 / B♭4 / B4 went from +5 / +6 / +6 / +5 to +3 / +2 / +2 / +3 (`levels-clarinet-*.txt`).

Clip: `clarinet-break-mf.mp3`.

## Not changed, and why

* **The viola's G4** (+4 dB over the recording at mf, F♯4 −4) and **the double bass's D2–D♯2** (−6 to −9 dB
  at mf) sit inside bodies fitted band by band. Each band averaged with its neighbours (as the piano's EQ
  was) was judged WORSE: viola 4.30 → 4.45, bass 1.83 → 2.14, without moving the notes. A correction for one
  note would be fitted on a held-out note, so they are left, measured.
* **The clarinet's render-to-render level** (6 dB between two renders of one soft G4 in Seeds) was not
  reproduced. Held, the note is within 1.2 dB across five contexts and three players. Under a swell, four
  players are within 2–3 dB at the same point of it.
