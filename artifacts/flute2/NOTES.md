# Flute: the "MIDI-like" sound on fast switches

Stephen, 13 Nov, after #77:

> Playing notes in isolation is fine but when you quickly switch notes it seems that there's a very MIDI-like sound that plays sometimes (doesn't seem super deterministic).

## The cause

When the flute starts a note, it aims its air jet extra sharply for the first tens of milliseconds (`ATTACK_BOOST` in `flute.ts`: up to 5× the jet's normal gain, and up to 13× for a short note a file plays, `QUICK_AIM`). That extra aim exists so that a **silent** tube starts sounding as quickly as a real flute does. It fades out over time on a fixed schedule, and nothing else controlled it.

From silence that works: the tube's sound is still small while the aim is strong. On a tube that is **still ringing**, it doesn't. The new note reaches its full sound within a few milliseconds while the jet is still aimed 2–5× too sharp. The jet is then thrown fully into and out of the tube every cycle and cuts the airflow off in a square wave. The result:

- the odd harmonics 10–19 dB over the note's own
- the level 2–5 dB over the note's own
- for 60–150 ms: a buzzy, synthetic note, like a cheap synth's square-wave flute patch

**Why it sounded random.** Whether the tube was still ringing depended on the timing of the hands. A key let go and the next pressed 3–60 ms later gave the buzz, but only if the last note had already sounded 120 ms. The model keeps a note's breath on for its first 120 ms (`MIN_BLOW`), so a note let go sooner was re-tongued over a breath that never stopped (clean). A note let go later had its breath stopped and was then attacked as if from silence on a tube that was still ringing (the buzz). Live keys also reach the worklet only between 128-sample render blocks, so a key-up and the next key-down sometimes land on the same instant (a cleaner path) and sometimes not. Overlapping notes (slurs) never get the extra aim and were always clean.

A note alone is fine because it starts from silence: that is what the attack was fitted on.

**File playback had it worse.** Every short detached note in a MIDI file gets the larger quick-note aim (`QUICK_AIM`), and 374 of 397 such notes buzzed. The golden test's flute passage (three notes of 260 ms, 40 ms apart, by hand) was this exact case, so the snapshot had been blessed with the buzz in it.

## The fix (`packages/engine/src/core/flute.ts`, `AIM_FULL`)

The extra aim is never more than the sound already in the tube leaves room for. If the tube is already at a share *s* of the full wave this note settles at, the jet's gain is capped at 1/*s* of its normal value. So the jet is never thrown further than the note's own full sound throws it. From silence (*s* ≈ 0) the cap does nothing; as the tube fills, the extra aim gives way.

The note's full wave is measured, not tuned: the bore's peak `level` once settled grows as the jet's flow (`velScale` × expression × breath) to the power 0.7. Over that power it is 11 from C4 to C5, 8.6 at C6 and 6.6 at C7. Every note from pp to ff, at 44.1 and 48 kHz, is within 20% of that line (`npx tsx scripts/flute-tube-full.ts`). The line is set on the low side, so the cap cuts in slightly early rather than late.

**Exception:** a note from silence with nothing told ahead (a key in the hand) keeps its attack exactly as it was. That is the long tone the voicing was fitted on and the judge hears, so it stays bit-for-bit identical. The vent hole (`VENT`) already makes the same exception.

## Measured

`npx tsx scripts/winds-switch.ts [--told --exact] [--params '{"human":0}'] --engine <old>` renders 60 random passages of 14 fast switches each. The switches are steps, thirds, fifths and octaves (a third of them across a register break), held 40–260 ms, and the next key comes 70 ms before the last is let go up to 130 ms after it. A sixth of them land on the same instant. Velocities are spread as the pointer gives them. Live keys are snapped to the 128-sample quantum.

Every note's start is compared with the same note's steady sound, told ahead so a vented note has its vent. "Square" means time where the odd harmonics stand 6 dB or more over the even ones, relative to the note's own steady sound, and the sound is brighter, within 10 dB of the note's level.

| 780 notes each | square > 20 ms | longest | level over the note (median) | speaks (mean) | wrong register > 5 ms |
|---|---:|---:|---:|---:|---:|
| by hand, before | 420 | 168 ms | +2.0 dB | 12.9 ms | 2 |
| by hand, **after** | **25** | **48 ms** | **+0.3 dB** | 12.9 ms | 2 |
| as a file plays them, before | 484 | 212 ms | +2.9 dB | 9.5 ms | 3 |
| as a file plays them, **after** | **1** | **40 ms** | **+0.3 dB** | 9.5 ms | 2 |
| by hand, player off (`human: 0`), before | 404 | 148 ms | +1.1 dB | | |
| by hand, player off, **after** | **16** | **48 ms** | **−0.4 dB** | | |

The model alone (player off) has the same bug, so the player is not involved.

By hand, before the fix, by how the note came: pressed after the last was let go, 315 of 393 buzzed; pressed on the same instant, 96 of 127; slurred, 9 of 260.

Unit test: `packages/engine/test/flute-switch.test.ts` (4 cases, under 2 s). All four fail on the old engine and pass now. They cover:

- by hand, gaps of 3–60 ms, player on and off
- either side of the 120 ms shortest breath
- the same-instant swap
- a file's 140 ms notes from silence

## Unchanged

- **Notes alone by hand**: bit-identical at 22.05, 44.1, 48 and 96 kHz, player on and off (`scripts/winds-alone-same.ts`).
- **Judge** (`scripts/judge.ts --instrument flute`): NO CLEAR CHANGE, held-out Δ 0.00 ± 0.00.
- **Legato audit** (`scripts/winds-legato.ts`, 3024 pairs told ahead and 3024 by hand):
  - speaking time the same (told: median 8–9 ms, p90 15–16; by hand: p90 45 → 42 ms joined, 46 → 42 after a rest)
  - no wrong registers; the same holes
  - the attack's steepest rise is gentler (after a rest 2.8 → 1.8 dB/ms told), which is the overshoot gone
- **Glides**: time between pitches per note, mean 5.9 → 6.2 ms (the median change 0).
- **Golden**: `flute.json` re-blessed. The golden passage is the bug's own case; its loudness envelope moved 1.34 dB RMS. `cello.json` and `trombone.json` were also rewritten by `UPDATE_GOLDEN`, from drift that was already on `main`; I put them back.

**One regression to know of.** In `winds-legato.ts --fresh` (every note alone, told ahead, 666 notes), G5 pp told as 140 ms long is now 50 ¢ off over its second half (0 of 666 before, 1 now). It is a marginal note either way: its two modes compete and its pitch swings ±200 ¢ for its first 100 ms on both engines. It reached its pitch at ~105 ms of its 140 before and at ~120 ms now. Giving the jet more room to fix it (up to 1.5× or 2× the full note's swing) brings the buzz straight back: as a file plays them, 1 → 89 and 329 notes with a square stretch over 20 ms.

**Left as it is.** The loudest notes alone from silence have a little of the same overshoot: C5 ff and A6 f run about 2 dB over, with odd harmonics 7–8 dB over, for some tens of milliseconds. They are kept bit-identical because they are what the judge is fitted on, and Stephen hears notes alone as fine.

## The other winds and brass

The same sweep, 25 passages each, by hand and told ahead:

| | square > 20 ms (of 325) | note |
|---|---:|---|
| oboe | 9 / 9 | no overshoot; its square time is no more than its own attack from silence has |
| clarinet | 0 / 0 | |
| bassoon | 27 / 16 | spread evenly over slurs, swaps and gaps; the worst are its known two-regime register cracks. Its attack boost is 0 |
| trumpet | 0 / 1 | its level rises 1–2 dB over steady from silence too |
| horn | 4 / 4 | slurs only |
| trombone | 3 / 2 | |
| tuba | 10 / 7 | its +5–7 dB peaks are its own envelope: a note from silence climbs the same |

None of them has the flute's bug. The reeds' attack boost is small (oboe ×1.3, clarinet ×1.18, bassoon none) and widens the reed opening rather than aiming a jet. The trumpet's ×2.5 on the lips doesn't saturate the same way, and the horn and tuba share its kind of attack. Nothing was changed outside the flute.

## Clips (`artifacts/flute2/`)

The same passages through the old engine and this one, through the room, with the player on (`npx tsx scripts/render-flute-switch.ts --before <old>`).

| clip | what | notes with a square stretch over 20 ms, before → after |
|---|---|---|
| `keys-{before,after}.mp3` (27 s) | the computer keyboard: runs, arpeggios, trills and leaps over both register breaks; velocity 84; the next key pressed before, with, or 4–70 ms after the last is let go | 99 → 2 |
| `pointer-{before,after}.mp3` (15 s) | the on-screen keys: four drags (each key let go as the next is reached) and 40 taps at random depths | 57 → 1 |
| `random-{before,after}.mp3` (36 s) | the sweep's random passages, one after another, about 165 switches (the "many switches" clip) | 80 → 8 |
| `golden-{before,after}.mp3` (4.5 s) | the golden passage in three registers | 6 → 0 |
| `file-{before,after}.mp3` (10 s) | detached short notes as a file plays them | 46 → 0 |

`keys.png` and `golden.png` are spectrograms with the old engine on top. `index.json` has each clip's numbers.

To listen: `keys` first, around 0:02–0:06. In the before clip the notes that come just after a key is let go are buzzy and brighter than their neighbours; after, they match.
