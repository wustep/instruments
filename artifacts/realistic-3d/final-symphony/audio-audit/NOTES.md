# Audio audit: every instrument and the Orchestra, measured

Brief: `.autopilot/briefs/AUDIO-AUDIT.md`. Branch `improve/audio-audit` from `af894f5` (#48). Everything below
was measured first on the untouched engine (`before`, af894f5) and again on this branch (`after`), with the
same stimuli and the same scripts. Nothing was tuned by ear.

## How it was measured

`scripts/audio-audit.ts` renders the same stimuli through all 13 instruments (the piano as grand and upright),
with the room and the limiter on (as played), at 48 kHz:

* range walks at pp / mf / ff (velocity 28 / 72 / 118), every second note (every third on the piano);
* a fast legato run (notes overlapping by 20 ms) at mf and ff, then the same detached at 10 notes/s;
* repeated notes at alternating dynamics (104 / 84) in the middle, low and high;
* the lowest and highest notes held, pp and ff;
* chords: on the piano three ten-note clusters with the pedal down, then a run of 72 keys 30 ms apart (more
  notes than voices; also run with 32 and 48 voices, as the Orchestra gives one or two pianos); four strings
  then a fifth on the bowed strings; four drums and a roll on the timpani; a three-note chord asked of a wind;
* swells on a held note as a file sends them: CC11 in single steps every 20 ms, then CC_DYNAMICS in steps;
* a high note at 22.05 / 44.1 / 48 / 96 kHz for aliases (folded harmonics) and inharmonic energy.

Per stimulus: peak, BS.1770 integrated loudness (LUFS), the core limiter's deepest cut and how often it works,
**clicks** (a 1 ms burst in the high band, a 4th-order high-pass at 6 kHz, standing ≥ 10 dB above the 98th
percentile of the ±60 ms around it: a bowed string's slip or the lips' closing is a pulse every period, so the
floor is the pulses' own level down to a 36 ms period), **one-sample jumps** at events (the largest
|x[i] − x[i−1]| within −0.2…+0.3 ms of a note or controller event, over the 99th percentile of the steps in the
50 ms either side; an instrument's attack reaches the output through its bore, string or felt over milliseconds,
so a ratio above 2 is something the model switched in one sample), non-finite samples, DC left at the end, and
each 128-frame block's cost.

Other tools: `audio-zipper.ts` (lines at k·fs/64 from per-block control steps), `audio-levels.ts` (each Orchestra
voice's loudness at its own centre ±7 semitones, held, pp/mf/ff), `audio-limiter.ts` (what the limiter does note
by note), `audio-cpu.ts` (a strike's block cost, two passes), `audio-orch-stimuli.ts` (original quintet and
orchestra MIDI stimuli), `render-orchestra.ts` (the presets as the browser plays them), `audio-plot.py` and
`audio-audit-figures.py` (plots), `render-audio-audit.ts` (the clips here).

## Defects fixed

| # | Where | Stimulus | Before | After |
|---|---|---|---|---|
| 1 | **Flute**: a click at every note-on over a sounding tail, at every mod-wheel / expression step, and steps every 64 samples through each attack | walk mf, notes a tone apart; low note repeated ff/f; CC1 flicked | one-sample jump **14.7×** the tone's own steepest step (walk mf), 10.1× (ff), 5.4× (CC11 step: a +0.13 spike), 53× at 96 kHz; 22 events over 2× across the stimuli, 17 high-band clicks | **≤ 1.27×** everywhere; 0 events over 2×; 3 high-band hits left, all the modelled tongue push 3–5 ms after the onset |
| 2 | **Trombone**: a click when a note is re-tongued at another dynamic (or a leap) while the last one sounds | 72 and 53 repeated, 104/84 | **4.62×**; 6 events over 2×; 10 high-band clicks at note-ons | **1.25×**; 0; 1 |
| 3 | **Bassoon**: the same, at a leap of two octaves over the last note's tail | 39 ×4 then 71 ×4 | **2.74×** (1 event), 2 clicks | **1.06×**, 0 |
| 4 | **Timpani**: a drum retuned while it rings stopped dead in one sample | a run that needs drums retuned (ff); a pp walk; chords | **12.2×** (passage: 19 events over 2×, 7 clicks), 10.6× (pp walk), 4.35× (chords) | **1.39×**, 0 events, 0 clicks; 0.88×; 1.23× |
| 5 | **Flute at 96 kHz** out of tune (and at 22.05 kHz below the top) | 37 notes × pp/ff, pitch | 96 kHz: up to **+33 cents** (C4 +32, G4 +22); 22.05 kHz: in-tune notes up to 21 c | 96 kHz: worst **8 c** (as 44.1/48 kHz: 9/8 c); 22.05 kHz: 14 c |

Loudness of every stimulus is unchanged within 0.14 dB (flute walk mf −14.04 → −13.90 LUFS, timpani passage
−26.71 → −26.68): nothing was made quieter or duller. Close-ups: `clicks-closeup.png`. Clips (as played, room on):
`flute-attacks`, `flute-repeat`, `flute-mod-wheel`, `flute-96k-scale`, `trombone-retongue`, `bassoon-leap`,
`timpani-retune`, each `-before` / `-after` `.mp3` with a spectrogram `.png` (0–16 kHz).

### 1. The flute's block-rate drive into a differentiated flow (`flute.ts`)

The flute radiates the time derivative of its jet flow q (Rayleigh: two small monopoles), and q was computed
from values read once per 64-sample block: the jet's drive (breath × envelope × vibrato × expression), its
small-signal gain (the attack boost) and the edge offset (per note). Any step in them stepped q, and dq/dt made
it a one-sample spike: at a note-on over the last note's tail (the first plot: −0.018 against a 0.003 tone),
then smaller ones exactly 64 samples apart through the attack, and at a controller step. Each block now ramps
those four values sample by sample from where the last block left them. The physics is unchanged: the values at
each block's end are the same; only the stair between them is gone. A ramp, not a fade: no level is touched.

### 2–3. Brightness corners switched under a sounding tone (`trombone.ts`, `bassoon.ts`)

The output's low-pass corner follows the note and the dynamic (louder: brighter). It was written into the
filter's coefficients in one step when a note began, so a re-tongued note at another velocity, or a leap, changed
a biquad's coefficients under the last note's ringing tail. Confirmed by experiment: the same 12 repeated
trombone notes at one velocity give 0 clicks, at alternating velocities 9. The corner now glides in octaves with
a 10 ms time constant (`LP_GLIDE`: within the attack, slower than a click); a note from silence takes its corner
at once, so every isolated note (all the judge and the recordings see) is bit-identical. The oboe, clarinet and
horn share the pattern but measure 1.1–1.35×: left as they are.

### 4. The timpani's retune (`timpani.ts`)

A stroke that needs a drum at another pitch cleared that drum's modes at once ("the player has stopped it
first"): the waveform fell from +0.088 to +0.025 in one sample. A hand stops a head over milliseconds. Each drum
now has a spare head, allocated with the set (nothing allocated in the audio path): a ringing drum's head is
swapped to the spare and rings out under the fingers' damping (`STOP` = 100/s: −60 dB in 70 ms) while the drum,
retuned, is struck. Isolated strokes are unchanged.

### 5. The flute's voicing table at 22.05 and 96 kHz (`flute-tuning.json`, `scripts/tune-flute.ts`)

The table had rows for 44.1 and 48 kHz only; another rate took the nearest. `tune-flute.ts --fs 22050,96000`
adds those rows and keeps every other row as it was; a note that does not converge keeps what it had, so tuning a
new rate cannot make a note worse. The 44.1 and 48 kHz rows are bit-identical.

### Checks on the fixes

* `scripts/judge.ts` against the recordings, held-out notes: **flute NO CLEAR CHANGE** (3.31 → 3.30; attack
  1.45 → 1.42), **bassoon NO CLEAR CHANGE** (identical), **trombone NO CLEAR CHANGE** (identical),
  **timpani NO CLEAR CHANGE** (identical, VSCO 2 CE). No guard measure moved.
* Golden: re-blessed for flute, trombone and bassoon (the timpani's passage never retunes a ringing drum: unchanged).
  What moved is the removed transients' own energy: bassoon ⅓-octave bands at 63/100 Hz −9.0/−8.4 dB (2.82 dB
  RMS over the bands; every band of the notes themselves within 0.7 dB); trombone 10–16 kHz −0.4/−1.6/−4.2 dB
  (0.34 dB RMS); flute 63–200 Hz, below its compass, −0.4…−1.1 dB (0.08 dB RMS). Envelopes ≤ 0.30 dB. Tolerances
  unchanged.
* Block-size test unchanged (bit-identical at 128 / 37 / 500 frames per call).
* New tests: `packages/engine/test/clicks.test.ts` (flute, trombone, bassoon, timpani at 44.1 and 48 kHz: the
  worst jump < 1.8×; before 9.8/14.1×, 4.7/6.8×, 2.7/1.8×, 9.2/10.0×) and `flute-rates.test.ts` (C4 and G4 within
  5 c at 96 kHz, were +32/+22; 22.05 kHz below the top within 5 c, C4 was +14.5).

## Measured and left alone

| What | Measurement | Why left |
|---|---|---|
| **Trombone and timpani balance** (Orchestra) | Each voice at its centre (`levels.png`): trombone ff −23.1 LUFS against trumpet −11.1, horn −11.8, bassoon −14.1 (mf −32.9 vs −14.5); timpani ff −32.4; double bass in Beethoven 5 I 11 dB (RMS) under the cello on largely one line | Each core is fitted to its own recording session's level; `trombone.ts` documents that the Iowa trombones sit 9 dB under the Iowa horn's and trumpet's (microphone gain). Orchestral sound powers put the trombone above the woodwinds (Kahle 1995, Table 1, after J. Meyer, Acustica 71, 1990: trombone 101 dB, bassoon and clarinet 93, cello 90, timpani 100 re 1 pW). A +9 dB playback-only gain was tried (fb3edfc) and **reverted** (ecafe40): the bundled Air (four trombones) then had each part on its own limiter (RMS up 4.4–7.4 of the 9 dB) and the mix at **+2.2 dBFS** (was −2.4), past the browser's −2 dBFS bus limiter by 4 dB. With 0.4 dB of headroom in that piece no core gain is conservative; a balance belongs to a lineup-aware mix, a decision for the Orchestra, not a fix. |
| **Violin C4/C#4 hot** | dry, ff: C#4 +7 dBFS RMS, 15–18 dB over its neighbours, rising 22 dB through the note while the string's own level stays flat; the limiter takes 12–14 dB off it (ff), 0.7 dB at mf; same at every rate | The fitted body (`bowed-fit.json`) has a +12 dB band at 283 Hz under the A0 air mode (275 Hz, Q 25). The Iowa violin has no C4/C#4 to judge it against, and the recorded cello shows the same effect at its own A0 note (G#2 +6 to +10 dB over its neighbours). Refitting a judged body is a calibration change, not an audit fix. |
| Violin A#3 / A#4, cello F2 above their recordings | model vs Iowa (dry, ff): violin m58 and m70 ~9–11 dB over their neighbours where the recordings are flat; cello m41 −13.6 vs −24.5 dB | Narrow body modes (B1− at 465 Hz) on fit-half notes; same reason as above. |
| Trumpet pp onsets | 2.1–2.6× at 4 pp note-ons over a tail (−34…−39 dBFS steps); none at mf/ff | The output's brightness filters are re-set per block as the breath moves; small, quiet, and changing them alters the fitted attack brightness. |
| Bowed note-offs | violin 2.2×, cello 2.6×, bass 2.3× (−27…−56 dBFS steps), one event each | The bow's lift; at the edge of the measure. |
| Flute top register at 22.05 kHz | 9 of 74 notes (m85–m95) sound another mode, 5–7 semitones high, before and after | A period of ten samples: the model does not speak them there; the tuning does not converge (kept as it was). 22.05 kHz is a headset's rate, rare in practice. |
| Core limiters at ff | trumpet −3.6 dB (46 % of blocks, ff walk), violin −6.5 dB (C#4), piano chords −7.7 dB (72 keys ff, pedal down), cello −5.1, flute −3.3 | The safety limiter doing its job on the loudest material. No hard clipping anywhere: after the limiter no sample exceeds 0.89, so the soft clip above 0.95 never acts. |
| Piano voice stealing | 72 keys ff over 64 / 48 / 32 voices: worst jump 1.89×, no stealing click | Clean: the 12 ms steal fade holds. |
| Piano note-on high band | 17–21 detections in the pp/mf walks, 2 ms after the strike, −52…−64 dBFS | The modelled hammer knock (round 3, matched to the Iowa attacks). |
| Low brass / bowed pulses | trombone E1 ff: high-band bursts every 24 ms; cello/bass slips | The tones' own periodic pulses (lip closure, slip): physics, not clicks. The click floor was set to the pulses' level so they do not count. |
| Block-rate zipper | lines at k·fs/64 in held notes of every instrument, 44.1 and 48 kHz | None stand out (a few vibrato-smeared harmonics). |
| CPU spikes | grand piano: single blocks of 2.7–4.9 ms in a first pass over the keys | Not repeatable: the same keys struck alone take 0.33–0.73 ms and allocate nothing (JIT/GC in Node). Averages: grand 5–8 % of real time (23 % in the 72-key chord), bowed 2–3 %, winds 1.2–1.9 %, timpani 2–3 %; Beethoven 5 I–II, 18 parts, 28–33 % offline. |
| Aliasing | a high note ff and mf at 22.05/44.1/48/96 kHz, folded harmonics ≥ 10 dB over the local floor: at 44.1/48 kHz the piano, winds and brass none above −43 dB re the strongest harmonic (most −52…−108); the flute at 22.05 kHz is its wrong mode (above) | The bowed strings' energy between harmonics varies note to note from −12 to −52 dB at every rate (violin 76/81/88/98 at 44.1/48/96 kHz, vibrato off: no rate consistently worse): the friction model's regimes, which the judge's noise measure fits, not aliasing. With vibrato on, the measure also counts the smeared harmonics. |
| Non-finite samples, DC | 0 non-finite samples in every render; the last 200 ms of every render average at most −77 dBFS (a room tail's own low end) | — |

## The Orchestra

Rendered as the browser plays them (`render-orchestra.ts`: the plan's routes, players, seats, 1/√n bus):

| Lineup | Mix peak | Mix RMS | Parts at their own limiter |
|---|---|---|---|
| Beethoven 5 I (first 45 s, 18 parts) | −6.1 → −6.1 dBFS | −24.8 → −24.8 | flute, cello |
| Beethoven 5 II (first 45 s) | −9.8 → −9.8 | −28.4 → −28.4 | violin, viola |
| Air (four trombones) | −2.4 → −2.4 | −20.5 → −20.5 | trombone |
| Quintet stimulus (vn vn va vc cb, as the Daylight preset routes it: chords, double stops, sixteenths, extremes ff) | −2.0 → −2.0 | −20.3 → −20.3 | violin |
| Orchestra stimulus (strings, winds, timpani; the same four sections) | −0.9 → −0.9 | −20.0 → −20.0 | violins, viola, cello |

The mixes are unchanged within 0.05 dB (only the flute and bassoon parts moved, ≤ 0.3 dB of peak, where clicks
were removed). The dense ff orchestra stimulus reaches the browser's −2 dBFS bus limiter by 1.1 dB, as designed.
The Daylight MIDI itself is copyrighted and not in the repository; `audio-orch-stimuli.ts` writes an original
quintet with the same track names and programs, which routes to the same five instruments.

## Reproduce

```sh
git archive af894f5 packages/engine apps/web/src/orchestra apps/web/src/midi-file.ts apps/web/public/pieces | tar -x -C .cache/before-engine
npx tsx scripts/audio-audit.ts --engine .cache/before-engine/packages/engine/src/core/index.ts --out .cache/audio-audit/before --wav .cache/audio-audit/before/wav
npx tsx scripts/audio-audit.ts --out .cache/audio-audit/after --wav .cache/audio-audit/after/wav
npx tsx scripts/audio-levels.ts --json levels.json
npx tsx scripts/audio-orch-stimuli.ts .cache/audio-audit/stimuli
npx tsx scripts/render-orchestra.ts --piece beethoven5-i --seconds 45 --json --wav --out <dir>   # and -ii, air, the stimuli (--cap 24)
npx tsx scripts/judge.ts --instrument flute --before .cache/before-engine/packages/engine/src/core/index.ts   # bassoon, trombone, timpani
npx tsx scripts/render-audio-audit.ts --before .cache/before-engine/packages/engine/src/core/index.ts
python3 scripts/audio-audit-figures.py .cache/audio-audit/clips levels.json artifacts/realistic-3d/final-symphony/audio-audit
```

`summary.json`: per instrument, events over 2×, the worst jump, clicks, the limiter's deepest cut, the mf walk's
loudness and the busiest stimulus's cost, before and after.
