# Audio audit, round 2: every instrument and the Orchestra again

Brief: `.audit2/BRIEF.md` (Stephen: "please audit all the instruments again. I think there's still more to
fix."). Branch `improve/audio-audit-2` from `d59362f` (round 1 = #50), rebased on `8ae1bdf` (#51 and #53 og media, #52
performance: none touches the engine or the Orchestra's sound). `before` below is `d59362f`'s engine, `after`
this branch. Everything was measured on both with the same stimuli and scripts; nothing was tuned by ear.

Wind and brass note overlap, legato and repeated-note handling stay with `improve/winds-midi`. That branch and
this one agreed (by message) that the bassoon's register and the trombone's level are this branch's; neither
touches the other's code in substance.

## How it was measured

Round 1's tools, re-run whole: `scripts/audio-audit.ts` (every instrument, range walks pp/mf/ff, a fast legato and
detached passage, repeated notes, extremes, chords, controller swells, aliasing at 22.05/44.1/48/96 kHz; peak,
BS.1770 loudness, the core limiter's cut, clicks, one-sample jumps at events, non-finite samples, DC, each block's
cost) at 48 and 44.1 kHz, `scripts/audio-levels.ts`, `scripts/render-orchestra.ts`, `scripts/judge.ts`.

New in this round:
* `scripts/render-audio-audit-2.ts`: the ten before/after clips below, each with its own number;
* `scripts/render-orchestra.ts` meters each part's own limiter, and `--post-bus` renders the old gain staging;
* `scripts/fit-bodies.ts --mode i:eta[:rad[:f]]`: a signature body mode's damping, radiation and frequency, with
  the bands refitted around it;
* scratch probes, whose numbers are quoted here: per-note levels, release tails, subharmonics per note of a
  file's line (with the bow foreseen, as the browser plays a file), the bassoon's register over eight start
  times, block cost and subnormals in a 30 s tail.

## Findings, ranked

| # | What | Before | After | |
|---|---|---|---|---|
| 1 | **Violin and viola A0 boom** (C4, C♯4; viola A♯3, C♯4) | violin C♯4 **+23 dB** over B3/D4, C4 +15 (dry, ff); its limiter −10.5 dB in the ff walk (44.1 kHz), −12…−14 dB on C♯4; viola +12 dB | C♯4 +8, C4 +4; ff-walk limiter −1.2 dB; viola within 2–3 dB | fixed |
| 2 | **Bowed tails came back** 0.3 s after the note-off (new) | the tail's rise in 50 ms: violin D5 +8 dB, E4 +9, viola C4 **+14.7** (as played) | +1.1, +0.6, +0.6 | fixed |
| 3 | **Trombone level** | solo 12 dB under the trumpet at ff, 18 at mf (−23.1 / −32.9 LUFS) | −14.1 / −23.9 LUFS (3 dB under the trumpet at ff) | fixed |
| 4 | **Orchestra gain staging** (new) | parts working their own limiter in 6 of 9 lineups rendered, while the mix sat 2–10 dB under the bus limiter | in none; the Air (4 trombones) unchanged | fixed |
| 5 | **Timpani level** (new) | a forte roll 8 dB under the trombone, 3.6 under the cello | 1 dB under the trombone, 6.4 over the cello | fixed |
| 6 | **Flute at 22.05 kHz**, top register | 19 of 74 notes (C4–C7, v40/v100) on another mode, 2–17 semitones off; in-tune ones up to 36 c | 0 of 74; worst 3 c (as at 44.1 kHz) | fixed |
| 7 | **Violin quarter notes an octave low** (Toward Morning) | Violin I 5 of 331 notes, Violin II 15 of 431 with the octave below within 12 dB of the note (D5s: the open D string ringing under them) | 0 of 331, 2 of 431 | fixed (by 1) |
| 8 | **Trumpet pp onsets** | 4 note-ons over 2× (48 kHz, worst 2.63×), 3 at 44.1 kHz (3.1×) | 0 (worst 1.08×, 1.15×) | fixed |
| 9 | **Float32 subnormals** out of six instruments' tails (new) | 124 000–160 000 a note (piano, flute, oboe, horn, trumpet, timpani) | 0 | fixed |
| 10 | **Bassoon register** | 19 of 992 held notes (B♭1–E4, v40–127, 8 start times each) settle on another mode at 0.9 s, by when the note began; D3 2–4 of 8 | unchanged | left (below) |
| 11 | Bowed bow-lift steps | 2.0–2.6× at −29…−56 dBFS on some note-offs (cello, bass) | same class (cello passage 1.77 → 2.16, bass 2.27 → 2.01) | left (below) |
| 12 | Trumpet's own limiter at ff | −3.4…−4.3 dB, 46 % of the ff walk's blocks | unchanged | left (below) |
| 13 | Viola A♯4 (B1+ at 465 Hz) | +8 dB over A4 and B4 (dry, ff); the recording is flat there | unchanged | left (below) |
| 14 | Trombone legato passage | one jump 2.1–2.3× in the slurred run | unchanged | `improve/winds-midi` |

Measured and clean: no non-finite samples anywhere; no DC; the piano's voice stealing; block sizes bit-identical
(128/37/500, and the flute's new wrapper at 128/37); no denormal slowdown (each block's cost late in a 30 s tail
equals its cost early, 34–77 µs at 48 kHz); the oboe, clarinet, horn and bassoon have no event over 2× at either
rate. Unchanged instruments measure exactly as before (`summary.json`).

## The round-1 leftovers, one by one

Each has a clip, `<name>-before.mp3` / `<name>-after.mp3` with a spectrogram `.png` (0–16 kHz), as played: the
room on, the playback gains, the Orchestra's bus where the clip is a lineup. `clips.json` has each clip's number.

| Leftover | Clip | Before | After | |
|---|---|---|---|---|
| Trombone overall level | `trombone-level` (the trumpet's phrase, then the trombone's, mf and ff) | trombone −24.6 LUFS vs trumpet −12.7 | −15.8 vs −12.7 | fixed (3) |
| | `brass-chorale` (trumpet, horn, trombone, timpani on one bus) | at the bus: trumpet −20.2, horn −20.0, trombone **−34.0**, timpani −36.7 dBFS RMS | −25.9, −25.7, **−30.7**, −35.4 | |
| Violin C♯4 body resonance | `violin-a0` (G3–F4 chromatic, ff) | C♯4 +6.4 dB over B3/D4 as played (its limiter taking the rest) | +1.9 | fixed (1) |
| | `viola-a0` (F♯3–D4, ff) | A♯3 +7.0, C♯4 +7.0 dB over their neighbours | −2.2, −0.9 | |
| Trumpet pp onsets | `trumpet-pp` (F♯3 up by whole tones, pp, each over the last one's tail) | worst note-on step 2.77× the steps around it | 0.42× | fixed (8) |
| Bowed note-offs | `bowed-releases` (violin D5, E4, viola C4 held 1.2 s, let go) | the tail rises 8.0, 9.0, 14.7 dB | 1.1, 0.6, 0.6 dB | fixed (2); the bow-lift steps left (11) |
| Flute top register at 22.05 kHz | `flute-22k-top` (C6–C7 at 22.05 kHz) | 4 of 8 notes sounding another note | 0 of 8 | fixed (6) |
| Violin octave-low notes in MIDI playback | `violin-quarters` (A5 F5 D5 / B♭5 G5 D5 in quarters, v84–104, the bow foreseen as in a file) | the D5s' octave below at −14.4 dB re the note | −23.4 dB | fixed (7) |
| Bassoon octave check | `bassoon-register` (B2 twice, D3 twice, each begun 14 ms later the second time; A3) | odd harmonics re all: B2 −4 / −0 dB, D3 −9 / −4, A3 −5 | identical | left (10); A3 is the bassoon's own colour |
| (Timpani, new) | `timpani-level` (forte: the cello's D3, a timpani roll, the trombone's D3) | cello −23.4, roll −25.0, trombone −25.0 LUFS | −23.4, −18.0, −16.0 | fixed (5) |

The Orchestra, before/after (`orch-beethoven5-i-*.mp3`, `orch-air-*.mp3`, `orch-orchestra-*.mp3`: the first 25 s),
in its own section below.

## What was wrong, and the fixes

### 1. The violin's and viola's A0 (`bowed.ts`, `bowed-fit.json`)

The bodies (NEXT5, #18) were fitted to each recorded note's harmonics, never its level, and the Iowa violin has
no C4 or C♯4 (nor the viola its C4/C♯4). A band of +12 dB at 283 Hz (the viola's +27 dB) sat on top of the A0
mode (275 Hz violin, 230 Hz viola, Q 25). Dry, ff, held: the violin's C♯4 played 23 dB over B3 and D4 and C4 15 dB;
its own limiter took 12–14 dB off it. A♯3 and A♯4 sat 8–9 dB over their neighbours on the narrow B1− (465 Hz).

Refitted with the level rows the double bass already used (`--levels 6`). That alone left the band at +13 dB: the
recordings' D4 fundamental asks for it, and with A0 narrow at 275 Hz, C♯4 sits on the peak. A grid over A0's
damping (η 0.04–0.15), radiation (1–0.2) and frequency (275–290 Hz), the bands refitted each time, left the fit
half indifferent (recording − model 7.8–8.3 dB, levels' spread 3.7–5.4 dB): no recorded note sits on A0. So the
values were chosen by the one measured thing that bears on it: the Iowa cello's own A0 note (G♯2) stands 6–10 dB
over its neighbours. A0 η 0.08, radiation 0.3 (violin and viola), B1− η 0.045 (violin): violin C♯4 +8 dB, C4 +4,
A♯4 +5; viola within 2–3 dB. The bands came down with it (violin 283 Hz +12 → +7.5 dB, viola +27 → +11.5).

Judge, held-out notes: **violin NO CLEAR CHANGE** (2.98 → 3.03, Δ −0.06 ± 0.10; harmonics 9.15 → 8.68 dB),
**viola NO CLEAR CHANGE** (4.56 → 4.58, Δ −0.02 ± 0.13; harmonics 10.17 → 9.92 dB, attack 0.98 → 0.92 oct). No guard
broken. A viola variant with B1+ damped too (η 0.045) flattened its A♯4 but fitted the fit half worse (4.43 vs
4.28): not kept (13).

Each voice's held level at its centre ±7 semitones (`audio-levels.ts`): violin pp/mf/ff −33.7/−25.3/−14.8 →
−32.5/−24.6/−12.4 LUFS, viola −28.3/−19.5/−12.3 → −28.3/−20.1/−12.1. A range walk is quieter (violin pp −7.4 dB)
because its loudest notes were the booming ones.

### 2. A released bowed note's tail came back (`bowed.ts`, `FINGER_LIFT`)

New in this round. 0.3 s after the bow left a stopped string, the finger was lifted at once, and a tail 20–27 dB
down rose again by 7–15 dB (with vibrato, as played: violin D5 −27 → −20 dB re the held note, viola C4 −27 → −13).
The cause: a note in tune with an open string's partial (D5 with the open D's second, C4 with the viola's open C)
rings that string in sympathy, and the two ring on as a pair whose forces at the bridge nearly cancel, the
aftersound of two unison piano strings (Weinreich 1977). Lifting the finger ended the pair and the open string was
heard whole. Lifting it later (1 s, 2 s) only moved the jump; damping the stopped string as it lifts did not stop
it either, since the partner holds the energy. The finger now stays down while the string rings and lifts once
the ring is 60 dB under its level as the bow left, damping what is left (40 dB over 40 ms). Every tail measured
decays without a step (largest rise 1.1 dB); the pair's ring dies away together, as it does under a player's
finger.

Judge: cello NO CLEAR CHANGE (1.85 → 1.85), bass NO CLEAR CHANGE (1.89 → 1.89); violin and viola as above.

### 3–5. The trombone's and the timpani's levels, and the Orchestra's gain staging

**The trombone** was matched to the Iowa trombones, whose ff sits 9 dB under the Iowa horn's and trumpet's: the
sessions' microphone gain (the horn, trumpet and bassoon sessions agree within 1 dB). Round 1 gave it the 9 dB back
when played and reverted it: the Air (four trombones) then had each part on its own limiter and the mix at
+2.2 dBFS. The trombone's crest factor is the recordings' (13.8 dB modelled, 16.9 recorded, ff; the trumpet's 9.6
and 9.7), so at a trumpet's loudness its peaks run 4 dB higher. Two gain-staging faults made the Air fail:

* **The bus counted parts, not their levels.** It was 1/√n. It is now 1/√(Σ wᵢ²), each part counted by its playback
  level over its calibration (`PLAYBACK_DB`, `instrument.ts`; `busGain`, `orchestra/mix.ts`). A lineup without a
  trombone or timpani keeps 1/√n exactly; four trombones get 0.177, which puts each where it was before its gain:
  the Air's mix is unchanged (peak −2.4 dBFS, RMS −20.3).
* **Each part's limiter acted on the level before the bus,** which then took 3–12 dB off. The limiter now knows
  the bus share after it (`Limiter.bus`; `setBus` in `factory.ts`; `params.bus` in the worklet, sent by
  `ensemble.ts`): it acts on the level heard.

`PLAYBACK_DB = { trombone: 9, timpani: 7 }`, played only. The dry calibration renders, the judge and the golden keep
the fitted level: judge **identical** for both (trombone held-out 3.97, timpani 3.50), golden unchanged.

**The timpani** were fitted at the level of their own session (VSCO 2 CE), which no other instrument here shares.
Orchestral sound powers put timpani 1 dB under the trombone and 10 dB over the cello (Kahle 1995, Table 1, after
J. Meyer 1990: 100, 101 and 90 dB re 1 pW). Measured, forte (a roll on G2, 12 strokes a second, v100, against held
D3s): timpani −23.9 LUFS, trombone (with its 9 dB) −15.9, horn −17.4, cello −20.3. With 7 dB: −16.9. The loudest
stroke (the top drum, v127) peaks at +0.8 dBFS before its limiter, the low drums at −4…−7.

Solo, each voice at its centre (`audio-levels.ts`), pp/mf/ff LUFS: trombone −47.8/−32.9/−23.1 → −38.8/−23.9/−14.1
(trumpet −21.9/−14.5/−11.1, horn −22.0/−17.9/−11.8); timpani −52.1/−41.7/−32.4 → −45.7/−34.7/−25.4.

### 6. The flute at 22.05 kHz (`oversample.ts`, `factory.ts`)

At 22.05 kHz (a headset's rate) the flute's top notes are 11–20 samples long, and its jet, a fraction of a period,
and its bore, one round trip, cannot speak them there; its voicing table did not converge (round 1 kept the rows
it could). Under 32 kHz the flute now runs at twice the host's rate (44.1 kHz, where it was fitted and tuned) and
is brought down by a 95-tap Blackman half-band FIR (flat to 0.4 of the host's Nyquist rate, −74 dB past it;
1.1 ms of delay). A Proxy hands everything else to the inner core and converts only frames and audio; `flute.ts`
is untouched. 22.05 kHz, C4–C7 at v40 and v100: 19 of 74 notes on another mode → 0, in-tune worst 36 c → 3 c. Other
rates: identical (judge identical at 44.1 kHz). Cost at 22.05 kHz: that of 44.1 kHz, plus the filter.

### 7. Violin quarter notes reading an octave low

In Fable's Toward Morning (rendered as the browser plays a file, the bow foreseen) the violins' octave-low notes
were D5s (and A5, D6): the octave below a D5 is D4, the open D string, which the old body's 283 Hz band and A0 rang
under it. The body refit (1) removed it: notes with the octave below within 12 dB of the note's harmonics, Violin I
5 of 331 → 0, Violin II 15 of 431 → 2. Isolated short notes (0.12–0.5 s, three velocities, G3–F♯6, three players
each) had none before or after but 4 of 972 at 0.12 s ff. What the same measure still finds in Beethoven 5's
violins (49 of 1033) and the viola's line in Toward Morning (46 of 994) are double stops: an octave or a fourth
below the measured note, the other note's harmonics on the measured one's subharmonics. Not a fault.

### 8. The trumpet's soft onsets (`brass.ts`)

A note from near silence set the bore's length at once; over what was left of the last note's ring, the read point
jumped through it: at a soft note after another, one sample stepped 0.88 of the steady note's largest step
against 0.05 around it. The attack's brightness filters were tried first and are not the cause. The ring is now laid out again over the new length
(`restretch`, no allocation), so the read goes on from where it was. pp walk: 4 events over 2× → 0 (48 kHz, worst
2.63 → 1.08), 3 → 0 at 44.1 kHz (3.1 → 1.15); loudness unchanged. A note from silence (the bore cleared) is
bit-identical: judge identical (held-out 3.23), golden within tolerance. The change sits in `setNote` alone, clear
of `improve/winds-midi`'s note handling in the same file.

### 9. Subnormals (`post.ts`)

A loud note and 30 s of silence: six instruments' tails wrote 124 000–160 000 float32 subnormal samples into the
nodes after them (the bus, the compressor, the analyser), slow on CPUs that do not flush them. The shared output
stage writes 0 under 1e-20 (−400 dBFS): none now. Dry renders are unchanged.

## Measured and left, with reasons

* **(10) The bassoon's register.** Held notes begun at eight moments 14 ms apart (the reed's flow noise differs):
  19 of 992 (B♭1–E4, v40–127; 28 of 1776 over a wider grid) settle at 0.9 s on their octave or higher. D3 does 2–4
  times in 8; D♯3, A2–B2 about once in 8; E2 at v120 and up. B2 begun at 0.05 s keeps its fundamental 40–57 dB and
  its third 24–40 dB under its strongest harmonic for over a second; begun 14 ms later, it is on its fundamental. Root cause: the bore is two
  delay lines (a cylinder standing in for the cone's missing apex), whose resonances are exactly harmonic, and the
  reed is quasi-static with no dynamics of its own. So the octave regime is as stable as the fundamental and noise
  picks one. Tried, measured, not kept:
  * the apex length 0.15–0.19 m moves the bistable notes about (12–43 of 1776, not monotonic);
  * the walls' loss corner, the reed's ζ and the lowpass make it worse or no better;
  * scaling the turbulence floor by the tongue's opening changes nothing (28 → 28).

  The fix is a model change: the cone's apex as its own admittance (its upper resonances inharmonic), or the reed's
  mass and damping. Either one needs a refit and a judge, beyond an audit. "The bassoon's A's near the octave
  above" in Toward Morning is mostly its colour: the recorded A3 has its fundamental 18 dB under its second
  harmonic (Iowa ff, H1/H2/H3 −18/0/−21 dB), the model 14 dB (−14/0/−6). A peak-picking pitch reader takes it for
  A4; every harmonic is there. In that piece 1 of 269 bassoon notes is on another mode (`improve/winds-midi`'s count).
* **(11) The bow's lift.** Some note-offs on the cello and bass step 2.0–2.6× the signal's own steps, at
  −29…−56 dBFS. The bow's force and speed move once per 64-sample control block, about 15 % of the way at a lift.
  It is inaudible. Ramping them per sample re-rolls the bowed strings' chaotic per-note regimes (the judge's attack
  and noise measures), for no audible gain.
* **(12) The trumpet's own limiter at ff.** −3.4…−4.3 dB on its loudest notes, 46 % of the ff walk's blocks: the
  trumpet is calibrated hot (its unlimited ff peaks reach about +2.4 dBFS) and is the level the brass balance
  above is set against. Taking 3–4 dB off a solo instrument is a decision about the app's loudness, not a defect.
  In the Orchestra its limiter now sees the bus level and is idle.
* **(13) The viola's A♯4** (B1+ at 465 Hz) stands 8 dB over A4 and B4 (dry, ff), where the recording is flat.
  Damping B1+ flattens it, but fits the fit half worse (4.43 against 4.28) and the judge cannot see it.
* **(14) The trombone's slurred run.** One jump of 2.1–2.3× at a legato note-on, the same before and after: legato
  handling is `improve/winds-midi`'s.
* **The violin's top notes** (m92–96) carry −14…−29 dB of energy between their harmonics: the friction model's
  regimes, the same before and after. **The cello's F5** read −5 dB "aliased" at 44.1 kHz: its second harmonic
  under vibrato (−42 dB with or without it held still, like its neighbours).
* **CPU.** No denormal slowdown. Beethoven 5 I, 18 parts, 35.7 % of real time offline (Node, one core).
  * The bowed strings, clarinet, bassoon and trombone never go fully idle: a residual at −138…−153 dBFS, below
    24-bit. Their cost goes on through rests, about 1.5–3 % of real time a part. Skipping silent blocks is a
    performance change for another round.
  * Phone buffers: the cores render their own blocks, so a host's buffer size changes nothing (block-size test,
    and the flute wrapper's at 128/37).
  * Safari 14.1: the build's worklet syntax check passes.

## The Orchestra (`render-orchestra.ts`, as the browser plays it)

| Lineup | bus | Mix peak (dBFS) | Mix RMS | Parts at their own limiter |
|---|---|---|---|---|
| Beethoven 5 I (45 s, 18 parts) | 0.236 → 0.213 | −6.1 → −7.3 | −24.8 → −26.3 | flute, cello → none |
| Beethoven 5 II (45 s) | 0.236 → 0.213 | −9.8 → −11.1 | −28.4 → −31.0 | violin, viola → none |
| Air (four trombones) | 0.500 → 0.177 | −2.4 → −2.4 | −20.3 → −20.3 | trombone → none |
| Haydn (quartet) | 0.500 | −6.0 → −8.7 | −23.5 → −26.2 | none |
| Bach (Brandenburg 5) | 0.408 | −5.1 → −8.5 | −23.0 → −24.6 | 2 violins → none |
| Handel (trumpet, piano) | 0.707 | −0.3 → +0.1 | −19.1 → −18.9 | trumpet → none (the bus limiter takes the peak, as before) |
| Quintet stimulus | 0.447 | −3.5 → −3.7 | −20.1 → −19.9 | none |
| Orchestra stimulus (12 parts) | 0.289 → 0.250 | −3.7 → −3.0 | −20.8 → −21.4 | cello → none |
| Toward Morning (90 s, 13 parts) | 0.277 → 0.204 | −7.9 → −8.6 | −25.1 → −27.2 | none |

In Toward Morning, each part's RMS at the bus: trombone −43.3 → −37.0 dBFS and timpani −47.9 → −43.6, beside the
trumpet (−39.2) and horn (−37.9). The others are 2.7 dB under, the bus making room (flute −31.7 → −34.4, cello
−39.6 → −42.8). In Beethoven 5 I the violins are 3–4 dB under: the body refit removed their booming notes, which
the piece plays often. The timpani are +6 dB. Mixes with violins are 1.5–3 dB quieter for the same reason (Haydn
−2.7 dB). Toward Morning is Fable's original and is not in the repository: its renders are in `.audit2/out` only.

## Golden and judge

* Golden: **violin re-blessed** (its passage's tail and body: the A0/B1− refit and the finger staying down). Cello
  and bass within tolerance. Every other instrument unchanged; trombone and timpani untouched (their gain is
  played only).
* Judge (held-out, against `d59362f`): violin NO CLEAR CHANGE (2.98 → 3.03), viola NO CLEAR CHANGE (4.56 → 4.58),
  cello NO CLEAR CHANGE (1.85 → 1.85), bass NO CLEAR CHANGE (1.89 → 1.89). Trumpet, trombone, timpani and flute
  are identical. No guard broken.
* New tests: `packages/engine/test/audit2.test.ts` (the limiter at the bus's level, no subnormals out, the playback
  gains, the violin's C♯4, the bowed tails, the trumpet's soft onset), `apps/web/test/mix.test.ts` (the bus law, the
  Air unchanged), and in `flute-rates.test.ts` the flute's top register at 22.05 kHz and its wrapper bit-identical
  across block sizes.

## Reproduce

```sh
git archive d59362f packages/engine apps/web/src/orchestra apps/web/src/midi-file.ts apps/web/public/pieces | tar -x -C .cache/before-engine
npx tsx scripts/audio-audit.ts --out .cache/a2/after48 [--engine .cache/before-engine/packages/engine/src/core/index.ts] [--fs 44100]
npx tsx scripts/audio-levels.ts
npx tsx scripts/fit-bodies.ts violin --levels 6 --keep-speed --keep-hf --iters 4 --mode 0:0.08:0.3 --mode 2:0.045
npx tsx scripts/fit-bodies.ts viola --levels 6 --keep-speed --keep-hf --iters 4 --mode 0:0.08:0.3
npx tsx scripts/judge.ts --instrument violin --before .cache/before-engine/packages/engine/src/core/index.ts   # viola, cello, bass, trumpet, trombone, timpani, flute
npx tsx scripts/render-audio-audit-2.ts --before .cache/before-engine/packages/engine/src/core/index.ts
npx tsx scripts/render-orchestra.ts --piece beethoven5-i --seconds 45 --json --wav --out <dir>   # -ii, air, haydn, bach, handel; the stimuli with --cap 24
```

`summary.json`: per instrument and rate, events over 2×, the worst jump, clicks, the limiter's deepest cut and
the walks' loudness, before and after. `clips.json`: each clip's number, before and after.
