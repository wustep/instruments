# Volute

An instrument that does not exist, added as the seventh on the stage. One key (C2–C6) bows a
string on a rosined band, opens a flue pipe and throws a mallet at an aluminium bar. All three end
on one spruce hub with twelve sympathetic strings. Engine: `packages/engine/src/core/volute.ts`.

There is no "before" and no recording to judge against. Every number here is measured on the model.

## Listen

* `demo.mp3` (30 s, an original piece; `demo.png` is its spectrogram, 0–8 kHz): the strings alone,
  soft; the weave turns to the middle and the bars carry a tune; the pipes alone; then everything,
  and the halo left ringing.
* `choir-strings.mp3`, `choir-pipes.mp3`, `choir-bars.mp3`, `choir-all.mp3`: the same rolled chord
  (C3 G3 C4 E4 G4, velocity 84, no room) on each choir alone and on all three.

Made by `npx tsx scripts/render-volute.ts`; its output is `numbers.txt`.

## Numbers

| What | Value |
|---|---|
| Tuning, strings (49 notes, mf) | residual max 0.9 ¢ at 44.1 kHz, 2.0 ¢ at 48 kHz, 3.4 ¢ at 96 kHz, 5.6 ¢ at 22.05 kHz (RMS 0.3–1.1 ¢); corrections applied 0–9 ¢ |
| Tuning, pipes (37 notes, mf) | within 0.04 ¢ of the céleste target at 44.1, 48 and 96 kHz, 1.5 ¢ at 22.05 kHz; corrections applied 16–71 ¢ |
| Céleste (pipes above strings) | 0.35 Hz at C3 to 1.1 Hz at C6 (4.6 ¢ to 1.8 ¢) |
| Pipe rank, level at mf | −44.4 … −27.9 dB before regulation, −29.5 … −29.4 dB after (the strings' mean: −29.5 dB) |
| One chord, each choir alone (held, dry) | strings −19.9 dB, pipes −20.3 dB, all three −17.0 dB |
| Bars, first 150 ms of a blow against the held chord | −26.8 dB (bars alone) |
| Halo, 0.5 s after the keys (dry) | −32.4 dB with it, −79 dB and below without |
| Onset to −6 dB of the held level, pipes at mf (before regulation; one run) | about 180 ms at C3, 130 ms at C4, 70 ms at C5, 40 ms at C6 |
| Onset to −6 dB, strings at mf (one run) | about 130 ms at C2, 60 ms at C4, 50 ms at C6 |
| Fortissimo six-key chord (velocity 127), peak before the room | 0.92 of full scale (0.83 after the room and limiter) |
| Engine cost (Node, this machine) | demo 2.7 % of real time with the room; ten voices dry under 1 % |
| Block size | bit-identical at 128, 37 and 500 frames per call (`blocksize.test.ts`) |

Tuning and regulation come from `npx tsx scripts/tune-volute.ts`, which writes
`packages/engine/src/core/volute-tuning.json`.

## What is not measured or not done

* Nobody has listened to it on speakers in this session: the voicing was set from levels, spectra
  and onset times, not by ear.
* The pipes' length corrections are large (16–71 ¢). The small-signal phase condition that sets the
  bore length is far off for the low pipes, whose jet gain is raised so they speak in time. The
  measured table hides this; the pitch is right, the derivation is not.
* The lowest pipes still take 180 ms (mf) to 380 ms (pp) to speak.
* The demo's last chord reaches the limiter's threshold (peak 0.89).
* Pitch bend does nothing on the volute.
* The hand on the stage (drag: weave and swell) is 2D only; in 3D a drag turns the camera.
* Audio load on a real phone was not measured.
* The 22.05 and 96 kHz rates are tuned by the same script but only 44.1 and 48 kHz are in the unit
  tests.

## Pictures

`shots/` from `node scripts/shots-volute.mjs` (2D and 3D, at rest and sounding, phone, the picker,
an ensemble with flute, violin and cello).
